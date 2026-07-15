// backend/routes/portfolio.js
// Public-facing routes - no login required
const crypto = require('crypto');
const express = require('express');
const { query } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const { getJson, setJson } = require('../utils/cache');
const { sanitizeBlockContent, sanitizeCustomCss } = require('../utils/contentSecurity');
const {
  buildCustomSiteCsp,
  buildCustomSiteDocument,
  normalizeForStorage,
  validateCustomSiteCode,
} = require('../utils/customSiteSecurity');
const { computeEffectiveDesignSettings } = require('../utils/layeredCustomization');
const { frameAncestorsValue, sandboxRedirectTarget } = require('../config/customSite');

const router = express.Router();

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const pickCustomSiteUser = (user = {}) => ({
  id: user.id,
  full_name: user.full_name,
  username: user.username,
  headline: user.headline,
  bio: user.bio,
  avatar_url: user.avatar_url,
  location: user.location,
  website: user.website,
  linkedin_url: user.linkedin_url,
  github_url: user.github_url,
  resume_url: user.resume_url,
  contact_email: user.contact_email,
  skills: asArray(user.skills),
});

const buildCustomSiteData = ({ user = {}, projects = [], endorsements = [], settings = {} }) => ({
  user: pickCustomSiteUser(user),
  settings: {
    theme: settings.theme || 'clean',
    accent_color: settings.accent_color || '#2563eb',
    layout: settings.layout || 'classic',
  },
  projects: projects.map((project) => ({
    id: project.id,
    title: project.title,
    slug: project.slug,
    tagline: project.tagline,
    description: project.description,
    cover_image_url: project.cover_image_url,
    technologies: asArray(project.technologies),
    project_type: project.project_type,
    is_featured: project.is_featured === true,
    start_date: project.start_date,
    end_date: project.end_date,
    github_url: project.github_url,
    live_url: project.live_url,
    url: `/${user.username}/${project.slug}`,
  })),
  endorsements: endorsements.map((endorsement) => ({
    id: endorsement.id,
    from_name: endorsement.from_name,
    from_role: endorsement.from_role,
    quote: endorsement.quote,
    project_title: endorsement.project_title,
    project_slug: endorsement.project_slug,
  })),
});

const sendCustomSiteDocument = (res, { status = 200, nonce, document, cachePublic = true, frameAncestors } = {}) => {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', buildCustomSiteCsp(nonce, { frameAncestors }));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=()');
  res.setHeader('Cache-Control', cachePublic
    ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    : 'no-store');
  return res.send(document);
};

const buildCustomSiteUnavailableDocument = (message, nonce, frameAncestors) => buildCustomSiteDocument({
  nonce,
  frameAncestors,
  data: {},
  code: {
    html: `
      <main class="pf-custom-site-error">
        <h1>Custom site unavailable</h1>
        <p>${escapeHtml(message)}</p>
      </main>
    `,
    css: `
      body { min-height: 100vh; display: grid; place-items: center; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #111827; }
      .pf-custom-site-error { width: min(520px, calc(100vw - 32px)); border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; padding: 24px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 8px; font-size: 1.25rem; }
      p { margin: 0; color: #4b5563; line-height: 1.6; }
    `,
    js: '',
  },
});

// ── GET PUBLIC PORTFOLIO ──────────────────────────────────────────────────────
// GET /api/portfolio/:username
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const cacheKey = `public:portfolio:${req.params.username}`;
    if (!req.user) {
      const cached = await getJson(cacheKey).catch(() => null);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
        return res.json(cached);
      }
    }
    const userResult = await query(
      `SELECT u.id, u.full_name, u.username, u.headline, u.bio,
              u.avatar_url, u.location, u.website, u.linkedin_url,
              u.github_url, u.skills, u.created_at,
              u.resume_url, u.contact_email, u.phone,
              (to_jsonb(ps)->>'theme') AS theme,
              (to_jsonb(ps)->>'accent_color') AS accent_color,
              (to_jsonb(ps)->>'font_choice') AS font_choice,
              ((to_jsonb(ps)->>'show_contact_form')::boolean) AS show_contact_form,
              (to_jsonb(ps)->>'seo_title') AS seo_title,
              (to_jsonb(ps)->>'seo_description') AS seo_description,
              ((to_jsonb(ps)->>'is_public')::boolean) AS is_public,
              (to_jsonb(ps)->>'layout') AS layout,
              ((to_jsonb(ps)->>'show_skills')::boolean) AS show_skills,
              ((to_jsonb(ps)->>'show_dates')::boolean) AS show_dates,
              ((to_jsonb(ps)->>'show_project_type')::boolean) AS show_project_type,
              (to_jsonb(ps)->'section_config') AS section_config,
              (to_jsonb(ps)->'section_order') AS section_order,
              (to_jsonb(ps)->>'custom_css') AS custom_css,
              (to_jsonb(ps)->'theme_overrides') AS theme_overrides,
              (to_jsonb(ps)->'animations') AS animations,
              (to_jsonb(ps)->'site_sections') AS site_sections,
              (to_jsonb(ps)->'design_system') AS design_system,
              (to_jsonb(ps)->'interactions') AS interactions,
              (to_jsonb(ps)->>'manual_custom_css') AS manual_custom_css,
              (to_jsonb(ps)->>'agent_custom_css') AS agent_custom_css,
              (to_jsonb(ps)->'manual_design_overrides') AS manual_design_overrides,
              (to_jsonb(ps)->'agent_design_meta') AS agent_design_meta,
              ((to_jsonb(ps)->>'custom_site_enabled')::boolean) AS custom_site_enabled,
              (to_jsonb(ps)->>'custom_site_updated_at') AS custom_site_updated_at
       FROM users u
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
       WHERE u.username = $1`,
      [req.params.username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const user = userResult.rows[0];

    if (user.is_public === false && (!req.user || req.user.id !== user.id)) {
      return res.status(403).json({ error: 'This portfolio is private.' });
    }

    // Get published projects — FIX 6: include view_count in select (already present, ensure it's there)
    const projectsResult = await query(
      `SELECT p.id, p.title, p.slug, p.tagline, p.cover_image_url, p.technologies,
              p.project_type, p.is_featured, p.start_date, p.end_date, p.sort_order,
              p.github_url, p.live_url, p.view_count,
              json_agg(DISTINCT jsonb_build_object(
                'id', cu.id,
                'full_name', cu.full_name,
                'username', cu.username,
                'avatar_url', cu.avatar_url
              )) FILTER (WHERE cu.id IS NOT NULL) as collaborators
      FROM projects p
      LEFT JOIN project_collaborators pc ON pc.project_id = p.id AND pc.status = 'accepted'
      LEFT JOIN users cu ON cu.id = pc.user_id
      WHERE p.user_id = $1 AND p.status = 'published'
      GROUP BY p.id
      ORDER BY p.is_featured DESC, p.sort_order ASC, p.created_at DESC LIMIT 200`,
      [user.id]
    );

    // Social counts + viewer follow state
    const [socialResult, viewerFollowResult] = await Promise.all([
      query(
        `SELECT follower_count::int, following_count::int FROM user_stats WHERE user_id = $1`,
        [user.id]
      ),
      req.user && req.user.id !== user.id
        ? query('SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, user.id])
        : Promise.resolve({ rows: [] }),
    ]);
    const endorsementsResult = await query(
      `SELECT e.id, e.from_name, e.from_role, e.quote, e.approved_at,
              p.title as project_title, p.slug as project_slug
       FROM endorsements e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.to_user_id = $1 AND e.is_approved = true
       ORDER BY e.approved_at DESC LIMIT 100`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    const effectiveSettings = computeEffectiveDesignSettings({
      theme: user.theme || 'clean',
      accent_color: user.accent_color || '#2563eb',
      font_choice: user.font_choice || 'inter',
      show_contact_form: user.show_contact_form,
      layout: user.layout || 'classic',
      show_skills: user.show_skills !== false,
      show_dates: user.show_dates !== false,
      show_project_type: user.show_project_type !== false,
      section_config: user.section_config || {},
      section_order: user.section_order || null,
      custom_css: user.custom_css,
      custom_js: null,
      theme_overrides: user.theme_overrides || {},
      animations: user.animations || {},
      site_sections: user.site_sections || [],
      design_system: user.design_system || {},
      interactions: user.interactions || [],
      manual_custom_css: user.manual_custom_css,
        agent_custom_css: user.agent_custom_css,
        manual_design_overrides: user.manual_design_overrides || {},
        agent_design_meta: user.agent_design_meta || {},
        custom_site_enabled: user.custom_site_enabled === true,
        custom_site_updated_at: user.custom_site_updated_at,
      });

    const response = {
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        headline: user.headline,
        bio: user.bio,
        avatar_url: user.avatar_url,
        location: user.location,
        website: user.website,
        linkedin_url: user.linkedin_url,
        github_url: user.github_url,
        skills: user.skills,
        resume_url: user.resume_url,
        contact_email: user.contact_email,
        follower_count:  socialResult.rows[0]?.follower_count  || 0,
        following_count: socialResult.rows[0]?.following_count || 0,
      },
      viewer_following: viewerFollowResult.rows.length > 0,
      settings: {
        ...effectiveSettings,
        custom_css: sanitizeCustomCss(effectiveSettings.custom_css),
        custom_js: null,
        is_public: user.is_public !== false,
        custom_site_enabled: effectiveSettings.custom_site_enabled === true,
        custom_site_updated_at: effectiveSettings.custom_site_updated_at,
      },
      projects: projectsResult.rows,
      endorsements: endorsementsResult.rows,
    };
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    }
    res.json(response);
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Failed to load portfolio.' });
  }
});

router.get('/:username/custom-site', optionalAuth, async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  const frameAncestors = frameAncestorsValue();
  // Executable author code must only run on the dedicated sandbox origin, never on
  // the app's credentialed origin. If a sandbox origin is configured and this
  // request hit a different host, redirect there instead of serving the document.
  const redirectTarget = sandboxRedirectTarget(req.get('host'), req.params.username, req._parsedUrl?.search || '');
  if (redirectTarget) return res.redirect(302, redirectTarget);
  try {
    const userResult = await query(
      `SELECT u.id, u.full_name, u.username, u.headline, u.bio,
              u.avatar_url, u.location, u.website, u.linkedin_url,
              u.github_url, u.skills, u.resume_url, u.contact_email,
              (to_jsonb(ps)->>'theme') AS theme,
              (to_jsonb(ps)->>'accent_color') AS accent_color,
              (to_jsonb(ps)->>'layout') AS layout,
              ((to_jsonb(ps)->>'is_public')::boolean) AS is_public,
              ((to_jsonb(ps)->>'custom_site_enabled')::boolean) AS custom_site_enabled,
              (to_jsonb(ps)->>'custom_site_html') AS custom_site_html,
              (to_jsonb(ps)->>'custom_site_css') AS custom_site_css,
              (to_jsonb(ps)->>'custom_site_js') AS custom_site_js
       FROM users u
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
       WHERE u.username = $1`,
      [req.params.username]
    );

    if (userResult.rows.length === 0) {
      return sendCustomSiteDocument(res, {
        status: 404,
        nonce,
        frameAncestors,
        cachePublic: false,
        document: buildCustomSiteUnavailableDocument('This portfolio could not be found.', nonce, frameAncestors),
      });
    }

    const user = userResult.rows[0];
    if (user.is_public === false) {
      return sendCustomSiteDocument(res, {
        status: 403,
        nonce,
        frameAncestors,
        cachePublic: false,
        document: buildCustomSiteUnavailableDocument('This portfolio is private.', nonce, frameAncestors),
      });
    }

    if (user.custom_site_enabled !== true) {
      return sendCustomSiteDocument(res, {
        status: 404,
        nonce,
        frameAncestors,
        cachePublic: false,
        document: buildCustomSiteUnavailableDocument('This portfolio is using the standard ProjectFolio layout.', nonce, frameAncestors),
      });
    }

    const code = normalizeForStorage({
      html: user.custom_site_html,
      css: user.custom_site_css,
      js: user.custom_site_js,
    });
    const validation = validateCustomSiteCode(code, { enabled: true });
    if (!validation.ok) {
      return sendCustomSiteDocument(res, {
        status: 422,
        nonce,
        frameAncestors,
        cachePublic: false,
        document: buildCustomSiteUnavailableDocument('The custom site did not pass security validation.', nonce, frameAncestors),
      });
    }

    const [projectsResult, endorsementsResult] = await Promise.all([
      query(
        `SELECT id, title, slug, tagline, description, cover_image_url, technologies,
                project_type, is_featured, start_date, end_date, github_url, live_url, sort_order
           FROM projects
          WHERE user_id = $1 AND status = 'published'
          ORDER BY is_featured DESC, sort_order ASC, created_at DESC
          LIMIT 200`,
        [user.id]
      ),
      query(
        `SELECT e.id, e.from_name, e.from_role, e.quote,
                p.title as project_title, p.slug as project_slug
           FROM endorsements e
           LEFT JOIN projects p ON p.id = e.project_id
          WHERE e.to_user_id = $1 AND e.is_approved = true
          ORDER BY e.approved_at DESC
          LIMIT 100`,
        [user.id]
      ).catch(() => ({ rows: [] })),
    ]);

    const document = buildCustomSiteDocument({
      nonce,
      frameAncestors,
      code,
      data: buildCustomSiteData({
        user,
        projects: projectsResult.rows,
        endorsements: endorsementsResult.rows,
        settings: user,
      }),
    });

    return sendCustomSiteDocument(res, { nonce, document, frameAncestors });
  } catch (error) {
    console.error('Custom site render error:', error);
    return sendCustomSiteDocument(res, {
      status: 500,
      nonce,
      frameAncestors,
      cachePublic: false,
      document: buildCustomSiteUnavailableDocument('The custom site could not be loaded.', nonce, frameAncestors),
    });
  }
});

// ── GET PUBLIC PROJECT ────────────────────────────────────────────────────────
// GET /api/portfolio/:username/:projectSlug
router.get('/:username/:projectSlug', optionalAuth, async (req, res) => {
  try {
    const cacheKey = `public:project:${req.params.username}:${req.params.projectSlug}`;
    if (!req.user) {
      const cached = await getJson(cacheKey).catch(() => null);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
        return res.json(cached);
      }
    }
    const userResult = await query(
      `SELECT u.id, u.full_name, u.username,
              (to_jsonb(ps)->>'theme') AS theme,
              (to_jsonb(ps)->>'accent_color') AS accent_color,
              (to_jsonb(ps)->>'custom_css') AS custom_css,
              ((to_jsonb(ps)->>'is_public')::boolean) AS is_public,
              (to_jsonb(ps)->'theme_overrides') AS theme_overrides,
              (to_jsonb(ps)->'animations') AS animations,
              (to_jsonb(ps)->'design_system') AS design_system,
              (to_jsonb(ps)->'interactions') AS interactions,
              (to_jsonb(ps)->>'manual_custom_css') AS manual_custom_css,
              (to_jsonb(ps)->>'agent_custom_css') AS agent_custom_css,
              (to_jsonb(ps)->'manual_design_overrides') AS manual_design_overrides,
              (to_jsonb(ps)->'agent_design_meta') AS agent_design_meta
         FROM users u
         LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
        WHERE u.username = $1`,
      [req.params.username]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Not found.' });

    const owner = userResult.rows[0];
    const userId = owner.id;
    if (owner.is_public === false && (!req.user || req.user.id !== owner.id)) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const projectResult = await query(
      `SELECT * FROM projects WHERE user_id = $1 AND slug = $2 AND status = 'published'`,
      [userId, req.params.projectSlug]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const project = projectResult.rows[0];

    const blocksResult = await query(
      'SELECT * FROM blocks WHERE project_id = $1 ORDER BY sort_order ASC LIMIT 500',
      [project.id]
    );

    const effectiveSettings = computeEffectiveDesignSettings({
      theme: owner.theme || 'clean',
      accent_color: owner.accent_color || '#2563eb',
      custom_css: owner.custom_css,
      custom_js: null,
      theme_overrides: owner.theme_overrides || {},
      animations: owner.animations || {},
      design_system: owner.design_system || {},
      interactions: owner.interactions || [],
      manual_custom_css: owner.manual_custom_css,
      agent_custom_css: owner.agent_custom_css,
      manual_design_overrides: owner.manual_design_overrides || {},
      agent_design_meta: owner.agent_design_meta || {},
    });

    const response = {
      subject_id: userId,
      user: { full_name: owner.full_name, username: owner.username },
      settings: {
        ...effectiveSettings,
        custom_css: sanitizeCustomCss(effectiveSettings.custom_css),
        custom_js: null,
      },
      project,
      blocks: blocksResult.rows.map((block) => ({
        ...block,
        content: sanitizeBlockContent(block.type, block.content || {}),
      })),
    };
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    }
    res.json(response);
  } catch (error) {
    console.error('Get public project error:', error);
    res.status(500).json({ error: 'Failed to load project.' });
  }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
// GET /api/portfolio/:username/data/analytics  (owner only)
// Query params: ?range=24h|7d|30d|365d|all  (default: 30d)
router.get('/:username/data/analytics', optionalAuth, async (req, res, next) => {
  try {
    const owner = await query('SELECT id FROM users WHERE username = $1', [req.params.username]);
    if (!owner.rows[0]) return res.status(404).json({ error: 'Not found.' });
    if (!req.user || req.user.id !== owner.rows[0].id) return res.status(403).json({ error: 'Access denied.' });
    const rangeKey = ['24h', '7d', '30d', '365d', 'all'].includes(req.query.range) ? req.query.range : '30d';
    const daysByRange = { '7d': 7, '30d': 30, '365d': 365 };
    const days = daysByRange[rangeKey] || null;
    const dailySeriesQuery = `
      WITH buckets AS (
        SELECT generate_series((CURRENT_DATE - ($2::int - 1))::timestamp, CURRENT_DATE::timestamp, INTERVAL '1 day')::date AS date
      ),
      rollup AS (
        SELECT day AS date, SUM(views)::bigint AS views
          FROM analytics_daily
         WHERE subject_type = 'portfolio'
           AND subject_id = $1
           AND day >= CURRENT_DATE - ($2::int - 1)
         GROUP BY day
      )
      SELECT buckets.date, COALESCE(rollup.views, 0)::bigint AS views
        FROM buckets
        LEFT JOIN rollup USING (date)
       ORDER BY buckets.date`;
    const seriesQuery = rangeKey === '24h'
      ? query(
        `WITH buckets AS (
           SELECT generate_series(date_trunc('hour', NOW()) - INTERVAL '23 hours', date_trunc('hour', NOW()), '1 hour') AS date
         ),
         rollup AS (
           SELECT date_trunc('hour', created_at) AS date, COUNT(*)::bigint AS views
             FROM analytics_events
            WHERE subject_type = 'portfolio'
              AND subject_id = $1
              AND created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY 1
         )
         SELECT buckets.date, COALESCE(rollup.views, 0)::bigint AS views
           FROM buckets
           LEFT JOIN rollup USING (date)
          ORDER BY buckets.date`,
        [owner.rows[0].id]
      )
      : rangeKey === 'all'
        ? query(
          `SELECT date_trunc('month', day)::date AS date, SUM(views)::bigint AS views
             FROM analytics_daily
            WHERE subject_type = 'portfolio' AND subject_id = $1
            GROUP BY 1
            ORDER BY 1`,
          [owner.rows[0].id]
        )
        : query(dailySeriesQuery, [owner.rows[0].id, days]);
    const dailyRangeFilter = rangeKey === 'all' ? 'TRUE' : 'day >= CURRENT_DATE - ($2::int - 1)';
    const projectsQuery = rangeKey === '24h'
      ? query(
        `SELECT p.title, p.slug, COUNT(a.id)::bigint AS views
           FROM projects p
           LEFT JOIN analytics_events a ON a.project_id = p.id
            AND a.subject_type = 'portfolio'
            AND a.subject_id = $1
            AND a.created_at >= NOW() - INTERVAL '24 hours'
          WHERE p.user_id = $1
          GROUP BY p.id
          ORDER BY views DESC`,
        [owner.rows[0].id]
      )
      : query(
        `SELECT p.title, p.slug, COALESCE(SUM(a.views), 0)::bigint AS views FROM projects p
         LEFT JOIN analytics_daily a ON a.project_id = p.id AND a.subject_type = 'portfolio'
           AND (${rangeKey === 'all' ? 'TRUE' : 'a.day >= CURRENT_DATE - ($2::int - 1)'})
         WHERE p.user_id = $1 GROUP BY p.id ORDER BY views DESC`,
        rangeKey === 'all' ? [owner.rows[0].id] : [owner.rows[0].id, days]
      );
    const sourcesQuery = rangeKey === '24h'
      ? query(
        `SELECT initcap(referrer_source) AS source, COUNT(*)::bigint AS visits
           FROM analytics_events
          WHERE subject_type = 'portfolio'
            AND subject_id = $1
            AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY referrer_source
          ORDER BY visits DESC`,
        [owner.rows[0].id]
      )
      : query(
        `SELECT initcap(referrer_source) AS source, SUM(views)::bigint AS visits FROM analytics_daily
         WHERE subject_type = 'portfolio' AND subject_id = $1 AND (${dailyRangeFilter})
         GROUP BY referrer_source ORDER BY visits DESC`,
        rangeKey === 'all' ? [owner.rows[0].id] : [owner.rows[0].id, days]
      );
    const peakQuery = rangeKey === '24h'
      ? query(
        `SELECT created_at::date AS date, COUNT(*)::bigint AS views
           FROM analytics_events
          WHERE subject_type = 'portfolio'
            AND subject_id = $1
            AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY 1
          ORDER BY views DESC
          LIMIT 1`,
        [owner.rows[0].id]
      )
      : query(
        `SELECT day AS date, SUM(views)::bigint AS views
           FROM analytics_daily
          WHERE subject_type = 'portfolio' AND subject_id = $1 AND (${dailyRangeFilter})
          GROUP BY day
          ORDER BY views DESC
          LIMIT 1`,
        rangeKey === 'all' ? [owner.rows[0].id] : [owner.rows[0].id, days]
      );
    const [summary, series, projects, sources, unique, peak] = await Promise.all([
      query(
        rangeKey === '24h'
          ? `SELECT
               (SELECT COALESCE(SUM(views), 0)::bigint FROM analytics_daily WHERE subject_type = 'portfolio' AND subject_id = $1) AS total_views,
               (SELECT COUNT(*)::bigint FROM analytics_events WHERE subject_type = 'portfolio' AND subject_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') AS range_views,
               (SELECT COUNT(*)::bigint FROM analytics_events WHERE subject_type = 'portfolio' AND subject_id = $1 AND created_at >= NOW() - INTERVAL '48 hours' AND created_at < NOW() - INTERVAL '24 hours') AS prev_views,
               (SELECT COUNT(DISTINCT created_at::date)::int FROM analytics_events WHERE subject_type = 'portfolio' AND subject_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') AS active_days`
          : `SELECT COALESCE(SUM(views), 0)::bigint AS total_views,
               COALESCE(SUM(views) FILTER (WHERE ${dailyRangeFilter}), 0)::bigint AS range_views,
               COALESCE(SUM(views) FILTER (WHERE ${rangeKey === 'all' ? 'FALSE' : 'day >= CURRENT_DATE - (($2::int * 2) - 1) AND day < CURRENT_DATE - ($2::int - 1)'}), 0)::bigint AS prev_views,
               (COUNT(DISTINCT day) FILTER (WHERE ${dailyRangeFilter}))::int AS active_days
             FROM analytics_daily WHERE subject_type = 'portfolio' AND subject_id = $1`,
        rangeKey === '24h' || rangeKey === 'all' ? [owner.rows[0].id] : [owner.rows[0].id, days]
      ),
      seriesQuery,
      projectsQuery,
      sourcesQuery,
      rangeKey === 'all'
        ? query("SELECT COUNT(*)::bigint AS count FROM analytics_subject_visitors WHERE subject_type = 'portfolio' AND subject_id = $1", [owner.rows[0].id])
        : rangeKey === '24h'
          ? query("SELECT COUNT(DISTINCT visitor_hash)::bigint AS count FROM analytics_events WHERE subject_type = 'portfolio' AND subject_id = $1 AND visitor_hash IS NOT NULL AND created_at >= NOW() - INTERVAL '24 hours'", [owner.rows[0].id])
          : query("SELECT COUNT(DISTINCT visitor_hash)::bigint AS count FROM analytics_daily_visitors WHERE subject_type = 'portfolio' AND subject_id = $1 AND day >= CURRENT_DATE - ($2::int - 1)", [owner.rows[0].id, days]),
      peakQuery,
    ]);
    const total = Number(summary.rows[0].total_views);
    const current = Number(summary.rows[0].range_views);
    const previous = rangeKey === 'all' ? null : Number(summary.rows[0].prev_views);
    const activeDays = Number(summary.rows[0].active_days) || 0;
    return res.json({
      total_views: total, range_views: current, prev_range_views: previous,
      trend_pct: previous === null || previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
      unique_visitors: Number(unique.rows[0].count),
      avg_daily_views: activeDays ? Number((current / activeDays).toFixed(1)) : 0,
      peak_day: peak.rows[0] || null, last_30_days: current, project_views: projects.rows,
      views_by_day: series.rows, referrer_breakdown: sources.rows,
    });
  } catch (error) { return next(error); }
});

router.get('/:username/data/analytics-legacy-disabled', optionalAuth, async (req, res) => {
  try {
    const userResult = await query('SELECT id FROM users WHERE username = $1', [req.params.username]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    if (!req.user || req.user.id !== userResult.rows[0].id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const userId = userResult.rows[0].id;

    // ── Range handling ──────────────────────────────────────────────────────
    const RANGES = {
      '24h':  { interval: '24 hours',  bucket: 'hour',  prevInterval: '48 hours',  prevOffset: '24 hours' },
      '7d':   { interval: '7 days',    bucket: 'day',   prevInterval: '14 days',   prevOffset: '7 days'   },
      '30d':  { interval: '30 days',   bucket: 'day',   prevInterval: '60 days',   prevOffset: '30 days'  },
      '365d': { interval: '365 days',  bucket: 'day',   prevInterval: '730 days',  prevOffset: '365 days' },
      'all':  { interval: null,        bucket: 'day',   prevInterval: null,        prevOffset: null       },
    };
    const range = RANGES[req.query.range] || RANGES['30d'];
    const whereClause = range.interval
      ? `AND created_at > NOW() - INTERVAL '${range.interval}'`
      : '';
    const prevWhereClause = range.interval
      ? `AND created_at > NOW() - INTERVAL '${range.prevInterval}' AND created_at <= NOW() - INTERVAL '${range.prevOffset}'`
      : '';

    // ── Core counts ─────────────────────────────────────────────────────────
    const totalViews = await query(
      'SELECT COUNT(*) FROM portfolio_views WHERE user_id = $1',
      [userId]
    );
    const rangeViews = await query(
      `SELECT COUNT(*) FROM portfolio_views WHERE user_id = $1 ${whereClause}`,
      [userId]
    );
    const prevRangeViews = range.interval ? await query(
      `SELECT COUNT(*) FROM portfolio_views WHERE user_id = $1 ${prevWhereClause}`,
      [userId]
    ) : null;
    const uniqueVisitors = await query(
      `SELECT COUNT(DISTINCT viewer_ip) FROM portfolio_views WHERE user_id = $1 AND viewer_ip IS NOT NULL ${whereClause}`,
      [userId]
    );

    // ── Views over time (bucketed) ──────────────────────────────────────────
    const bucket = range.bucket;
    const viewsByPeriod = await query(
      `SELECT DATE_TRUNC('${bucket}', created_at) as date, COUNT(*) as views
       FROM portfolio_views
       WHERE user_id = $1 ${whereClause}
       GROUP BY DATE_TRUNC('${bucket}', created_at)
       ORDER BY date ASC`,
      [userId]
    );

    // ── Peak day ────────────────────────────────────────────────────────────
    const peakDay = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as views
       FROM portfolio_views WHERE user_id = $1 ${whereClause}
       GROUP BY DATE(created_at) ORDER BY views DESC LIMIT 1`,
      [userId]
    );

    // ── Avg daily views ─────────────────────────────────────────────────────
    const avgDaily = await query(
      `SELECT ROUND(COUNT(*) / GREATEST(COUNT(DISTINCT DATE(created_at)), 1), 1) as avg
       FROM portfolio_views WHERE user_id = $1 ${whereClause}`,
      [userId]
    );

    // ── Project views ───────────────────────────────────────────────────────
    const projectViews = await query(
      `SELECT p.title, p.slug, COUNT(pv.id) as views
       FROM projects p
       LEFT JOIN portfolio_views pv ON pv.project_id = p.id ${whereClause.replace('created_at', 'pv.created_at')}
       WHERE p.user_id = $1
       GROUP BY p.id, p.title, p.slug
       ORDER BY views DESC`,
      [userId]
    );

    // ── Referrer breakdown ──────────────────────────────────────────────────
    const referrerBreakdown = await query(
      `SELECT
         CASE
           WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
           WHEN referrer ILIKE '%linkedin%' THEN 'LinkedIn'
           WHEN referrer ILIKE '%github%' THEN 'GitHub'
           WHEN referrer ILIKE '%google%' THEN 'Google'
           WHEN referrer ILIKE '%twitter%' OR referrer ILIKE '%x.com%' THEN 'X / Twitter'
           ELSE 'Other'
         END AS source,
         COUNT(*) as visits
       FROM portfolio_views
       WHERE user_id = $1 ${whereClause}
       GROUP BY source
       ORDER BY visits DESC`,
      [userId]
    );

    // ── Trend: current vs previous period ───────────────────────────────────
    const currentCount = parseInt(rangeViews.rows[0].count);
    const prevCount = prevRangeViews ? parseInt(prevRangeViews.rows[0].count) : null;
    const trend = prevCount !== null
      ? (prevCount === 0 ? null : Math.round(((currentCount - prevCount) / prevCount) * 100))
      : null;

    res.json({
      total_views:        parseInt(totalViews.rows[0].count),
      range_views:        currentCount,
      prev_range_views:   prevCount,
      trend_pct:          trend,
      unique_visitors:    parseInt(uniqueVisitors.rows[0].count),
      avg_daily_views:    parseFloat(avgDaily.rows[0].avg) || 0,
      peak_day:           peakDay.rows[0] || null,
      // keep last_30_days for backward compat
      last_30_days:       currentCount,
      project_views:      projectViews.rows,
      views_by_day:       viewsByPeriod.rows,
      referrer_breakdown: referrerBreakdown.rows,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics.' });
  }
});

module.exports = router;
