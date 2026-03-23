import { desc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
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

type StoredFaqOutputRow = {
  jobId: string;
  uploader: string;
  note: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  ContentType: string;
  Country: string;
  TermID: string;
  TermName: string;
  Domain: string;
  Source: string;
  Subclass: string;
  板块名称: string;
  Titile1: string;
  "Brief Introduction": string;
  "Href Kw": string;
  "Href Url": string;
};

type HistoryFilters = {
  scType?: string;
  country?: string;
  subclass?: string;
  uploader?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

const parsedWorkbookCache = new Map<string, StoredFaqOutputRow[]>();

function normalize(value: unknown) {
  return String(value || "").trim();
}

function normalizeCountry(value: unknown) {
  return normalize(value).toUpperCase();
}

function getWorkbookCacheKey(row: {
  id: string;
  resultFileName: string;
  finishedAt: Date | null;
  updatedAt: Date;
}) {
  return [row.id, row.resultFileName || "", row.finishedAt?.toISOString() || "", row.updatedAt.toISOString()].join("::");
}

function mapStoredOutputRow(
  row: Record<string, unknown>,
  meta: {
    jobId: string;
    uploader: string;
    note: string;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  },
): StoredFaqOutputRow {
  return {
    ...meta,
    ContentType: normalize(row.ContentType),
    Country: normalizeCountry(row.Country),
    TermID: normalize(row.TermID),
    TermName: normalize(row.TermName),
    Domain: normalize(row.Domain),
    Source: normalize(row.Source),
    Subclass: normalize(row.Subclass),
    板块名称: normalize(row["板块名称"]),
    Titile1: normalize(row.Titile1),
    "Brief Introduction": normalize(row["Brief Introduction"]),
    "Href Kw": normalize(row["Href Kw"]),
    "Href Url": normalize(row["Href Url"]),
  };
}

function parseStoredWorkbook(row: {
  id: string;
  uploader: string;
  note: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  resultFileName: string;
  resultFileBase64: string | null;
  updatedAt: Date;
}) {
  const cacheKey = getWorkbookCacheKey(row);
  const cached = parsedWorkbookCache.get(cacheKey);
  if (cached) return cached;

  if (!row.resultFileBase64) {
    parsedWorkbookCache.set(cacheKey, []);
    return [];
  }

  const workbook = XLSX.read(Buffer.from(row.resultFileBase64, "base64"), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const parsed = rows.map((item) =>
    mapStoredOutputRow(item, {
      jobId: row.id,
      uploader: row.uploader,
      note: row.note,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    }),
  );

  parsedWorkbookCache.set(cacheKey, parsed);
  return parsed;
}

async function listDoneGenerationRows(scType = "faq") {
  const rows = await db
    .select()
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.scType, scType))
    .orderBy(desc(contentGenerationJobs.createdAt));

  return rows
    .filter((row) => (row.status === "done" || row.status === "failed") && row.resultFileBase64)
    .flatMap((row) => parseStoredWorkbook(row));
}

function filterHistoryRows(rows: StoredFaqOutputRow[], input: HistoryFilters) {
  const country = normalize(input.country).toUpperCase();
  const subclass = normalize(input.subclass).toLowerCase();
  const uploader = normalize(input.uploader);
  const keyword = normalize(input.keyword).toLowerCase();
  const startDate = normalize(input.startDate);
  const endDate = normalize(input.endDate);
  const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NaN;
  const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.NaN;

  return rows.filter((row) => {
    if (country && row.Country.toUpperCase() !== country) return false;
    if (subclass && row.Subclass.toLowerCase() !== subclass) return false;
    if (uploader && row.uploader !== uploader) return false;
    const rowTime = (row.finishedAt || row.createdAt).getTime();
    if (Number.isFinite(startMs) && rowTime < startMs) return false;
    if (Number.isFinite(endMs) && rowTime > endMs) return false;
    if (keyword) {
      const haystack = [
        row.Country,
        row.Subclass,
        row.TermID,
        row.TermName,
        row.Domain,
        row.Titile1,
        row["Brief Introduction"],
        row.note,
        row.uploader,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function buildHistoryExportRows(rows: StoredFaqOutputRow[]) {
  return rows.map((row) => ({
    jobId: row.jobId,
    uploader: row.uploader,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() || "",
    ContentType: row.ContentType,
    Country: row.Country,
    TermID: row.TermID,
    TermName: row.TermName,
    Domain: row.Domain,
    Source: row.Source,
    Subclass: row.Subclass,
    板块名称: row["板块名称"],
    Titile1: row.Titile1,
    "Brief Introduction": row["Brief Introduction"],
    "Href Kw": row["Href Kw"],
    "Href Url": row["Href Url"],
  }));
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
}

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

export async function getGenerationHistorySummary(input: HistoryFilters) {
  const allRows = await listDoneGenerationRows(input.scType || "faq");
  const filteredRows = filterHistoryRows(allRows, input);
  const uniqueKeys = new Set(filteredRows.map((row) => `${row.Country}::${row.TermID}`));

  const byCountryMap = new Map<string, { rowCount: number; uniqueKeys: Set<string>; subclasses: Set<string> }>();
  const bySubclassMap = new Map<string, { rowCount: number; uniqueKeys: Set<string>; countries: Set<string> }>();

  for (const row of filteredRows) {
    const uniqueKey = `${row.Country}::${row.TermID}`;

    const countryBucket = byCountryMap.get(row.Country) || {
      rowCount: 0,
      uniqueKeys: new Set<string>(),
      subclasses: new Set<string>(),
    };
    countryBucket.rowCount += 1;
    countryBucket.uniqueKeys.add(uniqueKey);
    countryBucket.subclasses.add(row.Subclass);
    byCountryMap.set(row.Country, countryBucket);

    const subclassBucket = bySubclassMap.get(row.Subclass) || {
      rowCount: 0,
      uniqueKeys: new Set<string>(),
      countries: new Set<string>(),
    };
    subclassBucket.rowCount += 1;
    subclassBucket.uniqueKeys.add(uniqueKey);
    subclassBucket.countries.add(row.Country);
    bySubclassMap.set(row.Subclass, subclassBucket);
  }

  const byCountry = Array.from(byCountryMap.entries())
    .map(([country, bucket]) => ({
      country,
      rowCount: bucket.rowCount,
      uniqueResultCount: bucket.uniqueKeys.size,
      subclassCount: bucket.subclasses.size,
    }))
    .sort((a, b) => b.uniqueResultCount - a.uniqueResultCount || a.country.localeCompare(b.country));

  const bySubclass = Array.from(bySubclassMap.entries())
    .map(([subclass, bucket]) => ({
      subclass,
      rowCount: bucket.rowCount,
      uniqueResultCount: bucket.uniqueKeys.size,
      countryCount: bucket.countries.size,
    }))
    .sort((a, b) => b.uniqueResultCount - a.uniqueResultCount || a.subclass.localeCompare(b.subclass));

  return {
    summary: {
      totalRows: filteredRows.length,
      uniqueResultCount: uniqueKeys.size,
      countryCount: byCountry.length,
      subclassCount: bySubclass.length,
    },
    byCountry,
    bySubclass,
  };
}

export async function listGenerationHistoryRows(input: HistoryFilters) {
  const allRows = await listDoneGenerationRows(input.scType || "faq");
  const filteredRows = filterHistoryRows(allRows, input).sort((a, b) => {
    const left = b.finishedAt?.getTime() || b.createdAt.getTime();
    const right = a.finishedAt?.getTime() || a.createdAt.getTime();
    return left - right;
  });

  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.max(1, Number(input.pageSize || 20));
  const start = (page - 1) * pageSize;
  const sliced = filteredRows.slice(start, start + pageSize);

  return {
    total: filteredRows.length,
    rows: sliced,
  };
}

export async function exportGenerationHistory(input: HistoryFilters & { format?: "xlsx" | "csv" }) {
  const allRows = await listDoneGenerationRows(input.scType || "faq");
  const filteredRows = filterHistoryRows(allRows, input);
  const exportRows = buildHistoryExportRows(filteredRows);
  const fileStem = `faq-history-${Date.now()}`;

  if ((input.format || "xlsx") === "csv") {
    return {
      fileName: `${fileStem}.csv`,
      mimeType: "text/csv;charset=utf-8",
      contentBase64: Buffer.from(toCsv(exportRows), "utf8").toString("base64"),
    };
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "FAQ历史记录");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    fileName: `${fileStem}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: Buffer.from(buffer).toString("base64"),
  };
}
