const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDerivedInsights,
  buildProjectSnapshot,
  compactText,
  extractBlockPlainText,
} = require('../utils/portfolioAiContext');

test('extractBlockPlainText captures evidence across rich block types', () => {
  assert.equal(extractBlockPlainText({ type: 'heading', content: { text: 'Autonomous Navigation' } }), 'Autonomous Navigation');
  assert.match(
    extractBlockPlainText({ type: 'metrics', content: { items: [{ value: '42', unit: '%', label: 'latency reduction' }] } }),
    /42% - latency reduction/
  );
  assert.match(
    extractBlockPlainText({ type: 'timeline', content: { items: [{ date: '2025', title: 'Prototype', description: 'Field-tested rover' }] } }),
    /Field-tested rover/
  );
  assert.equal(compactText('<p>Hello&nbsp;<strong>world</strong></p>'), 'Hello world');
});

test('buildProjectSnapshot scores evidence and preserves public/private status', () => {
  const project = buildProjectSnapshot({
    id: 'project-1',
    title: 'Mars Rover Controls',
    slug: 'mars-rover-controls',
    status: 'published',
    project_type: 'Robotics',
    technologies: ['ROS', 'Python'],
    collaborators: ['Avery'],
    tagline: 'Closed-loop rover controls',
    description: 'A rover controller with telemetry and simulation.',
    github_url: 'https://github.com/example/rover',
    live_url: null,
    cover_image_url: 'https://example.com/cover.png',
    view_count: 20,
    is_featured: true,
    blocks: [
      { type: 'text', content: { html: '<p>Reduced steering error by 18 percent in simulation.</p>' } },
      { type: 'code', content: { language: 'Python', caption: 'PID controller tuning' } },
    ],
  });

  assert.equal(project.status, 'published');
  assert.equal(project.type, 'Robotics');
  assert.deepEqual(project.technologies, ['ROS', 'Python']);
  assert.match(project.block_content, /Reduced steering error/);
  assert.ok(project.evidence_score >= 8);
});

test('buildDerivedInsights surfaces missing profile proof and strongest projects', () => {
  const projects = [
    { title: 'Thin Project', status: 'draft', technologies: [], evidence_score: 0 },
    { title: 'Strong Project', status: 'published', technologies: ['Python'], evidence_score: 9, has_github: true, has_live_demo: true },
  ];
  const insights = buildDerivedInsights({ name: 'Student', skills: [] }, projects);

  assert.equal(insights.project_count, 2);
  assert.equal(insights.published_project_count, 1);
  assert.equal(insights.strongest_projects[0].title, 'Strong Project');
  assert(insights.profile_gaps.some((gap) => /headline/i.test(gap)));
  assert(insights.profile_gaps.some((gap) => /No profile skills/i.test(gap)));
});
