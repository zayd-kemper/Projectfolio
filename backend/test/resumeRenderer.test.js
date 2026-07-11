const test = require('node:test');
const assert = require('node:assert/strict');

const { buildResumeHTML, buildPlainTextResume } = require('../applicationHelper/resumeRenderer');
const { getPlatform } = require('../applicationHelper/platforms');

const fixtureContext = () => ({
  profile: {
    username: 'jane',
    full_name: 'Jane Doe',
    headline: 'Mechanical Engineering Student',
    location: 'Austin, TX',
    contact_email: 'jane@example.com',
    phone: '512-555-0100',
    linkedin_url: 'https://linkedin.com/in/janedoe',
    github_url: 'https://github.com/janedoe',
    skills: ['SolidWorks', 'Python', 'MATLAB'],
  },
  projects: [
    {
      title: 'Liquid Rocket Engine',
      tagline: 'Student-built regeneratively cooled engine',
      technologies: ['CAD', 'Ansys'],
      start_date: '2025-01-01',
      end_date: '2025-06-01',
    },
  ],
  experiences: {
    employment: [{
      id: 'x1', kind: 'employment', title: 'Manufacturing Intern', organization: 'Acme Robotics',
      location: 'Austin, TX', start_date: '2025-06-01', end_date: null, is_current: true,
      description: 'Automated fixture design.', highlights: ['Cut cycle time 40%', 'Designed 12 fixtures'], skills: ['CNC'],
    }],
    education: [{
      id: 'x2', kind: 'education', title: 'BSc Mechanical Engineering', organization: 'State University',
      field_of_study: 'Mechanical Engineering', grade: '3.8 GPA', start_date: '2023-08-01', end_date: null,
      is_current: true, highlights: [], skills: [],
    }],
    certification: [{
      id: 'x3', kind: 'certification', title: 'SolidWorks CSWA', organization: 'Dassault',
      credential_id: 'CSWA-123', highlights: [], skills: [],
    }],
  },
  portfolio_url: 'https://projectfolio.test/jane',
});

test('buildResumeHTML renders a single-column printable document with all sections', () => {
  const html = buildResumeHTML({ context: fixtureContext(), platform: getPlatform('generic'), tailoring: null });
  assert.match(html, /Jane Doe/);
  assert.match(html, /Manufacturing Intern/);
  assert.match(html, /Cut cycle time 40%/);
  assert.match(html, /BSc Mechanical Engineering/);
  assert.match(html, /SolidWorks CSWA/);
  assert.match(html, /Liquid Rocket Engine/);
  assert.match(html, /projectfolio\.test\/jane/);
  assert.match(html, /@page/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /<script/i);
});

test('buildPlainTextResume produces a paste-ready text version with all sections', () => {
  const text = buildPlainTextResume({ context: fixtureContext(), platform: getPlatform('generic'), tailoring: null });
  assert.match(text, /JANE DOE/i);
  assert.match(text, /Manufacturing Intern/);
  assert.match(text, /- Cut cycle time 40%/);
  assert.match(text, /BSc Mechanical Engineering/);
  assert.match(text, /https:\/\/projectfolio\.test\/jane/);
  assert.doesNotMatch(text, /</);
  assert.doesNotMatch(text, /undefined/);
});

test('renders when dates are Date objects (as returned by the projects query)', () => {
  const context = fixtureContext();
  context.projects[0].start_date = new Date('2025-01-15T00:00:00Z');
  context.projects[0].end_date = new Date('2025-06-15T00:00:00Z');
  const html = buildResumeHTML({ context, platform: getPlatform('generic'), tailoring: null });
  assert.match(html, /2025-01/);
  assert.doesNotMatch(html, /GMT|Standard Time/);
});

test('condensed mode trims bullets and projects for tighter page budgets', () => {
  const context = fixtureContext();
  context.projects = Array.from({ length: 8 }, (_, i) => ({
    title: `Project ${i + 1}`, technologies: ['X'],
  }));
  context.experiences.employment[0].highlights = Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`);

  const full = buildResumeHTML({ context, platform: getPlatform('generic'), tailoring: null });
  const condensed = buildResumeHTML({ context, platform: getPlatform('generic'), tailoring: null, condensed: true });

  assert.ok(condensed.length < full.length, 'condensed output should be smaller');
  assert.match(full, /Project 8/);
  assert.doesNotMatch(condensed, /Project 8/);
  assert.doesNotMatch(condensed, /Bullet 10/);
  assert.match(condensed, /Bullet 1\b/);
});
