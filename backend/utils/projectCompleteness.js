// backend/utils/projectCompleteness.js
const { query } = require('../config/database');

const MIN_AI_TOOLS_COMPLETENESS = 50;

const AI_TOOLS_GATE_MESSAGE = 'You need at least one project that is at least 50% complete to use the AI tools. '
  + 'Add a cover image, tagline, description, or technologies to one of your projects, then try again.';

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Mirrors scoreCompleteness() in frontend/src/pages/DashboardPage.jsx — keep the two in sync.
const scoreProjectCompleteness = (project = {}) => {
  let score = 0;
  if (project.cover_image_url) score += 20;
  if (String(project.tagline || '').trim()) score += 15;
  if (String(project.description || '').trim()) score += 10;
  if (asArray(project.technologies).length >= 2) score += 15;
  if (project.start_date) score += 10;
  if (project.github_url || project.live_url) score += 15;
  if (project.project_type) score += 5;
  if (Number(project.view_count) > 0) score += 5;
  if (project.is_featured) score += 5;
  return Math.min(score, 100);
};

const hasQualifiedProject = async (userId, { minScore = MIN_AI_TOOLS_COMPLETENESS, queryFn = query } = {}) => {
  const result = await queryFn(
    `SELECT cover_image_url, tagline, description, technologies, start_date,
            github_url, live_url, project_type, view_count, is_featured
       FROM projects
      WHERE user_id = $1`,
    [userId]
  );
  return result.rows.some((project) => scoreProjectCompleteness(project) >= minScore);
};

module.exports = {
  AI_TOOLS_GATE_MESSAGE,
  MIN_AI_TOOLS_COMPLETENESS,
  scoreProjectCompleteness,
  hasQualifiedProject,
};
