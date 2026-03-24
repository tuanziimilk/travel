import { parse } from "csv-parse/sync";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { z } from "zod";
import { faqOutputUploadMaxFileBytes, faqOutputUploadMaxRows, type ScType, type Uploader } from "@about-demo/trpc";
import { env } from "../env";
import { aiExecutor } from "../skills/aiExecutor";
import { resolveSkillRoot } from "../skills/skillPath";
import { skillRegistry } from "../skills/skillRegistry";
import { getSkillRouteOverride, normalizeFaqSubclassFromFactType, resolveSkillRoute } from "../skills/skillRouter";
import {
  completeGenerationJob,
  createGenerationJob,
  failGenerationJob,
  getGenerationJobForRetry,
  markGenerationJobRunning,
} from "./faqOutputJobStore";

const BOARD_NAME_FIELD = "板块名称" as const;

const faqOutputRowSchema = z.object({
  term_id: z.string().optional().default(""),
  country: z.string().optional().default(""),
  domain: z.string().optional().default(""),
  term_name: z.string().optional().default(""),
  fact_type: z.string().optional().default(""),
  supported: z.string().optional().default(""),
  status: z.string().optional().default(""),
  discount_type: z.string().optional().default(""),
  discount_value: z.string().optional().default(""),
  currency: z.string().optional().default(""),
  discount_details: z.string().optional().default(""),
  url: z.string().optional().default(""),
});

const faqOutputItemSchema = z.object({
  ContentType: z.literal("faq"),
  Country: z.string(),
  TermID: z.string(),
  TermName: z.string(),
  Domain: z.string(),
  Source: z.string(),
  Subclass: z.string(),
  [BOARD_NAME_FIELD]: z.literal("faq"),
  Titile1: z.string().trim().min(1),
  "Brief Introduction": z.string().trim().min(1),
  "Href Kw": z.string(),
  "Href Url": z.string(),
});

type FaqOutputInputRow = z.infer<typeof faqOutputRowSchema>;
type FaqOutputItem = z.infer<typeof faqOutputItemSchema>;

type GenerationRowResult =
  | {
      rowIndex: number;
      status: "success";
      subclass: string;
      factType: string;
      routeKey: string;
      output: FaqOutputItem;
      runtime: {
        elapsedMs: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        aiModel: string;
      };
    }
  | {
      rowIndex: number;
      status: "error";
      subclass: string;
      factType: string;
      routeKey: string;
      error: string;
    };

const outputHeaders = [
  "ContentType",
  "Country",
  "TermID",
  "TermName",
  "Domain",
  "Source",
  "Subclass",
  BOARD_NAME_FIELD,
  "Titile1",
  "Brief Introduction",
  "Href Kw",
  "Href Url",
] as const;

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function mapOutputRow(row: Record<string, unknown>) {
  const mapped = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) mapped.set(normalizeHeader(key), value);
  const pick = (key: string) => String(mapped.get(key) ?? "").trim();
  return faqOutputRowSchema.parse({
    term_id: pick("term_id"),
    country: normalizeCountryCode(pick("country")),
    domain: pick("domain"),
    term_name: pick("term_name"),
    fact_type: pick("fact_type"),
    supported: pick("supported"),
    status: pick("status"),
    discount_type: pick("discount_type"),
    discount_value: pick("discount_value"),
    currency: pick("currency"),
    discount_details: pick("discount_details"),
    url: pick("url"),
  });
}

function parseFaqOutputFile(fileName: string, fileBase64: string) {
  const buffer = Buffer.from(fileBase64, "base64");
  if (fileName.toLowerCase().endsWith(".csv")) {
    const records = parse(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
    return records.map(mapOutputRow);
  }
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return rows.map(mapOutputRow);
  }
  throw new Error("仅支持 .csv 或 .xlsx 文件。");
}

function estimateCostUsd(promptTokens: number, completionTokens: number) {
  const usd =
    (promptTokens / 1_000_000) * env.aiInputCostPer1M +
    (completionTokens / 1_000_000) * env.aiOutputCostPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function buildPromptInputRow(row: FaqOutputInputRow, subclass: string) {
  return {
    term_id: row.term_id,
    country: row.country,
    domain: row.domain,
    term_name: row.term_name,
    fact_type: row.fact_type,
    subclass,
    discount_details: row.discount_details,
    url: row.url,
  };
}

function buildGenerationPrompt(skillMd: string, outputFormatMd: string, row: FaqOutputInputRow, subclass: string) {
  const system = [
    "You are a structured FAQ generation engine.",
    "Follow the skill exactly and return JSON only.",
    "Do not output markdown. Do not explain your reasoning.",
    "The skill file is below:",
    skillMd,
    "The output-format reference is below:",
    outputFormatMd,
    "Return exactly one JSON object with these fields:",
    JSON.stringify({
      ContentType: "faq",
      Country: "",
      TermID: "",
      TermName: "",
      Domain: "",
      Source: "AI",
      Subclass: subclass,
      [BOARD_NAME_FIELD]: "faq",
      Titile1: "",
      "Brief Introduction": "",
      "Href Kw": "",
      "Href Url": "",
    }),
  ].join("\n\n");

  const user = [
    "Generate one FAQ output row from this input record.",
    "Keep the content faithful to the source facts.",
    "Use discount_details as the primary fact source when writing the answer.",
    "Do not rely on structured discount fields that may be stale or lossy.",
    "If the source indicates no standard offer, answer in a complete sentence and keep output compliant.",
    JSON.stringify(buildPromptInputRow(row, subclass), null, 2),
  ].join("\n\n");

  return { system, user };
}

function withGenerationDefaults(value: Record<string, unknown>, subclass: string) {
  const normalizedValue = { ...value } as Record<string, unknown>;
  if (normalizedValue.Title1 && !normalizedValue.Titile1) {
    normalizedValue.Titile1 = normalizedValue.Title1;
  }
  return {
    ContentType: "faq",
    Country: "",
    TermID: "",
    TermName: "",
    Domain: "",
    Source: "AI",
    Subclass: subclass,
    [BOARD_NAME_FIELD]: "faq",
    Titile1: "",
    "Brief Introduction": "",
    "Href Kw": "",
    "Href Url": "",
    ...normalizedValue,
  };
}

export function finalizeGenerationItem(item: FaqOutputItem, row: FaqOutputInputRow, subclass: string): FaqOutputItem {
  const normalized = withGenerationDefaults(item, subclass);
  return {
    ContentType: "faq",
    Country: normalizeCountryCode(normalized.Country || row.country),
    TermID: normalized.TermID || row.term_id,
    TermName: normalized.TermName || row.term_name,
    Domain: normalized.Domain || row.domain,
    Source: normalized.Source || "AI",
    Subclass: subclass,
    [BOARD_NAME_FIELD]: "faq",
    Titile1: normalized.Titile1 || "",
    "Brief Introduction": normalized["Brief Introduction"] || "",
    "Href Kw": normalized["Href Kw"] || "",
    "Href Url": normalized["Href Url"] || "",
  };
}

export function validateGenerationCandidate(candidateRaw: string, subclass: string) {
  const normalized = String(candidateRaw || "").trim();
  const attempts = [normalized];
  const fenceMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) attempts.push(fenceMatch[1].trim());

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, errors: ["JSON payload must be an object"] };
      }
      const candidate = withGenerationDefaults(parsed as Record<string, unknown>, subclass);
      const validated = faqOutputItemSchema.safeParse(candidate);
      if (!validated.success) return { ok: false, errors: validated.error.issues.map((issue) => issue.message) };
      if (validated.data.Subclass.trim().toLowerCase() !== subclass.trim().toLowerCase()) {
        return { ok: false, errors: [`Subclass mismatch: expected ${subclass}, got ${validated.data.Subclass}`] };
      }
      return { ok: true, value: validated.data, errors: [] as string[] };
    } catch {
      // continue
    }
  }

  return { ok: false, errors: ["JSON parse failed"] };
}

function buildRepairMessages(candidate: string, errors: string[], subclass: string) {
  return {
    system: [
      "You fix invalid FAQ output JSON.",
      "Return JSON only.",
      "Keep the same meaning, but make the object valid.",
      `Subclass must stay exactly "${subclass}".`,
      "The object must contain non-empty Titile1 and Brief Introduction.",
      "Optional link fields may be empty strings.",
    ].join("\n"),
    user: [
      "Fix this JSON candidate.",
      `Validation errors: ${errors.join("; ")}`,
      candidate,
    ].join("\n\n"),
  };
}

function normalizeSentence(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

export function normalizeCountryCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

const fallbackQuestionTemplates: Record<string, (brand: string) => string> = {
  shipping: (brand) => `What shipping options does ${brand} offer?`,
  "price guarantee": (brand) => `Does ${brand} offer a price guarantee?`,
  return: (brand) => `What is ${brand}'s return policy?`,
  "gift card": (brand) => `Does ${brand} offer gift cards?`,
  "blue light card": (brand) => `Does ${brand} offer a Blue Light Card discount?`,
  newsletter: (brand) => `Does ${brand} offer a newsletter sign-up discount?`,
  "first order/sign up": (brand) => `Does ${brand} offer a first order or sign-up discount?`,
  app: (brand) => `Does ${brand} offer an app discount?`,
  "loyalty program": (brand) => `Does ${brand} have a loyalty program?`,
  referral: (brand) => `Does ${brand} offer a referral discount?`,
};

export function buildFallbackQuestion(termName: string, subclass: string) {
  const brand = termName || "this merchant";
  const key = subclass.trim().toLowerCase();
  return (fallbackQuestionTemplates[key] || ((name: string) => `Does ${name} offer ${subclass}?`))(brand);
}

function buildFallbackBrief(row: FaqOutputInputRow, subclass: string) {
  const detail = normalizeSentence(row.discount_details || "");
  const brand = row.term_name || "This merchant";
  if (!detail) {
    return `No. ${brand} does not clearly advertise a standard ${subclass} offer.`;
  }

  const lower = detail.toLowerCase();
  if (
    lower.includes("does not offer") ||
    lower.includes("does not appear") ||
    lower.includes("does not currently") ||
    lower.includes("no standard") ||
    lower.includes("no dedicated")
  ) {
    if (detail.startsWith("No.")) return detail;
    if (detail.startsWith("No,")) return normalizeSentence(`No. ${detail.slice(3)}`);
    return detail.endsWith(".") ? detail : `${detail}.`;
  }

  let sentence = detail
    .replace(/^Yes,\s*/i, "")
    .replace(/^Yes\.\s*/i, "")
    .trim();
  if (!sentence) {
    sentence = `${brand} offers ${subclass} savings.`;
  }
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(escapedBrand, "i").test(sentence)) {
    sentence = `${brand} ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  }
  sentence = normalizeSentence(sentence);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function buildFallbackOutput(row: FaqOutputInputRow, subclass: string): FaqOutputItem {
  return {
    ContentType: "faq",
    Country: normalizeCountryCode(row.country),
    TermID: row.term_id,
    TermName: row.term_name,
    Domain: row.domain,
    Source: "AI",
    Subclass: subclass,
    [BOARD_NAME_FIELD]: "faq",
    Titile1: buildFallbackQuestion(row.term_name, subclass),
    "Brief Introduction": buildFallbackBrief(row, subclass),
    "Href Kw": "",
    "Href Url": "",
  };
}

async function loadGenerationSkill(subclass: string) {
  const routeKey = `faq-output-${subclass.replaceAll("/", "-").replace(/\s+/g, "-")}`;
  const override = getSkillRouteOverride({
    capability: "generation",
    scType: "faq",
    subclass,
  });

  const root = resolveSkillRoot(`skills/${routeKey}`);
  const hasFile = existsSync(join(root, "SKILL.md"));
  if (!override && !hasFile) throw new Error(`该 subclass 尚未接入可执行 skill: ${subclass}`);

  const bundle = hasFile ? await skillRegistry.getSkill(root) : { skillMd: "", references: {}, assets: {} };
  return {
    routeKey,
    skillMd: override?.skillMd || bundle.skillMd,
    outputFormatMd: bundle.references["output-format.md"] || "",
  };
}

async function runWithConcurrency<TInput, TResult>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const size = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: size }, () => consume()));
  return results;
}

async function executeFaqOutputGeneration(
  jobId: string,
  input: {
    scType: ScType;
    uploader: Uploader;
    note?: string;
    fileName: string;
    fileBase64: string;
  },
) {
  const fileBytes = Buffer.from(input.fileBase64, "base64").length;
  if (fileBytes > faqOutputUploadMaxFileBytes) {
    throw new Error(`上传文件过大，请控制在 ${Math.round(faqOutputUploadMaxFileBytes / 1024 / 1024)}MB 以内后再试`);
  }
  const rows = parseFaqOutputFile(input.fileName, input.fileBase64);
  if (rows.length > faqOutputUploadMaxRows) {
    throw new Error(`FAQ 输出单次最多上传 ${faqOutputUploadMaxRows} 条任务，请拆分后再试`);
  }
  if (!rows.length) throw new Error("上传文件为空，无法生成 FAQ 输出。");

  const routedRows = rows.map((row, index) => {
    const subclass = normalizeFaqSubclassFromFactType(row.fact_type);
    const route = resolveSkillRoute({
      capability: "generation",
      scType: "faq",
      subclass,
    });
    return { row, rowIndex: index + 1, subclass, route };
  });

  const routeSummary = Array.from(
    routedRows.reduce((map, item) => {
      const key = item.row.fact_type || "(empty)";
      const current = map.get(key) || {
        factType: key,
        count: 0,
        skillLabel: item.route.skillLabel,
        skillKey: item.route.skillKey,
        source: item.route.source,
        notes: item.route.notes,
        executable: item.route.status === "active",
      };
      current.count += 1;
      current.executable = current.executable || item.route.status === "active";
      map.set(key, current);
      return map;
    }, new Map<string, { factType: string; count: number; skillLabel: string; skillKey: string; source: string; notes: string; executable: boolean }>()),
  ).map(([, value]) => value);

  const executableRows = routedRows.filter((item) => item.route.status === "active");
  if (!executableRows.length) throw new Error("上传文件中没有命中已接入的 FAQ 输出 skill 路由。");

  const concurrency = Math.max(1, Math.min(4, env.ingestRowConcurrency, executableRows.length));
  const skillCache = new Map<string, Awaited<ReturnType<typeof loadGenerationSkill>>>();

  const results = await runWithConcurrency(executableRows, concurrency, async (item) => {
    const startedAt = Date.now();
    let skill = skillCache.get(item.subclass);
    try {
      if (!skill) {
        skill = await loadGenerationSkill(item.subclass);
        skillCache.set(item.subclass, skill);
      }
      const prompt = buildGenerationPrompt(skill.skillMd, skill.outputFormatMd, item.row, item.subclass);
      const executed = await aiExecutor.execute<FaqOutputItem>({
        maxRetries: env.aiExecutorMaxRetries,
        requestTimeoutMs: env.aiRequestTimeoutMsBatch,
        buildMessages: () => prompt,
        validate: (candidate) => validateGenerationCandidate(candidate, item.subclass),
        buildRepairMessages: (candidate, errors) => buildRepairMessages(candidate, errors, item.subclass),
      });

      const finalized = finalizeGenerationItem(executed.result, item.row, item.subclass);

      return {
        rowIndex: item.rowIndex,
        status: "success" as const,
        subclass: item.subclass,
        factType: item.row.fact_type,
        routeKey: skill?.routeKey || item.route.skillKey,
        output: {
          ...finalized,
          Source: finalized.Source || "AI",
          Subclass: item.subclass,
          ContentType: "faq" as const,
          [BOARD_NAME_FIELD]: "faq" as const,
          Titile1: finalized.Titile1 || "",
          "Brief Introduction": finalized["Brief Introduction"] || "",
          "Href Kw": finalized["Href Kw"] || "",
          "Href Url": finalized["Href Url"] || "",
        },
        runtime: {
          elapsedMs: Date.now() - startedAt,
          promptTokens: executed.usage.promptTokens,
          completionTokens: executed.usage.completionTokens,
          totalTokens: executed.usage.totalTokens,
          estimatedCostUsd: estimateCostUsd(executed.usage.promptTokens, executed.usage.completionTokens),
          aiModel: env.aiModel,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("AI 执行校验失败")) {
        return {
          rowIndex: item.rowIndex,
          status: "success" as const,
          subclass: item.subclass,
          factType: item.row.fact_type,
          routeKey: `${skill?.routeKey || item.route.skillKey}:fallback`,
          output: buildFallbackOutput(item.row, item.subclass),
          runtime: {
            elapsedMs: Date.now() - startedAt,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            aiModel: `${env.aiModel}:fallback`,
          },
        };
      }
      return {
        rowIndex: item.rowIndex,
        status: "error" as const,
        subclass: item.subclass,
        factType: item.row.fact_type,
        routeKey: skill?.routeKey || item.route.skillKey,
        error: message,
      };
    }
  });

  const successRows = results.filter((item): item is Extract<GenerationRowResult, { status: "success" }> => item.status === "success");
  const failedRows = results.filter((item): item is Extract<GenerationRowResult, { status: "error" }> => item.status === "error");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(successRows.map((item) => item.output), { header: [...outputHeaders] }), "FAQ输出");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      failedRows.map((item) => ({
        rowIndex: item.rowIndex,
        factType: item.factType,
        subclass: item.subclass,
        routeKey: item.routeKey,
        error: item.error,
      })),
    ),
    "失败明细",
  );

  const xlsxBase64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const promptTokens = successRows.reduce((sum, item) => sum + item.runtime.promptTokens, 0);
  const completionTokens = successRows.reduce((sum, item) => sum + item.runtime.completionTokens, 0);
  const totalTokens = successRows.reduce((sum, item) => sum + item.runtime.totalTokens, 0);
  const estimatedCostUsd = Math.round(successRows.reduce((sum, item) => sum + item.runtime.estimatedCostUsd, 0) * 1_000_000) / 1_000_000;
  const distinctSubclasses = Array.from(new Set(successRows.map((item) => item.subclass)));
  const jobSubclass = distinctSubclasses.length === 1 ? distinctSubclasses[0] : "mixed";
  const resultFileName = `faq-output-${jobSubclass.replaceAll("/", "-").replace(/\s+/g, "-")}-${Date.now()}.xlsx`;
  const errorReason = failedRows.length ? `存在 ${failedRows.length} 行生成失败，请查看失败明细。` : "";

  await completeGenerationJob({
    jobId,
    status: failedRows.length ? "failed" : "done",
    subclass: jobSubclass,
    totalRows: rows.length,
    executableRows: executableRows.length,
    successRows: successRows.length,
    failedRows: failedRows.length,
    skippedRows: rows.length - executableRows.length,
    promptTokensSum: promptTokens,
    completionTokensSum: completionTokens,
    totalTokensSum: totalTokens,
    estimatedCostUsdSum: estimatedCostUsd,
    aiModel: env.aiModel,
    resultFileName,
    resultFileBase64: xlsxBase64,
    routeSummary,
    rowResults: results.map((item) =>
      item.status === "success"
        ? {
            rowIndex: item.rowIndex,
            status: item.status,
            subclass: item.subclass,
            factType: item.factType,
            routeKey: item.routeKey,
            runtime: item.runtime,
          }
        : {
            rowIndex: item.rowIndex,
            status: item.status,
            subclass: item.subclass,
            factType: item.factType,
            routeKey: item.routeKey,
            error: item.error,
          },
    ),
    errorReason,
  });
}

export async function startFaqOutputGeneration(input: {
  scType: ScType;
  uploader: Uploader;
  note?: string;
  fileName: string;
  fileBase64: string;
}) {
  if (input.scType !== "faq") throw new Error("当前仅支持 FAQ 输出。");
  const { jobId } = await createGenerationJob({
    scType: input.scType,
    uploader: input.uploader,
    note: input.note || "",
    inputFileName: input.fileName,
    inputFileBase64: input.fileBase64,
  });

  void executeFaqOutputGeneration(jobId, input).catch(async (error) => {
    await failGenerationJob(jobId, error instanceof Error ? error.message : String(error));
  });

  return { jobId };
}

export async function retryFaqOutputGeneration(jobId: string) {
  const job = await getGenerationJobForRetry(jobId);
  if (!job.inputFileBase64) throw new Error("该任务缺少原始输入文件，无法重试。");

  await markGenerationJobRunning(jobId);

  void executeFaqOutputGeneration(jobId, {
    scType: job.scType as ScType,
    uploader: job.uploader as Uploader,
    note: job.note,
    fileName: job.inputFileName,
    fileBase64: job.inputFileBase64,
  }).catch(async (error) => {
    await failGenerationJob(jobId, error instanceof Error ? error.message : String(error));
  });

  return { jobId };
}
