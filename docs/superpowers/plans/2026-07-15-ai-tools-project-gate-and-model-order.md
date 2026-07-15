# AI Tools Project-Completion Gate + GPT-OSS Default Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deny the two AI tools (AI Portfolio Match and Opportunity Finder) to users who have no project with a completion rating ≥ 50%, returning the denial message *before* any AI provider request (saving tokens); and reorder those tools' model preference so GPT-OSS (`nvidia:gpt-oss-20b`) is the default and the NVIDIA Nemotron models are the fallback. Verify with live breach tests via MCP Playwright.

**Architecture:** A new backend util (`projectCompleteness.js`) mirrors the frontend's `scoreCompleteness()` heuristic (there is no DB column for completion — it is computed from project fields). A gate middleware runs on both integration routes *before* quota middleware and job creation (instant 403, no quota burn, no job), and the same check runs inside the V2 handlers as defense-in-depth for the worker/job path. The model change is a reorder of `preferredModelIds` in `INTEGRATION_MODEL_PROFILES` for the `ai-match` and `opportunity-finder` profiles only. The frontend catch blocks are updated to surface the server's gate message instead of a generic error.

**Tech Stack:** Node/Express, `node --test` (backend), React + Vitest/Testing Library (frontend), MCP Playwright for live verification.

## Global Constraints

- **Gate message copy is an ASSUMPTION.** The user's spec was cut off after "The message should say". The plan uses: `"You need at least one project that is at least 50% complete to use the AI tools. Add a cover image, tagline, description, or technologies to one of your projects, then try again."` It is a single exported constant (`AI_TOOLS_GATE_MESSAGE`) so swapping in the user's exact copy later is a one-line change. Confirm with the user when possible.
- Threshold is **50** (inclusive: score ≥ 50 qualifies), exported as `MIN_AI_TOOLS_COMPLETENESS`.
- Scoring must **exactly mirror** `scoreCompleteness()` in `frontend/src/pages/DashboardPage.jsx:29-41` (weights: cover_image_url 20, tagline 15, description 10, ≥2 technologies 15, start_date 10, github_url-or-live_url 15, project_type 5, view_count>0 5, is_featured 5, capped at 100).
- Only projects **owned** by the user count (`projects.user_id = userId`), matching the dashboard which scores `user_role === 'owner'` projects.
- Model reorder applies **only** to the `ai-match` and `opportunity-finder` profiles in `INTEGRATION_MODEL_PROFILES`. Do **not** touch `application-helper`, `AGENT_MODES`, or `DEFAULT_MODEL_PRIORITY`.
- "gptOSS" = registry id `nvidia:gpt-oss-20b` (NVIDIA-direct API, enabled by `ENABLE_NVIDIA_MODELS` + `NVIDIA_API_KEY`). "NVIDIA fallback" = the Nemotron models (`nvidia:nemotron-3-super-120b-a12b`, `nvidia:nemotron-3-super`, routed via OpenRouter).
- Backend `npm test` runs a **fixed file list** in `backend/package.json` — any new test file must be added there or it will never run.
- Run backend commands from `backend/`, frontend commands from `frontend/` (no root manifest).
- The gate error body must be `{ error: AI_TOOLS_GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' }` with HTTP **403** — later tasks (frontend, live tests) depend on exactly this shape.

---

### Task 1: Backend completeness scorer and gate helper

**Files:**
- Create: `backend/utils/projectCompleteness.js`
- Test: `backend/test/projectCompleteness.test.js`
- Modify: `backend/package.json:19` (append the new test file to the `test` script list)

**Interfaces:**
- Consumes: `query` from `backend/config/database.js` (`query(text, params) -> Promise<{ rows }>`)
- Produces (used by Tasks 2 and 5):
  - `scoreProjectCompleteness(project) -> number` (0–100)
  - `hasQualifiedProject(userId, { minScore = 50, queryFn = query } = {}) -> Promise<boolean>`
  - `AI_TOOLS_GATE_MESSAGE: string`
  - `MIN_AI_TOOLS_COMPLETENESS: 50`

- [ ] **Step 1: Write the failing test**

Create `backend/test/projectCompleteness.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  scoreProjectCompleteness,
  hasQualifiedProject,
  AI_TOOLS_GATE_MESSAGE,
  MIN_AI_TOOLS_COMPLETENESS,
} = require('../utils/projectCompleteness');

test('empty project scores 0', () => {
  assert.equal(scoreProjectCompleteness({}), 0);
  assert.equal(scoreProjectCompleteness(), 0);
});

test('scoring mirrors the dashboard completeness weights', () => {
  assert.equal(scoreProjectCompleteness({ cover_image_url: 'https://cdn/img.png' }), 20);
  assert.equal(scoreProjectCompleteness({ tagline: 'A tagline' }), 15);
  assert.equal(scoreProjectCompleteness({ tagline: '   ' }), 0);
  assert.equal(scoreProjectCompleteness({ description: 'Words' }), 10);
  assert.equal(scoreProjectCompleteness({ technologies: ['react'] }), 0);
  assert.equal(scoreProjectCompleteness({ technologies: ['react', 'node'] }), 15);
  assert.equal(scoreProjectCompleteness({ start_date: '2026-01-01' }), 10);
  assert.equal(scoreProjectCompleteness({ github_url: 'https://github.com/x/y' }), 15);
  assert.equal(scoreProjectCompleteness({ live_url: 'https://demo.example' }), 15);
  assert.equal(scoreProjectCompleteness({ project_type: 'software' }), 5);
  assert.equal(scoreProjectCompleteness({ view_count: 3 }), 5);
  assert.equal(scoreProjectCompleteness({ view_count: 0 }), 0);
  assert.equal(scoreProjectCompleteness({ is_featured: true }), 5);
});

test('a fully filled project caps at 100', () => {
  const full = {
    cover_image_url: 'x', tagline: 't', description: 'd',
    technologies: ['a', 'b', 'c'], start_date: '2026-01-01',
    github_url: 'g', live_url: 'l', project_type: 'software',
    view_count: 50, is_featured: true,
  };
  assert.equal(scoreProjectCompleteness(full), 100);
});

test('technologies stored as a JSON string still count', () => {
  assert.equal(scoreProjectCompleteness({ technologies: '["react","node"]' }), 15);
  assert.equal(scoreProjectCompleteness({ technologies: 'not-json' }), 0);
});

test('hasQualifiedProject is true when any owned project reaches the minimum', async () => {
  // 20 (cover) + 15 (tagline) + 15 (github) = 50 — exactly at threshold qualifies
  const rows = [
    { tagline: 'weak project' },
    { cover_image_url: 'x', tagline: 't', github_url: 'https://github.com/x/y' },
  ];
  const calls = [];
  const queryFn = async (text, params) => { calls.push({ text, params }); return { rows }; };
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['user-1']);
  assert.match(calls[0].text, /FROM projects/i);
  assert.match(calls[0].text, /user_id = \$1/);
});

test('hasQualifiedProject is false when no project reaches the minimum', async () => {
  const queryFn = async () => ({ rows: [{ tagline: 't', description: 'd' }] }); // 25
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), false);
});

test('hasQualifiedProject is false for a user with no projects', async () => {
  const queryFn = async () => ({ rows: [] });
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), false);
});

test('threshold and gate message', () => {
  assert.equal(MIN_AI_TOOLS_COMPLETENESS, 50);
  assert.match(AI_TOOLS_GATE_MESSAGE, /50%/);
  assert.match(AI_TOOLS_GATE_MESSAGE, /project/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/projectCompleteness.test.js`
Expected: FAIL with `Cannot find module '../utils/projectCompleteness'`

- [ ] **Step 3: Write the implementation**

Create `backend/utils/projectCompleteness.js`:

```js
// backend/utils/projectCompleteness.js
const { query } = require('../config/database');

const MIN_AI_TOOLS_COMPLETENESS = 50;

// NOTE: copy pending confirmation — the product spec for this string was cut off.
const AI_TOOLS_GATE_MESSAGE = 'You need at least one project that is at least 50% complete to use the AI tools. '
  + 'Add a cover image, tagline, description, or technologies to one of your projects, then try again.';

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Mirrors scoreCompleteness() in frontend/src/pages/DashboardPage.jsx — keep the two in sync.
const scoreProjectCompleteness = (project = {}) => {
  let score = 0;
  if (project.cover_image_url) score += 20;
  if (String(project.tagline || '').trim()) score += 15;
  if (String(project.description || '').trim()) score += 10;
  if (asArray(project.technologies).length >= 2) score += 15;
  if (project.start_date) score += 10;
  if (project.github_url || project.live_url) score += 15;
  if (project.project_type) score += 5;
  if (Number(project.view_count) > 0) score += 5;
  if (project.is_featured) score += 5;
  return Math.min(score, 100);
};

const hasQualifiedProject = async (userId, { minScore = MIN_AI_TOOLS_COMPLETENESS, queryFn = query } = {}) => {
  const result = await queryFn(
    `SELECT cover_image_url, tagline, description, technologies, start_date,
            github_url, live_url, project_type, view_count, is_featured
       FROM projects
      WHERE user_id = $1`,
    [userId]
  );
  return result.rows.some((project) => scoreProjectCompleteness(project) >= minScore);
};

module.exports = {
  AI_TOOLS_GATE_MESSAGE,
  MIN_AI_TOOLS_COMPLETENESS,
  scoreProjectCompleteness,
  hasQualifiedProject,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/projectCompleteness.test.js`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Register the test file in the suite**

In `backend/package.json`, in the `"test"` script (line 19), append ` test/projectCompleteness.test.js` to the end of the file list (before the closing quote):

```
"test": "node --test test/databaseDateParser.test.js ... test/scalability.test.js test/projectCompleteness.test.js",
```

(`...` here means: keep the existing list exactly as-is; this is a pure append.)

Run: `cd backend && npm test`
Expected: full suite PASS including the new file.

- [ ] **Step 6: Commit**

```bash
git add backend/utils/projectCompleteness.js backend/test/projectCompleteness.test.js backend/package.json
git commit -m "feat(integrations): project completeness scorer + AI tools gate helper"
```

---

### Task 2: Wire the gate into the integration routes and handlers

**Files:**
- Modify: `backend/routes/integrations.js` (imports ~line 14; route registrations at lines 759 and 1114; handlers `handleOpportunityFinderV2` line 917 and `handleAiMatchV2` line 1023; test exports ~line 1141)
- Test: `backend/test/projectCompleteness.test.js` (append middleware tests)

**Interfaces:**
- Consumes: `hasQualifiedProject(userId, opts)` and `AI_TOOLS_GATE_MESSAGE` from Task 1.
- Produces: `router.requireQualifiedProject(checkFn?)` — a middleware **factory**; calling it with no args uses the real `hasQualifiedProject`; tests inject a fake `checkFn(userId) -> Promise<boolean>`. On failure it responds `403 { error: AI_TOOLS_GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' }` (the shape Tasks 4 and 5 depend on).

- [ ] **Step 1: Write the failing tests**

Append to `backend/test/projectCompleteness.test.js`:

```js
const integrationsRouter = require('../routes/integrations');

test('requireQualifiedProject blocks unqualified users with 403 and the gate message', async () => {
  const middleware = integrationsRouter.requireQualifiedProject(async () => false);
  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
  };
  await middleware({ user: { id: 'u1' } }, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(payload.error, AI_TOOLS_GATE_MESSAGE);
  assert.equal(payload.code, 'AI_TOOLS_PROJECT_GATE');
  assert.equal(nextCalled, false);
});

test('requireQualifiedProject passes qualified users through to next()', async () => {
  const middleware = integrationsRouter.requireQualifiedProject(async () => true);
  let nextCalled = false;
  const res = {
    status() { throw new Error('should not respond'); },
    json() { throw new Error('should not respond'); },
  };
  await middleware({ user: { id: 'u1' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireQualifiedProject forwards check errors to next(err)', async () => {
  const boom = new Error('db down');
  const middleware = integrationsRouter.requireQualifiedProject(async () => { throw boom; });
  let forwarded = null;
  await middleware({ user: { id: 'u1' } }, {}, (err) => { forwarded = err; });
  assert.equal(forwarded, boom);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test test/projectCompleteness.test.js`
Expected: FAIL — `integrationsRouter.requireQualifiedProject is not a function`

- [ ] **Step 3: Implement the middleware and wire it in**

In `backend/routes/integrations.js`:

3a. Add the import after line 13 (`const { callAiModel, chooseModelForIntegration } = require('../utils/aiModels');`):

```js
const { AI_TOOLS_GATE_MESSAGE, hasQualifiedProject } = require('../utils/projectCompleteness');
```

3b. Add the middleware factory near the other shared helpers (after the schema definitions, around line 41):

```js
// Gate for the AI tools: deny before quota spend, job creation, or any AI provider call.
const requireQualifiedProject = (checkFn = hasQualifiedProject) => async (req, res, next) => {
  try {
    if (await checkFn(req.user.id)) return next();
    return res.status(403).json({ error: AI_TOOLS_GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' });
  } catch (err) {
    return next(err);
  }
};
```

3c. Insert `requireQualifiedProject(),` into both route chains **between `validateSchema` and `userQuota`** (so denied users burn no quota/budget):

Line 759 becomes:

```js
router.post('/opportunity-finder', requireAuth, validateSchema({ body: opportunityFinderSchema }), requireQualifiedProject(), userQuota('integrations.opportunity-finder', { windowMs: 60 * 60 * 1000, max: 30 }), userCostBudget('integrations.opportunity-finder', { windowMs: 24 * 60 * 60 * 1000, maxCost: 120, cost: 12, message: 'Daily AI opportunity budget reached.' }), async (req, res) => {
```

Line 1114 becomes:

```js
router.post('/ai-match', requireAuth, validateSchema({ body: aiMatchSchema }), requireQualifiedProject(), userQuota('integrations.ai-match', { windowMs: 60 * 60 * 1000, max: 30 }), userCostBudget('integrations.ai-match', { windowMs: 24 * 60 * 60 * 1000, maxCost: 100, cost: 10, message: 'Daily AI match budget reached.' }), async (req, res) => {
```

3d. Defense-in-depth in the handlers (they also run via the worker job path `router.runOpportunityFinderJob`/`router.runAiMatchJob`, which bypasses route middleware). This is the check that guarantees no tokens are spent even for already-enqueued jobs.

At the top of `handleOpportunityFinderV2` (line 917), insert as the first statements of the function body, before `const { filters } = req.body;`:

```js
  if (!(await hasQualifiedProject(req.user.id))) {
    return res.status(403).json({ error: AI_TOOLS_GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' });
  }
```

In `handleAiMatchV2` (line 1023), insert the same block immediately after the existing `if (!url) return res.status(400).json({ error: 'URL is required.' });` line:

```js
  if (!(await hasQualifiedProject(req.user.id))) {
    return res.status(403).json({ error: AI_TOOLS_GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' });
  }
```

3e. Export the factory for tests, next to the existing test exports (after line `router.buildOpportunityFinderFallbackParsed = buildOpportunityFinderFallbackParsed;`, ~line 1142):

```js
router.requireQualifiedProject = requireQualifiedProject;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/projectCompleteness.test.js`
Expected: PASS (11 tests)

Then run the full suite to catch regressions: `cd backend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/integrations.js backend/test/projectCompleteness.test.js
git commit -m "feat(integrations): gate AI tools behind a >=50% complete project before any AI call"
```

---

### Task 3: Default GPT-OSS, Nemotron fallback for the two AI tool profiles

**Files:**
- Modify: `backend/utils/aiModels.js:128-156` (`INTEGRATION_MODEL_PROFILES`, `ai-match` and `opportunity-finder` entries only)
- Test: `backend/test/aiModels.test.js`

**Interfaces:**
- Consumes: existing `reloadAiModelsWithEnv(env)` helper already defined in `backend/test/aiModels.test.js` (reloads the module with the given env), and `chooseModelForIntegration(profileId)` from `aiModels.js`.
- Produces: with NVIDIA-direct enabled, `chooseModelForIntegration('ai-match').model.id === 'nvidia:gpt-oss-20b'` (same for `'opportunity-finder'`); with only OpenRouter enabled, both fall back to `'nvidia:nemotron-3-super-120b-a12b'`.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/aiModels.test.js` (it already imports `reloadAiModelsWithEnv` — reuse it):

```js
test('AI tool profiles default to GPT-OSS and fall back to Nemotron', () => {
  const models = reloadAiModelsWithEnv({
    ENABLE_NVIDIA_MODELS: 'true',
    NVIDIA_API_KEY: 'test-nvidia-key',
    NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
    ENABLE_OPENROUTER_MODELS: 'true',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  });
  assert.equal(models.chooseModelForIntegration('ai-match').model.id, 'nvidia:gpt-oss-20b');
  assert.equal(models.chooseModelForIntegration('opportunity-finder').model.id, 'nvidia:gpt-oss-20b');
  // Application helper is intentionally unchanged (Nemotron-first).
  assert.equal(models.chooseModelForIntegration('application-helper').model.id, 'nvidia:nemotron-3-super-120b-a12b');

  const withoutNvidiaDirect = reloadAiModelsWithEnv({
    ENABLE_OPENROUTER_MODELS: 'true',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  });
  assert.equal(withoutNvidiaDirect.chooseModelForIntegration('ai-match').model.id, 'nvidia:nemotron-3-super-120b-a12b');
  assert.equal(withoutNvidiaDirect.chooseModelForIntegration('opportunity-finder').model.id, 'nvidia:nemotron-3-super-120b-a12b');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/aiModels.test.js`
Expected: the new test FAILS (`'nvidia:nemotron-3-super-120b-a12b' !== 'nvidia:gpt-oss-20b'`); all pre-existing tests still pass.

- [ ] **Step 3: Reorder the preferred models**

In `backend/utils/aiModels.js`, replace the `preferredModelIds` arrays of **both** the `'ai-match'` (lines 134-140) and `'opportunity-finder'` (lines 148-154) entries in `INTEGRATION_MODEL_PROFILES` with:

```js
    preferredModelIds: [
      'nvidia:gpt-oss-20b',
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
```

Leave the `'application-helper'` entry untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/aiModels.test.js`
Expected: PASS. Note the pre-existing test `OpenRouter env enables premium model routing through one provider key` (line 110) still passes: with only OpenRouter enabled, `nvidia:gpt-oss-20b` is disabled, so `ai-match`/`opportunity-finder` skip it and land on Nemotron — exactly what that test asserts at lines 131-132.

Then: `cd backend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/utils/aiModels.js backend/test/aiModels.test.js
git commit -m "feat(aiModels): default AI tools to GPT-OSS with Nemotron fallback"
```

---

### Task 4: Surface the gate message in the frontend

**Files:**
- Modify: `frontend/src/pages/AIToolsPage.jsx:291-294` (AI match catch) and `frontend/src/pages/AIToolsPage.jsx:565-566` (opportunity finder catch)
- Test (create): `frontend/src/pages/AIToolsPage.gate.test.jsx`

**Interfaces:**
- Consumes: the 403 body from Task 2 — axios rejects with `err.response.data.error` containing `AI_TOOLS_GATE_MESSAGE`. The page's existing `ErrorCard` (line 56) renders whatever string is in the `error` state.
- Produces: user-visible gate message inside `ErrorCard` for both tools.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/AIToolsPage.gate.test.jsx` (follows the mocking pattern of `ApplicationHelperPage.test.jsx`):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIToolsPage from './AIToolsPage';

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const GATE_MESSAGE = 'You need at least one project that is at least 50% complete to use the AI tools. '
  + 'Add a cover image, tagline, description, or technologies to one of your projects, then try again.';

const gateRejection = () => {
  const error = new Error('Request failed with status code 403');
  error.response = { status: 403, data: { error: GATE_MESSAGE, code: 'AI_TOOLS_PROJECT_GATE' } };
  return Promise.reject(error);
};

describe('AIToolsPage gate message', () => {
  beforeEach(async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockReset();
  });

  it('shows the server gate message when Opportunity Finder is denied', async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockImplementationOnce(gateRejection);

    render(<AIToolsPage />);
    await userEvent.click(screen.getByText('Opportunity Finder'));
    await userEvent.click(screen.getByRole('button', { name: /find opportunities/i }));

    expect(await screen.findByText(GATE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the server gate message when AI Portfolio Match is denied', async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockImplementationOnce(gateRejection);

    render(<AIToolsPage />);
    await userEvent.click(screen.getByText('AI Portfolio Match'));
    await userEvent.type(screen.getByPlaceholderText('https://example.com/opportunity'), 'https://example.com/job');
    await userEvent.click(screen.getByRole('button', { name: /analyze/i }));

    expect(await screen.findByText(GATE_MESSAGE)).toBeInTheDocument();
  });
});
```

Implementation note for the executor: if a `getByRole('button', { name: ... })` query doesn't match the actual button label, open `AIToolsPage.jsx`, find the submit button inside `AIMatchTool` (near line 319-340) and `OpportunityFinderTool` (near line 553-590), and use its real accessible name in the test — do not weaken the assertion on the gate message itself.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/AIToolsPage.gate.test.jsx`
Expected: FAIL — the generic messages ('Failed to find opportunities. Please try again.' / 'Analysis failed. Check the URL and try again.') render instead of the gate message.

- [ ] **Step 3: Surface the server error message**

In `frontend/src/pages/AIToolsPage.jsx`, replace the AI match catch block (lines 291-295):

```js
    } catch (err) {
      setError(err.response?.data?.error
        || (err.message?.includes('JSON')
          ? 'AI returned an unexpected format. Please try again.'
          : 'Analysis failed. Check the URL and try again.'));
    } finally {
```

And replace the opportunity finder catch block (lines 565-567):

```js
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to find opportunities. Please try again.');
    } finally {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/AIToolsPage.gate.test.jsx`
Expected: PASS (2 tests)

Then the whole frontend suite: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AIToolsPage.jsx frontend/src/pages/AIToolsPage.gate.test.jsx
git commit -m "feat(ai-tools): surface project-completeness gate message from the server"
```

---

### Task 5: Live breach tests with MCP Playwright

This task verifies, against a running instance, that (a) an unqualified user is denied with the exact message before any AI/provider call, (b) the gate cannot be bypassed by calling the API directly, and (c) a qualified user gets through with GPT-OSS as the selected model. No code changes; record results in the PR description.

**Files:**
- None created/modified (verification only). Optionally save evidence screenshots under the job tmp dir, not the repo.

**Interfaces:**
- Consumes: running backend (`cd backend && npm run dev`, port 5000 — dev mode without `REDIS_URL` runs jobs inline, so route responses complete synchronously) and frontend (`cd frontend && npm run dev`, port 3000). MCP Playwright tools: `mcp__playwright__browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_network_requests`, `browser_run_code_unsafe`, `browser_take_screenshot`.

- [ ] **Step 1: Start both processes**

```bash
cd backend && npm run dev     # run_in_background
cd frontend && npm run dev    # run_in_background
```

Wait for `http://localhost:5000/health/live` to return 200 and Vite to report port 3000.

- [ ] **Step 2: Create an unqualified user**

Via Playwright: `browser_navigate` to `http://localhost:3000/register` (if the route differs, start at `/login` and follow the sign-up link in the snapshot). Register a fresh user (e.g. `gate-test-<timestamp>@example.com`). Create one project with **only a title** (Dashboard → new project) — completeness score 0.

- [ ] **Step 3: UI breach attempt — Opportunity Finder**

Navigate to `http://localhost:3000/dashboard/ai-tools`, click **Opportunity Finder**, click the find/search button.

Expected: the red `ErrorCard` appears containing the full gate message ("You need at least one project that is at least 50% complete…"). Via `browser_network_requests`: `POST /api/integrations/opportunity-finder` returned **403** (not 202 — no job was created). Backend dev log shows **no** AI-provider fetch and no job execution.

- [ ] **Step 4: UI breach attempt — AI Portfolio Match**

Click Back → **AI Portfolio Match**, paste `https://example.com/internship`, click analyze.

Expected: same 403 + gate message in the `ErrorCard`; no job, no provider call.

- [ ] **Step 5: Direct-API breach attempts (bypassing the UI)**

Run in the page context with `mcp__playwright__browser_run_code_unsafe` (the JWT lives in `localStorage.token`):

```js
const token = localStorage.getItem('token');
const results = {};
for (const [name, path, body] of [
  ['aiMatch', '/api/integrations/ai-match', { url: 'https://example.com/job' }],
  ['finder', '/api/integrations/opportunity-finder', { filters: { types: ['internship'] } }],
]) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  results[name] = { status: res.status, body: await res.json() };
}
return results;
```

Expected: both entries have `status: 403` and `body.code === 'AI_TOOLS_PROJECT_GATE'`. This proves the gate is server-side, not a UI nicety.

- [ ] **Step 6: Qualify the user and verify the tools open up**

In the UI, edit the bare project: add a tagline, a short description, two technologies, and a GitHub URL (15+10+15+15 = 55 ≥ 50). Re-run both tools.

Expected: no gate message. `POST` now returns **202** with a `job_id` (route middleware passed). If AI provider keys are configured in `backend/.env` (`ENABLE_NVIDIA_MODELS=true` + `NVIDIA_API_KEY`), the tool completes and the result meta reports model `nvidia:gpt-oss-20b` (check the job result payload in `browser_network_requests`, or the backend log line for the provider call — it should hit `integrate.api.nvidia.com` with `openai/gpt-oss-20b`). If no keys are configured, a `MODEL_DISABLED`/failure response is acceptable **for the gate test** — it still proves the request passed the gate — but the model-default check then requires keys.

- [ ] **Step 7: Fallback verification (NVIDIA-direct off → Nemotron)**

Stop the backend, unset `ENABLE_NVIDIA_MODELS` (or `NVIDIA_API_KEY`) while keeping `ENABLE_OPENROUTER_MODELS=true` + `OPENROUTER_API_KEY`, restart, and re-run one tool as the qualified user.

Expected: the provider call goes to OpenRouter with `nvidia/nemotron-3-super-120b-a12b` — GPT-OSS unavailable falls back to Nemotron. Restore the original env afterwards.

- [ ] **Step 8: Record results**

Summarize each breach attempt (step, expected, observed, pass/fail) in the PR description. Any observed bypass (a 202 or provider call for the unqualified user) is a blocking failure — fix before merge.

---

## Self-Review Notes

- **Spec coverage:** gate for both tools before AI spend (Tasks 1-2), exact denial message centralised in one constant with the cut-off-copy assumption flagged (Global Constraints), gptOSS default + NVIDIA/Nemotron fallback (Task 3), message actually visible to users (Task 4), live breach tests via MCP Playwright (Task 5).
- **Known assumption:** the gate message wording — confirm with the user; changing it later touches only `AI_TOOLS_GATE_MESSAGE` and the two test files that assert on it (`projectCompleteness.test.js` regex, `AIToolsPage.gate.test.jsx` constant).
- **Type consistency check:** `hasQualifiedProject(userId, { minScore, queryFn })` is used with that exact signature in Tasks 1, 2; `requireQualifiedProject(checkFn?)` factory shape matches between Task 2 impl and tests; error body `{ error, code: 'AI_TOOLS_PROJECT_GATE' }` is identical in Tasks 2, 4, 5.
- The worker job path (`invokeIntegrationHandler`) builds `req.user` from the users table, so the handler-level check works for jobs too.
