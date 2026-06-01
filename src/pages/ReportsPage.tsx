import { useState, useCallback } from 'react';
import { Download, Printer, Upload, FileSpreadsheet } from 'lucide-react';
import ImportModal from '../components/Import/ImportModal';
import ArbeitsrapportModal from '../components/Reports/ArbeitsrapportModal';
import { format } from 'date-fns';
import DateRangePicker from '../components/ui/DateRangePicker';
import { getReports, getClients, getProjects } from '../api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { formatDuration } from '../utils/formatDuration';
import { formatCurrency } from '../utils/formatCurrency';
import { formatDate, formatTime } from '../utils/dateLocale';
import type { Client, Project, ReportEntry } from '../types';

export default function ReportsPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [billable, setBillable] = useState<'all' | 'billable' | 'non_billable'>('all');
  const [showImport, setShowImport] = useState(false);
  const [showRapport, setShowRapport] = useState(false);
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [groupBy, setGroupBy] = useState('project');
  const [trigger, setTrigger] = useState(0);

  const fetchReport = useCallback(() => getReports({
    from, to, clientIds: selectedClients, projectIds: selectedProjects, billable, groupBy,
  }), [trigger]); // eslint-disable-line

  const { data: report, isLoading, error, reload } = useApi(fetchReport, [trigger]);
  const { data: clients } = useApi<Client[]>(() => getClients(), []);
  const { data: projects } = useApi<Project[]>(() => getProjects(), []);

  const search = () => setTrigger(t => t + 1);

  const toggleClient = (id: number) => setSelectedClients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleProject = (id: number) => setSelectedProjects(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ['Datum', 'Beschreibung', 'Projekt', 'Kunde', 'Start', 'Ende', 'Dauer', 'Stundensatz', 'Betrag'],
      ...report.entries.map((e: ReportEntry) => [
        formatDate(e.start_time),
        e.description ?? '',
        e.project_name ?? '',
        e.client_name ?? '',
        formatTime(e.start_time),
        e.end_time ? formatTime(e.end_time) : '',
        formatDuration(e.duration_seconds),
        e.hourly_rate ? formatCurrency(e.hourly_rate) : '',
        formatCurrency(e.amount),
      ]),
      ['', '', '', '', '', 'TOTAL', formatDuration(report.totalSeconds), '', formatCurrency(report.totalAmount)],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Rapport_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!report) return;
    const rows = report.entries.map((e: ReportEntry) => `
      <tr>
        <td>${formatDate(e.start_time)}</td>
        <td>${e.description ?? ''}</td>
        <td>${e.project_name ?? ''}</td>
        <td>${e.client_name ?? ''}</td>
        <td>${formatTime(e.start_time)} – ${e.end_time ? formatTime(e.end_time) : ''}</td>
        <td>${formatDuration(e.duration_seconds)}</td>
        <td>${e.is_billable ? formatCurrency(e.amount) : '–'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Arbeitsrapport ${from} – ${to}</title>
      <style>
        body { font-family: sans-serif; font-size: 11px; color: #000; margin: 20px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p { margin: 2px 0 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 1px solid #d1d5db; font-size: 10px; text-transform: uppercase; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        .total { font-weight: bold; background: #f9fafb; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Arbeitsrapport</h1>
      <p>Zeitraum: ${formatDate(from)} – ${formatDate(to)}</p>
      <table>
        <thead><tr>
          <th>Datum</th><th>Beschreibung</th><th>Projekt</th><th>Kunde</th>
          <th>Zeit</th><th>Dauer</th><th>Betrag</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total">
          <td colspan="5">TOTAL</td>
          <td>${formatDuration(report.totalSeconds)}</td>
          <td>${formatCurrency(report.totalAmount)}</td>
        </tr></tfoot>
      </table>
      <script>window.onload=()=>{ window.print(); }</script>
      </body></html>`;
    const w = window.open('', '_blank'); w?.document.write(html); w?.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary">Berichte</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:border-accent">
            <Upload size={15} /> Clockify importieren
          </button>
          <button onClick={exportCsv} disabled={!report?.entries.length}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:border-accent disabled:opacity-40">
            <Download size={15} /> CSV
          </button>
          <button onClick={printReport} disabled={!report?.entries.length}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:border-accent disabled:opacity-40">
            <Printer size={15} /> Drucken
          </button>
          <button onClick={() => setShowRapport(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm">
            <FileSpreadsheet size={15} /> Arbeitsrapport (.xlsx)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-secondary block mb-1.5">Zeitraum</label>
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">Abrechenbarkeit</label>
            <select value={billable} onChange={e => setBillable(e.target.value as typeof billable)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none">
              <option value="all">Alle</option>
              <option value="billable">Abrechenbar</option>
              <option value="non_billable">Nicht abrechenbar</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">Gruppierung</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none">
              <option value="project">Projekt</option>
              <option value="client">Kunde</option>
              <option value="day">Tag</option>
            </select>
          </div>
          <button onClick={search}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm ml-auto">
            Anzeigen
          </button>
        </div>

        {/* Multi-select filters */}
        {(clients ?? []).length > 0 && (
          <div>
            <label className="text-xs text-secondary block mb-1.5">Kunden filtern</label>
            <div className="flex flex-wrap gap-2">
              {(clients ?? []).filter(c => c.is_active).map(c => (
                <button key={c.id} onClick={() => toggleClient(c.id)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${selectedClients.includes(c.id) ? 'bg-accent text-white' : 'bg-background border border-border text-secondary hover:text-primary'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {(projects ?? []).length > 0 && (
          <div>
            <label className="text-xs text-secondary block mb-1.5">Projekte filtern</label>
            <div className="flex flex-wrap gap-2">
              {(projects ?? []).filter(p => p.is_active).map(p => (
                <button key={p.id} onClick={() => toggleProject(p.id)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors flex items-center gap-1.5 ${selectedProjects.includes(p.id) ? 'bg-accent text-white' : 'bg-background border border-border text-secondary hover:text-primary'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {report && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th className="text-left px-4 py-3">Datum</th>
                <th className="text-left px-4 py-3">Beschreibung</th>
                <th className="text-left px-4 py-3">Projekt</th>
                <th className="text-left px-4 py-3">Kunde</th>
                <th className="text-right px-4 py-3">Start – Ende</th>
                <th className="text-right px-4 py-3">Dauer</th>
                <th className="text-right px-4 py-3">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-secondary">Keine Einträge im gewählten Zeitraum</td></tr>
              )}
              {report.entries.map((e: ReportEntry) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">{formatDate(e.start_time)}</td>
                  <td className="px-4 py-3 text-primary">{e.description || <span className="text-secondary italic">–</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {e.project_color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.project_color }} />}
                      <span className="text-secondary">{e.project_name ?? '–'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-secondary">{e.client_name ?? '–'}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-secondary whitespace-nowrap">
                    {formatTime(e.start_time)} – {e.end_time ? formatTime(e.end_time) : '–'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-primary">{formatDuration(e.duration_seconds)}</td>
                  <td className="px-4 py-3 text-right text-secondary">{e.is_billable ? formatCurrency(e.amount) : '–'}</td>
                </tr>
              ))}
            </tbody>
            {report.entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-sidebar/50">
                  <td colSpan={5} className="px-4 py-3 text-xs text-secondary font-medium uppercase">TOTAL</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-primary tabular-nums">{formatDuration(report.totalSeconds)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(report.totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setTrigger(t => t + 1); }}
        />
      )}

      {showRapport && (
        <ArbeitsrapportModal
          clients={(clients ?? []).filter(c => c.is_active)}
          from={from}
          to={to}
          defaultClientId={selectedClients.length === 1 ? selectedClients[0] : undefined}
          onClose={() => setShowRapport(false)}
        />
      )}
    </div>
  );
}
