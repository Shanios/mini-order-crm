const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  ShopifyAdminApiService,
} = require('../dist/shopify/shopify-admin-api.service.js');
const { ShopifyConfigService } = require('../dist/shopify/shopify-config.service.js');
const { ShopifyTokenService } = require('../dist/shopify/shopify-token.service.js');
const { ShopifyOrderImportService } = require('../dist/shopify/shopify-order-import.service.js');
const { ShopifySyncAuthGuard } = require('../dist/shopify/shopify-sync-auth.guard.js');
const { ShopifyIntegrationException } = require('../dist/shopify/shopify.errors.js');

function response(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function lineItem(id) {
  return {
    id,
    title: 'Test line item',
    variantTitle: null,
    sku: null,
    quantity: 2,
    originalUnitPriceSet: { shopMoney: { amount: '12.50' } },
    discountedTotalSet: { shopMoney: { amount: '20.00' } },
    product: { id: 'gid://shopify/Product/7' },
    variant: null,
  };
}

function orderNode(id, { items = [], hasMoreItems = false, itemCursor = null } = {}) {
  return {
    id,
    name: '#1001',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    cancelledAt: null,
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'FULFILLED',
    totalPriceSet: { shopMoney: { amount: '25.00', currencyCode: 'USD' } },
    email: 'customer@example.test',
    customer: null,
    lineItems: {
      edges: items.map((node, index) => ({ cursor: `line-${index}`, node })),
      pageInfo: { hasNextPage: hasMoreItems, endCursor: itemCursor },
    },
  };
}

function ordersPage(edges, hasNextPage, endCursor) {
  return { data: { orders: { edges, pageInfo: { hasNextPage, endCursor } } } };
}

test('caches client-credentials tokens and refreshes before expiry', async () => {
  const names = ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_API_VERSION'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  Object.assign(process.env, {
    SHOPIFY_SHOP_DOMAIN: 'test-store.myshopify.com',
    SHOPIFY_CLIENT_ID: 'test-client-id',
    SHOPIFY_CLIENT_SECRET: 'test-client-secret',
    SHOPIFY_API_VERSION: '2026-10',
  });
  let calls = 0;
  const tokens = new ShopifyTokenService(new ShopifyConfigService(), async () => {
    calls += 1;
    return response({ access_token: `test-token-${calls}`, expires_in: 120, scope: 'read_orders,read_all_orders' });
  });

  try {
    const [first, concurrent] = await Promise.all([tokens.getAccessToken(), tokens.getAccessToken()]);
    assert.equal(calls, 1);
    assert.equal(first.value, concurrent.value);
    assert.deepEqual([...first.scopes], ['read_orders', 'read_all_orders']);
    now += 70_000;
    assert.equal((await tokens.getAccessToken()).value, 'test-token-2');
    assert.equal(calls, 2);
  } finally {
    Date.now = originalNow;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('does not treat copied environment placeholders as Shopify credentials', async () => {
  const names = ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_API_VERSION', 'SHOPIFY_SYNC_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    SHOPIFY_SHOP_DOMAIN: 'connect-qwijlme1.myshopify.com',
    SHOPIFY_CLIENT_ID: 'replace_with_app_client_id',
    SHOPIFY_CLIENT_SECRET: 'replace_with_app_client_secret',
    SHOPIFY_API_VERSION: '2026-10',
    SHOPIFY_SYNC_SECRET: 'replace_with_a_long_random_secret',
  });

  try {
    const config = new ShopifyConfigService();
    assert.equal(config.credentialsConfigured, false);
    assert.equal(config.syncSecretConfigured, false);
    assert.equal(config.getSyncSecret(), null);
    assert.throws(() => config.getCredentials(), (error) => error.getStatus() === 503);
    let fetchCalls = 0;
    const tokens = new ShopifyTokenService(config, async () => {
      fetchCalls += 1;
      return response({});
    });
    await assert.rejects(tokens.getAccessToken(), (error) => error.getStatus() === 503);
    assert.equal(fetchCalls, 0);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('stops credential-bearing token requests at redirects', async () => {
  let calls = 0;
  const config = {
    getCredentials: () => ({
      shopDomain: 'test-store.myshopify.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      apiVersion: '2026-10',
    }),
  };
  const tokens = new ShopifyTokenService(config, async (_url, init) => {
    calls += 1;
    assert.equal(init.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { location: 'https://redirect-target.invalid/token' },
    });
  });

  await assert.rejects(tokens.getAccessToken(), (error) => {
    assert.equal(error.getStatus(), 502);
    assert.equal(error.getResponse().code, 'SHOPIFY_AUTH_REDIRECTED');
    return true;
  });
  assert.equal(calls, 1);
});

test('paginates orders and every order line-item cursor', async () => {
  const calls = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.query.includes('OrdersPage') && body.variables.after === null) {
      return response(ordersPage([{
        cursor: 'order-cursor-1',
        node: orderNode('gid://shopify/Order/1', {
          items: [lineItem('gid://shopify/LineItem/1')],
          hasMoreItems: true,
          itemCursor: 'line-cursor-1',
        }),
      }], true, 'order-cursor-1'));
    }
    if (body.query.includes('OrderLineItems')) {
      return response({ data: { order: { lineItems: {
        edges: [{ cursor: 'line-cursor-2', node: lineItem('gid://shopify/LineItem/2') }],
        pageInfo: { hasNextPage: false, endCursor: 'line-cursor-2' },
      } } } });
    }
    if (body.query.includes('OrdersPage') && body.variables.after === 'order-cursor-1') {
      return response(ordersPage([{
        cursor: 'order-cursor-2',
        node: orderNode('gid://shopify/Order/2'),
      }], false, 'order-cursor-2'));
    }
    throw new Error('Unexpected GraphQL request');
  };
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com',
    apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set(['read_orders']) }),
    invalidate: () => {},
  };
  const service = new ShopifyAdminApiService(config, tokens, fetcher);
  const found = [];
  for await (const order of service.iterateOrders(new Date('2026-10-01T00:00:00.000Z'))) found.push(order);

  assert.equal(found.length, 2);
  assert.deepEqual(found[0].lineItems.map((item) => item.id), [
    'gid://shopify/LineItem/1', 'gid://shopify/LineItem/2',
  ]);
  assert.equal(found[1].lineItems.length, 0);
  assert.equal(calls[0].variables.query, "status:any updated_at:>='2026-10-01T00:00:00.000Z'");
  assert.equal(calls[1].variables.after, 'line-cursor-1');
  assert.equal(calls[2].variables.after, 'order-cursor-1');
});

test('reads granted scopes from currentAppInstallation', async () => {
  let requestBody;
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com', apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set() }),
    invalidate: () => {},
  };
  const fetcher = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return response({ data: { currentAppInstallation: { accessScopes: [
      { handle: 'read_orders' }, { handle: 'read_customers' },
    ] } } });
  };
  const scopes = await new ShopifyAdminApiService(config, tokens, fetcher).getGrantedScopes();

  assert.ok(requestBody.query.includes('currentAppInstallation'));
  assert.deepEqual([...scopes], ['read_orders', 'read_customers']);
});

test('reads the actual Shopify store display name through Admin GraphQL', async () => {
  let requestBody;
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com', apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set() }),
    invalidate: () => {},
  };
  const service = new ShopifyAdminApiService(config, tokens, async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return response({ data: { shop: { name: 'Snowpeak Outfitters' } } });
  });

  assert.equal(await service.getShopName(), 'Snowpeak Outfitters');
  assert.match(requestBody.query, /query ShopDisplayName\s*\{\s*shop\s*\{\s*name\s*\}/);
});

test('returns null when Shopify has no available store display name', async () => {
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com', apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set() }),
    invalidate: () => {},
  };
  const service = new ShopifyAdminApiService(config, tokens, async () => response({ data: { shop: { name: null } } }));

  assert.equal(await service.getShopName(), null);
});

test('status preserves existing fields and includes the store name when available', async () => {
  const publicStatus = {
    configured: true,
    shopDomain: 'test-store.myshopify.com',
    apiVersion: '2026-10',
    authMode: 'client_credentials',
    syncAuthorizationConfigured: true,
  };
  const syncedAt = new Date('2026-10-24T12:00:00.000Z');
  const { ShopifySyncService } = require('../dist/shopify/shopify-sync.service.js');
  const service = new ShopifySyncService(
    { shopConnection: { findUnique: async () => ({ lastSyncedAt: syncedAt }) } },
    { getPublicStatus: () => publicStatus },
    { getShopName: async () => 'Snowpeak Outfitters' },
    {},
  );

  assert.deepEqual(await service.status(), {
    data: { ...publicStatus, storeName: 'Snowpeak Outfitters', lastSyncedAt: syncedAt },
  });
});

test('status returns a null store name when disconnected or Shopify name lookup fails', async () => {
  const { ShopifySyncService } = require('../dist/shopify/shopify-sync.service.js');
  const configured = {
    configured: true,
    shopDomain: 'test-store.myshopify.com',
    apiVersion: '2026-10',
    authMode: 'client_credentials',
    syncAuthorizationConfigured: true,
  };
  const disconnected = { ...configured, configured: false, shopDomain: null };
  let lookupCalls = 0;
  const prisma = { shopConnection: { findUnique: async () => ({ lastSyncedAt: null }) } };
  const adminApi = { getShopName: async () => { lookupCalls += 1; throw new Error('Shopify unavailable'); } };

  const disconnectedService = new ShopifySyncService(prisma, { getPublicStatus: () => disconnected }, adminApi, {});
  assert.deepEqual(await disconnectedService.status(), {
    data: { ...disconnected, storeName: null, lastSyncedAt: null },
  });
  assert.equal(lookupCalls, 0);

  const unavailableService = new ShopifySyncService(prisma, { getPublicStatus: () => configured }, adminApi, {});
  assert.deepEqual(await unavailableService.status(), {
    data: { ...configured, storeName: null, lastSyncedAt: null },
  });
  assert.equal(lookupCalls, 1);
});

test('maps Shopify permission errors without leaking upstream details', async () => {
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com', apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set() }),
    invalidate: () => {},
  };
  const service = new ShopifyAdminApiService(config, tokens, async () => response({
    errors: [{ message: 'private upstream detail', extensions: { code: 'ACCESS_DENIED' } }],
  }));
  const iterator = service.iterateOrders();
  await assert.rejects(iterator.next(), (error) => {
    assert.ok(error instanceof ShopifyIntegrationException);
    assert.equal(error.getStatus(), 403);
    assert.doesNotMatch(error.message, /private upstream detail/);
    return true;
  });
});

test('retries an HTTP rate limit using Retry-After', async () => {
  let calls = 0;
  const config = { getCredentials: () => ({
    shopDomain: 'test-store.myshopify.com', apiVersion: '2026-10',
  }) };
  const tokens = {
    getAccessToken: async () => ({ value: 'test-token', scopes: new Set(['read_orders']) }),
    invalidate: () => {},
  };
  const service = new ShopifyAdminApiService(config, tokens, async () => {
    calls += 1;
    if (calls === 1) return response({}, 429, { 'retry-after': '0' });
    return response(ordersPage([], false, null));
  });
  const orders = [];
  for await (const order of service.iterateOrders()) orders.push(order);
  assert.equal(calls, 2);
  assert.deepEqual(orders, []);
});

test('imports order, customer and decimal line-item values in one serializable transaction', async () => {
  const calls = { customers: [], orders: [], items: [], deleted: [], options: null };
  const tx = {
    order: {
      findUnique: async () => null,
      upsert: async (args) => { calls.orders.push(args); return { id: 'local-order-id' }; },
    },
    customer: {
      upsert: async (args) => { calls.customers.push(args); return { id: 'local-customer-id' }; },
    },
    orderItem: {
      upsert: async (args) => { calls.items.push(args); },
      deleteMany: async (args) => { calls.deleted.push(args); },
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      calls.options = options;
      return callback(tx);
    },
  };
  const service = new ShopifyOrderImportService(prisma);
  const remote = {
    ...orderNode('gid://shopify/Order/1', { items: [lineItem('gid://shopify/LineItem/1')] }),
    customer: {
      id: 'gid://shopify/Customer/4',
      firstName: null,
      lastName: null,
      displayName: 'Customer',
      defaultEmailAddress: null,
    },
    lineItems: [lineItem('gid://shopify/LineItem/1')],
  };

  const result = await service.importOrder('shop-id', remote);

  assert.equal(result, 'inserted');
  assert.equal(calls.options.isolationLevel, 'Serializable');
  assert.equal(calls.customers[0].create.email, null);
  assert.equal(calls.orders[0].create.totalAmount.toString(), '25');
  assert.equal(calls.orders[0].create.customerId, 'local-customer-id');
  assert.equal(calls.items[0].create.unitPrice.toString(), '12.5');
  assert.equal(calls.items[0].create.totalPrice.toString(), '20');
  assert.deepEqual(calls.deleted[0].where.shopifyLineItemId, { notIn: ['gid://shopify/LineItem/1'] });
});

test('skips older Shopify versions and does not overwrite newer local order data', async () => {
  let writes = 0;
  const tx = {
    customer: { upsert: async () => { writes += 1; } },
    orderItem: { upsert: async () => { writes += 1; }, deleteMany: async () => { writes += 1; } },
    order: {
      findUnique: async () => ({ id: 'local-order-id', shopifyUpdatedAt: new Date('2026-10-22T00:00:00.000Z') }),
      upsert: async () => { writes += 1; },
    },
  };
  const service = new ShopifyOrderImportService({ $transaction: async (callback) => callback(tx) });
  const remote = {
    ...orderNode('gid://shopify/Order/1'),
    lineItems: [],
  };

  assert.equal(await service.importOrder('shop-id', remote), 'unchanged');
  assert.equal(writes, 0);
});

test('requires a separately configured bearer secret for manual sync', () => {
  const secret = 'a-long-test-sync-secret-that-is-at-least-32-chars';
  const guard = new ShopifySyncAuthGuard({ getSyncSecret: () => secret });
  const context = (authorization) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  });
  assert.equal(guard.canActivate(context(`Bearer ${secret}`)), true);
  assert.throws(() => guard.canActivate(context('Bearer incorrect')), (error) => error.getStatus() === 401);
  const unconfigured = new ShopifySyncAuthGuard({ getSyncSecret: () => null });
  assert.throws(() => unconfigured.canActivate(context(undefined)), (error) => error.getStatus() === 503);
});

test('sync imports within allowed history and saves completion metadata after success', async () => {
  const calls = { updatedSince: undefined, imports: [], lastSyncedAt: null };
  const prisma = {
    shopConnection: {
      upsert: async () => ({ id: 'shop-id', lastSyncedAt: null }),
      findUnique: async () => ({ lastSyncedAt: null }),
      update: async ({ data }) => { calls.lastSyncedAt = data.lastSyncedAt; },
    },
  };
  const order = { id: 'gid://shopify/Order/1' };
  const adminApi = {
    getGrantedScopes: async () => new Set(['read_orders', 'read_customers']),
    iterateOrders: async function* (updatedSince) {
      calls.updatedSince = updatedSince;
      yield order;
    },
  };
  const config = { getCredentials: () => ({ shopDomain: 'test-store.myshopify.com' }) };
  const importer = { importOrder: async (_shopId, found) => {
    calls.imports.push(found);
    return 'inserted';
  } };
  const { ShopifySyncService } = require('../dist/shopify/shopify-sync.service.js');
  const service = new ShopifySyncService(prisma, config, adminApi, importer);

  const result = await service.syncOrders();

  assert.equal(calls.imports.length, 1);
  assert.equal(calls.imports[0], order);
  assert.ok(calls.updatedSince instanceof Date);
  assert.ok(Math.abs((Date.now() - calls.updatedSince.getTime()) - 60 * 24 * 60 * 60 * 1000) < 1000);
  assert.ok(calls.lastSyncedAt instanceof Date);
  assert.deepEqual(result.data.orders, { inserted: 1, updated: 0, unchanged: 0 });
  assert.equal(result.data.historyCoverage, 'last_60_days');
});

test('refuses to begin a sync when read_orders is not granted', async () => {
  let databaseTouched = false;
  const prisma = { shopConnection: { upsert: async () => { databaseTouched = true; } } };
  const adminApi = {
    getGrantedScopes: async () => new Set(['read_customers']),
    iterateOrders: async function* () {},
  };
  const config = { getCredentials: () => ({ shopDomain: 'test-store.myshopify.com' }) };
  const importer = { importOrder: async () => 'inserted' };
  const { ShopifySyncService } = require('../dist/shopify/shopify-sync.service.js');
  const service = new ShopifySyncService(prisma, config, adminApi, importer);

  await assert.rejects(service.syncOrders(), (error) => error.getStatus() === 403);
  assert.equal(databaseTouched, false);
});
