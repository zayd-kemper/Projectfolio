// frontend/src/pages/PortfolioStudioPage.jsx
// Portfolio Studio: the one destination for portfolio design. Two coordinated
// input modes on the same canvas — Chat (the site agent) and Controls (manual
// settings) — mutate the same settings snapshot and the same live preview.
// Replaces the split Site Agent page + Settings→Portfolio tab.
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import AgentWorkspace from '../components/site-agent/AgentWorkspace';
import useSiteAgent from '../components/site-agent/useSiteAgent';
import PortfolioSettingsPage from './PortfolioSettingsPage';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

const LAST_MODE_KEY = 'projectfolio.studio.mode';
const MODES = [
  { id: 'chat', label: 'Chat', icon: 'ai-core' },
  { id: 'controls', label: 'Controls', icon: 'settings-gear' },
];

const parseJsonb = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const parseServerSettings = (raw = {}) => ({
  ...raw,
  section_order: parseJsonArray(raw.section_order),
  section_config: parseJsonb(raw.section_config),
  theme_overrides: parseJsonb(raw.theme_overrides),
  animations: parseJsonb(raw.animations),
  site_sections: parseJsonArray(raw.site_sections),
  design_system: parseJsonb(raw.design_system),
  interactions: parseJsonArray(raw.interactions),
  manual_custom_css: typeof raw.manual_custom_css === 'string' ? raw.manual_custom_css : (raw.manual_custom_css || ''),
  agent_custom_css: typeof raw.agent_custom_css === 'string' ? raw.agent_custom_css : (raw.agent_custom_css || ''),
  manual_design_overrides: parseJsonb(raw.manual_design_overrides),
  agent_design_meta: parseJsonb(raw.agent_design_meta),
  custom_js: null,
  custom_site_enabled: raw.custom_site_enabled === true,
});

const readLastMode = () => {
  try {
    const value = window.localStorage.getItem(LAST_MODE_KEY);
    return MODES.some((mode) => mode.id === value) ? value : null;
  } catch { return null; }
};

export default function PortfolioStudioPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState({});
  const [previewNonce, setPreviewNonce] = useState(0);
  const [viewport, setViewport] = useState('desktop');
  // Mobile/tablet: one pane at a time.
  const [pane, setPane] = useState('edit');

  const modeParam = searchParams.get('mode');
  const mode = MODES.some((item) => item.id === modeParam) ? modeParam : (readLastMode() || 'chat');

  const setMode = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', id);
    if (id === 'chat') next.delete('section');
    setSearchParams(next, { replace: true });
    try { window.localStorage.setItem(LAST_MODE_KEY, id); } catch { /* private mode */ }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      if (res.data?.settings) setSettings(parseServerSettings(res.data.settings));
    } catch {
      // The studio still functions without a settings snapshot.
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Called after any change lands (agent apply/revert, manual save):
  // refresh the snapshot and reload the live preview.
  const refreshSettingsFromDb = useCallback(async () => {
    await fetchSettings();
    setPreviewNonce((nonce) => nonce + 1);
  }, [fetchSettings]);

  // Only the model preference is persisted from this page.
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
      changedKeys: ['preferred_ai_model'],
      custom_css: manualCss,
      manual_custom_css: manualCss,
      custom_js: null,
    };
  };

  const agent = useSiteAgent({ user, settings, setSettings, settingsPayload, refreshSettingsFromDb });
  const previewUrl = user?.username ? `/${user.username}` : null;

  const agentDesignActive = Boolean(
    (settings.agent_custom_css || '').trim() ||
    Object.keys(settings.agent_design_meta || {}).length > 0 ||
    (settings.site_sections || []).length > 0
  );
  const manualOverrideCount = Object.keys(settings.manual_design_overrides || {}).length;

  const modeSwitch = (
    <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1" role="tablist" aria-label="Editing mode">
      {MODES.map((item) => {
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(item.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <EngineeringIcon name={item.icon} size="1em" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  // The layering status lives where both modes converge.
  const statusBar = (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${
        agentDesignActive ? 'bg-accent text-white' : 'bg-surface-muted text-ink-muted'
      }`}>
        {agentDesignActive ? 'AI design active' : 'Manual only'}
      </span>
      {manualOverrideCount > 0 && (
        <span className="text-ink-muted">Manual overrides: {manualOverrideCount}</span>
      )}
      <span className="text-ink-muted">Manual settings win unless you ask for a redesign.</span>
      {mode === 'controls' && (
        <button type="button" onClick={() => setMode('chat')} className="font-semibold text-accent-text hover:underline">
          View history
        </button>
      )}
    </div>
  );

  const editColumn = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 xl:overflow-y-auto">
        {mode === 'chat' ? (
          <AgentWorkspace
            compact
            user={user}
            settings={settings}
            threads={agent.agentThreads}
            threadId={agent.agentThreadId}
            messages={agent.agentMessages}
            prompt={agent.agentPrompt}
            loading={agent.agentLoading}
            changeSet={agent.agentChangeSet}
            changeSets={agent.agentChangeSets}
            applying={agent.agentApplying}
            warning={agent.agentWarning}
            models={agent.agentModels}
            modelId={agent.agentModelId}
            modes={agent.agentModes}
            mode={agent.agentMode}
            memories={agent.agentMemories}
            revertingId={agent.agentRevertingId}
            verifyingId={agent.agentVerifyingId}
            removingId={agent.agentRemovingId}
            resettingMode={agent.agentResettingMode}
            onLoadThread={agent.loadAgentThread}
            onModeChange={agent.setAgentMode}
            onModelChange={agent.persistAgentModel}
            onPromptChange={agent.setAgentPrompt}
            onSubmit={agent.handleAgentChat}
            onDismissWarning={() => agent.setAgentWarning(null)}
            onApply={agent.applyAgentChangeSet}
            onDiscard={agent.discardAgentChangeSet}
            onRevert={agent.revertAgentChangeSet}
            onVerifyLive={agent.verifyAgentChangeSetLive}
            onRemove={agent.removeAgentChangeSurfaces}
            onReset={agent.resetAgentChanges}
            onDeleteMemory={agent.deleteAgentMemory}
            onDeleteThread={agent.deleteAgentThread}
            onClarificationAnswer={agent.handleAgentClarificationAnswer}
          />
        ) : (
          <PortfolioSettingsPage noLayout onSaved={refreshSettingsFromDb} />
        )}
      </div>
      {statusBar}
    </div>
  );

  const preview = (
    <div className="card flex min-h-[420px] flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <EngineeringIcon name="eye-view" size="1rem" />
          Live preview
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-surface-muted p-0.5">
            {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewport(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewport === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPreviewNonce((nonce) => nonce + 1)}
            className="btn-ghost px-2.5 py-1 text-xs"
            title="Reload preview"
          >
            Refresh
          </button>
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="btn-ghost px-2.5 py-1 text-xs">
              Open site
            </a>
          ) : null}
        </div>
      </div>
      {settings.is_public === false ? (
        <div className="border-b border-line-subtle bg-surface-muted px-4 py-2 text-xs text-ink-muted">
          Your portfolio is currently private — this preview is only visible to you.
        </div>
      ) : null}
      {agent.agentChangeSet ? (
        <div className="border-b border-accent-border bg-accent-surface px-4 py-2 text-xs text-accent-text">
          A proposed change bundle is awaiting review. The preview shows your current live site until you apply it.
        </div>
      ) : null}
      <div className="flex flex-1 justify-center overflow-hidden bg-surface-muted p-3">
        {previewUrl ? (
          <iframe
            key={previewNonce}
            src={previewUrl}
            title="Portfolio live preview"
            className={`h-full rounded-lg border border-line bg-white transition-[width] duration-200 ease-out-quart ${
              viewport === 'mobile' ? 'w-[390px]' : 'w-full'
            }`}
          />
        ) : (
          <div className="flex items-center justify-center text-sm text-ink-muted">
            Publish your portfolio to see the live preview here.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-subtitle">
            Ask the agent or adjust the controls — both shape the same live site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modeSwitch}
          <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1 xl:hidden">
            {[['edit', 'Edit'], ['preview', 'Preview']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPane(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  pane === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:h-[calc(100vh-14rem)] xl:flex-row">
        <div className={`min-w-0 xl:block xl:flex-none ${mode === 'controls' ? 'xl:w-[36rem]' : 'xl:w-[30rem]'} ${pane === 'edit' ? '' : 'hidden'}`}>
          {editColumn}
        </div>
        <div className={`min-h-[420px] flex-1 xl:flex ${pane === 'preview' ? 'flex' : 'hidden'} xl:min-h-0`}>
          {preview}
        </div>
      </div>
    </DashboardLayout>
  );
}
