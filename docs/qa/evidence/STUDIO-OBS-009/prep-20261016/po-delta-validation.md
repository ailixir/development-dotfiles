# STUDIO-OBS-009: PO delta re-validation after STUDIO-OBS-007…015 and the 008 T0 close-out

- **Author:** Pax (@po). **Date:** 2026-10-16. **Mode:** YOLO, read-only prep (same kind as `STUDIO-OBS-008/prep-20261016/po-delta-validation.md`).
- **Tree:** uncommitted working tree on `brunobuger/ui-studio`, HEAD `734ad704f`. The STUDIO-OBS-015 final gate is live (Quinn draft 01, `gate: PENDING`, waiting for attempt04 on source digest `f071984a…`).
- **Story bound:** `STUDIO-OBS-009.story.md` sha256 `7b9ef036b6bd1c55…` (Status **Ready**, Change Log 0.3.14).
- **What I ran:** read-only only: `grep`, `sed -n`, `wc -l`, `ls`, `find`, `shasum -a 256`, `git ls-files`, and a `node` one-liner that lists the distinct case IDs in `benchmark/results.jsonl`.
- **What I did not run:** no tests, builds, installs, Gradle, Docker or git writes. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/` was edited, and no story file was edited.
- **Writes:** this directory only (`po-delta-validation.md`, `po-delta-validation.json`, `prerequisite-register.json`).
- [V] = I verified it in this pass. [I] = inference, not verified.

## Verdict

**GO with corrections, 8/10. Status stays Ready.** No lifecycle change (task step 12 does not apply: the status is not Draft, and this pass makes no story edits).

- Implementation stays held. 009 depends on 008 Done, and 008 is held until 015 is independently QA-approved Done and root releases it.
- Every placement the lead listed is carried in the story text [V]: KL-015-Q4 → AC-7 AUTHORED-ECHO-01 a–f; FOCUS-MUTATION-01 → AC-7 a–f; KL-015-R1 → AC-11 R1 a–e; KL-015-GRANT → AC-4 TF-5 a–e; S1 → AC-9 TF-3 a–e. Each has its T-task sub-item.
- 16 corrections are recorded below (D-1…D-16). None changes an AC's meaning. D-1 removes a contradiction with the 2026-10-15 user decision. D-11 and D-14 are the two substantive additions. The rest are anchor drift and naming.
- One item needs a decision outside @po: **REL-001** (CONTEXT_LOST is swallowed with no cause). The 015 QA draft says its fix needs a user scope decision. 009 is its natural home, but I do not place it in this read-only pass.

## Placement check (lead's list)

| Item | Source | Where 009/010/011 carry it | Present |
|---|---|---|---|
| KL-015-Q4 / AUTHORED-ECHO-01 | 015 KL, ruling Q4 | 009 AC-7 obligation a–f (`:114-120`), T4 `:338`, File List `:451`, sequencing `:398` | yes |
| FOCUS-MUTATION-01 | 015 KL (Quinn §9, Dex-D5) | 009 AC-7 a–f (`:122-171`), T4 `:339`; 010 AC-1 a–d (`:26-55`), T0 `:86`, File List `:133` | yes |
| KL-015-R1 | Aria lifecycle ruling §4 R1 | 009 AC-11 R1 a–e (`:245-282`), T5 `:348` | yes in 009; **010 reciprocal row missing** (010 D-4) |
| KL-015-GRANT | Dex triage A §3.1/§5 | 009 AC-4 TF-5 a–e (`:46-63`), T2 `:329` | yes in 009; 010 release-record row not stated (010 D-4) |
| S1 write-lock-on-read | Quinn final02 S1 | 009 AC-9 TF-3 a–e (`:177-194`), T5 `:350` | yes |
| V18 adapter retirement | Dex triage BC | 011 AC-1 CLN-F2 a–d (`:28-53`), T1 `:119-122` | yes |
| F-1 dead branch | Aria bridge ruling §6 F-1 | 011 AC-2 F-1 a–g (`:57-94`), T1 `:118` | yes; anchors drifted (see 011 section) |

## Anchors re-verified against the current tree [V]

| Story claim | Now | Result |
|---|---|---|
| Dockerfile `CMD ["node","dist/main.js"]` only (AC-1; Dev Notes `:59`) | only CMD, at `:61` | holds; line drift (D-4) |
| `guidedMain.ts` is a 33-line bootstrap calling `createGuidedServer` | 37 lines; `createGuidedServer` at `:6,:29` | holds; count drift (D-4) |
| `versions.ts` `:11/:14/:17/:29/:37`, `fixtures/reference/` javadoc | same lines; javadoc still cites `fixtures/reference/` | holds; the AC-1 d grep gives 19 hits today |
| `RunnerReportProjection.projectRuntime` `:502` | `:502` | holds |
| Helm: 4 runner templates, no guided template | `studio-runner-{deployment,networkpolicy,scaledobject,service}.yaml` | holds |
| `server.ts` is plaintext `node:http`; `KEY_SPECS` | `:17`; `KEY_SPECS` `:175` | holds |
| `StudioRunnerProperties` relocated, `validate()` accepts `http://` | `studio/dispatch/StudioRunnerProperties.java`, `validate()` `:46`, `http://` accepted `:51` | holds (012A relocated it) |
| `GuidedSessionReaper`/`GuidedTranslationCoordinator` `@Scheduled` with no `@Profile` | 1 / 0 each | holds |
| `ConfiguredBackgroundAuthorization` is local-only | `:9`, `:23`, `:37` | holds |
| AC-6 e: `@Disabled` = 24 = 6 + 18; `DEFERRED STUDIO-OBS-009` = 18 | 24; 18; per-class 3 + 2 + 1 + 16 + 2 | holds |
| AC-6 d: the 4 interim ports | `StudioScheduleApiIT:447,:972`; `SharedSchedulingIT:359,:511` | holds |
| AC-6 d: `GuidedPublicationReplayIT` tripwire "today `:2943`" | `:18508` | drift (D-3) |
| AC-6 b: the forced `saveAuthoring` edits; reason "`updateTest` refused with `AUTHORING_V2_REQUIRED`" | `StudioService` has no `updateTest`; `AUTHORING_V2_REQUIRED` has 0 hits in `backend/src/main` | reason stale (D-2); tripwire still valid |
| AC-6 f: `StudioAcceptanceService` `:370-418` | `acceptedAt` `:370`, `setPendingDeadlineAt` `:418` | holds |
| Emitters `OBSERVED_SCHEDULE_AUTH_REQUIRED` | `StudioScheduleProcessor:273`, `StudioAcceptanceService:332`, V16 CHECK `:128-130` | present (011 AC-3 is still conditional) |
| AC-7 AE-01: `runtime.ts:163`, `:201`; `observationCollector.ts:619`, `:498-505` | `:163`, `:201`; `:619`; filter `:498`, substring scrub `:500-505` | holds |
| AC-7 FM-01: `:734`, `:738`, `:42-44`, `:601-603`; `browser.ts:509`; `runtime.ts:451` | all hold; R4 guard is at `:753`, after them | holds |
| AC-7 FM-01 b: `observationCollectorInvoke.test.ts:133-159` focus refusals | 3 `it(` cases in that range (retype, focus stolen, read-only) | holds |
| AC-9 TF-3: `readAuthoringDraft` locks before `requireRead`, "working tree `:294-295`"; `StudioController:77` | method `:294`, `findByIdForUpdate` `:296`, `requireRead` `:297`; controller `:77` | holds; line drift (D-9) |
| AC-11 i: control-window call sites `:389/:398/:402/:403` | `:390/:400/:404/:405` | drift (D-5) |
| AC-11 j: `launcher.ts kill()` `:293-300`; `tree.ts:232` sync `readProcessTable()` | `kill()` `:293`, `signalProcessTree(pid,'SIGKILL')` `:299`; `:232`; `spawnSync('ps')` `:51` | holds |
| AC-11 k: `launchGuidedBrowser` `browser.ts:533`, no Studio-owned timeout; replay `boundedStartup` `:140-158` | `:532`; `launchPersistentContext` has no timeout option and no `boundedStartup`; replay bounded `:141-181` | holds; line drift (D-6) |
| AC-11 R1: `GuidedSessionEvidenceService.record` `:112-123`, check `:120`; repository `materialization` `:57` | `:79` record, `:120` check, `:57` | holds |
| AC-11 R1 b: `verifyLifecycle`/`sameIdentity` `:301`/`:313` | `:376`/`:388` (two-identity `require` at `:385`) | drift (D-7) |
| AC-11 R1 a: `materializedTeardownSession`, `appendPendingDelivery` helpers | `GuidedServiceTransportFaultIT:4133-4134` | holds |
| AC-12 h: `RUNNER_PORT` via `new ServerSocket(0)` `:2708-2709`, 127.0.0.1 probe | `:3652-3653`; probe `:3856` | drift (D-8) |
| AC-12 i: backend has no runner-dist dependency; dist-spawning classes | `build.gradle.kts` has no `studio-runner`/`dist` reference; exactly 4 test classes spawn the dist (Bridge, BridgePlanned, Planning, ReplayIT) | holds |
| AC-12 i addendum: `GuidedBridgeIntegrationTest` 9 + `GuidedBridgePlannedIT` 16 | 9 and 16 `@Test` | holds |
| AC-12 a: ReplayIT IPC diagnostic kept | `ordinary-ipc-parent`/`-child`/`ipcDiagnostics` present (4 hits) | holds (not run) |
| AC-12 g: `.aiox/sdc/STUDIO-OBSERVED-ORCH/gradle-locked.sh` | exists | holds |
| AC-7: 13 compile cases C01–C13 | `results.jsonl` (350 lines) has exactly 13 distinct case IDs | holds |
| AC-7: `GuidedProviderEvaluationTest` reports `UNAVAILABLE_NOT_RUN` | `:79`, `assumeTrue` `:84,:91` | holds |
| AC-4 TF-5: V21 view `:114`; audit functions `:837-880`; no GRANT/SECURITY DEFINER | `:114`; reads at `:840`, `:864`; 0 files with GRANT/SECURITY DEFINER; head is V21 | holds |
| File List paths (59 checked) | all exist except `frontend/playwright.config.ts` (008 creates it) | holds |

## Corrections (D-n)

Line numbers refer to `STUDIO-OBS-009.story.md` at sha256 `7b9ef036…`. "Kind": **correction** = the text is wrong today; **addition** = new cross-story fact; **anchor** = line drift only.

| ID | Line | Kind | Finding and reason | Source | Proposed change |
|---|---|---|---|---|---|
| D-1 | `:398` (Dev Notes "Sequencing with neighbours") | correction, should-fix | Says "OBS-011 starts after this story is Done" and "OBS-011 … starts only after this story is Done, so there is no parallel owner". This contradicts the 2026-10-15 user decision recorded in this story's own Dependency notes `:9` and in 011 0.2.4. The single-owner reasoning still holds, because AC-1 (P2, `versions.ts`) and AC-11 (j, `launcher.ts`) are on the start list, so both are done before 011 starts. | User decision 2026-10-15; 011 `:211-221`; README `:5` | Replace the two clauses with: "OBS-011 starts once this story's locally achievable ACs (AC-1–6, AC-11, AC-12 f–j) are implemented and validated and OBS-010's Live surface list exists. `launcher.ts` (AC-11 j) and `versions.ts` (AC-1 P2) are in that list, so they land before OBS-011 touches them; one owner at a time." |
| D-2 | `:75` (AC-6 b) | correction, low | The reason "a learned v2 draft refuses that call with `AUTHORING_V2_REQUIRED`" is stale. 015 ruling1 deleted the v1 entry points: `StudioService` has no `updateTest`, and `AUTHORING_V2_REQUIRED` has 0 hits in `backend/src/main` [V]. The tripwire (`grep 'studio.updateTest('` = 0) still holds. The test comments at `StudioScheduleApiIT:444,:615,:929` still name the old code. | 015 story `:437` (RC-2, "deleted with the v1 entry points (ruling1)"); grep | Reason becomes "the v1 `updateTest` entry point no longer exists (STUDIO-OBS-015 ruling1)". The stale test comments are comment-only. AC-6 b's "unchanged" rule covers assertions and control flow, not comments, so updating them is allowed. @dev records them by name. |
| D-3 | `:94` (AC-6 d) | anchor | `GuidedPublicationReplayIT` interim tripwire "today `:2943`" is now `:18508`. | grep | Replace with `:18508 (2026-10-16)`, or cite by assertion text. |
| D-4 | `:28` (AC-1), `:357` (Dev Notes) | anchor | "33-line bootstrap" → 37 lines; "Dockerfile:59" → `:61`. | `wc -l`, grep | Update both. |
| D-5 | `:226` (AC-11 i) | anchor | `:389/:398/:402/:403` → `:390/:400/:404/:405`. | grep `runCoordinator.ts` | Update. |
| D-6 | `:234`, `:387` (AC-11 k; Dev Notes ruling) | anchor | `launchGuidedBrowser` `:533` → `:532`; replay `boundedStartup` `:140-158` → `:141-181`. The fact (no Studio-owned bound on the guided launch) still holds. | grep | Update. |
| D-7 | `:264` (AC-11 R1 b) | anchor | `verifyLifecycle`/`sameIdentity` at `:301`/`:313` → `:376`/`:388`. `GuidedMaterializationService` changed after placement. | grep | Update, or cite by method name only. The rule ("one derivation") is unchanged. |
| D-8 | `:310` (AC-12 h) | anchor | `new ServerSocket(0)` `:2708-2709` → `:3652-3653`; readiness probe `127.0.0.1` at `:3856`. | grep | Update. |
| D-9 | `:180` (AC-9 TF-3 a) | anchor | "Working tree `:294-295`" → method `:294`, `findByIdForUpdate` `:296`, `requireRead` `:297`. | grep | Update. |
| D-10 | `:57`, `:329` (AC-4 TF-5 b, T2) | correction, low | "every object V19–V21 created" predates 008 T0 A1. 008 adds `V22__execution_replay_failure.sql` (four nullable columns and one CHECK on the partitioned `ui_test_executions`) before 009. New columns on an existing table follow its table-level grants [I], but the delta check should cover the head, not a fixed range. | 008 story `:126`, `:173`; t0 ruling A1.3 | "every object V19 through the migration head at T2 created or altered (V22 if 008 kept that number)". |
| D-11 | `:218-224` (AC-11 f–h, R10c) | addition, should-fix | R10c reclassifies a post-Ready self-stop toward `RUN_ERROR` and edits `RunnerReportProjection` and `RunnerOutcomeCodes`. After 008, `RunnerReportProjection.project` also derives `ExecutionSnapshot.replayFailure`. The TARGET_DRIFT branch keys on `result ERROR` + `errorCode RUN_ERROR` + `errorMessage "TARGET_DRIFT"` + exactly one FAIL step whose failure is `TARGET_DRIFT`. The two changes share files and an outcome class. Risk [I]: the R10c shape choice for the interrupted step's failure could make a self-stop look like a drift, or move the A1 refusal (`400 INVALID_REPORT`) path. | 008 t0 ruling A1.2 `:97-107`; 009 `:218-224` | Add to h: "the STUDIO-OBS-008 A1 `replayFailure` derivation is unchanged; a control-window or other post-Ready self-stop projects `replayFailure: null`; the R10c ruling states this, and one `RunnerReportProjectionTest` case proves it." |
| D-12 | `:240`, `:449` (AC-11 k teardown bullet; File List) | addition, low | `GuidedBridgePlannedIT` spawns the same untracked `dist` (one of the 4 spawning classes [V]) but is missing from the "IT teardown reaps descendants" list. The po-bridge-disclosure record flagged this as "likely also covers; not placed". | grep; `po-bridge-disclosure/decision.json` | Add `GuidedBridgePlannedIT` to the k teardown bullet and to the File List entry. |
| D-13 | `:445` (File List), AC-7 `:106` | correction, low | The two OBS-015 incremental corpus cases already exist as 015-owned artifacts: `studio-runner/evaluation/observed-authoring/cases/incremental-edit-step-4.json` and `incremental-insert-step.json` (untracked; QA statically validated them as ledger row 35). The File List only says "manifest.json (new; corpus incl. OBS-015 cases)". | `ls`; 015 gate.yaml `ledger_35` | Name both files as inputs that 009 consumes unchanged (not recreated). The manifest references them. |
| D-14 | `:284`, `:410` (AC-12; Testing) | addition, should-fix | "Backend … regression suites run on the final tree" does not name the lanes 015 added. Today the backend gate is `test` + `guidedIncrementalTest` + `crossReplicaTest` + `jacocoTestCoverageVerification` + `requireFreshGuidedPartitions` (`build.gradle.kts:278`, `:326`). The 015 QA draft records that the last two never executed in 015, that the JOIN suite is order-dependent so single-test ReplayIT reruns are not valid evidence, and that the JaCoCo `compile`/`compile.gateway` rules (`:436`, `:491`) match no package. | 015 `qa-formal-gate-draft01/gate.yaml` tests findings, TEST-002, coverage_scope | Name the five tasks in AC-12/Testing. State "a full-class or full-lane run only; no single-test ReplayIT rerun is credited". The vacuous JaCoCo rules are an 011 placement candidate (see "Unplaced"). |
| D-15 | `:410` (Testing), `:450` | correction, low | After 008 U2 the frontend runs under pnpm (`pnpm run test`, `pnpm run test:e2e`, exact `@playwright/test@1.63.0`). The runner stays on npm (`studio-runner/package-lock.json`; Dockerfile `npm ci` `:27,:43`; `tools/corun.sh:92`). Not migrated yet [V]: `frontend/package-lock.json` exists and there is no `pnpm-lock.yaml`. | 008 story `:139-151`, `:245`; `ls` | Testing names the pnpm frontend commands and states that the runner is unchanged. |
| D-16 | `:9` (Dependency notes) | correction, low | "Needs the whole single path (… → 015 → 008) Done" is still true. The 2026-10-15 amendment talks about OBS-011, but the earlier sentence "OBS-011 may start once this story is Done (ADR-SC-005)" is left unmarked next to it. | Story `:9`; 008 0.3.11 strike convention | Strike the superseded clause with a reason (append-only), as in 008 0.3.11. |

## Unplaced items that touch this story (no D; a decision or the issued 015 gate is needed first)

| Item | Fact [V unless marked] | Why not placed here | Candidate home |
|---|---|---|---|
| **REL-001** CONTEXT_LOST swallowed | `guided/ownership.ts:139` `catch{await this.stopEntry(entry,'CONTEXT_LOST');throw new Error('CONTEXT_LOST');}` and `guided/runtime.ts:157-159` drop the inner error. attempt03's CONTEXT_LOST has no known cause. | The 015 QA draft says the value-free diagnostic "needs a user scope decision". In 015 it would reopen the runner and image gates. In 009 it would not reopen 015 [I]. | 009 AC-11 (next to the RUNNER-LAUNCH carry, which already requires CONTEXT_LOST attribution) or AC-12 e (the child-side exception-class log candidate). User decides. |
| TEST-002 order-dependent JOIN suite | ReplayIT class-scoped latch; P7 tests fail alone | Draft gate, not issued; "OBS-011 or OBS-009" | 011 AC-5 (IT flake) |
| TEST-003 advisories | `GuidedSessionRepository.pendingTeardowns(… limit)` with `LIMIT 32` re-selection starvation (`GuidedSessionService:1620`); RaceTest branch vacuity; ledger-47 prune assertion | Draft gate says "track where already placed"; none of these is placed in 009/011 today | 009 AC-11 (starvation is runtime) / 011 AC-5 (test hygiene) |
| DOC-001 | stale `VariableReferenceValidator` Javadoc, dead private `isBlank` | Dex "next source window" | 011 AC-2 (class A dead code) |
| JaCoCo vacuous rules | `build.gradle.kts:436` `compile.gateway`, `:491` `compile` | 015 gate coverage_scope | 011 AC-1 new candidate |
| M12 stale comments | Dex M12: 4 stale comments for OBS-011 | 015 Dev Agent Record `:527` | 011 AC-1 new candidates |
| 008 A2 follow-up | public guided `SECRET_TARGET_NOT_PASSWORD` "if UX evidence after OBS-009's live runs shows authors hit this refusal" | not placed by @architect | Optional: AC-7 report counts `INVALID_CONTRACT` sessions per run. Recommendation only. |

## Acceptance criteria classification (current)

LOCAL = the code and its required proof run on this Mac. LOCAL-PARTIAL = the local part is listed; the AC's final proof needs an external system, person or approval. EXTERNAL = the proof itself is external.

| AC | Class | Local part (spelled out) | External part (register ID) |
|---|---|---|---|
| AC-1 one runner + P2 | LOCAL-PARTIAL | Fold `guidedMain.ts` into the runner application; one listener; config keys; `chart.test.ts` render and env ⊆ accepted keys; P2 a–d (remove the artifact-1 stamps; re-point `projectRuntime`/compat/check-pins; OpenAPI `RuntimeVersions` via the contract owner; grep = 0); local `docker build` from the public base image | Internal registry image and ED-05 Node pin (U4); real deployment (U4, U12) |
| AC-2 mTLS G-1 | LOCAL-PARTIAL | Profile/chart values for key, issuer, truststore; fail-closed negative test; separate audiences; rotation inputs recorded for 010 | G-1 "verified in a shared environment" (U4) |
| AC-3 TLS hop G-2 | LOCAL | Runner TLS termination with client cert; `validate()` rejects `http://` outside local/test; self-signed-CA IT; `HttpRunnerDispatchClient` presents the cert | none for the AC; G-2 is recorded as a release gate in 010 |
| AC-4 dumps, Vault, canary + TF-5 | LOCAL-PARTIAL | Dump/core settings with chart lint; `STUDIO_RUNNER_VAULT_ADDRESS` startup refusal; DB-wide canary scan after a local full run; Vault policy *text* rehearsal against a local dev-mode container (does not count for Done, see AUTO-DECISION 1); TF-5 b only if a grant migration is ruled | Vault policy test against the dev Vault (U5; GO condition 3); TF-5 a role model, c live audit row, e (U14, U4) |
| AC-5 profile gates + SIEM | LOCAL-PARTIAL | `@Profile` gates on `GuidedSessionReaper`/`GuidedTranslationCoordinator`; context test per profile; chart values for SIEM routing | SIEM sink availability (U6), "unrun, owner Platform/SRE" allowed |
| AC-6 schedules G-3 + 18 + R7 + R9-OBS-1 | LOCAL | Lift through background authorization (Q2 default); G-3 refusal outside local/test; re-enable the 18 unchanged; R7 non-vacuity; retire or re-point the 4 ports + ReplayIT tripwire; `@Disabled` = 6 + 0; f record | none (production authorization sources are activation, out of scope) |
| AC-7 D-C benchmark + RS-1 + AE-01 + FM-01 | EXTERNAL | Local preparation: corpus manifest (13 ported + 2 015 cases + login fixture + enterprise patterns); harness extension; RS-1 marking; AE-01 and FM-01 runner changes with fixture-tier and joined proofs (both local, both before the first real-model call); replay-stability harness | ED-01 (U2); staging app (U3); deployed stack (U4); budget admission (U7); S&C acknowledgement for AE-01 a (U13) |
| AC-8 schema probe | EXTERNAL | Probe test code (`GuidedSchemaProbeIT`) | ED-01 (U2); budget admission before the first real-provider call (U7, GO condition 2) |
| AC-9 isolation/mutation + TF-3 | LOCAL-PARTIAL | Overlap/CSI isolation and mutation oracles with the fixture provider; TF-3: @architect ruling, ruled read order, no-lock test, uniform 403 | Guard refusals "exercised with the real model" (U2, U4, U7) |
| AC-10 wire canaries + C-17 | EXTERNAL | Canary scanner over local traffic and outputs | Live gateway bytes (U2, U4); human C-17 reviewer on the live recording (U8, U3) |
| AC-11 faults + ADJ-1/R8.2/R10c/R10-OBS-1/2/P3/R1 | LOCAL-PARTIAL | Duplicate/ack-loss/restart/stale-owner/late-callback; public mid-step cancel; runner kill in the co-run; ADJ-1 a probe + b ruling + implementation; R8.2 d alert definition; R10c f–h; i log fields; j async table; k launch bound, process group, reaping, teardown; R1 a–d (needs 015 Done for L1) | Revocation "on the live stack"; worker-profile dispatch "on real pods"; R8.2 e live reaper bound (U4) |
| AC-12 suites + E2E + R10-rev2-2 + P4/P5 | LOCAL-PARTIAL | Backend lanes (D-14), runner tiers, frontend suites; f–j test infra; a–d observation on every full-class run; i addendum; E2E against local servers with the test-profile fixture provider | "Real-browser E2E through the real frontend and API … against the deployed stack" (U4); a real-model learn in the E2E (U2) |

Totals: 2 LOCAL, 7 LOCAL-PARTIAL, 3 EXTERNAL. This is unchanged from the 2026-10-15 feasibility analysis. The 2026-10-16 placements added local work inside AC-4, AC-7, AC-9 and AC-11 but changed no class.

**[AUTO-DECISION 1]** Does a local Vault dev-mode container satisfy AC-4's "Vault policy test against a dev Vault"? → **No, for Done and for GO condition 3.** It is allowed as a non-credited rehearsal of the policy text. (Reason: the AC proves the deployed backend token's least privilege, which depends on the real mount, auth role and policy binding that ED-02 owns. A self-provisioned container proves only the policy document we wrote. This is a classification, and @qa may overrule it at T0.)

## STUDIO-OBS-011 start-condition check (deliverable 4)

**Result: the text reflects the 2026-10-15 decision. No correction is required for the decision itself.** [V]
- 011 Dependency notes `:9` (0.2.4): "no longer waits for OBS-009 Done … once … OBS-009's locally achievable ACs are implemented and validated, and OBS-010's dated 'Live surface' list exists."
- 011 "Start-condition amendment" `:211-221`: names the list "AC-1–6, AC-11 and AC-12 f–j", keeps "nothing on that list is removed", and keeps the emitter condition and the @qa-only Done.
- README `:5` item 2 and the 009 `:9` and 010 `:9` cross-references match.

Recorded corrections and clarifications (none edited):

| ID | Where | Kind | Finding | Proposed change |
|---|---|---|---|---|
| S-1 | 011 `:209` (GO conditions) | correction, low | The superseded clause "starts only after OBS-009 is Done" is still present. It is overridden only by the block below it. | Strike it inline with a pointer to the amendment (append-only convention). |
| S-2 | 011 `:212` | clarification, should-fix | "Implemented and validated" does not say who validates. Only @qa credits evidence in this wave. | Recommended default: an independent @qa review record of the listed local halves (not a Done verdict). @po recommends; the coordinator confirms. |
| S-3 | 011 `:212` | clarification, should-fix | The list predates the 2026-10-16 placements. Under it, AC-11 now includes R1 a–d (which needs 015 Done; "not reproduced" or an @architect non-confirmation also counts as resolved), and AC-4 now includes TF-5. TF-5 a/c/e are external, so only b counts. AC-9 TF-3, AC-7 AE-01 and AC-7 FM-01 are **not** on the list. 009 `:114`/`:132` say so for AE-01/FM-01; nothing says so for TF-3. | Add one sentence that lists these per sub-item. |
| S-4 | 011 AC-4 (d) `:98` | addition, low | The guided TypeScript reformat covers `src/guided/**`, which includes `guided/runtime.ts` (edited by AE-01). `run/observationCollector.ts` is edited by AE-01 and FM-01. The single-owner rule exists only on the 009 side (`:398`). | Add the reciprocal note: the reformat skips those files while AE-01/FM-01 are open, and the coordinator assigns one owner. Same for `StudioService.java` while TF-3 is open (011 File List names `StudioService.java`). |
| S-5 | 010 (see 010 D-1) | blocking for the condition | 011's condition needs 010's Live surface list. 010 has no text that lets T2 start before 009 Done. | See 010 D-1. |

Observation (not a correction; 011 already says "re-verify at HEAD at T0"): the F-1 facts were taken against `GuidedSessionService.java` `d10ec5cb…`. It is now `cfb55a54…`. The translation-absent arms moved to `:370/:828/:862/:1424/:1995`, and three `require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` gates now sit at `:177/:191/:405`. F-1 d's grep (`translation != null &&` = 0, or each hit listed) will hit those three by design. The earlier 011 drift items (`checkCommand` lives in `GuidedTranslationService:166,:197,:889`; `.ai/` is now 118 tracked files) are still unfixed in the AC text.

Earliest 011 start under the decision [I]: 015 Done → 008 Done → 009 local lanes validated, and 010 T2 Live surface list written (needs 010 D-1).

## 10-point checklist (delta)

| # | Item | Result | Note |
|---|---|---|---|
| 1 | Title | PASS | |
| 2 | Description | PASS | |
| 3 | Testable ACs | PASS | Anchor drift (D-3…D-9) does not change testability. D-14 makes AC-12's suite set explicit. |
| 4 | Scope IN/OUT | PASS | AE-01/FM-01/TF-3 narrow exceptions are recorded. |
| 5 | Dependencies | PARTIAL → PASS after D-1, D-16 | The sequencing note contradicts the user decision. 008 and 015 holds stand. |
| 6 | Complexity | PASS with risk | Still "L", with 12 ACs and about 17 inherited obligation blocks. Size risk noted; the 009 split (PROPOSAL B alternative) was not adopted. |
| 7 | Business value | PASS | |
| 8 | Risks | PARTIAL → PASS after D-11 | The R10c/replayFailure interaction was unstated. REL-001 is unplaced (decision needed). |
| 9 | Criteria of Done | PASS | GO condition 3 unchanged. |
| 10 | Alignment with landed contracts | PARTIAL → PASS after D-2, D-10, D-13, D-14, D-15 | 015 deleted v1 `updateTest`; 015 added lanes and corpus files; 008 adds V22 and pnpm. |

Score 8/10, GO. Code intelligence: not used (`isCodeIntelAvailable()` previously recorded false; not re-checked). There is no STUDIO-OBSERVED epic file under `docs/prd`; ADR-SC-005 is the source of truth. Executor `dev` / gate `architect` is valid; @devops co-executes T1/T2 (GO condition 5).

## Not claimed

No implementation, test, QA verdict or Done. No ruling for @architect. No placement of REL-001 or of the draft-gate advisories. No 015 completion: its gate is a draft pending attempt04. MSW or fixture-provider evidence is never live proof.
