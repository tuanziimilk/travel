import { z } from "zod";
import { ManualScoreInput, type OutputMode, ScoreOutput } from "@about-demo/trpc";
import { env } from "../env";
import { skillRegistry } from "../skills/skillRegistry";
import { aiExecutor } from "../skills/aiExecutor";
import { getModuleSkillMd } from "../skills/skillStore";
import { validateScoreOutput } from "./validators/scoreValidator";

const compactIssueFlagsSchema = z.object({
  first_person: z.boolean().optional().default(false),
  lang_mismatch: z.boolean().optional().default(false),
  too_short: z.boolean().optional().default(false),
  too_long: z.boolean().optional().default(false),
  keyword_missing: z.boolean().optional().default(false),
  keyword_stuffing: z.boolean().optional().default(false),
  ai_tone: z.boolean().optional().default(false),
  localization_bad: z.boolean().optional().default(false),
});

const defaultCompactIssueFlags = {
  first_person: false,
  lang_mismatch: false,
  too_short: false,
  too_long: false,
  keyword_missing: false,
  keyword_stuffing: false,
  ai_tone: false,
  localization_bad: false,
} as const;

const defaultCompactRiskFlags = {
  high_risk: false,
  seo_negative: false,
  termname_leak: false,
} as const;

const compactResultSchema = z.object({
  version: z.enum(["online", "ai", "op"]),
  score_total: z.number(),
  score_breakdown: z.object({
    A: z.number(),
    B: z.number(),
    C: z.number(),
    D: z.number(),
  }),
  pass_for_publish: z.boolean(),
  risk_flags: z
    .object({
      high_risk: z.boolean().optional().default(false),
      seo_negative: z.boolean().optional().default(false),
      termname_leak: z.boolean().optional().default(false),
    })
    .optional()
    .default(defaultCompactRiskFlags),
  issue_flags: compactIssueFlagsSchema.optional().default(defaultCompactIssueFlags),
});

const compactScoreOutputSchema = z.object({
  meta: z.object({
    TermID: z.string(),
    Domain: z.string(),
    Country: z.string(),
    versions_present: z.array(z.enum(["online", "ai", "op"])),
  }),
  results: z.array(compactResultSchema),
  comparison: z.object({
    best_version: z.enum(["online", "ai", "op"]),
    ranking: z.array(z.enum(["online", "ai", "op"])),
    key_deltas: z.array(z.string()).optional().default([]),
  }),
  notes_short: z.string().optional().default(""),
});

type CompactScoreOutput = z.infer<typeof compactScoreOutputSchema>;

export type ScoreIssueFlags = {
  mer_missing: boolean;
  first_person: boolean;
  lang_mismatch: boolean;
  too_short: boolean;
  too_long: boolean;
  keyword_missing: boolean;
  keyword_stuffing: boolean;
  ai_tone: boolean;
  localization_bad: boolean;
};

type ScoringDiagnostics = {
  issueFlags?: ScoreIssueFlags;
};

type ValidatedScorePayload = {
  output: ScoreOutput;
  diagnostics?: ScoringDiagnostics;
};

type PromptRefs = Record<string, string>;

function normalizeHeadingKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[：:]/g, " ")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMarkdownSections(markdown: string) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = "__intro__";
  let currentLines: string[] = [];

  const flush = () => {
    sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      currentHeading = line.replace(/^##\s+/, "").trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flush();
  return sections.filter((section) => section.body);
}

function shouldKeepCompactSection(heading: string) {
  const normalized = normalizeHeadingKey(heading);
  if (normalized.includes("hard rules")) return true;
  if (normalized.includes("high-risk")) return true;
  if (normalized.includes("scoring rubric")) return true;
  if (normalized.includes("business context")) return true;
  if (normalized.includes("version handling")) return true;
  if (normalized.includes("advanced seo")) return true;
  return false;
}

function buildCompactSkillMd(skillMd: string) {
  const sections = splitMarkdownSections(skillMd);
  const kept = sections.filter((section) => shouldKeepCompactSection(section.heading));
  if (!kept.length) return skillMd;
  return kept
    .map((section) => (section.heading === "__intro__" ? section.body : `## ${section.heading}\n${section.body}`))
    .join("\n\n")
    .trim();
}

function buildCompactRubricCheatsheet(moduleId: "about" | "faq") {
  if (moduleId === "faq") {
    return [
      "Compact rubric reminder:",
      "A: FAQ structure and scannability. Questions should be searchable; answers should be direct and organized.",
      "B: policy accuracy and actionability. Conditions, exclusions, stacking, timing, troubleshooting, and next steps must be clear when applicable.",
      "C: localization and expression quality. Match Country language and local phrasing; avoid template tone.",
      "D: SEO and discoverability. Search-intent-aligned questions and natural keyword coverage only.",
      "Hard caps:",
      "If high-risk policy, eligibility, scope, stacking, refund, or timing gaps exist, pass_for_publish must be false, B <= 3.4, total <= 7.9.",
      "If SEO-negative signals exist, D cannot be 1.0.",
    ].join("\n");
  }

  return [
    "Compact rubric reminder:",
    "A: hard quality gates. Must use {Mer.}; no first-person; no broken language; match Country language; penalize too short/too long.",
    "B: business clarity and completeness. Clear what {Mer.} is, what it offers, scope, conditions, exclusions, timing, and actionable steps when applicable.",
    "C: SEO and semantic coverage. Core business keywords must appear naturally; no stuffing.",
    "D: readability and localization. Natural, local, non-template tone.",
    "Hard caps:",
    "If high-risk policy/eligibility/scope gaps exist, pass_for_publish must be false, B <= 3.4, total <= 7.9.",
    "If SEO-negative signals exist, D cannot be 1.0.",
  ].join("\n");
}

function buildCompactRefs(input: ManualScoreInput, refs: PromptRefs, moduleId: "about" | "faq") {
  const compactRefs: PromptRefs = {};
  const rawCountryMap = refs["country-language-map.json"];
  if (rawCountryMap) {
    try {
      const parsed = JSON.parse(rawCountryMap) as Record<string, string>;
      const country = String(input.Country || "").trim().toUpperCase();
      const scoped = country && parsed[country] ? { [country]: parsed[country] } : parsed;
      compactRefs["country-language-map.json"] = JSON.stringify(scoped);
    } catch {
      compactRefs["country-language-map.json"] = rawCountryMap;
    }
  }

  compactRefs["rubric-cheatsheet.md"] = buildCompactRubricCheatsheet(moduleId);

  return compactRefs;
}

function compactOutputContract() {
  return [
    "Keep the scoring rules, rubric, and risk rules identical to full mode.",
    "Ignore any larger output-field requirements from the skill file; use this compact contract only.",
    "Return JSON only. No markdown. No extra text.",
    "Do not output strengths, weaknesses, suggestions, or long notes.",
    "Shape:",
    'meta:{TermID,Domain,Country,versions_present[]}',
    "results:[{version,score_total,score_breakdown{A,B,C,D},pass_for_publish,risk_flags{high_risk,seo_negative,termname_leak},issue_flags{first_person,lang_mismatch,too_short,too_long,keyword_missing,keyword_stuffing,ai_tone,localization_bad}}]",
    "comparison:{best_version,ranking[],key_deltas[]}",
    "notes_short:string",
    "Limits: key_deltas max 2 short items; notes_short max 60 chars.",
  ].join("\n\n");
}

export function buildPrompt(
  input: ManualScoreInput,
  skillMd: string,
  refs: Record<string, string>,
  outputMode: OutputMode = "full",
  moduleId: "about" | "faq" = "about",
) {
  const promptSkillMd = outputMode === "compact" ? buildCompactSkillMd(skillMd) : skillMd;
  const promptRefs = outputMode === "compact" ? buildCompactRefs(input, refs, moduleId) : refs;
  const userPayload = {
    ...input,
    About_op: input.About_op || "",
  };

  const systemParts = [
    "You are a quality scoring engine for About/FAQ content.",
    "Only score. Do not rewrite, repair, or polish the source text.",
    "You must return exactly one valid JSON object and nothing else.",
    "Do not leak TermName. Merchant references must use {Mer.}.",
    "The scoring skill and reference files are below:",
    promptSkillMd,
    "references/country-language-map.json:",
    promptRefs["country-language-map.json"] || "{}",
    "references/rubric-cheatsheet.md:",
    promptRefs["rubric-cheatsheet.md"] || "",
  ];

  if (outputMode === "compact") {
    systemParts.push(compactOutputContract());
  } else {
    systemParts.push("In full mode, keep the original skill output contract without removing fields.");
  }

  const system = systemParts.join("\n\n");
  const user = ["Score the following input and return JSON only:", JSON.stringify(userPayload, null, 2)].join("\n\n");

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
      "You are now a JSON repairer.",
      "Return exactly one strict JSON object.",
      "Do not output markdown, code fences, or explanations.",
      "Keep the field structure exactly aligned with the task contract.",
    ].join("\n\n"),
    user: [
      "The previous output failed validation. Repair it into valid JSON.",
      `Validation errors: ${errors.join("; ")}`,
      "Original output:",
      badCandidate.slice(0, 12000),
      "Return the repaired single JSON object.",
    ].join("\n\n"),
  };
}

function emptyIssueFlags(): ScoreIssueFlags {
  return {
    mer_missing: false,
    first_person: false,
    lang_mismatch: false,
    too_short: false,
    too_long: false,
    keyword_missing: false,
    keyword_stuffing: false,
    ai_tone: false,
    localization_bad: false,
  };
}

function normalizeCompactCandidate(parsed: CompactScoreOutput, input: ManualScoreInput) {
  const normalized: ScoreOutput = {
    meta: {
      TermID: parsed.meta.TermID,
      Domain: parsed.meta.Domain,
      Country: parsed.meta.Country,
      versions_present: parsed.meta.versions_present,
    },
    results: parsed.results.map((item) => ({
      version: item.version,
      score_total: item.score_total,
      score_breakdown: item.score_breakdown,
      strengths: [],
      weaknesses: [],
      suggestions: [],
      pass_for_publish: item.pass_for_publish,
    })),
    comparison: {
      best_version: parsed.comparison.best_version,
      ranking: parsed.comparison.ranking,
      key_deltas: parsed.comparison.key_deltas,
    },
    notes: parsed.notes_short || "",
  };

  const forcedFlagsByVersion = Object.fromEntries(
    parsed.results.map((item) => [
      item.version,
      {
        highRisk: Boolean(item.risk_flags.high_risk),
        seoNegative: Boolean(item.risk_flags.seo_negative),
        termNameLeak: Boolean(item.risk_flags.termname_leak),
      },
    ]),
  ) as NonNullable<Parameters<typeof validateScoreOutput>[1]["forcedFlagsByVersion"]>;

  const validated = validateScoreOutput(normalized, {
    termName: input.TermName,
    expectOp: Boolean(input.About_op?.trim()),
    forcedFlagsByVersion,
  });

  const issueFlags = emptyIssueFlags();
  for (const item of parsed.results) {
    const resultIssueFlags = item.issue_flags;
    issueFlags.mer_missing ||= Boolean(item.risk_flags.termname_leak);
    issueFlags.first_person ||= Boolean(resultIssueFlags.first_person);
    issueFlags.lang_mismatch ||= Boolean(resultIssueFlags.lang_mismatch);
    issueFlags.too_short ||= Boolean(resultIssueFlags.too_short);
    issueFlags.too_long ||= Boolean(resultIssueFlags.too_long);
    issueFlags.keyword_missing ||= Boolean(resultIssueFlags.keyword_missing);
    issueFlags.keyword_stuffing ||= Boolean(resultIssueFlags.keyword_stuffing);
    issueFlags.ai_tone ||= Boolean(resultIssueFlags.ai_tone);
    issueFlags.localization_bad ||= Boolean(resultIssueFlags.localization_bad);
  }

  return {
    ok: validated.ok,
    value: validated.parsed ? ({ output: validated.parsed, diagnostics: { issueFlags } } satisfies ValidatedScorePayload) : undefined,
    errors: validated.errors,
  };
}

function validateCandidate(candidate: string, input: ManualScoreInput, outputMode: OutputMode) {
  const parsedResult = parseJsonCandidate(candidate);
  if (!parsedResult.ok) {
    return { ok: false, errors: ["JSON parse failed"] as string[] };
  }
  const parsed = parsedResult.value;

  if (outputMode === "compact") {
    const compactParsed = compactScoreOutputSchema.safeParse(parsed);
    if (!compactParsed.success) {
      return { ok: false, errors: compactParsed.error.issues.map((issue) => issue.message) };
    }
    return normalizeCompactCandidate(compactParsed.data, input);
  }

  const validated = validateScoreOutput(parsed, {
    termName: input.TermName,
    expectOp: Boolean(input.About_op?.trim()),
  });
  return {
    ok: validated.ok,
    value: validated.parsed ? ({ output: validated.parsed } satisfies ValidatedScorePayload) : undefined,
    errors: validated.errors,
  };
}

export async function scoreAboutByAi(input: ManualScoreInput): Promise<ScoreOutput> {
  const skill = await skillRegistry.getAboutSkill();
  const prompt = buildPrompt(input, skill.skillMd, skill.references, "full", "about");
  const executed = await aiExecutor.execute<ValidatedScorePayload>({
    maxRetries: env.aiExecutorMaxRetries,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input, "full"),
    buildRepairMessages: (candidate, errors) => buildRepairPrompt(prompt.system, candidate, errors),
  });
  return executed.result.output;
}

export async function scoreAboutByAiWithMeta(
  input: ManualScoreInput,
  options?: { requestTimeoutMs?: number; outputMode?: OutputMode },
) {
  const startedAt = Date.now();
  const moduleId = input.moduleId || "about";
  const outputMode = options?.outputMode ?? "full";
  const skill = await skillRegistry.getModuleSkill(moduleId);
  const moduleSkill = await getModuleSkillMd(moduleId);
  const prompt = buildPrompt(input, moduleSkill.skillMd || skill.skillMd, skill.references, outputMode, moduleId);

  const executed = await aiExecutor.execute<ValidatedScorePayload>({
    maxRetries: env.aiExecutorMaxRetries,
    requestTimeoutMs: options?.requestTimeoutMs,
    buildMessages: () => prompt,
    validate: (candidate) => validateCandidate(candidate, input, outputMode),
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
    output: executed.result.output,
    diagnostics: executed.result.diagnostics,
    runtime: {
      elapsedMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      aiModel: env.aiModel,
      moduleId,
      skillSource: moduleSkill.source,
      outputMode,
    },
  };
}
