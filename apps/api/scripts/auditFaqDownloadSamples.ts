import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CliOptions = {
  baseUrl: string;
  sampleSize: number;
  repairReportPath: string;
  outputPath: string;
};

type RepairReport = {
  safeDoneJobIds?: string[];
};

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.FAQ_AUDIT_BASE_URL || "http://localhost:4000",
    sampleSize: 5,
    repairReportPath: "apps/api/.runtime/faq-history-cleanup-report.json",
    outputPath: "apps/api/.runtime/faq-download-sample-audit.json",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--base-url") {
      options.baseUrl = argv[index + 1] || options.baseUrl;
      index += 1;
      continue;
    }
    if (token === "--sample-size") {
      options.sampleSize = Math.max(1, Number(argv[index + 1] || options.sampleSize));
      index += 1;
      continue;
    }
    if (token === "--repair-report") {
      options.repairReportPath = argv[index + 1] || options.repairReportPath;
      index += 1;
      continue;
    }
    if (token === "--output") {
      options.outputPath = argv[index + 1] || options.outputPath;
      index += 1;
    }
  }

  return options;
}

function sampleStable(items: string[], sampleSize: number) {
  if (items.length <= sampleSize) return items;
  const step = Math.max(1, Math.floor(items.length / sampleSize));
  const picked: string[] = [];
  for (let index = 0; index < items.length && picked.length < sampleSize; index += step) {
    picked.push(items[index]);
  }
  return picked;
}

async function readSafeDoneJobIds(filePath: string) {
  const raw = await readFile(path.resolve(process.cwd(), filePath), "utf8");
  const parsed = JSON.parse(raw) as RepairReport;
  return Array.isArray(parsed.safeDoneJobIds) ? parsed.safeDoneJobIds.filter(Boolean) : [];
}

async function auditOne(baseUrl: string, jobId: string, variant: "main" | "field_extract") {
  const url = `${baseUrl.replace(/\/$/, "")}/generation/jobs/${encodeURIComponent(jobId)}/download?variant=${variant}`;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZipMagic = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const contentType = response.headers.get("content-type") || "";
  return {
    jobId,
    variant,
    url,
    status: response.status,
    ok: response.ok && arrayBuffer.byteLength > 0 && isZipMagic && contentType.includes(xlsxMime),
    contentType,
    sizeBytes: arrayBuffer.byteLength,
    isZipMagic,
    failureReason: response.ok
      ? arrayBuffer.byteLength <= 0
        ? "empty file"
        : !isZipMagic
          ? "file header is not XLSX ZIP magic"
          : !contentType.includes(xlsxMime)
            ? `unexpected content-type: ${contentType}`
            : ""
      : `HTTP ${response.status}`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const safeDoneJobIds = await readSafeDoneJobIds(options.repairReportPath);
  const sampledJobIds = sampleStable(safeDoneJobIds, options.sampleSize);
  const results = [];

  for (const jobId of sampledJobIds) {
    for (const variant of ["main", "field_extract"] as const) {
      try {
        results.push(await auditOne(options.baseUrl, jobId, variant));
      } catch (error) {
        results.push({
          jobId,
          variant,
          ok: false,
          failureReason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    sampledJobIds,
    summary: {
      safeDoneJobIds: safeDoneJobIds.length,
      sampledJobs: sampledJobIds.length,
      checks: results.length,
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
    },
    results,
  };

  const outputPath = path.resolve(process.cwd(), options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
