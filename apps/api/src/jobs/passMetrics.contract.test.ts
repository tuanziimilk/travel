import { describe, expect, it } from "vitest";
import { collectPassMetrics } from "./passMetrics";

describe("passMetrics contract", () => {
  it("keeps analytics.summary passMetrics fields stable", () => {
    const passMetrics = collectPassMetrics([{ passOnline: 1, passAi: 1, passOp: null, scoreOpTotal: null }]);

    expect(passMetrics).toMatchInlineSnapshot(`
      {
        "aiPassCount": 1,
        "aiPassLift": 0,
        "aiPassRate": 100,
        "hasOpData": false,
        "onlinePassCount": 1,
        "onlinePassRate": 100,
        "opEligibleRowCount": 0,
        "opPassCount": 0,
        "opPassLift": -100,
        "opPassRate": 0,
        "publishPassCount": 1,
        "publishPassRate": 100,
        "validRowCount": 1,
      }
    `);
  });
});
