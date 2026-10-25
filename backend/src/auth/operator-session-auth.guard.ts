import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { OperatorSessionService } from './operator-session.service';
import type { OperatorSessionContext } from './operator-session.service';

export type OperatorSessionRequest = Request & { operatorSession?: OperatorSessionContext };

@Injectable()
export class OperatorSessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: OperatorSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperatorSessionRequest>();
    request.operatorSession = await this.sessions.authenticate(request);
    return true;
  }
}
