---
name: untracked-migrations-before-delete
description: In put-checks/ui-studio, OBS-007 work (e.g. the old V34 migration, several guided tests) was never committed; check git ls-files before deleting migrations
metadata:
  type: feedback
---

Before deleting or replacing migration files, run `git ls-files` on them; uncommitted OBS-007 files existed only in the working tree (old `V34__studio_guided_secret_login.sql` was untracked, its only other copy was under `backend/build/resources/main`, which the next `processResources` wipes).

**Why:** During STUDIO-OBS-012A Lane M (2026-10-13) the V34 deletion was only recoverable because the build output still held it; it was then preserved under `docs/qa/evidence/STUDIO-OBS-012A/lane-m/preserved/`.

**How to apply:** For any re-baseline or file removal, copy untracked inputs into the story evidence directory first and record their sha256 before removing them.
