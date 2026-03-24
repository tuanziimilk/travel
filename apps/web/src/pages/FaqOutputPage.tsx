import * as Select from "@radix-ui/react-select";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { faqOutputUploadMaxFileBytes, faqOutputUploadMaxRows, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

type ParsedFaqOutputRow = {
  term_id: string;
  country: string;
  domain: string;
  term_name: string;
  fact_type: string;
  supported: string;
  status: string;
  discount_type: string;
  discount_value: string;
  currency: string;
  discount_details: string;
  url: string;
};

type RoutePreviewRow = {
  factType: string;
  count: number;
  skillLabel: string;
  skillKey: string;
  source: string;
  notes: string;
  status: string;
};

const faqOutputUploadLimitMb = Math.round(faqOutputUploadMaxFileBytes / 1024 / 1024);

const faqOutputTemplateCsv = [
  "term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url",
  "102472,NO,junkyard.no,Junkyard,gift_card,yes,active,other,,,Digital gavekort tilgjengelig,https://www.luminaire.fr/",
  "102472,NO,junkyard.no,Junkyard,student_discount,unknown,active,percent,10,,Studentrabatt krever verifisering,https://www.example.com/student",
].join("\n");

const queueStatusText: Record<string, string> = {
  pending: "排队中",
  running: "执行中",
  done: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function normalizeHeader(value: string) {
  return String(value || "").trim().toLowerCase();
}

function formatUsd(value?: number | string | null) {
  return `$${Number(value || 0).toFixed(6)}`;
}

function formatJobId(value: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function formatDuration(start?: string | Date | null, end?: string | Date | null) {
  if (!start || !end) return "-";
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "-";
  const totalSeconds = Math.round((endMs - startMs) / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours} 小时 ${remainMinutes} 分`;
}

function mapOutputRow(row: Record<string, unknown>): ParsedFaqOutputRow {
  const mapped = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) mapped.set(normalizeHeader(key), value);
  const pick = (key: string) => String(mapped.get(key) ?? "").trim();
  return {
    term_id: pick("term_id"),
    country: pick("country"),
    domain: pick("domain"),
    term_name: pick("term_name"),
    fact_type: pick("fact_type"),
    supported: pick("supported"),
    status: pick("status"),
    discount_type: pick("discount_type"),
    discount_value: pick("discount_value"),
    currency: pick("currency"),
    discount_details: pick("discount_details"),
    url: pick("url"),
  };
}

async function parseUploadFile(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return rows.map(mapOutputRow);
  }

  const text = await file.text();
  const workbook = XLSX.read(text, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.map(mapOutputRow);
}

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

function downloadBase64File(fileName: string, base64: string, mimeType = "application/octet-stream") {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getSummaryText(item: {
  executableRows: number;
  totalRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
}) {
  const processedRows = item.successRows + item.failedRows;
  const percent = item.executableRows > 0 ? Math.round((processedRows / item.executableRows) * 100) : 0;
  return `${processedRows}/${item.executableRows} 已处理（${percent}%），总计 ${item.totalRows}，跳过 ${item.skippedRows}`;
}

function getExecutionProgress(item: {
  executableRows: number;
  successRows: number;
  failedRows: number;
}) {
  const processedRows = item.successRows + item.failedRows;
  const percent = item.executableRows > 0 ? Math.min(100, Math.round((processedRows / item.executableRows) * 100)) : 0;
  return { processedRows, percent };
}

function safeValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

export function FaqOutputPage() {
  const scType = "faq" as const;
  const uploadInputId = "faq-output-file-input";
  const queuePageSize = 8;
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedFaqOutputRow[]>([]);
  const [error, setError] = useState("");
  const [resultNotice, setResultNotice] = useState("");
  const [currentJobId, setCurrentJobId] = useState("");
  const [routePreviewRows, setRoutePreviewRows] = useState<RoutePreviewRow[]>([]);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [queuePage, setQueuePage] = useState(1);
  const utils = trpc.useUtils();

  const queueQuery = trpc.generation.queue.useQuery(
    { scType, page: queuePage, pageSize: queuePageSize },
    { refetchInterval: 4000 },
  );

  const runMutation = trpc.generation.run.useMutation({
    onSuccess: async () => {
      await queueQuery.refetch();
    },
  });

  const statusQuery = trpc.generation.status.useQuery(
    { jobId: currentJobId },
    {
      enabled: Boolean(currentJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 1500;
        return status === "done" || status === "failed" || status === "cancelled" ? false : 1500;
      },
    },
  );

  const factTypeStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const factType = row.fact_type || "(empty)";
      counts.set(factType, (counts.get(factType) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([factType, count]) => ({ factType, count }))
      .sort((a, b) => b.count - a.count || a.factType.localeCompare(b.factType));
  }, [rows]);

  const routeSummary = useMemo(() => {
    const executableCount = routePreviewRows
      .filter((item) => item.status === "active")
      .reduce((sum, item) => sum + item.count, 0);
    return {
      factTypeCount: routePreviewRows.length,
      executableCount,
      skippedCount: Math.max(0, rows.length - executableCount),
      activeSkillCount: routePreviewRows.filter((item) => item.status === "active").length,
    };
  }, [routePreviewRows, rows.length]);

  const queueTotalPages = useMemo(() => {
    const total = queueQuery.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / queuePageSize));
  }, [queueQuery.data?.total]);

  const currentProgress = useMemo(() => {
    if (!statusQuery.data) return null;
    return getExecutionProgress(statusQuery.data);
  }, [statusQuery.data]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoutes() {
      if (!factTypeStats.length) {
        setRoutePreviewRows([]);
        return;
      }

      const next = await Promise.all(
        factTypeStats.slice(0, 50).map(async (item) => {
          const data = await utils.client.generation.resolveSkill.query({
            capability: "generation",
            scType,
            subclass: item.factType === "(empty)" ? "" : item.factType,
          });
          return {
            factType: item.factType,
            count: item.count,
            skillLabel: data.skillLabel,
            skillKey: data.skillKey,
            source: data.source,
            notes: data.notes,
            status: data.status,
          };
        }),
      );

      if (!cancelled) setRoutePreviewRows(next);
    }

    void loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [factTypeStats, scType, utils.client]);

  useEffect(() => {
    if (!statusQuery.data) return;

    if (statusQuery.data.status === "done") {
      setResultNotice(
        `任务已完成：可执行 ${statusQuery.data.executableRows} 行，成功 ${statusQuery.data.successRows} 行，失败 ${statusQuery.data.failedRows} 行，跳过 ${statusQuery.data.skippedRows} 行，累计 ${statusQuery.data.totalTokensSum} tokens，费用 ${formatUsd(statusQuery.data.estimatedCostUsdSum)}。`,
      );
      void queueQuery.refetch();
      return;
    }

    if (statusQuery.data.status === "failed") {
      setResultNotice(
        `任务已结束：成功 ${statusQuery.data.successRows} 行，失败 ${statusQuery.data.failedRows} 行，累计 ${statusQuery.data.totalTokensSum} tokens，费用 ${formatUsd(statusQuery.data.estimatedCostUsdSum)}。`,
      );
      void queueQuery.refetch();
    }
  }, [queueQuery, statusQuery.data]);

  async function handleFileChange(nextFile: File | null) {
    setError("");
    setResultNotice("");

    if (!nextFile) {
      setRows([]);
      setFileName("");
      setSelectedFile(null);
      return;
    }

    try {
      const parsed = await parseUploadFile(nextFile);
      setRows(parsed);
      setFileName(nextFile.name);
      setSelectedFile(nextFile);
    } catch (err) {
      setRows([]);
      setFileName("");
      setSelectedFile(null);
      setError(err instanceof Error ? err.message : "文件解析失败");
    }
  }

  function downloadTemplate() {
    const blob = new Blob([faqOutputTemplateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "faq-output-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadJobResult(jobId: string) {
    const data = await utils.client.generation.result.query({ jobId });
    if (!data.xlsxBase64) return;
    downloadBase64File(data.fileName, data.xlsxBase64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function runGeneration() {
    if (!selectedFile) {
      setError("请先上传 FAQ 输出源表。");
      return;
    }

    setError("");
    setResultNotice("");

    try {
      const fileBase64 = await toBase64(selectedFile);
      const data = await runMutation.mutateAsync({
        scType,
        uploader,
        note,
        fileName: selectedFile.name,
        fileBase64,
      });
      setCurrentJobId(data.jobId);
      setResultNotice(`任务已创建，正在后台执行，任务 ID：${data.jobId}`);
      setQueuePage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ 输出生成失败");
    }
  }

  return (
    <div className="grid faq-output-page">
      <section className="section-header faq-output-header faq-poster-header">
        <h2>FAQ 输出</h2>
        <p>
          上传源表后，系统会按 <code>fact_type</code> 自动匹配并执行对应 subclass skill，同一个文件里可以同时包含多个 subclass。
        </p>
      </section>

      <div className="card output-layout-card faq-output-main-card faq-poster-card">
        <div className="output-config-grid output-config-grid-simple">
          <div className="field">
            <label>输出人</label>
            <Select.Root value={uploader} onValueChange={(value) => setUploader(value as (typeof uploaderOptions)[number])}>
              <Select.Trigger className="select-trigger faq-poster-trigger" aria-label="faq-output-uploader">
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
            <label>批次备注</label>
            <input className="faq-poster-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：FAQ 输出首轮生成" />
          </div>
        </div>

        <div className="output-upload-bar">
          <div className="field faq-output-upload-field" style={{ margin: 0 }}>
            <div className="faq-output-upload-head">
              <label>上传 FAQ 输出源表</label>
              <button className="btn-ghost output-template-btn faq-poster-btn-small" type="button" onClick={downloadTemplate}>
                下载模板
              </button>
            </div>
            <label className="output-dropzone faq-output-dropzone" htmlFor={uploadInputId} title={fileName || "点击或拖拽文件到此处上传"}>
              <span className="output-dropzone-copy">
                <strong>{fileName || "点击或拖拽文件到此处上传"}</strong>
                <span>支持 `.csv` 和 `.xlsx`，系统会读取首个工作表</span>
              </span>
            </label>
            <input
              id={uploadInputId}
              className="output-file-input"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
            />
            <div className="upload-limit-banner" role="note">
              <span className="upload-limit-banner-kicker">上传上限</span>
              <p>建议不超过 {faqOutputUploadLimitMb}MB / 约 {faqOutputUploadMaxRows} 条，超过将直接拦截。</p>
            </div>
          </div>
        </div>

        <div className="output-status-row faq-output-status-row">
          <div className="output-status-chip" title={fileName || "未上传"}>
            <span>当前文件</span>
            <strong>{fileName || "未上传"}</strong>
          </div>
          <div className="output-status-chip">
            <span>识别行数</span>
            <strong>{rows.length}</strong>
          </div>
          <div className="output-status-chip">
            <span>可执行行数</span>
            <strong>{routeSummary.executableCount}</strong>
          </div>
        </div>

        <p className="muted output-muted-note output-warning-note faq-output-warning">
          系统会先按 <code>fact_type</code> 预览路由，命中已接入的 skill 才会执行生成，未接入或占位路由会自动跳过。
        </p>
        {error ? <p className="error-text">{error}</p> : null}
        {resultNotice ? <p className="output-success-text">{resultNotice}</p> : null}

        {statusQuery.data ? (
          <div className="progress-group faq-output-progress-panel">
            <div className="progress-label">
              <span>
                当前任务：{queueStatusText[statusQuery.data.status] ?? statusQuery.data.status} / {currentProgress?.processedRows ?? 0}/
                {statusQuery.data.executableRows} 已处理
              </span>
              <strong>{currentProgress?.percent ?? 0}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${currentProgress?.percent ?? 0}%` }} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              成功 {statusQuery.data.successRows}，失败 {statusQuery.data.failedRows}，跳过 {statusQuery.data.skippedRows}，总行数 {statusQuery.data.totalRows}
            </p>
          </div>
        ) : null}

        <div className="upload-actions faq-output-primary-action">
          <button
            className="btn-primary"
            type="button"
            disabled={!selectedFile || runMutation.isPending || routeSummary.executableCount === 0}
            onClick={() => void runGeneration()}
          >
            {runMutation.isPending ? "生成中..." : "开始生成"}
          </button>
        </div>
      </div>

      <div className="card faq-output-summary-card faq-poster-card faq-poster-card-tight">
        <div className="output-summary-head">
          <div>
            <h3>路由摘要</h3>
            <p className="muted output-summary-copy">
              {routePreviewRows.length
                ? `识别到 ${routeSummary.factTypeCount} 种 fact_type，可执行 ${routeSummary.executableCount} 行，将跳过 ${routeSummary.skippedCount} 行。`
                : "上传文件后，这里会告诉你哪些 fact_type 已接入真实执行，哪些会被跳过。"}
            </p>
          </div>
          <button className="btn-ghost output-inline-btn faq-poster-btn-small" type="button" onClick={() => setShowRouteDetails((prev) => !prev)}>
            {showRouteDetails ? "收起明细" : "查看明细"}
          </button>
        </div>

        <div className="output-route-kpis faq-output-kpis">
          <div className="output-route-kpi">
            <span>fact_type</span>
            <strong>{routeSummary.factTypeCount}</strong>
          </div>
          <div className="output-route-kpi">
            <span>可执行</span>
            <strong>{routeSummary.executableCount}</strong>
          </div>
          <div className="output-route-kpi">
            <span>将跳过</span>
            <strong>{routeSummary.skippedCount}</strong>
          </div>
          <div className="output-route-kpi">
            <span>真实 skill</span>
            <strong>{routeSummary.activeSkillCount}</strong>
          </div>
        </div>

        {showRouteDetails ? (
          <div className="table-scroll faq-output-table-scroll">
            <table className="history-table output-route-detail-table">
              <thead>
                <tr>
                  <th>fact_type</th>
                  <th>行数</th>
                  <th>命中 skill</th>
                  <th>skill key</th>
                  <th>来源</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {routePreviewRows.map((item) => (
                  <tr key={item.factType}>
                    <td title={item.factType}>{item.factType}</td>
                    <td>{item.count}</td>
                    <td title={item.skillLabel}>{item.skillLabel}</td>
                    <td title={item.skillKey}>{item.skillKey}</td>
                    <td title={item.source}>{item.source}</td>
                    <td title={item.notes}>{item.notes}</td>
                  </tr>
                ))}
                {!routePreviewRows.length ? (
                  <tr>
                    <td colSpan={6}>当前还没有可展示的路由明细。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card faq-output-summary-card faq-poster-card faq-poster-card-tight">
        <div className="output-summary-head">
          <div>
            <h3>任务队列</h3>
            <p className="muted output-summary-copy">保留 FAQ 输出任务的状态、执行摘要、token、费用、耗时和结果下载。</p>
          </div>
          <button className="btn-ghost output-inline-btn faq-poster-btn-small" type="button" onClick={() => void queueQuery.refetch()}>
            刷新队列
          </button>
        </div>

        <div className="table-scroll faq-output-table-scroll">
          <table className="history-table queue-table faq-queue-table">
            <thead>
              <tr>
                <th>任务 ID</th>
                <th>状态</th>
                <th>输出人</th>
                <th>批次备注</th>
                <th>执行摘要</th>
                <th>Token</th>
                <th>费用</th>
                <th>耗时</th>
                <th>开始时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(queueQuery.data?.rows ?? []).map((item) => {
                const hasResult = Boolean(item.resultFileName);
                const itemProgress = getExecutionProgress(item);
                return (
                  <tr key={item.id}>
                    <td title={item.id}>{formatJobId(item.id)}</td>
                    <td>
                      <span className={`status-light status-${item.status}`}>
                        <span className="status-light-dot" />
                        <span>{queueStatusText[item.status] ?? item.status}</span>
                      </span>
                    </td>
                    <td title={item.uploader}>{item.uploader}</td>
                    <td title={safeValue(item.note)}>{safeValue(item.note)}</td>
                    <td title={item.errorReason || getSummaryText(item)}>
                      <div>{getSummaryText(item)}</div>
                      {(item.status === "running" || item.status === "pending") && item.executableRows > 0 ? (
                        <div className="progress-track faq-queue-inline-progress">
                          <div className="progress-fill" style={{ width: `${itemProgress.percent}%` }} />
                        </div>
                      ) : null}
                    </td>
                    <td title={String(item.totalTokensSum)}>{item.totalTokensSum}</td>
                    <td title={formatUsd(item.estimatedCostUsdSum)}>{formatUsd(item.estimatedCostUsdSum)}</td>
                    <td title={formatDuration(item.startedAt || item.createdAt, item.finishedAt)}>
                      {formatDuration(item.startedAt || item.createdAt, item.finishedAt)}
                    </td>
                    <td title={formatDateTime(item.startedAt || item.createdAt)}>{formatDateTime(item.startedAt || item.createdAt)}</td>
                    <td className="queue-action-cell">
                      <div className="queue-action-group">
                        <button
                          className="btn-ghost faq-queue-action-btn"
                          type="button"
                          disabled={!hasResult}
                          onClick={() => void downloadJobResult(item.id)}
                        >
                          下载
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(queueQuery.data?.rows?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={10}>暂无 FAQ 输出任务。</td>
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
