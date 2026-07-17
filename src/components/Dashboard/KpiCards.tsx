import { Clock, DollarSign, TrendingUp, Pencil, Receipt } from 'lucide-react';
import { differenceInDays, parseISO, addDays, getDaysInMonth } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../utils/formatDuration';
import { formatCurrency } from '../../utils/formatCurrency';

type GoalPeriod = 'day' | 'week' | 'month';
interface Goal { amount: number; period: GoalPeriod; }

interface Props {
  totalSeconds: number;
  billableAmount: number;
  billedAmount: number;
  billableSeconds: number;
  billablePercent: number;
  goal?: Goal | null;
  periodFrom?: string;
  periodTo?: string;
  onEditGoal?: () => void;
}

function getScaledTarget(goal: Goal, from: string, to: string): number {
  const start = parseISO(from);
  const end = parseISO(to);
  const days = differenceInDays(end, start) + 1;
  if (days <= 0) return 0;

  if (goal.period === 'day') return goal.amount * days;
  if (goal.period === 'week') return goal.amount * (days / 7);

  // Month: each day contributes 1/(days in its own calendar month), so a full
  // calendar month always sums to exactly goal.amount, regardless of its length.
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    total += goal.amount / getDaysInMonth(d);
  }
  return total;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function KpiCards({
  totalSeconds, billableAmount, billedAmount, billableSeconds, billablePercent,
  goal, periodFrom, periodTo, onEditGoal,
}: Props) {
  const { t } = useTranslation();

  const scaledTarget = goal && periodFrom && periodTo
    ? getScaledTarget(goal, periodFrom, periodTo)
    : null;
  const achievement = scaledTarget ? billableAmount / scaledTarget : null;
  const diff = scaledTarget !== null ? billableAmount - scaledTarget : null;
  const avgRate = billableSeconds > 0 ? billableAmount / (billableSeconds / 3600) : 0;
  const hoursNeeded = diff !== null && diff < 0 && avgRate > 0
    ? Math.abs(diff) / avgRate
    : null;

  const barColor = achievement === null ? '' :
    achievement >= 1 ? 'bg-success' :
    achievement >= 0.7 ? 'bg-amber-400' : 'bg-danger';

  return (
    <div className="grid grid-cols-4 gap-4">

      {/* Total time */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <div className="text-accent bg-white/5 rounded-lg p-2.5">
          <Clock size={22} />
        </div>
        <div>
          <p className="text-xs text-secondary mb-0.5">{t('dashboard.totalTime')}</p>
          <p className="text-xl font-semibold text-accent font-mono tabular-nums">
            {formatDuration(totalSeconds)}
          </p>
        </div>
      </div>

      {/* Billable amount with goal */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
        <div className="text-success bg-white/5 rounded-lg p-2.5 flex-shrink-0 mt-0.5">
          <DollarSign size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs text-secondary">{t('dashboard.billableAmount')}</p>
            <button
              onClick={onEditGoal}
              title={goal ? t('dashboard.editGoal') : t('dashboard.setGoal')}
              className="p-1 rounded text-secondary/40 hover:text-secondary transition-colors"
            >
              <Pencil size={11} />
            </button>
          </div>

          <div className="relative group">
            <p className="text-xl font-semibold text-success font-mono tabular-nums">
              {formatCurrency(billableAmount)}
            </p>

            {scaledTarget !== null && (
              <p className="text-xs text-secondary mt-0.5">
                {t('dashboard.goalTarget', { amount: fmtNum(scaledTarget) })}
                <span className="text-secondary/50 ml-1">/{t(`dashboard.periodLabel.${goal!.period}`)}</span>
              </p>
            )}

            {scaledTarget !== null && achievement !== null && diff !== null && (
              <div className="absolute left-0 top-full mt-2 z-50 bg-sidebar border border-border rounded-lg p-3 text-xs hidden group-hover:block w-56 shadow-xl pointer-events-none">
                <p className="font-semibold text-primary mb-1.5">
                  {t('dashboard.goalAchieved', { pct: Math.round(achievement * 100) })}
                </p>
                <p className="text-secondary">
                  {diff >= 0
                    ? <span className="text-success">{t('dashboard.goalExceeded', { amount: fmtNum(diff) })}</span>
                    : t('dashboard.goalRemaining', { amount: fmtNum(Math.abs(diff)) })}
                </p>
                {hoursNeeded !== null && (
                  <p className="text-secondary mt-1">
                    {t('dashboard.goalHoursNeeded', { hours: hoursNeeded.toFixed(1), rate: fmtNum(avgRate) })}
                  </p>
                )}
              </div>
            )}
          </div>

          {scaledTarget !== null && achievement !== null && (
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.min(achievement * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Already billed amount + open remainder */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
        <div className="text-accent bg-white/5 rounded-lg p-2.5 flex-shrink-0 mt-0.5">
          <Receipt size={22} />
        </div>
        <div>
          <p className="text-xs text-secondary mb-0.5">{t('dashboard.billedAmount')}</p>
          <p className="text-xl font-semibold text-accent font-mono tabular-nums">
            {formatCurrency(billedAmount)}
          </p>
          <p className="text-xs text-secondary mt-0.5">
            {t('dashboard.unbilledAmount')}{' '}
            <span className="font-mono tabular-nums text-primary">{formatCurrency(billableAmount - billedAmount)}</span>
          </p>
        </div>
      </div>

      {/* Billability */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <div className="text-amber-400 bg-white/5 rounded-lg p-2.5">
          <TrendingUp size={22} />
        </div>
        <div>
          <p className="text-xs text-secondary mb-0.5">{t('dashboard.billability')}</p>
          <p className="text-xl font-semibold text-amber-400 font-mono tabular-nums">
            {billablePercent}%
          </p>
        </div>
      </div>
    </div>
  );
}
