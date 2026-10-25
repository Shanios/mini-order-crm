import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Package,
  PlusCircle,
  Layers,
  Store,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { fetchShopifyStatus } from '../api/shopify';
import { useAuth } from '../context/useAuth';

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isStoreDetailsExpanded, setIsStoreDetailsExpanded] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('mini_order_crm_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mini_order_crm_sidebar_collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Close mobile drawer on Escape key and handle background scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const { data: statusData, isLoading: isStatusLoading } = useQuery({
    queryKey: ['shopify-status'],
    queryFn: fetchShopifyStatus,
    staleTime: 60_000,
  });

  const shopDomain = statusData?.data?.shopDomain;
  const storeName = statusData?.data?.storeName;
  const isConfigured = statusData?.data?.configured;

  const displayedStoreName = isStatusLoading
    ? 'Checking...'
    : (storeName?.trim() || 'Shopify Store');

  const navLinks = [
    {
      to: '/',
      label: 'Overview',
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/orders',
      label: 'Orders',
      icon: Package,
      end: true,
    },
    {
      to: '/orders/new',
      label: 'Create Order',
      icon: PlusCircle,
      end: true,
    },
    {
      to: '/settings/integration',
      label: 'Store Connection',
      icon: Layers,
      end: false,
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#faf9f6]">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs lg:hidden transition-opacity duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop & Mobile Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-white border-r border-stone-200/80 transition-[width,transform] duration-[280ms] ease-in-out motion-reduce:transition-none lg:translate-x-0 ${
          isSidebarCollapsed ? 'w-64 lg:w-20' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Brand Header */}
        <div
          className={`border-b border-stone-200/70 transition-[padding,height] duration-[280ms] ease-in-out motion-reduce:transition-none overflow-hidden flex items-center justify-between ${
            isSidebarCollapsed
              ? 'h-16 px-4 lg:h-[84px] lg:flex-col lg:justify-center lg:py-2.5 lg:px-0 lg:gap-1.5'
              : 'h-16 px-4'
          }`}
        >
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg bg-[#104850] flex items-center justify-center text-white shadow-xs shrink-0"
              title="Mini Order CRM"
            >
              <Store className="w-4 h-4" />
            </div>
            <div
              className={`overflow-hidden transition-all ease-in-out motion-reduce:transition-none whitespace-nowrap min-w-0 ${
                isSidebarCollapsed
                  ? 'duration-[160ms] opacity-0 max-w-0 pointer-events-none'
                  : 'duration-[180ms] delay-[90ms] opacity-100 max-w-[160px]'
              }`}
            >
              <span className="text-sm font-bold tracking-tight text-stone-900 block leading-tight truncate">
                Mini Order CRM
              </span>
              <span className="text-[11px] font-medium text-stone-500 block truncate">
                Shopify Operations
              </span>
            </div>
          </div>

          {/* Desktop Toggle Control (Collapse / Expand) */}
          <button
            type="button"
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isSidebarCollapsed}
            className="hidden lg:flex p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-stone-600" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="p-2 text-stone-400 hover:text-stone-700 rounded-md lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav
          className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden transition-[padding] duration-[280ms] ease-in-out motion-reduce:transition-none ${
            isSidebarCollapsed ? 'p-3 lg:px-5 lg:py-3' : 'p-3'
          }`}
        >
          {/* Section Header: Workspace */}
          <div
            className={`overflow-hidden transition-all ease-in-out motion-reduce:transition-none ${
              isSidebarCollapsed
                ? 'duration-[160ms] opacity-0 max-h-0'
                : 'duration-[180ms] delay-[90ms] opacity-100 max-h-8 pt-3 pb-1'
            }`}
          >
            <p className="px-3 text-[11px] font-semibold tracking-wider text-stone-500 uppercase whitespace-nowrap">
              Workspace
            </p>
          </div>

          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMobileMenuOpen(false)}
                title={link.label}
                aria-label={link.label}
                className={({ isActive }) =>
                  `group flex items-center h-10 rounded-xl transition-all duration-[280ms] ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/20 overflow-hidden ${
                    isActive
                      ? 'bg-[#104850] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80 font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-white'
                            : 'text-stone-400 group-hover:text-stone-600'
                        }`}
                      />
                    </div>
                    <div
                      className={`overflow-hidden transition-all ease-in-out motion-reduce:transition-none whitespace-nowrap ${
                        isSidebarCollapsed
                          ? 'duration-[160ms] opacity-0 max-w-0 pointer-events-none'
                          : 'duration-[180ms] delay-[90ms] opacity-100 max-w-[180px]'
                      }`}
                    >
                      <span className="truncate pr-3">{link.label}</span>
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer with Store Context and Operator Profile */}
        <div className="p-3 border-t border-stone-200/70 bg-[#fdfcfb] space-y-2 overflow-hidden">
          {/* Store Card (Smoothly fades and collapses on desktop collapse) */}
          <div
            className={`transition-all ease-in-out motion-reduce:transition-none overflow-hidden ${
              isSidebarCollapsed
                ? 'duration-[200ms] lg:max-h-0 lg:opacity-0 lg:scale-95 lg:pointer-events-none lg:mb-0'
                : 'duration-[240ms] delay-[50ms] max-h-60 opacity-100 scale-100 mb-2'
            }`}
            aria-hidden={isSidebarCollapsed}
          >
            <div className="p-2.5 rounded-lg border border-stone-200/60 bg-white shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">
                  YOUR STORE
                </span>
                {isConfigured ? (
                  <span className="flex items-center text-[11px] text-emerald-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center text-[11px] text-amber-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" />
                    Pending
                  </span>
                )}
              </div>

              {/* Clickable Store Name Accordion Toggle */}
              <button
                type="button"
                onClick={() => setIsStoreDetailsExpanded((prev) => !prev)}
                aria-expanded={isStoreDetailsExpanded}
                aria-controls="sidebar-store-details"
                tabIndex={isSidebarCollapsed ? -1 : 0}
                className="mt-1.5 w-full flex items-center justify-between text-left group hover:opacity-80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#104850]/20 rounded py-0.5 transition-opacity"
                title={
                  isStoreDetailsExpanded
                    ? 'Collapse store details'
                    : 'Expand store details'
                }
              >
                <span
                  className="text-xs font-semibold text-stone-800 truncate"
                  title={displayedStoreName}
                >
                  {displayedStoreName}
                </span>
                <span className="text-stone-400 group-hover:text-stone-600 shrink-0 ml-1.5 transition-colors">
                  {isStoreDetailsExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>

              {/* Expandable Domain Details */}
              <div
                id="sidebar-store-details"
                role="region"
                aria-label="Store details"
                className={`transition-all duration-200 ease-in-out overflow-hidden ${
                  isStoreDetailsExpanded
                    ? 'max-h-24 opacity-100 mt-2 pt-2 border-t border-stone-100'
                    : 'max-h-0 opacity-0'
                }`}
              >
                <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 block">
                  Store domain
                </span>
                <p
                  className="mt-0.5 text-xs font-medium text-stone-700 truncate"
                  title={shopDomain || 'Not connected'}
                >
                  {shopDomain || 'Not connected'}
                </p>
              </div>
            </div>
          </div>

          {/* Operator User & Sign Out */}
          <div
            className={`rounded-xl border transition-all duration-[280ms] ease-in-out motion-reduce:transition-none overflow-hidden ${
              isSidebarCollapsed
                ? 'p-1.5 flex flex-col items-center gap-2 bg-transparent border-transparent lg:w-10 lg:mx-auto'
                : 'p-2 flex items-center justify-between bg-stone-50 border-stone-200/60'
            }`}
          >
            <div className="flex items-center min-w-0">
              <div
                className="w-7 h-7 rounded-full bg-[#104850]/10 text-[#104850] flex items-center justify-center shrink-0 font-bold text-xs"
                title={user?.username || 'Operator'}
              >
                {(user?.username?.[0] || 'O').toUpperCase()}
              </div>
              <div
                className={`overflow-hidden transition-all ease-in-out motion-reduce:transition-none whitespace-nowrap min-w-0 ${
                  isSidebarCollapsed
                    ? 'duration-[160ms] opacity-0 max-w-0 pointer-events-none'
                    : 'duration-[180ms] delay-[90ms] opacity-100 max-w-[120px] ml-2'
                }`}
              >
                <span
                  className="text-xs font-semibold text-stone-800 truncate block"
                  title={user?.username || 'Operator'}
                >
                  {user?.username || 'Operator'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-1.5 text-[#DC2626] hover:bg-[#FEF2F2] rounded-md transition-colors cursor-pointer shrink-0"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4 text-[#DC2626]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area — Synchronized Width & Padding Transition */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-[280ms] ease-in-out motion-reduce:transition-none ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Mobile Navigation Header (Only visible on screens < lg) */}
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-xs border-b border-stone-200/80 px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#104850] flex items-center justify-center text-white shadow-xs">
              <Store className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-bold tracking-tight text-stone-900 leading-tight">
              Mini Order CRM
            </span>
          </div>
          <button
            type="button"
            className="p-2 text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 lg:px-6 lg:py-8 max-w-7xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
