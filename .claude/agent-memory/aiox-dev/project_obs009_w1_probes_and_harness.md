---
name: obs009-w1-probes-and-harness
description: STUDIO-OBS-009 W1 (2026-10-18) outcomes and fixture gotchas - R1 and ADJ-1 probes both reproduced, StudioRunnerTls/RunnerTestTls/RunnerProcessHarness APIs, A4 tripwire has a third site
metadata:
  type: project
---

W1 backend lanes D3.0, PR-BE, I.0 done 2026-10-18; receipts under `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/{d3,pr-be,i}/receipt.md`.

- **R1 reproduced:** `GuidedSessionEvidenceService.record` (`:116` identity require) returns 409 STALE_FENCE for v(n-1) while a v(n) delivery is PENDING. `GuidedEvidencePendingAppendIT` holds the probe plus a green control; lane B extends it.
- **ADJ-1 reproduced:** revoked + ADMITTED row: runner FINAL gets 409 TRANSITION_REJECTED (`applyFinal` owns only RUNNING, or ADMITTED with a cancel), `RunningReaper` closes it START_TIMEOUT. `RunnerOutcomeCodes` already maps ERROR/CANCELLED+revoked to AUTHORIZATION_REVOKED, so the (a) question is only the ledger predicate. `PreReadyRevocationProbeIT` = green characterization + red target.
- **A4 tripwire baseline is 3, not 2:** `GuidedSessionConfiguration:94,111` and `GuidedTranslationCoordinator:47` (controller-origin hop, not a runner client). Needs an architect call before W2 D3.
- Harness cannot run against the current pre-fold dist: it exits 78 on the new TLS keys (smoke-verified). Red until F-merge by design.

**Why:** these are the facts lane B, W2 D3 and F start from.

**How to apply:**
- A service-level session fixture must not call `GuidedDispatchService.assign` (it needs the runner relay). Do `prepareAssignment` + `sessions.claim` as the owning worker + `acknowledgeAssignment` with an OWNED receipt, as the fault IT's relay does.
- ADJ-1-style Spring ITs: `@Import(DispatcherIT.FakeRunner.class)` reuses the fake runner, vault and entitlements.
- Format new Java files without Gradle via the gjf 1.22 CLI (see [[tooling-javac-precheck-outside-lock]]); then `./gradlew --no-daemon --continue spotlessCheck checkstyleMain checkstyleTest spotbugsMain` under the lock took 22 s and was green.
- Use `127.0.0.1`, not `localhost`, as the TLS origin for a runner bound to 127.0.0.1 ([[project-host-port-and-chromium-flakes]]).
