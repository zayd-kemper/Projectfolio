const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-openidconnect');
const { query } = require('./database');
require('dotenv').config();

const makeUsername = (name) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 50);
};

// ── GOOGLE STRATEGY ───────────────────────────────────────────────────────────
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.APP_URL}/api/auth/google/callback`,
  state: true,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists with this Google ID
    const existing = await query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    if (existing.rows.length > 0) {
      return done(null, existing.rows[0]);
    }

    // Check if email already exists
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email from Google'), null);
    const emailVerified = profile.emails?.[0]?.verified === true || profile._json?.email_verified === true;
    if (!emailVerified) return done(new Error('Google email is not verified'), null);

    const emailCheck = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      // Link Google ID to existing account
      await query('UPDATE users SET google_id = $1 WHERE email = $2', [profile.id, email]);
      return done(null, emailCheck.rows[0]);
    }

    // Create new user from Google profile
    let username = makeUsername(profile.displayName || email.split('@')[0]);
    const usernameCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) username = `${username}-${Math.floor(Math.random() * 9999)}`;

    const avatarUrl = profile.photos?.[0]?.value || null;

    const result = await query(
      `INSERT INTO users (email, full_name, username, avatar_url, google_id, is_email_verified)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [email, profile.displayName, username, avatarUrl, profile.id]
    );

    // Create default portfolio settings
    await query('INSERT INTO portfolio_settings (user_id) VALUES ($1)', [result.rows[0].id]);

    return done(null, result.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// ── LINKEDIN STRATEGY ─────────────────────────────────────────────────────────
passport.use('linkedin', new LinkedInStrategy({
  issuer: 'https://www.linkedin.com/oauth',
  authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
  userInfoURL: 'https://api.linkedin.com/v2/userinfo',
  clientID: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  callbackURL: `${process.env.APP_URL}/api/auth/linkedin/callback`,
  scope: ['openid', 'profile', 'email'],
  state: true,
}, async (issuer, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value || profile._json?.email;
    if (!email) return done(new Error('No email from LinkedIn'), null);
    const emailVerified = profile._json?.email_verified !== false;
    if (!emailVerified) return done(new Error('LinkedIn email is not verified'), null);
    const linkedinUrl = profile._json?.sub ? `https://www.linkedin.com/in/${profile._json.sub}` : null;

    const existing = await query('SELECT * FROM users WHERE linkedin_id = $1', [profile.id]);
    if (existing.rows.length > 0) return done(null, existing.rows[0]);

    const emailCheck = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      await query('UPDATE users SET linkedin_id = $1, linkedin_url = $2 WHERE email = $3', [profile.id, linkedinUrl, email]);      return done(null, emailCheck.rows[0]);
    }

    let username = makeUsername(profile.displayName || email.split('@')[0]);
    const usernameCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      username = `${username}-${Math.floor(Math.random() * 9999)}`;
    }

    const avatarUrl = profile.photos?.[0]?.value || profile._json?.picture || null;
    const headline = profile._json?.headline || null;
    const location = profile._json?.locale?.country || null;
    const result = await query(
    `INSERT INTO users (email, full_name, username, avatar_url, headline, location, linkedin_id, linkedin_url, is_email_verified)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *`,
    [email, profile.displayName, username, avatarUrl, headline, location, profile.id, linkedinUrl]
  );

    await query('INSERT INTO portfolio_settings (user_id) VALUES ($1)', [result.rows[0].id]);
    return done(null, result.rows[0]);
  } catch (error) {
    console.error('LinkedIn OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  done(null, result.rows[0]);
});

module.exports = passport;
