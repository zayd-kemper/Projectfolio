const sanitizeHtml = require('sanitize-html');
const { sanitizeCustomCss } = require('./contentSecurity');

// Parser-based allow-list sanitizer for custom-site HTML. Defense-in-depth behind
// the regex deny-list in validateCustomSiteCode: even obfuscated markup that slips
// past the regexes is dropped here because anything not on the allow-list is removed.
const CUSTOM_SITE_HTML_OPTIONS = {
  allowedTags: [
    'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'caption', 'code',
    'div', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'hr', 'i', 'img', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'picture', 'pre',
    'section', 'small', 'source', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
    'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'video',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'title', 'role', 'aria-*', 'data-*'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
    source: ['src', 'srcset', 'type', 'media'],
    video: ['src', 'poster', 'width', 'height', 'controls', 'muted', 'loop', 'playsinline'],
    time: ['datetime'],
  },
  allowedSchemes: ['https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'data'], source: ['https', 'data'], video: ['https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

const CUSTOM_SITE_LIMITS = {
  html: 120_000,
  css: 80_000,
  js: 80_000,
  total: 240_000,
};

const HTML_DENY_RULES = [
  { pattern: /<\s*script\b/i, message: 'HTML cannot include <script> tags. Put JavaScript in script.js.' },
  { pattern: /<\s*iframe\b/i, message: 'Iframes are blocked in custom sites.' },
  { pattern: /<\s*object\b/i, message: 'Object embeds are blocked in custom sites.' },
  { pattern: /<\s*embed\b/i, message: 'Embed tags are blocked in custom sites.' },
  { pattern: /<\s*base\b/i, message: 'Base tags are blocked because they can change link behavior.' },
  { pattern: /<\s*link\b/i, message: 'External link resources are blocked. Put styles in styles.css.' },
  { pattern: /<\s*meta\b[^>]*http-equiv/i, message: 'Meta refresh and http-equiv directives are blocked.' },
  { pattern: /<\s*form\b/i, message: 'Forms are blocked because custom sites cannot submit data.' },
  { pattern: /\son[a-z]+\s*=/i, message: 'Inline event handlers are blocked. Attach handlers from script.js.' },
  { pattern: /\b(?:href|src|srcset|action)\s*=\s*(['"]?)\s*javascript:/i, message: 'javascript: URLs are blocked.' },
  { pattern: /\b(?:href|src|srcset|action)\s*=\s*(['"]?)\s*data:text\/html/i, message: 'data:text/html URLs are blocked.' },
];

const CSS_DENY_RULES = [
  { pattern: /@import\b/i, message: 'CSS @import is blocked. Keep styles in styles.css.' },
  { pattern: /expression\s*\(/i, message: 'CSS expression() is blocked.' },
  { pattern: /url\s*\(\s*(['"]?)\s*javascript:/i, message: 'CSS javascript: URLs are blocked.' },
  { pattern: /url\s*\(\s*(['"]?)\s*data:text\/html/i, message: 'CSS data:text/html URLs are blocked.' },
  { pattern: /-moz-binding\s*:/i, message: 'CSS bindings are blocked.' },
  { pattern: /<\/?style\b/i, message: 'Style tags are blocked. Put CSS directly in styles.css.' },
];

const JS_DENY_RULES = [
  { pattern: /\b(?:window\.)?(?:top|parent|opener)\b/i, message: 'Access to parent, top, and opener windows is blocked.' },
  { pattern: /\bpostMessage\s*\(/i, message: 'postMessage is blocked in custom-site JavaScript.' },
  { pattern: /\bdocument\s*\.\s*cookie\b/i, message: 'document.cookie is blocked.' },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/i, message: 'Browser storage APIs are blocked.' },
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/i, message: 'Network APIs are blocked for custom sites.' },
  { pattern: /\bnavigator\s*\.\s*sendBeacon\b/i, message: 'sendBeacon is blocked for custom sites.' },
  { pattern: /\beval\s*\(/i, message: 'eval() is blocked.' },
  { pattern: /\bnew\s+Function\b/i, message: 'Function constructors are blocked.' },
  { pattern: /\bimport\s*\(/i, message: 'Dynamic imports are blocked.' },
  { pattern: /^\s*import\s.+from\s+['"]/im, message: 'External module imports are blocked.' },
  { pattern: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/i, message: 'String-based timers are blocked.' },
];

const asSource = (value) => (typeof value === 'string' ? value : '');

const normalizeCustomSiteCode = (value = {}) => ({
  html: asSource(value.html ?? value.custom_site_html),
  css: asSource(value.css ?? value.custom_site_css),
  js: asSource(value.js ?? value.custom_site_js),
});

const addRuleErrors = (source, rules, field, errors) => {
  rules.forEach((rule) => {
    if (rule.pattern.test(source)) errors.push({ field, message: rule.message });
  });
};

const validateCustomSiteCode = (code = {}, options = {}) => {
  const normalized = normalizeCustomSiteCode(code);
  const enabled = options.enabled === true;
  const errors = [];
  const warnings = [];

  if (enabled && !normalized.html.trim()) {
    errors.push({ field: 'custom_site_html', message: 'HTML is required before publishing a custom site.' });
  }

  if (normalized.html.length > CUSTOM_SITE_LIMITS.html) {
    errors.push({ field: 'custom_site_html', message: `HTML must be ${CUSTOM_SITE_LIMITS.html} characters or fewer.` });
  }
  if (normalized.css.length > CUSTOM_SITE_LIMITS.css) {
    errors.push({ field: 'custom_site_css', message: `CSS must be ${CUSTOM_SITE_LIMITS.css} characters or fewer.` });
  }
  if (normalized.js.length > CUSTOM_SITE_LIMITS.js) {
    errors.push({ field: 'custom_site_js', message: `JavaScript must be ${CUSTOM_SITE_LIMITS.js} characters or fewer.` });
  }

  const total = normalized.html.length + normalized.css.length + normalized.js.length;
  if (total > CUSTOM_SITE_LIMITS.total) {
    errors.push({ field: 'custom_site', message: `Combined custom-site code must be ${CUSTOM_SITE_LIMITS.total} characters or fewer.` });
  }

  addRuleErrors(normalized.html, HTML_DENY_RULES, 'custom_site_html', errors);
  addRuleErrors(normalized.css, CSS_DENY_RULES, 'custom_site_css', errors);
  addRuleErrors(normalized.js, JS_DENY_RULES, 'custom_site_js', errors);

  if (normalized.html.includes('target="_blank"') || normalized.html.includes("target='_blank'")) {
    warnings.push({
      field: 'custom_site_html',
      message: 'Links that open a new tab should include rel="noopener noreferrer".',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
};

const sanitizeCustomSiteHtml = (value) => sanitizeHtml(asSource(value), CUSTOM_SITE_HTML_OPTIONS);

const normalizeForStorage = (code = {}) => {
  const normalized = normalizeCustomSiteCode(code);
  return {
    html: sanitizeCustomSiteHtml(normalized.html).slice(0, CUSTOM_SITE_LIMITS.html),
    css: (sanitizeCustomCss(normalized.css) || '').slice(0, CUSTOM_SITE_LIMITS.css),
    js: normalized.js.slice(0, CUSTOM_SITE_LIMITS.js),
  };
};

const escapeScriptClose = (value) => String(value || '').replace(/<\/script/gi, '<\\/script');

const safeJsonForScript = (value) => JSON.stringify(value ?? {})
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const buildCustomSiteCsp = (nonce, { frameAncestors = "'self'" } = {}) => [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  `script-src 'nonce-${nonce}'`,
  `style-src 'nonce-${nonce}'`,
  "img-src https: data: blob:",
  "font-src https: data:",
  "media-src https: data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  `frame-ancestors ${frameAncestors}`,
].join('; ');

const buildCustomSiteDocument = ({ code = {}, data = {}, nonce, frameAncestors } = {}) => {
  const normalized = normalizeForStorage(code);
  const dataJson = safeJsonForScript(data);
  const csp = buildCustomSiteCsp(nonce, { frameAncestors });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noarchive">',
    `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`,
    `<style nonce="${nonce}">`,
    'html,body{min-height:100%;margin:0}',
    normalized.css,
    '</style>',
    `<script nonce="${nonce}">window.ProjectFolioData=Object.freeze(${dataJson});</script>`,
    '</head>',
    '<body>',
    normalized.html,
    `<script nonce="${nonce}">`,
    '"use strict";',
    'try {',
    escapeScriptClose(normalized.js),
    '} catch (error) {',
    '  console.error("ProjectFolio custom-site script error:", error);',
    '}',
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
};

module.exports = {
  CUSTOM_SITE_LIMITS,
  normalizeCustomSiteCode,
  normalizeForStorage,
  sanitizeCustomSiteHtml,
  validateCustomSiteCode,
  buildCustomSiteCsp,
  buildCustomSiteDocument,
  safeJsonForScript,
};
