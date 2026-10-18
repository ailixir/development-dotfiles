# STUDIO-OBS-011 T0 package (brought forward): inventory re-verification, proposed rulings, wave plan

- **Author:** Aria (@architect). **Date:** 2026-10-18, measured 14:30–15:05 EDT. **Mode:** YOLO, docs only.
- **Status:** PROPOSAL for ratification by root, @dev, @qa and @po. It binds nothing until ratified. Story STUDIO-OBS-011 stays **Ready**.
- **Writes:** only `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/{t0-proposal.md, lanes.json, w-brief.md}`. No story, source, test, spec, chart or runbook was edited. No test, build, Gradle, docker or install was run. No git write. `.aiox-core/core/permissions/dispatch-governance.js` untouched.
- **Legend:** **[V]** I ran the read-only command or read the bytes today. **[I]** inference. Every command in `lanes.json` is PLANNED_NOT_RUN.
- **Tree measured:** HEAD `734ad704f` plus the dirty working tree (the 009 W3 tree, G9 in progress). The G9 local gate (`docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/status.txt`) was mid-run at measurement: C1–C3, C5, C6 exit 0, **C4 runner-deployment exit 1**, C8 backend still running [V]. Anchors below are therefore pre-G9-exit; T0 re-takes the hashes at the 011 start digest (rule R-T0-1).

**Inputs (sha256 prefix):** story `ef0eec7f9e28d94d` (0.2.13); inventory `3f0d3a53f113d5bb`; README `3810c7134dcba8af`; 009 `w2-brief.md` `cbf089045a2abb7f`; 009 `lanes.json` `97b6de8fe5a72dcc`; 008 gate `e371c8174e33f1df`; 009 `f-merge/pre-rulings.md` `1c2b9869d7f1db3d`; 009 `w3/pre-g9-rulings.md` `d501f1abb865f123`; 009 EP receipt `d49aad3c40402620`; 010 Live-surface skeleton `1b4f82e32373ca16`; `backend/build.gradle.kts` `fee7af874cc0875d`; `docs/specs/studio/openapi.yaml` `bbf37fd1f96c0da3` (C9 re-anchored it; the 008-era `b5ecdcad…` is stale).

---

## 1. Start condition: what this package can and cannot do now

| Part of the 011 start condition (story 0.2.4/0.2.7/0.2.8) | State at 15:03 EDT | Consequence |
|---|---|---|
| G9 exit + independent @qa local-validation record over the 011 start list | **Not yet.** G9 running; C4 runner-deployment exit 1 [V `status.txt`] | T0 rulings can be ratified now. Lanes do not start. If C4 stays red at G9 exit, the 011 baseline records it as a pre-existing red with its name (R-T0-2). |
| Dated 010 "Live surface" list | **Does not exist.** Only the T2-SK skeleton (draft, "protects nothing yet") [V] | T0 final step (R-T0-3) waits for it. 010 T2 starts at G9 exit, so the list is on the 011 critical path. |

Everything below is prepared so that the only T0 work left after G9 exit is: (1) confirm the start condition, (2) take the start digest and decide baseline reuse (R-T0-2), (3) read the dated Live surface list against the lane write sets (R-T0-3), (4) apply the ratifications.

---

## 2. Inventory re-verification at the working tree (AC-1, G1)

Method: per-row read-only grep/ls at the working tree; commands are in `lanes.json` → `t0.reverifyCommands`. "Resolved by" names the story whose landing removed the row, as far as the evidence shows; @qa re-runs the grep independently at T0 (AC-7 method).

### 2.1 Original rows CLN-01…CLN-51

| Row | Still present? | Evidence (path:line or command → result) | Tag | Proposed AC-1 disposition |
|---|---|---|---|---|
| CLN-01 review cluster | No | `ls frontend/src/components/studio/review/` → no such directory | [V] | resolved by OBS-012B |
| CLN-02 review tests/helpers | No | same directory gone | [V] | resolved by OBS-012B |
| CLN-03 `confirmCompile` client/type/MSW | No (production) | `grep -rn confirmCompile frontend/src/services/api` → 0; `studioTypes.ts` `ConfirmCompileRequest` → 0; only comment text and a negative assertion in `studioEscalation.test.ts:15-249` (`not.toContain('confirmCompile')`) | [V] | resolved by OBS-012B; the test comments are guard text (AC-7 known exception) |
| CLN-04 InferenceStudio + api/types/handlers | No | all four paths absent | [V] | resolved by OBS-012B |
| CLN-05 `STUDIO_AUTHORING_V2` | No | `grep -rn "STUDIO_AUTHORING_V2\|studioAuthoringV2" frontend/src` → 0 | [V] | resolved by OBS-012B |
| CLN-06 `legacyTestIr.ts` | No | file absent, 0 refs | [V] | resolved by OBS-012B |
| CLN-07 `PinnedStoppedRunRecordingFacts` | **Yes** | `frontend/src/components/studio/evidence/pinnedVideoEvidenceFacts.ts:74`; 0 other refs | [V] | **remove** (11-FE) |
| CLN-08 two barrels | No | both `index.ts` absent | [V] | resolved by OBS-012B |
| CLN-09 `features/studio/authoring/**` | No | directory absent | [V] | resolved by OBS-012B (K row moot) |
| CLN-10 `retireLegacyStudioWorker` | **Yes** | file present; `index.tsx:2,5`, `main.tsx:3,19` | [V] | class C, ruling R-10 (carry forward, owner @devops) |
| CLN-11 a11y surfaces 4/5 | **Yes** | `frontend/src/test/a11y/studioWcagAudit.test.tsx:324` (surface 4), `:335` (surface 5), pinned keys `:99-100` | [V] | class C, ruling R-11 (delete as duplicates of surface 3) |
| CLN-12 `validate-variables` undocumented | No | `openapi.yaml:750` documents it; MSW `handlers.ts:415`; client `studioApi.ts:136` | [V] | resolved by OBS-012A (documented) |
| CLN-13 five unused FE deps | Yes | each still in `frontend/package.json` | [V] | **out of scope** (AC-7 names it) |
| CLN-14 `studioSlice.testSteps` | No | only a comment at `studioSlice.ts:54` | [V] | resolved by OBS-012B |
| CLN-15 `confirm-compile` route | No | 0 hits in `backend/src/main`; `dto/ConfirmCompileRequestDto.java` and `studio/compile/` absent | [V] | resolved by OBS-012A |
| CLN-16 guided v1 internal routes | No | `grep -rn internal/v1 …/studio` → 0 | [V] | resolved by OBS-012A |
| CLN-17 v1 observed OpenAPI | No | `studio-observed-authoring/openapi.yaml` and `openapi-v2.yaml` absent | [V] | resolved by OBS-012A |
| CLN-18 setter injection | Yes (K) | `ExecutionReadinessService.java:99`, `GuidedSessionController.java:26`, `ProvisionalDispatchAuthorization.java:33` | [V] | K, unchanged |
| CLN-19 `isCanonical` + `CANONICAL` | **Yes** | `dto/ExecutionStatus.java:20,26`; 0 callers in `backend/src` | [V] | **remove** (11-LEFT) |
| CLN-20 `StudioService.updateAuthoring` | **Yes — PO drift note 1 (2026-10-10) is wrong at this tree** | `StudioService.java:389-398` (`/** Alias matching… */ public AuthoringV2Response updateAuthoring(`); `grep -rnw updateAuthoring backend/src frontend/src` → declaration only | [V] | **remove** (11-LEFT, after G9: TF-3 has landed in lane B [V `b/receipt.md:12`]) |
| CLN-21 zero-caller methods | **Yes**, all six | `GuidedSourceInputResolver.java:69` `allocationIds`; `RunnerOutcomeCodes.java:95` `isApiAssigned`; `VaultStudioReferenceResolver.java:249` `providerName`; `SecretAlreadyExistsException.java:20` `getSecretName`; `StudioExecutionProperties.java:142,160` (`pollInterval`, `pollIntervalOrDefault`) and `:197,212` (`readInterval`, `readIntervalOrDefault`); `application.yml:375` `read-interval`; each 0 callers outside the declaring file | [V] | **remove** (11-LEFT) |
| CLN-21 `recordEvidence` | **Yes** | `GuidedSessionService.java:1701`; main callers 0; test callers `GuidedSessionIT.java:593,596`; string labels only in `GuidedPublicationReplayIT.java:29726,30232,30353` (diagnostic stack classifier) | [V] | **remove** with the F-1 change (11-GS-M); the ReplayIT labels stay as a named AC-7 known exception (R-21) |
| CLN-22 public-for-test seams | Partly | `CompileExecutor` gone with `compile/`; the other five present (`DispatchState.java:78`, `HttpRunnerDispatchClient.java:129`, `WatchedExecutionRegistry.java:122`, `GuidedTranslationCoordinator.java:115`, `SnapshotBroadcaster.java:92`) | [V] | K; `activeCount` resolved by OBS-012A |
| CLN-23 `EvidenceReference` DTO | No | file absent | [V] | resolved by OBS-012A |
| CLN-24 V2 engine methods | 5 of 6 gone | `captureForCompilation`, `confirmVersioned`, `assembleCaptured`, `findAuthoringById`, `adaptLegacyAuthoring` → 0; **`findAuthoringV2ById` stays** at `StudioService.java:366`, 0 main callers, 6 test classes use it as a read seam | [V] | resolved by 012A except `findAuthoringV2ById` → K (test read seam; new note) |
| CLN-25 JPA accessors | not re-measured | — | — | **out of scope** (AC-7) |
| CLN-26 Spring-discovered classes | Partly | `StudioCompileConfig`, `StudioEvidenceConfig` absent; others not re-listed | [V] partial | K |
| CLN-27/28 YAML `v2-enabled`, `compile.incremental.enabled` | No | `grep -n "v2-enabled\|incremental:" application.yml` → 0 | [V] | resolved by OBS-012A |
| CLN-29 `studio.scheduling` | Observation | `StudioSchedulingProperties` `setPollIntervalMs(String)` `:23` and `(long)` `:27` still dual-typed | [V] | K (noted, not cleanup) |
| CLN-30/31 security paths | — | not re-measured | — | **out of scope** (AC-7, ED-02) |
| CLN-32…38 account provider family (class B) | No except three text residues | sweep below (§2.2) | [V] | resolved by OBS-007/012A; residues → R-B |
| CLN-39 docs after rescope | Partly | `account-provider-readiness-design.md:1` already carries "SUPERSEDED — 2026-10-09 … [secret-login-design.md](secret-login-design.md…)"; `guided/session/README.md:203` still says "`GuidedProductionSessionAccess.AccountAccess` remains the fail-closed OBS-007 account-provider handoff" | [V] | header: resolved (AC-6 historical-header item met); README line `:203` stale → fix in 11-FOLD (it owns that README) |
| CLN-40 `deferred.test.ts` | **Yes** | 19 `it.skip` in `studio-runner/test/deferred.test.ts`; 23 other skips in `test/`; F-merge runner unit 29 skipped [V `w2-brief.md` W3 addendum] | [V] | class C, ruling R-40 (@qa) |
| CLN-41 `versions.ts` observed constants | **No** | `studio-runner/src/versions.ts` is 12 lines; only `OBSERVED_CONTRACT_VERSION` (`:12`), used by `validator/observedReplay.ts:4,237,350` | [V] | resolved by OBS-012A + 009 AC-1 P2 |
| CLN-41 `TOTAL_TIMEOUT_MESSAGE` | Present, **no longer dead** | `launcher.ts:390`; imported by `test/helpers/runner.ts:51,283` | [V] | K (test-used export) — delta vs inventory |
| CLN-42 over-exports | — | not re-measured | — | **out of scope** (AC-7) |
| CLN-43 `scripts/*.d.mts` | Yes | three files incl. new `browser-provenance.d.mts` | [V] | K |
| CLN-44 Helm runner env | Changed | 38 distinct `STUDIO_RUNNER_*` names now (24 at inventory) | [V] | K; `chart.test.ts` still enforces rendered ⊆ accepted [I] |
| CLN-45 tools | Yes | as listed; `tools/corun.sh:8-9,103` now targets `ObservedCoRunIT` | [V] | K |
| CLN-46 `db/cutover/V19…` | No | `backend/db/cutover` absent (git status shows `D`) | [V] | resolved by OBS-012A |
| CLN-47 `current-state.md` | No longer stale | `current-state.md:3` "Superseded (2026-10-12)" header | [V] | resolved by OBS-012A (dated note present) |
| CLN-48 `compile/README.md` | No | file absent | [V] | resolved by OBS-012A |
| CLN-49 rollout runbook flag sentence | **Yes, moved** | `docs/runbooks/studio-inference-rollout.md:133` (`studioAuthoringV2=true`, `STUDIO_AUTHORING_V2_ENABLED`, `STUDIO_INCREMENTAL_ENABLED`) | [V] | **fix text** (11-DOC); it documents three things that no longer exist |
| CLN-50 `VITE_ALLOW_INSECURE_MSW_FALLBACK` | **Yes** | `frontend/README.md:56,60`; sha `8fe7c5df` = L3H after-value | [V] | **remove bullet** (11-FE owns `frontend/`) |
| CLN-51 Mock-First prose | **Yes** | `CLAUDE.md:81-82,142`; `AGENTS.md:81-82,142`; `ARCH.md:40,52,101`; hashes equal the L3H after-values | [V] | **fix text** (11-DOC; root confirms the wording because every agent loads these files) |

### 2.2 Class B sweep (AC-2 list), working tree

Command: for each symbol, `grep -rn --exclude-dir=node_modules --exclude-dir=dist "$s" frontend/src studio-runner/src backend/src/main tools docs/specs/studio-observed-authoring/contracts`. **Path correction:** AC-2 says `contracts/v3`; there is no repo-root `contracts/`. The real path is `docs/specs/studio-observed-authoring/contracts/v3` [V].

| Symbol | Hits | Where | Disposition |
|---|---|---|---|
| observedAccount, installCookies, addCookies, ReplayAccountAccess, accountHandle, accountAuthorization, accountGrantId, accountAbi, ACCOUNT_UNAVAILABLE, ACCOUNT_UNKNOWN | 0 | — | resolved |
| AccountAccess | 1 | `backend/…/guided/session/README.md:203` (text) | fix text in 11-FOLD |
| accountRef | 2 | `tools/check-studio-observed-contracts.cjs:1043` (a negative assertion: must **not** include `accountRef`); `contracts/v3/fixtures.json:13711` (a negative fixture "account removed from session", `valid:false`) | **K — guard text** (AC-7 known exception) |
| authConnection | 1 | the same `check-…cjs:1043` negative assertion | K — guard text |
| AWAITING_AUTH | 1 | `contracts/v3/fixtures.json:10776` | K — needs a reading at T0 by @dev: if it is a negative (`valid:false`) row, guard text; if positive, delta for @architect |
| AUTH_CONNECTION_REQUIRED | 1 | `contracts/v3/result.schema.json:176` (`const`) | **K by ruling R-B** (closed v3 contract; removing the const is a contract change with pins; the code can never emit it — 0 backend hits) |

### 2.3 Story-specific anchors (re-verify duty from AC-1/AC-2/AC-4 and the inbound table)

| Item | Story anchor | Working tree | Tag | Note |
|---|---|---|---|---|
| **AC-3** `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters | `StudioScheduleProcessor.java:273`, `StudioAcceptanceService.java:322` | **0 hits in Java**; only `V16__scheduling.sql:128,130` (CHECK, stays) | [V] | **resolved by OBS-009 lane S (AC-6 lifted schedules)**. 11-LEFT records the grep only. |
| **AC-4 (c)** `claim()` 606 lines, `checkCommand` 365 | panel 2026-10-09 | **`GuidedSessionService.claim` is 98 lines (`:944-1041`); `GuidedTranslationService.checkCommand` is 22 lines (`:1408-1429`)** (brace-counting script, lambdas included) | [V] | The premise no longer holds. Largest methods today: `GuidedTranslationService.call` 394 (`:1444`), `advancePrefix` 275 (`:344`), `question` 186; `GuidedSessionService.admitChecked` 182 (`:1276`). Ruling R-4c + user question U-1. |
| AC-4 (d) "lines up to 792 chars" | panel | `src/guided/types.ts` max 2385 (generated), `contracts.ts` 678, `ownership.ts` 655, `transport.ts` 569, `runtime.ts` 468, `evidence.ts` 342, `diagnostics.ts` 194, `json.ts` 170, `guidedBrowser.ts` 222 | [V] | No formatter exists: no Prettier config or binary in `studio-runner`, `frontend` or the root [V `ls node_modules/.bin`]. Ruling R-4d. |
| F-1 sites `:353/:799/:832/:1375/:1923` | AC-2 F-1 a | **moved:** `if (translation != null && translation.exists(id))` at `:370` (clarify), `:846` (refresh continuation), `:880` (answer), **`:1442` (admission, wraps `translation.attachAdmission` at `:1443`, after `repository.insertAction` at `:1440`)**, `:2013` (evidence receipt). Already unconditional: `require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` at `:177,:191,:405` | [V] | `GuidedSessionService.java` sha256 `cad1efa342710c08…` (2939 lines). |
| F-1 `instanceof GuidedProductionSessionAccess` `:691-695` | AC-2 F-1 c | now **two** sites: `:660-663` (incremental `select`) and `:735-740` (`production.initialize(session)`) | [V] | Ruling R-F1.3. |
| F-1 production installs translation | AC-2 F-1 a | `GuidedSessionConfiguration.java:91` `service.installTranslation(translation, questions)` | [V] | unconditional, as Pax recorded. |
| F-1 test classes | `GuidedSessionIT` 44 `@Test` `4c5236fd…`; `GuidedServiceTransportFaultIT` 20+1 `7d711a43…` | `GuidedSessionIT` 44 `@Test`, sha `4d47ad6f…`; **`GuidedServiceTransportFaultIT` 31 `@Test` + 1 `@ParameterizedTest`**, sha `8cbc0207…`, 5758 lines; `translationTeardownService` used at `:4132,:4191,:4224` | [V] | 009 grew TransportFaultIT by 11 cases; counts re-taken at T0. |
| CLN-F2 V18 adapter | facts a | `GuidedPublicationEvidenceFixture.java` `freezeHistoricalV18Source :48`, `requireV18 :50,:312,:875,:902`; `GuidedPublicationMigrationTest.java` (12 `@Test`) `publishHistoricalV18Observed :1867`, `prepareHistoricalV18Observed :1879`, `commitHistoricalV18` uses `:1633,:2221,:2358,:2367,:2391,:2406`; `InferenceMigrationIT.java` (5 `@Test`) 3 hits; `InferenceMigrationLatestIT.java` exists | [V] | `grep -rn 'HistoricalV18\|requireV18' backend/src` → 25 hits in 3 files. Ruling R-F2. |
| R9-OBS-3 clock | `GuidedPublicationAuthorization :85,:96`; `GuidedPublicationConfiguration :44,:94` | `GuidedPublicationAuthorization.java:85` (mint), `:96` (judge) unchanged; **`GuidedPublicationConfiguration.java:50` and `:101`** `Clock.systemUTC()`; `GuidedPlanPublisher.java:118` (`publications.claim(…, clock.instant())`), `:136` `new PublicationBudget(attempt.validationDeadline(), clock)`; `PublicationBudget.java:18` `remaining` = `Duration.between(clock.instant(), deadline)`; `DatabaseClock` `extends Clock` (`:26`), used today only by `ObservedReplayRuntimeConfiguration.java:58` | [V] | Ruling R-9. |
| C-OBS008-1 | `GuidedSessionService.java:759-763`, controller `:59-75`, projector `:128` | `GuidedSessionService.java:759-763` (`if (!terminal(session)) return view(session);`), `result(session)` `:2881`; controller `:59-75`, `:74` `result.has("outcome") ? 200 : 202`; projector `result(…)` `:128`; controller sha `176c6cbb` = Pax's value | [V] | Ruling R-08-1e. |
| C-OBS008-2 | `StudioSecretsService.java:56-60` | Javadoc `:56-59`, `MAX_VALUE_LENGTH = 4096` `:60`; sha `2178e609` = Pax's value | [V] | unchanged. |
| C-OBS008-3 | `guidedNarratives.ts` `f8f68c01…`, 37,674 bytes, 93 `quote:` | same sha, 37,674 bytes, 93 `quote:` lines, `COPY_SOURCE_FILES` `:46`, 16 files reference `guidedNarratives`; `authoredLiteralTargetNotFound` still at `:346` | [V] | unchanged since 008; AE-01 f (009) has **not** landed (no `o-ae/` lane folder [V]). |
| C-OBS008-5 | `handlers.ts:164,:177` `61df7a97…` | `:164` comment, `:177` `variable.secretId ?? variable.name`; sha `61df7a97` | [V] | unchanged. |
| C-OBS009-1 | `:2757,:2796,:2801,:2807,:1659,:1670` | all six anchors equal [V] | [V] | — |
| C-OBS009-2 | `StudioRunnerConfiguration.java:19-21,:25` | equal; `grep -rn "runner.validate()" backend/src/main` → 1 (`:20`) | [V] | — |
| C-OBS009-3 | README `:244,:345,:398,:420,:441,:463,:491,:500`; runbook `:13,:132` | all equal [V] | [V] | — |
| C-OBS009-4 | `ObservedReplayAuthorization.prepareScheduled :137`, caller `StudioAcceptanceService.java:334` | equal; `ObservedReplayAuthorizer.authorize :45` | [V] | — |
| `checkCommand` location | PO drift note 2 | `GuidedTranslationService.java:1408` (callers `:166,:197,:889,:1034,:1071,:1111`; `GuidedSessionService.java:2797`) | [V] | — |
| `.ai/` | PO drift note 3: 108 tracked | **118 tracked, 10 untracked/modified**, 128 entries | [V] | Ruling R-AI. |
| Awaitility | "not in build.gradle.kts" | still not declared; `org.awaitility:awaitility:4.2.2` is in the local Gradle cache (Boot 3.3.5 manages that version) | [V] cache / [I] offline resolution | Ruling R-5w. |
| JaCoCo vacuous rules | 008 gate (a) | `build.gradle.kts:484` (`studio.compile.gateway`), `:539` (`studio.compile`); packages absent | [V] | Ruling R-J. |
| Sleep-polled ITs (AC-5 timing) | "named at T0 from a timing run" | from the 008 final check XML (no new run): `GuidedPublicationReplayIT` 1066.7 s / 46 cases, 94 `Thread.sleep`; `GuidedPlanningIntegrationTest` 358.7 s / 57, 1; `GuidedBridgePlannedIT` 143.7 s / 16, 4; `SecretUseAuditIT` 75.7 s / 36, 1; `GuidedSessionIT` 42.9 s; `GuidedBridgeIntegrationTest` 40.9 s / 9, 2; `GuidedServiceTransportFaultIT` 33.8 s / 39, 14; `GuidedPublicationRaceTest` 26.5 s, 2 | [V] | `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-final-check01-task-outputs/test/xml` (308 classes, 2508 s). Ruling R-5. |
| Story class names | AC-4 (c), File List | **`IncrementalRelearnIT` and `SecretLoginFixtureIT` do not exist.** The incremental cases are `GuidedPublicationReplayIT` methods run by the `guidedIncrementalTest` task (`build.gradle.kts:278-289`); the nearest secret-login class is `GuidedSecretLoginMigrationTest` | [V] | AC-1 deltas (text for Pax). |
| Test packages | 009 `lanes.json` 11-GS verify `--tests '…guided.bridge.*'` | `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest` declare **`package com.citi.put.checks.studio.guided.session`** although they live in `guided/bridge/` and `guided/translation/` | [V] | The old pattern would select only the bridge unit tests and miss the ITs. `lanes.json` here uses exact FQCNs. |

### 2.4 New candidates found in this pass (AC-1 "new candidates created by OBS-007…015")

| ID (proposed) | Path | Class | Evidence | Proposed action |
|---|---|---|---|---|
| CLN-N1 | `backend/src/main/java/com/citi/put/checks/studio/guided/account/` | A (empty dir) | `ls -la` → empty; git does not track it | delete the empty directory (11-LEFT); no git effect |
| CLN-N2 | `frontend/src/.claude/agent-memory/{aiox-pm,aiox-ux}/` | A (empty dirs, stray tool metadata inside `src`) | empty since 2026-10-05; `git ls-files frontend/src/.claude` → 0 | delete (11-FE); coordinator-owned cleanup |
| CLN-N3 | `studio-runner/evaluation/{oracle.mjs, oracle.test.mjs, report.mjs, report.d.mts, fixture-server.mjs, fixture-server.d.mts, example-manifest.json, browser-oracle.test.mjs}` + `test/evaluation/report.test.ts` + the `validate-manifest`, `oracle-self-test`, `summarize` commands of `evaluation/cli.mjs` (`:7-8,:27-48`) + README `:43-45` | C (compile-era, still referenced) | EP F1 [V receipt `:101`]; **correction to EP:** not "only imported by tests": `cli.mjs:7` imports `validateManifest` from `oracle.mjs`, `cli.mjs:8` imports `report.mjs`; `test/evaluation/corpusPages.test.ts:7,122` imports `fixture-server.mjs` on purpose (C04 fidelity, EP deviation 2); `example-manifest.json` has 0 importers; `browser-oracle.test.mjs` imports `dist/validator` (absent) | Ruling R-EP |
| CLN-N4 | `VariableReferenceValidator.isBlank` (`backend/…/studio/validation/VariableReferenceValidator.java:168-170`) | A (dead private) | only the declaration; `:165` uses `String.isBlank` | **record only** — the user declined MNT-001 on 2026-10-17 (story PO note). Not removed unless the user asks. |
| CLN-N5 | `GuidedPublicationReplayIT` C5 claim sampler line pins | test diagnostic, stale | `GuidedPublicationReplayIT.java:30180` pins `GuidedSessionService.claim` at line **751**, but `claim` starts at `:944`; also `GuidedContracts.java:90`, `GuidedSessionRepository.java:79`, `GuidedPlanPublisher.java:100,:135,:388`, `ObservedValidationClient` class name `:30044` | [V] | The sampler is `claimSamplerDiagnosticOnly` (`:31677-31679`) [V]. The `:751` pin already never matches. Ruling R-C5. |
| CLN-N6 | `RunDetailsDrawer.tsx:357` "Confirmed revision:" | vocabulary (CLEANUP-OBSERVATIONS) | [V] | Ruling R-CO. |

### 2.5 Inbound items not yet placed (for @po)

| Item | Source | State | Proposal |
|---|---|---|---|
| RUN-ORPHAN-01 (replay child outlives a runner SIGKILL) | Aria pre-G9 ruling §1.3 (`d501f1ab…`) | **not placed in any story** (`grep -rn RUN-ORPHAN-01 docs/stories` → 0) [V] | If @po places it in 011: conditional lane `11-RO` (sandbox; `run/child.ts`, `run/childRuntime.ts`; fixtures-tier test; lands in `11-MERGE` with a dist rebuild). User question U-3. |
| SEC-AUDIT-PREREADY-01 (runner attests `NOT_USED` before `Execute3`) | same ruling §2.4 | not placed [V] | Same lane as RUN-ORPHAN-01 if placed (both in the runner child/coordinator path). Its backend half tightens `PreReadyRevocationJoinedIT` after the new dist. |
| 008 MNT-003 (W5-8 `executeTest(id, key?)`, W5-9, W5-10, F-L5a-4, F-L5b-7/M6) | 008 gate §6 | "fold into 011 or the next frontend story"; not placed [V] | Recommend **not placed in 011** (lean scope; frontend product behaviour, not cleanup). @po decides. |
| 009 EP compile-era leftovers (CLN-N3) | EP F1 | "root or 011 should decide" | Place in 011 as CLN-N3 (ruling R-EP). |

---

## 3. Proposed T0 rulings (need ratification)

Each ruling: decision, reason, trade-off, ratifier. "Ratifier" is who confirms; @architect owns the technical choice where the story says so.

### Process and baseline

**R-T0-1 — Anchors and hashes are re-taken at the 011 start digest.** Every [V] line number above is pre-G9-exit. At T0 root takes `capture-manifest.py` once; lanes quote anchors from that capture. Ratifier: root.

**R-T0-2 — Baseline reuse.** If the 011 start capture digest equals the G9 binding capture (source + dist + helm), the G9 results **are** the 011 baselines (backend `check` with `test,guidedIncrementalTest,crossReplicaTest`; runner unit/fixtures/deployment; frontend vitest), and the G9 XML is the AC-5 "before" timing. Otherwise root runs `obs011-t0-baseline-check01` and the frontend and runner baselines before any lane starts. A red that G9 closes with (today C4 runner-deployment) is recorded in the baseline by name and is not 011's to fix.
- Why: saves one ~1 h 45 min Gradle `check` on the critical path, at zero evidential cost when the digest is equal.
- Trade-off: binds 011's "before" to G9's environment; if root edits anything after G9 (for example the 009 Dev Agent Record does not count, but a source touch does) reuse is void.
- Ratifier: @qa (owns the reconciliation) + root.

**R-T0-3 — Live surface check.** Once the dated 010 list exists, @dev (read-only) intersects every `lanes.json` write set with its entries. Any hit stops that item (G12), except: (a) `studio.execution.sse.read-interval` (skeleton CFB-078, `EXCLUDE-CANDIDATE`) — **architect ruling for OI-04: exclude it from the Live surface; 011 removes it** (zero readers [V]; protecting a dead key would block AC-2 CLN-21); (b) OI-05 (a): **011 does not merge `studio.guided-authoring.runner-origin` into `studio.runner.base-url`.** The fold merges clients and TLS, not configuration keys, so the key stays a Live-surface entry untouched by 011 (`GuidedSessionConfiguration.java:104-107`, `StudioRunnerTls.java:537` keep reading it). (c) OI-05 (b): `dist/runtime-versions.json` keys are untouched by 011. Ratifier: @pm/@analyst for the list text; this ruling is the architect side.

**R-T0-4 — Evidence model (same as 009 R3).** Lane collector runs are non-evidentiary; an exit 2 from `sourceStable:false` while other lanes edit is expected and the test counts are reported. Credited evidence comes only from `11-G` at one digest, plus the T0 baseline. Ratifier: @qa.

**R-T0-5 — Collector output.** The execute-009 collectors write to `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/execution` (hard-coded, `run-backend-tasked.py:92`, `run-backend.py:6`, `run-runner*.py`). Default: use them with `obs011-` labels, as the brief says. Recommended alternative for root (one-line path edit each, `.aiox/` only): copy to `execute-011/` with the output set to `docs/qa/evidence/STUDIO-OBS-011/execution-<date>/execution`, so 011 evidence does not land in 009's folder. Ratifier: root.

**R-T0-6 — Sandboxes.**
- `11-FE` works in a sandbox copy of `frontend/` (008 U1 method) and lands at `11-MERGE`; the backend collector hashes `frontend/`.
- `11-RT` (and `11-RO` if placed) works in a sandbox copy of `studio-runner/`, because **any** write under `studio-runner/src` makes `verifyRunnerDist` fail every backend run that selects a runner-spawning IT until dist is rebuilt (`build.gradle.kts:295-341`: fails when `dist/main.js` is older than any file under `studio-runner/src`) [V]. A sandbox keeps the backend lanes runnable all wave.
- `11-DOC` writes `AGENTS.md` and `studio-runner/README.md` as patch files in its receipt folder; root applies them at `11-MERGE` (both are inside the collector's hashed roots).
- Backend lanes work in the real tree and must leave it compiling whenever they release the Gradle lock (a broken intermediate compile blocks every other backend lane).
Ratifier: root + @dev.

**R-T0-7 — Proof meaning of "passes unchanged".** "Unchanged" means the named test file is byte-identical across the change under proof, with its sha256 recorded immediately before (the story's own AC-2 F-1 e precedent for the split). Ratifier: @qa + @po (method, not AC text).

### Leftovers (AC-1, AC-2, AC-3)

**R-3 — AC-3 is resolved by OBS-009.** The emitters are gone from Java (0 hits) and V16's CHECK value stays. 11-LEFT records the grep. Ratifier: @po (records "resolved by 009 lane S").

**R-10 — CLN-10 shim.** Keep it. Sunset = first production deployment that contains it + 4 weeks (the 2026-10-09 PO advisory). No production deployment exists, so the row goes to "Carried forward", owner @devops. No code change in 011. Ratifier: @po + @devops.

**R-11 — CLN-11.** Delete surfaces 4 and 5 as duplicates of surface 3 (both scan the author state under misleading names). Two named drops; pinned keys `:99-100` removed; `docs/qa/accessibility/axe-results.json` regenerated by the full frontend run with the reason recorded. Test-only (G8). Never add new states (ADR-SC-006).
- Alternative: "not now" (carry). Rejected because the names are actively misleading and the change is ~30 lines.
- Ratifier: @qa.

**R-40 — CLN-40.** Convert the four pointer entries in `deferred.test.ts` (AC-17 moved to 10.19; 10.14 AC-26 discharged; 10.18b implemented; AC-18 resolved) to comments. The 15 criteria skips stay. Runner skipped count goes 29 → 25, reconciled by name. Ratifier: @qa (the story names @qa).

**R-21 — `recordEvidence`.** Remove `GuidedSessionService.recordEvidence` in 11-GS-M with the F-1 change; the `GuidedSessionIT` case(s) that exercise only it (`:593-596`) are named drops, or are ported if they assert anything else. The three string labels in `GuidedPublicationReplayIT`'s diagnostic classifier stay and are listed as an AC-7 known exception (diagnostic labels; editing ReplayIT for them would add a baton for no behaviour).
- Reason: OBS-013 AR-1 rejected its reuse (terminal refusal) [I from the AR-1 ruling record]; 0 main callers [V].

**R-B — Class B residues.** Keep `AUTH_CONNECTION_REQUIRED` as a `const` in the closed v3 `result.schema.json:176` and the negative fixtures/assertions that mention `accountRef`/`authConnection`. They are guard text or unreachable closed-contract enum values; removing them is a contract change with pins for zero behaviour. Fix the stale prose at `guided/session/README.md:203` (11-FOLD). @dev reads `fixtures.json:10776` (`AWAITING_AUTH`) at T0: negative row → keep; positive row → bring back to me. Ratifier: @qa (AC-7 exception list).

**R-F2 — CLN-F2 (with @data-engineer).** **Retire** the historical V18 adapter.
- Reason: no environment holds a V18 Studio population (Studio unreleased; ADR-SC-005 "Dev databases recreated after D-B"); OBS-015 kept the adapter for its own migration proof, which is closed; `InferenceMigrationLatestIT` already exercises the head writer.
- How: for each of `InferenceMigrationIT`'s 5 cases and `GuidedPublicationMigrationTest`'s V18-dependent cases, **port** to the head writer when the case asserts a database rule that still exists at head (for example V15 publication claim/expiry judgement, which V19+ did not replace), and **retire by name** only when the case asserts the V18→V19 upgrade-with-data boundary itself, citing the covering head test. Then delete the adapter; `grep -rn 'HistoricalV18\|requireV18' backend/src` → 0.
- Trade-off: loses an upgrade-from-V18 regression that no deployment can exercise; keeps every live-rule assertion.
- Ratifier: @data-engineer (co-sign; the story requires it). Without the co-sign the item is carried forward, never dropped.

**R-J — JaCoCo vacuous rules.** Remove the two rules for `studio.compile.gateway` (`build.gradle.kts:484`) and `studio.compile` (`:539`); their packages are gone since 012B, so they assert coverage of nothing. Behaviour-neutral (verification over an empty class set). 11-LEFT owns `build.gradle.kts`. Ratifier: @qa.

**R-EP — CLN-N3 compile-era evaluation layer.** Retire it as one unit in 11-RT: delete `oracle.mjs`, `oracle.test.mjs`, `report.mjs`, `report.d.mts`, `example-manifest.json`, `browser-oracle.test.mjs`, `test/evaluation/report.test.ts` (named drops), and the `validate-manifest`, `oracle-self-test` and `summarize` commands in `cli.mjs`; update `evaluation/README.md`. **Keep `fixture-server.mjs` (+ `.d.mts`)** unless 11-RT re-points `corpusPages.test.ts`'s C04-fidelity check to the observed-authoring page server and shows the same assertion passes; if it does, delete it too.
- Reason: the single path has no artifact-1 oracle; `browser-oracle.test.mjs` is red by construction.
- Trade-off: `pnpm run evaluate summarize` stops existing. The observed-authoring harness has its own report path [I from EP receipt].
- Ratifier: @qa (owns the EP harness self-test record) + @po (placement).

**R-CO — CLEANUP-OBSERVATIONS wording.** `RunDetailsDrawer.tsx:357` "Confirmed revision:" → "Learned revision:" is in scope only with @ux-design-expert's one-line approval at T0; otherwise carry. Copy change, visible text only.

**R-AI — `.ai/`.** Keep tracked as-is (118 files); no archive in 011. The 10 untracked/modified entries belong to the @devops commit set. Archive-first remains the rule if anything is ever removed. Ratifier: @po (the story names @po).

### Folds (AC-4)

**R-4a — One runner client.** Fold `GuidedRunnerClient` (518 lines) and `ObservedValidationClient` (136) into the dispatch client: one HTTP/TLS transport (client certificate, trust, redirect policy, budgets) built once from `StudioRunnerTls`, with operation methods for dispatch, validation and the guided bridge. Delete both classes.
- Constraints: the `SecretValue` single writer and the canonical body digest **move**, they are not duplicated; the folded validation call still refuses an active transaction (`RUNTIME_INCOMPATIBLE`, as `ObservedValidationClient.validate` does today, ReplayIT `:5613` relies on it); no new configuration key.
- Blast radius [V]: 14 main files and **21 test files** reference the three folded classes (list in `lanes.json` 11-FOLD). `GuidedPublicationReplayIT` holds type references (`:5592,:5618,:9181`) and class-name strings (`:1413,:30044,:31468`).
- Trade-off: one large atomic test swap (FOLD-final) instead of incremental adapters; adapters would be a second path, which ADR-SC-005 forbids.

**R-4b — One authorization seam.** `GuidedPublicationAuthorization.authorizePublication` becomes a method of `DispatchAuthorization`, implemented by `ProvisionalDispatchAuthorization` (the only implementor [V]). Callers (`GuidedPlanPublisher`, `ObservedReplayAuthorizer`, `GuidedPublicationResultProjector`, `ObservedReplayConfiguration`, `GuidedPublicationConfiguration`) take `DispatchAuthorization`. `GuidedPublicationAuthorizationIT` is ported by name to `com.citi.put.checks.studio.dispatch.DispatchAuthorizationIT`.

**R-9 — R9-OBS-3 clock (narrow AC-7 exception).** Mint (`:85`) and judge (`:96`) the publication grant on `new DatabaseClock(jdbc)`; inject the same into `GuidedPlanPublisher` in place of `Clock.systemUTC()` at `GuidedPublicationConfiguration.java:50,:101`. This also moves `publications.claim(…, clock.instant())` (`GuidedPlanPublisher.java:118`) and `PublicationBudget.remaining()` to the database clock.
- No tolerance; TTLs, validation deadline and leases unchanged; V15 untouched; `DatabaseClock` itself unchanged.
- Performance [I]: every `instant()` is one `SELECT clock_timestamp()` round trip outside any transaction. `PublicationBudget.remaining()` is called per validation request, not in a loop [I]; the lane records the call count per publication in the proof.
- Proof: new `com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT`, `ObservedGrantClockIT` style, JVM clock skewed both ways.

**R-09-2 — C-OBS009-2.** In 11-FOLD: delete `StudioRunnerValidated` and the `studioRunnerValidated` bean; `StudioRunnerConfiguration` keeps only `@EnableConfigurationProperties`; `grep -rn "runner.validate()" backend/src/main` → 0; `StudioRunnerTlsTest`, `StudioRunnerPropertiesProfileTest`, `GuidedScheduledBeansProfileTest` (D3 profile gates) green unchanged.

**R-09-4 — C-OBS009-4.** In 11-FOLD: one package-private builder, `guided/publication/ObservedReplayBindingBuilder.java` (new), for the `ExecutionBinding` and replay grant, used by `ObservedReplayAuthorizer.authorize` and `ObservedReplayAuthorization.prepareScheduled`; same `DatabaseClock`, same `authorizationTtlMs`. Lane S tests and the 18 re-enabled schedule methods green unchanged.

**R-4c — AC-4 (c) split.** The measured sizes (98 and 22 lines) remove the premise. Proposal: record AC-4 (c) as **"resolved by drift"** with the brace-count evidence and do **no split**; the SQL-statements-per-command proof is not needed.
- Not proposed: re-targeting the split to `GuidedTranslationService.call` (394) or `advancePrefix` (275). That is new scope, and the user prefers lean scope; it needs a user decision (U-1).
- Effect: lanes 11-GS (W3 split) and 11-GT from the 2026-10-16 plan are **dropped**, which shortens the critical path.
- Ratifier: @po (AC text) + user if U-1 is answered "re-target".

**R-4d — Runner TS reformat without a formatter.** No formatter exists and installing one is out of bounds. Proposal:
- Scope: `src/guided/{contracts,diagnostics,evidence,json,transport}.ts` and `src/run/guidedBrowser.ts`. **Excluded:** `runtime.ts` (AE-01 open [V no o-ae lane]), `ownership.ts` (REL-001 open, per 009 plan), `types.ts` and `schemas.json` (generated by `tools/build-studio-observed-schemas.cjs`, "Never edit by hand" [V `types.ts:1`]), `journal.ts`, `policyHash.ts` (already ≤ 140 columns).
- Method: hand-wrap to ≤ 140 columns under the existing ESLint config; proof is an **AST-equality check** written with the in-tree `typescript` package (parse before/after, drop positions and trivia, compare node kinds, texts and comments), plus runner unit and fixtures suites equal by name. The checker lives in the lane receipt folder, not in `src/`.
- Alternative: carry AC-4 (d) forward. Acceptable if the lane runs long; it is not release-blocking.
- Ratifier: @qa (proof method).

**R-4e — Regeneration check.** Confirm `node -e "require('./tools/build-studio-observed-schemas.cjs').check()"` is still wired (G9 C5-codegen exit 0 [V `status.txt`]) — record only.

**R-F1 — F-1 exact shape.**
1. **Admission (`:1442`).** Put `require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` at the **start of the admission transaction, before `repository.insertAction` (`:1440`)**, not just before `attachAdmission`, so the refusal writes nothing (the ruling's own "writes nothing" test needs this). Then call `translation.attachAdmission` unconditionally.
2. **The other four sites (`:370`, `:846`, `:880`, `:2013`).** Same `require(…, "RUNTIME_INCOMPATIBLE", 409)` as the first statement of each enclosing transaction, before any write; then the body runs unconditionally. Same refusal as the existing guards at `:177,:191,:405`; no new code.
3. **`instanceof GuidedProductionSessionAccess` (`:660-663`, `:735-740`).** **Not in this change.** Removing it changes the `GuidedSessionAccess` SPI that test compositions implement, which widens F-1 into every IT that supplies its own access. With F-1 in place, a session started under a non-production access has no translation state and is refused 409 at its first command: fail-closed. Record it as a named remaining conditional with this reason (story F-1 d allows listed remaining hits).
4. **Negative test.** New `com.citi.put.checks.studio.guided.session.GuidedAdmissionWithoutTranslationIT`: admission for a session with no translation state → `409 RUNTIME_INCOMPATIBLE`, zero rows written in action, admission and preparation tables (count before/after).
5. **Grep target.** `grep -n "translation != null &&" GuidedSessionService.java` after the change returns only the eight `require(…)` lines (three existing + five new); each is listed. `if (translation != null` returns 0.
Ratifier: @dev (feasibility), @qa (proof).

**R-08-1e — C-OBS008-1 (e): terminal SUCCEEDED with publication disabled.** Report `publication {status: "REFUSED", receipt: null}` with `currentReadiness` `NOT_PUBLISHED`.
- The v3 `result.schema.json` publication enum is closed: `PUBLISHED` | `PENDING` | `CONFLICT` | `REFUSED` [V]. `PENDING` forever is untrue, and the frontend renders it as "saving" indefinitely (`GuidedCompletion.tsx:125-127` → `finalizing`) [V]. `REFUSED` is the only terminal non-published value that does not claim a conflict; no contract or pin change.
- Known imprecision: the frontend maps a non-`PUBLISHED`, non-`PENDING` SUCCEEDED to `publicationConflict` copy (`:128`). A copy refinement goes to the F08 post-GA copy pass, not 011.
- Rejected: a new enum value (contract change, pins, and the ruling bars contract edits); keeping `PENDING` (dishonest).
- It is part of C-OBS008-1's existing AC-7 exception.

**R-08-3 — C-OBS008-3 does not wait for 009 AE-01 f.** The story schedules it "after or with AE-01 f". AE-01 has no code yet and waits on the external U13 acknowledgement (no `o-ae/` lane folder [V]). Waiting would park C-OBS008-3 indefinitely. Proposal: 11-FE moves the metadata now; when AE-01 f lands later, it removes the `authoredLiteralTargetNotFound` row from both the runtime table and the test-only registry. The conflict is textual only (one key in two files). Ratifier: root + @po (single-owner schedule).

**R-C5 — ReplayIT C5 sampler pins.** The sampler is diagnostic-only and already stale (`claim :751` vs `:944`). 11-FOLD-final updates only the class-name strings that would otherwise point at deleted classes (`ObservedValidationClient` → the folded client's validate method; `GuidedPublicationAuthorization` `:31468`) so the diagnostic keeps attributing; line pins are left as they are and listed as stale diagnostics (no assertion depends on them [V `claimSamplerDiagnosticOnly`]). Not a 011 obligation to refresh them.

### IT flake reduction (AC-5)

**R-5 — Named list.** Primary: `GuidedPublicationReplayIT` (94 sleeps; includes TEST-001 order dependence). Siblings: `GuidedServiceTransportFaultIT` (14), `GuidedBridgePlannedIT` (4), `GuidedBridgeIntegrationTest` (2), `GuidedPlanningIntegrationTest` (1), `SecretUseAuditIT` (1), `GuidedPublicationRaceTest` (2), `GuidedFocusMutationJoinedIT` (2), `GuidedEvidencePendingAppendJoinedIT` (2). Each `sleep` is classified **POLL** (waiting for a condition: convert) or **DELIBERATE** (the test's subject is elapsed time, a lease, a clock or a race window: keep, with the reason recorded). No asserted behaviour is reduced. "Before" wall time = baseline XML (R-T0-2); "after" = the 11-G XML, same test list.

**R-5w — Wait library.** An in-repo helper `backend/src/test/java/com/citi/put/checks/studio/support/Await.java` (condition supplier, bounded deadline, fixed small poll interval, failure message that names the condition and the last observed value). **No Awaitility.**
- Reason: no `build.gradle.kts` dependency change (a single-owner file, `testcontainersAlignmentCheck` nearby, and the offline resolution of the cached 4.2.2 is [I] only); the needed surface is about 40 lines.
- Trade-off: no fluent API or `untilAsserted` sugar; fine for polling loops.

**R-TEST-001 — ReplayIT order independence.** Per-test setup/teardown for the two P7 tests and any test that reads state another test wrote; class-scoped expensive fixtures (`PER_CLASS`, `:112`) may stay if each test resets the state it reads. **Method names do not change**: `build.gradle.kts:278-291` selects ReplayIT methods by name for `guidedIncrementalTest` and excludes them from `test`. Evidence per story a–d; single-test runs are never credited (D-14).

---

## 4. Wave plan (summary; machine form in `lanes.json`)

Corrections to the 2026-10-16 plan (`prep-20261016/lanes.json` 11-*):
- **11-GT dropped and 11-GS W3 split dropped** (R-4c).
- **11-GS split into 11-GS-T (tests) and 11-GS-M (main)** so the F-1 test migration and the C-OBS009-1 / C-OBS008-1 main work run in parallel.
- **11-FOLD split into FOLD-prep (W1, main code only, old classes kept compiling) and FOLD-final (atomic swap of the 21 tests + deletions)**, so the longest lane starts on day one.
- **11-IT split into 11-IT-R (ReplayIT) and 11-IT-S (siblings)**; both run before FOLD-final and hand their files to it.
- **New: 11-MERGE** (root) for sandbox copy-back and the single dist rebuild; **11-RO** conditional on RUN-ORPHAN-01 placement.
- **11-DOC** moves to W2 (5-agent cap).

| Wave | Lanes (agents) | Gradle users | Starts when | Exit |
|---|---|---|---|---|
| W0 | 11-T0 (root, T0-QA, T0-PO, T0-DE; T0-AR = this) | 0 (or 1 if R-T0-2 reuse fails) | G9 exit + QA record + dated Live surface | rulings ratified, baselines named, Live-surface intersection = 0 |
| W1 | **11-GS-T, 11-GS-M(a), 11-LEFT, 11-FOLD-prep, 11-RT** (5) | 4 backend lanes share the lock | W0 exit | GS-T migration green; GS-M(a) C-OBS009-1 + C-OBS008-1 green; LEFT done; FOLD-prep new client + seam compiled beside the old classes |
| W2 | **11-GS-M(b) F-1 removal + proof**, 11-FE (sandbox), 11-DOC, 11-FOLD-prep (cont.), 11-RT (cont.) (5) | GS-M(b) proof runs ReplayIT + Bridge + Planning unchanged | GS-T baton (GuidedSessionIT, TransportFaultIT) | F-1 proof recorded |
| W3 | **11-IT-R, 11-IT-S, 11-GS-T2 (bridge fixture fold F-3)**, 11-FOLD-prep (cont.), 11-FE/11-DOC tail (≤ 5) | IT-R ReplayIT runs dominate | F-1 proof done | IT-R, IT-S, GS-T2 release their files to FOLD-final |
| W4 | **11-FOLD-final** (1; others idle or 11-RO) | FOLD proof incl. full ReplayIT alone | batons from IT-R, IT-S, GS-T2, GS-M | 21-file swap + 3 deletions green |
| W5 | **11-MERGE** (root) | none (runner build + vitest) | FOLD-final exit, RT/FE/DOC/RO exit | sandboxes copied back; one dist rebuild; runner unit/fixtures green; frontend gates green |
| W6 | **11-G** (root + independent @qa) | 1 credited `check` | 11-MERGE exit | AC-7 reconciliation, grep, wall-time after |

**Write-set check [V]:** I ran a pairwise overlap check (python3 -I, read-only) over each concurrency group in `lanes.json`, with W2/W3 checked against every optional tail lane at once. Result: W2–W5 have 0 overlaps. W1 has 1: `GuidedSessionIT.java` appears in both 11-GS-T and 11-GS-M, but 11-GS-M writes it only in part b (W2), after the baton. Method and result are recorded in `lanes.json` → `writeOverlapCheck`.

**Maximum parallelism:** 5 agents in W1, W2 and W3; 4 concurrent Gradle *users* in W1 (one Gradle *process* at a time through the lock).

**Critical path:** G9 exit → 010 T2 dated Live surface (external to 011) → **11-T0** → **11-GS-T** (F-1 positive-admission migration in 1826 + 5758-line ITs; the heaviest single edit) → **11-GS-M(b)** (F-1 removal + unchanged-proof runs, ReplayIT ~18 min + Bridge/Planning ~9 min at 008 timings) → **11-IT-R** (94 ReplayIT sleeps + TEST-001; several ~18 min full-class runs) → **11-FOLD-final** (atomic swap + full ReplayIT alone) → **11-MERGE** (dist rebuild + runner fixtures) → **11-G** (full `check` ~1 h 45 min at 008 timing + frontend + runner + QA).
- FOLD-prep, LEFT, RT, FE, DOC, IT-S and GS-T2 all have float.
- [I] The two longest uncertain items are 11-GS-T and 11-IT-R. If 11-IT-R slips, the R-4d-style fallback is to carry the ReplayIT sleep conversion forward (not release-blocking) and let FOLD-final proceed; TEST-001 stays in scope.

---

## 5. Risks and security notes

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| K-1 | A runner `src` edit in the real tree breaks every backend lane's guided IT run (`verifyRunnerDist`) | high (schedule) | R-T0-6 sandbox; single rebuild in 11-MERGE |
| K-2 | A backend lane releases the Gradle lock with a non-compiling tree | high (schedule) | brief rule: compile-clean at every lock release; FOLD-prep keeps old classes until FOLD-final |
| K-3 | FOLD-final touches 21 test files at once; one red blocks the wave | medium | FOLD-prep lands the new client and seam first with their own tests; FOLD-final is mechanical type swaps + deletions, proven by the named classes |
| K-4 | R9-OBS-3 adds DB round trips on the publication path | low [I] | call count recorded in the proof |
| K-5 | Secret-bearing serializer duplicated during the client fold | **security, medium** | R-4a: `SecretValue` single writer and body digest move, never copied; 11-G greps for a second serializer; canaries of OBS-007 AC-9 tests green |
| K-6 | F-1 changes an authorization-adjacent gate | security, low | refusal before any write; negative test with row counts; production composition unchanged (facts re-verified) |
| K-7 | C-OBS008-1 changes a public response on a non-default path | low | AC-7 exception already placed; one publication-disabled HTTP test validated against `v3/result` |
| K-8 | G9 closes with C4 runner-deployment red | unknown | R-T0-2 records it by name; not 011's to fix unless placed |
| K-9 | `GuidedServiceTransportFaultIT` grew to 31+1 cases in 009; F-1 migration scope larger than the story assumed | medium (schedule) | counts re-taken at T0; ported by name |

---

## 6. Open questions for the user

| # | Question | Default if no answer |
|---|---|---|
| U-1 | `claim()` and `checkCommand` are already 98 and 22 lines. Close AC-4 (c) as resolved by drift, or re-target the split to `GuidedTranslationService.call` (394 lines) / `advancePrefix` (275)? | **Close it, no new split** (lean scope) |
| U-2 | The story counts on a "repository formatter" for the runner TS reformat, but none is installed. Accept a hand reformat with an AST-equality proof, or carry AC-4 (d) forward? (Installing Prettier is not proposed.) | **Hand reformat with the AST proof** |
| U-3 | Should RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 (runner child path) go into 011? They are behaviour changes that need a dist rebuild and fixtures-tier runs; they add lane 11-RO but stay off the critical path. | **Place them in 011** if @po agrees; otherwise GA backlog |

Items for @po (not the user): AC-3 resolved by 009; AC-1 deltas (CLN-20 present, CLN-41 resolved, `contracts/v3` path, missing class names `IncrementalRelearnIT`/`SecretLoginFixtureIT`, TransportFaultIT counts); CLN-N1…N6 placement; 008 MNT-003 (recommend not placed); `.ai/` keep-tracked; CLN-10 carry with @devops.

---

## 7. Auto-decisions

- [AUTO-DECISION] Reuse the G9 run as the 011 baseline? → Yes, only if the digests are equal (reason: saves ~1 h 45 min of critical path with no evidential loss; R-T0-2).
- [AUTO-DECISION] Awaitility or an in-repo helper? → In-repo helper (reason: no build-file dependency change; R-5w).
- [AUTO-DECISION] Keep the `instanceof GuidedProductionSessionAccess` conditionals in F-1? → Keep, listed (reason: SPI blast radius; fail-closed either way; R-F1.3).
- [AUTO-DECISION] Terminal publication status with publication disabled? → `REFUSED` (reason: closed enum, honest, no contract change; R-08-1e).
- [AUTO-DECISION] Remove the dead `VariableReferenceValidator.isBlank`? → No, record only (reason: the user declined MNT-001 on 2026-10-17).
- [AUTO-DECISION] Merge the runner-origin and base-url keys in the fold? → No (reason: key merge is a deployment-surface change and would collide with the Live surface; R-T0-3 b).
- [AUTO-DECISION] Remove the `AUTH_CONNECTION_REQUIRED` const from the v3 result schema? → No (reason: closed-contract value, unreachable, removal needs pins; R-B).
