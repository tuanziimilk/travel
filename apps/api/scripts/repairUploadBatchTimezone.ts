import "dotenv/config";
import { and, between, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { uploadBatches } from "../src/db/schema";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await db
    .select({
      id: uploadBatches.id,
      uploader: uploadBatches.uploader,
      createdAt: uploadBatches.createdAt,
      diffToJobMinutes: sql<number>`timestampdiff(
        minute,
        ${uploadBatches.createdAt},
        (select min(started_at) from ingest_jobs j where j.batch_id = ${uploadBatches.id})
      )`,
      diffToRowMinutes: sql<number>`timestampdiff(
        minute,
        ${uploadBatches.createdAt},
        (select min(created_at) from about_score_rows r where r.batch_id = ${uploadBatches.id})
      )`,
    })
    .from(uploadBatches)
    .where(
      or(
        and(
          isNotNull(sql`(select min(started_at) from ingest_jobs j where j.batch_id = ${uploadBatches.id})`),
          between(
            sql`timestampdiff(minute, ${uploadBatches.createdAt}, (select min(started_at) from ingest_jobs j where j.batch_id = ${uploadBatches.id}))`,
            470,
            490,
          ),
        ),
        and(
          isNotNull(sql`(select min(created_at) from about_score_rows r where r.batch_id = ${uploadBatches.id})`),
          between(
            sql`timestampdiff(minute, ${uploadBatches.createdAt}, (select min(created_at) from about_score_rows r where r.batch_id = ${uploadBatches.id}))`,
            470,
            490,
          ),
        ),
      ),
    );

  for (const row of rows) {
    console.log(
      [
        "[repair-upload-batch-timezone]",
        dryRun ? "dry-run" : "fix",
        `id=${row.id}`,
        `uploader=${row.uploader}`,
        `createdAt=${row.createdAt?.toISOString?.() || row.createdAt || ""}`,
        `diffToJobMinutes=${row.diffToJobMinutes ?? "null"}`,
        `diffToRowMinutes=${row.diffToRowMinutes ?? "null"}`,
      ].join(" "),
    );

    if (dryRun) continue;

    await db
      .update(uploadBatches)
      .set({
        createdAt: sql`DATE_ADD(created_at, INTERVAL 8 HOUR)`,
      })
      .where(sql`${uploadBatches.id} = ${row.id}`);
  }

  console.log(`[repair-upload-batch-timezone] scanned=${rows.length} mode=${dryRun ? "dry-run" : "apply"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[repair-upload-batch-timezone] failed", error);
    process.exit(1);
  });
