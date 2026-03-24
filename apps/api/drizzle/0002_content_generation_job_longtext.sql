ALTER TABLE `content_generation_jobs`
  MODIFY COLUMN `input_file_base64` longtext,
  MODIFY COLUMN `result_file_base64` longtext;
