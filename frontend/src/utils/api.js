// frontend/src/utils/api.js
import axios from 'axios';
import supabase from '../lib/supabase';

const parseTimeout = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_API_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_API_TIMEOUT_MS, 30000);
const AGENT_API_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_AGENT_API_TIMEOUT_MS, 300000);
const rawApiBaseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const API_BASE_URL = rawApiBaseUrl.endsWith('/api')
  ? rawApiBaseUrl
  : `${rawApiBaseUrl}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT_MS,
  withCredentials: true,
});

// Attach the current Supabase access token. getSession() reads from memory and
// refreshes ahead of expiry on its own, so there is no first-party refresh
// rotation to run here any more.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const url = String(config.url || '');
  if (url.startsWith('/agent/')) {
    config.timeout = Math.max(Number(config.timeout) || 0, AGENT_API_TIMEOUT_MS);
  }
  return config;
});

// A 401 now means the session is genuinely gone (revoked, or the refresh failed).
// Sign out locally and send the user to /login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').startsWith('/auth/')) {
      await supabase.auth.signOut().catch(() => {});
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
