import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import XLSX from "xlsx";
import {
  GG_COLLECTED_SOURCE_COLUMN,
  normalizeCollectedSourceType,
  normalizeCollectedText,
  parseCollectedProductUrlsCell,
  parseCollectedSnippetCell,
} from "../src/gg-cleaning/collectedSchema";
import { executeGgCleaningForEval } from "../src/gg-cleaning/engine";

type RawCollectedRow = Record<string, unknown>;

type SourceFile = {
  country: string;
  filePath: string;
};

type NormalizedCollectedRow = {
  country: string;
  language: string;
  domain: string;
  term_id: string;
  term_name: string;
  subclass: string;
  factType: string;
  sourceType: string;
  snippet: string;
  product_urls: string[];
  rawRow: RawCollectedRow;
  sourceFile: string;
};

type SampleGroup = {
  sampleId: string;
  groupKey: string;
  country: string;
  language: string;
  subclass: string;
  termId: string;
  termName: string;
  domain: string;
  sourceKeys: string[];
  sourceFiles: string[];
  snippetPreview: string;
  rows: RawCollectedRow[];
};

type EvalFinding = {
  sampleId: string;
  country: string;
  language: string;
  subclass: string;
  termId: string;
  termName: string;
  domain: string;
  finalSupported: string;
  finalRule: string;
  finalReason: string;
  snippetPreview: string;
  sourceKeys: string[];
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOWNLOAD_ROOT = process.env.GG_EVAL_DOWNLOAD_ROOT || "D:/下载";
const BENCHMARK_NAME = process.env.GG_MULTI_BENCHMARK_NAME || "multilingual-addon-v1";
const OUTPUT_ROOT = path.join(REPO_ROOT, `tmp/gg-cleaning-eval/${BENCHMARK_NAME}`);
const SAMPLE_PATH = path.join(OUTPUT_ROOT, "01-sample-fixed.json");
const RULE_RUN_PATH = path.join(OUTPUT_ROOT, "05-rule-run.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "07-summary.json");
const README_PATH = path.join(OUTPUT_ROOT, "README.md");

const TARGET_COUNTRIES = (process.env.GG_MULTI_COUNTRIES || "FR,NL,DE,ES,PL")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

const TARGET_SUBCLASSES = (process.env.GG_MULTI_SUBCLASSES || "student,military")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const SAMPLE_COUNT_PER_BUCKET = Number(process.env.GG_MULTI_SAMPLE_COUNT || "24");

const DEFAULT_SOURCE_FILES: SourceFile[] = [
  { country: "FR", filePath: path.join(DOWNLOAD_ROOT, "gg-cleaning-demo-FR.xlsx") },
  { country: "NL", filePath: path.join(DOWNLOAD_ROOT, "gg-cleaning-demo-NL.csv") },
  { country: "NL", filePath: path.join(DOWNLOAD_ROOT, "gg-cleaning-demo-nl第二批.csv") },
  { country: "DE", filePath: path.join(DOWNLOAD_ROOT, "mid_queue_push_result_12.xlsx") },
];

function canonicalFactType(rawSubclass: string) {
  const normalized = normalizeCollectedText(rawSubclass).toLowerCase();
  if (normalized === "newsletter" || normalized.includes("first order") || normalized.includes("sign up")) {
    return "newsletter/first order/sign up/";
  }
  return normalized;
}

function cleanSnippetText(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

function parseCsvRows(text: string) {
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  }) as RawCollectedRow[];
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSourceFiles() {
  const configured = process.env.GG_MULTI_SOURCE_FILES
    ? process.env.GG_MULTI_SOURCE_FILES.split(";").map((entry) => {
        const [country, rawPath] = entry.split("=");
        return { country: normalizeCollectedText(country).toUpperCase(), filePath: normalizeCollectedText(rawPath) };
      })
    : [];
  const merged = [...configured, ...DEFAULT_SOURCE_FILES].filter((item) => TARGET_COUNTRIES.includes(item.country));
  const resolved: SourceFile[] = [];
  for (const source of merged) {
    if (await fileExists(source.filePath)) resolved.push(source);
  }
  return resolved;
}

async function loadSourceRows(sourceFile: SourceFile) {
  if (sourceFile.filePath.toLowerCase().endsWith(".csv")) {
    const text = await readFile(sourceFile.filePath, "utf8");
    return parseCsvRows(text);
  }
  const workbook = XLSX.readFile(sourceFile.filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as RawCollectedRow[];
}

function normalizeRow(row: RawCollectedRow, sourceFile: string): NormalizedCollectedRow | null {
  const country = normalizeCollectedText(row.country).toUpperCase();
  const language = normalizeCollectedText(row.language).toLowerCase();
  const domain = normalizeCollectedText(row.domain).toLowerCase();
  const term_id = normalizeCollectedText(row.term_id);
  const term_name = normalizeCollectedText(row.term_name);
  const rawSubclass = normalizeCollectedText(row.subclass).toLowerCase();
  const factType = canonicalFactType(rawSubclass);
  const sourceType = normalizeCollectedSourceType(row[GG_COLLECTED_SOURCE_COLUMN]);
  const snippet = parseCollectedSnippetCell(row.content, cleanSnippetText);
  const product_urls = parseCollectedProductUrlsCell(row.product_urls);
  if (!country || !domain || !term_id || !term_name || !snippet || !sourceType) return null;
  if (sourceType !== "aimode" && sourceType !== "searchlab") return null;
  if (!TARGET_SUBCLASSES.includes(rawSubclass) && !TARGET_SUBCLASSES.includes(factType)) return null;
  if (!TARGET_COUNTRIES.includes(country)) return null;
  return {
    country,
    language,
    domain,
    term_id,
    term_name,
    subclass: rawSubclass,
    factType,
    sourceType,
    snippet,
    product_urls,
    rawRow: row,
    sourceFile,
  };
}

function makeGroupKey(row: Pick<NormalizedCollectedRow, "term_id" | "country" | "factType">) {
  return `${row.term_id}__${row.country}__${row.factType}`;
}

function buildSnippetPreview(rows: NormalizedCollectedRow[]) {
  return rows
    .slice(0, 2)
    .map((row) => `[${row.sourceType}] ${row.snippet}`)
    .join("\n\n");
}

function sampleGroups(rows: NormalizedCollectedRow[]) {
  const grouped = new Map<string, NormalizedCollectedRow[]>();
  for (const row of rows) {
    const key = makeGroupKey(row);
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const allGroups = [...grouped.entries()].map(([groupKey, bucket]) => {
    const sortedRows = [...bucket].sort((left, right) => left.sourceType.localeCompare(right.sourceType));
    const first = sortedRows[0];
    return {
      groupKey,
      country: first.country,
      language: first.language,
      subclass: first.factType,
      termId: first.term_id,
      termName: first.term_name,
      domain: first.domain,
      sourceKeys: sortedRows.map((row) => row.sourceType),
      sourceFiles: [...new Set(sortedRows.map((row) => path.basename(row.sourceFile)))],
      rows: sortedRows,
      sourceCount: sortedRows.length,
      snippetPreview: buildSnippetPreview(sortedRows),
    };
  });

  const picked: SampleGroup[] = [];
  for (const country of TARGET_COUNTRIES) {
    for (const subclass of TARGET_SUBCLASSES.map((item) => canonicalFactType(item))) {
      const bucket = allGroups
        .filter((group) => group.country === country && group.subclass === subclass)
        .sort(
          (left, right) =>
            right.sourceCount - left.sourceCount ||
            left.termName.localeCompare(right.termName) ||
            left.termId.localeCompare(right.termId),
        )
        .slice(0, SAMPLE_COUNT_PER_BUCKET);

      bucket.forEach((group, index) => {
        picked.push({
          sampleId: `${country}-${subclass.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "")}-${String(index + 1).padStart(2, "0")}`,
          groupKey: group.groupKey,
          country: group.country,
          language: group.language,
          subclass: group.subclass,
          termId: group.termId,
          termName: group.termName,
          domain: group.domain,
          sourceKeys: group.sourceKeys,
          sourceFiles: group.sourceFiles,
          snippetPreview: group.snippetPreview,
          rows: group.rows.map((row) => row.rawRow),
        });
      });
    }
  }
  return picked;
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy<T extends string>(rows: EvalFinding[], pick: (row: EvalFinding) => T) {
  const counter = new Map<T, number>();
  for (const row of rows) {
    const key = pick(row);
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counter.entries()].sort((a, b) => b[1] - a[1]));
}

function collectKeywordSuggestions(findings: EvalFinding[]) {
  const phrases = [
    "reduced-rate",
    "reduced rates",
    "waived fee",
    "waived fees",
    "special pricing",
    "complimentary",
    "promotion",
    "promotions",
    "active duty",
    "service members",
    "military personnel",
    "veterans",
    "under 26",
    "college graduate",
    "graduates",
    "schools",
    "school special",
    "young people",
    "free admission",
    "discounted registration",
  ];
  const hits = new Map<string, number>();
  for (const finding of findings) {
    const lower = finding.snippetPreview.toLowerCase();
    for (const phrase of phrases) {
      if (lower.includes(phrase)) hits.set(phrase, (hits.get(phrase) || 0) + 1);
    }
  }
  return Object.fromEntries([...hits.entries()].sort((a, b) => b[1] - a[1]));
}

async function run() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const sourceFiles = await resolveSourceFiles();
  const discoveredCountries = [...new Set(sourceFiles.map((item) => item.country))];
  const missingCountries = TARGET_COUNTRIES.filter((country) => !discoveredCountries.includes(country));

  const normalizedRows: NormalizedCollectedRow[] = [];
  for (const sourceFile of sourceFiles) {
    const rows = await loadSourceRows(sourceFile);
    for (const row of rows) {
      const normalized = normalizeRow(row, sourceFile.filePath);
      if (normalized) normalizedRows.push(normalized);
    }
  }

  const samples = sampleGroups(normalizedRows);
  await writeJsonFile(SAMPLE_PATH, samples);

  const payload = Buffer.from(JSON.stringify(samples.flatMap((sample) => sample.rows)), "utf8").toString("base64");
  const result = executeGgCleaningForEval({ fileName: "gg-multilingual-sample.json", fileBase64: payload }, { skipFileSizeLimit: true });
  await writeJsonFile(RULE_RUN_PATH, result.debugRows);

  const debugRowsByGroupKey = new Map(result.debugRows.map((row) => [row.group_key, row]));
  const findings: EvalFinding[] = [];
  const yesUnknown: EvalFinding[] = [];
  const noUnknown: EvalFinding[] = [];

  for (const sample of samples) {
    const debug = debugRowsByGroupKey.get(sample.groupKey);
    if (!debug) continue;
    const finding: EvalFinding = {
      sampleId: sample.sampleId,
      country: sample.country,
      language: sample.language,
      subclass: sample.subclass,
      termId: sample.termId,
      termName: sample.termName,
      domain: sample.domain,
      finalSupported: debug.final_supported,
      finalRule: debug.final_matched_rule,
      finalReason: debug.final_reason_cn,
      snippetPreview: sample.snippetPreview,
      sourceKeys: sample.sourceKeys,
    };
    findings.push(finding);
    const trimmed = sample.snippetPreview.trim();
    if (/^\[(?:aimode|searchlab)\]\s*(yes|oui|ja|tak|sí|si)\b/i.test(trimmed) && debug.final_supported === "unknown") {
      yesUnknown.push(finding);
    }
    if (/^\[(?:aimode|searchlab)\]\s*(no|non|nein|nie)\b/i.test(trimmed) && debug.final_supported === "unknown") {
      noUnknown.push(finding);
    }
  }

  const summary = {
    benchmark: {
      targetCountries: TARGET_COUNTRIES,
      discoveredCountries,
      missingCountries,
      sampleCount: samples.length,
      ruleRows: result.debugRows.length,
      yesUnknownCount: yesUnknown.length,
      noUnknownCount: noUnknown.length,
    },
    byCountry: countBy(findings, (row) => `${row.country}:${row.finalSupported}`),
    bySubclass: countBy(findings, (row) => `${row.subclass}:${row.finalSupported}`),
    yesUnknownByCountry: countBy(yesUnknown, (row) => row.country),
    noUnknownByCountry: countBy(noUnknown, (row) => row.country),
    yesUnknownBySubclass: countBy(yesUnknown, (row) => row.subclass),
    noUnknownBySubclass: countBy(noUnknown, (row) => row.subclass),
    highRiskKeywordSuggestions: collectKeywordSuggestions(yesUnknown),
    yesUnknownSamples: yesUnknown.slice(0, 50),
    noUnknownSamples: noUnknown.slice(0, 50),
    sourceFiles,
  };
  await writeJsonFile(SUMMARY_PATH, summary);

  const readmeLines = [
    "# GG Multilingual Eval",
    "",
    `- Target countries: ${TARGET_COUNTRIES.join(", ")}`,
    `- Discovered countries: ${discoveredCountries.join(", ") || "(none)"}`,
    `- Missing countries: ${missingCountries.join(", ") || "(none)"}`,
    `- Sample groups: ${samples.length}`,
    `- yes->unknown: ${yesUnknown.length}`,
    `- no->unknown: ${noUnknown.length}`,
    "",
    "## Source Files",
    ...sourceFiles.map((item) => `- ${item.country}: ${item.filePath}`),
    "",
    `Summary JSON: ${SUMMARY_PATH}`,
  ];
  await writeFile(README_PATH, `${readmeLines.join("\n")}\n`, "utf8");

  console.log(`GG multilingual eval completed. Samples=${samples.length}, yes->unknown=${yesUnknown.length}, no->unknown=${noUnknown.length}`);
  console.log(`Artifacts written to ${OUTPUT_ROOT}`);
  if (missingCountries.length) {
    console.log(`Missing source files for: ${missingCountries.join(", ")}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
