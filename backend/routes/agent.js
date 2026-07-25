const express = require('express');
const { createVerifierLoginLink } = require('../utils/supabaseAdmin');
const { pool, query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { createJob } = require('../jobs/service');
const { callAiModel, DEFAULT_AGENT_MODE, DEFAULT_MODEL_ID, chooseModelForMode, getAgentModes, getModels, inferAgentModeFromPrompt } = require('../utils/aiModels');
const {
  parseAndMergeAiResponse,
  summarizeCustomizationChanges,
  validateCustomization,
} = require('../utils/aiCustomizer');
const {
  applyAgentActions,
  analyzeAgentClarificationNeed,
  buildCompactAgentContext,
  buildFallbackAgentResponse,
  buildAgentSystemMessage,
  buildAgentUserMessage,
  classifyAgentIntent,
  compileProjectFolioBundle,
  parseAgentResponse,
  critiqueAgentBundle,
  shouldUseProjectFolioCompiler,
  validateAgentActions,
} = require('../utils/siteAgent');
const {
  mergePreviewState,
  verifyAgentPreview,
  verifyPreviewRoutes,
  verifyLiveRoutes,
} = require('../utils/agentBrowserVerifier');
const {
  mergeDesignSystems,
  shouldAllowDesignSystemOverride,
} = require('../utils/siteAgentPlanner');
const { sanitizeCustomCss } = require('../utils/contentSecurity');
const { invalidatePattern } = require('../utils/cache');
const logger = require('../utils/logger');
const {
  DEFAULT_AGENT_DESIGN_META,
  buildAgentDesignMeta,
  clearAgentDesignLayer,
  combineLayeredCss,
  getLayeredCss,
  normalizeAgentDesignMeta,
  parseJsonObject,
} = require('../utils/layeredCustomization');

const router = express.Router();

const serializeModel = (model) => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  description: model.description,
  premium: model.premium,
  enabled: model.enabled,
  capabilities: model.capabilities,
  contextWindow: model.contextWindow,
});

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const invalidatePublicPortfolioCache = async () => {
  await Promise.all([
    invalidatePattern('public:portfolio:*').catch(() => {}),
    invalidatePattern('public:project:*').catch(() => {}),
  ]);
};

const getBrowserArtifactOptions = (artifactId) => {
  const screenshotDir = process.env.AGENT_BROWSER_ARTIFACT_DIR;
  if (!screenshotDir) return {};
  return { screenshotDir, artifactId };
};

const isDevForceApplyAllowed = () => process.env.AGENT_ALLOW_FORCE_APPLY === 'true';

const getAuthoritativeVerification = (preview = {}) => (
  preview.realAppVerification || preview.browserVerification || null
);

const shouldBlockApplyForBrowserVerification = (preview, force = false) => {
  if (force && isDevForceApplyAllowed()) return false;
  const verification = getAuthoritativeVerification(preview);
  return verification?.status !== 'passed';
};

const isProviderSizeError = (error) => {
  const text = String(error?.message || '').toLowerCase();
  return error?.status === 413
    || text.includes('request too large')
    || text.includes('tokens per minute')
    || text.includes('tpm')
    || text.includes('context')
    || text.includes('max_tokens')
    || text.includes('reduce the length')
    || text.includes('please reduce')
    || (text.includes('rate_limit_exceeded') && /\b(token|tpm|context|max)/i.test(text));
};

const isProviderAuthError = (error) => error?.status === 401 || error?.status === 403;
const isProviderTimeoutError = (error) => error?.status === 504 || error?.code === 'PROVIDER_TIMEOUT';

const buildProviderErrorResponse = ({ error, selectedModel, selectedMode, route, compactContext }) => ({
  error: isProviderTimeoutError(error)
    ? 'The AI provider took too long to finish this request. No changes were made. Try a faster mode/model or a smaller prompt.'
    : isProviderSizeError(error)
    ? 'The AI request was too large for the current model limit. ProjectFolio now sends a compact context, but this request still exceeded the provider limit. Try a smaller prompt or wait for the provider limit to reset.'
    : 'The AI provider could not complete this request.',
  providerError: String(error?.message || 'Provider request failed').slice(0, 1200),
  model: selectedModel ? serializeModel(selectedModel) : null,
  mode: selectedMode || null,
  routed: route?.routed || false,
  diagnostics: {
    compactContextBytes: compactContext ? JSON.stringify(compactContext).length : null,
    providerStatus: error?.status || null,
    timeoutMs: error?.timeoutMs || null,
  },
});

const shouldDiscardFailedReviewBundle = () => process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES !== 'true';

const normalizeSectionOrderIds = (sectionOrder = [], siteSections = []) => {
  const customIds = new Set((Array.isArray(siteSections) ? siteSections : [])
    .map((section) => String(section?.id || '').trim())
    .filter(Boolean));
  const nativeIds = new Set(['header', 'projects', 'contact', 'education', 'endorsements']);
  const seen = new Set();
  return (Array.isArray(sectionOrder) ? sectionOrder : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && (nativeIds.has(id) || customIds.has(id)))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

const ensureSectionOrderIncludes = (sectionOrder = [], requiredIds = [], siteSections = []) => {
  const order = normalizeSectionOrderIds(sectionOrder, siteSections);
  const insertBeforeContact = (id) => {
    if (order.includes(id)) return;
    const contactIndex = order.indexOf('contact');
    if (contactIndex >= 0) order.splice(contactIndex, 0, id);
    else order.push(id);
  };

  if (requiredIds.includes('header') && !order.includes('header')) order.unshift('header');
  if (requiredIds.includes('projects')) insertBeforeContact('projects');
  if (requiredIds.includes('contact') && !order.includes('contact')) order.push('contact');

  return normalizeSectionOrderIds(order, siteSections);
};

const normalizeParsedPublicSectionOrder = (parsed, context = {}, intent = null) => {
  if (!parsed?.actions?.length || intent?.id === 'removeOrRevert') return parsed;

  const hasPublishedProjects = Array.isArray(context.projects)
    && context.projects.some((project) => project?.status === 'published');
  const currentOrder = Array.isArray(context.settings?.section_order) && context.settings.section_order.length
    ? context.settings.section_order
    : DEFAULT_SECTION_ORDER;
  const requiredIds = ['header', 'contact'];
  if (hasPublishedProjects) requiredIds.push('projects');
  const nativeOptionalIds = ['education', 'endorsements'];

  let touched = false;
  let settingsFound = false;
  const warnings = [];
  const actions = parsed.actions.map((action) => {
    if (action.type !== 'settings.patch') return action;
    settingsFound = true;
    const patch = { ...(action.patch || {}) };
    const proposedOrder = Array.isArray(patch.section_order) ? patch.section_order : currentOrder;
    const siteSections = Array.isArray(patch.site_sections)
      ? patch.site_sections
      : Array.isArray(context.settings?.site_sections)
        ? context.settings.site_sections
        : [];
    const generatedIds = Array.isArray(patch.site_sections)
      ? patch.site_sections.map((section) => section.id).filter(Boolean)
      : [];
    const preservedOptionalIds = nativeOptionalIds.filter((id) => currentOrder.includes(id) && !proposedOrder.includes(id));
    const baseOrder = Array.isArray(patch.section_order)
      ? [
          ...proposedOrder,
          ...preservedOptionalIds,
        ]
      : proposedOrder;
    const withGeneratedIds = generatedIds.reduce((order, id) => {
      if (order.includes(id)) return order;
      const projectsIndex = order.indexOf('projects');
      const contactIndex = order.indexOf('contact');
      const insertAt = projectsIndex >= 0 ? projectsIndex : contactIndex >= 0 ? contactIndex : order.length;
      const next = [...order];
      next.splice(insertAt, 0, id);
      return next;
    }, baseOrder);
    const normalizedOrder = ensureSectionOrderIncludes(withGeneratedIds, requiredIds, siteSections);
    const shouldSetOrder = Array.isArray(patch.section_order)
      || generatedIds.some((id) => !currentOrder.includes(id))
      || requiredIds.some((id) => !currentOrder.includes(id));

    if (shouldSetOrder && JSON.stringify(normalizedOrder) !== JSON.stringify(patch.section_order || proposedOrder)) {
      patch.section_order = normalizedOrder;
      touched = true;
      if (hasPublishedProjects && !proposedOrder.includes('projects')) {
        warnings.push('Restored the native Projects section so published project cards remain visible.');
      }
      if (!proposedOrder.includes('contact')) {
        warnings.push('Restored the native Contact section so visitors still have a clear next step.');
      }
    }

    return { ...action, patch };
  });

  if (!settingsFound && requiredIds.some((id) => !currentOrder.includes(id))) {
    actions.unshift({
      type: 'settings.patch',
      patch: {
        section_order: ensureSectionOrderIncludes(currentOrder, requiredIds, context.settings?.site_sections || []),
      },
    });
    touched = true;
  }

  if (!touched) return parsed;
  return {
    ...parsed,
    actions,
    warnings: [...new Set([...(parsed.warnings || []), ...warnings])],
  };
};

const maxTokensForAgentMode = (modeId, model = null) => {
  if (model?.provider === 'groq') {
    if (modeId === 'fast') return 1600;
    if (modeId === 'code' || modeId === 'largeUi') return 2400;
    if (modeId === 'midUi') return 2200;
    return 2000;
  }
  if (modeId === 'fast') return 4000;
  if (modeId === 'code' || modeId === 'largeUi') return 12000;
  if (modeId === 'midUi') return 8000;
  return 6000;
};

const compactContextOptionsForModel = (model = {}) => {
  if (model.provider === 'groq') {
    return { maxProjects: 4, maxMemories: 4 };
  }
  return { maxProjects: 8, maxMemories: 8 };
};

const customizationPreviewErrors = (preview = null) => (
  preview?.aiFeedback?.attempts
    ?.flatMap((attempt) => attempt.errors || [])
    ?.filter(Boolean) || []
);

const hasVisibleAgentChange = (actions = [], customizationPreview = null) => {
  const summary = customizationPreview?.aiFeedback?.summary || {};
  if (summary.cssChanged || summary.jsChanged) return true;
  if (summary.themeOverrideKeys?.length || summary.animationKeys?.length) return true;

  return actions.some((action) => {
    if (action.type === 'settings.patch') {
      const patch = action.patch || {};
      return ['theme', 'accent_color', 'layout', 'section_config', 'section_order', 'site_sections', 'design_system', 'interactions']
        .some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    }
    if (action.type === 'profile.patch') return Object.keys(action.patch || {}).length > 0;
    if (action.type.startsWith('project.') || action.type.startsWith('block.')) return true;
    if (action.type === 'customization.patch') {
      const patch = action.patch || {};
      return Boolean(
        (Array.isArray(patch.cssBlocks) && patch.cssBlocks.some((block) => String(block?.css || block?.content || '').trim()))
        || (Array.isArray(patch.removeBlocks) && patch.removeBlocks.length)
      );
    }
    return false;
  });
};

const buildEffectiveChangeErrors = (actions = [], customizationPreview = null) => {
  const errors = customizationPreviewErrors(customizationPreview);
  if (!hasVisibleAgentChange(actions, customizationPreview)) {
    errors.push('The AI bundle did not produce any visible ProjectFolio change. It must touch native settings, sections, interactions, theme overrides, animations, or managed CSS.');
  }
  return [...new Set(errors)];
};

const mergeParsedDesignSystemWithCurrentSettings = (parsed, context, prompt, intent = null) => {
  if (!parsed?.actions?.length) return parsed;
  const allowRedesign = shouldAllowDesignSystemOverride(prompt);
  const actions = parsed.actions.map((action) => {
    if (action.type !== 'settings.patch' || !action.patch?.design_system) return action;
    const designSystem = mergeDesignSystems(context.settings?.design_system, action.patch.design_system, { allowRedesign });
    return {
      ...action,
      patch: {
        ...action.patch,
        design_system: designSystem,
      },
    };
  });
  const designSystemAction = actions.find((action) => action.type === 'settings.patch' && action.patch?.design_system);
  const merged = {
    ...parsed,
    actions,
    designSystem: designSystemAction?.patch?.design_system || parsed.designSystem,
  };
  return normalizeParsedPublicSectionOrder(merged, context, intent || classifyAgentIntent(prompt));
};

const USER_SNAPSHOT_FIELDS = [
  'full_name',
  'username',
  'headline',
  'bio',
  'location',
  'website',
  'linkedin_url',
  'github_url',
  'resume_url',
  'skills',
  'phone',
  'contact_email',
  'identity_mode',
];

const SETTINGS_SNAPSHOT_FIELDS = [
  'theme',
  'accent_color',
  'font_choice',
  'show_contact_form',
  'is_public',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'layout',
  'section_order',
  'show_skills',
  'show_dates',
  'show_project_type',
  'section_config',
  'custom_css',
  'custom_js',
  'theme_overrides',
  'animations',
  'site_sections',
  'design_system',
  'interactions',
  'manual_custom_css',
  'agent_custom_css',
  'manual_design_overrides',
  'agent_design_meta',
  'preferred_ai_model',
];

const DEFAULT_SECTION_ORDER = ['header', 'projects', 'contact'];

const VISUAL_RESET_DEFAULTS = {
  theme: 'clean',
  accent_color: '#2563eb',
  font_choice: 'inter',
  layout: 'classic',
  section_order: DEFAULT_SECTION_ORDER,
  show_skills: true,
  show_dates: true,
  show_project_type: true,
  section_config: {},
  custom_css: null,
  custom_js: null,
  theme_overrides: {},
  animations: {},
  site_sections: [],
  design_system: {},
  interactions: [],
  manual_custom_css: null,
  agent_custom_css: null,
  manual_design_overrides: {},
  agent_design_meta: DEFAULT_AGENT_DESIGN_META,
};

const VISUAL_RESET_FIELDS = Object.keys(VISUAL_RESET_DEFAULTS);

const PROJECT_SNAPSHOT_FIELDS = [
  'id',
  'title',
  'slug',
  'tagline',
  'description',
  'cover_image_url',
  'status',
  'is_featured',
  'project_type',
  'technologies',
  'collaborators',
  'start_date',
  'end_date',
  'github_url',
  'live_url',
  'view_count',
  'sort_order',
  'created_at',
  'updated_at',
];

const BLOCK_SNAPSHOT_FIELDS = ['id', 'project_id', 'type', 'content', 'sort_order', 'created_at', 'updated_at'];

const pickFields = (row = {}, fields = []) => fields.reduce((picked, field) => {
  picked[field] = row[field] ?? null;
  return picked;
}, {});

const loadWebsiteSnapshot = async (client, userId) => {
  const [userResult, settingsResult, projectsResult] = await Promise.all([
    client.query(`SELECT ${USER_SNAPSHOT_FIELDS.join(', ')} FROM users WHERE id = $1`, [userId]),
    client.query(`SELECT ${SETTINGS_SNAPSHOT_FIELDS.join(', ')} FROM portfolio_settings WHERE user_id = $1`, [userId]),
    client.query(`SELECT ${PROJECT_SNAPSHOT_FIELDS.join(', ')} FROM projects WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC`, [userId]),
  ]);

  const projectIds = projectsResult.rows.map((project) => project.id);
  let blocks = [];
  if (projectIds.length) {
    const blockResult = await client.query(
      `SELECT ${BLOCK_SNAPSHOT_FIELDS.join(', ')}
         FROM blocks
        WHERE project_id = ANY($1::uuid[])
        ORDER BY project_id, sort_order ASC, created_at ASC`,
      [projectIds]
    );
    blocks = blockResult.rows.map((block) => pickFields(block, BLOCK_SNAPSHOT_FIELDS));
  }

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    user: pickFields(userResult.rows[0] || {}, USER_SNAPSHOT_FIELDS),
    settings: pickFields(settingsResult.rows[0] || {}, SETTINGS_SNAPSHOT_FIELDS),
    projects: projectsResult.rows.map((project) => pickFields(project, PROJECT_SNAPSHOT_FIELDS)),
    blocks,
  };
};

const savePortfolioRevision = async (client, userId, snapshot, reason) => {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`portfolio-revision:${userId}`]);
  const result = await client.query(
    `INSERT INTO portfolio_revisions (user_id, version, snapshot, reason, expires_at)
     SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, NOW() + INTERVAL '90 days'
     FROM portfolio_revisions WHERE user_id = $1 RETURNING id, version, created_at`,
    [userId, JSON.stringify(snapshot), reason]
  );
  return result.rows[0];
};

const compactRevisionReference = (revision) => ({
  revisionId: revision.id,
  version: Number(revision.version),
  capturedAt: revision.created_at,
});

const resolveSnapshotReference = async (client, userId, reference) => {
  if (!reference?.revisionId) return reference || null;
  const result = await client.query('SELECT snapshot FROM portfolio_revisions WHERE id = $1 AND user_id = $2', [reference.revisionId, userId]);
  return result.rows[0]?.snapshot || null;
};

const restoreWebsiteSnapshot = async (client, userId, snapshot = {}) => {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1) {
    throw new Error('Rollback snapshot is missing or incompatible.');
  }

  const user = snapshot.user || {};
  await client.query(
    `UPDATE users SET
       full_name = $1,
       username = $2,
       headline = $3,
       bio = $4,
       location = $5,
       website = $6,
       linkedin_url = $7,
       github_url = $8,
       resume_url = $9,
       skills = COALESCE($10, '{}')::text[],
       phone = $11,
       contact_email = $12,
       identity_mode = $13,
       updated_at = NOW()
     WHERE id = $14`,
    [
      user.full_name,
      user.username,
      user.headline,
      user.bio,
      user.location,
      user.website,
      user.linkedin_url,
      user.github_url,
      user.resume_url,
      user.skills || [],
      user.phone,
      user.contact_email,
      user.identity_mode,
      userId,
    ]
  );

  const settings = snapshot.settings || {};
  const layered = getLayeredCss(settings);
  const agentMeta = normalizeAgentDesignMeta(settings.agent_design_meta);
  const manualCss = sanitizeCustomCss(settings.manual_custom_css ?? layered.manualCss);
  const agentCss = sanitizeCustomCss(settings.agent_custom_css ?? layered.agentCss);
  const combinedCss = combineLayeredCss(manualCss, agentMeta.active ? agentCss : '');
  await client.query(
    `INSERT INTO portfolio_settings
       (user_id, theme, accent_color, font_choice, show_contact_form, is_public, seo_title, seo_description,
        seo_keywords, layout, section_order, show_skills, show_dates, show_project_type, section_config,
        custom_css, custom_js, theme_overrides, animations, site_sections, design_system, interactions,
        manual_custom_css, agent_custom_css, manual_design_overrides, agent_design_meta, preferred_ai_model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     ON CONFLICT (user_id) DO UPDATE SET
       theme = EXCLUDED.theme,
       accent_color = EXCLUDED.accent_color,
       font_choice = EXCLUDED.font_choice,
       show_contact_form = EXCLUDED.show_contact_form,
       is_public = EXCLUDED.is_public,
       seo_title = EXCLUDED.seo_title,
       seo_description = EXCLUDED.seo_description,
       seo_keywords = EXCLUDED.seo_keywords,
       layout = EXCLUDED.layout,
       section_order = EXCLUDED.section_order,
       show_skills = EXCLUDED.show_skills,
       show_dates = EXCLUDED.show_dates,
       show_project_type = EXCLUDED.show_project_type,
       section_config = EXCLUDED.section_config,
       custom_css = EXCLUDED.custom_css,
       custom_js = NULL,
       theme_overrides = EXCLUDED.theme_overrides,
       animations = EXCLUDED.animations,
       site_sections = EXCLUDED.site_sections,
       design_system = EXCLUDED.design_system,
       interactions = EXCLUDED.interactions,
       manual_custom_css = EXCLUDED.manual_custom_css,
       agent_custom_css = EXCLUDED.agent_custom_css,
       manual_design_overrides = EXCLUDED.manual_design_overrides,
       agent_design_meta = EXCLUDED.agent_design_meta,
       preferred_ai_model = EXCLUDED.preferred_ai_model,
       updated_at = NOW()`,
    [
      userId,
      settings.theme || 'clean',
      settings.accent_color || '#2563eb',
      settings.font_choice || 'inter',
      settings.show_contact_form ?? true,
      settings.is_public ?? true,
      settings.seo_title,
      settings.seo_description,
      settings.seo_keywords || [],
      settings.layout || 'classic',
      JSON.stringify(parseJson(settings.section_order, ['header', 'projects', 'contact'])),
      settings.show_skills ?? true,
      settings.show_dates ?? true,
      settings.show_project_type ?? true,
      JSON.stringify(parseJson(settings.section_config, {})),
      combinedCss,
      null,
      JSON.stringify(parseJson(settings.theme_overrides, {})),
      JSON.stringify(parseJson(settings.animations, {})),
      JSON.stringify(parseJson(settings.site_sections, [])),
      JSON.stringify(parseJson(settings.design_system, {})),
      JSON.stringify(parseJson(settings.interactions, [])),
      manualCss,
      agentCss,
      JSON.stringify(parseJsonObject(settings.manual_design_overrides, {})),
      JSON.stringify(agentMeta),
      settings.preferred_ai_model,
    ]
  );

  await client.query(
    `DELETE FROM blocks
      WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1)`,
    [userId]
  );
  await client.query('DELETE FROM projects WHERE user_id = $1', [userId]);

  for (const project of snapshot.projects || []) {
    await client.query(
      `INSERT INTO projects
         (id, user_id, title, slug, tagline, description, cover_image_url, status, is_featured, project_type,
          technologies, collaborators, start_date, end_date, github_url, live_url, view_count, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12::text[],$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        project.id,
        userId,
        project.title,
        project.slug,
        project.tagline,
        project.description,
        project.cover_image_url,
        project.status || 'draft',
        project.is_featured === true,
        project.project_type,
        project.technologies || [],
        project.collaborators || [],
        project.start_date,
        project.end_date,
        project.github_url,
        project.live_url,
        project.view_count || 0,
        project.sort_order || 0,
        project.created_at,
        project.updated_at,
      ]
    );
  }

  for (const block of snapshot.blocks || []) {
    await client.query(
      `INSERT INTO blocks (id, project_id, type, content, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        block.id,
        block.project_id,
        block.type || 'text',
        JSON.stringify(parseJson(block.content, {})),
        block.sort_order || 0,
        block.created_at,
        block.updated_at,
      ]
    );
  }
};

const normalizeSnapshotPreview = (preview) => parseJson(preview, {});

const getRollbackSnapshotFromChangeSet = (changeSet = {}) => (
  normalizeSnapshotPreview(changeSet.preview).rollbackSnapshot || null
);

const findEarliestRollbackSnapshot = (changeSets = []) => {
  const sorted = [...changeSets].sort((a, b) => new Date(a.applied_at || a.created_at || 0) - new Date(b.applied_at || b.created_at || 0));
  for (const changeSet of sorted) {
    const snapshot = getRollbackSnapshotFromChangeSet(changeSet);
    if (snapshot?.version === 1) return { changeSet, snapshot };
  }
  return { changeSet: null, snapshot: null };
};

const buildVisualResetSettings = (current = {}, snapshot = null) => {
  const snapshotSettings = snapshot?.settings || {};
  const next = { ...current };
  VISUAL_RESET_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(snapshotSettings, field)) {
      next[field] = snapshotSettings[field];
    } else {
      next[field] = VISUAL_RESET_DEFAULTS[field];
    }
  });
  next.preferred_ai_model = current.preferred_ai_model || snapshotSettings.preferred_ai_model || null;
  return next;
};

const normalizeComparable = (value) => {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value));
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const valuesEqual = (a, b) => JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b));

const uniq = (items = []) => [...new Set(items.filter(Boolean))];

const extractCodeBlockIdsFromPatch = (actions = [], key) => uniq(actions
  .filter((action) => action.type === 'customization.patch')
  .flatMap((action) => Array.isArray(action.patch?.[key]) ? action.patch[key] : [])
  .map((block) => typeof block === 'string' ? block : block?.id)
  .filter(Boolean));

const extractRemoveBlockIdsFromPatch = (actions = []) => uniq(actions
  .filter((action) => action.type === 'customization.patch')
  .flatMap((action) => Array.isArray(action.patch?.removeBlocks) ? action.patch.removeBlocks : [])
  .filter(Boolean));

const extractPatchKeys = (actions = [], patchName) => uniq(actions
  .filter((action) => action.type === 'customization.patch')
  .flatMap((action) => Object.keys(action.patch?.[patchName] || {})));

const buildAgentSurfaceManifest = ({ actions = [], before = {}, after = {}, applied = [] } = {}) => {
  const beforeSettings = before.settings || {};
  const afterSettings = after.settings || {};
  const beforeUser = before.user || {};
  const afterUser = after.user || {};
  const settingsKeys = uniq(actions
    .filter((action) => action.type === 'settings.patch')
    .flatMap((action) => Object.keys(action.patch || {})));
  const profileKeys = uniq(actions
    .filter((action) => action.type === 'profile.patch')
    .flatMap((action) => Object.keys(action.patch || {})));
  const projectActions = actions.filter((action) => action.type.startsWith('project.') || action.type.startsWith('block.'));
  const sectionIds = uniq(actions
    .filter((action) => action.type === 'settings.patch')
    .flatMap((action) => Array.isArray(action.patch?.site_sections) ? action.patch.site_sections.map((section) => section.id) : []));
  const interactionTypes = uniq(actions
    .filter((action) => action.type === 'settings.patch')
    .flatMap((action) => Array.isArray(action.patch?.interactions) ? action.patch.interactions.map((interaction) => interaction.type) : []));
  const changedSettings = {};
  settingsKeys.forEach((key) => {
    changedSettings[key] = {
      before: normalizeComparable(beforeSettings[key]),
      after: normalizeComparable(afterSettings[key]),
    };
  });
  const changedProfile = {};
  profileKeys.forEach((key) => {
    changedProfile[key] = {
      before: normalizeComparable(beforeUser[key]),
      after: normalizeComparable(afterUser[key]),
    };
  });

  const cssBlockIds = extractCodeBlockIdsFromPatch(actions, 'cssBlocks');
  const jsBlockIds = extractCodeBlockIdsFromPatch(actions, 'jsBlocks');
  const removedBlockIds = extractRemoveBlockIdsFromPatch(actions);
  const themeOverrideKeys = extractPatchKeys(actions, 'themeOverridesPatch');
  const animationKeys = extractPatchKeys(actions, 'animationsPatch');

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    settings: changedSettings,
    profile: changedProfile,
    sections: sectionIds,
    code: {
      cssBlockIds,
      jsBlockIds,
      removedBlockIds,
      themeOverrideKeys,
      animationKeys,
      before: {
        custom_css: normalizeComparable(beforeSettings.custom_css),
        custom_js: normalizeComparable(beforeSettings.custom_js),
        manual_custom_css: normalizeComparable(beforeSettings.manual_custom_css),
        agent_custom_css: normalizeComparable(beforeSettings.agent_custom_css),
        theme_overrides: normalizeComparable(beforeSettings.theme_overrides),
        animations: normalizeComparable(beforeSettings.animations),
        manual_design_overrides: normalizeComparable(beforeSettings.manual_design_overrides),
        agent_design_meta: normalizeComparable(beforeSettings.agent_design_meta),
      },
      after: {
        custom_css: normalizeComparable(afterSettings.custom_css),
        custom_js: normalizeComparable(afterSettings.custom_js),
        manual_custom_css: normalizeComparable(afterSettings.manual_custom_css),
        agent_custom_css: normalizeComparable(afterSettings.agent_custom_css),
        theme_overrides: normalizeComparable(afterSettings.theme_overrides),
        animations: normalizeComparable(afterSettings.animations),
        manual_design_overrides: normalizeComparable(afterSettings.manual_design_overrides),
        agent_design_meta: normalizeComparable(afterSettings.agent_design_meta),
      },
    },
    interactions: interactionTypes,
    projectSurfaces: projectActions.map((action) => ({
      type: action.type,
      projectId: action.projectId || action.projectSlug || action.slug || null,
      blockId: action.blockId || null,
    })),
    applied,
  };
};

const summarizeSurfaceManifest = (manifest = {}) => ({
  settings: Object.keys(manifest.settings || {}),
  profile: Object.keys(manifest.profile || {}),
  sections: manifest.sections || [],
  cssBlocks: manifest.code?.cssBlockIds || [],
  jsBlocks: manifest.code?.jsBlockIds || [],
  themeOverrides: manifest.code?.themeOverrideKeys || [],
  animations: manifest.code?.animationKeys || [],
  interactions: manifest.interactions || [],
  projectSurfaces: manifest.projectSurfaces || [],
});

const removeMarkedBlockById = (code = '', id = '') => {
  if (!id) return code || '';
  const safeId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\n?\\/\\*\\s*pf-ai:block:${safeId}\\s*\\*\\/[\\s\\S]*?\\/\\*\\s*pf-ai:end:${safeId}\\s*\\*\\/\\n?`,
    'g'
  );
  return String(code || '').replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

const removeManifestCodeFromSettings = (current = {}, manifest = {}) => {
  const next = { ...current };
  const code = manifest.code || {};
  const layered = getLayeredCss(current);
  const manualCss = sanitizeCustomCss(current.manual_custom_css ?? layered.manualCss);
  let agentCss = sanitizeCustomCss(current.agent_custom_css ?? layered.agentCss);
  for (const id of code.cssBlockIds || []) agentCss = removeMarkedBlockById(agentCss, id);
  next.manual_custom_css = manualCss;
  next.agent_custom_css = agentCss || null;
  next.custom_js = null;
  next.agent_design_meta = normalizeAgentDesignMeta(current.agent_design_meta);

  const currentOverrides = parseJson(current.theme_overrides, {});
  const beforeOverrides = parseJson(code.before?.theme_overrides, {});
  for (const key of code.themeOverrideKeys || []) {
    if (Object.prototype.hasOwnProperty.call(beforeOverrides, key)) currentOverrides[key] = beforeOverrides[key];
    else delete currentOverrides[key];
  }
  next.theme_overrides = currentOverrides;

  const currentAnimations = parseJson(current.animations, {});
  const beforeAnimations = parseJson(code.before?.animations, {});
  for (const key of code.animationKeys || []) {
    currentAnimations[key] = beforeAnimations[key] || 'none';
  }
  next.animations = currentAnimations;
  next.custom_css = combineLayeredCss(manualCss, normalizeAgentDesignMeta(next.agent_design_meta).active ? next.agent_custom_css : '');
  return next;
};

const removeManifestSectionsFromSettings = (current = {}, manifest = {}) => {
  const sectionIds = new Set(manifest.sections || []);
  if (!sectionIds.size) return { ...current };
  const next = { ...current };
  const currentSections = parseJson(current.site_sections, []);
  const currentOrder = parseJson(current.section_order, DEFAULT_SECTION_ORDER);
  next.site_sections = Array.isArray(currentSections)
    ? currentSections.filter((section) => !sectionIds.has(section.id))
    : [];
  next.section_order = Array.isArray(currentOrder)
    ? currentOrder.filter((id) => !sectionIds.has(id))
    : DEFAULT_SECTION_ORDER;
  return next;
};

const buildSettingsFromManifestBefore = (current = {}, manifest = {}, mode = 'visual') => {
  let next = { ...current };
  const settings = manifest.settings || {};
  const restoreKeys = mode === 'code'
    ? []
    : Object.keys(settings).filter((key) => VISUAL_RESET_FIELDS.includes(key));

  restoreKeys.forEach((key) => {
    next[key] = settings[key]?.before;
  });

  if (mode === 'visual') {
    const codeBefore = manifest.code?.before || {};
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'custom_css')) next.custom_css = codeBefore.custom_css;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'custom_js')) next.custom_js = codeBefore.custom_js;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'manual_custom_css')) next.manual_custom_css = codeBefore.manual_custom_css;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'agent_custom_css')) next.agent_custom_css = codeBefore.agent_custom_css;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'theme_overrides')) next.theme_overrides = codeBefore.theme_overrides;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'animations')) next.animations = codeBefore.animations;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'manual_design_overrides')) next.manual_design_overrides = codeBefore.manual_design_overrides;
    if (Object.prototype.hasOwnProperty.call(codeBefore, 'agent_design_meta')) next.agent_design_meta = codeBefore.agent_design_meta;
    return next;
  }

  if (mode === 'sections') {
    next = removeManifestSectionsFromSettings(next, manifest);
  }
  if (mode === 'code') {
    next = removeManifestCodeFromSettings(next, manifest);
  }

  return next;
};

const detectManifestOverwriteWarnings = (current = {}, manifest = {}, mode = 'visual') => {
  const warnings = [];
  const settings = manifest.settings || {};
  const checkedKeys = mode === 'code'
    ? ['custom_css', 'custom_js', 'manual_custom_css', 'agent_custom_css', 'theme_overrides', 'animations']
    : Object.keys(settings).filter((key) => VISUAL_RESET_FIELDS.includes(key));
  checkedKeys.forEach((key) => {
    const expectedAfter = settings[key]?.after ?? manifest.code?.after?.[key];
    if (expectedAfter !== undefined && !valuesEqual(current[key], expectedAfter)) {
      warnings.push(`${key} has changed since this AI bundle was applied; removing the bundle may overwrite newer edits to that surface.`);
    }
  });
  return warnings;
};

const writePortfolioSettings = async (client, userId, settings = {}) => {
  const layered = getLayeredCss(settings);
  const agentMeta = normalizeAgentDesignMeta(settings.agent_design_meta);
  const manualCss = sanitizeCustomCss(settings.manual_custom_css ?? layered.manualCss);
  const agentCss = sanitizeCustomCss(settings.agent_custom_css ?? layered.agentCss);
  const combinedCss = combineLayeredCss(manualCss, agentMeta.active ? agentCss : '');
  await client.query(
    `INSERT INTO portfolio_settings
       (user_id, theme, accent_color, font_choice, show_contact_form, is_public, seo_title, seo_description,
        seo_keywords, layout, section_order, show_skills, show_dates, show_project_type, section_config,
        custom_css, custom_js, theme_overrides, animations, site_sections, design_system, interactions,
        manual_custom_css, agent_custom_css, manual_design_overrides, agent_design_meta, preferred_ai_model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     ON CONFLICT (user_id) DO UPDATE SET
       theme = EXCLUDED.theme,
       accent_color = EXCLUDED.accent_color,
       font_choice = EXCLUDED.font_choice,
       show_contact_form = EXCLUDED.show_contact_form,
       is_public = EXCLUDED.is_public,
       seo_title = EXCLUDED.seo_title,
       seo_description = EXCLUDED.seo_description,
       seo_keywords = EXCLUDED.seo_keywords,
       layout = EXCLUDED.layout,
       section_order = EXCLUDED.section_order,
       show_skills = EXCLUDED.show_skills,
       show_dates = EXCLUDED.show_dates,
       show_project_type = EXCLUDED.show_project_type,
       section_config = EXCLUDED.section_config,
       custom_css = EXCLUDED.custom_css,
       custom_js = NULL,
       theme_overrides = EXCLUDED.theme_overrides,
       animations = EXCLUDED.animations,
       site_sections = EXCLUDED.site_sections,
       design_system = EXCLUDED.design_system,
       interactions = EXCLUDED.interactions,
       manual_custom_css = EXCLUDED.manual_custom_css,
       agent_custom_css = EXCLUDED.agent_custom_css,
       manual_design_overrides = EXCLUDED.manual_design_overrides,
       agent_design_meta = EXCLUDED.agent_design_meta,
       preferred_ai_model = EXCLUDED.preferred_ai_model,
       updated_at = NOW()`,
    [
      userId,
      settings.theme || 'clean',
      settings.accent_color || '#2563eb',
      settings.font_choice || 'inter',
      settings.show_contact_form ?? true,
      settings.is_public ?? true,
      settings.seo_title,
      settings.seo_description,
      settings.seo_keywords || [],
      settings.layout || 'classic',
      JSON.stringify(parseJson(settings.section_order, DEFAULT_SECTION_ORDER)),
      settings.show_skills ?? true,
      settings.show_dates ?? true,
      settings.show_project_type ?? true,
      JSON.stringify(parseJson(settings.section_config, {})),
      combinedCss,
      null,
      JSON.stringify(parseJson(settings.theme_overrides, {})),
      JSON.stringify(parseJson(settings.animations, {})),
      JSON.stringify(parseJson(settings.site_sections, [])),
      JSON.stringify(parseJson(settings.design_system, {})),
      JSON.stringify(parseJson(settings.interactions, [])),
      manualCss,
      agentCss,
      JSON.stringify(parseJsonObject(settings.manual_design_overrides, {})),
      JSON.stringify(agentMeta),
      settings.preferred_ai_model,
    ]
  );
};

const loadAppliedChangeSetsWithSnapshots = async (client, userId) => {
  const result = await client.query(
    `SELECT id, status, preview, summary, created_at, applied_at
       FROM ai_change_sets
      WHERE user_id = $1 AND status = 'applied'
      ORDER BY applied_at ASC NULLS LAST, created_at ASC`,
    [userId]
  );
  return result.rows;
};

const loadAgentContext = async (userId) => {
  const [userResult, settingsResult, projectsResult, memoriesResult, appliedChangeSetsResult] = await Promise.all([
    query(
      `SELECT id, full_name, username, headline, bio, location, website, linkedin_url,
              github_url, skills, phone, contact_email, identity_mode
         FROM users WHERE id = $1`,
      [userId]
    ),
    query('SELECT * FROM portfolio_settings WHERE user_id = $1', [userId]),
    query(
      `SELECT id, title, slug, tagline, description, project_type, technologies, status,
              is_featured, sort_order, github_url, live_url
         FROM projects WHERE user_id = $1 ORDER BY sort_order ASC, created_at DESC`,
      [userId]
    ),
    query('SELECT id, kind, content, metadata FROM ai_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20', [userId]),
    query(
      `SELECT id, thread_id, status, summary, actions, preview, model_id, created_at, applied_at
         FROM ai_change_sets
        WHERE user_id = $1
          AND status = 'applied'
        ORDER BY applied_at DESC NULLS LAST, created_at DESC
        LIMIT 8`,
      [userId]
    ),
  ]);

  const projects = projectsResult.rows;
  const projectIds = projects.map((project) => project.id);
  let blocks = [];
  if (projectIds.length) {
    const blocksResult = await query(
      `SELECT b.id, b.project_id, b.type, b.content, b.sort_order
         FROM blocks b
        WHERE b.project_id = ANY($1::uuid[])
        ORDER BY b.project_id, b.sort_order ASC`,
      [projectIds]
    );
    blocks = blocksResult.rows;
  }

  const settings = settingsResult.rows[0] || {};
  return {
    user: userResult.rows[0] || {},
    settings: {
      ...settings,
      section_config: parseJson(settings.section_config, {}),
      section_order: parseJson(settings.section_order, null),
      theme_overrides: parseJson(settings.theme_overrides, {}),
      animations: parseJson(settings.animations, {}),
      site_sections: parseJson(settings.site_sections, []),
      design_system: parseJson(settings.design_system, {}),
      interactions: parseJson(settings.interactions, []),
    },
    projects: projects.map((project) => ({
      ...project,
      blocks: blocks.filter((block) => block.project_id === project.id),
    })),
    memories: memoriesResult.rows,
    appliedChangeSets: appliedChangeSetsResult.rows,
  };
};

const buildCustomizationPreview = (context, actions) => {
  const customizationActions = actions.filter((action) => action.type === 'customization.patch');
  if (!customizationActions.length) return null;

  const current = {
    css: context.settings.custom_css || '',
    js: context.settings.custom_js || '',
    themeOverrides: parseJson(context.settings.theme_overrides, {}),
    animations: parseJson(context.settings.animations, {}),
  };
  let working = { ...current };
  const attempts = [];
  const warnings = [];

  customizationActions.forEach((action, index) => {
    try {
      const merged = parseAndMergeAiResponse(JSON.stringify(action.patch || {}), working);
      const validation = validateCustomization(merged.result);
      const errors = [...merged.errors, ...validation.errors];
      const patchWarnings = [...(merged.warnings || []), ...validation.warnings];
      warnings.push(...patchWarnings);
      attempts.push({
        attempt: index + 1,
        status: errors.length ? 'accepted_with_warnings' : 'passed',
        errors,
        warnings: patchWarnings,
      });
      working = {
        css: merged.result.css || '',
        js: merged.result.js || '',
        themeOverrides: merged.result.themeOverrides || {},
        animations: merged.result.animations || {},
      };
    } catch (error) {
      attempts.push({
        attempt: index + 1,
        status: 'invalid_patch',
        errors: [error.message],
        warnings: [],
      });
    }
  });

  return {
    before: current,
    after: working,
    aiFeedback: {
      status: attempts.some((attempt) => attempt.errors?.length) ? 'completed_with_warnings' : 'completed',
      attempts,
      summary: summarizeCustomizationChanges(current, working),
    },
    warnings,
  };
};

const ensureThread = async ({ userId, threadId, modelId, title }) => {
  if (threadId) {
    const existing = await query('SELECT * FROM ai_threads WHERE id = $1 AND user_id = $2', [threadId, userId]);
    if (existing.rows[0]) return existing.rows[0];
  }

  const result = await query(
    `INSERT INTO ai_threads (user_id, title, model_id)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [userId, title || 'AI Editor Chat', modelId]
  );
  return result.rows[0];
};

const markLatestClarificationAnswered = async ({ threadId, userId, answer }) => {
  if (!threadId) return;
  await query(
    `UPDATE ai_messages
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE id = (
        SELECT id
          FROM ai_messages
         WHERE thread_id = $1
           AND user_id = $2
           AND role = 'assistant'
           AND metadata->>'awaitingClarification' = 'true'
         ORDER BY created_at DESC
         LIMIT 1
      )`,
    [
      threadId,
      userId,
      JSON.stringify({
        awaitingClarification: false,
        clarificationAnswered: true,
        clarificationAnswer: String(answer || '').slice(0, 1000),
        clarificationAnsweredAt: new Date().toISOString(),
      }),
    ]
  );
};

const loadChangeSetForResponse = async (changeSetId, userId) => {
  const result = await query(
    `SELECT id, thread_id, status, summary, actions, preview, model_id, created_at, applied_at
       FROM ai_change_sets
      WHERE id = $1 AND user_id = $2`,
    [changeSetId, userId]
  );
  return result.rows[0] || null;
};

const safeLoadChangeSetForResponse = async (changeSetId, userId) => {
  try {
    return await loadChangeSetForResponse(changeSetId, userId);
  } catch (error) {
    console.warn('Applied change set response hydration failed:', error.message);
    return null;
  }
};

const loadLiveVerificationTarget = async (client, userId) => {
  const userResult = await client.query(
    `SELECT u.id, u.email, u.full_name, u.username, u.avatar_url, COALESCE(ps.is_public, true) AS is_public
       FROM users u
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  const projectResult = await client.query(
    `SELECT slug, COUNT(*) OVER ()::int AS published_project_count
       FROM projects
      WHERE user_id = $1 AND status = 'published'
      ORDER BY is_featured DESC, sort_order ASC, created_at DESC
      LIMIT 1`,
    [userId]
  );
  return {
    username: userResult.rows[0]?.username || null,
    isPublic: userResult.rows[0]?.is_public !== false,
    projectSlug: projectResult.rows[0]?.slug || null,
    publishedProjectCount: projectResult.rows[0]?.published_project_count || 0,
    user: userResult.rows[0]
      ? {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          full_name: userResult.rows[0].full_name,
          username: userResult.rows[0].username,
          avatar_url: userResult.rows[0].avatar_url,
        }
      : null,
  };
};

// The verifier signs in through a real single-use Supabase magic link instead of a
// self-minted token: the SPA only accepts sessions Supabase issued. Null here means
// verification runs against public routes only, exactly as it did when JWT_SECRET
// was unset.
const verifierAuth = async (user) => {
  if (!user?.email) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const loginUrl = await createVerifierLoginLink(user.email, `${frontendUrl}/auth/callback`);
  return loginUrl ? { loginUrl, user } : null;
};

const runLiveVerificationForUser = async (userId, artifactId = null) => {
  const client = await pool.connect();
  try {
    const liveTarget = await loadLiveVerificationTarget(client, userId);
    if (!liveTarget.isPublic) {
      return {
        status: 'skipped',
        mode: 'live-route',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        checks: [],
        warnings: ['Live route verification skipped because the portfolio is private.'],
        errors: [],
      };
    }
    return verifyLiveRoutes({
      username: liveTarget.username,
      projectSlug: liveTarget.projectSlug,
      publishedProjectCount: liveTarget.publishedProjectCount,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      auth: await verifierAuth(liveTarget.user),
    }, getBrowserArtifactOptions(artifactId));
  } finally {
    client.release();
  }
};

const runPreviewVerificationForUser = async (userId, previewState, artifactId = null) => {
  const client = await pool.connect();
  try {
    const liveTarget = await loadLiveVerificationTarget(client, userId);
    return verifyPreviewRoutes({
      username: liveTarget.username,
      projectSlug: liveTarget.projectSlug,
      publishedProjectCount: liveTarget.publishedProjectCount,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      previewState,
      auth: await verifierAuth(liveTarget.user),
    }, getBrowserArtifactOptions(artifactId));
  } finally {
    client.release();
  }
};

router.get('/models', requireAuth, async (req, res) => {
  res.json({
    defaultModelId: DEFAULT_MODEL_ID,
    defaultModeId: DEFAULT_AGENT_MODE,
    models: getModels().map(serializeModel),
    modes: getAgentModes(),
  });
});

router.get('/debug/state', requireAuth, async (req, res) => {
  const settingsResult = await query(
    `SELECT theme, accent_color, is_public, layout, custom_css, agent_custom_css, manual_custom_css,
            agent_design_meta, site_sections, section_order, updated_at
     FROM portfolio_settings WHERE user_id = $1`,
    [req.user.id]
  );
  const settings = settingsResult.rows[0] || null;

  const changeSetsResult = await query(
    `SELECT id, status, summary, created_at, applied_at,
            preview->'browserVerification'->>'status' AS browser_verification_status,
            preview->'realAppVerification'->>'status' AS real_app_verification_status,
            preview->'preApplyVerification'->>'status' AS preapply_verification_status,
            preview->'liveVerification'->>'status' AS live_verification_status,
            preview->'surfaceSummary' AS surface_summary
     FROM ai_change_sets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [req.user.id]
  );

  res.json({
    note: 'This reflects the actual current database state, independent of any UI cache. Compare updated_at against the time you ran your test.',
    settings: settings ? {
      theme: settings.theme,
      accent_color: settings.accent_color,
      is_public: settings.is_public,
      layout: settings.layout,
      custom_css_length: (settings.custom_css || '').length,
      agent_custom_css_length: (settings.agent_custom_css || '').length,
      manual_custom_css_length: (settings.manual_custom_css || '').length,
      agent_design_meta: settings.agent_design_meta,
      site_sections_count: Array.isArray(settings.site_sections) ? settings.site_sections.length : 0,
      section_order: settings.section_order,
      updated_at: settings.updated_at,
    } : null,
    recentChangeSets: changeSetsResult.rows,
  });
});

router.get('/threads', requireAuth, async (req, res) => {
  const result = await query(
      `SELECT t.*,
            (SELECT content FROM ai_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM ai_threads t
      WHERE t.user_id = $1
      ORDER BY t.updated_at DESC
      LIMIT 30`,
    [req.user.id]
  );
  res.json({ threads: result.rows });
});

router.delete('/threads/:id', requireAuth, userQuota('agent.thread.delete', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const thread = await client.query('SELECT id FROM ai_threads WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!thread.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Thread not found.' });
    }
    await client.query(
      `DELETE FROM ai_memories
        WHERE user_id = $1
          AND (
            thread_id = $2
            OR metadata->>'threadId' = $3
            OR metadata->>'thread_id' = $3
          )`,
      [req.user.id, req.params.id, String(req.params.id)]
    );
    await client.query('DELETE FROM ai_threads WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.json({ message: 'Chat thread deleted.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete agent thread error:', error);
    res.status(500).json({ error: 'Failed to delete chat thread.' });
  } finally {
    client.release();
  }
});

router.get('/change-sets/applied', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, thread_id, status, summary, actions, preview, model_id, created_at, applied_at
      FROM ai_change_sets
      WHERE user_id = $1
        AND status = 'applied'
      ORDER BY applied_at DESC NULLS LAST, created_at DESC
      LIMIT 10`,
    [req.user.id]
  );
  res.json({ changeSets: result.rows });
});

router.get('/threads/:id', requireAuth, async (req, res) => {
  const thread = await query('SELECT * FROM ai_threads WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!thread.rows[0]) return res.status(404).json({ error: 'Thread not found.' });

  const messages = await query(
    `SELECT * FROM (
       SELECT id, role, content, metadata, created_at FROM ai_messages
       WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 200
     ) recent_messages ORDER BY created_at ASC`,
    [req.params.id]
  );
  const changeSets = await query(
    'SELECT id, status, summary, actions, preview, model_id, created_at, applied_at FROM ai_change_sets WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.params.id]
  );

  res.json({ thread: thread.rows[0], messages: messages.rows, changeSets: changeSets.rows });
});

const handleAgentChat = async (req, res) => {
  const { threadId, prompt, modelId, mode } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required.' });

  const inferredMode = inferAgentModeFromPrompt(prompt, mode || DEFAULT_AGENT_MODE);
  const route = chooseModelForMode(inferredMode, modelId);
  const selectedModel = route.model;
  const selectedMode = route.mode;
  const context = await loadAgentContext(req.user.id);
  const intent = classifyAgentIntent(prompt);
  const thread = await ensureThread({
    userId: req.user.id,
    threadId,
    modelId: selectedModel.id,
    title: prompt.slice(0, 80),
  });

  if (/\bClarification answer\s*:/i.test(prompt)) {
    await markLatestClarificationAnswered({
      threadId: thread.id,
      userId: req.user.id,
      answer: prompt,
    });
  }

  await query(
    'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
    [thread.id, req.user.id, 'user', prompt, JSON.stringify({ modelId: selectedModel.id, requestedModelId: modelId || null, agentMode: selectedMode.id, routed: route.routed, intent: intent.id })]
  );

  const historyResult = await query(
    'SELECT role, content FROM ai_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 12',
    [thread.id]
  );
  const history = historyResult.rows.reverse().map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
  }));

  const clarificationNeed = analyzeAgentClarificationNeed({ prompt, context, intent });
  if (clarificationNeed.shouldAsk) {
    await query(
      'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
      [
        thread.id,
        req.user.id,
        'assistant',
        clarificationNeed.reply,
        JSON.stringify({
          modelId: selectedModel.id,
          requestedModelId: modelId || null,
          agentMode: selectedMode.id,
          routed: route.routed,
          intent: intent.id,
          awaitingClarification: true,
          clarification: {
            ...(clarificationNeed.clarification || {}),
            reasons: clarificationNeed.reasons || [],
            requestedFields: clarificationNeed.requestedFields || [],
            originalPrompt: prompt,
          },
        }),
      ]
    );
    await query(
      'UPDATE ai_threads SET title = COALESCE($1, title), model_id = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4',
      [prompt.slice(0, 80), selectedModel.id, thread.id, req.user.id]
    );
    return res.json({
      thread: { ...thread, model_id: selectedModel.id, title: prompt.slice(0, 80) || thread.title },
      reply: clarificationNeed.reply,
      changeSet: null,
      needsInput: {
        type: clarificationNeed.clarification?.type || 'clarification',
        clarification: {
          ...(clarificationNeed.clarification || {}),
          reasons: clarificationNeed.reasons || [],
          requestedFields: clarificationNeed.requestedFields || [],
          originalPrompt: prompt,
        },
      },
      model: serializeModel(selectedModel),
      mode: selectedMode,
      routed: route.routed,
    });
  }

  let parsed;
  let aiResponse;
  let previousErrors = [];
  const repairAttempts = [];
  const useProjectFolioCompiler = shouldUseProjectFolioCompiler(intent);
  const compactContext = buildCompactAgentContext(context, compactContextOptionsForModel(selectedModel));
  const baseMessages = [
    { role: 'system', content: buildAgentSystemMessage(intent) },
    ...history.slice(-6, -1),
  ];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      aiResponse = await callAiModel({
        modelId: selectedModel.id,
        messages: [
          ...baseMessages,
          { role: 'user', content: buildAgentUserMessage({ prompt, context, compactContext, previousErrors, intent }) },
        ],
        temperature: attempt === 1 ? 0.45 : 0.25,
        maxTokens: maxTokensForAgentMode(selectedMode.id, selectedModel),
      });
      parsed = parseAgentResponse(aiResponse.content, { prompt, intent });
      repairAttempts.push({
        attempt,
        status: parsed.errors.length ? 'retrying_validation' : 'passed',
        errors: parsed.errors,
        warnings: parsed.warnings || [],
      });
      if (!parsed.errors.length) break;
      previousErrors = parsed.errors;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const providerStatus = error.status;
      if (isProviderAuthError(error) || isProviderSizeError(error) || isProviderTimeoutError(error) || providerStatus === 429) {
        if (useProjectFolioCompiler) {
          const providerError = String(error.message || 'Provider request failed').slice(0, 1200);
          parsed = compileProjectFolioBundle({
            prompt,
            context,
            intent,
            modelErrors: [providerError],
            reason: isProviderTimeoutError(error)
              ? 'provider_timeout_local_compile'
              : providerStatus === 429
                ? 'provider_rate_limit_local_compile'
                : 'provider_failed_local_compile',
          });
          aiResponse = { ...(aiResponse || {}), fallback: true, compiler: parsed?.compiler || null, usage: null };
          repairAttempts.push({
            attempt,
            status: 'compiled_projectfolio_bundle_after_provider_failure',
            errors: [providerError],
            warnings: ['The selected model could not complete the draft, so ProjectFolio compiled a native-safe bundle locally.'],
          });
          break;
        }
        repairAttempts.push({
          attempt,
          status: isProviderTimeoutError(error)
            ? 'provider_timeout'
            : isProviderSizeError(error)
              ? 'provider_size_error'
              : providerStatus === 429
                ? 'provider_rate_limited'
                : 'provider_unavailable',
          errors: [String(error.message || 'Provider request failed').slice(0, 1200)],
          warnings: [],
        });
        await query(
          'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
          [
            thread.id,
            req.user.id,
            'assistant',
            'I could not generate a safe change bundle because the AI provider rejected the request. No changes were made.',
            JSON.stringify({ modelId: selectedModel.id, requestedModelId: modelId || null, agentMode: selectedMode.id, routed: route.routed, repairAttempts }),
          ]
        );
        return res.status(isProviderTimeoutError(error) ? 504 : isProviderSizeError(error) ? 413 : providerStatus || 502).json(
          buildProviderErrorResponse({ error, selectedModel, selectedMode, route, compactContext })
        );
      }
      previousErrors = [error.message || 'The AI returned invalid JSON.'];
      if (attempt === 3 && useProjectFolioCompiler) {
        parsed = compileProjectFolioBundle({
          prompt,
          context,
          intent,
          modelErrors: previousErrors,
          reason: 'invalid_model_json_local_compile',
        });
        aiResponse = { ...(aiResponse || {}), fallback: true, compiler: parsed?.compiler || null, usage: aiResponse?.usage || null };
        repairAttempts.push({
          attempt,
          status: 'compiled_projectfolio_bundle_after_invalid_model_json',
          errors: previousErrors,
          warnings: ['The model draft was not valid JSON, so ProjectFolio compiled a native-safe bundle locally.'],
        });
        break;
      }
      repairAttempts.push({
        attempt,
        status: attempt === 3 ? 'invalid_response' : 'retrying_invalid_response',
        errors: previousErrors,
        warnings: [],
      });
      if (attempt === 3) {
        return res.status(502).json({
          error: 'The AI provider returned an invalid response three times. No changes were made.',
          details: previousErrors,
          repairAttempts,
        });
      }
    }
  }

  if (useProjectFolioCompiler && parsed?.errors?.length && !parsed.clarification && !parsed.compiler) {
    const compiled = compileProjectFolioBundle({
      prompt,
      context,
      intent,
      modelDraft: parsed,
      modelErrors: parsed.errors || [],
      reason: 'model_validation_errors_local_compile',
    });
    if (compiled) {
      parsed = compiled;
      aiResponse = { ...(aiResponse || {}), fallback: true, compiler: parsed.compiler || null, usage: aiResponse?.usage || null };
      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        status: 'compiled_projectfolio_native_bundle',
        errors: parsed.errors || [],
        warnings: parsed.warnings || [],
      });
    }
  }

  if (parsed?.errors?.length) {
    return res.status(422).json({
      error: 'The AI returned a change bundle that did not pass validation. No changes were made.',
      details: parsed.errors.slice(0, 8),
      warnings: parsed.warnings || [],
      repairAttempts,
    });
  }

  if (parsed?.clarification) {
    await query(
      'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
      [
        thread.id,
        req.user.id,
        'assistant',
        parsed.reply || parsed.clarification.reply,
        JSON.stringify({
          modelId: selectedModel.id,
          requestedModelId: modelId || null,
          agentMode: selectedMode.id,
          routed: route.routed,
          usage: aiResponse?.usage || null,
          repairAttempts,
          intent: intent.id,
          awaitingClarification: true,
          clarification: {
            ...parsed.clarification,
            originalPrompt: prompt,
          },
        }),
      ]
    );
    await query(
      'UPDATE ai_threads SET title = COALESCE($1, title), model_id = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4',
      [parsed.threadTitle || prompt.slice(0, 80), selectedModel.id, thread.id, req.user.id]
    );
    return res.json({
      thread: { ...thread, model_id: selectedModel.id, title: parsed.threadTitle || prompt.slice(0, 80) || thread.title },
      reply: parsed.reply || parsed.clarification.reply,
      changeSet: null,
      needsInput: {
        type: parsed.clarification.type || 'clarification',
        clarification: {
          ...parsed.clarification,
          originalPrompt: prompt,
        },
      },
      model: serializeModel(selectedModel),
      mode: selectedMode,
      routed: route.routed,
    });
  }

  parsed = mergeParsedDesignSystemWithCurrentSettings(parsed, context, prompt, intent);

  const preliminaryCustomizationPreview = parsed.actions.length ? buildCustomizationPreview(context, parsed.actions) : null;
  const preliminaryEffectiveErrors = buildEffectiveChangeErrors(parsed.actions, preliminaryCustomizationPreview);
  if (parsed.actions.length && preliminaryEffectiveErrors.length && intent.id !== 'removeOrRevert') {
    const fallbackParsed = mergeParsedDesignSystemWithCurrentSettings(
      buildFallbackAgentResponse(prompt, context),
      context,
      prompt,
      intent
    );
    const fallbackCustomizationPreview = fallbackParsed.actions.length ? buildCustomizationPreview(context, fallbackParsed.actions) : null;
    const fallbackEffectiveErrors = buildEffectiveChangeErrors(fallbackParsed.actions, fallbackCustomizationPreview);
    if (!fallbackEffectiveErrors.length) {
      parsed = {
        ...fallbackParsed,
        warnings: [
          ...new Set([
            ...(fallbackParsed.warnings || []),
            'Replaced the model draft with ProjectFolio fallback changes because the model bundle had no visible effect.',
          ]),
        ],
      };
      aiResponse = { ...(aiResponse || {}), fallback: true };
      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        status: 'replaced_noop_bundle_with_projectfolio_fallback',
        errors: preliminaryEffectiveErrors,
        warnings: ['The model response parsed, but it would not visibly change the portfolio.'],
      });
    } else {
      return res.status(422).json({
        error: 'The AI returned a bundle that would not visibly change the portfolio. No changes were made.',
        details: preliminaryEffectiveErrors.slice(0, 8),
        warnings: parsed.warnings || [],
        repairAttempts,
      });
    }
  }

  let critique = critiqueAgentBundle({
    prompt,
    actions: parsed.actions,
    designBrief: parsed.designBrief,
    sitePlan: parsed.sitePlan,
    designSystem: parsed.designSystem,
  });
  parsed.warnings = [...new Set([...(parsed.warnings || []), ...(critique.warnings || [])])];

  let changeSet = null;
  let customizationPreview = null;
  let interactionsPreview = null;
  let browserVerification = null;
  let syntheticVerification = null;
  let realAppVerification = null;
  if (parsed.actions.length) {
    customizationPreview = buildCustomizationPreview(context, parsed.actions);
    interactionsPreview = parsed.actions.find((action) => action.type === 'settings.patch')?.patch?.interactions || null;
    let browserPreviewState = mergePreviewState({
      context,
      actions: parsed.actions,
      customizationPreview,
    });
    const artifactBase = `user-${req.user.id}-thread-${thread.id}-${Date.now()}`;
    browserVerification = await verifyAgentPreview(browserPreviewState, getBrowserArtifactOptions(`${artifactBase}-draft`));

    if (browserVerification.status === 'failed' && !aiResponse?.fallback) {
      const browserErrors = [
        ...(browserVerification.errors || []),
        ...(browserVerification.warnings || []),
      ].slice(0, 8);

      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        status: 'retrying_browser_verification',
        errors: browserErrors,
        warnings: ['Browser smoke check failed before review; asking the model to repair the bundle.'],
      });

      try {
        const repairedResponse = await callAiModel({
          modelId: selectedModel.id,
          messages: [
            { role: 'system', content: buildAgentSystemMessage(intent) },
            ...history.slice(0, -1),
            { role: 'user', content: buildAgentUserMessage({ prompt, context, compactContext, previousErrors: browserErrors, intent }) },
          ],
          temperature: 0.2,
          maxTokens: maxTokensForAgentMode(selectedMode.id, selectedModel),
        });
        const repairedParsed = parseAgentResponse(repairedResponse.content, { prompt, intent });

        if (!repairedParsed.errors.length && repairedParsed.actions.length) {
          const mergedRepairedParsed = mergeParsedDesignSystemWithCurrentSettings(repairedParsed, context, prompt, intent);
          const repairedCritique = critiqueAgentBundle({
            prompt,
            actions: mergedRepairedParsed.actions,
            designBrief: mergedRepairedParsed.designBrief,
            sitePlan: mergedRepairedParsed.sitePlan,
            designSystem: mergedRepairedParsed.designSystem,
          });
          mergedRepairedParsed.warnings = [...new Set([...(mergedRepairedParsed.warnings || []), ...(repairedCritique.warnings || [])])];
          const repairedCustomizationPreview = buildCustomizationPreview(context, mergedRepairedParsed.actions);
          const repairedBrowserPreviewState = mergePreviewState({
            context,
            actions: mergedRepairedParsed.actions,
            customizationPreview: repairedCustomizationPreview,
          });
          const repairedBrowserVerification = await verifyAgentPreview(
            repairedBrowserPreviewState,
            getBrowserArtifactOptions(`${artifactBase}-repair`)
          );

          repairAttempts.push({
            attempt: repairAttempts.length + 1,
            status: repairedBrowserVerification.status === 'failed' ? 'browser_repair_failed' : 'browser_repair_passed',
            errors: repairedBrowserVerification.errors || [],
            warnings: repairedBrowserVerification.warnings || [],
          });

          if (repairedBrowserVerification.status !== 'failed') {
            parsed = mergedRepairedParsed;
            aiResponse = repairedResponse;
            critique = repairedCritique;
            customizationPreview = repairedCustomizationPreview;
            interactionsPreview = parsed.actions.find((action) => action.type === 'settings.patch')?.patch?.interactions || null;
            browserPreviewState = repairedBrowserPreviewState;
            browserVerification = repairedBrowserVerification;
          }
        } else {
          repairAttempts.push({
            attempt: repairAttempts.length + 1,
            status: 'browser_repair_invalid',
            errors: repairedParsed.errors.length ? repairedParsed.errors : ['Browser repair returned no applyable actions.'],
            warnings: repairedParsed.warnings || [],
          });
        }
      } catch (error) {
        repairAttempts.push({
          attempt: repairAttempts.length + 1,
          status: 'browser_repair_error',
          errors: [error.message || 'Browser repair attempt failed.'],
          warnings: [],
        });
      }
    }

    syntheticVerification = browserVerification;
    realAppVerification = await runPreviewVerificationForUser(
      req.user.id,
      browserPreviewState,
      `${artifactBase}-real-preview`
    );
    browserVerification = realAppVerification;

    if (realAppVerification.status !== 'passed' && !aiResponse?.fallback) {
      const realPreviewErrors = [
        ...(realAppVerification.errors || []),
        ...(realAppVerification.warnings || []),
      ].slice(0, 8);

      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        status: 'retrying_real_preview_verification',
        errors: realPreviewErrors,
        warnings: ['Real React preview failed before review; asking the model to repair the bundle.'],
      });

      try {
        const realPreviewRepairResponse = await callAiModel({
          modelId: selectedModel.id,
          messages: [
            { role: 'system', content: buildAgentSystemMessage(intent) },
            ...history.slice(0, -1),
            { role: 'user', content: buildAgentUserMessage({ prompt, context, compactContext, previousErrors: realPreviewErrors, intent }) },
          ],
          temperature: 0.2,
            maxTokens: maxTokensForAgentMode(selectedMode.id, selectedModel),
        });
        const realPreviewRepairedParsed = parseAgentResponse(realPreviewRepairResponse.content, { prompt, intent });

        if (!realPreviewRepairedParsed.errors.length && realPreviewRepairedParsed.actions.length) {
          const mergedRealPreviewRepairedParsed = mergeParsedDesignSystemWithCurrentSettings(realPreviewRepairedParsed, context, prompt, intent);
          const realPreviewRepairedCritique = critiqueAgentBundle({
            prompt,
            actions: mergedRealPreviewRepairedParsed.actions,
            designBrief: mergedRealPreviewRepairedParsed.designBrief,
            sitePlan: mergedRealPreviewRepairedParsed.sitePlan,
            designSystem: mergedRealPreviewRepairedParsed.designSystem,
          });
          mergedRealPreviewRepairedParsed.warnings = [
            ...new Set([...(mergedRealPreviewRepairedParsed.warnings || []), ...(realPreviewRepairedCritique.warnings || [])]),
          ];
          const realPreviewRepairedCustomization = buildCustomizationPreview(context, mergedRealPreviewRepairedParsed.actions);
          const realPreviewRepairedState = mergePreviewState({
            context,
            actions: mergedRealPreviewRepairedParsed.actions,
            customizationPreview: realPreviewRepairedCustomization,
          });
          const repairedSyntheticVerification = await verifyAgentPreview(
            realPreviewRepairedState,
            getBrowserArtifactOptions(`${artifactBase}-real-repair-synthetic`)
          );
          const repairedRealVerification = repairedSyntheticVerification.status === 'failed'
            ? repairedSyntheticVerification
            : await runPreviewVerificationForUser(
              req.user.id,
              realPreviewRepairedState,
              `${artifactBase}-real-repair-preview`
            );

          repairAttempts.push({
            attempt: repairAttempts.length + 1,
            status: repairedRealVerification.status === 'passed' ? 'real_preview_repair_passed' : 'real_preview_repair_failed',
            errors: repairedRealVerification.errors || [],
            warnings: repairedRealVerification.warnings || [],
          });

          if (repairedRealVerification.status === 'passed') {
            parsed = mergedRealPreviewRepairedParsed;
            aiResponse = realPreviewRepairResponse;
            critique = realPreviewRepairedCritique;
            customizationPreview = realPreviewRepairedCustomization;
            interactionsPreview = parsed.actions.find((action) => action.type === 'settings.patch')?.patch?.interactions || null;
            browserPreviewState = realPreviewRepairedState;
            syntheticVerification = repairedSyntheticVerification;
            realAppVerification = repairedRealVerification;
            browserVerification = repairedRealVerification;
          }
        } else {
          repairAttempts.push({
            attempt: repairAttempts.length + 1,
            status: 'real_preview_repair_invalid',
            errors: realPreviewRepairedParsed.errors.length ? realPreviewRepairedParsed.errors : ['Real preview repair returned no applyable actions.'],
            warnings: realPreviewRepairedParsed.warnings || [],
          });
        }
      } catch (error) {
        repairAttempts.push({
          attempt: repairAttempts.length + 1,
          status: 'real_preview_repair_error',
          errors: [error.message || 'Real preview repair attempt failed.'],
          warnings: [],
        });
      }
    }

    if (browserVerification.status !== 'passed') {
      parsed.warnings = [
        ...new Set([
          ...(parsed.warnings || []),
          'Real browser preview verification did not pass. This bundle is blocked from Apply until the agent produces a clean preview.',
        ]),
      ];
      repairAttempts.push({
        attempt: repairAttempts.length + 1,
        status: 'real_preview_blocked',
        errors: browserVerification.errors || [],
        warnings: browserVerification.warnings || [],
      });
      if (shouldDiscardFailedReviewBundle()) {
        await query(
          'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
          [
            thread.id,
            req.user.id,
            'assistant',
            'I could not produce a usable site bundle because the final browser verification still failed. No changes were made.',
            JSON.stringify({ modelId: selectedModel.id, requestedModelId: modelId || null, agentMode: selectedMode.id, routed: route.routed, repairAttempts, intent: intent.id }),
          ]
        );
        return res.status(422).json({
          error: 'The AI bundle still failed browser verification after repair. No review bundle was created.',
          details: [
            ...(browserVerification.errors || []),
            ...(browserVerification.warnings || []),
          ].slice(0, 8),
          repairAttempts,
          model: serializeModel(selectedModel),
          mode: selectedMode,
          routed: route.routed,
        });
      }
    }
    const changeSetResult = await query(
      `INSERT INTO ai_change_sets (thread_id, user_id, summary, actions, preview, model_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        thread.id,
        req.user.id,
        parsed.summary,
        JSON.stringify(parsed.actions),
        JSON.stringify({
          reply: parsed.reply,
          contextVersion: new Date().toISOString(),
          designBrief: parsed.designBrief || null,
          sitePlan: parsed.sitePlan || null,
          designSystem: parsed.designSystem || null,
          compiler: parsed.compiler || null,
          interactions: interactionsPreview,
          critique,
          browserVerification,
          syntheticVerification,
          realAppVerification,
          customization: customizationPreview,
          warnings: parsed.warnings || [],
          repairAttempts,
          modelRouting: {
            mode: selectedMode.id,
            modelId: selectedModel.id,
            requestedModelId: modelId || null,
            routed: route.routed,
          },
          intent,
        }),
        selectedModel.id,
      ]
    );
    changeSet = changeSetResult.rows[0];
    logger.info({
      tag: 'AGENT:CHAT:CHANGESET_CREATED',
      userId: req.user.id,
      changeSetId: changeSet.id,
      status: changeSet.status,
      actionCount: parsed.actions.length,
      actionTypes: parsed.actions.map((action) => action.type),
      browserVerificationStatus: browserVerification?.status || null,
      note: 'This is a PENDING proposal only. Nothing has been written to portfolio_settings/projects yet. POST /agent/change-sets/:id/apply is required to make it live.',
    }, 'Agent change set created (pending, not yet applied)');
  }

  const finalReply = (!parsed.actions.length && !parsed.clarification && !parsed.compiler?.noOp)
    ? `${parsed.reply}\n\nNote: this response did not include any applyable site changes, so nothing on the portfolio was modified.`
    : parsed.reply;

  await query(
    'INSERT INTO ai_messages (thread_id, user_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)',
    [thread.id, req.user.id, 'assistant', finalReply, JSON.stringify({ modelId: selectedModel.id, requestedModelId: modelId || null, agentMode: selectedMode.id, routed: route.routed, usage: aiResponse?.usage || null, warnings: parsed.warnings || [], repairAttempts, intent: intent.id, compiler: parsed.compiler || null })]
  );

  await query(
    'UPDATE ai_threads SET title = COALESCE($1, title), model_id = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4',
    [parsed.threadTitle, selectedModel.id, thread.id, req.user.id]
  );

  res.json({
    thread: { ...thread, model_id: selectedModel.id, title: parsed.threadTitle || thread.title },
    reply: finalReply,
    changeSet,
    model: serializeModel(selectedModel),
    mode: selectedMode,
    routed: route.routed,
  });
};

router.post('/chat', requireAuth, userQuota('agent.chat', { windowMs: 60 * 60 * 1000, max: 40, message: 'Hourly AI agent limit reached.' }), userCostBudget('agent.chat', { windowMs: 24 * 60 * 60 * 1000, maxCost: 120, cost: 10, message: 'Daily AI agent budget reached.' }), async (req, res) => {
  if (!req.body?.prompt?.trim()) return res.status(400).json({ error: 'Prompt is required.' });
  const job = await createJob({
    userId: req.user.id,
    type: 'agent:chat',
    input: { userId: req.user.id, body: req.body },
    idempotencyKey: req.get('Idempotency-Key') || null,
  });
  res.status(202).json({ job_id: job.id, status: job.status });
});

const handleAgentApply = async (req, res) => {
  const client = await pool.connect();
  let applied = null;
  let liveVerification = null;
  let rollbackSnapshot = null;
  let committed = false;
  logger.info({ tag: 'AGENT:APPLY:START', userId: req.user.id, changeSetId: req.params.id }, 'Apply requested');
  try {
    const changeSetResult = await query(
      'SELECT * FROM ai_change_sets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const changeSet = changeSetResult.rows[0];
    if (!changeSet) {
      logger.warn({ tag: 'AGENT:APPLY:NOT_FOUND', userId: req.user.id, changeSetId: req.params.id }, 'Change set not found for this user');
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Change set not found.' });
    }
    if (changeSet.status !== 'pending') {
      logger.warn({ tag: 'AGENT:APPLY:NOT_PENDING', userId: req.user.id, changeSetId: req.params.id, status: changeSet.status }, 'Change set already resolved; apply is a no-op');
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Change set is already ${changeSet.status}.` });
    }
    const preview = parseJson(changeSet.preview, {});
    if (shouldBlockApplyForBrowserVerification(preview, req.body?.force)) {
      logger.warn({
        tag: 'AGENT:APPLY:BLOCKED_BROWSER_VERIFICATION',
        userId: req.user.id,
        changeSetId: req.params.id,
        verificationStatus: getAuthoritativeVerification(preview)?.status || null,
        errors: getAuthoritativeVerification(preview)?.errors || [],
      }, 'Apply blocked: stored browser verification did not pass');
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'This AI bundle failed browser verification and was not applied.',
        details: preview.browserVerification.errors || [],
      });
    }

    const actions = parseJson(changeSet.actions, []);
    const validation = validateAgentActions(actions);
    if (validation.errors.length) {
      logger.warn({ tag: 'AGENT:APPLY:INVALID_ACTIONS', userId: req.user.id, changeSetId: req.params.id, errors: validation.errors }, 'Apply blocked: action validation failed');
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Change set is invalid.', details: validation.errors });
    }

    const freshContext = await loadAgentContext(req.user.id);
    const freshCustomizationPreview = buildCustomizationPreview(freshContext, validation.actions);
    const effectiveErrors = buildEffectiveChangeErrors(validation.actions, freshCustomizationPreview);
    if (effectiveErrors.length) {
      logger.warn({ tag: 'AGENT:APPLY:NO_VISIBLE_CHANGE', userId: req.user.id, changeSetId: req.params.id, errors: effectiveErrors }, 'Apply blocked: actions evaluated to no visible change against current live settings');
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'This AI bundle does not contain a visible ProjectFolio change and was not applied.',
        details: effectiveErrors.slice(0, 8),
      });
    }
    const freshPreviewState = mergePreviewState({
      context: freshContext,
      actions: validation.actions,
      customizationPreview: freshCustomizationPreview,
    });
    const preApplyVerification = await runPreviewVerificationForUser(
      req.user.id,
      freshPreviewState,
      `change-set-${req.params.id}-preapply`
    );
    logger.info({ tag: 'AGENT:APPLY:PREAPPLY_VERIFICATION', userId: req.user.id, changeSetId: req.params.id, status: preApplyVerification.status, errors: preApplyVerification.errors || [] }, 'Pre-apply real-route verification result');
    if (preApplyVerification.status !== 'passed') {
      await query(
        "UPDATE ai_change_sets SET preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND user_id = $3",
        [JSON.stringify({ browserVerification: preApplyVerification, realAppVerification: preApplyVerification, preApplyVerification }), req.params.id, req.user.id]
      ).catch((error) => {
        console.warn('Pre-apply verification save failed:', error.message);
      });
      return res.status(422).json({
        status: 'blocked_preapply',
        error: 'This AI bundle did not pass real browser preview verification and was not applied.',
        details: preApplyVerification.errors || [],
        warnings: preApplyVerification.warnings || [],
        verification: preApplyVerification,
      });
    }

    await client.query('BEGIN');
    const lockedChangeSet = await client.query(
      'SELECT status, actions FROM ai_change_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (!lockedChangeSet.rows[0] || lockedChangeSet.rows[0].status !== 'pending') {
      logger.warn({ tag: 'AGENT:APPLY:RACE_CONDITION', userId: req.user.id, changeSetId: req.params.id }, 'Change set status changed between read and lock');
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This change set changed while it was being verified. Review it again before applying.' });
    }

    rollbackSnapshot = await loadWebsiteSnapshot(client, req.user.id);
    const beforeRevision = await savePortfolioRevision(client, req.user.id, rollbackSnapshot, `before:${req.params.id}`);
    applied = await applyAgentActions(client, req.user.id, validation.actions, { changeSetId: req.params.id });
    logger.info({ tag: 'AGENT:APPLY:DB_WRITES_DONE', userId: req.user.id, changeSetId: req.params.id, applied }, 'applyAgentActions finished writing to the database (inside open transaction, not yet committed)');
    const afterSnapshot = await loadWebsiteSnapshot(client, req.user.id);
    const afterRevision = await savePortfolioRevision(client, req.user.id, afterSnapshot, `after:${req.params.id}`);
    const surfaceManifest = buildAgentSurfaceManifest({
      actions: validation.actions,
      before: rollbackSnapshot,
      after: afterSnapshot,
      applied,
    });
    const surfaceSummary = summarizeSurfaceManifest(surfaceManifest);
    logger.info({ tag: 'AGENT:APPLY:SURFACE_DIFF', userId: req.user.id, changeSetId: req.params.id, surfaceSummary }, 'What actually changed between before/after DB snapshots (empty arrays everywhere = nothing visibly changed)');
    await client.query(
      "UPDATE ai_change_sets SET status = 'applied', applied_at = NOW(), before_revision_id = $3, after_revision_id = $4, preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2",
      [JSON.stringify({
        applied,
        rollbackSnapshot: compactRevisionReference(beforeRevision),
        afterSnapshot: compactRevisionReference(afterRevision),
        surfaceManifest,
        surfaceSummary,
      }), req.params.id, beforeRevision.id, afterRevision.id]
    );
    await client.query('COMMIT');
    committed = true;
    logger.info({ tag: 'AGENT:APPLY:COMMITTED', userId: req.user.id, changeSetId: req.params.id }, 'Transaction committed — portfolio_settings/projects rows are now updated in the database');
    await invalidatePublicPortfolioCache();
    logger.info({ tag: 'AGENT:APPLY:CACHE_INVALIDATED', userId: req.user.id, changeSetId: req.params.id }, 'Public portfolio cache invalidation requested (no-op if Redis is not configured)');

    liveVerification = await runLiveVerificationForUser(req.user.id, `change-set-${req.params.id}-live`);
    logger.info({ tag: 'AGENT:APPLY:LIVE_VERIFICATION', userId: req.user.id, changeSetId: req.params.id, status: liveVerification.status, errors: liveVerification.errors || [] }, 'Live route verification result (hits the real public portfolio route after commit)');
    if (liveVerification.status === 'skipped') {
      logger.info({ tag: 'AGENT:APPLY:LIVE_VERIFICATION_SKIPPED_OK', userId: req.user.id, changeSetId: req.params.id }, 'Live verification was skipped (portfolio is private) — treating as acceptable, NOT rolling back.');
    }

    await query(
      "UPDATE ai_change_sets SET preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND user_id = $3",
      [JSON.stringify({ liveVerification }), req.params.id, req.user.id]
    ).catch((error) => {
      console.warn('Live route verification save failed:', error.message);
    });

    if (liveVerification.status !== 'passed' && liveVerification.status !== 'skipped') {
      logger.warn({ tag: 'AGENT:APPLY:ROLLING_BACK_LIVE_FAILED', userId: req.user.id, changeSetId: req.params.id, liveVerification }, 'Live verification failed after commit — auto-reverting applied changes');
      await client.query('BEGIN');
      await restoreWebsiteSnapshot(client, req.user.id, rollbackSnapshot);
      await client.query(
        "UPDATE ai_change_sets SET status = 'rolled_back_live_failed', preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2",
        [JSON.stringify({
          liveVerification,
          rollbackApplied: true,
          rollbackReason: 'Live route verification failed immediately after apply.',
          rolledBackAt: new Date().toISOString(),
        }), req.params.id]
      );
      await client.query('COMMIT');
      await invalidatePublicPortfolioCache();
      const updatedChangeSet = await safeLoadChangeSetForResponse(req.params.id, req.user.id);
      return res.status(422).json({
        status: 'rolled_back_live_failed',
        message: 'The AI bundle was applied, failed live verification, and was automatically rolled back.',
        applied,
        rollbackApplied: true,
        rollbackReason: 'Live route verification failed immediately after apply.',
        liveVerification,
        changeSet: updatedChangeSet,
      });
    }

    const updatedChangeSet = await safeLoadChangeSetForResponse(req.params.id, req.user.id);
    res.json({
      status: 'applied',
      message: 'Change set applied.',
      applied,
      liveVerification,
      rollbackApplied: false,
      changeSet: updatedChangeSet,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (committed) {
      console.warn('Post-apply live route verification error:', error.message);
      const skippedLiveVerification = {
        status: 'skipped',
        mode: 'live-route',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        checks: [],
        warnings: ['Live route verification could not complete after apply. Open the portfolio preview to inspect manually.'],
        errors: [error.message],
      };
      await query(
        "UPDATE ai_change_sets SET preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND user_id = $3",
        [JSON.stringify({ liveVerification: skippedLiveVerification }), req.params.id, req.user.id]
      ).catch((saveError) => {
        console.warn('Skipped live route verification save failed:', saveError.message);
      });
      const updatedChangeSet = await safeLoadChangeSetForResponse(req.params.id, req.user.id);
      return res.json({
        status: 'applied',
        message: 'Change set applied, but live route verification could not complete.',
        applied,
        liveVerification: skippedLiveVerification,
        rollbackApplied: false,
        changeSet: updatedChangeSet,
      });
    }
    console.error('Apply agent change set error:', error);
    res.status(500).json({ error: 'Failed to apply change set: ' + error.message });
  } finally {
    client.release();
  }
};

router.post('/change-sets/:id/apply', requireAuth, userQuota('agent.apply', { windowMs: 60 * 60 * 1000, max: 20, message: 'Hourly AI apply limit reached.' }), userCostBudget('agent.apply', { windowMs: 24 * 60 * 60 * 1000, maxCost: 100, cost: 5, message: 'Daily AI apply budget reached.' }), async (req, res) => {
  const job = await createJob({
    userId: req.user.id,
    type: 'agent:apply',
    input: { userId: req.user.id, params: { id: req.params.id }, body: req.body || {} },
    idempotencyKey: `agent-apply:${req.params.id}`,
  });
  res.status(202).json({ job_id: job.id, status: job.status });
});

router.post('/change-sets/:id/discard', requireAuth, userQuota('agent.discard', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  const result = await query(
    "UPDATE ai_change_sets SET status = 'discarded' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id",
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Pending change set not found.' });
  res.json({ message: 'Change set discarded.' });
});

router.post('/change-sets/:id/verify-live', requireAuth, userQuota('agent.verify-live', { windowMs: 60 * 60 * 1000, max: 30, message: 'Hourly live verification limit reached.' }), userCostBudget('agent.verify-live', { windowMs: 24 * 60 * 60 * 1000, maxCost: 90, cost: 6, message: 'Daily live verification budget reached.' }), async (req, res) => {
  try {
    const changeSetResult = await query(
      'SELECT id, status FROM ai_change_sets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const changeSet = changeSetResult.rows[0];
    if (!changeSet) return res.status(404).json({ error: 'Change set not found.' });
    if (changeSet.status !== 'applied') {
      return res.status(409).json({ error: `Only applied change sets can be live-verified. This one is ${changeSet.status}.` });
    }

    const liveVerification = await runLiveVerificationForUser(req.user.id, `change-set-${req.params.id}-rerun`);
    await query(
      "UPDATE ai_change_sets SET preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND user_id = $3",
      [JSON.stringify({ liveVerification }), req.params.id, req.user.id]
    );
    res.json({ message: 'Live route verification updated.', liveVerification });
  } catch (error) {
    console.error('Live route verification error:', error);
    res.status(500).json({ error: 'Failed to verify live routes: ' + error.message });
  }
});

router.post('/change-sets/:id/remove', requireAuth, userQuota('agent.remove', { windowMs: 60 * 60 * 1000, max: 60 }), async (req, res) => {
  const mode = ['visual', 'sections', 'code'].includes(req.body?.mode) ? req.body.mode : 'visual';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changeSetResult = await client.query(
      'SELECT * FROM ai_change_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    const changeSet = changeSetResult.rows[0];
    if (!changeSet) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Change set not found.' });
    }
    if (changeSet.status !== 'applied') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Only applied change sets can be removed. This one is ${changeSet.status}.` });
    }

    const preview = parseJson(changeSet.preview, {});
    const manifest = preview.surfaceManifest;
    if (!manifest?.version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This change set does not have agent-owned surface metadata. Use full revert instead.' });
    }

    const currentResult = await client.query('SELECT * FROM portfolio_settings WHERE user_id = $1', [req.user.id]);
    const current = currentResult.rows[0] || {};
    const warnings = detectManifestOverwriteWarnings(current, manifest, mode);
    const nextSettings = buildSettingsFromManifestBefore(current, manifest, mode);
    await writePortfolioSettings(client, req.user.id, nextSettings);

    const removal = {
      mode,
      removedAt: new Date().toISOString(),
      warnings,
      surfaceSummary: summarizeSurfaceManifest(manifest),
    };
    await client.query(
      `UPDATE ai_change_sets
          SET status = CASE WHEN $1 = 'visual' THEN 'removed' ELSE status END,
              preview = COALESCE(preview, '{}'::jsonb) || $2::jsonb
        WHERE id = $3`,
      [mode, JSON.stringify({ lastRemoval: removal, removals: [...(Array.isArray(preview.removals) ? preview.removals : []), removal] }), req.params.id]
    );
    await client.query('COMMIT');
    await invalidatePublicPortfolioCache();
    res.json({
      message: mode === 'code'
        ? 'Generated code and effects from this AI bundle were removed.'
        : mode === 'sections'
          ? 'Generated sections from this AI bundle were removed.'
          : 'AI-owned visual changes from this bundle were removed.',
      mode,
      warnings,
      surfaceSummary: removal.surfaceSummary,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Remove agent change set surfaces error:', error);
    res.status(500).json({ error: 'Failed to remove AI changes: ' + error.message });
  } finally {
    client.release();
  }
});

router.post('/change-sets/:id/revert', requireAuth, userQuota('agent.revert', { windowMs: 60 * 60 * 1000, max: 60 }), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changeSetResult = await client.query(
      'SELECT * FROM ai_change_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    const changeSet = changeSetResult.rows[0];
    if (!changeSet) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Change set not found.' });
    }
    if (changeSet.status !== 'applied') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Only applied change sets can be reverted. This one is ${changeSet.status}.` });
    }

    const preview = parseJson(changeSet.preview, {});
    const snapshotReference = preview.rollbackSnapshot;
    if (!snapshotReference) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This change set does not have a rollback snapshot.' });
    }

    const snapshot = await resolveSnapshotReference(client, req.user.id, snapshotReference);
    if (!snapshot) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'The rollback revision has expired.' });
    }
    await restoreWebsiteSnapshot(client, req.user.id, snapshot);
    await client.query(
      "UPDATE ai_change_sets SET status = 'reverted', preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb WHERE id = $2",
      [JSON.stringify({ revertedAt: new Date().toISOString() }), req.params.id]
    );
    await client.query('COMMIT');
    await invalidatePublicPortfolioCache();
    res.json({ message: 'AI Editor change reverted.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Revert agent change set error:', error);
    res.status(500).json({ error: 'Failed to revert change set: ' + error.message });
  } finally {
    client.release();
  }
});

router.post('/reset', requireAuth, userQuota('agent.reset', { windowMs: 60 * 60 * 1000, max: 30 }), async (req, res) => {
  const mode = req.body?.mode === 'all' ? 'all' : 'visual';
  const clearMemory = req.body?.clearMemory === true || mode === 'all';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changeSets = await loadAppliedChangeSetsWithSnapshots(client, req.user.id);
    const { changeSet, snapshot: snapshotReference } = findEarliestRollbackSnapshot(changeSets);
    const snapshot = await resolveSnapshotReference(client, req.user.id, snapshotReference);
    const resetAt = new Date().toISOString();

    if (mode === 'all') {
      if (!snapshot) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No applied AI change with a rollback snapshot was found.' });
      }
      await restoreWebsiteSnapshot(client, req.user.id, snapshot);
      await client.query(
        `UPDATE ai_change_sets
            SET status = 'reverted',
                preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb
          WHERE user_id = $2 AND status = 'applied'`,
        [JSON.stringify({ resetAt, resetMode: mode, resetFromChangeSetId: changeSet.id }), req.user.id]
      );
    } else {
      const currentResult = await client.query('SELECT * FROM portfolio_settings WHERE user_id = $1', [req.user.id]);
      const current = currentResult.rows[0] || {};
      const nextSettings = clearAgentDesignLayer(current);
      await writePortfolioSettings(client, req.user.id, nextSettings);
      await client.query(
        `UPDATE ai_change_sets
            SET preview = COALESCE(preview, '{}'::jsonb) || $1::jsonb
          WHERE user_id = $2 AND status = 'applied'`,
        [JSON.stringify({ visualResetAt: resetAt, visualResetFromChangeSetId: changeSet?.id || null }), req.user.id]
      );
    }

    if (clearMemory) {
      await client.query('DELETE FROM ai_memories WHERE user_id = $1', [req.user.id]);
    }

    await client.query('COMMIT');
    await invalidatePublicPortfolioCache();
    res.json({
      message: mode === 'all'
        ? 'All applied AI changes were reverted to the earliest rollback snapshot.'
        : 'AI visual design settings were reset.',
      mode,
      clearMemory,
      resetAt,
      resetFromChangeSetId: changeSet?.id || null,
      usedSnapshot: Boolean(snapshot),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reset agent changes error:', error);
    res.status(500).json({ error: 'Failed to reset AI changes: ' + error.message });
  } finally {
    client.release();
  }
});

router.get('/memory', requireAuth, async (req, res) => {
  const result = await query(
    'SELECT id, kind, content, metadata, created_at, updated_at FROM ai_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
    [req.user.id]
  );
  res.json({ memories: result.rows });
});

router.delete('/memory/:id', requireAuth, userQuota('agent.memory.delete', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  const result = await query('DELETE FROM ai_memories WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Memory not found.' });
  res.json({ message: 'Memory deleted.' });
});

router.shouldBlockApplyForBrowserVerification = shouldBlockApplyForBrowserVerification;
router.buildVisualResetSettings = buildVisualResetSettings;
router.findEarliestRollbackSnapshot = findEarliestRollbackSnapshot;
router.buildAgentSurfaceManifest = buildAgentSurfaceManifest;
router.buildSettingsFromManifestBefore = buildSettingsFromManifestBefore;
router.removeMarkedBlockById = removeMarkedBlockById;
router.isProviderSizeError = isProviderSizeError;
router.isProviderTimeoutError = isProviderTimeoutError;
router.buildProviderErrorResponse = buildProviderErrorResponse;
router.shouldDiscardFailedReviewBundle = shouldDiscardFailedReviewBundle;
router.normalizeParsedPublicSectionOrder = normalizeParsedPublicSectionOrder;
router.hasVisibleAgentChange = hasVisibleAgentChange;
router.buildEffectiveChangeErrors = buildEffectiveChangeErrors;

const invokeAgentHandler = async (handler, input) => {
  const userResult = await query('SELECT id, email, username, full_name, avatar_url FROM users WHERE id = $1', [input.userId]);
  if (!userResult.rows[0]) throw new Error('Agent user no longer exists.');
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (this.statusCode >= 400) {
          const error = new Error(payload?.error || 'Agent job failed.');
          error.statusCode = this.statusCode;
          error.payload = payload;
          reject(error);
        } else resolve(payload);
        return this;
      },
    };
    Promise.resolve(handler({ user: userResult.rows[0], body: input.body || {}, params: input.params || {} }, response)).catch(reject);
  });
};

router.runAgentChatJob = (input) => invokeAgentHandler(handleAgentChat, input);
router.runAgentApplyJob = (input) => invokeAgentHandler(handleAgentApply, input);

module.exports = router;
