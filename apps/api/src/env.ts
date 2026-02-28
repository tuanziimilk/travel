import "dotenv/config";

export const env = {
  apiPort: Number(process.env.API_PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  aiApiKey: process.env.AI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "gpt-4.1-mini",
  aiPromptVersion: process.env.AI_PROMPT_VERSION || "about_quality_scoring_v1",
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 0),
  aiInputCostPer1M: Number(process.env.AI_INPUT_COST_PER_1M || 0),
  aiOutputCostPer1M: Number(process.env.AI_OUTPUT_COST_PER_1M || 0),
  aboutSkillPath:
    process.env.ABOUT_SKILL_PATH || "C:\\Users\\81473\\.trae\\skills\\about-quality-scoring",
  snapshotEnabled: (process.env.SNAPSHOT_ENABLED || "true").toLowerCase() === "true",
  ingestRowConcurrency: Math.max(1, Number(process.env.INGEST_ROW_CONCURRENCY || 10)),
  ingestProgressFlushMs: Math.max(200, Number(process.env.INGEST_PROGRESS_FLUSH_MS || 1000)),
};
