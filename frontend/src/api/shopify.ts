import { fetchJson } from './client';
import type {
  ShopifyCustomersResponse,
  ShopifyProductsResponse,
  ShopifyStatusResponse,
  ShopsStatusResponse,
} from './types';

export async function fetchShopsStatus(): Promise<ShopsStatusResponse> {
  return fetchJson<ShopsStatusResponse>('/api/shops/status');
}

export async function fetchShopifyStatus(): Promise<ShopifyStatusResponse> {
  return fetchJson<ShopifyStatusResponse>('/api/shopify/status');
}

export async function fetchShopifyProducts(params: {
  search?: string;
  first?: number;
  after?: string;
} = {}): Promise<ShopifyProductsResponse> {
  const query = new URLSearchParams();
  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim());
  }
  if (params.first && params.first > 0) {
    query.set('first', String(params.first));
  }
  if (params.after && params.after.trim().length > 0) {
    query.set('after', params.after.trim());
  }
  const queryString = query.toString();
  const url = queryString ? `/api/shopify/products?${queryString}` : '/api/shopify/products';
  return fetchJson<ShopifyProductsResponse>(url);
}

export async function fetchShopifyCustomers(params: {
  search: string;
  first?: number;
  after?: string;
}): Promise<ShopifyCustomersResponse> {
  const query = new URLSearchParams();
  query.set('search', params.search.trim());
  if (params.first && params.first > 0) {
    query.set('first', String(params.first));
  }
  if (params.after && params.after.trim().length > 0) {
    query.set('after', params.after.trim());
  }
  return fetchJson<ShopifyCustomersResponse>(`/api/shopify/customers?${query.toString()}`);
}
