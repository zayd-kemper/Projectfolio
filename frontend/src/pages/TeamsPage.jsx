import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '../utils/api';
import toast from 'react-hot-toast';

const TEAM_TYPES = ['Organization', 'Club', 'Research Group', 'Startup', 'Class / Course', 'Other'];

const iconForTeamType = (type) => {
  if (type === 'Club') return 'award-badge';
  if (type === 'Research Group') return 'research-scope';
  if (type === 'Startup') return 'launch-vector';
  if (type === 'Class / Course') return 'education';
  return 'team-node';
};

export function TeamCardMenu({ team, isAdmin }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const keyHandler = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  if (!isAdmin) return null;

  const go = (tab) => {
    setOpen(false);
    navigate(`/dashboard/teams/${team.id}?tab=${tab}`);
  };

  const items = [
    ['settings', 'settings-gear', 'Portfolio settings', () => go('settings')],
    ['analytics', 'analytics-gauge', 'Analytics', () => go('analytics')],
    ['manage', 'project-module', 'Manage team', () => { setOpen(false); navigate(`/dashboard/teams/${team.id}`); }],
  ];

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}
        className="touch-target flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-secondary"
        title="Team options"
        aria-label={`Options for ${team.name || 'team'}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EngineeringIcon name="list-menu" size="1rem" />
      </button>

      {open && (
        <div role="menu" aria-label="Team options" className="absolute right-0 top-9 z-50 w-52 animate-fade-up rounded-xl border border-line bg-surface py-1 shadow-pop">
          {items.map(([id, icon, label, action]) => (
            <button
              key={id}
              role="menuitem"
              onClick={action}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-muted"
            >
              <EngineeringIcon name={icon} size="1rem" />
              <span>{label}</span>
            </button>
          ))}
          <div className="my-1 border-t border-line-subtle" />
          <a
            href={`/team/${team.slug}`}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={(event) => event.stopPropagation()}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-muted"
          >
            <EngineeringIcon name="link" size="1rem" />
            <span>View public page</span>
          </a>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'Organization', website: '' });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchTeams(); }, []);

  const fetchTeams = async () => {
    try {
      const response = await api.get('/teams/my-teams');
      setTeams(response.data.teams);
    } catch {
      toast.error('Failed to load teams.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('Team name is required.');
    setCreating(true);
    try {
      const response = await api.post('/teams', form);
      toast.success('Team created.');
      navigate(`/dashboard/teams/${response.data.team.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create team.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Teams</h1>
          <p className="page-subtitle">Collaborative portfolios for organizations, clubs, labs, and project groups.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Team</button>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent aria-modal="true" className="app-surface w-full gap-0 bg-surface p-6 text-ink shadow-pop sm:max-w-md">
          <DialogHeader className="mb-5 gap-1">
            <DialogTitle className="text-xl font-semibold text-ink">Create a team</DialogTitle>
            <DialogDescription className="text-sm text-ink-muted">
              A shared portfolio for your club, lab, or organization.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); handleCreate(); }} className="space-y-4">
            <div>
              <label htmlFor="team-name" className="form-label">Team name *</label>
              <input
                id="team-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Robotics Club, Smith Lab"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="team-type" className="form-label">Type</label>
              <select id="team-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="form-input">
                {TEAM_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="team-description" className="form-label">Description</label>
              <textarea
                id="team-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                className="form-textarea"
                placeholder="What does your team work on?"
              />
            </div>
            <div>
              <label htmlFor="team-website" className="form-label">Website (optional)</label>
              <input
                id="team-website"
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="https://yourteam.com"
                className="form-input"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 justify-center">
                {creating ? 'Creating...' : 'Create team'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((item) => <div key={item} className="skeleton-shimmer h-20 rounded-xl" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="card p-16 text-center">
          <EngineeringIcon name="team-node" size="3rem" className="mx-auto mb-4" />
          <h3 className="mb-2 text-xl font-semibold text-ink">No teams yet</h3>
          <p className="mb-6 text-sm text-ink-muted">Create a team portfolio for your club, lab, or organization.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">+ Create your first team</button>
        </div>
      ) : (
        <div className="card divide-y divide-line-subtle">
          {teams.map((team) => {
            const isAdmin = team.role === 'admin' || team.owner_id === user?.id;
            return (
              <article key={team.id} className="row-hover flex items-center gap-4 p-4 first:rounded-t-xl last:rounded-b-xl">
                <Link to={`/dashboard/teams/${team.id}`} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent-surface">
                  <EngineeringIcon name={iconForTeamType(team.type)} size="1.5rem" />
                </Link>
                <Link to={`/dashboard/teams/${team.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-ink">{team.name}</h3>
                    <span className="badge bg-surface-muted text-xs capitalize text-ink-muted">{team.role}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    {team.type}
                    {team.description ? <span> · {team.description}</span> : null}
                  </p>
                </Link>
                <div className="hidden flex-shrink-0 gap-4 text-xs text-ink-muted sm:flex">
                  <span className="inline-flex items-center gap-1">
                    <EngineeringIcon name="team-node" size="1em" />
                    {team.member_count}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <EngineeringIcon name="project-module" size="1em" />
                    {team.project_count}
                  </span>
                </div>
                <TeamCardMenu team={team} isAdmin={isAdmin} />
              </article>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
