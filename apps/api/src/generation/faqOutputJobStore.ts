import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { db, pool } from "../db/client";
import { contentGenerationJobs } from "../db/schema";
import { env } from "../env";
import { sha256 } from "../utils/hash";
import { formatChinaDateTime, formatChinaIsoOffset } from "../utils/time";
import {
  deletePersistedGenerationRows,
  getPersistedGenerationValidationLogs,
  getPersistedGenerationSummary,
  listPersistedGenerationRows,
  listPersistedHistoryJobIds,
  listPersistedHistoryRows,
} from "./faqOutputRowStore";
import { formatChinaDownloadTimestamp, sanitizeFileNameSegment, shortDownloadId } from "../downloads/downloadFileNames";

const FAQ_BOARD_NAME_FIELD = "板块名称" as const;
const generationDuplicateWindowMs = 5 * 60 * 1000;

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

type GenerationHistorySummaryResult = {
  summaryStatus?: "ready" | "building" | "stale";
  refreshedAt?: string | null;
  summary: {
    totalRows: number;
    uniqueResultCount: number;
    merchantCount: number;
    countryCount: number;
    subclassCount: number;
  };
  byCountry: Array<{
    country: string;
    rowCount: number;
    uniqueResultCount: number;
    merchantCount: number;
    subclassCount: number;
  }>;
  bySubclass: Array<{
    subclass: string;
    rowCount: number;
    uniqueResultCount: number;
    merchantCount: number;
    countryCount: number;
  }>;
};

type GenerationHistoryRowsResult = {
  total: number;
  hasMore?: boolean;
  totalIsEstimated?: boolean;
  rows: Array<{
    jobId: string;
    uploader: string;
    createdAt: string;
    finishedAt: string | null;
    Country: string;
    TermID: string;
    TermName: string;
    Domain: string;
    Subclass: string;
    Titile1: string;
    "Brief Introduction": string;
  }>;
};

const generationHistoryCacheTtlMs = 5 * 60 * 1000;
const generationHistorySummaryCache = new Map<string, { expiresAt: number; value: unknown }>();
const generationHistoryRowsCache = new Map<string, { expiresAt: number; value: unknown }>();
const generationHistoryCountCache = new Map<string, { expiresAt: number; value: unknown }>();
const generationQueueCountCache = new Map<string, { expiresAt: number; value: unknown }>();
const generationHistoryCountInFlight = new Map<string, Promise<number>>();
const generationHistorySummaryTableName = "content_generation_history_summary";
const generationHistorySummaryVersion = 1;
const generationHistoryAllFilter = "__ALL__";
const generationHistorySummaryDimension = "__SUMMARY__";

let generationHistorySummaryTableEnsured = false;
let generationHistorySummaryRefreshPromise: Promise<void> | null = null;
let generationHistorySummaryRefreshRequested = false;
let generationHistorySummaryRefreshTimer: NodeJS.Timeout | null = null;
let generationHousekeepingTimer: NodeJS.Timeout | null = null;
const APP_RUNTIME_DIR = path.resolve(process.cwd(), "apps/api/.runtime");
const FAQ_INPUT_DIR = path.resolve(APP_RUNTIME_DIR, "faq-output-inputs");
const FAQ_RESULT_DIR = path.resolve(APP_RUNTIME_DIR, "faq-output-results");
const FAQ_DOWNLOAD_TASK_DIR = path.resolve(APP_RUNTIME_DIR, "faq-download-tasks");
const generationCountCacheTtlMs = 30 * 1000;
const generationQueueCountCacheTtlMs = 15 * 1000;
const faqResultRetentionMs = 14 * 24 * 60 * 60 * 1000;
const faqTmpRetentionMs = 2 * 24 * 60 * 60 * 1000;
const faqDownloadTaskRetentionMs = 24 * 60 * 60 * 1000;
const faqDoneInputRetentionMs = env.faqOutputInputRetentionHoursDone * 60 * 60 * 1000;
const faqFailedInputRetentionMs = env.faqOutputInputRetentionHoursFailed * 60 * 60 * 1000;

export type FaqResultRepairAction = "already_valid" | "repaired_from_base64" | "rebuilt_from_inputs" | "rebuilt_from_rows";

export type FaqResultRepairOutcome = {
  jobId: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  action: FaqResultRepairAction | "skipped";
  resultFilePath: string;
  reason?: string;
};

function buildGenerationHistoryCacheKey(input: HistoryFilters) {
  return JSON.stringify({
    scType: input.scType || "faq",
    country: input.country || "",
    subclass: input.subclass || "",
    uploader: input.uploader || "",
    keyword: input.keyword || "",
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    page: Number(input.page || 1),
    pageSize: Number(input.pageSize || 20),
  });
}

function buildGenerationCountCacheKey(input: HistoryFilters) {
  return JSON.stringify({
    scType: input.scType || "faq",
    country: input.country || "",
    subclass: input.subclass || "",
    uploader: input.uploader || "",
    keyword: input.keyword || "",
    startDate: input.startDate || "",
    endDate: input.endDate || "",
  });
}

function buildGenerationQueueCountCacheKey(scType: string) {
  return `queue::${scType || "faq"}`;
}

function getHistoryCacheValue<T>(cache: Map<string, { expiresAt: number; value: unknown }>, key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value as T;
}

function setHistoryCacheValue<T>(cache: Map<string, { expiresAt: number; value: unknown }>, key: string, value: T) {
  cache.set(key, { expiresAt: Date.now() + generationHistoryCacheTtlMs, value });
}

function setTimedCacheValue<T>(cache: Map<string, { expiresAt: number; value: unknown }>, key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

function logGenerationPerf(label: string, meta: Record<string, unknown>) {
  const payload = Object.entries(meta)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(`[faq-generation] ${label} ${payload}`.trim());
}

function clearGenerationHistoryCaches() {
  generationHistorySummaryCache.clear();
  generationHistoryRowsCache.clear();
  generationHistoryCountCache.clear();
  generationQueueCountCache.clear();
}

async function ensureGenerationHistorySummaryTable() {
  if (generationHistorySummaryTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${generationHistorySummaryTableName} (
      sc_type varchar(32) NOT NULL,
      summary_version int NOT NULL DEFAULT 1,
      uploader_filter varchar(32) NOT NULL DEFAULT '${generationHistoryAllFilter}',
      country_filter varchar(32) NOT NULL DEFAULT '${generationHistoryAllFilter}',
      subclass_filter varchar(255) NOT NULL DEFAULT '${generationHistoryAllFilter}',
      dimension_type varchar(16) NOT NULL,
      dimension_value varchar(255) NOT NULL,
      row_count int NOT NULL DEFAULT 0,
      unique_result_count int NOT NULL DEFAULT 0,
      merchant_count int NOT NULL DEFAULT 0,
      country_count int NOT NULL DEFAULT 0,
      subclass_count int NOT NULL DEFAULT 0,
      refreshed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sc_type, summary_version, uploader_filter, country_filter, subclass_filter, dimension_type, dimension_value),
      KEY idx_generation_history_summary_lookup (
        sc_type,
        summary_version,
        uploader_filter,
        country_filter,
        subclass_filter,
        dimension_type
      )
    )
  `);
  generationHistorySummaryTableEnsured = true;
}

function toGenerationHistoryFilterValue(value: unknown, mode: "plain" | "country" | "subclass" = "plain") {
  const normalized = normalize(value);
  if (!normalized) return generationHistoryAllFilter;
  if (mode === "country") return normalized.toUpperCase();
  if (mode === "subclass") return normalized.toLowerCase();
  return normalized;
}

function supportsMaterializedHistorySummary(input: HistoryFilters) {
  return !normalize(input.keyword) && !normalize(input.startDate) && !normalize(input.endDate);
}

type MaterializedAggregate = {
  rowCount: number;
  uniqueResults: Set<string>;
  merchants: Set<string>;
  countries: Set<string>;
  subclasses: Set<string>;
};

function createEmptyHistorySummaryResult(
  status: "ready" | "building" | "stale",
  refreshedAt: string | null,
): GenerationHistorySummaryResult {
  return {
    summaryStatus: status,
    refreshedAt,
    summary: {
      totalRows: 0,
      uniqueResultCount: 0,
      merchantCount: 0,
      countryCount: 0,
      subclassCount: 0,
    },
    byCountry: [],
    bySubclass: [],
  };
}

function bumpMaterializedHistorySummary(row: StoredFaqOutputRow, aggregateMap: Map<string, MaterializedAggregate>) {
  const uploaderFilters = [generationHistoryAllFilter, row.uploader || generationHistoryAllFilter];
  const countryFilters = [generationHistoryAllFilter, row.Country || generationHistoryAllFilter];
  const subclassFilters = [generationHistoryAllFilter, (row.Subclass || generationHistoryAllFilter).toLowerCase()];
  const uniqueResultKey = `${row.Country}::${row.TermID}::${row.Subclass}`;
  const merchantKey = `${row.Country}::${row.TermID}`;

  const touch = (
    uploaderFilter: string,
    countryFilter: string,
    subclassFilter: string,
    dimensionType: "summary" | "country" | "subclass",
    dimensionValue: string,
  ) => {
    const key = [
      uploaderFilter,
      countryFilter,
      subclassFilter,
      dimensionType,
      dimensionValue,
    ].join("::");
    let aggregate = aggregateMap.get(key);
    if (!aggregate) {
      aggregate = {
        rowCount: 0,
        uniqueResults: new Set<string>(),
        merchants: new Set<string>(),
        countries: new Set<string>(),
        subclasses: new Set<string>(),
      };
      aggregateMap.set(key, aggregate);
    }
    aggregate.rowCount += 1;
    aggregate.uniqueResults.add(uniqueResultKey);
    aggregate.merchants.add(merchantKey);
    aggregate.countries.add(row.Country);
    aggregate.subclasses.add(row.Subclass);
  };

  for (const uploaderFilter of uploaderFilters) {
    for (const countryFilter of countryFilters) {
      for (const subclassFilter of subclassFilters) {
        touch(uploaderFilter, countryFilter, subclassFilter, "summary", generationHistorySummaryDimension);
        if (countryFilter === generationHistoryAllFilter) {
          touch(uploaderFilter, countryFilter, subclassFilter, "country", row.Country);
        }
        if (subclassFilter === generationHistoryAllFilter) {
          touch(uploaderFilter, countryFilter, subclassFilter, "subclass", row.Subclass);
        }
      }
    }
  }
}

async function rebuildMaterializedHistorySummary(scType = "faq") {
  await ensureGenerationHistorySummaryTable();
  const rows = await listPersistedHistoryRows(scType);
  const aggregateMap = new Map<string, MaterializedAggregate>();

  for (const row of rows) {
    bumpMaterializedHistorySummary(row, aggregateMap);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM ${generationHistorySummaryTableName} WHERE sc_type = ? AND summary_version = ?`,
      [scType, generationHistorySummaryVersion],
    );

    if (aggregateMap.size) {
      const refreshedAt = new Date();
      const entries = [...aggregateMap.entries()];
      const batchSize = 400;

      for (let start = 0; start < entries.length; start += batchSize) {
        const batch = entries.slice(start, start + batchSize);
        const valueSql = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
        const params: unknown[] = [];

        for (const [key, aggregate] of batch) {
          const [uploaderFilter, countryFilter, subclassFilter, dimensionType, dimensionValue] = key.split("::");
          params.push(
            scType,
            generationHistorySummaryVersion,
            uploaderFilter,
            countryFilter,
            subclassFilter,
            dimensionType,
            dimensionValue,
            aggregate.rowCount,
            aggregate.uniqueResults.size,
            aggregate.merchants.size,
            aggregate.countries.size,
            aggregate.subclasses.size,
            refreshedAt,
          );
        }

        await connection.execute(
          `
            INSERT INTO ${generationHistorySummaryTableName} (
              sc_type,
              summary_version,
              uploader_filter,
              country_filter,
              subclass_filter,
              dimension_type,
              dimension_value,
              row_count,
              unique_result_count,
              merchant_count,
              country_count,
              subclass_count,
              refreshed_at
            ) VALUES ${valueSql}
          `,
          params,
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function refreshMaterializedHistorySummary(scType = "faq") {
  if (generationHistorySummaryRefreshPromise) {
    generationHistorySummaryRefreshRequested = true;
    return generationHistorySummaryRefreshPromise;
  }

  generationHistorySummaryRefreshPromise = (async () => {
    do {
      generationHistorySummaryRefreshRequested = false;
      await rebuildMaterializedHistorySummary(scType);
    } while (generationHistorySummaryRefreshRequested);
  })().finally(() => {
    generationHistorySummaryRefreshPromise = null;
  });

  return generationHistorySummaryRefreshPromise;
}

function scheduleMaterializedHistorySummaryRefresh(scType = "faq") {
  generationHistorySummaryRefreshRequested = true;
  if (generationHistorySummaryRefreshTimer) return;
  generationHistorySummaryRefreshTimer = setTimeout(() => {
    generationHistorySummaryRefreshTimer = null;
    void refreshMaterializedHistorySummary(scType).catch((error) => {
      console.error("refresh materialized faq history summary failed", error);
    });
  }, 1200);
}

function isMissingGenerationRowsTableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "ER_NO_SUCH_TABLE" || message.includes("content_generation_job_rows");
}

function buildLegacyHistorySummary(rows: StoredFaqOutputRow[]) {
  const uniqueResultSet = new Set<string>();
  const merchantSet = new Set<string>();
  const countrySet = new Set<string>();
  const subclassSet = new Set<string>();
  const byCountryMap = new Map<string, { rowCount: number; uniqueResults: Set<string>; merchants: Set<string>; subclasses: Set<string> }>();
  const bySubclassMap = new Map<string, { rowCount: number; uniqueResults: Set<string>; merchants: Set<string>; countries: Set<string> }>();

  for (const row of rows) {
    const uniqueKey = `${row.Country}::${row.TermID}::${row.Subclass}`;
    const merchantKey = `${row.Country}::${row.TermID}`;
    uniqueResultSet.add(uniqueKey);
    merchantSet.add(merchantKey);
    countrySet.add(row.Country);
    subclassSet.add(row.Subclass);

    const countryBucket = byCountryMap.get(row.Country) || {
      rowCount: 0,
      uniqueResults: new Set<string>(),
      merchants: new Set<string>(),
      subclasses: new Set<string>(),
    };
    countryBucket.rowCount += 1;
    countryBucket.uniqueResults.add(`${row.TermID}::${row.Subclass}`);
    countryBucket.merchants.add(row.TermID);
    countryBucket.subclasses.add(row.Subclass);
    byCountryMap.set(row.Country, countryBucket);

    const subclassBucket = bySubclassMap.get(row.Subclass) || {
      rowCount: 0,
      uniqueResults: new Set<string>(),
      merchants: new Set<string>(),
      countries: new Set<string>(),
    };
    subclassBucket.rowCount += 1;
    subclassBucket.uniqueResults.add(uniqueKey);
    subclassBucket.merchants.add(merchantKey);
    subclassBucket.countries.add(row.Country);
    bySubclassMap.set(row.Subclass, subclassBucket);
  }

  return {
    summaryStatus: "ready" as const,
    refreshedAt: new Date().toISOString(),
    summary: {
      totalRows: rows.length,
      uniqueResultCount: uniqueResultSet.size,
      merchantCount: merchantSet.size,
      countryCount: countrySet.size,
      subclassCount: subclassSet.size,
    },
    byCountry: [...byCountryMap.entries()]
      .map(([country, bucket]) => ({
        country,
        rowCount: bucket.rowCount,
        uniqueResultCount: bucket.uniqueResults.size,
        merchantCount: bucket.merchants.size,
        subclassCount: bucket.subclasses.size,
      }))
      .sort((a, b) => b.uniqueResultCount - a.uniqueResultCount || a.country.localeCompare(b.country)),
    bySubclass: [...bySubclassMap.entries()]
      .map(([subclass, bucket]) => ({
        subclass,
        rowCount: bucket.rowCount,
        uniqueResultCount: bucket.uniqueResults.size,
        merchantCount: bucket.merchants.size,
        countryCount: bucket.countries.size,
      }))
      .sort((a, b) => b.uniqueResultCount - a.uniqueResultCount || a.subclass.localeCompare(b.subclass)),
  };
}

async function loadLegacyHistoryRows(input: HistoryFilters) {
  const allRows = await listDoneGenerationRows(input.scType || "faq");
  return filterHistoryRows(allRows, input);
}

function buildPersistedHistoryWhere(input: HistoryFilters) {
  const conditions = ["j.sc_type = ?", "j.status = 'done'", "r.status = 'success'"];
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

const failureSheetHeaders = ["rowIndex", "factType", "subclass", "routeKey", "error"] as const;
const faqDownloadSheetNames = {
  output: "FAQ_output",
  extract: "field_extract",
  failures: "failures",
} as const;

type GenerationDownloadVariant = "main" | "field_extract" | "full";
type GenerationDownloadTaskVariant = GenerationDownloadVariant | "history_xlsx" | "history_csv";
type GenerationDownloadTaskStatus = "queued" | "preparing" | "ready" | "failed" | "expired";

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

async function parseStoredWorkbook(row: {
  id: string;
  uploader: string;
  note: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  resultFileName: string;
  resultFilePath: string | null;
  resultFileBase64: string | null;
  updatedAt: Date;
}) {
  const cacheKey = getWorkbookCacheKey(row);
  const cached = parsedWorkbookCache.get(cacheKey);
  if (cached) return cached;

  let buffer: Buffer | null = null;
  if (row.resultFilePath) {
    try {
      buffer = await readFile(row.resultFilePath);
    } catch {
      buffer = null;
    }
  }
  if (!buffer && row.resultFileBase64) {
    buffer = Buffer.from(row.resultFileBase64, "base64");
  }

  if (!buffer) {
    parsedWorkbookCache.set(cacheKey, []);
    return [];
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
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

async function persistFaqResultWorkbook(jobId: string, fileName: string, workbookBuffer: Buffer) {
  await mkdir(FAQ_RESULT_DIR, { recursive: true });
  const safeExt = path.extname(fileName || "").toLowerCase() === ".xlsx" ? ".xlsx" : ".xlsx";
  const resultFilePath = path.join(FAQ_RESULT_DIR, `${jobId}${safeExt}`);
  await writeFile(resultFilePath, workbookBuffer);
  return resultFilePath;
}

async function persistFaqInputWorkbook(jobId: string, fileName: string, fileBase64: string) {
  await mkdir(FAQ_INPUT_DIR, { recursive: true });
  const normalizedExt = path.extname(fileName || "").toLowerCase();
  const safeExt = normalizedExt === ".csv" || normalizedExt === ".xlsx" ? normalizedExt : ".bin";
  const inputFilePath = path.join(FAQ_INPUT_DIR, `${jobId}${safeExt}`);
  await writeFile(inputFilePath, Buffer.from(fileBase64, "base64"));
  return inputFilePath;
}

async function readFaqInputBuffer(row: {
  inputFilePath: string | null;
  inputFileBase64: string | null;
}) {
  if (row.inputFilePath) {
    try {
      return await readFile(row.inputFilePath);
    } catch {
      // fall through to legacy base64
    }
  }
  if (row.inputFileBase64) {
    return Buffer.from(row.inputFileBase64, "base64");
  }
  return null;
}

function isLikelyXlsxBuffer(buffer: Buffer | null | undefined) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function cloneSheet(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  return XLSX.utils.aoa_to_sheet(rows);
}

function buildWorkbookForVariant(sourceBuffer: Buffer, variant: GenerationDownloadVariant) {
  const sourceWorkbook = XLSX.read(sourceBuffer, { type: "buffer" });
  const nextWorkbook = XLSX.utils.book_new();

  if (variant === "field_extract") {
    const extractSheet = cloneSheet(sourceWorkbook, faqDownloadSheetNames.extract);
    if (!extractSheet) {
      throw new Error("Current FAQ output task has no field_extract sheet yet.");
    }
    XLSX.utils.book_append_sheet(nextWorkbook, extractSheet, faqDownloadSheetNames.extract);
    return XLSX.write(nextWorkbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  const outputSheet = cloneSheet(sourceWorkbook, faqDownloadSheetNames.output);
  if (!outputSheet) {
    throw new Error("Current FAQ output task has no FAQ_output sheet yet.");
  }
  XLSX.utils.book_append_sheet(nextWorkbook, outputSheet, faqDownloadSheetNames.output);

  const failuresSheet = cloneSheet(sourceWorkbook, faqDownloadSheetNames.failures);
  if (failuresSheet) {
    XLSX.utils.book_append_sheet(nextWorkbook, failuresSheet, faqDownloadSheetNames.failures);
  } else {
    XLSX.utils.book_append_sheet(
      nextWorkbook,
      XLSX.utils.json_to_sheet([], { header: [...failureSheetHeaders] }),
      faqDownloadSheetNames.failures,
    );
  }

  if (variant === "full") {
    const extractSheet = cloneSheet(sourceWorkbook, faqDownloadSheetNames.extract);
    if (extractSheet) {
      XLSX.utils.book_append_sheet(nextWorkbook, extractSheet, faqDownloadSheetNames.extract);
    }
  }

  return XLSX.write(nextWorkbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function buildWorkbookFromPersistedRows(jobId: string, variant: GenerationDownloadVariant) {
  const persistedRows = await listPersistedGenerationRows(jobId);
  if (!persistedRows.length) {
    return null;
  }

  const workbook = XLSX.utils.book_new();
  const successRows = persistedRows.filter((item) => item.status === "success");
  const failureRows = persistedRows.filter((item) => item.status === "error");

  if (variant === "field_extract") {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        persistedRows.map((item) => ({
          term_id: item.termId,
          country: item.country,
          domain: item.domain,
          term_name: item.termName,
          fact_type: item.factType,
          supported: item.supported,
          status: item.inputStatus,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          currency: item.currency,
          discount_details: item.discountDetails,
          url: item.url,
        })),
        { header: [...extractionSheetHeaders] },
      ),
      faqDownloadSheetNames.extract,
    );
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

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
    faqDownloadSheetNames.output,
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      failureRows.map((item) => ({
        rowIndex: item.rowIndex,
        factType: item.factType,
        subclass: item.subclass,
        routeKey: item.routeKey,
        error: item.errorReason,
      })),
      { header: [...failureSheetHeaders] },
    ),
    faqDownloadSheetNames.failures,
  );

  if (variant === "full") {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        persistedRows.map((item) => ({
          term_id: item.termId,
          country: item.country,
          domain: item.domain,
          term_name: item.termName,
          fact_type: item.factType,
          supported: item.supported,
          status: item.inputStatus,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          currency: item.currency,
          discount_details: item.discountDetails,
          url: item.url,
        })),
        { header: [...extractionSheetHeaders] },
      ),
      faqDownloadSheetNames.extract,
    );
  }

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function rebuildGenerationResultArtifact(row: typeof contentGenerationJobs.$inferSelect) {
  const inputBuffer = await readFaqInputBuffer(row);
  if (!inputBuffer) {
    const persistedBuffer = await buildWorkbookFromPersistedRows(row.id, "full");
    if (persistedBuffer) {
      const fileName = row.resultFileName || `faq-output-${row.id}.xlsx`;
      const resultFilePath = await persistFaqResultWorkbook(row.id, fileName, persistedBuffer);
      await db
        .update(contentGenerationJobs)
        .set({
          resultFileName: fileName,
          resultFilePath,
        })
        .where(eq(contentGenerationJobs.id, row.id));
      return {
        fileName,
        xlsxBase64: persistedBuffer.toString("base64"),
        buffer: persistedBuffer,
        resultFilePath,
      };
    }
    return {
      fileName: row.resultFileName || `faq-output-${row.id}.xlsx`,
      xlsxBase64: row.resultFileBase64 || "",
      buffer: row.resultFileBase64 ? Buffer.from(row.resultFileBase64, "base64") : Buffer.alloc(0),
      resultFilePath: row.resultFilePath || "",
      rebuiltFromRowsOnly: false,
    };
  }

  const inputRows = parseGenerationInputWorkbook(row.inputFileName, inputBuffer.toString("base64"));
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
    faqDownloadSheetNames.output,
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
    faqDownloadSheetNames.extract,
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
      { header: [...failureSheetHeaders] },
    ),
    faqDownloadSheetNames.failures,
  );

  const fileName = row.resultFileName || `faq-output-${row.id}.xlsx`;
  const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const xlsxBase64 = workbookBuffer.toString("base64");
  const resultFilePath = await persistFaqResultWorkbook(row.id, fileName, workbookBuffer);

  await db
    .update(contentGenerationJobs)
    .set({
      resultFileName: fileName,
      resultFilePath,
    })
    .where(eq(contentGenerationJobs.id, row.id));

  return { fileName, xlsxBase64, buffer: workbookBuffer, resultFilePath, rebuiltFromRowsOnly: false };
}

async function restoreResultWorkbookFromBase64(row: typeof contentGenerationJobs.$inferSelect) {
  if (!row.resultFileBase64) return null;
  const buffer = Buffer.from(row.resultFileBase64, "base64");
  if (!isLikelyXlsxBuffer(buffer)) return null;
  const fileName = row.resultFileName || `faq-output-${row.id}.xlsx`;
  const resultFilePath = await persistFaqResultWorkbook(row.id, fileName, buffer);
  await db
    .update(contentGenerationJobs)
    .set({
      resultFileName: fileName,
      resultFilePath,
    })
    .where(eq(contentGenerationJobs.id, row.id));
  return { fileName, resultFilePath, buffer };
}

export async function repairHistoricalFaqResultArtifacts(options?: {
  jobIds?: string[];
  olderThanHours?: number;
  includeFailed?: boolean;
}) {
  const olderThanHours = Math.max(1, options?.olderThanHours ?? 24);
  const statuses = options?.includeFailed ? ["done", "failed"] : ["done"];
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT *
      FROM content_generation_jobs
      WHERE sc_type = 'faq'
        AND status IN (${statuses.map(() => "?").join(", ")})
        AND COALESCE(finished_at, created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
        ${options?.jobIds?.length ? `AND id IN (${options.jobIds.map(() => "?").join(", ")})` : ""}
      ORDER BY COALESCE(finished_at, created_at) ASC
    `,
    [...statuses, olderThanHours, ...(options?.jobIds ?? [])],
  );

  const outcomes: FaqResultRepairOutcome[] = [];

  for (const rawRow of rows) {
    const row = rawRow as unknown as typeof contentGenerationJobs.$inferSelect;
    const createdAtIso =
      row.createdAt instanceof Date ? formatChinaIsoOffset(row.createdAt) : formatChinaIsoOffset(new Date(String(row.createdAt)));
    const finishedAtIso =
      row.finishedAt instanceof Date
        ? formatChinaIsoOffset(row.finishedAt)
        : row.finishedAt
          ? formatChinaIsoOffset(new Date(String(row.finishedAt)))
          : null;
    const currentPath = row.resultFilePath || "";
    if (currentPath && (await pathExists(currentPath))) {
      outcomes.push({
        jobId: row.id,
        status: row.status,
        createdAt: createdAtIso,
        finishedAt: finishedAtIso,
        action: "already_valid",
        resultFilePath: currentPath,
      });
      continue;
    }

    const restored = await restoreResultWorkbookFromBase64(row);
    if (restored) {
      outcomes.push({
        jobId: row.id,
        status: row.status,
        createdAt: createdAtIso,
        finishedAt: finishedAtIso,
        action: "repaired_from_base64",
        resultFilePath: restored.resultFilePath,
      });
      continue;
    }

    const rebuilt = await rebuildGenerationResultArtifact(row);
    if (rebuilt.resultFilePath && (await pathExists(rebuilt.resultFilePath))) {
      const rebuiltAction: FaqResultRepairAction =
        row.inputFilePath || row.inputFileBase64 ? "rebuilt_from_inputs" : "rebuilt_from_rows";
      outcomes.push({
        jobId: row.id,
        status: row.status,
        createdAt: createdAtIso,
        finishedAt: finishedAtIso,
        action: rebuiltAction,
        resultFilePath: rebuilt.resultFilePath,
      });
      continue;
    }

    outcomes.push({
      jobId: row.id,
      status: row.status,
      createdAt: createdAtIso,
      finishedAt: finishedAtIso,
      action: "skipped",
      resultFilePath: row.resultFilePath || "",
      reason: "No restorable file payload or rebuildable inputs were found.",
    });
  }

  return outcomes;
}

async function listDoneGenerationRows(scType = "faq") {
  const persistedRows = await listPersistedHistoryRows(scType);
  const persistedJobIds = new Set((await listPersistedHistoryJobIds(scType)).map((id) => id));
  const rows = await db
    .select()
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.scType, scType))
    .orderBy(desc(contentGenerationJobs.createdAt));

  const workbookRows = (
    await Promise.all(
      rows
        .filter((row) => (row.status === "done" || row.status === "failed") && (row.resultFilePath || row.resultFileBase64))
        .filter((row) => !persistedJobIds.has(row.id))
        .map((row) => parseStoredWorkbook(row)),
    )
  ).flat();

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
  const inputBuffer = Buffer.from(input.inputFileBase64, "base64");
  const inputHash = sha256(inputBuffer.toString("base64"));
  const duplicate = await findRecentDuplicateGenerationJob({
    scType: input.scType,
    inputHash,
  });
  if (duplicate) {
    throw new Error(`5分钟内已上传相同文件，请勿重复提交。可继续查看已有任务：${duplicate.id}`);
  }
  const id = makeId();
  const inputFilePath = await persistFaqInputWorkbook(id, input.inputFileName, input.inputFileBase64);

  await db.insert(contentGenerationJobs).values({
    id,
    capability: "generation",
    scType: input.scType,
    uploader: input.uploader,
    note: input.note,
    inputFileName: input.inputFileName,
    inputFilePath,
    status: "queued",
    elapsedExecutionMs: 0,
    startedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    errorReason: null,
  });

  return { jobId: id, inputFilePath };
}

export async function deleteQueuedGenerationJob(jobId: string) {
  return deleteGenerationJob(jobId);
}

export async function deleteGenerationJob(jobId: string) {
  clearGenerationHistoryCaches();
  scheduleMaterializedHistorySummaryRefresh("faq");
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("FAQ 输出任务不存在。");

  const [downloadTaskRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, result_file_path
      FROM content_generation_download_tasks
      WHERE job_id = ?
    `,
    [jobId],
  );

  const inputFilePath = String(row.inputFilePath || "").trim();
  const resultFilePath = String(row.resultFilePath || "").trim();
  const downloadTaskFilePaths = downloadTaskRows
    .map((task) => String(task.result_file_path || "").trim())
    .filter(Boolean);

  await deletePersistedGenerationRows(jobId);
  await pool.query(
    `
      DELETE FROM content_generation_download_tasks
      WHERE job_id = ?
    `,
    [jobId],
  );
  await db.delete(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));

  if (inputFilePath) await rm(inputFilePath, { force: true }).catch(() => undefined);
  if (resultFilePath) await rm(resultFilePath, { force: true }).catch(() => undefined);
  await Promise.all(downloadTaskFilePaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));

  return { ok: true, jobId };
}

async function findRecentDuplicateGenerationJob(input: {
  scType: string;
  inputHash: string;
}) {
  const windowStart = new Date(Date.now() - generationDuplicateWindowMs);
  const rows = await db
    .select({
      id: contentGenerationJobs.id,
      inputFilePath: contentGenerationJobs.inputFilePath,
      createdAt: contentGenerationJobs.createdAt,
    })
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.scType, input.scType))
    .orderBy(desc(contentGenerationJobs.createdAt))
    .limit(50);

  for (const row of rows) {
    if (!row.createdAt || row.createdAt.getTime() < windowStart.getTime()) continue;
    const filePath = String(row.inputFilePath || "").trim();
    if (!filePath) continue;
    try {
      const buffer = await readFile(filePath);
      const existingHash = sha256(buffer.toString("base64"));
      if (existingHash === input.inputHash) {
        return row;
      }
    } catch {
      // Ignore unreadable historical files and keep scanning recent candidates.
    }
  }
  return null;
}

function getElapsedExecutionSnapshot(
  row:
    | {
        elapsedExecutionMs?: number | null;
        startedAt?: Date | null;
      }
    | undefined,
  now = new Date(),
) {
  const baseElapsedMs = Number(row?.elapsedExecutionMs || 0);
  if (!row?.startedAt) return { baseElapsedMs, settledElapsedMs: baseElapsedMs };
  const startedAtMs = row.startedAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) {
    return { baseElapsedMs, settledElapsedMs: baseElapsedMs };
  }
  return {
    baseElapsedMs,
    settledElapsedMs: Math.max(baseElapsedMs, baseElapsedMs + Math.max(0, nowMs - startedAtMs)),
  };
}

export async function markGenerationJobQueued(jobId: string) {
  clearGenerationHistoryCaches();
  const persisted = await getPersistedGenerationSummary(jobId);
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  const now = new Date();
  const { settledElapsedMs } = getElapsedExecutionSnapshot(row, now);
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
      resultFilePath: null,
      routeSummaryJson: null,
      rowResultsJson: null,
      elapsedExecutionMs: settledElapsedMs,
      startedAt: null,
      finishedAt: null,
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

export async function markGenerationJobRunning(jobId: string) {
  clearGenerationHistoryCaches();
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
      resultFilePath: null,
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
  const runningRows = await db
    .select()
    .from(contentGenerationJobs)
    .where(
      and(
        eq(contentGenerationJobs.scType, scType),
        eq(contentGenerationJobs.status, "running"),
        isNull(contentGenerationJobs.finishedAt),
      ),
    );

  if (!runningRows.length) return;
  const now = new Date();
  await Promise.all(
    runningRows.map((row) => {
      const { settledElapsedMs } = getElapsedExecutionSnapshot(row, now);
      return db
        .update(contentGenerationJobs)
        .set({
          status: "queued",
          errorReason: null,
          elapsedExecutionMs: settledElapsedMs,
          startedAt: null,
          finishedAt: null,
        })
        .where(eq(contentGenerationJobs.id, row.id));
    }),
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
  resultFilePath?: string | null;
  routeSummary: RouteSummaryRow[];
  rowResults: RowRuntimeResult[];
  errorReason?: string;
}) {
  clearGenerationHistoryCaches();
  scheduleMaterializedHistorySummaryRefresh("faq");
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, input.jobId));
  const row = rows[0];
  const now = new Date();
  const { settledElapsedMs } = getElapsedExecutionSnapshot(row, now);
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
      resultFilePath: input.resultFilePath || null,
      routeSummaryJson: input.routeSummary,
      rowResultsJson: null,
      errorReason: input.errorReason || null,
      elapsedExecutionMs: settledElapsedMs,
      finishedAt: now,
    })
    .where(eq(contentGenerationJobs.id, input.jobId));

  if (!input.resultFilePath && !input.resultFileBase64) {
    const refreshedRows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, input.jobId));
    const refreshedRow = refreshedRows[0];
    if (refreshedRow && (refreshedRow.status === "done" || refreshedRow.status === "failed")) {
      await rebuildGenerationResultArtifact(refreshedRow);
    }
  }
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
  clearGenerationHistoryCaches();
  scheduleMaterializedHistorySummaryRefresh("faq");
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  const now = new Date();
  const { settledElapsedMs } = getElapsedExecutionSnapshot(row, now);
  await db
    .update(contentGenerationJobs)
    .set({
      status: "failed",
      errorReason: message,
      rowResultsJson: null,
      resultFilePath: null,
      elapsedExecutionMs: settledElapsedMs,
      finishedAt: now,
    })
    .where(eq(contentGenerationJobs.id, jobId));
}

async function getGenerationQueueCount(scType: string) {
  const cacheKey = buildGenerationQueueCountCacheKey(scType);
  const cached = getHistoryCacheValue<number>(generationQueueCountCache, cacheKey);
  if (typeof cached === "number") return { total: cached, totalIsEstimated: false };

  const [countRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total_count
      FROM content_generation_jobs FORCE INDEX (idx_generation_jobs_sc_type_id)
      WHERE sc_type = ?
    `,
    [scType],
  );
  const total = Number((countRows[0] as Record<string, unknown> | undefined)?.total_count || 0);
  setTimedCacheValue(generationQueueCountCache, cacheKey, total, generationQueueCountCacheTtlMs);
  return { total, totalIsEstimated: false };
}

function mapGenerationQueueRow(row: Record<string, unknown>) {
  const formatQueueTime = (value: unknown) => {
    if (!value) return "";
    if (value instanceof Date) return formatChinaIsoOffset(new Date(value.getTime() + 8 * 60 * 60 * 1000));
    const text = String(value || "").trim();
    if (!text) return "";
    const normalized = text.includes("T") ? text : text.replace(" ", "T");
    const withZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
    return formatChinaIsoOffset(new Date(withZone));
  };
  const hasResultFilePath = Boolean(String(row.result_file_path || ""));
  const hasResultFileBase64 = Number(row.has_result_file_base64 || 0) > 0;
  const hasInputFileBase64 = Number(row.has_input_file_base64 || 0) > 0;
  const hasInputFilePath = Number(row.has_input_file_path || 0) > 0;
  return {
    id: String(row.id || ""),
    status: String(row.status || ""),
    scType: String(row.sc_type || ""),
    uploader: String(row.uploader || ""),
    note: String(row.note || ""),
    inputFileName: String(row.input_file_name || ""),
    totalRows: Number(row.total_rows || 0),
    executableRows: Number(row.executable_rows || 0),
    successRows: Number(row.success_rows || 0),
    failedRows: Number(row.failed_rows || 0),
    skippedRows: Number(row.skipped_rows || 0),
    totalTokensSum: Number(row.total_tokens_sum || 0),
    estimatedCostUsdSum: Number(row.estimated_cost_usd_sum || 0),
    elapsedExecutionMs: Number(row.elapsed_execution_ms || 0),
    aiModel: String(row.ai_model || ""),
    errorReason: String(row.error_reason || ""),
    resultFileName: String(row.result_file_name || ""),
    resultFilePath: String(row.result_file_path || ""),
    canDownload: hasResultFilePath || Boolean(row.result_file_name || row.status === "done" || row.status === "failed"),
    canDownloadFieldExtract: hasResultFilePath || hasResultFileBase64 || hasInputFilePath || hasInputFileBase64,
    createdAt: formatQueueTime(row.created_at),
    startedAt: formatQueueTime(row.started_at),
    finishedAt: formatQueueTime(row.finished_at),
    routeSummary: (row.route_summary_json as RouteSummaryRow[] | null) || [],
  };
}

function getCachedGenerationHistoryCount(input: HistoryFilters) {
  const cacheKey = buildGenerationCountCacheKey(input);
  const cached = getHistoryCacheValue<number>(generationHistoryCountCache, cacheKey);
  return typeof cached === "number" ? cached : null;
}

function primeGenerationHistoryCount(input: HistoryFilters, whereSql: string, params: unknown[]) {
  const cacheKey = buildGenerationCountCacheKey(input);
  if (generationHistoryCountInFlight.has(cacheKey)) {
    return generationHistoryCountInFlight.get(cacheKey)!;
  }
  const promise = pool
    .query<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total_count
        FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
        INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
        ${whereSql}
      `,
      params,
    )
    .then(([countRows]) => {
      const total = Number((countRows[0] as Record<string, unknown> | undefined)?.total_count || 0);
      setTimedCacheValue(generationHistoryCountCache, cacheKey, total, generationCountCacheTtlMs);
      return total;
    })
    .finally(() => {
      generationHistoryCountInFlight.delete(cacheKey);
    });
  generationHistoryCountInFlight.set(cacheKey, promise);
  return promise;
}

export async function listGenerationJobs(page: number, pageSize: number, scType = "faq") {
  const startedAt = Date.now();
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Number(pageSize || 20));
  const start = (safePage - 1) * safePageSize;
  const [rawRows, countInfo] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `
        SELECT
          id,
          status,
          sc_type,
          uploader,
          note,
          input_file_name,
          total_rows,
          executable_rows,
          success_rows,
          failed_rows,
          skipped_rows,
          total_tokens_sum,
          estimated_cost_usd_sum,
          elapsed_execution_ms,
          ai_model,
          error_reason,
          result_file_name,
          result_file_path,
          route_summary_json,
          CASE WHEN result_file_base64 IS NULL OR result_file_base64 = '' THEN 0 ELSE 1 END AS has_result_file_base64,
          CASE WHEN input_file_path IS NULL OR input_file_path = '' THEN 0 ELSE 1 END AS has_input_file_path,
          CASE WHEN input_file_base64 IS NULL OR input_file_base64 = '' THEN 0 ELSE 1 END AS has_input_file_base64,
          created_at,
          started_at,
          finished_at
        FROM content_generation_jobs FORCE INDEX (idx_generation_jobs_sc_type_id)
        WHERE sc_type = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [scType, safePageSize + 1, start],
    ),
    getGenerationQueueCount(scType),
  ]);

  const rows = rawRows[0].slice(0, safePageSize);
  const hasMore = rawRows[0].length > safePageSize;
  const total = countInfo.total;
  const totalIsEstimated = countInfo.totalIsEstimated;

  logGenerationPerf("queue", {
    scType,
    page: safePage,
    pageSize: safePageSize,
    rows: rows.length,
    total,
    durationMs: Date.now() - startedAt,
  });

  return {
    total,
    hasMore,
    totalIsEstimated,
    rows: rows.map((row) => mapGenerationQueueRow(row as unknown as Record<string, unknown>)),
  };
}

async function readMaterializedHistorySummary(input: HistoryFilters): Promise<GenerationHistorySummaryResult | null> {
  await ensureGenerationHistorySummaryTable();
  const scType = input.scType || "faq";
  const uploaderFilter = toGenerationHistoryFilterValue(input.uploader);
  const countryFilter = toGenerationHistoryFilterValue(input.country, "country");
  const subclassFilter = toGenerationHistoryFilterValue(input.subclass, "subclass");

  const [globalRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT refreshed_at
      FROM ${generationHistorySummaryTableName}
      WHERE sc_type = ?
        AND summary_version = ?
        AND uploader_filter = ?
        AND country_filter = ?
        AND subclass_filter = ?
        AND dimension_type = 'summary'
        AND dimension_value = ?
      LIMIT 1
    `,
    [scType, generationHistorySummaryVersion, generationHistoryAllFilter, generationHistoryAllFilter, generationHistoryAllFilter, generationHistorySummaryDimension],
  );

  const globalRefreshedAtRaw = (globalRows[0] as Record<string, unknown> | undefined)?.refreshed_at;
  const globalRefreshedAt =
    globalRefreshedAtRaw instanceof Date
      ? globalRefreshedAtRaw.toISOString()
      : globalRefreshedAtRaw
        ? new Date(String(globalRefreshedAtRaw)).toISOString()
        : null;

  if (!globalRefreshedAt) {
    scheduleMaterializedHistorySummaryRefresh(scType);
    return createEmptyHistorySummaryResult(generationHistorySummaryRefreshPromise ? "building" : "stale", null);
  }

  const [summaryRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT *
      FROM ${generationHistorySummaryTableName}
      WHERE sc_type = ?
        AND summary_version = ?
        AND uploader_filter = ?
        AND country_filter = ?
        AND subclass_filter = ?
        AND dimension_type = 'summary'
        AND dimension_value = ?
      LIMIT 1
    `,
      [scType, generationHistorySummaryVersion, uploaderFilter, countryFilter, subclassFilter, generationHistorySummaryDimension],
  );

  const summaryRow = summaryRows[0] as Record<string, unknown> | undefined;
  if (!summaryRow) {
    return createEmptyHistorySummaryResult("ready", globalRefreshedAt);
  }

  const baseResult: GenerationHistorySummaryResult = {
    summaryStatus: generationHistorySummaryRefreshPromise ? "stale" : "ready",
    refreshedAt:
      summaryRow.refreshed_at instanceof Date
        ? summaryRow.refreshed_at.toISOString()
        : summaryRow.refreshed_at
          ? new Date(String(summaryRow.refreshed_at)).toISOString()
          : globalRefreshedAt,
    summary: {
      totalRows: Number(summaryRow.row_count || 0),
      uniqueResultCount: Number(summaryRow.unique_result_count || 0),
      merchantCount: Number(summaryRow.merchant_count || 0),
      countryCount: Number(summaryRow.country_count || 0),
      subclassCount: Number(summaryRow.subclass_count || 0),
    },
    byCountry: [],
    bySubclass: [],
  };

  if (!baseResult.summary.totalRows) {
    return baseResult;
  }

  if (countryFilter === generationHistoryAllFilter) {
    const [countryRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT *
        FROM ${generationHistorySummaryTableName}
        WHERE sc_type = ?
          AND summary_version = ?
          AND uploader_filter = ?
          AND country_filter = ?
          AND subclass_filter = ?
          AND dimension_type = 'country'
        ORDER BY unique_result_count DESC, dimension_value ASC
      `,
      [scType, generationHistorySummaryVersion, uploaderFilter, countryFilter, subclassFilter],
    );
    baseResult.byCountry = countryRows.map((row) => ({
      country: String(row.dimension_value || ""),
      rowCount: Number(row.row_count || 0),
      uniqueResultCount: Number(row.unique_result_count || 0),
      merchantCount: Number(row.merchant_count || 0),
      subclassCount: Number(row.subclass_count || 0),
    }));
  } else {
    baseResult.byCountry = [
      {
        country: String(input.country || ""),
        rowCount: baseResult.summary.totalRows,
        uniqueResultCount: baseResult.summary.uniqueResultCount,
        merchantCount: baseResult.summary.merchantCount,
        subclassCount: baseResult.summary.subclassCount,
      },
    ];
  }

  if (subclassFilter === generationHistoryAllFilter) {
    const [subclassRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT *
        FROM ${generationHistorySummaryTableName}
        WHERE sc_type = ?
          AND summary_version = ?
          AND uploader_filter = ?
          AND country_filter = ?
          AND subclass_filter = ?
          AND dimension_type = 'subclass'
        ORDER BY unique_result_count DESC, dimension_value ASC
      `,
      [scType, generationHistorySummaryVersion, uploaderFilter, countryFilter, subclassFilter],
    );
    baseResult.bySubclass = subclassRows.map((row) => ({
      subclass: String(row.dimension_value || ""),
      rowCount: Number(row.row_count || 0),
      uniqueResultCount: Number(row.unique_result_count || 0),
      merchantCount: Number(row.merchant_count || 0),
      countryCount: Number(row.country_count || 0),
    }));
  } else {
    baseResult.bySubclass = [
      {
        subclass: String(input.subclass || ""),
        rowCount: baseResult.summary.totalRows,
        uniqueResultCount: baseResult.summary.uniqueResultCount,
        merchantCount: baseResult.summary.merchantCount,
        countryCount: baseResult.summary.countryCount,
      },
    ];
  }

  return baseResult;
}

export async function getGenerationJobResult(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  const hasReadableResultPath = row?.resultFilePath ? await pathExists(row.resultFilePath) : false;
  const rebuiltResult =
    row &&
    !row.resultFileBase64 &&
    (!row.resultFilePath || !hasReadableResultPath) &&
    (row.status === "done" || row.status === "failed")
      ? await rebuildGenerationResultArtifact(row)
      : null;
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  const persistedRows = row.rowResultsJson ? null : await listPersistedGenerationRows(jobId);
  return {
    id: row.id,
    fileName: rebuiltResult?.fileName || row.resultFileName || `faq-output-${row.id}.xlsx`,
    xlsxBase64: rebuiltResult?.xlsxBase64 || row.resultFileBase64 || "",
    status: row.status,
    routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
    rowResults:
      (row.rowResultsJson as RowRuntimeResult[] | null) ||
      (persistedRows || []).map((item) =>
        item.status === "success"
          ? {
              rowIndex: item.rowIndex,
              status: "success" as const,
              subclass: item.subclass,
              factType: item.factType,
              routeKey: item.routeKey,
              runtime: {
                elapsedMs: item.elapsedMs,
                promptTokens: item.promptTokens,
                completionTokens: item.completionTokens,
                totalTokens: item.totalTokens,
                estimatedCostUsd: item.estimatedCostUsd,
                aiModel: item.aiModel,
              },
            }
          : {
              rowIndex: item.rowIndex,
              status: "error" as const,
              subclass: item.subclass,
              factType: item.factType,
              routeKey: item.routeKey,
              error: item.errorReason,
            },
      ),
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

export async function getGenerationJobDownloadPayload(jobId: string, options?: { variant?: GenerationDownloadVariant }) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("Current FAQ output task was not found.");
  const variant = options?.variant || "main";

  let fileBuffer: Buffer | null = null;
  if (row.resultFilePath) {
    try {
      const diskBuffer = await readFile(row.resultFilePath);
      if (isLikelyXlsxBuffer(diskBuffer)) {
        fileBuffer = diskBuffer;
      }
    } catch {
      fileBuffer = null;
    }
  }

  if (!fileBuffer && row.resultFileBase64) {
    const base64Buffer = Buffer.from(row.resultFileBase64, "base64");
    if (isLikelyXlsxBuffer(base64Buffer)) {
      fileBuffer = base64Buffer;
    }
  }
  if (!fileBuffer) {
    const persistedBuffer = await buildWorkbookFromPersistedRows(row.id, variant);
    if (persistedBuffer && isLikelyXlsxBuffer(persistedBuffer)) {
      fileBuffer = persistedBuffer;
    }
  }
  if (!fileBuffer) {
    throw new Error(row.errorReason || "Current FAQ output task has no downloadable result yet.");
  }

  const trimmedBuffer = buildWorkbookForVariant(fileBuffer, variant);
  const baseName = row.resultFileName || `faq-output-${row.id}.xlsx`;
  const fileExt = path.extname(baseName) || ".xlsx";
  const fileStem = path.basename(baseName, fileExt);
  const fileName = variant === "field_extract" ? `${fileStem}-field-extract${fileExt}` : variant === "full" ? `${fileStem}-full${fileExt}` : baseName;

  return {
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: trimmedBuffer,
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
    elapsedExecutionMs: Number(row.elapsedExecutionMs || 0),
    aiModel: row.aiModel,
    errorReason: row.errorReason || "",
    createdAt: formatChinaIsoOffset(row.createdAt),
    startedAt: formatChinaIsoOffset(row.startedAt),
    finishedAt: formatChinaIsoOffset(row.finishedAt),
    routeSummary: (row.routeSummaryJson as RouteSummaryRow[] | null) || [],
  };
}

export async function getGenerationValidationLogs(jobId: string) {
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, jobId));
  const row = rows[0];
  if (!row) throw new Error("未找到 FAQ 输出任务。");
  return getPersistedGenerationValidationLogs(jobId);
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
    inputFilePath: row.inputFilePath || "",
    inputFileBase64: row.inputFileBase64 || "",
  };
}

export async function getGenerationHistorySummary(input: HistoryFilters): Promise<GenerationHistorySummaryResult> {
  const cacheKey = buildGenerationHistoryCacheKey(input);
  const cached = getHistoryCacheValue<GenerationHistorySummaryResult>(generationHistorySummaryCache, cacheKey);
  if (cached) return cached;
  const startedAt = Date.now();

  if (supportsMaterializedHistorySummary(input)) {
    const materialized = await readMaterializedHistorySummary(input);
    if (materialized) {
      if (materialized.summaryStatus === "ready") {
        setHistoryCacheValue(generationHistorySummaryCache, cacheKey, materialized);
      }
      return materialized;
    }
  }

  const { whereSql, params } = buildPersistedHistoryWhere(input);

  try {
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          COUNT(*) AS total_rows,
          COUNT(DISTINCT CONCAT(r.country, '::', r.term_id, '::', r.subclass)) AS unique_result_count,
          COUNT(DISTINCT CONCAT(r.country, '::', r.term_id)) AS merchant_count,
          COUNT(DISTINCT r.country) AS country_count,
          COUNT(DISTINCT r.subclass) AS subclass_count
        FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
        INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
        ${whereSql}
      `,
      params,
    );

    const totalRows = Number(((summaryRows[0] || {}) as Record<string, unknown>).total_rows || 0);
    if (totalRows === 0) {
      const empty = createEmptyHistorySummaryResult("ready", new Date().toISOString());
      setHistoryCacheValue(generationHistorySummaryCache, cacheKey, empty);
      return empty;
    }

    const [byCountryRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          r.country AS country,
          COUNT(*) AS row_count,
          COUNT(DISTINCT CONCAT(r.term_id, '::', r.subclass)) AS unique_result_count,
          COUNT(DISTINCT r.term_id) AS merchant_count,
          COUNT(DISTINCT r.subclass) AS subclass_count
        FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
        INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
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
          COUNT(DISTINCT CONCAT(r.country, '::', r.term_id, '::', r.subclass)) AS unique_result_count,
          COUNT(DISTINCT CONCAT(r.country, '::', r.term_id)) AS merchant_count,
          COUNT(DISTINCT r.country) AS country_count
        FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
        INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
        ${whereSql}
        GROUP BY r.subclass
        ORDER BY unique_result_count DESC, subclass ASC
      `,
      params,
    );

    const summaryRow = (summaryRows[0] || {}) as Record<string, unknown>;
    const result = {
      summaryStatus: "ready" as const,
      refreshedAt: new Date().toISOString(),
      summary: {
        totalRows: Number(summaryRow.total_rows || 0),
        uniqueResultCount: Number(summaryRow.unique_result_count || 0),
        merchantCount: Number(summaryRow.merchant_count || 0),
        countryCount: Number(summaryRow.country_count || 0),
        subclassCount: Number(summaryRow.subclass_count || 0),
      },
      byCountry: byCountryRows.map((row) => ({
        country: String(row.country || ""),
        rowCount: Number(row.row_count || 0),
        uniqueResultCount: Number(row.unique_result_count || 0),
        merchantCount: Number(row.merchant_count || 0),
        subclassCount: Number(row.subclass_count || 0),
      })),
      bySubclass: bySubclassRows.map((row) => ({
        subclass: String(row.subclass || ""),
        rowCount: Number(row.row_count || 0),
        uniqueResultCount: Number(row.unique_result_count || 0),
        merchantCount: Number(row.merchant_count || 0),
        countryCount: Number(row.country_count || 0),
      })),
    };
    logGenerationPerf("historySummary", {
      totalRows: result.summary.totalRows,
      durationMs: Date.now() - startedAt,
      materialized: false,
    });
    setHistoryCacheValue(generationHistorySummaryCache, cacheKey, result);
    return result;
  } catch (error) {
    if (!isMissingGenerationRowsTableError(error)) throw error;
    const result = buildLegacyHistorySummary(await loadLegacyHistoryRows(input));
    setHistoryCacheValue(generationHistorySummaryCache, cacheKey, result);
    return result;
  }
}

export async function listGenerationHistoryRows(input: HistoryFilters): Promise<GenerationHistoryRowsResult> {
  const cacheKey = buildGenerationHistoryCacheKey(input);
  const cached = getHistoryCacheValue<GenerationHistoryRowsResult>(generationHistoryRowsCache, cacheKey);
  if (cached) return cached;
  const startedAt = Date.now();
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.max(1, Number(input.pageSize || 20));
  const start = (page - 1) * pageSize;
  const { whereSql, params } = buildPersistedHistoryWhere(input);

  try {
    const cachedTotal = getCachedGenerationHistoryCount(input);
    void primeGenerationHistoryCount(input, whereSql, params).catch(() => undefined);
    const [pageKeyRows] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `
          SELECT
            r.job_id,
            r.row_index
          FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_status_created_id)
          STRAIGHT_JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_job_status_country_subclass_term_row) ON r.job_id = j.id
          ${whereSql}
          ORDER BY j.created_at DESC, r.row_index ASC
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize + 1, start],
      ),
    ]);

    const pageKeys = pageKeyRows[0].slice(0, pageSize).map((row) => ({
      jobId: String(row.job_id || ""),
      rowIndex: Number(row.row_index || 0),
    }));
    const hasMore = pageKeyRows[0].length > pageSize;

    if (!pageKeys.length) {
      const result = {
        total: cachedTotal ?? start,
        hasMore: false,
        totalIsEstimated: cachedTotal == null,
        rows: [],
      };
      logGenerationPerf("historyRows", {
        page,
        pageSize,
        rows: 0,
        total: result.total,
        hasMore: false,
        totalIsEstimated: result.totalIsEstimated,
        durationMs: Date.now() - startedAt,
      });
      setHistoryCacheValue(generationHistoryRowsCache, cacheKey, result);
      return result;
    }

    let rows: RowDataPacket[] = [];
    if (pageKeys.length) {
      const tuplePlaceholders = pageKeys.map(() => "(?, ?)").join(", ");
      const tupleParams = pageKeys.flatMap((item) => [item.jobId, item.rowIndex]);
      const orderedKeys = pageKeys.map((item) => `${item.jobId}:${item.rowIndex}`);
      const fieldPlaceholders = orderedKeys.map(() => "?").join(", ");
      const [detailRows] = await pool.query<RowDataPacket[]>(
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
            r.brief_introduction,
            r.row_index
          FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_status_created_id)
          STRAIGHT_JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_job_status_country_subclass_term_row) ON r.job_id = j.id
          WHERE (r.job_id, r.row_index) IN (${tuplePlaceholders})
          ORDER BY FIELD(CONCAT(r.job_id, ':', r.row_index), ${fieldPlaceholders})
        `,
        [...tupleParams, ...orderedKeys],
      );
      rows = detailRows;
    }

    const estimatedTotal = start + pageKeys.length + (hasMore ? 1 : 0);
    const total = cachedTotal ?? estimatedTotal;
    const result = {
      total,
      hasMore,
      totalIsEstimated: cachedTotal == null,
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
    logGenerationPerf("historyRows", {
      page,
      pageSize,
      rows: result.rows.length,
      total,
      hasMore,
      totalIsEstimated: result.totalIsEstimated,
      durationMs: Date.now() - startedAt,
    });
    setHistoryCacheValue(generationHistoryRowsCache, cacheKey, result);
    return result;
  } catch (error) {
    if (!isMissingGenerationRowsTableError(error)) throw error;
    const legacyRows = await loadLegacyHistoryRows(input);
    const pagedRows = legacyRows.slice(start, start + pageSize);
    const result = {
      total: legacyRows.length,
      hasMore: start + pagedRows.length < legacyRows.length,
      totalIsEstimated: false,
      rows: pagedRows.map((row) => ({
        jobId: row.jobId,
        uploader: row.uploader,
        createdAt: formatChinaIsoOffset(row.createdAt),
        finishedAt: formatChinaIsoOffset(row.finishedAt),
        Country: row.Country,
        TermID: row.TermID,
        TermName: row.TermName,
        Domain: row.Domain,
        Subclass: row.Subclass,
        Titile1: row.Titile1,
        "Brief Introduction": row["Brief Introduction"],
      })),
    };
    logGenerationPerf("historyRows-legacy", {
      page,
      pageSize,
      rows: result.rows.length,
      total: result.total,
      durationMs: Date.now() - startedAt,
    });
    setHistoryCacheValue(generationHistoryRowsCache, cacheKey, result);
    return result;
  }
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

async function writeHistoryExportFile(input: HistoryFilters & { format?: "xlsx" | "csv" }, taskId: string) {
  const allRows = await listDoneGenerationRows(input.scType || "faq");
  const filteredRows = filterHistoryRows(allRows, input);
  const exportRows = buildHistoryExportRows(filteredRows);
  const format = input.format || "xlsx";
  const fileName = buildGenerationHistoryFileName(input, format);
  const resultFilePath = path.join(FAQ_DOWNLOAD_TASK_DIR, `${taskId}.${format}`);

  if (format === "csv") {
    await writeFile(resultFilePath, Buffer.from(toCsv(exportRows), "utf8"));
    return {
      fileName,
      resultFilePath,
      contentType: "text/csv;charset=utf-8",
    };
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "faq_history");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await writeFile(resultFilePath, Buffer.from(buffer));
  return {
    fileName,
    resultFilePath,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function generationVariantLabel(variant: GenerationDownloadTaskVariant) {
  if (variant === "field_extract") return "字段提取";
  if (variant === "full") return "完整结果";
  if (variant === "main") return "main";
  return sanitizeFileNameSegment(variant, "结果");
}

async function getGenerationDownloadMeta(jobId: string) {
  const [jobRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT sc_type, uploader, total_rows
      FROM content_generation_jobs
      WHERE id = ?
      LIMIT 1
    `,
    [jobId],
  );
  const [countryRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT DISTINCT country
      FROM content_generation_job_rows
      WHERE job_id = ? AND country IS NOT NULL AND country <> ''
      LIMIT 4
    `,
    [jobId],
  );
  const countries = countryRows.map((row) => String(row.country || "").trim().toUpperCase()).filter(Boolean);
  const country = countries.length <= 0 ? "NA" : countries.length === 1 ? countries[0] : `MULTI${countries.length}`;
  const job = jobRows[0] || {};
  return {
    scType: String(job.sc_type || "faq"),
    uploader: String(job.uploader || ""),
    totalRows: Number(job.total_rows || 0),
    country,
  };
}

function buildGenerationJobFileName(input: {
  jobId: string;
  variant: GenerationDownloadTaskVariant;
  scType: string;
  country: string;
  totalRows: number;
}) {
  const scType = sanitizeFileNameSegment(input.scType || "faq", "faq");
  const country = sanitizeFileNameSegment(input.country, "NA");
  const rowCount = Math.max(0, Number(input.totalRows || 0));
  const variant = generationVariantLabel(input.variant);
  return `FAQ输出_${scType}_${country}_${rowCount}行_${variant}_${formatChinaDownloadTimestamp()}_${shortDownloadId(input.jobId, "job")}.xlsx`;
}

function buildGenerationHistoryFileName(input: HistoryFilters & { format?: "xlsx" | "csv" }, format: "xlsx" | "csv") {
  const scType = sanitizeFileNameSegment(input.scType || "faq", "faq");
  const country = sanitizeFileNameSegment(input.country ? normalizeCountry(input.country) : "ALL", "ALL");
  const uploader = sanitizeFileNameSegment(input.uploader || "ALL", "ALL");
  return `FAQ历史_${scType}_${country}_${uploader}_${format}_${formatChinaDownloadTimestamp()}.${format}`;
}

function mapDownloadTaskRow(row: RowDataPacket) {
  return {
    taskId: String(row.id || ""),
    jobId: String(row.job_id || ""),
    variant: String(row.variant || "") as GenerationDownloadTaskVariant,
    status: String(row.status || "") as GenerationDownloadTaskStatus,
    progressPercent: Number(row.progress_percent || 0),
    statusText: String(row.status_text || ""),
    fileName: String(row.file_name || ""),
    resultFilePath: String(row.result_file_path || ""),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    errorMessage: String(row.error_message || ""),
    expiresAt: row.expires_at ? formatChinaIsoOffset(row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at))) : null,
    createdAt: formatChinaIsoOffset(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at || ""))),
    updatedAt: formatChinaIsoOffset(row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at || ""))),
  };
}

async function updateDownloadTask(
  taskId: string,
  input: {
    status: GenerationDownloadTaskStatus;
    progressPercent: number;
    statusText: string;
    fileName?: string;
    resultFilePath?: string;
    fileSizeBytes?: number;
    errorMessage?: string | null;
    expiresAt?: Date | null;
  },
) {
  await pool.query(
    `
      UPDATE content_generation_download_tasks
      SET
        status = ?,
        progress_percent = ?,
        status_text = ?,
        file_name = COALESCE(?, file_name),
        result_file_path = COALESCE(?, result_file_path),
        file_size_bytes = COALESCE(?, file_size_bytes),
        error_message = ?,
        expires_at = COALESCE(?, expires_at)
      WHERE id = ?
    `,
    [
      input.status,
      Math.max(0, Math.min(100, Math.round(input.progressPercent))),
      input.statusText,
      input.fileName ?? null,
      input.resultFilePath ?? null,
      input.fileSizeBytes ?? null,
      input.errorMessage ?? null,
      input.expiresAt ?? null,
      taskId,
    ],
  );
}

async function prepareGenerationDownloadTask(taskId: string, input: HistoryFilters & { jobId: string; variant: GenerationDownloadTaskVariant; format?: "xlsx" | "csv" }) {
  try {
    await updateDownloadTask(taskId, {
      status: "preparing",
      progressPercent: 15,
      statusText: "正在后台准备文件，可继续浏览页面。",
    });
    await mkdir(FAQ_DOWNLOAD_TASK_DIR, { recursive: true });

    let fileName = "";
    let resultFilePath = "";
    let contentType = "application/octet-stream";

    if (input.variant === "history_xlsx" || input.variant === "history_csv") {
      const exportResult = await writeHistoryExportFile(
        {
          scType: input.scType,
          country: input.country,
          subclass: input.subclass,
          uploader: input.uploader,
          keyword: input.keyword,
          startDate: input.startDate,
          endDate: input.endDate,
          format: input.variant === "history_csv" ? "csv" : "xlsx",
        },
        taskId,
      );
      fileName = exportResult.fileName;
      resultFilePath = exportResult.resultFilePath;
      contentType = exportResult.contentType;
    } else {
      const payload = await getGenerationJobDownloadPayload(input.jobId, { variant: input.variant });
      const meta = await getGenerationDownloadMeta(input.jobId);
      fileName = buildGenerationJobFileName({
        jobId: input.jobId,
        variant: input.variant,
        scType: meta.scType,
        country: meta.country,
        totalRows: meta.totalRows,
      });
      contentType = payload.contentType;
      resultFilePath = path.join(FAQ_DOWNLOAD_TASK_DIR, `${taskId}.xlsx`);
      await writeFile(resultFilePath, payload.buffer);
    }

    const fileStat = await stat(resultFilePath);
    await updateDownloadTask(taskId, {
      status: "ready",
      progressPercent: 100,
      statusText: "文件准备完成，浏览器即将开始下载。",
      fileName,
      resultFilePath,
      fileSizeBytes: fileStat.size,
      errorMessage: null,
      expiresAt: new Date(Date.now() + faqDownloadTaskRetentionMs),
    });
    return { contentType };
  } catch (error) {
    await updateDownloadTask(taskId, {
      status: "failed",
      progressPercent: 100,
      statusText: "文件准备失败。",
      errorMessage: error instanceof Error ? error.message : String(error),
      expiresAt: new Date(Date.now() + faqDownloadTaskRetentionMs),
    });
    throw error;
  }
}

export async function createGenerationDownloadTask(input: {
  jobId: string;
  variant?: GenerationDownloadVariant;
}) {
  const { makeId } = await import("../utils/id");
  const id = makeId();
  const variant = input.variant || "main";
  await pool.query(
    `
      INSERT INTO content_generation_download_tasks
        (id, job_id, variant, status, progress_percent, status_text, expires_at)
      VALUES (?, ?, ?, 'queued', 0, '已加入下载准备队列。', ?)
    `,
    [id, input.jobId, variant, new Date(Date.now() + faqDownloadTaskRetentionMs)],
  );
  void prepareGenerationDownloadTask(id, { jobId: input.jobId, variant }).catch((error) => {
    console.error("faq download task failed", error);
  });
  return getGenerationDownloadTask(id);
}

export async function createGenerationHistoryExportDownloadTask(input: HistoryFilters & { format?: "xlsx" | "csv" }) {
  const { makeId } = await import("../utils/id");
  const id = makeId();
  const variant: GenerationDownloadTaskVariant = (input.format || "xlsx") === "csv" ? "history_csv" : "history_xlsx";
  await pool.query(
    `
      INSERT INTO content_generation_download_tasks
        (id, job_id, variant, status, progress_percent, status_text, expires_at)
      VALUES (?, 'history-export', ?, 'queued', 0, '已加入历史导出准备队列。', ?)
    `,
    [id, variant, new Date(Date.now() + faqDownloadTaskRetentionMs)],
  );
  void prepareGenerationDownloadTask(id, { ...input, jobId: "history-export", variant }).catch((error) => {
    console.error("faq history export download task failed", error);
  });
  return getGenerationDownloadTask(id);
}

export async function getGenerationDownloadTask(taskId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT *
      FROM content_generation_download_tasks
      WHERE id = ?
      LIMIT 1
    `,
    [taskId],
  );
  const row = rows[0];
  if (!row) throw new Error("Download task was not found.");
  const mapped = mapDownloadTaskRow(row);
  if (mapped.status !== "expired" && row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
    await updateDownloadTask(taskId, {
      status: "expired",
      progressPercent: mapped.progressPercent,
      statusText: "下载文件已过期，请重新创建下载任务。",
      errorMessage: mapped.errorMessage || null,
    });
    return { ...mapped, status: "expired" as const, statusText: "下载文件已过期，请重新创建下载任务。" };
  }
  return mapped;
}

export async function getGenerationDownloadTaskFile(taskId: string) {
  const task = await getGenerationDownloadTask(taskId);
  if (task.status !== "ready") throw new Error(task.errorMessage || "Download task is not ready yet.");
  if (!task.resultFilePath || !(await pathExists(task.resultFilePath))) {
    throw new Error("Prepared download file is missing or expired.");
  }
  const fileStat = await stat(task.resultFilePath);
  const ext = path.extname(task.fileName || "").toLowerCase();
  return {
    fileName: task.fileName || `faq-download-${taskId}${ext || ".xlsx"}`,
    resultFilePath: task.resultFilePath,
    contentType:
      ext === ".csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSizeBytes: fileStat.size,
  };
}

export async function exportGenerationCountryRollup(input: { scType?: string; country: string }) {
  const scType = input.scType || "faq";
  const country = normalizeCountry(input.country);
  if (!country) {
    throw new Error("country is required.");
  }

  const [successRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.country,
        r.term_id,
        r.term_name,
        r.domain,
        r.source,
        r.subclass,
        r.board_name,
        r.title1,
        r.brief_introduction,
        r.href_kw,
        r.href_url
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      WHERE j.sc_type = ? AND r.status = 'success' AND r.country = ?
      ORDER BY COALESCE(j.finished_at, j.created_at) DESC, r.job_id ASC, r.row_index ASC
    `,
    [scType, country],
  );

  const [failureRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.job_id,
        j.uploader,
        j.note,
        j.created_at,
        j.finished_at,
        r.row_index,
        r.country,
        r.term_id,
        r.term_name,
        r.domain,
        r.fact_type,
        r.subclass,
        r.route_key,
        r.error_reason
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      WHERE j.sc_type = ? AND r.status = 'error' AND r.country = ?
      ORDER BY COALESCE(j.finished_at, j.created_at) DESC, r.job_id ASC, r.row_index ASC
    `,
    [scType, country],
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      successRows.map((row) => ({
        ContentType: "faq",
        Country: String(row.country || ""),
        TermID: String(row.term_id || ""),
        TermName: String(row.term_name || ""),
        Domain: String(row.domain || ""),
        Source: String(row.source || "AI"),
        Subclass: String(row.subclass || ""),
        [generationBoardNameField]: String(row.board_name || "faq"),
        Titile1: String(row.title1 || ""),
        "Brief Introduction": String(row.brief_introduction || ""),
        "Href Kw": String(row.href_kw || ""),
        "Href Url": String(row.href_url || ""),
      })),
      { header: [...outputHeaders] },
    ),
    faqDownloadSheetNames.output,
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      failureRows.map((row) => ({
        jobId: String(row.job_id || ""),
        uploader: String(row.uploader || ""),
        note: String(row.note || ""),
        createdAt: formatChinaIsoOffset(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at || ""))),
        finishedAt: formatChinaIsoOffset(row.finished_at instanceof Date ? row.finished_at : row.finished_at ? new Date(String(row.finished_at)) : null),
        rowIndex: Number(row.row_index || 0),
        country: String(row.country || ""),
        termId: String(row.term_id || ""),
        termName: String(row.term_name || ""),
        domain: String(row.domain || ""),
        factType: String(row.fact_type || ""),
        subclass: String(row.subclass || ""),
        routeKey: String(row.route_key || ""),
        error: String(row.error_reason || ""),
      })),
      {
        header: [
          "jobId",
          "uploader",
          "note",
          "createdAt",
          "finishedAt",
          "rowIndex",
          "country",
          "termId",
          "termName",
          "domain",
          "factType",
          "subclass",
          "routeKey",
          "error",
        ],
      },
    ),
    faqDownloadSheetNames.failures,
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    fileName: `FAQ国家汇总_${sanitizeFileNameSegment(scType, "faq")}_${sanitizeFileNameSegment(country, "NA")}_${formatChinaDownloadTimestamp()}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
    summary: {
      country,
      successRows: successRows.length,
      failureRows: failureRows.length,
    },
  };
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectDirectoryStats(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return { files: 0, bytes: 0 };
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  let files = 0;
  let bytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectDirectoryStats(fullPath);
      files += nested.files;
      bytes += nested.bytes;
      continue;
    }
    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    files += 1;
    bytes += fileStat.size;
  }

  return { files, bytes };
}

async function cleanupDirectoryByAge(targetPath: string, retentionMs: number) {
  if (!(await pathExists(targetPath))) return { removedFiles: 0, removedBytes: 0 };
  const now = Date.now();
  const entries = await readdir(targetPath, { withFileTypes: true });
  let removedFiles = 0;
  let removedBytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await cleanupDirectoryByAge(fullPath, retentionMs);
      removedFiles += nested.removedFiles;
      removedBytes += nested.removedBytes;
      const remaining = await readdir(fullPath).catch(() => []);
      if (!remaining.length) {
        await rm(fullPath, { recursive: true, force: true });
      }
      continue;
    }

    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    if (now - fileStat.mtimeMs < retentionMs) continue;
    removedFiles += 1;
    removedBytes += fileStat.size;
    await rm(fullPath, { force: true });
  }

  return { removedFiles, removedBytes };
}

async function cleanupFaqResultFiles() {
  await mkdir(FAQ_RESULT_DIR, { recursive: true });
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT result_file_path
      FROM content_generation_jobs
      WHERE sc_type = 'faq' AND result_file_path IS NOT NULL AND result_file_path <> ''
    `,
  );
  const referenced = new Set(rows.map((row) => String((row as Record<string, unknown>).result_file_path || "")));
  const entries = await readdir(FAQ_RESULT_DIR, { withFileTypes: true });
  const now = Date.now();
  let removedFiles = 0;
  let removedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(FAQ_RESULT_DIR, entry.name);
    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    const isReferenced = referenced.has(fullPath);
    const expired = now - fileStat.mtimeMs >= faqResultRetentionMs;
    if (isReferenced && !expired) continue;
    if (isReferenced && expired) continue;
    removedFiles += 1;
    removedBytes += fileStat.size;
    await rm(fullPath, { force: true });
  }

  return { removedFiles, removedBytes };
}

async function cleanupFaqInputFiles() {
  await mkdir(FAQ_INPUT_DIR, { recursive: true });
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, status, input_file_path, COALESCE(finished_at, created_at) AS retained_at
      FROM content_generation_jobs
      WHERE sc_type = 'faq' AND input_file_path IS NOT NULL AND input_file_path <> ''
    `,
  );
  const now = Date.now();
  let removedFiles = 0;
  let removedBytes = 0;

  for (const row of rows) {
    const inputFilePath = String(row.input_file_path || "");
    if (!inputFilePath) continue;
    if (!(await pathExists(inputFilePath))) continue;
    const retainedAt =
      row.retained_at instanceof Date ? row.retained_at.getTime() : new Date(String(row.retained_at || "")).getTime();
    const status = String(row.status || "");
    const retentionMs =
      status === "failed"
        ? faqFailedInputRetentionMs
        : status === "done"
          ? faqDoneInputRetentionMs
          : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(retainedAt) || now - retainedAt < retentionMs) continue;
    const fileStat = await stat(inputFilePath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    removedFiles += 1;
    removedBytes += fileStat.size;
    await rm(inputFilePath, { force: true });
  }

  return { removedFiles, removedBytes };
}

async function cleanupFaqDownloadTaskFiles() {
  await mkdir(FAQ_DOWNLOAD_TASK_DIR, { recursive: true });
  const [expiredRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, result_file_path
      FROM content_generation_download_tasks
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `,
  );
  let removedFiles = 0;
  let removedBytes = 0;

  for (const row of expiredRows) {
    const resultFilePath = String(row.result_file_path || "");
    if (!resultFilePath || !(await pathExists(resultFilePath))) continue;
    const fileStat = await stat(resultFilePath).catch(() => null);
    if (!fileStat?.isFile()) continue;
    await rm(resultFilePath, { force: true });
    removedFiles += 1;
    removedBytes += fileStat.size;
  }

  await pool.query(
    `
      UPDATE content_generation_download_tasks
      SET status = 'expired', status_text = '下载文件已过期，请重新创建下载任务。'
      WHERE expires_at IS NOT NULL AND expires_at < NOW() AND status <> 'expired'
    `,
  );

  return { removedFiles, removedBytes };
}

export async function runGenerationHousekeeping() {
  const startedAt = Date.now();
  const runtimeRoot = APP_RUNTIME_DIR;
  const tmpRoot = path.resolve(process.cwd(), "tmp");
  const [runtimeStats, faqInputStats, faqResultStats, tmpStats, faqResultCleanup, faqInputCleanup, faqDownloadCleanup, tmpCleanup] = await Promise.all([
    collectDirectoryStats(runtimeRoot),
    collectDirectoryStats(FAQ_INPUT_DIR),
    collectDirectoryStats(FAQ_RESULT_DIR),
    collectDirectoryStats(tmpRoot),
    cleanupFaqResultFiles(),
    cleanupFaqInputFiles(),
    cleanupFaqDownloadTaskFiles(),
    cleanupDirectoryByAge(tmpRoot, faqTmpRetentionMs),
  ]);

  logGenerationPerf("housekeeping", {
    runtimeFiles: runtimeStats.files,
    runtimeBytes: runtimeStats.bytes,
    faqInputFiles: faqInputStats.files,
    faqInputBytes: faqInputStats.bytes,
    faqResultFiles: faqResultStats.files,
    faqResultBytes: faqResultStats.bytes,
    tmpFiles: tmpStats.files,
    tmpBytes: tmpStats.bytes,
    removedResultFiles: faqResultCleanup.removedFiles,
    removedResultBytes: faqResultCleanup.removedBytes,
    removedInputFiles: faqInputCleanup.removedFiles,
    removedInputBytes: faqInputCleanup.removedBytes,
    removedDownloadTaskFiles: faqDownloadCleanup.removedFiles,
    removedDownloadTaskBytes: faqDownloadCleanup.removedBytes,
    removedTmpFiles: tmpCleanup.removedFiles,
    removedTmpBytes: tmpCleanup.removedBytes,
    durationMs: Date.now() - startedAt,
  });
}

export function startGenerationHousekeeping() {
  if (generationHousekeepingTimer) return;
  void runGenerationHousekeeping().catch((error) => {
    console.error("faq generation housekeeping failed", error);
  });
  generationHousekeepingTimer = setInterval(() => {
    void runGenerationHousekeeping().catch((error) => {
      console.error("faq generation housekeeping failed", error);
    });
  }, 24 * 60 * 60 * 1000);
}

export function warmGenerationHistoryCaches() {
  setTimeout(() => {
    void getGenerationHistorySummary({ scType: "faq" }).catch(() => undefined);
    void getGenerationQueueCount("faq").catch(() => undefined);
  }, 10_000);
}
