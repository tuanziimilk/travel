import { describe, expect, it } from "vitest";
import { sortVersionsForTie, validateScoreOutput } from "./scoreValidator";

function validBase(expectOp = false) {
  return {
    meta: {
      TermID: "1",
      Domain: "example.com",
      Country: "US",
      versions_present: expectOp ? ["online", "ai", "op"] : ["online", "ai"],
    },
    results: [
      {
        version: "online",
        score_total: 8.0,
        score_breakdown: { A: 2.0, B: 3.0, C: 2.0, D: 1.0 },
        strengths: ["A ok", "B ok", "C ok"],
        weaknesses: ["w1", "w2", "w3"],
        suggestions: ["s1", "s2"],
        pass_for_publish: true,
      },
      {
        version: "ai",
        score_total: 7.9,
        score_breakdown: { A: 2.1, B: 2.9, C: 1.9, D: 1.0 },
        strengths: ["A ok", "B ok", "C ok"],
        weaknesses: ["w1", "w2", "w3"],
        suggestions: ["s1", "s2"],
        pass_for_publish: false,
      },
    ],
    comparison: {
      best_version: "online",
      ranking: ["online", "ai"],
      key_deltas: ["d1", "d2"],
    },
    notes: "ok",
  } as const;
}

describe("score validator", () => {
  it("校验 schema 与规则通过", () => {
    const data = validBase(false);
    const res = validateScoreOutput(data, { expectOp: false, termName: "RealMerchant" });
    expect(res.ok).toBe(true);
  });

  it("OP 缺失时自动剔除 op 版本", () => {
    const data: any = validBase(false);
    data.meta.versions_present = ["online", "ai", "op"];
    data.results.push({
      version: "op",
      score_total: 7.0,
      score_breakdown: { A: 2.0, B: 2.0, C: 2.0, D: 1.0 },
      strengths: ["a", "b", "c"],
      weaknesses: ["a", "b", "c"],
      suggestions: ["a", "b"],
      pass_for_publish: false,
    });
    data.comparison = { best_version: "online", ranking: ["online", "ai", "op"], key_deltas: ["x", "y"] };
    const res = validateScoreOutput(data, { expectOp: false, termName: "" });
    expect(res.ok).toBe(true);
    expect(res.parsed?.results.some((item) => item.version === "op")).toBe(false);
  });

  it("同分按 B/A/版本优先级排序", () => {
    const ranking = sortVersionsForTie([
      {
        version: "online",
        score_total: 8.0,
        score_breakdown: { A: 2.5, B: 3.0, C: 1.5, D: 1.0 },
      },
      {
        version: "ai",
        score_total: 8.0,
        score_breakdown: { A: 2.4, B: 3.0, C: 1.6, D: 1.0 },
      },
      {
        version: "op",
        score_total: 8.0,
        score_breakdown: { A: 2.4, B: 3.0, C: 1.6, D: 1.0 },
      },
    ] as any);
    expect(ranking).toEqual(["online", "op", "ai"]);
  });

  it("pass_for_publish 自动按规则回填", () => {
    const data: any = validBase(false);
    data.results[0].pass_for_publish = false;
    const res = validateScoreOutput(data, { expectOp: false, termName: "" });
    expect(res.ok).toBe(true);
    expect(res.parsed?.results[0]?.pass_for_publish).toBe(true);
  });

  it("TermName 泄漏仅扣分不自动替换", () => {
    const data: any = validBase(false);
    data.results[0].strengths[0] = "example.com provides quality";
    const res = validateScoreOutput(data, { expectOp: false, termName: "example.com" });
    expect(res.ok).toBe(true);
    expect(res.parsed?.results[0]?.strengths[0]).toContain("example.com");
    expect(Number(res.parsed?.results[0]?.score_breakdown.A || 0)).toBeLessThan(2);
  });
  it("expectOp=true but missing op version should not hard fail", () => {
    const data: any = validBase(true);
    const res = validateScoreOutput(data, { expectOp: true, termName: "" });
    expect(res.ok).toBe(true);
    expect(res.parsed?.results.some((item) => item.version === "op")).toBe(false);
    expect(res.parsed?.notes).toContain("op version");
  });
});
