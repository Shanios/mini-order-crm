import { Inject, Injectable } from '@nestjs/common';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyFetch, SHOPIFY_FETCH } from './shopify-fetch';
import { ShopifyIntegrationException } from './shopify.errors';
import { ShopifyTokenService } from './shopify-token.service';

const MAX_GRAPHQL_ATTEMPTS = 5;
const ORDER_PAGE_SIZE = 10;
const INITIAL_LINE_ITEM_PAGE_SIZE = 20;
const LINE_ITEM_PAGE_SIZE = 250;

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface Connection<T> {
  edges: Array<{ cursor: string; node: T }>;
  pageInfo: PageInfo;
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  originalUnitPriceSet: { shopMoney: { amount: string } };
  discountedTotalSet: { shopMoney: { amount: string } };
  product: { id: string } | null;
  variant: { id: string } | null;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  email: string | null;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    defaultEmailAddress: { emailAddress: string } | null;
  } | null;
  lineItems: ShopifyLineItem[];
}

interface OrdersQueryData {
  orders: Connection<Omit<ShopifyOrder, 'lineItems'> & { lineItems: Connection<ShopifyLineItem> }>;
}

interface MoreLineItemsData {
  order: { lineItems: Connection<ShopifyLineItem> } | null;
}

interface SingleOrderData {
  order: Omit<ShopifyOrder, 'lineItems'> & { lineItems: Connection<ShopifyLineItem> } | null;
}

interface CurrentAppInstallationScopesData {
  currentAppInstallation: { accessScopes: Array<{ handle: string }> } | null;
}

interface ShopDisplayNameData {
  shop: { name: string | null } | null;
}

export interface ShopifyProductVariantSearchResult {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  product: { id: string; title: string; status: string } | null;
}

interface ProductVariantsData {
  shop: { currencyCode: string };
  productVariants: Connection<ShopifyProductVariantSearchResult>;
}

export interface ShopifyCustomerSearchResult {
  id: string;
  displayName: string;
  email: string | null;
}

interface CustomersData {
  customers: Connection<{ id: string; displayName: string; defaultEmailAddress: { emailAddress: string } | null }>;
}

interface VariantAvailabilityData {
  nodes: Array<{
    __typename: string;
    id: string;
    availableForSale?: boolean;
    product?: { id: string; status: string } | null;
  } | null>;
}

interface CustomerAvailabilityData {
  node: { __typename: string; id: string } | null;
}

interface OrderCreateData {
  orderCreate: {
    order: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export interface OrderCreateInput {
  lineItems: Array<{ variantId: string; quantity: number }>;
  customerId?: string;
  note?: string;
}

export interface ShopifyOrderCreateOutcome {
  orderId: string | null;
  userErrors: Array<{ field: string[] | null; message: string }>;
}

interface GraphqlPayload<T> {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  extensions?: {
    cost?: {
      requestedQueryCost?: number;
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
}

const LINE_ITEM_FIELDS = `
  edges {
    cursor
    node {
      id
      title
      variantTitle
      sku
      quantity
      originalUnitPriceSet { shopMoney { amount } }
      discountedTotalSet { shopMoney { amount } }
      product { id }
      variant { id }
    }
  }
  pageInfo { hasNextPage endCursor }
`;

@Injectable()
export class ShopifyAdminApiService {
  constructor(
    private readonly config: ShopifyConfigService,
    private readonly tokens: ShopifyTokenService,
    @Inject(SHOPIFY_FETCH) private readonly fetcher: ShopifyFetch,
  ) {}

  get shopDomain(): string {
    return this.config.getCredentials().shopDomain;
  }

  async getGrantedScopes(): Promise<Set<string>> {
    const data = await this.graphql<CurrentAppInstallationScopesData>(CURRENT_APP_INSTALLATION_SCOPES_QUERY, {});
    const scopes = data.currentAppInstallation?.accessScopes;
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope.handle !== 'string')) {
      throw new ShopifyIntegrationException(502, 'SHOPIFY_RESPONSE_INVALID', 'Shopify returned an invalid installation-scope response.');
    }
    return new Set(scopes.map((scope) => scope.handle));
  }

  async getShopName(): Promise<string | null> {
    const data = await this.graphql<ShopDisplayNameData>(SHOP_DISPLAY_NAME_QUERY, {});
    const name = data.shop?.name?.trim();
    return name || null;
  }

  async searchProductVariants(search: string, first: number, after?: string): Promise<{
    nodes: ShopifyProductVariantSearchResult[];
    currencyCode: string;
    pageInfo: PageInfo;
  }> {
    const data = await this.graphql<ProductVariantsData>(PRODUCT_VARIANTS_QUERY, {
      search: toShopifySearch(search), first, after: after ?? null,
    });
    return {
      nodes: data.productVariants.edges.map(({ node }) => node),
      currencyCode: data.shop.currencyCode,
      pageInfo: data.productVariants.pageInfo,
    };
  }

  async searchCustomers(search: string, first: number, after?: string): Promise<{
    nodes: ShopifyCustomerSearchResult[];
    pageInfo: PageInfo;
  }> {
    const data = await this.graphql<CustomersData>(CUSTOMERS_QUERY, {
      search: toShopifySearch(search), first, after: after ?? null,
    });
    return {
      nodes: data.customers.edges.map(({ node }) => ({
        id: node.id,
        displayName: node.displayName,
        email: node.defaultEmailAddress?.emailAddress ?? null,
      })),
      pageInfo: data.customers.pageInfo,
    };
  }

  async validateOrderVariants(ids: string[]): Promise<Set<string>> {
    const data = await this.graphql<VariantAvailabilityData>(ORDER_VARIANTS_QUERY, { ids });
    return new Set((data.nodes ?? []).flatMap((node) => (
      node?.__typename === 'ProductVariant'
        && node.availableForSale === true
        && node.product?.status === 'ACTIVE'
        ? [node.id]
        : []
    )));
  }

  async customerExists(id: string): Promise<boolean> {
    const data = await this.graphql<CustomerAvailabilityData>(ORDER_CUSTOMER_QUERY, { id });
    return data.node?.__typename === 'Customer' && data.node.id === id;
  }

  /** Sends orderCreate exactly once. A network error can have an unknown outcome. */
  async createOrder(input: OrderCreateInput): Promise<ShopifyOrderCreateOutcome> {
    const credentials = this.config.getCredentials();
    const url = `https://${credentials.shopDomain}/admin/api/${credentials.apiVersion}/graphql.json`;
    const auth = await this.tokens.getAccessToken();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': auth.value },
        body: JSON.stringify({
          query: ORDER_CREATE_MUTATION,
          variables: {
            order: {
              lineItems: input.lineItems,
              ...(input.customerId ? { customer: { toAssociate: { id: input.customerId } } } : {}),
              ...(input.note ? { note: input.note } : {}),
            },
          },
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ShopifyIntegrationException(504, 'SHOPIFY_ORDER_OUTCOME_UNKNOWN', 'Shopify may have received the order request. Retry with the same idempotency key to check its status.');
    }

    const payload = await readJson<GraphqlPayload<OrderCreateData>>(response);
    if (response.status === 429) {
      throw new ShopifyIntegrationException(503, 'SHOPIFY_RATE_LIMITED', 'Shopify rate-limited the order request. Try again later with a new idempotency key.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ShopifyIntegrationException(403, 'SHOPIFY_PERMISSION_DENIED', 'Shopify denied permission to create orders. Confirm the write_orders scope and app installation.');
    }
    if (payload?.errors?.some((error) => error.extensions?.code === 'THROTTLED')) {
      throw new ShopifyIntegrationException(503, 'SHOPIFY_RATE_LIMITED', 'Shopify rate-limited the order request. Try again later with a new idempotency key.');
    }
    const result = payload?.data?.orderCreate;
    if (!response.ok && response.status < 500) {
      if (response.status >= 300 && response.status < 400) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_ORDER_OUTCOME_UNKNOWN', 'Shopify redirected the order request without confirming its result.');
      }
      throw new ShopifyIntegrationException(502, 'SHOPIFY_API_ERROR', 'Shopify rejected the order request.');
    }
    if (result?.order?.id) {
      return { orderId: result.order.id, userErrors: result.userErrors ?? [] };
    }
    const knownPreExecutionErrors = Boolean(payload?.errors?.length) && payload?.errors?.every((error) => (
      ['GRAPHQL_VALIDATION_FAILED', 'GRAPHQL_PARSE_FAILED', 'ACCESS_DENIED', 'INSUFFICIENT_SCOPE'].includes(error.extensions?.code ?? '')
    ));
    if (knownPreExecutionErrors) {
      throw new ShopifyIntegrationException(
        payload?.errors?.some((error) => ['ACCESS_DENIED', 'INSUFFICIENT_SCOPE'].includes(error.extensions?.code ?? '')) ? 403 : 400,
        payload?.errors?.some((error) => ['ACCESS_DENIED', 'INSUFFICIENT_SCOPE'].includes(error.extensions?.code ?? '')) ? 'SHOPIFY_PERMISSION_DENIED' : 'SHOPIFY_GRAPHQL_ERROR',
        payload?.errors?.some((error) => ['ACCESS_DENIED', 'INSUFFICIENT_SCOPE'].includes(error.extensions?.code ?? ''))
          ? 'Shopify denied permission to create orders. Confirm the write_orders scope and app installation.'
          : 'Shopify rejected the order request before execution.',
      );
    }
    if (!response.ok || !payload || payload.errors?.length || !result) {
      throw new ShopifyIntegrationException(502, 'SHOPIFY_ORDER_OUTCOME_UNKNOWN', 'Shopify did not confirm the order result. Retry with the same idempotency key to check its status.');
    }
    return { orderId: result.order?.id ?? null, userErrors: result.userErrors ?? [] };
  }

  async *iterateOrders(updatedSince?: Date): AsyncGenerator<ShopifyOrder> {
    let after: string | null = null;
    const query = updatedSince
      ? `status:any updated_at:>='${updatedSince.toISOString()}'`
      : 'status:any';

    while (true) {
      const data: OrdersQueryData = await this.graphql<OrdersQueryData>(ORDERS_QUERY, { after, query });
      const connection: OrdersQueryData['orders'] = data.orders;

      for (const edge of connection.edges) {
        const order = edge.node;
        const lineItems: ShopifyLineItem[] = order.lineItems.edges.map((edge) => edge.node);
        let lineItemsAfter = order.lineItems.pageInfo.endCursor;
        let hasMoreLineItems = order.lineItems.pageInfo.hasNextPage;

        while (hasMoreLineItems) {
          if (!lineItemsAfter) {
            throw new ShopifyIntegrationException(502, 'SHOPIFY_PAGINATION_INVALID', 'Shopify returned an invalid line-item cursor.');
          }
          const more = await this.graphql<MoreLineItemsData>(ORDER_LINE_ITEMS_QUERY, {
            id: order.id,
            after: lineItemsAfter,
          });
          if (!more.order) {
            throw new ShopifyIntegrationException(502, 'SHOPIFY_ORDER_UNAVAILABLE', 'Shopify no longer returned an order during line-item pagination.');
          }

          const page = more.order.lineItems;
          lineItems.push(...page.edges.map(({ node }) => node));
          if (page.pageInfo.hasNextPage && page.pageInfo.endCursor === lineItemsAfter) {
            throw new ShopifyIntegrationException(502, 'SHOPIFY_PAGINATION_STALLED', 'Shopify line-item pagination did not advance.');
          }
          lineItemsAfter = page.pageInfo.endCursor;
          hasMoreLineItems = page.pageInfo.hasNextPage;
        }

        yield { ...order, lineItems };
      }

      if (!connection.pageInfo.hasNextPage) return;
      const next: string | null = connection.pageInfo.endCursor;
      if (!next || next === after) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_PAGINATION_STALLED', 'Shopify order pagination did not advance.');
      }
      after = next;
    }
  }

  async getOrder(id: string): Promise<ShopifyOrder | null> {
    const data = await this.graphql<SingleOrderData>(SINGLE_ORDER_QUERY, { id });
    if (!data.order) return null;

    const order = data.order;
    const lineItems = order.lineItems.edges.map(({ node }) => node);
    let after = order.lineItems.pageInfo.endCursor;
    while (order.lineItems.pageInfo.hasNextPage) {
      if (!after) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_PAGINATION_INVALID', 'Shopify returned an invalid line-item cursor.');
      }
      const more = await this.graphql<MoreLineItemsData>(ORDER_LINE_ITEMS_QUERY, { id, after });
      if (!more.order) return null;
      const page = more.order.lineItems;
      lineItems.push(...page.edges.map(({ node }) => node));
      if (page.pageInfo.hasNextPage && page.pageInfo.endCursor === after) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_PAGINATION_STALLED', 'Shopify line-item pagination did not advance.');
      }
      after = page.pageInfo.endCursor;
      order.lineItems.pageInfo.hasNextPage = page.pageInfo.hasNextPage;
    }
    return { ...order, lineItems };
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const credentials = this.config.getCredentials();
    const url = `https://${credentials.shopDomain}/admin/api/${credentials.apiVersion}/graphql.json`;
    let lastStatus = 0;

    for (let attempt = 0; attempt < MAX_GRAPHQL_ATTEMPTS; attempt += 1) {
      const auth = await this.tokens.getAccessToken();
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': auth.value,
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        if (attempt + 1 < MAX_GRAPHQL_ATTEMPTS) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw new ShopifyIntegrationException(502, 'SHOPIFY_NETWORK_ERROR', 'Could not reach the Shopify Admin API.');
      }

      if (response.status === 401 && attempt === 0) {
        this.tokens.invalidate(auth.value);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        lastStatus = response.status;
        if (attempt + 1 < MAX_GRAPHQL_ATTEMPTS) {
          await delay(retryAfterMs(response.headers.get('retry-after')) ?? backoffMs(attempt));
          continue;
        }
        break;
      }
      if (response.status === 401 || response.status === 403) {
        throw permissionDenied();
      }

      const payload = await readJson<GraphqlPayload<T>>(response);
      if (!response.ok) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_API_ERROR', 'Shopify rejected the Admin API request.');
      }
      if (!payload) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_RESPONSE_INVALID', 'Shopify returned an invalid GraphQL response.');
      }

      const errors = payload.errors ?? [];
      const errorCodes = errors.map((error) => error.extensions?.code ?? '');
      if (errorCodes.includes('ACCESS_DENIED') || errorCodes.includes('INSUFFICIENT_SCOPE')) {
        throw permissionDenied();
      }
      if (errorCodes.includes('THROTTLED')) {
        if (attempt + 1 < MAX_GRAPHQL_ATTEMPTS) {
          await delay(graphqlThrottleDelay(payload) ?? backoffMs(attempt));
          continue;
        }
        throw new ShopifyIntegrationException(503, 'SHOPIFY_RATE_LIMITED', 'Shopify rate-limited this sync. Retry it later.');
      }
      if (errors.length) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_GRAPHQL_ERROR', 'Shopify returned a GraphQL error.');
      }
      if (!payload.data) {
        throw new ShopifyIntegrationException(502, 'SHOPIFY_RESPONSE_INVALID', 'Shopify returned an invalid GraphQL response.');
      }
      return payload.data;
    }

    throw new ShopifyIntegrationException(
      lastStatus === 429 ? 503 : 502,
      lastStatus === 429 ? 'SHOPIFY_RATE_LIMITED' : 'SHOPIFY_API_UNAVAILABLE',
      'Shopify is temporarily unavailable. Retry the request later.',
    );
  }
}

const ORDERS_QUERY = `
  query OrdersPage($after: String, $query: String) {
    orders(first: ${ORDER_PAGE_SIZE}, after: $after, query: $query, sortKey: UPDATED_AT, reverse: false) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          updatedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          email
          customer {
            id
            firstName
            lastName
            displayName
            defaultEmailAddress { emailAddress }
          }
          lineItems(first: ${INITIAL_LINE_ITEM_PAGE_SIZE}) {
            ${LINE_ITEM_FIELDS}
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_LINE_ITEMS_QUERY = `
  query OrderLineItems($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: ${LINE_ITEM_PAGE_SIZE}, after: $after) {
        ${LINE_ITEM_FIELDS}
      }
    }
  }
`;

const SINGLE_ORDER_QUERY = `
  query WebhookOrder($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      updatedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      email
      customer {
        id
        firstName
        lastName
        displayName
        defaultEmailAddress { emailAddress }
      }
      lineItems(first: ${INITIAL_LINE_ITEM_PAGE_SIZE}) { ${LINE_ITEM_FIELDS} }
    }
  }
`;

const CURRENT_APP_INSTALLATION_SCOPES_QUERY = `
  query GrantedScopes {
    currentAppInstallation {
      accessScopes { handle }
    }
  }
`;

const SHOP_DISPLAY_NAME_QUERY = `
  query ShopDisplayName {
    shop {
      name
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = `
  query SearchProductVariants($search: String!, $first: Int!, $after: String) {
    shop { currencyCode }
    productVariants(first: $first, after: $after, query: $search, sortKey: TITLE) {
      edges { cursor node {
        id title sku price availableForSale selectedOptions { name value }
        product { id title status }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query SearchCustomers($search: String!, $first: Int!, $after: String) {
    customers(first: $first, after: $after, query: $search, sortKey: NAME) {
      edges { cursor node { id displayName defaultEmailAddress { emailAddress } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_VARIANTS_QUERY = `
  query ValidateOrderVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on ProductVariant { id availableForSale product { id status } }
    }
  }
`;

const ORDER_CUSTOMER_QUERY = `
  query ValidateOrderCustomer($id: ID!) {
    node(id: $id) { __typename ... on Customer { id } }
  }
`;

const ORDER_CREATE_MUTATION = `
  mutation CreateCrmOrder($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order { id }
      userErrors { field message }
    }
  }
`;

function toShopifySearch(search: string): string {
  return search ? `"${search.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : '';
}

function permissionDenied(): ShopifyIntegrationException {
  return new ShopifyIntegrationException(
    403,
    'SHOPIFY_PERMISSION_DENIED',
      'Shopify denied access. Confirm read_orders, read_customers, and any required protected customer data approval; older history also requires read_all_orders approval.',
  );
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function graphqlThrottleDelay<T>(payload: GraphqlPayload<T>): number | null {
  const throttle = payload.extensions?.cost?.throttleStatus;
  const requested = payload.extensions?.cost?.requestedQueryCost;
  if (!throttle || requested === undefined || throttle.currentlyAvailable === undefined || !throttle.restoreRate) {
    return null;
  }
  const deficit = Math.max(0, requested - throttle.currentlyAvailable);
  return Math.min(Math.max(1000, Math.ceil((deficit / throttle.restoreRate) * 1000)), 30_000);
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 30_000));
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, Math.min(timestamp - Date.now(), 30_000));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
