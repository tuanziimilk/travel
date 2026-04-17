import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ggCleaningUploadMaxFileBytes } from "@about-demo/trpc";
import { makeId } from "../utils/id";
import { resolveApiRuntimePath } from "../utils/runtimePaths";
import type { GgCleaningPreview } from "./engine";

export type GgCleaningUploadRow = Record<string, unknown>;

type UploadChunkMeta = {
  chunkIndex: number;
  filePath: string;
  rowCount: number;
  groupCount: number;
};

type UploadKind = "row-chunks" | "file-chunks";

type UploadMeta = {
  id: string;
  fileName: string;
  fileSize: number;
  kind: UploadKind | null;
  nextChunkIndex: number;
  uploadedRowCount: number;
  uploadedByteCount: number;
  columns: string[];
  sampleRows: GgCleaningUploadRow[];
  chunkFiles: UploadChunkMeta[];
  rawFilePath: string | null;
  chunkCount: number;
  groupCount: number;
  oversizedGroupCount: number;
  previewCache: GgCleaningPreview | null;
  previewUpdatedAt: string | null;
  completed: boolean;
};

type StoredChunkFile = {
  rows: GgCleaningUploadRow[];
};

const GG_UPLOAD_DIR = resolveApiRuntimePath("gg-cleaning-uploads");

function uploadDirOf(uploadId: string) {
  return path.join(GG_UPLOAD_DIR, uploadId);
}

function metaPathOf(uploadId: string) {
  return path.join(uploadDirOf(uploadId), "meta.json");
}

function chunkPathOf(uploadId: string, chunkIndex: number) {
  return path.join(uploadDirOf(uploadId), `chunk-${chunkIndex}.json`);
}

function rawFilePathOf(uploadId: string, fileName: string) {
  const ext = path.extname(fileName || "").toLowerCase() || ".bin";
  return path.join(uploadDirOf(uploadId), `uploaded${ext}`);
}

async function readMeta(uploadId: string): Promise<UploadMeta> {
  const text = await readFile(metaPathOf(uploadId), "utf8");
  return JSON.parse(text) as UploadMeta;
}

async function writeMeta(meta: UploadMeta) {
  await writeFile(metaPathOf(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

function isMissingUploadMetaError(error: unknown) {
  const err = error as NodeJS.ErrnoException | undefined;
  if (!err || typeof err !== "object") return false;
  if (err.code !== "ENOENT") return false;
  const message = typeof err.message === "string" ? err.message : "";
  return message.includes("gg-cleaning-uploads") || message.includes("meta.json");
}

export function toGgUploadClientError(error: unknown) {
  if (isMissingUploadMetaError(error)) {
    return "GG 上传会话已失效，可能是服务重启或上传目录切换导致，请重新上传文件后再试。";
  }
  return error instanceof Error ? error.message : String(error);
}

function collectColumns(rows: GgCleaningUploadRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)).map((column) => String(column || "").trim()).filter(Boolean)));
}

export async function initGgCleaningUpload(fileName: string, fileSize: number) {
  if (fileSize > ggCleaningUploadMaxFileBytes) {
    throw new Error(`Uploaded file is too large. Please keep it within ${Math.round(ggCleaningUploadMaxFileBytes / 1024 / 1024)}MB.`);
  }

  const id = makeId();
  const dir = uploadDirOf(id);
  await mkdir(dir, { recursive: true });

  const meta: UploadMeta = {
    id,
    fileName,
    fileSize,
    kind: null,
    nextChunkIndex: 0,
    uploadedRowCount: 0,
    uploadedByteCount: 0,
    columns: [],
    sampleRows: [],
    chunkFiles: [],
    rawFilePath: null,
    chunkCount: 0,
    groupCount: 0,
    oversizedGroupCount: 0,
    previewCache: null,
    previewUpdatedAt: null,
    completed: false,
  };

  await writeMeta(meta);
  return { uploadId: id };
}

export async function appendGgCleaningUploadChunk(input: {
  uploadId: string;
  chunkIndex: number;
  rows: GgCleaningUploadRow[];
  groupCount?: number;
}) {
  const meta = await readMeta(input.uploadId);
  if (meta.completed) throw new Error("Upload already completed.");
  if (meta.kind === "file-chunks") throw new Error("Upload already started in file-chunk mode.");
  if (input.chunkIndex !== meta.nextChunkIndex) {
    throw new Error(`Unexpected chunk index ${input.chunkIndex}, expected ${meta.nextChunkIndex}.`);
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("rows must contain at least one record.");
  }

  const chunkFilePath = chunkPathOf(input.uploadId, input.chunkIndex);
  const storedChunk: StoredChunkFile = { rows: input.rows };
  await writeFile(chunkFilePath, JSON.stringify(storedChunk), "utf8");

  meta.kind = "row-chunks";
  meta.nextChunkIndex += 1;
  meta.uploadedRowCount += input.rows.length;
  meta.columns = Array.from(new Set([...meta.columns, ...collectColumns(input.rows)]));
  if (meta.sampleRows.length < 5) {
    meta.sampleRows.push(...input.rows.slice(0, 5 - meta.sampleRows.length));
  }
  meta.chunkFiles.push({
    chunkIndex: input.chunkIndex,
    filePath: chunkFilePath,
    rowCount: input.rows.length,
    groupCount: Math.max(1, Number(input.groupCount || 0)),
  });

  await writeMeta(meta);
  return {
    uploadId: input.uploadId,
    nextChunkIndex: meta.nextChunkIndex,
    uploadedRowCount: meta.uploadedRowCount,
  };
}

export async function appendGgCleaningUploadFileChunk(input: {
  uploadId: string;
  chunkIndex: number;
  buffer: Buffer;
}) {
  const meta = await readMeta(input.uploadId);
  if (meta.completed) throw new Error("Upload already completed.");
  if (meta.kind === "row-chunks") throw new Error("Upload already started in row-chunk mode.");
  if (input.chunkIndex !== meta.nextChunkIndex) {
    throw new Error(`Unexpected chunk index ${input.chunkIndex}, expected ${meta.nextChunkIndex}.`);
  }
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new Error("buffer must contain at least one byte.");
  }

  const rawFilePath = meta.rawFilePath || rawFilePathOf(input.uploadId, meta.fileName);
  await appendFile(rawFilePath, input.buffer);

  meta.kind = "file-chunks";
  meta.rawFilePath = rawFilePath;
  meta.nextChunkIndex += 1;
  meta.uploadedByteCount += input.buffer.length;
  await writeMeta(meta);

  return {
    uploadId: input.uploadId,
    nextChunkIndex: meta.nextChunkIndex,
    uploadedByteCount: meta.uploadedByteCount,
  };
}

export async function completeGgCleaningUpload(input: {
  uploadId: string;
  chunkCount: number;
  groupCount?: number;
  oversizedGroupCount?: number;
}) {
  const meta = await readMeta(input.uploadId);
  if (meta.completed) return meta;
  if (!meta.kind) throw new Error("Upload does not contain any chunks yet.");
  if (!Number.isInteger(input.chunkCount) || input.chunkCount <= 0) {
    throw new Error("chunkCount must be a positive integer.");
  }
  if (meta.nextChunkIndex !== input.chunkCount) {
    throw new Error(`Chunk count mismatch: received ${meta.nextChunkIndex}, expected ${input.chunkCount}.`);
  }
  if (meta.kind === "row-chunks" && (!Number.isInteger(input.groupCount) || Number(input.groupCount) <= 0)) {
    throw new Error("groupCount must be a positive integer.");
  }
  if (meta.kind === "file-chunks") {
    if (meta.uploadedByteCount !== meta.fileSize) {
      throw new Error(`File size mismatch: received ${meta.uploadedByteCount}, expected ${meta.fileSize}.`);
    }
    meta.groupCount = 0;
    meta.oversizedGroupCount = 0;
  } else {
    meta.groupCount = Number(input.groupCount || 0);
    meta.oversizedGroupCount = Math.max(0, Number(input.oversizedGroupCount || 0));
  }

  meta.chunkCount = input.chunkCount;
  meta.completed = true;
  await writeMeta(meta);
  return {
    uploadId: input.uploadId,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    chunkCount: meta.chunkCount,
    groupCount: meta.groupCount,
    oversizedGroupCount: meta.oversizedGroupCount,
  };
}

export async function getCompletedGgCleaningUpload(uploadId: string) {
  const meta = await readMeta(uploadId);
  if (!meta.completed) throw new Error("Upload is not completed yet.");
  return meta;
}

export async function getGgCleaningUploadPreviewCache(uploadId: string) {
  const meta = await getCompletedGgCleaningUpload(uploadId);
  return meta.previewCache || null;
}

export async function saveGgCleaningUploadPreviewCache(uploadId: string, preview: GgCleaningPreview) {
  const meta = await readMeta(uploadId);
  meta.previewCache = preview;
  meta.previewUpdatedAt = new Date().toISOString();
  await writeMeta(meta);
  return preview;
}

export async function* iterateGgCleaningUploadChunks(uploadId: string): AsyncGenerator<{ chunkIndex: number; rows: GgCleaningUploadRow[] }> {
  const meta = await getCompletedGgCleaningUpload(uploadId);
  if (meta.kind !== "row-chunks") {
    throw new Error("Upload is not stored as row chunks.");
  }
  for (const chunk of meta.chunkFiles.sort((left, right) => left.chunkIndex - right.chunkIndex)) {
    const text = await readFile(chunk.filePath, "utf8");
    const parsed = JSON.parse(text) as StoredChunkFile;
    yield {
      chunkIndex: chunk.chunkIndex,
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  }
}
