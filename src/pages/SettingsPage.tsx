import { useState } from 'react';
import { Save, Upload, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings } from '../api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import type { AppSettings } from '../types';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useApi<AppSettings>(() => getSettings(), []);

  const [senderName, setSenderName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (data && !hydrated) {
    setSenderName(data.sender_name ?? '');
    setSenderAddress(data.sender_address ?? '');
    setSignature(data.signature_png ?? null);
    setHydrated(true);
  }

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
