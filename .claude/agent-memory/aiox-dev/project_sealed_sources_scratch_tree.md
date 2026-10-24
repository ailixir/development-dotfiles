---
name: sealed-sources-scratch-tree
description: When the live case seals backend source files, develop in an rsync scratch copy of backend/ and ship patches; never run Gradle in the real tree
metadata:
  type: project
---

Round 054 (2026-10-22): four backend files (GuidedTranslationService/Store, GuidedSessionService, GuidedGuardProvenance) are hash-sealed by `portable388-source-binding/seal.json` until case433 ends, and no Gradle may run in the real `backend/` (it rewrites `backend/build`).

**Why:** the case's frozen compiled pins cover `backend/build`; a single `compileJava` in the real tree got flagged by the DevOps drift check (32 outputs rebuilt).

**How to apply:**
- Before editing any source, check for a seal/freeze message; copy first: `rsync -a --exclude build --exclude .gradle backend/ $S/tree/backend/`, plus a `docs/` dir with symlinks to `docs/specs` (and `docs/qa` for read-only evidence tests), and a `studio-runner` symlink.
- Keep a `base/` copy of the pre-edit bytes for files that were already dirty (git HEAD is not the baseline), so `diff -u base tree` regenerates an exact patch; verify by applying the patches to a copy of the real files and `cmp`.
- Run Gradle through a copy of `gradle-locked.sh` whose last line `cd`s into the scratch backend; sync only `src/test` from the real tree.
- V23 consequence: every `.target("22")` and `max(version)=22` assertion in migration ITs needs bumping; mock-based fixtures that stub `finishAttempt` 6-arg need the 7-arg overload stubbed too.
