const test = require('node:test');
const assert = require('node:assert/strict');

const aiModels = require('../utils/aiModels');
const { buildCoverLetterFallback, generateCoverLetter } = require('../applicationHelper/coverLetter');
const { getPlatform } = require('../applicationHelper/platforms');

const fixtureContext = () => ({
  profile: {
    full_name: 'Jane Doe',
    headline: 'Mechanical Engineering Student',
    skills: ['SolidWorks', 'Python', 'MATLAB', 'Ansys', 'CNC'],
  },
  projects: [
    { title: 'Liquid Rocket Engine', technologies: ['CAD'] },
    { title: 'Autonomous Rover', technologies: ['Python'] },
  ],
  experiences: {
    employment: [{ title: 'Manufacturing Intern', organization: 'Acme Robotics', is_current: true, highlights: [], skills: [] }],
    education: [{ title: 'BSc Mechanical Engineering', organization: 'State University', highlights: [], skills: [] }],
    certification: [],
  },
  portfolio_url: 'https://projectfolio.test/jane',
});

test('generateCoverLetter uses the AI model and returns parsed, clamped output', async () => {
  aiModels.chooseModelForIntegration = (profileId) => {
    assert.equal(profileId, 'application-helper');
    return { id: 'stub:model' };
  };
  let capturedMessages = null;
  aiModels.callAiModel = async ({ modelId, messages }) => {
    assert.equal(modelId, 'stub:model');
    capturedMessages = messages;
    return {
      content: JSON.stringify({
        cover_letter: 'Dear Team, I am excited to apply. Sincerely, Jane Doe',
        skills_summary: 'CAD and simulation across rocket projects',
        professional_summary: 'ME student focused on propulsion',
        emphasis: ['Liquid Rocket Engine'],
        keywords: ['propulsion', 'CAD'],
        experience_bullets: ['Cut cycle time 40%'],
      }),
    };
  };

  const result = await generateCoverLetter({
    context: fixtureContext(),
    jobText: 'We need a design engineer with CAD experience.',
    session: { job_title: 'Design Engineer', company: 'Orbit Dynamics' },
    platform: getPlatform('linkedin'),
  });

  assert.equal(result.source, 'ai');
  assert.equal(result.model_id, 'stub:model');
  assert.match(result.cover_letter, /Jane Doe/);
  assert.deepEqual(result.emphasis, ['Liquid Rocket Engine']);
  const prompt = capturedMessages.map((m) => m.content).join('\n');
  assert.match(prompt, /Design Engineer/);
  assert.match(prompt, /CAD experience/);
});

test('generateCoverLetter replaces name placeholders the model leaves in the letter', async () => {
  aiModels.chooseModelForIntegration = () => ({ id: 'stub:model' });
  aiModels.callAiModel = async () => ({
    content: JSON.stringify({
      cover_letter: 'Dear team, I am excited to apply.\n\nSincerely,\n[Your Name]',
      skills_summary: 's', professional_summary: 'p', emphasis: [], keywords: [], experience_bullets: [],
    }),
  });

  const result = await generateCoverLetter({
    context: fixtureContext(),
    jobText: null,
    session: { job_title: 'Design Engineer', company: 'Orbit Dynamics' },
    platform: getPlatform('generic'),
  });

  assert.doesNotMatch(result.cover_letter, /\[Your Name\]/);
  assert.match(result.cover_letter, /Jane Doe/);
});

test('generateCoverLetter falls back to the template when the model output is unparseable', async () => {
  aiModels.chooseModelForIntegration = () => ({ id: 'stub:model' });
  aiModels.callAiModel = async () => ({ content: '```json\n{"cover_letter": "cut off' });

  const result = await generateCoverLetter({
    context: fixtureContext(),
    jobText: null,
    session: { job_title: 'Design Engineer', company: 'Orbit Dynamics' },
    platform: getPlatform('generic'),
  });

  assert.equal(result.source, 'template');
  assert.match(result.cover_letter, /Orbit Dynamics/);
  assert.ok(result.fallback_reason, 'expected a fallback reason');
});

test('aiModels registers an application-helper integration profile', () => {
  const profile = aiModels.INTEGRATION_MODEL_PROFILES['application-helper'];
  assert.ok(profile, 'application-helper profile missing');
  assert.equal(profile.id, 'application-helper');
  assert.deepEqual(profile.requiredCapabilities, ['chat', 'json']);
  assert.ok(Array.isArray(profile.preferredModelIds) && profile.preferredModelIds.length > 0);
});

test('generateCoverLetter carries project_summary from the model, defaulting to the built one when omitted', async () => {
  aiModels.chooseModelForIntegration = () => ({ id: 'stub:model' });
  aiModels.callAiModel = async ({ messages }) => {
    assert.match(messages[0].content, /project_summary/);
    return {
      content: JSON.stringify({
        cover_letter: 'Dear team, hello. Sincerely, Jane Doe',
        skills_summary: 's', professional_summary: 'p',
        emphasis: [], keywords: [], experience_bullets: [],
      }),
    };
  };

  const result = await generateCoverLetter({
    context: fixtureContext(),
    jobText: null,
    session: { job_title: 'Design Engineer', company: 'Orbit Dynamics' },
    platform: getPlatform('generic'),
  });

  assert.equal(result.source, 'ai');
  assert.match(result.project_summary, /Liquid Rocket Engine/);
});

test('tailoring includes a project summary built from project content', () => {
  const session = { job_title: 'Design Engineer', company: 'Orbit Dynamics' };
  const context = fixtureContext();
  context.projects[0].tagline = 'Regeneratively cooled student engine';
  context.projects[0].description = 'Designed and hot-fired a LOX/kerosene engine with printed injectors.';

  const result = buildCoverLetterFallback(context, session, getPlatform('generic'));

  assert.ok(result.project_summary, 'expected a project_summary');
  assert.match(result.project_summary, /Liquid Rocket Engine/);
  assert.match(result.project_summary, /hot-fired|Regeneratively/i);
  assert.doesNotMatch(result.project_summary, /undefined/);
});

test('buildCoverLetterFallback writes a template letter within the platform word limit', () => {
  const session = { job_title: 'Design Engineer', company: 'Orbit Dynamics' };
  const result = buildCoverLetterFallback(fixtureContext(), session, getPlatform('linkedin'));

  assert.equal(result.source, 'template');
  assert.match(result.cover_letter, /Design Engineer/);
  assert.match(result.cover_letter, /Orbit Dynamics/);
  assert.match(result.cover_letter, /Jane Doe/);
  const words = result.cover_letter.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 200, `expected <= 200 words for linkedin, got ${words}`);
  assert.ok(result.skills_summary.length > 0);
  assert.doesNotMatch(result.cover_letter, /undefined/);
});
