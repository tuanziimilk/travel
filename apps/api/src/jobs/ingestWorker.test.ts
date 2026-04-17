import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildExportRows, dedupeStoredRowsKeepLatest, toXlsx } from "./ingestWorker";

describe("ingestWorker", () => {
  it("keeps deduped rows in original upload order via sourceRowIndex", () => {
    const rows = [
      {
        batchId: "b1",
        termId: "2",
        domain: "b.com",
        hashOnline: "h2",
        hashAi: "a2",
        hashOp: null,
        sourceRowIndex: 2,
        createdAt: new Date("2026-04-10T10:00:00Z"),
      },
      {
        batchId: "b1",
        termId: "1",
        domain: "a.com",
        hashOnline: "h1",
        hashAi: "a1",
        hashOp: null,
        sourceRowIndex: 1,
        createdAt: new Date("2026-04-10T10:00:01Z"),
      },
      {
        batchId: "b1",
        termId: "1",
        domain: "a.com",
        hashOnline: "h1",
        hashAi: "a1",
        hashOp: null,
        sourceRowIndex: 1,
        createdAt: new Date("2026-04-10T10:00:02Z"),
      },
    ] as any;

    const deduped = dedupeStoredRowsKeepLatest(rows);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((item) => item.termId)).toEqual(["1", "2"]);
    expect(deduped.map((item) => item.sourceRowIndex)).toEqual([1, 2]);
  });

  it("uses about publish rules in export rows", () => {
    const rows = [
      {
        batchId: "b1",
        termId: "1",
        termName: "Shop A",
        domain: "a.com",
        country: "US",
        scoreOnlineTotal: "8.6",
        scoreAiTotal: "8.2",
        scoreOpTotal: null,
        passOnline: 1,
        passAi: 1,
        passOp: null,
        bestVersion: "online",
        keyDeltas: [],
        errorReason: null,
        createdAt: "2026-04-10 18:00:00",
      },
      {
        batchId: "b1",
        termId: "2",
        termName: "Shop B",
        domain: "b.com",
        country: "US",
        scoreOnlineTotal: "7.8",
        scoreAiTotal: "8.6",
        scoreOpTotal: "8.6",
        passOnline: 0,
        passAi: 1,
        passOp: 1,
        bestVersion: "op",
        keyDeltas: [],
        errorReason: null,
        createdAt: "2026-04-10 18:00:01",
      },
    ] as Array<Record<string, unknown>>;

    const exportRows = buildExportRows(rows, { moduleId: "about" });

    expect(exportRows[0]["是否可发布"]).toBe("否");
    expect(exportRows[0]["可发布版本"]).toBe("");
    expect(exportRows[1]["是否可发布"]).toBe("是");
    expect(exportRows[1]["可发布版本"]).toBe("OP");
  });

  it("writes only the selected about publish version into the publish sheet", () => {
    const xlsxBase64 = toXlsx(
      [
        {
          batchId: "b1",
          termId: "1",
          termName: "Shop A",
          domain: "a.com",
          country: "US",
          scoreOnlineTotal: "7.8",
          scoreAiTotal: "8.4",
          scoreOpTotal: "8.6",
          passOnline: 0,
          passAi: 1,
          passOp: 1,
          bestVersion: "op",
          keyDeltas: [],
          snapshotAi: "AI about",
          snapshotOp: "OP about",
          errorReason: null,
          createdAt: "2026-04-10 18:00:00",
        },
        {
          batchId: "b1",
          termId: "2",
          termName: "Shop B",
          domain: "b.com",
          country: "US",
          scoreOnlineTotal: "8.5",
          scoreAiTotal: "8.2",
          scoreOpTotal: null,
          passOnline: 1,
          passAi: 1,
          passOp: null,
          bestVersion: "online",
          keyDeltas: [],
          snapshotAi: "AI lower than online",
          snapshotOp: "",
          errorReason: null,
          createdAt: "2026-04-10 18:00:01",
        },
      ],
      { rowCount: 2, validRowCount: 2, failedRows: 0, publishPassCount: 1, publishPassRate: 50 },
    );

    const workbook = XLSX.read(Buffer.from(xlsxBase64, "base64"), { type: "buffer" });
    const publishSheet = workbook.Sheets[workbook.SheetNames[2]];
    const publishRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(publishSheet, { defval: "" });

    expect(publishRows).toHaveLength(1);
    expect(publishRows[0].TermID).toBe("1");
    expect(publishRows[0].Source).toBe("OP");
    expect(publishRows[0]["Brief Introduction"]).toBe("OP about");
  });
});
