const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomSiteCsp,
  buildCustomSiteDocument,
  validateCustomSiteCode,
  sanitizeCustomSiteHtml,
  normalizeForStorage,
} = require('../utils/customSiteSecurity');

test('sanitizeCustomSiteHtml strips script and event handlers while keeping structure', () => {
  const dirty = '<section class="hero"><h1>Hi</h1><img src="https://x/y.png" onerror="alert(1)"><script>steal()</script></section>';
  const clean = sanitizeCustomSiteHtml(dirty);
  assert.match(clean, /<section class="hero">/);
  assert.match(clean, /<h1>Hi<\/h1>/);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onerror/i);
});

test('normalizeForStorage returns parser-sanitized html', () => {
  const out = normalizeForStorage({ html: '<div onclick="x()">ok</div>', css: '', js: '' });
  assert.doesNotMatch(out.html, /onclick/i);
  assert.match(out.html, />ok</);
});

test('custom site validation blocks HTML escape and inline execution paths', () => {
  const result = validateCustomSiteCode({
    html: '<main><button onclick="alert(1)">Run</button><script>alert(1)</script><iframe src="https://example.com"></iframe></main>',
    css: '.x { background: url(javascript:alert(1)); }',
    js: 'window.parent.postMessage("x", "*"); fetch("https://example.com");',
  }, { enabled: true });

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join('\n'), /script/i);
  assert.match(result.errors.map((error) => error.message).join('\n'), /Inline event handlers/i);
  assert.match(result.errors.map((error) => error.message).join('\n'), /Iframes/i);
  assert.match(result.errors.map((error) => error.message).join('\n'), /Network APIs/i);
});

test('custom site validation allows a static portfolio bundle', () => {
  const result = validateCustomSiteCode({
    html: '<main><h1 data-name></h1><section id="projects"></section></main>',
    css: 'body { font-family: system-ui; } .card { color: #111827; }',
    js: 'document.querySelector("[data-name]").textContent = window.ProjectFolioData.user.full_name;',
  }, { enabled: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('custom site CSP blocks network, frames, forms, and non-nonced scripts', () => {
  const csp = buildCustomSiteCsp('nonce-value');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /script-src 'nonce-nonce-value'/);
});

test('custom site document escapes JSON and script close sequences', () => {
  const document = buildCustomSiteDocument({
    nonce: 'abc123',
    data: { user: { full_name: '</script><img src=x onerror=alert(1)>' } },
    code: {
      html: '<main id="app"></main>',
      css: 'body { color: #111; }',
      js: 'console.log("</script>");',
    },
  });

  assert.match(document, /nonce="abc123"/);
  assert.doesNotMatch(document, /<script><img/i);
  assert.match(document, /<\\\/script>/);
});
