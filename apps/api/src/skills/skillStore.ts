import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { moduleSchema, type ModuleId } from "@about-demo/trpc";
import { env } from "../env";

const skillOverrides = new Map<ModuleId, string>();

function resolveSkillPath(moduleId: ModuleId) {
  if (moduleId === "about") return join(env.aboutSkillPath, "SKILL.md");
  if (moduleId === "faq") return join(env.aboutSkillPath, "SKILL.md");
  return join(env.aboutSkillPath, "SKILL.md");
}

export async function getModuleSkillMd(moduleIdRaw: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  const override = skillOverrides.get(moduleId);
  if (override) {
    return { moduleId, skillMd: override, source: "override" as const };
  }
  const filePath = resolveSkillPath(moduleId);
  const skillMd = await readFile(filePath, "utf8");
  return { moduleId, skillMd, source: "file" as const };
}

export async function saveModuleSkillMd(moduleIdRaw: string, skillMd: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  skillOverrides.set(moduleId, skillMd);
  return { ok: true, moduleId, source: "override" as const };
}

