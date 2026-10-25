import { formatCurrency } from '../utils/formatters';

interface CurrencyTextProps {
  amount: string | number;
  currencyCode?: string;
  className?: string;
}

export function CurrencyText({ amount, currencyCode = 'USD', className }: CurrencyTextProps) {
  return <span className={className}>{formatCurrency(amount, currencyCode)}</span>;
}
