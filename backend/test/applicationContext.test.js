const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/database');
const portfolioAiContext = require('../utils/portfolioAiContext');
const { buildApplicationContext } = require('../applicationHelper/context');

test('buildApplicationContext adapts the flat AI context into a profile and merges experiences', async () => {
  process.env.FRONTEND_URL = 'https://projectfolio.test';
  // buildPortfolioAiContext returns user fields at the TOP level with `name`
  // (not full_name) and no `profile` wrapper — the adapter must reshape it.
  portfolioAiContext.buildPortfolioAiContext = async (userId) => {
    assert.equal(userId, 'u1');
    return {
      id: 'u1',
      name: 'Jane Doe',
      first_name: 'Jane',
      username: 'jane',
      headline: 'ME student',
      bio: 'Builds rockets.',
      location: 'Austin, TX',
      website: 'https://janedoe.dev',
      github_url: 'https://github.com/janedoe',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      skills: ['CAD'],
      projects: [{ title: 'Rocket', technologies: ['C++'] }],
    };
  };
  db.query = async (sql, params) => {
    if (/FROM profile_experiences/.test(sql)) {
      assert.deepEqual(params, ['u1']);
      return {
        rows: [
          { id: 'x1', kind: 'employment', title: 'Intern', organization: 'Acme', highlights: ['Did things'], skills: [] },
          { id: 'x2', kind: 'education', title: 'BSc', organization: 'State U', highlights: [], skills: [] },
          { id: 'x3', kind: 'certification', title: 'EIT', organization: 'NCEES', highlights: [], skills: [] },
        ],
      };
    }
    if (/SELECT phone, contact_email, email FROM users/.test(sql)) {
      assert.deepEqual(params, ['u1']);
      return { rows: [{ phone: '512-555-0100', contact_email: 'jane@pro.example', email: 'jane@example.com' }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };

  const context = await buildApplicationContext('u1');

  assert.equal(context.profile.full_name, 'Jane Doe');
  assert.equal(context.profile.username, 'jane');
  assert.equal(context.profile.headline, 'ME student');
  assert.deepEqual(context.profile.skills, ['CAD']);
  assert.equal(context.profile.phone, '512-555-0100');
  assert.equal(context.profile.contact_email, 'jane@pro.example');
  assert.equal(context.profile.linkedin_url, 'https://linkedin.com/in/janedoe');
  assert.equal(context.projects.length, 1);
  assert.equal(context.experiences.employment[0].title, 'Intern');
  assert.equal(context.experiences.education[0].title, 'BSc');
  assert.equal(context.experiences.certification[0].title, 'EIT');
  assert.equal(context.portfolio_url, 'https://projectfolio.test/jane');
});
