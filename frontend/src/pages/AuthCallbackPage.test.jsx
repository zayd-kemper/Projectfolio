import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// vi.mock factories run as soon as the mocked module is first imported, which
// (per ES module import hoisting) happens before any plain `const` below would
// have run. vi.hoisted() lifts these declarations alongside the vi.mock calls
// so the factories below don't read them out of the temporal dead zone.
const { navigate, getSession, exchangeCodeForSession } = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession, exchangeCodeForSession } },
}));

import AuthCallbackPage from './AuthCallbackPage';

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    navigate.mockClear();
    getSession.mockReset();
    exchangeCodeForSession.mockReset();
    window.history.replaceState({}, '', '/auth/callback');
  });

  it('sends an established session to the dashboard', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('exchanges a PKCE code when one is present', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=abc123');
    getSession.mockResolvedValue({ data: { session: null } });
    exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('routes a recovery link to the reset page', async () => {
    window.history.replaceState({}, '', '/auth/callback#type=recovery&access_token=t');
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/reset-password', { replace: true }));
  });

  it('sends a failed callback back to login with an error flag', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied');
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login?error=oauth_failed', { replace: true }));
  });
});
