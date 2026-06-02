import i18n from '../i18n/config';

export function formatCurrency(amount: number, currency = 'CHF'): string {
  // EN: "CHF 1,234.56" style via Intl; DE: "CHF 1'234.56" (de-CH convention)
  const locale = i18n.language === 'en' ? 'en-GB' : 'de-CH';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unknown currencies
    return `${currency} ${amount.toFixed(2)}`;
  }
}
