import "dotenv/config";

type ModelUnitCost = {
  inputPer1M: number;
  outputPer1M: number;
};

const MODEL_UNIT_COSTS: Record<string, ModelUnitCost> = {
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
};

export const aiModelOptions = Object.keys(MODEL_UNIT_COSTS);

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

const resolvedAiModel = process.env.AI_MODEL || "gpt-5-mini";
const inputCostOverride = parseNumericEnv(process.env.AI_INPUT_COST_PER_1M);
const outputCostOverride = parseNumericEnv(process.env.AI_OUTPUT_COST_PER_1M);
const aiCostAutoMatch = (process.env.AI_COST_AUTO_MATCH || "true").toLowerCase() !== "false";
let runtimeAiModel = resolvedAiModel;

function resolveAiUnitCost(aiModel: string) {
  const mapped = MODEL_UNIT_COSTS[aiModel];
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

export function getAiRuntimeConfig() {
  const cost = resolveAiUnitCost(runtimeAiModel);
  return {
    aiModel: runtimeAiModel,
    aiCostAutoMatch,
    aiInputCostPer1M: cost.inputPer1M,
    aiOutputCostPer1M: cost.outputPer1M,
    availableModels: aiModelOptions,
  };
}

export function setAiRuntimeModel(aiModel: string) {
  if (!aiModelOptions.includes(aiModel)) {
    throw new Error(`Unsupported AI model: ${aiModel}`);
  }
  runtimeAiModel = aiModel;
  return getAiRuntimeConfig();
}

export const env = {
  apiPort: Number(process.env.API_PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  aiApiKey: process.env.AI_API_KEY || "",
  get aiModel() {
    return runtimeAiModel;
  },
  aiTemperature: Math.min(1, Math.max(0, Number(process.env.AI_TEMPERATURE || 0))),
  aiResponseFormatMode: (process.env.AI_RESPONSE_FORMAT_MODE || "json_object").toLowerCase(),
  aiPromptVersion: process.env.AI_PROMPT_VERSION || "about_quality_scoring_v1",
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 0),
  get aiInputCostPer1M() {
    return resolveAiUnitCost(runtimeAiModel).inputPer1M;
  },
  get aiOutputCostPer1M() {
    return resolveAiUnitCost(runtimeAiModel).outputPer1M;
  },
  aboutSkillPath: process.env.ABOUT_SKILL_PATH || "skills/about-quality-scoring",
  faqSkillPath: process.env.FAQ_SKILL_PATH || "skills/faq-quality-scoring",
  snapshotEnabled: (process.env.SNAPSHOT_ENABLED || "true").toLowerCase() === "true",
  ingestRowConcurrency: Math.max(1, Number(process.env.INGEST_ROW_CONCURRENCY || 10)),
  ingestAdaptiveThrottleEnabled: (process.env.INGEST_ADAPTIVE_THROTTLE_ENABLED || "true").toLowerCase() === "true",
  ingestFailureStreakThreshold: Math.max(1, Number(process.env.INGEST_FAILURE_STREAK_THRESHOLD || 3)),
  ingestThrottleMs: Math.max(0, Number(process.env.INGEST_THROTTLE_MS || 2000)),
  ingestProgressFlushMs: Math.max(200, Number(process.env.INGEST_PROGRESS_FLUSH_MS || 1000)),
  ingestRowMaxRetries: Math.max(0, Number(process.env.INGEST_ROW_MAX_RETRIES || 2)),
  ingestRowRetryBaseMs: Math.max(100, Number(process.env.INGEST_ROW_RETRY_BASE_MS || 500)),
  ingestRowRetryMaxMs: Math.max(500, Number(process.env.INGEST_ROW_RETRY_MAX_MS || 5000)),
  ingestFinalRetryPasses: Math.max(0, Number(process.env.INGEST_FINAL_RETRY_PASSES || 1)),
  ingestFinalRetryConcurrency: Math.max(1, Number(process.env.INGEST_FINAL_RETRY_CONCURRENCY || 4)),
  ingestJobStallMs: Math.max(60_000, Number(process.env.INGEST_JOB_STALL_MS || 1_200_000)),
  faqOutputJobConcurrency: Math.max(1, Number(process.env.FAQ_OUTPUT_JOB_CONCURRENCY || 2)),
  aiHttpMaxRetries: Math.max(0, Number(process.env.AI_HTTP_MAX_RETRIES || 2)),
  aiHttpRetryBaseMs: Math.max(100, Number(process.env.AI_HTTP_RETRY_BASE_MS || 500)),
  aiHttpRetryMaxMs: Math.max(500, Number(process.env.AI_HTTP_RETRY_MAX_MS || 5000)),
  aiRequestTimeoutMs: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000)),
  aiRequestTimeoutMsManual: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS_MANUAL || 180000)),
  aiRequestTimeoutMsBatch: Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS_BATCH || 60000)),
  aiExecutorMaxRetries: Math.max(0, Number(process.env.AI_EXECUTOR_MAX_RETRIES || 2)),
};
