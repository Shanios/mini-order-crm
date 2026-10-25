import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import { createOrder, fetchOrderCreationStatus } from '../api/orders';
import { fetchShopifyProducts, fetchShopifyCustomers } from '../api/shopify';
import { ApiError } from '../api/client';
import type {
  ShopifyProductVariantItem,
  ShopifyCustomerSearchResult,
} from '../api/types';
import { CurrencyText } from '../components/CurrencyText';
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Search,
  User,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  X,
} from 'lucide-react';

interface OrderLineItem {
  variant: ShopifyProductVariantItem;
  quantity: number;
}

export function OrderCreatePage() {
  const { csrfToken } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<ShopifyCustomerSearchResult | null>(null);
  const [orderNote, setOrderNote] = useState('');

  // Product Search State
  const [productQuery, setProductQuery] = useState('');
  const [debouncedProductQuery, setDebouncedProductQuery] = useState('');
  const [products, setProducts] = useState<ShopifyProductVariantItem[]>([]);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Customer Search State
  const [customerQuery, setCustomerQuery] = useState('');
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<ShopifyCustomerSearchResult[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);

  // Submission & Idempotency State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submissionOutcome, setSubmissionOutcome] = useState<{
    type: 'uncertain' | 'sync_pending' | 'rejected' | 'error';
    message: string;
    code?: string;
    details?: unknown;
  } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusCheckResult, setStatusCheckResult] = useState<string | null>(null);

  // Debounce product query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedProductQuery(productQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [productQuery]);

  // Debounce customer query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCustomerQuery(customerQuery);
    }, 350);
    return () => clearTimeout(handler);
  }, [customerQuery]);

  // Load products when query changes
  useEffect(() => {
    let isCancelled = false;
    async function loadProducts() {
      setIsProductsLoading(true);
      setProductSearchError(null);
      try {
        const res = await fetchShopifyProducts({
          search: debouncedProductQuery.trim() || undefined,
          first: 20,
        });
        if (!isCancelled) {
          setProducts(res.data);
          setHasNextPage(res.pageInfo.hasNextPage);
          setEndCursor(res.pageInfo.endCursor);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof ApiError ? err.message : 'Failed to load Shopify products.';
          setProductSearchError(msg);
        }
      } finally {
        if (!isCancelled) setIsProductsLoading(false);
      }
    }

    void loadProducts();
    return () => {
      isCancelled = true;
    };
  }, [debouncedProductQuery]);

  // Load more products pagination
  const handleLoadMoreProducts = async () => {
    if (!hasNextPage || !endCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchShopifyProducts({
        search: debouncedProductQuery.trim() || undefined,
        first: 20,
        after: endCursor,
      });
      setProducts((prev) => [...prev, ...res.data]);
      setHasNextPage(res.pageInfo.hasNextPage);
      setEndCursor(res.pageInfo.endCursor);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load more products.';
      setProductSearchError(msg);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Load customers when customer query changes
  useEffect(() => {
    let isCancelled = false;
    const trimmed = debouncedCustomerQuery.trim();

    if (trimmed.length < 2) {
      setCustomers([]);
      setCustomerSearchError(null);
      setIsCustomersLoading(false);
      return;
    }

    async function loadCustomers() {
      setIsCustomersLoading(true);
      setCustomerSearchError(null);
      try {
        const res = await fetchShopifyCustomers({ search: trimmed, first: 10 });
        if (!isCancelled) {
          setCustomers(res.data.nodes || []);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof ApiError ? err.message : 'Customer lookup failed.';
          setCustomerSearchError(msg);
        }
      } finally {
        if (!isCancelled) setIsCustomersLoading(false);
      }
    }

    void loadCustomers();
    return () => {
      isCancelled = true;
    };
  }, [debouncedCustomerQuery]);

  // Summary calculations
  const totalQuantity = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [lineItems]);

  const estimatedSubtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      const p = parseFloat(item.variant.price || '0');
      return acc + (isNaN(p) ? 0 : p * item.quantity);
    }, 0);
  }, [lineItems]);

  const shopCurrency = lineItems[0]?.variant.currencyCode || 'USD';

  // Line Items Controls
  const handleAddVariant = (variant: ShopifyProductVariantItem) => {
    if (!variant.available) return;
    setSubmissionOutcome(null);
    setLineItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.variant.id === variant.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const nextQty = Math.min(1000, updated[existingIndex].quantity + 1);
        updated[existingIndex] = { ...updated[existingIndex], quantity: nextQty };
        return updated;
      }
      return [...prev, { variant, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (variantId: string, quantity: number) => {
    setSubmissionOutcome(null);
    const validQty = Math.max(1, Math.min(1000, Math.floor(quantity)));
    setLineItems((prev) =>
      prev.map((item) => (item.variant.id === variantId ? { ...item, quantity: validQty } : item)),
    );
  };

  const handleRemoveItem = (variantId: string) => {
    setSubmissionOutcome(null);
    setLineItems((prev) => prev.filter((item) => item.variant.id !== variantId));
  };

  // Helper to generate a compliant idempotency key
  const generateNewIdempotencyKey = () => {
    const randomHex = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `ord-sub-${Date.now().toString(36)}-${randomHex}`;
  };

  // Submit Order to Backend
  const handlePerformSubmit = async (keyToUse: string) => {
    if (!csrfToken) {
      setSubmissionOutcome({
        type: 'error',
        message: 'Your authenticated session lacks a valid CSRF token. Please log in again.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusCheckResult(null);

    const payload = {
      items: lineItems.map((item) => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      })),
      ...(selectedCustomer ? { customerId: selectedCustomer.id } : {}),
      ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
    };

    try {
      const res = await createOrder(payload, keyToUse, csrfToken);
      setIsConfirmModalOpen(false);
      navigate(`/orders/${res.data.id}`);
    } catch (err: unknown) {
      setIsConfirmModalOpen(false);
      if (err instanceof ApiError) {
        if (err.status === 503 || err.code === 'ORDER_CREATION_OUTCOME_UNKNOWN') {
          setSubmissionOutcome({
            type: 'uncertain',
            message:
              'Shopify may have received this order request, but the outcome could not be confirmed. Use the status recovery button below to check its status; do not create a duplicate order.',
            code: err.code,
          });
        } else if (err.status === 503 || err.code === 'ORDER_CREATED_SYNC_PENDING') {
          setSubmissionOutcome({
            type: 'sync_pending',
            message:
              'Shopify created the order successfully, but CRM synchronization is still pending. Retry synchronization below.',
            code: err.code,
          });
        } else if (err.code === 'SHOPIFY_ORDER_REJECTED') {
          setSubmissionOutcome({
            type: 'rejected',
            message: err.message || 'Shopify rejected the order creation request.',
            code: err.code,
            details: err.details,
          });
        } else if (err.status === 401) {
          setSubmissionOutcome({
            type: 'error',
            message: 'Your session has expired. Please sign in again in a new tab.',
            code: 'UNAUTHORIZED',
          });
        } else if (err.status === 403) {
          setSubmissionOutcome({
            type: 'error',
            message: 'A CSRF validation error occurred. Please refresh your session.',
            code: 'FORBIDDEN',
          });
        } else {
          setSubmissionOutcome({
            type: 'error',
            message: err.message || 'Failed to submit order to Shopify.',
            code: err.code,
            details: err.details,
          });
        }
      } else {
        setSubmissionOutcome({
          type: 'error',
          message: 'A network or unexpected error occurred during submission.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) return;
    // Ensure an idempotency key is established for this deliberate submission
    if (!idempotencyKey) {
      const newKey = generateNewIdempotencyKey();
      setIdempotencyKey(newKey);
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSubmit = () => {
    const key = idempotencyKey || generateNewIdempotencyKey();
    if (!idempotencyKey) setIdempotencyKey(key);
    void handlePerformSubmit(key);
  };

  // Recover Uncertain Outcome
  const handleCheckCreationStatus = async () => {
    if (!idempotencyKey) return;
    setIsCheckingStatus(true);
    setStatusCheckResult(null);
    try {
      const res = await fetchOrderCreationStatus(idempotencyKey);
      const status = res.data?.status;
      const orderId = res.data?.orderId;

      if (status === 'completed' && orderId) {
        setStatusCheckResult('Order confirmed! Redirecting to order details...');
        setTimeout(() => navigate(`/orders/${orderId}`), 1200);
      } else if (status === 'sync_pending') {
        setStatusCheckResult(
          'Shopify created the order; local CRM synchronization is pending. Click "Resume Sync" to complete import.',
        );
        setSubmissionOutcome({
          type: 'sync_pending',
          message:
            'Shopify created the order successfully. Re-dispatch the request to complete local CRM sync.',
        });
      } else if (status === 'rejected') {
        setStatusCheckResult('Shopify confirmed that this order was rejected.');
        setSubmissionOutcome({
          type: 'rejected',
          message: `Request was rejected by Shopify (${res.data.errorCode || 'UNKNOWN'}).`,
        });
      } else {
        setStatusCheckResult(
          `Current status: "${status || 'in progress'}". If Shopify receives the order, it will appear shortly.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Status check failed.';
      setStatusCheckResult(`Unable to read status: ${msg}`);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Safe retry of existing submission using the SAME key
  const handleRetrySameSubmission = () => {
    if (!idempotencyKey) return;
    void handlePerformSubmit(idempotencyKey);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header / Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            to="/orders"
            className="inline-flex items-center text-xs font-semibold text-stone-600 hover:text-stone-900 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Orders
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Create Order
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Select products from your Shopify catalog, attach optional customer details, and submit directly.
          </p>
        </div>
      </div>

      {/* Submission Outcome / Error Banners */}
      {submissionOutcome && (
        <div
          role="alert"
          className={`p-4 rounded-xl border ${
            submissionOutcome.type === 'uncertain'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : submissionOutcome.type === 'sync_pending'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {submissionOutcome.type === 'uncertain' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            ) : submissionOutcome.type === 'sync_pending' ? (
              <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}

            <div className="flex-1 space-y-2">
              <div className="font-semibold text-sm">
                {submissionOutcome.type === 'uncertain'
                  ? 'Order Creation Outcome Uncertain'
                  : submissionOutcome.type === 'sync_pending'
                    ? 'CRM Synchronization Pending'
                    : 'Order Submission Failed'}
              </div>
              <p className="text-xs">{submissionOutcome.message}</p>

              {/* Details if present */}
              {Array.isArray(submissionOutcome.details) && submissionOutcome.details.length > 0 && (
                <ul className="text-xs list-disc pl-4 space-y-0.5 text-red-800">
                  {submissionOutcome.details.map((d, i) => (
                    <li key={i}>
                      {typeof d === 'object' && d !== null && 'message' in d
                        ? String((d as { message: unknown }).message)
                        : JSON.stringify(d)}
                    </li>
                  ))}
                </ul>
              )}

              {/* Status Recovery Controls */}
              {idempotencyKey && (
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  {(submissionOutcome.type === 'uncertain' || submissionOutcome.type === 'sync_pending') && (
                    <button
                      type="button"
                      onClick={() => void handleCheckCreationStatus()}
                      disabled={isCheckingStatus}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 shadow-2xs transition-colors"
                    >
                      {isCheckingStatus ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Checking Status...
                        </>
                      ) : (
                        'Check Request Status'
                      )}
                    </button>
                  )}

                  {submissionOutcome.type === 'sync_pending' && (
                    <button
                      type="button"
                      onClick={handleRetrySameSubmission}
                      disabled={isSubmitting}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#104850] text-white hover:bg-[#0d3a40] shadow-2xs transition-colors"
                    >
                      Resume Order Synchronization
                    </button>
                  )}

                  {submissionOutcome.type === 'rejected' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIdempotencyKey(generateNewIdempotencyKey());
                        setSubmissionOutcome(null);
                      }}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 shadow-2xs transition-colors"
                    >
                      Reset Submission Key
                    </button>
                  )}
                </div>
              )}

              {statusCheckResult && (
                <div className="mt-2 text-xs font-medium p-2 bg-white/70 rounded border border-stone-200">
                  {statusCheckResult}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <form onSubmit={handleStartSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection, Order Items, Customer, Notes */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Product / Variant Selector */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#104850]" />
                  Shopify Catalog Selection
                </h2>
                <p className="text-xs text-stone-500">
                  Search live variants from connected store
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Product Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Search products by title, SKU, or variant name..."
                  className="w-full pl-9 pr-8 py-2 text-sm bg-stone-50/70 border border-stone-200 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] transition-colors"
                />
                {productQuery && (
                  <button
                    type="button"
                    onClick={() => setProductQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {productSearchError && (
                <div className="text-xs text-red-600 p-2.5 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{productSearchError}</span>
                </div>
              )}

              {/* Product Results List */}
              <div className="border border-stone-200/70 rounded-lg max-h-72 overflow-y-auto divide-y divide-stone-100">
                {isProductsLoading ? (
                  <div className="p-8 text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#104850]" />
                    <span>Searching catalog...</span>
                  </div>
                ) : products.length === 0 ? (
                  <div className="p-8 text-center text-xs text-stone-500">
                    No matching products or variants found.
                  </div>
                ) : (
                  products.map((variant) => {
                    const isAdded = lineItems.some((item) => item.variant.id === variant.id);
                    const isAvailable = variant.available;

                    return (
                      <div
                        key={variant.id}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-stone-900 truncate">
                              {variant.title}
                            </span>
                            {variant.variantTitle && variant.variantTitle !== 'Default Title' && (
                              <span className="text-[11px] font-medium text-stone-600 px-1.5 py-0.5 bg-stone-100 rounded">
                                {variant.variantTitle}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500">
                            {variant.sku && <span>SKU: {variant.sku}</span>}
                            <span>
                              Price:{' '}
                              {variant.price ? (
                                <CurrencyText amount={variant.price} currencyCode={variant.currencyCode} />
                              ) : (
                                'Free'
                              )}
                            </span>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                isAvailable
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {isAvailable ? 'Available' : 'Unavailable'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <button
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => handleAddVariant(variant)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                              isAdded
                                ? 'bg-[#104850]/10 text-[#104850] hover:bg-[#104850]/20'
                                : isAvailable
                                  ? 'bg-[#104850] text-white hover:bg-[#0d3a40]'
                                  : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAdded ? 'Add More' : 'Add'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination control for products */}
              {hasNextPage && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => void handleLoadMoreProducts()}
                    disabled={isLoadingMore}
                    className="inline-flex items-center text-xs font-semibold text-[#104850] hover:text-[#0d3a40] disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                        Loading more products...
                      </>
                    ) : (
                      'Load More Products ↓'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Selected Line Items */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                  Order Line Items
                  <span className="text-xs font-medium text-stone-500">
                    ({lineItems.length} {lineItems.length === 1 ? 'item' : 'items'})
                  </span>
                </h2>
              </div>
              {lineItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLineItems([])}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {lineItems.length === 0 ? (
              <div className="p-8 text-center">
                <ShoppingBag className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-stone-700">No products added yet</p>
                <p className="text-[11px] text-stone-500 mt-1 max-w-sm mx-auto">
                  Search the catalog above and click Add to include products in this order.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {lineItems.map((item) => {
                  const linePrice = parseFloat(item.variant.price || '0') * item.quantity;

                  return (
                    <div
                      key={item.variant.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-stone-900">
                          {item.variant.title}
                        </div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5">
                          {item.variant.variantTitle && item.variant.variantTitle !== 'Default Title' && (
                            <span>{item.variant.variantTitle}</span>
                          )}
                          {item.variant.sku && <span>&bull; SKU: {item.variant.sku}</span>}
                          <span>
                            &bull; @{' '}
                            <CurrencyText
                              amount={item.variant.price || '0'}
                              currencyCode={item.variant.currencyCode}
                            />
                          </span>
                        </div>
                      </div>

                      {/* Quantity Controls and Total */}
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        {/* Stepper */}
                        <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white shadow-2xs">
                          <button
                            type="button"
                            disabled={item.quantity <= 1}
                            onClick={() => handleUpdateQuantity(item.variant.id, item.quantity - 1)}
                            className="p-1.5 text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-600"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(item.variant.id, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-12 text-center text-xs font-semibold text-stone-900 focus:outline-hidden"
                            aria-label="Item quantity"
                          />
                          <button
                            type="button"
                            disabled={item.quantity >= 1000}
                            onClick={() => handleUpdateQuantity(item.variant.id, item.quantity + 1)}
                            className="p-1.5 text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-600"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Estimated Line Total */}
                        <div className="w-20 text-right text-xs font-bold text-stone-900">
                          <CurrencyText
                            amount={linePrice.toFixed(2)}
                            currencyCode={item.variant.currencyCode}
                          />
                        </div>

                        {/* Remove Action */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.variant.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-md transition-colors"
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: Customer Selector (Optional) */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                  <User className="w-4 h-4 text-[#104850]" />
                  Customer Assignment
                </h2>
                <p className="text-xs text-stone-500">
                  Optional. Connect order to an existing Shopify customer.
                </p>
              </div>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  Clear customer
                </button>
              )}
            </div>

            {selectedCustomer ? (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-stone-900 block">
                    {selectedCustomer.displayName}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {selectedCustomer.email ? selectedCustomer.email : 'No email recorded'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1 text-stone-400 hover:text-stone-700"
                  aria-label="Remove assigned customer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search by customer name (min 2 characters)..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50/70 border border-stone-200 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] transition-colors"
                  />
                </div>
                <p className="text-[11px] text-stone-500">
                  Leave blank to create order as guest / walk-in customer.
                </p>

                {customerSearchError && (
                  <div className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200">
                    {customerSearchError}
                  </div>
                )}

                {isCustomersLoading && (
                  <div className="text-xs text-stone-500 flex items-center gap-2 py-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#104850]" />
                    <span>Searching customers...</span>
                  </div>
                )}

                {customers.length > 0 && (
                  <div className="border border-stone-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-stone-100">
                    {customers.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 flex items-center justify-between hover:bg-stone-50 cursor-pointer"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerQuery('');
                          setCustomers([]);
                        }}
                      >
                        <div>
                          <div className="text-xs font-semibold text-stone-900">
                            {c.displayName}
                          </div>
                          {c.email && (
                            <div className="text-[11px] text-stone-500">{c.email}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] font-semibold text-[#104850] bg-[#104850]/10 rounded hover:bg-[#104850]/20"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 4: Order Note (Optional) */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#104850]" />
                  Order Note
                </h2>
                <p className="text-xs text-stone-500">
                  Optional note transmitted to Shopify (max 500 characters)
                </p>
              </div>
              <span
                className={`text-[11px] font-medium ${
                  orderNote.length > 500 ? 'text-red-600 font-bold' : 'text-stone-500'
                }`}
              >
                {orderNote.length} / 500
              </span>
            </div>

            <textarea
              rows={3}
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="e.g. Special packing instructions, custom order reference, or operator remarks..."
              maxLength={500}
              className="w-full p-3 text-xs text-stone-900 bg-stone-50/70 border border-stone-200 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] transition-colors"
            />
          </div>
        </div>

        {/* Right Column: Order Summary & Submission */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 sticky top-20 space-y-5">
            <h2 className="text-sm font-bold text-stone-900 tracking-tight border-b border-stone-100 pb-3">
              Order Summary
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Total Items</span>
                <span className="font-semibold text-stone-900">{totalQuantity} units</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Unique Variants</span>
                <span className="font-semibold text-stone-900">{lineItems.length}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Customer</span>
                <span className="font-semibold text-stone-900 truncate max-w-[150px]">
                  {selectedCustomer ? selectedCustomer.displayName : 'Guest Order'}
                </span>
              </div>

              <div className="pt-3 border-t border-stone-100 flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-stone-900">Estimated Total</span>
                  <span className="block text-[10px] text-stone-500">
                    Final totals verified by Shopify
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#104850]">
                  <CurrencyText
                    amount={estimatedSubtotal.toFixed(2)}
                    currencyCode={shopCurrency}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 text-[11px] text-stone-600 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-stone-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Shopify Order Dispatch</span>
              </div>
              <p>
                Prices and tax calculations are determined directly by Shopify during order creation.
              </p>
            </div>

            <button
              type="submit"
              disabled={lineItems.length === 0 || isSubmitting || orderNote.length > 500}
              className="w-full flex items-center justify-center py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-[#104850] hover:bg-[#0d3a40] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
            >
              Review & Create Order
            </button>
          </div>
        </div>
      </form>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Confirm Shopify Order Creation
              </h3>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-700">
              <p>
                You are about to dispatch an order to Shopify containing{' '}
                <strong>{totalQuantity}</strong> item(s):
              </p>

              <div className="max-h-40 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg p-2 bg-stone-50/50">
                {lineItems.map((item) => (
                  <div key={item.variant.id} className="py-1.5 flex justify-between">
                    <span className="truncate pr-2 font-medium">
                      {item.quantity}x {item.variant.title}{' '}
                      {item.variant.variantTitle !== 'Default Title' ? `(${item.variant.variantTitle})` : ''}
                    </span>
                    <span className="font-semibold text-stone-900 shrink-0">
                      <CurrencyText
                        amount={(parseFloat(item.variant.price || '0') * item.quantity).toFixed(2)}
                        currencyCode={item.variant.currencyCode}
                      />
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Customer:</span>
                  <span className="font-semibold text-stone-900">
                    {selectedCustomer ? selectedCustomer.displayName : 'Guest Order'}
                  </span>
                </div>
                {orderNote.trim() && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">Note:</span>
                    <span className="font-medium text-stone-800 italic truncate max-w-[250px]">
                      "{orderNote.trim()}"
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-stone-200 text-sm">
                  <span className="font-bold text-stone-900">Estimated Total:</span>
                  <span className="font-extrabold text-[#104850]">
                    <CurrencyText
                      amount={estimatedSubtotal.toFixed(2)}
                      currencyCode={shopCurrency}
                    />
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This action dispatches live order creation in Shopify. An idempotency token will protect against duplicate orders.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg text-white bg-[#104850] hover:bg-[#0d3a40] disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Submitting Order...
                  </>
                ) : (
                  'Confirm & Dispatch'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
