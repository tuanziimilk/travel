import * as Select from "@radix-ui/react-select";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import {
  type AiModel,
  categoryCalibrationDefaultAiModel,
  categoryCalibrationUploadMaxFileBytes,
  categoryCalibrationUploadMaxRows,
  uploaderOptions,
} from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";

type UploadRow = Record<string, unknown>;

const REQUIRED_COLUMNS = [
  "TermID",
  "TermName",
  "Domain",
  "Landing Page",
  "Country",
  "Language",
  "Meta",
  "About",
  "当前-category id",
  "当前-categoryName",
] as const;

const uploadLimitMb = Math.round(categoryCalibrationUploadMaxFileBytes / 1024 / 1024);
const uploadChunkSize = 1000;
const uploadApiBase = (() => {
  const trpcUrl = import.meta.env.VITE_TRPC_URL || "/trpc";
  return trpcUrl.replace(/\/trpc\/?$/, "");
})();

const demoTemplateRows = [
  {
    TermID: "225262",
    TermName: "Elite Pro Sports",
    Domain: "eliteprosports.co.uk",
    "Landing Page": "https://uk.hotdeals.com/brands/elite-pro-sports-discount-codes",
    Country: "UK",
    Language: "en",
    Meta: "Oxen Footer - Elite Pro Sports.",
    About:
      "{Mer.} is a Yorkshire-based online sports retailer and manufacturer specialising in apparel for professional sports clubs, including rugby, football and netball.",
    "当前-category id": "41",
    "当前-categoryName": "Computers & Software",
  },
];

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function ensureRequiredColumns(rows: UploadRow[]) {
  const columns = new Set(rows.flatMap((row) => Object.keys(row)).map((key) => String(key || "").trim()).filter(Boolean));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`上传文件缺少必填列: ${missing.join(", ")}`);
  }
}

async function parseXlsxFile(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<UploadRow>(firstSheet, { defval: "" });
  if (!rows.length) throw new Error("上传文件为空。");
  ensureRequiredColumns(rows);
  if (rows.length > categoryCalibrationUploadMaxRows) {
    throw new Error(`Category 校准单次最多支持 ${categoryCalibrationUploadMaxRows} 行。`);
  }
  return rows;
}

async function uploadFile(file: File, onProgress?: (progressPercent: number, text: string) => void) {
  onProgress?.(5, "正在解析上传模板...");
  const rows = await parseXlsxFile(file);

  const initResponse = await fetch(`${uploadApiBase}/category-calibration/uploads/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
  const initPayload = (await initResponse.json().catch(() => ({}))) as { uploadId?: string; error?: string };
  if (!initResponse.ok) {
    throw new Error(initPayload.error || `初始化上传失败（HTTP ${initResponse.status}）。请确认前后端服务已启动，并稍后重试。`);
  }
  if (!initPayload.uploadId) throw new Error(initPayload.error || "初始化上传失败。");

  const chunkCount = Math.ceil(rows.length / uploadChunkSize);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkRows = rows.slice(chunkIndex * uploadChunkSize, (chunkIndex + 1) * uploadChunkSize);
    const response = await fetch(`${uploadApiBase}/category-calibration/uploads/${initPayload.uploadId}/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkIndex, rows: chunkRows }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || `上传分块 ${chunkIndex + 1} 失败（HTTP ${response.status}）。`);
    }
    const progress = 10 + Math.round(((chunkIndex + 1) / chunkCount) * 80);
    onProgress?.(progress, `正在上传分块 ${chunkIndex + 1}/${chunkCount}...`);
  }

  const completeResponse = await fetch(`${uploadApiBase}/category-calibration/uploads/${initPayload.uploadId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunkCount }),
  });
  const completePayload = (await completeResponse.json().catch(() => ({}))) as { error?: string };
  if (!completeResponse.ok) {
    throw new Error(completePayload.error || `完成上传失败（HTTP ${completeResponse.status}）。`);
  }

  onProgress?.(100, "上传完成，正在生成预览...");
  return {
    uploadId: initPayload.uploadId,
    totalRows: rows.length,
    chunkCount,
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

function downloadWorkbook(fileName: string, rows: Array<Record<string, unknown>>, headers: string[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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

function formatVisualProgress(processedRows: number, totalRows: number, status: string) {
  const raw = formatProgress(processedRows, totalRows);
  if (status === "running" && processedRows <= 0 && totalRows > 0) return 4;
  return raw;
}

function formatSummaryHeadline(processedRows: number, totalRows: number, successRows: number, failedRows: number) {
  return `${processedRows}/${totalRows} | 成功 ${successRows} | 失败 ${failedRows}`;
}

function formatProgressStage(status: string, summary: Record<string, unknown> | undefined, processedRows: number, totalRows: number) {
  const explicit = normalizeText(summary?.progressStage);
  if (explicit) return explicit;
  if (status === "queued") return "排队中";
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running" && processedRows <= 0 && totalRows > 0) return "已启动";
  if (status === "running" && totalRows > 0 && processedRows >= totalRows) return "正在收尾";
  if (status === "running") return "正在调用 AI";
  return "";
}

function formatSummaryMeta(summary: Record<string, unknown> | undefined, inputMode: string, totalRows: number) {
  const aiModel = normalizeText(summary?.aiModel);
  const cost = 0;
  const metaParts = [`模式 ${inputMode}`, `输入 ${totalRows} 行`];
  if (aiModel) metaParts.push(`模型 ${aiModel}`);
  if (Number.isFinite(cost) && cost > 0) metaParts.push(`预估成本 $${cost.toFixed(4)}`);
  return metaParts.join(" | ");
}

function formatTotalTokens(summary: Record<string, unknown> | undefined) {
  const totalTokens = Number(summary?.totalTokens || 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return "-";
  return totalTokens.toLocaleString("en-US");
}

function formatEstimatedCost(summary: Record<string, unknown> | undefined) {
  const cost = Number(summary?.estimatedCostUsd || 0);
  if (!Number.isFinite(cost) || cost <= 0) return "-";
  return `$${cost.toFixed(4)}`;
}

function formatSummaryMetaText(summary: Record<string, unknown> | undefined, inputMode: string, totalRows: number) {
  const aiModel = normalizeText(summary?.aiModel);
  const cost = Number(summary?.estimatedCostUsd || 0);
  const rawRows = Number(summary?.rawRows || 0);
  const skippedRows = Number(summary?.skippedRows || 0);
  const metaParts = [`模式 ${inputMode}`, `输入 ${totalRows} 行`];
  if (rawRows > totalRows) metaParts.push(`原始 ${rawRows} 行`);
  if (skippedRows > 0) metaParts.push(`已跳过说明行 ${skippedRows} 行`);
  if (aiModel) metaParts.push(`模型 ${aiModel}`);
  if (Number.isFinite(cost) && cost > 0) metaParts.push(`预计花费 $${cost.toFixed(4)}`);
  return metaParts.join(" | ");
}

function formatFailureReasonList(summary: Record<string, unknown> | undefined) {
  const reasons = Array.isArray(summary?.failureReasonSamples) ? summary.failureReasonSamples : [];
  return reasons.map((item) => normalizeText(item)).filter(Boolean);
}

function formatJudgementBreakdown(summary: Record<string, unknown> | undefined) {
  const counts = summary?.judgementCounts;
  if (!counts || typeof counts !== "object") return "";
  const map = counts as Record<string, unknown>;
  const parts = ([
    ["正确", Number(map["正确"] || 0)],
    ["可更精准", Number(map["可更精准"] || 0)],
    ["有误", Number(map["有误"] || 0)],
    ["无分类新增", Number(map["无分类新增"] || 0)],
  ] as Array<[string, number]>)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([label, count]) => `${label} ${count}`);
  return parts.join(" | ");
}

function formatRecoveryMeta(summary: Record<string, unknown> | undefined) {
  if (!summary) return "";
  const parts: string[] = [];
  const primary = Number(summary.primarySuccessRows || 0);
  const recovered = Number(summary.recoveredRows || 0);
  const rewritten = Number(summary.noteRewrittenRows || 0);
  const programRecovered = Number(summary.programmaticallyRecoveredRows || 0);
  if (primary > 0) parts.push(`首轮成功 ${primary}`);
  if (recovered > 0) parts.push(`恢复成功 ${recovered}`);
  if (rewritten > 0) parts.push(`说明补写 ${rewritten}`);
  if (programRecovered > 0) parts.push(`程序纠偏 ${programRecovered}`);
  return parts.join(" | ");
}

function formatQueueSummaryMeta(summary: Record<string, unknown> | undefined, _inputMode: string, totalRows: number) {
  const aiModel = normalizeText(summary?.aiModel);
  const rawRows = Number(summary?.rawRows || 0);
  const skippedRows = Number(summary?.skippedRows || 0);
  const metaParts: string[] = [];
  if (skippedRows > 0) metaParts.push(`已跳过说明行 ${skippedRows} 行`);
  if (aiModel) metaParts.push(`模型 ${aiModel}`);
  if (rawRows > totalRows && skippedRows <= 0) metaParts.push(`原始 ${rawRows} 行`);
  return metaParts.join(" | ");
}

const queueStatusText: Record<string, string> = {
  queued: "排队中",
  running: "处理中",
  done: "已完成",
  failed: "失败",
};

export function CategoryCalibrationPage() {
  const queuePageSize = 8;
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [runningJobStatuses, setRunningJobStatuses] = useState<Record<string, Record<string, unknown>>>({});
  const [queuePage, setQueuePage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const aiConfigQuery = trpc.runtime.aiConfig.get.useQuery();

  const previewMutation = trpc.categoryCalibration.preview.useMutation();
  const runMutation = trpc.categoryCalibration.run.useMutation({
    onSuccess: async () => {
      await queueQuery.refetch();
    },
  });

  const queueQuery = trpc.categoryCalibration.queue.useQuery(
    { page: queuePage, pageSize: queuePageSize },
    {
      refetchInterval: (query) => {
        const rows = query.state.data?.rows ?? [];
        return rows.some((row) => row.status === "running") ? 1500 : 5000;
      },
    },
  );

  const previewData = previewMutation.data;
  const runningJobIds = useMemo(() => {
    const rows = queueQuery.data?.rows ?? [];
    return rows.filter((row) => row.status === "running").map((row) => row.id);
  }, [queueQuery.data?.rows]);

  useEffect(() => {
    if (!runningJobIds.length) {
      setRunningJobStatuses({});
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollStatuses = async () => {
      try {
        const entries = await Promise.all(
          runningJobIds.map(async (jobId) => [jobId, await utils.client.categoryCalibration.status.query({ jobId })] as const),
        );
        if (cancelled) return;
        setRunningJobStatuses(Object.fromEntries(entries));
      } catch {
        if (!cancelled) timer = setTimeout(() => void pollStatuses(), 1800);
        return;
      }
      if (!cancelled) timer = setTimeout(() => void pollStatuses(), 1500);
    };

    void pollStatuses();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runningJobIds, utils.client]);

  const queueRows = useMemo(() => {
    const rows = queueQuery.data?.rows ?? [];
    return rows.map((item) => {
      const liveStatus = runningJobStatuses[item.id];
      return liveStatus ? { ...item, ...liveStatus } : item;
    });
  }, [queueQuery.data?.rows, runningJobStatuses]);

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
    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setError("仅支持 .xlsx 文件。");
      setSelectedFile(null);
      return;
    }
    if (nextFile.size > categoryCalibrationUploadMaxFileBytes) {
      setError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      setSelectedFile(null);
      return;
    }

    try {
      setIsUploadingFile(true);
      const upload = await uploadFile(nextFile, (_progress, text) => {
        setNotice(text);
      });
      setUploadedFileId(upload.uploadId);
      const preview = await previewMutation.mutateAsync({ fileName: nextFile.name, uploadId: upload.uploadId });
      setNotice(`文件上传完成，已切分 ${upload.chunkCount} 个分块；预览 ${preview.validRows}/${preview.totalRows} 行有效输入。`);
    } catch (err) {
      setError(err instanceof Error ? `上传失败：${err.message}` : "上传失败：文件解析失败。");
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
        aiModel: (aiConfigQuery.data?.aiModel || categoryCalibrationDefaultAiModel) as AiModel,
      });
      setQueuePage(1);
      setNotice(`任务已创建，任务 ID: ${result.jobId}，有效行数 ${result.validRows}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建 Category 校准任务失败。");
    }
  }

  async function downloadJobResult(jobId: string) {
    setError("");
    const data = await utils.client.categoryCalibration.result.query({ jobId });
    if (!data.xlsxBase64) {
      setError(data.errorReason || "当前任务暂无可下载结果，请稍后刷新列表后重试。");
      return;
    }
    downloadBase64File(data.fileName, data.xlsxBase64);
  }

  function downloadDemoTemplate() {
    downloadWorkbook("category-calibration-demo.xlsx", demoTemplateRows, [...REQUIRED_COLUMNS]);
  }

  return (
    <div className="grid translation-page">
      <section className="section-header">
        <h2>Category 校准工具</h2>
        <p>上传待校准的 `.xlsx` 模板后，系统会基于内置分类字典和当前运行模型判断当前分类是否正确，并输出建议父类和建议子类。</p>
      </section>

      <div className="card translation-main-card">
        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">1</span>
            <div>
              <h3>上传文件</h3>
              <p className="muted">首版仅支持 `.xlsx` 上传。</p>
              <p>必填列：{REQUIRED_COLUMNS.join(" / ")}</p>
            </div>
          </div>

          <div className="field">
            <div className="translation-action-bar">
              <input
                type="file"
                accept=".xlsx"
                disabled={isUploadingFile || previewMutation.isPending || runMutation.isPending}
                onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
              />
              <div className="upload-actions">
                <button className="btn-ghost output-template-btn" type="button" onClick={downloadDemoTemplate}>
                  下载模板
                </button>
              </div>
            </div>
            <div className="upload-limit-banner" role="note">
              <span className="upload-limit-banner-kicker">上传上限</span>
              <p>支持最高 {uploadLimitMb}MB / 约 {categoryCalibrationUploadMaxRows} 行输入，仅支持第一个 Sheet。</p>
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
                <span>总行数</span>
                <strong>{previewData.totalRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>有效输入</span>
                <strong>{previewData.validRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>列数</span>
                <strong>{previewData.columns.length}</strong>
              </div>
            </div>
          ) : null}

          {previewData?.sampleRawRows?.length ? (
            <div className="field">
              <label>样例行预览（表头 + 第一行）</label>
              <div className="table-scroll faq-output-table-scroll">
                <table className="history-table queue-table">
                  <thead>
                    <tr>
                      {previewData.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {previewData.columns.map((column) => (
                        <td key={`sample-${column}`} title={normalizeText(previewData.sampleRawRows[0]?.[column])}>
                          {normalizeText(previewData.sampleRawRows[0]?.[column]) || "-"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">2</span>
            <div>
              <h3>任务信息</h3>
              <p className="muted">创建任务后会进入单任务串行队列。</p>
            </div>
          </div>

          <div className="translation-advanced-grid">
            <div className="field">
              <label>上传人</label>
              <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
                <Select.Trigger className="select-trigger" aria-label="category-calibration-uploader">
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
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：4 月 category 校准批次" />
            </div>
          </div>

          <button
            className="btn-primary translation-run-btn"
            type="button"
            disabled={!selectedFile || !uploadedFileId || isUploadingFile || previewMutation.isPending || runMutation.isPending}
            onClick={() => void runJob()}
          >
            {runMutation.isPending ? "正在创建任务..." : "创建 Category 校准任务"}
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
              <p className="muted">支持查看最近两周的 Category 校准任务，并实时查看进度与下载结果。</p>
            </div>
          </div>
          <button className="btn-ghost output-inline-btn" type="button" onClick={() => void queueQuery.refetch()}>
            刷新列表
          </button>
        </div>

        <div className="table-scroll faq-output-table-scroll translation-queue-scroll">
          <table className="history-table queue-table gg-cleaning-queue-table category-calibration-queue-table">
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>上传人</th>
                <th>任务 ID</th>
                <th>状态</th>
                <th>处理摘要</th>
                <th>总 Tokens</th>
                <th>预估花费</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>下载</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((row) => {
                const progressPercent = formatProgress(row.processedRows, row.totalRows);
                const visualProgressPercent = formatVisualProgress(row.processedRows, row.totalRows, row.status);
                const progressStage = formatProgressStage(
                  row.status,
                  row.summary as Record<string, unknown> | undefined,
                  row.processedRows,
                  row.totalRows,
                );
                const canDownload = Boolean(row.canDownload || row.resultFilePath);
                return (
                  <tr key={row.id}>
                    <td title={row.note || ""}>{row.uploader || "-"}</td>
                    <td title={row.inputFileName}>{formatJobId(row.id)}</td>
                    <td>{queueStatusText[row.status] ?? row.status}</td>
                    <td title={row.errorReason || row.inputFileName}>
                      <div className="gg-cleaning-summary-cell">
                        <div className="progress-label" style={{ marginBottom: 6 }}>
                          <span>
                            {row.status === "running" ? `处理中 ${row.processedRows}/${row.totalRows}` : formatSummaryHeadline(row.processedRows, row.totalRows, row.successRows, row.failedRows)}
                          </span>
                          <strong>{progressPercent}%</strong>
                        </div>
                        <div className="progress-track" style={{ marginBottom: 6 }}>
                          <div className="progress-fill" style={{ width: `${visualProgressPercent}%` }} />
                        </div>
                        {progressStage ? <div className="muted gg-cleaning-summary-meta">{progressStage}</div> : null}
                        <div className="muted gg-cleaning-summary-meta">{formatQueueSummaryMeta(row.summary as Record<string, unknown> | undefined, row.inputMode, row.totalRows)}</div>
                        {formatJudgementBreakdown(row.summary as Record<string, unknown> | undefined) ? (
                          <div className="muted gg-cleaning-summary-meta">{formatJudgementBreakdown(row.summary as Record<string, unknown> | undefined)}</div>
                        ) : null}
                        {formatRecoveryMeta(row.summary as Record<string, unknown> | undefined) ? (
                          <div className="muted gg-cleaning-summary-meta">{formatRecoveryMeta(row.summary as Record<string, unknown> | undefined)}</div>
                        ) : null}
                        {formatFailureReasonList(row.summary as Record<string, unknown> | undefined).map((reason) => (
                          <div key={`${row.id}-${reason}`} className="gg-cleaning-summary-reason">
                            {reason}
                          </div>
                        ))}
                        {row.errorReason ? (
                          <div className="muted" style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>
                            {row.errorReason}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatTotalTokens(row.summary as Record<string, unknown> | undefined)}</td>
                    <td>{formatEstimatedCost(row.summary as Record<string, unknown> | undefined)}</td>
                    <td className="category-calibration-time-cell" title={formatChinaDateTime(row.startedAt || row.createdAt)}>
                      {formatChinaDateTime(row.startedAt || row.createdAt)}
                    </td>
                    <td className="category-calibration-duration-cell" title={formatDuration(row.startedAt || row.createdAt, row.finishedAt)}>
                      {formatDuration(row.startedAt || row.createdAt, row.finishedAt)}
                    </td>
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
                  <td colSpan={9}>最近两周暂无 Category 校准任务。</td>
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
