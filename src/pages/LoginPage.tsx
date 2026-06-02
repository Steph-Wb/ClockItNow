import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthStatus, login, register, sendMagicLink } from '../api';
import { translateError } from '../i18n';

type Tab = 'password' | 'magic';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('password');
  const [hasUser, setHasUser] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAuthStatus().then(d => {
      setHasUser(d.hasUser);
      if (!d.hasUser) setIsRegister(true);
      if (d.loggedIn) navigate('/', { replace: true });
    }).catch(() => {});
  }, [navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) {
        if (password !== password2) { setError(t('errors.auth.passwordMismatch')); return; }
        if (password.length < 8) { setError(t('errors.auth.passwordTooShort')); return; }
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate('/', { replace: true });
    } catch (e) {
      setError(translateError(t, e instanceof Error ? e.message : t('common.error')));
    } finally { setBusy(false); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setInfo(t('auth.emailSent'));
    } catch (e) {
      setError(translateError(t, e instanceof Error ? e.message : t('common.error')));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/logo.svg" alt="" className="w-10 h-10" onError={e => (e.currentTarget.style.display = 'none')} />
          <span className="text-accent font-bold text-2xl tracking-tight">ClockItNow</span>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h1 className="text-lg font-semibold text-primary mb-1">
            {isRegister && !hasUser ? t('auth.setupAccount') : t('auth.login')}
          </h1>
          <p className="text-sm text-secondary mb-5">
            {isRegister && !hasUser ? t('auth.createAccountSubtitle') : t('auth.welcomeBack')}
          </p>

          {/* Tabs – only when user already exists */}
          {hasUser && (
            <div className="flex rounded-lg overflow-hidden border border-border mb-5">
              {([['password', t('auth.tabPassword')], ['magic', t('auth.tabMagicLink')]] as [Tab, string][]).map(([tabKey, label]) => (
                <button key={tabKey} onClick={() => { setTab(tabKey); setError(''); setInfo(''); }}
                  className={`flex-1 py-2 text-sm transition-colors ${tab === tabKey ? 'bg-accent/10 text-accent font-medium' : 'text-secondary hover:text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Password tab / registration */}
          {(!hasUser || tab === 'password') && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-secondary block mb-1">{t('auth.email')}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-secondary block mb-1">{t('auth.password')}</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              {isRegister && (
                <div>
                  <label className="text-xs text-secondary block mb-1">{t('auth.repeatPassword')}</label>
                  <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
                </div>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {busy ? (isRegister ? t('auth.settingUp') : t('auth.loggingIn')) : (isRegister ? t('auth.createAndLogin') : t('auth.login'))}
              </button>
              {hasUser && (
                <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}
                  className="w-full text-xs text-secondary hover:text-primary text-center pt-1">
                  {isRegister ? t('auth.backToLogin') : t('auth.forgotPassword')}
                </button>
              )}
            </form>
          )}

          {/* Magic link tab */}
          {hasUser && tab === 'magic' && (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <div>
                <label className="text-xs text-secondary block mb-1">{t('auth.email')}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              {info && <p className="text-xs text-success">{info}</p>}
              <button type="submit" disabled={busy || !!info}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {busy ? t('auth.sendingEmail') : t('auth.sendLoginLink')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
