import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSkillRouteOverride, saveSkillRouteOverride } from "./skillRouter";

const overrideFilePath = resolve(
  process.cwd(),
  ".runtime",
  "skill-overrides",
  "generation",
  "faq",
  "student",
  "SKILL.md",
);

afterEach(() => {
  rmSync(resolve(process.cwd(), ".runtime"), { force: true, recursive: true });
});

describe("skill route override persistence", () => {
  it("writes generation route overrides to disk and reads them back", async () => {
    const skillMd = "# student override\n\nThis is persisted.";

    await saveSkillRouteOverride({
      capability: "generation",
      scType: "faq",
      subclass: "student",
      skillMd,
      overwrite: true,
    });

    expect(existsSync(overrideFilePath)).toBe(true);
    expect(readFileSync(overrideFilePath, "utf8")).toBe(skillMd);

    const override = getSkillRouteOverride({
      capability: "generation",
      scType: "faq",
      subclass: "student",
    });

    expect(override?.skillMd).toBe(skillMd);
  });
});
