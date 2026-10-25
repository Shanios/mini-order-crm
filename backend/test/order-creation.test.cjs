const assert = require('node:assert/strict');
const { test } = require('node:test');
const { UnauthorizedException, ServiceUnavailableException, ConflictException } = require('@nestjs/common');
const { ShopifyAdminApiService } = require('../dist/shopify/shopify-admin-api.service.js');
const { ShopifyIntegrationException } = require('../dist/shopify/shopify.errors.js');
const { OrderCreateAuthGuard } = require('../dist/shopify/order-create-auth.guard.js');
const { OrderCreationService } = require('../dist/orders/order-creation.service.js');

const variantId = 'gid://shopify/ProductVariant/50841756827933';
const customerId = 'gid://shopify/Customer/345';
const shopifyOrderId = 'gid://shopify/Order/999';
const shopId = 'shop-local-id';
const key = 'task11-idempotency-key-01';

function canonicalOrder() {
  return {
    id: shopifyOrderId, name: '#1003', createdAt: '2026-10-24T10:00:00Z', updatedAt: '2026-10-24T10:00:00Z',
    cancelledAt: null, displayFinancialStatus: 'PENDING', displayFulfillmentStatus: 'UNFULFILLED',
    totalPriceSet: { shopMoney: { amount: '80.00', currencyCode: 'USD' } }, email: null, customer: null,
    lineItems: [{ id: 'gid://shopify/LineItem/9001', title: 'Keyboard', variantTitle: null, sku: 'KB-1', quantity: 2,
      originalUnitPriceSet: { shopMoney: { amount: '40.00' } }, discountedTotalSet: { shopMoney: { amount: '80.00' } },
      product: { id: 'gid://shopify/Product/900' }, variant: { id: variantId } }],
  };
}

function harness(overrides = {}) {
  const state = { requests: new Map(), orders: new Map(), mutations: [], imports: 0, importFailure: null };
  const prisma = {
    shopConnection: { upsert: async () => ({ id: shopId }) },
    orderCreationRequest: {
      create: async ({ data }) => {
        const existing = state.requests.get(data.idempotencyKey);
        if (existing) throw { code: 'P2002' };
        const row = { id: `request-${state.requests.size + 1}`, ...data, shopifyOrderId: null, orderId: null, errorCode: null };
        state.requests.set(data.idempotencyKey, row);
        return row;
      },
      findUnique: async ({ where }) => state.requests.get(where.shopId_idempotencyKey.idempotencyKey) ?? null,
      update: async ({ where, data }) => {
        const row = [...state.requests.values()].find((item) => item.id === where.id);
        if (!row) throw new Error('missing request');
        Object.assign(row, data);
        return row;
      },
    },
    order: {
      findUnique: async ({ where }) => where.id
        ? [...state.orders.values()].find((order) => order.id === where.id) ?? null
        : state.orders.get(where.shopId_shopifyOrderId.shopifyOrderId) ?? null,
    },
  };
  const admin = {
    shopDomain: 'example.myshopify.com',
    validateOrderVariants: async (ids) => new Set(ids),
    customerExists: async () => true,
    createOrder: async (input) => { state.mutations.push(input); return { orderId: shopifyOrderId, userErrors: [] }; },
    getOrder: async () => canonicalOrder(),
    ...overrides.admin,
  };
  const importer = {
    importOrder: async (_id, order) => {
      if (state.importFailure) throw state.importFailure;
      state.imports += 1;
      const prior = state.orders.get(order.id);
      const saved = { ...order, id: prior?.id ?? 'local-order-id', shopifyOrderId: order.id, items: order.lineItems, customer: null };
      state.orders.set(order.id, saved);
      return prior ? 'updated' : 'inserted';
    },
  };
  return { service: new OrderCreationService(prisma, admin, importer), state, admin };
}

const requestBody = { items: [{ variantId, quantity: 2 }] };

test('creates through Shopify once, imports canonical totals, and stores one CRM order', async () => {
  const { service, state } = harness();
  const result = await service.create(requestBody, key);
  assert.equal(result.data.id, 'local-order-id');
  assert.equal(result.data.name, '#1003');
  assert.equal(state.mutations.length, 1);
  assert.deepEqual(state.mutations[0], { lineItems: [{ variantId, quantity: 2 }] });
  assert.equal('price' in state.mutations[0].lineItems[0], false);
  assert.equal(state.imports, 1);
  assert.equal(state.orders.size, 1);
  assert.equal(state.requests.get(key).status, 'completed');
});

test('supports an optional existing customer and note without accepting client prices', async () => {
  const { service, state } = harness();
  await service.create({ ...requestBody, customerId, note: 'Counter sale' }, key);
  assert.deepEqual(state.mutations[0], { lineItems: [{ variantId, quantity: 2 }], customerId, note: 'Counter sale' });
});

test('rejects invalid quantities, duplicate variants, and malformed IDs before mutation', async () => {
  const { service, state } = harness();
  for (const body of [
    { items: [{ variantId, quantity: 0 }] },
    { items: [{ variantId, quantity: 1.5 }] },
    { items: [{ variantId: 'not-a-shopify-id', quantity: 1 }] },
    { items: [{ variantId, quantity: 1 }, { variantId, quantity: 1 }] },
    { items: [{ variantId, quantity: 1, price: 0.01 }] },
  ]) await assert.rejects(service.create(body, key));
  assert.equal(state.mutations.length, 0);
  assert.equal(state.requests.size, 0);
});

test('rejects missing or unavailable Shopify variants and customers', async () => {
  const missingVariant = harness({ admin: { validateOrderVariants: async () => new Set() } });
  await assert.rejects(missingVariant.service.create(requestBody, key), (error) => error.getResponse().code === 'SHOPIFY_VARIANT_UNAVAILABLE');
  assert.equal(missingVariant.state.mutations.length, 0);

  const missingCustomer = harness({ admin: { customerExists: async () => false } });
  await assert.rejects(missingCustomer.service.create({ ...requestBody, customerId }, key), (error) => error.getResponse().code === 'SHOPIFY_CUSTOMER_UNAVAILABLE');
  assert.equal(missingCustomer.state.mutations.length, 0);
});

test('requires an idempotency key and rejects changed requests for a previously used key', async () => {
  const { service } = harness();
  await assert.rejects(service.create(requestBody), (error) => error.getResponse().code === 'IDEMPOTENCY_KEY_REQUIRED');
  await service.create(requestBody, key);
  await assert.rejects(service.create({ items: [{ variantId, quantity: 3 }] }, key), ConflictException);
});

test('returns the original result on repeated submissions and only mutates once', async () => {
  const { service, state } = harness();
  const first = await service.create(requestBody, key);
  const second = await service.create(requestBody, key);
  assert.equal(first.data.id, second.data.id);
  assert.equal(state.mutations.length, 1);
});

test('concurrent duplicate submissions reserve one mutation', async () => {
  let release;
  let calls = 0;
  const { service, state } = harness({ admin: { createOrder: () => {
    calls += 1;
    return new Promise((resolve) => { release = () => resolve({ orderId: shopifyOrderId, userErrors: [] }); });
  } } });
  const first = service.create(requestBody, key);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.create(requestBody, key), ConflictException);
  release();
  await first;
  assert.equal(calls, 1);
  assert.equal(state.requests.get(key).status, 'completed');
});

test('does not retry a mutation after a timeout and keeps the key reserved as uncertain', async () => {
  let calls = 0;
  const { service, state } = harness({ admin: { createOrder: async () => {
    calls += 1;
    throw new ShopifyIntegrationException(504, 'SHOPIFY_ORDER_OUTCOME_UNKNOWN', 'unknown');
  } } });
  await assert.rejects(service.create(requestBody, key), (error) => error.getResponse().code === 'ORDER_CREATION_OUTCOME_UNKNOWN');
  assert.equal(state.requests.get(key).status, 'uncertain');
  await assert.rejects(service.create(requestBody, key), ConflictException);
  assert.equal(calls, 1);
});

test('handles confirmed Shopify user errors without importing an order', async () => {
  const { service, state } = harness({ admin: { createOrder: async () => ({ orderId: null, userErrors: [{ field: ['lineItems', '0', 'variantId'], message: 'Variant is invalid.' }] }) } });
  await assert.rejects(service.create(requestBody, key), (error) => error.getResponse().code === 'SHOPIFY_ORDER_REJECTED');
  assert.equal(state.requests.get(key).status, 'rejected');
  assert.equal(state.imports, 0);
});

test('resumes local persistence after a transaction failure without creating a second Shopify order', async () => {
  const { service, state } = harness();
  state.importFailure = new Error('temporary database transaction failure');
  await assert.rejects(service.create(requestBody, key), (error) => error.getResponse().code === 'ORDER_CREATED_SYNC_PENDING');
  assert.equal(state.requests.get(key).status, 'sync_pending');
  state.importFailure = null;
  await service.create(requestBody, key);
  assert.equal(state.mutations.length, 1);
  assert.equal(state.imports, 1);
  assert.equal(state.requests.get(key).status, 'completed');
});

test('shares the unique importer path with a concurrent create webhook order', async () => {
  const { service, state } = harness();
  // Simulate the webhook having imported Shopify's canonical order just before POST completes.
  state.orders.set(shopifyOrderId, { ...canonicalOrder(), id: 'webhook-order-id', shopifyOrderId, items: canonicalOrder().lineItems, customer: null });
  const result = await service.create(requestBody, key);
  assert.equal(result.data.id, 'webhook-order-id');
  assert.equal(state.orders.size, 1);
  assert.equal(state.requests.get(key).status, 'completed');
});

test('preserves backend bearer authorization for trusted order-creation clients', async () => {
  const request = { headers: { authorization: 'Bearer bad' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  await assert.rejects(new OrderCreateAuthGuard({ getOrderCreateSecret: () => null }, {}).canActivate(context), ServiceUnavailableException);
  await assert.rejects(new OrderCreateAuthGuard({ getOrderCreateSecret: () => 'a'.repeat(40) }, {}).canActivate(context), UnauthorizedException);
  request.headers.authorization = `Bearer ${'a'.repeat(40)}`;
  assert.equal(await new OrderCreateAuthGuard({ getOrderCreateSecret: () => 'a'.repeat(40) }, {}).canActivate(context), true);
});

test('paginates product variant lookup and returns shop currency with product and variant data', async () => {
  const calls = [];
  const admin = new ShopifyAdminApiService({ getCredentials: () => ({ shopDomain: 'example.myshopify.com', apiVersion: '2026-10' }) }, { getAccessToken: async () => ({ value: 'private', expiresAt: Date.now() + 1000 }) }, async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ data: { shop: { currencyCode: 'USD' }, productVariants: { edges: [{ cursor: 'cursor-1', node: { id: variantId, title: 'Standard', sku: 'KB-1', price: '40.00', availableForSale: true, selectedOptions: [], product: { id: 'gid://shopify/Product/900', title: 'Keyboard', status: 'ACTIVE' } } }], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } } } });
  });
  const result = await admin.searchProductVariants('keyboard', 1, 'cursor-before');
  assert.equal(result.currencyCode, 'USD');
  assert.equal(result.nodes[0].price, '40.00');
  assert.equal(result.nodes[0].product.title, 'Keyboard');
  assert.equal(result.pageInfo.endCursor, 'cursor-1');
  assert.equal(calls[0].variables.after, 'cursor-before');
  assert.equal(calls[0].variables.search, '"keyboard"');
});

test('searches customers with paginated results and safe projections', async () => {
  const admin = new ShopifyAdminApiService({ getCredentials: () => ({ shopDomain: 'example.myshopify.com', apiVersion: '2026-10' }) }, { getAccessToken: async () => ({ value: 'private', expiresAt: Date.now() + 1000 }) }, async () => Response.json({ data: { customers: { edges: [{ cursor: 'customer-1', node: { id: customerId, displayName: 'Test Customer', defaultEmailAddress: { emailAddress: 'customer@example.test' } } }], pageInfo: { hasNextPage: false, endCursor: 'customer-1' } } } }));
  const result = await admin.searchCustomers('test', 10);
  assert.deepEqual(result.nodes, [{ id: customerId, displayName: 'Test Customer', email: 'customer@example.test' }]);
  assert.equal(result.pageInfo.hasNextPage, false);
});

test('validates variant availability without trusting client price or currency', async () => {
  let body;
  const admin = new ShopifyAdminApiService({ getCredentials: () => ({ shopDomain: 'example.myshopify.com', apiVersion: '2026-10' }) }, { getAccessToken: async () => ({ value: 'private', expiresAt: Date.now() + 1000 }) }, async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ data: { nodes: [
      { __typename: 'ProductVariant', id: variantId, availableForSale: true, product: { id: 'gid://shopify/Product/900', status: 'ACTIVE' } },
      { __typename: 'ProductVariant', id: 'gid://shopify/ProductVariant/901', availableForSale: true, product: { id: 'gid://shopify/Product/901', status: 'ARCHIVED' } },
      { __typename: 'ProductVariant', id: 'gid://shopify/ProductVariant/902', availableForSale: false, product: { id: 'gid://shopify/Product/902', status: 'ACTIVE' } },
      null,
    ] } });
  });
  assert.deepEqual([...await admin.validateOrderVariants([variantId, 'gid://shopify/ProductVariant/404'])], [variantId]);
  assert.match(body.query, /availableForSale/);
});

test('sends orderCreate once with Shopify variant IDs and quantities only', async () => {
  let calls = 0;
  let body;
  const admin = new ShopifyAdminApiService({ getCredentials: () => ({ shopDomain: 'example.myshopify.com', apiVersion: '2026-10' }) }, { getAccessToken: async () => ({ value: 'private', expiresAt: Date.now() + 1000 }) }, async (_url, init) => {
    calls += 1;
    body = JSON.parse(init.body);
    return Response.json({ data: { orderCreate: { order: { id: shopifyOrderId }, userErrors: [] } } });
  });
  const result = await admin.createOrder({ lineItems: [{ variantId, quantity: 2 }] });
  assert.equal(result.orderId, shopifyOrderId);
  assert.equal(calls, 1);
  assert.deepEqual(body.variables.order.lineItems, [{ variantId, quantity: 2 }]);
  assert.equal('price' in body.variables.order.lineItems[0], false);
  assert.equal('currency' in body.variables.order, false);
});

test('classifies rate limiting as a confirmed rejection and network timeout as uncertain', async () => {
  const makeAdmin = (fetcher) => new ShopifyAdminApiService(
    { getCredentials: () => ({ shopDomain: 'example.myshopify.com', apiVersion: '2026-10' }) },
    { getAccessToken: async () => ({ value: 'private', expiresAt: Date.now() + 1000 }) },
    fetcher,
  );
  await assert.rejects(makeAdmin(async () => Response.json({ errors: [{ extensions: { code: 'THROTTLED' } }] })).createOrder({ lineItems: [{ variantId, quantity: 1 }] }), (error) => error.getResponse().code === 'SHOPIFY_RATE_LIMITED');
  await assert.rejects(makeAdmin(async () => Response.json({ errors: [{ extensions: { code: 'ACCESS_DENIED' } }] })).createOrder({ lineItems: [{ variantId, quantity: 1 }] }), (error) => error.getResponse().code === 'SHOPIFY_PERMISSION_DENIED');
  await assert.rejects(makeAdmin(async () => { throw new Error('timeout'); }).createOrder({ lineItems: [{ variantId, quantity: 1 }] }), (error) => error.getResponse().code === 'SHOPIFY_ORDER_OUTCOME_UNKNOWN');
});
