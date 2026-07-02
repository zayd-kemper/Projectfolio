const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_AGENT_MODE,
  DEFAULT_MODEL_ID,
  assertCallableModel,
  callOpenAiCompatibleProvider,
  chooseModelForIntegration,
  chooseModelForMode,
  getAgentModes,
  getModels,
  getProviderBaseUrl,
  inferAgentModeFromPrompt,
  isProviderEnabled,
  modelSupportsMode,
  normalizeAgentMode,
  providerConfig,
  resolveModel,
} = require('../utils/aiModels');

const reloadAiModelsWithEnv = (envPatch = {}) => {
  const modulePath = require.resolve('../utils/aiModels');
  const previous = {};
  for (const key of Object.keys(envPatch)) {
    previous[key] = process.env[key];
    if (envPatch[key] == null) delete process.env[key];
    else process.env[key] = envPatch[key];
  }
  delete require.cache[modulePath];
  const reloaded = require('../utils/aiModels');
  delete require.cache[modulePath];
  Object.entries(previous).forEach(([key, value]) => {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  });
  require('../utils/aiModels');
  return reloaded;
};

test('model registry keeps deprecated Groq model disabled and premium placeholders locked', () => {
  const models = getModels();
  assert(models.some((model) => model.id === 'groq:llama-3.3-70b-versatile' && !model.enabled));
  assert(models.some((model) => model.id === DEFAULT_MODEL_ID));
  assert(models.some((model) => model.id === 'qwen:qwen-3-coder-480b-a35b-instruct' && model.premium && !model.enabled));
  assert(models.some((model) => model.id === 'nvidia:gpt-oss-20b' && !model.premium && !model.enabled));
  assert(models.some((model) => model.id === 'nvidia:nemotron-3-super-120b-a12b' && model.premium && !model.enabled));
  assert(models.some((model) => model.id === 'poolside:laguna-m1' && model.premium && !model.enabled));
  assert(models.some((model) => model.id === 'nex:n2-pro' && model.premium && !model.enabled));
});

test('resolveModel falls back to default for missing or disabled selections', () => {
  assert.equal(resolveModel().id, DEFAULT_MODEL_ID);
  assert.equal(resolveModel('openai:gpt-5').id, DEFAULT_MODEL_ID);
  assert.equal(resolveModel('nvidia:gpt-oss-20b').id, DEFAULT_MODEL_ID);
  assert.equal(resolveModel('unknown:model').id, DEFAULT_MODEL_ID);
});

test('assertCallableModel rejects disabled premium models', () => {
  assert.throws(() => assertCallableModel('openai:gpt-5'), /not available yet/);
});

test('agent model routing exposes task modes and falls back to enabled Groq model', () => {
  const modes = getAgentModes();
  assert(modes.some((mode) => mode.id === DEFAULT_AGENT_MODE));
  assert(modes.some((mode) => mode.id === 'largeUi'));
  assert(modes.some((mode) => mode.id === 'midUi'));
  assert.equal(normalizeAgentMode('design'), 'design');
  assert.equal(normalizeAgentMode('not-real'), DEFAULT_AGENT_MODE);

  const routed = chooseModelForMode('largeUi', 'qwen:qwen-3-coder-480b-a35b-instruct');
  assert.equal(routed.model.id, DEFAULT_MODEL_ID);
  assert.equal(routed.mode.id, 'largeUi');
  assert.equal(routed.routed, true);
  assert.equal(modelSupportsMode(routed.model, 'largeUi'), true);
  assert.equal(chooseModelForIntegration('ai-match').model.id, DEFAULT_MODEL_ID);
  assert.equal(chooseModelForIntegration('opportunity-finder').model.id, DEFAULT_MODEL_ID);
  assert.equal(inferAgentModeFromPrompt('make my portfolio feel like a cinematic product launch page with complex UI'), 'largeUi');
  assert.equal(inferAgentModeFromPrompt('add a focused CTA section'), 'midUi');
});

test('future providers expose env-gated OpenAI-compatible configuration', () => {
  assert.equal(providerConfig.openrouter.apiKeyEnv, 'OPENROUTER_API_KEY');
  assert.equal(providerConfig.openrouter.baseUrlEnv, 'OPENROUTER_BASE_URL');
  assert.equal(providerConfig.openrouter.enabledFlag, 'ENABLE_OPENROUTER_MODELS');
  assert.equal(providerConfig.nvidia.apiKeyEnv, 'NVIDIA_API_KEY');
  assert.equal(providerConfig.nvidia.baseUrlEnv, 'NVIDIA_BASE_URL');
  assert.equal(providerConfig.nvidia.enabledFlag, 'ENABLE_NVIDIA_MODELS');
  assert.equal(isProviderEnabled('nvidia'), false);
  assert.equal(isProviderEnabled('openrouter'), false);
  assert.equal(getProviderBaseUrl('missing-provider'), null);
});

test('NVIDIA env enables GPT-OSS 20B as a coding model', () => {
  const models = reloadAiModelsWithEnv({
    ENABLE_NVIDIA_MODELS: 'true',
    NVIDIA_API_KEY: 'test-nvidia-key',
    NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  });
  const gptOss = models.getModel('nvidia:gpt-oss-20b');
  assert.equal(gptOss.enabled, true);
  assert.equal(gptOss.provider, 'nvidia');
  assert.equal(gptOss.providerModel, 'openai/gpt-oss-20b');
  assert.equal(gptOss.capabilities.includes('code'), true);

  const code = models.chooseModelForMode('code', 'nvidia:gpt-oss-20b');
  assert.equal(code.model.id, 'nvidia:gpt-oss-20b');
  assert.equal(code.routed, false);
});

test('OpenRouter env enables premium model routing through one provider key', () => {
  const models = reloadAiModelsWithEnv({
    ENABLE_OPENROUTER_MODELS: 'true',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  });
  const qwen = models.getModel('qwen:qwen-3-coder-480b-a35b-instruct');
  const poolside = models.getModel('poolside:laguna-m1');
  assert.equal(qwen.enabled, true);
  assert.equal(qwen.provider, 'openrouter');
  assert.equal(qwen.providerModel, 'qwen/qwen3-coder');
  assert.equal(poolside.providerModel, 'poolside/laguna-m.1');

  assert.equal(models.DEFAULT_MODEL_ID, 'qwen:qwen-3-coder-480b-a35b-instruct');

  const large = models.chooseModelForMode('largeUi');
  const mid = models.chooseModelForMode('midUi');
  const match = models.chooseModelForIntegration('ai-match');
  const finder = models.chooseModelForIntegration('opportunity-finder');
  assert.equal(large.model.id, 'qwen:qwen-3-coder-480b-a35b-instruct');
  assert.equal(mid.model.id, 'qwen:qwen-3-coder-480b-a35b-instruct');
  assert.equal(match.model.id, 'nvidia:nemotron-3-super-120b-a12b');
  assert.equal(finder.model.id, 'nvidia:nemotron-3-super-120b-a12b');
});

test('provider slug overrides and JSON-mode flags are configurable per model', () => {
  const models = reloadAiModelsWithEnv({
    ENABLE_NVIDIA_MODELS: 'true',
    NVIDIA_API_KEY: 'test-nvidia-key',
    NVIDIA_GPT_OSS_20B_MODEL: 'openai/gpt-oss-20b-custom',
    NVIDIA_GPT_OSS_JSON_MODE: 'true',
    NVIDIA_GPT_OSS_TIMEOUT_MS: '90000',
    ENABLE_OPENROUTER_MODELS: 'true',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_QWEN_CODER_MODEL: 'qwen/qwen3-coder-480b-a35b-07-25',
    OPENROUTER_NEMOTRON_SUPER_MODEL: 'nvidia/nemotron-3-super-120b-a12b',
    OPENROUTER_POOLSIDE_LAGUNA_MODEL: 'poolside/laguna-m.1:free',
    OPENROUTER_QWEN_JSON_MODE: 'true',
    OPENROUTER_NEMOTRON_JSON_MODE: 'false',
    OPENROUTER_NEX_TIMEOUT_MS: '230000',
  });
  const qwen = models.getModel('qwen:qwen-3-coder-480b-a35b-instruct');
  const gptOss = models.getModel('nvidia:gpt-oss-20b');
  const nemotron = models.getModel('nvidia:nemotron-3-super-120b-a12b');
  const poolside = models.getModel('poolside:laguna-m1');
  const nex = models.getModel('nex:n2-pro');

  assert.equal(qwen.providerModel, 'qwen/qwen3-coder-480b-a35b-07-25');
  assert.equal(qwen.responseFormat, true);
  assert.equal(gptOss.providerModel, 'openai/gpt-oss-20b-custom');
  assert.equal(gptOss.responseFormat, true);
  assert.equal(gptOss.requestTimeoutMs, 90000);
  assert.equal(nemotron.providerModel, 'nvidia/nemotron-3-super-120b-a12b');
  assert.equal(nemotron.responseFormat, false);
  assert.equal(poolside.providerModel, 'poolside/laguna-m.1:free');
  assert.equal(nex.requestTimeoutMs, 230000);
});

test('provider calls abort with a structured timeout error', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  global.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      reject(error);
    });
  });

  try {
    await assert.rejects(
      () => callOpenAiCompatibleProvider({
        model: {
          id: 'test:slow',
          provider: 'openrouter',
          providerModel: 'test/slow-model',
          capabilities: ['chat'],
          requestTimeoutMs: 1,
          responseFormat: false,
        },
        messages: [{ role: 'user', content: 'hello' }],
      }),
      (error) => {
        assert.equal(error.status, 504);
        assert.equal(error.code, 'PROVIDER_TIMEOUT');
        assert.equal(error.timeoutMs, 1);
        assert.match(error.message, /test\/slow-model/);
        return true;
      }
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test('OpenRouter request body omits JSON response_format unless model opts in', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  let requestBody = null;
  global.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reply":"ok","actions":[]}' } }],
        usage: { total_tokens: 12 },
      }),
    };
  };

  try {
    await callOpenAiCompatibleProvider({
      model: {
        id: 'test:openrouter-no-json-mode',
        provider: 'openrouter',
        providerModel: 'test/model',
        capabilities: ['chat', 'json'],
        requestTimeoutMs: 100,
        responseFormat: false,
      },
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(requestBody.response_format, undefined);
  } finally {
    global.fetch = previousFetch;
    if (previousKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
