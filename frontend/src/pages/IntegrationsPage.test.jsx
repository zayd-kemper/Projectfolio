import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IntegrationsPage from './IntegrationsPage';

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  API_BASE_URL: '/api',
}));

vi.mock('../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => {
  // Stable identity — a fresh object per render would retrigger the page's
  // [user] effect forever.
  const auth = { user: { username: 'jane' } };
  return { useAuth: () => auth };
});

vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

describe('IntegrationsPage (Integrate & Apply)', () => {
  beforeEach(async () => {
    const api = (await import('../utils/api')).default;
    api.get.mockReset();
    api.get.mockImplementation((url) => {
      if (url === '/integrations/spec') return Promise.resolve({ data: { endpoints: [] } });
      if (url === '/applications/platforms') {
        return Promise.resolve({
          data: {
            platforms: [{
              slug: 'greenhouse', name: 'Greenhouse', description: 'Greenhouse ATS pages.',
              capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
              resume: { acceptedFormats: ['pdf'], maxPages: 2 },
              coverLetter: { maxWords: 400, format: 'plain' },
              tips: [],
            }],
          },
        });
      }
      if (url === '/applications') return Promise.resolve({ data: { sessions: [] } });
      return Promise.resolve({ data: {} });
    });
    window.history.replaceState({}, '', '/dashboard/integrations');
  });

  it('replaces the two sidebar entries with a single Integrate & Apply item and redirects the old route', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const navSource = fs.readFileSync(path.resolve(__dirname, '../components/shared/DashboardLayout.jsx'), 'utf8');
    expect(navSource).toMatch(/label: 'Integrate & Apply'/);
    expect(navSource).not.toMatch(/label: 'Applications'/);
    expect(navSource).not.toMatch(/label: 'Integrations'/);
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../main.jsx'), 'utf8');
    expect(mainSource).toMatch(/path="\/dashboard\/applications"[^\n]*Navigate to="\/dashboard\/integrations\?tab=applications"/);
  });

  it('opens the Application Helper tab directly via ?tab=applications', async () => {
    window.history.replaceState({}, '', '/dashboard/integrations?tab=applications');
    render(<IntegrationsPage />);
    expect(await screen.findByText('1. Choose a platform')).toBeInTheDocument();
  });

  it('keeps a single page heading when the helper renders inside the tab', async () => {
    window.history.replaceState({}, '', '/dashboard/integrations?tab=applications');
    render(<IntegrationsPage />);
    await screen.findByText('1. Choose a platform');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers an Application Helper tab beside Share & Export and API & Embed', async () => {
    render(<IntegrationsPage />);
    expect(await screen.findByRole('heading', { name: 'Integrate & Apply' })).toBeInTheDocument();
    expect(screen.getByText('Share & Export')).toBeInTheDocument();
    expect(screen.getByText('API & Embed')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Application Helper'));
    expect(await screen.findByText('Greenhouse')).toBeInTheDocument();
    expect(screen.getByText('1. Choose a platform')).toBeInTheDocument();
  });
});
