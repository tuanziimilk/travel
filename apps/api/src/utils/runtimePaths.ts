import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const moduleRelativeRuntimeDir = path.resolve(moduleDir, "..", "..", ".runtime");

export function resolveApiRuntimeDir() {
  const envRuntimeDir = process.env.API_RUNTIME_DIR?.trim();
  if (envRuntimeDir) return envRuntimeDir;

  const candidates = [
    path.resolve(process.cwd(), "apps", "api", ".runtime"),
    path.resolve(process.cwd(), ".runtime"),
    moduleRelativeRuntimeDir,
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing || moduleRelativeRuntimeDir;
}

export function resolveApiRuntimePath(...segments: string[]) {
  return path.join(resolveApiRuntimeDir(), ...segments);
}

export const apiRuntimePath = resolveApiRuntimePath;
