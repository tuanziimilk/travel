import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../env";

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
    return this.getSkill(env.aboutSkillPath);
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

