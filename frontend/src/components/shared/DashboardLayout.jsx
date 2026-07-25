// frontend/src/components/shared/DashboardLayout.jsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDarkMode } from '../../hooks/useDarkMode';
import NotificationBell from './NotificationBell';
import EngineeringIcon from './EngineeringIcon';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Projects', icon: 'project-module', end: true },
  { to: '/dashboard/portfolio', label: 'Portfolio', icon: 'satellite' },
  { to: '/dashboard/media', label: 'Media Library', icon: 'media-frame' },
  { to: '/dashboard/analytics', label: 'Analytics', icon: 'analytics-gauge' },
  { to: '/dashboard/ai-tools', label: 'Opportunities', icon: 'target' },
  { to: '/dashboard/advisor', label: 'Advisor', icon: 'trend-line' },
  { to: '/dashboard/integrations', label: 'Integrate & Apply', icon: 'briefcase' },
  { to: '/dashboard/teams', label: 'Teams', icon: 'team-node' },
  { to: '/discover', label: 'Discover', icon: 'source-network', external: false },
];

const SIDEBAR_COLLAPSE_KEY = 'pf-sidebar-collapsed';

const readStoredCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export default function DashboardLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [darkMode, setDarkMode] = useDarkMode();

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Storage unavailable (private mode) — collapse still works for the session.
      }
      return next;
    });
  };

  // signOut clears the Supabase session; await it so navigation cannot race the
  // onAuthStateChange listener that drops `user`.
  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const portfolioUrl = user ? `/${user.username}` : '/';

  const SidebarContent = ({ collapsed: rail = false }) => (
    <div className="flex h-full flex-col">
      <div className={`border-b border-line-subtle py-5 ${rail ? 'px-2' : 'px-4'}`}>
        <div className={`flex items-center gap-2 ${rail ? 'flex-col' : ''}`}>
          <EngineeringIcon name="brand-projectfolio" size="1.45rem" />
          {!rail && <span className="font-semibold text-ink">ProjectFolio</span>}
          <div className={rail ? '' : 'ml-auto'}>
            <NotificationBell />
          </div>
        </div>
      </div>

      <nav className={`flex-1 space-y-1 py-4 ${rail ? 'px-2' : 'px-3'}`}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            title={rail ? item.label : undefined}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${rail ? 'justify-center' : ''}`}
          >
            <EngineeringIcon name={item.icon} size="1rem" />
            {!rail && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={`space-y-2 border-t border-line-subtle pb-4 pt-4 ${rail ? 'px-2' : 'px-3'}`}>
        <a
          href={portfolioUrl}
          target="_blank"
          rel="noreferrer"
          title={rail ? 'View My Portfolio' : undefined}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-surface ${rail ? 'justify-center' : ''}`}
        >
          <EngineeringIcon name="link" size="1rem" />
          {!rail && <span>View My Portfolio</span>}
        </a>

        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          title={rail ? (darkMode ? 'Light mode' : 'Dark mode') : undefined}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted ${rail ? 'justify-center' : ''}`}
        >
          <EngineeringIcon name={darkMode ? 'theme-sun' : 'theme-moon'} size="1rem" />
          {!rail && <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        <div className={`flex items-center gap-2 ${rail ? 'flex-col' : ''}`}>
          <NavLink
            to="/dashboard/settings"
            title={rail ? 'Account settings' : undefined}
            className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-lg transition-colors hover:bg-surface-muted ${rail ? 'justify-center p-1.5' : 'flex-1 px-3 py-2'}`}
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-surface text-sm font-bold text-accent-text">
              {user?.avatar_url
                ? <img loading="lazy" decoding="async" src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                : user?.full_name?.charAt(0)?.toUpperCase()}
            </div>
            {!rail && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{user?.full_name}</div>
                <div className="truncate text-xs text-ink-muted">@{user?.username}</div>
              </div>
            )}
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="touch-target flex flex-shrink-0 items-center justify-center rounded-lg p-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-secondary"
          >
            <EngineeringIcon name="key-access" size="1rem" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-surface flex min-h-screen bg-surface-page">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line-subtle bg-surface-rail transition-[width] duration-300 ease-in-out lg:flex ${collapsed ? 'w-[68px]' : 'w-60'}`}>
        <SidebarContent collapsed={collapsed} />
        <div className="border-t border-line-subtle px-3 py-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted ${collapsed ? 'justify-center' : ''}`}
          >
            <EngineeringIcon name="list-menu" size="1rem" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex w-60 flex-col border-r border-line-subtle bg-surface-rail shadow-sm">
            <SidebarContent />
          </aside>
        </div>
      )}

      <main className={`min-h-screen min-w-0 flex-1 overflow-x-hidden transition-[padding] duration-300 ease-in-out ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-60'}`}>
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line-subtle bg-surface-rail px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-surface-muted"
            aria-label="Open navigation"
          >
            <EngineeringIcon name="list-menu" size="1.25rem" />
          </button>
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <EngineeringIcon name="brand-projectfolio" size="1.3rem" />
            ProjectFolio
          </span>
        </div>

        <div
          {...(collapsed ? { 'data-sidebar-collapsed': '' } : {})}
          className={`mx-auto w-full min-w-0 p-6 transition-[max-width] duration-300 ease-in-out lg:p-8 ${collapsed ? 'max-w-[84rem]' : 'max-w-6xl'}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
