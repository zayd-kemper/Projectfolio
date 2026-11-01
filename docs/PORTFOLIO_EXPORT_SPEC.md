# Projectfolio — Portfolio File Export Specification

**Scope:** How Projectfolio generates a downloadable "binder-style" portfolio document from a user's profile + projects.
**Primary target:** students and early-career engineers/creatives submitting to employers, career fairs, grad school, and interviews.
**Primary output:** a paginated PDF. Secondary outputs defined in §13.
**Status:** design spec, ready for implementation.

---

## 0. TL;DR — what has to change

The current export is a **stream**: it walks blocks in order and pastes them into a document, matching the web page. Every problem you're seeing follows from that one decision.

| Symptom | Root cause | Fix (section) |
|---|---|---|
| Projects run together, no clear start/end | No page model — content just flows | §2, §4, §9 |
| Heading sizes inconsistent / giant / tiny | Author-supplied heading levels passed through verbatim | §6 |
| Text formatting broken (invisible text, weird spacing) | Web CSS + inline styles from TipTap leaking into print | §7 |
| Images missing or intermittently missing | Renderer fires before remote assets resolve; no preflight; no verification | §8 |
| Figures split across pages, orphan captions | No fragmentation rules | §9 |
| Looks like a web page printed, not a portfolio | No cover, no TOC, no running footer, no grid | §3, §5 |
| Each block type formatted ad hoc | No explicit block→print treatment | §7.6 |

The fix is to stop treating export as *serialization* and start treating it as **composition**: an intermediate document model, a fixed page grid, a per-project page contract, and a deterministic block→print renderer. The web version and the export are two *renderers over the same data*, not one converted into the other.

**One rule to anchor everything:** the export is not a printout of the site. It is a document that happens to be generated from the same content.

---

## Part I — What the industry actually expects

### 1. Evidence base

These are the standards the export must satisfy. They come from engineering communication labs, university career offices, and print/design practice.

#### 1.1 Structural expectations

| Requirement | Source |
|---|---|
| Cover page with name + contact info, then targeted project pages | MIT MechE Communication Lab |
| Title page → optional index → optional personal intro → resume → project pages | Utah State University College of Engineering |
| One project per page | MIT MechE CommLab |
| Each project page: title, start/completion dates, description, photos | USU |
| **At least one photo per project; photo(s) should fill roughly ⅓ of the project page** | USU |
| Visuals should occupy ~70% of a project page; they are the primary communication tool | MIT MechE CommLab |
| 3–4 main projects in a tailored portfolio; keep a "master portfolio" and cut down per recipient | MIT MechE CommLab |
| 8–12 pages for an interview-facing portfolio | Univ. of Washington career portfolio checklist |
| Organize by skill (best) or by project (acceptable); if by project, list the skills used | Boston University College of Engineering CDO |
| Group projects by theme rather than presenting an uncategorized list | ASEE, *Engineering Portfolios: Value, Use, and Examples* |
| Print in color, use quality binding, bring a hard copy to interviews | USU |
| Reviewers skim each page for **30–60 seconds** | MIT MechE CommLab |

#### 1.2 Per-project content model — the inverted pyramid

MIT's CommKit prescribes a specific information order for each project page. This is the single most important thing to encode in the template, because it is where auto-generated portfolios most obviously fail:

1. **Impactful title** — meaningful to a non-specialist. *"Generating CAD through sketches"*, not *"4.450 – Computational Design"*.
2. **Outcome** — what it is, how it performed, its impact, and *your* contribution. Stated up front, not buried.
3. **Experience, learning & skills** — your role, as bullets, using strong verbs (designed, machined, analyzed, compiled, organized) rather than weak ones (used, did, studied, helped).
4. **Motivation** — objective, why it matters, constraints (team size, budget, timeline).
5. **Technical details** — for the curious reader; assume most won't read it.

Note the ordering is *deliberately inverted* relative to how students naturally write ("over the course of the semester, my team and I stepped through the design process…"). The exporter must be able to produce this shape even when the underlying blocks are in narrative order.

#### 1.3 Visual expectations

- 2–6 visuals per project, each showing a *different* aspect — no redundant images.
- Mix system-level and subsystem-level visuals; show the whole system before a subsystem close-up.
- Show **process**, not just the hero shot.
- Photographs should be well-lit, sharp, uncluttered.
- Text should be integrated with visuals (annotations, callouts) rather than sitting in a separate wall of prose.

#### 1.4 Layout and typography practice (print/design convention)

| Element | Convention |
|---|---|
| Grid | 12 columns (divides into halves/thirds/quarters); 6 columns for image-heavy layouts |
| Outer margin | 15–20 mm, larger on the binding edge |
| Gutter | 4–6 mm |
| Body text | 9–10 pt; captions one step smaller |
| Line length | 50–75 characters |
| Line height | 120–145% |
| Typefaces | One or two families, neutral; never a decorative face for body text |
| Page templates | 2–3 reusable templates repeated across projects — variety belongs in the *work*, not the layout |
| Consistency | Caption position, title placement, and image alignment must not move between projects |

#### 1.5 File constraints

| Constraint | Value |
|---|---|
| Target file size | **< 5 MB preferred, < 10 MB hard ceiling** — many application portals cap at 10 MB and email gets unreliable above that |
| Image resolution for a screen-read PDF | **150 DPI** at final display size (72–96 DPI is screen, 300 DPI is press) |
| Letter-size full-page image at 150 DPI | ≤ 1275 × 1650 px |
| Sizing rule | Resize images to their *display* dimensions before embedding, not after export |
| Text | Must be real selectable text, not rasterized |

---

### 2. Why a "linear paste" fails these standards

Concretely, mapping the current behaviour against the list above:

- **"One project per page"** — impossible without forced page breaks. Right now project 3 starts halfway down the page that project 2 ended on. This is the single most visible tell that a document was machine-generated.
- **"At least one photo per project, filling ~⅓ of the page"** — a stream renderer has no concept of page area, so it can't enforce a proportion, and an image that fails to load leaves a gap rather than triggering a fallback.
- **"Reviewers skim for 30 seconds"** — a skim requires a predictable landing zone: title, outcome, hero image, in the same place every time. A stream puts whatever the user typed first at the top.
- **"Consistent type hierarchy"** — a stream inherits whatever heading level the user picked in the editor. One user's project opens with `heading level 1`, another's with `level 3`. Same document, two different visual languages.
- **"Cover / index / resume / projects"** — front matter has to be *composed*, not extracted.

---

## Part II — The export system

### 3. Page sequence

The export composes a fixed document skeleton. Sections are conditional on data availability, but **order is fixed** and never derived from the site's section ordering.

```
┌─ FRONT MATTER ────────────────────────────────────────────┐
│ 1. Cover                    (always, 1 page)              │
│ 2. Contents                 (if ≥3 projects, 1 page)      │
│ 3. Profile / About          (if bio present, ≤1 page)     │
│ 4. Skills & Tools index     (if tags present, ≤1 page)    │
│ 5. Resume                   (if uploaded, N pages)        │
├─ BODY ────────────────────────────────────────────────────┤
│ 6. Project pages            (1..N, each starts on a new   │
│                              page, summary page first)     │
├─ BACK MATTER ─────────────────────────────────────────────┤
│ 7. Education & Credentials  (if present, ≤1 page)         │
│ 8. Endorsements             (if ≥1 approved, ≤1 page)     │
│ 9. Colophon / links         (always, ≤1 page)             │
└───────────────────────────────────────────────────────────┘
```

Notes on individual sections:

**1. Cover.** Name, headline/target role, contact block (email, portfolio URL, GitHub/LinkedIn), optional headshot, optional single hero image drawn from the user's strongest project. Date-stamped in small type at the foot (`Portfolio · July 2026`) so a reviewer knows it's current. No page number, no running footer.

**2. Contents.** Project titles + one-line descriptors. Page numbers are a phase-2 feature (§11.4) — ship v1 with PDF bookmarks for navigation and an unnumbered list, because a *wrong* page number is worse than none. USU's guidance is explicit that an index must be updated whenever content or order changes; generating it is exactly why we can do this better than a student hand-maintaining a Word doc.

**3. Profile / About.** Short bio, 3–5 sentences max, hard-truncated. This is not the place for a life story.

**4. Skills & Tools index.** Derived from project technology tags. Grouped, alphabetized within group, with the count of projects demonstrating each. This directly serves BU's "organize by skill" guidance without forcing a re-architecture of the data model — and it makes the document scannable by a recruiter looking for one keyword.

**5. Resume.** If the user has uploaded a resume PDF, merge its pages here verbatim (§13.3). Do not attempt to re-typeset it. USU: place the resume in the portfolio for reference, and it must match the one submitted with the application.

**6. Project pages.** See §6.

**7. Education & Credentials.** Institution, degree, dates, GPA (if the user opted in), relevant coursework, certifications. Note ABET accreditation if the user has recorded it — it carries weight with engineering employers.

**9. Colophon.** Live portfolio URL + QR code, generation timestamp, and the "this document was generated from {url}" line. The QR code matters more than it sounds: at a career fair, a recruiter scanning a code is the documented handoff pattern.

#### 3.1 Section ordering rationale

Resume-before-projects (USU's order) is deliberate: the reviewer gets the credential context before the evidence. If a user has no resume uploaded, Profile + Skills index carry that job instead.

Education is placed *after* projects rather than before, which differs from a CV. In a portfolio the work is the argument; education is corroboration. For grad-school-targeted exports this order can be flipped via preset (§12).

---

### 4. Page geometry and grid

#### 4.1 Page size

| Preset | Size | Orientation | Use |
|---|---|---|---|
| `us-letter` (default) | 8.5 × 11 in (215.9 × 279.4 mm) | Portrait | US employers, career fairs, most application portals |
| `a4` | 210 × 297 mm | Portrait | Non-US |
| `a4-landscape` | 297 × 210 mm | Landscape | Design/visual-heavy portfolios, laptop screen review |

Default by locale; user-overridable. Portrait is the default because portfolios are printed, hole-punched, and read alongside a résumé — all portrait workflows. Landscape is offered because it fits a laptop screen better and is the norm in architecture/industrial design.

Do **not** offer A3. It is a print-shop size; students exporting from a web app will not print it.

#### 4.2 Margins

```
                  top: 18mm
              ┌─────────────┐
  inner: 20mm │   content   │ outer: 15mm
              │    area     │
              └─────────────┘
               bottom: 20mm
        (bottom includes 8mm footer zone)
```

- Inner margin is larger to survive three-hole punching and binding. This is the single most-skipped detail in generated PDFs and it is the reason printed portfolios end up with text disappearing into the spine.
- `@page :left` / `@page :right` swap inner/outer only when `duplex: true` (§12). Single-sided default keeps the wide margin on the left of every page.

#### 4.3 Grid

- **12 columns**, gutter 5 mm.
- Content width (Letter, portrait): 215.9 − 20 − 15 = **180.9 mm**.
- Column width: (180.9 − 11 × 5) / 12 = **10.49 mm**.
- Sanctioned spans only: **12** (full), **8/4**, **6/6**, **4/4/4**, **3/3/3/3**. Anything else is a bug.
- Vertical rhythm: **4 mm base unit**. All vertical spacing is a multiple (4, 8, 12, 16, 24, 32).

Implementation: CSS Grid on the page container. Do not use flexbox for page-level layout — Chromium's fragmentation behaviour inside flex containers is unreliable and `page-break-after` inside a flex layout is a known failure.

#### 4.4 Running footer

Every body page except the cover carries a footer in the bottom margin:

```
Firstname Lastname · Project Title                              12
```

Left: owner name + current project title. Right: page number. 7.5 pt, 60% grey, hairline rule above.

This is what makes a stack of loose printed pages reassemblable and it's what a reviewer uses when they say "go back to the one with the heat sink." Two implementation routes are given in §10.4 — pick based on your pinned Chromium version.

---

### 5. Typography system

#### 5.1 Type scale

All sizes in points. This is the **entire** set of text styles in the document — there are no others, and no block may introduce one.

| Token | Size / Leading | Weight | Tracking | Used for |
|---|---|---|---|---|
| `cover-name` | 34 / 38 | 600 | −0.01em | Cover: owner name |
| `cover-role` | 13 / 18 | 400 | 0 | Cover: headline |
| `section-title` | 22 / 26 | 600 | −0.01em | Front/back matter section headings |
| `project-title` | 20 / 24 | 600 | −0.01em | Project page H1 |
| `project-meta` | 8.5 / 12 | 500 | 0.06em, uppercase | Role · dates · team · tools line |
| `outcome` | 11.5 / 16 | 400 | 0 | Outcome statement (lead paragraph) |
| `h2` | 12 / 15 | 600 | 0 | First-level in-body heading |
| `h3` | 10 / 13 | 600 | 0.02em, uppercase | Second-level in-body heading |
| `h4` | 9.5 / 13 | 600 italic | 0 | Third-level (rare) |
| `body` | 9.5 / 13.5 | 400 | 0 | Paragraphs, lists |
| `caption` | 8 / 11 | 400 | 0 | Figure captions, table captions |
| `label` | 7.5 / 10 | 600 | 0.08em, uppercase | Metric labels, tags, footer |
| `code` | 8 / 12 | 400 mono | 0 | Code blocks and inline code |
| `footnote` | 7.5 / 10 | 400 | 0 | Link index, colophon |

Body at 9.5 pt with 142% leading sits inside the 9–10 pt / 120–145% convention. Do not let this drift upward; 11 pt body in a 12-column layout produces a document that reads like a school report.

#### 5.2 Line length

Body text must land in the **50–75 character** band. On Letter portrait:

- Full-width (12 col) body text = ~110 characters. **Not allowed.**
- Therefore: **body prose is constrained to an 8-column measure by default**, with the remaining 4 columns available for a marginal figure, pull-quote, or left empty.
- Full-bleed 12-column text is permitted only for the outcome statement (short by definition) and table content.

This single constraint does more for perceived quality than any other rule here.

#### 5.3 Typefaces

Two families, both self-hosted as WOFF2 in the render container. **Never** reference Google Fonts or any external font CDN at render time (see §8.2 — same class of failure as images).

- **Sans (primary):** a neutral grotesk — Inter, Source Sans 3, or IBM Plex Sans. Used for everything by default.
- **Mono:** JetBrains Mono or IBM Plex Mono, for `code` blocks only.
- Optional **serif** for body prose is a per-user theme option (§12.2), not a default.

Subset to Latin + Latin Extended-A at build time. Full font embedding is a measurable chunk of file size.

Required at render: `await page.evaluate(() => document.fonts.ready)` — or rely on Puppeteer's `waitForFonts` (default `true`), but assert it explicitly anyway, because a fallback-font render is a silently wrong document, not a crash.

#### 5.4 Colour

- Body text: `#111827` (not pure black — pure black on white is harsh in print and reads as unstyled).
- Secondary/meta: `#6B7280`.
- Rules and dividers: `#E5E7EB`.
- One accent colour, user-selectable, used **only** for: rule under project title, metric values, link underlines, and the cover. Never for body text.
- **Everything else is greyscale.** Two to three colours total, per print convention.

Hard requirement: the print stylesheet must set `color` explicitly on every text-bearing element. Do not inherit from the app theme. Dark-mode users currently produce exports with near-white body text (§7.2).

---

### 6. The project page contract

This is the core of the spec. Everything in Part I about the inverted pyramid, one-project-per-page, and ⅓-page imagery is enforced here.

#### 6.1 The two-tier model

A tension has to be resolved: MIT says **one project per page**, but Projectfolio projects are rich, block-based documents that can legitimately run to five pages of build logs and diagrams. Truncating that would destroy the product's value; ignoring the one-page rule produces an unreadable document.

Resolution — **every project gets a standardized Summary Page, followed by an optional Detail Flow**:

```
┌── PAGE 1: SUMMARY (fixed template, always exactly one page) ──┐
│  Project title                                    [H1]        │
│  ────────────────────────────── (accent rule)                 │
│  ROLE · DATES · TEAM · TOOLS                      [meta]      │
│                                                               │
│  Outcome statement (1–3 sentences)                [outcome]   │
│                                                               │
│  ┌─────────────────────────────────────────────┐              │
│  │                                             │              │
│  │            HERO VISUAL                      │  ~38% of     │
│  │                                             │  page height │
│  └─────────────────────────────────────────────┘              │
│  Caption                                          [caption]   │
│                                                               │
│  ┌─ MY CONTRIBUTION ────┐  ┌─ CONTEXT ──────────┐             │
│  │ • designed …         │  │ Objective, why it  │             │
│  │ • analyzed …         │  │ matters, constraints│            │
│  │ • machined …         │  │                    │             │
│  └──────────────────────┘  └────────────────────┘             │
│   (7 cols)                   (5 cols)                         │
│                                                               │
│  [ metrics strip, if present ]                                │
│  ↳ continues p.13                    (only if detail follows) │
└───────────────────────────────────────────────────────────────┘

┌── PAGES 2..n: DETAIL FLOW (author's blocks, styled) ──────────┐
│  Project title · continued                        [running]   │
│  … user's blocks, rendered per §7 …                           │
└───────────────────────────────────────────────────────────────┘
```

Why this works:
- The 30-second skim always lands on a page with the same shape. A reviewer comparing five candidates compares five identical layouts.
- The detail flow preserves everything the user wrote — no data loss, which is the thing that makes users distrust an export feature.
- Visuals occupy ~38% of the summary page as the hero alone; with the metrics strip and any inline figures on that page, the visual share lands near the 70% target for image-rich projects and comfortably above USU's ⅓ floor.
- It gives a natural home for the "tailored portfolio" preset: summary pages only, detail suppressed (§12).

#### 6.2 Summary page field derivation

The summary page is built from **structured fields first**, falling back to derivation from blocks. Never render an empty slot.

| Slot | Primary source | Fallback 1 | Fallback 2 | If all fail |
|---|---|---|---|---|
| Title | `project.title` | — | — | Hard error; a project without a title is not exportable |
| Meta: role | `project.role` | first `text` block matching `/^(role\|my role)[:—-]/i` | — | Omit the segment |
| Meta: dates | `project.start_date`–`project.end_date` | `project.created_at` year | — | Omit the segment |
| Meta: team | `project.team_size` | — | — | Omit the segment |
| Meta: tools | `project.technologies[]`, max 6, then "+N more" | tags | — | Omit the segment |
| Outcome | `project.summary` | first `text` block, first 2 sentences | `project.description` | Omit slot; hero expands to fill |
| Hero visual | `project.cover_image` | first `image` block | first item of first `gallery` block | Placeholder card (§8.7) + warning |
| Hero caption | image `caption` | image `alt` | — | Omit |
| Contribution | `text` block under a heading matching `/contribut\|my role\|responsib/i`, list items only | first `<ul>` in the block stream | derived: `project.technologies` as "Worked with…" | Omit column; Context expands to 12 col |
| Context | `text` under `/objective\|motivation\|problem\|background\|overview/i` | `project.description` | — | Omit column; Contribution expands |
| Metrics | first `metrics` block | — | — | Omit strip |

**Meta line format.** Segments joined with ` · `, uppercase, letter-spaced:
`LEAD MECHANICAL ENGINEER · SEP 2025 – MAY 2026 · TEAM OF 4 · SOLIDWORKS, ANSYS, PYTHON`

**Outcome statement enforcement.** Hard cap at 320 characters. If the derived text exceeds it, truncate at the last sentence boundary under the cap. A three-paragraph "outcome" defeats the purpose of the slot.

#### 6.3 Contribution bullets — verb linting

MIT is specific that strong verbs (designed, machined, analyzed, compiled, organized) beat weak ones (used, did, studied, helped). The exporter should not rewrite the user's words silently, but it should **flag** them.

- At export time, scan contribution bullets for sentence-initial weak verbs: `used, did, helped, studied, worked on, was responsible for, participated in, assisted`.
- Emit a non-blocking warning into the export report (§11.5): *"3 contribution bullets start with weak verbs. Consider 'designed' or 'analyzed' instead of 'worked on'."*
- Never auto-rewrite. This is the user's professional voice and a silent rewrite is a trust violation.

If AI enrichment is added later, this belongs behind an explicit "improve my bullets" action in the editor, not in the export path.

#### 6.4 Project ordering

Default order: `project.display_order` (the user's site order), because that's the order they curated. Presets may override:

- `tailored` preset: user picks and orders projects at export time via a selection UI. Default the selection to the first 4.
- `by-skill` preset: group projects under skill headings, with a project appearing under multiple skills. Each appearance renders the same summary page with the *relevant* skill's bullets promoted. (Phase 3 — this is the BU-recommended structure and worth building, but it needs a per-skill relevance field.)

#### 6.5 The "continues" affordance

If a project has detail pages, the summary page ends with `↳ continues p.13` and detail pages carry `Project Title · continued` in the running footer. Without this, a reviewer flipping through a printed copy cannot tell whether page 14 belongs to project 3 or project 4.

---

### 7. Content normalization and the block render map

Rich text is stored as **HTML inside `text` blocks** (not ProseMirror JSON). That HTML came from a browser editor and carries browser assumptions. This section is the "fix the headings and text formatting" work.

#### 7.1 Heading level normalization

**The problem.** Users pick heading levels by how big they look in the editor. Across a portfolio you get: project A opening with `<h1>`, project B with `<h3>`, project C alternating h2/h4 with no h3. Passed through verbatim, the exported document has three visual languages and duplicate H1s.

**The rule.** The project title is the only H1 on a project's pages, and it is emitted by the *template*, never by a block. Author headings are then **rank-normalized**, not level-mapped:

```js
/**
 * Normalize heading levels within a single project's block stream.
 * Preserves the author's relative hierarchy; discards their absolute levels.
 */
function normalizeHeadingLevels(blocks) {
  // 1. Collect distinct levels actually used, in ascending order.
  const used = [...new Set(
    blocks.filter(b => b.type === 'heading').map(b => b.level ?? 2)
  )].sort((a, b) => a - b);

  // 2. Rank them: shallowest used level -> h2, next -> h3, everything else -> h4.
  const rankToPrintLevel = [2, 3, 4];
  const levelMap = new Map(
    used.map((lvl, i) => [lvl, rankToPrintLevel[Math.min(i, 2)]])
  );

  return blocks.map(b =>
    b.type === 'heading'
      ? { ...b, printLevel: levelMap.get(b.level ?? 2) }
      : b
  );
}
```

Examples:

| Author used | Renders as |
|---|---|
| h1, h2 | h2, h3 |
| h2, h3 | h2, h3 |
| h3 only | h2 |
| h2, h4, h5 | h2, h3, h4 |
| h1, h2, h3, h4, h5 | h2, h3, h4, h4, h4 |

Additional heading rules:

1. **Drop empty headings** — `<h*>` with no text content after trimming (users leave these behind constantly).
2. **Drop a leading heading that duplicates the project title** — normalize both (lowercase, strip punctuation and whitespace) and compare; if equal, remove it. Otherwise every project page shows its title twice.
3. **Never orphan a heading** — `break-after: avoid` on all headings, and require at least two following lines on the same page (§9.2).
4. **Collapse consecutive headings** — two headings with no content between them: keep the deeper one, drop the shallower, unless the shallower is the first of a run (then keep it and drop the rest).
5. **Cap length** — headings over 90 characters are almost certainly misused paragraphs. Render them as bold body text and log a warning.

#### 7.2 HTML sanitization and normalization for print

Run every `text` block's HTML through a normalize pass before it reaches the template. Order matters.

```js
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'sub', 'sup',
  'a', 'ul', 'ol', 'li', 'blockquote', 'span',
];
const ALLOWED_ATTRS = { a: ['href'], span: [] };
```

| Step | Action | Why |
|---|---|---|
| 1 | Strip all `style` attributes | **The invisible-text bug.** Editors persist `color:#f9fafb` from dark mode; on white paper that's blank. Also kills stray `font-size:28px` that breaks the type scale. |
| 2 | Strip all `class` attributes | Web utility classes (Tailwind) have no meaning in the print stylesheet and can match print-CSS selectors by accident |
| 3 | Strip `<div>`, `<section>`, `<figure>` wrappers, keeping children | TipTap and paste-from-Word leave nesting that breaks fragmentation |
| 4 | Drop tags not in allowlist, keeping their text | Safety + determinism |
| 5 | Remove empty `<p></p>` and `<p><br></p>` | Users use empty paragraphs as spacers; the print grid handles spacing |
| 6 | Collapse runs of `<br>` (>1) into a paragraph break | Same reason |
| 7 | Replace `&nbsp;` with a normal space, except in leading indentation | Non-breaking spaces wreck justification and line-breaking |
| 8 | Normalize `<b>`→`<strong>`, `<i>`→`<em>` | Semantic tags survive PDF tagging (§13.5); presentational ones don't |
| 9 | Trim leading/trailing whitespace inside block-level elements | |
| 10 | Rewrite `<a href>`: keep `href`, add `data-link-index="n"` | Feeds the link index (§7.4) |
| 11 | Escape and preserve `<code>` contents verbatim | |
| 12 | Enforce max list nesting depth of 3 | Deeper nesting has no type style and indents off the measure |

Use a well-maintained sanitizer (`sanitize-html` server-side) rather than regex. Regex-based HTML mangling is where this kind of pipeline goes to die.

#### 7.3 Typographic polish

Applied after sanitization, to text nodes only (never inside `<code>`):

- Straight quotes → curly (`"` → `“ ”`, `'` → `’`), locale-aware.
- ` - ` between numbers → en dash `–`; `--` → em dash `—`.
- `...` → `…`.
- Prevent widows on short paragraphs: insert `&nbsp;` between the final two words of any paragraph under 12 words. (Do this narrowly; blanket application interacts badly with justified text.)
- Numbers: thin-space thousands separators are *not* worth the trouble. Skip.

#### 7.4 Links in a printed document

A PDF is read both on screen (clickable) and on paper (not). Handle both:

- Keep `<a>` clickable in the PDF — Chromium emits link annotations natively.
- Style: accent-coloured, no underline in the body, so a page of links doesn't look like a ransom note.
- **Bare URLs** in text: never render raw (`https://github.com/user/some-really-long-repo-name/tree/main/...` blows the measure and hyphenates badly). Replace the visible text with the domain + path stem, keep the full URL as the href.
- At the end of each project's detail flow, emit a **Link index**: numbered list of every distinct URL in that project, in `footnote` style. This is what makes the printed copy usable.
- Add `overflow-wrap: anywhere` on link text as a backstop.

#### 7.5 Paragraph fragmentation

```css
p, li { orphans: 3; widows: 3; }
```

Chromium honours both. Three lines is the right value for a 9.5 pt measure — two produces visible stubs at page tops.

#### 7.6 Block render map

Every block type in the schema gets an explicit print treatment. There is no default/passthrough case — an unmapped block type is a build error, not a silent omission.

Verified block vocabulary: `heading`, `text`, `code`, `image`, `table`, `divider`, `callout`, `embed`, `gallery`, `metrics`, `timeline`, `video`, `file`.

| Block | Print treatment | Columns | Break behaviour | Notes / degradation |
|---|---|---|---|---|
| `heading` | `h2`/`h3`/`h4` per §7.1 rank normalization | 8 | `break-after: avoid`; needs 2 following lines | Never `h1`. Empty → dropped. >90 chars → bold body. |
| `text` | Sanitized HTML, §7.2 | 8 | `orphans: 3; widows: 3` | Lists inherit the 8-col measure. Blockquote → indented rule-left, `caption` size. |
| `code` | Mono, 8 pt, tinted panel, hairline border, **soft-wrapped** | 12 | `break-inside: auto` (may split); `orphans/widows: 2` | **Never horizontal scroll** — nothing off the right edge exists in print. Wrap at column, mark continuation with a hanging indent. Cap at 60 lines, then truncate with `… N more lines — see {repo link}`. Syntax highlighting: greyscale weights only, or a muted 3-colour scheme; a full dark-theme highlighter costs file size and prints badly. |
| `image` | `<figure>` + `<img>` + `<figcaption>` | 12, 8, or 6 by `image.size` | `break-inside: avoid` on the whole figure | Full pipeline in §8. Max height 60% of content height so a caption always has room. |
| `table` | Bordered table, 8 pt, header row 8 pt/600 with tint | 12 | `thead { display: table-header-group }` to repeat headers across pages; `tr { break-inside: avoid }` | **Column overflow is the failure mode.** >6 columns: shrink to 7 pt, then rotate the whole table to landscape on its own page (§9.5), then as last resort truncate columns with a "table abridged" note. Never let a table run off the page. |
| `divider` | 24 mm of vertical space + hairline rule at 40% width, centred | 12 | `break-after: avoid` if it's the last element before a page break (drop it instead) | A divider at the top of a page is noise — suppress leading dividers after a break. |
| `callout` | Tinted panel, 3 mm left accent bar, icon glyph, 9.5 pt | 8 | `break-inside: avoid` if ≤ 15 lines, else allow with `orphans/widows: 3` | Variants (info/warn/success) map to greyscale tints + one accent; do not use saturated web colours. |
| `embed` | **Static card**: favicon/service mark, title, domain, URL, QR code | 6 | `break-inside: avoid` | An iframe cannot exist in a PDF. Attempt an oEmbed/OpenGraph fetch at export time for a poster image and title; cache it. If the fetch fails, render the card with URL only. |
| `gallery` | Contact-sheet grid, 2/3/4 up by item count, uniform aspect-ratio crop, captions under each | 12 | `break-inside: avoid` per row; whole gallery `break-inside: avoid` if ≤ 6 items | >12 items: render the first 12 and a `+N more at {portfolio URL}` line. A 40-image gallery is a 6-page interruption nobody reads. |
| `metrics` | Horizontal stat strip: value in accent at 18 pt, label in `label` style beneath, hairline separators | 12 | `break-inside: avoid` (whole strip) | >5 metrics: wrap to a second row, still atomic. This block is high-value for the summary page — it's the "how did it perform" slot MIT asks for. |
| `timeline` | Vertical rail, 2 mm dot, date in `label`, content in `body` | 8 | `break-inside: avoid` per entry; rail continues across pages | Do not attempt a horizontal timeline — it never fits a portrait measure. |
| `video` | **Poster frame + play glyph overlay + QR code + URL** | 8 | `break-inside: avoid` | Poster: `video.poster` → provider thumbnail (YouTube/Vimeo oEmbed) → first frame if self-hosted and ffmpeg is available → labelled placeholder. Caption must state it's a video: *"Video — scan to watch"*. |
| `file` | Attachment row: file-type glyph, filename, size, and either a link or (for PDFs, optionally) merged pages | 8 | `break-inside: avoid` | Default is a link row. `merge_pdf_attachments: true` (§12) appends PDF attachments to an appendix rather than inlining them. |

**Cross-cutting rules for every block:**

1. Vertical spacing between blocks is **12 mm**, except heading→content which is 4 mm. Never derive spacing from the web layout.
2. A block that reduces to nothing after normalization is removed, and so is any heading immediately preceding it if that heading then has no content.
3. `break-inside: avoid` on any element taller than ~65% of the content area is a trap — Chromium will honour it by pushing the element to a fresh page and then still overflow it. Apply the rule conditionally: measure first, and if the element exceeds the threshold, allow it to break and rely on `orphans`/`widows`.
4. Blocks never carry author-specified widths, colours, or fonts into print. The block's `type` and `size` enum are the only layout inputs.

---

### 8. The image guarantee

> **Requirement: every image that exists in the user's project appears in the export, every time.**

Images are the primary communication tool in a portfolio — USU requires at least one photo per project filling roughly a third of the page; MIT puts visuals at ~70% of a project page. A portfolio export that intermittently drops images is worse than no export, because the user won't discover the gap until a recruiter is holding it.

Intermittent image loss is never one bug. It's eight, and they have to be closed individually.

#### 8.1 Failure taxonomy

| # | Failure mode | Mechanism | Closed by |
|---|---|---|---|
| 1 | Renderer fires before images decode | `page.pdf()` runs while requests are in flight; `load` fires before decode completes | §8.5 gates |
| 2 | Remote asset slow or rate-limited | S3/CDN latency spike, per-IP throttling on a 40-image doc | §8.2 local materialization |
| 3 | Asset is behind auth | Signed URLs expire mid-render; private-bucket 403 | §8.2 |
| 4 | Lazy loading | `loading="lazy"` images below the fold never enter the viewport in a headless render | §8.4 |
| 5 | Header/footer/margin-box images | **Chromium refuses to fetch external resources referenced from `headerTemplate`/`footerTemplate` and from `@page` margin-box `url()`** | §8.6 data URIs |
| 6 | CSS background images | Dropped entirely unless `printBackground: true` | §8.4, §10.3 |
| 7 | Format/colour-space | AVIF/HEIC unsupported downstream; CMYK JPEGs render inverted; EXIF-rotated photos appear sideways | §8.3 |
| 8 | Silent partial success | Some images render, PDF is produced, nobody notices | §8.8 verification |

Failure mode 5 is the one that burns days: the image looks fine in a browser print preview and vanishes in headless. It is documented Chromium behaviour, not a bug in your code.

#### 8.2 Rule 1 — materialize every asset locally before rendering

**The renderer must never make a network request for a content asset.** Chromium's job is layout, not fetching.

Worker sequence, before a browser is even launched:

```js
// EXPORT:ASSETS:START
for (const ref of collectImageRefs(exportDoc)) {
  const cached = await assetCache.get(ref.sha256);          // content-addressed
  if (cached) { ref.localPath = cached; continue; }

  const buf = await fetchWithRetry(ref.url, {
    retries: 3,
    backoff: [250, 1000, 3000],
    timeoutMs: 15000,
    maxBytes: 25 * 1024 * 1024,
  });

  const normalized = await normalizeImage(buf, ref);          // §8.3
  ref.localPath = await assetCache.put(normalized.sha256, normalized.buf);
  ref.intrinsic = normalized.dimensions;
  ref.status = 'ok';
}
// EXPORT:ASSETS:DONE ok=%d failed=%d cacheHits=%d
```

Then serve the staging directory over a **local HTTP server on an ephemeral port**, and point the render at `http://127.0.0.1:{port}/...`.

Two notes that will save time:

- Prefer a local HTTP origin over `file://`. Chromium's file-scheme restrictions cause images that resolve in one environment and not another, and `--allow-file-access-from-files` is a security smell in a production worker.
- **Avoid ports on Chromium's blocked list** (6000, 6666, 6665, etc.). A blocked port produces `ERR_UNSAFE_PORT` and every single image silently fails — a spectacularly confusing failure mode. Constrain the ephemeral port range explicitly.

Use `data:` URIs only where §8.6 requires them; a document of 40 base64 images bloats the DOM and slows layout considerably.

#### 8.3 Rule 2 — normalize every asset

`sharp` handles all of this in one pass:

```js
async function normalizeImage(buf, ref) {
  const meta = await sharp(buf).metadata();

  let pipeline = sharp(buf, { failOn: 'none' })
    .rotate()                    // applies EXIF orientation, then strips it
    .toColorspace('srgb');       // CMYK JPEG -> sRGB (otherwise colours invert)

  // Resize to the display box at the target DPI. Never upscale.
  const targetPx = Math.round(ref.displayWidthMm / 25.4 * ref.targetDpi);
  if (meta.width > targetPx) {
    pipeline = pipeline.resize({ width: targetPx, withoutEnlargement: true });
  }

  // Photographic -> JPEG; graphics/screenshots/diagrams with alpha -> PNG.
  const out = ref.hasAlpha || meta.channels === 4
    ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
    : await pipeline.jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();

  return { buf: out, sha256: hash(out), dimensions: await sharp(out).metadata() };
}
```

Decisions embedded above:

- **Target DPI: 150** for the screen/application preset — the documented sweet spot for a portfolio PDF that must stay under 10 MB. `print-ready` uses 300 (§12).
- **Resize to display dimensions before embedding.** This is the single largest lever on file size. An 8 MP phone photo displayed 60 mm wide is ~40× more data than needed.
- **Never upscale.** A 400 px screenshot stretched to full width looks worse than the same screenshot at 6 columns. If `intrinsic width < 0.6 × display width`, automatically demote the image to a narrower column span and log a warning.
- **Convert AVIF/WebP/HEIC → JPEG/PNG.** Chromium renders WebP fine, but the normalization pass has to happen anyway and standardizing the output formats removes a whole class of downstream surprise.
- **SVG:** rasterize at 2× the display box unless the SVG is known-simple. User-supplied SVGs can reference external fonts and remote images; rasterizing kills both risks. Keep vector only for your own generated marks (QR codes, icons).
- **Strip all metadata** — EXIF GPS in a student's portfolio photos is a genuine privacy problem, and it's free to remove. `sharp` strips by default when you don't call `.withMetadata()`.
- **`failOn: 'none'`** so a slightly-corrupt-but-decodable JPEG still renders rather than throwing.

#### 8.4 Rule 3 — the markup must be unambiguous

Every `<img>` the template emits:

```html
<figure class="fig fig--span-8" style="--aspect: 1.5">
  <img src="http://127.0.0.1:41337/a/9f2c…c1.jpg"
       width="1275" height="850"          <!-- intrinsic px, always present -->
       loading="eager"                     <!-- never lazy -->
       decoding="sync"                     <!-- no async decode race -->
       alt="Heat sink assembly after thermal testing">
  <figcaption>Fig. 3 — Heat sink assembly after thermal testing. Peak junction temperature fell 18 °C.</figcaption>
</figure>
```

- **`width`/`height` attributes are mandatory.** They give Chromium the intrinsic ratio before decode, so layout is stable and pagination doesn't shift after paint. This alone eliminates a class of "the image is there but the page breaks are wrong" bugs.
- **`loading="eager"` and `decoding="sync"`** on every image. Any lazy-loading logic inherited from the web components must be stripped in the print template.
- **No `srcset`/`sizes`.** Pick the one asset in the worker. Letting Chromium choose introduces nondeterminism between runs.
- **Content images are `<img>`, never CSS `background-image`.** Backgrounds require `printBackground: true`, aren't tagged for accessibility, and can't carry alt text. Reserve backgrounds for decorative tints only.
- **`alt` is always populated** — caption → user alt → `"{Project title} — figure {n}"`. Feeds tagged-PDF output (§13.5).
- Aspect ratio is passed as a CSS custom property so the figure reserves its box before decode: `.fig { aspect-ratio: var(--aspect); }`.

#### 8.5 Rule 4 — a four-gate readiness check

`waitUntil: 'networkidle0'` alone is **not sufficient** and is the most common mistake. It reports network quiet, not decode completion, and it fires early on documents with staggered resource loads.

```js
await page.goto(renderUrl, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'], timeout: 60_000 });

// Gate 1 — fonts
await page.evaluate(() => document.fonts.ready);

// Gate 2 — every image decoded and non-zero
await page.waitForFunction(() => {
  const imgs = Array.from(document.images);
  return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
}, { timeout: 60_000, polling: 250 });

// Gate 3 — explicit template signal (set after any layout JS finishes)
await page.waitForFunction('window.__EXPORT_READY__ === true', { timeout: 30_000 });

// Gate 4 — two animation frames, so the compositor has painted the final layout
await page.evaluate(() => new Promise(r =>
  requestAnimationFrame(() => requestAnimationFrame(r))
));

await page.emulateMediaType('print');
// Re-assert gate 2 after the media switch: print CSS can swap which images are displayed.
await page.waitForFunction(() =>
  Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)
);
```

Gate 2's `naturalWidth > 0` check is doing the real work — `complete` is `true` for *failed* images too. Checking only `complete` will pass a document full of broken images.

The re-assertion after `emulateMediaType('print')` addresses a real Chromium behaviour: switching to print CSS can trigger a re-layout that requests newly-visible resources, and the first `page.pdf()` after that switch can render before they resolve. (The widely-cited workaround of "call `page.screenshot()` then `page.pdf()`" is treating this symptom; the gate above treats the cause. Keep the screenshot trick in your back pocket as a diagnostic — if a screenshot-then-pdf sequence fixes an image, you have a readiness bug, not a fetch bug.)

#### 8.6 Rule 5 — margin-box and header/footer images must be base64

This is non-negotiable and non-obvious:

- **Headless Chromium silently refuses to fetch any external resource referenced from `page.pdf()`'s `headerTemplate`/`footerTemplate`, and from `url()` inside `@page` margin boxes.** No error, no console warning — the image simply isn't there.
- It works in *headful* Chrome's print dialog, and it works in Paged.js. So it will look correct during development and fail in production.
- **The only reliable fix is to inline as a `data:` URI.**
- Header/footer templates also **do not inherit page CSS** — they render in a separate context. All styling must be inline in the template string.
- Header/footer templates are invisible unless you reserve space with explicit `margin.top` / `margin.bottom` in `page.pdf()`. Content will otherwise render straight over them.

Keep footer graphics to a hairline rule and text; if a logo mark is required, inline a small optimized PNG as base64 and accept the fixed cost.

#### 8.7 Rule 6 — a defined failure artifact

If an asset cannot be materialized after retries, **never** emit a broken-image icon, a zero-height box, or nothing.

Render a placeholder figure at the correct aspect ratio:

```
┌───────────────────────────────┐
│                               │
│      ⚠  Image unavailable     │
│      heat-sink-test.jpg       │
│                               │
└───────────────────────────────┘
Fig. 3 — Heat sink assembly after thermal testing.
```

- The caption survives, so the document still reads.
- The filename tells the user exactly what to re-upload.
- The placeholder is recorded in the export report (§11.5) with a direct "fix this" link into the editor.

**Escalation thresholds** — the job's own quality gate:

| Condition | Action |
|---|---|
| Any image fails | Warn in report; render placeholder |
| The **hero image** of any project fails | Warn prominently; the summary page reflows to a text-forward variant |
| > 20% of images fail | **Fail the job.** Do not deliver. Surface "we couldn't reach your images — try again in a few minutes." |
| 0 images resolved across the whole doc | **Fail the job.** This is an infrastructure fault, not a user content issue. |

Shipping a 90%-complete portfolio silently is the worst outcome available. Failing loudly is recoverable; a quietly incomplete PDF sent to an employer is not.

#### 8.8 Rule 7 — verify after render, not before

The render succeeding does not mean the images are in the PDF. Verify the artifact:

```js
// EXPORT:VERIFY:START
const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;

let embedded = 0;
for (let p = 1; p <= doc.numPages; p++) {
  const ops = await (await doc.getPage(p)).getOperatorList();
  embedded += ops.fnArray.filter(fn =>
    fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject
  ).length;
}

assert(embedded >= expectedImageCount * 0.95, 'EXPORT:VERIFY:IMAGE_COUNT_MISMATCH');
assert(doc.numPages >= expectedMinPages,      'EXPORT:VERIFY:PAGE_COUNT_LOW');
// EXPORT:VERIFY:DONE embedded=%d expected=%d pages=%d
```

Also assert: page count within ±20% of the layout engine's own estimate, extracted text length > 200 chars per project (catches a rasterized or blank render), and total bytes within the size budget (§13.4).

A mismatch fails the job and requeues once before surfacing an error. This check is cheap and it is the difference between "we think images work" and "we know they do."

#### 8.9 Image sizing policy on the page

| `image.size` | Span | Max height | Typical use |
|---|---|---|---|
| `full` | 12 col | 60% of content height | Hero, system-level diagram |
| `wide` | 8 col | 45% | Standard figure |
| `inline` | 6 col | 35% | Paired figures, detail shots |
| `thumb` | 4 col | 25% | Process steps, before/after |

Two consecutive `inline`/`thumb` figures with compatible aspect ratios are automatically paired side by side into one row (and that row becomes one atomic `break-inside: avoid` unit). This is what produces the "process strip" look MIT recommends, without the user having to build a gallery block.

**Hero on the summary page is fixed at 12 columns × ~38% of content height** with `object-fit: cover` and a centred focal point. Consistency across projects is worth more here than honouring per-image aspect ratios.

---

### 9. Pagination and fragmentation

#### 9.1 What Chromium actually supports

Pin this down before writing CSS, because the support story changed recently and most advice online predates it.

| Feature | Status in Chromium | Verdict |
|---|---|---|
| `@page { size; margin }` | Supported | Use |
| `@page :first`, `:left`, `:right`, `:blank` | Supported | Use |
| **Named pages** (`@page cover {}` + `page: cover`) | Supported | Use |
| **Margin boxes** (`@top-center`, `@bottom-right`, …, all 16) | **Supported from Chrome 131** (Nov 2024) | Use — but pin your Chromium version and assert it at boot |
| `counter(page)` / `counter(pages)` in margin boxes | Supported | Use |
| `break-before/after/inside` | Supported | Use |
| `orphans` / `widows` | Supported | Use |
| `thead` repeat via `display: table-header-group` | Supported | Use |
| `position: running()` (running elements) | **Not supported** | Avoid — use margin-box `content` strings, or Puppeteer templates |
| `string-set` / `content: string()` | **Not supported** | Avoid — this is why per-page "current project title" needs named pages or JS |
| Bleed / crop marks (`marks`, `bleed`) | **Not supported** | Simulate with an oversized page + drawn marks for `print-ready` |
| `float: footnote`, footnote area | Not supported | N/A |

Two consequences worth stating plainly:

1. **Chromium is the only viable engine** if you want margin boxes. That's fine — you control the renderer. But it means the print CSS is Chromium-targeted, not portable, and you should say so in a comment at the top of the stylesheet.
2. **Headful Chrome and headless Chromium do not agree.** Headful ignores CSS page dimensions in favour of the window/paper setting, and headful *will* load `@page url()` resources that headless refuses. Never validate the layout in a browser print dialog and assume the worker matches. Validate against worker output. (Paged.js is useful for a *preview* in the app UI, but Paged.js and Chromium disagree on several fragmentation details — treat it as an approximation, never as the source of truth.)

#### 9.2 The rule set

```css
/* ===========================================================
   portfolio-export.css — TARGETS CHROMIUM ≥131 HEADLESS ONLY
   Do not validate in a browser print dialog; see §9.1.
   =========================================================== */

@page {
  size: 215.9mm 279.4mm;              /* US Letter; token-swapped per preset */
  margin: 18mm 15mm 20mm 20mm;        /* top right bottom left(inner) */

  /* Default footer. Per-project named pages override @bottom-left with the
     owner name + project title — see §10.4 Route A. */
  @bottom-left  { content: ""; font-size: 7.5pt; color: #6B7280; }
  @bottom-right { content: counter(page) " / " counter(pages);
                  font-size: 7.5pt; color: #6B7280; }
}

@page cover  { margin: 0; @bottom-left { content: ""; } @bottom-right { content: ""; } }
@page matter { /* front/back matter: no project title in the footer */ }

.page-cover     { page: cover;  break-after: page; }
.section-front  { page: matter; break-before: page; }
.project        { break-before: page; }        /* ← one project per page */
.project-detail { break-before: auto; }

/* --- Headings ------------------------------------------------ */
h1, h2, h3, h4 { break-after: avoid; break-inside: avoid; }
h2 + *, h3 + * { break-before: avoid; }        /* keep heading with its first block */

/* --- Prose --------------------------------------------------- */
p, li { orphans: 3; widows: 3; }
li    { break-inside: avoid; }

/* --- Atomic units -------------------------------------------- */
figure,
.metrics-strip,
.timeline-entry,
.embed-card,
.video-card,
.file-row,
.gallery-row,
tr            { break-inside: avoid; }

figcaption    { break-before: avoid; }         /* caption never orphaned from its figure */

/* Tall figures must be allowed to break, or Chromium pushes them
   to a fresh page and overflows them anyway. See §9.3. */
figure.is-tall { break-inside: auto; }

/* --- Tables -------------------------------------------------- */
thead { display: table-header-group; }         /* repeat header on every page */
tfoot { display: table-footer-group; }

/* --- Code ---------------------------------------------------- */
pre { white-space: pre-wrap; overflow-wrap: anywhere; orphans: 2; widows: 2; }

/* --- Suppress web chrome ------------------------------------- */
nav, .app-header, .sidebar, button, .no-print { display: none !important; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* --- Kill inherited web layout hazards ----------------------- */
.export-root * {
  position: static !important;   /* sticky/fixed elements duplicate on every page */
  float: none !important;        /* floats break page-break rules */
  max-height: none !important;
  overflow: visible !important;  /* scroll containers clip content in print */
  box-shadow: none !important;
  animation: none !important;
  transition: none !important;
}
```

The final block matters more than it looks. Sticky headers, scroll containers with `overflow: hidden`, and `max-height` clamps are exactly the kind of thing that survives from a web component into a print template and produces "the content is cut off" bugs that look like pagination failures.

#### 9.3 The tall-element trap

`break-inside: avoid` on an element taller than the content area is a request Chromium cannot satisfy. Its behaviour is to move the element to a new page and then let it overflow off the bottom — losing content.

Guard in the layout pass:

```js
// Runs in the page, before __EXPORT_READY__ is set.
const CONTENT_H = pageContentHeightPx();        // derived from @page size - margins @ 96dpi
document.querySelectorAll('[data-atomic]').forEach(el => {
  if (el.getBoundingClientRect().height > CONTENT_H * 0.85) {
    el.classList.add('is-tall');                // -> break-inside: auto
    el.dataset.atomic = 'false';
  }
});
```

Apply the same threshold to callouts, galleries, tables, and code panels. `0.85` leaves room for a heading above.

#### 9.4 Never-break pairs

Beyond `break-inside`, four adjacency rules keep the document from looking machine-made:

1. Heading + its first two lines of content — enforced by `break-after: avoid` plus `orphans`.
2. Figure + caption — one `<figure>`, one atomic unit.
3. Meta line + project title — both live in a `.project-header` with `break-inside: avoid`.
4. A table's header row + at least two body rows — Chromium handles this poorly on its own; if a table starts within 40 mm of the page bottom, force `break-before: page` on it.

#### 9.5 Landscape escape hatch

Wide tables and wide diagrams get their own rotated page:

```css
@page landscape-plate { size: 279.4mm 215.9mm; margin: 15mm; }
.plate--landscape { page: landscape-plate; break-before: page; break-after: page; }
```

Trigger automatically when a table has >6 columns or a figure's natural aspect ratio exceeds 2.2:1 at full width. This is far better than shrinking a table to 6 pt.

#### 9.6 Blank-page hygiene

- Suppress a trailing blank page: `break-after: page` on the last element of the document is a common cause. Emit breaks with `break-before` on the *next* section instead of `break-after` on the previous one.
- If `duplex: true`, use `@page :blank` to insert an intentionally blank verso before each project so projects always open on a recto. Mark it `This page intentionally left blank` in `footnote` style — an unexplained blank page reads as a bug.

---

### 10. Rendering pipeline

#### 10.1 Architecture

Reuse the existing BullMQ + Redis infrastructure. Export is a long-running, resource-heavy, failure-prone job — exactly what the queue is for.

```
POST /api/exports
  ├─ validate request (preset, project selection, page size)
  ├─ create exports row (status: 'queued')
  ├─ enqueue portfolio-export job
  └─ 202 { exportId }

GET /api/exports/:id            → status, progress %, warnings, downloadUrl
GET /api/exports/:id/download   → signed URL, 7-day expiry
GET /api/exports/:id/report     → the export report (§11.5)
```

Worker stages, each independently logged and timed:

```
1. LOAD       fetch profile, projects, blocks, education, endorsements     ~200 ms
2. COMPOSE    build the ExportDocument model (§10.2)                       ~50 ms
3. NORMALIZE  headings, HTML sanitization, link index, verb lint (§7)      ~100 ms
4. ASSETS     fetch, normalize, cache, stage all images (§8.2–8.3)         1–30 s  ← dominant
5. RENDER     HTML from template, launch Chromium, gates, page.pdf (§8.5)  3–15 s
6. POST       outline, metadata, resume merge, compression ladder (§13)    ~1–3 s
7. VERIFY     artifact assertions (§8.8)                                   ~500 ms
8. DELIVER    upload to object storage, sign URL, notify user              ~1 s
```

Budgets: 120 s soft timeout, 300 s hard. If ASSETS exceeds 60 s, proceed with whatever resolved and let §8.7's thresholds decide whether to ship or fail.

#### 10.2 The `ExportDocument` model

Decouple the renderer from the database. The template consumes only this; nothing in the render path touches Postgres. This makes the layout independently testable with fixtures, which is the only sane way to iterate on print CSS.

```jsonc
{
  "meta": {
    "exportId": "exp_01J…",
    "generatedAt": "2026-07-30T14:02:11Z",
    "preset": "application",          // §12
    "pageSize": "us-letter",
    "locale": "en-US",
    "accent": "#1F4E79",
    "duplex": false
  },
  "owner": {
    "name": "Jordan Rivera",
    "headline": "Mechanical Engineering · B.S. 2027",
    "contact": { "email": "…", "phone": null, "portfolioUrl": "…", "github": "…", "linkedin": "…" },
    "bio": "…",
    "headshot": { "assetId": "a_9f2c…", "localPath": "/a/9f2c….jpg" }
  },
  "skillsIndex": [
    { "group": "CAD & Simulation", "items": [ { "label": "SolidWorks", "projectCount": 4 } ] }
  ],
  "resume": { "assetId": "a_11ab…", "pageCount": 2, "mergeStrategy": "append-pages" },
  "projects": [
    {
      "id": "prj_…",
      "title": "Auto-belay for lead climbing",
      "meta": { "role": "Mechanical lead", "dates": "Sep 2025 – May 2026", "teamSize": 4,
                "tools": ["SolidWorks","ANSYS","Python"] },
      "outcome": "Areta is the first auto-belay for lead rock climbing…",
      "hero": { "assetId": "a_…", "localPath": "/a/….jpg",
                "intrinsic": { "w": 1275, "h": 850 },
                "caption": "…", "alt": "…", "status": "ok" },
      "contribution": ["Designed a speed-triggered fall-detection mechanism…"],
      "context": "Lead climbers cannot train without a partner…",
      "metrics": [ { "value": "18 °C", "label": "Peak temp reduction" } ],
      "links": [ { "label": "Repository", "url": "https://…" } ],
      "detailBlocks": [ /* normalized, print-ready block descriptors */ ],
      "warnings": [ { "code": "WEAK_VERB", "detail": "bullet 3 starts with 'helped'" } ]
    }
  ],
  "education": [ … ],
  "endorsements": [ … ],
  "assets": { "a_9f2c…": { "localPath": "…", "bytes": 184320, "status": "ok" } },
  "warnings": [ … ]
}
```

Guard rail from the existing codebase: **`json_agg` returns `null`, not `[]`, when there are no rows.** Every array in this model — `projects`, `metrics`, `links`, `detailBlocks`, `education`, `endorsements` — must be coalesced with `|| []` on receipt. A `null.map()` in the compose stage will take the whole job down, and it will only happen for users with sparse profiles, which is to say new users.

#### 10.3 Puppeteer configuration

```js
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',                       // containerized worker
    '--disable-dev-shm-usage',            // /dev/shm is small in containers; without this Chromium
                                          // crashes on large documents, intermittently
    '--font-render-hinting=none',         // consistent text metrics across hosts
    '--disable-lcd-text',
    '--force-color-profile=srgb',         // stop colour shifting between hosts
    '--export-tagged-pdf',                // §13.5
  ],
});

const pdfBytes = await page.pdf({
  preferCSSPageSize: true,   // ← REQUIRED. Without it Chromium ignores @page size
                             //   and scales content to the `format` option instead.
  printBackground: true,     // ← REQUIRED. Tints, callout panels, code panels, cover art.
  displayHeaderFooter: false,// using @page margin boxes (§10.4 route A)
  margin: { top: 0, right: 0, bottom: 0, left: 0 }, // margins come from @page
  tagged: true,              // accessible/structured PDF (experimental flag)
  outline: true,             // PDF bookmarks (experimental; verify on your version)
  timeout: 120_000,
  waitForFonts: true,
});
```

Version-pinning notes, all of which have bitten people:

- **Pin the Chromium/Puppeteer version and assert it at worker boot.** Margin boxes need ≥131. Tagged-PDF behaviour has regressed between Puppeteer minors before (tagging silently stopped defaulting on in a patch release). `outline: true` has historically only worked in old-headless on some versions.
- Tagged PDFs are **substantially larger**. One report: 1.5 MB → 45 MB on a 539-page document. For a 15-page portfolio the delta is modest, but measure it against the size budget (§13.4) and be prepared to make tagging a preset flag rather than a global default.
- If you post-process with `pdf-lib`, know that **re-saving can strip the structure tree**, undoing tagging. Do tagging-sensitive work last, or use a tool that preserves it (§13.6).

#### 10.4 Running footer — two routes

**Route A (preferred, Chromium ≥131): `@page` margin boxes.**
Clean, CSS-native, styled with the rest of the document. Limitation: `string()` / `running()` aren't supported, so the *current project title* can't be pulled from content automatically. Work around it with **named pages generated per project**:

```css
@page prj-7 { @bottom-left { content: "Jordan Rivera · Auto-belay for lead climbing"; } }
.project-7, .project-7-detail { page: prj-7; }
```

The template emits one `@page` rule per project. It's verbose generated CSS and completely reliable.

**Route B (fallback): Puppeteer `headerTemplate`/`footerTemplate`.**
Use if you must support older Chromium. Constraints from §8.6 apply in full: no external resources (base64 only), no inherited CSS (inline everything), and you **must** set explicit `margin.top`/`margin.bottom` or the templates are invisible. Available substitution classes: `pageNumber`, `totalPages`, `title`, `date`, `url`. The current project title is not available — Route B can only carry a document-level string.

Route A is worth the generated CSS.

#### 10.5 Structured logging

Mirror the existing `AGENT:*` pino convention so export failures are as debuggable as agent failures.

```
EXPORT:JOB:START        exportId preset projectCount pageSize
EXPORT:LOAD:DONE        ms projects=%d blocks=%d
EXPORT:COMPOSE:DONE     ms pages_estimated=%d
EXPORT:NORMALIZE:DONE   ms headingsRemapped=%d htmlNodesStripped=%d warnings=%d
EXPORT:ASSETS:START     total=%d
EXPORT:ASSETS:ITEM      assetId status=ok|retry|failed bytes=%d ms=%d attempt=%d
EXPORT:ASSETS:DONE      ms ok=%d failed=%d cacheHits=%d bytesTotal=%d
EXPORT:RENDER:GATE      gate=fonts|images|ready|raf ms=%d
EXPORT:RENDER:DONE      ms pages=%d bytes=%d
EXPORT:POST:COMPRESS    tier=%d bytesBefore=%d bytesAfter=%d
EXPORT:VERIFY:DONE      embeddedImages=%d expected=%d pages=%d textChars=%d
EXPORT:JOB:DONE         ms bytes=%d warnings=%d status=success|degraded
EXPORT:JOB:FAILED       stage=%s code=%s ms=%d
```

`status=degraded` is a first-class outcome: the export shipped, but with placeholders or truncation. It should be visible in the UI, not just the logs.

Add `GET /api/exports/debug/state?exportId=` returning the composed `ExportDocument` (assets redacted to metadata) — the same diagnostic pattern that made the agent pipeline tractable.

#### 10.6 Concurrency and resource control

- One Chromium instance per worker process, reused across jobs with a fresh `BrowserContext` per job. Launch cost is ~300–800 ms and you don't want to pay it per export.
- Recycle the browser every N jobs (50 is a reasonable start) — Chromium leaks over long-lived processes.
- Cap export concurrency per worker at 2. Rendering is memory-bound; four concurrent 20-page image-heavy documents will OOM a small container.
- Rate-limit per user: 5 exports per hour, 1 concurrent. Export is a trivially abusable expensive endpoint.
- Content-addressed asset cache (SHA-256 of the source bytes + normalization params) shared across jobs. A user re-exporting after a text edit should hit ~100% cache and finish in seconds.

---

### 11. Validation, verification, and the export report

#### 11.1 Preflight — before the job runs

Run these against the content and surface them **in the export dialog**, before the user waits 30 seconds for a document they'll reject.

| Check | Severity | Message |
|---|---|---|
| Project has no images | **Warning** | "Senior Design has no images. Portfolios are read visually — reviewers expect at least one photo per project." |
| Project has no outcome/summary | **Warning** | "Add a one-line outcome so reviewers know what this project achieved." |
| Project title looks like a course code (`/^[A-Z]{2,4}\s?\d{3,4}/`) | **Warning** | "'ME 2110' won't mean anything outside your department. Try a title that says what you built." |
| >8 projects selected | **Info** | "You've selected 11 projects. Portfolios are usually strongest at 3–4 for a specific application." |
| Selected projects would exceed 25 pages | **Info** | "This will be ~31 pages. Consider the Tailored preset." |
| No contact email | **Blocking** | A portfolio without contact information cannot do its job. |
| No projects selected | **Blocking** | — |
| Estimated size > 10 MB | **Warning** | "This may be too large for some application portals. We'll compress it." |
| Any asset URL returns 4xx on HEAD | **Warning** | Names the file and links to the editor. |

The course-code check is a small thing that punches above its weight — it's the exact example MIT uses, and it's mechanically detectable.

#### 11.2 In-browser layout self-checks

Run inside the page before setting `__EXPORT_READY__`; report violations into a `window.__EXPORT_DIAGNOSTICS__` array that the worker reads after render.

```js
const diagnostics = [];

// Nothing may exceed the content box horizontally.
document.querySelectorAll('.export-root *').forEach(el => {
  const r = el.getBoundingClientRect();
  if (r.right > CONTENT_RIGHT_PX + 1) {
    diagnostics.push({ code: 'OVERFLOW_X', el: describe(el), overflowPx: r.right - CONTENT_RIGHT_PX });
  }
});

// No zero-height images (decoded but not laid out).
document.querySelectorAll('img').forEach(img => {
  if (img.getBoundingClientRect().height < 1) {
    diagnostics.push({ code: 'IMG_ZERO_HEIGHT', src: img.src });
  }
});

// Body measure inside 50–75 characters.
document.querySelectorAll('.prose p').forEach(p => {
  const chars = measureCharsPerLine(p);
  if (chars > 78) diagnostics.push({ code: 'MEASURE_TOO_WIDE', chars });
});

// Exactly one h1 per project.
document.querySelectorAll('.project').forEach(prj => {
  const n = prj.querySelectorAll('h1').length;
  if (n !== 1) diagnostics.push({ code: 'H1_COUNT', count: n, project: prj.dataset.title });
});

window.__EXPORT_DIAGNOSTICS__ = diagnostics;
```

`OVERFLOW_X` is the single most valuable check here. It catches wide tables, long unbroken URLs, oversized code lines, and images that escaped the sizing policy — all of which are invisible in a browser (which just scrolls) and catastrophic in a PDF (which clips).

#### 11.3 Artifact verification

See §8.8. Fail the job on: image count mismatch >5%, page count outside the estimate ±20%, extracted text under 200 chars per project, missing document title metadata.

#### 11.4 Table of contents page numbers (phase 2)

Real page numbers require knowing the pagination, which requires rendering. Two-pass:

1. **Pass 1.** Render the document with an unnumbered TOC. At the start of each project, emit an invisible marker in the text layer:
   `<span class="toc-marker">⟦PRJ:{id}⟧</span>` styled `font-size:0.1pt; color:#fff;` — present in the extracted text, absent to the eye.
2. Extract per-page text with `pdfjs-dist`; regex the markers; build `{ projectId → pageNumber }`.
3. **Pass 2.** Re-render with real numbers injected into the TOC and the markers removed.

Cost: roughly doubles render time (5→12 s typical). Acceptable for a background job; gate it behind `preset !== 'quick'`.

Do not attempt to compute page numbers by measuring `offsetTop / pageHeight` in the DOM. Fragmentation, `break-inside` adjustments, and orphan/widow control all shift content in ways that arithmetic won't predict, and a TOC that's off by one is worse than no TOC.

#### 11.5 The export report

Every export produces a machine-readable report, surfaced in the UI after download and retrievable at `GET /api/exports/:id/report`.

```jsonc
{
  "status": "degraded",
  "pages": 14,
  "bytes": 4128394,
  "durationMs": 18422,
  "warnings": [
    { "code": "IMAGE_FAILED", "severity": "high", "projectId": "prj_3",
      "detail": "heat-sink-test.jpg could not be loaded",
      "action": { "label": "Re-upload image", "href": "/projects/prj_3/edit#block_88" } },
    { "code": "NO_IMAGES", "severity": "high", "projectId": "prj_5",
      "detail": "Control Systems Lab has no images." },
    { "code": "WEAK_VERB", "severity": "low", "projectId": "prj_1",
      "detail": "3 contribution bullets begin with weak verbs (helped, worked on, used)." },
    { "code": "GALLERY_TRUNCATED", "severity": "low", "projectId": "prj_2",
      "detail": "Showed 12 of 34 gallery images." },
    { "code": "TABLE_ROTATED", "severity": "info", "projectId": "prj_4",
      "detail": "A 9-column table was placed on a landscape page." }
  ]
}
```

Every warning carries a **deep link back into the editor**. A warning the user can't act on is noise.

#### 11.6 Golden-file regression testing

Print CSS regressions are invisible until someone opens a PDF. Automate it:

- Maintain ~10 fixture `ExportDocument` JSON files covering: minimal profile, no images, 40-image gallery, 9-column table, 300-line code block, RTL text, a 6 000-word project, all 13 block types in one project, dark-mode-authored HTML, and a project with every field empty except the title.
- On CI, render each to PDF, rasterize every page at 100 DPI, and compare to a committed golden PNG with a perceptual diff (threshold ~0.1%).
- Also assert the structural invariants: page count, image count, exactly one H1 per project, zero `OVERFLOW_X` diagnostics.

This is the only reliable way to change the stylesheet without fear, and it will pay for itself the first time a Chromium bump changes fragmentation behaviour.

---

### 12. Presets and user options

#### 12.1 Presets

| Preset | Projects | Detail flow | Page size | DPI | Target size | Use |
|---|---|---|---|---|---|---|
| `application` **(default)** | User-selected, default all | Yes | Letter/A4 portrait | 150 | < 5 MB | Attach to a job application |
| `tailored` | 3–4, user-ordered | **Summary pages only** | Letter/A4 portrait | 150 | < 2 MB | The MIT-recommended per-recipient cut |
| `interview` | User-selected | Yes | Letter portrait, `duplex: true` | 200 | < 12 MB | Printed, bound, brought to an interview (8–12 pages is the target) |
| `master` | All | Yes | Letter/A4 portrait | 150 | no cap | The complete archive the user cuts down from |
| `print-ready` | User-selected | Yes | Letter/A4 + 3 mm simulated bleed, crop marks | 300 | no cap | Sending to a print shop |
| `screen` | User-selected | Yes | A4 landscape | 150 | < 5 MB | Reviewed on a laptop |

`tailored` is the preset that most directly encodes the research: keep a master portfolio, and select from it per recipient. It should be prominent in the UI, not buried.

#### 12.2 User-controllable options

| Option | Values | Default |
|---|---|---|
| `pageSize` | `us-letter` \| `a4` \| `a4-landscape` | by locale |
| `accentColor` | hex, validated for ≥4.5:1 contrast on white | brand default |
| `bodyTypeface` | `sans` \| `serif` | `sans` |
| `includeResume` | bool | `true` if a resume is uploaded |
| `includeEducation` | bool | `true` |
| `includeEndorsements` | bool | `true` |
| `includeContact` | `full` \| `email-only` \| `none` | `full` |
| `duplex` | bool | `false` |
| `mergePdfAttachments` | bool | `false` |
| `sectionOrder` | `work-first` \| `credentials-first` | `work-first` (`credentials-first` for grad-school applications) |
| `projectSelection` | ordered array of project ids | all, in site order |

Everything else is fixed. Resist the pressure to expose margins, type sizes, or grid columns — those are the parts of the system that make output look professional, and they are exactly what users will break.

---

### 13. Output formats and delivery

#### 13.1 Formats

| Format | Priority | Notes |
|---|---|---|
| **PDF** | **P0** | The only format that preserves layout. Everything above targets it. |
| **ZIP asset bundle** | P1 | `portfolio.pdf` + `/assets/originals/` (full-resolution source images, original filenames) + `README.txt`. Cheap to build, and it's what a user needs when they want to rebuild the document in InDesign or hand images to a print shop. |
| **DOCX** | P2 | Requested by users who "want to edit it." Be honest in the UI that layout fidelity is approximate: no margin boxes, no controlled fragmentation, images anchored inline. Generate from a simplified template — do **not** try to reproduce the PDF layout. |
| **PPTX** | P3 | One slide per project summary page, 16:9. Genuinely useful for design-review-style interviews. |
| **Static HTML bundle** | P3 | Self-contained, offline-viewable. Low effort if the print template is already HTML. |

#### 13.2 File naming

```
Jordan-Rivera-Portfolio-2026-07.pdf
Jordan-Rivera-Portfolio-Mechanical-Design-2026-07.pdf   // when a preset label is set
```

Owner name first (it's how a recruiter's downloads folder gets sorted), no spaces, no export ID, dated to the month. `portfolio_export_a91f2.pdf` is a small thing that makes the product feel unfinished.

#### 13.3 Resume merge

If the user has uploaded a resume PDF, append its pages verbatim at the front-matter position — never re-typeset it. Use `pdf-lib` `copyPages`. Guard rails: max 4 pages, reject encrypted PDFs with a clear message, and validate that the page size roughly matches (a resume on A4 inside a Letter portfolio is fine; a resume on A3 is not — scale it).

Because merging happens with `pdf-lib` and re-saving **can strip the structure tree**, sequence matters (§13.6).

#### 13.4 Size budget and the compression ladder

Budget: **< 5 MB target, < 10 MB hard ceiling.** If the rendered artifact exceeds the target, walk the ladder and stop as soon as it's under, logging which tier was used:

| Tier | Action | Typical saving |
|---|---|---|
| 0 | Baseline (150 DPI, JPEG q82, subset fonts) | — |
| 1 | JPEG quality 82 → 72 | 20–30% |
| 2 | DPI 150 → 120 | 25–35% |
| 3 | Gallery images → 110 DPI (they're small on the page anyway) | 10–20% |
| 4 | Drop PDF tagging (rebuild untagged) | varies, can be large |
| 5 | Cap galleries at 6 items; cap total images at 40 | large |
| 6 | Emit `application` preset without detail flow, warn the user | large |

Never silently apply tier 5 or 6 — those change what's in the document, so they're warnings in the export report, not invisible optimizations. Tiers 1–3 are safe to apply silently.

If the document still exceeds 10 MB at tier 6, deliver it anyway with a prominent warning and a suggestion to use the `tailored` preset. The research is consistent that recruiters often prefer a *link* to a heavy attachment — so the colophon QR code (§3) is also the escape valve.

#### 13.5 Accessibility and text integrity

- **Text must be real text.** Never rasterize a page. Assert extracted text length in verification (§8.8) — a page of images with no text layer is a rendering failure, and it also means an ATS or a recruiter's Ctrl+F finds nothing.
- **Tagged PDF** via `--export-tagged-pdf` + `tagged: true`. This carries the heading hierarchy and image `alt` text into the PDF structure tree. It is the reason §7.1's heading normalization and §8.4's mandatory `alt` matter beyond aesthetics.
- **Document outline / bookmarks** via `outline: true`, giving a navigable project list in any PDF reader. Verify on your pinned version — this option has had headless-mode limitations.
- Set PDF metadata explicitly: `Title` = "Jordan Rivera — Portfolio", `Author` = owner name, `Subject` = headline, `Keywords` = skill tags, `Creator` = "Projectfolio". Blank metadata is a small unprofessional detail that shows in a reader's title bar.
- Set the document language (`/Lang`) from the user's locale.

#### 13.6 Post-processing order

Because `pdf-lib` re-saves can strip tags, order the post stage deliberately:

```
render (tagged) → merge resume (pdf-lib) → RE-VERIFY tagging
      ↳ if tagging lost: either accept untagged, or re-render with the resume
        pages rasterized-in at the template level (worse), or use qpdf/Ghostscript
        for the merge instead of pdf-lib.
→ set metadata → set outline → compression ladder → verify → deliver
```

Test this on your exact library versions. Report the tagging status in the export report so the behaviour is observable rather than assumed.

---

### 14. Degradation policy

The governing principle: **a document that is visibly incomplete is better than one that is invisibly incomplete.**

| Situation | Behaviour |
|---|---|
| One image fails | Placeholder + caption retained; warning with a fix link |
| A project's hero fails | Summary page reflows to a text-forward variant (outcome expands, contribution/context go 6/6); warning |
| >20% of images fail | **Fail the job**; user-facing message suggests retry |
| Zero images resolve | **Fail the job**; treat as infrastructure fault, alert |
| A `text` block is empty after sanitization | Remove it, and remove its heading if the heading is then orphaned |
| Gallery >12 items | Show 12, append `+N more at {url}`; warning |
| Code block >60 lines | Truncate with a line count and a repo link; warning |
| Table >6 columns | Rotate to a landscape plate; if still overflowing, shrink to 7 pt; if still overflowing, truncate columns with a note |
| A project has no content beyond a title | Render the summary page with title + meta only; warning |
| Render times out | Retry once with `preset: tailored` (summary pages only) and mark `degraded`; if that fails, fail the job |
| Chromium crashes | Retry twice with a fresh browser instance; then fail |
| Resume PDF is encrypted/corrupt | Skip it, warn, continue |

Failures are **loud in the report, quiet in the document**. Never print "ERROR" into a document a student is going to hand to an employer.

---

### 15. Implementation phases

**Phase 1 — Structural correctness.** The largest perceived-quality jump; ship this first.
- `ExportDocument` model + compose stage, with `|| []` coalescing throughout
- Cover page, page geometry, 12-column grid, type scale, running footer (Route A)
- Forced page break per project; project summary page template with field-derivation fallbacks
- Heading rank normalization; HTML sanitization pass
- Image pipeline: local materialization, `sharp` normalization, four readiness gates, placeholder policy
- Block render map for `heading`, `text`, `image`, `divider`, `callout`, `metrics`
- BullMQ job, `EXPORT:*` logging, status endpoint

**Phase 2 — Completeness.**
- Remaining block types: `table`, `code`, `gallery`, `timeline`, `embed`, `video`, `file`
- Landscape plates; tall-element guard
- Artifact verification; export report with deep links; preflight warnings
- Presets (`application`, `tailored`, `master`); resume merge
- Compression ladder
- Golden-file regression suite

**Phase 3 — Polish and reach.**
- Numbered TOC (two-pass); PDF outline; tagged PDF; metadata
- `print-ready` (bleed simulation, crop marks, 300 DPI) and `interview` (duplex) presets
- ZIP asset bundle
- `by-skill` organization (needs a per-project-per-skill relevance field)
- In-app print preview (Paged.js, clearly labelled as an approximation)
- DOCX / PPTX

**Phase 4 — Intelligence.** Only after the deterministic path is solid.
- Suggested outcome statements and contribution bullets from block content, always as an editor suggestion the user accepts — never applied silently in the export path
- Suggested hero-image selection
- Per-application tailoring: paste a job description, get a suggested project selection and ordering

The ordering matters. An AI feature layered on a pipeline that drops images will be blamed for dropping images.

---

### 16. Acceptance criteria

A build ships when all of these hold across the fixture set:

**Structure**
- [ ] Every project begins on a new page.
- [ ] Every project's first page matches the summary template, with no empty slots.
- [ ] Exactly one `h1` per project; no `h1` originates from user content.
- [ ] Author heading hierarchy is preserved in relative order and normalized to h2/h3/h4.
- [ ] Cover, and running footer with page number on every non-cover page.
- [ ] No trailing blank page.

**Images**
- [ ] 100% of resolvable images appear in the output PDF, verified by XObject count.
- [ ] Every project has at least one visual, or a warning explaining why not.
- [ ] Hero image occupies 35–42% of the summary page's content height.
- [ ] No figure is separated from its caption.
- [ ] No broken-image glyph or zero-height image box anywhere.
- [ ] Ten consecutive renders of the same document produce byte-identical image counts.

**Typography and text**
- [ ] Body measure is 50–75 characters on every prose paragraph.
- [ ] No text renders in a colour lighter than #6B7280 on white.
- [ ] No inline `style` or `class` attributes survive into the render.
- [ ] No paragraph has fewer than 3 lines at a page boundary.
- [ ] Zero `OVERFLOW_X` diagnostics.

**Artifact**
- [ ] Text is selectable; extracted text > 200 chars per project.
- [ ] File size < 5 MB for a 6-project, 30-image portfolio at default preset.
- [ ] Opens cleanly in Preview, Acrobat, Chrome's viewer, and Google Drive preview.
- [ ] Prints correctly on a physical printer, with nothing lost in the binding margin.
- [ ] Filename follows §13.2.

**Behaviour**
- [ ] Median export completes in < 20 s for a 6-project portfolio.
- [ ] Degraded exports are labelled as such in the UI with actionable warnings.
- [ ] An export with zero resolvable images fails rather than delivering.

**The manual test that matters most:** print it, put it in a three-ring binder, and hand it to someone. If they can find a specific project in under ten seconds and understand what it achieved in under thirty, it works. That's the actual standard the document is being measured against.

---

### 17. Sources

Content and structural standards:
- MIT Mechanical Engineering Communication Lab — *CommKit: Portfolio* (criteria for success, inverted-pyramid project page, visual practice, 30–60 second skim, one project per page, 3–4 projects, master-portfolio-then-tailor)
- Utah State University College of Engineering — *Engineering Portfolio* (title page → index → intro → resume → projects; per-project title/dates/description/photos; ≥1 photo filling ~⅓ of the page; print in colour and bind; update each semester)
- Boston University College of Engineering, Career Development Office — *Engineering Portfolio* one-pager (organize by skill; list skills used per project; highlight individual contribution on team projects)
- University of California, Irvine, Engineering Undergraduate Student Affairs — *Engineering Portfolio* (what to document as you go; physical vs. electronic; QR code at career fairs, print copy at interviews)
- Washington University in St. Louis, Center for Career Engagement — *How to create an engineering portfolio* (discipline-specific artifact types)
- ASEE — *Engineering Portfolios: Value, Use, and Examples* (group by theme or competency rather than an uncategorized list)
- University of Washington career portfolio checklist (8–12 pages for an interview-facing portfolio)

Layout, typography, and file constraints:
- illustrarch — *Architecture Portfolio Layout: Grid and Typography* (12-column grid, 15–20 mm margins, 4–6 mm gutters, 9–10 pt body, 50–75 character measure, 120–145% leading, one or two typefaces, reusable page templates, < 10 MB / ~5 MB preferred)
- Portfolio compression and portal-limit guidance (150 DPI for screen-read portfolio PDFs; size images to display dimensions before export; 10 MB portal ceilings)

Rendering engine behaviour:
- MDN — *CSS paged media*, *`@page`*, *`page`* (support status; margin at-rules; named pages)
- Chrome for Developers — *Add content to the margins of web pages when printed* (margin boxes and page counters from Chrome 131)
- Nathan Friend — *PDF Gotchas with Headless Chrome* (header/footer templates cannot load external resources; do not inherit page CSS; require explicit margins; page breaks fail inside tables, floats, inline-block, bordered blocks, and flex; wait for a readiness flag)
- André Arko — *Chrome "Print to PDF" and headless `--print-to-pdf` aren't the same* (headful ignores CSS page dimensions; headless silently refuses `@page` `url()` resources; data URIs work; Puppeteer and `chrome --headless` share a code path; Paged.js and Chromium disagree)
- Puppeteer `PDFOptions` documentation (`preferCSSPageSize`, `printBackground`, `tagged`, `outline`, `waitForFonts`) and issue tracker (`--export-tagged-pdf` defaults and file-size impact; tagged-PDF regressions across versions; `ERR_UNSAFE_PORT`; `img.complete && naturalWidth > 0` readiness pattern; screenshot-then-pdf as a symptom of a readiness race)

---

## Appendix A — Project summary page: reference markup

Structure the template so that every element the page contract requires has a home, and every optional element can vanish without collapsing the grid.

```html
<section class="project" data-project-id="prj_7" data-title="Auto-belay for lead climbing">
  <span class="toc-marker">⟦PRJ:prj_7⟧</span>

  <header class="project-header">
    <h1 class="project-title">Auto-belay for lead climbing</h1>
    <p class="project-meta">
      Mechanical lead <span aria-hidden="true">·</span>
      Sep 2025 – May 2026 <span aria-hidden="true">·</span>
      Team of 4 <span aria-hidden="true">·</span>
      SolidWorks, ANSYS, Python
    </p>
  </header>

  <p class="project-outcome">
    Areta is the first auto-belay for lead rock climbing. I designed the
    speed-triggered fall-detection mechanism that engages a magnetic damper
    and lowers the climber safely to the ground.
  </p>

  <figure class="project-hero" data-atomic style="--aspect: 1.5">
    <img src="http://127.0.0.1:41337/a/9f2c1a.jpg"
         width="1600" height="1067" loading="eager" decoding="sync"
         alt="Areta auto-belay unit mounted on a climbing wall">
    <figcaption>Fig. 1 — Production prototype during wall testing at the MIT climbing gym.</figcaption>
  </figure>

  <div class="project-split">
    <div class="col-contribution">
      <h2 class="eyebrow">My contribution</h2>
      <ul>
        <li>Designed the speed-triggered fall-detection mechanism (fail-safe on power loss).</li>
        <li>Analyzed damper braking torque across a 40–110 kg climber range in ANSYS.</li>
        <li>Machined and instrumented three iterations of the clutch assembly.</li>
      </ul>
    </div>
    <div class="col-context">
      <h2 class="eyebrow">Context</h2>
      <p>Lead climbers cannot train without a partner. Existing auto-belays only
         support top-rope. Constraints: $2,400 budget, two-semester timeline,
         and a hard requirement to fail safe under any single-point failure.</p>
    </div>
  </div>

  <div class="metrics-strip" data-atomic>
    <div class="metric"><span class="metric-value">0.4 s</span><span class="metric-label">Fall detection</span></div>
    <div class="metric"><span class="metric-value">110 kg</span><span class="metric-label">Rated load</span></div>
    <div class="metric"><span class="metric-value">3</span><span class="metric-label">Prototype iterations</span></div>
  </div>

  <p class="continues">↳ continues p.<span data-page-ref="prj_7-detail"></span></p>
</section>
```

```css
.project           { break-before: page; }
.project-header    { break-inside: avoid; margin-bottom: 8mm; }
.project-title     { font-size: 20pt; line-height: 24pt; font-weight: 600; letter-spacing: -0.01em; }
.project-title::after {
  content: ""; display: block; width: 100%; height: 1.2pt;
  background: var(--accent); margin-top: 3mm;
}
.project-meta      { font-size: 8.5pt; line-height: 12pt; font-weight: 500;
                     letter-spacing: 0.06em; text-transform: uppercase; color: #6B7280;
                     margin-top: 3mm; }

.project-outcome   { font-size: 11.5pt; line-height: 16pt; max-width: 68ch; margin-bottom: 8mm; }

.project-hero      { break-inside: avoid; margin-bottom: 8mm; }
.project-hero img  { width: 100%; height: 38vh; /* ~38% of content height */
                     object-fit: cover; display: block; }

.project-split     { display: grid; grid-template-columns: repeat(12, 1fr);
                     gap: 5mm; margin-bottom: 8mm; }
.col-contribution  { grid-column: span 7; }
.col-context       { grid-column: span 5; }
/* Degradation: when one column has no content, the other takes all 12. */
.project-split:not(:has(.col-context))      .col-contribution { grid-column: span 12; }
.project-split:not(:has(.col-contribution)) .col-context      { grid-column: span 12; }

.eyebrow           { font-size: 7.5pt; line-height: 10pt; font-weight: 600;
                     letter-spacing: 0.08em; text-transform: uppercase;
                     color: #6B7280; margin-bottom: 3mm; break-after: avoid; }

.metrics-strip     { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
                     border-top: 0.5pt solid #E5E7EB; border-bottom: 0.5pt solid #E5E7EB;
                     padding: 4mm 0; break-inside: avoid; }
.metric-value      { display: block; font-size: 18pt; font-weight: 600; color: var(--accent); }
.metric-label      { display: block; font-size: 7.5pt; letter-spacing: 0.08em;
                     text-transform: uppercase; color: #6B7280; }

.toc-marker        { font-size: 0.1pt; color: #FFFFFF; }
.continues         { font-size: 7.5pt; color: #6B7280; margin-top: auto; }
```

Note `height: 38vh` on the hero: in a paged context `vh` resolves against the page box, which is what makes the "hero fills ~38% of the page" rule enforceable in CSS rather than in JS. Verify this against your Chromium version in the golden-file suite — if it resolves against the viewport instead, substitute a computed `mm` value from the page-size token.

---

## Appendix B — Compose stage skeleton

```js
/**
 * Build the ExportDocument. Pure: no network, no Chromium, fully unit-testable.
 */
export function composeExportDocument({ profile, projects, education, endorsements, options }) {
  const doc = {
    meta: buildMeta(options),
    owner: buildOwner(profile, options),
    skillsIndex: buildSkillsIndex(projects || []),
    resume: profile.resumeAssetId ? { assetId: profile.resumeAssetId } : null,
    projects: [],
    education: options.includeEducation ? (education || []) : [],
    endorsements: options.includeEndorsements
      ? (endorsements || []).filter(e => e.status === 'approved')
      : [],
    assets: {},
    warnings: [],
  };

  const selected = selectAndOrderProjects(projects || [], options);

  for (const project of selected) {
    // json_agg returns null, not [], when a project has no blocks.
    const rawBlocks = project.blocks || [];

    const blocks = pipe(
      rawBlocks,
      dropEmptyBlocks,
      normalizeHeadingLevels,        // §7.1
      dropTitleDuplicateHeading(project.title),
      collapseConsecutiveHeadings,
      sanitizeTextBlocks,            // §7.2
      applyTypographicPolish,        // §7.3
      buildLinkIndex,                // §7.4
      assignPrintLayout,             // §7.6 block render map
    );

    const summary = deriveSummaryFields(project, blocks);   // §6.2 fallback ladder
    const detail  = blocks.filter(b => !summary.consumedBlockIds.has(b.id));

    doc.warnings.push(
      ...lintContributionVerbs(summary.contribution, project.id),   // §6.3
      ...lintProjectCompleteness(project, summary),                 // §11.1
    );

    doc.projects.push({
      id: project.id,
      title: project.title,
      meta: summary.meta,
      outcome: summary.outcome,
      hero: summary.hero,
      contribution: summary.contribution,
      context: summary.context,
      metrics: summary.metrics,
      links: summary.links,
      detailBlocks: options.preset === 'tailored' ? [] : detail,
    });
  }

  registerAssetRefs(doc);   // populates doc.assets for the ASSETS stage
  return doc;
}
```

The important property: **this function never fails on sparse data.** Every accessor coalesces, every derivation has a fallback, and anything it can't resolve becomes a warning rather than an exception. New users with one half-finished project are the most common export case and the one most likely to break a naive implementation.
