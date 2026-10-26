const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
  hashPattern,
  validDatabase,
  validUsername,
  validSecret,
  validShop,
  validShopField,
  makePasswordHash,
  replaceEnv,
  dedupeEnv,
} = require('../../scripts/setup.cjs');

test('setup password hash matches the backend scrypt format and parameters', () => {
  const password = Buffer.from('interview-password-123');
  const match = makePasswordHash(password).match(hashPattern);
  assert.ok(match);
  const actual = crypto.scryptSync(password, Buffer.from(match[1], 'hex'), 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  assert.equal(actual.toString('hex'), match[2]);
  password.fill(0);
});

test('setup accepts valid operator usernames and rejects empty or overlong names', () => {
  assert.equal(validUsername('operator'), true);
  assert.equal(validUsername(''), false);
  assert.equal(validUsername('x'.repeat(101)), false);
});

test('setup generates acceptable session secrets and rejects placeholders', () => {
  assert.equal(validSecret(crypto.randomBytes(32).toString('hex')), true);
  assert.equal(validSecret('replace_with_a_secret_that_is_long_enough_123456'), false);
});

test('setup validates PostgreSQL URLs without requiring a live connection', () => {
  assert.equal(validDatabase('postgresql://operator:local%40pass@localhost:5432/orders?schema=public'), true);
  assert.equal(validDatabase('https://example.com/private'), false);
  assert.equal(validDatabase('postgresql://replace_with_user:replace_with_password@localhost/db'), true);
});

test('setup reports absent Shopify configuration and recognizes invalid or valid settings', () => {
  assert.equal(validShop({}), false);
  assert.equal(validShopField('SHOPIFY_API_VERSION', '2025-01'), false);
  assert.equal(validShop({
    SHOPIFY_SHOP_DOMAIN: 'demo.myshopify.com',
    SHOPIFY_CLIENT_ID: 'client',
    SHOPIFY_CLIENT_SECRET: 'secret',
    SHOPIFY_API_VERSION: '2026-10',
    SHOPIFY_SYNC_SECRET: crypto.randomBytes(32).toString('hex'),
  }), true);
});

test('environment updates preserve comments and unrelated values while deduplicating keys', () => {
  const updated = replaceEnv(
    '# retained comment\nDATABASE_URL=old\nDATABASE_URL=duplicate\nUNRELATED=keep\n',
    'DATABASE_URL',
    'postgresql://u:p@localhost/db',
  );
  assert.match(updated, /# retained comment/);
  assert.equal((updated.match(/^DATABASE_URL=/gm) || []).length, 1);
  assert.match(updated, /UNRELATED=keep/);

  const deduped = dedupeEnv('# keep me\nSHOPIFY_SHOP_DOMAIN=old.myshopify.com\nANOTHER=value\nSHOPIFY_SHOP_DOMAIN=new.myshopify.com\n');
  assert.equal((deduped.match(/^SHOPIFY_SHOP_DOMAIN=/gm) || []).length, 1);
  assert.match(deduped, /SHOPIFY_SHOP_DOMAIN=new\.myshopify\.com/);
  assert.match(deduped, /# keep me/);
});
