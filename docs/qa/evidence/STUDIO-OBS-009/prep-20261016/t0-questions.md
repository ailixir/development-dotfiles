# STUDIO-OBS-009 / 010 / 011: T0 questions with recommended answers (prep 2026-10-16)

- **Author:** Aria (@architect). Read-only preparation. These are **questions with recommended answers**, not recorded rulings. Each one becomes binding only when the named owner records it (for an @architect item, I re-issue it as a ruling at 009 W0 against the post-008 tree).
- **Writes:** this file, `implementation-plan.md` and `lanes.json` in this directory. Nothing else.
- **What I ran:** `ls`, `grep`, `sed -n`, `wc -l`, `shasum -a 256`, `git status --short`, and `node -e` reading `package.json` files. No Gradle, test, build, install, Docker, database or model call.
- **Inputs:** stories 009 (`7b9ef036…`), 010 (`bf8b1bf6…`), 011 (`7cfb11f5…`), inventory (`b2ee4bd6…`); `claude-feasibility-008-011.md` (`4c58e07a…`); the 008 plan (`1db80f67…`), `lanes.json` (`3ca79c3b…`) and T0 rulings (`1127e995…`); the 015 QA gate draft (`062852bd…`) and the 015 Aria rulings; Pax's `po-delta-validation.md` and Quinn's `qa/*` drafts in this directory (added mid-task by the coordinator).
- [V] = I verified it by reading the file or running the command. [I] = inference, not verified.

## How to read this

| Part | When it must be answered | Blocks |
|---|---|---|
| A | Before 009 W1, i.e. before any 009 source lane starts | the named lanes |
| B | Before 009 T4, the first real-model call. Not needed before the local lanes or before 011 starts | the AC-7/AC-8 external lane and its local preparation |
| C | At 009 time, after a probe has run. These cannot be ruled in advance | one sub-item each |
| D | Items for 010 and 011 that this plan depends on | 010 T2 and 011 T0 |

---

## Part A: before any 009 source lane starts

### A1. May any 009 work run while 008 is still open? (owner: user; PO records it)

- **Facts.** [V] 009 "Depends on STUDIO-OBS-008". README `:47` says only verified completed dependencies permit development. 015 is still InProgress (gate draft, attempt04 pending), and its frozen-source manifest covers `backend/src`, `frontend/src`, `docs/specs` and `studio-runner/**`. 008 owns `openapi.yaml`, both pins, `RunnerReportProjection`, `ProgressReportService`, `ExecutionSnapshotMapper`, `GuidedSessionConfiguration`, `GuidedPublicationConfiguration`, V22 and `docs/runbooks/studio-guided-authoring.md` (008 `lanes.json` plus A1.7).
- **Hidden shared resource.** [V] Four backend IT classes spawn the untracked `studio-runner/dist/run/guidedMain.js`: `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest` and `GuidedPublicationReplayIT`. 008's backend lane runs `guided.publication.*`. A 009 runner change that rebuilds `dist` during 008 would move 008's evidence digest.
- **Recommended answer.** Keep the rule as written for the backend, contract and frontend lanes. Optionally, the user may allow a **runner-and-chart subset** to start once 015 is Done and 008 W1 (the pin re-anchor) has landed, under three conditions: Vitest-only verification, **no `dist` rebuild**, and no Gradle run until 008's final gate receipt. The subset is D1, D2, P2-runner, R1, R2 and O (see `lanes.json`).
- **Trade-off.** The subset takes about the runner half of 009 off the critical path. 008 W3–W5 is long and frontend-only, so the overlap is real. Cost: one more concurrent writer while memory is short, and some rework risk if 008 review asks for runner changes. [I] that risk is low, because 008 touches the runner only for the pin line.
- **If the answer is no:** the plan's wave order still holds. Everything starts at 009 W0, after 008 Done.

### A2. AC-1: what does "one runner process" launch and configure? (owner: @architect; @devops co-signs)

- **Facts.** [V] `Dockerfile:61` `CMD ["node","dist/main.js"]`. `run/guidedMain.ts` (37 lines) reads `STUDIO_GUIDED_CONFIG_FILE` and calls `createGuidedServer` (`guided/transport.ts:67`, HTTPS with `requestCert`). `server/server.ts:17` is plaintext `node:http`. `package.json` has `start:guided`. `KEY_SPECS` is at `server/config.ts:175`, and unknown keys are refused (`refuseUnknownKeys`). `compat/runtime-versions.ts:109` `assertObservedBrowserStartup` is called from `guidedMain.ts:9`.
- **Recommended answer.**
  1. One entrypoint, `node dist/main.js`. `guidedMain.ts` and the `start:guided` script are deleted, and `test/run/guidedMain.test.ts` is ported by name into `test/server/guidedMode.test.ts`. No second CMD and no mode flag that selects a different process.
  2. Guided configuration moves from the mounted JSON file to named `STUDIO_RUNNER_*` keys in `KEY_SPECS`. The file mechanism is removed (single path). Secret material (TLS key, CA, RS256 key) stays as **file paths** named by keys, mounted from Kubernetes secrets, never inline values.
  3. Guided capacity is a required integer key. Startup refuses a capacity above 1 while secret fills are enabled (OBS-007 AC-6). The governed policy hash is a required key.
  4. `main.ts` calls `assertObservedBrowserStartup` once for the whole process, with the existing signature (P2 must keep that signature stable).
  5. D1 publishes this as a written **launch contract** (keys, file paths, readiness probe, TLS inputs) at its interface drop D1.0, before D2, D3 and I code against it.
- **Trade-off.** Keys instead of a file make the chart the single source and let `chart.test.ts` keep proving "rendered env ⊆ accepted keys". The cost is a larger `KEY_SPECS` and a values migration in D2.

### A3. AC-3: one TLS listener, and is there any plaintext mode? (owner: @architect + security review)

- **Facts.** [V] AC-1 says "one TLS listener". AC-3 says the backend's `validate()` rejects `http://` outside `local`/`test`. `GuidedPublicationReplayIT:2901` points `studio.runner.base-url` at `http://127.0.0.1:<port>`. The guided ITs already use `https://localhost` (`GuidedPlanningIntegrationTest:453`).
- **Recommended answer.**
  1. The folded runner has **no plaintext listener in any configuration**. `/v2/runs`, `/v2/validate-observed`, the probe and the bridge share one HTTPS listener with `requestCert: true, rejectUnauthorized: true`. Clients are trusted through the same pinned CA and fingerprint setup that `transport.ts` uses today.
  2. `validate()` follows the AC text: reject `http://` outside `local`/`test`. Permitting `http://` in `local`/`test` does not oblige the runner to serve it. Every test that spawns a runner moves to HTTPS through one shared test CA (lane I).
  3. Keep the existing bearer token on `/v2/runs` as a second factor. Removing it would be a separate decision with its own security review.
  4. `probe.ts` speaks TLS to the listener. The Helm probe command does not change.
- **Rejected:** a `loopback-plaintext` mode for tests. It contradicts "one TLS listener" and would bring back a second path.
- **Trade-off.** This is honest, single-path and closes G-2 for real. The cost is blast radius: every runner-spawning backend IT, including the 21k-line `GuidedPublicationReplayIT`, changes its spawn and base URL. That is why lane I exists and is on the critical path.

### A4. AC-2/AC-3: where does the backend get its runner client certificate? (owner: @architect)

- **Facts.** [V] `GuidedSessionConfiguration:85` and `:102` build `GuidedRunnerClient` with `SSLContext.getDefault()`, which is the JVM-wide default. `HttpRunnerDispatchClient` and `ObservedValidationClient` (`GuidedPublicationConfiguration`) build plain `HttpClient`s.
- **Recommended answer.** Add one `dispatch/StudioRunnerTls` component. It builds a dedicated `SSLContext` from explicit properties (key store, trust store, password files), and all three runner clients use it: `HttpRunnerDispatchClient`, `ObservedValidationClient` and `GuidedRunnerClient`. Do **not** configure client certificates through `javax.net.ssl.*` JVM defaults: that would change TLS for Core, Vault and the gateway too. The edits to `GuidedSessionConfiguration` and `GuidedPublicationConfiguration` wait for 008's backend lane to release those files.
- **Trade-off.** It touches two 008 files, so D3 cannot run before 008 F1. In return, the 011 client fold (AC-4 a) becomes a mechanical merge over one already-shared TLS configuration.

### A5. AC-5: which profile expression gates `GuidedSessionReaper` and `GuidedTranslationCoordinator`? (owner: @architect)

- **Facts.** [V] Both are `@Scheduled` with no `@Profile`. Deployed pods run `api,<env>` or `worker,<env>` (`values*.yaml`). Precedents: `SchedulingCoordinator` uses `@Profile("!api | worker")`; `StudioDispatchScheduler` and `StudioRecoveryScheduler` use `@Profile({"worker","local & !api"})`. `GuidedPublicationConfiguration` is `@Profile("!worker")`.
- **Recommended answer.** `@Profile("!api | worker")`. It removes both beans from every API replica and keeps `local`, `test` and `dev` single-process behaviour, so the guided ITs keep their coordinator. `GuidedScheduledBeansProfileTest` proves absence for `{api,prod}` and `{api,staging}` and presence for `{worker,prod}`, `{local}` and `{test}`.
- **Risk to check first [I].** The worker context must be able to build the coordinator's dependency graph, even though `GuidedPublicationConfiguration` is `!worker`. If the worker context test fails to start, stop and bring it back to me; do not widen a `!worker` bean.

### A6. AC-4: how are heap and core dumps turned off? (owner: @architect + @devops)

- **Facts.** [V] Chart `JAVA_OPTS` has `-XX:+ExitOnOutOfMemoryError` in uat/prod and no `HeapDumpPath`. The runner Dockerfile says that "no shell form" is deliberate, so that PID 1 receives SIGTERM. Kubernetes has no pod-level `RLIMIT_CORE` setting.
- **Recommended answer.**
  - JVM: `JAVA_OPTS` adds `-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash`. The chart lint test asserts both flags are present and no `HeapDumpPath` exists.
  - Runner: the image CMD becomes the exec form `["sh","-c","ulimit -c 0 && exec node dist/main.js"]`. `exec` replaces the shell, so node is still PID 1 and receives the signal. The drain test (`test/server/drain.test.ts`) and a deployment-tier test prove that PID 1 is node and that `ulimit -c` is 0. Chromium inherits the limit.
  - The backend image is not built in this repo [V: no backend Dockerfile]. The backend core limit is therefore a chart/platform input: "owed, owner Platform/SRE" if the platform cannot set it.
- **Trade-off.** It is a one-line image change with a proof, against the alternative of leaving core dumps to a node-level setting nobody owns.

### A7. AC-1 P2: the public `RuntimeVersions` after the artifact-1 stamps go (owner: @architect; contract owner applies)

- **Facts.** [V] The public `RuntimeVersions` fields are `playwright`, `chromium`, `validator`, `executor` and `image` (`openapi.yaml`). Its consumers are `dto/RuntimeVersions.java`, `ExecutionSnapshotMapper.readRuntime` (an 008 file) and frontend `studioTypes.ts:368`, which is a type only; no UI renders it [V grep].
- **Recommended answer: keep the five names and re-point their meaning by description.**
  - `chromium` becomes the observed Chromium build, populated instead of null.
  - `validator` becomes the observed contract and bundle identity (`3:<bundle sha256>`).
  - `executor` becomes the launcher sha256.
  - `playwright` and `image` are unchanged.
  - The runner's private report keys are renamed to the observed identities. No artifact-1 value remains, and there is no fallback read of the old keys (AC-1 a).
  - Contract edit: `RuntimeVersions.description` plus examples only, by the 009 contract lane after 008. Both pins are re-anchored with old and new values quoted. An ADR-002 §13 row is added.
- **Alternative:** rename the fields (`observedBundleHash`, `launcherSha256`). The names are more precise, but it adds a frontend type change on an 008 file and a mapper change. I recommend against it for 009. It can be a later contract story if someone needs the names.

### A8. AC-9 TF-3 (S1): the GET read order (owner: @architect, security review)

- **Facts.** [V] `readAuthoringDraft` (`StudioService:294-297`) runs `findByIdForUpdate`, then `requireRead`, then `authoringDraft(test)`. `authoringDraft` calls `readiness.change(...)` and `project(test)`, and `readinessOf` flushes and reads readiness **through JDBC in separate statements** (`:452-470`). The method is also called by `createAuthoringDraft` (`:289`) inside the creator's transaction. `lockForAuthoringWrite` already uses "visible read, then `requireWrite`, then locked read".
- **Recommended answer: option (ii).** `findById` (no lock), then `requireRead`, then `findByIdForUpdate`, then the projection. An unauthorized caller never takes the lock. An authorized reader keeps today's consistency between the draft row and the separately read readiness. [I] Without the lock, a concurrent save can commit between those reads, so the read could pair a draft from save N with readiness from save N+1.
- **Rejected:** (i) alone, which loses that consistency. Also rejected: (i) plus `REPEATABLE READ`, which changes the isolation of a method that joins the create transaction.
- **Tests.** Those in AC-9 d, plus Quinn's mutation check (move the lock back before `requireRead`; the unit test must fail). The uniform 403 baseline stays unchanged.

### A9. FOCUS-MUTATION-01: the exact rule (owner: @architect). Also answers Quinn gap 9

- **Facts.** [V] The focus re-check at `observationCollector.ts:738` uses `matches(…, true)`. That counts every MutationObserver record in the document and tolerates only `class`/`style`, up to `workLimits.elements` records (`:601-603`). Then `browser.ts:509` maps the refusal to `UNKNOWN_OUTCOME`, and `runtime.ts:451` stops the session. Quinn [V]: the unit tier stubs `MutationObserver.takeRecords()` to return `[]` (`observationCollectorInvoke.test.ts:81`).
- **Recommended rule.**
  1. During the focus window, a record counts as a target change only if one of these holds:
     - (a) the record's target is the field element, and it is an `attributes` record whose name is outside the allowlist;
     - (b) it is a `childList` record that removes or inserts the field or any of its ancestors, judged by an ancestor chain captured before `focus()` and compared after it (removed, replaced or moved);
     - (c) it is an `attributes` record on an ancestor whose name is `hidden`, `inert` or `disabled`.
     
     Every other record is ignored.
  2. The attribute allowlist on the target is: `class`, `style`, `aria-expanded`, `aria-activedescendant`, `aria-describedby`, `aria-controls`, and any attribute whose name starts with `data-focus`. `aria-controls` is my addition: comboboxes set it on open. Never allowlisted: `type`, `readonly`, `disabled`, `aria-disabled`, `name`, `value`, `autocomplete`, `contenteditable`, `aria-hidden`.
  3. **Keep a record-count bound**, now as a work cap: if more than `workLimits.elements` records arrive in the window, refuse `POST_FOCUS_CHANGED`. That fails closed, as today.
  4. The rest of `:738` stays byte-identical: identity, eligibility, visibility, active element, disabled/readonly/aria-disabled and type. The `POST_FOCUS_CHANGED` → `UNKNOWN_OUTCOME` mapping and at-most-once stay unchanged.
  5. **Classification:** an effect-safety guard, not a privacy boundary. So no Security & Compliance acknowledgement is needed. I review it at gate.
- **Test placement (Quinn gap 9).** The primary positive proof is the **fixtures tier with real Chromium** (`test/fixtures-tier/focus-mutation.test.ts`), where MutationObserver is real. Unit-tier positive cases are allowed only after the stub is extended to deliver scripted records, and the stub extension needs its own control: a scripted `type` record must still refuse. A unit case written against the `[]` stub is not credited, because it passes for the wrong reason.

### A10. AUTHORED-ECHO-01: the exact rule (owner: @architect; Security & Compliance acknowledges; external)

- **Facts.** [V] `runtime.ts:163` withholds every non-`secretRef` authored value. `:201` does the same at an append. `observationCollector.ts:619` stores them as strict values, and `:498-505` drops any node that contains one as a substring. Provenance is already on every input.
- **Recommended rule.**
  - Withhold only these: `configuration`-provenance values; `secretRef` values (their own path); `knownSecrets`; captured business values.
  - `sourceSpan` literals are not node-withheld.
  - **No echo scrub.** Under INPUT-POLICY-01 branch A, `sourceSpan` literals are already visible to the gateway, so scrubbing their echo protects nothing. It would also bring the same collision back for "select London, then check City shows London".
  - No wire or schema change. Dated notes go into the three contract documents through the 009 contract lane.
- **Gate.** Code may be written and proven locally (fixtures tier and joined). It **lands only after** the Security & Compliance acknowledgement is recorded (story AC-7 a). That is external, so lane O keeps AE-01 as a separate, unmerged unit until then.

### A11. AC-11 R1: is the recording-evidence route non-consuming, and what is the shared derivation? (owner: @architect)

- **Facts.** [V] `GuidedSessionEvidenceService.record` (`:79-170`) does six things:
  1. locks the session;
  2. checks scope, worker, fence and versions;
  3. compares `contextId`, `contextRevision`, source and configuration revision against `evidence.materialization(id)`;
  4. runs the idempotency duplicate check;
  5. reads `evidence.ledger(id)` for the timings;
  6. inserts one evidence row and records the command.

  It creates no action, preparation, binding or counter, does not call `verify` or `requireAcknowledged`, and does not change the materialization.
- **Recommended answer.**
  - **Pre-confirmation:** the route is non-consuming in L1's sense. It becomes binding only if the probe (R1 a) reproduces `STALE_FENCE`. If it does not, close R1 as "not reproduced".
  - **One derivation:** extract `GuidedMaterializationService.acceptedContextRevisions(sessionId)`, which returns `{n}` with no pending delivery and `{n, n-1}` with one. `verifyLifecycle` and the evidence route both use it. The evidence route keeps its own field set and replaces only the `contextRevision ==` comparison with set membership. `sameIdentity` keeps exactly one body.
  - Put the new tests in a **new sibling class**, not in `GuidedServiceTransportFaultIT`, because 011 F-1 rewrites that class. Proposed name: `GuidedEvidencePendingAppendIT`.

### A12. AC-11 f–h, R10c: the post-Ready shape (owner: @architect + security review). Includes Pax D-11

- **Recommended shape** (it mirrors my 012A R8 ruling for pre-Ready):
  1. An unrecorded post-Ready self-stop (source `control-window`) reports outer `RUN_ERROR` with `errorMessage` set to the existing launcher reason (`CANCELLED`, as in R8). The interrupted step's failure becomes the existing `STOPPED_STEP_MESSAGE`. No new vocabulary.
  2. The R8 `recorded` upgrade is extended to revocation facts. A recorded revocation whose control read is then lost still reports outer `CANCELLED`, which the API maps to `AUTHORIZATION_REVOKED` (g). A mandatory regression test covers this.
  3. The `RunnerReportProjection` post-Ready acceptance admits the new shape. The API outcome stays `ERROR` with a null `error_code`, which is unchanged.
  4. **Pax D-11:** the 008 A1 `replayFailure` derivation is unchanged. A post-Ready self-stop projects `replayFailure: null`. That is guaranteed by construction, because `errorMessage` is not `TARGET_DRIFT` and the step failure is not `TARGET_DRIFT`. One `RunnerReportProjectionTest` case proves it.
  5. R10-OBS-2 (i) lands in the same unit. Each of the four `control-window` call sites (`runCoordinator.ts:390/400/404/405` [V]) logs a branch label from a closed set (`noRequestBudget`, `noTimerBudget`, `windowPassed`, `invalidControlBody`), plus integer `latenessMs` and `durationMs`, and nothing else.
- **No window, deadline, TTL or margin changes.**

### A13. AC-11 k, P3: the guided launch deadline (owner: @dev proposes; @architect reviews)

- **Recommended answer.** Wrap `launchGuidedBrowser`'s `launchPersistentContext` (`browser.ts:540`) in the existing `boundedStartup`. Use a Studio-owned constant at or below the guided bootstrap budget. I propose **12 s**: the Java `pushContext` deadline is 15 s, which leaves 3 s for the callback. [I] I have not measured the budget inside the runner; @dev records the source of the number. Reap the whole tree on timeout, on kill and on process stop, through `tree.ts` enumeration. [I] Playwright already starts Chromium as its own process group on POSIX; @dev verifies this and records the group ID evidence. Signals are unchanged.

### A14. AC-12 i: the explicit runner-`dist` dependency (owner: @architect)

- **Recommended answer.** Add a Gradle task `verifyRunnerDist` that does **not** build the runner. It fails if `studio-runner/dist/main.js` is missing or older than any file under `studio-runner/src`. Otherwise it writes `build/runner-dist.json` (the tree digest). Every guided IT task `dependsOn` it, and the shared spawn harness (lane I) attaches the digest to each guided IT's failed-test-state metadata. Rebuilding the runner stays a separate, serialized root step.
- **Rejected:** a Gradle task that runs `npm`/`pnpm build`. It couples the builds and puts a Node install inside Gradle.

### A15. AC-11 d, R8.2: the operational alert form (owner: @devops; @architect concurs)

- **Facts.** [V] The counter exists (`reporting/reportClient.ts:39`, `runner.report.terminal_abandoned`; event `report.terminal_rejected`). The chart has no `PrometheusRule` or `ServiceMonitor`.
- **Recommended answer.** Write the alert as a platform-neutral specification: the event, the condition "any occurrence in 5 minutes", the severity, and the runbook link. It goes into the 010 runbook and `lanes.json`. Add a chart template only after @devops names the monitoring stack. Locally, d is LOCAL-PARTIAL (the specification plus a counter unit test). Firing the alert is external.

### A16. AC-11 co-run: the harness is gone (Quinn gap 5; owner: @architect + @po)

- **Facts.** [V] `git status` shows `StudioCoRunIT` and its six support classes deleted (` D backend/src/test/java/com/citi/put/checks/corun/*`). `tools/corun.sh:60` still names `com.citi.put.checks.corun.StudioCoRunIT`.
- **Recommended answer.**
  - Do not restore the deleted compile-era class. Lane F writes a new `corun/ObservedCoRunIT`. It runs against the folded runner over TLS, uses the shared spawn harness from lane I, and covers the AC-11 legs: duplicate request, ACK loss, process restart, stale owner, late callback, public mid-step cancel of a live guided browser, and runner kill mid-run.
  - Each leg reuses an existing proof where one exists (for example `GuidedServiceTransportFaultIT` for ACK loss) and cites it by name, instead of duplicating it.
  - `tools/corun.sh` and `corun-report.mjs` are re-pointed to the new class in the same unit, so no dangling reference remains.
- **PO action:** an append-only note on AC-11 and in Testing, saying the co-run harness is rebuilt in 009, not "extended". The AC's meaning is unchanged.

### A17. AC-6 Q2 default (owner: user; GO condition 4)

- **Recommended answer.** Confirm the default: observed schedules use parity with `ConfiguredBackgroundAuthorization`, and G-3 refuses outside `local`/`test`. If the user overrides it, the 18 deferrals cannot be re-enabled as written, and AC-6 goes back to @po.

### A18. AC-4 Vault: does a local Testcontainers Vault count as "a dev Vault"? (Quinn gap 8; owner: @qa classifies, @po records)

- **Recommended answer: no.** I concur with Pax AUTO-DECISION 1 and Quinn. AC-4 proves the **deployed** backend token's least privilege, and that depends on ED-02's mount, auth role and policy binding. A container we provision proves only the policy text we wrote.
  - The local run is allowed as a named, non-credited rehearsal (`VaultPolicyIT` against a dev-mode container, labelled "rehearsal").
  - GO condition 3 still blocks Done until the real dev Vault run.
  - [I] `vault` CLI is not installed, so a local container also needs a Docker image pull, which is an install. The user authorizes that, or the rehearsal is skipped by name.

### A19. REL-001 (CONTEXT_LOST swallowed): placement (owner: user scope + @po placement; @architect recommends)

- **Facts.** [V] `guided/ownership.ts:139` (`catch{await this.stopEntry(entry,'CONTEXT_LOST');throw new Error('CONTEXT_LOST');}`) and `runtime.ts:157-160` drop the inner error with no log. The 015 gate says a fix "reopens the runner, image and deployment gates", so it needs a user scope decision.
- **Recommended answer.** Place it in 009, as a value-free diagnostic next to RUNNER-LAUNCH (AC-11). At both catch sites, log the error class name and a closed phase label (`launch`, `recorder`, `blankDocument`, `callback`, `other`). Never log the message or stack. 009 already reopens those gates through the AC-1 fold, so the scope cost QA cited is absorbed. Lane O owns `runtime.ts`, so REL-001 goes there.

---

## Part B: AC-7 benchmark (before T4; Quinn gaps 1–4, 6, 7, 10 and the USD question)

None of these blocks the local lanes or the 011 start. All of them block the first real-model call.

### B1. The 13 "ported" compile cases have no step text or pages in the repo (Quinn gap 1; owner: @po records the interpretation, @qa + @dev author)

- **Facts.** [V via Quinn and Pax] `benchmark/` holds only `results.jsonl` (13 distinct case IDs), `summary.json` and `report.md`. The `:4102/ns/cNN` pages lived in an uncommitted scratchpad.
- **Recommended answer.**
  - Treat them as **re-authored ports**. For each case ID, @qa writes the step text and @dev writes a fixture page under `studio-runner/evaluation/observed-authoring/pages/`. The sources are the case ID, the recorded generated code and the expected class in `results.jsonl`/`summary.json`. Each case records a fidelity note: what is known from the record and what was re-authored.
  - **No comparison with the 2026-10-04 compile numbers is claimed.**
  - The pages are committed this time (ADR-SC-005: "the harness becomes a repository artifact").
  - Because the story says "ported", this needs an append-only PO interpretation note on AC-7. The ≥ 20 rule and the thresholds are unchanged.

### B2. The denominator of "≥ 90 % without clarification on unambiguous cases" (Quinn gap 2; owner: @po rules, @architect recommends)

- **Recommended answer: adopt Quinn's proposal.**
  - The 90 % gate counts **class P** (expected to complete) runs only: 19 cases × 3 = **57 runs, ≥ 52 completions**.
  - Class F (intended failure) and class N (expected refusal or clarification) fall under the **zero-false-pass hard gate**: any PASSED or published plan on F or N fails the gate.
  - F/N correctness (the right refusal, clarification or failure step) is reported with its own denominator but is not gated, except through the false-pass rule.
  - Runs that fail for infrastructure reasons (host collision, startup hang) are re-run **and reported** in the denominator ledger, never silently replaced.
  - With D2 or E1 unrun, the result is reported as **partial** and is never a pass.
- **Why:** only P runs have a defined "completion". Mixing in N cases would reward refusals.

### B3. The iframe enterprise case (Quinn gap 3; owner: @po records, @architect rules the expected outcome)

- **Facts.** [V] `observationCollector.ts:317-319` treats `iframe`, `canvas`, `object` and `embed` as unsupported surfaces (`unsupported = true`).
- **Recommended answer.**
  - The iframe case is **class N**. The expected outcome is an honest refusal or "unsupported surface", and any published plan or action inside the frame is a false pass.
  - Cross-frame observation is a new capability with its own privacy review: frame origins against `allowedOrigins`, and a frame's content counting as page metadata under the OBS-014 approval. It is not 009 scope.
  - If the PO wants cross-frame support at GA, that is a new story, architect-first.

### B4. There is no benchmark harness (Quinn gap 4; owner: @architect design, @dev builds)

- **Facts.** [V via Quinn] `evaluation/lifecycle.mjs:93,120` drives `/compile` and `/confirm-compile`, and the public OpenAPI has 0 such routes. `evaluation/observed-authoring/` is untracked and holds only the two incremental case files.
- **Recommended answer.**
  - Lane **E-prep** writes a new `evaluation/observed-authoring/evaluate.mjs` against the **public** API only:
    - save the v2 authoring;
    - Run, which by readiness gives a guided start or an execute;
    - poll the session;
    - answer a clarification only when the case script says so (otherwise count it);
    - let the frontend-equivalent finalize run exactly once;
    - replay;
    - read the result and the explanation;
    - query the case's independent oracle (B6).
  - Reuse `oracle.mjs`, `report.mjs` and `fixture-server.mjs` where they still apply.
  - Delete `lifecycle.mjs` and its test. Under the single path, a compile-era driver is dead code. This is "extend, do not fork" applied honestly: we extend the oracle and report layers and replace the dead driver.
  - Self-test the harness with the test-profile fixture provider. Those runs are labelled harness self-tests, never D-C evidence.

### B5. Incremental case fixture mode and RS-1 (Quinn gap 6; owner: @qa in the manifest)

- **Recommended answer.**
  - The manifest declares `mixedVisible` for both incremental cases and for D3. The value is in `<output>`, which a governed grant reaches. That is a declared fixture choice, not a page edit.
  - Do not add an `exact`-mode case to the class-P set. RS-1 is measured on the re-authored ports and the staging pages, as AC-7 RS-1 a–d says.
  - If the PO wants RS-1 evidence before staging exists, add one `exact`-mode case **as class N-RS1**. Its expected outcome is a clarification or "unreachable", which is reported under `rs1NonScalarReadGaps` and is not in the 57-run denominator. The story says RS-1 runs stay inside the gate denominators, so this needs a PO note.

### B6. An independent expected outcome for every case (Quinn gap 7; owner: @qa defines, @dev builds)

- **Recommended answer.** No case enters the corpus without an **oracle that is independent of the learned plan and of the model**:
  - a receipts or event endpoint on the fixture page (the `/__receipts` pattern of `secret-login/server.ts` and C04's control port 4101);
  - or, for staging, an application-side read the app owner provides.

  The expected-outcome record is written before the first run and hashed into the manifest. A case without an oracle is not admitted. A DOM post-state check through the same runner is not independent.

### B7. Model budget: 81 sessions against 20 full sessions per CSI per day, and 7 proposals per session (Quinn gap 10; owner: @architect + @pm, MODEL-SIZING)

- **Facts.**
  - [V via Quinn's arithmetic on `application.yml`] The per-CSI daily budget is 5,242,880 input and 640,000 output tokens. That equals 20 full-ceiling sessions per CSI per day, with no refund. With 3 repetitions plus incremental bases, the benchmark needs 81 sessions, and 122 with a ×1.5 re-run contingency.
  - [V story Dev Notes] Under production defaults the per-session output total (32,000) divided by the per-call output (4,096) allows 7 proposals per session.
- **A second blocker Quinn's draft does not name [I].** If a 10-step full learn needs more than 7 model proposals, the incremental base sessions end `BUDGET_EXCEEDED` whatever the model quality. The benchmark would then measure the ceiling.
- **Recommended answer.**
  1. **Before T4, measure locally with no model.** Run the two 10-step incremental cases plus D3 with the test-profile fixture provider **at production default ceilings**, and record reserved proposals and tokens per session. If any case needs more than 7 proposals, @architect and @pm rule a benchmark-scoped per-session output total before T4 (MODEL-SIZING path, PM acknowledgement).
  2. For the daily budget, rule a **temporary, benchmark-environment-only per-CSI daily budget** sized for 122 sessions. It is recorded in the pinned-runtime block and reverted after the run. Do not spread the run over 5 or more CSI-days: provider or model drift across days would confound the 3 repetitions, and several CSIs add authorization variance. Per-session ceilings stay at the values being measured.
- **Trade-off.** One explicit config deviation, recorded and reverted, against a 5-day run with uncontrolled drift.

### B8. USD 500: no price source, and the 2026-10-04 "500" was a call count (owner: user + ED-01 owner; @qa drafts)

- **Facts.** [V via Quinn] `summary.json` has `pricing.estimatedCostPerCompileUsd: null`, and the 2026-10-04 "budget limit 500" was 500 model calls (473 used). The GA plan says actual wave spend is "not exposed anywhere". README says the USD 500 is the whole-wave authorization.
- **Recommended answer.**
  - The admission is expressed as a **token cap plus a price condition**, as in Quinn's §5–§7.
  - No real-provider call happens until two figures are written into `budget-admission.json`: the remaining headroom R, from the user with its source, and the gateway price list, from the ED-01 owner. Without a price, the record reads `ADMISSION_REFUSED_PRICE_UNKNOWN`.
  - Nobody converts the 2026-10-04 call count into dollars.
  - Keep Quinn's stop rule: stop at 80 % of the allocation or at the first hard-gate hit.
- **Not an @architect decision:** R and the price belong to the user and the ED-01 owner. I only confirm that the token envelope Quinn derived (scenario H ≤ 21.23 M input / 2.59 M output for 81 sessions) is the right enforced bound, **provided** B7's measurement does not change the per-session ceilings.

---

## Part C: at 009 time, after a probe

- **C1. ADJ-1 (AC-11 a–c).** Not ruled in advance, as the story requires. Criteria I will apply after the failing probe exists:
  - choose (a), a narrowly checked pre-Ready `AUTHORIZATION_REVOKED` path, **only if** it can be expressed as one added predicate on the existing ledger CAS, with no reaper, deadline or OBS-006 edge widening;
  - otherwise choose (b), documented reaper settlement.

  If (a) needs SQL, it is a new migration after 008's V22 (@data-engineer).
- **C2. R10-rev2-2 child exception-class log (AC-12 e).** Still a candidate only. If A19 is adopted, the same value-free phase and class log pattern is the natural vehicle. I will rule it in with A19's change only if the observation recurs.

---

## Part D: items for 010 and 011 that this plan depends on

- **D1. 010 T2 may start before 009 Done (Pax 010 D-1 / S-5; owner: @po).** Recommended: an append-only 010 note mirroring 011's amendment. T2 (runbook and Live surface) starts after 008 Done, because 008 L0 edits `docs/runbooks/studio-guided-authoring.md`. Its **Live surface list is finalized against the tree at the 009 local gate**, because the AC-1 fold changes runner keys and chart values. Drafting during 009 W2 is allowed under `docs/qa/evidence/STUDIO-OBS-010/` only.
- **D2. Who validates "009 local ACs implemented and validated" (Pax S-2; owner: coordinator).** Recommended: an independent @qa **local-validation record** over the listed local halves at one source digest. It is not a Done verdict and not a story status change.
- **D3. Files 011 must not touch while 009 items are open (Pax S-3/S-4; owner: coordinator).**
  - If AE-01 is still waiting for the Security & Compliance acknowledgement: `studio-runner/src/run/observationCollector.ts` and `src/guided/runtime.ts`. The 011 reformat skips them and records why.
  - If TF-3 has not landed: `backend/.../studio/StudioService.java`.
  - TF-3, AE-01 and FM-01 are **not** 011 start conditions.
- **D4. 011 T0 rulings, previewed so they do not surprise 011 (owner: @architect at 011 T0; recommended answers only).**
  - **F-1 shape.** Re-verify first: `GuidedSessionService.java` is now `cfb55a54…`, with the arms at `:370/:828/:862/:1424/:1995` and the unconditional gates already at `:177/:191/:405` [V]. Apply `require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` at each of the five conditional sites, and remove the `:691-695`-era `instanceof` conditional in the same change, because there is one production access. The F-1 d grep lists the three pre-existing gates as intended hits.
  - **CLN-F2.** Retire the historical V18 adapter (@data-engineer co-signs). No environment holds a re-baselined V18 population. Port the `InferenceMigrationIT` V18 cases to the head writer by name.
  - **Wait library (AC-5).** Allow `testImplementation("org.awaitility:awaitility")` with no explicit version, managed by the Spring Boot BOM. [V] `org.awaitility` is in the local Gradle cache. [I] Whether that cached version matches the BOM's is unverified. If it would need a download, use an in-repo `support/Await` helper instead (no install).
  - **TEST-002** (order-dependent ReplayIT latch): place it in 011 AC-5 as a named item.
  - **TEST-003** (`pendingTeardowns LIMIT 32` starvation): this changes behaviour, so it does not belong in 011. Put it in the README follow-up backlog, owner @dev.
  - **JaCoCo vacuous `compile`/`compile.gateway` rules** and **DOC-001** (dead `isBlank`, stale Javadoc): 011 AC-1 new candidates.
  - **Fold order:** the dispatch-client fold edits every test that references `GuidedRunnerClient`/`ObservedValidationClient` (18 test files [V]), several of which F-1 also migrates. So F-1 lands first, then the fold, then the `claim()`/`checkCommand` splits, then the IT wait conversion (`lanes.json` 011 waves).

## Not claimed

No ruling is issued here. No source, contract, story or lifecycle edit was made, and no test, build or migration was run. Quinn's and Pax's facts marked "[V via …]" are theirs; where I re-checked one, it is marked [V].
