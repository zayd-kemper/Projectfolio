import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamCardMenu } from './TeamsPage';

vi.mock('../utils/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { teams: [] } }), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

describe('TeamCardMenu', () => {
  it('is a menu button with expanded state and Escape-to-close', () => {
    render(<TeamCardMenu team={{ id: 1, slug: 'rocketry' }} isAdmin />);

    const toggle = screen.getByTitle('Team options');
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
