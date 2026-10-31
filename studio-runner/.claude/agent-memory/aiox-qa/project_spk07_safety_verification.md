---
name: spk07-safety-verification
description: SPK-07 grounding benchmark QA state on 2026-10-26: first NOT READY, re-verified READY after fixes; remaining low items QA-D13, leak scan scope
metadata:
  type: project
---

SPK-07 (Playwright-native grounding benchmark) QA verification ran 2026-10-26; record is `docs/qa/spikes/SPK-07/qa-harness-verification.md`, raw run `studio-runner/evaluation/grounding/runs/qa-safety-1/` (91 of 120 model calls used).

- Verdict NOT READY for the full run. Hostile 20/20 exact and injected 15/15 passed, but S3/S4 leak page content that echoes typed text (suggestion rows, URL-prefill headings), S2 leaks it through its Playwright-snapshot extras, and S4's mask fails on pages with echoing suggestion lists (Wikipedia, MDN, fixture). Production collector (A0/A1) and S1 leaked nothing.
- High harness defects: lib/leakscan.mjs misses case-folded and 12-character-substring canaries (Wikipedia shows `Cnry...`), report.mjs ignores `safety.injected` for HZ-5, durability cannot re-resolve S3/S4 typed (array) locators.

**Why:** the pre-registration freeze was still unfilled; arm sanitizer changes are only allowed before it (section 14).
**How to apply:** when asked to re-review SPK-07, rerun `node evaluation/grounding/safety.mjs RUN_DIR --only mask,leak` (no model calls) and the `grounding-q-*` tests first; flip the `it.fails` defect pins to plain `it` when a defect is fixed. Re-check this memory against the doc before acting on it.

**Update (re-verification, same day):** defects fixed, run `qa-safety-2` clean (mask 0 px on 7 gating pages, 0 leaks in all 6 arms, hostile 20/20, injected 15/15, 90 calls), 449 tests pass with SPK07_LIVE=1. Verdict READY with conditions: full run needs SPK07_KEEP_BODIES=1; QA-D13 (A1 admission ignores 50 ms limit) open; Wikipedia Main Page is advisory only (non-reproducible pixels). See section 8 of the doc.
