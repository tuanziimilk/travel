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
  manualFaqScoreInputSchema,
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
  getBatchModuleId,
  toXlsx,
  toXlsxByModule,
  toCsv,
} from "../jobs/ingestWorker";
import { env } from "../env";
import { scoreAboutByAiWithMeta } from "../scoring/aboutAiScorer";
import { getModuleSkillMd, saveModuleSkillMd } from "../skills/skillStore";

const t = initTRPC.create();

export const appRouter = t.router({
  score: t.router({
    manual: t.procedure.input(manualScoreInputSchema).mutation(async ({ input }) => {
      const scored = await scoreAboutByAiWithMeta(input, { requestTimeoutMs: env.aiRequestTimeoutMsManual });

      if (input.saveToHistory) {
        const { batchId } = await createBatchWithMeta({
          moduleId: input.moduleId,
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
    manualFaq: t.procedure.input(manualFaqScoreInputSchema).mutation(async ({ input }) => {
      let batchId = "";
      if (input.saveToHistory) {
        const created = await createBatchWithMeta({
          moduleId: "faq",
          uploader: input.uploader ?? "Ella",
          note: input.batchNote ?? "",
          source: "manual",
        });
        batchId = created.batchId;
      }

      const rows: Array<{
        rowIndex: number;
        output: Awaited<ReturnType<typeof scoreAboutByAiWithMeta>>["output"];
        runtime: Awaited<ReturnType<typeof scoreAboutByAiWithMeta>>["runtime"];
      }> = [];

      for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index];
        const onlineText = [`Q: ${item.Q_online}`, `A: ${item.A_online}`, `Subclass: ${item.subclass_online || ""}`].join("\n");
        const aiText = [`Q: ${item.Q_ai}`, `A: ${item.A_ai}`, `Subclass: ${item.subclass_ai || ""}`].join("\n");
        const hasOp = item.Q_op?.trim() || item.A_op?.trim() || item.subclass_op?.trim();
        const opText = hasOp
          ? [`Q: ${item.Q_op || ""}`, `A: ${item.A_op || ""}`, `Subclass: ${item.subclass_op || ""}`].join("\n")
          : "";

        const scored = await scoreAboutByAiWithMeta({
          moduleId: "faq",
          TermID: input.TermID,
          TermName: input.TermName,
          Domain: input.Domain,
          Country: input.Country,
          About_online: onlineText,
          About_ai: aiText,
          About_op: opText,
          uploader: input.uploader,
          batchNote: input.batchNote,
          saveToHistory: false,
        }, { requestTimeoutMs: env.aiRequestTimeoutMsManual });

        rows.push({
          rowIndex: index + 1,
          output: scored.output,
          runtime: scored.runtime,
        });

        if (input.saveToHistory && batchId) {
          await saveManualScoreToBatch({
            batchId,
            input: {
              moduleId: "faq",
              TermID: input.TermID,
              TermName: input.TermName,
              Domain: input.Domain,
              Country: input.Country,
              About_online: onlineText,
              About_ai: aiText,
              About_op: opText,
              uploader: input.uploader,
              batchNote: input.batchNote,
              saveToHistory: false,
            },
            scored: scored.output,
          });
        }
      }

      return {
        moduleId: "faq" as const,
        saved: Boolean(input.saveToHistory),
        batchId: batchId || undefined,
        rows,
      };
    }),
  }),
  batch: t.router({
    create: t.procedure.input(batchCreateInputSchema).mutation(async ({ input }) => {
      return createBatchWithMeta({
        moduleId: input.moduleId,
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
        return listIngestJobs(input.page, input.pageSize, input.moduleId);
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
          const moduleId = await getBatchModuleId(input.batchId);
          return {
            xlsxBase64: toXlsxByModule(
              moduleId,
              data.rows as unknown as Array<Record<string, unknown>>,
              data.summary as Record<string, unknown>,
            ),
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
