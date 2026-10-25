import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminApiService } from '../shopify/shopify-admin-api.service';
import { ShopifyIntegrationException } from '../shopify/shopify.errors';
import { ShopifyOrderImportService } from '../shopify/shopify-order-import.service';

const MAX_ORDER_LINES = 100;
const MAX_QUANTITY = 1_000;

interface NormalizedOrderRequest {
  items: Array<{ variantId: string; quantity: number }>;
  customerId?: string;
  note?: string;
}

@Injectable()
export class OrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminApi: ShopifyAdminApiService,
    private readonly importer: ShopifyOrderImportService,
  ) {}

  async create(raw: unknown, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Provide an Idempotency-Key header containing 16 to 128 letters, digits, dots, underscores, colons, or hyphens.',
      });
    }
    const request = normalizeRequest(raw);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const shop = await this.getShop();

    const existing = await this.findRequest(shop.id, idempotencyKey);
    if (existing) return this.resolveExisting(existing, requestHash);

    const variantIds = new Set(request.items.map(({ variantId }) => variantId));
    const available = await this.adminApi.validateOrderVariants([...variantIds]);
    if (available.size !== variantIds.size) {
      throw new BadRequestException({
        code: 'SHOPIFY_VARIANT_UNAVAILABLE',
        message: 'One or more selected product variants are missing, inactive, or unavailable for sale.',
      });
    }
    if (request.customerId && !(await this.adminApi.customerExists(request.customerId))) {
      throw new BadRequestException({ code: 'SHOPIFY_CUSTOMER_UNAVAILABLE', message: 'The selected Shopify customer is unavailable.' });
    }

    const reservation = await this.reserve(shop.id, idempotencyKey, requestHash);
    if (!reservation.created) return this.resolveExisting(reservation.row, requestHash);

    let outcome;
    try {
      outcome = await this.adminApi.createOrder({
        lineItems: request.items,
        ...(request.customerId ? { customerId: request.customerId } : {}),
        ...(request.note ? { note: request.note } : {}),
      });
    } catch (error) {
      if (isUncertainShopifyOutcome(error)) {
        await this.setStatus(reservation.row.id, 'uncertain', safeCode(error));
        throw new ShopifyIntegrationException(
          503,
          'ORDER_CREATION_OUTCOME_UNKNOWN',
          'Shopify may have received this order request. Reuse the same idempotency key to check its status; do not submit a new key yet.',
        );
      }
      await this.setStatus(reservation.row.id, 'rejected', safeCode(error));
      throw error;
    }

    if (!outcome.orderId) {
      if (outcome.userErrors.length) {
        await this.setStatus(reservation.row.id, 'rejected', 'SHOPIFY_ORDER_REJECTED');
        throw new BadRequestException({
          code: 'SHOPIFY_ORDER_REJECTED',
          message: 'Shopify rejected the order.',
          details: outcome.userErrors.map(({ field, message }) => ({ field, message })),
        });
      }
      await this.setStatus(reservation.row.id, 'uncertain', 'SHOPIFY_ORDER_RESPONSE_INVALID');
      throw new ShopifyIntegrationException(503, 'ORDER_CREATION_OUTCOME_UNKNOWN', 'Shopify did not confirm the order result. Reuse the same idempotency key to check its status.');
    }

    if (!/^gid:\/\/shopify\/Order\/\d+$/.test(outcome.orderId)) {
      await this.setStatus(reservation.row.id, 'uncertain', 'SHOPIFY_ORDER_RESPONSE_INVALID');
      throw new ShopifyIntegrationException(503, 'ORDER_CREATION_OUTCOME_UNKNOWN', 'Shopify returned an invalid order reference. Reuse the same idempotency key to check its status.');
    }
    try {
      await this.prisma.orderCreationRequest.update({
        where: { id: reservation.row.id },
        data: { status: 'sync_pending', shopifyOrderId: outcome.orderId, errorCode: null },
      });
    } catch {
      // The reservation stays in progress and blocks a second mutation for this key.
      throw new ServiceUnavailableException({ code: 'ORDER_CREATED_SYNC_PENDING', message: 'Shopify created the order, but the local sync status could not be saved.' });
    }

    return this.synchronize(reservation.row.id, shop.id, outcome.orderId);
  }

  async status(idempotencyKey: string) {
    const shop = await this.getShop();
    const row = await this.findRequest(shop.id, idempotencyKey);
    if (!row) throw new BadRequestException({ code: 'ORDER_REQUEST_NOT_FOUND', message: 'No order request was found for that idempotency key.' });
    return {
      data: {
        status: row.status,
        orderId: row.orderId,
        shopifyOrderId: row.shopifyOrderId,
        errorCode: row.errorCode,
      },
    };
  }

  private async resolveExisting(row: OrderCreationRow, requestHash: string) {
    if (row.requestHash !== requestHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'This idempotency key was already used with a different order request.' });
    }
    if (row.status === 'completed' && row.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: row.orderId }, include: { customer: true, items: { orderBy: { id: 'asc' } } },
      });
      if (order) return { data: order };
      throw new ServiceUnavailableException({ code: 'ORDER_SYNC_INCOMPLETE', message: 'The order record is not currently available.' });
    }
    if (row.status === 'sync_pending' && row.shopifyOrderId) return this.synchronize(row.id, row.shopId, row.shopifyOrderId);
    if (row.status === 'uncertain' || row.status === 'creating') {
      throw new ConflictException({ code: 'ORDER_CREATION_OUTCOME_UNKNOWN', message: 'This request may already have created an order. Check its status before using a new idempotency key.' });
    }
    throw new ConflictException({
      code: row.errorCode ?? 'ORDER_REQUEST_REJECTED',
      message: 'This idempotency key already has a confirmed failed request. Correct the request and use a new key.',
    });
  }

  private async synchronize(requestId: string, shopId: string, shopifyOrderId: string) {
    try {
      const remote = await this.adminApi.getOrder(shopifyOrderId);
      if (!remote) throw new ShopifyIntegrationException(502, 'SHOPIFY_ORDER_UNAVAILABLE', 'Shopify did not return the created order.');
      await this.importer.importOrder(shopId, remote);
      const order = await this.prisma.order.findUnique({
        where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
        include: { customer: true, items: { orderBy: { id: 'asc' } } },
      });
      if (!order) throw new Error('ORDER_IMPORT_NOT_VISIBLE');
      await this.prisma.orderCreationRequest.update({
        where: { id: requestId },
        data: { status: 'completed', orderId: order.id, errorCode: null },
      });
      return { data: order };
    } catch (error) {
      await this.setStatus(requestId, 'sync_pending', safeCode(error));
      throw new ServiceUnavailableException({
        code: 'ORDER_CREATED_SYNC_PENDING',
        message: 'Shopify created the order, but syncing it into the CRM is still pending. Retry with the same idempotency key.',
      });
    }
  }

  private async getShop() {
    try {
      return await this.prisma.shopConnection.upsert({
        where: { shopDomain: this.adminApi.shopDomain },
        create: { shopDomain: this.adminApi.shopDomain },
        update: {},
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'The order request could not be recorded.' });
    }
  }

  private async findRequest(shopId: string, idempotencyKey: string): Promise<OrderCreationRow | null> {
    try {
      return await this.prisma.orderCreationRequest.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'The order request status could not be read.' });
    }
  }

  private async reserve(shopId: string, idempotencyKey: string, requestHash: string): Promise<{ created: true; row: OrderCreationRow } | { created: false; row: OrderCreationRow }> {
    try {
      const row = await this.prisma.orderCreationRequest.create({
        data: { shopId, idempotencyKey, requestHash, status: 'creating' },
      });
      return { created: true, row };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const row = await this.findRequest(shopId, idempotencyKey);
        if (row) return { created: false, row };
      }
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'The order request could not be reserved.' });
    }
  }

  private async setStatus(id: string, status: string, errorCode: string | null) {
    try {
      await this.prisma.orderCreationRequest.update({ where: { id }, data: { status, errorCode } });
    } catch {
      // Retaining the original reservation is safer than allowing a second creation attempt.
    }
  }
}

interface OrderCreationRow {
  id: string;
  shopId: string;
  requestHash: string;
  status: string;
  shopifyOrderId: string | null;
  orderId: string | null;
  errorCode: string | null;
}

function normalizeRequest(raw: unknown): NormalizedOrderRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalidRequest();
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['customerId', 'items', 'note'].includes(key))) invalidRequest();
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ORDER_LINES) invalidRequest();

  const items = body.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalidRequest();
    const line = item as Record<string, unknown>;
    if (Object.keys(line).some((key) => !['variantId', 'quantity'].includes(key))) invalidRequest();
    if (typeof line.variantId !== 'string' || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(line.variantId)) invalidRequest();
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) invalidRequest();
    return { variantId: line.variantId, quantity: line.quantity };
  });
  if (new Set(items.map((item) => item.variantId)).size !== items.length) {
    throw new BadRequestException({ code: 'DUPLICATE_VARIANT', message: 'Each Shopify variant must appear once; combine its quantity into a single line.' });
  }

  let customerId: string | undefined;
  if (body.customerId !== undefined) {
    if (typeof body.customerId !== 'string' || !/^gid:\/\/shopify\/Customer\/\d+$/.test(body.customerId)) invalidRequest();
    customerId = body.customerId;
  }
  let note: string | undefined;
  if (body.note !== undefined) {
    if (typeof body.note !== 'string' || body.note.length > 500) invalidRequest();
    note = body.note.trim() || undefined;
  }
  return { items, ...(customerId ? { customerId } : {}), ...(note ? { note } : {}) };
}

function invalidRequest(): never {
  throw new BadRequestException({
    code: 'INVALID_ORDER_REQUEST',
    message: 'Provide 1 to 100 Shopify variant IDs with integer quantities from 1 to 1000, an optional Shopify customer ID, and an optional note up to 500 characters.',
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === 'P2002'
    : Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002');
}

function isUncertainShopifyOutcome(error: unknown): boolean {
  return error instanceof ShopifyIntegrationException && safeCode(error) === 'SHOPIFY_ORDER_OUTCOME_UNKNOWN';
}

function safeCode(error: unknown): string {
  if (error && typeof error === 'object' && 'getResponse' in error) {
    const response = (error as { getResponse: () => unknown }).getResponse();
    if (response && typeof response === 'object' && 'code' in response && typeof response.code === 'string') {
      return response.code.slice(0, 100);
    }
  }
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code.slice(0, 100);
  return 'ORDER_CREATION_FAILED';
}
