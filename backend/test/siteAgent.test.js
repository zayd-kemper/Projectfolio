const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeAgentClarificationNeed,
  analyzeContentClarificationNeed,
  buildFallbackAgentResponse,
  buildAgentUserMessage,
  buildCompactAgentContext,
  classifyAgentIntent,
  compileProjectFolioBundle,
  critiqueAgentBundle,
  parseAgentResponse,
  sanitizeAgentPlan,
  sanitizeSiteSections,
  validateAgentActions,
  validateAgentQuality,
} = require('../utils/siteAgent');

test('browser verification feedback is included in repair prompts', () => {
  const message = buildAgentUserMessage({
    prompt: 'Make the site cinematic.',
    context: { user: { full_name: 'Zayd' }, settings: {}, projects: [] },
    previousErrors: ['portfolio/mobile: horizontal overflow 120px.'],
  });

  assert.match(message, /failed validation or browser verification/);
  assert.match(message, /portfolio\/mobile: horizontal overflow 120px/);
  assert.match(message, /Make the site cinematic/);
});

test('agent prompt context is compacted before model calls', () => {
  const largeCss = '/* pf-ai:block:agent-card */\n.pf-project-card { color: red; }\n/* pf-ai:end:agent-card */\n' + '.pf-project-card { color: red; }\n'.repeat(400);
  const largeBlock = { text: 'Detailed block text '.repeat(500) };
  const context = {
    user: {
      id: 'u1',
      full_name: 'Zayd',
      username: 'zayd',
      headline: 'Builder',
      bio: 'Long bio '.repeat(200),
      skills: ['React', 'Node', 'Design'],
    },
    settings: {
      theme: 'bold',
      layout: 'magazine',
      custom_css: largeCss,
      custom_js: 'console.log("x");'.repeat(300),
      site_sections: [{ id: 'proof', type: 'text', content: { text: 'x'.repeat(1000) } }],
      design_system: { direction: 'premium-studio' },
    },
    projects: Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      slug: `project-${index}`,
      title: `Project ${index}`,
      description: 'Description '.repeat(200),
      blocks: [{ id: `b${index}`, type: 'text', content: largeBlock }],
    })),
    memories: Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, kind: 'preference', content: 'memory '.repeat(200) })),
    appliedChangeSets: [
      {
        id: 'cs-qwen',
        thread_id: 'thread-qwen',
        model_id: 'openrouter:qwen',
        summary: 'Clean dark visual system',
        applied_at: '2026-06-14T10:00:00.000Z',
        actions: [{ type: 'customization.patch' }],
        preview: {
          surfaceSummary: {
            settings: ['layout'],
            cssBlocks: ['agent-card'],
            themeOverrides: ['cardTitleColor'],
          },
        },
      },
    ],
  };

  const rawLength = JSON.stringify(context).length;
  const compact = buildCompactAgentContext(context);
  const compactLength = JSON.stringify(compact).length;
  const message = buildAgentUserMessage({ prompt: 'Redesign my site', context });

  assert(compactLength < rawLength / 3, `Expected compact context ${compactLength} to be much smaller than raw ${rawLength}`);
  assert.equal(compact.projects.length, 8);
  assert.equal(compact.memories.length, 8);
  assert.equal(compact.omitted.projects, 4);
  assert.deepEqual(compact.settings.custom_css_summary.blockIds, ['agent-card']);
  assert.equal(compact.settings.custom_css_summary.blocks[0].id, 'agent-card');
  assert.match(compact.settings.custom_css_summary.blocks[0].summary, /\.pf-project-card/);
  assert.deepEqual(compact.appliedChangeSets[0].ownedSurfaces.cssBlocks, ['agent-card']);
  assert(!message.includes(largeCss));
  assert.match(message, /custom_css_summary/);
  assert.match(message, /Cross-chat edit note/);
  assert.match(message, /appliedChangeSets/);
});

test('system prompt instructs models to edit existing cross-chat surfaces', () => {
  const system = require('../utils/siteAgent').buildAgentSystemMessage(classifyAgentIntent('Change the project title color'));

  assert.match(system, /Cross-chat collaboration is expected/);
  assert.match(system, /reuse existing cssBlocks ids/);
  assert.match(system, /Do not generate raw JavaScript or jsBlocks/);
  assert.match(system, /specific text colors/);
});

test('agent asks for content guidance before inventing copy for thin portfolios', () => {
  const context = {
    user: { full_name: 'Zayd', headline: 'Student', bio: 'Builder.' },
    settings: {},
    projects: [
      { title: 'Mart', tagline: 'test', description: 'short', status: 'published', blocks: [] },
    ],
  };

  const prompt = 'Turn this into a premium portfolio for AI engineering roles with stronger project storytelling and a clean dark visual style.';
  const result = analyzeContentClarificationNeed({
    prompt,
    context,
    intent: classifyAgentIntent(prompt),
  });

  assert.equal(result.shouldAsk, true);
  assert.match(result.reply, /Should I write new portfolio copy/i);
  assert.equal(result.clarification.options.length, 2);
  assert(result.reasons.some((reason) => reason.includes('project descriptions')));
});

test('agent asks for design direction when broad design prompts are too vague', () => {
  const prompt = 'Make my portfolio design better and more professional.';
  const result = analyzeAgentClarificationNeed({
    prompt,
    context: { user: {}, settings: {}, projects: [] },
    intent: classifyAgentIntent(prompt),
  });

  assert.equal(result.shouldAsk, true);
  assert.equal(result.clarification.type, 'design_direction');
  assert.equal(result.clarification.options.length, 3);
  assert.match(result.reply, /What direction should I take/i);
});

test('specific rainbow prompts do not trigger generic design clarification', () => {
  const prompt = 'Make my whole website rainbow colored';
  const result = analyzeAgentClarificationNeed({
    prompt,
    context: { user: {}, settings: {}, projects: [] },
    intent: classifyAgentIntent(prompt),
  });

  assert.equal(result.shouldAsk, false);
  assert.equal(classifyAgentIntent(prompt).id, 'fullRedesign');
});

test('content guidance gate allows visual-only or user-supplied copy direction', () => {
  const context = {
    user: { full_name: 'Zayd', headline: 'Student', bio: 'Builder.' },
    settings: {},
    projects: [
      { title: 'Mart', tagline: 'test', description: 'short', status: 'published', blocks: [] },
    ],
  };

  assert.equal(analyzeContentClarificationNeed({
    prompt: 'Turn this into a premium portfolio for AI engineering roles, visual changes only.',
    context,
    intent: classifyAgentIntent('Turn this into a premium portfolio for AI engineering roles, visual changes only.'),
  }).shouldAsk, false);

  assert.equal(analyzeContentClarificationNeed({
    prompt: 'Yes, focus on AI engineering roles, React, Node, automation, and production case studies.',
    context,
    intent: classifyAgentIntent('Yes, focus on AI engineering roles, React, Node, automation, and production case studies.'),
  }).shouldAsk, false);

  assert.equal(analyzeContentClarificationNeed({
    prompt: 'Original request: premium portfolio\nClarification answer: Keep this visual changes only.',
    context,
    intent: classifyAgentIntent('premium portfolio'),
  }).shouldAsk, false);
});

test('parseAgentResponse supports model-requested clarification without actions', () => {
  const response = parseAgentResponse(JSON.stringify({
    reply: 'I need one detail before I build this.',
    clarification: {
      type: 'design_direction',
      question: 'Which tone should I use?',
      options: [
        { id: 'dark', label: 'Dark premium', description: 'Sleek dark UI', value: 'Clarification answer: dark premium' },
        { id: 'warm', label: 'Warm minimal', description: 'Light and restrained', value: 'Clarification answer: warm minimal' },
      ],
    },
    actions: [],
  }), { prompt: 'Make my site better', intent: classifyAgentIntent('Make my site better') });

  assert.equal(response.errors.length, 0);
  assert.equal(response.actions.length, 0);
  assert.equal(response.clarification.question, 'Which tone should I use?');
  assert.equal(response.clarification.options.length, 2);
});

test('validates and filters agent actions to public ProjectFolio fields', () => {
  const validation = validateAgentActions([
    {
      type: 'profile.patch',
      patch: {
        headline: 'AI engineer',
        email: 'private@example.com',
        password: 'nope',
      },
    },
    {
      type: 'settings.patch',
      patch: {
        layout: 'magazine',
        design_system: {
          direction: 'Premium Studio!',
          tokens: { accent: '#fff', sectionGap: '80px' },
          componentVariants: { projectCard: 'case-study-list' },
        },
        interactions: [
          { type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp', stagger: 999 },
          { type: 'cardTilt', target: '.unsafe', strength: 'strong' },
          { type: 'microInteractions', target: '.pf-contact-link', effect: 'invert' },
          { type: 'pageTransition', effect: 'slideUp', duration: 9999 },
          { type: 'rawScript', js: 'alert(1)' },
        ],
        billing_plan: 'premium',
      },
    },
  ]);

  assert.deepEqual(validation.errors, []);
  assert.equal(validation.actions[0].patch.headline, 'AI engineer');
  assert.equal(validation.actions[0].patch.email, undefined);
  assert.equal(validation.actions[1].patch.layout, 'magazine');
  assert.equal(validation.actions[1].patch.billing_plan, undefined);
  assert.equal(validation.actions[1].patch.design_system.direction, 'premium-studio');
  assert.equal(validation.actions[1].patch.design_system.tokens.sectionGap, '80px');
  assert.equal(validation.actions[1].patch.interactions.length, 4);
  assert.equal(validation.actions[1].patch.interactions[0].stagger, 240);
  assert.equal(validation.actions[1].patch.interactions[1].target, '.pf-project-card');
  assert.equal(validation.actions[1].patch.interactions[2].effect, 'invert');
  assert.equal(validation.actions[1].patch.interactions[3].duration, 450);
});

test('interaction recipes sanitize ambient motion without raw animation code', () => {
  const validation = validateAgentActions([
    {
      type: 'settings.patch',
      patch: {
        interactions: [
          { type: 'gradientMesh', opacity: 0.99 },
          { type: 'ambientParticles', density: 'extreme' },
          { type: 'cursorGlow', size: 999, opacity: 0.99 },
          { type: 'navAutoHide', threshold: 999 },
          { type: 'microInteractions', target: '.pf-project-card', effect: 'glow' },
        ],
      },
    },
  ]);

  const interactions = validation.actions[0].patch.interactions;
  assert.equal(interactions.length, 4);
  assert.equal(interactions[0].opacity, 0.45);
  assert.equal(interactions[1].density, 'low');
  assert.equal(interactions[2].size, 360);
  assert.equal(interactions[2].opacity, 0.35);
  assert.equal(interactions[3].threshold, 180);
});

test('ignores malformed optional actions and unsupported custom sections', () => {
  const validation = validateAgentActions([
    { type: 'unknown.action' },
    { type: 'project.patch', patch: { title: 'Missing target' } },
  ]);

  assert.deepEqual(validation.errors, []);
  assert(validation.warnings.some((warning) => warning.includes('unknown')));
  assert(validation.warnings.some((warning) => warning.includes('project.patch needs projectId or slug')));
  assert.equal(validation.actions.length, 0);

  const sections = sanitizeSiteSections([
    { id: 'About Me!', type: 'text', variant: 'spotlight', layout: { align: 'split', columns: 5 }, content: { text: 'Hello' } },
    { id: 'bad', type: 'rawHtml', content: { html: '<script />' } },
  ]);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, 'about-me');
  assert.equal(sections[0].type, 'text');
  assert.equal(sections[0].variant, 'spotlight');
  assert.equal(sections[0].layout.align, 'split');
  assert.equal(sections[0].layout.columns, undefined);
});

test('native builder schema accepts rich frontend section primitives', () => {
  const sections = sanitizeSiteSections([
    {
      id: 'Builder Hero',
      type: 'hero',
      variant: 'product',
      layout: { align: 'split', density: 'spacious', emphasis: 'high' },
      content: {
        heading: 'AI engineering portfolio',
        actions: [{ label: 'View work', href: '#projects' }],
        highlights: [{ label: 'Projects', value: '3' }],
      },
    },
    {
      id: 'Proof Wall',
      type: 'proofWall',
      variant: 'signalStack',
      content: { items: [{ value: '3', label: 'Projects', text: 'React, Node, automation' }] },
    },
    {
      id: 'Skill Matrix',
      type: 'skillMatrix',
      variant: 'toolbox',
      content: { groups: [{ title: 'Stack', skills: ['React', 'Node'] }] },
    },
  ]);

  assert.equal(sections.length, 3);
  assert.equal(sections[0].id, 'builder-hero');
  assert.equal(sections[0].type, 'hero');
  assert.equal(sections[0].variant, 'product');
  assert.equal(sections[1].type, 'proofWall');
  assert.equal(sections[2].type, 'skillMatrix');
});

test('site agent rejects raw JavaScript bundles now that JS is disabled', () => {
  const validation = validateAgentActions([
    {
      type: 'customization.patch',
      patch: {
        jsBlocks: [{ id: 'cursor', js: '(function(){})();' }],
      },
    },
  ]);

  assert(validation.errors.some((error) => /Custom JavaScript is disabled/i.test(error)));
});

test('intent classifier keeps small edits scoped and detects full redesigns', () => {
  assert.equal(classifyAgentIntent('Make my project cards more rounded').id, 'styleTweak');
  assert.equal(classifyAgentIntent('Add a subtle particle background').id, 'codeEffect');
  assert.equal(classifyAgentIntent('Add a testimonials section').id, 'sectionAdd');
  const corporateStyle = classifyAgentIntent('Give my portfolio a corporate look with a distinct color scheme, premium project cards, scrolling animations, and a transition zoom animation.');
  assert.equal(corporateStyle.id, 'siteStyle');
  assert.equal(corporateStyle.allowDesignSystem, true);
  assert.equal(corporateStyle.allowInteractions, true);
  assert.equal(corporateStyle.allowNewSections, false);
  assert.equal(classifyAgentIntent('Make my portfolio feel like an ancient Roman museum').id, 'fullRedesign');
  const redesignIntent = classifyAgentIntent('Turn this into a premium portfolio for AI engineering roles with stronger project storytelling and a clean dark visual style.');
  assert.equal(redesignIntent.id, 'fullRedesign');
  assert.equal(redesignIntent.allowProfilePatch, false);
  assert.equal(redesignIntent.allowProjectPatch, false);
  assert.equal(classifyAgentIntent('Remove the AI particle effect').id, 'removeOrRevert');
});

test('visual redesign prompts cannot mutate skills or keep invented philosophy copy', () => {
  const prompt = 'Design a premium, minimalist personal website utilizing a sleek neo-brutalist aesthetic with high contrast deep charcoal backgrounds and crisp luminous white typography.';
  const intent = classifyAgentIntent(prompt);
  const response = parseAgentResponse(JSON.stringify({
    reply: 'Review this neo-brutalist design.',
    summary: 'Neo-brutalist redesign',
    designBrief: {
      goal: 'Create a premium neo-brutalist visual system.',
      audience: 'Portfolio visitors',
      tone: 'Minimal, high contrast, and motion-forward',
      styleDirection: 'neo-brutalist-dark',
    },
    sitePlan: {
      sections: [
        { id: 'header', role: 'identity', type: 'native', layoutIntent: 'Lead with high-contrast identity.' },
        { id: 'projects', role: 'proof', type: 'native', layoutIntent: 'Show project cards in the brutalist grid.' },
        { id: 'contact', role: 'conversion', type: 'native', layoutIntent: 'Keep contact visible.' },
      ],
      contentHierarchy: ['identity', 'projects', 'contact'],
    },
    designSystem: {
      direction: 'neo-brutalist-dark',
      tokens: { background: '#0a0a0b', text: '#fafafa', accent: '#f8fafc' },
    },
    actions: [
      {
        type: 'profile.patch',
        patch: {
          skills: ['JavaScript', 'Neo-Brutalism'],
          bio: 'My approach combines the raw honesty of brutalism with premium craftsmanship.',
        },
      },
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'philosophy', 'education', 'projects', 'contact'],
          site_sections: [{
            id: 'philosophy',
            type: 'text',
            title: 'Philosophy',
            content: {
              text: 'My approach combines the raw honesty of brutalism with premium craftsmanship. I believe in creating digital experiences that are both striking and functional.',
            },
          }],
        },
      },
      {
        type: 'customization.patch',
        patch: {
          cssBlocks: [{
            id: 'neo-brutal',
            css: [
              '.pf-portfolio { background: #0a0a0b; }',
              '.pf-header { color: #fff; }',
              '.pf-section { border-color: #fff; }',
              '.pf-project-card { color: #fff; }',
              '.pf-contact-card { color: #fff; }',
            ].join(' '),
          }],
        },
      },
    ],
  }), { prompt, intent });

  assert.equal(response.errors.length, 0);
  assert(!response.actions.some((action) => action.type === 'profile.patch'));
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  assert.deepEqual(settingsPatch.site_sections, []);
  assert(!settingsPatch.section_order.includes('philosophy'));
  assert(settingsPatch.section_order.includes('education'));
  assert(response.warnings.some((warning) => /invented portfolio-copy/i.test(warning)));
});

test('parseAgentResponse strips sections from small scoped edits', () => {
  const intent = classifyAgentIntent('Make my project cards more rounded');
  const response = parseAgentResponse(JSON.stringify({
    reply: 'Review this.',
    summary: 'Rounded cards',
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'agent-positioning', 'projects', 'contact'],
          site_sections: [{ id: 'agent-positioning', type: 'featureGrid', title: 'Clear positioning' }],
          layout: 'magazine',
        },
      },
      {
        type: 'customization.patch',
        patch: {
          cssBlocks: [{ id: 'rounded-cards', css: '.pf-project-card { border-radius: 24px; }' }],
        },
      },
    ],
  }), { prompt: 'Make my project cards more rounded', intent });

  assert.equal(response.errors.length, 0);
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  assert.equal(settingsPatch.site_sections, undefined);
  assert.equal(settingsPatch.section_order, undefined);
  assert.equal(settingsPatch.layout, 'magazine');
  assert(response.warnings.some((warning) => warning.includes('Removed generated custom sections')));
});

test('fallback agent keeps small edits scoped', () => {
  const response = buildFallbackAgentResponse('Make my project cards more rounded', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1', title: 'Project' }],
  });

  assert.equal(response.summary, 'Focused visual edit');
  assert(!response.actions.some((action) => action.type === 'settings.patch' && action.patch?.site_sections?.length));
  assert(response.actions.some((action) => action.type === 'customization.patch'));
});

test('quality gate rejects explicit direction mismatch', () => {
  const quality = validateAgentQuality({
    prompt: 'Make my portfolio feel like an ancient Roman museum',
    intent: classifyAgentIntent('Make my portfolio feel like an ancient Roman museum'),
    designBrief: { styleDirection: 'premium-studio' },
    sitePlan: { contentHierarchy: ['identity', 'projects', 'contact'] },
    designSystem: { direction: 'premium-studio', tokens: { background: '#030712', text: '#ffffff' } },
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'agent-premium-proof', 'projects', 'contact'],
          site_sections: [{ id: 'agent-premium-proof', type: 'proofWall', title: 'Premium proof', content: { items: [{ value: '1', label: 'Project' }] } }],
        },
      },
    ],
  });

  assert.equal(quality.status, 'failed');
  assert(quality.errors.some((error) => /classical-museum/i.test(error)));
});

test('portfolio-wide visual prompts require core surface coverage and native motion', () => {
  const prompt = 'Give my portfolio a corporate look with a distinct color scheme, premium project cards, along with scrolling animations and a transition zoom animation that play when a viewer opens and closes project cards';
  const intent = classifyAgentIntent(prompt);

  const weak = validateAgentQuality({
    prompt,
    intent,
    actions: [
      {
        type: 'settings.patch',
        patch: {
          design_system: { direction: 'premium-studio', tokens: { accent: '#2563eb' } },
          interactions: [{ type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp' }],
        },
      },
      {
        type: 'customization.patch',
        patch: {
          cssBlocks: [{ id: 'corporate-header-only', css: '.pf-header { background: #0f172a; }' }],
        },
      },
    ],
  });

  assert.equal(weak.status, 'needs_review');
  assert(weak.warnings.some((warning) => /Portfolio-wide style CSS must cover core ProjectFolio surfaces/i.test(warning)));

  const strong = validateAgentQuality({
    prompt,
    intent,
    actions: [
      {
        type: 'settings.patch',
        patch: {
          design_system: { direction: 'premium-studio', tokens: { accent: '#2563eb' } },
          interactions: [
            { type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp' },
            { type: 'pageTransition', effect: 'scale' },
          ],
        },
      },
      {
        type: 'customization.patch',
        patch: {
          cssBlocks: [{
            id: 'corporate-system',
            css: '.pf-header { background: #0f172a; } .pf-project-card { box-shadow: 0 20px 60px rgba(0,0,0,.2); } .pf-contact-card { border-color: #2563eb; }',
          }],
        },
      },
    ],
  });

  assert.notEqual(strong.status, 'failed', strong.errors.join('\n'));
});

test('fallback agent creates a prompt-specific full redesign bundle without canned sections', () => {
  const response = buildFallbackAgentResponse('Redesign my portfolio as an ancient Roman museum website with motion', {
    user: { full_name: 'Zayd', contact_email: 'zayd@example.com' },
    projects: [{ id: 'p1' }, { id: 'p2' }],
  });
  const validation = validateAgentActions(response.actions);

  assert.deepEqual(validation.errors, []);
  assert(response.actions.some((action) => action.type === 'settings.patch' && action.patch.site_sections?.length <= 3));
  assert(response.actions.some((action) => action.type === 'customization.patch' && action.patch.cssBlocks?.[0]?.css.includes('.pf-header')));
  assert(response.actions.some((action) => action.type === 'memory.upsert'));
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  assert(settingsPatch.site_sections.every((section) => section.variant));
  assert(settingsPatch.site_sections.some((section) => section.layout?.emphasis === 'high'));
  assert(settingsPatch.site_sections.some((section) => section.type === 'featuredProjects'));
  assert(settingsPatch.site_sections.some((section) => section.id === 'agent-collection'));
  assert(!JSON.stringify(settingsPatch.site_sections).toLowerCase().includes('clear positioning'));
  assert(settingsPatch.site_sections.some((section) => section.type === 'hero'));
  assert(settingsPatch.site_sections.some((section) => section.type === 'proofWall'));
  assert.equal(settingsPatch.design_system.direction, 'classical-museum');
  assert.equal(settingsPatch.design_system.tokens.sectionGap, 'clamp(48px, 8vw, 104px)');
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'scrollReveal'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'microInteractions'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'gradientMesh'));
  assert.equal(response.designBrief.styleDirection, 'classical-museum');
  assert(response.sitePlan.sections.some((section) => section.id === 'agent-positioning-hero'));
  assert(response.sitePlan.sections.some((section) => section.id === 'agent-collection'));
  assert.equal(response.designSystem.componentVariants.projectCard, 'layered-hover-card');
});

test('fallback agent creates portfolio-wide site style without adding sections', () => {
  const prompt = 'Give my portfolio a corporate look with a distinct color scheme, premium project cards, along with scrolling animations and a transition zoom animation that play when a viewer opens and closes project cards';
  const response = buildFallbackAgentResponse(prompt, {
    user: { full_name: 'Zayd', headline: 'Builder' },
    settings: { section_order: ['header', 'projects', 'contact'] },
    projects: [{ id: 'p1', title: 'Mart' }],
  });
  const validation = validateAgentActions(response.actions);
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  const customizationPatch = response.actions.find((action) => action.type === 'customization.patch').patch;
  const css = customizationPatch.cssBlocks[0].css;

  assert.deepEqual(validation.errors, []);
  assert.equal(response.summary, 'Premium studio visual system');
  assert.equal(settingsPatch.site_sections, undefined);
  assert.equal(settingsPatch.section_order, undefined);
  assert.equal(settingsPatch.design_system.direction, 'premium-studio');
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'scrollReveal'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'microInteractions'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'pageTransition' && interaction.effect === 'scale'));
  assert(css.includes('.pf-header'));
  assert(css.includes('.pf-project-card'));
  assert(css.includes('.pf-contact-card'));
  assert.equal(customizationPatch.animationsPatch.cardEntrance, 'fadeUp');
});

test('fallback agent creates full-site western and rainbow visual systems', () => {
  const western = buildFallbackAgentResponse('Give my website a Wild West/Cowboy theme; the background should look like the desert and the project cards should have related accessories attached to them', {
    user: { full_name: 'Zayd', headline: 'Builder' },
    settings: { section_order: ['header', 'projects', 'contact'] },
    projects: [{ id: 'p1', title: 'Mart' }],
  });
  const westernPatch = western.actions.find((action) => action.type === 'settings.patch').patch;
  const westernCss = western.actions.find((action) => action.type === 'customization.patch').patch.cssBlocks[0].css;

  assert.equal(westernPatch.design_system.direction, 'western-desert');
  assert.match(westernCss, /desert|WANTED|pf-project-card::before/i);
  assert(westernCss.includes('.pf-header'));
  assert(westernCss.includes('.pf-project-card'));
  assert(westernCss.includes('.pf-contact-card'));

  const rainbow = buildFallbackAgentResponse('Make my whole website rainbow colored', {
    user: { full_name: 'Zayd', skills: ['React', 'Node'] },
    settings: { section_order: ['header', 'projects', 'contact'] },
    projects: [{ id: 'p1', title: 'Mart' }],
  });
  const rainbowPatch = rainbow.actions.find((action) => action.type === 'settings.patch').patch;
  const rainbowCss = rainbow.actions.find((action) => action.type === 'customization.patch').patch.cssBlocks[0].css;

  assert.equal(rainbowPatch.design_system.direction, 'rainbow');
  assert.match(rainbowCss, /nth-child|rainbow|spectrum/i);
  assert(rainbowCss.includes('.pf-header'));
  assert(rainbowCss.includes('.pf-project-card'));
  assert(rainbowCss.includes('.pf-contact-card'));
});

test('ProjectFolio compiler replaces incomplete model redesign drafts with native-safe bundles', () => {
  const prompt = 'Give my website a Wild West/Cowboy theme; the background should look like the desert and the project cards should have related accessories attached to them';
  const intent = classifyAgentIntent(prompt);
  const compiled = compileProjectFolioBundle({
    prompt,
    intent,
    context: {
      user: { full_name: 'Zayd', headline: 'Builder', skills: ['React'] },
      settings: { section_order: ['header', 'education', 'projects', 'endorsements', 'contact'] },
      projects: [{ id: 'p1', title: 'Mart', is_featured: true }],
    },
    modelDraft: {
      actions: [
        {
          type: 'customization.patch',
          patch: {
            cssBlocks: [{
              id: 'model-western',
              css: '.pf-header { background: tan; } .pf-project-card { border-color: brown; }',
            }],
          },
        },
      ],
      errors: ['Full-site redesign CSS must cover core ProjectFolio surfaces. Missing: .pf-contact-card.'],
    },
    reason: 'test_model_incomplete',
  });

  const settingsPatch = compiled.actions.find((action) => action.type === 'settings.patch').patch;
  const css = compiled.actions.find((action) => action.type === 'customization.patch').patch.cssBlocks[0].css;

  assert.equal(compiled.compiler.id, 'projectfolio-native-v1');
  assert.equal(compiled.compiler.modelDraftHadErrors, true);
  assert.deepEqual(compiled.errors, []);
  assert.equal(settingsPatch.design_system.direction, 'western-desert');
  assert(settingsPatch.section_order.includes('education'));
  assert(settingsPatch.section_order.includes('endorsements'));
  assert(css.includes('.pf-header'));
  assert(css.includes('.pf-project-card'));
  assert(css.includes('.pf-contact-card'));
  assert(css.includes('.pf-credential-card'));
  assert(css.includes('.pf-endorsement-card'));
  assert.match(css, /@media/);
});

test('ProjectFolio compiler turns GPT-OSS-style CSS-only hover drafts into native interactions', () => {
  const prompt = 'Make my project cards rounded with a subtle hover lift. Do not add sections.';
  const intent = classifyAgentIntent(prompt);
  const compiled = compileProjectFolioBundle({
    prompt,
    intent,
    context: {
      user: { full_name: 'Zayd' },
      settings: { section_order: ['header', 'projects', 'contact'] },
      projects: [{ id: 'p1', title: 'Mart' }],
    },
    modelDraft: {
      actions: [
        {
          type: 'customization.patch',
          patch: {
            cssBlocks: [{ id: 'rounded-hover', css: '.pf-project-card:hover { transform: translateY(-4px); }' }],
          },
        },
      ],
      errors: ['Animation or transition was requested, but the proposed bundle does not use native interaction recipes or animationsPatch.'],
    },
    reason: 'test_css_only_hover',
  });

  const settingsPatch = compiled.actions.find((action) => action.type === 'settings.patch').patch;
  const css = compiled.actions.find((action) => action.type === 'customization.patch').patch.cssBlocks[0].css;

  assert.equal(compiled.compiler.id, 'projectfolio-native-v1');
  assert.deepEqual(compiled.errors, []);
  assert(!settingsPatch.site_sections);
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'microInteractions'));
  assert(css.includes('.pf-project-card'));
  assert.match(css, /border-radius/);
});

test('fallback neo-brutalist redesign uses dark direction and styles optional native sections', () => {
  const prompt = 'Design a premium, minimalist personal website utilizing a sleek neo-brutalist aesthetic with high contrast deep charcoal backgrounds and crisp luminous white typography. Implement buttery-smooth CSS animations and a navigation header that hides on scroll.';
  const response = buildFallbackAgentResponse(prompt, {
    user: { full_name: 'Zayd', skills: ['React'] },
    settings: { section_order: ['header', 'education', 'projects', 'endorsements', 'contact'] },
    projects: [{ id: 'p1', title: 'Project One' }],
  });
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  const css = response.actions.find((action) => action.type === 'customization.patch').patch.cssBlocks[0].css;

  assert.equal(settingsPatch.design_system.direction, 'neo-brutalist-dark');
  assert.equal(settingsPatch.layout, 'fullwidth');
  assert(settingsPatch.section_order.includes('education'));
  assert(settingsPatch.section_order.includes('endorsements'));
  assert(css.includes('.pf-credential-card'));
  assert(css.includes('.pf-endorsement-card'));
  assert(css.includes('backdrop-filter'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'navAutoHide'));
  assert(settingsPatch.interactions.some((interaction) => interaction.type === 'microInteractions'));
});

test('technical AI prompts do not default to neon without explicit neon language', () => {
  const response = buildFallbackAgentResponse('Redesign my portfolio for an AI engineer with a clean product feel', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1' }],
  });
  const settingsPatch = response.actions.find((action) => action.type === 'settings.patch').patch;
  assert.notEqual(settingsPatch.design_system.direction, 'neon-lab');
});

test('fallback agent varies native section templates by design direction', () => {
  const editorial = buildFallbackAgentResponse('Make this an editorial case study website', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1', is_featured: true }],
  });
  const launch = buildFallbackAgentResponse('Redesign my portfolio like a SaaS product launch page', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1' }],
  });
  const terminal = buildFallbackAgentResponse('Make my site feel like a terminal developer workspace', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1' }],
  });

  const editorialSections = editorial.actions.find((action) => action.type === 'settings.patch').patch.site_sections;
  const launchSections = launch.actions.find((action) => action.type === 'settings.patch').patch.site_sections;
  const terminalSections = terminal.actions.find((action) => action.type === 'settings.patch').patch.site_sections;

  assert(editorialSections.some((section) => section.id === 'agent-editorial-note' && section.type === 'caseStudy'));
  assert(editorialSections.some((section) => section.id === 'agent-selected-work' && section.variant === 'caseStudyList'));
  assert(launchSections.some((section) => section.id === 'agent-offer-stack' && section.type === 'proofWall'));
  assert(terminalSections.some((section) => section.id === 'agent-command-menu' && section.type === 'process'));
});

test('parses and sanitizes structured design planning fields from agent responses', () => {
  const response = parseAgentResponse(JSON.stringify({
    reply: 'Review this redesign.',
    summary: 'Editorial redesign',
    threadTitle: 'Editorial',
    designBrief: {
      goal: 'Create a stronger storytelling portfolio.',
      audience: 'Hiring managers',
      tone: 'Editorial and calm',
      styleDirection: 'editorial',
      constraints: ['Keep existing projects'],
    },
    sitePlan: {
      sections: [
        { id: 'hero', role: 'identity', type: 'native', layoutIntent: 'Lead with positioning.' },
        { id: 'proof wall!', role: 'credibility', type: 'stats', layoutIntent: 'Show proof.' },
      ],
      primaryCta: 'Read case studies',
      contentHierarchy: ['identity', 'proof', 'work'],
    },
    designSystem: {
      direction: 'editorial',
      tokens: { surface: 'paper', radius: '12px' },
      componentVariants: { projectCard: 'case-study-list' },
    },
    actions: [
      { type: 'settings.patch', patch: { layout: 'magazine' } },
    ],
  }));

  assert.equal(response.errors.length, 0);
  assert.equal(response.designBrief.styleDirection, 'editorial');
  assert.equal(response.sitePlan.sections[1].id, 'proof-wall');
  assert.equal(response.designSystem.tokens.surface, 'paper');
  assert.equal(response.actions[0].patch.design_system.direction, 'editorial');
  assert.equal(response.actions[0].patch.layout, 'magazine');
});

test('sanitizes design plans without trusting arbitrary nested content', () => {
  const plan = sanitizeAgentPlan({
    designBrief: {
      goal: 'x'.repeat(400),
      styleDirection: 'Premium Studio!!!',
      constraints: ['one', 'two'],
    },
    sitePlan: {
      sections: [{ id: 'Section One', role: 'proof', layoutIntent: 'Useful section' }],
    },
    designSystem: {
      direction: 'Neon Lab',
      tokens: { surface: { unsafe: '<script />' } },
    },
  });

  assert.equal(plan.designBrief.goal.length, 280);
  assert.equal(plan.designBrief.styleDirection, 'premium-studio');
  assert.equal(plan.sitePlan.sections[0].id, 'section-one');
  assert.equal(typeof plan.designSystem.tokens.surface, 'string');
});

test('critiques broad redesign bundles for missing composition ingredients', () => {
  const critique = critiqueAgentBundle({
    prompt: 'Redesign my website into a unique premium landing page',
    actions: [
      { type: 'customization.patch', patch: { cssBlocks: [{ id: 'basic', css: '.pf-name { color: red; }' }] } },
    ],
  });

  assert.equal(critique.status, 'needs_review');
  assert(critique.warnings.some((warning) => warning.includes('no design brief')));
  assert(critique.warnings.some((warning) => warning.includes('no mobile media rule')));

  const response = buildFallbackAgentResponse('Redesign my website as a premium interactive site', {
    user: { full_name: 'Zayd' },
    projects: [{ id: 'p1' }],
  });
  const passing = critiqueAgentBundle({
    prompt: 'Redesign my website as a premium interactive site',
    actions: response.actions,
    designBrief: response.designBrief,
    sitePlan: response.sitePlan,
    designSystem: response.designSystem,
  });

  assert.equal(passing.status, 'passed');
  assert(passing.notes.some((note) => note.includes('design-system plan')));
});

test('motion prompts require native interaction recipes or animation patches', () => {
  const bad = validateAgentQuality({
    prompt: 'Add buttery smooth scroll reveal transitions and hover animations.',
    intent: classifyAgentIntent('Add buttery smooth scroll reveal transitions and hover animations.'),
    actions: [
      {
        type: 'customization.patch',
        patch: {
          cssBlocks: [{ id: 'motion-css', css: '.pf-project-card { animation: float 500ms ease both; } @keyframes float { from { opacity: 0; } to { opacity: 1; } }' }],
        },
      },
    ],
  });

  assert.equal(bad.status, 'needs_review');
  assert(bad.warnings.some((warning) => warning.includes('native interaction recipes or animationsPatch')));
  assert(bad.warnings.some((warning) => warning.includes('Animation-heavy bundles')));

  const good = validateAgentQuality({
    prompt: 'Add buttery smooth scroll reveal transitions and hover animations.',
    intent: classifyAgentIntent('Add buttery smooth scroll reveal transitions and hover animations.'),
    actions: [
      {
        type: 'settings.patch',
        patch: {
          interactions: [
            { type: 'scrollReveal', target: '.pf-section', effect: 'fadeUp', stagger: 70, duration: 520 },
            { type: 'microInteractions', target: '.pf-project-card', effect: 'lift' },
          ],
        },
      },
      {
        type: 'customization.patch',
        patch: {
          animationsPatch: { cardHover: 'lift' },
          cssBlocks: [{ id: 'static-style', css: '.pf-project-card { border-radius: 24px; }' }],
        },
      },
    ],
  });

  assert.notEqual(good.status, 'failed');
  assert.deepEqual(good.errors, []);
});

test('critiques accessibility and UX risks in design bundles', () => {
  const critique = critiqueAgentBundle({
    prompt: 'Redesign my website into a unique full portfolio',
    designBrief: { goal: 'Make it unique' },
    sitePlan: { contentHierarchy: ['identity', 'proof', 'work'] },
    designSystem: {
      tokens: {
        background: '#ffffff',
        text: '#dddddd',
        muted: '#eeeeee',
        accent: '#f1f5f9',
      },
    },
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'projects'],
          site_sections: [{ id: 'proof', type: 'stats' }],
          design_system: {
            tokens: {
              background: '#ffffff',
              text: '#dddddd',
              muted: '#eeeeee',
              accent: '#f1f5f9',
            },
          },
          interactions: [
            { type: 'scrollReveal' },
            { type: 'cardTilt' },
            { type: 'cursorGlow' },
            { type: 'ambientParticles' },
          ],
        },
      },
      { type: 'customization.patch', patch: { cssBlocks: [{ id: 'layout', css: '@media (max-width: 760px) { .pf-section { display: block; } } .pf-header { color: inherit; }' }] } },
    ],
  });

  assert.equal(critique.status, 'needs_review');
  assert(critique.warnings.some((warning) => warning.includes('text contrast is low')));
  assert(critique.warnings.some((warning) => warning.includes('clear contact or conversion step')));
  assert(critique.warnings.some((warning) => warning.includes('several interaction effects')));

  const good = critiqueAgentBundle({
    prompt: 'Redesign my website into a unique full portfolio',
    designBrief: { goal: 'Make it unique' },
    sitePlan: { contentHierarchy: ['identity', 'proof', 'work', 'contact'] },
    designSystem: {
      tokens: {
        background: '#030712',
        text: '#f9fafb',
        muted: '#cbd5e1',
        accent: '#38bdf8',
      },
    },
    actions: [
      {
        type: 'settings.patch',
        patch: {
          section_order: ['header', 'projects', 'contact'],
          site_sections: [{ id: 'proof', type: 'stats' }],
          design_system: {
            tokens: {
              background: '#030712',
              text: '#f9fafb',
              muted: '#cbd5e1',
              accent: '#38bdf8',
            },
          },
          interactions: [{ type: 'scrollReveal' }],
        },
      },
      { type: 'customization.patch', patch: { cssBlocks: [{ id: 'layout', css: '@media (max-width: 760px) { .pf-section { display: block; } } .pf-header { color: inherit; }' }] } },
    ],
  });

  assert(good.notes.some((note) => note.includes('Text contrast passes')));
});
