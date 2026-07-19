// Application Helper engine entry point. Assembles the versioned application
// package (the contract stored on application_sessions.package and consumed by the
// UI — and, later, a browser extension). Version rules: additive changes only within
// version 1; anything breaking bumps the number.

const PACKAGE_VERSION = 1;

const wordCount = (text) => String(text || '').split(/\s+/).filter(Boolean).length;

const assemblePackage = ({ context, platform, session, tailoring, resume, jobAnalyzed }) => {
  const profile = context.profile || {};
  return {
    version: PACKAGE_VERSION,
    generated_at: new Date().toISOString(),
    platform: {
      slug: platform.slug,
      name: platform.name,
      capabilities: platform.capabilities,
      resume: platform.resume,
      coverLetter: platform.coverLetter,
      tips: platform.tips || [],
    },
    job: {
      title: session.job_title || null,
      company: session.company || null,
      posting_url: session.job_posting_url || null,
      analyzed: jobAnalyzed === true,
      keywords: tailoring.keywords || [],
      emphasis: tailoring.emphasis || [],
    },
    candidate: {
      full_name: profile.full_name || null,
      email: profile.contact_email || profile.email || null,
      phone: profile.phone || null,
      location: profile.location || null,
      links: {
        portfolio: context.portfolio_url || null,
        linkedin: profile.linkedin_url || null,
        github: profile.github_url || null,
        website: profile.website || null,
      },
    },
    resume: {
      pdf_url: resume.pdf_url || null,
      filename: resume.filename || null,
      format: 'pdf',
      pages: resume.pages || null,
      plain_text: resume.plain_text || '',
    },
    cover_letter: {
      text: tailoring.cover_letter || '',
      word_count: wordCount(tailoring.cover_letter),
      format: platform.coverLetter.format,
      source: tailoring.source,
    },
    snippets: {
      skills_summary: tailoring.skills_summary || '',
      professional_summary: tailoring.professional_summary || '',
      project_summary: tailoring.project_summary || '',
      experience_bullets: tailoring.experience_bullets || [],
    },
    meta: {
      session_id: session.id,
      model_id: tailoring.model_id || null,
      fallback: tailoring.source !== 'ai',
      fallback_reason: tailoring.fallback_reason || null,
    },
  };
};

// Counts pages in a rendered PDF buffer. Heuristic (string scan for page objects),
// good enough to decide whether a condensed re-render is needed.
const countPdfPages = (pdfBuffer) => {
  const matches = String(pdfBuffer).match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
};

const slugify = (value) =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resume';

const renderResumePdf = async (html) => {
  const browserPool = require('../utils/browserPool');
  return browserPool.withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    return page.pdf({ format: 'A4', printBackground: true });
  });
};

const uploadPdf = (pdfBuffer, publicId) => {
  const { cloudinary } = require('../config/cloudinary');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'projectfolio/applications', resource_type: 'raw', public_id: publicId, overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(pdfBuffer);
  });
};

const fetchJobPostingText = async (url) => {
  if (!url) return null;
  try {
    const safeFetch = require('../utils/safeFetch');
    const { compactText } = require('../utils/portfolioAiContext');
    const response = await safeFetch.safeFetchText(url, { maxBytes: 1024 * 1024, timeoutMs: 10000 });
    const raw = response && (response.text || response.body);
    if (!raw) return null;
    const stripped = String(raw)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped ? compactText(stripped, 9000) : null;
  } catch {
    return null; // job analysis is best-effort; generation continues without it
  }
};

const runApplicationGenerateJob = async (input, { jobId, updateProgress }) => {
  const db = require('../config/database');
  const contextModule = require('./context');
  const coverLetterModule = require('./coverLetter');
  const { buildResumeHTML, buildPlainTextResume } = require('./resumeRenderer');
  const { getPlatform } = require('./platforms');

  const sessionResult = await db.query('SELECT * FROM application_sessions WHERE id = $1', [input.sessionId]);
  const session = sessionResult.rows[0];
  if (!session) throw new Error('Application session not found.');
  if (session.user_id !== input.userId) throw new Error('Application session does not belong to this user.');

  try {
    const platform = getPlatform(session.platform);
    const context = await contextModule.buildApplicationContext(session.user_id);
    await updateProgress(10);

    const jobText = await fetchJobPostingText(session.job_posting_url);
    await updateProgress(25);

    const tailoring = await coverLetterModule.generateCoverLetter({ context, jobText, session, platform });
    await updateProgress(50);

    let condensed = false;
    let html = buildResumeHTML({ context, platform, tailoring, condensed });
    let pdf = await renderResumePdf(html);
    let pages = countPdfPages(pdf);
    if (pages > platform.resume.maxPages) {
      condensed = true;
      html = buildResumeHTML({ context, platform, tailoring, condensed });
      pdf = await renderResumePdf(html);
      pages = countPdfPages(pdf);
    }
    await updateProgress(75);

    const filename = `${slugify(context.profile?.full_name)}-${platform.slug}-resume.pdf`;
    const uploaded = await uploadPdf(pdf, `${session.user_id}-${session.id}.pdf`);
    await updateProgress(90);

    const pkg = assemblePackage({
      context,
      platform,
      session,
      tailoring,
      resume: {
        // Authenticated API route — Cloudinary blocks unsigned public PDF delivery,
        // and resumes are personal data so they shouldn't be on a public URL anyway.
        pdf_url: `/api/applications/${session.id}/resume`,
        filename,
        pages,
        plain_text: buildPlainTextResume({ context, platform, tailoring, condensed }),
      },
      jobAnalyzed: Boolean(jobText),
    });

    await db.query(
      `UPDATE application_sessions
       SET package = $2, resume_url = $3, status = 'ready', error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [session.id, JSON.stringify(pkg), uploaded.secure_url]
    );
    await updateProgress(100);

    return { session_id: session.id, package: pkg };
  } catch (error) {
    await db.query(
      `UPDATE application_sessions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [session.id, String(error.message || error)]
    ).catch(() => {});
    throw error;
  }
};

module.exports = { assemblePackage, PACKAGE_VERSION, runApplicationGenerateJob, countPdfPages };
