// frontend/src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import OnboardingModal from '../components/shared/OnboardingModal';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_COLORS = {
  draft: 'bg-surface-muted text-ink-muted dark:text-ink-faint',
  published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const PUBLISH_ACTIVE = 'bg-surface-muted text-ink-muted hover:bg-surface-muted';
const PUBLISH_DRAFT = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60';

function formatUpdatedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy');
}

function scoreCompleteness(project) {
  let score = 0;
  if (project.cover_image_url) score += 20;
  if (project.tagline?.trim()) score += 15;
  if (project.description?.trim()) score += 10;
  if (project.technologies?.length >= 2) score += 15;
  if (project.start_date) score += 10;
  if (project.github_url || project.live_url) score += 15;
  if (project.project_type) score += 5;
  if (project.view_count > 0) score += 5;
  if (project.is_featured) score += 5;
  return Math.min(score, 100);
}

function scoreBest(project) {
  const completeness = scoreCompleteness(project);
  const views = Math.min((project.view_count || 0) * 2, 20);
  const featured = project.is_featured ? 15 : 0;
  const techBreadth = Math.min((project.technologies?.length || 0) * 3, 15);
  return completeness * 0.5 + views + featured + techBreadth;
}

function getCompletionGaps(project) {
  const gaps = [];
  if (!project.cover_image_url) gaps.push({ label: 'Add a cover image', fix: 'settings', icon: 'media-frame', impact: 'high' });
  if (!project.tagline?.trim()) gaps.push({ label: 'Write a one-line tagline', fix: 'content', icon: 'document-edit', impact: 'high' });
  if (!project.technologies?.length) gaps.push({ label: 'Add technologies used', fix: 'settings', icon: 'tool-wrench', impact: 'medium' });
  if (!project.github_url && !project.live_url) gaps.push({ label: 'Link a GitHub repo or demo', fix: 'settings', icon: 'link', impact: 'medium' });
  if (!project.start_date) gaps.push({ label: 'Add project dates', fix: 'settings', icon: 'calendar', impact: 'low' });
  if (!project.description?.trim()) gaps.push({ label: 'Add a short description', fix: 'settings', icon: 'document', impact: 'low' });
  return gaps;
}

function ProjectThumbnail({ project, icon = 'research-scope' }) {
  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-surface">
      {project.cover_image_url ? (
        <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <EngineeringIcon name={icon} size="1.75rem" />
      )}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="card p-5">
      <EngineeringIcon name={icon} size="1.5rem" className="mb-2" />
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function CollaboratorAvatars({ collaborators = [] }) {
  const visible = (collaborators || []).filter((collaborator) => collaborator.id);
  if (visible.length === 0) return null;

  return (
    <div className="mt-1 flex items-center gap-1">
      <div className="flex">
        {visible.slice(0, 4).map((collaborator) => (
          <div
            key={collaborator.id}
            title={`@${collaborator.username}`}
            className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-accent-surface text-xs font-semibold text-accent-text"
            style={{ marginLeft: '-4px' }}
          >
            {collaborator.avatar_url ? (
              <img src={collaborator.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              collaborator.full_name?.charAt(0)
            )}
          </div>
        ))}
      </div>
      <span className="ml-1 text-xs text-ink-muted">
        {visible.length} collaborator{visible.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

function SmartHighlights({ projects, username, onDismiss }) {
  const [expanded, setExpanded] = useState(null);
  const navigate = useNavigate();
  const projectList = Array.isArray(projects) ? projects : [];

  const owned = projectList.filter((project) => project.user_role === 'owner');
  const published = owned.filter((project) => project.status === 'published');
  const scored = useMemo(() => owned.map((project) => ({
    ...project,
    completeness: scoreCompleteness(project),
    best: scoreBest(project),
    gaps: getCompletionGaps(project),
  })), [owned]);

  const topProject = useMemo(() => [...scored].sort((a, b) => b.best - a.best)[0], [scored]);
  const needsWork = useMemo(() => scored
    .filter((project) => project.completeness < 60 && project.status === 'published')
    .sort((a, b) => a.completeness - b.completeness)[0], [scored]);
  const unpublishedGems = useMemo(() => scored.filter((project) => project.status === 'draft' && project.completeness >= 70), [scored]);

  const highlights = [];
  if (topProject && topProject.best > 40) {
    highlights.push({
      id: 'top',
      type: 'success',
      icon: 'award-badge',
      title: 'Strongest project',
      body: `"${topProject.title}" scores highest overall: ${topProject.completeness}% complete, ${topProject.view_count || 0} views.`,
      cta: topProject.status !== 'published' ? 'Publish it' : 'View it',
      action: topProject.status !== 'published'
        ? () => navigate(`/dashboard/projects/${topProject.id}/edit`)
        : () => window.open(`/${username}/${topProject.slug}`, '_blank'),
      project: topProject,
    });
  }

  if (needsWork && needsWork.id !== topProject?.id) {
    highlights.push({
      id: 'gaps',
      type: 'warning',
      icon: 'warning-signal',
      title: 'Published but incomplete',
      body: `"${needsWork.title}" is live but only ${needsWork.completeness}% complete.`,
      cta: 'Fix now',
      action: () => navigate(`/dashboard/projects/${needsWork.id}/edit`),
      project: needsWork,
    });
  }

  if (unpublishedGems.length > 0) {
    const gem = unpublishedGems[0];
    highlights.push({
      id: 'gem',
      type: 'info',
      icon: 'idea-spark',
      title: unpublishedGems.length > 1 ? `${unpublishedGems.length} strong drafts` : 'Strong draft',
      body: unpublishedGems.length === 1
        ? `"${gem.title}" is ${gem.completeness}% complete and still a draft.`
        : `${unpublishedGems.length} drafts are at least 70% complete.`,
      cta: 'Review draft',
      action: () => navigate(`/dashboard/projects/${gem.id}/edit`),
      project: gem,
    });
  }

  if (owned.length > 0 && published.length === 0) {
    highlights.push({
      id: 'none-published',
      type: 'warning',
      icon: 'eye-view',
      title: 'Nothing published yet',
      body: 'Your public portfolio has no visible projects.',
      cta: 'Publish a project',
      action: () => navigate(`/dashboard/projects/${owned[0]?.id}/edit`),
    });
  }

  if (highlights.length === 0) return null;

  const typeStyles = {
    success: { meter: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', icon: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-900 dark:text-green-100', sub: 'text-green-700 dark:text-green-300' },
    warning: { meter: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-900 dark:text-amber-100', sub: 'text-amber-700 dark:text-amber-300' },
    info: { meter: 'bg-accent', bg: 'bg-accent-surface', border: 'border-accent-border', icon: 'bg-accent-surface', text: 'text-accent-text', sub: 'text-accent-text' },
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <EngineeringIcon name="idea-spark" size="1rem" />
          <span className="text-sm font-semibold text-ink-secondary">Portfolio checks</span>
          <span className="text-xs text-ink-muted">Based on your current projects</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-ink-muted transition-colors hover:text-ink-secondary dark:hover:text-ink-faint">
          Dismiss
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {highlights.map((highlight) => {
          const style = typeStyles[highlight.type];
          const isOpen = expanded === highlight.id;
          return (
            <article key={highlight.id} className={`rounded-xl border ${style.bg} ${style.border}`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${style.icon}`}>
                    <EngineeringIcon name={highlight.icon} size="1.05rem" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`mb-1 text-sm font-semibold ${style.text}`}>{highlight.title}</div>
                    <p className={`text-xs leading-5 ${style.sub}`}>{highlight.body}</p>

                    {highlight.project?.gaps?.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpanded(isOpen ? null : highlight.id)}
                          className={`text-xs underline underline-offset-2 ${style.sub} hover:opacity-80`}
                        >
                          {isOpen ? 'Hide details' : `${highlight.project.gaps.length} suggested fix${highlight.project.gaps.length > 1 ? 'es' : ''}`}
                        </button>
                        {isOpen && (
                          <ul className="mt-2 space-y-1.5">
                            {highlight.project.gaps.map((gap) => (
                              <li key={gap.label} className="flex items-center gap-2">
                                <EngineeringIcon name={gap.icon} size="0.8rem" />
                                <span className={`text-xs ${style.sub}`}>{gap.label}</span>
                                <span className="ml-auto rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted dark:bg-black/20 dark:text-ink-faint">
                                  {gap.impact}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {highlight.project?.completeness != null && (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[10px] opacity-70">
                          <span className={style.sub}>Completeness</span>
                          <span className={style.sub}>{highlight.project.completeness}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div className={`h-full rounded-full ${style.meter}`} style={{ width: `${highlight.project.completeness}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {highlight.cta && (
                  <button
                    onClick={highlight.action}
                    className={`mt-3 w-full rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80 ${style.border} ${style.text} bg-white/50 dark:bg-black/20`}
                  >
                    {highlight.cta}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const PREVIEW_MODES = [
  {
    id: 'recruiter',
    icon: 'briefcase',
    label: 'Recruiter',
    desc: 'Full desktop view',
    width: '100%',
    height: 600,
    containerClass: 'w-full',
    frameClass: 'w-full',
    hint: 'This is the first impression for reviewers opening your link.',
  },
  {
    id: 'mobile',
    icon: 'phone-device',
    label: 'Mobile',
    desc: '390px phone viewport',
    width: 390,
    height: 600,
    containerClass: 'flex justify-center',
    frameClass: '',
    hint: 'Check that titles, tags, and buttons remain readable on small screens.',
  },
  {
    id: 'skim',
    icon: 'performance-bolt',
    label: 'Quick skim',
    desc: 'Fast first-pass scan',
    width: '100%',
    height: 600,
    containerClass: 'w-full',
    frameClass: 'w-full',
    hint: 'Highlighted zones show what registers first in a quick review.',
  },
];

function SkimMockup({ user, projects }) {
  const topProjects = (projects || [])
    .filter((project) => project.status === 'published')
    .sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0))
    .slice(0, 4);

  const Zone = ({ label, children, dim }) => (
    <div className={`relative rounded-xl ${dim ? 'bg-surface-muted p-3 opacity-60' : 'border-2 border-accent-border bg-accent-surface/60 p-3'}`}>
      {!dim && (
        <span className="absolute right-2 top-2 rounded bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-text">
          {label}
        </span>
      )}
      {dim ? (
        <div className="text-center text-[11px] text-ink-muted">Less visible during a quick scan</div>
      ) : children}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-white text-ink">
      <div className="flex items-center justify-between border-b border-line-subtle px-6 py-3">
        <span className="text-sm font-semibold text-ink-muted">ProjectFolio</span>
        <div className="flex gap-4 text-xs text-ink-muted">
          {user?.resume_url && <span>Resume</span>}
          {user?.linkedin_url && <span>LinkedIn</span>}
          {user?.github_url && <span>GitHub</span>}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <Zone label="First impression">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-surface text-lg font-semibold text-accent-text">
              {user?.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user?.full_name?.charAt(0)}
            </div>
            <div>
              <div className="text-xl font-semibold">{user?.full_name || 'Your Name'}</div>
              <div className="mt-1 text-sm text-ink-muted">{user?.headline || 'Your headline appears here'}</div>
              {Array.isArray(user?.skills) && user.skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {user.skills.slice(0, 5).map((skill) => <span key={skill} className="tech-tag">{skill}</span>)}
                </div>
              )}
            </div>
          </div>
        </Zone>

        <div className="mt-5">
          <div className="mb-3 text-base font-semibold">Projects</div>
          {topProjects[0] && (
            <Zone label="Best project">
              <div className="flex gap-3 pr-20">
                <div className="flex h-20 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-surface">
                  {topProjects[0].cover_image_url ? (
                    <img src={topProjects[0].cover_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <EngineeringIcon name="research-scope" size="1.5rem" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{topProjects[0].title}</div>
                    {topProjects[0].is_featured && <EngineeringIcon name="award-badge" size="0.9rem" />}
                  </div>
                  {topProjects[0].tagline && <div className="mt-1 truncate text-xs text-ink-muted">{topProjects[0].tagline}</div>}
                  {Array.isArray(topProjects[0].technologies) && topProjects[0].technologies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topProjects[0].technologies.slice(0, 5).map((tech) => <span key={tech} className="tech-tag">{tech}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </Zone>
          )}

          {topProjects.slice(1).length > 0 && (
            <div className="mt-3">
              <Zone dim>
                <div className="grid grid-cols-3 gap-2">
                  {topProjects.slice(1).map((project) => (
                    <div key={project.id} className="overflow-hidden rounded-lg bg-surface-muted">
                      <div className="flex h-12 items-center justify-center bg-surface-muted">
                        {project.cover_image_url ? (
                          <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <EngineeringIcon name="research-scope" size="1rem" />
                        )}
                      </div>
                      <div className="truncate px-2 py-1 text-[10px] font-medium">{project.title}</div>
                    </div>
                  ))}
                </div>
              </Zone>
            </div>
          )}

          {topProjects.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-line p-8 text-center text-sm text-ink-muted">
              No published projects yet. Publish one to see it here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioPreviewModal({ portfolioUrl, user, projects, onClose }) {
  const [mode, setMode] = useState('recruiter');
  const current = PREVIEW_MODES.find((item) => item.id === mode);
  const iframeRef = useRef(null);

  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/95 backdrop-blur-sm">
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-gray-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-faint">Portfolio Preview</span>
          <span className="max-w-[200px] truncate font-mono text-xs text-ink-muted">{portfolioUrl}</span>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-xl bg-gray-900 p-1">
          {PREVIEW_MODES.map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-gray-700 text-white shadow-sm' : 'text-ink-muted hover:text-ink-faint'}`}
              >
                <EngineeringIcon name={item.icon} size="1em" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-ink-muted transition-colors hover:bg-gray-800 hover:text-gray-200">
          x
        </button>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-900/50 px-5 py-2">
        <span className="text-xs text-ink-faint">{current.desc}</span>
        <span className="text-ink-secondary">/</span>
        <span className="text-xs italic text-ink-muted">{current.hint}</span>
        <a href={portfolioUrl} target="_blank" rel="noreferrer" className="ml-auto flex-shrink-0 text-xs text-accent-text transition-colors hover:underline">
          Open full page
        </a>
      </div>

      <div className="flex-1 overflow-auto bg-gray-900 p-4">
        <div className={current.containerClass}>
          {mode === 'mobile' ? (
            <div className="relative mx-auto" style={{ width: 390 }}>
              <div className="relative rounded-[28px] border border-gray-700 bg-gray-800 p-2 shadow-sm" style={{ width: 410 }}>
                <div className="absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-gray-900" />
                <div className="overflow-hidden rounded-[22px] bg-white" style={{ height: current.height }}>
                  <iframe ref={iframeRef} src={portfolioUrl} style={{ width: 390, height: current.height, border: 'none', display: 'block' }} title="Mobile preview" />
                </div>
                <div className="absolute bottom-3 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-gray-600" />
              </div>
            </div>
          ) : mode === 'skim' ? (
            <div className="relative overflow-hidden rounded-xl border border-gray-800 shadow-sm" style={{ height: current.height }}>
              <SkimMockup user={user} projects={projects} />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-gray-800 shadow-sm" style={{ height: current.height }}>
              <iframe ref={iframeRef} src={portfolioUrl} className={current.frameClass} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="Portfolio preview" />
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-5 py-2.5">
        <p className="text-xs text-ink-muted">
          <strong className="text-ink-faint">Tip:</strong>{' '}
          {mode === 'recruiter' && 'Featured projects appear first. Make sure your best work has a strong cover image.'}
          {mode === 'mobile' && 'Check that project titles, tags, and buttons stay readable on small screens.'}
          {mode === 'skim' && 'The highlighted zones should immediately communicate who you are and what you built.'}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchProjects(); }, []);

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem(`onboarding_done_${user.id}`);
    if (!done && !user.identity_mode) {
      const timer = setTimeout(() => setShowOnboarding(true), 400);
      return () => clearTimeout(timer);
    }
    const enabled = localStorage.getItem(`highlights_enabled_${user.id}`);
    if (enabled === 'false') {
      setShowHighlights(false);
      return;
    }
    const timestamp = localStorage.getItem(`highlights_dismissed_ts_${user.id}`);
    if (timestamp && Date.now() - parseInt(timestamp, 10) < SEVEN_DAYS) setShowHighlights(false);
  }, [user]);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(Array.isArray(response.data?.projects) ? response.data.projects : []);
    } catch {
      setProjects([]);
      toast.error('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (project) => {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    setDeleting(project.id);
    try {
      await api.delete(`/projects/${project.id}`);
      setProjects((current) => (Array.isArray(current) ? current : []).filter((item) => item.id !== project.id));
      toast.success('Project deleted.');
    } catch {
      toast.error('Failed to delete project.');
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePublish = async (project) => {
    const newStatus = project.status === 'published' ? 'draft' : 'published';
    try {
      await api.put(`/projects/${project.id}`, { status: newStatus });
      setProjects((current) => (Array.isArray(current) ? current : []).map((item) => item.id === project.id ? { ...item, status: newStatus } : item));
      toast.success(newStatus === 'published' ? 'Project published.' : 'Project moved to draft.');
    } catch {
      toast.error('Failed to update project.');
    }
  };

  const handleDismissHighlights = () => {
    setShowHighlights(false);
    if (user?.id) localStorage.setItem(`highlights_dismissed_ts_${user.id}`, String(Date.now()));
  };

  const portfolioUrl = `${window.location.origin}/${user?.username}`;
  const portfolioPath = `/${user?.username}`;
  const projectList = Array.isArray(projects) ? projects : [];
  const ownProjects = projectList.filter((project) => project.user_role === 'owner');
  const collabProjects = projectList.filter((project) => project.user_role === 'collaborator');

  return (
    <DashboardLayout>
      {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} />}
      {showPreview && <PortfolioPreviewModal portfolioUrl={portfolioUrl} user={user} projects={projectList} onClose={() => setShowPreview(false)} />}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">My Projects</h1>
          <p className="page-subtitle">
            {projectList.length} project{projectList.length !== 1 ? 's' : ''} - {projectList.filter((project) => project.status === 'published').length} published
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <button onClick={() => setShowPreview(true)} className="btn-secondary flex flex-1 items-center justify-center gap-1.5 sm:flex-none">
            <EngineeringIcon name="eye-view" size="1em" />
            <span>Preview portfolio</span>
          </button>
          <a href={portfolioPath} target="_blank" rel="noreferrer" className="btn-secondary hidden sm:inline-flex">
            View live
          </a>
          <button onClick={() => navigate('/dashboard/projects/new')} className="btn-primary flex-1 justify-center sm:flex-none">
            + New Project
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total projects" value={projectList.length} icon="project-module" />
        <StatCard label="Published" value={projectList.filter((project) => project.status === 'published').length} icon="signal-success" />
        <StatCard label="Drafts" value={projectList.filter((project) => project.status === 'draft').length} icon="document-edit" />
        <StatCard label="Featured" value={projectList.filter((project) => project.is_featured).length} icon="award-badge" />
      </div>

      <section className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-accent-border bg-accent-surface p-4">
        <EngineeringIcon name="link" size="1.5rem" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-accent-text">Your portfolio URL</div>
          <div className="truncate font-mono text-sm text-accent-text">{portfolioUrl}</div>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(portfolioUrl); toast.success('Copied to clipboard.'); }} className="btn-secondary px-4 text-xs">
          Copy link
        </button>
        <Link to="/dashboard/integrations" className="btn-primary px-4 text-xs">
          Platform integrations
        </Link>
      </section>

      {showHighlights && !loading && projectList.length > 0 && (
        <SmartHighlights projects={projectList} username={user?.username} onDismiss={handleDismissHighlights} />
      )}

      {ownProjects.length > 0 && <h3 className="mb-3 mt-6 text-sm font-medium text-ink-muted">My projects</h3>}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="card animate-pulse p-5">
              <div className="mb-2 h-5 w-1/3 rounded bg-surface-muted" />
              <div className="h-4 w-1/2 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      ) : projectList.length === 0 ? (
        <div className="card p-16 text-center">
          <EngineeringIcon name="open-folder" size="3rem" className="mx-auto mb-4" />
          <h3 className="mb-2 text-xl font-semibold text-ink">No projects yet</h3>
          <p className="mb-6 text-sm text-ink-muted">Create your first project to start building your portfolio.</p>
          <button onClick={() => navigate('/dashboard/projects/new')} className="btn-primary mx-auto">
            + Create first project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {ownProjects.map((project) => {
            const completeness = scoreCompleteness(project);
            const publishTone = project.status === 'published' ? PUBLISH_ACTIVE : PUBLISH_DRAFT;
            return (
              <article key={project.id} className="card p-4 transition-shadow hover:shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <ProjectThumbnail project={project} />

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-ink">{project.title}</h3>
                      <span className={`badge text-xs ${STATUS_COLORS[project.status]}`}>{project.status}</span>
                      {project.is_featured && (
                        <span className="badge flex items-center gap-1 bg-yellow-100 text-xs text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                          <EngineeringIcon name="award-badge" size="0.9rem" />
                          Featured
                        </span>
                      )}
                    </div>
                    {project.tagline && <p className="mb-2 truncate text-sm text-ink-muted">{project.tagline}</p>}
                    {Array.isArray(project.technologies) && project.technologies.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {project.technologies.slice(0, 5).map((tech) => <span key={tech} className="tech-tag">{tech}</span>)}
                        {project.technologies.length > 5 && <span className="text-xs text-ink-muted">+{project.technologies.length - 5} more</span>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-ink-muted">
                        {formatUpdatedAt(project.updated_at) && `Updated ${formatUpdatedAt(project.updated_at)}`}
                        {project.view_count > 0 && ` - ${project.view_count} views`}
                      </span>
                      {completeness < 100 && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
                            <div className={`h-full rounded-full ${completeness >= 80 ? 'bg-green-400' : completeness >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${completeness}%` }} />
                          </div>
                          <span className="text-[10px] text-ink-muted">{completeness}%</span>
                        </div>
                      )}
                    </div>
                    <CollaboratorAvatars collaborators={project.collaborators} />
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                    {project.status === 'published' && (
                      <a href={`/${user?.username}/${project.slug}`} target="_blank" rel="noreferrer" className="btn-ghost px-3 text-xs">
                        View
                      </a>
                    )}
                    <button onClick={() => navigate(`/dashboard/projects/${project.id}/edit`)} className="btn-secondary px-4 text-xs">
                      Edit
                    </button>
                    <button onClick={() => handleTogglePublish(project)} className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${publishTone}`}>
                      {project.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button onClick={() => handleDelete(project)} disabled={deleting === project.id} className="btn-ghost px-3 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20">
                      {deleting === project.id ? '...' : <EngineeringIcon name="delete-bin" size="1em" />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {collabProjects.length > 0 && (
            <>
              <h3 className="mb-3 mt-8 text-sm font-medium text-ink-muted">Collaborating on</h3>
              <div className="space-y-3">
                {collabProjects.map((project) => (
                  <article key={project.id} className="card p-4 transition-shadow hover:shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <ProjectThumbnail project={project} icon="collaboration" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-ink">{project.title}</h3>
                          <span className="badge bg-accent-surface text-xs text-accent-text dark:text-accent-text">Collaborator</span>
                        </div>
                        <p className="mb-1 text-xs text-ink-muted">by {project.owner_name} (@{project.owner_username})</p>
                        {project.tagline && <p className="truncate text-sm text-ink-muted">{project.tagline}</p>}
                      </div>
                      <button onClick={() => navigate(`/dashboard/projects/${project.id}/edit`)} className="btn-secondary w-full justify-center px-4 text-xs sm:w-auto">
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
