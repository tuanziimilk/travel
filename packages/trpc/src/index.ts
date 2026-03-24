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

export const capabilityOptions = ["quality", "generation", "sampling_prelaunch", "sampling_postlaunch"] as const;
export const capabilitySchema = z.enum(capabilityOptions);
export type Capability = z.infer<typeof capabilitySchema>;

export const scTypeOptions = ["about", "faq", "st"] as const;
export const scTypeSchema = z.enum(scTypeOptions);
export type ScType = z.infer<typeof scTypeSchema>;

export const marketGroupOptions = ["HD-A", "HD-B", "HD-C"] as const;
export const marketGroupSchema = z.enum(marketGroupOptions);
export type MarketGroup = z.infer<typeof marketGroupSchema>;

export const outputModeOptions = ["full", "compact"] as const;
export const outputModeSchema = z.enum(outputModeOptions);
export type OutputMode = z.infer<typeof outputModeSchema>;

export const qualityBatchUploadMaxFileBytes = 12 * 1024 * 1024;
export const qualityBatchUploadMaxRows = 2000;
export const faqOutputUploadMaxFileBytes = 12 * 1024 * 1024;
export const faqOutputUploadMaxRows = 3000;

export const aiModelOptions = [
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
] as const;
export const aiModelSchema = z.enum(aiModelOptions);
export type AiModel = z.infer<typeof aiModelSchema>;

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
  outputMode: outputModeSchema.optional().default("full"),
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
  editor: z.string().trim().min(1).max(64),
  changeNote: z.string().trim().min(1).max(255),
});

export const skillRouteListInputSchema = z.object({
  capability: capabilitySchema.optional(),
  scType: scTypeSchema.optional(),
  subclass: z.string().optional().default(""),
});

export const skillRouteSaveInputSchema = z.object({
  capability: capabilitySchema,
  scType: scTypeSchema,
  subclass: z.string().optional().default(""),
  skillMd: z.string().min(1),
  editor: z.string().trim().min(1).max(64),
  changeNote: z.string().trim().min(1).max(255),
  overwrite: z.boolean().optional().default(true),
});

export const skillHistoryListInputSchema = z.object({
  capability: capabilitySchema,
  scType: scTypeSchema,
  subclass: z.string().optional().default(""),
});

export const skillHistoryDetailInputSchema = z.object({
  versionId: z.string().min(1),
});

export const skillRollbackInputSchema = z.object({
  capability: capabilitySchema,
  scType: scTypeSchema,
  subclass: z.string().optional().default(""),
  versionId: z.string().min(1),
  editor: z.string().trim().min(1).max(64),
  changeNote: z.string().trim().min(1).max(255),
});

export const runtimeAiConfigSetInputSchema = z.object({
  aiModel: aiModelSchema,
});

export const generationFrameworkGetInputSchema = z.object({
  scType: scTypeSchema.optional().default("faq"),
});

export const generationRunInputSchema = z.object({
  scType: scTypeSchema.optional().default("faq"),
  uploader: uploaderSchema,
  note: z.string().optional().default(""),
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
});

export const generationQueueInputSchema = z.object({
  scType: scTypeSchema.optional().default("faq"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(50).optional().default(10),
});

export const generationResultInputSchema = z.object({
  jobId: z.string(),
});

export const generationStatusInputSchema = z.object({
  jobId: z.string(),
});

export const generationRetryInputSchema = z.object({
  jobId: z.string(),
});

export const generationHistoryFilterSchema = z.object({
  scType: scTypeSchema.optional().default("faq"),
  country: z.string().optional().default(""),
  subclass: z.string().optional().default(""),
  uploader: uploaderSchema.optional(),
  keyword: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
});

export const generationHistoryExportInputSchema = z.object({
  scType: scTypeSchema.optional().default("faq"),
  country: z.string().optional().default(""),
  subclass: z.string().optional().default(""),
  uploader: uploaderSchema.optional(),
  keyword: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  format: z.enum(["xlsx", "csv"]).optional().default("xlsx"),
});

export const skillRouteResolveInputSchema = z.object({
  capability: capabilitySchema,
  scType: scTypeSchema,
  subclass: z.string().optional().default(""),
});

export const skillRouteDocumentInputSchema = skillRouteResolveInputSchema;

export type ManualScoreInput = z.infer<typeof manualScoreInputSchema>;
