import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { verifyMagicLink } from '../api';
import { translateError } from '../i18n';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function MagicLinkVerifyPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setError(t('auth.noTokenInUrl')); return; }

    verifyMagicLink(token)
      .then(() => navigate('/', { replace: true }))
      .catch(e => setError(translateError(t, e instanceof Error ? e.message : t('auth.linkInvalidOrExpired'))));
  }, [params, navigate, t]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-8 max-w-sm w-full text-center">
        {error ? (
          <>
            <p className="text-danger font-medium mb-2">{t('auth.invalidLink')}</p>
            <p className="text-sm text-secondary mb-4">{error}</p>
            <button onClick={() => navigate('/login')}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm">
              {t('auth.backToSignIn')}
            </button>
          </>
        ) : (
          <>
            <LoadingSpinner />
            <p className="text-sm text-secondary mt-3">{t('auth.verifyingLink')}</p>
          </>
        )}
      </div>
    </div>
  );
}
