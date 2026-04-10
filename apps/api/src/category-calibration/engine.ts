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
const CATEGORY_CALIBRATION_ROW_CONCURRENCY = Math.max(1, Number(process.env.CATEGORY_CALIBRATION_ROW_CONCURRENCY || 5));
const CATEGORY_CALIBRATION_SUB_BATCH_SIZE = Math.max(200, Number(process.env.CATEGORY_CALIBRATION_SUB_BATCH_SIZE || 2000));
const CATEGORY_CALIBRATION_PROGRESS_INTERVAL_MS = Math.max(
  300,
  Number(process.env.CATEGORY_CALIBRATION_PROGRESS_INTERVAL_MS || 800),
);
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
const JUDGEMENT_MORE_PRECISE = "\u53ef\u66f4\u7cbe\u51c6";
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
    primarySuccessRows: number;
    recoveredRows: number;
    noteRewrittenRows: number;
    programmaticallyRecoveredRows: number;
    finalFailedRows: number;
    aiCallRows: number;
    dedupedRows: number;
    progressFlushCount: number;
    rowConcurrency: number;
    judgementCounts: Record<string, number>;
    failureBuckets: Record<string, number>;
  };
};

const aiOutputSchema = z.object({
  judgementHint: z.string().trim().max(120).optional().default(""),
  suggestedParentId: z.string().trim().max(32).optional().default(""),
  suggestedChildId: z.string().trim().max(32).optional().default(""),
  merchantBusiness: z.string().trim().max(120).optional().default(""),
  classificationReason: z.string().trim().max(120).optional().default(""),
  verificationNote: z.string().trim().max(120).optional().default(""),
});

const verificationNoteSchema = z.object({
  verificationNote: z.string().trim().min(1).max(120),
});

type ParsedCandidate = {
  judgementHint: string;
  suggestedParentId: string;
  suggestedParentName: string;
  suggestedChildId: string;
  suggestedChildName: string;
  merchantBusiness: string;
  classificationReason: string;
  verificationNote: string;
  parseMode: "json" | "salvaged";
  programmaticallyRecovered: boolean;
};

type FinalClassification = {
  judgement: string;
  suggestedParentId: string;
  suggestedParentName: string;
  suggestedChildId: string;
  suggestedChildName: string;
  verificationNote: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  stats: {
    usedRecoveryRequest: boolean;
    programmaticallyRecovered: boolean;
    noteRewritten: boolean;
  };
};

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

function displayCategoryValue(id: string, name: string) {
  if (!id && !name) return "";
  if (!id) return name;
  if (!name) return id;
  return `${id} \u00b7 ${name}`;
}

function displayCurrentCategoryValue(row: NormalizedInputRow) {
  if (!row.currentCategoryId && !row.currentCategoryName) return "-";
  return displayCategoryValue(row.currentCategoryId, row.currentCategoryName);
}

function sanitizeVerificationNote(value: string) {
  return normalizeText(value)
    .replace(/[\u3002.!\uFF01]+$/u, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function cleanupAiVerificationNote(value: string) {
  return sanitizeVerificationNote(value)
    .replace(/^该商家主营主营/, "主营")
    .replace(/^该商家主营经营/, "主营")
    .replace(/^该商家主营是一个/, "主营")
    .replace(/^该商家主营是一家/, "主营")
    .replace(/^该商家主营主要/, "主营")
    .replace(/^该商家主营/, "主营")
    .replace(/^主营主营/, "主营")
    .replace(/^主营是一个/, "主营")
    .replace(/^主营是一家/, "主营")
    .replace(/^主营主要/, "主营")
    .replace(/，主营/g, "，主要经营")
    .replace(/因此应归类于/g, "应归入")
    .replace(/因此应属/g, "应归入")
    .replace(/，因此应归入([^，]+)，非([^，]+)$/, "，应归入$1，非$2")
    .replace(/，因此应属([^，]+)，非([^，]+)$/, "，应归入$1，非$2")
    .replace(/，当前无分类，建议新增归入$/, "")
    .replace(/，{2,}/g, "，")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeFreeformText(value: string, maxLength = 72) {
  return normalizeText(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[。.!！]+$/u, "")
    .replace(/^[\-:：、，\s]+|[\-:：、，\s]+$/g, "")
    .slice(0, maxLength);
}

function inferMerchantBusinessSnippet(row: NormalizedInputRow) {
  const candidates = [row.about, row.meta, row.termName, row.domain]
    .map((value) => sanitizeFreeformText(value, 50))
    .filter(Boolean);
  return candidates[0] || `\u57df\u540d ${row.domain}`;
}

function stripKnownLeadPhrases(value: string, leads: string[]) {
  let next = sanitizeFreeformText(value, 80);
  for (const lead of leads.filter(Boolean)) {
    const escaped = lead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`^${escaped}`), "");
  }
  return sanitizeFreeformText(next, 80);
}

function normalizeBusinessPhrase(row: NormalizedInputRow, value: string) {
  const normalized = stripKnownLeadPhrases(value, [row.termName, row.domain, row.domain.replace(/^www\./i, "")])
    .replace(/^(?:\u8be5\u5546\u5bb6\u4e3b\u8425|\u4e3b\u8981\u7ecf\u8425|\u4e3b\u8981\u9500\u552e|\u4e13\u6ce8\u4e8e|\u4e13\u8425|\u63d0\u4f9b|\u9500\u552e|\u662f\u4e00\u5bb6|\u4e00\u5bb6)/, "")
    .replace(/^(?:online|brand|store|shop)\b[:：\s-]*/i, "")
    .replace(/[，,:：;；]+$/, "");
  return sanitizeFreeformText(normalized || inferMerchantBusinessSnippet(row), 52);
}

function extractChineseBusinessFromReason(reason: string) {
  const normalized = sanitizeFreeformText(reason, 80);
  const matched =
    normalized.match(/(?:\u4e3b\u8981\u7ecf\u8425|\u4e3b\u8425|\u9500\u552e|\u63d0\u4f9b)([^，。,]{4,28})/) ||
    normalized.match(/([\u4e00-\u9fa5]{6,24}(?:\u73e0\u5b9d|\u5bb6\u5177|\u8425\u517b|\u8865\u5145\u5242|\u89c6\u9891|\u670d\u88c5|\u914d\u4ef6|\u65b0\u95fb|\u6559\u80b2|\u57f9\u8bad))/);
  return sanitizeFreeformText(matched?.[1] || "", 28);
}

function normalizeReasonPhrase(value: string, target: string, current: string) {
  return sanitizeFreeformText(value, 56)
    .replace(/\b(current category|merchant|website|site content)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\u66f4\u7cbe\u51c6`, "g"), `${target} \u66f4\u7cbe\u51c6`)
    .replace(new RegExp(`\u5e94\u5c5e\\s*${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "")
    .replace(new RegExp(`\u975e\\s*${current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "")
    .replace(/^[，,\s]+|[，,\s]+$/g, "");
}

function looksTooAsciiHeavy(value: string) {
  const text = String(value || "");
  if (!text) return false;
  const asciiChars = (text.match(/[A-Za-z]/g) || []).length;
  return asciiChars >= 18 && asciiChars / text.length > 0.35;
}

function isGenericNote(value: string) {
  const normalized = sanitizeVerificationNote(value);
  if (!normalized) return true;
  return (
    normalized.length < 10 ||
    /\u8fd9\u662f\u65b0\u5206\u7c7b\u6dfb\u52a0|\u65b0\u5206\u7c7b\u6dfb\u52a0|\u5f53\u524d\u5206\u7c7b\u53ef\u7528|\u66f4\u9002\u5408|\u5efa\u8bae\u5f52\u5165/.test(
      normalized,
    )
  );
}

function buildProgrammaticVerificationNote(input: {
  row: NormalizedInputRow;
  judgement: string;
  currentCategoryDisplay: string;
  suggestedParentName?: string;
  suggestedChildName?: string;
  merchantBusiness?: string;
  classificationReason?: string;
  error?: string;
}) {
  let business = normalizeBusinessPhrase(input.row, input.merchantBusiness || inferMerchantBusinessSnippet(input.row));
  const target = sanitizeFreeformText(input.suggestedChildName || input.suggestedParentName || "\u5efa\u8bae\u7c7b\u76ee", 36);
  const current = sanitizeFreeformText(input.currentCategoryDisplay, 36);
  const reason = normalizeReasonPhrase(input.classificationReason || "", target, current);
  if (looksTooAsciiHeavy(business)) {
    business = extractChineseBusinessFromReason(reason) || business;
  }

  if (input.error) {
    if (input.judgement === JUDGEMENT_NEW) {
      return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5f53\u524d\u65e0\u5206\u7c7b\uff0c\u5efa\u8bae\u65b0\u589e\u5f52\u5165${target}`);
    }
    if (input.judgement === JUDGEMENT_MORE_PRECISE) {
      return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c${target}\u6bd4\u5f53\u524d\u5206\u7c7b\u66f4\u7cbe\u51c6`);
    }
    if (input.judgement === JUDGEMENT_CORRECT) {
      return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5f53\u524d\u5f52\u7c7b\u4e3a${target}\uff0c\u5224\u65ad\u6b63\u786e`);
    }
    return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5e94\u5f52\u5165${target}\uff0c\u975e${current}`);
  }
  if (input.judgement === JUDGEMENT_NEW) {
    return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5f53\u524d\u65e0\u5206\u7c7b\uff0c\u5efa\u8bae\u65b0\u589e\u5f52\u5165${target}`);
  }
  if (input.judgement === JUDGEMENT_MORE_PRECISE) {
    return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c${target}\u6bd4\u5f53\u524d\u5206\u7c7b\u66f4\u7cbe\u51c6`);
  }
  if (input.judgement === JUDGEMENT_CORRECT) {
    return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5f53\u524d\u5f52\u7c7b\u4e3a${target}\uff0c\u5224\u65ad\u6b63\u786e`);
  }
  if (reason) {
    return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c${reason}\uff0c\u5e94\u5f52\u5165${target}\uff0c\u975e${current}`);
  }
  return sanitizeVerificationNote(`\u4e3b\u8425${business}\uff0c\u5e94\u5f52\u5165${target}\uff0c\u975e${current}`);
}

function noteLooksConsistent(input: {
  note: string;
  judgement: string;
  currentCategoryDisplay: string;
  suggestedParentName?: string;
  suggestedChildName?: string;
}) {
  const note = sanitizeVerificationNote(input.note);
  if (isGenericNote(note)) return false;
  const current = sanitizeFreeformText(input.currentCategoryDisplay, 36);
  const target = sanitizeFreeformText(input.suggestedChildName || input.suggestedParentName || "", 36);

  if (input.judgement === JUDGEMENT_NEW) {
    return /无分类|新增|归入/.test(note) && (!target || note.includes(target));
  }
  if (input.judgement === JUDGEMENT_MORE_PRECISE) {
    return /更精准/.test(note) && (!target || note.includes(target));
  }
  if (input.judgement === JUDGEMENT_CORRECT) {
    return /准确|正确|精准/.test(note) && (!target || note.includes(target));
  }
  return (/应属|非/.test(note) || (target && note.includes(target) && current && note.includes(current)));
}

function findMentionedCategoryConflicts(input: {
  dictionary: CategoryDictionary;
  text: string;
  allowedNames: string[];
}) {
  const text = sanitizeFreeformText(input.text, 120);
  if (!text) return [];
  const allowed = new Set(input.allowedNames.filter(Boolean));
  const hits = new Set<string>();

  for (const parent of input.dictionary.parents) {
    if (parent.name.length >= 3 && text.includes(parent.name) && !allowed.has(parent.name)) hits.add(parent.name);
    for (const child of parent.children) {
      if (child.name.length >= 3 && text.includes(child.name) && !allowed.has(child.name)) hits.add(child.name);
    }
  }

  return Array.from(hits).slice(0, 4);
}

function classificationLooksConsistent(input: {
  dictionary: CategoryDictionary;
  judgement: string;
  currentCategoryDisplay: string;
  suggestedParentName: string;
  suggestedChildName: string;
  classificationReason: string;
  verificationNote: string;
}) {
  const target = sanitizeFreeformText(input.suggestedChildName || input.suggestedParentName, 36);
  const current = sanitizeFreeformText(input.currentCategoryDisplay, 36);
  const allowed = [target, input.suggestedParentName, current];
  const reasonConflicts = findMentionedCategoryConflicts({
    dictionary: input.dictionary,
    text: input.classificationReason,
    allowedNames: allowed,
  });
  const noteConflicts = findMentionedCategoryConflicts({
    dictionary: input.dictionary,
    text: input.verificationNote,
    allowedNames: allowed,
  });
  if (reasonConflicts.length > 0 || noteConflicts.length > 0) return false;
  return noteLooksConsistent({
    note: input.verificationNote,
    judgement: input.judgement,
    currentCategoryDisplay: input.currentCategoryDisplay,
    suggestedParentName: input.suggestedParentName,
    suggestedChildName: input.suggestedChildName,
  });
}

function shouldRetryClassificationConsistency(input: {
  dictionary: CategoryDictionary;
  currentCategoryDisplay: string;
  suggestedParentName: string;
  suggestedChildName: string;
  classificationReason: string;
  verificationNote: string;
}) {
  const target = sanitizeFreeformText(input.suggestedChildName || input.suggestedParentName, 36);
  const current = sanitizeFreeformText(input.currentCategoryDisplay, 36);
  const allowed = [target, input.suggestedParentName, current];
  return (
    findMentionedCategoryConflicts({
      dictionary: input.dictionary,
      text: input.classificationReason,
      allowedNames: allowed,
    }).length > 0 ||
    findMentionedCategoryConflicts({
      dictionary: input.dictionary,
      text: input.verificationNote,
      allowedNames: allowed,
    }).length > 0
  );
}

function noteNeedsRewrite(input: {
  judgement: string;
  currentCategoryDisplay: string;
  suggestedParentName: string;
  suggestedChildName: string;
  verificationNote: string;
}) {
  return (
    /本次校验失败|请重试/.test(input.verificationNote) ||
    looksTooAsciiHeavy(input.verificationNote) ||
    !noteLooksConsistent({
      note: cleanupAiVerificationNote(input.verificationNote),
      judgement: input.judgement,
      currentCategoryDisplay: input.currentCategoryDisplay,
      suggestedParentName: input.suggestedParentName,
      suggestedChildName: input.suggestedChildName,
    })
  );
}

function noteNeedsRewriteLite(input: {
  judgement: string;
  currentCategoryDisplay: string;
  suggestedParentName: string;
  suggestedChildName: string;
  verificationNote: string;
}) {
  const note = sanitizeVerificationNote(input.verificationNote)
    .replace(/^(?:\u8be5\u5546\u5bb6)?\u4e3b\u8425+/u, "\u4e3b\u8425")
    .replace(/^\u4e3b\u8425(?:\u662f|\u7ecf\u8425)?/u, "\u4e3b\u8425")
    .replace(/\u3002+$/u, "")
    .trim();
  if (!note) return true;
  if (/\u8bf7\u91cd\u8bd5|\u6821\u9a8c\u5931\u8d25|\u6682\u65e0\u6cd5\u5224\u65ad/u.test(note)) return true;
  if (looksTooAsciiHeavy(note)) return true;
  if (isGenericNote(note)) return true;
  if (!/[\u4e00-\u9fa5]/u.test(note)) return true;
  if (note.length < 8) return true;
  return false;
}

function normalizePrimaryVerificationNote(value: string) {
  return sanitizeVerificationNote(value)
    .replace(/^(?:\u8be5\u5546\u5bb6)?\u4e3b\u8425+/u, "\u4e3b\u8425")
    .replace(/^\u4e3b\u8425(?:\u662f|\u7ecf\u8425)?/u, "\u4e3b\u8425")
    .replace(/(\u5f53\u524d\u65e0\u5206\u7c7b\uff0c\u5efa\u8bae\u65b0\u589e\u5f52\u5165[^\uff0c,]*)\1+/gu, "$1")
    .replace(/\u3002+$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function shouldRetryCategoryRecoveryError(message: string) {
  const normalized = String(message || "");
  return (
    normalized.includes("does not belong to parent") ||
    normalized.includes("not a valid parent category id") ||
    normalized.includes("not a valid child category id") ||
    normalized.startsWith("AI ")
  );
}

function normalizeJudgementHintValue(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("\u53ef\u66f4\u7cbe\u51c6") ||
    normalized.includes("more precise") ||
    normalized.includes("more specific")
  ) {
    return JUDGEMENT_MORE_PRECISE;
  }
  if (normalized.includes("\u65e0\u5206\u7c7b") || normalized.includes("\u65b0\u589e") || normalized === "new") {
    return JUDGEMENT_NEW;
  }
  return normalizeJudgementValue(value);
}

function salvageStructuredCandidateV2(candidate: string) {
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
  const judgementHint = normalizeJudgementHintValue(
    extractFirstMatch(text, [
      /"judgementHint"\s*:\s*"([^"]+)"/i,
      /"judgement"\s*:\s*"([^"]+)"/i,
      /judgement(?:Hint)?\s*[:=]\s*"?([^"\r\n]+)"?/i,
      /\u5224\u65ad\s*[:=]\s*"?([^"\r\n]+)"?/i,
    ]),
  );
  const merchantBusiness = sanitizeFreeformText(
    extractFirstMatch(text, [
      /"merchantBusiness"\s*:\s*"([^"]+)"/i,
      /merchantBusiness\s*[:=]\s*"?([^"\r\n]+)"?/i,
      /\u5546\u5bb6\u4e3b\u8425\s*[:=]\s*"?([^"\r\n]+)"?/i,
    ]),
    72,
  );
  const classificationReason = sanitizeFreeformText(
    extractFirstMatch(text, [
      /"classificationReason"\s*:\s*"([^"]+)"/i,
      /classificationReason\s*[:=]\s*"?([^"\r\n]+)"?/i,
      /\u5f52\u7c7b\u539f\u56e0\s*[:=]\s*"?([^"\r\n]+)"?/i,
      /\u539f\u56e0\s*[:=]\s*"?([^"\r\n]+)"?/i,
    ]),
    72,
  );
  const verificationNote = sanitizeVerificationNote(
    extractFirstMatch(text, [
      /"verificationNote"\s*:\s*"([^"]+)"/i,
      /\u6838\u9a8c\u8bf4\u660e\s*[:=]\s*"?([^"\r\n]+)"?/i,
      /note\s*[:=]\s*"?([^"\r\n]+)"?/i,
    ]),
  );
  if (!suggestedParentId && !suggestedChildId && !merchantBusiness && !classificationReason && !verificationNote) {
    return null;
  }
  return {
    judgementHint,
    suggestedParentId,
    suggestedChildId,
    merchantBusiness,
    classificationReason,
    verificationNote,
    parseMode: "salvaged" as const,
  };
}

function parseCandidate(candidate: string, dictionary: CategoryDictionary) {
  const normalizedCandidate = normalizeJsonCandidate(candidate);
  let parsed: unknown;
  let parseMode: "json" | "salvaged" = "json";
  try {
    parsed = JSON.parse(normalizedCandidate);
  } catch (error) {
    const salvaged = salvageStructuredCandidateV2(candidate);
    if (salvaged) {
      parsed = salvaged;
      parseMode = "salvaged";
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

  const child = normalized.data.suggestedChildId ? dictionary.childrenById.get(normalized.data.suggestedChildId) : undefined;
  const parentById = normalized.data.suggestedParentId ? dictionary.parentsById.get(normalized.data.suggestedParentId) : undefined;
  const repairedParent = child ? dictionary.parentsById.get(child.parentId) : undefined;
  const parent = repairedParent || parentById;

  if (!parent && !child) {
    return {
      ok: false as const,
      errors: ["No valid category id could be extracted from model output."],
    };
  }

  if (normalized.data.suggestedChildId && !child) {
    return {
      ok: false as const,
      errors: [`suggestedChildId ${normalized.data.suggestedChildId} is not a valid child category id.`],
    };
  }

  if (child && !parent) {
    return {
      ok: false as const,
      errors: [`suggestedParentId ${normalized.data.suggestedParentId} is not a valid parent category id.`],
    };
  }

  return {
    ok: true as const,
    value: {
      judgementHint: normalizeJudgementHintValue(normalized.data.judgementHint || ""),
      suggestedParentId: parent?.id || "",
      suggestedParentName: parent?.name || "",
      suggestedChildId: child?.id || "",
      suggestedChildName: child?.name || "",
      merchantBusiness: sanitizeFreeformText(normalized.data.merchantBusiness || "", 72),
      classificationReason: sanitizeFreeformText(normalized.data.classificationReason || "", 72),
      verificationNote: sanitizeVerificationNote(normalized.data.verificationNote || ""),
      parseMode,
      programmaticallyRecovered:
        parseMode === "salvaged" ||
        (Boolean(child) && normalized.data.suggestedParentId !== child?.parentId) ||
        (!normalized.data.suggestedParentId && Boolean(parent)) ||
        (!normalized.data.suggestedChildId && Boolean(parent)),
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

  const executeRecoveryPass = async () =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You are repairing a category calibration result that previously failed taxonomy validation.",
          "You must return JSON only with keys judgement, suggestedParentId, suggestedChildId, verificationNote.",
          `Judgement must be exactly ${JUDGEMENT_CORRECT} or ${JUDGEMENT_INCORRECT}.`,
          "The suggested child id must exist in the taxonomy, and the suggested parent id must be that child's real parent id.",
          "Choose the child first, then copy its exact parent id from the taxonomy.",
          "Never invent ids and never combine a child with the wrong parent.",
          "verificationNote must be short Chinese text for humans.",
          "Taxonomy:",
          dictionary.promptText,
        ].join("\n\n"),
        user: JSON.stringify(
          {
            merchant: {
              termId: row.termId,
              termName: row.termName,
              domain: row.domain,
              landingPage: row.landingPage,
              country: row.country,
              language: row.language,
              meta: row.meta,
              about: row.about,
            },
            currentCategory: {
              id: row.currentCategoryId,
              name: row.currentCategoryName,
            },
            instruction:
              "Return one valid taxonomy pair only. suggestedParentId must be the true parent of suggestedChildId in the taxonomy above.",
          },
          null,
          2,
        ),
      }),
      validate: (candidate) => parseCandidate(candidate, dictionary),
      buildRepairMessages: async (candidate, errors) => ({
        system:
          "Repair the JSON into one valid taxonomy parent-child pair. suggestedParentId must be the true parent of suggestedChildId. Return JSON only.",
        user: JSON.stringify(
          {
            previousOutput: candidate,
            errors,
            requiredFormat: {
              judgement: `${JUDGEMENT_CORRECT}|${JUDGEMENT_INCORRECT}`,
              suggestedParentId: "real parent id of suggestedChildId",
              suggestedChildId: "valid child id",
              verificationNote: "short Chinese note for humans",
            },
          },
          null,
          2,
        ),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: 3,
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

  const rewriteVerificationNoteAiFirst = async (input: {
    finalJudgement: string;
    suggestedParentName: string;
    suggestedChildName: string;
    merchantBusiness: string;
    classificationReason: string;
  }) =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You rewrite one Excel-friendly verification note for category calibration.",
          "Return JSON only with key verificationNote.",
          "Write one natural Chinese sentence, concise but complete, suitable for Excel.",
          "Do not start with rigid prefixes like '该商家主营'.",
          "Follow these formats exactly by judgement:",
          `${JUDGEMENT_NEW}: 主营XXX，当前无分类，建议新增归入XXX`,
          `${JUDGEMENT_INCORRECT}: 主营XXX，应归入XXX，非XXX`,
          `${JUDGEMENT_MORE_PRECISE}: 主营XXX，XXX比当前分类更精准`,
          `${JUDGEMENT_CORRECT}: 主营XXX，当前归类为XXX，判断正确`,
          "No markdown.",
        ].join("\n\n"),
        user: JSON.stringify(
          {
            domain: row.domain,
            termName: row.termName,
            currentCategory: currentCategoryDisplay,
            judgement: input.finalJudgement,
            suggestedParent: input.suggestedParentName,
            suggestedChild: input.suggestedChildName,
            merchantBusiness: input.merchantBusiness,
            classificationReason: input.classificationReason,
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
              /\u6838\u9a8c\u8bf4\u660e\s*[:=]\s*"?([^"\r\n]+)"?/i,
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
        const note = normalizePrimaryVerificationNote(validated.data.verificationNote);
        if (isGenericNote(note)) {
          return {
            ok: false as const,
            errors: ["verificationNote is too generic."],
          };
        }
        return {
          ok: true as const,
          value: { verificationNote: note },
          errors: [] as string[],
        };
      },
      buildRepairMessages: async (candidate, errors) => ({
        system:
          "Repair the output into exactly one JSON object with key verificationNote. The sentence must include merchant business and why the category fits.",
        user: JSON.stringify({ previousOutput: candidate, errors }, null, 2),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: 1,
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
    try {
      executed = await executeStrictPass(true);
    } catch (strictError) {
      const strictMessage = strictError instanceof Error ? strictError.message : String(strictError);
      if (!shouldRetryCategoryRecoveryError(strictMessage)) throw strictError;
      executed = await executeRecoveryPass();
    }
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
    verificationNote = cleanupAiVerificationNote(noteGenerated.result.verificationNote);
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

function computeFinalJudgementV2(input: {
  row: NormalizedInputRow;
  currentAsParent?: DictionaryParent;
  currentAsChild?: DictionaryChild;
  suggestedParent: DictionaryParent;
  suggestedChild?: DictionaryChild;
}) {
  if (!hasCurrentCategory(input.row)) return JUDGEMENT_NEW;
  if (input.currentAsChild && input.suggestedChild?.id === input.currentAsChild.id) return JUDGEMENT_CORRECT;
  if (input.currentAsParent && input.currentAsParent.id === input.suggestedParent.id) {
    return input.suggestedChild ? JUDGEMENT_MORE_PRECISE : JUDGEMENT_CORRECT;
  }
  if (input.currentAsChild && input.currentAsChild.parentId === input.suggestedParent.id && !input.suggestedChild) {
    return JUDGEMENT_CORRECT;
  }
  return JUDGEMENT_INCORRECT;
}

async function classifyRowV2(row: NormalizedInputRow, dictionary: CategoryDictionary, aiModel: string): Promise<FinalClassification> {
  const currentAsChild = dictionary.childrenById.get(row.currentCategoryId);
  const currentAsParent = dictionary.parentsById.get(row.currentCategoryId);
  const currentCategoryDisplay = displayCurrentCategoryValue(row);
  const baseUserPayload = {
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
  };

  const executePrimaryPass = async (strictMode: boolean) =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You are a category calibration engine.",
          "Choose the best taxonomy classification for the merchant using TermName, Domain, Meta, About, Country, and the current category.",
          "Work in this order internally: identify the merchant's real business -> decide the monetized offering or service -> choose the safest parent -> choose a child only when the evidence clearly supports that child.",
          "Return JSON only.",
          "Required keys: judgementHint, suggestedParentId, suggestedChildId, merchantBusiness, classificationReason, verificationNote.",
          `judgementHint must be one of: ${JUDGEMENT_CORRECT}, ${JUDGEMENT_INCORRECT}, ${JUDGEMENT_MORE_PRECISE}, ${JUDGEMENT_NEW}.`,
          "merchantBusiness must describe the merchant's actual core business in concise Chinese, using concrete products or services rather than vague labels.",
          "classificationReason must explain why the suggested category fits in concise Chinese and must stay consistent with merchantBusiness and verificationNote.",
          "verificationNote must be one natural Chinese sentence for Excel, not bullet points, not fragments, not rigid template prefixes like '\u8be5\u5546\u5bb6\u4e3b\u8425', and it must mention the exact final category name rather than only a broad paraphrase.",
          `verificationNote format rules:
1. ${JUDGEMENT_NEW}: \u4e3b\u8425XXX\uff0c\u5f53\u524d\u65e0\u5206\u7c7b\uff0c\u5efa\u8bae\u65b0\u589e\u5f52\u5165XXX
2. ${JUDGEMENT_INCORRECT}: \u4e3b\u8425XXX\uff0c\u5e94\u5f52\u5165XXX\uff0c\u975eXXX
3. ${JUDGEMENT_MORE_PRECISE}: \u4e3b\u8425XXX\uff0cXXX\u6bd4\u5f53\u524d\u5206\u7c7b\u66f4\u7cbe\u51c6
4. ${JUDGEMENT_CORRECT}: \u4e3b\u8425XXX\uff0c\u5f53\u524d\u5f52\u7c7b\u4e3aXXX\uff0c\u5224\u65ad\u6b63\u786e`,
          "For 无分类新增, verificationNote must explicitly contain '当前无分类' and must not say '判断正确'.",
          "For 有误, verificationNote must explicitly indicate the replacement category and must not say '判断正确'.",
          "For 可更精准, verificationNote must explicitly contain '更精准' and must not say '判断正确'.",
          "For 正确, verificationNote must explicitly contain '判断正确'.",
          "If evidence is weak, prefer a safer broader valid parent or leave suggestedChildId empty instead of guessing a very specific child.",
          "When Meta/About conflict, trust the most concrete business evidence such as explicit product nouns, service names, course names, certification names, or merchandise terms over generic boilerplate.",
          "Classify by what the merchant actually sells or provides, not by article topic, fandom topic, or audience topic.",
          "News, blog, or information platforms should not be mapped to Movies, Tickets & Events, or niche Entertainment children unless they clearly sell those offerings.",
          "Training, certification, classes, and in-person instruction should prefer Training or a broad service category rather than product categories.",
          "Official merch stores should be classified by the merchandise being sold, not by the band's or creator's subject domain.",
          "Nutrition supplements, herbal wellness products, and kratom-like ingestible wellness products should prefer Nutrition & Vitamin unless the text clearly indicates medical devices, clinical supplies, or healthcare equipment.",
          "Adults should only be used when the provided text clearly indicates explicit adult or sexual products; do not infer Adults from generic apparel wording alone.",
          "judgementHint evaluates whether the CURRENT category is acceptable, not only what the ideal category is.",
          "Before outputting JSON, self-check that judgementHint, suggestedParentId/suggestedChildId, classificationReason, and verificationNote all describe the same final classification. If they do not match, fix them before returning.",
          strictMode
            ? "Be strict about valid taxonomy ids and do not omit required keys."
            : "Prefer the most specific valid child; when only parent-level confidence is safe, suggestedChildId may be empty.",
          "Taxonomy:",
          dictionary.promptText,
        ].join("\n\n"),
        user: JSON.stringify(baseUserPayload, null, 2),
      }),
      validate: (candidate) => parseCandidate(candidate, dictionary),
      buildRepairMessages: async (candidate, errors) => ({
        system:
          "Repair the previous answer into exactly one JSON object with keys judgementHint, suggestedParentId, suggestedChildId, merchantBusiness, classificationReason, verificationNote. No markdown, no explanation.",
        user: JSON.stringify(
          {
            previousOutput: candidate,
            errors,
            requiredFormat: {
              judgementHint: `${JUDGEMENT_CORRECT}|${JUDGEMENT_INCORRECT}|${JUDGEMENT_MORE_PRECISE}|${JUDGEMENT_NEW}`,
              suggestedParentId: "valid parent id string or empty string",
              suggestedChildId: "valid child id string or empty string",
              merchantBusiness: "merchant business in Chinese",
              classificationReason: "why the category fits in Chinese",
              verificationNote: "one concise Chinese sentence",
            },
          },
          null,
          2,
        ),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: strictMode ? 2 : 1,
      useConfiguredTemperature: true,
    });

  const executeRecoveryPass = async () =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You are repairing a failed category classification. Re-evaluate the merchant business from the provided text, then map to the safest valid taxonomy result.",
          "Return JSON only with keys judgementHint, suggestedParentId, suggestedChildId, merchantBusiness, classificationReason, verificationNote.",
          "Pick a valid taxonomy result.",
          "If a child id is returned, suggestedParentId must be that child's real parent id.",
          "verificationNote must be one natural Chinese sentence, must follow the required judgement-specific format, and must mention the exact final category name.",
          "For 无分类新增, verificationNote must explicitly contain '当前无分类' and must not say '判断正确'.",
          "For 有误, verificationNote must explicitly indicate the replacement category and must not say '判断正确'.",
          "For 可更精准, verificationNote must explicitly contain '更精准' and must not say '判断正确'.",
          "For 正确, verificationNote must explicitly contain '判断正确'.",
          "If evidence is weak, prefer a safer broader valid parent or leave suggestedChildId empty instead of guessing a very specific child.",
          "Use concrete products or services from the text as the strongest evidence. Do not let vague store boilerplate override explicit business signals.",
          "Do not guess niche Entertainment, Adults, or Medical Supplies unless the text clearly supports it.",
          "Before outputting JSON, self-check that judgementHint, suggestedParentId/suggestedChildId, classificationReason, and verificationNote all describe the same final classification. If they do not match, fix them before returning.",
          "Taxonomy:",
          dictionary.promptText,
        ].join("\n\n"),
        user: JSON.stringify({ merchant: baseUserPayload }, null, 2),
      }),
      validate: (candidate) => parseCandidate(candidate, dictionary),
      buildRepairMessages: async (candidate, errors) => ({
        system:
          "Repair into one valid taxonomy JSON object. suggestedParentId must match suggestedChildId when child is provided. No markdown.",
        user: JSON.stringify({ previousOutput: candidate, errors }, null, 2),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: 2,
      useConfiguredTemperature: true,
    });

  const rewriteVerificationNote = async (input: {
    finalJudgement: string;
    suggestedParentName: string;
    suggestedChildName: string;
    merchantBusiness: string;
    classificationReason: string;
  }) =>
    aiExecutor.execute({
      buildMessages: () => ({
        system: [
          "You rewrite one Excel-friendly verification note for category calibration.",
          "Return JSON only with key verificationNote.",
          "Write one natural Chinese sentence, concise but complete, suitable for Excel, and mention the exact final category name.",
          "Do not start with rigid prefixes like '\u8be5\u5546\u5bb6\u4e3b\u8425'.",
          "Follow these formats exactly by judgement:",
          `${JUDGEMENT_NEW}: \u4e3b\u8425XXX\uff0c\u5f53\u524d\u65e0\u5206\u7c7b\uff0c\u5efa\u8bae\u65b0\u589e\u5f52\u5165XXX`,
          `${JUDGEMENT_INCORRECT}: \u4e3b\u8425XXX\uff0c\u5e94\u5f52\u5165XXX\uff0c\u975eXXX`,
          `${JUDGEMENT_MORE_PRECISE}: \u4e3b\u8425XXX\uff0cXXX\u6bd4\u5f53\u524d\u5206\u7c7b\u66f4\u7cbe\u51c6`,
          `${JUDGEMENT_CORRECT}: \u4e3b\u8425XXX\uff0c\u5f53\u524d\u5f52\u7c7b\u4e3aXXX\uff0c\u5224\u65ad\u6b63\u786e`,
          "If judgement is 无分类新增, the sentence must explicitly contain '当前无分类' and must not say '判断正确'.",
          "If judgement is 有误, the sentence must explicitly indicate the replacement category and must not say '判断正确'.",
          "If judgement is 可更精准, the sentence must explicitly contain '更精准' and must not say '判断正确'.",
          "Before returning, self-check that the sentence wording matches the provided judgement exactly.",
          "No markdown.",
        ].join("\n\n"),
        user: JSON.stringify(
          {
            domain: row.domain,
            termName: row.termName,
            currentCategory: currentCategoryDisplay,
            judgement: input.finalJudgement,
            suggestedParent: input.suggestedParentName,
            suggestedChild: input.suggestedChildName,
            merchantBusiness: input.merchantBusiness,
            classificationReason: input.classificationReason,
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
              /\u6838\u9a8c\u8bf4\u660e\s*[:=]\s*"?([^"\r\n]+)"?/i,
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
        const note = normalizePrimaryVerificationNote(validated.data.verificationNote);
        if (isGenericNote(note)) {
          return {
            ok: false as const,
            errors: ["verificationNote is too generic."],
          };
        }
        return {
          ok: true as const,
          value: { verificationNote: note },
          errors: [] as string[],
        };
      },
      buildRepairMessages: async (candidate, errors) => ({
        system:
          "Repair the output into exactly one JSON object with key verificationNote. The sentence must include merchant business, why the category fits, and the exact final category name.",
        user: JSON.stringify({ previousOutput: candidate, errors }, null, 2),
      }),
      requestTimeoutMs: env.aiRequestTimeoutMsBatch,
      aiModel,
      maxRetries: 1,
      useConfiguredTemperature: true,
    });

  let executed;
  let usedRecoveryRequest = false;
  try {
    executed = await executePrimaryPass(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetryStrict =
      message.includes("AI ") ||
      message.includes("Required") ||
      message.includes("Invalid JSON output") ||
      message.includes("valid category id");
    if (!shouldRetryStrict) throw error;
    try {
      executed = await executePrimaryPass(true);
    } catch (strictError) {
      const strictMessage = strictError instanceof Error ? strictError.message : String(strictError);
      if (!shouldRetryCategoryRecoveryError(strictMessage)) throw strictError;
      executed = await executeRecoveryPass();
      usedRecoveryRequest = true;
    }
  }

  let parsed = executed.result;
  let usage = executed.usage;
  let suggestedChild = parsed.suggestedChildId ? dictionary.childrenById.get(parsed.suggestedChildId) : undefined;
  let suggestedParent = parsed.suggestedParentId
    ? dictionary.parentsById.get(parsed.suggestedParentId)
    : suggestedChild
      ? dictionary.parentsById.get(suggestedChild.parentId)
      : undefined;

  if (!suggestedParent) {
    throw new Error("AI output could not be mapped to a valid parent category.");
  }

  let finalSuggestedChild = suggestedChild || (currentAsChild && currentAsChild.parentId === suggestedParent.id ? currentAsChild : undefined);
  let finalJudgement = computeFinalJudgementV2({
    row,
    currentAsParent,
    currentAsChild,
    suggestedParent,
    suggestedChild: finalSuggestedChild,
  });
  let merchantBusiness = normalizeBusinessPhrase(row, parsed.merchantBusiness || inferMerchantBusinessSnippet(row));
  let classificationReason = normalizeReasonPhrase(
    parsed.classificationReason ||
      (finalJudgement === JUDGEMENT_CORRECT
        ? `${finalSuggestedChild?.name || suggestedParent.name} \u5f52\u7c7b\u51c6\u786e`
        : finalJudgement === JUDGEMENT_MORE_PRECISE
          ? `${finalSuggestedChild?.name || suggestedParent.name} \u6bd4 ${currentCategoryDisplay} \u66f4\u7cbe\u51c6`
          : finalJudgement === JUDGEMENT_NEW
            ? `\u5e94\u65b0\u589e\u5f52\u5165 ${finalSuggestedChild?.name || suggestedParent.name}`
            : `\u5e94\u5c5e ${finalSuggestedChild?.name || suggestedParent.name}\uff0c\u975e ${currentCategoryDisplay}`),
    sanitizeFreeformText(finalSuggestedChild?.name || suggestedParent.name, 36),
    sanitizeFreeformText(currentCategoryDisplay, 36),
  );
  if (looksTooAsciiHeavy(merchantBusiness)) {
    merchantBusiness = extractChineseBusinessFromReason(classificationReason) || merchantBusiness;
  }
  let verificationNote = normalizePrimaryVerificationNote(parsed.verificationNote || "");
  let noteRewritten = false;

  const modelDrivenNote = buildProgrammaticVerificationNote({
    row,
    judgement: finalJudgement,
    currentCategoryDisplay,
    suggestedParentName: suggestedParent.name,
    suggestedChildName: finalSuggestedChild?.name || "",
    merchantBusiness,
    classificationReason,
  });

  if (
    noteNeedsRewriteLite({
      judgement: finalJudgement,
      currentCategoryDisplay,
      suggestedParentName: suggestedParent.name,
      suggestedChildName: finalSuggestedChild?.name || "",
      verificationNote,
    })
  ) {
    const noteGenerated = await rewriteVerificationNote({
      finalJudgement,
      suggestedParentName: suggestedParent.name,
      suggestedChildName: finalSuggestedChild?.name || "",
      merchantBusiness,
      classificationReason,
    });
    verificationNote = normalizePrimaryVerificationNote(noteGenerated.result.verificationNote);
    usage = addUsage(usage, noteGenerated.usage);
    noteRewritten = true;
  }

  if (
    noteNeedsRewriteLite({
      judgement: finalJudgement,
      currentCategoryDisplay,
      suggestedParentName: suggestedParent.name,
      suggestedChildName: finalSuggestedChild?.name || "",
      verificationNote,
    })
  ) {
    verificationNote = cleanupAiVerificationNote(modelDrivenNote);
  }

  return {
    judgement: finalJudgement,
    suggestedParentId: suggestedParent.id,
    suggestedParentName: suggestedParent.name,
    suggestedChildId: finalSuggestedChild?.id || "",
    suggestedChildName: finalSuggestedChild?.name || "",
    verificationNote,
    usage,
    stats: {
      usedRecoveryRequest,
      programmaticallyRecovered: parsed.programmaticallyRecovered || !parsed.suggestedChildId || parsed.parseMode === "salvaged",
      noteRewritten,
    },
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
    primarySuccessRows: number;
    recoveredRows: number;
    noteRewrittenRows: number;
    programmaticallyRecoveredRows: number;
    finalFailedRows: number;
    aiCallRows: number;
    dedupedRows: number;
    progressFlushCount: number;
    rowConcurrency: number;
    judgementCounts: Record<string, number>;
    failureBuckets: Record<string, number>;
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
  let primarySuccessRows = 0;
  let recoveredRows = 0;
  let noteRewrittenRows = 0;
  let programmaticallyRecoveredRows = 0;
  let aiCallRows = 0;
  let dedupedRows = 0;
  const totalSubBatches = Math.max(1, Math.ceil(input.totalRows / CATEGORY_CALIBRATION_SUB_BATCH_SIZE));
  const judgementCounts: Record<string, number> = {
    [JUDGEMENT_CORRECT]: 0,
    [JUDGEMENT_INCORRECT]: 0,
    [JUDGEMENT_MORE_PRECISE]: 0,
    [JUDGEMENT_NEW]: 0,
  };
  const failureBuckets: Record<string, number> = {
    parse: 0,
    taxonomy: 0,
    note: 0,
    request: 0,
    unknown: 0,
  };
  const dedupeCache = new Map<
    string,
    | { ok: true; classified: Awaited<ReturnType<typeof classifyRowV2>> }
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
            const classified = await classifyRowV2(row, dictionary, input.aiModel);
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
              aiCallRows += 1;
              promptTokens += item.classified.usage.promptTokens;
              completionTokens += item.classified.usage.completionTokens;
            } else {
              dedupedRows += 1;
            }
            successRows += 1;
            if (item.classified.stats.usedRecoveryRequest) recoveredRows += 1;
            else primarySuccessRows += 1;
            if (item.classified.stats.noteRewritten) noteRewrittenRows += 1;
            if (item.classified.stats.programmaticallyRecovered) programmaticallyRecoveredRows += 1;
            judgementCounts[item.classified.judgement] = (judgementCounts[item.classified.judgement] || 0) + 1;
            const outputRow: RowOutput = {
              domain: item.row.domain,
              [RESULT_CURRENT_CATEGORY]: displayCurrentCategoryValue(item.row),
              [RESULT_JUDGEMENT]: item.classified.judgement,
              [RESULT_PARENT]: displayCategoryValue(item.classified.suggestedParentId, item.classified.suggestedParentName),
              [RESULT_CHILD]: displayCategoryValue(item.classified.suggestedChildId, item.classified.suggestedChildName),
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
            if (!item.deduped) aiCallRows += 1;
            else dedupedRows += 1;
            failedRows += 1;
            const failedJudgementText = hasCurrentCategory(item.row) ? JUDGEMENT_INCORRECT : JUDGEMENT_NEW;
            judgementCounts[failedJudgementText] = (judgementCounts[failedJudgementText] || 0) + 1;
            const lowerError = String(item.error || "").toLowerCase();
            if (lowerError.includes("verificationnote") || lowerError.includes("note")) failureBuckets.note += 1;
            else if (lowerError.includes("parent") || lowerError.includes("child") || lowerError.includes("taxonomy")) failureBuckets.taxonomy += 1;
            else if (lowerError.includes("json") || lowerError.includes("parse") || lowerError.includes("required")) failureBuckets.parse += 1;
            else if (lowerError.includes("llm") || lowerError.includes("timeout") || lowerError.includes("request")) failureBuckets.request += 1;
            else failureBuckets.unknown += 1;
            const failedNote = buildProgrammaticVerificationNote({
              row: item.row,
              judgement: failedJudgementText,
              currentCategoryDisplay: displayCurrentCategoryValue(item.row),
              error: item.error,
            });
            const outputRow: RowOutput = {
              domain: item.row.domain,
              [RESULT_CURRENT_CATEGORY]: displayCurrentCategoryValue(item.row),
              [RESULT_JUDGEMENT]: failedJudgementText,
              [RESULT_PARENT]: "",
              [RESULT_CHILD]: "",
              [RESULT_NOTE]: failedNote,
            };
            await writeCsvRow(csvStream, outputRow);
            rowResults.push({
              rowIndex: item.row.rowIndex,
              domain: item.row.domain,
              judgement: failedJudgementText,
              suggestedParentId: "",
              suggestedChildId: "",
              note: failedNote,
              error: item.error,
            });
          }

          processedRows += 1;
          if (input.onProgress) {
            const now = Date.now();
            if (
              processedRows <= 10 ||
              processedRows === input.totalRows ||
              now - lastProgressReportedAt >= CATEGORY_CALIBRATION_PROGRESS_INTERVAL_MS
            ) {
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
                primarySuccessRows,
                recoveredRows,
                noteRewrittenRows,
                programmaticallyRecoveredRows,
                finalFailedRows: failedRows,
                aiCallRows,
                dedupedRows,
                progressFlushCount: 0,
                rowConcurrency: CATEGORY_CALIBRATION_ROW_CONCURRENCY,
                judgementCounts: { ...judgementCounts },
                failureBuckets: { ...failureBuckets },
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
          primarySuccessRows,
          recoveredRows,
          noteRewrittenRows,
          programmaticallyRecoveredRows,
          finalFailedRows: failedRows,
          aiCallRows,
          dedupedRows,
          progressFlushCount: 0,
          rowConcurrency: CATEGORY_CALIBRATION_ROW_CONCURRENCY,
          judgementCounts: { ...judgementCounts },
          failureBuckets: { ...failureBuckets },
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
      primarySuccessRows,
      recoveredRows,
      noteRewrittenRows,
      programmaticallyRecoveredRows,
      finalFailedRows: failedRows,
      aiCallRows,
      dedupedRows,
      progressFlushCount: 0,
      rowConcurrency: CATEGORY_CALIBRATION_ROW_CONCURRENCY,
      judgementCounts,
      failureBuckets,
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
