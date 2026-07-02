// backend/routes/export.js
// Handles portfolio export to PDF and ZIP

const express = require('express');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { createJob } = require('../jobs/service');
const { sanitizeRichHtml } = require('../utils/contentSecurity');

const router = express.Router();

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

router.get('/pdf/:username', requireAuth, userQuota('export.pdf', { windowMs: 60 * 60 * 1000, max: 20, message: 'PDF export limit reached. Please wait and try again.' }), userCostBudget('export.pdf', { windowMs: 24 * 60 * 60 * 1000, maxCost: 100, cost: 10, message: 'Daily PDF export budget reached.' }), async (req, res) => {
  const owner = await query('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (!owner.rows[0]) return res.status(404).json({ error: 'User not found.' });
  if (owner.rows[0].id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
  const job = await createJob({
    userId: req.user.id,
    type: 'export:pdf',
    input: { userId: req.user.id, username: req.params.username },
    idempotencyKey: req.get('Idempotency-Key') || null,
  });
  res.status(202).json({ job_id: job.id, status: job.status });
});

// ── EXPORT PORTFOLIO AS PDF ───────────────────────────────────────────────────
// GET /api/export/pdf/:username
// Generates a PDF of the public portfolio page
router.get('/pdf/:username', requireAuth, userQuota('export.pdf.legacy', { windowMs: 60 * 60 * 1000, max: 20, message: 'PDF export limit reached. Please wait and try again.' }), userCostBudget('export.pdf.legacy', { windowMs: 24 * 60 * 60 * 1000, maxCost: 100, cost: 10, message: 'Daily PDF export budget reached.' }), async (req, res) => {
  try {
    // Verify ownership
    const userResult = await query('SELECT id, full_name FROM users WHERE username = $1', [req.params.username]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (userResult.rows[0].id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });

    const user = userResult.rows[0];

    // Get all published projects with blocks
    const projectsResult = await query(
      `SELECT * FROM projects WHERE user_id = $1 AND status = 'published' ORDER BY is_featured DESC, sort_order ASC`,
      [req.user.id]
    );

    const userDataResult = await query(
      'SELECT full_name, headline, bio, location, website, linkedin_url, github_url, skills FROM users WHERE id = $1',
      [req.user.id]
    );

    const userData = userDataResult.rows[0];
    const projects = projectsResult.rows;

    // Build project blocks
    const projectsWithBlocks = [];
    for (const project of projects) {
      const blocksResult = await query(
        'SELECT * FROM blocks WHERE project_id = $1 ORDER BY sort_order ASC',
        [project.id]
      );
      projectsWithBlocks.push({ ...project, blocks: blocksResult.rows });
    }

    // Generate PDF using puppeteer (if available) or return HTML for printing
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      // Puppeteer not available — return printable HTML instead
      return generatePrintableHTML(res, userData, projectsWithBlocks, req.params.username);
    }

    const htmlContent = buildPortfolioHTML(userData, projectsWithBlocks, req.params.username);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    await browser.close();

    const filename = `${req.params.username}-portfolio.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);

  } catch (error) {
    console.error('PDF export error:', error);
    // Fallback to printable HTML
    try {
      const userDataResult = await query(
        'SELECT full_name, headline, bio, location, website, linkedin_url, github_url, skills FROM users WHERE id = $1',
        [req.user.id]
      );
      return generatePrintableHTML(res, userDataResult.rows[0], [], req.params.username);
    } catch (e) {
      res.status(500).json({ error: 'Export failed. Please try again.' });
    }
  }
});

// ── EXPORT PROJECT AS JSON (for integration with job platforms) ───────────────
// GET /api/export/project/:projectId/json
router.get('/project/:projectId/json', requireAuth, userQuota('export.project-json', { windowMs: 60 * 60 * 1000, max: 120 }), userCostBudget('export.project-json', { windowMs: 24 * 60 * 60 * 1000, maxCost: 240, cost: 1 }), async (req, res) => {
  try {
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    const project = projectResult.rows[0];
    const blocksResult = await query('SELECT * FROM blocks WHERE project_id = $1 ORDER BY sort_order ASC', [project.id]);
    const userResult = await query('SELECT full_name, email, username FROM users WHERE id = $1', [req.user.id]);

    const exportData = {
      exported_at: new Date().toISOString(),
      version: '1.0',
      platform: 'ProjectFolio',
      author: userResult.rows[0],
      project: {
        ...project,
        blocks: blocksResult.rows,
        portfolio_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${userResult.rows[0].username}/${project.slug}`,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${project.slug}-export.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── EXPORT FULL PORTFOLIO AS ZIP ──────────────────────────────────────────────
// GET /api/export/portfolio/zip
router.get('/portfolio/zip', requireAuth, userQuota('export.portfolio', { windowMs: 60 * 60 * 1000, max: 60 }), userCostBudget('export.portfolio', { windowMs: 24 * 60 * 60 * 1000, maxCost: 180, cost: 3 }), async (req, res) => {
  // Return a JSON bundle with all data — client can save as .json
  try {
    const userResult = await query(
      'SELECT full_name, username, headline, bio, location, website, linkedin_url, github_url, skills FROM users WHERE id = $1',
      [req.user.id]
    );

    const projectsResult = await query(
      `SELECT p.*, COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order)
        FILTER (WHERE b.id IS NOT NULL), '[]'::jsonb) AS blocks
       FROM projects p LEFT JOIN blocks b ON b.project_id = p.id
       WHERE p.user_id = $1 GROUP BY p.id ORDER BY p.sort_order ASC LIMIT 500`,
      [req.user.id]
    );

    const bundle = {
      exported_at: new Date().toISOString(),
      version: '1.0',
      platform: 'ProjectFolio',
      user: userResult.rows[0],
      projects: projectsResult.rows,
      portfolio_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${userResult.rows[0].username}`,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="projectfolio-export-${Date.now()}.json"`);
    res.json(bundle);
  } catch (error) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── HELPER: Generate printable HTML portfolio ─────────────────────────────────
function generatePrintableHTML(res, user, projects, username) {
  const html = buildPortfolioHTML(user, projects, username);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${username}-portfolio.html"`);
  res.send(html);
}

function buildPortfolioHTML(user, projects, username) {
  user = {
    ...user,
    full_name: escapeHtml(user.full_name),
    location: escapeHtml(user.location),
  };
  const projectsHTML = projects.map(project => {
    const blocksHTML = (project.blocks || []).map(block => {
      switch (block.type) {
        case 'text': return `<div class="block-text">${sanitizeRichHtml(block.content.html || '')}</div>`;
        case 'heading': {
          const level = [1, 2, 3, 4, 5, 6].includes(Number(block.content.level)) ? Number(block.content.level) : 2;
          return `<h${level} class="block-heading">${escapeHtml(block.content.text || '')}</h${level}>`;
        }
        case 'image': return `<figure><img src="${escapeHtml(safeUrl(block.content.url))}" alt="${escapeHtml(block.content.alt || '')}" style="max-width:100%;"><figcaption>${escapeHtml(block.content.caption || '')}</figcaption></figure>`;
        case 'callout': return `<div class="callout">${escapeHtml(block.content.emoji || '')} ${escapeHtml(block.content.text || '')}</div>`;
        case 'code': return `<pre><code class="language-${escapeHtml(block.content.language || '')}">${escapeHtml(block.content.code || '')}</code></pre>`;
        case 'divider': return '<hr>';
        default: return '';
      }
    }).join('\n');

    return `
      <div class="project">
        ${project.cover_image_url ? `<img src="${escapeHtml(safeUrl(project.cover_image_url))}" alt="${escapeHtml(project.title)}" class="cover">` : ''}
        <h2>${escapeHtml(project.title)}</h2>
        ${project.tagline ? `<p class="tagline">${escapeHtml(project.tagline)}</p>` : ''}
        ${project.technologies?.length ? `<div class="tech-tags">${project.technologies.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="blocks">${blocksHTML}</div>
        <div class="project-links">
          ${safeUrl(project.github_url) ? `<a href="${escapeHtml(safeUrl(project.github_url))}">GitHub</a>` : ''}
          ${safeUrl(project.live_url) ? `<a href="${escapeHtml(safeUrl(project.live_url))}">Live Demo</a>` : ''}
        </div>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${user.full_name} — Project Portfolio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; line-height: 1.6; color: #1a1a1a; max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2.5rem; margin-bottom: 8px; }
    h2 { font-size: 1.8rem; margin: 40px 0 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .headline { font-size: 1.2rem; color: #6b7280; margin-bottom: 16px; }
    .bio { max-width: 600px; margin-bottom: 20px; color: #374151; }
    .skills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 40px; }
    .skill { background: #f3f4f6; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; }
    .project { margin-bottom: 60px; page-break-inside: avoid; }
    .cover { width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; }
    .tagline { font-style: italic; color: #6b7280; margin-bottom: 12px; }
    .tech-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
    .tag { background: #dbeafe; color: #1e40af; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-family: monospace; }
    .blocks { margin: 20px 0; }
    .block-text, .block-heading { margin-bottom: 16px; }
    .callout { background: #fef9c3; padding: 16px; border-radius: 8px; margin: 16px 0; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; }
    figure { margin: 16px 0; }
    figcaption { color: #9ca3af; font-size: 0.85rem; margin-top: 6px; }
    .project-links { margin-top: 20px; display: flex; gap: 16px; }
    .project-links a { color: #2563eb; text-decoration: none; font-weight: 600; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .contact { margin-top: 20px; display: flex; gap: 16px; flex-wrap: wrap; }
    .contact a { color: #2563eb; text-decoration: none; }
    @media print { body { padding: 0; } .project { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${user.full_name}</h1>
    ${user.headline ? `<p class="headline">${escapeHtml(user.headline)}</p>` : ''}
    ${user.bio ? `<p class="bio">${escapeHtml(user.bio)}</p>` : ''}
    ${user.location ? `<p>📍 ${user.location}</p>` : ''}
    <div class="contact">
      ${safeUrl(user.website) ? `<a href="${escapeHtml(safeUrl(user.website))}">${escapeHtml(user.website)}</a>` : ''}
      ${safeUrl(user.linkedin_url) ? `<a href="${escapeHtml(safeUrl(user.linkedin_url))}">LinkedIn</a>` : ''}
      ${safeUrl(user.github_url) ? `<a href="${escapeHtml(safeUrl(user.github_url))}">GitHub</a>` : ''}
    </div>
    ${user.skills?.length ? `<div class="skills">${user.skills.map(s => `<span class="skill">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
  </header>

  <main>
    <h2>Projects</h2>
    ${projectsHTML || '<p>No published projects yet.</p>'}
  </main>

  <footer style="margin-top:60px; padding-top:20px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:0.85rem;">
    Generated from ProjectFolio • ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>`;
}

router.buildPortfolioHTML = buildPortfolioHTML;
module.exports = router;
