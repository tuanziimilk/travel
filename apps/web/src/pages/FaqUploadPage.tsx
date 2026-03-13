import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

const faqUploadDemoCsv = [
  "TermID,TermName,Domain,Country,subclass,Q_online,A_online,Q_ai,A_ai,Q_op,A_op",
  '102472,Junkyard,junkyard.no,NO,"student discount","Do you offer student discount?","Student discount appears on campaign days.","Is there a student discount?","Yes, selected campaigns include student discount.","",""',
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
  return `${minutes}分 ${seconds}秒`;
}

function formatEta(seconds?: number | null) {
  const safe = Math.max(0, Number(seconds || 0));
  return formatDuration(safe * 1000);
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
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}***${value.slice(-6)}`;
}

export function FaqUploadPage() {
  const utils = trpc.useUtils();
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [outputMode, setOutputMode] = useState<"full" | "compact">("full");
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState("");
  const [jobId, setJobId] = useState("");
  const [queuePage, setQueuePage] = useState(1);
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
    { moduleId: "faq", page: queuePage, pageSize: queuePageSize },
    {
      refetchInterval: (query) => {
        const list = query.state.data?.rows ?? [];
        const hasRunning = list.some((item) => item.status === "pending" || item.status === "running");
        return hasRunning ? 1500 : 4000;
      },
    },
  );

  const resultQuery = trpc.batch.ingest.result.useQuery(
    { batchId, format: "json" },
    { enabled: Boolean(batchId && statusQuery.data?.status === "done") },
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

  async function toBase64(fileObj: File) {
    const buffer = await fileObj.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function runUpload() {
    if (!file) return;
    const created = await createBatch.mutateAsync({ moduleId: "faq", uploader, note, source: "upload", outputMode });
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

  async function downloadBatchXlsx(batchIdValue: string) {
    if (!batchIdValue) return;
    const response = await utils.client.batch.ingest.result.query({ batchId: batchIdValue, format: "xlsx" });
    const xlsxBase64 = "xlsxBase64" in response ? response.xlsxBase64 || "" : "";
    const binary = atob(xlsxBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `faq-batch-${batchIdValue}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const blob = new Blob([faqUploadDemoCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "faq-upload-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="faq-panel">
      <div className="section-header">
        <h2>FAQ 批量上传</h2>
        <p>模板字段为单行 subclass + Q + A，分别支持 online、ai、op 三组内容。</p>
      </div>

      <div className="card faq-card">
        <div className="grid">
          <div className="field">
            <label>上传人</label>
            <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
              <Select.Trigger className="select-trigger" aria-label="uploader-faq-upload">
                <Select.Value placeholder="选择上传人" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {uploaderOptions.map((name) => (
                      <Select.Item className="select-item" value={name} key={name}>
                        <Select.ItemText>{name}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="field">
            <label>批次备注（可选）</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：FAQ 新规则验证" />
          </div>

          <div className="field">
            <label>上传文件（.csv / .xlsx）</label>
            <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </div>

          <div className="field field-emphasis">
            <div className="field-emphasis-head">
              <label>评分输出模式</label>
              <span className="field-emphasis-badge">Token 策略</span>
            </div>
            <Select.Root value={outputMode} onValueChange={(value) => setOutputMode(value as "full" | "compact")}>
              <Select.Trigger className="select-trigger" aria-label="output-mode-faq-upload">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    <Select.Item className="select-item" value="full">
                      <Select.ItemText>完整模式：保留详细解释</Select.ItemText>
                    </Select.Item>
                    <Select.Item className="select-item" value="compact">
                      <Select.ItemText>紧凑模式：仅保留下载所需字段</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <p className="field-emphasis-tip">FAQ 批量评分也遵循同一套评分规则；紧凑模式仅缩减输出字段，不改变评分判断。</p>
          </div>

          <div className="upload-actions">
            <button className="btn-ghost" type="button" onClick={downloadTemplate}>
              下载 FAQ 模板
            </button>
            <button
              className="btn-primary faq-action-btn"
              type="button"
              onClick={runUpload}
              disabled={!file || createBatch.isPending || startIngest.isPending}
            >
              {createBatch.isPending || startIngest.isPending ? "处理中..." : "开始上传并评分"}
            </button>
          </div>

          {startIngest.error && (
            <div className="field">
              <p style={{ margin: 0, color: "#b00020", fontWeight: 900 }}>上传失败：{startIngest.error.message}</p>
            </div>
          )}
        </div>
      </div>

      {statusQuery.data && (
        <div className="card faq-card" style={{ marginTop: 16 }}>
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
              商家数：{statusQuery.data.merchantTotal || 0}，FAQ：{statusQuery.data.doneRows}/{statusQuery.data.totalRows}，失败 {statusQuery.data.failedRows}
            </span>
          </div>

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

          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p style={{ marginTop: 6 }}>{progressPercent}%</p>
          <button className="btn-ghost" type="button" onClick={() => void refreshProgress()}>
            刷新进度
          </button>
        </div>
      )}

      <div className="card faq-card" style={{ marginTop: 16 }}>
        <h3>FAQ 历史任务队列</h3>
        <table className="history-table queue-table faq-queue-table">
          <thead>
            <tr>
              <th>任务 ID</th>
              <th>状态</th>
              <th>商家数</th>
              <th>FAQ 进度</th>
              <th>ETA</th>
              <th>耗时</th>
              <th>Token</th>
              <th className="queue-col-reason">失败原因</th>
              <th>费用</th>
              <th>开始时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(queueQuery.data?.rows ?? []).map((item) => (
              <tr key={item.id}>
                <td title={item.id}>{formatJobId(item.id)}</td>
                <td>{queueStatusText[item.status] ?? item.status}</td>
                <td>{item.merchantTotal || 0}</td>
                <td>
                  {item.doneRows}/{item.totalRows}
                  {item.totalRows > 0 ? `（${Math.round((item.doneRows / item.totalRows) * 100)}%）` : ""}
                  {item.failedRows > 0 ? `，失败 ${item.failedRows}` : ""}
                </td>
                <td>{formatEta(item.etaSeconds)}</td>
                <td>{formatDuration(item.elapsedMs)}</td>
                <td>{item.totalTokensSum}</td>
                <td
                  className="queue-reason-cell"
                  title={item.errorReason || (item.failedRows > 0 ? "存在失败 FAQ，请下载结果查看失败原因列" : "")}
                >
                  {item.errorReason || (item.failedRows > 0 ? "存在失败 FAQ，请查看导出文件" : "-")}
                </td>
                <td>{formatUsd(item.estimatedCostUsdSum)}</td>
                <td>{new Date(item.startedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td>
                <td className="queue-action-cell">
                  {item.status === "running" || item.status === "pending" ? (
                    <button className="btn-ghost faq-queue-action-btn" type="button" onClick={() => void cancelJob(item.id)}>
                      取消
                    </button>
                  ) : item.status === "done" || item.status === "failed" || item.status === "cancelled" ? (
                    <button className="btn-ghost faq-queue-action-btn" type="button" onClick={() => void downloadBatchXlsx(item.batchId)}>
                      下载
                    </button>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {(queueQuery.data?.rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={11}>暂无任务</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="upload-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="btn-ghost" type="button" onClick={() => void queueQuery.refetch()}>
            刷新队列
          </button>
          <div className="upload-actions" style={{ gap: 8 }}>
            <button className="btn-ghost" type="button" disabled={queuePage <= 1} onClick={() => setQueuePage((value) => Math.max(1, value - 1))}>
              上一页
            </button>
            <span style={{ fontWeight: 900, minWidth: 72, textAlign: "center" }}>
              {queuePage}/{queueTotalPages}
            </span>
            <button
              className="btn-ghost"
              type="button"
              disabled={queuePage >= queueTotalPages}
              onClick={() => setQueuePage((value) => Math.min(queueTotalPages, value + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {resultQuery.data && "summary" in resultQuery.data && (
        <div className="card faq-card" style={{ marginTop: 16 }}>
          <h3>批次汇总</h3>
          <pre>{JSON.stringify(resultQuery.data.summary, null, 2)}</pre>
          <button className="btn-ghost" type="button" onClick={() => void downloadBatchXlsx(batchId)}>
            下载 FAQ 结果
          </button>
        </div>
      )}
    </div>
  );
}
