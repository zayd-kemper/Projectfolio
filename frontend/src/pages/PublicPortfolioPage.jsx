// frontend/src/pages/PublicPortfolioPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import EngineeringIcon, { IconText } from '../components/shared/EngineeringIcon';
import { PublicPortfolioSkeleton } from '../components/shared/Skeleton';
import { recordPublicView } from '../utils/analytics';
import { customSiteSrc } from '../utils/customSiteSrc';
import { DEFAULT_PORTFOLIO_ANIMATIONS, usePortfolioMotion } from '../utils/portfolioMotion';

const DEFAULT_SECTION_ORDER = ['header', 'projects', 'contact'];
const DEFAULT_ANIMATIONS = DEFAULT_PORTFOLIO_ANIMATIONS;

const THEME_CONFIG = {
  clean: {
    page: 'bg-white text-gray-900',
    nav: 'border-b border-gray-100 bg-white/90 backdrop-blur',
    card: 'bg-white border border-gray-100 shadow-sm',
    heading: 'font-bold text-gray-900',
    body: 'text-gray-600',
    muted: 'text-gray-500',
    tag: 'bg-blue-50 text-blue-700',
    section: '',
  },
  bold: {
    page: 'bg-gray-950 text-white',
    nav: 'border-b border-gray-800 bg-gray-950/90 backdrop-blur',
    card: 'bg-gray-900 border border-gray-800 shadow-sm',
    heading: 'font-black text-white tracking-tight',
    body: 'text-gray-300',
    muted: 'text-gray-400',
    tag: 'bg-gray-800 text-gray-200',
    section: '',
  },
  minimal: {
    page: 'bg-stone-50 text-gray-900',
    nav: 'border-b border-stone-200 bg-stone-50/90 backdrop-blur',
    card: 'bg-white border-0 shadow-none',
    heading: 'font-semibold text-gray-800',
    body: 'text-gray-500',
    muted: 'text-gray-400',
    tag: 'bg-stone-100 text-stone-700',
    section: '',
  },
};

const ROOT_SELF_CLASSES = new Set(['.pf-portfolio']);
const RESERVED_PF_IDS = new Set([
  'pf-root',
  'pf-css-vars',
  'pf-custom-css',
  'pf-custom-js',
  'pf-motion-style',
  'pf-motion-cursor-glow',
  'pf-motion-particles',
  'pf-motion-gradient-mesh',
]);

const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const parseOrder = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : DEFAULT_SECTION_ORDER;
    } catch {
      return DEFAULT_SECTION_ORDER;
    }
  }
  return DEFAULT_SECTION_ORDER;
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.split(',').map((item) => item.trim()).filter(Boolean);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const classSlug = (value, fallback = 'section') => (
  String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
);

const cssToken = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  if (!text || /[;{}<>]/.test(text)) return fallback;
  return text.slice(0, 220);
};

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '').replace('#', '').trim();
  const expanded = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(37, 99, 235, ${alpha})`;
  const number = parseInt(expanded, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return format(new Date(value), 'MMM yyyy');
  } catch {
    return '';
  }
};

const findMatchingBrace = (css, openIndex) => {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < css.length; i += 1) {
    const ch = css[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const prefixSelector = (selector) => selector
  .split(',')
  .map((part) => {
    const trimmed = part.trim();
    if (!trimmed || trimmed.startsWith('#pf-root')) return trimmed;
    if (/^(html|body|:root|#root)(?=$|[\s.:#[>+~])/i.test(trimmed)) {
      return `#pf-root${trimmed.replace(/^(html|body|:root|#root)/i, '')}`;
    }
    const rootClass = [...ROOT_SELF_CLASSES].find((className) => (
      trimmed === className || trimmed.startsWith(`${className}.`) || trimmed.startsWith(`${className}:`)
    ));
    if (rootClass) return `#pf-root${trimmed.slice(rootClass.length)}`;
    return `#pf-root ${trimmed}`;
  })
  .filter(Boolean)
  .join(', ');

const addImportant = (body) => body
  .split(';')
  .map((decl) => {
    const trimmed = decl.trim();
    if (!trimmed || trimmed.startsWith('--')) return trimmed;
    const colon = trimmed.indexOf(':');
    if (colon === -1 || /!important/i.test(trimmed)) return trimmed;
    return `${trimmed.slice(0, colon).trim()}: ${trimmed.slice(colon + 1).trim()} !important`;
  })
  .filter(Boolean)
  .join('; ');

const processCssRules = (css) => {
  let output = '';
  let index = 0;

  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open === -1) {
      output += css.slice(index);
      break;
    }

    const selector = css.slice(index, open).trim();
    const close = findMatchingBrace(css, open);
    if (close === -1) {
      output += css.slice(index);
      break;
    }

    const body = css.slice(open + 1, close);
    if (/^@(keyframes|font-face)\b/i.test(selector)) {
      output += `${selector} {${body}}`;
    } else if (/^@(media|supports|container)\b/i.test(selector)) {
      output += `${selector} {${processCssRules(body)}}`;
    } else if (selector.startsWith('@')) {
      output += `${selector} {${body}}`;
    } else {
      output += `${prefixSelector(selector)} { ${addImportant(body)} }\n`;
    }

    index = close + 1;
  }

  return output;
};

const processCustomCss = (css) => {
  if (!css?.trim()) return '';
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return processCssRules(withoutComments);
};

const clearJsArtifacts = () => {
  document.querySelectorAll('[data-pf-ai-artifact="true"]').forEach((node) => node.remove());
  document.querySelectorAll('[id^="pf-"]').forEach((node) => {
    if (!RESERVED_PF_IDS.has(node.id)) node.remove();
  });
};

function useCssVariables(settings, themeOverrides, themeConfig, designSystem = {}, manualDesignOverrides = {}) {
  useEffect(() => {
    const tokens = {
      ...asObject(designSystem.tokens),
      ...asObject(manualDesignOverrides.tokens),
    };
    const accent = tokens.accent || themeOverrides.accentColor || settings.accent_color || '#2563eb';
    const pageBackground = tokens.background || themeOverrides.pageBackground || (settings.theme === 'bold' ? '#030712' : settings.theme === 'minimal' ? '#f5f5f4' : '#ffffff');
    const cardBackground = tokens.surface || themeOverrides.cardBackground || (settings.theme === 'bold' ? '#111827' : '#ffffff');
    const textColor = tokens.text || (settings.theme === 'bold' ? '#ffffff' : '#111827');
    const mutedColor = tokens.muted || (settings.theme === 'bold' ? '#d1d5db' : '#6b7280');
    const css = `
      :root, #pf-root {
        --pf-accent: ${cssToken(accent, '#2563eb')};
        --pf-accent-10: ${hexToRgba(accent, 0.1)};
        --pf-accent-20: ${hexToRgba(accent, 0.2)};
        --pf-accent-30: ${hexToRgba(accent, 0.3)};
        --pf-accent-50: ${hexToRgba(accent, 0.5)};
        --pf-bg: ${cssToken(pageBackground, '#ffffff')};
        --pf-card-bg: ${cssToken(cardBackground, '#ffffff')};
        --pf-text: ${cssToken(textColor, '#111827')};
        --pf-subtext: ${cssToken(mutedColor, '#6b7280')};
        --pf-radius: ${cssToken(tokens.radius, themeOverrides.cardBorderRadius || '1rem')};
        --pf-shadow: ${cssToken(tokens.shadow, themeOverrides.cardShadow || '0 1px 2px rgba(15, 23, 42, 0.06)')};
        --pf-section-gap: ${cssToken(tokens.sectionGap, '3rem')};
        --pf-content-width: ${cssToken(tokens.contentWidth, '72rem')};
      }
      #pf-root { background: var(--pf-bg); }
      #pf-root .pf-project-card,
      #pf-root .pf-feature-card,
      #pf-root .pf-stat-card,
      #pf-root .pf-text-card,
      #pf-root .pf-testimonial-card,
      #pf-root .pf-contact-card {
        background: var(--pf-card-bg);
        border-radius: var(--pf-radius);
        box-shadow: var(--pf-shadow);
      }
      #pf-root .pf-custom-section { margin-top: var(--pf-section-gap); }
    `;

    document.getElementById('pf-css-vars')?.remove();
    const style = document.createElement('style');
    style.id = 'pf-css-vars';
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }, [settings.accent_color, settings.theme, themeOverrides, themeConfig, designSystem, manualDesignOverrides]);
}

function useCustomCss(css) {
  useEffect(() => {
    document.getElementById('pf-custom-css')?.remove();
    if (!css?.trim()) return undefined;

    const style = document.createElement('style');
    style.id = 'pf-custom-css';
    style.textContent = processCustomCss(css);
    document.head.appendChild(style);
    return () => style.remove();
  }, [css]);
}

function useCustomJs(js) {
  useEffect(() => {
    document.getElementById('pf-custom-js')?.remove();
    clearJsArtifacts();
    return undefined;
  }, [js]);
}

export default function PublicPortfolioPage() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser } = useAuth();
  const isPreview = searchParams.has('preview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const previewSignatureRef = useRef('');

  // ── Social follow state ──────────────────────────────────────────────────────
  const [viewerFollowing, setViewerFollowing]       = useState(false);
  const [localFollowerCount, setLocalFollowerCount] = useState(0);

  // Sync from API response when data loads
  useEffect(() => {
    if (data) {
      setViewerFollowing(data.viewer_following || false);
      setLocalFollowerCount(data.user?.follower_count || 0);
    }
  }, [data]);

  // Filter state: two independent single-select dropdowns, AND logic.
  const [activeTech, setActiveTech] = useState(() => searchParams.get('tech') || null);
  const [activeTool, setActiveTool] = useState(() => searchParams.get('tool') || null);
  const [viewerLayout, setViewerLayout] = useState(null);

  const fetchPortfolio = useCallback(async () => {
    if (!username) return;
    try {
      setError(null);
      const response = await api.get(`/portfolio/${username}`);
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load portfolio.');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    setLoading(true);
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!data?.user?.id || isPreview || authUser?.id === data.user.id) return;
    recordPublicView({ subjectType: 'portfolio', subjectId: data.user.id });
  }, [data?.user?.id, isPreview, authUser?.id]);

  useEffect(() => {
    let channel;
    try {
      channel = new BroadcastChannel('pf-settings');
      channel.onmessage = () => fetchPortfolio();
    } catch {
      channel = null;
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchPortfolio();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      channel?.close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!isPreview) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== 'pf-preview') return;
      const requestId = event.data.requestId || null;
      const nextPreviewState = {
        css: typeof event.data.css === 'string' ? event.data.css : undefined,
        js: event.data.runJs === false ? '' : (typeof event.data.js === 'string' ? event.data.js : undefined),
        settings: parseJson(event.data.settings, {}),
        themeOverrides: parseJson(event.data.themeOverrides, {}),
        animations: parseJson(event.data.animations, {}),
        designSystem: parseJson(event.data.designSystem, {}),
        manualDesignOverrides: parseJson(event.data.manualDesignOverrides, {}),
        interactions: parseArray(event.data.interactions),
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
    window.addEventListener('message', onMessage);
    window.__pfPreviewReady = true;
    try { window.postMessage({ type: 'pf-preview-ready' }, '*'); } catch {}
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'pf-preview-ready' }, '*');
    } catch {}
    return () => window.removeEventListener('message', onMessage);
  }, [isPreview]);

  const model = useMemo(() => {
    const rawSettings = data?.settings || {};
    const savedThemeOverrides = parseJson(rawSettings.theme_overrides, {});
    const savedAnimations = { ...DEFAULT_ANIMATIONS, ...parseJson(rawSettings.animations, {}) };
    const savedDesignSystem = parseJson(rawSettings.design_system, {});
    const savedManualDesignOverrides = parseJson(rawSettings.manual_design_overrides, {});
    const savedInteractions = parseArray(rawSettings.interactions);
    const themeOverrides = previewState?.themeOverrides
      ? { ...savedThemeOverrides, ...previewState.themeOverrides }
      : savedThemeOverrides;
    const animations = previewState?.animations
      ? { ...savedAnimations, ...previewState.animations }
      : savedAnimations;
    const designSystem = previewState?.designSystem
      ? { ...savedDesignSystem, ...previewState.designSystem }
      : savedDesignSystem;
    const manualDesignOverrides = previewState?.manualDesignOverrides
      ? { ...savedManualDesignOverrides, ...previewState.manualDesignOverrides }
      : savedManualDesignOverrides;
    const interactions = previewState?.interactions || savedInteractions;
    const previewSettings = previewState?.settings || {};
    const settings = {
      ...rawSettings,
      ...previewSettings,
      section_order: previewSettings.section_order ? parseOrder(previewSettings.section_order) : parseOrder(rawSettings.section_order),
      section_config: previewSettings.section_config ? parseJson(previewSettings.section_config, {}) : parseJson(rawSettings.section_config, {}),
      site_sections: previewSettings.site_sections ? asArray(previewSettings.site_sections) : asArray(rawSettings.site_sections),
      custom_css: previewState?.css ?? rawSettings.custom_css ?? '',
      custom_js: '',
      theme_overrides: themeOverrides,
      animations,
      design_system: designSystem,
      manual_design_overrides: manualDesignOverrides,
      interactions,
    };

    const effectiveTokens = { ...asObject(designSystem.tokens), ...asObject(manualDesignOverrides.tokens) };
    const accentColor = effectiveTokens.accent || themeOverrides.accentColor || settings.accent_color || '#2563eb';
    const themeConfig = THEME_CONFIG[manualDesignOverrides.theme || settings.theme] || THEME_CONFIG.clean;
    return { settings, themeOverrides, animations, designSystem, manualDesignOverrides, interactions, accentColor, themeConfig };
  }, [data, previewState]);

  // ── Filter derivations (computed before early returns so hooks aren't violated) ──
  const allTechs = useMemo(() => {
    const counts = {};
    (data?.projects || []).forEach((p) => {
      asArray(p.technologies).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tech]) => tech);
  }, [data]);

  const allTypes = useMemo(() => {
    const types = new Set((data?.projects || []).map((p) => p.project_type).filter(Boolean));
    return Array.from(types).sort();
  }, [data]);

  const projectTechSet = useMemo(() => {
    const set = new Set();
    (data?.projects || []).forEach((p) => asArray(p.technologies).forEach((t) => set.add(t)));
    return set;
  }, [data]);

  const filteredProjects = useMemo(() => {
    let result = data?.projects || [];
    if (activeTech) result = result.filter((p) => asArray(p.technologies).some((t) => t === activeTech));
    if (activeTool) result = result.filter((p) => asArray(p.technologies).some((t) => t === activeTool));
    return result;
  }, [data, activeTech, activeTool]);

  const setTech = useCallback((val) => {
    setActiveTech(val);
    setSearchParams((sp) => { const p = new URLSearchParams(sp); val ? p.set('tech', val) : p.delete('tech'); return p; }, { replace: true });
  }, [setSearchParams]);

  const setTool = useCallback((val) => {
    setActiveTool(val);
    setSearchParams((sp) => { const p = new URLSearchParams(sp); val ? p.set('tool', val) : p.delete('tool'); return p; }, { replace: true });
  }, [setSearchParams]);

  const clearFilters = useCallback(() => {
    setActiveTech(null);
    setActiveTool(null);
    setSearchParams((sp) => { const p = new URLSearchParams(sp); p.delete('tech'); p.delete('tool'); return p; }, { replace: true });
  }, [setSearchParams]);

  const handleFollow = useCallback(async () => {
    if (!data?.user?.id) return;
    try {
      if (viewerFollowing) {
        await api.delete(`/discover/users/${data.user.id}/follow`);
        setViewerFollowing(false);
        setLocalFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await api.post(`/discover/users/${data.user.id}/follow`);
        setViewerFollowing(true);
        setLocalFollowerCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Follow error:', err);
    }
  }, [data, viewerFollowing]);

  useCssVariables(model.settings || {}, model.themeOverrides || {}, model.themeConfig || THEME_CONFIG.clean, model.designSystem || {}, model.manualDesignOverrides || {});
  useCustomCss(model.settings?.custom_css || '');
  usePortfolioMotion({
    animations: model.animations || DEFAULT_ANIMATIONS,
    interactions: model.interactions || [],
    accentColor: model.accentColor || '#2563eb',
  });

  if (loading) {
    return <PublicPortfolioSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Portfolio unavailable</h1>
          <p className="text-gray-500">{error || 'This portfolio could not be loaded.'}</p>
          <Link to="/" className="inline-block mt-5 text-sm font-medium text-blue-600 hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const { user, projects = [], endorsements = [] } = data;
  const { settings, themeOverrides, animations, designSystem, accentColor, themeConfig } = model;
  const sectionConfig = settings.section_config || {};
  const sectionOrder = settings.section_order?.length ? settings.section_order : DEFAULT_SECTION_ORDER;
  const layout = settings.layout || 'classic';
  const effectiveLayout = viewerLayout ?? layout;
  const designDirection = classSlug(designSystem.direction || designSystem.styleDirection || '', '');
  const designClass = designDirection ? `pf-design-${designDirection}` : '';
  const skills = asArray(user.skills);

  if (settings.custom_site_enabled === true && settings.is_public !== false && !isPreview) {
    const version = settings.custom_site_updated_at ? `?v=${encodeURIComponent(settings.custom_site_updated_at)}` : '';
    return (
      <div id="pf-root" className="min-h-screen bg-white">
        <iframe
          title={`${user.full_name || user.username} custom portfolio`}
          src={customSiteSrc(user.username, version)}
          className="w-full min-h-screen bg-white"
          style={{ border: 0, display: 'block', height: '100vh' }}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  const headerBg = sectionConfig.header?.bg || 'none';
  const headerSpacing = sectionConfig.header?.spacing || 'normal';
  const projectColumns = sectionConfig.projects?.columns || 'auto';
  const projectCardStyle = sectionConfig.projects?.card_style || 'rounded';
  const projectSpacing = sectionConfig.projects?.spacing || 'normal';
  const showTagline = sectionConfig.projects?.show_tagline !== false;
  const contactBg = sectionConfig.contact?.bg || 'muted';

  const sectionStyle = themeOverrides.sectionPadding ? { padding: themeOverrides.sectionPadding } : undefined;
  const headerStyle = {
    ...(sectionStyle || {}),
    ...(headerBg === 'tint' ? { background: hexToRgba(accentColor, 0.1) } : {}),
    ...(headerBg === 'band' ? { background: accentColor, color: '#ffffff' } : {}),
    ...(themeOverrides.headerGradient ? { background: themeOverrides.headerGradient } : {}),
    ...(themeOverrides.headerTextColor ? { color: themeOverrides.headerTextColor } : {}),
    ...(themeOverrides.headerPadding ? { padding: themeOverrides.headerPadding } : {}),
  };
  const cardStyle = {
    ...(themeOverrides.cardBackground ? { background: themeOverrides.cardBackground } : {}),
    ...(themeOverrides.cardBorderRadius ? { borderRadius: themeOverrides.cardBorderRadius } : {}),
    ...(themeOverrides.cardShadow ? { boxShadow: themeOverrides.cardShadow } : {}),
    ...(themeOverrides.cardBorder ? { border: themeOverrides.cardBorder } : {}),
    ...(themeOverrides.cardPadding ? { padding: themeOverrides.cardPadding } : {}),
  };
  const titleStyle = themeOverrides.cardTitleColor ? { color: themeOverrides.cardTitleColor } : undefined;
  const textStyle = themeOverrides.cardTextColor ? { color: themeOverrides.cardTextColor } : undefined;
  const tagStyle = {
    ...(themeOverrides.skillTagBackground ? { background: themeOverrides.skillTagBackground } : {}),
    ...(themeOverrides.skillTagColor ? { color: themeOverrides.skillTagColor } : {}),
  };
  const projectsStyle = themeOverrides.projectsGap ? { gap: themeOverrides.projectsGap } : undefined;
  const rootStyle = {
    ...(themeOverrides.pageBackground ? { background: themeOverrides.pageBackground } : {}),
    ...(themeOverrides.fontFamily ? { fontFamily: themeOverrides.fontFamily } : {}),
  };

  const cardRadius = projectCardStyle === 'sharp' ? 'rounded-none' : projectCardStyle === 'pill' ? 'rounded-xl' : 'rounded-xl';
  const gridGap = projectSpacing === 'tight' ? 'gap-3' : projectSpacing === 'loose' ? 'gap-8' : 'gap-6';
  const colClass = projectColumns === '3' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  const headerPaddingClass = headerSpacing === 'compact' ? 'py-8' : headerSpacing === 'spacious' ? 'py-24' : 'py-16';

  const TechTag = ({ tech, onClick, active = false }) => (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`pf-tech-tag inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-mono transition-all ${onClick ? 'cursor-pointer' : ''} ${active ? '' : themeConfig.tag}`}
      style={active ? { background: accentColor, color: '#fff' } : tagStyle}
      title={onClick ? `Filter by ${tech}` : undefined}
    >
      {tech}
    </span>
  );

  const ProjectCard = ({ project, featured = false, minimal = false, wide = false }) => {
    const techs = asArray(project.technologies);
    const date = formatDate(project.start_date);
    const collaborators = asArray(project.collaborators).filter((item) => item?.id);

    return (
      <a
        href={`/${user.username}/${project.slug}`}
        className={`pf-project-card group block overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${cardRadius} ${themeConfig.card} ${wide ? 'md:flex' : ''}`}
        style={cardStyle}
      >
        {!minimal && (
          <div className={`pf-project-media ${wide ? 'md:w-64 md:flex-shrink-0' : featured ? 'h-72' : 'h-48'} overflow-hidden`} style={{ background: `linear-gradient(135deg, ${hexToRgba(accentColor, 0.12)}, ${hexToRgba(accentColor, 0.28)})` }}>
            {project.cover_image_url ? (
              <img loading="lazy" decoding="async" src={project.cover_image_url} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold opacity-20" style={{ color: accentColor }}>
                {project.title?.charAt(0) || 'P'}
              </div>
            )}
          </div>
        )}
        <div className={minimal ? 'py-5' : featured ? 'p-8' : 'p-5'}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className={`pf-project-title ${featured ? 'text-3xl' : 'text-lg'} ${themeConfig.heading} group-hover:opacity-75 transition-opacity`} style={titleStyle}>
              {project.title}
            </h3>
            {project.is_featured && <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: hexToRgba(accentColor, 0.12), color: accentColor }}>Featured</span>}
          </div>
          {project.tagline && showTagline && (
            <p className={`pf-project-tagline ${featured ? 'text-base' : 'text-sm'} mb-4 leading-relaxed ${themeConfig.body}`} style={textStyle}>
              {project.tagline}
            </p>
          )}
          {techs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {techs.slice(0, featured ? 8 : 5).map((tech) => <TechTag key={tech} tech={tech} onClick={() => setTech(activeTech === tech ? null : tech)} active={activeTech === tech || activeTool === tech} />)}
            </div>
          )}
          {collaborators.length > 0 && (
            <p className={`text-xs mb-2 ${themeConfig.muted}`}>Group project with {collaborators.length} collaborator{collaborators.length === 1 ? '' : 's'}</p>
          )}
          <div className={`flex items-center justify-between text-xs ${themeConfig.muted}`}>
            {settings.show_project_type !== false && project.project_type && <span>{project.project_type}</span>}
            {settings.show_dates !== false && date && <span>{date}</span>}
          </div>
        </div>
      </a>
    );
  };

  const HeaderSection = ({ compact = false }) => (
    <section className={`pf-section pf-header ${compact ? 'mb-8' : `${headerPaddingClass} mb-8`} ${themeConfig.section}`} style={headerStyle}>
      <div className="flex items-start gap-6 flex-wrap">
        <div className={`pf-avatar ${compact ? 'w-16 h-16' : 'w-24 h-24'} rounded-xl overflow-hidden flex items-center justify-center text-3xl font-bold flex-shrink-0`} style={{ background: hexToRgba(accentColor, 0.16), color: accentColor }}>
          {user.avatar_url ? <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" /> : user.full_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-2" style={{ color: accentColor }}>@{user.username}</p>
          <h1 className={`pf-name ${compact ? 'text-3xl' : 'text-5xl'} ${themeConfig.heading}`} style={themeOverrides.headerTextColor ? { color: themeOverrides.headerTextColor } : undefined}>
            {user.full_name}
          </h1>
          {user.headline && <p className={`pf-headline mt-3 text-lg ${themeConfig.body}`}>{user.headline}</p>}
          {user.bio && <p className={`pf-bio mt-4 max-w-3xl leading-relaxed ${themeConfig.body}`}>{user.bio}</p>}
          {settings.show_skills !== false && skills.length > 0 && (
            <div className="pf-skills flex flex-wrap gap-2 mt-5">
              {skills.map((skill) => {
                const isFilterable = projectTechSet.has(skill);
                const isActive = activeTech === skill || activeTool === skill;
                return isFilterable ? (
                  <button
                    key={skill}
                    onClick={() => {
                      setTech(activeTech === skill ? null : skill);
                      setTimeout(() => {
                        document.getElementById('pf-projects-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 50);
                    }}
                    className={`pf-skill-tag px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer hover:opacity-80 ${isActive ? '' : themeConfig.tag}`}
                    style={isActive ? { background: accentColor, color: '#fff' } : tagStyle}
                    title={`Filter projects by ${skill}`}
                  >
                    {skill}
                  </button>
                ) : (
                  <span key={skill} className={`pf-skill-tag px-3 py-1 rounded-full text-xs font-medium ${themeConfig.tag}`} style={tagStyle}>
                    {skill}
                  </span>
                );
              })}
            </div>
          )}

          {/* Follower counts + follow button */}
          <div className="flex items-center gap-4 mt-5 flex-wrap">
            {(localFollowerCount > 0 || user.following_count > 0) && (
              <div className={`flex items-center gap-3 text-sm ${themeConfig.muted}`}>
                {localFollowerCount > 0 && (
                  <span>
                    <strong className={themeConfig.body}>{localFollowerCount.toLocaleString()}</strong>
                    {' '}follower{localFollowerCount !== 1 ? 's' : ''}
                  </span>
                )}
                {localFollowerCount > 0 && user.following_count > 0 && (
                  <span className="opacity-40">/</span>
                )}
                {user.following_count > 0 && (
                  <span>
                    <strong className={themeConfig.body}>{parseInt(user.following_count).toLocaleString()}</strong>
                    {' '}following
                  </span>
                )}
              </div>
            )}
            {/* Follow button, only for logged-in viewers who are not the owner. */}
            {authUser && authUser.id !== user.id && (
              <button
                onClick={handleFollow}
                className="text-xs font-semibold px-4 py-1.5 rounded-xl border transition-all"
                style={viewerFollowing
                  ? { borderColor: 'currentColor', color: 'inherit', opacity: 0.6 }
                  : { background: accentColor, color: '#fff', border: 'none' }
                }
              >
                {viewerFollowing ? 'Following' : '+ Follow'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const ProjectsSection = () => {
    const isFiltered = !!activeTech || !!activeTool;
    const showFilterBar = projects.length >= 2 && allTechs.length >= 2;
    const displayProjects = isFiltered ? filteredProjects : projects;

    // Searchable single-select dropdown that respects the portfolio theme.
    const FilterDropdown = ({ label, options, value, onChange }) => {
      const [open, setOpen] = useState(false);
      const [search, setSearch] = useState('');
      const ref = useRef(null);

      useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(''); } };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, []);

      const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
      const isActive = !!value;

      return (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${isActive ? '' : themeConfig.tag}`}
            style={isActive ? { background: accentColor, color: '#fff', borderColor: 'transparent' } : {}}
          >
            <span>{value || label}</span>
            {isActive ? (
              <span
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 text-xs leading-none"
                role="button"
                aria-label={`Clear ${label} filter`}
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            ) : (
              <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-current opacity-50" />
            )}
          </button>

          {open && (
            <div className={`absolute top-full left-0 mt-1.5 w-56 rounded-xl shadow-2xl border z-50 overflow-hidden ${themeConfig.card}`}
              style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div className={`px-3 py-2 border-b ${themeConfig.tag}`}>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  className="w-full bg-transparent text-xs outline-none placeholder-current opacity-100"
                />
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className={`px-3 py-2 text-xs ${themeConfig.muted}`}>No results</p>
                ) : (
                  filtered.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { onChange(opt === value ? null : opt); setOpen(false); setSearch(''); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors hover:opacity-75 ${themeConfig.body}`}
                      style={opt === value ? { color: accentColor, fontWeight: 600 } : {}}
                    >
                      {opt === value ? `✓ ${opt}` : opt}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    const FilterBar = () => (
      <div className="pf-filter-bar mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown label="Technology" options={allTechs} value={activeTech} onChange={setTech} />
          <FilterDropdown label="Tool" options={allTechs} value={activeTool} onChange={setTool} />
          {isFiltered && (
            <>
              <button onClick={clearFilters} className={`text-xs px-2.5 py-1.5 rounded-xl transition-all hover:opacity-70 ${themeConfig.tag}`}>
                Clear
              </button>
              <span className={`text-xs tabular-nums ${themeConfig.muted}`}>
                {filteredProjects.length} of {projects.length} project{projects.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        {isFiltered && filteredProjects.length === 0 && (
          <div className={`mt-4 py-10 text-center rounded-xl ${themeConfig.card}`}>
            <p className={`text-sm ${themeConfig.body}`}>No projects match these filters.</p>
            <button onClick={clearFilters} className="mt-2 text-xs font-medium hover:underline" style={{ color: accentColor }}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    );

    return (
      <section id="pf-projects-section" className="pf-section mt-10" style={sectionStyle}>
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className={`text-2xl ${themeConfig.heading}`}>Projects</h2>
            <p className={`text-sm mt-1 ${themeConfig.muted}`}>
              {isFiltered
                ? `${filteredProjects.length} of ${projects.length} project${projects.length === 1 ? '' : 's'}`
                : `${projects.length} published project${projects.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {/* Inline clear when filtered gives a visible escape hatch at the top. */}
          {isFiltered && (
            <button
              onClick={clearFilters}
              className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-all hover:opacity-80 ${themeConfig.tag}`}
            >
              Clear filters
            </button>
          )}
        </div>

        {showFilterBar && <FilterBar />}

        {projects.length === 0 ? (
          <div className={`py-14 text-center rounded-xl ${themeConfig.card}`}>
            <p className={themeConfig.body}>No published projects yet.</p>
          </div>
        ) : displayProjects.length === 0 ? null : effectiveLayout === 'minimal' ? (
          <div className="pf-projects divide-y divide-gray-100" style={projectsStyle}>
            {displayProjects.map((project) => <ProjectCard key={project.id} project={project} minimal />)}
          </div>
        ) : effectiveLayout === 'fullwidth' ? (
          <div className={`pf-projects grid grid-cols-1 ${gridGap}`} style={projectsStyle}>
            {displayProjects.map((project) => <ProjectCard key={project.id} project={project} wide />)}
          </div>
        ) : effectiveLayout === 'magazine' && !isFiltered ? (
          <div>
            <div className="pf-projects" style={projectsStyle}>
              <ProjectCard project={displayProjects[0]} featured />
            </div>
            {displayProjects.length > 1 && (
              <div className={`pf-projects grid ${colClass} ${gridGap} mt-6`} style={projectsStyle}>
                {displayProjects.slice(1).map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            )}
          </div>
        ) : (
          <div className={`pf-projects grid ${effectiveLayout === 'grid' ? 'grid-cols-1 md:grid-cols-3' : colClass} ${gridGap}`} style={projectsStyle}>
            {displayProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>
    );
  };

  const ContactSection = () => {
    const links = [
      user.contact_email && { label: 'Email', href: `mailto:${user.contact_email}` },
      user.website && { label: 'Website', href: user.website },
      user.linkedin_url && { label: 'LinkedIn', href: user.linkedin_url },
      user.github_url && { label: 'GitHub', href: user.github_url },
      user.resume_url && { label: 'Resume', href: user.resume_url },
    ].filter(Boolean);
    const contactStyle = contactBg === 'tint' ? { background: hexToRgba(accentColor, 0.12) } : undefined;
    const contactClass = contactBg === 'none'
      ? 'border border-gray-100 bg-transparent'
      : contactBg === 'tint'
        ? ''
        : settings.theme === 'bold'
          ? 'bg-gray-900'
          : 'bg-gray-50';

    return (
      <section className="pf-section pf-contact mt-12" style={sectionStyle}>
        <div className={`pf-contact-card rounded-xl p-8 text-center ${contactClass}`} style={contactStyle}>
          <h2 className={`pf-contact-title text-2xl mb-3 ${themeConfig.heading}`}>Contact</h2>
          <p className={`pf-contact-text text-sm mb-6 ${themeConfig.body}`}>Connect with {user.full_name}.</p>
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-3 justify-center">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                  className="pf-contact-link inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-85"
                  style={{ background: accentColor }}
                >
                  <IconText text={link.label} />
                </a>
              ))}
            </div>
          ) : (
            <p className={`text-sm ${themeConfig.muted}`}>No contact links are listed yet.</p>
          )}
        </div>
      </section>
    );
  };

  const EducationSection = () => {
    const credentials = sectionConfig.education?.credentials || [];
    if (credentials.length === 0) return null;

    const typeIconMap = { degree: 'education', cert: 'certificate', award: 'award-badge', course: 'book-stack' };

    // Sort: most recent year_end first, then by year_start, then unsorted
    const sorted = [...credentials].sort((a, b) => {
      const endA = a.year_end === 'Present' ? 9999 : parseInt(a.year_end || a.year_start || 0, 10);
      const endB = b.year_end === 'Present' ? 9999 : parseInt(b.year_end || b.year_start || 0, 10);
      return endB - endA;
    });

    const credYears = (c) => {
      if (!c.year_start && !c.year_end) return null;
      if (c.year_start && c.year_end) return `${c.year_start}-${c.year_end}`;
      return c.year_start || c.year_end;
    };

    return (
      <section className="pf-section pf-education mt-10" style={sectionStyle}>
        <h2 className={`text-2xl mb-6 ${themeConfig.heading}`}>Education & Credentials</h2>

        <div className="pf-education-list space-y-4">
          {sorted.map((cred, idx) => {
            const icon = typeIconMap[cred.type] || 'education';
            const years = credYears(cred);
            const hasLink = cred.url && cred.url.startsWith('http');

            return (
              <div
                key={cred.id || idx}
                className={`pf-credential-card flex items-start gap-4 p-5 rounded-xl ${themeConfig.card}`}
              >
                {/* Icon */}
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: hexToRgba(accentColor, 0.12) }}
                >
                  <EngineeringIcon name={icon} size="1.15rem" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h3 className={`text-base font-semibold leading-snug ${themeConfig.heading}`}>
                        {cred.title || 'Untitled credential'}
                      </h3>
                      {cred.institution && (
                        <p className={`text-sm mt-0.5 ${themeConfig.body}`}>{cred.institution}</p>
                      )}
                    </div>
                    {years && (
                      <span className={`text-xs font-mono flex-shrink-0 mt-0.5 ${themeConfig.muted}`}>
                        {years}
                      </span>
                    )}
                  </div>

                  {/* Secondary details */}
                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs ${themeConfig.muted}`}>
                    {cred.field && <span>{cred.field}</span>}
                    {cred.honors && (
                      <>
                        {cred.field && <span className="opacity-30">/</span>}
                        <span className="font-medium" style={{ color: accentColor }}>{cred.honors}</span>
                      </>
                    )}
                  </div>

                  {/* Link */}
                  {hasLink && (
                    <a
                      href={cred.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs font-medium hover:underline"
                      style={{ color: accentColor }}
                    >View credential</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const EndorsementsSection = () => {
    if (endorsements.length === 0) return null;

    return (
      <section className="pf-section pf-endorsements mt-10" style={sectionStyle}>
        <h2 className={`text-2xl mb-6 ${themeConfig.heading}`}>Endorsements</h2>

        <div className="pf-endorsements-list grid grid-cols-1 md:grid-cols-2 gap-4">
          {endorsements.map((e) => (
            <div
              key={e.id}
              className={`pf-endorsement-card rounded-xl p-7 flex flex-col gap-4 ${themeConfig.card}`}
            >
              {/* Quote */}
              <p className={`pf-endorsement-quote text-lg leading-relaxed ${themeConfig.body}`}>
                "{e.quote}"
              </p>

              {/* Attribution */}
              <div className="flex items-center justify-between gap-3 mt-auto">
                <div>
                  <p className={`text-sm font-semibold ${themeConfig.heading}`}>{e.from_name}</p>
                  {e.from_role && (
                    <p className={`text-xs mt-0.5 ${themeConfig.muted}`}>{e.from_role}</p>
                  )}
                  {e.project_title && (
                    <p className={`text-xs mt-0.5 ${themeConfig.muted}`}>
                      Re: {e.project_title}
                    </p>
                  )}
                </div>
                {/* Verified badge */}
                <span
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: hexToRgba(accentColor, 0.12), color: accentColor }}
                  title="Verified endorsement - submitted directly by this person"
                >
                  <EngineeringIcon name="award-badge" size="0.95rem" />
                  <span>Verified</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const CustomSection = ({ section }) => {
    if (!section || section.enabled === false) return null;
    const content = section.content || {};
    const items = Array.isArray(content.items) ? content.items : [];
    const sectionTitle = section.title || content.title;
    const sectionSubtitle = section.subtitle || content.subtitle;
    const sectionClass = classSlug(section.id || section.type);
    const variant = classSlug(section.variant || 'default', 'default');
    const layoutOptions = asObject(section.layout);
    const densityClass = {
      compact: 'pf-density-compact',
      comfortable: 'pf-density-comfortable',
      spacious: 'pf-density-spacious',
    }[layoutOptions.density] || 'pf-density-comfortable';
    const emphasisClass = {
      low: 'pf-emphasis-low',
      medium: 'pf-emphasis-medium',
      high: 'pf-emphasis-high',
    }[layoutOptions.emphasis] || 'pf-emphasis-medium';
    const alignClass = {
      left: 'pf-align-left',
      center: 'pf-align-center',
      split: 'pf-align-split',
    }[layoutOptions.align] || '';
    const sectionVariantClass = `pf-variant-${variant}`;
    const columnCount = Number(layoutOptions.columns);
    const gridCols = columnCount === 1
      ? 'grid-cols-1'
      : columnCount === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : columnCount === 4
          ? 'grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-3';
    const spacious = layoutOptions.density === 'spacious';
    const compact = layoutOptions.density === 'compact';

    const Shell = ({ children, className = '' }) => (
      <section
        className={`pf-section pf-custom-section pf-custom-${section.type} pf-section-${sectionClass} ${sectionVariantClass} ${densityClass} ${emphasisClass} ${alignClass} mt-12 ${className}`}
        data-pf-section-id={section.id}
        data-pf-variant={section.variant || ''}
        style={sectionStyle}
      >
        {(sectionTitle || sectionSubtitle) && (
          <div className="pf-section-heading mb-6">
            {sectionTitle && <h2 className={`pf-section-title text-2xl ${themeConfig.heading}`}>{sectionTitle}</h2>}
            {sectionSubtitle && <p className={`pf-section-subtitle text-sm mt-1 ${themeConfig.body}`}>{sectionSubtitle}</p>}
          </div>
        )}
        {children}
      </section>
    );

    if (section.type === 'hero') {
      const actions = Array.isArray(content.actions) ? content.actions : [];
      const highlights = Array.isArray(content.highlights) ? content.highlights : [];
      const isCentered = variant === 'centered';
      return (
        <Shell className="pf-native-builder-section">
          <div className={`pf-hero-card rounded-xl ${spacious ? 'p-10 md:p-14' : 'p-8'} ${themeConfig.card} ${isCentered ? 'text-center' : 'grid md:grid-cols-[1.25fr_.75fr] gap-8 items-center'}`}>
            <div>
              {(content.kicker || sectionSubtitle) && (
                <p className="pf-hero-kicker text-xs font-bold  mb-3" style={{ color: accentColor }}>
                  {content.kicker || sectionSubtitle}
                </p>
              )}
              <h2 className={`pf-hero-heading text-3xl md:text-5xl font-bold leading-tight ${themeConfig.heading}`}>
                {content.heading || sectionTitle || 'Portfolio direction'}
              </h2>
              {(content.text || sectionSubtitle) && (
                <p className={`pf-hero-text mt-4 leading-relaxed ${themeConfig.body}`}>
                  {content.text || sectionSubtitle}
                </p>
              )}
              {actions.length > 0 && (
                <div className={`pf-hero-actions flex flex-wrap gap-3 mt-6 ${isCentered ? 'justify-center' : ''}`}>
                  {actions.slice(0, 3).map((action, index) => (
                    <a
                      key={index}
                      href={action.href || '#contact'}
                      className={`pf-hero-action inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold ${index === 0 ? 'text-white' : themeConfig.tag}`}
                      style={index === 0 ? { background: accentColor } : undefined}
                    >
                      {action.label || 'Learn more'}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {highlights.length > 0 && (
              <div className="pf-hero-highlights grid grid-cols-2 gap-3">
                {highlights.slice(0, 4).map((item, index) => (
                  <div key={index} className={`pf-proof-card rounded-xl p-4 ${themeConfig.tag}`}>
                    <div className="pf-proof-value text-2xl font-bold" style={{ color: accentColor }}>{item.value}</div>
                    <div className={`pf-proof-label text-xs mt-1 ${themeConfig.muted}`}>{item.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Shell>
      );
    }

    if (section.type === 'text') {
      const isSplit = variant === 'split';
      const isEditorial = variant === 'editorial';
      return (
        <Shell>
          <div className={`pf-text-card rounded-xl ${spacious ? 'p-10 md:p-12' : compact ? 'p-5' : 'p-8'} ${themeConfig.card} ${isSplit ? 'grid md:grid-cols-[.8fr_1.2fr] gap-8 items-center' : ''}`}>
            {(isSplit || isEditorial) && (
              <div className="pf-text-kicker text-xs font-bold " style={{ color: accentColor }}>
                {content.kicker || sectionTitle || 'Focus'}
              </div>
            )}
            <p className={`pf-text-body leading-relaxed whitespace-pre-line ${isEditorial ? 'text-lg md:text-xl' : ''} ${themeConfig.body}`}>{content.text || ''}</p>
          </div>
        </Shell>
      );
    }

    if (section.type === 'featureGrid') {
      const isBento = variant === 'bento';
      const isRail = variant === 'iconrail';
      return (
        <Shell>
          <div className={`pf-feature-grid grid ${isRail ? 'grid-cols-1' : gridCols} ${spacious ? 'gap-6' : 'gap-4'}`}>
            {items.map((item, index) => (
              <div key={index} className={`pf-feature-card rounded-xl ${spacious ? 'p-7' : 'p-5'} ${themeConfig.card} ${isBento && index === 0 ? 'md:col-span-2 md:row-span-2' : ''} ${isRail ? 'flex gap-4 items-start' : ''}`}>
                {item.icon && <div className="pf-feature-icon text-2xl mb-3"><IconText text={item.icon} /></div>}
                <div>
                  <h3 className={`pf-feature-title font-semibold mb-2 ${themeConfig.heading}`}>{item.title}</h3>
                  <p className={`pf-feature-text text-sm ${themeConfig.body}`}>{item.text || item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'proofWall') {
      return (
        <Shell>
          <div className={`pf-proof-wall grid ${gridCols} ${spacious ? 'gap-6' : 'gap-4'}`}>
            {items.map((item, index) => (
              <div key={index} className={`pf-proof-card rounded-xl ${spacious ? 'p-7' : 'p-5'} ${themeConfig.card}`}>
                <div className="pf-proof-value text-3xl font-bold" style={{ color: accentColor }}>
                  <IconText text={item.value || item.icon || String(index + 1).padStart(2, '0')} />
                </div>
                <h3 className={`pf-proof-label font-semibold mt-3 ${themeConfig.heading}`}>{item.label || item.title}</h3>
                <p className={`pf-proof-text text-sm mt-2 leading-relaxed ${themeConfig.body}`}>{item.text || item.description}</p>
                {item.source && <p className={`pf-proof-source text-xs mt-3 ${themeConfig.muted}`}>{item.source}</p>}
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'caseStudy') {
      const ids = new Set(Array.isArray(content.projectIds) ? content.projectIds : []);
      const contentItems = Array.isArray(content.items) ? content.items : [];
      const selectedProjects = ids.size ? projects.filter((project) => ids.has(project.id)) : projects.slice(0, Math.max(1, contentItems.length || 2));
      const cards = contentItems.length ? contentItems : selectedProjects.map((project) => ({
        projectId: project.id,
        title: project.title,
        problem: project.tagline || project.description,
        solution: project.technologies?.length ? `Built with ${project.technologies.slice(0, 4).join(', ')}.` : 'See the project for implementation details.',
        impact: project.description,
      }));
      return (
        <Shell>
          <div className={`pf-case-study ${variant === 'timeline' ? 'space-y-4' : 'grid grid-cols-1 gap-4'}`}>
            {cards.slice(0, 4).map((item, index) => {
              const project = projects.find(p => p.id === item.projectId);
              return (
                <article key={index} className={`pf-case-card rounded-xl ${spacious ? 'p-8' : 'p-6'} ${themeConfig.card}`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <p className="pf-case-kicker text-xs font-bold  mb-2" style={{ color: accentColor }}>Case study</p>
                      <h3 className={`pf-case-title text-xl font-semibold ${themeConfig.heading}`}>{item.title || project?.title || 'Selected project'}</h3>
                    </div>
                    {project?.slug && <Link to={`/${user.username}/${project.slug}`} className="pf-case-link text-sm font-semibold" style={{ color: accentColor }}>Open project</Link>}
                  </div>
                  <div className="pf-case-grid grid md:grid-cols-3 gap-4 mt-5">
                    {[
                      ['Problem', item.problem],
                      ['Solution', item.solution],
                      ['Impact', item.impact || item.proof],
                    ].filter(([, value]) => value).map(([label, value]) => (
                      <div key={label} className="pf-case-point">
                        <p className={`text-xs font-bold  ${themeConfig.muted}`}>{label}</p>
                        <p className={`text-sm mt-1 leading-relaxed ${themeConfig.body}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </Shell>
      );
    }

    if (section.type === 'process') {
      return (
        <Shell>
          <div className={`pf-process-list ${variant === 'rail' ? 'space-y-3' : `grid ${gridCols} ${spacious ? 'gap-6' : 'gap-4'}`}`}>
            {items.map((item, index) => (
              <div key={index} className={`pf-process-step rounded-xl ${spacious ? 'p-7' : 'p-5'} ${themeConfig.card}`}>
                <div className="pf-process-index text-xs font-bold  mb-3" style={{ color: accentColor }}>{item.step || String(index + 1).padStart(2, '0')}</div>
                <h3 className={`pf-process-title font-semibold ${themeConfig.heading}`}>{item.title}</h3>
                <p className={`pf-process-text text-sm mt-2 leading-relaxed ${themeConfig.body}`}>{item.text || item.description}</p>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'stats') {
      const isEditorial = variant === 'editorialnumbers';
      return (
        <Shell>
          <div className={`pf-stats-grid grid ${gridCols} ${spacious ? 'gap-6' : 'gap-4'}`}>
            {items.map((item, index) => (
              <div key={index} className={`pf-stat-card rounded-xl ${spacious ? 'p-7' : 'p-5'} ${isEditorial ? 'text-left' : 'text-center'} ${themeConfig.card}`}>
                <div className={`pf-stat-value ${isEditorial ? 'text-5xl md:text-6xl' : 'text-3xl'} font-bold`} style={{ color: accentColor }}>{item.value}</div>
                <div className={`pf-stat-label text-xs mt-1 ${themeConfig.muted}`}><IconText text={item.label} /></div>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'timeline') {
      const isRoadmap = variant === 'roadmap';
      return (
        <Shell>
          <div className={`pf-timeline-list ${isRoadmap ? 'grid md:grid-cols-3 gap-4 space-y-0' : 'space-y-4'}`}>
            {items.map((item, index) => (
              <div key={index} className={`pf-timeline-item ${isRoadmap ? `rounded-xl p-5 ${themeConfig.card}` : 'flex gap-4'}`}>
                <div className="pf-timeline-dot w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />
                <div>
                  <p className={`pf-timeline-title font-semibold ${themeConfig.heading}`}>{item.title}</p>
                  {item.date && <p className={`pf-timeline-date text-xs ${themeConfig.muted}`}>{item.date}</p>}
                  <p className={`pf-timeline-text text-sm mt-1 ${themeConfig.body}`}>{item.text || item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'comparison') {
      const columns = Array.isArray(content.columns) ? content.columns : [];
      return (
        <Shell>
          <div className={`pf-comparison-grid grid ${columns.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
            {columns.slice(0, 3).map((column, index) => (
              <div key={index} className={`pf-comparison-card rounded-xl p-6 ${themeConfig.card}`}>
                <h3 className={`pf-comparison-title font-semibold ${themeConfig.heading}`}>{column.title || `Option ${index + 1}`}</h3>
                <ul className={`pf-comparison-list mt-4 space-y-2 text-sm ${themeConfig.body}`}>
                  {(Array.isArray(column.items) ? column.items : []).slice(0, 8).map((item, itemIndex) => (
                    <li key={itemIndex} className="flex gap-2">
                      <span style={{ color: accentColor }}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'faq') {
      return (
        <Shell>
          <div className="pf-faq-list grid gap-3">
            {items.map((item, index) => (
              <details key={index} className={`pf-faq-item rounded-xl p-5 ${themeConfig.card}`} open={index === 0}>
                <summary className={`pf-faq-question cursor-pointer font-semibold ${themeConfig.heading}`}>{item.question || item.title}</summary>
                <p className={`pf-faq-answer text-sm mt-3 leading-relaxed ${themeConfig.body}`}>{item.answer || item.text}</p>
              </details>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'skillMatrix') {
      const groups = Array.isArray(content.groups) ? content.groups : [];
      return (
        <Shell>
          <div className={`pf-skill-matrix grid ${gridCols} ${spacious ? 'gap-6' : 'gap-4'}`}>
            {groups.map((group, index) => (
              <div key={index} className={`pf-skill-matrix-card rounded-xl p-6 ${themeConfig.card}`}>
                <h3 className={`pf-skill-matrix-title font-semibold ${themeConfig.heading}`}>{group.title}</h3>
                {group.note && <p className={`pf-skill-matrix-note text-sm mt-2 ${themeConfig.body}`}>{group.note}</p>}
                <div className="pf-skill-matrix-tags flex flex-wrap gap-2 mt-4">
                  {(Array.isArray(group.skills) ? group.skills : []).slice(0, 12).map((skill, skillIndex) => (
                    <span key={skillIndex} className={`pf-skill-tag text-xs px-3 py-1 rounded-full ${themeConfig.tag}`}>{skill}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'mediaFeature') {
      const points = Array.isArray(content.points) ? content.points : [];
      return (
        <Shell>
          <div className={`pf-media-feature rounded-xl overflow-hidden ${themeConfig.card} ${variant === 'poster' ? '' : 'grid md:grid-cols-[.9fr_1.1fr]'}`}>
            <div className="pf-media-visual min-h-[220px]" style={{ background: content.imageUrl ? undefined : `linear-gradient(135deg, ${hexToRgba(accentColor, 0.28)}, transparent)` }}>
              {content.imageUrl && <img loading="lazy" decoding="async" src={content.imageUrl} alt={content.alt || ''} className="w-full h-full min-h-[220px] object-cover" />}
            </div>
            <div className="pf-media-copy p-7 md:p-9">
              {content.eyebrow && <p className="text-xs font-bold  mb-3" style={{ color: accentColor }}>{content.eyebrow}</p>}
              <h3 className={`pf-media-title text-2xl font-semibold ${themeConfig.heading}`}>{content.heading || sectionTitle}</h3>
              <p className={`pf-media-text text-sm leading-relaxed mt-3 ${themeConfig.body}`}>{content.text || sectionSubtitle}</p>
              {points.length > 0 && (
                <div className="pf-media-points flex flex-wrap gap-2 mt-5">
                  {points.slice(0, 6).map((point, index) => (
                    <span key={index} className={`pf-tech-tag text-xs px-3 py-1 rounded-full ${themeConfig.tag}`}>{point}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Shell>
      );
    }

    if (section.type === 'gallery') {
      const isMasonry = variant === 'masonry';
      return (
        <Shell>
          <div className={`pf-gallery-grid grid ${gridCols} ${spacious ? 'gap-5' : 'gap-3'}`}>
            {items.map((item, index) => (
              <figure key={index} className={`pf-gallery-item rounded-xl overflow-hidden bg-gray-100 ${isMasonry && index % 3 === 0 ? 'md:row-span-2' : ''}`}>
                <img loading="lazy" decoding="async" src={item.url} alt={item.alt || item.caption || ''} className={`w-full ${isMasonry && index % 3 === 0 ? 'h-80' : 'h-48'} object-cover`} />
                {item.caption && <figcaption className={`text-xs p-3 ${themeConfig.body}`}>{item.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'testimonial') {
      const isWall = variant === 'quotewall';
      const quoteItems = isWall && items.length ? items : [{ ...content }];
      return (
        <Shell>
          <div className={`pf-testimonial-grid grid ${isWall ? 'md:grid-cols-2' : 'grid-cols-1'} gap-4`}>
            {quoteItems.map((quote, index) => (
              <div key={index} className={`pf-testimonial-card rounded-xl p-8 ${themeConfig.card}`}>
                <p className={`pf-testimonial-quote text-xl leading-relaxed ${themeConfig.body}`}>"{quote.quote || quote.text || ''}"</p>
                {(quote.author || quote.role) && (
                  <p className={`pf-testimonial-author text-sm mt-4 ${themeConfig.muted}`}>{quote.author}{quote.role ? `, ${quote.role}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'cta') {
      const isSplit = variant === 'split';
      return (
        <Shell>
          <div className={`pf-cta-card rounded-xl p-8 text-white ${isSplit ? 'grid md:grid-cols-[1.4fr_auto] gap-6 items-center text-left' : 'text-center'}`} style={{ background: accentColor }}>
            <div>
              <h2 className="pf-cta-title text-2xl font-bold">{content.heading || sectionTitle || 'Ready to connect?'}</h2>
              {content.text && <p className="pf-cta-text mt-2 opacity-90">{content.text}</p>}
            </div>
            {content.href && (
              <a href={content.href} className="pf-cta-link inline-flex justify-center mt-5 md:mt-0 px-5 py-2 rounded-xl bg-white/95 text-gray-900 text-sm font-semibold">
                {content.label || 'Get in touch'}
              </a>
            )}
          </div>
        </Shell>
      );
    }

    if (section.type === 'linkList') {
      const isGrid = variant === 'resourcegrid';
      return (
        <Shell>
          <div className={`pf-link-list ${isGrid ? 'grid md:grid-cols-2' : 'flex flex-wrap'} gap-3`}>
            {items.map((item, index) => (
              <a key={index} href={item.href} target="_blank" rel="noreferrer" className={`pf-link-item px-4 py-2 rounded-xl text-sm font-medium ${themeConfig.card}`}>
                {item.label || item.href}
              </a>
            ))}
          </div>
        </Shell>
      );
    }

    if (section.type === 'featuredProjects') {
      const ids = new Set(Array.isArray(content.projectIds) ? content.projectIds : []);
      const selected = ids.size ? projects.filter((project) => ids.has(project.id)) : projects.filter((project) => project.is_featured);
      const isCaseList = variant === 'casestudylist';
      const isScroll = variant === 'horizontalscroll';
      return (
        <Shell>
          <div className={`pf-projects ${isScroll ? 'flex overflow-x-auto snap-x pb-3' : `grid ${isCaseList ? 'grid-cols-1' : colClass}`} ${gridGap}`} style={projectsStyle}>
            {selected.slice(0, content.limit || 3).map((project) => (
              isScroll
                ? <div key={project.id} className="pf-project-scroll-item min-w-[280px] md:min-w-[420px] snap-start"><ProjectCard project={project} /></div>
                : <ProjectCard key={project.id} project={project} wide={isCaseList} />
            ))}
          </div>
        </Shell>
      );
    }

    return null;
  };

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'header':
        return <HeaderSection key="header" />;
      case 'projects':
        return <ProjectsSection key="projects" />;
      case 'contact':
        return <ContactSection key="contact" />;
      case 'education':
        return <EducationSection key="education" />;
      case 'endorsements':
        return <EndorsementsSection key="endorsements" />;
      default:
        return <CustomSection key={sectionId} section={(settings.site_sections || []).find((section) => section.id === sectionId)} />;
    }
  };

  const VIEWER_LAYOUTS = [
    { id: null,        icon: '◈', label: 'Default'  },
    { id: 'grid',      icon: '⊞', label: 'Grid'     },
    { id: 'minimal',   icon: '☰', label: 'List'     },
    { id: 'fullwidth', icon: '▬', label: 'Wide'     },
  ];

  const Nav = () => (
    <nav className={`pf-nav px-6 py-4 flex items-center justify-between ${themeConfig.nav}`}>
      <Link to="/" className={`text-sm font-medium ${themeConfig.muted} hover:opacity-80`}>ProjectFolio</Link>
      <div className="flex items-center gap-3">
        {animations.pageBackground !== 'none' && <span className={`text-xs ${themeConfig.muted}`}>Animated</span>}
        {/* Viewer layout switcher */}
        <div className={`flex items-center gap-0.5 p-1 rounded-xl ${themeConfig.tag}`}>
          {VIEWER_LAYOUTS.map((l) => (
            <button
              key={String(l.id)}
              onClick={() => setViewerLayout(l.id)}
              title={l.label}
              className={`px-2 py-1 rounded-lg text-xs transition-all ${viewerLayout === l.id ? 'bg-white dark:bg-gray-900 shadow-sm' : 'opacity-40 hover:opacity-70'}`}
            >
              <IconText text={l.icon} />
            </button>
          ))}
        </div>
      </div>
    </nav>
  );

  const designContentWide = Boolean(designSystem.tokens?.contentWidth);
  const contentWidth = designContentWide ? 'max-w-none' : effectiveLayout === 'fullwidth' || effectiveLayout === 'grid' ? 'max-w-7xl' : 'max-w-5xl';
  const contentStyle = designContentWide ? { maxWidth: 'var(--pf-content-width)' } : undefined;

  if (effectiveLayout === 'sidebar') {
    return (
      <div id="pf-root" className={`pf-portfolio min-h-screen ${themeConfig.page} ${designClass}`} style={rootStyle}>
        <Nav />
        <div className="max-w-6xl mx-auto px-6 py-16" style={contentStyle}>
          <div className="flex flex-col lg:flex-row gap-12">
            <aside className="lg:w-80 lg:flex-shrink-0">
              <div className="lg:sticky lg:top-8">
                <HeaderSection compact />
              </div>
            </aside>
            <main className="pf-main flex-1 min-w-0">
              {sectionOrder.filter((id) => id !== 'header').map(renderSection)}
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="pf-root" className={`pf-portfolio min-h-screen ${themeConfig.page} ${designClass}`} style={rootStyle}>
      <Nav />
      <main className={`pf-main ${contentWidth} mx-auto px-6 pb-20`} style={contentStyle}>
        {sectionOrder.map(renderSection)}
      </main>
    </div>
  );
}
