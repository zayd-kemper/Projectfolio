const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRepoUrl, projectFromRepo, readmeToBlocks, fetchRepoData, runGithubImportJob } = require('../utils/githubImport');

test('runGithubImportJob fetches, transforms, inserts a draft project + blocks, returns project_id', async () => {
  const bodyFor = (url) => {
    if (/\/repos\/jane\/proj$/.test(url)) return { name: 'proj', full_name: 'jane/proj', html_url: 'https://github.com/jane/proj', default_branch: 'main', description: 'cool', created_at: '2024-01-01T00:00:00Z', pushed_at: '2025-01-01T00:00:00Z', homepage: '' };
    if (url.endsWith('/languages')) return { Python: 5 };
    if (url.endsWith('/topics')) return { names: ['ml'] };
    if (url.includes('/contributors')) return [{ login: 'jane', type: 'User' }];
    return {};
  };
  const fakeFetch = async (url) => {
    if (url.endsWith('/readme')) return { ok: true, status: 200, json: () => Promise.resolve({ content: Buffer.from('# Proj\n\nHello world.').toString('base64'), encoding: 'base64' }) };
    return { ok: true, status: 200, json: () => Promise.resolve(bodyFor(url)) };
  };

  const queries = [];
  const fakeDb = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (/SELECT id FROM projects WHERE user_id/.test(sql)) return { rows: [] }; // slug free
      if (/INSERT INTO projects/.test(sql)) return { rows: [{ id: 'proj-uuid' }] };
      if (/INSERT INTO blocks/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };

  const progress = [];
  const result = await runGithubImportJob(
    { userId: 'u1', url: 'https://github.com/jane/proj' },
    { jobId: 'j1', updateProgress: async (p) => progress.push(p) },
    { fetchFn: fakeFetch, db: fakeDb },
  );

  assert.equal(result.project_id, 'proj-uuid');
  assert.ok(result.block_count >= 2);

  const insertProject = queries.find((q) => /INSERT INTO projects/.test(q.sql));
  assert.ok(insertProject, 'expected a project insert');
  assert.equal(insertProject.params[1], 'proj'); // title "proj"
  assert.ok(insertProject.params.includes('u1')); // owner
  const insertBlocks = queries.find((q) => /INSERT INTO blocks/.test(q.sql));
  assert.ok(insertBlocks, 'expected a blocks insert');
  assert.ok(progress.length >= 2);
});

test('fetchRepoData makes the 4 metadata calls + readme and returns default_branch', async () => {
  const calls = [];
  const bodyFor = (url) => {
    if (/\/repos\/o\/r$/.test(url)) return { name: 'r', full_name: 'o/r', default_branch: 'trunk', description: 'd' };
    if (url.endsWith('/languages')) return { JavaScript: 10 };
    if (url.endsWith('/topics')) return { names: ['cli', 'tool'] };
    if (url.includes('/contributors')) return [{ login: 'o', type: 'User' }];
    return {};
  };
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.endsWith('/readme')) {
      return { ok: true, status: 200, json: () => Promise.resolve({ content: Buffer.from('# Hi\n\ntext').toString('base64'), encoding: 'base64' }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve(bodyFor(url)) };
  };

  const data = await fetchRepoData({ owner: 'o', repo: 'r' }, { fetchFn: fakeFetch });

  assert.equal(data.repo.default_branch, 'trunk');
  assert.deepEqual(data.languages, { JavaScript: 10 });
  assert.deepEqual(data.topics, ['cli', 'tool']);
  assert.deepEqual(data.contributors, [{ login: 'o', type: 'User' }]);
  assert.match(data.readme, /# Hi/);
  assert.equal(calls.filter((u) => u.includes('api.github.com')).length >= 4, true);
});

const SAMPLE_README = `# My Project

A short intro paragraph.

- first item
- second item

## Usage

\`\`\`js
console.log('hi');
\`\`\`

| Name | Role |
| ---- | ---- |
| Jane | Lead |

![diagram](./docs/arch.png)

---
`;

test('fetchRepoData surfaces a clear error for a missing repo', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, json: () => Promise.resolve({}) });
  await assert.rejects(
    () => fetchRepoData({ owner: 'o', repo: 'nope' }, { fetchFn: fakeFetch }),
    /not found/i,
  );
});

test('readmeToBlocks maps markdown to editor block types with coalescing and absolutized images', async () => {
  const blocks = await readmeToBlocks(SAMPLE_README, { owner: 'jane', repo: 'proj', branch: 'trunk' });
  const types = blocks.map((b) => b.type);

  assert.deepEqual(types, ['heading', 'text', 'heading', 'code', 'table', 'image', 'divider']);

  assert.equal(blocks[0].content.text, 'My Project');
  assert.equal(blocks[0].content.level, 1);
  // paragraph + list coalesced into one text block
  assert.match(blocks[1].content.html, /<p>A short intro paragraph\.<\/p>/);
  assert.match(blocks[1].content.html, /<ul><li>first item<\/li><li>second item<\/li><\/ul>/);
  assert.equal(blocks[3].content.language, 'js');
  assert.match(blocks[3].content.code, /console\.log/);
  assert.deepEqual(blocks[4].content.headers, ['Name', 'Role']);
  assert.deepEqual(blocks[4].content.rows, [['Jane', 'Lead']]);
  // relative image absolutized against raw.githubusercontent with the real branch
  assert.equal(blocks[5].content.url, 'https://raw.githubusercontent.com/jane/proj/trunk/docs/arch.png');
});

test('projectFromRepo maps repo metadata to a draft project payload', () => {
  const payload = projectFromRepo({
    repo: {
      name: 'cfd-solver', full_name: 'jane/cfd-solver', description: 'A CFD solver',
      html_url: 'https://github.com/jane/cfd-solver', homepage: 'https://cfd.example',
      created_at: '2024-01-15T00:00:00Z', pushed_at: '2025-06-20T00:00:00Z',
    },
    languages: { Python: 900, C: 100 },
    topics: ['cfd', 'simulation', 'python'],
    contributors: [
      { login: 'jane', type: 'User' },
      { login: 'dependabot', type: 'Bot' },
    ],
  });

  assert.equal(payload.title, 'cfd solver');
  assert.equal(payload.tagline, 'A CFD solver');
  assert.equal(payload.project_type, 'Software');
  assert.deepEqual(payload.technologies, ['Python', 'C', 'cfd', 'simulation', 'python']);
  assert.deepEqual(payload.collaborators, ['jane']); // bots dropped
  assert.equal(payload.github_url, 'https://github.com/jane/cfd-solver');
  assert.equal(payload.live_url, 'https://cfd.example');
  assert.equal(payload.cover_image_url, 'https://opengraph.githubassets.com/1/jane/cfd-solver');
  assert.equal(payload.start_date, '2024-01-15');
  assert.equal(payload.end_date, '2025-06-20');
  assert.equal(payload.status, 'draft');
});

test('projectFromRepo clamps values to the project update validation rules', () => {
  const payload = projectFromRepo({
    repo: {
      name: 'x'.repeat(200), full_name: 'jane/long',
      description: 'd'.repeat(300), // GitHub allows ~350; PUT schema caps tagline at 220
      html_url: 'https://github.com/jane/long',
      homepage: 'my cool project site', // free text on GitHub, must not become live_url
    },
  });

  assert.ok(payload.title.length <= 160, `title too long: ${payload.title.length}`);
  assert.ok(payload.tagline.length <= 220, `tagline too long: ${payload.tagline.length}`);
  assert.equal(payload.live_url, ''); // non-URL homepage dropped
});

test('parseRepoUrl accepts common GitHub URL shapes and rejects non-repos', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/owner/repo'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepoUrl('https://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepoUrl('https://github.com/owner/repo/tree/main/src'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepoUrl('github.com/Owner/My-Repo'), { owner: 'Owner', repo: 'My-Repo' });
  assert.throws(() => parseRepoUrl('https://github.com/owner'), /repo/i);
  assert.throws(() => parseRepoUrl('https://gitlab.com/owner/repo'), /github/i);
  assert.throws(() => parseRepoUrl('not a url'), /url/i);
});
