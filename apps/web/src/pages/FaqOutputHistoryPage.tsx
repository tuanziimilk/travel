import * as Select from "@radix-ui/react-select";
import { useEffect, useMemo, useState } from "react";
import { uploaderOptions } from "@about-demo/trpc";
import { PopDatePicker } from "../components/PopDatePicker";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";

type HistorySummaryResponse = {
  summary: {
    totalRows: number;
    uniqueResultCount: number;
    countryCount: number;
    subclassCount: number;
  };
  byCountry: Array<{
    country: string;
    rowCount: number;
    uniqueResultCount: number;
    subclassCount: number;
  }>;
  bySubclass: Array<{
    subclass: string;
    rowCount: number;
    uniqueResultCount: number;
    countryCount: number;
  }>;
};

type HistoryRow = {
  jobId: string;
  uploader: string;
  createdAt: string | Date;
  finishedAt: string | Date | null;
  Country: string;
  TermID: string;
  TermName: string;
  Domain: string;
  Subclass: string;
  Titile1: string;
  "Brief Introduction": string;
};

type ShareDatum = {
  label: string;
  value: number;
  pct: number;
  color: string;
};

const chartPalette = ["#004ffe", "#17b890", "#ffcf33", "#ff6b6b", "#7c4dff", "#111111"];
const faqSubclassOptions = [
  "shipping",
  "newsletter/first order/sign up/",
  "student",
  "military",
  "senior",
  "birthday",
  "teacher",
  "first responder",
  "child",
  "new customer",
  "nhs",
  "loyalty program",
  "employee",
  "referral",
  "existing customer",
  "app",
  "clearance",
  "family",
  "blue light card",
  "aaa",
  "gift card",
  "price guarantee",
  "return",
] as const;

function formatDateTime(value?: string | Date | null) {
  return formatChinaDateTime(value);
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

function buildShareData(items: Array<{ label: string; value: number }>, maxItems = 5): ShareDatum[] {
  const sorted = [...items].sort((a, b) => b.value - a.value).filter((item) => item.value > 0);
  const top = sorted.slice(0, maxItems);
  const rest = sorted.slice(maxItems).reduce((sum, item) => sum + item.value, 0);
  const merged = rest > 0 ? [...top, { label: "其他", value: rest }] : top;
  const total = merged.reduce((sum, item) => sum + item.value, 0) || 1;
  return merged.map((item, index) => ({
    label: item.label,
    value: item.value,
    pct: Number(((item.value / total) * 100).toFixed(1)),
    color: chartPalette[index % chartPalette.length],
  }));
}

function DonutCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: ShareDatum[];
}) {
  const background = useMemo(() => {
    if (!data.length) return "conic-gradient(#e6e6e6 0 100%)";
    let current = 0;
    const segments = data.map((item) => {
      const start = current;
      current += item.pct;
      return `${item.color} ${start}% ${current}%`;
    });
    return `conic-gradient(${segments.join(", ")})`;
  }, [data]);

  const lead = data[0];

  return (
    <div className="history-chart-card">
      <div className="history-chart-head">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>

      <div className="history-donut-layout">
        <div className="history-donut" style={{ background }}>
          <div className="history-donut-inner">
            <strong>{lead?.pct ?? 0}%</strong>
            <span>{lead?.label ?? "暂无"}</span>
          </div>
        </div>

        <div className="history-donut-legend">
          {data.length ? (
            data.map((item) => (
              <div className="history-legend-row" key={item.label}>
                <span className="history-legend-label">
                  <i style={{ background: item.color }} />
                  <span title={item.label}>{item.label}</span>
                </span>
                <span>{item.value}</span>
                <strong>{item.pct}%</strong>
              </div>
            ))
          ) : (
            <div className="history-empty-copy">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}

function HorizontalBars({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Array<{ label: string; value: number; meta: string }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="history-chart-card">
      <div className="history-chart-head">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>

      <div className="history-bar-list">
        {items.map((item, index) => (
          <div className="history-bar-row" key={item.label}>
            <div className="history-bar-copy">
              <strong title={item.label}>{item.label}</strong>
              <span title={item.meta}>{item.meta}</span>
            </div>
            <div className="history-bar-track">
              <span
                className="history-bar-fill"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: chartPalette[index % chartPalette.length],
                }}
              />
            </div>
            <strong className="history-bar-value">{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FaqOutputHistoryPage() {
  const scType = "faq" as const;
  const pageSize = 12;
  const [page, setPage] = useState(1);
  const [country, setCountry] = useState("");
  const [subclass, setSubclass] = useState("");
  const [uploader, setUploader] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null);
  const [activeTab, setActiveTab] = useState<"analytics" | "list">("analytics");
  const utils = trpc.useUtils();

  const filterInput = useMemo(
    () => ({
      scType,
      country,
      subclass,
      uploader: uploader === "all" ? undefined : (uploader as (typeof uploaderOptions)[number]),
      keyword: keyword.trim(),
      startDate,
      endDate,
    }),
    [country, endDate, keyword, scType, startDate, subclass, uploader],
  );

  const summaryQuery = trpc.generation.historySummary.useQuery(filterInput);
  const rowsQuery = trpc.generation.historyRows.useQuery({
    ...filterInput,
    page,
    pageSize,
  });
  const optionsQuery = trpc.generation.historySummary.useQuery({ scType });

  useEffect(() => {
    setPage(1);
  }, [country, subclass, uploader, keyword, startDate, endDate]);

  const summary = (summaryQuery.data as HistorySummaryResponse | undefined)?.summary;
  const byCountry = (summaryQuery.data as HistorySummaryResponse | undefined)?.byCountry ?? [];
  const bySubclass = (summaryQuery.data as HistorySummaryResponse | undefined)?.bySubclass ?? [];
  const allCountries = (optionsQuery.data as HistorySummaryResponse | undefined)?.byCountry ?? [];
  const rows = (rowsQuery.data?.rows ?? []) as HistoryRow[];
  const totalPages = Math.max(1, Math.ceil((rowsQuery.data?.total ?? 0) / pageSize));

  const countryShare = useMemo(
    () => buildShareData(byCountry.map((item) => ({ label: item.country, value: item.uniqueResultCount }))),
    [byCountry],
  );

  const subclassShare = useMemo(
    () =>
      buildShareData(
        faqSubclassOptions.map((name) => ({
          label: name,
          value: bySubclass.find((item) => item.subclass.toLowerCase() === name)?.uniqueResultCount ?? 0,
        })),
      ),
    [bySubclass],
  );

  const subclassBars = useMemo(
    () =>
      faqSubclassOptions.map((name) => {
        const found = bySubclass.find((item) => item.subclass.toLowerCase() === name);
        return {
          label: name,
          value: found?.uniqueResultCount ?? 0,
          meta: `${found?.rowCount ?? 0} 条结果 / ${found?.countryCount ?? 0} 个国家`,
        };
      }),
    [bySubclass],
  );

  async function exportHistory(format: "xlsx" | "csv") {
    setExporting(true);
    try {
      const data = await utils.client.generation.historyExport.query({
        ...filterInput,
        format,
      });
      downloadBase64File(data.fileName, data.contentBase64, data.mimeType);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="card analytics-filter-shell faq-card">
        <h2 className="panel-slash-title">
          <span className="panel-slash-prefix">FAQ /</span>
          <span>结果库</span>
        </h2>

        <section className="filter-panel analytics-filters history-dashboard-filter">
          <div className="filter-panel-head history-dashboard-heading">
            <h3>筛选条件</h3>
            <span>按已生成的 FAQ 输出结果做检索、统计与导出</span>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>国家</label>
              <Select.Root value={country || "all"} onValueChange={(value) => setCountry(value === "all" ? "" : value)}>
                <Select.Trigger className="select-trigger" aria-label="history-country">
                  <Select.Value placeholder="全部国家" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      <Select.Item className="select-item" value="all">
                        <Select.ItemText>全部国家</Select.ItemText>
                      </Select.Item>
                      {allCountries.map((item) => (
                        <Select.Item className="select-item" key={item.country} value={item.country}>
                          <Select.ItemText>{item.country}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="field">
              <label>Subclass</label>
              <Select.Root value={subclass || "all"} onValueChange={(value) => setSubclass(value === "all" ? "" : value)}>
                <Select.Trigger className="select-trigger" aria-label="history-subclass">
                  <Select.Value placeholder="全部 subclass" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      <Select.Item className="select-item" value="all">
                        <Select.ItemText>全部 subclass</Select.ItemText>
                      </Select.Item>
                      {faqSubclassOptions.map((item) => (
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
              <label>输出人</label>
              <Select.Root value={uploader} onValueChange={setUploader}>
                <Select.Trigger className="select-trigger" aria-label="history-uploader">
                  <Select.Value placeholder="全部输出人" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      <Select.Item className="select-item" value="all">
                        <Select.ItemText>全部输出人</Select.ItemText>
                      </Select.Item>
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
              <label>关键词</label>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="TermID / TermName / Domain / 标题" />
            </div>

            <div className="field">
              <label>开始日期</label>
              <PopDatePicker value={startDate} onChange={setStartDate} placeholder="开始日期" />
            </div>

            <div className="field">
              <label>结束日期</label>
              <PopDatePicker value={endDate} onChange={setEndDate} placeholder="结束日期" />
            </div>
          </div>

          <div className="filter-actions">
            <button
              className="btn-clear-pop"
              type="button"
              onClick={() => {
                setCountry("");
                setSubclass("");
                setUploader("all");
                setKeyword("");
                setStartDate("");
                setEndDate("");
              }}
            >
              清空筛选
            </button>
            <button className="btn-clear-pop" type="button" disabled={exporting} onClick={() => void exportHistory("xlsx")}>
              导出 XLSX
            </button>
            <button className="btn-primary faq-action-btn" type="button" disabled={exporting} onClick={() => void exportHistory("csv")}>
              导出 CSV
            </button>
          </div>
        </section>
      </div>

      <div className="history-tab-switch" role="tablist" aria-label="结果库视图切换">
        <button
          className={`history-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "analytics"}
          onClick={() => setActiveTab("analytics")}
        >
          结果分析
        </button>
        <button
          className={`history-tab-btn ${activeTab === "list" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "list"}
          onClick={() => setActiveTab("list")}
        >
          结果列表
        </button>
      </div>

      {activeTab === "analytics" ? (
        <div className="card analytics-result-shell faq-card history-dashboard-shell">
          <div className="results-section-title history-dashboard-title">结果分析</div>

          <div className="kpi-row history-dashboard-kpi-row">
            <div className="kpi-card">
              <span className="kpi-label">结果行数</span>
              <strong className="kpi-value">{summary?.totalRows ?? 0}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">唯一结果数</span>
              <strong className="kpi-value">{summary?.uniqueResultCount ?? 0}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">国家数</span>
              <strong className="kpi-value">{summary?.countryCount ?? 0}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Subclass 数</span>
              <strong className="kpi-value">{summary?.subclassCount ?? 0}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">当前筛选结果</span>
              <strong className="kpi-value">{rowsQuery.data?.total ?? 0}</strong>
            </div>
          </div>

          <div className="history-dashboard-chart-grid">
            <DonutCard title="国家分布" subtitle="按唯一结果数计算占比" data={countryShare} />
            <DonutCard title="Subclass 分布" subtitle="按唯一结果数计算占比" data={subclassShare} />
          </div>

          <HorizontalBars title="Subclass 全量分布" subtitle="23 个 FAQ subclass 的完整情况" items={subclassBars} />
        </div>
      ) : (
        <div className="card analytics-result-shell faq-card history-dashboard-shell">
          <div className="history-table-panel history-dashboard-table-panel">
            <div className="dist-header history-dashboard-table-head">
              <h3>结果列表</h3>
              <span className="muted">唯一键口径：Country + TermID</span>
            </div>

            <table className="history-table history-dashboard-table">
              <thead>
                <tr>
                  <th>国家</th>
                  <th>Subclass</th>
                  <th>TermID</th>
                  <th>TermName</th>
                  <th>Domain</th>
                  <th>Title1</th>
                  <th>Brief Introduction</th>
                  <th>输出人</th>
                  <th>完成时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr
                    key={`${item.jobId}-${item.Country}-${item.TermID}-${item.Subclass}-${item.Titile1}`}
                    className="history-click-row"
                    onClick={() => setDetailRow(item)}
                  >
                    <td title={item.Country}>{item.Country}</td>
                    <td title={item.Subclass}>{item.Subclass}</td>
                    <td title={item.TermID}>{item.TermID}</td>
                    <td title={item.TermName}>{item.TermName}</td>
                    <td title={item.Domain}>{item.Domain}</td>
                    <td title={item.Titile1}>{item.Titile1}</td>
                    <td title={item["Brief Introduction"]}>{item["Brief Introduction"]}</td>
                    <td title={item.uploader}>{item.uploader}</td>
                    <td title={formatDateTime(item.finishedAt || item.createdAt)}>{formatDateTime(item.finishedAt || item.createdAt)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={9}>暂无符合筛选条件的结果记录。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="upload-actions faq-pagination-row">
              <span className="muted">共 {rowsQuery.data?.total ?? 0} 条结果记录</span>
              <div className="upload-actions" style={{ gap: 8 }}>
                <button className="btn-ghost" type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                  上一页
                </button>
                <span className="faq-pagination-indicator">
                  {page}/{totalPages}
                </span>
                <button className="btn-ghost" type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailRow ? (
        <div className="history-detail-overlay" role="dialog" aria-modal="true" onClick={() => setDetailRow(null)}>
          <div className="history-detail-card" onClick={(event) => event.stopPropagation()}>
            <div className="history-detail-head">
              <h3>数据详情 / Detail View</h3>
              <button className="history-detail-close" type="button" aria-label="关闭详情" onClick={() => setDetailRow(null)}>
                ×
              </button>
            </div>

            <div className="history-detail-content">
              <div className="history-merchant-card">
                <div className="history-highlight-badge">{detailRow.Subclass || "-"}</div>

                <div className="history-merchant-grid">
                  <div className="history-kv-label">Term Name</div>
                  <div className="history-kv-value history-kv-value-large" title={detailRow.TermName || "-"}>
                    {detailRow.TermName || "-"}
                  </div>

                  <div className="history-kv-label">Domain</div>
                  <div className="history-kv-value" title={detailRow.Domain || "-"}>
                    {detailRow.Domain || "-"}
                  </div>

                  <div className="history-kv-label">国家 / ID</div>
                  <div className="history-kv-value" title={`${detailRow.Country || "-"} | ${detailRow.TermID || "-"}`}>
                    {detailRow.Country || "-"} | {detailRow.TermID || "-"}
                  </div>
                </div>
              </div>

              <div className="history-field-group">
                <div className="history-field-tab">Title 1</div>
                <div className="history-field-box history-field-box-strong">{detailRow.Titile1 || "-"}</div>
              </div>

              <div className="history-field-group">
                <div className="history-field-tab">Brief Introduction</div>
                <div className="history-field-box">{detailRow["Brief Introduction"] || "-"}</div>
              </div>

              <div className="history-detail-footer">
                <div className="history-meta-info">
                  输出人 <span>{detailRow.uploader || "-"}</span>
                </div>
                <div className="history-meta-info">
                  完成时间 <span>{formatDateTime(detailRow.finishedAt || detailRow.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
