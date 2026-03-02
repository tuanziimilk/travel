import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ModuleId } from "@about-demo/trpc";
import { env } from "../env";
import { resolveSkillRoot } from "./skillPath";

export type SkillBundle = {
  skillMd: string;
  references: Record<string, string>;
  assets: Record<string, string>;
};

class SkillRegistry {
  private cache = new Map<string, SkillBundle>();

  async getSkill(path: string): Promise<SkillBundle> {
    if (this.cache.has(path)) return this.cache.get(path)!;

    const skillMd = await readFile(join(path, "SKILL.md"), "utf8");
    const references = await this.readDirAsMap(join(path, "references"));
    const assets = await this.readDirAsMap(join(path, "assets"));
    const bundle = { skillMd, references, assets };
    this.cache.set(path, bundle);
    return bundle;
  }

  async getAboutSkill(): Promise<SkillBundle> {
    return this.getSkill(resolveSkillRoot(env.aboutSkillPath));
  }

  async getModuleSkill(moduleId: ModuleId): Promise<SkillBundle> {
    if (moduleId === "faq") {
      try {
        return await this.getSkill(resolveSkillRoot(env.faqSkillPath));
      } catch {
        return this.getSkill(resolveSkillRoot(env.aboutSkillPath));
      }
    }
    return this.getSkill(resolveSkillRoot(env.aboutSkillPath));
  }

  invalidate(path?: string) {
    if (path) this.cache.delete(path);
    else this.cache.clear();
  }

  private async readDirAsMap(dir: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    try {
      const files = await readdir(dir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        map[f.name] = await readFile(join(dir, f.name), "utf8");
      }
    } catch {
      return map;
    }
    return map;
  }
}

export const skillRegistry = new SkillRegistry();
