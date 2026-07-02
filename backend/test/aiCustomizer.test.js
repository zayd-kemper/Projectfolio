const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAndMergeAiResponse,
  summarizeCustomizationChanges,
  validateCustomization,
  extractMarkedBlocks,
} = require('../utils/aiCustomizer');

test('merges CSS block patches without dropping existing unmarked CSS', () => {
  const currentCss = [
    '.pf-contact { opacity: 0.9; }',
    '/* pf-ai:block:card-style */',
    '.pf-project-card { background: blue; }',
    '/* pf-ai:end:card-style */',
  ].join('\n');
  const raw = JSON.stringify({
    cssBlocks: [{ id: 'card-style', css: '.pf-project-card { background: red; }' }],
    description: 'Updated cards.',
  });

  const { result, errors } = parseAndMergeAiResponse(raw, { css: currentCss });

  assert.deepEqual(errors, []);
  assert.match(result.css, /\.pf-contact/);
  assert.match(result.css, /background: red/);
  assert.doesNotMatch(result.css, /background: blue/);
  assert.deepEqual(extractMarkedBlocks(result.css).map((block) => block.id), ['card-style']);
});

test('merges theme and animation patches while allowing null to clear overrides', () => {
  const raw = JSON.stringify({
    themeOverridesPatch: {
      cardBackground: null,
      cardShadow: '0 10px 30px rgba(0,0,0,.2)',
      accentColor: '#7c3aed',
    },
    animationsPatch: { cardHover: 'lift' },
    description: 'Updated structured settings.',
  });

  const { result, errors } = parseAndMergeAiResponse(raw, {
    themeOverrides: { cardBackground: '#fff', headerTextColor: '#111' },
    animations: { cardEntrance: 'fadeUp', cardHover: 'none', pageBackground: 'none' },
  });

  assert.deepEqual(errors, []);
  assert.equal(result.themeOverrides.cardBackground, undefined);
  assert.equal(result.themeOverrides.headerTextColor, '#111');
  assert.equal(result.themeOverrides.cardShadow, '0 10px 30px rgba(0,0,0,.2)');
  assert.equal(result.animations.cardEntrance, 'fadeUp');
  assert.equal(result.animations.cardHover, 'lift');
});

test('legacy css/js responses become managed blocks instead of replacing existing code', () => {
  const raw = JSON.stringify({
    css: '.pf-skill-tag { color: red; }',
    js: '(function(){ var el=document.getElementById("pf-root"); if(!el)return; })();',
    description: 'Legacy shape.',
  });

  const { result, errors } = parseAndMergeAiResponse(raw, {
    css: '.pf-project-card { border: 1px solid red; }',
    js: '',
  });

  assert.deepEqual(errors, []);
  assert.match(result.css, /\.pf-project-card/);
  assert.match(result.css, /pf-ai:block:legacy-generated-css/);
  assert.match(result.js, /pf-ai:block:legacy-generated-js/);
});

test('validation catches runtime-breaking CSS and JS', () => {
  const validation = validateCustomization({
    themeOverrides: {},
    animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    css: 'body { color: red; } .pf-project-card { animation: floaty 1s; }',
    js: 'document.addEventListener("DOMContentLoaded", function(){}); if(document.getElementById("pf-canvas")) return;',
  });

  assert(validation.errors.some((error) => error.includes('DOMContentLoaded')));
  assert(validation.errors.some((error) => error.includes('#pf-canvas')));
  assert(validation.errors.some((error) => error.includes('@keyframes')));
  assert(validation.warnings.some((warning) => warning.includes('scoped to the public portfolio root')));
});

test('validation blocks fragile custom motion CSS in favor of native recipes', () => {
  const validation = validateCustomization({
    themeOverrides: {},
    animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    css: [
      '@keyframes drift { from { transform: translateY(0); } to { transform: translateY(20px); } }',
      '.pf-project-card { animation: drift 4s ease infinite; transition: all 2s ease; }',
    ].join('\n'),
    js: '',
  });

  assert(validation.errors.some((error) => error.includes('prefers-reduced-motion')));
  assert(validation.errors.some((error) => error.includes('too slow')));
  assert(validation.errors.some((error) => error.includes('Infinite CSS animations')));
  assert(validation.warnings.some((warning) => warning.includes('transition: all')));
});

test('validation allows short reduced-motion-safe custom animation CSS', () => {
  const validation = validateCustomization({
    themeOverrides: {},
    animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    css: [
      '@keyframes quickLift { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }',
      '.pf-feature-card { animation: quickLift 480ms ease both; }',
      '@media (prefers-reduced-motion: reduce) { .pf-feature-card { animation: none !important; } }',
    ].join('\n'),
    js: '',
  });

  assert.deepEqual(validation.errors, []);
});

test('validation blocks generated JS that mutates React-owned portfolio DOM', () => {
  const validation = validateCustomization({
    themeOverrides: {},
    animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    css: '',
    js: [
      '(function(){',
      '  var list = document.querySelector(".pf-projects");',
      '  if (!list) return;',
      '  list.innerHTML = "<div>replacement</div>";',
      '  list.removeChild(list.firstChild);',
      '})();',
    ].join('\n'),
  });

  assert(validation.errors.some((error) => error.includes('innerHTML')));
  assert(validation.errors.some((error) => error.includes('removeChild')));
  assert(validation.errors.some((error) => error.includes('React-rendered nodes')));
});

test('validation allows guarded body-level AI artifact effects', () => {
  const validation = validateCustomization({
    themeOverrides: {},
    animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    css: '',
    js: '(function(){ if(document.getElementById("pf-agent-glow")) return; var el=document.createElement("div"); el.id="pf-agent-glow"; el.setAttribute("data-pf-ai-artifact","true"); document.body.appendChild(el); })();',
  });

  assert.deepEqual(validation.errors, []);
});

test('summarizes changed AI customization surfaces for user feedback', () => {
  const summary = summarizeCustomizationChanges(
    {
      css: '.pf-project-card { color: red; }',
      js: '',
      themeOverrides: { cardBackground: '#fff' },
      animations: { cardEntrance: 'none', cardHover: 'none', pageBackground: 'none' },
    },
    {
      css: '.pf-project-card { color: blue; }',
      js: 'console.log("ready");',
      themeOverrides: { cardBackground: '#111', cardShadow: '0 10px 20px rgba(0,0,0,.2)' },
      animations: { cardEntrance: 'fadeUp', cardHover: 'none', pageBackground: 'none' },
      changedBlocks: { css: ['cards'], js: ['sparkles'], removed: ['old-effect'] },
    }
  );

  assert.equal(summary.cssChanged, true);
  assert.equal(summary.jsChanged, true);
  assert.deepEqual(summary.cssBlockIds, ['cards']);
  assert.deepEqual(summary.jsBlockIds, ['sparkles']);
  assert.deepEqual(summary.removedBlockIds, ['old-effect']);
  assert.deepEqual(summary.themeOverrideKeys.sort(), ['cardBackground', 'cardShadow']);
  assert.deepEqual(summary.animationKeys, ['cardEntrance']);
});
