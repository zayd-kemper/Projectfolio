// backend/routes/settings.js
const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { invalidatePortfolio, invalidatePublicUser } = require('../utils/cache');
const {
  extractMarkedBlocks,
  parseAndMergeAiResponse,
  summarizeCustomizationChanges,
  validateCustomization,
  VALID_THEME_KEYS,
} = require('../utils/aiCustomizer');
const { callAiModel, DEFAULT_MODEL_ID } = require('../utils/aiModels');
const { sanitizeCustomCss } = require('../utils/contentSecurity');
const {
  CUSTOM_SITE_LIMITS,
  normalizeForStorage,
  validateCustomSiteCode,
} = require('../utils/customSiteSecurity');
const {
  combineLayeredCss,
  computeEffectiveDesignSettings,
  mergeManualSettingsSave,
  normalizeAgentDesignMeta,
  parseJsonArray,
  parseJsonObject,
} = require('../utils/layeredCustomization');

const router = express.Router();

const THEMES = {
  clean: { bg: '#ffffff', cardBg: '#ffffff', text: '#111827', subtext: '#6b7280', desc: 'white background, light card borders, dark text' },
  bold: { bg: '#030712', cardBg: '#111827', text: '#ffffff', subtext: '#d1d5db', desc: 'near-black background, dark cards, white text' },
  minimal: { bg: '#f5f5f4', cardBg: '#ffffff', text: '#1c1917', subtext: '#6b7280', desc: 'warm off-white background, no card borders, muted text' },
};

const settingsSchema = {
  theme: s.string({ max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  accent_color: s.hexColor(),
  font_choice: s.string({ max: 100 }),
  show_contact_form: s.boolean(),
  is_public: s.boolean(),
  seo_title: s.string({ max: 120 }),
  seo_description: s.string({ max: 220 }),
  seo_keywords: s.any({ maxBytes: 1000 }),
  custom_domain: s.string({ max: 255 }),
  layout: s.string({ max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  section_order: s.array(s.string({ max: 80 }), { max: 50 }),
  show_skills: s.boolean(),
  show_dates: s.boolean(),
  show_project_type: s.boolean(),
  show_github_stats: s.boolean(),
  section_config: s.object({ maxBytes: 50_000 }),
  custom_css: s.string({ max: 50_000 }),
  custom_js: s.string({ max: 50_000, allowNull: true }),
  manual_custom_css: s.string({ max: 50_000 }),
  agent_custom_css: s.string({ max: 50_000, allowNull: true }),
  manual_design_overrides: s.object({ maxBytes: 50_000 }),
  agent_design_meta: s.object({ maxBytes: 20_000 }),
  theme_overrides: s.object({ maxBytes: 50_000 }),
  animations: s.object({ maxBytes: 50_000 }),
  site_sections: s.array(s.object({ maxBytes: 20_000 }), { max: 80 }),
  design_system: s.object({ maxBytes: 50_000 }),
  interactions: s.array(s.object({ maxBytes: 20_000 }), { max: 120 }),
  preferred_ai_model: s.string({ max: 100 }),
  custom_site_enabled: s.boolean(),
  custom_site_html: s.string({ max: CUSTOM_SITE_LIMITS.html, trim: false }),
  custom_site_css: s.string({ max: CUSTOM_SITE_LIMITS.css, trim: false }),
  custom_site_js: s.string({ max: CUSTOM_SITE_LIMITS.js, trim: false }),
  custom_site_updated_at: s.string({ max: 80 }),
  source: s.string({ max: 40 }),
  changedKeys: s.array(s.string({ max: 80 }), { max: 80 }),
  conflictResolution: s.enum(['preserve-agent', 'override-agent', 'remove-agent-design']),
  id: s.uuid(),
  user_id: s.uuid(),
  created_at: s.string({ max: 40 }),
  updated_at: s.string({ max: 40 }),
};

const avatarSchema = {
  avatar_url: s.url({ required: true, max: 2048 }),
};

const customSiteSchema = {
  custom_site_enabled: s.boolean(),
  custom_site_html: s.string({ max: CUSTOM_SITE_LIMITS.html, trim: false }),
  custom_site_css: s.string({ max: CUSTOM_SITE_LIMITS.css, trim: false }),
  custom_site_js: s.string({ max: CUSTOM_SITE_LIMITS.js, trim: false }),
};

const LAYOUTS = {
  classic: 'centered column, max-width content, 2-column project grid',
  sidebar: 'two-column profile sidebar with projects on the right',
  magazine: 'large featured project followed by smaller cards',
  minimal: 'text-first project list with reduced imagery',
  fullwidth: 'wide banner cards spanning the page',
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM portfolio_settings WHERE user_id = $1', [req.user.id]);
    const settings = result.rows[0] || {};
    res.json({ settings: { ...computeEffectiveDesignSettings(settings), custom_js: null } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get settings.' });
  }
});

router.put('/', requireAuth, validateSchema({ body: settingsSchema }), userQuota('settings.write', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  try {
    if (typeof req.body.custom_js === 'string' && req.body.custom_js.trim()) {
      return res.status(422).json({
        error: 'Custom JavaScript is disabled for public portfolio security.',
        code: 'CUSTOM_JS_DISABLED',
      });
    }

    const existingResult = await query('SELECT * FROM portfolio_settings WHERE user_id = $1', [req.user.id]);
    const existing = existingResult.rows[0] || {};
    const {
      source,
      changedKeys,
      conflictResolution,
      ...incomingSettings
    } = req.body;
    const merge = source === 'agent-system'
      ? { settings: incomingSettings, warnings: [], changedKeys: changedKeys || [] }
      : mergeManualSettingsSave(existing, incomingSettings, changedKeys || [], conflictResolution || 'preserve-agent');
    const next = {
      ...existing,
      ...merge.settings,
      custom_js: null,
    };
    next.agent_design_meta = normalizeAgentDesignMeta(next.agent_design_meta);
    next.custom_css = combineLayeredCss(next.manual_custom_css, next.agent_design_meta.active ? next.agent_custom_css : '');

    const result = await query(
      `INSERT INTO portfolio_settings
         (user_id, theme, accent_color, font_choice, show_contact_form,
          is_public, seo_title, seo_description, seo_keywords, layout, section_order,
          show_skills, show_dates, show_project_type, section_config, custom_css, custom_js,
          theme_overrides, animations, site_sections, design_system, interactions, manual_custom_css,
          agent_custom_css, manual_design_overrides, agent_design_meta, preferred_ai_model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT (user_id) DO UPDATE SET
         theme             = EXCLUDED.theme,
         accent_color      = EXCLUDED.accent_color,
         font_choice       = EXCLUDED.font_choice,
         show_contact_form = EXCLUDED.show_contact_form,
         is_public         = EXCLUDED.is_public,
         seo_title         = EXCLUDED.seo_title,
         seo_description   = EXCLUDED.seo_description,
         seo_keywords      = EXCLUDED.seo_keywords,
         layout            = EXCLUDED.layout,
         section_order     = EXCLUDED.section_order,
         show_skills       = EXCLUDED.show_skills,
         show_dates        = EXCLUDED.show_dates,
         show_project_type = EXCLUDED.show_project_type,
         section_config    = EXCLUDED.section_config,
         custom_css        = EXCLUDED.custom_css,
        custom_js         = NULL,
         theme_overrides   = EXCLUDED.theme_overrides,
         animations        = EXCLUDED.animations,
         site_sections     = EXCLUDED.site_sections,
         design_system     = EXCLUDED.design_system,
         interactions      = EXCLUDED.interactions,
         manual_custom_css = EXCLUDED.manual_custom_css,
         agent_custom_css  = EXCLUDED.agent_custom_css,
         manual_design_overrides = EXCLUDED.manual_design_overrides,
         agent_design_meta = EXCLUDED.agent_design_meta,
         preferred_ai_model = EXCLUDED.preferred_ai_model,
         updated_at        = NOW()
       RETURNING *`,
      [
        req.user.id,
        next.theme || 'clean',
        next.accent_color || '#2563eb',
        next.font_choice || 'inter',
        next.show_contact_form ?? true,
        next.is_public ?? true,
        next.seo_title || null,
        next.seo_description || null,
        Array.isArray(next.seo_keywords) ? next.seo_keywords : [],
        next.layout || 'classic',
        JSON.stringify(parseJsonArray(next.section_order, ['header', 'projects', 'contact'])),
        next.show_skills ?? true,
        next.show_dates ?? true,
        next.show_project_type ?? true,
        JSON.stringify(parseJsonObject(next.section_config, {})),
        sanitizeCustomCss(next.custom_css),
        null,
        JSON.stringify(parseJsonObject(next.theme_overrides, {})),
        JSON.stringify(parseJsonObject(next.animations, {})),
        JSON.stringify(parseJsonArray(next.site_sections, [])),
        JSON.stringify(parseJsonObject(next.design_system, {})),
        JSON.stringify(parseJsonArray(next.interactions, [])),
        sanitizeCustomCss(next.manual_custom_css),
        sanitizeCustomCss(next.agent_custom_css),
        JSON.stringify(parseJsonObject(next.manual_design_overrides, {})),
        JSON.stringify(next.agent_design_meta),
        next.preferred_ai_model || null,
      ]
    );
    await invalidatePublicUser(req.user.username).catch(() => {});
    res.json({
      settings: { ...computeEffectiveDesignSettings(result.rows[0]), custom_js: null },
      message: 'Settings saved!',
      warnings: merge.warnings || [],
      changedKeys: merge.changedKeys || [],
    });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

router.put(
  '/custom-site',
  requireAuth,
  validateSchema({ body: customSiteSchema }),
  userQuota('settings.custom-site.write', {
    windowMs: 60 * 60 * 1000,
    max: 120,
    message: 'Custom-site save limit reached. Please wait and try again.',
  }),
  async (req, res) => {
    try {
      const enabled = req.body.custom_site_enabled === true;
      const validation = validateCustomSiteCode({
        html: req.body.custom_site_html,
        css: req.body.custom_site_css,
        js: req.body.custom_site_js,
      }, { enabled });

      if (!validation.ok) {
        return res.status(422).json({
          error: 'Custom site failed security validation.',
          code: 'CUSTOM_SITE_VALIDATION_FAILED',
          details: validation.errors.slice(0, 20),
          warnings: validation.warnings,
        });
      }

      const code = normalizeForStorage({
        html: req.body.custom_site_html,
        css: req.body.custom_site_css,
        js: req.body.custom_site_js,
      });

      const result = await query(
        `INSERT INTO portfolio_settings
           (user_id, custom_site_enabled, custom_site_html, custom_site_css, custom_site_js, custom_site_updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           custom_site_enabled = EXCLUDED.custom_site_enabled,
           custom_site_html = EXCLUDED.custom_site_html,
           custom_site_css = EXCLUDED.custom_site_css,
           custom_site_js = EXCLUDED.custom_site_js,
           custom_site_updated_at = NOW(),
           updated_at = NOW()
         RETURNING custom_site_enabled, custom_site_html, custom_site_css, custom_site_js, custom_site_updated_at`,
        [req.user.id, enabled, code.html, code.css, code.js]
      );

      await invalidatePortfolio(req.user.username).catch(() => {});

      res.json({
        settings: {
          custom_site_enabled: result.rows[0].custom_site_enabled === true,
          custom_site_html: result.rows[0].custom_site_html || '',
          custom_site_css: result.rows[0].custom_site_css || '',
          custom_site_js: result.rows[0].custom_site_js || '',
          custom_site_updated_at: result.rows[0].custom_site_updated_at,
        },
        warnings: validation.warnings,
        message: enabled ? 'Custom site saved and published.' : 'Custom site draft saved.',
      });
    } catch (error) {
      console.error('Custom site save error:', error);
      res.status(500).json({ error: 'Failed to save custom site.' });
    }
  }
);

router.put('/avatar', requireAuth, validateSchema({ body: avatarSchema }), userQuota('settings.avatar', { windowMs: 60 * 60 * 1000, max: 60 }), async (req, res) => {
  const avatarUrl = String(req.body?.avatar_url || '');
  let valid = false;
  try {
    const hostname = new URL(avatarUrl).hostname.toLowerCase();
    valid = hostname === 'res.cloudinary.com' || hostname.endsWith('.res.cloudinary.com');
  } catch {}
  if (!valid) return res.status(400).json({ error: 'Invalid avatar URL.' });
  await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, req.user.id]);
  res.json({ avatar_url: avatarUrl, message: 'Avatar updated!' });
});

router.get('/portfolio-url', requireAuth, async (req, res) => {
  const result = await query('SELECT username FROM users WHERE id = $1', [req.user.id]);
  const username = result.rows[0].username;
  res.json({
    url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${username}`,
    username,
  });
});

const buildSystemMessage = ({ theme, accent, layout, domSnapshot }) => {
  const t = THEMES[theme] || THEMES.clean;
  return [
    'You are a senior front-end engineer customizing a live React portfolio page.',
    'Return only valid JSON. Do not use markdown fences. Do not include comments in JSON.',
    '',
    'Stable target classes:',
    '- .pf-portfolio: root portfolio element',
    '- .pf-section: each major section wrapper',
    '- .pf-header: profile/header section',
    '- .pf-projects: project grid/list container',
    '- .pf-project-card: each project card link',
    '- .pf-contact: contact section',
    '- .pf-skill-tag and .pf-tech-tag: skill and technology pills',
    '',
    'CSS rules:',
    '- Use .pf-* selectors directly. The app scopes your CSS to #pf-root automatically.',
    '- Do not write #pf-root or !important.',
    '- Do not target body, html, :root, #root, .dashboard-root, script, iframe, or *.',
    '- Avoid changing display, grid-template-*, flex-direction, flex-wrap, overflow, or float on .pf-projects, .pf-section, or .pf-portfolio.',
    '- Define every @keyframes name that you reference.',
    '- Use CSS variables for colors: --pf-accent, --pf-accent-10, --pf-accent-20, --pf-accent-30, --pf-accent-50, --pf-bg, --pf-card-bg, --pf-text, --pf-subtext.',
    '',
    'JavaScript rules:',
    '- Use vanilla JS only. Wrap each effect in an IIFE.',
    '- Do not use DOMContentLoaded, window.onload, or load listeners.',
    '- If you guard with document.getElementById("pf-something"), your code must create that element.',
    '- Use window resize listeners, not document resize listeners.',
    '- Use requestAnimationFrame for visual loops.',
    '',
    `Theme: ${theme || 'clean'} (${t.desc})`,
    `Layout: ${layout || 'classic'} (${LAYOUTS[layout] || LAYOUTS.classic})`,
    `Accent: ${accent}`,
    `Valid theme override keys: ${[...VALID_THEME_KEYS].join(', ')}`,
    '',
    'Canonical response shape:',
    JSON.stringify({
      themeOverridesPatch: {
        cardBackground: 'CSS value or null',
        cardBorderRadius: 'CSS value or null',
        cardShadow: 'CSS value or null',
        cardBorder: 'CSS value or null',
        cardPadding: 'CSS value or null',
        cardTitleColor: 'CSS value or null',
        cardTextColor: 'CSS value or null',
        headerGradient: 'CSS value or null',
        headerTextColor: 'CSS value or null',
        pageBackground: 'CSS value or null',
        accentColor: '#hex or null',
        fontFamily: 'CSS font-family or null',
        projectsGap: 'CSS gap or null',
        skillTagBackground: 'CSS value or null',
        skillTagColor: 'CSS value or null',
        sectionPadding: 'CSS padding or null',
        headerPadding: 'CSS padding or null',
      },
      animationsPatch: {
        cardEntrance: 'fadeUp|slideIn|zoomIn|none|null',
        cardHover: 'lift|glow|scale|tilt|none|null',
        pageBackground: 'particles|gradient-shift|none|null',
      },
      cssBlocks: [{ id: 'stable-kebab-id', css: '.pf-project-card { ... }' }],
      removeBlocks: ['block-id-to-remove'],
      description: 'One sentence.',
    }, null, 2),
    '',
    'Important: return only patches and blocks for the requested change. The backend preserves existing CSS, theme overrides, and animations. Public custom JavaScript is disabled.',
    'For themeOverridesPatch and animationsPatch, include only keys you are changing or clearing. Do not copy placeholder values from the schema.',
    'To update existing generated code, reuse its block id. To remove generated code, put its id in removeBlocks.',
    '',
    domSnapshot
      ? `Live portfolio snapshot:\n${domSnapshot.slice(0, 6000)}`
      : 'Live portfolio snapshot unavailable. Use the stable classes above.',
  ].join('\n');
};

const buildHistorySummary = (oldTurns) => {
  const requests = oldTurns.filter((turn) => turn.role === 'user').map((turn) => turn.content);
  const summaries = oldTurns.filter((turn) => turn.role === 'assistant').map((turn) => {
    try {
      const parsed = JSON.parse(turn.content);
      return parsed.description || turn.content.slice(0, 120);
    } catch {
      return turn.content.slice(0, 120);
    }
  });
  return [
    'Earlier conversation summary:',
    `Requests: ${requests.map((item, index) => `[${index + 1}] ${item.slice(0, 100)}`).join('; ')}`,
    `Built: ${summaries.join('; ')}`,
  ].join('\n');
};

const buildMessages = ({ systemMessage, history, userMessage }) => {
  const messages = [{ role: 'system', content: systemMessage }];
  const safeHistory = Array.isArray(history) ? history.filter((turn) => turn?.role && turn?.content) : [];
  const maxPairs = 6;
  const pairs = Math.floor(safeHistory.length / 2);

  if (pairs > maxPairs) {
    const cutIndex = (pairs - maxPairs) * 2;
    messages.push({ role: 'user', content: buildHistorySummary(safeHistory.slice(0, cutIndex)) });
    messages.push({ role: 'assistant', content: 'Understood. I will continue from the current saved state.' });
    for (const turn of safeHistory.slice(cutIndex)) messages.push({ role: turn.role, content: turn.content });
  } else {
    for (const turn of safeHistory) messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
};

const buildUserMessage = ({
  prompt,
  currentCss,
  currentJs,
  currentThemeOverrides,
  currentAnimations,
  errorFeedback,
}) => {
  const cssBlocks = extractMarkedBlocks(currentCss || '').map((block) => block.id);
  const jsBlocks = extractMarkedBlocks(currentJs || '').map((block) => block.id);

  return [
    'Current saved customization state:',
    `themeOverrides: ${JSON.stringify(currentThemeOverrides || {})}`,
    `animations: ${JSON.stringify(currentAnimations || {})}`,
    `existing CSS block ids: ${cssBlocks.length ? cssBlocks.join(', ') : 'none'}`,
    `existing JS block ids: ${jsBlocks.length ? jsBlocks.join(', ') : 'none'}`,
    '',
    'Current custom CSS, including generated block markers:',
    currentCss?.trim() || '/* none */',
    '',
    'Current custom JS, including generated block markers:',
    currentJs?.trim() || '// none',
    '',
    errorFeedback ? `Previous response errors to fix:\n${errorFeedback}\n` : '',
    `User request: ${prompt}`,
    '',
    'Return only the canonical JSON shape. Use patches and blocks. Do not repeat existing code unless you are updating a block with the same id.',
  ].filter(Boolean).join('\n');
};

router.post('/ai-code', requireAuth, userQuota('settings.ai-code.disabled', { windowMs: 60 * 60 * 1000, max: 30 }), async (req, res) => {
  return res.status(410).json({
    error: 'The legacy AI code generator has been retired. Use the Site Agent so generated CSS and interactions go through validation, preview, and undo tracking.',
    replacement: '/api/agent/chat',
  });

  const {
    prompt,
    current_css = '',
    current_js = '',
    theme,
    accent_color,
    layout,
    dom_snapshot,
    history = [],
    theme_overrides: currentThemeOverridesRaw,
    animations: currentAnimationsRaw,
    model_id,
  } = req.body;

  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required.' });

  const currentThemeOverrides = parseJsonObject(currentThemeOverridesRaw);
  const currentAnimations = parseJsonObject(currentAnimationsRaw);
  const systemMessage = buildSystemMessage({
    theme,
    accent: accent_color || '#2563eb',
    layout,
    domSnapshot: dom_snapshot,
  });

  let parsedResult = null;
  let warnings = [];
  let lastErrors = '';
  const currentState = {
    css: current_css,
    js: current_js,
    themeOverrides: currentThemeOverrides,
    animations: currentAnimations,
  };
  const aiFeedback = {
    status: 'running',
    attempts: [],
    summary: null,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const userMessage = buildUserMessage({
      prompt,
      currentCss: current_css,
      currentJs: current_js,
      currentThemeOverrides,
      currentAnimations,
      errorFeedback: lastErrors,
    });
    const messages = buildMessages({ systemMessage, history, userMessage });

    let raw;
    try {
      const aiResponse = await callAiModel({
        modelId: model_id || DEFAULT_MODEL_ID,
        messages,
        maxTokens: 5000,
        temperature: 0.25,
      });
      raw = aiResponse.content;
    } catch (error) {
      const isRateLimit = error.status === 429;
      aiFeedback.status = isRateLimit ? 'provider_rate_limited' : 'provider_error';
      aiFeedback.attempts.push({
        attempt,
        status: isRateLimit ? 'rate_limited' : 'provider_error',
        message: isRateLimit ? 'The AI provider rate-limited this request.' : 'The AI provider rejected this request.',
      });
      return res.status(isRateLimit ? 429 : 502).json({
        error: isRateLimit
          ? 'AI rate limit reached. Wait about a minute and try again, or use a higher Groq tier for faster repeated prompts.'
          : `AI provider request failed: ${error.message}`,
        aiFeedback,
      });
    }

    try {
      const merged = parseAndMergeAiResponse(raw, currentState);
      const validation = validateCustomization(merged.result);
      const hardErrors = [...merged.errors, ...validation.errors];
      warnings = [...(merged.warnings || []), ...validation.warnings];

      if (hardErrors.length === 0) {
        parsedResult = merged.result;
        aiFeedback.status = attempt === 1 ? 'completed' : 'repaired';
        aiFeedback.attempts.push({
          attempt,
          status: 'passed',
          errors: [],
          warnings,
        });
        break;
      }

      lastErrors = hardErrors.map((error, index) => `${index + 1}. ${error}`).join('\n');
      if (attempt === 3) {
        parsedResult = { ...merged.result, _warnings: [...hardErrors, ...warnings] };
        aiFeedback.status = 'completed_with_warnings';
        aiFeedback.attempts.push({
          attempt,
          status: 'accepted_with_warnings',
          errors: hardErrors,
          warnings,
        });
        break;
      }
      aiFeedback.attempts.push({
        attempt,
        status: 'retrying',
        errors: hardErrors,
        warnings,
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      const truncated = error.code === 'TRUNCATED';
      lastErrors = truncated
        ? 'Your JSON was cut off. Return a shorter patch response.'
        : 'Your response was not valid JSON. Return only the canonical JSON object.';
      if (attempt === 3) {
        aiFeedback.status = 'failed';
        aiFeedback.attempts.push({
          attempt,
          status: truncated ? 'truncated' : 'invalid_json',
          errors: [lastErrors],
          warnings: [],
        });
        return res.status(500).json({
          error: truncated ? 'AI response was too long. Try a smaller request.' : 'AI returned invalid JSON after 3 attempts.',
          aiFeedback,
        });
      }
      aiFeedback.attempts.push({
        attempt,
        status: truncated ? 'retrying_truncated' : 'retrying_invalid_json',
        errors: [lastErrors],
        warnings: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  parsedResult._warnings = parsedResult._warnings || warnings;
  aiFeedback.summary = summarizeCustomizationChanges(currentState, parsedResult);

  res.json({
    result: parsedResult,
    aiFeedback,
    assistantMessage: JSON.stringify({
      themeOverrides: parsedResult.themeOverrides || {},
      animations: parsedResult.animations || {},
      css: parsedResult.css || '',
      js: parsedResult.js || '',
      description: parsedResult.description || '',
      changedBlocks: parsedResult.changedBlocks || {},
    }),
  });
});

router.get('/snapshot/:username', requireAuth, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT id, full_name, username, headline, bio, avatar_url, location,
              website, linkedin_url, github_url, skills
       FROM users
       WHERE username = $1`,
      [req.params.username]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const user = userResult.rows[0];
    const projectsResult = await query(
      `SELECT title, slug, tagline, technologies, project_type, is_featured
       FROM projects
       WHERE user_id = $1 AND status = 'published'
       ORDER BY is_featured DESC, sort_order ASC, created_at DESC
       LIMIT 12`,
      [user.id]
    );
    const settingsResult = await query(
      `SELECT theme, accent_color, layout, section_order, section_config,
              theme_overrides, animations, site_sections, design_system, interactions
       FROM portfolio_settings
       WHERE user_id = $1`,
      [user.id]
    );
    const settings = settingsResult.rows[0] || {};

    const lines = [
      '<div id="pf-root" class="pf-portfolio">',
      '  <section class="pf-section pf-header">',
      `    <h1>${escapeHtml(user.full_name)}</h1>`,
      user.headline ? `    <p class="pf-headline">${escapeHtml(user.headline)}</p>` : '',
      user.bio ? `    <p class="pf-bio">${escapeHtml(user.bio).slice(0, 160)}</p>` : '',
      (user.skills || []).length
        ? `    <div class="pf-skills">${(user.skills || []).slice(0, 8).map((skill) => `<span class="pf-skill-tag">${escapeHtml(skill)}</span>`).join('')}</div>`
        : '',
      '  </section>',
      '  <section class="pf-section">',
      '    <div class="pf-projects">',
      ...projectsResult.rows.map((project) => [
        `      <a class="pf-project-card" href="/${escapeHtml(user.username)}/${escapeHtml(project.slug)}">`,
        `        <h3>${escapeHtml(project.title)}</h3>`,
        project.tagline ? `        <p>${escapeHtml(project.tagline).slice(0, 100)}</p>` : '',
        (project.technologies || []).length
          ? `        <div>${(project.technologies || []).slice(0, 5).map((tech) => `<span class="pf-tech-tag">${escapeHtml(tech)}</span>`).join('')}</div>`
          : '',
        '      </a>',
      ].filter(Boolean).join('\n')),
      '    </div>',
      '  </section>',
      '  <section class="pf-section pf-contact"></section>',
      '</div>',
      '',
      `settings: ${JSON.stringify({
        theme: settings.theme,
        accent_color: settings.accent_color,
        layout: settings.layout,
        section_order: settings.section_order,
        section_config: settings.section_config,
        theme_overrides: settings.theme_overrides,
        animations: settings.animations,
        site_sections: settings.site_sections,
        design_system: settings.design_system,
        interactions: settings.interactions,
      })}`,
    ].filter(Boolean);

    res.json({ snapshot: lines.join('\n') });
  } catch (error) {
    console.error('snapshot error:', error);
    res.status(500).json({ error: 'Snapshot failed.' });
  }
});

module.exports = router;
