const test = require('node:test');
const assert = require('node:assert/strict');
const agentRouter = require('../routes/agent');

test('agent apply is blocked when pre-apply browser verification failed', () => {
  delete process.env.AGENT_ALLOW_FORCE_APPLY;
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'failed', errors: ['portfolio/mobile: horizontal overflow 80px.'] },
    }),
    true
  );
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'passed', errors: [] },
    }),
    false
  );
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'warning', warnings: ['layout risk'] },
    }),
    true
  );
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'skipped', warnings: ['no browser'] },
    }),
    true
  );
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'failed', errors: ['manual override'] },
    }, true),
    true
  );
  process.env.AGENT_ALLOW_FORCE_APPLY = 'true';
  assert.equal(
    agentRouter.shouldBlockApplyForBrowserVerification({
      browserVerification: { status: 'failed', errors: ['dev override'] },
    }, true),
    false
  );
  delete process.env.AGENT_ALLOW_FORCE_APPLY;
});

test('visual reset restores agent design surfaces from rollback snapshot without touching current nonvisual settings', () => {
  const current = {
    theme: 'bold',
    accent_color: '#ff00ff',
    layout: 'magazine',
    custom_css: '.pf-portfolio { background: red; }',
    custom_js: 'console.log("agent")',
    theme_overrides: { pageBackground: '#000' },
    animations: { cardEntrance: 'fadeUp' },
    site_sections: [{ id: 'proof' }],
    design_system: { direction: 'cinematic' },
    interactions: [{ type: 'cursorGlow' }],
    is_public: false,
    seo_title: 'Keep this title',
    preferred_ai_model: 'groq:llama-3.3-70b-versatile',
  };
  const snapshot = {
    version: 1,
    settings: {
      theme: 'clean',
      accent_color: '#2563eb',
      layout: 'classic',
      section_order: ['header', 'projects', 'contact'],
      custom_css: null,
      custom_js: null,
      theme_overrides: {},
      animations: {},
      site_sections: [],
      design_system: {},
      interactions: [],
    },
  };

  const reset = agentRouter.buildVisualResetSettings(current, snapshot);

  assert.equal(reset.theme, 'clean');
  assert.equal(reset.layout, 'classic');
  assert.equal(reset.custom_css, null);
  assert.deepEqual(reset.theme_overrides, {});
  assert.deepEqual(reset.site_sections, []);
  assert.deepEqual(reset.design_system, {});
  assert.deepEqual(reset.interactions, []);
  assert.equal(reset.is_public, false);
  assert.equal(reset.seo_title, 'Keep this title');
  assert.equal(reset.preferred_ai_model, 'groq:llama-3.3-70b-versatile');
});

test('full reset chooses the earliest applied rollback snapshot', () => {
  const earlySnapshot = { version: 1, capturedAt: '2026-01-01T00:00:00.000Z' };
  const lateSnapshot = { version: 1, capturedAt: '2026-01-02T00:00:00.000Z' };

  const result = agentRouter.findEarliestRollbackSnapshot([
    {
      id: 'late',
      applied_at: '2026-01-02T00:00:00.000Z',
      preview: { rollbackSnapshot: lateSnapshot },
    },
    {
      id: 'early',
      applied_at: '2026-01-01T00:00:00.000Z',
      preview: JSON.stringify({ rollbackSnapshot: earlySnapshot }),
    },
  ]);

  assert.equal(result.changeSet.id, 'early');
  assert.deepEqual(result.snapshot, earlySnapshot);
});

test('provider token and request-size errors are classified for fail-fast handling', () => {
  assert.equal(
    agentRouter.isProviderSizeError({
      status: 429,
      message: 'Request too large for model on tokens per minute (TPM): Limit 12000, Requested 14139',
    }),
    true
  );
  assert.equal(
    agentRouter.isProviderSizeError({
      status: 500,
      message: 'regular upstream outage',
    }),
    false
  );
  assert.equal(
    agentRouter.isProviderSizeError({
      status: 400,
      message: 'Please reduce the length of the messages or max_tokens. Context length exceeded.',
    }),
    true
  );

  const payload = agentRouter.buildProviderErrorResponse({
    error: { status: 429, message: 'rate_limit_exceeded: tokens per minute' },
    selectedModel: { id: 'groq:test', name: 'Groq Test', provider: 'groq', enabled: true },
    selectedMode: { id: 'auto' },
    route: { routed: false },
    compactContext: { user: { username: 'mike' } },
  });

  assert.match(payload.error, /too large/i);
  assert.equal(payload.diagnostics.providerStatus, 429);
  assert(payload.diagnostics.compactContextBytes > 0);

  assert.equal(
    agentRouter.isProviderTimeoutError({
      status: 504,
      code: 'PROVIDER_TIMEOUT',
    }),
    true
  );

  const timeoutPayload = agentRouter.buildProviderErrorResponse({
    error: { status: 504, code: 'PROVIDER_TIMEOUT', message: 'AI provider timed out.', timeoutMs: 150000 },
    selectedModel: { id: 'openrouter:test', name: 'OpenRouter Test', provider: 'openrouter', enabled: true },
    selectedMode: { id: 'largeUi' },
    route: { routed: false },
    compactContext: { user: { username: 'mike' } },
  });

  assert.match(timeoutPayload.error, /too long/i);
  assert.equal(timeoutPayload.diagnostics.providerStatus, 504);
  assert.equal(timeoutPayload.diagnostics.timeoutMs, 150000);
});

test('effective change gate rejects no-op customization bundles', () => {
  const noChangeErrors = agentRouter.buildEffectiveChangeErrors([
    {
      type: 'customization.patch',
      patch: {
        themeOverridesPatch: { totallyUnknownKey: '#fff' },
        cssBlocks: [],
      },
    },
  ], {
    aiFeedback: {
      summary: {
        cssChanged: false,
        jsChanged: false,
        themeOverrideKeys: [],
        animationKeys: [],
      },
      attempts: [{ errors: [], warnings: ['Ignored unknown theme override.'] }],
    },
  });

  assert(noChangeErrors.some((error) => /did not produce any visible/i.test(error)));

  assert.equal(agentRouter.hasVisibleAgentChange([
    { type: 'settings.patch', patch: { site_sections: [{ id: 'proof', type: 'text' }] } },
  ], null), true);
  assert.equal(agentRouter.hasVisibleAgentChange([
    { type: 'customization.patch', patch: { cssBlocks: [{ id: 'cards', css: '.pf-project-card { border-radius: 24px; }' }] } },
  ], null), true);
});

test('failed review bundles are discarded by default unless explicitly retained', () => {
  const previous = process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES;
  delete process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES;
  try {
    assert.equal(agentRouter.shouldDiscardFailedReviewBundle(), true);
    process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES = 'true';
    assert.equal(agentRouter.shouldDiscardFailedReviewBundle(), false);
  } finally {
    if (previous == null) delete process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES;
    else process.env.AGENT_KEEP_FAILED_REVIEW_BUNDLES = previous;
  }
});

test('agent section-order normalization preserves published project cards during redesigns', () => {
  const parsed = {
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'agent-proof', 'contact'],
          site_sections: [{ id: 'agent-proof', type: 'featureGrid' }],
        },
      },
    ],
    warnings: [],
  };
  const context = {
    settings: { section_order: ['header', 'projects', 'contact'], site_sections: [] },
    projects: [{ id: 'p1', status: 'published' }],
  };

  const normalized = agentRouter.normalizeParsedPublicSectionOrder(parsed, context, { id: 'fullRedesign' });
  const order = normalized.actions[0].patch.section_order;

  assert.deepEqual(order, ['header', 'agent-proof', 'projects', 'contact']);
  assert(normalized.warnings.some((warning) => /Restored the native Projects section/i.test(warning)));
});

test('agent section-order normalization does not require project cards without published projects', () => {
  const parsed = {
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'agent-proof', 'contact'],
          site_sections: [{ id: 'agent-proof', type: 'featureGrid' }],
        },
      },
    ],
    warnings: [],
  };
  const context = {
    settings: { section_order: ['header', 'projects', 'contact'], site_sections: [] },
    projects: [{ id: 'p1', status: 'draft' }],
  };

  const normalized = agentRouter.normalizeParsedPublicSectionOrder(parsed, context, { id: 'fullRedesign' });

  assert.deepEqual(normalized.actions[0].patch.section_order, ['header', 'agent-proof', 'contact']);
});

test('agent section-order normalization does not override explicit remove intent', () => {
  const parsed = {
    actions: [
      {
        type: 'settings.patch',
        patch: { section_order: ['header', 'contact'] },
      },
    ],
    warnings: [],
  };
  const context = {
    settings: { section_order: ['header', 'projects', 'contact'], site_sections: [] },
    projects: [{ id: 'p1', status: 'published' }],
  };

  const normalized = agentRouter.normalizeParsedPublicSectionOrder(parsed, context, { id: 'removeOrRevert' });

  assert.deepEqual(normalized.actions[0].patch.section_order, ['header', 'contact']);
});

test('surface manifest tracks native and code surfaces for precise removal', () => {
  const actions = [
    {
      type: 'settings.patch',
      patch: {
        theme: 'bold',
        section_order: ['header', 'agent-collection', 'projects', 'contact'],
        site_sections: [{ id: 'agent-collection', type: 'featureGrid' }],
        design_system: { direction: 'classical-museum' },
        interactions: [{ type: 'scrollReveal' }],
      },
    },
    {
      type: 'customization.patch',
      patch: {
        themeOverridesPatch: { pageBackground: '#111111' },
        animationsPatch: { cardHover: 'lift' },
        cssBlocks: [{ id: 'agent-classical-system', css: '.pf-header { color: red; }' }],
        jsBlocks: [{ id: 'agent-cursor', js: '(function(){})();' }],
      },
    },
  ];
  const before = {
    settings: {
      theme: 'clean',
      section_order: ['header', 'projects', 'contact'],
      site_sections: [],
      design_system: {},
      interactions: [],
      custom_css: null,
      custom_js: null,
      theme_overrides: {},
      animations: {},
    },
  };
  const after = {
    settings: {
      theme: 'bold',
      section_order: ['header', 'agent-collection', 'projects', 'contact'],
      site_sections: [{ id: 'agent-collection', type: 'featureGrid' }],
      design_system: { direction: 'classical-museum' },
      interactions: [{ type: 'scrollReveal' }],
      custom_css: '/* pf-ai:block:agent-classical-system */\n.pf-header { color: red; }\n/* pf-ai:end:agent-classical-system */',
      custom_js: '/* pf-ai:block:agent-cursor */\n(function(){})();\n/* pf-ai:end:agent-cursor */',
      theme_overrides: { pageBackground: '#111111' },
      animations: { cardHover: 'lift' },
    },
  };

  const manifest = agentRouter.buildAgentSurfaceManifest({ actions, before, after });

  assert.equal(manifest.settings.theme.before, 'clean');
  assert.equal(manifest.settings.theme.after, 'bold');
  assert.deepEqual(manifest.sections, ['agent-collection']);
  assert.deepEqual(manifest.code.cssBlockIds, ['agent-classical-system']);
  assert.deepEqual(manifest.code.jsBlockIds, ['agent-cursor']);
  assert.deepEqual(manifest.code.themeOverrideKeys, ['pageBackground']);
  assert.deepEqual(manifest.interactions, ['scrollReveal']);
});

test('manifest removal can remove code/effects without clearing unrelated manual code', () => {
  const manifest = {
    version: 1,
    settings: {},
    sections: [],
    code: {
      cssBlockIds: ['agent-card'],
      jsBlockIds: ['agent-glow'],
      themeOverrideKeys: ['pageBackground'],
      animationKeys: ['cardHover'],
      before: {
        theme_overrides: { cardShadow: 'manual-shadow' },
        animations: { cardHover: 'none' },
      },
    },
  };
  const current = {
    custom_css: '.manual { color: red; }\n\n/* pf-ai:block:agent-card */\n.pf-project-card { color: blue; }\n/* pf-ai:end:agent-card */',
    custom_js: 'console.log("manual");\n\n/* pf-ai:block:agent-glow */\n(function(){})();\n/* pf-ai:end:agent-glow */',
    theme_overrides: { cardShadow: 'manual-shadow', pageBackground: '#000' },
    animations: { cardHover: 'lift', pageBackground: 'none' },
  };

  const next = agentRouter.buildSettingsFromManifestBefore(current, manifest, 'code');

  assert.match(next.custom_css, /\.manual/);
  assert.doesNotMatch(next.custom_css, /agent-card/);
  assert.equal(next.custom_js, null);
  assert.deepEqual(next.theme_overrides, { cardShadow: 'manual-shadow' });
  assert.equal(next.animations.cardHover, 'none');
});

test('visual manifest removal restores code-only bundles to their pre-apply code state', () => {
  const manifest = {
    version: 1,
    settings: {},
    sections: [],
    code: {
      cssBlockIds: ['agent-card'],
      jsBlockIds: [],
      themeOverrideKeys: ['pageBackground'],
      animationKeys: ['cardHover'],
      before: {
        custom_css: '.manual { color: red; }',
        custom_js: null,
        theme_overrides: { cardShadow: 'manual-shadow' },
        animations: { cardHover: 'none' },
      },
    },
  };
  const current = {
    custom_css: '.manual { color: red; }\n\n/* pf-ai:block:agent-card */\n.pf-project-card { color: blue; }\n/* pf-ai:end:agent-card */',
    custom_js: null,
    theme_overrides: { cardShadow: 'manual-shadow', pageBackground: '#000' },
    animations: { cardHover: 'lift' },
    theme: 'clean',
  };

  const next = agentRouter.buildSettingsFromManifestBefore(current, manifest, 'visual');

  assert.equal(next.custom_css, '.manual { color: red; }');
  assert.deepEqual(next.theme_overrides, { cardShadow: 'manual-shadow' });
  assert.deepEqual(next.animations, { cardHover: 'none' });
  assert.equal(next.theme, 'clean');
});
