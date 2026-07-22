# ponytail-audit — 2026-07-21

Repo-wide over-engineering audit. Scope: redundancy and dead weight only — correctness, security, and perf routed to a normal review pass. Every finding below was verified by import/require tracing (including dynamic `import()`), not just package.json reading. Playwright was not needed: nothing here changes runtime behavior, so the existing test suites are the verification gate.

**Headline: ~21,700 lines and 28 dependencies are deletable, plus ~26 MB of build artifacts tracked in git. The single biggest item is a 14,361-line chart system with zero importers.**

---

## Findings (ranked, biggest cut first)

1. `delete:` **`frontend/src/components/charts/` — entire custom visx chart system, ~95 files, 14,361 lines, ZERO importers.** The two pages that render charts (`AnalyticsPage.jsx`, `TeamDetailPage.jsx`) import `recharts` directly and never touch this directory. Replacement: nothing. [frontend/src/components/charts/]
2. `delete:` **10 `@visx/*` packages + `d3-array` + `d3-sankey` + `d3-shape`** — only consumers are the dead charts directory (verified: zero `@visx`/`d3-` imports outside it). Replacement: nothing. [frontend/package.json]
3. `yagni:` **~54 of 58 shadcn components in `frontend/src/components/ui/` are unimported — 6,265 lines.** External consumers exist only for `alert-dialog` (1), `dialog` (2), `tooltip` (1); keep those + `button` (their internal dep). The app's real UI kit is `components/shared/ui.jsx`. Delete the rest. [frontend/src/components/ui/]
4. `delete:` **`graphify-out/` is tracked in git: 132 files, 23 MB**, including five dated snapshot dirs and a cache. Gitignore it (or at minimum the snapshots + cache), `git rm -r --cached graphify-out`. [graphify-out/]
5. `delete:` **6 deps that exist only for dead ui/charts files:** `cmdk` (ui/command), `embla-carousel-react` (ui/carousel), `input-otp` (ui/input-otp), `react-day-picker` (ui/calendar), `react-resizable-panels` (ui/resizable), `@number-flow/react` (charts). All have zero consumers outside files deleted in #1/#3. [frontend/package.json]
6. `delete:` **`react-beautiful-dnd` — zero imports.** The codebase already migrated to its fork `@hello-pangea/dnd` (3 files). Also remove its `manualChunks` mention. [frontend/package.json, frontend/vite.config.js:29]
7. `delete:` **`framer-motion` — 1 leftover import** (`main.jsx:8`) while 34 files use its successor `motion/react` (same API, drop-in). Change the one import, delete the dep and the `manualChunks` line. [frontend/src/main.jsx:8, frontend/vite.config.js:28]
8. `delete:` **`@tanstack/react-query` — a `QueryClientProvider` wrapping an app with zero `useQuery`/`useMutation` calls anywhere.** All data fetching goes through `utils/api.js`. Delete provider + dep. [frontend/src/main.jsx:11]
9. `delete:` **`sonner` + `next-themes` — toast system with zero consumers.** `react-hot-toast` is the real one (22 files); `sonner`/`next-themes` are only referenced by unused `components/ui/sonner.jsx` (deleted in #3). [frontend/package.json]
10. `delete:` **`shadcn` in `dependencies` — it's a CLI, zero imports.** Run it with `npx shadcn` when needed. [frontend/package.json:61]
11. `delete:` **`tailwindcss-animate` — not registered in `tailwind.config.js`;** `globals.css` imports `tw-animate-css` instead. One of the pair is dead — keep `tw-animate-css`, drop `tailwindcss-animate`. [frontend/package.json]
12. `delete:` **backend `openid-client` — zero requires and zero dynamic imports.** LinkedIn OIDC uses `passport-openidconnect`; Google uses `passport-google-oauth20`. [backend/package.json:42]
13. `delete:` **legacy schema scripts, 647 lines:** `config/migrate.js` (310, the `db:migrate:legacy` path superseded by `runMigrations.js`), `config/migrate_discover.js` (54), `config/migrate_posts.js` (66), `config/ensureAgentSchema.js` (121), `config/ensurePortfolioCustomizerSchema.js` (96). The scalability test *asserts server.js does not use the ensure files* — they're required by nothing. Drop the `db:migrate:legacy` npm script too. [backend/config/]
14. `delete:` **`backend/config/useDarkMode.jsx` — a React hook in the backend config directory,** required by nothing (the real one lives in `frontend/src/hooks/`). [backend/config/useDarkMode.jsx]
15. `delete:` **root-level shadcn scaffold created by accident:** `src/` (button.jsx, use-mobile.js, utils.js — 82 lines, 3 tracked in git), `package.json` (contents: `{}`), `package-lock.json`, empty `node_modules/`, `jsconfig.json`. The real frontend has its own copies. [/src, /package.json, /jsconfig.json]
16. `delete:` **`~/` directory in repo root** — accidental unexpanded-tilde artifact, empty. Remove with `rmdir "./~"` (never `rm -rf ~`). [/~]
17. `delete:` **`backend/backend/` — empty nested directory.** [backend/backend/]
18. `delete:` **9 screenshot PNGs tracked in repo root (929 KB)** (`theme-dark.png`, `merged-sidebar-*.png`, etc.) — session artifacts, not app assets. [/*.png]
19. `delete:` **`.playwright-mcp/` tracked in git — 67 files, 662 KB** of page snapshots and test PDFs. Gitignore + `git rm -r --cached`. [.playwright-mcp/]
20. `delete:` **`scratchpad/` tracked in git — 1.3 MB** of advisor screenshots and one-off verify scripts. Gitignore + untrack. [scratchpad/]
21. `delete:` **`frontend/src/components/shared/desktop.ini` — Windows Explorer junk, tracked.** Add `desktop.ini` to `.gitignore` next to `Thumbs.db`. [frontend/src/components/shared/desktop.ini]
22. `delete:` **`migration_phase3.sql` in repo root — referenced by nothing;** migrations live in `backend/migrations/`. [/migration_phase3.sql]
23. `delete:` **root `scripts/` — 244 lines of one-time icon generation/migration scripts** (`generate-engineering-icons.js`, `migrate-engineering-icons.js`), referenced nowhere. [/scripts/]
24. `delete:` **`frontend/src/components/shimmering-text.jsx` (62 lines)** — only importer is the dead charts directory. [frontend/src/components/shimmering-text.jsx]
25. `yagni:` **two validation stacks in the backend:** `express-validator` is used by exactly one route (`routes/auth.js`) while everything else uses the in-house `middleware/schemaValidation.js`. Port auth's checks, drop the dep. [backend/routes/auth.js]
26. `native:` **`axios` serves 2 files** (`utils/api.js`, `utils/uploadMedia.js`). Native `fetch` + a ~60-line wrapper covers the interceptor/refresh-replay logic and cuts ~30 KB from the main bundle. Optional — the wrapper does real work today. [frontend/src/utils/api.js]
27. `native:` **`date-fns` (8 files) mostly does `format`/`parseISO`** — `Intl.DateTimeFormat` and `new Date(iso)` cover the common cases. Low priority; v4 tree-shakes well. [frontend/src/]
28. `delete:` **local disk debris (not in git):** `backend/agent-live-verify-server*.log` (85 KB, May 31), stale `.claude/worktrees/fixes-analytics-onboarding-advisor/` with duplicate graphify snapshots (`git worktree prune` first). [backend/, .claude/worktrees/]
29. `shrink:` **`vite.config.js` `manualChunks`** — after deps are gone, remove the `framer-motion`, `react-beautiful-dnd` branches; the `recharts`/`d3-` chunk stays (recharts remains for the two analytics pages). [frontend/vite.config.js:27-29]

Out of scope but observed: `siteAgent.js` (3,235 lines), `routes/agent.js` (2,507), `PortfolioSettingsPage.jsx` (1,830) are complexity hotspots, and an AgentWorkspace extraction is already in progress on the wip commit — finish that refactor before growing any of them.

---

## Remediation plan (ordered, each phase independently shippable)

Run the full gate after every phase: `cd frontend && npx eslint . && npm test && npm run build`, and `cd backend && npm test`.

### Phase 1 — repo hygiene (zero code risk, ~26 MB off the repo)
1. Append to `.gitignore`: `graphify-out/`, `.playwright-mcp/`, `scratchpad/`, `desktop.ini`, `*.png` at root (or move wanted screenshots into `docs/assets/`).
2. `git rm -r --cached graphify-out .playwright-mcp scratchpad` ; `git rm frontend/src/components/shared/desktop.ini migration_phase3.sql *.png`
3. Delete the root scaffold: `git rm -r src package.json package-lock.json jsconfig.json` (root copies only — verify paths before running), remove empty root `node_modules/`.
4. `rmdir "./~"` ; `rmdir backend/backend` ; `del backend\agent-live-verify-server*.log` ; `git worktree prune` then remove the stale `.claude/worktrees/` dir.
5. `git rm -r scripts` (root icon scripts).
6. Commit. Note: files already in old commits keep the history size; that's fine — the working tree and future clones shallow-fetch smaller.

### Phase 2 — dead frontend code (the 20K-line cut)
1. `git rm -r frontend/src/components/charts frontend/src/components/shimmering-text.jsx`
2. In `frontend/src/components/ui/`, keep `alert-dialog.jsx`, `dialog.jsx`, `tooltip.jsx`, `button.jsx` (+ anything those four import — check their import lines before deleting); delete the other ~54 files.
3. Build + run vitest. Any missing-import error identifies a consumer the static scan missed — restore that one file, not the directory.

### Phase 3 — frontend dependency purge (26 deps)
1. `main.jsx`: change `from 'framer-motion'` → `from 'motion/react'`; delete the `QueryClient`/`QueryClientProvider` import and wrapper.
2. `npm uninstall @visx/curve @visx/event @visx/gradient @visx/grid @visx/group @visx/pattern @visx/responsive @visx/sankey @visx/scale @visx/shape d3-array d3-sankey d3-shape react-beautiful-dnd framer-motion sonner next-themes shadcn @tanstack/react-query @number-flow/react embla-carousel-react input-otp react-day-picker cmdk react-resizable-panels tailwindcss-animate`
3. Remove the `framer-motion` and `react-beautiful-dnd` lines from `manualChunks` in `vite.config.js`.
4. Full gate + `npm run build` and compare bundle output — expect a visibly smaller vendor chunk set.

### Phase 4 — backend cleanup
1. `git rm backend/config/migrate.js backend/config/migrate_discover.js backend/config/migrate_posts.js backend/config/ensureAgentSchema.js backend/config/ensurePortfolioCustomizerSchema.js backend/config/useDarkMode.jsx`
2. Remove the `db:migrate:legacy` script from `backend/package.json`; update the CLAUDE.md commands section to match.
3. `npm uninstall openid-client`
4. Port `routes/auth.js` from `express-validator` to `middleware/schemaValidation.js`, then `npm uninstall express-validator`.
5. `npm test` in backend (the scalability test that greps `server.js` still passes — it never required the deleted files).

### Phase 5 — optional native swaps (do only if touching these files anyway)
1. Replace `axios` with a fetch wrapper in `utils/api.js`/`uploadMedia.js` (preserve: base URL, timeouts via `AbortSignal.timeout`, bearer header, single-flight refresh replay).
2. Swap trivial `date-fns` `format`/`parseISO` calls for `Intl.DateTimeFormat`/`new Date()` where no format string gymnastics are involved.

### Production-readiness notes tied to this audit
- The removed deps shrink `npm ci` time, image size, and the audit surface for `npm audit` — this is the efficiency win, no behavior change.
- Keep: `recharts` (2 real pages), `@hello-pangea/dnd`, `react-hot-toast`, `@base-ui/react` + `clsx`/`tailwind-merge`/`class-variance-authority` (used by the 4 surviving ui components and shared kit), backend `remark`/`unified` stack (loaded via dynamic `import()` in `githubImport.js` — invisible to `require` greps, do NOT remove), `cookie-parser` (refresh-token cookie reads in `routes/auth.js`).
- After each phase, `graphify update .` to keep the graph current.

---

net: **-21,700 lines, -28 deps possible** (plus ~26 MB untracked from git; -30 deps with the optional Phase 5 swaps).
