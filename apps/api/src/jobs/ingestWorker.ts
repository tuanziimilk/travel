import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { and, desc, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { ManualScoreInput, type OutputMode, ScoreOutput, uploaderSchema } from "@about-demo/trpc";
import { db } from "../db/client";
import { aboutScoreRows, ingestJobs, uploadBatches } from "../db/schema";
import { makeId } from "../utils/id";
import { scoreAboutByAiWithMeta, type ScoreIssueFlags } from "../scoring/aboutAiScorer";
import { env } from "../env";
import { sha256 } from "../utils/hash";
import { collectPassMetrics } from "./passMetrics";

const headerAliases = {
  termId: ["TermID", "\uFEFFTermID"],
  termName: ["TermName"],
  domain: ["Domain"],
  country: ["Country"],
  aboutOnline: ["About-线上", "About-çº¿ä¸Š", "About-online"],
  aboutAi: ["About-AI优化", "About-AIä¼˜åŒ–", "About-ai"],
  aboutOp: ["About-OP复核", "About-OPå¤æ ¸", "About-op"],
} as const;

const headerOnline = "About-线上";
const headerAi = "About-AI优化";
const headerOp = "About-OP复核";
const requiredHeaders = ["TermID", "TermName", "Domain", "Country", headerOnline, headerAi, headerOp];

export type ParsedUploadRow = {
  TermID: string;
  TermName: string;
  Domain: string;
  Country: string;
  About_online: string;
  About_ai: string;
  About_op: string;
};

type RowSelect = typeof aboutScoreRows.$inferSelect;
type ModuleId = "about" | "faq";

const ingestPayloadByBatch = new Map<string, ParsedUploadRow[]>();
type PendingIngestJob = {
  jobId: string;
  batchId: string;
  rows: ParsedUploadRow[];
  moduleId: ModuleId;
  outputMode: OutputMode;
};
const pendingIngestJobsByModule: Record<ModuleId, PendingIngestJob[]> = {
  about: [],
  faq: [],
};
const ingestRunnerWorkingByModule: Record<ModuleId, boolean> = {
  about: false,
  faq: false,
};
const publishAboutSectionName = "About";
const ingestJobStallMs = env.ingestJobStallMs;

function snapshotText(value: string | null | undefined) {
  return env.snapshotEnabled ? String(value || "").trim() : null;
}

function rowSignatureFromInput(row: ParsedUploadRow) {
  const hashOnline = sha256(row.About_online || "");
  const hashAi = sha256(row.About_ai || "");
  const hashOp = row.About_op?.trim() ? sha256(row.About_op) : "";
  return [row.TermID || "", row.Domain || "", hashOnline, hashAi, hashOp].join("|");
}

function rowSignatureFromStored(row: {
  termId: string;
  domain: string;
  hashOnline: string;
  hashAi: string;
  hashOp: string | null;
}) {
  return [row.termId || "", row.domain || "", row.hashOnline || "", row.hashAi || "", row.hashOp || ""].join("|");
}

function toTimestampMs(value: unknown) {
  const ts = new Date(value as string | Date).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function dedupeStoredRowsKeepLatest(rows: RowSelect[]) {
  const sorted = [...rows].sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
  const latestBySignature = new Map<string, RowSelect>();

  for (const row of sorted) {
    latestBySignature.set(rowSignatureFromStored(row), row);
  }

  return Array.from(latestBySignature.values()).sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
}

async function backfillMissingErrorRows(
  batchId: string,
  rows: ParsedUploadRow[],
  reason: string,
  options?: { since?: Date | string | null },
) {
  if (!rows.length) return;

  const sinceMs = options?.since ? new Date(options.since).getTime() : 0;

  const existingRows = await db
    .select({
      termId: aboutScoreRows.termId,
      domain: aboutScoreRows.domain,
      hashOnline: aboutScoreRows.hashOnline,
      hashAi: aboutScoreRows.hashAi,
      hashOp: aboutScoreRows.hashOp,
      createdAt: aboutScoreRows.createdAt,
    })
    .from(aboutScoreRows)
    .where(eq(aboutScoreRows.batchId, batchId));

  const touchedSignatures = new Set<string>();
  for (const item of existingRows) {
    const signature = rowSignatureFromStored(item);
    const createdAtMs = new Date(item.createdAt as unknown as string | Date).getTime();
    if (Number.isFinite(createdAtMs) && createdAtMs >= sinceMs) {
      touchedSignatures.add(signature);
    }
  }

  for (const row of rows) {
    const signature = rowSignatureFromInput(row);
    if (touchedSignatures.has(signature)) continue;
    await insertErrorRow(batchId, row, reason);
    touchedSignatures.add(signature);
  }
}

async function aggregateBatchRows(batchId: string) {
  const rawRows = await db.select().from(aboutScoreRows).where(eq(aboutScoreRows.batchId, batchId));
  const rows = dedupeStoredRowsKeepLatest(rawRows).map((item) => ({ errorReason: item.errorReason }));
  const doneRows = rows.length;
  const failedRows = rows.filter((item) => Boolean(item.errorReason)).length;
  const successRows = Math.max(0, doneRows - failedRows);
  return { doneRows, failedRows, successRows };
}

export function parseUploadFile(fileName: string, base64: string): ParsedUploadRow[] {
  const buffer = Buffer.from(base64, "base64");
  if (fileName.toLowerCase().endsWith(".csv")) {
    const records = parse(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
    validateHeadersCompat(Object.keys(records[0] || {}));
    return records.map(normalizeUploadRowCompat);
  }
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    validateHeadersCompat(Object.keys(rows[0] || {}));
    return rows.map(normalizeUploadRowCompat);
  }
  throw new Error("仅支持 .csv 或 .xlsx");
}

function parseFaqUploadFile(fileName: string, base64: string): ParsedUploadRow[] {
  const buffer = Buffer.from(base64, "base64");
  let records: Record<string, unknown>[] = [];
  if (fileName.toLowerCase().endsWith(".csv")) {
    records = parse(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  } else if (fileName.toLowerCase().endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } else {
    throw new Error("invalid file type");
  }

  return records.map((row) => {
    const qOnline = String((row as any).Q_online ?? "");
    const aOnline = String((row as any).A_online ?? "");
    const subclassUnified = String((row as any).subclass ?? (row as any).subclass_online ?? "");
    const qAi = String((row as any).Q_ai ?? "");
    const aAi = String((row as any).A_ai ?? "");
    const subclassAi = String((row as any).subclass_ai ?? subclassUnified);
    const qOp = String((row as any).Q_op ?? "");
    const aOp = String((row as any).A_op ?? "");
    const subclassOp = String((row as any).subclass_op ?? subclassUnified);
    const hasOp = qOp.trim() || aOp.trim() || subclassOp.trim();

    return {
      TermID: String((row as any).TermID ?? ""),
      TermName: String((row as any).TermName ?? ""),
      Domain: String((row as any).Domain ?? ""),
      Country: String((row as any).Country ?? ""),
      About_online: [`Q: ${qOnline}`, `A: ${aOnline}`, `Subclass: ${subclassUnified}`].join("\n"),
      About_ai: [`Q: ${qAi}`, `A: ${aAi}`, `Subclass: ${subclassAi}`].join("\n"),
      About_op: hasOp ? [`Q: ${qOp}`, `A: ${aOp}`, `Subclass: ${subclassOp}`].join("\n") : "",
    };
  });
}

function validateHeaders(headers: string[]) {
  const input = [...headers].sort().join("|");
  const expected = [...requiredHeaders].sort().join("|");
  if (input !== expected) throw new Error(`表头不匹配，必须为: ${requiredHeaders.join("、")}`);
}

function normalizeUploadRow(row: Record<string, unknown>): ParsedUploadRow {
  return {
    TermID: String((row as any).TermID || ""),
    TermName: String((row as any).TermName || ""),
    Domain: String((row as any).Domain || ""),
    Country: String((row as any).Country || ""),
    About_online: String((row as any)[headerOnline] ?? (row as any).About_online ?? ""),
    About_ai: String((row as any)[headerAi] ?? (row as any).About_ai ?? ""),
    About_op: String((row as any)[headerOp] ?? (row as any).About_op ?? ""),
  };
}

function normalizeHeaderKeyCompat(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function pickCompat(mapped: Map<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (mapped.has(alias)) return String(mapped.get(alias) ?? "");
  }
  return "";
}

function validateHeadersCompat(headers: string[]) {
  const normalized = new Set(headers.map(normalizeHeaderKeyCompat));
  const groups = [
    ["termid"],
    ["termname"],
    ["domain"],
    ["country"],
    ["about-online", "about_online", "about-线上", "about-çº¿ä¸Š"],
    ["about-ai", "about_ai", "about-ai优化", "about-aiä¼˜åŒ–"],
    ["about-op", "about_op", "about-op复核", "about-opå¤æ ¸"],
  ];
  const ok = groups.every((aliases) => aliases.some((alias) => normalized.has(alias)));
  if (!ok) throw new Error("表头不匹配，请先下载模板并按模板上传");
}

function normalizeUploadRowCompat(row: Record<string, unknown>): ParsedUploadRow {
  const mapped = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    mapped.set(normalizeHeaderKeyCompat(key), value);
  }
  return {
    TermID: pickCompat(mapped, ["termid"]),
    TermName: pickCompat(mapped, ["termname"]),
    Domain: pickCompat(mapped, ["domain"]),
    Country: pickCompat(mapped, ["country"]),
    About_online: pickCompat(mapped, ["about-online", "about_online", "about-线上", "about-çº¿ä¸Š"]),
    About_ai: pickCompat(mapped, ["about-ai", "about_ai", "about-ai优化", "about-aiä¼˜åŒ–"]),
    About_op: pickCompat(mapped, ["about-op", "about_op", "about-op复核", "about-opå¤æ ¸"]),
  };
}

export async function createBatch(uploader: string) {
  uploaderSchema.parse(uploader);
  const id = makeId();
  await db.insert(uploadBatches).values({ id, uploader, rowCount: 0 });
  return { batchId: id };
}

export async function createBatchWithMeta(params: {
  moduleId?: "about" | "faq";
  uploader: string;
  note?: string;
  source?: "upload" | "manual";
  outputMode?: OutputMode;
}) {
  uploaderSchema.parse(params.uploader);
  const id = makeId();
  await ensureUploadBatchesColumns();

  try {
    await db.insert(uploadBatches).values({
      id,
      moduleId: params.moduleId ?? "about",
      outputMode: params.outputMode ?? "full",
      uploader: params.uploader,
      source: params.source ?? "upload",
      note: (params.note ?? "").slice(0, 255),
      rowCount: 0,
    });
  } catch {
    // 兜底兼容旧库结构：即便 source/note 不存在，也保证能创建 batch
    await db.insert(uploadBatches).values({
      id,
      moduleId: params.moduleId ?? "about",
      outputMode: params.outputMode ?? "full",
      uploader: params.uploader,
      rowCount: 0,
    });
  }
  return { batchId: id };
}

async function ensureUploadBatchesColumns() {
  try {
    await db.execute(sql`ALTER TABLE upload_batches ADD COLUMN module_id varchar(16) NOT NULL DEFAULT 'about'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("exists")) {
      // ignore and continue fallback
    }
  }

  try {
    await db.execute(sql`ALTER TABLE upload_batches ADD COLUMN source varchar(16) NOT NULL DEFAULT 'upload'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("exists")) {
      // 忽略，后续仍有插入兜底
    }
  }

  try {
    await db.execute(sql`ALTER TABLE upload_batches ADD COLUMN note varchar(255) NOT NULL DEFAULT ''`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("exists")) {
      // 忽略，后续仍有插入兜底
    }
  }

  try {
    await db.execute(sql`ALTER TABLE upload_batches ADD COLUMN output_mode varchar(16) NOT NULL DEFAULT 'full'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("exists")) {
      // ignore and continue fallback
    }
  }
}

export async function saveManualScoreToBatch(params: {
  batchId: string;
  input: ManualScoreInput;
  scored: ScoreOutput;
}) {
  await ensureAboutScoreRowsColumns();
  const byVersion = Object.fromEntries(params.scored.results.map((item) => [item.version, item])) as Record<
    string,
    ScoreOutput["results"][number]
  >;
  const online = byVersion.online;
  const ai = byVersion.ai;
  const op = byVersion.op;
  const keyDeltas = ensureKeyDeltas(params.scored);

  await db.insert(aboutScoreRows).values({
    id: makeId(),
    batchId: params.batchId,
    termId: params.input.TermID || "",
    termName: params.input.TermName || "",
    domain: params.input.Domain || "",
    country: params.input.Country || "",
    hashOnline: sha256(params.input.About_online || ""),
    hashAi: sha256(params.input.About_ai || ""),
    hashOp: params.input.About_op?.trim() ? sha256(params.input.About_op) : null,
    scoreOnlineTotal: String(online.score_total),
    scoreAiTotal: String(ai.score_total),
    scoreOpTotal: op ? String(op.score_total) : null,
    scoreOnlineA: String(online.score_breakdown.A),
    scoreOnlineB: String(online.score_breakdown.B),
    scoreOnlineC: String(online.score_breakdown.C),
    scoreOnlineD: String(online.score_breakdown.D),
    scoreAiA: String(ai.score_breakdown.A),
    scoreAiB: String(ai.score_breakdown.B),
    scoreAiC: String(ai.score_breakdown.C),
    scoreAiD: String(ai.score_breakdown.D),
    scoreOpA: op ? String(op.score_breakdown.A) : null,
    scoreOpB: op ? String(op.score_breakdown.B) : null,
    scoreOpC: op ? String(op.score_breakdown.C) : null,
    scoreOpD: op ? String(op.score_breakdown.D) : null,
    bestVersion: params.scored.comparison.best_version,
    passOnline: online.pass_for_publish ? 1 : 0,
    passAi: ai.pass_for_publish ? 1 : 0,
    passOp: op ? (op.pass_for_publish ? 1 : 0) : null,
    keyDeltas,
    issuesFlags: buildIssueFlags(params.scored),
    aiModel: env.aiModel,
    aiPromptVersion: env.aiPromptVersion,
    snapshotOnline: snapshotText(params.input.About_online),
    snapshotAi: snapshotText(params.input.About_ai),
    snapshotOp: snapshotText(params.input.About_op),
    errorReason: null,
  });

  await db.update(uploadBatches).set({ rowCount: 1 }).where(eq(uploadBatches.id, params.batchId));
}

export async function startIngestJob(batchId: string, fileName: string, fileBase64: string) {
  const batchRows = await db.select().from(uploadBatches).where(eq(uploadBatches.id, batchId));
  const moduleId = (batchRows[0]?.moduleId || "about") as "about" | "faq";
  const outputMode = (batchRows[0]?.outputMode || "full") as OutputMode;
  const rows = moduleId === "faq" ? parseFaqUploadFile(fileName, fileBase64) : parseUploadFile(fileName, fileBase64);
  const merchantTotal =
    moduleId === "faq"
      ? new Set(rows.map((row) => String(row.TermID || "").trim() || String(row.Domain || "").trim())).size
      : rows.length;
  ingestPayloadByBatch.set(batchId, rows);
  const jobId = makeId();
  await ensureIngestJobsColumns();
  await db.insert(ingestJobs).values({
    id: jobId,
    batchId,
    status: "pending",
    merchantTotal,
    totalRows: rows.length,
    doneRows: 0,
    failedRows: 0,
    elapsedMs: 0,
    etaSeconds: 0,
    promptTokensSum: 0,
    completionTokensSum: 0,
    totalTokensSum: 0,
    estimatedCostUsdSum: "0",
    predictedTotalTokens: 0,
    predictedCostUsd: "0",
    errorReason: null,
  });
  pendingIngestJobsByModule[moduleId].push({ jobId, batchId, rows, moduleId, outputMode });
  void processPendingIngestJobs(moduleId);
  return { jobId, totalRows: rows.length };
}

async function processPendingIngestJobs(moduleId: ModuleId) {
  if (ingestRunnerWorkingByModule[moduleId]) return;
  ingestRunnerWorkingByModule[moduleId] = true;

  try {
    while (pendingIngestJobsByModule[moduleId].length > 0) {
      const next = pendingIngestJobsByModule[moduleId].shift();
      if (!next) break;

      const latestRows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, next.jobId));
      const latest = latestRows[0];
      if (!latest) continue;
      if (latest.status === "cancelled" || latest.status === "done" || latest.status === "failed") continue;

      await db
        .update(ingestJobs)
        .set({ status: "running" })
        .where(and(eq(ingestJobs.id, next.jobId), eq(ingestJobs.status, "pending")));

      const startedRows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, next.jobId));
      if (startedRows[0]?.status !== "running") continue;
      try {
        await runIngest(next.jobId, next.batchId, next.rows, next.outputMode);
      } catch (error) {
        const reason = `job failed: ${errorMessage(error)}`.slice(0, 512);
        await backfillMissingErrorRows(next.batchId, next.rows, reason, { since: startedRows[0]?.startedAt });
        const stats = await aggregateBatchRows(next.batchId);
        const totalRows = Math.max(0, Number(startedRows[0]?.totalRows || next.rows.length));
        const doneRows = totalRows > 0 ? Math.min(stats.doneRows, totalRows) : stats.doneRows;
        const failedRows = totalRows > 0 ? Math.min(stats.failedRows, totalRows) : stats.failedRows;
        await db.update(uploadBatches).set({ rowCount: stats.successRows }).where(eq(uploadBatches.id, next.batchId));
        await db
          .update(ingestJobs)
          .set({
            status: "failed",
            finishedAt: new Date(),
            etaSeconds: 0,
            doneRows,
            failedRows,
            errorReason: reason,
          })
          .where(eq(ingestJobs.id, next.jobId));
      }
    }
  } finally {
    ingestRunnerWorkingByModule[moduleId] = false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryBackoffMs(attempt: number, baseMs: number, maxMs: number) {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(maxMs, baseMs * 2 ** attempt + jitter);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTransientFailureMessage(messageRaw: string) {
  const message = String(messageRaw || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econn") ||
    message.includes("socket") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function scoreWithRetries(
  input: ManualScoreInput,
  options?: { maxRetries?: number; baseMs?: number; maxMs?: number; outputMode?: OutputMode },
) {
  const maxRetries = Math.max(0, options?.maxRetries ?? env.ingestRowMaxRetries);
  const baseMs = Math.max(100, options?.baseMs ?? env.ingestRowRetryBaseMs);
  const maxMs = Math.max(baseMs, options?.maxMs ?? env.ingestRowRetryMaxMs);
  const errors: string[] = [];
  const hasOp = Boolean(input.About_op?.trim());
  const requestTimeoutMs = hasOp ? Math.max(env.aiRequestTimeoutMsBatch, 120_000) : env.aiRequestTimeoutMsBatch;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await scoreAboutByAiWithMeta(input, { requestTimeoutMs, outputMode: options?.outputMode ?? "full" });
    } catch (error) {
      errors.push(`attempt${attempt + 1}: ${errorMessage(error)}`);
      if (attempt >= maxRetries) break;
      await sleep(retryBackoffMs(attempt, baseMs, maxMs));
    }
  }

  throw new Error(`row retries exhausted: ${errors.join(" | ")}`);
}

async function runIngest(jobId: string, batchId: string, rows: ParsedUploadRow[], outputMode: OutputMode) {
  const batchRows = await db.select().from(uploadBatches).where(eq(uploadBatches.id, batchId));
  const moduleId = (batchRows[0]?.moduleId || "about") as "about" | "faq";
  let finalizedDone = 0;
  let primaryProcessed = 0;
  let failed = 0;
  let success = 0;
  let promptTokensSum = 0;
  let completionTokensSum = 0;
  let totalTokensSum = 0;
  let estimatedCostUsdSum = 0;
  const startedAtMs = Date.now();
  const failedCandidates: Array<{ row: ParsedUploadRow; input: ManualScoreInput; error: unknown }> = [];
  let transientFailureStreak = 0;
  let throttleUntilMs = 0;
  const adaptiveThrottleEnabled = env.ingestAdaptiveThrottleEnabled;
  const failureStreakThreshold = Math.max(1, env.ingestFailureStreakThreshold);
  const throttleMs = Math.max(0, env.ingestThrottleMs);

  const concurrency = Math.max(1, env.ingestRowConcurrency);
  let cursor = 0;
  let lastFlushAt = 0;

  const isCancelled = async () => {
    const latest = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
    return latest[0]?.status === "cancelled";
  };

  const flushProgress = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlushAt < env.ingestProgressFlushMs) return;
    lastFlushAt = now;
    const elapsedMs = now - startedAtMs;
    const avgRowMs = primaryProcessed > 0 ? elapsedMs / primaryProcessed : 0;
    const remainRows = Math.max(0, rows.length - finalizedDone);
    const etaSeconds = Math.max(0, Math.round((avgRowMs * remainRows) / 1000));
    const predictedTotalTokens =
      primaryProcessed > 0 ? Math.round(totalTokensSum + (totalTokensSum / primaryProcessed) * remainRows) : 0;
    const predictedCostUsd =
      primaryProcessed > 0 ? estimatedCostUsdSum + (estimatedCostUsdSum / primaryProcessed) * remainRows : 0;

    await db
      .update(ingestJobs)
      .set({
        doneRows: finalizedDone,
        failedRows: failed,
        elapsedMs,
        etaSeconds,
        promptTokensSum,
        completionTokensSum,
        totalTokensSum,
        estimatedCostUsdSum: String(Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000),
        predictedTotalTokens,
        predictedCostUsd: String(Math.round(predictedCostUsd * 1_000_000) / 1_000_000),
      })
      .where(eq(ingestJobs.id, jobId));
  };

  const heartbeatMs = 15_000;
  const heartbeat = setInterval(() => {
    void db
      .update(ingestJobs)
      .set({ elapsedMs: Math.max(0, Date.now() - startedAtMs) })
      .where(and(eq(ingestJobs.id, jobId), eq(ingestJobs.status, "running")));
  }, heartbeatMs);

  try {

  const worker = async () => {
    while (true) {
      if (adaptiveThrottleEnabled && throttleUntilMs > Date.now()) {
        await sleep(throttleUntilMs - Date.now());
      }

      if (await isCancelled()) return;
      const index = cursor;
      cursor += 1;
      if (index >= rows.length) return;
      const row = rows[index];
      const input: ManualScoreInput = {
        moduleId,
        TermID: row.TermID,
        TermName: row.TermName,
        Domain: row.Domain,
        Country: row.Country,
        About_online: row.About_online,
        About_ai: row.About_ai,
        About_op: row.About_op || "",
        batchNote: "",
        saveToHistory: false,
      };

      try {
        const scored = await scoreWithRetries(input, { outputMode });

        if (await isCancelled()) return;

        await insertScoreRow(batchId, row, scored.output, scored.diagnostics?.issueFlags);
        success += 1;
        finalizedDone += 1;
        promptTokensSum += scored.runtime.promptTokens;
        completionTokensSum += scored.runtime.completionTokens;
        totalTokensSum += scored.runtime.totalTokens;
        estimatedCostUsdSum += scored.runtime.estimatedCostUsd;
        transientFailureStreak = 0;
      } catch (error) {
        if (await isCancelled()) return;
        failedCandidates.push({ row, input, error });

        if (adaptiveThrottleEnabled) {
          const message = errorMessage(error);
          if (isTransientFailureMessage(message)) {
            transientFailureStreak += 1;
            if (transientFailureStreak >= failureStreakThreshold) {
              throttleUntilMs = Date.now() + throttleMs;
              transientFailureStreak = 0;
            }
          } else {
            transientFailureStreak = 0;
          }
        }
      }

      primaryProcessed += 1;
      await flushProgress(false);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, () => worker()));

  let pendingFailures = failedCandidates;
  const finalRetryPasses = Math.max(0, env.ingestFinalRetryPasses);

  for (let pass = 1; pass <= finalRetryPasses && pendingFailures.length > 0; pass += 1) {
    if (await isCancelled()) break;

    const nextFailures: typeof pendingFailures = [];
    const passBaseMs = env.ingestRowRetryBaseMs * (pass + 1);
    let passCursor = 0;
    const finalRetryConcurrency = Math.max(
      1,
      Math.min(env.ingestFinalRetryConcurrency, concurrency, pendingFailures.length),
    );

    const retryWorker = async () => {
      while (true) {
        if (await isCancelled()) return;
        const index = passCursor;
        passCursor += 1;
        if (index >= pendingFailures.length) return;
        const candidate = pendingFailures[index];

        try {
          const scored = await scoreWithRetries(candidate.input, {
            maxRetries: env.ingestRowMaxRetries + 1,
            baseMs: passBaseMs,
            maxMs: env.ingestRowRetryMaxMs * 2,
            outputMode,
          });

          if (await isCancelled()) return;

          await insertScoreRow(batchId, candidate.row, scored.output, scored.diagnostics?.issueFlags);
          success += 1;
          finalizedDone += 1;
          promptTokensSum += scored.runtime.promptTokens;
          completionTokensSum += scored.runtime.completionTokens;
          totalTokensSum += scored.runtime.totalTokens;
          estimatedCostUsdSum += scored.runtime.estimatedCostUsd;
        } catch (error) {
          nextFailures.push({ row: candidate.row, input: candidate.input, error });
        }

        await flushProgress(false);
      }
    };

    await Promise.all(Array.from({ length: finalRetryConcurrency }, () => retryWorker()));

    pendingFailures = nextFailures;
    await flushProgress(true);
  }

  for (const candidate of pendingFailures) {
    if (await isCancelled()) break;
    await insertErrorRow(batchId, candidate.row, candidate.error);
    failed += 1;
    finalizedDone += 1;
    await flushProgress(false);
  }

  await flushProgress(true);

  const finalJobRows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
  if (finalJobRows[0]?.status === "cancelled") {
    await db
      .update(ingestJobs)
      .set({ finishedAt: new Date(), etaSeconds: 0 })
      .where(eq(ingestJobs.id, jobId));
    return;
  }

  await db.update(uploadBatches).set({ rowCount: success }).where(eq(uploadBatches.id, batchId));
  const finalStatus = "done";
  await db
    .update(ingestJobs)
    .set({
      status: finalStatus,
      finishedAt: new Date(),
      etaSeconds: 0,
      predictedTotalTokens: totalTokensSum,
      predictedCostUsd: String(Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000),
    })
    .where(eq(ingestJobs.id, jobId));
  } finally {
    clearInterval(heartbeat);
  }
}

async function ensureIngestJobsColumns() {
  const ddl = [
    "ALTER TABLE ingest_jobs ADD COLUMN merchant_total int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN elapsed_ms int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN eta_seconds int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN prompt_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN completion_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN total_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN estimated_cost_usd_sum decimal(12,6) NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN predicted_total_tokens int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN predicted_cost_usd decimal(12,6) NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN error_reason varchar(512) NULL",
  ];

  for (const sqlText of ddl) {
    try {
      await db.execute(sql.raw(sqlText));
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes("duplicate") && !message.includes("exists")) {
      }
    }
  }
}

async function ensureAboutScoreRowsColumns() {
  const ddl = ["ALTER TABLE about_score_rows ADD COLUMN term_name varchar(255) NOT NULL DEFAULT ''"];

  for (const sqlText of ddl) {
    try {
      await db.execute(sql.raw(sqlText));
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes("duplicate") && !message.includes("exists")) {
      }
    }
  }
}

async function insertScoreRow(
  batchId: string,
  row: ParsedUploadRow,
  scored: ScoreOutput,
  issueFlagsOverride?: ScoreIssueFlags,
) {
  await ensureAboutScoreRowsColumns();
  const byVersion = Object.fromEntries(scored.results.map((item) => [item.version, item])) as Record<string, ScoreOutput["results"][number]>;
  const online = byVersion.online;
  const ai = byVersion.ai;
  const op = byVersion.op;
  const keyDeltas = ensureKeyDeltas(scored);

  await db.insert(aboutScoreRows).values({
    id: makeId(),
    batchId,
    termId: row.TermID,
    termName: row.TermName,
    domain: row.Domain,
    country: row.Country,
    hashOnline: sha256(row.About_online || ""),
    hashAi: sha256(row.About_ai || ""),
    hashOp: row.About_op?.trim() ? sha256(row.About_op) : null,
    scoreOnlineTotal: String(online.score_total),
    scoreAiTotal: String(ai.score_total),
    scoreOpTotal: op ? String(op.score_total) : null,
    scoreOnlineA: String(online.score_breakdown.A),
    scoreOnlineB: String(online.score_breakdown.B),
    scoreOnlineC: String(online.score_breakdown.C),
    scoreOnlineD: String(online.score_breakdown.D),
    scoreAiA: String(ai.score_breakdown.A),
    scoreAiB: String(ai.score_breakdown.B),
    scoreAiC: String(ai.score_breakdown.C),
    scoreAiD: String(ai.score_breakdown.D),
    scoreOpA: op ? String(op.score_breakdown.A) : null,
    scoreOpB: op ? String(op.score_breakdown.B) : null,
    scoreOpC: op ? String(op.score_breakdown.C) : null,
    scoreOpD: op ? String(op.score_breakdown.D) : null,
    bestVersion: scored.comparison.best_version,
    passOnline: online.pass_for_publish ? 1 : 0,
    passAi: ai.pass_for_publish ? 1 : 0,
    passOp: op ? (op.pass_for_publish ? 1 : 0) : null,
    keyDeltas,
    issuesFlags: issueFlagsOverride ?? buildIssueFlags(scored),
    aiModel: env.aiModel,
    aiPromptVersion: env.aiPromptVersion,
    snapshotOnline: snapshotText(row.About_online),
    snapshotAi: snapshotText(row.About_ai),
    snapshotOp: snapshotText(row.About_op),
    errorReason: null,
  });
}

function ensureKeyDeltas(scored: ScoreOutput) {
  const deltas = (scored.comparison.key_deltas || [])
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
  if (deltas.length > 0) return deltas;

  const byVersion = Object.fromEntries(scored.results.map((item) => [item.version, item])) as Record<
    string,
    ScoreOutput["results"][number]
  >;
  const online = byVersion.online;
  const ai = byVersion.ai;
  const op = byVersion.op;
  const fallback: string[] = [];

  if (online && ai) {
    const aiLift = Math.round((ai.score_total - online.score_total) * 10) / 10;
    fallback.push(`AI相较线上分差 ${aiLift >= 0 ? "+" : ""}${aiLift}`);
  }
  if (ai && op) {
    const opLift = Math.round((op.score_total - ai.score_total) * 10) / 10;
    fallback.push(`OP相较AI分差 ${opLift >= 0 ? "+" : ""}${opLift}`);
  }
  if (!fallback.length) fallback.push(`最优版本：${scored.comparison.best_version}`);

  return fallback;
}

async function insertErrorRow(batchId: string, row: ParsedUploadRow, error: unknown) {
  await ensureAboutScoreRowsColumns();
  await db.insert(aboutScoreRows).values({
    id: makeId(),
    batchId,
    termId: row.TermID,
    termName: row.TermName,
    domain: row.Domain,
    country: row.Country,
    hashOnline: sha256(row.About_online || ""),
    hashAi: sha256(row.About_ai || ""),
    hashOp: row.About_op?.trim() ? sha256(row.About_op) : null,
    scoreOnlineTotal: "0.0",
    scoreAiTotal: "0.0",
    scoreOpTotal: null,
    scoreOnlineA: "0.0",
    scoreOnlineB: "0.0",
    scoreOnlineC: "0.0",
    scoreOnlineD: "0.0",
    scoreAiA: "0.0",
    scoreAiB: "0.0",
    scoreAiC: "0.0",
    scoreAiD: "0.0",
    scoreOpA: null,
    scoreOpB: null,
    scoreOpC: null,
    scoreOpD: null,
    bestVersion: "",
    passOnline: 0,
    passAi: 0,
    passOp: null,
    keyDeltas: [],
    issuesFlags: { failed: true },
    aiModel: env.aiModel,
    aiPromptVersion: env.aiPromptVersion,
    snapshotOnline: snapshotText(row.About_online),
    snapshotAi: snapshotText(row.About_ai),
    snapshotOp: snapshotText(row.About_op),
    errorReason: error instanceof Error ? error.message.slice(0, 512) : "unknown error",
  });
}

function buildIssueFlags(output: ScoreOutput) {
  const text = output.results.flatMap((item) => item.weaknesses).join(" ").toLowerCase();
  return {
    mer_missing: text.includes("{mer") || text.includes("未使用"),
    first_person: text.includes("第一人称") || text.includes("first person"),
    lang_mismatch: text.includes("语言") || text.includes("language"),
    too_short: text.includes("过短") || text.includes("too short"),
    too_long: text.includes("过长") || text.includes("too long"),
    keyword_missing: text.includes("关键词缺失") || text.includes("keyword missing"),
    keyword_stuffing: text.includes("堆砌") || text.includes("stuffing"),
    ai_tone: text.includes("模板腔") || text.includes("ai tone"),
    localization_bad: text.includes("本土化") || text.includes("localization"),
  };
}

export async function getIngestStatus(jobId: string) {
  await markStalledJobsAsFailed();
  const rows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
  if (!rows.length) throw new Error("job 不存在");
  return rows[0];
}

export async function listIngestJobs(page = 1, pageSize = 20, moduleId?: "about" | "faq") {
  await markStalledJobsAsFailed();
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(50, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const rows = await db.select().from(ingestJobs).orderBy(desc(ingestJobs.startedAt));
  const batchRows = await db.select().from(uploadBatches);
  const moduleByBatchId = new Map(batchRows.map((item) => [item.id, String(item.moduleId || "about")]));
  const filtered = moduleId
    ? rows.filter((item) => moduleByBatchId.get(item.batchId) === moduleId)
    : rows;
  return {
    total: filtered.length,
    page: safePage,
    pageSize: safePageSize,
    rows: filtered.slice(offset, offset + safePageSize),
  };
}

export async function cancelIngestJob(jobId: string) {
  await db
    .update(ingestJobs)
    .set({ status: "cancelled", finishedAt: new Date(), etaSeconds: 0 })
    .where(and(eq(ingestJobs.id, jobId), inArray(ingestJobs.status, ["pending", "running"])));
  return { ok: true };
}

export async function retryIngestJob(jobId: string) {
  await ensureIngestJobsColumns();
  const rows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
  if (!rows.length) throw new Error("job 不存在");
  const job = rows[0];

  const payloadRows = ingestPayloadByBatch.get(job.batchId);
  if (!payloadRows || payloadRows.length === 0) {
    throw new Error("当前任务不可重试，请重新上传文件");
  }

  await db.update(uploadBatches).set({ rowCount: 0 }).where(eq(uploadBatches.id, job.batchId));

  const newJobId = makeId();
  const batchRows = await db.select().from(uploadBatches).where(eq(uploadBatches.id, job.batchId));
  const moduleId = (batchRows[0]?.moduleId || "about") as "about" | "faq";
  const outputMode = (batchRows[0]?.outputMode || "full") as OutputMode;
  const merchantTotal =
    moduleId === "faq"
      ? new Set(payloadRows.map((row) => String(row.TermID || "").trim() || String(row.Domain || "").trim())).size
      : payloadRows.length;
  await db.insert(ingestJobs).values({
    id: newJobId,
    batchId: job.batchId,
    status: "pending",
    merchantTotal,
    totalRows: payloadRows.length,
    doneRows: 0,
    failedRows: 0,
    elapsedMs: 0,
    etaSeconds: 0,
    promptTokensSum: 0,
    completionTokensSum: 0,
    totalTokensSum: 0,
    estimatedCostUsdSum: "0",
    predictedTotalTokens: 0,
    predictedCostUsd: "0",
    errorReason: null,
  });
  pendingIngestJobsByModule[moduleId].push({ jobId: newJobId, batchId: job.batchId, rows: payloadRows, moduleId, outputMode });
  void processPendingIngestJobs(moduleId);

  return { ok: true, newJobId };
}

async function markStalledJobsAsFailed() {
  await ensureIngestJobsColumns();
  const pendingOrRunningRows = await db
    .select()
    .from(ingestJobs)
    .where(inArray(ingestJobs.status, ["pending", "running"]));
  const batchRows = await db.select().from(uploadBatches);
  const moduleByBatchId = new Map(batchRows.map((item) => [item.id, String(item.moduleId || "about")]));

  const runningModules = new Set(
    pendingOrRunningRows
      .filter((item) => item.status === "running")
      .map((item) => moduleByBatchId.get(item.batchId) || "about"),
  );

  const nowMs = Date.now();
  for (const row of pendingOrRunningRows) {
    if (row.status === "pending") {
      const moduleId = moduleByBatchId.get(row.batchId) || "about";
      if (runningModules.has(moduleId)) {
        continue;
      }
    }

    const updatedAtMs = new Date(row.updatedAt as unknown as string | Date).getTime();
    if (nowMs - updatedAtMs > ingestJobStallMs) {
      const reason = `job stalled over ${Math.round(ingestJobStallMs / 1000)}s and marked as failed`;
      const payloadRows = ingestPayloadByBatch.get(row.batchId) || [];
      await backfillMissingErrorRows(row.batchId, payloadRows, reason, { since: row.startedAt });
      const stats = await aggregateBatchRows(row.batchId);
      const totalRows = Math.max(0, Number(row.totalRows || 0));
      const doneRows = totalRows > 0 ? Math.min(stats.doneRows, totalRows) : stats.doneRows;
      const failedRows = totalRows > 0 ? Math.min(stats.failedRows, totalRows) : stats.failedRows;
      await db.update(uploadBatches).set({ rowCount: stats.successRows }).where(eq(uploadBatches.id, row.batchId));
      await db
        .update(ingestJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          etaSeconds: 0,
          doneRows,
          failedRows,
          errorReason: reason,
        })
        .where(eq(ingestJobs.id, row.id));
    }
  }
}

export async function getBatchResult(batchId: string) {
  await ensureAboutScoreRowsColumns();
  const rawRows = await db.select().from(aboutScoreRows).where(eq(aboutScoreRows.batchId, batchId));
  const rows = dedupeStoredRowsKeepLatest(rawRows);
  const validRows = rows.filter((row) => !row.errorReason);
  const failedRows = rows.filter((row) => row.errorReason);
  const passMetrics = collectPassMetrics(validRows);
  const opEligibleRows = validRows.filter((row) => row.scoreOpTotal != null);
  const rowCount = rows.length;

  const failureReasonStats = failedRows.reduce(
    (acc, row) => {
      const category = classifyFailureReason(row.errorReason);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const avg = (items: RowSelect[], key: keyof RowSelect) => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
    return Math.round((sum / items.length) * 10) / 10;
  };

  const avgOnline = avg(validRows, "scoreOnlineTotal");
  const avgAi = avg(validRows, "scoreAiTotal");
  const avgOp = avg(validRows.filter((item) => item.scoreOpTotal !== null), "scoreOpTotal");
  const bestCounts = validRows.reduce(
    (acc, item) => {
      const best = item.bestVersion as "online" | "ai" | "op";
      if (best === "online" || best === "ai" || best === "op") {
        acc[best] += 1;
      }
      return acc;
    },
    { online: 0, ai: 0, op: 0 },
  );

  return {
    summary: {
      rowCount,
      failedRows: failedRows.length,
      failureReasonStats,
      publishPassCount: passMetrics.publishPassCount,
      publishPassRate: passMetrics.publishPassRate,
      avgOnline,
      avgAi,
      avgOp: opEligibleRows.length ? avgOp : null,
      aiOnlineLift: Math.round((avgAi - avgOnline) * 10) / 10,
      opAiLift: opEligibleRows.length ? Math.round((avgOp - avgAi) * 10) / 10 : null,
      validRowCount: passMetrics.validRowCount,
      opEligibleRowCount: passMetrics.opEligibleRowCount,
      onlinePassCount: passMetrics.onlinePassCount,
      aiPassCount: passMetrics.aiPassCount,
      opPassCount: passMetrics.opPassCount,
      onlinePassRate: passMetrics.onlinePassRate,
      aiPassRate: passMetrics.aiPassRate,
      opPassRate: passMetrics.opPassRate,
      aiPassLift: passMetrics.aiPassLift,
      bestVersionShare: {
        online: passMetrics.validRowCount ? bestCounts.online / passMetrics.validRowCount : 0,
        ai: passMetrics.validRowCount ? bestCounts.ai / passMetrics.validRowCount : 0,
        op: passMetrics.validRowCount ? bestCounts.op / passMetrics.validRowCount : 0,
      },
    },
    rows,
  };
}

export async function getBatchModuleId(batchId: string) {
  const rows = await db.select().from(uploadBatches).where(eq(uploadBatches.id, batchId));
  return (rows[0]?.moduleId || "about") as "about" | "faq";
}

export function buildExportRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const failed = Boolean(row.errorReason);
    const failureCategory = failed ? classifyFailureReason(row.errorReason) : "";
    const aiScore = Number(row.scoreAiTotal || 0);
    const opScore = Number(row.scoreOpTotal || 0);
    const passByScore = aiScore >= 8 || opScore >= 8;
    const keyDeltasRaw = Array.isArray(row.keyDeltas) ? row.keyDeltas : [];
    const keyDeltasText = keyDeltasRaw
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0)
      .join("；");
    return {
      批次ID: row.batchId ?? "",
      TermID: row.termId ?? "",
      TermName: row.termName ?? "",
      Domain: row.domain ?? "",
      Country: row.country ?? "",
      线上总分: row.scoreOnlineTotal ?? "",
      AI总分: row.scoreAiTotal ?? "",
      OP总分: row.scoreOpTotal ?? "",
      是否可发布: passByScore ? "是" : "否",
      最优版本: row.bestVersion ?? "",
      关键差异: keyDeltasText,
      状态: failed ? "失败" : "成功",
      失败分类: failureCategory,
      失败原因: row.errorReason ?? "",
      创建时间: row.createdAt ?? "",
    };
  });
}

function classifyFailureReason(reasonRaw: unknown) {
  const text = String(reasonRaw || "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("429") || text.includes("rate limit") || text.includes("限流")) return "rate_limit";
  if (text.includes("timeout") || text.includes("timed out") || text.includes("abort")) return "timeout";
  if (text.includes("network") || text.includes("fetch") || text.includes("econn") || text.includes("socket")) return "network";
  if (text.includes("校验失败") || text.includes("json") || text.includes("schema") || text.includes("validator")) {
    return "validation";
  }
  if (
    text.includes("500") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("service unavailable")
  ) {
    return "ai_service";
  }
  if (text.includes("sql") || text.includes("drizzle") || text.includes("database") || text.includes("insert")) {
    return "db_write";
  }
  return "unknown";
}

function trimBlankEdgeLines(value: unknown) {
  const text = String(value ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;

  return lines.slice(start, end).join("\n");
}

function parseFaqSnapshot(rawText: unknown) {
  const normalized = trimBlankEdgeLines(rawText);
  if (!normalized) {
    return {
      question: "",
      answer: "",
      subclass: "",
    };
  }

  const buckets: Record<"q" | "a" | "subclass", string[]> = {
    q: [],
    a: [],
    subclass: [],
  };
  let current: keyof typeof buckets | null = null;

  for (const line of normalized.split("\n")) {
    const marker = line.match(/^\s*(Q|A|Subclass)\s*:\s*(.*)$/i);
    if (marker) {
      const keyRaw = marker[1].toLowerCase();
      const key: keyof typeof buckets = keyRaw === "q" ? "q" : keyRaw === "a" ? "a" : "subclass";
      current = key;
      buckets[key].push(marker[2] || "");
      continue;
    }

    if (current) {
      buckets[current].push(line);
    }
  }

  const question = trimBlankEdgeLines(buckets.q.join("\n"));
  const answer = trimBlankEdgeLines(buckets.a.join("\n"));
  const subclass = trimBlankEdgeLines(buckets.subclass.join("\n"));

  if (!question && !answer && !subclass) {
    return {
      question: "",
      answer: normalized,
      subclass: "",
    };
  }

  return { question, answer, subclass };
}

function buildPublishAboutRows(rows: Array<Record<string, unknown>>) {
  const headers = [
    "ContentType",
    "Country",
    "TermID",
    "TermName",
    "Domain",
    "Source",
    "板块名称",
    "Titile1",
    "Brief Introduction",
    "Subtitle1",
    "Paragraph1",
    "Subtitle2",
    "Paragraph2",
    "Subtitle3",
    "Paragraph3",
    "Subtitle4",
    "Paragraph4",
    "Subtitle5",
    "Paragraph5",
    "Subtitle6",
    "Paragraph6",
    "Subtitle7",
    "Paragraph7",
    "Subtitle8",
    "Paragraph8",
    "Conclusion",
  ] as const;

  const blank = Object.fromEntries(headers.map((key) => [key, ""])) as Record<(typeof headers)[number], string>;

  return rows
    .filter((row) => !row.errorReason)
    .map((row) => {
      const aiScore = Number(row.scoreAiTotal || 0);
      const opScore = Number(row.scoreOpTotal || 0);
      const aiPass = aiScore >= 8;
      const opPass = opScore >= 8;
      if (!aiPass && !opPass) return null;

      const useOp = opPass && (!aiPass || opScore > aiScore);
      const brief = trimBlankEdgeLines(useOp ? row.snapshotOp || "" : row.snapshotAi || "");

      return {
        ...blank,
        ContentType: "About",
        Country: String(row.country || ""),
        TermID: String(row.termId || ""),
        TermName: String(row.termName || ""),
        Domain: String(row.domain || ""),
        Source: "AI",
        板块名称: publishAboutSectionName,
        "Brief Introduction": brief,
      };
    })
    .filter(Boolean) as Array<Record<(typeof headers)[number], string>>;
}

function buildSummaryRowsZh(summary: Record<string, unknown>) {
  const pick = (key: string) => summary[key] ?? "";
  const hasOp = Number(summary["opEligibleRowCount"] || 0) > 0;
  const rows = [
    { 指标: "总行数", 数值: String(pick("rowCount")) },
    { 指标: "成功行数", 数值: String(pick("validRowCount")) },
    { 指标: "失败行数", 数值: String(pick("failedRows")) },
    { 指标: "通过数量", 数值: String(pick("publishPassCount")) },
    { 指标: "通过率(%)", 数值: String(pick("publishPassRate")) },
    { 指标: "线上平均分", 数值: String(pick("avgOnline")) },
    { 指标: "AI平均分", 数值: String(pick("avgAi")) },
    { 指标: "AI-线上提升", 数值: String(pick("aiOnlineLift")) },
  ];

  if (hasOp) {
    rows.push({ 指标: "OP平均分", 数值: String(pick("avgOp")) });
    rows.push({ 指标: "OP-AI提升", 数值: String(pick("opAiLift")) });
  }

  const statsRaw = summary["failureReasonStats"];
  if (statsRaw && typeof statsRaw === "object" && !Array.isArray(statsRaw)) {
    const stats = statsRaw as Record<string, unknown>;
    const labels: Record<string, string> = {
      rate_limit: "失败分类.rate_limit(限流)",
      timeout: "失败分类.timeout(超时)",
      network: "失败分类.network(网络)",
      validation: "失败分类.validation(校验)",
      ai_service: "失败分类.ai_service(服务端)",
      db_write: "失败分类.db_write(写库)",
      unknown: "失败分类.unknown(未知)",
    };
    for (const [key, value] of Object.entries(stats)) {
      rows.push({ 指标: labels[key] || `失败分类.${key}`, 数值: String(value ?? 0) });
    }
  }

  return rows;
}

function flattenSummaryObject(input: Record<string, unknown>, prefix = ""): Array<{ metric: string; value: string }> {
  const result: Array<{ metric: string; value: string }> = [];
  for (const [key, value] of Object.entries(input)) {
    const metric = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result.push(...flattenSummaryObject(value as Record<string, unknown>, metric));
      continue;
    }
    result.push({ metric, value: value == null ? "" : String(value) });
  }
  return result;
}

export function toXlsx(rows: Array<Record<string, unknown>>, summary: Record<string, unknown>) {
  const workbook = XLSX.utils.book_new();
  const resultSheet = XLSX.utils.json_to_sheet(buildExportRows(rows));
  XLSX.utils.book_append_sheet(workbook, resultSheet, "结果明细");

  const statsSheet = XLSX.utils.json_to_sheet(buildSummaryRowsZh(summary));
  XLSX.utils.book_append_sheet(workbook, statsSheet, "结果统计");

  const publishSheet = XLSX.utils.json_to_sheet(buildPublishAboutRows(rows), {
    header: [
      "ContentType",
      "Country",
      "TermID",
      "TermName",
      "Domain",
      "Source",
      "板块名称",
      "Titile1",
      "Brief Introduction",
      "Subtitle1",
      "Paragraph1",
      "Subtitle2",
      "Paragraph2",
      "Subtitle3",
      "Paragraph3",
      "Subtitle4",
      "Paragraph4",
      "Subtitle5",
      "Paragraph5",
      "Subtitle6",
      "Paragraph6",
      "Subtitle7",
      "Paragraph7",
      "Subtitle8",
      "Paragraph8",
      "Conclusion",
    ],
  });
  XLSX.utils.book_append_sheet(workbook, publishSheet, "可发布About");

  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}

export function toXlsxByModule(
  moduleId: "about" | "faq",
  rows: Array<Record<string, unknown>>,
  summary: Record<string, unknown>,
) {
  if (moduleId === "about") return toXlsx(rows, summary);

  const workbook = XLSX.utils.book_new();
  const resultSheet = XLSX.utils.json_to_sheet(buildExportRows(rows));
  XLSX.utils.book_append_sheet(workbook, resultSheet, "结果明细");

  const statsSheet = XLSX.utils.json_to_sheet(buildSummaryRowsZh(summary));
  XLSX.utils.book_append_sheet(workbook, statsSheet, "结果统计");

  const faqPassRows = rows
    .filter((row) => !row.errorReason)
    .filter((row) => Number(row.passAi || 0) === 1 || Number(row.passOp || 0) === 1)
    .map((row) => {
      const opScore = Number(row.scoreOpTotal || 0);
      const aiScore = Number(row.scoreAiTotal || 0);
      const useOp = Number(row.passOp || 0) === 1 && opScore >= aiScore;
      const source = "AI";
      const rawText = useOp ? row.snapshotOp || row.snapshotAi || "" : row.snapshotAi || "";
      const parsed = parseFaqSnapshot(rawText);

      return {
        ContentType: "faq",
        Country: String(row.country || ""),
        TermID: String(row.termId || ""),
        TermName: String(row.termName || ""),
        Domain: String(row.domain || ""),
        Source: source,
        Subclass: parsed.subclass,
        板块名称: "faq",
        Titile1: parsed.question,
        "Brief Introduction": parsed.answer,
        "Href Kw": "",
        "Href Url": "",
      };
    });

  const passSheet = XLSX.utils.json_to_sheet(faqPassRows, {
    header: [
      "ContentType",
      "Country",
      "TermID",
      "TermName",
      "Domain",
      "Source",
      "Subclass",
      "板块名称",
      "Titile1",
      "Brief Introduction",
      "Href Kw",
      "Href Url",
    ],
  });
  XLSX.utils.book_append_sheet(workbook, passSheet, "可发布FAQ");

  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}

export async function listBatches(filters: {
  page?: number;
  pageSize?: number;
  unpaged?: boolean;
  moduleId?: string;
  uploader?: string;
  batchId?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}) {
  await ensureUploadBatchesColumns();
  await ensureIngestJobsColumns();
  await ensureAboutScoreRowsColumns();
  const all = await db.select().from(uploadBatches).orderBy(desc(uploadBatches.createdAt));
  const allJobs = await db.select().from(ingestJobs).orderBy(desc(ingestJobs.startedAt));
  const latestJobByBatch = new Map<string, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!latestJobByBatch.has(job.batchId)) latestJobByBatch.set(job.batchId, job);
  }

  const matched = all.filter((item) => {
    const latestJob = latestJobByBatch.get(item.id);
    if (filters.moduleId && String(item.moduleId || "about") !== filters.moduleId) return false;
    if (filters.uploader && item.uploader !== filters.uploader) return false;
    if (filters.batchId && item.id !== filters.batchId) return false;
    if (filters.startDate && new Date(item.createdAt) < new Date(filters.startDate)) return false;
    if (filters.endDate && new Date(item.createdAt) > new Date(filters.endDate)) return false;
    return true;
  });

  const result: Array<{
    id: string;
    uploader: string;
    note: string;
    createdAt: Date;
    rowCount: number;
    validRowCount: number;
    opEligibleRowCount: number;
    hasOpData: boolean;
    publishPassCount: number;
    publishPassRate: number;
    avgOnline: number;
    avgAi: number;
    avgOp: number;
    aiOnlineLift: number;
    opAiLift: number;
    onlinePassCount: number;
    aiPassCount: number;
    opPassCount: number;
    onlinePassRate: number;
    aiPassRate: number;
    opPassRate: number | null;
    aiPassLift: number;
    merchantCount?: number;
    merchantPublishPassCount?: number;
    merchantPublishPassRate?: number;
    overallTrend?: "better" | "worse" | "flat";
  }> = [];

  const matchedBatchIds = matched.map((item) => item.id);
  const rowsByBatch = new Map<string, RowSelect[]>();
  if (matchedBatchIds.length) {
    const rows = await db.select().from(aboutScoreRows).where(inArray(aboutScoreRows.batchId, matchedBatchIds));
    for (const row of rows) {
      const existing = rowsByBatch.get(row.batchId) || [];
      existing.push(row);
      rowsByBatch.set(row.batchId, existing);
    }
  }

  for (const batch of matched) {
    const rows = dedupeStoredRowsKeepLatest(rowsByBatch.get(batch.id) || []);
    const scopedRows = filters.country ? rows.filter((item) => item.country === filters.country) : rows;
    const validRows = scopedRows.filter((item) => !item.errorReason);
    if (!validRows.length) continue;

    const avg = (key: keyof RowSelect) => {
      if (!validRows.length) return 0;
      const sum = validRows.reduce((acc, item) => acc + Number(item[key] || 0), 0);
      return Math.round((sum / validRows.length) * 10) / 10;
    };

    const avgOnline = avg("scoreOnlineTotal");
    const avgAi = avg("scoreAiTotal");
    const opRows = validRows.filter((item) => item.scoreOpTotal !== null);
    const avgOp = opRows.length ? Math.round((opRows.reduce((acc, item) => acc + Number(item.scoreOpTotal || 0), 0) / opRows.length) * 10) / 10 : 0;
    const passMetrics = collectPassMetrics(validRows);
    const hasOpData = passMetrics.hasOpData;
    const moduleId = String(batch.moduleId || "about");

    let merchantCount = 0;
    let merchantPublishPassCount = 0;
    let merchantPublishPassRate = 0;
    let overallTrend: "better" | "worse" | "flat" = "flat";

    if (moduleId === "faq") {
      const merchantMap = new Map<string, RowSelect[]>();
      for (const row of validRows) {
        const key = String(row.termId || "").trim() || String(row.domain || "").trim();
        const list = merchantMap.get(key) || [];
        list.push(row);
        merchantMap.set(key, list);
      }
      merchantCount = merchantMap.size;
      let better = 0;
      let worse = 0;
      for (const list of merchantMap.values()) {
        let onlineSum = 0;
        let targetSum = 0;
        let publish = false;
        for (const row of list) {
          const onlineScore = Number(row.scoreOnlineTotal || 0);
          const aiScore = Number(row.scoreAiTotal || 0);
          const opScore = row.scoreOpTotal == null ? Number.NEGATIVE_INFINITY : Number(row.scoreOpTotal || 0);
          onlineSum += onlineScore;
          targetSum += Math.max(aiScore, Number.isFinite(opScore) ? opScore : Number.NEGATIVE_INFINITY);
          if (Number(row.passAi || 0) === 1 || Number(row.passOp || 0) === 1) publish = true;
        }
        const size = Math.max(1, list.length);
        const onlineAvg = onlineSum / size;
        const targetAvg = targetSum / size;
        if (targetAvg > onlineAvg) better += 1;
        else if (targetAvg < onlineAvg) worse += 1;
        if (publish) merchantPublishPassCount += 1;
      }
      merchantPublishPassRate = merchantCount ? Math.round((merchantPublishPassCount / merchantCount) * 1000) / 10 : 0;
      if (better > worse) overallTrend = "better";
      else if (worse > better) overallTrend = "worse";
    }

    result.push({
      id: batch.id,
      uploader: batch.uploader,
      note: batch.note ?? "",
      createdAt: batch.createdAt,
      rowCount: validRows.length,
      validRowCount: passMetrics.validRowCount,
      opEligibleRowCount: passMetrics.opEligibleRowCount,
      hasOpData,
      publishPassCount: passMetrics.publishPassCount,
      publishPassRate: passMetrics.publishPassRate,
      avgOnline,
      avgAi,
      avgOp,
      aiOnlineLift: Math.round((avgAi - avgOnline) * 10) / 10,
      opAiLift: hasOpData ? Math.round((avgOp - avgAi) * 10) / 10 : 0,
      onlinePassCount: passMetrics.onlinePassCount,
      aiPassCount: passMetrics.aiPassCount,
      opPassCount: passMetrics.opPassCount,
      onlinePassRate: passMetrics.onlinePassRate,
      aiPassRate: passMetrics.aiPassRate,
      opPassRate: hasOpData ? passMetrics.opPassRate : null,
      aiPassLift: passMetrics.aiPassLift,
      merchantCount,
      merchantPublishPassCount,
      merchantPublishPassRate,
      overallTrend,
    });
  }

  const safePage = Math.max(1, filters.page || 1);
  const safePageSize = filters.unpaged ? Math.max(1, result.length || 1) : Math.max(1, Math.min(20, filters.pageSize || 20));
  const offset = (safePage - 1) * safePageSize;

  return {
    total: result.length,
    page: safePage,
    pageSize: safePageSize,
    rows: result.slice(offset, offset + safePageSize),
  };
}

export async function getBatchDetail(batchId: string, page: number, pageSize: number) {
  await ensureAboutScoreRowsColumns();
  const offset = (page - 1) * pageSize;
  const rawRows = await db.select().from(aboutScoreRows).where(eq(aboutScoreRows.batchId, batchId));
  const rows = dedupeStoredRowsKeepLatest(rawRows);
  return {
    total: rows.length,
    page,
    pageSize,
    rows: rows.slice(offset, offset + pageSize),
  };
}

export async function analyticsSummary(filters: {
  moduleId?: string;
  uploader?: string;
  batchId?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}) {
  await ensureAboutScoreRowsColumns();
  const batches = await listBatches({ ...filters, unpaged: true, moduleId: filters.moduleId });
  const batchIds = new Set(batches.rows.map((item) => item.id));
  const allRows = await db.select().from(aboutScoreRows);
  const dedupedRows = dedupeStoredRowsKeepLatest(allRows);
  const rows = dedupedRows.filter((item) => batchIds.has(item.batchId));
  const scopedRows = filters.country ? rows.filter((item) => item.country === filters.country) : rows;
  const validRows = scopedRows.filter((item) => !item.errorReason);
  const passMetrics = collectPassMetrics(validRows);
  const opEligibleRows = validRows.filter((item) => item.scoreOpTotal != null);

  const avgOnRows = (targetRows: RowSelect[], key: keyof RowSelect) => {
    const values = targetRows
      .map((item) => item[key])
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return 0;
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round((sum / values.length) * 10) / 10;
  };

  const avg = (key: keyof RowSelect) => avgOnRows(validRows, key);
  const avgOpEligible = (key: keyof RowSelect) => avgOnRows(opEligibleRows, key);

  const best = validRows.reduce(
    (acc, item) => {
      const bestVersion = item.bestVersion as "online" | "ai" | "op";
      if (bestVersion === "online" || bestVersion === "ai" || bestVersion === "op") {
        acc[bestVersion] += 1;
      }
      return acc;
    },
    { online: 0, ai: 0, op: 0 },
  );

  const bestOpSubset = opEligibleRows.reduce(
    (acc, item) => {
      const bestVersion = item.bestVersion as "online" | "ai" | "op";
      if (bestVersion === "online" || bestVersion === "ai" || bestVersion === "op") {
        acc[bestVersion] += 1;
      }
      return acc;
    },
    { online: 0, ai: 0, op: 0 },
  );

  const bucketRanges = [
    { label: "0-5", min: 0, max: 5 },
    { label: "5-6", min: 5, max: 6 },
    { label: "6-7", min: 6, max: 7 },
    { label: "7-8", min: 7, max: 8 },
    { label: "8-9", min: 8, max: 9 },
    { label: "9-10", min: 9, max: 10.1 },
  ];

  const makeBuckets = () => bucketRanges.map((item) => ({ ...item, count: 0 }));
  const distributionByVersion = {
    online: makeBuckets(),
    ai: makeBuckets(),
    op: makeBuckets(),
  };

  const fill = (version: "online" | "ai" | "op", scoreRaw: unknown) => {
    if (scoreRaw === null || scoreRaw === undefined || scoreRaw === "") return;
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) return;
    const bucket = distributionByVersion[version].find((item) => score >= item.min && score < item.max);
    if (bucket) bucket.count += 1;
  };

  for (const item of validRows) {
    fill("online", item.scoreOnlineTotal);
    fill("ai", item.scoreAiTotal);
    fill("op", item.scoreOpTotal);
  }

  const moduleId = String(filters.moduleId || "about");
  let merchantCount = 0;
  let merchantPublishPassCount = 0;
  let merchantPublishPassRate = 0;
  let overallTrend: "better" | "worse" | "flat" = "flat";

  if (moduleId === "faq") {
    const merchantMap = new Map<string, RowSelect[]>();
    for (const row of validRows) {
      const key = String(row.termId || "").trim() || String(row.domain || "").trim();
      const list = merchantMap.get(key) || [];
      list.push(row);
      merchantMap.set(key, list);
    }
    merchantCount = merchantMap.size;
    let better = 0;
    let worse = 0;
    for (const list of merchantMap.values()) {
      let onlineSum = 0;
      let targetSum = 0;
      let publish = false;
      for (const row of list) {
        const onlineScore = Number(row.scoreOnlineTotal || 0);
        const aiScore = Number(row.scoreAiTotal || 0);
        const opScore = row.scoreOpTotal == null ? Number.NEGATIVE_INFINITY : Number(row.scoreOpTotal || 0);
        onlineSum += onlineScore;
        targetSum += Math.max(aiScore, Number.isFinite(opScore) ? opScore : Number.NEGATIVE_INFINITY);
        if (Number(row.passAi || 0) === 1 || Number(row.passOp || 0) === 1) publish = true;
      }
      const size = Math.max(1, list.length);
      const onlineAvg = onlineSum / size;
      const targetAvg = targetSum / size;
      if (targetAvg > onlineAvg) better += 1;
      else if (targetAvg < onlineAvg) worse += 1;
      if (publish) merchantPublishPassCount += 1;
    }
    merchantPublishPassRate = merchantCount ? Math.round((merchantPublishPassCount / merchantCount) * 1000) / 10 : 0;
    if (better > worse) overallTrend = "better";
    else if (worse > better) overallTrend = "worse";
  }

  return {
    versionAverages: {
      online: avg("scoreOnlineTotal"),
      ai: avg("scoreAiTotal"),
      op: avgOpEligible("scoreOpTotal"),
    },
    bestVersionShare: best,
    metrics: {
      totalValidRows: validRows.length,
      opEligibleRows: opEligibleRows.length,
      opCoverage: validRows.length ? Math.round((opEligibleRows.length / validRows.length) * 1000) / 10 : 0,
      passMetrics: {
        validRowCount: passMetrics.validRowCount,
        opEligibleRowCount: passMetrics.opEligibleRowCount,
        publishPassCount: passMetrics.publishPassCount,
        publishPassRate: passMetrics.publishPassRate,
        onlinePassCount: passMetrics.onlinePassCount,
        aiPassCount: passMetrics.aiPassCount,
        opPassCount: passMetrics.opPassCount,
        onlinePassRate: passMetrics.onlinePassRate,
        aiPassRate: passMetrics.aiPassRate,
        opPassRate: passMetrics.opPassRate,
        aiPassLift: passMetrics.aiPassLift,
        opPassLift: passMetrics.opPassLift,
      },
      overall: {
        versionAverages: {
          online: avg("scoreOnlineTotal"),
          ai: avg("scoreAiTotal"),
          op: avgOpEligible("scoreOpTotal"),
        },
        bestVersionShare: best,
      },
      opSubset: {
        versionAverages: {
          online: avgOpEligible("scoreOnlineTotal"),
          ai: avgOpEligible("scoreAiTotal"),
          op: avgOpEligible("scoreOpTotal"),
        },
        bestVersionShare: bestOpSubset,
      },
      faqMerchant: {
        merchantCount,
        merchantPublishPassCount,
        merchantPublishPassRate,
        overallTrend,
      },
    },
    scoreDistribution: distributionByVersion.ai,
    scoreDistributionByVersion: distributionByVersion,
  };
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = row[header] == null ? "" : String(row[header]);
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}
