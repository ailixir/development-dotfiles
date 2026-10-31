---
name: obs008-w0-refold
description: STUDIO-OBS-008 W0 refold 2026-10-17 — lane plan W1..W5, collector source-hold trap, V22 head-pin tests, a11y + playback descoped
metadata:
  type: project
---

008 lane plan refolded 2026-10-17 (lanes.json → `w0Refold20261017`, implementation-plan.md "W0 refold 2026-10-17", t0-rulings/w0-refold.md).

- W1 = U2 pnpm migration ∥ L0 C-int (P1–P3 + A1 OpenAPI + F4/R4 note) ∥ @data-engineer V22 ∥ L1-A backend A1 derivation. Frontend lanes start only after U2 exits.
- Collector trap: `capture-manifest.py` hashes frontend/ too, so any frontend edit during a backend/runner collector run makes sourceStable false. This was put to root as decision R1.
- Six backend tests pin the Flyway head at "21" (InferenceMigrationLatestIT, ErrorCodeConstraintMigrationIT, GuidedGovernance/Recording/ReplayingPrefix MigrationIT, GuidedPublicationMigrationTest). Any new migration must update them in the same unit.
- User descoped (2026-10-17) PLAYBACK-COST, PLAYBACK-COPY and all non-must-have a11y (ADR-SC-006). The jsdom audit stays only as a regression guard.

**Why:** these decisions bind dispatch and are easy to re-introduce by reading the older 2026-10-16 sections of the same files.
**How to apply:** for 008 work, read the refold section first. For any new Flyway migration, grep the head pins. For parallel waves, plan source-hold windows around collector runs.
