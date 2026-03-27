import type { RowDataPacket } from "mysql2/promise";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { db, pool } from "../db/client";
import { contentGenerationJobs } from "../db/schema";
import { formatChinaDateTime, formatChinaIsoOffset } from "../utils/time";
import {
  getPersistedGenerationSummary,
  listPersistedGenerationRows,
  listPersistedHistoryJobIds,
  listPersistedHistoryRows,
} from "./faqOutputRowStore";

const FAQ_BOARD_NAME_FIELD = "板块名称" as const;

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
  [FAQ_BOARD_NAME_FIELD]: string;
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

function buildPersistedHistoryWhere(input: HistoryFilters) {
  const conditions = ["j.sc_type = ?", "r.status = 'success'"];
  const params: unknown[] = [input.scType || "faq"];

  const country = normalize(input.country).toUpperCase();
  const subclass = normalize(input.subclass).toLowerCase();
  const uploader = normalize(input.uploader);
  const keyword = normalize(input.keyword).toLowerCase();
  const startDate = normalize(input.startDate);
  const endDate = normalize(input.endDate);

  if (country) {
    conditions.push("UPPER(r.country) = ?");
    params.push(country);
  }
  if (subclass) {
    conditions.push("LOWER(r.subclass) = ?");
    params.push(subclass);
  }
  if (uploader) {
    conditions.push("j.uploader = ?");
    params.push(uploader);
  }
  if (startDate) {
    conditions.push("COALESCE(j.finished_at, j.created_at) >= ?");
    params.push(`${startDate} 00:00:00`);
  }
  if (endDate) {
    conditions.push("COALESCE(j.finished_at, j.created_at) <= ?");
    params.push(`${endDate} 23:59:59.999`);
  }
  if (keyword) {
    conditions.push(
      "LOWER(CONCAT_WS(' ', r.country, r.subclass, r.term_id, r.term_name, r.domain, r.title1, r.brief_introduction, j.note, j.uploader)) LIKE ?",
    );
    params.push(`%${keyword}%`);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

const parsedWorkbookCache = new Map<string, StoredFaqOutputRow[]>();
const generationBoardNameField = "板块名称";
const outputHeaders = [
  "ContentType",
  "Country",
  "TermID",
  "TermName",
  "Domain",
  "Source",
  "Subclass",
  generationBoardNameField,
  "Titile1",
  "Brief Introduction",
  "Href Kw",
  "Href Url",
] as const;

const extractionSheetHeaders = [
  "term_id",
  "country",
  "domain",
  "term_name",
  "fact_type",
  "supported",
  "status",
  "discount_type",
  "discount_value",
  "currency",
  "discount_details",
  "url",
] as const;

function normalize(value: unknown) {
  return String(value || "").trim();
}

function normalizeCountry(value: unknown) {
  return normalize(value).toUpperCase();
}

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
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
    [FAQ_BOARD_NAME_FIELD]: normalize(row[FAQ_BOARD_NAME_FIELD]),
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

function parseGenerationInputWorkbook(fileName: string, fileBase64: string) {
  const buffer = Buffer.from(fileBase64, "base64");
  const mapRow = (row: Record<string, unknown>) => {
    const mapped = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) mapped.set(normalizeHeader(key), value);
    const pick = (key: string) => String(mapped.get(key) ?? "").trim();
    return {
      term_id: pick("term_id"),
      country: normalizeCountry(pick("country")),
      domain: pick("domain"),
      term_name: pick("term_name"),
      fact_type: pick("fact_type"),
      supported: pick("supported"),
      status: pick("status"),
      discount_type: pick("discount_type"),
      discount_value: pick("discount_value"),
      currency: pick("currency"),
      discount_details: pick("discount_details"),
      url: pick("url"),
    };
  };

  if (fileName.toLowerCase().endsWith(".csv")) {
    return (parse(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[]).map(mapRow);
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.map(mapRow);
}

async function rebuildGenerationResultArtifact(row: typeof contentGenerationJobs.$inferSelect) {
  if (!row.inputFileBase64) {
    return {
      fileName: row.resultFileName || `faq-output-${row.id}.xlsx`,
      xlsxBase64: row.resultFileBase64 || "",
    };
  }

  const inputRows = parseGenerationInputWorkbook(row.inputFileName, row.inputFileBase64);
  const persistedRows = await listPersistedGenerationRows(row.id);
  const persistedByRowIndex = new Map(persistedRows.map((item) => [item.rowIndex, item]));
  const successRows = persistedRows.filter((item) => item.status === "success");
  const failedRows = persistedRows.filter((item) => item.status === "error");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      successRows.map((item) => ({
        ContentType: "faq",
        Country: item.country,
        TermID: item.termId,
        TermName: item.termName,
        Domain: item.domain,
        Source: item.source || "AI",
        Subclass: item.subclass,
        [generationBoardNameField]: item.boardName || "faq",
        Titile1: item.title1,
        "Brief Introduction": item.briefIntroduction,
        "Href Kw": item.hrefKw,
        "Href Url": item.hrefUrl,
      })),
      { header: [...outputHeaders] },
    ),
    "FAQ_output",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      inputRows.map((inputRow, index) => {
        const persisted = persistedByRowIndex.get(index + 1);
        if (!persisted || persisted.status !== "success") return inputRow;
        return {
          ...inputRow,
          supported: persisted.supported,
          status: persisted.inputStatus,
          discount_type: persisted.discountType,
          discount_value: persisted.discountValue,
          currency: persisted.currency,
          discount_details: persisted.discountDetails || inputRow.discount_details,
          url: persisted.url || inputRow.url,
        };
      }),
      { header: [...extractionSheetHeaders] },
    ),
    "field_extract",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      failedRows.map((item) => ({
        rowIndex: item.rowIndex,
        factType: item.factType,
        subclass: item.subclass,
        routeKey: item.routeKey,
        error: item.errorReason,
      })),
    ),
    "failures",
  );

  const xlsxBase64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const fileName = row.resultFileName || `faq-output-${row.id}.xlsx`;

  await db
    .update(contentGenerationJobs)
    .set({
      resultFileName: fileName,
      resultFileBase64: xlsxBase64,
    })
    .where(eq(contentGenerationJobs.id, row.id));

  return { fileName, xlsxBase64 };
}

async function listDoneGenerationRows(scType = "faq") {
  const persistedRows = await listPersistedHistoryRows(scType);
  const persistedJobIds = new Set((await listPersistedHistoryJobIds(scType)).map((id) => id));
  const rows = await db
    .select()
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.scType, scType))
    .orderBy(desc(contentGenerationJobs.createdAt));

  const workbookRows = rows
    .filter((row) => (row.status === "done" || row.status === "failed") && row.resultFileBase64)
    .filter((row) => !persistedJobIds.has(row.id))
    .flatMap((row) => parseStoredWorkbook(row));

  return [
    ...persistedRows.map((row) => ({
      ...row,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      [FAQ_BOARD_NAME_FIELD]: row[FAQ_BOARD_NAME_FIELD],
    })),
    ...workbookRows,
  ];
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
    createdAt: formatChinaDateTime(row.createdAt),
    finishedAt: formatChinaDateTime(row.finishedAt),
    ContentType: row.ContentType,
    Country: row.Country,
    TermID: row.TermID,
    TermName: row.TermName,
    Domain: row.Domain,
    Source: row.Source,
    Subclass: row.Subclass,
    [FAQ_BOARD_NAME_FIELD]: row[FAQ_BOARD_NAME_FIELD],
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
    status: "queued",
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    errorReason: null,
  });

  return { jobId: id };
}

export async function markGenerationJobQueued(jobId: string) {
  const persisted = await getPersistedGenerationSummary(jobId);
  await db
    .update(contentGenerationJobs)
    .set({
      status: "queued",
      errorReason: null,
      successRows: persisted.successRows,
      failedRows: persisted.failedRows,
      skippedRows: 0,
      promptTokensSum: persisted.promptTokensSum,
      completionTokensSum: persisted.completionTokensSum,
      totalTokensSum: persisted.totalTokensSum,
      estimatedCostUsdSum: String(persisted.estimatedCostUsdSum),
      resultFileName: "",
      resultFileBase64: null,
      routeSummaryJson: null,
      rowResultsJson: null,
      finishedAt: null,
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

export async function markGenerationJobRunning(jobId: string) {
  const persisted = await getPersistedGenerationSummary(jobId);
  await db
    .update(contentGenerationJobs)
    .set({
      status: "running",
      errorReason: null,
      successRows: persisted.successRows,
      failedRows: persisted.failedRows,
      skippedRows: 0,
      promptTokensSum: persisted.promptTokensSum,
      completionTokensSum: persisted.completionTokensSum,
      totalTokensSum: persisted.totalTokensSum,
      estimatedCostUsdSum: String(persisted.estimatedCostUsdSum),
      resultFileName: "",
      resultFileBase64: null,
      routeSummaryJson: null,
      rowResultsJson: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

export async function listQueuedGenerationJobs(scType = "faq") {
  return db
    .select()
    .from(contentGenerationJobs)
    .where(and(eq(contentGenerationJobs.scType, scType), eq(contentGenerationJobs.status, "queued")))
    .orderBy(contentGenerationJobs.createdAt);
}

export async function recoverInterruptedGenerationJobs(scType = "faq") {
  await db
    .update(contentGenerationJobs)
    .set({
      status: "queued",
      errorReason: null,
      finishedAt: null,
    })
    .where(
      and(
        eq(contentGenerationJobs.scType, scType),
        eq(contentGenerationJobs.status, "running"),
        isNull(contentGenerationJobs.finishedAt),
      ),
    );
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
  resultFileBase64?: string | null;
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
      resultFileBase64: input.resultFileBase64 || null,
      routeSummaryJson: input.routeSummary,
      rowResultsJson: input.rowResults,
      errorReason: input.errorReason || null,
      finishedAt: new Date(),
    })
    .where(eq(contentGenerationJobs.id, input.jobId));
}

export async function updateGenerationJobProgress(input: {
  jobId: string;
  totalRows: number;
  executableRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  promptTokensSum: number;
  completionTokensSum: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  aiModel?: string;
}) {
  await db
    .update(contentGenerationJobs)
    .set({
      totalRows: input.totalRows,
      executableRows: input.executableRows,
      successRows: input.successRows,
      failedRows: input.failedRows,
      skippedRows: input.skippedRows,
      promptTokensSum: input.promptTokensSum,
      completionTokensSum: input.completionTokensSum,
      totalTokensSum: input.totalTokensSum,
      estimatedCostUsdSum: String(input.estimatedCostUsdSum),
      aiModel: input.aiModel || "",
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
      createdAt: formatChinaIsoOffset(row.createdAt),
      startedAt: formatChinaIsoOffset(row.startedAt),
      finishedAt: formatChinaIsoOffset(row.finishedAt),
      routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
    })),
  };
}

export async function getGenerationJobResult(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  const rebuiltResult =
    row && !row.resultFileBase64 && (row.status === "done" || row.status === "failed")
      ? await rebuildGenerationResultArtifact(row)
      : null;
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  return {
    id: row.id,
    fileName: rebuiltResult?.fileName || row.resultFileName || `faq-output-${row.id}.xlsx`,
    xlsxBase64: rebuiltResult?.xlsxBase64 || row.resultFileBase64 || "",
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
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
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
  const { whereSql, params } = buildPersistedHistoryWhere(input);

  const [summaryRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        COUNT(*) AS total_rows,
        COUNT(DISTINCT CONCAT(r.country, '::', r.term_id)) AS unique_result_count,
        COUNT(DISTINCT r.country) AS country_count,
        COUNT(DISTINCT r.subclass) AS subclass_count
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      ${whereSql}
    `,
    params,
  );

  const [byCountryRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.country AS country,
        COUNT(*) AS row_count,
        COUNT(DISTINCT CONCAT(r.country, '::', r.term_id)) AS unique_result_count,
        COUNT(DISTINCT r.subclass) AS subclass_count
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      ${whereSql}
      GROUP BY r.country
      ORDER BY unique_result_count DESC, country ASC
    `,
    params,
  );

  const [bySubclassRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.subclass AS subclass,
        COUNT(*) AS row_count,
        COUNT(DISTINCT CONCAT(r.country, '::', r.term_id)) AS unique_result_count,
        COUNT(DISTINCT r.country) AS country_count
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      ${whereSql}
      GROUP BY r.subclass
      ORDER BY unique_result_count DESC, subclass ASC
    `,
    params,
  );

  const summaryRow = (summaryRows[0] || {}) as Record<string, unknown>;

  return {
    summary: {
      totalRows: Number(summaryRow.total_rows || 0),
      uniqueResultCount: Number(summaryRow.unique_result_count || 0),
      countryCount: Number(summaryRow.country_count || 0),
      subclassCount: Number(summaryRow.subclass_count || 0),
    },
    byCountry: byCountryRows.map((row) => ({
      country: String(row.country || ""),
      rowCount: Number(row.row_count || 0),
      uniqueResultCount: Number(row.unique_result_count || 0),
      subclassCount: Number(row.subclass_count || 0),
    })),
    bySubclass: bySubclassRows.map((row) => ({
      subclass: String(row.subclass || ""),
      rowCount: Number(row.row_count || 0),
      uniqueResultCount: Number(row.unique_result_count || 0),
      countryCount: Number(row.country_count || 0),
    })),
  };
}

export async function listGenerationHistoryRows(input: HistoryFilters) {
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.max(1, Number(input.pageSize || 20));
  const start = (page - 1) * pageSize;
  const { whereSql, params } = buildPersistedHistoryWhere(input);

  const [countRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total_count
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      ${whereSql}
    `,
    params,
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.job_id,
        j.uploader,
        j.created_at AS created_at,
        j.finished_at AS finished_at,
        r.country,
        r.term_id,
        r.term_name,
        r.domain,
        r.subclass,
        r.title1,
        r.brief_introduction
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      ${whereSql}
      ORDER BY COALESCE(j.finished_at, j.created_at) DESC, r.row_index ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, start],
  );

  return {
    total: Number((countRows[0] as Record<string, unknown> | undefined)?.total_count || 0),
    rows: rows.map((row) => ({
      jobId: String(row.job_id || ""),
      uploader: String(row.uploader || ""),
      createdAt: formatChinaIsoOffset(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at || ""))),
      finishedAt: formatChinaIsoOffset(row.finished_at instanceof Date ? row.finished_at : row.finished_at ? new Date(String(row.finished_at)) : null),
      Country: String(row.country || ""),
      TermID: String(row.term_id || ""),
      TermName: String(row.term_name || ""),
      Domain: String(row.domain || ""),
      Subclass: String(row.subclass || ""),
      Titile1: String(row.title1 || ""),
      "Brief Introduction": String(row.brief_introduction || ""),
    })),
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
  XLSX.utils.book_append_sheet(workbook, sheet, "faq_history");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    fileName: `${fileStem}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: Buffer.from(buffer).toString("base64"),
  };
}
