# STUDIO-OBS-015 w5-window01: B3B-3 flake root cause, B3B-1 stage finding, ack03 tightenings, ledger-56 E1/E2, regression

Dex-W5 (@dev), 2026-10-16. Nothing was committed. This window grants no QA credit; Quinn re-gates.
[V] means I ran it or read it. [I] means inferred, not executed. Hashes are in `manifest.json`.
**No production file was changed in this window.** All edits are to test code or contract fixtures.

## 1. B3B-3 `incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear`: latent fixture flake, not caused by w4

**Symptom [V].** In `w4-full-incr02`, the precondition at `refuseOffered:4524` fired: "edge-native0-excluded-admission
changes the offered basis". So the genuine `consumerEdges[0].consumerAdmissionId` already **was** `native0`.
- The w3 `b3-outcomes` show the same label as `REFUSED:REFERENCE_MISMATCH` there, so in w3 `[0]` was a different edge.
- The w4 outcomes stop after `edge-unknown-admission`.

**Root cause [V code, I for the jsonb key order].**
- `GuidedPublicationEvidenceRepository.java:720-724` reads `studio_guided_consumer_edges ... ORDER BY document::text`.
- `GuidedEffectiveGraph:88-113` and `GuidedBindingStore.attachConsumer:208-240` show that an admitted native0
  attempt that is later excluded keeps its own consumer edge. That edge has the same binding, coordinate, slot,
  origin and policy as the replayed native1 edge.
- [I] jsonb stores object keys shortest-first. The first key that differs between the two edges is therefore
  `consumerAdmissionId`, a random UUID. Whether the native0 edge sorts first is decided by those random UUIDs.
  - That matches the observations: w3 put native1's edge first, w4 put native0's first.
- `b3EdgeMatrix` took `consumerEdges.get(0)` blindly; the design (`b3abc-design01` :1270 `edge0`) assumed index 0
  is a replayed edge.

**Window changes are not the cause [V].** None of D4, D5, ack02, L1 or the race fix touches:
- `b3EdgeMatrix`;
- edge persistence or ordering;
- `GuidedBindingStore`;
- `GuidedPublicationEvidenceRepository`.

L1 changed only `GuidedMaterializationService.verifyLifecycle` and `GuidedSessionService.lifecycle`.

**Fix (test-only, `replayit-w5.diff`).**
- In `b3EdgeMatrix`, the six `edge-*` labels now attack the replayed edge. It is chosen by identity
  (`consumerAdmissionId != native0`) and then by a UUID-free order key (`b3EdgeOrder`: step position, ordinal,
  slot), never by position.
- New preconditions (stricter):
  - the genuine basis holds **exactly one** native0 edge;
  - the genuine basis holds at least one replayed edge.
- No oracle changed. `b3Edge0` is kept, unchanged, for B3C-1 `hidden-successful-use`: `drift2` is a pre-admission
  drift, so there is no excluded edge.
- Result: PASS in `w5-w01-targets01` and in `w5-w01-full-incr01`. The 12 labels refuse exactly as in w3. For
  example, `edge-native0-excluded-admission` is `REFUSED:REFERENCE_MISMATCH` (`b3-outcomes/`).

## 2. B3B-1 `...RejectEveryStoredSubstitution`: INVALID_CONTRACT finding, fixed in the fixture; a deeper finding is now exposed

**Refusing guard [V].** It is `GuidedMaterializationEvidence.java:65`, the
`contracts.validate("v3/authored-inputs", full)` call, one line before the hash check at :66-68.
- `v1-private-value` replaces the first textual rev-1 input. That input is the step-0 navigate `destination`,
  whose schema type is `"format":"uri"` (`authored-inputs.schema.json`).
- The test wrote `"B3-DIFFERENT-PRIVATE-VALUE"`, which is not a URI.
- Scratch probe against the compiled `GuidedContracts` (class sha `314463bf…`):

| Value | Result |
|---|---|
| destination, non-URI | `INVALID_CONTRACT` |
| destination, different `https://…` | VALID |
| nonsecretText, the same string | VALID |

**Ruling on the stage.**
- `INVALID_CONTRACT` is the correct earliest refusal for *that* byte substitution. The product validates the
  schema before the hash, which is fail-closed. **This is not a product defect.**
- The design's prediction (`b3abc-design01:729`, "hash(full) no longer matches 66-68") was wrong for a
  destination input.
- The schema guard does **not** fully cover the clause: a schema-valid substituted value passes :65. So I did
  **not** re-pin to `INVALID_CONTRACT`.

**Fix (test fixture bytes; needs a QA ack).**
- `B3PrivateReadBoundary` now substitutes a different **schema-valid** value for the input's kind: a
  `destination` gets `https://b3-different-private-value.example.test/`, and any other kind keeps the old string.
- The `EVIDENCE_MISMATCH` pin is unchanged.
- Observed [V]: all three returned-read labels gave `WRITER_REFUSED/EVIDENCE_MISMATCH/readsDelta 1`.
- v2 and cutoff were exercised for the first time, and both match the design.

**New finding (not fixed; production-level; needs an @architect ruling) [V code + run].** The test now reaches
generation 2 for the first time.
- What passes [V]: `gen2-positive`, `older-same-test-equal-hash-base` refused with `PUBLICATION_CONFLICT`, both
  non-destructive CAS checks, and the destructive source CAS. The latter returns 409 `PUBLICATION_CONFLICT` with
  state `PUBLICATION_CONFLICT`, 0 publications and confirmed head r2.
- Where it fails: the test then fails at `p3AwaitTeardown(id)` (`ReplayIT:5009`). `teardownStatus` stays `""`.
- The failed-test cleanup confirms the same: that session is `PUBLICATION_CONFLICT` with `teardownStatus ""`, and
  it is not `NOT_ASSIGNED`, so a runtime existed (`replayit/failed-test-cleanup-…-62-….json`).

Cause in production [V]: no `PUBLICATION_CONFLICT` transition ever requests a runtime stop.
- `GuidedPlanPublisher.conflictBeforeClaim` (:248-266, reached from :102-103) and
  `GuidedPublicationRepository.conflict` (:407-426, reached from `GuidedPlanPublisher:236-241`) set the state.
  Neither calls `GuidedSessionService.stop`.
- Every other terminal path does call it: FAILED, CANCELLED, EXPIRED, UNKNOWN_OUTCOME, and SUCCEEDED via
  `publicationCommitted:2486-2501`.
- CONFIRMED is only ever written from `PENDING` (`:2619-2621`).
- The H8 re-drive set includes `PUBLICATION_CONFLICT`, yet no code writes `PENDING` for it.

So a terminal publication conflict leaves its runtime without a durable stop request. [I] The runtime probably
dies later through refused lease renewals (`active()` → 409).
- Not fixed, because the fix needs a lifecycle decision:
  - a hook like `publicationCommitted`, inside the conflict transaction, in two packages;
  - the stop `reason`, since `stop()` maps non-CANCELLED/EXPIRED states to `UNKNOWN_OUTCOME`.

  That is an Aria/L1-class change, not a narrow fix.
- The oracle stays as is. The QA-acked shared guard says "everything else must reach CONFIRMED".
- [I] Cascade risk: `cleanupUnconfirmed` (PER_CLASS) blocks the bodies that follow. B3B-1 runs last (#62) in
  `guidedIncrementalTest`, so nothing was blocked in this run.

## 3. Coordinator-requested ack03 tightenings (test-only)
- **(a) D4(c) counter.** `OWNED_OBSERVER_SKIPPED_TERMINATED` is incremented exactly where the skip happens; the set
  of recorded failures is unchanged. It is reported as `observerSkippedTerminated` in the value-free
  `owned-worker-cleanup.json`. Diff: `replayit-w5-observer-counter.diff`.
  - Observed [V]: **incr01 = 2**, test01 = 0. So the race does fire.
  - Both runs: `cleanupFailureCount 0`, 0 alive (`replayit/owned-worker-cleanup-*.json`).
  - incr01 recorded 4555 events / 3,182,128 bytes, under the 16,384 / 8,388,608 bound.
- **(b) L1 case 1.** `isEqualTo(assignment + "|UNKNOWN_OUTCOME")` replaces `startsWith(assignment + "|")`.
- **(c) L1 case 3.** The non-terminal pre-check now lists all six terminal states, adding `SUCCEEDED` and
  `PUBLICATION_CONFLICT`.
- TFIT diff: `tfit-w5.diff`, `beb28ec4…` → `25079c12…`.

## 4. Aria ledger-56 evidence (`aria-ledger56-ruling01`), applied after the last ReplayIT run
All ruling inputs that I touch or rely on matched before editing [V]: fixtures `86e42679…`, checker `685d9227…`,
MigrationIT `eccc5731…`, V21 `b012dddd…`, `check-pins` `00d76f06…`.

- **E1.** I added two `incrementalContracts.resultCases` rows, inserted between row 7 and the old row 8, both
  expecting `RESULT_SWITCH`:
  - `boundary-result-cannot-carry-drift-switch`: a copy of the BOUNDARY row, plus `driftSwitchStepId …0003`;
  - `empty-prefix-result-cannot-carry-drift-switch`: a copy of the EMPTY_PREFIX row, plus `…0001`.

  Details:
  - Both rows have `receipt: null`.
  - The serializer round-trip is byte-identical (indent 2, non-ASCII kept), so the diff is additions only
    (`e1-publication-fixtures.diff`).
  - `publication-fixtures.json` went from `86e42679…` to `a7c9f595…`. **The runner checkpoints that quote the
    old hash need re-anchoring** (ruling §4).
  - `node tools/check-studio-observed-contracts.cjs`: exit 0 both before and after. "PASS incremental" went from
    **138 to 140**; every other line is identical, including codegen "four byte-identical outputs"
    (`e1-checker-{before,after}.log`).
  - Runner tests that import the fixture (8 files): **634/634** with `--coverage.enabled=false`
    (`e1-runner-vitest-nocov.log`). The coverage-gated subset run exits 1 on thresholds only, not on tests
    (`e1-runner-vitest.log`).
  - No schema or generator change.
- **E2.** In `publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys`, I added the ruling's `driftOnBoundary`
  row verbatim after `wrong`. It expects "publication relearned boundary differs" via `hasMessageContaining`.
  - MigrationIT went from `eccc5731…` to `0e37ff85…` (`e2-migration-it.diff`); there are still 55 `@Test` methods.
  - Run `w5-w01-e2-migration01`: **55/55**, and the target method PASS.
- E3 (B1D-02): untouched, as ruled.

## 5. Runs (collector `run-backend-tasked.py`, `--no-daemon`, fresh labels; dist `060d9a53…` stable in all)

| Label | Selection | Result | Source digest |
|---|---|---|---|
| `w5-w01-targets01` | B3B-3 + B3B-1 methods | 1/2 (B3B-3 PASS; B3B-1 fails at gen-2 teardown, §2) | `92911d0e…` |
| `w5-w01-tfit-bridge01` | TFIT + StopKeyTest + BridgeIntegration + BridgePlannedIT | **60/60** | `6c7db14b…` |
| `w5-w01-full-test01` | `test` ReplayIT + AuthorityIT | **73/73** (same set as w3 test01; B2A-02 PASS) | `6c7db14b…` |
| `w5-w01-full-incr01` | full `guidedIncrementalTest` | **61/62**. Only B3B-1 fails (§2). vs w4-incr02: B3B-3 FAIL→PASS; nothing regressed; `append-input` PASS | `6c7db14b…` |
| `w5-w01-e2-migration01` | `GuidedReplayingPrefixMigrationIT` | **55/55** | `dbeff8eb…` (after E1/E2) |

- The ack03 open condition (L1 `test`-lane B2A-02 + `append-input`) has now been run: B2A-02
  `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` passed in test01, and `append-input` passed in incr01.
- **Disclosure.** The test01, incr01 and tfit runs predate E1/E2, which changed `publication-fixtures.json` and
  MigrationIT; neither is read by ReplayIT, AuthorityIT or TFIT [I via grep]. E1 is covered by the checker +
  vitest, E2 by the migration run.

## 6. Not done
- No fix for the §2 `PUBLICATION_CONFLICT` no-stop finding. It is routed to @architect (Aria).
- Spotless, Checkstyle, SpotBugs and `./gradlew check` were not run. My added Java lines are ≤ 120 columns except
  the E2 row. That row is the ruling's verbatim one-liner, in a file whose style is long one-liners.
- CodeRabbit (WSL-only), `npm lint/typecheck` and SYNAPSE diagnostics were not run. There was no frontend change.
- QA acks needed:
  - the §1 edge selection plus its new preconditions;
  - the §2 kind-aware substitute value (fixture bytes);
  - the §3 tightenings;
  - E1/E2 for ledger 56.
- PID 22246 was never signalled; it is absent from the process table.
