import "dotenv/config";
import { Buffer } from "node:buffer";
import { startFaqOutputGeneration } from "../src/generation/faqOutputGenerator";
import { getGenerationJobResult, getGenerationJobStatus, listGenerationHistoryRows, listGenerationJobs } from "../src/generation/faqOutputJobStore";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSmokeRows() {
  return Array.from({ length: 10 }, (_, index) => ({
    term_id: `FAQ-GEMINI-${String(index + 1).padStart(3, "0")}`,
    country: "US",
    domain: "example.com",
    term_name: `Gemini Shipping FAQ Sample ${index + 1}`,
    fact_type: "shipping",
    supported: "yes",
    status: "active",
    discount_type: "",
    discount_value: "",
    currency: "USD",
    discount_details: `Orders typically ship within ${index + 2} business days for sample item ${index + 1}.`,
    url: `https://www.example.com/shipping/sample-${index + 1}`,
  }));
}

function toCsvBase64(rows: Array<Record<string, string>>) {
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] || "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  return Buffer.from(csv, "utf8").toString("base64");
}

async function main() {
  const fileBase64 = toCsvBase64(buildSmokeRows());
  const started = await startFaqOutputGeneration({
    scType: "faq",
    uploader: "Ella",
    note: "Gemini smoke test 10 rows",
    fileName: "gemini-faq-smoke.csv",
    fileBase64,
  });

  console.log(JSON.stringify({ phase: "started", jobId: started.jobId }, null, 2));

  let status = await getGenerationJobStatus(started.jobId);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (!["done", "failed", "cancelled"].includes(String(status.status || ""))) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for job ${started.jobId}. Last status: ${status.status}`);
    }
    await sleep(1500);
    status = await getGenerationJobStatus(started.jobId);
    console.log(
      JSON.stringify(
        {
          phase: "poll",
          jobId: started.jobId,
          status: status.status,
          successRows: status.successRows,
          failedRows: status.failedRows,
          skippedRows: status.skippedRows,
        },
        null,
        2,
      ),
    );
  }

  const result = await getGenerationJobResult(started.jobId);
  const queue = await listGenerationJobs(1, 10, "faq");
  const history = await listGenerationHistoryRows({
    scType: "faq",
    country: "US",
    subclass: "shipping",
    uploader: "Ella",
    keyword: "Gemini Shipping FAQ Sample",
    startDate: "",
    endDate: "",
    page: 1,
    pageSize: 20,
  });

  console.log(
    JSON.stringify(
      {
        phase: "completed",
        finalStatus: {
          jobId: started.jobId,
          status: status.status,
          successRows: status.successRows,
          failedRows: status.failedRows,
          skippedRows: status.skippedRows,
          estimatedCostUsdSum: status.estimatedCostUsdSum,
          aiModel: status.aiModel,
        },
        artifact: {
          fileName: result.fileName,
          xlsxBase64Length: result.xlsxBase64?.length || 0,
          routeSummaryCount: result.routeSummary?.length || 0,
          rowResultsCount: result.rowResults?.length || 0,
        },
        queueTop: queue.rows.slice(0, 3),
        historyRows: history.rows.slice(0, 10),
        historyTotal: history.total,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
