const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const { ShopifyWebhookService } = require('../dist/webhooks/shopify-webhook.service.js');

const secret = 'test-shopify-client-secret';
const raw = Buffer.from('{"id":1001,"email":"private@example.test"}');

function signed(body = raw) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function harness({ getOrder, shopFailure = false, orderImporter } = {}) {
  const state = { events: new Map(), imports: [], shopCalls: 0 };
  const prisma = {
    shopConnection: { upsert: async () => {
      state.shopCalls += 1;
      if (shopFailure) throw new Error('database is down');
      return { id: 'shop-id' };
    } },
    webhookEvent: {
      create: async ({ data }) => {
        const key = `${data.shopId}:${data.deliveryId}`;
        if (state.events.has(key)) throw { code: 'P2002' };
        const row = { ...data, id: `event-${state.events.size + 1}`, receivedAt: new Date(), processedAt: null, attemptCount: 0, lockedAt: null };
        state.events.set(key, row);
        return { id: row.id };
      },
      findUnique: async ({ where }) => where.id
        ? [...state.events.values()].find((event) => event.id === where.id) ?? null
        : state.events.get(`${where.shopId_deliveryId.shopId}:${where.shopId_deliveryId.deliveryId}`) ?? null,
      findFirst: async () => [...state.events.values()].find((event) => event.status === 'queued'
        && (!event.nextAttemptAt || event.nextAttemptAt <= new Date())) ?? null,
      updateMany: async ({ where, data }) => {
        const row = [...state.events.values()].find((event) => event.id === where.id);
        if (!row) return { count: 0 };
        const eligible = row.status === where.status && (row.status === 'failed'
          || (row.status === 'queued' && (!row.nextAttemptAt || row.nextAttemptAt <= new Date())));
        if (!eligible) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const row = [...state.events.values()].find((event) => event.id === where.id);
        if (!row) throw new Error('missing event');
        Object.assign(row, data);
        return row;
      },
    },
  };
  const config = { getCredentials: () => ({ shopDomain: 'test-store.myshopify.com', clientSecret: secret }) };
  const adminApi = { getOrder: getOrder ?? (async () => canonicalOrder()) };
  const importer = orderImporter ?? { importOrder: async (shopId, order) => { state.imports.push({ shopId, order }); return 'inserted'; } };
  return { service: new ShopifyWebhookService(prisma, config, adminApi, importer), state };
}

function canonicalOrder({ customer = null, updatedAt = '2026-10-21T10:00:00.000Z' } = {}) {
  return {
    id: 'gid://shopify/Order/1001', name: '#1001', createdAt: '2026-10-20T10:00:00.000Z', updatedAt,
    cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    totalPriceSet: { shopMoney: { amount: '12.50', currencyCode: 'USD' } }, email: null, customer, lineItems: [],
  };
}

function delivery(overrides = {}) {
  return {
    rawBody: raw, signature: signed(), shopDomain: 'test-store.myshopify.com', topic: 'orders/create',
    deliveryId: 'delivery-1', eventId: 'event-1', ...overrides,
  };
}

test('accepts valid HMAC and imports canonical order while preserving a null customer', async () => {
  const { service, state } = harness({ getOrder: async (id) => {
    assert.equal(id, 'gid://shopify/Order/1001');
    return canonicalOrder();
  } });
  assert.deepEqual(await service.accept(delivery()), { received: true });
  assert.equal(state.imports.length, 0);
  assert.equal(await service.processNext(), true);
  assert.equal(state.imports.length, 1);
  assert.equal(state.imports[0].order.customer, null);
  assert.equal([...state.events.values()][0].status, 'processed');
});

test('rejects invalid or missing HMAC and modified request bytes', async () => {
  const { service, state } = harness();
  await assert.rejects(service.accept(delivery({ signature: 'a'.repeat(64) })), (e) => e.getStatus() === 401);
  await assert.rejects(service.accept(delivery({ signature: undefined })), (e) => e.getStatus() === 400);
  const changed = Buffer.from('{"id":1002}');
  await assert.rejects(service.accept(delivery({ rawBody: changed })), (e) => e.getStatus() === 401);
  assert.equal(state.events.size, 0);
});

test('rejects unsupported topics, wrong shops, and malformed JSON', async () => {
  const { service, state } = harness();
  await assert.rejects(service.accept(delivery({ topic: 'orders/delete' })), (e) => e.getStatus() === 400);
  await assert.rejects(service.accept(delivery({ shopDomain: 'another.myshopify.com' })), (e) => e.getStatus() === 403);
  const invalidJson = Buffer.from('{');
  await assert.rejects(service.accept(delivery({ rawBody: invalidJson, signature: signed(invalidJson) })), (e) => e.getStatus() === 400);
  assert.equal(state.events.size, 0);
});

test('accepts orders/updated and treats a repeated queued delivery as a duplicate', async () => {
  const { service, state } = harness();
  await service.accept(delivery({ topic: 'orders/updated' }));
  assert.deepEqual(await service.accept(delivery({ topic: 'orders/updated' })), { received: true, duplicate: true });
  assert.equal(await service.processNext(), true);
  assert.equal(await service.processNext(), false);
  assert.equal(state.imports.length, 1);
});

test('marks exhausted work failed and safely requeues it when Shopify retries delivery', async () => {
  let attempts = 0;
  const { service, state } = harness({ getOrder: async () => {
    attempts += 1;
    if (attempts <= 5) throw Object.assign(new Error('upstream'), { code: 'SHOPIFY_API_UNAVAILABLE' });
    return canonicalOrder();
  } });
  await service.accept(delivery());
  const event = [...state.events.values()][0];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await service.processNext();
    event.nextAttemptAt = new Date(Date.now() - 1);
  }
  assert.equal(event.status, 'failed');
  await service.accept(delivery());
  assert.equal(event.status, 'queued');
  await service.processNext();
  assert.equal([...state.events.values()][0].status, 'processed');
  assert.equal(attempts, 6);
});

test('concurrent duplicate deliveries are acknowledged from one durable queue claim', async () => {
  let resolveOrder;
  const { service, state } = harness({ getOrder: () => new Promise((resolve) => { resolveOrder = resolve; }) });
  const [first, duplicate] = await Promise.all([service.accept(delivery()), service.accept(delivery())]);
  assert.equal(first.received, true);
  assert.equal(duplicate.duplicate, true);
  const processing = service.processNext();
  while (!resolveOrder) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await service.accept(delivery()), { received: true, duplicate: true });
  resolveOrder(canonicalOrder());
  await processing;
  assert.equal(state.imports.length, 1);
});

test('returns 503 on intake database failures and records safe background failure codes', async () => {
  const unavailableDb = harness({ shopFailure: true });
  await assert.rejects(unavailableDb.service.accept(delivery()), (e) => e.getStatus() === 503);
  const unavailableShopify = harness({ getOrder: async () => { throw Object.assign(new Error('private/customer details'), { code: 'SHOPIFY_API_UNAVAILABLE' }); } });
  await unavailableShopify.service.accept(delivery());
  await unavailableShopify.service.processNext();
  const event = [...unavailableShopify.state.events.values()][0];
  assert.equal(event.status, 'queued');
  assert.equal(event.attemptCount, 1);
  assert.equal(event.errorMessage, 'SHOPIFY_API_UNAVAILABLE');
  assert.doesNotMatch(event.errorMessage, /customer|private/);
});

test('processes out-of-order event deliveries through canonical order state', async () => {
  const returned = [canonicalOrder({ updatedAt: '2026-10-23T10:00:00.000Z' }), canonicalOrder({ updatedAt: '2026-10-22T10:00:00.000Z' })];
  let storedUpdatedAt = null;
  let orderWrites = 0;
  const { ShopifyOrderImportService } = require('../dist/shopify/shopify-order-import.service.js');
  const importer = new ShopifyOrderImportService({ $transaction: async (callback) => callback({
    order: {
      findUnique: async () => storedUpdatedAt ? { id: 'local-order-id', shopifyUpdatedAt: storedUpdatedAt } : null,
      upsert: async (args) => {
        orderWrites += 1;
        storedUpdatedAt = args.create.shopifyUpdatedAt;
        return { id: 'local-order-id' };
      },
    },
    orderItem: { deleteMany: async () => {} },
  }) });
  const { service } = harness({ getOrder: async () => returned.shift(), orderImporter: importer });
  await service.accept(delivery());
  await service.processNext();
  await service.accept(delivery({ deliveryId: 'delivery-2', topic: 'orders/updated' }));
  await service.processNext();
  assert.equal(storedUpdatedAt.toISOString(), '2026-10-23T10:00:00.000Z');
  assert.equal(orderWrites, 1);
});
