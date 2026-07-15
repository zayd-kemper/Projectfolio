// Custom-site data + preview-document builders shared by the Custom Code
// settings panel and the Site Agent workspace.

export const CUSTOM_SITE_LIMITS = { html: 120000, css: 80000, js: 80000, total: 240000 };

const htmlEscape = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const safeJsonForScript = (value) => JSON.stringify(value || {})
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const escapeScriptClose = (value = '') => String(value).replace(/<\/script/gi, '<\\/script');

const normalizeProjectArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.split(',').map(item => item.trim()).filter(Boolean);
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
};

export const buildCustomSiteData = (user, projects = [], settings = {}) => ({
  user: {
    id: user?.id || '',
    full_name: user?.full_name || '',
    username: user?.username || '',
    headline: user?.headline || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    location: user?.location || '',
    website: user?.website || '',
    linkedin_url: user?.linkedin_url || '',
    github_url: user?.github_url || '',
    skills: normalizeProjectArray(user?.skills),
  },
  settings: {
    theme: settings.theme || 'clean',
    accent_color: settings.accent_color || '#2563eb',
    layout: settings.layout || 'classic',
  },
  projects: (projects || []).map(project => ({
    id: project.id,
    title: project.title,
    slug: project.slug,
    tagline: project.tagline || '',
    description: project.description || '',
    cover_image_url: project.cover_image_url || '',
    technologies: normalizeProjectArray(project.technologies),
    project_type: project.project_type || '',
    is_featured: project.is_featured === true,
    start_date: project.start_date || '',
    end_date: project.end_date || '',
    github_url: project.github_url || '',
    live_url: project.live_url || '',
    url: user?.username && project.slug ? `/${user.username}/${project.slug}` : '#',
  })),
});

export const buildStarterCustomSite = (user, projects = [], settings = {}) => {
  const siteData = buildCustomSiteData(user, projects, settings);
  const displayName = siteData.user.full_name || 'Your Name';
  const headline = siteData.user.headline || 'Engineer and builder';
  return {
    html: `<main class="site-shell">
  <section class="hero">
    <p class="eyebrow">@${htmlEscape(siteData.user.username || 'username')}</p>
    <h1>${htmlEscape(displayName)}</h1>
    <p class="headline">${htmlEscape(headline)}</p>
    <p class="bio">${htmlEscape(siteData.user.bio || 'A custom ProjectFolio site powered by your profile and project data.')}</p>
    <div class="actions">
      <a href="#projects">View projects</a>
      ${siteData.user.github_url ? `<a href="${htmlEscape(siteData.user.github_url)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ''}
    </div>
  </section>

  <section id="projects" class="projects" aria-label="Projects">
    <div class="section-heading">
      <h2>Selected work</h2>
      <p data-project-count>${siteData.projects.length} project${siteData.projects.length === 1 ? '' : 's'}</p>
    </div>
    <div class="project-grid" data-projects></div>
  </section>
</main>`,
    css: `:root {
  color-scheme: light;
  --accent: ${settings.accent_color || '#2563eb'};
  --ink: #111827;
  --muted: #667085;
  --line: #e5e7eb;
  --surface: #ffffff;
  --bg: #f8fafc;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--ink);
}
a { color: inherit; }
.site-shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 64px 0;
}
.hero {
  display: grid;
  gap: 18px;
  padding: 56px 0 44px;
  border-bottom: 1px solid var(--line);
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  font: 700 0.78rem/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  letter-spacing: 0;
}
h1 {
  margin: 0;
  max-width: 840px;
  font-size: clamp(2.6rem, 7vw, 5.8rem);
  line-height: 0.95;
  letter-spacing: 0;
}
.headline {
  margin: 0;
  max-width: 680px;
  font-size: 1.25rem;
  color: var(--muted);
}
.bio {
  margin: 0;
  max-width: 720px;
  color: #374151;
  line-height: 1.7;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
}
.actions a {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-decoration: none;
  font-weight: 700;
}
.actions a:first-child {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.projects {
  padding: 42px 0 0;
}
.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.5rem;
}
.section-heading p {
  margin: 0;
  color: var(--muted);
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}
.project-card {
  display: grid;
  gap: 12px;
  min-height: 190px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-decoration: none;
}
.project-card:hover {
  border-color: color-mix(in srgb, var(--accent), #ffffff 35%);
}
.project-card h3 {
  margin: 0;
  font-size: 1.1rem;
}
.project-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}
.tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
@media (max-width: 640px) {
  .site-shell { padding: 32px 0; }
  .hero { padding-top: 28px; }
  .section-heading { align-items: start; flex-direction: column; }
}`,
    js: `const { projects } = window.ProjectFolioData;
const grid = document.querySelector('[data-projects]');
const count = document.querySelector('[data-project-count]');

if (count) {
  count.textContent = projects.length + ' project' + (projects.length === 1 ? '' : 's');
}

if (grid) {
  grid.innerHTML = '';
  projects.forEach((project) => {
    const card = document.createElement('a');
    card.className = 'project-card';
    card.href = project.url;

    const title = document.createElement('h3');
    title.textContent = project.title;
    card.appendChild(title);

    if (project.tagline) {
      const tagline = document.createElement('p');
      tagline.textContent = project.tagline;
      card.appendChild(tagline);
    }

    const tags = document.createElement('div');
    tags.className = 'tags';
    project.technologies.slice(0, 5).forEach((tech) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tech;
      tags.appendChild(tag);
    });
    card.appendChild(tags);
    grid.appendChild(card);
  });
}`,
  };
};

export const validateCustomSiteClient = ({ html = '', css = '', js = '' }, enabled = false) => {
  const errors = [];
  const addIf = (condition, field, message) => { if (condition) errors.push({ field, message }); };
  addIf(enabled && !html.trim(), 'HTML', 'HTML is required before publishing.');
  addIf(html.length > CUSTOM_SITE_LIMITS.html, 'HTML', `HTML must be ${CUSTOM_SITE_LIMITS.html.toLocaleString()} characters or fewer.`);
  addIf(css.length > CUSTOM_SITE_LIMITS.css, 'CSS', `CSS must be ${CUSTOM_SITE_LIMITS.css.toLocaleString()} characters or fewer.`);
  addIf(js.length > CUSTOM_SITE_LIMITS.js, 'JavaScript', `JavaScript must be ${CUSTOM_SITE_LIMITS.js.toLocaleString()} characters or fewer.`);
  addIf(html.length + css.length + js.length > CUSTOM_SITE_LIMITS.total, 'Custom site', `Combined code must be ${CUSTOM_SITE_LIMITS.total.toLocaleString()} characters or fewer.`);
  addIf(/<\s*script\b/i.test(html), 'HTML', 'Move scripts into script.js; <script> tags are blocked.');
  addIf(/\son[a-z]+\s*=/i.test(html), 'HTML', 'Inline event handlers are blocked.');
  addIf(/<\s*(iframe|object|embed|base|form)\b/i.test(html), 'HTML', 'Iframe, object, embed, base, and form tags are blocked.');
  addIf(/<\s*link\b/i.test(html), 'HTML', 'External linked resources are blocked.');
  addIf(/\b(?:href|src|srcset|action)\s*=\s*(['"]?)\s*(javascript:|data:text\/html)/i.test(html), 'HTML', 'javascript: and data:text/html URLs are blocked.');
  addIf(/@import\b|expression\s*\(|url\s*\(\s*(['"]?)\s*(javascript:|data:text\/html)|<\/?style\b/i.test(css), 'CSS', 'Imports, script URLs, expression(), and style tags are blocked.');
  addIf(/\b(?:window\.)?(?:top|parent|opener)\b|\bpostMessage\s*\(|\bdocument\s*\.\s*cookie\b|\b(?:localStorage|sessionStorage|indexedDB)\b|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|\bnavigator\s*\.\s*sendBeacon\b|\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(|^\s*import\s.+from\s+['"]|\bset(?:Timeout|Interval)\s*\(\s*['"`]/im.test(js), 'JavaScript', 'Parent-window, network, storage, eval, imports, cookies, and string timers are blocked.');
  return errors;
};


export const buildCustomSitePreviewDocument = ({ html = '', css = '', js = '' }, data = {}) => {
  const nonce = 'projectfolio-preview';
  const csp = [
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
    "frame-ancestors 'self'",
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${htmlEscape(csp)}">
  <style nonce="${nonce}">html,body{min-height:100%;margin:0}${css}</style>
  <script nonce="${nonce}">window.ProjectFolioData=Object.freeze(${safeJsonForScript(data)});</script>
</head>
<body>
${html}
<script nonce="${nonce}">
"use strict";
try {
${escapeScriptClose(js)}
} catch (error) {
  console.error("ProjectFolio custom-site preview error:", error);
}
</script>
</body>
</html>`;
};
