// Single landing route for every Supabase redirect: OAuth, email confirmation,
// and password recovery. supabase-js with detectSessionInUrl handles the implicit
// fragment automatically; the PKCE `?code=` form needs an explicit exchange.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';

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
