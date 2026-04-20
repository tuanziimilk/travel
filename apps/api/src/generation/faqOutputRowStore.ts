import type { RowDataPacket } from "mysql2/promise";
import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "../db/client";
import { contentGenerationJobs } from "../db/schema";

const FAQ_BOARD_NAME_FIELD = "板块名称" as const;

export type PassthroughFieldName = "Country" | "TermID" | "TermName" | "Domain";

export type PassthroughFieldMismatch = {
  field: PassthroughFieldName;
  inputValue: string;
  modelValue: string;
};

export type GenerationValidationLog = {
  hasPassthroughMismatch: boolean;
  passthroughMismatches: PassthroughFieldMismatch[];
};

export type PersistedGenerationRow = {
  jobId: string;
  rowIndex: number;
  status: "success" | "error";
  factType: string;
  subclass: string;
  routeKey: string;
  country: string;
  termId: string;
  termName: string;
  domain: string;
  source: string;
  boardName: string;
  title1: string;
  briefIntroduction: string;
  hrefKw: string;
  hrefUrl: string;
  supported: string;
  inputStatus: string;
  discountType: string;
  discountValue: string;
  currency: string;
  discountDetails: string;
  url: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  aiModel: string;
  errorReason: string;
  validationLog: GenerationValidationLog | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedGenerationSummary = {
  successRows: number;
  failedRows: number;
  promptTokensSum: number;
  completionTokensSum: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  latestUpdatedAt: Date | null;
};

type PersistGenerationRowInput = {
  jobId: string;
  rowIndex: number;
  status: "success" | "error";
  factType: string;
  subclass: string;
  routeKey: string;
  country: string;
  termId: string;
  termName: string;
  domain: string;
  source?: string;
  boardName?: string;
  title1?: string;
  briefIntroduction?: string;
  hrefKw?: string;
  hrefUrl?: string;
  supported?: string;
  inputStatus?: string;
  discountType?: string;
  discountValue?: string;
  currency?: string;
  discountDetails?: string;
  url?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  elapsedMs?: number;
  aiModel?: string;
  errorReason?: string;
  validationLog?: GenerationValidationLog | null;
};

type PersistedHistoryRow = {
  jobId: string;
  uploader: string;
  note: string;
  jobStatus: string;
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

let rowsTableEnsured = false;

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function ensureGenerationRowsTable() {
  if (rowsTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_generation_job_rows (
      job_id varchar(36) NOT NULL,
      row_index int NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'success',
      fact_type varchar(255) NOT NULL DEFAULT '',
      subclass varchar(255) NOT NULL DEFAULT '',
      route_key varchar(255) NOT NULL DEFAULT '',
      country varchar(16) NOT NULL DEFAULT '',
      term_id varchar(191) NOT NULL DEFAULT '',
      term_name varchar(255) NOT NULL DEFAULT '',
      domain varchar(255) NOT NULL DEFAULT '',
      source varchar(32) NOT NULL DEFAULT '',
      board_name varchar(64) NOT NULL DEFAULT '',
      title1 text,
      brief_introduction text,
      href_kw text,
      href_url text,
      supported varchar(32) NOT NULL DEFAULT '',
      input_status varchar(32) NOT NULL DEFAULT '',
      discount_type varchar(32) NOT NULL DEFAULT '',
      discount_value varchar(64) NOT NULL DEFAULT '',
      currency varchar(16) NOT NULL DEFAULT '',
      discount_details text,
      url text,
      prompt_tokens int NOT NULL DEFAULT 0,
      completion_tokens int NOT NULL DEFAULT 0,
      total_tokens int NOT NULL DEFAULT 0,
      estimated_cost_usd decimal(12,6) NOT NULL DEFAULT '0',
      elapsed_ms int NOT NULL DEFAULT 0,
      ai_model varchar(100) NOT NULL DEFAULT '',
      error_reason varchar(512) NOT NULL DEFAULT '',
      validation_log_json json DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (job_id, row_index),
      KEY idx_generation_rows_status (status),
      KEY idx_generation_rows_subclass (subclass),
      KEY idx_generation_rows_country (country),
      KEY idx_generation_rows_job_status_country_subclass_term_row (job_id, status, country, subclass, term_id, row_index),
      KEY idx_generation_rows_status_country_subclass_job_row (status, country, subclass, job_id, row_index)
    )
  `);
  if (!(await columnExists("content_generation_job_rows", "validation_log_json"))) {
    await pool.query(`
      ALTER TABLE content_generation_job_rows
      ADD COLUMN validation_log_json json DEFAULT NULL
    `);
  }
  rowsTableEnsured = true;
}

function parseValidationLog(value: unknown): GenerationValidationLog | null {
  if (!value) return null;
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const mismatches = Array.isArray(record.passthroughMismatches)
    ? record.passthroughMismatches
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          field: String(item.field || "") as PassthroughFieldName,
          inputValue: String(item.inputValue || ""),
          modelValue: String(item.modelValue || ""),
        }))
        .filter(
          (item): item is PassthroughFieldMismatch =>
            (item.field === "Country" || item.field === "TermID" || item.field === "TermName" || item.field === "Domain") &&
            item.modelValue !== "",
        )
    : [];
  if (!mismatches.length) return null;
  return {
    hasPassthroughMismatch: true,
    passthroughMismatches: mismatches,
  };
}

function toPersistedRow(record: Record<string, unknown>): PersistedGenerationRow {
  return {
    jobId: String(record.job_id || ""),
    rowIndex: Number(record.row_index || 0),
    status: String(record.status || "success") === "error" ? "error" : "success",
    factType: String(record.fact_type || ""),
    subclass: String(record.subclass || ""),
    routeKey: String(record.route_key || ""),
    country: String(record.country || ""),
    termId: String(record.term_id || ""),
    termName: String(record.term_name || ""),
    domain: String(record.domain || ""),
    source: String(record.source || ""),
    boardName: String(record.board_name || ""),
    title1: String(record.title1 || ""),
    briefIntroduction: String(record.brief_introduction || ""),
    hrefKw: String(record.href_kw || ""),
    hrefUrl: String(record.href_url || ""),
    supported: String(record.supported || ""),
    inputStatus: String(record.input_status || ""),
    discountType: String(record.discount_type || ""),
    discountValue: String(record.discount_value || ""),
    currency: String(record.currency || ""),
    discountDetails: String(record.discount_details || ""),
    url: String(record.url || ""),
    promptTokens: Number(record.prompt_tokens || 0),
    completionTokens: Number(record.completion_tokens || 0),
    totalTokens: Number(record.total_tokens || 0),
    estimatedCostUsd: Number(record.estimated_cost_usd || 0),
    elapsedMs: Number(record.elapsed_ms || 0),
    aiModel: String(record.ai_model || ""),
    errorReason: String(record.error_reason || ""),
    validationLog: parseValidationLog(record.validation_log_json),
    createdAt: record.created_at instanceof Date ? record.created_at : new Date(String(record.created_at || "")),
    updatedAt: record.updated_at instanceof Date ? record.updated_at : new Date(String(record.updated_at || "")),
  };
}

export async function persistGenerationRow(input: PersistGenerationRowInput) {
  await ensureGenerationRowsTable();
  await pool.execute(
    `
      INSERT INTO content_generation_job_rows (
        job_id,row_index,status,fact_type,subclass,route_key,country,term_id,term_name,domain,
        source,board_name,title1,brief_introduction,href_kw,href_url,
        supported,input_status,discount_type,discount_value,currency,discount_details,url,
        prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,elapsed_ms,ai_model,error_reason,validation_log_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        fact_type = VALUES(fact_type),
        subclass = VALUES(subclass),
        route_key = VALUES(route_key),
        country = VALUES(country),
        term_id = VALUES(term_id),
        term_name = VALUES(term_name),
        domain = VALUES(domain),
        source = VALUES(source),
        board_name = VALUES(board_name),
        title1 = VALUES(title1),
        brief_introduction = VALUES(brief_introduction),
        href_kw = VALUES(href_kw),
        href_url = VALUES(href_url),
        supported = VALUES(supported),
        input_status = VALUES(input_status),
        discount_type = VALUES(discount_type),
        discount_value = VALUES(discount_value),
        currency = VALUES(currency),
        discount_details = VALUES(discount_details),
        url = VALUES(url),
        prompt_tokens = VALUES(prompt_tokens),
        completion_tokens = VALUES(completion_tokens),
        total_tokens = VALUES(total_tokens),
        estimated_cost_usd = VALUES(estimated_cost_usd),
        elapsed_ms = VALUES(elapsed_ms),
        ai_model = VALUES(ai_model),
        error_reason = VALUES(error_reason),
        validation_log_json = VALUES(validation_log_json)
    `,
    [
      input.jobId,
      input.rowIndex,
      input.status,
      input.factType || "",
      input.subclass || "",
      input.routeKey || "",
      input.country || "",
      input.termId || "",
      input.termName || "",
      input.domain || "",
      input.source || "",
      input.boardName || "",
      input.title1 || "",
      input.briefIntroduction || "",
      input.hrefKw || "",
      input.hrefUrl || "",
      input.supported || "",
      input.inputStatus || "",
      input.discountType || "",
      input.discountValue || "",
      input.currency || "",
      input.discountDetails || "",
      input.url || "",
      input.promptTokens || 0,
      input.completionTokens || 0,
      input.totalTokens || 0,
      String(input.estimatedCostUsd || 0),
      input.elapsedMs || 0,
      input.aiModel || "",
      input.errorReason || "",
      input.validationLog ? JSON.stringify(input.validationLog) : null,
    ],
  );
}

export async function getPersistedGenerationValidationLogs(jobId: string) {
  const rows = await listPersistedGenerationRows(jobId);
  const mismatchRows = rows.filter((row) => row.validationLog?.hasPassthroughMismatch);
  const fieldCounts = mismatchRows.reduce(
    (counts, row) => {
      for (const item of row.validationLog?.passthroughMismatches || []) {
        counts[item.field] += 1;
      }
      return counts;
    },
    { Country: 0, TermID: 0, TermName: 0, Domain: 0 } as Record<PassthroughFieldName, number>,
  );

  return {
    summary: {
      totalRows: rows.length,
      mismatchRowCount: mismatchRows.length,
      fieldCounts,
    },
    rows: mismatchRows.map((row) => ({
      rowIndex: row.rowIndex,
      factType: row.factType,
      subclass: row.subclass,
      termId: row.termId,
      termName: row.termName,
      passthroughMismatches: row.validationLog?.passthroughMismatches || [],
    })),
  };
}

export async function listPersistedGenerationRows(jobId: string) {
  await ensureGenerationRowsTable();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT *
      FROM content_generation_job_rows
      WHERE job_id = ?
      ORDER BY row_index ASC
    `,
    [jobId],
  );
  return rows.map((row) => toPersistedRow(row as unknown as Record<string, unknown>));
}

export async function getPersistedGenerationSummary(jobId: string): Promise<PersistedGenerationSummary> {
  await ensureGenerationRowsTable();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_rows,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_rows,
        SUM(CASE WHEN status = 'success' THEN prompt_tokens ELSE 0 END) AS prompt_tokens_sum,
        SUM(CASE WHEN status = 'success' THEN completion_tokens ELSE 0 END) AS completion_tokens_sum,
        SUM(CASE WHEN status = 'success' THEN total_tokens ELSE 0 END) AS total_tokens_sum,
        SUM(CASE WHEN status = 'success' THEN estimated_cost_usd ELSE 0 END) AS estimated_cost_usd_sum,
        MAX(updated_at) AS latest_updated_at
      FROM content_generation_job_rows
      WHERE job_id = ?
    `,
    [jobId],
  );
  const record = (rows[0] || {}) as Record<string, unknown>;
  return {
    successRows: Number(record.success_rows || 0),
    failedRows: Number(record.failed_rows || 0),
    promptTokensSum: Number(record.prompt_tokens_sum || 0),
    completionTokensSum: Number(record.completion_tokens_sum || 0),
    totalTokensSum: Number(record.total_tokens_sum || 0),
    estimatedCostUsdSum: Number(record.estimated_cost_usd_sum || 0),
    latestUpdatedAt:
      record.latest_updated_at instanceof Date
        ? record.latest_updated_at
        : record.latest_updated_at
          ? new Date(String(record.latest_updated_at))
          : null,
  };
}

export async function listPersistedSuccessRowIndexes(jobId: string) {
  const rows = await listPersistedGenerationRows(jobId);
  return new Set(rows.filter((row) => row.status === "success").map((row) => row.rowIndex));
}

export async function deletePersistedGenerationRows(jobId: string) {
  await ensureGenerationRowsTable();
  await pool.query(
    `
      DELETE FROM content_generation_job_rows
      WHERE job_id = ?
    `,
    [jobId],
  );
}

export async function listPersistedHistoryRows(scType = "faq") {
  await ensureGenerationRowsTable();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        r.job_id,
        j.uploader,
        j.note,
        j.status AS job_status,
        j.created_at AS job_created_at,
        j.started_at AS job_started_at,
        j.finished_at AS job_finished_at,
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
      FROM content_generation_jobs j
      INNER JOIN content_generation_job_rows r ON r.job_id = j.id
      WHERE j.sc_type = ? AND r.status = 'success'
      ORDER BY j.created_at DESC, r.row_index ASC
    `,
    [scType],
  );

  return rows.map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      jobId: String(record.job_id || ""),
      uploader: String(record.uploader || ""),
      note: String(record.note || ""),
      jobStatus: String(record.job_status || ""),
      createdAt: record.job_created_at instanceof Date ? record.job_created_at : new Date(String(record.job_created_at || "")),
      startedAt: record.job_started_at instanceof Date ? record.job_started_at : record.job_started_at ? new Date(String(record.job_started_at)) : null,
      finishedAt: record.job_finished_at instanceof Date ? record.job_finished_at : record.job_finished_at ? new Date(String(record.job_finished_at)) : null,
      ContentType: "faq",
      Country: String(record.country || ""),
      TermID: String(record.term_id || ""),
      TermName: String(record.term_name || ""),
      Domain: String(record.domain || ""),
      Source: String(record.source || ""),
      Subclass: String(record.subclass || ""),
      [FAQ_BOARD_NAME_FIELD]: String(record.board_name || "faq"),
      Titile1: String(record.title1 || ""),
      "Brief Introduction": String(record.brief_introduction || ""),
      "Href Kw": String(record.href_kw || ""),
      "Href Url": String(record.href_url || ""),
    } satisfies PersistedHistoryRow;
  });
}

export async function listPersistedHistoryJobIds(scType = "faq") {
  await ensureGenerationRowsTable();
  const rows = await db
    .select({ id: contentGenerationJobs.id })
    .from(contentGenerationJobs)
    .where(and(eq(contentGenerationJobs.scType, scType), eq(contentGenerationJobs.status, "done")))
    .orderBy(desc(contentGenerationJobs.createdAt));
  const [persisted] = await pool.query<RowDataPacket[]>(
    `
      SELECT DISTINCT r.job_id
      FROM content_generation_job_rows r
      INNER JOIN content_generation_jobs j ON j.id = r.job_id
      WHERE j.sc_type = ?
    `,
    [scType],
  );
  const persistedSet = new Set(persisted.map((row) => String((row as unknown as Record<string, unknown>).job_id || "")));
  return rows.map((row) => row.id).filter((id) => persistedSet.has(id));
}
