import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  User,
  Calendar,
  AlertTriangle,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  Database,
  ShieldAlert,
} from 'lucide-react';
import { fetchOrderById } from '../api/orders';
import { ApiError } from '../api/client';
import { CurrencyText } from '../components/CurrencyText';
import { DateText } from '../components/DateText';
import { StatusBadge } from '../components/StatusBadge';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', id],
    queryFn: () => {
      if (!id) throw new Error('Order ID is required');
      return fetchOrderById(id);
    },
    enabled: Boolean(id),
  });

  const order = data?.data;

  // 404 or Missing Order State
  const isNotFound =
    isError && error instanceof ApiError && error.status === 404;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-28 bg-stone-200 rounded-lg animate-pulse" />
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 space-y-4 shadow-xs animate-pulse">
          <div className="h-8 w-48 bg-stone-200 rounded-lg" />
          <div className="h-4 w-64 bg-stone-100 rounded-lg" />
          <div className="h-40 bg-stone-50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="space-y-6 max-w-xl mx-auto py-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center">
          <FileQuestion className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900">Order Not Found</h1>
        <p className="text-sm text-stone-500 max-w-md mx-auto">
          The order with identifier{' '}
          <code className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-700 font-mono text-xs">
            {id}
          </code>{' '}
          could not be found in the CRM database. It may have been removed or never synchronized.
        </p>
        <div className="pt-2">
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#104850] hover:bg-[#0c383e] rounded-xl transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Orders</span>
          </Link>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="space-y-6">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-[#104850] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Orders</span>
        </Link>
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold">We couldn't load this order. Please try again.</h2>
              <p className="mt-1 text-sm text-rose-700">
                {error instanceof Error ? error.message : 'An error occurred while fetching the order.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const customer = order.customer;
  const customerDisplayName =
    customer?.displayName || order.customerName || 'Guest';
  const customerEmail = customer?.email || order.customerEmail || null;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-[#104850] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Orders</span>
        </Link>
      </div>

      {/* Section A: Main Header Card */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
              Order {order.orderNumber}
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={order.financialStatus} type="financial" />
              <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-stone-400 shrink-0" />
            <span>
              Placed on <DateText dateString={order.orderDate} showTime={true} />
            </span>
          </p>
        </div>

        {/* Order Total Display */}
        <div className="pt-3 sm:pt-0 border-t sm:border-t-0 border-stone-100 text-left sm:text-right">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Total Order Amount
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
            <CurrencyText amount={order.totalAmount} currencyCode={order.currencyCode} />
          </p>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Order Line Items and Financial Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section B: Order Line Items Card */}
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200/80 bg-stone-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-stone-500" />
                <h2 className="text-base font-bold text-stone-900">Line Items</h2>
              </div>
              <span className="text-xs font-semibold text-stone-600 bg-stone-200/60 px-2.5 py-0.5 rounded-full">
                {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-stone-200/80 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/30">
                    <th scope="col" className="py-3 px-5">Product & Variant</th>
                    <th scope="col" className="py-3 px-4">SKU</th>
                    <th scope="col" className="py-3 px-4 text-center">Qty</th>
                    <th scope="col" className="py-3 px-4 text-right">Unit Price</th>
                    <th scope="col" className="py-3 px-5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {order.items.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-stone-900">{item.title}</p>
                        {item.variantTitle && (
                          <p className="text-xs text-stone-500 mt-0.5">{item.variantTitle}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-500 font-mono">
                        {item.sku || <span className="text-stone-400 font-sans italic">No SKU</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center text-sm font-semibold text-stone-900">
                        {item.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right text-xs text-stone-600">
                        <CurrencyText amount={item.unitPrice} currencyCode={order.currencyCode} />
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-stone-900">
                        <CurrencyText amount={item.totalPrice} currencyCode={order.currencyCode} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Items Cards (< sm) */}
            <div className="sm:hidden divide-y divide-stone-100">
              {order.items.map((item) => (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{item.title}</p>
                      {item.variantTitle && (
                        <p className="text-xs text-stone-500">{item.variantTitle}</p>
                      )}
                      <p className="text-xs text-stone-400 font-mono mt-0.5">
                        SKU: {item.sku || 'No SKU'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-stone-900 shrink-0">
                      <CurrencyText amount={item.totalPrice} currencyCode={order.currencyCode} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
                    <span>
                      Qty: <span className="font-semibold text-stone-800">{item.quantity}</span>
                    </span>
                    <span>
                      Unit: <CurrencyText amount={item.unitPrice} currencyCode={order.currencyCode} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Section C: Order Summary Subtotal/Total */}
            <div className="p-5 border-t border-stone-200/80 bg-stone-50/50 space-y-2.5">
              <div className="flex justify-between text-stone-600 text-xs">
                <span>Items Subtotal</span>
                <span className="font-medium text-stone-900">
                  <CurrencyText amount={order.totalAmount} currencyCode={order.currencyCode} />
                </span>
              </div>
              <div className="flex justify-between text-stone-900 font-bold text-base pt-2.5 border-t border-stone-200/80">
                <span>Total Recorded</span>
                <span>
                  <CurrencyText amount={order.totalAmount} currencyCode={order.currencyCode} />
                </span>
              </div>
              <p className="text-[11px] text-stone-400 pt-1">
                Order amounts reflect synchronized records from Shopify. Shipping rates, discounts, and tax lines are preserved in your Shopify store admin.
              </p>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Customer, Status Attributes, and Technical Details */}
        <div className="space-y-6">
          {/* Section D: Customer Details Card */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <User className="w-4 h-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-900">Customer Details</h2>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                  Customer
                </span>
                <span className="text-sm font-bold text-stone-900 mt-0.5 block">
                  {customerDisplayName}
                </span>
              </div>

              <div>
                <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                  Email
                </span>
                {customerEmail ? (
                  <a
                    href={`mailto:${customerEmail}`}
                    className="text-stone-800 hover:text-[#104850] underline decoration-stone-300 hover:decoration-[#104850] font-medium mt-0.5 block break-all transition-colors"
                  >
                    {customerEmail}
                  </a>
                ) : (
                  <span className="text-stone-400 italic mt-0.5 block">
                    No email recorded
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section E: Order Status Attributes (Read-only notice) */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-3.5">
            <h2 className="text-sm font-bold text-stone-900 border-b border-stone-100 pb-3">
              Order Status
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 font-medium">Payment</span>
                <StatusBadge status={order.financialStatus} type="financial" />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-stone-500 font-medium">Fulfillment</span>
                <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                <span className="text-stone-500 font-medium">Currency</span>
                <span className="font-semibold text-stone-800">{order.currencyCode}</span>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-[11px] text-stone-500 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
              <span>
                Order statuses are read-only and automatically updated via Shopify webhooks.
              </span>
            </div>
          </div>

          {/* Section F: Technical Details Collapsible Accordion */}
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setTechnicalOpen(!technicalOpen)}
              aria-expanded={technicalOpen}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-stone-50/70 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-stone-500" />
                <span className="text-sm font-bold text-stone-900">Technical Details</span>
              </div>
              <span className="text-stone-400">
                {technicalOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
            </button>

            {technicalOpen && (
              <div className="px-5 pb-5 pt-1 border-t border-stone-100 space-y-3 text-xs">
                <div>
                  <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                    Shopify Order ID
                  </span>
                  <span className="font-mono text-stone-800 break-all mt-0.5 block bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                    {order.shopifyOrderId}
                  </span>
                </div>

                <div>
                  <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                    CRM Internal ID
                  </span>
                  <span className="font-mono text-stone-800 break-all mt-0.5 block bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                    {order.id}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                      Shopify Last Updated
                    </span>
                    <span className="text-stone-700 mt-0.5 block font-medium">
                      <DateText dateString={order.shopifyUpdatedAt} showTime={true} />
                    </span>
                  </div>

                  <div>
                    <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                      CRM Synchronized
                    </span>
                    <span className="text-stone-700 mt-0.5 block font-medium">
                      <DateText dateString={order.syncedAt} showTime={true} />
                    </span>
                  </div>

                  <div>
                    <span className="text-stone-500 uppercase font-semibold text-[10px] tracking-wider block">
                      CRM Created
                    </span>
                    <span className="text-stone-700 mt-0.5 block font-medium">
                      <DateText dateString={order.createdAt} showTime={true} />
                    </span>
                  </div>

                  {order.cancelledAt && (
                    <div>
                      <span className="text-rose-600 uppercase font-semibold text-[10px] tracking-wider block">
                        Cancelled At
                      </span>
                      <span className="text-rose-800 mt-0.5 block font-medium">
                        <DateText dateString={order.cancelledAt} showTime={true} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
