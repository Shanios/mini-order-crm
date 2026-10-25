const { resolve } = require('node:path');
const { config } = require('dotenv');

config({ path: resolve(__dirname, '..', '..', '.env'), override: true, quiet: true });

const callback = process.argv[2];
if (!callback) fail('Usage: npm run webhooks:register -- https://PUBLIC-HOST/api/webhooks/shopify');
let callbackUrl;
try { callbackUrl = new URL(callback); } catch { fail('Callback URL must be a valid public HTTPS URL.'); }
if (callbackUrl.protocol !== 'https:' || callbackUrl.username || callbackUrl.password
  || callbackUrl.pathname !== '/api/webhooks/shopify' || callbackUrl.search || callbackUrl.hash
  || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(callbackUrl.hostname)) {
  fail('Use a public HTTPS callback ending exactly in /api/webhooks/shopify.');
}

const { SHOPIFY_SHOP_DOMAIN: shop, SHOPIFY_CLIENT_ID: clientId, SHOPIFY_CLIENT_SECRET: clientSecret, SHOPIFY_API_VERSION: version } = process.env;
if (!shop || !clientId || !clientSecret || version !== '2026-10') {
  fail('Configure SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_API_VERSION=2026-10 in the root .env.');
}

async function main() {
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!tokenResponse.ok) fail('Shopify token request failed. Check the app credentials and store installation.');
  const token = (await tokenResponse.json()).access_token;
  if (!token) fail('Shopify token response was invalid.');

  const endpoint = `https://${shop}/admin/api/${version}/graphql.json`;
  const gql = async (query, variables = {}) => {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) fail('Shopify Admin API request failed.');
    const body = await response.json();
    if (body.errors?.length) fail('Shopify Admin API returned a GraphQL error.');
    return body.data;
  };

  const subscriptions = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const current = await gql(`query ExistingWebhookSubscriptions($after: String) {
      webhookSubscriptions(first: 100, after: $after) {
        nodes { id topic uri }
        pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    const connection = current?.webhookSubscriptions;
    if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean') {
      fail('Shopify returned an invalid webhook subscription list.');
    }
    subscriptions.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    if (hasNextPage && (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after)) {
      fail('Shopify webhook subscription pagination did not advance.');
    }
    after = connection.pageInfo.endCursor;
  }
  for (const [topic, enumName] of [['orders/create', 'ORDERS_CREATE'], ['orders/updated', 'ORDERS_UPDATED']]) {
    if (subscriptions.some((subscription) => subscription.topic === enumName && subscription.uri === callbackUrl.href)) {
      process.stdout.write(`${topic}: already registered for this callback\n`);
      continue;
    }
    const data = await gql(`mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }`, { topic: enumName, input: { uri: callbackUrl.href } });
    const result = data?.webhookSubscriptionCreate;
    if (result?.userErrors?.length || !result?.webhookSubscription?.id) {
      fail(`Could not register ${topic}. Check the app's webhook permissions and Shopify user errors.`);
    }
    process.stdout.write(`${topic}: registered\n`);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch(() => fail('Webhook registration failed. Check network access and Shopify app configuration.'));
