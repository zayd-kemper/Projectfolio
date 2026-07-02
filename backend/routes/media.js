const crypto = require('crypto');
const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota, userCostBudget } = require('../middleware/userQuotas');
const { cloudinary, ALLOWED_TYPES } = require('../config/cloudinary');
const { createJob } = require('../jobs/service');

const router = express.Router();
const maxBytes = 200 * 1024 * 1024;

const signatureSchema = {
  file_type: s.string({ required: true, min: 1, max: 120 }),
  file_size: s.integer({ required: true, min: 1, max: maxBytes }),
};

const completeSchema = {
  public_id: s.string({ required: true, min: 1, max: 300 }),
  version: s.integer({ required: true, min: 1 }),
  signature: s.string({ required: true, min: 1, max: 256 }),
  secure_url: s.url({ required: true, max: 2048 }),
  resource_type: s.enum(['image', 'video', 'raw']),
  original_filename: s.string({ max: 300 }),
  file_type: s.string({ required: true, min: 1, max: 120 }),
  file_size: s.integer({ required: true, min: 1, max: maxBytes }),
  project_id: s.uuid({ allowNull: true }),
  width: s.integer({ min: 1, max: 100_000 }),
  height: s.integer({ min: 1, max: 100_000 }),
  duration: s.number({ min: 0, max: 86_400 }),
};

const resourceTypeFor = (fileType = '') => fileType.startsWith('video/') ? 'video' : fileType.startsWith('image/') ? 'image' : 'raw';
const folderFor = (resourceType) => resourceType === 'video' ? 'projectfolio/videos' : resourceType === 'image' ? 'projectfolio/images' : 'projectfolio/documents';

router.post('/signature', requireAuth, validateSchema({ body: signatureSchema }), userQuota('media.signature', { windowMs: 60 * 60 * 1000, max: 120 }), userCostBudget('media.upload', { windowMs: 24 * 60 * 60 * 1000, maxCost: 240, cost: 2, message: 'Daily upload budget reached.' }), async (req, res) => {
  const fileType = String(req.body?.file_type || '');
  const fileSize = Number(req.body?.file_size);
  if (!ALLOWED_TYPES.includes(fileType) || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxBytes) {
    return res.status(400).json({ error: 'Unsupported file type or size.' });
  }
  const resourceType = resourceTypeFor(fileType);
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = folderFor(resourceType);
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, process.env.CLOUDINARY_API_SECRET);
  res.json({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    resource_type: resourceType,
    signature,
  });
});

router.post('/complete', requireAuth, validateSchema({ body: completeSchema }), userQuota('media.complete', { windowMs: 60 * 60 * 1000, max: 120 }), userCostBudget('media.complete', { windowMs: 24 * 60 * 60 * 1000, maxCost: 240, cost: 1, message: 'Daily upload completion budget reached.' }), async (req, res) => {
  const { public_id, version, signature, secure_url, resource_type, original_filename, file_type, file_size, project_id, width, height, duration } = req.body || {};
  const expected = cloudinary.utils.api_sign_request({ public_id, version }, process.env.CLOUDINARY_API_SECRET);
  let validUrl = false;
  try {
    const host = new URL(secure_url).hostname;
    validUrl = host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com');
  } catch {}
  const signaturesMatch = typeof signature === 'string' && typeof expected === 'string'
    && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!public_id || !signaturesMatch || !validUrl || !ALLOWED_TYPES.includes(file_type) || Number(file_size) > maxBytes) {
    return res.status(400).json({ error: 'Invalid upload completion.' });
  }
  const expectedResourceType = resourceTypeFor(file_type);
  if (resource_type && resource_type !== expectedResourceType) {
    return res.status(400).json({ error: 'Invalid upload completion.' });
  }
  let verifiedAsset;
  try {
    verifiedAsset = await cloudinary.api.resource(public_id, { resource_type: expectedResourceType });
  } catch {
    return res.status(400).json({ error: 'Uploaded asset could not be verified.' });
  }
  const providerBytes = Number(verifiedAsset.bytes);
  if (
    verifiedAsset.public_id !== public_id
    || verifiedAsset.resource_type !== expectedResourceType
    || !Number.isFinite(providerBytes)
    || providerBytes <= 0
    || providerBytes > maxBytes
  ) {
    return res.status(400).json({ error: 'Uploaded asset metadata is invalid.' });
  }
  if (project_id) {
    const access = await query(
      `SELECT id FROM projects WHERE id = $1 AND (
        user_id = $2 OR id IN (
          SELECT project_id FROM project_collaborators WHERE user_id = $2 AND status = 'accepted'
        )
      )`,
      [project_id, req.user.id]
    );
    if (!access.rows[0]) return res.status(403).json({ error: 'You cannot attach media to that project.' });
  }
  const result = await query(
    `INSERT INTO media (user_id, project_id, cloudinary_id, url, thumbnail_url, filename, file_type, file_size, width, height, duration)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [req.user.id, project_id || null, public_id, verifiedAsset.secure_url || secure_url, expectedResourceType === 'image' ? (verifiedAsset.secure_url || secure_url) : null,
      String(original_filename || verifiedAsset.original_filename || public_id).slice(0, 300), file_type, providerBytes,
      Number(verifiedAsset.width || width) || null, Number(verifiedAsset.height || height) || null, Number(verifiedAsset.duration || duration) || null]
  );
  res.status(201).json({ media: result.rows[0], url: result.rows[0].url });
});

router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  let cursorDate = null;
  let cursorId = null;
  if (req.query.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
      cursorDate = decoded.created_at;
      cursorId = decoded.id;
    } catch { return res.status(400).json({ error: 'Invalid cursor.' }); }
  }
  const result = await query(
    `SELECT * FROM media WHERE user_id = $1
     AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
     ORDER BY created_at DESC, id DESC LIMIT $4`,
    [req.user.id, cursorDate, cursorId, limit + 1]
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  res.json({
    media: rows,
    has_more: hasMore,
    next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64url') : null,
  });
});

router.delete('/:id', requireAuth, userQuota('media.delete', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  const result = await query('DELETE FROM media WHERE id = $1 AND user_id = $2 RETURNING cloudinary_id, file_type', [req.params.id, req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Media not found.' });
  const job = await createJob({
    userId: req.user.id,
    type: 'media:delete',
    input: { cloudinaryId: result.rows[0].cloudinary_id, fileType: result.rows[0].file_type },
    idempotencyKey: `media-delete:${req.params.id}`,
  });
  res.status(202).json({ message: 'Media deletion queued.', job_id: job.id });
});

module.exports = router;
