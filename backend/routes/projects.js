// backend/routes/projects.js
const express = require('express');
const { query, pool } = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { invalidatePortfolio } = require('../utils/cache');
const { findAffectedTeamSlugs, invalidateProjectCaches } = require('../utils/portfolioCacheInvalidation');
const { sanitizeBlockContent } = require('../utils/contentSecurity');
const { buildPortfolioAiContext } = require('../utils/portfolioAiContext');

const router = express.Router();

const urlField = s.url({ max: 2048 });
const textArray = s.array(s.string({ max: 120 }), { max: 80 });
const reorderItemSchema = s.shape({
  id: s.uuid({ required: true }),
  sort_order: s.integer({ required: true, min: 0, max: 100_000 }),
});
const blockItemSchema = s.shape({
  id: s.uuid({ allowNull: true }),
  project_id: s.uuid(),
  type: s.string({ required: true, min: 1, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  content: s.object({ maxBytes: 100_000 }),
  sort_order: s.integer({ min: 0, max: 100_000 }),
  created_at: s.string({ max: 40 }),
  updated_at: s.string({ max: 40 }),
});

const projectCreateSchema = {
  title: s.string({ required: true, min: 1, max: 160 }),
  tagline: s.string({ max: 220 }),
  description: s.string({ max: 5000 }),
  project_type: s.string({ max: 80 }),
  technologies: textArray,
  cover_image_url: urlField,
  github_url: urlField,
  live_url: urlField,
  start_date: s.date(),
  end_date: s.date(),
  collaborators: textArray,
  status: s.enum(['draft', 'published', 'archived']),
  is_featured: s.boolean(),
};

const projectUpdateSchema = {
  ...projectCreateSchema,
  title: s.string({ min: 1, max: 160 }),
  id: s.uuid(),
  user_id: s.uuid(),
  slug: s.string({ max: 120, pattern: /^[a-z0-9-]+$/ }),
  sort_order: s.integer({ min: 0, max: 100_000 }),
  content_version: s.integer({ min: 0, max: 1_000_000 }),
  view_count: s.integer({ min: 0, max: 1_000_000_000 }),
  user_role: s.string({ max: 40 }),
  owner_name: s.string({ max: 120 }),
  owner_username: s.string({ max: 50 }),
  created_at: s.string({ max: 40 }),
  updated_at: s.string({ max: 40 }),
};

const projectReorderSchema = {
  order: s.array(reorderItemSchema, { required: true, max: 500 }),
};

const blockCreateSchema = {
  type: s.string({ required: true, min: 1, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  content: s.object({ maxBytes: 100_000 }),
  sort_order: s.integer({ min: 0, max: 100_000 }),
};

const blockSyncSchema = {
  expected_version: s.integer({ required: true, min: 0, max: 1_000_000 }),
  blocks: s.array(blockItemSchema, { required: true, max: 500 }),
};

const blockUpdateSchema = {
  content: s.object({ maxBytes: 100_000 }),
  sort_order: s.integer({ min: 0, max: 100_000 }),
};

// Helper: convert JS array to Postgres TEXT[] literal
// Handles null, empty arrays, and strings with special characters
const toTextArray = (arr) => {
  if (!arr || !Array.isArray(arr)) return null;
  if (arr.length === 0) return '{}';
  return `{${arr.map(t => `"${String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
};

// ── GET ALL PROJECTS (for logged-in user) ─────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const ownProjects = await query(
      `SELECT p.*,
              'owner' as user_role,
              json_agg(DISTINCT jsonb_build_object('id', cu.id, 'full_name', cu.full_name, 'username', cu.username, 'avatar_url', cu.avatar_url))
                FILTER (WHERE cu.id IS NOT NULL) as collaborators
      FROM projects p
      LEFT JOIN project_collaborators pc ON pc.project_id = p.id AND pc.status = 'accepted'
      LEFT JOIN users cu ON cu.id = pc.user_id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.sort_order ASC, p.created_at DESC LIMIT 200`,
      [req.user.id]
    );

    const collabProjects = await query(
      `SELECT p.*, 'collaborator' as user_role, u.full_name as owner_name, u.username as owner_username
       FROM project_collaborators pc
       JOIN projects p ON p.id = pc.project_id
       JOIN users u ON u.id = p.user_id
       WHERE pc.user_id = $1 AND pc.status = 'accepted'
       ORDER BY pc.joined_at DESC LIMIT 200`,
      [req.user.id]
    );

    res.json({ projects: [...ownProjects.rows, ...collabProjects.rows] });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects.' });
  }
});

router.get('/ai/context', requireAuth, async (req, res) => {
  try {
    res.json({ context: await buildPortfolioAiContext(req.user.id) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build AI project context.' });
  }
});

// ── GET SINGLE PROJECT ─────────────────────────────────────────────────────────
router.get('/:id([0-9a-fA-F-]{36})', requireAuth, async (req, res) => {
  try {
    const projectResult = await query(
      `SELECT p.* FROM projects p
       WHERE p.id = $1 AND (
         p.user_id = $2 OR
         p.id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
       )`,
      [req.params.id, req.user.id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const blocksResult = await query(
      'SELECT * FROM blocks WHERE project_id = $1 ORDER BY sort_order ASC LIMIT 500',
      [req.params.id]
    );

    const collaboratorsResult = await query(
      `SELECT pc.role, u.id, u.full_name, u.username, u.avatar_url
       FROM project_collaborators pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.project_id = $1 AND pc.status = 'accepted'`,
      [req.params.id]
    );

    // Ensure technologies and collaborators are always arrays, never null
    const project = projectResult.rows[0];
    project.technologies = project.technologies || [];
    project.collaborators = project.collaborators || [];

    res.json({
      project,
      blocks: blocksResult.rows,
      collaborators: collaboratorsResult.rows,
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project.' });
  }
});

// ── CREATE PROJECT ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, validateSchema({ body: projectCreateSchema }), userQuota('projects.create', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const { title, tagline, description, project_type, technologies, cover_image_url, github_url, live_url, start_date, end_date, collaborators, status, is_featured } = req.body;

  if (!title) return res.status(400).json({ error: 'Project title is required.' });

  try {
    let slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 100);
    const existingSlug = await query('SELECT id FROM projects WHERE user_id = $1 AND slug = $2', [req.user.id, slug]);
    if (existingSlug.rows.length > 0) slug = `${slug}-${Date.now()}`;

    const result = await query(
      `INSERT INTO projects (user_id, title, slug, tagline, description, project_type, technologies, cover_image_url, github_url, live_url, start_date, end_date, collaborators, status, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13::text[], $14, $15)
       RETURNING *`,
      [
        req.user.id, title, slug, tagline, description, project_type,
        toTextArray(technologies) || '{}',
        cover_image_url, github_url, live_url,
        start_date || null, end_date || null,
        toTextArray(collaborators) || '{}',
        status || 'draft',
        is_featured === true,
      ]
    );

    const project = result.rows[0];
    project.technologies = project.technologies || [];
    project.collaborators = project.collaborators || [];

    res.status(201).json({ project, message: 'Project created!' });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// ── UPDATE PROJECT ─────────────────────────────────────────────────────────────
router.put('/:id([0-9a-fA-F-]{36})', requireAuth, validateSchema({ body: projectUpdateSchema }), userQuota('projects.update', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  const { title, tagline, description, project_type, technologies, cover_image_url, github_url, live_url, start_date, end_date, collaborators, status, is_featured } = req.body;

  try {
    // Collaborators (not just the owner) may edit, so the owner's username has to
    // come from a join here — req.user.username would be the editor, not the owner.
    const access = await query(
      `SELECT owner.username AS owner_username FROM projects p
       JOIN users owner ON owner.id = p.user_id
       WHERE p.id = $1 AND (
         p.user_id = $2 OR
         p.id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
       )`,
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    // Convert arrays to Postgres TEXT[] literals; null means "don't update this field"
    const techArray = Array.isArray(technologies) ? toTextArray(technologies) : null;
    const collabArray = Array.isArray(collaborators) ? toTextArray(collaborators) : null;

    const result = await query(
      `UPDATE projects SET
        title             = COALESCE($1, title),
        tagline           = COALESCE($2, tagline),
        description       = COALESCE($3, description),
        project_type      = COALESCE($4, project_type),
        technologies      = COALESCE($5::text[], technologies),
        cover_image_url   = COALESCE($6, cover_image_url),
        github_url        = COALESCE($7, github_url),
        live_url          = COALESCE($8, live_url),
        start_date        = COALESCE($9, start_date),
        end_date          = COALESCE($10, end_date),
        collaborators     = COALESCE($11::text[], collaborators),
        status            = COALESCE($12, status),
        is_featured       = COALESCE($13, is_featured),
        updated_at        = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        title, tagline, description, project_type,
        techArray,
        cover_image_url, github_url, live_url,
        start_date || null, end_date || null,
        collabArray,
        status, is_featured,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    const project = result.rows[0];
    project.technologies = project.technologies || [];
    project.collaborators = project.collaborators || [];

    const teamSlugs = await findAffectedTeamSlugs(req.params.id);
    await invalidateProjectCaches(access.rows[0].owner_username, teamSlugs);

    res.json({ project, message: 'Project saved!' });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// ── DELETE PROJECT ─────────────────────────────────────────────────────────────
router.delete('/:id([0-9a-fA-F-]{36})', requireAuth, userQuota('projects.delete', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  try {
    // team_projects rows are ON DELETE CASCADE from projects, so the affected team
    // slugs must be read before the delete removes them out from under this query.
    const teamSlugs = await findAffectedTeamSlugs(req.params.id);

    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    // DELETE is scoped to user_id = $2 above (no collaborator branch), so the
    // caller is always the owner here.
    await invalidateProjectCaches(req.user.username, teamSlugs);

    res.json({ message: 'Project deleted.' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// ── REORDER PROJECTS ──────────────────────────────────────────────────────────
router.put('/batch/reorder', requireAuth, validateSchema({ body: projectReorderSchema }), userQuota('projects.reorder', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  const { order } = req.body;
  try {
    if (!Array.isArray(order) || order.length > 500) return res.status(400).json({ error: 'Invalid project order.' });
    await query(
      `UPDATE projects p SET sort_order = incoming.sort_order, updated_at = NOW()
       FROM jsonb_to_recordset($1::jsonb) AS incoming(id uuid, sort_order integer)
       WHERE p.id = incoming.id AND p.user_id = $2`,
      [JSON.stringify(order), req.user.id]
    );
    await invalidatePortfolio(req.user.username).catch(() => {});
    res.json({ message: 'Projects reordered.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder projects.' });
  }
});

// ════════════════════════════════════════════════════
// BLOCK ROUTES (nested under /api/projects/:projectId/blocks)
// ════════════════════════════════════════════════════

router.get('/:projectId/blocks', requireAuth, async (req, res) => {
  try {
    const proj = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR
        id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
      )`,
      [req.params.projectId, req.user.id]
    );
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    const blocks = await query(
      'SELECT * FROM blocks WHERE project_id = $1 ORDER BY sort_order ASC LIMIT 500',
      [req.params.projectId]
    );
    res.json({ blocks: blocks.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get blocks.' });
  }
});

router.post('/:projectId/blocks', requireAuth, validateSchema({ body: blockCreateSchema }), userQuota('projects.blocks.create', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  const { type, content, sort_order } = req.body;
  if (!type) return res.status(400).json({ error: 'Block type is required.' });

  try {
    const proj = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR
        id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
      )`,
      [req.params.projectId, req.user.id]
    );
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    let order = sort_order;
    if (order === undefined) {
      const maxOrder = await query('SELECT MAX(sort_order) as max FROM blocks WHERE project_id = $1', [req.params.projectId]);
      order = (maxOrder.rows[0].max || 0) + 1;
    }

    const result = await query(
      'INSERT INTO blocks (project_id, type, content, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.projectId, type, JSON.stringify(sanitizeBlockContent(type, content || {})), order]
    );

    res.status(201).json({ block: result.rows[0] });
  } catch (error) {
    console.error('Create block error:', error);
    res.status(500).json({ error: 'Failed to create block.' });
  }
});

router.put('/:projectId/blocks/sync', requireAuth, validateSchema({ body: blockSyncSchema }), userQuota('projects.blocks.sync', { windowMs: 60 * 60 * 1000, max: 900 }), async (req, res) => {
  const incomingBlocks = req.body?.blocks;
  const expectedVersion = Number(req.body?.expected_version);
  if (!Array.isArray(incomingBlocks) || incomingBlocks.length > 500 || !Number.isSafeInteger(expectedVersion)) {
    return res.status(400).json({ error: 'Invalid block sync payload.' });
  }
  const normalized = incomingBlocks.map((block, index) => ({
    id: /^[0-9a-f-]{36}$/i.test(block.id || '') ? block.id : null,
    type: String(block.type || '').slice(0, 50),
    content: sanitizeBlockContent(block.type, block.content && typeof block.content === 'object' ? block.content : {}),
    sort_order: index,
  }));
  if (normalized.some((block) => !block.type)) return res.status(400).json({ error: 'Every block requires a type.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await client.query(
      `SELECT p.id, p.user_id, p.content_version, owner.username AS owner_username
       FROM projects p
       JOIN users owner ON owner.id = p.user_id
       WHERE p.id = $1 AND (p.user_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id AND pc.user_id = $2 AND pc.status = 'accepted'
       )) FOR UPDATE OF p`,
      [req.params.projectId, req.user.id]
    );
    if (!access.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found.' });
    }
    if (Number(access.rows[0].content_version) !== expectedVersion) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This project changed in another session. Reload before saving again.',
        code: 'CONTENT_VERSION_CONFLICT',
        current_version: Number(access.rows[0].content_version),
      });
    }

    const saved = await client.query(
      `INSERT INTO blocks (id, project_id, type, content, sort_order)
       SELECT COALESCE(input.id, uuid_generate_v4()), $2, input.type, input.content, input.sort_order
       FROM jsonb_to_recordset($1::jsonb) AS input(id uuid, type varchar, content jsonb, sort_order integer)
       ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, content = EXCLUDED.content,
         sort_order = EXCLUDED.sort_order, updated_at = NOW()
       WHERE blocks.project_id = $2
       RETURNING *`,
      [JSON.stringify(normalized), req.params.projectId]
    );
    const ids = saved.rows.map((block) => block.id);
    if (ids.length) await client.query('DELETE FROM blocks WHERE project_id = $1 AND NOT (id = ANY($2::uuid[]))', [req.params.projectId, ids]);
    else await client.query('DELETE FROM blocks WHERE project_id = $1', [req.params.projectId]);
    const version = await client.query(
      'UPDATE projects SET content_version = content_version + 1, updated_at = NOW() WHERE id = $1 RETURNING content_version',
      [req.params.projectId]
    );
    await client.query('COMMIT');
    // The editor may be a collaborator, so invalidate the owner's cache, not theirs
    // — and the owner's team pages, since this project may appear on one.
    // Reuse the held transaction client here (still open until the `finally` below)
    // instead of checking out a second pooled connection: under load that can
    // exhaust the pool and stall every DB query on this process for up to
    // connectionTimeoutMillis.
    const teamSlugs = await findAffectedTeamSlugs(req.params.projectId, client.query.bind(client));
    await invalidateProjectCaches(access.rows[0].owner_username, teamSlugs);
    res.json({ blocks: saved.rows.sort((a, b) => a.sort_order - b.sort_order), content_version: Number(version.rows[0].content_version) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Block sync error:', error);
    res.status(500).json({ error: 'Failed to sync blocks.' });
  } finally {
    client.release();
  }
});

router.put('/:projectId/blocks/:blockId', requireAuth, validateSchema({ body: blockUpdateSchema }), userQuota('projects.blocks.update', { windowMs: 60 * 60 * 1000, max: 900 }), async (req, res) => {
  const { content, sort_order } = req.body;
  try {
    const proj = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR
        id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
      )`,
      [req.params.projectId, req.user.id]
    );
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    const result = await query(
      `UPDATE blocks SET
        content    = COALESCE($1, content),
        sort_order = COALESCE($2, sort_order),
        updated_at = NOW()
       WHERE id = $3 AND project_id = $4
       RETURNING *`,
      [content ? JSON.stringify(sanitizeBlockContent('text', content)) : null, sort_order, req.params.blockId, req.params.projectId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found.' });
    res.json({ block: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update block.' });
  }
});

router.delete('/:projectId/blocks/:blockId', requireAuth, userQuota('projects.blocks.delete', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  try {
    const proj = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR
        id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
      )`,
      [req.params.projectId, req.user.id]
    );
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    await query('DELETE FROM blocks WHERE id = $1 AND project_id = $2', [req.params.blockId, req.params.projectId]);
    res.json({ message: 'Block deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete block.' });
  }
});

router.put('/:projectId/blocks/batch/reorder', requireAuth, validateSchema({ body: projectReorderSchema }), userQuota('projects.blocks.reorder', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  const { order } = req.body;
  try {
    const proj = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR
        id IN (SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted')
      )`,
      [req.params.projectId, req.user.id]
    );
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    if (!Array.isArray(order) || order.length > 500) return res.status(400).json({ error: 'Invalid block order.' });
    await query(
      `UPDATE blocks b SET sort_order = incoming.sort_order, updated_at = NOW()
       FROM jsonb_to_recordset($1::jsonb) AS incoming(id uuid, sort_order integer)
       WHERE b.id = incoming.id AND b.project_id = $2`,
      [JSON.stringify(order), req.params.projectId]
    );
    res.json({ message: 'Blocks reordered.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder blocks.' });
  }
});

module.exports = router;
