// Cache invalidation for content whose owner is not always the caller.
//
// The public caches are keyed by the OWNER (`public:portfolio:{username}`,
// `public:project:{username}:{slug}`, `public:team:{slug}`), but several routes let
// someone other than the owner change that content — collaborators edit projects
// they do not own, and a collaborator can remove themselves. Invalidating with the
// caller's username would leave the owner's page stale, so these helpers resolve
// the owner from the data instead.
//
// Extracted from routes/projects.js so routes/collaborators.js and routes/teams.js
// can share the same logic.

const { query } = require('../config/database');
const { invalidatePublicUser, invalidateTeam } = require('./cache');

// A project can appear on a team's page (routes/teams.js selects project rows into
// the cached team body), so any project mutation must also invalidate every team
// page the project appears on, not just the owner's portfolio/project cache.
//
// For DELETE, team_projects rows are removed by ON DELETE CASCADE the moment the
// project row is deleted, so callers on that path must call this BEFORE deleting.
// `executor` defaults to the pooled `query`, but callers that already hold a
// transaction client (e.g. blocks/sync, after COMMIT but before release) should
// pass `client.query.bind(client)` so this reuses that connection instead of
// checking out a second one from the same pool.
const findAffectedTeamSlugs = async (projectId, executor = query) => {
  try {
    const teams = await executor(
      `SELECT t.slug FROM team_projects tp JOIN teams t ON t.id = tp.team_id WHERE tp.project_id = $1`,
      [projectId]
    );
    return teams.rows.map((row) => row.slug);
  } catch {
    return [];
  }
};

// Cache failures must never fail a write, so every branch here is swallowed.
const invalidateProjectCaches = async (ownerUsername, teamSlugs = []) => {
  await invalidatePublicUser(ownerUsername).catch(() => {});
  await Promise.all(teamSlugs.map((slug) => invalidateTeam(slug).catch(() => {})));
};

// For callers that hold only a project id and cannot name the owner — the
// collaborator join/remove routes, where req.user is the collaborator rather than
// the project owner. A missing owner degrades to the global pattern inside
// invalidatePublicUser rather than skipping invalidation entirely.
const invalidateForProjectId = async (projectId) => {
  try {
    const owner = await query(
      'SELECT u.username FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1',
      [projectId]
    );
    const teamSlugs = await findAffectedTeamSlugs(projectId);
    await invalidateProjectCaches(owner.rows[0]?.username, teamSlugs);
  } catch {
    /* cache failures must never fail a write */
  }
};

// Nearly every column a profile update writes (full_name, headline, bio, links,
// skills) is part of the cached public portfolio body. The username can change on
// that same route while the cache is keyed by username, so a rename has to clear
// the old key as well — otherwise the renamed-away name keeps serving the old
// portfolio until the TTL expires, even though the database no longer resolves it.
const invalidateForProfileUpdate = async (previousUsername, nextUsername) => {
  await invalidatePublicUser(previousUsername).catch(() => {});
  if (nextUsername && nextUsername !== previousUsername) {
    await invalidatePublicUser(nextUsername).catch(() => {});
  }
};

module.exports = {
  findAffectedTeamSlugs,
  invalidateProjectCaches,
  invalidateForProjectId,
  invalidateForProfileUpdate,
};
