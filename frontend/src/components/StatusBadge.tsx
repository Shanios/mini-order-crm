interface StatusBadgeProps {
  status: string | null | undefined;
  type: 'financial' | 'fulfillment';
  className?: string;
}

export function StatusBadge({ status, type, className = '' }: StatusBadgeProps) {
  const normalized = (status || '').toUpperCase().trim();

  let label = status || (type === 'financial' ? 'Unknown' : 'Unfulfilled');
  let colorClasses = 'bg-stone-100 text-stone-700 border-stone-200';

  if (type === 'financial') {
    switch (normalized) {
      case 'PAID':
        label = 'Paid';
        colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
        break;
      case 'PENDING':
        label = 'Pending';
        colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/80';
        break;
      case 'AUTHORIZED':
        label = 'Authorized';
        colorClasses = 'bg-sky-50 text-sky-800 border-sky-200/80';
        break;
      case 'PARTIALLY_PAID':
        label = 'Partially Paid';
        colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/80';
        break;
      case 'REFUNDED':
        label = 'Refunded';
        colorClasses = 'bg-stone-100 text-stone-700 border-stone-300';
        break;
      case 'PARTIALLY_REFUNDED':
        label = 'Part. Refunded';
        colorClasses = 'bg-stone-100 text-stone-700 border-stone-300';
        break;
      case 'VOIDED':
        label = 'Voided';
        colorClasses = 'bg-rose-50 text-rose-800 border-rose-200/80';
        break;
      default:
        label = status ? status.toLowerCase() : 'Unspecified';
        colorClasses = 'bg-stone-100 text-stone-600 border-stone-200';
        break;
    }
  } else {
    // fulfillment status
    switch (normalized) {
      case 'FULFILLED':
        label = 'Fulfilled';
        colorClasses = 'bg-teal-50 text-[#104850] border-teal-200/80';
        break;
      case 'UNFULFILLED':
        label = 'Unfulfilled';
        colorClasses = 'bg-stone-100 text-stone-700 border-stone-300';
        break;
      case 'PARTIAL':
      case 'PARTIALLY_FULFILLED':
        label = 'Partially Fulfilled';
        colorClasses = 'bg-amber-50 text-amber-800 border-amber-200/80';
        break;
      case 'RESTOCKED':
        label = 'Restocked';
        colorClasses = 'bg-purple-50 text-purple-800 border-purple-200/80';
        break;
      default:
        label = status ? status.toLowerCase() : 'Unfulfilled';
        colorClasses = 'bg-stone-100 text-stone-600 border-stone-200';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border tracking-wide capitalize ${colorClasses} ${className}`}
    >
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
