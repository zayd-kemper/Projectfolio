# Advisor — AI portfolio-growth advisor

## Context

ProjectFolio users (engineering/science students) have portfolios but no guidance on what to build next. The **Advisor** is a new AI tool that acts like an industry mentor: it analyzes the user's portfolio (projects, skills, technologies), captures their goals via a multi-step questionnaire (build projects / develop skills / land a position; horizontal vs vertical growth), then suggests projects/courses/resources and builds a **saved, interactive roadmap**. Modeled on ResuMax.ai's flow (analyze profile → match → plan) but focused on projects/skills instead of jobs.

**Decisions made with the user:** standalone page at `/dashboard/advisor`; interactive roadmap (checkable steps, progress persists); multiple saved sessions (history); curated catalog covering ~6 broad disciplines (software, data/ML, electrical, mechanical, robotics, bio/chem) supplying 10–20% of suggestions, the rest AI-generated.

**Key principle: this feature is almost entirely assembled from existing, verified infrastructure** — no new AI plumbing:

| Need | Existing asset (verified) |
|---|---|
| Portfolio parsing | `buildPortfolioAiContext(userId)` + `buildDerivedInsights` — `backend/utils/portfolioAiContext.js:121,162` (already derives `top_technologies`, `project_types`, `profile_gaps`, `evidence_score`) |
| Model swap | `INTEGRATION_MODEL_PROFILES` + `chooseModelForIntegration` + `callAiModel` — `backend/utils/aiModels.js:128,358,502`. Swapping models = editing one profile entry / env flags; honors per-user `portfolio_settings.preferred_ai_model` |
| AI handler shape | `handleOpportunityFinderV2` / `handleAiMatchV2` — `backend/routes/integrations.js:917,1023` (context → JSON-shape prompt → `callAiModel` → `parseModelJson` → normalize → deterministic fallback) |
| Session persistence | `application_sessions` pattern — `backend/migrations/008_application_helper.sql:28`, route lifecycle in `backend/routes/applications.js:35-59` (create row → `createJob` → 202 `{session_id, job_id}`) |
| Background jobs | `createJob` (`backend/jobs/service.js:41`), processor one-liner (`backend/jobs/processors.js:158-161`), job-runner bridge (`runApplicationGenerateJob`, `backend/applicationHelper/index.js:119`) |
| Module layout | `backend/applicationHelper/` (index/context/platforms split) |
| Frontend polling | `resolveJobResponse` — `frontend/src/utils/jobs.js`; loading UI `ActiveProgress.jsx` |
| Wizard UX | `frontend/src/components/shared/OnboardingModal.jsx` (step state, progress bar, goal chips) |
| Page + history UX | `frontend/src/pages/ApplicationHelperPage.jsx` (form → generate → result → session history) |

---

## Backend

### 1. Migration — `backend/migrations/009_advisor.sql` (new)

```sql
CREATE TABLE IF NOT EXISTS advisor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goals JSONB NOT NULL DEFAULT '{}',       -- questionnaire answers
  status VARCHAR(20) NOT NULL DEFAULT 'generating',  -- generating | ready | failed
  package JSONB,                           -- versioned result (analysis+suggestions+roadmap)
  progress JSONB NOT NULL DEFAULT '{}',    -- roadmap step status: { "step-1": { "completed": true, "completed_at": "..." } }
  model_id VARCHAR(120),
  job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user ON advisor_sessions(user_id, created_at DESC);
```

`progress` lives in its own column so the AI-generated `package` stays immutable and step check-offs are cheap updates.

### 2. New module `backend/advisor/` (mirrors `applicationHelper/`)

**`analyzer.js`** — deterministic portfolio analyzer (pure functions, no AI):
- `DISCIPLINE_KEYWORDS`: keyword→discipline map for the 6 disciplines (e.g. robotics: `ros`, `arduino`, `slam`…; mechanical: `cad`, `solidworks`, `fea`…).
- `analyzePortfolio(context)` — takes `buildPortfolioAiContext` output, returns `{ disciplines: [{id, label, score, confidence}], primary_discipline, estimated_level ('beginner'|'intermediate'|'advanced'), skill_gaps, demonstrated_skills, interests, signals }`. Discipline scored from headline/bio tokens + `derived.project_types` + `derived.top_technologies` (weighted); level from project count, `evidence_score`s, tech breadth; skill gaps from `users.skills` vs `derived.top_technologies` diff plus discipline-expected skills. This is the deterministic 10–20% engine **and** the fallback if the AI analysis call fails.

**`catalog.js`** — curated catalog + matcher (follows `applicationHelper/platforms.js` style):
- `ADVISOR_CATALOG`: ~6 disciplines × 5–8 entries, each `{ id, discipline, kind: 'project'|'skill', title, description, level, technologies[], outcomes[], estimated_weeks }`.
- `matchCatalogEntries({ analysis, goals, limit })` — scores by discipline match, level fit (goals.growth `vertical` → level above current, `horizontal` → same level), tech overlap; returns top 1–2 projects + 1 skill (the 10–20% curated share), flagged `source: 'curated'`.

**`prompts.js`** — prompt builders (industry-mentor tone, mirroring the system-prompt style of `integrations.js:925-933` and `1041-1049`: evidence-grounded, no invented facts, speak to first name, "Return only valid JSON"):
- `buildAnalysisPrompt({ context, deterministicAnalysis, goals })` → JSON shape: `{ discipline, discipline_label, confidence, current_level, summary, strengths[], skill_gaps[], interests[], direction }`.
- `buildSuggestionsPrompt({ context, analysis, goals, curatedPicks })` — curated picks are passed in as "already selected, do not duplicate"; AI generates the remaining ~80–90%. JSON shape:
```json
{
  "suggestions": {
    "projects": [{ "title", "description", "why_recommended", "technologies": [], "difficulty", "estimated_weeks", "builds_on": ["existing project title"] }],
    "skills": [{ "name", "why", "resources": [{ "name", "type": "course|docs|book|platform", "provider", "url": "https-or-null" }] }]
  },
  "roadmap": { "narrative": "...", "steps": [{ "title", "description", "kind": "project|skill|resource|milestone", "estimated_weeks", "outcome" }] }
}
```

**`index.js`** — orchestration (mirrors `runApplicationGenerateJob`, `applicationHelper/index.js:119-190`):
- `PACKAGE_VERSION = 1`; `assembleAdvisorPackage(...)` merges deterministic analysis + AI analysis + curated picks + AI suggestions/roadmap; assigns stable step ids (`step-1`…); normalizes every field with `compactText`, clamps scores, validates resource URLs with the `safeHttpUrl` approach from integrations.js; records `meta: { model, curated_count, fallback }`.
- `runAdvisorGenerateJob(input, { jobId, updateProgress })`: load session → `buildPortfolioAiContext` (10%) → `analyzePortfolio` (20%) → **AI call 1: analysis** (45%) → `matchCatalogEntries` → **AI call 2: suggestions+roadmap** (85%) → assemble package → `UPDATE advisor_sessions SET package, model_id, status='ready'` (100%). On any error: `status='failed', error=...` then rethrow (same try/catch shape as applicationHelper).
- **Two AI calls, not one**: cheap test models truncate large JSON (`parseAiJson` has a `TRUNCATED` code for this); splitting analysis (~1,200 max tokens) from suggestions+roadmap (~3,500 max tokens) keeps each response reliable and matches the ResuMax analyze→match→plan flow. If call 1 fails, fall back to the deterministic analysis; if call 2 fails after one retry, fail the session with a clear error. Both calls use `chooseModelForIntegration('advisor')` + `callAiModel({ temperature: 0.2 })` via `parseModelJson`.

### 3. Model profile — `backend/utils/aiModels.js`

Add an `advisor` entry to `INTEGRATION_MODEL_PROFILES` (after `application-helper`, line ~170), copying the `ai-match` shape: `requiredCapabilities: ['chat','json']`, same `preferredModelIds` list. **This one entry is the model-swap point** — reorder/replace ids (or flip provider env flags) to move from cheap test models to premium ones; per-user override already works via `portfolio_settings.preferred_ai_model`.

### 4. Route — `backend/routes/advisor.js` (new), mounted in `server.js`

Mount: `app.use('/api/advisor', require('./routes/advisor'));` next to line 193.

Follows `routes/applications.js` exactly (schema validation via `validateSchema`/`s`, `requireAuth`, `userQuota`, `userCostBudget`):
- `POST /sessions` — body `{ objective: 'projects'|'skills'|'position', growth: 'horizontal'|'vertical', focus_note?, target_role?, timeframe_weeks? }` → INSERT session → `createJob({ type: 'advisor:generate', input: { userId, sessionId } })` → `UPDATE ... SET job_id` → `202 { session_id, job_id, status }`. Quota mirroring applications' generate quota/budget.
- `GET /sessions` — history list (id, status, goals, created_at; no package).
- `GET /sessions/:id` — full session (package + progress).
- `POST /sessions/:id/regenerate` — reset to `generating`, enqueue new job (same as `applications.js:92`).
- `PATCH /sessions/:id/steps/:stepId` — body `{ completed: boolean }`; validates stepId exists in `package.roadmap.steps`; sync `jsonb_set`-style update of `progress`. No job.
- `DELETE /sessions/:id`.

### 5. Processor — `backend/jobs/processors.js`

One line next to line 160: `registerProcessor('advisor:generate', async (input, context) => require('../advisor').runAdvisorGenerateJob(input, context));`

---

## Frontend

### 6. Page — `frontend/src/pages/AdvisorPage.jsx` (new)

Structure modeled on `ApplicationHelperPage.jsx`; wrapped in `DashboardLayout`. Page-local components (repo convention — AIToolsPage/PortfolioSettingsPage keep components in-file):
- **Home view**: session history list (`GET /advisor/sessions`, status badges, open/delete) + "New roadmap" CTA.
- **Goals wizard** (modeled on `OnboardingModal.jsx` step/progress-bar pattern, rendered in-page): Step 1 objective cards (build projects / develop skills / land a position) → Step 2 growth level (horizontal: strengthen current level vs vertical: advance) + optional focus text / target role / timeframe → Step 3 review & start.
- **Generating view**: `POST /advisor/sessions` → `resolveJobResponse(res, { timeoutMs: 5*60_000 })` (`frontend/src/utils/jobs.js`) with `ActiveProgress` stages → then `GET /advisor/sessions/:id`.
- **Results view**: analysis summary (discipline, level, strengths, gaps), suggestions grid (project & skill cards; `source: 'curated'` badge; resource links), roadmap as an ordered checklist — checkbox per step fires `PATCH /advisor/sessions/:id/steps/:stepId`, progress bar computed from `progress`.
- API via the shared axios instance `frontend/src/utils/api.js`; toasts via `react-hot-toast`; icons via `EngineeringIcon` glyphs.

### 7. Route + nav registration

- `frontend/src/main.jsx`: lazy import + `<Route path="/dashboard/advisor" element={<ProtectedRoute><PageTransition><AdvisorPage /></PageTransition></ProtectedRoute>} />` (mirror the ai-tools route ~line 105).
- `frontend/src/components/shared/DashboardLayout.jsx`: add `NAV_ITEMS` entry `{ to: '/dashboard/advisor', label: 'Advisor', icon: 'target' }` (use an existing `EngineeringIcon` glyph).

---

## Testing

**Backend** (`node --test`; **must be appended to the `test` script list in `backend/package.json:19`**):
- `test/advisorAnalyzer.test.js` — discipline inference across the 6 disciplines, level heuristics, skill-gap diff (pure functions, fixture contexts modeled on `test/portfolioAiContext.test.js`).
- `test/advisorCatalog.test.js` — catalog integrity (ids unique, 6 disciplines covered), matcher scoring, horizontal/vertical level targeting, curated cap (10–20%).
- `test/advisorPackage.test.js` — package assembly/normalization: stable step ids, curated merge without duplicates, URL sanitization, fallback path when AI analysis fails, progress-update validation.
- `test/advisorRoute.test.js` — payload validation via the exported-checker pattern from `applications.js:23-33`.

**Frontend**:
- `frontend/src/pages/AdvisorPage.test.jsx` — copy the mocking convention from `ApplicationHelperPage.test.jsx` (mock `../utils/api` + `../utils/jobs`, stub `job_id` + `resolveJobResponse`); test wizard flow, results render, step check-off calls PATCH; assert route/nav registration by reading `main.jsx`/`DashboardLayout.jsx` source (same as that test's lines 127-135).

## Verification (end-to-end)

1. `cd backend && npm run db:migrate` — applies `009_advisor.sql`.
2. `cd backend && npm test` (fixed list now includes the four advisor files); single file: `node --test test/advisorAnalyzer.test.js`.
3. `cd frontend && npx vitest run src/pages/AdvisorPage.test.jsx && npx eslint src/pages/AdvisorPage.jsx`.
4. Live flow: run `backend npm run dev` + `frontend npm run dev`, seed (`npm run db:seed:test-portfolio`), log in → `/dashboard/advisor` → complete wizard → watch job complete → verify analysis/suggestions/roadmap render, check off a step, reload to confirm persistence, confirm session appears in history. Without provider API keys the deterministic-analysis fallback path can be exercised (AI calls will fail → session error path / fallback verified).
5. `graphify update .` after code changes (per CLAUDE.md).

## Implementation order

1. `backend/migrations/009_advisor.sql`
2. `backend/advisor/analyzer.js` + `test/advisorAnalyzer.test.js`
3. `backend/advisor/catalog.js` + `test/advisorCatalog.test.js`
4. `backend/advisor/prompts.js`, `backend/advisor/index.js` + `test/advisorPackage.test.js`
5. `aiModels.js` profile, `routes/advisor.js`, `server.js` mount, `processors.js` registration + `test/advisorRoute.test.js`; update `package.json` test list
6. `frontend/src/pages/AdvisorPage.jsx` + route/nav registration + `AdvisorPage.test.jsx`
7. Run full verification.