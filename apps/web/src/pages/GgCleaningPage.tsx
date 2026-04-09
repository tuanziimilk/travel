import * as Select from "@radix-ui/react-select";
import * as XLSX from "xlsx";
import { useMemo, useState } from "react";
import { ggCleaningUploadMaxFileBytes, ggCleaningUploadMaxRows, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";

type CollectedRow = Record<string, unknown>;

type GroupedChunk = {
  rows: CollectedRow[];
  groupCount: number;
  estimatedBytes: number;
};

const GG_SOURCE_COLUMN = "采集数据源";
const REQUIRED_COLUMNS = ["country", "domain", "term_id", "term_name", "subclass", GG_SOURCE_COLUMN, "content", "product_urls"];
const uploadLimitMb = Math.round(ggCleaningUploadMaxFileBytes / 1024 / 1024);
const ggCleaningTargetChunkBytes = 4 * 1024 * 1024;
const ggCleaningBrowserHighMemoryLimitBytes = 12 * 1024 * 1024;
const ggCleaningUploadApiBase = (() => {
  const trpcUrl = import.meta.env.VITE_TRPC_URL || "/trpc";
  return trpcUrl.replace(/\/trpc\/?$/, "");
})();

const ggCleaningDemoCsv = [
  `task_id,query,country,language,domain,term_id,term_name,subclass,bu,状态,${GG_SOURCE_COLUMN},google_url,content,product_urls,updated_time`,
  '12,"Does bigbustours.com offer app discount?",US,en,bigbustours.com,1001,Big Bus Tours,app,hd,抓取完成,ai_mode,https://www.google.com/search?q=bigbustours+app+discount,"[""Big Bus Tours offers an app-exclusive 15% discount for first bookings in the official mobile app.""]","[""https://www.bigbustours.com/en/app""]",2026-04-08 05:38:52',
  '12,"Does bigbustours.com offer app discount?",US,en,bigbustours.com,1001,Big Bus Tours,app,hd,抓取完成,search_lab,https://www.google.com/search?q=bigbustours+app+discount,"[""Download the official app to unlock exclusive offers.""]","[""https://www.bigbustours.com/en/app"",""https://www.example.com/app-coupon""]",2026-04-08 05:38:49',
  '13,"Does shopa.com offer free shipping?",US,en,shopa.com,1002,Shop A,shipping,hd,抓取完成,ai_mode,https://www.google.com/search?q=shopa+free+shipping,"[""Shop A offers free shipping on orders over $50 in the US.""]","[""https://shopa.com/help/shipping-policy""]",2026-04-08 05:38:52',
  '13,"Does shopa.com offer free shipping?",US,en,shopa.com,1002,Shop A,shipping,hd,抓取完成,search_lab,https://www.google.com/search?q=shopa+free+shipping,"[""Shipping policy: free delivery for orders over $50.""]","[""https://shopa.com/shipping"",""https://coupon.example/shipping""]",2026-04-08 05:38:49',
].join("\n");

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeSourceType(value: unknown) {
  const collapsed = normalizeText(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (collapsed === "aimode" || collapsed === "ai") return "aimode";
  if (collapsed === "searchlab" || collapsed === "search") return "searchlab";
  return collapsed;
}

function parseStringArrayCell(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  const raw = normalizeText(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeText(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function hasValidSnippet(row: CollectedRow) {
  return parseStringArrayCell(row.content).length > 0;
}

function isSupportedCollectedRow(row: CollectedRow) {
  const termId = normalizeText(row.term_id);
  const country = normalizeText(row.country);
  const subclass = normalizeText(row.subclass);
  const sourceType = normalizeSourceType(row[GG_SOURCE_COLUMN]);
  return Boolean(termId && country && subclass && hasValidSnippet(row) && (sourceType === "aimode" || sourceType === "searchlab"));
}

function groupKeyOf(row: CollectedRow) {
  return [normalizeText(row.term_id), normalizeText(row.country).toUpperCase(), normalizeText(row.subclass)].join("__");
}

function estimateJsonBytes(value: unknown) {
  return new Blob([JSON.stringify(value)]).size;
}

function ensureRequiredColumns(rows: CollectedRow[]) {
  const columns = new Set(rows.flatMap((row) => Object.keys(row)).map((key) => String(key || "").trim()).filter(Boolean));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`上传文件缺少必填列: ${missing.join(", ")}`);
  }
}

function packGroupedChunks(rows: CollectedRow[]) {
  const grouped = new Map<string, CollectedRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const chunks: GroupedChunk[] = [];
  let oversizedGroupCount = 0;
  let currentRows: CollectedRow[] = [];
  let currentGroupCount = 0;
  let currentBytes = 0;

  const flushCurrent = () => {
    if (!currentRows.length) return;
    chunks.push({
      rows: currentRows,
      groupCount: currentGroupCount,
      estimatedBytes: currentBytes,
    });
    currentRows = [];
    currentGroupCount = 0;
    currentBytes = 0;
  };

  for (const groupRows of grouped.values()) {
    const groupBytes = estimateJsonBytes(groupRows);
    if (groupBytes > ggCleaningTargetChunkBytes) {
      flushCurrent();
      chunks.push({
        rows: groupRows,
        groupCount: 1,
        estimatedBytes: groupBytes,
      });
      oversizedGroupCount += 1;
      continue;
    }

    if (currentRows.length > 0 && currentBytes + groupBytes > ggCleaningTargetChunkBytes) {
      flushCurrent();
    }

    currentRows = currentRows.concat(groupRows);
    currentGroupCount += 1;
    currentBytes += groupBytes;
  }

  flushCurrent();

  return {
    chunks,
    groupCount: grouped.size,
    oversizedGroupCount,
  };
}

async function parseCsvFile(file: File) {
  const rows: CollectedRow[] = [];
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let headers: string[] | null = null;
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let quotePending = false;
  let isFirstField = true;

  const commitField = () => {
    const value = isFirstField ? field.replace(/^\uFEFF/, "") : field;
    record.push(value.trim());
    field = "";
    isFirstField = false;
  };

  const commitRecord = () => {
    commitField();
    if (!headers) {
      headers = record.map((item) => item.trim());
    } else if (record.some((item) => item.trim() !== "")) {
      const row: CollectedRow = {};
      headers.forEach((header, index) => {
        row[header] = record[index] ?? "";
      });
      rows.push(row);
    }
    record = [];
    field = "";
    isFirstField = true;
  };

  const pushChar = (char: string) => {
    if (quotePending) {
      if (char === '"') {
        field += '"';
        quotePending = false;
        return;
      }
      quotePending = false;
      inQuotes = false;
      pushChar(char);
      return;
    }

    if (inQuotes) {
      if (char === '"') {
        quotePending = true;
      } else {
        field += char;
      }
      return;
    }

    if (char === '"') {
      inQuotes = true;
      return;
    }
    if (char === ",") {
      commitField();
      return;
    }
    if (char === "\n") {
      commitRecord();
      return;
    }
    if (char !== "\r") {
      field += char;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const char of value) pushChar(char);
  }

  if (quotePending) {
    inQuotes = false;
    quotePending = false;
  }
  if (field !== "" || record.length > 0) {
    commitRecord();
  }

  return rows;
}

async function parseJsonlFile(file: File) {
  const rows: CollectedRow[] = [];
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const flushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSONL 每一行都必须是对象。");
    }
    rows.push(parsed as CollectedRow);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || "";
    for (const line of parts) flushLine(line);
  }
  flushLine(buffer);
  return rows;
}

async function parseJsonFile(file: File) {
  const parsed = JSON.parse(await file.text());
  if (!Array.isArray(parsed)) throw new Error("JSON 文件必须是对象数组。");
  return parsed as CollectedRow[];
}

async function parseXlsxFile(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<CollectedRow>(firstSheet, { defval: "" });
}

async function parseCollectedRows(file: File) {
  const lowerName = file.name.toLowerCase();
  let rows: CollectedRow[];
  let highMemoryNotice = "";

  if ((lowerName.endsWith(".json") || lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) && file.size > ggCleaningBrowserHighMemoryLimitBytes) {
    throw new Error("JSON / XLSX / XLSM 文件会在浏览器内整文件解析。超过 12MB 时请先转成 CSV 或 JSONL 后再上传。");
  }

  if (lowerName.endsWith(".csv")) {
    rows = await parseCsvFile(file);
  } else if (lowerName.endsWith(".jsonl")) {
    rows = await parseJsonlFile(file);
  } else if (lowerName.endsWith(".json")) {
    rows = await parseJsonFile(file);
    highMemoryNotice = "JSON 会走浏览器高内存解析路径。";
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    rows = await parseXlsxFile(file);
    highMemoryNotice = "XLSX/XLSM 会走浏览器高内存解析路径。";
  } else {
    throw new Error("仅支持 .csv、.xlsx、.xlsm、.json、.jsonl 文件。");
  }

  if (!rows.length) throw new Error("上传文件为空。");
  ensureRequiredColumns(rows);

  const validRows = rows.filter((row) => isSupportedCollectedRow(row));
  if (!validRows.length) {
    throw new Error("文件中没有可用于 GG 清洗的有效输入行，请检查 content、采集数据源、term_id、country、subclass。");
  }
  if (validRows.length > ggCleaningUploadMaxRows) {
    throw new Error(`GG 清洗单次最多支持 ${ggCleaningUploadMaxRows} 行有效输入。`);
  }

  return {
    rows: validRows,
    highMemoryNotice,
  };
}

async function uploadGroupedFile(file: File, onProgress?: (progressPercent: number, text: string) => void) {
  onProgress?.(5, "正在解析采集结果表并按分组聚合...");
  const parsed = await parseCollectedRows(file);
  const packing = packGroupedChunks(parsed.rows);

  if (!packing.chunks.length) {
    throw new Error("没有可上传的分组 chunk。");
  }

  const initResponse = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
  if (!initResponse.ok) throw new Error("初始化大文件上传失败。");
  const initPayload = (await initResponse.json()) as { uploadId?: string; error?: string };
  if (!initPayload.uploadId) throw new Error(initPayload.error || "初始化大文件上传失败。");

  for (let chunkIndex = 0; chunkIndex < packing.chunks.length; chunkIndex += 1) {
    const chunk = packing.chunks[chunkIndex];
    const chunkResponse = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/${initPayload.uploadId}/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chunkIndex,
        rows: chunk.rows,
        groupCount: chunk.groupCount,
      }),
    });
    if (!chunkResponse.ok) {
      const payload = (await chunkResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `上传分组 chunk ${chunkIndex + 1} 失败。`);
    }
    const progress = 10 + Math.round(((chunkIndex + 1) / packing.chunks.length) * 80);
    onProgress?.(progress, `正在上传分组 chunk ${chunkIndex + 1}/${packing.chunks.length}...`);
  }

  const completeResponse = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/${initPayload.uploadId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunkCount: packing.chunks.length,
      groupCount: packing.groupCount,
      oversizedGroupCount: packing.oversizedGroupCount,
    }),
  });
  if (!completeResponse.ok) {
    const payload = (await completeResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "完成大文件上传失败。");
  }

  onProgress?.(100, "上传完成，正在生成预览...");
  return {
    uploadId: initPayload.uploadId,
    totalRows: parsed.rows.length,
    chunkCount: packing.chunks.length,
    groupCount: packing.groupCount,
    oversizedGroupCount: packing.oversizedGroupCount,
    highMemoryNotice: parsed.highMemoryNotice,
  };
}

function downloadBase64File(fileName: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(fileName: string, content: string, mimeType = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) return "-";
  const start = new Date(startedAt);
  const end = finishedAt ? new Date(finishedAt) : new Date();
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "-";
  const totalSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatJobId(value: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatProgress(processedRows: number, totalRows: number) {
  if (!totalRows) return 0;
  return Math.max(0, Math.min(100, Math.round((processedRows / totalRows) * 100)));
}

function formatSummaryHeadline(processedRows: number, groupedRows: number, successRows: number, failedRows: number) {
  return `${processedRows}/${groupedRows} | 成功 ${successRows} | 失败 ${failedRows}`;
}

function formatSummaryMeta(summary: Record<string, unknown> | undefined, inputMode: string, totalRows: number, groupedRows: number) {
  const chunkCount = Number(summary?.chunkCount || 0);
  if (chunkCount > 0) return `模式 ${inputMode} | 输入 ${totalRows} 行 | 分组 ${groupedRows} | Chunk ${chunkCount}`;
  return `模式 ${inputMode} | 输入 ${totalRows} 行 | 分组 ${groupedRows}`;
}

const queueStatusText: Record<string, string> = {
  queued: "排队中",
  running: "处理中",
  done: "已完成",
  failed: "失败",
};

export function GgCleaningPage() {
  const queuePageSize = 8;
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [currentJobId, setCurrentJobId] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();

  const previewMutation = trpc.ggCleaning.preview.useMutation();
  const runMutation = trpc.ggCleaning.run.useMutation({
    onSuccess: async () => {
      await queueQuery.refetch();
    },
  });

  const queueQuery = trpc.ggCleaning.queue.useQuery({ page: queuePage, pageSize: queuePageSize }, { refetchInterval: 4000 });

  const statusQuery = trpc.ggCleaning.status.useQuery(
    { jobId: currentJobId },
    {
      enabled: Boolean(currentJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 1500;
        return status === "done" || status === "failed" ? false : 1500;
      },
    },
  );

  const previewData = previewMutation.data;
  const currentStatus = statusQuery.data;
  const queueRows = useMemo(() => {
    const rows = queueQuery.data?.rows ?? [];
    if (!currentStatus || !currentJobId) return rows;
    return rows.map((item) => (item.id === currentJobId ? { ...item, ...currentStatus } : item));
  }, [queueQuery.data?.rows, currentJobId, currentStatus]);

  const queueTotalPages = useMemo(() => {
    const total = queueQuery.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / queuePageSize));
  }, [queueQuery.data?.total]);

  async function handleFileChange(nextFile: File | null) {
    setError("");
    setNotice("");
    setUploadedFileId("");
    setSelectedFile(nextFile);
    if (!nextFile) return;
    if (nextFile.size > ggCleaningUploadMaxFileBytes) {
      setError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      setUploadedFileId("");
      setSelectedFile(null);
      return;
    }
    try {
      setIsUploadingFile(true);
      const upload = await uploadGroupedFile(nextFile, (_progress, text) => {
        setNotice(text);
      });
      setUploadedFileId(upload.uploadId);
      const preview = await previewMutation.mutateAsync({ fileName: nextFile.name, uploadId: upload.uploadId });
      const extras: string[] = [`已按完整分组切成 ${upload.chunkCount} 个 chunk`];
      if (upload.oversizedGroupCount > 0) extras.push(`${upload.oversizedGroupCount} 个超大分组独占 chunk`);
      if (upload.highMemoryNotice) extras.push(upload.highMemoryNotice);
      extras.push(`预览有效输入 ${preview.totalRows} 行 / ${preview.groupedRows} 组`);
      setNotice(`文件上传完成，${extras.join("；")}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件解析失败");
      setUploadedFileId("");
      setSelectedFile(null);
    } finally {
      setIsUploadingFile(false);
    }
  }

  async function runJob() {
    if (!selectedFile || !uploadedFileId) {
      setError("请先上传文件。");
      return;
    }
    setError("");
    setNotice("");
    try {
      const result = await runMutation.mutateAsync({
        uploader,
        note,
        fileName: selectedFile.name,
        uploadId: uploadedFileId,
      });
      setCurrentJobId(result.jobId);
      setQueuePage(1);
      setNotice(`任务已创建，任务 ID: ${result.jobId}，识别模式 ${result.inputMode}，分组数 ${result.groupedRows}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建 GG 清洗任务失败");
    }
  }

  async function downloadJobResult(jobId: string) {
    setError("");
    const data = await utils.client.ggCleaning.result.query({ jobId });
    if (!data.xlsxBase64) {
      setError(data.errorReason || "当前任务暂无可下载结果，请稍后刷新列表后重试。");
      return;
    }
    downloadBase64File(data.fileName, data.xlsxBase64);
  }

  function downloadDemoTemplate() {
    downloadTextFile("gg-cleaning-demo.csv", ggCleaningDemoCsv);
  }

  return (
    <div className="grid translation-page">
      <section className="section-header">
        <h2>GG 采集数据清洗工具</h2>
        <p>上传采集结果表后会先按 `term_id + country + subclass` 分组，再按完整分组切 chunk，最终输出仍然只有 `merchant_output` 和 `debug_output`。</p>
      </section>

      <div className="card translation-main-card">
        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">1</span>
            <div>
              <h3>上传文件</h3>
              <p className="muted">支持 `.csv`、`.xlsx`、`.xlsm`、`.json`、`.jsonl`。</p>
              <p>必填列：term_id / country / domain / term_name / subclass / 采集数据源 / content / product_urls</p>
            </div>
          </div>

          <div className="field">
            <div className="translation-action-bar">
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm,.json,.jsonl"
                disabled={isUploadingFile || previewMutation.isPending || runMutation.isPending}
                onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
              />
              <div className="upload-actions">
                <button className="btn-ghost output-template-btn" type="button" onClick={downloadDemoTemplate}>
                  下载 Demo
                </button>
              </div>
            </div>
            <div className="upload-limit-banner" role="note">
              <span className="upload-limit-banner-kicker">上传上限</span>
              <p>支持最高 {uploadLimitMb}MB / 约 {ggCleaningUploadMaxRows} 行有效输入；chunk 会按完整分组切分，不再按原始字节切片。</p>
              <p>`.json` / `.xlsx` / `.xlsm` 会先在浏览器解析；超过 12MB 时请优先转成 `.csv` 或 `.jsonl`，避免浏览器内存占用过高。</p>
            </div>
          </div>

          {selectedFile && previewData ? (
            <div className="translation-current-file-card">
              <div className="output-status-chip">
                <span>当前文件</span>
                <strong>{selectedFile.name}</strong>
              </div>
              <div className="output-status-chip">
                <span>识别模式</span>
                <strong>{previewData.inputMode}</strong>
              </div>
              <div className="output-status-chip">
                <span>有效输入</span>
                <strong>{previewData.totalRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>分组数</span>
                <strong>{previewData.groupedRows}</strong>
              </div>
              {"chunkCount" in previewData && previewData.chunkCount ? (
                <div className="output-status-chip">
                  <span>Chunk 数</span>
                  <strong>{previewData.chunkCount}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">2</span>
            <div>
              <h3>上传人 / 备注</h3>
              <p className="muted">创建任务后会进入单任务串行队列。</p>
            </div>
          </div>

          <div className="translation-advanced-grid">
            <div className="field">
              <label>上传人</label>
              <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
                <Select.Trigger className="select-trigger" aria-label="gg-cleaning-uploader">
                  <Select.Value />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      {uploaderOptions.map((item) => (
                        <Select.Item className="select-item" key={item} value={item}>
                          <Select.ItemText>{item}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="field">
              <label>任务备注</label>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：GG 采集清洗 4 月规则回归" />
            </div>
          </div>

          <button
            className="btn-primary translation-run-btn"
            type="button"
            disabled={!selectedFile || !uploadedFileId || isUploadingFile || previewMutation.isPending || runMutation.isPending}
            onClick={() => void runJob()}
          >
            {runMutation.isPending ? "正在创建任务..." : "创建 GG 清洗任务"}
          </button>
        </div>

        {error ? <div className="translation-feedback error">{error}</div> : null}
        {notice ? <div className="translation-feedback success">{notice}</div> : null}
      </div>

      <div className="card">
        <div className="output-summary-head">
          <div className="translation-step-head">
            <span className="translation-step-index">3</span>
            <div>
              <h3>最近任务</h3>
              <p className="muted">支持查看最近两周的 GG 清洗任务，并实时查看进度与下载结果。</p>
            </div>
          </div>
          <button className="btn-ghost output-inline-btn" type="button" onClick={() => void queueQuery.refetch()}>
            刷新列表
          </button>
        </div>

        <div className="table-scroll faq-output-table-scroll translation-queue-scroll">
          <table className="history-table queue-table gg-cleaning-queue-table">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>上传人</th>
                <th>任务 ID</th>
                <th>状态</th>
                <th>处理摘要</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>下载</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((row) => {
                const progressPercent = formatProgress(row.processedRows, row.groupedRows);
                const canDownload = Boolean(row.canDownload || row.resultFilePath);
                return (
                  <tr key={row.id}>
                    <td title={row.note || ""}>{row.uploader || "-"}</td>
                    <td title={row.inputFileName}>{formatJobId(row.id)}</td>
                    <td>{queueStatusText[row.status] ?? row.status}</td>
                    <td title={row.errorReason || row.inputFileName}>
                      <div className="gg-cleaning-summary-cell">
                        <div className="progress-label" style={{ marginBottom: 6 }}>
                          <span>{formatSummaryHeadline(row.processedRows, row.groupedRows, row.successRows, row.failedRows)}</span>
                          <strong>{progressPercent}%</strong>
                        </div>
                        <div className="progress-track" style={{ marginBottom: 6 }}>
                          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <div className="muted gg-cleaning-summary-meta">{formatSummaryMeta(row.summary as Record<string, unknown> | undefined, row.inputMode, row.totalRows, row.groupedRows)}</div>
                        {row.errorReason ? (
                          <div className="muted" style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>
                            {row.errorReason}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatChinaDateTime(row.startedAt || row.createdAt)}</td>
                    <td>{formatDuration(row.startedAt || row.createdAt, row.finishedAt)}</td>
                    <td className="queue-action-cell">
                      <button className="btn-ghost faq-queue-action-btn" type="button" disabled={!canDownload} onClick={() => void downloadJobResult(row.id)}>
                        下载
                      </button>
                    </td>
                  </tr>
                );
              })}
              {queueRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>最近两周暂无 GG 清洗任务。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="upload-actions faq-pagination-row">
          <span className="muted">共 {queueQuery.data?.total ?? 0} 条任务</span>
          <div className="upload-actions" style={{ gap: 8 }}>
            <button type="button" className="btn-ghost" disabled={queuePage <= 1} onClick={() => setQueuePage((current) => Math.max(1, current - 1))}>
              上一页
            </button>
            <span className="faq-pagination-indicator">
              {queuePage}/{queueTotalPages}
            </span>
            <button type="button" className="btn-ghost" disabled={queuePage >= queueTotalPages} onClick={() => setQueuePage((current) => Math.min(queueTotalPages, current + 1))}>
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
