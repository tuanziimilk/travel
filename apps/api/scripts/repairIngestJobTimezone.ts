import "dotenv/config";
import { and, between, isNotNull, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { ingestJobs } from "../src/db/schema";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await db
    .select({
      id: ingestJobs.id,
      status: ingestJobs.status,
      startedAt: ingestJobs.startedAt,
      updatedAt: ingestJobs.updatedAt,
      finishedAt: ingestJobs.finishedAt,
      diffMinutes: sql<number>`timestampdiff(minute, ${ingestJobs.updatedAt}, ${ingestJobs.startedAt})`,
    })
    .from(ingestJobs)
    .where(and(isNotNull(ingestJobs.updatedAt), between(sql`timestampdiff(minute, ${ingestJobs.updatedAt}, ${ingestJobs.startedAt})`, 470, 490)));

  for (const row of rows) {
    console.log(
      [
        "[repair-ingest-job-timezone]",
        dryRun ? "dry-run" : "fix",
        `id=${row.id}`,
        `status=${row.status}`,
        `startedAt=${row.startedAt?.toISOString?.() || row.startedAt || ""}`,
        `updatedAt=${row.updatedAt?.toISOString?.() || row.updatedAt || ""}`,
        `finishedAt=${row.finishedAt?.toISOString?.() || row.finishedAt || ""}`,
        `diffMinutes=${row.diffMinutes}`,
      ].join(" "),
    );

    if (dryRun) continue;

    await db
      .update(ingestJobs)
      .set({
        updatedAt: sql`DATE_ADD(updated_at, INTERVAL 8 HOUR)`,
        finishedAt: sql`CASE WHEN finished_at IS NULL THEN NULL ELSE DATE_ADD(finished_at, INTERVAL 8 HOUR) END`,
      })
      .where(sql`${ingestJobs.id} = ${row.id}`);
  }

  console.log(`[repair-ingest-job-timezone] scanned=${rows.length} mode=${dryRun ? "dry-run" : "apply"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[repair-ingest-job-timezone] failed", error);
    process.exit(1);
  });
