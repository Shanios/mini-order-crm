import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OperatorSessionService } from '../auth/operator-session.service';
import type { OperatorSessionRequest } from '../auth/operator-session-auth.guard';
import { ShopifyConfigService } from './shopify-config.service';

@Injectable()
export class OrderCreateAuthGuard implements CanActivate {
  constructor(private readonly config: ShopifyConfigService, private readonly sessions: OperatorSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperatorSessionRequest>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      request.operatorSession = await this.sessions.authenticate(request);
      return true;
    }

    const expected = this.config.getOrderCreateSecret();
    if (!expected) {
      throw new ServiceUnavailableException({
        code: 'ORDER_CREATION_BEARER_NOT_CONFIGURED',
        message: 'Backend bearer authorization is not configured.',
      });
    }
    const provided = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
    const expectedHash = createHash('sha256').update(expected).digest();
    const providedHash = createHash('sha256').update(provided).digest();
    if (!authorization || !timingSafeEqual(expectedHash, providedHash)) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Order creation requires operator authorization.' });
    }
    return true;
  }
}
