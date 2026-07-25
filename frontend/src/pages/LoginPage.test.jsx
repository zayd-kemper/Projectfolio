import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';

const signInWithOAuth = vi.fn().mockResolvedValue({});
const signInWithPassword = vi.fn().mockResolvedValue({});
const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signInWithPassword, signInWithOAuth }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('LoginPage', () => {
  it('starts a Supabase OAuth flow for each provider', async () => {
    render(<LoginPage />);
    for (const [label, provider] of [
      [/continue with google/i, 'google'],
      [/continue with linkedin/i, 'linkedin_oidc'],
      [/continue with github/i, 'github'],
    ]) {
      signInWithOAuth.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(provider));
    }
  });

  it('signs in with email and password', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith('a@b.com', 'hunter22'));
  });

  it('links to the password reset flow', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute('href', '/forgot-password');
  });
});
