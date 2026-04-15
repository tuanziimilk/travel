-- FAQ done-job safe cleanup
-- Use only after running the repair tool and generating a safe whitelist.
-- Replace the placeholder IDs in the IN (...) clause with the validated safeDoneJobIds output.

USE about_quality;

-- Preview the whitelist before cleanup
SELECT
  id,
  status,
  created_at,
  finished_at,
  result_file_name,
  result_file_path,
  ROUND(OCTET_LENGTH(COALESCE(input_file_base64, '')) / 1024 / 1024, 2) AS input_mb,
  ROUND(OCTET_LENGTH(COALESCE(result_file_base64, '')) / 1024 / 1024, 2) AS result_mb,
  ROUND(OCTET_LENGTH(COALESCE(CAST(row_results_json AS CHAR), '')) / 1024 / 1024, 2) AS row_results_mb
FROM content_generation_jobs
WHERE sc_type = 'faq'
  AND status = 'done'
  AND id IN (
    'REPLACE-WITH-JOB-ID-1',
    'REPLACE-WITH-JOB-ID-2'
  )
ORDER BY finished_at ASC, id ASC;

START TRANSACTION;

UPDATE content_generation_jobs
SET
  input_file_base64 = NULL,
  result_file_base64 = NULL,
  row_results_json = NULL
WHERE sc_type = 'faq'
  AND status = 'done'
  AND id IN (
    'REPLACE-WITH-JOB-ID-1',
    'REPLACE-WITH-JOB-ID-2'
  );

COMMIT;

-- Verification
SELECT
  id,
  result_file_name,
  result_file_path,
  input_file_base64 IS NULL AS input_cleared,
  result_file_base64 IS NULL AS result_cleared,
  row_results_json IS NULL AS row_results_cleared
FROM content_generation_jobs
WHERE sc_type = 'faq'
  AND status = 'done'
  AND id IN (
    'REPLACE-WITH-JOB-ID-1',
    'REPLACE-WITH-JOB-ID-2'
  )
ORDER BY id ASC;
