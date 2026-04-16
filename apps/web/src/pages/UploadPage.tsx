import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { qualityBatchUploadMaxFileBytes, qualityBatchUploadMaxRows, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { CHINA_TIME_ZONE, formatChinaDateTime } from "../utils/time";
import { createGlobalDownloadTask, useDownloadCenter } from "../components/DownloadCenter";

const uploadDemoCsv = [
  "TermID,TermName,Domain,Country,About_online,About_ai,About_op",
  '225262,Elite Pro Sports,eliteprosports.co.uk,UK,"sample online about","sample ai about","sample op about"',
].join("\n");

const queueStatusText: Record<string, string> = {
  pending: "排队中",
  running: "处理中",
  done: "已完成",
  cancelled: "已取消",
  failed: "失败",
};

function formatDuration(ms?: number | null) {
  const safe = Math.max(0, Number(ms || 0));
  const totalSeconds = Math.round(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}秒`;
  return `${minutes}分${seconds}秒`;
}

function formatUsd(value?: number | string | null) {
  const n = Number(value || 0);
  return `$${n.toFixed(6)}`;
}

function formatCny(value?: number | string | null) {
  const n = Number(value || 0) * 7;
  return `¥${n.toFixed(4)}`;
}

function formatJobId(jobId?: string | null) {
  const value = String(jobId || "");
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function formatCompactDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

function formatAverage(total?: number | string | null, count?: number | null, digits = 1) {
  const safeCount = Math.max(0, Number(count || 0));
  if (!safeCount) return "-";
  const value = Number(total || 0) / safeCount;
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatScore(value?: number | string | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : "-";
}

function formatPercent(value?: number | string | null, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "-";
}

function formatEta(seconds?: number | null) {
  const safe = Math.max(0, Number(seconds || 0));
  if (!safe) return "-";
  return formatDuration(safe * 1000);
}

const STUCK_WARNING_MS = 5 * 60 * 1000;

function isLikelyStuck(item: {
  status?: string | null;
  updatedAt?: string | Date | null;
  doneRows?: number | null;
  totalRows?: number | null;
}) {
  if (item.status !== "running" && item.status !== "pending") return false;
  if (!item.updatedAt) return false;
  const updatedAtMs = new Date(item.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return false;
  const noVisibleProgress = Number(item.doneRows || 0) <= 0 && Number(item.totalRows || 0) > 0;
  return noVisibleProgress && Date.now() - updatedAtMs > STUCK_WARNING_MS;
}

function getFailureStatEntries(stats?: Record<string, unknown> | null) {
  return Object.entries(stats || {}).filter(([, value]) => Number(value || 0) > 0);
}

function buildQueueAlertTags(item: {
  failedRows?: number | null;
  isFailedOnlyRetry?: boolean | null;
  errorReason?: string | null;
  failureReasonSummary?: string | null;
}) {
  const tags: string[] = [];
  if (Number(item.failedRows || 0) > 0) tags.push(`失败 ${item.failedRows}`);
  if (item.isFailedOnlyRetry) tags.push("已补跑");
  if (item.errorReason || item.failureReasonSummary) tags.push("有告警");
  return tags;
}

function buildQueueAlertSummary(item: {
  failedRows?: number | null;
  isFailedOnlyRetry?: boolean | null;
  errorReason?: string | null;
  failureReasonSummary?: string | null;
}) {
  const failedRows = Number(item.failedRows || 0);
  if (failedRows > 0) return `失败${failedRows}`;
  if (item.isFailedOnlyRetry) return "补跑";
  if (item.errorReason || item.failureReasonSummary) return "告警";
  return "-";
}

function getQueueAlertSummary(item: {
  status?: string | null;
  updatedAt?: string | Date | null;
  doneRows?: number | null;
  totalRows?: number | null;
  failedRows?: number | null;
  isFailedOnlyRetry?: boolean | null;
  errorReason?: string | null;
  failureReasonSummary?: string | null;
}) {
  if (isLikelyStuck(item)) return "疑似卡住";
  return buildQueueAlertSummary(item);
}

const uploadLimitMb = Math.round(qualityBatchUploadMaxFileBytes / 1024 / 1024);

export function UploadPage() {
  const downloadCenter = useDownloadCenter();
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [outputMode, setOutputMode] = useState<"full" | "compact">("compact");
  const [file, setFile] = useState<File | null>(null);
  const [fileGuardError, setFileGuardError] = useState("");
  const [batchId, setBatchId] = useState("");
  const [jobId, setJobId] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [detailJobId, setDetailJobId] = useState("");
  const [detailBatchId, setDetailBatchId] = useState("");
  const queuePageSize = 20;

  const createBatch = trpc.batch.create.useMutation();
  const startIngest = trpc.batch.ingest.start.useMutation();
  const cancelIngest = trpc.batch.ingest.cancel.useMutation();

  const statusQuery = trpc.batch.ingest.status.useQuery(
    { jobId },
    {
      enabled: Boolean(jobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 1500;
        return status === "done" || status === "failed" || status === "cancelled" ? false : 1500;
      },
    },
  );

  const queueQuery = trpc.batch.ingest.queue.useQuery(
    { moduleId: "about", page: queuePage, pageSize: queuePageSize },
    {
      placeholderData: (previousData) => previousData,
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        const list = query.state.data?.rows ?? [];
        const hasRunning = list.some((item) => item.status === "pending" || item.status === "running");
        return hasRunning ? 4000 : 12000;
      },
    },
  );

  const resultQuery = trpc.batch.ingest.result.useQuery(
    { batchId, format: "json" },
    { enabled: Boolean(batchId && statusQuery.data?.status === "done") },
  );

  const detailResultQuery = trpc.batch.ingest.result.useQuery(
    { batchId: detailBatchId, format: "json" },
    { enabled: Boolean(detailBatchId) },
  );

  const progressPercent = useMemo(() => {
    const total = statusQuery.data?.totalRows ?? 0;
    const done = statusQuery.data?.doneRows ?? 0;
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [statusQuery.data]);

  const queueTotalPages = useMemo(() => {
    const total = queueQuery.data?.total ?? 0;
    if (!total) return 1;
    return Math.max(1, Math.ceil(total / queuePageSize));
  }, [queueQuery.data?.total]);

  const queueRows = queueQuery.data?.rows ?? [];
  const detailRow = useMemo(() => queueRows.find((item) => item.id === detailJobId) ?? null, [detailJobId, queueRows]);
  const detailJsonResult = detailResultQuery.data && "summary" in detailResultQuery.data ? detailResultQuery.data : null;
  const detailSummary = detailJsonResult?.summary ?? null;
  const detailFailureEntries = getFailureStatEntries(detailSummary?.failureReasonStats as Record<string, unknown> | undefined);
  const batchJsonResult = resultQuery.data && "summary" in resultQuery.data ? resultQuery.data : null;

  async function toBase64(fileObj: File) {
    const buffer = await fileObj.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function runUpload() {
    if (!file) return;
    if (file.size > qualityBatchUploadMaxFileBytes) {
      setFileGuardError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      return;
    }
    const created = await createBatch.mutateAsync({ uploader, note, source: "upload", outputMode });
    setBatchId(created.batchId);
    const fileBase64 = await toBase64(file);
    const started = await startIngest.mutateAsync({
      batchId: created.batchId,
      fileName: file.name,
      fileBase64,
    });
    setJobId(started.jobId);
    setQueuePage(1);
    void Promise.all([statusQuery.refetch(), queueQuery.refetch()]);
  }

  async function refreshProgress() {
    await Promise.all([statusQuery.refetch(), queueQuery.refetch()]);
  }

  async function cancelJob(jobIdValue: string) {
    await cancelIngest.mutateAsync({ jobId: jobIdValue });
    await queueQuery.refetch();
    if (jobId === jobIdValue) await statusQuery.refetch();
  }

  async function retryFailedRows(_jobId?: string) {
    return undefined;
  }

  async function retryWholeBatch(_jobId?: string) {
    return undefined;
  }

  async function downloadBatchXlsx(batchIdValue: string) {
    if (!batchIdValue) return;
    await downloadCenter.createDownloadTask({
      toolType: "about-quality",
      sourceLabel: "About 评分结果",
      create: () => createGlobalDownloadTask({ kind: "quality-batch", jobId: batchIdValue }),
    });
  }

  function downloadDemoTemplate() {
    const blob = new Blob([uploadDemoCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "about-upload-demo.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      setFileGuardError("");
      return;
    }
    if (nextFile.size > qualityBatchUploadMaxFileBytes) {
      setFile(null);
      setFileGuardError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      return;
    }
    setFile(nextFile);
    setFileGuardError("");
  }

  function openDetail(jobIdValue: string, batchIdValue: string) {
    setDetailJobId(jobIdValue);
    setDetailBatchId(batchIdValue);
  }

  function closeDetail() {
    setDetailJobId("");
    setDetailBatchId("");
  }

  return (
    <div className="card">
      <h2>批量上传评分</h2>
      {queueQuery.error ? (
        <p className="error-text">
          {queueQuery.data ? "队列刷新失败，正在重试。当前先展示上一次成功结果。" : `队列加载失败：${queueQuery.error.message}。系统会自动重试，你也可以手动刷新。`}
        </p>
      ) : null}
      <p className="muted">上传 CSV 或 XLSX，异步执行评分并追踪队列进度，完成后可直接下载结果。</p>

      <div className="grid">
        <div className="field">
          <label>上传人</label>
          <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
            <Select.Trigger className="select-trigger" aria-label="uploader-upload">
              <Select.Value placeholder="选择上传人" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-content" position="popper" sideOffset={8}>
                <Select.Viewport className="select-viewport">
                  {uploaderOptions.map((name) => (
                    <Select.Item className="select-item" key={name} value={name}>
                      <Select.ItemText>{name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className="field">
          <label>批次备注</label>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：规则验证 / 运营抽检" />
        </div>

        <div className="field">
          <label>上传文件（.csv / .xlsx）</label>
          <input type="file" accept=".csv,.xlsx" onChange={(event) => handleFileChange(event.target.files?.[0] || null)} />
          <div className="upload-limit-banner" role="note">
            <span className="upload-limit-banner-kicker">上传上限</span>
            <p>建议不超过 {uploadLimitMb}MB / 约 {qualityBatchUploadMaxRows} 行，超过将直接拦截。</p>
          </div>
        </div>

        <div className="field field-emphasis">
          <div className="field-emphasis-head">
            <label>评分输出模式</label>
            <span className="field-emphasis-badge">Token 策略</span>
          </div>
          <Select.Root value={outputMode} onValueChange={(value) => setOutputMode(value as "full" | "compact")}>
            <Select.Trigger className="select-trigger" aria-label="output-mode-upload">
              <Select.Value />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-content" position="popper" sideOffset={8}>
                <Select.Viewport className="select-viewport">
                  <Select.Item className="select-item" value="full">
                    <Select.ItemText>完整模式：保留详细解释</Select.ItemText>
                  </Select.Item>
                  <Select.Item className="select-item" value="compact">
                    <Select.ItemText>紧凑模式：仅保留下游需要字段</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <p className="field-emphasis-tip">两种模式使用同一套评分规则；紧凑模式只精简输出字段，用于降低批量评分 token 成本。</p>
        </div>

        <div className="upload-actions">
          <button className="btn-ghost" type="button" onClick={downloadDemoTemplate}>
            下载上传模板
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={runUpload}
            disabled={!file || Boolean(fileGuardError) || createBatch.isPending || startIngest.isPending}
          >
            {createBatch.isPending || startIngest.isPending ? "处理中..." : "开始上传并评分"}
          </button>
        </div>

        {fileGuardError && (
          <div className="field">
            <p className="error-text" style={{ margin: 0 }}>{fileGuardError}</p>
          </div>
        )}

        {startIngest.error && (
          <div className="field">
            <p style={{ margin: 0, color: "#b00020", fontWeight: 900 }}>上传失败：{startIngest.error.message}</p>
          </div>
        )}
      </div>

      {statusQuery.data && (
        <div className="card" style={{ marginTop: 16 }}>
          {(statusQuery.data.status === "failed" || statusQuery.data.status === "cancelled") && statusQuery.data.errorReason && (
            <p className="queue-reason-banner" title={String(statusQuery.data.errorReason)}>
              {String(statusQuery.data.errorReason)}
            </p>
          )}
          <h3>任务进度</h3>
          <div className="job-meta-bar">
            <span className="job-meta-item">任务 ID：{formatJobId(jobId)}</span>
            <span className={`job-status-pill status-${statusQuery.data.status}`}>{queueStatusText[statusQuery.data.status] ?? statusQuery.data.status}</span>
            <span className="job-meta-item">
              进度：{statusQuery.data.doneRows}/{statusQuery.data.totalRows}，失败 {statusQuery.data.failedRows}
            </span>
            <span className="job-meta-item">模式：{statusQuery.data.outputMode === "compact" ? "compact" : "full"}</span>
            <span className="job-meta-item">重跑：{statusQuery.data.isFailedOnlyRetry ? "失败行补跑" : "整批"}</span>
          </div>

          {isLikelyStuck(statusQuery.data) && (
            <p className="queue-reason-banner" style={{ marginTop: 10 }}>
              疑似卡住：超过 5 分钟没有新进度，请关注任务状态。
            </p>
          )}
          <div className="receipt-box" style={{ marginBottom: 10, marginTop: 10, padding: 16 }}>
            <div className="receipt-item">
              <span className="receipt-label">耗时</span>
              <span className="receipt-val">{formatDuration(statusQuery.data.elapsedMs)}</span>
              <div className="receipt-sub">实时累计</div>
            </div>
            <div className="receipt-item">
              <span className="receipt-label">Token</span>
              <span className="receipt-val token-blue">{statusQuery.data.totalTokensSum}</span>
              <div className="receipt-sub">模型消耗</div>
            </div>
            <div className="receipt-item">
              <span className="receipt-label">费用</span>
              <span className="receipt-val token-pink">{formatUsd(statusQuery.data.estimatedCostUsdSum)}</span>
              <div className="receipt-sub">约 {formatCny(statusQuery.data.estimatedCostUsdSum)}</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            首次失败 {statusQuery.data.initialFailedRows || 0}，挽回 {statusQuery.data.recoveredRows || 0}，最终失败 {statusQuery.data.finalFailedRows || statusQuery.data.failedRows || 0}
          </p>
          {statusQuery.data.failureReasonSummary && (
            <p className="muted" style={{ marginTop: 0 }}>失败分类：{String(statusQuery.data.failureReasonSummary)}</p>
          )}

          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p style={{ marginTop: 6 }}>{progressPercent}%</p>
          <button className="btn-ghost" type="button" onClick={refreshProgress}>
            刷新进度
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>历史任务队列</h3>
        <div className="about-queue-table-wrap">
          <table className="history-table queue-table about-queue-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>状态</th>
                <th>进度</th>
                <th>耗时</th>
                <th>费用</th>
                <th>上传人</th>
                <th>异常标记</th>
                <th>开始时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((item) => {
                const alertSummary = getQueueAlertSummary(item);
                const progressLabel = `${item.doneRows}/${item.totalRows}${item.failedRows > 0 ? `（失败 ${item.failedRows}）` : ""}`;
                const progressValue = item.totalRows ? Math.max(0, Math.min(100, Math.round((item.doneRows / item.totalRows) * 100))) : 0;
                return (
                  <tr key={item.id}>
                    <td title={item.id}>{formatJobId(item.id)}</td>
                    <td title={queueStatusText[item.status] ?? item.status}>
                      <span className={`about-queue-status-pill status-${item.status}`}>
                        {queueStatusText[item.status] ?? item.status}
                      </span>
                    </td>
                    <td title={progressLabel}>
                      <div>{progressLabel}</div>
                      {item.totalRows > 0 ? (
                        <div className="about-queue-progress-line">
                          <span className="about-queue-progress-fill" style={{ width: `${progressValue}%` }} />
                        </div>
                      ) : null}
                    </td>
                    <td title={formatDuration(item.elapsedMs)}>{formatDuration(item.elapsedMs)}</td>
                    <td title={formatUsd(item.estimatedCostUsdSum)}>{formatUsd(item.estimatedCostUsdSum)}</td>
                    <td title={item.uploader || "-"}>
                      <span className="about-queue-uploader-chip">{item.uploader || "-"}</span>
                    </td>
                    <td>
                      <span className={alertSummary === "-" ? "muted" : "about-queue-alert-chip"}>
                        {alertSummary}
                      </span>
                    </td>
                    <td title={formatChinaDateTime(item.startedAt)}>{formatChinaDateTime(item.startedAt)}</td>
                    <td className="queue-action-cell">
                      <div className="about-queue-action-stack">
                        <button className="btn-ghost about-queue-action-btn" type="button" onClick={() => openDetail(item.id, item.batchId)}>
                          详情
                        </button>
                        {(item.status === "done" || item.status === "failed" || item.status === "cancelled") && (
                          <button className="btn-ghost about-queue-action-btn" type="button" onClick={() => void downloadBatchXlsx(item.batchId)}>
                            结果
                          </button>
                        )}
                        {false && item.failedRows > 0 && (item.status === "done" || item.status === "failed" || item.status === "cancelled") && (
                          <button className="btn-ghost about-queue-action-btn" type="button" onClick={() => void retryFailedRows(item.id)}>
                            重跑
                          </button>
                        )}
                        {(item.status === "running" || item.status === "pending") && (
                          <button className="btn-ghost about-queue-action-btn" type="button" onClick={() => void cancelJob(item.id)}>
                            取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {queueRows.length === 0 && !queueQuery.error && (
                <tr>
                  <td colSpan={9}>暂无任务</td>
                </tr>
              )}
              {queueRows.length === 0 && queueQuery.error && (
                <tr>
                  <td colSpan={9}>队列暂时加载失败，正在重试，不代表历史任务已消失。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="upload-actions" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <button className="btn-ghost" type="button" onClick={() => void queueQuery.refetch()}>
            刷新队列
          </button>
          <div className="upload-actions" style={{ gap: 8 }}>
            <button className="btn-ghost" type="button" disabled={queuePage <= 1} onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}>
              上一页
            </button>
            <span style={{ fontWeight: 900, minWidth: 72, textAlign: "center" }}>
              {queuePage}/{queueTotalPages}
            </span>
            <button
              className="btn-ghost"
              type="button"
              disabled={queuePage >= queueTotalPages}
              onClick={() => setQueuePage((prev) => Math.min(queueTotalPages, prev + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {detailRow ? (
        <div className="history-detail-overlay" role="dialog" aria-modal="true" onClick={closeDetail}>
          <div className="history-detail-card about-task-detail-card" onClick={(event) => event.stopPropagation()}>
            <div className="history-detail-head">
              <h3>任务详情</h3>
              <button className="history-detail-close" type="button" aria-label="关闭详情" onClick={closeDetail}>
                ×
              </button>
            </div>

            <div className="history-detail-content">
              <section className="about-task-detail-section">
                <div className="about-task-detail-section-head">
                  <h4>顶部摘要</h4>
                </div>
                <div className="about-task-detail-grid">
                  <div className="about-task-detail-kv"><span>任务ID</span><strong>{detailRow.id}</strong></div>
                  <div className="about-task-detail-kv"><span>状态</span><strong>{queueStatusText[detailRow.status] ?? detailRow.status}</strong></div>
                  <div className="about-task-detail-kv"><span>批次ID</span><strong>{detailRow.batchId}</strong></div>
                  <div className="about-task-detail-kv"><span>输出模式</span><strong>{detailRow.outputMode === "compact" ? "compact" : "full"}</strong></div>
                  <div className="about-task-detail-kv"><span>重跑类型</span><strong>{detailRow.isFailedOnlyRetry ? "失败行补跑" : "整批"}</strong></div>
                  <div className="about-task-detail-kv"><span>开始时间</span><strong>{formatChinaDateTime(detailRow.startedAt)}</strong></div>
                  <div className="about-task-detail-kv"><span>结束时间</span><strong>{detailRow.finishedAt ? formatChinaDateTime(detailRow.finishedAt) : "-"}</strong></div>
                  <div className="about-task-detail-kv"><span>总行数 / 成功 / 失败</span><strong>{detailRow.totalRows} / {Math.max(0, detailRow.doneRows - detailRow.failedRows)} / {detailRow.failedRows}</strong></div>
                </div>
              </section>

              <section className="about-task-detail-section">
                <div className="about-task-detail-section-head">
                  <h4>性能与成本</h4>
                </div>
                <div className="about-task-detail-grid">
                  <div className="about-task-detail-kv"><span>耗时</span><strong>{formatDuration(detailRow.elapsedMs)}</strong></div>
                  <div className="about-task-detail-kv"><span>Token</span><strong>{detailRow.totalTokensSum}</strong></div>
                  <div className="about-task-detail-kv"><span>费用</span><strong>{formatUsd(detailRow.estimatedCostUsdSum)}</strong></div>
                  <div className="about-task-detail-kv"><span>预估总Token</span><strong>{detailRow.predictedTotalTokens || "-"}</strong></div>
                  <div className="about-task-detail-kv"><span>预估总费用</span><strong>{formatUsd(detailRow.predictedCostUsd)}</strong></div>
                  <div className="about-task-detail-kv"><span>ETA</span><strong>{formatEta(detailRow.etaSeconds)}</strong></div>
                  <div className="about-task-detail-kv"><span>平均每行耗时</span><strong>{formatAverage(detailRow.elapsedMs, detailRow.doneRows || detailRow.totalRows, 0) === "-" ? "-" : `${formatAverage(detailRow.elapsedMs, detailRow.doneRows || detailRow.totalRows, 0)} ms`}</strong></div>
                  <div className="about-task-detail-kv"><span>平均每行Token</span><strong>{formatAverage(detailRow.totalTokensSum, detailRow.doneRows || detailRow.totalRows, 1)}</strong></div>
                  <div className="about-task-detail-kv"><span>平均每行成本</span><strong>{detailRow.totalRows ? formatUsd(Number(detailRow.estimatedCostUsdSum || 0) / Math.max(detailRow.doneRows || detailRow.totalRows, 1)) : "-"}</strong></div>
                </div>
              </section>

              {(detailRow.failedRows > 0 ||
                detailRow.initialFailedRows > 0 ||
                detailRow.recoveredRows > 0 ||
                detailRow.errorReason ||
                detailRow.failureReasonSummary ||
                detailFailureEntries.length > 0) && (
                <section className="about-task-detail-section">
                  <div className="about-task-detail-section-head">
                    <h4>稳定性诊断</h4>
                  </div>
                  <div className="about-task-detail-grid">
                    <div className="about-task-detail-kv"><span>首次失败数</span><strong>{detailRow.initialFailedRows || 0}</strong></div>
                    <div className="about-task-detail-kv"><span>挽回数</span><strong>{detailRow.recoveredRows || 0}</strong></div>
                    <div className="about-task-detail-kv"><span>最终失败数</span><strong>{detailRow.finalFailedRows || detailRow.failedRows || 0}</strong></div>
                    <div className="about-task-detail-kv"><span>是否失败行补跑</span><strong>{detailSummary?.hasFailedRowRetry ? "是" : "否"}</strong></div>
                    <div className="about-task-detail-kv"><span>补跑次数</span><strong>{detailSummary?.failedRowRetryCount ?? 0}</strong></div>
                    <div className="about-task-detail-kv"><span>最近补跑时间</span><strong>{detailSummary?.latestFailedRowRetryAt ? formatChinaDateTime(detailSummary.latestFailedRowRetryAt) : "-"}</strong></div>
                  </div>
                  {detailFailureEntries.length > 0 && (
                    <div className="about-task-detail-chip-grid">
                      {detailFailureEntries.map(([key, value]) => (
                        <span key={key} className="about-task-detail-chip">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  {detailRow.errorReason && (
                    <div className="history-field-group">
                      <div className="history-field-tab">任务级错误原因</div>
                      <div className="history-field-box">{detailRow.errorReason}</div>
                    </div>
                  )}
                  {detailRow.failureReasonSummary && (
                    <div className="history-field-group">
                      <div className="history-field-tab">失败原因摘要</div>
                      <div className="history-field-box">{detailRow.failureReasonSummary}</div>
                    </div>
                  )}
                </section>
              )}

              {detailSummary && (
                <section className="about-task-detail-section">
                  <div className="about-task-detail-section-head">
                    <h4>批次结果摘要</h4>
                  </div>
                  <div className="about-task-detail-grid">
                    <div className="about-task-detail-kv"><span>publishPassCount</span><strong>{detailSummary.publishPassCount ?? "-"}</strong></div>
                    <div className="about-task-detail-kv"><span>publishPassRate</span><strong>{formatPercent(detailSummary.publishPassRate, 1)}</strong></div>
                    <div className="about-task-detail-kv"><span>avgOnline</span><strong>{formatScore(detailSummary.avgOnline)}</strong></div>
                    <div className="about-task-detail-kv"><span>avgAi</span><strong>{formatScore(detailSummary.avgAi)}</strong></div>
                    <div className="about-task-detail-kv"><span>avgOp</span><strong>{formatScore(detailSummary.avgOp)}</strong></div>
                    <div className="about-task-detail-kv"><span>AI-线上提升</span><strong>{formatScore(detailSummary.aiOnlineLift)}</strong></div>
                    <div className="about-task-detail-kv"><span>OP-AI提升</span><strong>{formatScore(detailSummary.opAiLift)}</strong></div>
                    <div className="about-task-detail-kv"><span>hasFailedRowRetry</span><strong>{detailSummary.hasFailedRowRetry ? "true" : "false"}</strong></div>
                    <div className="about-task-detail-kv"><span>failedRowRetryCount</span><strong>{detailSummary.failedRowRetryCount ?? 0}</strong></div>
                  </div>
                </section>
              )}

              {detailResultQuery.error && (
                <div className="history-field-group">
                  <div className="history-field-tab">Batch Result Error</div>
                  <div className="history-field-box">{detailResultQuery.error.message}</div>
                </div>
              )}

              <div className="about-task-detail-actions">
                {(detailRow.status === "done" || detailRow.status === "failed" || detailRow.status === "cancelled") && (
                  <button className="btn-primary" type="button" onClick={() => void downloadBatchXlsx(detailRow.batchId)}>
                    下载结果
                  </button>
                )}
                {false && detailRow!.failedRows > 0 && (detailRow!.status === "done" || detailRow!.status === "failed" || detailRow!.status === "cancelled") && (
                  <button className="btn-ghost" type="button" onClick={() => void retryFailedRows(detailJobId)}>
                    重跑失败行
                  </button>
                )}
                {false && (detailRow!.status === "done" || detailRow!.status === "failed" || detailRow!.status === "cancelled") && (
                  <button className="btn-ghost" type="button" onClick={() => void retryWholeBatch(detailJobId)}>
                    整批重跑
                  </button>
                )}
                {(detailRow.status === "running" || detailRow.status === "pending") && (
                  <button className="btn-ghost" type="button" onClick={() => void cancelJob(detailRow.id)}>
                    取消任务
                  </button>
                )}
                <button className="btn-ghost" type="button" onClick={closeDetail}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {statusQuery.error && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>任务异常</h3>
          <p>{statusQuery.error.message}</p>
        </div>
      )}

      {batchJsonResult && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>批次汇总</h3>
          <pre>{JSON.stringify(batchJsonResult.summary, null, 2)}</pre>

          {Array.isArray(batchJsonResult.rows) && batchJsonResult.rows.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>本批明细（共 {batchJsonResult.rows.length} 条）</h3>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>TermID</th>
                    <th>Domain</th>
                    <th>Country</th>
                    <th>Online</th>
                    <th>AI</th>
                    <th>OP</th>
                    <th>最佳版本</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {batchJsonResult.rows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.termId}</td>
                      <td>{item.domain}</td>
                      <td>{item.country}</td>
                      <td>{item.scoreOnlineTotal}</td>
                      <td>{item.scoreAiTotal}</td>
                      <td>{item.scoreOpTotal ?? "-"}</td>
                      <td>{item.bestVersion}</td>
                      <td>{item.errorReason ? "失败" : "成功"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <button className="btn-ghost" type="button" onClick={() => void downloadBatchXlsx(batchId)}>
            下载本批结果
          </button>
        </div>
      )}
    </div>
  );
}
