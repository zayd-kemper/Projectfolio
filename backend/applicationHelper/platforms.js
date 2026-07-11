// Platform adapters for the Application Helper. Each platform is pure configuration:
// capability flags plus resume/cover-letter constraints the engine honors when it
// generates an application package. Adding a platform means adding one entry here —
// the engine, routes, and UI all read this module. Slugs are stored in
// application_sessions.platform, so never repurpose an existing slug.

const PLATFORMS = [
  {
    slug: 'generic',
    name: 'Generic',
    description: 'Works with any job board, email application, or company careers page.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 400, format: 'plain' },
    tips: [
      'Attach the PDF resume; paste the snippets into free-text fields.',
      'Include your portfolio URL anywhere a website or link field appears.',
    ],
  },
  {
    slug: 'linkedin',
    name: 'LinkedIn',
    description: 'Easy Apply postings and recruiter messages on LinkedIn.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 200, format: 'plain' },
    tips: [
      'Easy Apply rarely has a cover-letter field — use the short message as your note to the recruiter.',
      'Add your portfolio URL to the Featured section of your profile as well.',
    ],
  },
  {
    slug: 'indeed',
    name: 'Indeed',
    description: 'Applications submitted through Indeed profiles or quick apply.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: false },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 300, format: 'plain' },
    tips: [
      'Indeed parses resumes into its own format — keep the single-column layout.',
      'There is no dedicated portfolio field; put the URL in your resume header and cover letter.',
    ],
  },
  {
    slug: 'greenhouse',
    name: 'Greenhouse',
    description: 'Company career pages powered by Greenhouse ATS.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 400, format: 'plain' },
    tips: [
      'Greenhouse usually has a Website/Portfolio field — paste your portfolio URL there.',
      'Cover letters can be uploaded or pasted; the plain-text version pastes cleanly.',
    ],
  },
  {
    slug: 'lever',
    name: 'Lever',
    description: 'Company career pages powered by Lever ATS.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 350, format: 'plain' },
    tips: [
      'Lever has a dedicated "Additional information" box — the skills summary fits well there.',
      'Use the Links section for your portfolio, GitHub, and LinkedIn URLs.',
    ],
  },
  {
    slug: 'workday',
    name: 'Workday',
    description: 'Enterprise career portals running on Workday.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 400, format: 'plain' },
    tips: [
      'Workday parses resumes to prefill work history — keep the single-column layout so parsing stays accurate.',
      'Expect to re-enter employment history manually; the experience bullets snippet saves time.',
    ],
  },
];

const PLATFORM_SLUGS = PLATFORMS.map((platform) => platform.slug);

const getPlatform = (slug) =>
  PLATFORMS.find((platform) => platform.slug === slug) || PLATFORMS[0];

// Asserts a platform entry has every field the engine depends on, so a malformed
// entry fails in CI instead of at generation time. Returns a list of problems.
const validatePlatformConfig = (platform) => {
  const problems = [];
  const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

  if (!isNonEmptyString(platform?.slug) || !/^[a-z0-9-]{1,40}$/.test(platform.slug)) {
    problems.push('slug must be a lowercase kebab-case string (max 40 chars)');
  }
  if (!isNonEmptyString(platform?.name)) problems.push('name is required');
  if (!isNonEmptyString(platform?.description)) problems.push('description is required');

  const caps = platform?.capabilities;
  for (const flag of ['supportsResume', 'supportsCoverLetter', 'supportsPortfolio']) {
    if (typeof caps?.[flag] !== 'boolean') problems.push(`capabilities.${flag} must be a boolean`);
  }

  const resume = platform?.resume;
  if (!Array.isArray(resume?.acceptedFormats) || resume.acceptedFormats.length === 0) {
    problems.push('resume.acceptedFormats must be a non-empty array');
  }
  if (!Number.isInteger(resume?.maxPages) || resume.maxPages < 1 || resume.maxPages > 10) {
    problems.push('resume.maxPages must be an integer between 1 and 10');
  }

  const coverLetter = platform?.coverLetter;
  if (!Number.isInteger(coverLetter?.maxWords) || coverLetter.maxWords < 50 || coverLetter.maxWords > 2000) {
    problems.push('coverLetter.maxWords must be an integer between 50 and 2000');
  }
  if (!['plain', 'pdf'].includes(coverLetter?.format)) {
    problems.push('coverLetter.format must be "plain" or "pdf"');
  }

  if (!Array.isArray(platform?.tips) || platform.tips.some((tip) => !isNonEmptyString(tip))) {
    problems.push('tips must be an array of non-empty strings');
  }

  return problems;
};

module.exports = { PLATFORMS, PLATFORM_SLUGS, getPlatform, validatePlatformConfig };
