import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeId } from "../utils/id";
import { apiRuntimePath } from "../utils/runtimePaths";
import type { GgCleaningPreview } from "./engine";
import { previewGgCleaningFile, previewGgCleaningChunkRows, previewGgCleaningFileByPathWithProgress } from "./engine";
import {
  getCompletedGgCleaningUpload,
  getGgCleaningUploadPreviewCache,
  saveGgCleaningUploadPreviewCache,
} from "./uploadStore";

type PreviewTaskStatus = "queued" | "preparing" | "ready" | "failed" | "expired";

type StoredPreviewTask = {
  taskId: string;
  fileName: string;
  uploadId: string | null;
  status: PreviewTaskStatus;
  progressPercent: number;
  statusText: string;
  errorMessage: string;
  preview: GgCleaningPreview | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const PREVIEW_TASK_DIR = apiRuntimePath("gg-cleaning-preview-tasks");
const previewTaskRetentionMs = 24 * 60 * 60 * 1000;

function taskPathOf(taskId: string) {
  return path.join(PREVIEW_TASK_DIR, `${taskId}.json`);
}

async function writeTask(task: StoredPreviewTask) {
  await mkdir(PREVIEW_TASK_DIR, { recursive: true });
  await writeFile(taskPathOf(task.taskId), JSON.stringify(task, null, 2), "utf8");
}

async function readTask(taskId: string) {
  const text = await readFile(taskPathOf(taskId), "utf8");
  return JSON.parse(text) as StoredPreviewTask;
}

async function patchTask(taskId: string, patch: Partial<StoredPreviewTask>) {
  const current = await readTask(taskId);
  const next: StoredPreviewTask = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeTask(next);
  return next;
}

async function buildPreviewFromUpload(taskId: string, uploadId: string, fileName: string) {
  const cached = await getGgCleaningUploadPreviewCache(uploadId);
  if (cached) {
    return { preview: cached, fromCache: true };
  }

  const uploaded = await getCompletedGgCleaningUpload(uploadId);
  const preview =
    uploaded.kind === "file-chunks" && uploaded.rawFilePath
      ? await previewGgCleaningFileByPathWithProgress({
          fileName: uploaded.fileName || fileName,
          filePath: uploaded.rawFilePath,
        }, {
          onProgress: async ({ processedInputRows, discoveredGroups }) => {
            const progressPercent = processedInputRows < 100 ? 18 : Math.min(92, 18 + Math.round(Math.log10(processedInputRows + 1) * 18));
            await patchTask(taskId, {
              progressPercent,
              statusText: `正在扫描有效输入... 已识别 ${processedInputRows.toLocaleString()} 行 / ${discoveredGroups.toLocaleString()} 组`,
            });
          },
        })
      : await previewGgCleaningChunkRows({
          columns: uploaded.columns,
          sampleRawRows: uploaded.sampleRows,
          totalRows: uploaded.uploadedRowCount,
          groupedRows: uploaded.groupCount,
          chunkCount: uploaded.chunkCount,
          oversizedGroupCount: uploaded.oversizedGroupCount,
        });
  await saveGgCleaningUploadPreviewCache(uploadId, preview);
  return { preview, fromCache: false };
}

async function preparePreviewTask(taskId: string, input: { fileName: string; uploadId?: string; fileBase64?: string }) {
  try {
    await patchTask(taskId, {
      status: "preparing",
      progressPercent: 12,
      statusText: input.uploadId ? "正在检查已上传文件..." : "正在读取上传内容...",
      errorMessage: "",
      preview: null,
    });

    let preview: GgCleaningPreview;
    let statusText = "预览生成完成。";
    if (input.uploadId) {
      await patchTask(taskId, {
        progressPercent: 40,
        statusText: "正在后台解析文件结构...",
      });
      const resolved = await buildPreviewFromUpload(taskId, input.uploadId, input.fileName);
      preview = resolved.preview;
      statusText = resolved.fromCache ? "已复用上次预览结果。" : "预览生成完成。";
    } else {
      if (!input.fileBase64) throw new Error("GG 预览任务缺少文件内容。");
      await patchTask(taskId, {
        progressPercent: 40,
        statusText: "正在解析文件内容...",
      });
      preview = previewGgCleaningFile({
        fileName: input.fileName,
        fileBase64: input.fileBase64,
      });
    }

    await patchTask(taskId, {
      status: "ready",
      progressPercent: 100,
      statusText,
      errorMessage: "",
      preview,
    });
  } catch (error) {
    await patchTask(taskId, {
      status: "failed",
      progressPercent: 100,
      statusText: "预览生成失败。",
      errorMessage: error instanceof Error ? error.message : String(error),
      preview: null,
    });
  }
}

export async function createGgCleaningPreviewTask(input: {
  fileName: string;
  uploadId?: string;
  fileBase64?: string;
}) {
  const taskId = makeId();
  const now = new Date();
  const task: StoredPreviewTask = {
    taskId,
    fileName: input.fileName,
    uploadId: input.uploadId || null,
    status: "queued",
    progressPercent: 0,
    statusText: "已加入预览队列。",
    errorMessage: "",
    preview: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + previewTaskRetentionMs).toISOString(),
  };
  await writeTask(task);
  void preparePreviewTask(taskId, input);
  return getGgCleaningPreviewTask(taskId);
}

export async function getGgCleaningPreviewTask(taskId: string) {
  const task = await readTask(taskId);
  if (Date.parse(task.expiresAt) < Date.now() && task.status !== "expired") {
    return patchTask(taskId, {
      status: "expired",
      progressPercent: 100,
      statusText: "预览已过期，请重新上传或重新创建预览。",
      errorMessage: task.errorMessage || "Preview task expired.",
      preview: task.preview,
    });
  }
  return task;
}

export async function ensureGgCleaningPreviewTaskFile(taskId: string) {
  const task = await getGgCleaningPreviewTask(taskId);
  if (task.status !== "ready" || !task.preview) {
    throw new Error(task.errorMessage || "Preview task is not ready.");
  }
  await stat(taskPathOf(taskId));
  return task.preview;
}
