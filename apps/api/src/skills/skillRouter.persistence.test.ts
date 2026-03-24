import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSkillRouteOverride, saveSkillRouteOverride } from "./skillRouter";

vi.mock("./skillVersionService", () => ({
  saveVersionedSkill: vi.fn(async (input: { capability: string; scType: string; subclass?: string; skillMd: string }) => {
    const filePath = resolve(
      process.cwd(),
      ".runtime",
      "skill-overrides",
      input.capability,
      input.scType,
      String(input.subclass || "__default__"),
      "SKILL.md",
    );
    rmSync(resolve(process.cwd(), ".runtime"), { force: true, recursive: true });
    const dirPath = resolve(filePath, "..");
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(dirPath, { recursive: true }).then(() => writeFile(filePath, input.skillMd, "utf8")),
    );
    return {
      id: "version-1",
      versionNo: 1,
      createdAt: new Date(),
    };
  }),
  listVersionedSkillHistory: vi.fn(),
  rollbackSkillVersion: vi.fn(),
}));

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
      editor: "tester",
      changeNote: "save test",
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
