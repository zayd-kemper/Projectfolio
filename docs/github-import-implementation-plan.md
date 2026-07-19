# Implementation Plan — Import Project from GitHub

**Target:** Projectfolio (React 18 + Vite / Node + Express / PostgreSQL / BullMQ + Redis / pino)
**Audience:** Claude Code (implementing agent)
**Status of this doc:** Data mappings below are verified against the live schema and seed rows. Code marked "verified" is drop-in; treat wiring sections as the build list.

---

## 1. Objective

Wire up the existing (non-functional) "Import project from GitHub" button so that submitting a public GitHub repo URL produces a **draft project** in the user's editor: title, tagline, tags, links, dates pre-filled from repo metadata, and a body of editor blocks seeded from the repo's README. The user then refines and publishes.

## 2. Core theory (read before implementing)

A GitHub repo is a tree of source files. Projectfolio's editor is a block-based presentation surface. **These do not map onto each other and no attempt should be made to translate a source tree into blocks.**

What maps is the repo's **presentation surface**, which is already document-shaped:

- **Repo metadata** (name, description, topics, languages, homepage, dates, contributors) → the project's structured fields.
- **README markdown** → editor blocks, near 1:1 because markdown block types line up with the editor's block types.

The feature is therefore a **seed/draft generator, not a converter**. Success = the user starts at ~70% instead of a blank page. The editor's richer block types (gallery, metrics, timeline, embed, video) are what the *user* adds afterward; import does not attempt to synthesize them (with two cheap exceptions noted in §7).

## 3. Architecture & flow

```
Frontend (editor)                Backend (Express)              Worker (BullMQ)
──────────────────               ─────────────────              ───────────────
[Import from GitHub]  ──POST──▶  POST /api/import/github  ──▶   github-import job
  paste repo URL                 - validate + parse URL         1. 4 GitHub REST calls
  (job id returned)              - enqueue job                  2. projectFromRepo()  → payload
                                 - return { jobId }             3. fetch README, readmeToBlocks()
                                                                4. (optional) rehost images → media
        ◀── poll / notify ──     GET /api/import/github/:jobId  5. create draft project + blocks
  open draft in editor           - job status + projectId       6. mark job done, attach projectId
```

Run the transform in a **BullMQ worker**, not the request handler: it makes several network calls and (in the durable variant) downloads images, which is too slow and failure-prone for a request cycle. This matches the pattern already used elsewhere in the codebase. Use pino `AGENT`-style structured logging (`IMPORT:*`) for each stage so failures are traceable.

## 4. Phased scope — build in this order

**Phase 1 — MVP (public repos, no auth).** Paste a public repo URL. Unauthenticated GitHub REST works fine here; mind the **60 req/hr** unauthenticated limit (4 calls per import → ~15 imports/hr/IP, acceptable for MVP). Ship this and validate mapping quality before anything else. Images **hotlinked** to `raw.githubusercontent.com` in Phase 1 is acceptable.

**Phase 2 — Durability.** Add the image-rehosting worker step (§6.3) so imported images enter the existing media pipeline instead of hotlinking. This is the step with the most sharp edges; do it once Phase 1 proves the transform.

**Phase 3 — Auth & private repos.** GitHub OAuth + repo picker UI + private repo support + authenticated rate limit (5000 req/hr). Only after Phases 1–2 are solid.

**Phase 4 (optional) — AI enrichment.** Run the imported body through the existing site agent to rewrite developer-oriented README prose into portfolio-appropriate copy and generate a one-line summary. Reuses existing infrastructure; purely additive.

## 5. GitHub data acquisition

Four REST calls per import (base `https://api.github.com`):

| Call | Purpose |
|------|---------|
| `GET /repos/{owner}/{repo}` | name, description, homepage, html_url, full_name, created_at, pushed_at, **default_branch** |
| `GET /repos/{owner}/{repo}/languages` | language keys → technology tags |
| `GET /repos/{owner}/{repo}/topics` | topic array → technology tags (send `Accept: application/vnd.github+json`) |
| `GET /repos/{owner}/{repo}/contributors` | contributor logins → collaborators |

README: `GET /repos/{owner}/{repo}/readme` returns base64 content, or fetch `https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/README.md`. **Capture `default_branch` from the first call** — do not assume `main`; it's required for rewriting relative image URLs.

URL parsing: accept `https://github.com/{owner}/{repo}`, with or without trailing `.git` or extra path segments. Reject anything that doesn't resolve to an `owner/repo` pair.

## 6. Component specs

### 6.1 Repo → project payload (VERIFIED against `buildProjectPayload`)

Output feeds directly into the existing `buildProjectPayload(project, 'draft')`.

```js
const PROJECT_TYPE_FALLBACK = 'Software'; // user re-picks from the existing dropdown

// { repo, languages, topics, contributors } from the 4 calls in §5
const projectFromRepo = ({ repo, languages = {}, topics = [], contributors = [] }) => {
  const technologies = [...new Set([...Object.keys(languages), ...topics])];

  return {
    title: (repo.name || '').replace(/[-_]/g, ' '),   // "cfd-solver" → "cfd solver"
    tagline: repo.description || '',
    description: '',                                    // body lives in blocks, not here
    project_type: PROJECT_TYPE_FALLBACK,
    technologies,                                       // feeds the existing tech/tool filter
    collaborators: contributors
      .filter(c => c.type === 'User')                   // drop bots
      .slice(0, 6)
      .map(c => c.login),
    cover_image_url: `https://opengraph.githubassets.com/1/${repo.full_name}`,
    github_url: repo.html_url || '',
    live_url: repo.homepage || '',
    start_date: repo.created_at ? repo.created_at.slice(0, 10) : '',  // YYYY-MM-DD
    end_date: repo.pushed_at ? repo.pushed_at.slice(0, 10) : '',
    status: 'draft',
    is_featured: false,
  };
};
```

**Design decisions (intentional — change only with reason):**
- `project_type` defaults to `'Software'` rather than being guessed. The type list (Robotics, Simulation / CFD, Hardware, Data Science, …) can't be inferred reliably from topics; a wrong guess costs the user more than a neutral default they change in one click.
- `cover_image_url` uses GitHub's auto-generated OG card as a placeholder. In Phase 2, route it through the media pipeline (same durability reason as README images).
- `description` is intentionally empty — the narrative body is blocks, not this field.

### 6.2 README → blocks (VERIFIED against real block rows)

Verified block shapes present in the schema: `heading {text, level}`, `code {code, language}`, `image {url, alt, caption}`, `table {headers, rows}`, `text {html}`, plus `callout`, `divider`, `embed`, `file`, `gallery`, `metrics`, `timeline`, `video`.

**Critical schema facts that shape the transform:**
- There is **no** `paragraph`, `list`, or `blockquote` block type. Paragraphs, lists, and quotes live *inside* `text` blocks as HTML (`{ html: "<p>…</p><ul>…</ul>" }`).
- Rich text is stored as **HTML**, not TipTap/ProseMirror JSON.
- `table` separates `headers` from `rows`.

```js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdToString } from 'mdast-util-to-string';

// Verified block shapes.
const B = {
  heading: (level, text) => ({ type: 'heading', content: { text, level } }),
  code:    (language, code) => ({ type: 'code',  content: { code, language: language || 'text' } }),
  image:   (url, alt) => ({ type: 'image', content: { url, alt, caption: '' } }),
  table:   (headers, rows) => ({ type: 'table', content: { headers, rows } }),
  text:    (html) => ({ type: 'text', content: { html } }),
};

const rawBase = (owner, repo, branch) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;

const absolutize = (src, base) =>
  /^https?:\/\//i.test(src) ? src : new URL(src.replace(/^\.\//, ''), base).href;

const escapeHtml = (s) => s.replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function inlineToHtml(node, base) {
  return (node.children || []).map(child => {
    switch (child.type) {
      case 'text':       return escapeHtml(child.value);
      case 'strong':     return `<strong>${inlineToHtml(child, base)}</strong>`;
      case 'emphasis':   return `<em>${inlineToHtml(child, base)}</em>`;
      case 'inlineCode': return `<code>${escapeHtml(child.value)}</code>`;
      case 'link':       return `<a href="${child.url}">${inlineToHtml(child, base)}</a>`;
      case 'image':      return `<img src="${absolutize(child.url, base)}" alt="${escapeHtml(child.alt || '')}">`;
      case 'break':      return '<br>';
      default:           return escapeHtml(mdToString(child));
    }
  }).join('');
}

// paragraph / list / blockquote → HTML fragments that live inside one `text` block
function richNodeToHtml(node, base) {
  switch (node.type) {
    case 'paragraph':
      return `<p>${inlineToHtml(node, base)}</p>`;
    case 'blockquote':
      return `<blockquote>${node.children.map(c => richNodeToHtml(c, base)).join('')}</blockquote>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const items = node.children.map(li => {
        const inner = li.children
          .map(c => c.type === 'paragraph' ? inlineToHtml(c, base) : richNodeToHtml(c, base))
          .join('');
        return `<li>${inner}</li>`;
      }).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    default:
      return `<p>${escapeHtml(mdToString(node))}</p>`;
  }
}

const RICH = new Set(['paragraph', 'list', 'blockquote']);

export function readmeToBlocks(markdown, { owner, repo, branch = 'main' }) {
  const base = rawBase(owner, repo, branch);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const blocks = [];
  let buffer = []; // accumulates consecutive rich nodes into one text block

  const flush = () => {
    if (buffer.length) {
      blocks.push(B.text(buffer.map(n => richNodeToHtml(n, base)).join('')));
      buffer = [];
    }
  };

  for (const node of tree.children) {
    const loneImg = node.type === 'paragraph' && node.children.length === 1
      && node.children[0].type === 'image' ? node.children[0] : null;

    if (loneImg) {
      flush();
      blocks.push(B.image(absolutize(loneImg.url, base), loneImg.alt || ''));
    } else if (RICH.has(node.type)) {
      buffer.push(node);                              // coalesce
    } else if (node.type === 'heading') {
      flush();
      blocks.push(B.heading(node.depth, mdToString(node)));
    } else if (node.type === 'code') {
      flush();
      blocks.push(B.code(node.lang, node.value));
    } else if (node.type === 'table') {
      flush();
      const [head, ...body] = node.children;
      blocks.push(B.table(
        head.children.map(c => mdToString(c)),
        body.map(r => r.children.map(c => mdToString(c))),
      ));
    } else if (node.type === 'thematicBreak') {
      flush();
      blocks.push({ type: 'divider', content: {} });
    }
  }
  flush();
  return blocks;
}
```

**Design decisions (intentional):**
- **Coalescing:** consecutive paragraphs/lists/quotes buffer into a *single* `text` block, flushed only when a heading/code/image/table/divider interrupts. This matches how the editor naturally groups rich text (seed rows show `<p>` + `<ul>` together in one `text` block), so output reads as authored, not shredded.
- **Blockquotes → `text` HTML** (`<blockquote>`), **not** the `callout` type. A callout carries an emoji and is a deliberate authoring choice; a README `>` isn't that, so mapping to `callout` would fabricate intent. (To override: emit `{ type: 'callout', content: { text: mdToString(node), emoji: 'i' } }` in the blockquote branch.)
- **Unmapped types:** `gallery`, `metrics`, `timeline`, `embed`, `video` are richer than plain markdown expresses; nothing maps to them in the first pass. See §7 for two cheap follow-ups.

Output flows untouched into the existing `buildBlockSyncPayload(blocks)`, which stamps `id: null` and `sort_order`.

### 6.3 Image rehosting worker step (Phase 2)

Hotlinking to `raw.githubusercontent.com` works but is fragile: if the user renames/deletes the repo or changes the default branch, portfolio images break. For a durable portfolio, download each imported image into the existing media pipeline and rewrite block URLs to the hosted copy.

Sequence inside the worker, after `readmeToBlocks`:
1. Collect image URLs: `image` block `content.url`, plus `<img src>` inside `text` block HTML, plus the OG cover image.
2. Download each (cap size/count; skip non-image content-types; timeout per fetch).
3. Push through the existing media upload path so they get the same storage + URL treatment as user uploads.
4. Rewrite the corresponding block URLs (and `cover_image_url`) to the hosted URLs before persisting.
5. On individual image failure, keep the original remote URL rather than failing the whole import; log `IMPORT:image_rehost_failed`.

### 6.4 Persistence

At the end of the worker: create the project via the existing draft-project creation path using the `projectFromRepo` payload (through `buildProjectPayload(payload, 'draft')`), then sync blocks via the existing blocks sync route using `buildBlockSyncPayload(blocks)`. Attach the resulting `projectId` to the job result so the frontend can redirect into the editor.

### 6.5 Frontend trigger

Replace the dead "Import from GitHub" handler with: a small modal that takes a repo URL → `POST /api/import/github` → receive `{ jobId }` → poll `GET /api/import/github/:jobId` (or reuse the existing notification channel if one exists) → on completion, navigate to the returned draft project in the editor. Show a spinner/progress state while the job runs; surface a readable error if the repo is private/nonexistent/rate-limited.

## 7. Cheap post-MVP enhancements (do not block Phase 1)

- **Consecutive standalone images → one `gallery` block.** When 2+ lone-image paragraphs appear in a row, collapse into a single `gallery` (`{ images: [{ url, caption }] }`) instead of separate `image` blocks.
- **Bare video links → `video`/`embed`.** A YouTube/Vimeo URL alone on its own line becomes a `video` (`{ url, caption }`) or `embed` (`{ url }`) block instead of an anchor inside a `text` block.

## 8. Invariants & gotchas (do not regress these)

1. **Relative image URLs must be absolutized** against `raw.githubusercontent.com/{owner}/{repo}/{default_branch}/`. A raw README `./docs/x.png` is dead outside GitHub. Handled by `absolutize()` — keep it wired in both `inlineToHtml` and the lone-image branch.
2. **Use the real `default_branch`**, never a hardcoded `main`.
3. **Rate limits:** 60 req/hr unauthenticated (Phase 1), 5000 authenticated (Phase 3). Handle 403/rate-limit responses with a clear user-facing message.
4. **`json_agg`-style null guards** still apply anywhere aggregated arrays are consumed downstream (`|| []`), consistent with prior fixes in this codebase.
5. **Transform runs in the worker, not the request handler** — several network calls + image downloads.
6. **Escape HTML** from README text before embedding in `text` block HTML (handled by `escapeHtml`), since README content is untrusted.
7. **Partial failure tolerance:** a single failed image fetch must not fail the whole import.

## 9. Acceptance criteria

- [ ] Pasting a public repo URL creates a draft project with title, tagline, tags (languages + topics deduped), github/live links, and start/end dates populated.
- [ ] README headings, paragraphs, lists, code blocks, tables, images, and horizontal rules render as the correct block types, with paragraphs/lists coalesced into `text` blocks.
- [ ] Relative README images resolve and display (no broken `./…` paths).
- [ ] Imported blocks persist via the existing sync route with correct `sort_order` and are editable in the editor.
- [ ] Private/nonexistent/rate-limited repos produce a readable error, not a silent failure.
- [ ] (Phase 2) Imported images are served from the app's own media storage, not hotlinked.

## 10. Out of scope (first pass)

Source-file/code-tree import; commit history; issues/PRs; wiki; multi-file docs beyond README; automatic `project_type` classification; synthesizing `metrics`/`timeline` from repo data.

## 11. Dependencies to add

`unified`, `remark-parse`, `remark-gfm`, `mdast-util-to-string`. No frontend deps required for Phase 1 beyond the existing stack.
