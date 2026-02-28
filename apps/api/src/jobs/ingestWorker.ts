import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { desc, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { ManualScoreInput, ScoreOutput, uploaderSchema } from "@about-demo/trpc";
import { db } from "../db/client";
import { aboutScoreRows, ingestJobs, uploadBatches } from "../db/schema";
import { makeId } from "../utils/id";
import { scoreAboutByAiWithMeta } from "../scoring/aboutAiScorer";
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

const ingestPayloadByBatch = new Map<string, ParsedUploadRow[]>();
const pendingIngestJobs: Array<{ jobId: string; batchId: string; rows: ParsedUploadRow[] }> = [];
let ingestRunnerWorking = false;
const publishAboutSectionName = "About";

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
  uploader: string;
  note?: string;
  source?: "upload" | "manual";
}) {
  uploaderSchema.parse(params.uploader);
  const id = makeId();
  await ensureUploadBatchesColumns();

  try {
    await db.insert(uploadBatches).values({
      id,
      uploader: params.uploader,
      source: params.source ?? "upload",
      note: (params.note ?? "").slice(0, 255),
      rowCount: 0,
    });
  } catch {
    // 兜底兼容旧库结构：即便 source/note 不存在，也保证能创建 batch
    await db.insert(uploadBatches).values({
      id,
      uploader: params.uploader,
      rowCount: 0,
    });
  }
  return { batchId: id };
}

async function ensureUploadBatchesColumns() {
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
    snapshotOnline: env.snapshotEnabled ? (params.input.About_online || "").slice(0, 512) : null,
    snapshotAi: env.snapshotEnabled ? (params.input.About_ai || "").slice(0, 512) : null,
    snapshotOp: env.snapshotEnabled ? (params.input.About_op || "").slice(0, 512) : null,
    errorReason: null,
  });

  await db.update(uploadBatches).set({ rowCount: 1 }).where(eq(uploadBatches.id, params.batchId));
}

export async function startIngestJob(batchId: string, fileName: string, fileBase64: string) {
  const rows = parseUploadFile(fileName, fileBase64);
  ingestPayloadByBatch.set(batchId, rows);
  const jobId = makeId();
  await ensureIngestJobsColumns();
  await db.insert(ingestJobs).values({
    id: jobId,
    batchId,
    status: "pending",
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
  });
  pendingIngestJobs.push({ jobId, batchId, rows });
  void processPendingIngestJobs();
  return { jobId, totalRows: rows.length };
}

async function processPendingIngestJobs() {
  if (ingestRunnerWorking) return;
  ingestRunnerWorking = true;

  try {
    while (pendingIngestJobs.length > 0) {
      const next = pendingIngestJobs.shift();
      if (!next) break;

      await db.update(ingestJobs).set({ status: "running" }).where(eq(ingestJobs.id, next.jobId));
      await runIngest(next.jobId, next.batchId, next.rows);
    }
  } finally {
    ingestRunnerWorking = false;
  }
}

async function runIngest(jobId: string, batchId: string, rows: ParsedUploadRow[]) {
  let done = 0;
  let failed = 0;
  let success = 0;
  let promptTokensSum = 0;
  let completionTokensSum = 0;
  let totalTokensSum = 0;
  let estimatedCostUsdSum = 0;
  const startedAtMs = Date.now();

  const concurrency = Math.max(1, env.ingestRowConcurrency);
  let cursor = 0;
  let lastFlushAt = 0;

  const flushProgress = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlushAt < env.ingestProgressFlushMs) return;
    lastFlushAt = now;
    const elapsedMs = now - startedAtMs;
    const avgRowMs = done > 0 ? elapsedMs / done : 0;
    const remainRows = Math.max(0, rows.length - done);
    const etaSeconds = Math.max(0, Math.round((avgRowMs * remainRows) / 1000));
    const predictedTotalTokens = done > 0 ? Math.round(totalTokensSum + (totalTokensSum / done) * remainRows) : 0;
    const predictedCostUsd = done > 0 ? estimatedCostUsdSum + (estimatedCostUsdSum / done) * remainRows : 0;

    await db
      .update(ingestJobs)
      .set({
        doneRows: done,
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

  const worker = async () => {
    while (true) {
      const latest = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
      if (latest[0]?.status === "cancelled") return;
      const index = cursor;
      cursor += 1;
      if (index >= rows.length) return;
      const row = rows[index];

      try {
        const input: ManualScoreInput = {
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
        const scored = await scoreAboutByAiWithMeta(input);
        await insertScoreRow(batchId, row, scored.output);
        success += 1;
        promptTokensSum += scored.runtime.promptTokens;
        completionTokensSum += scored.runtime.completionTokens;
        totalTokensSum += scored.runtime.totalTokens;
        estimatedCostUsdSum += scored.runtime.estimatedCostUsd;
      } catch {
        failed += 1;
      }

      done += 1;
      await flushProgress(false);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, () => worker()));
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
  await db
    .update(ingestJobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      etaSeconds: 0,
      predictedTotalTokens: totalTokensSum,
      predictedCostUsd: String(Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000),
    })
    .where(eq(ingestJobs.id, jobId));
}

async function ensureIngestJobsColumns() {
  const ddl = [
    "ALTER TABLE ingest_jobs ADD COLUMN elapsed_ms int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN eta_seconds int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN prompt_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN completion_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN total_tokens_sum int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN estimated_cost_usd_sum decimal(12,6) NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN predicted_total_tokens int NOT NULL DEFAULT 0",
    "ALTER TABLE ingest_jobs ADD COLUMN predicted_cost_usd decimal(12,6) NOT NULL DEFAULT 0",
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

async function insertScoreRow(batchId: string, row: ParsedUploadRow, scored: ScoreOutput) {
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
    issuesFlags: buildIssueFlags(scored),
    aiModel: env.aiModel,
    aiPromptVersion: env.aiPromptVersion,
    snapshotOnline: env.snapshotEnabled ? row.About_online.slice(0, 512) : null,
    snapshotAi: env.snapshotEnabled ? row.About_ai.slice(0, 512) : null,
    snapshotOp: env.snapshotEnabled ? (row.About_op || "").slice(0, 512) : null,
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
    bestVersion: "online",
    passOnline: 0,
    passAi: 0,
    passOp: null,
    keyDeltas: [],
    issuesFlags: { failed: true },
    aiModel: env.aiModel,
    aiPromptVersion: env.aiPromptVersion,
    snapshotOnline: env.snapshotEnabled ? row.About_online.slice(0, 512) : null,
    snapshotAi: env.snapshotEnabled ? row.About_ai.slice(0, 512) : null,
    snapshotOp: env.snapshotEnabled ? (row.About_op || "").slice(0, 512) : null,
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

export async function listIngestJobs(page = 1, pageSize = 20) {
  await markStalledJobsAsFailed();
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(50, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const rows = await db.select().from(ingestJobs).orderBy(desc(ingestJobs.startedAt));
  return {
    total: rows.length,
    page: safePage,
    pageSize: safePageSize,
    rows: rows.slice(offset, offset + safePageSize),
  };
}

export async function cancelIngestJob(jobId: string) {
  await db
    .update(ingestJobs)
    .set({ status: "cancelled", finishedAt: new Date(), etaSeconds: 0 })
    .where(eq(ingestJobs.id, jobId));
  return { ok: true };
}

export async function retryIngestJob(jobId: string) {
  const rows = await db.select().from(ingestJobs).where(eq(ingestJobs.id, jobId));
  if (!rows.length) throw new Error("job 不存在");
  const job = rows[0];

  const payloadRows = ingestPayloadByBatch.get(job.batchId);
  if (!payloadRows || payloadRows.length === 0) {
    throw new Error("当前任务不可重试，请重新上传文件");
  }

  await db.delete(aboutScoreRows).where(eq(aboutScoreRows.batchId, job.batchId));
  await db.update(uploadBatches).set({ rowCount: 0 }).where(eq(uploadBatches.id, job.batchId));

  const newJobId = makeId();
  await db.insert(ingestJobs).values({
    id: newJobId,
    batchId: job.batchId,
    status: "pending",
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
  });
  pendingIngestJobs.push({ jobId: newJobId, batchId: job.batchId, rows: payloadRows });
  void processPendingIngestJobs();

  return { ok: true, newJobId };
}

async function markStalledJobsAsFailed() {
  const runningRows = await db.select().from(ingestJobs).where(eq(ingestJobs.status, "running"));
  const nowMs = Date.now();
  for (const row of runningRows) {
    const updatedAtMs = new Date(row.updatedAt as unknown as string | Date).getTime();
    if (nowMs - updatedAtMs > 5 * 60 * 1000) {
      await db
        .update(ingestJobs)
        .set({ status: "failed", finishedAt: new Date() })
        .where(eq(ingestJobs.id, row.id));
    }
  }
}

export async function getBatchResult(batchId: string) {
  await ensureAboutScoreRowsColumns();
  const rows = await db.select().from(aboutScoreRows).where(eq(aboutScoreRows.batchId, batchId));
  const validRows = rows.filter((row) => !row.errorReason);
  const passMetrics = collectPassMetrics(validRows);
  const opEligibleRows = validRows.filter((row) => row.scoreOpTotal != null);
  const rowCount = rows.length;

  const avg = (items: RowSelect[], key: keyof RowSelect) => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
    return Math.round((sum / items.length) * 10) / 10;
  };

  const avgOnline = avg(validRows, "scoreOnlineTotal");
  const avgAi = avg(validRows, "scoreAiTotal");
  const avgOp = avg(validRows.filter((item) => item.scoreOpTotal !== null), "scoreOpTotal");
  const bestCounts = rows.reduce(
    (acc, item) => {
      acc[item.bestVersion as "online" | "ai" | "op"] += 1;
      return acc;
    },
    { online: 0, ai: 0, op: 0 },
  );

  return {
    summary: {
      rowCount,
      failedRows: rows.filter((item) => item.errorReason).length,
      publishPassCount: passMetrics.publishPassCount,
      publishPassRate: passMetrics.publishPassRate,
      avgOnline,
      avgAi,
      avgOp,
      aiOnlineLift: Math.round((avgAi - avgOnline) * 10) / 10,
      opAiLift: Math.round((avgOp - avgAi) * 10) / 10,
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
        online: rowCount ? bestCounts.online / rowCount : 0,
        ai: rowCount ? bestCounts.ai / rowCount : 0,
        op: rowCount ? bestCounts.op / rowCount : 0,
      },
    },
    rows,
  };
}

export function buildExportRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const failed = Boolean(row.errorReason);
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
      失败原因: row.errorReason ?? "",
      创建时间: row.createdAt ?? "",
    };
  });
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
      const brief = String(useOp ? row.snapshotOp || "" : row.snapshotAi || "");

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
  return [
    { 指标: "总行数", 数值: String(pick("rowCount")) },
    { 指标: "成功行数", 数值: String(pick("validRowCount")) },
    { 指标: "失败行数", 数值: String(pick("failedRows")) },
    { 指标: "通过数量", 数值: String(pick("publishPassCount")) },
    { 指标: "通过率(%)", 数值: String(pick("publishPassRate")) },
    { 指标: "线上平均分", 数值: String(pick("avgOnline")) },
    { 指标: "AI平均分", 数值: String(pick("avgAi")) },
    { 指标: "OP平均分", 数值: String(pick("avgOp")) },
    { 指标: "AI-线上提升", 数值: String(pick("aiOnlineLift")) },
    { 指标: "OP-AI提升", 数值: String(pick("opAiLift")) },
  ];
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

export async function listBatches(filters: {
  page?: number;
  pageSize?: number;
  unpaged?: boolean;
  uploader?: string;
  batchId?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}) {
  await ensureUploadBatchesColumns();
  await ensureAboutScoreRowsColumns();
  const all = await db.select().from(uploadBatches).orderBy(desc(uploadBatches.createdAt));
  const allJobs = await db.select().from(ingestJobs).orderBy(desc(ingestJobs.startedAt));
  const latestJobByBatch = new Map<string, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!latestJobByBatch.has(job.batchId)) latestJobByBatch.set(job.batchId, job);
  }

  const matched = all.filter((item) => {
    const latestJob = latestJobByBatch.get(item.id);
    if (latestJob?.status === "cancelled") return false;
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
    const rows = rowsByBatch.get(batch.id) || [];
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
  const rows = await db.select().from(aboutScoreRows).where(eq(aboutScoreRows.batchId, batchId));
  return {
    total: rows.length,
    page,
    pageSize,
    rows: rows.slice(offset, offset + pageSize),
  };
}

export async function analyticsSummary(filters: {
  uploader?: string;
  batchId?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}) {
  await ensureAboutScoreRowsColumns();
  const batches = await listBatches({ ...filters, unpaged: true });
  const batchIds = new Set(batches.rows.map((item) => item.id));
  const allRows = await db.select().from(aboutScoreRows);
  const rows = allRows.filter((item) => batchIds.has(item.batchId));
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
      acc[item.bestVersion as "online" | "ai" | "op"] += 1;
      return acc;
    },
    { online: 0, ai: 0, op: 0 },
  );

  const bestOpSubset = opEligibleRows.reduce(
    (acc, item) => {
      acc[item.bestVersion as "online" | "ai" | "op"] += 1;
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
