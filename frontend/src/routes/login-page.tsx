import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../api/client';
import {
  ShoppingBag,
  Package,
  User,
  BarChart2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to target or default orders
  const destination = (location.state as { from?: string } | null)?.from || '/orders';

  if (!isLoading && isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage('Please provide both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ username: trimmedUsername, password });
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'INVALID_CREDENTIALS') {
          setErrorMessage('Invalid credentials. The username or password is incorrect.');
        } else if (err.status === 429 || err.code === 'TOO_MANY_REQUESTS') {
          setErrorMessage('Too many failed login attempts. Please try again later.');
        } else {
          setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
        }
      } else {
        setErrorMessage('Unable to connect to the authentication service.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#faf9f6]">
      {/* Left Panel: Deep Teal Branding & Features (Desktop Split 50%) */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 xl:p-16 bg-[#072429] text-white overflow-hidden select-none">
        {/* Subtle Decorative Curved Gradient Arcs Matching Reference */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Radial depth glow */}
          <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] rounded-full bg-[#104850]/40 blur-3xl" />
          <div className="absolute bottom-10 right-0 w-[500px] h-[500px] rounded-full bg-[#0d3b42]/30 blur-2xl" />

          {/* Sweeping organic curves matching reference screenshot */}
          <svg
            className="absolute right-0 top-0 h-full w-auto text-[#0e3b42]/40"
            viewBox="0 0 500 1000"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <path
              d="M500 0C320 180 200 450 200 700C200 850 260 950 500 1000V0Z"
              fill="currentColor"
              fillOpacity="0.4"
            />
            <path
              d="M500 100C380 260 300 480 300 720C300 860 350 940 500 1000V100Z"
              fill="#14535c"
              fillOpacity="0.25"
            />
          </svg>
        </div>

        {/* Top Branding Logo */}
        <div className="relative z-10 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shadow-xs">
            <ShoppingBag className="w-5 h-5 text-teal-300" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-sans">
            OrderCRM
          </span>
        </div>

        {/* Center Content: Main Heading, Description, and Feature Rows */}
        <div className="relative z-10 my-auto py-12 max-w-lg">
          {/* Main Heading with Exact Line Breaks */}
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
            Manage your
            <br />
            store orders, all
            <br />
            in one place.
          </h1>

          {/* Description */}
          <p className="mt-6 text-sm xl:text-base text-stone-300/80 leading-relaxed max-w-md">
            Stay on top of your Shopify orders, customers and updates with a simple
            and focused CRM built for growing stores.
          </p>

          {/* Feature Highlights (3 Rows) */}
          <div className="mt-10 space-y-5">
            {/* Feature 1 */}
            <div className="flex items-center space-x-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 text-white border border-white/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-teal-200" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Sync orders automatically
                </h3>
                <p className="text-xs text-stone-300/70 mt-0.5">
                  Keep your store data up to date
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center space-x-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 text-white border border-white/10 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-teal-200" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Manage customers
                </h3>
                <p className="text-xs text-stone-300/70 mt-0.5">
                  View order history and details
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center space-x-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 text-white border border-white/10 flex items-center justify-center shrink-0">
                <BarChart2 className="w-5 h-5 text-teal-200" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Simple and organized
                </h3>
                <p className="text-xs text-stone-300/70 mt-0.5">
                  Everything you need, without the clutter
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 pt-4">
          <p className="text-xs text-stone-400/70">
            &copy; 2026 OrderCRM. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel: Login Form (Desktop 50%, Full width on mobile) */}
      <div className="flex-1 flex flex-col justify-between lg:justify-center items-center p-6 sm:p-10 lg:p-16 min-h-screen bg-white lg:bg-[#fbfbf9]/60">
        {/* Mobile Header (Visible only on screens < lg) */}
        <div className="w-full max-w-[440px] flex items-center justify-between lg:hidden pt-4 pb-8">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#104850] text-white flex items-center justify-center shadow-xs">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-stone-900">
              OrderCRM
            </span>
          </div>
        </div>

        {/* Centered Login Card */}
        <div className="w-full max-w-[440px] bg-white rounded-2xl border border-stone-200/90 shadow-sm p-8 sm:p-10 my-auto space-y-6">
          {/* Card Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Sign in to your OrderCRM account.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 mr-2 mt-0.5 text-rose-600 shrink-0" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Username Input */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-stone-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Enter your username"
                  className="block w-full pl-10 pr-3.5 py-2.5 text-sm text-stone-900 bg-white border border-stone-200 rounded-xl placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] transition-all disabled:bg-stone-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Password Input with Show/Hide Toggle */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-stone-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Enter your password"
                  className="block w-full pl-10 pr-10 py-2.5 text-sm text-stone-900 bg-white border border-stone-200 rounded-xl placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-[#104850]/20 focus:border-[#104850] transition-all disabled:bg-stone-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 focus:outline-hidden cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Primary Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !username.trim() || !password}
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#0e3b42] hover:bg-[#072429] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#104850] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer flex items-center justify-center"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Mobile Footer Copyright */}
        <div className="w-full max-w-[440px] text-center lg:hidden pb-4 pt-6">
          <p className="text-xs text-stone-400">
            &copy; 2026 OrderCRM. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
