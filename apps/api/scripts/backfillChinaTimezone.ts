import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { contentGenerationJobs } from "../src/db/schema";
import { replaceUtcTimestampsInText } from "../src/utils/time";

function rewriteRoutePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRoutePayload);
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if ((key === "notes" || key === "updatedAt") && typeof raw === "string") {
      next[key] = replaceUtcTimestampsInText(raw);
      continue;
    }
    next[key] = rewriteRoutePayload(raw);
  }
  return next;
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function main() {
  const rows = await db
    .select({
      id: contentGenerationJobs.id,
      routeSummaryJson: contentGenerationJobs.routeSummaryJson,
      routeSnapshot: contentGenerationJobs.routeSnapshot,
    })
    .from(contentGenerationJobs);

  let updatedCount = 0;
  for (const row of rows) {
    const nextRouteSummary = rewriteRoutePayload(row.routeSummaryJson);
    const nextRouteSnapshot = rewriteRoutePayload(row.routeSnapshot);
    const changed =
      stableJson(nextRouteSummary) !== stableJson(row.routeSummaryJson) ||
      stableJson(nextRouteSnapshot) !== stableJson(row.routeSnapshot);

    if (!changed) continue;

    await db
      .update(contentGenerationJobs)
      .set({
        routeSummaryJson: nextRouteSummary as object | null,
        routeSnapshot: nextRouteSnapshot as object | null,
        updatedAt: new Date(),
      })
      .where(eq(contentGenerationJobs.id, row.id));
    updatedCount += 1;
  }

  console.log(`[backfill-china-timezone] scanned=${rows.length} updated=${updatedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill-china-timezone] failed", error);
    process.exit(1);
  });
