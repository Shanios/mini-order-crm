import { useQuery } from '@tanstack/react-query';
import {
  Store,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { fetchShopifyStatus, fetchShopsStatus } from '../api/shopify';
import { formatDate } from '../utils/formatters';

export function IntegrationPage() {
  const {
    data: shopifyStatusData,
    isLoading: isShopifyLoading,
    isError: isShopifyError,
    error: shopifyError,
    refetch: refetchShopify,
    isFetching: isShopifyFetching,
  } = useQuery({
    queryKey: ['shopify-status'],
    queryFn: fetchShopifyStatus,
  });

  const {
    data: shopsStatusData,
    isLoading: isShopsLoading,
    isError: isShopsError,
    error: shopsError,
    refetch: refetchShops,
    isFetching: isShopsFetching,
  } = useQuery({
    queryKey: ['shops-status'],
    queryFn: fetchShopsStatus,
  });

  const shopifyStatus = shopifyStatusData?.data;
  const shops = shopsStatusData?.data?.shops ?? [];

  const handleRefreshAll = () => {
    refetchShopify();
    refetchShops();
  };

  const isRefreshing = isShopifyFetching || isShopsFetching;
  const isLoading = isShopifyLoading || isShopsLoading;
  const isConfigured = Boolean(shopifyStatus?.configured);

  const storeDisplayName = shopifyStatus?.storeName?.trim() || 'Shopify Store';

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
            Store Connection
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            View your store details and recent order updates in one place.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:text-stone-900 disabled:opacity-60 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              isRefreshing ? 'animate-spin text-[#104850]' : 'text-stone-500'
            }`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Alert if query fails */}
      {(isShopifyError || isShopsError) && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-900 text-xs shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to refresh full integration status</p>
              <p className="mt-0.5 text-rose-700">
                {shopifyError instanceof Error ? shopifyError.message : ''}{' '}
                {shopsError instanceof Error ? shopsError.message : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        /* Loading Skeletons */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 h-56 animate-pulse" />
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 h-56 animate-pulse" />
          </div>
          <div className="bg-white rounded-2xl border border-stone-200/80 p-6 h-48 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Row 1: Two Information Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Left Card: Connected Store */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col justify-between space-y-4">
              {/* Card Header */}
              <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50/80 text-[#104850] flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                      Connected Store
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500">
                      {isConfigured
                        ? 'Your store is linked and ready'
                        : 'Your store is not connected'}
                    </p>
                  </div>
                </div>

                {isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200 shrink-0">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" />
                    Disconnected
                  </span>
                )}
              </div>

              {/* Information Rows */}
              <div className="divide-y divide-stone-100 text-sm">
                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Store Website</span>
                  {shopifyStatus?.shopDomain ? (
                    <code className="px-2.5 py-1 bg-stone-100/80 rounded-md text-stone-800 font-mono text-xs font-medium">
                      {shopifyStatus.shopDomain}
                    </code>
                  ) : (
                    <span className="text-stone-400 italic text-xs">Not connected</span>
                  )}
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Store Name</span>
                  <span className="font-semibold text-stone-900">
                    {storeDisplayName}
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Connection Method</span>
                  <span className="font-medium text-stone-900">
                    {isConfigured ? 'Secure automatic connection' : 'Unavailable'}
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Security</span>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      Protected in system
                    </span>
                  ) : (
                    <span className="text-stone-400 italic text-xs">Not protected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Card: Order Update Status */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col justify-between space-y-4">
              {/* Card Header */}
              <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50/80 text-[#104850] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                      Order Update Status
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500">
                      Recent store update activity
                    </p>
                  </div>
                </div>

                {isConfigured ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 shrink-0">
                    Automatic
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-500 shrink-0">
                    Manual
                  </span>
                )}
              </div>

              {/* Information Rows */}
              <div className="divide-y divide-stone-100 text-sm">
                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Last Order Sync</span>
                  <span className="font-semibold text-stone-900">
                    {shopifyStatus?.lastSyncedAt
                      ? formatDate(shopifyStatus.lastSyncedAt, true)
                      : 'Not synced yet'}
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Connected Stores</span>
                  <span className="font-medium text-stone-900">
                    {shops.length === 1 ? '1 connected store' : `${shops.length} connected stores`}
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-stone-500 font-normal">Update Method</span>
                  <span className="font-medium text-stone-900">
                    {isConfigured ? 'Automatic' : 'Manual'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Connected Stores Table */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                Connected Stores
              </h2>
              <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                A quick view of stores linked to this CRM.
              </p>
            </div>

            {shops.length === 0 ? (
              <div className="p-8 text-center text-sm text-stone-500 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
                No stores linked to this CRM yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200/80 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      <th scope="col" className="py-3 px-4 sm:px-6">STORE NAME</th>
                      <th scope="col" className="py-3 px-4">STORE WEBSITE</th>
                      <th scope="col" className="py-3 px-4">STORE ID</th>
                      <th scope="col" className="py-3 px-4">CONNECTED ON</th>
                      <th scope="col" className="py-3 px-4 sm:px-6">LAST ORDER SYNC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800">
                    {shops.map((shop) => {
                      const isCurrentShop =
                        shopifyStatus?.shopDomain?.trim().toLowerCase() ===
                        shop.shopDomain.trim().toLowerCase();
                      const storeNameDisplay = isCurrentShop
                        ? shopifyStatus?.storeName?.trim() || 'connect'
                        : 'Shopify Store';

                      return (
                        <tr key={shop.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="py-4 px-4 sm:px-6 font-bold text-stone-900 whitespace-nowrap">
                            {storeNameDisplay}
                          </td>
                          <td className="py-4 px-4 text-stone-800 font-medium whitespace-nowrap">
                            {shop.shopDomain}
                          </td>
                          <td className="py-4 px-4 font-mono text-xs text-stone-500 whitespace-nowrap">
                            {shop.id}
                          </td>
                          <td className="py-4 px-4 text-stone-700 whitespace-nowrap">
                            {formatDate(shop.createdAt, true)}
                          </td>
                          <td className="py-4 px-4 sm:px-6 text-stone-700 whitespace-nowrap">
                            {shop.lastSyncedAt
                              ? formatDate(shop.lastSyncedAt, true)
                              : 'Not synced yet'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
