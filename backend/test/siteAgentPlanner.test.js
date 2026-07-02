const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeDesignSystems,
  planToActions,
  shouldAllowDesignSystemOverride,
  validateAgentPlan,
} = require('../utils/siteAgentPlanner');

test('planner validates design brief, site plan, and design system', () => {
  const plan = validateAgentPlan({
    designBrief: { goal: 'Build a cinematic launch page.', styleDirection: 'Cinematic Launch!' },
    sitePlan: { primaryCta: 'View projects', contentHierarchy: ['identity', 'proof', 'projects', 'contact'] },
    designSystem: { direction: 'Launch', tokens: { background: '#030712', radius: '24px' } },
  });

  assert.equal(plan.designBrief.styleDirection, 'cinematic-launch');
  assert.equal(plan.sitePlan.primaryCta, 'View projects');
  assert.equal(plan.designSystem.tokens.radius, '24px');
});

test('design system merge preserves manual tokens unless the prompt is a redesign', () => {
  const current = {
    direction: 'manual',
    tokens: { background: '#ffffff', accent: '#2563eb' },
    componentVariants: { projectCard: 'manual-card' },
  };
  const incoming = {
    direction: 'cinematic',
    tokens: { background: '#030712', surface: '#111827' },
    componentVariants: { projectCard: 'glass-tilt', sectionHeading: 'eyebrow-rule' },
  };

  const preserved = mergeDesignSystems(current, incoming, { allowRedesign: false });
  assert.equal(preserved.direction, 'manual');
  assert.equal(preserved.tokens.background, '#ffffff');
  assert.equal(preserved.tokens.surface, '#111827');
  assert.equal(preserved.componentVariants.projectCard, 'manual-card');

  const redesigned = mergeDesignSystems(current, incoming, { allowRedesign: true });
  assert.equal(redesigned.direction, 'cinematic');
  assert.equal(redesigned.tokens.background, '#030712');
  assert.equal(redesigned.componentVariants.projectCard, 'glass-tilt');
});

test('planner converts design system plans into validated settings actions', () => {
  const result = planToActions({
    prompt: 'Make this a cinematic product launch page',
    currentSettings: { design_system: { tokens: { background: '#ffffff' } } },
    plan: {
      designSystem: { direction: 'launch', tokens: { background: '#030712', text: '#f8fafc' } },
    },
    actions: [{ type: 'settings.patch', patch: { layout: 'magazine' } }],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.actions[0].patch.layout, 'magazine');
  assert.equal(result.actions[0].patch.design_system.tokens.background, '#030712');
  assert.equal(shouldAllowDesignSystemOverride('tiny color tweak'), false);
  assert.equal(shouldAllowDesignSystemOverride('full site redesign'), true);
});
