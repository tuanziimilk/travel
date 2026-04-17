import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseCsvStream } from "csv-parse";
import iconv from "iconv-lite";
import { createReadStream, promises as fs } from "node:fs";
import readline from "node:readline";
import * as XLSX from "xlsx";
import { ggCleaningUploadMaxFileBytes, ggCleaningUploadMaxRows } from "@about-demo/trpc";
import {
  GG_COLLECTED_REQUIRED_COLUMNS,
  GG_COLLECTED_SOURCE_COLUMN,
  normalizeCollectedSourceType,
  normalizeCollectedUrl,
  parseCollectedProductUrlsCell,
  parseCollectedSnippetCell,
} from "./collectedSchema";

export type GgCleaningInputMode = "raw";
export type GgCleaningExistence = "yes" | "no" | "unknown";

export type GgCleaningPreview = {
  inputMode: GgCleaningInputMode;
  totalRows: number;
  groupedRows: number;
  groupedRowsEstimated?: boolean;
  chunkCount?: number;
  oversizedGroupCount?: number;
  previewStrategy?: "full" | "fast";
  columns: Array<{ name: string; sampleValues: string[] }>;
  sampleRows: Array<Record<string, string>>;
};

export type GgCleaningJobSummary = {
  inputMode: GgCleaningInputMode;
  totalRows: number;
  groupedRows: number;
  chunkCount?: number;
  oversizedGroupCount?: number;
  successRows: number;
  failedRows: number;
};

type ParsedFile = {
  rawRows: Array<Record<string, unknown>>;
  sampleRows: Array<Record<string, string>>;
  columns: string[];
};

type PreviewBuildInput = {
  columns: string[];
  sampleRawRows: Array<Record<string, unknown>>;
  totalRows: number;
  groupedRows: number;
  groupedRowsEstimated?: boolean;
  chunkCount?: number;
  oversizedGroupCount?: number;
  previewStrategy?: "full" | "fast";
};

type InputRow = {
  termId: string;
  country: string;
  domain: string;
  termName: string;
  factType: string;
  sourceType: string;
  normalizedTermId: string;
  countryCode: string;
  canonicalFactType: string;
  normalizedSourceType: string;
  domainHost: string;
  domainPath: string;
  snippet: string;
  productUrls: string[];
  existence: GgCleaningExistence;
  value: string;
  existenceReasonCn: string;
  matchedRule: string;
  evidenceSentence: string;
  confidenceBucket: "strong" | "weak" | "none";
};

type SideResult = {
  supported: GgCleaningExistence;
  reasonCn: string;
  value: string;
  url: string;
  urlHost: string;
  domainMatchType: string;
  urlSelectedFromProductUrls: boolean;
  snippet: string;
  matchedRule: string;
  evidenceSentence: string;
  confidenceBucket: "strong" | "weak" | "none";
};

type SideAccumulator = {
  bestRow: InputRow | null;
  firstValue: string;
  productUrlSet: Set<string>;
  yesRanks: Set<number>;
  noRanks: Set<number>;
};

type GroupAccumulator = {
  groupKey: string;
  termId: string;
  country: string;
  domain: string;
  termName: string;
  factType: string;
  domainHost: string;
  domainPath: string;
  countryCode: string;
  canonicalFactType: string;
  aimode: SideAccumulator;
  searchlab: SideAccumulator;
};

type DecisionRow = {
  groupKey: string;
  termId: string;
  country: string;
  domain: string;
  termName: string;
  factType: string;
  finalSupported: GgCleaningExistence;
  finalReasonCn: string;
  finalValue: string;
  finalUrl: string;
  finalUrlHost: string;
  finalDomainMatchType: string;
  finalUrlSelectedFromProductUrls: boolean;
  finalSnippet: string;
  finalMatchedRule: string;
  finalEvidenceSentence: string;
  finalConfidenceBucket: "strong" | "weak" | "none";
  aimodeSupported: GgCleaningExistence;
  aimodeReasonCn: string;
  aimodeValue: string;
  aimodeUrl: string;
  aimodeSnippet: string;
  aimodeMatchedRule: string;
  aimodeEvidenceSentence: string;
  aimodeConfidenceBucket: "strong" | "weak" | "none";
  searchlabSupported: GgCleaningExistence;
  searchlabReasonCn: string;
  searchlabValue: string;
  searchlabUrl: string;
  searchlabSnippet: string;
  searchlabMatchedRule: string;
  searchlabEvidenceSentence: string;
  searchlabConfidenceBucket: "strong" | "weak" | "none";
};

type MerchantRow = {
  term_id: string;
  country: string;
  domain: string;
  term_name: string;
  fact_type: string;
  supported: string;
  status: string;
  discount_type: string;
  discount_value: string;
  currency: string;
  discount_details: string;
  url: string;
};

type DebugRow = {
  group_key: string;
  term_id: string;
  country: string;
  domain: string;
  term_name: string;
  fact_type: string;
  final_supported: string;
  final_reason_cn: string;
  final_value: string;
  final_url: string;
  input_domain: string;
  final_url_host: string;
  domain_match_type: string;
  url_selected_from_product_urls: string;
  final_snippet: string;
  final_matched_rule: string;
  final_evidence_sentence: string;
  final_confidence_bucket: string;
  aimode_supported: string;
  aimode_reason_cn: string;
  aimode_value: string;
  aimode_url: string;
  aimode_snippet: string;
  aimode_matched_rule: string;
  aimode_evidence_sentence: string;
  aimode_confidence_bucket: string;
  searchlab_supported: string;
  searchlab_reason_cn: string;
  searchlab_value: string;
  searchlab_url: string;
  searchlab_snippet: string;
  searchlab_matched_rule: string;
  searchlab_evidence_sentence: string;
  searchlab_confidence_bucket: string;
};

export type GgCleaningExecutionResult = {
  preview: GgCleaningPreview;
  merchantRows: MerchantRow[];
  debugRows: DebugRow[];
  workbookBase64: string;
  summary: GgCleaningJobSummary;
};

export type GgCleaningEvalResult = {
  inputMode: GgCleaningInputMode;
  totalRows: number;
  groupedRows: number;
  debugRows: DebugRow[];
  summary: GgCleaningJobSummary;
};

export type GgCleaningFileInput = {
  fileName: string;
  fileBase64?: string;
  filePath?: string;
};

const MERCHANT_HEADERS: Array<keyof MerchantRow> = [
  "term_id",
  "country",
  "domain",
  "term_name",
  "fact_type",
  "supported",
  "status",
  "discount_type",
  "discount_value",
  "currency",
  "discount_details",
  "url",
];

const DEBUG_HEADERS: Array<keyof DebugRow> = [
  "group_key",
  "term_id",
  "country",
  "domain",
  "term_name",
  "fact_type",
  "final_supported",
  "final_reason_cn",
  "final_value",
  "final_url",
  "input_domain",
  "final_url_host",
  "domain_match_type",
  "url_selected_from_product_urls",
  "final_snippet",
  "final_matched_rule",
  "final_evidence_sentence",
  "final_confidence_bucket",
  "aimode_supported",
  "aimode_reason_cn",
  "aimode_value",
  "aimode_url",
  "aimode_snippet",
  "aimode_matched_rule",
  "aimode_evidence_sentence",
  "aimode_confidence_bucket",
  "searchlab_supported",
  "searchlab_reason_cn",
  "searchlab_value",
  "searchlab_url",
  "searchlab_snippet",
  "searchlab_matched_rule",
  "searchlab_evidence_sentence",
  "searchlab_confidence_bucket",
];

const FACT_TYPE_ALIASES: Array<[string, string]> = [
  ["blue light", "blue light card"],
  ["first responder", "first responder"],
  ["price guarantee", "price guarantee"],
  ["price guanrantee", "price guarantee"],
  ["price match", "price guarantee"],
  ["gift card", "gift card"],
  ["giftcard", "gift card"],
  ["existing customer", "existing customer"],
  ["new customer", "new customer"],
  ["newsletter", "newsletter/first order/sign up/"],
  ["first order", "newsletter/first order/sign up/"],
  ["sign up", "newsletter/first order/sign up/"],
  ["signup", "newsletter/first order/sign up/"],
  ["loyal", "loyalty program"],
  ["reward", "loyalty program"],
  ["member", "loyalty program"],
  ["return", "return"],
  ["refund", "return"],
  ["shipping", "shipping"],
  ["delivery", "shipping"],
  ["military", "military"],
  ["veteran", "military"],
  ["senior", "senior"],
  ["birthday", "birthday"],
  ["teacher", "teacher"],
  ["student", "student"],
  ["employee", "employee"],
  ["staff", "employee"],
  ["referral", "referral"],
  ["refer a friend", "referral"],
  ["app", "app"],
  ["clearance", "clearance"],
  ["sale", "clearance"],
  ["outlet", "clearance"],
  ["family", "family"],
  ["aaa", "aaa"],
  ["nhs", "nhs"],
  ["child", "child"],
  ["kid", "child"],
];

type FactRuleConfig = {
  positive: RegExp[];
  negative: RegExp[];
  ignore?: RegExp[];
  explicitTerms?: RegExp[];
};

type SentenceEvidence = {
  existence: GgCleaningExistence;
  reasonCn: string;
  matchedRule: string;
  evidenceSentence: string;
  confidenceBucket: "strong" | "weak" | "none";
  score: number;
};

type FactFallbackClues = {
  positive?: string[];
  negative?: string[];
};

const AFFIRMATIVE_PREFIX = /^(?:yes|yeah|ja|si|sí|tak|oui|네|예)\b/i;
const NEGATIVE_PREFIX = /^(?:no|nee|nein|nie|non|아니|없습니다|없다|없음)\b/i;
const LEAD_NEGATIVE_CUE_PATTERNS = [
  /^(?:no|nee|nein|non)\b/i,
  /^\bgeen\b/i,
  /^\bniet\b/i,
  /^\bgeen\s+(?:specifieke|vaste|publieke)\b/i,
  /^\b(?:biedt|offre|propose)\s+niet\b/i,
  /^\bop basis van\b.{0,35}\bgeen\b/i,
  /^\b(?:uit|op)\s+de beschikbare informatie\b.{0,40}\bgeen\b/i,
  /^\bil n['’]est pas\b/i,
  /^\bpas de\b/i,
];
const AFFIRMATIVE_PREFIX_DISQUALIFIER_PATTERNS = [
  /\bmaar\b/i,
  /\bbut\b/i,
  /\bhowever\b/i,
  /\bafhankelijk van\b/i,
  /\bhangt af van\b/i,
  /\bdepends on\b/i,
  /\bnot applicable\b/i,
  /\bniet van toepassing\b/i,
  /\bgeen fysieke (?:producten|verzending|levering)\b/i,
  /\bdigitale tickets?\b/i,
  /\balleen bij\b/i,
  /\bonly for\b/i,
  /\bonly when\b/i,
  /\b(?:individuele|individual)\s+(?:verkoper|seller)\b/i,
];

const GENERIC_NEGATIVE_PATTERNS = [
  /\b(?:no|not|does not|do not|cannot|can't)\b.{0,40}\b(?:evidence|information|mention|specific|direct|official)\b/i,
  /\b(?:there is no|there are no)\b.{0,40}\b(?:evidence|information|discount|program|offer)\b/i,
  /\b(?:there is|there are)(?: currently)?\b.{0,20}\bno\b.{0,20}\bindication\b.{0,20}\b(?:that|of)\b/i,
  /\bnot explicitly\b/i,
  /\bnot publicly\b/i,
  /\bnot currently\b/i,
  /\bno direct confirmation\b/i,
  /\bno direct indication\b/i,
  /\bno public information\b/i,
  /\bcannot confirm\b/i,
  /\b(?:official|brand|merchant|company)\b.{0,30}\b(?:website|site|store|faq|page)\b.{0,35}\bdoes not\b.{0,20}\b(?:list|mention|show|include|feature)\b/i,
  /\bkeine(?:n|m|)?\b.{0,40}\b(?:hinweise|informationen|rabatt|programm|preisgarantie|geschenkkarten|familienrabatt)\b/i,
  /\bkein(?:en|em|e)?\b.{0,40}\b(?:rabatt|programm|angebot|preisgarantie)\b/i,
  /\bnicht\b.{0,25}\b(?:verfugbar|verfuegbar|bestatigt|bestätigt|explizit|direkt)\b/i,
  /\bbrak\b.{0,30}\b(?:informacji|potwierdzenia|danych)\b/i,
  /\bnie\b.{0,35}(?:ma|mozna potwierdzic|można potwierdzić|mo[żz]na potwierdzi[ćc]|wymienia|promuje|oferuje|potwierdzają|potwierdzajacych|potwierdzających)/i,
  /\bno hay\b.{0,35}\b(?:informacion|información|evidencia|confirmacion|confirmación)\b/i,
  /\bno se\b.{0,35}\b(?:menciona|encontraron resultados|confirma)\b/i,
  /\b공식적으로\b.{0,20}\b(?:없|않)\S*/i,
  /\b제공하지 않\S*/i,
  /\b운영하고 있지 않\S*/i,
  /\b찾을 수 없\S*/i,
];

const GENERIC_AMBIGUOUS_PATTERNS = [
  /\brecommend(?:ed)? to contact\b/i,
  /\bit is recommended\b/i,
  /\bse recomienda\b/i,
  /\bzalecamy\b/i,
  /\bwird empfohlen\b/i,
  /\bcontact(?: the)? customer service\b/i,
  /\bcheck the official website\b/i,
  /\bpromotions may vary\b/i,
  /\bai answers can contain errors\b/i,
  /\bai 回答可能包含错误\b/i,
  /\bai 답변에 오류가 있을 수 있습니다\b/i,
];

const GENERIC_BENEFIT_PATTERNS = [
  /\bdiscount\b/i,
  /\boffer\b/i,
  /\bbenefit\b/i,
  /\bprogram\b/i,
  /\bcoupon\b/i,
  /\bcode\b/i,
  /\bvoucher\b/i,
  /\breward\b/i,
  /\bpoints?\b/i,
  /\bcashback\b/i,
  /\brabatt\b/i,
  /\bangebot\b/i,
  /\brabat\b/i,
  /\bzniżk\w*\b/i,
  /优惠/,
  /折扣/,
  /할인/,
  /혜택/,
];

const RETURN_COST_AMBIGUOUS_PATTERNS = [
  /\bdoes not explicitly state\b.{0,30}\breturn shipping\b.{0,20}\b(?:is )?free\b/i,
  /\bnot (?:confirm|state|clear)\b.{0,30}\bwhether\b.{0,20}\b(?:returns?|return shipping)\b.{0,20}\b(?:are|is)\b.{0,20}\bfree\b/i,
  /\bwyszukiwanie nie potwierdzi[łl]o wprost\b.{0,35}\bzwroty\b.{0,20}\b(?:s[aą])\b.{0,20}\bcałkowicie darmowe\b/i,
  /\bfree returns?\b.{0,25}\b(?:depends on|vary by)\b.{0,20}\b(?:seller|listing)\b/i,
];

const STRICT_FACT_TYPES_FOR_GENERIC_BENEFIT = new Set([
  "app",
  "employee",
  "first responder",
  "child",
  "birthday",
  "military",
  "teacher",
  "blue light card",
  "family",
  "gift card",
  "price guarantee",
]);

const FACT_FALLBACK_CLUES: Record<string, FactFallbackClues> = {
  app: {
    negative: ["app-based discount", "app exclusive discount", "app-specific discount", "no app"],
  },
  military: {
    positive: ["znizki dla zolnierzy", "znizki dla sluzb mundurowych", "military discount", "veteran discount"],
    negative: ["kein militärrabatt", "keinen militarrabatt", "no military discount", "nie ma znizek dla wojska"],
  },
  "first responder": {
    positive: ["blue light card", "key worker discount", "znizki dla sluzb ratunkowych", "first responder discount", "karta mundurowa"],
    negative: ["no first responder discount", "keinen ersthelfer rabatt", "nie oferuje dedykowanej znizki dla sluzb ratunkowych", "not officially specified for first responders"],
  },
  employee: {
    positive: ["mitarbeiterrabatt", "mitarbeitervorteile", "benefity dla pracownikow", "staff discount", "employee discount", "员工折扣", "员工福利"],
    negative: ["no employee discount", "keinen mitarbeiterrabatt", "brak znizek pracowniczych", "没有公开证据表明", "不提及员工折扣", "no publicly available evidence confirming", "do not explicitly feature a standard employee discount"],
  },
  "existing customer": {
    positive: [
      "existing customers receive",
      "repeat customer benefits",
      "annual pass",
      "beneficio por pertenecer",
      "alumnos de su escuela",
      "many magna returns",
      "clients existants",
      "clients fideles",
      "clients fidèles",
      "clients deja",
      "clients déjà",
      "offres pour les clients existants",
      "avantages pour clients fideles",
      "avantages pour clients fidèles",
    ],
    negative: [
      "no public information",
      "no permanent loyalty program",
      "no existing customer discount",
      "pas de reduction specifique pour les clients existants",
      "pas de réduction spécifique pour les clients existants",
      "pas d avantage specifique pour les clients fideles",
      "pas d'avantage spécifique pour les clients fidèles",
    ],
  },
  "loyalty program": {
    positive: [
      "treueprogramm",
      "program lojalnosciowy",
      "programa de fidelizacion",
      "membership program",
      "rewards program",
      "wilson club",
      "programme de fidelite",
      "programme de fidélité",
      "club avantages",
      "cumuler des points",
      "cumulez des points",
      "gagner des miles",
      "programme suma",
    ],
    negative: [
      "no loyalty program",
      "does not offer a traditional points-based loyalty program",
      "nie prowadzi typowego programu lojalnosciowego",
      "primarily promotional discounts on social media",
      "rather than a real loyalty program",
      "il n existe pas de programme de fidelite classique",
      "il n'existe pas de programme de fidélité classique",
      "pas de programme de points classique",
      "pas de programme de fidélité classique",
    ],
  },
  "newsletter/first order/sign up/": {
    positive: [
      "newsletter-rabatt",
      "newsletter rabatt",
      "zapis do newslettera",
      "newsletter signup",
      "sign up for the newsletter",
      "pierwsze zakupy",
      "first order discount",
      "welcome coupon",
      "newsletter",
      "nieuwsbrief",
      "inschrijving",
      "nieuwsbrief korting",
      "inschrijven voor de nieuwsbrief",
      "welkomstkorting",
      "offre de bienvenue",
      "inscription newsletter",
      "premiere commande",
    ],
    negative: [
      "no newsletter discount",
      "no sign up discount",
      "no first order discount",
      "geen nieuwsbriefkorting",
      "geen korting bij inschrijving",
      "pas de reduction newsletter",
      "pas d offre de bienvenue",
    ],
  },
  "new customer": {
    positive: [
      "new customer discount",
      "nuevo cliente",
      "new customer offer",
      "welcome benefit",
      "신규 회원 혜택",
      "웰컴 쿠폰",
      "nouveaux clients",
      "reduction de bienvenue",
      "réduction de bienvenue",
      "premiere commande",
      "première commande",
    ],
    negative: ["no new customer discount", "keinen neukundenrabatt", "pas de reduction nouveau client", "pas de réduction nouveau client"],
  },
  child: {
    positive: ["productos infantiles", "descuentos en productos infantiles", "care for babies", "baby products", "kinderrabatt", "kids ticket"],
    negative: ["no child discount", "keinen kinderrabatt"],
  },
  birthday: {
    positive: ["birthday coupon", "birthday discount", "geburtstagsrabatt", "descuento de cumpleaños", "생일 쿠폰"],
    negative: ["no birthday discount", "keinen geburtstagsrabatt"],
  },
  family: {
    positive: ["family ticket", "family pass", "familienrabatt", "bilet rodzinny"],
    negative: ["no family discount", "keinen familienrabatt", "keine speziellen familienrabatte", "keine spezielle familienrabatte"],
  },
  "price guarantee": {
    positive: ["price match", "price guarantee", "refund the difference", "preisgarantie", "gwarancja ceny"],
    negative: ["no price guarantee", "keine allgemeine preisgarantie"],
  },
  referral: {
    positive: [
      "refer a friend",
      "friend referral",
      "programa de patrocinio",
      "polec znajomemu",
      "친구 추천",
      "programme de parrainage",
      "parrainez un ami",
      "parrainer des proches",
      "credit d achat",
      "crédit d'achat",
    ],
    negative: ["no referral program", "keine freunde werben", "no formal friend referral", "pas de programme de parrainage", "pas de reduction de parrainage"],
  },
};

const FACT_RULES: Record<string, FactRuleConfig> = {
  app: {
    explicitTerms: [/\bapp\b/i, /\bmobile app\b/i, /\bapplication\b/i, /\baplicaci[oó]n\b/i, /\b앱\b/i],
    positive: [
      /\bapp(?:-only|-exclusive)?\b.{0,30}\b(?:discounts?|offers?|codes?|benefits?|exclusive|tickets?|perks?|coupons?|vouchers?)\b/i,
      /\bapp\b.{0,30}\b(?:exclusieve|specifieke)\b.{0,20}\b(?:kortingen|voordelen|aanbiedingen)\b/i,
      /\b(?:discounts?|offers?|benefits?|coupons?|exclusive|vouchers?)\b.{0,30}\b(?:in|via|through)\b.{0,12}\b(?:the )?app\b/i,
      /\b(?:download|using|book(?:ing)?|order(?:ing)?)\b.{0,18}\b(?:the )?app\b.{0,24}\b(?:unlock|get|receive|save|discounts?|vouchers?|benefits?|offers?)\b/i,
      /\bofficial mobile app\b.{0,40}\b(?:exclusive vouchers?|partner offers?|early access|benefits?)\b/i,
      /\bby downloading\b.{0,25}\b(?:the )?app\b.{0,35}\b(?:access|unlock|get)\b.{0,20}\b(?:exclusive vouchers?|partner offers?|early access|benefits?)\b/i,
      /\bapp-?specific discounts?\b.{0,20}\b(?:and|&)\b.{0,20}\bbenefits?\b/i,
      /\bapp users?\b.{0,30}\b(?:first|early)\b.{0,20}\b(?:access|invited)\b/i,
      /\bapplication mobile\b.{0,45}\b(?:offres?|avantages?|r[ée]ductions?|codes promos?|bons?|exclusifs?)\b/i,
      /\b(?:offres?|avantages?|r[ée]ductions?|codes promos?|bons?|exclusifs?)\b.{0,45}\b(?:via|sur)\b.{0,12}\bl['’]application\b/i,
      /\bgr[aâ]ce [àa]\b.{0,15}\bl['’]application\b.{0,35}\b(?:profiter|obtenir|acc[ée]der)\b.{0,20}\b(?:d['’])?(?:offres?|avantages?|r[ée]ductions?)\b/i,
      /\b앱\b.{0,18}\b(?:전용|한정|전용 혜택|할인|쿠폰)\b/i,
    ],
    negative: [
      /\bno\b.{0,20}\bapp(?:-specific|-based|-exclusive)?\b.{0,20}\b(?:discounts?|offers?|benefits?)\b/i,
      /\bgeen\b.{0,30}\bspecifieke\b.{0,20}\bkortingen\b.{0,20}\bvia\b.{0,12}\b(?:een )?app\b/i,
      /\bblijkt niet\b.{0,35}\bapp\b.{0,20}\b(?:specifieke|exclusieve)\b.{0,20}\bkortingen\b/i,
      /\bde app\b.{0,35}\b(?:biedt|heeft)\b.{0,20}\bgeen\b.{0,20}\b(?:specifieke|exclusieve|unieke)\b.{0,20}\b(?:kortingen|voordelen)\b/i,
      /\bniet expliciet bevestigd\b.{0,40}\bapp\b.{0,20}\b(?:unieke|exclusieve|specifieke)\b.{0,20}\b(?:kortingen|voordelen)\b/i,
      /\bgeen\b.{0,35}\b(?:app-specifieke|exclusieve|unieke)\b.{0,20}\b(?:kortingen|voordelen|aanbiedingen)\b/i,
      /\bthere is no\b.{0,25}\b(?:specific|dedicated|exclusive|permanent|confirmed)\b.{0,20}\bapp\b.{0,20}\b(?:discount|offer|benefit|voucher)\b/i,
      /\b(?:does not|doesn'?t)\b.{0,25}\b(?:offer|have|provide|mention|list)\b.{0,20}\b(?:a )?(?:specific|dedicated|exclusive|shopping|discount)\b.{0,20}\bapp\b/i,
      /\bdoes not\b.{0,24}\b(?:have|offer|provide)\b.{0,24}\b(?:its own|a dedicated|a standalone|a mobile)?\b.{0,20}\bapp\b/i,
      /\bno\b.{0,20}\b(?:dedicated|standalone|own|mobile)\b.{0,20}\bapp\b/i,
      /\bkeine?\b.{0,20}\b(?:spezifische|eigene|dedizierte)\b.{0,20}\bapp\b.{0,25}\b(?:mit|für)\b.{0,20}\b(?:rabatt\w*|angebot\w*|aktion\w*|gutschein\w*)\b/i,
      /\bkeine?\b.{0,25}\b(?:spezifische|eigene|dedizierte)\b.{0,20}\bapp\b.{0,35}\b(?:erw[aä]hnt|genannt)\b/i,
      /\bni\b.{0,10}cuenta con\b.{0,25}\b(?:una )?(?:aplicaci[oó]n|app)\b.{0,20}\b(?:propia|m[oó]vil)\b/i,
      /\bne propose pas\b.{0,35}\b(?:de )?r[ée]duction\b.{0,25}\bsp[ée]cifique\b.{0,20}\bvia\b.{0,12}\bl['’]application\b/i,
      /\bpas d['’]avantages?\b.{0,25}\bexclusifs?\b.{0,20}\bvia\b.{0,12}\bl['’]application\b/i,
      /\bne dispose pas d['’]une application mobile d[ée]di[ée]e\b/i,
      /\baucune?\b.{0,35}\bapplication mobile\b.{0,20}\b(?:propre|d[ée]di[ée]e)\b/i,
      /\bil n['’]est pas fait mention d['’]une application mobile sp[ée]cifique\b/i,
      /\bne confirment pas l['’]existence d['’]une application d[ée]di[ée]e\b/i,
      /\baucune application mobile sp[ée]cifique n['’]est mentionn[ée]e\b/i,
      /\bil n['’]existe pas d['’]application mobile sp[ée]cifique\b/i,
      /\bne mentionne pas\b.{0,35}\bd['’]application mobile d[ée]di[ée]e\b/i,
      /\bne semble pas proposer\b.{0,35}\bd['’]application mobile d[ée]di[ée]e\b/i,
      /\bpas d['’]application mentionn[ée]e\b/i,
      /\bil n['’]est pas mentionn[ée] que\b.{0,35}\bpropose\b.{0,20}\bune application mobile d[ée]di[ée]e\b/i,
      /\bne met pas en avant\b.{0,35}\bune application mobile d[ée]di[ée]e\b/i,
      /\bil n['’]y a pas d['’]indication claire concernant une application d[ée]di[ée]e\b/i,
      /\baucune application mobile sp[ée]cifique proposant des r[ée]ductions\b/i,
      /\bne propose pas d['’]application mobile d[ée]di[ée]e offrant des r[ée]ductions sp[ée]cifiques\b/i,
      /\bapplication mobile sp[ée]cifique\b.{0,35}\bn['’]est pas mentionn[ée]e\b/i,
      /\bno cuenta con\b.{0,35}\b(?:una )?(?:aplicaci[oó]n|app)\b.{0,35}\b(?:propia|m[oó]vil)\b.{0,35}\bni\b.{0,20}\bdescuentos?\b.{0,20}\bexclusivos?\b.{0,10}\bpor app\b/i,
      /\b(?:no ofrece|no hay)\b.{0,25}\b(?:descuentos?|beneficios?)\b.{0,20}\b(?:por|en|mediante)\b.{0,15}\b(?:app|aplicaci[oó]n)\b/i,
      /\bkeine?\b.{0,20}\bapp\b.{0,20}\b(?:rabatt|angebot|aktion)\b/i,
      /\bno tiene\b.{0,20}\baplicaci[oó]n\b.{0,20}\b(?:con descuento|propia)\b/i,
      /\b(?:nie oferuje|nie ma)\b.{0,25}\b(?:typowych |dedykowanych )?(?:zniżek|rabat\w*|korzyści)\b.{0,20}\b(?:w|przez)\b.{0,12}\baplikacj\w*\b/i,
      /\bbezpłatn\w*\b.{0,20}\baplikacj\w*\b.{0,35}\bnie\b.{0,20}\boferuje\b.{0,20}\b(?:zniżek|rabat\w*|korzyści)\b/i,
      /不会专门为.{0,20}(?:下载其)?应用程序提供持续的折扣/,
      /并不是针对[“"]?App 用户[”"]?独享/,
      /\b앱\b.{0,18}\b(?:전용|특정)\b.{0,12}\b(?:할인|혜택)\b.{0,8}\b없\S*/i,
    ],
    ignore: [
      /\bdepending on which\b/i,
      /\btypically refers to several different entities\b/i,
      /\bif you mean\b/i,
      /\bto give you the most accurate answer\b/i,
      /\bcould you specify\b/i,
      /\bseveral different entities\b/i,
    ],
  },
  shipping: {
    positive: [
      /\bfree (?:standard )?(?:shipping|delivery)\b/i,
      /\b(?:shipping|delivery) is free\b/i,
      /\blivraison standard gratuite\b/i,
      /\bexp[eé]dition standard gratuite\b/i,
      /\bkostenloser versand\b/i,
      /\bversandkostenfrei\b/i,
      /\bgratis (?:verzending|bezorging|levering)\b/i,
      /\b(?:gratis|kosteloos) (?:bezorgd|geleverd)\b/i,
      /\blivraison gratuite\b/i,
      /\blivraison offerte\b/i,
      /\bfrais de port offerts?\b/i,
      /\benv[ií]o gratis\b/i,
      /\bdarmowa dostawa\b/i,
      /\b무료 배송\b/i,
    ],
    negative: [
      /\bno free (?:shipping|delivery)\b/i,
      /\bdoes not offer free (?:shipping|delivery)\b/i,
      /\bkeinen? kostenlosen versand\b/i,
      /\bgeen gratis (?:verzending|bezorging|levering)\b/i,
      /\bniet van toepassing\b.{0,30}\b(?:verzend|bezorg|lever)\w*\b/i,
      /\bgeen sprake van\b.{0,25}\bverzendkosten\b/i,
      /\bdigitale diensten?\b.{0,35}\b(?:gratis )?(?:verzending|bezorging|levering)\b.{0,25}\bniet van toepassing\b/i,
      /\bcursussen?\b.{0,35}\b(?:gratis )?(?:verzending|bezorging|levering)\b.{0,25}\bniet van toepassing\b/i,
      /\b(?:gratis )?(?:verzending|bezorging|levering)\b.{0,35}\bniet van toepassing\b.{0,25}\bfysieke producten\b/i,
      /\bpas de livraison gratuite\b/i,
      /\bne propose pas de livraison gratuite\b/i,
      /\bne propose généralement pas de livraison gratuite\b/i,
      /\bil s'?agit d'?un prestataire de services\b/i,
      /\bno ofrece env[ií]o gratis\b/i,
      /\bnie oferuje darmowej dostawy\b/i,
      /\b무료 배송\S* 없\S*/i,
    ],
  },
  "gift card": {
    explicitTerms: [
      /\bgift card\b/i,
      /\bgift voucher\b/i,
      /\be-?gift\b/i,
      /\bgeschenkkarte[n]?\b/i,
      /\btarjeta(?:s)? de regalo\b/i,
      /\bch[èe]ques? cadeaux?\b/i,
      /\bch[èe]ques?-cadeaux?\b/i,
      /\bbon(?: cadeau)?\b/i,
      /\bkarta podarunkowa\b/i,
      /\b기프트 카드\b/i,
    ],
    positive: [
      /\b(?:gift card|gift voucher|e-?gift|geschenkkarte[n]?|tarjeta(?:s)? de regalo|karta podarunkowa|기프트 카드)\b.{0,60}\b(?:available|offered|redeem|email|digital|physical|purchase|buy|valid)\b/i,
      /\b(?:cartes? cadeaux?|bons? cadeaux?)\b.{0,45}\b(?:disponibles?|propos[ée]s?|achet(?:er|ables?)|envoy(?:[ée]e?s?)|utilisables?)\b/i,
      /\bch[èe]ques? cadeaux?\b.{0,45}\b(?:disponibles?|valables?|envoy(?:[ée]e?s?)|utilisables?)\b/i,
      /\bch[èe]ques?-cadeaux?\b.{0,45}\b(?:disponibles?|valables?|envoy(?:[ée]e?s?)|utilisables?)\b/i,
      /\be-?cartes? cadeaux?\b.{0,35}\b(?:disponibles?|envoy(?:[ée]e?s?) par email|achet(?:er|ables?))\b/i,
      /\b(?:digitale )?cadeaubonnen?\b.{0,40}\b(?:aan|beschikbaar|per e-?mail|inwisselbaar)\b/i,
      /\b(?:available|offered|redeemable|delivered)\b.{0,45}\b(?:gift card|gift voucher|geschenkkarte[n]?|tarjeta(?:s)? de regalo|karta podarunkowa|기프트 카드)\b/i,
      /\bgeschenkgutscheine?\b.{0,35}\b(?:per e-?mail|sofort|einl[oö]sbar|erh[aä]ltlich)\b/i,
      /\bgift cards?\b.{0,35}\b(?:used both online and in (?:their )?physical stores?|digital and physical)\b/i,
      /\boffers gift cards that can be used both online\b.{0,25}\band\b.{0,25}\b(?:their )?physical\b/i,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:gift card|gift voucher|geschenkkarte[n]?|tarjetas? de regalo|karta podarunkowa|기프트 카드)\b/i,
      /\bne propose pas\b.{0,35}\b(?:de )?(?:cartes?|bons?) cadeaux?\b/i,
      /\bpas de\b.{0,25}\b(?:cartes?|bons?) cadeaux?\b.{0,20}\b(?:officiels?|classiques?)\b/i,
      /\bil ne semble pas\b.{0,25}\bque\b.{0,30}\b(?:des )?(?:cartes?|bons?) cadeaux?\b/i,
      /\bgeen\b.{0,30}\b(?:eigen )?cadeaubonnen?\b/i,
      /\bgeen cadeaukaartproducten\b/i,
      /\bkeine?\b.{0,35}\b(?:geschenkkarten|gift cards?)\b/i,
      /\bkeine?\b.{0,25}\beigenen?\b.{0,20}\bgeschenkkarten?\b/i,
      /\bkeine?\b.{0,25}\bgeschenkkarten?\b.{0,20}\bim angebot\b/i,
      /\bnie\b.{0,35}\b(?:karta podarunkowa|kart podarunkowych)\b/i,
      /\b(?:instead of|rather than)\b.{0,20}\b(?:classic )?(?:gift cards?|geschenkkarten)\b/i,
      /\b(?:coupon|voucher|newsletter discount|discount campaign)\b.{0,35}\b(?:instead of|rather than)\b.{0,20}\b(?:gift cards?|geschenkkarten)\b/i,
      /\bkeine spezifische funktion\b.{0,25}\bgeschenkkarten\b/i,
      /\bnot a classic(?:al)? gift card\b/i,
      /\bprim[aä]r\b.{0,25}\bals rabattcodes?\b.{0,20}\bund nicht\b.{0,20}\bals klassische\b.{0,20}\bgeschenkkarte\b/i,
      /\brabattcodes?\/gutscheine?\b.{0,25}\bf[uü]r den eigenen einkauf\b/i,
    ],
  },
  military: {
    explicitTerms: [/\bmilitary\b/i, /\bveteran(?:s)?\b/i, /\barmed services\b/i, /\bmilit[aä]r\b/i, /\bbundeswehr\b/i, /\bstreitkr[aä]fte\b/i, /\bsoldat\w*\b/i, /\bżołnierz\w*\b/i, /\bwojsk\w*\b/i, /\b군인\b/i, /\b국군\b/i, /退伍军人/, /现役军人/, /军人/, /军事/],
    positive: [
      /\b(?:military|veteran(?:s)?|armed services|milit[aä]r|żołnierz\w*|wojsk\w*|군인|국군)\b.{0,45}\b(?:discount|offer|benefit|program|code|rabat|zniżk|할인|혜택)\b/i,
      /\b(?:discount|offer|benefit|program|code|rabat|zniżk|할인|혜택)\b.{0,45}\b(?:military|veteran(?:s)?|armed services|żołnierz\w*|wojsk\w*|군인)\b/i,
      /\b(?:militaires?|anciens combattants?|forces arm[ée]es)\b.{0,40}\b(?:r[ée]duction|offre|avantage|tarif|code promo)\b/i,
      /\b(?:r[ée]duction|offre|avantage|tarif|code promo)\b.{0,40}\b(?:pour )?(?:les )?(?:militaires?|anciens combattants?|forces arm[ée]es)\b/i,
      /\bsłużb mundurowych\b.{0,35}\b(?:zniżk|rabat)\b/i,
      /\b(?:za okazaniem legitymacji|legitymacji służbowych?)\b.{0,35}\b(?:zniżk|rabat)\b/i,
      /(?:退伍军人|现役军人|军人).{0,24}(?:折扣|优惠|专属优惠|福利)/,
      /(?:折扣|优惠|专属优惠|福利).{0,24}(?:退伍军人|现役军人|军人)/,
    ],
    negative: [
      /\bgeen\b.{0,35}\b(?:specifieke|structurele|vaste)?\b.{0,20}\bkorting\b.{0,20}\bvoor\b.{0,20}\bmilitair\w*\b/i,
      /\bgeen speciale regeling\b.{0,35}\b(?:voor )?defensiepersoneel\b/i,
      /\bdoes not offer an official military discount directly through (?:their|its) website\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux militaires\b/i,
      /\bil n['’]existe pas de r[ée]duction sp[ée]cifique mentionn[ée]e pour les militaires\b/i,
      /\bpas de r[ée]duction\b.{0,25}\bsp[ée]cifique\b.{0,20}\b(?:pour )?(?:les )?militaires\b/i,
      /\bdoes not provide a specific military code\b/i,
      /\bdoes not\b.{0,20}\b(?:offer|provide)\b.{0,25}\b(?:official|specific|dedicated)?\b.{0,20}\bmilitary\b.{0,20}\b(?:discount|code)\b/i,
      /\bno\b.{0,30}\b(?:official|specific|special|dedicated)?\b.{0,20}\bmilitary\b.{0,15}\bdiscount\b/i,
      /\bkein(?:e|en|em|er)?\b.{0,30}\b(?:milit[aä]rrabatt|rabatt(?:e)? fur soldaten|rabatt(?:e)? für soldaten|rabatt(?:e)? für angeh[oö]rige der streitkr[aä]fte|rabatt(?:e)? für bundeswehrangeh[oö]rige|rabatt(?:e)? für milit[aä]rpersonal)\b/i,
      /\bkeine?\b.{0,35}\b(?:[oö]ffentlichen informationen|hinweise)\b.{0,35}\b(?:bundeswehrangeh[oö]rige|milit[aä]rpersonal|milit[aä]rrabatt)\b/i,
      /\bnie\b.{0,30}\b(?:zniżk|rabat)\b.{0,20}\b(?:dla wojska|dla żołnierzy|wojsk\w*)\b/i,
      /\bnie wymienia wprost\b.{0,30}\b(?:żołnierz\w*|wojsk\w*)\b/i,
      /\bindirect savings?\b.{0,25}\bthird-?party\b/i,
      /\bif you are looking for military discounts on similar products\b/i,
      /没有独立的军事验证系统/,
      /没有公开信息表明.{0,40}(?:退伍军人|现役军人|军人|军事).{0,20}(?:折扣|优惠)/,
      /(?:退伍军人|现役军人|军人).{0,20}(?:折扣|优惠).{0,20}(?:无|没有|未提供|并未提供)/,
      /不提供专门针对军事人员的常设折扣/,
      /(?:军事绿|Military Green).{0,20}(?:色号|颜色名|产品颜色|无关)/,
      /产品色号.{0,20}(?:与军事优惠政策无关|并非优惠)/,
      /通过其 Blue Light Card.{0,20}合作伙伴计划/,
      /\b군인\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b없\S*/i,
    ],
    ignore: [/\bgovernment contracts?\b/i, /\bmilitary green\b/i],
  },
  "first responder": {
    explicitTerms: [/\bfirst responder(?:s)?\b/i, /\bersthelfer\b/i, /\bkey worker(?:s)?\b/i, /\bblue light\b/i, /\bratownik\w*\b/i, /\bsłużb\w*\s+ratunkow\w*\b/i, /\bsłużb\w*\s+mundurow\w*\b/i, /\bpersonal de emergencia\b/i, /\bemergency personnel\b/i, /\bstra[żz] po[żz]arna\b/i, /\b119\b/i, /\b응급 구조\b/i, /\b소방관\b/i, /\b급 구조대원\b/i, /\b急救人员\b/i],
    positive: [
      /\b(?:first responder(?:s)?|key worker(?:s)?|blue light(?: card)?|ersthelfer|ratownik\w*|stra[żz] po[żz]arna|응급 구조|소방관)\b.{0,45}\b(?:discounts?|offers?|benefits?|programs?|cards?|codes?|rabat\w*|zniżk\w*|할인|혜택)\b/i,
      /\b(?:discounts?|offers?|benefits?|programs?|codes?|rabat\w*|zniżk\w*|할인|혜택)\b.{0,45}\b(?:first responder(?:s)?|key worker(?:s)?|blue light(?: card)?|ersthelfer|ratownik\w*|응급 구조|소방관)\b/i,
      /\bkarta mundurowa\b.{0,35}\b(?:ratownik\w*|stra[żz] po[żz]arna|policji)\b/i,
      /\bulg[ai]\b.{0,30}\b(?:dla służb mundurowych|dla ratowników|dla policji|dla straży)\b/i,
    ],
    negative: [
      /没有公开信息表明.{0,40}(?:急救人员|first responders?|blue light card).{0,20}(?:折扣|优惠)/,
      /不直接.{0,20}(?:急救人员|first responders?).{0,20}(?:折扣|优惠)/,
      /没有直接的急救人员折扣/,
      /常设急救人员优惠名单中/,
      /第三方平台.{0,30}(?:NHS|Health Service Discounts|Blue Light Card).{0,20}(?:优惠|折扣)/,
      /\bthere is no evidence\b.{0,40}\b(?:specific|standing|year-round|dedicated)\b.{0,20}\b(?:discount|offer|program)\b.{0,20}\bfor\b.{0,20}\bfirst responders?\b/i,
      /\bcurrently does not offer\b.{0,40}\b(?:a )?(?:specific|standing|year-round|dedicated)\b.{0,20}\b(?:discount|offer|program)\b.{0,20}\bfor\b.{0,20}\bfirst responders?\b/i,
      /\bnot on the regular first responder discount list\b/i,
      /\bno\b.{0,20}\b(?:confirmed|specific|standing|dedicated)\b.{0,20}\bfirst responder(?:s)?\b.{0,20}\bdiscount\b/i,
      /\bno\b.{0,35}\bexplicit\b.{0,20}\bdiscounts?\b.{0,20}\b(?:for|specifically for)\b.{0,20}\bfirst responders?\b/i,
      /\brelies on third-?party platform codes\b/i,
      /\bdoes not\b.{0,20}\b(?:directly|officially)?\b.{0,20}\b(?:offer|provide|list)\b.{0,20}\b(?:a )?(?:fixed |official |dedicated |specific )?(?:first responder|key worker)\b.{0,15}\b(?:discounts?|offers?)\b/i,
      /\bno\b.{0,35}\b(?:fixed|official|dedicated|specific|consumer(?:-type)?)\b.{0,20}\bfirst responder(?:s)?\b.{0,15}\b(?:discounts?|offers?)\b/i,
      /\bkeine?\b.{0,35}\b(?:ersthelfer|first responder)\b.{0,20}\b(?:rabatt\w*|angebot\w*)\b/i,
      /\bkeine?\b.{0,25}\bspezifischen?\b.{0,20}\b(?:rabatte?|angebote?)\b.{0,20}\b(?:für|fur)\b.{0,20}\b(?:ersthelfer|first responder)\b/i,
      /\bkeine?\b.{0,25}\bexpliziten?\b.{0,20}\b(?:rabatte?|angebote?)\b.{0,20}\bspeziell\b.{0,20}\bfür\b.{0,20}\b(?:ersthelfer|first responder)\b/i,
      /\bno se confirma\b.{0,35}\bdescuento\b.{0,20}\b(?:espec[ií]fico|permanente)\b.{0,25}\b(?:para|del)\b.{0,20}\bpersonal de emergencia\b/i,
      /\bno hay indicios de que\b.{0,35}\bofrezca\b.{0,30}\bdescuento\b.{0,20}\b(?:espec[ií]fico|permanente)\b.{0,25}\b(?:para|del)\b.{0,20}\bpersonal de emergencia\b/i,
      /\bnie\b.{0,35}\b(?:zniżk|rabat)\b.{0,20}\b(?:dla służb ratunkowych|dla ratowników)\b/i,
      /\bbrak\b.{0,30}\b(?:danych|informacji)\b.{0,25}\bpotwierdzaj\w*\b.{0,25}\b(?:zniżk\w*|rabat\w*)\b.{0,20}\b(?:dla służb ratunkowych|dla służb mundurowych|dla ratowników)\b/i,
      /\bnie oferuje dedykowanej zniżki\b.{0,25}\b(?:dla służb ratunkowych|dla ratowników)\b/i,
      /\bnie oferuje\b.{0,25}\b(?:zniżek|rabat\w*)\b.{0,20}\bdedykowanych prywatnie\b.{0,30}\b(?:dla pracowników służb ratunkowych|dla służb ratunkowych|dla ratowników)\b/i,
      /\bzniżki?\b.{0,35}\bdotyczą tylko\b.{0,35}\b(?:czynności służbowych|pełnienia obowiązków)\b/i,
      /\brather than\b.{0,30}\b(?:a )?(?:consumer|private|dedicated)\b.{0,20}\bfirst responder\b.{0,20}\bdiscount\b.{0,10}\bprogram\b/i,
      /\b회원제 혜택\S*\b.{0,20}\b(?:일반 구조대원|119 인력)\b.{0,15}\b적용되지 않\S*/i,
      /\b공식적으로 명시되어 있지 않\S*/i,
      /\b응급 구조\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b없\S*/i,
    ],
    ignore: [/\bpublic safety\b/i, /\blaw enforcement agencies\b/i, /\bgovernment contracts?\b/i],
  },
  employee: {
    explicitTerms: [/\bemployee(?:s)?\b/i, /\bstaff\b/i, /\bmitarbeiter\w*\b/i, /\bpracownik\w*\b/i, /\bempleado\w*\b/i, /员工/, /职员/, /\bstaff members?\b/i, /\bpersoneelskorting\w*\b/i, /\bmedewerker\w*\b/i],
    positive: [
      /\b(?:employee(?:s)?|staff|mitarbeiter\w*|mitarbeitende\w*|pracownik\w*|empleado\w*)\b.{0,40}\b(?:discounts?|benefits?|perks?|programs?|offers?|rabat\w*|zniżk\w*|할인|혜택)\b/i,
      /\b(?:employ[ée]s?|salari[ée]s?|personnel)\b.{0,40}\b(?:r[ée]ductions?|avantages?|offres?|remises?)\b/i,
      /\b(?:r[ée]ductions?|avantages?|offres?|remises?)\b.{0,40}\b(?:pour )?(?:les )?(?:employ[ée]s?|salari[ée]s?|personnel)\b/i,
      /\b(?:discounts?|benefits?|perks?|programs?|offers?|rabat\w*|zniżk\w*|할인|혜택)\b.{0,40}\b(?:employee(?:s)?|staff|mitarbeiter\w*|mitarbeitende\w*|pracownik\w*|empleado\w*)\b/i,
      /\bmitarbeiterrabatt\b/i,
      /\bmitarbeit\w*\b.{0,30}\b(?:verg[uü]nstigungen|preisnachl[aä]sse|vorteile|benefits?)\b/i,
      /\b(?:verg[uü]nstigungen|preisnachl[aä]sse|vorteile|benefits?)\b.{0,30}\bmitarbeit\w*\b/i,
      /员工.{0,24}(?:折扣|优惠|福利|待遇)/,
      /(?:折扣|优惠|福利|待遇).{0,24}员工/,
      /임직원 할인/,
      /\bstaff discount\b/i,
      /\bemployee discounts?\b/i,
    ],
    negative: [
      /\bgeen\b.{0,35}\b(?:publieke informatie|publiek beschikbare informatie)\b.{0,30}\b(?:over )?(?:specifieke )?personeelskortingen\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux employ[ée]s\b/i,
      /\bpas d['’]avantage\b.{0,25}\br[ée]serv[ée]?\b.{0,20}\baux employ[ée]s\b/i,
      /\baucune?\b.{0,35}\br[ée]duction\b.{0,20}\bpour\b.{0,20}\bles? employ[ée]s\b/i,
      /\bniet publiekelijk gedetailleerd beschikbaar\b.{0,35}\b(?:personeelskortingen|medewerkerskortingen)\b/i,
      /\bdoes not\b.{0,20}\b(?:offer|provide)\b.{0,20}\b(?:employee|staff)\b.{0,20}\b(?:discounts?|benefits?|programs?)\b/i,
      /\bdo not explicitly feature\b.{0,25}\b(?:employee|staff)\b.{0,20}\bdiscounts?\b/i,
      /\bdoes not include\b.{0,25}\b(?:a )?direct\b.{0,20}\bemployee\b.{0,20}\bdiscounts?\b/i,
      /\bno\b.{0,35}\b(?:specific|direct|public)\b.{0,20}\bemployee\b.{0,15}\b(?:discounts?|programs?|benefits?)\b/i,
      /\bno\b.{0,40}\b(?:publicly available )?(?:evidence|information)\b.{0,20}\bconfirm\w*\b.{0,25}\b(?:employee|staff)\b.{0,20}\b(?:discounts?|benefits?)\b/i,
      /\bthere is no publicly available evidence confirming\b.{0,25}\b(?:employee|staff)\b.{0,20}\b(?:discounts?|benefits?)\b/i,
      /\bthere is no publicly available evidence confirming that\b.{0,80}\boffers?\b.{0,20}\b(?:a )?(?:standard )?employee discount\b/i,
      /\bpublic employee benefit listings\b.{0,40}\bdo not explicitly feature\b.{0,40}\b(?:a )?(?:standard )?employee discount\b/i,
      /\b(?:employee|staff)\b.{0,20}\bbenefits?\b.{0,25}\bdo not include\b.{0,25}\b(?:a )?direct\b.{0,20}\b(?:employee|staff)?\b.{0,20}\bdiscount\b/i,
      /\bbenefits\b.{0,25}\bdo not include\b.{0,25}\b(?:a )?direct\b.{0,20}\bemployee discount\b.{0,25}\bon products\b/i,
      /\bbenefits package\b.{0,45}\b(?:focuses|centres|centers)\b.{0,40}\b(?:on|around)\b.{0,40}\b(?:health|lifestyle|wellness|insurance|pto|equity|commuter|tuition)\b.{0,40}\b(?:instead of|rather than)\b.{0,25}\bdirect discounts?\b/i,
      /\bkeine?\b.{0,35}\b(?:mitarbeiterrabatt|mitarbeiterprogramm)\b/i,
      /\bnie publikuje publicznie informacji\b.{0,35}\b(?:o )?(?:specjalnych )?(?:zniżk\w*|rabat\w*)\b.{0,20}\bdedykowanych\b.{0,20}\bdla pracownik\w*\b/i,
      /\bbrak\b.{0,35}\b(?:zniżek pracowniczych|benefit[oó]w pracowniczych)\b/i,
      /\bnie\b.{0,35}\b(?:zniżk|rabat)\b.{0,20}\bpracownic\w*\b/i,
      /\bno anuncia expl[ií]citamente\b.{0,30}\bdescuentos?\b.{0,20}\bpara empleados\b/i,
      /没有公开证据.{0,80}(?:员工|内部员工).{0,20}(?:折扣|福利)/,
      /没有公开信息.{0,80}(?:员工|内部员工).{0,20}(?:折扣|福利)/,
      /不(?:直接|公开).{0,20}(?:提供|提及).{0,20}(?:员工折扣|员工福利)/,
      /公司内部政策.{0,20}(?:不会对公众披露|不对外公开)/,
      /不同于一般的[“"]?员工折扣[”"]?/,
    ],
  },
  "existing customer": {
    explicitTerms: [/\bexisting customer(?:s)?\b/i, /\brepeat customer(?:s)?\b/i, /\breturn customer(?:s)?\b/i, /\bloyal customer(?:s)?\b/i, /\bbestaande klanten?\b/i, /\bvaste klanten?\b/i, /\bhuidige klanten?\b/i, /\bklantenbestand\b/i, /\bclients? existants?\b/i, /\bclients? fid[èe]les\b/i],
    positive: [
      /\b(?:existing customer(?:s)?|repeat customer(?:s)?|return customer(?:s)?|loyal customer(?:s)?|cliente(?:s)? existente(?:s)?|sta(?:ł|l)y klient\w*|기존 고객|회원)\b.{0,45}\b(?:discount|benefit|reward|coupon|perk|offer|program|savings|할인|혜택)\b/i,
      /\b(?:clients? existants?|clients? fid[èe]les|clients? d[ée]j[àa] inscrits?)\b.{0,45}\b(?:r[ée]duction|avantage|offre|code promo|remise|fid[ée]lit[ée])\b/i,
      /\b(?:r[ée]duction|avantage|offre|code promo|remise)\b.{0,45}\b(?:pour )?(?:les )?(?:clients? existants?|clients? fid[èe]les)\b/i,
      /\b(?:bestaande klanten?|vaste klanten?)\b.{0,45}\b(?:korting|voordeel|actiecodes?|aanbiedingen|kortingscodes?)\b/i,
      /\b(?:korting|voordeel|actiecodes?|aanbiedingen|kortingscodes?)\b.{0,45}\b(?:voor )?(?:bestaande klanten?|vaste klanten?)\b/i,
      /\b(?:member(?:s)?|membership|annual pass|subscriber(?:s)?|alumno(?:s)?|student(?:s)? of (?:the )?school|premium member(?:s)?)\b.{0,50}\b(?:discount|benefit|reward|free return|priority|coupon|offer|할인|혜택)\b/i,
      /\b(?:referral|refer(?:-a-friend)?|invite friends?)\b.{0,45}\b(?:existing customer|current customer|you will receive|coupon|reward|credit)\b/i,
      /\b(?:benefit|discount|reward|coupon|offer)\b.{0,45}\b(?:for being|por pertenecer|for members|for active students|for current customers)\b/i,
      /\b(?:many magna returns|annual pass)\b/i,
      /\brenewal offers?\b/i,
      /\bview renewal offers?\b/i,
      /\bcurrent members?\b.{0,35}\b(?:discount|benefit|offer|savings)\b/i,
      /\bexisting subscribers?\b.{0,35}\b(?:discount|benefit|offer|promo code)\b/i,
      /现有客户.{0,24}(?:折扣|优惠|专用|续订优惠)/,
      /现有订阅者.{0,24}(?:折扣|优惠|优惠码)/,
      /续订优惠/,
      /回头客.{0,24}(?:折扣|优惠|优惠码)/,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:public information|specific information|confirmation)\b.{0,20}\b(?:existing customer|repeat customer|loyal customer|member)\b/i,
      /\bne propose pas\b.{0,35}\b(?:de )?(?:r[ée]duction|offre|avantage)\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? existants?\b/i,
      /\bpas de r[ée]duction\b.{0,25}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? fid[èe]les\b/i,
      /\bil n['’]y a pas d['’]offre\b.{0,35}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? existants?\b/i,
      /\bgeen\b.{0,35}\b(?:vaste|permanente|specifieke)?\b.{0,20}\b(?:korting|voordelen)\b.{0,20}\bvoor\b.{0,20}\b(?:bestaande klanten?|vaste klanten?)\b/i,
      /\bdoes not\b.{0,25}\b(?:typically|directly)\b.{0,20}\boffer\b.{0,30}\b(?:permanent|fixed)\b.{0,20}\b(?:loyalty|existing customer)\b/i,
      /\bno\b.{0,25}\b(?:permanent|fixed)\b.{0,20}\b(?:loyalty program|existing customer discount)\b/i,
      /\bno hay\b.{0,35}\b(?:informaci[oó]n|confirmaci[oó]n)\b.{0,20}\bclientes? existentes?\b/i,
      /\bnie\b.{0,35}\b(?:ma|posiada)\b.{0,25}\b(?:stałego programu lojalnościowego|stałego programu lojalnosciowego)\b/i,
      /\bno se menciona\b.{0,35}\bclientes? existentes?\b/i,
    ],
  },
  "price guarantee": {
    explicitTerms: [/\bprice guarantee\b/i, /\bprice match\b/i, /\bbest price\b/i, /\blowest price\b/i, /\bpreisgarantie\b/i, /\bgwarancja ceny\b/i, /\bigualaci[oó]n de precios\b/i, /\b최저가 보장\b/i, /\bgarantie du meilleur prix\b/i, /\balignement tarifaire\b/i],
    positive: [
      /\b(?:price guarantee|price match|best price guarantee|lowest price guarantee|match or beat|refund the difference|price protection|preisgarantie|gwarancja ceny|igualaci[oó]n de precios|최저가 보장)\b/i,
      /\bgarantie du meilleur prix\b/i,
      /\bprix le plus bas garanti\b/i,
      /\bprix mini garantis\b/i,
      /\bpolitique de meilleur prix garanti\b/i,
      /\bmieux que le meilleur prix\b/i,
      /\bmeilleurs? tarifs? garantis\b/i,
      /\b(?:s['’]aligner|alignement)\b.{0,25}\bsur le prix\b/i,
      /\b(?:s['’]engage|s’engage)\b.{0,25}\b[àa]\b.{0,10}\b(?:aligner|[ée]galer)\b.{0,20}\ble prix\b/i,
      /\brembours(?:e|ement)\b.{0,35}\b(?:de )?la diff[ée]rence\b/i,
      /\blaagste(?:prijs)?garantie\b/i,
      /\bbestpreis-?garantie\b/i,
      /\b(?:differenz|difference)\b.{0,25}\b(?:erstattet|refunded?|refund)\b/i,
      /\b(?:price(?:s)?|preis)\b.{0,20}\b(?:anpassen|angleichen|match)\b/i,
    ],
    negative: [
      /\bno\b.{0,30}\b(?:general|explicit|formal)?\b.{0,20}\b(?:price guarantee|price match|best price|lowest price|price protection)\b/i,
      /\bne propose pas\b.{0,35}\b(?:de )?(?:garantie du meilleur prix|garantie de prix|alignement tarifaire)\b/i,
      /\bpas de garantie\b.{0,25}\b(?:officielle )?du meilleur prix\b/i,
      /\bpas d['’]alignement tarifaire\b/i,
      /\baucune?\b.{0,35}\bgarantie du meilleur prix\b/i,
      /\bil n['’]est pas fait mention d['’]une garantie explicite du meilleur prix\b/i,
      /\bne mentionne pas de garantie\b.{0,20}(?:explicite|officielle)\b.{0,20}\bdu meilleur prix\b/i,
      /\baucune garantie officielle du meilleur prix\b/i,
      /\bgeen\b.{0,35}\b(?:formele|expliciete)?\b.{0,20}\b(?:laagste prijs garantie|laagsteprijsgarantie|prijsgarantie)\b/i,
      /\bgibt\b.{0,20}\bkeine?\b.{0,25}\b(?:explizite|spezielle)?\b.{0,20}\b(?:bestpreisgarantie|preisgarantie)\b/i,
      /\bkeine?\b.{0,35}\bhinweise\b.{0,25}\b(?:auf )?(?:eine )?(?:bestpreisgarantie|preisgarantie)\b/i,
      /\b(?:nicht|nicht aktiv)\b.{0,20}\bbeworben\b.{0,25}\b(?:bestpreisgarantie|preisgarantie)\b/i,
      /\bkeine?\b.{0,30}\b(?:allgemeine )?preisgarantie\b/i,
      /\bnie\b.{0,30}\b(?:gwarancji ceny|wyr[oó]wnania ceny)\b/i,
      /\b최저가 보장\S* 없\S*/i,
    ],
    ignore: [/\bbest offer\b/i, /\bgood prices?\b/i],
  },
  "loyalty program": {
    explicitTerms: [
      /\bloyalty program\b/i,
      /\brewards? program\b/i,
      /\bmembership program\b/i,
      /\bpoints? program\b/i,
      /\bclub membership\b/i,
      /\bloyaliteitsprogramma\b/i,
      /\bspaarprogramma\b/i,
      /\bbeloningsprogramma\b/i,
      /\bpuntenprogramma\b/i,
      /\bbonus ?card\b/i,
      /\bbonuskaart\b/i,
      /\bklantenkaart\b/i,
      /\bspaarkaart\b/i,
      /\bspaarpas\b/i,
      /\bmembers? club\b/i,
    ],
    positive: [
      /\b(?:loyalty program|rewards? program|membership program|points? program|club membership|treueprogramm|programm lojalno[śs]ciowy|programa de fidelizaci[oó]n|멤버십 프로그램|포인트 적립)\b/i,
      /\bprogramme de fid[ée]lit[ée]\b/i,
      /\bclub avantages\b/i,
      /\b(?:cumuler|cumulez|gagner|collecter)\b.{0,25}\b(?:des )?(?:points|miles)\b/i,
      /\b(?:points|miles)\b.{0,25}\b(?:fid[ée]lit[ée]|statut|r[ée]compenses?)\b/i,
      /\b(?:loyaliteitsprogramma|spaarprogramma|beloningsprogramma|rewards program(?:ma)?|puntenprogramma)\b/i,
      /\b(?:bonus ?card|bonuskaart|klantenkaart|spaarkaart|spaarpas)\b.{0,45}\b(?:korting|voordeel|punten|bonuspunten|aanbiedingen|beloningen)\b/i,
      /\b(?:korting|voordeel|punten|bonuspunten|aanbiedingen|beloningen)\b.{0,45}\b(?:via|met)\b.{0,12}\b(?:de )?(?:bonus ?card|bonuskaart|klantenkaart|spaarkaart|spaarpas)\b/i,
      /\b(?:collect|earn|accumulate|sammel\w*|zbiera\w*|acumular)\b.{0,30}\b(?:points?|rewards?|cashback|miles?)\b/i,
      /\b(?:spaar|verdien)\b.{0,25}\b(?:punten|rewards?)\b/i,
      /\b(?:cashback|points?|rewards?|tiers?|등급별 혜택)\b.{0,30}\b(?:membership|club|program|member)\b/i,
      /\b(?:membership|member(?:s)?(?:hip)?|mitglied(?:er|schaft)?|abonnements?|abo(?:plus)?|club card|clubkarte)\b.{0,45}\b(?:discounts?|benefits?|perks?|privileges?|vorteile|rabatt\w*|welcome premium|willkommenspr[aä]mie|vorkaufsrecht)\b/i,
      /\b(?:discounts?|benefits?|perks?|privileges?|vorteile|rabatt\w*|vorkaufsrecht)\b.{0,45}\b(?:for )?(?:members?|mitglied(?:er|schaft)?|abonnements?|abo(?:plus)?)\b/i,
      /\baboplus\b/i,
      /멤버십 프로그램/,
      /회원.{0,12}혜택/,
      /등급별 혜택/,
      /WILSON CLUB/i,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:traditional|typical|specific)\b.{0,20}\b(?:loyalty program|points?-based program|membership discount)\b/i,
      /\bil n['’]existe pas de programme de fid[ée]lit[ée] classique\b/i,
      /\bpas de programme de points classique\b/i,
      /\bne propose pas de programme de fid[ée]lit[ée] (?:classique|bas[ée] sur des points)\b/i,
      /\bgeen\b.{0,35}\b(?:algemeen|publiek bekend|traditioneel|klassiek)?\b.{0,20}\b(?:loyaliteitsprogramma|spaarprogramma|puntenprogramma)\b/i,
      /\bgeen\b.{0,25}\b(?:specifiek )?(?:loyaliteitsprogramma|spaarprogramma)\b/i,
      /\bkeine?\b.{0,35}\b(?:treueprogramm|mitgliedschaftsprogramm)\b/i,
      /\bnie prowadzi\b.{0,25}\b(?:typowego|stałego)\b.{0,20}\bprogramu lojalno[śs]ciowego\b/i,
      /\b(?:aktionsrabatte?|promo(?:tional)? codes?|gutscheincode|discount codes?|social media|facebook|instagram|tiktok)\b.{0,60}\b(?:rather than|instead of|less than|weniger als|mniej niż|no|not)\b.{0,25}\b(?:a )?(?:classic|traditional|real|klassisches?)\b.{0,20}\b(?:loyalty program|treueprogramm)\b/i,
      /\bweniger\b.{0,15}\bum\b.{0,15}\bein\b.{0,20}\bklassisches?\b.{0,20}\btreueprogramm\b/i,
      /\bnie ma informacji potwierdzających\b.{0,40}\bprogram\w*\b.{0,15}lojalno/i,
      /\bnie ma\b.{0,35}\binformacji\b.{0,25}\bpotwierdzaj\w*\b.{0,30}\bprogram\w*\b.{0,15}lojalno/i,
      /\bno hay\b.{0,35}\binformaci[oó]n\b.{0,25}\b(?:que confirme|confirmando)\b.{0,25}\b(?:programa|plan)\b.{0,20}\bde fidelizaci[oó]n\b/i,
      /不(?:直接)?提供传统(?:的)?(?:基于积分的)?(?:客户)?忠诚度计划/,
    ],
  },
  referral: {
    explicitTerms: [/\breferr(?:al|ing)?\b/i, /\brefer(?:-a-friend)?\b/i, /\bfriend referral\b/i, /\bpatrocinio\b/i, /\bpole(?:c|caj)\w*\b/i, /\b친구 추천\b/i, /\b초대 코드\b/i, /推荐好友/, /好友推荐/, /推荐折扣/, /推荐计划/, /推荐奖励/, /\bparrainage\b/i, /\bparrainer\b/i],
    positive: [
      /\b(?:refer(?:-a-friend)?|referral|friend referral|invite friends?|patrocinio|pole(?:c|caj)\w*|친구 추천|초대 코드)\b.{0,45}\b(?:discount|reward|credit|cashback|coupon|code|bonus|off|rabat|zniżk|할인|적립)\b/i,
      /\b(?:programme de )?parrainage\b.{0,40}\b(?:r[ée]duction|bonus|cr[ée]dit|bon d['’]achat|avantage)\b/i,
      /\b(?:parrain|filleul)\b.{0,45}\b(?:r[ée]duction|bonus|cr[ée]dit|bon d['’]achat)\b/i,
      /\b(?:your friend|both you and your friend|sponsor and new customer)\b.{0,45}\b(?:discount|reward|credit|coupon)\b/i,
      /(?:推荐好友|好友推荐|推荐计划).{0,24}(?:折扣|奖励|返利|优惠码|积分)/,
      /(?:折扣|奖励|返利|优惠码|积分).{0,24}(?:推荐好友|好友推荐|推荐计划)/,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:formal|specific|explicit)?\b.{0,20}\b(?:referral|refer(?:-a-friend)?|friend referral)\b.{0,15}\b(?:program|discount|offer)\b/i,
      /\bpas de programme de parrainage\b/i,
      /\bne propose pas de r[ée]duction de parrainage\b/i,
      /\baucune?\b.{0,35}\boffre de parrainage\b/i,
      /\bgeen\b.{0,35}\b(?:actief|openbaar|publiek|specifiek)?\b.{0,20}\b(?:vriendenprogramma|referral(?:-programma)?|vrienden-?actie)\b/i,
      /\bgeen\b.{0,35}\b(?:directe )?(?:korting|beloning)\b.{0,25}\b(?:door|voor)\b.{0,20}\bvrienden\b.{0,20}\b(?:uit te nodigen|aan te brengen)\b/i,
      /\baffiliate programma\b.{0,40}\bniet\b.{0,20}\bvoor\b.{0,20}\bconsumenten\b/i,
      /\bdoes not\b.{0,25}\b(?:provide|offer)\b.{0,25}\b(?:a )?(?:standard|public|consumer|normal)?\b.{0,20}\b(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:discount|program|offer)\b/i,
      /\bno longer offers a general friend referral program\b/i,
      /\bended in many markets\b/i,
      /\baffiliate program\b/i,
      /\bcommission\b.{0,25}\b(?:rebate|payout|sales)\b/i,
      /\b(?:bloggers?|creators?|b2b|partners?)\b.{0,35}\baffiliate program\b/i,
      /\brather than\b.{0,35}\b(?:a )?(?:public|consumer|retail|standard)\b.{0,20}\b(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:discount|program)\b/i,
      /\bnot (?:for|aimed at)\b.{0,20}\b(?:ordinary|regular|normal)\b.{0,20}\bconsumers?\b/i,
      /\bnot a standard(?: public| consumer)? referral\b/i,
      /\bmember-?get-?member\b/i,
      /\bmitglieder\b.{0,30}\bneue mitglieder werben\b/i,
      /\bmitgliedschaft\b.{0,30}\bverschenken\b/i,
      /\bkeine?\b.{0,35}\b(?:freunde werben|empfehlungsprogramm)\b/i,
      /\bnie\b.{0,35}\b(?:programu|zniżkowego typu)\b.{0,20}\b(?:poleceń|polecania)\b/i,
      /\b친구 추천\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b없\S*/i,
      /\b별도의\b.{0,20}\b친구 추천\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b명시되어 있지 않\S*/i,
      /面向普通消费者的直接.{0,20}(?:推荐好友|推荐折扣|Referral Discount)/,
      /联盟营销计划/,
      /并非针对所有普通消费者的标准内推福利/,
    ],
  },
  family: {
    explicitTerms: [/\bfamily\b/i, /\bfamil(?:y|ia|ien)\b/i, /\brodzin\w*\b/i, /\b패밀리\b/i, /\b가족\b/i, /\bfamilles?\b/i, /\bfamille nombreuse\b/i],
    positive: [
      /\b(?:family|famil(?:y|ia|ien)|rodzin\w*|패밀리|가족)\b.{0,35}\b(?:discount|ticket|pass|price|offer|plan|bundle|rabat|zniżk|할인|혜택)\b/i,
      /\b(?:familles?|famille nombreuse)\b.{0,40}\b(?:r[ée]duction|tarif|offre|avantage)\b/i,
      /\b(?:r[ée]duction|tarif|offre|avantage)\b.{0,40}\b(?:pour )?(?:les )?(?:familles?|familles nombreuses)\b/i,
      /\bfamiliekorting\b/i,
      /\b(?:eerste|1e)\b.{0,20}\bkind\b.{0,20}\bgratis\b/i,
      /\b(?:family ticket|family pass|ticket familiar|bilet rodzinny|가족 할인)\b/i,
      /\b(?:sibling|geschwister)\w*\b.{0,25}\b(?:discount|rabatt)\b/i,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:public information|confirmation|evidence)\b.{0,20}\bfamily\b.{0,15}\b(?:discount|offer)\b/i,
      /\bpas de r[ée]duction famille\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique pour les familles\b/i,
      /\bne propose pas de r[ée]ductions?\b.{0,20}\bsp[ée]cifiques?\b.{0,20}\bd[ée]di[ée]es?\b.{0,20}\baux familles\b/i,
      /\baucun(?:e)?\b.{0,30}\boffre\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles familles\b/i,
      /\bne propose pas de r[ée]ductions? sp[ée]cifiques? pour les familles\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bsp[ée]cifiques?\b.{0,20}\bpour\b.{0,20}\bles familles\b/i,
      /\baucune mention sp[ée]cifique\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\b(?:pour )?(?:les )?familles\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bd[ée]di[ée]es?\b.{0,20}\baux familles\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:de )?tarifs?\b.{0,20}\bfamilles?\b/i,
      /\bne propose pas de r[ée]duction\b.{0,25}\b(?:labellis[ée]e|d[ée]di[ée]e?)\b.{0,20}\b(?:famille|familles)\b/i,
      /\bpas de r[ée]duction\b.{0,25}\b(?:labellis[ée]e|d[ée]di[ée]e?)\b.{0,20}\b(?:famille|familles)\b/i,
      /\bne confirme pas de r[ée]duction\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles familles\b/i,
      /\bgeen\b.{0,35}\b(?:specifieke|standaard)?\b.{0,20}\bfamiliekorting\b/i,
      /\bno\b.{0,30}\b(?:special|specific|dedicated)?\b.{0,20}\bfamily\b.{0,15}\b(?:discount|offer)\b/i,
      /\bdoes not\b.{0,25}\b(?:offer|provide)\b.{0,20}\b(?:a )?(?:standard |specific |dedicated )?family\b.{0,15}\b(?:discount|offer)\b/i,
      /\bdoes not offer a standard family discount\b/i,
      /\bkeine?\b.{0,30}\b(?:familienrabatt|familienangebot)\b/i,
      /\bkeinen?\b.{0,20}\bgenerellen?\b.{0,20}\bgeschwisterrabatt\b/i,
      /\bkeine?\b.{0,20}\bspeziellen?\b.{0,20}\bfamilienrabatte?\b/i,
      /\bkeinen?\b.{0,20}\bspeziellen?\b.{0,20}\bfamilienrabatt\b/i,
      /\bhat nichts mit preisnachl[aä]ssen f[uü]r familien zu tun\b/i,
      /\bnie\b.{0,30}\b(?:zniżk|rabat)\b.{0,20}\brodzin\w*\b/i,
      /\bno hay informaci[oó]n p[uú]blica\b.{0,25}\b(?:descuento|oferta)\b.{0,20}\bfamiliar\b/i,
      /\bno ofrece un descuento familiar espec[ií]fico\b/i,
      /\bfriends? and family\b.{0,20}\b(?:sale|event|promotion|offer)\b/i,
      /\bfriends? and family\b.{0,40}\b(?:temporary )?(?:sale|promotion|event)\b.{0,40}\b(?:rather than|not)\b.{0,20}\b(?:a )?(?:dedicated )?family discount\b/i,
      /\brather than a dedicated family discount\b/i,
      /\b(?:military|employee|friends?)\b.{0,20}\bfamil(?:y|ies)\b.{0,20}\b(?:discount|offer|program)\b/i,
      /\b(?:military|employee)\b.{0,20}\bfamil(?:y|ies)\b/i,
      /\b가족 할인\S* 없\S*/i,
      /별도의 가족 결합 혜택을 제공하지 않/,
    ],
  },
  child: {
    positive: [
      /\b(?:child|children|kids?|baby|babies|niñ(?:o|os)|niñ(?:a|as)|ni(?:n|ñ)os|dzieci|dziecko|어린이|유아)\b.{0,40}\b(?:discounts?|offers?|tickets?|free|admission|stay free|eat free|rabat\w*|zniżk\w*|할인|혜택)\b/i,
      /\b(?:enfants?|b[ée]b[ée]s?)\b.{0,40}\b(?:r[ée]duction|tarif|gratuit|offre|billet)\b/i,
      /\b(?:tarif|r[ée]duction|billet)\b.{0,40}\b(?:enfant|enfants)\b/i,
      /\bkinderkorting\b/i,
      /\b(?:eerste|1e)\b.{0,20}\bkind\b.{0,20}\bgratis\b/i,
      /\b(?:kids? ticket|children eat free|ticket infantil|bilet ulgowy dla dzieci|어린이 할인)\b/i,
      /\b(?:children|kids?|kinder)\b.{0,25}\b(?:stay|eat|enter|travel)\b.{0,12}\bfree\b/i,
      /\bkindererm[aä]ßig\w*\b/i,
      /\b(?:erm[aä]ßigung|ermäßigung)\b.{0,20}\bf[uü]r\b.{0,20}\bkinder\b/i,
      /\bkinder\b.{0,20}\b(?:erm[aä]ßigung|ermäßigung)\b/i,
      /\bproductos? infantiles?\b.{0,20}\bdescuent/i,
      /\bbeb[eé]\w*\b.{0,20}\bdescuent/i,
      /어린이.{0,10}(할인|혜택)/,
      /유아.{0,10}(할인|혜택)/,
    ],
    negative: [
      /\bno\b.{0,20}\bchild(?:-specific)?\b.{0,20}\bdiscount\b/i,
      /\bpas de r[ée]duction\b.{0,25}\b(?:sp[ée]cifique )?pour\b.{0,20}\bles enfants\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique pour les enfants\b/i,
      /\bne propose pas de r[ée]ductions?\b.{0,20}\bsp[ée]cifiques?\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\baucune mention\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bsp[ée]cifiques?\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bsp[ée]cifiques?\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\bil n['’]y a aucune mention sp[ée]cifique\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\baucune indication claire\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\baucune politique tarifaire\b.{0,30}\bpour\b.{0,20}\bles enfants\b/i,
      /\bne met pas explicitement en avant\b.{0,35}\b(?:de )?r[ée]ductions?\b.{0,20}\b(?:sp[ée]cifiques?|d[ée]di[ée]es?)\b.{0,20}\bpour\b.{0,20}\bles enfants\b/i,
      /\bgeen\b.{0,35}\b(?:speciale|specifieke)?\b.{0,20}\b(?:kinderkorting|korting voor kinderen)\b/i,
      /\bno\b.{0,30}\b(?:special|specific)?\b.{0,20}\bchild\b.{0,15}\b(?:discounts?|offers?)\b/i,
      /\bkeine?\b.{0,30}\b(?:kinderrabatt|rabatt fur kinder|rabatt für kinder)\b/i,
      /\bkeine?\b.{0,35}\bhinweise\b.{0,25}\b(?:auf )?spezielle\b.{0,20}\bkinderrabatt\w*\b/i,
      /\bdoes not offer a\b.{0,20}\bkids?\b.{0,15}\bdiscount\b/i,
      /\bbrak\b.{0,35}\b(?:bezpośrednich informacji|informacji)\b.{0,25}\b(?:o )?(?:specjalnych )?(?:zniżk\w*|rabat\w*)\b.{0,20}\bdedykowanych\b.{0,20}\bdla dzieci\b/i,
      /目前.{0,20}专门针对儿童的折扣或童装优惠/,
      /儿童.{0,20}(?:折扣|优惠).{0,20}(?:没有|暂无|未提及)/,
      /\bproducts? are (?:strictly )?intended for adults\b/i,
      /\b어린이\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b없\S*/i,
      /어린이 전용 할인 혜택에 대한 언급은 없\S*/i,
      /어린이 전용 할인 혜택을 별도로 운영하지 않\S*/i,
      /\bkindercamera'?s?\b/i,
    ],
  },
  birthday: {
    positive: [
      /\b(?:birthday|cumplea[nñ]os|urodzin\w*|geburtstag|생일)\b.{0,35}\b(?:discounts?|coupons?|gifts?|rewards?|perks?|offers?|vouchers?|rabat\w*|zniżk\w*|할인|쿠폰|혜택)\b/i,
      /\b(?:anniversaire)\b.{0,35}\b(?:r[ée]duction|offre|cadeau|bon|coupon|points?)\b/i,
      /\b(?:r[ée]duction|offre|cadeau|bon|coupon|points?)\b.{0,35}\banniversaire\b/i,
      /\b(?:coupons?|rewards?|vouchers?|gifts?)\b.{0,35}\b(?:birthday|cumplea[nñ]os|urodzin\w*|geburtstag|생일)\b/i,
      /\b(?:points?|rewards?)\b.{0,25}\b(?:for|on)\b.{0,12}\bbirthday\b/i,
      /\b(?:punkte|pr[aä]mien|gutschein\w*|angebot\w*|aktion\w*)\b.{0,30}\b(?:zum|für den|am)\b.{0,12}\bgeburtstag\b/i,
      /\bgeburtstagsangebot\b/i,
      /\bgeburtstagswoche\b.{0,35}\b(?:gratis|kostenlos|flasche|prosecco|geschenk)\b/i,
      /생일.{0,12}(쿠폰|혜택|할인)/,
      /会员生日期间.{0,20}(奖励|积分|福利)/,
    ],
    negative: [
      /\bno\b.{0,35}\b(?:direct|explicit|public)\b.{0,20}\b(?:birthday|cumplea[nñ]os|geburtstag|urodzin)\b.{0,15}\b(?:discounts?|offers?|rewards?)\b/i,
      /\bpas de r[ée]duction anniversaire\b/i,
      /\bne propose pas de r[ée]duction (?:sp[ée]cifique|r[ée]currente)\b.{0,20}\bd['’]anniversaire\b/i,
      /\baucun(?:e)?\b.{0,30}\b(?:offre|coupon|bon)\b.{0,20}\bd['’]anniversaire\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:d['’])?(?:offre|avantage|r[ée]duction|cadeau)\b.{0,20}\bsp[ée]cifique\b.{0,20}\b(?:pour )?les anniversaires\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:d['’])?(?:offre|avantage|r[ée]duction|cadeau)\b.{0,20}\bd[ée]di[ée]?\b.{0,20}\baux anniversaires\b/i,
      /\bne met pas en avant\b.{0,35}\b(?:d['’])?(?:offre|avantage|r[ée]duction|cadeau)\b.{0,20}\bsp[ée]cifique\b.{0,20}\b(?:pour )?les anniversaires\b/i,
      /\baucune mention explicite\b.{0,35}\b(?:d['’])?(?:offre|avantage|r[ée]duction|cadeau)\b.{0,20}\bli[ée]?\b.{0,20}\baux anniversaires\b/i,
      /\bil n['’]y a pas de mention explicite d['’]un\b.{0,25}\b(?:avantage|cadeau|coupon|r[ée]duction)\b.{0,20}\bd['’]anniversaire\b/i,
      /\bil n['’]est pas explicitement confirm[ée]\b.{0,35}\b(?:qu['’]il y ait )?(?:un )?(?:avantage|cadeau|coupon|r[ée]duction)\b.{0,20}\bd['’]anniversaire\b/i,
      /\bne propose pas\b.{0,35}\b(?:de )?(?:cadeau|offre|avantage)\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles anniversaires\b/i,
      /\banniversaire de la marque\b.{0,50}\b(?:et non|plut[oô]t qu['’]un)\b.{0,30}\b(?:avantage|r[ée]duction|cadeau)\b.{0,20}\bclient\b/i,
      /\bsolutions? adapt[ée]es? pour les anniversaires\b.{0,60}\b(?:et non)\b.{0,20}\b(?:une )?(?:offre|r[ée]duction|cadeau)\b.{0,20}\bd['’]anniversaire\b/i,
      /\bgeen\b.{0,35}\b(?:specifieke|algemeen bekende|structurele)?\b.{0,20}\bverjaardagskorting\b/i,
      /\bno\b.{0,30}\b(?:specific|standard|automatic)?\b.{0,20}\b(?:birthday|birthday discount)\b/i,
      /\bdoes not explicitly list\b.{0,25}\bbirthday\b.{0,20}\b(?:discounts?|rewards?|coupons?)\b/i,
      /\bdoes not\b.{0,25}\b(?:currently )?offer\b.{0,20}\b(?:a )?(?:standard|recurring|standalone|dedicated)\b.{0,20}\bbirthday\b.{0,15}\b(?:discounts?|rewards?|coupons?)\b/i,
      /\bkeine?\b.{0,35}\b(?:explizite information|information)\b.{0,25}\b(?:[uü]ber )?(?:einen )?(?:speziellen )?geburtstagsrabatt\b/i,
      /\bkeine?\b.{0,35}\b(?:direkten hinweise|expliziten hinweise)\b.{0,25}\b(?:geburtstagsrabatt|geburtstagsaktion)\b/i,
      /\bkeine?\b.{0,30}\b(?:geburtstagsrabatt|geburtstagsaktion)\b/i,
      /\bpersonalisierte geschenke\b.{0,40}\bgeburtstag\w*\b/i,
      /\bnie\b.{0,35}\b(?:zniżk|rabat)\b.{0,20}\burodzin\w*\b/i,
      /\bno se confirma expl[ií]citamente\b.{0,30}\b(?:descuento|oferta)\b.{0,20}\bde cumplea[nñ]os\b/i,
      /\b(?:their own|its own|45th)\b.{0,20}\bbirthday\b.{0,20}\b(?:sale|blends?)\b/i,
      /\bother (?:retailers?|merchants?|brands?)\b.{0,30}\bbirthday\b.{0,20}\b(?:deal|discount|offer)\b/i,
      /\b생일\b.{0,20}\b(?:할인|쿠폰|혜택)\b.{0,12}\b없\S*/i,
      /고정된 생일 할인 쿠폰 혜택을 제공하지 않\S*/i,
    ],
  },
  "new customer": {
    positive: [
      /\b(?:new customer|first order|first purchase|welcome discount|nuevo cliente|premier achat|pierwsze zam[oó]wienie|신규 고객)\b.{0,35}\b(?:discount|offer|code|coupon|rabat|zniżk|할인)\b/i,
      /\b(?:nouveaux clients?|premi[èe]re commande|offre de bienvenue)\b.{0,40}\b(?:r[ée]duction|offre|code promo|remise)\b/i,
      /\b(?:r[ée]duction|offre|code promo|remise)\b.{0,40}\b(?:pour )?(?:les )?(?:nouveaux clients?|premi[èe]re commande)\b/i,
      /\b(?:nieuwe klanten?|nieuwe accounts?)\b.{0,35}\b(?:korting|welkomstpunten|welkomstkorting|kortingscode)\b/i,
      /\b(?:eerste bestelling|eerste aankoop)\b.{0,35}\b(?:korting|welkomstkorting|kortingscode)\b/i,
      /\binschrijving\b.{0,35}\bnieuwsbrief\b.{0,35}\b(?:welkomstkorting|kortingsvoucher|waardebon)\b/i,
      /신규 (?:고객|회원).{0,15}(할인|혜택|쿠폰)/,
      /웰컴 (?:쿠폰|혜택)/,
      /\bnewsletter-rabatt\b.{0,30}\berste(?:n)? bestellung\b/i,
    ],
    negative: [
      /\bno\b.{0,25}\b(?:specific|explicit)\b.{0,20}\b(?:new customer|first order)\b.{0,15}\b(?:discount|offer)\b/i,
      /\bpas de r[ée]duction\b.{0,25}\b(?:sp[ée]cifique )?(?:nouveau client|premi[èe]re commande)\b/i,
      /\bne propose pas d['’]offre de bienvenue\b/i,
      /\bgeen\b.{0,35}\b(?:vaste|specifieke)?\b.{0,20}\b(?:korting|aanbieding)\b.{0,20}\b(?:voor )?(?:nieuwe klanten?|eerste bestelling)\b/i,
      /\bkeinen?\b.{0,30}\b(?:allgemeinen?\b.{0,10})?neukundenrabatt\b/i,
      /\bkeine?\b.{0,30}\bspeziellen?\b.{0,20}\bneukundenrabatte?\b/i,
      /\bkeine?\b.{0,35}\bhinweise\b.{0,20}\b(?:auf )?(?:spezielle )?rabattaktionen\b.{0,20}\bf[uü]r\b.{0,20}\berstbesteller\b/i,
    ],
  },
  "newsletter/first order/sign up/": {
    positive: [
      /\b(?:newsletter|sign ?up|signup|subscribe|first order|welcome code|suscripci[oó]n|newsletter-anmeldung)\b.{0,35}\b(?:discount|offer|code|coupon|rabat|zniżk|할인)\b/i,
      /\bnieuwsbrief\b.{0,35}\b(?:korting|welkomstkorting|aanbieding|actie(?:code)?|kortingscode)\b/i,
      /\b(?:schrijf je in|inschrijven|aanmelden)\b.{0,35}\b(?:nieuwsbrief|mail(?:ing)?lijst)\b.{0,35}\b(?:korting|welkomstkorting|code)\b/i,
      /\beerste bestelling\b.{0,35}\b(?:korting|welkomstkorting|kortingscode)\b/i,
      /\b(?:r[ée]duction|offre|code promo|remise)\b.{0,35}\b(?:newsletter|inscription|premi[èe]re commande|offre de bienvenue)\b/i,
      /\b(?:newsletter|inscription|inscrivez-vous|abonnez-vous)\b.{0,35}\b(?:r[ée]duction|offre|code promo|remise|avantage)\b/i,
      /\boffre de bienvenue\b/i,
      /\bdescuento de bienvenida\b.{0,35}\b(?:primer pedido|registrarse|primera vez)\b/i,
      /\bprimer pedido\b.{0,25}\b(?:al registrarse|por registrarte|bienvenida)\b/i,
      /\bnewsletter-rabatt\b/i,
      /\banmeldung\b.{0,30}\b(?:exklusiven? angebote?|gutscheincodes?)\b/i,
      /\bnewsletter\b.{0,30}\b(?:exclusive offers?|gutscheincodes?|promo(?:tional)? codes?)\b/i,
      /\bnew subscribers?\b.{0,20}\breceive\b.{0,20}\ba\b.{0,20}\bwelcome discount code\b/i,
      /\bwelcome discount code\b.{0,30}\b(?:sent|email|inbox)\b/i,
      /\bnewsletter sign[- ]?up\b.{0,30}\b(?:10%|15%|discount code|welcome discount)\b/i,
      /\bsign[- ]?up incentives?\b/i,
      /\bprovided discount code\b.{0,25}\bby signing up\b.{0,30}\bnewsletter\b/i,
      /\bdurch die anmeldung\b.{0,25}\bk[oö]nnen sie\b.{0,30}\b(?:von )?(?:exklusiven? angeboten?|gutscheincodes?)\b/i,
      /\bzapis do newslettera\b.{0,30}\b(?:zniżk|rabat|kod)\b/i,
      /\bnewsletter\b.{0,30}\b(?:10%|15%|rabattcode|erste bestellung)\b/i,
      /회원가입.{0,15}(쿠폰|혜택|할인)/,
      /(?:新订阅者|新用户).{0,24}(?:首单优惠|首单折扣|折扣代码|欢迎优惠|欢迎邮件)/,
      /(?:订阅电子邮件|注册电子邮件|邮件订阅).{0,24}(?:首单|折扣码|优惠码|欢迎邮件)/,
      /(?:首单优惠|首单折扣|折扣代码).{0,24}(?:订阅电子邮件|注册电子邮件|邮件订阅)/,
    ],
    negative: [
      /\bno\b.{0,25}\b(?:newsletter|sign ?up|first order)\b.{0,15}\b(?:discount|offer)\b/i,
      /\bgeen\b.{0,30}\b(?:nieuwsbriefkorting|korting bij inschrijving|welkomstkorting)\b/i,
      /\bgeen korting\b.{0,35}\b(?:bij|na)\b.{0,20}\b(?:inschrijving|aanmelding|de nieuwsbrief|eerste bestelling)\b/i,
      /\bniet direct\b.{0,30}\b(?:te bevestigen|bevestigd)\b.{0,25}\b(?:of )?.{0,30}\b(?:korting|welkomstkorting|nieuwsbrief)\b/i,
      /\bgeen directe informatie beschikbaar\b.{0,35}\bbevestigt\b.{0,30}\b(?:vaste )?korting\b/i,
      /\bgeen directe bevestiging\b.{0,35}\b(?:korting|welkomstkorting|nieuwsbrief)\b/i,
      /\bgeen directe korting\b.{0,35}\b(?:bij|aan)\b.{0,20}\b(?:inschrijving|aanmelding|nieuwsbrief)\b/i,
      /\bwordt niet expliciet vermeld\b.{0,35}\b(?:dat|of)\b.{0,30}\b(?:korting|welkomstkorting|nieuwsbrief)\b/i,
      /\bzonder melding van een korting\b/i,
      /\bgeen directe aanwijzing\b.{0,30}\b(?:korting|nieuwsbrief)\b/i,
      /\bgeen directe aanwijzing\b.{0,60}\b(?:specifieke|vaste)?\b.{0,20}\bkorting\b.{0,30}\b(?:biedt|geeft)\b.{0,35}\b(?:inschrijving|nieuwsbrief)\b/i,
      /\bpas de r[ée]duction\b.{0,35}\b(?:newsletter|[àa] l'?inscription|premi[èe]re commande|offre de bienvenue)\b/i,
      /\baucune?\b.{0,35}\b(?:r[ée]duction|offre)\b.{0,20}\b(?:newsletter|de bienvenue|[àa] l'?inscription|premi[èe]re commande)\b/i,
      /\bil n'?est pas explicitement mentionn[ée]?\b.{0,35}\b(?:que )?.{0,30}\b(?:newsletter|inscription|r[ée]duction|offre)\b/i,
      /\bil n'?est pas explicitement confirm[ée]?\b.{0,35}\b(?:que )?.{0,30}\b(?:newsletter|inscription|r[ée]duction|offre)\b/i,
      /\bil n'?est pas explicitement indiqu[ée]?\b.{0,60}\b(?:que )?.{0,40}\br[ée]duction imm[ée]diate\b.{0,40}\bnewsletter\b/i,
      /\bne mentionne pas explicitement\b.{0,70}\br[ée]duction\b.{0,30}\bli[ée]e sp[ée]cifiquement\b.{0,35}\bnewsletter\b/i,
      /\bne mentionne pas explicitement\b.{0,70}\br[ée]duction imm[ée]diate\b.{0,40}\bofferte sp[ée]cifiquement\b.{0,35}\bnewsletter\b/i,
      /\bil n'?est pas indiqu[ée]?\b.{0,70}\br[ée]duction automatique ou permanente\b.{0,40}\bofferte sp[ée]cifiquement\b.{0,35}\bnewsletter\b/i,
      /\bles r[ée]sultats de recherche ne confirment pas sp[ée]cifiquement\b.{0,70}\br[ée]duction imm[ée]diate\b.{0,35}\bnewsletter\b/i,
      /\bne met pas explicitement en avant\b.{0,35}\b(?:une )?(?:r[ée]duction|offre|code promo)\b/i,
      /\bil n'?est pas explicitement indiqu[ée]?\b.{0,35}\bqu['’]une r[ée]duction\b/i,
      /\bn'?indiquent pas\b.{0,35}\b(?:de )?r[ée]duction directe\b.{0,25}\bsyst[ée]matique\b/i,
      /\bconfusion entre deux entit[ée]s distinctes\b/i,
      /\bterres de france\b.{0,50}\bterr[ée]sens\b/i,
      /\bno\b.{0,35}\b(?:direct|specific)\b.{0,20}\binformation\b.{0,20}\b(?:newsletter|sign ?up)\b.{0,15}\b(?:discount|offer)\b/i,
      /\bkeine?\b.{0,35}\bexpliziten?\b.{0,20}\binformationen?\b.{0,20}\b(?:[uü]ber )?(?:einen )?(?:direkten )?rabatt\b.{0,20}\bbei\b.{0,20}\bnewsletter/i,
      /\bdoes not\b.{0,30}\b(?:currently )?(?:advertise|offer)\b.{0,20}\b(?:a )?(?:standard )?(?:first order|newsletter sign[- ]?up|sign up)\b.{0,15}\b(?:discount|offer)\b/i,
      /\bthere (?:isn'?t|is not)\b.{0,25}\b(?:a )?specific\b.{0,20}\b(?:first purchase|first order)\b.{0,15}\b(?:code|discount)\b/i,
      /\breferral program\b.{0,35}\bfirst(?:-time)? orders?\b/i,
      /\binvited by a friend\b.{0,35}\bfirst(?:-time)? orders?\b/i,
      /\bthrough (?:their )?referral program\b/i,
      /\bthis is a referral reward\b/i,
      /推荐计划.{0,24}(?:首单|首次下单)/,
    ],
  },
  return: {
    positive: [
      /\bfree returns?\b/i,
      /\breturns? (?:are )?free\b/i,
      /\bkosteloos\b.{0,20}\b(?:te )?(?:annuleren|retourneren)\b/i,
      /\bgratis\b.{0,20}\b(?:omruilen|annuleren)\b/i,
      /\bdevoluciones? gratis\b/i,
      /\bkostenlose r[üu]cksendung\b/i,
      /\breturn(?:s| policy| guarantee)?\b.{0,35}\b(?:within|refund|portal|label|window|days?)\b/i,
      /\brefund(?:s| policy)?\b.{0,30}\b(?:original payment method|processed|available|within)\b/i,
      /\breturn guarantee\b/i,
      /\blegal right to return\b/i,
      /\br[üu]cksend\w*\b.{0,35}\b(?:kostenlos|retourenportal|dhl|qr-code|14 tagen?|widerrufsrecht|erstattung)\b/i,
      /\bretoure\w*\b.{0,35}\b(?:portal|anmelden|erstattung|14 tagen?)\b/i,
      /\bzwrot\w*\b.{0,35}\b(?:14 dni|pieni[eę]dzy|produkt[oó]w)\b/i,
      /\b반품\b.{0,25}\b(?:정책|기간|가능|환불|무료)\b/i,
      /\bretour(?:s)?\b.{0,35}\b(?:gratuit(?:s)?|possible|accept[ée]s?|sous \d{1,2} jours|rembours[ée]s?)\b/i,
      /\baccepte les retours\b.{0,20}\b(?:sous|dans)\b.{0,12}\b\d{1,2}\b.{0,10}\bjours\b/i,
      /\b(?:retour|retours|remboursement)\b.{0,35}\b(?:sous|dans)\b.{0,12}\b\d{1,2}\b.{0,10}\bjours\b/i,
      /\bpolitique de retour\b/i,
    ],
    negative: [
      /\bno returns?\b/i,
      /\bno refunds?\b/i,
      /\bgeen\b.{0,25}\bstandaard\b.{0,20}\bgratis\b.{0,20}\bretourneren\b/i,
      /\bniet expliciet\b.{0,35}\bgratis\b.{0,20}\b(?:is|zijn|vermeld)\b/i,
      /\bverzendkosten\b.{0,30}\b(?:zijn|blijven)\b.{0,20}\bvoor\b.{0,20}\bde consument\b/i,
      /\b(?:kosten|verzendkosten)\b.{0,35}\b(?:voor )?eigen rekening\b/i,
      /\bfinal sale(?: only)?\b.{0,20}\bno returns?\b/i,
      /\bdoes not accept returns?\b/i,
      /\breturns? (?:are )?not accepted\b/i,
      /\bkeine r[üu]cksend\w*\b/i,
      /\bkein widerrufsrecht\b/i,
      /\bno se aceptan devoluciones\b/i,
      /\b반품 불가\b/i,
      /\bpas de retour(?:s)?\b/i,
      /\bles frais de retour sont [àa] la charge du client\b/i,
      /\ble retour(?: par (?:voie postale|la poste))? est payant\b/i,
    ],
    ignore: [
      /\bcheck\b.{0,30}\b(?:whether|if)\b.{0,25}\bfree returns?\b/i,
      /\bshould check\b.{0,30}\b(?:the )?product page\b.{0,30}\breturns?\b/i,
      /\b(?:seller|판매자)\b.{0,30}\b(?:sets?|설정)\b.{0,25}\b(?:the )?return policy\b/i,
      /\b(?:seller|판매자)\b.{0,35}\b(?:free returns?|반품)\b.{0,20}\b(?:or|또는)\b.{0,20}\b(?:buyer pays|구매자 부담)\b/i,
      /판매자가 반품 정책.*설정/,
      /무료 반품 또는 구매자 부담/,
      /\bnot directly visible\b.{0,30}\breturn(?: policy| costs?)\b/i,
      /\bsearch results?\b.{0,35}\b(?:point|refer)\b.{0,25}\bto\b.{0,25}\b(?:related|other)\b.{0,20}\bshops?\b/i,
    ],
  },
  senior: {
    positive: [
      /\b(?:senior|55\+|60\+|50\+|emeryt\w*|rencist\w*|adultos mayores)\b.{0,35}\b(?:discount|offer|ticket|rabat|zniżk|할인)\b/i,
      /\bseniorenkorting\b/i,
      /\bseniorenrabatt\w*\b/i,
      /\b(?:senior citizens?|older adults?|personas mayores)\b.{0,35}\b(?:discount|fare|ticket|rate|offer|benefit)\b/i,
      /\b50plus\b/i,
      /\b(?:seniors?|personnes [âa]g[ée]es)\b.{0,35}\b(?:r[ée]duction|tarif|offre|avantage)\b/i,
      /\b(?:r[ée]duction|tarif|offre|avantage)\b.{0,35}\b(?:pour )?(?:les )?(?:seniors?|personnes [âa]g[ée]es)\b/i,
    ],
    negative: [
      /\bno\b.{0,25}\b(?:senior|senior discount)\b/i,
      /\bgeen\b.{0,35}\b(?:standaard|vaste|specifieke|permanente)?\b.{0,20}\bseniorenkorting\b/i,
      /\bblijkt niet\b.{0,25}\bdat er\b.{0,20}\b(?:een )?(?:specifieke|permanente)\b.{0,20}\bseniorenkorting\b.{0,20}\bis\b/i,
      /\bdoes not offer a specific senior discount\b/i,
      /\bno senior rate\b/i,
      /\bdoes not offer\b.{0,25}\b(?:a )?(?:specific|dedicated|standard|standing)\b.{0,20}\bsenior\b.{0,20}\b(?:discount|rate|fare)\b/i,
      /\bes gibt\b.{0,20}\bkeinen?\b.{0,35}\b(?:spezifischen|dauerhaften|offiziellen)?\b.{0,20}\bseniorenrabatt\b/i,
      /\bkeine?\b.{0,35}\b(?:seniorenrabatt|rabatt\w*\b.{0,10}f[uü]r\b.{0,10}senior\w*)\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux seniors\b/i,
      /\bpas de tarif senior\b/i,
      /\baucune?\b.{0,35}\br[ée]duction\b.{0,20}\bsenior\b/i,
      /\bno hay información específica que indique\b.{0,40}\bdescuentos?\b.{0,20}\b(?:para )?(?:personas mayores|adultos mayores)\b/i,
      /\bno hay\b.{0,35}\b(?:informaci[oó]n|descuento)\b.{0,25}\b(?:para )?(?:personas mayores|adultos mayores)\b/i,
      /\bsenior\b.{0,20}\b(?:combi deal|bundle|paket|package)\b.{0,35}\b(?:for|f[uü]r)\b.{0,20}\b(?:older )?(?:horses?|dogs?|pets?|pferde|hunde|tiere)\b/i,
      /\b(?:older|senior)\b.{0,20}\b(?:horses?|dogs?|pets?|pferde|hunde|tiere)\b.{0,35}\b(?:discount|deal|bundle|combi)\b/i,
      /\bsenior\b.{0,25}\b(?:horses?|dogs?|pets?|pferde|hunde|tiere)\b.{0,70}\brather than\b.{0,25}\b(?:a )?(?:senior|customer)\b.{0,20}\bdiscount\b/i,
      /\bsenior(?:-kombi| combi)\b.{0,25}(?:angebote|deal\w*)\b.{0,40}(?:pferde|hunde|tiere)\b/i,
    ],
  },
  student: {
    positive: [
      /\b(?:student|studenten|studentenkorting|estudiante|uczni\w*|학생)\b.{0,35}\b(?:discount|offer|rabat|zniżk|korting|voordeel|할인)\b/i,
      /\b(?:korting|voordeel)\b.{0,35}\b(?:voor )?studenten\b/i,
      /\b(?:r[ée]duction|offre|tarif|remise)\b.{0,35}\b[ée]tudiant\w*\b/i,
      /\b[ée]tudiant\w*\b.{0,35}\b(?:r[ée]duction|offre|tarif|remise)\b/i,
      /\b(?:unidays|student beans)\b.{0,45}\b(?:r[ée]duction|code|offre)\b/i,
      /\b(?:r[ée]duction|code|offre)\b.{0,45}\b(?:unidays|student beans)\b/i,
      /\b(?:unidays|student beans)\b.{0,45}\b(?:12\s*%|10\s*%)\b/i,
    ],
    negative: [
      /\bno\b.{0,25}\b(?:student|student discount)\b/i,
      /\bno\b.{0,25}\b(?:official|public|specific)\b.{0,20}\bstudent\b.{0,20}\b(?:discount|offer)\b/i,
      /\bkeinen?\b.{0,30}\b(?:spezifischen|offiziellen|öffentlich bekannten)\b.{0,20}\bstudentenrabatt\b/i,
      /\bes gibt\b.{0,25}\bkeinen?\b.{0,35}\b(?:spezifischen|offiziellen|öffentlich bekannten)\b.{0,20}\bstudentenrabatt\b/i,
      /es gibt derzeit keinen spezifischen,\s*öffentlich bekannten studentenrabatt/i,
      /\bgeen\b.{0,30}\b(?:structurele|vaste|publieke|specifieke)?\b.{0,20}\bstudentenkorting\b/i,
      /\bgeen\b.{0,35}\b(?:offici[eë]le|publieke)\b.{0,20}\bstudentenkorting\b/i,
      /\bvergelijkbaar met studentenkortingen\b/i,
      /\bvergelijkbaar zijn met studentenkortingen\b/i,
      /\bgeen speciale studentenkortingen via bekende platforms gevonden\b/i,
      /\b(?:ne propose pas|aucune?|ne mentionne pas explicitement)\b.{0,35}\b(?:de )?(?:r[ée]duction|offre|tarif)\b.{0,20}[ée]tudiant\w*\b/i,
      /\bpas d['’]?offre\b.{0,30}\b(?:de )?(?:r[ée]duction|offre|tarif)\b.{0,25}\bsp[ée]cifiquement d[ée]di[ée]e aux [ée]tudiant\w*\b/i,
      /\baucune?\b.{0,30}\boffre [ée]tudiant\w*\b.{0,25}\bsp[ée]cifique\b.{0,25}\bactuellement mentionn\w*\b/i,
      /\bpas d['’]?offre [ée]tudiant\w*\b.{0,25}\bsp[ée]cifique\b.{0,25}\bexplicitement mentionn\w*\b/i,
      /\bil n['’]?y a pas d['’]?offre [ée]tudiant\w*\b.{0,25}\bsp[ée]cifique\b.{0,25}\bactuellement mentionn\w*\b/i,
      /\bpas de r[ée]duction\b.{0,25}[ée]tudiant\w*\b/i,
      /\baucune?\b.{0,35}\br[ée]duction\b.{0,20}[ée]tudiant\w*\b/i,
      /\bil n'?existe pas d'?information sp[ée]cifique confirmant\b.{0,35}\b(?:une )?r[ée]duction [ée]tudiant/i,
      /\bil n['’]y a pas d['’]information sp[ée]cifique confirmant\b.{0,35}\b(?:une )?r[ée]duction [ée]tudiant/i,
      /\bne propose pas de r[ée]duction sp[ée]cifiquement d[ée]di[ée]e aux [ée]tudiants\b/i,
      /\bne propose pas explicitement de r[ée]duction [ée]tudiant\b/i,
      /\bil n['’]est pas explicitement mentionn[ée]?\b.{0,35}\b(?:de )?r[ée]duction [ée]tudiant/i,
      /\bprix discount\b.{0,35}\bplut[oô]t qu['’]une r[ée]duction [ée]tudiant\b/i,
      /\bpas de partenariat [ée]tudiant\b/i,
      /\bne figure pas dans les programmes de r[ée]duction [ée]tudiants\b/i,
      /\bil n'?y a pas d'?indication claire\b.{0,25}\br[ée]duction [ée]tudiant\b/i,
      /\bil n'?est pas explicitement mentionn[ée]?\b.{0,35}\br[ée]duction [ée]tudiant\b/i,
      /\bno hay\b.{0,35}\b(?:informaci[oó]n|confirmaci[oó]n)\b.{0,25}\b(?:que confirme|de)\b.{0,25}\bdescuentos?\b.{0,20}\bpara estudiantes\b/i,
      /\bno hay informaci[oó]n espec[ií]fica\b.{0,35}\bque confirme\b.{0,25}\bdescuentos?\b.{0,20}\bpara estudiantes\b/i,
      /no hay informaci[oó]n espec[ií]fica que confirme descuentos para estudiantes/i,
      /不提供官方的学生折扣/,
      /没有明确公开针对学生的专属折扣/,
    ],
  },
  teacher: {
    explicitTerms: [/\bteacher(?:s)?\b/i, /\beducator(?:s)?\b/i, /\blehrer(?:rabatt)?\b/i, /\bnauczyciel\w*\b/i, /\b교사\b/, /\bleraren?\b/i, /\bdocenten?\b/i, /\bonderwijspersoneel\b/i, /\benseignant(?:s)?\b/i, /\bprofesseur(?:s)?\b/i, /\bpersonnel enseignant\b/i],
    positive: [
      /\b(?:teacher|educator|lehrer(?:rabatt)?|nauczyciel\w*|교사|leraren?|docenten?|onderwijspersoneel)\b.{0,35}\b(?:discount|offer|benefit|rabat|zniżk|할인|korting|voordeel)\b/i,
      /\b(?:discount|offer|benefit|rabat|zniżk|할인|korting|voordeel)\b.{0,35}\b(?:for )?(?:teachers?|educators?|교사|leraren?|docenten?|onderwijspersoneel)\b/i,
      /\b(?:enseignants?|professeurs?|personnel enseignant)\b.{0,35}\b(?:r[ée]duction|offre|avantage|tarif)\b/i,
      /\b(?:r[ée]duction|offre|avantage|tarif)\b.{0,35}\b(?:pour )?(?:les )?(?:enseignants?|professeurs?|personnel enseignant)\b/i,
    ],
    negative: [
      /\bno\b.{0,25}\b(?:teacher|teacher discount)\b/i,
      /\bgeen\b.{0,35}\b(?:specifieke|structurele)?\b.{0,20}\bkorting\b.{0,20}\b(?:voor )?(?:leraren?|docenten?|onderwijspersoneel)\b/i,
      /\bbiedt\b.{0,35}\bgeen\b.{0,20}\bspeciale\b.{0,20}\bkortingen\b.{0,20}\bvoor\b.{0,20}\bleraren\b/i,
      /\bdoes not\b.{0,25}\b(?:advertise|offer|list|provide)\b.{0,20}\b(?:a )?(?:dedicated|specific|official)\b.{0,20}\b(?:teacher|educator)\b.{0,20}\b(?:discount|offer|program)\b/i,
      /\b(?:teacher|educator)\b.{0,30}\bdiscount\b.{0,30}\bnot listed\b/i,
      /\bno\b.{0,35}\b(?:specific|official|dedicated)\b.{0,20}\b(?:teacher|educator)\b.{0,20}\b(?:discount|offer|program)\b/i,
      /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux enseignants\b/i,
      /\bil n['’]existe pas de r[ée]duction sp[ée]cifique mentionn[ée]e pour les enseignants\b/i,
      /\bpas de r[ée]duction(?: sp[ée]cifique)? pour les enseignants\b/i,
      /\bkeinen?\b.{0,35}\b(?:spezifischen|offiziellen|[oö]ffentlich ausgewiesenen)\b.{0,20}\blehrerrabatt\b/i,
      /\bbietet\b.{0,35}\bkeine?\b.{0,20}\bspeziellen?\b.{0,20}\brabattprogramme?\b.{0,20}\bf[uü]r\b.{0,20}\bbildungspersonal\b/i,
    ],
  },
  aaa: {
    positive: [
      /\baaa\b.{0,25}\b(?:discount|member|offer|rate)\b/i,
      /\baaa dollars?\b.{0,25}\b(?:cashback|reward|rebate)\b/i,
      /AAA.{0,24}(?:返现|奖励|合作关系)/,
    ],
    negative: [
      /\bno\b.{0,25}\baaa\b.{0,15}\b(?:discount|offer)\b/i,
      /\bno\b.{0,35}\b(?:evidence|information)\b.{0,20}\baaa\b.{0,20}\b(?:discount|offer)\b/i,
      /\bdoes not offer\b.{0,25}\baaa\b.{0,20}\b(?:discount|benefit)\b/i,
      /\bnot\b.{0,20}\baaa\b.{0,20}\b(?:partner|participating merchant|affiliate)\b/i,
      /\bnie znaleziono żadnych dowodów\b.{0,40}\b(?:zniżk\w* )?aaa\b/i,
      /\b직접적인 정보는 .*aaa.*확인되지 않았습니다\b/i,
      /공식 온라인몰에서는 AAA 할인 혜택을 받을 수 없습니다/,
    ],
  },
  nhs: {
    positive: [/\b(?:nhs|healthcare worker|health service discounts?)\b.{0,35}\b(?:discount|offer|benefit|card|code)\b/i],
    negative: [/\bno\b.{0,25}\bnhs\b.{0,15}\b(?:discount|offer)\b/i],
  },
  "blue light card": {
    positive: [
      /\bblue light(?: card)?\b.{0,25}\b(?:discount|offer|benefit|code)\b/i,
      /\b(?:discount|offer|benefit|code)\b.{0,25}\bblue light(?: card)?\b/i,
      /Blue Light Card.{0,20}(?:할인|혜택)/,
    ],
    negative: [
      /\bno\b.{0,25}\bblue light(?: card)?\b.{0,15}\b(?:discount|offer)\b/i,
      /\bno\b.{0,35}\b(?:evidence|information)\b.{0,20}\b(?:that|showing)\b.{0,20}\b.*blue light(?: card)?/i,
      /\bno hay\b.{0,35}\bevidencia\b.{0,20}\bdirecta\b.{0,20}\b(?:de )?(?:que )?.*blue light card/i,
      /\bdoes not\b.{0,25}\b(?:directly )?(?:support|accept|offer)\b.{0,25}\bblue light(?: card)?\b/i,
      /\b공식적으로\b.{0,30}\bblue light card\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b(?:없|않)\S*/i,
      /제공한다는 정보는 없습니다/,
      /할인을 제공한다는 정보는 없습니다/,
      /并未提供针对 Blue Light Card 的专属折扣/,
      /目前并不直接支持 Blue Light Card/,
    ],
    ignore: [
      /\bblue light card\b.{0,40}\b(?:usually|mainly|typically)\b.{0,40}\bfor\b.{0,30}\b(?:uk|nhs|emergency|public service)\b/i,
      /\bif you are looking for\b.{0,30}\bblue light card\b/i,
      /\byou can consider other brands\b.{0,40}\bblue light card\b/i,
    ],
  },
  clearance: {
    positive: [
      /\b(?:clearance|outlet|sale section|final sale|rebajas?|wyprzeda[żz]|아울렛)\b.{0,25}\b(?:discount|offer|up to|sale|rabat|zniżk|할인)\b/i,
      /\bsale-?sectie\b.{0,35}\b(?:afgeprijsde artikelen|aanbiedingen|korting)\b/i,
      /\bregelmaat\b.{0,35}\bafgeprijsde artikelen\b/i,
      /\bproducten\b.{0,25}\bmet korting\b.{0,25}\baangeboden\b/i,
      /\buitverkoopacties?\b/i,
      /\bsale-pagina\b/i,
      /\bafgeprijsde artikelen\b/i,
      /\bspeciale aanbiedingen\b/i,
      /\bwisselend assortiment\b.{0,35}\bproducten met korting\b/i,
      /\b(?:d[ée]stockage|fin de s[ée]rie|outlet|soldes?)\b.{0,35}\b(?:r[ée]duction|promotion|remise|jusqu['’]?[àa])\b/i,
      /\bsection\b.{0,25}\b(?:outlet|d[ée]stockage|soldes?)\b/i,
    ],
    negative: [/\bno\b.{0,25}\b(?:clearance|outlet|sale section)\b/i, /\bno se menciona expl[ií]citamente\b.{0,35}\b(?:outlet|liquidaci[oó]n)\b/i, /\bno dispone de\b.{0,35}\b(?:una )?(?:secci[oó]n )?(?:outlet|liquidaci[oó]n)\b/i, /\bpas d['’]outlet permanent\b/i, /\bne dispose pas de section d[ée]stockage\b/i],
  },
};

const MILITARY_FALSE_POSITIVE_PATTERNS = [
  /\bmilitary green\b/i,
  /军事绿/,
  /产品色号/,
  /颜色名/,
];

const MILITARY_HARD_NEGATIVE_PATTERNS = [
  /\bgeen\b.{0,30}\b(?:specifieke|structurele|offici[eë]le)\b.{0,20}\bkortingsregeling\b.{0,20}\bvoor\b.{0,20}\bmilitair\w*\b/i,
  /\bblijkt niet\b.{0,35}\b(?:dat|of)\b.{0,20}.*\bmilitair\w*\b.{0,20}\bkorting\b/i,
  /\bgeen\b.{0,30}\bmilitaire korting\b/i,
  /\bkeinen?\b.{0,20}\bdirekten hinweis\b.{0,35}\bmilit[aä]rrabatt\b/i,
  /\bkeine?\b.{0,25}\b(?:einheitlichen?|nationalen?)\b.{0,20}\bmilit[aä]r\w*\b.{0,20}\brabatt\w*\b/i,
  /\bdoes not currently offer a dedicated military discount or promotional program\b/i,
  /\bdoes not\b.{0,25}\bhave\b.{0,20}\b(?:a )?(?:specific|standing|dedicated)\b.{0,20}\bmilitary\b.{0,20}\bdiscount\b/i,
  /\bdoes not currently offer\b.{0,25}\b(?:a )?dedicated\b.{0,20}\bmilitary\b.{0,20}\bdiscount\b/i,
  /\bdoes not\b.{0,25}\bspecifically list\b.{0,20}\b(?:a )?(?:year-?round|standing|dedicated|specific)?\b.{0,20}\bmilitary\b.{0,20}\bdiscount\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux militaires\b/i,
  /\bil n['’]existe pas de r[ée]duction sp[ée]cifique mentionn[ée]e pour les militaires\b/i,
  /\bpas de r[ée]duction\b.{0,25}\bsp[ée]cifique\b.{0,20}\b(?:pour )?(?:les )?militaires\b/i,
  /\bno\b.{0,25}\b(?:specific|standing|year-?round|dedicated)\b.{0,20}\bmilitary\b.{0,20}\bdiscount\b/i,
  /\bdoes not\b.{0,25}\boffer\b.{0,20}\b(?:a )?(?:standing|year-?round|dedicated)\b.{0,20}\bmilitary\b.{0,20}\bdiscount\b/i,
  /\bno\b.{0,30}\b(?:public|official|direct)\b.{0,20}\bevidence\b.{0,30}\bmilitary\b.{0,20}\bdiscount\b/i,
  /没有公开信息表明.{0,40}(?:退伍军人|现役军人|军人|军事).{0,20}(?:折扣|优惠)/,
  /不提供常年性的军事折扣/,
  /并不提供专门的军事折扣/,
  /没有列出.{0,20}(?:统一的全国性|专门的).{0,20}(?:军事折扣|军人优惠)/,
  /没有明确列出针对军队人员的永久性固定折扣/,
  /没有直接提到.{0,20}面向个人的常规军事折扣/,
];

const MILITARY_AMBIGUOUS_ENTITY_PATTERNS = [
  /\bdie meisten online-shops?\b.{0,50}\b(?:milit[aä]r|bundeswehr)\b/i,
  /\bmost online shops?\b.{0,50}\bmilitary\b/i,
  /\bother (?:military|bundeswehr) shops?\b/i,
];

const REFERRAL_NON_CONSUMER_PATTERNS = [
  /\baffiliate program\b/i,
  /\baffiliate\b.{0,35}\b(?:program|commission|creators?|sponsors?)\b/i,
  /\bprograma de afiliados\b/i,
  /\bprograma de patrocinio\b/i,
  /\bpatrocinio\b.{0,35}\b(?:creadores?|afiliados|sponsors?)\b/i,
  /\bcommission\b/i,
  /\bcreator\w*\b/i,
  /\bblogger\w*\b/i,
  /\bcontent creator\w*\b/i,
  /\bb2b\b/i,
  /\bmember-?get-?member\b/i,
  /\bretail refer-a-friend discount\b/i,
  /\bmitglieder\b.{0,30}\bneue mitglieder werben\b/i,
  /\bmitgliedschaft\b.{0,30}\bverschenken\b/i,
  /\bno longer offers a general friend referral program\b/i,
  /\bended in many markets\b/i,
  /\bnot (?:a )?(?:standard|normal|public|consumer)\b.{0,20}\breferral\b/i,
  /\bprogramme d['’]affiliation\b/i,
  /\bportail affili[ée]\b/i,
  /\bcr[ée]ateurs? de contenu\b/i,
  /\binfluenceurs?\b/i,
  /\bpercevoir des commissions\b/i,
  /\bprogramme (?:ambassadeur|partenariat)\b/i,
  /联盟营销计划/,
  /普通消费者/,
  /并非针对所有普通消费者的标准内推福利/,
];

const REFERRAL_HARD_NEGATIVE_PATTERNS = [
  /\bdoes not\b.{0,25}\b(?:provide|offer|have)\b.{0,25}\b(?:a )?(?:standard|formal|public|consumer)?\b.{0,20}\brefer-a-friend\b.{0,20}\b(?:discount|program|offer)\b/i,
  /\bdoes not\b.{0,25}\b(?:provide|offer)\b.{0,25}\b(?:a )?(?:formal|standard|public|consumer)\b.{0,20}\b(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:discount|program|offer)\b/i,
  /\bno\b.{0,25}\bformal\b.{0,20}\b(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:program|offer)\b/i,
  /\bno\b.{0,25}\b(?:direct|public)\b.{0,20}\bevidence\b.{0,20}\b(?:of|for)\b.{0,20}\b(?:a )?(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:discount|program|offer)\b/i,
  /\bno\b.{0,25}\b(?:public|consumer)\b.{0,20}\b(?:refer(?:-a-friend)?|referral)\b.{0,20}\b(?:program|offer)\b/i,
  /\bno\b.{0,25}\bdirect\b.{0,20}\bevidence\b.{0,25}\b(?:regular|normal)\b.{0,20}\b(?:friend referral|referral)\b.{0,20}\bprogram\b/i,
  /\bpas de programme de parrainage\b/i,
  /\bne propose pas de r[ée]duction de parrainage\b/i,
  /\baucune?\b.{0,35}\boffre de parrainage\b/i,
  /\bne semble pas proposer de programme de parrainage client classique\b/i,
  /\bil n['’]est pas fait mention explicite d['’]un programme de parrainage classique\b/i,
  /\bprogramme d['’]affiliation\b.{0,45}\bplut[oô]t qu['’]un programme de parrainage client\b/i,
  /\best actuellement d[ée]sactiv[ée]\b.{0,30}\b(?:programme d['’]affiliation|programme de parrainage)\b/i,
  /\b별도의\b.{0,20}\b친구 추천\b.{0,20}\b(?:할인|혜택)\b.{0,12}\b명시되어 있지 않\S*/i,
  /目前没有直接证据表明.{0,20}(?:常规|正式|普通消费者).{0,20}(?:好友推荐|推荐折扣|推荐计划)/,
  /不提供正式的.{0,20}(?:推荐好友|推荐折扣|推荐计划|Referral Discount)/,
  /并未提供针对普通消费者的.{0,20}(?:推荐折扣|推荐计划|Referral Discount)/,
];

const NEWSLETTER_STRONG_POSITIVE_PATTERNS = [
  /\bnewsletter\b.{0,35}\b(?:discount code|welcome discount|10% off|15% off|free delivery)\b/i,
  /\bsign(?:ing)? up\b.{0,35}\b(?:discount code|welcome discount|10% off|15% off|free delivery)\b/i,
  /\bnew subscribers?\b.{0,35}\b(?:10% off|15% off|discount code|welcome discount|free delivery)\b/i,
  /\bfirst order\b.{0,35}\b(?:discount code|welcome discount|10% off|15% off)\b/i,
  /\bnieuwsbrief\b.{0,35}\b(?:korting|welkomstkorting|aanbieding|actie(?:code)?|kortingscode)\b/i,
  /\b(?:schrijf je in|inschrijven|aanmelden)\b.{0,35}\b(?:nieuwsbrief|mail(?:ing)?lijst)\b.{0,35}\b(?:korting|welkomstkorting|code)\b/i,
  /\b(?:newsletter|inscription|inscrivez-vous|abonnez-vous)\b.{0,35}\b(?:r[ée]duction|offre|code promo|remise|avantage)\b/i,
  /\boffre de bienvenue\b/i,
  /(?:新订阅者|新用户).{0,24}(?:首单优惠|首单折扣|折扣代码|欢迎优惠|欢迎邮件)/,
  /(?:订阅电子邮件|注册电子邮件|邮件订阅).{0,24}(?:首单|折扣码|优惠码|欢迎邮件)/,
];

const NEWSLETTER_CONTRAST_PATTERNS = [
  /\bdoes not explicitly offer a standard\b/i,
  /\bdoes not explicitly offer\b.{0,25}\b(?:a )?(?:standard )?(?:first order|sign-up)\b/i,
  /\bnot explicitly offer\b/i,
];

const FIRST_RESPONDER_AMBIGUOUS_ENTITY_PATTERNS = [
  /\bother\b.{0,20}"?[^"]*midnight/i,
  /\bif you are referring to other brands\b/i,
  /\bpolicies vary\b/i,
  /\bMammoth Mountain\b/i,
  /\bnot zwingend auf\b.{0,25}\bMammoth Bikes\b/i,
  /如果您是指其他.*品牌/,
  /为了给您最准确的信息/,
];

const SHIPPING_AMBIGUOUS_ENTITY_PATTERNS = [
  /\bif you are referring to (?:a )?(?:similarly named|different) company\b/i,
  /\ba different entity\b/i,
  /\brelated brands with free delivery\b/i,
  /\bif you are looking for\b.{0,40}\bfree delivery options\b/i,
  /\bholiday cottage rentals\b/i,
  /\btheir primary service is property booking\b/i,
];

const SHIPPING_SELLER_DEPENDENT_PATTERNS = [
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,45}\bafhankelijk van\b.{0,25}\b(?:de )?(?:verkoper|aanbieding)\b/i,
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,45}\bhangt af van\b.{0,25}\b(?:de )?(?:verkoper|aanbieding)\b/i,
  /\b(?:gratis|free) (?:shipping|delivery)\b.{0,45}\bdepends on\b.{0,25}\b(?:the )?(?:seller|listing)\b/i,
];

const SHIPPING_INFERENCE_ONLY_PATTERNS = [
  /\bdoes not detail explicitly\b/i,
  /\best(?:e|á)\b.{0,20}\bun est[aá]ndar com[uú]n\b/i,
  /\btracking\b.{0,25}\bis standard\b/i,
  /\bsuelen realizarse\b/i,
  /\bpart of specific promotions or past incentives\b/i,
  /\bmeestal\b.{0,25}\bvia\b.{0,20}\b(?:codes?|acties|promoties)\b/i,
  /\bg[eé]n[eé]ralement\b.{0,25}\bvia\b.{0,20}\b(?:codes?|offres ponctuelles|promotions)\b/i,
];

const SHIPPING_HARD_NEGATIVE_PATTERNS = [
  /\bdoes not\b.{0,25}\b(?:currently )?offer\b.{0,20}\bfree (?:shipping|delivery)\b/i,
  /\bno\b.{0,25}\b(?:standing|standard|regular|current)\b.{0,20}\bfree (?:shipping|delivery)\b/i,
  /\bfree (?:shipping|delivery)\b.{0,50}\b(?:only )?(?:through|via)\b.{0,25}\b(?:third-?party|marketplaces?|retailers?)\b/i,
  /\boccasional\b.{0,20}\bfree (?:shipping|delivery)\b.{0,35}\b(?:promotion|promotions|campaigns?)\b.{0,35}\b(?:rather than|not)\b.{0,20}\b(?:a )?(?:standard|regular|standing)\b/i,
  /\bgeen standaard gratis (?:verzending|bezorging|levering)\b/i,
  /\bgeen fysieke (?:producten|verzending|levering)\b/i,
  /\bdigitale tickets?\b.{0,35}\bgeen\b.{0,20}\b(?:fysieke )?(?:verzending|levering)\b/i,
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,45}\bniet van toepassing\b/i,
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,40}\b(?:alleen|soms|via)\b.{0,20}\b(?:acties|promoties|codes?)\b/i,
  /\bpas de livraison gratuite\b.{0,40}\b(?:standard|g[ée]n[ée]rale|hors promotion)\b/i,
  /\blivraison gratuite\b.{0,50}\b(?:principalement|uniquement|parfois)\b.{0,25}\b(?:via|gr[aâ]ce [àa]|avec)\b.{0,20}\b(?:codes?|promotions|offres ponctuelles)\b/i,
  /\bfrais de port standards?\b.{0,40}\b(?:plut[oô]t que|et non)\b.{0,25}\b(?:une )?livraison gratuite\b/i,
  /\bplutot qu['’]?une livraison gratuite\b/i,
  /\bnon mentionn[ée]e?\b.{0,30}\bcomme syst[eé]matique\b/i,
  /\bne mentionne pas\b.{0,35}\b(?:de )?livraison gratuite\b/i,
];

const SHIPPING_LIMITED_POSITIVE_PATTERNS = [
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,45}\balleen\b.{0,25}\b(?:bij|voor)\b.{0,30}\b(?:afhalen|afhaalpunt|filiaal|vestiging)\b/i,
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,55}\b(?:geselecteerde|specifieke)\s+producten\b/i,
  /\b(?:gratis|kosteloze) (?:verzending|bezorging|levering)\b.{0,55}\bactieproducten\b/i,
  /\bvoor thuisbezorging\b.{0,35}\b(?:gelden|zijn er)\b.{0,20}\b(?:wel )?(?:bezorgkosten|verzendkosten)\b/i,
  /\bgratis levering\b.{0,45}\balleen\b.{0,30}\bafhaalpunten\b/i,
];

const CROSS_ENTITY_CONTRAST_PATTERNS = [
  /\bother brands?\b/i,
  /\balternative brands?\b/i,
  /\bother retailers?\b/i,
  /\bother merchants?\b/i,
  /\bretail partners?\b/i,
  /\bauthorized retailers?\b/i,
  /\bthird-?party (?:dental )?retailers?\b/i,
  /\bunrelated brands?\b/i,
  /\bother companies\b/i,
  /\bseparate company\b/i,
  /\bseparate entities\b/i,
  /\bshould not be confused with\b/i,
  /\bthere are two distinct entities\b/i,
  /\bthere are two distinct entities mentioned\b/i,
  /\bcomparison with other brands\b/i,
  /\bif you are looking specifically for\b/i,
  /\bif you are referring to\b/i,
  /\bwhile .* other brands?\b/i,
  /\bOctopus Energy\b/i,
  /\bother .* may offer\b/i,
];

const CROSS_ENTITY_SENSITIVE_FACT_TYPES = new Set([
  "app",
  "birthday",
  "employee",
  "existing customer",
  "first responder",
  "military",
  "price guarantee",
  "referral",
]);

const CROSS_ENTITY_UNKNOWN_FACT_TYPES = new Set([
  "existing customer",
  "price guarantee",
  "referral",
  "first responder",
  "military",
  "employee",
]);

const TEACHER_PLATFORM_AMBIGUOUS_PATTERNS = [
  /\bit is (?:best|recommended) to check\b.{0,40}\b(?:official|teacher discount|partner)\b/i,
  /\bcheck\b.{0,30}\b(?:official homepage|official website|teacher discount page|partner|discount site)\b/i,
  /\bil est recommand[ée] de v[ée]rifier\b.{0,40}\b(?:site officiel|page partenaire|plateforme enseignante)\b/i,
  /\bv[ée]rifiez\b.{0,30}\b(?:sur )?(?:unidays|student beans|id\.?me|programme partenaire)\b/i,
  /\bmay sometimes list\b/i,
  /\bsometimes include\b.{0,30}\beducation\b/i,
  /第三方教师折扣平台/,
  /专门的教育折扣网站/,
  /공식 홈페이지.*Teacher Discount.*확인/,
  /제휴 할인 사이트/,
];

const TEACHER_HARD_NEGATIVE_PATTERNS = [
  /\bdoes not currently offer\b.{0,30}\b(?:a )?(?:specific|dedicated)\b.{0,20}\b(?:teacher|educator)\b.{0,20}\b(?:discount|program)\b/i,
  /\bdoes not have\b.{0,25}\b(?:a )?(?:dedicated|specific)\b.{0,20}\bteaching profession\b.{0,20}\bdiscount program\b/i,
  /\bno official direct\b.{0,20}\bteacher\b.{0,20}\bdiscount\b/i,
  /\bno\b.{0,35}\b(?:specific|public|official)\b.{0,20}\bteacher\b.{0,20}\bdiscount\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux enseignants\b/i,
  /\bil n['’]existe pas de r[ée]duction sp[ée]cifique mentionn[ée]e pour les enseignants\b/i,
  /\bpas de r[ée]duction\b.{0,25}\b(?:sp[ée]cifique )?(?:pour )?(?:les )?enseignants\b/i,
  /\bnie prowadzi\b.{0,45}\b(?:sta[łl]ej|publicznie og[łl]oszonej)\b.{0,35}\bzni[żz]ki\b.{0,25}\bdla nauczyciel\w*\b/i,
  /\bkeinen?\b.{0,35}\b(?:spezifischen|offiziellen|[oö]ffentlich ausgewiesenen)\b.{0,20}\blehrerrabatt\b/i,
  /\bkeine?\b.{0,35}\bspeziellen?\b.{0,20}\brabattprogramme?\b.{0,20}\bf[uü]r\b.{0,20}\bbildungspersonal\b/i,
];

const TEACHER_CROSS_ENTITY_PATTERNS = [
  /\balternative\b.{0,30}\bbrands?\b.{0,30}\bteacher discounts?\b/i,
  /\bother brands?\b.{0,30}\bconfirmed programs?\b/i,
  /\bif you are looking for\b.{0,40}\bteacher discount\b/i,
];

const CHILD_AMBIGUOUS_ENTITY_PATTERNS = [
  /\bit is unclear what\b/i,
  /\bcould you please provide more context\b/i,
  /\bplease specify if you are asking about\b/i,
  /\bcould be a flight number\b/i,
  /\ba bus route\b/i,
  /\ba specific product\b/i,
];

const CHILD_NON_DISCOUNT_CONTEXT_PATTERNS = [
  /\bp[aä]nzclub\b/i,
  /\brubrik\b.{0,20}\bkinder\b/i,
  /\bsale-?kategorie\b/i,
  /\bkind(?:er)?\b.{0,20}\bprodukte?\b/i,
  /\bkids? section\b/i,
  /\bchildren'?s section\b/i,
];

const CHILD_HARD_NEGATIVE_PATTERNS = [
  /\bgeen\b.{0,25}\bkortingen\b.{0,20}\bvoor kinderen\b/i,
  /\buitsluitend\b.{0,25}\bzakelijke\b.{0,20}\b(?:tank- en laadpassen|mobiliteit)\b/i,
  /\bgeen consumentenproduct\b/i,
  /\bgeneral member discount\b.{0,25}\brather than\b.{0,25}\ba child-?specific discount\b/i,
  /\bmember discount\b.{0,25}\bnot\b.{0,15}\ba child-?specific discount\b/i,
  /\bp[aä]nzclub\b.{0,40}\b(?:mitglieder-?rabatt|member discount)\b/i,
  /\bkids? section\b.{0,40}\bno dedicated child discount\b/i,
  /\bsale category\b.{0,40}\bno dedicated child discount\b/i,
  /\bdoes not\b.{0,25}\bprovide\b.{0,20}\b(?:a )?child-?specific discount\b/i,
  /\bnot\b.{0,15}\ba child-?specific discount\b/i,
  /\bdoes not\b.{0,25}\b(?:directly )?offer\b.{0,20}\ba\b.{0,20}\bpermanent\b.{0,20}\bchild\b.{0,20}\bdiscount\b/i,
  /\bpas de r[ée]duction\b.{0,25}\b(?:sp[ée]cifique )?pour\b.{0,20}\bles enfants\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique pour les enfants\b/i,
  /\bkeinen?\b.{0,25}\bspeziellen?\b.{0,15}\bkinderrabatt\b/i,
  /不直接提供永久性的.{0,6}儿童折扣/,
  /并没有专门针对儿童的常设折扣/,
  /没有固定的学生或儿童折扣/,
  /无需为每个孩子单独付费/,
];

const CHILD_STRONG_POSITIVE_PATTERNS = [
  /\bkinderen\b.{0,25}\b(?:krijgen|ontvangen)\b.{0,20}\b(?:maar liefst )?\d{1,3}\s*%\s*korting\b/i,
  /\bkinderen van\b.{0,25}\b\d{1,2}\b.{0,20}\bt\/m\b.{0,20}\b\d{1,2}\b.{0,20}\b(?:jaar )?krijgen\b.{0,20}\d{1,3}\s*%\s*korting\b/i,
  /\b(?:baby'?s|kinderen t\/m 2 jaar)\b.{0,35}\b(?:laag tarief|speciaal tarief)\b/i,
  /\b(?:enfants?|b[ée]b[ée]s?)\b.{0,40}\b(?:b[ée]n[ée]ficient de|ont droit [àa]|profitent de)\b.{0,20}\b(?:tarifs? r[ée]duits?|gratuit[ée]?|r[ée]duction)\b/i,
  /\btarif(?:s)? enfant\b/i,
  /\bbillet(?:s)? enfant\b/i,
  /\bu21-?ticket\b/i,
  /\bkinderpreise?\b/i,
  /\bchildren and youth under 21\b.{0,30}\b(?:ticket|discount)\b/i,
  /\bkinder und jugendliche\b.{0,35}\bu21-?ticket\b/i,
];

const AAA_HARD_NEGATIVE_PATTERNS = [
  /\bno\b.{0,35}\b(?:menciona|indica|ofrece|hay indicios|hay evidencia|hay informaci[oó]n)\b.{0,45}\b(?:descuentos? )?(?:para )?(?:miembros? )?(?:de )?aaa\b/i,
  /\bno\b.{0,35}\b(?:descuento|beneficio)\b.{0,25}\baaa\b/i,
  /\bgeen\b.{0,35}\b(?:aaa|anwb)\b.{0,25}\b(?:korting|voordeel)\b/i,
  /\bkeine?\b.{0,35}\baaa\b.{0,25}\b(?:rabatt|vorteil)\b/i,
  /\b(?:ne mentionne pas|aucune?|pas de)\b.{0,45}\b(?:r[ée]duction|avantage)\b.{0,25}\baaa\b/i,
  /\bnie znaleziono żadnych dowodów\b.{0,45}\baaa\b/i,
  /\bbezpośrednich informacji\b.{0,45}\baaa\b/i,
  /\bnie\b.{0,35}\b(?:oferuje|wskazuje|informuje|akceptuje)\b.{0,45}\baaa\b/i,
  /\bbrak\b.{0,35}\b(?:informacji|potwierdzenia|dowod[oó]w)\b.{0,45}\baaa\b/i,
  /\b공식 온라인몰에서는 AAA 할인 혜택을 받을 수 없습니다\b/i,
  /\b직접적인 정보는 .*aaa.*확인되지 않았습니다\b/i,
  /\baaa\b.{0,30}(?:할인|혜택)\b.{0,20}(?:없|않|확인되지)/i,
  /(?:没有|未|并未).{0,35}AAA.{0,20}(?:折扣|优惠|会员)/i,
  /\bdoes not offer\b.{0,25}\baaa\b.{0,20}\b(?:discount|benefit)\b/i,
  /\bnot\b.{0,20}\baaa\b.{0,20}\b(?:partner|participating merchant|affiliate)\b/i,
];

const EXISTING_CUSTOMER_HARD_POSITIVE_PATTERNS = [
  /\brenewal offers?\b/i,
  /\bview renewal offers?\b/i,
  /\bexisting subscribers?\b.{0,35}\b(?:apply|receive|get|use)\b.{0,20}\b(?:discount|promo code|savings)\b/i,
  /\bcurrent members?\b.{0,35}\b(?:receive|get|unlock)\b.{0,20}\b(?:discount|benefit|offer)\b/i,
  /\bclients? existants?\b.{0,35}\b(?:peuvent )?(?:profiter de|recevoir|obtenir)\b.{0,25}\b(?:r[ée]ductions?|offres?|avantages?)\b/i,
  /\bclients? fid[èe]les\b.{0,35}\b(?:profiter de|recevoir|obtenir)\b.{0,25}\b(?:r[ée]ductions?|offres?|avantages?)\b/i,
  /\bvaste klanten(?:bestand)?\b.{0,35}\b(?:exclusieve )?(?:actiecodes?|kortingscodes?|aanbiedingen)\b/i,
  /\bbestaande klanten\b.{0,35}\b(?:kunnen )?(?:profiteren van|ontvangen|krijgen)\b.{0,25}\b(?:kortingen|actiecodes?|aanbiedingen)\b/i,
  /现有客户.{0,24}(?:折扣|优惠|续订优惠|专用)/,
  /现有订阅者.{0,24}(?:折扣|优惠|优惠码)/,
  /回头客.{0,24}(?:折扣|优惠|优惠码)/,
];

const EMPLOYEE_HARD_POSITIVE_PATTERNS = [
  /\bcoaches?\b.{0,25}\b(?:kunnen )?(?:tot )?\d{1,3}\s*%\s*korting\b/i,
  /\btrainers?\b.{0,25}\b(?:kunnen )?(?:tot )?\d{1,3}\s*%\s*korting\b/i,
  /\bcoachprogramma\b.{0,35}\b(?:korting|voordelen?)\b/i,
  /\b#teamyellow\b.{0,35}\bcoachprogramma\b/i,
];

const NEW_CUSTOMER_HARD_POSITIVE_PATTERNS = [
  /\bnieuwe klanten\b.{0,30}\b(?:kunnen )?(?:vaak )?kortingen\b.{0,20}\bkrijgen\b/i,
  /\bwelkomstkorting\b/i,
  /\binschrijving\b.{0,35}\bnieuwsbrief\b.{0,35}\b(?:welkomstkorting|kortingsvoucher|waardebon)\b/i,
  /\bnieuwe klanten\b.{0,35}\b(?:welkomstkorting|kortingsvoucher|waardebon)\b/i,
  /\boui,\b.{0,30}\b(?:nouveaux clients?|premi[èe]re commande)\b.{0,40}\b(?:r[ée]duction|offre de bienvenue|remise|code promo)\b/i,
  /\br[ée]duction de bienvenue\b.{0,35}\b(?:premi[èe]re commande|nouveaux clients?)\b/i,
];

const SENIOR_HARD_NEGATIVE_PATTERNS = [
  /\bblijkt niet\b.{0,25}\bdat er\b.{0,20}\b(?:een )?(?:specifieke|permanente)\b.{0,20}\bseniorenkorting\b.{0,20}\bis\b/i,
  /\bgeen\b.{0,30}\bspecifieke\b.{0,20}\bpermanente\b.{0,20}\bseniorenkorting\b/i,
  /\bkeinen?\b.{0,35}\b(?:spezifischen|dauerhaften|offiziellen)?\b.{0,20}\bseniorenrabatt\b/i,
  /\bno senior rate\b/i,
  /\bdoes not offer a specific senior discount\b/i,
  /\bno\b.{0,25}\b(?:specific|dedicated|public)\b.{0,20}\bsenior\b.{0,20}\b(?:discount|rate|fare|offer)\b/i,
  /\bno\b.{0,30}\b(?:direct|public)\b.{0,20}\bevidence\b.{0,25}\b(?:of|for)\b.{0,20}\b(?:a )?senior\b.{0,20}\b(?:discount|rate|fare|offer)\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux seniors\b/i,
  /\bpas de tarif senior\b/i,
  /\baucune?\b.{0,35}\br[ée]duction\b.{0,20}\bsenior\b/i,
  /\bkeinen?\b.{0,30}\bsenior(?:en)?\b.{0,20}\b(?:tarif|rabatt)\b/i,
  /\bbezeichnung\b.{0,25}\bsenior\b.{0,25}\bbezieht sich\b.{0,25}\b(?:auf )?(?:die )?gr[oö]sse\b/i,
  /\bsenior\b.{0,30}\brefers to\b.{0,20}\badult sizing\b/i,
  /\bnot a senior customer discount\b/i,
  /\bnicht\b.{0,20}\bum einen klassischen altersrabatt\b.{0,25}\bf[uü]r den k[aä]ufer\b/i,
  /\bolder\b.{0,20}\b(?:horses?|dogs?|pets?)\b.{0,35}\bnot for senior customers\b/i,
];

const EMPLOYEE_HARD_NEGATIVE_PATTERNS = [
  /\bgeen\b.{0,30}\bpublieke informatie\b.{0,20}\bbeschikbaar\b.{0,20}\bover\b.{0,20}\bspecifieke kortingen\b.{0,20}\bvoor\b.{0,20}\bmedewerkers\b/i,
  /\bgeen\b.{0,25}\b(?:specifieke )?(?:medewerkers|personeels)\w*\b.{0,20}\bkorting\b/i,
  /福利体系中.{0,30}并不包含.{0,20}(?:直接)?[“"]?员工折扣[”"]?/,
  /并没有针对.{0,30}(?:员工|内部员工).{0,20}(?:直接)?折扣/,
  /而非直接的(?:投注|产品|购物)折扣/,
  /\bdoes not currently offer\b.{0,25}\b(?:a )?(?:specific|standard)\b.{0,20}\b(?:employee|staff)\b.{0,20}\bdiscount\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique(?:ment)? d[ée]di[ée]e aux employ[ée]s\b/i,
  /\bpas d['’]avantage\b.{0,25}\br[ée]serv[ée]?\b.{0,20}\baux employ[ée]s\b/i,
  /\baucune?\b.{0,35}\br[ée]duction\b.{0,20}\bpour\b.{0,20}\bles? employ[ée]s\b/i,
  /\bno verified mention of a dedicated purchase discount\b.{0,25}\bfor\b.{0,25}\b(?:internal )?employees\b/i,
  /\bno direct information about\b.{0,40}\bemployee discount\b.{0,20}\bis included\b/i,
  /\bno formal employee discount\b/i,
  /\bthere is no verified mention of a dedicated purchase discount\b/i,
];

const EXISTING_CUSTOMER_AMBIGUOUS_PATTERNS = [
  /不提供传统意义上的[“"]?现有客户永久折扣[”"]?或正式的忠诚度计划/,
  /通过特定的参与式项目和定期促销活动为老客户提供/,
  /本身没有统一的[“"]?官方现有客户折扣[”"]?.{0,40}(?:在线)?零售商.{0,30}为回头客提供折扣/,
  /品牌本身没有统一的[“"]?官方现有客户折扣[”"]?.{0,40}(?:在线)?零售商.{0,30}(?:回头客|现有客户).{0,20}(?:折扣|优惠)/,
  /\bdoes not offer\b.{0,25}\b(?:a )?(?:traditional|permanent|formal)\b.{0,25}\b(?:existing customer|loyalty)\b.{0,20}\b(?:discount|program)\b/i,
  /\bthrough\b.{0,20}\b(?:specific|participatory)\b.{0,20}\bprojects?\b.{0,30}\bperiodic promotions\b/i,
  /\bonly\b.{0,20}\b(?:occasional|ad hoc)\b.{0,20}\bproject-?based\b.{0,20}\boffers?\b/i,
];

const EXISTING_CUSTOMER_HARD_NEGATIVE_PATTERNS = [
  /\bno\b.{0,35}\b(?:menciona|anuncia|detalla|ofrece|indica)\b.{0,55}\b(?:programas? de (?:descuento|fidelizaci[oó]n)|descuentos? (?:autom[aá]ticos?|fijos?|especiales?)|clientes existentes|clientes recurrentes)\b/i,
  /\bno hay\b.{0,45}\b(?:programa|descuento|beneficio)\b.{0,35}\b(?:fidelizaci[oó]n|clientes existentes|clientes recurrentes)\b/i,
  /\bsin mencionar expl[ií]citamente\b.{0,55}\b(?:descuento|programa|beneficio)\b.{0,35}\b(?:clientes existentes|clientes recurrentes|fidelizaci[oó]n)\b/i,
  /\bnie\b.{0,35}\b(?:posiada|promuje|reklamuje|informuje|ma)\b.{0,65}\b(?:program\w* lojalno[śs]ciow\w*|zni[żz]k\w* dla sta[łl]ych klient[oó]w|rabat\w* dla sta[łl]ych klient[oó]w)\b/i,
  /\bnie\b.{0,35}promuje.{0,45}(?:zni\w*|rabat\w*).{0,25}sta[łl]ych klient[oó]w/i,
  /\bnie\b.{0,35}(?:posiada|ma|informuje).{0,55}(?:zni\w*|rabat\w*).{0,25}sta[łl]ych klient[oó]w/i,
  /\bbrak\b.{0,45}\b(?:bezpo[śs]redniej|wyra[źz]nych?)?\b.{0,25}\binformacj\w*\b.{0,65}\b(?:program\w* lojalno[śs]ciow\w*|sta[łl]ych klient[oó]w|lojalnych klient[oó]w)\b/i,
  /\bgeen\b.{0,45}\b(?:loyaliteitsprogramma|kortingsprogramma|vaste klantenkorting|korting voor bestaande klanten)\b/i,
  /\bkeine?\b.{0,45}\b(?:treueprogramm|kundenprogramm|bestandskundenrabatt|rabatt f[uü]r bestehende kunden)\b/i,
  /\b(?:ne mentionne pas|aucune?|pas de)\b.{0,55}\b(?:programme de fid[eé]lit[eé]|r[ée]duction pour clients? existants?|avantage clients? fid[eé]les)\b/i,
  /\bne mentionne pas\b.{0,80}\b(?:r[eé]duction|remise|avantage)\b.{0,35}\b(?:clients? existants?|clients? fid[eé]les)\b/i,
  /\bpas de\b.{0,45}\b(?:programme de fid[eé]lit[eé]|r[eé]duction|remise)\b.{0,35}\b(?:clients? existants?|clients? fid[eé]les)?\b/i,
  /\bgeen\b.{0,35}\b(?:specifiek|structureel)\b.{0,20}\bkortingsprogramma\b.{0,20}\bvoor\b.{0,20}\bbestaande klanten\b/i,
  /\bgeen\b.{0,35}\b(?:specifiek|formeel|vast)\b.{0,20}\b(?:loyaliteitsprogramma|klantenprogramma)\b/i,
  /\ber is\b.{0,20}\bgeen\b.{0,20}\bspecifiek\b.{0,20}\bstructureel\b.{0,20}\bkortingsprogramma\b/i,
  /\bdoes not offer a permanent\b.{0,20}\bexisting customer\b.{0,20}\bdiscount\b/i,
  /\bne propose pas\b.{0,35}\b(?:de )?(?:r[ée]duction|offre|avantage)\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? existants?\b/i,
  /\bpas de r[ée]duction\b.{0,25}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? fid[èe]les\b/i,
  /\bil n['’]y a pas d['’]offre\b.{0,35}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles? clients? existants?\b/i,
  /\bno\b.{0,25}\bformal\b.{0,20}\bexisting-?customer\b.{0,20}\b(?:discount|program)\b/i,
  /\bno\b.{0,25}\b(?:standard|standing|permanent)\b.{0,20}\bexisting customer\b.{0,20}\b(?:discount|program)\b/i,
  /\bno\b.{0,25}\b(?:formal|permanent|fixed)\b.{0,20}\b(?:loyalty program|existing customer discount)\b/i,
  /\bdoes not\b.{0,25}\boffer\b.{0,20}\b(?:a )?(?:formal|permanent|standard)\b.{0,20}\b(?:existing customer|loyalty)\b.{0,20}\b(?:discount|program)\b/i,
  /\bdoes not\b.{0,25}\boffer\b.{0,20}\b(?:a )?formal\b.{0,20}\bexisting customer\b.{0,20}\brewards?\b.{0,20}\bprogram\b/i,
  /\bno\b.{0,25}\bformal\b.{0,20}\bexisting customer\b.{0,20}\brewards?\b.{0,20}\bprogram\b/i,
];

const AAA_HARD_NEGATIVE_EXTRA_PATTERNS = [
  /\bnie znaleziono żadnych dowod[oó]w\b.{0,45}\bzni[żz]k[ęe]?\b.{0,20}\baaa\b/i,
  /\bnie znaleziono\b.{0,60}\bdowod\w*\b.{0,100}\baaa\b/i,
  /\bbrak informacji\b.{0,40}\bprogram\w*\b.{0,30}\baaa\b/i,
  /직접적인 정보는 제공된 검색 결과에서 확인되지 않았습니다/,
];

const BIRTHDAY_HARD_NEGATIVE_PATTERNS = [
  /\bbiedt\b.{0,25}\bgeen\b.{0,20}\bkorting\b.{0,20}\bop\b.{0,20}\bje verjaardag\b/i,
  /\bgeen\b.{0,30}\b(?:directe aanwijzing|actuele acties?|standaard korting)\b.{0,20}.*\bverjaardag/i,
  /\bgeen\b.{0,25}\bverjaardagskorting\b/i,
  /\bpas de r[ée]duction anniversaire\b/i,
  /\bne propose pas de r[ée]duction (?:sp[ée]cifique|r[ée]currente)\b.{0,20}\bd['’]anniversaire\b/i,
  /\baucun(?:e)?\b.{0,30}\b(?:offre|coupon|bon)\b.{0,20}\bd['’]anniversaire\b/i,
  /생일 할인 혜택에 대한 직접적인 언급은 찾을 수 없/,
  /\bbrak\b.{0,35}\bbezpo[śs]rednich informacji\b.{0,25}\bo\b.{0,20}\bsta[łl]ej,\s*osobistej\b.{0,20}\bzni[żz]ce\b.{0,20}\burodzinowej\b/i,
  /\burodzin(?:y|owa)\b.{0,35}\bmarki\b.{0,35}\bnie\b.{0,20}\bindywidualny\b.{0,20}\brabat\b.{0,20}\bdla klienta\b/i,
  /\bnie\b.{0,20}\bindywidualny\b.{0,20}\brabat\b.{0,20}\burodzinowy\b.{0,20}\bdla klienta\b/i,
  /\bnie oferuje\b.{0,30}\bstandardowej\b.{0,20}\b(?:publicznie og[łl]aszanej\b.{0,15})?zni[żz]ki\b.{0,20}\burodzinowej\b/i,
  /\bnie oferuje\b.{0,30}\bstandardowej\b.{0,20}\bpowszechnie og[łl]aszanej\b.{0,20}\bzni[żz]ki\b.{0,20}\burodzinowej\b/i,
  /\bbrand'?s anniversary sale\b.{0,25}\bnot a customer birthday discount\b/i,
  /\bkeine?\b.{0,45}\bpers[oö]nlichen?\b.{0,20}\bgeburtstagsrabatt\b/i,
  /\bkeinen?\b.{0,35}\bspezifischen?\b.{0,20}\brabatt\b.{0,30}\b(?:am|zum)\b.{0,20}\bpers[oö]nlichen?\b.{0,20}\bgeburtstag\b/i,
  /\bdoes not currently offer a specific birthday discount\b/i,
  /\bdoes not explicitly list\b.{0,20}\b(?:a )?(?:standard|automatic)\b.{0,20}\bbirthday\b.{0,20}\bdiscount\b/i,
  /\bspecific,\s*standard\b.{0,20}\bbirthday\b.{0,20}\bdiscount\b.{0,20}\bprogram\b.{0,20}\bis not mentioned\b/i,
  /\bno information indicating\b.{0,25}\b(?:a )?specific\b.{0,20}\bbirthday\b.{0,20}\bdiscount\b/i,
  /\binstead of a direct birthday coupon\b.{0,40}\bprize draw\b/i,
  /没有专属的生日折扣/,
  /没有专门的生日优惠券/,
];

const BIRTHDAY_STRONG_POSITIVE_PATTERNS = [
  /\b100\b.{0,12}j-?points?\b.{0,25}\bbirthday\b/i,
  /\bbirthday bonus\b.{0,25}\b(?:points?|rewards?)\b/i,
  /\bmembers receive\b.{0,30}\b(?:\d+|one hundred)\b.{0,15}\b(?:j-?points?|points?)\b.{0,25}\bon (?:their )?birthday\b/i,
];

const FIRST_RESPONDER_HARD_NEGATIVE_EXTRA_PATTERNS = [
  /并未专门针对急救人员.{0,30}提供特定的折扣计划/,
  /虽然没有专属的急救人员折扣/,
  /并没有明确列出针对急救人员的长期专项折扣/,
  /并没有明确列出针对.{0,20}(?:急救人员|First Responders?).{0,30}长期.{0,12}(?:专项)?折扣/,
  /官方并未确认.{0,20}(?:急救人员|first responder).{0,20}(?:专属|特殊).{0,20}折扣/,
  /\bkeine?\b.{0,35}\banzeichen\b.{0,20}\bf[uü]r\b.{0,20}\bspezielle\w*\b.{0,20}\b(?:rabatte|erm[aä][ßs]igungen)\b.{0,20}\bf[uü]r\b.{0,20}\bersthelfer\b/i,
  /\bkeine?\b.{0,20}\bspezielle,?\s*explizit ausgewiesene\b.{0,20}\berm[aä][ßs]igung\b.{0,20}\bf[uü]r\b.{0,20}\bersthelfer\b/i,
  /\b(?:special|official)\b.{0,20}\bfirst responder discount info\b.{0,20}\bis not confirmed\b/i,
  /\bno\b.{0,20}\b(?:official|special|dedicated)\b.{0,20}\bfirst responder discount\b.{0,20}\b(?:is )?(?:confirmed|listed)\b/i,
  /\bwhile the brand itself does not have a first responder discount\b/i,
  /\bthe brand itself does not have a first responder discount\b/i,
];

const LOYALTY_HARD_NEGATIVE_PATTERNS = [
  /\bnie ma informacji potwierdzaj[ąa]cych\b.{0,35}\bprogram\b.{0,20}\blojalno[śs]ciow\w*\b/i,
  /\bno se menciona un programa de puntos tradicional\b/i,
  /\bsino una recompensa vinculada a acciones espec[ií]ficas\b/i,
  /\bbrak bezpo[śs]redniego programu lojalno[śs]ciowego\b/i,
  /\bil n['’]existe pas de programme de fid[ée]lit[ée] classique\b/i,
  /\bpas de programme de points classique\b/i,
  /\bne propose pas de programme de fid[ée]lit[ée] (?:classique|bas[ée] sur des points)\b/i,
];

const PRICE_GUARANTEE_HARD_NEGATIVE_PATTERNS = [
  /\bno\b.{0,35}\b(?:anuncia|menciona|ofrece|indica|publica|cuenta con)\b.{0,60}\b(?:garant[ií]a (?:formal )?(?:de )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|equiparaci[oó]n de precios?|price match)\b/i,
  /\bno\b.{0,45}\b(?:garant[ií]a|pol[ií]tica)\b.{0,35}\b(?:igualar|igualen|mejorar|equiparar|price match)\b/i,
  /\bno hay\b.{0,45}\b(?:constancia|evidencia|indicios|informaci[oó]n)\b.{0,45}\b(?:garant[ií]a (?:del? )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
  /\b(?:precio competitivo|precios competitivos|relaci[oó]n calidad-precio|mejores precios online)\b.{0,100}\b(?:no\b.{0,35}\b(?:garant[ií]a|igualaci[oó]n|equiparaci[oó]n|price match))\b/i,
  /\bno hay indicios p[uú]blicos o expl[ií]citos\b.{0,35}\b(?:garant[ií]a de mejor precio|igualaci[oó]n de precios)\b/i,
  /\bno hay indicios\b.{0,35}\bofrezca\b.{0,25}\b(?:una )?(?:garant[ií]a de mejor precio|igualaci[oó]n de precios)\b/i,
  /\bno hay indicios\b.{0,80}\b(?:garant|igualaci)\w*/i,
  /\bno\b.{0,30}\b(?:ofrece|menciona|publica|indica)\b.{0,35}\b(?:formalmente )?(?:una )?(?:garant[ií]a (?:formal )?(?:de )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
  /\bno menciona expl[ií]citamente\b.{0,45}\b(?:garant[ií]a (?:de )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
  /\bnie\b.{0,35}\bpromuje\b.{0,35}\b(?:gwarancj\w*|has[łl]\w*)\b.{0,35}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
  /\bnie\b.{0,30}\boferuje\b.{0,45}\bgwarancj\w*\b.{0,25}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
  /\bnie jest to\b.{0,30}\b(?:price match|best price guarantee|lowest price guarantee)\b/i,
  /\bnie\b.{0,30}\boferuje\b.{0,35}\bformaln\w*\b.{0,25}\bgwarancj\w*\b.{0,25}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
  /\bnie posiada\b.{0,35}\bformaln\w*\b.{0,25}\bgwarancj\w*\b.{0,25}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
  /\bnie wynika\b.{0,25}\b(?:aby )?(?:firma|marka)\b.{0,35}\boferowa[łl]a\b.{0,25}\bformaln\w*\b.{0,25}\bgwarancj\w*\b(?: najlepszej ceny)?\b/i,
  /\bbrak\b.{0,35}\bformalnej\b.{0,20}\bgwarancji\b.{0,20}\bnajlepszej ceny\b/i,
  /\bne propose pas\b.{0,35}\b(?:de )?(?:garantie du meilleur prix|garantie de prix|alignement tarifaire)\b/i,
  /\bpas de garantie\b.{0,25}\b(?:officielle )?du meilleur prix\b/i,
  /\bpas d['’]alignement tarifaire\b/i,
  /\baucune?\b.{0,35}\bgarantie du meilleur prix\b/i,
  /\bno\b.{0,25}\b(?:official|public|direct|traditional)\b.{0,20}\b(?:price match|price guarantee|best price guarantee)\b/i,
  /\bdoes not\b.{0,25}\b(?:offer|have|provide|list)\b.{0,25}\b(?:an? )?(?:official|public|traditional)?\b.{0,20}\b(?:price match|price guarantee|best price guarantee)\b/i,
  /\bofficial\b.{0,20}(?:store|site|website)\b.{0,25}\bdoes not\b.{0,25}\b(?:clearly )?list\b.{0,25}\b(?:a )?(?:price match|price guarantee)\b/i,
  /\bnot\b.{0,20}\b(?:a )?(?:traditional|formal)\b.{0,20}\b(?:price match|price guarantee)\b/i,
  /\bdoes not\b.{0,25}\bclearly list\b.{0,25}\b(?:a )?(?:price match|price guarantee)\b.{0,20}\bpolicy\b/i,
  /并未明确列出任何形式的.{0,20}(?:价格保证|价格匹配).{0,20}政策/,
  /并未明确列出.{0,40}(?:价格保证|价格匹配)/,
  /没有公开信息表明.{0,20}(?:价格保证|价格匹配).{0,20}(?:政策|承诺)/,
  /官方(?:在线)?商店.{0,20}并未明确列出.{0,20}(?:价格保证|价格匹配).{0,20}政策/,
];

const APP_CROSS_ENTITY_NEGATIVE_PATTERNS = [
  /\bapp-rabatte\b.{0,40}\bbeziehen sich\b.{0,20}\bauf\b.{0,40}\b(?:den )?(?:h[aä]ndler|retailer)\b/i,
  /\bapp-rabatte\b.{0,20}\bauf\b.{0,40}\b(?:den )?(?:h[aä]ndler|haendler|retailer)\b.{0,30}\bbeziehen\b/i,
  /\bapp discounts?\b.{0,40}\bapply to\b.{0,30}\b(?:the )?(?:retailer|merchant)\b.{0,30}\brather than\b.{0,25}\b(?:the )?brand\b/i,
  /\bw(?:[aä]|ae)hrend sich die app-rabatte\b.{0,40}\bauf\b.{0,40}\bbeziehen\b/i,
];

const BLUE_LIGHT_CARD_HARD_NEGATIVE_PATTERNS = [
  /\bno confirmation\b.{0,35}\bblue light(?: card)?\b.{0,20}\bdiscount\b/i,
  /\bthere is no confirmation\b.{0,35}\bblue light(?: card)?\b.{0,20}\bdiscount\b/i,
  /\bno\b.{0,35}\b(?:menciona|confirma|hay evidencia|hay informaci[oó]n|hay indicios|indica|acepta|acepten|ofrece)\b.{0,45}\b(?:la tarjeta )?blue light(?: card)?\b/i,
  /\bblue light(?: card)?\b.{0,45}\b(?:no\b.{0,25}\b(?:acepta|aceptan|menciona|ofrece|figura|aparece|confirma))\b/i,
  /\bbrak\b.{0,35}\b(?:informacji|potwierdzenia|dowod[oó]w)\b.{0,35}\bblue light(?: card)?\b/i,
  /\bnie\b.{0,45}\b(?:wspomina|potwierdza|oferuje|informuje|akceptuje|wynika|wskazuje)\b.{0,45}\bblue light(?: card)?\b/i,
  /\bnie\b.{0,35}\b(?:figuruje|znajduje si[eę])\b.{0,45}\b(?:partner[oó]w )?blue light(?: card)?\b/i,
  /\bgeen\b.{0,45}\bblue light(?: card)?\b.{0,25}\b(?:korting|acceptatie|voordeel)\b/i,
  /\bkeine?\b.{0,45}\bblue light(?: card)?\b.{0,25}\b(?:rabatt|akzeptanz|vorteil)\b/i,
  /\b(?:ne mentionne pas|aucune?|pas de)\b.{0,45}\bblue light(?: card)?\b.{0,25}\b(?:r[ée]duction|acceptation|avantage)\b/i,
  /(?:没有|未|并未).{0,35}Blue Light Card.{0,20}(?:折扣|优惠|接受|支持)/i,
  /\bblue light(?: card)?\b.{0,30}(?:할인|혜택|제휴)\b.{0,20}(?:없|않|확인되지)/i,
  /blue light(?: card)?.{0,60}(?:확인되지|없|않)/i,
  /\binstead of blue light discounts?\b/i,
  /\bdoes not offer\b.{0,30}\bblue light(?: card)?\b.{0,20}\bdiscounts?\b/i,
  /\bblue light card is a discount service\b.{0,70}\b(?:united kingdom|uk)\b/i,
];

const FAMILY_HARD_NEGATIVE_PATTERNS = [
  /\bdoes not offer a dedicated family discount\b/i,
  /\bdoes not offer\b.{0,25}\b(?:a )?(?:specific|dedicated)\b.{0,20}\bfamily\b.{0,15}\bdiscount\b/i,
  /\bpas de r[ée]duction famille\b/i,
  /\bne propose pas de r[ée]duction sp[ée]cifique pour les familles\b/i,
  /\baucun(?:e)?\b.{0,30}\boffre\b.{0,20}\bsp[ée]cifique\b.{0,20}\bpour\b.{0,20}\bles familles\b/i,
  /\bkeine?\b.{0,15}\b(?:speziellen?|dedizierten?)\b.{0,20}\bfamilienrabatte?\b/i,
  /\bfamily(?:-size| size)\b.{0,40}\b(?:packs?|products?|bags?)\b.{0,50}\b(?:rather than|instead of|not)\b.{0,25}\b(?:a )?(?:dedicated )?family discount\b/i,
  /\b(?:for|to)\b.{0,12}\bindividuals? and families\b/i,
  /\bgood for families\b/i,
  /\b(?:\d+\s*for\s*[£$€]?\d+|buy \d+ get \d+|multi-?buy|bundle deal|bulk savings?)\b.{0,50}\b(?:famil(?:y|ies)|family)\b/i,
  /不提供专门的[“"]?家庭折扣[”"]?/,
  /(?:家庭装|Family Size).{0,30}(?:而非|不是).{0,20}(?:家庭折扣|专属优惠)/,
];

const GIFT_CARD_STRONG_POSITIVE_PATTERNS = [
  /\b(?:gift cards?|gift vouchers?)\b.{0,40}\b(?:available|can be purchased|can be sent|emailed|print(?:ed)? out|redeemed?)\b/i,
  /\b(?:digital )?gift cards?\b.{0,35}\b(?:available|purchase|page)\b/i,
  /\b(?:cartes? cadeaux?|bons? cadeaux?)\b.{0,45}\b(?:disponibles?|propos[ée]s?|achet(?:er|ables?)|envoy(?:[ée]e?s?)|utilisables?)\b/i,
  /\be-?cartes? cadeaux?\b.{0,35}\b(?:disponibles?|envoy(?:[ée]e?s?) par email|achet(?:er|ables?))\b/i,
  /\b(?:chèques?|cartes?) cadeaux?\b.{0,45}\b(?:valables?|envoy(?:[ée]e?s?)|montants?|disponibles?)\b/i,
  /\b(?:geschenkgutscheine?|geschenkkarten?)\b.{0,40}\b(?:bestellt|erh[aä]ltlich|einl[oö]sbar|genutzt)\b/i,
  /\b(?:gift cards?|gift vouchers?)\b.{0,35}\b(?:for purchase|to purchase|purchase these directly)\b/i,
  /\b(?:tarjetas? de regalo|cheques? regalo|bonos? regalo|cupones? de regalo|vales? regalo)\b.{0,60}\b(?:ofrece|disponibles?|adquirir|comprar|compra|v[aá]lid[oa]s?|canjear|importe)\b/i,
  /\b(?:ofrece|dispone de|vende|permite adquirir|puedes adquirir)\b.{0,60}\b(?:tarjetas? de regalo|cheques? regalo|bonos? regalo|cupones? de regalo|vales? regalo)\b/i,
  /\b(?:karty podarunkowe|karty prezentowe|bony podarunkowe|bony prezentowe|vouchery prezentowe|vouchery kwotowe)\b.{0,70}\b(?:oferuje|dost[eę]pne|naby[ćc]|zakup|elektroniczn\w*|wysy[łl]ane|pdf|kwot\w*)\b/i,
  /\b(?:oferuje|sprzedaje|posiada|dost[eę]pne s[ąa])\b.{0,60}\b(?:karty podarunkowe|karty prezentowe|bony podarunkowe|bony prezentowe|vouchery prezentowe|vouchery kwotowe)\b/i,
  /\b(?:bons? cadeaux?|cartes? cadeaux?|chèques? cadeaux?)\b.{0,55}\b(?:disponibles?|acheter|offre|propose|valables?)\b/i,
  /\b(?:cadeaubonnen|cadeaukaarten)\b.{0,45}\b(?:beschikbaar|kopen|aangeboden|inwisselen)\b/i,
  /\b(?:geschenkkarten?|geschenkgutscheine?)\b.{0,45}\b(?:verf[uü]gbar|kaufen|erh[aä]ltlich|einl[oö]sen)\b/i,
  /(?:礼品卡|礼券|电子礼品卡).{0,30}(?:购买|提供|可用|兑换)/,
  /(?:기프트카드|상품권|선물 카드).{0,30}(?:구매|제공|사용|교환)/,
  /\bcreate and sell your own gift cards\b/i,
];

const GIFT_CARD_PLATFORM_SELF_SERVICE_POSITIVE_PATTERNS = [
  /\b(?:provides?|offer(?:s|ed)?|allows?)\b.{0,25}\b(?:tools?|tooling|features?)\b.{0,25}\b(?:to )?create and sell your own gift cards\b/i,
  /\bcreate and sell your own gift cards to your customers\b/i,
];

const GIFT_CARD_HARD_NEGATIVE_PATTERNS = [
  /\bno direct evidence that\b.{0,80}\boffers?\b.{0,20}\b(?:brand-specific|own)\b.{0,20}\bgift cards?\b/i,
  /\bno direct evidence\b.{0,40}\b(?:brand-specific|own)\b.{0,20}\bgift cards?\b/i,
  /\bno\b.{0,35}\b(?:especifica|menciona|ofrece|vende|lista)\b.{0,45}\b(?:tarjetas? regalo|gift cards?|vales? regalo|e-?gift cards?)\b/i,
  /\bno\b.{0,45}\b(?:oferta|venta|disponibilidad)\b.{0,35}\b(?:tarjetas? de regalo|cheques? regalo|bonos? regalo|vales? regalo)\b/i,
  /\b(?:no menciona|no ofrece|no vende|no lista)\b.{0,70}\b(?:tarjetas? de regalo|cheques? regalo|bonos? regalo|vales? regalo)\b/i,
  /\b(?:nie ma|nie znaleziono|nie wynika|nie oferuje|nie posiada|nie wyr[oó][żz]nia|brak)\b.{0,80}\b(?:kart podarunkowych|kart prezentowych|bon[oó]w podarunkowych|bon[oó]w prezentowych|voucher[oó]w|w[łl]asnych kart podarunkowych)\b/i,
  /\b(?:nie mo[żz]na|nie można)\b.{0,35}\bpotwierdzi[ćc]\b.{0,70}\b(?:karty podarunkowe|karty prezentowe|bony podarunkowe|vouchery)\b/i,
  /\b(?:geen|niet)\b.{0,45}\b(?:cadeaubonnen|cadeaukaarten|gift cards?)\b/i,
  /\bkeine?\b.{0,45}\b(?:geschenkkarten?|geschenkgutscheine?|gift cards?)\b/i,
  /\b(?:ne mentionne pas|aucune?|pas de)\b.{0,55}\b(?:cartes? cadeaux?|bons? cadeaux?|chèques? cadeaux?)\b/i,
  /(?:没有|未|并未|不提供).{0,40}(?:礼品卡|礼券|电子礼品卡)/,
  /(?:기프트카드|상품권|선물 카드).{0,35}(?:없|않|확인되지)/,
  /\b(?:cajitas? de regalo|envoltorio de regalo|gift wrapping|personalized card|tarjeta personalizada)\b.{0,80}\b(?:no\b.{0,30}\b(?:tarjetas? regalo|gift cards?)|although no|aunque no)\b/i,
  /\b(?:tarjetas? personalizadas?|personalized cards?)\b.{0,60}\b(?:no|not)\b.{0,30}\b(?:tarjetas? regalo|gift cards?)\b/i,
  /\bdoes not\b.{0,25}\b(?:currently )?(?:offer|sell|list)\b.{0,30}\b(?:traditional |official )?gift cards?\b/i,
  /\bdoes not appear to offer\b.{0,30}\b(?:traditional |official )?gift cards?\b/i,
  /\bne propose pas\b.{0,35}\b(?:de )?(?:cartes?|bons?) cadeaux?\b/i,
  /\bpas de\b.{0,25}\b(?:cartes?|bons?) cadeaux?\b.{0,20}\b(?:officiels?|classiques?)\b/i,
  /\bil ne semble pas\b.{0,25}\bque\b.{0,30}\b(?:des )?(?:cartes?|bons?) cadeaux?\b/i,
  /\bn['’]est pas explicitement indiqu[ée]\b.{0,35}\b(?:qu[ea] )?.{0,35}\b(?:propose|vend)\b.{0,20}\b(?:des )?(?:cartes?|chèques?) cadeaux?\b/i,
      /\bne semble pas proposer\b.{0,25}\b(?:de )?(?:cartes?|chèques?) cadeaux?\b/i,
      /\bil n['’]est pas fait mention\b.{0,30}\b(?:de la vente|de)\b.{0,20}\b(?:cartes?|chèques?) cadeaux?\b/i,
      /\bne mentionne pas explicitement\b.{0,35}\b(?:la vente de|de)\b.{0,20}\b(?:cartes?|ch[èe]ques?)(?:-|\s)?cadeaux?\b/i,
      /\bil n['’]est pas explicitement confirm[ée]\b.{0,35}\b(?:qu[ea] )?.{0,35}\b(?:propose|vend)\b.{0,20}\b(?:des )?(?:cartes?|ch[èe]ques?)(?:-|\s)?cadeaux?\b/i,
      /\bne semble pas proposer directement\b.{0,35}\b(?:des )?(?:cartes?|ch[èe]ques?)(?:-|\s)?cadeaux?\b/i,
      /\b(?:coffrets?|id[ée]es?|emballage|kit|kits?) cadeaux?\b.{0,50}\b(?:plut[oô]t que|et non)\b.{0,20}\b(?:des )?(?:cartes?|chèques?) cadeaux?\b/i,
  /\binstead of purchasing a gift card\b/i,
  /\bwhile the official\b.{0,30}\bwebsite\b.{0,30}\bdoes not\b.{0,25}\b(?:explicitly )?list\b.{0,25}\bgift cards?\b/i,
];

const REFERRAL_HARD_NEGATIVE_EXTRA_PATTERNS = [
  /친구 추천 할인 혜택[”"]?은 명시되어 있지 않/,
  /별도의 ['"]?친구 추천 할인 혜택['"]?은 명시되어 있지 않/,
];

const RETURN_AMBIGUOUS_POLICY_PATTERNS = [
  /판매자가 반품 정책\(무료 반품 또는 구매자 부담\)을 설정/,
  /상품 페이지의 ['"]?Returns['"]? 섹션을 통해 무료 반품 여부를 확인해야/,
  /\beBay\b.{0,35}\bdoes not force free returns\b/i,
  /\bfree returns?\b.{0,30}\bif\b.{0,20}\bitem not as described\b/i,
  /\bles frais de retour sont [àa] votre charge\b/i,
  /\bretour(?:s)? gratuit(?:s)?\b.{0,20}\b(?:en magasin|principalement en magasin)\b/i,
  /\ble retour par (?:voie postale|la poste) est payant\b/i,
  /\bd[ée]pend du tarif achet[ée]\b/i,
];

const LEAD_EXPLICIT_NO_PATTERNS: Partial<Record<string, RegExp[]>> = {
  "existing customer": [
    /\bno\b.{0,35}\b(?:menciona|anuncia|detalla|ofrece|indica)\b.{0,55}\b(?:programas? de (?:descuento|fidelizaci[oó]n)|descuentos? (?:autom[aá]ticos?|fijos?|especiales?)|clientes existentes|clientes recurrentes)\b/i,
    /\bsin mencionar expl[ií]citamente\b.{0,55}\b(?:descuento|programa|beneficio)\b.{0,35}\b(?:clientes existentes|clientes recurrentes|fidelizaci[oó]n)\b/i,
    /\bnie\b.{0,35}\b(?:posiada|promuje|reklamuje|informuje|ma)\b.{0,65}\b(?:program\w* lojalno[śs]ciow\w*|zni[żz]k\w* dla sta[łl]ych klient[oó]w|rabat\w* dla sta[łl]ych klient[oó]w)\b/i,
    /\bnie\b.{0,35}promuje.{0,45}(?:zni\w*|rabat\w*).{0,25}sta[łl]ych klient[oó]w/i,
    /\bnie\b.{0,35}(?:posiada|ma|informuje).{0,55}(?:zni\w*|rabat\w*).{0,25}sta[łl]ych klient[oó]w/i,
    /\bbrak\b.{0,45}\b(?:bezpo[śs]redniej|wyra[źz]nych?)?\b.{0,25}\binformacj\w*\b.{0,65}\b(?:program\w* lojalno[śs]ciow\w*|sta[łl]ych klient[oó]w|lojalnych klient[oó]w)\b/i,
    /\bgeen\b.{0,45}\b(?:loyaliteitsprogramma|kortingsprogramma|vaste klantenkorting|korting voor bestaande klanten)\b/i,
    /\bkeine?\b.{0,45}\b(?:treueprogramm|kundenprogramm|bestandskundenrabatt|rabatt f[uü]r bestehende kunden)\b/i,
    /\b(?:ne mentionne pas|aucune?|pas de)\b.{0,55}\b(?:programme de fid[eé]lit[eé]|r[ée]duction pour clients? existants?|avantage clients? fid[eé]les)\b/i,
    /\bne mentionne pas\b.{0,80}\b(?:r[eé]duction|remise|avantage)\b.{0,35}\b(?:clients? existants?|clients? fid[eé]les)\b/i,
  ],
  app: [
    /\bdoes not\b.{0,30}\b(?:offer|have|provide|list|mention)\b.{0,35}\b(?:an? )?(?:dedicated|specific|app-exclusive|app based|app-only)?\b.{0,20}\bapp(?:-exclusive|-specific|-based)?\b.{0,20}\b(?:discount|offer|benefit|coupon|code)\b/i,
    /\bno\b.{0,30}\b(?:dedicated|specific|app-exclusive|app based|app-only)?\b.{0,20}\bapp(?:-exclusive|-specific|-based)?\b.{0,20}\b(?:discount|offer|benefit|coupon|code)\b/i,
    /\bkeine\b.{0,45}\bspezifische\b.{0,25}\bapp\b.{0,20}\b(?:mit|rabatt|erw[aä]hnt)\b/i,
    /\bnie posiada\b.{0,55}\b(?:dedykowan\w+|w[łl]asnej|mobiln\w*)?\b.{0,25}\baplikacj\w+\b/i,
    /\bnie ma\b.{0,45}\b(?:dedykowan\w+|w[łl]asnej|mobiln\w*)?\b.{0,25}\baplikacj\w+\b/i,
    /\bno (?:cuenta con|dispone de|tiene|posee)\b.{0,45}\b(?:una )?(?:aplicaci[oó]n m[oó]vil|app)\b.{0,35}\b(?:propia|dedicada|de compras|para realizar compras)?\b/i,
    /\bno\b.{0,35}\b(?:ofrece|hay)\b.{0,35}\b(?:descuentos?|beneficios?|cupones?)\b.{0,25}\b(?:por|en|mediante|a trav[eé]s de)\b.{0,15}\b(?:app|aplicaci[oó]n)\b/i,
  ],
  "price guarantee": [
    /\bno\b.{0,30}\b(?:ofrece|menciona|publica|indica)\b.{0,35}\b(?:formalmente )?(?:una )?(?:garant[ií]a (?:formal )?(?:de )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
    /\bno hay\b.{0,45}\b(?:constancia|evidencia|indicios|informaci[oó]n)\b.{0,45}\b(?:garant[ií]a (?:del? )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
    /\bno\b.{0,45}\b(?:garant[ií]a|pol[ií]tica)\b.{0,35}\b(?:igualar|igualen|mejorar|equiparar|price match)\b/i,
    /\bno menciona expl[ií]citamente\b.{0,45}\b(?:garant[ií]a (?:de )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|price match)\b/i,
    /\bnie\b.{0,35}\bpromuje\b.{0,35}\b(?:gwarancj\w*|has[łl]\w*)\b.{0,35}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
    /\bnie\b.{0,30}\boferuje\b.{0,45}\bgwarancj\w*\b.{0,25}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
    /\bnie jest to\b.{0,30}\b(?:price match|best price guarantee|lowest price guarantee)\b/i,
    /\bnie\b.{0,30}\boferuje\b.{0,35}\bformaln\w*\b.{0,25}\bgwarancj\w*\b.{0,25}\b(?:najlepszej|najni[żz]szej)\b.{0,15}\bceny\b/i,
  ],
  return: [
    /\bno especifica\b.{0,45}\b(?:devoluciones?|returns?)\b.{0,35}\b(?:gratuitas?|gratis|free)\b/i,
    /\bno\b.{0,30}\bindica\b.{0,45}\b(?:devoluciones?|returns?)\b.{0,35}\b(?:gratuitas?|gratis|free)\b/i,
    /\bklient\b.{0,35}\bponosi\b.{0,35}\bkoszt\w*\b.{0,25}\bzwrot\w*\b/i,
    /\bnie\b.{0,35}\boferuje\b.{0,35}\bdarmow\w*\b.{0,25}\bzwrot\w*\b/i,
  ],
  family: [
    /\bdoes not offer\b.{0,25}\b(?:a )?(?:standard|specific|dedicated)\b.{0,20}\bfamily\b.{0,15}\bdiscount\b/i,
    /\bfriends and family\b.{0,35}\b(?:sale|promotion|event)s?\b.{0,45}\brather than\b.{0,25}\b(?:a )?(?:dedicated|standard)?\b.{0,15}\bfamily\b.{0,15}\bdiscount\b/i,
    /\bno menciona expl[ií]citamente\b.{0,45}\b(?:descuento|oferta)\b.{0,20}\b(?:familiar|familias?|familias numerosas)\b/i,
    /\bnie\b.{0,35}mo[żz]na.{0,25}potwierdzi[ćc].{0,70}(?:zni[żz]k\w*|rabat\w*).{0,25}(?:rodzinn\w*|dla rodzin)/i,
    /\bnie\b.{0,35}wymienia.{0,25}wprost.{0,35}(?:zni[żz]k\w*|rabat\w*).{0,25}(?:rodzinn\w*|dla rodzin)/i,
    /\bnie\b.{0,35}\b(?:znaleziono|ma|oferuje|wspomina)\b.{0,35}\b(?:dedykowan\w*|specjaln\w*)?\b.{0,25}\b(?:zni[żz]k\w*|rabat\w*)\b.{0,25}\b(?:rodzinn\w*|dla rodzin)\b/i,
  ],
  "gift card": [
    /\bno\b.{0,35}\b(?:especifica|menciona|ofrece|vende|lista)\b.{0,45}\b(?:tarjetas? regalo|gift cards?|vales? regalo|e-?gift cards?)\b/i,
    /\b(?:nie ma|nie znaleziono|nie wynika|nie oferuje|nie posiada|nie wyr[oó][żz]nia|brak)\b.{0,80}\b(?:kart podarunkowych|kart prezentowych|bon[oó]w podarunkowych|bon[oó]w prezentowych|voucher[oó]w|w[łl]asnych kart podarunkowych)\b/i,
    /\b(?:nie mo[żz]na|nie można)\b.{0,35}\bpotwierdzi[ćc]\b.{0,70}\b(?:karty podarunkowe|karty prezentowe|bony podarunkowe|vouchery)\b/i,
    /\b(?:cajitas? de regalo|envoltorio de regalo|gift wrapping|personalized card|tarjeta personalizada)\b.{0,80}\b(?:no\b.{0,30}\b(?:tarjetas? regalo|gift cards?)|aunque no|although no)\b/i,
  ],
  referral: [
    /\bno\b.{0,35}\b(?:especifica|menciona|ofrece|tiene|hay)\b.{0,45}\b(?:programa|descuento|recompensa)\b.{0,25}\b(?:referir|referidos|referidos?|recomendaci[oó]n|referral)\b/i,
    /\bno\b.{0,35}\b(?:formal|p[uú]blico|para consumidores?)\b.{0,25}\b(?:referral|refer(?:-a-friend)?|referidos?)\b/i,
  ],
  aaa: [
    /\bno\b.{0,35}\b(?:menciona|confirma|hay evidencia|hay informaci[oó]n|hay indicios|indica|ofrece)\b.{0,45}\b(?:descuentos? )?(?:para )?(?:miembros? )?(?:de )?aaa\b/i,
    /\bbrak\b.{0,35}\b(?:informacji|potwierdzenia|dowod[oó]w)\b.{0,35}\baaa\b/i,
    /\bnie\b.{0,35}\b(?:oferuje|wskazuje|informuje|akceptuje)\b.{0,45}\baaa\b/i,
  ],
  "blue light card": [
    /\bno\b.{0,35}\b(?:menciona|confirma|hay evidencia|hay informaci[oó]n|hay indicios|indica|acepta|acepten|ofrece)\b.{0,45}\b(?:la tarjeta )?blue light(?: card)?\b/i,
    /\bbrak\b.{0,35}\b(?:informacji|potwierdzenia|dowod[oó]w)\b.{0,35}\bblue light(?: card)?\b/i,
    /\bnie\b.{0,45}\b(?:wspomina|potwierdza|oferuje|informuje|akceptuje|wynika|wskazuje)\b.{0,45}\bblue light(?: card)?\b/i,
  ],
  clearance: [
    /\bno\b.{0,35}\b(?:tiene|dispone de|cuenta con|menciona)\b.{0,45}\b(?:secci[oó]n )?(?:outlet|liquidaci[oó]n|clearance|rebajas?)\b/i,
    /\bnie\b.{0,35}\b(?:posiada|ma|wspomina)\b.{0,45}\b(?:dedykowan\w* )?(?:sekcj\w* )?(?:outlet|wyprzeda[żz]|clearance)\b/i,
  ],
};

const LEAD_EXPLICIT_YES_PATTERNS: Partial<Record<string, RegExp[]>> = {
  "existing customer": EXISTING_CUSTOMER_HARD_POSITIVE_PATTERNS,
  family: [
    /\bkarta du[żz]ej rodziny\b.{0,60}\b(?:zni[żz]k\w*|rabat\w*|discount)\b/i,
    /\b(?:sí|si|yes|tak)\b.{0,70}\b(?:descuentos?|zni[żz]k\w*|rabat\w*)\b.{0,35}\b(?:familias numerosas|familias?|rodzin\w*)\b/i,
    /\b(?:family|familias?|rodzin\w*)\b.{0,50}\b(?:ticket|package|pass|discount|descuento|zni[żz]k\w*|rabat\w*)\b/i,
  ],
  "price guarantee": [
    /\b(?:price match|best price guarantee|lowest price guarantee|garant[ií]a (?:del? )?(?:mejor precio|precio m[aá]s bajo)|igualaci[oó]n de precios?|gwarancj\w* (?:najlepszej|najni[żz]szej) ceny|gwarancj[ęe] ceny)\b/i,
  ],
  return: [
    /\b(?:free returns?|free return shipping|prepaid return label|devoluciones? gratis|devoluciones? gratuitas?|darmowe zwroty|bezp[łl]atne zwroty)\b/i,
  ],
  "gift card": GIFT_CARD_STRONG_POSITIVE_PATTERNS,
  app: [
    /\b(?:app|aplicaci[oó]n|aplikacj\w*)\b.{0,45}\b(?:exclusive|exclusiv[oa]s?|dedykowan\w*|specjaln\w*)\b.{0,35}\b(?:discount|descuento|coupon|code|zni[żz]k\w*|rabat\w*)\b/i,
    /\b(?:download|using|order(?:ing)? via|comprar (?:por|en)|zam[oó]wienia? przez)\b.{0,35}\b(?:app|aplicaci[oó]n|aplikacj\w*)\b.{0,35}\b(?:discount|descuento|coupon|zni[żz]k\w*|rabat\w*)\b/i,
  ],
  referral: [
    /\b(?:refer a friend|friend referral|referral reward|consumer referral|programa de referidos|recompensa por referir|pole[ćc] znajomemu)\b/i,
  ],
  clearance: [
    /\b(?:sale|outlet|clearance|liquidaci[oó]n|rebajas?|wyprzeda[żz]|promocje)\b.{0,55}\b(?:discounted products?|productos? rebajad[oa]s|productos? con descuento|zni[żz]k\w*|rabat\w*)\b/i,
    /\b(?:productos? rebajad[oa]s|productos? con descuento|afgeprijsde artikelen|discounted products?)\b/i,
  ],
  "blue light card": [
    /\b(?:accepts?|acepta|akceptuje|honors?|honou?rs?|aceptan|akceptuj[ąa])\b.{0,45}\bblue light(?: card)?\b/i,
    /\bblue light(?: card)?\b.{0,55}\b(?:discounts?|descuentos?|zni[żz]k\w*|rabat\w*|benefits?|혜택|할인)\b/i,
  ],
  aaa: [
    /\b(?:accepts?|acepta|akceptuje|honors?|honou?rs?)\b.{0,35}\baaa\b/i,
    /\baaa\b.{0,45}\b(?:discounts?|descuentos?|zni[żz]k\w*|rabat\w*|benefits?|혜택|할인)\b/i,
  ],
};

const LEAD_SCREENING_YES_FACT_TYPES = new Set(["existing customer", "family", "clearance"]);

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  "$": "USD",
  "£": "GBP",
  "€": "EUR",
  "₩": "KRW",
};
function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function ensureFileSize(fileBase64: string) {
  const fileBytes = Buffer.from(fileBase64, "base64").length;
  if (fileBytes > ggCleaningUploadMaxFileBytes) {
    throw new Error(`Uploaded file is too large. Please keep it within ${Math.round(ggCleaningUploadMaxFileBytes / 1024 / 1024)}MB.`);
  }
}

function parseJsonRows(text: string) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown[] }).rows)) {
    return (parsed as { rows: Array<Record<string, unknown>> }).rows;
  }
  throw new Error("JSON file must be an array or an object with a rows array.");
}

function parseJsonlRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function looksLikeUtf16Le(buffer: Buffer) {
  if (buffer.length < 4 || buffer.length % 2 !== 0) return false;
  let zeroOddBytes = 0;
  const sampleLength = Math.min(buffer.length, 256);
  for (let index = 1; index < sampleLength; index += 2) {
    if (buffer[index] === 0) zeroOddBytes += 1;
  }
  return zeroOddBytes >= Math.max(2, Math.floor(sampleLength / 8));
}

function decodeDelimitedTextBuffer(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return iconv.decode(buffer, "utf8");
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer, "utf16-le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.slice(2), "utf16-be");
  }
  if (looksLikeUtf16Le(buffer)) {
    return iconv.decode(buffer, "utf16-le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "gb18030");
  }
}

function hasRequiredCollectedColumns(columns: string[]) {
  return GG_COLLECTED_REQUIRED_COLUMNS.every((column) => columns.includes(column));
}

function collectColumnsFromHeaderLine(text: string) {
  const headerLine = text.split(/\r?\n/, 1)[0] || "";
  return headerLine
    .replace(/^\uFEFF/, "")
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function parseCsvRowsSync(text: string) {
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    bom: true,
  }) as Array<Record<string, unknown>>;
}

function parseCsvRowsWithEncodingFallback(buffer: Buffer) {
  const candidates = [
    { name: "detected", text: decodeDelimitedTextBuffer(buffer) },
    { name: "gb18030", text: iconv.decode(buffer, "gb18030") },
    { name: "utf8", text: iconv.decode(buffer, "utf8") },
  ];
  let fallbackRows: Array<Record<string, unknown>> | null = null;
  let fallbackError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const rows = parseCsvRowsSync(candidate.text);
      if (!fallbackRows) fallbackRows = rows;
      const columns = collectColumns(rows);
      if (hasRequiredCollectedColumns(columns)) {
        return rows;
      }
    } catch (error) {
      if (!fallbackError && error instanceof Error) fallbackError = error;
    }
  }

  if (fallbackRows) return fallbackRows;
  if (fallbackError) throw fallbackError;
  throw new Error("Failed to parse CSV input.");
}

function collectColumns(rows: Array<Record<string, unknown>>) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)).map((column) => String(column || "").trim()).filter(Boolean)));
}

function stringifyCellForPreview(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return normalizeText(value);
}

function normalizePreviewRow(row: Record<string, unknown>, columns: string[]) {
  const normalized: Record<string, string> = {};
  for (const column of columns) normalized[column] = stringifyCellForPreview(row[column]);
  return normalized;
}

function parseBufferRows(fileName: string, buffer: Buffer) {
  const lowerName = fileName.toLowerCase();
  let rawRows: Array<Record<string, unknown>> = [];

  if (lowerName.endsWith(".csv")) {
    rawRows = parseCsvRowsWithEncodingFallback(buffer);
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } else if (lowerName.endsWith(".json")) {
    rawRows = parseJsonRows(decodeDelimitedTextBuffer(buffer));
  } else if (lowerName.endsWith(".jsonl")) {
    rawRows = parseJsonlRows(decodeDelimitedTextBuffer(buffer));
  } else {
    throw new Error("Only .csv, .xlsx, .xlsm, .json, and .jsonl files are supported.");
  }
  return rawRows;
}

function parseFile(fileName: string, fileBase64: string, options?: { skipFileSizeLimit?: boolean }): ParsedFile {
  if (!options?.skipFileSizeLimit) ensureFileSize(fileBase64);
  const buffer = Buffer.from(fileBase64, "base64");
  const rawRows = parseBufferRows(fileName, buffer);

  const columns = collectColumns(rawRows);
  const sampleRows = rawRows.map((row) => normalizePreviewRow(row, columns));

  if (!rawRows.length) throw new Error("Uploaded file is empty.");
  if (!options?.skipFileSizeLimit && rawRows.length > ggCleaningUploadMaxRows) {
    throw new Error(`GG cleaning supports up to ${ggCleaningUploadMaxRows} rows per run.`);
  }

  return { rawRows, sampleRows, columns };
}

async function* iterateRawRowsFromFile(filePath: string, fileName: string): AsyncGenerator<Record<string, unknown>> {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const handle = await fs.open(filePath, "r");
    const sampleBuffer = Buffer.alloc(16 * 1024);
    const { bytesRead } = await handle.read(sampleBuffer, 0, sampleBuffer.length, 0);
    await handle.close();
    const sample = sampleBuffer.subarray(0, bytesRead);
    const encodingCandidates = [
      { name: "utf8", text: iconv.decode(sample, "utf8"), encoding: "utf8" as const },
      { name: "gb18030", text: iconv.decode(sample, "gb18030"), encoding: "gb18030" as const },
      { name: "utf16-le", text: iconv.decode(sample, "utf16-le"), encoding: "utf16-le" as const },
    ];
    let streamEncoding: "utf8" | "gb18030" | "utf16-le" = "utf8";
    for (const candidate of encodingCandidates) {
      try {
        const columns = collectColumnsFromHeaderLine(candidate.text);
        if (hasRequiredCollectedColumns(columns)) {
          streamEncoding = candidate.encoding;
          break;
        }
      } catch {
        continue;
      }
    }
    const parser = createReadStream(filePath)
      .pipe(iconv.decodeStream(streamEncoding))
      .pipe(parseCsvStream({ columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, bom: true }));
    for await (const row of parser) {
      yield row as Record<string, unknown>;
    }
    return;
  }

  if (lowerName.endsWith(".jsonl")) {
    const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;
      yield JSON.parse(trimmed) as Record<string, unknown>;
    }
    return;
  }

  const buffer = await fs.readFile(filePath);
  for (const row of parseBufferRows(fileName, buffer)) {
    yield row;
  }
}

function detectInputMode(columns: string[]): GgCleaningInputMode {
  const hasRequiredColumns = GG_COLLECTED_REQUIRED_COLUMNS.every((column) => columns.includes(column));
  if (!hasRequiredColumns) {
    throw new Error(`Uploaded file must contain collected-table columns: ${GG_COLLECTED_REQUIRED_COLUMNS.join(", ")}`);
  }
  return "raw";
}

function sampleColumns(rows: Array<Record<string, string>>, columns: string[]) {
  return columns.map((name) => ({
    name,
    sampleValues: Array.from(new Set(rows.map((row) => normalizeText(row[name])).filter(Boolean).slice(0, 4))),
  }));
}

export function buildGgCleaningPreviewFromMetadata(input: PreviewBuildInput): GgCleaningPreview {
  const inputMode = detectInputMode(input.columns);
  const sampleRows = input.sampleRawRows.slice(0, 5).map((row) => normalizePreviewRow(row, input.columns));

  if (!input.totalRows) {
    throw new Error("Uploaded file does not contain any valid GG cleaning rows in the collected-table format.");
  }

  return {
    inputMode,
    totalRows: input.totalRows,
    groupedRows: input.groupedRows,
    groupedRowsEstimated: input.groupedRowsEstimated,
    chunkCount: input.chunkCount,
    oversizedGroupCount: input.oversizedGroupCount,
    previewStrategy: input.previewStrategy || "full",
    columns: sampleColumns(sampleRows, input.columns),
    sampleRows,
  };
}

function canonicalFactType(value: string) {
  const raw = normalizeText(value);
  const lowered = raw.toLowerCase();
  if (!lowered) return "";
  for (const [needle, target] of FACT_TYPE_ALIASES) {
    if (lowered.includes(needle)) return target;
  }
  return raw;
}

function normalizeDomain(value: string) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "";
  const stripped = raw.replace(/^https?:\/\//, "");
  return stripped.split(/[/?#]/)[0].replace(/^\.+/, "");
}

function normalizePathname(value: string) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw || raw === "/") return "";
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, "");
}

function parseDomainReference(value: unknown) {
  const raw = String(value ?? "");
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, host: "", pathname: "" };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return {
      raw,
      host: normalizeDomain(parsed.hostname),
      pathname: normalizePathname(parsed.pathname),
    };
  } catch {
    const stripped = trimmed.replace(/^https?:\/\//i, "").split(/[?#]/)[0];
    const slashIndex = stripped.indexOf("/");
    const hostPart = slashIndex >= 0 ? stripped.slice(0, slashIndex) : stripped;
    const pathPart = slashIndex >= 0 ? stripped.slice(slashIndex) : "";
    return {
      raw,
      host: normalizeDomain(hostPart),
      pathname: normalizePathname(pathPart),
    };
  }
}

function cleanSnippetText(value: string) {
  return normalizeText(value)
    .replace(/^\[\s*"/, "")
    .replace(/"\s*\]$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\+"/g, "\"")
    // Strip actual HTML tags without deleting business text like <ID.me> or <10%>.
    .replace(/<\/?(?:[a-z][a-z0-9-]*)(?:\s+[^<>]*)?>/gi, " ")
    .replace(/\{Link:\s*/gi, "")
    .replace(/\s*(All anzeigen|Alle anzeigen|View all|Mostrar todo|Mostrar mais|모두 표시|了解详情|Mehr anzeigen).*$/i, "")
    .replace(/\s*(Would you like|Do you have|Are you looking for|Se recomienda revisar|AI answers can|AI 回答可能包含错误|AI 답변에 오류가 있을 수 있습니다).*$/i, "")
    .replace(/\b(?:Profundizar en Modo IA|Preguntar|Frage dazu stellen|질문하기|공유|Opinión positiva|Opinión negativa)\b/gi, " ")
    .replace(/\s+\+\d+\b/g, " ")
    .replace(/[{}]/g, "")
    .replace(/^\[+|\]+$/g, "")
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|\s+(?=(?:Yes|No|Ja|Nein|Sí|Si|Tak|네|아니))/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}

function getLeadSentences(text: string, limit = 2) {
  return splitIntoSentences(text).slice(0, limit);
}

function normalizeForMatch(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function includesFallback(text: string, clues: string[] | undefined) {
  if (!clues?.length) return false;
  const normalized = normalizeForMatch(text);
  return clues.some((clue) => normalized.includes(normalizeForMatch(clue)));
}

function getFactRule(factType: string): FactRuleConfig {
  return FACT_RULES[factType] || { positive: [], negative: [] };
}

function hasExplicitFactTerm(text: string, factType: string) {
  const rule = getFactRule(factType);
  if (rule.explicitTerms?.some((pattern) => pattern.test(text))) return true;
  const loweredFactType = factType.toLowerCase().trim();
  return Boolean(loweredFactType && text.toLowerCase().includes(loweredFactType));
}

function scoreLeadScreeningSentence(sentence: string, factType: string, index: number): SentenceEvidence | null {
  if (index >= 2) return null;
  const leadBoost = 1;
  const explicitNoPatterns = LEAD_EXPLICIT_NO_PATTERNS[factType] || [];
  if (hasPattern(sentence, explicitNoPatterns)) {
    return {
      existence: "no",
      reasonCn: "前两句出现明确否定证据",
      matchedRule: "lead_explicit_no",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 8 + leadBoost,
    };
  }

  const explicitYesPatterns = LEAD_EXPLICIT_YES_PATTERNS[factType] || [];
  if (
    hasPattern(sentence, explicitYesPatterns) &&
    !hasPattern(sentence, GENERIC_NEGATIVE_PATTERNS) &&
    !hasPattern(sentence, LEAD_NEGATIVE_CUE_PATTERNS) &&
    !NEGATIVE_PREFIX.test(sentence)
  ) {
    return {
      existence: "yes",
      reasonCn: "前两句出现明确肯定证据",
      matchedRule: "lead_explicit_yes",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 8 + leadBoost,
    };
  }

  if (
    LEAD_SCREENING_YES_FACT_TYPES.has(factType) &&
    !hasPattern(sentence, GENERIC_NEGATIVE_PATTERNS) &&
    !hasPattern(sentence, LEAD_NEGATIVE_CUE_PATTERNS) &&
    hasExplicitFactTerm(sentence, factType) &&
    hasPattern(sentence, GENERIC_BENEFIT_PATTERNS)
  ) {
    return {
      existence: "yes",
      reasonCn: "前两句出现初筛正向权益信号",
      matchedRule: "lead_screening_yes",
      evidenceSentence: sentence,
      confidenceBucket: "weak",
      score: 5 + leadBoost,
    };
  }

  return null;
}

function scoreSentence(sentence: string, factType: string, index: number): SentenceEvidence {
  const rule = getFactRule(factType);
  const fallback = FACT_FALLBACK_CLUES[factType];
  const leadBoost = index < 2 ? 1 : 0;
  const explicit = hasExplicitFactTerm(sentence, factType);
  const matchedFactPositive = hasPattern(sentence, rule.positive);
  const returnCostAmbiguous = factType === "return" && hasPattern(sentence, RETURN_COST_AMBIGUOUS_PATTERNS);
  const matchedFactNegative = hasPattern(sentence, rule.negative) && !returnCostAmbiguous;
  const matchedGenericNegative = hasPattern(sentence, GENERIC_NEGATIVE_PATTERNS) && explicit && !returnCostAmbiguous;
  const crossEntityContrast =
    CROSS_ENTITY_SENSITIVE_FACT_TYPES.has(factType) &&
    hasPattern(sentence, CROSS_ENTITY_CONTRAST_PATTERNS);
  const leadingNegativeCue = index < 2 && hasPattern(sentence, LEAD_NEGATIVE_CUE_PATTERNS);
  const affirmativePrefixBlocked =
    hasPattern(sentence, AFFIRMATIVE_PREFIX_DISQUALIFIER_PATTERNS) ||
    (factType === "shipping" && (
      hasPattern(sentence, SHIPPING_HARD_NEGATIVE_PATTERNS) ||
      hasPattern(sentence, SHIPPING_LIMITED_POSITIVE_PATTERNS) ||
      hasPattern(sentence, SHIPPING_AMBIGUOUS_ENTITY_PATTERNS)
    ));
  const strongMerchantPositive =
    explicit &&
    matchedFactPositive &&
    !matchedFactNegative &&
    !matchedGenericNegative &&
    !crossEntityContrast &&
    !affirmativePrefixBlocked;

  const earlyLeadScreeningEvidence = scoreLeadScreeningSentence(sentence, factType, index);
  if (earlyLeadScreeningEvidence?.existence === "no") return earlyLeadScreeningEvidence;

  if (rule.ignore?.some((pattern) => pattern.test(sentence)) && (!explicit || factType === "app")) {
    return {
      existence: "unknown",
      reasonCn: "忽略上下文噪音",
      matchedRule: "ignored_context",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  let positiveScore = 0;
  let negativeScore = 0;
  let matchedRule = "no_match";
  let newsletterContrastPositive = false;

  if (factType === "military" && hasPattern(sentence, MILITARY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "military_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "referral" && hasPattern(sentence, REFERRAL_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "referral_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "referral" && hasPattern(sentence, REFERRAL_HARD_NEGATIVE_EXTRA_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "referral_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "first responder" && hasPattern(sentence, FIRST_RESPONDER_HARD_NEGATIVE_EXTRA_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "first_responder_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "aaa" && hasPattern(sentence, AAA_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "aaa_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "aaa" && hasPattern(sentence, AAA_HARD_NEGATIVE_EXTRA_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "aaa_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "birthday" && hasPattern(sentence, BIRTHDAY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "birthday_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "birthday" && hasPattern(sentence, BIRTHDAY_STRONG_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule: "birthday_strong_positive",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "loyalty program" && hasPattern(sentence, LOYALTY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "loyalty_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "price guarantee" && hasPattern(sentence, PRICE_GUARANTEE_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "price_guarantee_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "senior" && hasPattern(sentence, SENIOR_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "senior_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "employee" && hasPattern(sentence, EMPLOYEE_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "employee_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "employee" && hasPattern(sentence, EMPLOYEE_HARD_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule: "employee_hard_positive",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (
    factType === "app" &&
    hasPattern(sentence, APP_CROSS_ENTITY_NEGATIVE_PATTERNS)
  ) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现跨主体否定证据" : "正文出现跨主体否定证据",
      matchedRule: "app_cross_entity_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "blue light card" && hasPattern(sentence, BLUE_LIGHT_CARD_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "blue_light_card_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "family" && hasPattern(sentence, FAMILY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "family_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (
    factType === "gift card" &&
    hasPattern(sentence, GIFT_CARD_HARD_NEGATIVE_PATTERNS) &&
    !hasPattern(sentence, GIFT_CARD_STRONG_POSITIVE_PATTERNS)
  ) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "gift_card_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "gift card" && hasPattern(sentence, GIFT_CARD_STRONG_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule: "gift_card_strong_positive",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (
    factType === "teacher" &&
    hasPattern(sentence, TEACHER_HARD_NEGATIVE_PATTERNS) &&
    hasPattern(sentence, TEACHER_PLATFORM_AMBIGUOUS_PATTERNS)
  ) {
    return {
      existence: "unknown",
      reasonCn: "官方直连与第三方平台信息混杂",
      matchedRule: "teacher_negative_with_platform_ambiguity",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "teacher" && hasPattern(sentence, TEACHER_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "teacher_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "first responder" && hasPattern(sentence, FIRST_RESPONDER_AMBIGUOUS_ENTITY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "主体存在歧义",
      matchedRule: "first_responder_ambiguous_entity",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "shipping" && hasPattern(sentence, SHIPPING_AMBIGUOUS_ENTITY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "主体存在歧义",
      matchedRule: "shipping_ambiguous_entity",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "shipping" && hasPattern(sentence, SHIPPING_SELLER_DEPENDENT_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: index < 2 ? "前两句显示配送权益依卖家或商品而变" : "正文显示配送权益依卖家或商品而变",
      matchedRule: "shipping_seller_dependent",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "shipping" && hasPattern(sentence, SHIPPING_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "shipping_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "shipping" && hasPattern(sentence, SHIPPING_LIMITED_POSITIVE_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: index < 2 ? "前两句仅出现条件式配送权益" : "正文仅出现条件式配送权益",
      matchedRule: "shipping_limited_positive",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (
    crossEntityContrast &&
    (
      matchedFactNegative ||
      matchedGenericNegative ||
      includesFallback(sentence, fallback?.negative)
    )
  ) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现跨主体否定证据" : "正文出现跨主体否定证据",
      matchedRule: "cross_entity_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "teacher" && hasPattern(sentence, TEACHER_PLATFORM_AMBIGUOUS_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "仅提到第三方教师平台",
      matchedRule: "teacher_platform_ambiguous",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "child" && hasPattern(sentence, CHILD_AMBIGUOUS_ENTITY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "主体存在歧义",
      matchedRule: "child_ambiguous_entity",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "child" && hasPattern(sentence, CHILD_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule: "child_hard_negative",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "child" && hasPattern(sentence, CHILD_STRONG_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule: "child_strong_positive",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "new customer" && hasPattern(sentence, NEW_CUSTOMER_HARD_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule: "new_customer_hard_positive",
      evidenceSentence: sentence,
      confidenceBucket: "strong",
      score: 7 + leadBoost,
    };
  }

  if (factType === "military" && hasPattern(sentence, MILITARY_FALSE_POSITIVE_PATTERNS)) {
    negativeScore += 5 + leadBoost;
    matchedRule = "military_false_positive_context";
  }

  if (factType === "referral" && hasPattern(sentence, REFERRAL_NON_CONSUMER_PATTERNS)) {
    negativeScore += 5 + leadBoost;
    matchedRule = "referral_non_consumer";
  }

  if (factType === "teacher" && hasPattern(sentence, TEACHER_CROSS_ENTITY_PATTERNS)) {
    negativeScore += 5 + leadBoost;
    matchedRule = "teacher_cross_entity";
  }

  if (factType === "newsletter/first order/sign up/") {
    const newsletterStrongPositive = hasPattern(sentence, NEWSLETTER_STRONG_POSITIVE_PATTERNS);
    const referralLikeSentence = /\breferral program\b/i.test(sentence) || /\binvited by a friend\b/i.test(sentence) || /推荐计划/.test(sentence);
    const contrastiveNegative = hasPattern(sentence, NEWSLETTER_CONTRAST_PATTERNS);
    if (newsletterStrongPositive && !referralLikeSentence) {
      positiveScore += 4 + leadBoost;
      matchedRule = "newsletter_strong_positive";
    }
    if (newsletterStrongPositive && contrastiveNegative && !referralLikeSentence) {
      newsletterContrastPositive = true;
      positiveScore += 2;
      negativeScore = Math.max(0, negativeScore - 2);
      matchedRule = "newsletter_contrast_positive";
    }
  }

  if (factType === "existing customer" && hasPattern(sentence, EXISTING_CUSTOMER_HARD_POSITIVE_PATTERNS)) {
    positiveScore += 5 + leadBoost;
    matchedRule = "existing_customer_strong_positive";
  }

  if (factType === "existing customer" && hasPattern(sentence, EXISTING_CUSTOMER_AMBIGUOUS_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "现有客户权益表述混合且不稳定",
      matchedRule: "existing_customer_ambiguous",
      evidenceSentence: sentence,
      confidenceBucket: "none",
      score: 0,
    };
  }

  const leadScreeningEvidence = earlyLeadScreeningEvidence;
  if (leadScreeningEvidence) return leadScreeningEvidence;

  if (factType === "shipping" && hasPattern(sentence, SHIPPING_INFERENCE_ONLY_PATTERNS)) {
    positiveScore = Math.max(0, positiveScore - 3);
    negativeScore = Math.max(0, negativeScore - 1);
    matchedRule = matchedRule === "no_match" ? "shipping_inference_only" : matchedRule;
  }

  if (
    factType === "child" &&
    hasPattern(sentence, CHILD_NON_DISCOUNT_CONTEXT_PATTERNS) &&
    !matchedFactPositive
  ) {
    negativeScore += 4 + leadBoost;
    matchedRule = "child_non_discount_context";
  }

  if (leadingNegativeCue && !strongMerchantPositive) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现前置明确否定证据" : "正文出现前置明确否定证据",
      matchedRule: "lead_negative_cue",
      evidenceSentence: sentence,
      confidenceBucket: "weak",
      score: 5 + leadBoost,
    };
  }

  if (AFFIRMATIVE_PREFIX.test(sentence) && strongMerchantPositive) {
    positiveScore += 2 + leadBoost;
    matchedRule = "affirmative_prefix";
  }
  if (NEGATIVE_PREFIX.test(sentence) && (explicit || hasPattern(sentence, GENERIC_NEGATIVE_PATTERNS))) {
    negativeScore += 3 + leadBoost;
    matchedRule = "negative_prefix";
  }
  if (matchedFactPositive && !matchedFactNegative && !matchedGenericNegative) {
    positiveScore += explicit || !rule.explicitTerms?.length ? 3 + leadBoost : 2 + leadBoost;
    matchedRule = matchedRule === "no_match" ? "fact_positive" : matchedRule;
  }
  if (matchedFactNegative) {
    negativeScore += 4 + leadBoost;
    if (!newsletterContrastPositive) positiveScore = 0;
    matchedRule = matchedRule === "no_match" ? "fact_negative" : matchedRule;
  }
  if (matchedGenericNegative) {
    negativeScore += 4 + leadBoost;
    if (!newsletterContrastPositive) positiveScore = 0;
    matchedRule = matchedRule === "no_match" ? "generic_negative" : matchedRule;
  }
  if (includesFallback(sentence, fallback?.negative) && !includesFallback(sentence, fallback?.positive)) {
    negativeScore += 3 + leadBoost;
    if (!newsletterContrastPositive) positiveScore = 0;
    matchedRule = matchedRule === "no_match" ? "fallback_negative" : matchedRule;
  }
  if (includesFallback(sentence, fallback?.positive) && !matchedFactNegative && !matchedGenericNegative && !crossEntityContrast) {
    positiveScore += 3 + leadBoost;
    matchedRule = matchedRule === "no_match" ? "fallback_positive" : matchedRule;
  }
  if (!matchedFactNegative && !matchedGenericNegative && explicit && !STRICT_FACT_TYPES_FOR_GENERIC_BENEFIT.has(factType) && hasPattern(sentence, GENERIC_BENEFIT_PATTERNS) && !crossEntityContrast) {
    positiveScore += 2 + leadBoost;
    matchedRule = matchedRule === "no_match" ? "explicit_benefit" : matchedRule;
  }
  if (hasPattern(sentence, GENERIC_AMBIGUOUS_PATTERNS)) {
    positiveScore = Math.max(0, positiveScore - 1);
  }

  if (negativeScore >= positiveScore + 2 && negativeScore >= 3) {
    return {
      existence: "no",
      reasonCn: index < 2 ? "前两句出现明确否定证据" : "正文出现明确否定证据",
      matchedRule,
      evidenceSentence: sentence,
      confidenceBucket: negativeScore >= 5 ? "strong" : "weak",
      score: negativeScore,
    };
  }

  if (positiveScore > negativeScore && positiveScore >= 3) {
    return {
      existence: "yes",
      reasonCn: index < 2 ? "前两句出现明确肯定证据" : "正文出现明确肯定证据",
      matchedRule,
      evidenceSentence: sentence,
      confidenceBucket: positiveScore >= 5 ? "strong" : "weak",
      score: positiveScore,
    };
  }

  return {
    existence: "unknown",
    reasonCn: "句子证据不足",
    matchedRule,
    evidenceSentence: sentence,
    confidenceBucket: "none",
    score: Math.max(positiveScore, negativeScore),
  };
}

function parseSnippetCell(value: unknown) {
  return parseCollectedSnippetCell(value, cleanSnippetText);
}

function parseProductUrlsCell(value: unknown) {
  return parseCollectedProductUrlsCell(value, normalizeCollectedUrl);
}

function explainExistence(factType: string, snippet: string): SentenceEvidence {
  const text = cleanSnippetText(snippet);
  const rule = FACT_RULES[factType] || { positive: [], negative: [] };
  const fallback = FACT_FALLBACK_CLUES[factType];
  if (!text) {
    return {
      existence: "unknown",
      reasonCn: "snippet 为空",
      matchedRule: "empty_snippet",
      evidenceSentence: "",
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (
    factType === "app" &&
    (
      /\b(?:depending on which|several different entities|could you specify|to give you the most accurate answer)\b/i.test(text) ||
      /\bdoesn'?t have a standalone\b.{0,20}\b(?:discount )?app\b/i.test(text) && /\bdigital portal\b/i.test(text)
    )
  ) {
    return {
      existence: "unknown",
      reasonCn: "主体或应用形态存在歧义",
      matchedRule: "app_ambiguous_entity_or_portal",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "app" && hasPattern(text, APP_CROSS_ENTITY_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文显示优惠主体不是当前商家",
      matchedRule: "app_cross_entity_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "app" && hasPattern(text, LEAD_EXPLICIT_NO_PATTERNS.app || [])) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "lead_explicit_no",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 8,
    };
  }

  if (
    factType === "first responder" &&
    hasPattern(text, FIRST_RESPONDER_AMBIGUOUS_ENTITY_PATTERNS)
  ) {
    return {
      existence: "unknown",
      reasonCn: "主体不明确，存在同名或跨品牌混淆",
      matchedRule: "first_responder_ambiguous_entity",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "military" && hasPattern(text, MILITARY_AMBIGUOUS_ENTITY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "主体不明确，正文主要在谈其他军品商家",
      matchedRule: "military_ambiguous_entity",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "senior" && hasPattern(text, SENIOR_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "senior_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "military" && hasPattern(text, MILITARY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "military_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "first responder" && hasPattern(text, FIRST_RESPONDER_HARD_NEGATIVE_EXTRA_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "first_responder_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (
    factType === "referral" &&
    (hasPattern(text, REFERRAL_NON_CONSUMER_PATTERNS) || hasPattern(text, REFERRAL_HARD_NEGATIVE_PATTERNS))
  ) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: hasPattern(text, REFERRAL_NON_CONSUMER_PATTERNS) ? "referral_non_consumer" : "referral_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "birthday" && hasPattern(text, BIRTHDAY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "birthday_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "child" && hasPattern(text, CHILD_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "child_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "employee" && hasPattern(text, EMPLOYEE_HARD_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: "全文存在明确肯定证据",
      matchedRule: "employee_hard_positive",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "new customer" && hasPattern(text, NEW_CUSTOMER_HARD_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: "全文存在明确肯定证据",
      matchedRule: "new_customer_hard_positive",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (
    factType === "existing customer" &&
    hasPattern(text, EXISTING_CUSTOMER_HARD_POSITIVE_PATTERNS) &&
    !hasPattern(text, EXISTING_CUSTOMER_HARD_NEGATIVE_PATTERNS) &&
    !hasPattern(text, EXISTING_CUSTOMER_AMBIGUOUS_PATTERNS)
  ) {
    return {
      existence: "yes",
      reasonCn: "全文存在明确肯定证据",
      matchedRule: "existing_customer_strong_positive",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (
    factType === "existing customer" &&
    hasPattern(text, EXISTING_CUSTOMER_HARD_NEGATIVE_PATTERNS) &&
    !hasPattern(text, EXISTING_CUSTOMER_AMBIGUOUS_PATTERNS) &&
    !hasPattern(text, EXISTING_CUSTOMER_HARD_POSITIVE_PATTERNS)
  ) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "existing_customer_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "blue light card" && hasPattern(text, BLUE_LIGHT_CARD_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "blue_light_card_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "family" && hasPattern(text, FAMILY_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "family_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "gift card" && hasPattern(text, GIFT_CARD_PLATFORM_SELF_SERVICE_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: "全文存在明确肯定证据",
      matchedRule: "gift_card_platform_self_service_positive",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "gift card" && hasPattern(text, GIFT_CARD_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "gift_card_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "gift card" && hasPattern(text, GIFT_CARD_STRONG_POSITIVE_PATTERNS)) {
    return {
      existence: "yes",
      reasonCn: "全文存在明确肯定证据",
      matchedRule: "gift_card_strong_positive",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (factType === "return" && hasPattern(text, RETURN_AMBIGUOUS_POLICY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "退货政策依商品或卖家而变",
      matchedRule: "return_ambiguous_policy",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "shipping" && hasPattern(text, SHIPPING_AMBIGUOUS_ENTITY_PATTERNS)) {
    return {
      existence: "unknown",
      reasonCn: "主体不明确，存在跨实体或跨品牌混淆",
      matchedRule: "shipping_ambiguous_entity",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: 0,
    };
  }

  if (factType === "shipping" && hasPattern(text, SHIPPING_HARD_NEGATIVE_PATTERNS)) {
    return {
      existence: "no",
      reasonCn: "全文存在明确否定证据",
      matchedRule: "shipping_hard_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  if (
    CROSS_ENTITY_SENSITIVE_FACT_TYPES.has(factType) &&
    hasPattern(text, CROSS_ENTITY_CONTRAST_PATTERNS) &&
    (
      hasPattern(text, rule.negative) ||
      includesFallback(text, fallback?.negative) ||
      hasPattern(text, GENERIC_NEGATIVE_PATTERNS)
    )
  ) {
    return {
      existence: "no",
      reasonCn: "全文显示优惠主体不是当前商家",
      matchedRule: "cross_entity_negative",
      evidenceSentence: getLeadSentences(text, 2).join(" "),
      confidenceBucket: "strong",
      score: 7,
    };
  }

  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    return {
      existence: "unknown",
      reasonCn: "未提取到有效句子",
      matchedRule: "empty_snippet",
      evidenceSentence: "",
      confidenceBucket: "none",
      score: 0,
    };
  }

  const scored = sentences.map((sentence, index) => scoreSentence(sentence, factType, index));
  const hasCrossEntityContrastText =
    CROSS_ENTITY_UNKNOWN_FACT_TYPES.has(factType) &&
    hasPattern(text, CROSS_ENTITY_CONTRAST_PATTERNS);
  const leadScored = scored.slice(0, 2);
  const leadBestYes = leadScored
    .filter((item) => item.existence === "yes")
    .sort((left, right) => right.score - left.score)[0];
  const leadBestNo = leadScored
    .filter((item) => item.existence === "no")
    .sort((left, right) => right.score - left.score)[0];
  const bestYes = scored
    .filter((item) => item.existence === "yes")
    .sort((left, right) => right.score - left.score)[0];
  const bestNo = scored
    .filter((item) => item.existence === "no")
    .sort((left, right) => right.score - left.score)[0];
  const leadNoOverridesLaterYes =
    Boolean(leadBestNo) &&
    leadBestNo.confidenceBucket === "strong" &&
    (
      leadBestNo.matchedRule.includes("hard_negative") ||
      leadBestNo.matchedRule === "fact_negative" ||
      leadBestNo.matchedRule === "generic_negative" ||
      leadBestNo.matchedRule === "fallback_negative" ||
      leadBestNo.matchedRule === "cross_entity_negative"
    ) &&
    (!leadBestYes || leadBestNo.score >= leadBestYes.score);

  if (leadNoOverridesLaterYes) {
    return leadBestNo!;
  }

  if (leadBestNo && leadBestNo.score >= (bestYes?.score ?? -1) && (!leadBestYes || leadBestNo.score > leadBestYes.score)) {
    return leadBestNo;
  }
  if (leadBestYes && leadBestYes.score >= (bestNo?.score ?? -1) && (!leadBestNo || leadBestYes.score > leadBestNo.score)) {
    return leadBestYes;
  }

  if (bestNo && (!bestYes || bestNo.score >= bestYes.score + 2)) return bestNo;
  if (hasCrossEntityContrastText && bestYes && !bestNo) {
    return {
      existence: "unknown",
      reasonCn: "全文存在跨主体污染，无法确认 yes 是否属于当前商家",
      matchedRule: "cross_entity_unknown",
      evidenceSentence: bestYes.evidenceSentence || getLeadSentences(text, 2).join(" "),
      confidenceBucket: "none",
      score: bestYes.score,
    };
  }
  if (bestYes && (!bestNo || bestYes.score > bestNo.score)) return bestYes;

  if (bestYes && bestNo) {
    return {
      existence: "unknown",
      reasonCn: "存在冲突证据",
      matchedRule: "sentence_conflict",
      evidenceSentence: `${bestYes.evidenceSentence} || ${bestNo.evidenceSentence}`,
      confidenceBucket: "none",
      score: Math.max(bestYes.score, bestNo.score),
    };
  }

  return {
    existence: "unknown",
    reasonCn: "没有找到明确证据",
    matchedRule: "no_match",
    evidenceSentence: getLeadSentences(text, 2).join(" "),
    confidenceBucket: "none",
    score: 0,
  };
}

function normalizeValue(value: string) {
  const raw = normalizeText(value).replace(/[.,;:]+$/g, "");
  if (!raw) return "";
  const freeShipping = raw.match(/^min_free_shipping:\s*([0-9][0-9.,]*)\s+([A-Z]{3})$/i);
  if (freeShipping) return `min_free_shipping: ${normalizeNumericValue(freeShipping[1])} ${freeShipping[2].toUpperCase()}`;
  const amount = raw.match(/^([0-9][0-9.,]*)\s+([A-Z]{3})$/i);
  if (amount) return `${normalizeNumericValue(amount[1])} ${amount[2].toUpperCase()}`;
  const percent = raw.match(/^([0-9][0-9.,]*)\s*%$/);
  if (percent) return `${normalizeNumericValue(percent[1])}%`;
  return raw;
}

function normalizeNumericValue(value: string) {
  const raw = normalizeText(value).replace(/\s+/g, "");
  if (!raw) return "";

  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
    return stripTrailingZeros(raw.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
    return stripTrailingZeros(raw.replace(/,/g, ""));
  }
  if (/^\d+,\d+$/.test(raw)) {
    return stripTrailingZeros(raw.replace(",", "."));
  }
  if (/^\d+\.\d+$/.test(raw)) {
    return stripTrailingZeros(raw);
  }
  return raw.replace(/,/g, "");
}

function stripTrailingZeros(value: string) {
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
}

function defaultCurrencyForCountry(country: string) {
  switch (normalizeText(country).toUpperCase()) {
    case "US":
      return "USD";
    case "UK":
      return "GBP";
    case "DE":
    case "FR":
    case "NL":
    case "ES":
      return "EUR";
    case "PL":
      return "PLN";
    case "KR":
      return "KRW";
    default:
      return "";
  }
}

const VALUE_SKIP_FACT_TYPES = new Set(["return", "price guarantee"]);
const VALUE_REQUIRE_FACT_SIGNAL = new Set([
  "aaa",
  "app",
  "birthday",
  "employee",
  "existing customer",
  "family",
  "first responder",
  "loyalty program",
  "military",
  "newsletter/first order/sign up/",
  "referral",
  "senior",
]);

const VALUE_CONTEXT_PATTERNS = [
  /\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|deal|sale|commission|perks?|korting|voordeel|remise|r[ée]duction)\b/i,
  /\b(?:newsletter|sign[ -]?up|signup|welcome|first order|first purchase|new customer|existing customer|loyalty|membership|member(?:ship)?|refer(?: a friend)?|referral|nieuwsbrief|inschrijving|aanmelding|offre de bienvenue|premi[èe]re commande)\b/i,
  /\b(?:student|teacher|military|veteran|senior|birthday|employee|staff|family|child|kids?|app|studenten|[ée]tudiant\w*)\b/i,
  /\b(?:free shipping|shipping|delivery|gratis verzending|gratis bezorging|gratis levering|gratis bezorgd|gratis geleverd|livraison gratuite|livraison offerte)\b/i,
  /\b(?:rabat\w*|zni[żz]k\w*|voucher|gutschein\w*|angebot\w*|willkommensrabatt|newsletter-rabatt|mitarbeiter\w*|versand\w*|versandkostenfrei|welkomstkorting|studentenkorting)\b/i,
  /(?:优惠|折扣|券|返现|积分|礼包|会员)/,
  /\b(?:할인|혜택|쿠폰|포인트|적립)\b/i,
];

const VALUE_NEGATIVE_PATTERNS = [
  ...GENERIC_NEGATIVE_PATTERNS,
  /\bno\b.{0,35}\b(?:specific|dedicated|official|public|clear)\b.{0,20}\b(?:discount|offer|benefit|value)\b/i,
  /\bkein(?:e|en|em|er)?\b.{0,35}\b(?:verifizierten?|direkten?|expliziten?)\b.{0,20}\bhinweis(?:e)?\b/i,
  /\bkeine?\b.{0,35}\b(?:spezifischen?|konkreten?|offiziellen?)\b.{0,20}\b(?:rabatt|wert|angebot)\b/i,
  /\bbrak\b.{0,30}\b(?:konkretnej?|wyraźnej?|jednoznacznej?)\b.{0,20}\b(?:zniżki|wartości|oferty)\b/i,
  /\bno\b.{0,20}\b(?:free returns?|return shipping)\b/i,
  /\bkeine?\b.{0,20}\b(?:kostenlosen?|gratis)\b.{0,20}\br[üu]cksend\w*\b/i,
];

const VALUE_HARD_EMPTY_PATTERNS: Partial<Record<string, RegExp[]>> = {
  birthday: BIRTHDAY_HARD_NEGATIVE_PATTERNS,
  employee: EMPLOYEE_HARD_NEGATIVE_PATTERNS,
  family: FAMILY_HARD_NEGATIVE_PATTERNS,
  "first responder": FIRST_RESPONDER_HARD_NEGATIVE_EXTRA_PATTERNS,
  military: MILITARY_HARD_NEGATIVE_PATTERNS,
};

const VALUE_CROSS_ENTITY_SKIP_PATTERNS = [
  /\balternative (?:pet )?stores?\b/i,
  /\bother retailers?\b/i,
  /\bretailers? like\b/i,
  /\bif you are specifically looking for\b/i,
  /\bif you are looking for stores that offer\b/i,
  /\bsimilar to what aaa might provide\b/i,
  /\by no con\b/i,
  /\by no con oviala\b/i,
  /\bnot with\b.{0,20}\boviala\b/i,
  /\best[aá]n relacionadas con ikea\b/i,
];

const VALUE_RANGE_OR_APPROXIMATE_PATTERNS = [
  /\b(?:about|around|approximately|approx\.?|typically|usually|often|roughly|can range|ranging from)\b/i,
  /\b(?:up to|hasta|bis zu|do|nawet)\b/i,
  /[0-9][0-9.,]*\s*(?:-|to|–)\s*[0-9][0-9.,]*/i,
];

const VALUE_POINTS_ONLY_SKIP_PATTERNS = [
  /\bpoints?\b.{0,20}\bper\b.{0,10}(?:\$|USD|GBP|EUR|PLN|KRW)?\s*[0-9]/i,
  /\b(?:birthday|loyalty)\b.{0,30}\bpoints?\b/i,
  /\bpoints?\b.{0,30}\b(?:earned|earn|redeem(?:able)?)\b/i,
];

const VALUE_FACT_SPECIFIC_SKIP_PATTERNS: Partial<Record<string, RegExp[]>> = {
  birthday: [
    /\b(?:newsletter|welcome|sign[ -]?up|signup|first order|first purchase|subscriber)\b/i,
    /\b(?:member|membership|loyalty|club)\b.{0,30}\b(?:discount|benefit|perk|reward)\b/i,
  ],
  family: [
    /\bikea family\b/i,
    /\b(?:member|membership|loyalty|club|mitglied(?:er)?|mitgliedschaft)\b.{0,35}\b(?:discount|benefit|perk|offer|rabatt|vorteil)\b/i,
    /\bmitgliederrabatt\b/i,
    /\bkeinen?\b.{0,35}\b(?:spezifischen|pauschalen)\b.{0,20}\bfamilienrabatt\b/i,
    /\bkein(?:en|e|er|em)?\b.{0,80}\bfamilienrabatt\b/i,
  ],
  senior: [
    /\b(?:newsletter|welcome|sign[ -]?up|signup|first order|first purchase)\b/i,
    /\b(?:best buy|trade-in|recycle|recycling)\b/i,
  ],
};

const SENIOR_RANGE_VALUE_PATTERNS = [
  /\b(?:senior|senioren\w*|seniora\w*|seniorzy|older adults?|personas mayores)\b[^.!?]{0,160}?([0-9]{1,2})\s*(?:-|to|–|—)\s*([0-9]{1,2})\s*%/i,
  /([0-9]{1,2})\s*(?:-|to|–|—)\s*([0-9]{1,2})\s*%[^.!?]{0,160}\b(?:senior|senioren\w*|seniora\w*|seniorzy|older adults?|personas mayores)\b/i,
];

const APP_VALUE_POSITIVE_PATTERNS = [
  /\bAPP([0-9]{1,2})\b/i,
  /\bapp(?:-exclusive|-only)?\b[^.!?]{0,40}?([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%/i,
  /([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%[^.!?]{0,40}\bapp(?:-exclusive|-only)?\b/i,
];

const NEWSLETTER_VALUE_PATTERNS = [
  /\b(?:newsletter|email(?:s)?|mailing list|welcome)\b[^.!?]{0,60}?([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%/i,
  /([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%[^.!?]{0,60}\b(?:newsletter|email(?:s)?|mailing list|welcome)\b/i,
  /\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription)\b[^.!?]{0,60}?([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%/i,
  /([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%[^.!?]{0,60}\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription)\b/i,
];

const NEWSLETTER_AMOUNT_VALUE_PATTERNS = [
  /\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription|premi[èe]re commande)\b[^.!?]{0,60}?([$£€₩])\s*([0-9][0-9.,]*)/i,
  /([$£€₩])\s*([0-9][0-9.,]*)[^.!?]{0,60}\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription|premi[èe]re commande)\b/i,
  /\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription|premi[èe]re commande)\b[^.!?]{0,60}?([0-9][0-9.,]*)\s*(USD|GBP|EUR|PLN|KRW)\b/i,
  /([0-9][0-9.,]*)\s*(USD|GBP|EUR|PLN|KRW)\b[^.!?]{0,60}\b(?:nieuwsbrief|welkomstkorting|inschrijving|aanmelding|newsletter|offre de bienvenue|inscription|premi[èe]re commande)\b/i,
];

const NEWSLETTER_VALUE_SKIP_PATTERNS = [
  /\bFlexiway\b/i,
  /\bPersonal Account\b/i,
  /\bapp-Only\b/i,
  /\bweekly new arrivals\b/i,
];

const PERCENT_VALUE_PATTERNS = [
  /\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|deal|sale|commission|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|student|teacher|military|veteran|senior|birthday|employee|staff|family|child|kids?|app|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|newsletter-rabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b[^.!?]{0,40}?([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*%/i,
  /([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*%[^.!?]{0,40}\b(?:off|discount|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|deal|sale|commission|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|student|teacher|military|veteran|senior|birthday|employee|staff|family|child|kids?|app|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|newsletter-rabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b/i,
  /\b(?:up to|from|between|upwards of|save)\b[^.!?]{0,20}?([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*(?:-|to|–)\s*[0-9]{1,3}(?:[.,][0-9]{1,2})?\s*%/i,
];

const AMOUNT_VALUE_PATTERNS_BY_SYMBOL = [
  /\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b[^.!?]{0,40}?([$£€₩])\s*([0-9][0-9.,]*)/i,
  /([$£€₩])\s*([0-9][0-9.,]*)[^.!?]{0,40}\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b/i,
  /\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b[^.!?]{0,40}?([0-9][0-9.,]*)\s*([$£€₩])/i,
  /([0-9][0-9.,]*)\s*([$£€₩])[^.!?]{0,40}\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b/i,
];

const AMOUNT_VALUE_PATTERNS_BY_CODE = [
  /\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b[^.!?]{0,40}?([0-9][0-9.,]*)\s*(USD|GBP|EUR|PLN|KRW)\b/i,
  /([0-9][0-9.,]*)\s*(USD|GBP|EUR|PLN|KRW)\b[^.!?]{0,40}\b(?:discount|off|save|voucher|coupon|promo(?:tion)?|code|offer|benefit|reward|credit|cashback|rebate|bonus|gift card|newsletter|signup|sign[ -]?up|welcome|refer(?: a friend)?|referral|member(?:ship)?|loyalty|rabat\w*|zni[żz]k\w*|gutschein\w*|angebot\w*|mitarbeiter\w*|willkommensrabatt|korting|voordeel|welkomstkorting|remise|r[ée]duction)\b/i,
];

function buildValueCandidateTexts(factType: string, text: string) {
  const sentences = splitIntoSentences(text);
  const scored = sentences
    .map((sentence, index) => scoreSentence(sentence, factType, index))
    .filter((item) => item.existence === "yes")
    .sort((left, right) => right.score - left.score);
  const numericCandidates = sentences
    .filter((sentence) => /\d/.test(sentence) && hasPattern(sentence, VALUE_CONTEXT_PATTERNS))
    .map((sentence) => normalizeText(sentence));
  const candidates = [
    ...scored.map((item) => item.evidenceSentence),
    ...numericCandidates,
    ...getLeadSentences(text, 2),
  ].map((item) => normalizeText(item));

  return [...new Set(candidates)].filter(Boolean);
}

function extractValue(factType: string, existence: GgCleaningExistence, snippet: string, country = "") {
  if (existence !== "yes") return "";
  if (VALUE_SKIP_FACT_TYPES.has(factType)) return "";
  const text = cleanSnippetText(snippet);
  if (!text) return "";
  if (hasPattern(text, VALUE_HARD_EMPTY_PATTERNS[factType] || [])) return "";
  if (
    factType === "senior" &&
    (hasExplicitFactTerm(text, factType) || includesFallback(text, FACT_FALLBACK_CLUES[factType]?.positive))
  ) {
    const seniorRangeInText = SENIOR_RANGE_VALUE_PATTERNS
      .map((pattern) => {
        const match = pattern.exec(text);
        if (match) pattern.lastIndex = 0;
        return match;
      })
      .find(Boolean);
    if (seniorRangeInText?.[1] && seniorRangeInText?.[2]) {
      return normalizeValue(`${seniorRangeInText[1]}%-${seniorRangeInText[2]}%`);
    }
  }
  for (const candidate of buildValueCandidateTexts(factType, text)) {
    if (!candidate) continue;
    if (!hasPattern(candidate, VALUE_CONTEXT_PATTERNS)) continue;
    if (hasPattern(candidate, VALUE_NEGATIVE_PATTERNS)) continue;
    if (hasPattern(candidate, VALUE_CROSS_ENTITY_SKIP_PATTERNS)) continue;
    if (hasPattern(candidate, VALUE_RANGE_OR_APPROXIMATE_PATTERNS)) continue;
    if (hasPattern(candidate, VALUE_POINTS_ONLY_SKIP_PATTERNS)) continue;
    if (
      VALUE_REQUIRE_FACT_SIGNAL.has(factType) &&
      !hasExplicitFactTerm(candidate, factType) &&
      !includesFallback(candidate, FACT_FALLBACK_CLUES[factType]?.positive)
    ) continue;
    if (hasPattern(candidate, VALUE_FACT_SPECIFIC_SKIP_PATTERNS[factType] || [])) continue;

    if (factType === "senior") {
      const seniorRangeMatch = SENIOR_RANGE_VALUE_PATTERNS
        .map((pattern) => {
          const match = pattern.exec(candidate);
          if (match) pattern.lastIndex = 0;
          return match;
        })
        .find(Boolean);
      if (seniorRangeMatch?.[1] && seniorRangeMatch?.[2]) {
        return normalizeValue(`${seniorRangeMatch[1]}%-${seniorRangeMatch[2]}%`);
      }
    }

    if (factType === "app") {
      const appMatch = APP_VALUE_POSITIVE_PATTERNS
        .map((pattern) => {
          const match = pattern.exec(candidate);
          if (match) pattern.lastIndex = 0;
          return match;
        })
        .find(Boolean);
      if (appMatch?.[1]) return normalizeValue(`${appMatch[1]}%`);
    }

    if (factType === "newsletter/first order/sign up/") {
      if (hasPattern(candidate, NEWSLETTER_VALUE_SKIP_PATTERNS)) continue;
      const newsletterMatch = NEWSLETTER_VALUE_PATTERNS
        .map((pattern) => {
          const match = pattern.exec(candidate);
          if (match) pattern.lastIndex = 0;
          return match;
        })
        .find(Boolean);
      if (newsletterMatch?.[1]) return normalizeValue(`${newsletterMatch[1]}%`);
      const newsletterAmountMatch = NEWSLETTER_AMOUNT_VALUE_PATTERNS
        .map((pattern) => {
          const match = pattern.exec(candidate);
          if (match) pattern.lastIndex = 0;
          return match;
        })
        .find(Boolean);
      if (newsletterAmountMatch?.[1] && newsletterAmountMatch?.[2]) {
        if (SYMBOL_TO_CURRENCY[newsletterAmountMatch[1]]) {
          return normalizeValue(`${newsletterAmountMatch[2]} ${SYMBOL_TO_CURRENCY[newsletterAmountMatch[1]]}`);
        }
        if (SYMBOL_TO_CURRENCY[newsletterAmountMatch[2]]) {
          return normalizeValue(`${newsletterAmountMatch[1]} ${SYMBOL_TO_CURRENCY[newsletterAmountMatch[2]]}`);
        }
        if (/^(USD|GBP|EUR|PLN|KRW)$/i.test(newsletterAmountMatch[2])) {
          return normalizeValue(`${newsletterAmountMatch[1]} ${newsletterAmountMatch[2].toUpperCase()}`);
        }
      }
    }

    if (factType === "shipping") {
      const bySymbol = candidate.match(/\b(?:over|above|from|orders? over|minimum order of|vanaf|d[eè]s|[àa] partir de)\s*([$£€₩])\s*([0-9][0-9.,]*)/i);
      if (bySymbol) return normalizeValue(`min_free_shipping: ${bySymbol[2].replace(/[.,]+$/g, "")} ${SYMBOL_TO_CURRENCY[bySymbol[1]]}`);
      const byTrailingSymbol = candidate.match(/\b(?:over|above|from|orders? over|minimum order of|ab|ab einem bestellwert von|ab einem warenwert von|vanaf|d[eè]s|[àa] partir de)\s*([0-9][0-9.,]*)\s*([$£€₩])/i);
      if (byTrailingSymbol) return normalizeValue(`min_free_shipping: ${byTrailingSymbol[1].replace(/[.,]+$/g, "")} ${SYMBOL_TO_CURRENCY[byTrailingSymbol[2]]}`);
      const byCode = candidate.match(/\b(?:over|above|from|orders? over|minimum order of|vanaf|d[eè]s|[àa] partir de)\s*([0-9][0-9.,]*)\s*(USD|GBP|EUR|PLN|KRW)\b/i);
      if (byCode) return normalizeValue(`min_free_shipping: ${byCode[1].replace(/[.,]+$/g, "")} ${byCode[2].toUpperCase()}`);
      const inferredCurrency = defaultCurrencyForCountry(country);
      const byBareAmount = candidate.match(/\b(?:over|above|from|orders? over|minimum order of|ab|ab einem bestellwert von|ab einem warenwert von|vanaf|d[eè]s|[àa] partir de)\s*([0-9][0-9.,]*[0-9]|[0-9])(?:[.,]+)?(?!\d)/i);
      if (byBareAmount && inferredCurrency) return normalizeValue(`min_free_shipping: ${byBareAmount[1].replace(/[.,]+$/g, "")} ${inferredCurrency}`);
      continue;
    }

    const percentMatch = PERCENT_VALUE_PATTERNS
      .map((pattern) => {
        const match = pattern.exec(candidate);
        if (match) pattern.lastIndex = 0;
        return match;
      })
      .find(Boolean);
    if (percentMatch?.[1]) return normalizeValue(`${percentMatch[1]}%`);

    const amountBySymbol = AMOUNT_VALUE_PATTERNS_BY_SYMBOL
      .map((pattern) => {
        const match = pattern.exec(candidate);
        if (match) pattern.lastIndex = 0;
        return match;
      })
      .find(Boolean);
    if (amountBySymbol?.[1] && amountBySymbol?.[2]) {
      const symbol = SYMBOL_TO_CURRENCY[amountBySymbol[1]] ? amountBySymbol[1] : amountBySymbol[2];
      const value = SYMBOL_TO_CURRENCY[amountBySymbol[1]] ? amountBySymbol[2] : amountBySymbol[1];
      return normalizeValue(`${value} ${SYMBOL_TO_CURRENCY[symbol]}`);
    }

    const amountByCode = AMOUNT_VALUE_PATTERNS_BY_CODE
      .map((pattern) => {
        const match = pattern.exec(candidate);
        if (match) pattern.lastIndex = 0;
        return match;
      })
      .find(Boolean);
    if (amountByCode?.[1] && amountByCode?.[2]) {
      return normalizeValue(`${amountByCode[1]} ${amountByCode[2].toUpperCase()}`);
    }
  }

  return "";
}

const URL_ALLOWED_PARTNER_HOSTS: Partial<Record<string, string[]>> = {
  app: ["play.google.com", "apps.apple.com"],
  "blue light card": ["bluelightcard.co.uk"],
  nhs: ["nhsdiscounts.org.uk"],
  student: ["studentbeans.com", "myunidays.com", "gocertify.me"],
  teacher: ["studentbeans.com", "myunidays.com", "gocertify.me", "discountsforteachers.co.uk", "bluelightcard.co.uk"],
};

const URL_STRONG_HINTS: Partial<Record<string, string[]>> = {
  app: ["app", "mobile-app", "app-store", "play.google", "app/id", "promotional-offers"],
  birthday: ["birthday"],
  "blue light card": ["blue-light", "blue light", "discount", "student-discount"],
  child: [],
  clearance: ["promotions", "clearance", "sale", "outlet", "voucher-codes", "discounts"],
  employee: ["employee", "staff", "benefits"],
  "existing customer": ["loyalty", "discount-code", "voucher-codes", "offer", "member", "rewards"],
  family: ["family"],
  "first responder": ["first-responder", "firstresponder"],
  "gift card": ["gift-card", "giftcard"],
  "loyalty program": ["loyalty", "rewards", "member", "vip", "loyalty-offer"],
  military: ["military"],
  "newsletter/first order/sign up/": ["newsletter", "subscribe", "signup", "sign-up", "sign_up", "welcome", "nieuwsbrief", "aanmelden", "inschrijven", "inscription", "abonnement", "abonnez-vous", "premiere-commande", "premier-achat", "offre-bienvenue"],
  nhs: ["nhs"],
  "price guanrantee": ["money-back", "guarantee", "return-refund", "refund", "returns"],
  "price guarantee": ["money-back", "guarantee", "return-refund", "refund", "returns"],
  referral: ["refer-a-friend", "referral", "invite"],
  return: ["return-refund", "returns", "refund", "money-back", "guarantee"],
  senior: ["senior"],
  shipping: ["shipping", "delivery", "delivery-methods", "postage", "verzending", "bezorging", "levering", "livraison", "expedition"],
  student: ["student-discount", "student", "education", "voucher-codes", "discount-code", "studentenkorting", "etudiant", "etudiante", "reduction-etudiant"],
  teacher: ["teacher", "teachers", "discountsforteachers"],
};

const URL_NEGATIVE_HINTS: Partial<Record<string, string[]>> = {
  app: ["student-discount", "return-refund", "returns", "refund", "career", "discount-code", "voucher-codes", "newsletter", "subscribe", "payment"],
  birthday: ["student-discount", "career", "discounts", "customer-service", "help", "offer", "offers"],
  child: ["voucher-codes", "discount-code", "student-discount", "offer", "terms"],
  clearance: ["student-discount", "career", "returns", "refund"],
  employee: ["voucher-codes", "discount-code", "student-discount", "career"],
  "existing customer": ["student-discount", "career", "discount-code", "voucher-codes"],
  family: ["student-discount", "payment", "referral", "refer-a-friend", "newsletter", "subscribe", "products", "sale"],
  "first responder": ["student-discount", "career", "discount-code", "voucher-codes", "offer"],
  "gift card": ["student-discount", "career", "payment"],
  "loyalty program": ["referral", "refer-a-friend", "discount-code", "blog"],
  military: ["career", "voucher-codes", "discount-code", "student-discount"],
  "newsletter/first order/sign up/": ["student-discount", "career"],
  nhs: ["student-discount", "career", "discount-code", "voucher-codes", "offer"],
  "price guanrantee": ["faq", "student-discount", "career"],
  "price guarantee": ["faq", "student-discount", "career"],
  referral: ["student-discount", "career"],
  return: ["student-discount", "career"],
  shipping: ["student-discount", "career", "carriere", "emploi", "carrieres"],
  senior: ["student-discount", "career", "discount-code", "voucher-codes", "offer"],
  teacher: ["career", "student-discount"],
};

const URL_HOMEPAGE_OK_FACT_TYPES = new Set<string>();
const URL_NEEDS_TARGETED_HINT = new Set([
  "app",
  "birthday",
  "clearance",
  "child",
  "employee",
  "existing customer",
  "family",
  "first responder",
  "gift card",
  "loyalty program",
  "military",
  "newsletter/first order/sign up/",
  "nhs",
  "price guanrantee",
  "price guarantee",
  "referral",
  "return",
  "senior",
  "shipping",
  "teacher",
]);
const URL_BAD_HOST_PATTERNS = [
  "groupon.",
  "voucher",
  "coupon",
  "worthepenny",
  "dealmoon",
  "rakuten.",
  "techradar.com",
  "topcashback.",
  "savoo.",
  "everysaving.",
  "joinhoney.",
  "lovediscountvouchers",
  "myvouchercodes.",
  "hotukdeals.",
  "cmscritic.",
  "reddit.com",
  "glassdoor.",
  "indeed.",
  "sheerluxe.",
  "whowhatwear.",
  "glamourmagazine.",
  "savethestudent.",
  "which.co.uk",
  "finance.yahoo.com",
  "dailynebraskan.com",
  "oreateai.com",
  "deal",
  "translate.google.",
];

function localePreferenceForCountry(country: string) {
  const normalized = normalizeText(country).toUpperCase();
  switch (normalized) {
    case "UK":
      return { preferred: ["en-gb", "/gb/", "/uk/"], fallback: ["en-ww", "/ww/", "en-eu", "/eu/"], avoid: ["en-us", "/us/", "en-dk", "/dk/", "en-no", "/no/", "en-ch", "/ch/"] };
    case "US":
      return { preferred: ["en-us", "/us/", "en_usd"], fallback: ["en-ww", "/ww/"], avoid: ["en-gb", "/gb/", "/uk/"] };
    case "DE":
      return { preferred: ["en-de", "/de/", "de-de"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    case "FR":
      return { preferred: ["en-fr", "/fr/", "fr-fr"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    case "NL":
      return { preferred: ["en-nl", "/nl/", "nl-nl"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    case "PL":
      return { preferred: ["en-pl", "/pl/", "pl-pl"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    case "ES":
      return { preferred: ["en-es", "/es/", "es-es"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    case "KR":
      return { preferred: ["en-kr", "/kr/", "ko-kr"], fallback: ["en-ww", "/ww/"], avoid: ["en-us", "/us/", "en-gb", "/gb/"] };
    default:
      return { preferred: [], fallback: [], avoid: [] };
  }
}

function parseUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: normalizeDomain(parsed.hostname),
      pathname: normalizePathname(parsed.pathname),
      lowered: parsed.toString().toLowerCase(),
    };
  } catch {
    const lowered = url.toLowerCase();
    return {
      host: normalizeDomain(url),
      pathname: normalizePathname(lowered),
      lowered,
    };
  }
}

const SAFE_SUBDOMAIN_PREFIXES = new Set([
  "www",
  "m",
  "support",
  "help",
  "shop",
  "store",
  "care",
  "services",
  "service",
  "info",
  "en",
  "uk",
  "us",
  "de",
  "fr",
  "nl",
  "pl",
  "es",
  "kr",
]);

function classifyDomainMatch(host: string, pathname: string, domainHost: string, domainPath = "") {
  if (!domainHost || !host) return "off_domain";
  if (domainPath && pathname && pathname.includes(domainPath) && (host === domainHost || host.endsWith(`.${domainHost}`))) {
    return "brand_path";
  }
  if (host === domainHost) {
    return "exact_host";
  }
  if (!host.endsWith(`.${domainHost}`)) return "off_domain";
  const prefix = host.slice(0, -(domainHost.length + 1)).split(".").pop() || "";
  return SAFE_SUBDOMAIN_PREFIXES.has(prefix) ? "subdomain" : "brand_subdomain";
}

function isUrlAllowedPartner(host: string, factType: string) {
  return (URL_ALLOWED_PARTNER_HOSTS[factType] || []).some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

function countUrlTokenHits(pathname: string, tokens: string[]) {
  return tokens.reduce((sum, token) => sum + (pathname.includes(token) ? 1 : 0), 0);
}

function localeScoreForUrl(lowered: string, country: string) {
  const normalizedLowered = lowered.replace(/_/g, "-");
  const preference = localePreferenceForCountry(country);
  let score = 0;
  score += preference.preferred.reduce((sum, token) => sum + (normalizedLowered.includes(token) ? 8 : 0), 0);
  score += preference.fallback.reduce((sum, token) => sum + (normalizedLowered.includes(token) ? 4 : 0), 0);
  score -= preference.avoid.reduce((sum, token) => sum + (normalizedLowered.includes(token) ? 6 : 0), 0);
  return score;
}

function isHomepagePath(pathname: string) {
  return /^\/?$/.test(pathname) || /^\/[a-z]{2}(?:-[a-z]{2})?\/?$/.test(pathname);
}

function pickBestUrl(urls: string[], domainHost: string, factType: string, country = "", domainPath = "") {
  if (!urls.length) {
    return {
      url: "",
      urlHost: "",
      domainMatchType: "off_domain",
      urlSelectedFromProductUrls: false,
    };
  }
  const scored = [...urls]
    .map((url) => ({ url, ...scoreUrl(url, domainHost, factType, country, domainPath) }))
    .sort((left, right) => right.score - left.score || left.url.length - right.url.length);
  const best = scored[0];
  if (!best || best.score < 45) {
    return {
      url: "",
      urlHost: "",
      domainMatchType: "off_domain",
      urlSelectedFromProductUrls: false,
    };
  }
  return {
    url: best.url,
    urlHost: best.host,
    domainMatchType: best.domainMatchType,
    urlSelectedFromProductUrls: true,
  };
}

function scoreUrl(url: string, domainHost: string, factType: string, country: string, domainPath = "") {
  const { host, pathname, lowered } = parseUrlParts(url);
  const domainMatchType = classifyDomainMatch(host, pathname, domainHost, domainPath);
  const onDomain =
    domainMatchType === "exact_host" ||
    domainMatchType === "subdomain" ||
    domainMatchType === "brand_path" ||
    domainMatchType === "brand_subdomain";
  const allowedPartner = !onDomain && isUrlAllowedPartner(host, factType);
  let score =
    domainMatchType === "exact_host"
      ? 40
      : domainMatchType === "subdomain"
        ? 38
        : domainMatchType === "brand_path"
          ? 34
          : domainMatchType === "brand_subdomain"
            ? 24
            : allowedPartner
              ? 32
              : -30;
  if (allowedPartner) score += 18;
  if (domainMatchType === "brand_subdomain") score -= 6;
  if (domainMatchType === "brand_path") score += 4;
  if (domainPath) {
    if (pathname.includes(domainPath)) score += 16;
    else if (domainMatchType === "exact_host" && isHomepagePath(pathname)) score -= 12;
  }

  if (!allowedPartner && URL_BAD_HOST_PATTERNS.some((pattern) => host.includes(pattern))) score -= 50;
  if (/(^|[.-])(preprod|staging|stage|test|dev|npr)([.-]|$)/.test(host)) score -= 18;
  if (pathname.includes("/content/campaign")) score -= 8;
  if (pathname.includes("/content/stories/")) score -= 10;
  if (pathname.endsWith(".html")) score -= 3;

  const strongHints = URL_STRONG_HINTS[factType] || [];
  const negativeHints = URL_NEGATIVE_HINTS[factType] || [];
  const strongHitCount = countUrlTokenHits(pathname, strongHints);
  const negativeHitCount = countUrlTokenHits(pathname, negativeHints);
  score += strongHitCount * 14;
  score -= negativeHitCount * 16;
  if (onDomain && strongHitCount) score += 10;

  if (pathname.includes("customer-service") || pathname.includes("support") || pathname.includes("help")) score += 4;
  if (pathname.includes("terms")) score += 3;
  if (pathname.includes("tools-guides/discounts")) score += factType === "app" ? 10 : 2;
  if (pathname.includes("/store/apps/details") || pathname.includes("/app/")) score += factType === "app" ? 16 : 0;
  if (pathname.includes("blog")) score += factType === "referral" || factType === "family" || factType === "loyalty program" ? 5 : -2;
  if (URL_NEEDS_TARGETED_HINT.has(factType) && pathname.includes("/products/")) score -= factType === "gift card" ? 4 : 22;
  if (URL_NEEDS_TARGETED_HINT.has(factType) && pathname.includes("/film/")) score -= 20;
  if ((factType === "birthday" || factType === "family") && pathname.includes("sale")) score -= 16;

  if (URL_HOMEPAGE_OK_FACT_TYPES.has(factType) && onDomain && isHomepagePath(pathname)) score += 18;
  if (factType === "clearance" && pathname.includes("/promotions")) score += 10;
  if (factType === "clearance" && (pathname.includes("voucher-codes") || pathname.includes("tools-guides/discounts"))) score += 16;
  if ((factType === "price guanrantee" || factType === "price guarantee") && pathname.includes("money-back")) score += 10;
  if (factType === "newsletter/first order/sign up/" && pathname.includes("subscribe")) score += 10;
  if ((factType === "referral" || factType === "family" || factType === "loyalty program") && pathname.includes("refer-a-friend")) score += 12;
  if (factType === "loyalty program" && pathname.includes("loyalty-offer")) score += 18;
  if (factType === "app" && pathname.includes("promotional-offers")) score += 16;
  if (factType === "teacher" && allowedPartner) score += 12;
  if (factType === "student" && onDomain && pathname.includes("student-discount")) score += 18;
  if (factType === "return" && pathname.includes("guarantee") && !pathname.includes("return") && !pathname.includes("refund")) score -= 40;

  score += localeScoreForUrl(lowered, country);

  if (URL_NEEDS_TARGETED_HINT.has(factType) && !strongHitCount && !allowedPartner) score -= onDomain ? 18 : 8;
  score -= Math.max(0, pathname.split("/").filter(Boolean).length - 3);
  return { score, host, domainMatchType };
}

function toInputRow(row: Record<string, unknown>) {
  const domainRef = parseDomainReference(row.domain);
  const rawTermId = String(row.term_id ?? "");
  const rawCountry = String(row.country ?? "");
  const rawDomain = domainRef.raw;
  const rawTermName = String(row.term_name ?? "");
  const rawFactType = String(row.subclass ?? "");
  const rawSourceType = String(row[GG_COLLECTED_SOURCE_COLUMN] ?? "");
  const factType = canonicalFactType(normalizeText(row.subclass));
  const snippet = parseSnippetCell(row.content);
  const productUrls = parseProductUrlsCell(row.product_urls);
  if (!snippet) return null;
  const inferred = explainExistence(factType, snippet);
  const existence = inferred.existence;
  const inputRow = {
    termId: rawTermId,
    country: rawCountry,
    domain: rawDomain,
    termName: rawTermName,
    factType: rawFactType,
    sourceType: rawSourceType,
    normalizedTermId: normalizeText(row.term_id),
    countryCode: normalizeText(row.country).toUpperCase(),
    canonicalFactType: factType,
    normalizedSourceType: normalizeCollectedSourceType(row[GG_COLLECTED_SOURCE_COLUMN]),
    domainHost: domainRef.host,
    domainPath: domainRef.pathname,
    snippet,
    productUrls,
    existence,
    value: extractValue(factType, existence, snippet, normalizeText(row.country)),
    existenceReasonCn: inferred.reasonCn,
    matchedRule: inferred.matchedRule,
    evidenceSentence: inferred.evidenceSentence,
    confidenceBucket: inferred.confidenceBucket,
  } satisfies InputRow;

  if (!inputRow.normalizedTermId || !inputRow.countryCode || !inputRow.canonicalFactType) return null;
  if (inputRow.normalizedSourceType !== "aimode" && inputRow.normalizedSourceType !== "searchlab") return null;
  return inputRow;
}

function toInputRows(parsed: ParsedFile, inputMode: GgCleaningInputMode) {
  void inputMode;
  return parsed.rawRows.map((row) => toInputRow(row)).filter((row): row is InputRow => Boolean(row));
}

function groupKeyOf(row: Pick<InputRow, "termId" | "country" | "factType">) {
  return `${normalizeText(row.termId)}__${normalizeText(row.country).toUpperCase()}__${canonicalFactType(normalizeText(row.factType))}`;
}

function confidenceRank(value: SideResult["confidenceBucket"]) {
  if (value === "strong") return 2;
  if (value === "weak") return 1;
  return 0;
}

function mergeExistence(left: SideResult, right: SideResult) {
  if (left.supported === "yes" && right.supported === "yes") return { existence: "yes" as const, reasonCn: "双源都支持 yes" };
  if (left.supported === "no" && right.supported === "no") return { existence: "no" as const, reasonCn: "双源都支持 no" };

  if (left.supported === "unknown" && right.supported !== "unknown") return { existence: right.supported, reasonCn: "单侧明确，另一侧未知" };
  if (right.supported === "unknown" && left.supported !== "unknown") return { existence: left.supported, reasonCn: "单侧明确，另一侧未知" };

  if (left.supported !== "unknown" && right.supported !== "unknown" && left.supported !== right.supported) {
    const leftRank = confidenceRank(left.confidenceBucket);
    const rightRank = confidenceRank(right.confidenceBucket);
    if (leftRank >= rightRank + 2) return { existence: left.supported, reasonCn: "强证据覆盖弱冲突" };
    if (rightRank >= leftRank + 2) return { existence: right.supported, reasonCn: "强证据覆盖弱冲突" };
    return { existence: "unknown" as const, reasonCn: "双源冲突" };
  }

  return { existence: "unknown" as const, reasonCn: "没有足够明确证据" };
}

function mergeValue(left: string, right: string) {
  const normalizedLeft = normalizeValue(left);
  const normalizedRight = normalizeValue(right);
  if (normalizedLeft && normalizedLeft === normalizedRight) return normalizedLeft;
  if (normalizedLeft && !normalizedRight) return normalizedLeft;
  if (normalizedRight && !normalizedLeft) return normalizedRight;
  return "";
}

function parseDiscountFields(value: string) {
  const raw = normalizeValue(value);
  const minOrder = raw.match(/^min_free_shipping:\s*([0-9][0-9.]*)\s+([A-Z]{3})$/i);
  if (minOrder) return { discountType: "min_order", discountValue: minOrder[1], currency: minOrder[2].toUpperCase() };
  const percent = raw.match(/^([0-9][0-9.]*)%$/);
  if (percent) return { discountType: "percent", discountValue: percent[1], currency: "" };
  const amount = raw.match(/^([0-9][0-9.]*)\s+([A-Z]{3})$/i);
  if (amount) return { discountType: "amount", discountValue: amount[1], currency: amount[2].toUpperCase() };
  return { discountType: "", discountValue: "", currency: "" };
}

function createSideAccumulator(): SideAccumulator {
  return {
    bestRow: null,
    firstValue: "",
    productUrlSet: new Set<string>(),
    yesRanks: new Set<number>(),
    noRanks: new Set<number>(),
  };
}

function compareInputRowPriority(left: InputRow, right: InputRow) {
  const bucketDiff = confidenceRank(left.confidenceBucket) - confidenceRank(right.confidenceBucket);
  if (bucketDiff) return bucketDiff;
  const existenceDiff = (left.existence === "unknown" ? 0 : 1) - (right.existence === "unknown" ? 0 : 1);
  return existenceDiff;
}

function updateSideAccumulator(acc: SideAccumulator, row: InputRow) {
  const normalizedValue = normalizeValue(row.value);
  if (!acc.firstValue && normalizedValue && row.existence === "yes") acc.firstValue = normalizedValue;
  for (const url of row.productUrls) acc.productUrlSet.add(url);

  const rank = confidenceRank(row.confidenceBucket);
  if (row.existence === "yes") acc.yesRanks.add(rank);
  if (row.existence === "no") acc.noRanks.add(rank);

  if (!acc.bestRow || compareInputRowPriority(row, acc.bestRow) > 0) {
    acc.bestRow = row;
  }
}

function reduceSideAccumulator(acc: SideAccumulator, _domainHost: string, factType: string, country: string): SideResult {
  if (!acc.bestRow) {
    return {
      supported: "unknown",
      reasonCn: "当前来源无有效数据",
      value: "",
      url: "",
      urlHost: "",
      domainMatchType: "off_domain",
      urlSelectedFromProductUrls: false,
      snippet: "",
      matchedRule: "no_source_data",
      evidenceSentence: "",
      confidenceBucket: "none",
    };
  }

  const pickedRow = acc.bestRow;
  const rank = confidenceRank(pickedRow.confidenceBucket);
  const hasOppositeAtSameRank =
    pickedRow.existence === "yes" ? acc.noRanks.has(rank) : pickedRow.existence === "no" ? acc.yesRanks.has(rank) : false;
  const supported = hasOppositeAtSameRank ? "unknown" : pickedRow.existence;
  const reasonCn = supported === "unknown" ? "source-level conflict" : pickedRow.existenceReasonCn;
  const pickedUrl = pickBestUrl(Array.from(acc.productUrlSet), pickedRow.domainHost, factType, country, pickedRow.domainPath);

  return {
    supported,
    reasonCn,
    value: supported === "yes" ? acc.firstValue : "",
    url: pickedUrl.url,
    urlHost: pickedUrl.urlHost,
    domainMatchType: pickedUrl.domainMatchType,
    urlSelectedFromProductUrls: pickedUrl.urlSelectedFromProductUrls,
    snippet: pickedRow.snippet,
    matchedRule: supported === "unknown" ? "side_conflict" : pickedRow.matchedRule,
    evidenceSentence: pickedRow.evidenceSentence || pickedRow.snippet,
    confidenceBucket: supported === "unknown" ? "none" : pickedRow.confidenceBucket,
  };
}

function buildGroupAccumulators(rows: Iterable<InputRow>) {
  const groups = new Map<string, GroupAccumulator>();
  let totalRows = 0;
  for (const row of rows) {
    totalRows += 1;
    addInputRowToGroups(groups, row);
  }
  return { groups, totalRows };
}

function addInputRowToGroups(groups: Map<string, GroupAccumulator>, row: InputRow) {
  const key = groupKeyOf(row);
  let group = groups.get(key);
  if (!group) {
    group = {
      groupKey: key,
      termId: row.termId,
      country: row.country,
      domain: row.domain,
      termName: row.termName,
      factType: row.factType,
      domainHost: row.domainHost,
      domainPath: row.domainPath,
      countryCode: row.countryCode,
      canonicalFactType: row.canonicalFactType,
      aimode: createSideAccumulator(),
      searchlab: createSideAccumulator(),
    };
    groups.set(key, group);
  }
  updateSideAccumulator(row.normalizedSourceType === "aimode" ? group.aimode : group.searchlab, row);
}

function buildDecisionRowsFromGroups(groups: Map<string, GroupAccumulator>) {

  const decisions: DecisionRow[] = [];
  for (const [groupKey, group] of groups) {
    const aimode = reduceSideAccumulator(group.aimode, group.domainHost, group.canonicalFactType, group.countryCode);
    const searchlab = reduceSideAccumulator(group.searchlab, group.domainHost, group.canonicalFactType, group.countryCode);
    const finalExistence = mergeExistence(aimode, searchlab);
    const finalValue = finalExistence.existence === "yes" ? mergeValue(aimode.value, searchlab.value) : "";
    const finalUrlPick = pickBestUrl([aimode.url, searchlab.url].filter(Boolean), group.domainHost, group.canonicalFactType, group.countryCode, group.domainPath);
    const finalSnippet =
      (finalExistence.existence === aimode.supported ? aimode.snippet : "") ||
      (finalExistence.existence === searchlab.supported ? searchlab.snippet : "") ||
      aimode.snippet ||
      searchlab.snippet;

    decisions.push({
      groupKey,
      termId: group.termId,
      country: group.country,
      domain: group.domain,
      termName: group.termName,
      factType: group.factType,
      finalSupported: finalExistence.existence,
      finalReasonCn: finalExistence.reasonCn,
      finalValue,
      finalUrl: finalUrlPick.url,
      finalUrlHost: finalUrlPick.urlHost,
      finalDomainMatchType: finalUrlPick.domainMatchType,
      finalUrlSelectedFromProductUrls: finalUrlPick.urlSelectedFromProductUrls,
      finalSnippet,
      finalMatchedRule:
        finalExistence.existence === "unknown"
          ? "merge_unknown"
          : finalExistence.existence === aimode.supported
            ? aimode.matchedRule
            : searchlab.matchedRule,
      finalEvidenceSentence:
        finalExistence.existence === aimode.supported
          ? aimode.evidenceSentence
          : finalExistence.existence === searchlab.supported
            ? searchlab.evidenceSentence
            : `${aimode.evidenceSentence} || ${searchlab.evidenceSentence}`.trim(),
      finalConfidenceBucket:
        finalExistence.existence === aimode.supported
          ? aimode.confidenceBucket
          : finalExistence.existence === searchlab.supported
            ? searchlab.confidenceBucket
            : "none",
      aimodeSupported: aimode.supported,
      aimodeReasonCn: aimode.reasonCn,
      aimodeValue: aimode.value,
      aimodeUrl: aimode.url,
      aimodeSnippet: aimode.snippet,
      aimodeMatchedRule: aimode.matchedRule,
      aimodeEvidenceSentence: aimode.evidenceSentence,
      aimodeConfidenceBucket: aimode.confidenceBucket,
      searchlabSupported: searchlab.supported,
      searchlabReasonCn: searchlab.reasonCn,
      searchlabValue: searchlab.value,
      searchlabUrl: searchlab.url,
      searchlabSnippet: searchlab.snippet,
      searchlabMatchedRule: searchlab.matchedRule,
      searchlabEvidenceSentence: searchlab.evidenceSentence,
      searchlabConfidenceBucket: searchlab.confidenceBucket,
    });
  }

  return decisions.sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

function toMerchantRows(decisions: DecisionRow[]): MerchantRow[] {
  return decisions.map((item) => {
    const parsed = parseDiscountFields(item.finalValue);
    return {
      term_id: item.termId,
      country: item.country,
      domain: item.domain,
      term_name: item.termName,
      fact_type: item.factType,
      supported: item.finalSupported,
      status: item.finalSupported === "unknown" ? "" : "active",
      discount_type: parsed.discountType,
      discount_value: parsed.discountValue,
      currency: parsed.currency,
      discount_details: item.finalSnippet,
      url: item.finalUrl,
    };
  });
}

function toDebugRows(decisions: DecisionRow[]): DebugRow[] {
  return decisions.map((item) => ({
    group_key: item.groupKey,
    term_id: item.termId,
    country: item.country,
    domain: item.domain,
    term_name: item.termName,
    fact_type: item.factType,
    final_supported: item.finalSupported,
    final_reason_cn: item.finalReasonCn,
    final_value: item.finalValue,
    final_url: item.finalUrl,
    input_domain: item.domain,
    final_url_host: item.finalUrlHost,
    domain_match_type: item.finalDomainMatchType,
    url_selected_from_product_urls: item.finalUrlSelectedFromProductUrls ? "1" : "0",
    final_snippet: item.finalSnippet,
    final_matched_rule: item.finalMatchedRule,
    final_evidence_sentence: item.finalEvidenceSentence,
    final_confidence_bucket: item.finalConfidenceBucket,
    aimode_supported: item.aimodeSupported,
    aimode_reason_cn: item.aimodeReasonCn,
    aimode_value: item.aimodeValue,
    aimode_url: item.aimodeUrl,
    aimode_snippet: item.aimodeSnippet,
    aimode_matched_rule: item.aimodeMatchedRule,
    aimode_evidence_sentence: item.aimodeEvidenceSentence,
    aimode_confidence_bucket: item.aimodeConfidenceBucket,
    searchlab_supported: item.searchlabSupported,
    searchlab_reason_cn: item.searchlabReasonCn,
    searchlab_value: item.searchlabValue,
    searchlab_url: item.searchlabUrl,
    searchlab_snippet: item.searchlabSnippet,
    searchlab_matched_rule: item.searchlabMatchedRule,
    searchlab_evidence_sentence: item.searchlabEvidenceSentence,
    searchlab_confidence_bucket: item.searchlabConfidenceBucket,
  }));
}

function buildWorkbookBuffer(merchantRows: MerchantRow[], debugRows: DebugRow[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(merchantRows, { header: MERCHANT_HEADERS }), "merchant_output");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debugRows, { header: DEBUG_HEADERS }), "debug_output");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function buildWorkbookBase64(merchantRows: MerchantRow[], debugRows: DebugRow[]) {
  return buildWorkbookBuffer(merchantRows, debugRows).toString("base64");
}

export function previewGgCleaningFile(input: { fileName: string; fileBase64: string }, options?: { skipFileSizeLimit?: boolean }): GgCleaningPreview {
  const parsed = parseFile(input.fileName, input.fileBase64, options);
  const inputMode = detectInputMode(parsed.columns);
  const inputRows = toInputRows(parsed, inputMode);
  if (!inputRows.length) {
    throw new Error("Uploaded file does not contain any valid GG cleaning rows in the collected-table format.");
  }
  const groupedRows = new Set(inputRows.map((row) => groupKeyOf(row))).size;
  return {
    inputMode,
    totalRows: inputRows.length,
    groupedRows,
    columns: sampleColumns(parsed.sampleRows, parsed.columns),
    sampleRows: parsed.sampleRows.slice(0, 5),
  };
}

export function executeGgCleaning(input: { fileName: string; fileBase64: string }, options?: { skipFileSizeLimit?: boolean }): GgCleaningExecutionResult {
  const parsed = parseFile(input.fileName, input.fileBase64, options);
  const inputMode = detectInputMode(parsed.columns);
  const inputRows = toInputRows(parsed, inputMode);
  const grouped = buildGroupAccumulators(inputRows);
  const decisions = buildDecisionRowsFromGroups(grouped.groups);
  const merchantRows = toMerchantRows(decisions);
  const debugRows = toDebugRows(decisions);
  const workbookBase64 = buildWorkbookBase64(merchantRows, debugRows);
  const preview = previewGgCleaningFile(input, options);
  return {
    preview,
    merchantRows,
    debugRows,
    workbookBase64,
    summary: {
      inputMode,
      totalRows: preview.totalRows,
      groupedRows: preview.groupedRows,
      chunkCount: preview.chunkCount,
      oversizedGroupCount: preview.oversizedGroupCount,
      successRows: merchantRows.length,
      failedRows: Math.max(0, preview.groupedRows - merchantRows.length),
    },
  };
}

export function executeGgCleaningForEval(input: { fileName: string; fileBase64: string }, options?: { skipFileSizeLimit?: boolean }): GgCleaningEvalResult {
  const parsed = parseFile(input.fileName, input.fileBase64, options);
  const inputMode = detectInputMode(parsed.columns);
  const inputRows = toInputRows(parsed, inputMode);
  if (!inputRows.length) {
    throw new Error("Uploaded file does not contain any valid GG cleaning rows in the collected-table format.");
  }
  const grouped = buildGroupAccumulators(inputRows);
  const decisions = buildDecisionRowsFromGroups(grouped.groups);
  const debugRows = toDebugRows(decisions);
  const groupedRows = new Set(inputRows.map((row) => groupKeyOf(row))).size;
  return {
    inputMode,
    totalRows: inputRows.length,
    groupedRows,
    debugRows,
    summary: {
      inputMode,
      totalRows: inputRows.length,
      groupedRows,
      chunkCount: undefined,
      oversizedGroupCount: undefined,
      successRows: decisions.length,
      failedRows: 0,
    },
  };
}

type RawRowsSummary = {
  columns: string[];
  sampleRawRows: Array<Record<string, unknown>>;
  totalRows: number;
  groupedRows: number;
  groups?: Map<string, GroupAccumulator>;
};

type RawRowsProgressCallback = (progress: {
  processedInputRows: number;
  discoveredGroups: number;
}) => void | Promise<void>;

const GG_BUFFERED_PATH_PARSE_MAX_BYTES = 2 * 1024 * 1024;

async function summarizeRawRows(
  rawRows: AsyncIterable<Record<string, unknown>>,
  options?: { includeGroups?: boolean; onProgress?: RawRowsProgressCallback },
): Promise<RawRowsSummary> {
  const columnsSet = new Set<string>();
  const sampleRawRows: Array<Record<string, unknown>> = [];
  const groupKeys = new Set<string>();
  const groups = options?.includeGroups ? new Map<string, GroupAccumulator>() : undefined;
  let totalRows = 0;
  let lastProgressReportedAt = 0;

  for await (const rawRow of rawRows) {
    for (const key of Object.keys(rawRow)) {
      const column = String(key || "").trim();
      if (column) columnsSet.add(column);
    }
    if (sampleRawRows.length < 5) sampleRawRows.push(rawRow);
    const inputRow = toInputRow(rawRow);
    if (!inputRow) continue;
    totalRows += 1;
    if (totalRows > ggCleaningUploadMaxRows) {
      throw new Error(`GG cleaning supports up to ${ggCleaningUploadMaxRows} rows per run.`);
    }
    groupKeys.add(groupKeyOf(inputRow));
    if (groups) addInputRowToGroups(groups, inputRow);
    if (options?.onProgress) {
      const now = Date.now();
      if (totalRows <= 20 || totalRows % 500 === 0 || now - lastProgressReportedAt >= 800) {
        lastProgressReportedAt = now;
        await options.onProgress({
          processedInputRows: totalRows,
          discoveredGroups: groupKeys.size,
        });
      }
    }
  }

  return {
    columns: Array.from(columnsSet),
    sampleRawRows,
    totalRows,
    groupedRows: groupKeys.size,
    groups,
  };
}

async function summarizeBufferedRowsFromFile(
  filePath: string,
  fileName: string,
  options?: { includeGroups?: boolean; onProgress?: RawRowsProgressCallback },
): Promise<RawRowsSummary> {
  const buffer = await fs.readFile(filePath);
  const rawRows = parseBufferRows(fileName, buffer);
  return summarizeRawRows(
    (async function* () {
      for (const row of rawRows) yield row;
    })(),
    options,
  );
}

async function buildFastSpreadsheetPreview(filePath: string): Promise<PreviewBuildInput> {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: 6 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: "" });
  const header = Array.isArray(headerRows[0]) ? headerRows[0].map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  const sampleRawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).slice(0, 5);
  const ref = String(sheet?.["!ref"] || "");
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  const totalRows = range ? Math.max(0, range.e.r - range.s.r) : sampleRawRows.length;
  return {
    columns: header.length ? header : collectColumns(sampleRawRows),
    sampleRawRows,
    totalRows,
    groupedRows: totalRows,
    groupedRowsEstimated: true,
    previewStrategy: "fast",
  };
}

async function summarizeRawRowsFromFile(
  filePath: string,
  fileName: string,
  options?: { includeGroups?: boolean; onProgress?: RawRowsProgressCallback },
): Promise<RawRowsSummary> {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".jsonl")) {
    const stats = await fs.stat(filePath);
    if (stats.size <= GG_BUFFERED_PATH_PARSE_MAX_BYTES) {
      return summarizeBufferedRowsFromFile(filePath, fileName, options);
    }
  }
  return summarizeRawRows(iterateRawRowsFromFile(filePath, fileName), options);
}

async function buildPreviewFromFile(filePath: string, fileName: string): Promise<GgCleaningPreview> {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    return buildGgCleaningPreviewFromMetadata(await buildFastSpreadsheetPreview(filePath));
  }
  const summary = await summarizeRawRowsFromFile(filePath, fileName);
  return buildGgCleaningPreviewFromMetadata(summary);
}

export async function previewGgCleaningFileByPath(input: { fileName: string; filePath: string }): Promise<GgCleaningPreview> {
  return buildPreviewFromFile(input.filePath, input.fileName);
}

export async function previewGgCleaningFileByPathWithProgress(
  input: { fileName: string; filePath: string },
  options?: { onProgress?: RawRowsProgressCallback },
): Promise<GgCleaningPreview> {
  const summary = await summarizeRawRowsFromFile(input.filePath, input.fileName, {
    onProgress: options?.onProgress,
  });
  return buildGgCleaningPreviewFromMetadata(summary);
}

export async function executeGgCleaningByPath(
  input: { fileName: string; filePath: string },
  options?: {
    onProgress?: RawRowsProgressCallback;
  },
) {
  const summary = await summarizeRawRowsFromFile(input.filePath, input.fileName, {
    includeGroups: true,
    onProgress: options?.onProgress,
  });
  const preview = buildGgCleaningPreviewFromMetadata(summary);
  const decisions = buildDecisionRowsFromGroups(summary.groups || new Map<string, GroupAccumulator>());
  const merchantRows = toMerchantRows(decisions);
  const debugRows = toDebugRows(decisions);
  return {
    preview,
    merchantRows,
    debugRows,
    workbookBuffer: buildWorkbookBuffer(merchantRows, debugRows),
    summary: {
      inputMode: preview.inputMode,
      totalRows: preview.totalRows,
      groupedRows: preview.groupedRows,
      chunkCount: preview.chunkCount,
      oversizedGroupCount: preview.oversizedGroupCount,
      successRows: merchantRows.length,
      failedRows: Math.max(0, preview.groupedRows - merchantRows.length),
    },
  };
}

export async function previewGgCleaningChunkRows(input: {
  columns: string[];
  sampleRawRows: Array<Record<string, unknown>>;
  totalRows: number;
  groupedRows: number;
  chunkCount: number;
  oversizedGroupCount?: number;
}) {
  return buildGgCleaningPreviewFromMetadata(input);
}

export async function executeGgCleaningChunkRows(input: {
  rawRowChunks: AsyncIterable<Array<Record<string, unknown>>>;
  columns: string[];
  sampleRawRows: Array<Record<string, unknown>>;
  totalRows: number;
  groupedRows: number;
  chunkCount: number;
  oversizedGroupCount?: number;
  onProgress?: RawRowsProgressCallback;
}) {
  const groups = new Map<string, GroupAccumulator>();
  let processedRows = 0;
  let lastProgressReportedAt = 0;

  for await (const rawRows of input.rawRowChunks) {
    for (const rawRow of rawRows) {
      const inputRow = toInputRow(rawRow);
      if (!inputRow) continue;
      processedRows += 1;
      addInputRowToGroups(groups, inputRow);
      if (input.onProgress) {
        const now = Date.now();
        if (processedRows <= 20 || processedRows % 500 === 0 || now - lastProgressReportedAt >= 800) {
          lastProgressReportedAt = now;
          await input.onProgress({
            processedInputRows: processedRows,
            discoveredGroups: groups.size,
          });
        }
      }
    }
  }

  const preview = buildGgCleaningPreviewFromMetadata({
    columns: input.columns,
    sampleRawRows: input.sampleRawRows,
    totalRows: input.totalRows,
    groupedRows: input.groupedRows,
    chunkCount: input.chunkCount,
    oversizedGroupCount: input.oversizedGroupCount,
  });
  if (processedRows !== input.totalRows) {
    throw new Error(`Uploaded chunk rows mismatch: expected ${input.totalRows}, got ${processedRows}.`);
  }

  const decisions = buildDecisionRowsFromGroups(groups);
  const merchantRows = toMerchantRows(decisions);
  const debugRows = toDebugRows(decisions);
  return {
    preview,
    merchantRows,
    debugRows,
    workbookBuffer: buildWorkbookBuffer(merchantRows, debugRows),
    summary: {
      inputMode: preview.inputMode,
      totalRows: preview.totalRows,
      groupedRows: preview.groupedRows,
      chunkCount: preview.chunkCount,
      oversizedGroupCount: preview.oversizedGroupCount,
      successRows: merchantRows.length,
      failedRows: Math.max(0, preview.groupedRows - merchantRows.length),
    },
  };
}
