# DESIGN.md

Visual system for ProjectFolio's product UI (dashboard, settings, editors, Discover). Public portfolio pages are user-themed and follow their own customization engine; this document governs the app itself. See PRODUCT.md for brand personality and anti-references.

## Design tokens

Tokens are CSS custom properties holding RGB triplets, defined in `frontend/src/styles/globals.css` and mapped into Tailwind in `frontend/tailwind.config.js`. Light values live on `:root`; dark values flip under `.dark .app-surface`. One utility class is correct in both themes — **never write `dark:` variants for colors covered by tokens.**

| Token | Utility | Light | Dark | Use for |
|---|---|---|---|---|
| `--surface-page` | `bg-surface-page` | gray-50 | `#0f1117` | page background |
| `--surface` | `bg-surface` | white | `#1a1d27` | cards, panels, inputs |
| `--surface-muted` | `bg-surface-muted` | gray-100 | `#22263a` | hovers, wells, segmented controls |
| `--surface-rail` | `bg-surface-rail` | white | `#13151f` | sidebars, sticky top bars |
| `--line` | `border-line` | gray-200 | `#2d3148` | default borders |
| `--line-subtle` | `border-line-subtle` | gray-100 | `#1e2130` | row dividers |
| `--ink` | `text-ink` | gray-900 | `#f1f5f9` | primary text |
| `--ink-secondary` | `text-ink-secondary` | gray-700 | `#cbd5e1` | labels, secondary text |
| `--ink-muted` | `text-ink-muted` | gray-500 | `#94a3b8` | metadata, helper text |
| `--ink-faint` | `text-ink-faint` | gray-400 | `#5a6480` | placeholders, disabled |
| `--accent` | `bg-accent` | blue-600 | `#1d4ed8` | primary action fills |
| `--accent-hover` | `bg-accent-hover` | blue-700 | `#1e40af` | action hover |
| `--accent-text` | `text-accent-text` | blue-700 | `#60a5fa` | accent-colored text/links |
| `--accent-surface` | `bg-accent-surface` | blue-50 | `#1e2a4a` | selected/active fills |
| `--accent-border` | `border-accent-border` | blue-100 | `#1e3a6e` | selected/hover borders |
| `--danger` | `bg-danger` / `text-danger` | red-600 | red-600 | destructive actions |

Opacity modifiers work (`bg-surface/60`, `ring-accent/30`).

### Dark-mode mechanism

- The persisted theme is stamped on `<html>` at bootstrap in `main.jsx` (before first paint), so refreshes and deep links render dark without waiting for a layout hook; `useDarkMode` keeps it in sync afterward. The `.app-surface` class (on `DashboardLayout`, `DashboardShellSkeleton`, DiscoverPage's root, and ProjectEditorPage's root) scopes where dark token values apply, and also sets `color: rgb(var(--ink))` plus `color-scheme: dark` so unclassed text and native controls resolve correctly. Public pages never carry `.app-surface` and stay light.
- **Portaled content (dialogs, popovers) mounts on `<body>`, outside the app shell — it must carry `app-surface` on its content root** or its token utilities stay light in dark mode. `ConfirmDialog` and the Teams create dialog already do this.

### shadcn bridge

The shadcn/base-ui kit in `frontend/src/components/ui/` consumes semantic vars (`--popover`, `--border`, `--ring`, `--primary`, …) that are **bridged onto the project tokens** in `globals.css` (`--popover: rgb(var(--surface))`, `--ring: rgb(var(--accent))`, etc.), so ui components and the token vocabulary share one source of truth and self-flip under `.app-surface`. Exception: shadcn's `--accent` (its subtle hover fill) is deliberately **not** defined — the project's action-blue `--accent` owns that name; ui components wanting a quiet hover fill use `surface-muted`. The `--chart-*` oklch palette (used by `components/charts/`) keeps its own light/dark values. Note: the ui kit's Tailwind-v4-syntax variants (`data-open:`, `ring-3`) are inert under the project's Tailwind 3 build — behavior (focus trap, Escape, aria) still works; style dialog content with token classes.
- The legacy raw-class compatibility shim and the `dashboard-root` class are **gone** — every app surface uses token utilities directly. Never reintroduce raw `text-gray-*` / `bg-gray-*` / blue-accent classes inside app UI.
- Semantic state colors (emerald success, amber warning, red danger states) keep explicit `dark:` variants — acceptable until success/warning tokens are added. Deliberately theme-independent chrome (image scrims, dark code `<pre>` blocks, the device-preview mockup) keeps literal colors.

## Typography

- One family: **DM Sans** for everything in product UI (headings, labels, body, buttons). JetBrains Mono for counts, code, technical metadata. No display/serif fonts in app UI.
- Fixed rem scale, ratio ~1.2: `text-xs` (metadata) → `text-sm` (body/controls) → `text-lg` (card titles) → `text-xl`/`text-2xl` (page titles via `.page-title`).
- Weights: `font-semibold` is the strong weight for UI text; `font-medium` for labels; `font-bold` reserved for rare true emphasis, never on small text.
- No uppercase tracked eyebrows/kickers.

## Component vocabulary

CSS classes in `globals.css @layer components` — use these before writing ad-hoc styles:

- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` (all have hover/active/disabled states built in, plus a 2px accent `focus-visible` outline — `.btn-danger` is for destructive actions only, never Sign out)
- Surfaces: `.card`; add `.card-interactive` **only on clickable cards** (hover lift + `shadow-lift`)
- Lists: `.row-hover` for hoverable rows
- Forms: `.form-input`, `.form-textarea`, `.form-label`
- Nav: `.nav-item` (+ `.active`)
- Text: `.page-title`, `.page-subtitle`, `.badge`, `.tech-tag`
- Loading: `.skeleton-shimmer` on skeleton blocks (replaces `animate-pulse` + gray fills)

Shared React primitives in `frontend/src/components/shared/`:
- `ui.jsx`: `Avatar`, `IconPill`, `Metric`, `EmptyState`
- `format.js`: `cx`, `formatCount`
- `EngineeringIcon.jsx`: the only icon system — named SVG tokens, never emoji, never literal "x" text glyphs (use `name="close"`)
- `Skeleton.jsx`: page-level loading regions
- `ConfirmDialog.jsx`: the one confirmation pattern for destructive actions — built on `ui/alert-dialog` (focus trap, Escape, `aria-modal`), token-styled. **Never use `window.confirm()`.** (PortfolioSettingsPage still has legacy `confirm()` calls pending its section extraction.)
- `BrandMarks.jsx`: `GoogleMark`, `LinkedInMark` — self-hosted OAuth provider SVGs; never hotlink favicons or fake logos with styled text

Toasts (`react-hot-toast`, configured in `main.jsx`): 4s default, 6s errors. Per-user accent colors appear only in avatars/covers — interactive chrome (e.g. Follow buttons) always uses the system accent.

Discover-specific: `ProjectMiniCard`, `PortfolioCard` stay in `components/discover/DiscoverPrimitives.jsx`.

## Depth & motion ("alive" without noise)

Motion conveys state; decoration is banned. Vocabulary:

- Timing: 150–250 ms; easings `ease-out-quart` / `ease-out-expo` (Tailwind utilities and `var(--ease-out-quart)`)
- Elevation: `shadow-sm` resting → `shadow-lift` on hover of interactive cards → `shadow-pop` for overlays (dropdowns, modals)
- Global: buttons/links/inputs already transition color/shadow/transform; buttons compress on `:active`
- Hover lift (`.card-interactive`): translate ≤ 2px, only on elements that navigate or open something
- Loading: `.skeleton-shimmer`, not spinners inside content
- Entrances: stagger within one list is fine; identical entrance on every section is not. No orchestrated page-load choreography.
- Every animation respects `prefers-reduced-motion` (global kill switch in globals.css zeroes animation and transition durations; framer-motion code must check `useReducedMotion`).

## Layout & spacing

- Radius ceiling: `rounded-xl` for cards/modals, `rounded-lg` for controls. Never `rounded-2xl`/`rounded-3xl`.
- Nested cards are wrong — flatten with dividers (`border-line-subtle`) and spacing; rails use divider sections, not cards inside cards.
- Density is a feature in product UI. Prefer grouped list rows over grids of identical cards.
- z-index scale: dropdown 10 → sticky 30 → modal backdrop 50 → toast/tooltip above. No arbitrary 999s.

## Bans

Side-stripe accent borders (>1px left/right color); gradient text; glassmorphism as decoration; hero-metric template; identical icon+heading+text card grids; uppercase tracked eyebrows; numbered section scaffolding; emoji as icons anywhere in app UI; decorative motion; display fonts in UI labels; `dark:` color variants where a token exists.

## Migration status

- **All app surfaces tokenized**; shim retired. Semantic state colors and intentional theme-independent chrome are the only remaining literal colors.
- **Portfolio Studio is the one design destination** (`pages/PortfolioStudioPage.jsx`, route `/dashboard/portfolio`): left column with a Chat|Controls segmented switch (URL `?mode=chat|controls&section=…`, last-used mode persisted in localStorage), live-preview iframe right (desktop/mobile toggle; re-keys after agent apply/revert and manual saves via the `onSaved` prop on `PortfolioSettingsPage`), layering status bar under the column. Chat mode hosts `AgentWorkspace` (`compact`); Controls mode embeds `PortfolioSettingsPage noLayout` (URL pills `?section=appearance|sections|seo|custom-code` unchanged). The agent subsystem lives in `components/site-agent/` — `AgentWorkspace.jsx`, `useSiteAgent.js` (orchestration hook), `customSitePreview.js`. Nav: `Portfolio` (was Site Agent) and `Opportunities` (was AI Tools). Settings holds Profile + Account only; `/dashboard/agent`, `/dashboard/portfolio-settings`, and `settings?tab=portfolio` all redirect into the studio (section preserved). `SiteAgentPage.jsx` was removed.
- **Custom-code sites are origin-isolated.** The `custom-code` section's HTML/CSS/JS renders as a standalone executable document served only from the dedicated sandbox origin (`CUSTOM_SITE_SANDBOX_ORIGIN`), framed via `VITE_CUSTOM_SITE_ORIGIN` (`utils/customSiteSrc.js`) with `sandbox="allow-scripts"` and never `allow-same-origin`. Author JS therefore never runs on the app's credentialed origin. The in-studio live preview (`customSitePreview.js`) mirrors the production nonce-CSP including `frame-ancestors`. See CLAUDE.md → "Custom-site sandbox origin".
- Remaining refactor (mechanical): extract each pill group's JSX from PortfolioSettingsPage (~1,800 lines) into `components/portfolio-settings/` panel files; TeamDetailPage section extraction + member presence/activity signals. Move JSX verbatim, one section per commit, build between commits. The agent change-set review panels still use viewport-based `lg:grid-cols-2` grids that cramp in the compact column — switch to `compact`-aware or container-query layouts when touched.
