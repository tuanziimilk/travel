import {
  translationBatchInputCostPer1M,
  translationBatchOutputCostPer1M,
  translationDefaultAiModel,
  translationDefaultTargetLanguage,
  translationRealtimeChunkSize,
} from "@about-demo/trpc";
import { z } from "zod";
import { env } from "../env";

const translationTextResponseSchema = z.object({
  translatedText: z.string(),
  detectedLanguages: z.array(z.string()).default([]),
  dominantLanguage: z.string().default(""),
  isMixed: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.7),
});

const translationBatchItemSchema = z.object({
  i: z.string(),
  t: z.string(),
  detectedLanguages: z.preprocess((value) => (value == null ? [] : value), z.array(z.string())).optional(),
  dominantLanguage: z.preprocess((value) => (value == null ? "" : value), z.string()).optional(),
  isMixed: z.preprocess((value) => (value == null ? false : value), z.boolean()).optional(),
});

const translationBatchArraySchema = z.array(translationBatchItemSchema);

export type TranslationCellResult = z.infer<typeof translationTextResponseSchema>;

export type TranslationRuntime = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  aiModel: string;
};

export type TranslationCellInput = {
  i: string;
  t: string;
};

export type TranslationCellOutput = {
  i: string;
  translatedText: string;
  detectedLanguages: string[];
  dominantLanguage: string;
  isMixed: boolean;
};

type OpenAiChatResponse = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string;
    };
    finish_reason?: string | null;
  }>;
};

type OpenAiBatchJob = {
  id: string;
  status: string;
  input_file_id?: string | null;
  output_file_id?: string | null;
  error_file_id?: string | null;
  errors?: {
    data?: Array<{ message?: string }>;
  };
};

type OpenAiBatchOutputLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: OpenAiChatResponse;
  };
  error?: {
    message?: string;
  };
};

function estimateCostUsd(promptTokens: number, completionTokens: number, mode: "realtime" | "batch") {
  const inputPer1M = mode === "batch" ? translationBatchInputCostPer1M : env.translationAiInputCostPer1M;
  const outputPer1M = mode === "batch" ? translationBatchOutputCostPer1M : env.translationAiOutputCostPer1M;
  const usd = (promptTokens / 1_000_000) * inputPer1M + (completionTokens / 1_000_000) * outputPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function estimateTokensFromText(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  return Math.max(4, Math.ceil(normalized.length / 2.8));
}

function parseJsonAttempts(attempts: string[]) {
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // ignore and keep trying looser candidates
    }
  }
  throw new Error("模型返回的 JSON 无法解析。");
}

function normalizeArrayCandidate(raw: string) {
  const normalized = String(raw || "").trim();
  const attempts = [normalized];
  const fenceMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) attempts.push(fenceMatch[1].trim());

  const arrayMatch = normalized.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) attempts.push(arrayMatch[0].trim());

  const objectItemsMatch = normalized.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objectItemsMatch?.[0]) attempts.push(objectItemsMatch[0].trim());

  const parsed = parseJsonAttempts(attempts);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)) {
    return (parsed as { items: unknown[] }).items;
  }
  throw new Error("模型返回的数组 JSON 无法解析。");
}

function normalizeObjectCandidate(raw: string) {
  const normalized = String(raw || "").trim();
  const attempts = [normalized];
  const fenceMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) attempts.push(fenceMatch[1].trim());

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(normalized.slice(firstBrace, lastBrace + 1).trim());
  }

  return parseJsonAttempts(attempts);
}

function extractContent(json: OpenAiChatResponse) {
  const direct = json.choices?.[0]?.message?.content;
  if (typeof direct === "string" && direct.trim()) return direct;

  if (Array.isArray(direct)) {
    const joined = direct
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  const refusal = json.choices?.[0]?.message?.refusal;
  if (typeof refusal === "string" && refusal.trim()) throw new Error(`LLM 拒绝回答: ${refusal}`);
  throw new Error("LLM 返回为空。");
}

function getPrimaryFinishReason(json: OpenAiChatResponse) {
  return String(json.choices?.[0]?.finish_reason || "").trim();
}

function isAbortLikeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { name?: string; message?: string };
  return maybeError.name === "AbortError" || String(maybeError.message || "").includes("aborted");
}

async function callChatCompletions(body: Record<string, unknown>, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${env.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.aiApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(`翻译请求失败: ${response.status} ${raw}`);
  return JSON.parse(raw) as OpenAiChatResponse;
}

async function callChatCompletionsWithRetry(body: Record<string, unknown>, timeoutMs: number, maxRetries: number) {
  let attempt = 0;
  for (;;) {
    try {
      return await callChatCompletions(body, timeoutMs);
    } catch (error) {
      if (!isAbortLikeError(error) || attempt >= maxRetries) throw error;
      attempt += 1;
      const delayMs = Math.min(5_000, 1_000 * attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function callOpenAiJson<T>(path: string, init: RequestInit, timeoutMs = env.aiRequestTimeoutMsBatch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${env.aiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.aiApiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI 请求失败: ${response.status} ${raw}`);
  return JSON.parse(raw) as T;
}

async function callOpenAiText(path: string, init: RequestInit, timeoutMs = env.aiRequestTimeoutMsBatch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${env.aiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.aiApiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI 请求失败: ${response.status} ${raw}`);
  return raw;
}

async function uploadBatchFile(content: string) {
  const formData = new FormData();
  formData.append("purpose", "batch");
  formData.append("file", new Blob([content], { type: "application/jsonl" }), "translation-batch.jsonl");
  return callOpenAiJson<{ id: string }>("/files", { method: "POST", body: formData });
}

function buildRealtimeBatchPrompt(targetLanguage: string, items: TranslationCellInput[]) {
  return {
    model: env.translationAiModel || translationDefaultAiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `Translate all "t" fields to ${targetLanguage || translationDefaultTargetLanguage}. Return JSON only as {"items":[...]}. ` +
          'Keep "i" unchanged. For each item return fields: i, t, detectedLanguages, dominantLanguage, isMixed.',
      },
      {
        role: "user",
        content: JSON.stringify(items, null, 0),
      },
    ],
  } satisfies Record<string, unknown>;
}

function parseRealtimeBatchResponse(content: string) {
  const array = normalizeArrayCandidate(content);
  const parsed = translationBatchArraySchema.parse(array);
  return parsed.map((item) => ({
    i: item.i,
    translatedText: item.t,
    detectedLanguages: item.detectedLanguages ?? [],
    dominantLanguage: item.dominantLanguage ?? "",
    isMixed: item.isMixed ?? false,
  }));
}

function buildTextPrompt(targetLanguage: string, text: string) {
  return {
    model: env.translationAiModel || translationDefaultAiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a multilingual translation engine for mixed-language business content. " +
          "Translate the full text to the target language and detect the source languages. " +
          'Return exactly one JSON object with keys "translatedText", "detectedLanguages", "dominantLanguage", "isMixed", "confidence". ' +
          '"translatedText" must be a string, "detectedLanguages" must be an array of language names, "dominantLanguage" must be a string, "isMixed" must be a boolean, and "confidence" must be a number between 0 and 1. ' +
          "Do not wrap the JSON in markdown and do not add any explanation.",
      },
      {
        role: "user",
        content: `Target language: ${targetLanguage || translationDefaultTargetLanguage}\n\n${text}`,
      },
    ],
  } satisfies Record<string, unknown>;
}

function parseTextResponse(content: string) {
  const parsedUnknown = normalizeObjectCandidate(content);
  const parsedObject =
    parsedUnknown && typeof parsedUnknown === "object" && !Array.isArray(parsedUnknown)
      ? (parsedUnknown as Record<string, unknown>)
      : null;

  if (!parsedObject) {
    throw new Error("文本翻译结果解析失败。");
  }

  const normalized = {
    translatedText:
      typeof parsedObject.translatedText === "string"
        ? parsedObject.translatedText
        : typeof parsedObject.t === "string"
          ? parsedObject.t
          : "",
    detectedLanguages: Array.isArray(parsedObject.detectedLanguages)
      ? parsedObject.detectedLanguages.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsedObject.languages)
        ? parsedObject.languages.filter((item): item is string => typeof item === "string")
        : [],
    dominantLanguage:
      typeof parsedObject.dominantLanguage === "string"
        ? parsedObject.dominantLanguage
        : typeof parsedObject.primaryLanguage === "string"
          ? parsedObject.primaryLanguage
          : "",
    isMixed:
      typeof parsedObject.isMixed === "boolean"
        ? parsedObject.isMixed
        : Array.isArray(parsedObject.detectedLanguages) && parsedObject.detectedLanguages.length > 1,
    confidence: typeof parsedObject.confidence === "number" ? parsedObject.confidence : 0.7,
  };

  if (!normalized.translatedText.trim()) {
    throw new Error("文本翻译结果解析失败。");
  }

  return translationTextResponseSchema.parse(normalized);
}

export interface TranslationProvider {
  estimateTokens(text: string): number;
  translateTextSync(input: { text: string; targetLanguage: string }): Promise<{
    result: TranslationCellResult;
    runtime: TranslationRuntime;
  }>;
  translateCellsRealtime(input: { items: TranslationCellInput[]; targetLanguage: string }): Promise<{
    items: TranslationCellOutput[];
    runtime: TranslationRuntime;
  }>;
  submitBatchTranslation(input: {
    chunks: Array<{ customId: string; items: TranslationCellInput[] }>;
    targetLanguage: string;
  }): Promise<{ providerBatchId: string; inputFileId: string }>;
  getBatchTranslationStatus(input: { providerBatchId: string }): Promise<{
    status: string;
    outputFileId: string;
    errorFileId: string;
    inputFileId: string;
    errorMessage: string;
  }>;
  fetchBatchTranslationResult(input: { outputFileId: string }): Promise<
    Array<{
      customId: string;
      items: TranslationCellOutput[];
      runtime: TranslationRuntime;
      error?: string;
    }>
  >;
}

class OpenAiTranslationProvider implements TranslationProvider {
  estimateTokens(text: string) {
    return estimateTokensFromText(text);
  }

  async translateTextSync(input: { text: string; targetLanguage: string }) {
    const response = await callChatCompletions(buildTextPrompt(input.targetLanguage, input.text), env.aiRequestTimeoutMsManual);
    const result = parseTextResponse(extractContent(response));
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    return {
      result,
      runtime: {
        promptTokens,
        completionTokens,
        totalTokens: response.usage?.total_tokens ?? promptTokens + completionTokens,
        estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens, "realtime"),
        aiModel: env.translationAiModel || translationDefaultAiModel,
      },
    };
  }

  async translateCellsRealtime(input: { items: TranslationCellInput[]; targetLanguage: string }) {
    const chunkedItems = input.items.slice(0, translationRealtimeChunkSize);
    const response = await callChatCompletionsWithRetry(
      buildRealtimeBatchPrompt(input.targetLanguage, chunkedItems),
      env.translationRealtimeTimeoutMs,
      env.translationRealtimeMaxRetries,
    );
    const items = parseRealtimeBatchResponse(extractContent(response));
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    return {
      items,
      runtime: {
        promptTokens,
        completionTokens,
        totalTokens: response.usage?.total_tokens ?? promptTokens + completionTokens,
        estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens, "realtime"),
        aiModel: env.translationAiModel || translationDefaultAiModel,
      },
    };
  }

  async submitBatchTranslation(input: {
    chunks: Array<{ customId: string; items: TranslationCellInput[] }>;
    targetLanguage: string;
  }) {
    const jsonl = input.chunks
      .map((chunk) =>
        JSON.stringify({
          custom_id: chunk.customId,
          method: "POST",
          url: "/v1/chat/completions",
          body: buildRealtimeBatchPrompt(input.targetLanguage, chunk.items),
        }),
      )
      .join("\n");

    const file = await uploadBatchFile(jsonl);
    const batch = await callOpenAiJson<OpenAiBatchJob>(
      "/batches",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_file_id: file.id,
          endpoint: "/v1/chat/completions",
          completion_window: env.translationBatchCompletionWindow,
        }),
      },
    );

    return { providerBatchId: batch.id, inputFileId: file.id };
  }

  async getBatchTranslationStatus(input: { providerBatchId: string }) {
    const batch = await callOpenAiJson<OpenAiBatchJob>(`/batches/${input.providerBatchId}`, { method: "GET" });
    return {
      status: batch.status,
      outputFileId: batch.output_file_id || "",
      errorFileId: batch.error_file_id || "",
      inputFileId: batch.input_file_id || "",
      errorMessage: batch.errors?.data?.map((item) => item.message).filter(Boolean).join(" | ") || "",
    };
  }

  async fetchBatchTranslationResult(input: { outputFileId: string }) {
    const content = await callOpenAiText(`/files/${input.outputFileId}/content`, { method: "GET" });
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as OpenAiBatchOutputLine)
      .map((row) => {
        if (row.error?.message) {
          return {
            customId: row.custom_id || "",
            items: [],
            runtime: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              aiModel: env.translationAiModel || translationDefaultAiModel,
            },
            error: row.error.message,
          };
        }

        const body = row.response?.body;
        if (!body) {
          return {
            customId: row.custom_id || "",
            items: [],
            runtime: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              aiModel: env.translationAiModel || translationDefaultAiModel,
            },
            error: "缺少批量响应体。",
          };
        }

        const promptTokens = body.usage?.prompt_tokens ?? 0;
        const completionTokens = body.usage?.completion_tokens ?? 0;
        const finishReason = getPrimaryFinishReason(body);
        if (finishReason === "length") {
          return {
            customId: row.custom_id || "",
            items: [],
            runtime: {
              promptTokens,
              completionTokens,
              totalTokens: body.usage?.total_tokens ?? promptTokens + completionTokens,
              estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens, "batch"),
              aiModel: env.translationAiModel || translationDefaultAiModel,
            },
            error: "批量翻译分片过大，模型输出被截断，请重试。",
          };
        }
        return {
          customId: row.custom_id || "",
          items: parseRealtimeBatchResponse(extractContent(body)),
          runtime: {
            promptTokens,
            completionTokens,
            totalTokens: body.usage?.total_tokens ?? promptTokens + completionTokens,
            estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens, "batch"),
            aiModel: env.translationAiModel || translationDefaultAiModel,
          },
        };
      });
  }
}

export const translationProvider: TranslationProvider = new OpenAiTranslationProvider();
