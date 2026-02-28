import * as Accordion from "@radix-ui/react-accordion";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

const PIN_KEY = "manual_pin_bundle_v1";

const schema = z.object({
  TermID: z.string().optional().default(""),
  TermName: z.string().optional().default(""),
  Domain: z.string().optional().default(""),
  Country: z.string().min(2, "Country 必填"),
  About_online: z.string().min(1, "About-线上必填"),
  About_ai: z.string().min(1, "About-AI优化必填"),
  About_op: z.string().optional().default(""),
  uploader: z.enum(uploaderOptions),
  batchNote: z.string().optional().default(""),
  saveToHistory: z.boolean().optional().default(true),
});

type FormData = z.infer<typeof schema>;

type ScoreResponse = {
  output: {
    results: Array<{
      version: "online" | "ai" | "op";
      score_total: number;
      score_breakdown: { A: number; B: number; C: number; D: number };
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
      pass_for_publish: boolean;
    }>;
    comparison: {
      best_version: "online" | "ai" | "op";
      ranking: Array<"online" | "ai" | "op">;
      key_deltas?: string[];
    };
    notes?: string;
  };
  runtime: {
    elapsedMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    aiModel: string;
  };
  saved?: boolean;
  batchId?: string;
};

type PinBundle = {
  form: FormData;
  result: ScoreResponse;
};

const defaultValues: FormData = {
  TermID: "",
  TermName: "",
  Domain: "",
  Country: "UK",
  About_online: "",
  About_ai: "",
  About_op: "",
  uploader: "Zoe",
  batchNote: "",
  saveToHistory: true,
};

const demoCase: FormData = {
  TermID: "225262",
  TermName: "Elite Pro Sports",
  Domain: "eliteprosports.co.uk",
  Country: "UK",
  uploader: "Zoe",
  batchNote: "",
  saveToHistory: true,
  About_online:
    "Yorkshire-based {Mer.} is an online sports shop with a focus on distribution, e-commerce, and sports franchises. The team at {Mer.} has developed core product categories such performance sports apparel and protection gear using their revolutionary vision and technology viewpoint. They have over 30 years of experience in production, retail, and e-commerce in the sporting goods business. Almost all sports demand certain equipment. Even jogging, which is arguably the most basic of all activities, calls for a pair of shoes that are cozy and supportive for the majority of people. In light of this, owning a franchise that focuses on standard apparel and equipment for athletic activities has significant potential. The sporting goods market as a whole is enormous.",
  About_ai:
    "{Mer.} is a Yorkshire-based online sports retailer and manufacturer specialising in apparel for professional sports clubs, including rugby, football and netball. Based in Doncaster, South Yorkshire, {Mer.} owns the OXEN Sports brand and supplies technical kits, fan apparel and teamwear for a range of sporting disciplines. Services include kit manufacturing, e-commerce operations, warehousing, distribution and fulfilment, along with online store management for partner clubs and organisations. With over 30 years of experience in production, retail and e-commerce, {Mer.} focuses on providing a consistent range of sports clothing and equipment that supports team identity and fan engagement across the UK.",
  About_op:
    "Elite Pro Sports (eliteprosports.co.uk) is a Yorkshire-based online sports retailer and manufacturer specializing in apparel for professional sports clubs, including rugby, football, and netball. They provide full retail, warehousing, and fulfillment services, and own the brand OXEN Sports. Key details: specialization in team kit manufacturing and e-commerce; owns and operates OXEN Sports; offers warehousing, distribution, and online store management; based in Doncaster, South Yorkshire. They are known for supplying fan apparel and professional team kits across multiple sporting disciplines.",
};

const dimMeta = [
  { key: "A", max: 3, label: "A 基础规范" },
  { key: "B", max: 4, label: "B 业务完整" },
  { key: "C", max: 2, label: "C SEO语义" },
  { key: "D", max: 1, label: "D 可读与本土化" },
] as const;

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatDuration(ms: number) {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}秒`;
  const minutes = Math.floor(sec / 60);
  const restSec = Math.round(sec % 60);
  return `${minutes}分${restSec}秒`;
}

function getVersionTitle(version: "online" | "ai" | "op") {
  if (version === "online") return "About-线上";
  if (version === "ai") return "About-AI优化";
  return "About-OP复核";
}

function safeParsePin() {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinBundle;
  } catch {
    return null;
  }
}

export function ManualPage() {
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [showPinned, setShowPinned] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const scoreMutation = trpc.score.manual.useMutation();

  const watchedOnline = form.watch("About_online");
  const watchedAi = form.watch("About_ai");
  const watchedOp = form.watch("About_op");

  const runtime = result?.runtime;
  const estimatedUsd = runtime?.estimatedCostUsd ?? 0;
  const estimatedCny = estimatedUsd * 7;

  async function runScore(input: FormData, persistResult = true) {
    const payload = {
      ...input,
      About_op: input.About_op?.trim() ? input.About_op : "",
    };
    const scored = await scoreMutation.mutateAsync(payload);
    setResult(scored as ScoreResponse);

    if (persistResult) {
      const pin: PinBundle = { form: input, result: scored as ScoreResponse };
      localStorage.setItem(PIN_KEY, JSON.stringify(pin));
    }
    return scored;
  }

  async function onSubmit(values: FormData) {
    setShowPinned(false);
    await runScore(values, false);
  }

  async function onPinToggle() {
    if (showPinned) {
      setShowPinned(false);
      setResult(null);
      form.reset(defaultValues);
      return;
    }

    const pin = safeParsePin();
    if (pin?.form && pin?.result) {
      form.reset(pin.form);
      setResult(pin.result);
      setShowPinned(true);
      return;
    }

    form.reset(demoCase);
    setShowPinned(true);
    await runScore({ ...demoCase, saveToHistory: false }, true);
  }

  const viewData = useMemo(() => result, [result]);

  return (
    <>
      <div className="section-header">
        <h2>手动评分</h2>
        <p>输入 online / ai（可选 op），触发 AI 评分并查看结构化结果。</p>
      </div>

      <button className="pin-btn" type="button" onClick={onPinToggle}>
        {showPinned ? "取消 PIN（隐藏测试结果）" : "PIN 测试案例（自动填充并展示结果）"}
      </button>

      {showPinned && <div className="pin-tip">当前显示 PIN 测试结果（全局持久化，可跨刷新复用）。</div>}

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid">
        <div className="info-grid">
          <div className="info-item">
            <label>TermID</label>
            <input {...form.register("TermID")} />
          </div>
          <div className="info-item">
            <label>TermName</label>
            <input {...form.register("TermName")} />
          </div>
          <div className="info-item">
            <label>Domain</label>
            <input {...form.register("Domain")} />
          </div>
          <div className="info-item">
            <label>Country</label>
            <Select.Root
              value={form.watch("Country") || ""}
              onValueChange={(value) => form.setValue("Country", value, { shouldValidate: true })}
            >
              <Select.Trigger className="select-trigger" aria-label="country-manual">
                <Select.Value placeholder="选择国家" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {countryOptions.map((code) => (
                      <Select.Item className="select-item" key={code} value={code}>
                        <Select.ItemText>{code}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div className="info-item">
            <label>Uploader</label>
            <Select.Root
              value={form.watch("uploader")}
              onValueChange={(value) => form.setValue("uploader", value as FormData["uploader"], { shouldValidate: true })}
            >
              <Select.Trigger className="select-trigger" aria-label="uploader-manual">
                <Select.Value placeholder="选择 uploader" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {uploaderOptions.map((name) => (
                      <Select.Item className="select-item" key={name} value={name}>
                        <Select.ItemText>{name}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div className="info-item">
            <label>备注（可选）</label>
            <input {...form.register("batchNote")} placeholder="例如：测试 / 版本回归" />
          </div>
        </div>

        <div className="compare-grid">
          <div className="text-box">
            <h3>About-线上</h3>
            <textarea {...form.register("About_online")} />
            <div className="word-count">字数：{countWords(watchedOnline)} 词</div>
          </div>
          <div className="text-box ai-box">
            <h3>About-AI优化</h3>
            <textarea {...form.register("About_ai")} />
            <div className="word-count">字数：{countWords(watchedAi)} 词</div>
          </div>
          <div className="text-box op-box">
            <h3>About-OP复核（可选）</h3>
            <textarea {...form.register("About_op")} />
            <div className="word-count">字数：{countWords(watchedOp)} 词</div>
          </div>
        </div>

        {scoreMutation.error && <div className="error-text">评分失败：{scoreMutation.error.message}</div>}

        <button className="score-action-btn" type="submit" disabled={scoreMutation.isPending}>
          {scoreMutation.isPending ? "评分中..." : "评分对比"}
        </button>
      </form>

      {viewData && (
        <>
          <div className="receipt-box">
            <div className="receipt-item">
              <span className="receipt-label">耗时</span>
              <span className="receipt-val">{formatDuration(runtime?.elapsedMs ?? 0)}</span>
              <div className="receipt-sub">原始值：{runtime?.elapsedMs ?? 0}ms</div>
            </div>
            <div className="receipt-item">
              <span className="receipt-label">Token</span>
              <span className="receipt-val token-blue">
                {runtime?.promptTokens ?? 0}/{runtime?.completionTokens ?? 0}/{runtime?.totalTokens ?? 0}
              </span>
              <div className="receipt-sub">输入 / 输出 / 总计</div>
            </div>
            <div className="receipt-item">
              <span className="receipt-label">估算费用</span>
              <span className="receipt-val token-pink">${estimatedUsd.toFixed(6)}</span>
              <div className="receipt-sub">≈ ¥{estimatedCny.toFixed(4)}（按 1:7）</div>
            </div>
            <div className="receipt-item">
              <span className="receipt-label">模型</span>
              <span className="receipt-val">{runtime?.aiModel || "-"}</span>
              <div className="receipt-sub">本次评分调用模型</div>
            </div>
          </div>

          <Tabs.Root defaultValue="results">
            <Tabs.List className="tabs-list">
              <Tabs.Trigger className="tabs-trigger" value="results">
                分项结果
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="comparison">
                对比可视化
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="raw">
                原始 JSON
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="results">
              <div className="results-container">
                {viewData.output.results.map((item) => (
                  <div className={`result-card ${item.version === "ai" ? "result-ai" : ""}`} key={item.version}>
                    <div className={`status-stamp ${item.pass_for_publish ? "status-ready" : "status-needs-fix"}`}>
                      {item.pass_for_publish ? "可发布" : "需优化"}
                    </div>

                    <span className="score-title">{getVersionTitle(item.version)}</span>
                    <div className="score-big">
                      {item.score_total.toFixed(1)}
                      <small>/10</small>
                    </div>

                    {dimMeta.map((dim) => {
                      const value = item.score_breakdown[dim.key];
                      const pct = Math.max(0, Math.min(100, (value / dim.max) * 100));
                      return (
                        <div className="progress-group" key={dim.key}>
                          <div className="progress-label">
                            <span>{dim.label}</span>
                            <span>
                              {value.toFixed(1)} / {dim.max.toFixed(1)}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}

                    <Accordion.Root type="single" collapsible>
                      <Accordion.Item value={`detail-${item.version}`}>
                        <Accordion.Header>
                          <Accordion.Trigger className="suggest-btn">查看优势与建议</Accordion.Trigger>
                        </Accordion.Header>
                        <Accordion.Content className="suggest-content">
                          <div>
                            <strong>优势</strong>
                            <ul>
                              {item.strengths.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <strong>劣势</strong>
                            <ul>
                              {item.weaknesses.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <strong>建议</strong>
                            <ul>
                              {item.suggestions.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          </div>
                        </Accordion.Content>
                      </Accordion.Item>
                    </Accordion.Root>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="comparison">
              <div className="card">
                <h3>版本排名</h3>
                <div className="ranking-grid">
                  {viewData.output.comparison.ranking.map((version, index) => {
                    const width = Math.max(30, 100 - index * 22);
                    return (
                      <div key={version} className="rank-row">
                        <span className="rank-tag">#{index + 1}</span>
                        <span className="rank-name">{getVersionTitle(version)}</span>
                        <div className="rank-track">
                          <div className="rank-fill" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="comparison-notes">
                  <p>
                    <strong>最佳版本：</strong>
                    {getVersionTitle(viewData.output.comparison.best_version)}
                  </p>
                  {viewData.output.comparison.key_deltas?.length ? (
                    <>
                      <strong>关键差异</strong>
                      <ul>
                        {viewData.output.comparison.key_deltas.map((delta) => (
                          <li key={delta}>{delta}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="raw">
              <pre>{JSON.stringify(viewData, null, 2)}</pre>
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </>
  );
}
