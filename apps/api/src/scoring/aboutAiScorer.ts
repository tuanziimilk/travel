import { ManualScoreInput, ScoreOutput } from "@about-demo/trpc";
import { env } from "../env";
import { skillRegistry } from "../skills/skillRegistry";
import { validateScoreOutput } from "./validators/scoreValidator";
import { aiExecutor } from "../skills/aiExecutor";
import { getModuleSkillMd } from "../skills/skillStore";

export function buildPrompt(input: ManualScoreInput, skillMd: string, refs: Record<string, string>) {
  const userPayload = {
    ...input,
    About_op: input.About_op || "",
  };

  const system = [
    "你是 About 文本质检评分器。",
    "只做评分，不做任何改写、修复、润色。",
    "必须严格按照给定 skill 规范输出一个 JSON 对象，不能输出其他文本。",
    "不要泄露 TermName；商家指代只能使用 {Mer.}。",
    "不要在 strengths/weaknesses/suggestions 使用第一人称。",
    "以下是评分 skill 规范与参考文件：",
    skillMd,
    "references/country-language-map.json:",
    refs["country-language-map.json"] || "{}",
    "references/rubric-cheatsheet.md:",
    refs["rubric-cheatsheet.md"] || "",
  ].join("\n\n");

  const user = [
    "请基于以下输入评分，并严格输出 JSON：",
    JSON.stringify(userPayload, null, 2),
  ].join("\n\n");

  return { system, user };
}

function parseJsonCandidate(candidateRaw: string) {
  const normalizeJsonLikeText = (text: string) =>
    text
      .replace(/^\uFEFF/, "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\uFF0C]/g, ",")
      .replace(/[\uFF1A]/g, ":")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();

  const candidate = normalizeJsonLikeText(candidateRaw);

  const attempts: string[] = [];
  const seen = new Set<string>();
  const pushAttempt = (text: string) => {
    const normalized = normalizeJsonLikeText(text);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    attempts.push(normalized);
  };

  pushAttempt(candidate);

  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) pushAttempt(fenceMatch[1]);

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    pushAttempt(candidate.slice(firstBrace, lastBrace + 1));
  }

  const pushBalancedJson = (text: string) => {
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }

      if (ch === "}") {
        if (depth === 0) continue;
        depth -= 1;
        if (depth === 0 && start >= 0) {
          pushAttempt(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  };

  pushBalancedJson(candidate);
  if (fenceMatch?.[1]) pushBalancedJson(fenceMatch[1]);

  for (const text of attempts) {
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch {
      // continue
    }
  }

  return { ok: false as const, value: null };
}

function buildRepairPrompt(baseSystem: string, badCandidate: string, errors: string[]) {
  return {
    system: [
      baseSystem,
      "你现在是 JSON 修复器。",
      "请只输出一个严格 JSON 对象。",
      "不要输出 markdown，不要输出代码块，不要解释。",
      "保持字段结构与原任务要求完全一致。",
    ].join("\n\n"),
    user: [
      "上一轮输出未通过校验，请修复为合法 JSON。",
      `错误信息: ${errors.join("; ")}`,
      "原始输出如下：",
      badCandidate.slice(0, 12000),
      "请返回修复后的单个 JSON 对象。",
    ].join("\n\n"),
  };
}

function validateCandidate(candidate: string, input: ManualScoreInput) {
  const parsedResult = parseJsonCandidate(candidate);
  if (!parsedResult.ok) {
    return { ok: false, errors: ["JSON 解析失败"] as string[] };
  }
  const parsed = parsedResult.value;

  const validated = validateScoreOutput(parsed, {
    termName: input.TermName,
    expectOp: Boolean(input.About_op?.trim()),
  });
  return { ok: validated.ok, value: validated.parsed, errors: validated.errors };
}

export async function scoreAboutByAi(input: ManualScoreInput): Promise<ScoreOutput> {
  const skill = await skillRegistry.getAboutSkill();
  const prompt = buildPrompt(input, skill.skillMd, skill.references);
  const executed = await aiExecutor.execute<ScoreOutput>({
    maxRetries: env.aiExecutorMaxRetries,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input),
    buildRepairMessages: (candidate, errors) => buildRepairPrompt(prompt.system, candidate, errors),
  });
  return executed.result;
}

export async function scoreAboutByAiWithMeta(input: ManualScoreInput, options?: { requestTimeoutMs?: number }) {
  const startedAt = Date.now();
  const moduleId = input.moduleId || "about";
  const skill = await skillRegistry.getModuleSkill(moduleId);
  const moduleSkill = await getModuleSkillMd(moduleId);
  const prompt = buildPrompt(input, moduleSkill.skillMd || skill.skillMd, skill.references);

  const executed = await aiExecutor.execute<ScoreOutput>({
    maxRetries: env.aiExecutorMaxRetries,
    requestTimeoutMs: options?.requestTimeoutMs,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input),
    buildRepairMessages: (candidate, errors) => buildRepairPrompt(prompt.system, candidate, errors),
  });

  const elapsedMs = Date.now() - startedAt;
  const promptTokens = executed.usage.promptTokens;
  const completionTokens = executed.usage.completionTokens;
  const totalTokens = executed.usage.totalTokens;
  const estimatedCostUsd =
    (promptTokens / 1_000_000) * env.aiInputCostPer1M +
    (completionTokens / 1_000_000) * env.aiOutputCostPer1M;

  return {
    output: executed.result,
    runtime: {
      elapsedMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      aiModel: env.aiModel,
      moduleId,
      skillSource: moduleSkill.source,
    },
  };
}
