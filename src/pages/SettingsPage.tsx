import { useState } from 'react';
import { Save, Upload, Trash2, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings, openBackupDir } from '../api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import type { AppSettings } from '../types';

// Vollständige IANA-Liste der Laufzeit; Fallback auf Browser-Zone, falls nicht verfügbar.
const TIMEZONES: string[] =
  typeof (Intl as any).supportedValuesOf === 'function'
    ? (Intl as any).supportedValuesOf('timeZone')
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useApi<AppSettings>(() => getSettings(), []);

  const [senderName, setSenderName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(BROWSER_TZ);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);
  const [longTimerHours, setLongTimerHours] = useState(4);
  const [idleMinutes, setIdleMinutes] = useState(10);
  const [backupDir, setBackupDir] = useState('');
  const [backupKeep, setBackupKeep] = useState(14);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (data && !hydrated) {
    setSenderName(data.sender_name ?? '');
    setSenderAddress(data.sender_address ?? '');
    setSignature(data.signature_png ?? null);
    setTimezone(data.timezone || BROWSER_TZ);
    setWorkDays((data.work_days ?? '1,2,3,4,5').split(',').map(Number).filter(n => n >= 1 && n <= 7));
    setWorkStart(data.work_start ?? 9);
    setWorkEnd(data.work_end ?? 17);
    setLongTimerHours(data.long_timer_hours ?? 4);
    setIdleMinutes(data.idle_minutes ?? 10);
    setBackupDir(data.backup_dir ?? '');
    setBackupKeep(data.backup_keep ?? 14);
    setHydrated(true);
  }

  const toggleDay = (d: number) =>
    setWorkDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSignature(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        sender_name: senderName.trim() || null,
        sender_address: senderAddress.trim() || null,
        signature_png: signature,
        timezone,
        work_days: [...workDays].sort((a, b) => a - b).join(','),
        work_start: workStart,
        work_end: workEnd,
        long_timer_hours: longTimerHours,
        idle_minutes: idleMinutes,
        backup_dir: backupDir.trim() || null,
        backup_keep: backupKeep,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary">{t('settings.title')}</h1>
        <LanguageSwitcher />
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-medium text-primary">{t('settings.senderTitle')}</h2>
        <div>
          <label className="text-xs text-secondary mb-1.5 block">{t('settings.senderName')}</label>
          <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder={t('settings.senderNamePlaceholder')}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-xs text-secondary mb-1.5 block">{t('settings.senderAddress')}</label>
          <textarea value={senderAddress} onChange={e => setSenderAddress(e.target.value)} rows={2}
            placeholder={t('settings.senderAddressPlaceholder')}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent resize-none" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-medium text-primary">{t('settings.timezoneTitle')}</h2>
        <p className="text-xs text-secondary">{t('settings.timezoneHelp')}</p>
        <div>
          <label className="text-xs text-secondary mb-1.5 block">{t('settings.timezone')}</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent">
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-medium text-primary">{t('settings.signatureTitle')}</h2>
        <p className="text-xs text-secondary">{t('settings.signatureHelp')}</p>
        {signature && (
          <div className="flex items-center gap-3">
            <img src={signature} alt={t('settings.signatureAlt')} className="h-16 bg-white rounded border border-border p-1 object-contain" />
            <button onClick={() => setSignature(null)}
              className="flex items-center gap-1.5 text-xs text-secondary hover:text-red-400">
              <Trash2 size={14} /> {t('settings.signatureRemove')}
            </button>
          </div>
        )}
        <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:border-accent cursor-pointer w-fit">
          <Upload size={15} /> {signature ? t('settings.signatureReplace') : t('settings.signatureUpload')}
          <input type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </label>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-medium text-primary">{t('settings.desktopTitle')}</h2>
        <p className="text-xs text-secondary">{t('settings.desktopHelp')}</p>

        <div>
          <label className="text-xs text-secondary mb-1.5 block">{t('settings.workDays')}</label>
          <div className="flex rounded-lg overflow-hidden border border-border w-fit">
            {([1, 2, 3, 4, 5, 6, 7] as const).map(d => (
              <button key={d} onClick={() => toggleDay(d)}
                className={`px-3 py-1.5 text-sm transition-colors ${workDays.includes(d) ? 'bg-accent/10 text-accent font-medium' : 'text-secondary hover:text-primary'}`}>
                {t(`settings.dayShort.${d}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.workFrom')}</label>
            <select value={workStart} onChange={e => setWorkStart(Number(e.target.value))}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.workTo')}</label>
            <select value={workEnd} onChange={e => setWorkEnd(Number(e.target.value))}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent">
              {Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.longTimer')}</label>
            <input type="number" min={0.5} max={24} step={0.5} value={longTimerHours}
              onChange={e => setLongTimerHours(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.idleMinutes')}</label>
            <input type="number" min={1} max={240} step={1} value={idleMinutes}
              onChange={e => setIdleMinutes(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
          </div>
        </div>

        <div className="border-t border-border/50 pt-4 space-y-4">
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.backupDir')}</label>
            <div className="flex gap-2">
              <input value={backupDir} onChange={e => setBackupDir(e.target.value)}
                placeholder={t('settings.backupDirPlaceholder')}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
              <button onClick={() => openBackupDir().catch(() => {})} type="button"
                title={t('settings.backupOpenTitle')}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:border-accent whitespace-nowrap">
                <FolderOpen size={15} /> {t('settings.backupOpen')}
              </button>
            </div>
            <p className="text-xs text-secondary mt-1">{t('settings.backupDirHelp')}</p>
            {data?.effective_backup_dir && (
              <p className="text-xs text-secondary mt-1">
                {t('settings.backupCurrent')} <span className="font-mono">{data.effective_backup_dir}</span>
              </p>
            )}
          </div>
          <div className="w-40">
            <label className="text-xs text-secondary mb-1.5 block">{t('settings.backupKeep')}</label>
            <input type="number" min={3} max={365} step={1} value={backupKeep}
              onChange={e => setBackupKeep(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm disabled:opacity-50">
          <Save size={15} /> {saving ? t('common.saving') : t('common.save')}
        </button>
        {saved && <span className="text-sm text-green-400">{t('common.saved')}</span>}
      </div>
    </div>
  );
}
