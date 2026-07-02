// frontend/src/pages/SettingsPage.jsx
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';

const ProfileSettingsPage = lazy(() => import('./ProfileSettingsPage'));
const PortfolioSettingsPage = lazy(() => import('./PortfolioSettingsPage'));
const AccountSettingsPage = lazy(() => import('./AccountSettingsPage'));

const TABS = [
  {
    id: 'profile',
    label: 'Profile',
    icon: 'team-node',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: 'gallery-grid',
  },
  {
    id: 'account',
    label: 'Account',
    icon: 'lock-secure',
  },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'profile';

  const setTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="page-title mb-1">Settings</h1>
        <p className="page-subtitle">Manage your profile, portfolio appearance, and account.</p>
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

      <Suspense fallback={<div className="py-10 text-sm text-ink-muted">Loading settings...</div>}>
        {activeTab === 'profile' && <ProfileSettingsPage noLayout />}
        {activeTab === 'portfolio' && <PortfolioSettingsPage noLayout />}
        {activeTab === 'account' && <AccountSettingsPage noLayout />}
      </Suspense>
    </DashboardLayout>
  );
}
