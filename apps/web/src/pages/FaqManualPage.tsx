import * as Select from "@radix-ui/react-select";
import * as Accordion from "@radix-ui/react-accordion";
import * as Tabs from "@radix-ui/react-tabs";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { countryOptions, uploaderOptions } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { getLocalizedTextCount, getTextCountModeLabel } from "../lib/textCount";

const FAQ_PIN_KEY = "faq_manual_pin_bundle_v1";

const faqRowSchema = z.object({
  Q_online: z.string().min(1),
  A_online: z.string().min(1),
  subclass: z.string().optional().default(""),
  Q_ai: z.string().min(1),
  A_ai: z.string().min(1),
  Q_op: z.string().optional().default(""),
  A_op: z.string().optional().default(""),
});

const faqFormSchema = z.object({
  TermID: z.string().optional().default(""),
  TermName: z.string().optional().default(""),
  Domain: z.string().optional().default(""),
  Country: z.string().min(2),
  uploader: z.enum(uploaderOptions),
  batchNote: z.string().optional().default(""),
  items: z.array(faqRowSchema).min(1),
});

type FaqForm = z.infer<typeof faqFormSchema>;

type FaqPinBundle = {
  form: FaqForm;
  result: FaqManualResult;
};

type FaqManualResult = {
  moduleId: "faq";
  saved: boolean;
  batchId?: string;
  rows: Array<{
    rowIndex: number;
    output: {
      meta: {
        TermID: string;
        Domain: string;
        Country: string;
        versions_present: Array<"online" | "ai" | "op">;
      };
      results: Array<{
        version: "online" | "ai" | "op";
        score_total: number;
        score_breakdown: { A: number; B: number; C: number; D: number };
        strengths: string[];
        weaknesses: string[];
        suggestions: string[];
        pass_for_publish: boolean;
      }>;
      comparison: {
        best_version: "online" | "ai" | "op";
        ranking: Array<"online" | "ai" | "op">;
        key_deltas: string[];
      };
      notes: string;
    };
    runtime: {
      elapsedMs: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      aiModel: string;
    };
  }>;
};

type FaqVersionKey = "online" | "ai" | "op";

const faqVersionMeta: ReadonlyArray<{ key: FaqVersionKey; title: string; rowClass: string }> = [
  { key: "online", title: "ONLINE", rowClass: "faq-version-online" },
  { key: "ai", title: "AI", rowClass: "faq-version-ai" },
  { key: "op", title: "OP", rowClass: "faq-version-op" },
];

function getQuestionFieldName(idx: number, key: FaqVersionKey) {
  if (key === "online") return `items.${idx}.Q_online` as const;
  if (key === "ai") return `items.${idx}.Q_ai` as const;
  return `items.${idx}.Q_op` as const;
}

function getAnswerFieldName(idx: number, key: FaqVersionKey) {
  if (key === "online") return `items.${idx}.A_online` as const;
  if (key === "ai") return `items.${idx}.A_ai` as const;
  return `items.${idx}.A_op` as const;
}

function getQuestionText(item: FaqForm["items"][number], key: FaqVersionKey) {
  if (key === "online") return item.Q_online || "";
  if (key === "ai") return item.Q_ai || "";
  return item.Q_op || "";
}

function getAnswerText(item: FaqForm["items"][number], key: FaqVersionKey) {
  if (key === "online") return item.A_online || "";
  if (key === "ai") return item.A_ai || "";
  return item.A_op || "";
}

const faqDimMeta = [
  { key: "A", max: 3, label: "A 结构完整" },
  { key: "B", max: 4, label: "B 政策准确" },
  { key: "C", max: 2, label: "C 本地化表达" },
  { key: "D", max: 1, label: "D SEO可发现" },
] as const;

const defaultValues: FaqForm = {
  TermID: "",
  TermName: "",
  Domain: "",
  Country: "UK",
  uploader: "Zoe",
  batchNote: "",
  items: [
    {
      Q_online: "",
      A_online: "",
      subclass: "",
      Q_ai: "",
      A_ai: "",
      Q_op: "",
      A_op: "",
    },
  ],
};

const demoFaqCase: FaqForm = {
  TermID: "102472",
  TermName: "Junkyard",
  Domain: "junkyard.no",
  Country: "NO",
  uploader: "Zoe",
  batchNote: "FAQ PIN 测试-两条",
  items: [
    {
      subclass: "student discount",
      Q_online: "Do you offer a student discount?",
      A_online: "Student discount is available during selected campaigns only.",
      Q_ai: "Is there a student discount at Junkyard?",
      A_ai: "Yes. Junkyard provides student discounts in selected campaigns, and eligibility details are shown on campaign pages.",
      Q_op: "Do you have student discounts?",
      A_op: "Yes, but only in selected campaign periods. Please check campaign details for eligibility.",
    },
    {
      subclass: "free shipping",
      Q_online: "Do you offer free shipping?",
      A_online: "Free shipping is available when your order reaches the minimum spend.",
      Q_ai: "How can I get free shipping at Junkyard?",
      A_ai: "You can get free shipping when your order meets the minimum spend threshold. The exact amount is shown at checkout.",
      Q_op: "When is shipping free?",
      A_op: "Shipping is free once your cart reaches the minimum order amount displayed during checkout.",
    },
  ],
};

const demoFaqResult: FaqManualResult = {
  "moduleId": "faq",
  "saved": false,
  "rows": [
    {
      "rowIndex": 1,
      "output": {
        "meta": {
          "TermID": "102472",
          "Domain": "junkyard.no",
          "Country": "NO",
          "versions_present": [
            "online",
            "ai",
            "op"
          ]
        },
        "results": [
          {
            "version": "online",
            "score_total": 7.3,
            "score_breakdown": {
              "A": 2.1,
              "B": 2.2,
              "C": 2,
              "D": 1
            },
            "strengths": [
              "问句简洁，直接命中“student discount”检索意图，便于用户搜索到该条 FAQ。",
              "答案明确给出结论（仅在选定活动期间可用），用户能快速判断是否存在折扣可能性。",
              "表述简短、无冗长解释，阅读负担低，适合 FAQ 快速浏览场景。"
            ],
            "weaknesses": [
              "高风险：未在 FAQ 中说明关键适用边界（例如谁符合学生资格、如何验证），属资格/范围类问题但缺失资格细节，存在误导/投诉风险。",
              "未说明如何申请或验证学生身份（无可执行步骤），用户不知道下一步操作。",
              "未说明是否可与其他优惠叠加或退款/取消后优惠处理，缺少售后关联信息。",
              "答案过于笼统（“selected campaigns only”），缺少可抽取的条件/例外说明，不利于片段化引用。"
            ],
            "suggestions": [
              "在答案中补充关键资格边界：明确谁属于可享受学生折扣的对象及需提交的证明类型（例如学生证/在读证明），若无法在此处给出全部细节，应指向具体活动页并简述需查验项。",
              "增加可执行步骤：说明用户如何领取或验证学生折扣（在哪里输入/出示证明、需不需要注册/认证等）。",
              "明确与其他优惠的关系与售后规则：说明是否可叠加、退款/取消后优惠如何处理，或在 FAQ 中明确以活动页规则为准并链接至活动详情。"
            ],
            "pass_for_publish": false
          },
          {
            "version": "ai",
            "score_total": 7.8,
            "score_breakdown": {
              "A": 2.2,
              "B": 2.6,
              "C": 2,
              "D": 1
            },
            "strengths": [
              "问句与搜索意图高度匹配，包含商家学生折扣的常见查询向量，利于被检索到。",
              "答案先给肯定结论并指出详细信息位于活动页，提供了明确的下一步查找方向，有助于用户继续获取细节。",
              "表述清晰、语句通顺，便于快速阅读与理解。"
            ],
            "weaknesses": [
              "高风险：虽然指向活动页但 FAQ 本身未列出任何资格细则（如学生身份认定方式），仍然缺少关键适用边界，存在政策风险。",
              "缺少关于如何验证资格与使用流程的可执行步骤，用户需离开 FAQ 才能获得操作指引。",
              "未说明是否可与其他优惠叠加及退款/取消后优惠的处理方式，售后场景未覆盖。"
            ],
            "suggestions": [
              "在 FAQ 中增加至少一行关键提示：列出学生资格验证的常见要求或示例（例如需出示在学证明），若细节在活动页，明确指出活动页具体会展示哪些信息。",
              "补充简要使用步骤（例如在哪里申请/兑换学生折扣或应查看的活动页模块），以提升执行力与降低客服咨询率。",
              "在活动页或 FAQ 中明确是否支持与其他优惠叠加以及退款/取消后的优惠处理规则，或在 FAQ 中明确以活动页最终规则为准并标注查阅路径。"
            ],
            "pass_for_publish": false
          },
          {
            "version": "op",
            "score_total": 7.6,
            "score_breakdown": {
              "A": 2.1,
              "B": 2.5,
              "C": 2,
              "D": 1
            },
            "strengths": [
              "问句简明，直接针对学生折扣这一高频检索意图，搜索可发现性好。",
              "回答明确指出仅在特定活动期间提供，并提醒用户检查活动详情，给出明确的后续查找方向。",
              "语言简洁，便于 FAQ 模块快速呈现与用户扫描阅读。"
            ],
            "weaknesses": [
              "高风险：未在 FAQ 中明确学生资格边界与认证方式，属于资格/范围类但缺失关键条件，存在投诉风险。",
              "缺乏具体可执行步骤（如何验证、如何领取折扣），用户无法在此处直接完成操作。",
              "未提及是否可与其他折扣叠加或退款/取消后优惠处理，售后与叠加规则未覆盖。"
            ],
            "suggestions": [
              "在答案中补充学生资格与认证方式的概要说明（例如接受何种证明），或在 FAQ 明确指向活动详情页的具体区块以获取完整要求。",
              "补充简短的操作路径提示（例如查看活动页 → 验证方式 → 领取/使用步骤），并在活动详情处列出叠加与退款相关规则。"
            ],
            "pass_for_publish": false
          }
        ],
        "comparison": {
          "best_version": "ai",
          "ranking": [
            "ai",
            "op",
            "online"
          ],
          "key_deltas": [
            "{Mer.} 在 ai 版本中不仅给出存在学生折扣的结论，还明确提示在活动页查看资格细则，提供更清晰的后续动作指引。",
            "ai 版本的表述在可执行性上略优于 online 与 op，能更快引导用户去活动详情获取必要信息。",
            "online 与 op 更为简短，但缺少对“去哪里查看资格/如何验证”这一可执行步骤的提示，导致可用性低于 ai。"
          ]
        },
        "notes": "About_online、About_ai 与 About_op 均存在；未缺失 op 版本。语言/本地化判断依据为提供的 references/country-language-map.json；该映射中不包含 Country=NO（挪威），因此无法在本次评分中对语言匹配做确定性扣分，已按文本自然度评估表达质量。所有版本均命中高风险红线（资格/适用范围关键边界缺失；FAQ 为资格/范围类但未说明学生资格认定与验证步骤），已在 weaknesses 中标注为“高风险”。根据高风险封顶规则，所有命中高风险的版本均设置 pass_for_publish=false，且相应 B 与 score_total 控制在封顶限制内。评分过程中未新增或编造任何政策细节（例如具体折扣比例、具体门槛或生效时点），仅建议补充应包含的关键信息点。"
      },
      "runtime": {
        "elapsedMs": 95953,
        "promptTokens": 4567,
        "completionTokens": 5244,
        "totalTokens": 9811,
        "estimatedCostUsd": 0.01163,
        "aiModel": "gpt-5-mini"
      }
    },
    {
      "rowIndex": 2,
      "output": {
        "meta": {
          "TermID": "102472",
          "Domain": "junkyard.no",
          "Country": "NO",
          "versions_present": [
            "online",
            "ai",
            "op"
          ]
        },
        "results": [
          {
            "version": "online",
            "score_total": 7.9,
            "score_breakdown": {
              "A": 2.7,
              "B": 3,
              "C": 1.4,
              "D": 0.8
            },
            "strengths": [
              "问句与答案结构简洁明了，用户可快速理解“达到最低消费即免运费”的结论",
              "明确指出免运费触发条件为“达到最低消费/最低订单金额”，有助用户在结账时核对",
              "使用了统一的术语“free shipping / minimum spend”，便于短句抽取与引用",
              "包含 Subclass 标签，有利于内部分类与检索"
            ],
            "weaknesses": [
              "未说明适用范围和排除项（例如是否适用于特定国家/配送方式或部分商品），属于资格/范围类 FAQ 的关键边界缺失，构成高风险",
              "未明确退款/取消后免运费如何处理（售后关联缺失），可能导致售后纠纷",
              "语言与 Country 的映射在 references/country-language-map.json 中缺失，无法确认本地化语言是否匹配（存在本地化不确定性）",
              "SEO 问句虽直观但缺少多样化问法（如“free shipping for international orders / free shipping threshold” 等），可能降低部分检索覆盖"
            ],
            "suggestions": [
              "补充适用范围与排除项（例如适用地区、是否排除部分商品或配送方式），至少给出适用/不适用的明确说明",
              "在 FAQ 中说明退款/取消后免运费如何处理或指向相关售后政策页面，减少售后争议",
              "统一商家指代为 {Mer.}（内容管理层面替换 TermName），并在不同版本中保持一致",
              "增加一条指引性文本，告知用户在结账页或购物车页面可查看确切的最低免运费金额或提供到相应活动/配送政策页面的链接"
            ],
            "pass_for_publish": false
          },
          {
            "version": "ai",
            "score_total": 7.9,
            "score_breakdown": {
              "A": 2.7,
              "B": 3,
              "C": 1.4,
              "D": 0.8
            },
            "strengths": [
              "问句明确面向用户行为（如何获得免运费），有利于搜索和自然提问匹配",
              "答案直接给出结论并告知“具体金额在结账时显示”，对用户可执行性友好",
              "措辞自然，便于被片段化引用（先结论后条件）",
              "包含 Subclass 标签，有利于内部主题聚合"
            ],
            "weaknesses": [
              "未说明适用地域/适用商品或任何排除项，属于资格/范围类 FAQ 的关键边界缺失，构成高风险",
              "未说明退款或订单变动后免运费的处理方式，售后关联缺失",
              "在输入文本中使用了商家真实名称（TermName），版本间商家指代不一致，需统一为 {Mer.}",
              "Country 到语言的映射在 references/country-language-map.json 中未包含，导致本地化匹配存在不确定性"
            ],
            "suggestions": [
              "补充适用地域与排除项的说明（例如是否对国际订单或特定配送方式生效），或明确指向适用规则页面",
              "补充关于退款/取消时免运费资格如何调整的说明或链接以降低售后争议",
              "将文中商家名替换为 {Mer.} 并在所有版本保持一致，避免实体不稳定影响检索与引用",
              "增加覆盖更常见检索词的问句变体（如“free shipping threshold”，“free shipping international”）以提升 SEO 覆盖"
            ],
            "pass_for_publish": false
          },
          {
            "version": "op",
            "score_total": 7.9,
            "score_breakdown": {
              "A": 2.7,
              "B": 3,
              "C": 1.4,
              "D": 0.8
            },
            "strengths": [
              "问句和回答表述简洁，结论明确：购物车达到最低订单金额即免运费，用户易于理解并立即检查购物车",
              "明确指出最低金额在结账/购物车页面显示，有利于用户执行下一步（查看结账页）",
              "语言表达自然、无堆砌，便于直接被检索与摘要化",
              "包含 Subclass 标签，有利于主题分类与内部管理"
            ],
            "weaknesses": [
              "未说明适用范围与排除项（如是否对所有国家、特定商品或配送方式生效），属于资格/范围类 FAQ 的关键边界缺失，构成高风险",
              "未说明退款/取消后免运费的处理规则，售后场景未覆盖",
              "Country 到语言的映射在 references/country-language-map.json 中未包含，无法确认文本是否完成本地化匹配",
              "未明确是否存在最小消费金额的货币单位或本地化展示方式，可能影响非英语用户的理解"
            ],
            "suggestions": [
              "在 FAQ 中补充明确的适用范围/排除项或指向详细规则页，至少说明是否对国际订单、生鲜/大件等品类适用",
              "补充退款/订单变动后免运费资格的处理说明或链接到售后政策",
              "统一并替换商家指代为 {Mer.}，并在所有版本中保持相同表述，避免实体不一致影响引用与检索"
            ],
            "pass_for_publish": false
          }
        ],
        "comparison": {
          "best_version": "op",
          "ranking": [
            "op",
            "ai",
            "online"
          ],
          "key_deltas": [
            "{Mer.} 页面中三版表述均较简洁，但 op 版措辞更自然（“cart reaches the minimum order amount displayed during checkout”），便于用户理解何时生效",
            "ai 版包含对“具体金额在结账时显示”的提醒，增强可执行性，但在输入中出现真实商家名导致版本间实体不一致",
            "online 版较为简短，信息覆盖与可执行指引略逊于 op/ai 两版"
          ]
        },
        "notes": "About_op 已提供；关于语言/本地化判断依据：使用 references/country-language-map.json（评估时发现 Country = \"NO\" 未在该映射文件中列出，因而无法确认语言是否与国家首选语言匹配）。已命中的高风险项：1) 适用范围/排除项缺失（资格/范围类 FAQ 的关键边界缺失）——标为高风险；2) 退款/取消后免运费处理未说明（售后关联缺失）。根据高风险封顶规则，任何命中高风险红线的版本均设为不可发布（pass_for_publish=false），并保证 B ≤ 3.4 及 score_total ≤ 7.9。输出中已将商家指代要求为 {Mer.}（建议将所有原文中的 TermName 替换为 {Mer.}）。"
      },
      "runtime": {
        "elapsedMs": 91031,
        "promptTokens": 4570,
        "completionTokens": 5803,
        "totalTokens": 10373,
        "estimatedCostUsd": 0.012749,
        "aiModel": "gpt-5-mini"
      }
    }
  ]
};

function safeParseFaqPin() {
  const raw = localStorage.getItem(FAQ_PIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FaqPinBundle;
  } catch {
    return null;
  }
}

function formatDuration(ms: number) {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}秒`;
  const minutes = Math.floor(sec / 60);
  const restSec = Math.round(sec % 60);
  return `${minutes}分${restSec}秒`;
}

export function FaqManualPage() {
  const [result, setResult] = useState<FaqManualResult | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiNotice, setUiNotice] = useState<string | null>(null);
  const form = useForm<FaqForm>({ resolver: zodResolver(faqFormSchema), defaultValues });
  const mutation = trpc.score.manualFaq.useMutation();
  const items = form.watch("items") || [];
  const watchedCountry = form.watch("Country");

  async function runScore(values: FaqForm, persistResult = true, saveToHistory = true) {
    setUiError(null);
    setUiNotice(null);

    const invalidIndexes = values.items
      .map((item, index) => ({
        index,
        isValid: Boolean(item.Q_online.trim() && item.A_online.trim() && item.Q_ai.trim() && item.A_ai.trim()),
      }))
      .filter((row) => !row.isValid)
      .map((row) => row.index + 1);

    if (invalidIndexes.length) {
      throw new Error(`FAQ #${invalidIndexes.join("、#")} 缺少必填字段：线上/AI 的 Q 和 A 需全部填写（OP 可选）`);
    }

    const validItems = values.items.filter((item) => item.Q_online.trim() && item.A_online.trim() && item.Q_ai.trim() && item.A_ai.trim());
    if (!validItems.length) {
      throw new Error("至少需要 1 条完整 FAQ 才能开始评分");
    }

    const payloadItems = validItems.map((item) => ({
      Q_online: item.Q_online,
      A_online: item.A_online,
      subclass_online: item.subclass || "",
      Q_ai: item.Q_ai,
      A_ai: item.A_ai,
      subclass_ai: item.subclass || "",
      Q_op: item.Q_op || "",
      A_op: item.A_op || "",
      subclass_op: item.subclass || "",
    }));

    const data = await mutation.mutateAsync({
      moduleId: "faq",
      TermID: values.TermID,
      TermName: values.TermName,
      Domain: values.Domain,
      Country: values.Country,
      uploader: values.uploader,
      batchNote: values.batchNote,
      saveToHistory,
      items: payloadItems,
    });

    setResult(data);

    if (!data?.rows?.length) {
      setUiNotice("评分完成，但未返回有效结果行。请检查输入内容或稍后重试。");
    }

    if (persistResult) {
      const pin: FaqPinBundle = { form: values, result: data };
      localStorage.setItem(FAQ_PIN_KEY, JSON.stringify(pin));
    }

    return data;
  }

  async function onSubmit(values: FaqForm) {
    try {
      setShowPinned(false);
      await runScore(values, false, true);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "FAQ 评分失败，请稍后重试");
    }
  }

  async function onPinToggle() {
    try {
      setUiError(null);
      setUiNotice(null);

      if (showPinned) {
        setShowPinned(false);
        setResult(null);
        form.reset(defaultValues);
        return;
      }

      form.reset(demoFaqCase);
      setShowPinned(true);
      setResult(demoFaqResult);
      localStorage.setItem(FAQ_PIN_KEY, JSON.stringify({ form: demoFaqCase, result: demoFaqResult } satisfies FaqPinBundle));
      setUiNotice("已加载最新内置 FAQ PIN 结果，并覆盖本地旧缓存。");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "FAQ PIN 测试加载失败，请稍后重试");
    }
  }

  function addItem() {
    form.setValue("items", [
      ...items,
      {
        Q_online: "",
        A_online: "",
        subclass: "",
        Q_ai: "",
        A_ai: "",
        Q_op: "",
        A_op: "",
      },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== index);
    form.setValue("items", next);
  }

  const runtimeSummary = useMemo(() => {
    if (!result?.rows?.length) return null;
    const elapsedTotal = result.rows.reduce((sum, row) => sum + (row.runtime?.elapsedMs || 0), 0);
    const promptTotal = result.rows.reduce((sum, row) => sum + (row.runtime?.promptTokens || 0), 0);
    const completionTotal = result.rows.reduce((sum, row) => sum + (row.runtime?.completionTokens || 0), 0);
    const tokenTotal = result.rows.reduce((sum, row) => sum + (row.runtime?.totalTokens || 0), 0);
    const costTotal = result.rows.reduce((sum, row) => sum + (row.runtime?.estimatedCostUsd || 0), 0);
    const models = Array.from(new Set(result.rows.map((row) => row.runtime?.aiModel).filter(Boolean))) as string[];
    const avgElapsed = Math.round(elapsedTotal / result.rows.length);
    return {
      elapsedTotal,
      avgElapsed,
      promptTotal,
      completionTotal,
      tokenTotal,
      costTotal,
      models,
      rowCount: result.rows.length,
    };
  }, [result]);

  const summaryRows = useMemo(() => {
    if (!result?.rows?.length) return [];
    return result.rows.map((row) => {
      const ranked = row.output.comparison.ranking || [];
      const bestVersion = row.output.comparison.best_version;
      const best = row.output.results.find((item) => item.version === bestVersion) || row.output.results[0];
      const versionScores = ["online", "ai", "op"]
        .map((version) => {
          const found = row.output.results.find((item) => item.version === version);
          if (!found) return null;
          return { version, score: found.score_total, pass: found.pass_for_publish } as const;
        })
        .filter(Boolean) as Array<{ version: "online" | "ai" | "op"; score: number; pass: boolean }>;

      return {
        idx: row.rowIndex,
        bestVersion,
        ranking: ranked,
        score: best?.score_total || 0,
        breakdown: best?.score_breakdown || { A: 0, B: 0, C: 0, D: 0 },
        strengths: best?.strengths || [],
        weaknesses: best?.weaknesses || [],
        suggestions: best?.suggestions || [],
        pass: Boolean(best?.pass_for_publish),
        versionScores,
      };
    });
  }, [result]);

  return (
    <>
      <div className="section-header">
        <h2>FAQ 手动评分</h2>
        <p>支持多条 FAQ（online/ai 必填，op 可选），提交后按条返回评分与版本对比。</p>
      </div>

      <button className="pin-btn" type="button" onClick={onPinToggle}>
        {showPinned ? "取消 PIN（隐藏测试结果）" : "PIN 测试案例（自动填充并展示结果）"}
      </button>
      {showPinned && <div className="pin-tip">当前显示 FAQ PIN 测试结果（全局持久化，可跨刷新复用）。</div>}

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid">
        <div className="info-grid">
          <div className="info-item">
            <label>TermID</label>
            <input className="input" {...form.register("TermID")} />
          </div>

          <div className="info-item">
            <label>TermName</label>
            <input className="input" {...form.register("TermName")} />
          </div>

          <div className="info-item">
            <label>Domain</label>
            <input className="input" {...form.register("Domain")} />
          </div>

          <div className="info-item">
            <div className="info-label-row">
              <label>Country</label>
              <span className="count-mode-inline-tip">字数统计：{getTextCountModeLabel(watchedCountry)}</span>
            </div>
            <Select.Root
              value={form.watch("Country") || ""}
              onValueChange={(v) => form.setValue("Country", v, { shouldValidate: true })}
            >
              <Select.Trigger className="select-trigger" aria-label="faq-country-manual">
                <Select.Value placeholder={form.watch("Country") || "选择国家"} />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {countryOptions.map((country) => (
                      <Select.Item key={country} value={country} className="select-item">
                        <Select.ItemText>{country}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="info-item">
            <label>Uploader</label>
            <Select.Root
              value={form.watch("uploader")}
              onValueChange={(v) => form.setValue("uploader", v as FaqForm["uploader"], { shouldValidate: true })}
            >
              <Select.Trigger className="select-trigger" aria-label="faq-uploader-manual">
                <Select.Value placeholder="选择 uploader" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {uploaderOptions.map((uploader) => (
                      <Select.Item key={uploader} value={uploader} className="select-item">
                        <Select.ItemText>{uploader}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="info-item">
            <label>批次备注（可选）</label>
            <input className="input" {...form.register("batchNote")} />
          </div>
        </div>

        {items.map((item, idx) => (
          <div className="faq-item-card" key={`faq-item-${idx}`}>
            <div className="faq-item-head">
              <div className="faq-item-title">FAQ #{idx + 1}</div>
              <button className="faq-remove-btn" type="button" disabled={items.length <= 1} onClick={() => removeItem(idx)}>
                删除
              </button>
            </div>

            <div className="faq-single-subclass">
              <label className="faq-subclass-tag">SUBCLASS / 子类名称</label>
              <input className="input" placeholder="例如：student discount" {...form.register(`items.${idx}.subclass` as const)} />
            </div>

            <div className="faq-version-rows">
              {faqVersionMeta.map((v) => (
                <div className={`faq-version-row ${v.rowClass}`} key={`${idx}-${v.key}`}>
                  <div className="faq-row-head">{v.title}</div>
                  <div className="faq-field-block">
                    <label className="faq-qa-label">QUESTION</label>
                    <textarea className="faq-qa-textarea" {...form.register(getQuestionFieldName(idx, v.key))} />
                    <div className="faq-word-count">
                      {(() => {
                        const stat = getLocalizedTextCount(getQuestionText(item, v.key), watchedCountry);
                        return `字数：${stat.count} ${stat.unit}`;
                      })()}
                    </div>
                  </div>
                  <div className="faq-field-block">
                    <label className={`faq-qa-label ${v.key === "ai" ? "faq-qa-label-blue" : ""}`}>ANSWER</label>
                    <textarea className="faq-qa-textarea" {...form.register(getAnswerFieldName(idx, v.key))} />
                    <div className="faq-word-count">
                      {(() => {
                        const stat = getLocalizedTextCount(getAnswerText(item, v.key), watchedCountry);
                        return `字数：${stat.count} ${stat.unit}`;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button type="button" className="faq-add-bar" onClick={addItem}>
          <span className="faq-add-plus">+</span>
          <span>新增 FAQ</span>
        </button>

        {(uiError || mutation.error) && <div className="error-text">评分失败：{uiError || mutation.error?.message}</div>}
        {uiNotice && <div className="pin-tip">{uiNotice}</div>}

        <div className="faq-submit-wrap">
          <button className="score-action-btn faq-action-btn" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "评分中..." : "开始评分"}
          </button>
        </div>
      </form>

      {result && (
        <>
          {runtimeSummary && (
            <div className="receipt-box">
                <div className="receipt-item">
                  <span className="receipt-label">耗时</span>
                  <span className="receipt-val">{formatDuration(runtimeSummary.elapsedTotal)}</span>
                  <div className="receipt-sub">平均：{formatDuration(runtimeSummary.avgElapsed)} / 条</div>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Token</span>
                  <span className="receipt-val token-blue">{runtimeSummary.tokenTotal.toLocaleString()}</span>
                  <div className="receipt-sub">
                    prompt {runtimeSummary.promptTotal.toLocaleString()} / completion {runtimeSummary.completionTotal.toLocaleString()}
                  </div>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">费用估算</span>
                  <span className="receipt-val token-pink">${runtimeSummary.costTotal.toFixed(6)}</span>
                  <div className="receipt-sub">共 {runtimeSummary.rowCount} 条 FAQ</div>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">模型</span>
                  <span className="receipt-val">{runtimeSummary.models.join(" / ") || "-"}</span>
                  <div className="receipt-sub">本次 FAQ 评分调用模型</div>
                </div>
            </div>
          )}

          <Tabs.Root defaultValue="summary" className="faq-tabs">
            <Tabs.List className="tabs-list">
              <Tabs.Trigger className="tabs-trigger" value="summary">评分汇总</Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="raw">原始结果</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="summary">
              <div className="faq-rank-legend" aria-label="faq-rank-legend">
                <span className="faq-rank-legend-item"><i className="faq-rank-legend-dot is-top" />高</span>
                <span className="faq-rank-legend-item"><i className="faq-rank-legend-dot is-mid" />中</span>
                <span className="faq-rank-legend-item"><i className="faq-rank-legend-dot is-low" />低</span>
              </div>
              <div className="faq-summary-grid">
                {summaryRows.map((row) => (
                  <div className={`result-card ${row.bestVersion === "ai" ? "result-ai" : ""}`} key={row.idx}>
                    <div className={`status-stamp ${row.pass ? "status-ready" : "status-needs-fix"}`}>{row.pass ? "可发布" : "需优化"}</div>
                    <span className="score-title">FAQ #{row.idx} · 最佳版本：{row.bestVersion.toUpperCase()}</span>
                    <div className="score-big">
                      {row.score.toFixed(1)}
                      <small>/10</small>
                    </div>

                    <div className="faq-version-compare">
                      {(() => {
                        const maxScore = Math.max(...row.versionScores.map((item) => item.score));
                        const minScore = Math.min(...row.versionScores.map((item) => item.score));
                        return row.versionScores.map((item) => {
                          const rankClass =
                            Math.abs(item.score - maxScore) < 0.001
                              ? "is-top"
                              : Math.abs(item.score - minScore) < 0.001
                                ? "is-low"
                                : "is-mid";
                          return (
                            <div className={`faq-version-chip faq-version-chip-${item.version} ${rankClass}`} key={`${row.idx}-${item.version}`}>
                              <span className="faq-version-chip-name">{item.version.toUpperCase()}</span>
                              <span className="faq-version-chip-score">{item.score.toFixed(1)}</span>
                              <span className={`faq-version-chip-dot ${rankClass}`} />
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {faqDimMeta.map((dim) => {
                      const value = row.breakdown[dim.key];
                      const pct = Math.max(0, Math.min(100, (value / dim.max) * 100));
                      return (
                        <div className="progress-group" key={`${row.idx}-${dim.key}`}>
                          <div className="progress-label">
                            <span>{dim.label}</span>
                            <span>
                              {value.toFixed(1)} / {dim.max.toFixed(1)}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}

                    <Accordion.Root type="single" collapsible>
                      <Accordion.Item value={`faq-detail-${row.idx}`}>
                        <Accordion.Header>
                          <Accordion.Trigger className="suggest-btn">查看优势与建议</Accordion.Trigger>
                        </Accordion.Header>
                        <Accordion.Content className="suggest-content">
                          <div>
                            <strong>优势</strong>
                            <ul>{row.strengths.map((text) => <li key={`s-${row.idx}-${text}`}>{text}</li>)}</ul>
                          </div>
                          <div>
                            <strong>劣势</strong>
                            <ul>{row.weaknesses.map((text) => <li key={`w-${row.idx}-${text}`}>{text}</li>)}</ul>
                          </div>
                          <div>
                            <strong>建议</strong>
                            <ul>{row.suggestions.map((text) => <li key={`g-${row.idx}-${text}`}>{text}</li>)}</ul>
                          </div>
                        </Accordion.Content>
                      </Accordion.Item>
                    </Accordion.Root>
                  </div>
                ))}
              </div>
            </Tabs.Content>
            <Tabs.Content value="raw"><pre>{JSON.stringify(result, null, 2)}</pre></Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </>
  );
}
