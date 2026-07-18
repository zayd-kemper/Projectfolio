// Prompt builders for the Advisor's two AI calls. Industry-mentor tone,
// mirroring the evidence-grounded system-prompt style of routes/integrations.js:
// cite real portfolio facts, never invent, speak to the student's first name,
// return only valid JSON. Kept separate from index.js so prompt tuning never
// touches assembly logic.

const buildAnalysisPrompt = ({ context, deterministicAnalysis, goals }) => ({
  system: [
    'You are an experienced industry mentor advising an engineering or science student on growing their project portfolio.',
    'Assess only from the supplied portfolio evidence and deterministic analysis.',
    'Every claim must trace to specific project titles, technologies, or profile facts.',
    'Do not invent degrees, employment history, credentials, project details, or availability.',
    `Speak directly to ${context.first_name || 'the student'} in a supportive, practical mentor voice.`,
    'Return only valid JSON.',
  ].join(' '),
  user: `PORTFOLIO_CONTEXT_JSON:
${JSON.stringify(context)}

DETERMINISTIC_ANALYSIS_JSON:
${JSON.stringify(deterministicAnalysis)}

STUDENT_GOALS_JSON:
${JSON.stringify(goals)}

TASK:
Confirm or correct the deterministic discipline read, judge the student's current level honestly, and describe
their strongest direction given their goals. Strengths and skill gaps must cite concrete portfolio evidence.

JSON shape:
{
  "discipline": "software|data-ml|electrical|mechanical|robotics|bio-chem",
  "discipline_label": "Human-readable discipline name",
  "confidence": "high|medium|low",
  "current_level": "beginner|intermediate|advanced",
  "summary": "3-4 sentences on where this portfolio stands, addressed to the student.",
  "strengths": ["Strength grounded in a named project or technology"],
  "skill_gaps": ["Specific missing skill that limits the stated goals"],
  "interests": ["Interest visible in the portfolio evidence"],
  "direction": "One sentence on the most credible growth direction for their goals."
}`,
});

const buildSuggestionsPrompt = ({ context, analysis, goals, curatedPicks }) => ({
  system: [
    'You are an experienced industry mentor building a personalized growth plan for an engineering or science student.',
    'Recommend projects, skills, and resources that build directly on the supplied portfolio evidence and analysis.',
    'Never duplicate the already-selected curated suggestions; complement them.',
    'Only reference real, well-known learning resources. Use real HTTPS URLs or null — never fabricate URLs.',
    `Speak directly to ${context.first_name || 'the student'} in a supportive, practical mentor voice.`,
    'Return only valid JSON.',
  ].join(' '),
  user: `PORTFOLIO_CONTEXT_JSON:
${JSON.stringify(context)}

ANALYSIS_JSON:
${JSON.stringify(analysis)}

STUDENT_GOALS_JSON:
${JSON.stringify(goals)}

ALREADY_SELECTED_CURATED_SUGGESTIONS_JSON (do not duplicate or restate these):
${JSON.stringify(curatedPicks.map((pick) => ({ kind: pick.kind, title: pick.title, technologies: pick.technologies })))}

TASK:
Suggest 3-4 new projects and 2-3 skills tailored to the analysis and goals, then lay out a single ordered
roadmap of 5-8 steps covering both the curated suggestions above and your new ones. Each project must say
why it is recommended for this exact student and which existing project it builds on (empty array if none).
Order roadmap steps from quick wins to the most ambitious work within the student's timeframe.

JSON shape:
{
  "suggestions": {
    "projects": [
      {
        "title": "Project name",
        "description": "What to build, concretely.",
        "why_recommended": "Why this student, citing their evidence.",
        "technologies": ["Tech"],
        "difficulty": "beginner|intermediate|advanced",
        "estimated_weeks": 4,
        "builds_on": ["Existing project title"]
      }
    ],
    "skills": [
      {
        "name": "Skill name",
        "why": "Why this skill unlocks their goals.",
        "resources": [
          { "name": "Resource name", "type": "course|docs|book|platform", "provider": "Provider", "url": "https-or-null" }
        ]
      }
    ]
  },
  "roadmap": {
    "narrative": "2-3 sentences describing the arc of the plan.",
    "steps": [
      {
        "title": "Step title",
        "description": "What to do in this step.",
        "kind": "project|skill|resource|milestone",
        "estimated_weeks": 3,
        "outcome": "What the portfolio gains when this step is done."
      }
    ]
  }
}`,
});

module.exports = { buildAnalysisPrompt, buildSuggestionsPrompt };
