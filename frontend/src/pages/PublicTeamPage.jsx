// frontend/src/pages/PublicTeamPage.jsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { format } from 'date-fns';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { PublicTeamSkeleton } from '../components/shared/Skeleton';
import { recordPublicView } from '../utils/analytics';

const THEME_CONFIG = {
  clean: {
    page: 'bg-white', card: 'bg-white border border-gray-100 shadow-sm',
    heading: 'font-semibold text-gray-900', body: 'text-gray-600',
    nav: 'border-b border-gray-100 bg-white', tag: 'bg-blue-50 text-blue-700',
    activeTag: 'text-white', filterBar: 'bg-gray-50 border border-gray-100',
    toggle: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    toggleActive: 'bg-white text-gray-900 shadow-sm',
  },
  bold: {
    page: 'bg-gray-950', card: 'bg-gray-900 border border-gray-800',
    heading: 'font-bold text-white', body: 'text-gray-300',
    nav: 'border-b border-gray-800 bg-gray-950', tag: 'bg-gray-800 text-gray-200',
    activeTag: 'text-white', filterBar: 'bg-gray-900 border border-gray-800',
    toggle: 'bg-gray-800 text-gray-400 hover:bg-gray-700',
    toggleActive: 'bg-gray-700 text-white',
  },
  minimal: {
    page: 'bg-stone-50', card: 'bg-white border-0 shadow-none',
    heading: 'font-semibold text-gray-800', body: 'text-gray-500',
    nav: 'border-b border-stone-200 bg-stone-50', tag: 'bg-stone-100 text-stone-600',
    activeTag: 'text-white', filterBar: 'bg-white border border-stone-200',
    toggle: 'bg-stone-100 text-stone-500 hover:bg-stone-200',
    toggleActive: 'bg-white text-stone-800 shadow-sm',
  },
};

const DEFAULT_SECTION_ORDER = ['header', 'projects', 'contact'];

const fmtViews = (n) => {
  const num = parseInt(n) || 0;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
};

const getTeamIcon = (type) => {
  if (type === 'Club') return 'award-badge';
  if (type === 'Research Group') return 'research-scope';
  if (type === 'Startup') return 'launch-vector';
  return 'team-node';
};

const EyeIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6z"/>
  </svg>
);

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
);

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="2" width="14" height="2.5" rx="1"/>
    <rect x="1" y="6.75" width="14" height="2.5" rx="1"/>
    <rect x="1" y="11.5" width="14" height="2.5" rx="1"/>
  </svg>
);

export default function PublicTeamPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTech, setActiveTech] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [viewMode, setViewMode] = useState('grid');

  // All hooks before early returns
  const allTechs = useMemo(() => {
    if (!data) return [];
    const freq = {};
    data.projects.forEach(p => p.technologies?.forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [data]);

  const allTypes = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.projects.map(p => p.project_type).filter(Boolean))].sort();
  }, [data]);

  const visibleProjects = useMemo(() => {
    if (!data) return [];
    let list = data.projects;
    if (activeTech) list = list.filter(p => p.technologies?.includes(activeTech));
    if (activeType) list = list.filter(p => p.project_type === activeType);
    return list;
  }, [data, activeTech, activeType]);

  useEffect(() => {
    api.get(`/teams/${slug}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Team not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!data?.team?.id || data.user_role) return;
    recordPublicView({ subjectType: 'team', subjectId: data.team.id });
  }, [data?.team?.id, data?.user_role]);

  useEffect(() => {
    if (!data?.team) return;
    const title = data.team.seo_title || `${data.team.name} - Team Portfolio`;
    const description = data.team.seo_description || data.team.description || `Projects and members from ${data.team.name}.`;
    document.title = title;

    const setMeta = (selector, attrs) => {
      let tag = document.head.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        Object.entries(attrs.create || {}).forEach(([key, value]) => tag.setAttribute(key, value));
        document.head.appendChild(tag);
      }
      Object.entries(attrs.update || {}).forEach(([key, value]) => tag.setAttribute(key, value));
    };

    setMeta('meta[name="description"]', {
      create: { name: 'description' },
      update: { content: description },
    });
    setMeta('meta[property="og:title"]', {
      create: { property: 'og:title' },
      update: { content: title },
    });
    setMeta('meta[property="og:description"]', {
      create: { property: 'og:description' },
      update: { content: description },
    });
    setMeta('meta[property="og:type"]', {
      create: { property: 'og:type' },
      update: { content: 'website' },
    });
    setMeta('meta[property="og:url"]', {
      create: { property: 'og:url' },
      update: { content: window.location.href },
    });
    setMeta('meta[name="twitter:card"]', {
      create: { name: 'twitter:card' },
      update: { content: 'summary' },
    });
  }, [data]);

  if (loading) return <PublicTeamSkeleton />;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" style={{ colorScheme: 'light' }}>
      <div className="text-center">
        <EngineeringIcon name="search-scan" size="3rem" className="mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Team not found</h2>
        <Link to="/" className="btn-primary">Go home</Link>
      </div>
    </div>
  );

  const { team, members, projects } = data;
  const layout      = team.layout || 'classic';
  const accentColor = team.accent_color || '#2563eb';
  const theme       = THEME_CONFIG[team.theme] || THEME_CONFIG.clean;

  // Parse section_config
  const sectionConfig = (() => {
    const raw = team.section_config;
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  })();

  // Derived section config values
  const headerBg        = sectionConfig?.header?.bg || 'none';
  const headerSpacing   = sectionConfig?.header?.spacing || 'normal';
  const projectsColumns = sectionConfig?.projects?.columns || 'auto';
  const projectsCardStyle = sectionConfig?.projects?.card_style || 'rounded';
  const projectsSpacing = sectionConfig?.projects?.spacing || 'normal';
  const showTagline     = sectionConfig?.projects?.show_tagline !== false;
  const contactBg       = sectionConfig?.contact?.bg || 'muted';

  // Derived CSS values
  const cardRadius  = projectsCardStyle === 'sharp' ? 'rounded-none' : projectsCardStyle === 'pill' ? 'rounded-xl' : 'rounded-lg';
  const gridGap     = projectsSpacing === 'tight' ? 'gap-3' : projectsSpacing === 'loose' ? 'gap-8' : 'gap-6';
  const colClass    = projectsColumns === '3' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  const headerPadding = headerSpacing === 'compact' ? 'py-8' : headerSpacing === 'spacious' ? 'py-24' : 'py-16';

  // Visibility
  const showDates       = team.show_dates !== false;
  const showProjectType = team.show_project_type !== false;

  // Section order
  const sectionOrder = (() => {
    const raw = team.section_order;
    if (!raw) return DEFAULT_SECTION_ORDER;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return DEFAULT_SECTION_ORDER; }
  })();

  // ── Tech pill ─────────────────────────────────────────────────────────────
  const techPill = (t) => (
    <span key={t}
      onClick={e => { e.preventDefault(); setActiveTech(activeTech === t ? null : t); setActiveType(null); }}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-mono cursor-pointer transition-all hover:opacity-80 ${activeTech === t ? theme.activeTag : theme.tag}`}
      style={activeTech === t ? { backgroundColor: accentColor } : {}}>
      {t}
    </span>
  );

  // ── Filter bar ────────────────────────────────────────────────────────────
  const FilterBar = () => {
    const hasTechs = allTechs.length >= 2;
    const hasTypes = allTypes.length >= 2;
    if (!hasTechs && !hasTypes) return null;
    const anyActive = activeTech || activeType;
    return (
      <div className={`rounded-xl p-3 mb-6 ${theme.filterBar}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex rounded-lg p-0.5 mr-2 flex-shrink-0 ${team.theme === 'bold' ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <button onClick={() => setViewMode('grid')} title="Grid view"
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${viewMode === 'grid' ? theme.toggleActive : theme.toggle}`}>
              <GridIcon />
            </button>
            <button onClick={() => setViewMode('list')} title="List view"
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${viewMode === 'list' ? theme.toggleActive : theme.toggle}`}>
              <ListIcon />
            </button>
          </div>
          <div className={`w-px h-6 flex-shrink-0 ${team.theme === 'bold' ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <button onClick={() => { setActiveTech(null); setActiveType(null); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0 ${!anyActive ? theme.activeTag : `${theme.tag} hover:opacity-80`}`}
            style={!anyActive ? { backgroundColor: accentColor } : {}}>
            All <span className="ml-1 opacity-70">({projects.length})</span>
          </button>
          {hasTechs && allTechs.map(tech => {
            const count = projects.filter(p => p.technologies?.includes(tech)).length;
            const isActive = activeTech === tech;
            return (
              <button key={tech} onClick={() => { setActiveTech(isActive ? null : tech); setActiveType(null); }}
                className={`px-3 py-1 rounded-full text-xs font-medium font-mono transition-all flex-shrink-0 ${isActive ? theme.activeTag : `${theme.tag} hover:opacity-80`}`}
                style={isActive ? { backgroundColor: accentColor } : {}}>
                {tech} <span className="ml-1 opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
        {hasTypes && (
          <div className={`flex items-center gap-2 flex-wrap mt-2 pt-2 border-t ${team.theme === 'bold' ? 'border-gray-700' : 'border-gray-200'}`}>
            <span className={`text-xs opacity-50 flex-shrink-0 font-medium ${theme.body}`}>Type:</span>
            {allTypes.map(type => {
              const count = projects.filter(p => p.project_type === type).length;
              const isActive = activeType === type;
              return (
                <button key={type} onClick={() => { setActiveType(isActive ? null : type); setActiveTech(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0 ${isActive ? theme.activeTag : `${theme.tag} hover:opacity-80`}`}
                  style={isActive ? { backgroundColor: accentColor } : {}}>
                  {type} <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}
        {anyActive && (
          <div className={`mt-2 pt-2 border-t flex items-center gap-2 ${team.theme === 'bold' ? 'border-gray-700' : 'border-gray-200'}`}>
            <span className={`text-xs ${theme.body}`}>
              Showing {visibleProjects.length} project{visibleProjects.length !== 1 ? 's' : ''}{activeTech ? ' tagged' : ' of type'}
            </span>
            <span className="text-xs font-medium font-mono px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>{activeTech || activeType}</span>
            <button onClick={() => { setActiveTech(null); setActiveType(null); }}
              className={`text-xs underline underline-offset-2 ${theme.body} opacity-60 hover:opacity-100`}>clear</button>
          </div>
        )}
      </div>
    );
  };

  // ── Project card (grid) ───────────────────────────────────────────────────
  const ProjectCard = ({ project }) => (
    <a href={`/${project.owner_username}/${project.slug}?from=team&team=${slug}`} target="_blank" rel="noreferrer"
      className={`group hover:shadow-md transition-all duration-200 overflow-hidden ${cardRadius} ${theme.card}`}>
      <div className="h-48 overflow-hidden" style={{ background: `linear-gradient(135deg,${accentColor}18,${accentColor}32)` }}>
        {project.cover_image_url
          ? <img src={project.cover_image_url} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center opacity-30"><EngineeringIcon name="research-scope" size="2.75rem" /></div>}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={`text-lg group-hover:opacity-70 transition-opacity truncate ${theme.heading}`}>{project.title}</h3>
          {project.is_featured && <EngineeringIcon name="award-badge" size="1rem" className="flex-shrink-0" />}
        </div>
        {project.tagline && showTagline && <p className={`text-sm mb-3 line-clamp-2 ${theme.body}`}>{project.tagline}</p>}
        {project.technologies?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">{project.technologies.slice(0, 4).map(techPill)}</div>
        )}
        <p className={`text-xs mb-2 opacity-60 ${theme.body}`}>by {project.owner_name}</p>
        {project.collaborators?.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex">
              {project.collaborators.slice(0, 4).map(c => (
                <div key={c.id} title={c.name}
                  className="w-6 h-6 rounded-full border-2 border-white bg-blue-100 overflow-hidden flex items-center justify-center text-xs font-bold text-blue-700"
                  style={{ marginLeft: '-4px' }}>
                  {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : c.name?.charAt(0)}
                </div>
              ))}
            </div>
            <span className={`text-xs ml-1 ${theme.body}`}>Group project</span>
          </div>
        )}
        <div className={`flex items-center justify-between text-xs mt-1 ${theme.body}`}>
          {showProjectType && <span>{project.project_type}</span>}
          <div className="flex items-center gap-3 ml-auto">
            {project.view_count > 0 && (
              <span className="flex items-center gap-1 opacity-60"><EyeIcon size={12}/> {fmtViews(project.view_count)}</span>
            )}
            {showDates && project.start_date && <span>{format(new Date(project.start_date), 'MMM yyyy')}</span>}
          </div>
        </div>
      </div>
    </a>
  );

  // ── Project row (list mode) ───────────────────────────────────────────────
  const ProjectRow = ({ project }) => (
    <a href={`/${project.owner_username}/${project.slug}?from=team&team=${slug}`} target="_blank" rel="noreferrer"
      className={`group flex items-center gap-4 p-4 rounded-xl transition-all hover:shadow-sm ${theme.card}`}>
      <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(135deg,${accentColor}18,${accentColor}32)` }}>
        {project.cover_image_url
          ? <img src={project.cover_image_url} alt={project.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center opacity-30"><EngineeringIcon name="research-scope" size="1.4rem" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`text-base group-hover:opacity-70 transition-opacity truncate ${theme.heading}`}>{project.title}</h3>
          {project.is_featured && <EngineeringIcon name="award-badge" size="0.95rem" className="flex-shrink-0" />}
        </div>
        {project.tagline && showTagline && <p className={`text-sm line-clamp-1 mb-1 ${theme.body}`}>{project.tagline}</p>}
        <p className={`text-xs mb-1 opacity-60 ${theme.body}`}>by {project.owner_name}</p>
        <div className="flex flex-wrap gap-1">{project.technologies?.slice(0, 5).map(techPill)}</div>
      </div>
      <div className={`flex items-center gap-3 text-xs flex-shrink-0 ${theme.body}`}>
        {project.view_count > 0 && (
          <span className="flex items-center gap-1 opacity-50"><EyeIcon size={11}/> {fmtViews(project.view_count)}</span>
        )}
        <span className="opacity-40 group-hover:opacity-70 transition-opacity">Open</span>
      </div>
    </a>
  );

  const EmptyState = () => (
    <div className={`text-center py-16 ${theme.body}`}>
      <EngineeringIcon name={activeTech || activeType ? 'search-scan' : 'open-folder'} size="2.4rem" className="mx-auto mb-3" />
      <p>{activeTech ? `No projects tagged "${activeTech}"` : activeType ? `No projects of type "${activeType}"` : 'No published projects yet.'}</p>
      {(activeTech || activeType) && (
        <button onClick={() => { setActiveTech(null); setActiveType(null); }}
          className="mt-3 text-sm underline underline-offset-2 opacity-60 hover:opacity-100">Show all projects</button>
      )}
    </div>
  );

  // Projects section: all layouts and view modes.
  const ProjectsSection = () => {
    if (visibleProjects.length === 0) return <><FilterBar /><EmptyState /></>;

    if (viewMode === 'list') return (
      <><FilterBar /><div className="space-y-2">{visibleProjects.map(p => <ProjectRow key={p.id} project={p} />)}</div></>
    );

    if (layout === 'minimal') return (
      <>
        <FilterBar />
        <div className="space-y-0">
          {visibleProjects.map(project => (
            <a key={project.id} href={`/${project.owner_username}/${project.slug}?from=team&team=${slug}`} target="_blank" rel="noreferrer"
              className={`block group py-5 border-b transition-colors -mx-6 px-6 ${team.theme === 'bold' ? 'border-gray-800 hover:bg-gray-900' : 'border-gray-100 hover:bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-lg group-hover:opacity-70 transition-opacity truncate ${theme.heading}`}>{project.title}</h3>
                  {project.tagline && showTagline && <p className={`text-sm truncate mt-0.5 ${theme.body}`}>{project.tagline}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {project.technologies?.slice(0, 4).map(techPill)}
                    {project.view_count > 0 && (
                      <span className={`text-xs flex items-center gap-1 opacity-50 ${theme.body}`}><EyeIcon size={11}/> {fmtViews(project.view_count)}</span>
                    )}
                  </div>
                </div>
                <span className={`text-sm flex-shrink-0 group-hover:opacity-70 transition-opacity ${theme.body}`}>Open</span>
              </div>
            </a>
          ))}
        </div>
      </>
    );

    if (layout === 'fullwidth') return (
      <>
        <FilterBar />
        <div className="space-y-4">
          {visibleProjects.map(project => (
            <a key={project.id} href={`/${project.owner_username}/${project.slug}?from=team&team=${slug}`} target="_blank" rel="noreferrer"
              className={`group hover:shadow-md transition-all duration-200 flex overflow-hidden rounded-xl ${theme.card}`}>
              <div className="w-48 flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg,${accentColor}18,${accentColor}32)` }}>
                {project.cover_image_url
                  ? <img src={project.cover_image_url} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  : <div className="w-full h-full flex items-center justify-center opacity-30"><EngineeringIcon name="research-scope" size="2.25rem" /></div>}
              </div>
              <div className="p-5 flex-1 min-w-0">
                <h3 className={`text-lg group-hover:opacity-70 transition-opacity mb-1 truncate ${theme.heading}`}>{project.title}</h3>
                {project.tagline && showTagline && <p className={`text-sm mb-2 line-clamp-2 ${theme.body}`}>{project.tagline}</p>}
                <p className={`text-xs mb-2 opacity-60 ${theme.body}`}>by {project.owner_name}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">{project.technologies?.slice(0, 5).map(techPill)}</div>
                {project.view_count > 0 && (
                  <span className={`text-xs flex items-center gap-1 opacity-50 ${theme.body}`}><EyeIcon size={11}/> {fmtViews(project.view_count)} views</span>
                )}
              </div>
            </a>
          ))}
        </div>
      </>
    );

    if (layout === 'magazine') return (
      <>
        <FilterBar />
        <div>
          <a href={`/${visibleProjects[0].owner_username}/${visibleProjects[0].slug}?from=team&team=${slug}`} target="_blank" rel="noreferrer"
            className={`group hover:shadow-lg transition-all duration-200 overflow-hidden mb-6 flex flex-col md:flex-row rounded-xl ${theme.card}`}>
            <div className="md:w-1/2 h-56 md:h-auto overflow-hidden flex-shrink-0"
              style={{ background: `linear-gradient(135deg,${accentColor}18,${accentColor}35)` }}>
              {visibleProjects[0].cover_image_url
                ? <img src={visibleProjects[0].cover_image_url} alt={visibleProjects[0].title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="w-full h-full flex items-center justify-center opacity-30"><EngineeringIcon name="research-scope" size="3rem" /></div>}
            </div>
            <div className="p-8 flex-1 flex flex-col justify-center">
              {visibleProjects[0].is_featured && (
                <span className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-yellow-600">
                  <EngineeringIcon name="award-badge" size="1rem" />
                  Featured
                </span>
              )}
              <h3 className={`text-2xl group-hover:opacity-70 transition-opacity mb-2 ${theme.heading}`}>{visibleProjects[0].title}</h3>
              {visibleProjects[0].tagline && showTagline && <p className={`mb-2 leading-relaxed ${theme.body}`}>{visibleProjects[0].tagline}</p>}
              <p className={`text-xs mb-3 opacity-60 ${theme.body}`}>by {visibleProjects[0].owner_name}</p>
              <div className="flex flex-wrap gap-1.5">{visibleProjects[0].technologies?.slice(0, 5).map(techPill)}</div>
            </div>
          </a>
          <div className={`grid ${colClass} ${gridGap}`}>
            {visibleProjects.slice(1).map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        </div>
      </>
    );

    // classic + sidebar both use the configurable grid
    return (
      <>
        <FilterBar />
        <div className={`grid ${colClass} ${gridGap}`}>
          {visibleProjects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      </>
    );
  };

  // ── Team header section ───────────────────────────────────────────────────
  const HeaderSection = () => {
    const hBgStyle = headerBg === 'tint'
      ? { background: `${accentColor}10` }
      : headerBg === 'band'
      ? { background: accentColor }
      : {};
    const hBgClass = headerBg !== 'none' ? '-mx-6 px-6 rounded-xl py-6 mb-2' : 'mb-10';
    return (
      <div className={hBgClass} style={hBgStyle}>
        <div className="flex items-start gap-6 flex-wrap mb-6">
          <div className="w-20 h-20 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accentColor}20` }}>
            <EngineeringIcon name={getTeamIcon(team.type)} size="2rem" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className={`text-4xl ${theme.heading}`}>{team.name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${theme.tag}`}>{team.type}</span>
            </div>
            {team.description && <p className={`leading-relaxed max-w-2xl mt-2 ${theme.body}`}>{team.description}</p>}
            {team.website && (
              <a href={team.website} target="_blank" rel="noreferrer"
                className="text-sm hover:underline mt-2 inline-block transition-colors"
                style={{ color: accentColor }}><EngineeringIcon name="link" size="0.95rem" className="mr-1" />{team.website}
              </a>
            )}
          </div>
        </div>
        {/* Members strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-sm font-medium opacity-60 ${theme.body}`}>Team:</span>
          {members.map(member => (
            <a key={member.id} href={`/${member.username}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors hover:opacity-80"
              style={{ background: `${accentColor}10` }}>
              <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${accentColor}30`, color: accentColor }}>
                {member.avatar_url
                  ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                  : member.full_name?.charAt(0)}
              </div>
              <span className={`text-sm ${theme.body}`}>{member.full_name}</span>
              {member.role === 'admin' && <span className="text-xs font-medium" style={{ color: accentColor }}>Admin</span>}
            </a>
          ))}
        </div>
      </div>
    );
  };

  const Footer = () => (
    <div className={`mt-12 text-center text-xs opacity-30 ${theme.body}`}>
      Team portfolio powered by <a href="/" className="hover:opacity-70">ProjectFolio</a>
    </div>
  );

  const NavBar = () => (
    <nav className={`px-6 py-4 flex items-center justify-between ${theme.nav}`}>
      <Link to="/" className={`flex items-center gap-1.5 text-sm opacity-50 hover:opacity-80 transition-opacity ${theme.body}`}>
        <EngineeringIcon name="brand-projectfolio" size="1rem" /> ProjectFolio
      </Link>
    </nav>
  );


  // Contact / connect section.
  const ContactSection = () => {
    const cBg = contactBg === 'tint'
      ? { background: `${accentColor}15` }
      : {};
    const cBgClass = team.theme === 'bold' ? 'bg-gray-900'
      : contactBg === 'none' ? 'bg-transparent border border-gray-100'
      : contactBg === 'tint' ? ''
      : 'bg-gray-50';
    return (
      <div className={`p-8 rounded-xl text-center ${cBgClass}`} style={cBg}>
        <h3 className={`text-xl font-bold mb-3 ${theme.heading}`}>{team.name}</h3>
        <p className={`text-sm mb-5 ${theme.body}`}>Get in touch with the {team.name} team.</p>
        <div className="flex justify-center flex-wrap gap-3">
          {team.website && (
            <a href={team.website} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: accentColor }}>
                <EngineeringIcon name="link" size="1rem" />
                Visit website
              </a>
          )}
          {members.filter(m => m.role === 'admin').slice(0, 1).map(admin => (
            <a key={admin.id} href={`/${admin.username}`} target="_blank" rel="noreferrer"
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-colors ${
                team.theme === 'bold' ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-200 text-gray-700 hover:bg-white'
              }`}>
                <EngineeringIcon name="team-node" size="1rem" />
                {admin.full_name}
            </a>
          ))}
        </div>
      </div>
    );
  };

  // ── Section renderer ──────────────────────────────────────────────────────
  const renderSection = (sectionId, key) => {
    switch (sectionId) {
      case 'header':
        return <div key={key}><HeaderSection /></div>;
      case 'projects':
        return (
          <div key={key} className="mt-10">
            <h2 className={`text-2xl mb-6 ${theme.heading}`}>Projects</h2>
            <ProjectsSection />
          </div>
        );
      case 'contact':
        return <div key={key} className="mt-12"><ContactSection /></div>;
      default:
        return null;
    }
  };

  // Sidebar layout.
  if (layout === 'sidebar') {
    return (
      <div className={`min-h-screen ${theme.page}`} style={{ colorScheme: 'light' }}>
        <NavBar />
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex gap-10">
            <div className="w-64 flex-shrink-0">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${accentColor}20` }}>
                <EngineeringIcon name={getTeamIcon(team.type)} size="1.65rem" />
              </div>
              <h1 className={`text-2xl mb-1 ${theme.heading}`}>{team.name}</h1>
              <p className={`text-xs mb-3 opacity-60 ${theme.body}`}>{team.type}</p>
              {team.description && <p className={`text-sm leading-relaxed mb-5 ${theme.body}`}>{team.description}</p>}
              {team.website && (
                <a href={team.website} target="_blank" rel="noreferrer"
                  className="text-sm hover:underline mb-5 inline-flex items-center gap-1.5" style={{ color: accentColor }}>
                    <EngineeringIcon name="link" size="0.95rem" />
                    Website
                  </a>
              )}
              <div className="space-y-2">
                <p className={`text-xs font-medium opacity-60 ${theme.body}`}>Members</p>
                {members.map(member => (
                  <a key={member.id} href={`/${member.username}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 py-1 hover:opacity-70 transition-opacity">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: `${accentColor}25`, color: accentColor }}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                        : member.full_name?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm truncate ${theme.body}`}>{member.full_name}</div>
                      {member.role === 'admin' && <div className="text-xs" style={{ color: accentColor }}>Admin</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`text-xl mb-4 ${theme.heading}`}>Projects</h2>
              <ProjectsSection />
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // All other layouts render sections in saved order.
  return (
    <div className={`min-h-screen ${theme.page}`} style={{ colorScheme: 'light' }}>
      <NavBar />
      <div className={`max-w-5xl mx-auto px-6 ${headerPadding}`}>
        {sectionOrder.map((id, i) => renderSection(id, i))}
        <Footer />
      </div>
    </div>
  );
}
