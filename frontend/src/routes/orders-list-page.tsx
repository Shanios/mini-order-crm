import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Plus,
  RefreshCw,
  AlertTriangle,
  Inbox,
  Calendar,
  X,
  User,
  RotateCcw,
} from 'lucide-react';
import { fetchOrders } from '../api/orders';
import type { OrdersFilterParams } from '../api/types';
import { CurrencyText } from '../components/CurrencyText';
import { DateText } from '../components/DateText';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export function OrdersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search & Filters State
  const [searchInput, setSearchInput] = useState('');
  const appliedSearch = searchParams.get('search') ?? '';
  const financialStatus = searchParams.get('financialStatus') ?? 'ALL';
  const fulfillmentStatus = searchParams.get('fulfillmentStatus') ?? 'ALL';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const sort = searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const requestedPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 20;

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    setSearchParams(nextParams);
  };

  useEffect(() => {
    setSearchInput(appliedSearch);
  }, [appliedSearch]);

  // Query parameters object
  const queryParams: OrdersFilterParams = {
    page,
    pageSize,
    sort,
    ...(appliedSearch ? { search: appliedSearch } : {}),
    ...(financialStatus !== 'ALL' ? { financialStatus } : {}),
    ...(fulfillmentStatus !== 'ALL' ? { fulfillmentStatus } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['orders', queryParams],
    queryFn: () => fetchOrders(queryParams),
    placeholderData: (prev) => prev,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const search = searchInput.trim();
    updateSearchParams({ search: search || null, page: null });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const hasActiveFilters =
    Boolean(appliedSearch) ||
    financialStatus !== 'ALL' ||
    fulfillmentStatus !== 'ALL' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const orders = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const totalOrders = meta?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Section A: Page Header with Title, Count Context, and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
              Orders
            </h1>
            {!isLoading && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                {totalOrders} {totalOrders === 1 ? 'order' : 'orders'}
                {hasActiveFilters ? ' matching' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-500">
            View and manage orders from your connected Shopify store.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:text-stone-900 disabled:opacity-60 transition-colors shadow-2xs"
            title="Refresh orders list"
            aria-label="Refresh orders"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isFetching ? 'animate-spin text-[#104850]' : 'text-stone-400'
              }`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            to="/orders/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#104850] hover:bg-[#0c383e] rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Order</span>
          </Link>
        </div>
      </div>

      {/* Section C: Search and Filters Bar Card */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Row 1: Search Form + Status Selectors */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Prominent Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by order #, customer name or email..."
                aria-label="Search orders"
                className="w-full pl-9 pr-20 py-2.5 text-sm bg-stone-50/70 border border-stone-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] focus:bg-white transition-all placeholder:text-stone-400"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    updateSearchParams({ search: null, page: null });
                  }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 transition-colors"
                  aria-label="Clear search query"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-[#104850] bg-stone-200/70 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>
          </form>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Financial Status */}
            <div>
              <label htmlFor="financialStatusSelect" className="sr-only">
                Payment status
              </label>
              <select
                id="financialStatusSelect"
                value={financialStatus}
                onChange={(e) => {
                  updateSearchParams({
                    financialStatus: e.target.value === 'ALL' ? null : e.target.value,
                    page: null,
                  });
                }}
                className="text-xs font-medium bg-stone-50 border border-stone-200 text-stone-700 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850]"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="AUTHORIZED">Authorized</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="REFUNDED">Refunded</option>
                <option value="VOIDED">Voided</option>
              </select>
            </div>

            {/* Fulfillment Status */}
            <div>
              <label htmlFor="fulfillmentStatusSelect" className="sr-only">
                Fulfillment status
              </label>
              <select
                id="fulfillmentStatusSelect"
                value={fulfillmentStatus}
                onChange={(e) => {
                  updateSearchParams({
                    fulfillmentStatus: e.target.value === 'ALL' ? null : e.target.value,
                    page: null,
                  });
                }}
                className="text-xs font-medium bg-stone-50 border border-stone-200 text-stone-700 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850]"
              >
                <option value="ALL">All Fulfillment Statuses</option>
                <option value="UNFULFILLED">Unfulfilled</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="PARTIAL">Partially Fulfilled</option>
                <option value="RESTOCKED">Restocked</option>
              </select>
            </div>

            {/* Sort Toggle */}
            <div className="relative">
              <label htmlFor="sortSelect" className="sr-only">
                Sort order
              </label>
              <select
                id="sortSelect"
                value={sort}
                onChange={(e) => {
                  updateSearchParams({
                    sort: e.target.value === 'newest' ? null : e.target.value,
                    page: null,
                  });
                }}
                className="text-xs font-medium bg-stone-50 border border-stone-200 text-stone-700 rounded-xl pl-8 pr-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Row 2: Date Range Filter + Reset Controls */}
        <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-stone-500 font-medium inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              Date placed:
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="dateFromInput" className="text-stone-500">
                From
              </label>
              <input
                id="dateFromInput"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  updateSearchParams({ dateFrom: e.target.value || null, page: null });
                }}
                className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-700 focus:outline-hidden focus:border-[#104850]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="dateToInput" className="text-stone-500">
                To
              </label>
              <input
                id="dateToInput"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  updateSearchParams({ dateTo: e.target.value || null, page: null });
                }}
                className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-700 focus:outline-hidden focus:border-[#104850]"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 text-stone-600 hover:text-stone-900 font-medium px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Section D: Orders Table & Responsive Mobile Views */}
      {isError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold">We couldn't load your orders. Please try again.</h3>
              <p className="mt-1 text-sm text-rose-700">
                {error instanceof Error
                  ? error.message
                  : 'An error occurred while communicating with the server.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      ) : isLoading ? (
        /* Loading Skeleton */
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-stone-200/80 bg-stone-50/50">
            <div className="h-4 w-32 bg-stone-200 rounded animate-pulse" />
          </div>
          <div className="divide-y divide-stone-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-stone-200 rounded" />
                  <div className="h-3 w-36 bg-stone-100 rounded" />
                </div>
                <div className="h-4 w-20 bg-stone-200 rounded" />
                <div className="h-6 w-16 bg-stone-100 rounded-full" />
                <div className="h-6 w-16 bg-stone-100 rounded-full" />
                <div className="h-4 w-16 bg-stone-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : orders.length === 0 ? (
        /* Empty States */
        <EmptyState
          icon={<Inbox className="w-7 h-7 text-stone-400" />}
          title={hasActiveFilters ? 'No orders match your search.' : 'No orders yet.'}
          description={
            hasActiveFilters
              ? 'No orders matched your active filters or search criteria. Try modifying your search or resetting filters.'
              : 'Orders synchronized from your Shopify store will automatically appear here once imported.'
          }
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
          {/* Desktop & Tablet Table (Hidden on small mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-200/80 bg-stone-50/70 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  <th scope="col" className="py-3.5 px-6">Order</th>
                  <th scope="col" className="py-3.5 px-4">Customer</th>
                  <th scope="col" className="py-3.5 px-4">Date</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Total Amount</th>
                  <th scope="col" className="py-3.5 px-4">Payment</th>
                  <th scope="col" className="py-3.5 px-4">Fulfillment</th>
                  <th scope="col" className="py-3.5 px-6 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {orders.map((order) => {
                  const customerDisplay =
                    order.customer?.displayName ||
                    order.customerName ||
                    'Guest';

                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="hover:bg-stone-50/80 cursor-pointer transition-colors duration-100 group"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/orders/${order.id}`);
                        }
                      }}
                      role="button"
                      aria-label={`View order ${order.orderNumber}`}
                    >
                      {/* Order Number */}
                      <td className="py-4 px-6 font-bold text-[#104850] group-hover:underline decoration-[#104850]/40 whitespace-nowrap">
                        {order.orderNumber}
                      </td>

                      {/* Customer Name or Guest Fallback */}
                      <td className="py-4 px-4 max-w-[200px]">
                        <div className="flex flex-col">
                          <span className="font-medium text-stone-900 truncate">
                            {customerDisplay}
                          </span>
                          {order.customerEmail && (
                            <span className="text-xs text-stone-500 truncate">
                              {order.customerEmail}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date Placed */}
                      <td className="py-4 px-4 text-xs text-stone-500 whitespace-nowrap">
                        <DateText dateString={order.orderDate} showTime={true} />
                      </td>

                      {/* Total Amount */}
                      <td className="py-4 px-4 text-right font-bold text-stone-900 whitespace-nowrap">
                        <CurrencyText
                          amount={order.totalAmount}
                          currencyCode={order.currencyCode}
                        />
                      </td>

                      {/* Financial / Payment Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusBadge status={order.financialStatus} type="financial" />
                      </td>

                      {/* Fulfillment Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
                      </td>

                      {/* View details arrow */}
                      <td className="py-4 px-6 text-right text-xs font-semibold text-[#104850] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Details
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Orders Card View (Displayed only on screens < md) */}
          <div className="md:hidden divide-y divide-stone-100">
            {orders.map((order) => {
              const customerDisplay =
                order.customer?.displayName ||
                order.customerName ||
                'Guest';

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="p-4 hover:bg-stone-50/80 active:bg-stone-100/80 cursor-pointer transition-colors space-y-2.5"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/orders/${order.id}`);
                    }
                  }}
                  role="button"
                  aria-label={`View order ${order.orderNumber}`}
                >
                  {/* Top: Order # & Total */}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-[#104850]">
                      {order.orderNumber}
                    </span>
                    <span className="text-base font-bold text-stone-900">
                      <CurrencyText
                        amount={order.totalAmount}
                        currencyCode={order.currencyCode}
                      />
                    </span>
                  </div>

                  {/* Middle: Customer & Date */}
                  <div className="flex items-center justify-between text-xs text-stone-600 gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="font-medium text-stone-900 truncate">
                        {customerDisplay}
                      </span>
                    </div>
                    <span className="text-stone-500 shrink-0">
                      <DateText dateString={order.orderDate} showTime={false} />
                    </span>
                  </div>

                  {/* Bottom: Status Badges & Details link */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={order.financialStatus} type="financial" />
                      <StatusBadge status={order.fulfillmentStatus} type="fulfillment" />
                    </div>
                    <span className="text-xs font-semibold text-[#104850] inline-flex items-center gap-0.5">
                      Details <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section F: Pagination Footer */}
          <div className="px-4 sm:px-6 py-3.5 border-t border-stone-200/80 bg-stone-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
            <div>
              Showing <span className="font-semibold text-stone-800">{orders.length}</span> of{' '}
              <span className="font-semibold text-stone-800">{totalOrders}</span> {totalOrders === 1 ? 'order' : 'orders'}
              {totalPages > 1 && (
                <span>
                  {' '}— Page <span className="font-semibold text-stone-800">{page}</span> of{' '}
                  <span className="font-semibold text-stone-800">{totalPages}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateSearchParams({ page: page <= 2 ? null : String(page - 1) })}
                disabled={page <= 1 || isFetching}
                className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors min-h-[36px]"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={() => updateSearchParams({ page: String(Math.min(totalPages, page + 1)) })}
                disabled={page >= totalPages || isFetching}
                className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors min-h-[36px]"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
