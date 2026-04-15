# FAQ Generation Server Tuning

This project should run safely on both the current small host and the planned 8G host.

## Current host: 4G class

Use these environment values:

```env
FAQ_OUTPUT_JOB_CONCURRENCY=1
FAQ_OUTPUT_ROW_CONCURRENCY_CAP=6
INGEST_ROW_CONCURRENCY=6
INGEST_FINAL_RETRY_CONCURRENCY=2
INGEST_FAILURE_STREAK_THRESHOLD=2
INGEST_THROTTLE_MS=300
AI_HTTP_MAX_RETRIES=1
AI_EXECUTOR_MAX_RETRIES=1
AI_REQUEST_TIMEOUT_MS_BATCH=60000
FAQ_OUTPUT_INPUT_RETENTION_HOURS_DONE=24
FAQ_OUTPUT_INPUT_RETENTION_HOURS_FAILED=24
NODE_OPTIONS=--max-old-space-size=1024
```

Keep container limits:

```yaml
api.mem_limit: 1280m
mysql.mem_limit: 1280m
```

Operational checks:

- `docker stats --no-stream`
- `free -h`
- `journalctl -k --since '1 day ago' | grep -i oom`

## After upgrade: 8G class

Safe first-step values after the server resize completes:

```env
FAQ_OUTPUT_JOB_CONCURRENCY=1
FAQ_OUTPUT_ROW_CONCURRENCY_CAP=8
INGEST_ROW_CONCURRENCY=8
INGEST_FINAL_RETRY_CONCURRENCY=3
INGEST_FAILURE_STREAK_THRESHOLD=2
INGEST_THROTTLE_MS=200
AI_HTTP_MAX_RETRIES=1
AI_EXECUTOR_MAX_RETRIES=1
AI_REQUEST_TIMEOUT_MS_BATCH=60000
FAQ_OUTPUT_INPUT_RETENTION_HOURS_DONE=24
FAQ_OUTPUT_INPUT_RETENTION_HOURS_FAILED=24
NODE_OPTIONS=--max-old-space-size=2048
```

Recommended container limits after resize:

```yaml
api.mem_limit: 2048m
mysql.mem_limit: 2048m
```

If `n8n` is managed outside this repository's compose file, set its container limit separately to `1536m`.

## Rollout rule

- Resize host first.
- Verify `MemTotal` is close to 8G before changing app limits.
- Raise MySQL and API limits before raising FAQ concurrency.
- If MySQL RSS exceeds 1.5G or swap starts growing again, roll `FAQ_OUTPUT_ROW_CONCURRENCY_CAP` back by 2.
