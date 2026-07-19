// Cover-letter generation for the Application Helper. The AI path drafts a letter
// tailored to the job posting; the template fallback keeps the feature working when
// no model is available or the model response can't be parsed.

const clampWords = (text, maxWords) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
};

// Descriptive overview of the applicant's projects, stitched from real project
// content (tagline, description, technologies). Feeds the "Project Summary"
// section of the package and the deterministic tailoring fallback.
const buildProjectSummary = (context, maxProjects = 3) => {
  const projects = (context.projects || []).slice(0, maxProjects);
  if (projects.length === 0) return '';
  const sentences = projects.map((project) => {
    const detail = String(project.description || project.tagline || '').trim().replace(/\s+/g, ' ');
    const clipped = detail.length > 220 ? `${detail.slice(0, 220).trim()}…` : detail;
    const tech = (project.technologies || []).slice(0, 5).join(', ');
    const parts = [`${project.title}${clipped ? ` — ${clipped.replace(/\.$/, '')}` : ''}`];
    if (tech) parts.push(`(${tech})`);
    return `${parts.join(' ')}.`;
  });
  return sentences.join(' ');
};

// Deterministic letter stitched from the applicant's strongest signals. Mirrors the
// role buildOpportunityFinderFallbackParsed plays for the opportunity finder: the
// engine never hard-fails just because the AI path did.
const buildCoverLetterFallback = (context, session, platform) => {
  const profile = context.profile || {};
  const name = profile.full_name || 'The applicant';
  const role = session.job_title || 'the open role';
  const company = session.company || 'your team';
  const skills = (profile.skills || []).slice(0, 5);
  const topProjects = (context.projects || []).slice(0, 2).map((project) => project.title).filter(Boolean);
  const currentJob = (context.experiences?.employment || []).find((entry) => entry.is_current) ||
    (context.experiences?.employment || [])[0];
  const education = (context.experiences?.education || [])[0];

  const paragraphs = [];
  paragraphs.push(`Dear Hiring Team,`);
  paragraphs.push(
    `I'm writing to apply for the ${role} position at ${company}. ` +
    `${profile.headline ? `As a ${profile.headline.toLowerCase().replace(/\.$/, '')}, I` : 'I'} bring hands-on project experience and a portfolio of shipped work I'd be glad to walk through.`
  );

  const middle = [];
  if (currentJob) {
    middle.push(`My most recent experience is as ${currentJob.title} at ${currentJob.organization}.`);
  }
  if (topProjects.length) {
    middle.push(`Selected projects include ${topProjects.join(' and ')} — full write-ups are on my portfolio: ${context.portfolio_url}.`);
  }
  if (skills.length) {
    middle.push(`Core skills: ${skills.join(', ')}.`);
  }
  if (education) {
    middle.push(`I'm pursuing a ${education.title} at ${education.organization}.`);
  }
  if (middle.length) paragraphs.push(middle.join(' '));

  paragraphs.push(
    `I'd welcome the chance to discuss how I can contribute to ${company}. Thank you for your consideration.`
  );
  paragraphs.push(`Sincerely,\n${name}`);

  const maxWords = platform?.coverLetter?.maxWords || 400;
  const coverLetter = clampWords(paragraphs.join('\n\n'), maxWords);

  return {
    source: 'template',
    cover_letter: coverLetter,
    skills_summary: skills.length
      ? `${skills.join(', ')}${topProjects.length ? ` — demonstrated across ${topProjects.join(', ')}` : ''}`
      : 'See portfolio for demonstrated skills.',
    professional_summary: profile.headline || '',
    project_summary: buildProjectSummary(context),
    emphasis: topProjects,
    keywords: skills,
    experience_bullets: currentJob && currentJob.highlights ? currentJob.highlights.slice(0, 5) : [],
  };
};

const compactContextForPrompt = (context) => {
  const profile = context.profile || {};
  return {
    name: profile.full_name,
    headline: profile.headline,
    skills: profile.skills || [],
    portfolio_url: context.portfolio_url,
    employment: (context.experiences?.employment || []).map((entry) => ({
      title: entry.title, organization: entry.organization, is_current: entry.is_current,
      highlights: entry.highlights || [],
    })),
    education: (context.experiences?.education || []).map((entry) => ({
      title: entry.title, organization: entry.organization, field_of_study: entry.field_of_study,
    })),
    certifications: (context.experiences?.certification || []).map((entry) => ({
      title: entry.title, organization: entry.organization,
    })),
    projects: (context.projects || []).slice(0, 8).map((project) => ({
      title: project.title, tagline: project.tagline, technologies: project.technologies || [],
    })),
  };
};

// Drafts the cover letter and tailoring signals with the AI model; falls back to the
// deterministic template on any model or parse failure so generation never hard-fails.
const generateCoverLetter = async ({ context, jobText, session, platform }) => {
  const aiModels = require('../utils/aiModels');
  const { parseAiJson } = require('../utils/aiCustomizer');
  const maxWords = platform?.coverLetter?.maxWords || 400;

  try {
    const model = aiModels.chooseModelForIntegration('application-helper');
    const systemPrompt =
      'You are an application-writing assistant. Reply with ONLY a JSON object with keys: ' +
      'cover_letter (string), skills_summary (string), professional_summary (string), ' +
      'project_summary (2-4 sentences describing the applicant\'s most relevant projects, grounded in the provided project data), ' +
      'emphasis (array of project/skill names to lead with), keywords (array of strings), ' +
      'experience_bullets (array of resume-ready bullet strings). ' +
      `The cover_letter must be at most ${maxWords} words, truthful to the provided applicant data, ` +
      'specific rather than generic, and must not invent employers, dates, or credentials.';
    const userPrompt = [
      `Applicant data (JSON):\n${JSON.stringify(compactContextForPrompt(context))}`,
      `Target role: ${session.job_title || 'not specified'} at ${session.company || 'not specified'}.`,
      jobText ? `Job posting text:\n${jobText}` : 'No job posting text available.',
      session.notes ? `Applicant notes: ${session.notes}` : null,
    ].filter(Boolean).join('\n\n');

    const response = await aiModels.callAiModel({
      modelId: model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 1800,
    });

    const parsed = parseAiJson(response.content);
    if (!parsed || typeof parsed.cover_letter !== 'string' || !parsed.cover_letter.trim()) {
      throw new Error('Model response missing cover_letter');
    }

    // Models sometimes sign off with a placeholder despite the prompt — substitute
    // the applicant's real name so the letter is paste-ready.
    const fullName = context.profile?.full_name || '';
    const letter = fullName
      ? parsed.cover_letter.replace(/\[(?:Your|Full)?\s*Name\]/gi, fullName)
      : parsed.cover_letter;

    return {
      source: 'ai',
      model_id: model.id,
      cover_letter: clampWords(letter, maxWords),
      skills_summary: typeof parsed.skills_summary === 'string' ? parsed.skills_summary : '',
      professional_summary: typeof parsed.professional_summary === 'string' ? parsed.professional_summary : '',
      project_summary: typeof parsed.project_summary === 'string' && parsed.project_summary.trim()
        ? parsed.project_summary
        : buildProjectSummary(context),
      emphasis: Array.isArray(parsed.emphasis) ? parsed.emphasis.slice(0, 10).map(String) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20).map(String) : [],
      experience_bullets: Array.isArray(parsed.experience_bullets) ? parsed.experience_bullets.slice(0, 8).map(String) : [],
    };
  } catch (error) {
    const fallback = buildCoverLetterFallback(context, session, platform);
    fallback.fallback_reason = error.message;
    return fallback;
  }
};

module.exports = { buildCoverLetterFallback, generateCoverLetter, clampWords };
