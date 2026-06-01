import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDuration } from '../../utils/formatDuration';
import { formatCurrency } from '../../utils/formatCurrency';

interface BreakdownRow { name: string; color: string; seconds: number; amount: number; }
interface Props {
  projects: BreakdownRow[];
  totalSeconds: number;
  chartTitle?: string;
  tableTitle?: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-primary font-medium mb-1">{payload[0].name}</p>
      <p className="text-secondary">{formatDuration(payload[0].value)}</p>
    </div>
  );
};

export default function ProjectBreakdown({
  projects, totalSeconds,
  chartTitle = 'Zeitverteilung nach Projekt',
  tableTitle = 'Aufschlüsselung',
}: Props) {
  if (!projects.length) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Donut chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-secondary mb-4">{chartTitle}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={projects} dataKey="seconds" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {projects.map((p, i) => <Cell key={i} fill={p.color} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-secondary mb-4">{tableTitle}</h3>
        <div className="space-y-3">
          {projects.map(p => {
            const pct = totalSeconds > 0 ? Math.round((p.seconds / totalSeconds) * 100) : 0;
            return (
              <div key={p.name}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-sm text-primary">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-primary">{formatDuration(p.seconds)}</span>
                    <span className="text-xs text-secondary ml-2">{formatCurrency(p.amount)}</span>
                  </div>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
