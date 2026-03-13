import * as Select from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { PopDatePicker } from "../components/PopDatePicker";

type HeatBucket = {
  label: string;
  min: number;
  max: number;
  count: number;
};

type Triple = { online: number; ai: number; op: number };

function versionLabel(version: "online" | "ai" | "op") {
  if (version === "online") return "About-线上";
  if (version === "ai") return "About-AI优化";
  return "About-OP复核";
}

function BulletMetric({ label, value, max = 10, target = 8 }: { label: string; value: number; max?: number; target?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const targetPct = Math.max(0, Math.min(100, (target / max) * 100));
  return (
    <div className="bullet-row">
      <div className="bullet-head">
        <span>{label}</span>
        <strong>{value.toFixed(1)}</strong>
      </div>
      <div className="bullet-track">
        <span className="bullet-fill" style={{ width: `${pct}%` }} />
        <span className="bullet-target" style={{ left: `${targetPct}%` }} />
      </div>
    </div>
  );
}

function StackedShare({ data }: { data: Triple }) {
  const total = data.online + data.ai + data.op;
  const safeTotal = total <= 0 ? 1 : total;
  const onlinePct = (data.online / safeTotal) * 100;
  const aiPct = (data.ai / safeTotal) * 100;
  const opPct = (data.op / safeTotal) * 100;
  return (
    <>
      <div className="stacked-track">
        <span className="stacked-seg online" style={{ width: `${onlinePct}%` }} title={`线上: ${data.online}`} />
        <span className="stacked-seg ai" style={{ width: `${aiPct}%` }} title={`AI: ${data.ai}`} />
        <span className="stacked-seg op" style={{ width: `${opPct}%` }} title={`OP: ${data.op}`} />
      </div>
      <div className="stacked-inline-meta">
        <span>
          <i className="legend-dot legend-online" />线上 {data.online}
        </span>
        <span>
          <i className="legend-dot legend-ai" />AI {data.ai}
        </span>
        <span>
          <i className="legend-dot legend-op" />OP {data.op}
        </span>
      </div>
    </>
  );
}

function MetricCard({ title, subtitle, avg, share, sampleLabel }: { title: string; subtitle: string; avg: Triple; share: Triple; sampleLabel: string }) {
  return (
    <div className="metric-card">
      <div className="metric-card-head">
        <h4>{title}</h4>
        <span className="metric-subnote">{subtitle}</span>
      </div>

      <div className="metric-chip">{sampleLabel}</div>

      <div className="metric-block">
        <div className="metric-title">版本均分（目标线 8.0）</div>
        <BulletMetric label="线上" value={avg.online} />
        <BulletMetric label="AI" value={avg.ai} />
        <BulletMetric label="OP" value={avg.op} />
      </div>

      <div className="metric-block">
        <div className="metric-title">最佳版本占比（100% 堆叠）</div>
        <StackedShare data={share} />
      </div>
    </div>
  );
}

export function AnalyticsPage() {
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
  const [distributionView, setDistributionView] = useState<"heatmap" | "grouped">("heatmap");

  const query = trpc.analytics.summary.useQuery({
    moduleId: "about",
    uploader: appliedFilters.uploader || undefined,
    country: appliedFilters.country || undefined,
    startDate: appliedFilters.startDate || undefined,
    endDate: appliedFilters.endDate || undefined,
  });

  const overallAverages =
    query.data?.metrics?.overall?.versionAverages ??
    query.data?.versionAverages ?? {
      online: 0,
      ai: 0,
      op: 0,
    };
  const overallBestShare =
    query.data?.metrics?.overall?.bestVersionShare ??
    query.data?.bestVersionShare ?? {
      online: 0,
      ai: 0,
      op: 0,
    };
  const opSubsetAverages =
    query.data?.metrics?.opSubset?.versionAverages ?? {
      online: 0,
      ai: 0,
      op: 0,
    };
  const opSubsetBestShare =
    query.data?.metrics?.opSubset?.bestVersionShare ?? {
      online: 0,
      ai: 0,
      op: 0,
    };
  const totalValidRows = query.data?.metrics?.totalValidRows ?? 0;
  const opEligibleRows = query.data?.metrics?.opEligibleRows ?? 0;
  const opCoverage = query.data?.metrics?.opCoverage ?? 0;
  const passMetrics = query.data?.metrics?.passMetrics;
  const publishPassCount = passMetrics?.publishPassCount ?? 0;
  const publishPassRate = passMetrics?.publishPassRate ?? 0;

  const heatmapData = useMemo(() => {
    const byVersion = query.data?.scoreDistributionByVersion as Record<"online" | "ai" | "op", HeatBucket[]> | undefined;
    if (!byVersion) return null;
    const maxCount = Math.max(
      1,
      ...byVersion.online.map((item) => item.count),
      ...byVersion.ai.map((item) => item.count),
      ...byVersion.op.map((item) => item.count),
    );
    return { byVersion, maxCount };
  }, [query.data]);

  const versions: Array<"online" | "ai" | "op"> = ["online", "ai", "op"];
  const aiOnlineLift = Number((overallAverages.ai - overallAverages.online).toFixed(1));
  const opAiLift = Number((overallAverages.op - overallAverages.ai).toFixed(1));

  function applyFilters() {
    setAppliedFilters({
      uploader: draftUploader,
      country: draftCountry,
      startDate: draftStartDate,
      endDate: draftEndDate,
    });
  }

  function clearFilters() {
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

  return (
    <>
      <div className="card analytics-filter-shell">
        <h2>评估看板</h2>

        <section className="filter-panel analytics-filters">
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
                <Select.Trigger className="select-trigger" aria-label="uploader-analytics">
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
                <Select.Trigger className="select-trigger" aria-label="country-analytics">
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

      <div className="card analytics-result-shell">
        <div className="results-section-title">分析结果</div>

        {query.data && (
          <>
            <div className="kpi-row">
              <div className="kpi-card">
                <span className="kpi-label">有效样本</span>
                <strong className="kpi-value">{totalValidRows}</strong>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">AI-线上提升</span>
                <strong className="kpi-value">{aiOnlineLift}</strong>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">OP-AI提升</span>
                <strong className="kpi-value">{opAiLift}</strong>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">通过数量</span>
                <strong className="kpi-value">{publishPassCount}</strong>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">通过率</span>
                <strong className="kpi-value">{publishPassRate}%</strong>
              </div>
            </div>

            <div className="metric-dual-grid">
              <MetricCard
                title="全量视角"
                subtitle="无 OP 样本不会计入 OP 胜出"
                avg={overallAverages}
                share={overallBestShare}
                sampleLabel={`样本 n=${totalValidRows} · OP 覆盖率 ${opCoverage}%`}
              />
              <MetricCard
                title="OP 子集视角"
                subtitle="仅有 OP 样本参与三版本对比"
                avg={opSubsetAverages}
                share={opSubsetBestShare}
                sampleLabel={`样本 n=${opEligibleRows}`}
              />
            </div>

            <div className="card">
              <div className="dist-header">
                <h3>分数分布热力图</h3>
                <div className="dist-view-switch">
                  <button
                    type="button"
                    className={`tabs-trigger ${distributionView === "heatmap" ? "active-local" : ""}`}
                    onClick={() => setDistributionView("heatmap")}
                  >
                    热力图
                  </button>
                  <button
                    type="button"
                    className={`tabs-trigger ${distributionView === "grouped" ? "active-local" : ""}`}
                    onClick={() => setDistributionView("grouped")}
                  >
                    分组柱状图
                  </button>
                </div>
              </div>

              {heatmapData && (
                <>
                  {distributionView === "heatmap" ? (
                    <div className="heatmap-grid-wrap">
                      <div className="heatmap-header-row">
                        <span className="heatmap-corner">版本 / 分档</span>
                        {heatmapData.byVersion.ai.map((bucket) => (
                          <span className="heatmap-col-header" key={bucket.label}>
                            {bucket.label}
                          </span>
                        ))}
                      </div>

                      {versions.map((version) => (
                        <div className="heatmap-row" key={version}>
                          <span className="heatmap-row-header">{versionLabel(version)}</span>
                          {heatmapData.byVersion[version].map((bucket) => {
                            const ratio = heatmapData.maxCount > 0 ? bucket.count / heatmapData.maxCount : 0;
                            const alpha = 0.12 + ratio * 0.78;
                            return (
                              <span
                                className="heatmap-cell"
                                key={`${version}-${bucket.label}`}
                                title={`${versionLabel(version)} / ${bucket.label}: ${bucket.count}`}
                                style={{
                                  backgroundColor: `rgba(0,79,254,${alpha.toFixed(2)})`,
                                  color: ratio > 0.52 ? "#fff" : "#000",
                                }}
                              >
                                {bucket.count}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grouped-bars-wrap">
                      <div className="grouped-legend">
                        <span>
                          <i className="legend-dot legend-online" />线上
                        </span>
                        <span>
                          <i className="legend-dot legend-ai" />AI
                        </span>
                        <span>
                          <i className="legend-dot legend-op" />OP
                        </span>
                      </div>
                      <div className="grouped-bars-grid">
                        {heatmapData.byVersion.ai.map((bucket, index) => {
                          const onlineCount = heatmapData.byVersion.online[index]?.count ?? 0;
                          const aiCount = heatmapData.byVersion.ai[index]?.count ?? 0;
                          const opCount = heatmapData.byVersion.op[index]?.count ?? 0;
                          const max = heatmapData.maxCount || 1;
                          return (
                            <div className="bucket-col" key={bucket.label}>
                              <div className="bucket-bars">
                                <span className="bucket-bar online" style={{ height: `${(onlineCount / max) * 100}%` }} title={`线上 ${onlineCount}`} />
                                <span className="bucket-bar ai" style={{ height: `${(aiCount / max) * 100}%` }} title={`AI ${aiCount}`} />
                                <span className="bucket-bar op" style={{ height: `${(opCount / max) * 100}%` }} title={`OP ${opCount}`} />
                              </div>
                              <span className="bucket-label">{bucket.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
