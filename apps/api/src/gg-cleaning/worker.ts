import type { Uploader } from "@about-demo/trpc";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeGgCleaning, executeGgCleaningByPath, executeGgCleaningChunkRows, previewGgCleaningChunkRows, previewGgCleaningFile, previewGgCleaningFileByPath } from "./engine";
import {
  completeGgCleaningJob,
  createGgCleaningJob,
  failGgCleaningJob,
  getGgCleaningJobById,
  listQueuedGgCleaningJobs,
  markGgCleaningJobRunning,
  recoverInterruptedGgCleaningJobs,
  updateGgCleaningJobProgress,
} from "./jobStore";
import { getCompletedGgCleaningUpload, iterateGgCleaningUploadChunks } from "./uploadStore";
import { apiRuntimePath } from "../utils/runtimePaths";

let loopStarted = false;
let activeJobId = "";
const GG_RESULT_DIR = apiRuntimePath("gg-cleaning-results");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getUploadedInput(inputFilePath: string | null | undefined) {
  if (!inputFilePath) return null;
  try {
    return await getCompletedGgCleaningUpload(inputFilePath);
  } catch {
    return null;
  }
}

async function processJob(jobId: string) {
  const job = await getGgCleaningJobById(jobId);
  if (!job.inputFileBase64 && !job.inputFilePath) throw new Error("任务缺少输入文件。");
  await markGgCleaningJobRunning(jobId);

  const uploaded = await getUploadedInput(job.inputFilePath);
  const preview = uploaded
    ? uploaded.kind === "file-chunks" && uploaded.rawFilePath
      ? await previewGgCleaningFileByPath({
          fileName: uploaded.fileName,
          filePath: uploaded.rawFilePath,
        })
      : await previewGgCleaningChunkRows({
          columns: uploaded.columns,
          sampleRawRows: uploaded.sampleRows,
          totalRows: uploaded.uploadedRowCount,
          groupedRows: uploaded.groupCount,
          chunkCount: uploaded.chunkCount,
          oversizedGroupCount: uploaded.oversizedGroupCount,
        })
    : job.inputFilePath
    ? await previewGgCleaningFileByPath({
        fileName: job.inputFileName,
        filePath: job.inputFilePath,
      })
    : previewGgCleaningFile({
        fileName: job.inputFileName,
        fileBase64: job.inputFileBase64 || "",
      });

  await updateGgCleaningJobProgress({
    jobId,
    processedRows: 0,
    successRows: 0,
    failedRows: 0,
    summary: {
      inputMode: preview.inputMode,
      totalRows: preview.totalRows,
      groupedRows: preview.groupedRows,
      chunkCount: preview.chunkCount,
      oversizedGroupCount: preview.oversizedGroupCount,
    },
  });

  const result = uploaded
    ? uploaded.kind === "file-chunks" && uploaded.rawFilePath
      ? await executeGgCleaningByPath({
          fileName: uploaded.fileName,
          filePath: uploaded.rawFilePath,
        })
      : await executeGgCleaningChunkRows({
          rawRowChunks: (async function* () {
            for await (const chunk of iterateGgCleaningUploadChunks(uploaded.id)) {
              yield chunk.rows;
            }
          })(),
          columns: uploaded.columns,
          sampleRawRows: uploaded.sampleRows,
          totalRows: uploaded.uploadedRowCount,
          groupedRows: uploaded.groupCount,
          chunkCount: uploaded.chunkCount,
          oversizedGroupCount: uploaded.oversizedGroupCount,
        })
    : job.inputFilePath
    ? await executeGgCleaningByPath({
        fileName: job.inputFileName,
        filePath: job.inputFilePath,
      })
    : executeGgCleaning({
        fileName: job.inputFileName,
        fileBase64: job.inputFileBase64 || "",
      });

  await updateGgCleaningJobProgress({
    jobId,
    processedRows: result.summary.groupedRows,
    successRows: result.summary.successRows,
    failedRows: result.summary.failedRows,
    summary: result.summary,
  });

  await mkdir(GG_RESULT_DIR, { recursive: true });
  const resultFileName = `${job.inputFileName.replace(/\.[^.]+$/, "") || "gg-cleaning"}-result.xlsx`;
  const resultFilePath = path.join(GG_RESULT_DIR, `${jobId}.xlsx`);
  const workbookBuffer = "workbookBuffer" in result ? result.workbookBuffer : Buffer.from(result.workbookBase64, "base64");
  await writeFile(resultFilePath, workbookBuffer);

  try {
    await completeGgCleaningJob({
      jobId,
      processedRows: result.summary.groupedRows,
      successRows: result.summary.successRows,
      failedRows: result.summary.failedRows,
      resultFileName,
      resultFilePath,
      rowResults: result.debugRows.slice(0, 50),
      summary: result.summary,
    });
  } catch {
    await completeGgCleaningJob({
      jobId,
      processedRows: result.summary.groupedRows,
      successRows: result.summary.successRows,
      failedRows: result.summary.failedRows,
      resultFileName,
      resultFilePath,
      rowResults: null,
      summary: result.summary,
    });
  }
}

async function consumeLoop() {
  if (loopStarted) return;
  loopStarted = true;
  await recoverInterruptedGgCleaningJobs();

  while (true) {
    try {
      if (!activeJobId) {
        const queued = await listQueuedGgCleaningJobs();
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
        await failGgCleaningJob(activeJobId, message);
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

export async function previewGgCleaning(input: { fileName: string; fileBase64?: string; uploadId?: string }) {
  if (input.uploadId) {
    const uploaded = await getCompletedGgCleaningUpload(input.uploadId);
    if (uploaded.kind === "file-chunks" && uploaded.rawFilePath) {
      return previewGgCleaningFileByPath({
        fileName: uploaded.fileName || input.fileName,
        filePath: uploaded.rawFilePath,
      });
    }
    return previewGgCleaningChunkRows({
      columns: uploaded.columns,
      sampleRawRows: uploaded.sampleRows,
      totalRows: uploaded.uploadedRowCount,
      groupedRows: uploaded.groupCount,
      chunkCount: uploaded.chunkCount,
      oversizedGroupCount: uploaded.oversizedGroupCount,
    });
  }
  if (!input.fileBase64) {
    throw new Error("GG 清洗预览缺少文件内容。");
  }
  return previewGgCleaningFile({
    fileName: input.fileName,
    fileBase64: input.fileBase64,
  });
}

export async function startGgCleaningJob(input: {
  uploader: Uploader;
  note?: string;
  fileName: string;
  fileBase64?: string;
  uploadId?: string;
}) {
  let preview;
  let storedFileName = input.fileName;
  let storedFileBase64: string | null = null;
  let storedFilePath: string | null = null;

  if (input.uploadId) {
    const uploaded = await getCompletedGgCleaningUpload(input.uploadId);
    storedFileName = uploaded.fileName || input.fileName;
    storedFilePath = uploaded.kind === "file-chunks" && uploaded.rawFilePath ? uploaded.rawFilePath : uploaded.id;
    preview =
      uploaded.kind === "file-chunks" && uploaded.rawFilePath
        ? await previewGgCleaningFileByPath({
            fileName: storedFileName,
            filePath: uploaded.rawFilePath,
          })
        : await previewGgCleaningChunkRows({
            columns: uploaded.columns,
            sampleRawRows: uploaded.sampleRows,
            totalRows: uploaded.uploadedRowCount,
            groupedRows: uploaded.groupCount,
            chunkCount: uploaded.chunkCount,
            oversizedGroupCount: uploaded.oversizedGroupCount,
          });
  } else {
    if (!input.fileBase64) {
      throw new Error("GG 清洗任务缺少文件内容。");
    }
    storedFileBase64 = input.fileBase64;
    preview = previewGgCleaningFile({
      fileName: input.fileName,
      fileBase64: input.fileBase64,
    });
  }

  const created = await createGgCleaningJob({
    uploader: input.uploader,
    note: input.note || "",
    fileName: storedFileName,
    fileBase64: storedFileBase64,
    filePath: storedFilePath,
    inputMode: preview.inputMode,
    totalRows: preview.totalRows,
    groupedRows: preview.groupedRows,
  });

  return {
    jobId: created.jobId,
    inputMode: preview.inputMode,
    totalRows: preview.totalRows,
    groupedRows: preview.groupedRows,
    chunkCount: preview.chunkCount,
    status: "queued" as const,
  };
}
