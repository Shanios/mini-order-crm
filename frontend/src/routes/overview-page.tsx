import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchOrders } from '../api/orders';
import { fetchShopifyStatus } from '../api/shopify';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import {
  Package,
  CircleDollarSign,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight,
  Store,
  Layers,
  RefreshCw,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';

export function OverviewPage() {
  const navigate = useNavigate();

  // 1. Fetch recent orders + total count
  const {
    data: recentOrdersData,
    isLoading: isRecentLoading,
    isError: isRecentError,
    refetch: refetchRecent,
  } = useQuery({
    queryKey: ['overview-recent-orders'],
    queryFn: () => fetchOrders({ pageSize: 5, sort: 'newest' }),
    staleTime: 30_000,
  });

  // 2. Fetch unfulfilled orders count
  const {
    data: unfulfilledData,
    isLoading: isUnfulfilledLoading,
    isError: isUnfulfilledError,
    refetch: refetchUnfulfilled,
  } = useQuery({
    queryKey: ['overview-unfulfilled-count'],
    queryFn: () => fetchOrders({ fulfillmentStatus: 'UNFULFILLED', pageSize: 1 }),
    staleTime: 30_000,
  });

  // 3. Fetch fulfilled orders count
  const {
    data: fulfilledData,
    isLoading: isFulfilledLoading,
    isError: isFulfilledError,
    refetch: refetchFulfilled,
  } = useQuery({
    queryKey: ['overview-fulfilled-count'],
    queryFn: () => fetchOrders({ fulfillmentStatus: 'FULFILLED', pageSize: 1 }),
    staleTime: 30_000,
  });

  // 4. Fetch all orders up to single-page limit (100) for trustworthy sum calculation
  const {
    data: allOrdersData,
    isLoading: isAllOrdersLoading,
  } = useQuery({
    queryKey: ['overview-all-orders-sum'],
    queryFn: () => fetchOrders({ pageSize: 100 }),
    staleTime: 30_000,
  });

  // 5. Fetch Shopify store connection status
  const {
    data: shopifyStatusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['shopify-status'],
    queryFn: fetchShopifyStatus,
    staleTime: 60_000,
  });

  const isConfigured = shopifyStatusData?.data?.configured;
  const storeName = shopifyStatusData?.data?.storeName;
  const lastSyncedAt = shopifyStatusData?.data?.lastSyncedAt;

  // Aggregate computations
  const totalOrders = recentOrdersData?.meta?.total;
  const unfulfilledOrders = unfulfilledData?.meta?.total;
  const fulfilledOrders = fulfilledData?.meta?.total;

  // Safe Total Order Value computation
  let totalOrderValueDisplay = '—';
  let totalOrderValueSubtext = 'Total across recorded orders';

  if (!isAllOrdersLoading && allOrdersData) {
    const totalCount = allOrdersData.meta?.total ?? 0;
    if (totalCount === 0) {
      totalOrderValueDisplay = '$0.00';
      totalOrderValueSubtext = 'No recorded orders';
    } else if (totalCount <= 100) {
      // Complete set of orders is available
      const items = allOrdersData.data || [];
      const currencies = Array.from(new Set(items.map((o) => o.currencyCode).filter(Boolean)));

      if (currencies.length <= 1) {
        const currency = currencies[0] || 'USD';
        const sum = items.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0);
        totalOrderValueDisplay = formatCurrency(sum, currency);
        totalOrderValueSubtext = `Total value of  orders`;
      } else {
        totalOrderValueDisplay = 'Multiple';
        totalOrderValueSubtext = `Mixed currencies across ${totalCount} orders`;
      }
    } else {
      // More than 100 orders exist and backend lacks server-side sum aggregation API
      totalOrderValueDisplay = 'Not available';
      totalOrderValueSubtext = 'Aggregate requires server-side sum for >100 orders';
    }
  }

  const hasAnyError = isRecentError || isUnfulfilledError || isFulfilledError;

  const handleRetryAll = () => {
    void refetchRecent();
    void refetchUnfulfilled();
    void refetchFulfilled();
    void refetchStatus();
  };

  const recentOrders = recentOrdersData?.data || [];

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Section A — Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
            Store Overview
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Your orders and store activity at a glance.
          </p>
        </div>

        {/* Right Header Action */}
        <div className="flex items-center justify-end">
          <Link
            to="/orders/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg text-white bg-[#104850] hover:bg-[#0d3a40] transition-colors shadow-2xs min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Order</span>
          </Link>
        </div>
      </div>

      {/* Global Error Banner if API call fails */}
      {hasAnyError && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">We couldn't load your orders.</p>
              <p className="text-xs text-red-700 mt-0.5">
                The orders service may be temporarily unavailable. Please try again.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetryAll}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-white border border-red-300 text-red-800 hover:bg-red-50 transition-colors shadow-2xs"
          >
            Retry
          </button>
        </div>
      )}

      {isStatusError && !hasAnyError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-center justify-between text-xs"
        >
          <span>Your store connection is currently unavailable.</span>
          <button
            type="button"
            onClick={() => void refetchStatus()}
            className="font-semibold text-amber-900 underline hover:text-amber-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Section B — Four Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI 1: Total Orders */}
        <Link
          to="/orders"
          aria-label="View all orders (Total Orders)"
          className="block bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs hover:border-[#104850]/40 hover:shadow-xs transition-[border-color,box-shadow] duration-150 cursor-default focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Total Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#104850] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              {isRecentLoading ? (
                <span className="text-stone-300 animate-pulse">···</span>
              ) : (
                totalOrders ?? '—'
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500">
             Total orders tracked
            </p>
          </div>
        </Link>

        {/* KPI 2: Total Order Value */}
        <Link
          to="/orders"
          aria-label="View all orders (Total Order Value)"
          className="block bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs hover:border-[#104850]/40 hover:shadow-xs transition-[border-color,box-shadow] duration-150 cursor-default focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Total Order Value
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <CircleDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 truncate">
              {isAllOrdersLoading ? (
                <span className="text-stone-300 animate-pulse">···</span>
              ) : (
                totalOrderValueDisplay
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500 truncate" title={totalOrderValueSubtext}>
              {totalOrderValueSubtext}
            </p>
          </div>
        </Link>

        {/* KPI 3: Unfulfilled Orders */}
        <Link
          to="/orders?fulfillmentStatus=UNFULFILLED"
          aria-label="View unfulfilled orders"
          className="block bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs hover:border-[#104850]/40 hover:shadow-xs transition-[border-color,box-shadow] duration-150 cursor-default focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Unfulfilled Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              {isUnfulfilledLoading ? (
                <span className="text-stone-300 animate-pulse">···</span>
              ) : (
                unfulfilledOrders ?? '—'
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Orders awaiting fulfillment
            </p>
          </div>
        </Link>

        {/* KPI 4: Fulfilled Orders */}
        <Link
          to="/orders?fulfillmentStatus=FULFILLED"
          aria-label="View fulfilled orders"
          className="block bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs hover:border-[#104850]/40 hover:shadow-xs transition-[border-color,box-shadow] duration-150 cursor-default focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Fulfilled Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#104850] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              {isFulfilledLoading ? (
                <span className="text-stone-300 animate-pulse">···</span>
              ) : (
                fulfilledOrders ?? '—'
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Successfully fulfilled
            </p>
          </div>
        </Link>
      </div>

      {/* Main Grid: Section C (Recent Orders) + Section D & E (Store Connection & Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Section C — Recent Orders Panel (Left 8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                Recent Orders
              </h2>
              <p className="text-xs text-stone-500">
                Latest orders synchronized from your Shopify store
              </p>
            </div>
            <Link
              to="/orders"
              className="inline-flex items-center text-xs font-semibold text-[#104850] hover:text-[#0d3a40] transition-colors"
            >
              <span>View All Orders</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          {/* Orders Content */}
          {isRecentLoading ? (
            <div className="p-12 text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#104850]" />
              <span>Loading recent orders...</span>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mx-auto mb-3">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-stone-800">No orders yet</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                When orders are created in or synced from Shopify, they will appear here.
              </p>
              <div className="mt-4">
                <Link
                  to="/orders/new"
                  className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-[#104850] hover:bg-[#0d3a40] transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Create Your First Order
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {/* Desktop / Tablet Table View (Hidden on mobile) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 text-[11px] font-semibold uppercase tracking-wider text-stone-500 bg-stone-50/50">
                      <th className="py-3 px-5">Order</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-5 text-right">Fulfillment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {recentOrders.map((order) => {
                      const customerDisplay =
                        order.customer?.displayName ||
                        order.customerName ||
                        'Guest';

                      return (
                        <tr
                          key={order.id}
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="hover:bg-stone-50/70 transition-colors cursor-pointer group"
                        >
                          <td className="py-3.5 px-5 font-bold text-[#104850] group-hover:underline">
                            {order.orderNumber}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-stone-800 truncate max-w-[160px]">
                            {customerDisplay}
                          </td>
                          <td className="py-3.5 px-4 text-stone-500 whitespace-nowrap">
                            {formatDate(order.orderDate, false)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-stone-900 whitespace-nowrap">
                            {formatCurrency(order.totalAmount, order.currencyCode)}
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View (Visible on small screens) */}
              <div className="sm:hidden divide-y divide-stone-100">
                {recentOrders.map((order) => {
                  const customerDisplay =
                    order.customer?.displayName ||
                    order.customerName ||
                    'Guest';

                  return (
                    <div
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="p-4 space-y-2 hover:bg-stone-50/80 transition-colors cursor-pointer active:bg-stone-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#104850]">
                          {order.orderNumber}
                        </span>
                        <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-700 font-medium truncate max-w-[180px]">
                          {customerDisplay}
                        </span>
                        <span className="font-bold text-stone-900">
                          {formatCurrency(order.totalAmount, order.currencyCode)}
                        </span>
                      </div>

                      <div className="text-[11px] text-stone-500">
                        {formatDate(order.orderDate, false)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Section D (Store Connection Summary) & Section E (Quick Actions) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Section D — Store Summary Card ("Your Store") */}
          <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                <Store className="w-4 h-4 text-[#104850]" />
                Your Store
              </h2>
              {isConfigured ? (
                <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-semibold text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 mr-1.5" />
                  Disconnected
                </span>
              )}
            </div>

            <div className="space-y-3.5">
              {/* Prominent Store Display Name */}
              <div>
                <p className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight truncate">
                  {storeName || (isStatusLoading ? 'Checking...' : 'Shopify Store')}
                </p>
              </div>

              {/* Last Order Sync Details */}
              <div className="pt-3 border-t border-stone-100 space-y-1">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-stone-500 block">
                  Last Order Sync
                </span>
                <span className="text-xs sm:text-sm font-medium text-stone-800 block">
                  {lastSyncedAt ? formatDate(lastSyncedAt, true) : 'Not synced yet'}
                </span>
                <p className="text-[11px] text-stone-400">
                  Last successfully completed order sync
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100">
              <Link
                to="/settings/integration"
                className="inline-flex items-center text-xs font-semibold text-[#104850] hover:text-[#0d3a40] transition-colors"
              >
                <span>Store Settings</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </div>
          </div>

          {/* Section E — Quick Actions */}
          <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-stone-900 tracking-tight border-b border-stone-100 pb-3">
              Quick Actions
            </h2>

            <div className="space-y-2">
              <Link
                to="/orders"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50/70 transition-colors text-xs font-semibold text-stone-800 group shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-[#104850] group-hover:text-white transition-colors">
                    <Package className="w-3.5 h-3.5" />
                  </div>
                  <span>Browse All Orders</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
              </Link>

              <Link
                to="/orders/new"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50/70 transition-colors text-xs font-semibold text-stone-800 group shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-[#104850] group-hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <span>Create New Order</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
              </Link>

              <Link
                to="/settings/integration"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50/70 transition-colors text-xs font-semibold text-stone-800 group shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-[#104850] group-hover:text-white transition-colors">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <span>Shopify Sync & Status</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
