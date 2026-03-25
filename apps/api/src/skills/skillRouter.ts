import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Capability, ModuleId, ScType } from "@about-demo/trpc";
import { formatChinaDateTimeLabel, formatChinaIsoOffset } from "../utils/time";
import { resolveSkillRoot } from "./skillPath";
import { getModuleSkillMd, readModuleSkillFile, saveModuleSkillMd } from "./skillStore";
import { listVersionedSkillHistory, rollbackSkillVersion, saveVersionedSkill } from "./skillVersionService";
import { listSkillVersionHistory } from "./skillVersionStore";

const BOARD_NAME_FIELD = "板块名称";

export const faqOutputSubclasses = [
  "shipping",
  "newsletter/first order/sign up/",
  "student",
  "military",
  "senior",
  "birthday",
  "teacher",
  "first responder",
  "child",
  "new customer",
  "nhs",
  "loyalty program",
  "employee",
  "referral",
  "existing customer",
  "app",
  "clearance",
  "family",
  "blue light card",
  "aaa",
  "gift card",
  "price guarantee",
  "return",
] as const;

export type SkillRouteMatch = {
  capability: Capability;
  scType: ScType;
  subclass: string;
  skillKey: string;
  skillLabel: string;
  matchedBy: "subclass" | "default";
  status: "active" | "placeholder";
  notes: string;
  source: "route_rule" | "override";
  hasOverride: boolean;
};

export type SkillRouteRecord = SkillRouteMatch & {
  defaultSkillKey: string;
};

type SkillRouteRule = {
  capability: Capability;
  scType: ScType;
  subclass: string;
  skillKey: string;
  skillLabel: string;
  status: "active" | "placeholder";
  notes: string;
};

type SkillOverrideRecord = {
  capability: Capability;
  scType: ScType;
  subclass: string;
  skillMd: string;
  updatedAt: string;
};

export type SkillRouteDocument = {
  skillMd: string;
  source: string;
  isLive: boolean;
  canEditLive: boolean;
  message: string;
  updatedAt?: string;
  matchedVersionId?: string;
  matchedVersionNo?: number;
  matchedVersionEditor?: string;
  matchedVersionCreatedAt?: string;
  matchedVersionChangeNote?: string;
  matchedVersionActionType?: string;
};

function resolveHistoryTargetType(capability: Capability, subclass?: string) {
  return capability === "quality" && !normalizeSubclass(subclass) ? "module_live" : "route_override";
}

const faqFactTypeAliases: Record<string, string> = {
  shipping_policy: "shipping",
  newsletter_discount: "newsletter/first order/sign up/",
  first_order_discount: "newsletter/first order/sign up/",
  sign_up_discount: "newsletter/first order/sign up/",
  student_discount: "student",
  military_discount: "military",
  senior_discount: "senior",
  birthday_discount: "birthday",
  teacher_discount: "teacher",
  first_responder_discount: "first responder",
  child_discount: "child",
  new_customer_discount: "new customer",
  nhs_discount: "nhs",
  loyalty_program: "loyalty program",
  employee_discount: "employee",
  referral_discount: "referral",
  existing_customer_discount: "existing customer",
  app_discount: "app",
  clearance_discount: "clearance",
  family_discount: "family",
  blue_light_card_discount: "blue light card",
  aaa_discount: "aaa",
  gift_card: "gift card",
  price_guarantee: "price guarantee",
  return_policy: "return",
};

export function toFaqOutputSkillSlug(subclass: string) {
  return normalizeSubclass(subclass).replaceAll("/", "-").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

const generationRouteRules: SkillRouteRule[] = faqOutputSubclasses.map((subclass) => ({
  capability: "generation",
  scType: "faq",
  subclass,
  skillKey: `faq-output-${toFaqOutputSkillSlug(subclass)}`,
  skillLabel: `FAQ 输出 / ${subclass}`,
  status: "placeholder",
  notes: `等待挂载 FAQ 输出 skill: ${subclass}`,
}));

generationRouteRules.push({
  capability: "generation",
  scType: "faq",
  subclass: "",
  skillKey: "faq-output-default",
  skillLabel: "FAQ 输出 / 未命中 subclass",
  status: "placeholder",
  notes: "当 fact_type 未命中任何 FAQ subclass 时，落到这条兜底输出 skill。",
});

const qualityRouteRules: SkillRouteRule[] = [
  {
    capability: "quality",
    scType: "about",
    subclass: "",
    skillKey: "about-quality-default",
    skillLabel: "About 质检 / 默认",
    status: "active",
    notes: "当前 About 质检默认 skill。",
  },
  {
    capability: "quality",
    scType: "faq",
    subclass: "",
    skillKey: "faq-quality-default",
    skillLabel: "FAQ 质检 / 默认",
    status: "active",
    notes: "当前 FAQ 质检默认 skill。",
  },
];

const routeRules = [...generationRouteRules, ...qualityRouteRules];
const skillOverrides = new Map<string, SkillOverrideRecord>();

function normalizeSubclass(value?: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function makeRouteId(capability: Capability, scType: ScType, subclass?: string) {
  return `${capability}::${scType}::${normalizeSubclass(subclass)}`;
}

function resolveQualityModuleId(scType: ScType): ModuleId | null {
  if (scType === "about" || scType === "faq") return scType;
  return null;
}

function resolveGenerationSkillRoot(scType: ScType, subclass?: string) {
  if (scType !== "faq") return null;
  const normalizedSubclass = normalizeSubclass(subclass);
  if (!normalizedSubclass) return null;
  const slug = toFaqOutputSkillSlug(normalizedSubclass);
  return resolveSkillRoot(`skills/faq-output-${slug}`);
}

function hasGenerationSkillFile(scType: ScType, subclass?: string) {
  const root = resolveGenerationSkillRoot(scType, subclass);
  if (!root) return false;
  return existsSync(join(root, "SKILL.md"));
}

function buildRouteOverridePaths(capability: Capability, scType: ScType, subclass?: string) {
  const normalizedSubclass = normalizeSubclass(subclass) || "__default__";
  const slug = normalizedSubclass === "__default__" ? normalizedSubclass : toFaqOutputSkillSlug(normalizedSubclass);
  return [
    resolve(process.cwd(), ".runtime", "skill-overrides", capability, scType, slug, "SKILL.md"),
    resolve(process.cwd(), "apps", "api", ".runtime", "skill-overrides", capability, scType, slug, "SKILL.md"),
  ];
}

function resolveRouteOverridePath(capability: Capability, scType: ScType, subclass?: string) {
  const [primaryPath, legacyPath] = buildRouteOverridePaths(capability, scType, subclass);
  if (existsSync(primaryPath)) return primaryPath;
  if (existsSync(legacyPath) || existsSync(resolve(process.cwd(), "apps", "api", ".runtime"))) return legacyPath;
  return primaryPath;
}

function getParentDir(filePath: string) {
  return filePath.replace(/[\\/][^\\/]+$/, "");
}

function readRouteOverride(capability: Capability, scType: ScType, subclass?: string): SkillOverrideRecord | null {
  const filePath = resolveRouteOverridePath(capability, scType, subclass);
  if (!existsSync(filePath)) return null;
  const stats = statSync(filePath);
  return {
    capability,
    scType,
    subclass: normalizeSubclass(subclass),
    skillMd: readFileSync(filePath, "utf8"),
    updatedAt: formatChinaDateTimeLabel(stats.mtime),
  };
}

async function getMatchedLiveVersionMeta(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
  skillMd: string;
}) {
  const rows = await listSkillVersionHistory({
    capability: input.capability,
    scType: input.scType,
    subclass: normalizeSubclass(input.subclass),
    targetType: resolveHistoryTargetType(input.capability, input.subclass),
  });
  const matched = rows.find((row) => row.skillMd === input.skillMd) || null;
  if (!matched) return {};
  return {
    matchedVersionId: matched.id,
    matchedVersionNo: matched.versionNo,
    matchedVersionEditor: matched.editor,
    matchedVersionCreatedAt: formatChinaIsoOffset(matched.createdAt),
    matchedVersionChangeNote: matched.changeNote,
    matchedVersionActionType: matched.actionType,
  };
}

async function readGenerationSkillFile(scType: ScType, subclass?: string) {
  const root = resolveGenerationSkillRoot(scType, subclass);
  if (!root) return null;
  const filePath = join(root, "SKILL.md");
  if (!existsSync(filePath)) return null;
  const skillMd = await readFile(filePath, "utf8");
  return {
    root,
    skillMd,
    source: "file" as const,
  };
}

function getStoredOverride(capability: Capability, scType: ScType, subclass?: string) {
  const normalizedSubclass = normalizeSubclass(subclass);
  if (capability === "quality" && !normalizedSubclass) return null;
  return readRouteOverride(capability, scType, normalizedSubclass);
}

export function normalizeFaqSubclassFromFactType(value?: string) {
  const raw = normalizeSubclass(value).replace(/\s+/g, "_");
  return faqFactTypeAliases[raw] || normalizeSubclass(value);
}

function toRecord(rule: SkillRouteRule): SkillRouteRecord {
  const override = getStoredOverride(rule.capability, rule.scType, rule.subclass);
  const hasFileBackedSkill =
    rule.capability === "generation" && rule.subclass ? hasGenerationSkillFile(rule.scType, rule.subclass) : false;
  const effectiveStatus = override || hasFileBackedSkill ? "active" : rule.status;

  return {
    capability: rule.capability,
    scType: rule.scType,
    subclass: rule.subclass,
    skillKey: override ? `${rule.skillKey} (override)` : rule.skillKey,
    defaultSkillKey: rule.skillKey,
    skillLabel: rule.skillLabel,
    matchedBy: rule.subclass ? "subclass" : "default",
    status: effectiveStatus,
    notes: override
      ? `已覆盖，更新时间 ${override.updatedAt}`
      : hasFileBackedSkill
        ? "已检测到本地 skill 文件。"
        : rule.notes,
    source: override ? "override" : "route_rule",
    hasOverride: Boolean(override),
  };
}

export function listSkillRoutes(filters?: { capability?: Capability; scType?: ScType; subclass?: string }) {
  const subclass = normalizeSubclass(filters?.subclass);
  return routeRules
    .filter((rule) => (filters?.capability ? rule.capability === filters.capability : true))
    .filter((rule) => (filters?.scType ? rule.scType === filters.scType : true))
    .filter((rule) => (subclass ? rule.subclass.includes(subclass) : true))
    .map(toRecord);
}

export function getSkillRouteOverride(input: { capability: Capability; scType: ScType; subclass?: string }) {
  return getStoredOverride(input.capability, input.scType, input.subclass);
}

export async function getSkillRouteDocument(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
}): Promise<SkillRouteDocument> {
  if (input.capability === "quality") {
    const moduleId = resolveQualityModuleId(input.scType);
    if (!moduleId) {
      return {
        skillMd: "",
        source: "unavailable",
        isLive: false,
        canEditLive: false,
        message: "当前只有 About 和 FAQ 质检已接入真实执行链路。",
      };
    }

    const moduleSkill = await getModuleSkillMd(moduleId);
    const matchedVersionMeta = await getMatchedLiveVersionMeta({
      capability: input.capability,
      scType: input.scType,
      subclass: input.subclass,
      skillMd: moduleSkill.skillMd,
    });
    return {
      skillMd: moduleSkill.skillMd,
      source: moduleSkill.source,
      isLive: true,
      canEditLive: true,
      updatedAt: undefined,
      ...matchedVersionMeta,
      message: "当前展示的是线上实际生效的质检 SKILL.md 内容。",
    };
  }

  const override = getSkillRouteOverride(input);
  if (override) {
    const matchedVersionMeta = await getMatchedLiveVersionMeta({
      capability: input.capability,
      scType: input.scType,
      subclass: input.subclass,
      skillMd: override.skillMd,
    });
    return {
      skillMd: override.skillMd,
      source: "route_override",
      isLive: false,
      canEditLive: false,
      updatedAt: override.updatedAt,
      ...matchedVersionMeta,
      message: "当前展示的是路由覆盖内容；输出链路将优先读取这里的覆盖内容。",
    };
  }

  const fileDocument = await readGenerationSkillFile(input.scType, input.subclass);
  if (fileDocument) {
    const matchedVersionMeta = await getMatchedLiveVersionMeta({
      capability: input.capability,
      scType: input.scType,
      subclass: input.subclass,
      skillMd: fileDocument.skillMd,
    });
    return {
      skillMd: fileDocument.skillMd,
      source: fileDocument.source,
      isLive: false,
      canEditLive: false,
      ...matchedVersionMeta,
      message: "当前展示的是仓库内的本地输出 skill 文件。",
    };
  }

  return {
    skillMd: "",
    source: "route_rule",
    isLive: false,
    canEditLive: false,
    message: "当前路由下还没有可直接查看的生效 SKILL.md 内容。",
  };
}

async function saveSkillRouteOverrideLegacy(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
  skillMd: string;
  overwrite?: boolean;
}) {
  const normalizedSubclass = normalizeSubclass(input.subclass);

  if (input.capability === "quality" && !normalizedSubclass) {
    const moduleId = resolveQualityModuleId(input.scType);
    if (!moduleId) {
      throw new Error(`Unsupported quality route scType: ${input.scType}`);
    }
    return saveModuleSkillMd(moduleId, input.skillMd);
  }

  const routeId = makeRouteId(input.capability, input.scType, normalizedSubclass);
  if (!input.overwrite && skillOverrides.has(routeId)) {
    throw new Error("该 skill 路由已经存在覆盖内容，请勾选覆盖后再保存。");
  }

  const record: SkillOverrideRecord = {
    capability: input.capability,
    scType: input.scType,
    subclass: normalizedSubclass,
    skillMd: input.skillMd,
    updatedAt: formatChinaDateTimeLabel(new Date()),
  };
  skillOverrides.set(routeId, record);
  return { ok: true, routeId, updatedAt: record.updatedAt };
}

export async function saveSkillRouteOverride(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
  skillMd: string;
  editor: string;
  changeNote: string;
  overwrite?: boolean;
}) {
  const normalizedSubclass = normalizeSubclass(input.subclass);

  if (input.capability === "quality" && !normalizedSubclass) {
    const moduleId = resolveQualityModuleId(input.scType);
    if (!moduleId) {
      throw new Error(`Unsupported quality route scType: ${input.scType}`);
    }
    const record = await saveVersionedSkill({
      capability: input.capability,
      scType: input.scType,
      subclass: normalizedSubclass,
      targetType: "module_live",
      skillMd: input.skillMd,
      editor: input.editor,
      changeNote: input.changeNote,
    });
    return {
      ok: true,
      moduleId,
      versionId: record.id,
      versionNo: record.versionNo,
      updatedAt: formatChinaDateTimeLabel(record.createdAt),
    };
  }

  const routeId = makeRouteId(input.capability, input.scType, normalizedSubclass);
  const filePath = resolveRouteOverridePath(input.capability, input.scType, normalizedSubclass);
  if (!input.overwrite && existsSync(filePath)) {
    throw new Error("Skill route override already exists, please enable overwrite and save again.");
  }

  const record = await saveVersionedSkill({
    capability: input.capability,
    scType: input.scType,
    subclass: normalizedSubclass,
    targetType: "route_override",
    skillMd: input.skillMd,
    editor: input.editor,
    changeNote: input.changeNote,
  });
  return {
    ok: true,
    routeId,
    versionId: record.id,
    versionNo: record.versionNo,
    updatedAt: formatChinaDateTimeLabel(record.createdAt),
  };
}

export async function listSkillHistory(input: { capability: Capability; scType: ScType; subclass?: string }) {
  const rows = await listVersionedSkillHistory({
    capability: input.capability,
    scType: input.scType,
    subclass: normalizeSubclass(input.subclass),
    targetType: resolveHistoryTargetType(input.capability, input.subclass),
  });
  return rows.map((row) => ({
    id: row.id,
    versionNo: row.versionNo,
    actionType: row.actionType,
    editor: row.editor,
    changeNote: row.changeNote,
    sourceSnapshot: row.sourceSnapshot,
    createdAt: formatChinaIsoOffset(row.createdAt),
    summary: row.skillMd.split(/\r?\n/).find((line) => line.trim())?.slice(0, 120) || "",
  }));
}

export async function getSkillHistoryDetail(input: { versionId: string }) {
  const { getSkillVersionDetail } = await import("./skillVersionStore");
  const row = await getSkillVersionDetail(input.versionId);
  if (!row) throw new Error("未找到指定历史版本");
  return {
    ...row,
    createdAt: formatChinaIsoOffset(row.createdAt),
  };
}

export async function rollbackSkillHistory(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
  versionId: string;
  editor: string;
  changeNote: string;
}) {
  const result = await rollbackSkillVersion({
    capability: input.capability,
    scType: input.scType,
    subclass: normalizeSubclass(input.subclass),
    targetType: resolveHistoryTargetType(input.capability, input.subclass),
    versionId: input.versionId,
    editor: input.editor,
    changeNote: input.changeNote,
  });
  return {
    ok: true,
    versionId: result.version.id,
    versionNo: result.version.versionNo,
    updatedAt: formatChinaDateTimeLabel(result.version.createdAt),
    restoredFromVersionNo: result.restoredFrom.versionNo,
  };
}

export function resolveSkillRoute(input: {
  capability: Capability;
  scType: ScType;
  subclass?: string;
}): SkillRouteMatch {
  const subclass =
    input.scType === "faq" && input.capability === "generation"
      ? normalizeFaqSubclassFromFactType(input.subclass)
      : normalizeSubclass(input.subclass);

  const exactRule = routeRules.find(
    (rule) => rule.capability === input.capability && rule.scType === input.scType && rule.subclass === subclass,
  );

  const fallbackRule =
    exactRule ||
    routeRules.find((rule) => rule.capability === input.capability && rule.scType === input.scType && !rule.subclass);

  if (!fallbackRule) {
    return {
      capability: input.capability,
      scType: input.scType,
      subclass,
      skillKey: `${input.capability}-${input.scType}-unmapped`,
      skillLabel: "未配置 skill",
      matchedBy: "default",
      status: "placeholder",
      notes: "当前组合还没有配置 skill 路由规则。",
      source: "route_rule",
      hasOverride: false,
    };
  }

  return toRecord({ ...fallbackRule, subclass: exactRule?.subclass ?? fallbackRule.subclass });
}

export async function getActiveQualitySkill(input: { scType: ScType }) {
  const moduleId = resolveQualityModuleId(input.scType);
  if (!moduleId) {
    throw new Error(`Unsupported quality route scType: ${input.scType}`);
  }

  const route = resolveSkillRoute({
    capability: "quality",
    scType: input.scType,
    subclass: "",
  });

  const document = await readModuleSkillFile(moduleId);
  return { route, document };
}

export function getGenerationFramework(scType: ScType) {
  return {
    scType,
    uploadColumns: [
      "term_id",
      "country",
      "domain",
      "term_name",
      "fact_type",
      "supported",
      "status",
      "discount_type",
      "discount_value",
      "currency",
      "discount_details",
      "url",
    ],
    outputColumns: [
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
    ],
    sampleOutput: {
      ContentType: "faq",
      Country: "NO",
      TermID: "102472",
      TermName: "Junkyard",
      Domain: "junkyard.no",
      Source: "Blog",
      Subclass: "gift card",
      [BOARD_NAME_FIELD]: "faq",
      Titile1: "Tillater {Mer.} meg å kjøpe gavekortet deres?",
      "Brief Introduction":
        "{Mer.} gavekort er definitivt den perfekte hjelpen når du ikke har en bestemt gaveide i tankene! De vakre gavekortene deres kan kjøpes direkte fra nettbutikken og kan brukes til hele nettbutikkens produktspekter! Du kan sende elektroniske gavekort digitalt via e-post: Velg en dato for å sende dem!",
      "Href Kw": "chez Luminaire.fr",
      "Href Url": "https://www.luminaire.fr/",
    },
    supportedSubclasses: [...faqOutputSubclasses],
  };
}
