// frontend/src/hooks/useAuth.jsx
//
// Supabase owns the session; this hook mirrors it into React and pairs it with the
// application profile from GET /auth/me (username, headline, skills, portfolio
// settings — none of which live in the Supabase JWT).
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      return res.data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      sessionRef.current = data.session;
      setSession(data.session);
      if (data.session) await loadProfile();
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!active) return;
      // TOKEN_REFRESHED fires on every silent refresh; the profile has not changed,
      // so do not re-fetch it and do not flip `loading` back on.
      const sameUser = sessionRef.current?.user?.id === nextSession?.user?.id;
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (!nextSession) {
        setUser(null);
      } else if (!sameUser || event === 'SIGNED_IN') {
        await loadProfile();
      }
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signInWithPassword = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async ({ email, password, full_name, username }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, ...(username ? { username } : {}) },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    // With "Confirm email" on, Supabase returns a user but no session.
    return { ...data, needsEmailConfirmation: Boolean(data.user) && !data.session };
  }, []);

  const signInWithOAuth = useCallback(async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
  }, []);

  // Optimistic local merge after a profile edit; the server is the source of truth.
  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => ({ ...(prev || {}), ...updatedUser }));
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      signInWithPassword, signUp, signInWithOAuth, signOut,
      updateUser, refreshProfile: loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
