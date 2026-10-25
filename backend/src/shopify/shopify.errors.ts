import { HttpException, HttpStatus } from '@nestjs/common';

export class ShopifyIntegrationException extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}

export function shopifyNotConfigured(): ShopifyIntegrationException {
  return new ShopifyIntegrationException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SHOPIFY_NOT_CONFIGURED',
    'Shopify credentials or shop configuration are missing.',
  );
}
