---
name: obs015-h8-h6-rulings
description: STUDIO-OBS-015 Aria rulings 2026-10-16 — guided teardown stop must be durably re-driven (no fake ACK); observed containsText = whitespace-normalized innerText vs expected (F4 parity)
metadata:
  type: project
---

2026-10-16 rulings (full text: docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/r2-diagnosis01/aria-h8-h6-ruling01/ruling.md):
- H8: a lost or slow runner `/stop` ACK left `teardownStatus PENDING` forever. This is a backend defect (single-shot stop, no re-drive). Ruling: durable re-drive via `progress.teardownRequest` plus a reaper sweep, with a deterministic `teardown-<hash>` key. Runner "Stop200 only after cleanup" is correct. Rejected: early ACK, and accepting the lifecycle notice as ACK.
- H6: `containsText` = Playwright normalizeWhiteSpace on both sides, actual = innerText; captured read values stay byte-exact; no EXECUTOR_VERSION bump.

**Why:** at-most-once and no-fake-ACK invariants (bridge-design.md:71/:73/:155); inference-contract F4 is the whitespace precedent.
**How to apply:** future teardown/assertion questions should start from these rulings; check whether Dex implemented them before re-deriving.
