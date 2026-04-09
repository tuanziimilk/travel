import { categoryCalibrationDefaultAiModel, type AiModel, type Uploader } from "@about-demo/trpc";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  countProcessableCategoryCalibrationRows,
  executeCategoryCalibrationChunkRows,
  previewCategoryCalibrationChunkRows,
} from "./engine";
import {
  completeCategoryCalibrationJob,
  createCategoryCalibrationJob,
  failCategoryCalibrationJob,
  getCategoryCalibrationJobById,
  listQueuedCategoryCalibrationJobs,
  markCategoryCalibrationJobRunning,
  recoverInterruptedCategoryCalibrationJobs,
  updateCategoryCalibrationJobProgress,
} from "./jobStore";
import {
  getCompletedCategoryCalibrationUpload,
  iterateCategoryCalibrationUploadChunks,
} from "./uploadStore";

let loopStarted = false;
let activeJobId = "";
const RESULT_DIR = path.resolve(process.cwd(), ".runtime", "category-calibration-results");
const RESULT_TMP_DIR = path.resolve(process.cwd(), ".runtime", "category-calibration-results-tmp");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolvePreview(uploadId: string) {
  const uploaded = await getCompletedCategoryCalibrationUpload(uploadId);
  let validRows = 0;
  let rowOffset = 0;

  for await (const chunk of iterateCategoryCalibrationUploadChunks(uploaded.id)) {
    validRows += countProcessableCategoryCalibrationRows(chunk.rows, rowOffset);
    rowOffset += chunk.rows.length;
  }

  const preview = await previewCategoryCalibrationChunkRows({
    columns: uploaded.columns,
    sampleRawRows: uploaded.sampleRows,
    totalRows: uploaded.uploadedRowCount,
  });

  return {
    uploaded,
    preview: {
      ...preview,
      validRows,
    },
  };
}

async function processJob(jobId: string) {
  const job = await getCategoryCalibrationJobById(jobId);
  if (!job.inputFilePath) throw new Error("Category calibration job is missing an uploaded file.");
  await markCategoryCalibrationJobRunning(jobId);

  const { uploaded, preview } = await resolvePreview(job.inputFilePath);
  if (!preview.validRows) {
    throw new Error("上传文件中没有可处理的数据行，请删除说明行或空白行后重试。");
  }

  await updateCategoryCalibrationJobProgress({
    jobId,
    processedRows: 0,
    successRows: 0,
    failedRows: 0,
    aiModel: job.aiModel,
    summary: {
      inputMode: preview.inputMode,
      totalRows: preview.totalRows,
      validRows: preview.validRows,
      skippedRows: Math.max(0, preview.totalRows - preview.validRows),
      aiModel: job.aiModel,
    },
  });

  await mkdir(RESULT_TMP_DIR, { recursive: true });

  const result = await executeCategoryCalibrationChunkRows({
    rawRowChunks: (async function* () {
      for await (const chunk of iterateCategoryCalibrationUploadChunks(uploaded.id)) {
        yield chunk.rows;
      }
    })(),
    columns: uploaded.columns,
    sampleRawRows: uploaded.sampleRows,
    totalRows: preview.validRows,
    aiModel: job.aiModel || categoryCalibrationDefaultAiModel,
    csvOutputPath: path.join(RESULT_TMP_DIR, `${jobId}.csv`),
    onProgress: async (progress) => {
      await updateCategoryCalibrationJobProgress({
        jobId,
        processedRows: progress.processedRows,
        successRows: progress.successRows,
        failedRows: progress.failedRows,
        aiModel: job.aiModel,
        summary: {
          inputMode: preview.inputMode,
          totalRows: preview.validRows,
          rawRows: uploaded.uploadedRowCount,
          skippedRows: Math.max(0, preview.totalRows - preview.validRows),
          processedRows: progress.processedRows,
          successRows: progress.successRows,
          failedRows: progress.failedRows,
          promptTokens: progress.promptTokens,
          completionTokens: progress.completionTokens,
          totalTokens: progress.totalTokens,
          estimatedCostUsd: progress.estimatedCostUsd,
          aiModel: job.aiModel,
          completedSubBatches: progress.completedSubBatches,
          totalSubBatches: progress.totalSubBatches,
        },
      });
    },
  });

  await mkdir(RESULT_DIR, { recursive: true });
  const resultFileName = `${job.inputFileName.replace(/\.[^.]+$/, "") || "category-calibration"}-result.xlsx`;
  const resultFilePath = path.join(RESULT_DIR, `${jobId}.xlsx`);
  const csvPath = path.join(RESULT_TMP_DIR, `${jobId}.csv`);
  const csvText = await readFile(csvPath, "utf8");
  const workbook = XLSX.read(csvText, { type: "string", codepage: 65001, raw: true });
  const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await writeFile(resultFilePath, workbookBuffer);
  await unlink(csvPath).catch(() => {});

  await completeCategoryCalibrationJob({
    jobId,
    processedRows: result.summary.processedRows,
    successRows: result.summary.successRows,
    failedRows: result.summary.failedRows,
    resultFileName,
    resultFilePath,
    rowResults: result.rowResults.slice(0, 50),
    summary: result.summary,
    aiModel: job.aiModel,
  });
}

async function consumeLoop() {
  if (loopStarted) return;
  loopStarted = true;
  await recoverInterruptedCategoryCalibrationJobs();

  while (true) {
    try {
      if (!activeJobId) {
        const queued = await listQueuedCategoryCalibrationJobs();
        const next = queued[0];
        if (next) activeJobId = next.id;
      }

      if (!activeJobId) {
        await delay(1500);
        continue;
      }

      try {
        await processJob(activeJobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await failCategoryCalibrationJob(activeJobId, message);
      } finally {
        activeJobId = "";
      }
    } catch {
      activeJobId = "";
      await delay(2000);
    }
  }
}

void consumeLoop();

export async function previewCategoryCalibration(input: { fileName: string; uploadId?: string }) {
  if (!input.uploadId) {
    throw new Error("Category calibration preview requires an uploaded file.");
  }

  const { preview } = await resolvePreview(input.uploadId);
  return preview;
}

export async function startCategoryCalibrationJob(input: {
  uploader: Uploader;
  note?: string;
  fileName: string;
  uploadId?: string;
  aiModel?: AiModel;
}) {
  if (!input.uploadId) {
    throw new Error("Category calibration run requires an uploaded file.");
  }

  const { uploaded, preview } = await resolvePreview(input.uploadId);

  const created = await createCategoryCalibrationJob({
    uploader: input.uploader,
    note: input.note || "",
    fileName: uploaded.fileName || input.fileName,
    filePath: uploaded.id,
    inputMode: preview.inputMode,
    totalRows: preview.validRows,
    aiModel: input.aiModel || categoryCalibrationDefaultAiModel,
  });

  return {
    jobId: created.jobId,
    inputMode: preview.inputMode,
    totalRows: preview.totalRows,
    validRows: preview.validRows,
    status: "queued" as const,
  };
}
