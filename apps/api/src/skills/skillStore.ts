import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { moduleSchema, type ModuleId } from "@about-demo/trpc";
import { env } from "../env";
import { resolveSkillRoot } from "./skillPath";

function resolveSkillPath(moduleId: ModuleId) {
  if (moduleId === "about") return join(resolveSkillRoot(env.aboutSkillPath), "SKILL.md");
  if (moduleId === "faq") return join(resolveSkillRoot(env.faqSkillPath), "SKILL.md");
  return join(resolveSkillRoot(env.aboutSkillPath), "SKILL.md");
}

function getParentDir(filePath: string) {
  return filePath.replace(/[\\/][^\\/]+$/, "");
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
  moduleSchema.parse(moduleIdRaw);
  return null;
}

export async function getModuleSkillMd(moduleIdRaw: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  return readModuleSkillFile(moduleId);
}

export async function saveModuleSkillMd(moduleIdRaw: string, skillMd: string) {
  const moduleId = moduleSchema.parse(moduleIdRaw);
  const filePath = resolveSkillPath(moduleId);
  await mkdir(getParentDir(filePath), { recursive: true });
  await writeFile(filePath, skillMd, "utf8");
  return { ok: true, moduleId, source: "file" as const, updatedAt: new Date().toISOString() };
}
