const express = require('express');
const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { getJson, setJson, invalidateTeam } = require('../utils/cache');
const { setPublicCacheHeaders, setPrivateCacheHeaders } = require('../utils/publicCacheHeaders');

const router = express.Router();

const teamCustomizationSchema = {
  name: s.string({ max: 120 }),
  description: s.string({ max: 2000 }),
  type: s.string({ max: 80, pattern: /^[a-zA-Z0-9_-]+$/ }),
  website: s.url({ max: 2048 }),
  theme: s.string({ max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  accent_color: s.hexColor(),
  layout: s.string({ max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  is_public: s.boolean(),
  seo_title: s.string({ max: 120 }),
  seo_description: s.string({ max: 220 }),
  show_skills: s.boolean(),
  show_dates: s.boolean(),
  show_project_type: s.boolean(),
  section_order: s.array(s.string({ max: 80 }), { max: 50 }),
  section_config: s.object({ maxBytes: 50_000 }),
  id: s.uuid(),
  owner_id: s.uuid(),
  slug: s.string({ max: 120, pattern: /^[a-z0-9-]+$/ }),
  role: s.string({ max: 40 }),
  member_count: s.integer({ min: 0, max: 1_000_000 }),
  project_count: s.integer({ min: 0, max: 1_000_000 }),
  created_at: s.string({ max: 40 }),
  updated_at: s.string({ max: 40 }),
};

const teamCreateSchema = {
  ...teamCustomizationSchema,
  name: s.string({ required: true, min: 1, max: 120 }),
};

const teamInviteSchema = {
  username: s.string({ required: true, min: 3, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
};

const teamProjectSchema = {
  project_id: s.uuid({ required: true }),
};

const memberRoleSchema = {
  role: s.enum(['member', 'admin'], { required: true }),
};

const createNotification = async (userId, type, title, message, data = {}) => {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, JSON.stringify(data)]
  ).catch(err => console.error('Notification error:', err));
};

const makeSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 80);
const isTeamAdmin = (role, ownerId, userId) => role === 'admin' || role === 'owner' || ownerId === userId;

// ── CREATE TEAM ───────────────────────────────────────────────────────────────
router.post('/', requireAuth, validateSchema({ body: teamCreateSchema }), userQuota('teams.create', { windowMs: 60 * 60 * 1000, max: 60 }), async (req, res) => {
  const { name, description, type, website } = req.body;
  if (!name) return res.status(400).json({ error: 'Team name is required.' });

  try {
    let slug = makeSlug(name);
    const existing = await query('SELECT id FROM teams WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) slug = `${slug}-${Date.now()}`;

    const result = await query(
      `INSERT INTO teams (name, slug, description, type, website, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, description, type || 'organization', website, req.user.id]
    );

    const team = result.rows[0];

    // Add owner as admin member
    await query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'accepted')`,
      [team.id, req.user.id]
    );

    res.status(201).json({ team, message: 'Team created!' });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team.' });
  }
});

// ── GET MY TEAMS ──────────────────────────────────────────────────────────────
router.get('/my-teams', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, tm.role,
              COUNT(DISTINCT tm2.id) as member_count,
              COUNT(DISTINCT tp.id) as project_count
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1 AND tm.status = 'accepted'
       LEFT JOIN team_members tm2 ON tm2.team_id = t.id AND tm2.status = 'accepted'
       LEFT JOIN team_projects tp ON tp.team_id = t.id
       GROUP BY t.id, tm.role
       ORDER BY t.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ teams: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get teams.' });
  }
});

// ── GET TEAM ANALYTICS ────────────────────────────────────────────────────────
// GET /api/teams/:id/analytics  (admin/owner only, uses team id not slug)
router.get('/:id/analytics', requireAuth, async (req, res) => {
  try {
    // Verify requester is a member (admin check below)
    const memberCheck = await query(
      `SELECT tm.role, t.owner_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.status = 'accepted'`,
      [req.params.id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const isAdmin = memberCheck.rows[0].role === 'admin' || memberCheck.rows[0].owner_id === req.user.id;
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can view analytics.' });
    }

    const teamId = req.params.id;

    const [summary, projectViews, viewsByDay] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(views), 0)::bigint AS total,
                COALESCE(SUM(views) FILTER (WHERE day >= CURRENT_DATE - 30), 0)::bigint AS recent
         FROM analytics_daily WHERE subject_type = 'team' AND subject_id = $1`, [teamId]
      ),
      query(
        `SELECT p.title, p.slug, COALESCE(SUM(a.views), 0)::bigint AS views
         FROM team_projects tp JOIN projects p ON p.id = tp.project_id
         LEFT JOIN analytics_daily a ON a.project_id = p.id AND a.subject_type = 'team' AND a.subject_id = $1
         WHERE tp.team_id = $1 GROUP BY p.id ORDER BY views DESC`, [teamId]
      ),
      query(
        `SELECT day AS date, SUM(views)::bigint AS views FROM analytics_daily
         WHERE subject_type = 'team' AND subject_id = $1 AND day >= CURRENT_DATE - 30
         GROUP BY day ORDER BY day`, [teamId]
      ),
    ]);

    res.json({
      total_views: Number(summary.rows[0].total),
      last_30_days: Number(summary.rows[0].recent),
      project_views: projectViews.rows,
      views_by_day: viewsByDay.rows,
    });
  } catch (error) {
    console.error('Team analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics.' });
  }
});

// ── GET SINGLE TEAM (public) ──────────────────────────────────────────────────
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const cacheKey = `public:team:${req.params.slug}`;
    if (!req.user) {
      const cached = await getJson(cacheKey).catch(() => null);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        setPublicCacheHeaders(res);
        return res.json(cached);
      }
    }
    const teamResult = await query('SELECT * FROM teams WHERE slug = $1', [req.params.slug]);
    if (teamResult.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });

    const team = teamResult.rows[0];
    if (team.is_public === false) {
      const privateMember = req.user ? await query(
        "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
        [team.id, req.user.id]
      ) : { rows: [] };
      if (privateMember.rows.length === 0 && team.owner_id !== req.user?.id) {
        return res.status(404).json({ error: 'Team not found.' });
      }
    }

    const members = await query(
      `SELECT tm.role, u.id, u.full_name, u.username, u.avatar_url, u.headline
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'accepted'
       ORDER BY tm.role DESC, tm.joined_at ASC LIMIT 200`,
      [team.id]
    );

    const projects = await query(
      `SELECT p.*, u.full_name as owner_name, u.username as owner_username,
              array_agg(DISTINCT jsonb_build_object('id', c.user_id, 'name', cu.full_name, 'username', cu.username, 'avatar', cu.avatar_url)) FILTER (WHERE c.user_id IS NOT NULL) as collaborators
       FROM team_projects tp
       JOIN projects p ON p.id = tp.project_id AND p.status = 'published'
       JOIN users u ON u.id = p.user_id
       LEFT JOIN project_collaborators c ON c.project_id = p.id AND c.status = 'accepted'
       LEFT JOIN users cu ON cu.id = c.user_id
       WHERE tp.team_id = $1
       GROUP BY p.id, u.full_name, u.username
       ORDER BY p.is_featured DESC, p.created_at DESC LIMIT 200`,
      [team.id]
    );

    const userRole = req.user
      ? members.rows.find(m => m.id === req.user.id)?.role || null
      : null;

    // ── Record team page view (analytics) ────────────────────────────────────
    const response = { team, members: members.rows, projects: projects.rows, user_role: userRole };
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      setPublicCacheHeaders(res);
    } else {
      setPrivateCacheHeaders(res);
    }
    res.json(response);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team.' });
  }
});

// ── UPDATE TEAM ───────────────────────────────────────────────────────────────
router.put('/:id', requireAuth, validateSchema({ body: teamCustomizationSchema }), userQuota('teams.update', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  const { name, description, website, theme, accent_color, layout, is_public, type,
          seo_title, seo_description, show_skills, show_dates, show_project_type,
          section_order, section_config } = req.body;
  try {
    const team = await query('SELECT owner_id FROM teams WHERE id = $1', [req.params.id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });
    if (team.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can edit team settings.' });

    const result = await query(
      `UPDATE teams SET
        name              = COALESCE($1, name),
        description       = COALESCE($2, description),
        website           = COALESCE($3, website),
        theme             = COALESCE($4, theme),
        accent_color      = COALESCE($5, accent_color),
        layout            = COALESCE($6, layout),
        is_public         = COALESCE($7, is_public),
        type              = COALESCE($8, type),
        seo_title         = COALESCE($9, seo_title),
        seo_description   = COALESCE($10, seo_description),
        show_skills       = COALESCE($11, show_skills),
        show_dates        = COALESCE($12, show_dates),
        show_project_type = COALESCE($13, show_project_type),
        section_order     = COALESCE($14::jsonb, section_order),
        section_config    = COALESCE($15::jsonb, section_config),
        updated_at        = NOW()
       WHERE id = $16 RETURNING *`,
      [name, description, website, theme, accent_color, layout, is_public, type,
       seo_title, seo_description,
       show_skills ?? null, show_dates ?? null, show_project_type ?? null,
       section_order ? JSON.stringify(section_order) : null,
       section_config ? JSON.stringify(section_config) : null,
       req.params.id]
    );

    await invalidateTeam(result.rows[0]?.slug).catch(() => {});
    res.json({ team: result.rows[0], message: 'Team updated!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update team.' });
  }
});

// ── INVITE USER TO TEAM ───────────────────────────────────────────────────────
router.post('/:id/invite', requireAuth, validateSchema({ body: teamInviteSchema }), userQuota('teams.invite', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const { username } = req.body;
  try {
    const memberCheck = await query(
      "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0 || !['admin', 'owner'].includes(memberCheck.rows[0].role)) {
      return res.status(403).json({ error: 'Only admins can invite members.' });
    }

    const invitedUser = await query('SELECT id, full_name FROM users WHERE username = $1', [username]);
    if (invitedUser.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const invitedUserId = invitedUser.rows[0].id;
    if (invitedUserId === req.user.id) return res.status(400).json({ error: 'You cannot invite yourself.' });

    const existingMember = await query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [req.params.id, invitedUserId]
    );
    if (existingMember.rows.length > 0) return res.status(409).json({ error: 'User is already a team member.' });

    const token = randomUUID();
    const team = await query('SELECT name FROM teams WHERE id = $1', [req.params.id]);

    await query(
      `WITH created AS (INSERT INTO invitations (type, target_id, invited_by, invited_user_id, invite_token)
       VALUES ('team', $1, $2, $3, encode(digest($4, 'sha256'), 'hex')) RETURNING id)
       INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
       SELECT 'invitation', id, digest($4, 'sha256') FROM created`,
      [req.params.id, req.user.id, invitedUserId, token]
    );

    await createNotification(
      invitedUserId,
      'team_invite',
      `${req.user.full_name} invited you to join a team`,
      `You've been invited to join "${team.rows[0].name}"`,
      { team_id: req.params.id, team_name: team.rows[0].name, invite_token: token, inviter: req.user.full_name }
    );

    res.json({ message: `Invitation sent to @${username}!` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation.' });
  }
});

// ── GENERATE TEAM INVITE LINK ─────────────────────────────────────────────────
router.post('/:id/invite-link', requireAuth, userQuota('teams.invite-link', { windowMs: 60 * 60 * 1000, max: 40 }), async (req, res) => {
  try {
    const memberCheck = await query(
      "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0 || !['admin', 'owner'].includes(memberCheck.rows[0].role)) {
      return res.status(403).json({ error: 'Only admins can generate invite links.' });
    }

    const token = randomUUID();
    await query(
      `WITH created AS (INSERT INTO invitations (type, target_id, invited_by, invite_token)
       VALUES ('team', $1, $2, encode(digest($3, 'sha256'), 'hex')) RETURNING id)
       INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
       SELECT 'invitation', id, digest($3, 'sha256') FROM created`,
      [req.params.id, req.user.id, token]
    );

    const link = `${process.env.FRONTEND_URL}/join/${token}`;
    res.json({ link, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate invite link.' });
  }
});

// ── ADD PROJECT TO TEAM ───────────────────────────────────────────────────────
router.post('/:id/projects', requireAuth, validateSchema({ body: teamProjectSchema }), userQuota('teams.projects.add', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  const { project_id } = req.body;
  try {
    const memberCheck = await query(
      "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });

    const projectAccess = await query(
      `SELECT id FROM projects WHERE id = $1 AND (user_id = $2 OR id IN (
        SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted'
      ))`,
      [project_id, req.user.id]
    );
    if (projectAccess.rows.length === 0) return res.status(403).json({ error: 'You do not have access to this project.' });

    await query(
      'INSERT INTO team_projects (team_id, project_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.params.id, project_id, req.user.id]
    );

    const addedTeam = await query('SELECT slug FROM teams WHERE id = $1', [req.params.id]);
    await invalidateTeam(addedTeam.rows[0]?.slug).catch(() => {});
    res.json({ message: 'Project added to team!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add project.' });
  }
});

// ── REMOVE PROJECT FROM TEAM ──────────────────────────────────────────────────
router.delete('/:id/projects/:projectId', requireAuth, userQuota('teams.projects.remove', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const memberCheck = await query(
      `SELECT tm.role, t.owner_id, t.slug
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.status = 'accepted'`,
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0 || !isTeamAdmin(memberCheck.rows[0].role, memberCheck.rows[0].owner_id, req.user.id)) {
      return res.status(403).json({ error: 'Only team admins can remove projects.' });
    }
    const result = await query(
      'DELETE FROM team_projects WHERE team_id = $1 AND project_id = $2 RETURNING project_id',
      [req.params.id, req.params.projectId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team project not found.' });
    await invalidateTeam(memberCheck.rows[0].slug).catch(() => {});
    res.json({ message: 'Project removed from team.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove project.' });
  }
});

// ── REMOVE MEMBER ─────────────────────────────────────────────────────────────
router.delete('/:id/members/:userId', requireAuth, userQuota('teams.members.remove', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const team = await query('SELECT owner_id FROM teams WHERE id = $1', [req.params.id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });

    const isOwner = team.rows[0].owner_id === req.user.id;
    const isSelf = req.params.userId === req.user.id;
    if (!isOwner && !isSelf) return res.status(403).json({ error: 'Access denied.' });

    await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member.' });
  }
});

// ── UPDATE MEMBER ROLE ────────────────────────────────────────────────────────
router.put('/:id/members/:userId/role', requireAuth, validateSchema({ body: memberRoleSchema }), userQuota('teams.members.role', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  const { role } = req.body;
  try {
    const team = await query('SELECT owner_id FROM teams WHERE id = $1', [req.params.id]);
    if (team.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can change roles.' });

    await query(
      'UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3',
      [role, req.params.id, req.params.userId]
    );
    res.json({ message: 'Role updated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

// ── DELETE TEAM ───────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, userQuota('teams.delete', { windowMs: 60 * 60 * 1000, max: 40 }), async (req, res) => {
  try {
    const team = await query('SELECT owner_id FROM teams WHERE id = $1', [req.params.id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });
    if (team.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete the team.' });

    await query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.json({ message: 'Team deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete team.' });
  }
});

module.exports = router;
