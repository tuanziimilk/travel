import { existsSync } from "node:fs";
import { isAbsolute, resolve, join } from "node:path";

function toCandidates(rawPath: string) {
  if (isAbsolute(rawPath)) {
    const candidates = [rawPath];
    const normalized = rawPath.replace(/\\/g, "/");
    const lower = normalized.toLowerCase();
    const marker = "/skills/";
    const markerIndex = lower.lastIndexOf(marker);
    if (markerIndex >= 0) {
      const suffix = normalized.slice(markerIndex + marker.length).replace(/^[/\\]+/, "");
      candidates.push(resolve(process.cwd(), "skills", suffix));
      candidates.push(resolve(process.cwd(), "..", "skills", suffix));
      candidates.push(resolve(process.cwd(), "..", "..", "skills", suffix));
    }
    return candidates;
  }
  return [
    resolve(process.cwd(), rawPath),
    resolve(process.cwd(), "..", rawPath),
    resolve(process.cwd(), "..", "..", rawPath),
  ];
}

export function resolveSkillRoot(rawPath: string) {
  const candidates = toCandidates(rawPath);
  for (const root of candidates) {
    if (existsSync(join(root, "SKILL.md"))) return root;
  }
  return candidates[0];
}
