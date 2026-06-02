import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project, Client } from '../../types';

interface Props {
  project?: Project | null;
  clients: Client[];
  onSave: (data: Partial<Project>) => Promise<void>;
  onClose: () => void;
}

const PRESET_COLORS = ['#00BCD4', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#F44336', '#FF5722'];

export default function ProjectModal({ project, clients, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [color, setColor] = useState('#00BCD4');
  const [hourlyRate, setHourlyRate] = useState('0');
  const [isBillable, setIsBillable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setClientId(project.client_id);
      setColor(project.color);
      setHourlyRate(String(project.hourly_rate));
      setIsBillable(!!project.is_billable);
    }
  }, [project]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name, client_id: clientId, color, hourly_rate: parseFloat(hourlyRate) || 0, is_billable: isBillable ? 1 : 0 });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">{project ? t('projects.modalEditTitle') : t('projects.modalNewTitle')}</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('projects.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('projects.namePlaceholder')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('projects.clientLabel')}</label>
            <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent">
              <option value="">{t('projects.noClient')}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('projects.colorLabel')}</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent p-0" title={t('projects.customColor')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1.5 block">{t('projects.hourlyRateLabel')}</label>
            <input type="number" min="0" step="0.5" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isBillable} onChange={e => setIsBillable(e.target.checked)}
              className="rounded border-border" />
            <span className="text-sm text-primary">{t('projects.billableLabel')}</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:text-primary">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
