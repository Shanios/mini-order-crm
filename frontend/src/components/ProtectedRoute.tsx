import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { RefreshCw } from 'lucide-react';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#104850] flex items-center justify-center text-white shadow-xs animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-xs font-medium text-stone-500">Checking operator session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <Outlet />;
}
