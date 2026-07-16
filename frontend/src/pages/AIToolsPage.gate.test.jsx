import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIToolsPage from './AIToolsPage';

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const GATE_MESSAGE = 'You need at least one project that is at least 50% complete to use the AI tools. '
  + 'Add a cover image, tagline, description, or technologies to one of your projects, then try again.';

const gateRejection = () => {
  const error = new Error('Request failed with status code 403');
  error.response = { status: 403, data: { error: GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' } };
  return Promise.reject(error);
};

describe('AIToolsPage gate message', () => {
  beforeEach(async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockReset();
  });

  it('shows the server gate message when Opportunity Finder is denied', async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockImplementationOnce(gateRejection);

    render(<AIToolsPage />);
    await userEvent.click(screen.getByText('Opportunity Finder'));
    await userEvent.click(screen.getByRole('button', { name: /find opportunities/i }));

    expect(await screen.findByText(GATE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the server gate message when AI Portfolio Match is denied', async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockImplementationOnce(gateRejection);

    render(<AIToolsPage />);
    await userEvent.click(screen.getByText('AI Portfolio Match'));
    await userEvent.type(screen.getByPlaceholderText('https://example.com/opportunity'), 'https://example.com/job');
    await userEvent.click(screen.getByRole('button', { name: /analyze/i }));

    expect(await screen.findByText(GATE_MESSAGE)).toBeInTheDocument();
  });
});
