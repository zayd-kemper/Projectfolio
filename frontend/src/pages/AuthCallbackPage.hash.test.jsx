import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { navigate, getSession, exchangeCodeForSession, onAuthStateChange } = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession, exchangeCodeForSession, onAuthStateChange } },
}));

import AuthCallbackPage from './AuthCallbackPage';

describe('AuthCallbackPage hash-token returns', () => {
  beforeEach(() => {
    navigate.mockReset();
    getSession.mockReset();
    exchangeCodeForSession.mockReset();
    onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    window.history.replaceState({}, '', '/auth/callback');
  });

  it('subscribes to onAuthStateChange and awaits the session instead of failing the first empty getSession', async () => {
    // Magic links and recovery links come back as #access_token=..., not ?code=.
    // supabase-js consumes the fragment asynchronously and announces the session
    // through onAuthStateChange, so the first getSession() can legitimately be
    // null. Bailing on it sends a valid login to /login?error=oauth_failed.
    window.history.replaceState({}, '', '/auth/callback#access_token=t&refresh_token=r');
    getSession.mockResolvedValue({ data: { session: null } });

    let emit;
    onAuthStateChange.mockImplementation((cb) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(<AuthCallbackPage />);
    await waitFor(() => expect(
      onAuthStateChange.mock.calls.length,
      'AuthCallbackPage must subscribe to supabase.auth.onAuthStateChange and await the session when the URL carries a hash fragment instead of ?code=',
    ).toBeGreaterThan(0));
    emit('SIGNED_IN', { access_token: 't' });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(navigate).not.toHaveBeenCalledWith('/login?error=oauth_failed', { replace: true });
  });
});
