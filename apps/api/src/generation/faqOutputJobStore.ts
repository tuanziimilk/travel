import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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
const FAQ_RESULT_DIR = path.resolve(process.cwd(), ".runtime", "faq-output-results");
const generationCountCacheTtlMs = 30 * 1000;
const generationQueueCountCacheTtlMs = 15 * 1000;
const faqResultRetentionMs = 14 * 24 * 60 * 60 * 1000;
const faqTmpRetentionMs = 2 * 24 * 60 * 60 * 1000;

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

const failureSheetHeaders = ["rowIndex", "factType", "subclass", "routeKey", "error"] as const;
const faqDownloadSheetNames = {
  output: "FAQ_output",
  extract: "field_extract",
  failures: "failures",
} as const;

type GenerationDownloadVariant = "main" | "field_extract" | "full";

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

async function persistFaqResultWorkbook(jobId: string, fileName: string, workbookBuffer: Buffer) {
  await mkdir(FAQ_RESULT_DIR, { recursive: true });
  const safeExt = path.extname(fileName || "").toLowerCase() === ".xlsx" ? ".xlsx" : ".xlsx";
  const resultFilePath = path.join(FAQ_RESULT_DIR, `${jobId}${safeExt}`);
  await writeFile(resultFilePath, workbookBuffer);
  return resultFilePath;
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

async function rebuildGenerationResultArtifact(row: typeof contentGenerationJobs.$inferSelect) {
  if (!row.inputFileBase64) {
    return {
      fileName: row.resultFileName || `faq-output-${row.id}.xlsx`,
      xlsxBase64: row.resultFileBase64 || "",
      buffer: row.resultFileBase64 ? Buffer.from(row.resultFileBase64, "base64") : Buffer.alloc(0),
      resultFilePath: row.resultFilePath || "",
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
      resultFileBase64: xlsxBase64,
      resultFilePath,
    })
    .where(eq(contentGenerationJobs.id, row.id));

  return { fileName, xlsxBase64, buffer: workbookBuffer, resultFilePath };
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
  clearGenerationHistoryCaches();
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
      resultFilePath: null,
      routeSummaryJson: null,
      rowResultsJson: null,
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
  resultFilePath?: string | null;
  routeSummary: RouteSummaryRow[];
  rowResults: RowRuntimeResult[];
  errorReason?: string;
}) {
  clearGenerationHistoryCaches();
  scheduleMaterializedHistorySummaryRefresh("faq");
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
      resultFilePath: input.resultFilePath || null,
      routeSummaryJson: input.routeSummary,
      rowResultsJson: input.rowResults,
      errorReason: input.errorReason || null,
      finishedAt: new Date(),
    })
    .where(eq(contentGenerationJobs.id, input.jobId));

  if (!input.resultFilePath && !input.resultFileBase64) {
    const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.id, input.jobId));
    const row = rows[0];
    if (row && (row.status === "done" || row.status === "failed")) {
      await rebuildGenerationResultArtifact(row);
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
  await db
    .update(contentGenerationJobs)
    .set({
      status: "failed",
      errorReason: message,
      rowResultsJson: [{ rowIndex: 0, status: "error", subclass: "", factType: "", routeKey: "", error: message }],
      resultFilePath: null,
      finishedAt: new Date(),
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
    aiModel: String(row.ai_model || ""),
    errorReason: String(row.error_reason || ""),
    resultFileName: String(row.result_file_name || ""),
    resultFilePath: String(row.result_file_path || ""),
    canDownload: Boolean(row.result_file_path || row.result_file_name || row.status === "done" || row.status === "failed"),
    createdAt: formatChinaIsoOffset(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at || ""))),
    startedAt: formatChinaIsoOffset(row.started_at instanceof Date ? row.started_at : row.started_at ? new Date(String(row.started_at)) : null),
    finishedAt: formatChinaIsoOffset(row.finished_at instanceof Date ? row.finished_at : row.finished_at ? new Date(String(row.finished_at)) : null),
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
          ai_model,
          error_reason,
          result_file_name,
          result_file_path,
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
  const rebuiltResult =
    row && !row.resultFileBase64 && !row.resultFilePath && (row.status === "done" || row.status === "failed")
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

  const shouldRebuild =
    !fileBuffer &&
    (row.status === "done" || row.status === "failed") &&
    Boolean(row.inputFileBase64);
  const rebuiltResult = shouldRebuild ? await rebuildGenerationResultArtifact(row) : null;

  if (!fileBuffer && rebuiltResult?.buffer && isLikelyXlsxBuffer(rebuiltResult.buffer)) {
    fileBuffer = rebuiltResult.buffer;
  }
  if (!fileBuffer && rebuiltResult?.xlsxBase64) {
    const rebuiltBuffer = Buffer.from(rebuiltResult.xlsxBase64, "base64");
    if (isLikelyXlsxBuffer(rebuiltBuffer)) {
      fileBuffer = rebuiltBuffer;
    }
  }

  if (!fileBuffer) {
    throw new Error(row.errorReason || "Current FAQ output task has no downloadable result yet.");
  }

  const trimmedBuffer = buildWorkbookForVariant(fileBuffer, variant);
  const baseName = row.resultFileName || `faq-output-${row.id}.xlsx`;
  const fileExt = path.extname(baseName) || ".xlsx";
  const fileStem = path.basename(baseName, fileExt);
  const fileName =
    variant === "field_extract"
      ? `${fileStem}-field-extract${fileExt}`
      : variant === "full"
        ? `${fileStem}-full${fileExt}`
        : baseName;

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
      return buildLegacyHistorySummary(await loadLegacyHistoryRows(input));
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
          FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
          INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
          ${whereSql}
          ORDER BY COALESCE(j.finished_at, j.created_at) DESC, r.row_index ASC
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

    if (!pageKeys.length && cachedTotal === 0) {
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
          FROM content_generation_jobs j FORCE INDEX (idx_generation_jobs_sc_type_id, idx_generation_jobs_sc_type_uploader_id)
          INNER JOIN content_generation_job_rows r FORCE INDEX (idx_generation_rows_status_country_subclass_job_row) ON r.job_id = j.id
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
    fileName: `faq-result-${country}.xlsx`,
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

export async function runGenerationHousekeeping() {
  const startedAt = Date.now();
  const runtimeRoot = path.resolve(process.cwd(), ".runtime");
  const tmpRoot = path.resolve(process.cwd(), "tmp");
  const [runtimeStats, faqResultStats, tmpStats, faqResultCleanup, tmpCleanup] = await Promise.all([
    collectDirectoryStats(runtimeRoot),
    collectDirectoryStats(FAQ_RESULT_DIR),
    collectDirectoryStats(tmpRoot),
    cleanupFaqResultFiles(),
    cleanupDirectoryByAge(tmpRoot, faqTmpRetentionMs),
  ]);

  logGenerationPerf("housekeeping", {
    runtimeFiles: runtimeStats.files,
    runtimeBytes: runtimeStats.bytes,
    faqResultFiles: faqResultStats.files,
    faqResultBytes: faqResultStats.bytes,
    tmpFiles: tmpStats.files,
    tmpBytes: tmpStats.bytes,
    removedResultFiles: faqResultCleanup.removedFiles,
    removedResultBytes: faqResultCleanup.removedBytes,
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
    void refreshMaterializedHistorySummary("faq").catch(() => undefined);
    void getGenerationHistorySummary({ scType: "faq" }).catch(() => undefined);
    void listGenerationHistoryRows({ scType: "faq", page: 1, pageSize: 20 }).catch(() => undefined);
    void getGenerationQueueCount("faq").catch(() => undefined);
  }, 1500);
}
