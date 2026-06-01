export function formatCurrency(amount: number, currency = 'CHF'): string {
  return `${currency} ${amount.toFixed(2)}`;
}
