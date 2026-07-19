// Renders an applicant context into a single-column, ATS-friendly resume as a
// self-contained HTML document with print CSS. The PDF step (browserPool) consumes
// this HTML unchanged, so everything must be inline — no external assets.

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Dates arrive as 'YYYY-MM-DD' strings from profile_experiences (to_char) but as
// Date objects from the projects query — normalize before slicing.
const dateStr = (value) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

const formatDateRange = (entry) => {
  const start = entry.start_date ? dateStr(entry.start_date).slice(0, 7) : '';
  const end = entry.is_current ? 'Present' : (entry.end_date ? dateStr(entry.end_date).slice(0, 7) : '');
  if (!start && !end) return '';
  return [start, end].filter(Boolean).join(' – ');
};

const listItems = (items) =>
  (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');

const experienceBlock = (entry) => {
  const dates = formatDateRange(entry);
  const meta = [entry.organization, entry.location].filter(Boolean).map(escapeHtml).join(' · ');
  const detailParts = [entry.field_of_study, entry.grade, entry.credential_id ? `Credential ${entry.credential_id}` : null]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  return `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${escapeHtml(entry.title)}</span>
        ${dates ? `<span class="entry-dates">${escapeHtml(dates)}</span>` : ''}
      </div>
      ${meta ? `<div class="entry-meta">${meta}</div>` : ''}
      ${detailParts ? `<div class="entry-meta">${detailParts}</div>` : ''}
      ${entry.description ? `<p class="entry-desc">${escapeHtml(entry.description)}</p>` : ''}
      ${entry.highlights && entry.highlights.length ? `<ul class="bullets">${listItems(entry.highlights)}</ul>` : ''}
    </div>`;
};

// Project descriptions carry the real substance of a student portfolio — clip to
// a resume-appropriate length rather than dropping them.
const clipDescription = (project, max = 260) => {
  const detail = String(project.description || '').trim().replace(/\s+/g, ' ');
  if (!detail) return '';
  return detail.length > max ? `${detail.slice(0, max).trim()}…` : detail;
};

const projectBlock = (project) => {
  const dates = formatDateRange(project);
  const tech = (project.technologies || []).map(escapeHtml).join(', ');
  const description = clipDescription(project);
  return `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${escapeHtml(project.title)}</span>
        ${dates ? `<span class="entry-dates">${escapeHtml(dates)}</span>` : ''}
      </div>
      ${project.tagline ? `<div class="entry-meta">${escapeHtml(project.tagline)}</div>` : ''}
      ${description ? `<p class="entry-desc">${escapeHtml(description)}</p>` : ''}
      ${tech ? `<div class="entry-meta">Technologies: ${tech}</div>` : ''}
    </div>`;
};

const section = (title, body) =>
  body && body.trim()
    ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>`
    : '';

// Content budgets: how much of each list survives in normal vs condensed mode.
// Condensed is the retry mode when the rendered PDF exceeds the platform's page cap.
const BUDGETS = {
  normal: { projects: 8, bulletsPerEntry: 12 },
  condensed: { projects: 3, bulletsPerEntry: 4 },
};

const buildResumeHTML = ({ context, platform, tailoring, condensed = false }) => {
  const budget = condensed ? BUDGETS.condensed : BUDGETS.normal;
  const profile = context.profile || {};
  const experiences = { ...(context.experiences || {}) };
  const projects = (context.projects || []).slice(0, budget.projects);
  experiences.employment = (experiences.employment || []).map((entry) => ({
    ...entry,
    highlights: (entry.highlights || []).slice(0, budget.bulletsPerEntry),
  }));

  const contactParts = [
    profile.contact_email || profile.email,
    profile.phone,
    profile.location,
    context.portfolio_url,
    profile.linkedin_url,
    profile.github_url,
  ].filter(Boolean).map(escapeHtml).join('  ·  ');

  const summaryText = tailoring?.professional_summary || '';

  const body = [
    section('Summary', summaryText ? `<p class="entry-desc">${escapeHtml(summaryText)}</p>` : ''),
    section('Experience', (experiences.employment || []).map(experienceBlock).join('')),
    section('Projects', projects.map(projectBlock).join('')),
    section('Education', (experiences.education || []).map(experienceBlock).join('')),
    section('Certifications', (experiences.certification || []).map(experienceBlock).join('')),
    section('Skills', (profile.skills || []).length
      ? `<p class="entry-desc">${(profile.skills || []).map(escapeHtml).join(', ')}</p>`
      : ''),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(profile.full_name || 'Resume')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    margin: 0;
    font-size: 10.5pt;
    line-height: 1.4;
  }
  header { border-bottom: 1.5pt solid #111; padding-bottom: 8pt; margin-bottom: 10pt; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  .headline { font-size: 11pt; margin: 0 0 4pt; }
  .contact { font-size: 9pt; color: #333; }
  h2 {
    font-size: 11pt; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 0.75pt solid #999; padding-bottom: 2pt; margin: 10pt 0 6pt;
  }
  .entry { margin-bottom: 7pt; page-break-inside: avoid; }
  .entry-head { display: flex; justify-content: space-between; }
  .entry-title { font-weight: bold; }
  .entry-dates { color: #333; font-size: 9.5pt; }
  .entry-meta { color: #333; font-size: 9.5pt; }
  .entry-desc { margin: 2pt 0; }
  ul.bullets { margin: 2pt 0 0 14pt; padding: 0; }
  ul.bullets li { margin-bottom: 1pt; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(profile.full_name || '')}</h1>
    ${profile.headline ? `<p class="headline">${escapeHtml(profile.headline)}</p>` : ''}
    ${contactParts ? `<p class="contact">${contactParts}</p>` : ''}
  </header>
  ${body}
</body>
</html>`;
};

const textEntry = (entry) => {
  const lines = [];
  const dates = formatDateRange(entry);
  lines.push(`${entry.title} — ${[entry.organization, entry.location].filter(Boolean).join(', ')}${dates ? ` (${dates})` : ''}`);
  const detail = [entry.field_of_study, entry.grade, entry.credential_id ? `Credential ${entry.credential_id}` : null]
    .filter(Boolean).join(' · ');
  if (detail) lines.push(detail);
  if (entry.description) lines.push(entry.description);
  for (const highlight of entry.highlights || []) lines.push(`- ${highlight}`);
  return lines.join('\n');
};

const buildPlainTextResume = ({ context, platform, tailoring, condensed = false }) => {
  const budget = condensed ? BUDGETS.condensed : BUDGETS.normal;
  const profile = context.profile || {};
  const experiences = context.experiences || {};
  const projects = (context.projects || []).slice(0, budget.projects);

  const parts = [];
  parts.push((profile.full_name || '').toUpperCase());
  if (profile.headline) parts.push(profile.headline);
  const contact = [
    profile.contact_email || profile.email,
    profile.phone,
    profile.location,
    context.portfolio_url,
    profile.linkedin_url,
    profile.github_url,
  ].filter(Boolean).join(' | ');
  if (contact) parts.push(contact);

  if (tailoring?.professional_summary) parts.push(`\nSUMMARY\n${tailoring.professional_summary}`);

  const sectionText = (label, entries) => {
    if (!entries || entries.length === 0) return null;
    return `\n${label}\n${entries.map(textEntry).join('\n\n')}`;
  };

  const employment = (experiences.employment || []).map((entry) => ({
    ...entry,
    highlights: (entry.highlights || []).slice(0, budget.bulletsPerEntry),
  }));

  const projectEntries = projects.map((project) => ({
    title: project.title,
    organization: project.tagline || '',
    description: clipDescription(project),
    highlights: (project.technologies || []).length ? [`Technologies: ${project.technologies.join(', ')}`] : [],
    start_date: project.start_date,
    end_date: project.end_date,
  }));

  const sections = [
    sectionText('EXPERIENCE', employment),
    sectionText('PROJECTS', projectEntries),
    sectionText('EDUCATION', experiences.education),
    sectionText('CERTIFICATIONS', experiences.certification),
    (profile.skills || []).length ? `\nSKILLS\n${profile.skills.join(', ')}` : null,
  ].filter(Boolean);

  return [parts.join('\n'), ...sections].join('\n');
};

module.exports = { buildResumeHTML, buildPlainTextResume };
