import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { ggCleaningUploadMaxFileBytes, ggCleaningUploadMaxRows, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";
import { createGlobalDownloadTask, useDownloadCenter } from "../components/DownloadCenter";

const GG_SOURCE_COLUMN = "采集数据源";
const uploadLimitMb = Math.round(ggCleaningUploadMaxFileBytes / 1024 / 1024);
const ggCleaningFileChunkBytes = 8 * 1024 * 1024;
const ggCleaningPreviewTimeoutMs = 15000;
const ggCleaningDirectFileMaxBytes = 256 * 1024;
const ggCleaningUploadApiBase = (() => {
  const trpcUrl = import.meta.env.VITE_TRPC_URL || "/trpc";
  if (/^https?:\/\//i.test(trpcUrl)) {
    try {
      const parsed = new URL(trpcUrl);
      return parsed.origin;
    } catch {
      return trpcUrl.replace(/\/trpc\/?$/, "");
    }
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return trpcUrl.replace(/\/trpc\/?$/, "");
})();

const ggCleaningDemoCsv = [
  `task_id,query,country,language,domain,term_id,term_name,subclass,bu,状态,${GG_SOURCE_COLUMN},google_url,content,product_urls,updated_time`,
  '12,"Does bigbustours.com offer app discount?",US,en,bigbustours.com,1001,Big Bus Tours,app,hd,抓取完成,ai_mode,https://www.google.com/search?q=bigbustours+app+discount,"[""Big Bus Tours offers an app-exclusive 15% discount for first bookings in the official mobile app.""]","[""https://www.bigbustours.com/en/app""]",2026-04-08 05:38:52',
  '12,"Does bigbustours.com offer app discount?",US,en,bigbustours.com,1001,Big Bus Tours,app,hd,抓取完成,search_lab,https://www.google.com/search?q=bigbustours+app+discount,"[""Download the official app to unlock exclusive offers.""]","[""https://www.bigbustours.com/en/app"",""https://www.example.com/app-coupon""]",2026-04-08 05:38:49',
  '13,"Does shopa.com offer free shipping?",US,en,shopa.com,1002,Shop A,shipping,hd,抓取完成,ai_mode,https://www.google.com/search?q=shopa+free+shipping,"[""Shop A offers free shipping on orders over $50 in the US.""]","[""https://shopa.com/help/shipping-policy""]",2026-04-08 05:38:52',
  '13,"Does shopa.com offer free shipping?",US,en,shopa.com,1002,Shop A,shipping,hd,抓取完成,search_lab,https://www.google.com/search?q=shopa+free+shipping,"[""Shipping policy: free delivery for orders over $50.""]","[""https://shopa.com/shipping"",""https://coupon.example/shipping""]",2026-04-08 05:38:49',
].join("\n");

async function uploadRawFile(file: File, onProgress?: (progressPercent: number, text: string) => void) {
  onProgress?.(5, "正在上传原始文件，系统会在服务端自动解析为最合适的处理格式...");

  const initResponse = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
  if (!initResponse.ok) throw new Error("初始化大文件上传失败。");
  const initPayload = (await initResponse.json()) as { uploadId?: string; error?: string };
  if (!initPayload.uploadId) throw new Error(initPayload.error || "初始化大文件上传失败。");

  const chunkCount = Math.max(1, Math.ceil(file.size / ggCleaningFileChunkBytes));
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * ggCleaningFileChunkBytes;
    const end = Math.min(file.size, start + ggCleaningFileChunkBytes);
    const response = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/${initPayload.uploadId}/file-chunk/${chunkIndex}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.slice(start, end),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `上传文件分片 ${chunkIndex + 1} 失败。`);
    }
    const progress = 10 + Math.round(((chunkIndex + 1) / chunkCount) * 80);
    onProgress?.(progress, `正在上传文件分片 ${chunkIndex + 1}/${chunkCount}...`);
  }

  const completeResponse = await fetch(`${ggCleaningUploadApiBase}/gg-cleaning/uploads/${initPayload.uploadId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunkCount }),
  });
  if (!completeResponse.ok) {
    const payload = (await completeResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "完成大文件上传失败。");
  }

  onProgress?.(100, "上传完成，正在生成预览...");
  return { uploadId: initPayload.uploadId, chunkCount };
}

function triggerBrowserDownload(url: string, fileName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadTextFile(fileName: string, content: string, mimeType = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutHandle: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
  }
}

async function readFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

function formatGroupedRowsLabel(groupedRows: number, estimated?: boolean) {
  return estimated ? `≈ ${groupedRows}` : String(groupedRows);
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
  const [includeDebugSheet, setIncludeDebugSheet] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState("");
  const [directFileBase64, setDirectFileBase64] = useState("");
  const [uploadedChunkCount, setUploadedChunkCount] = useState(0);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [currentJobId, setCurrentJobId] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const downloadCenter = useDownloadCenter();

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
    setDirectFileBase64("");
    setUploadedChunkCount(0);
    setSelectedFile(nextFile);
    if (!nextFile) return;
    if (nextFile.size > ggCleaningUploadMaxFileBytes) {
      setError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      setSelectedFile(null);
      return;
    }

    try {
      setIsUploadingFile(true);
      if (nextFile.size <= ggCleaningDirectFileMaxBytes) {
        setNotice("小文件走极速预览通道，正在直接解析...");
        const fileBase64 = await readFileAsBase64(nextFile);
        setDirectFileBase64(fileBase64);
        const preview = await withTimeout(
          previewMutation.mutateAsync({ fileName: nextFile.name, fileBase64 }),
          ggCleaningPreviewTimeoutMs,
          "GG 预览生成超时，请重试；如果多次出现，请联系我排查服务器。",
        );
        setNotice(`小文件已直接解析。预览有效输入 ${preview.totalRows} 行 / ${formatGroupedRowsLabel(preview.groupedRows, preview.groupedRowsEstimated)} 组。`);
      } else {
        const upload = await uploadRawFile(nextFile, (_progress, text) => {
          setNotice(text);
        });
        setUploadedFileId(upload.uploadId);
        setUploadedChunkCount(upload.chunkCount);
        const preview = await withTimeout(
          previewMutation.mutateAsync({ fileName: nextFile.name, uploadId: upload.uploadId }),
          ggCleaningPreviewTimeoutMs,
          "GG 预览生成超时，请重试；如果多次出现，请联系我排查服务器上的该次 uploadId。",
        );
        const groupedLabel = formatGroupedRowsLabel(preview.groupedRows, preview.groupedRowsEstimated);
        const previewSuffix = preview.groupedRowsEstimated ? "（大文件预览先展示估算分组数，真实分组会在任务启动后后台计算）" : "";
        setNotice(`文件上传完成，系统已在服务端自动解析。预览有效输入 ${preview.totalRows} 行 / ${groupedLabel} 组，上传分片 ${upload.chunkCount} 个。${previewSuffix}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件上传失败");
      setSelectedFile(null);
      setUploadedFileId("");
      setDirectFileBase64("");
      setUploadedChunkCount(0);
    } finally {
      setIsUploadingFile(false);
    }
  }

  async function runJob() {
    if (!selectedFile || (!uploadedFileId && !directFileBase64)) {
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
        uploadId: uploadedFileId || undefined,
        fileBase64: directFileBase64 || undefined,
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
    try {
      await downloadCenter.createDownloadTask({
        toolType: "gg-cleaning",
        sourceLabel: includeDebugSheet ? "GG 清洗完整结果" : "GG 清洗商家结果",
        create: () => createGlobalDownloadTask({ kind: "gg-cleaning", jobId, includeDebug: includeDebugSheet }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "下载结果失败，请稍后重试。");
    }
  }

  function downloadDemoTemplate() {
    downloadTextFile("gg-cleaning-demo.csv", ggCleaningDemoCsv);
  }

  return (
    <div className="grid translation-page">
      <section className="section-header">
        <h2>GG 采集数据清洗工具</h2>
        <p>上传采集结果表后，系统会自动按文件类型和大小选择最合适的解析方式，并继续输出 `merchant_output` 与 `debug_output`。</p>
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
              <p>支持最高 {uploadLimitMb}MB / 约 {ggCleaningUploadMaxRows} 行有效输入。大文件会自动走服务端解析，不再要求你手动转成 CSV 或 JSONL。</p>
              <p>系统会优先保留原始文件，再在服务端统一做编码处理和格式转换，避免 `xlsx` 转 `csv` 后体积膨胀或中文乱码。</p>
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
                <strong>{formatGroupedRowsLabel(previewData.groupedRows, previewData.groupedRowsEstimated)}</strong>
              </div>
              <div className="output-status-chip">
                <span>上传分片</span>
                <strong>{uploadedChunkCount || "-"}</strong>
              </div>
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
            disabled={!selectedFile || (!uploadedFileId && !directFileBase64) || isUploadingFile || previewMutation.isPending || runMutation.isPending}
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
          <div className="upload-actions" style={{ gap: 12, alignItems: "center" }}>
            <label className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={includeDebugSheet} onChange={(event) => setIncludeDebugSheet(event.target.checked)} />
              Include `debug_output` (sheet2)
            </label>
            <button className="btn-ghost output-inline-btn" type="button" onClick={() => void queueQuery.refetch()}>
            刷新列表
          </button>
        </div>

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
                        <div className="muted gg-cleaning-summary-meta">
                          {formatSummaryMeta(row.summary as Record<string, unknown> | undefined, row.inputMode, row.totalRows, row.groupedRows)}
                        </div>
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
