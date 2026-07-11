const express = require('express');
const db = require('../config/database');
const jobsService = require('../jobs/service');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { PLATFORMS, PLATFORM_SLUGS } = require('../applicationHelper/platforms');

const router = express.Router();

const createApplicationSchema = {
  platform: s.enum(PLATFORM_SLUGS, { required: true }),
  job_title: s.string({ max: 200 }),
  company: s.string({ max: 200 }),
  job_posting_url: s.url({ max: 1000 }),
  notes: s.string({ max: 2000 }),
};

const validateCreate = validateSchema({ body: createApplicationSchema });

// Runs the same validation the route middleware uses against a raw payload.
// Exported for tests.
const checkCreatePayload = (body) => {
  let outcome = null;
  const req = { body };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { outcome = { ok: false, errors: payload.details || [], status: this.statusCode }; },
  };
  validateCreate(req, res, () => { outcome = { ok: true, value: req.body, errors: [] }; });
  return outcome;
};

const createApplication = async (req, res, next) => {
  try {
    const b = req.body;
    const sessionResult = await db.query(
      `INSERT INTO application_sessions (user_id, platform, job_title, company, job_posting_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, platform, job_title, company, job_posting_url, status, created_at`,
      [req.user.id, b.platform, b.job_title || null, b.company || null, b.job_posting_url || null, b.notes || null]
    );
    const session = sessionResult.rows[0];

    const job = await jobsService.createJob({
      userId: req.user.id,
      type: 'application:generate',
      input: { userId: req.user.id, sessionId: session.id },
      idempotencyKey: req.get('Idempotency-Key') || null,
    });

    await db.query('UPDATE application_sessions SET job_id = $2 WHERE id = $1', [session.id, job.id]);

    res.status(202).json({ session_id: session.id, job_id: job.id, status: session.status });
  } catch (error) {
    next(error);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await db.query(
      `SELECT id, platform, job_title, company, status, resume_url, created_at, updated_at
       FROM application_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ sessions: result.rows });
  } catch (error) {
    next(error);
  }
};

const getSession = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM application_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application session not found.' });
    res.json({ session: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const regenerateSession = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE application_sessions
       SET status = 'generating', error = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application session not found.' });

    const job = await jobsService.createJob({
      userId: req.user.id,
      type: 'application:generate',
      input: { userId: req.user.id, sessionId: req.params.id },
      idempotencyKey: req.get('Idempotency-Key') || null,
    });
    await db.query('UPDATE application_sessions SET job_id = $2 WHERE id = $1', [req.params.id, job.id]);

    res.status(202).json({ session_id: req.params.id, job_id: job.id, status: 'generating' });
  } catch (error) {
    next(error);
  }
};

const deleteSession = async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM application_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application session not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Cloudinary blocks unsigned public PDF delivery, and resumes are personal data —
// so the PDF is streamed through this authenticated route using an API-signed
// download URL instead of ever exposing a public Cloudinary link.
const downloadResume = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, user_id, status, package FROM application_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: 'Application session not found.' });
    if (session.status !== 'ready') return res.status(409).json({ error: 'Resume is not ready yet.' });

    const { cloudinary } = require('../config/cloudinary');
    const publicId = `projectfolio/applications/${session.user_id}-${session.id}.pdf`;
    const downloadUrl = cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      type: 'upload',
    });
    const response = await fetch(downloadUrl);
    if (!response.ok) return res.status(502).json({ error: 'Resume file is unavailable. Try regenerating.' });
    const pdf = Buffer.from(await response.arrayBuffer());

    const filename = session.package?.resume?.filename || 'resume.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

const listPlatforms = (req, res, next) => {
  try {
    res.json({ platforms: PLATFORMS });
  } catch (error) {
    next(error);
  }
};

// AI generation sits behind the same quota + cost stack the other AI integrations use.
const generateQuota = userQuota('applications.generate', {
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many application generations this hour. Please wait and try again.',
});
const generateBudget = userCostBudget('applications.generate', {
  windowMs: 24 * 60 * 60 * 1000,
  maxCost: 120,
  cost: 10,
  message: 'Daily application-helper budget reached. Try again tomorrow.',
});

router.get('/platforms', requireAuth, listPlatforms);
router.post('/', requireAuth, validateCreate, generateQuota, generateBudget, createApplication);
router.get('/', requireAuth, listSessions);
router.get('/:id/resume', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) } }), downloadResume);
router.get('/:id', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) } }), getSession);
router.post('/:id/regenerate', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) } }), generateQuota, generateBudget, regenerateSession);
router.delete('/:id', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) } }), deleteSession);

router.handlers = { createApplication, listSessions, getSession, regenerateSession, deleteSession, listPlatforms, downloadResume };
router.checkCreatePayload = checkCreatePayload;

module.exports = router;
