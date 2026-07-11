const db = require('../config/database');
const portfolioAiContext = require('../utils/portfolioAiContext');

// Builds the full applicant context the Application Helper engine feeds to the
// resume renderer and cover-letter generator. buildPortfolioAiContext returns the
// user's fields at the top level (with `name`, not full_name) — this adapter
// reshapes them into a `profile` object, adds contact fields the AI context
// deliberately omits, merges structured experiences, and appends the canonical
// public portfolio URL.
const buildApplicationContext = async (userId) => {
  const base = await portfolioAiContext.buildPortfolioAiContext(userId);

  const contactResult = await db.query(
    'SELECT phone, contact_email, email FROM users WHERE id = $1',
    [userId]
  );
  const contact = contactResult.rows[0] || {};

  const experiencesResult = await db.query(
    `SELECT id, kind, title, organization, location,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            is_current, description, highlights, skills, url, credential_id, field_of_study, grade
     FROM profile_experiences
     WHERE user_id = $1
     ORDER BY kind, sort_order, start_date DESC NULLS LAST, created_at DESC`,
    [userId]
  );

  const experiences = { employment: [], education: [], certification: [] };
  for (const row of experiencesResult.rows) {
    if (experiences[row.kind]) experiences[row.kind].push(row);
  }

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const username = base.username || '';

  return {
    profile: {
      username,
      full_name: base.name || '',
      headline: base.headline || null,
      bio: base.bio || null,
      location: base.location || null,
      website: base.website || null,
      github_url: base.github_url || null,
      linkedin_url: base.linkedin_url || null,
      skills: base.skills || [],
      phone: contact.phone || null,
      contact_email: contact.contact_email || null,
      email: contact.email || null,
    },
    projects: base.projects || [],
    experiences,
    portfolio_url: username ? `${frontendUrl}/${username}` : frontendUrl,
  };
};

module.exports = { buildApplicationContext };
