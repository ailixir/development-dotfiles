# STUDIO-OBS-009 (local ACs), 010 (Live surface) and 011: implementation and wave plan (prep 2026-10-16)

- **Author:** Aria (@architect). Preparation only. Implementation stays held: 015 is InProgress (QA gate draft, attempt04 pending), 008 is Ready and held behind 015, and 009 depends on 008.
- **Writes:** this file, `lanes.json` and `t0-questions.md` in this directory. I made no source, contract, story, lifecycle or git change. I ran no Gradle, test, build, install, Docker, database or model call. All commands were read-only: `ls`, `grep`, `sed -n`, `wc -l`, `shasum -a 256`, `git status --short`, and `node -e` reading `package.json`.
- **Companion files:** `lanes.json` is the machine-readable lane table. `t0-questions.md` holds every open ruling with a recommended answer; this plan cites them as **A1…A19, B1…B8, C1–C2, D1–D4**.
- **Inputs (sha256 prefix):**
  - stories 009 `7b9ef036`, 010 `bf8b1bf6`, 011 `7cfb11f5`; inventory `b2ee4bd6`;
  - feasibility `4c58e07a`;
  - 008 plan `1db80f67`, 008 `lanes.json` `3ca79c3b`, 008 T0 rulings `1127e995`;
  - 015 gate draft `gate.yaml` `062852bd`;
  - 015 Aria rulings: append/Q4, lifecycle/L1, bridge/F-1;
  - 015 PO placement records: triage, focus/R1, Q4, bridge;
  - in this directory: Pax `po-delta-validation.md` and Quinn `qa/*` (both read mid-task, after the coordinator's message).
- [V] = verified by the command or read noted. [I] = inference.

## 0. Baseline verified today

| # | Fact | Consequence |
|---|---|---|
| B1 | [V] 015 **InProgress**, final gate attempt04 not run (`final-gates04` absent). 008, 009, 010 and 011 are **Ready** | W0 is gated on 015 Done, then 008 Done (A1) |
| B2 | [V] Four backend ITs spawn `studio-runner/dist/run/guidedMain.js`: `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedPublicationReplayIT`. ReplayIT also starts a replay runner on `http://127.0.0.1:<port>` (`:2901`) | The AC-1 fold and the AC-3 TLS change break these four classes unless their spawn path changes **in the same slot**. They become the hot spot owned by lane I |
| B3 | [V] `Dockerfile:61` single CMD; `guidedMain.ts` 37 lines; `server.ts:17` plaintext `node:http`; `transport.ts:76` HTTPS with `requestCert`; `assertObservedBrowserStartup` is imported by `guidedMain.ts:9` | A2/A3 rule the fold. P2 must keep that function's signature stable |
| B4 | [V] `GuidedSessionConfiguration:85,:102` uses `SSLContext.getDefault()` for `GuidedRunnerClient`. `HttpRunnerDispatchClient` and `ObservedValidationClient` have no client certificate | A4: one dedicated runner TLS context. It touches two files that 008 L1 owns, so D3 waits for 008 |
| B5 | [V] `GuidedSessionReaper:36` and `GuidedTranslationCoordinator:53` are `@Scheduled` with no `@Profile`. Chart profiles are `api,<env>` and `worker,<env>` | A5: `@Profile("!api | worker")` |
| B6 | [V] `@Disabled` = 24; `DEFERRED STUDIO-OBS-009` = 18 (StudioScheduleApiIT 16, SharedSchedulingIT 2). Tripwire at `GuidedPublicationReplayIT:18508`. Emitters at `StudioScheduleProcessor:273` and `StudioAcceptanceService:332` | S lane. The 015 approved-skips file (25) must become a 009 file with 7 entries, authored by QA |
| B7 | [V] `readAuthoringDraft` locks (`:296`) before `requireRead` (`:297`). The projection reads readiness through separate JDBC statements | A8: option (ii) |
| B8 | [V] `GuidedSessionEvidenceService.record:120` checks `contextRevision` against the head. `verifyLifecycle` and `sameIdentity` are at `:376/:388` | A11: one extracted derivation; tests in a new sibling IT |
| B9 | [V] `observationCollector.ts`: global MutationObserver count `:42`; focus re-check `:738`; substring withhold `:498-505`. `runtime.ts:163/:201` withhold all non-secret inputs | O lane (A9, A10). AE-01 cannot land until Security & Compliance acknowledges |
| B10 | [V] `launcher.ts:299` `kill()` still uses the synchronous `signalProcessTree`. `browser.ts:540` guided launch has no Studio bound. The control-window sites are `runCoordinator.ts:390/400/404/405` | R1 (j, f–i) and R2 (k) |
| B11 | [V] `StudioCoRunIT` and its six support classes are deleted in the working tree. `tools/corun.sh:60` still references the class | A16: lane F writes a new co-run IT |
| B12 | [V via Quinn] `evaluation/lifecycle.mjs` drives `/compile` and `/confirm-compile` (0 routes in the OpenAPI). The 13 ported cases have no committed pages | B1/B4: benchmark preparation lane EP, off the 011 path |
| B13 | [V] OpenAPI `c053a7f7…` (pre-008). Public `RuntimeVersions` = {playwright, chromium, validator, executor, image}. Flyway head is V21; 008 adds V22 | A7: description-only contract change after 008. Any 009 migration is ≥ V23 |
| B14 | [V] Collector `run-backend-tasked.py` (and the `run-backend.py` it wraps) hard-codes output to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution` and refuses an existing label. Allowed tasks: `test`, `guidedIncrementalTest`, `crossReplicaTest`. Default allows **zero** skips | I use the command form you gave. 009 labels are prefixed `obs009-` so they cannot collide. A copy pointed at a 009 folder is cleaner; root decides |
| B15 | [V] `studio-runner/package.json` pins `packageManager: npm@11.3.0`, hence `--config.package-manager-strict=false`. A subset Vitest run needs `--coverage.enabled=false` (Quinn) | Runner commands below include both |
| B16 | [V] `GuidedSessionService.java` is now `cfb55a54…` (011 F-1 facts were taken at `d10ec5cb…`). The arms moved to `:370/:828/:862/:1424/:1995` | 011 T0 re-verifies (D4) |

## 1. Scope: what "009 local ACs" means here

The 011 start condition (user decision 2026-10-15) names **AC-1–6, AC-11 and AC-12 f–j**. The 015 placements add local work that is **not** on that list but must be planned here: AC-7 AUTHORED-ECHO-01 a–d, AC-7 FOCUS-MUTATION-01 a–d, AC-9 TF-3 and AC-4 TF-5 b.

| AC / item | Local part planned | External part (lane E) | On the 011 start list |
|---|---|---|---|
| AC-1 + P2 | fold, one TLS listener, keys, chart render, image build from the public base, P2 a–d | internal image and ED-05 Node pin, real Deployment | yes |
| AC-2 | chart and profile values, fail-closed negatives, rotation inputs for 010 | G-1 verified in a shared environment | yes |
| AC-3 | runner TLS + client certificate, `validate()`, self-signed-CA IT, client presents the cert | none (G-2 recorded in 010) | yes |
| AC-4 | dump flags and lint, runner Vault-address refusal, DB canary IT, Vault policy **rehearsal** (A18) | dev-Vault policy test (GO-3), TF-5 a/c/e | yes (TF-5 b only if ruled) |
| AC-5 | profile gates and context test, SIEM chart values | SIEM sink | yes |
| AC-6 | lift, G-3, 18 re-enabled, R7, 4 ports, tripwire, R9-OBS-1 record | none | yes |
| AC-11 | co-run legs (new harness), ADJ-1 probe → ruling → implementation, R8.2 d specification, R10c f–h, i, j, k, R1 a–d, REL-001 if placed (A19) | live revocation, worker-profile dispatch on pods, R8.2 e | yes |
| AC-12 f–j | lsof preflight records, `RUNNER_PORT`, `verifyRunnerDist`, startup-hang classification; a–d observation on every full-class run | deployed E2E, final-tree suites | f–j yes |
| AC-7 AE-01 a–d | rule (A10), runner change, fixture tier, joined regression | Security & Compliance acknowledgement before merge; e/f with T4 | no |
| AC-7 FM-01 a–d | rule (A9), runner change, fixture tier, joined regression | e with T4; f hand-off to 010 | no |
| AC-9 TF-3 | ruled read order (A8) and tests | none | no |
| AC-7/8/9/10 remainder | EP preparation only (harness, pages, oracles, B7 measurement) | everything that calls a model | no |

## 2. Per-AC design notes and exact files (009)

Lane codes follow `lanes.json`. Path shorthands: `RS/` = `studio-runner/`; `BM/` = `backend/src/main/java/com/citi/put/checks/studio/`; `BT/` = `backend/src/test/java/com/citi/put/checks/studio/`.

### AC-1 fold, AC-3 runner side, AC-4 runner refusal (D1, runner)
- **Interface drop D1.0** (a document, before code): the launch contract from A2: entrypoint, `KEY_SPECS` delta, TLS file-path keys, guided capacity and policy-hash keys, the probe over TLS, and the readiness signal the backend harness waits for. D2, D3, I and F code against it.
- **Files:** `RS/src/main.ts`; `RS/src/server/{application,server,config,identity,routes}.ts`; `RS/src/probe.ts`; `RS/src/guided/transport.ts` (one listener); `RS/src/run/guidedMain.ts` (deleted); `RS/package.json` (the `start:guided` script only; no dependency change, no lockfile write); tests `RS/test/server/guidedMode.test.ts` (new, ports `test/run/guidedMain.test.ts` by name), `RS/test/server/tlsListener.test.ts` (new), and the existing `RS/test/server/{routes,surface,probe,drain}.test.ts` only where the fold changes them.
- **AC-4:** a case proves `STUDIO_RUNNER_VAULT_ADDRESS` fails startup (unknown key). The RUNNER-SCRATCH startup sweep from 013 is wired into the single process start.
- **No `dist` rebuild in the lane.** The one rebuild happens at the F-merge slot.

### AC-1 chart, AC-2 values, AC-4 dumps, AC-5 SIEM (D2, @devops)
- **Files:** `RS/Dockerfile` (A6 exec-form `ulimit -c 0`); `helm-chart/put-checks/templates/{studio-runner-deployment,studio-runner-service,studio-runner-networkpolicy,deployment,configmap}.yaml`; `values{,-dev,-uat,-prod}.yaml` (keys from D1.0; the mTLS chain secret mounts for both pods; `JAVA_OPTS` dump flags; the SIEM sink reference); tests `RS/test/deployment/{chart,backend-env,envfrom-keys}.test.ts`, `helm.ts`, `image.ts`, plus new `dump-settings.test.ts` and `tls-client-cert.test.ts`.
- `chart.test.ts` adds an assertion that no guided Deployment template exists.
- The R8.2 d alert stays a specification (A15) until @devops names the monitoring stack.

### AC-2/AC-3 backend side, AC-4 canary, AC-5 gates (D3, backend)
- **Interface drop D3.0:** a `BM/dispatch/StudioRunnerTls.java` API, plus `BT/support/RunnerTestTls.java` (one test CA; lane I reads it).
- **Files:**
  - `BM/dispatch/StudioRunnerProperties.java` (`validate()` profile rule);
  - `BM/dispatch/HttpRunnerDispatchClient.java`;
  - `BM/guided/publication/ObservedValidationClient.java` (TLS context only);
  - `BM/guided/session/GuidedSessionConfiguration.java` and `BM/guided/publication/GuidedPublicationConfiguration.java` (TLS wiring only, **after 008 releases them**);
  - `BM/guided/session/GuidedSessionReaper.java` and `BM/guided/translation/GuidedTranslationCoordinator.java` (`@Profile`);
  - `backend/src/main/resources/application{,-api,-worker,-prod,-staging,-dev,-local,-test}.yml`;
  - tests `BT/dispatch/StudioRunnerPropertiesProfileTest.java`, `BT/dispatch/RunnerTlsClientCertIT.java`, `BT/guided/GuidedScheduledBeansProfileTest.java`, `BT/secrets/DatabaseCanaryScanIT.java`, `BT/secrets/VaultPolicyIT.java` (rehearsal or unrun by name; A18). All new.
- `RunnerTlsClientCertIT` proves:
  - submission and bridge traffic succeed only with a trusted client certificate;
  - no certificate, an untrusted CA and plaintext are each refused;
  - the bearer is still required (A3).

### AC-1 P2 (P2 runner, B backend, C9 contract)
- **P2.0 drop:** the new private report key names (A7).
- **P2 files:** `RS/src/versions.ts`; `RS/scripts/write-runtime-versions.mjs` (+`.d.mts`); `RS/src/compat/runtime-versions.ts`; `RS/scripts/check-pins.mjs` (+`.d.mts`); tests `RS/test/{runtime-versions,compat,pins,contract}.test.ts`, `RS/test/reporting/*.test.ts`, and the fixtures-tier tests that read runtime versions, named at start (Quinn H6 lists 20 files). That includes `RS/test/fixtures-tier/helpers/harness.ts`.
- Server tests that also mention runtime versions (`drain`, `surface`, `storage-lifecycle`, `observedReplayRoutes`, `resolved-value-guards`, `timeline`) belong to D1, which applies P2's key rename there. One owner per file.
- **Backend half (lane B):** `BM/internal/RunnerReportProjection.java` (`projectRuntime`). Under A7, `dto/RuntimeVersions.java` and `ExecutionSnapshotMapper` are untouched.
- **C9:** `RuntimeVersions` description and examples, both pins, the ADR-002 §13 row.
- P2 runner and B's `projectRuntime` land **in the same F-merge slot**. Otherwise the projection drops the versions in between.
- **Tripwire:** the AC-1 d grep goes from 19 hits [V via Quinn/Pax] to 0.

### AC-6 (S, backend)
- **Files:**
  - `BM/scheduling/{StudioScheduleProcessor,StudioScheduledDispatchAuthorization,StudioScheduleService}.java`;
  - `BM/guided/publication/{ObservedReplayAuthorization,ObservedReplayRuntimeConfiguration}.java`;
  - `BM/readiness/ExecutionReadinessService.java`;
  - tests `BT/scheduling/StudioScheduleApiIT.java`, `backend/src/test/java/com/citi/put/checks/scheduling/SharedSchedulingIT.java` and `BT/scheduling/ObservedScheduleAuthorityIT.java` (new);
  - `BT/guided/publication/GuidedPublicationReplayIT.java`, tripwire `:18508` only, under a **baton from I**.
- **The unit is atomic:** lift the refusal, remove the 18 `@Disabled`, retire or re-point the 4 ports by name, change the tripwire, and add the R7 conditioned assertion with the acceptance-first case.
- `StudioAcceptanceService` is read-only. The R9-OBS-1 record says whether the stamping changed; it is expected not to.
- The collector's zero-skip default enforces the re-enable mechanically.

### AC-9 TF-3, AC-11 R1, R10c backend, ADJ-1, P2 projection (B, backend)
- **Files:**
  - `BM/StudioService.java` (`readAuthoringDraft` only; A8);
  - `BM/guided/evidence/GuidedSessionEvidenceService.java` and `BM/guided/bridge/GuidedMaterializationService.java` (the extracted `acceptedContextRevisions` only; A11);
  - `BM/internal/RunnerOutcomeCodes.java` and `BM/internal/RunnerReportProjection.java` (R10c post-Ready acceptance A12; `projectRuntime` P2);
  - `BM/internal/ProgressReportService.java` (only if ADJ-1 = (a), C1);
  - tests `BT/StudioServiceWriteAuthorizationTest.java` (add the no-lock case), `BT/StudioReadLockOrderIT.java` (new), `BT/guided/session/GuidedEvidencePendingAppendIT.java` (new), `BT/internal/RunnerReportProjectionTest.java` (extend, including the Pax D-11 `replayFailure: null` case), `BT/dispatch/PreReadyRevocationProbeIT.java` (new).
- Starts after 008 Done, because `RunnerReportProjection` and `ProgressReportService` are 008 A1 files.

### AC-11 j, f–i runner side (R1, runner)
- **Files:** `RS/src/run/launcher.ts` (`kill()` only); `RS/src/run/tree.ts`; `RS/src/server/runCoordinator.ts`; tests `RS/test/run/{launcher,tree,forkKillTree}.test.ts` and `RS/test/server/{cancel,terminal-order,deadline-outcome}.test.ts`, plus a new `RS/test/server/controlWindowLog.test.ts`.
- `kill()` uses the latest asynchronous sample or `readProcessTableAsync`, with signals unchanged. A test proves `spawnSync('ps')` is never reached on the kill path and that a forked browser tree is still killed.

### AC-11 k (R2 runner; I backend teardown)
- **R2 files:** `RS/src/run/browser.ts` (`launchGuidedBrowser` only); `RS/vitest.config.ts` (comment only); new `RS/test/fixtures-tier/guidedLaunchBound.test.ts` and `RS/test/run/guidedBrowserReap.test.ts`.
- Bound and reaping per A13. Record the `ps` listing before and after (read-only; agents never kill processes).

### AC-7 AE-01 and FM-01 local halves; REL-001 (O, runner)
- **Files:** `RS/src/run/observationCollector.ts`; `RS/src/guided/runtime.ts`; `RS/src/guided/ownership.ts` (REL-001 only, if A19 is adopted); tests `RS/test/run/observationCollectorInvoke.test.ts` (the stub extension per A9), new `RS/test/fixtures-tier/{focusMutation,authoredEcho}.test.ts`, `RS/test/guided/runtime.test.ts`; joined ITs `BT/guided/translation/{GuidedFocusMutationJoinedIT,GuidedAuthoredEchoJoinedIT}.java` (new; they use I's harness and run after the F-merge).
- FM-01 lands in W2.
- AE-01 is a **separate, unmerged unit** until the Security & Compliance acknowledgement is recorded (A10). Its dated contract notes go through C9, and the 008 copy removal through FE9.
- Both share one `dist` rebuild if they are ready at the same F-merge. Otherwise AE-01 gets its own serialized rebuild later.

### AC-12 f–j, AC-11 k teardown, the spawn switch for AC-1/AC-3 (I, backend test infrastructure)
- **Interface drop I.0:** the API of `BT/support/RunnerProcessHarness.java` (new). It spawns `dist/main.js` over TLS using `RunnerTestTls`, waits for readiness, records the `dist` digest, and reaps `ProcessHandle.descendants()` on teardown.
- **Files:**
  - `BT/guided/bridge/{GuidedBridgeIntegrationTest,GuidedBridgePlannedIT}.java`;
  - `BT/guided/translation/GuidedPlanningIntegrationTest.java` (also the `RUNNER_PORT` fix at `:3652-3653`; probe at `:3856`);
  - `BT/guided/publication/GuidedPublicationReplayIT.java` (spawn, base URL, teardown; the IPC diagnostic is kept; baton to S afterwards);
  - other runner-spawning tests found by the W0 grep (`ProcessBuilder` users: `ObservedResolverProcessCrashIT`, `GuidedRunnerContextRefusalTest`, `GuidedDispatchContextRefusalTest`, `GuidedSecretByteBodyTest`, `ObservedArtifactLowererTest`), each only if it spawns the runner [I];
  - `backend/build.gradle.kts` (`verifyRunnerDist`, A14).

### AC-11 base co-run legs, RUNNER-LAUNCH (F)
- **Files:** `backend/src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java` (new; A16); `tools/corun.sh`; `tools/corun-report.mjs`; evidence `docs/qa/evidence/studio-observed-authoring/fault-injection.json` (new).
- It runs after the F-merge, on the folded `dist`.
- R1 d (joined owner loss at v(n-1)) and the ADJ-1 joined probe are B's tests. F runs them inside the co-run evidence window and does not edit them.

## 3. 010 and 011 design notes

**010 T2, Live surface (lane T2).**
- Written by @analyst. I cross-check every entry against the tree, because the list is what protects code from 011. @pm accepts.
- It starts after 008 Done (008 L0 edits the runbook). It is finalized against the tree at the 009 local gate (D1).
- The list must name:
  - the actual public routes after 008 and 009, from `openapi.yaml`;
  - the `contracts/v3` documents;
  - the configuration keys, including `studio.execution.enabled` and the on-by-default flags;
  - migrations **V1 through the actual head** (V22, plus V23 if a 009 grant migration lands; the story's "V1–V18" is stale);
  - the chart values;
  - the folded runner's `KEY_SPECS`;
  - the new 009 classes: `StudioRunnerTls`, `RunnerProcessHarness`, `ObservedCoRunIT`, `verifyRunnerDist`.
- T2 also writes the runbook rows that 009 feeds: rotation inputs, dumps, the R8.2 alert specification, and the NTP row.
- T3 (record) and the pilot are not on the 011 path.

**011 (after the 009 local gate and the Live surface list).**
- T0 runs read-only and records the D4 rulings.
- Backend order: F-1 (GS) and the class-A leftovers (LEFT) first. Then the dispatch-client and authorization fold with R9-OBS-3 (FOLD); FOLD owns the 18 test files that reference the fold types. Then the `claim()` split (GS) and the `checkCommand` split (GT), in parallel on different files with serialized proofs. Then the sleep-poll conversion (IT), last, because the split proofs need those ITs unchanged.
- Runner leftovers and the reformat (RT) run once O, P2, R1 and D1 have landed. The reformat skips `runtime.ts` and `observationCollector.ts` while AE-01 is open (D3).
- The frontend leftovers (FE) and the docs (DOC) run in parallel.
- Every deletion is checked against the Live surface list.

## 4. Lanes and disjoint ownership

One owner per file at any time. A **baton** is a handover that root records with the file hash. Full file lists are in `lanes.json`.

| Lane | Story | Agent | Wave | Owns (summary) |
|---|---|---|---|---|
| W0 | 009 | root (@aiox-master) | W0 | re-baseline, collector labels, skip file (QA authors), Docker/JDK/memory check |
| T0 | 009 | @architect, @qa, @po, @devops | W0 | rulings A1–A19, the prerequisite register, corpus/budget drafts (already drafted by Quinn and Pax) |
| C9 | 009 | @dev contract integrator | W1, W3 slot | `openapi.yaml` `RuntimeVersions`, both pins, ADR-002 §13, AE-01 dated notes |
| D1 | 009 | @dev runner + @devops | W2 | runner entry, server, probe, transport, guidedMain delete, server tests |
| D2 | 009 | @devops + @dev | W2 | Dockerfile, chart templates and values, deployment tier |
| D3 | 009 | @dev backend | W2 (after 008) | runner TLS, properties, profile gates, profiles yml, canary/Vault ITs |
| P2 | 009 | @dev runner | W2 | `versions.ts`, scripts, compat, P2 tests, fixtures harness |
| R1 | 009 | @dev runner | W2 | launcher `kill()`, `tree.ts`, `runCoordinator.ts` |
| R2 | 009 | @dev runner | W2 | `browser.ts` guided launch, vitest comment |
| O | 009 | @dev runner | W2 (FM), W3+ (AE) | collector, guided runtime, ownership, joined ITs |
| S | 009 | @dev backend | W2 code, W3 runs | scheduling, replay authorization, readiness, schedule ITs, ReplayIT tripwire (baton) |
| B | 009 | @dev backend | W2 (after 008) | StudioService read, evidence service, projection, outcome codes |
| I | 009 | @dev backend test infra | W1 drop, W2 | spawn harness, the 4 hot ITs, `build.gradle.kts` |
| F | 009 | @dev + @qa | W3 | new co-run IT, `tools/corun*` |
| EP | 009 | @dev + @qa | W4 (optional) | `evaluation/**`, pages, oracles, `GuidedSchemaProbeIT`, B7 measurement |
| FE9 | 009 | @dev frontend | after AE-01 lands | 008 KL-015-Q4 copy removal |
| E | 009 | @dev, @devops, @qa | when U2–U8 arrive | live and external halves |
| G9 | 009 | root, then @qa | W5 | serialized local gate and the QA local-validation record |
| T2 | 010 | @analyst, @architect, @pm | draft W2, final after G9 | runbook and Live surface |
| T3 | 010 | @analyst | after G9 | release-readiness record, 10.34 note |
| PILOT | 010 | @analyst + user | external | pilot, focus probe |
| 11-T0 … 11-G | 011 | see `lanes.json` | 011 W0–W5 | GS, LEFT, FOLD, GT, RT, FE, IT, DOC |

**Shared files with one owner:** the four spawning ITs (I, with a ReplayIT baton to S); `RunnerReportProjection.java` (B); the server tests touched by P2's key rename (D1); `application*.yml` (D3); `helm-chart/**` (D2); `openapi.yaml` and the pins (C9, after 008 L0 releases them); `fixtures-tier/helpers/harness.ts` (P2; R2 and O add new helper files instead of editing it).

## 5. Waves, critical path, and what can run beside 008

| Wave | Content | Exit |
|---|---|---|
| **G-015** | 015 attempt04 → QA verdict → PO and root close | 015 Done |
| **008** | 008 W0–W5 (`STUDIO-OBS-008/prep-20261016`) | 008 Done |
| **W0** | Re-baseline: hashes, OpenAPI digest, Flyway head, the spawning-IT grep. A1–A19 recorded. QA writes the 7-entry approved-skips file for the 009 final runs. Docker, JDK 21, free memory. `obs009-` collector labels (or a 009 collector copy) | all recorded |
| **W1** | C9 contract unit (`RuntimeVersions` description, pins, ADR row). Interface drops D1.0, D3.0, I.0, P2.0 | contract self-checks green; drops integrated; type-check green |
| **W2** | D1 ∥ D2 ∥ D3 ∥ P2 ∥ R1 ∥ R2 ∥ O-FM ∥ S (code) ∥ B (code) ∥ I. Vitest per lane; Gradle serialized by root; I lands first in the backend window | each lane's focused checks green |
| **F-merge** (root, serialized) | One `dist` rebuild. D1 fold, I spawn switch and D3 TLS land together; P2 and B `projectRuntime` land together. Batons: ReplayIT I→S | expected-red ledger empty |
| **W3** | S full schedule and ReplayIT runs. B joined (R1 d, ADJ-1 probe → C1 ruling → implementation). F co-run. O joined ITs. AE-01 if acknowledged (C9 notes, then FE9) | full-class greens recorded with `dist` digest and lsof preflight |
| **W4** (optional) | EP benchmark preparation; it does not gate 011 | — |
| **G9** | Serialized local gate (§6), then the independent QA local-validation record (D2) | record issued |
| **010 T2** | Live surface list finalized and accepted | list dated |
| **011** | T0 → W1 (GS F-1 ∥ LEFT ∥ RT ∥ FE ∥ DOC) → W2 FOLD → W3 GS split ∥ GT → W4 IT → W5 G | QA Done |

**Expected-red ledger (W2 → F-merge).**
- The four spawning ITs go red when D1's fold lands without I's switch, so they land in one slot.
- Projection tests that read `runtime` go red if P2 lands without B, so they also land in one slot.
- The 18 schedule tests and the ReplayIT tripwire are atomic inside S.
- If root prefers a tree that is never red, collapse W2's runner and backend landings into the F-merge slot. Coding stays parallel.

**Critical path.**
G-015 → 008 Done → W0 rulings → D1.0 / I.0 drops → D1 fold + I spawn and TLS switch + D3 → F-merge `dist` rebuild → S full ReplayIT and schedule runs, and F co-run → G9 serialized backend `check` (about 1.5 h per attempt at 015's 5,366–5,650 s) → QA record → 010 Live surface → 011 T0.

The real limiter is **serialized Gradle under memory pressure**, not coding. ReplayIT is class-scoped and order-dependent, so only full-class runs count.

**Running beside 008.**
- **With no new decision:** only read-only work under `docs/qa/evidence/` can overlap. That means the T0 rulings, the register, Quinn's corpus and budget drafts, the EP harness design, and a 010 Live-surface skeleton.
- **With A1's optional user decision**, after 015 Done and 008 W1: D1 (code only), D2, P2, R1, R2 and O-FM can run beside 008 W2–W5. They are file-disjoint from 008, except 008 L0's pin line, which is released after 008 W1. The conditions: Vitest only, no `dist` rebuild, no Gradle.
- **Never beside 008:** C9, D3, B (they use 008 L0/L1 files), I, S and F (they need Gradle windows and the rebuilt `dist`), FE9 and T2.

**Collisions with 008, by file.**
- `openapi.yaml`, `StudioContractTest` pin, `confinement.test.ts` pin: 008 L0 → C9.
- `RunnerReportProjection`, `ProgressReportService`, `GuidedSessionConfiguration`, `GuidedPublicationConfiguration`: 008 L1 → B and D3.
- `docs/runbooks/studio-guided-authoring.md`: 008 L0 → 010 T2.
- `frontend/src/components/studio/guided/guidedNarratives.ts`: 008 L5a/L5b → FE9.
- `frontend/playwright.config.ts` and `frontend/e2e/`: 008 L3/L6 → E.
- Flyway: 008 V22 → any 009 migration is V23 or later.
- `studio-runner/dist`: a runtime artifact. No 009 rebuild until 008's final gate receipt.

## 6. Verification commands

Notation:
- Backend: `BK <label> <tasks> -- <gradle args>` expands to `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py <label> --test-tasks <tasks> --require-exec-tasks <tasks> -- --no-daemon <gradle args>`.
- Runner and frontend: `PN` = `pnpm --config.package-manager-strict=false run`.
- Every command is **PLANNED_NOT_RUN**. Each backend run records the lsof preflight (AC-12 g).

| Lane | Narrowest command |
|---|---|
| C9 | `node tools/check-studio-observed-contracts.cjs`; `node tools/build-studio-observed-schemas.cjs --check`; `cd studio-runner && PN test test/run/confinement.test.ts --coverage.enabled=false`; `BK obs009-c9-pins01 test -- test --tests 'com.citi.put.checks.studio.StudioContractTest'` |
| D1 | `cd studio-runner && PN test test/server/guidedMode.test.ts test/server/tlsListener.test.ts test/server/routes.test.ts test/server/surface.test.ts test/server/probe.test.ts test/server/drain.test.ts --coverage.enabled=false`; `PN type-check`; `PN lint` |
| D2 | `cd studio-runner && PN test:deployment test/deployment/chart.test.ts test/deployment/dump-settings.test.ts test/deployment/tls-client-cert.test.ts test/deployment/envfrom-keys.test.ts test/deployment/backend-env.test.ts` |
| D3 | `BK obs009-d3-01 test -- test --tests 'com.citi.put.checks.studio.dispatch.StudioRunnerPropertiesProfileTest' --tests 'com.citi.put.checks.studio.dispatch.RunnerTlsClientCertIT' --tests 'com.citi.put.checks.studio.guided.GuidedScheduledBeansProfileTest' --tests 'com.citi.put.checks.studio.secrets.DatabaseCanaryScanIT'` |
| P2 | `cd studio-runner && PN test test/runtime-versions.test.ts test/compat.test.ts test/pins.test.ts test/contract.test.ts --coverage.enabled=false`; `PN check:pins`; `grep -rn "ARTIFACT_VERSION\|VALIDATOR_SCHEMA_VERSION\|SYNTAX_REFERENCE_VERSION\|VALIDATOR_PARSER\|EXECUTOR_VERSION" studio-runner/src studio-runner/scripts` → 0 |
| R1 | `cd studio-runner && PN test test/run/launcher.test.ts test/run/tree.test.ts test/run/forkKillTree.test.ts test/server/cancel.test.ts test/server/terminal-order.test.ts test/server/deadline-outcome.test.ts test/server/controlWindowLog.test.ts --coverage.enabled=false` |
| R2 | `cd studio-runner && PN test:fixtures test/fixtures-tier/guidedLaunchBound.test.ts`; `PN test test/run/guidedBrowserReap.test.ts --coverage.enabled=false`; `ps -axo pid,ppid,command \| grep checks-guided` before and after (read-only) |
| O | `cd studio-runner && PN test test/run/observationCollectorInvoke.test.ts test/guided/runtime.test.ts --coverage.enabled=false`; `PN test:fixtures test/fixtures-tier/focusMutation.test.ts test/fixtures-tier/authoredEcho.test.ts`; after the F-merge: `BK obs009-o-joined01 test -- test --tests 'com.citi.put.checks.studio.guided.translation.GuidedFocusMutationJoinedIT' --tests 'com.citi.put.checks.studio.guided.translation.GuidedAuthoredEchoJoinedIT'` |
| S | `BK obs009-s-sched01 test -- test --tests 'com.citi.put.checks.studio.scheduling.StudioScheduleApiIT' --tests 'com.citi.put.checks.scheduling.SharedSchedulingIT' --tests 'com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT'`, then alone: `BK obs009-s-replay01 test -- test --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'` (full class only); tripwires `grep -rn '@Disabled' backend/src/test` = 6 and `grep -rn 'DEFERRED STUDIO-OBS-009' backend/src/test` = 0 |
| B | `BK obs009-b-01 test -- test --tests 'com.citi.put.checks.studio.StudioServiceWriteAuthorizationTest' --tests 'com.citi.put.checks.studio.StudioReadLockOrderIT' --tests '*StudioVisibilityIT' --tests '*StudioAuthorizationIT' --tests '*RunnerReportProjectionTest' --tests 'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendIT' --tests '*GuidedSessionEvidenceTest'`; ADJ-1: `BK obs009-b-adj1-probe01 test -- test --tests 'com.citi.put.checks.studio.dispatch.PreReadyRevocationProbeIT'` (expected red before the ruling) |
| I | `BK obs009-i-bridge01 test -- verifyRunnerDist test --tests 'com.citi.put.checks.studio.guided.bridge.GuidedBridgeIntegrationTest' --tests 'com.citi.put.checks.studio.guided.bridge.GuidedBridgePlannedIT' --tests 'com.citi.put.checks.studio.guided.translation.GuidedPlanningIntegrationTest'`; then ReplayIT alone as in S. Add `guidedIncrementalTest` to `--test-tasks` for any class that lane partitions |
| F | `BK obs009-f-corun01 test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT'`; `bash tools/corun.sh --skip-build` only after it is re-pointed |
| EP | `cd studio-runner && PN test test/evaluation --coverage.enabled=false`; B7 measurement: `BK obs009-ep-budget01 guidedIncrementalTest -- guidedIncrementalTest --tests '<10-step cases at production ceilings, named when written>'` |
| FE9 | `cd frontend && PN test run src/components/studio/guided --maxWorkers=2`; `PN type-check`; `grep -rn "<copy key>" frontend/src` → 0 |
| G9 | Serialized: `cd studio-runner && PN type-check && PN lint && PN test && PN test:fixtures && PN test:deployment && PN check:pins`; `node tools/check-studio-observed-contracts.cjs`; `BK obs009-local-check01 test,guidedIncrementalTest,crossReplicaTest -- --continue check --rerun-tasks` with `--allowed-skips-file <QA's 7-entry file>` (expected skips 7; JaCoCo and `requireFreshGuidedPartitions` must execute); `cd frontend && PN type-check && PN lint && PN test run` |
| 010 T2 | Checklist: every runbook row cites evidence; every Live-surface entry is grepped in the tree (command recorded per entry) |
| 011 | Per lane in `lanes.json`; final `BK obs011-check01 …` as G9, plus the independent QA symbol grep |

## 7. Risks

| Risk | Mitigation |
|---|---|
| 015 attempt04 fails, or 008 slips. Everything waits | W0 is gated. Only read-only preparation proceeds |
| AC-3's TLS change ripples through every runner-spawning IT, including the 21k-line ReplayIT | One shared harness (I.0) and one atomic F-merge. Full-class runs only |
| The worker profile cannot build the coordinator's graph (A5) | The context test is the first D3 check. Stop and escalate; no `!worker` widening |
| AE-01's Security & Compliance acknowledgement never arrives | AE-01 stays unmerged and does not block 011. T4 follows story rule e |
| A 10-step learn exceeds 7 proposals at production ceilings (B7) [I] | Local fixture-provider measurement in EP before T4. MODEL-SIZING ruling with @pm |
| Host memory and Gradle serialization dominate the schedule | One Gradle at a time; host idle for the full-class runs (015 lesson). No single-test ReplayIT credit |
| R10c changes the shape the A1 drift derivation keys on (Pax D-11) | A12 item 4 and a pinned `RunnerReportProjectionTest` case |
| 011 cleans files that a later live finding (AC-7/8/10) needs to change | One owner at a time; the D3 exclusions; the Live surface list |
| Collector output lands in the 015 folder (B14) | `obs009-` labels, or a root-made 009 copy |

## 8. Not claimed

No implementation, test, build, migration, ruling or lifecycle change. Every test named here is PLANNED_NOT_RUN. Quinn's and Pax's facts are attributed as "via"; the facts I re-checked are marked [V].

---

## W0 refold 2026-10-17

- **Author:** Aria (@architect). Append-only: everything above stays as written; where it disagrees with this section, this section governs. Machine-readable twin: `lanes.json` → `w0Refold20261017`. Rulings: `t0-rulings/ruling.md` (inputs with sha256 in `t0-rulings/manifest.json`).
- **Assumption:** every 009 source lane starts after STUDIO-OBS-008 Done (root has not taken t0 A1). Only docs work (group NOW) runs beside 008 W3–W5.
- No source edit, no command run beyond read-only `ls`/`grep`/`sed`/`shasum`/`git` reads and one scratchpad overlap script. Every command below is PLANNED_NOT_RUN.

### R9.1 Re-baseline (verified 2026-10-17)

| Item | Today | Consequence |
|---|---|---|
| Stories | 015 Done (CONCERNS); 008 InProgress, F1 GREEN 19:45 EDT (656/656; FE 1200/1200), W3 running | W0 waits for 008 Done |
| Flyway head | `V22__execution_replay_failure.sql` | 009 migrations are V23+ (none planned by default) |
| Contract | `openapi.yaml` `b5ecdcad…`, 44 operations, `GET /tests/{id}/capabilities`; pins `StudioContractTest.java:89-91` (op count `:340-341`) and `confinement.test.ts:293-294` | C9 re-anchors from `b5ecdcad…`; 44 stays |
| 008 surfaces | `ExecutionSnapshot.replayFailure`, `ReplayFailure`, `GuidedPublicPresentationProjector`, KL-015-Q4 copy `authoredLiteralTargetNotFound` | B keeps the A1 derivation; FE9 removes the copy after AE-01 |
| Package managers | frontend pnpm (`node-linker=hoisted`, Playwright 1.63.0, `frontend/e2e` harness); runner still npm-locked | pnpm only; runner via `pnpm --config.package-manager-strict=false`; no installs |
| Node | runner `.nvmrc` 24; N24 path `v24.20.0` | N24 on every runner and backend command |
| dist | `897182d5…` since the 015 close | no 009 rebuild before 008's final-gate receipt |
| Landed in 015 | REL-001 diagnostics; D4 12 s start budget and argv-marker teardown; N24 | dropped from lanes O and R2 |

### R9.2 What changed in the plan

- **Dropped:** REL-001 from O; the launch bound from R2; drop P2.0 key renames; I's per-IT digest metadata; ED-05; the frontend pnpm migration; wave G-015; the 008 file collisions that 008 already released (they are now plain sequence after 008 Done).
- **Added:** A2.6 single-replica guard and two-browser pod sizing (D2; root R1); PID-1 a (D1) and b/c (D2); KL-015-D5 as probe (W1) → ruling (W1.5) → R2; LIFECYCLE-REASON-01 (new lane BL, no tolerance); lane DE for the TF-5 b privilege delta; W1 probes for R1 a and ADJ-1 a; FE9's key; D3 edits `GuidedTranslationConfiguration` (the coordinator is a `@Bean`); C9 also covers `ReportedRuntimeVersions` and four examples; AE-01 waits for U13 and takes `runtime.ts` from R2 by baton.

### R9.3 Collisions with 008

Only 008 W3–W5 write sets are live: L5b (`frontend/src/pages/**`, `components/studio/{run,runs,guided,evidence,templates}/**` and three batoned files), L6-author/L6 (`frontend/e2e/*.spec.ts`, `playwright.config.ts`, `e2e/start-servers.mjs`, the jsdom audit and `axe-results.json`), and W5 gates and reviews. Group NOW writes only `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/**`, the 009 story (Pax) and optionally `docs/qa/evidence/STUDIO-OBS-010/live-surface-skeleton/**`: **0 overlaps** with them. Later 009 lanes on live 008 paths: FE9 only (four L5b files), after 008 Done. Lane E's e2e spec and `playwright.config.ts` also wait for 008 Done. The F-merge `dist` rebuild waits for 008's final backend-gate receipt; Gradle shares one lock with 008.

### R9.4 Lanes and waves after 008 Done

| Wave | Lanes (agent) | Exit |
|---|---|---|
| NOW (beside 008) | T0-AR (aiox-architect), T0-QA (aiox-qa: EDGE decision, corpus, skip draft), T0-PO (aiox-po notes), T2-SK (aiox-analyst, optional, not T2); root sends the U13 request | rulings + batch raised |
| W0 | W0 (root), QA-W0 (aiox-qa approved-skips) | baseline; R1–R7, A17 recorded |
| W1 ∥ | C9 (aiox-dev), D1.0 (aiox-dev + aiox-devops), D3.0, I.0, PR-RT (D5 probe), PR-BE (R1 + ADJ-1 probes) (aiox-dev) | contract re-anchored; drops accepted; probes recorded |
| W1.5 | AR-W1 (aiox-architect): D5, C1, R1 go/no-go | rulings dated |
| W2 ∥ (12) | D1, P2, R1, R2, O-FM (aiox-dev runner); D2 (aiox-devops + aiox-dev); D3, S, B, BL, I (aiox-dev backend); DE (aiox-data-engineer) | focused checks green on src; no rebuild |
| F-merge | root: one `dist` rebuild; atomic D1+I+D3, P2+B, R1+B; baton ReplayIT I→S | expected-red ledger empty |
| W3 ∥ | S-W3, B-W3, F (+aiox-qa reproduces), O-FM-W3, EP (optional), O-AE + C9-AE (only after U13), FE9 (after O-AE) | full-class greens with the F-merge digest |
| W5 | G9: root serialized gates, then aiox-qa local-validation record | record = 010 T2 trigger |
| then | 010 T2 (aiox-analyst; architect cross-check; pm accepts) → 011 T0 | dated Live surface list |

Critical path: 008 Done → W0 → C9 ∥ drops ∥ probes → W1.5 → D1 + D3 + I (and R2 for D5) → F-merge → S-W3 ReplayIT full class and F co-run → G9 serialized `check` (about 1.5 h per attempt on 015's measure) → QA record → T2 → 011 T0. Gradle under memory pressure is the limiter; root caps active W2 agents (R7).

Batons (sequential, never concurrent): `StudioRunnerTls`/`RunnerTestTls` D3.0→D3; `RunnerProcessHarness(+Test)` I.0→I; `guidedCloseProbe.test.ts` PR-RT→R2; the two probe ITs PR-BE→B→B-W3; `GuidedPublicationReplayIT` I→S-W3; `runtime.ts` and `runtime.test.ts` R2→O-AE; `tree.ts` stays R1's (R2 asks by baton if D5 needs it).

### R9.5 Local versus external, per AC

| AC / half | Local now (lane) | Blocked half | Blocker → owner |
|---|---|---|---|
| AC-1 | fold, keys, enable switch, PID-1 a–c, single-replica guard, chart, P2 a–d (D1, D2, P2, B, C9) | PID-1 d deployed pid; internal image; real Deployment | U4, U12 → Platform/SRE + @devops |
| AC-2 | values, fail-closed negatives, audiences, rotation inputs (D1, D2, D3) | G-1 in a shared environment | U4 → Platform/SRE + @devops |
| AC-3 | all (D1, D3, I) | — (G-2 recorded in 010) | — |
| AC-4 | dumps + lint, Vault-address refusal, DB canary, TF-5 b delta check, Vault rehearsal non-credited (D1, D2, D3, DE) | dev-Vault policy test (GO-3); TF-5 a/c/e; TF-5 b grant if non-owner; backend core rlimit | U5 → PUT Core/BFF; U14 → Platform DBA/@devops; U4; Platform/SRE; R5 → user |
| AC-5 | profile gates, SIEM values (D3, D2) | SIEM sink live | U6 → Platform/SRE |
| AC-6 | all (S, S-W3) | — | A17 → user (confirm Q2 default) |
| AC-7 FM-01 | a ruled; b–d (O-FM) | e (T4); f (010 pilot) | T4 externals; pilot → user |
| AC-7 AE-01 | a ruled; b–d, f after U13 (O-AE, C9-AE, FE9) | a acknowledgement; e (T4) | U13 → Security & Compliance |
| AC-7 benchmark + RS-1 | manifest, RS-1 marks, harness self-test, B7 measurement (EP) | every real-model run; staging half | U2 → ED-01 owner (user names); U7 + B8 R → user, price → ED-01 owner; U4; U3 → user/app owner; MODEL-SIZING → @architect + @pm |
| AC-8 | probe code (EP) | probe run | U2, U7 |
| AC-9 | TF-3 (B); isolation/mutation with fixture provider (EP) | real-model guard refusals | U2, U4, U7 |
| AC-10 | canary scanner on local traffic (EP, O-AE) | live gateway bytes; C-17 | U2, U4; U8 → user, U3 |
| AC-11 | co-run legs, ADJ-1, R8.2 d, R10c, i, j, k residue, R1, D5, LR, EDGE if asked, REL-001 classification (F, B, R1, R2, I, BL, D2) | live revocation per real poll; worker dispatch on pods; R8.2 e; alert firing | U4 → Platform/SRE + @devops; monitoring stack → @devops |
| AC-12 | f–j, a–d observation, 15 s-edge rule, all local suites, local E2E labelled local (I, S-W3, F, G9) | deployed real-browser E2E with a real model | U4, U2 |

### R9.6 Write-overlap check

Script: scratchpad `refold009.py` over the 35 lane write sets in `lanes.json` → `w0Refold20261017.lanes`. Method: pairwise per concurrency group, segment by segment (literal equality, fnmatch of a literal against a wildcard segment, `**` matches any remainder); `<date>` is a wildcard; collector receipts under `execution-<date>/execution/` are an append-only sink with unique labels and are excluded. Self-test: a literal inside a glob is flagged; distinct evidence folders are not; moving O-AE into W2 produces 2 overlaps with R2 (`runtime.ts`, `runtime.test.ts`).

| Group | Lanes | Overlaps |
|---|---|---|
| NOW | 4 | 0 (and 0 against the live 008 W3–W5 write sets) |
| W0 | 2 | 0 |
| W1 | 6 | 0 |
| W1.5 | 1 | 0 |
| W2 | 12 | 0 |
| F-merge | 1 | 0 |
| W3 | 8 | 0 |
| W5 | 1 | 0 |

### R9.7 Verify commands

Notation (from the repo root unless `cd` is shown):
- `N24` = `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`
- `LOCK` = `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py`
- `BK <label> <tasks> -- <args>` = `N24; LOCK python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-<label> --test-tasks <tasks> -- <args> --no-daemon`
- `RF <files>` = `cd studio-runner && N24; pnpm --config.package-manager-strict=false exec vitest run <files> --coverage.enabled=false --minWorkers=1 --maxWorkers=2`
- `RFX <files>` = same with `--config vitest.fixtures.config.ts … --minWorkers=1 --maxWorkers=1`; `RDP` = same with `--config vitest.deployment.config.ts … --minWorkers=1 --maxWorkers=1`
- `RR <label> <args>` = `N24; python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-runner.py obs009-<label> pnpm --config.package-manager-strict=false exec vitest run <args>` (evidence; needs root edit R2)
- `FE <paths>` = `cd frontend && pnpm exec vitest run <paths> --minWorkers=1 --maxWorkers=3`
- The `execute-009` copies are root's (R2): output path `docs/qa/evidence/STUDIO-OBS-009/execution-<date>/execution`, runner build with pnpm, vitest detection beyond `command[0]`. Record `lsof -nP -iTCP -sTCP:LISTEN` before every backend run.

| Lane | Narrowest check |
|---|---|
| C9 | `N24; node -e "require('./tools/build-studio-observed-schemas.cjs').check()"`; `N24; node tools/check-studio-observed-contracts.cjs`; `shasum -a 256 docs/specs/studio/openapi.yaml`; `RR c9-confinement01 test/run/confinement.test.ts --coverage.enabled=false --minWorkers=1 --maxWorkers=1`; `BK c9-pins01 test -- test --tests 'com.citi.put.checks.studio.StudioContractTest'` |
| D3.0 / I.0 | `BK d3-api01 test -- test --tests '…dispatch.StudioRunnerTlsTest'`; `BK i-api01 test -- test --tests '…support.RunnerProcessHarnessTest'` |
| PR-RT | `RFX test/fixtures-tier/guidedCloseProbe.test.ts`; `ps -axo pid,ppid,command \| grep checks-guided` before/after (read-only) |
| PR-BE | `BK prbe-r1-01 test -- test --tests '…guided.session.GuidedEvidencePendingAppendIT'`; `BK prbe-adj1-01 test -- test --tests '…dispatch.PreReadyRevocationProbeIT'` |
| D1 | `RF test/server/{guidedMode,tlsListener,routes,surface,probe,drain,storage-lifecycle,observedReplayRoutes,observedReplayAdmission,resolved-value-guards,timeline}.test.ts test/guided/transport.test.ts`; `cd studio-runner && N24; pnpm --config.package-manager-strict=false run type-check && pnpm --config.package-manager-strict=false run lint`; grep `guidedMain\|start:guided\|STUDIO_GUIDED_CONFIG_FILE` in `studio-runner/src` and `package.json` = 0 |
| D2 | `RDP test/deployment/{chart,dump-settings,tls-client-cert,envfrom-keys,backend-env,scaling}.test.ts`; image smoke (`--init` pid ≠ 1, no-init `CONFIGURATION_DENIED`, `docker stop` drain lines) only with R5 authorization, else "unrun" |
| D3 | `BK d3-01 test -- test --tests '…dispatch.StudioRunnerPropertiesProfileTest' --tests '…dispatch.RunnerTlsClientCertIT' --tests '…dispatch.StudioRunnerTlsTest' --tests '…guided.GuidedScheduledBeansProfileTest' --tests '…secrets.DatabaseCanaryScanIT' --tests '…dispatch.HttpRunnerDispatchClientTest'`; grep `SSLContext.getDefault` in `backend/src/main/java/com/citi/put/checks/studio` = 0 |
| P2 | `RF test/{runtime-versions,compat,pins,contract}.test.ts test/reporting/{observedProgressUse,reporting}.test.ts test/run/manifest.test.ts`; `RFX test/fixtures-tier/{observed-bootstrap-process-tree,observed-bootstrap-video,observed-replay,observed-secret-control}.test.ts`; `check:pins`; AC-1 d grep = 0 (19 today) |
| R1 | `RF test/run/{launcher,tree,forkKillTree}.test.ts test/server/{cancel,terminal-order,deadline-outcome,controlWindowLog}.test.ts test/reporting/terminalAbandoned.test.ts` |
| R2 | `RF test/guided/{runtime,ownership,browser}.test.ts test/run/guidedBrowserReap.test.ts`; `RFX test/fixtures-tier/{guidedCloseProbe,guidedCloseBound}.test.ts`; `ps` before/after |
| O-FM | `RF test/run/observationCollectorInvoke.test.ts`; `RFX test/fixtures-tier/focusMutation.test.ts`; after F-merge `BK ofm-joined01 test -- test --tests '…guided.translation.GuidedFocusMutationJoinedIT'` |
| S | `BK s-sched01 test -- test --tests '…studio.scheduling.StudioScheduleApiIT' --tests 'com.citi.put.checks.scheduling.SharedSchedulingIT' --tests '…studio.scheduling.ObservedScheduleAuthorityIT'`; `@Disabled` = 6; `DEFERRED STUDIO-OBS-009` = 0; `studio.updateTest(` = 0; W3: `BK s-replay01 test -- test --tests '…guided.publication.GuidedPublicationReplayIT'` alone, full class |
| B | `BK b-01 test -- test --tests '…StudioServiceWriteAuthorizationTest' --tests '…StudioReadLockOrderIT' --tests '*StudioVisibilityIT' --tests '*StudioAuthorizationIT' --tests '…internal.RunnerReportProjectionTest' --tests '*GuidedSessionEvidenceTest' --tests '…guided.session.GuidedEvidencePendingAppendIT'`; one `boolean sameIdentity` body; W3 `BK b-joined01 …` |
| BL | `BK bl-01 test -- test --tests '…guided.session.GuidedLifecycleReasonIT' --tests '…guided.session.GuidedSessionIT' --tests '…guided.session.GuidedServiceTransportFaultIT'` (add `guidedIncrementalTest` if partitioned) |
| DE | `BK de-01 test -- test --tests '…guided.secret.GuidedRuntimeRolePrivilegeIT' --tests '…guided.secret.SecretUseAuditIT'` |
| I | W2: `BK i-api02 test -- test --tests '…support.RunnerProcessHarnessTest'` (switched ITs are expected red against the old dist; compile only) |
| F-merge | `N24; python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-runner-build.py obs009-fmerge-build01`; `BK fmerge-bridge01 test -- verifyRunnerDist test --tests '…GuidedBridgeIntegrationTest' --tests '…GuidedBridgePlannedIT' --tests '…GuidedPlanningIntegrationTest' --tests '…RunnerTlsClientCertIT'` |
| F | `BK f-corun01 test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT'`; `N24; bash tools/corun.sh --skip-build` after the re-point |
| EP | `RF test/evaluation`; `BK ep-probe01 test -- test --tests '…GuidedSchemaProbeIT'` (records `UNAVAILABLE_NOT_RUN` without ED-01, never a pass) |
| O-AE | `RF test/guided/runtime.test.ts test/run/canary.test.ts`; `RFX test/fixtures-tier/authoredEcho.test.ts`; `BK oae-joined01 test -- test --tests '…GuidedAuthoredEchoJoinedIT' --tests '*GuidedGatewayPrivacyTest' --tests '*GuidedSecretByteBodyTest'` (own serialized rebuild if after F-merge) |
| FE9 | `FE src/components/studio/guided src/pages/ChecksStudioPage`; `cd frontend && pnpm run type-check && pnpm run lint`; grep `authoredLiteralTargetNotFound` in `frontend/src` = 0 |
| G9 | `RR g9-runner-unit01 --minWorkers=1 --maxWorkers=2`; `RR g9-runner-fixtures01 --config vitest.fixtures.config.ts --minWorkers=1 --maxWorkers=1`; `RR g9-runner-deploy01 --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1`; runner type-check, lint, `check:pins`; contracts check; `N24; LOCK python3 …/execute-009/run-backend-tasked.py obs009-g9-check01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest,crossReplicaTest --allowed-skips-file <QA file> -- --continue check --rerun-tasks --no-daemon` (JaCoCo and `requireFreshGuidedPartitions` must execute); `cd frontend && pnpm run type-check && pnpm run lint && pnpm exec vitest run --minWorkers=1 --maxWorkers=3 && pnpm run build` |

### R9.8 Triggers for 010 and 011

- **010 T2 starts at G9 exit:** the independent @qa local-validation record over the 011 start-list local halves at one source digest (010 dependency note D-1; 011 clarification S-2). T2-SK work before that is not T2 and has no status effect.
- **011 starts** when G9 has exited **and** the dated Live surface list, measured at G9 and accepted by @pm, exists. It counts AC-1–6, AC-11 including R1 a–d, D5 a–f and LR a–c, and AC-12 f–j. It does not count TF-3, FM-01, AE-01, EDGE, PID-1, the REL-001 pointer or the 15 s-edge rule.
- After 011 starts: `guided/runtime.ts` stays out of 011's reformat while O-AE is open; `GuidedSessionService.java` passes to 011 (CLN-F1, C-OBS008-1) only after BL lands.

### R9.9 Risks

| Risk | Mitigation |
|---|---|
| A2.6: one replica in guided-enabled environments | Root R1; disclosed in 010; scale-out to GA G-4 |
| D5 probe shows no hang on some path | The ruling still decides (story D5 c); no silent close |
| U13 never arrives | O-AE, C9-AE, FE9 stay unstarted; 011 unaffected; T4 follows story rule e |
| 12 parallel W2 lanes on a memory-short host | R7 cap; Gradle lock; small Vitest worker counts |
| The worker profile cannot build the reaper/coordinator graph | First D3 check; stop and escalate (A5) |
| 008 W5 changes the contract or the dist after this baseline | W0 re-measures openapi digest, head and dist digest before C9 |

### R9.10 Not claimed

No implementation, test, build, migration, lifecycle or story change. The overlap counts come from the scratchpad script over the lane data above, not from the tree.
