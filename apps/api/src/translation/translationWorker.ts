import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import {
  translationBatchChunkSize,
  translationDefaultTargetLanguage,
  translationRealtimeCellThreshold,
  translationRealtimeChunkSize,
  translationRealtimeTokenThreshold,
  translationTextMaxChars,
  translationUploadMaxFileBytes,
  translationUploadMaxRows,
  type TranslationTargetLanguage,
  type Uploader,
} from "@about-demo/trpc";
import { env } from "../env";
import { translationProvider, type TranslationCellInput, type TranslationCellOutput } from "./translationService";
import {
  completeTranslationJob,
  createTranslationJob,
  failTranslationJob,
  findReusableTranslationJob,
  getTranslationJobForRetry,
  listPollingTranslationJobs,
  listQueuedTranslationJobs,
  markTranslationJobQueued,
  updateTranslationJobPhase,
  updateTranslationJobProgress,
  recoverInterruptedTranslationJobs,
} from "./translationJobStore";

type ParsedTranslationFile = {
  rows: Array<Record<string, string>>;
  columns: string[];
  sampleRows: Array<Record<string, string>>;
};

type QueuedTranslationJobInput = {
  uploader: Uploader;
  note?: string;
  fileName: string;
  fileBase64: string;
  targetLanguage: TranslationTargetLanguage;
  selectedColumns: string[];
  executionMode?: "batch" | "realtime";
  predictedTotalTokens?: number;
  predictedCostUsd?: number;
};

type TranslationRowResult = {
  rowIndex: number;
  status: "success" | "partial" | "error";
  detectedLanguages: string[];
  mixedColumns: string[];
  error?: string;
};

type PreparedCell = TranslationCellInput & {
  rowIndex: number;
  column: string;
};

type PreparedJob = {
  rows: Array<Record<string, string>>;
  columns: string[];
  resultColumns: string[];
  selectedColumns: string[];
  cells: PreparedCell[];
  totalRows: number;
  predictedTotalTokens: number;
  predictedCostUsd: number;
  executionMode: "realtime";
};

function normalizeCell(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function ensureFileSize(fileBase64: string) {
  const fileBytes = Buffer.from(fileBase64, "base64").length;
  if (fileBytes > translationUploadMaxFileBytes) {
    throw new Error(`上传文件过大，请控制在 ${Math.round(translationUploadMaxFileBytes / 1024 / 1024)}MB 以内后重试。`);
  }
}

function parseTranslationFile(fileName: string, fileBase64: string): ParsedTranslationFile {
  ensureFileSize(fileBase64);
  const buffer = Buffer.from(fileBase64, "base64");
  let rows: Array<Record<string, unknown>> = [];

  if (fileName.toLowerCase().endsWith(".csv")) {
    rows = parse(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, unknown>>;
  } else if (fileName.toLowerCase().endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } else {
    throw new Error("仅支持 .csv 或 .xlsx 文件。");
  }

  const columns = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row)).map((item) => String(item || "").trim()).filter(Boolean),
    ),
  );

  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const column of columns) normalized[column] = normalizeCell(row[column]);
    return normalized;
  });

  if (!normalizedRows.length) throw new Error("上传文件为空，无法执行翻译。");
  if (normalizedRows.length > translationUploadMaxRows) {
    throw new Error(`翻译任务单次最多上传 ${translationUploadMaxRows} 行，请拆分后再试。`);
  }

  return {
    rows: normalizedRows,
    columns,
    sampleRows: normalizedRows.slice(0, 5),
  };
}

function summarizeLanguages(counts: Map<string, number>, mixedRows: number, processedCells: number) {
  return {
    topLanguages: Array.from(counts.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language))
      .slice(0, 8),
    mixedRows,
    processedCells,
  };
}

function buildResultWorkbook(rows: Array<Record<string, string>>, columns: string[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: columns }), "Translation");
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}

function shouldSkipCell(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return true;
  if (normalized.length < 2) return true;
  if (/^[\d\s.,\-+%$€£¥:;/()]+$/.test(normalized)) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  return false;
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) chunks.push(items.slice(index, index + chunkSize));
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function estimateBatchCost(predictedInputTokens: number) {
  const predictedOutputTokens = Math.ceil(predictedInputTokens * 1.05);
  const usd =
    (predictedInputTokens / 1_000_000) * env.translationBatchInputCostPer1M +
    (predictedOutputTokens / 1_000_000) * env.translationBatchOutputCostPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function estimateRealtimeCost(predictedInputTokens: number) {
  const predictedOutputTokens = Math.ceil(predictedInputTokens * 1.05);
  const usd =
    (predictedInputTokens / 1_000_000) * env.translationAiInputCostPer1M +
    (predictedOutputTokens / 1_000_000) * env.translationAiOutputCostPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function buildPreparedJob(parsed: ParsedTranslationFile, selectedColumnsRaw: string[]): PreparedJob {
  const selectedColumns = selectedColumnsRaw.filter((item) => parsed.columns.includes(item));
  if (!selectedColumns.length) throw new Error("未匹配到可翻译列，请重新选择后再试。");

  const resultColumns = [...parsed.columns];
  for (const column of selectedColumns) resultColumns.push(`${column}__translated`, `${column}__detected_langs_summary`);

  const rows = parsed.rows.map((row) => ({ ...row })) as Array<Record<string, string>>;
  const cells: PreparedCell[] = [];
  let predictedInputTokens = 0;

  rows.forEach((row, index) => {
    for (const column of selectedColumns) {
      const value = String(row[column] || "");
      if (shouldSkipCell(value)) {
        row[`${column}__translated`] = "";
        row[`${column}__detected_langs_summary`] = "";
        continue;
      }
      const item = {
        i: `${index}__${column}`,
        t: value,
        rowIndex: index + 1,
        column,
      } satisfies PreparedCell;
      cells.push(item);
      predictedInputTokens += translationProvider.estimateTokens(value) + 4;
    }
  });

  const executionMode: "realtime" = "realtime";

  return {
    rows,
    columns: parsed.columns,
    resultColumns,
    selectedColumns,
    cells,
    totalRows: rows.length,
    predictedTotalTokens: predictedInputTokens,
    predictedCostUsd: estimateRealtimeCost(predictedInputTokens),
    executionMode,
  };
}

function applyTranslationItems(input: {
  rows: Array<Record<string, string>>;
  items: TranslationCellOutput[];
  languageCounts: Map<string, number>;
  rowStates: Map<number, TranslationRowResult>;
}) {
  for (const item of input.items) {
    const [rowIndexRaw, ...columnParts] = item.i.split("__");
    const rowIndex = Number(rowIndexRaw);
    const column = columnParts.join("__");
    const row = input.rows[rowIndex];
    if (!row || !column) continue;

    row[`${column}__translated`] = item.translatedText;
    row[`${column}__detected_langs_summary`] = item.detectedLanguages.join(", ");

    const rowState =
      input.rowStates.get(rowIndex + 1) ||
      ({
        rowIndex: rowIndex + 1,
        status: "success",
        detectedLanguages: [],
        mixedColumns: [],
      } satisfies TranslationRowResult);

    for (const language of item.detectedLanguages) {
      if (!language) continue;
      if (!rowState.detectedLanguages.includes(language)) rowState.detectedLanguages.push(language);
      input.languageCounts.set(language, (input.languageCounts.get(language) || 0) + 1);
    }
    if (item.isMixed && !rowState.mixedColumns.includes(column)) rowState.mixedColumns.push(column);
    input.rowStates.set(rowIndex + 1, rowState);
  }
}

function finalizeRowStates(input: {
  totalRows: number;
  rowStates: Map<number, TranslationRowResult>;
  rowsWithWork: Set<number>;
  rowErrors: Map<number, string[]>;
}) {
  const results: TranslationRowResult[] = [];
  let successRows = 0;
  let failedRows = 0;
  let mixedRows = 0;

  for (let index = 1; index <= input.totalRows; index += 1) {
    const rowState =
      input.rowStates.get(index) ||
      ({
        rowIndex: index,
        status: input.rowsWithWork.has(index) ? "error" : "success",
        detectedLanguages: [],
        mixedColumns: [],
      } satisfies TranslationRowResult);
    const errors = input.rowErrors.get(index) || [];
    if (errors.length > 0) {
      rowState.status = rowState.detectedLanguages.length > 0 ? "partial" : "error";
      rowState.error = errors.join(" | ");
      failedRows += 1;
    } else {
      rowState.status = "success";
      successRows += 1;
    }
    if (rowState.mixedColumns.length > 0) mixedRows += 1;
    results.push(rowState);
  }

  return {
    rowResults: results,
    successRows,
    failedRows,
    mixedRows,
  };
}

const activeTranslationJobs = new Set<string>();
const translationJobInputs = new Map<string, QueuedTranslationJobInput>();
let translationSchedulerBootstrapped = false;
let translationSchedulerRun = Promise.resolve();
let translationPollTimer: NodeJS.Timeout | null = null;

function scheduleTranslationPoll() {
  if (translationPollTimer) return;
  translationPollTimer = setTimeout(() => {
    translationPollTimer = null;
    void triggerTranslationScheduler();
  }, env.translationBatchPollMs);
}

function triggerTranslationScheduler() {
  translationSchedulerRun = translationSchedulerRun
    .then(() => processTranslationQueue())
    .catch((error) => {
      console.error("translation queue scheduler failed", error);
    });
  return translationSchedulerRun;
}

async function bootstrapTranslationQueue() {
  if (translationSchedulerBootstrapped) return;
  translationSchedulerBootstrapped = true;
  await recoverInterruptedTranslationJobs();
}

async function processTranslationQueue() {
  await bootstrapTranslationQueue();

  while (activeTranslationJobs.size < env.translationJobConcurrency) {
    const queuedJobs = await listQueuedTranslationJobs();
    const nextJob = queuedJobs.find((item) => !activeTranslationJobs.has(item.id));
    if (!nextJob) break;

    const queuedInput =
      translationJobInputs.get(nextJob.id) ||
      (nextJob.inputFileBase64
        ? {
            uploader: nextJob.uploader as Uploader,
            note: nextJob.note,
            fileName: nextJob.inputFileName,
            fileBase64: nextJob.inputFileBase64,
            targetLanguage: nextJob.targetLanguage as TranslationTargetLanguage,
            selectedColumns: (nextJob.selectedColumnsJson as string[] | null) || [],
            executionMode: (nextJob.executionMode as "batch" | "realtime") || undefined,
            predictedTotalTokens: nextJob.predictedTotalTokens,
            predictedCostUsd: Number(nextJob.predictedCostUsd || 0),
          }
        : null);
    if (!queuedInput?.fileBase64) break;

    activeTranslationJobs.add(nextJob.id);
    void runQueuedTranslationJob(nextJob.id, queuedInput);
  }

  const pollingJobs = await listPollingTranslationJobs();
  if (pollingJobs.length > 0) {
    scheduleTranslationPoll();
  }
  for (const job of pollingJobs) {
    if (activeTranslationJobs.has(job.id)) continue;
    if (!job.providerBatchId || job.executionMode !== "batch") continue;
    activeTranslationJobs.add(job.id);
    void pollBatchTranslationJob(job.id, job.providerBatchId);
  }
}

async function runQueuedTranslationJob(jobId: string, input: QueuedTranslationJobInput) {
  try {
    await updateTranslationJobPhase({
      jobId,
      status: "preparing",
      aiModel: env.translationAiModel,
      errorReason: null,
    });
    const prepared = buildPreparedJob(parseTranslationFile(input.fileName, input.fileBase64), input.selectedColumns);

    await updateTranslationJobProgress({
      jobId,
      status: "running",
      totalRows: prepared.totalRows,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      mixedRows: 0,
      predictedTotalTokens: prepared.predictedTotalTokens,
      predictedCostUsd: prepared.predictedCostUsd,
      promptTokensSum: 0,
      completionTokensSum: 0,
      totalTokensSum: 0,
      estimatedCostUsdSum: 0,
      languageSummary: summarizeLanguages(new Map(), 0, prepared.cells.length),
      aiModel: env.translationAiModel,
    });

    await executeRealtimeTranslation(jobId, prepared);
  } catch (error) {
    await failTranslationJob(jobId, error instanceof Error ? error.message : String(error));
  } finally {
    activeTranslationJobs.delete(jobId);
    translationJobInputs.delete(jobId);
    void triggerTranslationScheduler();
  }
}

async function executeRealtimeTranslation(jobId: string, prepared: PreparedJob) {
  const languageCounts = new Map<string, number>();
  const rowStates = new Map<number, TranslationRowResult>();
  const rowErrors = new Map<number, string[]>();
  const rowsWithWork = new Set<number>(prepared.cells.map((item) => item.rowIndex));
  const chunks = chunkItems(prepared.cells, translationRealtimeChunkSize);
  const processedRowSet = new Set<number>();
  let processedRows = 0;
  let promptTokensSum = 0;
  let completionTokensSum = 0;
  let totalTokensSum = 0;
  let estimatedCostUsdSum = 0;
  const chunkConcurrency = env.translationRealtimeChunkConcurrency;
  const waves = chunkItems(chunks, chunkConcurrency);

  for (const wave of waves) {
    const waveResults = await mapWithConcurrency(wave, chunkConcurrency, async (chunk) => {
      try {
        const translated = await translationProvider.translateCellsRealtime({
          items: chunk.map((item) => ({ i: item.i, t: item.t })),
          targetLanguage: translationDefaultTargetLanguage,
        });
        return { chunk, translated, error: null as string | null };
      } catch (error) {
        return {
          chunk,
          translated: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    for (const result of waveResults) {
      if (result.translated) {
        applyTranslationItems({
          rows: prepared.rows,
          items: result.translated.items,
          languageCounts,
          rowStates,
        });
        promptTokensSum += result.translated.runtime.promptTokens;
        completionTokensSum += result.translated.runtime.completionTokens;
        totalTokensSum += result.translated.runtime.totalTokens;
        estimatedCostUsdSum += result.translated.runtime.estimatedCostUsd;
      } else {
        for (const item of result.chunk) {
          const errors = rowErrors.get(item.rowIndex) || [];
          errors.push(`${item.column}: ${result.error}`);
          rowErrors.set(item.rowIndex, errors);
        }
      }

      for (const rowIndex of new Set(result.chunk.map((item) => item.rowIndex))) processedRowSet.add(rowIndex);
    }

    processedRows = Math.min(prepared.totalRows, processedRowSet.size);
    const interim = finalizeRowStates({
      totalRows: prepared.totalRows,
      rowStates,
      rowsWithWork,
      rowErrors,
    });
    await updateTranslationJobProgress({
      jobId,
      status: "running",
      totalRows: prepared.totalRows,
      processedRows,
      successRows: interim.successRows,
      failedRows: interim.failedRows,
      mixedRows: interim.mixedRows,
      predictedTotalTokens: prepared.predictedTotalTokens,
      predictedCostUsd: prepared.predictedCostUsd,
      promptTokensSum,
      completionTokensSum,
      totalTokensSum,
      estimatedCostUsdSum: Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000,
      languageSummary: summarizeLanguages(languageCounts, interim.mixedRows, prepared.cells.length),
      aiModel: env.translationAiModel,
    });
  }

  const finalState = finalizeRowStates({
    totalRows: prepared.totalRows,
    rowStates,
    rowsWithWork,
    rowErrors,
  });

  await completeTranslationJob({
    jobId,
    status: finalState.failedRows > 0 ? "partial_failed" : "done",
    totalRows: prepared.totalRows,
    processedRows: prepared.totalRows,
    successRows: finalState.successRows,
    failedRows: finalState.failedRows,
    mixedRows: finalState.mixedRows,
    promptTokensSum,
    completionTokensSum,
    totalTokensSum,
    estimatedCostUsdSum: Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000,
    languageSummary: summarizeLanguages(languageCounts, finalState.mixedRows, prepared.cells.length),
    aiModel: env.translationAiModel,
    resultFileName: `translation-${Date.now()}.xlsx`,
    resultFileBase64: buildResultWorkbook(prepared.rows, prepared.resultColumns),
    rowResults: finalState.rowResults,
    errorReason: finalState.failedRows > 0 ? `存在 ${finalState.failedRows} 行翻译失败或部分失败，请下载结果查看。` : "",
  });
}

async function submitBatchTranslation(jobId: string, prepared: PreparedJob) {
  const chunks = chunkItems(prepared.cells, translationBatchChunkSize).map((items, index) => ({
    customId: `chunk_${index}`,
    items: items.map((item) => ({ i: item.i, t: item.t })),
  }));
  const submitted = await translationProvider.submitBatchTranslation({
    chunks,
    targetLanguage: translationDefaultTargetLanguage,
  });
  await updateTranslationJobPhase({
    jobId,
    status: "submitted",
    providerBatchId: submitted.providerBatchId,
    inputFileId: submitted.inputFileId,
    aiModel: env.translationAiModel,
    errorReason: null,
  });
  scheduleTranslationPoll();
}

async function pollBatchTranslationJob(jobId: string, providerBatchId: string) {
  try {
    const status = await translationProvider.getBatchTranslationStatus({ providerBatchId });
    if (status.status === "validating" || status.status === "in_progress" || status.status === "finalizing") {
      await updateTranslationJobPhase({
        jobId,
        status: "running",
        providerBatchId,
        inputFileId: status.inputFileId || null,
        outputFileId: status.outputFileId || null,
        errorFileId: status.errorFileId || null,
        aiModel: env.translationAiModel,
      });
      scheduleTranslationPoll();
      return;
    }

    if (status.status !== "completed") {
      await failTranslationJob(jobId, status.errorMessage || `批量翻译任务失败: ${status.status}`);
      return;
    }

    const job = await getTranslationJobForRetry(jobId);
    const input = {
      uploader: job.uploader as Uploader,
      note: job.note,
      fileName: job.inputFileName,
      fileBase64: job.inputFileBase64 || "",
      targetLanguage: (job.targetLanguage as TranslationTargetLanguage) || translationDefaultTargetLanguage,
      selectedColumns: (job.selectedColumnsJson as string[] | null) || [],
    } satisfies QueuedTranslationJobInput;
    const prepared = buildPreparedJob(parseTranslationFile(input.fileName, input.fileBase64), input.selectedColumns);
    const batchRows = await translationProvider.fetchBatchTranslationResult({ outputFileId: status.outputFileId });

    const languageCounts = new Map<string, number>();
    const rowStates = new Map<number, TranslationRowResult>();
    const rowErrors = new Map<number, string[]>();
    const rowsWithWork = new Set<number>(prepared.cells.map((item) => item.rowIndex));
    const batchCellChunks = chunkItems(prepared.cells, translationBatchChunkSize);
    let promptTokensSum = 0;
    let completionTokensSum = 0;
    let totalTokensSum = 0;
    let estimatedCostUsdSum = 0;

    for (const chunk of batchRows) {
      if (chunk.error) {
        const chunkIndex = Number(chunk.customId.replace("chunk_", ""));
        const failedChunk = batchCellChunks[chunkIndex] || [];
        for (const cell of failedChunk) {
          const errors = rowErrors.get(cell.rowIndex) || [];
          errors.push(`${cell.column}: ${chunk.error}`);
          rowErrors.set(cell.rowIndex, errors);
        }
        continue;
      }
      applyTranslationItems({
        rows: prepared.rows,
        items: chunk.items,
        languageCounts,
        rowStates,
      });
      promptTokensSum += chunk.runtime.promptTokens;
      completionTokensSum += chunk.runtime.completionTokens;
      totalTokensSum += chunk.runtime.totalTokens;
      estimatedCostUsdSum += chunk.runtime.estimatedCostUsd;
    }

    const finalState = finalizeRowStates({
      totalRows: prepared.totalRows,
      rowStates,
      rowsWithWork,
      rowErrors,
    });

    await completeTranslationJob({
      jobId,
      status: finalState.failedRows > 0 ? "partial_failed" : "done",
      totalRows: prepared.totalRows,
      processedRows: prepared.totalRows,
      successRows: finalState.successRows,
      failedRows: finalState.failedRows,
      mixedRows: finalState.mixedRows,
      providerBatchId,
      inputFileId: status.inputFileId,
      outputFileId: status.outputFileId,
      errorFileId: status.errorFileId,
      promptTokensSum,
      completionTokensSum,
      totalTokensSum,
      estimatedCostUsdSum: Math.round(estimatedCostUsdSum * 1_000_000) / 1_000_000,
      languageSummary: summarizeLanguages(languageCounts, finalState.mixedRows, prepared.cells.length),
      aiModel: env.translationAiModel,
      resultFileName: `translation-${Date.now()}.xlsx`,
      resultFileBase64: buildResultWorkbook(prepared.rows, prepared.resultColumns),
      rowResults: finalState.rowResults,
      errorReason: finalState.failedRows > 0 ? `存在 ${finalState.failedRows} 行翻译失败或部分失败，请下载结果查看。` : "",
    });
  } catch (error) {
    await failTranslationJob(jobId, error instanceof Error ? error.message : String(error));
  } finally {
    activeTranslationJobs.delete(jobId);
  }
}

export async function previewTranslationColumns(input: {
  fileName: string;
  fileBase64: string;
}) {
  const parsed = parseTranslationFile(input.fileName, input.fileBase64);
  return {
    fileName: input.fileName,
    totalRows: parsed.rows.length,
    columns: parsed.columns.map((name) => ({
      name,
      sampleValues: parsed.sampleRows.map((row) => row[name] || "").filter(Boolean).slice(0, 3),
    })),
    sampleRows: parsed.sampleRows,
  };
}

export async function translateTextNow(input: {
  text: string;
  targetLanguage: TranslationTargetLanguage;
}) {
  if (input.text.length > translationTextMaxChars) {
    throw new Error(`文本长度超过 ${translationTextMaxChars} 字符，请改用批量文件翻译。`);
  }
  const translated = await translationProvider.translateTextSync({
    text: input.text,
    targetLanguage: translationDefaultTargetLanguage,
  });
  return {
    translatedText: translated.result.translatedText,
    detectedLanguages: translated.result.detectedLanguages,
    dominantLanguage: translated.result.dominantLanguage,
    isMixed: translated.result.isMixed,
    confidence: translated.result.confidence,
    runtime: translated.runtime,
  };
}

export async function startBatchTranslation(input: QueuedTranslationJobInput) {
  const prepared = buildPreparedJob(parseTranslationFile(input.fileName, input.fileBase64), input.selectedColumns);
  const reusableJob = await findReusableTranslationJob({
    uploader: input.uploader,
    targetLanguage: translationDefaultTargetLanguage,
    inputFileName: input.fileName,
    inputFileBase64: input.fileBase64,
    selectedColumns: prepared.selectedColumns,
  });

  if (reusableJob) {
    return {
      jobId: reusableJob.id,
      totalRows: reusableJob.totalRows || prepared.totalRows,
      selectedColumns: prepared.selectedColumns,
      executionMode: reusableJob.executionMode as "realtime",
      predictedCostUsd: Number(reusableJob.predictedCostUsd || prepared.predictedCostUsd),
      predictedTotalTokens: reusableJob.predictedTotalTokens || prepared.predictedTotalTokens,
      reusedExisting: true,
    };
  }

  const { jobId } = await createTranslationJob({
    uploader: input.uploader,
    note: input.note || "",
    provider: "openai",
    executionMode: prepared.executionMode,
    targetLanguage: translationDefaultTargetLanguage,
    inputFileName: input.fileName,
    inputFileBase64: input.fileBase64,
    selectedColumns: prepared.selectedColumns,
    predictedTotalTokens: prepared.predictedTotalTokens,
    predictedCostUsd: prepared.predictedCostUsd,
  });

  translationJobInputs.set(jobId, {
    ...input,
    targetLanguage: translationDefaultTargetLanguage,
    selectedColumns: prepared.selectedColumns,
    executionMode: prepared.executionMode,
    predictedTotalTokens: prepared.predictedTotalTokens,
    predictedCostUsd: prepared.predictedCostUsd,
  });
  void triggerTranslationScheduler();
  return {
    jobId,
    totalRows: prepared.totalRows,
    selectedColumns: prepared.selectedColumns,
    executionMode: prepared.executionMode,
    predictedCostUsd: prepared.predictedCostUsd,
    predictedTotalTokens: prepared.predictedTotalTokens,
    reusedExisting: false,
  };
}

export async function retryBatchTranslation(jobId: string) {
  const job = await getTranslationJobForRetry(jobId);
  if (!job.inputFileBase64) throw new Error("该任务缺少原始输入文件，无法重试。");

  await markTranslationJobQueued(jobId);
  translationJobInputs.set(jobId, {
    uploader: job.uploader as Uploader,
    note: job.note,
    fileName: job.inputFileName,
    fileBase64: job.inputFileBase64,
    targetLanguage: (job.targetLanguage as TranslationTargetLanguage) || translationDefaultTargetLanguage,
    selectedColumns: (job.selectedColumnsJson as string[] | null) || [],
    executionMode: (job.executionMode as "batch" | "realtime") || undefined,
    predictedTotalTokens: job.predictedTotalTokens,
    predictedCostUsd: Number(job.predictedCostUsd || 0),
  });
  void triggerTranslationScheduler();
  return { jobId };
}

void triggerTranslationScheduler();
