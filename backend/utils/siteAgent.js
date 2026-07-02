const {
  parseAndMergeAiResponse,
  validateCustomization,
  VALID_ANIMATIONS,
  VALID_THEME_KEYS,
} = require('./aiCustomizer');
const { sanitizeCustomCss } = require('./contentSecurity');
const {
  buildAgentDesignMeta,
  combineLayeredCss,
  getLayeredCss,
  normalizeAgentDesignMeta,
  parseJsonObject,
} = require('./layeredCustomization');
const logger = require('./logger');

const DEFAULT_SECTION_ORDER = ['header', 'projects', 'contact'];
const DEFAULT_ANIMATIONS = { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' };
const NATIVE_SECTION_IDS = new Set(['header', 'projects', 'contact', 'education', 'endorsements']);

const PROJECTFOLIO_SURFACE_INVENTORY = [
  {
    id: 'header',
    label: 'Profile header',
    stableClasses: ['.pf-header', '.pf-avatar', '.pf-name', '.pf-headline', '.pf-bio', '.pf-skills', '.pf-skill-tag'],
  },
  {
    id: 'projects',
    label: 'Project grid',
    stableClasses: ['.pf-projects-section', '.pf-projects', '.pf-project-card', '.pf-project-media', '.pf-project-title', '.pf-project-tagline', '.pf-tech-tag'],
  },
  {
    id: 'education',
    label: 'Education & Credentials',
    stableClasses: ['.pf-education', '.pf-credentials-list', '.pf-credential-card'],
  },
  {
    id: 'endorsements',
    label: 'Endorsements',
    stableClasses: ['.pf-endorsements', '.pf-endorsements-list', '.pf-endorsement-card', '.pf-endorsement-quote'],
  },
  {
    id: 'contact',
    label: 'Contact',
    stableClasses: ['.pf-contact', '.pf-contact-card', '.pf-contact-link'],
  },
  {
    id: 'custom',
    label: 'Generated native builder sections',
    stableClasses: ['.pf-custom-section', '.pf-hero-card', '.pf-feature-card', '.pf-proof-card', '.pf-case-card', '.pf-process-step', '.pf-stat-card', '.pf-timeline-item', '.pf-cta-card'],
  },
];

const SETTINGS_PATCH_KEYS = new Set([
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
  'site_sections',
  'design_system',
  'interactions',
  'preferred_ai_model',
]);

const PROFILE_PATCH_KEYS = new Set([
  'full_name',
  'headline',
  'bio',
  'location',
  'website',
  'linkedin_url',
  'github_url',
  'skills',
  'username',
  'phone',
  'contact_email',
  'identity_mode',
]);

const PROJECT_PATCH_KEYS = new Set([
  'title',
  'tagline',
  'description',
  'project_type',
  'technologies',
  'cover_image_url',
  'github_url',
  'live_url',
  'start_date',
  'end_date',
  'collaborators',
  'status',
  'is_featured',
]);

const SECTION_TYPES = new Set([
  'hero',
  'text',
  'featureGrid',
  'proofWall',
  'caseStudy',
  'process',
  'stats',
  'timeline',
  'gallery',
  'testimonial',
  'cta',
  'linkList',
  'featuredProjects',
  'comparison',
  'faq',
  'skillMatrix',
  'mediaFeature',
]);

const SECTION_VARIANTS = {
  hero: new Set(['split', 'centered', 'product', 'editorial', 'profile']),
  text: new Set(['spotlight', 'editorial', 'split', 'note']),
  featureGrid: new Set(['cards', 'bento', 'iconRail', 'processGrid']),
  proofWall: new Set(['metricCards', 'logoWall', 'evidenceGrid', 'signalStack']),
  caseStudy: new Set(['stacked', 'split', 'timeline', 'spotlight']),
  process: new Set(['steps', 'rail', 'timeline', 'loop']),
  stats: new Set(['compactRow', 'editorialNumbers', 'proofWall']),
  timeline: new Set(['vertical', 'roadmap', 'compact']),
  gallery: new Set(['masonry', 'spotlight', 'grid']),
  testimonial: new Set(['quoteCard', 'quoteWall']),
  cta: new Set(['banner', 'split', 'stickyFooter']),
  linkList: new Set(['pills', 'resourceGrid']),
  featuredProjects: new Set(['grid', 'caseStudyList', 'horizontalScroll']),
  comparison: new Set(['columns', 'beforeAfter', 'matrix']),
  faq: new Set(['accordion', 'cards']),
  skillMatrix: new Set(['clusters', 'radar', 'toolbox']),
  mediaFeature: new Set(['split', 'poster', 'showcase']),
};

const INTERACTION_TYPES = new Set([
  'scrollReveal',
  'cardTilt',
  'cursorGlow',
  'ambientParticles',
  'navAutoHide',
  'microInteractions',
  'gradientMesh',
  'pageTransition',
]);
const INTERACTION_TARGETS = new Set([
  '.pf-nav',
  '.pf-section',
  '.pf-header',
  '.pf-project-card',
  '.pf-feature-card',
  '.pf-proof-card',
  '.pf-stat-card',
  '.pf-skill-tag',
  '.pf-tech-tag',
  '.pf-contact-link',
  '.pf-contact-card',
  '.pf-hero-action',
  '.pf-hero-card',
  '.pf-cta-link',
  '.pf-cta-card',
  '.pf-credential-card',
  '.pf-endorsement-card',
  '.pf-case-card',
  '.pf-process-step',
  '.pf-comparison-card',
  '.pf-faq-item',
  '.pf-skill-matrix-card',
  '.pf-media-feature',
  '.pf-project-block-card',
]);

const ACTION_TYPES = new Set([
  'settings.patch',
  'profile.patch',
  'project.create',
  'project.patch',
  'project.reorder',
  'block.create',
  'block.patch',
  'block.delete',
  'block.reorder',
  'customization.patch',
  'memory.upsert',
]);

const GENERIC_AGENT_PHRASES = [
  'clear positioning',
  'guided proof',
  'polished interaction',
  'proof at a glance',
  'how the work comes together',
  'built for clarity',
  'portfolio online',
  'frames ',
  'turns projects into a story',
  'native projectfolio controls stay intact',
  'built around:',
  'prompt-specific bridge',
  'strongest existing projects',
  'make the existing work feel intentional',
  'without visual noise',
  'my approach combines',
  'raw honesty of brutalism',
  'premium craftsmanship',
  'i believe in creating',
  'digital experiences that are both striking and functional',
  'each project is an opportunity',
  'push boundaries while maintaining usability',
];

const INVENTED_PORTFOLIO_COPY_PATTERNS = [
  /\bmy approach combines\b/i,
  /\bi believe\b/i,
  /\beach project is an opportunity\b/i,
  /\bpush boundaries\b/i,
  /\bpremium craftsmanship\b/i,
  /\braw honesty of brutalism\b/i,
  /\bdigital experiences\b/i,
  /\bstriking and functional\b/i,
  /\bmy philosophy\b/i,
  /\bphilosophy\s*[:\-]/i,
];

const KNOWN_SELECTOR_PREFIXES = [
  '.pf-portfolio',
  '.pf-nav',
  '.pf-main',
  '.pf-section',
  '.pf-header',
  '.pf-avatar',
  '.pf-name',
  '.pf-headline',
  '.pf-bio',
  '.pf-skills',
  '.pf-skill-tag',
  '.pf-projects',
  '.pf-project-card',
  '.pf-project-media',
  '.pf-project-title',
  '.pf-project-tagline',
  '.pf-tech-tag',
  '.pf-contact',
  '.pf-contact-card',
  '.pf-hero-card',
  '.pf-hero-actions',
  '.pf-proof-wall',
  '.pf-proof-card',
  '.pf-case-study',
  '.pf-case-card',
  '.pf-process-list',
  '.pf-process-step',
  '.pf-comparison-grid',
  '.pf-comparison-card',
  '.pf-faq-list',
  '.pf-faq-item',
  '.pf-skill-matrix',
  '.pf-skill-matrix-card',
  '.pf-media-feature',
  '.pf-media-visual',
  '.pf-education',
  '.pf-credential-card',
  '.pf-custom-section',
  '.pf-feature-card',
  '.pf-stat-card',
  '.pf-timeline-item',
  '.pf-cta-card',
  '.pf-project-page',
  '.pf-project-header',
  '.pf-project-title',
  '.pf-project-meta',
  '.pf-project-block-card',
];

const promptRequestsPortfolioWideVisualChange = (prompt = '') => {
  const text = String(prompt || '').toLowerCase();
  const has = (pattern) => pattern.test(text);
  return has(/\b(portfolio|site|website|webpage|page)\b/)
    && has(/\b(corporate|enterprise|professional|executive|premium|distinct\s+color\s+scheme|color\s+scheme|look|style|theme|aesthetic|visual|brand|branding|background|project\s+cards?|cards?|layout)\b/)
    && has(/\b(corporate|enterprise|professional|executive|premium|distinct|color|background|project\s+cards?|cards?|header|section|contact|scroll|animation|animate|motion|transition|zoom|hover|open|close)\b/);
};

const classifyAgentIntent = (prompt = '') => {
  const text = String(prompt || '').toLowerCase();
  const has = (pattern) => pattern.test(text);

  if (has(/\b(remove|delete|undo|revert|reset|clear|disable|turn off|take off|get rid of)\b/)
    && has(/\b(agent|ai|change|changes|theme|style|design|section|effect|particle|cursor|animation|code|css|javascript|js|bundle)\b/)) {
    return {
      id: 'removeOrRevert',
      label: 'Remove or revert agent change',
      sectionBudget: 0,
      allowNewSections: false,
      allowSectionOrder: false,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: true,
      allowInteractions: true,
      allowFullRedesign: false,
    };
  }

  const explicitRedesign = has(/\b(full\s+)?(redesign|re[- ]?design|rebuild|transform|revamp|overhaul|makeover|new\s+look|entire\s+site|whole\s+site|whole\s+website|full\s+site)\b/)
    || has(/\b(make|turn)\s+(my\s+)?(portfolio|site|website)\s+(feel|look|into|like)\b/)
    || has(/\b(make|turn|transform)\s+(this|it|the\s+portfolio|the\s+site|the\s+website|my\s+portfolio|my\s+site|my\s+website)\s+(into|feel|look|like)\b/)
    || has(/\bpremium\s+(portfolio|site|website)\b/)
    || has(/\bstronger\s+project\s+storytelling\b/)
    || (has(/\b(portfolio|site|website|webpage|page)\b/) && has(/\b(editorial|case study|case-study|museum|terminal|workspace|studio|gallery|saas|product launch|classical|brutalist|minimal|creative)\b/))
    || has(/\b(landing page|product launch|cinematic|theme|aesthetic|visual identity|ui\/ux|website\s+theme)\b/);
  if (explicitRedesign) {
    return {
      id: 'fullRedesign',
      label: 'Full site redesign',
      sectionBudget: 3,
      allowNewSections: true,
      allowSectionOrder: true,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: true,
      allowInteractions: true,
      allowFullRedesign: true,
    };
  }

  if (promptRequestsPortfolioWideVisualChange(prompt)) {
    return {
      id: 'siteStyle',
      label: 'Portfolio-wide visual system',
      sectionBudget: 0,
      allowNewSections: false,
      allowSectionOrder: false,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: true,
      allowInteractions: true,
      allowFullRedesign: false,
    };
  }

  if (has(/\b(add|create|include|insert|new)\b/) && has(/\b(section|element|banner|cta|timeline|gallery|stats?|testimonial|links?|card|panel|block)\b/)) {
    return {
      id: 'sectionAdd',
      label: 'Add one site element',
      sectionBudget: 1,
      allowNewSections: true,
      allowSectionOrder: true,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: true,
      allowInteractions: true,
      allowFullRedesign: false,
    };
  }

  if (has(/\b(particle|particles|cursor|glow|animation|animate|motion|hover|scroll|reveal|interactive|effect|javascript|js)\b/)) {
    return {
      id: 'codeEffect',
      label: 'Targeted visual effect',
      sectionBudget: 0,
      allowNewSections: false,
      allowSectionOrder: false,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: false,
      allowInteractions: true,
      allowFullRedesign: false,
    };
  }

  if (has(/\b(color|background|font|spacing|rounded|radius|shadow|theme|style|card|cards|button|layout|dark|light|minimal|clean|bold)\b/)) {
    return {
      id: 'styleTweak',
      label: 'Targeted style tweak',
      sectionBudget: 0,
      allowNewSections: false,
      allowSectionOrder: false,
      allowProfilePatch: false,
      allowProjectPatch: false,
      allowCustomCode: true,
      allowDesignSystem: true,
      allowInteractions: true,
      allowFullRedesign: false,
    };
  }

  if (has(/\b(headline|bio|about|copy|text|skills?|project|tagline|description|credential|education)\b/)) {
    return {
      id: 'contentEdit',
      label: 'Content edit',
      sectionBudget: 0,
      allowNewSections: false,
      allowSectionOrder: false,
      allowProfilePatch: true,
      allowProjectPatch: true,
      allowCustomCode: false,
      allowDesignSystem: false,
      allowInteractions: false,
      allowFullRedesign: false,
    };
  }

  return {
    id: 'smallEdit',
    label: 'Small edit',
    sectionBudget: 0,
    allowNewSections: false,
    allowSectionOrder: false,
    allowProfilePatch: false,
    allowProjectPatch: false,
    allowCustomCode: true,
    allowDesignSystem: false,
    allowInteractions: true,
    allowFullRedesign: false,
  };
};

const toTextArrayLiteral = (arr) => {
  if (!Array.isArray(arr)) return null;
  if (arr.length === 0) return '{}';
  return `{${arr.map((item) => `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
};

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return Array.isArray(value) ? value : { ...value };
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const sanitizeId = (value, fallback = 'section') => {
  const id = String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return id || fallback;
};

const sanitizeVariant = (type, value) => {
  const allowed = SECTION_VARIANTS[type];
  if (!allowed) return '';
  const raw = String(value || '').trim();
  if (allowed.has(raw)) return raw;
  const normalized = sanitizeId(raw, '');
  return [...allowed].find((variant) => sanitizeId(variant) === normalized) || '';
};

const sanitizeObjectKey = (value, fallback = 'token') => {
  const key = String(value || fallback).trim().replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 80);
  return key || fallback;
};

const sanitizeSectionLayout = (layout = {}) => {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return {};
  const clean = {};
  const allowedDensity = new Set(['compact', 'comfortable', 'spacious']);
  const allowedEmphasis = new Set(['low', 'medium', 'high']);
  const allowedAlign = new Set(['left', 'center', 'split']);
  const columns = Number(layout.columns);
  if (Number.isInteger(columns) && columns >= 1 && columns <= 4) clean.columns = columns;
  if (allowedDensity.has(layout.density)) clean.density = layout.density;
  if (allowedEmphasis.has(layout.emphasis)) clean.emphasis = layout.emphasis;
  if (allowedAlign.has(layout.align)) clean.align = layout.align;
  return clean;
};

const sanitizeSectionContentValue = (value, depth = 0) => {
  if (value == null) return undefined;
  if (typeof value === 'string') return truncateText(value, depth === 0 ? 1200 : 360);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
      .map((item) => sanitizeSectionContentValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    if (depth > 3) return truncateText(JSON.stringify(value), 360);
    return Object.entries(value).slice(0, 24).reduce((acc, [key, val]) => {
      const cleanKey = sanitizeObjectKey(key, 'field');
      const cleanValue = sanitizeSectionContentValue(val, depth + 1);
      if (cleanValue !== undefined) acc[cleanKey] = cleanValue;
      return acc;
    }, {});
  }
  return truncateText(String(value), 240);
};

const sanitizeSectionContent = (content = {}) => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return {};
  return sanitizeSectionContentValue(content, 0) || {};
};

const sanitizeInteractions = (interactions = []) => {
  if (!Array.isArray(interactions)) return [];
  return interactions
    .map((interaction) => {
      if (!interaction || typeof interaction !== 'object' || Array.isArray(interaction)) return null;
      const type = String(interaction.type || '');
      if (!INTERACTION_TYPES.has(type)) return null;
      const target = INTERACTION_TARGETS.has(interaction.target) ? interaction.target : (
        type === 'cursorGlow' || type === 'ambientParticles' || type === 'gradientMesh' || type === 'pageTransition'
          ? '.pf-section'
          : '.pf-project-card'
      );
      const clean = { type, target };
      if (type === 'navAutoHide') {
        clean.target = '.pf-nav';
        clean.threshold = Number.isFinite(Number(interaction.threshold))
          ? Math.max(8, Math.min(180, Math.round(Number(interaction.threshold))))
          : 24;
      }
      if (type === 'scrollReveal') {
        clean.effect = ['fadeUp', 'slideIn', 'zoomIn', 'blurIn'].includes(interaction.effect) ? interaction.effect : 'fadeUp';
        const stagger = Number(interaction.stagger);
        const duration = Number(interaction.duration);
        clean.stagger = Number.isFinite(stagger) ? Math.max(0, Math.min(240, Math.round(stagger))) : 60;
        clean.duration = Number.isFinite(duration) ? Math.max(180, Math.min(900, Math.round(duration))) : 560;
      }
      if (type === 'cardTilt') {
        clean.strength = ['subtle', 'medium', 'strong'].includes(interaction.strength) ? interaction.strength : 'subtle';
      }
      if (type === 'microInteractions') {
        clean.effect = ['lift', 'scale', 'glow', 'invert'].includes(interaction.effect) ? interaction.effect : 'lift';
      }
      if (type === 'cursorGlow') {
        const size = Number(interaction.size);
        const opacity = Number(interaction.opacity);
        clean.size = Number.isFinite(size) ? Math.max(80, Math.min(360, Math.round(size))) : 180;
        clean.opacity = Number.isFinite(opacity) ? Math.max(0.05, Math.min(0.35, opacity)) : 0.16;
      }
      if (type === 'ambientParticles') {
        clean.density = ['low', 'medium', 'high'].includes(interaction.density) ? interaction.density : 'low';
      }
      if (type === 'gradientMesh') {
        const opacity = Number(interaction.opacity);
        clean.opacity = Number.isFinite(opacity) ? Math.max(0.08, Math.min(0.45, opacity)) : 0.28;
      }
      if (type === 'pageTransition') {
        clean.effect = ['fade', 'slideUp', 'scale'].includes(interaction.effect) ? interaction.effect : 'fade';
        const duration = Number(interaction.duration);
        clean.duration = Number.isFinite(duration) ? Math.max(120, Math.min(450, Math.round(duration))) : 240;
      }
      return clean;
    })
    .filter(Boolean)
    .slice(0, 4);
};

const sanitizeSiteSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section, index) => {
      if (!section || typeof section !== 'object') return null;
      const type = String(section.type || '');
      if (!SECTION_TYPES.has(type)) return null;
      const id = sanitizeId(section.id || `${type}-${index + 1}`);
      return {
        id,
        type,
        variant: sanitizeVariant(type, section.variant),
        layout: sanitizeSectionLayout(section.layout),
        title: typeof section.title === 'string' ? section.title.slice(0, 160) : '',
        subtitle: typeof section.subtitle === 'string' ? section.subtitle.slice(0, 260) : '',
        content: sanitizeSectionContent(section.content),
        enabled: section.enabled !== false,
      };
    })
    .filter(Boolean);
};

const truncateText = (value, limit = 240) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
};

const toStringArray = (value, limit = 8, itemLimit = 120) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateText(String(item || ''), itemLimit))
    .filter(Boolean)
    .slice(0, limit);
};

const sanitizeDesignBrief = (brief = {}) => {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return null;
  const clean = {
    goal: truncateText(brief.goal, 280),
    audience: truncateText(brief.audience, 220),
    tone: truncateText(brief.tone, 220),
    styleDirection: sanitizeId(brief.styleDirection || brief.style || 'custom', 'custom'),
    constraints: toStringArray(brief.constraints, 8, 140),
  };
  return Object.values(clean).some((value) => (Array.isArray(value) ? value.length : Boolean(value))) ? clean : null;
};

const sanitizeSitePlan = (plan = {}) => {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const sections = Array.isArray(plan.sections)
    ? plan.sections.map((section, index) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
      return {
        id: sanitizeId(section.id || `planned-section-${index + 1}`),
        role: truncateText(section.role, 120),
        type: truncateText(section.type, 80),
        layoutIntent: truncateText(section.layoutIntent || section.intent, 220),
      };
    }).filter(Boolean).slice(0, 10)
    : [];
  const clean = {
    sections,
    primaryCta: truncateText(plan.primaryCta, 140),
    contentHierarchy: toStringArray(plan.contentHierarchy, 10, 80),
  };
  return clean.sections.length || clean.primaryCta || clean.contentHierarchy.length ? clean : null;
};

const sanitizeDesignSystem = (system = {}) => {
  if (!system || typeof system !== 'object' || Array.isArray(system)) return null;
  const pickObject = (value, limit = 24) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.entries(value).slice(0, limit).reduce((acc, [key, val]) => {
      const cleanKey = sanitizeObjectKey(key, 'token');
      if (val && typeof val === 'object') {
        acc[cleanKey] = truncateText(JSON.stringify(val), 260);
      } else {
        acc[cleanKey] = truncateText(String(val ?? ''), 180);
      }
      return acc;
    }, {});
  };
  const clean = {
    direction: sanitizeId(system.direction || system.styleDirection || 'custom', 'custom'),
    tokens: pickObject(system.tokens),
    typography: pickObject(system.typography, 12),
    componentVariants: pickObject(system.componentVariants || system.components, 16),
    motion: pickObject(system.motion, 12),
  };
  const hasValues = Object.keys(clean.tokens).length
    || Object.keys(clean.typography).length
    || Object.keys(clean.componentVariants).length
    || Object.keys(clean.motion).length
    || clean.direction !== 'custom';
  return hasValues ? clean : null;
};

const sanitizeAgentPlan = (input = {}) => {
  const designBrief = sanitizeDesignBrief(input.designBrief);
  const sitePlan = sanitizeSitePlan(input.sitePlan);
  const designSystem = sanitizeDesignSystem(input.designSystem);
  const plan = {};
  if (designBrief) plan.designBrief = designBrief;
  if (sitePlan) plan.sitePlan = sitePlan;
  if (designSystem) plan.designSystem = designSystem;
  return Object.keys(plan).length ? plan : null;
};

const uniqueMessages = (messages = []) => [...new Set(messages.filter(Boolean))];

const contentLength = (value) => String(value || '').replace(/\s+/g, ' ').trim().length;

const hasUsefulContentGuidance = (prompt = '') => {
  const text = String(prompt || '').toLowerCase();
  const detailSignals = [
    /\bfocus on\b/,
    /\bmention\b/,
    /\binclude\b/,
    /\bemphasize\b/,
    /\bhighlight\b/,
    /\btalk about\b/,
    /\bwrite about\b/,
    /\bpoints?\b/,
    /\bthemes?\b/,
    /\bmetrics?\b/,
    /\bimpact\b/,
    /\bresults?\b/,
    /\bused\b/,
    /\bbuilt\b/,
    /\bcreated\b/,
    /\bdeveloped\b/,
    /\bdesigned\b/,
    /\bsolved\b/,
  ];
  return detailSignals.some((pattern) => pattern.test(text)) && contentLength(prompt) > 45;
};

const analyzeContentClarificationNeed = ({ prompt = '', context = {}, intent = classifyAgentIntent(prompt) } = {}) => {
  const text = String(prompt || '').toLowerCase();
  const asksForContent = /\b(storytelling|story|describe|description|copy|text|headline|bio|about|case stud(?:y|ies)|positioning|narrative|resume|recruiter|role|roles|hiring|premium portfolio)\b/.test(text);
  const asksForMostlyVisual = /\b(color|background|rounded|shadow|hover|particle|cursor|animation|spacing|font)\b/.test(text)
    && !/\b(storytelling|description|copy|bio|headline|case stud(?:y|ies)|role|roles|recruiter)\b/.test(text);

  if (/\b(visual changes only|visual-only|no custom copy|no extra copy|do not write copy|don't write copy|without changing copy|without adding copy)\b/.test(text)
    || /\bclarification answer\b/.test(text)) {
    return { shouldAsk: false, reasons: [] };
  }

  if (!asksForContent || asksForMostlyVisual || intent?.id === 'removeOrRevert') {
    return { shouldAsk: false, reasons: [] };
  }

  if (hasUsefulContentGuidance(prompt)) {
    return { shouldAsk: false, reasons: [] };
  }

  const user = context.user || {};
  const projects = Array.isArray(context.projects) ? context.projects : [];
  const publishedProjects = projects.filter((project) => project.status === 'published' || !project.status);
  const thinProfile = contentLength(user.headline) < 35 || contentLength(user.bio) < 120;
  const thinProjects = !publishedProjects.length || publishedProjects.some((project) => (
    contentLength(project.tagline) < 35
    || contentLength(project.description) < 160
  ));
  const thinBlocks = publishedProjects.every((project) => !Array.isArray(project.blocks) || project.blocks.length === 0);
  const needsSourceMaterial = thinProfile || thinProjects || thinBlocks;

  if (!needsSourceMaterial) return { shouldAsk: false, reasons: [] };

  const reasons = [];
  if (thinProfile) reasons.push('profile summary is thin');
  if (thinProjects) reasons.push('project descriptions are thin');
  if (thinBlocks) reasons.push('project detail blocks are limited');

  const clarification = buildAgentClarification({
    type: 'content_guidance',
    question: 'Should I write new portfolio copy, or keep this visual-only?',
    reason: `I do not want to invent polished-sounding filler because ${reasons.join(', ')}.`,
    options: [
      {
        id: 'visual_only',
        label: 'Visual only',
        description: 'Redesign the look and structure without adding or rewriting descriptive copy.',
        value: 'Clarification answer: Keep this visual changes only. Redesign the look and layout, but do not add new descriptive copy or invent portfolio facts.',
      },
      {
        id: 'existing_facts',
        label: 'Use current facts',
        description: 'Improve wording only where existing profile/project facts support it.',
        value: 'Clarification answer: You may improve concise wording using only the facts already in my profile and projects. Do not invent achievements, metrics, roles, or project details.',
      },
    ],
    customPlaceholder: 'Example: Target AI engineering recruiters. Emphasize Mart and automation work. Mention React, Node, Postgres, model routing, measurable outcomes, and a concise technical tone.',
  });

  return {
    shouldAsk: true,
    reply: clarification.reply,
    clarification,
    reasons,
    requestedFields: ['audience', 'projects', 'technologies', 'impact', 'tone'],
  };
};

const buildAgentClarification = ({
  type = 'clarification',
  question,
  reason = '',
  options = [],
  customPlaceholder = 'Type your own answer with the details you want the agent to use.',
} = {}) => {
  const cleanOptions = (Array.isArray(options) ? options : [])
    .map((option, index) => {
      if (!option || typeof option !== 'object') return null;
      const label = truncateText(option.label || option.title || `Option ${index + 1}`, 48);
      const description = truncateText(option.description || option.text || '', 150);
      const value = truncateText(option.value || option.prompt || `${label}${description ? `: ${description}` : ''}`, 600);
      if (!label || !value) return null;
      return {
        id: sanitizeId(option.id || `option-${index + 1}`),
        label,
        description,
        value,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  if (!question || cleanOptions.length < 2) return null;

  const clean = {
    type: truncateText(type, 60) || 'clarification',
    question: truncateText(question, 220),
    reason: truncateText(reason, 240),
    options: cleanOptions,
    allowCustom: true,
    customPlaceholder: truncateText(customPlaceholder, 260),
  };

  clean.reply = [
    clean.reason || null,
    clean.question,
    '',
    'Pick one option, or type your own answer:',
    ...clean.options.map((option, index) => `${index + 1}. ${option.label}${option.description ? ` - ${option.description}` : ''}`),
  ].filter(Boolean).join('\n');

  return clean;
};

const sanitizeAgentClarification = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input.clarification || input.needsClarification || input.needsInput || input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const shouldAsk = source.shouldAsk !== false && source.ask !== false;
  if (!shouldAsk) return null;
  return buildAgentClarification({
    type: source.type || 'clarification',
    question: source.question || source.prompt || source.title,
    reason: source.reason || source.context || '',
    options: source.options || source.choices || [],
    customPlaceholder: source.customPlaceholder || source.placeholder,
  });
};

const analyzeDesignClarificationNeed = ({ prompt = '', intent = classifyAgentIntent(prompt) } = {}) => {
  const text = String(prompt || '').toLowerCase();
  if (intent?.id === 'removeOrRevert') return { shouldAsk: false, reasons: [] };
  if (/\b(no questions|don't ask|do not ask|just do it|use your judgment)\b/.test(text)) return { shouldAsk: false, reasons: [] };

  const vagueDesignRequest = /\b(make|improve|upgrade|modernize|better|clean up|polish|professional|nice|cool)\b/.test(text)
    && /\b(site|website|portfolio|page|design|look|ui|ux|style)\b/.test(text);
  const hasSpecificDirection = /\b(neon|brutalist|neo-?brutalist|minimal|minimalist|dark|light|editorial|museum|cinematic|terminal|saas|product launch|gallery|glass|high contrast|warm|playful|luxury|academic|startup|recruiter|engineering|developer|motion|animation|gradient|typography|rainbow|prismatic|multicolor|multi-color|wild west|cowboy|desert|western|frontier)\b/.test(text)
    || text.length > 140;

  if (!vagueDesignRequest || hasSpecificDirection) return { shouldAsk: false, reasons: [] };

  const clarification = buildAgentClarification({
    type: 'design_direction',
    question: 'What direction should I take for this update?',
    reason: 'Your request is broad enough that a quick direction choice will make the bundle fit better.',
    options: [
      {
        id: 'recruiter_clean',
        label: 'Clean recruiter-facing',
        description: 'Sharper hierarchy, clearer projects, restrained styling, no invented copy.',
        value: 'Clarification answer: Make it clean and recruiter-facing. Improve hierarchy, spacing, project readability, and polish. Use only existing facts and avoid adding new copy unless it is clearly a label.',
      },
      {
        id: 'premium_dark',
        label: 'Premium dark',
        description: 'A polished dark visual system with tasteful depth and subtle motion.',
        value: 'Clarification answer: Use a premium dark visual direction with strong contrast, refined cards, subtle motion, and no invented personal/project claims.',
      },
      {
        id: 'editorial_story',
        label: 'Editorial case-study',
        description: 'Magazine-like layout that makes existing projects easier to scan and trust.',
        value: 'Clarification answer: Use an editorial case-study direction. Make projects feel more structured and readable using existing project facts only.',
      },
    ],
    customPlaceholder: 'Describe the audience, vibe, colors, examples, and anything the agent should avoid.',
  });

  return {
    shouldAsk: true,
    reply: clarification.reply,
    clarification,
    reasons: ['broad design request without a clear direction'],
  };
};

const analyzeAgentClarificationNeed = ({ prompt = '', context = {}, intent = classifyAgentIntent(prompt) } = {}) => {
  const content = analyzeContentClarificationNeed({ prompt, context, intent });
  if (content.shouldAsk) return content;
  return analyzeDesignClarificationNeed({ prompt, context, intent });
};

const normalizeHex = (value) => {
  const clean = String(value || '').trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) return clean.split('').map((char) => char + char).join('').toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return clean.toLowerCase();
  return null;
};

const relativeLuminance = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const channels = [0, 2, 4].map((start) => parseInt(normalized.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (a, b) => {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  if (lumA == null || lumB == null) return null;
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
};

const critiqueAgentBundle = ({ prompt = '', actions = [], designBrief, sitePlan, designSystem } = {}) => {
  const text = String(prompt || '').toLowerCase();
  const wantsBigDesign = /\b(redesign|design|site|website|theme|make it|transform|landing|ui|ux|creative|premium|modern|distinct|unique|beautiful|full)\b/.test(text);
  const settingsPatch = actions.find((action) => action.type === 'settings.patch')?.patch || {};
  const customizationPatch = actions.find((action) => action.type === 'customization.patch')?.patch || {};
  const cssBlocks = Array.isArray(customizationPatch.cssBlocks) ? customizationPatch.cssBlocks : [];
  const cssText = cssBlocks.map((block) => block.css || '').join('\n');
  const siteSections = Array.isArray(settingsPatch.site_sections) ? settingsPatch.site_sections : [];
  const sectionOrder = Array.isArray(settingsPatch.section_order) ? settingsPatch.section_order : [];
  const interactions = Array.isArray(settingsPatch.interactions) ? settingsPatch.interactions : [];
  const animationsPatch = customizationPatch.animationsPatch || {};
  const tokens = designSystem?.tokens || settingsPatch.design_system?.tokens || {};
  const hierarchy = Array.isArray(sitePlan?.contentHierarchy) ? sitePlan.contentHierarchy : [];
  const notes = [];
  const warnings = [];

  if (wantsBigDesign) {
    if (!designBrief) warnings.push('Large redesign request has no design brief; the bundle may feel less intentional.');
    if (!sitePlan) warnings.push('Large redesign request has no site plan; section hierarchy may be weaker.');
    if (!designSystem) warnings.push('Large redesign request has no design system; visual style may rely too much on one-off CSS.');
    if (!siteSections.length) warnings.push('Large redesign request did not add structured custom sections.');
    if (!sectionOrder.length) warnings.push('Large redesign request did not propose a section order.');
    if (!cssText.includes('@media')) warnings.push('Generated redesign CSS has no mobile media rule.');
    if (!/\.pf-(header|project-card|section)/.test(cssText)) warnings.push('Generated CSS does not target core portfolio UI classes.');
    if (hierarchy.length && !hierarchy.some((item) => /\b(contact|cta|conversion|next)\b/i.test(item))) {
      warnings.push('Site plan hierarchy does not include a clear contact or conversion step.');
    }
  }

  const background = tokens.background;
  const textColor = tokens.text;
  const mutedColor = tokens.muted;
  const accentColor = tokens.accent || settingsPatch.accent_color;
  const textContrast = contrastRatio(textColor, background);
  const mutedContrast = contrastRatio(mutedColor, background);
  const accentContrast = contrastRatio(accentColor, background);
  if (textContrast != null) {
    if (textContrast < 4.5) warnings.push(`Design-system text contrast is low (${textContrast.toFixed(1)}:1). Use at least 4.5:1 for body text.`);
    else notes.push(`Text contrast passes (${textContrast.toFixed(1)}:1).`);
  }
  if (mutedContrast != null && mutedContrast < 3) {
    warnings.push(`Muted text contrast is low (${mutedContrast.toFixed(1)}:1).`);
  }
  if (accentContrast != null && accentContrast < 3) {
    warnings.push(`Accent contrast against the page background is low (${accentContrast.toFixed(1)}:1).`);
  }

  if (interactions.length > 3) warnings.push('This bundle uses several interaction effects; preview carefully to avoid a distracting page.');
  if (promptRequestsMotion(prompt) && !interactions.length && !Object.keys(animationsPatch).length) {
    warnings.push('Motion was requested, but the bundle does not use native interaction recipes or animation settings.');
  }
  if (interactions.some((interaction) => interaction.type === 'ambientParticles')
    && interactions.some((interaction) => interaction.type === 'cursorGlow')) {
    notes.push('Ambient and cursor effects use native recipes with reduced-motion safeguards.');
  }

  if (siteSections.length >= 2) notes.push(`Adds ${siteSections.length} structured section${siteSections.length === 1 ? '' : 's'} beyond raw code.`);
  if (designSystem) notes.push('Includes a design-system plan for visual direction, tokens, and component variants.');
  if (cssText.includes('@media')) notes.push('Includes responsive CSS rules for smaller screens.');
  if (customizationPatch.themeOverridesPatch) notes.push('Uses theme overrides before relying only on raw CSS.');
  if (customizationPatch.animationsPatch) notes.push('Uses native animation settings for predictable motion.');
  if (interactions.length) notes.push(`Uses ${interactions.length} native interaction recipe${interactions.length === 1 ? '' : 's'} instead of raw JavaScript.`);

  return {
    status: warnings.length ? 'needs_review' : 'passed',
    warnings: uniqueMessages(warnings),
    notes: uniqueMessages(notes),
  };
};

const sectionText = (section = {}) => [
  section.id,
  section.title,
  section.subtitle,
  JSON.stringify(section.content || {}),
].join(' ').toLowerCase();

const containsGenericAgentCopy = (section = {}) => {
  const text = sectionText(section);
  return GENERIC_AGENT_PHRASES.some((phrase) => text.includes(phrase));
};

const containsInventedPortfolioCopy = (section = {}, prompt = '') => {
  const text = sectionText(section);
  const promptText = String(prompt || '').toLowerCase();
  return INVENTED_PORTFOLIO_COPY_PATTERNS.some((pattern) => {
    if (pattern.source.includes('philosophy') && promptText.includes('philosophy')) return false;
    return pattern.test(text);
  });
};

const DIRECTION_PROMPT_SIGNALS = {
  'neon-lab': ['neon', 'cyber', 'cyberpunk', 'sci-fi', 'holographic', 'glowing'],
  'classical-museum': ['ancient', 'rome', 'roman', 'classical', 'museum', 'archive', 'artifact', 'historical', 'renaissance', 'gallery'],
  'western-desert': ['wild west', 'cowboy', 'desert', 'western', 'saloon', 'frontier', 'cactus', 'saddle'],
  rainbow: ['rainbow', 'prismatic', 'multicolor', 'multi-color', 'color spectrum'],
  'neo-brutalist-dark': ['neo-brutalist', 'neo brutalist', 'charcoal', 'high contrast', 'luminous white'],
  'brutalist-grid': ['brutalist', 'brutalism', 'poster', 'swiss', 'grid'],
  'warm-minimal': ['warm', 'calm', 'soft', 'minimal', 'minimalist', 'earthy', 'organic'],
  editorial: ['editorial', 'magazine', 'writer', 'writing', 'journal', 'case study', 'case-study'],
  'launch-pad': ['startup', 'saas', 'product', 'founder', 'launch', 'landing', 'conversion'],
  terminal: ['terminal', 'cli', 'command', 'hacker', 'developer', 'devtools', 'backend'],
  'creative-studio': ['playful', 'creative', 'colorful', 'artist', 'designer', 'gallery', 'vibrant'],
  'premium-studio': ['premium', 'cinematic', 'luxury', 'polished', 'executive', 'corporate', 'enterprise', 'professional', 'dark', 'high-end'],
};

const promptHasExplicitDirection = (prompt = '') => {
  const text = String(prompt || '').toLowerCase();
  return Object.values(DIRECTION_PROMPT_SIGNALS).some((signals) => (
    signals.some((signal) => text.includes(signal))
  ));
};

const extractPromptTerms = (prompt = '') => {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'into', 'this', 'that', 'make', 'turn', 'portfolio', 'site', 'website',
    'feel', 'look', 'like', 'stronger', 'clean', 'style', 'visual', 'design', 'page', 'roles', 'role',
    'my', 'your', 'user', 'custom', 'full', 'new', 'more', 'less', 'using',
  ]);
  return [...String(prompt || '').toLowerCase().matchAll(/[a-z][a-z0-9-]{2,}/g)]
    .map((match) => match[0])
    .filter((term) => !stopWords.has(term))
    .slice(0, 18);
};

const bundleText = ({ actions = [], designBrief, sitePlan, designSystem } = {}) => [
  JSON.stringify(actions || []),
  JSON.stringify(designBrief || {}),
  JSON.stringify(sitePlan || {}),
  JSON.stringify(designSystem || {}),
].join(' ').toLowerCase();

const assessPromptFit = ({ prompt = '', actions = [], designBrief, sitePlan, designSystem } = {}) => {
  const expectedDirection = inferDesignDirection(prompt);
  const text = bundleText({ actions, designBrief, sitePlan, designSystem });
  const terms = extractPromptTerms(prompt);
  const matchedTerms = terms.filter((term) => text.includes(term));
  const signals = DIRECTION_PROMPT_SIGNALS[expectedDirection] || [];
  const directionMatched = (
    designBrief?.styleDirection === expectedDirection
    || designSystem?.direction === expectedDirection
    || signals.some((signal) => text.includes(signal))
  );
  const explicitDirection = promptHasExplicitDirection(prompt);

  return {
    expectedDirection,
    terms,
    matchedTerms,
    directionMatched,
    explicitDirection,
    score: terms.length ? matchedTerms.length / terms.length : 1,
  };
};

const filterSectionOrderForSections = (sectionOrder = [], siteSections = []) => {
  if (!Array.isArray(sectionOrder)) return sectionOrder;
  const customIds = new Set((Array.isArray(siteSections) ? siteSections : []).map((section) => section.id));
  return sectionOrder.filter((id) => NATIVE_SECTION_IDS.has(id) || customIds.has(id));
};

const selectorLooksCompatible = (selector = '') => {
  const text = String(selector || '');
  if (!text.trim()) return true;
  return KNOWN_SELECTOR_PREFIXES.some((prefix) => text.includes(prefix));
};

const cssLooksArchitectural = (css = '') => {
  const text = String(css || '');
  if (!text.trim()) return true;
  if (!/\.pf-[a-z0-9_-]+/i.test(text)) return false;
  const selectorMatches = [...text.matchAll(/(^|}|,)\s*([^{}@][^{]+)\s*\{/g)].map((match) => match[2].trim());
  if (!selectorMatches.length) return true;
  return selectorMatches.some(selectorLooksCompatible);
};

const promptRequestsMotion = (prompt = '') => (
  /\b(animation|animate|animated|motion|transition|transitions|micro-interaction|microinteraction|interaction|interactive|hover|scroll reveal|reveal|fade|slide|smooth|buttery|cursor|particle|particles|gradient mesh|auto-hide|hide on scroll|page transition)\b/i
    .test(String(prompt || ''))
);

const enforceIntentConstraints = ({ actions = [], intent = classifyAgentIntent(), prompt = '' } = {}) => {
  const warnings = [];
  const normalizedIntent = intent || classifyAgentIntent(prompt);
  const cleanActions = [];

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    if (action.type === 'settings.patch') {
      const patch = { ...(action.patch || {}) };

      if (!normalizedIntent.allowNewSections) {
        if (Array.isArray(patch.site_sections) && patch.site_sections.length) {
          delete patch.site_sections;
          warnings.push(`Removed generated custom sections because this was classified as ${normalizedIntent.id}.`);
        }
      } else if (Array.isArray(patch.site_sections)) {
        const relevantSections = patch.site_sections.filter((section) => (
          !containsGenericAgentCopy(section)
          && !containsInventedPortfolioCopy(section, prompt)
        ));
        if (relevantSections.length !== patch.site_sections.length) {
          warnings.push('Removed generic or invented portfolio-copy sections from the proposed bundle.');
        }
        patch.site_sections = relevantSections.slice(0, normalizedIntent.sectionBudget);
        if (relevantSections.length > normalizedIntent.sectionBudget) {
          warnings.push(`Trimmed generated sections to the ${normalizedIntent.sectionBudget}-section budget for ${normalizedIntent.id}.`);
        }
      }

      if (!normalizedIntent.allowSectionOrder && Array.isArray(patch.section_order)) {
        delete patch.section_order;
        warnings.push(`Removed section-order changes because this was classified as ${normalizedIntent.id}.`);
      }

      if (!normalizedIntent.allowDesignSystem && patch.design_system) {
        delete patch.design_system;
        warnings.push(`Removed design-system changes because this was classified as ${normalizedIntent.id}.`);
      }

      if (!normalizedIntent.allowInteractions && patch.interactions) {
        delete patch.interactions;
        warnings.push(`Removed interaction recipes because this was classified as ${normalizedIntent.id}.`);
      }

      if (Array.isArray(patch.section_order) && Array.isArray(patch.site_sections)) {
        patch.section_order = filterSectionOrderForSections(patch.section_order, patch.site_sections);
      }

      if (Object.keys(patch).length) cleanActions.push({ ...action, patch });
      continue;
    }

    if (action.type === 'profile.patch' && !normalizedIntent.allowProfilePatch) {
      warnings.push(`Removed profile edits because this was classified as ${normalizedIntent.id}.`);
      continue;
    }

    if (['project.create', 'project.patch', 'project.reorder', 'block.create', 'block.patch', 'block.delete', 'block.reorder'].includes(action.type)
      && !normalizedIntent.allowProjectPatch) {
      warnings.push(`Removed project/block edits because this was classified as ${normalizedIntent.id}.`);
      continue;
    }

    if (action.type === 'customization.patch' && !normalizedIntent.allowCustomCode) {
      warnings.push(`Removed raw customization changes because this was classified as ${normalizedIntent.id}.`);
      continue;
    }

    cleanActions.push(action);
  }

  return {
    actions: cleanActions,
    warnings: uniqueMessages(warnings),
  };
};

const validateAgentQuality = ({ prompt = '', actions = [], intent = classifyAgentIntent(prompt), designBrief, sitePlan, designSystem } = {}) => {
  const warnings = [];
  const errors = [];
  const settingsPatch = actions.find((action) => action.type === 'settings.patch')?.patch || {};
  const siteSections = Array.isArray(settingsPatch.site_sections) ? settingsPatch.site_sections : [];
  const sectionOrder = Array.isArray(settingsPatch.section_order) ? settingsPatch.section_order : [];
  const customizationPatch = actions.find((action) => action.type === 'customization.patch')?.patch || {};
  const cssBlocks = Array.isArray(customizationPatch.cssBlocks) ? customizationPatch.cssBlocks : [];

  if (siteSections.some(containsGenericAgentCopy)) {
    errors.push('The proposed bundle contains generic fallback section copy. Regenerate with prompt-specific sections.');
  }
  if (siteSections.length > intent.sectionBudget) {
    errors.push(`The proposed bundle adds ${siteSections.length} sections, but ${intent.id} allows ${intent.sectionBudget}.`);
  }
  if (!intent.allowNewSections && siteSections.length) {
    errors.push(`The proposed bundle adds sections even though this is a ${intent.id} request.`);
  }
  if (!intent.allowSectionOrder && sectionOrder.length) {
    warnings.push(`Section-order changes are unusual for ${intent.id} requests.`);
  }

  const portfolioWideVisual = intent.id === 'siteStyle' || promptRequestsPortfolioWideVisualChange(prompt);

  if (intent.allowFullRedesign || portfolioWideVisual) {
    const promptFit = assessPromptFit({ prompt, actions, designBrief, sitePlan, designSystem });
    if (intent.allowFullRedesign && promptFit.explicitDirection && !promptFit.directionMatched) {
      errors.push(`The bundle does not match the requested design direction "${promptFit.expectedDirection}".`);
    }
    if (intent.allowFullRedesign && promptFit.terms.length >= 3 && promptFit.score < 0.18) {
      warnings.push('The proposed bundle appears weakly related to the user prompt. Review section titles, copy, and design tokens for relevance.');
    } else if (intent.allowFullRedesign && promptFit.terms.length >= 3 && promptFit.score < 0.32) {
      warnings.push('The bundle only lightly reflects the user prompt; review section titles, content, and design tokens for relevance.');
    }
    const cssText = cssBlocks.map((block) => block.css || '').join('\n');
    const requiredSelectors = intent.allowFullRedesign
      ? ['.pf-header', '.pf-section', '.pf-project-card', '.pf-contact-card']
      : ['.pf-header', '.pf-project-card', '.pf-contact-card'];
    const missingSelectors = requiredSelectors.filter((selector) => !cssText.includes(selector));
    if (missingSelectors.length) {
      warnings.push(`${intent.allowFullRedesign ? 'Full-site redesign' : 'Portfolio-wide style'} CSS must cover core ProjectFolio surfaces. Missing: ${missingSelectors.join(', ')}.`);
    }
  }

  const sectionIds = new Set(siteSections.map((section) => section.id));
  const nativeIds = NATIVE_SECTION_IDS;
  const unknownOrderIds = sectionOrder.filter((id) => !nativeIds.has(id) && !sectionIds.has(id));
  if (unknownOrderIds.length) {
    errors.push(`Section order references unknown custom section ids: ${unknownOrderIds.join(', ')}.`);
  }

  cssBlocks.forEach((block) => {
    if (!cssLooksArchitectural(block.css)) {
      errors.push(`CSS block "${block.id || 'untitled'}" does not target ProjectFolio .pf-* architecture classes.`);
    }
  });

  if (promptRequestsMotion(prompt)) {
    const interactions = Array.isArray(settingsPatch.interactions) ? settingsPatch.interactions : [];
    const animationsPatch = customizationPatch.animationsPatch || {};
    const cssText = cssBlocks.map((block) => block.css || '').join('\n');
    if (!interactions.length && !Object.keys(animationsPatch).length) {
      warnings.push('Animation or transition was requested, but the proposed bundle does not use native interaction recipes or animationsPatch.');
    }
    if (/(addEventListener\s*\(\s*['"`](scroll|pointermove|mousemove)|requestAnimationFrame\s*\(|@keyframes|animation\s*:)/i.test(cssText)) {
      warnings.push('Animation-heavy bundles should use settings.patch.interactions before custom animation CSS.');
    }
  }

  const critique = critiqueAgentBundle({ prompt, actions, designBrief, sitePlan, designSystem });
  warnings.push(...(critique.warnings || []));

  return {
    status: errors.length ? 'failed' : warnings.length ? 'needs_review' : 'passed',
    errors: uniqueMessages(errors),
    warnings: uniqueMessages(warnings),
    notes: uniqueMessages(critique.notes || []),
  };
};

const isBlockingCustomizationWarning = (warning = '') => (
  /may destabilize the portfolio layout/i.test(warning)
  || /will be scoped to the public portfolio root/i.test(warning)
);

const filterObject = (input, allowedKeys) => {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  for (const [key, value] of Object.entries(input)) {
    if (allowedKeys.has(key)) output[key] = value;
  }
  return output;
};

const normalizeAction = (action) => {
  if (!action || typeof action !== 'object') return null;
  const type = String(action.type || '');
  if (!ACTION_TYPES.has(type)) return null;
  return { ...action, type };
};

const validateAgentActions = (actions = []) => {
  const errors = [];
  const warnings = [];
  const normalized = [];
  if (!Array.isArray(actions)) {
    return { errors: ['Agent actions must be an array.'], warnings, actions: [] };
  }

  actions.forEach((action, index) => {
    const clean = normalizeAction(action);
    if (!clean) {
      warnings.push(`Ignored action ${index + 1} because it has an unknown or missing type.`);
      return;
    }
    if (clean.type === 'settings.patch') {
      clean.patch = filterObject(clean.patch, SETTINGS_PATCH_KEYS);
      if (clean.patch.site_sections) clean.patch.site_sections = sanitizeSiteSections(clean.patch.site_sections);
      if (clean.patch.design_system) clean.patch.design_system = sanitizeDesignSystem(clean.patch.design_system) || {};
      if (clean.patch.interactions) clean.patch.interactions = sanitizeInteractions(clean.patch.interactions);
      if (clean.patch.section_order && !Array.isArray(clean.patch.section_order)) delete clean.patch.section_order;
      if (Object.keys(clean.patch).length === 0) {
        warnings.push(`Ignored action ${index + 1} because it had no allowed settings fields.`);
        return;
      }
    }
    if (clean.type === 'profile.patch') {
      clean.patch = filterObject(clean.patch, PROFILE_PATCH_KEYS);
      if (Object.keys(clean.patch).length === 0) {
        warnings.push(`Ignored action ${index + 1} because it had no allowed profile fields.`);
        return;
      }
    }
    if (clean.type === 'project.patch') {
      if (!clean.projectId && !clean.slug) {
        warnings.push(`Ignored action ${index + 1} because project.patch needs projectId or slug.`);
        return;
      }
      clean.patch = filterObject(clean.patch, PROJECT_PATCH_KEYS);
      if (Object.keys(clean.patch).length === 0) {
        warnings.push(`Ignored action ${index + 1} because it had no allowed project fields.`);
        return;
      }
    }
    if (clean.type === 'project.create') {
      clean.project = filterObject(clean.project, PROJECT_PATCH_KEYS);
      if (!clean.project.title) {
        warnings.push(`Ignored action ${index + 1} because project.create needs a title.`);
        return;
      }
    }
    if (clean.type === 'block.create' && (!clean.projectId && !clean.projectSlug)) {
      warnings.push(`Ignored action ${index + 1} because block.create needs a project target.`);
      return;
    }
    if (clean.type === 'block.patch' && !clean.blockId) {
      warnings.push(`Ignored action ${index + 1} because block.patch needs blockId.`);
      return;
    }
    if (clean.type === 'block.delete' && !clean.blockId) {
      warnings.push(`Ignored action ${index + 1} because block.delete needs blockId.`);
      return;
    }
    if (clean.type === 'customization.patch') {
      const patch = clean.patch || {};
      if (patch.jsBlocks || patch.customJs || patch.js || patch.custom_js) {
        errors.push('Custom JavaScript is disabled for Site Agent bundles. Use settings.patch.interactions or CSS-only customization instead.');
      }
      const merged = parseAndMergeAiResponse(JSON.stringify(clean.patch || {}), clean.current || {});
      const validation = validateCustomization(merged.result);
      warnings.push(...(merged.warnings || []), ...validation.warnings);
      if (merged.errors.length || validation.errors.length) {
        errors.push(...merged.errors, ...validation.errors);
      }
      errors.push(...[...(merged.warnings || []), ...validation.warnings]
        .filter(isBlockingCustomizationWarning)
        .map((warning) => `Blocking customization risk: ${warning}`));
    }
    if (clean.type === 'memory.upsert' && !String(clean.content || '').trim()) {
      warnings.push(`Ignored action ${index + 1} because memory content was empty.`);
      return;
    }
    normalized.push(clean);
  });

  return { errors, warnings, actions: normalized };
};

const buildAgentSystemMessage = (intent = null) => [
  'You are ProjectFolio AI Editor: product designer, UX specialist, visual designer, and front-end engineer.',
  'You help users turn their ProjectFolio portfolio into a modular personal website with a distinct visual direction, not just color swaps.',
  'Return only JSON. Do not use markdown fences.',
  '',
  'Request scope rules:',
  `- Current classified intent: ${intent?.id || 'auto'}${intent?.label ? ` (${intent.label})` : ''}.`,
  `- Custom section budget for this request: ${Number.isFinite(intent?.sectionBudget) ? intent.sectionBudget : 'auto'}.`,
  '- For small edits, style tweaks, content edits, and visual effects, make the smallest useful patch. Do not add custom sections or rewrite section_order.',
  '- Only fullRedesign requests may change the overall site structure, add multiple sections, or create a full visual system.',
  '- If the user asks to add one element/section, add one relevant section at most.',
  '- Every custom section must be specific to the user request, profile, projects, or provided facts. Do not invent generic proof cards.',
  '- Never use canned section copy such as "Clear positioning", "Guided proof", "Polished interaction", "Proof at a glance", or generic process cards unless the user specifically asked for that exact content.',
  '- Do not invent achievements, project outcomes, responsibilities, metrics, roles, employers, or personal background. If source material is missing, keep copy concise and factual or ask for details.',
  '- When writing portfolio copy, use only the user profile, existing project data, memories, and details the user has supplied in chat.',
  '- Design/style/aesthetic/motion prompts are visual-only unless the classified intent is contentEdit. Do not add profile.patch, project.patch, block actions, new skills, philosophy copy, beliefs, personal approach statements, or invented descriptions for visual-only prompts.',
  '- Never add aesthetic labels such as "Neo-Brutalism", "Glassmorphism", "Minimalism", or "Cinematic" to the user skills list unless the user explicitly says they are skills.',
  '- If the user asks for stronger copy, storytelling, role targeting, or descriptions but has not supplied concrete facts, ask for those facts first instead of writing filler.',
  '- If the request is too ambiguous to satisfy well, return a clarification instead of a weak bundle. Keep clarification questions short and provide 2-3 practical options.',
  '- If the previous assistant message asked a clarification question, treat the user\'s next answer as binding direction for this bundle.',
  '- For thin portfolios, prefer visual/structural improvements and clearly labeled placeholders over polished filler paragraphs.',
  '- If the user asks to remove or undo something, propose removal actions only; do not replace it with a new theme.',
  '',
  'Creative direction rules:',
  '- For explicit broad requests like "redesign my site", "make my portfolio feel like X", or "transform the website", create a focused bundle: settings.patch + optional site_sections + optional customization.patch + memory.upsert.',
  '- Full redesign bundles may add up to 3 custom sections, refine layout/section_order, adjust native theme/layout settings, and add CSS that changes composition, spacing, hierarchy, cards, section rhythm, and interactions.',
  '- For redesigns and project storytelling requests, keep the native "projects" section in section_order unless the user explicitly asks to remove projects. Do not replace the project grid with only custom proof/story sections.',
  '- Keep the native "contact" section in section_order unless the user explicitly asks to remove contact or CTA areas.',
  '- Preserve existing native optional sections in section_order, including education and endorsements, unless the user explicitly asks to hide or remove them.',
  '- Treat CSS, native settings, and safe interaction recipes as the design layer: use gradients, depth, glass, editorial grids, accent rails, reveal motion, hover microinteractions, responsive layout, and clear content hierarchy when appropriate.',
  '- Avoid generic blue/neon cards. Pick a coherent direction from the prompt such as editorial studio, product launch page, classical museum, terminal workspace, gallery wall, brutalist grid, warm minimal, or premium consultant site.',
  '- Do not infer neon/cyber style just because the user is technical, an engineer, or mentions AI. Use neon only when explicitly requested.',
  '- Keep text readable: choose design-system text/background color pairs with strong contrast, include a clear contact/CTA step, and avoid stacking too many motion effects.',
  '- Keep motion tasteful and fast: entrance 180-900ms, hover 150-220ms, page transitions 120-450ms. Avoid infinite animations except native gradientMesh, gradient-shift, and ambientParticles.',
  '',
  'Compatibility rules:',
  '- Prefer native settings before custom CSS or JS.',
  '- Use layout, section_order, section_config, site_sections, theme_overrides, and animations for normal design changes.',
  '- Use settings.patch.interactions for safe native effects before writing raw JS. Supported interaction recipes: scrollReveal, cardTilt, microInteractions, cursorGlow, ambientParticles, gradientMesh, navAutoHide, pageTransition.',
  '- For animation-heavy prompts, prefer settings.patch.interactions and animationsPatch. Use CSS only for static styling or minor transition declarations. Do not hand-code scroll listeners, pointer listeners, requestAnimationFrame loops, particle systems, or page transition JavaScript.',
  '- Use at most 4 interaction recipes in one bundle. A strong default motion stack is scrollReveal + microInteractions + optional navAutoHide + optional gradientMesh. Add cursorGlow or ambientParticles only when the user asks for them or the design needs subtle ambience.',
  '- Use customization.patch for raw visual/effect work such as exact CSS, theme overrides, animations, and supported safe interaction recipes. Custom JavaScript is disabled.',
  '- For customization.patch, use marked blocks with stable ids. Reuse the same id to update an existing effect. Use removeBlocks to remove old effects.',
  '- Cross-chat collaboration is expected. When a user asks to modify a previous AI bundle or another model\'s work, use the current applied bundle ledger, managed code block IDs, theme overrides, design system, interactions, and site_sections from context as source of truth.',
  '- For targeted edits to existing AI styling, reuse existing cssBlocks ids from custom_css_summary or appliedChangeSets. Do not create a duplicate competing theme block unless the user asks for a separate new effect.',
  '- If changing specific text colors, patch the existing block or theme override that currently controls that selector. Include the relevant selector in the returned CSS so the visible color actually changes.',
  '- Raw CSS must target .pf-* classes directly. Preferred targets: .pf-portfolio, .pf-nav, .pf-main, .pf-section, .pf-header, .pf-avatar, .pf-name, .pf-headline, .pf-bio, .pf-skills, .pf-skill-tag, .pf-projects, .pf-project-card, .pf-project-media, .pf-project-title, .pf-project-tagline, .pf-tech-tag, .pf-contact, .pf-contact-card, .pf-education, .pf-credential-card, .pf-endorsements, .pf-endorsement-card, .pf-custom-section, .pf-section-{customId}, .pf-feature-card, .pf-stat-card, .pf-timeline-item, .pf-cta-card.',
  '- Broad visual CSS must cover the active renderer surfaces from context.renderer.surfaces. At minimum, style .pf-nav, .pf-header, .pf-section, .pf-project-card, .pf-contact-card, .pf-education/.pf-credential-card when education is active, and .pf-endorsement-card when endorsements are active.',
  '- Do not generate raw JavaScript or jsBlocks. Use site_sections for content, CSS for presentation, and settings.patch.interactions for safe effects.',
  '- Only use project.patch or block actions when you can reference an existing project id, slug, or block id from context. Otherwise use site_sections and customization.patch.',
  '- Do not edit login email, password, billing, auth, private account settings, or non-public data.',
  `- Valid themeOverridesPatch keys: ${[...VALID_THEME_KEYS].join(', ')}.`,
  `- Valid animationsPatch values: ${Object.entries(VALID_ANIMATIONS).map(([key, values]) => `${key}=[${[...values].join('|')}]`).join('; ')}.`,
  '',
  'Custom section schemas:',
  '- hero: { kicker, heading, text, actions: [{ label, href }], highlights: [{ label, value }] }',
  '- text: { text }',
  '- featureGrid: { items: [{ icon, title, text }] }',
  '- proofWall: { items: [{ value, label, text, source }] }',
  '- caseStudy: { projectIds, items: [{ projectId, title, problem, solution, impact, proof }] }',
  '- process: { items: [{ step, title, text }] }',
  '- stats: { items: [{ value, label }] }',
  '- timeline: { items: [{ title, date, text }] }',
  '- gallery: { items: [{ url, alt, caption }] }',
  '- testimonial: { quote, author, role }',
  '- cta: { heading, text, label, href }',
  '- linkList: { items: [{ label, href }] }',
  '- featuredProjects: { projectIds, limit }',
  '- comparison: { columns: [{ title, items: [string] }] }',
  '- faq: { items: [{ question, answer }] }',
  '- skillMatrix: { groups: [{ title, skills: [string], note }] }',
  '- mediaFeature: { imageUrl, alt, eyebrow, heading, text, points: [string] }',
  '- Optional section.variant values: hero=[split|centered|product|editorial|profile], text=[spotlight|editorial|split|note], featureGrid=[cards|bento|iconRail|processGrid], proofWall=[metricCards|logoWall|evidenceGrid|signalStack], caseStudy=[stacked|split|timeline|spotlight], process=[steps|rail|timeline|loop], stats=[compactRow|editorialNumbers|proofWall], timeline=[vertical|roadmap|compact], gallery=[masonry|spotlight|grid], testimonial=[quoteCard|quoteWall], cta=[banner|split|stickyFooter], linkList=[pills|resourceGrid], featuredProjects=[grid|caseStudyList|horizontalScroll], comparison=[columns|beforeAfter|matrix], faq=[accordion|cards], skillMatrix=[clusters|radar|toolbox], mediaFeature=[split|poster|showcase].',
  '- Optional section.layout values: { columns: 1-4, density: compact|comfortable|spacious, emphasis: low|medium|high, align: left|center|split }.',
  '- Interaction recipes: { type: "scrollReveal", target: ".pf-section|.pf-project-card|.pf-feature-card|.pf-contact-card|.pf-project-block-card", effect: "fadeUp|slideIn|zoomIn|blurIn", stagger: 0-240, duration: 180-900 }, { type: "microInteractions", target: ".pf-project-card|.pf-contact-link|.pf-hero-action|.pf-tech-tag|.pf-skill-tag", effect: "lift|scale|glow|invert" }, { type: "cardTilt", target: ".pf-project-card", strength: "subtle|medium|strong" }, { type: "cursorGlow", size: 80-360, opacity: 0.05-0.35 }, { type: "ambientParticles", density: "low|medium|high" }, { type: "gradientMesh", opacity: 0.08-0.45 }, { type: "navAutoHide", threshold: 8-180 }, { type: "pageTransition", effect: "fade|slideUp|scale", duration: 120-450 }.',
  '',
  'Response shape:',
  '- Your actions array is the final output: ProjectFolio validates and sanitizes it, then applies it directly. If you return only planning fields without actions, nothing changes on the site — always include complete, specific actions.',
  '- Include designBrief, sitePlan, and designSystem for larger visual requests so your actions follow a coherent direction, but never rely on them alone.',
  '- Mirror the user\'s exact visual vocabulary in the bundle: requested colors, materials, textures, and effects must show up in the returned theme overrides, design tokens, and CSS. If the user asks for "emerald green with a gemstone shine", the CSS must contain emerald color values and a shine treatment, not a generic palette.',
  '- The example below shows every supported field. Do not fill every field by default. Return only the smallest set of actions that directly satisfies the current classified intent and user prompt.',
  '- To ask a follow-up instead of proposing changes, return { "reply": "...", "clarification": { "type": "design_direction", "question": "...", "options": [{ "id": "a", "label": "...", "description": "...", "value": "Clarification answer: ..." }, { "id": "b", "label": "...", "description": "...", "value": "Clarification answer: ..." }] }, "actions": [] }.',
  JSON.stringify({
    reply: 'Friendly concise response to the user.',
    summary: 'Short summary of the proposed bundle.',
    threadTitle: 'Short chat title',
    designBrief: {
      goal: 'What this website update is trying to accomplish.',
      audience: 'Who the page is designed for.',
      tone: 'Visual and writing tone.',
      styleDirection: 'premium-studio',
      constraints: ['Prefer native ProjectFolio settings before custom code.'],
    },
    sitePlan: {
      sections: [
        { id: 'custom-about', role: 'positioning', type: 'text', layoutIntent: 'Explain the user clearly before projects.' },
      ],
      primaryCta: 'View projects',
      contentHierarchy: ['identity', 'proof', 'projects', 'contact'],
    },
    designSystem: {
      direction: 'premium-studio',
      tokens: { surface: 'glass cards', radius: 'large', shadow: 'cinematic' },
      typography: { headingScale: 'display', bodyDensity: 'comfortable' },
      componentVariants: { projectCard: 'glass-lift', sectionHeading: 'eyebrow-rule' },
      motion: { entrance: 'fade-up', hover: 'lift' },
    },
    actions: [
      { type: 'settings.patch', patch: { layout: 'classic', section_order: ['header', 'custom-about', 'projects', 'contact'], site_sections: [{ id: 'custom-about', type: 'text', variant: 'spotlight', layout: { align: 'split', density: 'spacious' }, title: 'About', content: { text: 'Short positioning copy.' } }], interactions: [{ type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp', stagger: 80 }] } },
      { type: 'profile.patch', patch: { headline: 'Only for contentEdit with supplied facts', bio: 'Only for contentEdit with supplied facts', skills: ['Only explicit user skills'] } },
      { type: 'project.patch', projectId: 'uuid-or-omit', slug: 'slug-or-omit', patch: { tagline: 'Only for contentEdit with supplied facts', is_featured: true } },
      {
        type: 'customization.patch',
        patch: {
          themeOverridesPatch: { cardShadow: '0 20px 50px rgba(0,0,0,.18)' },
          animationsPatch: { cardHover: 'lift' },
          cssBlocks: [{ id: 'premium-cards', css: '.pf-project-card { backdrop-filter: blur(12px); }' }],
          removeBlocks: [],
          description: 'Adds a polished visual effect.',
        },
      },
      { type: 'memory.upsert', kind: 'preference', content: 'User prefers premium minimal design.' },
    ],
  }, null, 2),
  '',
  `Supported custom section types: ${[...SECTION_TYPES].join(', ')}.`,
  '',
  "Education & Credentials section (first-class, id: 'education'):",
  "- To enable it, include 'education' in section_order inside settings.patch.",
  "- Credentials live in section_config.education.credentials (JSON array). Patch via settings.patch: { section_config: { ...existing, education: { credentials: [...] } } }.",
  "- Each credential shape: { id: string, type: 'degree'|'cert'|'award'|'course', title: string, institution: string, field?: string, year_start?: string, year_end?: string, honors?: string, url?: string }.",
  "- When a user describes their education, populate credentials. Always set id (e.g. 'cred_1'), type, title, institution. Omit optional keys if unknown.",
  "- Credentials render most-recent-first. Use year_end: 'Present' for ongoing degrees.",
  'When a user asks for visual effects, custom CSS, particles, cursor effects, or scroll interactions, include a customization.patch action using CSS and safe interaction recipes only. Never include jsBlocks.',
].join('\n');

const truncateForAgent = (value, limit = 240) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

const compactJsonSize = (value) => JSON.stringify(value || {}).length;

const summarizeBlocks = (blocks = []) => {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 8).map((block) => ({
    id: block.id,
    type: block.type,
    sort_order: block.sort_order,
    summary: truncateForAgent(
      typeof block.content === 'string' ? block.content : JSON.stringify(block.content || {}),
      220
    ),
  }));
};

const extractAiBlockIds = (code = '') => (
  [...String(code || '').matchAll(/\/\*\s*pf-ai:block:([a-z0-9_-]+)\s*\*\//gi)]
    .map((match) => match[1])
    .slice(0, 12)
);

const extractCssRuleHints = (css = '', limit = 16) => {
  const hints = [];
  const pattern = /([^{}]+)\{([^{}]+)\}/g;
  for (const match of String(css || '').matchAll(pattern)) {
    if (hints.length >= limit) break;
    const selector = match[1].replace(/\s+/g, ' ').trim();
    if (!selector || selector.startsWith('@')) continue;
    const declarations = match[2]
      .split(';')
      .map((part) => part.trim())
      .filter((part) => /\b(color|background|border|shadow|fill|stroke|opacity)\b/i.test(part))
      .slice(0, 8);
    if (!declarations.length) continue;
    hints.push({
      selector: truncateForAgent(selector, 140),
      declarations: declarations.map((declaration) => truncateForAgent(declaration, 160)),
    });
  }
  return hints;
};

const extractManagedCodeBlocks = (code = '', options = {}) => {
  const maxBlocks = options.maxBlocks || 8;
  const maxContent = options.maxContent || 700;
  const includeCssHints = options.includeCssHints === true;
  const blocks = [];
  const pattern = /\/\*\s*pf-ai:block:([a-zA-Z0-9_-]+)\s*\*\/([\s\S]*?)\/\*\s*pf-ai:end:\1\s*\*\//g;
  for (const match of String(code || '').matchAll(pattern)) {
    if (blocks.length >= maxBlocks) break;
    const content = match[2].trim();
    blocks.push({
      id: match[1],
      summary: truncateForAgent(content, maxContent),
      ...(includeCssHints ? { styleHints: extractCssRuleHints(content, 10) } : {}),
    });
  }
  return blocks;
};

const summarizeAppliedChangeSets = (changeSets = [], maxChangeSets = 6) => (
  (Array.isArray(changeSets) ? changeSets : []).slice(0, maxChangeSets).map((changeSet) => {
    const preview = parseJson(changeSet.preview, {});
    const parsedActions = parseJson(changeSet.actions, []);
    const actions = Array.isArray(parsedActions) ? parsedActions : [];
    const surfaceSummary = preview.surfaceSummary || {};
    return {
      id: changeSet.id,
      thread_id: changeSet.thread_id,
      model_id: changeSet.model_id,
      applied_at: changeSet.applied_at,
      summary: truncateForAgent(changeSet.summary, 220),
      ownedSurfaces: {
        settings: surfaceSummary.settings || [],
        sections: surfaceSummary.sections || [],
        cssBlocks: surfaceSummary.cssBlocks || [],
        jsBlocks: surfaceSummary.jsBlocks || [],
        themeOverrides: surfaceSummary.themeOverrides || [],
        animations: surfaceSummary.animations || [],
        interactions: surfaceSummary.interactions || [],
      },
      actionTypes: actions.map((action) => action.type).filter(Boolean).slice(0, 12),
    };
  })
);

const buildCompactAgentContext = (context = {}, options = {}) => {
  const settings = context.settings || {};
  const projects = Array.isArray(context.projects) ? context.projects : [];
  const memories = Array.isArray(context.memories) ? context.memories : [];
  const appliedChangeSets = Array.isArray(context.appliedChangeSets) ? context.appliedChangeSets : [];
  const maxProjects = options.maxProjects || 8;
  const maxMemories = options.maxMemories || 8;
  const activeSectionOrder = parseJson(settings.section_order, DEFAULT_SECTION_ORDER);
  const activeCustomSections = parseJson(settings.site_sections, []);
  const activeCustomIds = new Set(activeCustomSections.map((section) => section.id).filter(Boolean));
  const compact = {
    renderer: {
      stableRoot: '#pf-root',
      renderRule: 'Every broad visual bundle must style all active native sections and generated sections through stable .pf-* classes.',
      activeSectionOrder,
      surfaces: PROJECTFOLIO_SURFACE_INVENTORY.map((surface) => ({
        ...surface,
        active: surface.id === 'custom'
          ? activeCustomIds.size > 0
          : activeSectionOrder.includes(surface.id),
      })),
    },
    user: {
      id: context.user?.id,
      full_name: context.user?.full_name,
      username: context.user?.username,
      headline: truncateForAgent(context.user?.headline, 220),
      bio: truncateForAgent(context.user?.bio, 420),
      location: context.user?.location,
      website: context.user?.website,
      linkedin_url: context.user?.linkedin_url,
      github_url: context.user?.github_url,
      skills: Array.isArray(context.user?.skills) ? context.user.skills.slice(0, 16) : [],
      contact_email: context.user?.contact_email,
      identity_mode: context.user?.identity_mode,
    },
    settings: {
      theme: settings.theme,
      accent_color: settings.accent_color,
      font_choice: settings.font_choice,
      layout: settings.layout,
      section_order: activeSectionOrder,
      section_config: parseJson(settings.section_config, {}),
      educationCredentials: (() => {
        const ec = parseJson(settings.section_config, {})?.education?.credentials;
        if (!Array.isArray(ec) || ec.length === 0) return [];
        return ec.slice(0, 12).map((c) => ({
          type: c.type,
          title: truncateForAgent(c.title, 80),
          institution: truncateForAgent(c.institution, 80),
          ...(c.field       ? { field:      c.field      } : {}),
          ...(c.year_start  ? { year_start: c.year_start } : {}),
          ...(c.year_end    ? { year_end:   c.year_end   } : {}),
          ...(c.honors      ? { honors:     c.honors     } : {}),
        }));
      })(),
      show_skills: settings.show_skills,
      show_dates: settings.show_dates,
      show_project_type: settings.show_project_type,
      is_public: settings.is_public,
      theme_overrides: parseJson(settings.theme_overrides, {}),
      animations: parseJson(settings.animations, {}),
      design_system: parseJson(settings.design_system, {}),
      interactions: parseJson(settings.interactions, []),
      site_sections: activeCustomSections.slice(0, 8).map((section) => ({
        id: section.id,
        type: section.type,
        variant: section.variant,
        layout: section.layout,
        title: truncateForAgent(section.title, 120),
        subtitle: truncateForAgent(section.subtitle, 180),
        contentSummary: truncateForAgent(JSON.stringify(section.content || {}), 420),
      })),
      custom_css_summary: settings.custom_css
        ? {
            length: String(settings.custom_css).length,
            blockIds: extractAiBlockIds(settings.custom_css),
            blocks: extractManagedCodeBlocks(settings.custom_css, { includeCssHints: true }),
            styleHints: extractCssRuleHints(settings.custom_css, 24),
          }
        : null,
      custom_js_summary: settings.custom_js
        ? {
            length: String(settings.custom_js).length,
            blockIds: extractAiBlockIds(settings.custom_js),
            blocks: extractManagedCodeBlocks(settings.custom_js, { maxContent: 520 }),
          }
        : null,
    },
    projects: projects.slice(0, maxProjects).map((project) => ({
      id: project.id,
      slug: project.slug,
      title: truncateForAgent(project.title, 140),
      tagline: truncateForAgent(project.tagline, 180),
      description: truncateForAgent(project.description, 420),
      project_type: project.project_type,
      technologies: Array.isArray(project.technologies) ? project.technologies.slice(0, 12) : [],
      status: project.status,
      is_featured: project.is_featured,
      sort_order: project.sort_order,
      github_url: project.github_url,
      live_url: project.live_url,
      blocks: summarizeBlocks(project.blocks),
    })),
    memories: memories.slice(0, maxMemories).map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      content: truncateForAgent(memory.content, 260),
    })),
    appliedChangeSets: summarizeAppliedChangeSets(appliedChangeSets),
    omitted: {
      projects: Math.max(0, projects.length - maxProjects),
      memories: Math.max(0, memories.length - maxMemories),
      appliedChangeSets: Math.max(0, appliedChangeSets.length - 6),
      note: 'Large raw CSS, native interaction metadata, and full block bodies are summarized to stay under model token limits.',
    },
  };

  return compact;
};

const buildAgentUserMessage = ({ prompt, context, previousErrors = [], compactContext = null, intent = null }) => {
  const agentContext = compactContext || buildCompactAgentContext(context);
  const classifiedIntent = intent || classifyAgentIntent(prompt);
  return [
  'Request classification:',
  JSON.stringify({
    id: classifiedIntent.id,
    label: classifiedIntent.label,
    sectionBudget: classifiedIntent.sectionBudget,
    allowNewSections: classifiedIntent.allowNewSections,
    allowSectionOrder: classifiedIntent.allowSectionOrder,
    allowProfilePatch: classifiedIntent.allowProfilePatch,
    allowProjectPatch: classifiedIntent.allowProjectPatch,
    allowCustomCode: classifiedIntent.allowCustomCode,
    allowDesignSystem: classifiedIntent.allowDesignSystem,
    allowInteractions: classifiedIntent.allowInteractions,
    allowFullRedesign: classifiedIntent.allowFullRedesign,
  }, null, 2),
  '',
  'Cross-chat edit note:',
  'Recent applied AI bundles, managed CSS blocks, native interactions, and design surfaces are included below. If the user asks to edit a prior bundle or another model\'s work, patch those existing surfaces and reuse their block IDs instead of adding a parallel design layer.',
  '',
  'Renderer coverage requirement:',
  'Use the renderer.surfaces inventory in the context. If a surface is active, broad visual CSS must account for it. Do not leave Education, Endorsements, Contact, or generated sections in an old visual style while changing Header/Projects.',
  '',
  'Current ProjectFolio context:',
  JSON.stringify(agentContext, null, 2),
  ...(previousErrors.length
    ? [
        '',
        'Your previous draft failed validation or browser verification. Fix these issues and return a complete corrected JSON bundle:',
        previousErrors.map((error, index) => `${index + 1}. ${error}`).join('\n'),
      ]
    : []),
  '',
  `User request: ${prompt}`,
  '',
  'Priority: the user request above is the single source of truth for this change. Stored memories in the context are background preferences from older conversations — when they conflict with the current request (for example a remembered style direction that the request does not ask for), follow the request and ignore the memory.',
  ].join('\n');
};

const parseAgentResponse = (raw, options = {}) => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(jsonText);
  const clarification = sanitizeAgentClarification(parsed);
  if (clarification) {
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : clarification.reply,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Needs clarification',
      threadTitle: typeof parsed.threadTitle === 'string' ? parsed.threadTitle.slice(0, 200) : null,
      designBrief: null,
      sitePlan: null,
      designSystem: null,
      clarification,
      actions: [],
      intent: options.intent || (options.prompt ? classifyAgentIntent(options.prompt) : null),
      quality: { errors: [], warnings: [], notes: [] },
      errors: [],
      warnings: [],
    };
  }
  const validation = validateAgentActions(parsed.actions || []);
  const agentPlan = sanitizeAgentPlan(parsed);
  let actions = validation.actions;
  if (agentPlan?.designSystem) {
    const settingsAction = actions.find((action) => action.type === 'settings.patch');
    if (settingsAction) {
      settingsAction.patch.design_system = settingsAction.patch.design_system || agentPlan.designSystem;
    } else {
      actions.unshift({ type: 'settings.patch', patch: { design_system: agentPlan.designSystem } });
    }
  }
  const shouldEnforceIntent = Boolean(options.intent || options.prompt);
  const intent = options.intent || (shouldEnforceIntent ? classifyAgentIntent(options.prompt) : null);
  const intentResult = shouldEnforceIntent
    ? enforceIntentConstraints({ actions, intent, prompt: options.prompt })
    : { actions, warnings: [] };
  actions = intentResult.actions;
  const quality = shouldEnforceIntent
    ? validateAgentQuality({
      prompt: options.prompt,
      actions,
      intent,
      designBrief: agentPlan?.designBrief || null,
      sitePlan: agentPlan?.sitePlan || null,
      designSystem: agentPlan?.designSystem || null,
    })
    : { errors: [], warnings: [], notes: [] };
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply : 'I prepared a site update for you to review.',
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Site update proposal',
    threadTitle: typeof parsed.threadTitle === 'string' ? parsed.threadTitle.slice(0, 200) : null,
    designBrief: agentPlan?.designBrief || null,
    sitePlan: agentPlan?.sitePlan || null,
    designSystem: agentPlan?.designSystem || null,
    actions,
    intent,
    quality,
    errors: [...validation.errors, ...(quality.errors || [])],
    warnings: uniqueMessages([...validation.warnings, ...intentResult.warnings, ...(quality.warnings || [])]),
  };
};

const PROJECTFOLIO_COMPILER_INTENTS = new Set([
  'smallEdit',
  'styleTweak',
  'sectionAdd',
  'codeEffect',
  'siteStyle',
  'fullRedesign',
]);

const shouldUseProjectFolioCompiler = (intent = null) => (
  PROJECTFOLIO_COMPILER_INTENTS.has((intent || {}).id)
);

const DESIGN_DIRECTIONS = {
  'neon-lab': {
    theme: 'bold',
    layout: 'magazine',
    accent: '#22d3ee',
    bg: 'radial-gradient(circle at 20% 0%, rgba(34,211,238,.24), transparent 32%), radial-gradient(circle at 90% 12%, rgba(124,58,237,.22), transparent 34%), #020617',
    cardBg: 'rgba(15, 23, 42, 0.74)',
    border: '1px solid rgba(125, 211, 252, 0.20)',
    shadow: '0 28px 90px rgba(8, 47, 73, 0.38)',
    cssVars: '--pf-agent-accent:#22d3ee;--pf-agent-accent-2:#a78bfa;--pf-agent-ink:#f8fafc;--pf-agent-muted:#b6c5d8;',
    title: 'Neon systems lab',
    subtitle: 'A high-signal portfolio built like an interactive technical command center.',
  },
  editorial: {
    theme: 'minimal',
    layout: 'magazine',
    accent: '#111827',
    bg: 'linear-gradient(135deg, #f8f5ef 0%, #ffffff 42%, #edf2ff 100%)',
    cardBg: 'rgba(255,255,255,.86)',
    border: '1px solid rgba(17,24,39,.10)',
    shadow: '0 24px 70px rgba(17,24,39,.10)',
    cssVars: '--pf-agent-accent:#111827;--pf-agent-accent-2:#9a3412;--pf-agent-ink:#111827;--pf-agent-muted:#667085;',
    title: 'Editorial studio',
    subtitle: 'A magazine-inspired personal site with strong hierarchy and case-study rhythm.',
  },
  'classical-museum': {
    theme: 'minimal',
    layout: 'magazine',
    accent: '#9f6b2f',
    bg: 'linear-gradient(135deg, #f7efe1 0%, #fffaf0 42%, #ede0c4 100%)',
    cardBg: 'rgba(255, 250, 240, 0.88)',
    border: '1px solid rgba(88, 58, 28, 0.18)',
    shadow: '0 24px 70px rgba(88,58,28,.12)',
    cssVars: '--pf-agent-accent:#9f6b2f;--pf-agent-accent-2:#7f1d1d;--pf-agent-ink:#2f2418;--pf-agent-muted:#705f4b;',
    title: 'Classical museum',
    subtitle: 'A warm, artifact-driven portfolio with editorial rhythm and historical gravitas.',
  },
  'western-desert': {
    theme: 'minimal',
    layout: 'magazine',
    accent: '#b45309',
    bg: 'radial-gradient(circle at 18% 8%, rgba(251,191,36,.34), transparent 26%), linear-gradient(180deg, #f8e3b3 0%, #d99a4e 44%, #7c2d12 100%)',
    cardBg: 'rgba(255, 247, 237, 0.88)',
    border: '2px solid rgba(120, 53, 15, 0.34)',
    shadow: '10px 14px 0 rgba(120, 53, 15, 0.18), 0 26px 80px rgba(124,45,18,.22)',
    cssVars: '--pf-agent-accent:#b45309;--pf-agent-accent-2:#78350f;--pf-agent-ink:#2f1b0c;--pf-agent-muted:#6f4a24;',
    title: 'Western desert trail',
    subtitle: 'A frontier-inspired portfolio with sunbaked depth, rugged cards, and clear project waypoints.',
    extraCss: [
      '.pf-portfolio::before { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(circle at 12% 82%, rgba(120,53,15,.20), transparent 16%), radial-gradient(circle at 82% 18%, rgba(251,191,36,.24), transparent 18%); mix-blend-mode: multiply; }',
      '.pf-main, .pf-nav { position: relative; z-index: 1; }',
      '.pf-section-title { border-bottom: 2px solid color-mix(in srgb, var(--pf-agent-accent-2) 55%, transparent); padding-bottom: .35rem; }',
      '.pf-project-card::before { content: ""; position: absolute; top: 16px; right: 16px; width: 46px; height: 46px; border: 2px solid color-mix(in srgb, var(--pf-agent-accent-2) 72%, transparent); border-radius: 50%; opacity: .55; transform: rotate(-12deg); pointer-events: none; }',
      '.pf-project-card::after { background: linear-gradient(135deg, transparent 0 44%, color-mix(in srgb, var(--pf-agent-accent) 20%, transparent) 44% 56%, transparent 56% 100%) !important; }',
      '.pf-project-media { background: linear-gradient(165deg, #fde68a 0%, #d97706 45%, #7c2d12 100%) !important; }',
    ].join('\n'),
  },
  rainbow: {
    theme: 'bold',
    layout: 'fullwidth',
    accent: '#f97316',
    bg: 'linear-gradient(120deg, #ef4444 0%, #f97316 16%, #eab308 32%, #22c55e 48%, #06b6d4 64%, #6366f1 80%, #a855f7 100%)',
    cardBg: 'rgba(255,255,255,.84)',
    border: '1px solid rgba(255,255,255,.46)',
    shadow: '0 28px 90px rgba(88,28,135,.22)',
    cssVars: '--pf-agent-accent:#f97316;--pf-agent-accent-2:#a855f7;--pf-agent-ink:#111827;--pf-agent-muted:#374151;',
    title: 'Rainbow spectrum',
    subtitle: 'A vivid whole-site color system that turns every portfolio surface into a coordinated spectrum.',
    extraCss: [
      '.pf-portfolio { background-size: 220% 220%; }',
      '.pf-section { border-radius: clamp(22px, 4vw, 42px); }',
      '.pf-header { background: linear-gradient(135deg, rgba(255,255,255,.88), rgba(255,255,255,.42)) !important; }',
      '.pf-project-card:nth-child(6n+1) { --pf-agent-accent:#ef4444; --pf-agent-accent-2:#f97316; }',
      '.pf-project-card:nth-child(6n+2) { --pf-agent-accent:#f97316; --pf-agent-accent-2:#eab308; }',
      '.pf-project-card:nth-child(6n+3) { --pf-agent-accent:#eab308; --pf-agent-accent-2:#22c55e; }',
      '.pf-project-card:nth-child(6n+4) { --pf-agent-accent:#22c55e; --pf-agent-accent-2:#06b6d4; }',
      '.pf-project-card:nth-child(6n+5) { --pf-agent-accent:#06b6d4; --pf-agent-accent-2:#6366f1; }',
      '.pf-project-card:nth-child(6n+6) { --pf-agent-accent:#6366f1; --pf-agent-accent-2:#a855f7; }',
      '.pf-skill-tag:nth-child(6n+1), .pf-tech-tag:nth-child(6n+1) { --pf-agent-accent:#ef4444; }',
      '.pf-skill-tag:nth-child(6n+2), .pf-tech-tag:nth-child(6n+2) { --pf-agent-accent:#f97316; }',
      '.pf-skill-tag:nth-child(6n+3), .pf-tech-tag:nth-child(6n+3) { --pf-agent-accent:#eab308; }',
      '.pf-skill-tag:nth-child(6n+4), .pf-tech-tag:nth-child(6n+4) { --pf-agent-accent:#22c55e; }',
      '.pf-skill-tag:nth-child(6n+5), .pf-tech-tag:nth-child(6n+5) { --pf-agent-accent:#06b6d4; }',
      '.pf-skill-tag:nth-child(6n+6), .pf-tech-tag:nth-child(6n+6) { --pf-agent-accent:#a855f7; }',
      '.pf-contact-card { background: linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,255,255,.54)) !important; }',
    ].join('\n'),
  },
  'neo-brutalist-dark': {
    theme: 'bold',
    layout: 'fullwidth',
    accent: '#f8fafc',
    bg: 'radial-gradient(circle at 12% 4%, rgba(255,255,255,.10), transparent 24%), linear-gradient(135deg, #0a0a0b 0%, #171717 44%, #050505 100%)',
    cardBg: 'rgba(10,10,11,.88)',
    border: '2px solid rgba(248,250,252,.92)',
    shadow: '12px 12px 0 rgba(248,250,252,.10)',
    cssVars: '--pf-agent-accent:#f8fafc;--pf-agent-accent-2:#d4d4d8;--pf-agent-ink:#fafafa;--pf-agent-muted:#d4d4d8;',
    title: 'Neo-brutalist system',
    subtitle: 'A sharp charcoal interface with luminous type, hard edges, and disciplined motion.',
  },
  'brutalist-grid': {
    theme: 'clean',
    layout: 'grid',
    accent: '#111827',
    bg: 'linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)',
    cardBg: '#ffffff',
    border: '2px solid rgba(17,24,39,.92)',
    shadow: '10px 10px 0 rgba(17,24,39,.18)',
    cssVars: '--pf-agent-accent:#111827;--pf-agent-accent-2:#dc2626;--pf-agent-ink:#111827;--pf-agent-muted:#4b5563;',
    title: 'Brutalist grid',
    subtitle: 'A sharp portfolio with confident blocks, high contrast, and direct hierarchy.',
  },
  'warm-minimal': {
    theme: 'minimal',
    layout: 'classic',
    accent: '#b45309',
    bg: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 48%, #fef3c7 100%)',
    cardBg: 'rgba(255,255,255,.82)',
    border: '1px solid rgba(180,83,9,.13)',
    shadow: '0 22px 60px rgba(120,53,15,.10)',
    cssVars: '--pf-agent-accent:#b45309;--pf-agent-accent-2:#0f766e;--pf-agent-ink:#1f2937;--pf-agent-muted:#6b5f4a;',
    title: 'Warm minimal',
    subtitle: 'A calm personal site with generous spacing, useful details, and understated polish.',
  },
  'launch-pad': {
    theme: 'clean',
    layout: 'fullwidth',
    accent: '#2563eb',
    bg: 'radial-gradient(circle at 12% 0%, rgba(37,99,235,.18), transparent 30%), radial-gradient(circle at 92% 8%, rgba(16,185,129,.16), transparent 28%), #f8fafc',
    cardBg: 'rgba(255,255,255,.88)',
    border: '1px solid rgba(37,99,235,.14)',
    shadow: '0 22px 65px rgba(37,99,235,.14)',
    cssVars: '--pf-agent-accent:#2563eb;--pf-agent-accent-2:#10b981;--pf-agent-ink:#0f172a;--pf-agent-muted:#5b677a;',
    title: 'Product launch page',
    subtitle: 'A sharp, conversion-minded portfolio that reads like a polished product site.',
  },
  terminal: {
    theme: 'bold',
    layout: 'sidebar',
    accent: '#34d399',
    bg: 'radial-gradient(circle at top left, rgba(52,211,153,.18), transparent 34%), #020617',
    cardBg: 'rgba(2, 6, 23, 0.82)',
    border: '1px solid rgba(52,211,153,.22)',
    shadow: '0 24px 80px rgba(0,0,0,.45)',
    cssVars: '--pf-agent-accent:#34d399;--pf-agent-accent-2:#67e8f9;--pf-agent-ink:#ecfdf5;--pf-agent-muted:#a7f3d0;',
    title: 'Terminal workspace',
    subtitle: 'A developer-forward site with command-line structure and precise technical storytelling.',
  },
  'creative-studio': {
    theme: 'clean',
    layout: 'grid',
    accent: '#db2777',
    bg: 'radial-gradient(circle at 8% 8%, rgba(219,39,119,.18), transparent 28%), radial-gradient(circle at 88% 12%, rgba(245,158,11,.18), transparent 30%), #fff7ed',
    cardBg: 'rgba(255,255,255,.78)',
    border: '1px solid rgba(219,39,119,.16)',
    shadow: '0 26px 70px rgba(157,23,77,.14)',
    cssVars: '--pf-agent-accent:#db2777;--pf-agent-accent-2:#f59e0b;--pf-agent-ink:#18181b;--pf-agent-muted:#6b5b66;',
    title: 'Creative studio',
    subtitle: 'A vivid portfolio with expressive cards, layered sections, and high-energy polish.',
  },
  'premium-studio': {
    theme: 'bold',
    layout: 'magazine',
    accent: '#8b5cf6',
    bg: 'radial-gradient(circle at 18% 0%, rgba(139,92,246,.22), transparent 32%), linear-gradient(135deg, #030712 0%, #111827 48%, #020617 100%)',
    cardBg: 'rgba(17,24,39,.78)',
    border: '1px solid rgba(255,255,255,.12)',
    shadow: '0 30px 90px rgba(0,0,0,.38)',
    cssVars: '--pf-agent-accent:#8b5cf6;--pf-agent-accent-2:#06b6d4;--pf-agent-ink:#f9fafb;--pf-agent-muted:#cbd5e1;',
    title: 'Premium studio',
    subtitle: 'A cinematic personal site with depth, contrast, and polished interaction.',
  },
};

const inferDesignDirection = (prompt) => {
  const text = String(prompt || '').toLowerCase();
  if (/\b(neon|cyber|cyberpunk|sci-fi|science fiction|holographic|glowing)\b/.test(text)) return 'neon-lab';
  if (/\b(ancient|rome|roman|classical|museum|archive|artifact|historical|renaissance|gallery)\b/.test(text)) return 'classical-museum';
  if (/\b(wild west|cowboy|desert|western|saloon|frontier|cactus|saddle)\b/.test(text)) return 'western-desert';
  if (/\b(rainbow|prismatic|multicolor|multi-color|color spectrum)\b/.test(text)) return 'rainbow';
  if (/\b(neo[- ]?brutalist|neo[- ]?brutalism)\b/.test(text)
    || (/\b(brutalist|brutalism)\b/.test(text) && /\b(dark|charcoal|black|high contrast|luminous|white typography)\b/.test(text))) return 'neo-brutalist-dark';
  if (/\b(brutalist|brutalism|bold blocks?|poster|swiss|grid)\b/.test(text)) return 'brutalist-grid';
  if (/\b(warm|calm|soft|minimal|minimalist|earthy|organic)\b/.test(text)) return 'warm-minimal';
  if (/\b(editorial|magazine|writer|writing|journal|case study|case-study)\b/.test(text)) return 'editorial';
  if (/\b(startup|saas|product|founder|launch|landing|conversion)\b/.test(text)) return 'launch-pad';
  if (/\b(terminal|cli|command|hacker|developer|devtools?|backend)\b/.test(text)) return 'terminal';
  if (/\b(playful|creative|colorful|artist|designer|portfolio gallery|vibrant)\b/.test(text)) return 'creative-studio';
  return 'premium-studio';
};

const buildIntegratedSectionOrder = (currentOrder = DEFAULT_SECTION_ORDER, generatedIds = []) => {
  const cleanGenerated = [...new Set((Array.isArray(generatedIds) ? generatedIds : [])
    .map((id) => sanitizeId(id, ''))
    .filter(Boolean))];
  const base = (Array.isArray(currentOrder) && currentOrder.length ? currentOrder : DEFAULT_SECTION_ORDER)
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const order = [];
  const push = (id) => {
    if (!id || order.includes(id)) return;
    order.push(id);
  };

  if (base.includes('header')) push('header');
  else push('header');

  cleanGenerated.forEach(push);
  base.forEach((id) => {
    if (id === 'header') return;
    if (NATIVE_SECTION_IDS.has(id) || cleanGenerated.includes(id)) push(id);
  });

  if (!order.includes('projects')) {
    const contactIndex = order.indexOf('contact');
    if (contactIndex >= 0) order.splice(contactIndex, 0, 'projects');
    else push('projects');
  }
  if (!order.includes('contact')) push('contact');

  return order;
};

const buildAgentSections = (direction, prompt, context = {}) => {
  const user = context.user || {};
  const projects = Array.isArray(context.projects) ? context.projects : [];
  const name = user.full_name || 'this builder';
  const directionKey = inferDesignDirection(prompt);
  const featuredIds = projects.filter((project) => project.is_featured).map((project) => project.id).filter(Boolean);
  const projectIds = (featuredIds.length ? featuredIds : projects.map((project) => project.id).filter(Boolean)).slice(0, 4);
  const projectTitles = projects.map((project) => project.title).filter(Boolean).slice(0, 3);
  const primarySkills = Array.isArray(user.skills) && user.skills.length ? user.skills.slice(0, 4).join(', ') : 'the strongest public work';
  const projectCount = projects.length;
  const contactHref = user.contact_email ? `mailto:${user.contact_email}` : user.website || '#contact';

  const sections = [
    {
      id: 'agent-positioning-hero',
      type: 'hero',
      variant: directionKey === 'launch-pad' ? 'product' : directionKey === 'editorial' ? 'editorial' : 'split',
      layout: { density: 'spacious', emphasis: 'high', align: direction.layout === 'magazine' ? 'split' : 'left' },
      title: direction.title,
      subtitle: direction.subtitle,
      content: {
        kicker: directionKey === 'classical-museum' ? 'Curated portfolio' : directionKey === 'terminal' ? 'ProjectFolio system' : 'Personal site direction',
        heading: user.headline || `${name}'s public work, organized for faster trust.`,
        text: `${name}'s portfolio should lead with ${primarySkills}, then move visitors into ${projectTitles.length ? projectTitles.join(', ') : 'published project evidence'} and a clear contact step.`,
        actions: [
          { label: projectCount ? 'View selected work' : 'View projects', href: '#projects' },
          { label: 'Contact', href: contactHref },
        ],
        highlights: [
          { label: 'Projects', value: String(Math.max(projectCount, 1)) },
          { label: 'Focus', value: Array.isArray(user.skills) && user.skills[0] ? user.skills[0] : 'Portfolio' },
        ],
      },
      enabled: true,
    },
  ];

  const directionModules = {
    'neon-lab': [
      {
        id: 'agent-signal-map',
        type: 'skillMatrix',
        variant: 'toolbox',
        layout: { columns: 3, density: 'comfortable', emphasis: 'medium' },
        title: 'Signal map',
        subtitle: 'A focused technical layer for the requested neon direction.',
        content: {
          groups: [
            { title: 'Core stack', skills: Array.isArray(user.skills) ? user.skills.slice(0, 5) : [], note: 'Fast scan for technical visitors.' },
            { title: 'Project proof', skills: projectTitles, note: 'Routes attention into public builds.' },
          ],
        },
        enabled: true,
      },
    ],
    editorial: [
      {
        id: 'agent-editorial-note',
        type: 'caseStudy',
        variant: 'spotlight',
        layout: { density: 'spacious', emphasis: 'high', align: 'left' },
        title: 'Point of view',
        subtitle: 'A more human introduction before visitors inspect the work.',
        content: {
          projectIds,
          items: projects.slice(0, 2).map((project) => ({
            projectId: project.id,
            title: project.title,
            problem: project.tagline || 'A public project visitors can evaluate quickly.',
            solution: `Frame the work around ${project.technologies?.slice?.(0, 3)?.join(', ') || 'the technical choices'} and the decisions behind it.`,
            impact: project.description || 'Give visitors enough context to understand why the project matters.',
          })),
        },
        enabled: true,
      },
    ],
    'classical-museum': [
      {
        id: 'agent-collection',
        type: 'proofWall',
        variant: 'evidenceGrid',
        layout: { columns: 3, density: 'comfortable', emphasis: 'medium' },
        title: 'Curated collection',
        subtitle: 'A museum-inspired structure that treats each project like an artifact.',
        content: {
          items: [
            { value: 'I', label: 'Entry plaque', text: `${name}'s headline and bio become the interpretive label.` },
            { value: 'II', label: 'Selected artifacts', text: projectTitles.length ? `Lead with ${projectTitles.join(', ')}.` : 'Show public work as a curated collection.' },
            { value: 'III', label: 'Patron path', text: 'Keep contact calm, visible, and intentional.' },
          ],
        },
        enabled: true,
      },
    ],
    'western-desert': [
      {
        id: 'agent-trail-map',
        type: 'process',
        variant: 'rail',
        layout: { density: 'comfortable', emphasis: 'high', align: 'split' },
        title: 'Trail map',
        subtitle: 'A western-themed route through the existing public portfolio.',
        content: {
          items: [
            { step: '01', title: 'Open the profile', text: user.headline || 'Start with the current public identity.' },
            { step: '02', title: 'Inspect the projects', text: projectTitles.length ? `Ride into ${projectTitles.join(', ')}.` : 'Use the project grid as the main evidence trail.' },
            { step: '03', title: 'Send a signal', text: 'End with a clear contact card instead of invented lore.' },
          ],
        },
        enabled: true,
      },
    ],
    rainbow: [
      {
        id: 'agent-spectrum-map',
        type: 'skillMatrix',
        variant: 'clusters',
        layout: { columns: 3, density: 'comfortable', emphasis: 'medium' },
        title: 'Spectrum map',
        subtitle: 'A color-coded layer that keeps the existing skills and projects readable.',
        content: {
          groups: [
            { title: 'Red to orange', skills: Array.isArray(user.skills) ? user.skills.slice(0, 3) : [], note: 'High-energy entry points.' },
            { title: 'Green to blue', skills: projectTitles, note: 'Project proof remains central.' },
            { title: 'Indigo to violet', skills: ['Contact', 'Links', 'Next step'], note: 'The site still ends with action.' },
          ],
        },
        enabled: true,
      },
    ],
    'brutalist-grid': [
      {
        id: 'agent-grid-system',
        type: 'comparison',
        variant: 'matrix',
        layout: { columns: 4, density: 'compact', emphasis: 'high' },
        title: 'Grid system',
        subtitle: 'Strong blocks, direct labels, and a no-nonsense path through the work.',
        content: {
          columns: [
            { title: 'Before', items: ['Standard portfolio rhythm', 'Cards feel similar', 'Lower hierarchy'] },
            { title: 'After', items: ['Sharper blocks', 'Inspectable project cards', 'Direct contact path'] },
          ],
        },
        enabled: true,
      },
    ],
    'neo-brutalist-dark': [
      {
        id: 'agent-motion-system',
        type: 'featureGrid',
        variant: 'processGrid',
        layout: { columns: 3, density: 'comfortable', emphasis: 'high' },
        title: 'Interaction system',
        subtitle: 'The requested motion and visual rules, implemented as ProjectFolio-native surfaces.',
        content: {
          items: [
            { icon: '01', title: 'High contrast', text: 'Deep charcoal surfaces, crisp white type, and strong grid alignment.' },
            { icon: '02', title: 'Smooth motion', text: 'Native reveal and hover interactions with reduced-motion safeguards.' },
            { icon: '03', title: 'Sharp UI', text: 'Hard-edged cards, fixed glass navigation, and uncluttered whitespace.' },
          ],
        },
        enabled: true,
      },
    ],
    'warm-minimal': [
      {
        id: 'agent-focus-note',
        type: 'process',
        variant: 'steps',
        layout: { density: 'comfortable', emphasis: 'medium', align: 'split' },
        title: 'Quiet focus',
        subtitle: 'A warmer structure that lets the profile and projects breathe.',
        content: {
          items: [
            { step: '01', title: 'Read the person', text: 'Give the headline, bio, and skills more breathing room.' },
            { step: '02', title: 'Inspect the work', text: 'Let project cards carry the proof without visual clutter.' },
            { step: '03', title: 'Start the next step', text: 'Keep contact clear and low-pressure.' },
          ],
        },
        enabled: true,
      },
    ],
    'launch-pad': [
      {
        id: 'agent-offer-stack',
        type: 'proofWall',
        variant: 'signalStack',
        layout: { columns: 4, density: 'spacious', emphasis: 'high' },
        title: 'What visitors get fast',
        subtitle: 'A launch-page style breakdown of value, proof, and next steps.',
        content: {
          items: [
            { value: '01', label: 'Positioning', text: user.headline || 'Clarify the public role and audience.' },
            { value: '02', label: 'Evidence', text: projectTitles.length ? projectTitles.join(', ') : 'Make published work easier to inspect.' },
            { value: '03', label: 'Conversion', text: 'Keep the next click obvious after proof.' },
          ],
        },
        enabled: true,
      },
    ],
    terminal: [
      {
        id: 'agent-command-menu',
        type: 'process',
        variant: 'rail',
        layout: { density: 'compact', emphasis: 'medium' },
        title: 'Command menu',
        subtitle: 'A developer-forward navigation layer for technical visitors.',
        content: {
          items: [
            { step: '$', title: 'grep skills', text: primarySkills },
            { step: '$', title: 'run projects', text: projectTitles.length ? projectTitles.join(', ') : 'Open the published project grid.' },
            { step: '$', title: 'open contact', text: 'Finish with a clear contact command.' },
          ],
        },
        enabled: true,
      },
    ],
    'creative-studio': [
      {
        id: 'agent-studio-wall',
        type: 'mediaFeature',
        variant: 'poster',
        layout: { columns: 4, density: 'spacious', emphasis: 'high' },
        title: 'Studio wall',
        subtitle: 'A more expressive composition that gives the portfolio visual rhythm.',
        content: {
          eyebrow: 'Creative system',
          heading: user.headline || `${name}'s work as a designed collection`,
          text: 'Use expressive color, tactile cards, and alternating proof sections while preserving editable ProjectFolio data.',
          points: ['Expressive identity', 'Curated pacing', 'Project gallery'],
        },
        enabled: true,
      },
    ],
    'premium-studio': [
      {
        id: 'agent-premium-proof',
        type: 'proofWall',
        variant: 'metricCards',
        layout: { columns: 2, density: 'comfortable', emphasis: 'high' },
        title: 'AI engineering proof',
        subtitle: 'A concise credibility layer that stays tied to existing skills and projects.',
        content: {
          items: [
            { value: Array.isArray(user.skills) ? String(user.skills.length || 1) : '1+', label: 'Skill signals', text: primarySkills },
            { value: String(Math.max(projectCount, 1)), label: 'Project stories', text: projectTitles.length ? projectTitles.join(', ') : 'Published work gets stronger presentation.' },
          ],
        },
        enabled: true,
      },
    ],
  };

  sections.push(...(directionModules[directionKey] || []));
  if (projectIds.length) {
    sections.push({
      id: 'agent-selected-work',
      type: 'featuredProjects',
      variant: direction.layout === 'fullwidth' ? 'horizontalScroll' : 'caseStudyList',
      layout: { density: 'spacious', emphasis: 'high' },
      title: directionKey === 'classical-museum' ? 'Selected artifacts' : 'Selected work',
      subtitle: 'A prompt-specific bridge into the strongest existing projects.',
      content: { projectIds, limit: 3 },
      enabled: true,
    });
  } else {
    sections.push({
      id: 'agent-cta',
      type: 'cta',
      variant: direction.layout === 'fullwidth' ? 'banner' : 'split',
      layout: { density: 'spacious', emphasis: 'high', align: 'split' },
      title: 'Start a conversation',
      content: {
        heading: 'Have a role, project, or collaboration in mind?',
        text: 'This portfolio is structured to make the next step obvious.',
        label: 'Get in touch',
        href: user.contact_email ? `mailto:${user.contact_email}` : user.website || '#',
      },
      enabled: true,
    });
  }

  return sections.filter((section) => section.enabled !== false).slice(0, 3);
};

const buildFallbackAgentPlan = (direction, prompt, context = {}, siteSections = null) => {
  const user = context.user || {};
  const projectCount = Array.isArray(context.projects) ? context.projects.length : 0;
  const plannedSections = Array.isArray(siteSections) ? siteSections : buildAgentSections(direction, prompt, context);
  return sanitizeAgentPlan({
    designBrief: {
      goal: `Turn ${user.full_name || 'the portfolio'} into a more distinctive personal website that matches the user's request.`,
      audience: 'Recruiters, collaborators, clients, and visitors who need to understand the work quickly.',
      tone: direction.subtitle,
      styleDirection: inferDesignDirection(prompt),
      constraints: [
        'Keep ProjectFolio native settings compatible with manual controls.',
        'Use structured sections and theme overrides before raw custom code.',
        'Preserve existing projects and public profile data unless the user asks to edit them.',
      ],
    },
    sitePlan: {
      sections: [
        { id: 'header', role: 'identity', type: 'native', layoutIntent: 'Make the first viewport memorable and immediately explain who the user is.' },
        ...plannedSections.map((section) => ({
          id: section.id,
          role: section.type === 'featuredProjects'
            ? 'proof'
            : section.type === 'stats' || section.type === 'testimonial'
              ? 'credibility'
              : section.type === 'cta'
                ? 'conversion'
                : section.type === 'timeline'
                  ? 'narrative'
                  : 'positioning',
          type: section.type,
          layoutIntent: section.subtitle || section.title || 'Add a structured native section.',
        })),
        { id: 'projects', role: 'proof', type: 'native', layoutIntent: `Present ${Math.max(projectCount, 1)} project${projectCount === 1 ? '' : 's'} with stronger card hierarchy.` },
        { id: 'contact', role: 'conversion', type: 'native', layoutIntent: 'Make the next step easy.' },
      ],
      primaryCta: 'Get in touch',
      contentHierarchy: ['identity', 'positioning', 'proof', 'process', 'contact'],
    },
    designSystem: {
      direction: inferDesignDirection(prompt),
      tokens: {
        background: direction.bg,
        surface: direction.cardBg,
        accent: direction.accent,
        border: direction.border,
        shadow: direction.shadow,
        sectionGap: 'clamp(48px, 8vw, 104px)',
      },
      typography: {
        headingScale: 'display',
        bodyDensity: 'comfortable',
      },
      componentVariants: {
        header: 'cinematic-panel',
        projectCard: 'layered-hover-card',
        sectionHeading: 'rule-with-subtitle',
        tags: 'accent-pills',
      },
      motion: {
        entrance: 'fade-up',
        hover: 'lift-or-tilt',
      },
    },
  });
};

const buildAgentDesignCss = (direction, prompt) => {
  const wantsMotion = /\b(animated?|motion|interactive|dynamic|alive|effect|particles?|cursor|glow)\b/i.test(prompt || '');
  return [
    '.pf-portfolio {',
    `  ${direction.cssVars}`,
    '  color: var(--pf-agent-ink);',
    '  background-attachment: fixed;',
    '  overflow-x: hidden;',
    '}',
    '.pf-nav {',
    '  position: sticky;',
    '  top: 0;',
    '  z-index: 20;',
    '  border-color: rgba(255,255,255,.10);',
    '  background: color-mix(in srgb, var(--pf-bg) 82%, transparent);',
    '  backdrop-filter: blur(18px);',
    '  -webkit-backdrop-filter: blur(18px);',
    '  box-shadow: 0 10px 35px rgba(15,23,42,.08);',
    '}',
    '.pf-main {',
    '  position: relative;',
    '  padding-top: clamp(24px, 4vw, 64px);',
    '}',
    '.pf-header {',
    '  position: relative;',
    '  overflow: hidden;',
    '  border: 1px solid rgba(255,255,255,.12);',
    '  border-radius: clamp(28px, 5vw, 56px);',
    '  padding: clamp(42px, 8vw, 96px) !important;',
    '  box-shadow: 0 35px 110px rgba(15,23,42,.22);',
    '  isolation: isolate;',
    '}',
    '.pf-header::before {',
    '  content: "";',
    '  position: absolute;',
    '  inset: -35%;',
    '  background: radial-gradient(circle at 20% 20%, var(--pf-agent-accent), transparent 24%), radial-gradient(circle at 82% 18%, var(--pf-agent-accent-2), transparent 22%);',
    '  opacity: .22;',
    '  filter: blur(14px);',
    '  z-index: -1;',
    '}',
    '.pf-avatar {',
    '  border-radius: 28px !important;',
    '  border: 1px solid rgba(255,255,255,.22);',
    '  box-shadow: 0 20px 60px rgba(0,0,0,.22);',
    '  transform: rotate(-2deg);',
    '}',
    '.pf-name {',
    '  max-width: 900px;',
    '  font-size: clamp(3rem, 8vw, 6.8rem) !important;',
    '  line-height: .88 !important;',
    '  letter-spacing: -0.04em;',
    '}',
    '.pf-headline {',
    '  max-width: 760px;',
    '  font-size: clamp(1.1rem, 2vw, 1.45rem) !important;',
    '  color: var(--pf-agent-muted) !important;',
    '}',
    '.pf-bio {',
    '  max-width: 760px;',
    '  font-size: 1rem;',
    '  color: var(--pf-agent-muted) !important;',
    '}',
    '.pf-skill-tag, .pf-tech-tag {',
    '  border: 1px solid color-mix(in srgb, var(--pf-agent-accent) 35%, transparent);',
    '  background: color-mix(in srgb, var(--pf-agent-accent) 14%, transparent) !important;',
    '  color: var(--pf-agent-ink) !important;',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,.16);',
    '}',
    '.pf-section {',
    '  position: relative;',
    '  scroll-margin-top: 90px;',
    '}',
    '.pf-section-heading {',
    '  display: flex;',
    '  align-items: end;',
    '  justify-content: space-between;',
    '  gap: 24px;',
    '  border-bottom: 1px solid color-mix(in srgb, var(--pf-agent-accent) 24%, transparent);',
    '  padding-bottom: 18px;',
    '}',
    '.pf-section-title {',
    '  font-size: clamp(1.8rem, 4vw, 3.4rem) !important;',
    '  letter-spacing: -0.035em;',
    '}',
    '.pf-section-subtitle {',
    '  max-width: 560px;',
    '  color: var(--pf-agent-muted) !important;',
    '}',
    '.pf-projects {',
    '  align-items: stretch;',
    '}',
    '.pf-project-card, .pf-hero-card, .pf-feature-card, .pf-proof-card, .pf-case-card, .pf-process-step, .pf-stat-card, .pf-text-card, .pf-testimonial-card, .pf-contact-card, .pf-credential-card, .pf-endorsement-card, .pf-comparison-card, .pf-faq-item, .pf-skill-matrix-card, .pf-media-feature, .pf-cta-card {',
    '  position: relative;',
    '  overflow: hidden;',
    '  border: 1px solid color-mix(in srgb, var(--pf-agent-accent) 22%, transparent) !important;',
    '  background: linear-gradient(145deg, color-mix(in srgb, var(--pf-card-bg) 88%, white 12%), color-mix(in srgb, var(--pf-card-bg) 92%, black 8%)) !important;',
    '  box-shadow: 0 24px 70px rgba(15,23,42,.14) !important;',
    '  transition: transform .32s cubic-bezier(.2,.8,.2,1), border-color .22s ease, background-color .22s ease, color .22s ease, box-shadow .32s ease;',
    '  will-change: transform;',
    '}',
    '.pf-project-card::after, .pf-feature-card::after, .pf-proof-card::after, .pf-stat-card::after, .pf-credential-card::after, .pf-endorsement-card::after {',
    '  content: "";',
    '  position: absolute;',
    '  inset: 0;',
    '  background: linear-gradient(120deg, transparent, color-mix(in srgb, var(--pf-agent-accent) 12%, transparent), transparent);',
    '  opacity: 0;',
    '  transform: translateX(-30%);',
    '  transition: opacity .25s ease, transform .45s ease;',
    '  pointer-events: none;',
    '}',
    '.pf-project-card:hover::after, .pf-feature-card:hover::after, .pf-proof-card:hover::after, .pf-stat-card:hover::after, .pf-credential-card:hover::after, .pf-endorsement-card:hover::after {',
    '  opacity: 1;',
    '  transform: translateX(30%);',
    '}',
    '.pf-project-card:hover, .pf-feature-card:hover, .pf-proof-card:hover, .pf-case-card:hover, .pf-process-step:hover, .pf-credential-card:hover, .pf-endorsement-card:hover, .pf-contact-card:hover {',
    '  transform: translateY(-8px) scale(1.01);',
    '  border-color: color-mix(in srgb, var(--pf-agent-accent) 46%, transparent) !important;',
    '}',
    '.pf-hero-action, .pf-contact-link, .pf-cta-link, .pf-link-item, .pf-case-link {',
    '  transition: transform .24s cubic-bezier(.2,.8,.2,1), filter .2s ease, background-color .2s ease, color .2s ease;',
    '  will-change: transform;',
    '}',
    '.pf-hero-action:hover, .pf-contact-link:hover, .pf-cta-link:hover, .pf-link-item:hover, .pf-case-link:hover {',
    '  transform: translateY(-2px) scale(1.03);',
    '  filter: invert(.04) saturate(1.2);',
    '}',
    '.pf-project-media {',
    '  min-height: 220px;',
    '  background: radial-gradient(circle at 28% 20%, var(--pf-agent-accent), transparent 22%), linear-gradient(135deg, var(--pf-agent-accent-2), transparent) !important;',
    '}',
    '.pf-project-title {',
    '  letter-spacing: -0.025em;',
    '}',
    '.pf-custom-section {',
    '  margin-top: clamp(48px, 8vw, 104px) !important;',
    '}',
    '.pf-feature-grid, .pf-stats-grid {',
    '  gap: clamp(16px, 2vw, 28px) !important;',
    '}',
    '.pf-variant-bento .pf-feature-card:first-child {',
    '  min-height: 280px;',
    '  display: flex;',
    '  flex-direction: column;',
    '  justify-content: flex-end;',
    '}',
    '.pf-variant-editorialnumbers .pf-stat-card {',
    '  text-align: left !important;',
    '  border: 1px solid color-mix(in srgb, var(--pf-agent-accent) 32%, transparent) !important;',
    '  background: color-mix(in srgb, var(--pf-agent-accent) 6%, transparent);',
    '}',
    '.pf-variant-roadmap .pf-timeline-item {',
    '  min-height: 180px;',
    '}',
    '.pf-variant-split .pf-cta-card, .pf-variant-split .pf-text-card {',
    '  align-items: center;',
    '}',
    '.pf-feature-icon {',
    '  width: 44px;',
    '  height: 44px;',
    '  display: grid;',
    '  place-items: center;',
    '  border-radius: 16px;',
    '  background: color-mix(in srgb, var(--pf-agent-accent) 18%, transparent);',
    '  color: var(--pf-agent-accent);',
    '  font-size: .78rem;',
    '  font-weight: 800;',
    '}',
    '.pf-stat-value {',
    '  font-size: clamp(2rem, 5vw, 4rem) !important;',
    '  line-height: .95;',
    '}',
    '.pf-timeline-list {',
    '  border-left: 1px solid color-mix(in srgb, var(--pf-agent-accent) 24%, transparent);',
    '  padding-left: 28px;',
    '}',
    '.pf-timeline-item {',
    '  padding: 18px 0;',
    '}',
    '.pf-timeline-dot {',
    '  margin-left: -35px;',
    '  box-shadow: 0 0 0 8px color-mix(in srgb, var(--pf-agent-accent) 12%, transparent);',
    '}',
    '.pf-education, .pf-endorsements {',
    '  color: var(--pf-agent-ink);',
    '}',
    '.pf-contact-card, .pf-credential-card, .pf-endorsement-card, .pf-cta-card {',
    '  padding: clamp(34px, 6vw, 72px) !important;',
    '}',
    '.pf-contact-link, .pf-cta-link {',
    '  transform: translateZ(0);',
    '  box-shadow: 0 12px 34px color-mix(in srgb, var(--pf-agent-accent) 26%, transparent);',
    '}',
    direction.extraCss || '',
    wantsMotion ? '.pf-section, .pf-project-card { animation: pfAgentFadeUp .72s ease both; }' : '',
    wantsMotion ? '.pf-project-card:nth-child(2) { animation-delay: .06s; } .pf-project-card:nth-child(3) { animation-delay: .12s; }' : '',
    wantsMotion ? '@keyframes pfAgentFadeUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }' : '',
    '@media (max-width: 760px) {',
    '  .pf-header { padding: 32px !important; border-radius: 28px; }',
    '  .pf-section-heading { display: block; }',
    '  .pf-name { font-size: clamp(2.6rem, 16vw, 4rem) !important; }',
    '  .pf-project-card, .pf-feature-card, .pf-proof-card, .pf-credential-card, .pf-endorsement-card { transform: none !important; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .pf-section, .pf-project-card { animation: none !important; }',
    '  .pf-project-card, .pf-feature-card, .pf-proof-card, .pf-credential-card, .pf-endorsement-card, .pf-hero-action, .pf-contact-link, .pf-cta-link { transition: none !important; }',
    '}',
  ].filter(Boolean).join('\n');
};

const buildFallbackAgentResponse = (prompt, context = {}) => {
  const text = String(prompt || '').toLowerCase();
  const intent = classifyAgentIntent(prompt);
  const direction = DESIGN_DIRECTIONS[inferDesignDirection(prompt)];
  const wantsFullRedesign = /\b(redesign|design|site|website|theme|make it|transform|portfolio|landing|ui|ux|creative|premium|modern|distinct|unique|beautiful)\b/.test(text);
  const wantsParticles = /\b(particle|particles|sparkle|stars|background effect)\b/.test(text);
  const wantsCursor = /\b(cursor|mouse|glow)\b/.test(text);
  const wantsMotion = /\b(scroll|reveal|fade in|animate in|animated?|motion|interactive|dynamic|alive|transition|zoom)\b/.test(text);
  const wantsTransition = /\b(transition|zoom|open|close|opens|closes|enter|exit)\b/.test(text);
  const actions = [];
  const siteSections = buildAgentSections(direction, prompt, context);
  const sectionIds = siteSections.map((section) => section.id);
  const fallbackPlan = buildFallbackAgentPlan(direction, prompt, context, siteSections);
  const currentSectionOrder = parseJson(context.settings?.section_order, DEFAULT_SECTION_ORDER);

  if (intent.id !== 'fullRedesign') {
    const interactionPatch = [];
    if (wantsMotion) interactionPatch.push({ type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp', stagger: 60, duration: 520 });
    if (wantsMotion || /\b(hover|micro|button|link|card)\b/.test(text)) interactionPatch.push({ type: 'microInteractions', target: '.pf-project-card', effect: 'lift' });
    if (wantsTransition) interactionPatch.push({ type: 'pageTransition', effect: /\b(zoom|scale)\b/.test(text) ? 'scale' : 'fade', duration: 220 });
    if (/\b(nav|navigation|header)\b/.test(text) && /\b(hide|auto-hide|autohide|scroll)\b/.test(text)) {
      interactionPatch.push({ type: 'navAutoHide', threshold: 24 });
    }
    if (wantsParticles) interactionPatch.push({ type: 'ambientParticles', density: 'low' });
    if (wantsCursor) interactionPatch.push({ type: 'cursorGlow', size: 180, opacity: 0.14 });
    const safeInteractionPatch = sanitizeInteractions(interactionPatch);

    if (intent.id === 'siteStyle') {
      actions.push({
        type: 'settings.patch',
        patch: {
          theme: direction.theme,
          accent_color: direction.accent,
          layout: direction.layout,
          section_config: {
            header: { bg: 'none', spacing: 'spacious' },
            projects: { columns: direction.layout === 'grid' ? '3' : '2', card_style: 'rounded', spacing: 'loose', show_tagline: true },
            contact: { bg: 'none' },
          },
          design_system: fallbackPlan.designSystem,
          interactions: [
            ...(wantsMotion ? [{ type: 'scrollReveal', target: '.pf-section', effect: /\b(zoom|scale)\b/.test(text) ? 'zoomIn' : 'fadeUp', stagger: 70, duration: 560 }] : []),
            { type: 'microInteractions', target: '.pf-project-card', effect: /\b(invert|high contrast)\b/.test(text) ? 'invert' : 'lift' },
            ...(wantsTransition ? [{ type: 'pageTransition', effect: /\b(zoom|scale)\b/.test(text) ? 'scale' : 'fade', duration: 220 }] : []),
            ...(wantsParticles
              ? [{ type: 'ambientParticles', density: 'low' }]
              : [{ type: 'gradientMesh', opacity: 0.22 }]),
            ...(wantsCursor ? [{ type: 'cursorGlow', size: 200, opacity: 0.14 }] : []),
          ].slice(0, 4),
        },
      });
      actions.push({
        type: 'customization.patch',
        patch: {
          themeOverridesPatch: {
            pageBackground: direction.bg,
            cardBackground: direction.cardBg,
            cardBorder: direction.border,
            cardShadow: direction.shadow,
            headerGradient: direction.bg,
            headerTextColor: direction.theme === 'bold' ? '#f8fafc' : '#111827',
            accentColor: direction.accent,
            projectsGap: 'clamp(18px, 3vw, 34px)',
            sectionPadding: 'clamp(28px, 4vw, 56px)',
          },
          animationsPatch: {
            cardEntrance: wantsMotion ? 'fadeUp' : 'none',
            cardHover: wantsTransition || wantsMotion ? 'tilt' : 'lift',
            pageBackground: wantsParticles ? 'particles' : 'gradient-shift',
          },
          cssBlocks: [{ id: `agent-${inferDesignDirection(prompt)}-site-style`, css: buildAgentDesignCss(direction, prompt) }],
          removeBlocks: [],
          description: `Applies the ${direction.title.toLowerCase()} visual system without adding new sections.`,
        },
      });
      actions.push({
        type: 'memory.upsert',
        kind: 'preference',
        content: `User asked for a portfolio-wide ${direction.title.toLowerCase()} style: ${String(prompt || '').slice(0, 220)}`,
      });

      return {
        reply: 'I prepared a portfolio-wide native visual system for review without adding extra sections.',
        summary: `${direction.title} visual system`,
        threadTitle: direction.title,
        designBrief: fallbackPlan.designBrief,
        sitePlan: fallbackPlan.sitePlan,
        designSystem: fallbackPlan.designSystem,
        actions,
        errors: [],
        warnings: [],
      };
    }

    if (intent.id === 'sectionAdd') {
      actions.push({
        type: 'settings.patch',
        patch: {
          section_order: buildIntegratedSectionOrder(currentSectionOrder, ['agent-added-section']),
          site_sections: [{
            id: 'agent-added-section',
            type: /\b(faq|question)\b/.test(text) ? 'faq' : /\b(skill|stack|tool)\b/.test(text) ? 'skillMatrix' : 'text',
            variant: /\b(faq|question)\b/.test(text) ? 'cards' : /\b(skill|stack|tool)\b/.test(text) ? 'clusters' : 'spotlight',
            layout: { density: 'comfortable', emphasis: 'medium' },
            title: 'New portfolio section',
            subtitle: 'A focused section added from your request.',
            content: /\b(faq|question)\b/.test(text)
              ? { items: [{ question: 'What should visitors know first?', answer: 'Add your specific answer here or ask the agent to refine it with details.' }] }
              : /\b(skill|stack|tool)\b/.test(text)
                ? { groups: [{ title: 'Core tools', skills: context.user?.skills || [], note: 'Pulled from the current profile.' }] }
                : { text: 'A focused placeholder section. Share the exact points to include and the agent can rewrite it without inventing details.' },
            enabled: true,
          }],
          ...(safeInteractionPatch.length ? { interactions: safeInteractionPatch } : {}),
        },
      });
    } else if (safeInteractionPatch.length) {
      actions.push({ type: 'settings.patch', patch: { interactions: safeInteractionPatch } });
    }

    const hasTargetedSignal = intent.id === 'sectionAdd'
      || safeInteractionPatch.length > 0
      || wantsParticles
      || /\b(rounded|radius|dark|shadow|depth|premium|hover|lift)\b/.test(text);
    if (!hasTargetedSignal) {
      return {
        reply: 'I could not turn this request into a meaningful ProjectFolio change locally, and the selected AI model was unavailable. Try again in a moment, or rephrase with concrete visual details (specific colors, surfaces, sections, or effects).',
        summary: 'No change generated',
        threadTitle: intent.label,
        actions: [],
        errors: [],
        warnings: ['ProjectFolio could not compile a meaningful local bundle from this prompt, so no change set was created.'],
      };
    }

    actions.push({
      type: 'customization.patch',
      patch: {
        themeOverridesPatch: /\b(rounded|radius)\b/.test(text)
          ? { cardBorderRadius: '28px' }
          : /\b(dark)\b/.test(text)
            ? { pageBackground: '#030712', cardBackground: '#111827', headerTextColor: '#f8fafc' }
            : {},
        animationsPatch: {
          cardHover: wantsMotion || /\b(hover|lift)\b/.test(text) ? 'lift' : 'none',
          pageBackground: wantsParticles ? 'particles' : 'none',
        },
        cssBlocks: [{
          id: 'agent-targeted-native-edit',
          css: [
            /\b(rounded|radius)\b/.test(text) ? '.pf-project-card, .pf-contact-card, .pf-feature-card { border-radius: 28px !important; }' : '',
            /\b(shadow|depth|premium)\b/.test(text) ? '.pf-project-card { box-shadow: 0 22px 70px rgba(15,23,42,.18) !important; }' : '',
            '@media (max-width: 760px) { .pf-project-card { min-width: 0; } }',
          ].filter(Boolean).join('\n'),
        }],
        removeBlocks: [],
        description: 'Applies a focused ProjectFolio-native visual edit.',
      },
    });

    return {
      reply: 'I prepared a focused native edit for review.',
      summary: intent.id === 'sectionAdd' ? 'Focused section addition' : 'Focused visual edit',
      threadTitle: intent.label,
      actions,
      errors: [],
      warnings: [],
    };
  }

  if (wantsFullRedesign) {
    actions.push({
      type: 'settings.patch',
      patch: {
        theme: direction.theme,
        accent_color: direction.accent,
        layout: direction.layout,
        section_order: buildIntegratedSectionOrder(currentSectionOrder, sectionIds),
        section_config: {
          header: { bg: 'none', spacing: 'spacious' },
          projects: { columns: direction.layout === 'grid' ? '3' : '2', card_style: 'rounded', spacing: 'loose', show_tagline: true },
          contact: { bg: 'none' },
        },
        site_sections: siteSections,
        design_system: fallbackPlan.designSystem,
        interactions: [
          { type: 'scrollReveal', target: '.pf-section', effect: wantsMotion ? 'blurIn' : 'fadeUp', stagger: 80, duration: 560 },
          { type: 'microInteractions', target: '.pf-project-card', effect: /\b(invert|brutalist|high contrast)\b/.test(text) ? 'invert' : 'lift' },
          ...(wantsTransition ? [{ type: 'pageTransition', effect: /\b(zoom|scale)\b/.test(text) ? 'scale' : 'fade', duration: 220 }] : []),
          ...(/\b(nav|navigation|header)\b/.test(text) && /\b(hide|auto-hide|autohide|scroll)\b/.test(text) ? [{ type: 'navAutoHide', threshold: 24 }] : []),
          ...(wantsParticles
            ? [{ type: 'ambientParticles', density: 'low' }]
            : [{ type: 'gradientMesh', opacity: 0.24 }]),
          ...(wantsCursor ? [{ type: 'cursorGlow', size: 220, opacity: 0.16 }] : []),
        ].slice(0, 4),
      },
    });
  }

  actions.push({
    type: 'customization.patch',
    patch: {
      themeOverridesPatch: {
        pageBackground: direction.bg,
        cardBackground: direction.cardBg,
        cardBorder: direction.border,
        cardShadow: direction.shadow,
        headerGradient: direction.bg,
        headerTextColor: direction.theme === 'bold' ? '#f8fafc' : '#111827',
        accentColor: direction.accent,
        projectsGap: 'clamp(18px, 3vw, 34px)',
        sectionPadding: 'clamp(28px, 4vw, 56px)',
      },
      animationsPatch: {
        cardEntrance: wantsMotion || wantsFullRedesign ? 'fadeUp' : 'none',
        cardHover: wantsCursor || wantsMotion ? 'tilt' : 'lift',
        pageBackground: wantsParticles ? 'particles' : 'gradient-shift',
      },
      cssBlocks: [{ id: `agent-${inferDesignDirection(prompt)}-system`, css: buildAgentDesignCss(direction, prompt) }],
      removeBlocks: [],
      description: `Applies the ${direction.title.toLowerCase()} design system.`,
    },
  });

  actions.push({
    type: 'memory.upsert',
    kind: 'preference',
    content: `User asked for a ${direction.title.toLowerCase()} direction: ${String(prompt || '').slice(0, 220)}`,
  });

  return {
    reply: 'I prepared a fuller site redesign bundle with structure, sections, styling, motion, and safe advanced code for you to review.',
    summary: `${direction.title} redesign bundle`,
    threadTitle: direction.title,
    ...fallbackPlan,
    actions,
    errors: [],
    warnings: [],
  };
};

const compileProjectFolioBundle = ({
  prompt = '',
  context = {},
  intent = classifyAgentIntent(prompt),
  modelDraft = null,
  modelErrors = [],
  reason = 'model_plan_advisory',
} = {}) => {
  const normalizedIntent = intent || classifyAgentIntent(prompt);
  if (!shouldUseProjectFolioCompiler(normalizedIntent)) return null;

  const compiled = buildFallbackAgentResponse(prompt, context);
  if (!compiled.actions?.length) {
    return {
      ...compiled,
      intent: normalizedIntent,
      quality: { status: 'failed', errors: [], warnings: compiled.warnings || [], notes: [] },
      errors: [],
      warnings: uniqueMessages([
        ...(compiled.warnings || []),
        ...(Array.isArray(modelErrors) && modelErrors.length
          ? ['The selected model could not complete the draft, and no safe local fallback matched this request.']
          : []),
      ]),
      compiler: {
        id: 'projectfolio-native-v1',
        source: 'local',
        reason,
        noOp: true,
        modelDraftActionCount: Array.isArray(modelDraft?.actions) ? modelDraft.actions.length : 0,
        modelDraftHadErrors: Boolean(modelDraft?.errors?.length || modelErrors.length),
        modelDraftErrors: uniqueMessages([...(modelDraft?.errors || []), ...(modelErrors || [])]).slice(0, 8),
      },
    };
  }
  const validation = validateAgentActions(compiled.actions || []);
  const constrained = enforceIntentConstraints({
    actions: validation.actions,
    intent: normalizedIntent,
    prompt,
  });
  const actions = constrained.actions;
  const quality = validateAgentQuality({
    prompt,
    actions,
    intent: normalizedIntent,
    designBrief: compiled.designBrief || null,
    sitePlan: compiled.sitePlan || null,
    designSystem: compiled.designSystem || null,
  });
  const modelActionCount = Array.isArray(modelDraft?.actions) ? modelDraft.actions.length : 0;
  const compilerWarnings = [
    ...(compiled.warnings || []),
    ...(validation.warnings || []),
    ...(constrained.warnings || []),
    ...(quality.warnings || []),
    ...(modelDraft?.warnings || []),
    ...(Array.isArray(modelErrors) && modelErrors.length
      ? ['The model draft could not be used directly, so ProjectFolio compiled a native-safe bundle from the prompt and current site context.']
      : []),
    'ProjectFolio compiled the final site bundle locally; model actions were treated as advisory planning only.',
  ];

  return {
    ...compiled,
    actions,
    intent: normalizedIntent,
    quality,
    errors: uniqueMessages([...(validation.errors || []), ...(quality.errors || [])]),
    warnings: uniqueMessages(compilerWarnings),
    compiler: {
      id: 'projectfolio-native-v1',
      source: 'local',
      reason,
      modelDraftActionCount: modelActionCount,
      modelDraftHadErrors: Boolean(modelDraft?.errors?.length || modelErrors.length),
      modelDraftErrors: uniqueMessages([...(modelDraft?.errors || []), ...(modelErrors || [])]).slice(0, 8),
    },
  };
};

const getProjectTarget = async (client, userId, action) => {
  if (action.projectId) {
    const result = await client.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [action.projectId, userId]);
    return result.rows[0] || null;
  }
  if (action.projectSlug) {
    const result = await client.query('SELECT * FROM projects WHERE slug = $1 AND user_id = $2', [action.projectSlug, userId]);
    return result.rows[0] || null;
  }
  if (action.slug) {
    const result = await client.query('SELECT * FROM projects WHERE slug = $1 AND user_id = $2', [action.slug, userId]);
    return result.rows[0] || null;
  }
  return null;
};

const applyAgentActions = async (client, userId, actions = [], options = {}) => {
  const applied = [];
  const changeSetId = options.changeSetId || null;
  logger.info({ tag: 'AGENT:DB:APPLY_ACTIONS_START', userId, changeSetId, actionCount: actions.length, actionTypes: actions.map((action) => action.type) }, 'applyAgentActions starting');

  for (const action of actions) {
    if (action.type === 'settings.patch') {
      const patch = action.patch || {};
      const settings = await client.query('SELECT * FROM portfolio_settings WHERE user_id = $1', [userId]);
      const current = settings.rows[0] || {};
      const next = { ...current, ...patch };
      const currentCss = getLayeredCss(current);
      const affectsAgentDesign = ['theme_overrides', 'animations', 'site_sections', 'design_system', 'interactions']
        .some((key) => Object.prototype.hasOwnProperty.call(patch, key));
      next.manual_custom_css = (current.manual_custom_css ?? currentCss.manualCss) || null;
      next.agent_custom_css = (current.agent_custom_css ?? currentCss.agentCss) || null;
      next.agent_design_meta = affectsAgentDesign
        ? buildAgentDesignMeta(current.agent_design_meta, changeSetId)
        : normalizeAgentDesignMeta(current.agent_design_meta);
      next.custom_css = combineLayeredCss(next.manual_custom_css, next.agent_design_meta.active ? next.agent_custom_css : '');
      const writeResult = await client.query(
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
          next.theme || 'clean',
          next.accent_color || '#2563eb',
          next.font_choice || 'inter',
          next.show_contact_form ?? true,
          next.is_public ?? true,
          next.seo_title || null,
          next.seo_description || null,
          Array.isArray(next.seo_keywords) ? next.seo_keywords : [],
          next.layout || 'classic',
          JSON.stringify(next.section_order || DEFAULT_SECTION_ORDER),
          next.show_skills ?? true,
          next.show_dates ?? true,
          next.show_project_type ?? true,
          JSON.stringify(parseJsonObject(next.section_config, {})),
          sanitizeCustomCss(next.custom_css),
          null,
          JSON.stringify(parseJsonObject(next.theme_overrides, {})),
          JSON.stringify({ ...DEFAULT_ANIMATIONS, ...parseJsonObject(next.animations, {}) }),
          JSON.stringify(sanitizeSiteSections(next.site_sections || [])),
          JSON.stringify(sanitizeDesignSystem(next.design_system) || {}),
          JSON.stringify(sanitizeInteractions(next.interactions || [])),
          sanitizeCustomCss(next.manual_custom_css),
          sanitizeCustomCss(next.agent_custom_css),
          JSON.stringify(parseJsonObject(next.manual_design_overrides, {})),
          JSON.stringify(next.agent_design_meta),
          next.preferred_ai_model || null,
        ]
      );
      logger.info({
        tag: 'AGENT:DB:SETTINGS_PATCH_WRITTEN',
        userId,
        changeSetId,
        rowCount: writeResult.rowCount,
        patchKeys: Object.keys(patch),
        customCssLengthBefore: (current.custom_css || '').length,
        customCssLengthAfter: sanitizeCustomCss(next.custom_css).length,
        siteSectionsCountBefore: (current.site_sections ? (Array.isArray(current.site_sections) ? current.site_sections : parseJsonObject(current.site_sections, [])) : []).length,
        siteSectionsCountAfter: sanitizeSiteSections(next.site_sections || []).length,
        }, writeResult.rowCount ? 'portfolio_settings row written' : 'WARNING: portfolio_settings write reported 0 rows affected');
      applied.push({ type: action.type });
    }

    if (action.type === 'profile.patch') {
      const patch = action.patch || {};
      const fields = Object.keys(patch);
      if (fields.length) {
        const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
        await client.query(
          `UPDATE users SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${fields.length + 1}`,
          [...fields.map((field) => patch[field]), userId]
        );
      }
      applied.push({ type: action.type });
    }

    if (action.type === 'project.create') {
      const project = action.project || {};
      if (!project.title) throw new Error('project.create requires title.');
      let slug = sanitizeId(project.slug || project.title, 'project');
      const slugCheck = await client.query('SELECT id FROM projects WHERE user_id = $1 AND slug = $2', [userId, slug]);
      if (slugCheck.rows.length) slug = `${slug}-${Date.now()}`;
      const result = await client.query(
        `INSERT INTO projects (user_id, title, slug, tagline, description, project_type, technologies, cover_image_url,
          github_url, live_url, start_date, end_date, collaborators, status, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12,$13::text[],$14,$15)
         RETURNING id, slug`,
        [
          userId,
          project.title,
          slug,
          project.tagline || null,
          project.description || null,
          project.project_type || null,
          toTextArrayLiteral(project.technologies) || '{}',
          project.cover_image_url || null,
          project.github_url || null,
          project.live_url || null,
          project.start_date || null,
          project.end_date || null,
          toTextArrayLiteral(project.collaborators) || '{}',
          project.status || 'draft',
          project.is_featured === true,
        ]
      );
      applied.push({ type: action.type, projectId: result.rows[0].id, slug: result.rows[0].slug });
    }

    if (action.type === 'project.patch') {
      const project = await getProjectTarget(client, userId, action);
      if (!project) throw new Error('Project not found for project.patch.');
      const patch = action.patch || {};
      const fields = Object.keys(patch).filter((field) => PROJECT_PATCH_KEYS.has(field));
      if (fields.length) {
        const assignments = fields.map((field, index) => `${field} = $${index + 1}${['technologies', 'collaborators'].includes(field) ? '::text[]' : ''}`);
        const values = fields.map((field) => ['technologies', 'collaborators'].includes(field) ? toTextArrayLiteral(patch[field]) : patch[field]);
        await client.query(
          `UPDATE projects SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2}`,
          [...values, project.id, userId]
        );
      }
      applied.push({ type: action.type, projectId: project.id });
    }

    if (action.type === 'project.reorder') {
      for (const item of action.order || []) {
        await client.query('UPDATE projects SET sort_order = $1 WHERE id = $2 AND user_id = $3', [item.sort_order, item.id, userId]);
      }
      applied.push({ type: action.type });
    }

    if (action.type === 'block.create') {
      const project = await getProjectTarget(client, userId, action);
      if (!project) throw new Error('Project not found for block.create.');
      const result = await client.query(
        'INSERT INTO blocks (project_id, type, content, sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
        [project.id, action.block?.type || 'text', JSON.stringify(action.block?.content || {}), action.block?.sort_order ?? 0]
      );
      applied.push({ type: action.type, blockId: result.rows[0].id });
    }

    if (action.type === 'block.patch') {
      await client.query(
        `UPDATE blocks b SET content = COALESCE($1, b.content), sort_order = COALESCE($2, b.sort_order), updated_at = NOW()
         FROM projects p WHERE b.project_id = p.id AND p.user_id = $3 AND b.id = $4`,
        [action.content ? JSON.stringify(action.content) : null, action.sort_order ?? null, userId, action.blockId]
      );
      applied.push({ type: action.type, blockId: action.blockId });
    }

    if (action.type === 'block.delete') {
      await client.query(
        'DELETE FROM blocks b USING projects p WHERE b.project_id = p.id AND p.user_id = $1 AND b.id = $2',
        [userId, action.blockId]
      );
      applied.push({ type: action.type, blockId: action.blockId });
    }

    if (action.type === 'block.reorder') {
      for (const item of action.order || []) {
        await client.query(
          'UPDATE blocks b SET sort_order = $1 FROM projects p WHERE b.project_id = p.id AND p.user_id = $2 AND b.id = $3',
          [item.sort_order, userId, item.id]
        );
      }
      applied.push({ type: action.type });
    }

    if (action.type === 'customization.patch') {
      const settings = await client.query('SELECT * FROM portfolio_settings WHERE user_id = $1', [userId]);
      const current = settings.rows[0] || {};
      const layered = getLayeredCss(current);
      const merged = parseAndMergeAiResponse(JSON.stringify(action.patch || {}), {
        css: layered.agentCss || '',
        js: '',
        themeOverrides: parseJsonObject(current.theme_overrides, {}),
        animations: parseJsonObject(current.animations, DEFAULT_ANIMATIONS),
      });
      const manualCss = sanitizeCustomCss(layered.manualCss);
      const agentCss = sanitizeCustomCss(merged.result.css);
      const agentMeta = buildAgentDesignMeta(current.agent_design_meta, changeSetId);
      const writeResult = await client.query(
        `INSERT INTO portfolio_settings
           (user_id, custom_css, custom_js, manual_custom_css, agent_custom_css,
            theme_overrides, animations, agent_design_meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id) DO UPDATE SET
           custom_css = EXCLUDED.custom_css,
           custom_js = NULL,
           manual_custom_css = EXCLUDED.manual_custom_css,
           agent_custom_css = EXCLUDED.agent_custom_css,
           theme_overrides = EXCLUDED.theme_overrides,
           animations = EXCLUDED.animations,
           agent_design_meta = EXCLUDED.agent_design_meta,
           updated_at = NOW()`,
        [
          userId,
          combineLayeredCss(manualCss, agentCss),
          null,
          manualCss,
          agentCss,
          JSON.stringify(merged.result.themeOverrides || {}),
          JSON.stringify(merged.result.animations || DEFAULT_ANIMATIONS),
          JSON.stringify(agentMeta),
        ]
      );
      logger.info({
        tag: 'AGENT:DB:CUSTOMIZATION_PATCH_WRITTEN',
        userId,
        changeSetId,
        rowCount: writeResult.rowCount,
        agentCssLengthBefore: (layered.agentCss || '').length,
        agentCssLengthAfter: agentCss.length,
        agentDesignActive: agentMeta.active,
        }, writeResult.rowCount ? 'portfolio_settings row written (customization.patch)' : 'WARNING: customization.patch write reported 0 rows affected');
      applied.push({ type: action.type });
    }

    if (action.type === 'memory.upsert') {
      await client.query(
        'INSERT INTO ai_memories (user_id, kind, content, metadata) VALUES ($1,$2,$3,$4)',
        [userId, action.kind || 'preference', String(action.content).slice(0, 1000), JSON.stringify(action.metadata || {})]
      );
      applied.push({ type: action.type });
    }
  }

  logger.info({ tag: 'AGENT:DB:APPLY_ACTIONS_DONE', userId, changeSetId, appliedCount: applied.length, applied }, 'applyAgentActions finished');
  return applied;
};

module.exports = {
  ACTION_TYPES,
  SECTION_TYPES,
  applyAgentActions,
  analyzeAgentClarificationNeed,
  analyzeContentClarificationNeed,
  buildAgentSystemMessage,
  buildAgentUserMessage,
  buildCompactAgentContext,
  compactJsonSize,
  buildFallbackAgentResponse,
  classifyAgentIntent,
  compileProjectFolioBundle,
  critiqueAgentBundle,
  enforceIntentConstraints,
  parseAgentResponse,
  sanitizeAgentClarification,
  sanitizeAgentPlan,
  sanitizeDesignSystem,
  sanitizeInteractions,
  sanitizeSiteSections,
  shouldUseProjectFolioCompiler,
  validateAgentQuality,
  validateAgentActions,
};
