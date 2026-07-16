const express = require('express');
const jobsService = require('../jobs/service');
const { requireAuth } = require('../middleware/auth');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
const { parseRepoUrl } = require('../utils/githubImport');

const router = express.Router();

// Validate + parse the repo URL, then enqueue a github-import job. The transform
// (several GitHub calls) runs in the worker, so this returns 202 + job_id and the
// frontend polls /api/jobs/:id (the established pattern).
const createImport = async (req, res, next) => {
  try {
    let parsed;
    try {
      parsed = parseRepoUrl(req.body.url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const job = await jobsService.createJob({
      userId: req.user.id,
      type: 'github-import',
      input: { userId: req.user.id, url: req.body.url, owner: parsed.owner, repo: parsed.repo },
      idempotencyKey: req.get('Idempotency-Key') || null,
    });

    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (error) {
    next(error);
  }
};

router.post('/github', requireAuth, validateSchema({
  body: { url: s.string({ required: true, max: 500 }) },
}), userQuota('import.github', { windowMs: 60 * 60 * 1000, max: 20, message: 'Too many imports this hour. Please wait and try again.' }), createImport);

router.handlers = { createImport };

module.exports = router;
