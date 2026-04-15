import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db/client";

type CliOptions = {
  outputPath: string;
  olderThanHours: number;
  repairReportPath: string | null;
};

type TableSizeRow = {
  tableName: string;
  sizeMb: string | number | null;
  dataFreeMb: string | number | null;
  estimatedRows: string | number | null;
};

type CountRow = {
  count: string | number;
};

const cleanupBaseline = {
  before: {
    content_generation_job_rows_mb: 1007.3,
    content_generation_jobs_mb: 466.34,
  },
  executed: {
    failed_rows_deleted: 300476,
    failed_jobs_cleaned: 18,
    done_safe_jobs_cleaned: 15,
  },
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: "apps/api/.runtime/faq-cleanup-postcheck.json",
    olderThanHours: 24,
    repairReportPath: "apps/api/.runtime/faq-history-cleanup-report.json",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      options.outputPath = argv[index + 1] || options.outputPath;
      index += 1;
      continue;
    }
    if (token === "--older-than-hours") {
      options.olderThanHours = Math.max(1, Number(argv[index + 1] || options.olderThanHours));
      index += 1;
      continue;
    }
    if (token === "--repair-report") {
      options.repairReportPath = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

async function readJsonIfExists(filePath: string | null) {
  if (!filePath) return null;
  try {
    const raw = await readFile(path.resolve(process.cwd(), filePath), "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function queryTableSizes() {
  const [rows] = await pool.query(
    `
      SELECT
        table_name AS tableName,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS sizeMb,
        ROUND(data_free / 1024 / 1024, 2) AS dataFreeMb,
        table_rows AS estimatedRows
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
          'content_generation_jobs',
          'content_generation_job_rows',
          'content_generation_download_tasks'
        )
      ORDER BY table_name
    `,
  );

  return (rows as TableSizeRow[]).map((row) => ({
    tableName: row.tableName,
    sizeMb: toNumber(row.sizeMb),
    dataFreeMb: toNumber(row.dataFreeMb),
    estimatedRows: toNumber(row.estimatedRows),
  }));
}

async function queryCount(sql: string, params: unknown[] = []) {
  const [rows] = await pool.query(sql, params);
  return toNumber((rows as CountRow[])[0]?.count);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [tableSizes, failedOlderThanCount, doneOlderThanWithLargeFieldsCount, downloadTaskCount, repairReport] = await Promise.all([
    queryTableSizes(),
    queryCount(
      `
        SELECT COUNT(*) AS count
        FROM content_generation_jobs
        WHERE sc_type = 'faq'
          AND status = 'failed'
          AND COALESCE(finished_at, created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
      `,
      [options.olderThanHours],
    ),
    queryCount(
      `
        SELECT COUNT(*) AS count
        FROM content_generation_jobs
        WHERE sc_type = 'faq'
          AND status = 'done'
          AND COALESCE(finished_at, created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
          AND (
            COALESCE(input_file_base64, '') <> ''
            OR COALESCE(result_file_base64, '') <> ''
            OR row_results_json IS NOT NULL
          )
      `,
      [options.olderThanHours],
    ),
    queryCount("SELECT COUNT(*) AS count FROM content_generation_download_tasks"),
    readJsonIfExists(options.repairReportPath),
  ]);

  const rowsTable = tableSizes.find((item) => item.tableName === "content_generation_job_rows");
  const jobsTable = tableSizes.find((item) => item.tableName === "content_generation_jobs");
  const report = {
    generatedAt: new Date().toISOString(),
    options,
    baseline: cleanupBaseline,
    postcheck: {
      tableSizes,
      residuals: {
        failedOlderThanHours: options.olderThanHours,
        failedOlderThanCount,
        doneOlderThanWithLargeFieldsCount,
        downloadTaskCount,
      },
      deltaFromBaselineMb: {
        content_generation_job_rows:
          rowsTable && cleanupBaseline.before.content_generation_job_rows_mb
            ? Number((rowsTable.sizeMb - cleanupBaseline.before.content_generation_job_rows_mb).toFixed(2))
            : null,
        content_generation_jobs:
          jobsTable && cleanupBaseline.before.content_generation_jobs_mb
            ? Number((jobsTable.sizeMb - cleanupBaseline.before.content_generation_jobs_mb).toFixed(2))
            : null,
      },
    },
    repairReportSummary:
      repairReport && typeof repairReport === "object" && "repairSummary" in repairReport
        ? (repairReport as { repairSummary?: unknown; safeDoneJobIds?: unknown }).repairSummary
        : null,
  };

  const outputPath = path.resolve(process.cwd(), options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
