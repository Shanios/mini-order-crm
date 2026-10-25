import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white rounded-xl border border-stone-200/80 shadow-xs">
      {icon && (
        <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-stone-100 text-stone-600">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-stone-500 leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
