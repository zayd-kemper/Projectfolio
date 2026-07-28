// backend/routes/endorsements.js
// Manages real endorsements/testimonials — request, submit, approve, display

const express = require('express');
const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { createJob } = require('../jobs/service');
const { invalidatePortfolio } = require('../utils/cache');

const router = express.Router();

const requestSchema = {
  from_email: s.email({ max: 254 }),
  project_id: s.uuid({ allowNull: true }),
  note: s.string({ max: 1000 }),
};

const submitSchema = {
  from_name: s.string({ required: true, min: 1, max: 120 }),
  from_role: s.string({ max: 120 }),
  quote: s.string({ required: true, min: 1, max: 1000 }),
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ── Helper: send notification ──────────────────────────────────────────────────
const notify = async (userId, type, title, message, data = {}) => {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, JSON.stringify(data)]
  ).catch((e) => console.error('Notification error:', e));
};

// ── Helper: send email if configured ──────────────────────────────────────────
const trySendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) return false;
  try {
    await createJob({ type: 'email:send', input: { to, subject, text, html } });
    return true;
  } catch (e) {
    console.error('Email error:', e.message);
    return false;
  }
};

// ── POST /api/endorsements/request ────────────────────────────────────────────
// Owner generates an endorsement request link (optionally sends email)
router.post('/request', requireAuth, validateSchema({ body: requestSchema }), userQuota('endorsements.request', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const { from_email, project_id, note } = req.body;

  try {
    // Validate project belongs to owner if provided
    if (project_id) {
      const proj = await query(
        'SELECT id, title FROM projects WHERE id = $1 AND user_id = $2',
        [project_id, req.user.id]
      );
      if (proj.rows.length === 0) {
        return res.status(403).json({ error: 'Project not found or access denied.' });
      }
    }

    const token = randomUUID();

    await query(
      `WITH created AS (
         INSERT INTO endorsements (token, to_user_id, from_email, project_id)
         VALUES (encode(digest($1, 'sha256'), 'hex'), $2, $3, $4) RETURNING id
       ) INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
         SELECT 'endorsement', id, digest($1, 'sha256') FROM created`,
      [token, req.user.id, from_email || null, project_id || null]
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${baseUrl}/endorse/${token}`;

    // Optionally email the link
    let emailed = false;
    if (from_email) {
      const projectRow = project_id
        ? (await query('SELECT title FROM projects WHERE id = $1', [project_id])).rows[0]
        : null;

      const noteText = note ? `\n\nPersonal note: "${note}"` : '';
      const projectContext = projectRow ? ` for the project "${projectRow.title}"` : '';
      const safeProjectContext = projectRow ? ` for the project "${escapeHtml(projectRow.title)}"` : '';

      emailed = await trySendEmail({
        to: from_email,
        subject: `${req.user.full_name} is requesting an endorsement`,
        text:
          `Hi,\n\n${req.user.full_name} would like an endorsement from you${projectContext} on ProjectFolio.${noteText}\n\n` +
          `Click the link below to write a short testimonial — it only takes a minute:\n\n${link}\n\n` +
          `This link is unique to you. Thank you!`,
        html:
          `<p>Hi,</p>` +
          `<p><strong>${escapeHtml(req.user.full_name)}</strong> would like an endorsement from you${safeProjectContext} on ProjectFolio.</p>` +
          (note ? `<p><em>"${escapeHtml(note)}"</em></p>` : '') +
          `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Write endorsement</a></p>` +
          `<p style="color:#888;font-size:12px;">This link is unique to you and can only be used once.</p>`,
      });
    }

    res.json({
      token,
      link,
      emailed,
      message: emailed
        ? `Endorsement request sent to ${from_email}`
        : 'Endorsement link generated — share it however you like.',
    });
  } catch (error) {
    console.error('Endorsement request error:', error);
    res.status(500).json({ error: 'Failed to create endorsement request.' });
  }
});

// ── GET /api/endorsements/lookup/:token ───────────────────────────────────────
// Public — fetches context for the submission page (no auth)
router.get('/lookup/:token', async (req, res) => {
  try {
    const result = await query(
      `SELECT e.id, e.from_name, e.quote, e.is_approved, e.is_rejected,
              u.full_name, u.username, u.avatar_url, u.headline,
              p.title as project_title
       FROM endorsements e
       JOIN secure_token_registry st ON st.entity_type = 'endorsement' AND st.entity_id = e.id
       JOIN users u ON u.id = e.to_user_id
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE st.token_hash = digest($1, 'sha256')`,
      [req.params.token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Endorsement request not found or expired.' });
    }

    const row = result.rows[0];

    if (row.quote) {
      return res.status(409).json({ error: 'This endorsement has already been submitted.' });
    }
    if (row.is_rejected) {
      return res.status(410).json({ error: 'This endorsement request is no longer active.' });
    }

    res.json({
      recipient: {
        full_name: row.full_name,
        username: row.username,
        avatar_url: row.avatar_url,
        headline: row.headline,
      },
      project_title: row.project_title || null,
    });
  } catch (error) {
    console.error('Endorsement lookup error:', error);
    res.status(500).json({ error: 'Failed to load endorsement request.' });
  }
});

// ── POST /api/endorsements/submit/:token ──────────────────────────────────────
// Public — submits the quote (no auth required)
router.post('/submit/:token', validateSchema({ body: submitSchema }), userQuota('endorsements.submit', { windowMs: 60 * 60 * 1000, max: 30 }), async (req, res) => {
  const { from_name, from_role, quote } = req.body;

  if (!from_name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!quote?.trim())     return res.status(400).json({ error: 'Endorsement text is required.' });
  if (quote.trim().length > 1000) return res.status(400).json({ error: 'Endorsement must be under 1,000 characters.' });

  try {
    const existing = await query(
      `SELECT e.id, e.quote, e.to_user_id, u.full_name
       FROM endorsements e
       JOIN secure_token_registry st ON st.entity_type = 'endorsement' AND st.entity_id = e.id
       JOIN users u ON u.id = e.to_user_id
       WHERE st.token_hash = digest($1, 'sha256')`,
      [req.params.token]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired endorsement link.' });
    }

    const row = existing.rows[0];

    if (row.quote) {
      return res.status(409).json({ error: 'This endorsement has already been submitted.' });
    }

    await query(
      `UPDATE endorsements e
       SET from_name = $1, from_role = $2, quote = $3
       FROM secure_token_registry st
       WHERE st.entity_type = 'endorsement' AND st.entity_id = e.id AND st.token_hash = digest($4, 'sha256')`,
      [from_name.trim(), from_role?.trim() || null, quote.trim(), req.params.token]
    );

    // Notify the portfolio owner
    await notify(
      row.to_user_id,
      'endorsement_received',
      `New endorsement from ${from_name}`,
      `${from_name} just submitted an endorsement. Review it in Portfolio Settings.`,
      { from_name, from_role, preview: quote.slice(0, 80) }
    );

    res.json({ message: 'Endorsement submitted! The portfolio owner will review it.' });
  } catch (error) {
    console.error('Endorsement submit error:', error);
    res.status(500).json({ error: 'Failed to submit endorsement.' });
  }
});

// ── GET /api/endorsements/mine ────────────────────────────────────────────────
// Owner: get all their received endorsements
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT e.id, e.token, e.from_name, e.from_email, e.from_role, e.quote,
              e.is_approved, e.is_rejected, e.created_at, e.approved_at,
              p.title as project_title
       FROM endorsements e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.to_user_id = $1
       ORDER BY e.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ endorsements: result.rows });
  } catch (error) {
    console.error('Get endorsements error:', error);
    res.status(500).json({ error: 'Failed to load endorsements.' });
  }
});

// ── PATCH /api/endorsements/:id/approve ───────────────────────────────────────
router.patch('/:id/approve', requireAuth, userQuota('endorsements.moderate', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  try {
    const result = await query(
      `UPDATE endorsements
       SET is_approved = true, is_rejected = false, approved_at = now()
       WHERE id = $1 AND to_user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Endorsement not found.' });
    // Approved endorsements are rendered into the cached public portfolio body.
    await invalidatePortfolio(req.user.username).catch(() => {});
    res.json({ message: 'Endorsement approved.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve endorsement.' });
  }
});

// ── PATCH /api/endorsements/:id/reject ────────────────────────────────────────
router.patch('/:id/reject', requireAuth, userQuota('endorsements.moderate', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  try {
    const result = await query(
      `UPDATE endorsements
       SET is_approved = false, is_rejected = true
       WHERE id = $1 AND to_user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Endorsement not found.' });
    // A rejection can un-publish a previously approved endorsement.
    await invalidatePortfolio(req.user.username).catch(() => {});
    res.json({ message: 'Endorsement rejected.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject endorsement.' });
  }
});

// ── DELETE /api/endorsements/:id ──────────────────────────────────────────────
router.delete('/:id', requireAuth, userQuota('endorsements.delete', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM endorsements WHERE id = $1 AND to_user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Endorsement not found.' });
    await invalidatePortfolio(req.user.username).catch(() => {});
    res.json({ message: 'Endorsement deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete endorsement.' });
  }
});

module.exports = router;
