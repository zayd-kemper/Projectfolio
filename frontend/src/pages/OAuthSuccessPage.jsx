import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

const oauthExchangePromises = new Map();

const exchangeOAuthCode = (code) => {
  if (!oauthExchangePromises.has(code)) {
    oauthExchangePromises.set(
      code,
      api.post('/auth/oauth/exchange', { code })
        .finally(() => window.setTimeout(() => oauthExchangePromises.delete(code), 5000))
    );
  }
  return oauthExchangePromises.get(code);
};

export default function OAuthSuccessPage() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (!code) {
        if (localStorage.getItem('token')) navigate('/dashboard', { replace: true });
        else navigate('/login?error=oauth_failed', { replace: true });
        return;
      }
      try {
        const { data } = await exchangeOAuthCode(code);
        if (cancelled) return;
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        updateUser(data.user);
        navigate('/dashboard', { replace: true });
      } catch {
        if (!cancelled) navigate('/login?error=oauth_failed', { replace: true });
      }
    };
    finish();
    return () => { cancelled = true; };
  }, [navigate, updateUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-ink-muted text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
