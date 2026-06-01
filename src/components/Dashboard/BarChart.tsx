import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDuration } from '../../utils/formatDuration';

interface Props {
  data: { date: string; seconds: number }[];
}

const formatLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00'); // Mittag → keine Timezone-Sprünge
  return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric' });
};

const formatLabelLong = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-secondary mb-1">{formatLabelLong(label)}</p>
      <p className="text-primary font-mono">{formatDuration(payload[0].value)}</p>
    </div>
  );
};

export default function DashboardBarChart({ data }: Props) {
  const days = data.length;

  // X-Achse: Beschriftungsdichte je nach Zeitraum
  const tickFormatter = (dateStr: string, index: number) => {
    if (days <= 14) return formatLabel(dateStr);
    if (days <= 31) return index % 3 === 0 ? formatLabelLong(dateStr) : '';
    return index % 7 === 0 ? formatLabelLong(dateStr) : '';
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">Stunden pro Tag</h3>
      <ResponsiveContainer width="100%" height={180}>
        {/* barCategoryGap als % → Balken skalieren immer proportional zur Containerbreite */}
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={s => `${(s / 3600).toFixed(0)}h`}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="seconds" fill="#84CC16" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
