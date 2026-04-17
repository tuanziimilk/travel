import { env, getAiRuntimeRequestConfig, type ToolScopedAiConfigKey } from "../env";

export type ExecutorMessages = {
  system: string;
  user: string;
};

type ChatResponse = {
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
    text?: string;
  }>;
  output_text?: string;
};

type GeminiGenerateContentResponse = {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

export type LlmCallUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ExecuteOptions<T> = {
  buildMessages: () => Promise<ExecutorMessages> | ExecutorMessages;
  validate: (candidate: string) => { ok: boolean; value?: T; errors: string[] };
  buildRepairMessages?: (candidate: string, errors: string[]) => Promise<ExecutorMessages> | ExecutorMessages;
  maxRetries?: number;
  requestTimeoutMs?: number;
  aiModel?: string;
  toolKey?: ToolScopedAiConfigKey;
  useConfiguredTemperature?: boolean;
};

type ResponseFormatMode = "json_object" | "json_schema";

function getGeminiNativeBaseUrl(baseUrl: string) {
  return String(baseUrl || "").replace(/\/openai$/i, "");
}

export class AiExecutor {
  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private backoffMs(attempt: number, baseMs: number, maxMs: number) {
    const jitter = Math.floor(Math.random() * 120);
    return Math.min(maxMs, baseMs * 2 ** attempt + jitter);
  }

  private isRetryableStatus(status: number) {
    return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 504);
  }

  private isRetryableError(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("aborted") ||
      message.includes("abort") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnreset") ||
      message.includes("etimedout")
    );
  }

  private normalizeFormatMode(raw: string): ResponseFormatMode {
    return raw === "json_schema" ? "json_schema" : "json_object";
  }

  private buildResponseFormat(mode: ResponseFormatMode) {
    if (mode === "json_schema") {
      return {
        type: "json_schema",
        json_schema: {
          name: "sc_quality_scoring_output",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: true,
          },
        },
      } as const;
    }
    return { type: "json_object" } as const;
  }

  private shouldFallbackToJsonObject(status: number, body: string, mode: ResponseFormatMode) {
    if (mode !== "json_schema" || status !== 400) return false;
    const lower = body.toLowerCase();
    return (
      lower.includes("json_schema") ||
      lower.includes("response_format") ||
      lower.includes("schema") ||
      lower.includes("strict") ||
      lower.includes("unsupported") ||
      lower.includes("invalid")
    );
  }

  private shouldFallbackWithoutTemperature(status: number, body: string) {
    if (status !== 400) return false;
    const lower = body.toLowerCase();
    return lower.includes("temperature") && lower.includes("unsupported");
  }

  private shouldFallbackWithoutResponseFormat(status: number, body: string) {
    if (status !== 400) return false;
    const lower = body.toLowerCase();
    return lower.includes("response_format") || lower.includes("json_object") || lower.includes("json_schema");
  }

  private shouldFallbackWithoutMaxCompletionTokens(status: number, body: string) {
    if (status !== 400) return false;
    const lower = body.toLowerCase();
    return lower.includes("max_completion_tokens") || lower.includes("max tokens") || lower.includes("max_tokens");
  }

  private extractContent(json: ChatResponse): string {
    const direct = json.choices?.[0]?.message?.content;
    if (typeof direct === "string" && direct.trim()) return direct;

    if (Array.isArray(direct)) {
      const joined = direct
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .join("")
        .trim();
      if (joined) return joined;
    }

    const choiceText = json.choices?.[0]?.text;
    if (typeof choiceText === "string" && choiceText.trim()) return choiceText;

    if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;

    const refusal = json.choices?.[0]?.message?.refusal;
    if (typeof refusal === "string" && refusal.trim()) {
      throw new Error(`LLM 拒绝回答: ${refusal}`);
    }

    throw new Error(`LLM 返回为空: ${JSON.stringify(json).slice(0, 400)}`);
  }

  private extractGeminiContent(json: GeminiGenerateContentResponse): string {
    const joined = (json.candidates?.[0]?.content?.parts || [])
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
    if (joined) return joined;

    const finishReason = String(json.candidates?.[0]?.finishReason || "").trim();
    const blockReason = String(json.promptFeedback?.blockReason || "").trim();
    if (blockReason) {
      throw new Error(`Gemini 阻止回答: ${blockReason}`);
    }
    if (finishReason) {
      throw new Error(`Gemini 返回为空: ${finishReason}`);
    }
    throw new Error(`Gemini 返回为空: ${JSON.stringify(json).slice(0, 400)}`);
  }

  private async callOpenAiCompatibleOnce(
    requestConfig: ReturnType<typeof getAiRuntimeRequestConfig>,
    messages: ExecutorMessages,
    formatMode: ResponseFormatMode,
    allowTemperature: boolean,
    allowResponseFormat: boolean,
    allowMaxCompletionTokens: boolean,
    requestTimeoutMs: number,
    aiModel: string,
    toolKey: ToolScopedAiConfigKey,
  ): Promise<{ content: string; usage: LlmCallUsage }> {
    const payload: Record<string, unknown> = {
      model: aiModel,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
    };

    if (allowResponseFormat) {
      payload.response_format = this.buildResponseFormat(formatMode);
    }

    if (allowTemperature && env.aiTemperature !== 1) {
      payload.temperature = env.aiTemperature;
    }

    if (allowMaxCompletionTokens && env.aiMaxOutputTokens > 0) {
      payload.max_completion_tokens = env.aiMaxOutputTokens;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`${requestConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${requestConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();

    if (!response.ok) {
      if (allowTemperature && this.shouldFallbackWithoutTemperature(response.status, body)) {
        return this.callLLMOnce(messages, formatMode, false, allowResponseFormat, allowMaxCompletionTokens, requestTimeoutMs, aiModel, toolKey);
      }
      if (allowResponseFormat && this.shouldFallbackWithoutResponseFormat(response.status, body)) {
        return this.callLLMOnce(messages, formatMode, allowTemperature, false, allowMaxCompletionTokens, requestTimeoutMs, aiModel, toolKey);
      }
      if (allowMaxCompletionTokens && this.shouldFallbackWithoutMaxCompletionTokens(response.status, body)) {
        return this.callLLMOnce(messages, formatMode, allowTemperature, allowResponseFormat, false, requestTimeoutMs, aiModel, toolKey);
      }
      if (this.shouldFallbackToJsonObject(response.status, body, formatMode)) {
        return this.callLLMOnce(
          messages,
          "json_object",
          allowTemperature,
          allowResponseFormat,
          allowMaxCompletionTokens,
          requestTimeoutMs,
          aiModel,
          toolKey,
        );
      }
      throw new Error(`LLM 请求失败: ${response.status} ${body}`);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const bodyTrimmed = body.trim();
    if (!bodyTrimmed) {
      throw new Error("LLM 返回为空响应体");
    }

    let json: ChatResponse;
    try {
      json = JSON.parse(bodyTrimmed) as ChatResponse;
    } catch {
      const isHtml = contentType.includes("text/html") || bodyTrimmed.startsWith("<") || bodyTrimmed.toLowerCase().includes("<html");
      if (isHtml) {
        throw new Error(`LLM 返回非 JSON(HTML): ${bodyTrimmed.slice(0, 240)}`);
      }
      throw new Error(`LLM 返回非 JSON: ${bodyTrimmed.slice(0, 240)}`);
    }

    const content = this.extractContent(json);
    const usage: LlmCallUsage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    };
    return { content, usage };
  }

  private async callGeminiNativeOnce(
    requestConfig: ReturnType<typeof getAiRuntimeRequestConfig>,
    messages: ExecutorMessages,
    allowTemperature: boolean,
    allowResponseFormat: boolean,
    allowMaxCompletionTokens: boolean,
    requestTimeoutMs: number,
    aiModel: string,
  ): Promise<{ content: string; usage: LlmCallUsage }> {
    const payload: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: messages.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: messages.user }],
        },
      ],
    };

    const generationConfig: Record<string, unknown> = {};
    if (allowResponseFormat) {
      generationConfig.responseMimeType = "application/json";
    }
    if (allowTemperature) {
      generationConfig.temperature = env.aiTemperature;
    }
    if (allowMaxCompletionTokens && env.aiMaxOutputTokens > 0) {
      generationConfig.maxOutputTokens = env.aiMaxOutputTokens;
    }
    if (Object.keys(generationConfig).length) {
      payload.generationConfig = generationConfig;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(
        `${getGeminiNativeBaseUrl(requestConfig.baseUrl)}/models/${encodeURIComponent(aiModel)}:generateContent?key=${encodeURIComponent(requestConfig.apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();
    if (!response.ok) {
      if (allowTemperature && this.shouldFallbackWithoutTemperature(response.status, body)) {
        return this.callGeminiNativeOnce(requestConfig, messages, false, allowResponseFormat, allowMaxCompletionTokens, requestTimeoutMs, aiModel);
      }
      if (allowResponseFormat && this.shouldFallbackWithoutResponseFormat(response.status, body)) {
        return this.callGeminiNativeOnce(requestConfig, messages, allowTemperature, false, allowMaxCompletionTokens, requestTimeoutMs, aiModel);
      }
      if (allowMaxCompletionTokens && this.shouldFallbackWithoutMaxCompletionTokens(response.status, body)) {
        return this.callGeminiNativeOnce(requestConfig, messages, allowTemperature, allowResponseFormat, false, requestTimeoutMs, aiModel);
      }
      throw new Error(`LLM 请求失败: ${response.status} ${body}`);
    }

    let json: GeminiGenerateContentResponse;
    try {
      json = JSON.parse(body) as GeminiGenerateContentResponse;
    } catch {
      throw new Error(`Gemini 返回非 JSON: ${body.slice(0, 240)}`);
    }

    const content = this.extractGeminiContent(json);
    const usage: LlmCallUsage = {
      promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: json.usageMetadata?.totalTokenCount ?? 0,
    };
    return { content, usage };
  }

  private async callLLMOnce(
    messages: ExecutorMessages,
    formatMode: ResponseFormatMode,
    allowTemperature = false,
    allowResponseFormat = true,
    allowMaxCompletionTokens = true,
    requestTimeoutMs = env.aiRequestTimeoutMs,
    aiModel = env.aiModel,
    toolKey: ToolScopedAiConfigKey = "quality-about",
  ): Promise<{ content: string; usage: LlmCallUsage }> {
    const requestConfig = getAiRuntimeRequestConfig(toolKey);
    const resolvedModel = aiModel || requestConfig.aiModel;
    if (requestConfig.provider === "gemini") {
      return this.callGeminiNativeOnce(
        requestConfig,
        messages,
        allowTemperature,
        allowResponseFormat,
        allowMaxCompletionTokens,
        requestTimeoutMs,
        resolvedModel,
      );
    }
    return this.callOpenAiCompatibleOnce(
      requestConfig,
      messages,
      formatMode,
      allowTemperature,
      allowResponseFormat,
      allowMaxCompletionTokens,
      requestTimeoutMs,
      resolvedModel,
      toolKey,
    );
  }

  async callLLM(
    messages: ExecutorMessages,
    requestTimeoutMs?: number,
    aiModel = env.aiModel,
    toolKey: ToolScopedAiConfigKey = "quality-about",
    useConfiguredTemperature = false,
  ): Promise<{ content: string; usage: LlmCallUsage }> {
    const maxRetries = env.aiHttpMaxRetries;
    const formatMode = this.normalizeFormatMode(env.aiResponseFormatMode);
    const errors: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.callLLMOnce(
          messages,
          formatMode,
          useConfiguredTemperature,
          true,
          true,
          requestTimeoutMs ?? env.aiRequestTimeoutMs,
          aiModel,
          toolKey,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`attempt${attempt + 1}: ${message}`);

        if (attempt >= maxRetries) break;

        const statusMatch = message.match(/LLM 请求失败:\s*(\d{3})/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        const retryable = status > 0 ? this.isRetryableStatus(status) : this.isRetryableError(error);
        if (!retryable) break;

        await this.sleep(this.backoffMs(attempt, env.aiHttpRetryBaseMs, env.aiHttpRetryMaxMs));
      }
    }

    throw new Error(`LLM 请求重试后仍失败: ${errors.join(" | ")}`);
  }

  async execute<T>(options: ExecuteOptions<T>): Promise<{ result: T; usage: LlmCallUsage }> {
    const maxRetries = options.maxRetries ?? env.aiExecutorMaxRetries;
    const init = await options.buildMessages();
    const toolKey = options.toolKey || "quality-about";
    const aiModel = options.aiModel || getAiRuntimeRequestConfig(toolKey).aiModel;
    const initial = await this.callLLM(init, options.requestTimeoutMs, aiModel, toolKey, options.useConfiguredTemperature === true);
    let candidate = initial.content;
    const usage: LlmCallUsage = {
      promptTokens: initial.usage.promptTokens,
      completionTokens: initial.usage.completionTokens,
      totalTokens: initial.usage.totalTokens,
    };
    let lastErrors: string[] = [];

    for (let i = 0; i <= maxRetries; i += 1) {
      const validated = options.validate(candidate);
      if (validated.ok && validated.value !== undefined) return { result: validated.value, usage };
      lastErrors = validated.errors;
      if (i === maxRetries) break;
      if (options.buildRepairMessages) {
        const repair = await options.buildRepairMessages(candidate, lastErrors);
        const repaired = await this.callLLM(
          repair,
          options.requestTimeoutMs,
          aiModel,
          toolKey,
          options.useConfiguredTemperature === true,
        );
        candidate = repaired.content;
        usage.promptTokens += repaired.usage.promptTokens;
        usage.completionTokens += repaired.usage.completionTokens;
        usage.totalTokens += repaired.usage.totalTokens;
      } else {
        const retried = await this.callLLM(
          init,
          options.requestTimeoutMs,
          aiModel,
          toolKey,
          options.useConfiguredTemperature === true,
        );
        candidate = retried.content;
        usage.promptTokens += retried.usage.promptTokens;
        usage.completionTokens += retried.usage.completionTokens;
        usage.totalTokens += retried.usage.totalTokens;
      }
    }
    throw new Error(`AI 执行校验失败: ${lastErrors.join("; ")}`);
  }
}

export const aiExecutor = new AiExecutor();
