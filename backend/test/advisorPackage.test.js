const test = require('node:test');
const assert = require('node:assert/strict');
const { assembleAdvisorPackage, isValidStepId, PACKAGE_VERSION } = require('../advisor');

const portfolioContext = () => ({
  id: 'user-1',
  first_name: 'Ada',
  headline: 'Robotics undergrad',
  skills: ['ROS', 'Python'],
  projects: [{ title: 'Mars Rover Controls', status: 'published', type: 'Robotics', technologies: ['ROS', 'Python'], evidence_score: 9 }],
  derived: {
    project_count: 1,
    published_project_count: 1,
    top_technologies: [{ name: 'ros', count: 1 }, { name: 'python', count: 1 }],
    project_types: [{ name: 'robotics', count: 1 }],
    profile_gaps: [],
  },
});

const deterministicAnalysis = () => ({
  disciplines: [{ id: 'robotics', label: 'Robotics & Autonomous Systems', score: 10, confidence: 'high' }],
  primary_discipline: 'robotics',
  estimated_level: 'intermediate',
  skill_gaps: [{ name: 'SLAM & localization', reason: 'Core skill not yet visible.' }],
  demonstrated_skills: ['ros', 'python'],
  interests: ['Electrical Engineering'],
  signals: ['2 of 2 projects are published.'],
});

const curatedPick = () => ({
  id: 'ro-slam-robot',
  discipline: 'robotics',
  kind: 'project',
  title: 'Autonomous mapping robot',
  description: 'Build a mobile robot that maps a room.',
  level: 'intermediate',
  technologies: ['ROS 2', 'Lidar'],
  outcomes: ['Proof of robotics capability'],
  estimated_weeks: 8,
  tutorials: [
    { title: 'ROS 2 documentation and tutorials', source: 'docs', url: 'https://docs.ros.org' },
    { title: 'slam_toolbox', source: 'github', url: 'https://github.com/SteveMacenski/slam_toolbox' },
  ],
  source: 'curated',
  match_reason: 'Curated pick: matches your primary discipline.',
});

test('assembleAdvisorPackage carries curated tutorials onto curated project suggestions', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-tut' },
    goals: { objective: 'projects', growth: 'horizontal' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: null,
    curatedPicks: [curatedPick()],
    aiSuggestions: { suggestions: { projects: [], skills: [] }, roadmap: { narrative: 'n', steps: [] } },
    model: 'stub:model',
    fallbackReason: 'offline',
  });

  const curated = pkg.suggestions.projects.find((project) => project.source === 'curated');
  assert.equal(curated.tutorials.length, 2);
  assert.equal(curated.tutorials_source, 'curated');
  assert.match(curated.tutorials[0].url, /^https:\/\//);
});

test('assembleAdvisorPackage merges curated picks with AI output under stable step ids', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-1' },
    goals: { objective: 'projects', growth: 'vertical' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: {
      discipline: 'robotics',
      discipline_label: 'Robotics & Autonomous Systems',
      confidence: 'high',
      current_level: 'intermediate',
      summary: 'Strong robotics direction backed by published projects.',
      strengths: ['ROS navigation experience'],
      skill_gaps: ['SLAM at production scale'],
      interests: ['Embedded control'],
      direction: 'Aim at autonomy-stack internships.',
    },
    curatedPicks: [curatedPick()],
    aiSuggestions: {
      suggestions: {
        projects: [
          // Duplicate of the curated pick — assembly must drop it.
          { title: 'Autonomous Mapping Robot', description: 'Duplicate title.', technologies: [] },
          {
            title: 'Drone precision-landing controller',
            description: 'Vision-based landing on a moving target.',
            why_recommended: 'Extends your control work into aerial autonomy.',
            technologies: ['PX4', 'OpenCV'],
            difficulty: 'advanced',
            estimated_weeks: 6,
            builds_on: ['Quadcopter Path Planner'],
          },
        ],
        skills: [{
          name: 'Motion planning',
          why: 'Bridges SLAM output to actual robot behavior.',
          resources: [{ name: 'OMPL primer', type: 'docs', provider: 'OMPL', url: 'https://ompl.kavrakilab.org/primer.html' }],
        }],
      },
      roadmap: {
        narrative: 'Two-quarter plan from mapping to aerial autonomy.',
        steps: [
          { title: 'Ship the mapping robot', description: 'Finish and publish it.', kind: 'project', estimated_weeks: 8, outcome: 'Published SLAM project' },
          { title: 'Study motion planning', kind: 'skill' },
        ],
      },
    },
    model: 'nvidia:gpt-oss-20b',
  });

  assert.equal(pkg.version, PACKAGE_VERSION);
  assert.equal(pkg.analysis.discipline, 'robotics');
  assert.equal(pkg.analysis.source, 'ai');

  const titles = pkg.suggestions.projects.map((project) => project.title.toLowerCase());
  assert.equal(titles.filter((title) => title === 'autonomous mapping robot').length, 1, 'curated duplicate must be dropped');
  assert.ok(pkg.suggestions.projects.some((project) => project.source === 'curated'));
  assert.ok(pkg.suggestions.projects.some((project) => project.source === 'ai'));

  assert.deepEqual(pkg.roadmap.steps.map((step) => step.id), ['step-1', 'step-2']);
  assert.equal(pkg.meta.curated_count, 1);
  assert.equal(pkg.meta.model_id, 'nvidia:gpt-oss-20b');
  assert.equal(pkg.meta.session_id, 'sess-1');
});

test('assembleAdvisorPackage sanitizes AI-provided URLs, enums, and text lengths', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-2' },
    goals: { objective: 'skills', growth: 'horizontal' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: {
      discipline: 'robotics',
      discipline_label: 'Robotics & Autonomous Systems',
      confidence: 'very-high',
      current_level: 'expert',
      summary: 'ok',
      strengths: [],
      skill_gaps: [],
      interests: [],
      direction: 'ok',
    },
    curatedPicks: [],
    aiSuggestions: {
      suggestions: {
        projects: [{
          title: `Robot ${'x'.repeat(500)}`,
          description: 'Fine.',
          why_recommended: 'Fine.',
          technologies: ['ROS'],
          difficulty: 'expert',
          estimated_weeks: 999,
        }],
        skills: [{
          name: 'Motion planning',
          why: 'Useful.',
          resources: [
            { name: 'Evil link', type: 'docs', provider: 'x', url: 'javascript:alert(1)' },
            { name: 'OMPL primer', type: 'nonsense', provider: 'OMPL', url: 'https://ompl.kavrakilab.org/primer.html' },
          ],
        }],
      },
      roadmap: {
        narrative: 'plan',
        steps: [{ title: 'Sprint zero', description: 'Kickoff.', kind: 'sprint', estimated_weeks: -3, outcome: 'go' }],
      },
    },
    model: 'stub:model',
  });

  const project = pkg.suggestions.projects[0];
  assert.ok(project.title.length <= 200, 'AI project titles are length-limited');
  assert.ok(['beginner', 'intermediate', 'advanced'].includes(project.difficulty), 'difficulty snaps to a valid level');
  assert.ok(project.estimated_weeks >= 1 && project.estimated_weeks <= 52, 'weeks clamp to a sane range');

  // Analysis enums snap to valid values too.
  assert.ok(['high', 'medium', 'low'].includes(pkg.analysis.confidence));
  assert.ok(['beginner', 'intermediate', 'advanced'].includes(pkg.analysis.current_level));

  const resources = pkg.suggestions.skills[0].resources;
  assert.equal(resources[0].url, null, 'non-http(s) URLs are stripped');
  assert.match(resources[1].url, /^https:/);
  assert.ok(['course', 'docs', 'book', 'platform'].includes(resources[1].type), 'resource type snaps to the enum');

  const step = pkg.roadmap.steps[0];
  assert.ok(['project', 'skill', 'resource', 'milestone'].includes(step.kind), 'step kind snaps to the enum');
  assert.ok(step.estimated_weeks === null || step.estimated_weeks >= 1, 'step weeks are sane or null');
});

test('assembleAdvisorPackage builds the analysis from deterministic output when the AI analysis failed', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-3' },
    goals: { objective: 'projects', growth: 'horizontal' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: null,
    curatedPicks: [curatedPick()],
    aiSuggestions: {
      suggestions: { projects: [], skills: [] },
      roadmap: { narrative: 'Plan.', steps: [{ title: 'Ship it', description: 'Do it.', kind: 'project' }] },
    },
    model: 'stub:model',
    fallbackReason: 'analysis model unavailable',
  });

  assert.equal(pkg.analysis.source, 'deterministic');
  assert.equal(pkg.analysis.discipline, 'robotics');
  assert.equal(pkg.analysis.discipline_label, 'Robotics & Autonomous Systems');
  assert.equal(pkg.analysis.current_level, 'intermediate');
  assert.equal(pkg.analysis.confidence, 'high');
  assert.ok(pkg.analysis.summary.length > 0, 'deterministic analysis still writes a summary');
  assert.ok(pkg.analysis.strengths.length > 0, 'demonstrated skills become strengths');
  assert.ok(pkg.analysis.skill_gaps.includes('SLAM & localization'));
  assert.equal(pkg.meta.fallback, true);
  assert.equal(pkg.meta.fallback_reason, 'analysis model unavailable');
});

test('assembleAdvisorPackage keeps the full AI analysis contract plus goals and timestamp', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-4' },
    goals: { objective: 'position', growth: 'vertical', target_role: 'Autonomy intern' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: {
      discipline: 'robotics',
      discipline_label: 'Robotics & Autonomous Systems',
      confidence: 'high',
      current_level: 'intermediate',
      summary: 'Solid robotics evidence.',
      strengths: ['ROS navigation experience'],
      skill_gaps: ['Production SLAM'],
      interests: ['Aerial autonomy'],
      direction: 'Target autonomy-stack teams.',
    },
    curatedPicks: [],
    aiSuggestions: { suggestions: { projects: [], skills: [] }, roadmap: { narrative: 'n', steps: [] } },
    model: 'stub:model',
  });

  assert.equal(pkg.goals.objective, 'position');
  assert.equal(pkg.goals.target_role, 'Autonomy intern');
  assert.ok(typeof pkg.generated_at === 'string' && pkg.generated_at.length > 0);

  assert.equal(pkg.analysis.discipline_label, 'Robotics & Autonomous Systems');
  assert.equal(pkg.analysis.summary, 'Solid robotics evidence.');
  assert.deepEqual(pkg.analysis.strengths, ['ROS navigation experience']);
  assert.deepEqual(pkg.analysis.skill_gaps, ['Production SLAM']);
  assert.deepEqual(pkg.analysis.interests, ['Aerial autonomy']);
  assert.equal(pkg.analysis.direction, 'Target autonomy-stack teams.');
  assert.equal(pkg.meta.fallback, false);
});

test('isValidStepId accepts only step ids that exist in the package roadmap', () => {
  const pkg = { roadmap: { steps: [{ id: 'step-1' }, { id: 'step-2' }] } };
  assert.equal(isValidStepId(pkg, 'step-1'), true);
  assert.equal(isValidStepId(pkg, 'step-9'), false);
  assert.equal(isValidStepId(null, 'step-1'), false);
  assert.equal(isValidStepId({}, 'step-1'), false);
});

test('runAdvisorGenerateJob runs two AI calls, assembles the package, and marks the session ready', async () => {
  const db = require('../config/database');
  const aiModels = require('../utils/aiModels');
  const portfolioAiContext = require('../utils/portfolioAiContext');
  const resourceFinder = require('../advisor/resourceFinder');
  const advisor = require('../advisor');

  // Keep runner tests off the network: enrichment lookups are stubbed inert.
  resourceFinder.findProjectTutorials = async () => [];
  resourceFinder.findSkillResources = async () => [];
  resourceFinder.verifyUrlAlive = async () => true;

  const session = {
    id: 'sess-run-1',
    user_id: 'user-1',
    goals: { objective: 'projects', growth: 'vertical' },
    status: 'generating',
  };
  const queries = [];
  db.query = async (text, params) => {
    queries.push({ text, params });
    if (/SELECT \* FROM advisor_sessions/.test(text)) return { rows: [session] };
    if (/preferred_ai_model/.test(text)) return { rows: [] };
    return { rows: [] };
  };
  portfolioAiContext.buildPortfolioAiContext = async (userId) => {
    assert.equal(userId, 'user-1');
    return portfolioContext();
  };

  const aiCalls = [];
  aiModels.chooseModelForIntegration = (profileId) => {
    assert.equal(profileId, 'advisor');
    return { model: { id: 'stub:model' }, profile: { id: 'advisor' }, routed: false };
  };
  aiModels.callAiModel = async ({ messages, maxTokens }) => {
    aiCalls.push({ messages, maxTokens });
    if (aiCalls.length === 1) {
      return {
        content: JSON.stringify({
          discipline: 'robotics', discipline_label: 'Robotics & Autonomous Systems',
          confidence: 'high', current_level: 'intermediate', summary: 'Strong start.',
          strengths: ['ROS work'], skill_gaps: ['SLAM'], interests: [], direction: 'Autonomy.',
        }),
      };
    }
    return {
      content: JSON.stringify({
        suggestions: {
          projects: [{ title: 'Drone landing controller', description: 'Build it.', why_recommended: 'Fits.', technologies: ['PX4'], difficulty: 'advanced', estimated_weeks: 6, builds_on: [] }],
          skills: [{ name: 'Motion planning', why: 'Needed.', resources: [] }],
        },
        roadmap: { narrative: 'Plan.', steps: [{ title: 'Ship it', description: 'Do.', kind: 'project', estimated_weeks: 6, outcome: 'Shipped' }] },
      }),
    };
  };

  const progress = [];
  const result = await advisor.runAdvisorGenerateJob(
    { userId: 'user-1', sessionId: 'sess-run-1' },
    { jobId: 'job-1', updateProgress: async (value) => progress.push(value) }
  );

  assert.equal(aiCalls.length, 2, 'analysis and suggestions are separate AI calls');
  assert.equal(result.session_id, 'sess-run-1');
  assert.equal(result.package.version, PACKAGE_VERSION);
  assert.equal(result.package.analysis.source, 'ai');
  assert.ok(result.package.suggestions.projects.some((project) => project.source === 'curated'), 'curated picks are merged in');
  assert.ok(result.package.roadmap.steps.length > 0);

  const readyUpdate = queries.find((entry) => /UPDATE advisor_sessions/.test(entry.text) && /'ready'/.test(entry.text));
  assert.ok(readyUpdate, 'session row is updated to ready with the package');
  assert.ok(progress.length >= 3, 'progress is reported along the way');
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]), 'progress never goes backwards');
});

test('runAdvisorGenerateJob attaches found tutorials to AI projects and drops dead AI resource links', async () => {
  const db = require('../config/database');
  const aiModels = require('../utils/aiModels');
  const portfolioAiContext = require('../utils/portfolioAiContext');
  const resourceFinder = require('../advisor/resourceFinder');
  const advisor = require('../advisor');

  const session = { id: 'sess-enrich', user_id: 'user-1', goals: { objective: 'projects', growth: 'vertical' }, status: 'generating' };
  db.query = async (text) => (/SELECT \* FROM advisor_sessions/.test(text) ? { rows: [session] } : { rows: [] });
  portfolioAiContext.buildPortfolioAiContext = async () => portfolioContext();
  aiModels.chooseModelForIntegration = () => ({ model: { id: 'stub:model' }, profile: { id: 'advisor' }, routed: false });

  let call = 0;
  aiModels.callAiModel = async () => {
    call += 1;
    if (call === 1) {
      return { content: JSON.stringify({ discipline: 'robotics', discipline_label: 'Robotics', confidence: 'high', current_level: 'intermediate', summary: 's', strengths: [], skill_gaps: [], interests: [], direction: 'd' }) };
    }
    return {
      content: JSON.stringify({
        suggestions: {
          projects: [{
            title: 'Drone precision landing',
            description: 'Vision landing.',
            why_recommended: 'Fits.',
            technologies: ['PX4', 'OpenCV'],
            difficulty: 'advanced',
            estimated_weeks: 6,
            builds_on: [],
            search_keywords: ['drone precision landing'],
          }],
          skills: [{
            name: 'Motion planning',
            why: 'Needed.',
            resources: [
              { name: 'Live doc', type: 'docs', provider: 'OMPL', url: 'https://ompl.kavrakilab.org/primer.html' },
              { name: 'Dead link', type: 'docs', provider: 'Ghost', url: 'https://gone.example/404' },
            ],
          }],
        },
        roadmap: { narrative: 'Plan.', steps: [{ title: 'Ship', kind: 'project' }] },
      }),
    };
  };

  const finderCalls = [];
  resourceFinder.findProjectTutorials = async (options) => {
    finderCalls.push(options);
    return [{ title: 'PX4/PX4-Autopilot: PX4 Autopilot Software', source: 'github', url: 'https://github.com/PX4/PX4-Autopilot' }];
  };
  resourceFinder.findSkillResources = async () => [
    { name: 'Awesome robotics', type: 'docs', provider: 'GitHub', url: 'https://github.com/kiloreux/awesome-robotics' },
  ];
  resourceFinder.verifyUrlAlive = async (url) => !url.includes('gone.example');

  const result = await advisor.runAdvisorGenerateJob(
    { userId: 'user-1', sessionId: 'sess-enrich' },
    { jobId: 'job-enrich', updateProgress: async () => {} }
  );

  const aiProject = result.package.suggestions.projects.find((project) => project.source === 'ai');
  // The found link leads; sparse lists get curated top-ups appended after it.
  assert.equal(aiProject.tutorials[0].url, 'https://github.com/PX4/PX4-Autopilot');
  assert.equal(aiProject.tutorials_source, 'found');
  assert.ok(finderCalls[0].keywords.includes('drone precision landing'), 'model search_keywords drive the lookup');

  const skill = result.package.suggestions.skills.find((entry) => entry.source === 'ai');
  const urls = skill.resources.map((resource) => resource.url);
  assert.ok(!urls.includes('https://gone.example/404'), 'dead AI links are dropped');
  assert.ok(urls.includes('https://ompl.kavrakilab.org/primer.html'), 'live AI links survive');
  assert.ok(urls.includes('https://github.com/kiloreux/awesome-robotics'), 'finder resources are appended');
});

test('assembleAdvisorPackage composes a curated learning path when no tutorials were found online', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-compose' },
    goals: { objective: 'projects', growth: 'vertical' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: null,
    curatedPicks: [],
    aiSuggestions: {
      suggestions: {
        projects: [{
          title: 'Custom swarm choreography rig',
          description: 'Multi-robot dance.',
          why_recommended: 'Novel.',
          technologies: ['ROS 2', 'Python'],
          difficulty: 'advanced',
          estimated_weeks: 8,
          builds_on: [],
          found_tutorials: [],
        }],
        skills: [],
      },
      roadmap: { narrative: 'n', steps: [] },
    },
    model: 'stub:model',
    fallbackReason: 'offline',
  });

  const project = pkg.suggestions.projects[0];
  assert.equal(project.tutorials_source, 'composed', 'no found tutorials means a composed path');
  assert.ok(project.tutorials.length >= 2, 'composed path pulls from curated catalog tutorials');
  assert.ok(project.tutorials.every((tutorial) => /^https:\/\//.test(tutorial.url)));
  // ROS 2 overlap should surface robotics catalog tutorials.
  assert.ok(project.tutorials.some((tutorial) => /ros|robot|gazebo|nav2|slam/i.test(`${tutorial.title} ${tutorial.url}`)));
});

test('assembleAdvisorPackage tops up sparse found-tutorial lists with curated links', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-topup' },
    goals: { objective: 'projects', growth: 'vertical' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: null,
    curatedPicks: [],
    aiSuggestions: {
      suggestions: {
        projects: [{
          title: 'ROS 2 telemetry node',
          description: 'd', why_recommended: 'w',
          technologies: ['ROS 2'], difficulty: 'advanced', estimated_weeks: 6, builds_on: [],
          found_tutorials: [{ title: 'Found repo', source: 'github', url: 'https://github.com/example/found' }],
        }],
        skills: [],
      },
      roadmap: { narrative: 'n', steps: [] },
    },
    model: 'stub:model',
    fallbackReason: 'offline',
  });

  const project = pkg.suggestions.projects[0];
  assert.equal(project.tutorials_source, 'found', 'a real found link keeps the found label');
  assert.ok(project.tutorials.length >= 3, 'sparse lists are topped up with curated links');
  assert.equal(project.tutorials[0].url, 'https://github.com/example/found', 'found links come first');
});

test('assembleAdvisorPackage backfills thin skills with curated discipline resources', () => {
  const pkg = assembleAdvisorPackage({
    session: { id: 'sess-thin-skill' },
    goals: { objective: 'skills', growth: 'horizontal' },
    deterministicAnalysis: deterministicAnalysis(),
    aiAnalysis: null,
    curatedPicks: [],
    aiSuggestions: {
      suggestions: {
        projects: [],
        skills: [{ name: 'Swarm coordination theory', why: 'Niche topic, nothing found online.', resources: [] }],
      },
      roadmap: { narrative: 'n', steps: [] },
    },
    model: 'stub:model',
    fallbackReason: 'offline',
  });

  const skill = pkg.suggestions.skills[0];
  assert.ok(skill.resources.length >= 2, 'thin skill gains curated resources');
  assert.ok(skill.resources.every((resource) => /^https:\/\//.test(resource.url)));
  assert.ok(
    skill.resources.some((resource) => /ros|robot|control|gazebo/i.test(`${resource.name} ${resource.url}`)),
    'backfill comes from the primary discipline'
  );
});

test('runAdvisorGenerateJob still succeeds with the deterministic analysis when the AI analysis call fails', async () => {
  const db = require('../config/database');
  const aiModels = require('../utils/aiModels');
  const portfolioAiContext = require('../utils/portfolioAiContext');
  const advisor = require('../advisor');

  const session = { id: 'sess-run-2', user_id: 'user-1', goals: { objective: 'skills', growth: 'horizontal' }, status: 'generating' };
  db.query = async (text) => {
    if (/SELECT \* FROM advisor_sessions/.test(text)) return { rows: [session] };
    return { rows: [] };
  };
  portfolioAiContext.buildPortfolioAiContext = async () => portfolioContext();
  aiModels.chooseModelForIntegration = () => ({ model: { id: 'stub:model' }, profile: { id: 'advisor' }, routed: false });

  let call = 0;
  aiModels.callAiModel = async () => {
    call += 1;
    if (call === 1) throw new Error('analysis model down');
    return {
      content: JSON.stringify({
        suggestions: { projects: [], skills: [] },
        roadmap: { narrative: 'Plan.', steps: [{ title: 'Learn', kind: 'skill' }] },
      }),
    };
  };

  const result = await advisor.runAdvisorGenerateJob(
    { userId: 'user-1', sessionId: 'sess-run-2' },
    { jobId: 'job-2', updateProgress: async () => {} }
  );

  assert.equal(result.package.analysis.source, 'deterministic');
  assert.equal(result.package.analysis.discipline, 'robotics');
  assert.equal(result.package.meta.fallback, true);
  assert.match(result.package.meta.fallback_reason, /analysis model down/);
});

test('runAdvisorGenerateJob fails the session when the suggestions call fails twice', async () => {
  const db = require('../config/database');
  const aiModels = require('../utils/aiModels');
  const portfolioAiContext = require('../utils/portfolioAiContext');
  const advisor = require('../advisor');

  const session = { id: 'sess-run-3', user_id: 'user-1', goals: { objective: 'projects', growth: 'vertical' }, status: 'generating' };
  const queries = [];
  db.query = async (text, params) => {
    queries.push({ text, params });
    if (/SELECT \* FROM advisor_sessions/.test(text)) return { rows: [session] };
    return { rows: [] };
  };
  portfolioAiContext.buildPortfolioAiContext = async () => portfolioContext();
  aiModels.chooseModelForIntegration = () => ({ model: { id: 'stub:model' }, profile: { id: 'advisor' }, routed: false });

  let suggestionAttempts = 0;
  aiModels.callAiModel = async ({ messages }) => {
    if (/growth plan/.test(messages[0].content)) {
      suggestionAttempts += 1;
      throw new Error('suggestions model down');
    }
    return {
      content: JSON.stringify({
        discipline: 'robotics', discipline_label: 'Robotics & Autonomous Systems', confidence: 'high',
        current_level: 'intermediate', summary: 's', strengths: [], skill_gaps: [], interests: [], direction: 'd',
      }),
    };
  };

  await assert.rejects(
    () => advisor.runAdvisorGenerateJob(
      { userId: 'user-1', sessionId: 'sess-run-3' },
      { jobId: 'job-3', updateProgress: async () => {} }
    ),
    /suggestions model down/
  );

  assert.equal(suggestionAttempts, 2, 'the suggestions call is retried exactly once');
  const failedUpdate = queries.find((entry) => /'failed'/.test(entry.text));
  assert.ok(failedUpdate, 'session row is marked failed');
  assert.match(String(failedUpdate.params[1]), /suggestions model down/);
});

test('advisor prompts are mentor-toned, evidence-grounded, and demand strict JSON', () => {
  const { buildAnalysisPrompt, buildSuggestionsPrompt } = require('../advisor/prompts');
  const context = { first_name: 'Ada', headline: 'Robotics undergrad', projects: [], derived: {} };

  const analysisPrompt = buildAnalysisPrompt({
    context,
    deterministicAnalysis: { primary_discipline: 'robotics' },
    goals: { objective: 'projects', growth: 'vertical' },
  });
  assert.match(analysisPrompt.system, /mentor/i);
  assert.match(analysisPrompt.system, /Ada/);
  assert.match(analysisPrompt.system, /Return only valid JSON/);
  assert.match(analysisPrompt.user, /"discipline"/);
  assert.match(analysisPrompt.user, /"current_level"/);

  const suggestionsPrompt = buildSuggestionsPrompt({
    context,
    analysis: { discipline: 'robotics' },
    goals: { objective: 'projects', growth: 'vertical' },
    curatedPicks: [{ kind: 'project', title: 'Autonomous mapping robot', technologies: ['ROS 2'] }],
  });
  assert.match(suggestionsPrompt.system, /Return only valid JSON/);
  assert.match(suggestionsPrompt.user, /Autonomous mapping robot/);
  assert.match(suggestionsPrompt.user, /do not duplicate/i);
  assert.match(suggestionsPrompt.user, /"roadmap"/);
  // search_keywords drive the real-tutorial lookup for every AI project.
  assert.match(suggestionsPrompt.user, /"search_keywords"/);
});
