import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { getAuthStatus, login, register, sendMagicLink } from '../api';

type Tab = 'password' | 'magic';

export default function LoginPage() {
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
        if (password !== password2) { setError('Passwörter stimmen nicht überein'); return; }
        if (password.length < 8) { setError('Passwort muss mindestens 8 Zeichen haben'); return; }
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally { setBusy(false); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setInfo('E-Mail gesendet! Prüfe dein Postfach – der Link ist 15 Minuten gültig.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
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
            {isRegister && !hasUser ? 'Konto einrichten' : 'Anmelden'}
          </h1>
          <p className="text-sm text-secondary mb-5">
            {isRegister && !hasUser ? 'Erstelle dein persönliches Konto.' : 'Willkommen zurück.'}
          </p>

          {/* Tabs – nur wenn User schon existiert */}
          {hasUser && (
            <div className="flex rounded-lg overflow-hidden border border-border mb-5">
              {([['password', 'Passwort'], ['magic', 'Magic Link']] as [Tab, string][]).map(([t, l]) => (
                <button key={t} onClick={() => { setTab(t); setError(''); setInfo(''); }}
                  className={`flex-1 py-2 text-sm transition-colors ${tab === t ? 'bg-accent/10 text-accent font-medium' : 'text-secondary hover:text-primary'}`}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Passwort-Tab / Registrierung */}
          {(!hasUser || tab === 'password') && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-secondary block mb-1">E-Mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-secondary block mb-1">Passwort</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              {isRegister && (
                <div>
                  <label className="text-xs text-secondary block mb-1">Passwort wiederholen</label>
                  <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
                </div>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {busy ? (isRegister ? 'Wird eingerichtet...' : 'Anmelden...') : (isRegister ? 'Konto erstellen & einloggen' : 'Anmelden')}
              </button>
              {hasUser && (
                <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}
                  className="w-full text-xs text-secondary hover:text-primary text-center pt-1">
                  {isRegister ? '← Zurück zum Login' : 'Passwort vergessen?'}
                </button>
              )}
            </form>
          )}

          {/* Magic-Link-Tab */}
          {hasUser && tab === 'magic' && (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <div>
                <label className="text-xs text-secondary block mb-1">E-Mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              {info && <p className="text-xs text-success">{info}</p>}
              <button type="submit" disabled={busy || !!info}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {busy ? 'Sende E-Mail...' : 'Anmeldelink zusenden'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
