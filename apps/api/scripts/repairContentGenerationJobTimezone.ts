import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { contentGenerationJobs } from "../src/db/schema";

const TARGET_OFFSET_MINUTES = 8 * 60;
const OFFSET_TOLERANCE_MINUTES = 2;

type CandidateRow = {
  id: string;
  scType: string;
  status: string;
  resultFileName: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
};

function extractEpochMs(fileName: string) {
  const match = String(fileName || "").match(/(\d{13})(?=\.[^.]+$|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function diffMinutes(left: Date | null, rightMs: number) {
  if (!left) return null;
  return Math.round((left.getTime() - rightMs) / 60000);
}

function isAffectedRow(row: CandidateRow) {
  const resultEpochMs = extractEpochMs(row.resultFileName);
  if (!resultEpochMs) return false;

  const anchorDiffMinutes = diffMinutes(row.finishedAt || row.updatedAt, resultEpochMs);
  if (anchorDiffMinutes === null) return false;

  return Math.abs(anchorDiffMinutes - TARGET_OFFSET_MINUTES) <= OFFSET_TOLERANCE_MINUTES;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await db.select().from(contentGenerationJobs).where(eq(contentGenerationJobs.scType, "faq"));

  const affectedRows = rows.filter(isAffectedRow);

  for (const row of affectedRows) {
    const resultEpochMs = extractEpochMs(row.resultFileName);
    const anchorDiffMinutes = diffMinutes(row.finishedAt || row.updatedAt, resultEpochMs || 0);

    console.log(
      [
        `[repair-content-generation-job-timezone]`,
        dryRun ? "dry-run" : "fix",
        `id=${row.id}`,
        `status=${row.status}`,
        `createdAt=${row.createdAt.toISOString()}`,
        `startedAt=${row.startedAt?.toISOString() || ""}`,
        `finishedAt=${row.finishedAt?.toISOString() || ""}`,
        `updatedAt=${row.updatedAt.toISOString()}`,
        `resultEpochMs=${resultEpochMs || ""}`,
        `anchorDiffMinutes=${anchorDiffMinutes ?? ""}`,
      ].join(" "),
    );

    if (dryRun) continue;

    const nextValues: Record<string, unknown> = {
      createdAt: sql`DATE_SUB(created_at, INTERVAL 8 HOUR)`,
      // Preserve updatedAt because some rows were later touched by valid updates.
      updatedAt: sql`updated_at`,
    };

    if (row.startedAt) nextValues.startedAt = sql`DATE_SUB(started_at, INTERVAL 8 HOUR)`;

    if (row.finishedAt) nextValues.finishedAt = sql`DATE_SUB(finished_at, INTERVAL 8 HOUR)`;

    await db
      .update(contentGenerationJobs)
      .set(nextValues)
      .where(eq(contentGenerationJobs.id, row.id));
  }

  console.log(
    `[repair-content-generation-job-timezone] scanned=${rows.length} affected=${affectedRows.length} mode=${dryRun ? "dry-run" : "apply"}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[repair-content-generation-job-timezone] failed", error);
    process.exit(1);
  });
