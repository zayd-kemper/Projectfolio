import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from './LoginPage';

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../utils/api', () => ({ default: {}, API_BASE_URL: '/api' }));

describe('LoginPage', () => {
  it('offers a Continue with GitHub button linking to the github oauth route', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /continue with github/i });
    expect(link).toHaveAttribute('href', '/api/auth/github');
  });
});
