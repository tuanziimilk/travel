import { desc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import { ggCleaningJobs } from "../db/schema";
import { makeId } from "../utils/id";
import { formatChinaIsoOffset } from "../utils/time";

const ERROR_REASON_MAX_LENGTH = 512;
const queueCountCacheTtlMs = 15 * 1000;
let ensureGgCleaningJobsTablePromise: Promise<void> | null = null;
const ggQueueCountCache = new Map<string, { expiresAt: number; value: number }>();

async function resolveReadableResultPath(filePath: string | null | undefined) {
  const candidates = [String(filePath || "")].filter(Boolean);
  const legacyPrefix = "/app/.runtime/";
  const currentRuntimePrefix = path.resolve(process.cwd(), "apps/api/.runtime").replace(/\\/g, "/");
  if (filePath?.startsWith(legacyPrefix)) {
    candidates.push(path.join(currentRuntimePrefix, filePath.slice(legacyPrefix.length)));
  }
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next historical runtime location.
    }
  }
  return candidates[0] || "";
}

function compactErrorMessage(message: string | null | undefined) {
  const normalized = String(message || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= ERROR_REASON_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, ERROR_REASON_MAX_LENGTH - 1).trimEnd()}…`;
}

function getCachedQueueCount(key: string) {
  const cached = ggQueueCountCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    ggQueueCountCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedQueueCount(key: string, value: number) {
  ggQueueCountCache.set(key, {
    expiresAt: Date.now() + queueCountCacheTtlMs,
    value,
  });
}

function buildQueueSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary) return {};
  const inputMode = String(summary.inputMode || "").trim();
  const totalRows = Number(summary.totalRows || 0);
  const groupedRows = Number(summary.groupedRows || 0);
  const successRows = Number(summary.successRows || 0);
  const failedRows = Number(summary.failedRows || 0);
  const chunkCount = Number(summary.chunkCount || 0);
  const oversizedGroupCount = Number(summary.oversizedGroupCount || 0);
  return {
    inputMode,
    totalRows,
    groupedRows,
    successRows,
    failedRows,
    chunkCount: chunkCount > 0 ? chunkCount : 0,
    oversizedGroupCount: oversizedGroupCount > 0 ? oversizedGroupCount : 0,
  };
}

function logQueuePerf(route: string, meta: { durationMs: number; rows: number; payloadBytes: number }) {
  const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const payloadKb = Math.round(meta.payloadBytes / 1024);
  const line = `[queue] route=${route} duration_ms=${meta.durationMs} rows=${meta.rows} payload_bytes=${meta.payloadBytes} heap_used_mb=${heapUsedMb}`;
  if (meta.durationMs > 2000 || meta.payloadBytes > 256 * 1024) {
    console.warn(`${line} warn=threshold_exceeded payload_kb=${payloadKb}`);
    return;
  }
  console.log(line);
}

async function ensureGgCleaningJobsTable() {
  if (!ensureGgCleaningJobsTablePromise) {
    ensureGgCleaningJobsTablePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS gg_cleaning_jobs (
          id varchar(36) NOT NULL PRIMARY KEY,
          uploader varchar(32) NOT NULL,
          note varchar(255) NOT NULL DEFAULT '',
          status varchar(32) NOT NULL DEFAULT 'queued',
          input_mode varchar(32) NOT NULL DEFAULT 'raw',
          input_file_name varchar(255) NOT NULL DEFAULT '',
          input_file_base64 longtext,
          input_file_path varchar(512),
          total_rows int NOT NULL DEFAULT 0,
          grouped_rows int NOT NULL DEFAULT 0,
          processed_rows int NOT NULL DEFAULT 0,
          success_rows int NOT NULL DEFAULT 0,
          failed_rows int NOT NULL DEFAULT 0,
          summary_json json,
          error_reason varchar(512),
          result_file_name varchar(255) NOT NULL DEFAULT '',
          result_file_path varchar(512),
          result_file_base64 longtext,
          row_results_json json,
          started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at timestamp NULL DEFAULT NULL,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      try {
        await db.execute(sql`ALTER TABLE gg_cleaning_jobs ADD COLUMN result_file_path varchar(512) NULL`);
      } catch (error) {
        const message = String(
          (error as { cause?: { code?: string; sqlMessage?: string }; message?: string })?.cause?.sqlMessage ||
            (error as { cause?: { code?: string }; message?: string })?.message ||
            "",
        );
        const code = (error as { cause?: { code?: string } })?.cause?.code;
        if (code !== "ER_DUP_FIELDNAME" && !message.includes("Duplicate column name")) {
          throw error;
        }
      }
      try {
        await db.execute(sql`ALTER TABLE gg_cleaning_jobs ADD COLUMN input_file_path varchar(512) NULL`);
      } catch (error) {
        const message = String(
          (error as { cause?: { code?: string; sqlMessage?: string }; message?: string })?.cause?.sqlMessage ||
            (error as { cause?: { code?: string }; message?: string })?.message ||
            "",
        );
        const code = (error as { cause?: { code?: string } })?.cause?.code;
        if (code !== "ER_DUP_FIELDNAME" && !message.includes("Duplicate column name")) {
          throw error;
        }
      }
    })().catch((error) => {
      ensureGgCleaningJobsTablePromise = null;
      throw error;
    });
  }
  await ensureGgCleaningJobsTablePromise;
}

export async function createGgCleaningJob(input: {
  uploader: string;
  note: string;
  fileName: string;
  fileBase64?: string | null;
  filePath?: string | null;
  inputMode: string;
  totalRows: number;
  groupedRows: number;
}) {
  await ensureGgCleaningJobsTable();
  const id = makeId();
  await db.insert(ggCleaningJobs).values({
    id,
    uploader: input.uploader,
    note: input.note,
    status: "queued",
    inputMode: input.inputMode,
    inputFileName: input.fileName,
    inputFileBase64: input.fileBase64 ?? null,
    inputFilePath: input.filePath ?? null,
    totalRows: input.totalRows,
    groupedRows: input.groupedRows,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { jobId: id };
}

export async function listQueuedGgCleaningJobs() {
  await ensureGgCleaningJobsTable();
  return db.select().from(ggCleaningJobs).where(eq(ggCleaningJobs.status, "queued")).orderBy(ggCleaningJobs.createdAt);
}

export async function markGgCleaningJobRunning(jobId: string) {
  await ensureGgCleaningJobsTable();
  await db
    .update(ggCleaningJobs)
    .set({
      status: "running",
      errorReason: null,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      resultFileName: "",
      resultFilePath: null,
      resultFileBase64: null,
      rowResultsJson: null,
      summaryJson: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(eq(ggCleaningJobs.id, jobId));
}

export async function updateGgCleaningJobProgress(input: {
  jobId: string;
  processedRows: number;
  successRows: number;
  failedRows: number;
  summary?: Record<string, unknown>;
}) {
  await ensureGgCleaningJobsTable();
  await db
    .update(ggCleaningJobs)
    .set({
      status: "running",
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      summaryJson: input.summary ?? undefined,
    })
    .where(eq(ggCleaningJobs.id, input.jobId));
}

export async function completeGgCleaningJob(input: {
  jobId: string;
  processedRows: number;
  successRows: number;
  failedRows: number;
  resultFileName: string;
  resultFilePath: string;
  resultFileBase64?: string | null;
  rowResults?: Array<Record<string, unknown>> | null;
  summary?: Record<string, unknown> | null;
}) {
  await ensureGgCleaningJobsTable();
  await db
    .update(ggCleaningJobs)
    .set({
      status: "done",
      processedRows: input.processedRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      resultFileName: input.resultFileName,
      resultFilePath: input.resultFilePath,
      resultFileBase64: input.resultFileBase64 ?? null,
      rowResultsJson: input.rowResults ?? null,
      summaryJson: input.summary ?? null,
      errorReason: null,
      finishedAt: new Date(),
    })
    .where(eq(ggCleaningJobs.id, input.jobId));
}

export async function failGgCleaningJob(jobId: string, message: string) {
  await ensureGgCleaningJobsTable();
  await db
    .update(ggCleaningJobs)
    .set({
      status: "failed",
      errorReason: compactErrorMessage(message),
      finishedAt: new Date(),
    })
    .where(eq(ggCleaningJobs.id, jobId));
}

export async function getGgCleaningJobById(jobId: string) {
  await ensureGgCleaningJobsTable();
  const rows = await db.select().from(ggCleaningJobs).where(eq(ggCleaningJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到 GG 清洗任务。");
  return row;
}

export async function recoverInterruptedGgCleaningJobs() {
  await ensureGgCleaningJobsTable();
  await db
    .update(ggCleaningJobs)
    .set({
      status: "queued",
      errorReason: null,
      finishedAt: null,
    })
    .where(eq(ggCleaningJobs.status, "running"));
}

export async function listGgCleaningJobs(page: number, pageSize: number) {
  await ensureGgCleaningJobsTable();
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
          .select({
            value: sql<number>`count(*)`,
          })
          .from(ggCleaningJobs)
          .where(gte(ggCleaningJobs.createdAt, since)),
    db
      .select({
        id: ggCleaningJobs.id,
        uploader: ggCleaningJobs.uploader,
        note: ggCleaningJobs.note,
        status: ggCleaningJobs.status,
        inputMode: ggCleaningJobs.inputMode,
        inputFileName: ggCleaningJobs.inputFileName,
        totalRows: ggCleaningJobs.totalRows,
        groupedRows: ggCleaningJobs.groupedRows,
        processedRows: ggCleaningJobs.processedRows,
        successRows: ggCleaningJobs.successRows,
        failedRows: ggCleaningJobs.failedRows,
        summaryJson: ggCleaningJobs.summaryJson,
        errorReason: ggCleaningJobs.errorReason,
        resultFileName: ggCleaningJobs.resultFileName,
        resultFilePath: ggCleaningJobs.resultFilePath,
        startedAt: ggCleaningJobs.startedAt,
        finishedAt: ggCleaningJobs.finishedAt,
        createdAt: ggCleaningJobs.createdAt,
      })
      .from(ggCleaningJobs)
      .where(gte(ggCleaningJobs.createdAt, since))
      .orderBy(desc(ggCleaningJobs.createdAt))
      .limit(safePageSize + 1)
      .offset(offset),
  ]);
  const total = Number((countRows as Array<{ value: number }>)[0]?.value || 0);
  setCachedQueueCount(countCacheKey, total);
  const pageRows = rows.slice(0, safePageSize);
  const mappedRows = pageRows.map((row) => ({
      ...(function () {
        const summary = (row.summaryJson as Record<string, unknown> | null) || {};
        const summaryTotalRows = Number(summary.totalRows || 0);
        const summaryGroupedRows = Number(summary.groupedRows || 0);
        return {
          resolvedTotalRows: summaryTotalRows > 0 ? summaryTotalRows : row.totalRows,
          resolvedGroupedRows: summaryGroupedRows > 0 ? summaryGroupedRows : row.groupedRows,
        };
      })(),
      id: row.id,
      uploader: row.uploader,
      note: row.note,
      status: row.status,
      inputMode: row.inputMode,
      inputFileName: row.inputFileName,
      totalRows: row.totalRows,
      groupedRows: row.groupedRows,
      processedRows: row.processedRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      errorReason: row.errorReason || "",
      resultFileName: row.resultFileName,
      resultFilePath: row.resultFilePath || "",
      canDownload: Boolean(row.resultFilePath || row.status === "done"),
      summary: buildQueueSummary((row.summaryJson as Record<string, unknown> | null) || {}),
      createdAt: formatChinaIsoOffset(row.createdAt),
      startedAt: formatChinaIsoOffset(row.startedAt),
      finishedAt: formatChinaIsoOffset(row.finishedAt),
    }));
  const payloadBytes = Buffer.byteLength(JSON.stringify(mappedRows), "utf8");
  logQueuePerf("gg-cleaning.queue", {
    durationMs: Date.now() - startedAtMs,
    rows: mappedRows.length,
    payloadBytes,
  });
  return {
    total,
    hasMore: rows.length > safePageSize,
    rows: mappedRows,
  };
}

export async function getGgCleaningJobStatus(jobId: string) {
  const row = await getGgCleaningJobById(jobId);
  const summary = (row.summaryJson as Record<string, unknown> | null) || {};
  const summaryTotalRows = Number(summary.totalRows || 0);
  const summaryGroupedRows = Number(summary.groupedRows || 0);
  return {
    id: row.id,
    uploader: row.uploader,
    note: row.note,
    status: row.status,
    inputMode: row.inputMode,
    inputFileName: row.inputFileName,
    totalRows: row.totalRows,
    groupedRows: row.groupedRows,
    resolvedTotalRows: summaryTotalRows > 0 ? summaryTotalRows : row.totalRows,
    resolvedGroupedRows: summaryGroupedRows > 0 ? summaryGroupedRows : row.groupedRows,
    processedRows: row.processedRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    errorReason: row.errorReason || "",
    resultFileName: row.resultFileName,
    resultFilePath: row.resultFilePath || "",
    canDownload: Boolean(row.resultFilePath || row.resultFileBase64 || row.status === "done"),
    summary,
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
  };
}

export async function getGgCleaningJobResult(jobId: string) {
  const row = await getGgCleaningJobById(jobId);
  let xlsxBase64 = row.resultFileBase64 || "";
  if (!xlsxBase64 && row.resultFilePath) {
    const fileBuffer = await readFile(await resolveReadableResultPath(row.resultFilePath));
    xlsxBase64 = fileBuffer.toString("base64");
  }
  return {
    id: row.id,
    fileName: row.resultFileName || `gg-cleaning-${row.id}.xlsx`,
    xlsxBase64,
    status: row.status,
    errorReason: row.errorReason || "",
    rowResults: (row.rowResultsJson as Array<Record<string, unknown>> | null) || [],
    summary: (row.summaryJson as Record<string, unknown> | null) || {},
  };
}

export async function getGgCleaningJobDownloadMeta(jobId: string) {
  const row = await getGgCleaningJobById(jobId);
  return {
    id: row.id,
    status: row.status,
    errorReason: row.errorReason || "",
    fileName: row.resultFileName || `gg-cleaning-${row.id}.xlsx`,
    resultFilePath: row.resultFilePath || "",
    resultFileBase64: row.resultFileBase64 || "",
  };
}

function buildMerchantOnlyWorkbookBuffer(fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const merchantSheet = workbook.Sheets.merchant_output || workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!merchantSheet) throw new Error("GG result workbook does not contain merchant_output.");
  const trimmedWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(trimmedWorkbook, merchantSheet, "merchant_output");
  return XLSX.write(trimmedWorkbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function getGgCleaningJobDownloadPayload(jobId: string, options?: { includeDebug?: boolean }) {
  const row = await getGgCleaningJobById(jobId);
  const includeDebug = Boolean(options?.includeDebug);
  const fileNameBase = (row.resultFileName || `gg-cleaning-${row.id}.xlsx`).replace(/\.xlsx$/i, "");
  const preferredFileName = includeDebug ? `${fileNameBase}.xlsx` : `${fileNameBase}-merchant-only.xlsx`;
  let fileBuffer: Buffer | null = null;
  if (row.resultFilePath) {
    fileBuffer = await readFile(await resolveReadableResultPath(row.resultFilePath));
  } else if (row.resultFileBase64) {
    fileBuffer = Buffer.from(row.resultFileBase64, "base64");
  }
  if (!fileBuffer) {
    throw new Error(row.errorReason || "Current task has no downloadable result yet.");
  }
  return {
    fileName: preferredFileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: includeDebug ? fileBuffer : buildMerchantOnlyWorkbookBuffer(fileBuffer),
  };
}
