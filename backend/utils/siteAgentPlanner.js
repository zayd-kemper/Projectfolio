const {
  sanitizeAgentPlan,
  sanitizeDesignSystem,
  validateAgentActions,
} = require('./siteAgent');

const REDESIGN_INTENT_RE = /\b(redesign|transform|rebuild|makeover|new look|landing page|cinematic|premium|full site|entire site|whole site)\b/i;

const shouldAllowDesignSystemOverride = (prompt = '') => REDESIGN_INTENT_RE.test(String(prompt || ''));

const mergeObject = (existing = {}, incoming = {}, preferIncoming = false) => {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const patch = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  return preferIncoming ? { ...base, ...patch } : { ...patch, ...base };
};

const mergeDesignSystems = (existing, incoming, { allowRedesign = false } = {}) => {
  const current = sanitizeDesignSystem(existing) || {};
  const next = sanitizeDesignSystem(incoming) || {};
  const preferIncoming = Boolean(allowRedesign);

  return sanitizeDesignSystem({
    direction: preferIncoming ? (next.direction || current.direction) : (current.direction || next.direction),
    tokens: mergeObject(current.tokens, next.tokens, preferIncoming),
    typography: mergeObject(current.typography, next.typography, preferIncoming),
    componentVariants: mergeObject(current.componentVariants, next.componentVariants, preferIncoming),
    motion: mergeObject(current.motion, next.motion, preferIncoming),
  }) || {};
};

const validateAgentPlan = (plan = {}) => sanitizeAgentPlan(plan) || {};

const planToActions = ({ plan = {}, actions = [], currentSettings = {}, prompt = '' } = {}) => {
  const cleanPlan = validateAgentPlan(plan);
  const cleanActions = Array.isArray(actions) ? actions.map((action) => ({ ...action })) : [];
  const designSystem = cleanPlan.designSystem;
  if (designSystem) {
    const allowRedesign = shouldAllowDesignSystemOverride(prompt);
    const mergedDesignSystem = mergeDesignSystems(currentSettings.design_system, designSystem, { allowRedesign });
    const settingsAction = cleanActions.find((action) => action.type === 'settings.patch');
    if (settingsAction) {
      settingsAction.patch = {
        ...(settingsAction.patch || {}),
        design_system: mergeDesignSystems(settingsAction.patch?.design_system, mergedDesignSystem, { allowRedesign: true }),
      };
    } else {
      cleanActions.unshift({ type: 'settings.patch', patch: { design_system: mergedDesignSystem } });
    }
  }

  const validation = validateAgentActions(cleanActions);
  return {
    plan: cleanPlan,
    actions: validation.actions,
    errors: validation.errors,
    warnings: validation.warnings,
  };
};

module.exports = {
  mergeDesignSystems,
  planToActions,
  shouldAllowDesignSystemOverride,
  validateAgentPlan,
};
