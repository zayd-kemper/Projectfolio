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

// Recharts writes colors as SVG attributes, where CSS var() strings don't
// resolve — so resolve the design tokens to concrete rgb() values here.
function getChartColors() {
  if (typeof document === 'undefined') {
    return { accent: '#2563eb', muted: '#6b7280', grid: '#e5e7eb' };
  }
  const source = document.querySelector('.app-surface') || document.documentElement;
  const styles = getComputedStyle(source);
  const rgb = (name, fallback) => {
    const triplet = styles.getPropertyValue(name).trim();
    return triplet ? `rgb(${triplet})` : fallback;
  };
  return {
    accent: rgb('--accent', '#2563eb'),
    muted: rgb('--ink-muted', '#6b7280'),
    grid: rgb('--line', '#e5e7eb'),
  };
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
    <div className="card p-5">
      <EngineeringIcon name={icon} size="1.4rem" className="mb-2" />
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{label}</div>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30d');
  const [, setThemeTick] = useState(0);

  // Re-resolve chart token colors when the theme class flips on <html>.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((tick) => tick + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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

  const chartColors = getChartColors();

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
        <div className="mb-0.5 text-ink-muted">{payload[0]?.payload?.fullDate}</div>
        <div className="font-semibold text-ink">{payload[0]?.value} view{payload[0]?.value !== 1 ? 's' : ''}</div>
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
        <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                range === item.id
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-shimmer h-28 rounded-xl" />)}
          </div>
          <div className="skeleton-shimmer h-64 rounded-xl" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center">
          <EngineeringIcon name="analytics-gauge" size="2.5rem" className="mx-auto mb-3" />
          <p className="text-ink-muted">No analytics data yet. Share your portfolio to start getting views.</p>
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
            <div className="-mt-2 text-xs text-ink-muted">
              All-time total: <span className="font-medium text-ink-secondary">{toNumber(data.total_views).toLocaleString()} views</span>
            </div>
          )}

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="font-semibold text-ink">Views over time</h3>
              {data.trend_pct !== null && data.trend_pct !== undefined && (
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span>vs previous period</span>
                  <TrendBadge pct={data.trend_pct} />
                </div>
              )}
            </div>
            {hasRangeViews && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.muted }} stroke={chartColors.grid} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} stroke={chartColors.grid} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: chartColors.accent, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke={chartColors.accent}
                    strokeWidth={2}
                    dot={chartData.length <= 14 ? { r: 3, fill: chartColors.accent, strokeWidth: 0 } : false}
                    activeDot={{ r: 5, fill: chartColors.accent, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                <EngineeringIcon name="search-scan" size="1.8rem" />
                <p className="text-sm text-ink-muted">No views in this period yet.</p>
                <p className="text-xs text-ink-muted">Try a wider time range, or share your portfolio link to start collecting views.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visibleProjectViews.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-4 font-semibold text-ink">Views by project</h3>
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
                            className="max-w-[60%] truncate text-sm font-medium text-ink transition-colors hover:text-accent-text"
                          >
                            {project.title}
                          </a>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <span className="text-xs text-ink-muted">{pct}%</span>
                            <span className="text-sm font-semibold text-ink">{views.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-surface-muted">
                          <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${(views / maxViews) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {zeroProjectCount > 0 && (
                  <p className="mt-3 text-xs text-ink-muted">
                    {zeroProjectCount} project{zeroProjectCount !== 1 ? 's' : ''} with no views in this period
                  </p>
                )}
              </div>
            )}

            {data.referrer_breakdown?.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-1 font-semibold text-ink">Traffic sources</h3>
                <p className="mb-4 text-xs text-ink-muted">Where visitors came from in this period.</p>
                <div className="space-y-3">
                  {data.referrer_breakdown.map((row) => {
                    const total = data.referrer_breakdown.reduce((sum, item) => sum + toNumber(item.visits), 0);
                    const pct = total > 0 ? Math.round((toNumber(row.visits) / total) * 100) : 0;
                    return (
                      <div key={row.source} className="flex items-center gap-3">
                        <EngineeringIcon name={SOURCE_ICONS[row.source] || 'source-network'} size="1.2rem" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-ink">{row.source}</span>
                            <span className="text-xs text-ink-muted">{toNumber(row.visits).toLocaleString()} / {pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-surface-muted">
                            <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </DashboardLayout>
  );
}
