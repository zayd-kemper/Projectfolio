const test = require('node:test');
const assert = require('node:assert/strict');
const { ADVISOR_CATALOG, matchCatalogEntries } = require('../advisor/catalog');
const { DISCIPLINES } = require('../advisor/analyzer');

const VALID_KINDS = ['project', 'skill'];
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];

test('the curated catalog covers all six disciplines with well-formed entries', () => {
  const ids = ADVISOR_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'catalog ids must be unique');

  for (const { id } of DISCIPLINES) {
    const entries = ADVISOR_CATALOG.filter((entry) => entry.discipline === id);
    assert.ok(entries.length >= 5, `at least 5 entries for ${id}`);
    assert.ok(entries.some((entry) => entry.kind === 'project'), `a project entry for ${id}`);
    assert.ok(entries.some((entry) => entry.kind === 'skill'), `a skill entry for ${id}`);
  }

  for (const entry of ADVISOR_CATALOG) {
    assert.ok(entry.id && entry.title && entry.description, `entry ${entry.id} has id/title/description`);
    assert.ok(VALID_KINDS.includes(entry.kind), `entry ${entry.id} kind`);
    assert.ok(VALID_LEVELS.includes(entry.level), `entry ${entry.id} level`);
    assert.ok(Array.isArray(entry.technologies), `entry ${entry.id} technologies`);
    assert.ok(Array.isArray(entry.outcomes) && entry.outcomes.length > 0, `entry ${entry.id} outcomes`);
    assert.ok(Number.isFinite(entry.estimated_weeks) && entry.estimated_weeks > 0, `entry ${entry.id} estimated_weeks`);
  }
});

const roboticsAnalysis = () => ({
  primary_discipline: 'robotics',
  estimated_level: 'intermediate',
  demonstrated_skills: ['ros', 'python', 'c++'],
  disciplines: [
    { id: 'robotics', label: 'Robotics & Autonomous Systems', score: 10, confidence: 'high' },
    { id: 'electrical', label: 'Electrical Engineering', score: 2, confidence: 'low' },
  ],
});

test('matchCatalogEntries picks a curated 1-2 projects + 1 skill from the primary discipline', () => {
  const picks = matchCatalogEntries({
    analysis: roboticsAnalysis(),
    goals: { objective: 'projects', growth: 'horizontal' },
  });

  assert.ok(picks.length >= 2 && picks.length <= 3, `expected 2-3 picks, got ${picks.length}`);
  assert.ok(picks.every((pick) => pick.source === 'curated'));
  assert.ok(picks.every((pick) => pick.discipline === 'robotics'));
  assert.ok(picks.every((pick) => pick.match_reason));

  const projects = picks.filter((pick) => pick.kind === 'project');
  assert.ok(projects.length >= 1 && projects.length <= 2, 'expected 1-2 curated projects');
  assert.equal(picks.filter((pick) => pick.kind === 'skill').length, 1, 'expected exactly 1 curated skill');
});

test('matchCatalogEntries targets current level for horizontal growth and one level up for vertical', () => {
  const horizontal = matchCatalogEntries({
    analysis: roboticsAnalysis(),
    goals: { objective: 'projects', growth: 'horizontal' },
  });
  assert.ok(
    horizontal.filter((pick) => pick.kind === 'project').every((pick) => pick.level === 'intermediate'),
    'horizontal growth should pick projects at the current (intermediate) level'
  );

  const vertical = matchCatalogEntries({
    analysis: roboticsAnalysis(),
    goals: { objective: 'projects', growth: 'vertical' },
  });
  assert.ok(
    vertical.filter((pick) => pick.kind === 'project').every((pick) => pick.level === 'advanced'),
    'vertical growth should pick projects one level above'
  );
});

test('matchCatalogEntries caps the curated share at the requested limit', () => {
  const capped = matchCatalogEntries({
    analysis: roboticsAnalysis(),
    goals: { objective: 'skills', growth: 'horizontal' },
    limit: 2,
  });
  assert.ok(capped.length <= 2, 'limit must cap the curated picks');
  assert.ok(capped.some((pick) => pick.kind === 'skill'), 'a skill pick survives the cap');

  const unknownDiscipline = matchCatalogEntries({
    analysis: { primary_discipline: null, estimated_level: 'beginner', demonstrated_skills: [], disciplines: [] },
    goals: { objective: 'projects', growth: 'horizontal' },
  });
  assert.deepEqual(unknownDiscipline, [], 'no curated picks without a recognized discipline');
});
