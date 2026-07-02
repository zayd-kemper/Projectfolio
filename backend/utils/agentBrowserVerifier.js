const fs = require('fs');
const path = require('path');

const DEFAULT_SECTION_ORDER = ['header', 'projects', 'contact'];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeScriptEnd = (value) => String(value || '').replace(/<\/script/gi, '<\\/script');

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const asObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const slug = (value, fallback = 'section') => (
  String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
);

const cssToken = (value, fallback) => {
  const text = String(value ?? '').trim();
  if (!text || /[;{}<>]/.test(text)) return fallback;
  return text.slice(0, 220);
};

const analyzeScreenshotBuffer = (buffer) => {
  if (!buffer || !buffer.length) {
    return { bytes: 0, uniqueByteCount: 0, likelyNonBlank: false };
  }
  const sampleStep = Math.max(1, Math.floor(buffer.length / 5000));
  const unique = new Set();
  for (let index = 0; index < buffer.length; index += sampleStep) {
    unique.add(buffer[index]);
  }
  return {
    bytes: buffer.length,
    uniqueByteCount: unique.size,
    likelyNonBlank: buffer.length > 3000 && unique.size > 24,
  };
};

const safeArtifactName = (value) => (
  String(value || 'page')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'page'
);

const saveScreenshotArtifact = async ({ screenshotDir, buffer, mode, page, viewport, artifactId }) => {
  if (!screenshotDir || !buffer?.length) return null;
  const absoluteDir = path.resolve(screenshotDir);
  await fs.promises.mkdir(absoluteDir, { recursive: true });
  const prefix = artifactId ? `${safeArtifactName(artifactId)}-` : '';
  const filename = `${prefix}${safeArtifactName(mode)}-${safeArtifactName(page)}-${safeArtifactName(viewport)}.png`;
  const filePath = path.join(absoluteDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
};

const BENIGN_CONSOLE_PATTERNS = [
  /React Router Future Flag Warning/i,
  /\[vite\] Direct websocket connection fallback/i,
  /WebSocket connection to ['"]ws:\/\/localhost[^'"]*['"] failed/i,
  /Download the React DevTools/i,
];

const classifyConsoleMessage = (type, text, label = 'browser') => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (BENIGN_CONSOLE_PATTERNS.some((pattern) => pattern.test(normalized))) return null;

  const severity = type === 'error' ? 'error' : 'warning';
  return {
    severity,
    message: `${label}: ${normalized}`,
  };
};

const buildCustomSection = (section = {}) => {
  const type = slug(section.type, 'text');
  const sectionId = slug(section.id || type);
  const variant = slug(section.variant || 'default', 'default');
  const content = asObject(section.content);
  const items = asArray(content.items);
  const groups = asArray(content.groups);
  const columns = asArray(content.columns);
  const highlights = asArray(content.highlights);
  const title = section.title || content.title || sectionId;
  const subtitle = section.subtitle || content.subtitle || '';
  const cardItems = items.length
    ? items
    : groups.length
      ? groups.map((group) => ({ title: group.title, text: [group.note, ...asArray(group.skills)].filter(Boolean).join(' ') }))
      : columns.length
        ? columns.map((column) => ({ title: column.title, text: asArray(column.items).join(' ') }))
        : highlights.length
          ? highlights.map((item) => ({ title: item.label, text: item.value }))
          : [{ title: content.heading || title, text: content.text || content.description || subtitle }];

  const itemHtml = cardItems.slice(0, 6).map((item, index) => `
    <article class="pf-feature-card pf-stat-card pf-proof-card pf-case-card pf-process-step pf-comparison-card pf-faq-item pf-skill-matrix-card">
      <div class="pf-feature-icon">${escapeHtml(item.icon || item.value || String(index + 1).padStart(2, '0'))}</div>
      <h3 class="pf-feature-title">${escapeHtml(item.title || item.label || item.heading || item.question || 'Detail')}</h3>
      <p class="pf-feature-text">${escapeHtml(item.text || item.description || item.caption || item.answer || item.label || '')}</p>
    </article>
  `).join('');

  return `
    <section class="pf-section pf-custom-section pf-custom-${type} pf-section-${sectionId} pf-variant-${variant}" data-pf-section-id="${escapeHtml(section.id || sectionId)}" data-pf-variant="${escapeHtml(section.variant || '')}">
      <div class="pf-section-heading">
        <h2 class="pf-section-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="pf-section-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div class="pf-feature-grid pf-proof-wall pf-case-study pf-process-list pf-comparison-grid pf-faq-list pf-skill-matrix pf-media-feature">${itemHtml}</div>
    </section>
  `;
};

const buildVerificationHtml = ({ user = {}, settings = {}, projects = [] } = {}) => {
  const sectionOrder = asArray(settings.section_order).length ? asArray(settings.section_order) : DEFAULT_SECTION_ORDER;
  const siteSections = asArray(settings.site_sections);
  const designSystem = asObject(settings.design_system);
  const tokens = asObject(designSystem.tokens);
  const themeOverrides = asObject(settings.theme_overrides);
  const accent = cssToken(tokens.accent || themeOverrides.accentColor || settings.accent_color, '#2563eb');
  const background = cssToken(tokens.background || themeOverrides.pageBackground, settings.theme === 'bold' ? '#030712' : '#ffffff');
  const surface = cssToken(tokens.surface || themeOverrides.cardBackground, settings.theme === 'bold' ? '#111827' : '#ffffff');
  const text = cssToken(tokens.text, settings.theme === 'bold' ? '#f8fafc' : '#111827');
  const muted = cssToken(tokens.muted, settings.theme === 'bold' ? '#cbd5e1' : '#64748b');
  const radius = cssToken(tokens.radius || themeOverrides.cardBorderRadius, '18px');
  const shadow = cssToken(tokens.shadow || themeOverrides.cardShadow, '0 20px 60px rgba(15,23,42,.14)');
  const customCss = String(settings.custom_css || '');
  const skills = asArray(user.skills);
  const visibleProjects = Array.isArray(projects) && projects.length ? projects : [
    { id: 'sample-project', title: 'Sample Project', tagline: 'Representative project card for browser verification.', technologies: ['React', 'Node'] },
  ];

  const projectCards = visibleProjects.slice(0, 6).map((project) => `
    <a class="pf-project-card" href="#">
      <div class="pf-project-media"></div>
      <div class="pf-project-body">
        <h3 class="pf-project-title">${escapeHtml(project.title || 'Project')}</h3>
        <p class="pf-project-tagline">${escapeHtml(project.tagline || project.description || 'Project summary')}</p>
        <div class="pf-project-tech">${asArray(project.technologies).slice(0, 5).map((tech) => `<span class="pf-tech-tag">${escapeHtml(tech)}</span>`).join('')}</div>
      </div>
    </a>
  `).join('');

  const renderSection = (sectionId) => {
    if (sectionId === 'header') {
      return `
        <section class="pf-section pf-header">
          <div class="pf-avatar">${escapeHtml((user.full_name || user.username || 'P').charAt(0))}</div>
          <div>
            <p class="pf-kicker">@${escapeHtml(user.username || 'preview')}</p>
            <h1 class="pf-name">${escapeHtml(user.full_name || 'Portfolio Preview')}</h1>
            <p class="pf-headline">${escapeHtml(user.headline || 'Personal website preview')}</p>
            <p class="pf-bio">${escapeHtml(user.bio || 'Browser verification checks the proposed site bundle before it is applied.')}</p>
            <div class="pf-skills">${skills.slice(0, 8).map((skill) => `<span class="pf-skill-tag">${escapeHtml(skill)}</span>`).join('')}</div>
          </div>
        </section>
      `;
    }
    if (sectionId === 'projects') {
      return `
        <section class="pf-section pf-projects-section">
          <div class="pf-section-heading">
            <h2 class="pf-section-title">Projects</h2>
            <p class="pf-section-subtitle">Published work and proof.</p>
          </div>
          <div class="pf-projects">${projectCards}</div>
        </section>
      `;
    }
    if (sectionId === 'contact') {
      return `
        <section class="pf-section pf-contact">
          <div class="pf-contact-card">
            <h2 class="pf-contact-title">Contact</h2>
            <p class="pf-contact-text">Connect with ${escapeHtml(user.full_name || user.username || 'this creator')}.</p>
            <a class="pf-contact-link" href="#">Get in touch</a>
          </div>
        </section>
      `;
    }
    if (sectionId === 'education') {
      return `
        <section class="pf-section pf-education">
          <div class="pf-section-heading">
            <h2 class="pf-section-title">Education & Credentials</h2>
            <p class="pf-section-subtitle">Degrees, certifications, awards, and relevant training.</p>
          </div>
          <div class="pf-credentials-list">
            <div class="pf-credential-card">
              <p class="pf-credential-type">Credential</p>
              <h3 class="pf-credential-title">Representative credential</h3>
              <p class="pf-credential-institution">ProjectFolio verification</p>
            </div>
          </div>
        </section>
      `;
    }
    if (sectionId === 'endorsements') {
      return `
        <section class="pf-section pf-endorsements">
          <div class="pf-section-heading">
            <h2 class="pf-section-title">Endorsements</h2>
            <p class="pf-section-subtitle">Verified public praise and credibility signals.</p>
          </div>
          <div class="pf-endorsements-list">
            <div class="pf-endorsement-card">
              <p class="pf-endorsement-quote">Representative endorsement card for browser verification.</p>
            </div>
          </div>
        </section>
      `;
    }
    return buildCustomSection(siteSections.find((section) => section.id === sectionId) || { id: sectionId, type: 'text', title: sectionId });
  };

  const orderedSections = sectionOrder.map(renderSection).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ProjectFolio Agent Browser Verification</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: ${background}; color: ${text}; }
    #pf-root {
      --pf-accent: ${accent};
      --pf-bg: ${background};
      --pf-card-bg: ${surface};
      --pf-text: ${text};
      --pf-subtext: ${muted};
      --pf-radius: ${radius};
      --pf-shadow: ${shadow};
      --pf-section-gap: ${cssToken(tokens.sectionGap, '72px')};
      --pf-content-width: ${cssToken(tokens.contentWidth, '1120px')};
      min-height: 100vh;
      background: var(--pf-bg);
      color: var(--pf-text);
    }
    .pf-nav, .pf-main { width: min(var(--pf-content-width), calc(100vw - 40px)); margin: 0 auto; }
    .pf-nav { display: flex; justify-content: space-between; padding: 20px 0; color: var(--pf-subtext); }
    .pf-main { padding: 48px 0 88px; }
    .pf-section { margin-top: var(--pf-section-gap); }
    .pf-header { margin-top: 0; display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 28px; align-items: start; }
    .pf-avatar, .pf-project-card, .pf-feature-card, .pf-stat-card, .pf-contact-card, .pf-credential-card, .pf-endorsement-card { background: var(--pf-card-bg); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow); }
    .pf-avatar { width: 96px; height: 96px; display: grid; place-items: center; color: var(--pf-accent); font-size: 32px; font-weight: 800; }
    .pf-kicker { color: var(--pf-accent); font-weight: 700; margin: 0 0 10px; }
    .pf-name { font-size: clamp(42px, 8vw, 92px); line-height: .94; margin: 0; letter-spacing: 0; }
    .pf-headline { font-size: clamp(18px, 3vw, 28px); color: var(--pf-subtext); margin: 18px 0 0; }
    .pf-bio { max-width: 760px; color: var(--pf-subtext); line-height: 1.75; }
    .pf-skills, .pf-project-tech { display: flex; flex-wrap: wrap; gap: 8px; }
    .pf-skill-tag, .pf-tech-tag { border: 1px solid color-mix(in srgb, var(--pf-accent), transparent 70%); border-radius: 999px; padding: 7px 11px; color: var(--pf-accent); }
    .pf-section-heading { margin-bottom: 22px; }
    .pf-section-title { font-size: clamp(28px, 4vw, 48px); margin: 0; }
    .pf-section-subtitle { color: var(--pf-subtext); margin: 8px 0 0; }
    .pf-projects, .pf-feature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
    .pf-project-card { display: block; color: inherit; text-decoration: none; overflow: hidden; min-width: 0; }
    .pf-project-media { height: 160px; background: linear-gradient(135deg, var(--pf-accent), transparent); opacity: .62; }
    .pf-project-body, .pf-feature-card, .pf-stat-card, .pf-contact-card, .pf-credential-card, .pf-endorsement-card { padding: 22px; }
    .pf-project-title, .pf-feature-title { margin: 0 0 10px; }
    .pf-project-tagline, .pf-feature-text, .pf-contact-text, .pf-credential-institution, .pf-endorsement-quote { color: var(--pf-subtext); line-height: 1.6; }
    .pf-credentials-list, .pf-endorsements-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .pf-contact-card { text-align: center; }
    .pf-contact-link { display: inline-flex; margin-top: 12px; padding: 10px 16px; border-radius: 999px; background: var(--pf-accent); color: white; text-decoration: none; }
    @media (max-width: 720px) {
      .pf-nav, .pf-main { width: min(100% - 28px, var(--pf-content-width)); }
      .pf-main { padding-top: 28px; }
      .pf-header, .pf-projects, .pf-feature-grid, .pf-credentials-list, .pf-endorsements-list { grid-template-columns: 1fr; }
      .pf-name { font-size: 46px; }
      .pf-avatar { width: 76px; height: 76px; }
    }
    ${customCss}
  </style>
</head>
<body>
  <div id="pf-root" class="pf-portfolio pf-design-${slug(designSystem.direction || 'custom', 'custom')}">
    <nav class="pf-nav"><span>ProjectFolio</span><span>Browser verified preview</span></nav>
    <main class="pf-main">${orderedSections}</main>
  </div>
  <script>
    window.__pfVerifierErrors = [];
    window.addEventListener('error', function(event) { window.__pfVerifierErrors.push(event.message || 'Runtime error'); });
  </script>
</body>
</html>`;
};

const buildProjectVerificationHtml = ({ user = {}, settings = {}, projects = [] } = {}) => {
  const designSystem = asObject(settings.design_system);
  const tokens = asObject(designSystem.tokens);
  const themeOverrides = asObject(settings.theme_overrides);
  const accent = cssToken(tokens.accent || themeOverrides.accentColor || settings.accent_color, '#2563eb');
  const background = cssToken(tokens.background || themeOverrides.pageBackground, '#ffffff');
  const surface = cssToken(tokens.surface || themeOverrides.cardBackground, '#ffffff');
  const text = cssToken(tokens.text, '#111827');
  const muted = cssToken(tokens.muted, '#64748b');
  const radius = cssToken(tokens.radius || themeOverrides.cardBorderRadius, '18px');
  const shadow = cssToken(tokens.shadow || themeOverrides.cardShadow, '0 20px 60px rgba(15,23,42,.14)');
  const customCss = String(settings.custom_css || '');
  const project = Array.isArray(projects) && projects[0]
    ? projects[0]
    : { title: 'Sample Project', tagline: 'Representative project page for browser verification.', technologies: ['React', 'Node'] };
  const techs = asArray(project.technologies);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ProjectFolio Agent Project Verification</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: ${background}; color: ${text}; }
    #pf-root {
      --pf-accent: ${accent};
      --pf-bg: ${background};
      --pf-card-bg: ${surface};
      --pf-text: ${text};
      --pf-subtext: ${muted};
      --pf-radius: ${radius};
      --pf-shadow: ${shadow};
      min-height: 100vh;
      background: var(--pf-bg);
      color: var(--pf-text);
    }
    .pf-nav, .pf-project-shell { width: min(900px, calc(100vw - 40px)); margin: 0 auto; }
    .pf-nav { display: flex; justify-content: space-between; padding: 18px 0; color: var(--pf-subtext); }
    .pf-project-cover { height: 260px; background: linear-gradient(135deg, var(--pf-accent), transparent); opacity: .65; }
    .pf-project-shell { margin-top: -48px; padding: 34px; background: var(--pf-card-bg); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow); position: relative; }
    .pf-section { margin: 28px 0; }
    .pf-project-title { font-size: clamp(38px, 7vw, 76px); line-height: .96; margin: 0; }
    .pf-project-tagline, .pf-project-block-card, .pf-project-meta { color: var(--pf-subtext); line-height: 1.7; }
    .pf-project-meta { display: flex; flex-wrap: wrap; gap: 12px; padding: 16px 0; border-top: 1px solid color-mix(in srgb, var(--pf-subtext), transparent 78%); border-bottom: 1px solid color-mix(in srgb, var(--pf-subtext), transparent 78%); }
    .pf-tech-tag, .tech-tag { display: inline-flex; border: 1px solid color-mix(in srgb, var(--pf-accent), transparent 70%); border-radius: 999px; padding: 7px 11px; color: var(--pf-accent); margin: 4px; }
    .pf-project-block-card { padding: 22px; border-radius: var(--pf-radius); background: color-mix(in srgb, var(--pf-card-bg), var(--pf-accent) 5%); }
    @media (max-width: 720px) {
      .pf-nav, .pf-project-shell { width: min(100% - 28px, 900px); }
      .pf-project-shell { padding: 22px; margin-top: -30px; }
      .pf-project-cover { height: 180px; }
      .pf-project-title { font-size: 42px; }
    }
    ${customCss}
  </style>
</head>
<body>
  <div id="pf-root" class="pf-portfolio pf-project-page pf-design-${slug(designSystem.direction || 'custom', 'custom')}">
    <nav class="pf-nav"><span>${escapeHtml(user.username || 'preview')}</span><span>Project page check</span></nav>
    <div class="pf-project-cover"></div>
    <main class="pf-project-shell">
      <section class="pf-section pf-project-header">
        <h1 class="pf-project-title">${escapeHtml(project.title || 'Project')}</h1>
        <p class="pf-project-tagline">${escapeHtml(project.tagline || project.description || 'Project detail page preview.')}</p>
      </section>
      <section class="pf-section pf-project-meta">
        <span>${escapeHtml(project.project_type || 'Project')}</span>
        <span>${techs.length} technolog${techs.length === 1 ? 'y' : 'ies'}</span>
      </section>
      <section class="pf-section pf-project-tech">${techs.slice(0, 8).map((tech) => `<span class="pf-tech-tag tech-tag">${escapeHtml(tech)}</span>`).join('')}</section>
      <section class="pf-section pf-project-block-card">
        <h2>Case Study</h2>
        <p>${escapeHtml(project.description || 'This representative project page verifies that the same design layer does not break detail pages.')}</p>
      </section>
    </main>
  </div>
  <script>
    window.__pfVerifierErrors = [];
    window.addEventListener('error', function(event) { window.__pfVerifierErrors.push(event.message || 'Runtime error'); });
  </script>
</body>
</html>`;
};

const mergePreviewState = ({ context = {}, actions = [], customizationPreview = null } = {}) => {
  const user = { ...(context.user || {}) };
  const settings = {
    ...(context.settings || {}),
    section_order: asArray(context.settings?.section_order).length ? asArray(context.settings.section_order) : DEFAULT_SECTION_ORDER,
    site_sections: asArray(context.settings?.site_sections),
    design_system: asObject(context.settings?.design_system),
    interactions: asArray(context.settings?.interactions),
    theme_overrides: asObject(context.settings?.theme_overrides),
    animations: asObject(context.settings?.animations),
  };
  let projects = Array.isArray(context.projects) ? context.projects.map((project) => ({ ...project })) : [];

  actions.forEach((action) => {
    if (action.type === 'profile.patch') Object.assign(user, action.patch || {});
    if (action.type === 'settings.patch') Object.assign(settings, action.patch || {});
    if (action.type === 'project.create' && action.project?.title) {
      projects.push({
        id: action.project.id || `preview-project-${projects.length + 1}`,
        slug: slug(action.project.slug || action.project.title, `project-${projects.length + 1}`),
        ...action.project,
      });
    }
    if (action.type === 'project.patch') {
      projects = projects.map((project) => {
        const matches = (action.projectId && project.id === action.projectId) || (action.slug && project.slug === action.slug);
        return matches ? { ...project, ...(action.patch || {}) } : project;
      });
    }
    if (action.type === 'project.reorder' && Array.isArray(action.order)) {
      const ranks = new Map(action.order.map((item, index) => [item.id, item.sort_order ?? index]));
      projects.sort((a, b) => (ranks.get(a.id) ?? a.sort_order ?? 999) - (ranks.get(b.id) ?? b.sort_order ?? 999));
    }
  });

  if (customizationPreview?.after) {
    settings.custom_css = customizationPreview.after.css || '';
    settings.custom_js = '';
    settings.theme_overrides = customizationPreview.after.themeOverrides || {};
    settings.animations = customizationPreview.after.animations || {};
  }

  settings.section_order = asArray(settings.section_order).length ? asArray(settings.section_order) : DEFAULT_SECTION_ORDER;
  settings.site_sections = asArray(settings.site_sections);
  settings.design_system = asObject(settings.design_system);
  settings.interactions = asArray(settings.interactions);
  settings.theme_overrides = asObject(settings.theme_overrides);
  settings.animations = asObject(settings.animations);

  return { user, settings, projects };
};

const verifyAgentPreview = async (previewState, options = {}) => {
  const startedAt = new Date().toISOString();
  const checks = [];
  const warnings = [];
  const errors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const viewports = options.viewports || [
    { name: 'desktop', width: 1366, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    return {
      status: 'skipped',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: ['Browser verification skipped because Puppeteer is not installed.'],
      errors: [error.message],
    };
  }

  const pages = [
    {
      page: 'portfolio',
      html: buildVerificationHtml(previewState),
      required: ['.pf-portfolio', '.pf-header', '.pf-section', '.pf-projects', '.pf-project-card', '.pf-contact'],
    },
    {
      page: 'project',
      html: buildProjectVerificationHtml(previewState),
      required: ['.pf-portfolio', '.pf-project-page', '.pf-project-header', '.pf-project-title', '.pf-project-meta', '.pf-project-block-card'],
    },
  ];
  let browser = options.browser || null;
  const ownsBrowser = !browser;
  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: options.timeoutMs || 12000,
      });
    }

    for (const pageSpec of pages) {
      for (const viewport of viewports) {
        const page = await browser.newPage();
        const label = `${pageSpec.page}/${viewport.name}`;
        page.on('console', (message) => {
          if (!['error', 'warning'].includes(message.type())) return;
          const issue = classifyConsoleMessage(message.type(), message.text(), label);
          if (issue?.severity === 'error') consoleErrors.push(issue.message);
          if (issue?.severity === 'warning') consoleWarnings.push(issue.message);
        });
        page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        await page.setContent(pageSpec.html, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 12000 });
        await new Promise((resolve) => setTimeout(resolve, 120));

        const result = await page.evaluate((requiredSelectors) => {
        const root = document.getElementById('pf-root');
        const rect = root ? root.getBoundingClientRect() : null;
        return {
          textLength: document.body.innerText.trim().length,
          rootArea: rect ? Math.round(rect.width * rect.height) : 0,
          missingSelectors: requiredSelectors.filter((selector) => !document.querySelector(selector)),
          customSectionCount: document.querySelectorAll('.pf-custom-section').length,
          projectCardCount: document.querySelectorAll('.pf-project-card').length,
          verifierErrors: window.__pfVerifierErrors || [],
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
        }, pageSpec.required);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        const screenshot = analyzeScreenshotBuffer(screenshotBuffer);
        const screenshotPath = await saveScreenshotArtifact({
          screenshotDir: options.screenshotDir,
          buffer: screenshotBuffer,
          mode: 'preapply',
          page: pageSpec.page,
          viewport: viewport.name,
          artifactId: options.artifactId,
        });
        if (screenshotPath) screenshot.path = screenshotPath;

        if (result.textLength < 80) errors.push(`${label}: preview rendered too little text.`);
        if (result.rootArea < viewport.width * 250) errors.push(`${label}: portfolio root appears blank or collapsed.`);
        if (result.missingSelectors.length) errors.push(`${label}: missing ${result.missingSelectors.join(', ')}.`);
        if (result.scrollWidth > result.clientWidth + 8) errors.push(`${label}: horizontal overflow ${result.scrollWidth}px vs ${result.clientWidth}px.`);
        if (!screenshot.likelyNonBlank) errors.push(`${label}: screenshot appears blank.`);
        if (result.verifierErrors.length) errors.push(...result.verifierErrors.map((message) => `${label}: ${message}`));

        checks.push({
          page: pageSpec.page,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          textLength: result.textLength,
          projectCardCount: result.projectCardCount,
          customSectionCount: result.customSectionCount,
          horizontalOverflow: Math.max(0, result.scrollWidth - result.clientWidth),
          screenshot,
          status: errors.some((error) => error.startsWith(`${label}:`)) ? 'failed' : 'passed',
        });

        await page.close();
      }
    }
  } catch (error) {
    errors.push(`Browser verification could not complete: ${error.message}`);
  } finally {
    if (ownsBrowser && browser) await browser.close().catch(() => {});
  }

  const runtimeErrors = consoleErrors.filter(Boolean);
  if (runtimeErrors.length) errors.push(...runtimeErrors.slice(0, 6));
  if (consoleWarnings.length) warnings.push(...consoleWarnings.slice(0, 4));
  if (!previewState.settings?.custom_css && !previewState.settings?.site_sections?.length) {
    warnings.push('Bundle has little visible design surface for the browser verifier to inspect.');
  }

  return {
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    warnings: [...new Set(warnings)].slice(0, 6),
    errors: [...new Set(errors)].slice(0, 10),
  };
};

const normalizeBaseUrl = (value) => String(value || 'http://localhost:3000').replace(/\/+$/, '');

const previewText = (value, maxLength = 240) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const fetchWithTimeout = async (url, timeoutMs = 4000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json,text/plain,*/*' },
    });
    let bodyPreview = '';
    try {
      bodyPreview = previewText(await response.text());
    } catch {
      bodyPreview = '';
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      bodyPreview,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error.name === 'AbortError' ? 'Timed out' : 'Request failed',
      bodyPreview: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const describeHttpResult = (result) => {
  if (!result) return 'no response';
  if (result.status > 0) {
    return `${result.status} ${result.statusText || ''}${result.bodyPreview ? `: ${result.bodyPreview}` : ''}`.trim();
  }
  return `${result.statusText || 'Request failed'}${result.bodyPreview ? `: ${result.bodyPreview}` : ''}`;
};

const preflightLiveRoutes = async ({
  username,
  projectSlug,
  frontendUrl,
  backendUrl = process.env.AGENT_VERIFY_BACKEND || 'http://localhost:5000',
  timeoutMs = 4000,
} = {}) => {
  const startedAt = new Date().toISOString();
  const frontendBase = normalizeBaseUrl(frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000');
  const backendBase = backendUrl ? normalizeBaseUrl(backendUrl) : null;
  const cleanUsername = encodeURIComponent(String(username || '').replace(/^@/, ''));
  const checks = [];
  const warnings = [];
  const errors = [];

  const runCheck = async ({ name, url, required = true, hint }) => {
    const result = await fetchWithTimeout(url, timeoutMs);
    const check = {
      name,
      url,
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      bodyPreview: result.bodyPreview,
    };
    checks.push(check);
    if (!result.ok) {
      const message = `${name} preflight failed at ${url} (${describeHttpResult(result)}).${hint ? ` ${hint}` : ''}`;
      if (required) errors.push(message);
      else warnings.push(message);
    }
    return check;
  };

  await runCheck({
    name: 'Frontend',
    url: frontendBase,
    hint: 'Start the frontend with "npm run dev" in the frontend folder.',
  });

  if (backendBase) {
    await runCheck({
      name: 'Backend health',
      url: `${backendBase}/health`,
      hint: 'Start the backend with "npm run dev" in the backend folder, or pass --backend with the active API URL.',
    });
  }

  if (cleanUsername) {
    await runCheck({
      name: 'Portfolio API',
      url: `${frontendBase}/api/portfolio/${cleanUsername}`,
      hint: 'This usually means the backend is down, the Vite proxy is misconfigured, or the public portfolio does not exist.',
    });
  }

  if (cleanUsername && projectSlug) {
    await runCheck({
      name: 'Project API',
      url: `${frontendBase}/api/portfolio/${cleanUsername}/${encodeURIComponent(String(projectSlug))}`,
      hint: 'Confirm the project slug is published and the backend API is reachable.',
    });
  }

  return {
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
    mode: 'live-route-preflight',
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    warnings,
    errors,
  };
};

const buildLiveRouteTargets = ({ frontendUrl, username, projectSlug, includeDashboard = false, publishedProjectCount = null } = {}) => {
  const baseUrl = normalizeBaseUrl(frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000');
  const cleanUsername = encodeURIComponent(String(username || '').replace(/^@/, ''));
  const targets = [];
  if (includeDashboard) {
    targets.push({
      page: 'dashboard',
      url: `${baseUrl}/dashboard/portfolio-settings`,
      protected: true,
      required: ['textarea', 'select'],
      requiredText: ['AI Editor'],
      requiredPlaceholders: ['Describe the website you want your portfolio to become'],
    });
  }
  if (!cleanUsername) return targets;
  const normalizedPublishedProjectCount = Number.isFinite(Number(publishedProjectCount))
    ? Number(publishedProjectCount)
    : null;
  const portfolioRequired = ['.pf-portfolio', '.pf-header', '.pf-section'];
  if (normalizedPublishedProjectCount !== 0) {
    portfolioRequired.push('.pf-projects', '.pf-project-card');
  }
  targets.push({
      page: 'portfolio',
      url: `${baseUrl}/${cleanUsername}`,
      required: portfolioRequired,
      publishedProjectCount: normalizedPublishedProjectCount,
    });
  if (projectSlug) {
    targets.push({
      page: 'project',
      url: `${baseUrl}/${cleanUsername}/${encodeURIComponent(String(projectSlug))}`,
      required: ['.pf-portfolio', '.pf-project-page', '.pf-project-header', '.pf-project-title', '.pf-project-meta'],
    });
  }
  return targets;
};

const buildPreviewRouteTargets = ({ frontendUrl, username, projectSlug, publishedProjectCount = null } = {}) => (
  buildLiveRouteTargets({ frontendUrl, username, projectSlug, publishedProjectCount })
    .map((target) => ({
      ...target,
      url: `${target.url}${target.url.includes('?') ? '&' : '?'}preview=1`,
    }))
);

const evaluateLivePage = async (page, requiredSelectors, requiredText = [], requiredPlaceholders = []) => page.evaluate((selectors, textSnippets, placeholderSnippets) => {
  const root = document.getElementById('pf-root') || document.querySelector('.pf-portfolio');
  const rect = root ? root.getBoundingClientRect() : null;
  const bodyText = document.body.innerText.trim();
  const placeholders = [...document.querySelectorAll('[placeholder]')].map((node) => node.getAttribute('placeholder') || '');
  return {
    title: document.title,
    url: window.location.href,
    textLength: bodyText.length,
    rootArea: rect ? Math.round(rect.width * rect.height) : 0,
    missingSelectors: selectors.filter((selector) => !document.querySelector(selector)),
    missingText: textSnippets.filter((snippet) => !bodyText.includes(snippet)),
    missingPlaceholders: placeholderSnippets.filter((snippet) => !placeholders.some((placeholder) => placeholder.includes(snippet))),
    projectCardCount: document.querySelectorAll('.pf-project-card').length,
    customSectionCount: document.querySelectorAll('.pf-custom-section').length,
    loadingSpinnerCount: document.querySelectorAll('.animate-spin').length,
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    visibleErrorText: /\b(not found|failed to load|private|could not be loaded|error)\b/i.test(bodyText),
    bodyTextPreview: bodyText.slice(0, 220),
  };
}, requiredSelectors, requiredText, requiredPlaceholders);

const stripPreviewOnlySettings = (settings = {}) => {
  const next = { ...(settings || {}) };
  delete next.custom_css;
  delete next.custom_js;
  delete next.theme_overrides;
  delete next.animations;
  delete next.design_system;
  delete next.interactions;
  return next;
};

const waitForPreviewReady = async (page, timeoutMs = 2500) => page.evaluate((timeout) => new Promise((resolve) => {
  if (window.__pfPreviewReady === true) {
    resolve(true);
    return;
  }
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    window.removeEventListener('message', onMessage);
    resolve(value);
  };
  const onMessage = (event) => {
    if (event.data?.type !== 'pf-preview-ready') return;
    window.__pfPreviewReady = true;
    finish(true);
  };
  window.addEventListener('message', onMessage);
  setTimeout(() => finish(false), timeout);
}), timeoutMs).catch(() => false);

const installPreviewPayload = async (page, previewState, timeoutMs = 4000) => {
  const settings = previewState?.settings || {};
  const requestId = `pf-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {
    type: 'pf-preview',
    requestId,
    css: settings.custom_css || '',
    js: '',
    themeOverrides: asObject(settings.theme_overrides),
    animations: asObject(settings.animations),
    designSystem: asObject(settings.design_system),
    interactions: asArray(settings.interactions),
    settings: stripPreviewOnlySettings(settings),
  };
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const acknowledged = await page.evaluate((message) => new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        resolve(value);
      };
      const onMessage = (event) => {
        if (event.data?.type !== 'pf-preview-applied') return;
        if (event.data.requestId && event.data.requestId !== message.requestId) return;
        finish(true);
      };
      window.addEventListener('message', onMessage);
      window.postMessage(message, '*');
      setTimeout(() => finish(false), 650);
    }), payload);
    if (acknowledged) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
};

const verifyPreviewRoutes = async ({ username, projectSlug, frontendUrl, previewState, auth, publishedProjectCount = null } = {}, options = {}) => {
  const startedAt = new Date().toISOString();
  const targets = buildPreviewRouteTargets({ frontendUrl, username, projectSlug, publishedProjectCount });
  const checks = [];
  const warnings = [];
  const errors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const viewports = options.viewports || [
    { name: 'desktop', width: 1366, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  if (!targets.length) {
    return {
      status: 'skipped',
      mode: 'real-preview-route',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: ['Real preview verification skipped because no public username was available.'],
      errors: [],
    };
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    return {
      status: 'skipped',
      mode: 'real-preview-route',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: ['Real preview verification skipped because Puppeteer is not installed.'],
      errors: [error.message],
    };
  }

  let browser = options.browser || null;
  const ownsBrowser = !browser;
  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: options.timeoutMs || 15000,
      });
    }

    for (const target of targets) {
      for (const viewport of viewports) {
        const label = `${target.page}/${viewport.name}`;
        const page = await browser.newPage();
        const networkIssues = [];
        page.on('console', (message) => {
          if (!['error', 'warning'].includes(message.type())) return;
          const issue = classifyConsoleMessage(message.type(), message.text(), label);
          if (issue?.severity === 'error') consoleErrors.push(issue.message);
          if (issue?.severity === 'warning') consoleWarnings.push(issue.message);
        });
        page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
        page.on('requestfailed', (request) => {
          if (!/\/api\/portfolio\//.test(request.url())) return;
          const failure = request.failure();
          networkIssues.push(`${label}: ${request.url()} failed${failure?.errorText ? `: ${failure.errorText}` : ''}.`);
        });
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        if (auth?.token && auth?.user) {
          await page.evaluateOnNewDocument((token, user) => {
            window.localStorage.setItem('token', token);
            window.localStorage.setItem('user', JSON.stringify(user));
          }, auth.token, auth.user);
        }

        try {
          await page.goto(target.url, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs || 15000,
          });
          await page.waitForSelector('#pf-root, .pf-portfolio', { timeout: 7000 }).catch(() => {});
          await waitForPreviewReady(page, options.previewReadyTimeoutMs || 2500);
          const acknowledged = await installPreviewPayload(page, previewState, options.previewTimeoutMs || 6500);
          if (!acknowledged) errors.push(`${label}: preview payload was not acknowledged by the real React route.`);
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch (error) {
          checks.push({
            page: target.page,
            viewport: viewport.name,
            url: target.url,
            width: viewport.width,
            height: viewport.height,
            status: 'failed',
            message: error.message,
          });
          errors.push(`${label}: real preview route could not be verified: ${error.message}`);
          await page.close();
          continue;
        }

        const result = await evaluateLivePage(page, target.required, target.requiredText || [], target.requiredPlaceholders || []);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        const screenshot = analyzeScreenshotBuffer(screenshotBuffer);
        const screenshotPath = await saveScreenshotArtifact({
          screenshotDir: options.screenshotDir,
          buffer: screenshotBuffer,
          mode: 'real-preview',
          page: target.page,
          viewport: viewport.name,
          artifactId: options.artifactId,
        });
        if (screenshotPath) screenshot.path = screenshotPath;
        if (result.textLength < 80) errors.push(`${label}: real preview rendered too little text.`);
        if (result.rootArea < viewport.width * 250) errors.push(`${label}: real preview appears blank or collapsed.`);
        if (result.missingSelectors.length) errors.push(`${label}: missing ${result.missingSelectors.join(', ')}.`);
        if (!screenshot.likelyNonBlank) errors.push(`${label}: screenshot appears blank.`);
        if (result.horizontalOverflow > 8) errors.push(`${label}: horizontal overflow ${result.horizontalOverflow}px.`);
        if (result.loadingSpinnerCount > 0) errors.push(`${label}: loading spinner still visible after preview.`);
        if (result.visibleErrorText) errors.push(`${label}: page shows public error/private/not-found text.`);
        if (networkIssues.length) errors.push(...networkIssues.slice(0, 4));

        checks.push({
          page: target.page,
          viewport: viewport.name,
          url: target.url,
          width: viewport.width,
          height: viewport.height,
          textLength: result.textLength,
          projectCardCount: result.projectCardCount,
          customSectionCount: result.customSectionCount,
          horizontalOverflow: result.horizontalOverflow,
          bodyTextPreview: result.bodyTextPreview,
          networkIssues: networkIssues.slice(0, 4),
          screenshot,
          status: errors.some((error) => error.startsWith(`${label}:`)) ? 'failed' : 'passed',
        });
        await page.close();
      }
    }
  } catch (error) {
    errors.push(`Real preview verification could not complete: ${error.message}`);
  } finally {
    if (ownsBrowser && browser) await browser.close().catch(() => {});
  }

  if (consoleWarnings.length) warnings.push(...consoleWarnings.slice(0, 6));
  if (consoleErrors.length) errors.push(...consoleErrors.slice(0, 8));

  return {
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
    mode: 'real-preview-route',
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    warnings: [...new Set(warnings)].slice(0, 6),
    errors: [...new Set(errors)].slice(0, 12),
  };
};

const verifyLiveRoutes = async ({ username, projectSlug, frontendUrl, auth, publishedProjectCount = null } = {}, options = {}) => {
  const startedAt = new Date().toISOString();
  const targets = buildLiveRouteTargets({
    frontendUrl,
    username,
    projectSlug,
    includeDashboard: options.includeDashboard === true && Boolean(auth?.token && auth?.user),
    publishedProjectCount,
  });
  const checks = [];
  const warnings = [];
  const errors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const viewports = options.viewports || [
    { name: 'desktop', width: 1366, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  if (!targets.length) {
    return {
      status: 'skipped',
      mode: 'live-route',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: ['Live route verification skipped because no public username was available.'],
      errors: [],
    };
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    return {
      status: 'skipped',
      mode: 'live-route',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: ['Live route verification skipped because Puppeteer is not installed.'],
      errors: [error.message],
    };
  }

  let browser = options.browser || null;
  const ownsBrowser = !browser;
  let navigationFailures = 0;
  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: options.timeoutMs || 15000,
      });
    }

    for (const target of targets) {
      for (const viewport of viewports) {
        const label = `${target.page}/${viewport.name}`;
        const page = await browser.newPage();
        const networkIssues = [];
        page.on('console', (message) => {
          if (!['error', 'warning'].includes(message.type())) return;
          const issue = classifyConsoleMessage(message.type(), message.text(), label);
          if (issue?.severity === 'error') consoleErrors.push(issue.message);
          if (issue?.severity === 'warning') consoleWarnings.push(issue.message);
        });
        page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
        page.on('requestfailed', (request) => {
          if (!/\/api\/portfolio\//.test(request.url())) return;
          const failure = request.failure();
          networkIssues.push(`${label}: ${request.url()} failed${failure?.errorText ? `: ${failure.errorText}` : ''}.`);
        });
        page.on('response', async (response) => {
          if (!/\/api\/portfolio\//.test(response.url()) || response.status() < 400) return;
          let bodyPreview = '';
          try {
            bodyPreview = previewText(await response.text());
          } catch {
            bodyPreview = '';
          }
          networkIssues.push(`${label}: ${response.url()} returned ${response.status()}${bodyPreview ? `: ${bodyPreview}` : ''}.`);
        });
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        if (target.protected && auth?.token && auth?.user) {
          await page.evaluateOnNewDocument((token, user) => {
            window.localStorage.setItem('token', token);
            window.localStorage.setItem('user', JSON.stringify(user));
          }, auth.token, auth.user);
        }

        try {
          await page.goto(target.url, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs || 15000,
          });
          const waitSelector = target.protected ? 'textarea, select' : '#pf-root, .pf-portfolio';
          await page.waitForSelector(waitSelector, { timeout: 7000 }).catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          navigationFailures += 1;
          checks.push({
            page: target.page,
            viewport: viewport.name,
            url: target.url,
            width: viewport.width,
            height: viewport.height,
            status: 'skipped',
            message: error.message,
          });
          await page.close();
          continue;
        }

        const result = await evaluateLivePage(page, target.required, target.requiredText || [], target.requiredPlaceholders || []);
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        const screenshot = analyzeScreenshotBuffer(screenshotBuffer);
        const screenshotPath = await saveScreenshotArtifact({
          screenshotDir: options.screenshotDir,
          buffer: screenshotBuffer,
          mode: 'live',
          page: target.page,
          viewport: viewport.name,
          artifactId: options.artifactId,
        });
        if (screenshotPath) screenshot.path = screenshotPath;
        if (result.textLength < 80) errors.push(`${label}: live route rendered too little text.`);
        if (target.page !== 'dashboard' && result.rootArea < viewport.width * 250) errors.push(`${label}: live route appears blank or collapsed.`);
        if (result.missingSelectors.length) errors.push(`${label}: missing ${result.missingSelectors.join(', ')}.`);
        if (result.missingText.length) errors.push(`${label}: missing expected text ${result.missingText.join(', ')}.`);
        if (result.missingPlaceholders.length) errors.push(`${label}: missing expected placeholder ${result.missingPlaceholders.join(', ')}.`);
        if (!screenshot.likelyNonBlank) errors.push(`${label}: screenshot appears blank.`);
        if (result.horizontalOverflow > 8) errors.push(`${label}: horizontal overflow ${result.horizontalOverflow}px.`);
        if (result.loadingSpinnerCount > 0) errors.push(`${label}: loading spinner still visible after navigation.`);
        if (target.page !== 'dashboard' && result.visibleErrorText) errors.push(`${label}: page shows public error/private/not-found text.`);
        if (networkIssues.length) errors.push(...networkIssues.slice(0, 4));

        checks.push({
          page: target.page,
          viewport: viewport.name,
          url: target.url,
          width: viewport.width,
          height: viewport.height,
          textLength: result.textLength,
          projectCardCount: result.projectCardCount,
          customSectionCount: result.customSectionCount,
          horizontalOverflow: result.horizontalOverflow,
          bodyTextPreview: result.bodyTextPreview,
          networkIssues: networkIssues.slice(0, 4),
          screenshot,
          status: errors.some((error) => error.startsWith(`${label}:`)) ? 'failed' : 'passed',
        });
        await page.close();
      }
    }
  } catch (error) {
    errors.push(`Live route verification could not complete: ${error.message}`);
  } finally {
    if (ownsBrowser && browser) await browser.close().catch(() => {});
  }

  if (navigationFailures === targets.length * viewports.length) {
    return {
      status: 'skipped',
      mode: 'live-route',
      startedAt,
      completedAt: new Date().toISOString(),
      checks,
      warnings: [`Live route verification skipped because ${normalizeBaseUrl(frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000')} was not reachable.`],
      errors: [],
    };
  }

  if (!projectSlug) warnings.push('No published project page was available for live route verification.');
  const skippedChecks = checks.filter((check) => check.status === 'skipped');
  if (skippedChecks.length) {
    warnings.push(`${skippedChecks.length} live route check${skippedChecks.length === 1 ? '' : 's'} skipped before completion.`);
  }
  if (consoleWarnings.length) warnings.push(...consoleWarnings.slice(0, 6));
  if (consoleErrors.length) errors.push(...consoleErrors.slice(0, 8));

  return {
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
    mode: 'live-route',
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    warnings: [...new Set(warnings)].slice(0, 6),
    errors: [...new Set(errors)].slice(0, 12),
  };
};

module.exports = {
  buildLiveRouteTargets,
  buildProjectVerificationHtml,
  buildVerificationHtml,
  classifyConsoleMessage,
  mergePreviewState,
  preflightLiveRoutes,
  verifyAgentPreview,
  verifyPreviewRoutes,
  verifyLiveRoutes,
};
