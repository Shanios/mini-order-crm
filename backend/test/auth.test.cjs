const assert = require('node:assert/strict');
const { createHmac, scryptSync } = require('node:crypto');
const { test } = require('node:test');
require('reflect-metadata');
const { ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { AuthController } = require('../dist/auth/auth.controller.js');
const { OperatorCsrfGuard } = require('../dist/auth/operator-csrf.guard.js');
const { OperatorSessionAuthGuard } = require('../dist/auth/operator-session-auth.guard.js');
const { OperatorSessionService } = require('../dist/auth/operator-session.service.js');
const { OrderCreateAuthGuard } = require('../dist/shopify/order-create-auth.guard.js');
const { OrderCreationService } = require('../dist/orders/order-creation.service.js');
const { ShopifyWebhookController } = require('../dist/webhooks/shopify-webhook.controller.js');
const { ShopifyWebhookService } = require('../dist/webhooks/shopify-webhook.service.js');
const { ShopifyCatalogController } = require('../dist/shopify/shopify-catalog.controller.js');

const username = 'operator';
const password = 'CorrectHorseBatteryStaple!';
const salt = Buffer.from('11'.repeat(16), 'hex');
const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
const sessionSecret = 'test-only-session-secret-01234567890123456789';
const origin = 'http://localhost:5173';
const originalEnv = {};
for (const name of ['CRM_OPERATOR_USERNAME', 'CRM_OPERATOR_PASSWORD_HASH', 'CRM_SESSION_SECRET', 'CRM_SESSION_TTL_MINUTES', 'FRONTEND_ORIGIN', 'NODE_ENV']) {
  originalEnv[name] = process.env[name];
}
Object.assign(process.env, {
  CRM_OPERATOR_USERNAME: username,
  CRM_OPERATOR_PASSWORD_HASH: passwordHash,
  CRM_SESSION_SECRET: sessionSecret,
  CRM_SESSION_TTL_MINUTES: '8',
  FRONTEND_ORIGIN: origin,
  NODE_ENV: 'test',
});

function harness() {
  const state = { sessions: new Map(), attempts: new Map() };
  const prisma = {
    operatorSession: {
      create: async ({ data, select }) => {
        const row = { id: `session-${state.sessions.size + 1}`, ...data };
        state.sessions.set(data.tokenHash, row);
        return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
      },
      findUnique: async ({ where, select }) => {
        const row = state.sessions.get(where.tokenHash);
        if (!row) return null;
        return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
      },
      deleteMany: async ({ where }) => {
        const entries = [...state.sessions.entries()];
        let count = 0;
        for (const [key, row] of entries) {
          const matches = where.id ? row.id === where.id
            : where.tokenHash ? key === where.tokenHash
              : where.expiresAt ? row.expiresAt <= where.expiresAt.lte
                : false;
          if (matches) { state.sessions.delete(key); count += 1; }
        }
        return { count };
      },
    },
    operatorLoginAttempt: {
      findUnique: async ({ where }) => {
        const row = state.attempts.get(where.keyHash);
        return row ? { blockedUntil: row.blockedUntil } : null;
      },
      deleteMany: async ({ where }) => {
        if (where.keyHash) state.attempts.delete(where.keyHash);
        if (where.updatedAt) {
          for (const [key, row] of state.attempts) if (row.updatedAt < where.updatedAt.lt) state.attempts.delete(key);
        }
        return { count: 1 };
      },
    },
    $queryRaw: async (query) => {
      const key = query.values[0];
      const now = Date.now();
      const current = state.attempts.get(key);
      const failures = !current || now - current.windowStartedAt >= 15 * 60 * 1000 ? 1 : current.failures + 1;
      const windowStartedAt = !current || now - current.windowStartedAt >= 15 * 60 * 1000 ? now : current.windowStartedAt;
      const row = { failures, windowStartedAt, updatedAt: now, blockedUntil: failures >= 5 ? new Date(now + 15 * 60 * 1000) : null };
      state.attempts.set(key, row);
      return [{ failures }];
    },
  };
  const sessions = new OperatorSessionService(prisma);
  return { state, prisma, sessions };
}

function request({ cookie, ip = '127.0.0.1', requestOrigin = origin, csrfToken, forwardedProto } = {}) {
  const headers = {};
  if (cookie) headers.cookie = `mini_order_session=${cookie}`;
  if (requestOrigin) headers.origin = requestOrigin;
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  if (forwardedProto) headers['x-forwarded-proto'] = forwardedProto;
  return { headers, ip, socket: { remoteAddress: ip }, secure: false };
}

function context(req) {
  return { switchToHttp: () => ({ getRequest: () => req }) };
}

async function createLogin(h) {
  return h.sessions.login(username, password, request());
}

test('successful login issues an HttpOnly cookie and exposes no reusable session token in JSON', async () => {
  const h = harness();
  const controller = new AuthController(h.sessions);
  let cookie;
  let cookieOptions;
  const response = { cookie: (_name, value, options) => { cookie = value; cookieOptions = options; } };
  const result = await controller.login({ username, password }, request({ forwardedProto: 'https' }), response);
  assert.equal(result.authenticated, true);
  assert.equal(result.username, username);
  assert.ok(result.csrfToken);
  assert.ok(result.expiresAt);
  assert.equal('cookieToken' in result, false);
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.sameSite, 'lax');
  assert.equal(cookieOptions.secure, true);
  assert.equal(cookieOptions.path, '/api');
  assert.equal(h.state.sessions.size, 1);
  assert.equal([...h.state.sessions.keys()][0] === cookie, false);
  assert.equal([...h.state.sessions.values()][0].username, username);
  assert.equal(JSON.stringify([...h.state.sessions.values()]).includes(password), false);
  assert.ok(cookie);
});

test('invalid credentials do not create a session', async () => {
  const h = harness();
  await assert.rejects(h.sessions.login(username, 'wrong password', request()), (error) => error instanceof UnauthorizedException && error.getStatus() === 401);
  await assert.rejects(h.sessions.login('wrong user', password, request()), (error) => error instanceof UnauthorizedException && error.getStatus() === 401);
  assert.equal(h.state.sessions.size, 0);
});

test('session lookup returns its CSRF token, and expired sessions are revoked', async () => {
  const h = harness();
  const login = await createLogin(h);
  const sessionRequest = request({ cookie: login.cookieToken });
  const restored = await new AuthController(h.sessions).session(sessionRequest);
  assert.equal(restored.authenticated, true);
  assert.equal(restored.username, username);
  assert.equal(restored.csrfToken, login.session.csrfToken);
  const [tokenHash, row] = [...h.state.sessions.entries()][0];
  row.expiresAt = new Date(Date.now() - 1000);
  assert.deepEqual(await new AuthController(h.sessions).session(sessionRequest), { authenticated: false });
  assert.equal(h.state.sessions.has(tokenHash), false);
});

test('logout revokes the server-side session', async () => {
  const h = harness();
  const login = await createLogin(h);
  const req = request({ cookie: login.cookieToken, csrfToken: login.session.csrfToken });
  await new OperatorSessionAuthGuard(h.sessions).canActivate(context(req));
  new OperatorCsrfGuard(h.sessions).canActivate(context(req));
  let cleared;
  const result = await new AuthController(h.sessions).logout(req, {
    clearCookie: (name, options) => { cleared = { name, options }; },
  });
  assert.deepEqual(result, { authenticated: false });
  assert.equal(cleared.name, 'mini_order_session');
  assert.equal(cleared.options.path, '/api');
  assert.equal(cleared.options.httpOnly, true);
  assert.equal(await h.sessions.getSession(request({ cookie: login.cookieToken })), null);
});

test('cookie-authenticated mutations reject invalid origin or CSRF tokens', async () => {
  const h = harness();
  const login = await createLogin(h);
  const authGuard = new OperatorSessionAuthGuard(h.sessions);
  const csrfGuard = new OperatorCsrfGuard(h.sessions);
  const req = request({ cookie: login.cookieToken, csrfToken: 'wrong-token' });
  await authGuard.canActivate(context(req));
  assert.throws(() => csrfGuard.canActivate(context(req)), (error) => error instanceof ForbiddenException && error.getStatus() === 403);
  const badOrigin = request({ cookie: login.cookieToken, csrfToken: login.session.csrfToken, requestOrigin: 'https://attacker.example' });
  await authGuard.canActivate(context(badOrigin));
  assert.throws(() => csrfGuard.canActivate(context(badOrigin)), (error) => error instanceof ForbiddenException && error.getStatus() === 403);
});

test('unauthenticated order creation returns 401; an authorized invalid payload is rejected before Shopify mutation', async () => {
  const h = harness();
  const auth = new OrderCreateAuthGuard({ getOrderCreateSecret: () => null }, h.sessions);
  const anonymous = request();
  await assert.rejects(auth.canActivate(context(anonymous)), (error) => error instanceof UnauthorizedException && error.getStatus() === 401);

  const login = await createLogin(h);
  const req = request({ cookie: login.cookieToken, csrfToken: login.session.csrfToken });
  await auth.canActivate(context(req));
  assert.equal(new OperatorCsrfGuard(h.sessions).canActivate(context(req)), true);

  let shopifyCalls = 0;
  const creation = new OrderCreationService({}, { validateOrderVariants: async () => { shopifyCalls += 1; return new Set(); } }, {});
  await assert.rejects(creation.create({ items: [] }, 'auth-validation-key-01'), (error) => error.getStatus() === 400);
  assert.equal(shopifyCalls, 0);
});

test('customer lookup and creation-request status remain protected by the operator authorization guard', () => {
  const customerGuards = Reflect.getMetadata(GUARDS_METADATA, ShopifyCatalogController.prototype.customers) ?? [];
  const statusGuards = Reflect.getMetadata(GUARDS_METADATA, require('../dist/orders/orders.controller.js').OrdersController.prototype.creationStatus) ?? [];
  assert.ok(customerGuards.includes(OrderCreateAuthGuard));
  assert.ok(statusGuards.includes(OrderCreateAuthGuard));
});

test('repeated failed login attempts are rate limited without creating sessions', async () => {
  const h = harness();
  for (let index = 0; index < 4; index += 1) {
    await assert.rejects(h.sessions.login(username, 'incorrect password', request()), (error) => error.getStatus() === 401);
  }
  await assert.rejects(h.sessions.login(username, 'incorrect password', request()), (error) => error.getStatus() === 429);
  await assert.rejects(h.sessions.login(username, password, request()), (error) => error.getStatus() === 429);
  assert.equal(h.state.sessions.size, 0);
});

test('Shopify webhook accepts a valid signed delivery without an operator session guard', async () => {
  const clientSecret = 'webhook-test-secret';
  const rawBody = Buffer.from('{"id":1001}');
  const signature = createHmac('sha256', clientSecret).update(rawBody).digest('base64');
  const prisma = {
    shopConnection: { upsert: async () => ({ id: 'shop-id' }) },
    webhookEvent: {
      create: async () => ({ id: 'event-id' }),
      findUnique: async () => null,
    },
  };
  const service = new ShopifyWebhookService(
    prisma,
    { getCredentials: () => ({ shopDomain: 'test-store.myshopify.com', clientSecret }) },
    {},
    {},
  );
  const webhookController = new ShopifyWebhookController(service);
  const guards = Reflect.getMetadata(GUARDS_METADATA, ShopifyWebhookController.prototype.receive) ?? [];
  assert.deepEqual(guards, []);
  const result = await webhookController.receive(
    { rawBody },
    {
      'x-shopify-hmac-sha256': signature,
      'x-shopify-shop-domain': 'test-store.myshopify.com',
      'x-shopify-topic': 'orders/create',
      'x-shopify-webhook-id': 'delivery-1',
    },
  );
  assert.deepEqual(result, { received: true });
});

process.on('exit', () => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
