import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OperatorSessionService } from './operator-session.service';
import type { OperatorSessionRequest } from './operator-session-auth.guard';

@Injectable()
export class OperatorCsrfGuard implements CanActivate {
  constructor(private readonly sessions: OperatorSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OperatorSessionRequest>();
    const session = request.operatorSession;
    if (!session) return true;
    this.sessions.verifyCsrf(request, session);
    return true;
  }
}

@Injectable()
export class OperatorSessionCsrfGuard extends OperatorCsrfGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OperatorSessionRequest>();
    if (!request.operatorSession) {
      throw new ForbiddenException({ code: 'CSRF_TOKEN_REJECTED', message: 'A valid CSRF token is required.' });
    }
    return super.canActivate(context);
  }
}
