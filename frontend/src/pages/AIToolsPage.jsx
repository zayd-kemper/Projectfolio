// frontend/src/pages/AIToolsPage.jsx
import { useState } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import ActiveProgress from '../components/shared/ActiveProgress';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { resolveJobResponse } from '../utils/jobs';

const FILTER_ACTIVE = 'bg-blue-600 text-white border-blue-600';
const FILTER_INACTIVE = 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 border-gray-200 dark:border-gray-700 hover:border-blue-300';
const TAB_ACTIVE = 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent';
const TAB_INACTIVE = 'bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-300 border-gray-200 dark:border-gray-700 hover:border-gray-400';

const TYPE_CONFIG = {
  internship: { label: 'Internships', icon: 'briefcase', color: 'blue' },
  research_fellowship: { label: 'Fellowships', icon: 'research-scope', color: 'emerald' },
  competition: { label: 'Competitions', icon: 'award-badge', color: 'amber' },
  grant: { label: 'Grants and scholarships', icon: 'education', color: 'green' },
  open_source: { label: 'Open source', icon: 'code-terminal', color: 'indigo' },
};

const COLOR_CLASSES = {
  blue: { badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  amber: { badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  green: { badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  indigo: { badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
};

const TOOLS = [
  {
    id: 'match',
    icon: 'target',
    title: 'AI Portfolio Match',
    desc: 'Paste any job, fellowship, or program URL and get a compatibility analysis against your portfolio.',
    tag: 'URL to score',
  },
  {
    id: 'finder',
    icon: 'search-scan',
    title: 'Opportunity Finder',
    desc: 'Let AI read your portfolio and surface internships, fellowships, competitions, and grants that fit.',
    tag: 'Portfolio to matches',
  },
];

function LoadingCard({ step, stages, note, label }) {
  return (
    <div className="card p-6 dark:bg-gray-900">
      <ActiveProgress currentStep={step} stages={stages} note={note} label={label} />
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-900/20">
      <div className="flex items-start gap-3">
        <EngineeringIcon name="warning-signal" size="1.5rem" />
        <div className="flex-1">
          <p className="font-medium text-red-800 dark:text-red-300">Analysis failed</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{message}</p>
          {onRetry && (
            <button onClick={onRetry} className="mt-3 text-sm font-medium text-red-700 underline dark:text-red-400">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function IconLabel({ icon, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <EngineeringIcon name={icon} size="1em" />
      <span>{children}</span>
    </span>
  );
}

function ScoreRing({ score = 0 }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = circ - (normalized / 100) * circ;
  const color = normalized >= 75 ? '#16a34a' : normalized >= 50 ? '#d97706' : '#dc2626';
  const label = normalized >= 75 ? 'Strong match' : normalized >= 50 ? 'Moderate match' : 'Low match';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{normalized}</span>
          <span className="text-xs text-gray-500">/100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function InsightCard({ type, items = [], title }) {
  const isStrength = type === 'strength';
  const tone = isStrength
    ? 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800 text-green-800 dark:text-green-300'
    : 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800 text-amber-800 dark:text-amber-300';
  const icon = isStrength ? 'signal-success' : 'warning-signal';

  return (
    <section className={`rounded-xl border p-5 ${tone}`}>
      <div className="mb-3 flex items-center gap-2">
        <EngineeringIcon name={icon} size="1.1rem" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm leading-6">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActionItem({ item, index }) {
  const priorityClasses = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  };
  const priorityTone = priorityClasses[item.priority] || priorityClasses.low;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.action}</span>
          {item.priority && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityTone}`}>
              {item.priority}
            </span>
          )}
        </div>
        {item.detail && <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{item.detail}</p>}
      </div>
    </div>
  );
}

function DetailBlock({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <div className="text-sm leading-6 text-gray-600 dark:text-gray-300">{children}</div>
    </div>
  );
}

function ProjectRating({ project }) {
  const [open, setOpen] = useState(false);
  const score = Number(project.relevance_score || 0);
  const tone = score >= 7
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    : score >= 4
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${tone}`}>
          {score}/10
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-900 dark:text-gray-100">{project.title}</div>
          {project.headline && <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{project.headline}</div>}
        </div>
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{open ? '-' : '+'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-200 px-4 pb-4 pt-3 dark:border-gray-800">
          <DetailBlock label="Why it matters">{project.why_relevant}</DetailBlock>
          {project.evidence_used?.length > 0 && (
            <DetailBlock label="Evidence used">
              <ul className="space-y-1">
                {project.evidence_used.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}
          {project.improvements?.length > 0 && (
            <DetailBlock label="Suggested improvements">
              <ul className="space-y-1">
                {project.improvements.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}
        </div>
      )}
    </div>
  );
}

function HowItWorks({ steps }) {
  return (
    <div className="card p-6 dark:bg-gray-900">
      <h3 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">How it works</h3>
      <div className="space-y-4">
        {steps.map((step) => (
          <div key={step.title} className="flex items-start gap-4">
            <EngineeringIcon name={step.icon} size="1.5rem" />
            <div>
              <div className="mb-0.5 font-medium text-gray-900 dark:text-gray-100">{step.title}</div>
              <div className="text-sm leading-6 text-gray-500 dark:text-gray-400">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIMatchTool() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [programName, setProgramName] = useState('');

  const analyze = async () => {
    if (!url.trim()) return toast.error('Please paste a program URL.');
    if (!url.startsWith('http')) return toast.error('Please include https:// in the URL.');

    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setLoadingStep('Reading your portfolio and opportunity...');
      const response = await api.post('/integrations/ai-match', { url });
      const completed = await resolveJobResponse(response, { timeoutMs: 5 * 60_000 });
      const parsed = completed.result;
      setProgramName(parsed.program_name || 'Program');
      setResult(parsed);
    } catch (err) {
      setError(err.message?.includes('JSON')
        ? 'AI returned an unexpected format. Please try again.'
        : 'Analysis failed. Check the URL and try again.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  if (loading) {
    return (
      <LoadingCard
        step={loadingStep}
        label="Analyzing portfolio compatibility"
        note="This usually takes about 15 to 20 seconds."
        stages={[
          'Reading the opportunity requirements...',
          'Comparing skills and project evidence...',
          'Checking experience gaps...',
          'Preparing prioritized recommendations...',
        ]}
      />
    );
  }

  if (error) return <ErrorCard message={error} onRetry={() => setError(null)} />;

  return (
    <div className="space-y-6">
      <div className="card p-6 dark:bg-gray-900">
        <label className="form-label">Program or job posting URL</label>
        <div className="flex gap-3">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && !loading && analyze()}
            placeholder="https://example.com/opportunity"
            className="form-input flex-1"
          />
          <button onClick={analyze} disabled={!url.trim()} className="btn-primary flex-shrink-0 px-6">
            Analyze
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Works with public job boards, internship listings, fellowship pages, and program descriptions.
        </p>
      </div>

      {result ? (
        <div className="space-y-6">
          <section className="card p-6 dark:bg-gray-900">
            <div className="flex flex-wrap items-start gap-6">
              <ScoreRing score={result.compatibility_score} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{programName}</h2>
                  {result.program_type && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {result.program_type.replace('_', ' ')}
                    </span>
                  )}
                  {result.model_used?.name && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {result.model_used.name}
                    </span>
                  )}
                  {result.confidence && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {result.confidence} confidence
                    </span>
                  )}
                </div>

                <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-400">{result.score_rationale}</p>
                {result.standout_advice && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-300">Key insight</p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">{result.standout_advice}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {result.strengths?.length > 0 && <InsightCard type="strength" items={result.strengths} title="Portfolio strengths" />}
            {result.gaps?.length > 0 && <InsightCard type="gap" items={result.gaps} title="Areas to address" />}
          </div>

          {result.missing_elements?.length > 0 && (
            <section className="card p-5 dark:bg-gray-900">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <EngineeringIcon name="signal-error" size="1rem" />
                Missing from your portfolio
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.missing_elements.map((item) => (
                  <span key={item} className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {item}
                  </span>
                ))}
              </div>
            </section>
          )}

          {result.action_items?.length > 0 && (
            <section className="card p-5 dark:bg-gray-900">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <EngineeringIcon name="target" size="1rem" />
                Action plan
                <span className="text-xs font-normal text-gray-500">({result.action_items.length} items)</span>
              </h3>
              <div className="space-y-2">
                {result.action_items.map((item, index) => <ActionItem key={`${item.action}-${index}`} item={item} index={index} />)}
              </div>
            </section>
          )}

          {result.project_ratings?.length > 0 && (
            <section className="card p-5 dark:bg-gray-900">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <EngineeringIcon name="project-module" size="1rem" />
                Project relevance
              </h3>
              <div className="space-y-2">
                {[...result.project_ratings]
                  .sort((a, b) => b.relevance_score - a.relevance_score)
                  .map((project, index) => <ProjectRating key={`${project.title}-${index}`} project={project} />)}
              </div>
            </section>
          )}

          <div className="pb-6 text-center">
            <button onClick={() => { setResult(null); setUrl(''); }} className="btn-secondary">
              Analyze another program
            </button>
          </div>
        </div>
      ) : (
        <HowItWorks
          steps={[
            { icon: 'link', title: 'Paste any program URL', desc: 'Use a job posting, internship listing, fellowship page, or research program description.' },
            { icon: 'ai-core', title: 'AI reads the opportunity', desc: 'The tool identifies requirements, preferred skills, role expectations, and research focus.' },
            { icon: 'analytics-gauge', title: 'Get a compatibility score', desc: 'See how your portfolio aligns and which projects carry the strongest evidence.' },
            { icon: 'target', title: 'Follow the action plan', desc: 'Prioritized actions show what to add, change, or highlight before applying.' },
          ]}
        />
      )}
    </div>
  );
}

function MatchScoreDot({ score = 0 }) {
  const value = Number(score) || 0;
  const color = value >= 80 ? '#16a34a' : value >= 60 ? '#d97706' : '#64748b';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-semibold" style={{ color }}>{value}% match</span>
    </div>
  );
}

function OpportunityCard({ opp, index }) {
  const [open, setOpen] = useState(false);
  const cfg = TYPE_CONFIG[opp.type] || { label: opp.type || 'Opportunity', icon: 'pin', color: 'blue' };
  const colors = COLOR_CLASSES[cfg.color] || COLOR_CLASSES.blue;

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">{opp.name}</h3>
              <MatchScoreDot score={opp.match_score} />
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{opp.org}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                <IconLabel icon={cfg.icon}>{cfg.label}</IconLabel>
              </span>
              {opp.paid && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-300">
                  Paid
                </span>
              )}
            </div>

            {opp.highlight && (
              <p className="mb-2 text-sm font-medium leading-snug text-blue-700 dark:text-blue-300">{opp.highlight}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {opp.url && (
                <a href={opp.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                  View opportunity
                </a>
              )}
              <button onClick={() => setOpen((value) => !value)} className="text-xs text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300">
                {open ? 'Less detail' : 'More detail'}
              </button>
            </div>
          </div>
        </div>

        {open && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 md:pl-12 dark:border-gray-800">
            <DetailBlock label="Why it fits you">{opp.match_reason}</DetailBlock>
            <DetailBlock label="About this opportunity">{opp.description}</DetailBlock>
            {opp.evidence?.length > 0 && (
              <DetailBlock label="Portfolio evidence">
                <ul className="space-y-1">
                  {opp.evidence.map((item, itemIndex) => (
                    <li key={`${item}-${itemIndex}`} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </DetailBlock>
            )}
            <DetailBlock label="Application angle">{opp.application_angle}</DetailBlock>
            {opp.deadline_notes && (
              <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <EngineeringIcon name="calendar" size="1rem" />
                <span>{opp.deadline_notes}</span>
              </p>
            )}
            {opp.eligibility && (
              <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <EngineeringIcon name="signal-success" size="1rem" />
                <span>{opp.eligibility}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function OpportunityFinderTool() {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(Object.keys(TYPE_CONFIG));
  const [activeFilter, setActiveFilter] = useState('all');

  const toggleType = (type) => {
    setSelectedTypes((current) => (
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    ));
  };

  const find = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setLoadingStep('Reading your portfolio and finding matches...');
      const response = await api.post('/integrations/opportunity-finder', {
        filters: { types: selectedTypes },
      });
      const completed = await resolveJobResponse(response, { timeoutMs: 5 * 60_000 });
      setResult(completed.result);
      setActiveFilter('all');
    } catch {
      setError('Failed to find opportunities. Please try again.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  if (loading) {
    return (
      <LoadingCard
        step={loadingStep}
        label="Finding matching opportunities"
        note="Scanning available programs against your portfolio usually takes about 20 seconds."
        stages={[
          'Building a profile from your project evidence...',
          'Scanning programs across selected categories...',
          'Ranking matches by relevance...',
          'Checking eligibility and deadlines...',
        ]}
      />
    );
  }

  if (error) return <ErrorCard message={error} onRetry={() => setError(null)} />;

  const allMatches = result
    ? [
        ...(result.top_matches || []),
        ...(result.additional_suggestions || []).map((suggestion) => ({ ...suggestion, isAdditional: true })),
      ]
    : [];

  const filteredMatches = activeFilter === 'all'
    ? allMatches
    : allMatches.filter((match) => match.type === activeFilter);

  const typeCounts = allMatches.reduce((acc, match) => {
    acc[match.type] = (acc[match.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <section className="card p-6 dark:bg-gray-900">
        <label className="form-label mb-3">What types of opportunities are you looking for?</label>
        <div className="mb-5 flex flex-wrap gap-2">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const selected = selectedTypes.includes(key);
            const buttonTone = selected ? FILTER_ACTIVE : FILTER_INACTIVE;
            return (
              <button
                key={key}
                onClick={() => toggleType(key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${buttonTone}`}
              >
                <EngineeringIcon name={cfg.icon} size="1em" />
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={find} disabled={selectedTypes.length === 0} className="btn-primary">
            <IconLabel icon="search-scan">Find opportunities</IconLabel>
          </button>
          {result && (
            <button onClick={() => setResult(null)} className="btn-secondary text-sm">
              Reset
            </button>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {selectedTypes.length === 0 ? 'Select at least one type' : `Searching ${selectedTypes.length} categor${selectedTypes.length === 1 ? 'y' : 'ies'}`}
          </span>
        </div>
      </section>

      {result && (
        <>
          {result.summary && (
            <section className="card border-blue-100 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <EngineeringIcon name="target" size="1.5rem" />
                <div>
                  <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Your opportunity profile</p>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{result.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.model_used?.name && (
                      <span className="rounded-full border border-blue-100 bg-white/80 px-2 py-0.5 text-[10px] text-gray-600 dark:border-blue-800 dark:bg-gray-900/60 dark:text-gray-300">
                        {result.model_used.name}
                      </span>
                    )}
                    {result.portfolio_snapshot?.strongest_direction && (
                      <span className="rounded-full border border-blue-100 bg-white/80 px-2 py-0.5 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-gray-900/60 dark:text-blue-300">
                        {result.portfolio_snapshot.strongest_direction}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {result.profile_gaps?.length > 0 && (
            <section className="card border-amber-100 p-5 dark:border-amber-800 dark:bg-gray-900">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <EngineeringIcon name="warning-signal" size="1rem" />
                Profile gaps limiting your matches
              </h3>
              <ul className="space-y-2">
                {result.profile_gaps.map((gap, index) => (
                  <li key={`${gap}-${index}`} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.next_steps?.length > 0 && (
            <section className="card p-5 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Next steps to improve matches</h3>
              <div className="space-y-2">
                {result.next_steps.map((item, index) => <ActionItem key={`${item.action}-${index}`} item={item} index={index} />)}
              </div>
            </section>
          )}

          {allMatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveFilter('all')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${activeFilter === 'all' ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                All ({allMatches.length})
              </button>
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = TYPE_CONFIG[type] || { label: type, icon: 'pin' };
                const tabTone = activeFilter === type ? TAB_ACTIVE : TAB_INACTIVE;
                return (
                  <button
                    key={type}
                    onClick={() => setActiveFilter(type)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${tabTone}`}
                  >
                    <IconLabel icon={cfg.icon}>{cfg.label} ({count})</IconLabel>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-4">
            {filteredMatches.length === 0 ? (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                <EngineeringIcon name="search-scan" size="2.5rem" className="mx-auto mb-3" />
                <p>No matches for this filter.</p>
              </div>
            ) : (
              <>
                {filteredMatches.filter((match) => !match.isAdditional).length > 0 && (
                  <section>
                    <p className="mb-3 px-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Best matches from the curated database</p>
                    <div className="space-y-3">
                      {filteredMatches
                        .filter((match) => !match.isAdditional)
                        .map((opp, index) => <OpportunityCard key={opp.id || `${opp.name}-${index}`} opp={opp} index={index} />)}
                    </div>
                  </section>
                )}

                {filteredMatches.filter((match) => match.isAdditional).length > 0 && (
                  <section className="mt-6">
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">AI-suggested additional opportunities</p>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                        Generated
                      </span>
                    </div>
                    <div className="space-y-3">
                      {filteredMatches
                        .filter((match) => match.isAdditional)
                        .map((opp, index) => (
                          <OpportunityCard
                            key={`${opp.name}-${index}`}
                            opp={opp}
                            index={filteredMatches.filter((match) => !match.isAdditional).length + index}
                          />
                        ))}
                    </div>
                    <p className="mt-3 px-1 text-xs text-gray-500 dark:text-gray-400">
                      AI-suggested opportunities are generated by the model. Always verify URLs and details before applying.
                    </p>
                  </section>
                )}
              </>
            )}
          </div>
        </>
      )}

      {!result && (
        <HowItWorks
          steps={[
            { icon: 'document', title: 'Select opportunity types', desc: 'Choose internships, fellowships, competitions, grants, and open source programs, or search all at once.' },
            { icon: 'ai-core', title: 'AI reads your portfolio', desc: 'The tool analyzes your projects, skills, bio, and technologies to understand what you have actually built.' },
            { icon: 'target', title: 'Get ranked matches', desc: 'Receive a ranked list with specific explanations of why each opportunity fits your profile.' },
            { icon: 'link', title: 'Apply with confidence', desc: 'Each result links to the opportunity and explains how your work aligns with what they need.' },
          ]}
        />
      )}
    </div>
  );
}

export default function AIToolsPage() {
  const [activeTool, setActiveTool] = useState(null);
  const activeToolData = TOOLS.find((tool) => tool.id === activeTool);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          {activeTool && (
            <div className="mb-1 flex items-center gap-3">
              <button onClick={() => setActiveTool(null)} className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-200">
                Back
              </button>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{activeToolData?.title}</span>
            </div>
          )}

          <h1 className="page-title mb-1">{activeTool ? activeToolData?.title : 'AI Tools'}</h1>
          <p className="page-subtitle">
            {activeTool
              ? activeToolData?.desc
              : 'Portfolio-aware tools for matching opportunities and understanding how your evidence stacks up.'}
          </p>
        </header>

        {!activeTool && (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className="card group cursor-pointer p-6 text-left transition-all hover:border-blue-200 hover:shadow-sm dark:bg-gray-900 dark:hover:border-blue-700"
              >
                <EngineeringIcon name={tool.icon} size="2rem" className="mb-3" />
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{tool.title}</h2>
                  <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {tool.tag}
                  </span>
                </div>
                <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{tool.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 transition-all group-hover:gap-2 dark:text-blue-400">
                  Open tool
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTool === 'match' && <AIMatchTool />}
        {activeTool === 'finder' && <OpportunityFinderTool />}
      </div>
    </DashboardLayout>
  );
}
