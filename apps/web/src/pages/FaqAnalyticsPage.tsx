import * as Select from "@radix-ui/react-select";
import { useState } from "react";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { PopDatePicker } from "../components/PopDatePicker";

function trend(v?: string) {
  if (v === "better") return "整体更好";
  if (v === "worse") return "整体更差";
  return "基本持平";
}

export function FaqAnalyticsPage() {
  const [draftUploader, setDraftUploader] = useState<"" | (typeof uploaderOptions)[number]>("");
  const [draftCountry, setDraftCountry] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [applied, setApplied] = useState({ uploader: "" as "" | (typeof uploaderOptions)[number], country: "", startDate: "", endDate: "" });

  const query = trpc.analytics.summary.useQuery({
    moduleId: "faq",
    uploader: applied.uploader || undefined,
    country: applied.country || undefined,
    startDate: applied.startDate || undefined,
    endDate: applied.endDate || undefined,
  });

  const passMetrics = query.data?.metrics?.passMetrics;
  const faqMerchant: any = (query.data?.metrics as any)?.faqMerchant || {};
  const validRows = query.data?.metrics?.totalValidRows ?? 0;
  const publishPassCount = passMetrics?.publishPassCount ?? 0;
  const publishPassRate = passMetrics?.publishPassRate ?? 0;

  return (
    <div className="faq-panel">
      <div className="section-header"><h2>FAQ 评估看板</h2><p>行级 + 商家级结果可视化</p></div>
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
          <button className="btn-primary faq-action-btn" type="button" onClick={() => setApplied({ uploader: draftUploader, country: draftCountry, startDate: draftStartDate, endDate: draftEndDate })}>查询</button>
        </div>
      </div>

      <div className="kpi-row" style={{ marginTop: 14 }}>
        <div className="kpi-card"><span className="kpi-label">有效FAQ行</span><strong className="kpi-value">{validRows}</strong></div>
        <div className="kpi-card"><span className="kpi-label">通过数量</span><strong className="kpi-value">{publishPassCount}</strong></div>
        <div className="kpi-card"><span className="kpi-label">通过率</span><strong className="kpi-value">{publishPassRate}%</strong></div>
        <div className="kpi-card"><span className="kpi-label">商家数</span><strong className="kpi-value">{faqMerchant.merchantCount || 0}</strong></div>
        <div className="kpi-card"><span className="kpi-label">商家通过率</span><strong className="kpi-value">{faqMerchant.merchantPublishPassRate || 0}%</strong></div>
        <div className="kpi-card"><span className="kpi-label">整体评价</span><strong className="kpi-value">{trend(faqMerchant.overallTrend)}</strong></div>
      </div>
    </div>
  );
}
