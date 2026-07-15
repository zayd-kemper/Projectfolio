import { describe, it, expect, afterEach, vi } from 'vitest';
import { customSiteSrc } from './customSiteSrc';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('customSiteSrc', () => {
  it('prefixes the configured sandbox origin and encodes the username', () => {
    vi.stubEnv('VITE_CUSTOM_SITE_ORIGIN', 'https://usercontent.example.com');
    expect(customSiteSrc('ada lovelace', '?v=9')).toBe(
      'https://usercontent.example.com/api/portfolio/ada%20lovelace/custom-site?v=9',
    );
  });

  it('falls back to a relative URL when no sandbox origin is configured', () => {
    vi.stubEnv('VITE_CUSTOM_SITE_ORIGIN', '');
    expect(customSiteSrc('ada', '')).toBe('/api/portfolio/ada/custom-site');
  });
});
