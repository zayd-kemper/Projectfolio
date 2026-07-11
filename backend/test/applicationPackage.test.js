const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/database');
const browserPool = require('../utils/browserPool');
const safeFetch = require('../utils/safeFetch');
const { cloudinary } = require('../config/cloudinary');
const contextModule = require('../applicationHelper/context');
const coverLetterModule = require('../applicationHelper/coverLetter');
const helper = require('../applicationHelper');
const { assemblePackage } = require('../applicationHelper');
const { getPlatform } = require('../applicationHelper/platforms');

test('runApplicationGenerateJob renders, uploads, and marks the session ready', async () => {
  const session = {
    id: 's1', user_id: 'u1', platform: 'greenhouse', job_title: 'Design Engineer',
    company: 'Orbit', job_posting_url: 'https://jobs.example/1', notes: null, status: 'generating',
  };
  const updates = [];
  db.query = async (sql, params) => {
    if (/SELECT \* FROM application_sessions/.test(sql)) {
      assert.deepEqual(params, ['s1']);
      return { rows: [session] };
    }
    if (/UPDATE application_sessions/.test(sql)) {
      updates.push({ sql, params });
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  contextModule.buildApplicationContext = async (userId) => {
    assert.equal(userId, 'u1');
    return {
      profile: { username: 'jane', full_name: 'Jane Doe', skills: ['CAD'] },
      projects: [],
      experiences: { employment: [], education: [], certification: [] },
      portfolio_url: 'https://projectfolio.test/jane',
    };
  };
  safeFetch.safeFetchText = async () => ({ ok: true, text: '<p>We need a design engineer.</p>' });
  coverLetterModule.generateCoverLetter = async ({ jobText }) => {
    assert.match(jobText, /design engineer/);
    return {
      source: 'ai', model_id: 'stub:model', cover_letter: 'Dear team', skills_summary: 's',
      professional_summary: 'p', emphasis: [], keywords: [], experience_bullets: [],
    };
  };
  browserPool.withPage = async (operation) => {
    const page = {
      setContent: async () => {},
      pdf: async () => Buffer.from('%PDF-1.4 /Type /Page /Type /Page'),
    };
    return operation(page);
  };
  cloudinary.uploader.upload_stream = (options, callback) => {
    assert.equal(options.resource_type, 'raw');
    return { end: () => callback(null, { secure_url: 'https://res.cloudinary.test/app.pdf' }) };
  };

  const progress = [];
  const result = await helper.runApplicationGenerateJob(
    { userId: 'u1', sessionId: 's1' },
    { jobId: 'j1', updateProgress: async (value) => progress.push(value) }
  );

  assert.equal(result.session_id, 's1');
  assert.equal(result.package.version, 1);
  // Cloudinary blocks public PDF delivery, and resumes are personal data — the
  // package must point at the authenticated API download route instead.
  assert.equal(result.package.resume.pdf_url, '/api/applications/s1/resume');
  assert.equal(result.package.job.analyzed, true);
  const finalUpdate = updates.at(-1);
  assert.match(finalUpdate.sql, /status = 'ready'/);
  assert.ok(progress.length >= 3, 'expected progress updates');
});

const fixtureContext = () => ({
  profile: {
    full_name: 'Jane Doe',
    contact_email: 'jane@example.com',
    phone: '512-555-0100',
    location: 'Austin, TX',
    linkedin_url: 'https://linkedin.com/in/janedoe',
    github_url: 'https://github.com/janedoe',
    website: 'https://janedoe.dev',
    skills: ['CAD'],
  },
  projects: [],
  experiences: { employment: [], education: [], certification: [] },
  portfolio_url: 'https://projectfolio.test/jane',
});

test('assemblePackage produces the versioned v1 contract', () => {
  const pkg = assemblePackage({
    context: fixtureContext(),
    platform: getPlatform('greenhouse'),
    session: { id: 's1', job_title: 'Design Engineer', company: 'Orbit', job_posting_url: 'https://jobs.example/1' },
    tailoring: {
      source: 'ai',
      model_id: 'stub:model',
      cover_letter: 'Dear team…',
      skills_summary: 'CAD across projects',
      professional_summary: 'ME student',
      emphasis: ['Rocket'],
      keywords: ['cad'],
      experience_bullets: ['Did a thing'],
    },
    resume: { pdf_url: 'https://res.cloudinary.test/resume.pdf', filename: 'jane-greenhouse-resume.pdf', pages: 2, plain_text: 'JANE DOE' },
    jobAnalyzed: true,
  });

  assert.equal(pkg.version, 1);
  assert.ok(pkg.generated_at);
  assert.equal(pkg.platform.slug, 'greenhouse');
  assert.equal(pkg.platform.coverLetter.maxWords, 400);
  assert.equal(pkg.job.title, 'Design Engineer');
  assert.equal(pkg.job.analyzed, true);
  assert.deepEqual(pkg.job.keywords, ['cad']);
  assert.equal(pkg.candidate.full_name, 'Jane Doe');
  assert.equal(pkg.candidate.links.portfolio, 'https://projectfolio.test/jane');
  assert.equal(pkg.resume.pdf_url, 'https://res.cloudinary.test/resume.pdf');
  assert.equal(pkg.cover_letter.text, 'Dear team…');
  assert.equal(pkg.cover_letter.source, 'ai');
  assert.ok(pkg.cover_letter.word_count > 0);
  assert.equal(pkg.snippets.skills_summary, 'CAD across projects');
  assert.deepEqual(pkg.snippets.experience_bullets, ['Did a thing']);
  assert.equal(pkg.meta.session_id, 's1');
  assert.equal(pkg.meta.model_id, 'stub:model');
});
