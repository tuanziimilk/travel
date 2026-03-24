export const CHINA_TIME_ZONE = "Asia/Shanghai";
export const CHINA_UTC_OFFSET = "+08:00";

const chinaDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: CHINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function toDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

export function formatChinaDateTime(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return "";
  const parts = chinaDateTimeFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function formatChinaIsoOffset(value?: string | Date | null) {
  const formatted = formatChinaDateTime(value);
  if (!formatted) return "";
  return `${formatted.replace(" ", "T")}${CHINA_UTC_OFFSET}`;
}

export function formatChinaDateTimeLabel(value?: string | Date | null) {
  const formatted = formatChinaDateTime(value);
  return formatted ? `${formatted} (UTC+8)` : "";
}

export function replaceUtcTimestampsInText(text?: string | null) {
  const raw = String(text || "");
  if (!raw) return raw;
  return raw.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/g, (match) => formatChinaDateTimeLabel(match) || match);
}
