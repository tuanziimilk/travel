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
    input_file_path varchar(512),
    input_file_base64 longtext,
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
    result_file_base64 longtext,
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
  `CREATE TABLE IF NOT EXISTS skill_version_history (
    id varchar(36) NOT NULL,
    capability varchar(32) NOT NULL,
    sc_type varchar(32) NOT NULL,
    subclass varchar(255) NOT NULL DEFAULT '',
    target_type varchar(32) NOT NULL,
    version_no int NOT NULL,
    action_type varchar(32) NOT NULL,
    editor varchar(64) NOT NULL,
    change_note varchar(255) NOT NULL DEFAULT '',
    skill_md longtext NOT NULL,
    source_snapshot varchar(64) NOT NULL DEFAULT '',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

async function indexExists(connection: mysql.Connection, tableName: string, indexName: string) {
  const [rows] = await connection.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
  return Boolean((rows as unknown[]).length);
}

async function addColumnIfMissing(connection: mysql.Connection, tableName: string, columnName: string, definition: string) {
  if (await columnExists(connection, tableName, columnName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function addIndexIfMissing(connection: mysql.Connection, tableName: string, indexName: string, definitionSql: string) {
  if (await indexExists(connection, tableName, indexName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` ${definitionSql}`);
}

async function recordMigration(connection: mysql.Connection, tag: string, when: number) {
  const filePath = join(process.cwd(), "drizzle", `${tag}.sql`);
  const sql = await readFile(filePath, "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  await connection.query("INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES (?, ?)", [hash, when]);
}

async function updateContentGenerationJobBase64Columns(connection: mysql.Connection) {
  if (!(await tableExists(connection, "content_generation_jobs"))) return;
  await connection.query(`
    ALTER TABLE \`content_generation_jobs\`
      MODIFY COLUMN \`input_file_base64\` longtext,
      MODIFY COLUMN \`result_file_base64\` longtext
  `);
}

async function ensureContentGenerationJobColumns(connection: mysql.Connection) {
  if (!(await tableExists(connection, "content_generation_jobs"))) return;
  await addColumnIfMissing(connection, "content_generation_jobs", "input_file_path", `varchar(512)`);
  await addColumnIfMissing(connection, "content_generation_jobs", "elapsed_execution_ms", `bigint NOT NULL DEFAULT 0`);
}

async function applyBaseline(connection: mysql.Connection, baseline: JournalEntry) {
  const hasLegacy = await hasLegacyBaseline(connection);
  if (hasLegacy) {
    await recordMigration(connection, baseline.tag, baseline.when);
    console.log("[db:migrate:safe] recorded baseline 0000_init for existing database");
    return;
  }

  const baselineSql = await readFile(join(process.cwd(), "drizzle", `${baseline.tag}.sql`), "utf8");
  await connection.query(baselineSql);
  await recordMigration(connection, baseline.tag, baseline.when);
  console.log("[db:migrate:safe] applied 0000_init");
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
  console.log("[db:migrate:safe] applied 0001_app_schema_upgrade");
}

async function applyContentGenerationJobLongtextUpgrade(connection: mysql.Connection, migration: JournalEntry) {
  await updateContentGenerationJobBase64Columns(connection);
  await recordMigration(connection, migration.tag, migration.when);
  console.log("[db:migrate:safe] applied 0002_content_generation_job_longtext");
}

async function applySkillVersionHistoryMigration(connection: mysql.Connection, migration: JournalEntry) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS skill_version_history (
      id varchar(36) NOT NULL,
      capability varchar(32) NOT NULL,
      sc_type varchar(32) NOT NULL,
      subclass varchar(255) NOT NULL DEFAULT '',
      target_type varchar(32) NOT NULL,
      version_no int NOT NULL,
      action_type varchar(32) NOT NULL,
      editor varchar(64) NOT NULL,
      change_note varchar(255) NOT NULL DEFAULT '',
      skill_md longtext NOT NULL,
      source_snapshot varchar(64) NOT NULL DEFAULT '',
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  await recordMigration(connection, migration.tag, migration.when);
  console.log("[db:migrate:safe] applied 0003_skill_version_history");
}

async function applyTranslationJobsMigration(connection: mysql.Connection, migration: JournalEntry) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS translation_jobs (
      id varchar(36) NOT NULL PRIMARY KEY,
      uploader varchar(32) NOT NULL,
      note varchar(255) NOT NULL DEFAULT '',
      provider varchar(32) NOT NULL DEFAULT 'openai',
      execution_mode varchar(32) NOT NULL DEFAULT 'batch',
      target_language varchar(32) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'queued',
      input_file_name varchar(255) NOT NULL DEFAULT '',
      input_file_base64 longtext,
      provider_batch_id varchar(128),
      input_file_id varchar(128),
      output_file_id varchar(128),
      error_file_id varchar(128),
      selected_columns_json json,
      total_rows int NOT NULL DEFAULT 0,
      processed_rows int NOT NULL DEFAULT 0,
      success_rows int NOT NULL DEFAULT 0,
      failed_rows int NOT NULL DEFAULT 0,
      mixed_rows int NOT NULL DEFAULT 0,
      predicted_total_tokens int NOT NULL DEFAULT 0,
      predicted_cost_usd decimal(12,6) NOT NULL DEFAULT '0',
      prompt_tokens_sum int NOT NULL DEFAULT 0,
      completion_tokens_sum int NOT NULL DEFAULT 0,
      total_tokens_sum int NOT NULL DEFAULT 0,
      estimated_cost_usd_sum decimal(12,6) NOT NULL DEFAULT '0',
      language_summary_json json,
      error_reason varchar(512),
      result_file_name varchar(255) NOT NULL DEFAULT '',
      result_file_base64 longtext,
      row_results_json json,
      ai_model varchar(100) NOT NULL DEFAULT '',
      started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at timestamp NULL DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing(connection, "translation_jobs", "provider", `varchar(32) NOT NULL DEFAULT 'openai'`);
  await addColumnIfMissing(connection, "translation_jobs", "execution_mode", `varchar(32) NOT NULL DEFAULT 'batch'`);
  await addColumnIfMissing(connection, "translation_jobs", "provider_batch_id", `varchar(128)`);
  await addColumnIfMissing(connection, "translation_jobs", "input_file_id", `varchar(128)`);
  await addColumnIfMissing(connection, "translation_jobs", "output_file_id", `varchar(128)`);
  await addColumnIfMissing(connection, "translation_jobs", "error_file_id", `varchar(128)`);
  await addColumnIfMissing(connection, "translation_jobs", "predicted_total_tokens", `int NOT NULL DEFAULT 0`);
  await addColumnIfMissing(connection, "translation_jobs", "predicted_cost_usd", `decimal(12,6) NOT NULL DEFAULT '0'`);
  await recordMigration(connection, migration.tag, migration.when);
  console.log("[db:migrate:safe] applied 0004_translation_jobs");
}

async function applyFaqElapsedExecutionMigration(connection: mysql.Connection, migration: JournalEntry) {
  if (await tableExists(connection, "content_generation_jobs")) {
    await addColumnIfMissing(connection, "content_generation_jobs", "input_file_path", `varchar(512)`);
    await addColumnIfMissing(connection, "content_generation_jobs", "elapsed_execution_ms", `bigint NOT NULL DEFAULT 0`);
    if (await columnExists(connection, "content_generation_jobs", "started_at")) {
      await connection.query(`
        ALTER TABLE \`content_generation_jobs\`
          MODIFY COLUMN \`started_at\` timestamp NULL DEFAULT NULL
      `);
    }
  }
  await recordMigration(connection, migration.tag, migration.when);
  console.log("[db:migrate:safe] applied 0005_faq_elapsed_execution");
}

async function verifyCriticalGenerationColumns(connection: mysql.Connection) {
  if (!(await tableExists(connection, "content_generation_jobs"))) {
    console.warn("[db:migrate:safe] content_generation_jobs table is missing");
    return;
  }

  const hasElapsedExecutionMs = await columnExists(connection, "content_generation_jobs", "elapsed_execution_ms");
  const hasStartedAt = await columnExists(connection, "content_generation_jobs", "started_at");
  console.log(
    `[db:migrate:safe] critical column check content_generation_jobs.elapsed_execution_ms=${hasElapsedExecutionMs} started_at=${hasStartedAt}`,
  );
}

async function ensureContentGenerationDownloadTasksTable(connection: mysql.Connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS content_generation_download_tasks (
      id varchar(36) NOT NULL PRIMARY KEY,
      job_id varchar(36) NOT NULL,
      variant varchar(32) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'queued',
      progress_percent int NOT NULL DEFAULT 0,
      status_text varchar(255) NOT NULL DEFAULT '',
      file_name varchar(255) NOT NULL DEFAULT '',
      result_file_path varchar(512),
      file_size_bytes int NOT NULL DEFAULT 0,
      error_message varchar(512),
      expires_at timestamp NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_generation_download_tasks_job_variant_created (job_id, variant, created_at),
      KEY idx_generation_download_tasks_status_created (status, created_at),
      KEY idx_generation_download_tasks_expires_at (expires_at)
    )
  `);
}

async function applyContentGenerationDownloadTasksMigration(connection: mysql.Connection, migration: JournalEntry) {
  await ensureContentGenerationDownloadTasksTable(connection);
  await recordMigration(connection, migration.tag, migration.when);
  console.log("[db:migrate:safe] applied content_generation_download_tasks");
}

async function ensureContentGenerationHistoryIndexes(connection: mysql.Connection) {
  if (!(await tableExists(connection, "content_generation_jobs"))) return;
  if (!(await tableExists(connection, "content_generation_job_rows"))) return;

  await addIndexIfMissing(connection, "content_generation_jobs", "idx_generation_jobs_sc_type_id", `(\`sc_type\`, \`id\`)`);
  await addIndexIfMissing(connection, "content_generation_jobs", "idx_generation_jobs_sc_type_uploader_id", `(\`sc_type\`, \`uploader\`, \`id\`)`);
  await addIndexIfMissing(connection, "content_generation_jobs", "idx_generation_jobs_sc_type_created_id", `(\`sc_type\`, \`created_at\`, \`id\`)`);
  await addIndexIfMissing(connection, "content_generation_jobs", "idx_generation_jobs_sc_type_status_created_id", `(\`sc_type\`, \`status\`, \`created_at\`, \`id\`)`);
  await addIndexIfMissing(
    connection,
    "content_generation_job_rows",
    "idx_generation_rows_job_status_country_subclass_term_row",
    `(\`job_id\`, \`status\`, \`country\`, \`subclass\`, \`term_id\`, \`row_index\`)`,
  );
  await addIndexIfMissing(
    connection,
    "content_generation_job_rows",
    "idx_generation_rows_status_country_subclass_job_row",
    `(\`status\`, \`country\`, \`subclass\`, \`job_id\`, \`row_index\`)`,
  );
}

async function ensureContentGenerationHistorySummaryTable(connection: mysql.Connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS content_generation_history_summary (
      sc_type varchar(32) NOT NULL,
      summary_version int NOT NULL DEFAULT 1,
      uploader_filter varchar(32) NOT NULL DEFAULT '__ALL__',
      country_filter varchar(32) NOT NULL DEFAULT '__ALL__',
      subclass_filter varchar(255) NOT NULL DEFAULT '__ALL__',
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
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const entries = await readJournalEntries();
  const baseline = entries.find((entry) => entry.tag === "0000_init");
  const upgrade = entries.find((entry) => entry.tag === "0001_app_schema_upgrade");
  const longtextUpgrade = entries.find((entry) => entry.tag === "0002_content_generation_job_longtext");
  const skillVersionMigration = entries.find((entry) => entry.tag === "0003_skill_version_history");
  const translationJobsMigration = entries.find((entry) => entry.tag === "0004_translation_jobs");
  const faqElapsedExecutionMigration = entries.find((entry) => entry.tag === "0005_faq_elapsed_execution");

  if (!baseline || !upgrade || !longtextUpgrade || !skillVersionMigration || !translationJobsMigration || !faqElapsedExecutionMigration) {
    throw new Error("required migration entries are missing from drizzle/meta/_journal.json");
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

    if (!appliedTimes.has(longtextUpgrade.when)) {
      await applyContentGenerationJobLongtextUpgrade(connection, longtextUpgrade);
      appliedTimes.add(longtextUpgrade.when);
    }

    if (!appliedTimes.has(skillVersionMigration.when)) {
      await applySkillVersionHistoryMigration(connection, skillVersionMigration);
      appliedTimes.add(skillVersionMigration.when);
    }

    if (!appliedTimes.has(translationJobsMigration.when)) {
      await applyTranslationJobsMigration(connection, translationJobsMigration);
      appliedTimes.add(translationJobsMigration.when);
    }

    if (!appliedTimes.has(faqElapsedExecutionMigration.when)) {
      await applyFaqElapsedExecutionMigration(connection, faqElapsedExecutionMigration);
      appliedTimes.add(faqElapsedExecutionMigration.when);
    }

    await ensureContentGenerationJobColumns(connection);
    await ensureContentGenerationHistoryIndexes(connection);
    await ensureContentGenerationHistorySummaryTable(connection);
    await verifyCriticalGenerationColumns(connection);
  } finally {
    await connection.end();
  }

  console.log("[db:migrate:safe] migration complete");
}

void main().catch((error) => {
  console.error("[db:migrate:safe] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
