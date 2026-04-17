-- FAQ failed-job safe cleanup
-- Policy:
-- 1) only failed FAQ jobs older than 1 day
-- 2) keep job records, error reason, counters, status
-- 3) remove row residues and large DB payloads only

USE about_quality;

-- Preview
SELECT
  j.id,
  j.status,
  j.created_at,
  j.finished_at,
  COUNT(r.job_id) AS row_count,
  ROUND(
    (
      OCTET_LENGTH(COALESCE(j.input_file_base64, '')) +
      OCTET_LENGTH(COALESCE(j.result_file_base64, '')) +
      OCTET_LENGTH(COALESCE(CAST(j.row_results_json AS CHAR), ''))
    ) / 1024 / 1024,
    2
  ) AS payload_mb
FROM content_generation_jobs j
LEFT JOIN content_generation_job_rows r ON r.job_id = j.id
WHERE j.sc_type = 'faq'
  AND j.status = 'failed'
  AND COALESCE(j.finished_at, j.created_at) < NOW() - INTERVAL 1 DAY
GROUP BY j.id, j.status, j.created_at, j.finished_at
ORDER BY row_count DESC, j.id ASC;

START TRANSACTION;

DELETE r
FROM content_generation_job_rows r
INNER JOIN content_generation_jobs j ON j.id = r.job_id
WHERE j.sc_type = 'faq'
  AND j.status = 'failed'
  AND COALESCE(j.finished_at, j.created_at) < NOW() - INTERVAL 1 DAY;

UPDATE content_generation_jobs
SET
  input_file_base64 = NULL,
  result_file_base64 = NULL,
  row_results_json = NULL,
  route_summary_json = NULL,
  route_snapshot = NULL,
  output_schema_snapshot = NULL
WHERE sc_type = 'faq'
  AND status = 'failed'
  AND COALESCE(finished_at, created_at) < NOW() - INTERVAL 1 DAY;

COMMIT;

-- Verification
SELECT
  SUM(CASE WHEN status = 'failed' AND COALESCE(finished_at, created_at) < NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS failed_jobs_older_1d
FROM content_generation_jobs
WHERE sc_type = 'faq';
