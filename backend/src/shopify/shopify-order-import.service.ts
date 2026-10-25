import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyIntegrationException } from './shopify.errors';
import type { ShopifyLineItem, ShopifyOrder } from './shopify-admin-api.service';

export interface ImportCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

@Injectable()
export class ShopifyOrderImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importOrder(shopId: string, remote: ShopifyOrder): Promise<'inserted' | 'updated' | 'unchanged'> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.order.findUnique({
            where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: remote.id } },
            select: { id: true, shopifyUpdatedAt: true },
          });
          const remoteUpdatedAt = parseRemoteDate(remote.updatedAt, 'updatedAt');
          if (existing && existing.shopifyUpdatedAt > remoteUpdatedAt) return 'unchanged';

          const customer = remote.customer
            ? await upsertCustomer(tx, shopId, remote.customer)
            : null;
          const orderDate = parseRemoteDate(remote.createdAt, 'createdAt');
          const cancelledAt = remote.cancelledAt ? parseRemoteDate(remote.cancelledAt, 'cancelledAt') : null;
          const order = await tx.order.upsert({
            where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: remote.id } },
            create: {
              shopId,
              shopifyOrderId: remote.id,
              orderNumber: remote.name,
              customerId: customer?.id ?? null,
              customerName: remote.customer?.displayName ?? null,
              customerEmail: remote.customer?.defaultEmailAddress?.emailAddress ?? remote.email,
              financialStatus: remote.displayFinancialStatus,
              fulfillmentStatus: remote.displayFulfillmentStatus,
              totalAmount: new Prisma.Decimal(remote.totalPriceSet.shopMoney.amount),
              currencyCode: remote.totalPriceSet.shopMoney.currencyCode,
              orderDate,
              cancelledAt,
              shopifyUpdatedAt: remoteUpdatedAt,
              syncedAt: new Date(),
            },
            update: {
              orderNumber: remote.name,
              customerId: customer?.id ?? null,
              customerName: remote.customer?.displayName ?? null,
              customerEmail: remote.customer?.defaultEmailAddress?.emailAddress ?? remote.email,
              financialStatus: remote.displayFinancialStatus,
              fulfillmentStatus: remote.displayFulfillmentStatus,
              totalAmount: new Prisma.Decimal(remote.totalPriceSet.shopMoney.amount),
              currencyCode: remote.totalPriceSet.shopMoney.currencyCode,
              orderDate,
              cancelledAt,
              shopifyUpdatedAt: remoteUpdatedAt,
              syncedAt: new Date(),
            },
            select: { id: true },
          });

          const itemIds: string[] = [];
          for (const item of remote.lineItems) {
            itemIds.push(item.id);
            await upsertLineItem(tx, order.id, item);
          }
          await tx.orderItem.deleteMany({
            where: {
              orderId: order.id,
              ...(itemIds.length ? { shopifyLineItemId: { notIn: itemIds } } : {}),
            },
          });
          return existing ? 'updated' : 'inserted';
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < 2) continue;
        if (isPrismaError(error)) {
          throw new ServiceUnavailableException({
            code: 'DATABASE_UNAVAILABLE',
            message: 'Shopify orders could not be saved to the database.',
          });
        }
        throw error;
      }
    }
    throw new ShopifyIntegrationException(503, 'SHOPIFY_IMPORT_CONFLICT', 'The order changed during import. Retry the sync.');
  }
}

async function upsertCustomer(
  tx: Prisma.TransactionClient,
  shopId: string,
  remote: NonNullable<ShopifyOrder['customer']>,
): Promise<Pick<Customer, 'id'>> {
  const email = remote.defaultEmailAddress?.emailAddress ?? null;
  const values = {
    firstName: remote.firstName,
    lastName: remote.lastName,
    displayName: remote.displayName,
    email,
  };
  return tx.customer.upsert({
    where: { shopId_shopifyCustomerId: { shopId, shopifyCustomerId: remote.id } },
    create: { shopId, shopifyCustomerId: remote.id, ...values },
    update: values,
    select: { id: true },
  });
}

async function upsertLineItem(tx: Prisma.TransactionClient, orderId: string, item: ShopifyLineItem): Promise<void> {
  await tx.orderItem.upsert({
    where: { orderId_shopifyLineItemId: { orderId, shopifyLineItemId: item.id } },
    create: {
      orderId,
      shopifyLineItemId: item.id,
      shopifyProductId: item.product?.id ?? null,
      shopifyVariantId: item.variant?.id ?? null,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.originalUnitPriceSet.shopMoney.amount),
      totalPrice: new Prisma.Decimal(item.discountedTotalSet.shopMoney.amount),
    },
    update: {
      shopifyProductId: item.product?.id ?? null,
      shopifyVariantId: item.variant?.id ?? null,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.originalUnitPriceSet.shopMoney.amount),
      totalPrice: new Prisma.Decimal(item.discountedTotalSet.shopMoney.amount),
    },
  });
}

function parseRemoteDate(value: string, field: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new ShopifyIntegrationException(502, 'SHOPIFY_RESPONSE_INVALID', `Shopify returned an invalid ${field} value.`);
  }
  return result;
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2034' || error.code === 'P2002');
}

function isPrismaError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientUnknownRequestError
    || error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientRustPanicError;
}
