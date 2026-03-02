import { existsSync } from "node:fs";
import { isAbsolute, resolve, join } from "node:path";

function toCandidates(rawPath: string) {
  if (isAbsolute(rawPath)) return [rawPath];
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

