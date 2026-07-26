import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { signOut, navigate } = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  NavLink: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/dashboard' }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { username: 'maya', full_name: 'Maya Iyer' }, signOut }),
}));
vi.mock('../../hooks/useDarkMode', () => ({
  default: () => [false, vi.fn()],
  useDarkMode: () => [false, vi.fn()],
}));
vi.mock('../../utils/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }));

import DashboardLayout from './DashboardLayout';

describe('DashboardLayout sign out', () => {
  beforeEach(() => {
    signOut.mockClear();
    navigate.mockClear();
  });

  it('clears the session without issuing its own navigation', async () => {
    // ProtectedRoute already renders <Navigate to="/login" replace /> the moment
    // `user` clears. A second, competing navigate() here races it: one wins the
    // address bar, the other wins the render, and the router ends up showing a
    // component that does not match the URL — making every link to that URL a
    // silent no-op.
    render(<DashboardLayout><div /></DashboardLayout>);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});
