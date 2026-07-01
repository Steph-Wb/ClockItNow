import { useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import { downloadArbeitsrapport } from '../../api';
import { translateError } from '../../i18n';
import type { Client } from '../../types';

interface Props {
  clients: Client[]; // die aktuell in den Berichte-Filtern selektierten Kunden (muss genau 1 sein)
  from: string;
  to: string;
  billable: 'all' | 'billable' | 'non_billable';
  billed: 'all' | 'billed' | 'unbilled';
  projectIds: number[];
  onClose: () => void;
  onCreated?: () => void;
}

export default function ArbeitsrapportModal({ clients, from, to, billable, billed, projectIds, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const client = clients.length === 1 ? clients[0] : undefined;
  const invalidSelection = clients.length !== 1;
  const [projekt, setProjekt] = useState(client?.rapport_description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toDate = new Date(to);
  const monthPart = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}`;
  const postfix = client?.rapport_postfix != null ? `.${String(client.rapport_postfix).padStart(2, '0')}` : '';
  const rapportNr = `${monthPart}${postfix}`;

  const handleCreate = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadArbeitsrapport({ from, to, clientId: client.id, projektText: projekt, rapportNr, lang: i18n.language, projectIds, billable, billed });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Arbeitsrapport-${rapportNr} ${client.name}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onCreated?.();
      onClose();
    } catch (e) {
      setError(translateError(t, e instanceof Error ? e.message : t('arbeitsrapport.createError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">{t('arbeitsrapport.modalTitle')}</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary"><X size={18} /></button>
        </div>
        {invalidSelection ? (
          <div className="px-5 py-4">
            <p className="text-sm text-red-400">{t('arbeitsrapport.singleClientRequired')}</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs text-secondary mb-1.5 block">{t('arbeitsrapport.clientLabel')}</label>
              <div className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary">{client!.name}</div>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1.5 block">{t('arbeitsrapport.projektLabel')}</label>
              <textarea value={projekt} onChange={e => setProjekt(e.target.value)} rows={2}
                placeholder={t('arbeitsrapport.projektPlaceholder')}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent resize-none" />
            </div>
            <div className="text-xs text-secondary">
              {t('arbeitsrapport.rapportNrLabel')} <span className="text-primary font-medium">{rapportNr}</span> · {t('arbeitsrapport.periodLabel')} {from} – {to}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:text-primary">{t('common.cancel')}</button>
          <button onClick={handleCreate} disabled={busy || invalidSelection}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
            <FileSpreadsheet size={15} /> {busy ? t('arbeitsrapport.creating') : t('arbeitsrapport.createXlsx')}
          </button>
        </div>
      </div>
    </div>
  );
}
