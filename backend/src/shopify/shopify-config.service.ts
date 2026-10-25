import { Injectable } from '@nestjs/common';
import { ShopifyIntegrationException } from './shopify.errors';

export const SHOPIFY_ADMIN_API_VERSION = '2026-10';

export interface ShopifyCredentials {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  apiVersion: typeof SHOPIFY_ADMIN_API_VERSION;
}

@Injectable()
export class ShopifyConfigService {
  get credentialsConfigured(): boolean {
    const shopDomain = this.normalizedShopDomain;
    return Boolean(
      shopDomain
      && usableValue(this.env('SHOPIFY_CLIENT_ID'))
      && usableValue(this.env('SHOPIFY_CLIENT_SECRET'))
      && this.env('SHOPIFY_API_VERSION') === SHOPIFY_ADMIN_API_VERSION,
    );
  }

  get normalizedShopDomain(): string | null {
    const value = this.env('SHOPIFY_SHOP_DOMAIN')?.toLowerCase();
    if (!usableValue(value) || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) return null;
    return value;
  }

  get syncSecretConfigured(): boolean {
    const secret = this.env('SHOPIFY_SYNC_SECRET');
    return (secret?.length ?? 0) >= 32 && usableValue(secret);
  }

  get orderCreateSecretConfigured(): boolean {
    const secret = this.env('SHOPIFY_ORDER_CREATE_SECRET');
    return (secret?.length ?? 0) >= 32 && usableValue(secret);
  }

  getPublicStatus(): {
    configured: boolean;
    shopDomain: string | null;
    apiVersion: typeof SHOPIFY_ADMIN_API_VERSION;
    authMode: 'client_credentials';
    syncAuthorizationConfigured: boolean;
  } {
    return {
      configured: this.credentialsConfigured,
      shopDomain: this.normalizedShopDomain,
      apiVersion: SHOPIFY_ADMIN_API_VERSION,
      authMode: 'client_credentials',
      syncAuthorizationConfigured: this.syncSecretConfigured,
    };
  }

  getCredentials(): ShopifyCredentials {
    const shopDomain = this.normalizedShopDomain;
    const clientId = usableValue(this.env('SHOPIFY_CLIENT_ID')) ? this.env('SHOPIFY_CLIENT_ID') : undefined;
    const clientSecret = usableValue(this.env('SHOPIFY_CLIENT_SECRET')) ? this.env('SHOPIFY_CLIENT_SECRET') : undefined;
    const apiVersion = this.env('SHOPIFY_API_VERSION');

    if (!shopDomain || !clientId || !clientSecret) {
      throw new ShopifyIntegrationException(
        503,
        'SHOPIFY_NOT_CONFIGURED',
        'Set SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET in the root .env file.',
      );
    }
    if (apiVersion !== SHOPIFY_ADMIN_API_VERSION) {
      throw new ShopifyIntegrationException(
        503,
        'SHOPIFY_API_VERSION_MISMATCH',
        `SHOPIFY_API_VERSION must be ${SHOPIFY_ADMIN_API_VERSION}.`,
      );
    }

    return { shopDomain, clientId, clientSecret, apiVersion: SHOPIFY_ADMIN_API_VERSION };
  }

  getSyncSecret(): string | null {
    const secret = this.env('SHOPIFY_SYNC_SECRET');
    return usableValue(secret) ? secret ?? null : null;
  }

  getOrderCreateSecret(): string | null {
    const secret = this.env('SHOPIFY_ORDER_CREATE_SECRET');
    return usableValue(secret) && secret.length >= 32 ? secret : null;
  }

  private env(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value || undefined;
  }
}

function usableValue(value: string | undefined): value is string {
  return Boolean(value && !/^(?:replace_with(?:_|$)|your[-_])/i.test(value));
}
