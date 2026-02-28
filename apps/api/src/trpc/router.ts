import { initTRPC } from "@trpc/server";
import {
  analyticsInputSchema,
  batchCancelInputSchema,
  batchCreateInputSchema,
  batchGetInputSchema,
  batchQueueInputSchema,
  batchListInputSchema,
  batchResultInputSchema,
  batchRetryInputSchema,
  batchStartInputSchema,
  batchStatusInputSchema,
  manualScoreInputSchema,
  skillGetInputSchema,
  skillSaveInputSchema,
} from "@about-demo/trpc";
import {
  analyticsSummary,
  cancelIngestJob,
  createBatch,
  createBatchWithMeta,
  getBatchDetail,
  getBatchResult,
  getIngestStatus,
  listIngestJobs,
  listBatches,
  retryIngestJob,
  saveManualScoreToBatch,
  startIngestJob,
  buildExportRows,
  toXlsx,
  toCsv,
} from "../jobs/ingestWorker";
import { scoreAboutByAiWithMeta } from "../scoring/aboutAiScorer";
import { getModuleSkillMd, saveModuleSkillMd } from "../skills/skillStore";

const t = initTRPC.create();

export const appRouter = t.router({
  score: t.router({
    manual: t.procedure.input(manualScoreInputSchema).mutation(async ({ input }) => {
      const scored = await scoreAboutByAiWithMeta(input);

      if (input.saveToHistory) {
        const { batchId } = await createBatchWithMeta({
          uploader: input.uploader ?? "Ella",
          note: input.batchNote ?? "",
          source: "manual",
        });
        await saveManualScoreToBatch({
          batchId,
          input,
          scored: scored.output,
        });

        return {
          ...scored,
          saved: true,
          batchId,
        };
      }

      return {
        ...scored,
        saved: false,
      };
    }),
  }),
  batch: t.router({
    create: t.procedure.input(batchCreateInputSchema).mutation(async ({ input }) => {
      return createBatchWithMeta({
        uploader: input.uploader,
        note: input.note,
        source: input.source,
      });
    }),
    ingest: t.router({
      start: t.procedure.input(batchStartInputSchema).mutation(async ({ input }) => {
        return startIngestJob(input.batchId, input.fileName, input.fileBase64);
      }),
      queue: t.procedure.input(batchQueueInputSchema).query(async ({ input }) => {
        return listIngestJobs(input.page, input.pageSize);
      }),
      status: t.procedure.input(batchStatusInputSchema).query(async ({ input }) => {
        return getIngestStatus(input.jobId);
      }),
      cancel: t.procedure.input(batchCancelInputSchema).mutation(async ({ input }) => {
        return cancelIngestJob(input.jobId);
      }),
      retry: t.procedure.input(batchRetryInputSchema).mutation(async ({ input }) => {
        return retryIngestJob(input.jobId);
      }),
      result: t.procedure.input(batchResultInputSchema).query(async ({ input }) => {
        const data = await getBatchResult(input.batchId);
        if (input.format === "csv") {
          return { csv: toCsv(buildExportRows(data.rows as unknown as Array<Record<string, unknown>>)) };
        }
        if (input.format === "xlsx") {
          return {
            xlsxBase64: toXlsx(data.rows as unknown as Array<Record<string, unknown>>, data.summary as Record<string, unknown>),
          };
        }
        return data;
      }),
    }),
    list: t.procedure.input(batchListInputSchema).query(async ({ input }) => {
      return listBatches(input);
    }),
    get: t.procedure.input(batchGetInputSchema).query(async ({ input }) => {
      return getBatchDetail(input.batchId, input.page, input.pageSize);
    }),
  }),
  analytics: t.router({
    summary: t.procedure.input(analyticsInputSchema).query(async ({ input }) => {
      return analyticsSummary(input);
    }),
  }),
  skill: t.router({
    get: t.procedure.input(skillGetInputSchema).query(async ({ input }) => {
      return getModuleSkillMd(input.moduleId);
    }),
    save: t.procedure.input(skillSaveInputSchema).mutation(async ({ input }) => {
      return saveModuleSkillMd(input.moduleId, input.skillMd);
    }),
  }),
});

export type AppRouter = typeof appRouter;
