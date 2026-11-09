# Roadmap folder

*Developed by Vaishnav Sai.*

| File | What it is | Produced by |
|---|---|---|
| `feature-registry.json` | Source of truth for all 87 features | hand-edited; 58–87 merged by `backend/scripts/roadmap/features-58-87.js` |
| `FEATURE_REGISTRY.md` | Readable registry with evidence, design, tests and blockers | `npm run roadmap:check` (or `roadmap:verify` with test results) |
| `DEPENDENCY_MAP.md`, `dependency-map.svg` | Which feature needs which first | `node backend/scripts/roadmap/build-roadmap-docs.js` |
| `ROADMAP.md` | Phases, order of work, release gate | same |
| `MIGRATION_TEST_REPORT.md` | Every check on proposed 0005 and 0006 | `npm run roadmap:test-migration` |
| `DB_REGRESSION_REPORT.md` | Baseline, Phase 2, Phase 3 and app test results | written from the outputs in `.build/` |
| `UNRESOLVED_ISSUES.md` | Open points | written by hand |

Proposed migrations: `database/migrations/proposed/0005_roadmap_33_57.sql`, `0006_roadmap_58_87.sql`. They are **not applied**. The migration runner reads only `database/migrations/NNNN_*.sql`.
