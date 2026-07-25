// The single Supabase Auth client for the SPA.
//
// supabase-js owns the session: it persists it, refreshes it ahead of expiry, and
// picks it up out of the URL after an OAuth / confirm-email / recovery redirect.
// utils/api.js reads the current access token off this client for every API call,
// so nothing else should touch session storage directly.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Loud in dev, harmless in prod builds where the vars are always injected.
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for auth to work.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE is the correct flow for a public browser client and is what the
    // /auth/callback route in Tasks 9-11 exchanges.
    flowType: 'pkce',
  },
});

export default supabase;
