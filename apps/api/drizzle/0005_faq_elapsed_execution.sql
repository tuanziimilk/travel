ALTER TABLE `content_generation_jobs`
  ADD COLUMN `elapsed_execution_ms` bigint NOT NULL DEFAULT 0 AFTER `result_file_path`;

ALTER TABLE `content_generation_jobs`
  MODIFY COLUMN `started_at` timestamp NULL DEFAULT NULL;
