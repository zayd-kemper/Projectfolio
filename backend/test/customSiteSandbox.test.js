const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomSiteCsp } = require('../utils/customSiteSecurity');
const { getSandboxOrigin, isSandboxHost, frameAncestorsValue } = require('../config/customSite');

test('CSP frame-ancestors names the app origin when one is supplied', () => {
  const csp = buildCustomSiteCsp('n0nce', { frameAncestors: 'https://app.example.com' });
  assert.match(csp, /frame-ancestors https:\/\/app\.example\.com/);
  assert.doesNotMatch(csp, /frame-ancestors 'self'/);
});

test('sandbox origin parses from env and matches its own host only', () => {
  process.env.CUSTOM_SITE_SANDBOX_ORIGIN = 'https://usercontent.example.com/';
  assert.equal(getSandboxOrigin(), 'https://usercontent.example.com');
  assert.equal(isSandboxHost('usercontent.example.com'), true);
  assert.equal(isSandboxHost('app.example.com'), false);
  delete process.env.CUSTOM_SITE_SANDBOX_ORIGIN;
});

test('no sandbox origin: frame-ancestors self and app host always allowed', () => {
  delete process.env.CUSTOM_SITE_SANDBOX_ORIGIN;
  assert.equal(frameAncestorsValue(), "'self'");
  assert.equal(isSandboxHost('anything'), true);
});
