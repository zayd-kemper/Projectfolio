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

- `useDarkMode` toggles `dark` on `<html>`; the `.app-surface` class (on `DashboardLayout`, `DashboardShellSkeleton`, and DiscoverPage's root) scopes where dark token values apply. Public pages never carry `.app-surface` and stay light.
- **Compatibility shim** (`globals.css`, marked block): remaps raw Tailwind classes (`.text-gray-900`, `.bg-gray-50`, ...) inside `.dashboard-root` for pages not yet migrated. When you touch a page, convert its raw grays/blues to token utilities; when a raw class is no longer used inside dashboard pages, delete its shim line. Do not add new shim lines. The shim and `dashboard-root` are deleted entirely after PortfolioSettingsPage is migrated.
- Semantic state colors (emerald success, amber warning) currently keep explicit `dark:` variants — acceptable until success/warning tokens are added.

## Typography

- One family: **DM Sans** for everything in product UI (headings, labels, body, buttons). JetBrains Mono for counts, code, technical metadata. No display/serif fonts in app UI.
- Fixed rem scale, ratio ~1.2: `text-xs` (metadata) → `text-sm` (body/controls) → `text-lg` (card titles) → `text-xl`/`text-2xl` (page titles via `.page-title`).
- Weights: `font-semibold` is the strong weight for UI text; `font-medium` for labels; `font-bold` reserved for rare true emphasis, never on small text.
- No uppercase tracked eyebrows/kickers.

## Component vocabulary

CSS classes in `globals.css @layer components` — use these before writing ad-hoc styles:

- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` (all have hover/active/disabled states built in)
- Surfaces: `.card`; add `.card-interactive` **only on clickable cards** (hover lift + `shadow-lift`)
- Lists: `.row-hover` for hoverable rows
- Forms: `.form-input`, `.form-textarea`, `.form-label`
- Nav: `.nav-item` (+ `.active`)
- Text: `.page-title`, `.page-subtitle`, `.badge`, `.tech-tag`
- Loading: `.skeleton-shimmer` on skeleton blocks (replaces `animate-pulse` + gray fills)

Shared React primitives in `frontend/src/components/shared/`:
- `ui.jsx`: `Avatar`, `IconPill`, `Metric`, `EmptyState`
- `format.js`: `cx`, `formatCount`
- `EngineeringIcon.jsx`: the only icon system — named SVG tokens, never emoji
- `Skeleton.jsx`: page-level loading regions

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

- Tokenized: globals.css component classes, DashboardLayout shell, Skeleton shell, all of `components/discover/` + DiscoverPage.
- Pending (still on raw classes + shim): Dashboard, Settings cluster, Analytics, MediaLibrary, AITools, Teams pages, ProjectEditor, PortfolioSettingsPage (largest; migrates last and retires the shim).
