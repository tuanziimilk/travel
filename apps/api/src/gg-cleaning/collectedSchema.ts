export const GG_COLLECTED_STATUS_COLUMN = "\u72b6\u6001";
export const GG_COLLECTED_SOURCE_COLUMN = "\u91c7\u96c6\u6570\u636e\u6e90";

export const GG_COLLECTED_REQUIRED_COLUMNS = [
  "country",
  "domain",
  "term_id",
  "term_name",
  "subclass",
  GG_COLLECTED_SOURCE_COLUMN,
  "content",
  "product_urls",
] as const;

export function normalizeCollectedText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function normalizeCollectedSourceType(value: unknown) {
  const collapsed = normalizeCollectedText(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (collapsed === "aimode" || collapsed === "ai") return "aimode";
  if (collapsed === "searchlab" || collapsed === "search") return "searchlab";
  return collapsed;
}

export function normalizeCollectedUrl(value: unknown) {
  const raw = normalizeCollectedText(value);
  if (!raw) return "";
  const decoded = raw
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
  const match = decoded.match(/https?:\/\/[^\s"'<>]+/i);
  const picked = match ? match[0] : decoded;
  return picked.replace(/[),.;\]]+$/g, "");
}

export function parseCollectedStringArrayCell(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCollectedText(item)).filter(Boolean);
  }
  const raw = normalizeCollectedText(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [raw];
    return parsed.map((item) => normalizeCollectedText(item)).filter(Boolean);
  } catch {
    return [raw];
  }
}

export function parseCollectedSnippetCell(value: unknown, cleaner: (value: string) => string) {
  return parseCollectedStringArrayCell(value)
    .map((item) => cleaner(item))
    .filter(Boolean)
    .join("\n\n");
}

export function parseCollectedProductUrlsCell(
  value: unknown,
  urlNormalizer: (value: unknown) => string = normalizeCollectedUrl,
) {
  return Array.from(new Set(parseCollectedStringArrayCell(value).map((item) => urlNormalizer(item)).filter(Boolean)));
}
