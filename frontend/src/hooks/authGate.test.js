import { describe, it, expect } from 'vitest';
import { authGateState } from './authGate';

describe('authGateState', () => {
  it('is pending while a session exists but the profile has not arrived', () => {
    // After an OAuth return, supabase-js establishes the session before
    // GET /auth/me resolves. Treating that gap as signed-out bounces the user
    // through /login and back, which shows as a flash of the login page.
    expect(authGateState({ loading: false, session: { access_token: 't' }, user: null }))
      .toBe('pending');
  });

  it('is authenticated once the profile is loaded', () => {
    expect(authGateState({ loading: false, session: { access_token: 't' }, user: { id: 'u1' } })).toBe('authenticated');
  });

  it('is anonymous with no session and no profile', () => {
    expect(authGateState({ loading: false, session: null, user: null })).toBe('anonymous');
  });

  it('is pending while the initial session lookup runs', () => {
    expect(authGateState({ loading: true, session: null, user: null })).toBe('pending');
  });
});
