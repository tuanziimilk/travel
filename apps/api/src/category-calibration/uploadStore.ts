import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { categoryCalibrationUploadMaxFileBytes } from "@about-demo/trpc";
import { makeId } from "../utils/id";

export type CategoryCalibrationUploadRow = Record<string, unknown>;

type UploadChunkMeta = {
  chunkIndex: number;
  filePath: string;
  rowCount: number;
};

type UploadMeta = {
  id: string;
  fileName: string;
  fileSize: number;
  nextChunkIndex: number;
  uploadedRowCount: number;
  columns: string[];
  sampleRows: CategoryCalibrationUploadRow[];
  chunkFiles: UploadChunkMeta[];
  chunkCount: number;
  completed: boolean;
};

type StoredChunkFile = {
  rows: CategoryCalibrationUploadRow[];
};

const UPLOAD_DIR = path.resolve(process.cwd(), "apps", "api", ".runtime", "category-calibration-uploads");

function uploadDirOf(uploadId: string) {
  return path.join(UPLOAD_DIR, uploadId);
}

function metaPathOf(uploadId: string) {
  return path.join(uploadDirOf(uploadId), "meta.json");
}

function chunkPathOf(uploadId: string, chunkIndex: number) {
  return path.join(uploadDirOf(uploadId), `chunk-${chunkIndex}.json`);
}

async function readMeta(uploadId: string): Promise<UploadMeta> {
  const text = await readFile(metaPathOf(uploadId), "utf8");
  return JSON.parse(text) as UploadMeta;
}

async function writeMeta(meta: UploadMeta) {
  await writeFile(metaPathOf(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

function collectColumns(rows: CategoryCalibrationUploadRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)).map((column) => String(column || "").trim()).filter(Boolean)));
}

export async function initCategoryCalibrationUpload(fileName: string, fileSize: number) {
  if (fileSize > categoryCalibrationUploadMaxFileBytes) {
    throw new Error(`Uploaded file is too large. Please keep it within ${Math.round(categoryCalibrationUploadMaxFileBytes / 1024 / 1024)}MB.`);
  }

  const id = makeId();
  const dir = uploadDirOf(id);
  await mkdir(dir, { recursive: true });

  const meta: UploadMeta = {
    id,
    fileName,
    fileSize,
    nextChunkIndex: 0,
    uploadedRowCount: 0,
    columns: [],
    sampleRows: [],
    chunkFiles: [],
    chunkCount: 0,
    completed: false,
  };

  await writeMeta(meta);
  return { uploadId: id };
}

export async function appendCategoryCalibrationUploadChunk(input: {
  uploadId: string;
  chunkIndex: number;
  rows: CategoryCalibrationUploadRow[];
}) {
  const meta = await readMeta(input.uploadId);
  if (meta.completed) throw new Error("Upload already completed.");
  if (input.chunkIndex !== meta.nextChunkIndex) {
    throw new Error(`Unexpected chunk index ${input.chunkIndex}, expected ${meta.nextChunkIndex}.`);
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("rows must contain at least one record.");
  }

  const chunkFilePath = chunkPathOf(input.uploadId, input.chunkIndex);
  const storedChunk: StoredChunkFile = { rows: input.rows };
  await writeFile(chunkFilePath, JSON.stringify(storedChunk), "utf8");

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
  });

  await writeMeta(meta);
  return {
    uploadId: input.uploadId,
    nextChunkIndex: meta.nextChunkIndex,
    uploadedRowCount: meta.uploadedRowCount,
  };
}

export async function completeCategoryCalibrationUpload(input: { uploadId: string; chunkCount: number }) {
  const meta = await readMeta(input.uploadId);
  if (meta.completed) return meta;
  if (!Number.isInteger(input.chunkCount) || input.chunkCount <= 0) {
    throw new Error("chunkCount must be a positive integer.");
  }
  if (meta.nextChunkIndex !== input.chunkCount) {
    throw new Error(`Chunk count mismatch: received ${meta.nextChunkIndex}, expected ${input.chunkCount}.`);
  }

  meta.chunkCount = input.chunkCount;
  meta.completed = true;
  await writeMeta(meta);
  return {
    uploadId: input.uploadId,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    chunkCount: meta.chunkCount,
  };
}

export async function getCompletedCategoryCalibrationUpload(uploadId: string) {
  const meta = await readMeta(uploadId);
  if (!meta.completed) throw new Error("Upload is not completed yet.");
  return meta;
}

export async function* iterateCategoryCalibrationUploadChunks(
  uploadId: string,
): AsyncGenerator<{ chunkIndex: number; rows: CategoryCalibrationUploadRow[] }> {
  const meta = await getCompletedCategoryCalibrationUpload(uploadId);
  for (const chunk of meta.chunkFiles.sort((left, right) => left.chunkIndex - right.chunkIndex)) {
    const text = await readFile(chunk.filePath, "utf8");
    const parsed = JSON.parse(text) as StoredChunkFile;
    yield {
      chunkIndex: chunk.chunkIndex,
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  }
}
