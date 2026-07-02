# ProjectFolio AI Agent Capability Plan

## Goal

Turn the current ProjectFolio AI Editor into a true personal-site agent that can make both small code/effect changes and larger, distinctive website redesigns while staying compatible with ProjectFolio's existing customization system.

Native settings remain canonical. The agent should use `theme`, `accent_color`, `layout`, `section_order`, `section_config`, `site_sections`, `theme_overrides`, and `animations` first, then use custom CSS/JS as an advanced design layer.

## Current Capability Matrix

| Capability | Current State | Gap |
| --- | --- | --- |
| Natural language to UI | Partial. The agent can chat, propose change sets, patch settings/profile/projects/blocks, add custom sections, and generate CSS/JS. | It does not yet plan a complete page composition before generating changes. Large redesigns are still too dependent on one prompt response. |
| Persistent chat | Strong foundation. Threads, messages, model id, memories, and change sets are persisted. | Memory is not yet used as a structured design profile with durable preferences, dislikes, brand tone, and prior layout decisions. |
| Undo/revert | Strong foundation. Applied agent change sets capture rollback snapshots, show the revert point, warn that newer manual/AI edits may be affected, and can be reverted. | Revert is still bundle-level; future work could add per-action previews before restoring. |
| Multi-model architecture | Strong foundation. There is a registry, default Groq model, optional OpenRouter profiles, shared provider calling, and agent modes for auto, fast, design, code, and critic routing. | Future work still needs per-step planner/critic/model splitting and stronger provider-specific health checks. |
| Compatibility with manual settings | Good foundation. Agent actions patch existing settings and the public renderer consumes native settings plus custom code. | Need stronger two-way sync in the UI so users can see which manual controls were changed by an agent bundle. |
| Declarative site sections | Partial. `site_sections` supports text, feature grids, stats, timeline, gallery, testimonial, CTA, link list, and featured projects. | The section system lacks variants, layout presets, richer media treatment, reusable component patterns, and nested composition. |
| Design system intelligence | Weak-to-partial. Prompts and fallback designs include creative directions and theme overrides. | There is no first-class design-system object for tokens, spacing, typography scale, surfaces, radii, shadows, rhythm, and component variants. |
| Component-level reasoning | Partial. The agent can target `.pf-*` classes and patch projects/blocks. | It does not reason through reusable component anatomy or choose component variants from a registry. |
| UX/product thinking | Partial. The agent can add CTAs, sections, and reorder content. | It does not explicitly map user intent to audience, page goal, content hierarchy, conversion path, or information architecture. |
| Responsive design | Strong foundation. The public renderer and generated CSS can be responsive, and AI change sets now run browser-backed desktop/mobile checks before review. | The live-route check is best-effort after apply when the frontend is reachable; future CI should run the full app routes automatically. |
| Interaction design | Strong foundation. Native animations, guarded JS, and declarative interaction recipes support scroll reveal, card tilt, cursor glow, and ambient particles with predictable targets. | Future recipes should cover richer components such as carousels, sticky navigation, command palettes, and media interactions. |
| Accessibility | Partial. Renderer uses semantic-ish sections, validation blocks some unsafe code, and agent critique now checks design-token contrast plus motion load. | Still needs focus-state checking, alt-text requirements, keyboard interaction review, and browser-level accessibility smoke tests. |
| Visual quality | Improving. Fallback designs and prompts push beyond color swaps. | No visual critique step, novelty scoring, screenshot comparison, or design-quality rubric before the user sees the result. |
| Design-to-code conversion | Not implemented. | Future capability only. The current platform does not accept image/Figma references as structured input. |
| Full app generation | Intentionally constrained. ProjectFolio is a portfolio/site builder, not an arbitrary app generator. | Need to expand within platform boundaries: modular personal websites, rich project pages, landing-style sections, and interactive portfolio experiences. |

## Why Large Redesigns Still Feel Limited

The agent currently has the right persistence and safety architecture, but it lacks a middle layer between the user's intent and raw CSS/JS. For a complex prompt, it jumps too quickly from "make this look amazing" to a bundle of settings and styles.

The missing layer is a site composition engine:

- A design brief that captures audience, tone, purpose, visual direction, and constraints.
- A page plan that decides section order, section purpose, content hierarchy, and CTAs.
- A design system that defines tokens and component variants.
- A renderer contract that can express richer layouts declaratively.
- A critique loop that checks visual quality, responsiveness, accessibility, and compatibility.

Without that layer, the model can change colors and add effects, but it cannot reliably build a distinctive front end.

## Implementation Roadmap

### Phase 6: Agent Planning Pipeline

Add a structured planning step before the action bundle.

New internal response shape:

```json
{
  "designBrief": {
    "goal": "Portfolio goal",
    "audience": "Target audience",
    "tone": "Visual and writing tone",
    "styleDirection": "premium-studio | editorial | launch-page | neon-lab | terminal | gallery | custom",
    "constraints": ["Keep existing projects", "Prefer native settings"]
  },
  "sitePlan": {
    "sections": [
      {
        "id": "custom-impact",
        "role": "credibility",
        "type": "stats",
        "layoutIntent": "prove outcomes before projects"
      }
    ],
    "primaryCta": "View projects",
    "contentHierarchy": ["identity", "proof", "work", "contact"]
  },
  "designSystem": {
    "tokens": {},
    "components": {},
    "motion": {}
  },
  "actions": []
}
```

The backend should validate this plan, then convert it into existing `settings.patch`, `customization.patch`, and content actions.

### Phase 7: First-Class Design System

Add a `design_system` JSONB field to `portfolio_settings` or include it under `theme_overrides` if avoiding a new column.

Initial implementation status: started. `portfolio_settings.design_system` now exists as a durable JSONB field, agent design-system plans are persisted through `settings.patch`, and the public renderer maps design-system tokens to native CSS variables for background, surface, text, muted text, accent, radius, shadow, section gap, and content width.

Recommended v1 schema:

```json
{
  "version": 1,
  "direction": "editorial",
  "tokens": {
    "background": "#0f172a",
    "surface": "rgba(255,255,255,0.08)",
    "text": "#f8fafc",
    "muted": "#94a3b8",
    "accent": "#38bdf8",
    "radius": "18px",
    "shadow": "0 24px 80px rgba(15,23,42,.28)",
    "sectionGap": "96px",
    "contentWidth": "1120px"
  },
  "typography": {
    "headingScale": "display",
    "bodyDensity": "comfortable"
  },
  "componentVariants": {
    "projectCard": "glass-tilt",
    "skillTag": "pill-outline",
    "sectionHeading": "eyebrow-rule"
  }
}
```

The public renderer should translate this into CSS variables and classes. This makes big changes more reliable than asking the model to rewrite every selector.

### Phase 8: Section and Component Registry

Expand `site_sections` from simple content sections into a small declarative UI registry.

Initial implementation status: started. `site_sections` now supports sanitized `variant` and `layout` hints, and the public portfolio renderer maps those hints to richer section shapes. The next step is to broaden the registry and make variants configurable from the manual settings UI as well.

Fallback/template status: improved. Broad redesign fallbacks now choose direction-specific native section modules for neon systems labs, editorial case-study sites, launch pages, terminal workspaces, creative studios, and premium studios instead of always returning the same section stack.

Add section variants:

- `hero`: split, centered, editorial, terminal, launch, gallery.
- `featureGrid`: cards, Bento, icon rail, process grid.
- `stats`: compact row, editorial numbers, proof wall.
- `timeline`: vertical, horizontal, roadmap.
- `gallery`: masonry, carousel, spotlight.
- `testimonial`: quote card, quote wall.
- `cta`: banner, split, sticky footer.
- `featuredProjects`: grid, case-study list, horizontal scroll.

Each section should have:

```json
{
  "id": "custom-proof",
  "type": "stats",
  "variant": "editorialNumbers",
  "layout": {
    "columns": 3,
    "density": "comfortable",
    "emphasis": "high"
  },
  "content": {}
}
```

This gives the model real building blocks instead of forcing it to invent everything with CSS.

### Phase 9: UX and Visual Critique Loop

Before returning a change set, run a deterministic local critique.

Initial implementation status: started. The backend critique now checks broad redesign structure, site hierarchy, responsive CSS presence, core `.pf-*` targeting, design-token contrast for hex colors, and excessive motion/interaction stacking.

Checks:

- Native settings used before custom code.
- Section order has a clear hierarchy.
- Every custom section has a purpose and valid content.
- CSS targets only `.pf-*` classes after scoping.
- Required mobile rules exist for complex grids.
- Color contrast appears acceptable for key token pairs.
- Motion respects reduced-motion expectations.
- No unknown animation names or theme override keys.
- JS has cleanup/guard IDs and no load listeners.

Return concise feedback to the user:

- "First attempt had 2 validation issues; repaired automatically."
- "This redesign changes layout, adds 3 sections, updates project cards, and adds one ambient effect."
- "Warning: generated CSS is advanced and should be previewed before saving."

### Phase 10: Preview Quality Gates

Add browser-driven smoke checks for AI-generated bundles when running locally or in CI.

Initial implementation status: started. Agent change sets now run a Puppeteer-backed pre-apply browser smoke check against representative portfolio and project-page renders using the proposed settings, sections, design system, CSS, JS, theme overrides, and animations. If that pre-apply check fails and the AI provider is available, the backend feeds the concise browser errors back into one repair attempt before creating the review bundle. If the final reviewed bundle still has failed browser verification, the backend now discards it by default so a known-broken render does not become a pending but unusable review bundle. Set `AGENT_KEEP_FAILED_REVIEW_BUNDLES=true` only when debugging failed bundles. After a bundle is applied, the backend also attempts a live-route check against the actual `/dashboard/portfolio-settings`, `/:username`, and `/:username/:projectSlug` frontend pages when `FRONTEND_URL` is reachable. Results are stored in the change-set preview and shown in the settings UI. Applied bundles can also rerun live-route verification without reapplying changes, which helps when the frontend was not running during the original apply.

CLI verification status: started. The backend now includes `npm run verify:agent-live -- --username <username> --project <projectSlug>` for repeatable local/CI smoke checks against the real frontend routes. Passing `--token <jwt> --user-json <path>` also verifies the authenticated dashboard agent UI route. Passing `--screenshots <dir>` saves desktop/mobile PNG artifacts so local runs and CI can inspect what the browser actually rendered. Setting `AGENT_BROWSER_ARTIFACT_DIR` enables the same screenshot artifact trail for normal agent pre-apply and post-apply verification runs. The backend also includes `npm run verify:agent-quality -- --username <username> --project <projectSlug>` as a single reliability gate that runs syntax checks, backend agent/browser tests, and optional live-route browser verification.

Minimum checks:

- `/dashboard/portfolio-settings` renders the agent UI. Started via authenticated live-route verification after apply.
- `/:username` renders after applying a change set. Started via best-effort live-route verification.
- Mobile viewport has no obvious horizontal overflow. Implemented for pre-apply and live-route checks.
- Desktop and mobile screenshots are nonblank. Implemented as screenshot-byte/entropy checks for browser runs, with optional PNG artifact persistence for local/CI verification.
- Project cards, header, custom sections, and contact section exist. Implemented for pre-apply checks; live-route checks verify the actual route's core selectors.
- Custom JS does not throw on first render. Implemented for pre-apply harness checks and live-route console/page error capture. The verifier now classifies browser console output so real runtime errors fail the gate, unknown warnings stay concise, and known dev-only Vite/React warnings do not create false failures.

This is what will catch the gap between "valid JSON" and "actually looks right."

### Phase 11: Interaction Recipes

Move common effects from raw JS snippets into declarative recipes.

Initial implementation status: implemented foundation. `portfolio_settings.interactions` now stores safe native recipes, the public portfolio and project renderers support `scrollReveal`, `cardTilt`, `cursorGlow`, and `ambientParticles` without requiring model-generated JavaScript, and the AI review bundle shows the planned native recipes separately from raw custom code.

Examples:

```json
{
  "interactions": [
    { "type": "cardTilt", "target": ".pf-project-card", "strength": "subtle" },
    { "type": "scrollReveal", "target": ".pf-section", "stagger": 80 },
    { "type": "ambientParticles", "density": "low", "color": "accent" },
    { "type": "cursorGlow", "size": 180, "opacity": 0.18 }
  ]
}
```

The renderer can safely implement these once, instead of asking every model response to hand-code them.

### Phase 12: Model Routing

Keep Groq as the only enabled provider for now, but prepare for task-specific routing.

Future routing:

- Fast model: small CSS edits, copy tweaks, settings patches.
- Design model: design brief, site plan, UX reasoning.
- Code model: advanced CSS/JS bundle generation.
- Critic model or local evaluator: accessibility, responsiveness, design quality, compatibility.

Implementation status: implemented foundation. Agent chat requests now accept `mode`, the backend maps that mode to the best enabled model with compatible capabilities, and the frontend exposes mode selection separately from model preference. Groq remains the default callable provider, and OpenRouter can optionally enable the Qwen, Nemotron, Laguna, and Nex model profiles through one OpenAI-compatible adapter.

## Backend Work Items

1. Add a planner module, for example `backend/utils/siteAgentPlanner.js`.
2. Add schema validators for `designBrief`, `sitePlan`, and `designSystem`.
3. Convert validated plans into existing action types.
4. Add a design-system merger that preserves manual settings unless the user asked for a redesign.
5. Add local critique output to change set previews.
6. Add section variant validation and sanitization.
7. Add interaction recipe validation and renderer output.
8. Add tests for planner validation, section variants, design-system merging, and rollback after advanced bundles.

## Frontend Work Items

1. Show a "Design Plan" panel before the action review.
2. Show which native settings will change.
3. Show which sections will be added/reordered.
4. Show which custom CSS/JS blocks or interaction recipes will be added.
5. Add compact design-quality warnings to the existing feedback panel.
6. Add a "Revert" flow that previews the snapshot date and warns about newer edits. Implemented for applied AI bundles.
7. Extend the public renderer to support section variants and design-system tokens.

## Compatibility Rules

The agent must continue to follow these rules:

- Never mutate portfolio data during chat. Only applying a change set mutates data.
- Keep manual customization controls compatible with agent changes.
- Prefer native settings, sections, theme overrides, and animations before raw CSS/JS.
- Store raw code in marked blocks with stable ids.
- Keep rollback snapshots for applied change sets.
- Treat custom code as an advanced layer, not the primary site model.
- Do not edit auth, billing, private account fields, or unrestricted app routes.

## Expected End State

After these phases, a prompt like "make my portfolio feel like a cinematic product launch page for an AI engineer" should produce:

- A design brief with audience, tone, and page goal.
- A section plan with hero, proof, featured projects, technical strengths, and CTA.
- Native settings updates for layout, theme, ordering, and visibility.
- Custom sections with structured content and variants.
- Theme/design-system tokens for spacing, typography, surfaces, and shadows.
- Safe CSS for composition and visual quality.
- Optional safe interaction recipes or guarded JS.
- A concise review bundle with warnings and validation repairs.
- A reliable preview and one-click rollback after apply.

That is the difference between a code generator and a real ProjectFolio site agent.
