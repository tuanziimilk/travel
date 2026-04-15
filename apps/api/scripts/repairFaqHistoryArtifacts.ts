import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db/client";
import { repairHistoricalFaqResultArtifacts } from "../src/generation/faqOutputJobStore";

type CliOptions = {
  olderThanHours: number;
  includeFailed: boolean;
  cleanupFailed: boolean;
  cleanupDoneSafe: boolean;
  reportPath: string | null;
};

type FailedPreviewRow = {
  id: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  rowCount: number;
  payloadMb: number;
  resultFilePath: string | null;
};

type DonePreviewRow = {
  id: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  inputMb: number;
  resultMb: number;
  rowResultsMb: number;
  resultFilePath: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    olderThanHours: 24,
    includeFailed: false,
    cleanupFailed: false,
    cleanupDoneSafe: false,
    reportPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--older-than-hours") {
      options.olderThanHours = Math.max(1, Number(argv[index + 1] || 24));
      index += 1;
      continue;
    }
    if (token === "--include-failed") {
      options.includeFailed = true;
      continue;
    }
    if (token === "--cleanup-failed") {
      options.cleanupFailed = true;
      continue;
    }
    if (token === "--cleanup-done-safe") {
      options.cleanupDoneSafe = true;
      continue;
    }
    if (token === "--report-path") {
      options.reportPath = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

async function queryFailedPreview(olderThanHours: number) {
  const [rows] = await pool.query(
    `
      SELECT
        j.id AS id,
        j.status AS status,
        DATE_FORMAT(j.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
        DATE_FORMAT(j.finished_at, '%Y-%m-%d %H:%i:%s') AS finishedAt,
        COUNT(r.job_id) AS rowCount,
        ROUND(
          (
            OCTET_LENGTH(COALESCE(j.input_file_base64, '')) +
            OCTET_LENGTH(COALESCE(j.result_file_base64, '')) +
            OCTET_LENGTH(COALESCE(CAST(j.row_results_json AS CHAR), ''))
          ) / 1024 / 1024,
          2
        ) AS payloadMb,
        j.result_file_path AS resultFilePath
      FROM content_generation_jobs j
      LEFT JOIN content_generation_job_rows r ON r.job_id = j.id
      WHERE j.sc_type = 'faq'
        AND j.status = 'failed'
        AND COALESCE(j.finished_at, j.created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY j.id, j.status, j.created_at, j.finished_at, j.result_file_path
      ORDER BY rowCount DESC, j.id ASC
    `,
    [olderThanHours],
  );

  return rows as FailedPreviewRow[];
}

async function queryDonePreview(olderThanHours: number) {
  const [rows] = await pool.query(
    `
      SELECT
        j.id AS id,
        j.status AS status,
        DATE_FORMAT(j.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
        DATE_FORMAT(j.finished_at, '%Y-%m-%d %H:%i:%s') AS finishedAt,
        ROUND(OCTET_LENGTH(COALESCE(j.input_file_base64, '')) / 1024 / 1024, 2) AS inputMb,
        ROUND(OCTET_LENGTH(COALESCE(j.result_file_base64, '')) / 1024 / 1024, 2) AS resultMb,
        ROUND(OCTET_LENGTH(COALESCE(CAST(j.row_results_json AS CHAR), '')) / 1024 / 1024, 2) AS rowResultsMb,
        j.result_file_path AS resultFilePath
      FROM content_generation_jobs j
      WHERE j.sc_type = 'faq'
        AND j.status = 'done'
        AND COALESCE(j.finished_at, j.created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND (
          COALESCE(j.input_file_base64, '') <> ''
          OR COALESCE(j.result_file_base64, '') <> ''
          OR j.row_results_json IS NOT NULL
        )
      ORDER BY (inputMb + resultMb + rowResultsMb) DESC, j.id ASC
    `,
    [olderThanHours],
  );

  return rows as DonePreviewRow[];
}

async function cleanupFailedJobs(olderThanHours: number) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [deleteResult] = await connection.query(
      `
        DELETE r
        FROM content_generation_job_rows r
        INNER JOIN content_generation_jobs j ON j.id = r.job_id
        WHERE j.sc_type = 'faq'
          AND j.status = 'failed'
          AND COALESCE(j.finished_at, j.created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
      `,
      [olderThanHours],
    );
    const [updateResult] = await connection.query(
      `
        UPDATE content_generation_jobs
        SET
          input_file_base64 = NULL,
          result_file_base64 = NULL,
          row_results_json = NULL,
          route_summary_json = NULL,
          route_snapshot = NULL,
          output_schema_snapshot = NULL
        WHERE sc_type = 'faq'
          AND status = 'failed'
          AND COALESCE(finished_at, created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)
      `,
      [olderThanHours],
    );
    await connection.commit();
    return {
      deletedRows: Number((deleteResult as { affectedRows?: number }).affectedRows || 0),
      updatedJobs: Number((updateResult as { affectedRows?: number }).affectedRows || 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanupDoneSafe(jobIds: string[]) {
  if (!jobIds.length) {
    return { updatedJobs: 0 };
  }
  const [result] = await pool.query(
    `
      UPDATE content_generation_jobs
      SET
        input_file_base64 = NULL,
        result_file_base64 = NULL,
        row_results_json = NULL
      WHERE sc_type = 'faq'
        AND status = 'done'
        AND id IN (${jobIds.map(() => "?").join(", ")})
    `,
    jobIds,
  );
  return { updatedJobs: Number((result as { affectedRows?: number }).affectedRows || 0) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const failedPreview = await queryFailedPreview(options.olderThanHours);
  const donePreview = await queryDonePreview(options.olderThanHours);
  const repairOutcomes = await repairHistoricalFaqResultArtifacts({
    olderThanHours: options.olderThanHours,
    includeFailed: options.includeFailed,
  });

  const safeDoneJobIds = repairOutcomes
    .filter((item) => item.status === "done" && item.action !== "skipped")
    .map((item) => item.jobId);

  const failedCleanup = options.cleanupFailed ? await cleanupFailedJobs(options.olderThanHours) : null;
  const doneCleanup = options.cleanupDoneSafe ? await cleanupDoneSafe(safeDoneJobIds) : null;

  const report = {
    options,
    preview: {
      failedJobs: failedPreview.length,
      doneJobs: donePreview.length,
      failedRowsTotal: failedPreview.reduce((sum, item) => sum + Number(item.rowCount || 0), 0),
      failedPayloadMbTotal: failedPreview.reduce((sum, item) => sum + Number(item.payloadMb || 0), 0),
      donePayloadMbTotal: donePreview.reduce(
        (sum, item) => sum + Number(item.inputMb || 0) + Number(item.resultMb || 0) + Number(item.rowResultsMb || 0),
        0,
      ),
    },
    failedPreview,
    donePreview,
    repairSummary: {
      total: repairOutcomes.length,
      repaired: repairOutcomes.filter((item) => item.action === "repaired_from_base64").length,
      rebuiltFromInputs: repairOutcomes.filter((item) => item.action === "rebuilt_from_inputs").length,
      rebuiltFromRows: repairOutcomes.filter((item) => item.action === "rebuilt_from_rows").length,
      alreadyValid: repairOutcomes.filter((item) => item.action === "already_valid").length,
      skipped: repairOutcomes.filter((item) => item.action === "skipped").length,
    },
    repairOutcomes,
    safeDoneJobIds,
    cleanup: {
      failedCleanup,
      doneCleanup,
    },
  };

  if (options.reportPath) {
    const resolved = path.resolve(process.cwd(), options.reportPath);
    await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`faq history report written to ${resolved}`);
  }

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
