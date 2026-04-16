import { desc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db } from "../db/client";
import { categoryCalibrationJobs } from "../db/schema";
import { makeId } from "../utils/id";
import { formatChinaIsoOffset } from "../utils/time";

const ERROR_REASON_MAX_LENGTH = 512;
const queueCountCacheTtlMs = 15 * 1000;
let ensureJobsTablePromise: Promise<void> | null = null;
const categoryQueueCountCache = new Map<string, { expiresAt: number; value: number }>();

function compactErrorMessage(message: string | null | undefined) {
  const normalized = String(message || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= ERROR_REASON_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, ERROR_REASON_MAX_LENGTH - 1).trimEnd()}…`;
}

function getCachedQueueCount(key: string) {
  const cached = categoryQueueCountCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    categoryQueueCountCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedQueueCount(key: string, value: number) {
  categoryQueueCountCache.set(key, { expiresAt: Date.now() + queueCountCacheTtlMs, value });
}

function buildQueueSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary) return {};
  const totalRows = Number(summary.totalRows || 0);
  const processedRows = Number(summary.processedRows || 0);
  const successRows = Number(summary.successRows || 0);
  const failedRows = Number(summary.failedRows || 0);
  const aiModel = String(summary.aiModel || "").trim();
  return { totalRows, processedRows, successRows, failedRows, aiModel };
}

function logQueuePerf(route: string, meta: { durationMs: number; rows: number; payloadBytes: number }) {
  const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const line = `[queue] route=${route} duration_ms=${meta.durationMs} rows=${meta.rows} payload_bytes=${meta.payloadBytes} heap_used_mb=${heapUsedMb}`;
  if (meta.durationMs > 2000 || meta.payloadBytes > 256 * 1024) {
    console.warn(`${line} warn=threshold_exceeded`);
    return;
  }
  console.log(line);
}

async function ensureCategoryCalibrationJobsTable() {
  if (!ensureJobsTablePromise) {
    ensureJobsTablePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS category_calibration_jobs (
          id varchar(36) NOT NULL PRIMARY KEY,
          uploader varchar(32) NOT NULL,
          note varchar(255) NOT NULL DEFAULT '',
          status varchar(32) NOT NULL DEFAULT 'queued',
          input_mode varchar(32) NOT NULL DEFAULT 'xlsx',
          input_file_name varchar(255) NOT NULL DEFAULT '',
          input_file_path varchar(512),
          total_rows int NOT NULL DEFAULT 0,
          processed_rows int NOT NULL DEFAULT 0,
          success_rows int NOT NULL DEFAULT 0,
          failed_rows int NOT NULL DEFAULT 0,
          ai_model varchar(100) NOT NULL DEFAULT '',
          summary_json json,
          error_reason varchar(512),
          result_file_name varchar(255) NOT NULL DEFAULT '',
          result_file_path varchar(512),
          row_results_json json,
          started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at timestamp NULL DEFAULT NULL,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      ensureJobsTablePromise = null;
      throw error;
    });
  }

  await ensureJobsTablePromise;
}

export async function createCategoryCalibrationJob(input: {
  uploader: string;
  note: string;
  fileName: string;
  filePath?: string | null;
  inputMode: string;
  totalRows: number;
  aiModel: string;
}) {
  await ensureCategoryCalibrationJobsTable();
  const id = makeId();
  await db.insert(categoryCalibrationJobs).values({
    id,
    uploader: input.uploader,
    note: input.note,
    status: "queued",
    inputMode: input.inputMode,
    inputFileName: input.fileName,
    inputFilePath: input.filePath ?? null,
    totalRows: input.totalRows,
    aiModel: input.aiModel,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { jobId: id };
}

export async function listQueuedCategoryCalibrationJobs() {
  await ensureCategoryCalibrationJobsTable();
  return db.select().from(categoryCalibrationJobs).where(eq(categoryCalibrationJobs.status, "queued")).orderBy(categoryCalibrationJobs.createdAt);
}

export async function markCategoryCalibrationJobRunning(jobId: string) {
  await ensureCategoryCalibrationJobsTable();
  await db
    .update(categoryCalibrationJobs)
    .set({
      status: "running",
      errorReason: null,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      resultFileName: "",
      resultFilePath: null,
      rowResultsJson: null,
      summaryJson: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(eq(categoryCalibrationJobs.id, jobId));
}

export async function updateCategoryCalibrationJobProgress(input: {
  jobId: string;
  processedRows: number;
  successRows: number;
  failedRows: number;
  summary?: Record<string, unknown>;
  aiModel?: string;
}) {
  await ensureCategoryCalibrationJobsTable();
  await db
    .update(categoryCalibrationJobs)
    .set({
      status: "running",
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      summaryJson: input.summary ?? undefined,
      aiModel: input.aiModel ?? undefined,
    })
    .where(eq(categoryCalibrationJobs.id, input.jobId));
}

export async function completeCategoryCalibrationJob(input: {
  jobId: string;
  processedRows: number;
  successRows: number;
  failedRows: number;
  resultFileName: string;
  resultFilePath: string;
  rowResults?: Array<Record<string, unknown>> | null;
  summary?: Record<string, unknown> | null;
  aiModel?: string;
}) {
  await ensureCategoryCalibrationJobsTable();
  await db
    .update(categoryCalibrationJobs)
    .set({
      status: "done",
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      resultFileName: input.resultFileName,
      resultFilePath: input.resultFilePath,
      rowResultsJson: input.rowResults ?? null,
      summaryJson: input.summary ?? null,
      aiModel: input.aiModel ?? undefined,
      errorReason: null,
      finishedAt: new Date(),
    })
    .where(eq(categoryCalibrationJobs.id, input.jobId));
}

export async function failCategoryCalibrationJob(jobId: string, message: string) {
  await ensureCategoryCalibrationJobsTable();
  await db
    .update(categoryCalibrationJobs)
    .set({
      status: "failed",
      errorReason: compactErrorMessage(message),
      finishedAt: new Date(),
    })
    .where(eq(categoryCalibrationJobs.id, jobId));
}

export async function getCategoryCalibrationJobById(jobId: string) {
  await ensureCategoryCalibrationJobsTable();
  const rows = await db.select().from(categoryCalibrationJobs).where(eq(categoryCalibrationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("Category calibration job not found.");
  return row;
}

export async function recoverInterruptedCategoryCalibrationJobs() {
  await ensureCategoryCalibrationJobsTable();
  await db
    .update(categoryCalibrationJobs)
    .set({
      status: "queued",
      errorReason: null,
      finishedAt: null,
    })
    .where(eq(categoryCalibrationJobs.status, "running"));
}

export async function listCategoryCalibrationJobs(page: number, pageSize: number) {
  await ensureCategoryCalibrationJobsTable();
  const startedAtMs = Date.now();
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(50, Number(pageSize || 10)));
  const offset = (safePage - 1) * safePageSize;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const countCacheKey = since.toISOString();
  const cachedTotal = getCachedQueueCount(countCacheKey);
  const [countRows, rows] = await Promise.all([
    cachedTotal !== null
      ? Promise.resolve([{ value: cachedTotal }])
      : db
          .select({ value: sql<number>`count(*)` })
          .from(categoryCalibrationJobs)
          .where(gte(categoryCalibrationJobs.createdAt, since)),
    db
      .select({
        id: categoryCalibrationJobs.id,
        uploader: categoryCalibrationJobs.uploader,
        note: categoryCalibrationJobs.note,
        status: categoryCalibrationJobs.status,
        inputMode: categoryCalibrationJobs.inputMode,
        inputFileName: categoryCalibrationJobs.inputFileName,
        totalRows: categoryCalibrationJobs.totalRows,
        processedRows: categoryCalibrationJobs.processedRows,
        successRows: categoryCalibrationJobs.successRows,
        failedRows: categoryCalibrationJobs.failedRows,
        aiModel: categoryCalibrationJobs.aiModel,
        summaryJson: categoryCalibrationJobs.summaryJson,
        errorReason: categoryCalibrationJobs.errorReason,
        resultFileName: categoryCalibrationJobs.resultFileName,
        resultFilePath: categoryCalibrationJobs.resultFilePath,
        createdAt: categoryCalibrationJobs.createdAt,
        startedAt: categoryCalibrationJobs.startedAt,
        finishedAt: categoryCalibrationJobs.finishedAt,
      })
      .from(categoryCalibrationJobs)
      .where(gte(categoryCalibrationJobs.createdAt, since))
      .orderBy(desc(categoryCalibrationJobs.createdAt))
      .limit(safePageSize + 1)
      .offset(offset),
  ]);
  const total = Number((countRows as Array<{ value: number }>)[0]?.value || 0);
  setCachedQueueCount(countCacheKey, total);
  const pageRows = rows.slice(0, safePageSize);
  const mappedRows = pageRows.map((row) => ({
      id: row.id,
      uploader: row.uploader,
      note: row.note,
      status: row.status,
      inputMode: row.inputMode,
      inputFileName: row.inputFileName,
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      aiModel: row.aiModel,
      errorReason: row.errorReason || "",
      resultFileName: row.resultFileName,
      resultFilePath: row.resultFilePath || "",
      canDownload: Boolean(row.resultFilePath || row.status === "done"),
      summary: buildQueueSummary((row.summaryJson as Record<string, unknown> | null) || {}),
      createdAt: formatChinaIsoOffset(row.createdAt),
      startedAt: formatChinaIsoOffset(row.startedAt),
      finishedAt: formatChinaIsoOffset(row.finishedAt),
    }));
  logQueuePerf("category-calibration.queue", {
    durationMs: Date.now() - startedAtMs,
    rows: mappedRows.length,
    payloadBytes: Buffer.byteLength(JSON.stringify(mappedRows), "utf8"),
  });
  return {
    total,
    hasMore: rows.length > safePageSize,
    rows: mappedRows,
  };
}

export async function getCategoryCalibrationJobStatus(jobId: string) {
  const row = await getCategoryCalibrationJobById(jobId);
  return {
    id: row.id,
    uploader: row.uploader,
    note: row.note,
    status: row.status,
    inputMode: row.inputMode,
    inputFileName: row.inputFileName,
    totalRows: row.totalRows,
    processedRows: row.processedRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    aiModel: row.aiModel,
    errorReason: row.errorReason || "",
    resultFileName: row.resultFileName,
    resultFilePath: row.resultFilePath || "",
    canDownload: Boolean(row.resultFilePath || row.status === "done"),
    summary: (row.summaryJson as Record<string, unknown> | null) || {},
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
  };
}

export async function getCategoryCalibrationJobResult(jobId: string) {
  const row = await getCategoryCalibrationJobById(jobId);
  let xlsxBase64 = "";
  if (row.resultFilePath) {
    const fileBuffer = await readFile(row.resultFilePath);
    xlsxBase64 = fileBuffer.toString("base64");
  }
  return {
    id: row.id,
    fileName: row.resultFileName || `category-calibration-${row.id}.xlsx`,
    xlsxBase64,
    status: row.status,
    errorReason: row.errorReason || "",
    rowResults: (row.rowResultsJson as Array<Record<string, unknown>> | null) || [],
    summary: (row.summaryJson as Record<string, unknown> | null) || {},
  };
}
