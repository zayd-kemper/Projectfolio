import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession, signOut } },
}));

const api = (await import('./api')).default;

// The rejected handler of the response interceptor, invoked directly so the
// test does not need a live server.
const rejected = api.interceptors.response.handlers[0].rejected;

const unauthorized = (url = '/projects') => ({
  response: { status: 401 },
  config: { url },
});

describe('api 401 handling', () => {
  let replace;

  beforeEach(() => {
    getSession.mockReset();
    signOut.mockReset().mockResolvedValue({});
    replace = vi.fn();
    delete window.location;
    window.location = { pathname: '/dashboard', replace, href: '' };
  });

  it('does not redirect when the session is already gone', async () => {
    // A deliberate sign-out clears the session, then in-flight polling requests
    // 401 on their way out. Redirecting here races the router's own navigation
    // and leaves the URL pointing at a route the router never rendered.
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(rejected(unauthorized())).rejects.toBeDefined();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });

  it('still signs out and redirects when a live session gets a 401', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    await expect(rejected(unauthorized())).rejects.toBeDefined();
    expect(signOut).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
