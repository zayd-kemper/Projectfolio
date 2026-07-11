const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');

const router = express.Router();

const EXPERIENCE_KINDS = ['employment', 'education', 'certification'];

const experienceBodySchema = {
  kind: s.enum(EXPERIENCE_KINDS, { required: true }),
  title: s.string({ required: true, max: 200 }),
  organization: s.string({ required: true, max: 200 }),
  location: s.string({ max: 120 }),
  start_date: s.date({ allowNull: true }),
  end_date: s.date({ allowNull: true }),
  is_current: s.boolean(),
  description: s.string({ max: 4000 }),
  highlights: s.array(s.string({ max: 300 }), { max: 12 }),
  skills: s.array(s.string({ max: 60 }), { max: 20 }),
  url: s.url({ max: 500 }),
  credential_id: s.string({ max: 120 }),
  field_of_study: s.string({ max: 160 }),
  grade: s.string({ max: 60 }),
};

const validateExperience = validateSchema({ body: experienceBodySchema });

// Runs the same validation the route middleware uses against a raw payload.
// Exported for tests.
const checkExperiencePayload = (body) => {
  let outcome = null;
  const req = { body };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { outcome = { ok: false, errors: payload.details || [], status: this.statusCode }; },
  };
  validateExperience(req, res, () => { outcome = { ok: true, value: req.body, errors: [] }; });
  return outcome;
};

const EXPERIENCE_COLUMNS = `id, kind, title, organization, location,
  to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date, 'YYYY-MM-DD') AS end_date,
  is_current, description, highlights, skills, url, credential_id, field_of_study, grade,
  sort_order, created_at, updated_at`;

const listExperiences = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ${EXPERIENCE_COLUMNS} FROM profile_experiences
       WHERE user_id = $1
       ORDER BY kind, sort_order, start_date DESC NULLS LAST, created_at DESC`,
      [req.user.id]
    );
    res.json({ experiences: result.rows });
  } catch (error) {
    next(error);
  }
};

const createExperience = async (req, res, next) => {
  try {
    const b = req.body;
    const result = await db.query(
      `INSERT INTO profile_experiences
        (user_id, kind, title, organization, location, start_date, end_date, is_current,
         description, highlights, skills, url, credential_id, field_of_study, grade, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         COALESCE((SELECT MAX(sort_order) + 1 FROM profile_experiences WHERE user_id = $16 AND kind = $17), 0))
       RETURNING ${EXPERIENCE_COLUMNS}`,
      [
        req.user.id, b.kind, b.title, b.organization, b.location || null,
        b.start_date || null, b.end_date || null, b.is_current === true,
        b.description || null, b.highlights || [], b.skills || [],
        b.url || null, b.credential_id || null, b.field_of_study || null, b.grade || null,
        req.user.id, b.kind,
      ]
    );
    res.status(201).json({ experience: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateExperience = async (req, res, next) => {
  try {
    const b = req.body;
    const result = await db.query(
      `UPDATE profile_experiences SET
         kind = $3, title = $4, organization = $5, location = $6, start_date = $7, end_date = $8,
         is_current = $9, description = $10, highlights = $11, skills = $12, url = $13,
         credential_id = $14, field_of_study = $15, grade = $16, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${EXPERIENCE_COLUMNS}`,
      [
        req.params.id, req.user.id, b.kind, b.title, b.organization, b.location || null,
        b.start_date || null, b.end_date || null, b.is_current === true,
        b.description || null, b.highlights || [], b.skills || [],
        b.url || null, b.credential_id || null, b.field_of_study || null, b.grade || null,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Experience not found.' });
    res.json({ experience: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteExperience = async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM profile_experiences WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Experience not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const reorderExperiences = async (req, res, next) => {
  try {
    const { kind, ids } = req.body;
    await db.query(
      `UPDATE profile_experiences AS pe
       SET sort_order = ordered.idx, updated_at = NOW()
       FROM (SELECT id, ordinality - 1 AS idx FROM UNNEST($1::uuid[]) WITH ORDINALITY AS t(id, ordinality)) AS ordered
       WHERE pe.id = ordered.id AND pe.user_id = $2 AND pe.kind = $3`,
      [ids, req.user.id, kind]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

router.get('/experiences', requireAuth, listExperiences);
router.post('/experiences', requireAuth, validateExperience, createExperience);
router.put('/experiences/reorder', requireAuth, validateSchema({
  body: { kind: s.enum(EXPERIENCE_KINDS, { required: true }), ids: s.array(s.uuid(), { required: true, max: 100 }) },
}), reorderExperiences);
router.put('/experiences/:id', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) }, body: experienceBodySchema }), updateExperience);
router.delete('/experiences/:id', requireAuth, validateSchema({ params: { id: s.uuid({ required: true }) } }), deleteExperience);

router.handlers = { listExperiences, createExperience, updateExperience, deleteExperience, reorderExperiences };
router.checkExperiencePayload = checkExperiencePayload;
router.EXPERIENCE_KINDS = EXPERIENCE_KINDS;

module.exports = router;
