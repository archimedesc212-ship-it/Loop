# Database regression report

*Developed by Vaishnav Sai.* All runs happened on 31 October 2026 on MySQL 8.0.46. Every number below comes from a script output saved in `docs/roadmap/.build/`.

## Verdict

The academic submission and the application database are both still at the **64-table baseline**, migrations 0000–0004:

- `muse` has 64 base tables; `migrate status` lists 0000–0004 as applied, with nothing pending.
- `muse_db`, rebuilt from the submitted Phase 2 DDL and DML, has 64 base tables.
- Neither proposed migration (0005 or 0006) was applied to either database.
- No schema regression was found.
- No submitted row was lost, except 8 rows that the private-session cleanup job deletes by design (details below).

## 1. Structure — `backend/scripts/test-phase2-sql.js`

The submitted DDL and DML were built as `muse_db` and compared with the application database `muse`:

| Compared | Items | Differences |
|---|---|---|
| Columns (name, position, type, NULL, default, extra, generation, collation) | 523 | 0 |
| Index columns (PRIMARY, UNIQUE, ordinary, FULLTEXT) | 318 | 0 |
| CHECK constraints | 71 | 0 |
| Foreign-key columns (parent, ON DELETE, ON UPDATE) | 126 | 0 |
| Tables (engine, collation) | 64 | 0 |
| Orphan rows across 124 foreign keys | — | 0 |

**Constraint tests:** 19 groups. 15 invalid statements were rejected by MySQL with the expected error codes (1062, 1452, 3819, 1048, 1265, 3105, 1451). The 4 valid groups — CASCADE, SET NULL, generated column and valid insert — were accepted and rolled back.

**Exit code 1, and why.** The script also compares row counts and `CHECKSUM TABLE` with `muse`: 37 count mismatches and 38 checksum mismatches. The cause is that the backend test suite writes its own users, plays and playlists into `muse`. The data check below separates those test rows from real regressions.

The script's flag "data unchanged after the constraint tests: false" comes from the same muse-versus-muse_db comparison. A separate check ran the constraint-test file against `muse_db` alone: 35 statements accepted, 15 rejected, and **all 64 table checksums identical before and after**.

## 2. Data — `backend/scripts/roadmap/phase2-data-regression.js`

Every one of the 15,712 submitted rows was hashed over all its columns and looked up in `muse` by primary key:

| Result | Rows | Explanation |
|---|---|---|
| Present and identical | 15,695 | — |
| Missing | 8 | `incognito_events` 1–8. They belong to seeded private sessions 1 and 2, which expired on 24 and 25 Oct. `sp_cleanup_expired_incognito` deleted their events, which is the designed privacy behaviour. |
| Changed | 9 | `incognito_sessions` 1–2: `status` became EXPIRED and `ended_at` was set by the same cleanup job. `users` 1, 2, 3, 12: `last_login_at` changed because tests sign in as seeded users. `music_sources` 2, 4, 7: `last_success_at` changed because the pipeline tests ran an ingest. |
| Extra rows in `muse` | 24,288 | Created by the automated test suites (test users, their plays, playlists, sessions). |

No submitted row was changed or deleted by anything other than these documented runtime jobs.

## 3. Phase 3 queries — `phase3/run_query_tests.py`

- 17 of 17 queries ran against `muse_db`; exit code 0.
- Coverage: SELECT, WHERE, SUM, AVG, COUNT, MIN, MAX, GROUP BY, HAVING, ORDER BY, INNER/LEFT/RIGHT JOIN, subquery, CTE and window function.
- The read-only guard blocked all 4 write attempts.

## 4. Application test suites — `backend/scripts/roadmap/collect-test-results.js`

| Suite | Passed | Failed |
|---|---|---|
| Backend (`node --test`, 12 files) | 121 | 0 |
| Frontend (Vitest) | 34 | 0 |

`check-registry.js --results` then confirmed that every test cited by a VERIFIED feature passed in this run. All 57 cited test names were found among the passing tests. ESLint reports 0 problems.

## 5. Proposed migrations — see MIGRATION_TEST_REPORT.md

`test-proposed-migration.js` ran 217 checks and all passed:

- 0005: 130 checks;
- 0006: 87 checks, on a baseline with 0005 applied.

Both ran on disposable schemas only.

`mutation-check.js` deliberately breaks each migration in 13 ways, to show that the tests detect missing triggers, constraints and guards. All 13 broken copies were caught. The first run missed one (a CANCELLED room that also records a start time); a test for that case was added, and the full re-run caught all 13. The full output is in MIGRATION_TEST_REPORT.md.

## How to reproduce

```
node backend/scripts/test-phase2-sql.js                 # structure + constraint tests (do NOT use npm run db:phase2: it regenerates the submitted files)
node backend/scripts/roadmap/phase2-data-regression.js  # submitted rows still present in muse
npm run phase3:test                                     # needs muse_db: mysql < database/phase2/MUSE_Phase2_DDL.sql, then _DML.sql
npm run roadmap:verify                                  # backend + frontend tests, then registry check against the results
npm run roadmap:test-migration                          # proposed 0005 and 0006 on disposable schemas
npm run roadmap:mutation                                # tests catch deliberately broken migrations (~10 min)
```
