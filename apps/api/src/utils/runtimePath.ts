import path from "node:path";
import { existsSync } from "node:fs";

export function resolveApiRuntimeDir() {
  const cwd = process.cwd();
  const nestedApiDir = path.resolve(cwd, "apps", "api");
  if (existsSync(nestedApiDir)) {
    return path.join(nestedApiDir, ".runtime");
  }
  return path.resolve(cwd, ".runtime");
}

