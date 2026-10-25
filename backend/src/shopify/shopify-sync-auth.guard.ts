import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ShopifyConfigService } from './shopify-config.service';

@Injectable()
export class ShopifySyncAuthGuard implements CanActivate {
  constructor(private readonly config: ShopifyConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.getSyncSecret();
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException({
        code: 'SHOPIFY_SYNC_AUTH_NOT_CONFIGURED',
        message: 'Set a random SHOPIFY_SYNC_SECRET of at least 32 characters before enabling manual sync.',
      });
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const supplied = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!supplied || !safeEqual(expected, supplied)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'A valid bearer token is required to start a Shopify sync.',
      });
    }
    return true;
  }
}

function safeEqual(expected: string, supplied: string): boolean {
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const suppliedDigest = createHash('sha256').update(supplied, 'utf8').digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
