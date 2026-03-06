import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  decimal,
  json,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const uploadBatches = mysqlTable("upload_batches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  moduleId: varchar("module_id", { length: 16 }).notNull().default("about"),
  uploader: varchar("uploader", { length: 32 }).notNull(),
  source: varchar("source", { length: 16 }).default("upload").notNull(),
  note: varchar("note", { length: 255 }).default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rowCount: int("row_count").default(0).notNull(),
});

export const aboutScoreRows = mysqlTable("about_score_rows", {
  id: varchar("id", { length: 36 }).primaryKey(),
  batchId: varchar("batch_id", { length: 36 }).notNull(),
  rowKind: varchar("row_kind", { length: 16 }).notNull().default("about"),
  termId: varchar("term_id", { length: 191 }).notNull(),
  termName: varchar("term_name", { length: 255 }).notNull().default(""),
  domain: varchar("domain", { length: 255 }).notNull(),
  country: varchar("country", { length: 16 }).notNull(),

  qOnline: text("q_online"),
  aOnline: text("a_online"),
  subclassOnline: varchar("subclass_online", { length: 255 }),
  qAi: text("q_ai"),
  aAi: text("a_ai"),
  subclassAi: varchar("subclass_ai", { length: 255 }),
  qOp: text("q_op"),
  aOp: text("a_op"),
  subclassOp: varchar("subclass_op", { length: 255 }),

  hashOnline: varchar("hash_online", { length: 64 }).notNull(),
  hashAi: varchar("hash_ai", { length: 64 }).notNull(),
  hashOp: varchar("hash_op", { length: 64 }),

  scoreOnlineTotal: decimal("score_online_total", { precision: 3, scale: 1 }).notNull(),
  scoreAiTotal: decimal("score_ai_total", { precision: 3, scale: 1 }).notNull(),
  scoreOpTotal: decimal("score_op_total", { precision: 3, scale: 1 }),

  scoreOnlineA: decimal("score_online_a", { precision: 3, scale: 1 }).notNull(),
  scoreOnlineB: decimal("score_online_b", { precision: 3, scale: 1 }).notNull(),
  scoreOnlineC: decimal("score_online_c", { precision: 3, scale: 1 }).notNull(),
  scoreOnlineD: decimal("score_online_d", { precision: 3, scale: 1 }).notNull(),

  scoreAiA: decimal("score_ai_a", { precision: 3, scale: 1 }).notNull(),
  scoreAiB: decimal("score_ai_b", { precision: 3, scale: 1 }).notNull(),
  scoreAiC: decimal("score_ai_c", { precision: 3, scale: 1 }).notNull(),
  scoreAiD: decimal("score_ai_d", { precision: 3, scale: 1 }).notNull(),

  scoreOpA: decimal("score_op_a", { precision: 3, scale: 1 }),
  scoreOpB: decimal("score_op_b", { precision: 3, scale: 1 }),
  scoreOpC: decimal("score_op_c", { precision: 3, scale: 1 }),
  scoreOpD: decimal("score_op_d", { precision: 3, scale: 1 }),

  bestVersion: varchar("best_version", { length: 16 }).notNull(),
  passOnline: int("pass_online").notNull(),
  passAi: int("pass_ai").notNull(),
  passOp: int("pass_op"),

  keyDeltas: json("key_deltas"),
  issuesFlags: json("issues_flags"),

  aiModel: varchar("ai_model", { length: 100 }).notNull(),
  aiPromptVersion: varchar("ai_prompt_version", { length: 100 }).notNull(),

  snapshotOnline: text("snapshot_online"),
  snapshotAi: text("snapshot_ai"),
  snapshotOp: text("snapshot_op"),

  errorReason: varchar("error_reason", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ingestJobs = mysqlTable("ingest_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  batchId: varchar("batch_id", { length: 36 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  merchantTotal: int("merchant_total").notNull().default(0),
  totalRows: int("total_rows").notNull().default(0),
  doneRows: int("done_rows").notNull().default(0),
  failedRows: int("failed_rows").notNull().default(0),
  elapsedMs: int("elapsed_ms").notNull().default(0),
  etaSeconds: int("eta_seconds").notNull().default(0),
  promptTokensSum: int("prompt_tokens_sum").notNull().default(0),
  completionTokensSum: int("completion_tokens_sum").notNull().default(0),
  totalTokensSum: int("total_tokens_sum").notNull().default(0),
  estimatedCostUsdSum: decimal("estimated_cost_usd_sum", { precision: 12, scale: 6 }).notNull().default("0"),
  predictedTotalTokens: int("predicted_total_tokens").notNull().default(0),
  predictedCostUsd: decimal("predicted_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  errorReason: varchar("error_reason", { length: 512 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});
