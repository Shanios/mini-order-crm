export const SHOPIFY_FETCH = Symbol('SHOPIFY_FETCH');

export type ShopifyFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const shopifyFetchProvider = {
  provide: SHOPIFY_FETCH,
  useFactory: (): ShopifyFetch => globalThis.fetch.bind(globalThis),
};
