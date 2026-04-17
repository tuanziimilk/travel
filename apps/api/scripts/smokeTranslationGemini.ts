import "dotenv/config";
import { Buffer } from "node:buffer";
import { startBatchTranslation, translateTextNow } from "../src/translation/translationWorker";
import { getTranslationJobResult, getTranslationJobStatus } from "../src/translation/translationJobStore";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const textResult = await translateTextNow({
    text: "Free shipping is available on orders over fifty dollars.",
    targetLanguage: "Simplified Chinese",
  });

  const csv = [
    "id,content",
    '1,"Free shipping is available on orders over fifty dollars."',
    '2,"Students can verify their status to unlock ten percent off."',
    '3,"Gift cards are delivered by email after payment is confirmed."',
  ].join("\n");

  const started = await startBatchTranslation({
    uploader: "Ella",
    note: "Gemini translation smoke test",
    fileName: "gemini-translation-smoke.csv",
    fileBase64: Buffer.from(csv, "utf8").toString("base64"),
    targetLanguage: "Simplified Chinese",
    selectedColumns: ["content"],
    detectLanguage: true,
  });

  console.log(
    JSON.stringify(
      {
        phase: "started",
        textRuntime: textResult.runtime,
        textTranslated: textResult.translatedText,
        jobId: started.jobId,
        executionMode: started.executionMode,
      },
      null,
      2,
    ),
  );

  let status = await getTranslationJobStatus(started.jobId);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (!["done", "failed", "partial_failed", "cancelled"].includes(String(status.status || ""))) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for translation job ${started.jobId}. Last status: ${status.status}`);
    }
    await sleep(1500);
    status = await getTranslationJobStatus(started.jobId);
    console.log(
      JSON.stringify(
        {
          phase: "poll",
          jobId: started.jobId,
          status: status.status,
          successRows: status.successRows,
          failedRows: status.failedRows,
          mixedRows: status.mixedRows,
        },
        null,
        2,
      ),
    );
  }

  const result = await getTranslationJobResult(started.jobId);
  console.log(
    JSON.stringify(
      {
        phase: "completed",
        finalStatus: {
          jobId: started.jobId,
          status: status.status,
          executionMode: started.executionMode,
          successRows: status.successRows,
          failedRows: status.failedRows,
          mixedRows: status.mixedRows,
          aiModel: status.aiModel,
          estimatedCostUsdSum: status.estimatedCostUsdSum,
        },
        artifact: {
          fileName: result.fileName,
          xlsxBase64Length: result.xlsxBase64?.length || 0,
          rowResultsCount: result.rowResults?.length || 0,
        },
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
