# SC Commit / Deploy Pitfalls

## Core Deployment Truths
- [`deploy.sh`](D:/python-tool/SC-quality-scoring/deploy.sh) uses `git archive HEAD`; it deploys committed source only.
- Uncommitted local edits are not uploaded to the server, even if the deploy command itself succeeds.
- The server is synced from the committed snapshot into the real deploy directory; it is not a mirror of the current working tree.

## Worker And Queue Pitfalls
- API and worker are split. A healthy API does not mean background queues are being consumed.
- If `RUN_WORKERS=false`, tasks can stay in `queued` forever while the site still looks “online”.
- Queue-related changes need post-deploy verification that a worker is actually consuming jobs, not just that the queue page opens.

## Migration Pitfalls
- Features that depend on new tables or columns must check migrate logs after deploy.
- A common failure mode is “frontend/API code is deployed but required DB table was never created”, such as `content_generation_download_tasks`.
- When a new migration-backed feature is involved, `docker compose logs --tail=50 migrate` is mandatory.

## Download And Proxy Pitfalls
- Download center, FAQ export, GG result download, and similar features must be verified at the real API/file level.
- A page button existing is not enough; the response may still be HTML, a proxy error, or a `404`.
- If the behavior depends on generated files, verify that the task reaches `ready` and the file endpoint is readable.

## Runtime Path Pitfalls
- Do not assume `.runtime` paths can safely depend on `process.cwd()`.
- Features that write result files, temporary downloads, or preview artifacts are vulnerable to “duplicate path” bugs when started from different directories.
- If a change touches runtime file paths, verify both file generation and subsequent file reading/downloading.

## “Local Success” False Positives
- Local success does not prove server success.
- A passing local test or working localhost page is only pre-deploy evidence.
- Real deploy confirmation requires at least:
  - `docker compose ps`
  - migrate logs
  - API health
  - one change-specific smoke check

## Commit Hygiene Pitfalls
- Do not mix unrelated local edits into the release commit.
- If the working tree contains user edits outside the current task, acknowledge and isolate them before commit.
- Never report “deployed latest code” without naming the actual deployed commit id.
