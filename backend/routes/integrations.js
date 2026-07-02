// backend/routes/integrations.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { createJob } = require('../jobs/service');
const { safeFetchText } = require('../utils/safeFetch');
const { buildPortfolioAiContext, compactText } = require('../utils/portfolioAiContext');
const { parseAiJson } = require('../utils/aiCustomizer');
const { callAiModel, chooseModelForIntegration } = require('../utils/aiModels');
const logger = require('../utils/logger');
require('dotenv').config();

const router = express.Router();
const OPPORTUNITY_TYPES = ['internship', 'research_fellowship', 'competition', 'grant', 'open_source'];

const outreachSchema = {
  platform_name: s.string({ required: true, min: 1, max: 120 }),
  platform_url: s.url({ max: 2048 }),
  contact_email: s.email({ required: true, max: 254 }),
  contact_name: s.string({ max: 120 }),
  custom_message: s.string({ max: 5000 }),
};

const fetchUrlSchema = {
  url: s.url({ required: true, max: 2048 }),
};

const opportunityFinderSchema = {
  filters: s.shape({
    types: s.array(s.enum(OPPORTUNITY_TYPES), { max: OPPORTUNITY_TYPES.length }),
  }, { maxBytes: 5000 }),
};

const aiMatchSchema = {
  url: s.url({ required: true, max: 2048 }),
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

const safeCssColor = (value, fallback = '#2563eb') => (
  /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? String(value) : fallback
);

const readOpportunityCatalog = () => {
  const seedPath = path.join(__dirname, '../config/opportunities-seed.json');
  return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
};

const clampScore = (value, min = 0, max = 100) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, Math.round(next)));
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const parseModelJson = (raw) => {
  try {
    return parseAiJson(String(raw || ''));
  } catch (error) {
    const err = new Error(error?.code === 'TRUNCATED'
      ? 'AI response was cut off before valid JSON completed.'
      : 'AI returned malformed JSON.');
    err.status = 502;
    err.code = error?.code || 'INVALID_AI_JSON';
    err.cause = error;
    throw err;
  }
};

const modelMeta = (selection, response) => ({
  id: response?.model || selection.model.id,
  name: selection.model.name,
  provider: response?.provider || selection.model.provider,
  provider_model: response?.providerModel || selection.model.providerModel,
  routed: selection.routed,
  profile: selection.profile.id,
});

const selectedOpportunityTypes = (filters = {}) => {
  const requested = asArray(filters.types).filter((type) => OPPORTUNITY_TYPES.includes(type));
  return requested.length ? [...new Set(requested)] : OPPORTUNITY_TYPES;
};

const safeSuggestedOpportunity = (item) => {
  const url = safeHttpUrl(item?.url);
  const type = OPPORTUNITY_TYPES.includes(item?.type) ? item.type : null;
  const name = compactText(item?.name, 180);
  if (!url || !type || !name) return null;
  return {
    name,
    url,
    type,
    org: compactText(item.org, 160) || 'Unknown organization',
    description: compactText(item.description, 600) || null,
    paid: item.paid === true,
    match_score: clampScore(item.match_score ?? 70),
    match_reason: compactText(item.match_reason, 900),
    highlight: compactText(item.highlight, 240),
    evidence: asArray(item.evidence).map((entry) => compactText(entry, 260)).filter(Boolean).slice(0, 4),
    confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low',
    verification_status: 'unverified_external',
  };
};

const hydrateOpportunityMatches = (matches, allOpportunities, filteredIds) => {
  const seedMap = Object.fromEntries(allOpportunities.map((opportunity) => [opportunity.id, opportunity]));
  const used = new Set();
  return asArray(matches)
    .map((match) => {
      const id = String(match?.id || '');
      if (!filteredIds.has(id) || used.has(id) || !seedMap[id]) return null;
      used.add(id);
      return {
        ...seedMap[id],
        match_score: clampScore(match.match_score ?? match.score ?? 0),
        match_reason: compactText(match.match_reason, 1100),
        highlight: compactText(match.highlight, 260),
        evidence: asArray(match.evidence).map((entry) => compactText(entry, 260)).filter(Boolean).slice(0, 5),
        fit_tags: asArray(match.fit_tags).map((entry) => compactText(entry, 80)).filter(Boolean).slice(0, 6),
        application_angle: compactText(match.application_angle, 500) || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 10);
};

const normalizeOpportunityFinderResult = (parsed, allOpportunities, filtered, selection, aiResponse) => {
  const filteredIds = new Set(filtered.map((opportunity) => opportunity.id));
  return {
    summary: compactText(parsed.summary, 1000),
    model_used: modelMeta(selection, aiResponse),
    portfolio_snapshot: parsed.portfolio_snapshot && typeof parsed.portfolio_snapshot === 'object'
      ? {
          strongest_direction: compactText(parsed.portfolio_snapshot.strongest_direction, 300),
          strongest_evidence: asArray(parsed.portfolio_snapshot.strongest_evidence).map((entry) => compactText(entry, 220)).filter(Boolean).slice(0, 5),
        }
      : null,
    top_matches: hydrateOpportunityMatches(parsed.top_matches, allOpportunities, filteredIds),
    additional_suggestions: asArray(parsed.additional_suggestions).map(safeSuggestedOpportunity).filter(Boolean).slice(0, 3),
    profile_gaps: asArray(parsed.profile_gaps).map((gap) => compactText(gap, 420)).filter(Boolean).slice(0, 8),
    next_steps: asArray(parsed.next_steps).map((step) => ({
      action: compactText(step?.action || step, 180),
      detail: compactText(step?.detail, 500),
      priority: ['high', 'medium', 'low'].includes(step?.priority) ? step.priority : 'medium',
    })).filter((step) => step.action).slice(0, 6),
  };
};

const opportunityText = (opportunity = {}) => [
  opportunity.name,
  opportunity.org,
  opportunity.type,
  opportunity.description,
  opportunity.fields,
  opportunity.keywords,
  opportunity.eligibility,
].flat().filter(Boolean).join(' ').toLowerCase();

const portfolioTerms = (portfolio = {}) => {
  const derived = portfolio.derived || portfolio.insights || {};
  const projects = asArray(portfolio.projects);
  const termSources = [
    portfolio.name,
    portfolio.headline,
    portfolio.bio,
    portfolio.location,
    asArray(portfolio.skills),
    asArray(derived.top_technologies).map((item) => item.name || item),
    asArray(derived.project_types).map((item) => item.name || item),
    projects.flatMap((project) => [
      project.title,
      project.tagline,
      project.description,
      project.type,
      asArray(project.technologies),
      project.block_content,
    ]),
  ].flat(3);

  return [...new Set(termSources
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !['and', 'the', 'for', 'with', 'this', 'that', 'from'].includes(term))
  )].slice(0, 80);
};

const buildOpportunityFinderFallbackParsed = (portfolio, filtered, parseError = null) => {
  const terms = portfolioTerms(portfolio);
  const strongestProjects = asArray(portfolio.derived?.strongest_projects || portfolio.insights?.strongest_projects)
    .map((project) => project.title)
    .filter(Boolean)
    .slice(0, 3);
  const scored = filtered.map((opportunity) => {
    const text = opportunityText(opportunity);
    const matched = terms.filter((term) => text.includes(term)).slice(0, 8);
    const fieldMatches = asArray(opportunity.fields).filter((field) => terms.some((term) => String(field).toLowerCase().includes(term))).slice(0, 4);
    const score = clampScore(58 + matched.length * 5 + fieldMatches.length * 4 + (opportunity.paid ? 3 : 0), 45, 92);
    return {
      id: opportunity.id,
      match_score: score,
      match_reason: matched.length
        ? `Matched portfolio evidence around ${matched.slice(0, 5).join(', ')} to this opportunity's focus.`
        : 'Included as a broadly relevant option from the curated catalog because the AI response could not be parsed safely.',
      highlight: matched[0] ? `Strongest keyword alignment: ${matched[0]}.` : 'Curated fallback match.',
      evidence: [
        strongestProjects.length ? `Strongest project evidence: ${strongestProjects.join(', ')}.` : null,
        matched.length ? `Matched terms: ${matched.join(', ')}.` : null,
      ].filter(Boolean),
      fit_tags: [...new Set([...fieldMatches, ...matched])].slice(0, 6),
      application_angle: matched.length
        ? `Lead with the project or profile evidence that demonstrates ${matched.slice(0, 3).join(', ')}.`
        : 'Add clearer project evidence before applying so future matches can be more specific.',
    };
  }).sort((a, b) => b.match_score - a.match_score).slice(0, 10);

  return {
    summary: parseError
      ? 'ProjectFolio used a local fallback ranking because the AI provider returned incomplete JSON. Review these matches as a safe starting point, then rerun for deeper analysis.'
      : 'ProjectFolio ranked curated opportunities from the available portfolio evidence.',
    portfolio_snapshot: {
      strongest_direction: terms.slice(0, 5).join(', ') || 'portfolio evidence needs more detail',
      strongest_evidence: [
        strongestProjects.length ? `Projects: ${strongestProjects.join(', ')}` : null,
        terms.length ? `Profile terms: ${terms.slice(0, 8).join(', ')}` : null,
      ].filter(Boolean),
    },
    top_matches: scored,
    additional_suggestions: [],
    profile_gaps: asArray(portfolio.derived?.profile_gaps || portfolio.insights?.profile_gaps).slice(0, 6),
    next_steps: [
      {
        action: 'Add concrete project evidence',
        detail: 'Stronger descriptions, technologies, outcomes, GitHub links, and demos make opportunity matching more precise.',
        priority: 'high',
      },
      {
        action: 'Rerun the AI analysis',
        detail: 'The safe fallback prevented a failed analysis, but a successful model response can provide deeper fit reasoning.',
        priority: 'medium',
      },
    ],
  };
};

const normalizeAiMatchResult = (parsed, portfolio, selection, aiResponse) => ({
  model_used: modelMeta(selection, aiResponse),
  program_name: compactText(parsed.program_name, 180) || 'Program',
  program_type: ['internship', 'job', 'fellowship', 'research', 'graduate_program', 'other'].includes(parsed.program_type)
    ? parsed.program_type
    : 'other',
  compatibility_score: clampScore(parsed.compatibility_score),
  confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  score_rationale: compactText(parsed.score_rationale, 1000),
  strengths: asArray(parsed.strengths).map((item) => compactText(item, 420)).filter(Boolean).slice(0, 6),
  gaps: asArray(parsed.gaps).map((item) => compactText(item, 460)).filter(Boolean).slice(0, 8),
  project_ratings: asArray(parsed.project_ratings).map((project) => ({
    title: compactText(project?.title, 180),
    relevance_score: clampScore(project?.relevance_score, 0, 10),
    headline: compactText(project?.headline, 240),
    why_relevant: compactText(project?.why_relevant, 800),
    evidence_used: asArray(project?.evidence_used).map((item) => compactText(item, 260)).filter(Boolean).slice(0, 4),
    improvements: asArray(project?.improvements).map((item) => compactText(item, 360)).filter(Boolean).slice(0, 4),
  })).filter((project) => project.title).slice(0, Math.max(8, asArray(portfolio.projects).length)),
  action_items: asArray(parsed.action_items).map((item) => ({
    action: compactText(item?.action, 180),
    detail: compactText(item?.detail, 600),
    priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
  })).filter((item) => item.action).slice(0, 8),
  missing_elements: asArray(parsed.missing_elements).map((item) => compactText(item, 180)).filter(Boolean).slice(0, 12),
  standout_advice: compactText(parsed.standout_advice, 800),
});

// ── API SPEC ──────────────────────────────────────────────────────────────────
// GET /api/integrations/spec
// Returns a machine-readable description of the public portfolio API endpoints
router.get('/spec', (req, res) => {
  const base = process.env.APP_URL || 'http://localhost:5000';

  res.json({
    name: 'ProjectFolio Public API',
    version: '1.0.0',
    base_url: `${base}/api`,
    description: 'Read-only public API for accessing portfolio data. No authentication required.',
    endpoints: [
      {
        method: 'GET',
        path: '/portfolio/{username}',
        description: 'Returns the full public portfolio for a user — profile info, settings, and all published projects.',
        response_example: {
          user: {
            full_name: 'Jane Smith',
            username: 'janesmith',
            headline: 'Mechanical Engineering @ MIT',
            bio: 'Passionate about robotics and aerospace systems.',
            location: 'Cambridge, MA',
            website: 'https://janesmith.dev',
            linkedin_url: 'https://linkedin.com/in/janesmith',
            github_url: 'https://github.com/janesmith',
            skills: ['Python', 'SolidWorks', 'MATLAB', 'ROS'],
          },
          projects: [
            {
              id: 'uuid',
              title: 'Quadcopter for Search and Rescue',
              slug: 'quadcopter-search-rescue',
              tagline: 'Autonomous UAV with onboard CV for target detection',
              cover_image_url: 'https://res.cloudinary.com/...',
              technologies: ['ROS', 'Python', 'OpenCV'],
              project_type: 'Robotics',
              is_featured: true,
              start_date: '2023-09-01',
              end_date: '2024-05-01',
              github_url: 'https://github.com/janesmith/quadcopter',
              live_url: null,
              view_count: 142,
            },
          ],
          settings: {
            theme: 'clean',
            accent_color: '#2563eb',
            layout: 'classic',
            is_public: true,
          },
        },
      },
      {
        method: 'GET',
        path: '/portfolio/{username}/{project-slug}',
        description: 'Returns a single published project with full block content.',
        response_example: {
          project: {
            id: 'uuid',
            title: 'Quadcopter for Search and Rescue',
            slug: 'quadcopter-search-rescue',
            tagline: 'Autonomous UAV with onboard CV for target detection',
            description: 'Full project description...',
            cover_image_url: 'https://res.cloudinary.com/...',
            technologies: ['ROS', 'Python', 'OpenCV'],
            project_type: 'Robotics',
            github_url: 'https://github.com/janesmith/quadcopter',
            live_url: null,
            start_date: '2023-09-01',
            end_date: '2024-05-01',
            view_count: 142,
          },
          blocks: [
            { type: 'heading', content: { text: 'Project Overview', level: 2 }, sort_order: 0 },
            { type: 'text', content: { text: 'This project...' }, sort_order: 1 },
            { type: 'image', content: { url: 'https://...', caption: 'CAD render' }, sort_order: 2 },
          ],
          author: {
            full_name: 'Jane Smith',
            username: 'janesmith',
            avatar_url: 'https://...',
            headline: 'Mechanical Engineering @ MIT',
          },
        },
      },
    ],
  });
});

// ── EMBEDDABLE CARD ───────────────────────────────────────────────────────────
// GET /api/integrations/embed/:username
// Returns a small HTML card that can be iframed into any platform
router.get('/embed/:username', async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.full_name, u.username, u.headline, u.avatar_url, u.skills,
              COUNT(p.id) as project_count,
              ps.accent_color
       FROM users u
       LEFT JOIN projects p ON p.user_id = u.id AND p.status = 'published'
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
       WHERE u.username = $1 AND (ps.is_public = true OR ps.is_public IS NULL)
       GROUP BY u.id, ps.accent_color`,
      [req.params.username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send('<p>Portfolio not found.</p>');
    }

    const u = userResult.rows[0];
    const accent = safeCssColor(u.accent_color);
    const portfolioUrl = safeHttpUrl(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/${u.username}`);
    const avatarUrl = safeHttpUrl(u.avatar_url);
    const initials = escapeHtml(u.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase());
    const skills = (u.skills || []).slice(0, 4).map(escapeHtml).join(' · ');

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: white; }
    .card {
      display: flex; align-items: center; gap: 16px;
      padding: 20px 24px; border: 1px solid #e5e7eb; border-radius: 12px;
      background: white; max-width: 420px;
    }
    .avatar {
      width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
      background: ${accent}22; color: ${accent};
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 18px; overflow: hidden;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 700; font-size: 15px; color: #111827; margin-bottom: 2px; }
    .headline { font-size: 12px; color: #6b7280; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .skills { font-size: 11px; color: #9ca3af; }
    .cta {
      display: inline-block; padding: 8px 16px; border-radius: 8px;
      background: ${accent}; color: white; font-size: 12px; font-weight: 600;
      text-decoration: none; white-space: nowrap; flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="avatar">
      ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : initials}
    </div>
    <div class="info">
      <div class="name">${escapeHtml(u.full_name)}</div>
      <div class="headline">${escapeHtml(u.headline || `@${u.username}`)}</div>
      ${skills ? `<div class="skills">${skills}</div>` : ''}
    </div>
    <a href="${escapeHtml(portfolioUrl)}" target="_blank" rel="noopener noreferrer" class="cta">
      View Portfolio ↗
    </a>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error('Embed error:', error);
    res.status(500).send('<p>Error loading portfolio card.</p>');
  }
});

// ── OUTREACH EMAIL TEMPLATE ───────────────────────────────────────────────────
// GET /api/integrations/outreach/template/:platform
router.get('/outreach/template/:platform', requireAuth, async (req, res) => {
  const userResult = await query(
    'SELECT full_name, username, email FROM users WHERE id = $1',
    [req.user.id]
  );
  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

  const u = userResult.rows[0];
  const portfolioUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${u.username}`;
  const apiUrl = `${process.env.APP_URL || 'http://localhost:5000'}/api/portfolio/${u.username}`;

  const template = {
    subject: `Portfolio Integration Request — ProjectFolio`,
    body: `Hi,

My name is ${u.full_name}, and I'm a user of your platform. I wanted to reach out about a portfolio tool I use called ProjectFolio that I think could add value to your applicant experience.

ProjectFolio is a portfolio platform built for engineering and research students. It provides a clean public URL and a read-only REST API that any platform can use to pull a user's project data directly.

My public portfolio: ${portfolioUrl}
API endpoint for my data: ${apiUrl}

The API returns structured JSON with project titles, descriptions, technologies, media, and links — no authentication required for public portfolios.

I'd love for your platform to support a portfolio URL or API field so applicants like me can share this context more easily. Happy to answer any questions or connect you with more details.

Thank you for your time,
${u.full_name}
${u.email}`,
  };

  res.json({ template });
});

// ── OUTREACH HISTORY ──────────────────────────────────────────────────────────
// GET /api/integrations/outreach/history
router.get('/outreach/history', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM integration_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ requests: result.rows });
  } catch {
    res.json({ requests: [] });
  }
});

// ── SEND OUTREACH EMAIL ───────────────────────────────────────────────────────
// POST /api/integrations/outreach
router.post('/outreach', requireAuth, validateSchema({ body: outreachSchema }), userQuota('integrations.outreach', { windowMs: 24 * 60 * 60 * 1000, max: 20, message: 'Daily outreach limit reached.' }), userCostBudget('integrations.outreach', { windowMs: 24 * 60 * 60 * 1000, maxCost: 40, cost: 2, message: 'Daily outreach usage budget reached.' }), async (req, res, next) => {
  const { platform_name, platform_url, contact_email, contact_name, custom_message } = req.body;
  if (!platform_name || !contact_email) return res.status(400).json({ error: 'Platform name and contact email are required.' });
  try {
    const record = await query(
      `INSERT INTO integration_requests (user_id, platform_name, platform_url, contact_email, contact_name, notes, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', NOW()) RETURNING id`,
      [req.user.id, platform_name, platform_url || null, contact_email, contact_name || null, custom_message || null]
    );
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.json({ message: 'Outreach logged. Copy the email below to send it manually.', email_draft: custom_message });
    }
    const job = await createJob({
      userId: req.user.id,
      type: 'email:send',
      input: { to: contact_email, subject: 'Portfolio Integration Request - ProjectFolio', text: custom_message },
      idempotencyKey: `outreach:${record.rows[0].id}`,
    });
    return res.status(202).json({ message: `Email queued for ${contact_email}.`, job_id: job.id });
  } catch (error) {
    return next(error);
  }
});

router.post('/outreach-legacy-disabled', requireAuth, userQuota('integrations.outreach.legacy-disabled', { windowMs: 60 * 60 * 1000, max: 10 }), async (req, res) => {
  const { platform_name, platform_url, contact_email, contact_name, custom_message } = req.body;

  if (!platform_name || !contact_email) {
    return res.status(400).json({ error: 'Platform name and contact email are required.' });
  }

  // Record the request
  try {
    await query(
      `INSERT INTO integration_requests (user_id, platform_name, platform_url, contact_email, contact_name, notes, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', NOW())`,
      [req.user.id, platform_name, platform_url || null, contact_email, contact_name || null, custom_message || null]
    );
  } catch (err) {
    console.error('Failed to log outreach request:', err);
  }

  // Try to send email if configured
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      });

      const userResult = await query('SELECT full_name, email FROM users WHERE id = $1', [req.user.id]);
      const sender = userResult.rows[0];

      await transporter.sendMail({
        from: `"${sender?.full_name}" <${process.env.EMAIL_USER}>`,
        to: contact_email,
        subject: `Portfolio Integration Request — ProjectFolio`,
        text: custom_message,
      });

      return res.json({ message: `Email sent to ${contact_email}!` });
    } catch (err) {
      console.error('Email send error:', err);
    }
  }

  // Email not configured — return the draft so user can send manually
  res.json({
    message: 'Outreach logged. Copy the email below to send it manually.',
    email_draft: custom_message,
  });
});


// ── URL FETCH PROXY (for AI match — avoids CORS) ─────────────────────────────
// GET /api/integrations/fetch-url?url=...
router.get('/fetch-url', requireAuth, validateSchema({ query: fetchUrlSchema }), userQuota('integrations.fetch-url', { windowMs: 60 * 60 * 1000, max: 60 }), userCostBudget('integrations.fetch-url', { windowMs: 60 * 60 * 1000, maxCost: 120, cost: 2 }), async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required.' });

  try {
    const response = await safeFetchText(url, { maxBytes: 1024 * 1024, timeoutMs: 10000 });
    if (!response.ok) return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` });
    const html = response.text;

    // Strip HTML tags, scripts, styles — extract readable text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // cap at 8k chars

    res.json({ text, url });
  } catch (err) {
    console.error('URL fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch URL. Make sure it is publicly accessible.' });
  }
});


// ── OPPORTUNITY FINDER ────────────────────────────────────────────────────────
// POST /api/integrations/opportunity-finder
const handleOpportunityFinder = async (req, res) => {
  const { portfolio, filters } = req.body;
  if (!portfolio) return res.status(400).json({ error: 'Portfolio data is required.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'AI not configured. Add GROQ_API_KEY to backend .env.' });

  const path = require('path');
  const fs = require('fs');
  const seedPath = path.join(__dirname, '../config/opportunities-seed.json');
  const allOpportunities = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  // Apply type filters if provided
  const typeFilter = filters?.types || [];
  const filtered = typeFilter.length > 0
    ? allOpportunities.filter(o => typeFilter.includes(o.type))
    : allOpportunities;

  const prompt = `You are an expert career advisor for engineering and science students. Your job is to match a student's portfolio to relevant opportunities from a curated list, and optionally suggest a few additional real opportunities not in the list.

STUDENT PORTFOLIO:
Name: ${portfolio.name}
Headline: ${portfolio.headline || 'Not set'}
Bio: ${portfolio.bio || 'Not set'}
Skills: ${(portfolio.skills || []).join(', ') || 'None listed'}
Location: ${portfolio.location || 'Not specified'}

PROJECTS (${(portfolio.projects || []).length} total):
${(portfolio.projects || []).map((p, i) => `PROJECT ${i + 1}: "${p.title}"
Type: ${p.type || 'Unspecified'}
Technologies: ${(p.technologies || []).join(', ') || 'None'}
Tagline: ${p.tagline || 'None'}
Description: ${p.description || 'None'}
Content summary: ${p.block_content || 'No detailed content'}
---`).join('\n')}

OPPORTUNITY CATALOG (${filtered.length} opportunities):
${JSON.stringify(filtered.map(o => ({
  id: o.id,
  name: o.name,
  type: o.type,
  org: o.org,
  description: o.description,
  fields: o.fields,
  keywords: o.keywords,
  paid: o.paid,
})), null, 0)}

TASK:
1. Select the TOP 8-10 opportunities from the catalog that best match this student's profile. Consider their project types, technologies, skills, and what they've built.
2. For each selected opportunity, explain specifically WHY it matches — reference their actual project names and skills.
3. Also suggest up to 3 additional REAL opportunities not in the catalog that fit this student. Only suggest real, verifiable programs with real URLs.
4. Sort all results by match quality (best first).

Reply ONLY with valid JSON, no markdown fences:
{
  "summary": "2-3 sentence overview of this student's opportunity profile — what makes them a strong candidate and for what kinds of programs",
  "top_matches": [
    {
      "id": "opportunity-id-from-catalog",
      "match_score": 92,
      "match_reason": "Specific explanation referencing their actual projects and skills — e.g. 'Your ROS-based quadcopter project maps directly to NASA's robotics track, and your Python + OpenCV skills match their required competencies'",
      "highlight": "One punchy sentence on the single strongest alignment point"
    }
  ],
  "additional_suggestions": [
    {
      "name": "Real opportunity name",
      "url": "https://real-url.org",
      "type": "internship|research_fellowship|competition|grant|open_source",
      "org": "Organization name",
      "description": "Brief description",
      "paid": true,
      "match_reason": "Why this fits this specific student",
      "highlight": "One punchy sentence"
    }
  ],
  "profile_gaps": [
    "Specific gap that is limiting the quality of matches — e.g. 'No civil/structural projects limits eligibility for ASCE competitions' or 'Without a GitHub link, open source programs like GSoC are harder to pursue'"
  ]
}`;

  try {
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Groq error:', err);
      return res.status(500).json({ error: 'AI request failed. Check your GROQ_API_KEY.' });
    }

    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content || '';
    // Robustly extract JSON — handle ```json...```, ```...```, or bare JSON
    let clean = raw.trim();
    const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      clean = fenceMatch[1].trim();
    } else {
      clean = clean.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
    }
    const jsonStart = clean.indexOf('{');
    const jsonEnd   = clean.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) clean = clean.slice(jsonStart, jsonEnd + 1);
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) { console.error('JSON parse failed:', raw); return res.status(500).json({ error: 'AI returned malformed JSON. Try again.' }); }

    // Hydrate top_matches with full opportunity data from seed
    const seedMap = Object.fromEntries(allOpportunities.map(o => [o.id, o]));
    const hydrated = (parsed.top_matches || []).map(match => ({
      ...seedMap[match.id],
      ...match,
    })).filter(m => m.name); // drop any invalid IDs

    res.json({
      result: {
        ...parsed,
        top_matches: hydrated,
      },
    });
  } catch (err) {
    console.error('Opportunity finder error:', err);
    res.status(500).json({ error: 'AI analysis failed: ' + err.message });
  }
};

router.post('/opportunity-finder', requireAuth, validateSchema({ body: opportunityFinderSchema }), userQuota('integrations.opportunity-finder', { windowMs: 60 * 60 * 1000, max: 30 }), userCostBudget('integrations.opportunity-finder', { windowMs: 24 * 60 * 60 * 1000, maxCost: 120, cost: 12, message: 'Daily AI opportunity budget reached.' }), async (req, res) => {
  const job = await createJob({
    userId: req.user.id, type: 'integration:opportunity-finder',
    input: { userId: req.user.id, body: req.body }, idempotencyKey: req.get('Idempotency-Key') || null,
  });
  res.status(202).json({ job_id: job.id, status: job.status });
});


// ── AI PORTFOLIO MATCH ────────────────────────────────────────────────────────
// POST /api/integrations/ai-match
const handleAiMatch = async (req, res) => {
  const { url, portfolio } = req.body;
  if (!url || !portfolio) return res.status(400).json({ error: 'URL and portfolio are required.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'AI not configured. Add GROQ_API_KEY to backend .env.' });

  // 1. Fetch program page (best-effort — continue if blocked)
  let programText = '';
  try {
    const pageRes = await safeFetchText(url, { maxBytes: 1024 * 1024, timeoutMs: 10000 });
    if (pageRes.ok) {
      const html = pageRes.text;
      programText = html
        .replace(/<script[^]*?<\/script>/gi, '')
        .replace(/<style[^]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);
    }
  } catch (e) {
    console.warn('Page fetch failed:', e.message);
    programText = 'Page content could not be retrieved. Analyze based on the URL and domain.';
  }

  // 2. Build prompt
  const firstName = portfolio.first_name || portfolio.name?.split(' ')[0] || 'there';

  const prompt = `You are a brutally honest, deeply knowledgeable career advisor doing a personalized portfolio review. You are speaking DIRECTLY to the applicant — use "you" and "your" throughout, never refer to them in third person. Use their first name (${firstName}) occasionally to keep it personal.

CRITICAL RULES — violating these makes your feedback useless:
- NEVER say generic things like "tailor your portfolio", "add more details", "showcase relevant skills" — meaningless
- Every piece of feedback must reference SPECIFIC project titles, SPECIFIC technologies, or SPECIFIC quoted requirements from the program
- When suggesting additions, say EXACTLY what — e.g. "In your '[Project Name]', add a metrics block showing the specific performance improvement you achieved"
- If a skill gap exists, name the exact skill AND which existing project could be extended to show it
- Quote or closely paraphrase actual language from the program when explaining gaps
- If you can see block content, reference it specifically — say what's there and what's missing

PROGRAM URL: ${url}
PROGRAM PAGE CONTENT:
${programText}

APPLICANT PROFILE:
Name: ${portfolio.name} (address as ${firstName})
Headline: ${portfolio.headline || 'NOT SET — this is a problem'}
Bio: ${portfolio.bio || 'No bio set'}
Skills on profile: ${(portfolio.skills || []).join(', ') || 'None listed'}
GitHub: ${portfolio.github_url || 'Not linked'}
LinkedIn: ${portfolio.linkedin_url || 'Not linked'}

PROJECTS (${(portfolio.projects || []).length} total):
${(portfolio.projects || []).map((p, i) => `PROJECT ${i + 1}: "${p.title}"
Type: ${p.type || 'Unspecified'}
Tagline: ${p.tagline || 'NO TAGLINE SET'}
Description: ${p.description || 'None'}
Technologies: ${(p.technologies || []).join(', ') || 'NONE LISTED'}
Duration: ${p.start_date ? `${p.start_date} to ${p.end_date || 'present'}` : 'NO DATES SET'}
GitHub: ${p.github_url || 'None'} | Demo: ${p.has_live_demo ? 'Yes' : 'No'} | Cover image: ${p.has_cover ? 'Yes' : 'No'}
Featured: ${p.is_featured ? 'Yes' : 'No'} | Views: ${p.view_count || 0}
FULL CONTENT: ${p.block_content || 'EMPTY — project page has no written content, this is a critical issue'}
---`).join('\n')}

Write a deeply personalized analysis. Reference actual content you can see. Flag empty projects as critical issues. Speak directly to ${firstName}.

Reply ONLY with valid JSON, no markdown fences:
{
  "program_name": "Exact program name from the page",
  "program_type": "internship|job|fellowship|research|graduate_program|other",
  "compatibility_score": 72,
  "score_rationale": "2-3 sentences with specific evidence — name projects, quote requirements, reference actual content",
  "strengths": [
    "Specific: e.g. 'Your [Project Name] directly demonstrates [specific program requirement] through [specific tech/method]'",
    "Another specific strength referencing actual project content",
    "Another"
  ],
  "gaps": [
    "Specific: e.g. 'The program requires [quoted requirement] — none of your [N] projects demonstrate this. Your closest is [name] but it only covers [what it does]'",
    "Another specific gap",
    "Another"
  ],
  "project_ratings": [
    {
      "title": "Exact project title",
      "relevance_score": 8,
      "headline": "One sentence on relevance to THIS program",
      "why_relevant": "Reference actual content and map it to program requirements",
      "improvements": [
        "Specific: e.g. 'Your project mentions X but doesn't quantify results — add a metrics block showing [specific metric], which this program explicitly values'",
        "Another specific improvement based on what is actually in the project"
      ]
    }
  ],
  "action_items": [
    {
      "action": "Specific action naming a project or skill",
      "detail": "Exactly what to do and why it matters for THIS program — reference their actual work and the program requirements",
      "priority": "high"
    }
  ],
  "missing_elements": ["Specific skill/experience the program explicitly requires that is completely absent"],
"standout_advice": "The single most impactful thing you could do — concrete, specific, reference their actual work and the program requirements. Speak directly to ${firstName}."
}`;

  // 3. Call Groq from backend (no CORS issue)
  try {
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Groq error:', err);
      return res.status(500).json({ error: 'AI request failed. Check your GROQ_API_KEY.' });
    }

    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content || '';
    // Robustly extract JSON — handle ```json...```, ```...```, or bare JSON
    let clean = raw.trim();
    const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      clean = fenceMatch[1].trim();
    } else {
      clean = clean.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
    }
    const jsonStart = clean.indexOf('{');
    const jsonEnd   = clean.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) clean = clean.slice(jsonStart, jsonEnd + 1);
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) { console.error('JSON parse failed:', raw); return res.status(500).json({ error: 'AI returned malformed JSON. Try again.' }); }
    res.json({ result: parsed });
  } catch (err) {
    console.error('AI match error:', err);
    res.status(500).json({ error: 'AI analysis failed: ' + err.message });
  }
};

const handleOpportunityFinderV2 = async (req, res) => {
  const { filters } = req.body;
  const allOpportunities = readOpportunityCatalog();
  const portfolio = await buildPortfolioAiContext(req.user.id);

  const typeFilter = selectedOpportunityTypes(filters);
  const filtered = allOpportunities.filter((opportunity) => typeFilter.includes(opportunity.type));

  const systemPrompt = [
    'You are a rigorous career advisor for engineering, science, and computing students.',
    'Rank opportunities using only the supplied portfolio evidence and catalog.',
    'Every explanation must cite specific project titles, technologies, profile facts, or portfolio gaps.',
    'Do not invent degrees, citizenship, GPA, employment history, awards, demographics, or availability.',
    'If the portfolio has draft projects, you may mention them as private evidence but do not imply they are public.',
    'For additional_suggestions, include only real well-known programs with real HTTPS URLs. If unsure, return an empty array.',
    'Return only valid JSON.',
  ].join(' ');

  const prompt = `PORTFOLIO_CONTEXT_JSON:
${JSON.stringify(portfolio)}

FILTERED_OPPORTUNITY_CATALOG_JSON:
${JSON.stringify(filtered.map((opportunity) => ({
  id: opportunity.id,
  name: opportunity.name,
  url: opportunity.url,
  type: opportunity.type,
  org: opportunity.org,
  description: opportunity.description,
  fields: opportunity.fields,
  keywords: opportunity.keywords,
  deadline_notes: opportunity.deadline_notes,
  paid: opportunity.paid,
  eligibility: opportunity.eligibility,
})))}

TASK:
Rank the best opportunities for this exact user. Prefer strong evidence over keyword overlap.
Select 6-10 catalog opportunities when enough relevant matches exist. Use only catalog IDs for top_matches.
For each match, explain the concrete portfolio evidence used and give an application angle.

JSON shape:
{
  "summary": "2-3 sentences describing the user's strongest opportunity profile and direction.",
  "portfolio_snapshot": {
    "strongest_direction": "The most credible career/research direction supported by evidence.",
    "strongest_evidence": ["Project or profile evidence supporting that direction"]
  },
  "top_matches": [
    {
      "id": "catalog-id",
      "match_score": 0,
      "match_reason": "Specific fit explanation using project titles, technologies, and profile facts.",
      "highlight": "One concise strongest alignment point.",
      "evidence": ["Specific evidence item 1", "Specific evidence item 2"],
      "fit_tags": ["robotics", "python"],
      "application_angle": "How the user should position themselves for this opportunity."
    }
  ],
  "additional_suggestions": [
    {
      "name": "Real opportunity name",
      "url": "https://real-url.example",
      "type": "internship|research_fellowship|competition|grant|open_source",
      "org": "Organization",
      "description": "Brief factual description.",
      "paid": true,
      "match_score": 0,
      "match_reason": "Specific fit to this user's portfolio.",
      "highlight": "One concise alignment point.",
      "evidence": ["Specific evidence item"],
      "confidence": "high|medium|low"
    }
  ],
  "profile_gaps": ["Specific portfolio gap limiting matches."],
  "next_steps": [
    { "action": "Specific action", "detail": "Why it improves matches.", "priority": "high|medium|low" }
  ]
}`;

  try {
    const selection = chooseModelForIntegration('opportunity-finder');
    const aiResponse = await callAiModel({
      modelId: selection.model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4200,
      temperature: 0.2,
    });
    let parsed;
    try {
      parsed = parseModelJson(aiResponse.content);
    } catch (parseError) {
      logger.warn({ err: parseError }, 'Opportunity finder AI JSON parse failed; using local fallback ranking');
      parsed = buildOpportunityFinderFallbackParsed(portfolio, filtered, parseError);
      aiResponse.fallback = true;
    }
    res.json({ result: normalizeOpportunityFinderResult(parsed, allOpportunities, filtered, selection, aiResponse) });
  } catch (err) {
    logger.error({ err }, 'Opportunity finder analysis failed');
    res.status(err.status && err.status >= 400 ? err.status : 500).json({ error: 'Opportunity analysis failed. Please try again.' });
  }
};

const handleAiMatchV2 = async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required.' });

  const portfolio = await buildPortfolioAiContext(req.user.id);
  let programText = '';
  try {
    const pageRes = await safeFetchText(url, { maxBytes: 1024 * 1024, timeoutMs: 10000 });
    if (pageRes.ok) {
      programText = compactText(pageRes.text, 9000);
    } else {
      programText = `Program page returned HTTP ${pageRes.status}. Analyze from the URL and any visible domain hints.`;
    }
  } catch (error) {
    programText = `Program page could not be retrieved: ${error.message}. Analyze from the URL and clearly lower confidence.`;
  }

  const firstName = portfolio.first_name || 'there';
  const systemPrompt = [
    'You are a rigorous career advisor doing a portfolio-to-opportunity fit analysis.',
    `Speak directly to ${firstName} using "you" and "your".`,
    'Every strength, gap, and action must cite concrete evidence from the provided portfolio or program text.',
    'Do not invent portfolio content or program requirements. If page content is unavailable, say confidence is low.',
    'Distinguish public/published evidence from draft/private evidence.',
    'Avoid generic advice. Name the exact project, skill, block, link, or missing proof to change.',
    'Return only valid JSON.',
  ].join(' ');

  const prompt = `PROGRAM_URL:
${url}

PROGRAM_PAGE_TEXT:
${programText || 'No page text available.'}

PORTFOLIO_CONTEXT_JSON:
${JSON.stringify(portfolio)}

TASK:
Score the user's compatibility for this specific opportunity and create a precise improvement plan.
Use direct language. Quote or closely paraphrase program requirements when available.
Base the score on evidence strength, not just matching words.

JSON shape:
{
  "program_name": "Exact program or role name if available",
  "program_type": "internship|job|fellowship|research|graduate_program|other",
  "compatibility_score": 0,
  "confidence": "high|medium|low",
  "score_rationale": "2-3 sentences with specific program requirements and portfolio evidence.",
  "strengths": ["Specific strength using project/profile evidence."],
  "gaps": ["Specific gap tied to a requirement and current portfolio evidence."],
  "project_ratings": [
    {
      "title": "Exact project title",
      "relevance_score": 0,
      "headline": "One-sentence relevance to this opportunity.",
      "why_relevant": "Evidence-grounded explanation.",
      "evidence_used": ["Specific portfolio evidence used."],
      "improvements": ["Concrete edit to make this project stronger for this opportunity."]
    }
  ],
  "action_items": [
    {
      "action": "Specific action naming a project, profile field, or skill.",
      "detail": "Exactly what to add/change and why it matters for this opportunity.",
      "priority": "high|medium|low"
    }
  ],
  "missing_elements": ["Specific skill, proof, link, credential, or experience absent from the portfolio."],
  "standout_advice": "The single most impactful concrete change."
}`;

  try {
    const selection = chooseModelForIntegration('ai-match');
    const aiResponse = await callAiModel({
      modelId: selection.model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      maxTokens: 3600,
      temperature: 0.2,
    });
    const parsed = parseModelJson(aiResponse.content);
    res.json({ result: normalizeAiMatchResult(parsed, portfolio, selection, aiResponse) });
  } catch (err) {
    logger.error({ err }, 'AI match analysis failed');
    res.status(err.status && err.status >= 400 ? err.status : 500).json({ error: 'AI match analysis failed. Please try again.' });
  }
};

router.post('/ai-match', requireAuth, validateSchema({ body: aiMatchSchema }), userQuota('integrations.ai-match', { windowMs: 60 * 60 * 1000, max: 30 }), userCostBudget('integrations.ai-match', { windowMs: 24 * 60 * 60 * 1000, maxCost: 100, cost: 10, message: 'Daily AI match budget reached.' }), async (req, res) => {
  const job = await createJob({
    userId: req.user.id, type: 'integration:ai-match',
    input: { userId: req.user.id, body: req.body }, idempotencyKey: req.get('Idempotency-Key') || null,
  });
  res.status(202).json({ job_id: job.id, status: job.status });
});

const invokeIntegrationHandler = async (handler, input) => {
  const user = await query('SELECT id, email, username, full_name, avatar_url FROM users WHERE id = $1', [input.userId]);
  if (!user.rows[0]) throw new Error('User no longer exists.');
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(payload?.error || 'Integration job failed.'));
        else resolve(payload);
        return this;
      },
    };
    Promise.resolve(handler({ user: user.rows[0], body: input.body || {}, params: {}, query: {} }, response)).catch(reject);
  });
};

router.runOpportunityFinderJob = (input) => invokeIntegrationHandler(handleOpportunityFinderV2, input);
router.runAiMatchJob = (input) => invokeIntegrationHandler(handleAiMatchV2, input);
router.parseModelJson = parseModelJson;
router.buildOpportunityFinderFallbackParsed = buildOpportunityFinderFallbackParsed;

module.exports = router;
