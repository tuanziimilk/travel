import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function apiRuntimePath(...segments: string[]) {
  return path.resolve(API_ROOT_DIR, ".runtime", ...segments);
}
