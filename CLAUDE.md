# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ProjectFolio is a portfolio platform for engineering/science students: a block editor for project pages, public portfolio URLs, PDF/JSON export, a "Discover" social feed, team profiles, and an AI agent that can redesign a user's public site. Frontend and backend are separate npm projects (`frontend/`, `backend/`) with no root-level package manifest tying them together — always `cd` into the relevant one before running scripts.

## Commands

### Backend (`backend/`)
- `npm run dev` — start API with nodemon (port 5000 by default)
- `npm start` — start API without nodemon
- `npm run worker` — start the BullMQ background job worker (separate process from the API)
- `npm run db:migrate` — apply pending SQL migrations from `migrations/` (idempotent, advisory-locked)
- `npm run db:retry-warnings` — re-run migration statements that failed earlier due to ownership issues (requires `MIGRATION_DATABASE_URL` for an owner-level Postgres URL)
- `npm run db:seed` / `npm run db:seed:test-portfolio` — seed data
- `npm test` — runs the full Node test suite (`node --test`) against a fixed list of files in `test/`
- To run a single test file: `node --test test/siteAgent.test.js` (swap in any file under `backend/test/`)
- `npm run test:agent-browser` — Puppeteer-based browser verification tests (separate from `npm test`)
- `npm run verify:scalability` / `npm run test:load` — load/scalability checks against a running instance
- `npm run verify:agent-live` / `npm run verify:agent-quality` — live-route and quality-gate checks for the AI site agent

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server on port 3000, proxies `/api` to `VITE_API_PROXY_TARGET` (default `http://localhost:5000`)
- `npm run build` — production build
- `npm run preview` — preview a production build
- `npm test` — Vitest (jsdom + Testing Library); test files are colocated as `src/**/*.test.{js,jsx}`, setup in `src/test/setup.js`
- To run a single test file: `npx vitest run src/pages/TeamsPage.menu.test.jsx`
- `npx eslint .` — lint (config in `eslint.config.js`, includes `eslint-plugin-security`)

The `@` import alias resolves to `frontend/src/` (configured in both `vite.config.js` and `vitest.config.js`).

## Architecture

### Two independently deployed processes + a worker
`backend/server.js` is the Express API. `backend/worker.js` is a standalone BullMQ worker process (`npm run worker`) that consumes the same Postgres/Redis as the API but is deployed separately — it also runs periodic maintenance (analytics partition creation, revision/job retention cleanup, trending-score recalculation) on an internal timer, not via cron. Jobs are enqueued via `jobs/service.js` and executed by `jobs/processors.js`. Route handlers that need long-running work (e.g. AI/browser verification) enqueue a job rather than doing it inline.

Redis is optional in development but **required in production** — the server refuses to boot in production without `REDIS_URL`, and without distinct `JWT_SECRET`/`SESSION_SECRET`/`METRICS_TOKEN`. Redis backs sessions (`connect-redis`), rate limiting (`rate-limit-redis`), and the job queue.

### Auth model
Two parallel auth mechanisms are active simultaneously: stateless JWT bearer tokens (`middleware/auth.js`, used for most `/api/*` routes) and cookie-based Passport sessions (Google OAuth / OpenID Connect, `config/passport.js`, used for the OAuth login flow). JWTs carry a `tokenVersion` that is checked against `utils/authTokenVersion.js` on every request so tokens can be invalidated server-side (e.g. on password change) without a blocklist.

### Migrations
SQL files in `backend/migrations/NNN_description.sql` are applied in order by `config/runMigrations.js`, tracked in a `schema_migrations` table, and advisory-locked so concurrent deploys don't race. Some migrations contain non-transactional statements (e.g. `CREATE INDEX CONCURRENTLY`) that can fail with a Postgres ownership error (`42501`) under a non-owner role; these are recorded in `schema_migration_warnings` instead of failing the deploy, and `/health/ready` reports `ready_with_warnings` until `db:retry-warnings` is run with an owner URL. Do not hand-edit already-applied migration files — add a new numbered file instead.

### AI site agent (the most complex subsystem)
`backend/utils/siteAgent.js` (~150KB) is the core of an AI agent that can redesign a user's public portfolio: it plans changes, generates HTML/CSS/JS or structured settings patches, and produces change sets that can be previewed and rolled back. Supporting modules:
- `utils/siteAgentPlanner.js` — validates/normalizes the agent's design brief, site plan, and design-system output before it's applied
- `utils/aiCustomizer.js` — parses/merges AI responses into portfolio customization fields, validates against `VALID_ANIMATIONS`/`VALID_THEME_KEYS`
- `utils/layeredCustomization.js` — merges manual user customization with agent-applied customization in layers (manual settings take precedence unless a prompt is an explicit redesign); tracks `agent_design_meta` so agent changes are attributable and revertible
- `utils/customSiteSecurity.js` — sanitizes/deny-lists agent- or user-authored custom HTML/CSS/JS before it's ever served publicly (blocks `<script>`, inline event handlers, `eval`, storage/network APIs, parent-window access, etc.) — treat any change here as a security-sensitive change
- `utils/portfolioAiContext.js` — builds the context payload (existing portfolio state) fed to the AI model
- `utils/agentBrowserVerifier.js` — Puppeteer-driven verification that agent-generated sites actually render correctly
- `routes/agent.js` (~100KB) — HTTP surface for all of the above

The agent writes into a fixed inventory of stable CSS class names (`PROJECTFOLIO_SURFACE_INVENTORY` in `layeredCustomization.js`, e.g. `.pf-header`, `.pf-project-card`) — these class names are a public contract between the React components (`frontend/src/pages/PublicPortfolioPage.jsx` etc.) and agent-generated CSS; renaming them breaks existing customizations.

### Custom-site sandbox origin
User-authored custom sites (HTML/CSS/JS, the `custom_site_*` columns / `PUT /settings/custom-site`) are executable and are contained by origin isolation, not just input filtering. The executable document (`GET /api/portfolio/:username/custom-site`, built in `utils/customSiteSecurity.js`) is served **only** from the dedicated sandbox origin `CUSTOM_SITE_SANDBOX_ORIGIN`; requests that reach it on the app's own host are 302-redirected there (`config/customSite.js` → `sandboxRedirectTarget`). This keeps author JS off the app's credentialed origin so a filter bypass can't read the `localStorage` JWT. The frontend frames it via `VITE_CUSTOM_SITE_ORIGIN` (`utils/customSiteSrc.js`) with `sandbox="allow-scripts"` and **never** `allow-same-origin`; `server.js` helmet CSP adds `frame-src` for the sandbox origin, and the served doc's CSP sets `frame-ancestors` to the app origins (`frameAncestorsValue`). Defense-in-depth layers on top: the regex deny-list + parser-based `sanitizeCustomSiteHtml` (allow-list, `sanitize-html`) and the strict nonce CSP. When the env vars are unset (dev) the system falls back to same-origin serving with `frame-ancestors 'self'`. Deploying the sandbox origin requires DNS + TLS for the hostname. Containment is proven by `npm run test:sandbox-smoke`. Step-by-step production rollout (beginner-friendly) is in `DEPLOYMENT.md`.

### Frontend structure
`frontend/src/pages/` holds route-level components (some, like `PortfolioSettingsPage.jsx` and `PublicPortfolioPage.jsx`, are very large — check for an existing subsection before adding a new one rather than growing the file further). `frontend/src/components/` is organized by feature area (`discover/`, `editor/`, `portfolio/`, `shared/`). Vite's build config manually chunks vendor code by feature (TipTap editor, CodeMirror, charts, drag-drop, motion, etc.) in `vite.config.js` — new heavy dependencies should generally be added to an existing chunk group or given their own to avoid bloating the main bundle.

### Health/readiness
`/health/live` is a pure liveness check. `/health/ready` checks migration state and Redis connectivity and is what should back load-balancer/orchestrator readiness probes — it can report `ready_with_warnings` (see migrations above) which is only treated as fatal when `MIGRATION_WARNINGS_FATAL=true`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
