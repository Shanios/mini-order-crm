import { Link } from 'react-router';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mb-4">
        <FileQuestion className="w-6 h-6" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">
        Page Not Found
      </h1>
      <p className="mt-2 text-sm text-stone-500 max-w-sm">
        The address you requested does not exist or may have been moved.
      </p>
      <Link
        to="/orders"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#104850] hover:bg-[#0c383e] rounded-lg transition-colors shadow-2xs"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Orders</span>
      </Link>
    </div>
  );
}
