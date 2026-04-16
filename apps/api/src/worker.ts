import { env } from "./env";
import { startGenerationHousekeeping, warmGenerationHistoryCaches } from "./generation/faqOutputJobStore";
import { startGenerationWorker } from "./generation/faqOutputGenerator";
import { startGgCleaningWorker } from "./gg-cleaning/worker";
import { startCategoryCalibrationWorker } from "./category-calibration/worker";
import { startTranslationWorker } from "./translation/translationWorker";
import { startIngestRecoveryScheduler } from "./jobs/ingestWorker";

if (!env.runWorkers) {
  console.warn("Worker process started with RUN_WORKERS=false; background queues will stay idle.");
} else {
  console.log("Worker process starting background queues.");
  warmGenerationHistoryCaches();
  startGenerationHousekeeping();
  startGenerationWorker();
  startGgCleaningWorker();
  startCategoryCalibrationWorker();
  startTranslationWorker();
  startIngestRecoveryScheduler();
}

setInterval(() => {
  const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  console.log(`[worker] heartbeat heap_used_mb=${heapUsedMb}`);
}, 60_000);
