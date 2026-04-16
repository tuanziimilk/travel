import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { pool } from "../db/client";
import { makeId } from "../utils/id";
import { getBatchModuleId, getBatchResult, toXlsxByModule } from "../jobs/ingestWorker";
import { getGgCleaningJobDownloadPayload } from "../gg-cleaning/jobStore";
import { getTranslationJobResult } from "../translation/translationJobStore";
import { getCategoryCalibrationJobResult } from "../category-calibration/jobStore";

type DownloadTaskStatus = "queued" | "preparing" | "ready" | "failed" | "expired";
type GlobalDownloadKind =
  | "quality-batch"
  | "gg-cleaning"
  | "translation-batch"
  | "category-calibration";

const APP_RUNTIME_DIR = path.resolve(process.cwd(), "apps/api/.runtime");
const GLOBAL_DOWNLOAD_TASK_DIR = path.resolve(APP_RUNTIME_DIR, "global-download-tasks");
const globalDownloadTaskRetentionMs = 24 * 60 * 60 * 1000;
const xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sanitizeFileNameSegment(value: unknown, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function formatDownloadTimestamp(date = new Date()) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    chinaDate.getUTCFullYear(),
    pad(chinaDate.getUTCMonth() + 1),
    pad(chinaDate.getUTCDate()),
    "-",
    pad(chinaDate.getUTCHours()),
    pad(chinaDate.getUTCMinutes()),
    pad(chinaDate.getUTCSeconds()),
  ].join("");
}

function summarizeCountries(rows: Array<Record<string, unknown>>) {
  const countries = Array.from(
    new Set(
      rows
        .map((row) => String(row.Country || row.country || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  if (countries.length === 0) return "NA";
  if (countries.length === 1) return countries[0];
  return `MULTI${countries.length}`;
}

async function getQualityBatchMeta(batchId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT uploader FROM upload_batches WHERE id = ? LIMIT 1",
    [batchId],
  );
  return {
    uploader: String(rows[0]?.uploader || ""),
  };
}

function buildQualityBatchFileName(input: {
  moduleId: string;
  batchId: string;
  uploader: string;
  rowCount: number;
  country: string;
}) {
  const tool = input.moduleId === "faq" ? "FAQ评分" : "About评分";
  const uploader = sanitizeFileNameSegment(input.uploader, "unknown");
  const country = sanitizeFileNameSegment(input.country, "NA");
  const rowCount = Math.max(0, Number(input.rowCount || 0));
  const timestamp = formatDownloadTimestamp();
  const shortId = sanitizeFileNameSegment(input.batchId.slice(0, 8), "batch");
  return `${tool}_${uploader}_${country}_${rowCount}行_${timestamp}_${shortId}.xlsx`;
}

function mapDownloadTaskRow(row: RowDataPacket) {
  return {
    taskId: String(row.id || ""),
    jobId: String(row.job_id || ""),
    variant: String(row.variant || ""),
    status: String(row.status || "") as DownloadTaskStatus,
    progressPercent: Number(row.progress_percent || 0),
    statusText: String(row.status_text || ""),
    fileName: String(row.file_name || ""),
    resultFilePath: String(row.result_file_path || ""),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    errorMessage: String(row.error_message || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
  };
}

async function updateDownloadTask(
  taskId: string,
  patch: {
    status: DownloadTaskStatus;
    progressPercent: number;
    statusText: string;
    fileName?: string;
    resultFilePath?: string | null;
    fileSizeBytes?: number;
    errorMessage?: string | null;
    expiresAt?: Date;
  },
) {
  await pool.execute(
    `
      UPDATE content_generation_download_tasks
      SET status = ?,
          progress_percent = ?,
          status_text = ?,
          file_name = COALESCE(?, file_name),
          result_file_path = ?,
          file_size_bytes = COALESCE(?, file_size_bytes),
          error_message = ?,
          expires_at = COALESCE(?, expires_at),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      patch.status,
      patch.progressPercent,
      patch.statusText,
      patch.fileName ?? null,
      patch.resultFilePath ?? null,
      patch.fileSizeBytes ?? null,
      patch.errorMessage ?? null,
      patch.expiresAt ?? null,
      taskId,
    ],
  );
}

async function writeTaskFile(taskId: string, fileName: string, buffer: Buffer) {
  await mkdir(GLOBAL_DOWNLOAD_TASK_DIR, { recursive: true });
  const safeFileName = path.basename(fileName || `download-${taskId}.xlsx`);
  const targetPath = path.join(GLOBAL_DOWNLOAD_TASK_DIR, `${taskId}-${safeFileName}`);
  await writeFile(targetPath, buffer);
  return targetPath;
}

async function prepareQualityBatchDownload(batchId: string) {
  const data = await getBatchResult(batchId);
  const moduleId = await getBatchModuleId(batchId);
  const rows = data.rows as unknown as Array<Record<string, unknown>>;
  const meta = await getQualityBatchMeta(batchId);
  const fileName = buildQualityBatchFileName({
    moduleId,
    batchId,
    uploader: meta.uploader,
    rowCount: rows.length,
    country: summarizeCountries(rows),
  });
  const xlsxBase64 = toXlsxByModule(
    moduleId,
    rows,
    data.summary as Record<string, unknown>,
  );
  return { fileName, buffer: Buffer.from(xlsxBase64, "base64"), contentType: xlsxContentType };
}

async function prepareTranslationBatchDownload(jobId: string) {
  const result = await getTranslationJobResult(jobId);
  if (!result.xlsxBase64) throw new Error("当前翻译任务没有可下载结果。");
  return {
    fileName: result.fileName || `translation-${jobId}.xlsx`,
    buffer: Buffer.from(result.xlsxBase64, "base64"),
    contentType: xlsxContentType,
  };
}

async function prepareCategoryCalibrationDownload(jobId: string) {
  const result = await getCategoryCalibrationJobResult(jobId);
  if (!result.xlsxBase64) throw new Error("当前评估看板任务没有可下载结果。");
  return {
    fileName: result.fileName || `category-calibration-${jobId}.xlsx`,
    buffer: Buffer.from(result.xlsxBase64, "base64"),
    contentType: xlsxContentType,
  };
}

async function prepareGlobalDownloadTask(
  taskId: string,
  input: { kind: GlobalDownloadKind; jobId: string; includeDebug?: boolean },
) {
  try {
    await updateDownloadTask(taskId, {
      status: "preparing",
      progressPercent: 20,
      statusText: "正在后台准备文件...",
      resultFilePath: null,
    });

    let prepared: { fileName: string; buffer: Buffer; contentType: string };
    if (input.kind === "quality-batch") {
      prepared = await prepareQualityBatchDownload(input.jobId);
    } else if (input.kind === "gg-cleaning") {
      prepared = await getGgCleaningJobDownloadPayload(input.jobId, { includeDebug: input.includeDebug });
    } else if (input.kind === "translation-batch") {
      prepared = await prepareTranslationBatchDownload(input.jobId);
    } else if (input.kind === "category-calibration") {
      prepared = await prepareCategoryCalibrationDownload(input.jobId);
    } else {
      throw new Error("Unsupported download task type.");
    }

    const resultFilePath = await writeTaskFile(taskId, prepared.fileName, prepared.buffer);
    await updateDownloadTask(taskId, {
      status: "ready",
      progressPercent: 100,
      statusText: "文件准备完成，浏览器即将开始下载。",
      fileName: prepared.fileName,
      resultFilePath,
      fileSizeBytes: prepared.buffer.length,
      errorMessage: null,
      expiresAt: new Date(Date.now() + globalDownloadTaskRetentionMs),
    });
  } catch (error) {
    await updateDownloadTask(taskId, {
      status: "failed",
      progressPercent: 100,
      statusText: "下载任务失败。",
      resultFilePath: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      expiresAt: new Date(Date.now() + globalDownloadTaskRetentionMs),
    });
  }
}

export async function createGlobalDownloadTask(input: {
  kind: GlobalDownloadKind;
  jobId: string;
  includeDebug?: boolean;
}) {
  const id = makeId();
  const variant = input.kind === "gg-cleaning" && input.includeDebug ? "gg-cleaning-full" : input.kind;
  await pool.execute(
    `
      INSERT INTO content_generation_download_tasks
        (id, job_id, variant, status, progress_percent, status_text, expires_at)
      VALUES (?, ?, ?, 'queued', 0, '已加入下载准备队列。', ?)
    `,
    [id, input.jobId, variant, new Date(Date.now() + globalDownloadTaskRetentionMs)],
  );
  void prepareGlobalDownloadTask(id, input);
  return getGlobalDownloadTask(id);
}

export async function getGlobalDownloadTask(taskId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, job_id, variant, status, progress_percent, status_text, file_name,
             result_file_path, file_size_bytes, error_message, created_at, updated_at, expires_at
      FROM content_generation_download_tasks
      WHERE id = ?
      LIMIT 1
    `,
    [taskId],
  );
  const row = rows[0];
  if (!row) throw new Error("Download task not found.");
  const mapped = mapDownloadTaskRow(row);
  if (mapped.status === "ready" && mapped.expiresAt && Date.parse(mapped.expiresAt) < Date.now()) {
    await updateDownloadTask(taskId, {
      status: "expired",
      progressPercent: 100,
      statusText: "下载文件已过期，请重新创建下载任务。",
      resultFilePath: mapped.resultFilePath || null,
      errorMessage: "Download file expired.",
    });
    return { ...mapped, status: "expired" as const, errorMessage: "Download file expired." };
  }
  return mapped;
}

export async function getGlobalDownloadTaskFile(taskId: string) {
  const task = await getGlobalDownloadTask(taskId);
  if (task.status !== "ready" || !task.resultFilePath) {
    throw new Error(task.errorMessage || "Download task is not ready.");
  }
  const fileStat = await stat(task.resultFilePath);
  return {
    fileName: task.fileName || `download-${taskId}.xlsx`,
    contentType: xlsxContentType,
    fileSizeBytes: fileStat.size,
    resultFilePath: task.resultFilePath,
  };
}
