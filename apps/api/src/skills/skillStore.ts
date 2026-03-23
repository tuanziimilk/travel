import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { moduleSchema, type ModuleId } from "@about-demo/trpc";
import { env } from "../env";
import { resolveSkillRoot } from "./skillPath";

type ModuleSkillOverrideRecord = {
  skillMd: string;
  updatedAt: string;
};

const skillOverrides = new Map<ModuleId, ModuleSkillOverrideRecord>();

function resolveSkillPath(moduleId: ModuleId) {
  if (moduleId === "about") return join(resolveSkillRoot(env.aboutSkillPath), "SKILL.md");
  if (moduleId === "faq") return join(resolveSkillRoot(env.faqSkillPath), "SKILL.md");
  return join(resolveSkillRoot(env.aboutSkillPath), "SKILL.md");
}

export async function readModuleSkillFile(moduleId: ModuleId) {
  const filePath = resolveSkillPath(moduleId);
  try {
    const skillMd = await readFile(filePath, "utf8");
    return { moduleId, skillMd, source: "file" as const };
  } catch {
    if (moduleId === "faq") {
      const aboutFallback = join(resolveSkillRoot(env.aboutSkillPath), "SKILL.md");
      const skillMd = await readFile(aboutFallback, "utf8");
      return { moduleId, skillMd, source: "fallback_about_file" as const };
    }
    throw new Error(`Skill file not found: ${filePath}`);
  }
}

export function getModuleSkillOverride(moduleIdRaw: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  const override = skillOverrides.get(moduleId);
  if (!override) return null;
  return {
    moduleId,
    skillMd: override.skillMd,
    updatedAt: override.updatedAt,
    source: "override" as const,
  };
}

export async function getModuleSkillMd(moduleIdRaw: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  const override = getModuleSkillOverride(moduleId);
  if (override) {
    return override;
  }
  return readModuleSkillFile(moduleId);
}

export async function saveModuleSkillMd(moduleIdRaw: string, skillMd: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  const record: ModuleSkillOverrideRecord = {
    skillMd,
    updatedAt: new Date().toISOString(),
  };
  skillOverrides.set(moduleId, record);
  return { ok: true, moduleId, source: "override" as const, updatedAt: record.updatedAt };
}
