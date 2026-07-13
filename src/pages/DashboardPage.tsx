import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, parseISO, differenceInDays, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getDashboard, getSettings, updateSettings } from '../api';
import { useApi } from '../hooks/useApi';
import KpiCards from '../components/Dashboard/KpiCards';
import DashboardBarChart from '../components/Dashboard/BarChart';
import ProjectBreakdown from '../components/Dashboard/ProjectBreakdown';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import DateRangePicker from '../components/ui/DateRangePicker';
import { formatDuration } from '../utils/formatDuration';

type GoalPeriod = 'day' | 'week' | 'month';
interface Goal { amount: number; period: GoalPeriod; }

const WEEK_OPTS = { weekStartsOn: 1 as const };
const LS_FROM   = 'dashboard_from';
const LS_TO     = 'dashboard_to';
const LS_GOAL_A = 'goal_amount';
const LS_GOAL_P = 'goal_period';

export default function DashboardPage() {
  const { t } = useTranslation();

  const [from, setFromState] = useState(() =>
    localStorage.getItem(LS_FROM) ?? format(startOfWeek(new Date(), WEEK_OPTS), 'yyyy-MM-dd')
  );
  const [to, setToState] = useState(() =>
    localStorage.getItem(LS_TO) ?? format(endOfWeek(new Date(), WEEK_OPTS), 'yyyy-MM-dd')
  );

  const setFrom = (v: string) => { setFromState(v); localStorage.setItem(LS_FROM, v); };
  const setTo   = (v: string) => { setToState(v);   localStorage.setItem(LS_TO,   v); };

  // Ziel liegt serverseitig in app_settings, damit Browser und Electron-App
  // denselben Wert sehen (früher: localStorage, der ist pro App getrennt)
  const settingsApi = useApi(getSettings, []);
  const goal: Goal | null =
    settingsApi.data?.goal_amount && settingsApi.data.goal_period
      ? { amount: settingsApi.data.goal_amount, period: settingsApi.data.goal_period }
      : null;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalPeriodInput, setGoalPeriodInput] = useState<GoalPeriod>('month');

  // Einmalige Übernahme eines alten localStorage-Ziels auf den Server
  useEffect(() => {
    if (!settingsApi.data) return;
    const a = localStorage.getItem(LS_GOAL_A);
    const p = localStorage.getItem(LS_GOAL_P);
    if (!a || !p) return;
    localStorage.removeItem(LS_GOAL_A);
    localStorage.removeItem(LS_GOAL_P);
    if (settingsApi.data.goal_amount == null && Number(a) > 0) {
      updateSettings({ goal_amount: Number(a), goal_period: p as GoalPeriod })
        .then(() => settingsApi.reload())
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsApi.data]);

  const openGoalModal = () => {
    setGoalInput(goal ? String(goal.amount) : '');
    setGoalPeriodInput(goal?.period ?? 'month');
    setEditingGoal(true);
  };

  const saveGoal = async () => {
    const amount = parseFloat(goalInput.replace(',', '.'));
    if (!isNaN(amount) && amount > 0) {
      await updateSettings({ goal_amount: amount, goal_period: goalPeriodInput }).catch(() => {});
      settingsApi.reload();
    }
    setEditingGoal(false);
  };

  const clearGoal = async () => {
    await updateSettings({ goal_amount: null, goal_period: null }).catch(() => {});
    settingsApi.reload();
    setEditingGoal(false);
  };

  const fetchFn = useCallback(() => getDashboard('custom', from, to), [from, to]);
  const { data, isLoading, error, reload } = useApi(fetchFn, [from, to]);

  const navigate = (dir: -1 | 1) => {
    const f = parseISO(from);
    const t2 = parseISO(to);
    const span = differenceInDays(t2, f) + 1;
    setFrom(format(addDays(f, dir * span), 'yyyy-MM-dd'));
    setTo(format(addDays(t2, dir * span), 'yyyy-MM-dd'));
  };

  return (
    <div className="space-y-6">
      {/* Period picker row */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-white/5 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <DateRangePicker from={from} to={to} onChange={(f, t2) => { setFrom(f); setTo(t2); }} />
        <button onClick={() => navigate(1)} className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-white/5 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {data && (
        <>
          <KpiCards
            totalSeconds={data.totalSeconds}
            billableAmount={data.billableAmount}
            billedAmount={data.billedAmount}
            billableSeconds={data.billableSeconds}
            billablePercent={data.billablePercent}
            goal={goal}
            periodFrom={from}
            periodTo={to}
            onEditGoal={openGoalModal}
          />
          <DashboardBarChart data={data.byDay} />
          <ProjectBreakdown projects={data.byProject} totalSeconds={data.totalSeconds}
            chartTitle={t('dashboard.chartByProject')} tableTitle={t('dashboard.tableByProject')} />
          <ProjectBreakdown projects={data.byClient} totalSeconds={data.totalSeconds}
            chartTitle={t('dashboard.chartByClient')} tableTitle={t('dashboard.tableByClient')} />

          {data.topActivities.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium text-secondary mb-4">{t('dashboard.topActivities')}</h3>
              <div className="space-y-2">
                {data.topActivities.map((a, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-border/50 last:border-0">
                    <div>
                      <span className="text-primary">{a.description}</span>
                      {a.project_name && <span className="text-xs text-secondary ml-2">{a.project_name}</span>}
                    </div>
                    <span className="font-mono text-primary tabular-nums">{formatDuration(a.seconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Goal modal */}
      {editingGoal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-primary">{t('dashboard.setGoal')}</h2>
              <button onClick={() => setEditingGoal(false)} className="text-secondary hover:text-primary">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-secondary block mb-1.5">{t('dashboard.goalAmount')}</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  placeholder={t('dashboard.goalAmountPlaceholder')}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveGoal(); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-secondary block mb-1.5">{t('dashboard.goalPeriod')}</label>
                <div className="flex rounded-lg overflow-hidden border border-border">
                  {(['day', 'week', 'month'] as GoalPeriod[]).map(p => (
                    <button key={p} onClick={() => setGoalPeriodInput(p)}
                      className={`flex-1 py-2 text-sm transition-colors ${goalPeriodInput === p ? 'bg-accent/10 text-accent font-medium' : 'text-secondary hover:text-primary'}`}>
                      {t(`dashboard.periodLabel.${p}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              {goal && (
                <button onClick={clearGoal}
                  className="px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors">
                  {t('common.remove')}
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setEditingGoal(false)}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary">{t('common.cancel')}</button>
                <button onClick={saveGoal} disabled={!goalInput || Number(goalInput) <= 0}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
