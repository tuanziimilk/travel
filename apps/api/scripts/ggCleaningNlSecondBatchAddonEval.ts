import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeGgCleaningForEval } from "../src/gg-cleaning/engine";

type RawCollectedRow = Record<string, unknown>;

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
const BENCHMARK_NAME = process.env.GG_ADDON_BENCHMARK_NAME || "nl-second-batch-addon-v1";
const OUTPUT_ROOT = path.join(REPO_ROOT, `tmp/gg-cleaning-eval/${BENCHMARK_NAME}`);
const SAMPLE_PATH = path.join(OUTPUT_ROOT, "01-sample-fixed.json");
const BASELINE_PATH = path.join(OUTPUT_ROOT, "04-baseline-review.json");
const RULE_RUN_PATH = path.join(OUTPUT_ROOT, "05-rule-run.json");
const COMPARE_PATH = path.join(OUTPUT_ROOT, "06-compare.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "07-summary.json");

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

async function readJsonFile<T>(filePath: string) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runEval() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const samples = await readJsonFile<SampleGroup[]>(SAMPLE_PATH);
  const baseline = await readJsonFile<BaselineEntry[]>(BASELINE_PATH);
  const unresolved = baseline.filter((row) => !row.baselineLabel);
  if (unresolved.length) {
    throw new Error(`Baseline is incomplete: ${unresolved.length} entries still have empty baselineLabel.`);
  }

  const sampleRows = samples.flatMap((sample) => sample.rows);
  const payload = Buffer.from(JSON.stringify(sampleRows), "utf8").toString("base64");
  const result = executeGgCleaningForEval({ fileName: "nl-second-batch-addon-sample.json", fileBase64: payload }, { skipFileSizeLimit: true });

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
  const mismatches = compare.filter((row) => !row.isMatch);
  const summary = {
    benchmark: {
      sampleCount: compare.length,
      matched,
      mismatched: compare.length - matched,
      accuracy: compare.length ? Number(((matched / compare.length) * 100).toFixed(2)) : 0,
    },
    byCountry: countBy(compare, (row) => row.country),
    bySubclass: countBy(compare, (row) => row.subclass),
    transitions: countBy(compare, (row) => `${row.baselineLabel}->${row.ruleLabel}`),
    topMismatches: mismatches.slice(0, 20),
  };

  await writeJsonFile(COMPARE_PATH, compare);
  await writeJsonFile(SUMMARY_PATH, summary);
  console.log(`NL second-batch addon eval completed. Accuracy: ${summary.benchmark.accuracy}% (${matched}/${compare.length})`);
  console.log(`Artifacts written to ${OUTPUT_ROOT}`);
}

runEval().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
