import { Inject, Injectable } from '@nestjs/common';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyFetch, SHOPIFY_FETCH } from './shopify-fetch';
import { ShopifyIntegrationException } from './shopify.errors';

export interface ShopifyAccessToken {
  value: string;
  expiresAt: number;
  scopes: Set<string>;
}

const TOKEN_REFRESH_SKEW_MS = 60_000;
const MAX_TOKEN_ATTEMPTS = 3;

@Injectable()
export class ShopifyTokenService {
  private cachedToken: ShopifyAccessToken | null = null;
  private tokenRequest: Promise<ShopifyAccessToken> | null = null;

  constructor(
    private readonly config: ShopifyConfigService,
    @Inject(SHOPIFY_FETCH) private readonly fetcher: ShopifyFetch,
  ) {}

  async getAccessToken(): Promise<ShopifyAccessToken> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      return this.cachedToken;
    }
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestToken();
    try {
      this.cachedToken = await this.tokenRequest;
      return this.cachedToken;
    } finally {
      this.tokenRequest = null;
    }
  }

  invalidate(tokenValue: string): void {
    if (this.cachedToken?.value === tokenValue) this.cachedToken = null;
  }

  private async requestToken(): Promise<ShopifyAccessToken> {
    const credentials = this.config.getCredentials();
    const url = `https://${credentials.shopDomain}/admin/oauth/access_token`;
    let lastStatus = 0;

    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          }),
          redirect: 'manual',
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt + 1 < MAX_TOKEN_ATTEMPTS) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw new ShopifyIntegrationException(502, 'SHOPIFY_NETWORK_ERROR', 'Could not reach Shopify authentication.');
      }

      if ((response.status >= 300 && response.status < 400)
        || response.redirected
        || (response.url.length > 0 && response.url !== url)) {
        throw new ShopifyIntegrationException(
          502,
          'SHOPIFY_AUTH_REDIRECTED',
          'Shopify authentication redirected the request; it was stopped for credential safety.',
        );
      }

      if (response.status === 429 || response.status >= 500) {
        lastStatus = response.status;
        if (attempt + 1 < MAX_TOKEN_ATTEMPTS) {
          await delay(retryAfterMs(response.headers.get('retry-after')) ?? backoffMs(attempt));
          continue;
        }
        break;
      }

      const payload = await readJson(response);
      if (!response.ok) {
        const errorCode = payload && typeof payload.error === 'string' ? payload.error : '';
        if (errorCode === 'shop_not_permitted') {
          throw new ShopifyIntegrationException(
            403,
            'SHOPIFY_APP_NOT_PERMITTED',
            'The app and store must belong to the same Shopify organization for client-credentials authentication.',
          );
        }
        throw new ShopifyIntegrationException(
          response.status === 401 || response.status === 403 ? 502 : response.status,
          'SHOPIFY_AUTH_FAILED',
          'Shopify rejected the configured app credentials.',
        );
      }

      const accessToken = payload?.access_token;
      const expiresIn = payload?.expires_in;
      if (typeof accessToken !== 'string' || !accessToken || typeof expiresIn !== 'number' || expiresIn <= 0) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_AUTH_RESPONSE_INVALID', 'Shopify returned an invalid token response.');
      }

      const scopes = new Set<string>(
        typeof payload.scope === 'string'
          ? payload.scope.split(/[\s,]+/).map((scope: string) => scope.trim()).filter(Boolean)
          : [],
      );
      return { value: accessToken, expiresAt: Date.now() + expiresIn * 1000, scopes };
    }

    throw new ShopifyIntegrationException(
      lastStatus === 429 ? 503 : 502,
      lastStatus === 429 ? 'SHOPIFY_RATE_LIMITED' : 'SHOPIFY_AUTH_UNAVAILABLE',
      'Shopify authentication is temporarily unavailable. Retry the request later.',
    );
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();
    return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 30_000));
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, Math.min(timestamp - Date.now(), 30_000));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
