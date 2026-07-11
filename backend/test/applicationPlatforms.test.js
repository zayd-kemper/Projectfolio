const test = require('node:test');
const assert = require('node:assert');

const {
  PLATFORMS,
  getPlatform,
  validatePlatformConfig,
} = require('../applicationHelper/platforms');

test('every platform entry passes validatePlatformConfig and covers the v1 set', () => {
  const slugs = PLATFORMS.map((platform) => platform.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length, 'slugs must be unique');
  for (const slug of ['generic', 'linkedin', 'indeed', 'greenhouse', 'lever', 'workday']) {
    assert.ok(slugs.includes(slug), `missing platform: ${slug}`);
  }
  for (const platform of PLATFORMS) {
    const problems = validatePlatformConfig(platform);
    assert.deepStrictEqual(problems, [], `platform "${platform.slug}" invalid: ${problems.join('; ')}`);
  }
});

test('validatePlatformConfig reports missing capability flags and bad constraints', () => {
  const problems = validatePlatformConfig({
    slug: 'Bad Slug',
    name: '',
    description: 'x',
    capabilities: { supportsResume: true },
    resume: { acceptedFormats: [], maxPages: 0 },
    coverLetter: { maxWords: 10, format: 'docx' },
    tips: 'not-an-array',
  });
  assert.ok(problems.length >= 5, `expected several problems, got: ${problems.join('; ')}`);
});

test('getPlatform falls back to generic for unknown slugs', () => {
  assert.strictEqual(getPlatform('bogus-platform').slug, 'generic');
  assert.strictEqual(getPlatform(undefined).slug, 'generic');
  assert.strictEqual(getPlatform('linkedin').slug, 'linkedin');
});
