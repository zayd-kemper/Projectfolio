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

      <div className="mb-8 flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <EngineeringIcon name={tab.icon} size="1rem" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <Suspense fallback={<div className="py-10 text-sm text-gray-500">Loading settings...</div>}>
        {activeTab === 'profile' && <ProfileSettingsPage noLayout />}
        {activeTab === 'portfolio' && <PortfolioSettingsPage noLayout />}
        {activeTab === 'account' && <AccountSettingsPage noLayout />}
      </Suspense>
    </DashboardLayout>
  );
}
