// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { REFRESH_COOKIE, issueAuthTokens, rotateRefreshToken, revokeRefreshToken } = require('../utils/tokens');
const { setTokenVersion } = require('../utils/authTokenVersion');
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

const registerSchema = {
  email: s.email({ required: true, max: 254 }),
  password: s.string({ required: true, min: 8, max: 256, trim: false }),
  full_name: s.string({ required: true, min: 2, max: 120 }),
  username: s.string({ min: 3, max: 50, pattern: /^[a-zA-Z0-9_-]+$/ }),
};

const loginSchema = {
  email: s.email({ required: true, max: 254 }),
  password: s.string({ required: true, min: 1, max: 256, trim: false }),
};

const changePasswordSchema = {
  current_password: s.string({ required: true, min: 1, max: 256, trim: false }),
  new_password: s.string({ required: true, min: 8, max: 256, trim: false }),
};

const changeEmailSchema = {
  new_email: s.email({ required: true, max: 254 }),
  password: s.string({ required: true, min: 1, max: 256, trim: false }),
};

// Helper to make a URL-safe username from a name
const makeUsername = (name) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 50);
};

// ── REGISTER ──────────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', validateSchema({ body: registerSchema }), async (req, res) => {
  const { email, password, full_name, username: requestedUsername } = req.body;

  try {
    // Check if email already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Generate unique username
    let username = requestedUsername || makeUsername(full_name);
    const usernameCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      username = `${username}-${Math.floor(Math.random() * 9999)}`;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, username)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, username, created_at`,
      [email, passwordHash, full_name, username]
    );

    const user = result.rows[0];

    // Create default portfolio settings
    await query(
      'INSERT INTO portfolio_settings (user_id) VALUES ($1)',
      [user.id]
    );

    const token = await issueAuthTokens(res, user);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// ── LOGIN ──────────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', validateSchema({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await query(
      'SELECT id, email, password_hash, full_name, username, avatar_url, token_version FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = await issueAuthTokens(res, user);

    res.json({
      message: 'Logged in successfully!',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const token = await rotateRefreshToken(res, req.cookies?.[REFRESH_COOKIE]);
    if (!token) return res.status(401).json({ error: 'Refresh session expired.', code: 'AUTH_REQUIRED' });
    res.json({ token });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Could not refresh session.' });
  }
});

router.post('/logout', async (req, res) => {
  await revokeRefreshToken(res, req.cookies?.[REFRESH_COOKIE]).catch(() => {});
  res.status(204).end();
});

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

    res.json({ user: result.rows[0], message: 'Profile updated!' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
router.put('/change-password', requireAuth, validateSchema({ body: changePasswordSchema }), userQuota('auth.password.write', { windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(new_password, 12);
    const updated = await query('UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2 RETURNING token_version', [newHash, req.user.id]);
    await setTokenVersion(req.user.id, updated.rows[0].token_version);
    await query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1', [req.user.id]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ message: 'Password changed successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ponytail: express-validator layer removed — schemaValidation covers it; emails are
// lowercased only (normalizeEmail's gmail dot-stripping never applied to OAuth signups).
router.put('/change-email', requireAuth, validateSchema({ body: changeEmailSchema }), userQuota('auth.email.write', { windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  const { new_email, password } = req.body;
  try {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Password is incorrect.' });

    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [new_email, req.user.id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already in use.' });

    await query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [new_email, req.user.id]);
    res.json({ message: 'Email updated successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update email.' });
  }
});

router.post('/logout-all', requireAuth, userQuota('auth.logout-all', { windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const updated = await query('UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING token_version', [req.user.id]);
    await setTokenVersion(req.user.id, updated.rows[0].token_version);
    await query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1', [req.user.id]);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to log out sessions.' });
  }
});

module.exports = router;
