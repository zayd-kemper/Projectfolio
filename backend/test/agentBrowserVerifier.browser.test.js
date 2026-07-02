const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { verifyAgentPreview, verifyPreviewRoutes } = require('../utils/agentBrowserVerifier');

const test = nodeTest;
const { before, after } = nodeTest;

let sharedBrowser = null;
let browserLaunchError = null;

before(async () => {
  try {
    const puppeteer = require('puppeteer');
    sharedBrowser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 15000,
    });
  } catch (error) {
    browserLaunchError = error;
  }
});

after(async () => {
  if (sharedBrowser) await sharedBrowser.close().catch(() => {});
});

test('browser verifier reports desktop and mobile checks when Chromium is available', async (t) => {
  if (browserLaunchError) {
    t.skip(`Chromium unavailable: ${browserLaunchError.message}`);
    return;
  }

  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-agent-browser-'));
  const result = await verifyAgentPreview({
    user: { full_name: 'Zayd', username: 'zayd', headline: 'AI engineer', skills: ['React', 'Node'] },
    settings: {
      theme: 'bold',
      accent_color: '#38bdf8',
      section_order: ['header', 'proof', 'projects', 'contact'],
      site_sections: [{ id: 'proof', type: 'stats', title: 'Proof', content: { items: [{ value: '3', label: 'Projects' }] } }],
      design_system: {
        direction: 'neon-lab',
        tokens: { background: '#030712', surface: '#111827', text: '#f8fafc', muted: '#cbd5e1', accent: '#38bdf8' },
      },
      custom_css: '@media (max-width: 720px) { .pf-project-card { min-width: 0; } }',
      custom_js: '(function(){ if(document.getElementById("pf-browser-test")) return; var el=document.createElement("div"); el.id="pf-browser-test"; el.setAttribute("data-pf-ai-artifact","true"); document.body.appendChild(el); })();',
    },
    projects: [{ id: 'p1', title: 'Portfolio Agent', tagline: 'Browser checked', technologies: ['React'] }],
  }, { timeoutMs: 15000, screenshotDir, artifactId: 'unit-proof', browser: sharedBrowser });

  assert(['passed', 'warning', 'skipped'].includes(result.status), result.errors?.join('\n'));
  if (result.status !== 'skipped') {
    assert.equal(result.checks.length, 4);
    assert(result.checks.some((check) => check.page === 'portfolio' && check.projectCardCount >= 1));
    assert(result.checks.some((check) => check.page === 'project'));
    assert(result.checks.every((check) => check.screenshot?.likelyNonBlank));
    assert(result.checks.every((check) => check.screenshot?.path && fs.existsSync(check.screenshot.path)));
    assert(result.checks.every((check) => path.basename(check.screenshot.path).startsWith('unit-proof-')));
    assert.deepEqual(result.errors, []);
  }
});

test('browser verifier strips disabled custom JS from synthetic previews', async (t) => {
  if (browserLaunchError) {
    t.skip(`Chromium unavailable: ${browserLaunchError.message}`);
    return;
  }

  const result = await verifyAgentPreview({
    user: { full_name: 'Zayd', username: 'zayd', headline: 'AI engineer', skills: ['React'] },
    settings: {
      theme: 'clean',
      accent_color: '#2563eb',
      section_order: ['header', 'projects', 'contact'],
      custom_js: 'throw new Error("agent browser repair test failure");',
    },
    projects: [{ id: 'p1', title: 'Portfolio Agent', tagline: 'Browser checked', technologies: ['React'] }],
  }, {
    timeoutMs: 15000,
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
    browser: sharedBrowser,
  });

  assert.notEqual(result.status, 'failed');
  assert(!result.errors.some((error) => error.includes('agent browser repair test failure')));
});

test('real preview route verifier injects and acknowledges pending preview state', async (t) => {
  if (browserLaunchError) {
    t.skip(`Chromium unavailable: ${browserLaunchError.message}`);
    return;
  }

  const sockets = new Set();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html>
      <html>
        <head>
          <style>
            body { margin: 0; font-family: system-ui, sans-serif; }
            #pf-root { min-height: 900px; padding: 48px; }
            .pf-section { min-height: 180px; margin-bottom: 32px; }
            .pf-project-card, .pf-project-page { display: block; padding: 24px; border: 1px solid #dbeafe; border-radius: 18px; }
          </style>
        </head>
        <body>
          <div id="pf-root" class="pf-portfolio">
            <section class="pf-section pf-header"><h1 class="pf-name">Preview User</h1><p>This portfolio has enough realistic text for browser verification to inspect the rendered route after preview state is applied.</p></section>
            <section class="pf-section"><div class="pf-projects"><a class="pf-project-card">Project card with descriptive copy, technology tags, and enough visible content to count as a real rendered project.</a></div></section>
            <section class="pf-section pf-contact">Contact section with a clear call to action and additional visible text for route verification.</section>
            <main class="pf-project-page">
              <header class="pf-project-header"><h1 class="pf-project-title">Project</h1><p class="pf-project-meta">Meta details for the selected public project route with enough visible text.</p></header>
            </main>
          </div>
          <script>
            window.addEventListener('message', function(event) {
              if (event.data && event.data.type === 'pf-preview') {
                document.body.setAttribute('data-preview-theme', event.data.settings && event.data.settings.theme || 'none');
                window.postMessage({ type: 'pf-preview-applied' }, '*');
              }
            });
            window.postMessage({ type: 'pf-preview-ready' }, '*');
          </script>
        </body>
      </html>`);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const result = await verifyPreviewRoutes({
      username: 'mike',
      projectSlug: 'mart',
      frontendUrl: `http://127.0.0.1:${port}`,
      previewState: {
        settings: {
          theme: 'bold',
          section_order: ['header', 'projects', 'contact'],
          custom_css: '.pf-project-card { border-radius: 24px; }',
        },
      },
    }, {
      browser: sharedBrowser,
      viewports: [{ name: 'desktop', width: 960, height: 720 }],
      timeoutMs: 10000,
      previewTimeoutMs: 1500,
    });

    assert.equal(result.status, 'passed', result.errors?.join('\n'));
    assert.equal(result.checks.length, 2);
    assert(result.checks.every((check) => check.status === 'passed'));
  } finally {
    server.closeAllConnections?.();
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => server.close(resolve));
  }
});
