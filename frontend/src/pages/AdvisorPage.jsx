import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/shared/DashboardLayout';
import ActiveProgress from '../components/shared/ActiveProgress';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api from '../utils/api';
import { resolveJobResponse } from '../utils/jobs';

const OBJECTIVES = [
  { id: 'projects', label: 'Build standout projects', description: 'Grow a portfolio that proves what you can do.', icon: 'project-module' },
  { id: 'skills', label: 'Develop new skills', description: 'Close skill gaps with hands-on learning.', icon: 'idea-spark' },
  { id: 'position', label: 'Land a position', description: 'Aim your portfolio at internships and roles.', icon: 'briefcase' },
];

const GROWTH_OPTIONS = [
  { id: 'horizontal', label: 'Strengthen my current level', description: 'Broaden and polish what you already do well.' },
  { id: 'vertical', label: 'Advance to the next level', description: 'Take on harder work one level up.' },
];

const OBJECTIVE_LABELS = Object.fromEntries(OBJECTIVES.map((option) => [option.id, option.label]));

const STATUS_STYLES = {
  ready: 'text-emerald-700 dark:text-emerald-400',
  generating: 'text-accent-text',
  failed: 'text-danger',
};

const GENERATING_STAGES = [
  'Analyzing your portfolio evidence…',
  'Matching curated suggestions…',
  'Consulting the mentor model…',
  'Assembling your interactive roadmap…',
];

const DIFFICULTY_STYLES = {
  beginner: 'bg-surface-muted text-ink-muted',
  intermediate: 'bg-accent-surface text-accent-text',
  advanced: 'bg-surface-muted text-ink',
};

export default function AdvisorPage() {
  const [view, setView] = useState('home');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [goals, setGoals] = useState({ objective: null, growth: null, focus_note: '', target_role: '', timeframe_weeks: '' });

  const loadSessions = () =>
    api.get('/advisor/sessions')
      .then((response) => setSessions(response.data?.sessions || []))
      .catch(() => {});

  useEffect(() => {
    let mounted = true;
    loadSessions().finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const startWizard = () => {
    setGoals({ objective: null, growth: null, focus_note: '', target_role: '', timeframe_weeks: '' });
    setWizardStep(1);
    setView('wizard');
  };

  const openSession = async (sessionId) => {
    try {
      const response = await api.get(`/advisor/sessions/${sessionId}`);
      setActive(response.data.session);
      setView('results');
    } catch {
      toast.error('Could not open that roadmap.');
    }
  };

  const deleteSession = async (sessionId) => {
    try {
      await api.delete(`/advisor/sessions/${sessionId}`);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
    } catch {
      toast.error('Could not delete that roadmap.');
    }
  };

  const handleGenerate = async () => {
    const payload = { objective: goals.objective, growth: goals.growth };
    if (goals.focus_note.trim()) payload.focus_note = goals.focus_note.trim();
    if (goals.target_role.trim()) payload.target_role = goals.target_role.trim();
    if (goals.timeframe_weeks) payload.timeframe_weeks = Number(goals.timeframe_weeks);

    setView('generating');
    try {
      const response = await api.post('/advisor/sessions', payload);
      await resolveJobResponse(response, { timeoutMs: 5 * 60_000 });
      const sessionId = response.data.session_id;
      const full = await api.get(`/advisor/sessions/${sessionId}`);
      setActive(full.data.session);
      setView('results');
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || 'Roadmap generation failed.');
      setView('home');
    } finally {
      loadSessions();
    }
  };

  const handleToggleStep = async (step) => {
    const completed = !active?.progress?.[step.id]?.completed;
    try {
      const response = await api.patch(`/advisor/sessions/${active.id}/steps/${step.id}`, { completed });
      setActive((current) => ({ ...current, progress: response.data.progress }));
    } catch {
      toast.error('Could not update that step.');
    }
  };

  const wizardCanAdvance = wizardStep === 1 ? Boolean(goals.objective) : wizardStep === 2 ? Boolean(goals.growth) : true;

  const renderHome = () => (
    <>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Saved roadmaps</h2>
        <div className="card divide-y divide-line-subtle">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 p-4">
              <button type="button" className="flex-1 text-left" onClick={() => openSession(session.id)}>
                <p className="text-sm font-medium text-ink">
                  {OBJECTIVE_LABELS[session.goals?.objective] || 'Growth roadmap'}
                </p>
                <p className="text-sm text-ink-muted">
                  {session.goals?.growth === 'vertical' ? 'Advance to the next level' : 'Strengthen the current level'}
                  <span className="text-ink-faint"> · {new Date(session.created_at).toLocaleDateString()}</span>
                </p>
                {session.status === 'failed' && session.error && (
                  <p className="mt-1 text-xs text-danger">{session.error}</p>
                )}
              </button>
              <span className={`text-xs font-medium ${STATUS_STYLES[session.status] || 'text-ink-muted'}`}>
                {session.status}
              </span>
              <button
                type="button"
                className="btn-secondary text-xs"
                aria-label={`Delete roadmap ${OBJECTIVE_LABELS[session.goals?.objective] || ''}`.trim()}
                onClick={() => deleteSession(session.id)}
              >
                Delete
              </button>
            </div>
          ))}
          {!loading && sessions.length === 0 && (
            <p className="p-4 text-sm text-ink-faint">No roadmaps yet — start your first one.</p>
          )}
        </div>
      </section>
    </>
  );

  const renderWizard = () => (
    <section className="card space-y-6 p-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Step {wizardStep} of 3</p>
          <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setView('home')}>
            Cancel
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(wizardStep / 3) * 100}%` }} />
        </div>
      </div>

      {wizardStep === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-ink">What do you want to work toward?</h2>
          <p className="mb-4 text-sm text-ink-muted">Your mentor plans differently depending on the goal.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {OBJECTIVES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setGoals((current) => ({ ...current, objective: option.id }))}
                className={`card card-interactive p-4 text-left ${goals.objective === option.id ? 'border-accent-border ring-1 ring-accent/30' : ''}`}
                aria-pressed={goals.objective === option.id}
              >
                <EngineeringIcon name={option.icon} size="1.25rem" />
                <p className="mt-2 font-semibold text-ink">{option.label}</p>
                <p className="mt-1 text-sm text-ink-muted">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-ink">How do you want to grow?</h2>
            <p className="mb-4 text-sm text-ink-muted">Horizontal growth strengthens where you are; vertical growth levels you up.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {GROWTH_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setGoals((current) => ({ ...current, growth: option.id }))}
                  className={`card card-interactive p-4 text-left ${goals.growth === option.id ? 'border-accent-border ring-1 ring-accent/30' : ''}`}
                  aria-pressed={goals.growth === option.id}
                >
                  <p className="font-semibold text-ink">{option.label}</p>
                  <p className="mt-1 text-sm text-ink-muted">{option.description}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="advisor-focus">Focus area (optional)</label>
            <textarea
              id="advisor-focus"
              rows={2}
              className="form-textarea"
              placeholder="e.g. aerial autonomy, medical devices, developer tooling"
              value={goals.focus_note}
              onChange={(event) => setGoals((current) => ({ ...current, focus_note: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="advisor-role">Target role (optional)</label>
              <input
                id="advisor-role"
                className="form-input"
                placeholder="e.g. Robotics intern"
                value={goals.target_role}
                onChange={(event) => setGoals((current) => ({ ...current, target_role: event.target.value }))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="advisor-timeframe">Timeframe (optional)</label>
              <select
                id="advisor-timeframe"
                className="form-input"
                value={goals.timeframe_weeks}
                onChange={(event) => setGoals((current) => ({ ...current, timeframe_weeks: event.target.value }))}
              >
                <option value="">No deadline</option>
                <option value="8">Next 2 months</option>
                <option value="16">This semester (~4 months)</option>
                <option value="26">Next 6 months</option>
                <option value="52">This year</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-ink">Ready to build your roadmap?</h2>
          <p className="mb-4 text-sm text-ink-muted">Your mentor will analyze your portfolio against these goals.</p>
          <dl className="space-y-2 rounded-lg border border-line bg-surface-muted p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Goal</dt>
              <dd className="font-medium text-ink">{OBJECTIVE_LABELS[goals.objective]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Growth</dt>
              <dd className="font-medium text-ink">{GROWTH_OPTIONS.find((option) => option.id === goals.growth)?.label}</dd>
            </div>
            {goals.focus_note.trim() && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Focus</dt>
                <dd className="font-medium text-ink">{goals.focus_note.trim()}</dd>
              </div>
            )}
            {goals.target_role.trim() && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Target role</dt>
                <dd className="font-medium text-ink">{goals.target_role.trim()}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => (wizardStep === 1 ? setView('home') : setWizardStep(wizardStep - 1))}
        >
          Back
        </button>
        {wizardStep < 3 ? (
          <button type="button" className="btn-primary" disabled={!wizardCanAdvance} onClick={() => setWizardStep(wizardStep + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={handleGenerate}>
            Build my roadmap
          </button>
        )}
      </div>
    </section>
  );

  const renderGenerating = () => (
    <section className="space-y-4">
      <ActiveProgress
        label="Building your roadmap"
        currentStep={GENERATING_STAGES[0]}
        stages={GENERATING_STAGES}
        icon="ai-core"
      />
      <p className="text-sm text-ink-muted">
        This usually takes under a minute. Your roadmap is saved to your history either way.
      </p>
    </section>
  );

  const renderResults = () => {
    const pkg = active?.package;
    if (!pkg) {
      return (
        <section className="card p-5">
          <p className="text-sm text-ink-muted">
            {active?.status === 'failed'
              ? `This roadmap failed to generate${active?.error ? `: ${active.error}` : '.'}`
              : 'This roadmap is still generating — check back in a moment.'}
          </p>
        </section>
      );
    }

    const steps = pkg.roadmap?.steps || [];
    const completedCount = steps.filter((step) => active?.progress?.[step.id]?.completed).length;
    const progressPercent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

    return (
      <div className="space-y-8">
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{pkg.analysis?.discipline_label || 'Your portfolio'}</h2>
            <span className="rounded-full bg-accent-surface px-2.5 py-0.5 text-xs font-medium capitalize text-accent-text">
              {pkg.analysis?.current_level}
            </span>
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              {pkg.analysis?.confidence} confidence
            </span>
            {pkg.meta?.fallback && (
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                offline analysis
              </span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">{pkg.analysis?.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {pkg.analysis?.strengths?.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-ink">Strengths</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                  {pkg.analysis.strengths.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {pkg.analysis?.skill_gaps?.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-ink">Gaps to close</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                  {pkg.analysis.skill_gaps.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
          {pkg.analysis?.direction && (
            <p className="text-sm font-medium text-ink">{pkg.analysis.direction}</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Suggested projects</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(pkg.suggestions?.projects || []).map((project) => (
              <div key={project.title} className="card space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{project.title}</p>
                  {project.source === 'curated' && (
                    <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">curated</span>
                  )}
                </div>
                <p className="text-sm text-ink-muted">{project.description}</p>
                {project.why_recommended && (
                  <p className="text-sm text-ink-secondary">{project.why_recommended}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${DIFFICULTY_STYLES[project.difficulty] || 'bg-surface-muted text-ink-muted'}`}>
                    {project.difficulty}
                  </span>
                  {project.estimated_weeks && (
                    <span className="text-ink-faint">~{project.estimated_weeks} weeks</span>
                  )}
                  {(project.technologies || []).slice(0, 5).map((tech) => (
                    <span key={tech} className="rounded-full bg-surface-muted px-2 py-0.5 text-ink-muted">{tech}</span>
                  ))}
                </div>
                {project.builds_on?.length > 0 && (
                  <p className="text-xs text-ink-faint">Builds on: {project.builds_on.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {pkg.suggestions?.skills?.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">Skills to develop</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {pkg.suggestions.skills.map((skill) => (
                <div key={skill.name} className="card space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{skill.name}</p>
                    {skill.source === 'curated' && (
                      <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">curated</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted">{skill.why}</p>
                  {skill.resources?.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {skill.resources.map((resource) => (
                        <li key={resource.name}>
                          {resource.url ? (
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent-text underline-offset-2 hover:underline"
                            >
                              {resource.name}
                            </a>
                          ) : (
                            <span className="text-ink-secondary">{resource.name}</span>
                          )}
                          <span className="text-ink-faint"> · {resource.provider || resource.type}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">Your roadmap</h2>
            <p className="text-sm text-ink-muted">{completedCount} of {steps.length} steps done</p>
          </div>
          <div
            className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Roadmap progress"
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          {pkg.roadmap?.narrative && (
            <p className="mb-4 text-sm text-ink-secondary">{pkg.roadmap.narrative}</p>
          )}
          <ol className="card divide-y divide-line-subtle">
            {steps.map((step, index) => {
              const done = Boolean(active?.progress?.[step.id]?.completed);
              return (
                <li key={step.id} className="flex items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    id={`advisor-step-${step.id}`}
                    className="mt-1 h-4 w-4 accent-accent"
                    checked={done}
                    onChange={() => handleToggleStep(step)}
                  />
                  <label htmlFor={`advisor-step-${step.id}`} className="flex-1 cursor-pointer">
                    <p className={`text-sm font-medium ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>
                      {index + 1}. {step.title}
                    </p>
                    {step.description && <p className="mt-0.5 text-sm text-ink-muted">{step.description}</p>}
                    <p className="mt-1 text-xs text-ink-faint">
                      <span className="capitalize">{step.kind}</span>
                      {step.estimated_weeks ? ` · ~${step.estimated_weeks} weeks` : ''}
                      {step.outcome ? ` · ${step.outcome}` : ''}
                    </p>
                  </label>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Advisor</h1>
            <p className="page-subtitle">
              Your industry mentor: analyzes your portfolio, listens to your goals, and builds an interactive growth roadmap.
            </p>
          </div>
          {view === 'home' && (
            <button type="button" className="btn-primary" onClick={startWizard}>
              New roadmap
            </button>
          )}
          {view === 'results' && (
            <button type="button" className="btn-secondary" onClick={() => { setActive(null); setView('home'); loadSessions(); }}>
              Back to roadmaps
            </button>
          )}
        </div>

        {view === 'home' && renderHome()}
        {view === 'wizard' && renderWizard()}
        {view === 'generating' && renderGenerating()}
        {view === 'results' && renderResults()}
      </div>
    </DashboardLayout>
  );
}
