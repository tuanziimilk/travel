# SC Post-Deploy Verification Matrix

## Baseline Checks
These checks apply to every deployment:

| Area | Minimum check | Success signal |
| --- | --- | --- |
| Commit | Confirm deployed commit id | Reported commit matches intended release |
| Containers | `docker compose ps` | Expected services are up |
| Migration | `docker compose logs --tail=50 migrate` | No blocking migration failure |
| API | `/health` | Returns healthy response |
| Release summary | Final report | Includes commit, deploy result, verification result, residual risks |

## Frontend Changes
Use enhanced verification when the change is mainly UI or web routing related:

| Check | Why |
| --- | --- |
| Confirm updated frontend assets are actually served | Prevent stale dist / false “deploy succeeded” conclusions |
| Open or request the changed page/route | Validate routing and proxy behavior |
| Validate one key interaction | Avoid shipping a page that renders but does not function |

## API / DB / Migration Changes
Use enhanced verification when the change touches schemas, job stores, or API contracts:

| Check | Why |
| --- | --- |
| Read migrate logs | Catch missing table/column errors immediately |
| Exercise the changed endpoint | Ensure deployed API shape matches expectation |
| Verify persisted read/write behavior | Prevent code deployed without schema support |

## Queue / Worker / Download Changes
Use enhanced verification when the change touches background jobs, queue pages, exports, or result files:

| Check | Why |
| --- | --- |
| Confirm worker-side consumption really happens | Queue pages can look healthy while tasks never start |
| Validate status transition (`queued` -> `running`/`ready`/`done`) | Proves the consumer path works |
| Validate download/file endpoint, not only the button | Prevent HTML/404/proxy false positives |
| Verify result file exists and is readable when relevant | Catch runtime path and file persistence bugs |

## Runtime Path Changes
Use enhanced verification when the change touches `.runtime`, file storage, path resolution, or generated artifacts:

| Check | Why |
| --- | --- |
| Validate generated file location | Catch wrong base directory assumptions |
| Validate subsequent read/download using the saved path | Catch write-path/read-path mismatch |
| Check both local and deployed behavior when relevant | `process.cwd()`-style bugs can differ by launch context |

## Default Reporting Template
Final deployment summary should explicitly answer:
- What commit was deployed?
- Did deploy complete successfully?
- Which baseline checks passed?
- Which change-specific checks passed?
- What remains unverified or risky?
