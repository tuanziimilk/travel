import { ScoreOutput, scoreOutputSchema } from "@about-demo/trpc";

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hasOneDecimal(value: number) {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTermNameLeak(text: string, termNameRaw: string) {
  const termName = termNameRaw.trim();
  if (!termName) return false;
  const pattern = new RegExp(escapeRegExp(termName), "i");
  return pattern.test(text);
}

const HIGH_RISK_PATTERNS = [
  /高风险|redline|red line/iu,
  /叠加.*(冲突|矛盾)|是否叠加.*(冲突|矛盾)/u,
  /生效.*(缺失|不清|模糊|未说明)|何时生效.*(缺失|不清|模糊|未说明)/u,
  /(适用范围|排除项|门槛).*(缺失|不清|模糊|未说明)/u,
  /(退款|取消).*(缺失|不清|模糊|未说明)/u,
  /永久|100%|全部可用|绝对化/u,
];

function hasHighRiskSignal(text: string) {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text));
}

function hasResultHighRisk(item: ScoreOutput["results"][number]): { hit: boolean; sources: string[] } {
  const sources: string[] = [];

  item.weaknesses.forEach((text, index) => {
    if (hasHighRiskSignal(text)) sources.push(`weaknesses[${index}]`);
  });

  item.suggestions.forEach((text, index) => {
    if (hasHighRiskSignal(text)) sources.push(`suggestions[${index}]`);
  });

  return { hit: sources.length > 0, sources };
}

function hasSeoNegativeSignal(item: ScoreOutput["results"][number]) {
  const text = [...item.weaknesses, ...item.suggestions].join(" ");
  return /(关键词.*(不足|缺失|堆砌)|问句.*(不贴|偏离).*(搜索|意图)|SEO.*(弱|不足))/u.test(text);
}

export type ValidateOptions = {
  termName?: string;
  expectOp: boolean;
};

export function sortVersionsForTie(results: ScoreOutput["results"]) {
  const priority: Record<string, number> = { op: 3, ai: 2, online: 1 };
  return [...results]
    .sort((a, b) => {
      if (b.score_total !== a.score_total) return b.score_total - a.score_total;
      if (b.score_breakdown.B !== a.score_breakdown.B) return b.score_breakdown.B - a.score_breakdown.B;
      if (b.score_breakdown.A !== a.score_breakdown.A) return b.score_breakdown.A - a.score_breakdown.A;
      return priority[b.version] - priority[a.version];
    })
    .map((item) => item.version);
}

export function validateScoreOutput(
  output: unknown,
  options: ValidateOptions,
): { ok: boolean; errors: string[]; parsed?: ScoreOutput } {
  const parsed = scoreOutputSchema.safeParse(output);
  const errors: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(issue.message);
    return { ok: false, errors };
  }

  const doc = parsed.data;

  const betterResult = (a: ScoreOutput["results"][number], b: ScoreOutput["results"][number]) => {
    if (a.score_total !== b.score_total) return a.score_total > b.score_total;
    if (a.score_breakdown.B !== b.score_breakdown.B) return a.score_breakdown.B > b.score_breakdown.B;
    if (a.score_breakdown.A !== b.score_breakdown.A) return a.score_breakdown.A > b.score_breakdown.A;
    return true;
  };

  const bestByVersion = new Map<"online" | "ai" | "op", ScoreOutput["results"][number]>();
  for (const row of doc.results) {
    const prev = bestByVersion.get(row.version);
    if (!prev || betterResult(row, prev)) {
      bestByVersion.set(row.version, row);
    }
  }

  const normalizedResults = (["online", "ai", "op"] as const)
    .map((version) => bestByVersion.get(version))
    .filter(Boolean) as ScoreOutput["results"];

  doc.results = options.expectOp ? normalizedResults : normalizedResults.filter((item) => item.version !== "op");

  const termName = options.termName?.trim() || "";

  const resultVersions = new Set(doc.results.map((item) => item.version));
  const opMissingWhenExpected = options.expectOp && !resultVersions.has("op");
  if (!resultVersions.has("online") || !resultVersions.has("ai")) {
    errors.push("results 必须包含 online 和 ai version");
  }

  doc.meta.versions_present = (["online", "ai", "op"] as const).filter((version) => resultVersions.has(version));

  for (const row of doc.results) {
    const leakInRowText = termName
      ? hasTermNameLeak(
          JSON.stringify({
            strengths: row.strengths,
            weaknesses: row.weaknesses,
            suggestions: row.suggestions,
          }),
          termName,
        )
      : false;

    row.score_total = round1(clamp(row.score_total, 0, 10));

    row.score_breakdown.A = round1(clamp(row.score_breakdown.A, 0, 3));
    row.score_breakdown.B = round1(clamp(row.score_breakdown.B, 0, 4));
    row.score_breakdown.C = round1(clamp(row.score_breakdown.C, 0, 2));
    row.score_breakdown.D = round1(clamp(row.score_breakdown.D, 0, 1));

    const sum = round1(
      row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D,
    );
    if (!hasOneDecimal(row.score_total) || Math.abs(sum - row.score_total) > 0.1) {
      row.score_total = sum;
    }

    const highRisk = hasResultHighRisk(row);

    if (highRisk.hit) {
      if (row.score_breakdown.B > 3.4) {
        row.score_breakdown.B = 3.4;
      }
      const cappedTotal = round1(
        row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D,
      );
      row.score_total = Math.min(7.9, cappedTotal);
    }

    if (row.score_breakdown.D >= 1.0 && hasSeoNegativeSignal(row)) {
      row.score_breakdown.D = 0.8;
      row.score_total = round1(
        row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D,
      );
      if (highRisk.hit) {
        row.score_total = Math.min(7.9, row.score_total);
      }
    }

    if (leakInRowText) {
      row.score_breakdown.A = round1(Math.max(0, row.score_breakdown.A - 1.0));
      row.score_total = round1(
        row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D,
      );
      row.weaknesses = ["未使用 {Mer.} 占位，出现商家名泄漏", ...row.weaknesses].slice(0, 6);
      row.suggestions = ["将商家名统一替换为 {Mer.}，避免真实名称出现在输出", ...row.suggestions].slice(0, 6);
    }

    const byThreshold = row.score_total >= 8.0 && row.score_breakdown.A >= 2.0 && row.score_breakdown.B >= 3.0;
    row.pass_for_publish = byThreshold && !highRisk.hit;
  }

  const expectedRanking = sortVersionsForTie(doc.results);
  if (!expectedRanking.length) {
    errors.push("results 不可为空");
  } else {
    doc.comparison.ranking = expectedRanking;
    doc.comparison.best_version = expectedRanking[0];
  }

  if (opMissingWhenExpected) {
    const warning = "输入包含 About_op，但模型未返回 op version；已降级为 online+ai 输出";
    doc.notes = doc.notes?.trim() ? `${doc.notes}\n${warning}` : warning;
  }

  return { ok: errors.length === 0, errors, parsed: doc };
}
