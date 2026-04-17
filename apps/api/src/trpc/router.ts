import { initTRPC } from "@trpc/server";
import {
  analyticsInputSchema,
  batchCancelInputSchema,
  batchCreateInputSchema,
  batchGetInputSchema,
  batchQueueInputSchema,
  batchListInputSchema,
  batchResultInputSchema,
  batchStartInputSchema,
  categoryCalibrationPreviewInputSchema,
  categoryCalibrationQueueInputSchema,
  categoryCalibrationResultInputSchema,
  categoryCalibrationRunInputSchema,
  categoryCalibrationStatusInputSchema,
  batchStatusInputSchema,
  generationFrameworkGetInputSchema,
  generationHistoryExportInputSchema,
  generationHistoryFilterSchema,
  generationQueueInputSchema,
  generationResultInputSchema,
  generationRetryInputSchema,
  generationStatusInputSchema,
  generationValidationLogsInputSchema,
  generationRunInputSchema,
  ggCleaningPreviewInputSchema,
  ggCleaningQueueInputSchema,
  ggCleaningResultInputSchema,
  ggCleaningRunInputSchema,
  ggCleaningStatusInputSchema,
  manualScoreInputSchema,
  manualFaqScoreInputSchema,
  runtimeAiConfigSetInputSchema,
  runtimeAiConfigGetInputSchema,
  skillHistoryDetailInputSchema,
  skillHistoryListInputSchema,
  skillRouteDocumentInputSchema,
  skillRouteListInputSchema,
  skillRouteResolveInputSchema,
  skillRollbackInputSchema,
  skillRouteSaveInputSchema,
  translationBatchRunInputSchema,
  translationPreviewColumnsInputSchema,
  translationQueueInputSchema,
  translationResultInputSchema,
  translationStatusInputSchema,
  translationTextRunInputSchema,
  type ManualScoreInput,
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
  saveManualScoreToBatch,
  startIngestJob,
  buildExportRows,
  getBatchModuleId,
  toXlsx,
  toXlsxByModule,
  toCsv,
} from "../jobs/ingestWorker";
import {
  env,
  getAiRuntimeConfig,
  setAiRuntimeConfig,
} from "../env";
import {
  getCategoryCalibrationJobResult,
  getCategoryCalibrationJobStatus,
  listCategoryCalibrationJobs,
} from "../category-calibration/jobStore";
import { previewCategoryCalibration, startCategoryCalibrationJob } from "../category-calibration/worker";
import { retryFaqOutputGeneration, startFaqOutputGeneration } from "../generation/faqOutputGenerator";
import { getGgCleaningJobResult, getGgCleaningJobStatus, listGgCleaningJobs } from "../gg-cleaning/jobStore";
import { previewGgCleaning, startGgCleaningJob } from "../gg-cleaning/worker";
import {
  exportGenerationHistory,
  getGenerationHistorySummary,
  getGenerationJobResult,
  getGenerationJobStatus,
  getGenerationValidationLogs,
  listGenerationHistoryRows,
  listGenerationJobs,
} from "../generation/faqOutputJobStore";
import { scoreAboutByAiWithMeta } from "../scoring/aboutAiScorer";
import { getModuleSkillMd } from "../skills/skillStore";
import {
  getSkillHistoryDetail,
  getGenerationFramework,
  getSkillRouteDocument,
  getSkillRouteOverride,
  listSkillHistory,
  listSkillRoutes,
  rollbackSkillHistory,
  resolveSkillRoute,
  saveSkillRouteOverride,
} from "../skills/skillRouter";
import { saveVersionedSkill } from "../skills/skillVersionService";
import { getTranslationJobResult, getTranslationJobStatus, listTranslationJobs } from "../translation/translationJobStore";
import { previewTranslationColumns, startBatchTranslation, translateTextNow } from "../translation/translationWorker";

const t = initTRPC.create();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryBackoffMs(attempt: number, baseMs: number, maxMs: number) {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(maxMs, baseMs * 2 ** attempt + jitter);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function scoreManualWithRetries(input: ManualScoreInput, requestTimeoutMs: number) {
  const maxRetries = Math.max(0, env.ingestRowMaxRetries);
  const baseMs = Math.max(100, env.ingestRowRetryBaseMs);
  const maxMs = Math.max(baseMs, env.ingestRowRetryMaxMs);
  const errors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await scoreAboutByAiWithMeta(input, { requestTimeoutMs });
    } catch (error) {
      errors.push(`attempt${attempt + 1}: ${errorMessage(error)}`);
      if (attempt >= maxRetries) break;
      await sleep(retryBackoffMs(attempt, baseMs, maxMs));
    }
  }

  throw new Error(`手动评分重试后仍失败: ${errors.join(" | ")}`);
}

export const appRouter = t.router({
  score: t.router({
    manual: t.procedure.input(manualScoreInputSchema).mutation(async ({ input }) => {
      const scored = await scoreManualWithRetries(input, env.aiRequestTimeoutMsManual);

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

        const scored = await scoreManualWithRetries(
          {
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
          env.aiRequestTimeoutMsManual,
        );

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
        outputMode: input.outputMode,
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
      result: t.procedure.input(batchResultInputSchema).query(async ({ input }) => {
        const data = await getBatchResult(input.batchId);
        const moduleId = await getBatchModuleId(input.batchId);
        if (input.format === "csv") {
          return {
            csv: toCsv(buildExportRows(data.rows as unknown as Array<Record<string, unknown>>, { moduleId })),
          };
        }
        if (input.format === "xlsx") {
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
  generation: t.router({
    framework: t.procedure.input(generationFrameworkGetInputSchema).query(({ input }) => {
      return getGenerationFramework(input.scType);
    }),
    resolveSkill: t.procedure.input(skillRouteResolveInputSchema).query(({ input }) => {
      return resolveSkillRoute(input);
    }),
    run: t.procedure.input(generationRunInputSchema).mutation(({ input }) => {
      return startFaqOutputGeneration(input);
    }),
    queue: t.procedure.input(generationQueueInputSchema).query(({ input }) => {
      return listGenerationJobs(input.page, input.pageSize, input.scType);
    }),
    status: t.procedure.input(generationStatusInputSchema).query(({ input }) => {
      return getGenerationJobStatus(input.jobId);
    }),
    validationLogs: t.procedure.input(generationValidationLogsInputSchema).query(({ input }) => {
      return getGenerationValidationLogs(input.jobId);
    }),
    retry: t.procedure.input(generationRetryInputSchema).mutation(({ input }) => {
      return retryFaqOutputGeneration(input.jobId);
    }),
    result: t.procedure.input(generationResultInputSchema).query(({ input }) => {
      return getGenerationJobResult(input.jobId);
    }),
    historySummary: t.procedure.input(generationHistoryFilterSchema).query(({ input }) => {
      return getGenerationHistorySummary(input);
    }),
    historyRows: t.procedure.input(generationHistoryFilterSchema).query(({ input }) => {
      return listGenerationHistoryRows(input);
    }),
    historyExport: t.procedure.input(generationHistoryExportInputSchema).query(({ input }) => {
      return exportGenerationHistory(input);
    }),
  }),
  skill: t.router({
    get: t.procedure.input(skillGetInputSchema).query(async ({ input }) => {
      return getModuleSkillMd(input.moduleId);
    }),
    save: t.procedure.input(skillSaveInputSchema).mutation(async ({ input }) => {
      return saveVersionedSkill({
        capability: "quality",
        scType: input.moduleId,
        subclass: "",
        targetType: "module_live",
        skillMd: input.skillMd,
        editor: input.editor,
        changeNote: input.changeNote,
      });
    }),
    routes: t.procedure.input(skillRouteListInputSchema).query(({ input }) => {
      return listSkillRoutes(input);
    }),
    history: t.procedure.input(skillHistoryListInputSchema).query(({ input }) => {
      return listSkillHistory(input);
    }),
    historyDetail: t.procedure.input(skillHistoryDetailInputSchema).query(({ input }) => {
      return getSkillHistoryDetail(input);
    }),
    routeOverride: t.procedure.input(skillRouteResolveInputSchema).query(({ input }) => {
      return getSkillRouteOverride(input);
    }),
    routeDocument: t.procedure.input(skillRouteDocumentInputSchema).query(({ input }) => {
      return getSkillRouteDocument(input);
    }),
    saveRouteOverride: t.procedure.input(skillRouteSaveInputSchema).mutation(({ input }) => {
      return saveSkillRouteOverride(input);
    }),
    rollback: t.procedure.input(skillRollbackInputSchema).mutation(({ input }) => {
      return rollbackSkillHistory(input);
    }),
  }),
  runtime: t.router({
    aiConfig: t.router({
      get: t.procedure.input(runtimeAiConfigGetInputSchema).query(({ input }) => {
        return getAiRuntimeConfig(input.toolKey);
      }),
      set: t.procedure.input(runtimeAiConfigSetInputSchema).mutation(({ input }) => {
        return setAiRuntimeConfig(input);
      }),
    }),
    categoryCalibrationAiConfig: t.router({
      get: t.procedure.query(() => {
        return getAiRuntimeConfig("category-calibration");
      }),
      set: t.procedure.input(runtimeAiConfigSetInputSchema).mutation(({ input }) => {
        return setAiRuntimeConfig({ ...input, toolKey: "category-calibration" });
      }),
    }),
  }),
  translation: t.router({
    previewColumns: t.procedure.input(translationPreviewColumnsInputSchema).mutation(({ input }) => {
      return previewTranslationColumns(input);
    }),
    runText: t.procedure.input(translationTextRunInputSchema).mutation(({ input }) => {
      return translateTextNow(input);
    }),
    runBatch: t.procedure.input(translationBatchRunInputSchema).mutation(({ input }) => {
      return startBatchTranslation(input);
    }),
    queue: t.procedure.input(translationQueueInputSchema).query(({ input }) => {
      return listTranslationJobs(input.page, input.pageSize);
    }),
    status: t.procedure.input(translationStatusInputSchema).query(({ input }) => {
      return getTranslationJobStatus(input.jobId);
    }),
    result: t.procedure.input(translationResultInputSchema).query(({ input }) => {
      return getTranslationJobResult(input.jobId);
    }),
  }),
  ggCleaning: t.router({
    preview: t.procedure.input(ggCleaningPreviewInputSchema).mutation(({ input }) => {
      return previewGgCleaning(input);
    }),
    run: t.procedure.input(ggCleaningRunInputSchema).mutation(({ input }) => {
      return startGgCleaningJob(input);
    }),
    queue: t.procedure.input(ggCleaningQueueInputSchema).query(({ input }) => {
      return listGgCleaningJobs(input.page, input.pageSize);
    }),
    status: t.procedure.input(ggCleaningStatusInputSchema).query(({ input }) => {
      return getGgCleaningJobStatus(input.jobId);
    }),
    result: t.procedure.input(ggCleaningResultInputSchema).query(({ input }) => {
      return getGgCleaningJobResult(input.jobId);
    }),
  }),
  categoryCalibration: t.router({
    preview: t.procedure.input(categoryCalibrationPreviewInputSchema).mutation(({ input }) => {
      return previewCategoryCalibration(input);
    }),
    run: t.procedure.input(categoryCalibrationRunInputSchema).mutation(({ input }) => {
      return startCategoryCalibrationJob(input);
    }),
    queue: t.procedure.input(categoryCalibrationQueueInputSchema).query(({ input }) => {
      return listCategoryCalibrationJobs(input.page, input.pageSize);
    }),
    status: t.procedure.input(categoryCalibrationStatusInputSchema).query(({ input }) => {
      return getCategoryCalibrationJobStatus(input.jobId);
    }),
    result: t.procedure.input(categoryCalibrationResultInputSchema).query(({ input }) => {
      return getCategoryCalibrationJobResult(input.jobId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
