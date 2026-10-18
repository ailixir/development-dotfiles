---
name: obs008-w1-confirmations
description: OBS-008 W1 (2026-10-17) — F4/R4 note confirmed; A1 empty/misaligned list = null; replay_failure cols insertable+updatable=false; R3 needs explicit closing selectors
metadata:
  type: project
---

**Rulings (2026-10-17, `t0-rulings/w1-confirmations.md`):**
- **F4 note confirmed.** It sits as its own paragraph at line 126, directly under F4 (line 124), and the wording matches decision.md byte for byte. Contract doc sha256 is `5ff06f4a…` after the edit and `68f67d60…` before. The "Superseded" banner was not added by L0.
- **A1, empty step list.** An empty `revisionStepIds` gives null for both login and drift, never 400. The 400 is a membership refusal and needs a list to check against.
- **A1, misaligned step list.** A list that does not line up also gives null. Publication makes misalignment unreachable (`GuidedSnapshotDeriver`), and a 400 would block a truthful terminal status.
- **Correction.** The `replay_failure_*` JPA columns must be mapped `insertable = false, updatable = false`, matching the `observed_admission_receipt` precedent. `applyFinal` is the only writer.
- **R3 (P2/P3 required progress/explanation).** The red comes from the backend validating its own outbound bodies at four sites: GuidedSessionService view/result and GuidedPublicationResultProjector :118/:202. No schema or epoch change is needed.

- **§4, readGuidedResult (C-OBS008-1).** With publication disabled, the non-terminal 202 returns a bare PublicSession. That is a fallback-path divergence that predates 008. The contract is right; the fix is carried to OBS-011, which should fold the two result builders into one. Neither R3 nor D5 depends on it, because publication is enabled by default.

- **§5, secret value bound.** The contract moves 8192 → 4096 as C-int unit 3: openapi:4429, the two pins, the §13 row, and runbook `studio-runner.md:595`. L4 changes `SecretInput` and `secretsHandlers`. The 4096 comes from OBS-007 AC-12 / F-5, not 014 and not the 64 KiB read cap. That cap fits even 8192 (about 57 KiB worst case), so the Javadoc rationale is stale (C-OBS008-2 → OBS-011).

- **§6, P3 placeholder explanation.** Rejected. An out-of-contract scope (non-decimal revision, non-UUID step, more than 100 steps) gives INVALID_CONTRACT 422, and the `withoutFacts` explanation gives RUNTIME_INCOMPATIBLE 409. Never "0" or `steps: []`. `progress` with `activeStep: null` stays. The fixtures move to realistic seeds: `session-it-documents.json`, `GuidedRecordingSeed`, and an install line in hand-built services.

**Why:** an expected-red ledger row that lives in guided ITs cannot be closed by a lane exit worded as "StudioContractTest green". GuidedSessionIT and GuidedObservationPrunerIT were in no lane selector, so the F1 union run would never have measured them.

**How to apply:** for any ledger row, require an exact list of red test names, a named closing run that is sourceStable and includes those selectors, and a separate owner for any cascade red that is still red after the fix. Related: [[contract-change-checklist]], [[obs015-t0-rulings]].
