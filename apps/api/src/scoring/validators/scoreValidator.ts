import { ScoreOutput, scoreOutputSchema } from "@about-demo/trpc";

const round1 = (value: number) => Math.round(value * 10) / 10;

function hasOneDecimal(value: number) {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

const HIGH_RISK_PATTERNS = [
  /高风险|redline|red line/iu,
  /叠加.*(冲突|矛盾)|可否叠加.*(冲突|矛盾)/u,
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
  doc.results = normalizedResults;
  const textDump = JSON.stringify(doc);
  if (options.termName && options.termName.trim() && textDump.includes(options.termName.trim())) {
    errors.push("输出中包含 TermName，违反规则");
  }

  const versions = new Set(doc.meta.versions_present);
  const resultVersions = new Set(doc.results.map((item) => item.version));

  if (options.expectOp && !resultVersions.has("op")) {
    errors.push("About_op 存在时必须返回 op version");
  }

  if (!resultVersions.has("online") || !resultVersions.has("ai")) {
    errors.push("results 必须包含 online 与 ai version");
  }

  if (!options.expectOp && resultVersions.has("op")) {
    errors.push("About_op 缺失时不得输出 op version");
  }

  if (versions.size !== resultVersions.size || [...versions].some((item) => !resultVersions.has(item))) {
    errors.push("meta.versions_present 与 results versions 不一致");
  }

  for (const row of doc.results) {
    if (!hasOneDecimal(row.score_total)) errors.push(`${row.version} score_total 必须 1 位小数`);
    if (row.score_total < 0 || row.score_total > 10) errors.push(`${row.version} score_total 超范围`);

    const { A, B, C, D } = row.score_breakdown;
    if (![A, B, C, D].every(hasOneDecimal)) errors.push(`${row.version} breakdown 必须 1 位小数`);
    if (A < 0 || A > 3) errors.push(`${row.version}.A 超范围`);
    if (B < 0 || B > 4) errors.push(`${row.version}.B 超范围`);
    if (C < 0 || C > 2) errors.push(`${row.version}.C 超范围`);
    if (D < 0 || D > 1) errors.push(`${row.version}.D 超范围`);

    const sum = round1(A + B + C + D);
    if (Math.abs(sum - row.score_total) > 0.1) errors.push(`${row.version} A+B+C+D 与 total 误差 > 0.1`);

    const highRisk = hasResultHighRisk(row);

    if (highRisk.hit) {
      if (row.score_breakdown.B > 3.4) {
        row.score_breakdown.B = 3.4;
      }
      const cappedTotal = round1(row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D);
      row.score_total = Math.min(7.9, cappedTotal);
    }

    if (row.score_breakdown.D >= 1.0 && hasSeoNegativeSignal(row)) {
      row.score_breakdown.D = 0.8;
      row.score_total = round1(row.score_breakdown.A + row.score_breakdown.B + row.score_breakdown.C + row.score_breakdown.D);
      if (highRisk.hit) {
        row.score_total = Math.min(7.9, row.score_total);
      }
    }

    const byThreshold = row.score_total >= 8.0 && row.score_breakdown.A >= 2.0 && row.score_breakdown.B >= 3.0;
    const shouldPass = byThreshold && !highRisk.hit;
    if (row.pass_for_publish !== shouldPass) {
      errors.push(`${row.version} pass_for_publish 与规则不一致`);
    }

    if (highRisk.hit && row.pass_for_publish) {
      errors.push(`${row.version} pass_for_publish 命中高风险红线仍为 true`);
    }
  }

  const expectedRanking = sortVersionsForTie(doc.results);
  if (expectedRanking.join("|") !== doc.comparison.ranking.join("|")) {
    errors.push("comparison.ranking 与并列规则不一致");
  }
  if (doc.comparison.best_version !== expectedRanking[0]) {
    errors.push("comparison.best_version 与排序结果不一致");
  }

  return { ok: errors.length === 0, errors, parsed: doc };
}
