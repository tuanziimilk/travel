import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { translationJobs } from "../db/schema";
import { makeId } from "../utils/id";
import { formatChinaIsoOffset } from "../utils/time";

type LanguageSummary = {
  topLanguages: Array<{ language: string; count: number }>;
  mixedRows: number;
  processedCells: number;
};

type RowResult = {
  rowIndex: number;
  status: "success" | "partial" | "error";
  detectedLanguages: string[];
  mixedColumns: string[];
  error?: string;
};

async function ensureTranslationJobsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS translation_jobs (
      id varchar(36) NOT NULL PRIMARY KEY,
      uploader varchar(32) NOT NULL,
      note varchar(255) NOT NULL DEFAULT '',
      provider varchar(32) NOT NULL DEFAULT 'openai',
      execution_mode varchar(32) NOT NULL DEFAULT 'batch',
      target_language varchar(32) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'queued',
      input_file_name varchar(255) NOT NULL DEFAULT '',
      input_file_base64 longtext,
      provider_batch_id varchar(128),
      input_file_id varchar(128),
      output_file_id varchar(128),
      error_file_id varchar(128),
      selected_columns_json json,
      total_rows int NOT NULL DEFAULT 0,
      processed_rows int NOT NULL DEFAULT 0,
      success_rows int NOT NULL DEFAULT 0,
      failed_rows int NOT NULL DEFAULT 0,
      mixed_rows int NOT NULL DEFAULT 0,
      predicted_total_tokens int NOT NULL DEFAULT 0,
      predicted_cost_usd decimal(12,6) NOT NULL DEFAULT '0',
      prompt_tokens_sum int NOT NULL DEFAULT 0,
      completion_tokens_sum int NOT NULL DEFAULT 0,
      total_tokens_sum int NOT NULL DEFAULT 0,
      estimated_cost_usd_sum decimal(12,6) NOT NULL DEFAULT '0',
      language_summary_json json,
      error_reason varchar(512),
      result_file_name varchar(255) NOT NULL DEFAULT '',
      result_file_base64 longtext,
      row_results_json json,
      ai_model varchar(100) NOT NULL DEFAULT '',
      started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at timestamp NULL DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function createTranslationJob(input: {
  uploader: string;
  note: string;
  provider: string;
  executionMode: string;
  targetLanguage: string;
  inputFileName: string;
  inputFileBase64: string;
  selectedColumns: string[];
  predictedTotalTokens: number;
  predictedCostUsd: number;
}) {
  await ensureTranslationJobsTable();
  const id = makeId();
  await db.insert(translationJobs).values({
    id,
    uploader: input.uploader,
    note: input.note,
    provider: input.provider,
    executionMode: input.executionMode,
    targetLanguage: input.targetLanguage,
    inputFileName: input.inputFileName,
    inputFileBase64: input.inputFileBase64,
    selectedColumnsJson: input.selectedColumns,
    predictedTotalTokens: input.predictedTotalTokens,
    predictedCostUsd: String(input.predictedCostUsd),
    status: "queued",
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { jobId: id };
}

export async function markTranslationJobQueued(jobId: string) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: "queued",
      errorReason: null,
      totalRows: 0,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      mixedRows: 0,
      providerBatchId: null,
      inputFileId: null,
      outputFileId: null,
      errorFileId: null,
      promptTokensSum: 0,
      completionTokensSum: 0,
      totalTokensSum: 0,
      estimatedCostUsdSum: "0",
      languageSummaryJson: null,
      resultFileName: "",
      resultFileBase64: null,
      rowResultsJson: null,
      aiModel: "",
      finishedAt: null,
    })
    .where(eq(translationJobs.id, jobId));
}

export async function markTranslationJobRunning(jobId: string) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: "running",
      errorReason: null,
      totalRows: 0,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      mixedRows: 0,
      promptTokensSum: 0,
      completionTokensSum: 0,
      totalTokensSum: 0,
      estimatedCostUsdSum: "0",
      languageSummaryJson: null,
      resultFileName: "",
      resultFileBase64: null,
      rowResultsJson: null,
      aiModel: "",
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(eq(translationJobs.id, jobId));
}

export async function updateTranslationJobPhase(input: {
  jobId: string;
  status: string;
  providerBatchId?: string | null;
  inputFileId?: string | null;
  outputFileId?: string | null;
  errorFileId?: string | null;
  aiModel?: string;
  errorReason?: string | null;
}) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: input.status,
      providerBatchId: input.providerBatchId ?? undefined,
      inputFileId: input.inputFileId ?? undefined,
      outputFileId: input.outputFileId ?? undefined,
      errorFileId: input.errorFileId ?? undefined,
      aiModel: input.aiModel ?? undefined,
      errorReason: input.errorReason ?? null,
    })
    .where(eq(translationJobs.id, input.jobId));
}

export async function listQueuedTranslationJobs() {
  await ensureTranslationJobsTable();
  return db
    .select()
    .from(translationJobs)
    .where(eq(translationJobs.status, "queued"))
    .orderBy(translationJobs.createdAt);
}

export async function listPollingTranslationJobs() {
  await ensureTranslationJobsTable();
  return db
    .select()
    .from(translationJobs)
    .where(inArray(translationJobs.status, ["submitted", "running"]))
    .orderBy(translationJobs.updatedAt);
}

export async function recoverInterruptedTranslationJobs() {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: "queued",
      errorReason: null,
      finishedAt: null,
    })
    .where(and(inArray(translationJobs.status, ["running", "preparing"]), isNull(translationJobs.finishedAt)));
}

export async function updateTranslationJobProgress(input: {
  jobId: string;
  status?: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  mixedRows: number;
  predictedTotalTokens?: number;
  predictedCostUsd?: number;
  promptTokensSum: number;
  completionTokensSum: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  languageSummary: LanguageSummary;
  aiModel?: string;
}) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: input.status ?? "running",
      totalRows: input.totalRows,
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      mixedRows: input.mixedRows,
      predictedTotalTokens: input.predictedTotalTokens ?? undefined,
      predictedCostUsd: input.predictedCostUsd !== undefined ? String(input.predictedCostUsd) : undefined,
      promptTokensSum: input.promptTokensSum,
      completionTokensSum: input.completionTokensSum,
      totalTokensSum: input.totalTokensSum,
      estimatedCostUsdSum: String(input.estimatedCostUsdSum),
      languageSummaryJson: input.languageSummary,
      aiModel: input.aiModel || "",
    })
    .where(eq(translationJobs.id, input.jobId));
}

export async function completeTranslationJob(input: {
  jobId: string;
  status: "done" | "partial_failed" | "failed";
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  mixedRows: number;
  providerBatchId?: string;
  inputFileId?: string;
  outputFileId?: string;
  errorFileId?: string;
  promptTokensSum: number;
  completionTokensSum: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  languageSummary: LanguageSummary;
  aiModel: string;
  resultFileName: string;
  resultFileBase64: string;
  rowResults: RowResult[];
  errorReason?: string;
}) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: input.status,
      totalRows: input.totalRows,
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      mixedRows: input.mixedRows,
      providerBatchId: input.providerBatchId ?? undefined,
      inputFileId: input.inputFileId ?? undefined,
      outputFileId: input.outputFileId ?? undefined,
      errorFileId: input.errorFileId ?? undefined,
      promptTokensSum: input.promptTokensSum,
      completionTokensSum: input.completionTokensSum,
      totalTokensSum: input.totalTokensSum,
      estimatedCostUsdSum: String(input.estimatedCostUsdSum),
      languageSummaryJson: input.languageSummary,
      aiModel: input.aiModel,
      resultFileName: input.resultFileName,
      resultFileBase64: input.resultFileBase64,
      rowResultsJson: input.rowResults,
      errorReason: input.errorReason || null,
      finishedAt: new Date(),
    })
    .where(eq(translationJobs.id, input.jobId));
}

export async function failTranslationJob(jobId: string, message: string) {
  await ensureTranslationJobsTable();
  await db
    .update(translationJobs)
    .set({
      status: "failed",
      errorReason: message,
      rowResultsJson: [{ rowIndex: 0, status: "error", detectedLanguages: [], mixedColumns: [], error: message }],
      finishedAt: new Date(),
    })
    .where(eq(translationJobs.id, jobId));
}

export async function getTranslationJobForRetry(jobId: string) {
  await ensureTranslationJobsTable();
  const rows = await db.select().from(translationJobs).where(eq(translationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到翻译任务。");
  return row;
}

export async function listTranslationJobs(page: number, pageSize: number) {
  await ensureTranslationJobsTable();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(translationJobs)
    .where(gte(translationJobs.createdAt, since))
    .orderBy(desc(translationJobs.createdAt));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const sliced = rows.slice(start, start + pageSize);
  return {
    total,
    rows: sliced.map((row) => ({
      id: row.id,
      uploader: row.uploader,
      note: row.note,
      provider: row.provider,
      executionMode: row.executionMode,
      targetLanguage: row.targetLanguage,
      status: row.status,
      inputFileName: row.inputFileName,
      providerBatchId: row.providerBatchId || "",
      selectedColumns: (row.selectedColumnsJson as string[] | null) || [],
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      mixedRows: row.mixedRows,
      predictedTotalTokens: row.predictedTotalTokens,
      predictedCostUsd: Number(row.predictedCostUsd || 0),
      totalTokensSum: row.totalTokensSum,
      estimatedCostUsdSum: Number(row.estimatedCostUsdSum || 0),
      languageSummary: (row.languageSummaryJson as LanguageSummary | null) || {
        topLanguages: [],
        mixedRows: 0,
        processedCells: 0,
      },
      aiModel: row.aiModel,
      errorReason: row.errorReason || "",
      resultFileName: row.resultFileName,
      createdAt: formatChinaIsoOffset(row.createdAt),
      startedAt: formatChinaIsoOffset(row.startedAt),
      finishedAt: formatChinaIsoOffset(row.finishedAt),
    })),
  };
}

export async function getTranslationJobStatus(jobId: string) {
  await ensureTranslationJobsTable();
  const rows = await db.select().from(translationJobs).where(eq(translationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到翻译任务。");
  return {
    id: row.id,
    uploader: row.uploader,
    note: row.note,
    provider: row.provider,
    executionMode: row.executionMode,
    targetLanguage: row.targetLanguage,
    status: row.status,
    inputFileName: row.inputFileName,
    providerBatchId: row.providerBatchId || "",
    inputFileId: row.inputFileId || "",
    outputFileId: row.outputFileId || "",
    errorFileId: row.errorFileId || "",
    selectedColumns: (row.selectedColumnsJson as string[] | null) || [],
    totalRows: row.totalRows,
    processedRows: row.processedRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    mixedRows: row.mixedRows,
    predictedTotalTokens: row.predictedTotalTokens,
    predictedCostUsd: Number(row.predictedCostUsd || 0),
    promptTokensSum: row.promptTokensSum,
    completionTokensSum: row.completionTokensSum,
    totalTokensSum: row.totalTokensSum,
    estimatedCostUsdSum: Number(row.estimatedCostUsdSum || 0),
    languageSummary: (row.languageSummaryJson as LanguageSummary | null) || {
      topLanguages: [],
      mixedRows: 0,
      processedCells: 0,
    },
    aiModel: row.aiModel,
    errorReason: row.errorReason || "",
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
  };
}

export async function getTranslationJobResult(jobId: string) {
  await ensureTranslationJobsTable();
  const rows = await db.select().from(translationJobs).where(eq(translationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到翻译任务。");
  return {
    id: row.id,
    fileName: row.resultFileName || `translation-${row.id}.xlsx`,
    xlsxBase64: row.resultFileBase64 || "",
    status: row.status,
    selectedColumns: (row.selectedColumnsJson as string[] | null) || [],
    languageSummary: (row.languageSummaryJson as LanguageSummary | null) || {
      topLanguages: [],
      mixedRows: 0,
      processedCells: 0,
    },
    rowResults: (row.rowResultsJson as RowResult[] | null) || [],
    summary: {
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      mixedRows: row.mixedRows,
      totalTokens: row.totalTokensSum,
      estimatedCostUsd: Number(row.estimatedCostUsdSum || 0),
      aiModel: row.aiModel,
    },
  };
}
