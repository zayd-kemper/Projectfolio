// Site Agent workspace: conversation, change-set review, recovery, memory.
// Moved verbatim from PortfolioSettingsPage.jsx (see DESIGN.md migration).

import { useState, useEffect } from 'react';
import EngineeringIcon from '../shared/EngineeringIcon';
import ActiveProgress from '../shared/ActiveProgress';
import ConfirmDialog from '../shared/ConfirmDialog';

const getChangeSetTime = (changeSet = {}) => {
  const value = new Date(changeSet.applied_at || changeSet.created_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const mergeAgentChangeSets = (...groups) => {
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
              <div key={`${entry.attempt}-${entry.status}`} className="rounded-lg bg-surface/70 border border-line-subtle p-2">
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
              <span key={item} className="text-[11px] px-2 py-0.5 rounded-full bg-surface/80 text-ink-secondary border border-line">
                {item}
              </span>
            ))}
            {changedItems.length > 8 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface/80 text-ink-muted border border-line">
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
    <details className="rounded-xl border border-line bg-surface/70">
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
    <div className="rounded-xl border border-accent-border bg-surface/80 p-3 space-y-3">
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
              <div key={section.id} className="rounded-lg border border-accent-border bg-surface/70 p-2">
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
            <div key={`${check.page || 'page'}-${check.viewport}`} className="rounded-lg bg-surface/70 border border-line-subtle p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink">{check.page ? `${check.page} / ` : ''}{check.viewport}</span>
                <span className={`text-[10px] uppercase ${check.status === 'passed' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>{check.status}</span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1">
                {check.width}x{check.height}, {check.projectCardCount || 0} card{check.projectCardCount === 1 ? '' : 's'}, overflow {check.horizontalOverflow || 0}px
              </p>
              {check.screenshot && (
                <p className="text-[10px] text-ink-muted mt-0.5">
                  screenshot {check.screenshot.likelyNonBlank ? 'nonblank' : 'unclear'} - {Math.round((check.screenshot.bytes || 0) / 1024)} KB
                </p>
              )}
              {check.screenshot?.path && (
                <p className="text-[10px] text-ink-muted mt-0.5 truncate" title={check.screenshot.path}>
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
          <span key={`${recipe.type}-${index}`} className="text-[11px] px-2 py-0.5 rounded-full bg-surface/80 text-accent-text border border-accent-border">
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
        <span className="text-[10px] px-2 py-1 rounded-full bg-surface/80 text-accent-text">
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
            <div key={label} className="rounded-xl bg-surface/80 border border-accent-border p-3">
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
            <div className="rounded-xl border border-accent-border bg-surface/70 p-3">
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
        <div className="rounded-xl border border-accent-border bg-surface/70 p-3">
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
    <div className="rounded-xl border border-line bg-surface/80 overflow-hidden">
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
                      <p className="text-[10px] font-bold  text-ink-muted">Applied</p>
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
                        <p className="text-[10px] font-bold  text-ink-muted">Live routes</p>
                        <p className={`mt-0.5 ${liveStatusClass}`}>
                          {live.status}{totalChecks ? ` - ${passedChecks}/${totalChecks} checks passed, ${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                    )}
                    {(sectionCount > 0 || codeCount > 0 || surfaces.settings?.length > 0) && (
                      <div className="rounded-xl bg-surface/50 border border-line-subtle px-3 py-2 sm:col-span-2">
                        <p className="text-[10px] font-bold  text-ink-muted">Owned surfaces</p>
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
                  <span className="block text-[10px] text-ink-muted mt-0.5">
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
                <span className="text-[10px] text-ink-muted">{memory.kind || 'preference'}</span>
                <button
                  type="button"
                  onClick={() => onDelete(memory.id)}
                  className="text-[11px] text-ink-muted hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
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

export function parseAgentMessageMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

export function getAgentClarification(message) {
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

export default function AgentWorkspace({
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
  // Compact hosts (the /dashboard/agent split view) stack panels in one
  // column; viewport-width grid variants would crush inside a narrow column.
  compact = false,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  const hasPendingClarification = messages.some((message) => getAgentClarification(message));

  // Destructive agent actions confirm through the shared dialog; the hook's
  // actions execute unconditionally once confirmed.
  const [pendingAction, setPendingAction] = useState(null);
  const REMOVE_LABELS = {
    visual: 'Remove the AI-owned visual changes from this bundle? This restores the visual settings this bundle touched, including native theme surfaces that clearing custom code does not remove.',
    sections: 'Remove the custom sections created by this AI bundle? Other settings and code/effects will remain.',
    code: 'Remove the generated CSS, JavaScript, theme override keys, animations, and interaction effects owned by this AI bundle?',
  };
  const confirmRevert = (cs) => {
    const snapshotAt = cs?.preview?.rollbackSnapshot?.capturedAt;
    const snapshotLabel = snapshotAt ? new Date(snapshotAt).toLocaleString() : 'before this AI bundle was applied';
    setPendingAction({
      title: `Revert your website to the snapshot from ${snapshotLabel}?`,
      description: 'This restores settings, sections, profile fields, projects, and project blocks. Any newer manual edits or later AI changes to those areas may be overwritten.',
      confirmLabel: 'Revert website',
      run: () => onRevert(cs),
    });
  };
  const confirmRemove = (cs, removeMode = 'visual') => setPendingAction({
    title: 'Remove these AI changes?',
    description: REMOVE_LABELS[removeMode] || REMOVE_LABELS.visual,
    confirmLabel: 'Remove changes',
    run: () => onRemove(cs, removeMode),
  });
  const confirmReset = (resetMode) => setPendingAction(resetMode === 'all'
    ? {
        title: 'Revert everything the Site Agent applied?',
        description: 'This restores the website to the earliest pre-agent snapshot, including settings, profile fields, projects, project order, and project blocks. Agent memories will also be cleared. Newer manual edits in those areas may be overwritten.',
        confirmLabel: 'Revert everything',
        run: () => onReset(resetMode),
      }
    : {
        title: 'Remove the AI design layer?',
        description: 'This clears generated sections, design tokens, animations, interactions, and generated CSS. Manual CSS, section visibility/order choices, profile, and project content will be kept.',
        confirmLabel: 'Remove AI design',
        run: () => onReset(resetMode),
      });
  const confirmDeleteThread = (id) => setPendingAction({
    title: 'Delete this Site Agent chat?',
    description: 'This removes the chat history and any memories tied to this thread. Applied website changes remain until you remove or revert them.',
    confirmLabel: 'Delete chat',
    run: () => onDeleteThread(id),
  });

  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-line bg-surface p-5">
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
        <div className={`grid gap-5 ${sidebarOpen && !compact ? 'xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
          {sidebarOpen && (
            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Chats and memory">
              <AgentThreadPanel
                threads={threads}
                currentThreadId={threadId}
                onSelectThread={onLoadThread}
                onNewChat={() => onLoadThread('')}
                onDeleteThread={confirmDeleteThread}
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
                  <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
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
              onRevert={confirmRevert}
              onVerifyLive={onVerifyLive}
              onRemove={confirmRemove}
              onReset={confirmReset}
            />
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => { if (!open) setPendingAction(null); }}
        title={pendingAction?.title}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        destructive
        onConfirm={() => pendingAction?.run()}
      />
    </div>
  );
}
