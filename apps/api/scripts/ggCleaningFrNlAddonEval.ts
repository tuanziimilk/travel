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

type NormalizedCollectedRow = {
  country: string;
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
  subclass: string;
  termId: string;
  termName: string;
  domain: string;
  sourceKeys: string[];
  snippetPreview: string;
  sourceFiles: string[];
  rows: RawCollectedRow[];
};

type BaselineEntry = {
  sampleId: string;
  groupKey: string;
  country: string;
  subclass: string;
  termId: string;
  termName: string;
  domain: string;
  sourceKeys: string[];
  baselineLabel: "" | "yes" | "no" | "unknown";
  baselineReason: string;
  reviewer: string;
  reviewedAt: string;
};

type CompareRow = {
  sampleId: string;
  country: string;
  subclass: string;
  termName: string;
  baselineLabel: string;
  ruleLabel: string;
  isMatch: boolean;
  baselineReason: string;
  ruleReason: string;
  finalValue: string;
  finalUrl: string;
  evidenceSentence: string;
  sourceKeys: string[];
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const BENCHMARK_NAME = process.env.GG_ADDON_BENCHMARK_NAME || "fr-nl-addon-v1";
const OUTPUT_ROOT = path.join(REPO_ROOT, `tmp/gg-cleaning-eval/${BENCHMARK_NAME}`);
const SAMPLE_PATH = path.join(OUTPUT_ROOT, "01-sample-fixed.json");
const BASELINE_PATH = path.join(OUTPUT_ROOT, "04-baseline-review.json");
const RULE_RUN_PATH = path.join(OUTPUT_ROOT, "05-rule-run.json");
const COMPARE_PATH = path.join(OUTPUT_ROOT, "06-compare.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "07-summary.json");
const README_PATH = path.join(OUTPUT_ROOT, "README.md");

const SOURCE_FILES = [
  { country: "NL", filePath: "D:/下载/gg-cleaning-demo-NL.csv" },
  { country: "FR", filePath: "D:/下载/gg-cleaning-demo-FR.xlsx" },
] as const;

const TARGET_SUBCLASSES = ["shipping", "student", "newsletter"] as const;
const SAMPLE_COUNT_PER_BUCKET = Number(process.env.GG_ADDON_SAMPLE_COUNT || "4");
const SAMPLE_OFFSET_PER_BUCKET = Number(process.env.GG_ADDON_SAMPLE_OFFSET || "0");

function canonicalFactType(rawSubclass: string) {
  const normalized = normalizeCollectedText(rawSubclass).toLowerCase();
  if (normalized === "newsletter" || normalized.includes("first order") || normalized.includes("sign up")) {
    return "newsletter/first order/sign up/";
  }
  return normalized;
}

function cleanSnippetText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
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

async function loadSourceRows(sourceFile: (typeof SOURCE_FILES)[number]) {
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
  if (!TARGET_SUBCLASSES.includes(rawSubclass as (typeof TARGET_SUBCLASSES)[number])) return null;
  return {
    country,
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
  for (const country of ["NL", "FR"]) {
    for (const subclass of ["shipping", "student", "newsletter/first order/sign up/"]) {
      const bucket = allGroups
        .filter((group) => group.country === country && group.subclass === subclass)
        .sort(
          (left, right) =>
            right.sourceCount - left.sourceCount ||
            left.termName.localeCompare(right.termName) ||
            left.termId.localeCompare(right.termId),
        )
        .slice(SAMPLE_OFFSET_PER_BUCKET, SAMPLE_OFFSET_PER_BUCKET + SAMPLE_COUNT_PER_BUCKET);

      bucket.forEach((group, index) => {
        picked.push({
          sampleId: `${country}-${subclass.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "")}-${String(index + 1).padStart(2, "0")}`,
          groupKey: group.groupKey,
          country: group.country,
          subclass: group.subclass,
          termId: group.termId,
          termName: group.termName,
          domain: group.domain,
          sourceKeys: group.sourceKeys,
          snippetPreview: group.snippetPreview,
          sourceFiles: group.sourceFiles,
          rows: group.rows.map((row) => row.rawRow),
        });
      });
    }
  }

  return picked;
}

function buildBaselineTemplate(samples: SampleGroup[]): BaselineEntry[] {
  return samples.map((sample) => ({
    sampleId: sample.sampleId,
    groupKey: sample.groupKey,
    country: sample.country,
    subclass: sample.subclass,
    termId: sample.termId,
    termName: sample.termName,
    domain: sample.domain,
    sourceKeys: sample.sourceKeys,
    baselineLabel: "",
    baselineReason: "",
    reviewer: "codex",
    reviewedAt: "",
  }));
}

function countBy<T extends string>(rows: CompareRow[], pick: (row: CompareRow) => T) {
  const counts = new Map<T, { total: number; matched: number; mismatched: number }>();
  for (const row of rows) {
    const key = pick(row);
    const current = counts.get(key) || { total: 0, matched: 0, mismatched: 0 };
    current.total += 1;
    if (row.isMatch) current.matched += 1;
    else current.mismatched += 1;
    counts.set(key, current);
  }
  return Object.fromEntries(
    [...counts.entries()].map(([key, value]) => [
      key,
      {
        ...value,
        accuracy: value.total ? Number(((value.matched / value.total) * 100).toFixed(2)) : 0,
      },
    ]),
  );
}

async function ensureDir() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
}

async function ensureSampleArtifacts() {
  await ensureDir();
  const existingSample = await readJsonFile<SampleGroup[]>(SAMPLE_PATH).catch(() => null);
  if (existingSample) return existingSample;

  const normalizedRows: NormalizedCollectedRow[] = [];
  for (const sourceFile of SOURCE_FILES) {
    const rawRows = await loadSourceRows(sourceFile);
    for (const row of rawRows) {
      const normalized = normalizeRow(row, sourceFile.filePath);
      if (normalized) normalizedRows.push(normalized);
    }
  }

  const samples = sampleGroups(normalizedRows);
  await writeJsonFile(SAMPLE_PATH, samples);
  const baselineTemplate = buildBaselineTemplate(samples);
  await writeJsonFile(BASELINE_PATH, baselineTemplate);
  await writeFile(
    README_PATH,
    [
      "# FR/NL Addon Eval",
      "",
      "- Fixed sample size: 24 groups",
      "- Markets: FR, NL",
      "- Subclasses: shipping, student, newsletter/first order/sign up/",
      "- Baseline standard: snippet-only manual/LLM judgment",
      "- Rule run source: current gg-cleaning engine",
      "",
      "Files:",
      "- `01-sample-fixed.json`: sampled group set with raw rows",
      "- `04-baseline-review.json`: baseline labels and reasons",
      "- `05-rule-run.json`: current rule output",
      "- `06-compare.json`: baseline vs rule compare",
      "- `07-summary.json`: accuracy summary",
    ].join("\n"),
    "utf8",
  );
  return samples;
}

async function readJsonFile<T>(filePath: string) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runEval() {
  const samples = await ensureSampleArtifacts();
  const baseline = await readJsonFile<BaselineEntry[]>(BASELINE_PATH);
  const unresolved = baseline.filter((row) => !row.baselineLabel);
  if (unresolved.length) {
    throw new Error(`Baseline is incomplete: ${unresolved.length} entries still have empty baselineLabel.`);
  }

  const sampleRows = samples.flatMap((sample) => sample.rows);
  const payload = Buffer.from(JSON.stringify(sampleRows), "utf8").toString("base64");
  const result = executeGgCleaningForEval({ fileName: "fr-nl-addon-sample.json", fileBase64: payload }, { skipFileSizeLimit: true });

  await writeJsonFile(RULE_RUN_PATH, result.debugRows);
  const debugRowsByGroupKey = new Map(result.debugRows.map((row) => [row.group_key, row]));

  const compare: CompareRow[] = baseline.map((row) => {
    const debugRow = debugRowsByGroupKey.get(row.groupKey);
    const ruleLabel = debugRow?.final_supported || "missing";
    return {
      sampleId: row.sampleId,
      country: row.country,
      subclass: row.subclass,
      termName: row.termName,
      baselineLabel: row.baselineLabel,
      ruleLabel,
      isMatch: ruleLabel === row.baselineLabel,
      baselineReason: row.baselineReason,
      ruleReason: debugRow?.final_reason_cn || "",
      finalValue: debugRow?.final_value || "",
      finalUrl: debugRow?.final_url || "",
      evidenceSentence: debugRow?.final_evidence_sentence || "",
      sourceKeys: row.sourceKeys,
    };
  });

  const matched = compare.filter((row) => row.isMatch).length;
  const summary = {
    benchmark: {
      sampleCount: compare.length,
      matched,
      mismatched: compare.length - matched,
      accuracy: compare.length ? Number(((matched / compare.length) * 100).toFixed(2)) : 0,
    },
    byCountry: countBy(compare, (row) => row.country),
    bySubclass: countBy(compare, (row) => row.subclass),
    topMismatches: compare.filter((row) => !row.isMatch).slice(0, 20),
  };

  await writeJsonFile(COMPARE_PATH, compare);
  await writeJsonFile(SUMMARY_PATH, summary);
  console.log(`FR/NL addon eval completed. Accuracy: ${summary.benchmark.accuracy}% (${matched}/${compare.length})`);
  console.log(`Artifacts written to ${OUTPUT_ROOT}`);
}

async function main() {
  const command = process.argv[2] || "run";
  if (command === "init") {
    const samples = await ensureSampleArtifacts();
    console.log(`Initialized FR/NL addon sample: ${samples.length} groups`);
    console.log(SAMPLE_PATH);
    console.log(BASELINE_PATH);
    return;
  }
  if (command === "run") {
    await runEval();
    return;
  }
  throw new Error(`Unsupported command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
