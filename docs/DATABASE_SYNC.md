# Database source of truth and safe sync

This document defines what belongs in Git and what must remain in a database backup or managed database.

## What is tracked in this repository

- `database/01_schema.sql` through `database/06_security.sql`: frozen baseline schema, routines, views, triggers, and application-account grants.
- `database/migrations/NNNN_description.sql`: forward-only, numbered schema changes. Once applied, do not edit an existing migration; add a new migration instead.
- `database/07_seed.sql`: baseline seed script consumed by `backend/scripts/setup-db.js`.
- `backend/scripts/setup-db.js`, `backend/scripts/migrate.js`, and `backend/scripts/import-kaggle-features.js`: database setup, non-destructive migration, and Kaggle feature import workflows.
- `.env.example` and `docs/ENVIRONMENT.md`: variable names and configuration guidance. Real credentials belong only in the ignored local `.env` or the hosting provider's secret store.

## Important safety rules

1. **Never commit a live database dump** or user records to Git. Dumps can contain email addresses, password hashes, listening history, private sessions, and other personal data.
2. Never commit `.env`, passwords, API keys, session secrets, or production connection strings.
3. Use migrations for schema changes. A migration is immutable after it has been applied because the migration runner checks SHA-256 checksums.
4. Use reviewed, deterministic SQL seed files only for non-sensitive reference/demo data. Keep personal or production data out of seed files.
5. Back up a database before any schema operation. In particular, `npm run db:setup` is destructive: it drops and recreates the configured database. Do not use it to update an existing database.
6. For an existing database, use `npm run db:migrate` after verifying the backup and reviewing pending migrations.

## Local verification workflow

Run from the repository root after setting valid local credentials in `.env`:

```bash
npm run db:status
npm run db:verify
```

Review the output before applying any migration:

```bash
npm run db:migrate
npm run db:status
npm run db:verify
```

The migration command is intended to apply pending forward migrations without dropping existing tables. It still changes the database, so take a backup first.

## Kaggle feature dataset

The repository's importer is invoked with:

```bash
npm run dataset:import -- /path/to/tcc_ceds_music.csv
```

The importer writes feature metadata to the separate `kaggle_ceds_music_features` staging table and deliberately does not store or log the CSV's lyrics column. The database account used by the API must have the required table privileges, and the target table must exist before importing.

Keep the original CSV and any resulting database dump outside Git unless the dataset's licence, redistribution terms, and repository policy have been reviewed. The importer identifies the dataset as CC BY 4.0; retain the dataset attribution with any approved redistribution.

## What this repository commit does not do

A Git commit cannot read or export a MySQL server running on a developer's Mac. This document records the repository's database workflow; it does not claim that a developer's local rows have been uploaded. To preserve local data, first create a private backup, inspect it for personal or secret data, and convert only approved reusable reference/demo rows into reviewed seed SQL.
