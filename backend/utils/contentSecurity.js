const sanitizeHtml = require('sanitize-html');

const allowedIframeHosts = new Set([
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
  'www.figma.com',
  'figma.com',
  'docs.google.com',
  'drive.google.com',
  'sketchfab.com',
  'www.sketchfab.com',
  'codepen.io',
  'codesandbox.io',
]);

const sanitizeRichHtml = (html = '') => sanitizeHtml(String(html), {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'code', 'pre',
    'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['class'],
    code: ['class'],
    pre: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        href: attribs.href,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
});

const safeEmbedUrl = (value) => {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return '';
    const host = url.hostname.toLowerCase();
    return allowedIframeHosts.has(host) || [...allowedIframeHosts].some((allowed) => host.endsWith(`.${allowed}`))
      ? url.toString()
      : '';
  } catch {
    return '';
  }
};

const safeFileUrl = (value) => {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return '';
    return url.toString();
  } catch {
    return '';
  }
};

const sanitizeCustomCss = (css = '') => {
  const source = String(css || '');
  if (!source.trim()) return null;
  return source
    .replace(/@import\b[^;]*(;|$)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\)/gi, 'none')
    .replace(/url\s*\(\s*(['"]?)\s*data:text\/html[^)]+\)/gi, 'none')
    .replace(/<\/?style\b[^>]*>/gi, '')
    .slice(0, 50000);
};

const sanitizeBlockContent = (type, content = {}) => {
  const clean = content && typeof content === 'object' && !Array.isArray(content) ? { ...content } : {};
  if (type === 'text' || Object.prototype.hasOwnProperty.call(clean, 'html')) {
    clean.html = sanitizeRichHtml(clean.html || '');
  }
  if (type === 'embed' || Object.prototype.hasOwnProperty.call(clean, 'url')) {
    if (type === 'embed') clean.url = safeEmbedUrl(clean.url);
  }
  if (type === 'file') {
    clean.url = safeFileUrl(clean.url);
    clean.filename = String(clean.filename || clean.name || 'Attached file').slice(0, 240);
    clean.type = String(clean.type || clean.file_type || '').slice(0, 120);
    const size = Number(clean.size || clean.file_size || 0);
    clean.size = Number.isFinite(size) && size >= 0 ? Math.min(size, 500 * 1024 * 1024) : 0;
  }
  return clean;
};

module.exports = {
  sanitizeRichHtml,
  sanitizeBlockContent,
  sanitizeCustomCss,
  safeEmbedUrl,
  safeFileUrl,
};
