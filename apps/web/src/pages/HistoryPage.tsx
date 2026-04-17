import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { PopDatePicker } from "../components/PopDatePicker";
import { formatChinaDateTime } from "../utils/time";

function pickWinner(avgOnline: number, avgAi: number, avgOp: number, hasOpData: boolean) {
  const candidates: Array<{ version: "online" | "ai" | "op"; score: number }> = [
    { version: "online", score: avgOnline },
    { version: "ai", score: avgAi },
  ];
  if (hasOpData) candidates.push({ version: "op", score: avgOp });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.version ?? "ai";
}

function winnerLabel(version: "online" | "ai" | "op") {
  if (version === "online") return "线上";
  if (version === "ai") return "AI";
  return "OP";
}

function publishCandidateLabel(version?: "ai" | "op" | null) {
  if (version === "ai") return "AI";
  if (version === "op") return "OP";
  return "\u65e0";
}

function formatRawDateTime(dateLike: string | Date) {
  return formatChinaDateTime(dateLike);
}

const NOTE_PREVIEW_LIMIT = 6;

function renderNote(noteRaw: string) {
  const note = (noteRaw || "").trim();
  if (!note) return <span>-</span>;
  if (note.length <= NOTE_PREVIEW_LIMIT) return <span>{note}</span>;
  const preview = `${note.slice(0, NOTE_PREVIEW_LIMIT)}*`;
  return (
    <span className="note-tip-wrap" tabIndex={0}>
      <span className="note-preview-text">{preview}</span>
      <span className="note-tip-pop">{note}</span>
    </span>
  );
}

export function HistoryPage() {
  const utils = trpc.useUtils();
  const [listPage, setListPage] = useState(1);
  const [draftUploader, setDraftUploader] = useState<"" | (typeof uploaderOptions)[number]>("");
  const [draftCountry, setDraftCountry] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    uploader: "" as "" | (typeof uploaderOptions)[number],
    country: "",
    startDate: "",
    endDate: "",
  });

  const listQuery = trpc.batch.list.useQuery({
    moduleId: "about",
    page: listPage,
    pageSize: 20,
    uploader: appliedFilters.uploader || undefined,
    country: appliedFilters.country || undefined,
    startDate: appliedFilters.startDate || undefined,
    endDate: appliedFilters.endDate || undefined,
  });

  async function downloadBatchXlsx(batchId: string) {
    const response = await utils.client.batch.ingest.result.query({ batchId, format: "xlsx" });
    const xlsxBase64 = "xlsxBase64" in response ? response.xlsxBase64 || "" : "";
    const binary = atob(xlsxBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `history-batch-${batchId}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function applyFilters() {
    setListPage(1);
    setAppliedFilters({
      uploader: draftUploader,
      country: draftCountry,
      startDate: draftStartDate,
      endDate: draftEndDate,
    });
  }

  function clearFilters() {
    setListPage(1);
    setDraftUploader("");
    setDraftCountry("");
    setDraftStartDate("");
    setDraftEndDate("");
    setAppliedFilters({
      uploader: "",
      country: "",
      startDate: "",
      endDate: "",
    });
  }

  const batches = listQuery.data?.rows || [];
  const summary = useMemo(
    () =>
      listQuery.data?.summary || {
        batchCount: 0,
        totalRowCount: 0,
        validRowCount: 0,
        failedRowCount: 0,
        publishPassCount: 0,
        publishPassRate: 0,
      },
    [listQuery.data?.summary],
  );

  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total || 0) / 20));

  return (
    <>
      <div className="card history-filter-shell">
        <h2>历史批次</h2>

        <section className="filter-panel history-filters">
          <div className="filter-panel-head">
            <h3>筛选条件</h3>
            <span />
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>上传人</label>
              <Select.Root
                value={draftUploader || "all"}
                onValueChange={(value) => setDraftUploader(value === "all" ? "" : (value as (typeof uploaderOptions)[number]))}
              >
                <Select.Trigger className="select-trigger" aria-label="uploader-history">
                  <Select.Value placeholder="全部上传人" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      <Select.Item className="select-item" value="all">
                        <Select.ItemText>全部上传人</Select.ItemText>
                      </Select.Item>
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
              <label>国家</label>
              <Select.Root value={draftCountry || "all"} onValueChange={(value) => setDraftCountry(value === "all" ? "" : value)}>
                <Select.Trigger className="select-trigger" aria-label="country-history">
                  <Select.Value placeholder="全部国家" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-content" position="popper" sideOffset={8}>
                    <Select.Viewport className="select-viewport">
                      <Select.Item className="select-item" value="all">
                        <Select.ItemText>全部国家</Select.ItemText>
                      </Select.Item>
                      {countryOptions.map((code) => (
                        <Select.Item className="select-item" value={code} key={code}>
                          <Select.ItemText>{code}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="field">
              <label>开始日期</label>
              <PopDatePicker value={draftStartDate} onChange={setDraftStartDate} placeholder="开始日期" />
            </div>

            <div className="field">
              <label>结束日期</label>
              <PopDatePicker value={draftEndDate} onChange={setDraftEndDate} placeholder="结束日期" />
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn-clear-pop" type="button" onClick={clearFilters}>
              清空筛选
            </button>
            <button className="btn-primary" type="button" onClick={applyFilters}>
              查询
            </button>
          </div>
        </section>
      </div>

      <div className="card history-result-shell">
        <div className="results-section-title">分析结果</div>

        <div className="kpi-row history-kpi-row">
          <div className="kpi-card">
            <span className="kpi-label">批次数</span>
            <strong className="kpi-value">{summary.batchCount}</strong>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">有效行数</span>
            <strong className="kpi-value">{summary.validRowCount}</strong>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">通过数量</span>
            <strong className="kpi-value">{summary.publishPassCount}</strong>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">通过率</span>
            <strong className="kpi-value">{summary.publishPassRate}%</strong>
          </div>
        </div>

        <div className="history-table-panel">
          <h3>批次列表</h3>
          {!batches.length && <p className="muted">暂无批次记录，请先执行手动或批量评分。</p>}
          <table className="history-table">
            <thead>
              <tr>
                <th>创建时间</th>
                <th>上传人</th>
                <th>备注</th>
                <th>行数</th>
                <th>均分（线上 / AI / OP）</th>
                <th>
                  <span className="th-help-inline">
                    通过统计
                    <span className="help-tip-wrap" tabIndex={0}>
                      ?
                      <span className="help-tip-pop">通过 = AI/OP 中存在一个版本同时满足“大于线上且大于 8 分”；若 AI 和 OP 同时满足，取更高分，同分优先 OP。</span>
                    </span>
                  </span>
                </th>
                <th>最佳版本</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => {
                const aiLift = Number((Number(item.avgAi) - Number(item.avgOnline)).toFixed(1));
                const opLift = item.hasOpData ? Number((Number(item.avgOp) - Number(item.avgAi)).toFixed(1)) : 0;
                const onlinePct = Math.max(0, Math.min(100, (Number(item.avgOnline) / 10) * 100));
                const aiPct = Math.max(0, Math.min(100, (Number(item.avgAi) / 10) * 100));
                const opPct = Math.max(0, Math.min(100, (Number(item.avgOp) / 10) * 100));
                return (
                  <tr key={item.id}>
                    <td>{formatRawDateTime(item.createdAt)}</td>
                    <td>{item.uploader}</td>
                    <td>{renderNote(item.note || "")}</td>
                    <td title={`valid ${item.validRowCount} / failed ${item.failedRowCount || 0}`}>{item.totalRowCount ?? item.rowCount}</td>
                    <td>
                      <div className="mini-score-stack">
                        <div className="mini-score-row">
                          <span className="mini-score-label">线上</span>
                          <div className="mini-score-track">
                            <span className="mini-score-fill online" style={{ width: `${onlinePct}%` }} />
                          </div>
                          <span className="mini-score-value">{item.avgOnline}</span>
                        </div>
                        <div className="mini-score-row">
                          <span className="mini-score-label">AI</span>
                          <div className="mini-score-track">
                            <span className="mini-score-fill ai" style={{ width: `${aiPct}%` }} />
                          </div>
                          <span className="mini-score-value">{item.avgAi}</span>
                        </div>
                        {item.hasOpData && (
                          <div className="mini-score-row">
                            <span className="mini-score-label">OP</span>
                            <div className="mini-score-track">
                              <span className="mini-score-fill op" style={{ width: `${opPct}%` }} />
                            </div>
                            <span className="mini-score-value">{item.avgOp}</span>
                          </div>
                        )}
                      </div>

                      <div className="mini-delta-row">
                        <span className={`delta-chip ${aiLift >= 0 ? "up" : "down"}`}>
                          AI-线上 {aiLift >= 0 ? "↑" : "↓"} {Math.abs(aiLift)}
                        </span>
                        {item.hasOpData && (
                          <span className={`delta-chip ${opLift >= 0 ? "up" : "down"}`}>
                            OP-AI {opLift >= 0 ? "↑" : "↓"} {Math.abs(opLift)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="pass-donut-wrap">
                        <span
                          className="pass-donut"
                          style={{
                            background: `conic-gradient(var(--blue) ${item.publishPassRate}%, #e3e3e3 ${item.publishPassRate}% 100%)`,
                          }}
                        >
                          <span className="pass-donut-inner">{Math.round(Number(item.publishPassRate || 0))}%</span>
                        </span>
                        <span className="pass-donut-text">
                          {item.publishPassCount}/{item.validRowCount}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`winner-chip ${item.publishCandidateVersion || "none"}`}>
                        {publishCandidateLabel(item.publishCandidateVersion)}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost history-action-btn" type="button" onClick={() => void downloadBatchXlsx(item.id)}>
                        下载结果
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="history-page-actions history-list-pagination">
          <button className="btn-ghost" type="button" disabled={listPage <= 1} onClick={() => setListPage((value) => Math.max(1, value - 1))}>
            上一页
          </button>
          <span>
            第 {listQuery.data?.page || listPage} 页 / 共 {totalPages} 页
          </span>
          <button className="btn-ghost" type="button" onClick={() => setListPage((value) => value + 1)} disabled={listPage >= totalPages}>
            下一页
          </button>
        </div>
      </div>
    </>
  );
}
