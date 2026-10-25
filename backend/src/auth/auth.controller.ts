import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OperatorCsrfGuard } from './operator-csrf.guard';
import { OperatorSessionAuthGuard } from './operator-session-auth.guard';
import { OperatorSessionService } from './operator-session.service';
import type { OperatorSessionRequest } from './operator-session-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly sessions: OperatorSessionService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const result = await this.sessions.login(payload.username, payload.password, request);
    response.cookie(this.sessions.cookieName, result.cookieToken, this.sessions.getCookieOptions(request, result.maxAgeMs));
    return {
      authenticated: true,
      username: result.session.username,
      csrfToken: result.session.csrfToken,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: Request) {
    const session = await this.sessions.getSession(request);
    if (!session) return { authenticated: false };
    return {
      authenticated: true,
      username: session.username,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(OperatorSessionAuthGuard, OperatorCsrfGuard)
  async logout(
    @Req() request: OperatorSessionRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.logout(request.operatorSession!.id);
    response.clearCookie(this.sessions.cookieName, this.sessions.getCookieOptions(request));
    return { authenticated: false };
  }
}
