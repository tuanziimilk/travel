import { createWriteStream, type WriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { z } from "zod";
import { categoryCalibrationUploadMaxRows } from "@about-demo/trpc";
import { env, getAiUnitCostForModel } from "../env";
import { aiExecutor } from "../skills/aiExecutor";
import type { CategoryCalibrationUploadRow } from "./uploadStore";
import { sha256 } from "../utils/hash";
import categoryDictionaryRows from "./categoryDictionary.json";

const CATEGORY_DICTIONARY_FALLBACK_LABEL = "bundled:apps/api/src/category-calibration/categoryDictionary.json";
const CATEGORY_DICTIONARY_PATH = process.env.CATEGORY_CALIBRATION_DICTIONARY_PATH?.trim() || "";
const CURRENT_CATEGORY_ID_COLUMN = "\u5f53\u524d-category id";
const CURRENT_CATEGORY_NAME_COLUMN = "\u5f53\u524d-categoryName";
const RESULT_CURRENT_CATEGORY = "\u5f53\u524d\u5206\u7c7b";
const RESULT_JUDGEMENT = "\u5224\u65ad";
const RESULT_PARENT = "\u5efa\u8bae\u7236\u7c7b";
const RESULT_CHILD = "\u5efa\u8bae\u5b50\u7c7b";
const RESULT_NOTE = "\u6838\u9a8c\u8bf4\u660e";
const ROW_MARKER_VALUES = new Set(["\u5fc5\u586b", "\u9009\u586b", "\u793a\u4f8b", "example", "required", "optional"]);
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

const RESULT_HEADERS = ["domain", RESULT_CURRENT_CATEGORY, RESULT_JUDGEMENT, RESULT_PARENT, RESULT_CHILD, RESULT_NOTE] as const;
const JUDGEMENT_CORRECT = "\u6b63\u786e";
const JUDGEMENT_INCORRECT = "\u6709\u8bef";
const JUDGEMENT_NEW = "\u65e0\u5206\u7c7b\u65b0\u589e";

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
  dictionaryPath: string;
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
  [RESULT_NOTE]: string;
};

type RowDebugResult = {
  rowIndex: number;
  domain: string;
  judgement: string;
  suggestedParentId: string;
  suggestedChildId: string;
  note: string;
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
  judgement: z.enum([JUDGEMENT_CORRECT, JUDGEMENT_INCORRECT]).optional().default(JUDGEMENT_INCORRECT),
  suggestedParentId: z.string().trim().min(1),
  suggestedChildId: z.string().trim().min(1),
  verificationNote: z.string().trim().min(1).max(60).optional().default(""),
});

const verificationNoteSchema = z.object({
  verificationNote: z.string().trim().min(1).max(60),
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

function estimateCategoryCost(promptTokens: number, completionTokens: number, aiModel: string) {
  const cost = getAiUnitCostForModel(aiModel);
  return (
    (promptTokens / 1_000_000) * cost.inputPer1M +
    (completionTokens / 1_000_000) * cost.outputPer1M
  );
}

function formatCurrentCategoryDisplay(row: NormalizedInputRow) {
  if (!row.currentCategoryId && !row.currentCategoryName) return "-";
  return `${row.currentCategoryId} · ${row.currentCategoryName}`;
}

function formatCategoryDisplay(id: string, name: string) {
  return `${id} · ${name}`;
}

function hasCurrentCategory(row: NormalizedInputRow) {
  return Boolean(row.currentCategoryId || row.currentCategoryName);
}

function buildVerificationNote(input: {
  judgement: string;
  suggestedParentName?: string;
  suggestedChildName?: string;
  error?: string;
}) {
  if (input.error) return "\u7ed3\u679c\u672a\u751f\u6210";
  if (input.judgement === JUDGEMENT_NEW) {
    return `\u539f\u65e0\u5206\u7c7b\uff0c\u8865\u5145\u4e3a ${input.suggestedChildName || input.suggestedParentName || "\u5efa\u8bae\u7c7b\u76ee"}`;
  }
  if (input.judgement === JUDGEMENT_CORRECT) {
    return "\u5f53\u524d\u5206\u7c7b\u53ef\u7528";
  }
  const target = input.suggestedChildName || input.suggestedParentName || "\u5efa\u8bae\u7c7b\u76ee";
  return `\u66f4\u9002\u5408 ${target}`;
}

function sanitizeVerificationNote(value: string) {
  return normalizeText(value).replace(/[\u3002.!\uFF01]+$/u, "").slice(0, 60);
}

function addUsage(
  left: { promptTokens: number; completionTokens: number; totalTokens: number },
  right: { promptTokens: number; completionTokens: number; totalTokens: number },
) {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function normalizeJsonCandidate(candidate: string) {
  const text = String(candidate || "").trim();
  if (!text) return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return text;
}

function extractFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    const value = matched?.[1]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeJudgementValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("\u6b63\u786e") || normalized === "yes" || normalized === "correct" || normalized === "right") {
    return JUDGEMENT_CORRECT;
  }
  if (
    normalized.includes("\u6709\u8bef") ||
    normalized.includes("\u9519\u8bef") ||
    normalized === "no" ||
    normalized === "wrong" ||
    normalized === "incorrect"
  ) {
    return JUDGEMENT_INCORRECT;
  }
  return "";
}

function salvageStructuredCandidate(candidate: string) {
  const text = String(candidate || "");
  if (!text.trim()) return null;

  const suggestedParentId = extractFirstMatch(text, [
    /"suggestedParentId"\s*:\s*"?(\\?\d+)"?/i,
    /suggestedParentId\s*[:=]\s*"?(\\?\d+)"?/i,
    /parent(?:\s+category)?\s*id\s*[:=]\s*"?(\\?\d+)"?/i,
  ]).replace(/\\/g, "");
  const suggestedChildId = extractFirstMatch(text, [
    /"suggestedChildId"\s*:\s*"?(\\?\d+)"?/i,
    /suggestedChildId\s*[:=]\s*"?(\\?\d+)"?/i,
    /child(?:\s+category)?\s*id\s*[:=]\s*"?(\\?\d+)"?/i,
  ]).replace(/\\/g, "");
  const judgement = normalizeJudgementValue(
    extractFirstMatch(text, [
      /"judgement"\s*:\s*"([^"]+)"/i,
      /judgement\s*[:=]\s*"?(\u6b63\u786e|\u6709\u8bef|correct|incorrect|wrong|right|yes|no)"?/i,
      /\u5224\u65ad\s*[:=：]\s*"?(\u6b63\u786e|\u6709\u8bef)"?/i,
    ]),
  );

  if (!suggestedParentId || !suggestedChildId) return null;

  return {
    judgement: judgement || JUDGEMENT_INCORRECT,
    suggestedParentId,
    suggestedChildId,
    verificationNote: sanitizeVerificationNote(
      extractFirstMatch(text, [
        /"verificationNote"\s*:\s*"([^"]+)"/i,
        /\u6838\u9a8c\u8bf4\u660e\s*[:=：]\s*"?([^"\r\n]+)"?/i,
        /note\s*[:=]\s*"?([^"\r\n]+)"?/i,
      ]),
    ),
  };
}

function isMarkerLike(value: string) {
  return ROW_MARKER_VALUES.has(value.trim().toLowerCase());
}

function isInstructionRow(row: NormalizedInputRow) {
  return [
    row.termId,
    row.termName,
    row.domain,
    row.landingPage,
    row.country,
    row.language,
    row.currentCategoryId,
    row.currentCategoryName,
  ].every((value) => !value || isMarkerLike(value));
}

function filterProcessableRows(rows: NormalizedInputRow[]) {
  return rows.filter((row) => !isInstructionRow(row));
}

function humanizeRowError(message: string) {
  const normalized = String(message || "").trim();
  if (!normalized) return "模型未返回有效结果。";
  if (normalized.includes("suggestedParentId: Required") || normalized.includes("suggestedChildId: Required")) {
    return "模型返回了不完整的分类结果，缺少建议父类或建议子类。";
  }
  if (normalized.includes("not a valid parent category id")) {
    return "模型给出的建议父类不在分类字典中。";
  }
  if (normalized.includes("not a valid child category id")) {
    return "模型给出的建议子类不在分类字典中。";
  }
  if (normalized.includes("does not belong to parent")) {
    return "模型给出的父子类组合不符合分类字典。";
  }
  if (normalized.toLowerCase().includes("timeout")) {
    return "调用模型超时，请稍后重试。";
  }
  if (normalized.startsWith("LLM")) {
    return "调用模型失败，未拿到可用分类结果。";
  }
  if (normalized.startsWith("AI 执行校验失败")) {
    return "模型返回结果不符合要求，无法生成有效分类。";
  }
  return normalized;
}

function summarizeFailureReasons(rowResults: RowDebugResult[]) {
  const distinct = new Map<string, number>();
  for (const item of rowResults) {
    if (!item.error) continue;
    const reason = humanizeRowError(item.error);
    distinct.set(reason, (distinct.get(reason) || 0) + 1);
  }
  return Array.from(distinct.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason}（${count}条）`);
}

function parseCandidate(candidate: string, dictionary: CategoryDictionary) {
  const normalizedCandidate = normalizeJsonCandidate(candidate);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedCandidate);
  } catch (error) {
    const salvaged = salvageStructuredCandidate(candidate);
    if (salvaged) {
      parsed = salvaged;
    } else {
      return {
        ok: false as const,
        errors: [error instanceof Error ? error.message : "Invalid JSON output."],
      };
    }
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
      verificationNote: sanitizeVerificationNote(normalized.data.verificationNote || ""),
    },
    errors: [] as string[],
  };
}

async function loadCategoryDictionary(): Promise<CategoryDictionary> {
  if (!dictionaryCache) {
    dictionaryCache = (async () => {
      const rawRows = CATEGORY_DICTIONARY_PATH
        ? await (async () => {
            const resolvedPath = path.resolve(CATEGORY_DICTIONARY_PATH);
            const buffer = await readFile(resolvedPath);
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
          })()
        : (categoryDictionaryRows as Array<Record<string, unknown>>);

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
          const childText = parent.children.map((child) => `${child.id} ${child.name}`).join(", ");
          return `${parent.id} ${parent.name}: ${childText}`;
        })
        .join("\n");

      return {
        parents,
        parentsById,
        childrenById,
        promptText,
        dictionaryPath: CATEGORY_DICTIONARY_PATH || CATEGORY_DICTIONARY_FALLBACK_LABEL,
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

export function countProcessableCategoryCalibrationRows(rawRows: CategoryCalibrationUploadRow[], rowOffset = 0) {
  return filterProcessableRows(normalizeRows(rawRows, rowOffset)).length;
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

async function classifyRow(row: NormalizedInputRow, dictionary: CategoryDictionary, aiModel: string) {
  const currentAsChild = dictionary.childrenById.get(row.currentCategoryId);
  const currentAsParent = dictionary.parentsById.get(row.currentCategoryId);

  const messages = () => ({
    system: [
      "You are a category calibration engine.",
      "Choose the single best parent category and child category for the merchant based on Meta, About, TermName, Domain, and Country.",
      "Use only category ids from the provided taxonomy.",
      "Return JSON only with keys judgement, suggestedParentId, suggestedChildId, verificationNote.",
      `Judgement means whether the CURRENT category is acceptable. Use exact Chinese values: ${JUDGEMENT_CORRECT} or ${JUDGEMENT_INCORRECT}.`,
      "verificationNote must be short Chinese text for humans, ideally within 8-20 characters, with no line breaks and no markdown.",
      "If current category is empty, verificationNote should reflect that this is a new category addition.",
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

  const executeStrictPass = async (strictMode: boolean) =>
    aiExecutor.execute({
      buildMessages: () => {
        const built = messages();
        if (!strictMode) return built;
        return {
          system: [
            built.system,
            `Output must be a single JSON object only. Example: {"judgement":"${JUDGEMENT_INCORRECT}","suggestedParentId":"32","suggestedChildId":"212","verificationNote":"\u66f4\u9002\u5408\u8fd0\u52a8\u670d\u9970"}`,
            "Do not wrap the JSON in markdown.",
            "Do not omit any field.",
            "suggestedParentId and suggestedChildId must be strings containing valid taxonomy ids.",
            "verificationNote must be a short Chinese sentence only.",
          ].join("\n\n"),
          user: built.user,
        };
      },
      validate: (candidate) => parseCandidate(candidate, dictionary),
      buildRepairMessages: async (candidate, errors) => ({
        system: strictMode
          ? 'Repair the output into exactly one JSON object with keys judgement, suggestedParentId, suggestedChildId, verificationNote. No markdown, no explanation.'
          : "Repair the previous JSON so it matches the required schema and taxonomy. Return JSON only.",
        user: JSON.stringify(
          strictMode
            ? {
                previousOutput: candidate,
                errors,
                requiredFormat: {
                  judgement: `${JUDGEMENT_CORRECT}|${JUDGEMENT_INCORRECT}`,
                  suggestedParentId: "valid parent id as string",
                  suggestedChildId: "valid child id as string",
                  verificationNote: "short Chinese note for humans",
                },
              }
            : { previousOutput: candidate, errors },
          null,
          2,
        ),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: strictMode ? 3 : undefined,
    });

  const generateVerificationNote = async (input: {
    finalJudgement: string;
    suggestedParentName: string;
    suggestedChildName: string;
  }) =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You write one short verification note for category calibration results.",
          "Return JSON only with key verificationNote.",
          "verificationNote must be concise Chinese for humans, ideally 8-20 characters.",
          "Do not explain the full reasoning.",
          "Do not use markdown or line breaks.",
        ].join("\n\n"),
        user: JSON.stringify(
          {
            domain: row.domain,
            termName: row.termName,
            country: row.country,
            meta: row.meta,
            about: row.about,
            currentCategory: {
              id: row.currentCategoryId,
              name: row.currentCategoryName,
            },
            judgement: input.finalJudgement,
            suggestedParent: input.suggestedParentName,
            suggestedChild: input.suggestedChildName,
          },
          null,
          2,
        ),
      }),
      validate: (candidate) => {
        const normalizedCandidate = normalizeJsonCandidate(candidate);
        let parsed: unknown;
        try {
          parsed = JSON.parse(normalizedCandidate);
        } catch (error) {
          const salvaged = sanitizeVerificationNote(
            extractFirstMatch(String(candidate || ""), [
              /"verificationNote"\s*:\s*"([^"]+)"/i,
              /\u6838\u9a8c\u8bf4\u660e\s*[:=：]\s*"?([^"\r\n]+)"?/i,
              /note\s*[:=]\s*"?([^"\r\n]+)"?/i,
            ]),
          );
          if (!salvaged) {
            return {
              ok: false as const,
              errors: [error instanceof Error ? error.message : "Invalid JSON output."],
            };
          }
          parsed = { verificationNote: salvaged };
        }

        const validated = verificationNoteSchema.safeParse(parsed);
        if (!validated.success) {
          return {
            ok: false as const,
            errors: validated.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
          };
        }

        return {
          ok: true as const,
          value: {
            verificationNote: sanitizeVerificationNote(validated.data.verificationNote),
          },
          errors: [] as string[],
        };
      },
      buildRepairMessages: async (candidate, errors) => ({
        system: 'Repair the output into exactly one JSON object with key verificationNote. No markdown, no explanation.',
        user: JSON.stringify(
          {
            previousOutput: candidate,
            errors,
            requiredFormat: {
              verificationNote: "short Chinese note for humans",
            },
          },
          null,
          2,
        ),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: 2,
    });

  let executed;
  try {
    executed = await executeStrictPass(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetryStrict =
      message.includes("AI 执行校验失败") ||
      message.includes("Required") ||
      message.includes("Invalid JSON output") ||
      message.includes("not a valid");
    if (!shouldRetryStrict) throw error;
    executed = await executeStrictPass(true);
  }

  const parent = dictionary.parentsById.get(executed.result.suggestedParentId);
  const child = dictionary.childrenById.get(executed.result.suggestedChildId);
  if (!parent || !child) {
    throw new Error("AI output could not be mapped back to the taxonomy.");
  }

  const computedJudgement =
    row.currentCategoryId === parent.id || row.currentCategoryId === child.id ? JUDGEMENT_CORRECT : JUDGEMENT_INCORRECT;
  const finalJudgement = !hasCurrentCategory(row) ? JUDGEMENT_NEW : computedJudgement;
  let verificationNote = sanitizeVerificationNote(executed.result.verificationNote || "");
  let usage = executed.usage;

  if (!verificationNote) {
    const noteGenerated = await generateVerificationNote({
      finalJudgement,
      suggestedParentName: parent.name,
      suggestedChildName: child.name,
    });
    verificationNote = sanitizeVerificationNote(noteGenerated.result.verificationNote);
    usage = addUsage(usage, noteGenerated.usage);
  }

  return {
    judgement: finalJudgement,
    suggestedParentId: parent.id,
    suggestedParentName: parent.name,
    suggestedChildId: child.id,
    suggestedChildName: child.name,
    verificationNote,
    usage,
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
    csvEscape(row[RESULT_NOTE]),
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
  aiModel: string;
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
  let lastProgressReportedAt = 0;
  const totalSubBatches = Math.max(1, Math.ceil(input.totalRows / CATEGORY_CALIBRATION_SUB_BATCH_SIZE));
  const dedupeCache = new Map<
    string,
    | { ok: true; classified: Awaited<ReturnType<typeof classifyRow>> }
    | { ok: false; error: string }
  >();

  const rowResults: RowDebugResult[] = [];
  const csvStream = createWriteStream(input.csvOutputPath, { encoding: "utf8" });
  await new Promise<void>((resolve, reject) => {
    csvStream.write(`\uFEFF${RESULT_HEADERS.map((header) => csvEscape(header)).join(",")}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  try {
    for await (const rawChunkRows of input.rawRowChunks) {
      const normalizedChunk = filterProcessableRows(normalizeRows(rawChunkRows, rowOffset));
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
            const classified = await classifyRow(row, dictionary, input.aiModel);
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
              [RESULT_CURRENT_CATEGORY]: formatCurrentCategoryDisplay(item.row),
              [RESULT_JUDGEMENT]: item.classified.judgement,
              [RESULT_PARENT]: formatCategoryDisplay(item.classified.suggestedParentId, item.classified.suggestedParentName),
              [RESULT_CHILD]: formatCategoryDisplay(item.classified.suggestedChildId, item.classified.suggestedChildName),
              [RESULT_NOTE]: item.classified.verificationNote,
            };
            await writeCsvRow(csvStream, outputRow);
            rowResults.push({
              rowIndex: item.row.rowIndex,
              domain: item.row.domain,
              judgement: item.classified.judgement,
              suggestedParentId: item.classified.suggestedParentId,
              suggestedChildId: item.classified.suggestedChildId,
              note: item.classified.verificationNote,
            });
          } else {
            failedRows += 1;
            const failedJudgementText = hasCurrentCategory(item.row) ? JUDGEMENT_INCORRECT : JUDGEMENT_NEW;
            const outputRow: RowOutput = {
              domain: item.row.domain,
              [RESULT_CURRENT_CATEGORY]: formatCurrentCategoryDisplay(item.row),
              [RESULT_JUDGEMENT]: failedJudgementText,
              [RESULT_PARENT]: "",
              [RESULT_CHILD]: "",
              [RESULT_NOTE]: buildVerificationNote({
                judgement: failedJudgementText,
                error: item.error,
              }),
            };
            await writeCsvRow(csvStream, outputRow);
            rowResults.push({
              rowIndex: item.row.rowIndex,
              domain: item.row.domain,
              judgement: failedJudgementText,
              suggestedParentId: "",
              suggestedChildId: "",
              note: buildVerificationNote({
                judgement: failedJudgementText,
                error: item.error,
              }),
              error: item.error,
            });
          }

          processedRows += 1;
          if (input.onProgress) {
            const now = Date.now();
            if (processedRows <= 10 || processedRows === input.totalRows || now - lastProgressReportedAt >= 1200) {
              lastProgressReportedAt = now;
              await input.onProgress({
                processedRows,
                successRows,
                failedRows,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
                estimatedCostUsd: Math.round(estimateCategoryCost(promptTokens, completionTokens, input.aiModel) * 1_000_000) / 1_000_000,
                completedSubBatches,
                totalSubBatches,
              });
            }
          }
        }

        completedSubBatches += 1;
        await input.onProgress?.({
          processedRows,
          successRows,
          failedRows,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUsd: Math.round(estimateCategoryCost(promptTokens, completionTokens, input.aiModel) * 1_000_000) / 1_000_000,
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

  const estimatedCostUsd = estimateCategoryCost(promptTokens, completionTokens, input.aiModel);

  return {
    rowResults,
    summary: {
      inputMode: "xlsx-template",
      totalRows: input.totalRows,
      processedRows,
      successRows,
      failedRows,
      aiModel: input.aiModel,
      dictionaryPath: dictionary.dictionaryPath,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      completedSubBatches,
      totalSubBatches,
      dedupeCacheSize: dedupeCache.size,
      failureReasonSamples: summarizeFailureReasons(rowResults),
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
      failureReasonSamples: string[];
    };
  };
}
