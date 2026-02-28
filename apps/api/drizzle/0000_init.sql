CREATE TABLE IF NOT EXISTS upload_batches (
  id varchar(36) PRIMARY KEY,
  uploader varchar(32) NOT NULL,
  source varchar(16) NOT NULL DEFAULT 'upload',
  note varchar(255) NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS about_score_rows (
  id varchar(36) PRIMARY KEY,
  batch_id varchar(36) NOT NULL,
  term_id varchar(191) NOT NULL,
  domain varchar(255) NOT NULL,
  country varchar(16) NOT NULL,
  hash_online varchar(64) NOT NULL,
  hash_ai varchar(64) NOT NULL,
  hash_op varchar(64) NULL,
  score_online_total decimal(3,1) NOT NULL,
  score_ai_total decimal(3,1) NOT NULL,
  score_op_total decimal(3,1) NULL,
  score_online_a decimal(3,1) NOT NULL,
  score_online_b decimal(3,1) NOT NULL,
  score_online_c decimal(3,1) NOT NULL,
  score_online_d decimal(3,1) NOT NULL,
  score_ai_a decimal(3,1) NOT NULL,
  score_ai_b decimal(3,1) NOT NULL,
  score_ai_c decimal(3,1) NOT NULL,
  score_ai_d decimal(3,1) NOT NULL,
  score_op_a decimal(3,1) NULL,
  score_op_b decimal(3,1) NULL,
  score_op_c decimal(3,1) NULL,
  score_op_d decimal(3,1) NULL,
  best_version varchar(16) NOT NULL,
  pass_online tinyint NOT NULL,
  pass_ai tinyint NOT NULL,
  pass_op tinyint NULL,
  key_deltas json NULL,
  issues_flags json NULL,
  ai_model varchar(100) NOT NULL,
  ai_prompt_version varchar(100) NOT NULL,
  snapshot_online text NULL,
  snapshot_ai text NULL,
  snapshot_op text NULL,
  error_reason varchar(512) NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id varchar(36) PRIMARY KEY,
  batch_id varchar(36) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  total_rows int NOT NULL DEFAULT 0,
  done_rows int NOT NULL DEFAULT 0,
  failed_rows int NOT NULL DEFAULT 0,
  started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp NULL,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
