// Single landing route for every Supabase redirect: OAuth, email confirmation,
// and password recovery. supabase-js with detectSessionInUrl handles the implicit
// fragment automatically; the PKCE `?code=` form needs an explicit exchange.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';

// Resolves with the session once supabase-js announces it, or null if it never
// arrives. Bounded and unsubscribing so a malformed fragment leaves the user on
// an error page rather than an endless spinner, and so the listener does not
// outlive the page.
const waitForSession = (timeoutMs = 8000) =>
  new Promise((resolve) => {
    let settled = false;
    let subscription;
    const done = (session) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) done(session);
    });
    subscription = data?.subscription;
    // A session announced before the handle was assigned still resolves above;
    // this catches up the unsubscribe in that case.
    if (settled) subscription?.unsubscribe();
  });

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      if (params.get('error') || hash.get('error')) {
        if (!cancelled) navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      let { data } = await supabase.auth.getSession();
      const code = params.get('code');
      if (!data.session && code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code);
        if (exchanged.error) {
          if (!cancelled) navigate('/login?error=oauth_failed', { replace: true });
          return;
        }
        data = exchanged.data;
      }

      // No code, no session yet: this is a hash-fragment return
      // (#access_token=…), which magic links and recovery links use.
      // supabase-js consumes the fragment asynchronously and announces the
      // result through onAuthStateChange, so the first getSession() is
      // legitimately empty — waiting is the difference between a working login
      // and a spurious /login?error=oauth_failed.
      if (!data.session) {
        const session = await waitForSession();
        if (session) data = { session };
      }
      if (cancelled) return;

      if (!data.session) {
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      // Strip the tokens/code out of the address bar before going anywhere else.
      window.history.replaceState({}, document.title, window.location.pathname);

      const isRecovery = hash.get('type') === 'recovery' || params.get('type') === 'recovery';
      navigate(isRecovery ? '/reset-password' : '/dashboard', { replace: true });
    };

    finish();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-ink-muted text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
