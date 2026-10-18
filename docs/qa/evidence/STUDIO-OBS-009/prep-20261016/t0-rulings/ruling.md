# STUDIO-OBS-009 T0 rulings (2026-10-17)

- **Author:** Aria (@architect). **Mode:** YOLO, docs only, beside STUDIO-OBS-008 W3.
- **Writes:** this file, `manifest.json` and `w0-refold.md` in this directory. I also appended `w0Refold20261017` to `../lanes.json` and a "W0 refold 2026-10-17" section to `../implementation-plan.md`. No source, story, spec or git change.
- **What I ran:** `ls`, `grep`, `sed -n`, `wc -l`, `shasum -a 256`, `git status --short`, `git ls-files`, `git diff --stat`, small read-only `node -e`/`python3 -c` readers, and one scratchpad Python script for the write-overlap check (pure data). No Gradle, test, build, install, Docker, database or model call.
- **Inputs:** listed with sha256 in `manifest.json`. The rulings re-issue `../t0-questions.md` (2026-10-16) against today's tree.
- **Legend:** [V] verified by reading the file or running the command; [I] inference; **Δ** changed since the 2026-10-16 questions or plan.
- **Binding:** each ruling below is binding for the 009 lanes from now. Where a ruling waits for a probe, it says so.

## 0. Baseline deltas re-verified today

| # | Fact today | Was (2026-10-16) | Source |
|---|---|---|---|
| Δ1 | Flyway head `V22__execution_replay_failure.sql`; any 009 migration is V23+ | V21 | [V] `ls backend/src/main/resources/db/migration \| sort -V` |
| Δ2 | `openapi.yaml` sha256 `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`, 36 paths, 44 operations incl. `GET /tests/{id}/capabilities` | `c053a7f7…`, 43 ops | [V] `shasum`; node operation count |
| Δ3 | Digest pins: `StudioContractTest.java:89-91` (comment `:89`, constant `:90-91`), op-count pins `:340-341`; `studio-runner/test/run/confinement.test.ts:293-294`. Root's "~82-83" and ":287" are stale anchors | — | [V] grep |
| Δ4 | `ExecutionSnapshot.replayFailure` (`openapi.yaml:4279`), `dto/ReplayFailure.java`, `GuidedPublicPresentationProjector.java` exist | absent | [V] `find`, grep |
| Δ5 | Frontend on pnpm: `frontend/pnpm-lock.yaml` present, no `package-lock.json`, `.npmrc` `node-linker=hoisted`, `@playwright/test` `1.63.0`, `frontend/e2e/{harness.spec.ts,mswProxy.ts,start-servers.mjs,tsconfig.json,fixtures/}`, `frontend/playwright.config.ts` | npm | [V] `ls`, `node -e` |
| Δ6 | Runner still npm-managed: `studio-runner/package-lock.json`, `packageManager npm@11.3.0`; `.nvmrc` = `24`, `engines.node >=24.11.0 <25.0.0` (N24 landed in 015) | `.nvmrc` 22 mismatch | [V] |
| Δ7 | `studio-runner/dist` digest `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c` at both the 015 close and 008 F1 (`obs008-f1-be01-after.json`); 008 has not rebuilt it | — | [V] |
| Δ8 | `GuidedSessionService.java` sha256 `a8ddea75…`; `lifecycle` `:2501`, `assignmentLifecycle` `:1815` (mapping `:1840`) | `cfb55a54…`; `:2483`/`:1797` | [V] |
| Δ9 | `guidedMain.ts` is 42 lines with the PID-1 launch-tree guard at `:25`; `guidedConfig.ts:14` has 13 mounted keys | 37 lines | [V] |
| Δ10 | 015 landed REL-001 diagnostics and the D4 12 s start budget (see §3, A13) | open | [V] |
| Δ11 | 008 shipped the conditional KL-015-Q4 copy key `authoredLiteralTargetNotFound` (`guidedNarratives.ts:311-322`, `GuidedCompletion.tsx:186`, `guided.test.tsx:421`) | unknown | [V] grep |
| — | Unchanged: `@Disabled` 24 = 6 + 18 `DEFERRED STUDIO-OBS-009` (StudioScheduleApiIT 16, SharedSchedulingIT 2); ports `StudioScheduleApiIT:447,:972`, `SharedSchedulingIT:359,:511`; tripwire `GuidedPublicationReplayIT:18508`; emitters `StudioScheduleProcessor:273`, `StudioAcceptanceService:332` | same | [V] grep |

## 1. Rulings on the architect-owned T0 questions

### A2. AC-1 — what the one runner process launches and configures

**Facts.** [V] `Dockerfile:61` exec-form `CMD ["node","dist/main.js"]`, comment `:58-60`. [V] `guidedMain.ts:20` debug-env refusal, `:21` `assertObservedBrowserStartup()`, `:25` `canEnumerateLaunchTree()` (pid > 1 and both `ps` listings, `tree.ts:300-301`), `:26-28` mounted JSON (`STUDIO_GUIDED_CONFIG_FILE`), `:31` RUNNER-SCRATCH sweep `prepareRecordingScratch`, `:40` `installGuidedShutdown`. [V] `main.ts:125` uses only `canEnumerateProcessTree` and exits 78 on configuration errors. [V] `KEY_SPECS` `server/config.ts:175`, `refuseUnknownKeys` `:459`. **Δ** [V] `transport.ts:70` refuses any guided `capacity` other than 1. **Δ** [V] the governed policy and its hash arrive only in the hash-bound runner context (`guidedConfig.ts:3-5`, `transport.ts:71-74`, `policyHash.ts:28-34`); a mounted policy is refused in every form (ar-mounted-rules, OBS-014 AR-2).

**Ruling.**
1. One entrypoint, `node dist/main.js`. `run/guidedMain.ts`, the mounted-file parser `run/guidedConfig.ts` and the `start:guided` script are deleted; `test/run/guidedMain.test.ts` is ported by name into `test/server/guidedMode.test.ts`. No second CMD and no mode that selects a different process.
2. Guided mode is configuration of the one process: `STUDIO_RUNNER_GUIDED_ENABLED` (boolean, default false) in `KEY_SPECS`. When true, every guided key is required; when false, any guided key present is refused (no half configuration). The 13 mounted fields become named `STUDIO_RUNNER_*` keys; secret material (TLS key, CA, controller public key, callback token) stays as **file paths** mounted from Kubernetes Secrets. The listener host/port are the one listener's. The guided callback base stays its own https-only key; the replay `CALLBACK_BASE_URL` is unchanged in 009.
3. **Δ Capacity:** no key. It stays the code constant 1 (`transport.ts:70`). A key whose only legal value is 1 adds surface without a choice. The 2026-10-16 "required integer key" recommendation is withdrawn.
4. **Δ Policy hash:** no runner key. It stays context-bound per OBS-014 AR-2; a runner-side key would be the second, ungoverned policy source that ruling refuses. The 2026-10-16 "required key" recommendation is withdrawn. AC-1's "the governed policy hash is configuration of that one process" is met by the one process enforcing the context-bound hash [I, interpretation].
5. Startup order when guided is enabled, before anything listens: debug-env refusal; `assertObservedBrowserStartup()` once per process (signature unchanged, P2); `canEnumerateLaunchTree()` (PID-1 a) — a failure writes `CONFIGURATION_DENIED` and exits non-zero; the RUNNER-SCRATCH sweep; one SIGTERM drain that closes guided sessions and replay.
6. **Δ NEW — owner routing (found today).** [V] The backend sends every bridge call for every session to one configured origin (`GuidedSessionConfiguration.java:80-97` `studio.guided-authoring.runner-origin`; `GuidedRunnerClient.java:58`, `:171`) and assigns every session to one configured worker id (`GuidedTranslationProperties.java:17` default `worker-1`; `GuidedTranslationService.java:152`). [V] The worker holds sessions in memory and refuses calls for sessions it does not own (`ownership.ts:144` `CONTEXT_LOST`). [V] The runner Deployment renders 2 static replicas (`values.yaml:382`, Studio v1 decision D3) and optional KEDA 2–4 (`:388-393`). [I] Folding guided into that Deployment as is would spread one session's calls over pods sharing one worker id: fail-closed refusals, unusable sessions. **Ruling for 009:** guided mode is enabled only where the runner Deployment renders exactly one replica; the chart render fails when `guided.enabled` and (`replicaCount != 1` or `autoscaling.enabled`). `values.yaml` defaults guided off; each environment's values choose. Pod resources are sized for one replay browser plus one guided browser, basis recorded, measurement owed (GA §4.G G-4). **Alternatives:** (B) owner-addressed routing (per-pod worker identity, headless Service, backend worker selection) — the right scale-out design, but no story or ADR defines worker selection or per-pod identity, so it is not invented here; it goes to GA §4.G G-4 / a new story, owner @architect + @pm. (C) a second Deployment object — rejected: contradicts AC-1 and ADR-SC-005 "one Deployment". **Trade-off:** guided-enabled environments lose D3's two-pod replay redundancy; guided throughput stays one session per environment, which is already true today (capacity 1, one worker id). Root decision R1 (§6).
7. D1 publishes the launch contract (keys, file paths, enable switch, probe over TLS, readiness signal, exit codes) as drop D1.0 before D2, D3, I and F code against it.

### A3. AC-3 — one TLS listener; no plaintext mode

**Facts.** [V] `server.ts:17` plaintext `node:http`; `transport.ts:77` HTTPS `requestCert:true, rejectUnauthorized:true`, controller fingerprint check `:80`. [V] `GuidedPublicationReplayIT:2901` `http://127.0.0.1:<NORMAL_PORT>`; the class also boots `createApplication` from `dist` inline (`:32686-32798`). **Δ** [V] Kubernetes probes are exec probes `node dist/probe.js` (`studio-runner-deployment.yaml:131-142`) that speak plain HTTP with the service bearer (`probe.ts:2,10-12`).

**Ruling.** Items 1–3 of 2026-10-16 stand: no plaintext listener in any configuration; `/v2/runs`, `/v2/validate-observed`, the probe routes and the bridge share one listener with `requestCert:true, rejectUnauthorized:true`; `validate()` rejects `http://` outside `local`/`test`; every runner-spawning test moves to HTTPS through one test CA (lane I); the `/v2/runs` bearer stays as a second factor. **Δ Item 4 revised:** every connection is CA-authenticated; route authorization pins the peer: run, validate and bridge routes require the controller fingerprint (plus bearer or JWT as today); `/health` and `/ready` accept the controller fingerprint **or** the runner's own certificate fingerprint, plus the existing probe bearer. `probe.ts` speaks TLS presenting the runner's own certificate; the Helm probe command does not change. [I] The runner certificate then needs `clientAuth` in its extended key usage; D1's `tlsListener.test.ts` proves it, and D2 records it as a certificate requirement. **Not extended:** the runner→backend callback hops are outside AC-3; [I] they carry no secret value (reports carry status enums, design §79 row). A change there needs its own ruling.

### A4. AC-2/AC-3 — the backend's runner client certificate

**Facts.** **Δ** [V] `GuidedSessionConfiguration.java:94` and `:111` use `SSLContext.getDefault()` (was `:85/:102`). [V] `ObservedValidationClient`'s `HttpClient` is built in `GuidedPublicationConfiguration.java:58`; `HttpRunnerDispatchClient` builds its own at `:80-84`; `GuidedRunnerClient` already takes an `SSLContext` (`:63-64`).

**Ruling (unchanged in substance).** One `dispatch/StudioRunnerTls` builds a dedicated `SSLContext` from explicit key-store, trust-store and password-file properties; all three runner clients use it. No `javax.net.ssl.*` JVM defaults. `HttpRunnerDispatchClient` gains an `@Autowired` TLS constructor and keeps the 3-argument one, so the four dispatch tests that construct it compile unchanged. Tripwire: `grep -rn 'SSLContext.getDefault' backend/src/main/java/com/citi/put/checks/studio` = 0. `runner-origin` and `studio.runner.base-url` both point at the runner Service's https URL; merging them is 011 FOLD's. [I] The runner certificate's SANs must cover the Service DNS name, because the JDK client verifies hostnames; D2 records it.

### A5. AC-5 — profile gate for the two `@Scheduled` guided beans

**Facts.** [V] `GuidedSessionReaper` is `@Component` (`:9`) with `@Scheduled` `:36`. **Δ** [V] `GuidedTranslationCoordinator` is not component-scanned: it is a `@Bean` in `GuidedTranslationConfiguration.java:130`, so a class-level `@Profile` on it would be ignored. [V] Precedent `SchedulingCoordinator.java:17` `@Profile("!api | worker")`. [V] The coordinator reaches the API over HTTP (`translation.controller-origin`, `:120-131`), so it can live on worker pods.

**Ruling.** `@Profile("!api | worker")` on the `GuidedSessionReaper` class and on the coordinator's `@Bean` method in `GuidedTranslationConfiguration` (Δ file). `GuidedScheduledBeansProfileTest` proves absence for `{api,prod}`, `{api,staging}` and presence for `{worker,prod}`, `{local}`, `{test}`. If the worker context cannot build either graph, stop and return here; no `!worker` bean is widened.

### A6. AC-4 — heap and core dumps

**Facts.** [V] `JAVA_OPTS` at `values.yaml:88,:239`, `values-prod.yaml:30,:108`, `values-uat.yaml:24,:102`, `values-dev.yaml:23,:71`; no `HeapDumpPath` anywhere. [V] `chart.test.ts:353-354` asserts the chart sets no `command`/`args`; `:557-565` records the exec-form drain property (`runner.draining`/`runner.drained` on `docker stop`).

**Ruling (unchanged, two precisions).** JVM: add `-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash`; the lint asserts both and no `HeapDumpPath`. Runner: the image CMD becomes `["sh","-c","ulimit -c 0 && exec node dist/main.js"]` in the Dockerfile, never chart args; `exec` keeps node as the container's main process. D2 re-records the drain property with the new CMD. With PID-1: in the pod `shareProcessNamespace: true` keeps node off PID 1; in a plain `docker run` node is PID 1 and guided start is refused `CONFIGURATION_DENIED` unless `--init` is used (PID-1 c). Backend core rlimit stays "owed, owner Platform/SRE" (no backend Dockerfile in this repo [V]).

### A7. AC-1 P2 — public `RuntimeVersions` after the artifact-1 stamps go

**Facts.** **Δ** [V] `runtime-versions.json` already carries the observed identities: `observedSchemaBundleHash`, `observedReferenceBundleHash`, `observedChromiumBuild`, `observedBrowserProvenance`, `observedBrowserLauncherSha256` (`write-runtime-versions.mjs:137-142`); the five artifact-1 keys are `:105-109`; AC-1 d grep = 19 hits. [V] `projectRuntime` (`RunnerReportProjection.java:620-631`) reads `chromiumBuild`, `validator|validatorSchema`, `executor`. [V] The persisted `runtime_versions` holds the projected 5-field record, and `ExecutionSnapshotMapper.readRuntime` (`:197-207`) parses it as `RuntimeVersions` — the mapper is untouched. **Δ** [V] two contract sites name artifact-1 meanings: public `RuntimeVersions` (`openapi.yaml:4149-4157`) and internal `ReportedRuntimeVersions` (`:4562-4571`), plus examples at `:2413-2446` and `:5148-5149`. [V] `GuidedPublicationReplayIT:2758-2775` reads the observed keys from `dist/runtime-versions.json`.

**Ruling.** Keep the five public names; re-point meanings in `projectRuntime` only: `chromium` ← `observedChromiumBuild`; `validator` ← `"3:" + observedSchemaBundleHash`; `executor` ← `observedBrowserLauncherSha256`; `playwright` and `image` unchanged. No fallback read of removed keys. **Δ No new private key names:** P2 removes the five artifact-1 keys and keeps every observed key name, so ReplayIT's reads stay valid; drop P2.0 shrinks to "the remaining key set". C9 edits both descriptions and the four example blocks, re-anchors both digest pins with old/new quoted, keeps 44 operations, and adds the ADR-002 §13 row. Renaming fields stays rejected for 009.

### A8. AC-9 TF-3 — the GET read order

**Facts.** [V] `readAuthoringDraft` `:294`: `findByIdForUpdate` `:296`, then `requireRead` `:297`. **Δ** [V] `lockForAuthoringWrite` (`:472-483`) does visible read → `requireWrite` → locked read → `flush()` + `refresh()` → `requireWrite` again; the refresh matters because the locking query returns the already-managed instance [I, JPA persistence-context behaviour, consistent with the code's own refresh].

**Ruling: option (ii), mirroring `lockForAuthoringWrite` exactly** with `requireRead`: `findById` → `requireRead` → `findByIdForUpdate` → `flush()`+`refresh()` → `requireRead` again → projection. Unknown, withheld and unreadable ids answer the same `403 STUDIO_FORBIDDEN`. Tests per AC-9 d plus the mutation check (lock moved before `requireRead` → the unit test fails). Option (i) stays rejected (loses draft/readiness consistency, `:452-470`).

### A9. AC-7 FOCUS-MUTATION-01 — the exact rule

**Facts (re-anchored).** [V] observer `observationCollector.ts:42-44` (`subtree, attributes, childList, characterData`); window check `matches(…, focusStylesOnly=true)` `:601-602`; `focus()` `:734`; re-check `:738`. **Δ** [V] `POST_FOCUS_CHANGED` → `UNKNOWN_OUTCOME` at `browser.ts:510` (was `:509`); session stops at `runtime.ts:369` and `:534` (was `:451`). [V] unit stub `observationCollectorInvoke.test.ts:81` returns `[]`.

**Rule FM.**
- FM-1. Only the judgement of MutationObserver records taken in the focus window changes. Every other condition on `:738` stays byte-identical.
- FM-2. Before `focus()`, capture the field's ancestor chain (field → document root, crossing shadow roots through their hosts).
- FM-3. A record in the window is a target change iff: (a) an `attributes` record on the field whose name is not allowlisted; (b) a `childList` record that adds or removes a node of the captured chain, or after which the recomputed chain differs (removed, replaced, moved); (c) an `attributes` record on a chain ancestor named `hidden`, `inert` or `disabled`; (d) a `characterData` record inside the field. Every other record is ignored.
- FM-4. Field allowlist: `class`, `style`, `aria-expanded`, `aria-activedescendant`, `aria-describedby`, `aria-controls`, and names starting `data-focus`. Everything else — explicitly `type`, `readonly`, `disabled`, `aria-disabled`, `name`, `value`, `autocomplete`, `contenteditable`, `aria-hidden` — counts.
- FM-5. Keep the record-count bound as a work cap: more than `workLimits.elements` records in the window refuses `POST_FOCUS_CHANGED` (fail closed).
- FM-6. Unchanged: at-most-once, the `UNKNOWN_OUTCOME` mapping and session stop, every pre-write check on `:738` (including `visible(element)`, which still catches an ancestor hidden by CSS).
- FM-7. Classification: an effect-safety guard, not a privacy or security boundary. No Security & Compliance acknowledgement; the conditional FM-01 half of U13 closes "not required".
- Tests: primary positive proof in the fixtures tier (real Chromium). Unit positives count only after the stub delivers scripted records, with its own control (a scripted `type` record still refuses).

### A10. AC-7 AUTHORED-ECHO-01 — the exact rule (for Security & Compliance acknowledgement, U13)

**Facts (re-anchored).** **Δ** [V] the runtime sends every non-`secretRef` authored value to `withhold` at start `runtime.ts:239` and at append `:281` (was `:163/:201`); `withhold` stores strict values (`observationCollector.ts:619`); the filter drops any node whose name or locator hint contains one (`:483-505`). [V] Each input carries `provenance` with `kind` `sourceSpan` or `configuration` (`guided/types.ts` `AuthoredInputs`), bound by `authoredInputsHash` (`runtime.ts:180`). [V] Guided `knownSecrets` is `[]` (`runtime.ts:198`).

**Rule AE (text for acknowledgement).**
- AE-1. Scope: guided learning observation only. Replay and `TrustedPolicy` are unchanged.
- AE-2. The runner node-withholds exactly: authored inputs whose provenance kind is `configuration`; `knownSecrets` entries; captured business values (the collector's existing capture inventory). `secretRef` values keep their own existing path unchanged.
- AE-3. An authored input whose provenance kind is `sourceSpan` is not node-withheld, at start or at append.
- AE-4. No echo scrub of `sourceSpan` literals in any form (strict or token-bounded), including after their own fill or select was dispatched.
- AE-5. No wire, schema, contract-version or vocabulary change; provenance is read from the already hash-bound inputs.
- AE-6. Reason: under INPUT-POLICY-01 branch A a `sourceSpan` literal is the author's own source text, already visible to the gateway; withholding nodes that echo it protects no value and makes same-named targets unlearnable (ruling Q4).
- AE-7. Disclosed residual: page text equal to an authored non-secret literal becomes visible to the model and to sanitized observations.
- Gate: code may be written and proven only after the acknowledgement is recorded (§5 U13). The contract owner adds one dated note each to `consensus-plan.md:88`, `bridge-design.md:109`, `account-provider-readiness-design.md:378`. **Δ** AE-01 f applies: the FE copy `authoredLiteralTargetNotFound` exists (§0 Δ11) and FE9 removes it after AE-01 lands.

### A11. AC-11 R1 — non-consuming confirmation and the shared derivation

**Facts.** [V] `GuidedSessionEvidenceService.record` (`:79-172`) checks owner, fence, versions and the head identity (`:112-126`, revision `:120`), deduplicates, judges the window on the DB clock, then inserts one evidence row (`evidence.insert`) and records the command (`sessions.command`). [V] `verifyLifecycle` `GuidedMaterializationService.java:376`, `sameIdentity` `:388`, `pendingDeliveryId` public `:154`.

**Written confirmation (AC-11 R1 b):** recording evidence is non-consuming in L1's sense. It creates no action, preparation, binding or counter, does not call `verify` or `requireAcknowledged`, and does not change the materialization [V, by reading `:79-172`]. **Ruling:** binding only if the W1 probe reproduces `STALE_FENCE`; otherwise R1 closes "not reproduced". One derivation, `GuidedMaterializationService.acceptedContextRevisions(sessionId)` → `{n}` or `{n, n-1}`; `verifyLifecycle` and the evidence route use it; the route keeps its field set and replaces only the `contextRevision ==` comparison with membership; `sameIdentity` keeps one body. Tests go in the new sibling `GuidedEvidencePendingAppendIT`.

### A12. AC-11 f–h, i — R10c post-Ready shape (incl. Pax D-11)

**Facts.** [V] control-window call sites `runCoordinator.ts:390/400/404/405`; `requestStop` `:350-356` (`recorded = source !== 'control-window'`); `STOPPED_STEP_MESSAGE` `:153`. [V] the 008 derivation (`RunnerReportProjection.java:340-386`) names TARGET_DRIFT only for `ERROR` + `RUN_ERROR` + `errorMessage "TARGET_DRIFT"` + exactly one FAIL step with that failure.

**Ruling (unchanged).** An unrecorded post-Ready self-stop reports outer `RUN_ERROR` with `errorMessage` `CANCELLED`; the interrupted step's failure is `STOPPED_STEP_MESSAGE`. The R8 `recorded` upgrade extends to revocation facts, so a recorded revocation whose control read is lost still reports `CANCELLED` → `AUTHORIZATION_REVOKED` (mandatory regression). The projection admits the shape; API outcome stays `ERROR` with null `error_code`. `replayFailure` is null by construction; one `RunnerReportProjectionTest` case pins it. Each control-window site logs a closed branch label (`noRequestBudget`, `noTimerBudget`, `windowPassed`, `invalidControlBody`) with integer `latenessMs` and `durationMs` only. No window, deadline, TTL or margin change. **Security review:** this ruling carries the analysis (no value, no new vocabulary, fail-closed kept); @qa (security lens) co-signs at the R1/B lane gate, following the secret-login-design R3 delta precedent (`secret-login-design.md:14`). It is internal, not a Security & Compliance item.

### A13. AC-11 k, P3 — guided launch deadline (Δ closed by STUDIO-OBS-015 D4)

**Facts.** [V] `GUIDED_START_BUDGET_MS` = 15 000 − 3 000 (`guidedBrowser.ts:34`); `launchGuidedBrowser` bounds every step with `boundedStartup` (`browser.ts:536-541`); Playwright backstop `:543`, `:556`; `hardTeardown` kills this launch's tree by argv markers and holds the slot on survivors (`:678-697`). Ratified in 015 (`aria-d4-launch-deadline-ruling01/ratification.md`).

**Ruling.** The value question is closed (12 s, D4). "One process group per guided browser" is met by D4's per-launch argv-marker selection, which reaches the whole tree; no `setsid`/process-group change. What remains of k: the bound and teardown for the non-launch paths (KL-015-D5, §4), backend IT teardown reaping `ProcessHandle.descendants()` captured **before** the kill (lane I), the `vitest.config.ts:44-48` comment fix (still wrong [V]), and the worker-kill listing proof. In a pod, a killed node process ends its container and its processes [I]; the in-cluster check stays with @devops.

### A14. AC-12 i — explicit runner-`dist` dependency

**Ruling (simplified, Δ).** Keep Gradle `verifyRunnerDist` that never builds the runner: it fails if `studio-runner/dist/main.js` is missing or older than any file under `studio-runner/src`, and every guided IT task `dependsOn` it. **Δ** The per-IT digest attachment is dropped: the collectors already record `dist.digest` before and after every run and `distStable` [V `obs008-f1-be01-results.json`, `-after.json`]. QA credits a guided IT run only when its before-digest equals the F-merge build receipt's `distDigestAfter`. Building from Gradle stays rejected.

### A16. AC-11 co-run — the harness is gone

**Facts.** [V] `backend/src/test/java/com/citi/put/checks/corun/` is absent from the tree (7 files tracked at HEAD); `tools/corun.sh:60` still names `StudioCoRunIT`; `:91-97` run `npm ci` and `npm run build`.

**Ruling (unchanged, plus Δ).** New `corun/ObservedCoRunIT` on the folded runner over TLS, using lane I's harness, covering every AC-11 leg; reuse existing proofs by name. `tools/corun.sh` and `corun-report.mjs` are re-pointed in the same unit. **Δ** `corun.sh` uses `pnpm --config.package-manager-strict=false run build` and drops its `npm ci` branch (it fails if `node_modules` is missing; no install from a harness). @po's AC-11 note ("rebuilt, not extended") stays owed.

### A15 and A18 (not mine to own)

- A15 (alert form, @devops): I concur with a platform-neutral specification in D2's evidence until @devops names the monitoring stack.
- A18 (Vault rehearsal, @qa): I concur — a local dev-mode container is a non-credited rehearsal; the image pull needs user authorization (§6 R5).

## 2. Criteria fixed now, ruled after the probes

**C1 — ADJ-1 (AC-11 a–c).** After the W1 probe (`PreReadyRevocationProbeIT`) reproduces today's behaviour: choose (a), a pre-Ready `AUTHORIZATION_REVOKED` path, **only if** it is one added predicate on the existing ledger CAS, with no reaper, deadline, TTL or OBS-006 edge widening and no new vocabulary; otherwise (b), documented reaper settlement with no named cause. If (a) needs SQL, @data-engineer writes V23+. Security co-sign as in A12.

**C2 — R10-rev2-2 child exception-class log (AC-12 e).** **Δ** The guided-start vehicle shipped in 015 (`diagnostics.ts:61-73`); R10-rev2-2 is the replay child (`childRuntime.ts`, `launcher.ts:489-491`). Rule it in only if a full-class `GuidedPublicationReplayIT` run shows a recurrence classified "child sent `INTERNAL_ERROR`, no violation" (AC-12 c second bullet). Then: one child-side stderr line built from `diagnostics.ts` link labels (error name, closed code, errno), never message, stack or path; no wire or vocabulary change. Otherwise it stays a candidate.

## 3. A19 — REL-001: decided by the user (2026-10-16)

- **Decision:** find and fix inside STUDIO-OBS-015; no waiver or deferral (user, relayed by root).
- **What 015 landed** [V]: `GuidedStartFailure` keeps the cause with closed `phase`/`loss` (`diagnostics.ts:22-28`); `ownership.ts:157-159` throws it after a bounded stop; `runtime.ts:148-153` keeps the first abort reason and wraps `TIMEOUT`/`CANCELLED` with their cause; `transport.ts:122` writes one value-free `GUIDED_START_FAILED` line (`diagnostics.ts:61-73`); D4 bounds the start (A13).
- **What remains:** the attempt03 root cause is unproven (015 formal gate; story 0.3.17). Nothing is left to implement in lane O. 009 keeps the AC-11 REL-001 pointer and the AC-12 15 s-edge rule as classification duties on every guided run (lanes I, S-W3, F, G9; owner @qa). [V] Two catches still drop a cause on stop paths, not start paths: `ownership.ts:178` (journal consume) and `:184-187` (`close()`). No change unless a recurrence points there.

## 4. Architect items placed after 2026-10-16

- **LIFECYCLE-REASON-01 tolerance (AC-11 LR a): no tolerance.** Mirror `assignmentLifecycle` exactly (`:1840`). Reasons: one mapping; the caller is the mTLS owning worker under fence and L1 identity; a tolerance would add a cross-host clock comparison and a new margin, against the R9/R10 precedent (judge on the DB clock, no tolerance). Accepted consequence: a worker that labels an early stop `EXPIRED` gets `EXPIRED` instead of `FAILED` — both terminal, nothing published.
- **REL-001 pointer, innermost `code CANCELLED`:** exempt only when the evidence shows a stop for that session reached the runner before the line (a backend `stop`, or worker shutdown); otherwise it counts as a recurrence. [V] `runtime.ts:150-151` keeps the first abort reason, so a deadline is not logged as `CANCELLED`.
- **KL-015-D5 (AC-11 D5 a):** ruled at W1.5, after the W1 fixtures-tier probe and before any D5 code merges. D5 b constraints bind as written. Direction, not yet a ruling: a bounded graceful close, then D4's `hardTeardown` (argv-marker kill, survivor check, slot held on survivors) on paths (i)–(iii); for (iv), the backend's handling of a `stop` with no answer within 15 s is read first (D5 e, lane BL).
- **PID-1 (AC-1):** [V] `chart.test.ts:557-568` already asserts `shareProcessNamespace: true` for every values set; D2 extends the assertion to guided-enabled sets (b). PID-1 c launch paths: `tools/corun.sh` starts node on the host (pid ≠ 1 [I]); image smoke uses `docker run --init`.
- **EDGE-15S-3:** @qa decides at T0 (lane T0-QA).

## 5. User and external batch (raise in one message)

| ID | Item | Owner | Recommended default | Needed before |
|---|---|---|---|---|
| A1 | Runner subset beside 008 | user | **Decline** (moot: 008 W3–W5 is frontend/E2E; `dist` and the Gradle lock are shared with 008 W4/W5) | — |
| A17 | Q2: observed schedules use `ConfiguredBackgroundAuthorization` parity; G-3 refuses outside `local`/`test` | user | **Confirm** | lane S (W2) |
| B8 | Remaining USD headroom R under the 500 ceiling, and whether benchmark spend shares that pool | user | none (no admission without it; `ADMISSION_REFUSED_PRICE_UNKNOWN`) | T4 |
| B8 | Gateway price list for the pinned model | ED-01 owner | none | T4 |
| U13 | Security & Compliance acknowledgement of rule AE (§1 A10) | Security & Compliance | **Request now** with §1 A10 as the text | AE-01 code; T4 (story rule e) |
| U2 | ED-01 gateway owner, access, retention answer | user → GA plan D-3 | name the owner | AC-8, AC-7 |
| U3 | Approved staging application with real login, origins, test secret | user / app owner / Platform-SRE | — | AC-7 (b), AC-10 C-17 |
| U5 | Dev Vault (ED-02) for the policy test | PUT Core / BFF | — | AC-4 Done (GO-3) |
| U9 | ≥ 5 pilot participants and contact authorization | user | — | 010 pilot |
| U4 | Deployed stack, internal image, prod `studioRunner.enabled` | Platform/SRE + @devops | — | every deployed half |
| U6 | SIEM sink and Q3 retention | Platform/SRE | "unrun, owner Platform/SRE" | AC-5 live |
| U7 | Budget admission record | user | after B8 | first real-provider call |
| U8 | C-17 masked-video reviewer | user | — | AC-10 |
| U12 | Push, deploy, schedule activation | user → @devops | — | shared rollout |
| U14 | DB role model per shared environment | Platform DBA / @devops | "unrun" until confirmed; no V23 grant in 009 local | TF-5 a, c, e |
| R5 | Docker use (image smoke, Vault image pull) | user | allow, or record "unrun, no authorization" | D2 smoke, A18 |

## 6. Root decisions

- **R1 (A2.6):** accept "guided-enabled ⇒ one runner replica" for 009 and send owner-addressed scale-out to GA §4.G G-4; or fund it now as new design work. Recommendation: accept; disclose in 010. If root treats D3's two-pod pilot as a user decision, add it to the §5 batch.
- **R2:** 009 collector copies in `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/` with output `docs/qa/evidence/STUDIO-OBS-009/execution-<date>/execution`, plus two edits: `run-runner-build.py` builds with `pnpm --config.package-manager-strict=false run build` (today `npm run build` [V]); `run-runner.py` detects vitest in any of its first arguments (today only `command[0]` [V], so a `pnpm … exec vitest` run gets no JSON report). Keep `execute-008/with-gradle-lock.py` so 008 and 009 share one lock.
- **R3:** source-hold policy for W2 collector runs (008 R1 precedent: focused runs during editing are non-evidentiary; lane-exit runs inside hold windows).
- **R4:** checkpoint the 008-Done tree before 009 W1.
- **R6:** send the U13 request now.
- **R7:** W2 has 12 file-disjoint lanes; host memory is short. Cap active agents (suggest ≤ 6) and stagger, runner and backend halves alternating; Gradle is serialized by the lock regardless.

## 7. Not claimed

No implementation, test, build, migration or lifecycle change. No story edit. No external acknowledgement or decision is recorded as obtained. Every command in the refold is PLANNED_NOT_RUN.
