import { useState, useCallback } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getClients, createClient, updateClient, archiveClient } from '../api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import type { Client } from '../types';

interface EditingClient { id: number; name: string; street: string; zip_city: string; rapport_postfix: string; rapport_description: string; currency: string; rounding_step: string; rounding_mode: 'up' | 'down'; }

export default function ClientsPage() {
  const { t } = useTranslation();
  const [showActive, setShowActive] = useState<boolean>(true);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<EditingClient | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchClients = useCallback(() => getClients(), []);
  const { data: allClients, isLoading, error, reload } = useApi<Client[]>(fetchClients, []);

  const clients = (allClients ?? []).filter(c => showActive ? c.is_active : !c.is_active);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try { await createClient({ name: newName.trim() }); setNewName(''); reload(); }
    finally { setAdding(false); }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    await updateClient(editing.id, {
      name: editing.name, street: editing.street, zip_city: editing.zip_city,
      rapport_postfix: editing.rapport_postfix === '' ? null : Number(editing.rapport_postfix),
      rapport_description: editing.rapport_description, currency: editing.currency,
      rounding_step: Number(editing.rounding_step), rounding_mode: editing.rounding_mode,
    } as any);
    setEditing(null);
    reload();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary">{t('clients.title')}</h1>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {[{ label: t('common.active'), val: true }, { label: t('common.archived'), val: false }].map(({ label, val }) => (
            <button key={label} onClick={() => setShowActive(val)}
              className={`px-3 py-1.5 text-sm transition-colors ${showActive === val ? 'bg-accent/10 text-accent' : 'text-secondary hover:text-primary'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Add new client */}
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('clients.addPlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
        <button onClick={handleAdd} disabled={adding || !newName.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm disabled:opacity-50">
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {!isLoading && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th className="text-left px-4 py-3">{t('clients.colName')}</th>
                <th className="text-left px-4 py-3">{t('clients.colStreet')}</th>
                <th className="text-left px-4 py-3">{t('clients.colZipCity')}</th>
                <th className="text-left px-4 py-3">{t('clients.colPostfix')}</th>
                <th className="text-left px-4 py-3">{t('clients.colDescription')}</th>
                <th className="text-left px-4 py-3">{t('clients.colRounding')}</th>
                <th className="text-left px-4 py-3">{t('clients.colCurrency')}</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-secondary">{t('clients.noClients')}</td></tr>
              )}
              {clients.map(client => (
                <tr key={client.id} className="border-b border-border/50 hover:bg-white/3 transition-colors">
                  {editing?.id === client.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                          className="bg-background border border-accent rounded px-2 py-1 text-sm text-primary outline-none w-full" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editing.street} onChange={e => setEditing({ ...editing, street: e.target.value })}
                          placeholder={t('clients.streetPlaceholder')}
                          className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none w-full" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editing.zip_city} onChange={e => setEditing({ ...editing, zip_city: e.target.value })}
                          placeholder={t('clients.zipCityPlaceholder')}
                          className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none w-full" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} max={99} value={editing.rapport_postfix}
                          onChange={e => setEditing({ ...editing, rapport_postfix: e.target.value })}
                          placeholder={t('clients.postfixPlaceholder')}
                          className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none w-16" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editing.rapport_description} onChange={e => setEditing({ ...editing, rapport_description: e.target.value })}
                          placeholder={t('clients.descriptionPlaceholder')}
                          className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none w-full" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <select value={editing.rounding_step} onChange={e => setEditing({ ...editing, rounding_step: e.target.value })}
                            className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none">
                            {[5, 10, 15].map(s => <option key={s} value={s}>{s} min</option>)}
                          </select>
                          <select value={editing.rounding_mode} onChange={e => setEditing({ ...editing, rounding_mode: e.target.value as 'up' | 'down' })}
                            className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none">
                            <option value="up">{t('clients.roundingUp')}</option>
                            <option value="down">{t('clients.roundingDown')}</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}
                          className="bg-background border border-border rounded px-2 py-1 text-sm text-primary outline-none">
                          {['CHF', 'EUR', 'USD', 'GBP'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={handleSaveEdit} className="p-1 text-accent hover:text-accent-hover rounded"><Check size={14} /></button>
                          <button onClick={() => setEditing(null)} className="p-1 text-secondary hover:text-primary rounded"><X size={14} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-primary font-medium">{client.name}</td>
                      <td className="px-4 py-3 text-secondary">{client.street || '–'}</td>
                      <td className="px-4 py-3 text-secondary">{client.zip_city || '–'}</td>
                      <td className="px-4 py-3 text-secondary tabular-nums">{client.rapport_postfix != null ? String(client.rapport_postfix).padStart(2, '0') : '–'}</td>
                      <td className="px-4 py-3 text-secondary max-w-xs truncate" title={client.rapport_description || ''}>{client.rapport_description || '–'}</td>
                      <td className="px-4 py-3 text-secondary whitespace-nowrap">
                        {client.rounding_step ?? 15} min · {(client.rounding_mode ?? 'up') === 'up' ? t('clients.roundingUp') : t('clients.roundingDown')}
                      </td>
                      <td className="px-4 py-3 text-secondary">{client.currency}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing({ id: client.id, name: client.name, street: client.street ?? '', zip_city: client.zip_city ?? '', rapport_postfix: client.rapport_postfix != null ? String(client.rapport_postfix) : '', rapport_description: client.rapport_description ?? '', currency: client.currency, rounding_step: String(client.rounding_step ?? 15), rounding_mode: client.rounding_mode ?? 'up' })}
                            className="p-1 text-secondary hover:text-accent rounded"><Pencil size={14} /></button>
                          <button onClick={async () => { await (client.is_active ? archiveClient(client.id) : updateClient(client.id, { is_active: 1 })); reload(); }}
                            className="p-1 text-secondary hover:text-amber-400 rounded" title={client.is_active ? t('common.archive') : t('common.restore')}>
                            {client.is_active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
