import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type DownloadTaskStatus = "queued" | "preparing" | "ready" | "failed" | "expired";

export type DownloadToolType =
  | "about-quality"
  | "faq-quality"
  | "faq-output"
  | "faq-history"
  | "gg-cleaning"
  | "translation"
  | "category-calibration"
  | "generic";

type ApiDownloadTask = {
  taskId: string;
  jobId: string;
  variant: string;
  status: DownloadTaskStatus;
  progressPercent: number;
  statusText: string;
  fileName: string;
  fileSizeBytes: number;
  errorMessage: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type DownloadCenterTask = ApiDownloadTask & {
  toolType: DownloadToolType;
  sourceLabel: string;
  downloadUrl?: string;
};

type CreateDownloadTaskInput = {
  sourceLabel: string;
  toolType?: DownloadToolType;
  create: () => Promise<ApiDownloadTask>;
  autoDownload?: boolean;
};

type DownloadCenterContextValue = {
  tasks: DownloadCenterTask[];
  open: boolean;
  setOpen: (open: boolean) => void;
  createDownloadTask: (input: CreateDownloadTaskInput) => Promise<DownloadCenterTask>;
};

const storageKey = "sc-download-center-v1";
const pollIntervalMs = 1500;
const maxStoredTasks = 50;
const terminalStatuses = new Set<DownloadTaskStatus>(["ready", "failed", "expired"]);

const DownloadCenterContext = createContext<DownloadCenterContextValue | null>(null);

const apiBase = (() => {
  const trpcUrl = import.meta.env.VITE_TRPC_URL || "/trpc";
  if (/^https?:\/\//i.test(trpcUrl)) {
    try {
      return new URL(trpcUrl).origin;
    } catch {
      return trpcUrl.replace(/\/trpc\/?$/, "");
    }
  }
  if (typeof window !== "undefined") return window.location.origin;
  return trpcUrl.replace(/\/trpc\/?$/, "");
})();

function triggerBrowserDownload(url: string, fileName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function formatBytes(bytes?: number) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatTime(value?: string) {
  if (!value) return "刚刚";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getDownloadFileUrl(taskId: string) {
  return `${apiBase}/downloads/tasks/${encodeURIComponent(taskId)}/file`;
}

async function parseApiError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    return "下载接口返回了 HTML 页面，通常是 /generation/ 没有正确代理到 API。";
  }
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function mergeTask(current: DownloadCenterTask | undefined, next: ApiDownloadTask, meta?: Partial<DownloadCenterTask>): DownloadCenterTask {
  return {
    ...(current || {
      toolType: "generic" as const,
      sourceLabel: "下载任务",
    }),
    ...meta,
    ...next,
    downloadUrl: next.status === "ready" ? getDownloadFileUrl(next.taskId) : current?.downloadUrl,
  };
}

function readStoredTasks() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as DownloadCenterTask[];
    return Array.isArray(parsed) ? parsed.slice(0, maxStoredTasks) : [];
  } catch {
    return [];
  }
}

export function DownloadCenterProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<DownloadCenterTask[]>(() => readStoredTasks());
  const [open, setOpen] = useState(false);
  const pollingTasksRef = useRef(new Set<string>());

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(tasks.slice(0, maxStoredTasks)));
  }, [tasks]);

  const upsertTask = (task: DownloadCenterTask) => {
    setTasks((current) => [task, ...current.filter((item) => item.taskId !== task.taskId)].slice(0, maxStoredTasks));
  };

  async function pollTask(taskId: string, meta?: Partial<DownloadCenterTask>, autoDownload = false) {
    if (pollingTasksRef.current.has(taskId)) return;
    pollingTasksRef.current.add(taskId);
    try {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const response = await fetch(`${apiBase}/downloads/tasks/${encodeURIComponent(taskId)}`, { credentials: "include" });
        if (!response.ok) {
          throw new Error(await parseApiError(response, `下载任务状态查询失败：HTTP ${response.status}`));
        }
        const apiTask = (await response.json()) as ApiDownloadTask;
        let mergedTask: DownloadCenterTask | undefined;
        setTasks((current) => {
          const existing = current.find((item) => item.taskId === taskId);
          mergedTask = mergeTask(existing, apiTask, meta);
          return [mergedTask, ...current.filter((item) => item.taskId !== taskId)].slice(0, maxStoredTasks);
        });
        if (apiTask.status === "ready") {
          const downloadUrl = getDownloadFileUrl(taskId);
          if (autoDownload) triggerBrowserDownload(downloadUrl, apiTask.fileName || `download-${taskId}`);
          break;
        }
        if (apiTask.status === "failed" || apiTask.status === "expired") break;
        await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      setTasks((current) => {
        const existing = current.find((item) => item.taskId === taskId);
        if (!existing) return current;
        return [
          {
            ...existing,
            status: "failed",
            progressPercent: existing.progressPercent || 0,
            statusText: "下载任务失败。",
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          ...current.filter((item) => item.taskId !== taskId),
        ];
      });
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }

  useEffect(() => {
    tasks
      .filter((task) => !terminalStatuses.has(task.status))
      .forEach((task) => void pollTask(task.taskId, { toolType: task.toolType, sourceLabel: task.sourceLabel }, false));
    // Only run once on mount to resume stored in-flight downloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDownloadTask(input: CreateDownloadTaskInput) {
    setOpen(true);
    const apiTask = await input.create();
    const task = mergeTask(undefined, apiTask, {
      toolType: input.toolType || "generic",
      sourceLabel: input.sourceLabel,
    });
    upsertTask(task);
    void pollTask(task.taskId, { toolType: task.toolType, sourceLabel: task.sourceLabel }, input.autoDownload ?? true);
    return task;
  }

  const value = useMemo<DownloadCenterContextValue>(
    () => ({
      tasks,
      open,
      setOpen,
      createDownloadTask,
    }),
    [tasks, open],
  );

  const activeCount = tasks.filter((task) => task.status === "queued" || task.status === "preparing").length;
  const readyCount = tasks.filter((task) => task.status === "ready").length;
  const failedCount = tasks.filter((task) => task.status === "failed" || task.status === "expired").length;
  const collapsedCount = activeCount || readyCount || tasks.length;
  const collapsedCountLabel = collapsedCount > 99 ? "99+" : String(collapsedCount);

  return (
    <DownloadCenterContext.Provider value={value}>
      {children}
      <aside className={`download-drawer ${open ? "open" : ""}`} aria-label="全局下载中心">
        <button className="download-drawer-tab" type="button" onClick={() => setOpen(!open)}>
          <span className="download-drawer-tab-label">下载</span>
          <strong className="download-drawer-tab-badge">{collapsedCountLabel}</strong>
        </button>
        <div className="download-drawer-panel">
          <div className="download-drawer-head">
            <div>
              <span className="download-drawer-kicker">SC DOWNLOADS</span>
              <h2>下载中心</h2>
              <p>文件在后台准备，完成后交给浏览器下载。</p>
            </div>
            <button className="download-drawer-close" type="button" onClick={() => setOpen(false)} aria-label="收起下载中心">
              收起
            </button>
          </div>

          <div className="download-drawer-stats">
            <span>{activeCount} 准备中</span>
            <span>{readyCount} 可下载</span>
            <span>{failedCount} 异常</span>
          </div>

          <div className="download-drawer-list">
            {tasks.length ? (
              tasks.map((task) => (
                <article className={`download-drawer-item download-drawer-item-${task.status}`} key={task.taskId}>
                  <div className="download-drawer-item-top">
                    <span>{task.sourceLabel}</span>
                    <em>{task.status}</em>
                  </div>
                  <strong title={task.fileName || task.taskId}>{task.fileName || "正在生成文件名..."}</strong>
                  <p>{task.errorMessage || task.statusText || "等待任务状态更新..."}</p>
                  <div className="download-drawer-progress" aria-label={`下载进度 ${task.progressPercent || 0}%`}>
                    <span style={{ width: `${Math.max(4, Math.min(100, task.progressPercent || 0))}%` }} />
                  </div>
                  <div className="download-drawer-meta">
                    <span>{formatBytes(task.fileSizeBytes)}</span>
                    <span>{formatTime(task.createdAt)}</span>
                  </div>
                  <div className="download-drawer-actions">
                    {task.status === "ready" && task.downloadUrl ? (
                      <button type="button" onClick={() => triggerBrowserDownload(task.downloadUrl!, task.fileName)}>
                        手动下载
                      </button>
                    ) : null}
                    {!terminalStatuses.has(task.status) ? <span>可继续浏览页面</span> : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="download-drawer-empty">
                <strong>暂无下载任务</strong>
                <span>从任意工具点击下载后，这里会显示准备进度。</span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </DownloadCenterContext.Provider>
  );
}

export function useDownloadCenter() {
  const context = useContext(DownloadCenterContext);
  if (!context) throw new Error("useDownloadCenter must be used inside DownloadCenterProvider");
  return context;
}

export async function createFaqJobDownloadTask(jobId: string, variant: string) {
  const response = await fetch(`${apiBase}/generation/jobs/${encodeURIComponent(jobId)}/download-tasks`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, `创建下载任务失败：HTTP ${response.status}`));
  }
  return (await response.json()) as ApiDownloadTask;
}

export async function createFaqHistoryExportTask(input: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/generation/history-export-tasks`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, `创建历史导出任务失败：HTTP ${response.status}`));
  }
  return (await response.json()) as ApiDownloadTask;
}

export async function createGlobalDownloadTask(input: {
  kind: "quality-batch" | "gg-cleaning" | "translation-batch" | "category-calibration";
  jobId: string;
  includeDebug?: boolean;
}) {
  const response = await fetch(`${apiBase}/downloads/tasks`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, `创建下载任务失败：HTTP ${response.status}`));
  }
  return (await response.json()) as ApiDownloadTask;
}
