---
name: tooling-schema-epoch-overlay
description: Recompute GuidedContracts schema epochs after any contracts/v3 schema edit via a classpath overlay; runner dist must be rebuilt before backend guided ITs
metadata:
  type: project
---

Editing any `contracts/v3/*.schema.json` that `session` or `replay-validation` reaches through `$ref` (for example `limits`, `versions`, or `profile`) moves `GuidedContracts.*_SCHEMA_EPOCH`. When the epoch is stale, the code silently falls back to native validation, and `GuidedWireContractTest` fails on the compiled-plan property count.

**How to recompute (012A d1-ceiling, 2026-10-13):**
- Lane C's `Epochs.java` lives in the shared scratchpad root. `maincp.txt` holds the main runtime classpath.
- Run `java -cp <overlay>:<cp> Epochs.java`. The overlay is a directory containing `studio/observed-contracts/v3/*.schema.json`, and it wins over `build/resources/main`.
- Use an "old" overlay (the pre-edit file) to prove the method: it must reproduce the current constants. Then use a "new" overlay to get the new values.

**Runner side:**
- Regenerate with `node tools/build-studio-observed-schemas.cjs`. Backend has no copy to regenerate, because processResources packages docs/specs directly.
- Rebuild `studio-runner/dist`. Backend guided ITs spawn `dist/run/guidedMain.js`, so a stale dist validates against the old schema.

**Planning joined-flow reservation:** `/tmp/studio-obs005-joined-metrics.json` is overwritten per parameter. A 1 s background watcher that copies it on every mtime change captures both chosenIndex values.

**Why:** this took Lane C a wrong "no epoch change" inference to learn.

**How to apply:** do this after any v3 schema edit. Related: [[tooling-gradle-focused-runs]], [[tooling-replayit-diagnostics]].
