# STUDIO-OBS-009 pre-F-merge rulings (W2 lane findings)

- **Author:** Aria (@architect). **Date:** 2026-10-18. **Mode:** YOLO, docs only.
- **Binding:** for root at F-merge, and for the lanes named per item. Root applies every source and test change below. The only file I edited besides this one is `docs/architecture/ADR-002-internal-contract-surface.md` (item 7), and that edit only adds text.
- **Inputs:** the W2 receipts `../r2/receipt.md`, `../p2/receipt.md`, `../r1/receipt.md`, `../d1/w2/receipt.md`, `../d3/receipt.md`, `../b/receipt.md`, `../bl/receipt.md`, `../bl/d5-e-backend-stop-record.md`, `../d2/receipt.md`, `../d2/rotation-and-cert-inputs.md`; my rulings `../w1.5/ruling-part1.md` and `../w1.5/ruling-part2.md`; T0 ruling A12 (`../../prep-20261016/t0-rulings/ruling.md`); the 2026-10-14 fixture ruling `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/architecture/profile-safety-fixture-ruling.md`.
- **What I ran:** read-only `cat`, `sed -n`, `grep`, `awk` and `ls` over the cited files, plus one `python3` that inserted the §13 row into ADR-002. I ran no build, test, Gradle, pnpm or git command (other than `git diff` on the ADR to check that my edit only adds lines). I did not open `.aiox-core/core/permissions/dispatch-governance.js`.
- **Legend:** **[V]** = verified today by reading the cited `file:line`. **[I]** = inference.

## 0. Summary

| # | Item | Ruling | Owner |
|---|---|---|---|
| 1 | F-R2-1, two `browser-profile-safety` fixtures | **(a) Change the fixture.** No graceful stage on a failed launch. The fixture gets a `terminate` oracle (§1). This amends my 2026-10-14 fixture ruling for the failed-launch path only. | root at F-merge; @qa co-signs the oracle |
| 2 | `observed-secret-control > lost-control-body` | **(a) Update the test** to expect `RUN_ERROR`, `errorMessage` `CANCELLED` in that mode only. No backend mapping. The production residual is disclosed. | root at F-merge; @po discloses |
| 3 | D1 F3, static Playwright import in `main.ts` | **Accept.** No change. | none |
| 4(i) | Connector port serves the whole servlet app | **Both are required in 009:** path scoping in the backend, and an API ingress NetworkPolicy in the chart. | D3 file, D2 chart; root applies |
| 4(ii) | PKCS12 + password files vs PEM | 009 stays PKCS12 + password files. cert-manager `keystores.pkcs12` is the preferred route. Noted for D2 and 010. | D2 (doc), 010 (runbook) |
| 4(iii) | `StudioRunnerConfiguration` calls the shape-only `validate()` | **Do not move it in 009.** The fold is carried to 011. | 011 |
| 4(iv) | **New, found while ruling 4(i):** the chart renders `studio.guided-authoring.tls-connector.port`; the backend reads `studio.guided-authoring.connector.port` | **This blocks F-merge.** D3's name wins. | root (D2 files) |
| 5 | The teardown executor sheds work silently; after the window only a count is logged | **Carried, not in 009.** The shed-visibility fix goes to 011. The alert after the window goes to the GA backlog. | @po (011 row), Platform/SRE |
| 6 | B-R2-1, optional `terminate`/`orderlyClosed` | **Make both required at F-merge.** Root updates the three doubles and deletes the fallbacks. | root |
| 7 | ADR-002 §29.2 item 7 sentence and §13 row for ADJ-1 | **Inserted by me** (append-only). The exact text is in §7. | done |

---

## 1. F-R2-1: the two `browser-profile-safety` fixtures go red under D5-1 item 2

### 1.1 Decision: (a), change the fixture. D5-1 item 2 stands.

A failed launch never takes a graceful `context.close()`. It always takes the hard teardown: kill this launch's tree, check for survivors, and only then remove the scratch.

The fixture's oracle was written on 2026-10-14 against a production cleanup that awaited `context.close()`. That is why it requires "exactly one production raw close" [V `profileSafetyFixture.ts:149`, `PRODUCTION_CLOSE_REQUIRED`]. Its purpose was a safety property, not a mechanism. The 2026-10-14 ruling, `:60` and `:64` [V], says:
- credit requires every retained PID to be definitely gone at the first observation after production's close;
- production must not remove scratch while confirmation is pending or rejected.

The hard teardown gives that property directly, and more strongly:
- survivors are checked before `disposeScratch` [V `browser.ts:700-701`];
- a survivor or an unreadable table rejects `CONTEXT_LOST` and keeps the scratch [V `:700`];
- a resolved `context.close()` never verified process death (my part-1 §2.9 residual).

R2's scratch run shows that the safety facts hold: `expectedRefusal`, `canaryUnchanged` and `outsideIdentityUnchanged` are all true, and 0 processes survive [V per `../r2/receipt.md`, F-R2-1].

**Why not (b), a bounded graceful stage on the launch-failure path:**
1. **It makes the bound depend on clock arithmetic.** A non-deadline failure can happen at any point up to the 12 s start budget. With G = 3 s, the settle is at most 12 + 3 + 1.5 = 16.5 s. That is past the 13.5 s reserve and past the backend's 15 s ceiling [I, arithmetic from part 1 §2.2]. A clamp `min(G, reserve left)` gives about zero grace for a late failure. The fixture's "exactly one `context.close()`" would then hold only because its injected failure happens early. That oracle depends on timing, which is worse than the one we have.
2. **It buys nothing.** A failed start has run no step and has no recording to save (part 1 §2.2). Whatever graceful stage it gets, the hard teardown still runs afterwards as the check.
3. **It brings back the behaviour R2 proved wrong.** Mutation M5 turns F3 red [V `../r2/receipt.md`, mutations table].

### 1.2 Amendment to the 2026-10-14 fixture ruling

This applies only to the failed-launch path. The started-session path and the positive case are unchanged.

- For a launch that **fails after context acquisition**, production confirmation is the **hard teardown**, not the SDK close. Credit requires all of the following:
  - (i) production made **0** real `context.close()` requests;
  - (ii) when the launcher rejects (non-deadline failure, so the teardown has already settled, per R2 deviation 2), **every** retained owned PID is definitely gone at the **first** probe;
  - (iii) the browser is disconnected;
  - (iv) no `checks-guided-*` scratch remains;
  - (v) the attack facts hold: canary unchanged and the outside identity unchanged.
- Everything else in the 2026-10-14 rules is unchanged:
  - the first LIVE or UNKNOWN observation stays red even if a later poll finds the PIDs gone;
  - the fixture sends no signal;
  - fallback cleanup never turns a red result green.

### 1.3 Exact changes (root at F-merge; @qa co-signs the oracle at the F gate)

**`studio-runner/test/helpers/profileSafetyFixture.ts`**
1. Add a port option `productionTeardown: 'contextClose' | 'terminate'`. The default is `'contextClose'`, so `test/profileSafetyFixture.test.ts` and the started-path behaviour do not change.
2. In `'terminate'` mode:
   - **In `handoff`, after the attack completes:** take a second snapshot and set `precloseSnapshotValid = true`. The launcher's catch runs the teardown before `body` sees the outcome, so the snapshot must exist before production acts.
   - **Count any raw close during production.** `installClose` still wraps the context. A call to that wrapper while `productionCall` is set, or before `run`'s body starts, counts in `productionRealCloseRequests`. In this mode any such call is a red finding with the new closed code `GRACEFUL_CLOSE_ON_FAILED_LAUNCH`. Add the code to `diagnosticCodes`.
   - **New method `observeProductionTeardown()`,** called by the test body right after the launcher rejects:
     - records `firstPidProbeMs` and `firstPidState = state()` once;
     - sets `safeToRemove = firstPidState === 'DEAD' && !owned.connected() && facts.browserDisconnectedEvent`;
     - throws the new closed code `TERMINATE_UNCONFIRMED` (add it to `diagnosticCodes`) on any other result. `contextCloseEvent` is recorded but not required [I: whether Playwright emits the context `close` event on a SIGKILL'd persistent context was not checked].
   - **Replace the `run` post-condition (`:149`) in this mode** with: `productionRealCloseRequests === 0 && firstPidState === 'DEAD' && safeToRemove`, else `PRODUCTION_TERMINATE_REQUIRED` (add it to `diagnosticCodes`).
   - **The cleanup stages are unchanged.** When `safeToRemove` is true, no raw close and no fallback are attempted.
3. Add `productionTeardown` to `ProfileFixtureFacts`, so the persisted `profile-safety.json` says which oracle credited the case.

**`studio-runner/test/profileSafetyFixture.test.ts`** (the fixture's own unit tier), three new cases:
- terminate mode with a production raw close: red, `GRACEFUL_CLOSE_ON_FAILED_LAUNCH`;
- terminate mode with a LIVE PID at the first probe that is gone at a later poll: red, `TERMINATE_UNCONFIRMED`, and no green after the poll;
- terminate mode with all PIDs gone and the browser disconnected: green.

The existing context-close cases are unchanged.

**`studio-runner/test/fixtures-tier/browser-profile-safety.test.ts`**
- **Test at `:46`, renamed** `a failed launch after context acquisition takes the hard teardown: no context.close(), processes and scratch gone when it rejects`:
  - Keep the `goto` injection and the `launchPersistentContext` spy, and capture `args[0]` (the profile path).
  - Replace the `INJECTED_UNCONFIRMED_CLOSE` wrapper with a call counter on `context.close`.
  - Assert:
    - (1) the launcher rejects with a `GuidedLaunchFailure`;
    - (2) at rejection, `context.close` was called 0 times;
    - (3) at rejection, 0 `checks-guided-*` entries remain under the stubbed `TMPDIR`;
    - (4) at rejection, a read-only `ps -axo pid,command` listing has 0 lines that contain the captured profile path (no signal is sent);
    - (5) `await failure.close()` resolves twice (it is memoised), with the scratch still empty and `context.close` still called 0 times.
  - The "scratch kept on an unconfirmed teardown" property moves out of this test. Its proof is `test/run/guidedBrowserReap.test.ts:97`, `:106` and `:136` (a real-process survivor, an unreadable table, and the source pin that the survivor check comes before scratch removal) [V that those cases exist], plus unit U3 (`test/guided/browser.test.ts:80`). The "a second close succeeds after the first failed" retry is removed on purpose: teardown is memoised, a repeat close returns the same rejection, and D4 and U3 rule that the slot stays held [V `browser.ts:675`].
- **Test at `:51`:**
  - construct the harness with `productionTeardown: 'terminate'`;
  - in the body, replace `await harness.productionClose(() => failure.close())` with `await harness.observeProductionTeardown(); await failure.close();` (the second call is the memo and must resolve);
  - keep every attack, canary and identity assertion as it is.

**Verify** (in R2's scratch-copy recipe, so that the evidence write under `STUDIO-OBSERVED-NEXT/strict-qa-20261014/.../native-runs/` does not land in the repo):
- `test/profileSafetyFixture.test.ts` (unit tier);
- `test/fixtures-tier/browser-profile-safety.test.ts`, all cases green, twice;
- `test/fixtures-tier/guidedCloseBound.test.ts`, unchanged.

Copy the persisted `profile-safety.json` into `f-merge/profile-safety/`, with its sha256.

**Mutation** (record it, then revert): restore a graceful `context.close()` on the catch path (R2's M5). Both renamed cases must go red: `:46` on assertion (2), and `:51` with `GRACEFUL_CLOSE_ON_FAILED_LAUNCH`.

**Security:** no relaxation. The fixture still proves refusal of the live redirect, no write through the link, and no scratch removal over a live owned PID. Only the oracle for *which* production call confirms closure changes.

---

## 2. `observed-secret-control > lost-control-body`

### 2.1 Decision: (a), update the test. No backend mapping.

In this mode the fake backend has recorded the revocation, but the runner never learns the fact:
- every later control body is truncated [V `observed-secret-control.test.ts:80`];
- every acknowledgement is `{}`;
- the browser is killed behind a blocked renderer, so no later progress is sent (R1 receipt).

T0 ruling A12 says, word for word: "An unrecorded post-Ready self-stop reports outer `RUN_ERROR` with `errorMessage` `CANCELLED` … API outcome stays `ERROR` with null `error_code`" [V `t0-rulings/ruling.md:112+`]. The test asserts the pre-A12 shape.

**Why not (b), mapping `RUN_ERROR` + `CANCELLED` + revoked to `AUTHORIZATION_REVOKED`:**
1. **It contradicts A12 and B's pin.** `theRevocationMappingIsKeyedOnTheRunnersOuterCancelledNotOnTheSelfStopShape` [V `../b/receipt.md` §3] pins the opposite.
2. **It invents a cause.** The runner stopped because its control window failed, not because it learned of a revocation. `revoked_at` may be written by `SecretRevocationSweep` after the self-stop. Ordering the two would need a comparison across clocks, and R9/R10 ruled DB-clock decisions with no tolerance. That is the "invented cause" R8 forbids, in the other direction.
3. **It re-opens a closed lane at F-merge.** That needs a second security co-sign.

The fake backend's alternative (acknowledging `{"revoked":true}`) is also rejected. It would turn this mode into `progress-revoked`, which already exists and stays `CANCELLED` [V `:70`, `:86`].

### 2.2 Exact change (root at F-merge; the file is in P2's write set, and P2 is closed)

In `studio-runner/test/fixtures-tier/observed-secret-control.test.ts` `:124`, make the FINAL expectation depend on the mode:
- **`lost-control-body`:**
  - `outcome.result === 'ERROR'`, `outcome.errorCode === 'RUN_ERROR'`, `outcome.errorMessage === 'CANCELLED'`;
  - the interrupted step is `SKIPPED`. If `STOPPED_STEP_MESSAGE` is exported from `runCoordinator.ts`, also assert its failure equals it. Otherwise assert `SKIPPED` only and do not export it for the test.
  - Add a comment that cites A12 and this ruling.
- **`worst-phase`, `slow-revoked`, `progress-revoked`:** unchanged, `ERROR` / `CANCELLED`. `slow-revoked` and `progress-revoked` are the fixtures-tier half of A12's mandatory regression (a recorded revocation keeps outer `CANCELLED`). They must stay green unedited [V: P2's sim run shows only `lost-control-body` red, 23/24].
- Add `outerErrorCode` to the persisted `facts`.

**Verify:** the file, all four modes, in a scratch copy (it writes `docs/qa/evidence/STUDIO-OBS-007/runner-control-focus-candidate/oracle-<mode>.json`, which is another story's evidence). Copy the four oracle files into `f-merge/secret-control/`.

**Mutation** (record it, then revert): drop `!control.recorded` from R1's rewrite (R1's RM1). `slow-revoked` and `progress-revoked` must still be `CANCELLED`, and `lost-control-body` must turn red. That proves the per-mode expectation is not vacuous.

### 2.3 Production residual (disclosed, not fixed)

Here is the case: a revocation is recorded, the control read is lost, and no later acknowledgement arrives. The API then shows `ERROR` with a null `error_code`, while the ledger carries `revoked_at`.
- This fails closed: the run stopped and the secret was not used further.
- The record stays (`revoked_at` is write-once). Whether the secret-use audit row names the revocation in this path is [I], not checked.
- **@po** adds one known-limitation line to STUDIO-OBS-009 (the id is @po's choice): "a revocation the runner could not learn through either channel is reported as an error with no named code."
- A cause mapped with time ordering is a GA backlog candidate only if pilot evidence shows the case.

---

## 3. D1 F3: `main.ts` statically imports `run/browser.ts`

**Decision: accept. No change.**

- The dynamic-import ban is a **security boundary**: "artifact content must never reach a module loader (architecture §4.5)" [V `eslint.boundary-rules.js:200-202`]. An exception for one literal specifier would weaken a security rule to save start-up cost. That trade is rejected.
- An injected factory "outside the main module graph" does not exist. `main.ts` is the composition root. A process that can launch a guided browser has to reach `launchGuidedBrowser` from its graph somewhere.
- Playwright confinement still holds. `browser.ts` is the only module that imports Playwright [V `eslint.boundary-rules.js:124-137`, `grep -rln "from 'playwright" src` gives `src/run/browser.ts` only].
- Loading the module launches nothing. The replay child is still a fork, and it imports Playwright itself anyway.
- **Cost:** parent memory and start time in a replay-only pod. This is [I], not measured. It is covered by the open "Unmeasured" row in `../d2/resource-basis.md:19` (owner @devops/@qa, G-4). No separate measurement is required.
- **Guard:** the existing lint rule (no `ImportExpression`) and D1's real-process smoke (replay-only starts over TLS) [V `../d1/w2/receipt.md` F4]. No new test.

---

## 4. D3 findings

### 4(i) The connector port serves the whole servlet app

**Facts:**
- API pods have **no** ingress NetworkPolicy. The only policy in the chart selects runner pods [V `helm-chart/put-checks/templates/` has one `kind: NetworkPolicy`, `studio-runner-networkpolicy.yaml`].
- The guided internal chain matches `/internal/v2/studio/guided-sessions/**` [V `GuidedInternalSecurity.java:55`]. On the connector port it needs a certificate plus an RS256 JWT; on the plain port it refuses with 401 [V `../d3/receipt.md:153`].
- The coordinator hop runs on **worker** pods (`@Profile("!api | worker")`) and calls the connector [V `GuidedTranslationConfiguration.java:123-133`]. So the connector has two legitimate callers: runner pods (callback and claim) and worker pods (coordinator).
- The runner can already reach the API's plain port, by egress rule 1 [V `studio-runner-networkpolicy.yaml`]. So the connector adds no reach for a compromised runner [I]. Path scoping is defence in depth, and it is cheap.

**Decision: both are required in 009.**

**a. Path scoping in the backend.** Owner file: `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java` (`GuidedTlsConnector`, D3's write set). Root applies it at F-merge.
- **The filter:**
  - a `FilterRegistrationBean<OncePerRequestFilter>` with order `Ordered.HIGHEST_PRECEDENCE`, so it runs before Spring Security;
  - registered only when the connector exists (port > 0, profile `!worker`).
- **The rule:**
  - The filter applies only when `request.getLocalPort()` equals the **started** connector's `getLocalPort()`. Keep a reference to the `Connector` the customizer creates; this works with port 0 in tests.
  - On that port, the request passes only if both of these hold:
    - (1) the raw `getRequestURI()`, without the context path, starts with `/internal/v2/studio/guided-sessions/` and contains none of `..`, `;`, `%2e`, `%2E`, `%2f`, `%2F`, `%5c`, `%5C`;
    - (2) `getServletPath()` + `getPathInfo()` starts with the same prefix.
  - Anything else gets `404` with an empty body and no `WWW-Authenticate` header, and no further filter or handler runs.
  - A connector whose local port is not positive refuses everything (fail closed).
  - The plain port is untouched.
- **Tests** (`RunnerTlsClientCertIT`, the real-context connector case, `../d3/receipt.md:153`):
  - (1) on the connector, with a valid client certificate, a public route (any existing `GET /api/...` route) and `/actuator/health` get `404`, and no controller is invoked;
  - (2) `/internal/v2/studio/guided-sessions/x/..%2F..%2Fapi/...` on the connector gets `404`, or Tomcat's own `400`; both are acceptable, but it must not be `200`;
  - (3) the existing guided case on the connector is unchanged (`422` from the controller with certificate plus JWT, `401` without the JWT);
  - (4) on the plain port, the same public route behaves as before;
  - (5) **mutation** (record it, then revert): drop the local-port check, and case (4) or (3) goes red; or always pass, and case (1) goes red.

**b. NetworkPolicy for API ingress.** Owner: the chart (D2's area), applied by root at F-merge. New template `helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml`, rendered **only when guided is enabled** (the same `put-checks.studioRunner.guidedEnabled` guard).
- `podSelector`: the API selector labels. `policyTypes: [Ingress]` only; egress is not touched.
- **Rule 1:** every API container port **other than** `guided-tls`, with no `from` (all sources). Today that is the `http` port [V `deployment.yaml:113`]. This keeps today's ingress for those ports. It is needed because a pod selected by any ingress policy denies all ingress that is not listed.
- **Rule 2:** port `guided-tls` [V `deployment.yaml:118-119`], `from` the runner pod selector **and** the worker pod selector.
- **Chart tests** (`studio-runner/test/deployment/`, next to `tls-client-cert.test.ts`):
  - (1) not rendered when guided is off;
  - (2) when guided is on: the rule-1 ports are exactly the set of the rendered API Deployment's container ports minus `guided-tls`. This is derived from the rendered Deployment, so a port added later without the policy fails the test.
  - (3) rule 2's `from` is exactly {runner selector, worker selector};
  - (4) the existing runner-policy assertions are unchanged.
- **Not claimed:** enforcement. It depends on the cluster CNI (SPK-05 is still open). @devops proves it in the cluster at G-4/010.

**c. The trust store's issuer must be dedicated.** The client certificate is the transport gate. The backend trust store (`studio.runner.tls.trust-store`) must therefore hold **only** the issuer of the Studio service plane, never a shared cluster or mesh CA. D2 adds this sentence to `../d2/rotation-and-cert-inputs.md`, and the 010 runbook repeats it.

### 4(ii) PKCS12 plus password files vs PEM (a note for D2 and 010)

- **009's contract stays PKCS12 stores plus password files** [V `../d3/receipt.md:116`; the chart renders `key-store-type` from `storeType`, `_helpers.tpl:423-428`]. No backend code change in 009.
- **Preferred issuance:** cert-manager `Certificate.spec.keystores.pkcs12` with `create: true` and a `passwordSecretRef`. The password is mounted as a **file** from that Secret's key, and the Secret is mounted as a directory without `subPath`, so rotation propagates. The generated `truststore.p12` holds only that Certificate's `ca.crt`. That is enough only if the runner certificate and the connector certificate come from the **same** issuer. Otherwise the trust store is a separate bundle (trust-manager PKCS12 target, or Platform). Which cert-manager version and PKCS12 profile Platform runs is [I], not checked; Java 21's reading of either profile is [I].
- **If Platform issues PEM only:** convert on the issuer side (in the Platform pipeline), not in the pod. A conversion init container would put private-key processing and an `openssl` image into the pod that renders untrusted pages. A PEM loader in `StudioRunnerTls` (Spring Boot PEM SSL bundle) is a GA-backlog option, opened only if Platform can deliver neither PKCS12 nor issuer-side conversion.
- **Owners:** D2 records both routes in `rotation-and-cert-inputs.md`; 010's runbook names the chosen route; Platform/SRE confirms.

### 4(iii) `StudioRunnerConfiguration` still calls the shape-only `validate()`

**Decision: do not move it in 009. Carried to 011 as code health.**
- `StudioRunnerTls.Wiring` has no `@Profile` and no `@Conditional`, and the main sources have no lazy initialisation [V `StudioRunnerTls.java:512-533`; `grep` for `lazy-initialization`/`@Lazy` in `backend/src/main` finds nothing].
- Its bean runs `runner.validate(environment)` (the shape check plus the profile transport rule) [V `:531`, `StudioRunnerProperties.java:68-70`].
- Every runner-facing client depends on that bean [V `grep -rln StudioRunnerTls`: `HttpRunnerDispatchClient`, `GuidedTranslationCoordinator`/`Configuration`, `GuidedSessionConfiguration`, `GuidedPublicationConfiguration`].
- So no runner client can exist without the full check. The marker bean's shape-only call is a redundant subset, and it is harmless.
- **011:** fold to one entry point. Delete `StudioRunnerValidated`, and let `StudioRunnerConfiguration` keep only `@EnableConfigurationProperties`. Guard: D3's profile-gate tests stay green, and `grep -rn "runner.validate()" backend/src/main` returns 0. @po adds the 011 row.

### 4(iv) New finding, blocks F-merge: the connector property name differs between chart and backend

- **Fact:** the chart renders `studio.guided-authoring.tls-connector.port` and `.tls-connector.client-auth` [V `_helpers.tpl:442-443`], and lists them as reserved at `:553`. The backend reads `studio.guided-authoring.connector.port` [V `GuidedSessionConfiguration.java:237`, `:256`, `:290`]. The deployment test pins the chart's name [V `tls-client-cert.test.ts:180`, `:202-203`, `:293`].
- **Effect:** with the chart as it is, a guided-enabled API pod reads port 0 and refuses to start outside local/test ("connector.port is not set"). That fails closed, but no guided deployment can start [I, from the two [V] facts].
- **Decision: D3's name wins.** D2's own F2 pre-agreed this: "if it names them differently, change the one helper" [V `../d2/receipt.md:105`]. Root applies:
  - `_helpers.tpl:442` renders `studio.guided-authoring.connector.port`;
  - delete `:443`: the connector hard-codes `clientAuth` required, and a knob nobody reads is surface;
  - fix the reserved list at `:553` and the comment at `:410`;
  - update `tls-client-cert.test.ts` `:180`, `:202-203`, `:293`.
- **Tripwire:** `grep -rn "tls-connector" helm-chart studio-runner/test/deployment` returns 0.
- **Test:** the deployment suite asserts that the rendered `studio.guided-authoring.connector.port` equals `studioRunner.guided.tlsConnector.port`.

---

## 5. B/BL finding: the teardown executor sheds silently, and after the window only a count is logged

**Decision: carried, not in 009 scope.**

**Why not 009:**
- **It is availability, not safety** [V `../bl/d5-e-backend-stop-record.md` §2]:
  - the durable `teardownRequest` survives a discarded attempt;
  - `TEARDOWNS_IN_FLIGHT.add` happens inside `teardownAttempt`, so a discarded task never marks itself in flight, and the next 10 s tick queues it again [V `GuidedSessionService.java:1639-1650`, `:2757`];
  - nothing is confirmed on a timeout;
  - the slot belongs to the runner.
- **D5-1 and D5-2 make confirmation inside the window the normal case.** With A2.6's single guided replica, chains blocked at the same moment all target one runner [I].
- **Ownership:** `GuidedSessionService.java` is promised to OBS-011 CLN-F1 (BL finding 3). F-merge is no place for new behaviour.

**Carried to 011** (@po adds the row to `STUDIO-OBS-011-cleanup-inventory.md`; if @po rules it out of 011's scope, it goes to the GA backlog instead):
1. Replace `DiscardPolicy` (`:2807`) with a handler that increments a shed counter and logs, at most once per interval, one value-free WARN with the count. Same shape as `reportAbandonedTeardowns` (`:1659-1672`): no identifier.
2. `redriveTeardowns` also skips ids that are **queued** and not yet started, not only ids in flight. Today a tick can queue the same id again behind a blocked chain [I from `:1639` vs `:2757`]. Duplicates fill the 64-slot queue and starve fresh first attempts.
3. **Tests:** a unit test with an injected executor that is saturated:
   - the shed WARN is logged once per interval, and the durable request is intact;
   - the next tick queues the id exactly once;
   - an id already queued is not queued twice.
4. **No change** to the pool size, the queue size or the 15-minute window without a measurement.

**After the window:** no change (the accepted 015 H8 shape, `aria-warn-ruling01`). An operator alert on the existing WARN line `Guided teardown unacknowledged past the re-drive window` goes to the **GA backlog**, in the same family as D2's platform-neutral alert spec (A15). Owner: Platform/SRE, once they name the monitoring stack.

---

## 6. B-R2-1: make `terminate` and `orderlyClosed` required at F-merge

**Decision: required.** The fallbacks are not harmless:
- `terminateOf` falls back to `close` [V `runtime.ts:63`]. A `GuidedBrowser` without `terminate` would therefore run the **graceful** stage on a start failure, which is exactly the path D5-1 forbids.
- `orderlyClosed?.() ?? true` [V `:598`] reports an orderly recording for any implementation that does not say.

The type is the guard.

**Root applies at F-merge.** All lanes are closed, and the three files sit in three different write sets:
1. `src/run/guidedBrowser.ts`: `readonly terminate: () => Promise<void>` and `readonly orderlyClosed: () => boolean` (drop the `?`). Update the two doc comments that say "optional".
2. `src/guided/runtime.ts`:
   - delete `terminateOf` (`:63`);
   - `:595` and `:613` call `browser.terminate()` and `late.terminate()`;
   - `:598` becomes `orderlyClose = browser !== null && browser.orderlyClosed()`.
3. The three doubles gain `terminate: vi.fn(() => Promise.resolve()), orderlyClosed: () => true`. `orderlyClosed: () => true` keeps today's behaviour under the old `?? true`.
   - `test/guided/stopReason.test.ts:31`
   - `test/guided/incrementalRuntime.test.ts:42`
   - `test/guided/transport.test.ts:148`

   None of them asserts on `close` [V grep], so no assertion moves. `test/helpers/recordingScratchWorker.mjs` uses the real launcher, so it needs no change [V `:26`, `:39`].

**Verify:**
- `tsc -p tsconfig.json --noEmit`: no new error. The one known error, `tls-client-cert.test.ts:71`, is D2's F2 and is fixed separately.
- These unit suites are green: `test/guided/{runtime,ownership,browser,stopReason,incrementalRuntime,transport}.test.ts` and `test/run/guidedBrowserReap.test.ts`.
- **Tripwires:**
  - `grep -n "terminate?:\|orderlyClosed?:" src/run/guidedBrowser.ts` returns 0;
  - `grep -n "terminateOf\|orderlyClosed?\.\|?? true" src/guided/runtime.ts` returns 0 [V today: those three are the only hits].

---

## 7. ADR-002 text for ADJ-1 (inserted by me; append-only)

`docs/architecture/ADR-002-internal-contract-surface.md`. Both inserts add text and remove nothing. My edit is three added lines: a blank line and the paragraph in §29.2, and the row in §13. The file's other working-tree changes come from earlier lanes.

**§29.2, a continuation paragraph inside item 7** (after "every other report still needs `RUNNING`.", before item 8):

> *Amended 2026-10-18 (STUDIO-OBS-009 ADJ-1; ruling `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w1.5/ruling-part2.md` §2.2; §13 row of the same date):* the `FINAL` statement also accepts `ADMITTED` when the ledger records a revocation (`revoked_at`, write-once) **and** the API's own projection of that report is `AUTHORIZATION_REVOKED` (the runner's outer `CANCELLED` under the recorded revocation, `RunnerOutcomeCodes`), while every other pre-Ready `FINAL` on a revoked row is still refused `409 TRANSITION_REJECTED` and settled by the reaper.

**§13, a new last row of the amendment log** (after the 2026-10-18 C9 row):
- Date `2026-10-18`. Title: "STUDIO-OBS-009 ADJ-1: a secret revoked while the run is `ADMITTED` settles `AUTHORIZATION_REVOKED`".
- **Content:** the divergence (refused with `409`, then reaped `START_TIMEOUT`), the one disjunct and its outcome-bound parameter, and the Article IV sources (`revoked_at` V13/V14, the matrix edge, `RunnerOutcomeCodes`). It also states that there is no widening, no migration and no vocabulary change.
- **Contract text:** `openapi.yaml` is not edited. I re-read its `AUTHORIZATION_REVOKED` table row ("terminal `ERROR/CANCELLED` with an independently recorded `revoked_at`") [V `docs/specs/studio/openapi.yaml:4079`], and it covers this path. The document has no state-by-state FINAL acceptance text [V `grep ADMITTED` gives only `:210`/`:212`].
- **Consumers re-checked:** the runner and the projection.
- **Class:** C (status-code semantics of the internal `FINAL`), with no document edit.
- **By:** ruled by @architect, applied by lane B. The @qa security co-sign is still **owed**.
- **Tests:** no digest re-anchor and no operation-count change. Before: A1 red (`obs009-b-red01`, `obs009-prbe-adj1-02`). After: `obs009-b-04` 413/413 (`3bb5a563cacb6dbe`), mutation A-M red (`obs009-b-mut01`). The credited run is the F-merge run (R3). The joined leg is B-W3.

[V] the predicate as landed: `StudioDispatchLedgerStatements.java:643` (`OR (state = 'ADMITTED' AND revoked_at IS NOT NULL AND CAST(? AS boolean))`), the binding at `:690`, and the Javadoc at `:589-597`.

---

## 8. F-merge order for root (from these rulings only)

1. **§4(iv):** fix the chart property name, before any chart or IT run that sets `connector.port`.
2. **§6:** make `GuidedBrowser` members required and update the three doubles. Then `tsc` and the unit suites.
3. **§1:** apply the fixture `terminate` oracle and the two test rewrites. Then the scratch-copy fixtures run, twice, and the M5 mutation.
4. **§2:** apply the `lost-control-body` per-mode expectation. Then the scratch-copy run and the RM1 mutation.
5. **§4(i)a:** add the connector path filter and the `RunnerTlsClientCertIT` cases, and run the mutation.
6. **§4(i)b and c:** add the API ingress NetworkPolicy template and chart tests, and the trust-store sentence in D2's doc.
7. **Carry:** §4(iii) and §5 to 011 (@po rows), the §5 alert to the GA backlog, and §2.3's disclosure (@po).
8. **Owed and unchanged by this file:** @qa's ADJ-1 co-sign (B gate); @qa's co-sign of the §1.2 oracle amendment; B-W3 R1 d and the ADJ-1 joined leg; KL-015-D5 stays open until the F-merge `dist` rebuild is recorded (AC-12 i).

## 9. Not claimed

- No test was run by me. Every "green" or "red" above is either a lane receipt's [V] or an expectation for root's runs.
- Not checked: whether Playwright emits a context `close` event after a SIGKILL (§1.3 does not require it); the secret audit content in §2.3; the parent RSS cost in §3; the cert-manager version and PKCS12 profile, and the JDK's handling of them, in §4(ii); NetworkPolicy enforcement in the cluster (SPK-05).
- §4(iv) was found by reading. No chart render or backend start was run to show the startup refusal.
