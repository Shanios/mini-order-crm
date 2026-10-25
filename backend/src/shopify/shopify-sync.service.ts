import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminApiService } from './shopify-admin-api.service';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyIntegrationException } from './shopify.errors';
import { ShopifyOrderImportService, type ImportCounts } from './shopify-order-import.service';

const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 60;

@Injectable()
export class ShopifySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ShopifyConfigService,
    private readonly adminApi: ShopifyAdminApiService,
    private readonly importer: ShopifyOrderImportService,
  ) {}

  async syncOrders() {
    const { shopDomain } = this.config.getCredentials();
    const scopes = await this.adminApi.getGrantedScopes();
    const missingScopes = ['read_orders', 'read_customers'].filter((scope) => !scopes.has(scope));
    if (scopes.size > 0 && missingScopes.length > 0) {
      throw new ShopifyIntegrationException(
        403,
        'SHOPIFY_PERMISSION_DENIED',
        `The app needs ${missingScopes.join(' and ')} permission${missingScopes.length > 1 ? 's' : ''} to import orders and customer details.`,
      );
    }
    const hasFullHistory = scopes.has('read_all_orders');
    const shop = await this.findOrCreateShop(shopDomain);
    const startedAt = new Date();
    const updatedSince = await this.getIncrementalStart(shop.id, hasFullHistory, startedAt);
    const counts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0 };

    for await (const order of this.adminApi.iterateOrders(updatedSince)) {
      const result = await this.importer.importOrder(shop.id, order);
      counts[result] += 1;
    }

    const completedAt = new Date();
    try {
      await this.prisma.shopConnection.update({
        where: { id: shop.id },
        data: { lastSyncedAt: completedAt },
      });
    } catch (error) {
      if (isPrismaError(error)) {
        throw new ServiceUnavailableException({
          code: 'DATABASE_UNAVAILABLE',
          message: 'The sync completed, but its status could not be saved.',
        });
      }
      throw error;
    }

    return {
      data: {
        shopDomain,
        startedAt,
        completedAt,
        orders: counts,
        historyCoverage: hasFullHistory ? 'all_available' : 'last_60_days',
      },
    };
  }

  async status() {
    const publicStatus = this.config.getPublicStatus();
    const shopDomain = publicStatus.shopDomain;
    let lastSyncedAt: Date | null = null;
    let storeName: string | null = null;
    if (shopDomain) {
      try {
        const shop = await this.prisma.shopConnection.findUnique({
          where: { shopDomain },
          select: { lastSyncedAt: true },
        });
        lastSyncedAt = shop?.lastSyncedAt ?? null;
      } catch (error) {
        if (isPrismaError(error)) {
          throw new ServiceUnavailableException({
            code: 'DATABASE_UNAVAILABLE',
            message: 'Shopify status could not be retrieved.',
          });
        }
        throw error;
      }
    }
    if (publicStatus.configured) {
      try {
        storeName = await this.adminApi.getShopName();
      } catch {
        storeName = null;
      }
    }
    return { data: { ...publicStatus, storeName, lastSyncedAt } };
  }

  private async findOrCreateShop(shopDomain: string) {
    try {
      return await this.prisma.shopConnection.upsert({
        where: { shopDomain },
        create: { shopDomain },
        update: {},
        select: { id: true, lastSyncedAt: true },
      });
    } catch (error) {
      if (isPrismaError(error)) {
        throw new ServiceUnavailableException({
          code: 'DATABASE_UNAVAILABLE',
          message: 'Shopify sync could not access the database.',
        });
      }
      throw error;
    }
  }

  private async getIncrementalStart(shopId: string, hasFullHistory: boolean, now: Date): Promise<Date | undefined> {
    try {
      const shop = await this.prisma.shopConnection.findUnique({
        where: { id: shopId },
        select: { lastSyncedAt: true },
      });
      if (!shop?.lastSyncedAt) {
        return hasFullHistory ? undefined : new Date(now.getTime() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
      }
      const overlapping = new Date(shop.lastSyncedAt.getTime() - INCREMENTAL_OVERLAP_MS);
      if (hasFullHistory) return overlapping;
      const minimum = new Date(now.getTime() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
      return overlapping < minimum ? minimum : overlapping;
    } catch (error) {
      if (isPrismaError(error)) {
        throw new ServiceUnavailableException({
          code: 'DATABASE_UNAVAILABLE',
          message: 'Shopify sync could not access the database.',
        });
      }
      throw error;
    }
  }
}

function isPrismaError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientUnknownRequestError
    || error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientRustPanicError;
}
