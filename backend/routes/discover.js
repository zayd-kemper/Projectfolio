// backend/routes/discover.js
const express = require('express');
const { query } = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { createJob } = require('../jobs/service');

const router = express.Router();
const PAGE_SIZE = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const POST_TYPES = ['update', 'feedback_request', 'question', 'launch', 'resource', 'open_to_collab'];
const CONTEXTS = ['show', 'ask', 'feedback', 'launch', 'resource', 'collab', 'hiring', 'research', 'build_log'];
const FEED_MODES = ['recommended', 'latest', 'trending', 'for_you', 'recent', 'new', 'liked', 'following', 'launches', 'questions', 'feedback', 'saved'];
const EVENT_TYPES = [
  'feed_impression', 'post_card_impression', 'post_click', 'project_click', 'open_comments',
  'comment_created', 'like_toggled', 'follow_from_discover', 'save_post', 'share_copy',
  'open_create_composer', 'publish_success', 'dismiss_composer', 'hide_post', 'report_post',
];
const REPORT_REASONS = ['spam', 'abuse', 'misleading', 'unsafe', 'off_topic', 'other'];

const discoverPostSchema = {
  project_id: s.uuid({ allowNull: true }),
  title: s.string({ required: true, min: 1, max: 160 }),
  body: s.string({ max: 4000 }),
  post_type: s.enum(POST_TYPES),
  context: s.enum(CONTEXTS),
  media_ids: s.array(s.uuid(), { max: 8 }),
  external_url: s.url({ max: 2048 }),
  looking_for: s.array(s.string({ max: 60 }), { max: 8 }),
  metadata: s.object({ maxBytes: 30_000 }),
  visibility: s.enum(['public', 'followers']),
  allow_comments: s.boolean(),
  comment_visibility: s.enum(['public', 'followers', 'connections']),
  status: s.enum(['draft', 'published']),
};

const discoverPostUpdateSchema = {
  ...discoverPostSchema,
  title: s.string({ min: 1, max: 160 }),
};

const discoverCommentSchema = {
  body: s.string({ required: true, min: 1, max: 1500 }),
  parent_comment_id: s.uuid({ allowNull: true }),
};

const discoverCommentUpdateSchema = {
  body: s.string({ required: true, min: 1, max: 1500 }),
};

const discoverEventSchema = {
  event_type: s.enum(EVENT_TYPES, { required: true }),
  post_id: s.uuid({ allowNull: true }),
  project_id: s.uuid({ allowNull: true }),
  metadata: s.object({ maxBytes: 10_000 }),
};

const reportSchema = {
  reason: s.enum(REPORT_REASONS, { required: true }),
  details: s.string({ max: 1000 }),
};

const hideSchema = {
  reason: s.string({ max: 80 }),
};

const interestSchema = {
  contexts: s.array(s.enum(CONTEXTS), { max: 12 }),
  technologies: s.array(s.string({ max: 60 }), { max: 40 }),
  goals: s.array(s.string({ max: 80 }), { max: 12 }),
};

const postAnalyticsWindowSchema = {
  window: s.enum(['7d', '30d', 'all']),
};

const titleForType = {
  update: 'Project update',
  feedback_request: 'Feedback request',
  question: 'Question',
  launch: 'Launch',
  resource: 'Resource',
  open_to_collab: 'Open to collaborate',
};

const contextForType = {
  update: 'show',
  feedback_request: 'feedback',
  question: 'ask',
  launch: 'launch',
  resource: 'resource',
  open_to_collab: 'collab',
};

const parseCursor = (value) => {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded?.id || decoded.score === undefined || !decoded.created_at) return null;
    return decoded;
  } catch {
    return null;
  }
};

const makeCursor = (row) => row
  ? Buffer.from(JSON.stringify({ score: Number(row.sort_score) || 0, created_at: row.created_at, id: row.id })).toString('base64url')
  : null;

const normalizeFeedMode = (mode) => {
  const value = String(mode || '').toLowerCase();
  if (value === 'for_you' || value === 'recommended' || value === 'personalized') return 'recommended';
  if (value === 'recent' || value === 'new' || value === 'latest') return 'latest';
  if (value === 'popular' || value === 'trending') return 'trending';
  return FEED_MODES.includes(value) ? value : 'recommended';
};

const safeLinkPreview = (externalUrl) => {
  if (!externalUrl) return null;
  try {
    const url = new URL(externalUrl);
    return {
      url: url.toString(),
      domain: url.hostname.replace(/^www\./, ''),
      title: url.hostname.replace(/^www\./, ''),
    };
  } catch {
    return null;
  }
};

const extractMentions = (text) => {
  const mentions = new Set();
  for (const match of String(text || '').matchAll(/@([a-zA-Z0-9_-]{3,50})/g)) mentions.add(match[1].toLowerCase());
  return [...mentions].slice(0, 20);
};

const jsonArray = (value) => Array.isArray(value) ? value : [];

const calculateSpamScore = ({ body, external_url, project_id, media_ids }) => {
  const text = String(body || '');
  const linkCount = (text.match(/https?:\/\//g) || []).length + (external_url ? 1 : 0);
  let score = 0;
  if (!project_id && !external_url && !jsonArray(media_ids).length && text.length < 20) score += 0.35;
  if (linkCount > 3) score += 0.35;
  if (/(upvote|like this|follow me|engagement)/i.test(text)) score += 0.25;
  return Math.min(1, score);
};

const queueDiscoverEvent = async (req, input = {}) => {
  const payload = {
    userId: req.user?.id || null,
    postId: input.post_id || null,
    projectId: input.project_id || null,
    eventType: input.event_type,
    metadata: input.metadata || {},
  };
  return createJob({
    userId: req.user?.id || null,
    type: 'discover:event',
    input: payload,
    idempotencyKey: input.idempotencyKey || null,
  }).catch(() => {});
};

const attachMedia = async ({ postId, userId, mediaIds }) => {
  const ids = jsonArray(mediaIds).slice(0, 8);
  if (!ids.length) return;
  const owned = await query(
    'SELECT id FROM media WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, ids]
  );
  const ownedIds = new Set(owned.rows.map((row) => row.id));
  const rows = ids.filter((id) => ownedIds.has(id)).map((id, index) => ({ id, sort_order: index }));
  if (!rows.length) return;
  await query(
    `INSERT INTO post_media(post_id, media_id, sort_order)
     SELECT $1, input.media_id, input.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS input(media_id uuid, sort_order integer)
     ON CONFLICT(post_id, media_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
    [postId, JSON.stringify(rows.map((row) => ({ media_id: row.id, sort_order: row.sort_order })))]
  );
};

const syncMentions = async ({ postId, text }) => {
  const usernames = extractMentions(text);
  await query('DELETE FROM post_mentions WHERE post_id = $1', [postId]);
  if (!usernames.length) return;
  await query(
    `INSERT INTO post_mentions(post_id, mentioned_user_id)
     SELECT $1, u.id FROM users u WHERE lower(u.username) = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [postId, usernames]
  );
};

const addMentions = async ({ postId, text }) => {
  const usernames = extractMentions(text);
  if (!usernames.length) return;
  await query(
    `INSERT INTO post_mentions(post_id, mentioned_user_id)
     SELECT $1, u.id FROM users u WHERE lower(u.username) = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [postId, usernames]
  );
};

const insertComment = async ({ postId, userId, body, parentCommentId = null }) => {
  const post = await query(
    `SELECT dp.id, dp.user_id, dp.allow_comments, dp.locked_at, dp.comment_visibility
     FROM discover_posts dp
     LEFT JOIN portfolio_settings settings ON settings.user_id = dp.user_id
     WHERE dp.id = $1 AND ${canViewPostSql('$2')}`,
    [postId, userId]
  );
  if (!post.rows[0]) return { status: 404, error: 'Post not found.' };
  if (!post.rows[0].allow_comments || post.rows[0].locked_at) {
    return { status: 403, error: 'Comments are closed on this post.' };
  }
  if (parentCommentId) {
    const parent = await query(
      'SELECT id FROM post_comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL',
      [parentCommentId, postId]
    );
    if (!parent.rows[0]) return { status: 404, error: 'Parent comment not found.' };
  }

  const result = await query(
    `INSERT INTO post_comments (post_id, user_id, body, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [postId, userId, body.trim(), parentCommentId || null]
  );
  await query(
    `INSERT INTO post_stats (post_id, comment_count, trending_score) VALUES ($1, 1, 2)
     ON CONFLICT (post_id) DO UPDATE SET comment_count = post_stats.comment_count + 1,
       trending_score = post_stats.like_count * 3 + (post_stats.comment_count + 1) * 2 + post_stats.save_count * 4,
       updated_at = NOW()`,
    [postId]
  );
  await addMentions({ postId, text: body });
  const u = await query(`SELECT id, full_name, username, avatar_url FROM users WHERE id = $1`, [userId]);
  return {
    status: 201,
    comment: {
      ...result.rows[0],
      helpful_count: 0,
      voted_by_viewer: false,
      author_id: u.rows[0].id,
      author_name: u.rows[0].full_name,
      author_username: u.rows[0].username,
      author_avatar: u.rows[0].avatar_url,
    },
  };
};

const canViewPostSql = (viewerParam = '$1') => `
  COALESCE(settings.is_public, true) = true
  AND dp.status = 'published'
  AND dp.deleted_at IS NULL
  AND (
    dp.visibility = 'public'
    OR (${viewerParam}::uuid IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_follows vf WHERE vf.follower_id = ${viewerParam}::uuid AND vf.following_id = dp.user_id
    ))
    OR dp.user_id = ${viewerParam}::uuid
  )
  AND (${viewerParam}::uuid IS NULL OR NOT EXISTS (
    SELECT 1 FROM post_hides ph WHERE ph.post_id = dp.id AND ph.user_id = ${viewerParam}::uuid
  ))
  AND (${viewerParam}::uuid IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_mutes um WHERE um.muter_id = ${viewerParam}::uuid AND um.muted_user_id = dp.user_id
  ))
`;

const postSelectSql = (scoreSql) => `
  SELECT dp.id, dp.user_id AS author_id, dp.project_id, dp.title, dp.body, dp.created_at, dp.updated_at,
         dp.post_type, dp.context, dp.visibility, dp.allow_comments, dp.comment_visibility, dp.external_url,
         dp.metadata, dp.status, dp.edited_at, dp.published_at, dp.locked_at,
         u.full_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar,
         u.headline AS author_headline, u.skills AS author_skills,
         p.title AS project_title, p.slug AS project_slug, p.tagline AS project_tagline,
         p.cover_image_url AS project_cover, p.technologies AS project_technologies, p.project_type,
         p.github_url AS project_github_url, p.live_url AS project_live_url, p.is_featured AS project_is_featured,
         settings.accent_color,
         COALESCE(stats.like_count, 0)::int AS like_count,
         COALESCE(stats.comment_count, 0)::int AS comment_count,
         COALESCE(stats.save_count, 0)::int AS save_count,
         COALESCE(stats.share_count, 0)::int AS share_count,
         COALESCE(stats.project_click_count, 0)::int AS project_click_count,
         COALESCE(stats.impression_count, 0)::int AS impression_count,
         COALESCE(stats.helpful_count, 0)::int AS helpful_count,
         EXISTS(SELECT 1 FROM post_likes vl WHERE vl.post_id = dp.id AND vl.user_id = $1::uuid) AS liked_by_viewer,
         EXISTS(SELECT 1 FROM post_saves vs WHERE vs.post_id = dp.id AND vs.user_id = $1::uuid) AS saved_by_viewer,
         EXISTS(SELECT 1 FROM user_follows af WHERE af.follower_id = $1::uuid AND af.following_id = dp.user_id) AS followed_author,
         COALESCE((
           SELECT json_agg(media_item ORDER BY media_item.sort_order)
           FROM (
             SELECT m.id, m.url, m.thumbnail_url, m.filename, m.file_type, m.width, m.height, m.duration, pm.sort_order
             FROM post_media pm JOIN media m ON m.id = pm.media_id
             WHERE pm.post_id = dp.id ORDER BY pm.sort_order LIMIT 8
           ) media_item
         ), '[]'::json) AS media,
         COALESCE((
           SELECT json_agg(comment_item ORDER BY comment_item.is_answer DESC, comment_item.helpful_count DESC, comment_item.created_at ASC)
           FROM (
             SELECT pc.id, pc.body, pc.created_at, pc.parent_comment_id, pc.is_answer, pc.helpful_count,
                    cu.full_name AS author_name, cu.username AS author_username, cu.avatar_url AS author_avatar
             FROM post_comments pc JOIN users cu ON cu.id = pc.user_id
             WHERE pc.post_id = dp.id AND pc.deleted_at IS NULL AND pc.parent_comment_id IS NULL
             ORDER BY pc.is_answer DESC, pc.helpful_count DESC, pc.created_at ASC LIMIT 2
           ) comment_item
         ), '[]'::json) AS comment_preview,
         ${scoreSql}::double precision AS sort_score
  FROM discover_posts dp
  JOIN users u ON u.id = dp.user_id
  LEFT JOIN projects p ON p.id = dp.project_id
  LEFT JOIN portfolio_settings settings ON settings.user_id = u.id
  LEFT JOIN post_stats stats ON stats.post_id = dp.id
`;

const viewerInterestContextsSql = "COALESCE((SELECT dui.contexts FROM discover_user_interests dui WHERE dui.user_id = $1::uuid), '{}'::text[])";
const viewerInterestTechnologiesSql = "COALESCE((SELECT dui.technologies FROM discover_user_interests dui WHERE dui.user_id = $1::uuid), '{}'::text[])";
const viewerInterestGoalsSql = "COALESCE((SELECT dui.goals FROM discover_user_interests dui WHERE dui.user_id = $1::uuid), '{}'::text[])";
const viewerSkillsSql = "COALESCE((SELECT vu.skills FROM users vu WHERE vu.id = $1::uuid), '{}'::text[])";
const viewerProjectTechnologiesSql = `COALESCE((
  SELECT array_agg(DISTINCT viewer_project_tech.tech)
  FROM projects viewer_project
  CROSS JOIN LATERAL unnest(COALESCE(viewer_project.technologies, '{}'::text[])) AS viewer_project_tech(tech)
  WHERE viewer_project.user_id = $1::uuid AND viewer_project.status = 'published'
), '{}'::text[])`;
const viewerProjectTypesSql = `COALESCE((
  SELECT array_agg(DISTINCT lower(viewer_project.project_type))
  FROM projects viewer_project
  WHERE viewer_project.user_id = $1::uuid
    AND viewer_project.status = 'published'
    AND viewer_project.project_type IS NOT NULL
    AND viewer_project.project_type != ''
), '{}'::text[])`;
const viewerTechnologiesSql = `(${viewerSkillsSql} || ${viewerInterestTechnologiesSql} || ${viewerProjectTechnologiesSql})`;
const viewerPortfolioKeywordsSql = `(${viewerTechnologiesSql} || ${viewerProjectTypesSql} || ${viewerInterestGoalsSql})`;
const interactionEventTypesSql = "('post_click', 'project_click', 'open_comments', 'comment_created', 'like_toggled', 'save_post', 'share_copy')";
const viewerInteractionContextsSql = `COALESCE((
  SELECT array_agg(DISTINCT source.context)
  FROM (
    SELECT idp.context
    FROM post_likes il
    JOIN discover_posts idp ON idp.id = il.post_id
    WHERE il.user_id = $1::uuid AND il.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.context
    FROM post_saves isv
    JOIN discover_posts idp ON idp.id = isv.post_id
    WHERE isv.user_id = $1::uuid AND isv.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.context
    FROM post_comments ic
    JOIN discover_posts idp ON idp.id = ic.post_id
    WHERE ic.user_id = $1::uuid AND ic.deleted_at IS NULL AND ic.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.context
    FROM discover_events ie
    JOIN discover_posts idp ON idp.id = ie.post_id
    WHERE ie.user_id = $1::uuid
      AND ie.event_type IN ${interactionEventTypesSql}
      AND ie.created_at > NOW() - INTERVAL '180 days'
  ) source
  WHERE source.context IS NOT NULL
), '{}'::text[])`;
const viewerInteractionPostTypesSql = `COALESCE((
  SELECT array_agg(DISTINCT source.post_type)
  FROM (
    SELECT idp.post_type
    FROM post_likes il
    JOIN discover_posts idp ON idp.id = il.post_id
    WHERE il.user_id = $1::uuid AND il.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.post_type
    FROM post_saves isv
    JOIN discover_posts idp ON idp.id = isv.post_id
    WHERE isv.user_id = $1::uuid AND isv.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.post_type
    FROM post_comments ic
    JOIN discover_posts idp ON idp.id = ic.post_id
    WHERE ic.user_id = $1::uuid AND ic.deleted_at IS NULL AND ic.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.post_type
    FROM discover_events ie
    JOIN discover_posts idp ON idp.id = ie.post_id
    WHERE ie.user_id = $1::uuid
      AND ie.event_type IN ${interactionEventTypesSql}
      AND ie.created_at > NOW() - INTERVAL '180 days'
  ) source
  WHERE source.post_type IS NOT NULL
), '{}'::text[])`;
const viewerInteractionAuthorsSql = `COALESCE((
  SELECT array_agg(DISTINCT source.user_id)
  FROM (
    SELECT idp.user_id
    FROM post_likes il
    JOIN discover_posts idp ON idp.id = il.post_id
    WHERE il.user_id = $1::uuid AND il.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.user_id
    FROM post_saves isv
    JOIN discover_posts idp ON idp.id = isv.post_id
    WHERE isv.user_id = $1::uuid AND isv.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.user_id
    FROM post_comments ic
    JOIN discover_posts idp ON idp.id = ic.post_id
    WHERE ic.user_id = $1::uuid AND ic.deleted_at IS NULL AND ic.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT idp.user_id
    FROM discover_events ie
    JOIN discover_posts idp ON idp.id = ie.post_id
    WHERE ie.user_id = $1::uuid
      AND ie.event_type IN ${interactionEventTypesSql}
      AND ie.created_at > NOW() - INTERVAL '180 days'
  ) source
), '{}'::uuid[])`;
const viewerInteractionTechnologiesSql = `COALESCE((
  SELECT array_agg(DISTINCT source_tech.tech)
  FROM (
    SELECT ip.technologies
    FROM post_likes il
    JOIN discover_posts idp ON idp.id = il.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE il.user_id = $1::uuid AND il.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.technologies
    FROM post_saves isv
    JOIN discover_posts idp ON idp.id = isv.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE isv.user_id = $1::uuid AND isv.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.technologies
    FROM post_comments ic
    JOIN discover_posts idp ON idp.id = ic.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE ic.user_id = $1::uuid AND ic.deleted_at IS NULL AND ic.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.technologies
    FROM discover_events ie
    JOIN discover_posts idp ON idp.id = ie.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE ie.user_id = $1::uuid
      AND ie.event_type IN ${interactionEventTypesSql}
      AND ie.created_at > NOW() - INTERVAL '180 days'
  ) source
  CROSS JOIN LATERAL unnest(COALESCE(source.technologies, '{}'::text[])) AS source_tech(tech)
), '{}'::text[])`;
const viewerInteractionProjectTypesSql = `COALESCE((
  SELECT array_agg(DISTINCT lower(source.project_type))
  FROM (
    SELECT ip.project_type
    FROM post_likes il
    JOIN discover_posts idp ON idp.id = il.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE il.user_id = $1::uuid AND il.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.project_type
    FROM post_saves isv
    JOIN discover_posts idp ON idp.id = isv.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE isv.user_id = $1::uuid AND isv.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.project_type
    FROM post_comments ic
    JOIN discover_posts idp ON idp.id = ic.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE ic.user_id = $1::uuid AND ic.deleted_at IS NULL AND ic.created_at > NOW() - INTERVAL '180 days'
    UNION ALL
    SELECT ip.project_type
    FROM discover_events ie
    JOIN discover_posts idp ON idp.id = ie.post_id
    JOIN projects ip ON ip.id = idp.project_id
    WHERE ie.user_id = $1::uuid
      AND ie.event_type IN ${interactionEventTypesSql}
      AND ie.created_at > NOW() - INTERVAL '180 days'
  ) source
  WHERE source.project_type IS NOT NULL AND source.project_type != ''
), '{}'::text[])`;

const postTechnologyOverlapSql = (technologyArraySql) => `COALESCE((
  SELECT COUNT(*)
  FROM unnest(COALESCE(p.technologies, '{}'::text[])) AS post_tech(tech)
  WHERE lower(post_tech.tech) IN (
    SELECT lower(viewer_tech.tech)
    FROM unnest(${technologyArraySql}) AS viewer_tech(tech)
  )
), 0)`;

const keywordMatchSql = (keywordArraySql) => `COALESCE((
  SELECT COUNT(*)
  FROM unnest(${keywordArraySql}) AS viewer_keyword(keyword)
  WHERE length(trim(viewer_keyword.keyword)) >= 2
    AND (
      lower(dp.title) LIKE '%' || lower(viewer_keyword.keyword) || '%'
      OR lower(COALESCE(dp.body, '')) LIKE '%' || lower(viewer_keyword.keyword) || '%'
      OR lower(concat_ws(' ', p.title, p.tagline, p.description, p.project_type)) LIKE '%' || lower(viewer_keyword.keyword) || '%'
    )
), 0)`;

const qualityScoreSql = `(
  LEAST(COALESCE(stats.save_count, 0), 30) * 2.4
  + LEAST(COALESCE(stats.comment_count, 0), 40) * 1.6
  + LEAST(COALESCE(stats.project_click_count, 0), 40) * 2.2
  + LEAST(COALESCE(stats.helpful_count, 0), 25) * 2.0
  + LEAST(COALESCE(stats.share_count, 0), 20) * 2.0
)`;
const freshnessScoreSql = "GREATEST(0, 21 - (EXTRACT(EPOCH FROM (NOW() - dp.created_at)) / 86400))";

const recommendationScoreSql = `(
  CASE WHEN $1::uuid IS NULL THEN
    (${qualityScoreSql}
      + COALESCE(stats.trending_score, 0) * 0.65
      + ${freshnessScoreSql})
  ELSE
    (
      CASE WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1::uuid AND f.following_id = dp.user_id) THEN 32 ELSE 0 END
      + CASE WHEN dp.context = ANY(${viewerInterestContextsSql}) THEN 30 ELSE 0 END
      + CASE WHEN dp.context = ANY(${viewerInteractionContextsSql}) THEN 22 ELSE 0 END
      + CASE WHEN dp.post_type = ANY(${viewerInteractionPostTypesSql}) THEN 11 ELSE 0 END
      + CASE WHEN dp.user_id = ANY(${viewerInteractionAuthorsSql}) THEN 14 ELSE 0 END
      + CASE WHEN p.project_type IS NOT NULL AND lower(p.project_type) = ANY(${viewerProjectTypesSql}) THEN 12 ELSE 0 END
      + CASE WHEN p.project_type IS NOT NULL AND lower(p.project_type) = ANY(${viewerInteractionProjectTypesSql}) THEN 10 ELSE 0 END
      + LEAST(${postTechnologyOverlapSql(viewerTechnologiesSql)}, 5) * 12
      + LEAST(${postTechnologyOverlapSql(viewerInteractionTechnologiesSql)}, 5) * 13
      + LEAST(${keywordMatchSql(viewerInterestGoalsSql)}, 4) * 8
      + LEAST(${keywordMatchSql(viewerPortfolioKeywordsSql)}, 6) * 3
      + CASE WHEN EXISTS(SELECT 1 FROM post_likes own_like WHERE own_like.user_id = $1::uuid AND own_like.post_id = dp.id) THEN 18 ELSE 0 END
      + CASE WHEN EXISTS(SELECT 1 FROM post_saves own_save WHERE own_save.user_id = $1::uuid AND own_save.post_id = dp.id) THEN 18 ELSE 0 END
      + CASE WHEN EXISTS(SELECT 1 FROM post_comments own_comment WHERE own_comment.user_id = $1::uuid AND own_comment.post_id = dp.id AND own_comment.deleted_at IS NULL) THEN 16 ELSE 0 END
      + ${qualityScoreSql}
      + CASE WHEN dp.project_id IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN EXISTS(SELECT 1 FROM post_media pm WHERE pm.post_id = dp.id) THEN 3 ELSE 0 END
      + CASE WHEN dp.external_url IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN p.cover_image_url IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN p.github_url IS NOT NULL OR p.live_url IS NOT NULL THEN 3 ELSE 0 END
      + ${freshnessScoreSql}
      - CASE WHEN dp.user_id = $1::uuid THEN 8 ELSE 0 END
      - LEAST(COALESCE((
          SELECT COUNT(*)
          FROM discover_events seen
          WHERE seen.user_id = $1::uuid
            AND seen.post_id = dp.id
            AND seen.event_type = 'post_card_impression'
            AND seen.created_at > NOW() - INTERVAL '14 days'
        ), 0), 5) * 1.5
    )
  END
)`;

const scoreExpression = (mode) => {
  if (mode === 'liked') return 'COALESCE(stats.like_count, 0)';
  if (mode === 'trending') {
    return `(COALESCE(stats.trending_score, 0)
      + COALESCE(stats.save_count, 0) * 4
      + COALESCE(stats.project_click_count, 0) * 3
      + COALESCE(stats.helpful_count, 0) * 2
      + ${freshnessScoreSql}
      + EXTRACT(EPOCH FROM dp.created_at) / 100000000)`;
  }
  if (mode === 'recommended' || mode === 'for_you') return recommendationScoreSql;
  return 'EXTRACT(EPOCH FROM dp.created_at)';
};

const fetchFeed = async ({ req, mode, category, postType, context, cursor, limit = PAGE_SIZE }) => {
  const values = [req.user?.id || null];
  const where = [canViewPostSql('$1')];
  const normalizedMode = normalizeFeedMode(mode);

  if (category) {
    values.push(category);
    where.push(`(p.project_type = $${values.length} OR dp.context = $${values.length} OR dp.post_type = $${values.length})`);
  }
  if (postType && POST_TYPES.includes(postType)) {
    values.push(postType);
    where.push(`dp.post_type = $${values.length}`);
  }
  if (context && CONTEXTS.includes(context)) {
    values.push(context);
    where.push(`dp.context = $${values.length}`);
  }
  if (normalizedMode === 'following') {
    where.push(`$1::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM user_follows f WHERE f.follower_id = $1::uuid AND f.following_id = dp.user_id)`);
  }
  if (normalizedMode === 'saved') {
    where.push(`$1::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM post_saves s WHERE s.user_id = $1::uuid AND s.post_id = dp.id)`);
  }
  if (normalizedMode === 'launches') where.push(`dp.post_type = 'launch'`);
  if (normalizedMode === 'questions') where.push(`dp.post_type = 'question'`);
  if (normalizedMode === 'feedback') where.push(`dp.post_type = 'feedback_request'`);

  const scoreSql = scoreExpression(normalizedMode);
  if (cursor) {
    values.push(Number(cursor.score) || 0, cursor.created_at, cursor.id);
    const base = values.length - 2;
    where.push(`(${scoreSql}, dp.created_at, dp.id) < ($${base}::double precision, $${base + 1}::timestamptz, $${base + 2}::uuid)`);
  }

  values.push(limit + 1);
  const result = await query(
    `${postSelectSql(scoreSql)}
     WHERE ${where.join('\n       AND ')}
     ORDER BY sort_score DESC, dp.created_at DESC, dp.id DESC
     LIMIT $${values.length}`,
    values
  );

  const hasMore = result.rows.length > limit;
  const posts = result.rows.slice(0, limit);
  const last = posts.at(-1);
  posts.forEach((post) => { delete post.sort_score; });
  return { posts, hasMore, nextCursor: hasMore ? makeCursor(last) : null };
};

const loadPost = async (postId, viewerId, options = {}) => {
  const visibilitySql = options.includeOwnDraft
    ? `(${canViewPostSql('$1')} OR ($1::uuid IS NOT NULL AND dp.user_id = $1::uuid AND dp.status = 'draft' AND dp.deleted_at IS NULL))`
    : canViewPostSql('$1');
  const result = await query(
    `${postSelectSql('EXTRACT(EPOCH FROM dp.created_at)')}
     WHERE dp.id = $2 AND ${visibilitySql}
     LIMIT 1`,
    [viewerId || null, postId]
  );
  if (!result.rows[0]) return null;
  delete result.rows[0].sort_score;
  return result.rows[0];
};

router.get('/feed', optionalAuth, async (req, res, next) => {
  const mode = normalizeFeedMode(req.query.mode || req.query.tab || req.query.filter || 'recommended');
  if ((mode === 'following' || req.query.filter === 'following') && !req.user?.id) {
    return res.json({ posts: [], total: 0, has_more: false, next_cursor: null });
  }
  if (mode === 'saved' && !req.user?.id) {
    return res.json({ posts: [], total: 0, has_more: false, next_cursor: null });
  }
  const cursor = req.query.cursor ? parseCursor(req.query.cursor) : null;
  if (req.query.cursor && !cursor) return res.status(400).json({ error: 'Invalid cursor.' });
  try {
    const feed = await fetchFeed({
      req,
      mode,
      category: req.query.type || '',
      postType: req.query.post_type || '',
      context: req.query.context || '',
      cursor,
    });
    await queueDiscoverEvent(req, { event_type: 'feed_impression', metadata: { mode, type: req.query.type || null } });
    return res.json({ posts: feed.posts, total: null, page: null, has_more: feed.hasMore, next_cursor: feed.nextCursor });
  } catch (error) {
    return next(error);
  }
});

router.get('/posts/:id', optionalAuth, async (req, res, next) => {
  try {
    const post = await loadPost(req.params.id, req.user?.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    await queueDiscoverEvent(req, { event_type: 'post_click', post_id: post.id, project_id: post.project_id });
    return res.json({ post });
  } catch (error) {
    return next(error);
  }
});

router.post('/posts', requireAuth, validateSchema({ body: discoverPostSchema }), userQuota('discover.posts.create', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const body = req.body || {};
  const postType = body.post_type || 'update';
  const context = body.context || contextForType[postType] || 'show';
  const status = body.status || 'published';
  const metadata = {
    ...(body.metadata || {}),
    type_label: titleForType[postType] || 'Post',
    looking_for: jsonArray(body.looking_for).slice(0, 8),
  };
  const externalUrl = body.external_url || null;
  const linkPreview = safeLinkPreview(externalUrl);
  if (linkPreview) metadata.link_preview = linkPreview;

  if (postType === 'launch' && !body.project_id) return res.status(400).json({ error: 'Launch posts require a published project.' });
  if (postType === 'resource' && !externalUrl) return res.status(400).json({ error: 'Resource posts require a URL.' });

  const spamScore = calculateSpamScore({ ...body, external_url: externalUrl });
  if (spamScore >= 0.8) return res.status(422).json({ error: 'This post looks too promotional or low-signal. Add project context before publishing.' });

  try {
    if (body.project_id) {
      const pCheck = await query(
        `SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND status = 'published'`,
        [body.project_id, req.user.id]
      );
      if (!pCheck.rows.length) return res.status(403).json({ error: 'Project not found or not published.' });
    }
    if (externalUrl) {
      const duplicate = await query(
        `SELECT id FROM discover_posts
         WHERE user_id = $1 AND external_url = $2 AND created_at > NOW() - INTERVAL '24 hours'
           AND deleted_at IS NULL AND status != 'draft'
         LIMIT 1`,
        [req.user.id, externalUrl]
      );
      if (duplicate.rows[0]) return res.status(409).json({ error: 'You already shared this link recently.' });
    }

    const result = await query(
      `INSERT INTO discover_posts
        (user_id, project_id, title, body, post_type, context, visibility, allow_comments,
         comment_visibility, status, external_url, metadata, spam_score, published_at)
       VALUES ($1, $2::uuid, $3, $4, $5::varchar, $6::varchar, $7::varchar, $8,
         $9::varchar, $10::varchar, $11, $12::jsonb, $13::double precision,
         CASE WHEN $10::text = 'published' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [
        req.user.id,
        body.project_id || null,
        body.title.trim(),
        body.body?.trim() || null,
        postType,
        context,
        body.visibility || 'public',
        body.allow_comments !== false,
        body.comment_visibility || 'public',
        status,
        externalUrl,
        JSON.stringify(metadata),
        spamScore,
      ]
    );
    const postId = result.rows[0].id;
    await attachMedia({ postId, userId: req.user.id, mediaIds: body.media_ids });
    await syncMentions({ postId, text: `${body.title} ${body.body || ''}` });
    await query('INSERT INTO post_stats(post_id) VALUES ($1) ON CONFLICT DO NOTHING', [postId]);
    if (externalUrl) {
      await createJob({
        userId: req.user.id,
        type: 'discover:link-preview',
        input: { postId, url: externalUrl },
        idempotencyKey: `discover-link-preview:${postId}`,
      }).catch(() => {});
    }
    await queueDiscoverEvent(req, { event_type: 'publish_success', post_id: postId, project_id: body.project_id || null, metadata: { post_type: postType, context } });
    const post = await loadPost(postId, req.user.id, { includeOwnDraft: true });
    res.status(201).json({ post });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

router.patch('/posts/:id', requireAuth, validateSchema({ body: discoverPostUpdateSchema }), userQuota('discover.posts.update', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  const body = req.body || {};
  const nextMetadata = {
    ...(body.metadata || {}),
    looking_for: jsonArray(body.looking_for).slice(0, 8),
  };
  if (body.external_url) nextMetadata.link_preview = safeLinkPreview(body.external_url);
  try {
    const existing = await query('SELECT id, user_id FROM discover_posts WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Post not found.' });
    if (existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Only the author can edit this post.' });
    await query(
      `UPDATE discover_posts SET
        title = COALESCE($1, title),
        body = COALESCE($2, body),
        post_type = COALESCE($3, post_type),
        context = COALESCE($4, context),
        external_url = COALESCE($5, external_url),
        metadata = CASE WHEN $6::jsonb = '{}'::jsonb THEN metadata ELSE metadata || $6::jsonb END,
        allow_comments = COALESCE($7, allow_comments),
        comment_visibility = COALESCE($8, comment_visibility),
        visibility = COALESCE($9, visibility),
        status = COALESCE($10::varchar, status),
        published_at = CASE WHEN $10::text = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END,
        edited_at = NOW(),
        updated_at = NOW()
       WHERE id = $11`,
      [
        body.title || null,
        body.body ?? null,
        body.post_type || null,
        body.context || null,
        body.external_url || null,
        JSON.stringify(nextMetadata),
        body.allow_comments,
        body.comment_visibility || null,
        body.visibility || null,
        body.status || null,
        req.params.id,
      ]
    );
    if (body.media_ids) {
      await query('DELETE FROM post_media WHERE post_id = $1', [req.params.id]);
      await attachMedia({ postId: req.params.id, userId: req.user.id, mediaIds: body.media_ids });
    }
    await syncMentions({ postId: req.params.id, text: `${body.title || ''} ${body.body || ''}` });
    const post = await loadPost(req.params.id, req.user.id, { includeOwnDraft: true });
    res.json({ post, message: 'Post updated.' });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

router.delete('/posts/:id', requireAuth, userQuota('discover.posts.delete', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const result = await query(
      `UPDATE discover_posts SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(403).json({ error: 'Not found or not yours.' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

router.get('/drafts', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `${postSelectSql('EXTRACT(EPOCH FROM dp.updated_at)')}
       WHERE dp.user_id = $1::uuid AND dp.status = 'draft' AND dp.deleted_at IS NULL
       ORDER BY dp.updated_at DESC, dp.id DESC LIMIT 20`,
      [req.user.id]
    );
    const drafts = result.rows.map((post) => {
      delete post.sort_score;
      return post;
    });
    return res.json({ drafts });
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/like', requireAuth, userQuota('discover.likes', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  try {
    const count = await query(
      `WITH inserted AS (
         INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1
       ), updated AS (
         UPDATE post_stats SET like_count = like_count + (SELECT COUNT(*) FROM inserted),
           trending_score = (like_count + (SELECT COUNT(*) FROM inserted)) * 3 + comment_count * 2 + save_count * 4,
           updated_at = NOW()
         WHERE post_id = $1 RETURNING like_count
       )
       SELECT COALESCE((SELECT like_count FROM updated), 0)::int AS like_count`,
      [req.params.id, req.user.id]
    );
    await queueDiscoverEvent(req, { event_type: 'like_toggled', post_id: req.params.id, metadata: { liked: true } });
    res.json({ liked: true, like_count: count.rows[0].like_count });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/posts/:id/like', requireAuth, userQuota('discover.likes', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  try {
    const count = await query(
      `WITH removed AS (DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2 RETURNING 1),
       updated AS (UPDATE post_stats SET like_count = GREATEST(0, like_count - (SELECT COUNT(*) FROM removed)),
         trending_score = GREATEST(0, like_count - (SELECT COUNT(*) FROM removed)) * 3 + comment_count * 2 + save_count * 4,
         updated_at = NOW()
         WHERE post_id = $1 RETURNING like_count)
       SELECT COALESCE((SELECT like_count FROM updated), 0)::int AS like_count`,
      [req.params.id, req.user.id]
    );
    await queueDiscoverEvent(req, { event_type: 'like_toggled', post_id: req.params.id, metadata: { liked: false } });
    res.json({ liked: false, like_count: count.rows[0].like_count });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/posts/:id/save', requireAuth, userQuota('discover.saves', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  try {
    const result = await query(
      `WITH inserted AS (
         INSERT INTO post_saves(post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1
       ), updated AS (
         UPDATE post_stats SET save_count = save_count + (SELECT COUNT(*) FROM inserted), updated_at = NOW()
         WHERE post_id = $1 RETURNING save_count
       )
       SELECT COALESCE((SELECT save_count FROM updated), 0)::int AS save_count`,
      [req.params.id, req.user.id]
    );
    await queueDiscoverEvent(req, { event_type: 'save_post', post_id: req.params.id });
    res.json({ saved: true, save_count: result.rows[0].save_count });
  } catch (err) { res.status(500).json({ error: 'Failed to save post.' }); }
});

router.delete('/posts/:id/save', requireAuth, userQuota('discover.saves', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  try {
    const result = await query(
      `WITH removed AS (
         DELETE FROM post_saves WHERE post_id = $1 AND user_id = $2 RETURNING 1
       ), updated AS (
         UPDATE post_stats SET save_count = GREATEST(0, save_count - (SELECT COUNT(*) FROM removed)), updated_at = NOW()
         WHERE post_id = $1 RETURNING save_count
       )
       SELECT COALESCE((SELECT save_count FROM updated), 0)::int AS save_count`,
      [req.params.id, req.user.id]
    );
    res.json({ saved: false, save_count: result.rows[0].save_count });
  } catch (err) { res.status(500).json({ error: 'Failed to unsave post.' }); }
});

router.post('/posts/:id/share', optionalAuth, userQuota('discover.share', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/discover?post=${encodeURIComponent(req.params.id)}`;
  await queueDiscoverEvent(req, { event_type: 'share_copy', post_id: req.params.id });
  res.json({ share_url: shareUrl });
});

router.post('/posts/:id/hide', requireAuth, validateSchema({ body: hideSchema }), userQuota('discover.hide', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  await query(
    'INSERT INTO post_hides(post_id, user_id, reason) VALUES ($1, $2, $3) ON CONFLICT(post_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW()',
    [req.params.id, req.user.id, req.body?.reason || null]
  );
  await queueDiscoverEvent(req, { event_type: 'hide_post', post_id: req.params.id, metadata: { reason: req.body?.reason || null } });
  res.json({ hidden: true });
});

router.post('/posts/:id/report', requireAuth, validateSchema({ body: reportSchema }), userQuota('discover.report', { windowMs: 60 * 60 * 1000, max: 60 }), async (req, res) => {
  await query(
    `INSERT INTO post_reports(post_id, user_id, reason, details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(post_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open', created_at = NOW()`,
    [req.params.id, req.user.id, req.body.reason, req.body.details || null]
  );
  await queueDiscoverEvent(req, { event_type: 'report_post', post_id: req.params.id, metadata: { reason: req.body.reason } });
  res.json({ reported: true });
});

router.post('/users/:id/mute', requireAuth, userQuota('discover.mutes', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot mute yourself.' });
  await query('INSERT INTO user_mutes(muter_id, muted_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
  res.json({ muted: true });
});

router.delete('/users/:id/mute', requireAuth, userQuota('discover.mutes', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  await query('DELETE FROM user_mutes WHERE muter_id = $1 AND muted_user_id = $2', [req.user.id, req.params.id]);
  res.json({ muted: false });
});

router.get('/posts/:id/comments', optionalAuth, async (req, res) => {
  const sort = req.query.sort === 'recent' ? 'recent' : 'helpful';
  const order = sort === 'recent'
    ? 'pc.created_at ASC, pc.id ASC'
    : 'pc.is_answer DESC, pc.helpful_count DESC, pc.created_at ASC, pc.id ASC';
  try {
    const result = await query(
      `SELECT pc.id, pc.post_id, pc.parent_comment_id, pc.body, pc.created_at, pc.edited_at,
              pc.is_answer, pc.helpful_count::int,
              u.id as author_id, u.full_name as author_name, u.username as author_username, u.avatar_url as author_avatar,
              EXISTS(SELECT 1 FROM comment_votes cv WHERE cv.comment_id = pc.id AND cv.user_id = $2::uuid) AS voted_by_viewer
       FROM post_comments pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.post_id = $1 AND pc.deleted_at IS NULL
       ORDER BY ${order} LIMIT 300`,
      [req.params.id, req.user?.id || null]
    );
    res.json({ comments: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to load comments.' }); }
});

router.post('/posts/:id/comments', requireAuth, validateSchema({ body: discoverCommentSchema }), userQuota('discover.comments.create', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  const { body, parent_comment_id } = req.body;
  try {
    const result = await insertComment({
      postId: req.params.id,
      userId: req.user.id,
      body,
      parentCommentId: parent_comment_id || null,
    });
    if (!result.comment) return res.status(result.status).json({ error: result.error });
    await queueDiscoverEvent(req, { event_type: 'comment_created', post_id: req.params.id });
    res.status(201).json({ comment: result.comment });
  } catch (err) { res.status(500).json({ error: 'Failed to add comment.' }); }
});

router.post('/comments/:id/replies', requireAuth, validateSchema({ body: discoverCommentSchema }), userQuota('discover.comments.create', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  try {
    const parent = await query('SELECT id, post_id FROM post_comments WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!parent.rows[0]) return res.status(404).json({ error: 'Comment not found.' });
    const result = await insertComment({
      postId: parent.rows[0].post_id,
      userId: req.user.id,
      body: req.body.body,
      parentCommentId: parent.rows[0].id,
    });
    if (!result.comment) return res.status(result.status).json({ error: result.error });
    await queueDiscoverEvent(req, { event_type: 'comment_created', post_id: parent.rows[0].post_id, metadata: { reply: true } });
    return res.status(201).json({ comment: result.comment });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add reply.' });
  }
});

router.patch('/comments/:id', requireAuth, validateSchema({ body: discoverCommentUpdateSchema }), userQuota('discover.comments.update', { windowMs: 60 * 60 * 1000, max: 160 }), async (req, res) => {
  const result = await query(
    `UPDATE post_comments SET body = $1, edited_at = NOW()
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *`,
    [req.body.body.trim(), req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Comment not found.' });
  res.json({ comment: result.rows[0] });
});

router.post('/comments/:id/vote', requireAuth, userQuota('discover.comment-votes', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  const result = await query(
    `WITH inserted AS (
       INSERT INTO comment_votes(comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1
     ), comment_update AS (
       UPDATE post_comments SET helpful_count = helpful_count + (SELECT COUNT(*) FROM inserted)
       WHERE id = $1 RETURNING post_id, helpful_count
     ), stats_update AS (
       UPDATE post_stats SET helpful_count = helpful_count + (SELECT COUNT(*) FROM inserted), updated_at = NOW()
       WHERE post_id = (SELECT post_id FROM comment_update)
     )
     SELECT post_id, helpful_count::int FROM comment_update`,
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Comment not found.' });
  res.json({ voted: true, helpful_count: result.rows[0].helpful_count });
});

router.delete('/comments/:id/vote', requireAuth, userQuota('discover.comment-votes', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  const result = await query(
    `WITH removed AS (
       DELETE FROM comment_votes WHERE comment_id = $1 AND user_id = $2 RETURNING 1
     ), comment_update AS (
       UPDATE post_comments SET helpful_count = GREATEST(0, helpful_count - (SELECT COUNT(*) FROM removed))
       WHERE id = $1 RETURNING post_id, helpful_count
     ), stats_update AS (
       UPDATE post_stats SET helpful_count = GREATEST(0, helpful_count - (SELECT COUNT(*) FROM removed)), updated_at = NOW()
       WHERE post_id = (SELECT post_id FROM comment_update)
     )
     SELECT post_id, helpful_count::int FROM comment_update`,
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Comment not found.' });
  res.json({ voted: false, helpful_count: result.rows[0].helpful_count });
});

router.post('/posts/:postId/answer/:commentId', requireAuth, userQuota('discover.answers', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  const post = await query('SELECT id, user_id FROM discover_posts WHERE id = $1 AND deleted_at IS NULL', [req.params.postId]);
  if (!post.rows[0]) return res.status(404).json({ error: 'Post not found.' });
  if (post.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Only the post author can mark an answer.' });
  const comment = await query('SELECT id FROM post_comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL', [req.params.commentId, req.params.postId]);
  if (!comment.rows[0]) return res.status(404).json({ error: 'Comment not found.' });
  await query('UPDATE post_comments SET is_answer = false WHERE post_id = $1', [req.params.postId]);
  await query('UPDATE post_comments SET is_answer = true WHERE id = $1', [req.params.commentId]);
  res.json({ answered: true, comment_id: req.params.commentId });
});

router.delete('/posts/:postId/comments/:commentId', requireAuth, userQuota('discover.comments.delete', { windowMs: 60 * 60 * 1000, max: 240 }), async (req, res) => {
  try {
    const removed = await query(
      `UPDATE post_comments SET deleted_at = NOW()
       WHERE id = $1 AND post_id = $2 AND (user_id = $3 OR EXISTS (
         SELECT 1 FROM discover_posts dp WHERE dp.id = $2 AND dp.user_id = $3
       )) RETURNING post_id`,
      [req.params.commentId, req.params.postId, req.user.id]
    );
    if (removed.rows[0]) {
      await query('UPDATE post_stats SET comment_count = GREATEST(0, comment_count - 1), updated_at = NOW() WHERE post_id = $1', [removed.rows[0].post_id]);
    }
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/comments/:id/report', requireAuth, validateSchema({ body: reportSchema }), userQuota('discover.comment-report', { windowMs: 60 * 60 * 1000, max: 80 }), async (req, res) => {
  await query(
    `INSERT INTO comment_reports(comment_id, user_id, reason, details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(comment_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open', created_at = NOW()`,
    [req.params.id, req.user.id, req.body.reason, req.body.details || null]
  );
  res.json({ reported: true });
});

router.get('/portfolios', optionalAuth, async (req, res, next) => {
  let cursor = null;
  if (req.query.cursor) {
    try { cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid cursor.' }); }
  }
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.username, u.avatar_url, u.headline, u.location, u.skills,
              ps.accent_color, ps.theme, COALESCE(s.project_count, 0)::int AS project_count,
              COALESCE(s.total_views, 0)::bigint AS total_views, COALESCE(s.recent_views, 0)::bigint AS recent_views,
              COALESCE(s.follower_count, 0)::int AS follower_count,
              EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS followed_by_viewer,
              EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS following,
              COALESCE(s.trending_score, 0)::double precision AS sort_score
       FROM users u LEFT JOIN portfolio_settings ps ON ps.user_id = u.id LEFT JOIN user_stats s ON s.user_id = u.id
       WHERE COALESCE(ps.is_public, true) = true AND COALESCE(s.project_count, 0) > 0
         AND ($2::double precision IS NULL OR (COALESCE(s.trending_score, 0), u.id) < ($2, $3::uuid))
       ORDER BY COALESCE(s.trending_score, 0) DESC, u.id DESC LIMIT $4`,
      [req.user?.id || null, cursor?.score ?? null, cursor?.id || null, PAGE_SIZE + 1]
    );
    const hasMore = result.rows.length > PAGE_SIZE;
    const portfolios = result.rows.slice(0, PAGE_SIZE);
    const last = portfolios.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ score: last.sort_score, id: last.id })).toString('base64url') : null;
    portfolios.forEach((item) => { delete item.sort_score; });
    return res.json({ portfolios, total: null, page: null, has_more: hasMore, next_cursor: nextCursor });
  } catch (error) { return next(error); }
});

router.get('/categories', async (req, res) => {
  try {
    const [projectTypes, contexts, postTypes] = await Promise.all([
      query(
        `SELECT p.project_type, COUNT(DISTINCT dp.id) as count
         FROM discover_posts dp
         JOIN projects p ON p.id = dp.project_id
         WHERE p.project_type IS NOT NULL AND p.project_type != '' AND dp.deleted_at IS NULL AND dp.status = 'published'
         GROUP BY p.project_type ORDER BY count DESC`
      ),
      query(
        `SELECT COALESCE(context, 'show') AS context, COUNT(*)::int AS count
         FROM discover_posts WHERE deleted_at IS NULL AND status = 'published'
         GROUP BY COALESCE(context, 'show') ORDER BY count DESC`
      ),
      query(
        `SELECT post_type, COUNT(*)::int AS count
         FROM discover_posts WHERE deleted_at IS NULL AND status = 'published'
         GROUP BY post_type ORDER BY count DESC`
      ),
    ]);
    res.json({ categories: projectTypes.rows, contexts: contexts.rows, post_types: postTypes.rows });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/search', optionalAuth, async (req, res, next) => {
  const search = String(req.query.q || '').trim().slice(0, 120);
  if (search.length < 2) return res.json({ posts: [], portfolios: [], people: [] });
  try {
    const [postsResult, portfolios] = await Promise.all([
      query(
        `${postSelectSql("ts_rank(dp.search_document, websearch_to_tsquery('simple', $2)) + EXTRACT(EPOCH FROM dp.created_at) / 100000000")}
         WHERE ${canViewPostSql('$1')} AND (
           dp.search_document @@ websearch_to_tsquery('simple', $2)
           OR p.search_document @@ websearch_to_tsquery('simple', $2)
           OR lower(dp.context) = lower($2)
           OR lower(dp.post_type) = lower($2)
         )
         ORDER BY sort_score DESC, dp.created_at DESC LIMIT 20`,
        [req.user?.id || null, search]
      ),
      query(
        `SELECT u.id, u.full_name, u.username, u.avatar_url, u.headline, u.skills,
                ps.accent_color,
                COALESCE(s.follower_count, 0)::int AS follower_count, COALESCE(s.project_count, 0)::int AS project_count,
                EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $2 AND f.following_id = u.id) AS followed_by_viewer,
                EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $2 AND f.following_id = u.id) AS following
         FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
         LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
         WHERE COALESCE(ps.is_public, true) = true AND (
           u.search_document @@ websearch_to_tsquery('simple', $1) OR lower(u.full_name) % lower($1)
         ) ORDER BY ts_rank(u.search_document, websearch_to_tsquery('simple', $1)) DESC LIMIT 20`,
        [search, req.user?.id || null]
      ),
    ]);
    const posts = postsResult.rows.map((post) => {
      delete post.sort_score;
      return post;
    });
    return res.json({ posts, portfolios: portfolios.rows, people: portfolios.rows });
  } catch (error) { return next(error); }
});

router.get('/my-projects', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, slug, tagline, cover_image_url, project_type, technologies, github_url, live_url
       FROM projects WHERE user_id = $1 AND status = 'published' ORDER BY updated_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

async function followUser(req, res) {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid user id.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself.' });
  try {
    const count = await query(
      `WITH inserted AS (INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1),
       target AS (UPDATE user_stats SET follower_count = follower_count + (SELECT COUNT(*) FROM inserted), updated_at = NOW() WHERE user_id = $2 RETURNING follower_count),
       actor AS (UPDATE user_stats SET following_count = following_count + (SELECT COUNT(*) FROM inserted), updated_at = NOW() WHERE user_id = $1)
       SELECT COALESCE((SELECT follower_count FROM target), 0)::int AS follower_count`,
      [req.user.id, req.params.id]
    );
    await queueDiscoverEvent(req, { event_type: 'follow_from_discover', metadata: { followed_user_id: req.params.id } });
    res.json({ following: true, follower_count: count.rows[0].follower_count });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
}

async function unfollowUser(req, res) {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    const count = await query(
      `WITH removed AS (DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2 RETURNING 1),
       target AS (UPDATE user_stats SET follower_count = GREATEST(0, follower_count - (SELECT COUNT(*) FROM removed)), updated_at = NOW() WHERE user_id = $2 RETURNING follower_count),
       actor AS (UPDATE user_stats SET following_count = GREATEST(0, following_count - (SELECT COUNT(*) FROM removed)), updated_at = NOW() WHERE user_id = $1)
       SELECT COALESCE((SELECT follower_count FROM target), 0)::int AS follower_count`,
      [req.user.id, req.params.id]
    );
    res.json({ following: false, follower_count: count.rows[0].follower_count });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
}

const followMw = [requireAuth, userQuota('discover.follows', { windowMs: 60 * 60 * 1000, max: 300 })];
router.post('/users/:id/follow', ...followMw, followUser);
router.delete('/users/:id/follow', ...followMw, unfollowUser);

router.get('/interests', requireAuth, async (req, res) => {
  const result = await query('SELECT contexts, technologies, goals, updated_at FROM discover_user_interests WHERE user_id = $1', [req.user.id]);
  res.json({ interests: result.rows[0] || { contexts: [], technologies: [], goals: [] } });
});

router.get('/me/stats', requireAuth, async (req, res) => {
  try {
    const [posts, makers, comments, saves] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS count
         FROM discover_posts
         WHERE user_id = $1 AND deleted_at IS NULL AND status = 'published'`,
        [req.user.id]
      ),
      query('SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_id = $1', [req.user.id]),
      query(
        `SELECT COUNT(*)::int AS count
         FROM post_comments
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [req.user.id]
      ),
      query('SELECT COUNT(*)::int AS count FROM post_saves WHERE user_id = $1', [req.user.id]),
    ]);
    res.json({
      stats: {
        posts: posts.rows[0]?.count || 0,
        makers_followed: makers.rows[0]?.count || 0,
        comments: comments.rows[0]?.count || 0,
        saves: saves.rows[0]?.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load Discover activity stats.' });
  }
});

router.put('/interests', requireAuth, validateSchema({ body: interestSchema }), userQuota('discover.interests', { windowMs: 60 * 60 * 1000, max: 40 }), async (req, res) => {
  const contexts = jsonArray(req.body.contexts);
  const technologies = jsonArray(req.body.technologies);
  const goals = jsonArray(req.body.goals);
  const result = await query(
    `INSERT INTO discover_user_interests(user_id, contexts, technologies, goals, updated_at)
     VALUES ($1, $2::text[], $3::text[], $4::text[], NOW())
     ON CONFLICT(user_id) DO UPDATE SET contexts = EXCLUDED.contexts, technologies = EXCLUDED.technologies, goals = EXCLUDED.goals, updated_at = NOW()
     RETURNING contexts, technologies, goals, updated_at`,
    [req.user.id, contexts, technologies, goals]
  );
  res.json({ interests: result.rows[0] });
});

router.post('/events', optionalAuth, validateSchema({ body: discoverEventSchema }), userQuota('discover.events', { windowMs: 60 * 1000, max: 120 }), async (req, res) => {
  await queueDiscoverEvent(req, req.body);
  res.status(202).json({ accepted: true });
});

router.get('/insights', optionalAuth, async (req, res) => {
  try {
    const [makers, contexts, saved] = await Promise.all([
      query(
        `SELECT u.id, u.full_name, u.username, u.avatar_url, u.headline, ps.accent_color,
                COALESCE(s.follower_count, 0)::int AS follower_count,
                COALESCE(s.project_count, 0)::int AS project_count,
                EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS followed_by_viewer,
                EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS following
         FROM users u
         LEFT JOIN portfolio_settings ps ON ps.user_id = u.id
         LEFT JOIN user_stats s ON s.user_id = u.id
         WHERE COALESCE(ps.is_public, true) = true
           AND u.id != COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000')
           AND COALESCE(s.project_count, 0) > 0
           AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id = $1 AND f.following_id = u.id))
         ORDER BY COALESCE(s.trending_score, 0) DESC, COALESCE(s.project_count, 0) DESC LIMIT 5`,
        [req.user?.id || null]
      ),
      query(
        `SELECT COALESCE(context, 'show') AS context, COUNT(*)::int AS count
         FROM discover_posts WHERE deleted_at IS NULL AND status = 'published'
         GROUP BY COALESCE(context, 'show') ORDER BY count DESC LIMIT 8`
      ),
      req.user?.id ? query(
        `SELECT dp.id, dp.title, dp.post_type, dp.context, dp.created_at, u.username AS author_username
         FROM post_saves s JOIN discover_posts dp ON dp.id = s.post_id JOIN users u ON u.id = dp.user_id
         WHERE s.user_id = $1 AND dp.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 5`,
        [req.user.id]
      ) : Promise.resolve({ rows: [] }),
    ]);
    res.json({
      recommended_makers: makers.rows,
      active_discussions: [],
      launches_this_week: [],
      trending_contexts: contexts.rows,
      saved_posts: saved.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load discover insights.' });
  }
});

router.get('/posts/:id/analytics', requireAuth, validateSchema({ query: postAnalyticsWindowSchema }, { rejectUnknownQuery: false }), async (req, res) => {
  const window = req.query.window || '30d';
  const since = window === '7d' ? "NOW() - INTERVAL '7 days'" : window === '30d' ? "NOW() - INTERVAL '30 days'" : null;
  const timeWhere = since ? `AND created_at >= ${since}` : '';
  try {
    const owner = await query('SELECT user_id FROM discover_posts WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!owner.rows[0]) return res.status(404).json({ error: 'Post not found.' });
    if (owner.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Only the author can view post analytics.' });
    const [stats, events, topSources] = await Promise.all([
      query('SELECT * FROM post_stats WHERE post_id = $1', [req.params.id]),
      query(
        `SELECT event_type, COUNT(*)::int AS count
         FROM discover_events WHERE post_id = $1 ${timeWhere}
         GROUP BY event_type`,
        [req.params.id]
      ),
      query(
        `SELECT COALESCE(metadata->>'surface', 'discover') AS source, COUNT(*)::int AS count
         FROM discover_events WHERE post_id = $1 ${timeWhere}
         GROUP BY COALESCE(metadata->>'surface', 'discover') ORDER BY count DESC LIMIT 8`,
        [req.params.id]
      ),
    ]);
    const eventCounts = Object.fromEntries(events.rows.map((row) => [row.event_type, row.count]));
    res.json({
      window,
      stats: stats.rows[0] || {},
      events: eventCounts,
      top_sources: topSources.rows,
      qualified_interactions:
        (eventCounts.project_click || 0)
        + (eventCounts.comment_created || 0)
        + (eventCounts.save_post || 0)
        + (eventCounts.follow_from_discover || 0),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load post analytics.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [posts, users, comments, saves] = await Promise.all([
      query(`SELECT COUNT(*) FROM discover_posts WHERE deleted_at IS NULL AND status = 'published'`),
      query(`SELECT COUNT(*) FROM users`),
      query(`SELECT COUNT(*) FROM post_comments WHERE created_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL`),
      query(`SELECT COUNT(*) FROM post_saves WHERE created_at > NOW() - INTERVAL '7 days'`),
    ]);
    res.json({
      total_posts: parseInt(posts.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      weekly_comments: parseInt(comments.rows[0].count),
      weekly_saves: parseInt(saves.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.runLinkPreviewJob = async ({ postId, url }) => {
  const { safeFetchText } = require('../utils/safeFetch');
  const preview = safeLinkPreview(url) || { url };
  try {
    const response = await safeFetchText(url, { maxBytes: 256 * 1024, timeoutMs: 5000 });
    if (response.ok) {
      const title = response.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
      const description = response.text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
      if (title) preview.title = title.slice(0, 140);
      if (description) preview.description = description.slice(0, 240);
    }
  } catch {}
  await query(
    "UPDATE discover_posts SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2",
    [JSON.stringify({ link_preview: preview }), postId]
  );
  return { preview };
};

router.handlers = { followUser, unfollowUser };

module.exports = router;
