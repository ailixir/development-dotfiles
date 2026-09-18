---
name: fixtures-tier-recording-capture
description: How to keep the fixtures tier's .webm recordings after outcome.clear() deletes them, without editing any test — TMPDIR override plus a hard-link poller
metadata:
  type: project
---

To keep the fixtures tier's recordings, point `TMPDIR` at a scratch directory and run a separate
Node process that polls it every 20 ms. The process `linkSync`s each
`studio-runner-fixtures-*/video/*.webm` into a capture directory. The command itself stays the
literal `npm run test:fixtures`, and the tree stays byte-clean.

**Why:** `runReal` puts scratch under `os.tmpdir()`, and `outcome.clear()` removes it right after
the test reads the file. Playwright's recorder writes the `.webm` in place for the whole run, so a
hard link made early keeps the finalized inode alive. Story 10.16b needed the frame lists of real
mis-attributed recordings, and AC-16 forbade touching `seek-measurement.test.ts`.

**How to apply:**
- Scratch and capture must be on the same filesystem (both under the session scratchpad works).
- The long scratchpad path did not break Chromium.
- Seek recordings are the ones with ~140 frames and ≥5 scene changes, in link order.
- Verify fidelity by re-running the helper on the captured file and reproducing the printed `SEEK` `frame=` values.
- The `SEEK` table prints offsets to 0.1 ms, so a step sitting within 0.05 ms of the slack boundary needs the unrounded value. The verbatim `expected X to be less than` message gives it.
- Label counterfactual replays as inference.

Related: [[browser-proof-without-playwright]], [[epic10-falsification-standard]]
