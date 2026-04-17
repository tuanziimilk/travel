ALTER TABLE `content_generation_jobs`
  ADD COLUMN `input_file_path` varchar(512) NULL AFTER `input_file_name`;

ALTER TABLE `content_generation_jobs`
  ADD COLUMN `elapsed_execution_ms` bigint NOT NULL DEFAULT 0 AFTER `result_file_path`;

ALTER TABLE `content_generation_jobs`
  MODIFY COLUMN `started_at` timestamp NULL DEFAULT NULL;
