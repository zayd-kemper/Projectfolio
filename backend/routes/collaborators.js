const express = require('express');
const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { invalidateTeam } = require('../utils/cache');
const { invalidateForProjectId } = require('../utils/portfolioCacheInvalidation');

const router = express.Router();

const inviteSchema = {
  username: s.string({ required: true, min: 3, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
};

// Helper: create notification
const createNotification = async (userId, type, title, message, data = {}) => {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, JSON.stringify(data)]
  ).catch(err => console.error('Notification error:', err));
};

// ── GET PROJECT COLLABORATORS ─────────────────────────────────────────────────
router.get('/project/:projectId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT pc.*, u.full_name, u.username, u.avatar_url, u.headline
       FROM project_collaborators pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.project_id = $1 AND pc.status = 'accepted'`,
      [req.params.projectId]
    );
    res.json({ collaborators: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get collaborators.' });
  }
});

// ── INVITE USER TO PROJECT BY USERNAME ────────────────────────────────────────
router.post('/project/:projectId/invite', requireAuth, validateSchema({ body: inviteSchema }), userQuota('collaborators.invite', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const { username } = req.body;
  try {
    // Verify requester owns the project
    const project = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (project.rows.length === 0) {
      return res.status(403).json({ error: 'Only the project owner can invite collaborators.' });
    }

    // Find invited user
    const invitedUser = await query('SELECT id, full_name FROM users WHERE username = $1', [username]);
    if (invitedUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const invitedUserId = invitedUser.rows[0].id;

    if (invitedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot invite yourself.' });
    }

    // Check if already a collaborator
    const existing = await query(
      'SELECT id FROM project_collaborators WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, invitedUserId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a collaborator.' });
    }

    // Create invitation
    const token = randomUUID();
    await query(
      `WITH created AS (INSERT INTO invitations (type, target_id, invited_by, invited_user_id, invite_token)
       VALUES ('project', $1, $2, $3, encode(digest($4, 'sha256'), 'hex')) RETURNING id)
       INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
       SELECT 'invitation', id, digest($4, 'sha256') FROM created`,
      [req.params.projectId, req.user.id, invitedUserId, token]
    );

    // Create notification for invited user
    await createNotification(
      invitedUserId,
      'project_invite',
      `${req.user.full_name} invited you to collaborate`,
      `You've been invited to collaborate on "${project.rows[0].title}"`,
      { project_id: req.params.projectId, project_title: project.rows[0].title, invite_token: token, inviter: req.user.full_name }
    );

    res.json({ message: `Invitation sent to @${username}!` });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to send invitation.' });
  }
});

// ── GENERATE INVITE LINK ──────────────────────────────────────────────────────
router.post('/project/:projectId/invite-link', requireAuth, userQuota('collaborators.invite-link', { windowMs: 60 * 60 * 1000, max: 40 }), async (req, res) => {
  try {
    const project = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (project.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });

    const token = randomUUID();
    await query(
      `WITH created AS (INSERT INTO invitations (type, target_id, invited_by, invite_token)
       VALUES ('project', $1, $2, encode(digest($3, 'sha256'), 'hex')) RETURNING id)
       INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
       SELECT 'invitation', id, digest($3, 'sha256') FROM created`,
      [req.params.projectId, req.user.id, token]
    );

    const link = `${process.env.FRONTEND_URL}/join/${token}`;
    res.json({ link, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate invite link.' });
  }
});

// ── ACCEPT INVITE (via token) ─────────────────────────────────────────────────
router.post('/join/:token', requireAuth, userQuota('collaborators.join', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  try {
    const invite = await query(
      `SELECT i.* FROM invitations i JOIN secure_token_registry st
       ON st.entity_type = 'invitation' AND st.entity_id = i.id
       WHERE st.token_hash = digest($1, 'sha256') AND i.expires_at > NOW() AND i.status = 'pending'`,
    [req.params.token]
  );

    if (invite.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or expired.' });
    }

    const inv = invite.rows[0];

    // Check invite is for this user if it was a direct invite
    if (inv.invited_user_id && inv.invited_user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invitation was sent to a different user.' });
    }

    if (inv.type === 'project') {
      // Check not already collaborator
      const existing = await query(
        'SELECT id FROM project_collaborators WHERE project_id = $1 AND user_id = $2',
        [inv.target_id, req.user.id]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO project_collaborators (project_id, user_id, invited_by, status)
           VALUES ($1, $2, $3, 'accepted')`,
          [inv.target_id, req.user.id, inv.invited_by]
        );
      }

      // Mark invite used
      await query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);

      // Notify project owner
      const project = await query('SELECT title, user_id FROM projects WHERE id = $1', [inv.target_id]);
      if (project.rows.length > 0) {
        await createNotification(
          project.rows[0].user_id,
          'collaborator_joined',
          `${req.user.full_name} joined your project`,
          `@${req.user.username} accepted your invitation to collaborate on "${project.rows[0].title}"`,
          { project_id: inv.target_id }
        );
      }

      // req.user is the joining collaborator, not the owner — resolve the owner
      // from the project so the right cached pages are cleared.
      await invalidateForProjectId(inv.target_id);

      res.json({ message: 'You have joined the project!', type: 'project', id: inv.target_id });
    } else if (inv.type === 'team') {
      const existing = await query(
        'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
        [inv.target_id, req.user.id]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO team_members (team_id, user_id, invited_by, status)
           VALUES ($1, $2, $3, 'accepted')`,
          [inv.target_id, req.user.id, inv.invited_by]
        );
      }

      await query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);

      const team = await query('SELECT name, owner_id, slug FROM teams WHERE id = $1', [inv.target_id]);
      if (team.rows.length > 0) {
        await createNotification(
          team.rows[0].owner_id,
          'team_member_joined',
          `${req.user.full_name} joined your team`,
          `@${req.user.username} joined "${team.rows[0].name}"`,
          { team_id: inv.target_id }
        );
      }

      // The member list is part of the cached team body; the slug comes from the
      // row this route already fetched.
      await invalidateTeam(team.rows[0]?.slug).catch(() => {});

      res.json({ message: 'You have joined the team!', type: 'team', id: inv.target_id });
    }
  } catch (error) {
    console.error('Join error:', error);
    res.status(500).json({ error: 'Failed to join.' });
  }
});

// ── REMOVE COLLABORATOR ───────────────────────────────────────────────────────
router.delete('/project/:projectId/collaborator/:userId', requireAuth, userQuota('collaborators.remove', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const project = await query('SELECT user_id FROM projects WHERE id = $1', [req.params.projectId]);
    if (project.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });

    const isOwner = project.rows[0].user_id === req.user.id;
    const isSelf = req.params.userId === req.user.id;
    if (!isOwner && !isSelf) return res.status(403).json({ error: 'Access denied.' });

    await query(
      'DELETE FROM project_collaborators WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, req.params.userId]
    );

    // A collaborator may remove themselves, so req.user is not necessarily the
    // owner whose cached pages list them.
    await invalidateForProjectId(req.params.projectId);

    res.json({ message: 'Collaborator removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove collaborator.' });
  }
});

// ── GET PROJECTS I COLLABORATE ON ─────────────────────────────────────────────
router.get('/my-collaborations', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.full_name as owner_name, u.username as owner_username, u.avatar_url as owner_avatar
       FROM project_collaborators pc
       JOIN projects p ON p.id = pc.project_id
       JOIN users u ON u.id = p.user_id
       WHERE pc.user_id = $1 AND pc.status = 'accepted'
       ORDER BY pc.joined_at DESC LIMIT 200`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get collaborations.' });
  }
});

module.exports = router;
