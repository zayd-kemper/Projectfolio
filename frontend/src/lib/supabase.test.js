import { describe, it, expect, vi, beforeEach } from 'vitest';

const createClient = vi.fn(() => ({ auth: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('supabase client', () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.resetModules();
  });

  it('configures persistence, auto-refresh, URL detection, and PKCE', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    await import('./supabase');
    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClient.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co');
    expect(key).toBe('anon-key');
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(true);
    expect(options.auth.flowType).toBe('pkce');
  });
});
