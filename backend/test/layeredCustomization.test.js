const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearAgentDesignLayer,
  combineLayeredCss,
  computeEffectiveDesignSettings,
  mergeManualSettingsSave,
  splitManagedCssBlocks,
} = require('../utils/layeredCustomization');

test('CSS splitting preserves manual CSS and extracts AI managed blocks', () => {
  const css = `
.pf-project-card { border-radius: 16px; }

/* pf-ai:block:ambient */
.pf-portfolio { background: radial-gradient(circle, var(--pf-accent-20), transparent); }
/* pf-ai:end:ambient */
`;

  const split = splitManagedCssBlocks(css);
  assert.match(split.manualCss, /\.pf-project-card/);
  assert.doesNotMatch(split.manualCss, /pf-ai:block/);
  assert.match(split.agentCss, /pf-ai:block:ambient/);
  assert.equal(split.managedBlocks.length, 1);
});

test('manual settings save preserves active agent design layers', () => {
  const existing = {
    theme: 'clean',
    accent_color: '#2563eb',
    custom_css: combineLayeredCss('.manual { color: red; }', '/* pf-ai:block:glow */.pf-portfolio{background:#000;}/* pf-ai:end:glow */'),
    manual_custom_css: '.manual { color: red; }',
    agent_custom_css: '/* pf-ai:block:glow */.pf-portfolio{background:#000;}/* pf-ai:end:glow */',
    theme_overrides: { pageBackground: '#000' },
    site_sections: [{ id: 'agent-proof', type: 'featureGrid' }],
    design_system: { tokens: { accent: '#00ffff' } },
    animations: { cardEntrance: 'fadeUp' },
    interactions: [{ type: 'scrollReveal', target: '.pf-section' }],
    agent_design_meta: { active: true, version: 1, appliedChangeSetIds: ['cs1'] },
  };

  const { settings, warnings } = mergeManualSettingsSave(
    existing,
    { accent_color: '#ff3366', manual_custom_css: '.manual { color: blue; }' },
    ['accent_color', 'manual_custom_css'],
    'preserve-agent'
  );

  assert.equal(settings.manual_custom_css, '.manual { color: blue; }');
  assert.equal(settings.agent_custom_css, existing.agent_custom_css);
  assert.deepEqual(settings.theme_overrides, existing.theme_overrides);
  assert.deepEqual(settings.site_sections, existing.site_sections);
  assert.equal(settings.manual_design_overrides.tokens.accent, '#ff3366');
  assert.match(settings.custom_css, /\.manual/);
  assert.match(settings.custom_css, /pf-ai:block:glow/);
  assert(warnings.some((warning) => warning.key === 'accent_color'));
});

test('clearAgentDesignLayer removes generated visual surfaces but keeps manual CSS and universal settings', () => {
  const cleared = clearAgentDesignLayer({
    section_order: ['header', 'agent-proof', 'projects', 'contact'],
    show_contact_form: false,
    manual_custom_css: '.pf-header { padding: 2rem; }',
    agent_custom_css: '/* pf-ai:block:glow */.pf-portfolio{background:#000;}/* pf-ai:end:glow */',
    theme_overrides: { pageBackground: '#000' },
    site_sections: [{ id: 'agent-proof', type: 'featureGrid' }],
    design_system: { tokens: { accent: '#00ffff' } },
    animations: { pageBackground: 'particles' },
    interactions: [{ type: 'cursorGlow' }],
    agent_design_meta: { active: true, version: 1, appliedChangeSetIds: ['cs1'] },
  });

  assert.equal(cleared.manual_custom_css, '.pf-header { padding: 2rem; }');
  assert.equal(cleared.agent_custom_css, null);
  assert.deepEqual(cleared.theme_overrides, {});
  assert.deepEqual(cleared.site_sections, []);
  assert.deepEqual(cleared.section_order, ['header', 'projects', 'contact']);
  assert.deepEqual(cleared.manual_design_overrides, {});
  assert.deepEqual(cleared.design_system, {});
  assert.deepEqual(cleared.animations, {});
  assert.deepEqual(cleared.interactions, []);
  assert.equal(cleared.show_contact_form, false);
  assert.equal(cleared.agent_design_meta.active, false);
  assert.match(cleared.custom_css, /\.pf-header/);
  assert.doesNotMatch(cleared.custom_css, /pf-ai:block:glow/);
});

test('inactive agent design does not let stale manual overrides pin layout', () => {
  const effective = computeEffectiveDesignSettings({
    layout: 'minimal',
    manual_design_overrides: { layout: 'fullwidth', tokens: { accent: '#ff00ff' } },
    agent_design_meta: { active: false, version: 1 },
  });

  assert.equal(effective.layout, 'minimal');
  assert.deepEqual(effective.manual_design_overrides, {});
  assert.deepEqual(effective.design_system.tokens, {});

  const { settings } = mergeManualSettingsSave(
    {
      layout: 'minimal',
      manual_design_overrides: { layout: 'fullwidth' },
      agent_design_meta: { active: false, version: 1 },
    },
    { layout: 'classic' },
    ['layout'],
    'preserve-agent'
  );

  assert.equal(settings.layout, 'classic');
  assert.deepEqual(settings.manual_design_overrides, {});
});
