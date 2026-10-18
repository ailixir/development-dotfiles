---
name: obs009-pre-g9-review-20261018
description: Non-obvious facts from the 2026-10-18 STUDIO-OBS-009 pre-G9 QA review (ADJ-1 co-sign, F-R2-1, EP, REL-001 line, C10 plan, D2 skeleton)
metadata:
  type: project
---

Outputs are in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/pre-g9-review/` (read-only review, nothing executed). Facts a later session would not guess:

- `limits.schema.json` caps `maxModelOutputTokensTotal` at 32000 (contract v3). B7 (13 proposals per 10-step base x 4096 = 53 248) cannot be fixed by raising the session total without a contract change; the only no-contract lever is a per-call ceiling at or below 2461.
- `studio_dispatch_ledger.revoked_at` has no write-once DB trigger (V14's trigger is on `studio_guided_sessions`). Ruling part 2 and S text say "by trigger"; only `SecretRevocationSweep` writes it (`AND revoked_at IS NULL`).
- `GUIDED_START_FAILED` is logged for ANY `CONTEXT_LOST` refusal of `assign`/`context` (`transport.ts:139`), not only launch failures. A real launch failure is always a `GuidedStartFailure` link (phase/loss); the constant 1 ms `Error/CONTEXT_LOST` line in the incremental lane is a pre-start refusal. Classification rule is in `rel001-pointer-ruling.md`.
- `with-gradle-lock.py` derives the lock path from its own location, so a scratch copy needs the LIVE script. `capture-manifest.py` needs `git ls-files`; a scratch copy has no git, so C10 re-checks hashes against `capture-after.json` instead.
- D2 trigger: G9 C4 returned 575 passed / 6 failed, all "image put-checks-studio-runner:10.18a-local does not exist"; I decided C4 counts NOT_MET until U22 (Docker) is given, the image is built and C4 is re-run at the same digest. Base image pull may also be unauthorized (w0/decisions.md).

**Why:** these change what the D2 record, the MODEL-SIZING ruling and the REL-001 count must say.
**How to apply:** re-check each against the tree before reusing; reuse the review files instead of redoing them.
