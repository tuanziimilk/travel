import path from "node:path";

export function apiRuntimePath(...segments: string[]) {
  return path.resolve(process.cwd(), "apps/api/.runtime", ...segments);
}
