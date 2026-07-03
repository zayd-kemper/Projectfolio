// frontend/src/pages/PortfolioSettingsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../utils/api';
import { resolveJobResponse } from '../utils/jobs';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { LAYOUTS } from '../utils/layouts';
import LayoutPreview from '../components/portfolio/LayoutPreview';
import CodeMirror from '@uiw/react-codemirror';
import { css as cmCss } from '@codemirror/lang-css';
import { javascript as cmJs } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import ActiveProgress from '../components/shared/ActiveProgress';

const THEMES = [
  { id: 'clean',   label: 'Clean',   desc: 'White background, minimal' },
  { id: 'bold',    label: 'Bold',    desc: 'Strong typography, high contrast' },
  { id: 'minimal', label: 'Minimal', desc: 'Extra whitespace, subtle' },
];

const ACCENTS = ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2', '#db2777'];

const DEFAULT_AGENT_MODES = [
  { id: 'auto', name: 'Auto', description: 'Route this request automatically.' },
  { id: 'fast', name: 'Fast edits', description: 'Small CSS, copy, and settings changes.' },
  { id: 'midUi', name: 'Mid-sized UI', description: 'Focused sections, layout, CSS, and safe interactions.' },
  { id: 'largeUi', name: 'Large UI build', description: 'Complex redesigns and advanced UI bundles.' },
  { id: 'design', name: 'Design planning', description: 'Brief, site plan, UX, and visual direction.' },
  { id: 'code', name: 'Advanced code', description: 'Implementation-heavy CSS, animations, and safe interactions.' },
  { id: 'critic', name: 'Critic', description: 'Accessibility, responsiveness, and compatibility review.' },
];

// The full set of sections a portfolio can have, with metadata
const ALL_SECTIONS = {
  header:       { label: 'Profile header',          desc: 'Avatar, name, headline, bio, skills',      icon: 'team-node', required: true },
  projects:     { label: 'Projects',                desc: 'Your published project grid',              icon: 'project-module', required: true },
  education:    { label: 'Education & Credentials', desc: 'Degrees, certifications, and awards',      icon: 'education', required: false },
  contact:      { label: 'Contact section',         desc: 'Email, LinkedIn, website links',           icon: 'mail', required: false },
  endorsements: { label: 'Endorsements',            desc: 'Verified testimonials from your network',  icon: 'award-badge', required: false },
};

const CRED_TYPES = [
  { id: 'degree', label: 'Degree',        icon: 'education' },
  { id: 'cert',   label: 'Certification', icon: 'certificate' },
  { id: 'award',  label: 'Award',         icon: 'award-badge' },
  { id: 'course', label: 'Course',        icon: 'book-stack' },
];

const BLANK_CRED = () => ({
  id: `cred_${Date.now()}`,
  type: 'degree',
  title: '',
  institution: '',
  field: '',
  year_start: '',
  year_end: '',
  honors: '',
  url: '',
});

const DEFAULT_ORDER = ['header', 'projects', 'contact'];

const CUSTOM_SITE_LIMITS = { html: 120000, css: 80000, js: 80000, total: 240000 };

const htmlEscape = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const safeJsonForScript = (value) => JSON.stringify(value || {})
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const escapeScriptClose = (value = '') => String(value).replace(/<\/script/gi, '<\\/script');

const normalizeProjectArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.split(',').map(item => item.trim()).filter(Boolean);
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const buildCustomSiteData = (user, projects = [], settings = {}) => ({
  user: {
    id: user?.id || '',
    full_name: user?.full_name || '',
    username: user?.username || '',
    headline: user?.headline || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    location: user?.location || '',
    website: user?.website || '',
    linkedin_url: user?.linkedin_url || '',
    github_url: user?.github_url || '',
    skills: normalizeProjectArray(user?.skills),
  },
  settings: {
    theme: settings.theme || 'clean',
    accent_color: settings.accent_color || '#2563eb',
    layout: settings.layout || 'classic',
  },
  projects: (projects || []).map(project => ({
    id: project.id,
    title: project.title,
    slug: project.slug,
    tagline: project.tagline || '',
    description: project.description || '',
    cover_image_url: project.cover_image_url || '',
    technologies: normalizeProjectArray(project.technologies),
    project_type: project.project_type || '',
    is_featured: project.is_featured === true,
    start_date: project.start_date || '',
    end_date: project.end_date || '',
    github_url: project.github_url || '',
    live_url: project.live_url || '',
    url: user?.username && project.slug ? `/${user.username}/${project.slug}` : '#',
  })),
});

const buildStarterCustomSite = (user, projects = [], settings = {}) => {
  const siteData = buildCustomSiteData(user, projects, settings);
  const displayName = siteData.user.full_name || 'Your Name';
  const headline = siteData.user.headline || 'Engineer and builder';
  return {
    html: `<main class="site-shell">
  <section class="hero">
    <p class="eyebrow">@${htmlEscape(siteData.user.username || 'username')}</p>
    <h1>${htmlEscape(displayName)}</h1>
    <p class="headline">${htmlEscape(headline)}</p>
    <p class="bio">${htmlEscape(siteData.user.bio || 'A custom ProjectFolio site powered by your profile and project data.')}</p>
    <div class="actions">
      <a href="#projects">View projects</a>
      ${siteData.user.github_url ? `<a href="${htmlEscape(siteData.user.github_url)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ''}
    </div>
  </section>

  <section id="projects" class="projects" aria-label="Projects">
    <div class="section-heading">
      <h2>Selected work</h2>
      <p data-project-count>${siteData.projects.length} project${siteData.projects.length === 1 ? '' : 's'}</p>
    </div>
    <div class="project-grid" data-projects></div>
  </section>
</main>`,
    css: `:root {
  color-scheme: light;
  --accent: ${settings.accent_color || '#2563eb'};
  --ink: #111827;
  --muted: #667085;
  --line: #e5e7eb;
  --surface: #ffffff;
  --bg: #f8fafc;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--ink);
}
a { color: inherit; }
.site-shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 64px 0;
}
.hero {
  display: grid;
  gap: 18px;
  padding: 56px 0 44px;
  border-bottom: 1px solid var(--line);
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  font: 700 0.78rem/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  letter-spacing: 0;
}
h1 {
  margin: 0;
  max-width: 840px;
  font-size: clamp(2.6rem, 7vw, 5.8rem);
  line-height: 0.95;
  letter-spacing: 0;
}
.headline {
  margin: 0;
  max-width: 680px;
  font-size: 1.25rem;
  color: var(--muted);
}
.bio {
  margin: 0;
  max-width: 720px;
  color: #374151;
  line-height: 1.7;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
}
.actions a {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-decoration: none;
  font-weight: 700;
}
.actions a:first-child {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.projects {
  padding: 42px 0 0;
}
.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.5rem;
}
.section-heading p {
  margin: 0;
  color: var(--muted);
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}
.project-card {
  display: grid;
  gap: 12px;
  min-height: 190px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-decoration: none;
}
.project-card:hover {
  border-color: color-mix(in srgb, var(--accent), #ffffff 35%);
}
.project-card h3 {
  margin: 0;
  font-size: 1.1rem;
}
.project-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}
.tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
@media (max-width: 640px) {
  .site-shell { padding: 32px 0; }
  .hero { padding-top: 28px; }
  .section-heading { align-items: start; flex-direction: column; }
}`,
    js: `const { projects } = window.ProjectFolioData;
const grid = document.querySelector('[data-projects]');
const count = document.querySelector('[data-project-count]');

if (count) {
  count.textContent = projects.length + ' project' + (projects.length === 1 ? '' : 's');
}

if (grid) {
  grid.innerHTML = '';
  projects.forEach((project) => {
    const card = document.createElement('a');
    card.className = 'project-card';
    card.href = project.url;

    const title = document.createElement('h3');
    title.textContent = project.title;
    card.appendChild(title);

    if (project.tagline) {
      const tagline = document.createElement('p');
      tagline.textContent = project.tagline;
      card.appendChild(tagline);
    }

    const tags = document.createElement('div');
    tags.className = 'tags';
    project.technologies.slice(0, 5).forEach((tech) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tech;
      tags.appendChild(tag);
    });
    card.appendChild(tags);
    grid.appendChild(card);
  });
}`,
  };
};

const validateCustomSiteClient = ({ html = '', css = '', js = '' }, enabled = false) => {
  const errors = [];
  const addIf = (condition, field, message) => { if (condition) errors.push({ field, message }); };
  addIf(enabled && !html.trim(), 'HTML', 'HTML is required before publishing.');
  addIf(html.length > CUSTOM_SITE_LIMITS.html, 'HTML', `HTML must be ${CUSTOM_SITE_LIMITS.html.toLocaleString()} characters or fewer.`);
  addIf(css.length > CUSTOM_SITE_LIMITS.css, 'CSS', `CSS must be ${CUSTOM_SITE_LIMITS.css.toLocaleString()} characters or fewer.`);
  addIf(js.length > CUSTOM_SITE_LIMITS.js, 'JavaScript', `JavaScript must be ${CUSTOM_SITE_LIMITS.js.toLocaleString()} characters or fewer.`);
  addIf(html.length + css.length + js.length > CUSTOM_SITE_LIMITS.total, 'Custom site', `Combined code must be ${CUSTOM_SITE_LIMITS.total.toLocaleString()} characters or fewer.`);
  addIf(/<\s*script\b/i.test(html), 'HTML', 'Move scripts into script.js; <script> tags are blocked.');
  addIf(/\son[a-z]+\s*=/i.test(html), 'HTML', 'Inline event handlers are blocked.');
  addIf(/<\s*(iframe|object|embed|base|form)\b/i.test(html), 'HTML', 'Iframe, object, embed, base, and form tags are blocked.');
  addIf(/<\s*link\b/i.test(html), 'HTML', 'External linked resources are blocked.');
  addIf(/\b(?:href|src|srcset|action)\s*=\s*(['"]?)\s*(javascript:|data:text\/html)/i.test(html), 'HTML', 'javascript: and data:text/html URLs are blocked.');
  addIf(/@import\b|expression\s*\(|url\s*\(\s*(['"]?)\s*(javascript:|data:text\/html)|<\/?style\b/i.test(css), 'CSS', 'Imports, script URLs, expression(), and style tags are blocked.');
  addIf(/\b(?:window\.)?(?:top|parent|opener)\b|\bpostMessage\s*\(|\bdocument\s*\.\s*cookie\b|\b(?:localStorage|sessionStorage|indexedDB)\b|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|\bnavigator\s*\.\s*sendBeacon\b|\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(|^\s*import\s.+from\s+['"]|\bset(?:Timeout|Interval)\s*\(\s*['"`]/im.test(js), 'JavaScript', 'Parent-window, network, storage, eval, imports, cookies, and string timers are blocked.');
  return errors;
};

const buildCustomSitePreviewDocument = ({ html = '', css = '', js = '' }, data = {}) => {
  const nonce = 'projectfolio-preview';
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src https: data: blob:",
    "font-src https: data:",
    "media-src https: data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${htmlEscape(csp)}">
  <style nonce="${nonce}">html,body{min-height:100%;margin:0}${css}</style>
  <script nonce="${nonce}">window.ProjectFolioData=Object.freeze(${safeJsonForScript(data)});</script>
</head>
<body>
${html}
<script nonce="${nonce}">
"use strict";
try {
${escapeScriptClose(js)}
} catch (error) {
  console.error("ProjectFolio custom-site preview error:", error);
}
</script>
</body>
</html>`;
};

const getChangeSetTime = (changeSet = {}) => {
  const value = new Date(changeSet.applied_at || changeSet.created_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

const mergeAgentChangeSets = (...groups) => {
  const byId = new Map();
  groups.flat().filter(Boolean).forEach((changeSet) => {
    if (!changeSet?.id) return;
    const previous = byId.get(changeSet.id) || {};
    byId.set(changeSet.id, {
      ...previous,
      ...changeSet,
      preview: changeSet.preview ?? previous.preview,
    });
  });
  return [...byId.values()].sort((a, b) => getChangeSetTime(b) - getChangeSetTime(a));
};

function AiFeedbackPanel({ feedback }) {
  if (!feedback) return null;

  const attempts = Array.isArray(feedback.attempts) ? feedback.attempts : [];
  const summary = feedback.summary || {};
  const changedItems = [
    ...(summary.themeOverrideKeys || []).map(key => `Style: ${key.replace(/([A-Z])/g, ' $1').trim()}`),
    ...(summary.animationKeys || []).map(key => `Animation: ${key.replace(/([A-Z])/g, ' $1').trim()}`),
    ...(summary.cssBlockIds || []).map(id => `CSS block: ${id}`),
    ...(summary.jsBlockIds || []).map(id => `JS block: ${id}`),
    ...(summary.removedBlockIds || []).map(id => `Removed block: ${id}`),
  ];
  if (summary.cssChanged && changedItems.length === 0) changedItems.push('Custom CSS changed');
  if (summary.jsChanged && changedItems.length === 0) changedItems.push('Custom JS changed');

  const statusText = {
    completed: 'Passed validation on the first attempt.',
    repaired: 'The first draft had issues; the AI fixed them after retry feedback.',
    completed_with_warnings: 'Generated after validation feedback, but review the warnings before applying.',
    provider_error: 'The AI provider could not complete this request.',
    failed: 'The AI could not produce valid code after retries.',
    running: 'Generation is in progress.',
  }[feedback.status] || 'Generation finished.';

  const panelClass = feedback.status === 'failed' || feedback.status === 'provider_error'
    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
    : feedback.status === 'repaired' || feedback.status === 'completed_with_warnings'
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
      : 'border-accent-border bg-accent-surface';

  return (
    <div className={`rounded-xl border ${panelClass} p-3 space-y-3`}>
      <div>
        <p className="text-xs font-semibold text-ink">AI generation feedback</p>
        <p className="text-xs text-ink-muted mt-0.5">{statusText}</p>
      </div>

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          {attempts.map((entry) => {
            const errors = Array.isArray(entry.errors) ? entry.errors : [];
            const warnings = Array.isArray(entry.warnings) ? entry.warnings : [];
            return (
              <div key={`${entry.attempt}-${entry.status}`} className="rounded-lg bg-white/70 border border-white/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink">Attempt {entry.attempt}</span>
                  <span className="text-[10px]  text-ink-muted">{String(entry.status || '').replace(/_/g, ' ')}</span>
                </div>
                {entry.message && <p className="text-[11px] text-ink-muted mt-1">{entry.message}</p>}
                {errors.slice(0, 3).map((error, i) => (
                  <p key={i} className="text-[11px] text-red-700 dark:text-red-300 mt-1">{error}</p>
                ))}
                {warnings.slice(0, 2).map((warning, i) => (
                  <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">{warning}</p>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {changedItems.length > 0 && (
        <div>
          <p className="text-[10px] font-bold  text-ink-muted mb-1">What changed</p>
          <div className="flex flex-wrap gap-1.5">
            {changedItems.slice(0, 8).map((item) => (
              <span key={item} className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 text-ink-secondary border border-line">
                {item}
              </span>
            ))}
            {changedItems.length > 8 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 text-ink-muted border border-line">
                +{changedItems.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentWarningPanel({ warning, onDismiss }) {
  if (!warning) return null;
  const details = Array.isArray(warning.details) ? warning.details.filter(Boolean) : [];

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{warning.title || 'AI Editor needs a retry'}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{warning.message}</p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs text-amber-700 dark:text-amber-300 hover:underline flex-shrink-0">
            Dismiss
          </button>
        )}
      </div>
      {details.length > 0 && (
        <ul className="mt-2 space-y-1">
          {details.slice(0, 4).map((detail, index) => (
            <li key={`${detail}-${index}`} className="text-[11px] text-amber-800 dark:text-amber-200">
              {detail}
            </li>
          ))}
          {details.length > 4 && (
            <li className="text-[11px] text-amber-700 dark:text-amber-300">+{details.length - 4} more issue{details.length - 4 === 1 ? '' : 's'}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function CodeComparePanel({ title, before = '', after = '' }) {
  const beforeLines = String(before || '').split('\n').slice(0, 28);
  const afterLines = String(after || '').split('\n').slice(0, 28);
  const changed = before !== after;

  if (!changed) return null;

  return (
    <details className="rounded-xl border border-line bg-white/70">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-ink-secondary">
        {title} before/after
      </summary>
      <div className="grid md:grid-cols-2 gap-0 border-t border-line">
        <div className="p-3 border-b md:border-b-0 md:border-r border-line">
          <p className="text-[10px] font-bold  text-ink-muted mb-1">Current saved</p>
          <pre className="text-[11px] bg-gray-950 text-ink-faint rounded-lg p-3 overflow-x-auto max-h-64">{beforeLines.join('\n') || 'No code yet'}{String(before || '').split('\n').length > 28 ? '\n/* ... */' : ''}</pre>
        </div>
        <div className="p-3">
          <p className="text-[10px] font-bold  text-green-700 dark:text-green-400 mb-1">AI preview</p>
          <pre className="text-[11px] bg-gray-950 text-green-300 rounded-lg p-3 overflow-x-auto max-h-64">{afterLines.join('\n') || 'No code'}{String(after || '').split('\n').length > 28 ? '\n/* ... */' : ''}</pre>
        </div>
      </div>
    </details>
  );
}

function AgentDesignPlan({ designBrief, sitePlan, designSystem, critique }) {
  const sections = Array.isArray(sitePlan?.sections) ? sitePlan.sections : [];
  const tokens = designSystem?.tokens && typeof designSystem.tokens === 'object' ? designSystem.tokens : {};
  const variants = designSystem?.componentVariants && typeof designSystem.componentVariants === 'object' ? designSystem.componentVariants : {};
  const hasPlan = designBrief || sitePlan || designSystem;
  const critiqueNotes = Array.isArray(critique?.notes) ? critique.notes : [];

  if (!hasPlan) return null;

  return (
    <div className="rounded-xl border border-accent-border bg-white/80 p-3 space-y-3">
      <div>
        <p className="text-[10px] font-bold  text-accent-text">Design plan</p>
        <p className="text-xs text-ink-secondary mt-1">
          {designBrief?.goal || 'The agent planned this bundle before generating the final edits.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-2">
        {designBrief && (
          <div className="rounded-lg bg-accent-surface p-2">
            <p className="text-[10px] font-semibold uppercase text-accent-text">Direction</p>
            <p className="text-xs text-ink-secondary mt-1">{designBrief.styleDirection || 'custom'}</p>
            {designBrief.tone && <p className="text-[11px] text-ink-muted mt-1">{designBrief.tone}</p>}
          </div>
        )}
        {sitePlan && (
          <div className="rounded-lg bg-accent-surface p-2">
            <p className="text-[10px] font-semibold uppercase text-accent-text">Hierarchy</p>
            <p className="text-xs text-ink-secondary mt-1">
              {(sitePlan.contentHierarchy || []).join(' -> ') || 'identity -> proof -> contact'}
            </p>
            {sitePlan.primaryCta && <p className="text-[11px] text-ink-muted mt-1">CTA: {sitePlan.primaryCta}</p>}
          </div>
        )}
        {designSystem && (
          <div className="rounded-lg bg-accent-surface p-2">
            <p className="text-[10px] font-semibold uppercase text-accent-text">System</p>
            <p className="text-xs text-ink-secondary mt-1">{designSystem.direction || 'custom'}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {Object.keys(tokens).length} token{Object.keys(tokens).length === 1 ? '' : 's'}, {Object.keys(variants).length} variant{Object.keys(variants).length === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-accent-text mb-1">Planned sections</p>
          <div className="grid lg:grid-cols-2 gap-2">
            {sections.slice(0, 6).map((section) => (
              <div key={section.id} className="rounded-lg border border-accent-border bg-white/70 p-2">
                <p className="text-xs font-medium text-ink">{section.id}</p>
                <p className="text-[11px] text-ink-muted">{section.role || section.type || 'section'}</p>
                {section.layoutIntent && <p className="text-[11px] text-ink-muted mt-1">{section.layoutIntent}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {critiqueNotes.length > 0 && (
        <div className="rounded-lg border border-green-100 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-2">
          <p className="text-[10px] font-semibold uppercase text-green-700 dark:text-green-300">Quality checks</p>
          <ul className="mt-1 space-y-0.5">
            {critiqueNotes.slice(0, 4).map((note, index) => (
              <li key={`${note}-${index}`} className="text-[11px] text-green-800 dark:text-green-200">{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AgentBrowserVerificationPanel({ verification }) {
  if (!verification) return null;

  const checks = Array.isArray(verification.checks) ? verification.checks : [];
  const warnings = Array.isArray(verification.warnings) ? verification.warnings : [];
  const errors = Array.isArray(verification.errors) ? verification.errors : [];
  const status = verification.status || 'skipped';
  const statusCopy = {
    passed: 'Desktop and mobile smoke checks passed.',
    warning: 'Browser checks passed with notes.',
    failed: 'Browser checks found issues before apply.',
    skipped: 'Browser checks were skipped.',
  }[status] || 'Browser verification finished.';
  const panelClass = status === 'failed'
    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
    : status === 'warning' || status === 'skipped'
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
      : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20';
  const labelClass = status === 'failed'
    ? 'text-red-700 dark:text-red-300'
    : status === 'warning' || status === 'skipped'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-green-700 dark:text-green-300';

  return (
    <div className={`rounded-xl border ${panelClass} p-3 space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold  text-ink-muted">Browser verification</p>
          <p className="text-xs text-ink mt-0.5">{statusCopy}</p>
        </div>
        <span className={`text-[10px] font-bold  ${labelClass}`}>{status}</span>
      </div>

      {checks.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-2">
          {checks.map((check) => (
            <div key={`${check.page || 'page'}-${check.viewport}`} className="rounded-lg bg-white/70 border border-white/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink">{check.page ? `${check.page} / ` : ''}{check.viewport}</span>
                <span className={`text-[10px] uppercase ${check.status === 'passed' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>{check.status}</span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1">
                {check.width}x{check.height}, {check.projectCardCount || 0} card{check.projectCardCount === 1 ? '' : 's'}, overflow {check.horizontalOverflow || 0}px
              </p>
              {check.screenshot && (
                <p className="text-[10px] text-ink-faint mt-0.5">
                  screenshot {check.screenshot.likelyNonBlank ? 'nonblank' : 'unclear'} - {Math.round((check.screenshot.bytes || 0) / 1024)} KB
                </p>
              )}
              {check.screenshot?.path && (
                <p className="text-[10px] text-ink-faint mt-0.5 truncate" title={check.screenshot.path}>
                  artifact: {check.screenshot.path}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {errors.slice(0, 4).map((error, index) => (
        <p key={`${error}-${index}`} className="text-[11px] text-red-700 dark:text-red-300">{error}</p>
      ))}
      {!errors.length && warnings.slice(0, 3).map((warning, index) => (
        <p key={`${warning}-${index}`} className="text-[11px] text-amber-700 dark:text-amber-300">{warning}</p>
      ))}
    </div>
  );
}

function AgentInteractionRecipes({ interactions = [] }) {
  const items = Array.isArray(interactions) ? interactions.filter(Boolean) : [];
  if (!items.length) return null;

  const describe = (recipe) => {
    if (recipe.type === 'scrollReveal') return `${recipe.effect || 'fadeUp'} reveal on ${recipe.target || '.pf-section'}`;
    if (recipe.type === 'cardTilt') return `${recipe.strength || 'subtle'} tilt on ${recipe.target || '.pf-project-card'}`;
    if (recipe.type === 'cursorGlow') return `cursor glow ${recipe.size || 180}px / ${recipe.opacity ?? 0.16}`;
    if (recipe.type === 'ambientParticles') return `${recipe.density || 'low'} ambient particles`;
    if (recipe.type === 'navAutoHide') return `auto-hide navigation after ${recipe.threshold || 24}px scroll`;
    return recipe.type || 'interaction';
  };

  return (
    <div className="rounded-xl border border-accent-border bg-accent-surface p-3">
      <p className="text-[10px] font-bold  text-accent-text">Native interaction recipes</p>
      <p className="text-[11px] text-accent-text mt-1">
        These run through ProjectFolio's safe renderer instead of raw generated JavaScript.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.slice(0, 6).map((recipe, index) => (
          <span key={`${recipe.type}-${index}`} className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 text-accent-text border border-accent-border">
            {describe(recipe)}
          </span>
        ))}
      </div>
    </div>
  );
}

const postPreviewPayloadToFrame = (frame, payload) => {
  if (!frame?.contentWindow) return;
  const requestId = payload.requestId || `pf-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = { ...payload, requestId };
  let attempts = 0;
  let done = false;
  let timer = null;
  const cleanup = () => {
    done = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('message', onAck);
  };
  const onAck = (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type !== 'pf-preview-applied') return;
    if (event.data.requestId && event.data.requestId !== requestId) return;
    cleanup();
  };
  const send = () => {
    if (done) return;
    attempts += 1;
    try { frame.contentWindow.postMessage(message, '*'); } catch {}
    if (attempts < 8) timer = setTimeout(send, 180);
    else cleanup();
  };
  window.addEventListener('message', onAck);
  send();
};

function AgentChangeSetReview({ changeSet, onApply, onDiscard, applying, user, settings }) {
  const [previewSynced, setPreviewSynced] = useState(false);
  const changeSetId = changeSet?.id || null;

  useEffect(() => {
    setPreviewSynced(false);
    const onMessage = (event) => {
      if (event.data?.type === 'pf-preview-applied') setPreviewSynced(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [changeSetId]);

  if (!changeSet) return null;
  const actions = Array.isArray(changeSet.actions) ? changeSet.actions : [];
  const customization = changeSet.preview?.customization;
  const designBrief = changeSet.preview?.designBrief;
  const sitePlan = changeSet.preview?.sitePlan;
  const designSystem = changeSet.preview?.designSystem;
  const critique = changeSet.preview?.critique;
  const modelRouting = changeSet.preview?.modelRouting;
  const browserStatus = changeSet.preview?.browserVerification?.status;
  const browserBlocked = browserStatus !== 'passed';
  const settingsPatch = actions.find((action) => action.type === 'settings.patch')?.patch || {};
  const previewSettings = {
    theme: settingsPatch.theme ?? settings.theme,
    accent_color: settingsPatch.accent_color ?? settings.accent_color,
    layout: settingsPatch.layout ?? settings.layout,
    section_order: settingsPatch.section_order ?? settings.section_order,
    section_config: settingsPatch.section_config ?? settings.section_config,
    site_sections: settingsPatch.site_sections ?? settings.site_sections,
  };
  const plannedInteractions = actions.flatMap((action) => (
    action.type === 'settings.patch' && Array.isArray(action.patch?.interactions) ? action.patch.interactions : []
  ));

  const repairAttempts = Array.isArray(changeSet.preview?.repairAttempts) ? changeSet.preview.repairAttempts : [];
  const bundleWarnings = [
    ...(Array.isArray(changeSet.preview?.warnings) ? changeSet.preview.warnings : []),
    ...repairAttempts.flatMap(attempt => Array.isArray(attempt.warnings) ? attempt.warnings : []),
  ].filter(Boolean);
  const repaired = repairAttempts.some(attempt => String(attempt.status || '').includes('retrying') || attempt.status === 'local_fallback');
  const groups = {
    Design: ['settings.patch', 'customization.patch'],
    Profile: ['profile.patch'],
    Sections: ['settings.patch'],
    Projects: ['project.create', 'project.patch', 'project.reorder'],
    Blocks: ['block.create', 'block.patch', 'block.delete', 'block.reorder'],
    Memory: ['memory.upsert'],
  };

  const describeAction = (action) => {
    if (action.type === 'settings.patch') {
      const keys = Object.keys(action.patch || {});
      return `Settings: ${keys.join(', ') || 'update'}`;
    }
    if (action.type === 'customization.patch') return 'Advanced styling/code patch';
    if (action.type === 'profile.patch') return `Profile: ${Object.keys(action.patch || {}).join(', ')}`;
    if (action.type === 'project.create') return `Create project: ${action.project?.title || 'Untitled'}`;
    if (action.type === 'project.patch') return `Update project: ${action.slug || action.projectId || 'selected project'}`;
    if (action.type === 'project.reorder') return 'Reorder projects';
    if (action.type === 'block.create') return `Add ${action.block?.type || 'content'} block`;
    if (action.type === 'block.patch') return 'Update project block';
    if (action.type === 'block.delete') return 'Delete project block';
    if (action.type === 'block.reorder') return 'Reorder project blocks';
    if (action.type === 'memory.upsert') return `Remember: ${String(action.content || '').slice(0, 90)}`;
    return action.type;
  };

  return (
    <div className="rounded-xl border border-accent-border bg-accent-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-accent-text">Review AI Editor changes</p>
          <p className="text-xs text-accent-text mt-0.5">{changeSet.summary || 'The AI Editor prepared a bundle for review.'}</p>
          {modelRouting && (
            <p className="text-[11px] text-accent-text mt-1">
              Mode: {modelRouting.mode || 'auto'} - Model: {modelRouting.modelId || changeSet.model_id}{modelRouting.routed ? ' - routed from selected preference' : ''}
            </p>
          )}
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 text-accent-text">
          {actions.length} action{actions.length === 1 ? '' : 's'}
        </span>
      </div>

      {(repaired || bundleWarnings.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            {repaired ? 'AI repaired this bundle before review.' : 'Review notes'}
          </p>
          {bundleWarnings.slice(0, 3).map((warning, index) => (
            <p key={`${warning}-${index}`} className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">{warning}</p>
          ))}
        </div>
      )}

      <AgentDesignPlan designBrief={designBrief} sitePlan={sitePlan} designSystem={designSystem} critique={critique} />
      <AgentBrowserVerificationPanel verification={changeSet.preview?.browserVerification} />
      <AgentInteractionRecipes interactions={plannedInteractions.length ? plannedInteractions : changeSet.preview?.interactions} />
      {browserBlocked && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs font-semibold text-red-800 dark:text-red-200">Apply blocked by browser verification.</p>
          <p className="text-[11px] text-red-700 dark:text-red-300 mt-1">
            Ask the agent to revise this bundle or discard it. This protects your public portfolio from a change that failed the desktop/mobile render check.
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-2">
        {Object.entries(groups).map(([label, types]) => {
          const items = actions.filter((action) => types.includes(action.type));
          if (!items.length) return null;
          return (
            <div key={label} className="rounded-xl bg-white/80 border border-accent-border p-3">
              <p className="text-[10px] font-bold text-accent-text mb-1.5">{label}</p>
              <ul className="space-y-1">
                {items.map((action, index) => (
                  <li key={`${action.type}-${index}`} className="text-xs text-ink-secondary">{describeAction(action)}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {customization && (
        <div className="space-y-3">
          <AiFeedbackPanel feedback={customization.aiFeedback} />
          <CodeComparePanel title="Custom CSS" before={customization.before?.css || ''} after={customization.after?.css || ''} />
          <CodeComparePanel title="Custom JS" before={customization.before?.js || ''} after={customization.after?.js || ''} />
          {(customization.after?.css || customization.after?.themeOverrides || customization.after?.animations || Object.keys(settingsPatch).length > 0) && (
            <div className="rounded-xl border border-accent-border bg-white/70 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold  text-accent-text">Visual preview</p>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold ${previewSynced ? 'text-green-600 dark:text-green-300' : 'text-amber-600 dark:text-amber-300'}`}>
                    {previewSynced ? 'Preview synced' : 'Syncing preview...'}
                  </span>
                  <a href={`/${user?.username}?preview=1`} target="_blank" rel="noreferrer" className="text-xs text-accent-text hover:underline">Open preview</a>
                </div>
              </div>
              <iframe
                src={`/${user?.username}?preview=1`}
                title="AI Editor preview"
                className="w-full rounded-lg bg-white"
                style={{ height: 360, border: 'none' }}
                onLoad={(event) => {
                  postPreviewPayloadToFrame(event.currentTarget, {
                    type: 'pf-preview',
                    css: customization.after?.css ?? settings.custom_css ?? '',
                    js: customization.after?.js ?? settings.custom_js ?? '',
                    runJs: false,
                    themeOverrides: customization.after?.themeOverrides ?? settings.theme_overrides ?? {},
                    animations: customization.after?.animations ?? settings.animations ?? {},
                    designSystem: settingsPatch.design_system ?? changeSet.preview?.designSystem ?? settings.design_system ?? {},
                    interactions: settingsPatch.interactions ?? changeSet.preview?.interactions ?? settings.interactions ?? [],
                    settings: previewSettings,
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {!customization && Object.keys(settingsPatch).length > 0 && (
        <div className="rounded-xl border border-accent-border bg-white/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold  text-accent-text">Visual preview</p>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-semibold ${previewSynced ? 'text-green-600 dark:text-green-300' : 'text-amber-600 dark:text-amber-300'}`}>
                {previewSynced ? 'Preview synced' : 'Syncing preview...'}
              </span>
              <a href={`/${user?.username}?preview=1`} target="_blank" rel="noreferrer" className="text-xs text-accent-text hover:underline">Open preview</a>
            </div>
          </div>
          <iframe
            src={`/${user?.username}?preview=1`}
            title="AI Editor native preview"
            className="w-full rounded-lg bg-white"
            style={{ height: 360, border: 'none' }}
            onLoad={(event) => {
              postPreviewPayloadToFrame(event.currentTarget, {
                type: 'pf-preview',
                css: settings.custom_css ?? '',
                js: settings.custom_js ?? '',
                runJs: false,
                themeOverrides: settings.theme_overrides ?? {},
                animations: settings.animations ?? {},
                designSystem: settingsPatch.design_system ?? changeSet.preview?.designSystem ?? settings.design_system ?? {},
                interactions: settingsPatch.interactions ?? changeSet.preview?.interactions ?? settings.interactions ?? [],
                settings: previewSettings,
              });
            }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onApply} disabled={applying || browserBlocked} className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">{applying ? 'Applying...' : 'Apply bundle'}</button>
        <button onClick={onDiscard} disabled={applying} className="btn-secondary text-sm">Discard</button>
      </div>
    </div>
  );
}

function AgentAppliedChanges({ changeSets = [], revertingId, verifyingId, removingId, onRevert, onVerifyLive, onRemove }) {
  const applied = changeSets
    .filter(changeSet => changeSet.status === 'applied')
    .slice(0, 5);

  if (!applied.length) return null;

  return (
    <div className="rounded-xl border border-line bg-white/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-line-subtle">
        <p className="text-sm font-semibold text-ink">Applied AI changes</p>
        <p className="text-xs text-ink-muted mt-0.5">Remove generated surfaces or restore the snapshot from before a bundle was applied.</p>
      </div>
      <div className="space-y-3 p-3">
        {applied.map(changeSet => {
          const canRevert = Boolean(changeSet.preview?.rollbackSnapshot);
          const snapshotAt = changeSet.preview?.rollbackSnapshot?.capturedAt;
          const live = changeSet.preview?.liveVerification;
          const surfaces = changeSet.preview?.surfaceSummary || {};
          const hasSurfaceManifest = Boolean(changeSet.preview?.surfaceManifest?.version);
          const codeCount = (surfaces.cssBlocks?.length || 0)
            + (surfaces.jsBlocks?.length || 0)
            + (surfaces.themeOverrides?.length || 0)
            + (surfaces.animations?.length || 0)
            + (surfaces.interactions?.length || 0);
          const sectionCount = surfaces.sections?.length || 0;
          const removedModes = new Set((changeSet.preview?.removals || []).map(removal => removal.mode));
          const sectionsAlreadyRemoved = removedModes.has('visual') || removedModes.has('sections');
          const codeAlreadyRemoved = removedModes.has('visual') || removedModes.has('code');
          const visualRemoving = removingId === `${changeSet.id}:visual`;
          const sectionsRemoving = removingId === `${changeSet.id}:sections`;
          const codeRemoving = removingId === `${changeSet.id}:code`;
          const liveStatusClass = live?.status === 'failed'
            ? 'text-red-600 dark:text-red-300'
            : live?.status === 'passed'
              ? 'text-green-600 dark:text-green-300'
              : 'text-amber-600 dark:text-amber-300';
          const appliedLabel = changeSet.applied_at ? new Date(changeSet.applied_at).toLocaleString() : 'Recently';
          const snapshotLabel = snapshotAt ? new Date(snapshotAt).toLocaleString() : null;
          const passedChecks = Array.isArray(live?.checks) ? live.checks.filter(check => check.status === 'passed').length : 0;
          const totalChecks = Array.isArray(live?.checks) ? live.checks.length : 0;
          const screenshotCount = Array.isArray(live?.checks) ? live.checks.filter(check => check.screenshot?.likelyNonBlank).length : 0;
          return (
            <div key={changeSet.id} className="rounded-xl border border-line bg-surface-muted/80 p-3">
              <div className="flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink break-words">{changeSet.summary || 'AI Editor change'}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-surface/50 border border-line-subtle px-3 py-2">
                      <p className="text-[10px] font-bold  text-ink-faint">Applied</p>
                      <p className="mt-0.5 text-ink-secondary">{appliedLabel}</p>
                    </div>
                    {snapshotLabel && (
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 px-3 py-2">
                        <p className="text-[10px] font-bold  text-amber-600 dark:text-amber-300">Revert point</p>
                        <p className="mt-0.5 text-amber-700 dark:text-amber-200">{snapshotLabel}</p>
                      </div>
                    )}
                    {live && (
                      <div className="rounded-xl bg-surface/50 border border-line-subtle px-3 py-2 sm:col-span-2">
                        <p className="text-[10px] font-bold  text-ink-faint">Live routes</p>
                        <p className={`mt-0.5 ${liveStatusClass}`}>
                          {live.status}{totalChecks ? ` - ${passedChecks}/${totalChecks} checks passed, ${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                    )}
                    {(sectionCount > 0 || codeCount > 0 || surfaces.settings?.length > 0) && (
                      <div className="rounded-xl bg-surface/50 border border-line-subtle px-3 py-2 sm:col-span-2">
                        <p className="text-[10px] font-bold  text-ink-faint">Owned surfaces</p>
                        <p className="mt-0.5 text-ink-muted">
                          {sectionCount ? `${sectionCount} section${sectionCount === 1 ? '' : 's'}` : 'No sections'}
                          {' - '}
                          {codeCount ? `${codeCount} code/effect surface${codeCount === 1 ? '' : 's'}` : 'No code/effects'}
                          {' - '}
                          {surfaces.settings?.length ? `${surfaces.settings.length} setting${surfaces.settings.length === 1 ? '' : 's'}` : 'No settings'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {sectionCount > 0 && (
                    <button
                      onClick={() => onRemove(changeSet, 'sections')}
                      disabled={!hasSurfaceManifest || sectionsAlreadyRemoved || Boolean(removingId) || revertingId === changeSet.id || verifyingId === changeSet.id}
                      className="text-xs px-3 py-2 rounded-xl border border-line text-ink-secondary bg-surface/40 hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sectionsAlreadyRemoved ? 'Sections removed' : sectionsRemoving ? 'Removing sections...' : 'Remove sections'}
                    </button>
                  )}
                  {codeCount > 0 && (
                    <button
                      onClick={() => onRemove(changeSet, 'code')}
                      disabled={!hasSurfaceManifest || codeAlreadyRemoved || Boolean(removingId) || revertingId === changeSet.id || verifyingId === changeSet.id}
                      className="text-xs px-3 py-2 rounded-xl border border-line text-ink-secondary bg-surface/40 hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {codeAlreadyRemoved ? 'Code removed' : codeRemoving ? 'Removing code...' : 'Remove code/effects'}
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(changeSet, 'visual')}
                    disabled={!hasSurfaceManifest || Boolean(removingId) || revertingId === changeSet.id || verifyingId === changeSet.id}
                    className="text-xs px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-surface/40 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasSurfaceManifest ? 'Remove surfaces owned by this AI bundle' : 'Older AI bundles can still use full snapshot revert'}
                  >
                    {!hasSurfaceManifest ? 'Use revert' : visualRemoving ? 'Removing visual...' : 'Remove visual'}
                  </button>
                  <button
                    onClick={() => onVerifyLive(changeSet)}
                    disabled={Boolean(removingId) || verifyingId === changeSet.id || revertingId === changeSet.id}
                    className="text-xs px-3 py-2 rounded-xl border border-accent-border text-accent-text bg-surface/40 hover:bg-accent-surface disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyingId === changeSet.id ? 'Checking live...' : 'Verify live'}
                  </button>
                  <button
                    onClick={() => onRevert(changeSet)}
                    disabled={Boolean(removingId) || !canRevert || revertingId === changeSet.id || verifyingId === changeSet.id}
                    className="text-xs px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 bg-surface/40 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {revertingId === changeSet.id ? 'Reverting...' : 'Revert snapshot'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentResetControls({ changeSets = [], resettingMode, onReset }) {
  const appliedCount = changeSets.filter(changeSet => changeSet.status === 'applied').length;
  if (!appliedCount) return null;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Remove AI changes</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
            Memory and custom code are not the whole design. Agent themes can also live in native settings, sections, tokens, animations, and interactions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onReset('visual')}
            disabled={Boolean(resettingMode)}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resettingMode === 'visual' ? 'Resetting...' : 'Remove AI design'}
          </button>
          <button
            onClick={() => onReset('all')}
            disabled={Boolean(resettingMode)}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resettingMode === 'all' ? 'Reverting...' : 'Revert everything'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAgentDate(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AgentThreadPanel({ threads = [], currentThreadId, onSelectThread, onNewChat, onDeleteThread, loading }) {
  const recentThreads = Array.isArray(threads) ? threads.slice(0, 8) : [];

  return (
    <section className="rounded-xl border border-line bg-surface/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold text-ink">Chats</p>
          <p className="text-[11px] text-ink-muted">Open a past thread or start fresh.</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={loading || !currentThreadId}
          className="text-[11px] px-2.5 py-1 rounded-lg border border-accent-border text-accent-text hover:bg-accent-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          New
        </button>
      </div>

      {recentThreads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-3 text-[11px] text-ink-muted">
          Your agent conversations will appear here after the first prompt.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1" aria-label="Previous AI chats">
          {recentThreads.map((thread) => {
            const active = thread.id === currentThreadId;
            return (
              <div
                key={thread.id}
                className={`group flex items-start gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                  active
                    ? 'border-accent-border bg-accent-surface'
                    : 'border-line hover:bg-surface-muted'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  disabled={loading}
                  className="min-w-0 flex-1 text-left disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                  aria-current={active ? 'true' : undefined}
                >
                  <span className="block text-xs font-medium text-ink truncate">
                    {thread.title || 'Untitled chat'}
                  </span>
                  <span className="block text-[10px] text-ink-faint mt-0.5">
                    {formatAgentDate(thread.updated_at || thread.created_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteThread(thread.id)}
                  disabled={loading}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-slate-500 opacity-100 hover:bg-surface-muted hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-red-300 xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100"
                  aria-label={`Delete ${thread.title || 'chat'}`}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgentInlineConfigControls({ modes = [], mode, onModeChange, models = [], modelId, onModelChange }) {
  const activeMode = modes.find(item => item.id === mode);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Agent setup controls">
      <label className="min-w-[132px] flex-1 sm:flex-none">
        <span className="sr-only">Agent mode</span>
        <select
          value={mode}
          onChange={e => onModeChange(e.target.value)}
          className="form-input h-9 rounded-full text-xs py-1.5"
          title={activeMode?.description || 'Agent mode'}
        >
          {modes.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>

      <label className="min-w-[190px] flex-[2] sm:flex-none">
        <span className="sr-only">AI model</span>
        <select
          value={modelId}
          onChange={e => onModelChange(e.target.value)}
          className="form-input h-9 rounded-full text-xs py-1.5"
          title="Choose the model for this agent message"
        >
          {models.length === 0 && <option value="">Loading models...</option>}
          {models.map(model => (
            <option key={model.id} value={model.id} disabled={!model.enabled}>
              {model.name}{model.premium ? ' (premium)' : ''}{!model.enabled ? ' - locked' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AgentRecoveryCenter({
  changeSets,
  revertingId,
  verifyingId,
  removingId,
  resettingMode,
  onRevert,
  onVerifyLive,
  onRemove,
  onReset,
}) {
  const appliedCount = changeSets.filter(changeSet => changeSet.status === 'applied').length;

  return (
    <section className="rounded-xl border border-line bg-surface/30 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-ink">Undo and recovery</p>
        <p className="text-[11px] text-ink-muted">
          Remove one bundle, remove AI visuals, or fully revert to a saved snapshot.
        </p>
      </div>

      {appliedCount === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-3 text-[11px] text-ink-muted">
          No applied AI bundles yet. Once you apply one, recovery actions will appear here.
        </div>
      ) : (
        <>
          <AgentResetControls
            changeSets={changeSets}
            resettingMode={resettingMode}
            onReset={onReset}
          />
          <AgentAppliedChanges
            changeSets={changeSets}
            revertingId={revertingId}
            verifyingId={verifyingId}
            removingId={removingId}
            onRevert={onRevert}
            onVerifyLive={onVerifyLive}
            onRemove={onRemove}
          />
        </>
      )}
    </section>
  );
}

function AgentMemoryPanel({ memories = [], onDelete }) {
  return (
    <section className="rounded-xl border border-line bg-surface/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink">Memory</p>
          <p className="text-[11px] text-ink-muted">
            Deleting memory only removes preferences. It does not undo website changes.
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted">
          {memories.length}
        </span>
      </div>

      {memories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-3 text-[11px] text-ink-muted mt-3">
          Saved design preferences and decisions will show up here.
        </div>
      ) : (
        <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
          {memories.slice(0, 5).map(memory => (
            <div key={memory.id} className="rounded-xl border border-line-subtle bg-surface-muted/50 p-2">
              <p className="text-xs text-ink">{memory.content}</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[10px] text-ink-faint">{memory.kind || 'preference'}</span>
                <button
                  type="button"
                  onClick={() => onDelete(memory.id)}
                  className="text-[11px] text-ink-faint hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                >
                  Delete memory
                </button>
              </div>
            </div>
          ))}
          {memories.length > 5 && (
            <p className="text-[11px] text-ink-muted">+{memories.length - 5} more saved memories</p>
          )}
        </div>
      )}
    </section>
  );
}

function AgentPromptComposer({
  value,
  onChange,
  onSubmit,
  loading,
  blocked = false,
  blockedReason = '',
  showSuggestions = true,
  modes = [],
  mode,
  onModeChange,
  models = [],
  modelId,
  onModelChange,
}) {
  const suggestions = [
    'Make the project cards feel more premium, but keep the current structure.',
    'Add one concise proof section for AI engineering recruiters.',
    'Redesign this as a clean dark AI engineering portfolio without invented filler copy.',
  ];

  return (
    <div className="bg-surface/70 p-3 sm:p-4">
      {showSuggestions && (
        <div className="flex flex-wrap gap-1.5 mb-3" aria-label="Agent prompt examples">
          {suggestions.map((suggestion) => (
            <button
            key={suggestion}
            type="button"
            onClick={() => onChange(suggestion)}
            disabled={loading || blocked}
              className="text-[11px] px-2.5 py-1 rounded-full border border-line text-ink-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface/70 p-2 shadow-sm focus-within:ring-2 focus-within:ring-accent/30">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!loading && !blocked && value.trim()) onSubmit();
            }
          }}
          className="form-input w-full text-sm min-h-[88px] resize-y border-0 bg-transparent shadow-none focus:ring-0"
          disabled={loading || blocked}
          placeholder="Describe the website you want your portfolio to become..."
          aria-label="Message the Site Agent"
        />
        <div className="mt-2 flex flex-col gap-2 border-t border-line-subtle pt-2 sm:flex-row sm:items-center sm:justify-between">
          <AgentInlineConfigControls
            modes={modes}
            mode={mode}
            onModeChange={onModeChange}
            models={models}
            modelId={modelId}
            onModelChange={onModelChange}
          />
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="hidden text-[11px] text-ink-muted sm:block">
              Enter to send, Shift+Enter for a new line.
            </p>
            <button
              type="button"
              onClick={() => onSubmit()}
              disabled={loading || blocked || !value.trim()}
              className="btn-primary text-sm px-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Working...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink-muted mt-2 sm:hidden">
        Press Enter to send. Use Shift+Enter for a new line.
      </p>
      {blocked && blockedReason && (
        <p className="text-[11px] text-accent-text mt-2">
          {blockedReason}
        </p>
      )}
    </div>
  );
}

function parseAgentMessageMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function getAgentClarification(message) {
  const metadata = parseAgentMessageMetadata(message?.metadata);
  if (metadata.clarificationAnswered || metadata.awaitingClarification === false) return null;
  return metadata.clarification || metadata.needsInput?.clarification || null;
}

function getAgentClarificationAnswer(message) {
  const metadata = parseAgentMessageMetadata(message?.metadata);
  if (!metadata.clarificationAnswered) return '';
  return metadata.clarificationAnswer || metadata.clarificationAnswerLabel || 'Answered';
}

function AgentClarificationCard({ clarification, loading, onAnswer }) {
  const [customAnswer, setCustomAnswer] = useState('');
  if (!clarification?.question || !Array.isArray(clarification.options)) return null;

  return (
    <div className="mt-3 rounded-xl border border-accent-border bg-accent-surface/80 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-accent-text">Quick clarification</p>
        <p className="text-sm font-semibold text-ink mt-1">{clarification.question}</p>
        {clarification.reason && (
          <p className="text-xs text-ink-muted mt-1">{clarification.reason}</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clarification.options.slice(0, 3).map((option) => (
          <button
            key={option.id || option.label}
            type="button"
            disabled={loading}
            onClick={() => onAnswer(clarification, option.value || option.label)}
            className="text-left rounded-xl border border-accent-border bg-surface p-3 hover:border-accent hover:shadow-sm disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="block text-xs font-semibold text-ink">{option.label}</span>
            {option.description && (
              <span className="block text-[11px] text-ink-muted mt-1">{option.description}</span>
            )}
          </button>
        ))}
      </div>

      {clarification.allowCustom !== false && (
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={customAnswer}
            onChange={e => setCustomAnswer(e.target.value)}
            disabled={loading}
            className="form-input flex-1 text-xs min-h-[72px] resize-y"
            placeholder={clarification.customPlaceholder || 'Type your own answer...'}
            aria-label="Custom clarification answer"
          />
          <button
            type="button"
            disabled={loading || !customAnswer.trim()}
            onClick={() => {
              onAnswer(clarification, `Clarification answer: ${customAnswer.trim()}`);
              setCustomAnswer('');
            }}
            className="btn-primary text-xs px-4 sm:self-stretch disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use answer
          </button>
        </div>
      )}
    </div>
  );
}

function AgentMessageBubble({ message, loading, onClarificationAnswer }) {
  const clarification = message.role === 'assistant' ? getAgentClarification(message) : null;
  const clarificationAnswer = message.role === 'assistant' ? getAgentClarificationAnswer(message) : '';

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${
        message.role === 'user'
          ? 'bg-accent text-white'
          : 'bg-surface text-ink border border-line'
      }`}>
        {!clarification && message.content}
        {!clarification && clarificationAnswer && (
          <div className="mt-3 rounded-xl border border-accent-border bg-accent-surface/70 px-3 py-2 text-xs text-accent-text">
            <span className="font-semibold">Answered:</span> {clarificationAnswer}
          </div>
        )}
        {clarification && (
          <AgentClarificationCard
            clarification={clarification}
            loading={loading}
            onAnswer={onClarificationAnswer}
          />
        )}
      </div>
    </div>
  );
}

function AgentWorkspace({
  user,
  settings,
  threads,
  threadId,
  messages,
  prompt,
  loading,
  changeSet,
  changeSets,
  applying,
  warning,
  models,
  modelId,
  modes,
  mode,
  memories,
  revertingId,
  verifyingId,
  removingId,
  resettingMode,
  onLoadThread,
  onModeChange,
  onModelChange,
  onPromptChange,
  onSubmit,
  onDismissWarning,
  onApply,
  onDiscard,
  onRevert,
  onVerifyLive,
  onRemove,
  onReset,
  onDeleteMemory,
  onDeleteThread,
  onClarificationAnswer,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const hasPendingClarification = messages.some((message) => getAgentClarification(message));

  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-line bg-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-ink">Site Agent</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-accent-surface text-accent-text rounded-full ">Native builder</span>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              Chat, review a bundle, apply it, then remove or revert it from the same workspace. The agent uses native ProjectFolio sections, settings, CSS, and safe interactions before advanced code.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(open => !open)}
              aria-expanded={sidebarOpen}
              className="btn-secondary text-xs"
            >
              {sidebarOpen ? 'Hide sidebar' : 'Chats & memory'}
            </button>
            <a
              href={`/${user?.username}?preview=1`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              Open live preview
            </a>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className={`grid gap-5 ${sidebarOpen ? 'xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]' : 'xl:grid-cols-1'}`}>
          {sidebarOpen && (
            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Chats and memory">
              <AgentThreadPanel
                threads={threads}
                currentThreadId={threadId}
                onSelectThread={onLoadThread}
                onNewChat={() => onLoadThread('')}
                onDeleteThread={onDeleteThread}
                loading={loading || applying}
              />
              <AgentMemoryPanel
                memories={memories}
                onDelete={onDeleteMemory}
              />
            </aside>
          )}

          <section className="min-w-0 space-y-4" aria-label="Site Agent conversation, review, and recovery">
            <div className="rounded-xl border border-line bg-surface-page/40 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {threadId ? 'Current chat' : 'New chat'}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Ask for a small edit or a full native redesign. You will review before anything applies.
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line text-ink-muted">
                  {messages.length} message{messages.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="p-3 min-h-[360px] max-h-[560px] overflow-y-auto space-y-2">
                {messages.length === 0 ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-dashed border-line bg-surface/40 p-4">
                      <p className="text-sm font-semibold text-ink">Start with intent</p>
                      <p className="text-xs text-ink-muted mt-1">
                        Tell the agent whether you want a small targeted edit, one new section, or a full redesign.
                      </p>
                    </div>
                    <div className="rounded-xl border border-dashed border-line bg-surface/40 p-4">
                      <p className="text-sm font-semibold text-ink">Review before apply</p>
                      <p className="text-xs text-ink-muted mt-1">
                        Bundles show design plan, changed surfaces, browser checks, preview, and undo options.
                      </p>
                    </div>
                  </div>
                ) : messages.map((message) => (
                  <AgentMessageBubble
                    key={message.id}
                    message={message}
                    loading={loading}
                    onClarificationAnswer={onClarificationAnswer}
                  />
                ))}
                {loading && (
                  <ActiveProgress
                    compact
                    label="Site Agent is preparing changes"
                    stages={[
                      'Reading the current site structure...',
                      'Tracing the sections your request affects...',
                      'Planning compatible design changes...',
                      'Checking the proposed bundle for conflicts...',
                    ]}
                  />
                )}
              </div>
              <div className="border-t border-line">
                <AgentPromptComposer
                  value={prompt}
                  onChange={onPromptChange}
                  onSubmit={onSubmit}
                  loading={loading}
                  blocked={hasPendingClarification}
                  blockedReason="Answer the quick clarification above to continue this chat."
                  showSuggestions={messages.length === 0}
                  modes={modes}
                  mode={mode}
                  onModeChange={onModeChange}
                  models={models}
                  modelId={modelId}
                  onModelChange={onModelChange}
                />
              </div>
            </div>

            <AgentWarningPanel warning={warning} onDismiss={onDismissWarning} />

            {changeSet && (
              <AgentChangeSetReview
                changeSet={changeSet}
                applying={applying}
                onApply={onApply}
                onDiscard={onDiscard}
                user={user}
                settings={settings}
              />
            )}

            <AgentRecoveryCenter
              changeSets={changeSets}
              revertingId={revertingId}
              verifyingId={verifyingId}
              removingId={removingId}
              resettingMode={resettingMode}
              onRevert={onRevert}
              onVerifyLive={onVerifyLive}
              onRemove={onRemove}
              onReset={onReset}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioSettingsPage({ noLayout = false }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    theme: 'clean',
    accent_color: '#2563eb',
    show_contact_form: true,
    is_public: true,
    seo_title: '',
    seo_description: '',
    layout: 'classic',
    section_order: DEFAULT_ORDER,
    show_skills: true,
    show_dates: true,
    show_project_type: true,
    section_config: {},
    custom_css: '',
    manual_custom_css: '',
    agent_custom_css: '',
    manual_design_overrides: {},
    agent_design_meta: { active: false, version: 1, appliedChangeSetIds: [] },
    custom_js: '',
    theme_overrides: {},  // Phase 3: structured component-level overrides
    animations: {},       // Phase 3: named animation library selections
    site_sections: [],
    design_system: {},
    interactions: [],
    preferred_ai_model: '',
    custom_site_enabled: false,
    custom_site_html: '',
    custom_site_css: '',
    custom_site_js: '',
    custom_site_updated_at: '',
  });
  const [savedSettings, setSavedSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedCredId, setExpandedCredId] = useState(null);
  const [addingCred, setAddingCred]         = useState(false);
  const [credDraft, setCredDraft]           = useState({});
  const [endorsements, setEndorsements]     = useState([]);
  const [myProjects, setMyProjects] = useState([]);
  const [requestEmail, setRequestEmail]     = useState('');
  const [requestProjectId, setRequestProjectId] = useState('');
  const [requestNote, setRequestNote]       = useState('');
  const [requestingEndorse, setRequestingEndorse] = useState(false);
  const [endorseRequestOpen, setEndorseRequestOpen] = useState(false);
  const [endorseLink, setEndorseLink]       = useState(null);
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [codeTab, setCodeTab] = useState('css');
  const [customCodeOpen, setCustomCodeOpen] = useState(false);
  const [customSiteSaving, setCustomSiteSaving] = useState(false);
  const [customSiteErrors, setCustomSiteErrors] = useState([]);
  const [customSiteWarnings, setCustomSiteWarnings] = useState([]);

  // ── Credential helpers ────────────────────────────────────────────────────
  const credentials = settings.section_config?.education?.credentials || [];

  const patchEduCredentials = (updater) =>
    setSettings(s => ({
      ...s,
      section_config: {
        ...s.section_config,
        education: {
          ...s.section_config?.education,
          credentials: typeof updater === 'function'
            ? updater(s.section_config?.education?.credentials || [])
            : updater,
        },
      },
    }));

  const saveCredential = () => {
    if (!credDraft.title && !credDraft.institution) return;
    if (addingCred) {
      patchEduCredentials(prev => [credDraft, ...prev]);
      setAddingCred(false);
    } else {
      patchEduCredentials(prev => prev.map(c => c.id === credDraft.id ? credDraft : c));
      setExpandedCredId(null);
    }
    setCredDraft({});
  };

  const deleteCredential = (id) => {
    patchEduCredentials(prev => prev.filter(c => c.id !== id));
    if (expandedCredId === id) setExpandedCredId(null);
  };

  // ── Endorsement helpers ──────────────────────────────────────────────────
  const fetchEndorsements = useCallback(async () => {
    try {
      const res = await api.get('/endorsements/mine');
      setEndorsements(res.data.endorsements || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEndorsements(); }, [fetchEndorsements]);

  useEffect(() => {
  api.get('/discover/my-projects')
    .then(r => setMyProjects(r.data.projects || []))
    .catch(() => {});
    }, []);

  const requestEndorsement = async () => {
    setRequestingEndorse(true);
    try {
      const res = await api.post('/endorsements/request', {
        from_email: requestEmail.trim() || undefined,
        project_id: requestProjectId || undefined,
        note: requestNote.trim() || undefined,
      });
      setEndorseLink(res.data.link);
      setRequestEmail(''); setRequestProjectId(''); setRequestNote('');
      await fetchEndorsements();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create request.');
    } finally {
      setRequestingEndorse(false);
    }
  };

  const approveEndorsement = async (id) => {
    await api.patch(`/endorsements/${id}/approve`);
    await fetchEndorsements();
  };

  const rejectEndorsement = async (id) => {
    await api.patch(`/endorsements/${id}/reject`);
    await fetchEndorsements();
  };

  const deleteEndorsement = async (id) => {
    if (!window.confirm('Delete this endorsement?')) return;
    await api.delete(`/endorsements/${id}`);
    await fetchEndorsements();
  };

  const removeSection = (sectionId) =>
    setSettings(s => ({ ...s, section_order: s.section_order.filter(id => id !== sectionId) }));

  const addSection = (sectionId) =>
    setSettings(s => ({ ...s, section_order: [...s.section_order, sectionId] }));

  const credYears = (c) => {
    if (!c.year_start && !c.year_end) return '';
    if (c.year_start && c.year_end) return `${c.year_start}-${c.year_end}`;
    return c.year_start || c.year_end;
  };
  const [agentModels, setAgentModels] = useState([]);
  const [agentModelId, setAgentModelId] = useState('');
  const [agentModes, setAgentModes] = useState(DEFAULT_AGENT_MODES);
  const [agentMode, setAgentMode] = useState('auto');
  const [agentThreads, setAgentThreads] = useState([]);
  const [agentThreadId, setAgentThreadId] = useState('');
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentChangeSet, setAgentChangeSet] = useState(null);
  const [agentChangeSets, setAgentChangeSets] = useState([]);
  const [agentApplying, setAgentApplying] = useState(false);
  const [agentRevertingId, setAgentRevertingId] = useState(null);
  const [agentVerifyingId, setAgentVerifyingId] = useState(null);
  const [agentRemovingId, setAgentRemovingId] = useState('');
  const [agentResettingMode, setAgentResettingMode] = useState('');
  const [agentMemories, setAgentMemories] = useState([]);
  const [agentWarning, setAgentWarning] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const loadAgent = async () => {
      try {
        const [modelsRes, threadsRes, memoriesRes, appliedRes] = await Promise.all([
          api.get('/agent/models'),
          api.get('/agent/threads'),
          api.get('/agent/memory'),
          api.get('/agent/change-sets/applied'),
        ]);
        const models = modelsRes.data?.models || [];
        setAgentModels(models);
        setAgentModes(Array.isArray(modelsRes.data?.modes) && modelsRes.data.modes.length ? modelsRes.data.modes : DEFAULT_AGENT_MODES);
        setAgentMode(prev => prev || modelsRes.data?.defaultModeId || 'auto');
        setAgentModelId(prev => prev || settings.preferred_ai_model || modelsRes.data?.defaultModelId || models.find(m => m.enabled)?.id || '');
        setAgentThreads(threadsRes.data?.threads || []);
        setAgentMemories(memoriesRes.data?.memories || []);
        setAgentChangeSets(prev => mergeAgentChangeSets(prev, appliedRes.data?.changeSets || []));
      } catch (error) {
        console.warn('AI Editor bootstrap failed:', error?.response?.data?.error || error.message);
      }
    };
    loadAgent();
  }, [user?.id, settings.preferred_ai_model]);

  useEffect(() => {
    api.get('/settings').then(res => {
      if (res.data.settings) {
        const s = res.data.settings;
        // Helper to safely parse JSONB fields that may arrive as string or object
        const parseJsonb = (val) => {
          if (!val) return {};
          if (typeof val === 'object') return val;
          try { return JSON.parse(val); } catch { return {}; }
        };
        const parseJsonArray = (val) => {
          if (!val) return [];
          if (Array.isArray(val)) return val;
          try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
        };
        const parsedSettings = {
          ...s,
          section_order:   parseOrder(s.section_order) || DEFAULT_ORDER,
          section_config:  parseJsonb(s.section_config),
          theme_overrides: parseJsonb(s.theme_overrides),
          animations:      parseJsonb(s.animations),
          site_sections:   parseJsonArray(s.site_sections),
          design_system:   parseJsonb(s.design_system),
          interactions:    parseJsonArray(s.interactions),
          manual_custom_css: typeof s.manual_custom_css === 'string' ? s.manual_custom_css : (s.manual_custom_css || ''),
          agent_custom_css: typeof s.agent_custom_css === 'string' ? s.agent_custom_css : (s.agent_custom_css || ''),
          manual_design_overrides: parseJsonb(s.manual_design_overrides),
          agent_design_meta: parseJsonb(s.agent_design_meta),
          custom_js: null,
          custom_site_enabled: s.custom_site_enabled === true,
          custom_site_html: typeof s.custom_site_html === 'string' ? s.custom_site_html : '',
          custom_site_css: typeof s.custom_site_css === 'string' ? s.custom_site_css : '',
          custom_site_js: typeof s.custom_site_js === 'string' ? s.custom_site_js : '',
          custom_site_updated_at: s.custom_site_updated_at || '',
        };
        setSettings(prev => ({
          ...prev,
          ...parsedSettings,
        }));
        setSavedSettings(parsedSettings);
      }
    });
    if (user?.username) setPortfolioUrl(`${window.location.origin}/${user.username}`);
  }, [user]);

  const parseOrder = (val) => {
    if (!val) return null;
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return null; }
  };
  const comparableSettingsValue = (value) => {
    if (value == null) return value;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const getChangedSettingsKeys = (before = {}, after = {}) => {
    if (!before) return [];
    const ignored = new Set(['id', 'user_id', 'created_at', 'updated_at', 'custom_js']);
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return [...keys].filter((key) => {
      if (ignored.has(key)) return false;
      return comparableSettingsValue(before?.[key]) !== comparableSettingsValue(after?.[key]);
    });
  };
  const settingsPayload = (value) => {
    const manualCss = value.manual_custom_css ?? value.custom_css ?? '';
    const baseValue = { ...value };
    delete baseValue.custom_site_enabled;
    delete baseValue.custom_site_html;
    delete baseValue.custom_site_css;
    delete baseValue.custom_site_js;
    delete baseValue.custom_site_updated_at;
    return {
      ...baseValue,
      source: 'manual-settings',
      changedKeys: getChangedSettingsKeys(savedSettings, baseValue),
      custom_css: manualCss,
      manual_custom_css: manualCss,
      custom_js: null,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/settings', settingsPayload(settings));
      if (res.data?.settings) {
        const parseJ = (v) => { if (!v) return {}; if (typeof v === 'object' && !Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return {}; } };
        const parseA = (v) => { if (!v) return []; if (Array.isArray(v)) return v; try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
        const saved = res.data.settings;
        const next = {
          ...settings,
          ...saved,
          section_order: parseOrder(saved.section_order) || DEFAULT_ORDER,
          section_config: parseJ(saved.section_config),
          theme_overrides: parseJ(saved.theme_overrides),
          animations: parseJ(saved.animations),
          site_sections: parseA(saved.site_sections),
          design_system: parseJ(saved.design_system),
          interactions: parseA(saved.interactions),
          manual_design_overrides: parseJ(saved.manual_design_overrides),
          agent_design_meta: parseJ(saved.agent_design_meta),
          manual_custom_css: typeof saved.manual_custom_css === 'string' ? saved.manual_custom_css : (saved.manual_custom_css || ''),
          agent_custom_css: typeof saved.agent_custom_css === 'string' ? saved.agent_custom_css : (saved.agent_custom_css || ''),
          custom_js: null,
          custom_site_enabled: saved.custom_site_enabled === true,
          custom_site_html: typeof saved.custom_site_html === 'string' ? saved.custom_site_html : '',
          custom_site_css: typeof saved.custom_site_css === 'string' ? saved.custom_site_css : '',
          custom_site_js: typeof saved.custom_site_js === 'string' ? saved.custom_site_js : '',
          custom_site_updated_at: saved.custom_site_updated_at || '',
        };
        setSettings(next);
        setSavedSettings(next);
      } else {
        setSavedSettings(settings);
      }
      toast.success('Settings saved!');
      if (res.data?.warnings?.length) {
        toast(`${res.data.warnings.length} design layer warning${res.data.warnings.length === 1 ? '' : 's'} saved.`, { icon: '!' });
      }
      // Notify any open portfolio tabs to re-fetch so they reflect the new CSS and native interactions immediately.
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch {
      toast.error('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Drag-and-drop handler ─────────────────────────────────────────────────
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;

    const next = Array.from(settings.section_order);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSettings(s => ({ ...s, section_order: next }));
  };

  // ── AI Code Generation ───────────────────────────────────────────────────

  const refreshSettingsFromDb = async () => {
    const fresh = await api.get('/settings');
    if (fresh.data?.settings) {
      const fs = fresh.data.settings;
      const parseJ = (v) => { if (!v) return {}; if (typeof v === 'object' && !Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return {}; } };
      const parseA = (v) => { if (!v) return []; if (Array.isArray(v)) return v; try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
      setSettings(prev => ({
        ...prev,
        ...fs,
        section_order: parseOrder(fs.section_order) || DEFAULT_ORDER,
        section_config: parseJ(fs.section_config),
        theme_overrides: parseJ(fs.theme_overrides),
        animations: parseJ(fs.animations),
        site_sections: parseA(fs.site_sections),
        design_system: parseJ(fs.design_system),
        interactions: parseA(fs.interactions),
        manual_custom_css: typeof fs.manual_custom_css === 'string' ? fs.manual_custom_css : (fs.manual_custom_css || ''),
        agent_custom_css: typeof fs.agent_custom_css === 'string' ? fs.agent_custom_css : (fs.agent_custom_css || ''),
        manual_design_overrides: parseJ(fs.manual_design_overrides),
        agent_design_meta: parseJ(fs.agent_design_meta),
        custom_js: null,
        custom_site_enabled: fs.custom_site_enabled === true,
        custom_site_html: typeof fs.custom_site_html === 'string' ? fs.custom_site_html : '',
        custom_site_css: typeof fs.custom_site_css === 'string' ? fs.custom_site_css : '',
        custom_site_js: typeof fs.custom_site_js === 'string' ? fs.custom_site_js : '',
        custom_site_updated_at: fs.custom_site_updated_at || '',
      }));
      setSavedSettings({
        ...fs,
        section_order: parseOrder(fs.section_order) || DEFAULT_ORDER,
        section_config: parseJ(fs.section_config),
        theme_overrides: parseJ(fs.theme_overrides),
        animations: parseJ(fs.animations),
        site_sections: parseA(fs.site_sections),
        design_system: parseJ(fs.design_system),
        interactions: parseA(fs.interactions),
        manual_custom_css: typeof fs.manual_custom_css === 'string' ? fs.manual_custom_css : (fs.manual_custom_css || ''),
        agent_custom_css: typeof fs.agent_custom_css === 'string' ? fs.agent_custom_css : (fs.agent_custom_css || ''),
        manual_design_overrides: parseJ(fs.manual_design_overrides),
        agent_design_meta: parseJ(fs.agent_design_meta),
        custom_js: null,
        custom_site_enabled: fs.custom_site_enabled === true,
        custom_site_html: typeof fs.custom_site_html === 'string' ? fs.custom_site_html : '',
        custom_site_css: typeof fs.custom_site_css === 'string' ? fs.custom_site_css : '',
        custom_site_js: typeof fs.custom_site_js === 'string' ? fs.custom_site_js : '',
        custom_site_updated_at: fs.custom_site_updated_at || '',
      });
    }
  };

  const refreshAgentMemory = async () => {
    try {
      const res = await api.get('/agent/memory');
      setAgentMemories(res.data?.memories || []);
    } catch (error) {
      console.warn('Could not refresh agent memory:', error?.response?.data?.error || error.message);
    }
  };

  const refreshAppliedAgentChangeSets = async () => {
    try {
      const res = await api.get('/agent/change-sets/applied');
      const applied = res.data?.changeSets || [];
      setAgentChangeSets(prev => mergeAgentChangeSets(
        prev.filter(changeSet => changeSet.status !== 'applied'),
        applied
      ));
      return applied;
    } catch (error) {
      console.warn('Could not refresh applied AI changes:', error?.response?.data?.error || error.message);
      return [];
    }
  };

  const buildAgentWarning = (error) => {
    const status = error.response?.status;
    const data = error.response?.data || {};
    const details = Array.isArray(data.details)
      ? data.details.map(detail => typeof detail === 'string' ? detail : JSON.stringify(detail)).filter(Boolean)
      : [];
    const verification = data.verification || data.liveVerification || null;
    const verificationDetails = [
      ...(Array.isArray(verification?.errors) ? verification.errors : []),
      ...(Array.isArray(verification?.warnings) ? verification.warnings : []),
      ...(Array.isArray(data.warnings) ? data.warnings : []),
    ].map(detail => typeof detail === 'string' ? detail : JSON.stringify(detail)).filter(Boolean);
    const repairDetails = Array.isArray(data.repairAttempts)
      ? data.repairAttempts.flatMap((attempt) => {
          const attemptDetails = [
            ...(Array.isArray(attempt.errors) ? attempt.errors : []),
            ...(Array.isArray(attempt.warnings) ? attempt.warnings : []),
          ].map(detail => typeof detail === 'string' ? detail : JSON.stringify(detail)).filter(Boolean);
          return attemptDetails.map(detail => `Attempt ${attempt.attempt || '?'} (${String(attempt.status || 'check').replace(/_/g, ' ')}): ${detail}`);
        })
      : [];
    const allDetails = [...new Set([...details, ...verificationDetails, ...repairDetails])];

    if (status === 422 && data.status === 'blocked_preapply') {
      return {
        title: 'Apply blocked by browser verification',
        message: 'ProjectFolio kept the site unchanged because the real preview did not pass.',
        details: allDetails.length ? allDetails : [data.error || 'The proposed bundle failed the real preview check.'],
      };
    }

    if (status === 422 && data.status === 'rolled_back_live_failed') {
      return {
        title: 'Bundle rolled back after live verification',
        message: 'ProjectFolio restored the previous site because the live page did not pass after apply.',
        details: allDetails.length ? allDetails : [data.rollbackReason || data.message || 'The live route verification failed after apply.'],
      };
    }

    if (status === 422) {
      return {
        title: 'The AI made an invalid change bundle',
        message: data.reply
          ? 'ProjectFolio blocked the bundle before anything was applied. Try the request again or ask for a smaller change.'
          : 'ProjectFolio blocked the bundle before anything was applied.',
        details: allDetails.length ? allDetails : [data.error || 'The proposed actions did not pass validation.'],
      };
    }

    if (status === 429) {
      return {
        title: 'AI rate limit reached',
        message: 'Wait a moment, then retry the same prompt.',
        details: [data.error || 'The AI provider is temporarily limiting requests.'],
      };
    }

    if (status === 413) {
      return {
        title: 'AI request was too large',
        message: 'No fallback design was applied. Try a narrower prompt, or ask for one section/change at a time.',
        details: [
          data.error || 'The AI provider rejected the request because it exceeded the current model limit.',
          data.diagnostics?.compactContextBytes ? `Compact context size: ${data.diagnostics.compactContextBytes} bytes.` : null,
        ].filter(Boolean),
      };
    }

    return {
      title: 'AI Editor request failed',
      message: 'No changes were applied. You can retry the prompt.',
      details: [data.error || error.message || 'Unexpected error.'],
    };
  };

  const persistAgentModel = async (modelId) => {
    setAgentModelId(modelId);
    const nextSettings = { ...settings, preferred_ai_model: modelId };
    setSettings(nextSettings);
    try {
      await api.put('/settings', settingsPayload(nextSettings));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save model preference.');
    }
  };

  const loadAgentThread = async (threadId) => {
    if (!threadId) {
      setAgentThreadId('');
      setAgentMessages([]);
      setAgentChangeSet(null);
      setAgentChangeSets(prev => prev.filter(changeSet => changeSet.status === 'applied'));
      setAgentWarning(null);
      return;
    }
    try {
      const res = await api.get(`/agent/threads/${threadId}`);
      const changeSets = res.data?.changeSets || [];
      setAgentThreadId(threadId);
      setAgentMessages(res.data?.messages || []);
      setAgentChangeSets(prev => mergeAgentChangeSets(
        prev.filter(changeSet => changeSet.status === 'applied'),
        changeSets
      ));
      setAgentChangeSet(changeSets.find(cs => cs.status === 'pending') || null);
      setAgentWarning(null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not load agent chat.');
    }
  };

  const handleAgentChat = async (overridePrompt = null) => {
    const promptText = String(typeof overridePrompt === 'string' ? overridePrompt : agentPrompt).trim();
    if (!promptText) return toast.error('Describe what you want your site to become.');
    setAgentLoading(true);
    setAgentWarning(null);
    if (overridePrompt == null) setAgentPrompt('');
    setAgentMessages(prev => [...prev, { role: 'user', content: promptText, id: `local-${Date.now()}` }]);

    try {
      const res = await api.post('/agent/chat', {
        threadId: agentThreadId || undefined,
        prompt: promptText,
        modelId: agentModelId || undefined,
        mode: agentMode || 'auto',
      });
      const agentResult = await resolveJobResponse(res, { timeoutMs: 12 * 60_000 });
      setAgentThreadId(agentResult.thread?.id || agentThreadId);
      setAgentMessages(prev => [...prev, {
        role: 'assistant',
        content: agentResult.reply,
        id: `assistant-${Date.now()}`,
        metadata: agentResult.needsInput ? { clarification: agentResult.needsInput.clarification } : undefined,
      }]);
      setAgentChangeSet(agentResult.changeSet || null);
      if (agentResult.changeSet) setAgentChangeSets(prev => mergeAgentChangeSets(prev, [agentResult.changeSet]));
      setAgentWarning(null);
      const threads = await api.get('/agent/threads');
      setAgentThreads(threads.data?.threads || []);
    } catch (error) {
      const warning = buildAgentWarning(error);
      setAgentWarning(warning);
      toast.error(warning.title);
    } finally {
      setAgentLoading(false);
    }
  };

  const handleAgentClarificationAnswer = (clarification, answer) => {
    const answerText = String(answer || '').trim();
    if (!answerText || agentLoading) return;
    setAgentMessages(prev => {
      const next = [...prev];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const message = next[index];
        if (message.role !== 'assistant' || !getAgentClarification(message)) continue;
        next[index] = {
          ...message,
          metadata: {
            ...parseAgentMessageMetadata(message.metadata),
            awaitingClarification: false,
            clarificationAnswered: true,
            clarificationAnswer: answerText.replace(/^Clarification answer:\s*/i, ''),
          },
        };
        break;
      }
      return next;
    });
    const originalPrompt = clarification?.originalPrompt
      ? `Original request: ${clarification.originalPrompt}`
      : null;
    const question = clarification?.question
      ? `Clarification question: ${clarification.question}`
      : null;
    const promptText = [originalPrompt, question, answerText].filter(Boolean).join('\n');
    handleAgentChat(promptText);
  };

  const applyAgentChangeSet = async () => {
    if (!agentChangeSet?.id) return;
    if (agentChangeSet.preview?.browserVerification?.status !== 'passed') {
      toast.error('Apply blocked: browser verification has not passed.');
      return;
    }
    setAgentApplying(true);
    const updateFailedChangeSet = (data = {}) => {
      if (data.changeSet) {
        setAgentChangeSet(prev => (prev?.id === data.changeSet.id ? data.changeSet : prev));
        setAgentChangeSets(prev => mergeAgentChangeSets(prev, [data.changeSet]));
        return;
      }
      const verification = data.verification || data.liveVerification || null;
      if (!verification) return;
      const previewPatch = data.status === 'rolled_back_live_failed'
        ? {
            liveVerification: verification,
            rollbackApplied: data.rollbackApplied || false,
            rollbackReason: data.rollbackReason,
          }
        : {
            browserVerification: verification,
            realAppVerification: verification,
            preApplyVerification: verification,
          };
      const statusPatch = data.status === 'rolled_back_live_failed' ? 'rolled_back_live_failed' : agentChangeSet.status;
      setAgentChangeSet(prev => (
        prev?.id === agentChangeSet.id
          ? { ...prev, status: statusPatch, preview: { ...(prev.preview || {}), ...previewPatch } }
          : prev
      ));
      setAgentChangeSets(prev => prev.map(cs => (
        cs.id === agentChangeSet.id
          ? { ...cs, status: statusPatch, preview: { ...(cs.preview || {}), ...previewPatch } }
          : cs
      )));
    };
    try {
      const res = await api.post(`/agent/change-sets/${agentChangeSet.id}/apply`);
      const applyResult = await resolveJobResponse(res, { timeoutMs: 12 * 60_000 });
      if (applyResult?.status === 'rolled_back_live_failed') {
        toast.error('AI bundle failed live verification and was rolled back.');
      } else {
        toast.success('AI Editor changes applied!');
      }
      setAgentChangeSets(prev => {
        if (applyResult?.changeSet) return mergeAgentChangeSets(prev, [applyResult.changeSet]);
        const fallbackChangeSet = {
          ...agentChangeSet,
          status: applyResult?.status === 'rolled_back_live_failed' ? 'rolled_back_live_failed' : 'applied',
          applied_at: applyResult?.status === 'rolled_back_live_failed' ? agentChangeSet.applied_at : new Date().toISOString(),
          preview: {
            ...(agentChangeSet.preview || {}),
            rollbackSnapshot: applyResult?.rollbackApplied ? agentChangeSet.preview?.rollbackSnapshot : true,
            liveVerification: applyResult?.liveVerification || agentChangeSet.preview?.liveVerification,
            rollbackApplied: applyResult?.rollbackApplied || false,
            rollbackReason: applyResult?.rollbackReason || agentChangeSet.preview?.rollbackReason,
          },
        };
        return mergeAgentChangeSets(prev, [fallbackChangeSet]);
      });
      setAgentChangeSet(null);
      await refreshSettingsFromDb();
      await refreshAgentMemory();
      if (agentThreadId) await loadAgentThread(agentThreadId);
      await refreshAppliedAgentChangeSets();
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch (error) {
      const data = error.response?.data || {};
      updateFailedChangeSet(data);
      const warning = buildAgentWarning(error);
      setAgentWarning(warning);
      if (error.response?.data?.status === 'rolled_back_live_failed') {
        toast.error(warning.title);
        await refreshSettingsFromDb();
        if (agentThreadId) await loadAgentThread(agentThreadId);
        await refreshAppliedAgentChangeSets();
        try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
      } else {
        toast.error(warning.title);
      }
    } finally {
      setAgentApplying(false);
    }
  };

  const verifyAgentChangeSetLive = async (changeSet) => {
    if (!changeSet?.id) return;
    setAgentVerifyingId(changeSet.id);
    try {
      const res = await api.post(`/agent/change-sets/${changeSet.id}/verify-live`);
      const liveVerification = res.data?.liveVerification;
      setAgentChangeSets(prev => prev.map(cs => (
        cs.id === changeSet.id
          ? { ...cs, preview: { ...(cs.preview || {}), liveVerification } }
          : cs
      )));
      toast.success(liveVerification?.status === 'passed' ? 'Live routes verified.' : 'Live verification updated.');
      if (agentThreadId) await loadAgentThread(agentThreadId);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not verify live routes.');
    } finally {
      setAgentVerifyingId(null);
    }
  };

  const discardAgentChangeSet = async () => {
    if (!agentChangeSet?.id) {
      setAgentChangeSet(null);
      return;
    }
    try {
      await api.post(`/agent/change-sets/${agentChangeSet.id}/discard`);
      setAgentChangeSet(null);
      setAgentChangeSets(prev => prev.map(cs => cs.id === agentChangeSet.id ? { ...cs, status: 'discarded' } : cs));
      toast.success('Change bundle discarded.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not discard change bundle.');
    }
  };

  const revertAgentChangeSet = async (changeSet) => {
    if (!changeSet?.id) return;
    const snapshotAt = changeSet.preview?.rollbackSnapshot?.capturedAt;
    const snapshotLabel = snapshotAt ? new Date(snapshotAt).toLocaleString() : 'before this AI bundle was applied';
    const ok = window.confirm(
      `Revert your website to the snapshot from ${snapshotLabel}?\n\nThis restores settings, sections, profile fields, projects, and project blocks. Any newer manual edits or later AI changes to those areas may be overwritten.`
    );
    if (!ok) return;

    setAgentRevertingId(changeSet.id);
    try {
      await api.post(`/agent/change-sets/${changeSet.id}/revert`);
      toast.success('AI Editor changes reverted.');
      setAgentChangeSets(prev => prev.map(cs => cs.id === changeSet.id ? { ...cs, status: 'reverted' } : cs));
      await refreshSettingsFromDb();
      await refreshAgentMemory();
      if (agentThreadId) await loadAgentThread(agentThreadId);
      await refreshAppliedAgentChangeSets();
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not revert AI changes.');
    } finally {
      setAgentRevertingId(null);
    }
  };

  const removeAgentChangeSurfaces = async (changeSet, mode = 'visual') => {
    if (!changeSet?.id) return;
    const labels = {
      visual: 'Remove the AI-owned visual changes from this bundle? This restores the visual settings this bundle touched, including native theme surfaces that clearing custom code does not remove.',
      sections: 'Remove the custom sections created by this AI bundle? Other settings and code/effects will remain.',
      code: 'Remove the generated CSS, JavaScript, theme override keys, animations, and interaction effects owned by this AI bundle?',
    };
    const ok = window.confirm(labels[mode] || labels.visual);
    if (!ok) return;

    setAgentRemovingId(`${changeSet.id}:${mode}`);
    try {
      const res = await api.post(`/agent/change-sets/${changeSet.id}/remove`, { mode });
      if (res.data?.warnings?.length) {
        toast.success(`${res.data.message} ${res.data.warnings.length} newer-edit warning${res.data.warnings.length === 1 ? '' : 's'}.`);
      } else {
        toast.success(res.data?.message || 'AI changes removed.');
      }
      await refreshSettingsFromDb();
      await refreshAgentMemory();
      if (agentThreadId) await loadAgentThread(agentThreadId);
      await refreshAppliedAgentChangeSets();
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not remove AI changes.');
    } finally {
      setAgentRemovingId('');
    }
  };

  const resetAgentChanges = async (mode) => {
    const visualMsg = 'Remove the AI design layer?\n\nThis clears generated sections, design tokens, animations, interactions, and generated CSS. Manual CSS, section visibility/order choices, profile, and project content will be kept.';
    const allMsg = 'Revert everything the Site Agent applied?\n\nThis restores the website to the earliest pre-agent snapshot, including settings, profile fields, projects, project order, and project blocks. Agent memories will also be cleared. Newer manual edits in those areas may be overwritten.';
    const ok = window.confirm(mode === 'all' ? allMsg : visualMsg);
    if (!ok) return;

    setAgentResettingMode(mode);
    try {
      const res = await api.post('/agent/reset', {
        mode,
        clearMemory: mode === 'all',
      });
      toast.success(res.data?.message || (mode === 'all' ? 'AI changes reverted.' : 'AI design removed.'));
      await refreshSettingsFromDb();
      await refreshAgentMemory();
      if (agentThreadId) await loadAgentThread(agentThreadId);
      await refreshAppliedAgentChangeSets();
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not reset AI changes.');
    } finally {
      setAgentResettingMode('');
    }
  };

  const deleteAgentMemory = async (memoryId) => {
    try {
      await api.delete(`/agent/memory/${memoryId}`);
      setAgentMemories(prev => prev.filter(memory => memory.id !== memoryId));
      toast.success('Memory removed.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not delete memory.');
    }
  };

  const deleteAgentThread = async (threadId) => {
    if (!threadId) return;
    if (!confirm('Delete this Site Agent chat?\n\nThis removes the chat history and any memories tied to this thread. Applied website changes remain until you remove or revert them.')) return;
    try {
      await api.delete(`/agent/threads/${threadId}`);
      setAgentThreads(prev => prev.filter(thread => thread.id !== threadId));
      setAgentChangeSets(prev => prev.filter(changeSet => changeSet.thread_id !== threadId || changeSet.status === 'applied'));
      if (agentThreadId === threadId) {
        setAgentThreadId('');
        setAgentMessages([]);
        setAgentChangeSet(null);
        setAgentWarning(null);
      }
      await refreshAgentMemory();
      toast.success('Chat deleted.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not delete chat.');
    }
  };

  const agentDesignMeta = settings.agent_design_meta && typeof settings.agent_design_meta === 'object'
    ? settings.agent_design_meta
    : {};
  const agentDesignActive = agentDesignMeta.active === true || Boolean((settings.agent_custom_css || '').trim());
  const manualOverrideCount = Object.values(settings.manual_design_overrides || {}).reduce((count, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return count + Object.keys(value).length;
    return count + (value ? 1 : 0);
  }, 0);
  const generatedSections = Array.isArray(settings.site_sections) ? settings.site_sections : [];
  const generatedSectionDefinitions = Object.fromEntries(generatedSections
    .filter(section => section?.id)
    .map(section => [section.id, {
      label: section.title || section.heading || section.id,
      desc: section.kicker || section.subtitle || section.type || 'Generated by the Site Agent',
      icon: 'AI',
      required: false,
      generated: true,
    }]));
  const resolveSectionDefinition = (sectionId) => ALL_SECTIONS[sectionId] || generatedSectionDefinitions[sectionId] || null;
  const effectiveCustomCss = [
    settings.manual_custom_css || '',
    agentDesignActive ? (settings.agent_custom_css || '') : '',
  ].map(part => String(part || '').trim()).filter(Boolean).join('\n\n');
  const resetManualDesignOverrides = () => {
    setSettings(s => ({ ...s, manual_design_overrides: {} }));
    toast.success('Manual design overrides cleared. Save to publish this reset.');
  };
  const deleteGeneratedSection = (sectionId) => {
    setSettings(s => ({
      ...s,
      site_sections: (s.site_sections || []).filter(section => section.id !== sectionId),
      section_order: (s.section_order || []).filter(id => id !== sectionId),
    }));
  };

  const customSiteCode = {
    html: settings.custom_site_html || '',
    css: settings.custom_site_css || '',
    js: settings.custom_site_js || '',
  };
  const customSiteData = buildCustomSiteData(user, myProjects, settings);
  const customSitePreviewDoc = buildCustomSitePreviewDocument(customSiteCode, customSiteData);
  const customSiteClientErrors = validateCustomSiteClient(customSiteCode, settings.custom_site_enabled === true);
  const customSiteCombinedErrors = [...customSiteClientErrors, ...customSiteErrors];
  const customSiteTotalChars = customSiteCode.html.length + customSiteCode.css.length + customSiteCode.js.length;
  const hasCustomSiteDraft = Boolean(
    customSiteCode.html.trim() ||
    customSiteCode.css.trim() ||
    customSiteCode.js.trim()
  );

  const updateCustomSiteCode = (field, value) => {
    const key = field === 'html' ? 'custom_site_html' : field === 'css' ? 'custom_site_css' : 'custom_site_js';
    setCustomSiteErrors([]);
    setCustomSiteWarnings([]);
    setSettings(s => ({ ...s, [key]: value }));
  };

  const seedCustomSiteStarter = () => {
    if (hasCustomSiteDraft && !window.confirm('Replace the current custom-site draft with a fresh starter generated from your portfolio data?')) return;
    const starter = buildStarterCustomSite(user, myProjects, settings);
    setCustomSiteErrors([]);
    setCustomSiteWarnings([]);
    setSettings(s => ({
      ...s,
      custom_site_html: starter.html,
      custom_site_css: starter.css,
      custom_site_js: starter.js,
    }));
    setCodeTab('site-html');
    toast.success('Starter custom site generated.');
  };

  const saveCustomSite = async (enabled = settings.custom_site_enabled === true) => {
    const localErrors = validateCustomSiteClient(customSiteCode, enabled);
    setCustomSiteErrors([]);
    setCustomSiteWarnings([]);
    if (localErrors.length) {
      toast.error('Fix the custom-site security issues before saving.');
      return;
    }

    setCustomSiteSaving(true);
    try {
      const res = await api.put('/settings/custom-site', {
        custom_site_enabled: enabled,
        custom_site_html: customSiteCode.html,
        custom_site_css: customSiteCode.css,
        custom_site_js: customSiteCode.js,
      });
      const saved = res.data?.settings || {};
      const nextPatch = {
        custom_site_enabled: saved.custom_site_enabled === true,
        custom_site_html: typeof saved.custom_site_html === 'string' ? saved.custom_site_html : '',
        custom_site_css: typeof saved.custom_site_css === 'string' ? saved.custom_site_css : '',
        custom_site_js: typeof saved.custom_site_js === 'string' ? saved.custom_site_js : '',
        custom_site_updated_at: saved.custom_site_updated_at || '',
      };
      setSettings(s => ({ ...s, ...nextPatch }));
      setSavedSettings(s => ({ ...(s || {}), ...nextPatch }));
      setCustomSiteWarnings(res.data?.warnings || []);
      toast.success(res.data?.message || 'Custom site saved.');
      try { new BroadcastChannel('pf-settings').postMessage('pf-settings-saved'); } catch {}
    } catch (error) {
      const details = error.response?.data?.details;
      setCustomSiteErrors(Array.isArray(details) ? details.map(item => ({
        field: item.field || 'Custom site',
        message: item.message || String(item),
      })) : []);
      setCustomSiteWarnings(error.response?.data?.warnings || []);
      toast.error(error.response?.data?.error || 'Custom site save failed.');
    } finally {
      setCustomSiteSaving(false);
    }
  };

  const hasAppliedAgentChanges = agentDesignActive || agentChangeSets.some(changeSet => changeSet.status === 'applied');

  const inner = (
    <>
      {!noLayout && (
        <>
          <h1 className="page-title mb-2">Portfolio Settings</h1>
          <p className="page-subtitle mb-8">Customize how your portfolio looks to visitors.</p>
        </>
      )}

      <div className="max-w-7xl space-y-6">

        {/* ── Visibility ──────────────────────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">Visibility</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Public portfolio</div>
              <div className="text-xs text-ink-muted">Anyone with your link can view your portfolio</div>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, is_public: !s.is_public }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.is_public ? 'bg-accent' : 'bg-surface-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_public ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {settings.is_public ? null : (
            <div className="mt-3 flex gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl text-xs text-yellow-800 dark:text-yellow-300">
              <EngineeringIcon name="warning-signal" size="1rem" />
              <span>Your portfolio is currently private. Only you can see it.</span>
            </div>
          )}
        </div>

        {/* ── Theme ───────────────────────────────────────────────────── */}
        {(agentDesignActive || manualOverrideCount > 0 || (settings.agent_custom_css || '').trim()) && (
          <div className="card p-5 border-accent-border bg-accent-surface/60">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">Customization layers</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full  ${
                    agentDesignActive
                      ? 'bg-accent text-white'
                      : 'bg-surface-muted text-ink-muted dark:text-ink-faint'
                  }`}>
                    {agentDesignActive ? 'AI design active' : 'Manual only'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  Manual settings, generated sections, design tokens, interactions, and CSS now save as separate layers.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded-lg bg-white/80 border border-accent-border text-ink-secondary">
                    Manual overrides: {manualOverrideCount}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white/80 border border-accent-border text-ink-secondary">
                    AI sections: {generatedSections.length}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white/80 border border-accent-border text-ink-secondary">
                    Generated CSS: {(settings.agent_custom_css || '').trim() ? 'present' : 'none'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => document.getElementById('site-agent-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="btn-secondary text-xs"
                >
                  View AI changes
                </button>
                {manualOverrideCount > 0 && (
                  <button onClick={resetManualDesignOverrides} className="btn-secondary text-xs">
                    Reset manual overrides
                  </button>
                )}
                {agentDesignActive && (
                  <button
                    onClick={() => resetAgentChanges('visual')}
                    disabled={Boolean(agentResettingMode)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    {agentResettingMode === 'visual' ? 'Removing...' : 'Remove AI design'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">Theme</h3>
          {agentDesignActive && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 mb-4">
              AI design is active. Changing this updates your manual foundation and may override part of the AI layer.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => setSettings(s => ({ ...s, theme: t.id }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  settings.theme === t.id
                    ? 'border-accent bg-accent-surface'
                    : 'border-line-subtle hover:border-line'
                }`}
              >
                <div className="text-sm font-medium text-ink">{t.label}</div>
                <div className="text-xs text-ink-muted">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Layout ──────────────────────────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-1">Portfolio layout</h3>
          <p className="text-sm text-ink-muted mb-5">Choose how your public portfolio is structured.</p>
          {agentDesignActive && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 mb-4">
              AI design is active. Layout changes save as manual intent on top of the AI design.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4">
            {LAYOUTS.map(layout => (
              <button
                key={layout.id}
                onClick={() => setSettings(s => ({ ...s, layout: layout.id }))}
                className={`flex items-center gap-4 p-3 rounded-xl border-2 text-left transition-all ${
                  settings.layout === layout.id
                    ? 'border-accent bg-accent-surface dark:border-accent'
                    : 'border-line-subtle hover:border-line'
                }`}
              >
                <div className="w-36 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-line bg-surface">
                  <LayoutPreview layoutId={layout.id} accentColor={settings.accent_color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-ink text-sm">{layout.name}</span>
                    {settings.layout === layout.id && (
                      <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">{layout.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Accent color ─────────────────────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">Accent color</h3>
          {agentDesignActive && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 mb-4">
              Accent changes are saved as a manual override so generated styling remains removable.
            </p>
          )}
          <div className="flex gap-3 flex-wrap">
            {ACCENTS.map(color => (
              <button
                key={color}
                onClick={() => setSettings(s => ({ ...s, accent_color: color }))}
                style={{ backgroundColor: color }}
                className={`w-9 h-9 rounded-xl transition-transform hover:scale-110 ${settings.accent_color === color ? 'ring-2 ring-offset-2 ring-ink-muted scale-110' : ''}`}
              />
            ))}
            <input
              type="color"
              value={settings.accent_color || '#2563eb'}
              onChange={e => setSettings(s => ({ ...s, accent_color: e.target.value }))}
              className="w-9 h-9 rounded-xl cursor-pointer border border-line"
              title="Custom color"
            />
          </div>
        </div>

        {/* ── Section order (drag-and-drop) ────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-1">Section order</h3>
          <p className="text-sm text-ink-muted mb-5">
            Drag sections to reorder them on your public portfolio page.
          </p>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="sections">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-2 rounded-xl transition-colors ${snapshot.isDraggingOver ? 'bg-accent-surface' : ''}`}
                >
                  {settings.section_order.map((sectionId, index) => {
                    const section = resolveSectionDefinition(sectionId);
                    if (!section) return null;
                    return (
                      <Draggable
                        key={sectionId}
                        draggableId={sectionId}
                        index={index}
                        isDragDisabled={section.required && settings.section_order.length <= 1}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all select-none ${
                              snapshot.isDragging
                                ? 'border-accent bg-accent-surface shadow-pop'
                                : 'border-line-subtle bg-surface/50'
                            }`}
                          >
                            {/* Drag handle */}
                            <div
                              {...provided.dragHandleProps}
                              className="flex flex-col gap-0.5 px-1 cursor-grab active:cursor-grabbing flex-shrink-0 opacity-40 hover:opacity-70"
                            >
                              <div className="w-4 h-0.5 bg-current rounded" />
                              <div className="w-4 h-0.5 bg-current rounded" />
                              <div className="w-4 h-0.5 bg-current rounded" />
                            </div>

                            {/* Icon */}
                            <span className="text-xl flex-shrink-0"><EngineeringIcon name={section.icon} size="1.2rem" /></span>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">
                                  {section.label}
                                </span>
                                {section.required && (
                                  <span className="text-xs text-ink-faint bg-surface-muted px-1.5 py-0.5 rounded">
                                    required
                                  </span>
                                )}
                                {section.generated && (
                                  <span className="text-xs text-accent-text bg-accent-surface px-1.5 py-0.5 rounded">
                                    AI section
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink-muted">{section.desc}</p>
                            </div>

                            {/* Position badge + remove for optional sections */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs font-mono text-ink-faint dark:text-ink-muted">{index + 1}</span>
                              {!section.required && (
                                <button
                                  onClick={() => section.generated ? deleteGeneratedSection(sectionId) : removeSection(sectionId)}
                                  title={section.generated ? 'Delete generated section' : 'Remove section'}
                                  aria-label={section.generated ? 'Delete generated section' : 'Remove section'}
                                  className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-surface-muted transition-all text-xs leading-none"
                                >x</button>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add optional sections not yet in the order */}
          {Object.entries(ALL_SECTIONS)
            .filter(([id, def]) => !def.required && !settings.section_order.includes(id))
            .length > 0 && (
            <div className="mt-4 pt-4 border-t border-line-subtle">
              <p className="text-xs text-ink-faint mb-2">Add optional sections</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ALL_SECTIONS)
                  .filter(([id, def]) => !def.required && !settings.section_order.includes(id))
                  .map(([id, def]) => (
                    <button
                      key={id}
                      onClick={() => addSection(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-dashed border-line text-ink-muted hover:border-accent hover:text-accent-text transition-all"
                    >
                      <EngineeringIcon name={def.icon} size="1rem" />
                      <span>+ {def.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {generatedSections.some(section => section?.id && !settings.section_order.includes(section.id)) && (
            <div className="mt-4 pt-4 border-t border-line-subtle">
              <p className="text-xs text-ink-faint mb-2">Hidden AI sections</p>
              <div className="flex flex-wrap gap-2">
                {generatedSections
                  .filter(section => section?.id && !settings.section_order.includes(section.id))
                  .map(section => (
                    <button
                      key={section.id}
                      onClick={() => addSection(section.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-dashed border-accent-border text-accent-text hover:bg-accent-surface transition-all"
                    >
                      <span>AI</span>
                      <span>+ {section.title || section.heading || section.id}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <p className="text-xs text-ink-faint mt-3">
            Changes are applied when you save settings below.
          </p>
        </div>

        {/* ── Contact section toggle ───────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Show contact section</div>
              <div className="text-xs text-ink-muted">Displays a contact / connect section at the bottom of your portfolio</div>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, show_contact_form: !s.show_contact_form }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.show_contact_form ? 'bg-accent' : 'bg-surface-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.show_contact_form ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Section visibility ───────────────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-1">Section visibility</h3>
          <p className="text-sm text-ink-muted mb-5">Choose which details appear on your public portfolio.</p>
          <div className="space-y-4">
            {[
              { key: 'show_skills',       label: 'Skills',        desc: 'Your skill tags in the profile header' },
              { key: 'show_dates',        label: 'Project dates', desc: 'Start / end dates on project cards'    },
              { key: 'show_project_type', label: 'Project type',  desc: 'e.g. Research, Software, Robotics'    },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{label}</div>
                  <div className="text-xs text-ink-muted">{desc}</div>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings[key] ? 'bg-accent' : 'bg-surface-muted'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[key] ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section customization ───────────────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-1">Section customization</h3>
          <p className="text-sm text-ink-muted mb-5">Fine-tune the look of each section independently.</p>

          {/* Header section */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-ink-muted mb-3 inline-flex items-center gap-2">
              <EngineeringIcon name="team-node" size="1rem" />
              Profile header
            </h4>
            <div className="space-y-3">
              <div>
                <label className="form-label text-xs">Spacing</label>
                <div className="flex gap-2">
                  {['compact', 'normal', 'spacious'].map(v => (
                    <button key={v} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, header: { ...s.section_config?.header, spacing: v } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                        (settings.section_config?.header?.spacing || 'normal') === v
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Background</label>
                <div className="flex gap-2">
                  {[
                    { id: 'none', label: 'None' },
                    { id: 'tint', label: 'Subtle tint' },
                    { id: 'band', label: 'Color band' },
                  ].map(v => (
                    <button key={v.id} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, header: { ...s.section_config?.header, bg: v.id } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        (settings.section_config?.header?.bg || 'none') === v.id
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Projects section */}
          <div className="mb-6 pt-5 border-t border-line-subtle">
            <h4 className="text-xs font-semibold text-ink-muted mb-3 inline-flex items-center gap-2">
              <EngineeringIcon name="project-module" size="1rem" />
              Projects
            </h4>
            <div className="space-y-3">
              <div>
                <label className="form-label text-xs">Cards per row</label>
                <div className="flex gap-2">
                  {[
                    { id: 'auto', label: 'Auto' },
                    { id: '2', label: '2' },
                    { id: '3', label: '3' },
                  ].map(v => (
                    <button key={v.id} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, projects: { ...s.section_config?.projects, columns: v.id } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        (settings.section_config?.projects?.columns || 'auto') === v.id
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Card style</label>
                <div className="flex gap-2">
                  {[
                    { id: 'rounded', label: 'Rounded' },
                    { id: 'sharp', label: 'Sharp' },
                    { id: 'pill', label: 'Soft' },
                  ].map(v => (
                    <button key={v.id} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, projects: { ...s.section_config?.projects, card_style: v.id } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        (settings.section_config?.projects?.card_style || 'rounded') === v.id
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Card spacing</label>
                <div className="flex gap-2">
                  {['tight', 'normal', 'loose'].map(v => (
                    <button key={v} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, projects: { ...s.section_config?.projects, spacing: v } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                        (settings.section_config?.projects?.spacing || 'normal') === v
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-xs font-medium text-ink">Show tagline</div>
                  <div className="text-xs text-ink-muted">One-line description under project title</div>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, projects: { ...s.section_config?.projects, show_tagline: !(s.section_config?.projects?.show_tagline !== false) } } }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings.section_config?.projects?.show_tagline !== false ? 'bg-accent' : 'bg-surface-muted'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.section_config?.projects?.show_tagline !== false ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Contact section */}
          <div className="pt-5 border-t border-line-subtle">
            <h4 className="text-xs font-semibold text-ink-muted mb-3 inline-flex items-center gap-2">
              <EngineeringIcon name="mail" size="1rem" />
              Contact section
            </h4>
            <div className="space-y-3">
              <div>
                <label className="form-label text-xs">Background style</label>
                <div className="flex gap-2">
                  {[
                    { id: 'muted', label: 'Gray wash' },
                    { id: 'tint', label: 'Accent tint' },
                    { id: 'none', label: 'None' },
                  ].map(v => (
                    <button key={v.id} onClick={() => setSettings(s => ({ ...s, section_config: { ...s.section_config, contact: { ...s.section_config?.contact, bg: v.id } } }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        (settings.section_config?.contact?.bg || 'muted') === v.id
                          ? 'border-accent bg-accent-surface text-accent-text'
                          : 'border-line-subtle text-ink-muted hover:border-ink-faint'
                      }`}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Education & Credentials editor ─────────────────────────── */}
        {settings.section_order.includes('education') && (
          <div className="card p-6">
            <h3 className="font-semibold text-ink mb-1">Education & Credentials</h3>
            <p className="text-sm text-ink-muted mb-5">
              Degrees, certifications, awards, and courses shown on your portfolio.
            </p>

            <div className="space-y-3">
              {credentials.map(cred => {
                const typeInfo = CRED_TYPES.find(t => t.id === cred.type) || CRED_TYPES[0];
                const isExpanded = expandedCredId === cred.id;
                return (
                  <div key={cred.id} className="border border-line-subtle rounded-xl overflow-hidden">
                    {/* Collapsed card */}
                    {!isExpanded && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-lg flex-shrink-0"><EngineeringIcon name={typeInfo.icon} size="1.1rem" /></span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink truncate">
                            {cred.title || <span className="text-ink-faint italic">Untitled</span>}
                          </div>
                          <div className="text-xs text-ink-muted truncate">
                            {[cred.institution, credYears(cred)].filter(Boolean).join(' - ')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setCredDraft({...cred}); setExpandedCredId(cred.id); setAddingCred(false); }}
                            className="px-2.5 py-1 text-xs rounded-lg border border-line text-ink-muted hover:text-ink hover:border-ink-faint transition-all"
                          >Edit</button>
                          <button
                            onClick={() => deleteCredential(cred.id)}
                            className="px-2.5 py-1 text-xs rounded-lg border border-line text-ink-faint hover:text-red-500 hover:border-red-300 transition-all"
                          >x</button>
                        </div>
                      </div>
                    )}

                    {/* Expanded edit form */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-surface-muted/50">
                        {/* Type selector */}
                        <div>
                          <label className="form-label text-xs">Type</label>
                          <div className="flex gap-2">
                            {CRED_TYPES.map(t => (
                              <button
                                key={t.id}
                                onClick={() => setCredDraft(d => ({...d, type: t.id}))}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  credDraft.type === t.id
                                    ? 'border-accent bg-accent-surface text-accent-text'
                                    : 'border-line text-ink-muted hover:border-ink-faint'
                                }`}
                              ><EngineeringIcon name={t.icon} size="1rem" /><span className="hidden sm:inline">{t.label}</span></button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="form-label text-xs">Title</label>
                            <input value={credDraft.title || ''} onChange={e => setCredDraft(d => ({...d, title: e.target.value}))} placeholder="e.g. B.S. Computer Science" className="form-input text-sm" />
                          </div>
                          <div className="col-span-2">
                            <label className="form-label text-xs">Institution</label>
                            <input value={credDraft.institution || ''} onChange={e => setCredDraft(d => ({...d, institution: e.target.value}))} placeholder="e.g. Massachusetts Institute of Technology" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Field / Subject <span className="font-normal text-ink-faint">(optional)</span></label>
                            <input value={credDraft.field || ''} onChange={e => setCredDraft(d => ({...d, field: e.target.value}))} placeholder="e.g. Electrical Engineering" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Honors / Note <span className="font-normal text-ink-faint">(optional)</span></label>
                            <input value={credDraft.honors || ''} onChange={e => setCredDraft(d => ({...d, honors: e.target.value}))} placeholder="e.g. Summa Cum Laude" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Year start <span className="font-normal text-ink-faint">(optional)</span></label>
                            <input value={credDraft.year_start || ''} onChange={e => setCredDraft(d => ({...d, year_start: e.target.value}))} placeholder="2020" maxLength={4} className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Year end <span className="font-normal text-ink-faint">(optional)</span></label>
                            <input value={credDraft.year_end || ''} onChange={e => setCredDraft(d => ({...d, year_end: e.target.value}))} placeholder="2024 or Present" className="form-input text-sm" />
                          </div>
                          <div className="col-span-2">
                            <label className="form-label text-xs">Credential URL <span className="font-normal text-ink-faint">(optional)</span></label>
                            <input value={credDraft.url || ''} onChange={e => setCredDraft(d => ({...d, url: e.target.value}))} placeholder="https://..." className="form-input text-sm" />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveCredential} disabled={!credDraft.title && !credDraft.institution} className="btn-primary text-sm py-1.5 px-4">Save</button>
                          <button onClick={() => { setExpandedCredId(null); setCredDraft({}); }} className="text-sm px-4 py-1.5 rounded-xl border border-line text-ink-muted hover:text-ink transition-all">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add credential form */}
              {addingCred && (
                <div className="border border-accent-border rounded-xl overflow-hidden">
                  <div className="p-4 space-y-3 bg-accent-surface/50">
                    <div>
                      <label className="form-label text-xs">Type</label>
                      <div className="flex gap-2">
                        {CRED_TYPES.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setCredDraft(d => ({...d, type: t.id}))}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              credDraft.type === t.id
                                ? 'border-accent bg-accent-surface text-accent-text'
                                : 'border-line text-ink-muted hover:border-ink-faint'
                            }`}
                          ><EngineeringIcon name={t.icon} size="1rem" /><span className="hidden sm:inline">{t.label}</span></button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="form-label text-xs">Title</label>
                        <input autoFocus value={credDraft.title || ''} onChange={e => setCredDraft(d => ({...d, title: e.target.value}))} placeholder="e.g. B.S. Computer Science" className="form-input text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label text-xs">Institution</label>
                        <input value={credDraft.institution || ''} onChange={e => setCredDraft(d => ({...d, institution: e.target.value}))} placeholder="e.g. Massachusetts Institute of Technology" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Field / Subject <span className="font-normal text-ink-faint">(optional)</span></label>
                        <input value={credDraft.field || ''} onChange={e => setCredDraft(d => ({...d, field: e.target.value}))} placeholder="e.g. Electrical Engineering" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Honors / Note <span className="font-normal text-ink-faint">(optional)</span></label>
                        <input value={credDraft.honors || ''} onChange={e => setCredDraft(d => ({...d, honors: e.target.value}))} placeholder="e.g. Summa Cum Laude" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Year start <span className="font-normal text-ink-faint">(optional)</span></label>
                        <input value={credDraft.year_start || ''} onChange={e => setCredDraft(d => ({...d, year_start: e.target.value}))} placeholder="2020" maxLength={4} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Year end <span className="font-normal text-ink-faint">(optional)</span></label>
                        <input value={credDraft.year_end || ''} onChange={e => setCredDraft(d => ({...d, year_end: e.target.value}))} placeholder="2024 or Present" className="form-input text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label text-xs">Credential URL <span className="font-normal text-ink-faint">(optional)</span></label>
                        <input value={credDraft.url || ''} onChange={e => setCredDraft(d => ({...d, url: e.target.value}))} placeholder="https://..." className="form-input text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveCredential} disabled={!credDraft.title && !credDraft.institution} className="btn-primary text-sm py-1.5 px-4">Add credential</button>
                      <button onClick={() => { setAddingCred(false); setCredDraft({}); }} className="text-sm px-4 py-1.5 rounded-xl border border-line text-ink-muted hover:text-ink transition-all">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!addingCred && (
              <button
                onClick={() => { setCredDraft(BLANK_CRED()); setAddingCred(true); setExpandedCredId(null); }}
                className="mt-4 flex items-center gap-2 text-sm text-accent-text hover:underline"
              >
                + Add credential
              </button>
            )}
          </div>
        )}

        {/* Endorsements manager */}
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-1">Endorsements</h3>
          <p className="text-sm text-ink-muted mb-5">
            Collect real testimonials from collaborators and mentors. Each submission is reviewed before appearing on your portfolio.
          </p>
          {!settings.section_order.includes('endorsements') && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg mb-4">
              Endorsements are hidden on your portfolio. Add them in <strong>Section order</strong> above to display approved testimonials publicly.
            </p>
          )}

          {endorsements.filter(e => !e.quote).length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-ink-faint mb-2">Awaiting response ({endorsements.filter(e => !e.quote).length})</p>
              <div className="space-y-2">
                {endorsements.filter(e => !e.quote).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line-subtle text-sm">
                    <EngineeringIcon name="clock" size="1rem" className="text-ink-faint" />
                    <div className="flex-1 min-w-0">
                      <span className="text-ink-muted">{e.from_email || 'No email'}</span>
                      {e.project_title && <span className="text-ink-faint ml-2">/ {e.project_title}</span>}
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/endorse/${e.token}`); }}
                      className="text-xs text-accent-text hover:underline"
                      title="Copy submission link"
                    >Copy link</button>
                    <button onClick={() => deleteEndorsement(e.id)} className="text-xs text-ink-faint hover:text-red-500">x</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endorsements.filter(e => e.quote && !e.is_approved && !e.is_rejected).length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-amber-500 mb-2">
                Pending review ({endorsements.filter(e => e.quote && !e.is_approved && !e.is_rejected).length})
              </p>
              <div className="space-y-3">
                {endorsements.filter(e => e.quote && !e.is_approved && !e.is_rejected).map(e => (
                  <div key={e.id} className="rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4">
                    <p className="text-sm text-ink-secondary italic mb-2">"{e.quote}"</p>
                    <p className="text-xs text-ink-muted">{e.from_name}{e.from_role ? `, ${e.from_role}` : ''}</p>
                    {e.project_title && <p className="text-xs text-ink-faint mt-0.5">Re: {e.project_title}</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => approveEndorsement(e.id)} className="btn-primary text-xs py-1.5 px-3">Approve</button>
                      <button onClick={() => rejectEndorsement(e.id)} className="text-xs px-3 py-1.5 rounded-xl border border-line text-ink-muted hover:text-red-500 hover:border-red-300 transition-all">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endorsements.filter(e => e.is_approved).length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-green-600 mb-2">
                Approved for public display ({endorsements.filter(e => e.is_approved).length})
              </p>
              <div className="space-y-2">
                {endorsements.filter(e => e.is_approved).map(e => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-line-subtle text-sm">
                    <EngineeringIcon name="award-badge" size="1rem" className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-ink-secondary text-xs italic line-clamp-2">"{e.quote}"</p>
                      <p className="text-xs text-ink-faint mt-0.5">{e.from_name}{e.from_role ? `, ${e.from_role}` : ''}</p>
                    </div>
                    <button onClick={() => deleteEndorsement(e.id)} className="text-xs text-ink-faint hover:text-red-500 flex-shrink-0">x</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endorsements.filter(e => e.is_rejected).length > 0 && (
            <details className="mb-4">
              <summary className="text-xs text-ink-faint cursor-pointer hover:text-ink-secondary select-none">
                {endorsements.filter(e => e.is_rejected).length} rejected
              </summary>
              <div className="mt-2 space-y-2">
                {endorsements.filter(e => e.is_rejected).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line-subtle text-sm opacity-50">
                    <span className="flex-1 min-w-0 text-xs text-ink-faint truncate">"{e.quote}"</span>
                    <button onClick={() => deleteEndorsement(e.id)} className="text-xs text-ink-faint hover:text-red-400">x</button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {endorseRequestOpen ? (
            <div className="border border-accent-border rounded-xl p-4 space-y-3 bg-accent-surface/50">
              <p className="text-sm font-medium text-ink">Request an endorsement</p>
              <div>
                <label className="form-label text-xs">Email address <span className="text-ink-faint font-normal">(optional, leave blank to get a shareable link)</span></label>
                <input value={requestEmail} onChange={e => setRequestEmail(e.target.value)} type="email" placeholder="collaborator@example.com" className="form-input text-sm" />
              </div>
              <div>
                <label className="form-label text-xs">Link to a project <span className="text-ink-faint font-normal">(optional)</span></label>
                <select value={requestProjectId} onChange={e => setRequestProjectId(e.target.value)} className="form-input text-sm">
                  <option value="">No specific project</option>
                  {myProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Personal note <span className="text-ink-faint font-normal">(optional, included in email)</span></label>
                <input value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="We worked together on the ML pipeline last year..." className="form-input text-sm" />
              </div>
              {endorseLink && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-100 dark:border-green-800">
                  <span className="text-xs text-green-700 dark:text-green-400 truncate flex-1">{endorseLink}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(endorseLink); setEndorseLink(null); }}
                    className="text-xs text-green-600 font-medium whitespace-nowrap hover:underline"
                  >Copy link</button>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={requestEndorsement} disabled={requestingEndorse} className="btn-primary text-sm py-1.5 px-4">
                  {requestingEndorse ? 'Creating...' : requestEmail ? 'Send request' : 'Generate link'}
                </button>
                <button onClick={() => { setEndorseRequestOpen(false); setEndorseLink(null); }} className="text-sm px-4 py-1.5 rounded-xl border border-line text-ink-muted hover:text-ink transition-all">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setEndorseRequestOpen(true); setEndorseLink(null); }}
              className="flex items-center gap-2 text-sm text-accent-text hover:underline"
            >
              + Request an endorsement
            </button>
          )}
        </div>

        {/* ── SEO ─────────────────────────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-ink">SEO & sharing</h3>
          <div>
            <label className="form-label">Page title (for Google / search)</label>
            <input
              value={settings.seo_title || ''}
              onChange={e => setSettings(s => ({ ...s, seo_title: e.target.value }))}
              placeholder={`${user?.full_name} - Engineering Portfolio`}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Meta description</label>
            <textarea
              value={settings.seo_description || ''}
              onChange={e => setSettings(s => ({ ...s, seo_description: e.target.value }))}
              rows={2}
              className="form-textarea"
              placeholder="A brief description for search engines and link previews."
            />
          </div>
        </div>

        {/* ── Portfolio URL ────────────────────────────────────────────── */}
        <div className="card p-5 bg-accent-surface border border-accent-border">
          <div className="text-sm font-medium text-accent-text mb-1">Your portfolio URL</div>
          <div className="font-mono text-sm text-accent-text mb-3">{portfolioUrl}</div>
          <div className="flex gap-3">
            <a href={`/${user?.username}`} target="_blank" rel="noreferrer" className="btn-primary text-xs">
              <EngineeringIcon name="eye-view" size="1rem" />
              Preview
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(portfolioUrl); toast.success('Copied!'); }}
              className="btn-secondary text-xs"
            >
              Copy link
            </button>
          </div>
        </div>

        {/* AI Editor */}
        <div
          id="site-agent-workspace"
          className="md:w-[min(72rem,calc(100vw-3rem))] lg:w-[min(72rem,calc(100vw-20rem))]"
        >
          <AgentWorkspace
            user={user}
            settings={settings}
            threads={agentThreads}
            threadId={agentThreadId}
            messages={agentMessages}
            prompt={agentPrompt}
            loading={agentLoading}
            changeSet={agentChangeSet}
            changeSets={agentChangeSets}
            applying={agentApplying}
            warning={agentWarning}
            models={agentModels}
            modelId={agentModelId}
            modes={agentModes}
            mode={agentMode}
            memories={agentMemories}
            revertingId={agentRevertingId}
            verifyingId={agentVerifyingId}
            removingId={agentRemovingId}
            resettingMode={agentResettingMode}
            onLoadThread={loadAgentThread}
            onModeChange={setAgentMode}
            onModelChange={persistAgentModel}
            onPromptChange={setAgentPrompt}
            onSubmit={handleAgentChat}
            onDismissWarning={() => setAgentWarning(null)}
            onApply={applyAgentChangeSet}
            onDiscard={discardAgentChangeSet}
            onRevert={revertAgentChangeSet}
            onVerifyLive={verifyAgentChangeSetLive}
            onRemove={removeAgentChangeSurfaces}
            onReset={resetAgentChanges}
            onDeleteMemory={deleteAgentMemory}
            onDeleteThread={deleteAgentThread}
            onClarificationAnswer={handleAgentClarificationAnswer}
          />
        </div>
        {/* ── Custom Code ──────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setCustomCodeOpen(open => !open)}
            className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-surface-muted"
            aria-expanded={customCodeOpen}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">Custom Code</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-accent-surface text-accent-text rounded-full ">Advanced</span>
                {settings.custom_site_enabled && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-full ">Published</span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Advanced CSS and sandboxed custom-site files. Hidden by default so everyday portfolio settings stay focused.
              </p>
            </div>
            <span className="flex-shrink-0 text-xs font-semibold text-accent-text">
              {customCodeOpen ? 'Hide editor' : 'Open editor'}
            </span>
          </button>
          {customCodeOpen && (
          <div className="border-t border-line-subtle p-6">

          {hasAppliedAgentChanges && (
            <div className="mb-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">AI design recovery</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Clearing manual CSS will not remove generated sections, design tokens, animations, interactions, or generated CSS.
                  </p>
                </div>
                <button
                  onClick={() => resetAgentChanges('visual')}
                  disabled={Boolean(agentResettingMode)}
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {agentResettingMode === 'visual' ? 'Resetting...' : 'Remove AI design'}
                </button>
              </div>
            </div>
          )}

          {/* Code Editor Tabs */}
          <div className="flex flex-wrap border-b border-line mb-4 gap-1">
            {[
              { id: 'css', label: 'Scoped CSS', desc: 'Standard portfolio styles' },
              { id: 'site-html', label: 'index.html', desc: 'Custom site markup' },
              { id: 'site-css', label: 'styles.css', desc: 'Custom site styles' },
              { id: 'site-js', label: 'script.js', desc: 'Sandboxed custom site logic' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCodeTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  codeTab === tab.id
                    ? 'border-accent text-accent-text'
                    : 'border-transparent text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Live preview of current (saved) custom code */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-ink-muted">
              Scoped CSS affects the standard portfolio. Custom-site files publish only through the sandboxed Advanced Custom Site mode.
            </span>
            <a
              href={`/${user?.username}?preview=1`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-accent-text hover:underline flex items-center gap-1"
            >
              <EngineeringIcon name="eye-view" size="0.95rem" />
              Open standard preview
            </a>
          </div>

          {codeTab === 'css' && (
            <div>
              <div className="mb-4 rounded-xl border border-line bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-ink">Manual CSS</p>
                    <p className="text-[11px] text-ink-muted">Editable. This layer stays even when you remove AI design.</p>
                  </div>
                  {(settings.agent_custom_css || '').trim() && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-accent-surface text-accent-text">
                      Generated CSS is protected
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-ink-muted mb-3 space-y-1.5">
                <p className="font-medium text-ink-secondary">Use CSS variables for colors (always work, theme-aware):</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                  {[
                    ['--pf-accent', 'your brand color'],
                    ['--pf-accent-20', 'accent at 20% opacity'],
                    ['--pf-bg', 'page background'],
                    ['--pf-card-bg', 'card background'],
                    ['--pf-text', 'primary text'],
                    ['--pf-subtext', 'secondary text'],
                  ].map(([v, d]) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <code className="bg-surface-muted px-1.5 py-0.5 rounded text-accent-text">{v}</code>
                      <span className="text-ink-faint truncate">{d}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1">Target portfolio classes directly. The public renderer scopes them for you: <code className="bg-surface-muted px-1 rounded text-[10px]">.pf-project-card {'{ background: var(--pf-accent-20); }'}</code></p>
              </div>
              <div className="rounded-xl overflow-hidden border border-line max-w-full min-w-0">
                <CodeMirror
                  value={settings.manual_custom_css || ''}
                  height="460px"
                  extensions={[cmCss(), EditorView.lineWrapping]}
                  theme={oneDark}
                  onChange={val => setSettings(s => ({ ...s, manual_custom_css: val, custom_css: [val, agentDesignActive ? (s.agent_custom_css || '') : ''].filter(Boolean).join('\n\n') }))}
                  placeholder={"/* Add custom styles here */\n.pf-project-card {\n  transition: transform 0.2s ease;\n}\n.pf-project-card:hover {\n  transform: translateY(-4px);\n}"}
                  basicSetup={{ lineNumbers: true, foldGutter: true }}
                />
              </div>
              {(settings.manual_custom_css || '').trim() && (
                <button
                  onClick={() => { if (confirm('Clear manual CSS only?\n\nGenerated AI CSS and design layers will remain until you use Remove AI design.')) setSettings(s => ({ ...s, manual_custom_css: '', custom_css: agentDesignActive ? (s.agent_custom_css || '') : '' })); }}
                  className="text-xs text-red-500 hover:underline mt-2"
                >
                  Clear manual CSS
                </button>
              )}
              {(settings.agent_custom_css || '').trim() && (
                <details className="mt-4 rounded-xl border border-accent-border bg-accent-surface/50">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-accent-text">
                    Generated CSS (read-only)
                  </summary>
                  <div className="border-t border-accent-border p-3">
                    <pre className="text-[11px] bg-gray-950 text-slate-200 rounded-xl p-3 overflow-x-auto max-h-56 whitespace-pre-wrap">{settings.agent_custom_css}</pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => resetAgentChanges('visual')}
                        disabled={Boolean(agentResettingMode)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-accent-border text-accent-text hover:bg-accent-surface disabled:opacity-50"
                      >
                        {agentResettingMode === 'visual' ? 'Removing...' : 'Remove generated design'}
                      </button>
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}

          {['site-html', 'site-css', 'site-js'].includes(codeTab) && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-white/70 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-ink">Advanced Custom Site</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full  ${
                        settings.custom_site_enabled
                          ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'bg-surface-muted text-ink-muted'
                      }`}>
                        {settings.custom_site_enabled ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-1">
                      Build a full custom portfolio from static HTML, CSS, and sandboxed JavaScript. The standard portfolio remains available as a fallback.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={seedCustomSiteStarter}
                      className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-secondary hover:bg-surface-muted"
                    >
                      Generate starter
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCustomSite(settings.custom_site_enabled === true)}
                      disabled={customSiteSaving}
                      className="text-xs px-3 py-1.5 rounded-lg border border-accent-border text-accent-text hover:bg-accent-surface disabled:opacity-50"
                    >
                      {customSiteSaving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCustomSite(!settings.custom_site_enabled)}
                      disabled={customSiteSaving || (!settings.custom_site_enabled && !customSiteCode.html.trim())}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                        settings.custom_site_enabled
                          ? 'bg-ink text-surface'
                          : 'bg-accent text-white hover:bg-accent-hover'
                      }`}
                    >
                      {settings.custom_site_enabled ? 'Unpublish' : 'Publish custom site'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(720px,1fr)_minmax(420px,520px)] gap-5">
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {codeTab === 'site-html' ? 'index.html' : codeTab === 'site-css' ? 'styles.css' : 'script.js'}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {codeTab === 'site-html'
                          ? 'Markup only. Script tags, inline event handlers, forms, iframes, and external link resources are blocked.'
                          : codeTab === 'site-css'
                            ? 'Styles are scoped to the sandbox document. External imports and script URLs are blocked.'
                            : 'Vanilla JavaScript runs only inside a sandboxed iframe. Network, storage, cookies, parent-window access, eval, and imports are blocked.'}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-ink-faint">
                      {codeTab === 'site-html'
                        ? `${customSiteCode.html.length.toLocaleString()} / ${CUSTOM_SITE_LIMITS.html.toLocaleString()}`
                        : codeTab === 'site-css'
                          ? `${customSiteCode.css.length.toLocaleString()} / ${CUSTOM_SITE_LIMITS.css.toLocaleString()}`
                          : `${customSiteCode.js.length.toLocaleString()} / ${CUSTOM_SITE_LIMITS.js.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-line max-w-full min-w-0">
                    <CodeMirror
                      value={codeTab === 'site-html' ? customSiteCode.html : codeTab === 'site-css' ? customSiteCode.css : customSiteCode.js}
                      height="640px"
                      extensions={[
                        ...(codeTab === 'site-css' ? [cmCss()] : codeTab === 'site-js' ? [cmJs()] : []),
                        EditorView.lineWrapping,
                      ]}
                      theme={oneDark}
                      onChange={val => updateCustomSiteCode(codeTab === 'site-html' ? 'html' : codeTab === 'site-css' ? 'css' : 'js', val)}
                      placeholder={codeTab === 'site-html'
                        ? '<main class="site-shell">...</main>'
                        : codeTab === 'site-css'
                          ? 'body { font-family: "DM Sans", system-ui, sans-serif; }'
                          : 'const { user, projects } = window.ProjectFolioData;'}
                      basicSetup={{ lineNumbers: true, foldGutter: true }}
                    />
                  </div>
                </div>

                <aside className="space-y-3">
                  <div className="rounded-xl border border-line overflow-hidden bg-surface">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-surface-muted">
                      <span className="text-[11px] font-semibold text-ink-secondary">Sandbox preview</span>
                      <span className="text-[10px] font-mono text-ink-faint">{customSiteTotalChars.toLocaleString()} chars</span>
                    </div>
                    <iframe
                      key={`${codeTab}-${customSiteTotalChars}`}
                      title="Custom site sandbox preview"
                      className="w-full bg-white"
                      style={{ height: 520, border: 0, display: 'block' }}
                      sandbox="allow-scripts"
                      referrerPolicy="no-referrer"
                      srcDoc={customSitePreviewDoc}
                    />
                  </div>

                  <div className={`rounded-xl border p-3 ${
                    customSiteCombinedErrors.length
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                      : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                  }`}>
                    <p className={`text-xs font-semibold ${
                      customSiteCombinedErrors.length ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'
                    }`}>
                      {customSiteCombinedErrors.length ? 'Security checks need attention' : 'Security checks passed'}
                    </p>
                    {customSiteCombinedErrors.length ? (
                      <ul className="mt-2 space-y-1">
                        {customSiteCombinedErrors.slice(0, 8).map((item, index) => (
                          <li key={`${item.field || 'field'}-${index}`} className="text-[11px] text-red-700 dark:text-red-300">
                            <span className="font-semibold">{item.field || 'Custom site'}:</span> {item.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[11px] text-green-700 dark:text-green-300">
                        Preview runs without same-origin access. Public rendering also applies server validation and CSP headers.
                      </p>
                    )}
                    {customSiteWarnings.length > 0 && (
                      <div className="mt-3 border-t border-current/10 pt-2">
                        {customSiteWarnings.slice(0, 3).map((warning, index) => (
                          <p key={index} className="text-[11px] text-amber-700 dark:text-amber-300">
                            {warning.message || warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-accent-border bg-accent-surface/70 p-3">
                    <p className="text-xs font-semibold text-accent-text">Available data</p>
                    <p className="text-[11px] text-accent-text mt-1">
                      Use <code className="font-mono">window.ProjectFolioData</code> for profile, projects, settings, and endorsements. No API keys or private backend data are exposed.
                    </p>
                    {settings.custom_site_enabled && user?.username && (
                      <a
                        href={`/${user.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-accent-text hover:underline"
                      >
                        <EngineeringIcon name="eye-view" size="0.9rem" />
                        Open published site
                      </a>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}

          {codeTab === 'js' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Custom JavaScript is disabled for public portfolio security. Use CSS, design settings, native animations, and interactions instead.
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
            <EngineeringIcon name="warning-signal" size="1rem" className="mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {codeTab === 'css'
                ? 'Scoped CSS runs directly on your standard public portfolio. Avoid overriding core layout styles unless you are intentionally changing the design. Changes take effect after saving settings.'
                : 'Custom-site code is isolated in a sandboxed iframe and revalidated by the backend before publishing. It cannot access app cookies, local storage, backend APIs, or the parent ProjectFolio page.'
              }
            </p>
          </div>
          </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save settings'}
        </button>

      </div>
    </>
  );

  return noLayout ? inner : <DashboardLayout>{inner}</DashboardLayout>;
}
