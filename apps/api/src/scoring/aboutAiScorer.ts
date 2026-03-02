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

function validateCandidate(candidate: string, input: ManualScoreInput) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, errors: ["JSON 解析失败"] as string[] };
  }

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
    maxRetries: 0,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input),
  });
  return executed.result;
}

export async function scoreAboutByAiWithMeta(input: ManualScoreInput) {
  const startedAt = Date.now();
  const moduleId = input.moduleId || "about";
  const skill = await skillRegistry.getModuleSkill(moduleId);
  const moduleSkill = await getModuleSkillMd(moduleId);
  const prompt = buildPrompt(input, moduleSkill.skillMd || skill.skillMd, skill.references);

  const executed = await aiExecutor.execute<ScoreOutput>({
    maxRetries: 0,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input),
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
