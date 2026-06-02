import { useTranslation } from 'react-i18next';
import { translateError } from '../../i18n';

interface Props { message: string; onRetry?: () => void; }

export default function ErrorBanner({ message, onRetry }: Props) {
  const { t } = useTranslation();
  const displayed = translateError(t, message);

  return (
    <div className="bg-red-900/30 border border-danger rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-red-300">
      <span className="flex-1">{displayed}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-accent hover:underline">{t('common.retry')}</button>
      )}
    </div>
  );
}
