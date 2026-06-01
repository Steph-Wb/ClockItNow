import { useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { downloadArbeitsrapport } from '../../api';
import type { Client } from '../../types';

interface Props {
  clients: Client[];
  from: string;
  to: string;
  defaultClientId?: number;
  defaultProjekt?: string;
  onClose: () => void;
}

export default function ArbeitsrapportModal({ clients, from, to, defaultClientId, defaultProjekt, onClose }: Props) {
  const initialClientId = defaultClientId ?? clients[0]?.id;
  const initialClient = clients.find(c => c.id === initialClientId);
  const [clientId, setClientId] = useState<number | undefined>(initialClientId);
  const [projekt, setProjekt] = useState(defaultProjekt ?? initialClient?.rapport_description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Beim Kundenwechsel die hinterlegte Rapport-Beschreibung vorbefüllen
  const onClientChange = (id: number | undefined) => {
    setClientId(id);
    const desc = clients.find(c => c.id === id)?.rapport_description ?? '';
    setProjekt(desc);
  };

  const toDate = new Date(to);
  const monthPart = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}`;
  const selectedClient = clients.find(c => c.id === clientId);
  const postfix = selectedClient?.rapport_postfix != null ? `.${String(selectedClient.rapport_postfix).padStart(2, '0')}` : '';
  const rapportNr = `${monthPart}${postfix}`;

  const handleCreate = async () => {
    if (!clientId) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadArbeitsrapport({ from, to, clientId, projektText: projekt, rapportNr });
      const clientName = clients.find(c => c.id === clientId)?.name ?? '';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Arbeitsrapport-${rapportNr} ${clientName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Erstellung');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Arbeitsrapport erstellen</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-secondary mb-1.5 block">Kunde *</label>
            <select value={clientId ?? ''} onChange={e => onClientChange(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent">
              <option value="">Kunde wählen</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1.5 block">Projekt / Beschreibung</label>
            <textarea value={projekt} onChange={e => setProjekt(e.target.value)} rows={2}
              placeholder='z.B. Diverse Aufträge gemäss der Liste "abas support daily"'
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent resize-none" />
          </div>
          <div className="text-xs text-secondary">
            Rapport-Nr.: <span className="text-primary font-medium">{rapportNr}</span> · Zeitraum: {from} – {to}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:text-primary">Abbrechen</button>
          <button onClick={handleCreate} disabled={busy || !clientId}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
            <FileSpreadsheet size={15} /> {busy ? 'Erstellen...' : 'Erstellen (.xlsx)'}
          </button>
        </div>
      </div>
    </div>
  );
}
