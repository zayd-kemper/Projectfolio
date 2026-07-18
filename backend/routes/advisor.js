const express = require('express');
const db = require('../config/database');
const jobsService = require('../jobs/service');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { isValidStepId } = require('../advisor');

const router = express.Router();

const createSessionSchema = {
  objective: s.enum(['projects', 'skills', 'position'], { required: true }),
  growth: s.enum(['horizontal', 'vertical'], { required: true }),
  focus_note: s.string({ max: 1000 }),
  target_role: s.string({ max: 200 }),
  timeframe_weeks: s.integer({ min: 1, max: 104 }),
};

const validateCreate = validateSchema({ body: createSessionSchema });

// Runs the same validation the route middleware uses against a raw payload.
// Exported for tests (same pattern as routes/applications.js).
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

// Questionnaire answers live as one JSONB blob — the goals shape is versionless
// UI state, not schema.
const goalsFromBody = (body) => {
  const goals = { objective: body.objective, growth: body.growth };
  if (body.focus_note) goals.focus_note = body.focus_note;
  if (body.target_role) goals.target_role = body.target_role;
  if (body.timeframe_weeks) goals.timeframe_weeks = body.timeframe_weeks;
  return goals;
};

const createSession = async (req, res, next) => {
  try {
    const sessionResult = await db.query(
      `INSERT INTO advisor_sessions (user_id, goals)
       VALUES ($1, $2)
       RETURNING id, status, created_at`,
      [req.user.id, JSON.stringify(goalsFromBody(req.body))]
    );
    const session = sessionResult.rows[0];

    const job = await jobsService.createJob({
      userId: req.user.id,
      type: 'advisor:generate',
      input: { userId: req.user.id, sessionId: session.id },
      idempotencyKey: req.get('Idempotency-Key') || null,
    });

    await db.query('UPDATE advisor_sessions SET job_id = $2 WHERE id = $1', [session.id, job.id]);

    res.status(202).json({ session_id: session.id, job_id: job.id, status: session.status });
  } catch (error) {
    next(error);
  }
};

// Sync check-off of a roadmap step. progress lives in its own column so the
// AI-generated package stays immutable; unchecking removes the entry entirely.
const updateStep = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, user_id, package, progress FROM advisor_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: 'Advisor session not found.' });
    if (!isValidStepId(session.package, req.params.stepId)) {
      return res.status(422).json({ error: 'That roadmap step does not exist for this session.' });
    }

    const progress = { ...(session.progress || {}) };
    if (req.body.completed === true) {
      progress[req.params.stepId] = { completed: true, completed_at: new Date().toISOString() };
    } else {
      delete progress[req.params.stepId];
    }

    const updated = await db.query(
      'UPDATE advisor_sessions SET progress = $2, updated_at = NOW() WHERE id = $1 RETURNING progress',
      [session.id, JSON.stringify(progress)]
    );
    res.json({ progress: updated.rows[0].progress });
  } catch (error) {
    next(error);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await db.query(
      `SELECT id, status, goals, model_id, error, created_at, updated_at
       FROM advisor_sessions
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
      'SELECT * FROM advisor_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Advisor session not found.' });
    res.json({ session: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const regenerateSession = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE advisor_sessions
       SET status = 'generating', error = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Advisor session not found.' });

    const job = await jobsService.createJob({
      userId: req.user.id,
      type: 'advisor:generate',
      input: { userId: req.user.id, sessionId: req.params.id },
      idempotencyKey: req.get('Idempotency-Key') || null,
    });
    await db.query('UPDATE advisor_sessions SET job_id = $2 WHERE id = $1', [req.params.id, job.id]);

    res.status(202).json({ session_id: req.params.id, job_id: job.id, status: 'generating' });
  } catch (error) {
    next(error);
  }
};

const deleteSession = async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM advisor_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Advisor session not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// AI generation sits behind the same quota + cost stack the other AI integrations use.
const generateQuota = userQuota('advisor.generate', {
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many advisor roadmaps this hour. Please wait and try again.',
});
const generateBudget = userCostBudget('advisor.generate', {
  windowMs: 24 * 60 * 60 * 1000,
  maxCost: 120,
  cost: 10,
  message: 'Daily advisor budget reached. Try again tomorrow.',
});

const idParam = validateSchema({ params: { id: s.uuid({ required: true }) } });

router.post('/sessions', requireAuth, validateCreate, generateQuota, generateBudget, createSession);
router.get('/sessions', requireAuth, listSessions);
router.get('/sessions/:id', requireAuth, idParam, getSession);
router.post('/sessions/:id/regenerate', requireAuth, idParam, generateQuota, generateBudget, regenerateSession);
router.patch('/sessions/:id/steps/:stepId', requireAuth, validateSchema({
  params: { id: s.uuid({ required: true }), stepId: s.string({ required: true, max: 40 }) },
  body: { completed: s.boolean({ required: true }) },
}), updateStep);
router.delete('/sessions/:id', requireAuth, idParam, deleteSession);

router.handlers = { createSession, listSessions, getSession, regenerateSession, deleteSession, updateStep };
router.checkCreatePayload = checkCreatePayload;

module.exports = router;
