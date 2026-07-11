const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { withPage } = require('../utils/browserPool');

const processors = new Map();

const registerProcessor = (type, processor) => processors.set(type, processor);

registerProcessor('analytics:view', async (input) => {
  const client = await pool.connect();
  const projectId = input.projectId || '00000000-0000-0000-0000-000000000000';
  const visitorHash = input.visitorHash ? Buffer.from(input.visitorHash, 'hex') : null;
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO analytics_events (subject_type, subject_id, project_id, visitor_hash, referrer_source, created_at)
       VALUES ($1, $2, NULLIF($3::uuid, '00000000-0000-0000-0000-000000000000'), $4, $5, COALESCE($6, NOW()))`,
      [input.subjectType, input.subjectId, projectId, visitorHash, input.source || 'direct', input.createdAt || null]
    );
    await client.query(
      `INSERT INTO analytics_daily (subject_type, subject_id, project_id, day, referrer_source, views)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW())::date, $5, 1)
       ON CONFLICT (subject_type, subject_id, day, referrer_source, project_id)
       DO UPDATE SET views = analytics_daily.views + 1`,
      [input.subjectType, input.subjectId, projectId, input.createdAt || null, input.source || 'direct']
    );
    if (visitorHash) {
      await client.query(
        `INSERT INTO analytics_subject_visitors (subject_type, subject_id, visitor_hash, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (subject_type, subject_id, visitor_hash) DO UPDATE SET last_seen_at = NOW()`,
        [input.subjectType, input.subjectId, visitorHash]
      );
      await client.query(
        `INSERT INTO analytics_daily_visitors (subject_type, subject_id, day, visitor_hash)
         VALUES ($1, $2, COALESCE($4::timestamptz, NOW())::date, $3) ON CONFLICT DO NOTHING`,
        [input.subjectType, input.subjectId, visitorHash, input.createdAt || null]
      );
    }
    if (input.projectId) {
      await client.query('UPDATE projects SET view_count = view_count + 1 WHERE id = $1', [input.projectId]);
    }
    if (input.subjectType === 'portfolio') {
      await client.query(
        `INSERT INTO user_stats(user_id, total_views, recent_views, trending_score, updated_at)
         VALUES ($1, 1, 1, 1, NOW()) ON CONFLICT(user_id) DO UPDATE SET
           total_views = user_stats.total_views + 1,
           recent_views = user_stats.recent_views + 1,
           trending_score = user_stats.trending_score + 1,
           updated_at = NOW()`,
        [input.subjectId]
      );
    }
    await client.query('COMMIT');
    return { recorded: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

registerProcessor('discover:event', async (input) => {
  const eventType = String(input.eventType || input.event_type || '').slice(0, 80);
  if (!eventType) return { recorded: false };
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  await pool.query(
    `INSERT INTO discover_events(user_id, post_id, project_id, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId || null, input.postId || null, input.projectId || null, eventType, JSON.stringify(metadata)]
  );

  if (input.postId && eventType === 'post_card_impression') {
    await pool.query(
      `INSERT INTO post_stats(post_id, impression_count) VALUES ($1, 1)
       ON CONFLICT(post_id) DO UPDATE SET impression_count = post_stats.impression_count + 1, updated_at = NOW()`,
      [input.postId]
    );
  }
  if (input.postId && eventType === 'project_click') {
    await pool.query(
      `INSERT INTO post_stats(post_id, project_click_count) VALUES ($1, 1)
       ON CONFLICT(post_id) DO UPDATE SET project_click_count = post_stats.project_click_count + 1, updated_at = NOW()`,
      [input.postId]
    );
  }
  if (input.postId && eventType === 'share_copy') {
    await pool.query(
      `INSERT INTO post_stats(post_id, share_count) VALUES ($1, 1)
       ON CONFLICT(post_id) DO UPDATE SET share_count = post_stats.share_count + 1, updated_at = NOW()`,
      [input.postId]
    );
  }

  return { recorded: true };
});

registerProcessor('email:send', async (input) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return { messageId: info.messageId };
});

registerProcessor('media:delete', async (input) => {
  const resourceType = input.fileType?.startsWith('video/') ? 'video' : input.fileType?.startsWith('image/') ? 'image' : 'raw';
  const result = await cloudinary.uploader.destroy(input.cloudinaryId, { resource_type: resourceType, invalidate: true });
  return { deleted: result.result === 'ok' || result.result === 'not found' };
});

registerProcessor('agent:chat', async (input) => require('../routes/agent').runAgentChatJob(input));
registerProcessor('agent:apply', async (input) => require('../routes/agent').runAgentApplyJob(input));
registerProcessor('discover:link-preview', async (input) => require('../routes/discover').runLinkPreviewJob(input));

registerProcessor('export:pdf', async (input, { jobId, updateProgress }) => {
  const userResult = await pool.query(
    `SELECT id, full_name, username, headline, bio, location, website, linkedin_url, github_url, skills
     FROM users WHERE id = $1 AND username = $2`,
    [input.userId, input.username]
  );
  if (!userResult.rows[0]) throw new Error('Portfolio owner not found.');
  await updateProgress(20);
  const projectsResult = await pool.query(
    `SELECT p.*, COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order) FILTER (WHERE b.id IS NOT NULL), '[]'::jsonb) AS blocks
     FROM projects p LEFT JOIN blocks b ON b.project_id = p.id
     WHERE p.user_id = $1 AND p.status = 'published' GROUP BY p.id
     ORDER BY p.is_featured DESC, p.sort_order, p.created_at DESC`,
    [input.userId]
  );
  const html = require('../routes/export').buildPortfolioHTML(userResult.rows[0], projectsResult.rows, input.username);
  await updateProgress(40);
  const pdf = await withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    return page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' } });
  });
  await updateProgress(80);
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: 'projectfolio/exports', resource_type: 'raw', public_id: `${input.userId}-${jobId}.pdf`, overwrite: true,
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(pdf);
  });
  return { url: uploaded.secure_url, filename: `${input.username}-portfolio.pdf` };
});

registerProcessor('integration:opportunity-finder', async (input) => require('../routes/integrations').runOpportunityFinderJob(input));
registerProcessor('integration:ai-match', async (input) => require('../routes/integrations').runAiMatchJob(input));
registerProcessor('application:generate', async (input, context) => require('../applicationHelper').runApplicationGenerateJob(input, context));

const processByType = async (type, input, context = {}) => {
  const processor = processors.get(type);
  if (!processor) throw new Error(`No processor registered for job type ${type}`);
  return processor(input, context);
};

module.exports = { registerProcessor, processByType };
