import { createWriteStream, type WriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { z } from "zod";
import { categoryCalibrationUploadMaxRows } from "@about-demo/trpc";
import { env } from "../env";
import { aiExecutor } from "../skills/aiExecutor";
import type { CategoryCalibrationUploadRow } from "./uploadStore";
import { sha256 } from "../utils/hash";

const CATEGORY_DICTIONARY_PATH = "D:\\工作文件\\临时任务\\category判断相关附件\\分类信息.xlsx";
const CURRENT_CATEGORY_ID_COLUMN = "\u5f53\u524d-category id";
const CURRENT_CATEGORY_NAME_COLUMN = "\u5f53\u524d-categoryName";
const RESULT_CURRENT_CATEGORY = "\u5f53\u524d\u5206\u7c7b";
const RESULT_JUDGEMENT = "\u5224\u65ad";
const RESULT_PARENT = "\u5efa\u8bae\u7236\u7c7b";
const RESULT_CHILD = "\u5efa\u8bae\u5b50\u7c7b";
const CATEGORY_CALIBRATION_ROW_CONCURRENCY = Math.max(1, Number(process.env.CATEGORY_CALIBRATION_ROW_CONCURRENCY || 3));
const CATEGORY_CALIBRATION_SUB_BATCH_SIZE = Math.max(200, Number(process.env.CATEGORY_CALIBRATION_SUB_BATCH_SIZE || 2000));
const REQUIRED_COLUMNS = [
  "TermID",
  "TermName",
  "Domain",
  "Landing Page",
  "Country",
  "Language",
  "Meta",
  "About",
  CURRENT_CATEGORY_ID_COLUMN,
  CURRENT_CATEGORY_NAME_COLUMN,
] as const;

const RESULT_HEADERS = ["domain", RESULT_CURRENT_CATEGORY, RESULT_JUDGEMENT, RESULT_PARENT, RESULT_CHILD] as const;

type DictionaryParent = {
  id: string;
  name: string;
  children: DictionaryChild[];
};

type DictionaryChild = {
  id: string;
  name: string;
  parentId: string;
  parentName: string;
};

type CategoryDictionary = {
  parents: DictionaryParent[];
  parentsById: Map<string, DictionaryParent>;
  childrenById: Map<string, DictionaryChild>;
  promptText: string;
};

type NormalizedInputRow = {
  rowIndex: number;
  termId: string;
  termName: string;
  domain: string;
  landingPage: string;
  country: string;
  language: string;
  meta: string;
  about: string;
  currentCategoryId: string;
  currentCategoryName: string;
};

type CategoryCalibrationPreview = {
  inputMode: "xlsx-template";
  columns: string[];
  sampleRawRows: CategoryCalibrationUploadRow[];
  totalRows: number;
  validRows: number;
};

type RowOutput = {
  domain: string;
  [RESULT_CURRENT_CATEGORY]: string;
  [RESULT_JUDGEMENT]: string;
  [RESULT_PARENT]: string;
  [RESULT_CHILD]: string;
};

type RowDebugResult = {
  rowIndex: number;
  domain: string;
  judgement: string;
  suggestedParentId: string;
  suggestedChildId: string;
  error?: string;
};

type CalibrationResult = {
  rowResults: RowDebugResult[];
  summary: {
    inputMode: string;
    totalRows: number;
    processedRows: number;
    successRows: number;
    failedRows: number;
    aiModel: string;
    dictionaryPath: string;
  };
};

const aiOutputSchema = z.object({
  judgement: z.enum(["正确", "有误"]).optional().default("有误"),
  suggestedParentId: z.string().trim().min(1),
  suggestedChildId: z.string().trim().min(1),
});

let dictionaryCache: Promise<CategoryDictionary> | null = null;

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function currentCategoryDisplay(row: NormalizedInputRow) {
  return `${row.currentCategoryId} · ${row.currentCategoryName}`;
}

function categoryDisplay(id: string, name: string) {
  return `${id} · ${name}`;
}

function rowFingerprint(row: NormalizedInputRow) {
  return sha256(
    [
      row.domain.toLowerCase(),
      row.currentCategoryId,
      row.currentCategoryName,
      row.meta,
      row.about,
    ].join("\n<split>\n"),
  );
}

function estimateCost(promptTokens: number, completionTokens: number) {
  return (
    (promptTokens / 1_000_000) * env.aiInputCostPer1M +
    (completionTokens / 1_000_000) * env.aiOutputCostPer1M
  );
}

function parseCandidate(candidate: string, dictionary: CategoryDictionary) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return {
      ok: false as const,
      errors: [error instanceof Error ? error.message : "Invalid JSON output."],
    };
  }

  const normalized = aiOutputSchema.safeParse(parsed);
  if (!normalized.success) {
    return {
      ok: false as const,
      errors: normalized.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    };
  }

  const parent = dictionary.parentsById.get(normalized.data.suggestedParentId);
  if (!parent) {
    return {
      ok: false as const,
      errors: [`suggestedParentId ${normalized.data.suggestedParentId} is not a valid parent category id.`],
    };
  }

  const child = dictionary.childrenById.get(normalized.data.suggestedChildId);
  if (!child) {
    return {
      ok: false as const,
      errors: [`suggestedChildId ${normalized.data.suggestedChildId} is not a valid child category id.`],
    };
  }

  if (child.parentId !== parent.id) {
    return {
      ok: false as const,
      errors: [`Child ${child.id} does not belong to parent ${parent.id}.`],
    };
  }

  return {
    ok: true as const,
    value: {
      judgement: normalized.data.judgement,
      suggestedParentId: parent.id,
      suggestedParentName: parent.name,
      suggestedChildId: child.id,
      suggestedChildName: child.name,
    },
    errors: [] as string[],
  };
}

async function loadCategoryDictionary(): Promise<CategoryDictionary> {
  if (!dictionaryCache) {
    dictionaryCache = (async () => {
      const buffer = await readFile(CATEGORY_DICTIONARY_PATH);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const parents: DictionaryParent[] = [];
      const parentsById = new Map<string, DictionaryParent>();
      const childrenById = new Map<string, DictionaryChild>();

      for (const row of rawRows) {
        const id = normalizeText(row["分类ID"]);
        const level = normalizeText(row["分类等级"]);
        const name = normalizeText(row["分类名称"]);
        const parentId = normalizeText(row["父级分类ID"]);
        const parentName = normalizeText(row["父级分类名称"]);
        if (!id || !name || !level) continue;

        if (level === "一级") {
          const parent: DictionaryParent = {
            id,
            name,
            children: [],
          };
          parents.push(parent);
          parentsById.set(id, parent);
          continue;
        }

        if (level === "二级") {
          const parent = parentsById.get(parentId);
          if (!parent) continue;
          const child: DictionaryChild = {
            id,
            name,
            parentId,
            parentName: parentName || parent.name,
          };
          parent.children.push(child);
          childrenById.set(id, child);
        }
      }

      const promptText = parents
        .map((parent) => {
          const childText = parent.children.map((child) => `${child.id} ${child.name}`).join("；");
          return `${parent.id} ${parent.name}: ${childText}`;
        })
        .join("\n");

      return {
        parents,
        parentsById,
        childrenById,
        promptText,
      };
    })();
  }

  return dictionaryCache;
}

function ensureRequiredColumns(columns: string[]) {
  const existing = new Set(columns.map((column) => column.trim()).filter(Boolean));
  const missing = REQUIRED_COLUMNS.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(`Uploaded file is missing required columns: ${missing.join(", ")}`);
  }
}

function normalizeRows(rawRows: CategoryCalibrationUploadRow[], rowOffset: number) {
  return rawRows.map<NormalizedInputRow>((row, index) => ({
    rowIndex: rowOffset + index + 2,
    termId: normalizeText(row.TermID),
    termName: normalizeText(row.TermName),
    domain: normalizeText(row.Domain),
    landingPage: normalizeText(row["Landing Page"]),
    country: normalizeText(row.Country),
    language: normalizeText(row.Language),
    meta: normalizeText(row.Meta),
    about: normalizeText(row.About),
    currentCategoryId: normalizeText(row[CURRENT_CATEGORY_ID_COLUMN]),
    currentCategoryName: normalizeText(row[CURRENT_CATEGORY_NAME_COLUMN]),
  }));
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

async function classifyRow(row: NormalizedInputRow, dictionary: CategoryDictionary) {
  const currentAsChild = dictionary.childrenById.get(row.currentCategoryId);
  const currentAsParent = dictionary.parentsById.get(row.currentCategoryId);

  const messages = () => ({
    system: [
      "You are a category calibration engine.",
      "Choose the single best parent category and child category for the merchant based on Meta, About, TermName, Domain, and Country.",
      "Use only category ids from the provided taxonomy.",
      "Return JSON only with keys judgement, suggestedParentId, suggestedChildId.",
      "Judgement means whether the CURRENT category is acceptable. Use 正确 or 有误.",
      "Taxonomy:",
      dictionary.promptText,
    ].join("\n\n"),
    user: JSON.stringify(
      {
        termId: row.termId,
        termName: row.termName,
        domain: row.domain,
        landingPage: row.landingPage,
        country: row.country,
        language: row.language,
        meta: row.meta,
        about: row.about,
        currentCategory: {
          id: row.currentCategoryId,
          name: row.currentCategoryName,
          asParent: currentAsParent ? { id: currentAsParent.id, name: currentAsParent.name } : null,
          asChild: currentAsChild
            ? {
                id: currentAsChild.id,
                name: currentAsChild.name,
                parentId: currentAsChild.parentId,
                parentName: currentAsChild.parentName,
              }
            : null,
        },
      },
      null,
      2,
    ),
  });

  const executed = await aiExecutor.execute({
    buildMessages: messages,
    validate: (candidate) => parseCandidate(candidate, dictionary),
    buildRepairMessages: async (candidate, errors) => ({
      system: "Repair the previous JSON so it matches the required schema and taxonomy. Return JSON only.",
      user: JSON.stringify({ previousOutput: candidate, errors }, null, 2),
    }),
    requestTimeoutMs: env.aiRequestTimeoutMsBatch,
  });

  const parent = dictionary.parentsById.get(executed.result.suggestedParentId);
  const child = dictionary.childrenById.get(executed.result.suggestedChildId);
  if (!parent || !child) {
    throw new Error("AI output could not be mapped back to the taxonomy.");
  }

  const computedJudgement =
    row.currentCategoryId === parent.id || row.currentCategoryId === child.id ? "正确" : "有误";

  return {
    judgement: computedJudgement,
    suggestedParentId: parent.id,
    suggestedParentName: parent.name,
    suggestedChildId: child.id,
    suggestedChildName: child.name,
    usage: executed.usage,
  };
}

function buildWorkbookBuffer(rows: RowOutput[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: [...RESULT_HEADERS] }), "category_output");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

async function writeCsvRow(stream: WriteStream, row: RowOutput) {
  const line = [
    csvEscape(row.domain),
    csvEscape(row[RESULT_CURRENT_CATEGORY]),
    csvEscape(row[RESULT_JUDGEMENT]),
    csvEscape(row[RESULT_PARENT]),
    csvEscape(row[RESULT_CHILD]),
  ].join(",") + "\n";
  await new Promise<void>((resolve, reject) => {
    stream.write(line, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) chunks.push(items.slice(index, index + chunkSize));
  return chunks;
}

export async function previewCategoryCalibrationChunkRows(input: {
  columns: string[];
  sampleRawRows: CategoryCalibrationUploadRow[];
  totalRows: number;
}): Promise<CategoryCalibrationPreview> {
  ensureRequiredColumns(input.columns);
  return {
    inputMode: "xlsx-template",
    columns: input.columns,
    sampleRawRows: input.sampleRawRows,
    totalRows: input.totalRows,
    validRows: input.totalRows,
  };
}

export async function executeCategoryCalibrationChunkRows(input: {
  rawRowChunks: AsyncGenerator<CategoryCalibrationUploadRow[]>;
  columns: string[];
  sampleRawRows: CategoryCalibrationUploadRow[];
  totalRows: number;
  csvOutputPath: string;
  onProgress?: (progress: {
    processedRows: number;
    successRows: number;
    failedRows: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    completedSubBatches: number;
    totalSubBatches: number;
  }) => Promise<void> | void;
}) {
  ensureRequiredColumns(input.columns);
  if (!input.totalRows) throw new Error("Uploaded file is empty.");
  if (input.totalRows > categoryCalibrationUploadMaxRows) {
    throw new Error(`Category calibration supports up to ${categoryCalibrationUploadMaxRows} rows per run.`);
  }
  const dictionary = await loadCategoryDictionary();

  let processedRows = 0;
  let successRows = 0;
  let failedRows = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let rowOffset = 0;
  let completedSubBatches = 0;
  const totalSubBatches = Math.max(1, Math.ceil(input.totalRows / CATEGORY_CALIBRATION_SUB_BATCH_SIZE));
  const dedupeCache = new Map<
    string,
    | { ok: true; classified: Awaited<ReturnType<typeof classifyRow>> }
    | { ok: false; error: string }
  >();

  const rowResults: RowDebugResult[] = [];
  const csvStream = createWriteStream(input.csvOutputPath, { encoding: "utf8" });
  await new Promise<void>((resolve, reject) => {
    csvStream.write(`${RESULT_HEADERS.map((header) => csvEscape(header)).join(",")}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  try {
    for await (const rawChunkRows of input.rawRowChunks) {
      const normalizedChunk = normalizeRows(rawChunkRows, rowOffset);
      const subBatches = chunkItems(normalizedChunk, CATEGORY_CALIBRATION_SUB_BATCH_SIZE);
      rowOffset += rawChunkRows.length;

      for (const subBatch of subBatches) {
        const chunkResults = await mapWithConcurrency(subBatch, CATEGORY_CALIBRATION_ROW_CONCURRENCY, async (row) => {
          const fingerprint = rowFingerprint(row);
          const cached = dedupeCache.get(fingerprint);
          if (cached) {
            return cached.ok
              ? {
                  ok: true as const,
                  row,
                  classified: cached.classified,
                  deduped: true as const,
                }
              : {
                  ok: false as const,
                  row,
                  error: cached.error,
                  deduped: true as const,
                };
          }

          try {
            const classified = await classifyRow(row, dictionary);
            dedupeCache.set(fingerprint, { ok: true, classified });
            return {
              ok: true as const,
              row,
              classified,
              deduped: false as const,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dedupeCache.set(fingerprint, { ok: false, error: message });
            return {
              ok: false as const,
              row,
              error: message,
              deduped: false as const,
            };
          }
        });

        for (const item of chunkResults) {
          if (item.ok) {
            if (!item.deduped) {
              promptTokens += item.classified.usage.promptTokens;
              completionTokens += item.classified.usage.completionTokens;
            }
            successRows += 1;
            const outputRow: RowOutput = {
              domain: item.row.domain,
              [RESULT_CURRENT_CATEGORY]: currentCategoryDisplay(item.row),
              [RESULT_JUDGEMENT]: item.classified.judgement,
              [RESULT_PARENT]: categoryDisplay(item.classified.suggestedParentId, item.classified.suggestedParentName),
              [RESULT_CHILD]: categoryDisplay(item.classified.suggestedChildId, item.classified.suggestedChildName),
            };
            await writeCsvRow(csvStream, outputRow);
            rowResults.push({
              rowIndex: item.row.rowIndex,
              domain: item.row.domain,
              judgement: item.classified.judgement,
              suggestedParentId: item.classified.suggestedParentId,
              suggestedChildId: item.classified.suggestedChildId,
            });
          } else {
            failedRows += 1;
            const outputRow: RowOutput = {
              domain: item.row.domain,
              [RESULT_CURRENT_CATEGORY]: currentCategoryDisplay(item.row),
              [RESULT_JUDGEMENT]: "有误",
              [RESULT_PARENT]: "",
              [RESULT_CHILD]: "",
            };
            await writeCsvRow(csvStream, outputRow);
            rowResults.push({
              rowIndex: item.row.rowIndex,
              domain: item.row.domain,
              judgement: "有误",
              suggestedParentId: "",
              suggestedChildId: "",
              error: item.error,
            });
          }

          processedRows += 1;
        }

        completedSubBatches += 1;
        await input.onProgress?.({
          processedRows,
          successRows,
          failedRows,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUsd: Math.round(estimateCost(promptTokens, completionTokens) * 1_000_000) / 1_000_000,
          completedSubBatches,
          totalSubBatches,
        });
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      csvStream.end((error: Error | undefined) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  const estimatedCostUsd = estimateCost(promptTokens, completionTokens);

  return {
    rowResults,
    summary: {
      inputMode: "xlsx-template",
      totalRows: input.totalRows,
      processedRows,
      successRows,
      failedRows,
      aiModel: env.aiModel,
      dictionaryPath: CATEGORY_DICTIONARY_PATH,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      completedSubBatches,
      totalSubBatches,
      dedupeCacheSize: dedupeCache.size,
    },
  } as CalibrationResult & {
    summary: CalibrationResult["summary"] & {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      completedSubBatches: number;
      totalSubBatches: number;
      dedupeCacheSize: number;
    };
  };
}
