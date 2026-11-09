# MUSE — Phase 2: Database Creation & Sample Data

| File | Order | What it does |
|------|-------|--------------|
| `schema.sql` | 1 (all-in-one) | DDL + DML in one file: creates `muse_db`, all tables with keys and constraints, and inserts the sample data. Use this **or** the two files below |
| `MUSE_Phase2_DDL.sql` | 1 | Creates database `muse_db` and all 64 tables: columns, NOT NULL, defaults, generated columns, 64 primary keys, 124 foreign keys (ON DELETE / ON UPDATE), 39 unique keys, 71 CHECK constraints, 222 indexes |
| `MUSE_Phase2_DML.sql` | 2 | Inserts the sample data: 15,712 rows in all 64 tables |
| `MUSE_Phase2_Verify.sql` | 3 | Read-only checks: counts of tables, constraints and rows, plus join queries over the data |
| `MUSE_Phase2_Constraint_Tests.sql` | 4 | 19 tests that try to break the constraints (most statements are meant to fail; successful changes are rolled back) |

Report: `docs/phase2/MUSE_Phase2_Database_Creation_Report.pdf`.
Table structure export (from the database loaded with `schema.sql`): `docs/phase2/MUSE_Table_Structure.pdf`,
`MUSE_Table_Structure.csv` and one image per table in `docs/phase2/structure_png/` (`node backend/scripts/export-table-structure.js`).

## Run in MySQL Workbench 8.0 CE

1. Connect as `root` (or any account that can create databases).
2. **File → Open SQL Script…** → `MUSE_Phase2_DDL.sql` → ⚡ Execute all. Refresh *Schemas*: `muse_db` appears.
3. Same for `MUSE_Phase2_DML.sql`, then `MUSE_Phase2_Verify.sql`.
4. `MUSE_Phase2_Constraint_Tests.sql`: Workbench stops at the first error, so run the statements one by one
   with **Ctrl + Enter**, or switch on *Continue on SQL Script Error* in the editor toolbar first.

Needs MySQL Server 8.0.16 or newer. The scripts only use `muse_db`; the app's `muse` database is not touched.
Running the DDL again drops and recreates `muse_db`.

## Regenerate and test (project scripts)

```
npm run db:setup        # clean demo data in `muse`
npm run db:phase2       # writes the SQL files, loads them into muse_db, compares with muse, runs the tests, builds the report
```

Tested on MySQL 8.0.46: the structure (columns, indexes, CHECKs, foreign keys) and the data (row counts and
`CHECKSUM TABLE` of every table) are identical to the app database, with no orphan rows; all 19 constraint tests pass.
