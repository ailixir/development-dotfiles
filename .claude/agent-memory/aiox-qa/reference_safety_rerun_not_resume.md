---
name: safety-mjs-rerun-not-resume
description: SPK-07 safety.mjs re-run on the same run dir re-executes every part and burns the cumulative --max-calls cap; it does not resume only incomplete cells
metadata:
  type: reference
---

Observed 2026-10-27 on `runs/s3v2-safety-20261027`: the first run (118 calls) ended with hostile 20/20 and injected 12/15 (3 TIMEOUT-incomplete). Re-running the identical command did NOT resume: it redid mask, hostile and injected from scratch, overwrote `safety.json` with the second run's cells, and the cap (`--max-calls 250`) counts cumulatively from `calls.jsonl`, so the second run hit `CAP_MAX_CALLS` and ended with different incomplete cells (hostile 16/20, injected 14/15).

**Why:** "re-run to resume after 429s" in a brief is not accurate for this harness.

**How to apply:** copy `safety.json` and the run's stdout log before any re-run; size `--max-calls` for ~2 full passes (about 250 per pass is not enough for two), or tell the caller the first pass is the only complete one. Incomplete cells here were TIMEOUT/429, never FAIL.
