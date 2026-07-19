// frontend/src/pages/PortfolioSettingsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

// Sub-navigation groups within the Portfolio settings tab.
const SECTION_GROUPS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'sections', label: 'Sections' },
  { id: 'seo', label: 'SEO' },
  { id: 'custom-code', label: 'Custom code' },
];

import useSiteAgent from '../components/site-agent/useSiteAgent';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { CUSTOM_SITE_LIMITS, buildCustomSiteData, validateCustomSiteClient, buildCustomSitePreviewDocument, buildStarterCustomSite } from '../components/site-agent/customSitePreview';

export default function PortfolioSettingsPage({ noLayout = false, onSaved }) {
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
      toast.error(err.response?.data?.error || 'Failed to create request.');
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
      onSaved?.();
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

  const { agentChangeSets, agentResettingMode, resetAgentChanges } = useSiteAgent({ user, settings, setSettings, settingsPayload, refreshSettingsFromDb });
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const activeSection = SECTION_GROUPS.some((group) => group.id === sectionParam) ? sectionParam : 'appearance';
  const selectSection = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('section', id);
    return next;
  }, { replace: true });
  // Confirmation for the in-page (non-workspace) Remove AI design buttons.
  const [confirmAgentReset, setConfirmAgentReset] = useState(false);
  const [confirmEndorsementDelete, setConfirmEndorsementDelete] = useState(null);
  // 'starter' | 'clear-css'
  const [confirmCustomCode, setConfirmCustomCode] = useState(null);

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

  const requestCustomSiteStarter = () => {
    if (hasCustomSiteDraft) { setConfirmCustomCode('starter'); return; }
    seedCustomSiteStarter();
  };

  const seedCustomSiteStarter = () => {
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

        {/* Group navigation: URL-addressable so sections deep-link. */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          {SECTION_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => selectSection(group.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                activeSection === group.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>

        {activeSection === 'appearance' && (<>

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
                      : 'bg-surface-muted text-ink-muted'
                  }`}>
                    {agentDesignActive ? 'AI design active' : 'Manual only'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  Manual settings, generated sections, design tokens, interactions, and CSS now save as separate layers.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded-lg bg-surface/80 border border-accent-border text-ink-secondary">
                    Manual overrides: {manualOverrideCount}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-surface/80 border border-accent-border text-ink-secondary">
                    AI sections: {generatedSections.length}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-surface/80 border border-accent-border text-ink-secondary">
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
                    onClick={() => setConfirmAgentReset(true)}
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

        </>)}

        {activeSection === 'sections' && (<>
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
                                  <span className="text-xs text-ink-muted bg-surface-muted px-1.5 py-0.5 rounded">
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
                              <span className="text-xs font-mono text-ink-muted">{index + 1}</span>
                              {!section.required && (
                                <button
                                  onClick={() => section.generated ? deleteGeneratedSection(sectionId) : removeSection(sectionId)}
                                  title={section.generated ? 'Delete generated section' : 'Remove section'}
                                  aria-label={section.generated ? 'Delete generated section' : 'Remove section'}
                                  className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-surface-muted transition-all text-xs leading-none"
                                ><EngineeringIcon name="close" size="0.7em" /></button>
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
              <p className="text-xs text-ink-muted mb-2">Add optional sections</p>
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
              <p className="text-xs text-ink-muted mb-2">Hidden AI sections</p>
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

          <p className="text-xs text-ink-muted mt-3">
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
                            {cred.title || <span className="text-ink-muted italic">Untitled</span>}
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
                            className="px-2.5 py-1 text-xs rounded-lg border border-line text-ink-muted hover:text-red-500 hover:border-red-300 transition-all"
                          ><EngineeringIcon name="close" size="0.7em" /></button>
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
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="form-label text-xs">Title</label>
                            <input value={credDraft.title || ''} onChange={e => setCredDraft(d => ({...d, title: e.target.value}))} placeholder="e.g. B.S. Computer Science" className="form-input text-sm" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="form-label text-xs">Institution</label>
                            <input value={credDraft.institution || ''} onChange={e => setCredDraft(d => ({...d, institution: e.target.value}))} placeholder="e.g. Massachusetts Institute of Technology" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Field / Subject <span className="font-normal text-ink-muted">(optional)</span></label>
                            <input value={credDraft.field || ''} onChange={e => setCredDraft(d => ({...d, field: e.target.value}))} placeholder="e.g. Electrical Engineering" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Honors / Note <span className="font-normal text-ink-muted">(optional)</span></label>
                            <input value={credDraft.honors || ''} onChange={e => setCredDraft(d => ({...d, honors: e.target.value}))} placeholder="e.g. Summa Cum Laude" className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Year start <span className="font-normal text-ink-muted">(optional)</span></label>
                            <input value={credDraft.year_start || ''} onChange={e => setCredDraft(d => ({...d, year_start: e.target.value}))} placeholder="2020" maxLength={4} className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Year end <span className="font-normal text-ink-muted">(optional)</span></label>
                            <input value={credDraft.year_end || ''} onChange={e => setCredDraft(d => ({...d, year_end: e.target.value}))} placeholder="2024 or Present" className="form-input text-sm" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="form-label text-xs">Credential URL <span className="font-normal text-ink-muted">(optional)</span></label>
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="form-label text-xs">Title</label>
                        <input autoFocus value={credDraft.title || ''} onChange={e => setCredDraft(d => ({...d, title: e.target.value}))} placeholder="e.g. B.S. Computer Science" className="form-input text-sm" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="form-label text-xs">Institution</label>
                        <input value={credDraft.institution || ''} onChange={e => setCredDraft(d => ({...d, institution: e.target.value}))} placeholder="e.g. Massachusetts Institute of Technology" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Field / Subject <span className="font-normal text-ink-muted">(optional)</span></label>
                        <input value={credDraft.field || ''} onChange={e => setCredDraft(d => ({...d, field: e.target.value}))} placeholder="e.g. Electrical Engineering" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Honors / Note <span className="font-normal text-ink-muted">(optional)</span></label>
                        <input value={credDraft.honors || ''} onChange={e => setCredDraft(d => ({...d, honors: e.target.value}))} placeholder="e.g. Summa Cum Laude" className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Year start <span className="font-normal text-ink-muted">(optional)</span></label>
                        <input value={credDraft.year_start || ''} onChange={e => setCredDraft(d => ({...d, year_start: e.target.value}))} placeholder="2020" maxLength={4} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Year end <span className="font-normal text-ink-muted">(optional)</span></label>
                        <input value={credDraft.year_end || ''} onChange={e => setCredDraft(d => ({...d, year_end: e.target.value}))} placeholder="2024 or Present" className="form-input text-sm" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="form-label text-xs">Credential URL <span className="font-normal text-ink-muted">(optional)</span></label>
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
              <p className="text-xs font-semibold text-ink-muted mb-2">Awaiting response ({endorsements.filter(e => !e.quote).length})</p>
              <div className="space-y-2">
                {endorsements.filter(e => !e.quote).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line-subtle text-sm">
                    <EngineeringIcon name="clock" size="1rem" className="text-ink-muted" />
                    <div className="flex-1 min-w-0">
                      <span className="text-ink-muted">{e.from_email || 'No email'}</span>
                      {e.project_title && <span className="text-ink-muted ml-2">/ {e.project_title}</span>}
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/endorse/${e.token}`); }}
                      className="text-xs text-accent-text hover:underline"
                      title="Copy submission link"
                    >Copy link</button>
                    <button onClick={() => setConfirmEndorsementDelete(e.id)} className="text-xs text-ink-muted hover:text-red-500"><EngineeringIcon name="close" size="0.7em" /></button>
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
                    {e.project_title && <p className="text-xs text-ink-muted mt-0.5">Re: {e.project_title}</p>}
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
                      <p className="text-xs text-ink-muted mt-0.5">{e.from_name}{e.from_role ? `, ${e.from_role}` : ''}</p>
                    </div>
                    <button onClick={() => setConfirmEndorsementDelete(e.id)} className="text-xs text-ink-muted hover:text-red-500 flex-shrink-0"><EngineeringIcon name="close" size="0.7em" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endorsements.filter(e => e.is_rejected).length > 0 && (
            <details className="mb-4">
              <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink-secondary select-none">
                {endorsements.filter(e => e.is_rejected).length} rejected
              </summary>
              <div className="mt-2 space-y-2">
                {endorsements.filter(e => e.is_rejected).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line-subtle text-sm opacity-50">
                    <span className="flex-1 min-w-0 text-xs text-ink-muted truncate">"{e.quote}"</span>
                    <button onClick={() => setConfirmEndorsementDelete(e.id)} className="text-xs text-ink-muted hover:text-red-400"><EngineeringIcon name="close" size="0.7em" /></button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {endorseRequestOpen ? (
            <div className="border border-accent-border rounded-xl p-4 space-y-3 bg-accent-surface/50">
              <p className="text-sm font-medium text-ink">Request an endorsement</p>
              <div>
                <label className="form-label text-xs">Email address <span className="text-ink-muted font-normal">(optional, leave blank to get a shareable link)</span></label>
                <input value={requestEmail} onChange={e => setRequestEmail(e.target.value)} type="email" placeholder="collaborator@example.com" className="form-input text-sm" />
              </div>
              <div>
                <label className="form-label text-xs">Link to a project <span className="text-ink-muted font-normal">(optional)</span></label>
                <select value={requestProjectId} onChange={e => setRequestProjectId(e.target.value)} className="form-input text-sm">
                  <option value="">No specific project</option>
                  {myProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Personal note <span className="text-ink-muted font-normal">(optional, included in email)</span></label>
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

        </>)}

        {activeSection === 'seo' && (<>
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

        </>)}

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

        {/* When embedded in Portfolio Studio (noLayout), the agent is the Chat
            tab beside these controls — no pointer card needed. */}
        {!noLayout && (
          <div id="site-agent-workspace" className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <EngineeringIcon name="satellite" size="1.5rem" />
              <div className="min-w-0">
                <h3 className="font-semibold text-ink">The agent lives in Portfolio Studio</h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Chat with the agent beside a live preview of your site — threads, memory, and recovery included.
                </p>
              </div>
            </div>
            <Link to="/dashboard/portfolio?mode=chat" className="btn-primary flex-shrink-0 text-sm">
              Open Portfolio Studio
            </Link>
          </div>
        )}
        {activeSection === 'custom-code' && (<>
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
                  onClick={() => setConfirmAgentReset(true)}
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
              <div className="mb-4 rounded-xl border border-line bg-surface/70 p-3">
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
                      <span className="text-ink-muted truncate">{d}</span>
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
                  onClick={() => setConfirmCustomCode('clear-css')}
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
                        onClick={() => setConfirmAgentReset(true)}
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
              <div className="rounded-xl border border-line bg-surface/70 p-3">
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
                      onClick={requestCustomSiteStarter}
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
                    <span className="text-[11px] font-mono text-ink-muted">
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
                      <span className="text-[10px] font-mono text-ink-muted">{customSiteTotalChars.toLocaleString()} chars</span>
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

        </>)}

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save settings'}
        </button>

      </div>
      <ConfirmDialog
        open={Boolean(confirmCustomCode)}
        onOpenChange={(open) => { if (!open) setConfirmCustomCode(null); }}
        title={confirmCustomCode === 'starter' ? 'Replace the current custom-site draft?' : 'Clear manual CSS?'}
        description={confirmCustomCode === 'starter'
          ? 'A fresh starter generated from your portfolio data overwrites the HTML, CSS, and JS drafts.'
          : 'Generated AI CSS and design layers remain until you use Remove AI design.'}
        confirmLabel={confirmCustomCode === 'starter' ? 'Replace draft' : 'Clear manual CSS'}
        destructive
        onConfirm={() => { if (confirmCustomCode === 'starter') seedCustomSiteStarter(); else setSettings(s => ({ ...s, manual_custom_css: '', custom_css: agentDesignActive ? (s.agent_custom_css || '') : '' })); }}
      />
      <ConfirmDialog
        open={Boolean(confirmEndorsementDelete)}
        onOpenChange={(open) => { if (!open) setConfirmEndorsementDelete(null); }}
        title="Delete this endorsement?"
        description="The endorsement is removed from your portfolio permanently."
        confirmLabel="Delete endorsement"
        destructive
        onConfirm={() => deleteEndorsement(confirmEndorsementDelete)}
      />
      <ConfirmDialog
        open={confirmAgentReset}
        onOpenChange={setConfirmAgentReset}
        title="Remove the AI design layer?"
        description="This clears generated sections, design tokens, animations, interactions, and generated CSS. Manual CSS, section visibility and order choices, profile, and project content are kept."
        confirmLabel="Remove AI design"
        destructive
        onConfirm={() => resetAgentChanges('visual')}
      />
    </>
  );

  return noLayout ? inner : <DashboardLayout>{inner}</DashboardLayout>;
}
