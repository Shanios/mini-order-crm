export interface CustomerSummary {
  id: string;
  shopId: string;
  shopifyCustomerId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItem {
  id: string;
  shopId: string;
  shopifyOrderId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string;
  totalAmount: string;
  currencyCode: string;
  orderDate: string;
  cancelledAt: string | null;
  shopifyUpdatedAt: string;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary | null;
  _count?: {
    items: number;
  };
}

export interface OrderItem {
  id: string;
  orderId: string;
  shopifyLineItemId: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface OrderDetail extends OrderListItem {
  items: OrderItem[];
}

export interface OrdersMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface OrdersResponse {
  data: OrderListItem[];
  meta: OrdersMeta;
}

export interface OrderDetailResponse {
  data: OrderDetail;
}

export interface ShopConnection {
  id: string;
  shopDomain: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopsStatusResponse {
  data: {
    configured: boolean;
    shops: ShopConnection[];
  };
}

export interface ShopifyStatusResponse {
  data: {
    configured: boolean;
    shopDomain: string | null;
    storeName: string | null;
    apiVersion: string;
    authMode: 'client_credentials';
    syncAuthorizationConfigured: boolean;
    lastSyncedAt: string | null;
  };
}

export interface OrdersFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'newest' | 'oldest';
}

export interface ApiErrorResponse {
  statusCode?: number;
  code?: string;
  message?: string;
  error?:
    | string
    | {
        code?: string;
        message?: string;
        details?: unknown;
      };
  details?: unknown;
}

export interface AuthSession {
  authenticated: boolean;
  username?: string;
  csrfToken?: string;
  expiresAt?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface ShopifyProductVariantItem {
  id: string;
  title: string;
  productId: string | null;
  productStatus: string | null;
  variantId: string;
  variantTitle: string;
  sku: string | null;
  price: string | null;
  currencyCode: string;
  available: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyProductsResponse {
  data: ShopifyProductVariantItem[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface ShopifyCustomerSearchResult {
  id: string;
  displayName: string;
  email: string | null;
}

export interface ShopifyCustomersResponse {
  data: {
    nodes: ShopifyCustomerSearchResult[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface CreateOrderItemInput {
  variantId: string;
  quantity: number;
}

export interface CreateOrderPayload {
  items: CreateOrderItemInput[];
  customerId?: string;
  note?: string;
}

export interface OrderCreationStatus {
  status: 'creating' | 'completed' | 'uncertain' | 'sync_pending' | 'rejected' | string;
  orderId: string | null;
  shopifyOrderId: string | null;
  errorCode: string | null;
}

export interface OrderCreationStatusResponse {
  data: OrderCreationStatus;
}
