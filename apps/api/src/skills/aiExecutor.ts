import { env } from "../env";

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
};

export class AiExecutor {
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

  async callLLM(messages: ExecutorMessages): Promise<{ content: string; usage: LlmCallUsage }> {
    const payload: Record<string, unknown> = {
      model: env.aiModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
    };

    if (env.aiMaxOutputTokens > 0) {
      payload.max_completion_tokens = env.aiMaxOutputTokens;
    }

    const response = await fetch(`${env.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.aiApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`LLM 请求失败: ${response.status} ${await response.text()}`);
    const json = (await response.json()) as ChatResponse;
    const content = this.extractContent(json);
    const usage: LlmCallUsage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    };
    return { content, usage };
  }

  async execute<T>(options: ExecuteOptions<T>): Promise<{ result: T; usage: LlmCallUsage }> {
    const maxRetries = options.maxRetries ?? 2;
    const init = await options.buildMessages();
    const initial = await this.callLLM(init);
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
      if (!options.buildRepairMessages) break;
      const repair = await options.buildRepairMessages(candidate, lastErrors);
      const repaired = await this.callLLM(repair);
      candidate = repaired.content;
      usage.promptTokens += repaired.usage.promptTokens;
      usage.completionTokens += repaired.usage.completionTokens;
      usage.totalTokens += repaired.usage.totalTokens;
    }
    throw new Error(`AI 执行校验失败: ${lastErrors.join("; ")}`);
  }
}

export const aiExecutor = new AiExecutor();
