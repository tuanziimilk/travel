import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { PopDatePicker } from "../components/PopDatePicker";

function fmt(dateLike: string | Date) {
  const raw = typeof dateLike === "string" ? dateLike : dateLike.toISOString();
  return raw.replace("T", " ").replace("Z", "").slice(0, 19);
}

function trend(v?: string) {
  if (v === "better") return "整体更好";
  if (v === "worse") return "整体更差";
  return "基本持平";
}

export function FaqHistoryPage() {
  const utils = trpc.useUtils();
  const [listPage, setListPage] = useState(1);
  const [draftUploader, setDraftUploader] = useState<"" | (typeof uploaderOptions)[number]>("");
  const [draftCountry, setDraftCountry] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [applied, setApplied] = useState({ uploader: "" as "" | (typeof uploaderOptions)[number], country: "", startDate: "", endDate: "" });

  const listQuery = trpc.batch.list.useQuery({
    moduleId: "faq",
    page: listPage,
    pageSize: 20,
    uploader: applied.uploader || undefined,
    country: applied.country || undefined,
    startDate: applied.startDate || undefined,
    endDate: applied.endDate || undefined,
  });

  async function downloadBatchXlsx(batchId: string) {
    const response = await utils.client.batch.ingest.result.query({ batchId, format: "xlsx" });
    const xlsxBase64 = "xlsxBase64" in response ? response.xlsxBase64 || "" : "";
    const binary = atob(xlsxBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faq-history-${batchId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows: any[] = listQuery.data?.rows || [];
  const summary = useMemo(() => {
    const batchCount = rows.length;
    const faqRows = rows.reduce((s, x) => s + Number(x.validRowCount || 0), 0);
    const faqPass = rows.reduce((s, x) => s + Number(x.publishPassCount || 0), 0);
    const merchants = rows.reduce((s, x) => s + Number(x.merchantCount || 0), 0);
    const merchantPass = rows.reduce((s, x) => s + Number(x.merchantPublishPassCount || 0), 0);
    return {
      batchCount,
      faqRows,
      faqPass,
      faqPassRate: faqRows ? Number(((faqPass / faqRows) * 100).toFixed(1)) : 0,
      merchants,
      merchantPass,
      merchantPassRate: merchants ? Number(((merchantPass / merchants) * 100).toFixed(1)) : 0,
    };
  }, [rows]);

  return (
    <div className="faq-panel">
      <div className="section-header"><h2>FAQ 历史批次</h2><p>按行 + 商家维度双统计</p></div>

      <div className="card faq-card">
        <div className="grid grid-2">
          <div className="field">
            <label>上传人</label>
            <Select.Root value={draftUploader || "all"} onValueChange={(v) => setDraftUploader(v === "all" ? "" : (v as any))}>
              <Select.Trigger className="select-trigger"><Select.Value /></Select.Trigger>
              <Select.Portal><Select.Content className="select-content" position="popper" sideOffset={8}><Select.Viewport className="select-viewport"><Select.Item className="select-item" value="all"><Select.ItemText>全部上传人</Select.ItemText></Select.Item>{uploaderOptions.map((n) => <Select.Item className="select-item" value={n} key={n}><Select.ItemText>{n}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
            </Select.Root>
          </div>
          <div className="field">
            <label>国家</label>
            <Select.Root value={draftCountry || "all"} onValueChange={(v) => setDraftCountry(v === "all" ? "" : v)}>
              <Select.Trigger className="select-trigger"><Select.Value /></Select.Trigger>
              <Select.Portal><Select.Content className="select-content" position="popper" sideOffset={8}><Select.Viewport className="select-viewport"><Select.Item className="select-item" value="all"><Select.ItemText>全部国家</Select.ItemText></Select.Item>{countryOptions.map((n) => <Select.Item className="select-item" value={n} key={n}><Select.ItemText>{n}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
            </Select.Root>
          </div>
          <div className="field"><label>开始日期</label><PopDatePicker value={draftStartDate} onChange={setDraftStartDate} placeholder="开始日期" /></div>
          <div className="field"><label>结束日期</label><PopDatePicker value={draftEndDate} onChange={setDraftEndDate} placeholder="结束日期" /></div>
        </div>
        <div className="filter-actions">
          <button className="btn-clear-pop" type="button" onClick={() => { setDraftUploader(""); setDraftCountry(""); setDraftStartDate(""); setDraftEndDate(""); setApplied({ uploader: "", country: "", startDate: "", endDate: "" }); }}>清空筛选</button>
          <button className="btn-primary faq-action-btn" type="button" onClick={() => { setListPage(1); setApplied({ uploader: draftUploader, country: draftCountry, startDate: draftStartDate, endDate: draftEndDate }); }}>查询</button>
        </div>
      </div>

      <div className="kpi-row" style={{ marginTop: 14 }}>
        <div className="kpi-card"><span className="kpi-label">批次数</span><strong className="kpi-value">{summary.batchCount}</strong></div>
        <div className="kpi-card"><span className="kpi-label">FAQ总数</span><strong className="kpi-value">{summary.faqRows}</strong></div>
        <div className="kpi-card"><span className="kpi-label">FAQ通过率</span><strong className="kpi-value">{summary.faqPassRate}%</strong></div>
        <div className="kpi-card"><span className="kpi-label">商家通过率</span><strong className="kpi-value">{summary.merchantPassRate}%</strong></div>
      </div>

      <div className="card faq-card" style={{ marginTop: 14 }}>
        <table className="history-table">
          <thead><tr><th>创建时间</th><th>上传人</th><th>FAQ行</th><th>商家通过</th><th>整体评价</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{fmt(row.createdAt)}</td>
                <td>{row.uploader}</td>
                <td>{row.publishPassCount}/{row.validRowCount}（{row.publishPassRate}%）</td>
                <td>{row.merchantPublishPassCount || 0}/{row.merchantCount || 0}（{row.merchantPublishPassRate || 0}%）</td>
                <td>{trend(row.overallTrend)}</td>
                <td><button className="btn-ghost" type="button" onClick={() => void downloadBatchXlsx(row.id)}>下载结果</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
