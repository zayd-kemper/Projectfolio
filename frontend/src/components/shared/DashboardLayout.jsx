// frontend/src/components/shared/DashboardLayout.jsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDarkMode } from '../../hooks/useDarkMode';
import NotificationBell from './NotificationBell';
import EngineeringIcon from './EngineeringIcon';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Projects', icon: 'project-module', end: true },
  { to: '/dashboard/media', label: 'Media Library', icon: 'media-frame' },
  { to: '/dashboard/analytics', label: 'Analytics', icon: 'analytics-gauge' },
  { to: '/dashboard/ai-tools', label: 'AI Tools', icon: 'ai-core' },
  { to: '/dashboard/integrations', label: 'Integrations', icon: 'connector' },
  { to: '/dashboard/teams', label: 'Teams', icon: 'team-node' },
  { to: '/discover', label: 'Discover', icon: 'source-network', external: false },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useDarkMode();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const portfolioUrl = user ? `/${user.username}` : '/';

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 px-4 py-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <EngineeringIcon name="brand-projectfolio" size="1.45rem" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">ProjectFolio</span>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <EngineeringIcon name={item.icon} size="1rem" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-gray-100 px-3 pb-4 pt-4 dark:border-gray-800">
        <a
          href={portfolioUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30"
        >
          <EngineeringIcon name="link" size="1rem" />
          <span>View My Portfolio</span>
        </a>

        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <EngineeringIcon name={darkMode ? 'theme-sun' : 'theme-moon'} size="1rem" />
          <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <div className="flex items-center gap-2">
          <NavLink
            to="/dashboard/settings"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                : user?.full_name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user?.full_name}</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{user?.username}</div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="flex-shrink-0 rounded-lg p-2 text-sm text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <EngineeringIcon name="key-access" size="1rem" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard-root app-surface flex min-h-screen bg-surface-page">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-100 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex w-60 flex-col border-r border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <SidebarContent />
          </aside>
        </div>
      )}

      <main className="min-h-screen min-w-0 flex-1 overflow-x-hidden lg:pl-60">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:hidden dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Open navigation"
          >
            <EngineeringIcon name="list-menu" size="1.25rem" />
          </button>
          <span className="inline-flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <EngineeringIcon name="brand-projectfolio" size="1.3rem" />
            ProjectFolio
          </span>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-6xl p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
