import { z } from "zod";

export const uploaderOptions = [
  "Ella",
  "Shirley",
  "Josie",
  "Monica",
  "Chelsea",
  "Zoe",
  "Stella",
  "Estela",
  "Dorothy",
  "Howard",
  "Mia",
] as const;

export const countryOptions = [
  "US",
  "UK",
  "DE",
  "FR",
  "NL",
  "PL",
  "ES",
  "IT",
  "AU",
  "CA",
  "CZ",
  "SE",
  "DK",
  "KR",
  "BR",
  "SK",
  "JP",
  "BE",
  "CH",
  "AT",
  "PT",
  "HK",
  "GR",
] as const;

export const uploaderSchema = z.enum(uploaderOptions);
export type Uploader = z.infer<typeof uploaderSchema>;

export const moduleOptions = ["about", "faq"] as const;
export const moduleSchema = z.enum(moduleOptions);
export type ModuleId = z.infer<typeof moduleSchema>;

export const scoreBreakdownSchema = z.object({
  A: z.number(),
  B: z.number(),
  C: z.number(),
  D: z.number(),
});

export const scoreResultSchema = z.object({
  version: z.enum(["online", "ai", "op"]),
  score_total: z.number(),
  score_breakdown: scoreBreakdownSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
  pass_for_publish: z.boolean(),
});

export const scoreOutputSchema = z.object({
  meta: z.object({
    TermID: z.string(),
    Domain: z.string(),
    Country: z.string(),
    versions_present: z.array(z.enum(["online", "ai", "op"])),
  }),
  results: z.array(scoreResultSchema),
  comparison: z.object({
    best_version: z.enum(["online", "ai", "op"]),
    ranking: z.array(z.enum(["online", "ai", "op"])),
    key_deltas: z.array(z.string()),
  }),
  notes: z.string(),
});

export type ScoreOutput = z.infer<typeof scoreOutputSchema>;

export const manualScoreInputSchema = z.object({
  moduleId: moduleSchema.optional().default("about"),
  TermID: z.string().optional().default(""),
  TermName: z.string().optional().default(""),
  Domain: z.string().optional().default(""),
  Country: z.string().min(2),
  About_online: z.string(),
  About_ai: z.string(),
  About_op: z.string().optional().default(""),
  uploader: uploaderSchema.optional(),
  batchNote: z.string().optional().default(""),
  saveToHistory: z.boolean().optional().default(true),
});

export const faqItemInputSchema = z.object({
  Q_online: z.string(),
  A_online: z.string(),
  subclass_online: z.string().optional().default(""),
  Q_ai: z.string(),
  A_ai: z.string(),
  subclass_ai: z.string().optional().default(""),
  Q_op: z.string().optional().default(""),
  A_op: z.string().optional().default(""),
  subclass_op: z.string().optional().default(""),
});

export const manualFaqScoreInputSchema = z.object({
  moduleId: moduleSchema.optional().default("faq"),
  TermID: z.string().optional().default(""),
  TermName: z.string().optional().default(""),
  Domain: z.string().optional().default(""),
  Country: z.string().min(2),
  items: z.array(faqItemInputSchema).min(1),
  uploader: uploaderSchema.optional(),
  batchNote: z.string().optional().default(""),
  saveToHistory: z.boolean().optional().default(true),
});

export const batchCreateInputSchema = z.object({
  moduleId: moduleSchema.optional().default("about"),
  uploader: uploaderSchema,
  note: z.string().optional().default(""),
  source: z.enum(["upload", "manual"]).optional().default("upload"),
});

export const batchStartInputSchema = z.object({
  batchId: z.string(),
  fileName: z.string(),
  fileBase64: z.string(),
});

export const batchStatusInputSchema = z.object({
  jobId: z.string(),
});

export const batchCancelInputSchema = z.object({
  jobId: z.string(),
});

export const batchRetryInputSchema = z.object({
  jobId: z.string(),
});

export const batchQueueInputSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
  moduleId: moduleSchema.optional(),
});

export const batchResultInputSchema = z.object({
  batchId: z.string(),
  format: z.enum(["json", "csv", "xlsx"]).optional().default("json"),
});

export const batchListInputSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(20).optional().default(20),
  moduleId: moduleSchema.optional(),
  uploader: uploaderSchema.optional(),
  batchId: z.string().optional(),
  country: z.string().optional(),
  note: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const batchGetInputSchema = z.object({
  batchId: z.string(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const analyticsInputSchema = batchListInputSchema;

export const batchDeleteInputSchema = z.object({
  batchId: z.string(),
});

export const skillGetInputSchema = z.object({
  moduleId: moduleSchema,
});

export const skillSaveInputSchema = z.object({
  moduleId: moduleSchema,
  skillMd: z.string().min(1),
});

export type ManualScoreInput = z.infer<typeof manualScoreInputSchema>;
