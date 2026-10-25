import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OperatorCsrfGuard, OperatorSessionCsrfGuard } from './operator-csrf.guard';
import { OperatorSessionAuthGuard } from './operator-session-auth.guard';
import { OperatorSessionService } from './operator-session.service';

@Module({
  controllers: [AuthController],
  providers: [OperatorSessionService, OperatorSessionAuthGuard, OperatorCsrfGuard, OperatorSessionCsrfGuard],
  exports: [OperatorSessionService, OperatorSessionAuthGuard, OperatorCsrfGuard],
})
export class AuthModule {}
