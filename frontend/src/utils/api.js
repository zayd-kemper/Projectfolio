// frontend/src/utils/api.js
import axios from 'axios';

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

// Automatically attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const url = String(config.url || '');
  if (url.startsWith('/agent/')) {
    config.timeout = Math.max(Number(config.timeout) || 0, AGENT_API_TIMEOUT_MS);
  }
  return config;
});

let refreshRequest = null;

// Rotate the HttpOnly refresh token once, then replay concurrent failed requests.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const isAuthEndpoint = String(original.url || '').startsWith('/auth/');
    if (error.response?.status === 401 && !original._retriedAfterRefresh && !isAuthEndpoint) {
      original._retriedAfterRefresh = true;
      refreshRequest ||= axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true, timeout: DEFAULT_API_TIMEOUT_MS })
        .then(({ data }) => {
          localStorage.setItem('token', data.token);
          return data.token;
        })
        .finally(() => { refreshRequest = null; });
      try {
        const token = await refreshRequest;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
