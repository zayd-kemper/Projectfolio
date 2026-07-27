const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setPublicCacheHeaders,
  setPrivateCacheHeaders,
  PUBLIC_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
} = require('../utils/publicCacheHeaders');

// Minimal stand-in for an Express response. `vary` appends, matching Express.
const makeRes = (initialVary) => {
  const headers = {};
  if (initialVary) headers.Vary = initialVary;
  return {
    headers,
    setHeader(key, value) { headers[key] = value; },
    getHeader(key) { return headers[key]; },
    vary(field) {
      headers.Vary = headers.Vary ? `${headers.Vary}, ${field}` : field;
      return this;
    },
  };
};

test('public responses stay edge-cacheable for 60s', () => {
  const res = makeRes();
  setPublicCacheHeaders(res);
  assert.equal(res.getHeader('Cache-Control'), PUBLIC_CACHE_CONTROL);
  assert.match(res.getHeader('Cache-Control'), /s-maxage=60/);
});

test('authenticated responses are never stored by a shared cache', () => {
  const res = makeRes();
  setPrivateCacheHeaders(res);
  assert.equal(res.getHeader('Cache-Control'), PRIVATE_CACHE_CONTROL);
  assert.match(res.getHeader('Cache-Control'), /no-store/);
});

test('both variants vary on Authorization', () => {
  const publicRes = makeRes();
  setPublicCacheHeaders(publicRes);
  assert.match(publicRes.getHeader('Vary'), /Authorization/);

  const privateRes = makeRes();
  setPrivateCacheHeaders(privateRes);
  assert.match(privateRes.getHeader('Vary'), /Authorization/);
});

test('Vary is appended, not clobbered', () => {
  // compression() sets Vary: Accept-Encoding upstream. Overwriting it would break
  // encoding negotiation for every cached response.
  const res = makeRes('Accept-Encoding');
  setPublicCacheHeaders(res);
  assert.match(res.getHeader('Vary'), /Accept-Encoding/);
  assert.match(res.getHeader('Vary'), /Authorization/);
});
