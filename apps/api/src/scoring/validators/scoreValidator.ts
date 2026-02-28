import { ScoreOutput, scoreOutputSchema } from "@about-demo/trpc";

const round1 = (value: number) => Math.round(value * 10) / 10;

function hasOneDecimal(value: number) {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
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
  const textDump = JSON.stringify(doc);
  if (options.termName && options.termName.trim() && textDump.includes(options.termName.trim())) {
    errors.push("输出中包含 TermName，违反规则");
  }

  const versions = new Set(doc.meta.versions_present);
  const resultVersions = new Set(doc.results.map((item) => item.version));
  if (versions.size !== resultVersions.size || [...versions].some((item) => !resultVersions.has(item))) {
    errors.push("meta.versions_present 与 results.version 不一致");
  }

  if (!options.expectOp && (versions.has("op") || resultVersions.has("op"))) {
    errors.push("About_op 缺失时不应出现 op version");
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

    const shouldPass = row.score_total >= 8.0 && A >= 2.0 && B >= 3.0;
    if (row.pass_for_publish !== shouldPass) {
      errors.push(`${row.version} pass_for_publish 与规则不一致`);
    }
  }

  const expectedRanking = sortVersionsForTie(doc.results);
  if (expectedRanking.join("|") !== doc.comparison.ranking.join("|")) {
    errors.push("comparison.ranking 与并列规则不一致");
  }
  if (doc.comparison.best_version !== expectedRanking[0]) {
    errors.push("comparison.best_version 与 ranking[0] 不一致");
  }

  return { ok: errors.length === 0, errors, parsed: doc };
}

