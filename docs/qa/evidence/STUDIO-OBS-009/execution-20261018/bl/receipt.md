# STUDIO-OBS-009 W2 lane BL: receipt

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No migration, no dist rebuild, no OpenAPI change, no new vocabulary.
- **Inputs read first:** `w2-brief.md`; `lanes.json` `w0Refold20261017` lane BL; story AC-11 LIFECYCLE-REASON-01 (LR a-c) and D5 e; `t0-rulings/ruling.md` §4 (LR: **no tolerance**); `w1.5/ruling-part1.md` §2.1 (the D5 ruling that read this path).
- **Legend:** [V] verified by running or reading; [I] inference, not run.
- **Verdict: GREEN.** EDGE is not built: it was "not requested (optional, ruling-15s-edge §4 item 3)" at T0-QA, and the D5 (iv) ruling did not change how the backend handles an uncertain `stop` (`d5-e-backend-stop-record.md` §4), so the condition for @qa to revisit it did not arise [I].

## 1. What changed

| AC | Change | IDS |
|---|---|---|
| **LR a** | `GuidedSessionService.lifecycle` (the owning worker's context lifecycle callback): the stop state is `UNKNOWN_OUTCOME` if any action is `DISPATCHING`, else `EXPIRED` when `reason` is `EXPIRED`, else `FAILED`. Exactly `assignmentLifecycle`'s mapping, with the same precedence. A comment cites the T0 "no tolerance" ruling. | ADAPT `assignmentLifecycle` (`:1815`) |
| **LR b** | Nothing else moved: the owning-worker identity, the fence, `materialization.verifyLifecycle` (L1), the refusal past the lease (`STALE_FENCE`), and the reaper. No new vocabulary, no wire, schema or OpenAPI change. | n/a |
| **LR c** | New `GuidedLifecycleReasonIT` (below). | CREATE (the existing hand-built `LEASE_LOST` ITs are protected, so a sibling class; the fixture is ADAPTED from `GuidedSessionIT`) |
| **D5 e** | `d5-e-backend-stop-record.md`, read-only, with `file:line` anchors. Nothing is unsafe; two availability observations go to @architect. | n/a |

## 2. Files written (sha256 before and after)

| File (under `backend/src/`) | before | after |
|---|---|---|
| `main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (lifecycle only) | `a8ddea755687e10bcfe7a23a5240614954a300356a65348e8b77a8bad15541cf` | `cad1efa342710c084c241b746538b9189c41416eacfa5cac2fb1b4726f0b4be5` |
| `test/java/com/citi/put/checks/studio/guided/session/GuidedLifecycleReasonIT.java` (new, 500 lines) | none | `8e5e4473c54e3884008ca63a3c87888ba6dcca514b5165f9dc40f8f20991613b` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/bl/d5-e-backend-stop-record.md` | none | (this folder) |

[V] the `after` bytes are the ones the credited run `obs009-b-04` saw, and the mutation run restored `GuidedSessionService.java` to this sha. `GuidedRunnerContextRefusalTest.java` (EDGE) is not touched. Both Java files are google-java-format 1.22.0 clean [V].

## 3. `GuidedLifecycleReasonIT` (5 cases; LR c)

Real PostgreSQL 15 (Testcontainers) with one fresh database per case; the real `GuidedSessionService`, `GuidedMaterializationService`, `GuidedAssignmentStore` and governed policy; the secret audit is a Mockito double so the terminal state it is handed can be read.

1. **`anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired`** (red before the fix): the response state, the persisted state and the document handed to `guidedTerminal` are all `EXPIRED`; a later `observe` answers `EXPIRED` (not `PUBLICATION_CONFLICT`); the durable stop request carries `reason EXPIRED`.
2. **`everyOtherReasonStillEndsFailed`**: `LEASE_LOST`, `CANCELLED`, `UNKNOWN_OUTCOME`, `CONTEXT_LOST`, `REVOKED` each end `FAILED` with stop reason `UNKNOWN_OUTCOME` (as before); every `guidedTerminal` call saw `FAILED`.
3. **`aDispatchingActionStillEndsUnknownOutcomeWhateverTheReason`**: with an action left `DISPATCHING` (a real observe, admit and consume), `EXPIRED` and `LEASE_LOST` both end `UNKNOWN_OUTCOME` and the action is recorded `UNKNOWN_OUTCOME`.
4. **`aCallbackPastTheLeaseIsStillRefusedStaleFenceAndNothingIsStopped`**: unchanged refusal, no terminal call.
5. **`theContextIdentityIsStillCheckedWhateverTheReason`**: a foreign `contextId` with `EXPIRED` is `STALE_FENCE`, nothing stopped.

LR c's "if the tolerance is adopted" case does not apply: the ruling adopts none.

## 4. Runs

All through the shared lock, `--no-daemon`, Node 24.20.0 on `PATH`; counts are from the collector results in `../execution/`. `dist` digest `897182d5...` before and after (no rebuild). Preflight `lsof` and Gradle listings are the lane-B ones in `../b/` (the two lanes ran back to back). The BL verify command asks for `GuidedLifecycleReasonIT`, `GuidedSessionIT` and `GuidedServiceTransportFaultIT`; I ran all three in the same final run as lane B's classes.

| Label | What | Total / passed / failed | results sha256 (first 16) |
|---|---|---|---|
| `obs009-b-red01` | **Red log**: `GuidedLifecycleReasonIT` against the unchanged `lifecycle` | class: 5 / 4 / 1 (the whole run was 79 / 66 / 13) | `5eab9e0c8b7ac162` |
| `obs009-b-02` | first green for the fix (class result in this run) | class: 5 / 5 / 0 | `48b7d69b434aa6be` |
| **`obs009-b-04`** | **Final bytes**: `GuidedLifecycleReasonIT` 5 / 5, `GuidedSessionIT` 44 / 44, `GuidedServiceTransportFaultIT` 39 / 39 (inside the run's 413 / 413) | class totals as stated | `3bb5a563cacb6dbe` |

- Red [V]: the only red case in the class was case 1, `expected: "EXPIRED" but was: "FAILED"`. Cases 2-5 are guards and were green before the fix.
- `GuidedSessionIT` and `GuidedServiceTransportFaultIT` (the hand-built `LEASE_LOST` bodies) are **unchanged and green** [V], as LR c requires.
- Wrapper exit 2 on `-04` is `sourceStable:false` only (root R3).

## 5. Mutation

LR-M: ignore `reason` again in `lifecycle` (`obs009-b-mut01`, shared run with lane B's mutations): `anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired` **red** (`expected "EXPIRED" but was "FAILED"`); the other four cases stayed green [V]. `GuidedSessionService.java` restored byte-identically (sha above).

## 6. Exit check

"EXPIRED -> EXPIRED; DISPATCHING still UNKNOWN_OUTCOME; mutation check red": all three met [V].

## 7. Findings and batons

1. **Stop-reason side effect** (for @architect, no action taken): an `EXPIRED` context lifecycle now writes `reason EXPIRED` into the durable stop request and so into the stop the runner receives, where `FAILED` wrote `UNKNOWN_OUTCOME`. This is what `assignmentLifecycle` always did, and `EXPIRED` is an existing stop reason; pinned in case 1 and case 2.
2. **D5 e:** see `d5-e-backend-stop-record.md`. Nothing unsafe; two availability observations (small silent-shedding teardown executor; nothing after the 15-minute window beyond a count).
3. **Conflict with OBS-011 AC-2 (CLN-F1):** the story says it also edits `GuidedSessionService.java`. Not in W2; one owner at a time. My edit is one statement inside `lifecycle`.
4. **Baton:** none for F-merge beyond landing `GuidedSessionService.java` and `GuidedLifecycleReasonIT.java` together. No dependence on lane B's changes (the class does not construct `GuidedSessionEvidenceService`).
