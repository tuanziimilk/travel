import { describe, expect, it } from "vitest";
import { GG_COLLECTED_SOURCE_COLUMN } from "./collectedSchema";
import {
  appendGgCleaningUploadChunk,
  appendGgCleaningUploadFileChunk,
  completeGgCleaningUpload,
  getCompletedGgCleaningUpload,
  initGgCleaningUpload,
  iterateGgCleaningUploadChunks,
} from "./uploadStore";

describe("gg cleaning upload store", () => {
  it("stores grouped row chunks without splitting and preserves chunk order", async () => {
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
          [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
          content: ["Shop A offers free shipping on orders over $50."],
          product_urls: ["https://shopa.com/shipping"],
        },
        {
          term_id: "101",
          country: "US",
          subclass: "shipping",
          domain: "shopa.com",
          term_name: "Shop A",
          [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
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
          [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
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
    expect(completed.kind).toBe("row-chunks");
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

  it("stores raw file chunks and validates the uploaded byte size", async () => {
    const first = Buffer.from("term_id,country\n101,US\n", "utf8");
    const second = Buffer.from("102,UK\n", "utf8");
    const initialized = await initGgCleaningUpload("fixture.csv", first.length + second.length);

    await appendGgCleaningUploadFileChunk({
      uploadId: initialized.uploadId,
      chunkIndex: 0,
      buffer: first,
    });
    await appendGgCleaningUploadFileChunk({
      uploadId: initialized.uploadId,
      chunkIndex: 1,
      buffer: second,
    });

    await completeGgCleaningUpload({
      uploadId: initialized.uploadId,
      chunkCount: 2,
    });

    const completed = await getCompletedGgCleaningUpload(initialized.uploadId);
    expect(completed.kind).toBe("file-chunks");
    expect(completed.rawFilePath).toBeTruthy();
    expect(completed.uploadedByteCount).toBe(first.length + second.length);
    expect(completed.chunkCount).toBe(2);
  });
});
