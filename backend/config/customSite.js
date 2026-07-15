// Custom-site sandbox origin configuration.
//
// Executable user/agent-authored portfolio code is served only from a dedicated
// sandbox origin (CUSTOM_SITE_SANDBOX_ORIGIN) so author JavaScript never runs on
// the app's credentialed origin. When the var is unset (dev), behavior falls back
// to same-origin serving with frame-ancestors 'self'.

const parseOrigin = (value) => {
  try { return new URL(value).origin; } catch { return ''; }
};

const getSandboxOrigin = () => parseOrigin((process.env.CUSTOM_SITE_SANDBOX_ORIGIN || '').trim());

const getAppOrigins = () => {
  const raw = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    ...(process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  ];
  return [...new Set(raw.map(parseOrigin).filter(Boolean))];
};

const frameAncestorsValue = () => {
  const sandbox = getSandboxOrigin();
  if (!sandbox) return "'self'";
  const origins = getAppOrigins();
  return origins.length ? origins.join(' ') : "'self'";
};

const hostOf = (origin) => { try { return new URL(origin).host; } catch { return ''; } };

const isSandboxHost = (host) => {
  const sandbox = getSandboxOrigin();
  if (!sandbox) return true; // dev fallback: app origin still serves the doc
  return String(host || '').toLowerCase() === hostOf(sandbox).toLowerCase();
};

module.exports = { getSandboxOrigin, getAppOrigins, frameAncestorsValue, isSandboxHost };
