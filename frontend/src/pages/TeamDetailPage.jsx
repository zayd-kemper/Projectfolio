import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import LayoutPreview from '../components/portfolio/LayoutPreview';
import { LAYOUTS } from '../utils/layouts';
import api from '../utils/api';

const THEMES = [
  { id: 'clean', label: 'Clean', desc: 'White background, minimal structure' },
  { id: 'bold', label: 'Bold', desc: 'Higher contrast and stronger hierarchy' },
  { id: 'minimal', label: 'Minimal', desc: 'Quieter spacing and restrained detail' },
];

const ACCENTS = ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2', '#db2777'];

const TEAM_SECTIONS = {
  header: {
    label: 'Team header',
    desc: 'Team name, description, website, and members',
    icon: 'team-node',
    required: true,
  },
  projects: {
    label: 'Projects',
    desc: 'Published projects connected to this team',
    icon: 'project-module',
    required: true,
  },
  contact: {
    label: 'Contact section',
    desc: 'Website and admin contact links',
    icon: 'mail',
    required: false,
  },
};

const TABS = [
  { id: 'projects', label: 'Projects', icon: 'project-module' },
  { id: 'members', label: 'Members', icon: 'team-node' },
  { id: 'invite', label: 'Invite', icon: 'mail' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics-gauge', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: 'settings-gear', adminOnly: true },
];

function IconTile({ name, className = '' }) {
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white   ${className}`}>
      <EngineeringIcon name={name} size="1.15rem" />
    </span>
  );
}

function Toggle({ checked, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-muted'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center  ">
      <IconTile name={icon} className="mx-auto mb-3" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SectionHeading({ icon, title, body }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <IconTile name={icon} />
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        {body && <p className="mt-1 text-sm text-ink-muted">{body}</p>}
      </div>
    </div>
  );
}

function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-surface-muted ${className}`} />;
}

function StatCard({ icon, label, value }) {
  return (
    <div className="card p-5">
      <IconTile name={icon} className="mb-3" />
      <div className="text-2xl font-semibold text-ink">{value ?? 0}</div>
      <div className="mt-1 text-sm text-ink-muted">{label}</div>
    </div>
  );
}

function SegmentButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-accent bg-accent-surface text-accent-text'
          : 'border-line text-ink-muted hover:border-ink-faint hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

function TeamAnalyticsPanel({ teamId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/teams/${teamId}/analytics`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
        <SkeletonBlock className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="analytics-gauge"
        title="Analytics are not available yet"
        body="Share the public team portfolio and this panel will start showing traffic once views are recorded."
      />
    );
  }

  const dailyViews = (data.views_by_day || []).map(day => ({
    date: day.date?.slice(5),
    views: Number.parseInt(day.views, 10) || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon="eye-view" label="Total portfolio views" value={data.total_views} />
        <StatCard icon="trend-line" label="Views last 30 days" value={data.last_30_days} />
        <StatCard icon="project-module" label="Projects tracked" value={data.project_views?.length || 0} />
      </div>

      {dailyViews.length > 0 ? (
        <div className="card p-6">
          <SectionHeading icon="analytics-gauge" title="Daily views" body="Last 30 days of public team portfolio traffic." />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyViews}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="views" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          icon="analytics-gauge"
          title="No views recorded"
          body="The chart will appear once people visit the public team page."
        />
      )}

      {data.project_views?.length > 0 && (
        <div className="card p-6">
          <SectionHeading icon="project-module" title="Views by project" />
          <div className="space-y-3">
            {data.project_views.map(projectView => {
              const max = data.project_views[0]?.views || 1;
              return (
                <div key={projectView.slug} className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{projectView.title}</div>
                  </div>
                  <div className="w-16 text-right text-sm font-semibold text-ink">{projectView.views}</div>
                  <div className="h-2 w-32 rounded-full bg-surface-muted">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${Math.min(100, (projectView.views / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamSettingsPanel({ team, teamId, onUpdate }) {
  const [settings, setSettings] = useState({
    name: team.name || '',
    description: team.description || '',
    website: team.website || '',
    type: team.type || 'Organization',
    theme: team.theme || 'clean',
    accent_color: team.accent_color || '#2563eb',
    layout: team.layout || 'classic',
    is_public: team.is_public !== false,
    seo_title: team.seo_title || '',
    seo_description: team.seo_description || '',
    show_skills: team.show_skills !== false,
    show_dates: team.show_dates !== false,
    show_project_type: team.show_project_type !== false,
    section_order: (() => {
      const raw = team.section_order;
      if (!raw) return ['header', 'projects', 'contact'];
      if (Array.isArray(raw)) return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return ['header', 'projects', 'contact'];
      }
    })(),
    section_config: (() => {
      const raw = team.section_config;
      if (!raw) return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    })(),
  });
  const [saving, setSaving] = useState(false);
  const teamUrl = `${window.location.origin}/team/${team.slug}`;

  const updateSetting = (key, value) => setSettings(current => ({ ...current, [key]: value }));

  const updateSectionConfig = (section, key, value) => {
    setSettings(current => ({
      ...current,
      section_config: {
        ...current.section_config,
        [section]: {
          ...current.section_config?.[section],
          [key]: value,
        },
      },
    }));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const next = Array.from(settings.section_order);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateSetting('section_order', next);
  };

  const addSection = sectionId => updateSetting('section_order', [...settings.section_order, sectionId]);
  const removeSection = sectionId => updateSetting('section_order', settings.section_order.filter(id => id !== sectionId));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/teams/${teamId}`, settings);
      toast.success('Team settings saved.');
      onUpdate?.(res.data.team);
    } catch {
      toast.error('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const optionalSections = Object.entries(TEAM_SECTIONS)
    .filter(([id, definition]) => !definition.required && !settings.section_order.includes(id));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6">
        <SectionHeading icon="eye-view" title="Visibility" body="Control whether the public team portfolio can be viewed outside the dashboard." />
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink">Public team portfolio</div>
            <div className="text-sm text-ink-muted">Anyone with the link can view this team's public page.</div>
          </div>
          <Toggle
            checked={settings.is_public}
            onClick={() => updateSetting('is_public', !settings.is_public)}
            label="Toggle public team portfolio"
          />
        </div>
        {!settings.is_public && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <EngineeringIcon name="warning-signal" size="1.1rem" />
            <span>This team portfolio is currently private. Only members can see it.</span>
          </div>
        )}
      </div>

      <div className="card p-6">
        <SectionHeading icon="theme-sun" title="Theme" body="Choose the public presentation style for this team." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              type="button"
              onClick={() => updateSetting('theme', theme.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                settings.theme === theme.id
                  ? 'border-accent bg-accent-surface'
                  : 'border-line hover:border-ink-faint hover:bg-surface-muted'
              }`}
            >
              <div className="text-sm font-semibold text-ink">{theme.label}</div>
              <div className="mt-1 text-xs text-ink-muted">{theme.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <SectionHeading icon="blocks" title="Portfolio layout" body="Choose how your public team portfolio is structured." />
        <div className="grid grid-cols-1 gap-4">
          {LAYOUTS.map(layout => (
            <button
              key={layout.id}
              type="button"
              onClick={() => updateSetting('layout', layout.id)}
              className={`flex items-center gap-4 rounded-xl border p-3 text-left transition-colors ${
                settings.layout === layout.id
                  ? 'border-accent bg-accent-surface'
                  : 'border-line hover:border-ink-faint hover:bg-surface-muted'
              }`}
            >
              <div className="h-24 w-36 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-white  ">
                <LayoutPreview layoutId={layout.id} accentColor={settings.accent_color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{layout.name}</span>
                  {settings.layout === layout.id && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">Active</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-muted">{layout.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <SectionHeading icon="target" title="Accent color" />
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => updateSetting('accent_color', color)}
              style={{ backgroundColor: color }}
              className={`h-9 w-9 rounded-lg transition-transform hover:scale-105 ${
                settings.accent_color === color ? 'ring-2 ring-ink-muted ring-offset-2' : ''
              }`}
              aria-label={`Use accent color ${color}`}
            />
          ))}
          <input
            type="color"
            value={settings.accent_color}
            onChange={event => updateSetting('accent_color', event.target.value)}
            className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-transparent "
            title="Custom color"
          />
        </div>
      </div>

      <div className="card p-6">
        <SectionHeading icon="list-menu" title="Section order" body="Drag sections to reorder them on your public team portfolio page." />
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="team-sections">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`space-y-2 rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-accent-surface p-2' : ''}`}
              >
                {settings.section_order.map((sectionId, index) => {
                  const section = TEAM_SECTIONS[sectionId];
                  if (!section) return null;
                  return (
                    <Draggable key={sectionId} draggableId={sectionId} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                            dragSnapshot.isDragging
                              ? 'border-accent bg-accent-surface shadow-pop'
                              : 'border-line bg-white  '
                          }`}
                        >
                          <button
                            type="button"
                            {...dragProvided.dragHandleProps}
                            className="flex cursor-grab flex-col gap-0.5 px-1 text-ink-faint active:cursor-grabbing"
                            aria-label={`Reorder ${section.label}`}
                          >
                            <span className="h-0.5 w-4 rounded bg-current" />
                            <span className="h-0.5 w-4 rounded bg-current" />
                            <span className="h-0.5 w-4 rounded bg-current" />
                          </button>
                          <IconTile name={section.icon} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink">{section.label}</span>
                              {section.required && (
                                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted  ">required</span>
                              )}
                            </div>
                            <p className="text-xs text-ink-muted">{section.desc}</p>
                          </div>
                          <span className="font-mono text-xs text-ink-faint">{index + 1}</span>
                          {!section.required && (
                            <button
                              type="button"
                              onClick={() => removeSection(sectionId)}
                              className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {optionalSections.length > 0 && (
          <div className="mt-4 border-t border-line pt-4 ">
            <p className="mb-2 text-sm text-ink-muted">Add optional sections</p>
            <div className="flex flex-wrap gap-2">
              {optionalSections.map(([id, definition]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addSection(id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent-text"
                >
                  <EngineeringIcon name={definition.icon} size="1rem" />
                  Add {definition.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <SectionHeading icon="eye-view" title="Section visibility" body="Choose which details appear on your public team portfolio." />
        <div className="space-y-4">
          {[
            { key: 'show_skills', label: 'Member skills', desc: 'Skill tags shown on member profiles' },
            { key: 'show_dates', label: 'Project dates', desc: 'Start and end dates on project cards' },
            { key: 'show_project_type', label: 'Project type', desc: 'Research, Software, Robotics, and similar project tags' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink">{item.label}</div>
                <div className="text-sm text-ink-muted">{item.desc}</div>
              </div>
              <Toggle
                checked={settings[item.key]}
                onClick={() => updateSetting(item.key, !settings[item.key])}
                label={`Toggle ${item.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <SectionHeading icon="tool-wrench" title="Section customization" body="Fine-tune the structure of each public section." />
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <EngineeringIcon name="team-node" size="1rem" />
              Team header
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label text-xs">Spacing</label>
                <div className="flex gap-2">
                  {['compact', 'normal', 'spacious'].map(value => (
                    <SegmentButton
                      key={value}
                      active={(settings.section_config?.header?.spacing || 'normal') === value}
                      onClick={() => updateSectionConfig('header', 'spacing', value)}
                    >
                      {value}
                    </SegmentButton>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Background</label>
                <div className="flex gap-2">
                  {[
                    { id: 'none', label: 'None' },
                    { id: 'tint', label: 'Subtle tint' },
                    { id: 'band', label: 'Color band' },
                  ].map(value => (
                    <SegmentButton
                      key={value.id}
                      active={(settings.section_config?.header?.bg || 'none') === value.id}
                      onClick={() => updateSectionConfig('header', 'bg', value.id)}
                    >
                      {value.label}
                    </SegmentButton>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-5 ">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <EngineeringIcon name="project-module" size="1rem" />
              Projects
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label text-xs">Cards per row</label>
                <div className="flex gap-2">
                  {[
                    { id: 'auto', label: 'Auto' },
                    { id: '2', label: '2' },
                    { id: '3', label: '3' },
                  ].map(value => (
                    <SegmentButton
                      key={value.id}
                      active={(settings.section_config?.projects?.columns || 'auto') === value.id}
                      onClick={() => updateSectionConfig('projects', 'columns', value.id)}
                    >
                      {value.label}
                    </SegmentButton>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Card style</label>
                <div className="flex gap-2">
                  {[
                    { id: 'rounded', label: 'Rounded' },
                    { id: 'sharp', label: 'Sharp' },
                    { id: 'pill', label: 'Soft' },
                  ].map(value => (
                    <SegmentButton
                      key={value.id}
                      active={(settings.section_config?.projects?.card_style || 'rounded') === value.id}
                      onClick={() => updateSectionConfig('projects', 'card_style', value.id)}
                    >
                      {value.label}
                    </SegmentButton>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Card spacing</label>
                <div className="flex gap-2">
                  {['tight', 'normal', 'loose'].map(value => (
                    <SegmentButton
                      key={value}
                      active={(settings.section_config?.projects?.spacing || 'normal') === value}
                      onClick={() => updateSectionConfig('projects', 'spacing', value)}
                    >
                      {value}
                    </SegmentButton>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <div className="text-sm font-medium text-ink">Show tagline</div>
                  <div className="text-sm text-ink-muted">One-line description under each project title.</div>
                </div>
                <Toggle
                  checked={settings.section_config?.projects?.show_tagline !== false}
                  onClick={() => updateSectionConfig('projects', 'show_tagline', !(settings.section_config?.projects?.show_tagline !== false))}
                  label="Toggle project taglines"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <SectionHeading icon="source-network" title="SEO and sharing" body="Set the title and description used by search engines and link previews." />
        <div>
          <label className="form-label">Page title</label>
          <input
            value={settings.seo_title || ''}
            onChange={event => updateSetting('seo_title', event.target.value)}
            placeholder={`${settings.name || team.name} - Team Portfolio`}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Meta description</label>
          <textarea
            value={settings.seo_description || ''}
            onChange={event => updateSetting('seo_description', event.target.value)}
            rows={2}
            className="form-textarea"
            placeholder="A brief description for search engines and link previews."
          />
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <SectionHeading icon="team-node" title="Team info" />
        <div>
          <label className="form-label">Team name</label>
          <input
            value={settings.name}
            onChange={event => updateSetting('name', event.target.value)}
            className="form-input"
            placeholder="Team name"
          />
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea
            value={settings.description}
            onChange={event => updateSetting('description', event.target.value)}
            rows={3}
            className="form-textarea"
            placeholder="What does your team work on?"
          />
        </div>
        <div>
          <label className="form-label">Website</label>
          <input
            value={settings.website}
            onChange={event => updateSetting('website', event.target.value)}
            className="form-input"
            placeholder="https://yourteam.com"
          />
        </div>
      </div>

      <div className="rounded-xl border border-accent-border bg-accent-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-accent-text">
          <EngineeringIcon name="link" size="1rem" />
          Team portfolio URL
        </div>
        <div className="mb-3 truncate font-mono text-sm text-accent-text">{teamUrl}</div>
        <div className="flex flex-wrap gap-3">
          <a href={`/team/${team.slug}`} target="_blank" rel="noreferrer" className="btn-primary text-xs">
            Preview
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(teamUrl);
              toast.success('Copied.');
            }}
            className="btn-secondary text-xs"
          >
            Copy link
          </button>
        </div>
      </div>

      <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  );
}

function TeamProjectList({ projects, isAdmin, onRemoveProject }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon="project-module"
        title="No team projects yet"
        body="Add published work to make this team page useful for collaborators and recruiters."
      />
    );
  }

  return (
    <div className="space-y-3">
      {projects.map(project => (
        <div key={project.id} className="card flex items-center gap-4 p-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-surface">
            {project.cover_image_url ? (
              <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <EngineeringIcon name="research-scope" size="1.4rem" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-ink">{project.title}</div>
            <div className="text-xs text-ink-muted">by {project.owner_name}</div>
            {project.collaborators?.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                {project.collaborators.slice(0, 3).map(collaborator => (
                  <div
                    key={collaborator.id}
                    className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-xs text-ink-secondary"
                    title={collaborator.name}
                  >
                    {collaborator.avatar ? (
                      <img src={collaborator.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      collaborator.name?.charAt(0)
                    )}
                  </div>
                ))}
                {project.collaborators.length > 3 && (
                  <span className="text-xs text-ink-faint">+{project.collaborators.length - 3}</span>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onRemoveProject(project.id)}
              className="rounded-lg px-3 py-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TeamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'projects');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [myProjects, setMyProjects] = useState([]);
  const [showAddProject, setShowAddProject] = useState(false);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const teamsRes = await api.get('/teams/my-teams');
      const team = teamsRes.data.teams?.find(item => item.id === id);
      if (team) {
        const res = await api.get(`/teams/${team.slug}`);
        setData(res.data);
      } else {
        setData(null);
      }
    } catch {
      toast.error('Failed to load team.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyProjects = async () => {
    try {
      const res = await api.get('/projects');
      setMyProjects((res.data.projects || []).filter(project => project.user_role === 'owner'));
    } catch {
      setMyProjects([]);
    }
  };

  useEffect(() => {
    fetchTeam();
    fetchMyProjects();
  }, [id]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    setInviting(true);
    try {
      const res = await api.post(`/teams/${id}/invite`, { username: inviteUsername.trim().replace('@', '') });
      toast.success(res.data.message);
      setInviteUsername('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateLink = async () => {
    try {
      const res = await api.post(`/teams/${id}/invite-link`);
      setInviteLink(res.data.link);
    } catch {
      toast.error('Failed to generate link.');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await api.delete(`/teams/${id}/members/${userId}`);
      setData(current => ({ ...current, members: current.members.filter(member => member.id !== userId) }));
      toast.success('Member removed.');
    } catch {
      toast.error('Failed to remove member.');
    }
  };

  const handleAddProject = async (projectId) => {
    try {
      await api.post(`/teams/${id}/projects`, { project_id: projectId });
      toast.success('Project added to team.');
      setShowAddProject(false);
      fetchTeam();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add project.');
    }
  };

  const handleRemoveProject = async (projectId) => {
    if (!confirm('Remove this project from the team?')) return;
    try {
      await api.delete(`/teams/${id}/projects/${projectId}`);
      toast.success('Project removed.');
      fetchTeam();
    } catch {
      toast.error('Failed to remove project.');
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await api.put(`/teams/${id}/members/${userId}/role`, { role });
      setData(current => ({
        ...current,
        members: current.members.map(member => (member.id === userId ? { ...member, role } : member)),
      }));
      toast.success('Role updated.');
    } catch {
      toast.error('Failed to update role.');
    }
  };

  const handleDeleteTeam = async () => {
    if (!confirm('Delete this team? This cannot be undone.')) return;
    try {
      await api.delete(`/teams/${id}`);
      toast.success('Team deleted.');
      navigate('/dashboard/teams');
    } catch {
      toast.error('Failed to delete team.');
    }
  };

  const handleSettingsUpdate = updatedTeam => {
    setData(current => ({ ...current, team: { ...current.team, ...updatedTeam } }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="team-node"
          title="Team not found"
          body="The team may have been deleted or you may not have access to it."
          action={<Link to="/dashboard/teams" className="btn-primary">Back to teams</Link>}
        />
      </DashboardLayout>
    );
  }

  const { team, members, projects } = data;
  const isOwner = team.owner_id === user?.id;
  const isAdmin = members.find(member => member.id === user?.id)?.role === 'admin' || isOwner;
  const teamUrl = `${window.location.origin}/team/${team.slug}`;
  const availableTabs = TABS.filter(tab => !tab.adminOnly || isAdmin);
  const addableProjects = myProjects.filter(project => !projects.find(teamProject => teamProject.id === project.id));

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Link
            to="/dashboard/teams"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:border-ink-faint hover:bg-surface-muted hover:text-ink"
            aria-label="Back to teams"
          >
            <span aria-hidden="true">&lt;</span>
          </Link>
          <div>
            <h1 className="page-title">{team.name}</h1>
            <p className="page-subtitle">
              {team.type} - {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/team/${team.slug}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
            Open public page
          </a>
          {isOwner && (
            <button
              type="button"
              onClick={handleDeleteTeam}
              className="btn-ghost text-sm text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <EngineeringIcon name="link" size="1.05rem" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-muted">{teamUrl}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(teamUrl);
            toast.success('Copied.');
          }}
          className="btn-secondary px-3 text-xs"
        >
          Copy URL
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-line">
        {availableTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-2 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-accent text-accent-text'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <EngineeringIcon name={tab.icon} size="1rem" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'projects' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-ink">Team projects</h3>
              <p className="text-sm text-ink-muted">Published work connected to this team.</p>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => setShowAddProject(true)} className="btn-primary text-sm">
                Add project
              </button>
            )}
          </div>

          {showAddProject && (
            <div className="card mb-5 border-accent-border p-5">
              <h4 className="text-sm font-semibold text-ink">Select one of your projects to add</h4>
              <div className="mt-4 space-y-2">
                {addableProjects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-line p-3 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{project.title}</div>
                      <div className="text-xs text-ink-muted">{project.status}</div>
                    </div>
                    <button type="button" onClick={() => handleAddProject(project.id)} className="btn-primary px-3 text-xs">
                      Add
                    </button>
                  </div>
                ))}
                {addableProjects.length === 0 && (
                  <p className="py-4 text-center text-sm text-ink-muted">No more projects to add.</p>
                )}
              </div>
              <button type="button" onClick={() => setShowAddProject(false)} className="btn-ghost mt-3 text-sm">
                Cancel
              </button>
            </div>
          )}

          <TeamProjectList projects={projects} isAdmin={isAdmin} onRemoveProject={handleRemoveProject} />
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="card flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-surface font-semibold text-accent-text">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  member.full_name?.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{member.full_name}</div>
                <div className="text-xs text-ink-muted">@{member.username}</div>
                {member.headline && <div className="truncate text-xs text-ink-faint">{member.headline}</div>}
              </div>
              <div className="flex items-center gap-2">
                {isOwner && member.id !== user?.id ? (
                  <select
                    value={member.role}
                    onChange={event => handleRoleChange(member.id, event.target.value)}
                    className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink-secondary   "
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="badge bg-surface-muted text-xs text-ink-muted  ">{member.role}</span>
                )}
                {((isOwner && member.id !== user?.id) || member.id === user?.id) && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  >
                    {member.id === user?.id ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'invite' && isAdmin && (
        <div className="max-w-lg space-y-6">
          <div className="card p-5">
            <SectionHeading icon="mail" title="Invite by username" body="They will receive an in-app notification with the invite." />
            <div className="flex gap-2">
              <input
                value={inviteUsername}
                onChange={event => setInviteUsername(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleInvite()}
                placeholder="@username"
                className="form-input flex-1 text-sm"
              />
              <button type="button" onClick={handleInvite} disabled={inviting || !inviteUsername.trim()} className="btn-primary px-4 text-sm">
                {inviting ? 'Sending...' : 'Invite'}
              </button>
            </div>
          </div>
          <div className="card p-5">
            <SectionHeading icon="link" title="Invite link" body="Anyone with this link can join the team. It expires in 7 days." />
            {inviteLink ? (
              <div className="flex gap-2">
                <input readOnly value={inviteLink} className="form-input flex-1 font-mono text-xs" />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast.success('Copied.');
                  }}
                  className="btn-secondary px-3 text-sm"
                >
                  Copy
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleGenerateLink} className="btn-secondary w-full justify-center text-sm">
                Generate invite link
              </button>
            )}
          </div>
        </div>
      )}
      {activeTab === 'invite' && !isAdmin && (
        <p className="text-sm text-ink-muted">Only admins and owners can invite members.</p>
      )}

      {activeTab === 'analytics' && isAdmin && <TeamAnalyticsPanel teamId={id} />}
      {activeTab === 'analytics' && !isAdmin && (
        <p className="text-sm text-ink-muted">Only admins and owners can view analytics.</p>
      )}

      {activeTab === 'settings' && isAdmin && (
        <TeamSettingsPanel team={team} teamId={id} onUpdate={handleSettingsUpdate} />
      )}
      {activeTab === 'settings' && !isAdmin && (
        <p className="text-sm text-ink-muted">Only admins and owners can access team settings.</p>
      )}
    </DashboardLayout>
  );
}
