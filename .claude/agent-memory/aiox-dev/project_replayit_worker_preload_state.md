---
name: replayit-worker-preload-state
description: GuidedPublicationReplayIT guided/ordinary workers are long-lived Node processes; module-level state in the test's JS preload leaks across cases; producer sample files show it
metadata:
  type: project
---

GuidedPublicationReplayIT starts its guided and ordinary runner workers once (`startWorkers()`), so the JS preload text blocks inside the test (`p4RevocationScalarSupport`, `p4GuidedRevocationObservers`, C5/C6 hooks) keep module-level counters across test cases. A case can pass alone and fail only after a specific predecessor in the same worker.

Fastest diagnosis (2026-10-13, C6 cascade): read `$TMPDIR/obs007-joined-<n>/p4-revocation-producers/<case>-<producer>.json`. `pending` = revPending + revOriginalPending + highPending + cdpPending; compare against the previous case's sample. A non-zero `pending` with `sent==acked` and `failed:true` means an inherited counter, not a slow ACK. Then A/B with Order(1) + suspected predecessor + victim (about 2 min) instead of the 19 min full class.

**Why:** the C6 cascade looked like a timing or teardown flake for a whole lane; it was a counter inherited from kind 3 (browser loss) that revInit did not reset for kind 4.

**How to apply:** when a ReplayIT case fails only in class order, suspect preload state from the nearest earlier case that uses the same worker before suspecting TRACE load. Related: [[tooling-replayit-diagnostics]], [[shared-scratch-and-gradle-lock]].
