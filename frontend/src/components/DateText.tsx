import { formatDate } from '../utils/formatters';

interface DateTextProps {
  dateString: string | null | undefined;
  showTime?: boolean;
  className?: string;
  fallback?: string;
}

export function DateText({
  dateString,
  showTime = true,
  className,
  fallback = '—',
}: DateTextProps) {
  return <span className={className}>{formatDate(dateString, showTime, fallback)}</span>;
}
