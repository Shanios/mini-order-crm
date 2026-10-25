const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ShopStatusService } = require('../dist/shopify/shop-status.service.js');

test('returns configured shop metadata without credential fields', async () => {
  const shop = {
    id: 'shop-1',
    shopDomain: 'example.myshopify.com',
    lastSyncedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  let query;
  const service = new ShopStatusService({
    shopConnection: {
      findMany: async (args) => {
        query = args;
        return [shop];
      },
    },
  });

  const result = await service.listConnections();

  assert.deepEqual(result, { data: { configured: true, shops: [shop] } });
  assert.deepEqual(query.select, {
    id: true,
    shopDomain: true,
    lastSyncedAt: true,
    createdAt: true,
    updatedAt: true,
  });
  assert.equal('accessToken' in result.data.shops[0], false);
});

test('reports no configured shops with an empty list', async () => {
  const service = new ShopStatusService({
    shopConnection: { findMany: async () => [] },
  });

  assert.deepEqual(await service.listConnections(), { data: { configured: false, shops: [] } });
});
