import { fetchJson } from './client';
import type {
  OrderDetailResponse,
  OrdersFilterParams,
  OrdersResponse,
} from './types';

export async function fetchOrders(params: OrdersFilterParams = {}): Promise<OrdersResponse> {
  const query = new URLSearchParams();

  if (params.page && params.page > 0) {
    query.set('page', String(params.page));
  }
  if (params.pageSize && params.pageSize > 0) {
    query.set('pageSize', String(params.pageSize));
  }
  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim());
  }
  if (params.financialStatus && params.financialStatus.trim().length > 0 && params.financialStatus !== 'ALL') {
    query.set('financialStatus', params.financialStatus.trim());
  }
  if (params.fulfillmentStatus && params.fulfillmentStatus.trim().length > 0 && params.fulfillmentStatus !== 'ALL') {
    query.set('fulfillmentStatus', params.fulfillmentStatus.trim());
  }
  if (params.dateFrom && params.dateFrom.trim().length > 0) {
    query.set('dateFrom', params.dateFrom.trim());
  }
  if (params.dateTo && params.dateTo.trim().length > 0) {
    query.set('dateTo', params.dateTo.trim());
  }
  if (params.sort && (params.sort === 'newest' || params.sort === 'oldest')) {
    query.set('sort', params.sort);
  }

  const queryString = query.toString();
  const url = queryString ? `/api/orders?${queryString}` : '/api/orders';

  return fetchJson<OrdersResponse>(url);
}

export async function fetchOrderById(id: string): Promise<OrderDetailResponse> {
  return fetchJson<OrderDetailResponse>(`/api/orders/${encodeURIComponent(id)}`);
}

export async function createOrder(
  payload: {
    items: Array<{ variantId: string; quantity: number }>;
    customerId?: string;
    note?: string;
  },
  idempotencyKey: string,
  csrfToken: string,
): Promise<OrderDetailResponse> {
  const body: {
    items: Array<{ variantId: string; quantity: number }>;
    customerId?: string;
    note?: string;
  } = {
    items: payload.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
  };

  if (payload.customerId && payload.customerId.trim().length > 0) {
    body.customerId = payload.customerId.trim();
  }
  if (payload.note && payload.note.trim().length > 0) {
    body.note = payload.note.trim();
  }

  return fetchJson<OrderDetailResponse>('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export async function fetchOrderCreationStatus(
  idempotencyKey: string,
): Promise<{
  data: {
    status: string;
    orderId: string | null;
    shopifyOrderId: string | null;
    errorCode: string | null;
  };
}> {
  return fetchJson<{
    data: {
      status: string;
      orderId: string | null;
      shopifyOrderId: string | null;
      errorCode: string | null;
    };
  }>(`/api/orders/creation-requests/${encodeURIComponent(idempotencyKey)}`);
}
