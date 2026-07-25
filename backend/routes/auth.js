// backend/routes/auth.js
//
// Supabase Auth owns registration, login, refresh, logout, password changes, and
// email changes — the SPA calls GoTrue directly for all of them. What is left here
// is the profile surface that lives in public.users.
const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { invalidateAuthProfile } = require('../utils/authProfile');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
require('dotenv').config();

const router = express.Router();

const profileSchema = {
  full_name: s.string({ max: 120 }),
  headline: s.string({ max: 180 }),
  bio: s.string({ max: 2000 }),
  location: s.string({ max: 120 }),
  website: s.url({ max: 2048 }),
  linkedin_url: s.url({ max: 2048 }),
  github_url: s.url({ max: 2048 }),
  skills: s.array(s.string({ max: 60 }), { max: 50 }),
  username: s.string({ min: 3, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
  phone: s.string({ max: 40 }),
  contact_email: s.email({ max: 254 }),
  identity_mode: s.string({ max: 40, pattern: /^[a-zA-Z0-9_-]+$/ }),
};

// ── GET CURRENT USER ──────────────────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.username, u.headline, u.bio,
              u.avatar_url, u.location, u.website, u.linkedin_url,
              u.github_url, u.resume_url, u.skills, u.created_at, u.identity_mode,
              ps.theme, ps.accent_color, ps.is_public, ps.show_contact_form
       FROM users u
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data.' });
  }
});

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
// PUT /api/auth/profile
router.put('/profile', requireAuth, userQuota('auth.profile.write', { windowMs: 60 * 60 * 1000, max: 120 }), validateSchema({ body: profileSchema }), async (req, res) => {
  const { full_name, headline, bio, location, website, linkedin_url, github_url, skills, username, phone, contact_email, identity_mode } = req.body;
  try {
    // Check username uniqueness if changing
    if (username && username !== req.user.username) {
      const check = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
      if (check.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
    }

  const result = await query(
  `UPDATE users SET
    full_name = COALESCE($1, full_name),
    headline = COALESCE($2, headline),
    bio = COALESCE($3, bio),
    location = COALESCE($4, location),
    website = COALESCE($5, website),
    linkedin_url = COALESCE($6, linkedin_url),
    github_url = COALESCE($7, github_url),
    skills = COALESCE($8, skills),
    username = COALESCE($9, username),
    phone = COALESCE($10, phone),
    contact_email = COALESCE($11, contact_email),
    identity_mode = COALESCE($12, identity_mode),
    updated_at = NOW()
   WHERE id = $13
   RETURNING id, email, full_name, username, headline, bio, location, website, linkedin_url, github_url, skills, phone, contact_email, identity_mode`,
  [full_name, headline, bio, location, website, linkedin_url, github_url, skills, username, phone, contact_email, identity_mode || null, req.user.id]
);

    // req.user is served from a 60s cache; a profile edit must be visible at once.
    await invalidateAuthProfile(req.user.id);

    res.json({ user: result.rows[0], message: 'Profile updated!' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
