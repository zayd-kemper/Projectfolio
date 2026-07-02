// frontend/src/pages/PublicProjectPage.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { format } from 'date-fns';
import EngineeringIcon, { IconText, iconNameForEmoji } from '../components/shared/EngineeringIcon';
import FilePreview, { canPreviewFile, normalizePreviewUrl } from '../components/shared/FilePreview';
import { PublicProjectSkeleton } from '../components/shared/Skeleton';
import { recordPublicView } from '../utils/analytics';
import { DEFAULT_PORTFOLIO_ANIMATIONS, usePortfolioMotion } from '../utils/portfolioMotion';

const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

function sanitizeHtml(html = '') {
  if (typeof document === 'undefined' || !html) return '';
  const template = document.createElement('template');
  template.innerHTML = String(html);
  template.content.querySelectorAll('script, style, iframe, object, embed, svg, math, link, meta').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';
      if (name.startsWith('on') || name === 'style') node.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*(javascript:|data:text\/html)/i.test(value)) node.removeAttribute(attr.name);
    });
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  return template.innerHTML;
}

const cssToken = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  if (!text || /[;{}<>]/.test(text)) return fallback;
  return text.slice(0, 220);
};

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '').replace('#', '').trim();
  const expanded = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(37, 99, 235, ${alpha})`;
  const n = parseInt(expanded, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const processProjectCss = (css = '') => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|})\s*([^@{}][^{}]*)\{/g, (match, brace, selector) => {
    const scoped = selector.split(',').map(part => {
      const clean = part.trim();
      if (!clean) return '';
      if (clean.startsWith('#pf-root')) return clean;
      if (/^(html|body|:root|#root)(?=$|[\s.:#[>+~])/i.test(clean)) {
        return `#pf-root${clean.replace(/^(html|body|:root|#root)/i, '')}`;
      }
      if (clean.startsWith('.pf-portfolio')) return `#pf-root${clean.slice('.pf-portfolio'.length)}`;
      return `#pf-root ${clean}`;
    }).filter(Boolean).join(', ');
    return `${brace} ${scoped} {`;
  });

function PublicFileBlock({ content = {} }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewable = canPreviewFile(content);
  const safeUrl = normalizePreviewUrl(content?.url);

  return (
    <div className="my-5 space-y-3">
      <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl bg-gray-50">
        <span className="text-sm font-semibold text-gray-500">File</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{content?.filename || 'Attached file'}</div>
          <div className="text-xs text-gray-500">
            {content?.size ? `${(content.size / 1024).toFixed(1)} KB` : 'Attachment'}{!previewable ? ' - download required' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(open => !open)}
          className="btn-secondary text-xs px-3"
          aria-expanded={previewOpen}
        >
          {previewOpen ? 'Hide preview' : 'Preview'}
        </button>
        {safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs px-3">Download</a>
        ) : (
          <span className="text-xs font-medium text-gray-400">No safe link</span>
        )}
      </div>
      {previewOpen && <FilePreview file={content} />}
    </div>
  );
}

// Block renderer for public view
function BlockRenderer({ block }) {
  switch (block.type) {
    case 'text':
      return <div className="prose max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content?.html || '') }} />;
    case 'heading':
      const Tag = `h${block.content?.level || 2}`;
      const sizes = { 1: 'text-3xl', 2: 'text-2xl', 3: 'text-xl' };
      return <Tag className={`font-semibold text-gray-900 ${sizes[block.content?.level || 2]} mt-8 mb-4`}>{block.content?.text}</Tag>;
    case 'image':
      return (
        <figure className="my-6">
          <img src={block.content?.url} alt={block.content?.alt || ''} className="w-full rounded-xl max-h-[500px] object-cover" />
          {block.content?.caption && <figcaption className="text-sm text-gray-400 mt-2 text-center italic">{block.content.caption}</figcaption>}
        </figure>
      );
    case 'video': {
      const getEmbed = (url) => {
        const yt = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]+)/);
        if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
        const vm = url?.match(/vimeo\.com\/(\d+)/);
        if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
        return null;
      };
      const embed = getEmbed(block.content?.url);
      return (
        <figure className="my-6">
          {embed
            ? <div className="relative pb-[56.25%] h-0 rounded-xl overflow-hidden"><iframe src={embed} className="absolute inset-0 w-full h-full" frameBorder="0" allowFullScreen title="video" /></div>
            : <video src={block.content?.url} controls className="w-full rounded-xl" />}
          {block.content?.caption && <figcaption className="text-sm text-gray-400 mt-2 text-center italic">{block.content.caption}</figcaption>}
        </figure>
      );
    }
    case 'code':
      return (
        <div className="my-6 bg-gray-900 rounded-xl overflow-hidden">
          {block.content?.language && (
            <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 font-mono">{block.content.language}</div>
          )}
          <pre className="p-4 text-gray-100 text-sm overflow-x-auto font-mono leading-relaxed">
            <code>{block.content?.code}</code>
          </pre>
        </div>
      );
    case 'callout':
      return (
        <div className="my-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <EngineeringIcon name={block.content?.icon || iconNameForEmoji(block.content?.emoji) || 'idea-spark'} size="1.25rem" />
          <p className="text-amber-900 text-sm leading-relaxed">{block.content?.text}</p>
        </div>
      );
    case 'file':
      return <PublicFileBlock content={block.content || {}} />;
    case 'embed':
      return <iframe src={block.content?.url} className="w-full rounded-xl border border-gray-200 my-6" style={{ height: block.content?.height || 400 }} title="embed" />;
    case 'divider':
      return (
        <div className="flex items-center gap-3 my-10">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-300 text-xs">section</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      );
    case 'gallery': {
      const images = block.content?.images || [];
      if (!images.length) return null;
      const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
      return (
        <div className={`grid gap-2 my-6 ${gridCols}`}>
          {images.map((img, i) => (
            <figure key={i} className="relative rounded-xl overflow-hidden bg-gray-100">
              <img src={img.url} alt={img.caption || ''} className="w-full h-48 object-cover" />
              {img.caption && <figcaption className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1.5">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      );
    }
    case 'metrics': {
      const items = block.content?.items || [];
      const COLORS = [
        { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100'   },
        { bg: 'bg-green-50',  text: 'text-green-600',   border: 'border-green-100'  },
        { bg: 'bg-purple-50', text: 'text-purple-600',  border: 'border-purple-100' },
        { bg: 'bg-orange-50', text: 'text-orange-600',  border: 'border-orange-100' },
        { bg: 'bg-pink-50',   text: 'text-pink-600',    border: 'border-pink-100'   },
        { bg: 'bg-teal-50',   text: 'text-teal-600',    border: 'border-teal-100'   },
      ];
      const gridCols = items.length <= 2 ? 'grid-cols-2' : items.length <= 3 ? 'grid-cols-3' : items.length <= 4 ? 'grid-cols-4' : 'grid-cols-3';
      return (
        <div className={`grid gap-4 my-6 ${gridCols}`}>
          {items.map((item, i) => {
            const c = COLORS[i % COLORS.length];
            return (
              <div key={i} className={`${c.bg} border ${c.border} rounded-xl p-5`}>
                <div className={`text-3xl font-bold ${c.text} mb-0.5`}>
                  {item.value}<span className="text-sm font-normal opacity-70 ml-1">{item.unit}</span>
                </div>
                <div className="text-xs text-gray-500 font-medium"><IconText text={item.label} /></div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'table': {
      const headers = block.content?.headers || [];
      const rows = block.content?.rows || [];
      if (!headers.length) return null;
      return (
        <div className="my-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="border border-gray-200 bg-gray-50 px-4 py-2.5 text-left font-semibold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-200 px-4 py-2 text-gray-700">{cell || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'timeline': {
      const items = block.content?.items || [];
      return (
        <div className="my-6">
          {items.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200 mt-1 z-10" />
                {i < items.length - 1 && <div className="w-0.5 bg-blue-200 flex-1 my-1" style={{ minHeight: 28 }} />}
              </div>
              <div className="pb-5 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.date && <span className="text-xs font-mono text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-0.5">{item.date}</span>}
                  {item.title && <span className="text-sm font-semibold text-gray-900">{item.title}</span>}
                </div>
                {item.description && <p className="text-sm text-gray-500">{item.description}</p>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function PublicProjectPage() {
  const { username, projectSlug } = useParams();
  const [searchParams] = useSearchParams();
  const fromTeam = searchParams.get('from') === 'team';
  const teamSlug = searchParams.get('team');
  const backTo = fromTeam && teamSlug ? `/team/${teamSlug}` : `/${username}`;
  const backLabel = fromTeam && teamSlug ? teamSlug : username;
  const [data, setData] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const previewSignatureRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/portfolio/${username}/${projectSlug}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Not found.'))
      .finally(() => setLoading(false));
  }, [username, projectSlug]);

  useEffect(() => {
    if (!data?.subject_id || !data?.project?.id) return;
    recordPublicView({ subjectType: 'portfolio', subjectId: data.subject_id, projectId: data.project.id });
  }, [data?.subject_id, data?.project?.id]);

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type !== 'pf-preview') return;
      const requestId = event.data.requestId || null;
      const nextPreviewState = {
        css: typeof event.data.css === 'string' ? event.data.css : null,
        js: event.data.runJs === false ? '' : (typeof event.data.js === 'string' ? event.data.js : null),
        themeOverrides: event.data.themeOverrides || null,
        animations: event.data.animations || null,
        designSystem: event.data.designSystem || null,
        interactions: event.data.interactions || null,
        settings: event.data.settings || null,
      };
      const signature = JSON.stringify({ requestId, nextPreviewState });
      if (signature !== previewSignatureRef.current) {
        previewSignatureRef.current = signature;
        setPreviewState(nextPreviewState);
      }
      const acknowledge = () => {
        const message = { type: 'pf-preview-applied', requestId };
        try { window.postMessage(message, '*'); } catch {}
        try {
          if (window.parent && window.parent !== window) window.parent.postMessage(message, '*');
        } catch {}
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(acknowledge));
      } else {
        setTimeout(acknowledge, 50);
      }
    };
    window.addEventListener('message', handler);
    window.__pfPreviewReady = true;
    try { window.postMessage({ type: 'pf-preview-ready' }, '*'); } catch {}
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'pf-preview-ready' }, '*');
    } catch {}
    return () => window.removeEventListener('message', handler);
  }, []);

  const mergedSettings = useMemo(() => {
    const saved = data?.settings || {};
    if (!previewState) return saved;
    return {
      ...saved,
      ...(previewState.settings || {}),
      custom_css: previewState.css ?? saved.custom_css,
      custom_js: '',
      theme_overrides: previewState.themeOverrides ?? saved.theme_overrides,
      animations: previewState.animations ?? saved.animations,
      design_system: previewState.designSystem ?? saved.design_system,
      interactions: previewState.interactions ?? saved.interactions,
    };
  }, [data, previewState]);

  useEffect(() => {
    if (!data?.settings) return undefined;
    const settings = mergedSettings;
    const overrides = parseJson(settings.theme_overrides, {});
    const designSystem = parseJson(settings.design_system, {});
    const tokens = asObject(designSystem.tokens);
    const accent = tokens.accent || overrides.accentColor || settings.accent_color || '#2563eb';
    const pageBackground = tokens.background || overrides.pageBackground || '#ffffff';
    const cardBackground = tokens.surface || overrides.cardBackground || '#ffffff';
    const textColor = tokens.text || overrides.cardTextColor || '#111827';
    const mutedColor = tokens.muted || '#6b7280';
    const style = document.createElement('style');
    style.id = 'pf-project-css-vars';
    style.textContent = `
      #pf-root {
        --pf-accent: ${cssToken(accent, '#2563eb')};
        --pf-accent-10: ${hexToRgba(accent, 0.1)};
        --pf-accent-20: ${hexToRgba(accent, 0.2)};
        --pf-accent-30: ${hexToRgba(accent, 0.3)};
        --pf-bg: ${cssToken(pageBackground, '#ffffff')};
        --pf-card-bg: ${cssToken(cardBackground, '#ffffff')};
        --pf-text: ${cssToken(textColor, '#111827')};
        --pf-subtext: ${cssToken(mutedColor, '#6b7280')};
        --pf-radius: ${cssToken(tokens.radius, overrides.cardBorderRadius || '1rem')};
        --pf-shadow: ${cssToken(tokens.shadow, overrides.cardShadow || '0 1px 2px rgba(15,23,42,.06)')};
      }
      #pf-root { background: var(--pf-bg); color: var(--pf-text); }
      #pf-root .pf-project-shell,
      #pf-root .pf-project-meta,
      #pf-root .pf-project-block-card {
        background: var(--pf-card-bg);
        border-radius: var(--pf-radius);
        box-shadow: var(--pf-shadow);
      }
      #pf-root .tech-tag { background: var(--pf-accent-10); color: var(--pf-accent); }
      ${processProjectCss(settings.custom_css || '')}
    `;
    document.getElementById('pf-project-css-vars')?.remove();
    document.head.appendChild(style);
    return () => style.remove();
  }, [data, mergedSettings]);

  const interactionSettings = mergedSettings || {};
  const interactionOverrides = parseJson(interactionSettings.theme_overrides, {});
  const interactionDesignSystem = parseJson(interactionSettings.design_system, {});
  const interactionTokens = asObject(interactionDesignSystem.tokens);
  const interactionAccent = interactionTokens.accent || interactionOverrides.accentColor || interactionSettings.accent_color || '#2563eb';
  usePortfolioMotion({
    animations: parseJson(interactionSettings.animations, DEFAULT_PORTFOLIO_ANIMATIONS),
    interactions: parseArray(interactionSettings.interactions),
    accentColor: interactionAccent,
  });

  if (loading) return <PublicProjectSkeleton />;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-center p-6" style={{ colorScheme: 'light' }}>
      <div>
        <EngineeringIcon name="search-scan" size="3rem" className="mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Project not found</h2>
        <Link to={backTo} className="btn-primary mt-4">Back to portfolio</Link>
      </div>
    </div>
  );

  const { project, blocks } = data;
  const settings = mergedSettings || {};
  const themeOverrides = parseJson(settings.theme_overrides, {});
  const designSystem = parseJson(settings.design_system, {});
  const designDirection = designSystem.direction ? `pf-design-${String(designSystem.direction).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}` : '';
  const tokens = asObject(designSystem.tokens);
  const accentColor = tokens.accent || themeOverrides.accentColor || settings.accent_color || '#2563eb';
  const rootStyle = {
    ...(tokens.background || themeOverrides.pageBackground ? { background: tokens.background || themeOverrides.pageBackground } : {}),
    ...(themeOverrides.fontFamily ? { fontFamily: themeOverrides.fontFamily } : {}),
  };

  return (
    <div id="pf-root" className={`pf-portfolio pf-project-page min-h-screen bg-white ${designDirection}`} style={{ colorScheme: 'light', ...rootStyle }}>
      {/* Top nav */}
      <nav className="pf-nav sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100 px-6 py-3 flex items-center gap-4">
        <Link to={backTo} className="text-gray-400 hover:text-gray-700 text-sm flex items-center gap-1">
          {backLabel}
        </Link>
        <div className="flex-1" />
        <Link to="/" className="inline-flex items-center gap-1.5 text-gray-400 text-xs hover:text-gray-600">
          <EngineeringIcon name="brand-projectfolio" size="1rem" />
          ProjectFolio
        </Link>
      </nav>

      {/* Cover image */}
      {project.cover_image_url && (
        <div className="h-72 lg:h-96 overflow-hidden">
          <img src={project.cover_image_url} alt={project.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Project content */}
      <div className="pf-project-shell max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="pf-section pf-project-header mb-8">
          <div className="flex flex-wrap gap-2 mb-3">
            {project.project_type && (
              <span className="badge text-xs" style={{ background: hexToRgba(accentColor, 0.12), color: accentColor }}>{project.project_type}</span>
            )}
            {project.is_featured && (
              <span className="badge bg-yellow-50 text-yellow-700 text-xs inline-flex items-center gap-1">
                <EngineeringIcon name="award-badge" size="0.95rem" />
                Featured
              </span>
            )}
          </div>
          <h1 className="pf-project-title text-4xl lg:text-5xl font-bold text-gray-900 mb-3">{project.title}</h1>
          {project.tagline && <p className="pf-project-tagline text-xl text-gray-500 leading-relaxed">{project.tagline}</p>}
        </div>

        {/* Meta row */}
        <div className="pf-section pf-project-meta flex flex-wrap gap-6 py-4 border-y border-gray-100 mb-8 text-sm text-gray-500">
          {(project.start_date || project.end_date) && (
            <div>
              <span className="font-medium text-gray-700">Timeline</span><br />
              {project.start_date && format(new Date(project.start_date), 'MMM yyyy')}
              {project.end_date && ` - ${format(new Date(project.end_date), 'MMM yyyy')}`}
            </div>
          )}
          {project.technologies?.length > 0 && (
            <div>
              <span className="font-medium text-gray-700 block mb-1.5">Technologies</span>
              <div className="flex flex-wrap gap-1.5">
                {project.technologies.map(t => <span key={t} className="tech-tag">{t}</span>)}
              </div>
            </div>
          )}
          {project.collaborators?.length > 0 && (
            <div>
              <span className="font-medium text-gray-700">Collaborators</span><br />
              {project.collaborators.join(', ')}
            </div>
          )}
        </div>

        {/* Links */}
        {(project.github_url || project.live_url) && (
          <div className="flex gap-3 mb-8">
            {project.github_url && (
              <a href={project.github_url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
                GitHub →
              </a>
            )}
            {project.live_url && (
              <a href={project.live_url} target="_blank" rel="noreferrer" className="btn-primary text-sm">
                Live demo →
              </a>
            )}
          </div>
        )}

        {/* Content blocks */}
        <div className="pf-section space-y-2">
          {blocks.map(block => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-gray-100">
          <Link to={backTo} className="btn-secondary">
            {backLabel}'s {fromTeam ? 'team portfolio' : 'portfolio'}
          </Link>
        </div>
      </div>
    </div>
  );
}
