import type { Uploader } from "@about-demo/trpc";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { executeCategoryCalibrationChunkRows, previewCategoryCalibrationChunkRows } from "./engine";
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

async function processJob(jobId: string) {
  const job = await getCategoryCalibrationJobById(jobId);
  if (!job.inputFilePath) throw new Error("Category calibration job is missing an uploaded file.");
  await markCategoryCalibrationJobRunning(jobId);

  const uploaded = await getCompletedCategoryCalibrationUpload(job.inputFilePath);
  const preview = await previewCategoryCalibrationChunkRows({
    columns: uploaded.columns,
    sampleRawRows: uploaded.sampleRows,
    totalRows: uploaded.uploadedRowCount,
  });

  await updateCategoryCalibrationJobProgress({
    jobId,
    processedRows: 0,
    successRows: 0,
    failedRows: 0,
    summary: {
      inputMode: preview.inputMode,
      totalRows: preview.totalRows,
      validRows: preview.validRows,
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
    totalRows: uploaded.uploadedRowCount,
    csvOutputPath: path.join(RESULT_TMP_DIR, `${jobId}.csv`),
    onProgress: async (progress) => {
      await updateCategoryCalibrationJobProgress({
        jobId,
        processedRows: progress.processedRows,
        successRows: progress.successRows,
        failedRows: progress.failedRows,
        summary: {
          inputMode: preview.inputMode,
          totalRows: uploaded.uploadedRowCount,
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
  const csvBuffer = await readFile(csvPath);
  const workbook = XLSX.read(csvBuffer, { type: "buffer" });
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

  const uploaded = await getCompletedCategoryCalibrationUpload(input.uploadId);
  return previewCategoryCalibrationChunkRows({
    columns: uploaded.columns,
    sampleRawRows: uploaded.sampleRows,
    totalRows: uploaded.uploadedRowCount,
  });
}

export async function startCategoryCalibrationJob(input: {
  uploader: Uploader;
  note?: string;
  fileName: string;
  uploadId?: string;
}) {
  if (!input.uploadId) {
    throw new Error("Category calibration run requires an uploaded file.");
  }

  const uploaded = await getCompletedCategoryCalibrationUpload(input.uploadId);
  const preview = await previewCategoryCalibrationChunkRows({
    columns: uploaded.columns,
    sampleRawRows: uploaded.sampleRows,
    totalRows: uploaded.uploadedRowCount,
  });

  const created = await createCategoryCalibrationJob({
    uploader: input.uploader,
    note: input.note || "",
    fileName: uploaded.fileName || input.fileName,
    filePath: uploaded.id,
    inputMode: preview.inputMode,
    totalRows: preview.totalRows,
  });

  return {
    jobId: created.jobId,
    inputMode: preview.inputMode,
    totalRows: preview.totalRows,
    validRows: preview.validRows,
    status: "queued" as const,
  };
}
