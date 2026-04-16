import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import {
  translationDefaultTargetLanguage,
  translationUploadMaxFileBytes,
  translationUploadMaxRows,
  uploaderOptions,
} from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";
import { createGlobalDownloadTask, useDownloadCenter } from "../components/DownloadCenter";

const uploadLimitMb = Math.round(translationUploadMaxFileBytes / 1024 / 1024);

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const commaIndex = raw.indexOf(",");
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
    };
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function formatUsd(value?: number | string | null) {
  return `$${Number(value || 0).toFixed(6)}`;
}

function formatJobId(value: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) return "-";
  const start = new Date(startedAt);
  const end = finishedAt ? new Date(finishedAt) : new Date();
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "-";
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getDisplayedTranslationCost(item: {
  status: string;
  estimatedCostUsdSum: number;
  predictedCostUsd: number;
}) {
  const actual = Number(item.estimatedCostUsdSum || 0);
  const predicted = Number(item.predictedCostUsd || 0);
  if (item.status === "failed" || item.status === "cancelled") return actual;
  if (item.status === "done" || item.status === "partial_failed") return actual;
  return actual > 0 ? actual : predicted;
}

function formatTranslationQueueSummary(item: {
  processedRows: number;
  totalRows: number;
  successRows: number;
  failedRows: number;
  mixedRows: number;
}) {
  return `${item.processedRows}/${item.totalRows}，成功${item.successRows}，失败${item.failedRows}，混合${item.mixedRows}`;
}

const queueStatusText: Record<string, string> = {
  queued: "排队中",
  preparing: "准备中",
  submitted: "已提交 Batch",
  running: "处理中",
  done: "已完成",
  partial_failed: "部分失败",
  failed: "失败",
  cancelled: "已取消",
};

const executionModeText: Record<string, string> = {
  batch: "低成本 Batch",
  realtime: "快速实时",
};

export function TranslationBatchPage() {
  const queuePageSize = 8;
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [detectLanguage, setDetectLanguage] = useState(false);
  const [currentJobId, setCurrentJobId] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const downloadCenter = useDownloadCenter();

  const previewMutation = trpc.translation.previewColumns.useMutation();
  const runMutation = trpc.translation.runBatch.useMutation({
    onSuccess: async () => {
      await queueQuery.refetch();
    },
  });

  const queueQuery = trpc.translation.queue.useQuery(
    { page: queuePage, pageSize: queuePageSize },
    { refetchInterval: 4000 },
  );

  const statusQuery = trpc.translation.status.useQuery(
    { jobId: currentJobId },
    {
      enabled: Boolean(currentJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 1500;
        return status === "done" || status === "partial_failed" || status === "failed" ? false : 1500;
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

  const selectedColumnCount = selectedColumns.length;
  const summaryText = selectedColumnCount
    ? `本次将翻译 ${selectedColumnCount} 列，目标语言为简体中文，系统会自动选择低成本模式`
    : "请先选择需要翻译的文本列";

  const primaryActionLabel = !selectedFile
    ? "上传文件后继续"
    : !selectedColumns.length
      ? "请选择待翻译列"
      : runMutation.isPending
        ? "正在创建任务..."
        : "开始批量翻译";

  async function handleFileChange(nextFile: File | null) {
    setError("");
    setNotice("");
    setSelectedColumns([]);
    setSelectedFile(nextFile);
    if (!nextFile) return;
    if (nextFile.size > translationUploadMaxFileBytes) {
      setError(`上传文件不能超过 ${uploadLimitMb}MB。`);
      setSelectedFile(null);
      return;
    }
    try {
      const fileBase64 = await toBase64(nextFile);
      await previewMutation.mutateAsync({ fileName: nextFile.name, fileBase64 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件解析失败");
      setSelectedFile(null);
    }
  }

  async function runTranslation() {
    if (!selectedFile) {
      setError("请先上传文件。");
      return;
    }
    if (!selectedColumns.length) {
      setError("请至少选择一列待翻译列。");
      return;
    }
    setError("");
    setNotice("");
    try {
      const fileBase64 = await toBase64(selectedFile);
      const result = await runMutation.mutateAsync({
        uploader,
        note,
        fileName: selectedFile.name,
        fileBase64,
        targetLanguage: translationDefaultTargetLanguage,
        selectedColumns,
        detectLanguage,
      });
      setCurrentJobId(result.jobId);
      setQueuePage(1);
      setNotice(
        `任务已创建，任务 ID：${result.jobId}，执行模式：${executionModeText[result.executionMode] ?? result.executionMode}，预计费用 ${formatUsd(result.predictedCostUsd)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量翻译失败");
    }
  }

  async function downloadJobResult(jobId: string) {
    await downloadCenter.createDownloadTask({
      toolType: "translation",
      sourceLabel: "批量翻译结果",
      create: () => createGlobalDownloadTask({ kind: "translation-batch", jobId }),
    });
  }

  function toggleColumn(column: string) {
    setSelectedColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
    );
  }

  function selectAllColumns() {
    if (!previewData) return;
    setSelectedColumns(previewData.columns.map((item) => item.name));
  }

  function clearColumns() {
    setSelectedColumns([]);
  }

  return (
    <div className="grid translation-page">
      <section className="section-header">
        <h2>批量翻译</h2>
        <p>上传文件后依次完成选列和创建任务，系统会在低成本 Batch 与快速实时之间自动切换，统一翻译为简体中文。</p>
      </section>

      <div className="card translation-main-card">
        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">1</span>
            <div>
              <h3>上传文件</h3>
              <p className="muted">支持 `.csv` 和 `.xlsx`，系统会读取首个工作表。</p>
            </div>
          </div>

          <div className="field">
            <input type="file" accept=".csv,.xlsx" onChange={(event) => void handleFileChange(event.target.files?.[0] || null)} />
            <div className="upload-limit-banner" role="note">
              <span className="upload-limit-banner-kicker">上传上限</span>
              <p>建议不超过 {uploadLimitMb}MB / 约 {translationUploadMaxRows} 行，超过后请拆分文件。</p>
            </div>
          </div>

          {selectedFile && previewData ? (
            <div className="translation-current-file-card">
              <div className="output-status-chip">
                <span>当前文件</span>
                <strong>{selectedFile.name}</strong>
              </div>
              <div className="output-status-chip">
                <span>总行数</span>
                <strong>{previewData.totalRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>可选列数</span>
                <strong>{previewData.columns.length}</strong>
              </div>
            </div>
          ) : null}
        </div>

        {previewData ? (
          <div className="translation-step-card">
            <div className="translation-step-head">
              <span className="translation-step-index">2</span>
              <div>
                <h3>选择待翻译列</h3>
                <p className="muted">根据示例值快速判断哪些列需要进入翻译流程。</p>
              </div>
            </div>

            <div className="translation-inline-actions">
              <button className="btn-ghost output-inline-btn" type="button" onClick={selectAllColumns}>
                全选文本列
              </button>
              <button className="btn-ghost output-inline-btn" type="button" onClick={clearColumns}>
                清空选择
              </button>
            </div>

            <div className="translation-column-list">
              {previewData.columns.map((column) => (
                <label className="translation-column-item" key={column.name}>
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.name)}
                    onChange={() => toggleColumn(column.name)}
                  />
                  <span>
                    <strong>{column.name}</strong>
                    <span>{column.sampleValues.join(" / ") || "无示例值"}</span>
                    <span className="translation-column-meta">示例条数：{column.sampleValues.length}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="translation-rule-banner">结果文件默认只新增 `__translated` 列；开启语言检测后才会额外输出 `__detected_langs_summary`。</div>
          </div>
        ) : null}

        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">3</span>
            <div>
              <h3>目标语言与任务信息</h3>
              <p className="muted">首期固定翻译为简体中文；上传人和任务备注默认全部可见。</p>
            </div>
          </div>

          <div className="translation-language-picker">
            <input value={translationDefaultTargetLanguage} readOnly />
          </div>

          <div className="translation-advanced-grid">
            <div className="field">
              <label>上传人</label>
              <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
                <Select.Trigger className="select-trigger" aria-label="translation-batch-uploader">
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
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：4 月欧语市场活动翻译" />
            </div>
            <label className="translation-inline-toggle">
              <input
                type="checkbox"
                checked={detectLanguage}
                onChange={(event) => setDetectLanguage(event.target.checked)}
              />
              <span>
                <strong>输出语言检测列</strong>
                <span>默认关闭；开启后才会在结果文件中附加 `__detected_langs_summary`。</span>
              </span>
            </label>
          </div>
        </div>

        <div className="translation-step-card">
          <div className="translation-step-head">
            <span className="translation-step-index">4</span>
            <div>
              <h3>开始翻译</h3>
              <p className="muted">{summaryText}</p>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {notice ? <p className="output-success-text">{notice}</p> : null}

          <div className="translation-action-bar">
            <span className="translation-action-summary">{summaryText}</span>
            <button
              className="btn-primary translation-primary-btn"
              type="button"
              disabled={!selectedFile || !selectedColumns.length || runMutation.isPending || previewMutation.isPending}
              onClick={() => void runTranslation()}
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>

      {currentStatus ? (
        <div className="card">
          <div className="output-summary-head">
            <div>
              <h3>当前任务</h3>
              <p className="muted">
                已处理 {currentStatus.processedRows}/{currentStatus.totalRows} 行，检测到 {currentStatus.languageSummary.topLanguages.length} 种语言，
                疑似混合语种 {currentStatus.mixedRows} 行。
              </p>
            </div>
            {(currentStatus.status === "done" || currentStatus.status === "partial_failed" || currentStatus.status === "failed") && currentJobId ? (
              <button className="btn-primary output-inline-btn" type="button" onClick={() => void downloadJobResult(currentJobId)}>
                下载当前结果
              </button>
            ) : null}
          </div>

          <div className="progress-group">
            <div className="progress-label">
              <span>
                状态：{queueStatusText[currentStatus.status] ?? currentStatus.status} / {currentStatus.processedRows}/{currentStatus.totalRows}
              </span>
              <strong>{currentStatus.totalRows > 0 ? Math.round((currentStatus.processedRows / currentStatus.totalRows) * 100) : 0}%</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${currentStatus.totalRows > 0 ? Math.round((currentStatus.processedRows / currentStatus.totalRows) * 100) : 0}%` }}
              />
            </div>
            <div className="translation-summary-grid">
              <div className="output-status-chip">
                <span>执行模式</span>
                <strong>{executionModeText[currentStatus.executionMode] ?? currentStatus.executionMode}</strong>
              </div>
              <div className="output-status-chip">
                <span>预计费用</span>
                <strong>{formatUsd(currentStatus.predictedCostUsd)}</strong>
              </div>
              <div className="output-status-chip">
                <span>实际费用</span>
                <strong>{formatUsd(currentStatus.estimatedCostUsdSum)}</strong>
              </div>
              <div className="output-status-chip">
                <span>成功行数</span>
                <strong>{currentStatus.successRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>失败行数</span>
                <strong>{currentStatus.failedRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>混合语种行数</span>
                <strong>{currentStatus.mixedRows}</strong>
              </div>
              <div className="output-status-chip">
                <span>检测语言</span>
                <strong>{currentStatus.languageSummary.topLanguages.map((item) => item.language).join(", ") || "-"}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="output-summary-head">
          <div>
            <h3>最近 7 天任务</h3>
            <p className="muted">保留最近一周翻译任务，可快速查看处理情况并下载结果。</p>
          </div>
          <button className="btn-ghost output-inline-btn" type="button" onClick={() => void queueQuery.refetch()}>
            刷新列表
          </button>
        </div>

        <div className="table-scroll faq-output-table-scroll translation-queue-scroll">
          <table className="history-table queue-table translation-queue-table">
            <thead>
              <tr>
                <th>上传人</th>
                <th>任务 ID</th>
                <th>状态</th>
                <th>执行模式</th>
                <th>处理摘要</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>成本</th>
                <th>下载</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((item) => (
                <tr key={item.id}>
                  <td title={item.note || ""}>{item.uploader || "-"}</td>
                  <td
                    title={`列：${item.selectedColumns.join(", ") || "-"}\n预测 token：${item.predictedTotalTokens}\n预计费用：${formatUsd(item.predictedCostUsd)}\n实际费用：${formatUsd(item.estimatedCostUsdSum)}`}
                  >
                    {formatJobId(item.id)}
                  </td>
                  <td>{queueStatusText[item.status] ?? item.status}</td>
                  <td title={item.providerBatchId || ""}>{executionModeText[item.executionMode] ?? item.executionMode}</td>
                  <td title={item.errorReason || `列：${item.selectedColumns.join(", ") || "-"}`}>
                    {item.processedRows}/{item.totalRows}，成功 {item.successRows}，失败 {item.failedRows}，混合 {item.mixedRows}
                  </td>
                  <td>{formatChinaDateTime(item.startedAt || item.createdAt)}</td>
                  <td>{formatDuration(item.startedAt || item.createdAt, item.finishedAt)}</td>
                  <td title={`预计 ${formatUsd(item.predictedCostUsd)} / 实际 ${formatUsd(item.estimatedCostUsdSum)}`}>
                    {formatUsd(getDisplayedTranslationCost(item))}
                  </td>
                  <td className="queue-action-cell">
                    <button
                      className="btn-ghost faq-queue-action-btn"
                      type="button"
                      disabled={!item.resultFileName}
                      onClick={() => void downloadJobResult(item.id)}
                    >
                      下载
                    </button>
                  </td>
                </tr>
              ))}
              {(queueQuery.data?.rows?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8}>最近 7 天暂无翻译任务。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="upload-actions faq-pagination-row">
          <span className="muted">共 {queueQuery.data?.total ?? 0} 条任务</span>
          <div className="upload-actions" style={{ gap: 8 }}>
            <button className="btn-ghost" type="button" disabled={queuePage <= 1} onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}>
              上一页
            </button>
            <span className="faq-pagination-indicator">
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
    </div>
  );
}
