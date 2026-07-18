const GROQ_LEGACY_MODEL_ID = 'groq:llama-3.3-70b-versatile';
const DEFAULT_AGENT_MODE = 'auto';

const envFlag = (name) => ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
const envFlagDefault = (name, fallback) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return envFlag(name);
};
const intEnv = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = intEnv('AI_PROVIDER_TIMEOUT_MS', 120000);
const GROQ_PROVIDER_TIMEOUT_MS = intEnv('GROQ_PROVIDER_TIMEOUT_MS', 75000);
const NVIDIA_PROVIDER_TIMEOUT_MS = intEnv('NVIDIA_PROVIDER_TIMEOUT_MS', 150000);
const NVIDIA_GPT_OSS_TIMEOUT_MS = intEnv('NVIDIA_GPT_OSS_TIMEOUT_MS', NVIDIA_PROVIDER_TIMEOUT_MS);
const OPENROUTER_PROVIDER_TIMEOUT_MS = intEnv('OPENROUTER_PROVIDER_TIMEOUT_MS', 150000);
const OPENROUTER_QWEN_TIMEOUT_MS = intEnv('OPENROUTER_QWEN_TIMEOUT_MS', OPENROUTER_PROVIDER_TIMEOUT_MS);
const OPENROUTER_NEMOTRON_TIMEOUT_MS = intEnv('OPENROUTER_NEMOTRON_TIMEOUT_MS', OPENROUTER_PROVIDER_TIMEOUT_MS);
const OPENROUTER_LAGUNA_TIMEOUT_MS = intEnv('OPENROUTER_LAGUNA_TIMEOUT_MS', OPENROUTER_PROVIDER_TIMEOUT_MS);
const OPENROUTER_NEX_TIMEOUT_MS = intEnv('OPENROUTER_NEX_TIMEOUT_MS', 220000);

const providerConfig = {
  groq: {
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    enabledFlag: null,
  },
  nvidia: {
    apiKeyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    enabledFlag: 'ENABLE_NVIDIA_MODELS',
  },
  openrouter: {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrlEnv: 'OPENROUTER_BASE_URL',
    baseUrl: 'https://openrouter.ai/api/v1',
    enabledFlag: 'ENABLE_OPENROUTER_MODELS',
  },
};

const getProviderBaseUrl = (provider) => {
  const config = providerConfig[provider];
  if (!config) return null;
  const baseUrl = config.baseUrlEnv
    ? process.env[config.baseUrlEnv] || config.baseUrl || ''
    : config.baseUrl || '';
  return String(baseUrl).replace(/\/+$/, '');
};

const isProviderEnabled = (provider) => {
  const config = providerConfig[provider];
  if (!config) return false;
  if (config.enabledFlag && !envFlag(config.enabledFlag)) return false;
  return Boolean(process.env[config.apiKeyEnv] && getProviderBaseUrl(provider));
};

const AGENT_MODES = {
  auto: {
    id: 'auto',
    name: 'Auto',
    description: 'Automatically routes the request to the best available model profile.',
    requiredCapabilities: ['chat', 'json'],
    preferredModelIds: [
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'nvidia:gpt-oss-20b',
      'nvidia:nemotron-3-super-120b-a12b',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
    fallbackModelId: null,
  },
  fast: {
    id: 'fast',
    name: 'Fast edits',
    description: 'Small CSS edits, copy tweaks, settings patches, and quick follow-ups.',
    requiredCapabilities: ['chat', 'json'],
    fallbackModelId: null,
  },
  midUi: {
    id: 'midUi',
    name: 'Mid-sized UI',
    description: 'Moderate visual updates, focused sections, CSS, and native interaction recipes.',
    requiredCapabilities: ['chat', 'json', 'design'],
    preferredModelIds: ['qwen:qwen-3-coder-480b-a35b-instruct', 'nvidia:nemotron-3-super-120b-a12b', 'poolside:laguna-m1', 'nex:n2-pro'],
    fallbackModelId: null,
  },
  largeUi: {
    id: 'largeUi',
    name: 'Large UI build',
    description: 'Complex redesigns across native sections, design tokens, CSS, and safe interactions.',
    requiredCapabilities: ['chat', 'json', 'code', 'design'],
    preferredModelIds: [
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
    ],
    fallbackModelId: null,
  },
  design: {
    id: 'design',
    name: 'Design planning',
    description: 'Design brief, site plan, UX reasoning, and visual direction.',
    requiredCapabilities: ['chat', 'json', 'design'],
    preferredModelIds: ['nvidia:nemotron-3-super-120b-a12b', 'qwen:qwen-3-coder-480b-a35b-instruct'],
    fallbackModelId: null,
  },
  code: {
    id: 'code',
    name: 'Advanced code',
    description: 'Advanced CSS bundles, theme overrides, animations, and native interaction recipes.',
    requiredCapabilities: ['chat', 'json', 'code'],
    preferredModelIds: ['qwen:qwen-3-coder-480b-a35b-instruct', 'nvidia:gpt-oss-20b', 'nvidia:nemotron-3-super-120b-a12b'],
    fallbackModelId: null,
  },
  critic: {
    id: 'critic',
    name: 'Critic',
    description: 'Accessibility, responsiveness, design quality, and compatibility review.',
    requiredCapabilities: ['chat', 'json', 'design'],
    fallbackModelId: null,
  },
};

const INTEGRATION_MODEL_PROFILES = {
  'ai-match': {
    id: 'ai-match',
    name: 'AI Portfolio Match',
    description: 'Deep opportunity-to-portfolio fit analysis with grounded recommendations.',
    requiredCapabilities: ['chat', 'json'],
    preferredModelIds: [
      'nvidia:gpt-oss-20b',
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
    fallbackModelId: null,
  },
  'opportunity-finder': {
    id: 'opportunity-finder',
    name: 'Opportunity Finder',
    description: 'Portfolio-aware opportunity ranking across curated programs and cautious suggestions.',
    requiredCapabilities: ['chat', 'json'],
    preferredModelIds: [
      'nvidia:gpt-oss-20b',
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
    fallbackModelId: null,
  },
  'application-helper': {
    id: 'application-helper',
    name: 'Application Helper',
    description: 'Tailored cover letters and application packages grounded in portfolio data.',
    requiredCapabilities: ['chat', 'json'],
    preferredModelIds: [
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
    fallbackModelId: null,
  },
  // The advisor's model-swap point: reorder or replace these ids (or flip
  // provider env flags) to move from cheap test models to premium ones.
  advisor: {
    id: 'advisor',
    name: 'Portfolio Advisor',
    description: 'Portfolio growth analysis, suggestions, and roadmap grounded in portfolio evidence.',
    requiredCapabilities: ['chat', 'json'],
    preferredModelIds: [
      'nvidia:gpt-oss-20b',
      'nvidia:nemotron-3-super-120b-a12b',
      'nvidia:nemotron-3-super',
      'qwen:qwen-3-coder-480b-a35b-instruct',
      'poolside:laguna-m1',
      'nex:n2-pro',
    ],
    fallbackModelId: null,
  },
};

const MODEL_REGISTRY = [
  {
    id: GROQ_LEGACY_MODEL_ID,
    provider: 'groq',
    providerModel: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    description: 'Deprecated Groq-hosted model. Kept for old thread references only.',
    premium: false,
    enabled: false,
    contextWindow: 128000,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: GROQ_PROVIDER_TIMEOUT_MS,
    responseFormat: true,
  },
  {
    id: 'nvidia:gpt-oss-20b',
    provider: 'nvidia',
    providerModel: process.env.NVIDIA_GPT_OSS_20B_MODEL || 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    description: 'NVIDIA-hosted coding model for fast CSS, component, and native interaction edits.',
    premium: false,
    enabled: isProviderEnabled('nvidia'),
    contextWindow: 131000,
    capabilities: ['chat', 'json', 'code'],
    requestTimeoutMs: NVIDIA_GPT_OSS_TIMEOUT_MS,
    responseFormat: envFlagDefault('NVIDIA_GPT_OSS_JSON_MODE', true),
  },
  {
    id: 'qwen:qwen-3-coder-480b-a35b-instruct',
    provider: 'openrouter',
    providerModel: process.env.OPENROUTER_QWEN_CODER_MODEL || 'qwen/qwen3-coder',
    name: 'Qwen 3 Coder 480B A35B Instruct',
    description: 'OpenRouter-routed coding model for complex UI, CSS, and structured native interactions.',
    premium: true,
    enabled: isProviderEnabled('openrouter'),
    contextWindow: 1048576,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: OPENROUTER_QWEN_TIMEOUT_MS,
    responseFormat: envFlagDefault('OPENROUTER_QWEN_JSON_MODE', true),
  },
  {
    id: 'nvidia:nemotron-3-super-120b-a12b',
    provider: 'openrouter',
    providerModel: process.env.OPENROUTER_NEMOTRON_SUPER_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    name: 'NVIDIA Nemotron 3 Super 120B A12B',
    description: 'OpenRouter-routed reasoning/design model for large UI planning and critique.',
    premium: true,
    enabled: isProviderEnabled('openrouter'),
    contextWindow: 1000000,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: OPENROUTER_NEMOTRON_TIMEOUT_MS,
    responseFormat: envFlagDefault('OPENROUTER_NEMOTRON_JSON_MODE', true),
  },
  {
    id: 'nvidia:nemotron-3-super',
    provider: 'openrouter',
    providerModel: process.env.OPENROUTER_NEMOTRON_SUPER_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super',
    description: 'OpenRouter-routed Nemotron profile for large UI redesigns and structured agent planning.',
    premium: true,
    enabled: isProviderEnabled('openrouter'),
    contextWindow: 1000000,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: OPENROUTER_NEMOTRON_TIMEOUT_MS,
    responseFormat: envFlagDefault('OPENROUTER_NEMOTRON_JSON_MODE', true),
  },
  {
    id: 'poolside:laguna-m1',
    provider: 'openrouter',
    providerModel: process.env.OPENROUTER_POOLSIDE_LAGUNA_MODEL || 'poolside/laguna-m.1',
    name: 'Poolside Laguna M.1',
    description: 'OpenRouter-routed mid-sized implementation model for focused UI work.',
    premium: true,
    enabled: isProviderEnabled('openrouter'),
    contextWindow: 262144,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: OPENROUTER_LAGUNA_TIMEOUT_MS,
    responseFormat: envFlagDefault('OPENROUTER_LAGUNA_JSON_MODE', true),
  },
  {
    id: 'nex:n2-pro',
    provider: 'openrouter',
    providerModel: process.env.OPENROUTER_NEX_N2_PRO_MODEL || 'nex-agi/nex-n2-pro:free',
    name: 'Nex N2-Pro',
    description: 'OpenRouter-routed mid-sized project model for efficient UI edits and limited hardware scenarios.',
    premium: true,
    enabled: isProviderEnabled('openrouter'),
    contextWindow: 262144,
    capabilities: ['chat', 'json', 'code', 'design'],
    requestTimeoutMs: OPENROUTER_NEX_TIMEOUT_MS,
    responseFormat: envFlagDefault('OPENROUTER_NEX_JSON_MODE', true),
  },
  {
    id: 'openai:gpt-5',
    provider: 'openai',
    providerModel: 'gpt-5',
    name: 'GPT-5',
    description: 'Premium model placeholder for deeper design and product reasoning.',
    premium: true,
    enabled: false,
    contextWindow: 256000,
    capabilities: ['chat', 'json', 'code', 'design', 'vision'],
  },
  {
    id: 'anthropic:claude-sonnet',
    provider: 'anthropic',
    providerModel: 'claude-sonnet',
    name: 'Claude Sonnet',
    description: 'Premium model placeholder for long-form editing and UX reasoning.',
    premium: true,
    enabled: false,
    contextWindow: 200000,
    capabilities: ['chat', 'json', 'code', 'design'],
  },
];

const DEFAULT_MODEL_PRIORITY = [
  'qwen:qwen-3-coder-480b-a35b-instruct',
  'nvidia:nemotron-3-super-120b-a12b',
  'nvidia:gpt-oss-20b',
  'poolside:laguna-m1',
  'nex:n2-pro',
];

const DEFAULT_MODEL_ID = DEFAULT_MODEL_PRIORITY.find((id) => (
  MODEL_REGISTRY.some((model) => model.id === id && model.enabled)
))
  || MODEL_REGISTRY.find((model) => model.enabled)?.id
  || GROQ_LEGACY_MODEL_ID;

const getModels = () => MODEL_REGISTRY.map((model) => ({ ...model }));

const getModel = (modelId) => MODEL_REGISTRY.find((model) => model.id === modelId) || null;

const getAgentModes = () => Object.values(AGENT_MODES).map((mode) => ({ ...mode }));

const normalizeAgentMode = (mode) => (AGENT_MODES[mode] ? mode : DEFAULT_AGENT_MODE);

const inferAgentModeFromPrompt = (prompt = '', requestedMode = DEFAULT_AGENT_MODE) => {
  if (requestedMode && requestedMode !== DEFAULT_AGENT_MODE && AGENT_MODES[requestedMode]) return requestedMode;
  const text = String(prompt || '').toLowerCase();
  const largeUi = /\b(redesign|transform|rebuild|full site|entire site|landing page|product launch|complex|multi[-\s]?file|advanced ui|make my portfolio feel like|custom frontend)\b/.test(text);
  if (largeUi) return 'largeUi';
  const midUi = /\b(section|component|layout|theme|style|cards|gallery|timeline|cta|visual system|interaction)\b/.test(text);
  if (midUi) return 'midUi';
  const code = /\b(javascript|js|css|code|particle|cursor|canvas|animation)\b/.test(text);
  if (code) return 'code';
  return 'fast';
};

const modelSupportsMode = (model, modeId) => {
  const mode = AGENT_MODES[normalizeAgentMode(modeId)];
  if (!model || !mode) return false;
  return mode.requiredCapabilities.every((capability) => model.capabilities?.includes(capability));
};

const modelSupportsCapabilities = (model, capabilities = []) => (
  Boolean(model) && capabilities.every((capability) => model.capabilities?.includes(capability))
);

const chooseModelForMode = (modeId, preferredModelId) => {
  const normalizedMode = normalizeAgentMode(modeId);
  const preferred = preferredModelId ? getModel(preferredModelId) : null;
  // An explicit user model choice is honored whenever the model is enabled —
  // capability lists only steer automatic routing, never override the user.
  if (preferred?.enabled) {
    return { model: preferred, mode: AGENT_MODES[normalizedMode], routed: false };
  }

  const mode = AGENT_MODES[normalizedMode];
  for (const modelId of mode.preferredModelIds || []) {
    const candidate = getModel(modelId);
    if (candidate?.enabled && modelSupportsMode(candidate, normalizedMode)) {
      return { model: candidate, mode, routed: Boolean(preferredModelId && preferredModelId !== candidate.id) || normalizedMode !== modeId };
    }
  }
  const fallback = getModel(mode.fallbackModelId) || getModel(DEFAULT_MODEL_ID);
  if (fallback?.enabled && modelSupportsMode(fallback, normalizedMode)) {
    return { model: fallback, mode, routed: Boolean(preferredModelId && preferredModelId !== fallback.id) };
  }

  const enabled = MODEL_REGISTRY.find((model) => model.enabled && modelSupportsMode(model, normalizedMode));
  return { model: enabled || getModel(DEFAULT_MODEL_ID), mode, routed: Boolean(preferredModelId) };
};

const chooseModelForIntegration = (profileId, preferredModelId) => {
  const profile = INTEGRATION_MODEL_PROFILES[profileId] || INTEGRATION_MODEL_PROFILES['ai-match'];
  const preferred = preferredModelId ? getModel(preferredModelId) : null;
  if (preferred?.enabled && modelSupportsCapabilities(preferred, profile.requiredCapabilities)) {
    return { model: preferred, profile, routed: false };
  }

  for (const modelId of profile.preferredModelIds || []) {
    const candidate = getModel(modelId);
    if (candidate?.enabled && modelSupportsCapabilities(candidate, profile.requiredCapabilities)) {
      return { model: candidate, profile, routed: Boolean(preferredModelId && preferredModelId !== candidate.id) };
    }
  }

  const fallback = getModel(profile.fallbackModelId) || getModel(DEFAULT_MODEL_ID);
  if (fallback?.enabled && modelSupportsCapabilities(fallback, profile.requiredCapabilities)) {
    return { model: fallback, profile, routed: Boolean(preferredModelId && preferredModelId !== fallback.id) };
  }

  const enabled = MODEL_REGISTRY.find((model) => model.enabled && modelSupportsCapabilities(model, profile.requiredCapabilities));
  return { model: enabled || getModel(DEFAULT_MODEL_ID), profile, routed: Boolean(preferredModelId) };
};

const resolveModel = (modelId) => {
  const requested = modelId ? getModel(modelId) : null;
  if (requested?.enabled) return requested;
  return getModel(DEFAULT_MODEL_ID);
};

const assertCallableModel = (modelId) => {
  const model = getModel(modelId);
  if (!model) {
    const error = new Error(`Unknown AI model "${modelId}".`);
    error.status = 400;
    throw error;
  }
  if (!model.enabled) {
    const config = providerConfig[model.provider];
    const hints = [];
    if (config?.enabledFlag && !envFlag(config.enabledFlag)) hints.push(`set ${config.enabledFlag}=true`);
    if (config && !process.env[config.apiKeyEnv]) hints.push(`add ${config.apiKeyEnv}`);
    const error = new Error(hints.length
      ? `${model.name} is disabled. To enable it, ${hints.join(' and ')} in the backend environment.`
      : `${model.name} is not available yet.`);
    error.status = 403;
    error.code = 'MODEL_DISABLED';
    throw error;
  }
  return model;
};

const looksLikeResponseFormatRejection = (status, text = '') => (
  [400, 404, 422].includes(status) && /response_format|json_object|json mode/i.test(text)
);

const callOpenAiCompatibleProvider = async ({ model, messages, temperature = 0.25, maxTokens = 5000 }) => {
  const config = providerConfig[model.provider];
  if (!config) {
    const error = new Error(`Provider "${model.provider}" is not implemented.`);
    error.status = 501;
    throw error;
  }
  const apiKey = process.env[config.apiKeyEnv];
  const baseUrl = getProviderBaseUrl(model.provider);
  if (!apiKey || !baseUrl) {
    const error = new Error(`AI provider "${model.provider}" is not configured. Add ${config.apiKeyEnv}${config.baseUrlEnv ? ` and ${config.baseUrlEnv}` : ''} to the backend environment.`);
    error.status = 500;
    throw error;
  }

  const timeoutMs = Number(model.requestTimeoutMs) || DEFAULT_PROVIDER_TIMEOUT_MS;

  const requestOnce = async (includeJsonMode) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(model.provider === 'openrouter' && process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
          ...(model.provider === 'openrouter' && process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
        },
        body: JSON.stringify({
          model: model.providerModel,
          messages,
          max_tokens: maxTokens,
          temperature,
          ...(includeJsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`AI provider "${model.provider}" timed out after ${timeoutMs}ms while using ${model.providerModel}.`);
        timeoutError.status = 504;
        timeoutError.code = 'PROVIDER_TIMEOUT';
        timeoutError.timeoutMs = timeoutMs;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const wantsJsonMode = model.responseFormat === true && model.capabilities?.includes('json');
  let response = await requestOnce(wantsJsonMode);

  if (!response.ok) {
    const errorText = await response.text();
    // Some providers reject response_format for specific models; retry once without it.
    if (wantsJsonMode && looksLikeResponseFormatRejection(response.status, errorText)) {
      response = await requestOnce(false);
      if (!response.ok) {
        const error = new Error(await response.text());
        error.status = response.status;
        throw error;
      }
    } else {
      const error = new Error(errorText);
      error.status = response.status;
      throw error;
    }
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content.trim()) {
    const error = new Error(`AI provider "${model.provider}" returned an empty response for ${model.providerModel}.`);
    error.status = 502;
    error.providerResponse = data;
    throw error;
  }
  return {
    content,
    usage: data.usage || null,
    model: model.id,
    provider: model.provider,
    providerModel: model.providerModel,
  };
};

const callAiModel = async ({ modelId, messages, temperature, maxTokens }) => {
  const model = assertCallableModel(modelId || DEFAULT_MODEL_ID);
  if (providerConfig[model.provider]) {
    return callOpenAiCompatibleProvider({ model, messages, temperature, maxTokens });
  }

  const error = new Error(`Provider "${model.provider}" is not implemented.`);
  error.status = 501;
  throw error;
};

module.exports = {
  AGENT_MODES,
  DEFAULT_AGENT_MODE,
  DEFAULT_MODEL_ID,
  INTEGRATION_MODEL_PROFILES,
  MODEL_REGISTRY,
  assertCallableModel,
  chooseModelForIntegration,
  chooseModelForMode,
  callAiModel,
  callOpenAiCompatibleProvider,
  getAgentModes,
  getModel,
  getModels,
  getProviderBaseUrl,
  inferAgentModeFromPrompt,
  isProviderEnabled,
  modelSupportsMode,
  normalizeAgentMode,
  providerConfig,
  resolveModel,
};
