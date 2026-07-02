const { sanitizeCustomCss } = require('./contentSecurity');

const DEFAULT_AGENT_DESIGN_META = {
  active: false,
  version: 1,
  appliedChangeSetIds: [],
};

const VISUAL_FOUNDATION_KEYS = new Set([
  'theme',
  'accent_color',
  'layout',
  'section_config',
]);

const AGENT_DESIGN_KEYS = new Set([
  'theme_overrides',
  'animations',
  'site_sections',
  'design_system',
  'interactions',
  'agent_custom_css',
  'agent_design_meta',
]);

const parseJsonObject = (value, fallback = {}) => {
  if (!value) return { ...fallback };
  if (typeof value === 'object' && !Array.isArray(value)) return { ...fallback, ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...fallback, ...parsed }
        : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }
  return { ...fallback };
};

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (!value) return [...fallback];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [...fallback];
    } catch {
      return [...fallback];
    }
  }
  return [...fallback];
};

const normalizeAgentDesignMeta = (value = {}) => {
  const parsed = parseJsonObject(value, DEFAULT_AGENT_DESIGN_META);
  return {
    ...DEFAULT_AGENT_DESIGN_META,
    ...parsed,
    active: parsed.active === true,
    version: 1,
    appliedChangeSetIds: Array.isArray(parsed.appliedChangeSetIds)
      ? [...new Set(parsed.appliedChangeSetIds.filter(Boolean).map(String))]
      : [],
  };
};

const splitManagedCssBlocks = (css = '') => {
  const source = String(css || '');
  const managedBlocks = [];
  const blockPattern = /\/\*\s*pf-ai:block:([a-zA-Z0-9_-]+)\s*\*\/[\s\S]*?\/\*\s*pf-ai:end:\1\s*\*\//g;
  const manualCss = source.replace(blockPattern, (match, id) => {
    managedBlocks.push({ id, css: match.trim() });
    return '\n';
  }).replace(/\n{3,}/g, '\n\n').trim();

  return {
    manualCss,
    agentCss: managedBlocks.map((block) => block.css).join('\n\n').trim(),
    managedBlocks,
  };
};

const combineLayeredCss = (manualCss = '', agentCss = '') => {
  const parts = [
    sanitizeCustomCss(manualCss) || '',
    sanitizeCustomCss(agentCss) || '',
  ].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
};

const getLayeredCss = (settings = {}) => {
  const split = splitManagedCssBlocks(settings.custom_css || '');
  const manualCss = settings.manual_custom_css != null
    ? String(settings.manual_custom_css || '')
    : split.manualCss;
  const agentCss = settings.agent_custom_css != null
    ? String(settings.agent_custom_css || '')
    : split.agentCss;
  return { manualCss, agentCss, split };
};

const buildAgentDesignMeta = (existing = {}, changeSetId = null) => {
  const current = normalizeAgentDesignMeta(existing);
  const appliedChangeSetIds = changeSetId
    ? [...new Set([...current.appliedChangeSetIds, String(changeSetId)])]
    : current.appliedChangeSetIds;
  return {
    ...current,
    active: true,
    appliedChangeSetIds,
    updatedAt: new Date().toISOString(),
  };
};

const clearAgentDesignMeta = (existing = {}) => ({
  ...normalizeAgentDesignMeta(existing),
  active: false,
  appliedChangeSetIds: [],
  clearedAt: new Date().toISOString(),
});

const inferChangedKeys = (existing = {}, incoming = {}) => {
  const keys = new Set(Object.keys(incoming || {}));
  const changed = [];
  keys.forEach((key) => {
    if (['source', 'changedKeys', 'conflictResolution'].includes(key)) return;
    const before = existing[key] == null ? null : existing[key];
    const after = incoming[key] == null ? null : incoming[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(key);
  });
  return changed;
};

const detectManualAgentConflicts = (existing = {}, incoming = {}, changedKeys = []) => {
  const meta = normalizeAgentDesignMeta(existing.agent_design_meta);
  if (!meta.active) return [];
  const changed = new Set(changedKeys);
  const warnings = [];

  VISUAL_FOUNDATION_KEYS.forEach((key) => {
    if (changed.has(key)) {
      warnings.push({
        key,
        message: `${key} changes the manual design foundation and may override part of the active AI design.`,
      });
    }
  });

  if (changed.has('custom_css') || changed.has('manual_custom_css')) {
    warnings.push({
      key: 'manual_custom_css',
      message: 'Manual CSS is layered with generated AI CSS. Use Remove AI design to clear generated styles.',
    });
  }

  return warnings;
};

const buildManualDesignOverrides = (existingOverrides = {}, incoming = {}, changedKeys = [], agentActive = false) => {
  const next = parseJsonObject(existingOverrides, {});
  if (!agentActive) return {};
  const changed = new Set(changedKeys);

  if (changed.has('accent_color') && incoming.accent_color) {
    next.tokens = { ...(next.tokens || {}), accent: incoming.accent_color };
  }
  if (changed.has('theme') && incoming.theme) next.theme = incoming.theme;
  if (changed.has('layout') && incoming.layout) next.layout = incoming.layout;
  if (changed.has('section_config') && incoming.section_config) next.section_config = incoming.section_config;

  return next;
};

const resetManualDesignOverrides = (settings = {}) => ({
  ...settings,
  manual_design_overrides: {},
});

const clearAgentDesignLayer = (settings = {}) => {
  const { manualCss } = getLayeredCss(settings);
  const generatedSectionIds = new Set(parseJsonArray(settings.site_sections, [])
    .map((section) => String(section?.id || '').trim())
    .filter(Boolean));
  const sectionOrder = parseJsonArray(settings.section_order, [])
    .filter((id) => !generatedSectionIds.has(String(id)));
  return {
    ...settings,
    custom_css: combineLayeredCss(manualCss, ''),
    manual_custom_css: sanitizeCustomCss(manualCss),
    agent_custom_css: null,
    manual_design_overrides: {},
    theme_overrides: {},
    animations: {},
    site_sections: [],
    section_order: sectionOrder.length ? sectionOrder : settings.section_order,
    design_system: {},
    interactions: [],
    agent_design_meta: clearAgentDesignMeta(settings.agent_design_meta),
  };
};

const mergeManualSettingsSave = (existing = {}, incoming = {}, changedKeys = [], conflictResolution = 'preserve-agent') => {
  const inferredChangedKeys = Array.isArray(changedKeys) && changedKeys.length
    ? changedKeys
    : inferChangedKeys(existing, incoming);
  const changed = new Set(inferredChangedKeys);
  const existingMeta = normalizeAgentDesignMeta(existing.agent_design_meta);
  const incomingManualCss = Object.prototype.hasOwnProperty.call(incoming, 'manual_custom_css')
    ? incoming.manual_custom_css
    : incoming.custom_css;
  const layered = getLayeredCss(existing);
  let next = {
    ...existing,
    ...incoming,
    custom_js: null,
    manual_custom_css: changed.has('custom_css') || changed.has('manual_custom_css')
      ? sanitizeCustomCss(incomingManualCss)
      : sanitizeCustomCss(layered.manualCss),
    agent_custom_css: existing.agent_custom_css ?? layered.agentCss ?? null,
    agent_design_meta: existingMeta,
    manual_design_overrides: buildManualDesignOverrides(
      existing.manual_design_overrides,
      incoming,
      inferredChangedKeys,
      existingMeta.active
    ),
  };

  if (conflictResolution === 'remove-agent-design') {
    next = clearAgentDesignLayer(next);
  } else {
    AGENT_DESIGN_KEYS.forEach((key) => {
      if (!changed.has(key)) next[key] = existing[key];
    });
  }

  next.custom_css = combineLayeredCss(next.manual_custom_css, normalizeAgentDesignMeta(next.agent_design_meta).active ? next.agent_custom_css : '');
  const warnings = detectManualAgentConflicts(existing, incoming, inferredChangedKeys);
  return { settings: next, warnings, changedKeys: inferredChangedKeys };
};

const computeEffectiveDesignSettings = (settings = {}) => {
  const meta = normalizeAgentDesignMeta(settings.agent_design_meta);
  const { manualCss, agentCss } = getLayeredCss(settings);
  const manualOverrides = meta.active ? parseJsonObject(settings.manual_design_overrides, {}) : {};
  const designSystem = parseJsonObject(settings.design_system, {});
  const tokens = {
    ...(designSystem.tokens || {}),
    ...(manualOverrides.tokens || {}),
  };

  return {
    ...settings,
    custom_js: null,
    manual_custom_css: manualCss,
    agent_custom_css: agentCss,
    custom_css: combineLayeredCss(manualCss, meta.active ? agentCss : ''),
    manual_design_overrides: manualOverrides,
    agent_design_meta: meta,
    design_system: {
      ...designSystem,
      tokens,
    },
    theme: manualOverrides.theme || settings.theme,
    layout: manualOverrides.layout || settings.layout,
  };
};

module.exports = {
  DEFAULT_AGENT_DESIGN_META,
  VISUAL_FOUNDATION_KEYS,
  splitManagedCssBlocks,
  combineLayeredCss,
  getLayeredCss,
  normalizeAgentDesignMeta,
  buildAgentDesignMeta,
  clearAgentDesignMeta,
  clearAgentDesignLayer,
  resetManualDesignOverrides,
  mergeManualSettingsSave,
  computeEffectiveDesignSettings,
  detectManualAgentConflicts,
  parseJsonObject,
  parseJsonArray,
};
