import * as Select from "@radix-ui/react-select";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { faqOutputUploadMaxFileBytes, faqOutputUploadMaxRows, uploaderOptions } from "@about-demo/trpc";
import { trpc, trpcClient } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";

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

type RoutePreviewCacheEntry = Omit<RoutePreviewRow, "count" | "factType">;

type QueueRow = {
  id: string;
  status: string;
  uploader: string;
  note: string;
  totalRows: number;
  executableRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  totalTokensSum: number;
  estimatedCostUsdSum: number;
  errorReason: string;
  resultFileName?: string;
  resultFilePath?: string;
  canDownload?: boolean;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

const faqOutputUploadLimitMb = Math.round(faqOutputUploadMaxFileBytes / 1024 / 1024);
const faqOutputApiBase = (() => {
  const trpcUrl = import.meta.env.VITE_TRPC_URL || "/trpc";
  if (/^https?:\/\//i.test(trpcUrl)) {
    try {
      return new URL(trpcUrl).origin;
    } catch {
      return trpcUrl.replace(/\/trpc\/?$/, "");
    }
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return trpcUrl.replace(/\/trpc\/?$/, "");
})();

const faqOutputTemplateCsv = [
  "term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url",
  "102472,NO,junkyard.no,Junkyard,gift_card,yes,active,other,,,Digital gavekort tilgjengelig,https://www.luminaire.fr/",
  "102472,NO,junkyard.no,Junkyard,student_discount,unknown,active,percent,10,,Studentrabatt krever verifisering,https://www.example.com/student",
].join("\n");

const queueStatusText: Record<string, string> = {
  queued: "???",
  pending: "???",
  running: "???",
  done: "???",
  partial_failed: "????",
  failed: "??",
  cancelled: "???",
};

function normalizeHeader(value: string) {
  return String(value || "").trim().toLowerCase();
}

function formatUsd(value?: number | string | null) {
  return `$${Number(value || 0).toFixed(6)}`;
}

function formatDateTime(value?: string | Date | null) {
  return formatChinaDateTime(value);
}

function formatJobId(value: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function safeValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function getReadableFaqOutputError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const details = error as { data?: { httpStatus?: number } } | undefined;
  const httpStatus = details?.data?.httpStatus;

  if (httpStatus === 413 || /\b413\b/.test(message)) {
    return `????????? FAQ ????? ${faqOutputUploadLimitMb}MB ????????????`;
  }
  if (/Unexpected token '<'|not valid JSON|<html/i.test(message)) {
    return "????? HTML ????? JSON?????????????????????????";
  }
  return message || "FAQ ??????";
}

function getDisplayJobStatus(item: {
  status: string;
  startedAt?: string | Date | null;
  successRows: number;
  failedRows: number;
}) {
  if (item.status === "failed" && item.failedRows > 0 && item.successRows > 0) {
    return "partial_failed";
  }
  if (item.status === "done" || item.status === "failed" || item.status === "cancelled" || item.status === "running") {
    return item.status;
  }
  const processedRows = Number(item.successRows || 0) + Number(item.failedRows || 0);
  if ((item.status === "queued" || item.status === "pending") && (processedRows > 0 || Boolean(item.startedAt))) {
    return "running";
  }
  return item.status;
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

function getCompactSummaryText(item: {
  executableRows: number;
  totalRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
}) {
  const { processedRows, percent } = getExecutionProgress(item);
  return `${processedRows}/${item.executableRows} (${percent}%)，跳过 ${item.skippedRows}，总计 ${item.totalRows}`;
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
  for (const [key, value] of Object.entries(row)) {
    mapped.set(normalizeHeader(key), value);
  }
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

function triggerBrowserDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadFileFromResponse(response: Response, fallbackFileName: string) {
  if (!response.ok) {
    let message = `Download failed with status ${response.status}.`;
    const contentType = response.headers.get("Content-Type") || "";
    if (response.status === 413) {
      throw new Error("下载请求过大，已被网关拦截，请稍后重试。");
    }
    if (/text\/html/i.test(contentType)) {
      throw new Error("下载接口返回了 HTML 页面而不是文件，请检查 API 和网关代理配置。");
    }
    try {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (/text\/html/i.test(contentType)) {
    throw new Error("下载接口返回了页面内容，结果文件没有从 API 正确返回，请刷新后重试。");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainNameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const fileName = encodedNameMatch?.[1]
    ? decodeURIComponent(encodedNameMatch[1])
    : plainNameMatch?.[1] || fallbackFileName;
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useSlowHint(active: boolean, delayMs = 3000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibilityChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return visible;
}

export function FaqOutputPage() {
  const scType = "faq" as const;
  const uploadInputId = "faq-output-file-input";
  const queuePageSize = 20;
  const isPageVisible = usePageVisible();
  const [uploader, setUploader] = useState<(typeof uploaderOptions)[number]>("Ella");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [rows, setRows] = useState<ParsedFaqOutputRow[]>([]);
  const [error, setError] = useState("");
  const [resultNotice, setResultNotice] = useState("");
  const [currentJobId, setCurrentJobId] = useState("");
  const [downloadingJobId, setDownloadingJobId] = useState("");
  const [routePreviewRows, setRoutePreviewRows] = useState<RoutePreviewRow[]>([]);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [queuePage, setQueuePage] = useState(1);
  const [lastQueueTotal, setLastQueueTotal] = useState(0);
  const [routePreviewPendingCount, setRoutePreviewPendingCount] = useState(0);
  const routeCacheRef = useRef(new Map<string, RoutePreviewCacheEntry>());

  const queueQuery = trpc.generation.queue.useQuery(
    { scType, page: queuePage, pageSize: queuePageSize },
    {
      placeholderData: (previousData) => previousData,
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        if (!isPageVisible) return false;
        const list = (query.state.data?.rows ?? []) as QueueRow[];
        const hasActive = list.some((item) => {
          const displayStatus = getDisplayJobStatus(item);
          return displayStatus === "queued" || displayStatus === "pending" || displayStatus === "running";
        });
        return hasActive ? 2000 : 8000;
      },
    },
  );

  const runMutation = trpc.generation.run.useMutation({
    onSuccess: async () => {
      await queueQuery.refetch();
    },
  });

  const statusQuery = trpc.generation.status.useQuery(
    { jobId: currentJobId },
    {
      enabled: Boolean(currentJobId) && isPageVisible,
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        if (!isPageVisible) return false;
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

  useEffect(() => {
    let cancelled = false;
    const orderedFactTypes = factTypeStats.map((item) => item.factType);
    const buildRows = () => {
      const nextRows = factTypeStats
        .map((item) => {
          const cached = routeCacheRef.current.get(item.factType);
          if (!cached) return null;
          return {
            factType: item.factType,
            count: item.count,
            ...cached,
          } satisfies RoutePreviewRow;
        })
        .filter(Boolean) as RoutePreviewRow[];
      setRoutePreviewRows(nextRows);
    };

    if (!orderedFactTypes.length) {
      setRoutePreviewRows([]);
      setRoutePreviewPendingCount(0);
      return undefined;
    }

    buildRows();
    const unresolved = orderedFactTypes.filter((factType) => !routeCacheRef.current.has(factType));
    setRoutePreviewPendingCount(unresolved.length);
    if (!unresolved.length) return undefined;

    const batchSize = showRouteDetails ? 12 : 6;
    const loadBatch = async (startIndex: number) => {
      const batch = unresolved.slice(startIndex, startIndex + batchSize);
      if (!batch.length || cancelled) return;
      let resolved: Array<RoutePreviewCacheEntry & { factType: string }> = [];
      try {
        resolved = await Promise.all(
          batch.map(async (factType) => {
            const data = await trpcClient.generation.resolveSkill.query({
              capability: "generation",
              scType,
              subclass: factType === "(empty)" ? "" : factType,
            });
            return {
              factType,
              skillLabel: data.skillLabel,
              skillKey: data.skillKey,
              source: data.source,
              notes: data.notes,
              status: data.status,
            };
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError(getReadableFaqOutputError(err));
          setRoutePreviewPendingCount(0);
        }
        return;
      }

      if (cancelled) return;
      for (const item of resolved) {
        routeCacheRef.current.set(item.factType, {
          skillLabel: item.skillLabel,
          skillKey: item.skillKey,
          source: item.source,
          notes: item.notes,
          status: item.status,
        });
      }
      buildRows();
      const remaining = Math.max(0, unresolved.length - (startIndex + batch.length));
      setRoutePreviewPendingCount(remaining);
      if (remaining > 0) {
        window.setTimeout(() => {
          void loadBatch(startIndex + batch.length);
        }, showRouteDetails ? 0 : 160);
      }
    };

    void loadBatch(0);
    return () => {
      cancelled = true;
    };
  }, [factTypeStats, scType, showRouteDetails]);

  const routeSummary = useMemo(() => {
    const executableCount = routePreviewRows
      .filter((item) => item.status === "active")
      .reduce((sum, item) => sum + item.count, 0);
    return {
      factTypeCount: factTypeStats.length,
      executableCount,
      skippedCount: Math.max(0, rows.length - executableCount),
      activeSkillCount: routePreviewRows.filter((item) => item.status === "active").length,
    };
  }, [factTypeStats.length, routePreviewRows, rows.length]);

  const queueRows = (queueQuery.data?.rows ?? []) as QueueRow[];
  const queueHasMore = Boolean((queueQuery.data as { hasMore?: boolean } | undefined)?.hasMore);
  const queueTotalIsEstimated = Boolean((queueQuery.data as { totalIsEstimated?: boolean } | undefined)?.totalIsEstimated);
  const queueKnownTotal = queueQuery.data?.total ?? lastQueueTotal;
  const queueTotalPages = useMemo(() => {
    if (queueKnownTotal > 0) return Math.max(1, Math.ceil(queueKnownTotal / queuePageSize));
    return Math.max(1, queuePage + (queueHasMore ? 1 : 0));
  }, [queueHasMore, queueKnownTotal, queuePage, queuePageSize]);

  const isQueueInitialLoading = queueQuery.isLoading && !queueQuery.data;
  const isQueueRefreshing = queueQuery.isFetching && !!queueQuery.data;
  const queueSlow = useSlowHint(isQueueInitialLoading || isQueueRefreshing);

  useEffect(() => {
    if (typeof queueQuery.data?.total === "number" && queueQuery.data.total >= 0) {
      setLastQueueTotal((current) => Math.max(current, queueQuery.data?.total ?? 0));
    }
  }, [queueQuery.data?.total]);

  useEffect(() => {
    setQueuePage((currentPage) => Math.min(currentPage, queueTotalPages));
  }, [queueTotalPages]);

  const currentProgress = useMemo(() => {
    if (!statusQuery.data) return null;
    return getExecutionProgress(statusQuery.data);
  }, [statusQuery.data]);

  const currentDisplayStatus = useMemo(() => {
    if (!statusQuery.data) return "";
    return getDisplayJobStatus(statusQuery.data);
  }, [statusQuery.data]);

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
      setRoutePreviewRows([]);
      setRoutePreviewPendingCount(0);
      return;
    }

    try {
      if (nextFile.size > faqOutputUploadMaxFileBytes) {
        throw new Error(`上传文件过大，请控制在 ${faqOutputUploadLimitMb}MB 以内后再试。`);
      }
      const parsed = await parseUploadFile(nextFile);
      if (parsed.length > faqOutputUploadMaxRows) {
        throw new Error(`上传行数过多，请控制在 ${faqOutputUploadMaxRows} 行以内后再试。`);
      }
      setRows(parsed);
      setFileName(nextFile.name);
      setSelectedFile(nextFile);
    } catch (err) {
      setRows([]);
      setFileName("");
      setSelectedFile(null);
      setError(getReadableFaqOutputError(err) || "File parsing failed");
    }
  }

  function handleDropzoneDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDropzoneDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function handleDropzoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const nextFile = event.dataTransfer.files?.[0] || null;
    void handleFileChange(nextFile);
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
    setError("");
    setDownloadingJobId(jobId);
    try {
      const url = new URL(`${faqOutputApiBase}/generation/jobs/${encodeURIComponent(jobId)}/download`);
      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
      });
      await downloadFileFromResponse(response, `faq-output-${jobId}.xlsx`);
    } catch (err) {
      setError(getReadableFaqOutputError(err));
    } finally {
      setDownloadingJobId("");
    }
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
      setResultNotice(`任务已创建，已进入队列，任务 ID：${data.jobId}`);
      setQueuePage(1);
    } catch (err) {
      setError(getReadableFaqOutputError(err));
    }
  }

  const routePreviewLoading = routePreviewPendingCount > 0;
  const canRun = Boolean(selectedFile) && !runMutation.isPending && routeSummary.executableCount > 0;

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

        <div className="output-upload-bar">
          <div
            className={`field faq-output-upload-field${isDragActive ? " is-drag-active" : ""}`}
            style={{ margin: 0 }}
            onDragOver={handleDropzoneDragOver}
            onDragEnter={handleDropzoneDragOver}
            onDragLeave={handleDropzoneDragLeave}
            onDrop={handleDropzoneDrop}
          >
            <div className="faq-output-upload-head">
              <label>上传 FAQ 输出源表</label>
              <button className="btn-ghost output-template-btn faq-poster-btn-small" type="button" onClick={downloadTemplate}>
                下载模板
              </button>
            </div>
            <label className="output-dropzone faq-output-dropzone" htmlFor={uploadInputId} title={fileName || "点击或拖拽文件到此处上传"}>
              <span className="output-dropzone-copy">
                <strong>{fileName || "点击或拖拽文件到此处上传"}</strong>
                <span>支持 `.csv` 和 `.xlsx`，系统会读取第一个工作表。</span>
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
              <p>
                建议不超过 {faqOutputUploadLimitMb}MB / 约 {faqOutputUploadMaxRows} 行，超过将直接拦截。
              </p>
            </div>
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
                当前任务：{queueStatusText[currentDisplayStatus] ?? currentDisplayStatus} / {currentProgress?.processedRows ?? 0}/
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
          <button className="btn-primary" type="button" disabled={!canRun} onClick={() => void runGeneration()}>
            {runMutation.isPending ? "生成中..." : "开始生成"}
          </button>
        </div>
      </div>

      <div className="card faq-output-summary-card faq-poster-card faq-poster-card-tight">
        <div className="output-summary-head">
          <div>
            <h3>路由摘要</h3>
            <p className="muted output-summary-copy">
              {factTypeStats.length
                ? `识别到 ${routeSummary.factTypeCount} 种 fact_type，当前已确认可执行 ${routeSummary.executableCount} 行，将跳过 ${routeSummary.skippedCount} 行。`
                : "上传文件后，这里会展示 fact_type 命中的 skill 路由情况。"}
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

        {routePreviewLoading ? (
          <p className="muted" style={{ marginTop: 14 }}>
            正在分批解析路由，已优先加载当前可见内容，剩余 {routePreviewPendingCount} 项继续补充中。
          </p>
        ) : null}

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
              {queueRows.map((item) => {
                const hasResult = Boolean(item.resultFilePath) || item.canDownload || Boolean(item.resultFileName) || item.status === "done" || item.status === "failed";
                const itemProgress = getExecutionProgress(item);
                const displayStatus = getDisplayJobStatus(item);
                return (
                  <tr key={item.id}>
                    <td title={item.id}>{formatJobId(item.id)}</td>
                    <td>
                      <span className={`status-light status-${displayStatus}`}>
                        <span className="status-light-dot" />
                        <span>{queueStatusText[displayStatus] ?? displayStatus}</span>
                      </span>
                    </td>
                    <td title={item.uploader}>{item.uploader}</td>
                    <td title={safeValue(item.note)}>{safeValue(item.note)}</td>
                    <td title={item.errorReason || getCompactSummaryText(item)}>
                      <div>{getCompactSummaryText(item)}</div>
                      {(displayStatus === "running" || displayStatus === "pending" || displayStatus === "queued") && item.executableRows > 0 ? (
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
                          disabled={!hasResult || downloadingJobId === item.id}
                          onClick={() => void downloadJobResult(item.id)}
                        >
                          {downloadingJobId === item.id ? "下载中..." : "下载"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {isQueueInitialLoading ? (
                <tr>
                  <td colSpan={10}>FAQ 输出任务加载中...</td>
                </tr>
              ) : null}
              {!isQueueInitialLoading && queueRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>暂无 FAQ 输出任务。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="upload-actions faq-pagination-row">
          <span className="muted">
            共 {queueKnownTotal}
            {queueTotalIsEstimated ? "+" : ""} 条任务
          </span>
          <span className="muted faq-pagination-footnote">
            {isQueueRefreshing
              ? `正在加载第 ${queuePage} 页，当前先保留上一页数据。`
              : queueSlow
                ? "任务较多，队列仍在刷新，请稍候。"
                : !isPageVisible
                  ? "页面失焦时已暂停自动刷新。"
                  : ""}
          </span>
          <div className="upload-actions" style={{ gap: 8 }}>
            <button className="btn-ghost" type="button" disabled={queuePage <= 1 || isQueueRefreshing} onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}>
              上一页
            </button>
            <span className="faq-pagination-indicator">
              {queuePage}/{queueTotalPages}
            </span>
            <button
              className="btn-ghost"
              type="button"
              disabled={(!queueHasMore && queuePage >= queueTotalPages) || isQueueRefreshing}
              onClick={() => setQueuePage((prev) => Math.min(queueTotalPages + (queueHasMore ? 1 : 0), prev + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
