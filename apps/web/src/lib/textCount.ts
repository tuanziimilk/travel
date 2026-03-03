const COUNTRY_LOCALE_MAP: Record<string, string> = {
  AT: "de-AT",
  AU: "en-AU",
  BE: "nl-BE",
  BR: "pt-BR",
  CA: "en-CA",
  CH: "de-CH",
  CZ: "cs-CZ",
  DE: "de-DE",
  DK: "da-DK",
  ES: "es-ES",
  FR: "fr-FR",
  GR: "el-GR",
  HK: "zh-HK",
  IT: "it-IT",
  JP: "ja-JP",
  KR: "ko-KR",
  NL: "nl-NL",
  PL: "pl-PL",
  PT: "pt-PT",
  SE: "sv-SE",
  SK: "sk-SK",
  UK: "en-GB",
  US: "en-US",
};

const CHARACTER_COUNT_COUNTRIES = new Set(["JP", "KR", "HK"]);

export function getTextCountModeLabel(country?: string) {
  const code = (country || "").toUpperCase();
  return CHARACTER_COUNT_COUNTRIES.has(code) ? "按字统计" : "按词统计";
}

export function getLocalizedTextCount(text: string, country?: string) {
  const content = (text || "").trim();
  if (!content) {
    return { count: 0, unit: CHARACTER_COUNT_COUNTRIES.has(country || "") ? "字" : "词" };
  }

  const countryCode = (country || "").toUpperCase();
  const locale = COUNTRY_LOCALE_MAP[countryCode] || "en";

  if (CHARACTER_COUNT_COUNTRIES.has(countryCode)) {
    return { count: countCharacters(content, locale), unit: "字" };
  }

  return { count: countWords(content, locale), unit: "词" };
}

function countCharacters(text: string, locale: string) {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return 0;

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    return Array.from(segmenter.segment(compact)).length;
  }

  return Array.from(compact).length;
}

function countWords(text: string, locale: string) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    let total = 0;
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) total += 1;
    }
    if (total > 0) return total;
  }

  const tokens = text.match(/[\p{L}\p{N}]+/gu);
  return tokens?.length || 0;
}
