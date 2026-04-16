export function sanitizeFileNameSegment(value: unknown, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

export function formatChinaDownloadTimestamp(date = new Date()) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    chinaDate.getUTCFullYear(),
    pad(chinaDate.getUTCMonth() + 1),
    pad(chinaDate.getUTCDate()),
    "-",
    pad(chinaDate.getUTCHours()),
    pad(chinaDate.getUTCMinutes()),
    pad(chinaDate.getUTCSeconds()),
  ].join("");
}

export function shortDownloadId(value: string, fallback = "task") {
  return sanitizeFileNameSegment(String(value || "").slice(0, 8), fallback);
}
