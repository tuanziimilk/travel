import { describe, expect, it } from "vitest";
import { appendGgCleaningUploadChunk, completeGgCleaningUpload, getCompletedGgCleaningUpload, initGgCleaningUpload, iterateGgCleaningUploadChunks } from "./uploadStore";

describe("gg cleaning upload store", () => {
  it("stores grouped chunks without splitting and preserves chunk order", async () => {
    const initialized = await initGgCleaningUpload("fixture.csv", 1024);

    await appendGgCleaningUploadChunk({
      uploadId: initialized.uploadId,
      chunkIndex: 0,
      groupCount: 1,
      rows: [
        {
          term_id: "101",
          country: "US",
          subclass: "shipping",
          domain: "shopa.com",
          term_name: "Shop A",
          "采集数据源": "ai_mode",
          content: ["Shop A offers free shipping on orders over $50."],
          product_urls: ["https://shopa.com/shipping"],
        },
        {
          term_id: "101",
          country: "US",
          subclass: "shipping",
          domain: "shopa.com",
          term_name: "Shop A",
          "采集数据源": "search_lab",
          content: ["Shipping policy: free delivery over $50."],
          product_urls: ["https://shopa.com/help/shipping"],
        },
      ],
    });

    await appendGgCleaningUploadChunk({
      uploadId: initialized.uploadId,
      chunkIndex: 1,
      groupCount: 1,
      rows: [
        {
          term_id: "102",
          country: "US",
          subclass: "app",
          domain: "shopb.com",
          term_name: "Shop B",
          "采集数据源": "ai_mode",
          content: ["Shop B offers an app-exclusive 10% discount."],
          product_urls: ["https://shopb.com/app"],
        },
      ],
    });

    await completeGgCleaningUpload({
      uploadId: initialized.uploadId,
      chunkCount: 2,
      groupCount: 2,
      oversizedGroupCount: 0,
    });

    const completed = await getCompletedGgCleaningUpload(initialized.uploadId);
    expect(completed.chunkCount).toBe(2);
    expect(completed.groupCount).toBe(2);
    expect(completed.uploadedRowCount).toBe(3);
    expect(completed.columns).toContain("term_id");
    expect(completed.columns).toContain("content");

    const chunks: Array<{ chunkIndex: number; rows: Array<Record<string, unknown>> }> = [];
    for await (const chunk of iterateGgCleaningUploadChunks(initialized.uploadId)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].rows).toHaveLength(2);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[1].rows[0]?.term_id).toBe("102");
  });
});
