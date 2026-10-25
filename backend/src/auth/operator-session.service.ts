import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const COOKIE_NAME = 'mini_order_session';
const PASSWORD_HASH_PATTERN = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const SESSION_TTL_MINUTES_DEFAULT = 480;

export interface OperatorSessionContext {
  id: string;
  username: string;
  expiresAt: Date;
  csrfToken: string;
}

export interface OperatorLoginResult {
  session: OperatorSessionContext;
  cookieToken: string;
  maxAgeMs: number;
}

interface PasswordHashParts {
  salt: Buffer;
  digest: Buffer;
}

interface OperatorAuthDatabase extends Pick<PrismaService, '$queryRaw'> {
  operatorLoginAttempt: {
    findUnique(args: { where: { keyHash: string }; select: { blockedUntil: true } }): Promise<{ blockedUntil: Date | null } | null>;
    deleteMany(args: { where: { keyHash: string } | { updatedAt: { lt: Date } } }): Promise<unknown>;
  };
  operatorSession: {
    create(args: {
      data: { tokenHash: string; username: string; expiresAt: Date };
      select: { id: true; username: true; expiresAt: true };
    }): Promise<{ id: string; username: string; expiresAt: Date }>;
    findUnique(args: {
      where: { tokenHash: string };
      select: { id: true; username: true; expiresAt: true };
    }): Promise<{ id: string; username: string; expiresAt: Date } | null>;
    deleteMany(args: { where: { id: string } | { tokenHash: string } | { expiresAt: { lte: Date } } }): Promise<unknown>;
  };
}

@Injectable()
export class OperatorSessionService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): OperatorAuthDatabase {
    return this.prisma as unknown as OperatorAuthDatabase;
  }

  get cookieName(): string {
    return COOKIE_NAME;
  }

  get cookieMaxAgeMs(): number {
    return this.settings().ttlMinutes * 60 * 1000;
  }

  async login(usernameInput: unknown, passwordInput: unknown, request: Request): Promise<OperatorLoginResult> {
    this.assertAllowedOrigin(request);
    const settings = this.settings();
    const loginKey = this.loginKey(request, settings.sessionSecret);
    await this.assertNotRateLimited(loginKey);

    const username = typeof usernameInput === 'string' ? usernameInput : '';
    const password = typeof passwordInput === 'string' && passwordInput.length <= 1024 ? passwordInput : '';
    const parsedHash = parsePasswordHash(settings.passwordHash);
    const suppliedDigest = await derivePasswordDigest(password, parsedHash.salt);
    const passwordMatches = timingSafeEqual(parsedHash.digest, suppliedDigest);
    const usernameMatches = constantTimeTextEqual(settings.username, username);

    if (!passwordMatches || !usernameMatches || !password) {
      const failures = await this.recordFailure(loginKey);
      if (failures >= LOGIN_FAILURE_LIMIT) {
        throw rateLimitedException();
      }
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The username or password is incorrect.' });
    }

    await this.db.operatorLoginAttempt.deleteMany({ where: { keyHash: loginKey } });
    await this.db.operatorSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });

    const existingToken = readCookie(request, COOKIE_NAME);
    if (existingToken) {
      await this.db.operatorSession.deleteMany({ where: { tokenHash: this.sessionHash(existingToken, settings.sessionSecret) } });
    }

    const cookieToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + settings.ttlMinutes * 60 * 1000);
    const row = await this.db.operatorSession.create({
      data: {
        tokenHash: this.sessionHash(cookieToken, settings.sessionSecret),
        username: settings.username,
        expiresAt,
      },
      select: { id: true, username: true, expiresAt: true },
    });

    return {
      cookieToken,
      maxAgeMs: settings.ttlMinutes * 60 * 1000,
      session: {
        ...row,
        csrfToken: this.csrfToken(cookieToken, settings.sessionSecret),
      },
    };
  }

  async getSession(request: Request): Promise<OperatorSessionContext | null> {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return null;
    const settings = this.settings();
    const row = await this.db.operatorSession.findUnique({
      where: { tokenHash: this.sessionHash(token, settings.sessionSecret) },
      select: { id: true, username: true, expiresAt: true },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.db.operatorSession.deleteMany({ where: { id: row.id } });
      return null;
    }
    return { ...row, csrfToken: this.csrfToken(token, settings.sessionSecret) };
  }

  async authenticate(request: Request): Promise<OperatorSessionContext> {
    const session = await this.getSession(request);
    if (!session) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Operator authentication is required.' });
    }
    return session;
  }

  assertAllowedOrigin(request: Request): void {
    const origin = request.headers.origin;
    const allowed = configuredOrigins();
    if (typeof origin !== 'string' || !allowed.includes(origin)) {
      throw new ForbiddenException({ code: 'CSRF_ORIGIN_REJECTED', message: 'The request origin is not allowed.' });
    }
  }

  verifyCsrf(request: Request, session: OperatorSessionContext): void {
    this.assertAllowedOrigin(request);
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || !constantTimeTextEqual(session.csrfToken, supplied)) {
      throw new ForbiddenException({ code: 'CSRF_TOKEN_REJECTED', message: 'A valid CSRF token is required.' });
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.operatorSession.deleteMany({ where: { id: sessionId } });
  }

  getCookieOptions(request: Request, maxAge?: number) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
        || request.secure
        || request.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim().toLowerCase() === 'https',
      sameSite: 'lax' as const,
      path: '/api',
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }

  private settings(): { username: string; passwordHash: string; sessionSecret: string; ttlMinutes: number } {
    const username = process.env.CRM_OPERATOR_USERNAME?.trim() ?? '';
    const passwordHash = process.env.CRM_OPERATOR_PASSWORD_HASH?.trim() ?? '';
    const sessionSecret = process.env.CRM_SESSION_SECRET?.trim() ?? '';
    const ttlValue = process.env.CRM_SESSION_TTL_MINUTES?.trim();
    const ttlMinutes = ttlValue === undefined ? SESSION_TTL_MINUTES_DEFAULT : Number(ttlValue);
    const configured = username.length > 0
      && username.length <= 100
      && Boolean(PASSWORD_HASH_PATTERN.test(passwordHash))
      && sessionSecret.length >= 32
      && !/^(?:replace_with(?:_|$)|your[-_])/i.test(sessionSecret)
      && Number.isInteger(ttlMinutes)
      && ttlMinutes >= 5
      && ttlMinutes <= 1440;

    if (!configured) {
      throw new ServiceUnavailableException({
        code: 'OPERATOR_AUTH_NOT_CONFIGURED',
        message: 'Operator authentication is not configured on the backend.',
      });
    }
    return { username, passwordHash, sessionSecret, ttlMinutes };
  }

  private loginKey(request: Request, sessionSecret: string): string {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    return this.hmac(`login-ip:${ip}`, sessionSecret);
  }

  private async assertNotRateLimited(keyHash: string): Promise<void> {
    const attempt = await this.db.operatorLoginAttempt.findUnique({ where: { keyHash }, select: { blockedUntil: true } });
    if (attempt?.blockedUntil && attempt.blockedUntil.getTime() > Date.now()) {
      throw rateLimitedException();
    }
  }

  private async recordFailure(keyHash: string): Promise<number> {
    await this.db.operatorLoginAttempt.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const rows = await this.db.$queryRaw<Array<{ failures: number }>>(Prisma.sql`
      INSERT INTO operator_login_attempts (key_hash, window_started_at, failures, blocked_until, updated_at)
      VALUES (${keyHash}, now(), 1, NULL, now())
      ON CONFLICT (key_hash) DO UPDATE SET
        failures = CASE
          WHEN operator_login_attempts.window_started_at <= now() - (${LOGIN_WINDOW_MS} * interval '1 millisecond') THEN 1
          ELSE operator_login_attempts.failures + 1
        END,
        window_started_at = CASE
          WHEN operator_login_attempts.window_started_at <= now() - (${LOGIN_WINDOW_MS} * interval '1 millisecond') THEN now()
          ELSE operator_login_attempts.window_started_at
        END,
        blocked_until = CASE
          WHEN operator_login_attempts.window_started_at <= now() - (${LOGIN_WINDOW_MS} * interval '1 millisecond') THEN NULL
          WHEN operator_login_attempts.failures + 1 >= ${LOGIN_FAILURE_LIMIT} THEN now() + (${LOGIN_WINDOW_MS} * interval '1 millisecond')
          ELSE operator_login_attempts.blocked_until
        END,
        updated_at = now()
      RETURNING failures
    `);
    return rows[0]?.failures ?? LOGIN_FAILURE_LIMIT;
  }

  private sessionHash(token: string, secret: string): string {
    return this.hmac(`session:${token}`, secret);
  }

  private csrfToken(token: string, secret: string): string {
    return Buffer.from(this.hmac(`csrf:${token}`, secret), 'hex').toString('base64url');
  }

  private hmac(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
  }
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  return null;
}

function configuredOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parsePasswordHash(encoded: string): PasswordHashParts {
  const match = PASSWORD_HASH_PATTERN.exec(encoded);
  if (!match) {
    throw new ServiceUnavailableException({ code: 'OPERATOR_AUTH_NOT_CONFIGURED', message: 'Operator authentication is not configured on the backend.' });
  }
  return { salt: Buffer.from(match[1], 'hex'), digest: Buffer.from(match[2], 'hex') };
}

async function derivePasswordDigest(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function constantTimeTextEqual(expected: string, supplied: string): boolean {
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const suppliedDigest = createHash('sha256').update(supplied, 'utf8').digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function rateLimitedException(): HttpException {
  return new HttpException({
    code: 'LOGIN_RATE_LIMITED',
    message: 'Too many login attempts. Wait before trying again.',
  }, HttpStatus.TOO_MANY_REQUESTS);
}
