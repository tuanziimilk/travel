import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { contentGenerationJobs } from "../db/schema";

type RouteSummaryRow = {
  factType: string;
  count: number;
  skillLabel: string;
  skillKey: string;
  source: string;
  notes: string;
  executable: boolean;
};

type RowRuntimeResult = {
  rowIndex: number;
  status: "success" | "error";
  subclass: string;
  factType: string;
  routeKey: string;
  error?: string;
  runtime?: {
    elapsedMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    aiModel: string;
  };
};

export async function createGenerationJob(input: {
  scType: string;
  uploader: string;
  note: string;
  inputFileName: string;
  inputFileBase64: string;
}) {
  const { makeId } = await import("../utils/id");
  const id = makeId();

  await db.insert(contentGenerationJobs).values({
    id,
    capability: "generation",
    scType: input.scType,
    uploader: input.uploader,
    note: input.note,
    inputFileName: input.inputFileName,
    inputFileBase64: input.inputFileBase64,
    status: "running",
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    errorReason: null,
  });

  return { jobId: id };
}

export async function markGenerationJobRunning(jobId: string) {
  await db
    .update(contentGenerationJobs)
    .set({
      status: "running",
      errorReason: null,
      totalRows: 0,
      executableRows: 0,
      successRows: 0,
      failedRows: 0,
      skippedRows: 0,
      promptTokensSum: 0,
      completionTokensSum: 0,
      totalTokensSum: 0,
      estimatedCostUsdSum: "0",
      aiModel: "",
      resultFileName: "",
      resultFileBase64: null,
      routeSummaryJson: null,
      rowResultsJson: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

export async function completeGenerationJob(input: {
  jobId: string;
  status: "done" | "failed";
  subclass: string;
  totalRows: number;
  executableRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  promptTokensSum: number;
  completionTokensSum: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  aiModel: string;
  resultFileName: string;
  resultFileBase64: string;
  routeSummary: RouteSummaryRow[];
  rowResults: RowRuntimeResult[];
  errorReason?: string;
}) {
  await db
    .update(contentGenerationJobs)
    .set({
      status: input.status,
      subclass: input.subclass,
      totalRows: input.totalRows,
      executableRows: input.executableRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      skippedRows: input.skippedRows,
      promptTokensSum: input.promptTokensSum,
      completionTokensSum: input.completionTokensSum,
      totalTokensSum: input.totalTokensSum,
      estimatedCostUsdSum: String(input.estimatedCostUsdSum),
      aiModel: input.aiModel,
      resultFileName: input.resultFileName,
      resultFileBase64: input.resultFileBase64,
      routeSummaryJson: input.routeSummary,
      rowResultsJson: input.rowResults,
      errorReason: input.errorReason || null,
      finishedAt: new Date(),
    })
    .where(eq(contentGenerationJobs.id, input.jobId));
}

export async function failGenerationJob(jobId: string, message: string) {
  await db
    .update(contentGenerationJobs)
    .set({
      status: "failed",
      errorReason: message,
      rowResultsJson: [{ rowIndex: 0, status: "error", subclass: "", factType: "", routeKey: "", error: message }],
      finishedAt: new Date(),
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

export async function listGenerationJobs(page: number, pageSize: number, scType = "faq") {
  const rows = await db
    .select()
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.scType, scType))
    .orderBy(desc(contentGenerationJobs.createdAt));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const sliced = rows.slice(start, start + pageSize);

  return {
    total,
    rows: sliced.map((row) => ({
      id: row.id,
      status: row.status,
      scType: row.scType,
      uploader: row.uploader,
      note: row.note,
      inputFileName: row.inputFileName,
      totalRows: row.totalRows,
      executableRows: row.executableRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      skippedRows: row.skippedRows,
      totalTokensSum: row.totalTokensSum,
      estimatedCostUsdSum: Number(row.estimatedCostUsdSum || 0),
      aiModel: row.aiModel,
      errorReason: row.errorReason || "",
      resultFileName: row.resultFileName,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
    })),
  };
}

export async function getGenerationJobResult(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  return {
    id: row.id,
    fileName: row.resultFileName || `faq-output-${row.id}.xlsx`,
    xlsxBase64: row.resultFileBase64 || "",
    status: row.status,
    routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
    rowResults: (row.rowResultsJson as RowRuntimeResult[] | null) || [],
    summary: {
      totalRows: row.totalRows,
      executableRows: row.executableRows,
      successRows: row.successRows,
      failedRows: row.failedRows,
      skippedRows: row.skippedRows,
      promptTokens: row.promptTokensSum,
      completionTokens: row.completionTokensSum,
      totalTokens: row.totalTokensSum,
      estimatedCostUsd: Number(row.estimatedCostUsdSum || 0),
      aiModel: row.aiModel,
    },
  };
}

export async function getGenerationJobStatus(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  return {
    id: row.id,
    status: row.status,
    uploader: row.uploader,
    note: row.note,
    inputFileName: row.inputFileName,
    totalRows: row.totalRows,
    executableRows: row.executableRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    skippedRows: row.skippedRows,
    promptTokensSum: row.promptTokensSum,
    completionTokensSum: row.completionTokensSum,
    totalTokensSum: row.totalTokensSum,
    estimatedCostUsdSum: Number(row.estimatedCostUsdSum || 0),
    aiModel: row.aiModel,
    errorReason: row.errorReason || "",
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
  };
}

export async function getGenerationJobForRetry(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  return {
    id: row.id,
    scType: row.scType,
    uploader: row.uploader,
    note: row.note,
    inputFileName: row.inputFileName,
    inputFileBase64: row.inputFileBase64 || "",
  };
}
