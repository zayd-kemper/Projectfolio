const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  buildLiveRouteTargets,
  buildProjectVerificationHtml,
  buildVerificationHtml,
  classifyConsoleMessage,
  mergePreviewState,
  preflightLiveRoutes,
} = require('../utils/agentBrowserVerifier');

const createTestServer = async (handler) => {
  const server = http.createServer((request, response) => {
    response.setHeader('connection', 'close');
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
};

test('builds live portfolio and project route targets from frontend URL', () => {
  const targets = buildLiveRouteTargets({
    frontendUrl: 'http://localhost:3000/',
    username: '@zayd',
    projectSlug: 'agent-project',
  });

  assert.equal(targets.length, 2);
  assert.equal(targets[0].page, 'portfolio');
  assert.equal(targets[0].url, 'http://localhost:3000/zayd');
  assert.equal(targets[1].page, 'project');
  assert.equal(targets[1].url, 'http://localhost:3000/zayd/agent-project');

  const withDashboard = buildLiveRouteTargets({
    frontendUrl: 'http://localhost:3000',
    username: 'zayd',
    includeDashboard: true,
  });
  assert.equal(withDashboard[0].page, 'dashboard');
  assert.equal(withDashboard[0].protected, true);
  assert.equal(withDashboard[0].url, 'http://localhost:3000/dashboard/portfolio-settings');

  const noPublishedProjects = buildLiveRouteTargets({
    frontendUrl: 'http://localhost:3000',
    username: 'zayd',
    publishedProjectCount: 0,
  });
  assert.deepEqual(noPublishedProjects[0].required, ['.pf-portfolio', '.pf-header', '.pf-section']);

  const withPublishedProjects = buildLiveRouteTargets({
    frontendUrl: 'http://localhost:3000',
    username: 'zayd',
    publishedProjectCount: 2,
  });
  assert(withPublishedProjects[0].required.includes('.pf-project-card'));
});

test('classifies browser console output without failing on dev-only warnings', () => {
  assert.equal(
    classifyConsoleMessage('warning', '⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition', 'dashboard/desktop'),
    null
  );
  assert.equal(
    classifyConsoleMessage('error', "WebSocket connection to 'ws://localhost:3000/?token=abc' failed:", 'dashboard/desktop'),
    null
  );

  assert.deepEqual(
    classifyConsoleMessage('warning', 'Unknown CSS property: frobnicate', 'portfolio/mobile'),
    {
      severity: 'warning',
      message: 'portfolio/mobile: Unknown CSS property: frobnicate',
    }
  );
  assert.deepEqual(
    classifyConsoleMessage('error', 'Uncaught TypeError: Cannot read properties of null', 'portfolio/desktop'),
    {
      severity: 'error',
      message: 'portfolio/desktop: Uncaught TypeError: Cannot read properties of null',
    }
  );
});

test('merges agent actions into a browser-verifiable preview state', () => {
  const state = mergePreviewState({
    context: {
      user: { full_name: 'Zayd', username: 'zayd', headline: 'Builder', skills: ['React'] },
      settings: {
        theme: 'clean',
        accent_color: '#2563eb',
        section_order: ['header', 'projects', 'contact'],
        site_sections: [],
      },
      projects: [{ id: 'p1', slug: 'old', title: 'Old title', technologies: ['Node'] }],
    },
    actions: [
      {
        type: 'settings.patch',
        patch: {
          layout: 'magazine',
          section_order: ['header', 'proof', 'projects', 'contact'],
          site_sections: [{ id: 'proof', type: 'proofWall', title: 'Proof', content: { items: [{ value: '3', label: 'Projects', text: 'Native builder proof wall' }] } }],
          design_system: { direction: 'launch-pad', tokens: { accent: '#38bdf8' } },
        },
      },
      { type: 'profile.patch', patch: { headline: 'AI engineer' } },
      { type: 'project.patch', slug: 'old', patch: { title: 'New title' } },
    ],
    customizationPreview: {
      after: {
        css: '.pf-project-card { transform: translateY(-2px); }',
        js: '',
        themeOverrides: { cardShadow: '0 20px 50px rgba(0,0,0,.2)' },
        animations: { cardEntrance: 'fadeUp' },
      },
    },
  });

  assert.equal(state.user.headline, 'AI engineer');
  assert.equal(state.settings.layout, 'magazine');
  assert.equal(state.settings.design_system.direction, 'launch-pad');
  assert.equal(state.settings.theme_overrides.cardShadow, '0 20px 50px rgba(0,0,0,.2)');
  assert.equal(state.projects[0].title, 'New title');

  const html = buildVerificationHtml(state);
  const projectHtml = buildProjectVerificationHtml(state);
  assert.match(html, /pf-section-proof/);
  assert.match(html, /pf-proof-card/);
  assert.match(html, /pf-project-card/);
  assert.match(html, /Browser verified preview/);
  assert.match(projectHtml, /pf-project-page/);
  assert.match(projectHtml, /New title/);
});

test('live route preflight catches unhealthy portfolio API before Chromium', async () => {
  const server = await createTestServer((request, response) => {
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === '/api/portfolio/mike') {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'backend unavailable' }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });

  try {
    const result = await preflightLiveRoutes({
      username: 'mike',
      frontendUrl: server.url,
      backendUrl: server.url,
      timeoutMs: 1000,
    });

    assert.equal(result.status, 'failed');
    assert(result.errors.some((error) => error.includes('Portfolio API preflight failed')));
    assert(result.checks.some((check) => check.name === 'Portfolio API' && check.status === 500));
  } finally {
    await server.close();
  }
});

test('live route preflight passes when frontend, backend, and public APIs respond', async () => {
  const server = await createTestServer((request, response) => {
    const okRoutes = new Set([
      '/',
      '/health',
      '/api/portfolio/mike',
      '/api/portfolio/mike/mart',
    ]);
    if (okRoutes.has(request.url)) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });

  try {
    const result = await preflightLiveRoutes({
      username: 'mike',
      projectSlug: 'mart',
      frontendUrl: server.url,
      backendUrl: server.url,
      timeoutMs: 1000,
    });

    assert.equal(result.status, 'passed');
    assert.deepEqual(result.errors, []);
    assert.equal(result.checks.length, 4);
  } finally {
    await server.close();
  }
});
