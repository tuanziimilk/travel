import { desc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db } from "../db/client";
import { ggCleaningJobs } from "../db/schema";
import { makeId } from "../utils/id";
import { formatChinaIsoOffset } from "../utils/time";

const ERROR_REASON_MAX_LENGTH = 512;
let ensureGgCleaningJobsTablePromise: Promise<void> | null = null;

function compactErrorMessage(message: string | null | undefined) {
  const normalized = String(message || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= ERROR_REASON_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, ERROR_REASON_MAX_LENGTH - 1).trimEnd()}…`;
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
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(ggCleaningJobs).where(gte(ggCleaningJobs.createdAt, since)).orderBy(desc(ggCleaningJobs.createdAt));
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    total,
    rows: rows.slice(start, start + pageSize).map((row) => ({
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
      canDownload: Boolean(row.resultFilePath || row.resultFileBase64 || row.status === "done"),
      summary: (row.summaryJson as Record<string, unknown> | null) || {},
      createdAt: formatChinaIsoOffset(row.createdAt),
      startedAt: formatChinaIsoOffset(row.startedAt),
      finishedAt: formatChinaIsoOffset(row.finishedAt),
    })),
  };
}

export async function getGgCleaningJobStatus(jobId: string) {
  const row = await getGgCleaningJobById(jobId);
  return {
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
    canDownload: Boolean(row.resultFilePath || row.resultFileBase64 || row.status === "done"),
    summary: (row.summaryJson as Record<string, unknown> | null) || {},
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
  };
}

export async function getGgCleaningJobResult(jobId: string) {
  const row = await getGgCleaningJobById(jobId);
  let xlsxBase64 = row.resultFileBase64 || "";
  if (!xlsxBase64 && row.resultFilePath) {
    const fileBuffer = await readFile(row.resultFilePath);
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
