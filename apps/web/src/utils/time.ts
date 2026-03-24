export const CHINA_TIME_ZONE = "Asia/Shanghai";

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
  if (!date) return "-";
  const parts = chinaDateTimeFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}
