// frontend/src/pages/SettingsPage.jsx
import { lazy, Suspense } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';

const ProfileSettingsPage = lazy(() => import('./ProfileSettingsPage'));
const AccountSettingsPage = lazy(() => import('./AccountSettingsPage'));

const TABS = [
  {
    id: 'profile',
    label: 'Profile',
    icon: 'team-node',
  },
  {
    id: 'account',
    label: 'Account',
    icon: 'lock-secure',
  },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  // Portfolio design moved to Portfolio Studio — carry the section through.
  if (tabParam === 'portfolio') {
    const section = searchParams.get('section');
    return <Navigate to={`/dashboard/portfolio?mode=controls${section ? `&section=${section}` : ''}`} replace />;
  }

  const activeTab = TABS.find((tab) => tab.id === tabParam) ? tabParam : 'profile';

  const setTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="page-title mb-1">Settings</h1>
        <p className="page-subtitle">Manage your profile and account.</p>
      </div>

      <div className="mb-8 flex gap-1 border-b border-line" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tab.id)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <EngineeringIcon name={tab.icon} size="1rem" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <EngineeringIcon name="satellite" size="1rem" />
          <span>Portfolio design has moved to its own workspace.</span>
        </div>
        <Link to="/dashboard/portfolio" className="text-sm font-semibold text-accent-text hover:underline">
          Open Portfolio
        </Link>
      </div>

      <Suspense fallback={<div className="py-10 text-sm text-ink-muted">Loading settings...</div>}>
        {activeTab === 'profile' && <ProfileSettingsPage noLayout />}
        {activeTab === 'account' && <AccountSettingsPage noLayout />}
      </Suspense>
    </DashboardLayout>
  );
}
