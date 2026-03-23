ALTER TABLE `upload_batches`
  ADD COLUMN IF NOT EXISTS `module_id` varchar(16) NOT NULL DEFAULT 'about',
  ADD COLUMN IF NOT EXISTS `output_mode` varchar(16) NOT NULL DEFAULT 'full';

ALTER TABLE `about_score_rows`
  ADD COLUMN IF NOT EXISTS `term_name` varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `row_kind` varchar(16) NOT NULL DEFAULT 'about',
  ADD COLUMN IF NOT EXISTS `q_online` text,
  ADD COLUMN IF NOT EXISTS `a_online` text,
  ADD COLUMN IF NOT EXISTS `subclass_online` varchar(255),
  ADD COLUMN IF NOT EXISTS `q_ai` text,
  ADD COLUMN IF NOT EXISTS `a_ai` text,
  ADD COLUMN IF NOT EXISTS `subclass_ai` varchar(255),
  ADD COLUMN IF NOT EXISTS `q_op` text,
  ADD COLUMN IF NOT EXISTS `a_op` text,
  ADD COLUMN IF NOT EXISTS `subclass_op` varchar(255);

ALTER TABLE `ingest_jobs`
  ADD COLUMN IF NOT EXISTS `merchant_total` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `elapsed_ms` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `eta_seconds` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `prompt_tokens_sum` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `completion_tokens_sum` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `total_tokens_sum` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `estimated_cost_usd_sum` decimal(12,6) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS `predicted_total_tokens` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `predicted_cost_usd` decimal(12,6) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS `error_reason` varchar(512);

CREATE TABLE IF NOT EXISTS `content_generation_jobs` (
  `id` varchar(36) NOT NULL,
  `capability` varchar(32) NOT NULL DEFAULT 'generation',
  `sc_type` varchar(32) NOT NULL,
  `subclass` varchar(255) NOT NULL DEFAULT '',
  `source_batch_id` varchar(36),
  `uploader` varchar(32) NOT NULL,
  `note` varchar(255) NOT NULL DEFAULT '',
  `market_group` varchar(32) NOT NULL DEFAULT '',
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `input_file_name` varchar(255) NOT NULL DEFAULT '',
  `input_file_base64` text,
  `total_rows` int NOT NULL DEFAULT 0,
  `executable_rows` int NOT NULL DEFAULT 0,
  `success_rows` int NOT NULL DEFAULT 0,
  `failed_rows` int NOT NULL DEFAULT 0,
  `skipped_rows` int NOT NULL DEFAULT 0,
  `prompt_tokens_sum` int NOT NULL DEFAULT 0,
  `completion_tokens_sum` int NOT NULL DEFAULT 0,
  `total_tokens_sum` int NOT NULL DEFAULT 0,
  `estimated_cost_usd_sum` decimal(12,6) NOT NULL DEFAULT '0',
  `ai_model` varchar(100) NOT NULL DEFAULT '',
  `error_reason` varchar(512),
  `result_file_name` varchar(255) NOT NULL DEFAULT '',
  `result_file_base64` text,
  `route_summary_json` json,
  `row_results_json` json,
  `route_snapshot` json,
  `output_schema_snapshot` json,
  `result_file_path` varchar(255),
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `prelaunch_sampling_batches` (
  `id` varchar(36) NOT NULL,
  `source_batch_id` varchar(36),
  `sc_type` varchar(32) NOT NULL,
  `market_group` varchar(32) NOT NULL DEFAULT '',
  `uploader` varchar(32) NOT NULL,
  `reviewer` varchar(32) NOT NULL DEFAULT '',
  `previous_reviewer` varchar(32) NOT NULL DEFAULT '',
  `sample_size` int NOT NULL DEFAULT 0,
  `total_rows` int NOT NULL DEFAULT 0,
  `severe_count` int NOT NULL DEFAULT 0,
  `normal_count` int NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `result_summary` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `prelaunch_sampling_rows` (
  `id` varchar(36) NOT NULL,
  `batch_id` varchar(36) NOT NULL,
  `sc_type` varchar(32) NOT NULL,
  `country` varchar(16) NOT NULL,
  `market_group` varchar(32) NOT NULL DEFAULT '',
  `term_id` varchar(191) NOT NULL,
  `term_name` varchar(255) NOT NULL DEFAULT '',
  `domain` varchar(255) NOT NULL DEFAULT '',
  `original_content` text,
  `original_content_zh` text,
  `ai_score` decimal(4,1),
  `ai_comment` text,
  `ai_suggestion` text,
  `issue_category` varchar(64) NOT NULL DEFAULT '',
  `issue_severity` varchar(32) NOT NULL DEFAULT '',
  `uploader` varchar(32) NOT NULL,
  `reviewer` varchar(32) NOT NULL DEFAULT '',
  `previous_reviewer` varchar(32) NOT NULL DEFAULT '',
  `review_result` varchar(32) NOT NULL DEFAULT 'pending',
  `review_note` text,
  `recheck_result` varchar(32) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `postlaunch_sampling_batches` (
  `id` varchar(36) NOT NULL,
  `source_batch_id` varchar(36),
  `sc_type` varchar(32) NOT NULL,
  `owner_tl` varchar(32) NOT NULL,
  `sample_size` int NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `result_summary` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `postlaunch_sampling_rows` (
  `id` varchar(36) NOT NULL,
  `batch_id` varchar(36) NOT NULL,
  `page_url` varchar(512) NOT NULL DEFAULT '',
  `country` varchar(16) NOT NULL DEFAULT '',
  `sc_type` varchar(32) NOT NULL,
  `uploader` varchar(32) NOT NULL DEFAULT '',
  `issue_category` varchar(64) NOT NULL DEFAULT '',
  `issue_severity` varchar(32) NOT NULL DEFAULT '',
  `issue_owner` varchar(32) NOT NULL DEFAULT '',
  `root_cause` varchar(64) NOT NULL DEFAULT '',
  `review_note` text,
  `recheck_result` varchar(32) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
