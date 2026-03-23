import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
};

const upgradeCreateTableSql = [
  `CREATE TABLE IF NOT EXISTS content_generation_jobs (
    id varchar(36) NOT NULL,
    capability varchar(32) NOT NULL DEFAULT 'generation',
    sc_type varchar(32) NOT NULL,
    subclass varchar(255) NOT NULL DEFAULT '',
    source_batch_id varchar(36),
    uploader varchar(32) NOT NULL,
    note varchar(255) NOT NULL DEFAULT '',
    market_group varchar(32) NOT NULL DEFAULT '',
    status varchar(32) NOT NULL DEFAULT 'pending',
    input_file_name varchar(255) NOT NULL DEFAULT '',
    input_file_base64 text,
    total_rows int NOT NULL DEFAULT 0,
    executable_rows int NOT NULL DEFAULT 0,
    success_rows int NOT NULL DEFAULT 0,
    failed_rows int NOT NULL DEFAULT 0,
    skipped_rows int NOT NULL DEFAULT 0,
    prompt_tokens_sum int NOT NULL DEFAULT 0,
    completion_tokens_sum int NOT NULL DEFAULT 0,
    total_tokens_sum int NOT NULL DEFAULT 0,
    estimated_cost_usd_sum decimal(12,6) NOT NULL DEFAULT '0',
    ai_model varchar(100) NOT NULL DEFAULT '',
    error_reason varchar(512),
    result_file_name varchar(255) NOT NULL DEFAULT '',
    result_file_base64 text,
    route_summary_json json,
    row_results_json json,
    route_snapshot json,
    output_schema_snapshot json,
    result_file_path varchar(255),
    started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at timestamp,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS prelaunch_sampling_batches (
    id varchar(36) NOT NULL,
    source_batch_id varchar(36),
    sc_type varchar(32) NOT NULL,
    market_group varchar(32) NOT NULL DEFAULT '',
    uploader varchar(32) NOT NULL,
    reviewer varchar(32) NOT NULL DEFAULT '',
    previous_reviewer varchar(32) NOT NULL DEFAULT '',
    sample_size int NOT NULL DEFAULT 0,
    total_rows int NOT NULL DEFAULT 0,
    severe_count int NOT NULL DEFAULT 0,
    normal_count int NOT NULL DEFAULT 0,
    status varchar(32) NOT NULL DEFAULT 'draft',
    result_summary json,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS prelaunch_sampling_rows (
    id varchar(36) NOT NULL,
    batch_id varchar(36) NOT NULL,
    sc_type varchar(32) NOT NULL,
    country varchar(16) NOT NULL,
    market_group varchar(32) NOT NULL DEFAULT '',
    term_id varchar(191) NOT NULL,
    term_name varchar(255) NOT NULL DEFAULT '',
    domain varchar(255) NOT NULL DEFAULT '',
    original_content text,
    original_content_zh text,
    ai_score decimal(4,1),
    ai_comment text,
    ai_suggestion text,
    issue_category varchar(64) NOT NULL DEFAULT '',
    issue_severity varchar(32) NOT NULL DEFAULT '',
    uploader varchar(32) NOT NULL,
    reviewer varchar(32) NOT NULL DEFAULT '',
    previous_reviewer varchar(32) NOT NULL DEFAULT '',
    review_result varchar(32) NOT NULL DEFAULT 'pending',
    review_note text,
    recheck_result varchar(32) NOT NULL DEFAULT '',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS postlaunch_sampling_batches (
    id varchar(36) NOT NULL,
    source_batch_id varchar(36),
    sc_type varchar(32) NOT NULL,
    owner_tl varchar(32) NOT NULL,
    sample_size int NOT NULL DEFAULT 0,
    status varchar(32) NOT NULL DEFAULT 'draft',
    result_summary json,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS postlaunch_sampling_rows (
    id varchar(36) NOT NULL,
    batch_id varchar(36) NOT NULL,
    page_url varchar(512) NOT NULL DEFAULT '',
    country varchar(16) NOT NULL DEFAULT '',
    sc_type varchar(32) NOT NULL,
    uploader varchar(32) NOT NULL DEFAULT '',
    issue_category varchar(64) NOT NULL DEFAULT '',
    issue_severity varchar(32) NOT NULL DEFAULT '',
    issue_owner varchar(32) NOT NULL DEFAULT '',
    root_cause varchar(64) NOT NULL DEFAULT '',
    review_note text,
    recheck_result varchar(32) NOT NULL DEFAULT '',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
] as const;

async function readJournalEntries() {
  const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: JournalEntry[] };
  return journal.entries;
}

async function ensureMigrationsTable(connection: mysql.Connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      hash text NOT NULL,
      created_at bigint,
      PRIMARY KEY (id)
    )
  `);
}

async function getAppliedMigrationTimes(connection: mysql.Connection) {
  const [rows] = await connection.query("SELECT created_at FROM __drizzle_migrations ORDER BY created_at");
  return new Set((rows as Array<{ created_at: number | null }>).map((row) => Number(row.created_at || 0)));
}

async function hasLegacyBaseline(connection: mysql.Connection) {
  const requiredTables = ["upload_batches", "about_score_rows", "ingest_jobs"];
  for (const table of requiredTables) {
    const [rows] = await connection.query(`SHOW TABLES LIKE ?`, [table]);
    if (!(rows as unknown[]).length) return false;
  }
  return true;
}

async function tableExists(connection: mysql.Connection, tableName: string) {
  const [rows] = await connection.query(`SHOW TABLES LIKE ?`, [tableName]);
  return Boolean((rows as unknown[]).length);
}

async function columnExists(connection: mysql.Connection, tableName: string, columnName: string) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
  return Boolean((rows as unknown[]).length);
}

async function addColumnIfMissing(connection: mysql.Connection, tableName: string, columnName: string, definition: string) {
  if (await columnExists(connection, tableName, columnName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function recordMigration(connection: mysql.Connection, tag: string, when: number) {
  const filePath = join(process.cwd(), "drizzle", `${tag}.sql`);
  const sql = await readFile(filePath, "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  await connection.query("INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES (?, ?)", [hash, when]);
}

async function applyBaseline(connection: mysql.Connection, baseline: JournalEntry) {
  const hasLegacy = await hasLegacyBaseline(connection);
  if (hasLegacy) {
    await recordMigration(connection, baseline.tag, baseline.when);
    console.log("[db:migrate:safe] 已为旧数据库写入 0000_init 基线记录。");
    return;
  }

  const baselineSql = await readFile(join(process.cwd(), "drizzle", `${baseline.tag}.sql`), "utf8");
  await connection.query(baselineSql);
  await recordMigration(connection, baseline.tag, baseline.when);
  console.log("[db:migrate:safe] 已执行 0000_init 基线迁移。");
}

async function applyUpgrade(connection: mysql.Connection, upgrade: JournalEntry) {
  await addColumnIfMissing(connection, "upload_batches", "module_id", `varchar(16) NOT NULL DEFAULT 'about'`);
  await addColumnIfMissing(connection, "upload_batches", "output_mode", `varchar(16) NOT NULL DEFAULT 'full'`);

  await addColumnIfMissing(connection, "about_score_rows", "term_name", `varchar(255) NOT NULL DEFAULT ''`);
  await addColumnIfMissing(connection, "about_score_rows", "row_kind", `varchar(16) NOT NULL DEFAULT 'about'`);
  await addColumnIfMissing(connection, "about_score_rows", "q_online", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "a_online", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "subclass_online", `varchar(255)`);
  await addColumnIfMissing(connection, "about_score_rows", "q_ai", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "a_ai", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "subclass_ai", `varchar(255)`);
  await addColumnIfMissing(connection, "about_score_rows", "q_op", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "a_op", `text`);
  await addColumnIfMissing(connection, "about_score_rows", "subclass_op", `varchar(255)`);

  await addColumnIfMissing(connection, "ingest_jobs", "merchant_total", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "elapsed_ms", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "eta_seconds", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "prompt_tokens_sum", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "completion_tokens_sum", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "total_tokens_sum", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "estimated_cost_usd_sum", `decimal(12,6) NOT NULL DEFAULT '0'`);
  await addColumnIfMissing(connection, "ingest_jobs", "predicted_total_tokens", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "ingest_jobs", "predicted_cost_usd", `decimal(12,6) NOT NULL DEFAULT '0'`);
  await addColumnIfMissing(connection, "ingest_jobs", "error_reason", `varchar(512)`);

  for (const sql of upgradeCreateTableSql) {
    await connection.query(sql);
  }

  await recordMigration(connection, upgrade.tag, upgrade.when);
  console.log("[db:migrate:safe] 已执行 0001_app_schema_upgrade 升级迁移。");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置。");
  }

  const entries = await readJournalEntries();
  const baseline = entries.find((entry) => entry.tag === "0000_init");
  const upgrade = entries.find((entry) => entry.tag === "0001_app_schema_upgrade");
  if (!baseline || !upgrade) {
    throw new Error("迁移 journal 缺少 0000_init 或 0001_app_schema_upgrade。");
  }

  const connection = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
  });

  try {
    await ensureMigrationsTable(connection);
    const appliedTimes = await getAppliedMigrationTimes(connection);

    if (!appliedTimes.has(baseline.when)) {
      await applyBaseline(connection, baseline);
      appliedTimes.add(baseline.when);
    }

    if (!appliedTimes.has(upgrade.when)) {
      await applyUpgrade(connection, upgrade);
      appliedTimes.add(upgrade.when);
    }
  } finally {
    await connection.end();
  }

  console.log("[db:migrate:safe] 迁移完成。");
}

void main().catch((error) => {
  console.error("[db:migrate:safe] 失败:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
