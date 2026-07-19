import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortfolioStudioPage from './PortfolioStudioPage';

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'ada' }, updateUser: vi.fn() }),
}));
vi.mock('../hooks/useDarkMode', () => ({ useDarkMode: () => [false, vi.fn()] }));
vi.mock('../components/site-agent/useSiteAgent', () => ({
  default: () => ({ agentThreads: [], agentMessages: [], agentChangeSets: [] }),
}));
vi.mock('../components/site-agent/AgentWorkspace', () => ({
  default: () => <div data-testid="agent-workspace" />,
}));
vi.mock('./PortfolioSettingsPage', () => ({
  default: () => <div data-testid="portfolio-controls" />,
}));

const renderStudio = (url = '/dashboard/portfolio') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <PortfolioStudioPage />
    </MemoryRouter>
  );

describe('PortfolioStudioPage', () => {
  beforeEach(() => window.localStorage.clear());

  it('offers Chat and Controls modes with the live preview', () => {
    renderStudio();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Controls' })).toBeInTheDocument();
    expect(screen.getByTitle('Portfolio live preview')).toBeInTheDocument();
    expect(screen.getByTestId('agent-workspace')).toBeInTheDocument();
  });

  it('switches to Controls mode and remembers it as the last-used mode', () => {
    renderStudio();
    fireEvent.click(screen.getByRole('tab', { name: 'Controls' }));

    expect(screen.getByTestId('portfolio-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Controls' })).toHaveAttribute('aria-selected', 'true');
    expect(window.localStorage.getItem('projectfolio.studio.mode')).toBe('controls');
  });

  it('opens Controls mode from a deep link', () => {
    renderStudio('/dashboard/portfolio?mode=controls&section=seo');
    expect(screen.getByTestId('portfolio-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-workspace')).not.toBeInTheDocument();
  });
});
