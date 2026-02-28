import { describe, expect, it } from "vitest";
import { collectPassMetrics, ratePercent } from "./passMetrics";

describe("pass metrics", () => {
  it("calculates rates with OP rows", () => {
    const result = collectPassMetrics([
      { passOnline: 1, passAi: 1, passOp: 1, scoreOpTotal: "8.8" },
      { passOnline: 0, passAi: 1, passOp: 0, scoreOpTotal: "7.2" },
      { passOnline: 1, passAi: 0, passOp: null, scoreOpTotal: null },
    ]);

    expect(result.validRowCount).toBe(3);
    expect(result.opEligibleRowCount).toBe(2);
    expect(result.publishPassCount).toBe(3);
    expect(result.publishPassRate).toBe(100);
    expect(result.onlinePassCount).toBe(2);
    expect(result.aiPassCount).toBe(2);
    expect(result.opPassCount).toBe(1);
    expect(result.onlinePassRate).toBe(66.7);
    expect(result.aiPassRate).toBe(66.7);
    expect(result.opPassRate).toBe(50);
    expect(result.aiPassLift).toBe(0);
  });

  it("returns zero-safe rates without OP rows", () => {
    const result = collectPassMetrics([
      { passOnline: 0, passAi: 1, passOp: null, scoreOpTotal: null },
      { passOnline: 0, passAi: 0, passOp: null, scoreOpTotal: null },
    ]);

    expect(result.hasOpData).toBe(false);
    expect(result.opEligibleRowCount).toBe(0);
    expect(result.publishPassCount).toBe(1);
    expect(result.publishPassRate).toBe(50);
    expect(result.opPassRate).toBe(0);
    expect(result.aiPassRate).toBe(50);
    expect(result.aiPassLift).toBe(50);
  });

  it("ratePercent rounds to one decimal", () => {
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(0, 0)).toBe(0);
  });
});
