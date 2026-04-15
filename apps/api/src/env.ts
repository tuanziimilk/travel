import "dotenv/config";

export type AiProvider = "openai" | "gemini";

export type ToolScopedAiConfigKey =
  | "quality-about"
  | "quality-faq"
  | "output-faq"
  | "translation-batch"
  | "translation-text"
  | "category-calibration";

type ModelUnitCost = {
  inputPer1M: number;
  outputPer1M: number;
};

type ProviderModelRegistry = Record<AiProvider, Record<string, ModelUnitCost>>;

const PROVIDER_MODEL_UNIT_COSTS: ProviderModelRegistry = {
  openai: {
    "gpt-5.2": { inputPer1M: 1.75, outputPer1M: 14.0 },
    "gpt-5.1": { inputPer1M: 1.25, outputPer1M: 10.0 },
    "gpt-5": { inputPer1M: 1.25, outputPer1M: 10.0 },
    "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2.0 },
    "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4 },
    "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
    "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
    "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
    "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
    "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  },
  gemini: {
    "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.0 },
    "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
    "gemini-2.5-flash-lite": { inputPer1M: 0.1, outputPer1M: 0.4 },
    "gemini-3.1-pro-preview": { inputPer1M: 2.0, outputPer1M: 12.0 },
    "gemini-3-flash-preview": { inputPer1M: 0.5, outputPer1M: 3.0 },
    "gemini-3.1-flash-lite-preview": { inputPer1M: 0.25, outputPer1M: 1.5 },
  },
};

export const aiModelOptions = [
  ...Object.keys(PROVIDER_MODEL_UNIT_COSTS.openai),
  ...Object.keys(PROVIDER_MODEL_UNIT_COSTS.gemini),
];

export const aiProviderOptions: AiProvider[] = ["openai", "gemini"];

const parseNumericEnv = (value: string | undefined): number | null => {
  if (!value || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

function inferProviderByModel(aiModel: string): AiProvider {
  if (aiModel in PROVIDER_MODEL_UNIT_COSTS.gemini) return "gemini";
  return "openai";
}

function normalizeBaseUrl(value: string) {
  return String(value || "").replace(/\/+$/, "");
}

const resolvedAiModel = process.env.AI_MODEL || "gemini-2.5-flash-lite";
const translationResolvedAiModel = process.env.TRANSLATION_AI_MODEL || "gemini-2.5-flash-lite";
const categoryCalibrationResolvedAiModel = process.env.CATEGORY_CALIBRATION_AI_MODEL || "gemini-2.5-flash-lite";

const inputCostOverride = parseNumericEnv(process.env.AI_INPUT_COST_PER_1M);
const outputCostOverride = parseNumericEnv(process.env.AI_OUTPUT_COST_PER_1M);
const aiCostAutoMatch = (process.env.AI_COST_AUTO_MATCH || "true").toLowerCase() !== "false";

const OPENAI_BASE_URL = normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || "https://api.openai.com/v1");
const GEMINI_BASE_URL = normalizeBaseUrl(process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const TOOL_DEFAULT_MODEL: Record<ToolScopedAiConfigKey, string> = {
  "quality-about": resolvedAiModel,
  "quality-faq": resolvedAiModel,
  "output-faq": resolvedAiModel,
  "translation-batch": translationResolvedAiModel,
  "translation-text": translationResolvedAiModel,
  "category-calibration": categoryCalibrationResolvedAiModel,
};

const runtimeToolConfigs: Record<ToolScopedAiConfigKey, { provider: AiProvider; aiModel: string }> = {
  "quality-about": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["quality-about"]),
    aiModel: TOOL_DEFAULT_MODEL["quality-about"],
  },
  "quality-faq": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["quality-faq"]),
    aiModel: TOOL_DEFAULT_MODEL["quality-faq"],
  },
  "output-faq": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["output-faq"]),
    aiModel: TOOL_DEFAULT_MODEL["output-faq"],
  },
  "translation-batch": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["translation-batch"]),
    aiModel: TOOL_DEFAULT_MODEL["translation-batch"],
  },
  "translation-text": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["translation-text"]),
    aiModel: TOOL_DEFAULT_MODEL["translation-text"],
  },
  "category-calibration": {
    provider: inferProviderByModel(TOOL_DEFAULT_MODEL["category-calibration"]),
    aiModel: TOOL_DEFAULT_MODEL["category-calibration"],
  },
};

function ensureProviderModel(provider: AiProvider, aiModel: string) {
  if (!(aiModel in PROVIDER_MODEL_UNIT_COSTS[provider])) {
    throw new Error(`Unsupported AI model for ${provider}: ${aiModel}`);
  }
}

function resolveAiUnitCost(provider: AiProvider, aiModel: string): ModelUnitCost {
  const mapped = PROVIDER_MODEL_UNIT_COSTS[provider][aiModel];
  if (aiCostAutoMatch) {
    return {
      inputPer1M: mapped?.inputPer1M ?? inputCostOverride ?? 0,
      outputPer1M: mapped?.outputPer1M ?? outputCostOverride ?? 0,
    };
  }
  return {
    inputPer1M: inputCostOverride ?? mapped?.inputPer1M ?? 0,
    outputPer1M: outputCostOverride ?? mapped?.outputPer1M ?? 0,
  };
}

export function getAiUnitCostForModel(aiModel: string) {
  const provider = inferProviderByModel(aiModel);
  return resolveAiUnitCost(provider, aiModel);
}

export function getAiUnitCostForTool(toolKey: ToolScopedAiConfigKey) {
  const runtime = runtimeToolConfigs[toolKey];
  return resolveAiUnitCost(runtime.provider, runtime.aiModel);
}

export function getAiRuntimeRequestConfig(toolKey: ToolScopedAiConfigKey) {
  const runtime = runtimeToolConfigs[toolKey];
  const baseUrl = runtime.provider === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
  const apiKey = runtime.provider === "gemini" ? GEMINI_API_KEY : OPENAI_API_KEY;
  return {
    provider: runtime.provider,
    aiModel: runtime.aiModel,
    baseUrl,
    apiKey,
  };
}

function buildRuntimeConfig(toolKey: ToolScopedAiConfigKey) {
  const runtime = runtimeToolConfigs[toolKey];
  const cost = resolveAiUnitCost(runtime.provider, runtime.aiModel);
  return {
    toolKey,
    provider: runtime.provider,
    aiModel: runtime.aiModel,
    aiCostAutoMatch,
    aiInputCostPer1M: cost.inputPer1M,
    aiOutputCostPer1M: cost.outputPer1M,
    availableProviders: aiProviderOptions,
    availableModelsByProvider: {
      openai: Object.keys(PROVIDER_MODEL_UNIT_COSTS.openai),
      gemini: Object.keys(PROVIDER_MODEL_UNIT_COSTS.gemini),
    },
  };
}

export function getAiRuntimeConfig(toolKey: ToolScopedAiConfigKey) {
  return buildRuntimeConfig(toolKey);
}

export function setAiRuntimeConfig(input: {
  toolKey: ToolScopedAiConfigKey;
  provider?: AiProvider;
  aiModel?: string;
}) {
  const current = runtimeToolConfigs[input.toolKey];
  const nextProvider = input.provider ?? current.provider;
  const nextModel = input.aiModel ?? current.aiModel;

  ensureProviderModel(nextProvider, nextModel);

  runtimeToolConfigs[input.toolKey] = {
    provider: nextProvider,
    aiModel: nextModel,
  };

  return buildRuntimeConfig(input.toolKey);
}

export const env = {
  apiPort: Number(process.env.API_PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",

  // Legacy getters retained for compatibility with existing code paths.
  get aiBaseUrl() {
    return getAiRuntimeRequestConfig("quality-about").baseUrl;
  },
  get aiApiKey() {
    return getAiRuntimeRequestConfig("quality-about").apiKey;
  },
  get aiModel() {
    return runtimeToolConfigs["quality-about"].aiModel;
  },
  get aiInputCostPer1M() {
    return getAiUnitCostForTool("quality-about").inputPer1M;
  },
  get aiOutputCostPer1M() {
    return getAiUnitCostForTool("quality-about").outputPer1M;
  },

  get translationAiModel() {
    return runtimeToolConfigs["translation-batch"].aiModel;
  },
  get translationAiInputCostPer1M() {
    return getAiUnitCostForTool("translation-batch").inputPer1M;
  },
  get translationAiOutputCostPer1M() {
    return getAiUnitCostForTool("translation-batch").outputPer1M;
  },
  get translationBatchInputCostPer1M() {
    return getAiUnitCostForTool("translation-batch").inputPer1M * 0.5;
  },
  get translationBatchOutputCostPer1M() {
    return getAiUnitCostForTool("translation-batch").outputPer1M * 0.5;
  },

  translationBatchCompletionWindow: process.env.TRANSLATION_BATCH_COMPLETION_WINDOW || "24h",
  translationBatchPollMs: Math.max(2_000, Number(process.env.TRANSLATION_BATCH_POLL_MS || 15_000)),
  aiTemperature: Math.min(1, Math.max(0, Number(process.env.AI_TEMPERATURE || 0))),
  aiResponseFormatMode: (process.env.AI_RESPONSE_FORMAT_MODE || "json_object").toLowerCase(),
  aiPromptVersion: process.env.AI_PROMPT_VERSION || "about_quality_scoring_v1",
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 0),
  aboutSkillPath: process.env.ABOUT_SKILL_PATH || "skills/about-quality-scoring",
  faqSkillPath: process.env.FAQ_SKILL_PATH || "skills/faq-quality-scoring",
  snapshotEnabled: (process.env.SNAPSHOT_ENABLED || "true").toLowerCase() === "true",
  ingestRowConcurrency: Math.max(1, Number(process.env.INGEST_ROW_CONCURRENCY || 8)),
  ingestAdaptiveThrottleEnabled: (process.env.INGEST_ADAPTIVE_THROTTLE_ENABLED || "true").toLowerCase() === "true",
  ingestFailureStreakThreshold: Math.max(1, Number(process.env.INGEST_FAILURE_STREAK_THRESHOLD || 2)),
  ingestThrottleMs: Math.max(0, Number(process.env.INGEST_THROTTLE_MS || 4000)),
  ingestProgressFlushMs: Math.max(200, Number(process.env.INGEST_PROGRESS_FLUSH_MS || 2000)),
  ingestRowMaxRetries: Math.max(0, Number(process.env.INGEST_ROW_MAX_RETRIES || 2)),
  ingestRowRetryBaseMs: Math.max(100, Number(process.env.INGEST_ROW_RETRY_BASE_MS || 500)),
  ingestRowRetryMaxMs: Math.max(500, Number(process.env.INGEST_ROW_RETRY_MAX_MS || 5000)),
  ingestFinalRetryPasses: Math.max(0, Number(process.env.INGEST_FINAL_RETRY_PASSES || 1)),
  ingestFinalRetryConcurrency: Math.max(1, Number(process.env.INGEST_FINAL_RETRY_CONCURRENCY || 2)),
  ingestJobStallMs: Math.max(60_000, Number(process.env.INGEST_JOB_STALL_MS || 1_200_000)),
  faqOutputJobConcurrency: Math.max(1, Number(process.env.FAQ_OUTPUT_JOB_CONCURRENCY || 4)),
  faqOutputRowConcurrencyCap: Math.max(1, Number(process.env.FAQ_OUTPUT_ROW_CONCURRENCY_CAP || 6)),
  faqOutputInputRetentionHoursDone: Math.max(1, Number(process.env.FAQ_OUTPUT_INPUT_RETENTION_HOURS_DONE || 24)),
  faqOutputInputRetentionHoursFailed: Math.max(1, Number(process.env.FAQ_OUTPUT_INPUT_RETENTION_HOURS_FAILED || 24)),
  translationJobConcurrency: Math.max(1, Number(process.env.TRANSLATION_JOB_CONCURRENCY || 1)),
  translationRealtimeChunkConcurrency: Math.max(1, Number(process.env.TRANSLATION_REALTIME_CHUNK_CONCURRENCY || 3)),
  translationMemoryLogEnabled: (process.env.TRANSLATION_MEMORY_LOG_ENABLED || "true").toLowerCase() === "true",
  translationMemoryLogIntervalMs: Math.max(10_000, Number(process.env.TRANSLATION_MEMORY_LOG_INTERVAL_MS || 30_000)),
  translationRealtimeTimeoutMs: Math.max(30_000, Number(process.env.TRANSLATION_REALTIME_TIMEOUT_MS || 1_800_000)),
  translationRealtimeMaxRetries: Math.max(0, Number(process.env.TRANSLATION_REALTIME_MAX_RETRIES || 1)),
  aiHttpMaxRetries: Math.max(0, Number(process.env.AI_HTTP_MAX_RETRIES || 2)),
  aiHttpRetryBaseMs: Math.max(100, Number(process.env.AI_HTTP_RETRY_BASE_MS || 500)),
  aiHttpRetryMaxMs: Math.max(500, Number(process.env.AI_HTTP_RETRY_MAX_MS || 5000)),
  aiRequestTimeoutMs: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000)),
  aiRequestTimeoutMsManual: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS_MANUAL || 180000)),
  aiRequestTimeoutMsBatch: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS_BATCH || 60000)),
  aiExecutorMaxRetries: Math.max(0, Number(process.env.AI_EXECUTOR_MAX_RETRIES || 2)),
};
