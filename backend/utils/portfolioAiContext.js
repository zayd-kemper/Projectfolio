const { query } = require('../config/database');

const MAX_PROJECTS = 30;
const MAX_BLOCKS_PER_PROJECT = 80;
const MAX_BLOCK_TEXT_CHARS = 2200;
const MAX_SHORT_TEXT_CHARS = 420;

const asArray = (value) => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : []);

const stripHtml = (value) => String(value || '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ');

const compactText = (value, max = MAX_SHORT_TEXT_CHARS) => stripHtml(value)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const joinParts = (...parts) => parts.map((part) => compactText(part, 1000)).filter(Boolean).join(' - ');

const extractBlockPlainText = (block = {}) => {
  const type = String(block.type || '').toLowerCase();
  const content = block.content && typeof block.content === 'object' ? block.content : {};

  if (type === 'text') return compactText(content.text || content.html, 1600);
  if (type === 'heading') return compactText(content.text || content.title, 500);
  if (type === 'callout') return joinParts(content.title, content.text || content.body);
  if (type === 'image' || type === 'video') return joinParts(content.caption, content.alt, content.title);
  if (type === 'code') return joinParts(`Code sample in ${content.language || 'code'}`, content.caption, content.filename);
  if (type === 'embed') return joinParts(content.title, content.caption, content.url);
  if (type === 'metrics') {
    return asArray(content.items).map((item) => joinParts(
      `${item.value || ''}${item.unit || ''}`.trim(),
      item.label,
      item.description
    )).filter(Boolean).join('; ');
  }
  if (type === 'timeline') {
    return asArray(content.items).map((item) => joinParts(item.date, item.title, item.description)).filter(Boolean).join('; ');
  }
  if (type === 'table') {
    const headers = asArray(content.headers).join(', ');
    const rows = asArray(content.rows).slice(0, 4).map((row) => asArray(row).join(', ')).join('; ');
    return joinParts(headers ? `Table: ${headers}` : 'Table', rows);
  }
  if (type === 'list') {
    return asArray(content.items).map((item) => compactText(typeof item === 'string' ? item : item?.text, 300)).filter(Boolean).join('; ');
  }

  const direct = content.text || content.html || content.caption || content.description || content.title;
  if (direct) return compactText(direct, 1200);

  return '';
};

const countBy = (items) => items.reduce((acc, item) => {
  const key = compactText(item, 80).toLowerCase();
  if (key) acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const topEntries = (counts, limit) => Object.entries(counts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, limit)
  .map(([name, count]) => ({ name, count }));

const evidenceScoreForProject = (project) => {
  let score = 0;
  if (project.status === 'published') score += 2;
  if (project.is_featured) score += 1;
  if (project.description) score += 1;
  if (project.tagline) score += 1;
  if (project.github_url) score += 1;
  if (project.live_url) score += 1;
  if (project.cover_image_url) score += 1;
  if (asArray(project.technologies).length) score += 1;
  if (project.block_content && project.block_content.length > 300) score += 2;
  else if (project.block_content) score += 1;
  return score;
};

const buildProjectSnapshot = (row) => {
  const blocks = asArray(row.blocks).slice(0, MAX_BLOCKS_PER_PROJECT);
  const blockText = blocks.map(extractBlockPlainText).filter(Boolean).join(' ');
  const snapshot = {
    id: row.id,
    title: compactText(row.title, 160),
    slug: row.slug,
    status: row.status || 'draft',
    portfolio_role: row.portfolio_role || 'owner',
    owner_name: row.owner_name || null,
    owner_username: row.owner_username || null,
    tagline: compactText(row.tagline, 260) || null,
    description: compactText(row.description, 1200) || null,
    type: compactText(row.project_type, 100) || null,
    technologies: asArray(row.technologies).map((tech) => compactText(tech, 80)).filter(Boolean).slice(0, 40),
    collaborators: asArray(row.collaborators).map((name) => compactText(name, 120)).filter(Boolean).slice(0, 20),
    has_github: Boolean(row.github_url),
    github_url: row.github_url || null,
    has_live_demo: Boolean(row.live_url),
    live_url: row.live_url || null,
    has_cover: Boolean(row.cover_image_url),
    view_count: Number(row.view_count || 0),
    is_featured: Boolean(row.is_featured),
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    block_count: blocks.length,
    block_content: compactText(blockText, MAX_BLOCK_TEXT_CHARS) || null,
  };
  snapshot.evidence_score = evidenceScoreForProject(snapshot);
  return snapshot;
};

const buildDerivedInsights = (user, projects) => {
  const published = projects.filter((project) => project.status === 'published');
  const visibleProjects = published.length ? published : projects;
  const technologies = topEntries(countBy(projects.flatMap((project) => project.technologies || [])), 16);
  const projectTypes = topEntries(countBy(projects.map((project) => project.type).filter(Boolean)), 10);
  const gaps = [];

  if (!user.headline) gaps.push('Profile headline is missing.');
  if (!user.bio || compactText(user.bio, 10000).length < 80) gaps.push('Bio is missing or too short to explain direction and motivation.');
  if (!asArray(user.skills).length) gaps.push('No profile skills are listed.');
  if (!user.github_url) gaps.push('GitHub link is missing.');
  if (!user.linkedin_url) gaps.push('LinkedIn link is missing.');
  if (!published.length) gaps.push('No projects are currently published on the public portfolio.');

  const thinProjects = projects
    .filter((project) => !project.description && !project.block_content)
    .slice(0, 5)
    .map((project) => project.title);
  if (thinProjects.length) gaps.push(`Projects without written evidence: ${thinProjects.join(', ')}.`);

  const noProofLinks = visibleProjects
    .filter((project) => !project.has_github && !project.has_live_demo)
    .slice(0, 5)
    .map((project) => project.title);
  if (noProofLinks.length) gaps.push(`Projects without GitHub or demo links: ${noProofLinks.join(', ')}.`);

  return {
    project_count: projects.length,
    published_project_count: published.length,
    draft_project_count: projects.filter((project) => project.status !== 'published').length,
    featured_projects: projects.filter((project) => project.is_featured).map((project) => project.title).slice(0, 8),
    strongest_projects: [...projects]
      .sort((a, b) => b.evidence_score - a.evidence_score || Number(b.view_count || 0) - Number(a.view_count || 0))
      .slice(0, 8)
      .map((project) => ({ title: project.title, evidence_score: project.evidence_score, status: project.status })),
    top_technologies: technologies,
    project_types: projectTypes,
    profile_gaps: gaps,
  };
};

const buildPortfolioAiContext = async (userId) => {
  const userResult = await query(
    `SELECT u.id, u.full_name, u.username, u.headline, u.bio, u.location, u.website,
            u.linkedin_url, u.github_url, u.resume_url, u.skills, u.created_at,
            COALESCE(ps.is_public, true) AS is_public,
            COALESCE(ps.show_skills, true) AS show_skills,
            COALESCE(ps.show_dates, true) AS show_dates,
            COALESCE(ps.show_project_type, true) AS show_project_type,
            ps.seo_title, ps.seo_description
       FROM users u
       LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
       WHERE u.id = $1`,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  const projectResult = await query(
    `SELECT p.*,
            CASE WHEN p.user_id = $1 THEN 'owner' ELSE 'collaborator' END AS portfolio_role,
            owner.full_name AS owner_name,
            owner.username AS owner_username,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', b.id,
              'type', b.type,
              'content', b.content,
              'sort_order', b.sort_order
            ) ORDER BY b.sort_order) FILTER (WHERE b.id IS NOT NULL), '[]'::jsonb) AS blocks
       FROM projects p
       JOIN users owner ON owner.id = p.user_id
       LEFT JOIN blocks b ON b.project_id = p.id
       WHERE p.user_id = $1
          OR p.id IN (
            SELECT project_id FROM project_collaborators
            WHERE user_id = $1 AND status = 'accepted'
          )
       GROUP BY p.id, owner.full_name, owner.username
       ORDER BY
          CASE WHEN p.user_id = $1 THEN 0 ELSE 1 END,
          p.is_featured DESC,
          p.sort_order ASC,
          p.created_at DESC
       LIMIT ${MAX_PROJECTS}`,
    [userId]
  );

  const projects = projectResult.rows.map(buildProjectSnapshot);
  const cleanUser = {
    id: user.id,
    name: compactText(user.full_name, 160),
    first_name: compactText(String(user.full_name || '').split(' ')[0], 80) || compactText(user.full_name, 80),
    username: user.username,
    headline: compactText(user.headline, 320) || null,
    bio: compactText(user.bio, 2500) || null,
    location: compactText(user.location, 200) || null,
    website: user.website || null,
    github_url: user.github_url || null,
    linkedin_url: user.linkedin_url || null,
    resume_url: user.resume_url || null,
    skills: asArray(user.skills).map((skill) => compactText(skill, 80)).filter(Boolean).slice(0, 80),
    portfolio_visibility: user.is_public ? 'public' : 'private',
    public_settings: {
      show_skills: Boolean(user.show_skills),
      show_dates: Boolean(user.show_dates),
      show_project_type: Boolean(user.show_project_type),
      seo_title: compactText(user.seo_title, 220) || null,
      seo_description: compactText(user.seo_description, 600) || null,
    },
  };

  return {
    ...cleanUser,
    projects,
    derived: buildDerivedInsights(cleanUser, projects),
  };
};

module.exports = {
  buildDerivedInsights,
  buildPortfolioAiContext,
  buildProjectSnapshot,
  compactText,
  extractBlockPlainText,
};
