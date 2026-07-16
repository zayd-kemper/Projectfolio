// GitHub repo → draft project seed generator (Phase 1 MVP).
// Not a source-tree converter: maps the repo's presentation surface (metadata +
// README) into the editor's structured fields and blocks. See
// docs/github-import-implementation-plan.md.

// Parses common GitHub URL shapes into { owner, repo }. Throws a user-facing
// message on anything that isn't a public github.com/owner/repo reference.
const parseRepoUrl = (input) => {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Enter a GitHub repository URL.');

  let host;
  let pathname;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    host = url.hostname.toLowerCase();
    pathname = url.pathname;
  } catch {
    throw new Error('That does not look like a valid URL.');
  }

  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new Error('Only public github.com repository URLs are supported.');
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error('URL must point to a repository, e.g. github.com/owner/repo.');
  }
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  if (!owner || !repo) {
    throw new Error('URL must point to a repository, e.g. github.com/owner/repo.');
  }
  return { owner, repo };
};

const PROJECT_TYPE_FALLBACK = 'Software'; // user re-picks from the existing dropdown

// GitHub fields are looser than the PUT /projects/:id schema (tagline ≤220,
// title ≤160, live_url must parse as http(s) URL). Clamp at import so the
// draft can round-trip through the editor's save without a 400.
const clamp = (value, max) => String(value || '').slice(0, max);
const asHttpUrl = (value) => {
  const raw = String(value || '').trim();
  try {
    return ['http:', 'https:'].includes(new URL(raw).protocol) ? raw : '';
  } catch {
    return '';
  }
};

// Repo metadata → draft project payload. Feeds the existing project insert path.
const projectFromRepo = ({ repo, languages = {}, topics = [], contributors = [] }) => {
  const technologies = [...new Set([...Object.keys(languages || {}), ...(topics || [])])];

  return {
    title: clamp((repo.name || '').replace(/[-_]/g, ' '), 160),
    tagline: clamp(repo.description, 220),
    description: '', // narrative body lives in blocks, not here
    project_type: PROJECT_TYPE_FALLBACK,
    technologies,
    collaborators: (contributors || [])
      .filter((c) => c.type === 'User') // drop bots
      .slice(0, 6)
      .map((c) => c.login),
    cover_image_url: repo.full_name ? `https://opengraph.githubassets.com/1/${repo.full_name}` : '',
    github_url: repo.html_url || '',
    live_url: asHttpUrl(repo.homepage),
    start_date: repo.created_at ? repo.created_at.slice(0, 10) : '',
    end_date: repo.pushed_at ? repo.pushed_at.slice(0, 10) : '',
    status: 'draft',
    is_featured: false,
  };
};

// ── GitHub REST acquisition ──────────────────────────────────────────────────
const GITHUB_API = 'https://api.github.com';

const ghHeaders = () => {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ProjectFolio-Import/1.0' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
};

// Four metadata calls + README (plan §5). fetchFn is injectable for tests.
const fetchRepoData = async ({ owner, repo }, { fetchFn = fetch } = {}) => {
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;
  const getJson = async (url, { required = false } = {}) => {
    const res = await fetchFn(url, { headers: ghHeaders() });
    if (!res.ok) {
      if (required && res.status === 404) throw new Error('Repository not found. Check the URL and that the repo is public.');
      if (res.status === 403) throw new Error('GitHub rate limit reached. Wait a while and try again.');
      if (required) throw new Error(`GitHub request failed (${res.status}).`);
      return null;
    }
    return res.json();
  };

  const repoData = await getJson(base, { required: true });
  const [languages, topicsRes, contributors] = await Promise.all([
    getJson(`${base}/languages`),
    getJson(`${base}/topics`),
    getJson(`${base}/contributors?per_page=10`),
  ]);

  const branch = repoData.default_branch || 'main';
  let readme = '';
  const readmeRes = await getJson(`${base}/readme`);
  if (readmeRes && readmeRes.content) {
    readme = Buffer.from(readmeRes.content, readmeRes.encoding || 'base64').toString('utf8');
  }

  return {
    repo: repoData,
    languages: languages || {},
    topics: (topicsRes && Array.isArray(topicsRes.names)) ? topicsRes.names : [],
    contributors: Array.isArray(contributors) ? contributors : [],
    readme,
    branch,
  };
};

// ── README → blocks ──────────────────────────────────────────────────────────
// Verified block shapes (see plan §6.2). No paragraph/list/blockquote block type;
// those live as HTML inside `text` blocks. Tables separate headers from rows.
const B = {
  heading: (level, text) => ({ type: 'heading', content: { text, level } }),
  code: (language, code) => ({ type: 'code', content: { code, language: language || 'text' } }),
  image: (url, alt) => ({ type: 'image', content: { url, alt, caption: '' } }),
  table: (headers, rows) => ({ type: 'table', content: { headers, rows } }),
  text: (html) => ({ type: 'text', content: { html } }),
};

const rawBase = (owner, repo, branch) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;

const absolutize = (src, base) => {
  const s = String(src || '');
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s.replace(/^\.\//, ''), base).href;
  } catch {
    return s;
  }
};

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function inlineToHtml(node, base) {
  return (node.children || []).map((child) => {
    switch (child.type) {
      case 'text': return escapeHtml(child.value);
      case 'strong': return `<strong>${inlineToHtml(child, base)}</strong>`;
      case 'emphasis': return `<em>${inlineToHtml(child, base)}</em>`;
      case 'inlineCode': return `<code>${escapeHtml(child.value)}</code>`;
      case 'link': return `<a href="${escapeHtml(child.url)}">${inlineToHtml(child, base)}</a>`;
      case 'image': return `<img src="${escapeHtml(absolutize(child.url, base))}" alt="${escapeHtml(child.alt || '')}">`;
      case 'break': return '<br>';
      default: return escapeHtml(child.value || '');
    }
  }).join('');
}

const RICH = new Set(['paragraph', 'list', 'blockquote']);

// remark is ESM-only; the worker/CJS calls this via dynamic import.
async function readmeToBlocks(markdown, { owner, repo, branch = 'main' }) {
  const [{ unified }, remarkParse, remarkGfm, { toString: mdToString }] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('mdast-util-to-string'),
  ]);

  const base = rawBase(owner, repo, branch);

  const richNodeToHtml = (node) => {
    switch (node.type) {
      case 'paragraph':
        return `<p>${inlineToHtml(node, base)}</p>`;
      case 'blockquote':
        return `<blockquote>${node.children.map(richNodeToHtml).join('')}</blockquote>`;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const items = node.children.map((li) => {
          const inner = li.children
            .map((c) => (c.type === 'paragraph' ? inlineToHtml(c, base) : richNodeToHtml(c)))
            .join('');
          return `<li>${inner}</li>`;
        }).join('');
        return `<${tag}>${items}</${tag}>`;
      }
      default:
        return `<p>${escapeHtml(mdToString(node))}</p>`;
    }
  };

  const tree = unified().use(remarkParse.default).use(remarkGfm.default).parse(markdown);
  const blocks = [];
  let buffer = []; // consecutive rich nodes → one text block

  const flush = () => {
    if (buffer.length) {
      blocks.push(B.text(buffer.map(richNodeToHtml).join('')));
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
      buffer.push(node);
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
        head.children.map((c) => mdToString(c)),
        body.map((r) => r.children.map((c) => mdToString(c))),
      ));
    } else if (node.type === 'thematicBreak') {
      flush();
      blocks.push({ type: 'divider', content: {} });
    }
  }
  flush();
  return blocks;
}

// ── Orchestration + persistence ──────────────────────────────────────────────
const slugify = (title) =>
  String(title || 'project').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 100) || 'project';

// Full import: fetch → transform → insert draft project + blocks. Runs in the
// BullMQ worker. db/fetchFn are injectable for tests; default to the real ones.
const runGithubImportJob = async (input, ctx = {}, deps = {}) => {
  const db = deps.db || require('../config/database');
  const fetchFn = deps.fetchFn || fetch;
  const { sanitizeBlockContent } = require('./contentSecurity');
  const log = require('./logger');
  const updateProgress = ctx.updateProgress || (async () => {});

  const { owner, repo } = parseRepoUrl(input.url || `${input.owner}/${input.repo}`);
  log.info?.({ owner, repo, jobId: ctx.jobId }, 'IMPORT:start');

  const data = await fetchRepoData({ owner, repo }, { fetchFn });
  await updateProgress(30);

  const payload = projectFromRepo(data);
  const blocks = data.readme ? await readmeToBlocks(data.readme, { owner, repo, branch: data.branch }) : [];
  await updateProgress(60);

  // Unique slug per user (mirrors the create-project route).
  let slug = slugify(payload.title);
  const existing = await db.query('SELECT id FROM projects WHERE user_id = $1 AND slug = $2', [input.userId, slug]);
  if (existing.rows.length > 0) slug = `${slug}-${Date.now()}`;

  const inserted = await db.query(
    `INSERT INTO projects (user_id, title, slug, tagline, description, project_type, technologies, cover_image_url, github_url, live_url, start_date, end_date, collaborators, status, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13::text[], $14, $15)
     RETURNING id`,
    [
      input.userId, payload.title || repo, slug, payload.tagline, payload.description, payload.project_type,
      payload.technologies || [], payload.cover_image_url, payload.github_url, payload.live_url,
      payload.start_date || null, payload.end_date || null, payload.collaborators || [],
      'draft', false,
    ],
  );
  const projectId = inserted.rows[0].id;
  await updateProgress(75);

  if (blocks.length) {
    const normalized = blocks.map((block, index) => ({
      type: String(block.type || '').slice(0, 50),
      content: sanitizeBlockContent(block.type, block.content || {}),
      sort_order: index,
    }));
    await db.query(
      `INSERT INTO blocks (project_id, type, content, sort_order)
       SELECT $1, input.type, input.content, input.sort_order
       FROM jsonb_to_recordset($2::jsonb) AS input(type varchar, content jsonb, sort_order integer)`,
      [projectId, JSON.stringify(normalized)],
    );
  }
  await updateProgress(100);
  log.info?.({ owner, repo, projectId, blocks: blocks.length, jobId: ctx.jobId }, 'IMPORT:done');

  return { project_id: projectId, block_count: blocks.length, title: payload.title };
};

module.exports = { parseRepoUrl, projectFromRepo, readmeToBlocks, fetchRepoData, runGithubImportJob, PROJECT_TYPE_FALLBACK };
