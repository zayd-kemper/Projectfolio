// frontend/src/pages/AnalyticsPage.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../utils/api';
import { format, parseISO } from 'date-fns';
import EngineeringIcon from '../components/shared/EngineeringIcon';

const SOURCE_ICONS = {
  LinkedIn: 'briefcase',
  GitHub: 'code-terminal',
  Google: 'search-scan',
  'X / Twitter': 'source-network',
  Direct: 'link',
  Other: 'source-network',
};

const RANGES = [
  { id: '24h', label: '24h', desc: 'Past 24 hours' },
  { id: '7d', label: '7 days', desc: 'Past 7 days' },
  { id: '30d', label: '30 days', desc: 'Past 30 days' },
  { id: '365d', label: '1 year', desc: 'Past year' },
  { id: 'all', label: 'All time', desc: 'All time' },
];

function fmtAxisDate(dateStr, range) {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    if (range === '24h') return format(d, 'ha');
    if (range === '7d') return format(d, 'EEE d');
    if (range === '365d') return format(d, 'MMM');
    if (range === 'all') return format(d, 'MMM yyyy');
    return format(d, 'MMM d');
  } catch {
    return dateStr;
  }
}

function fmtTooltipDate(dateStr, range) {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    if (range === '24h') return format(d, 'MMM d, ha');
    if (range === 'all') return format(d, 'MMMM yyyy');
    return format(d, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      up ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
        : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
    }`}>
      <span aria-hidden="true">{up ? '+' : '-'}</span>
      {Math.abs(pct)}%
    </span>
  );
}

function MetricCard({ icon, value, label, children }) {
  return (
    <div className="card p-5 dark:bg-gray-900">
      <EngineeringIcon name={icon} size="1.4rem" className="mb-2" />
      <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30d');

  useEffect(() => {
    if (!user?.username) return;
    setLoading(true);
    api.get(`/portfolio/${user.username}/data/analytics?range=${range}`)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [user, range]);

  const currentRange = RANGES.find((r) => r.id === range);
  const rawChartData = data?.views_by_day || [];
  const totalViewsValue = toNumber(data?.total_views);
  const chartRows = rawChartData.length > 0 || totalViewsValue <= 0
    ? rawChartData
    : [{ date: null, views: totalViewsValue, fallbackLabel: 'All time' }];
  const chartData = chartRows.map((row) => ({
    label: row.fallbackLabel || fmtAxisDate(row.date, range),
    fullDate: row.fallbackLabel || fmtTooltipDate(row.date, range),
    views: toNumber(row.views),
  }));
  const hasRangeViews = toNumber(data?.range_views ?? data?.total_views) > 0 || chartData.some((row) => row.views > 0);
  const projectViews = data?.project_views || [];
  const visibleProjectViews = projectViews.filter((project) => toNumber(project.views) > 0);
  const zeroProjectCount = projectViews.filter((project) => toNumber(project.views) === 0).length;
  const totalProjectViews = projectViews.reduce((sum, project) => sum + toNumber(project.views), 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-0.5 text-gray-500 dark:text-gray-400">{payload[0]?.payload?.fullDate}</div>
        <div className="font-semibold text-gray-900 dark:text-gray-100">{payload[0]?.value} view{payload[0]?.value !== 1 ? 's' : ''}</div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Analytics</h1>
          <p className="page-subtitle">How people are finding and reading your portfolio.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                range === item.id
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />)}
          </div>
          <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center">
          <EngineeringIcon name="analytics-gauge" size="2.5rem" className="mx-auto mb-3" />
          <p className="text-gray-500">No analytics data yet. Share your portfolio to start getting views.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              icon="eye-view"
              value={toNumber(data.range_views ?? data.total_views).toLocaleString()}
              label={currentRange.desc}
            >
              <div className="mt-2"><TrendBadge pct={data.trend_pct} /></div>
            </MetricCard>
            <MetricCard
              icon="team-node"
              value={data.unique_visitors === null || data.unique_visitors === undefined ? '-' : toNumber(data.unique_visitors).toLocaleString()}
              label="Unique visitors"
            />
            <MetricCard
              icon="calendar"
              value={data.avg_daily_views ?? '-'}
              label="Avg views / day"
            />
            <MetricCard
              icon="award-badge"
              value={data.peak_day?.views === null || data.peak_day?.views === undefined ? '-' : toNumber(data.peak_day.views).toLocaleString()}
              label={data.peak_day?.date ? `Peak day / ${format(parseISO(data.peak_day.date), 'MMM d')}` : 'Peak day'}
            />
          </div>

          {range !== 'all' && (
            <div className="-mt-2 text-xs text-gray-400 dark:text-gray-500">
              All-time total: <span className="font-medium text-gray-600 dark:text-gray-300">{toNumber(data.total_views).toLocaleString()} views</span>
            </div>
          )}

          <div className="card p-6 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Views over time</h3>
              {data.trend_pct !== null && data.trend_pct !== undefined && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>vs previous period</span>
                  <TrendBadge pct={data.trend_pct} />
                </div>
              )}
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} stroke="#e5e7eb" tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} stroke="#e5e7eb" tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2563eb', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={chartData.length <= 14 ? { r: 3, fill: '#2563eb', strokeWidth: 0 } : false}
                    activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-gray-400">
                No views in this period yet.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visibleProjectViews.length > 0 && (
              <div className="card p-6 dark:bg-gray-900">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Views by project</h3>
                <div className="space-y-3">
                  {visibleProjectViews.map((project) => {
                    const views = toNumber(project.views);
                    const pct = totalProjectViews > 0 ? Math.round((views / totalProjectViews) * 100) : 0;
                    const maxViews = Math.max(toNumber(visibleProjectViews[0]?.views), 1);
                    return (
                      <div key={project.slug}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <a
                            href={`/${user.username}/${project.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="max-w-[60%] truncate text-sm font-medium text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                          >
                            {project.title}
                          </a>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <span className="text-xs text-gray-400">{pct}%</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{views.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${(views / maxViews) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {zeroProjectCount > 0 && (
                  <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    {zeroProjectCount} project{zeroProjectCount !== 1 ? 's' : ''} with no views in this period
                  </p>
                )}
              </div>
            )}

            {data.referrer_breakdown?.length > 0 && (
              <div className="card p-6 dark:bg-gray-900">
                <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Traffic sources</h3>
                <p className="mb-4 text-xs text-gray-500">Where visitors came from in this period.</p>
                <div className="space-y-3">
                  {data.referrer_breakdown.map((row) => {
                    const total = data.referrer_breakdown.reduce((sum, item) => sum + toNumber(item.visits), 0);
                    const pct = total > 0 ? Math.round((toNumber(row.visits) / total) * 100) : 0;
                    return (
                      <div key={row.source} className="flex items-center gap-3">
                        <EngineeringIcon name={SOURCE_ICONS[row.source] || 'source-network'} size="1.2rem" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.source}</span>
                            <span className="text-xs text-gray-500">{toNumber(row.visits).toLocaleString()} / {pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!hasRangeViews && visibleProjectViews.length === 0 && (
            <div className="card p-10 text-center dark:bg-gray-900">
              <EngineeringIcon name="search-scan" size="2.5rem" className="mx-auto mb-3" />
              <p className="text-gray-500">No views recorded in this period.</p>
              <p className="mt-1 text-xs text-gray-400">Try selecting a wider time range.</p>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
