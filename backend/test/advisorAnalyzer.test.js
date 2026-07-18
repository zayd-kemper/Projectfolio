const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePortfolio } = require('../advisor/analyzer');

// Fixture contexts mirror the buildPortfolioAiContext output shape
// (see test/portfolioAiContext.test.js).
const roboticsContext = () => ({
  name: 'Ada Lovelace',
  first_name: 'Ada',
  headline: 'Robotics undergrad building autonomous rovers',
  bio: 'I work on SLAM, ROS 2 navigation stacks, and embedded control for mobile robots.',
  skills: ['ROS', 'Python', 'C++', 'PID control'],
  projects: [
    { title: 'Mars Rover Controls', status: 'published', type: 'Robotics', technologies: ['ROS', 'Python', 'Arduino'], evidence_score: 9 },
    { title: 'Quadcopter Path Planner', status: 'published', type: 'Robotics', technologies: ['ROS', 'C++', 'Gazebo'], evidence_score: 7 },
  ],
  derived: {
    project_count: 2,
    published_project_count: 2,
    top_technologies: [{ name: 'ros', count: 2 }, { name: 'python', count: 1 }, { name: 'c++', count: 1 }],
    project_types: [{ name: 'robotics', count: 2 }],
    profile_gaps: [],
    strongest_projects: [{ title: 'Mars Rover Controls', evidence_score: 9, status: 'published' }],
  },
});

test('analyzePortfolio identifies robotics as the primary discipline from portfolio evidence', () => {
  const analysis = analyzePortfolio(roboticsContext());
  assert.equal(analysis.primary_discipline, 'robotics');
  const top = analysis.disciplines[0];
  assert.equal(top.id, 'robotics');
  assert.ok(top.score > 0);
  assert.ok(['high', 'medium', 'low'].includes(top.confidence));
});

test('analyzePortfolio estimates level from project depth, evidence, and tech breadth', () => {
  const sparse = analyzePortfolio({
    name: 'New Student',
    skills: [],
    projects: [{ title: 'Hello World Site', status: 'draft', technologies: ['HTML'], evidence_score: 1 }],
    derived: {
      project_count: 1,
      published_project_count: 0,
      top_technologies: [{ name: 'html', count: 1 }],
      project_types: [],
      profile_gaps: ['No projects are currently published on the public portfolio.'],
    },
  });
  assert.equal(sparse.estimated_level, 'beginner');

  const deep = roboticsContext();
  deep.projects = [
    ...deep.projects,
    { title: 'Warehouse AMR Fleet', status: 'published', type: 'Robotics', technologies: ['ROS', 'Docker', 'React', 'Postgres'], evidence_score: 10 },
    { title: 'Lidar SLAM Bench', status: 'published', type: 'Robotics', technologies: ['C++', 'Lidar', 'Gazebo'], evidence_score: 8 },
  ];
  deep.derived = {
    ...deep.derived,
    project_count: 4,
    published_project_count: 4,
    top_technologies: [
      { name: 'ros', count: 3 }, { name: 'python', count: 2 }, { name: 'c++', count: 2 },
      { name: 'gazebo', count: 2 }, { name: 'docker', count: 1 }, { name: 'react', count: 1 },
      { name: 'postgres', count: 1 }, { name: 'lidar', count: 1 }, { name: 'arduino', count: 1 },
    ],
  };
  assert.equal(analyzePortfolio(deep).estimated_level, 'advanced');
});

test('analyzePortfolio surfaces discipline skill gaps and claimed-but-unproven skills', () => {
  const analysis = analyzePortfolio(roboticsContext());
  const gapNames = analysis.skill_gaps.map((gap) => gap.name.toLowerCase());

  // SLAM is core to robotics but appears in neither skills nor project technologies.
  assert.ok(gapNames.some((name) => name.includes('slam')));
  // ROS is demonstrated in projects, so it must not be reported as a gap.
  assert.ok(!gapNames.some((name) => /(^|\W)ros($|\W)/.test(name)));
  // "PID control" is claimed in profile skills but backed by no project technology.
  assert.ok(analysis.skill_gaps.some((gap) => gap.name.toLowerCase().includes('pid')));
  assert.ok(analysis.skill_gaps.every((gap) => gap.name && gap.reason));
  assert.ok(analysis.demonstrated_skills.includes('ros'));
});

test('analyzePortfolio infers each of the six disciplines and knows their expected skills', () => {
  const miniContext = (headline, technologies) => ({
    headline,
    skills: [],
    projects: [{ title: 'Project', status: 'published', technologies, evidence_score: 5 }],
    derived: {
      project_count: 1,
      published_project_count: 1,
      top_technologies: technologies.map((name) => ({ name: name.toLowerCase(), count: 1 })),
      project_types: [],
      profile_gaps: [],
    },
  });

  const cases = [
    ['software', miniContext('Full-stack web developer', ['React', 'Node', 'Postgres'])],
    ['data-ml', miniContext('Aspiring data scientist', ['PyTorch', 'Pandas', 'NumPy'])],
    ['electrical', miniContext('Hardware tinkerer', ['PCB', 'STM32', 'KiCad'])],
    ['mechanical', miniContext('Mechanical design student', ['SolidWorks', 'FEA', 'CNC Machining'])],
    ['robotics', miniContext('Robot builder', ['ROS', 'SLAM', 'Gazebo'])],
    ['bio-chem', miniContext('Bioengineering undergrad', ['CRISPR', 'PCR', 'Bioinformatics'])],
  ];

  for (const [expectedDiscipline, context] of cases) {
    const analysis = analyzePortfolio(context);
    assert.equal(analysis.primary_discipline, expectedDiscipline, `expected ${expectedDiscipline}`);
    // Every discipline must define expected skills so gaps are never silently empty.
    assert.ok(analysis.skill_gaps.length > 0, `expected skill gaps for ${expectedDiscipline}`);
  }
});

test('analyzePortfolio reports interests, evidence signals, and safe defaults for an empty portfolio', () => {
  const empty = analyzePortfolio({});
  assert.equal(empty.primary_discipline, null);
  assert.equal(empty.estimated_level, 'beginner');
  assert.deepEqual(empty.skill_gaps, []);
  assert.ok(Array.isArray(empty.interests));
  assert.ok(Array.isArray(empty.signals));

  const analysis = analyzePortfolio(roboticsContext());
  // The bio mentions embedded control, so electrical shows up as a secondary interest.
  assert.ok(analysis.interests.length > 0);
  assert.ok(analysis.signals.some((signal) => /published/i.test(signal)));
});
