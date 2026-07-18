// Advisor engine entry point. Assembles the versioned advisor package (the
// contract stored on advisor_sessions.package and consumed by the UI).
// Version rules: additive changes only within version 1; anything breaking
// bumps the number.

const PACKAGE_VERSION = 1;

const { compactText } = require('../utils/portfolioAiContext');
const { curatedTutorialsFor } = require('./catalog');
const resourceFinder = require('./resourceFinder');

const asArray = (value) => (Array.isArray(value) ? value : []);

const titleKey = (value) => String(value || '').trim().toLowerCase();

const LEVELS = ['beginner', 'intermediate', 'advanced'];

const snapEnum = (value, allowed, fallback) => (
  allowed.includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : fallback
);

const clampWeeks = (value, fallback = null) => {
  const weeks = Number(value);
  if (!Number.isFinite(weeks) || weeks < 1) return fallback;
  return Math.min(Math.round(weeks), 52);
};

// Same shape as integrations.js safeHttpUrl, but null (not '') for JSON storage.
const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

// When the AI analysis call failed, the deterministic analyzer output is
// reshaped into the same analysis contract the UI renders.
const deterministicAnalysisFallback = (deterministicAnalysis) => {
  const top = asArray(deterministicAnalysis.disciplines)[0] || {};
  const gapNames = asArray(deterministicAnalysis.skill_gaps).map((gap) => gap.name || String(gap));
  const strengths = asArray(deterministicAnalysis.demonstrated_skills).slice(0, 8);
  return {
    discipline: deterministicAnalysis.primary_discipline || null,
    discipline_label: top.label || null,
    confidence: snapEnum(top.confidence, ['high', 'medium', 'low'], 'low'),
    current_level: snapEnum(deterministicAnalysis.estimated_level, LEVELS, 'beginner'),
    summary: [
      top.label ? `Your portfolio evidence points to ${top.label}.` : 'Your portfolio is still finding its direction.',
      ...asArray(deterministicAnalysis.signals).slice(0, 3),
    ].join(' '),
    strengths,
    skill_gaps: gapNames,
    interests: asArray(deterministicAnalysis.interests),
    direction: null,
    source: 'deterministic',
  };
};

const assembleAdvisorPackage = ({
  session = {},
  goals = {},
  aiAnalysis = null,
  deterministicAnalysis = {},
  curatedPicks = [],
  aiSuggestions = null,
  model = null,
  fallbackReason = null,
} = {}) => {
  const curatedProjects = curatedPicks
    .filter((pick) => pick.kind === 'project')
    .map((pick) => ({
      title: pick.title,
      description: pick.description,
      why_recommended: pick.match_reason,
      technologies: asArray(pick.technologies),
      difficulty: pick.level,
      estimated_weeks: pick.estimated_weeks,
      builds_on: [],
      tutorials: asArray(pick.tutorials),
      tutorials_source: 'curated',
      source: 'curated',
      catalog_id: pick.id,
    }));

  const curatedTitles = new Set(curatedProjects.map((project) => titleKey(project.title)));
  const aiProjects = asArray(aiSuggestions?.suggestions?.projects)
    .filter((project) => !curatedTitles.has(titleKey(project.title)))
    .map((project) => {
      const found = asArray(project.found_tutorials);
      // Fewer than two real finds gets curated links appended so every AI
      // project ships with a usable set; zero finds becomes a composed path.
      let tutorials = found;
      if (found.length < 2) {
        const seen = new Set(found.map((tutorial) => tutorial.url));
        tutorials = [...found, ...curatedTutorialsFor({
          discipline: deterministicAnalysis.primary_discipline,
          technologies: asArray(project.technologies),
          limit: 3,
        }).filter((tutorial) => !seen.has(tutorial.url))];
      }
      return {
        title: compactText(project.title, 200),
        description: project.description,
        why_recommended: project.why_recommended,
        technologies: asArray(project.technologies),
        difficulty: snapEnum(project.difficulty, LEVELS, 'intermediate'),
        estimated_weeks: clampWeeks(project.estimated_weeks, 4),
        builds_on: asArray(project.builds_on),
        tutorials,
        tutorials_source: found.length ? 'found' : tutorials.length ? 'composed' : null,
        source: 'ai',
      };
    });

  const curatedSkills = curatedPicks
    .filter((pick) => pick.kind === 'skill')
    .map((pick) => ({
      name: pick.title,
      why: pick.match_reason,
      resources: [],
      source: 'curated',
      catalog_id: pick.id,
    }));

  const curatedSkillNames = new Set(curatedSkills.map((skill) => titleKey(skill.name)));
  const aiSkills = asArray(aiSuggestions?.suggestions?.skills)
    .filter((skill) => !curatedSkillNames.has(titleKey(skill.name)))
    .map((skill) => {
      const resources = asArray(skill.resources).map((resource) => ({
        name: compactText(resource.name, 160),
        type: snapEnum(resource.type, ['course', 'docs', 'book', 'platform'], 'platform'),
        provider: compactText(resource.provider, 120) || null,
        url: safeHttpUrl(resource.url),
      }));
      // A skill without at least two linkable resources gets curated
      // discipline tutorials as a floor.
      if (resources.filter((resource) => resource.url).length < 2) {
        const seen = new Set(resources.map((resource) => resource.url).filter(Boolean));
        const backfill = curatedTutorialsFor({
          discipline: deterministicAnalysis.primary_discipline,
          technologies: [skill.name],
          limit: 3,
        }).filter((tutorial) => !seen.has(tutorial.url)).map((tutorial) => ({
          name: tutorial.title,
          type: tutorial.source === 'course' ? 'course' : 'docs',
          provider: tutorial.source === 'github' ? 'GitHub' : tutorial.source === 'youtube' ? 'YouTube' : null,
          url: tutorial.url,
        }));
        resources.push(...backfill);
      }
      return {
        name: compactText(skill.name, 160),
        why: skill.why,
        resources,
        source: 'ai',
      };
    });

  return {
    version: PACKAGE_VERSION,
    generated_at: new Date().toISOString(),
    goals,
    analysis: aiAnalysis
      ? {
        discipline: aiAnalysis.discipline,
        discipline_label: compactText(aiAnalysis.discipline_label, 120) || null,
        confidence: snapEnum(aiAnalysis.confidence, ['high', 'medium', 'low'], 'medium'),
        current_level: snapEnum(aiAnalysis.current_level, LEVELS, 'beginner'),
        summary: compactText(aiAnalysis.summary, 1200),
        strengths: asArray(aiAnalysis.strengths).map((item) => compactText(item, 300)).filter(Boolean).slice(0, 8),
        skill_gaps: asArray(aiAnalysis.skill_gaps).map((item) => compactText(item, 300)).filter(Boolean).slice(0, 8),
        interests: asArray(aiAnalysis.interests).map((item) => compactText(item, 160)).filter(Boolean).slice(0, 8),
        direction: compactText(aiAnalysis.direction, 600) || null,
        source: 'ai',
      }
      : deterministicAnalysisFallback(deterministicAnalysis),
    suggestions: {
      projects: [...curatedProjects, ...aiProjects],
      skills: [...curatedSkills, ...aiSkills],
    },
    roadmap: {
      narrative: aiSuggestions?.roadmap?.narrative,
      steps: asArray(aiSuggestions?.roadmap?.steps).map((step, index) => ({
        id: `step-${index + 1}`,
        title: step.title,
        description: step.description,
        kind: snapEnum(step.kind, ['project', 'skill', 'resource', 'milestone'], 'milestone'),
        estimated_weeks: clampWeeks(step.estimated_weeks),
        outcome: step.outcome,
      })),
    },
    meta: {
      session_id: session.id || null,
      model_id: model || null,
      curated_count: curatedPicks.length,
      fallback: !aiAnalysis || Boolean(fallbackReason),
      fallback_reason: fallbackReason,
    },
  };
};

// Route-level guard for PATCH /sessions/:id/steps/:stepId — a step can only be
// checked off if the generated roadmap actually contains it.
const isValidStepId = (pkg, stepId) =>
  asArray(pkg?.roadmap?.steps).some((step) => step.id === stepId);

// Grounds AI suggestions in real links: every AI project gets tutorials looked
// up via free public APIs (real URLs by construction), every AI-supplied
// resource URL is liveness-checked, and thin skills get finder backfill.
const enrichAiSuggestions = async (aiSuggestions) => {
  if (!aiSuggestions?.suggestions) return aiSuggestions;

  const projects = await Promise.all(asArray(aiSuggestions.suggestions.projects).map(async (project) => {
    const keywords = asArray(project.search_keywords).length
      ? asArray(project.search_keywords)
      : [project.title];
    const tutorials = await resourceFinder
      .findProjectTutorials({ keywords, technologies: asArray(project.technologies), limit: 3 })
      .catch(() => []);
    return { ...project, found_tutorials: tutorials };
  }));

  const skills = await Promise.all(asArray(aiSuggestions.suggestions.skills).map(async (skill) => {
    const checked = await Promise.all(asArray(skill.resources).map(async (resource) => {
      if (!resource?.url) return resource;
      return (await resourceFinder.verifyUrlAlive(resource.url)) ? resource : null;
    }));
    const live = checked.filter(Boolean);
    let extra = [];
    if (live.filter((resource) => resource.url).length < 2) {
      extra = await resourceFinder
        .findSkillResources({ name: skill.name, keywords: asArray(skill.technologies) })
        .catch(() => []);
    }
    const seen = new Set(live.map((resource) => resource.url).filter(Boolean));
    return { ...skill, resources: [...live, ...extra.filter((resource) => !seen.has(resource.url))] };
  }));

  return { ...aiSuggestions, suggestions: { ...aiSuggestions.suggestions, projects, skills } };
};

// Orchestration for the advisor:generate background job (mirrors
// applicationHelper's runApplicationGenerateJob). Two AI calls, not one:
// cheap models truncate large JSON responses, so the analysis (~1,200 tokens)
// and suggestions+roadmap (~3,500 tokens) are requested separately. If the
// analysis call fails the deterministic analyzer stands in; if the suggestions
// call fails after one retry the session fails with a clear error.
const runAdvisorGenerateJob = async (input, { updateProgress }) => {
  const db = require('../config/database');
  const portfolioAiContext = require('../utils/portfolioAiContext');
  const aiModels = require('../utils/aiModels');
  const { parseAiJson } = require('../utils/aiCustomizer');
  const { analyzePortfolio } = require('./analyzer');
  const { matchCatalogEntries } = require('./catalog');
  const { buildAnalysisPrompt, buildSuggestionsPrompt } = require('./prompts');

  const sessionResult = await db.query('SELECT * FROM advisor_sessions WHERE id = $1', [input.sessionId]);
  const session = sessionResult.rows[0];
  if (!session) throw new Error('Advisor session not found.');
  if (session.user_id !== input.userId) throw new Error('Advisor session does not belong to this user.');

  try {
    const goals = session.goals || {};
    const context = await portfolioAiContext.buildPortfolioAiContext(session.user_id);
    await updateProgress(10);

    const deterministicAnalysis = analyzePortfolio(context);
    await updateProgress(20);

    const preferredResult = await db.query(
      'SELECT preferred_ai_model FROM portfolio_settings WHERE user_id = $1',
      [session.user_id]
    );
    const selection = aiModels.chooseModelForIntegration('advisor', preferredResult.rows[0]?.preferred_ai_model || undefined);

    const callJson = async (prompt, maxTokens) => {
      const response = await aiModels.callAiModel({
        modelId: selection.model.id,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.2,
        maxTokens,
      });
      return parseAiJson(String(response.content || ''));
    };

    let aiAnalysis = null;
    let fallbackReason = null;
    try {
      aiAnalysis = await callJson(buildAnalysisPrompt({ context, deterministicAnalysis, goals }), 1200);
    } catch (error) {
      fallbackReason = `AI analysis unavailable: ${String(error.message || error)}`;
    }
    await updateProgress(45);

    const curatedPicks = matchCatalogEntries({ analysis: deterministicAnalysis, goals });
    const analysisForPrompt = aiAnalysis || {
      discipline: deterministicAnalysis.primary_discipline,
      current_level: deterministicAnalysis.estimated_level,
      skill_gaps: deterministicAnalysis.skill_gaps,
    };

    const suggestionsPrompt = buildSuggestionsPrompt({ context, analysis: analysisForPrompt, goals, curatedPicks });
    let aiSuggestions;
    try {
      aiSuggestions = await callJson(suggestionsPrompt, 3500);
    } catch {
      aiSuggestions = await callJson(suggestionsPrompt, 3500);
    }
    // enrichAiSuggestions is defined at module scope above (tutorial lookup,
    // dead-link pruning) — this call is what the failing enrichment test drives.
    aiSuggestions = await enrichAiSuggestions(aiSuggestions);
    await updateProgress(85);

    const pkg = assembleAdvisorPackage({
      session,
      goals,
      deterministicAnalysis,
      aiAnalysis,
      curatedPicks,
      aiSuggestions,
      model: selection.model.id,
      fallbackReason,
    });

    await db.query(
      `UPDATE advisor_sessions
       SET package = $2, model_id = $3, status = 'ready', error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [session.id, JSON.stringify(pkg), selection.model.id]
    );
    await updateProgress(100);

    return { session_id: session.id, package: pkg };
  } catch (error) {
    await db.query(
      `UPDATE advisor_sessions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [session.id, String(error.message || error)]
    ).catch(() => {});
    throw error;
  }
};

module.exports = { PACKAGE_VERSION, assembleAdvisorPackage, isValidStepId, runAdvisorGenerateJob };
