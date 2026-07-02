const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('public portfolio and project pages share the same native motion runtime', () => {
  const portfolio = read('frontend/src/pages/PublicPortfolioPage.jsx');
  const project = read('frontend/src/pages/PublicProjectPage.jsx');
  const motion = read('frontend/src/utils/portfolioMotion.js');

  assert.match(portfolio, /usePortfolioMotion/);
  assert.match(project, /usePortfolioMotion/);
  assert.doesNotMatch(portfolio, /function useNativeAnimations|function useNativeInteractions/);
  assert.doesNotMatch(project, /function useProjectInteractions/);

  for (const recipe of ['scrollReveal', 'microInteractions', 'cardTilt', 'navAutoHide', 'cursorGlow', 'ambientParticles', 'gradientMesh', 'pageTransition']) {
    assert.match(motion, new RegExp(recipe));
  }

  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
  assert.match(motion, /cleanupMotionDom/);
  assert.match(motion, /MutationObserver/);
  assert.match(motion, /visibilitychange/);
});
