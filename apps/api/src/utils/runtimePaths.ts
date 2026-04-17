import { existsSync } from "node:fs";
import path from "node:path";

const workspaceRuntimeDir = path.resolve(process.cwd(), "apps", "api", ".runtime");
const processRuntimeDir = path.resolve(process.cwd(), ".runtime");

export function resolveApiRuntimeDir() {
  const envRuntimeDir = process.env.API_RUNTIME_DIR?.trim();
  if (envRuntimeDir) return envRuntimeDir;

  const candidates = [
    workspaceRuntimeDir,
    processRuntimeDir,
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing || workspaceRuntimeDir;
}

export function resolveApiRuntimePath(...segments: string[]) {
  return path.join(resolveApiRuntimeDir(), ...segments);
}

export const apiRuntimePath = resolveApiRuntimePath;
