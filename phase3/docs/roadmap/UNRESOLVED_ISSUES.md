# Unresolved issues

*Developed by Vaishnav Sai.* Open points after the review and expansion to 87 features. Nothing here is hidden in the registry; each item is also reflected in a feature's status, gaps or external blocker.

## Database and migrations

1. **0005 and 0006 are proposed only.** They pass the disposable-schema tests, but no one else has reviewed them yet. Neither has been applied to `muse` or `muse_db`. The release gate in ROADMAP.md asks for a second reviewer before promotion.
2. **Upgrade path covers the 64-table baseline only.** Revision 1 of 0005 was never applied anywhere, so there is no upgrade path from revision 1 to revision 2. If revision 1 was applied to a private copy, the table-shape guard stops 0005 with a clear error (`listening_rooms` has no `cancelled_at`); it does not repair it. A disposable copy like that should be rebuilt.
3. **Columns and constraints are checked by name, not by definition.** If a column or CHECK already exists with the right name but a different definition, the migration skips it. New tables are checked against their full column list, but columns added to existing tables are not.
4. **DDL is not transactional in MySQL.** A crash in the middle of a run leaves part of the migration applied. The tests show that re-running completes it, at 13 interruption points for each migration. Until that re-run happens, though, the schema is half-migrated. Promote during a maintenance window and take a backup first.
5. **Retention of `login_events` (0006).** The application account may only SELECT and INSERT on this table (it is append-only, like `audit_logs`). The DATA_RETENTION job therefore cannot purge it through the app account. Two options, not yet decided:
   - a `DEFINER` stored procedure, owned by the owner account, that deletes only rows older than the policy;
   - the job runs under the owner account.
6. **`notifications` uses a polymorphic link (`link_path`) instead of foreign keys.** A CHECK limits it to in-app paths. A deleted song or playlist leaves a notification that points to a 404 page. This is accepted for an inbox, but it is still an open point.
7. **`playlist_revision_songs.song_id` deliberately has no foreign key**, so history can still show a song that was later removed. As a result, the database does not stop a revision from naming a song id that never existed. The API must write snapshots only from `playlist_songs`.
8. **Phase 2 regression report.** Running `test-phase2-sql.js` after the backend tests rewrote `docs/phase2/.build/phase2-results.json` with the latest run. That run has 0 structural differences, but it shows data differences caused by test users (explained in DB_REGRESSION_REPORT.md). The submitted Phase 2 PDF was built earlier and is unchanged. Rebuilding it now would print the differences. The clean way is a fresh `db:setup` before `db:phase2`, but that regenerates the seed with new dates, so it was not done.

## Features

9. **PROVIDER and PLATFORM blocks remain:**
   - 43, 44, 46, 54, 56 (licensed lyrics, fingerprinting, voice, native alarms, and so on);
   - 62 (multi-bitrate audio);
   - 70 (release-date feed);
   - 78 (per-user OAuth connections);
   - the e-mail recovery part of 81.

   No mock integration was added.
10. **Seven original features are NOT IMPLEMENTED** (2, 8, 9, 12, 13, 22, 27) and 33 features are PARTIAL. Only 9 are VERIFIED.
11. **76 Active Device Manager is VERIFIED on backend tests.** The Settings panel itself has no frontend test, and devices are shown by raw user-agent text.
12. **Overlap between 59 Personal Radio Station, 72 Personal Music Radio and the existing Daily mix.** They are kept as separate registry entries because the brief lists them separately. They should ship as one radio engine with different seeds.
13. **Proposed tests are designs, not code.** The "Tests to add" lines in FEATURE_REGISTRY.md describe what each feature's tests must check. They will be written with the feature. Database-level behaviour is already covered by the migration tests.

## Process

14. **The backend test suite writes to the application database `muse`.** It creates users, plays and playlists. This is why the Phase 2 data comparison needs `phase2-data-regression.js`. A dedicated test schema for `npm test` would remove the noise.
15. **The mutation check takes about 10 minutes** because every mutation rebuilds several scratch schemas. It is a manual gate (`npm run roadmap:mutation`), not part of `npm test`.
