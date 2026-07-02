const puppeteer = require('puppeteer');
const http = require('http');
const { pool } = require('../config/database');
const { withPage, closeBrowser } = require('../utils/browserPool');

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
      email: `security-${label}-${suffix}@example.test`,
      password: 'AuditOnly!Password123',
      full_name: `Security ${label}`,
      username: `security-${label}-${suffix}`,
    },
  });
  if (result.status !== 201) throw new Error(`Register ${label} failed: ${result.status} ${JSON.stringify(result.data)}`);
  createdUserIds.push(result.data.user.id);
  return result.data;
};

const run = async () => {
  let browser;
  const evidence = {};
  try {
    const attacker = await register('attacker');
    const victim = await register('victim');

    const project = await request('/projects', {
      token: attacker.token,
      method: 'POST',
      body: { title: 'Security Audit Project', status: 'published', description: 'temporary' },
    });
    const team = await request('/teams', {
      token: attacker.token,
      method: 'POST',
      body: { name: `Security Audit Team ${suffix}`, description: 'temporary' },
    });
    if (project.status !== 201 || team.status !== 201) throw new Error('Fixture creation failed.');

    const projectId = project.data.project.id;
    const projectSlug = project.data.project.slug;
    const teamId = team.data.team.id;
    const teamSlug = team.data.team.slug;
    const published = await request(`/projects/${projectId}`, {
      token: attacker.token,
      method: 'PUT',
      body: { status: 'published' },
    });
    if (published.status !== 200) throw new Error(`Project publish failed: ${published.status}`);
    const added = await request(`/teams/${teamId}/projects`, {
      token: attacker.token,
      method: 'POST',
      body: { project_id: projectId },
    });
    const unauthorizedDelete = await request(`/teams/${teamId}/projects/${projectId}`, {
      token: victim.token,
      method: 'DELETE',
    });
    const publicTeam = await request(`/teams/${teamSlug}`);
    evidence.team_project_idor = {
      fixture_add_status: added.status,
      victim_delete_status: unauthorizedDelete.status,
      project_present_after_victim_delete: Boolean(publicTeam.data?.projects?.some((item) => item.id === projectId)),
    };

    const htmlPayload = '<img src="http://127.0.0.1:1/security-audit" onerror="localStorage.setItem(\'security_html_xss_proof\', localStorage.getItem(\'token\') ? \'TOKEN_READABLE\' : \'NO_TOKEN\')">';
    const block = await request(`/projects/${projectId}/blocks`, {
      token: attacker.token,
      method: 'POST',
      body: { type: 'text', content: { html: htmlPayload }, sort_order: 0 },
    });
    if (block.status !== 201) throw new Error(`Malicious rich-text fixture failed: ${block.status}`);

    const settings = await request('/settings', { token: attacker.token });
    if (settings.status !== 200) throw new Error(`Settings read failed: ${settings.status}`);
    const proofCode = "localStorage.setItem('security_xss_proof', localStorage.getItem('token') ? 'TOKEN_READABLE' : 'NO_TOKEN');";
    const rejectedCustomJs = await request('/settings', {
      token: attacker.token,
      method: 'PUT',
      body: { ...settings.data.settings, custom_js: proofCode, is_public: true },
    });
    const rejectedCustomSite = await request('/settings/custom-site', {
      token: attacker.token,
      method: 'PUT',
      body: {
        custom_site_enabled: true,
        custom_site_html: '<main onclick="alert(1)"><script>alert(1)</script></main>',
        custom_site_css: '@import url("https://example.com/style.css");',
        custom_site_js: "fetch('/api/auth/me'); localStorage.getItem('token'); window.parent.postMessage('x', '*');",
      },
    });
    const saved = await request('/settings', {
      token: attacker.token,
      method: 'PUT',
      body: { ...settings.data.settings, custom_js: null, is_public: true },
    });
    if (saved.status !== 200) throw new Error(`Settings save failed: ${saved.status} ${JSON.stringify(saved.data)}`);

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${frontendBase}/login`, { waitUntil: 'networkidle0' });
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.removeItem('security_xss_proof');
      localStorage.removeItem('security_html_xss_proof');
    }, { token: victim.token, user: victim.user });
    await page.goto(`${frontendBase}/${attacker.user.username}/${projectSlug}`, { waitUntil: 'networkidle0' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const htmlState = await page.evaluate(() => ({
      marker: localStorage.getItem('security_html_xss_proof'),
      injected_element_present: Boolean(document.querySelector('[onload], [onerror]')),
      injected_handler: document.querySelector('[onload], [onerror]')?.getAttribute('onload')
        || document.querySelector('[onload], [onerror]')?.getAttribute('onerror')
        || null,
    }));
    evidence.rich_text_stored_xss = {
      visitor_token_was_readable: htmlState.marker === 'TOKEN_READABLE',
      proof_marker: htmlState.marker,
      injected_element_present: htmlState.injected_element_present,
      injected_handler_present: Boolean(htmlState.injected_handler),
    };

    await page.evaluate(() => localStorage.removeItem('security_xss_proof'));
    await page.goto(`${frontendBase}/${attacker.user.username}`, { waitUntil: 'networkidle0' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const marker = await page.evaluate(() => localStorage.getItem('security_xss_proof'));
    evidence.same_origin_custom_js = {
      custom_js_save_status: rejectedCustomJs.status,
      custom_js_save_code: rejectedCustomJs.data?.code || null,
      visitor_token_was_readable: marker === 'TOKEN_READABLE',
      proof_marker: marker,
    };
    evidence.custom_site_security = {
      malicious_save_status: rejectedCustomSite.status,
      malicious_save_code: rejectedCustomSite.data?.code || null,
      validation_fields: Array.isArray(rejectedCustomSite.data?.details)
        ? rejectedCustomSite.data.details.map((item) => item.field).slice(0, 6)
        : [],
    };

    const privateSettings = await request('/settings', {
      token: attacker.token,
      method: 'PUT',
      body: { ...saved.data.settings, custom_js: null, is_public: false },
    });
    if (privateSettings.status !== 200) throw new Error(`Private portfolio fixture failed: ${privateSettings.status}`);
    const privatePortfolio = await request(`/portfolio/${attacker.user.username}`);
    const privateProject = await request(`/portfolio/${attacker.user.username}/${projectSlug}`);
    evidence.private_portfolio_direct_project_bypass = {
      portfolio_status: privatePortfolio.status,
      direct_project_status: privateProject.status,
    };

    await pool.query('UPDATE teams SET is_public = false WHERE id = $1', [teamId]);
    const anonymousPrivateTeam = await request(`/teams/${teamSlug}`);
    evidence.private_team_bypass = {
      anonymous_private_team_status: anonymousPrivateTeam.status,
      team_data_returned: Boolean(anonymousPrivateTeam.data?.team?.id),
    };

    let internalRequests = 0;
    const internalServer = http.createServer((req, res) => {
      internalRequests += 1;
      res.writeHead(204);
      res.end();
    });
    await new Promise((resolve, reject) => {
      internalServer.once('error', reject);
      internalServer.listen(0, '127.0.0.1', resolve);
    });
    try {
      const port = internalServer.address().port;
      await withPage((probePage) => probePage.setContent(`<img src="http://127.0.0.1:${port}/pdf-worker-proof">`, { waitUntil: 'networkidle0' }));
    } finally {
      await new Promise((resolve) => internalServer.close(resolve));
    }
    evidence.pdf_renderer_internal_network_access = {
      internal_request_received: internalRequests > 0,
      request_count: internalRequests,
    };

    const changedPassword = await request('/auth/change-password', {
      token: victim.token,
      method: 'PUT',
      body: { current_password: 'AuditOnly!Password123', new_password: 'AuditOnly!ChangedPassword456' },
    });
    const oldTokenAfterPasswordChange = await request('/auth/me', { token: victim.token });
    evidence.password_change_access_token_revocation = {
      password_change_status: changedPassword.status,
      old_access_token_status_after_change: oldTokenAfterPasswordChange.status,
    };

    const anonymousChecks = await Promise.all([
      request('/projects'),
      request('/jobs/00000000-0000-0000-0000-000000000000'),
      request('/settings'),
      request('/teams'),
    ]);
    evidence.anonymous_auth_boundaries = anonymousChecks.map((result) => result.status);
    const failures = [];
    if (evidence.team_project_idor.victim_delete_status !== 403) failures.push('team project removal IDOR still allowed');
    if (!evidence.team_project_idor.project_present_after_victim_delete) failures.push('victim removed team project');
    if (evidence.rich_text_stored_xss.visitor_token_was_readable || evidence.rich_text_stored_xss.injected_handler_present) failures.push('rich text XSS still executes');
    if (evidence.same_origin_custom_js.custom_js_save_status !== 422 || evidence.same_origin_custom_js.visitor_token_was_readable) failures.push('custom JS still persists or executes');
    if (evidence.custom_site_security.malicious_save_status !== 422) failures.push('custom-site malicious code was accepted');
    if (evidence.private_portfolio_direct_project_bypass.direct_project_status !== 404) failures.push('private portfolio direct project remains visible');
    if (evidence.private_team_bypass.anonymous_private_team_status !== 404 || evidence.private_team_bypass.team_data_returned) failures.push('private team remains visible');
    if (evidence.pdf_renderer_internal_network_access.internal_request_received) failures.push('PDF renderer can still reach localhost');
    if (evidence.password_change_access_token_revocation.old_access_token_status_after_change !== 401) failures.push('old token remains valid after password change');
    if (failures.length) {
      process.stdout.write(`${JSON.stringify({ ...evidence, failures }, null, 2)}\n`);
      throw new Error(`Security smoke failed: ${failures.join('; ')}`);
    }
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close().catch(() => {});
    await closeBrowser().catch(() => {});
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
