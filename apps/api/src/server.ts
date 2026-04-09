import express from "express";
import cors from "cors";
import { env } from "./env";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import {
  appendCategoryCalibrationUploadChunk,
  completeCategoryCalibrationUpload,
  initCategoryCalibrationUpload,
} from "./category-calibration/uploadStore";
import { appendGgCleaningUploadChunk, appendGgCleaningUploadFileChunk, completeGgCleaningUpload, initGgCleaningUpload } from "./gg-cleaning/uploadStore";

const app = express();
app.use(cors({ origin: env.webOrigin }));
app.use(express.json({ limit: "50mb" }));

app.post("/gg-cleaning/uploads/init", async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "").trim();
    const fileSize = Number(req.body?.fileSize || 0);
    if (!fileName) throw new Error("fileName is required.");
    if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("fileSize must be a positive number.");
    res.json(await initGgCleaningUpload(fileName, fileSize));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/gg-cleaning/uploads/:uploadId/chunk", async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || "").trim();
    const chunkIndex = Number(req.body?.chunkIndex ?? -1);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const groupCount = Number(req.body?.groupCount ?? 0);
    if (!uploadId) throw new Error("uploadId is required.");
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer.");
    if (!rows?.length) throw new Error("rows is required.");
    res.json(await appendGgCleaningUploadChunk({ uploadId, chunkIndex, rows, groupCount }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/gg-cleaning/uploads/:uploadId/file-chunk/:chunkIndex", express.raw({ type: "*/*", limit: "16mb" }), async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || "").trim();
    const chunkIndex = Number(req.params.chunkIndex ?? -1);
    if (!uploadId) throw new Error("uploadId is required.");
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer.");
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new Error("chunk body is required.");
    res.json(await appendGgCleaningUploadFileChunk({ uploadId, chunkIndex, buffer: req.body }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/gg-cleaning/uploads/:uploadId/complete", async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || "").trim();
    const chunkCount = Number(req.body?.chunkCount ?? 0);
    const groupCount = Number(req.body?.groupCount ?? 0);
    const oversizedGroupCount = Number(req.body?.oversizedGroupCount ?? 0);
    if (!uploadId) throw new Error("uploadId is required.");
    res.json(await completeGgCleaningUpload({ uploadId, chunkCount, groupCount, oversizedGroupCount }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/category-calibration/uploads/init", async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "").trim();
    const fileSize = Number(req.body?.fileSize || 0);
    if (!fileName) throw new Error("fileName is required.");
    if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("fileSize must be a positive number.");
    res.json(await initCategoryCalibrationUpload(fileName, fileSize));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/category-calibration/uploads/:uploadId/chunk", async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || "").trim();
    const chunkIndex = Number(req.body?.chunkIndex ?? -1);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!uploadId) throw new Error("uploadId is required.");
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer.");
    if (!rows?.length) throw new Error("rows is required.");
    res.json(await appendCategoryCalibrationUploadChunk({ uploadId, chunkIndex, rows }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/category-calibration/uploads/:uploadId/complete", async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || "").trim();
    const chunkCount = Number(req.body?.chunkCount ?? 0);
    if (!uploadId) throw new Error("uploadId is required.");
    res.json(await completeCategoryCalibrationUpload({ uploadId, chunkCount }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.listen(env.apiPort, () => {
  console.log(`API running on http://localhost:${env.apiPort}`);
});
