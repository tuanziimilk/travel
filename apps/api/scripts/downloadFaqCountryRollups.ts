import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type QueueRow = {
  id: string;
  status: string;
  note: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  resultFilePath?: string;
  resultFileName?: string;
  errorReason?: string;
  createdAt?: string;
  finishedAt?: string | null;
};

type QueueResponse = {
  total: number;
  hasMore?: boolean;
  rows: QueueRow[];
};

type HistorySummaryResponse = {
  byCountry: Array<{
    country: string;
    rowCount: number;
    uniqueResultCount: number;
    merchantCount: number;
    subclassCount: number;
  }>;
};

type AuditResult = {
  jobId: string;
  status: string;
  createdAt: string;
  note: string;
  totalRows: number;
  mainStatus: number;
  mainDurationMs: number;
  mainBytes: number;
  mainOk: boolean;
  fieldExtractStatus: number;
  fieldExtractDurationMs: number;
  fieldExtractBytes: number;
  fieldExtractOk: boolean;
  classification: "download_ok" | "slow_but_ok" | "repairable" | "not_repairable";
  reason: string;
};

const outputDir =
  process.argv.find((arg) => arg.startsWith("--outputDir="))?.slice("--outputDir=".length) ||
  "D:\\工作文件\\临时任务\\商家库\\结果汇总表v";
const apiBase = process.argv.find((arg) => arg.startsWith("--apiBase="))?.slice("--apiBase=".length) || "http://137.184.100.8:3001";
const auditSlowMs = 15_000;

function isLikelyXlsx(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function fetchBuffer(url: string) {
  const startedAt = Date.now();
  const response = await fetch(url);
  const durationMs = Date.now() - startedAt;
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const bodyText = !response.ok || /json|text/i.test(contentType) ? buffer.toString("utf8") : "";
  return {
    status: response.status,
    durationMs,
    buffer,
    ok: response.ok && isLikelyXlsx(buffer),
    bodyText,
  };
}

async function listAllFaqJobs() {
  const pageSize = 50;
  let page = 1;
  const rows: QueueRow[] = [];

  while (true) {
    const input = encodeURIComponent(JSON.stringify({ json: { scType: "faq", page, pageSize } }));
    const payload = await fetchJson<{ result: { data: QueueResponse } }>(`${apiBase}/trpc/generation.queue?input=${input}`);
    const data = payload.result.data;
    rows.push(...data.rows.filter((item) => item.status === "done" || item.status === "failed"));
    if (!data.hasMore) break;
    page += 1;
  }

  return rows;
}

async function getCountries() {
  const input = encodeURIComponent(JSON.stringify({ json: { scType: "faq" } }));
  const payload = await fetchJson<{ result: { data: HistorySummaryResponse } }>(`${apiBase}/trpc/generation.historySummary?input=${input}`);
  return payload.result.data.byCountry.filter((item) => item.country);
}

async function auditDownloads(rows: QueueRow[]) {
  const results: AuditResult[] = [];
  for (const row of rows) {
    const main = await fetchBuffer(`${apiBase}/generation/jobs/${encodeURIComponent(row.id)}/download?variant=main`);
    const fieldExtract = await fetchBuffer(`${apiBase}/generation/jobs/${encodeURIComponent(row.id)}/download?variant=field_extract`);
    const tooLarge = /文件过大|too large|12MB/i.test(row.errorReason || "");
    const anyOk = main.ok || fieldExtract.ok;
    const isSlow = (main.ok && main.durationMs >= auditSlowMs) || (fieldExtract.ok && fieldExtract.durationMs >= auditSlowMs);
    const classification: AuditResult["classification"] = anyOk
      ? isSlow
        ? "slow_but_ok"
        : "download_ok"
      : tooLarge
        ? "not_repairable"
        : "repairable";

    results.push({
      jobId: row.id,
      status: row.status,
      createdAt: row.createdAt || "",
      note: row.note || "",
      totalRows: Number(row.totalRows || 0),
      mainStatus: main.status,
      mainDurationMs: main.durationMs,
      mainBytes: main.buffer.length,
      mainOk: main.ok,
      fieldExtractStatus: fieldExtract.status,
      fieldExtractDurationMs: fieldExtract.durationMs,
      fieldExtractBytes: fieldExtract.buffer.length,
      fieldExtractOk: fieldExtract.ok,
      classification,
      reason:
        classification === "not_repairable"
          ? row.errorReason || "task has no recoverable downloadable result"
          : !anyOk
            ? main.bodyText || fieldExtract.bodyText || row.errorReason || "download failed"
            : isSlow
              ? "download works but is slow"
              : "download works",
    });
  }
  return results;
}

async function exportCountries(countries: Array<{ country: string; rowCount: number; merchantCount: number; subclassCount: number; uniqueResultCount: number }>) {
  const files: Array<Record<string, unknown>> = [];
  for (const countryInfo of countries) {
    const url = `${apiBase}/generation/exports/country-rollup?country=${encodeURIComponent(countryInfo.country)}`;
    const result = await fetchBuffer(url);
    if (!result.ok) {
      files.push({
        country: countryInfo.country,
        ok: false,
        status: result.status,
        error: result.bodyText || "download failed",
      });
      continue;
    }
    const filePath = path.join(outputDir, `faq-result-${countryInfo.country}.xlsx`);
    await writeFile(filePath, result.buffer);
    files.push({
      country: countryInfo.country,
      ok: true,
      filePath,
      bytes: result.buffer.length,
      rowCount: countryInfo.rowCount,
      merchantCount: countryInfo.merchantCount,
      subclassCount: countryInfo.subclassCount,
      uniqueResultCount: countryInfo.uniqueResultCount,
    });
  }
  return files;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const jobs = await listAllFaqJobs();
  const audit = await auditDownloads(jobs);
  const countries = await getCountries();
  const exports = await exportCountries(countries);

  const manifest = {
    startedAt,
    finishedAt: new Date().toISOString(),
    apiBase,
    outputDir,
    jobCount: jobs.length,
    countries: countries.map((item) => item.country),
    auditSummary: {
      downloadOk: audit.filter((item) => item.classification === "download_ok").length,
      slowButOk: audit.filter((item) => item.classification === "slow_but_ok").length,
      repairable: audit.filter((item) => item.classification === "repairable").length,
      notRepairable: audit.filter((item) => item.classification === "not_repairable").length,
    },
    audit,
    exports,
  };

  const timestamp = startedAt.replace(/[:.]/g, "-");
  const manifestPath = path.join(outputDir, `faq-export-manifest-${timestamp}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`manifest: ${manifestPath}`);
  console.log(JSON.stringify(manifest.auditSummary));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
