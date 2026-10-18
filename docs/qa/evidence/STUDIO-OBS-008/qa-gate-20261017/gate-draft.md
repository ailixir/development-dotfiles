# STUDIO-OBS-008 QA gate: DRAFT (Phase 1, read-only review)

- **Reviewer:** Quinn (@qa), YOLO. **Date:** 2026-10-17. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` 0.3.16, sha256 `04091be7382ae9944fa964423e83b766ba7bd8a104e153aa6946bfdbb6749798`.
- **This is not a verdict.** It is the Phase 1 review. Four slots stay **PENDING FINAL EVIDENCE** (section 3). The verdict, `gate.md`, `gate.json`, the public gate YAML and the Status flip are Phase 2.
- **Direction, stated early so root can plan:** all nine ACs and every inherited obligation trace to code, tests and evidence, and I found no blocking defect. Provided slots (a) to (d) come back green, the likely verdict is **CONCERNS** (non-blocking, tracked). The reasons are in section 8. This direction is a judgement, not a promise.
- **Labels:** **[V]** = I ran it or read the cited line/bytes myself. **[I]** = inferred, not executed.
- **ADR-SC-006 applies.** I did not fail, and did not raise CONCERNS, for any missing accessibility work in the rule's "do not plan" list. Removed items are reported as "removed by the user, 2026-10-17", never PASS, N/A or waived.

## 0. What I did and did not do

**Did (Phase 1):**
- Read the whole story and every evidence file the brief names: baseline, f1, lanes U2, L0, DE, L1-A, L1-P, L3H, L2a, L2b (+W2.0), L4, L5a, L5b (+F1/F2), L6-author, L6, U1, both tech gates, rulings (Q9, W5), T0 rulings (A1-A3), the three W5 reviews, final-gates part 1, and root's resume-state log.
- Read the production code behind each claim (backend capability service and controller, `ReplayFailure`, `RunnerReportProjection.replayFailure`, V22, mapper/entity; frontend client, gate, page, narratives, completion, hook).
- **[V]** Re-hashed all **1705** paths of `final-gates/freeze-manifest.json` against the working tree: **0 changed, 0 missing**. The real tree equals the frozen source (digest `eea9c8de…f2002`).
- **[V]** Diffed the U1 sandbox (`scratchpad/u1repo/frontend`) against the real tree: exactly **24** files differ under `src/`, none under `e2e/`, and `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json` are identical. All 24 before-hashes equal the real tree and all 24 after-hashes equal the sandbox bytes (parsed from `lanes/U1/receipt.md`).
- **[V]** Ran narrow vitest only inside the sandbox, `--minWorkers=1 --maxWorkers=2`, never `src/test/a11y`: **104/104** (secretDeclaration, authoredLiteralHint, clarification, replayFailure, runGate) and **479/479** (guided/*, studioContract, StudioScheduleDialog, pageReplayAndReferences, pageGuidedRun). **Non-evidentiary** (sandbox, shared host, Gradle running). They show the U1 receipt is reproducible.
- **[V]** Ran six mutations of my own in a throwaway copy (`scratchpad/qamut-root`), each restored and sha-checked. All six were killed (section 2.3).

**Did not:** edit any file under `frontend/`, `backend/`, `studio-runner/`, `tools/`, `docs/specs/`; run Gradle or Playwright; run `src/test/a11y`; touch `dispatch-governance.js`; signal any PID; write to git. The SYNAPSE diagnostics, `coderabbit-review` (WSL-only) and `checklist-runner` skills that were appended to the spawn prompt were not run. `[AUTO-DECISION]` the mission defines the work, no checklist was named, and WSL CodeRabbit is not available here. The independent review is this section 2 plus the dev and UX reviews in `w5-reviews/`.

## 1. Where the evidence stands

| Slice | Evidence | Status |
|---|---|---|
| Frozen source S_F (`eea9c8de…f2002`, 1705 files, dist `897182d5…df9c`) | freeze manifest; tree re-hashed by me | **[V]** equal |
| Contracts, codegen, no-write, runner type-check/lint/unit/pins on S_F | `final-gates/status.txt`: all `exit=0`. Runner unit: 2335 tests, 2306 passed, 0 failed, 29 pending (same 29 as 015), coverage lines 97.33 / branches 89.30 | **[V]** read from the receipts |
| Frontend part 1 on S_F | type-check 0; lint 0 errors / 308 warnings; build 0; Playwright 13/13; **vitest 1319/1320**, one failure | the one failure is `StudioScheduleDialog.test.tsx:73`, a synchronous `getAllByRole` that races under load; 3/3 green alone; fixed in U1 with `findAllByRole` |
| Backend F1 union gate (earlier) | `obs008-f1-be01` 656/656, 34 classes, 0 skipped, stable, source `a14eeb78…` | **[V]** receipt. Not the final proof. |
| Non-frontend inputs between F1-after and the freeze | `backend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/` subset digests and dist digest | **[V]** equal (I recomputed them from `obs008-f1-be01-after.json` and the freeze manifest; 0 non-frontend paths differ) |
| Backend final check `obs008-final-check01` | started 21:43 EDT, still running at 23:06 EDT | **PENDING** (slot a) |
| U1 (24 files) | implemented and GREEN in the sandbox; not yet in the real tree | **PENDING copy-back** (slot b) and **fe2** (slot c) |

## 2. Review findings that do not depend on pending evidence

### 2.1 AC traceability (requirement to code to tests to evidence)

Test counts are the freeze values (file counts from `fe-vitest.json`) plus the U1 deltas. "U1" means the behaviour is final only after copy-back.

| Req | Code (main files) | Tests that prove it | Evidence | Status |
|---|---|---|---|---|
| **AC-1** typed transport and MSW mirror | `services/api/studioGuidedApi.ts` (all calls through `apiClient`; `keyed()` refuses a key outside 1..256 before any request), `studioApi.ts` (`getCapabilities`, `executeTest`), `types/studio/studioGuidedTypes.ts`, `mocks/studio/{guidedHandlers,guidedFixtures,capabilityHandlers,secretsHandlers,handlers}.ts` | `studioGuidedApi.test.ts` 21; `guidedHandlers.test.ts` 56 (every body validates against the v3 schemas); `useGuidedSession.test.ts` 43 then 49 (U1); `studioContract.test.ts` P2-P4 (class A empty) **plus U1 W5-5** (every `/guided-sessions` operation maps to a client member, 8 by D-2). The "client method" half had no test until U1 | L2b, L2a F1, tech-gate-L5b, Dex W5 sec. 6 | **MET**, closed by U1. **[V]** no direct `fetch` in 008's files (only three pre-existing `fetch(` in `HttpConfig`, `TcpConfig`, `CreateCheckPage`, none in the 008 diff) |
| **D-1** keys on every keyed operation | `keyed()`; hook persists start/finalize keys, memoizes clarify/cancel keys; `useRunGate.ts:519` passes a fresh UUID to `executeTest` | `studioGuidedApi.test.ts` (refused when missing/oversized), hook tests (lost response, reload, StrictMode), Dex M8-M10 mutations | L2b, tech-gate-L5b | **MET**. `studioApi.executeTest(id, key?)` still lets a caller omit the key (Dex W5-8, low, not taken) |
| **AC-2** one Run, three modes, no hidden execution | `run/{runEnablement,useRunGate,RunControl}`, hook, page | `runGate.test.tsx` 33 then 36; `pageGuidedRun.test.tsx` 34 then 41; `pageReplayAndReferences.test.tsx` 10 then 12; E2E first Run, replay, mixed mode (13/13 on S_F) | L5b, tech-gate-L5b, L6 sec. 10 | **MET**. D-3 body, D-4, D-11, `LEARNING`, auto-finalize, pending/not-ready, reconnect without double submit are all covered. U1 changes W5-1/W5-11/UX-13/UX-16 |
| **AC-3** states and copy | `guided/{GuidedRunStatus,GuidedClarification,GuidedCompletion,ReadinessChip,guidedNarratives}` | `guided.test.tsx` 218 then 240 (**copy table**: each of 71 then 78 strings has a quoted source, verbatim/adapted/delegated basis and a quoted fact); `clarification.test.tsx` 15 then 16; A3 x3 plus deferred-focus x2 in `pageGuidedRun.test.tsx` | L5a, L5b, U1 | **MET**. Struck secret-fill copy is absent from source and asserted absent in 5 test files |
| **AC-4** blocked by login, both variants and replay | `LoginRequiredNotice.tsx` (one adapter `loginNoticeFrom`), `executionErrorNarratives.ts` `replayFailureNarrative` | `loginRequired.test.tsx` 15; `replayFailure.test.tsx` 14 then 15 (the 7 A1.6 cases, incl. the no-text-parsing negative control); E2E x2 variants | L5a, L5b, L1-A | **MET** |
| **AC-5** references, secrets, capability | backend `StudioSecretsCapabilityController` + `StudioCapabilitiesService`; `utils/config/studioCapabilities.ts`; `references/*`; `SecretInput.tsx`; `UiTestConfig.tsx`; `OnboardingCoach.tsx`; `secretDeclaration.ts` | `referencePicker.test.tsx` 40; `SecretInput.test.tsx` 34 (4096 accepted, 4097 refused); `secretDeclaration.test.ts` 7 then 10; never-echo canaries at picker, SecretInput, MSW, clarification/result/explanation and the P6 pointer; backend `StudioCapabilitiesIT` 7 | L1-P, L4, L5a, L5b | **MET** with REQ-001 (D-8 mirror residue) |
| **AC-6** plan explanation, honest evidence | `PlanExplanation.tsx`; backend `GuidedPublicPresentationProjector` (fail-closed, sec. 2.2) | `planExplanation.test.tsx` 9; `GuidedPublicPresentationIT` 13 (incl. receipt-after-expiry, conflict never borrows head, planted-secret canary) | L5a, L1-P | **MET** |
| **AC-7** video and seek | `evidence/{VideoEvidencePanel,GuidedSeekControls,guidedSeekTargets}`, `studioGuidedApi.videoPath`, video mirror route | `guidedEvidence.test.tsx` 15; `stepSeek.test.tsx` 11 (replay label "Seek to step N"); backend `GuidedSessionVideoIT` 9 | L5a, L5b F1.2 | **MET**. No stamp, no button; `prefixReplay`/`clarificationWait` never seek |
| **AC-8** narrow layout + audit as a guard | MUI `sx` mobile-first | narrow describes in guided/clarification/loginRequired/guidedEvidence tests; page 375x812 case; E2E 375x812; `studioWcagAudit.test.tsx` 7/7 on S_F, no key regenerated | L5a, L5b, L6 sec. 10.1 | **MET** for a and b. c items kept. Items X1-X11 removed by the user; not credited |
| **AC-9** tests and first E2E | `playwright.config.ts`, `e2e/*` | every AC-9 flow maps one to one to a test title (L5b receipt sec. 4, Dex W5 sec. 6); Playwright 13/13 on S_F | L3H, L6-author, L6 | **MET**, MSW basis only. D5 (2/2, local real backend, honest CORS allow-list) is non-gating and **not** live integration (OBS-009) |
| **A1 + V22** `replayFailure` | contract `ReplayFailure`; backend `dto/ReplayFailure` (constructor enforces if/then/else), `RunnerReportProjection.replayFailure` (FINAL only, exact equality, login naming a missing step is `400 INVALID_REPORT`), `applyFinal` same UPDATE, entity `insertable=false, updatable=false`, mapper refuses corrupt storage; `V22__execution_replay_failure.sql` | `RunnerReportProjectionTest` 43 (+15), `ProgressCallbackIT`, `SseStreamingIT`, `ExecutionSnapshotMapperTest` 14, `ExecutionReplayFailureMigrationIT` 9, `StudioContractTest` 14; frontend enum parity, negative fixture, 7 A1.6 cases | L0, DE, L1-A, L2a, F1 closure | **MET** on the F1 gate. **[V]** I read V22 and the derivation. Final proof is slot (a) |
| **A2** secret-fill copy not renderable | absent from `guidedNarratives.ts` | negative assertions in 5 files; `INVALID_CONTRACT` gets the generic narrative | L4, L5a, L5b | **MET** (record as unreachable in the Dev Agent Record, root) |
| **A3** "None of these" cancels, then focuses | page `noneOfThese` | 3 A3 cases + 2 deferred-focus cases; Dex M2, M7 | L5b, tech-gate-L5b | **MET** |
| **U2** npm to pnpm | `frontend/pnpm-lock.yaml`, `@playwright/test` `1.63.0` exact, `.npmrc node-linker=hoisted` (deviation D1, reason recorded), docs and `dev.sh` | `realStudioStartup.test.ts`; both dev servers answered 200; **[V]** `package-lock.json` absent, one lockfile | U2, L3H | **MET**. CI re-check finding: no `.github/workflows/` exists (a finding, not a pass) |
| **Inherited: v2 authoring a-g3** | `studioAuthoringTransport.ts`, `studioAuthoringValidation.ts`, `authoringHandlers/State`, `CreateTestDialog`, page | `pageAuthoringUx.test.tsx` item a x3 (IDs survive edit/reorder; insert/copy mint), `authoringHandlers.test.ts` 16, `studioContract.test.ts` g2 x4 | L2a | **MET**. **[V]** M12: 0 hits for the removed symbols; `grep -i legacy` leaves 33 ALLOWED rows; two shared fixture cases deleted (6 valid + 8 invalid remain) |
| **Inherited: 014 governed refusals a-d** | `guidedNarratives` governed `POLICY_DENIED` rows; `GuidedClarification` confirmation view | page `inherited OBS-014 a/b` tests | L5a, L5b | **MET** (item e not placed here, as the story says) |
| **Inherited: `POLICY_NOT_APPROVED` a-c** | `GuidedStartFeedback` | 3 message codes; no session, poll or finalize follows | L5a, L5b | **MET** |
| **F4 note for R4** | `docs/architecture/studio-inference-contract-v1.md:126` | n/a (documentation) | L0 | **MET**. **[V]** present, sha256 `5ff06f4a…`; Aria confirmed (`w1-confirmations`) |
| **KL-015-Q4 a** (trigger record) | n/a | n/a | L5b F1.1: AUTHORED-ECHO-01 not landed (009 0.3.20 A10, U13 "not requested") | **MET in evidence.** Root must carry it into the Dev Agent Record (still the start paragraph) |
| **KL-015-Q4 b** (copy) | `authoredLiteralTargetNotFound` | copy-table rows | L5a row 34; U1 hedge (UX-03) | **MET.** No secret claim, no page text. Key name kept for AE-01 f |
| **KL-015-Q4 c** (no contract change; Q9 four-part rule) | `pages/ChecksStudioPage/authoredLiteralHint.ts`; U1 `authoredLiteralHintStep` returns N | `authoredLiteralHint.test.ts` 26 then 27 (P1-P3, C1-C3); page G1-G3; 4 earlier page tests; Dex M11 | Q9 ruling, tech-gate-L5b | **MET.** Needs the (c) choice note and R1-R4 in the Dev Agent Record (root). R1-R4 are placed in 009 AE-01 **[V]** (009 0.3.21) |
| **KL-015-Q4 d** (tests, copy key named) | as above | G1 literal step shows hint; G2 `Click "Sign On"` no hint; G3 `RUNTIME_INCOMPATIBLE` no hint | tech-gate-L5b | **MET** |

### 2.2 NFR, security and contract review

| Area | What I checked | Result |
|---|---|---|
| Contract parity | **[V]** `openapi.yaml` sha256 `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`. `StudioContractTest.BASE_SHA256` (`:90-91`) and `confinement.test.ts:294` both equal it, each with the old/new digest chain quoted. ADR-002 section 13 carries the three class C rows. Checker 7/7 sections (44 schemas, 481 checks, 44 operations, 40 examples); generator `--check` green; no-write proof green | OK |
| Secret handling | D-8: `toContractVariables` drops a secret row without a non-empty `secretId` (read at `ChecksStudioPage.tsx:141-152`); picker writes the Vault name; `declareInsertedSecret` (U1) refuses rather than aliasing. Value bound 4096 equal in openapi `:4429`, backend `StudioSecretsService.MAX_VALUE_LENGTH`, `SecretInput.tsx`, `secretsHandlers.ts`, runbook; `grep 8192 frontend/src` = 0. `SecretInput` is `type=password`, `autoComplete="new-password"`, cleared on success and failure. Create answer is projected to `{name, version, allowedOrigins}`. No `console.*` in any new non-test file **[V]** | OK. The mirror residue is REQ-001 |
| No secret logging | Canaries cover console (debug log on, and the test proves the request log ran), storage, DOM, accessible names, callbacks and MSW response bodies. Backend capability/projector files have no logger calls **[V]**. `diagnostic()` unchanged | OK |
| Idempotency-Key | see D-1 above | OK; W5-8 low |
| Fail-closed paths | **[V]** capability: any non-200 or malformed body is `unavailable`, `__doNotRetry`; `vaultSecrets` never grants write; absent test and denied CSI are the same 403; no Vault call. Projector: non-decimal revision, non-UUID step id or more than 100 steps is `INVALID_CONTRACT` 422; `withoutFacts` is `RUNTIME_INCOMPATIBLE` 409. Mapper refuses a corrupt replay-failure row. Hook: a 401 on finalize stops polling (Dex fixed a request storm), blocked `sessionStorage` falls back to memory so finalize still runs. Start 422 `AUTHORING_REFERENCE_AMBIGUOUS` falls to the undeclared view with the code shown, not a success claim **[V]** | OK |
| `replayFailure` precedence | **[V]** `replayFailureNarrative` selects before `status`/`errorCode`; `learnAgainOffered` needs `READY`, `snapshot.revisionId === confirmedRevisionId` and the step in the draft; the gate re-checks all three on a fresh read; nothing is read from `stepResults[].message`, logs or status (negative control test) | OK |
| V22 | **[V]** four nullable columns, one CHECK admitting exactly three shapes with `IS NOT NULL` guards, `NOT VALID` then `VALIDATE`, no trigger, no backfill, forward-only, V1-V21 untouched. Partition inheritance and lock analysis are Dara's, tested in `ExecutionReplayFailureMigrationIT` (9). The `VALIDATE` scan holds ACCESS EXCLUSIVE for one heap scan of execution history: **[I]** unmeasured at production size, pre-release, noted only | OK |
| Class B/C allowlist | **[V]** `UNCOVERED_PUBLIC_OPERATIONS` = class B `streamExecution` + class C five policy operations; class A empty; `getStudioTestCapabilities` is covered by a real handler and was never allowlisted | OK |
| ADR-SC-006 | **[V]** no new `aria-live`, `aria-current`, reduced-motion, keyboard shortcut or a11y test in 008's files. The `role="status"/"alert"` hits in `RunControl`/`ExecutionProgressView`/page are in HEAD | OK (nothing added) |
| Backend test coupling to the story file | **[V]** `ExecutionVideoContractTest` reads `docs/stories/**` and checks only that a story file's **first line** is `# Story {ID} `. `getStudioTestCapabilities` carries `x-implemented-by: STUDIO-OBS-008`, so that first line must stay intact when the story is edited | I will keep line 1 byte-identical |

### 2.3 Can each test fail? (spot checks)

- **Red-first logs (U1):** 8 test files (10 logs, including two reruns) recorded red on the **frozen** bytes before any source edit, with failure reasons that match the spec (for example `secretDeclaration` 10/10 on the return-type change; `pageGuidedRun` 13 failed of 41; `runGate` 7 of 36; `guided.test` 9 of 223). Two harness slips were found by reading the failures and re-run; both reruns are kept.
- **U1 mutation record (Dex, `lanes/U1/receipt.md` sec. 4):** 20 mutants, 15 killed, 5 survived. The survivors are `M-J1` (a 403 marking unreadable: equivalent, because the pointer is forgotten in the same tick), `M-J2` and `M-J3` (`MF3` and `MF4` alone: each masked by the other guard, and killed together by H5), and `M-L1` and `M-L2` (two T6 guard terms masking each other; `M-L3` kills all three together). I accept these as equivalent or masked **[I]** (reasoned from the code, not re-run).
- **My own mutations, all killed [V]:** (1) drop the name-taken refusal in `declareInsertedSecret`: 7 of 10 fail; (2) revert W5-1 so `sessionUnreadable` blocks a `READY` replay: `runGate (p)` fails; (3) drop the unknown-outcome consequence line: its test fails; (4) remove the silent-no-op fix for a failed learn-again: `(j)` and `(j2)` fail; (5) ignore the `FAILED` outcome gate in the hint rule: 3 fail; (6) drop the code from the `RUNTIME_INCOMPATIBLE` feedback: its test fails. Every mutated file was restored and sha-checked.
- **Earlier lane mutations (Dex/L4/L1-P):** M1-M11 on the page and hook, F-L4-2, the three L1-P presentation mutations, 6 L2b mutations. Read, not re-run.

### 2.4 Review of the U1 source diff (no other reviewer saw it)

U1 had a spec (Uma) and a ruling (Aria) but **no independent technical gate**. I read the full diff of the 13 source files against the frozen bytes. **[V]** Every change matches `U1-spec.md` and `w5-unreadable-and-alias.md`:
- W5-1: the page re-reads `GET /tests/{id}` once per unreadable transition or Refresh press, with three stale-answer guards, and drops the pointer only on `UNLEARNED`/`NEEDS_RELEARN`. It never calls `replaceScenario`. `runnable` ignores `unreadable` only in replay mode. The learn request token is consumed while unreadable, so nothing fires later by itself.
- W5-2: `declareInsertedSecret` returns `{ok, rows} | {ok:false}` with no alias; the page inserts nothing on refusal and renders `secretNameTaken`.
- UX-01/03/04/05/06/07/09/12/13/16 and UX-02 (tab switch only) are as specified. The RUNTIME_INCOMPATIBLE view no longer says "Save the test again".
- W5-4 removes `RUN_ACTION`/`runActionFor`/`gate.action`; W5-5 adds the client-method test; the schedule-dialog race is fixed.
- `useGuidedSession.ts` is comments only; the sentence the copy table quotes (line 45) is byte-identical.
Residual risk in U1 [I]: none found by reading. It is covered by the sandbox runs above and will be covered by slot (c) in the real tree.

## 3. PENDING FINAL EVIDENCE (slots)

Each slot lists the exact acceptance condition and how I will verify the receipt myself. Expected values marked [I] are my predictions from the F1 gate and the 015 baseline.

### (a) Backend final check `obs008-final-check01`: PENDING FINAL EVIDENCE

Command (from `w5-backend.sh`): `check --rerun-tasks` with `test`, `guidedIncrementalTest` and `crossReplicaTest`, under the lock, Node 24, skips file `approved-historical-skips.json`.

| Item | Accept when | Filled in Phase 2 |
|---|---|---|
| Gradle exit and collector exit | both 0 | _PENDING_ |
| Counts | **[I] predicted 2531 total / 2506 passed / 0 failed / 0 errors / 25 skipped.** Basis: the 015 binding run (attempt06) had 2476 / 2451 / 0 / 0 / 25; I diffed its `(task, class, name)` multiset against the 34 classes of `obs008-f1-be01` and found **0 names removed and 55 added** (RunnerReportProjectionTest +15, GuidedPublicPresentationIT +13, ExecutionReplayFailureMigrationIT +9, StudioCapabilitiesIT +7, ProgressCallbackIT +6, ExecutionSnapshotMapperTest +4, SseStreamingIT +1). I will redo this multiset diff on the final results: any removed name must be justified, and the totals must reconcile | _PENDING_ |
| Skips | the 25 skipped cases equal the approved multiset exactly (the file's sha256 is `5a0755a4…`, copied from 015 attempt06 with a provenance note); no other skip | _PENDING_ |
| JaCoCo | `jacocoTestReport` and `jacocoTestCoverageVerification` executed and passed: bundle at least 0.70, dispatch/internal/recovery/sse at least 0.75 (`build.gradle.kts:421-500`; 015 actuals 0.9086 / 0.862 / 0.9093 / 0.8889 / 0.918). I will read the ratios from the report, not only the exit code | _PENDING_ |
| Other `check` parts | checkstyle, spotbugs, spotless, `requireFreshGuidedPartitions` ran and passed | _PENDING_ |
| Stability | `sourceStable`, `distStable`, `testInputStable` all true; collector `-before` digest is `eea9c8de…f2002` / dist `897182d5…df9c` (**[V]** the before manifest already matches) and `-after` equals it | _PENDING_ |
| Process hygiene | PIDs 22246, 44737, 13577, 13581 never signalled; no leftover Gradle/worker of the run | _PENDING_ |

### (b) U1 copy-back diff: PENDING FINAL EVIDENCE

| Item | Accept when | Filled in Phase 2 |
|---|---|---|
| Changed set | `u1-copyback-diff.json`: `changed` is exactly the 24 paths (each under `frontend/src/`), `unexpected` is `[]`, `missing` is `[]` | _PENDING_ |
| File hashes | I hash the 24 real files myself; each equals the "after" column of `lanes/U1/receipt.md` section 1 (**[V]** the sandbox already equals it) | _PENDING_ |
| Carry-forward equality | `subsetEqual` true for `backend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`; `distEqual` true; I recompute from the manifests. **Stronger than the script:** also compare against the backend check's own `-after.json` and `capture-after.json`, not only the freeze, so a change during the 100-minute run cannot hide | _PENDING_ |
| Timing | the copy-back happened after the collector exited **and** after `BACKEND-DONE` was written to `status.txt` (the script waits only for the collector process; `capture-after` runs a few seconds later) | _PENDING_ |
| No other drift | every other manifest path equals the freeze (V9) | _PENDING_ |

### (c) fe2 rerun gates on the final frontend: PENDING FINAL EVIDENCE

| Gate | Accept when | Filled in Phase 2 |
|---|---|---|
| `pnpm run type-check` | exit 0 | _PENDING_ |
| `pnpm run lint` | exit 0, **0 errors**, warnings not above 308 (U1 reported 308; baseline before 008 was 302) | _PENDING_ |
| Full `vitest` (a11y included) | exit 0; **[V]** the freeze run had 70 files / 1320 tests; by the U1 per-file deltas (+47) I predict **70 files / 1367 tests, 0 failed, 0 skipped** [I]. `studioWcagAudit` 7/7, no baseline key regenerated; `axe-results.json` before/after hashes recorded (selector churn is explained, a count change is not) | _PENDING_ |
| `pnpm run build` | exit 0; the only warning is asset size, as in the freeze | _PENDING_ |
| `pnpm run test:e2e` | 13/13 (5 harness + 8 guided), project `msw` | _PENDING_ |
| Environment | frontend Node v23.10.0, pnpm; no `src/test/a11y` run elsewhere in the meantime | _PENDING_ |

### (d) `capture-final`: PENDING FINAL EVIDENCE

| Item | Accept when | Filled in Phase 2 |
|---|---|---|
| Digests | `capture-final.json` has 1705 files; source digest differs from the freeze **only** in the 24 frontend files; dist digest `897182d5…df9c` | _PENDING_ |
| Story and evidence | the story file is unchanged by anyone until I edit it; sha256 recorded before my edit | _PENDING_ |

## 4. Review of root's process decisions

| Decision | My view |
|---|---|
| **R1: lane runs are non-evidentiary** | **Sound.** A run taken while other lanes edit proves nothing about one tree. The binding proofs were taken in hold windows: F1 (`a14eeb78…`, stable) and the W5 gates on the frozen S_F. **[V]** I confirmed the non-frontend inputs did not move between F1-after and the freeze, so F1 and the final check cover the same backend and runner bytes. One caveat: F1 ran before W3/W4 changed `frontend/`, so it is not evidence about the final frontend, and nobody claims it is |
| **DV-1** (two lanes use the label) | L4 DV-1: `UiTestConfig.test.tsx` rewritten because the old test mocked the whole capability module; **accepted** into L4's write set, and it is the companion test of an owned file. L5b DV-1: the stand-in `PRODUCTION_ALPHA_TEMPLATES` and its one test deleted in files outside L5b's write set; **ratified** by root after L4 exited. Pure deletions (L5b reconstructed the before-hashes and they equal L4's after-hashes). **Sound**; both recorded with hashes |
| **CORS honest allow-list** | **Sound.** The first D5 passes used a Vite `Origin` rewrite that would have hidden a real CORS refusal; root reverted it and D5 ran with `CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177`, a legitimate deployment setting that replaces the default list. The earlier passes were declared void. D5 stays non-gating and is reported as "local real-backend authoring smoke, not OBS-009" |
| **Sandbox method for U1** | **Sound, with controls.** Reason: the backend collector hashes `frontend/`, so editing it mid-run would have voided `sourceStable`. I verified: the sandbox symlinks everything but `frontend/src` to the real tree; before-hashes of the 24 files equal the real tree (24/24); after-hashes equal the receipt (24/24); my 583 sandbox test results reproduce the receipt. Residual risk is path- or environment-sensitive behaviour that passes in the sandbox and not in the real tree. Slot (c) is the control for that. The U1 diff had no independent technical gate, so I read it (section 2.4) |
| **Backend carry-forward after U1** | **Sound in principle, and I checked the premise.** **[V]** Backend Gradle and tests read nothing from `frontend/`; the only docs they read are `docs/specs/**` (in the digest), `docs/qa/evidence/STUDIO-OBS-015/final-design/**` (unchanged) and the first line of `docs/stories/**` story files (kept intact). Two refinements for Phase 2: compare with the backend check's own after-manifest, and wait for `BACKEND-DONE`, not just the collector process (slot b) |

## 5. Carried-forward register (authoritative list; none is dropped)

The U1 spec and root's resume log hold these, but only items 1, 2, 12 and 13 sit in a @po-owned record. **Items 3 to 11 are not yet placed.** This table is the QA record of them until @po places them; the final gate will repeat it.

| # | Item | Owner and target | Placed? |
|---|---|---|---|
| 1 | C-OBS008-1: with publication disabled a non-terminal `/result` answers 202 with a bare `PublicSession` | @dev, STUDIO-OBS-011 | **[V]** yes, 011 0.2.11 inbound table. **[V]** code untouched (`GuidedSessionService.java:759-763`) |
| 2 | C-OBS008-2: stale Javadoc on `MAX_VALUE_LENGTH` | @dev, 011 (optional) | **[V]** yes. **[V]** untouched (`StudioSecretsService.java:56-60`) |
| 3 | **C-OBS008-3 (proposed):** W5-6, `guidedNarratives.ts` ships `basis/source/note/facts` (internal doc paths and quotes) in the production bundle | @dev, 011 | **No.** Proposed by U1 spec sec. 7.2 |
| 4 | **C-OBS008-4 (proposed):** the backend refuses an ambiguous declaration set at start with `422 INVALID_CONTRACT / AUTHORING_REFERENCE_AMBIGUOUS`; `openapi.yaml` declares no 422 for `startGuidedSession`; the Variables dialog can still save such a set by hand | contract owner (009 C9 lane) or backend; then the start mirror | **No** |
| 5 | **C-OBS008-5 (proposed):** `handlers.ts:177` `variable.secretId ?? variable.name`; D-8 text says the mirror drops it. Also **[V]** the authoring mirror stores `variables` without checking that a `secretRef` has a `secretId` | 011 cleanup, or the next time `handlers.ts` opens | **No** |
| 6 | Nine whole post-GA copy-pass Lows: UX-08, UX-10, UX-11, UX-14, UX-17, UX-18, UX-19, UX-20, UX-21 | @ux-design-expert, post-GA copy pass (UX-21 needs @dev) | **No.** Ready wording is in U1 spec sec. 7.1 |
| 7 | Three partial carries: UX-09 prefix form "1–1" (pinned by `e2e/studio-guided.spec.ts:63,201,459`), UX-13 "that step" wording on a full learn, UX-02 optional "question waiting" cue | same | **No** |
| 8 | UX-22 record-only (two unrecorded page variants) | recorded in U1 spec sec. 2 | recorded there; the copy table does not list them |
| 9 | Dex items not taken: W5-7 (commit set), W5-8 (`executeTest` key optional), W5-9 (4096 parity line), W5-10, W5-12 (alias row id; now moot), W5-13 (Dev Agent Record content) | W5-7 @devops, W5-13 root, rest @dev | **No** (W5-12 is moot after U1) |
| 10 | Tech-gate leftovers: F-L5a-4 (a clarification whose step does not match renders nothing; Stop still works), F-L5b-7 M6 (defensive term) | @dev | **No** |
| 11 | **R5 / OBS-1, user decision pending:** after "None of these" or a declined confirmation, the reused `CANCELLED` narrative says "Someone pressed Stop", which is untrue on that path. The user descoped a user-initiated wording on 2026-10-17, so I do not treat this as a defect of 008, but the user has not seen this consequence decided | the user | resume log "user batch" only |
| 12 | R1-R4 residuals of the Q9 trigger | 009 AUTHORED-ECHO-01 | **[V]** yes, 009 0.3.21 |
| 13 | FE-A11Y, PLAYBACK-COST, PLAYBACK-COPY (descoped by the user); CLN-50/CLN-51 doc entries | README backlog F05-F07; 011 inventory | **[V]** yes |

## 6. Provisional quality checks (`story-lifecycle.md`)

| # | Check | Provisional | Depends on |
|---|---|---|---|
| 1 | Code review | OK. No blocking finding; low items in section 7 | none |
| 2 | Unit tests | OK on the freeze (frontend 1319/1320 with a known race; runner 2306/0; backend F1 656/656). Final proof | slots a, c |
| 3 | Acceptance criteria | OK, section 2.1 | slot c for U1 behaviour |
| 4 | No regressions | OK on S_F. Needs U1 not to regress | slots a, b, c |
| 5 | Performance | No measurement regressions known. Frontend adds no runtime dependency. The 3.9 MiB webpack chunks in `fe-build.log` are an existing warning **[I]** (no baseline build output to compare) | none |
| 6 | Security | OK. Open low: UX-21 (role/region of a page-derived label are not in the untrusted box) and W5-6 (internal paths in the bundle) | none |
| 7 | Documentation | Partly open and root's: Dev Agent Record, task checkboxes, File List, the carried register above. Docs updated: CLAUDE.md, AGENTS.md, README, frontend README, ARCH, `.cursor`, `dev.sh`, ADR-002, runbooks, F4 note | root |

## 7. Findings (draft issue list)

| ID | Sev | Finding | Suggested action |
|---|---|---|---|
| DOC-001 | medium | Carried items 3 to 11 exist only in U1 spec and resume log; nothing @po owns lists them. They are tracked but unplaced | root asks @po to place them (README backlog row for the copy pass; 011 inbound table for C-OBS008-3/5; 009 C9 for -4) before push. The QA gate will list them |
| DOC-002 | medium (process, root-owned) | Status is **InProgress**, the Dev Agent Record is still the start paragraph, task checkboxes and File List are unticked. `qa-gate` expects **InReview** and halts otherwise. The Record still owes: A2 unreachable, KL-015-Q4 (a) trigger record and (c) choice note with R1-R4, final class-A allowlist (empty) with classes B and C, the M12 re-run, the CI re-check (none exists), audit before/after, `.npmrc` deviation D1, the secret bound 4096 | root consolidates and sets InReview (version 0.3.17 in the Change Log) before Phase 2 |
| TEST-001 | medium (commit set) | Copy-table tests read **untracked** files and uncommitted lines: `…/prep-20261016/t0-rulings/ruling.md`, `…/implementation-plan.md`, `…/execution-20261015/ux-implementation-plan.json`, `…/architect-rulings.json`, `ADR-SC-006…md`, `useGuidedSession.ts`, `…/rulings/w5-unreadable-and-alias.md`, plus modified `STUDIO-OBS-008/014/015.story.md`, `consensus-plan.md`, `openapi.yaml`, `ExecutionReadinessService.java`. A commit that omits any of them turns 240+ tests red on a clean checkout. The tests also pin quoted story text, so a PO strike of a quoted phrase breaks them | @devops: one commit set that includes all of them. Note that the working tree is the uncommitted 015 tree plus 008 (1347 changed paths), so the 008 push carries 015's changes too |
| REQ-001 | low | D-8 says the MSW mirror drops `secretId ?? name`; it is still at `handlers.ts:177`, unreachable from the page, and the authoring mirror does not require `secretId` on a `secretRef` | carry (item 5) |
| REQ-002 | low | The picker path is guarded (W5-2); the Variables dialog can still save a plain variable and a secret row that the backend refuses at start with an undeclared 422. The UI then shows the code honestly; nothing is lost | carry (item 4) |
| REQ-003 | low (user decision) | "Someone pressed Stop" after "None of these" | user decides (item 11) |
| UX-002r | low | UX-02 residual: the Proof tab is now selected on a new session or question, but at 375 px the panel sits below the editor, and the optional cue was not taken | carry (item 7) |
| SEC-001 | low | UX-21: page-derived `role` and `region` render as plain captions beside, not inside, the untrusted box. React text only, no markup path | carry (item 6) |
| MNT-001 | low | W5-6: `guidedNarratives.ts` ships source paths and quotes in the production bundle (about 33 KB) | carry (item 3) |
| MNT-002 | low | Lint warnings 302 to 308 (6 `react-refresh/only-export-components` in L5a `.tsx` files). Not errors | none required |
| TEST-002 | low | `pageGuidedRun.test.tsx` took 311 s here under host load (41 tests); bounded waits are 20 s and 60 s. A slow host could time out | fe2 will show; no action unless it fails |
| TEST-003 | info | E2E and D5 are MSW or local only. Nothing in 008 is claimed as live integration; OBS-009 owns that | none |
| REL-001 | info | V22 `VALIDATE` scan under ACCESS EXCLUSIVE, unmeasured at production size [I] | note for OBS-010 release readiness |

## 8. Why CONCERNS, not PASS (if the pending slots are green)

PASS needs "all acceptance criteria met, no high-severity issues, test coverage meets project standards". I expect all three to hold. The gate would still be CONCERNS because of tracked, non-blocking items: DOC-001 (unplaced carried work, the largest), the D-8 mirror residue (REQ-001), the pending user decision on "Someone pressed Stop" (REQ-003), the deferred copy and hardening Lows, and the commit-set coupling (TEST-001). None blocks Done. If slot (a), (b) or (c) shows a failure, a skipped case outside the approved 25, a drift outside the 24 files, or a threshold miss, the verdict moves to FAIL or the matching failure, not CONCERNS.

## 9. Phase 2 plan

1. Read root's evidence message. Re-hash and re-count everything in slots (a) to (d) myself; do not copy numbers from the root's summary.
2. Backend: parse `obs008-final-check01-results.json`; multiset-diff against 015 attempt06; reconcile to the predicted 2531; confirm the 25 skips by name; read the JaCoCo ratios; check stability flags and the `-after` manifest.
3. Copy-back: recompute the diff and the subset digests from the manifests; hash the 24 files.
4. fe2: read `fe2-*.log` and `fe2-vitest.json` for counts and failures; compare the axe hashes.
5. Check that root has set Status **InReview** and consolidated the Dev Agent Record, checkboxes and File List. If not, I stop at the pre-check as I did for OBS-015.
6. Decide PASS, CONCERNS, FAIL or WAIVED under the seven checks. Write `gate.md`, `gate.json` and `docs/qa/gates/STUDIO-OBS-008-single-path-studio-ui.yml`. If PASS or CONCERNS: set Status Done, add the Change Log row, fill QA Results, keeping the story's first line and every quoted phrase untouched.
