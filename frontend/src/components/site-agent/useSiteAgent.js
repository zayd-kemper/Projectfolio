// Site Agent orchestration: thread/message state, chat, change-set
// apply/revert/remove/reset, memory. Moved verbatim from
// PortfolioSettingsPage so the settings page and the /dashboard/agent room
// share one implementation. Destructive confirmations live in
// AgentWorkspace's ConfirmDialog, not here — actions run when called.
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { resolveJobResponse } from '../../utils/jobs';
import { mergeAgentChangeSets, parseAgentMessageMetadata, getAgentClarification } from './AgentWorkspace';

export const DEFAULT_AGENT_MODES = [
  { id: 'auto', name: 'Auto', description: 'Route this request automatically.' },
  { id: 'fast', name: 'Fast edits', description: 'Small CSS, copy, and settings changes.' },
  { id: 'midUi', name: 'Mid-sized UI', description: 'Focused sections, layout, CSS, and safe interactions.' },
  { id: 'largeUi', name: 'Large UI build', description: 'Complex redesigns and advanced UI bundles.' },
  { id: 'design', name: 'Design planning', description: 'Brief, site plan, UX, and visual direction.' },
  { id: 'code', name: 'Advanced code', description: 'Implementation-heavy CSS, animations, and safe interactions.' },
  { id: 'critic', name: 'Critic', description: 'Accessibility, responsiveness, and compatibility review.' },
];

export default function useSiteAgent({ user, settings, setSettings, settingsPayload, refreshSettingsFromDb }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, settings.preferred_ai_model]);

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

  // Destructive actions below run unconditionally when called; the hosting
  // UI (AgentWorkspace) is responsible for confirmation.
  const revertAgentChangeSet = async (changeSet) => {
    if (!changeSet?.id) return;
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

  return {
    agentModels, agentModelId, agentModes, agentMode, agentThreads, agentThreadId,
    agentMessages, agentPrompt, agentLoading, agentChangeSet, agentChangeSets,
    agentApplying, agentRevertingId, agentVerifyingId, agentRemovingId,
    agentResettingMode, agentMemories, agentWarning,
    setAgentMode, setAgentPrompt, setAgentWarning,
    loadAgentThread, persistAgentModel, handleAgentChat, handleAgentClarificationAnswer,
    applyAgentChangeSet, discardAgentChangeSet, revertAgentChangeSet,
    verifyAgentChangeSetLive, removeAgentChangeSurfaces, resetAgentChanges,
    deleteAgentMemory, deleteAgentThread,
  };
}
