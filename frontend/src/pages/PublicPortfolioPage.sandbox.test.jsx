import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards the security-critical invariants of the custom-site iframe: it must be
// framed from the sandbox origin (via customSiteSrc) and must never grant
// allow-same-origin, which would reunite author code with the app origin.
const source = readFileSync(resolve('src/pages/PublicPortfolioPage.jsx'), 'utf8');

describe('PublicPortfolioPage custom-site iframe', () => {
  it('builds its src from the sandbox-origin helper and never allows same-origin', () => {
    expect(source).toMatch(/customSiteSrc\(/);
    expect(source).toMatch(/sandbox="allow-scripts"/);
    expect(source).not.toMatch(/allow-same-origin/);
  });
});
