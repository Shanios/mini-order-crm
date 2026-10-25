import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminApiService } from '../shopify/shopify-admin-api.service';
import { ShopifyConfigService } from '../shopify/shopify-config.service';
import { ShopifyOrderImportService } from '../shopify/shopify-order-import.service';

const SUPPORTED_TOPICS = new Set(['orders/create', 'orders/updated']);
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface ShopifyWebhookDelivery {
  rawBody: Buffer;
  signature?: string;
  shopDomain?: string;
  topic?: string;
  deliveryId?: string;
  eventId: string | null;
}

@Injectable()
export class ShopifyWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ShopifyConfigService,
    private readonly adminApi: ShopifyAdminApiService,
    private readonly importer: ShopifyOrderImportService,
  ) {}

  async accept(delivery: ShopifyWebhookDelivery): Promise<{ received: true; duplicate?: true }> {
    const { signature, shopDomain, topic, deliveryId } = delivery;
    if (!signature || !shopDomain || !topic || !deliveryId) {
      throw new BadRequestException('Required Shopify webhook headers are missing.');
    }
    const credentials = this.config.getCredentials();
    if (!verifyHmac(delivery.rawBody, signature, credentials.clientSecret)) {
      throw new UnauthorizedException('Invalid Shopify webhook signature.');
    }
    if (shopDomain.toLowerCase() !== credentials.shopDomain) {
      throw new ForbiddenException('Webhook shop does not match the configured shop.');
    }
    if (!SUPPORTED_TOPICS.has(topic)) {
      throw new BadRequestException('Unsupported Shopify webhook topic.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(delivery.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Webhook body must contain valid JSON.');
    }
    const resourceId = getOrderId(payload);

    let shop;
    try {
      shop = await this.prisma.shopConnection.upsert({
        where: { shopDomain: credentials.shopDomain },
        create: { shopDomain: credentials.shopDomain },
        update: {},
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Webhook could not be recorded.' });
    }

    const duplicate = await this.claimDelivery({
      shopId: shop.id,
      deliveryId,
      eventId: delivery.eventId,
      topic,
      resourceId,
    });
    return duplicate ? { received: true, duplicate: true } : { received: true };
  }

  /** Claims and processes one durable queue row. Safe to call from multiple app instances. */
  async processNext(): Promise<boolean> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
    let candidate;
    try {
      candidate = await this.prisma.webhookEvent.findFirst({
        where: {
          OR: [
            { status: 'queued', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
            { status: 'processing', lockedAt: { lt: staleBefore } },
          ],
        },
        orderBy: { receivedAt: 'asc' },
        select: { id: true, status: true },
      });
    } catch {
      return false;
    }
    if (!candidate) return false;

    let claim;
    try {
      claim = await this.prisma.webhookEvent.updateMany({
        where: candidate.status === 'queued'
          ? { id: candidate.id, status: 'queued', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }
          : { id: candidate.id, status: 'processing', lockedAt: { lt: staleBefore } },
        data: { status: 'processing', lockedAt: now },
      });
    } catch {
      return false;
    }
    if (claim.count !== 1) return true;

    let event;
    try {
      event = await this.prisma.webhookEvent.findUnique({
        where: { id: candidate.id },
        select: { id: true, shopId: true, resourceId: true, attemptCount: true },
      });
    } catch {
      return false;
    }
    if (!event) return false;

    try {
      if (!event.resourceId || !/^\d+$/.test(event.resourceId)) {
        throw Object.assign(new Error('Invalid queued order reference.'), { code: 'WEBHOOK_ORDER_ID_INVALID' });
      }
      const order = await this.adminApi.getOrder(`gid://shopify/Order/${event.resourceId}`);
      if (!order) throw Object.assign(new Error('Shopify order is unavailable.'), { code: 'SHOPIFY_ORDER_UNAVAILABLE' });
      await this.importer.importOrder(event.shopId, order);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date(), lockedAt: null, nextAttemptAt: null, errorMessage: null },
      });
    } catch (error) {
      const attemptCount = event.attemptCount + 1;
      const failed = attemptCount >= MAX_ATTEMPTS;
      try {
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: failed ? 'failed' : 'queued',
            attemptCount,
            lockedAt: null,
            nextAttemptAt: failed ? null : new Date(Date.now() + retryDelayMs(attemptCount)),
            processedAt: null,
            errorMessage: safeFailureCode(error),
          },
        });
      } catch {
        // The locked row is recoverable after the stale-processing interval.
      }
    }
    return true;
  }

  private async claimDelivery(input: {
    shopId: string;
    deliveryId: string;
    eventId: string | null;
    topic: string;
    resourceId: string;
  }): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { ...input, status: 'queued', nextAttemptAt: new Date() },
      });
      return false;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Webhook could not be recorded.' });
      }
    }

    let existing;
    try {
      existing = await this.prisma.webhookEvent.findUnique({
        where: { shopId_deliveryId: { shopId: input.shopId, deliveryId: input.deliveryId } },
        select: { id: true, status: true },
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Webhook status could not be retrieved.' });
    }
    if (!existing) throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Webhook status could not be retrieved.' });
    if (existing.status !== 'failed') return true;

    try {
      const retried = await this.prisma.webhookEvent.updateMany({
        where: { id: existing.id, status: 'failed' },
        data: {
          status: 'queued',
          resourceId: input.resourceId,
          eventId: input.eventId,
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lockedAt: null,
          processedAt: null,
          errorMessage: null,
        },
      });
      return retried.count === 0;
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Webhook retry could not be recorded.' });
    }
  }
}

function verifyHmac(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getOrderId(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('id' in payload)) {
    throw new BadRequestException('Webhook body does not contain an order ID.');
  }
  const id = (payload as { id: unknown }).id;
  if (!(typeof id === 'string' && /^\d+$/.test(id)) && !(typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    throw new BadRequestException('Webhook body contains an invalid order ID.');
  }
  return String(id);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === 'P2002'
    : Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002');
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 1000 * (2 ** Math.max(0, attempt - 1)));
}

function safeFailureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'getResponse' in error) {
    const response = (error as { getResponse: () => unknown }).getResponse();
    if (response && typeof response === 'object' && 'code' in response
      && typeof (response as { code: unknown }).code === 'string') {
      return String((response as { code: string }).code).slice(0, 100);
    }
  }
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return String((error as { code: string }).code).slice(0, 100);
  }
  return 'PROCESSING_FAILED';
}
