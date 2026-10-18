# Aria ruling G: the per-step timeout ceiling (STUDIO-OBS-015, r1-diagnosis01 section 7.1)

- **Author:** Aria (@architect).
- **Date:** 2026-10-16T04:19Z.
- **Mode:** read-only. I changed no source, dist, Helm, test or story file. I ran no Gradle and no runner tests.
- **Effect on QA credit:** this ruling releases none. Lifecycle is unchanged.

## 0. Decision

**Option (2) is adopted.** Authoring keeps 1..120 s. The runner's per-step ceiling becomes the contract maximum, 120 000 ms. Three things change:

- the runner default;
- an explicit Helm value;
- a fail-closed loader floor, so no deployment can set a ceiling below the authoring bound again.

Nothing else changes: no backend production code, no contract or schema, and no fixture. The frozen `config` variant **stays 31**. Once the fix is in, that variant becomes the joined regression proof for G.

Options (1) and (3) are rejected (see section 3).

## 1. What the product intends (verified by reading; file:line as of the hashes in manifest.json)

| Source | Statement | Reading |
|---|---|---|
| `docs/specs/studio/openapi.yaml` `TestConfiguration` (~3236-3240) | `timeoutSeconds: {minimum: 1, maximum: 120}`, "The PER-STEP timeout" | public contract is 1..120 |
| openapi `createTest`/`updateTest` (~366-368, VAL-023) + ADR-002 (~2936-2972) | out-of-range refused 400; "what the declared `minimum: 1, maximum: 120` always said" | 1..120 was re-affirmed deliberately on 2026-10-04 |
| `contracts/v3/replay-profile.schema.json` Configuration, runner bundle `observedSchemas.json` (replay-profile + revision TestConfig) | `timeoutSeconds` 1..120 | observed v3 contract is 1..120 |
| `delayed-state-design.md` | "Guided passive-readiness allowance … equal to locked `ui_tests.timeout_seconds*1000` (1..120 seconds)"; `allowanceMs:integer[1000..120000]` | the learning path is **designed and implemented** for 120 s (`GuidedTranslationStore.stepTimeoutMillis` 97-117, 278) |
| `publication-contracts.md` C7 (~offset 28871) | "Step timeout is configuration.timeoutSeconds×1000 capped by existing ordinary per-step maximum (refuse an incompatible requested value rather than silently change it)" | refusing instead of clamping is correct and stays; the gap is the maximum's *value* |
| `studio-execution.md` §5.2 | "Default step timeout is 30 seconds and total browser runtime 120 seconds, configurable within server limits" | 30 s is the **default**, not the maximum |
| story 10.13 AC-6 | "Step timeout defaults to 30 s; total runtime to 120 s **within API bounds**"; the ceiling key was introduced with fallback 30 s | **root cause:** 10.13 set the *maximum* to the *default*. That was invisible while the legacy path silently clamped (`deadline.ts` 172-177). OBS-007 replaced the clamp with a refusal (`runCoordinator.ts:999`), because the value is bound into `configurationHash`, and that exposed it |
| `StudioWriteValidationControllerTest`/`CanonicalStudioCodecTest` | 120 accepted, 121 refused | backend tests pin 120 as valid |
| FE `studioTypes.ts` 538-551 | default 30; "Authors do not set it" | the Studio UI sends 30. Values from 31 to 120 come only from public-API authors, but those authors are contract-valid |
| OBS-015 AC-1/AC-6 | a configuration change (… timeout …) ⇒ k = 1 | the `config` variant exercises exactly this |

**Why 31 (inferred; I found no document that states it):**
- The base fixture is 30 (`createSource(texts)` → 30, ReplayIT 19234-19235).
- 31 is the smallest timeout edit that changes `configuration` and so tests "configuration change ⇒ k = 1" (preparation.json: "config k1").
- 29 would test k = 1 equally well. So the value choice does not prove that anyone intended to cross 30.
- Under this ruling it stays 31, because the product supports it. That also makes it the only joined test that crosses the old ceiling.

## 2. Safety: a 120 s step breaks no deadline, lease or heartbeat (verified by reading)

| Mechanism | Bound | Why 120 s per step is safe |
|---|---|---|
| Step deadline (child) | `executor/observedReplay.ts:335` `deadlineMs = min(runDeadlineMs, stepStart + stepTimeoutMs)` | already capped by the run clock; one step can never outlive the run |
| Total browser runtime (parent kill) | `STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS` 120 000 (values.yaml:577); backend `total-runtime` 120 s | unchanged. The worst-case pod occupancy per run is unchanged, because a step could already hang for the whole cap |
| Stop grace / terminationGracePeriod | `BROWSER_STOP_TIMEOUT_MS` 15 000, sized on hung-navigation stops measured at 30/60/**115 s** (ADR-002 §29.3, values.yaml:578-585); grace is derived from total runtime (`_helpers.tpl` 188-196) | already sized for a hang as long as the run cap |
| KEDA cooldown | ≥ total runtime (scaledobject:13-16) | unchanged |
| Backend run deadline / reaper | `run-deadline` 600 s > total 120 s (`StudioExecutionProperties` 54-58, 78-86). `RunningReaper` has no progress-silence condition; heartbeats never move `run_deadline_at` | a 120 s quiet step cannot trip STALE |
| Dispatcher lease | `STUDIO_DISPATCHER_LEASE` 60 s, held only for QUEUED→CLAIMED→admission (`StudioDispatchLedgerStatements` 192-256) | step execution starts after admission. The lease is not involved |
| Admission start deadline | 30 s, admitted → browser start | it ends before the first step |
| Replay grant / authorization TTL | checked at admission (`ObservedReplayAuthorization` 115, 185, 229) | not consulted during steps |
| Guided learning + REPLAYING_PREFIX | each reservation = `min(allowance−used, sessionExpiry−now, ownerLeaseExpiry−now)` (`GuidedTranslationStore` 485-509); observe ≤ 15 s per poll; runner renewal timers are independent of step work (`guided/ownership.ts` 53-89) | does not read `maxStepTimeoutMs`, and is already bounded by the lease. This was proven in the failing run: `config` *learned* and only the ordinary replay was refused |

**Residual (UX, not a defect; inferred):** with `timeoutSeconds` close to 120, a hung step after earlier steps hits the 120 s run cap first. The run then ends `ERROR/TIMEOUT` rather than as a step `FAIL`. This is already true of every contract-valid value of 120 and follows from §5.2's two separate budgets. If PO wants per-step `FAIL` semantics right up to the maximum, that is a separate question about the total-runtime budget. Out of scope.

## 3. Options

| Option | Trade-off | Verdict |
|---|---|---|
| **(1) Cap authoring at 30** | Reduces capability against a contract that was re-affirmed on 2026-10-04 (VAL-023). Touches: openapi; v3 `replay-profile`/`revision` schemas, so the generated bundles and `OBSERVED_SCHEMA_BUNDLE_HASH`/`StudioContractTest` pins need regenerating; the guided allowance bound `[1000..120000]` in design and code; backend `MAX_TIMEOUT_SECONDS` and the VAL-023 tests; the frozen fixture 31 → ≤30. That is a contract re-cut in the middle of OBS-015. Its only gain is the 30 s ceiling, which bounds nothing the 120 s run cap does not already bound | **Rejected** |
| **(2) Ceiling = 120 s** | Small and mechanical. One runner key, one Helm value, tests. No contract change; frozen tests intact. Needs a dist rebuild. Loses the operator's ability to set a ceiling below the contract maximum. Any such setting would only make published tests unrunnable, so losing it is intended | **Adopted** |
| **(3) Unhash or separate the effective timeout** | Contradicts C7 ("refuse … rather than silently change"; "no default/legacy substitution"). It weakens the integrity of `configurationHash` and needs a v3 contract generation | **Rejected** |

The fail-closed floor is part of (2). Without it, a future values override back to 30 000 would bring G back silently. Single-path rule: one bound, and the contract owns it.

## 4. Exact change spec (apply mechanically; record sha256 before → after for each file)

`studio-runner/src/server/config.ts` and `runCoordinator.ts` are already dirty in this tree (other lanes). Edit on top of the current content. Do not revert anything.

### 4.1 Runner production: `studio-runner/src/server/config.ts`
1. In `KEY_SPECS.MAX_STEP_TIMEOUT_MS` (currently lines 372-378), change `fallback: 30_000` to `fallback: 120_000` and `min: 1` to `min: 120_000`. Nothing else in the spec changes.
2. Above that key, add this comment:
   `// Equal to the authoring/contract maximum (timeoutSeconds ≤ 120, openapi TestConfiguration, v3 replay-profile). Observed jobs bind timeoutSeconds into configurationHash, so the runner refuses (LIMIT_EXCEEDED) rather than clamps; a ceiling below the contract maximum would make published tests unrunnable (STUDIO-OBS-015 G, aria-g-ruling01). The total-runtime cap, not this key, bounds a run.`
3. In the field doc of `maxStepTimeoutMs` (lines 146-151), replace "(§5.2, §8.5 starting value 30 s)" and "is clamped to" with: "the per-step ceiling, fixed at the contract maximum 120 s (aria-g-ruling01). Observed jobs above it are refused, never clamped. The loader refuses a lower value." Leave `stepTimeoutMs` (the 30 s default) unchanged.
4. **Do not change:**
   - `runCoordinator.ts:999` (`LIMIT_EXCEEDED`): keep it as defense in depth;
   - `deadline.ts` (`effectiveStepTimeoutMs`): with ceiling ≥ 120 000 it is the identity for every contract-valid value, so it cannot cause an `EVIDENCE_MISMATCH` at `childRuntime.ts:210`/`executor/observedReplay.ts:94`;
   - `validator/observedReplay.ts:465`;
   - any schema.

### 4.2 Helm: `helm-chart/put-checks/values.yaml` `studioRunner.runnerEnv`
- After `STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS: "120000"`, add `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: "120000"`.
- Add a one-line comment: "= the authoring maximum (timeoutSeconds ≤ 120); the runner refuses a lower value at startup (aria-g-ruling01)".
- The key is already on `acceptedEnvKeys` (`_helpers.tpl:157`), so no template change is needed.
- `values-dev/uat/prod.yaml` set no runnerEnv (verified), so leave them alone.

### 4.3 Runner tests
1. **New `studio-runner/test/server/stepTimeoutCeiling.test.ts`** (vitest, unit tier):
   - (a) `loadConfig(required).maxStepTimeoutMs === 120_000`.
   - (b) That value equals `timeoutSeconds.maximum * 1000` read from the runner's own `src/validator/observedSchemas.json`, at both `replay-profile.definitions.Configuration.properties.timeoutSeconds` and `revision.definitions.TestConfig.properties.timeoutSeconds`. This ties the ceiling to the contract.
   - (c) `loadConfig({...required, STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: '119999'})` throws `ConfigurationError`, and its `problems` contains `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS must be >= 120000`.
   - (d) `'120000'` is accepted.
   - For `required`, use the three keys the admission tests use (`SERVICE_IDENTITY`, `CALLBACK_IDENTITY`, `CALLBACK_BASE_URL`).
2. **`studio-runner/test/server/observedReplayAdmission.test.ts`:**
   - Give `controlWindowJob(origin, build, timeoutSeconds = 10)` a third parameter. Use it for `configuration.timeoutSeconds` and `runtime.stepTimeoutMs = timeoutSeconds * 1000`. Existing callers are unchanged.
   - Add `it.each([30, 31, 120])('admits an authored step timeout of %i s under the default runner configuration', …)`.
   - Setup: default `loadConfig`, `observed: {build: currentBuild, policies: [policy], validationEnabled: true, replayEnabled: true}`, and an http fake returning `{kind: 'timeout'}`.
   - Expect `{status: 503, code: 'ADMISSION_NOT_ACKNOWLEDGED'}`, `sends === 1`, `launches === 0`.
   - The test discriminates: before the fix, 31 and 120 return `{status: 400, code: 'LIMIT_EXCEEDED'}` with `sends === 0`. Record that red-before run as no-credit evidence if it is cheap.
3. **`studio-runner/test/deployment/chart.test.ts`** (deployment tier; it needs helm and the built image, and fails rather than skips without them). Add a describe block modelled on "story 10.32 AC-5":
   - every one of the four value sets renders `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS = "120000"`;
   - the rendered runner env passes the runner's own `loadConfig` with `maxStepTimeoutMs === 120000`;
   - falsification: `--set-string studioRunner.runnerEnv.STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS=30000` renders, and `loadConfig` over that rendered env throws `ConfigurationError`.
4. Unchanged: `test/run/deadline.test.ts` (explicit `MAXIMA`), `production-seams.test.ts`, `launcher.test.ts`.

### 4.4 Backend
- **No production change.** `TestConfiguration` 1..120, `CanonicalStudioCodec`, `ObservedReplayAuthorization:398-401` and `GuidedTranslationStore` are all correct as they are.
- **No new backend test.** `GuidedPublicationReplayIT` `case "config"` **stays `timeoutSeconds = 31`** (current file sha `77f47e41…`, line 3966). It is the joined proof: its ordinary replay must PASS with no DEFINITE_REFUSAL.
- The existing VAL-023 tests (`StudioWriteValidationControllerTest`, `CanonicalStudioCodecTest`) stay as they are.

### 4.5 Docs (same change set, text only)
- `studio-runner/README.md`, budgets table: add a row "**Step** — per-step | step start | `min(timeoutSeconds×1000, run deadline)`; ceiling `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` = 120 000 (contract max, loader-enforced) | observed jobs above it refused `LIMIT_EXCEEDED`".
- Do not edit `docs/stories/10.13.story.md`: it is history. This ruling supersedes its "30 s" maximum.

### 4.6 Build and dist
- **Yes, the runner `dist` must be rebuilt.** ReplayIT boots the runner from `../studio-runner/dist/server/config.js` (ReplayIT 19684-19724, `loadConfig({...env})` with no MAX_STEP override). The current dist has `fallback: 30_000` (`dist/server/config.js:229-234`, sha `3084e0e4…`).
- The rebuild rewrites `studio-runner/dist`, so the **coordinator must serialize it** with every other runner/dist lane. Record the dist hash before and after, and confirm that `dist/server/config.js` shows `fallback: 120_000, min: 120_000`.

## 5. Verification required (by the implementing lane; none of this was run by me)
1. Runner unit: `stepTimeoutCeiling.test.ts` and `observedReplayAdmission.test.ts` (all cases, including the 3 new ones) pass. `deadline.test.ts`, `production-seams.test.ts`, `observedReplayRoutes.test.ts` and `concurrency.test.ts` stay green. Typecheck and lint stay clean.
2. Deployment tier (where helm and the image are available): the new chart block passes, and so does the existing `ACCEPTED_KEYS` equality.
3. After the serialized dist rebuild, run joined `--no-daemon` `guidedIncrementalTest`. Expected:
   - the `config` variant (31) learns at k = 1, then its ordinary replay is **admitted and PASSES**;
   - the 31 labels previously blocked by the restart guard run;
   - this unblocks the drift-auth labels (review 7.3) and the D1/F2 joined proof.
4. Invariants: identities 85, labels 35; no assertion or budget lowered; `config` = 31; no schema, bundle or `OBSERVED_SCHEMA_BUNDLE_HASH` change; `build.gradle.kts` unchanged.

## 6. Open / not verified
- Whether the restart-guard cascade (review 7.1 "Consequence") fully clears once `config` passes is inferred, not proven. Step 5.3 is the oracle.
- The staging confirmation of the 15 s stop grace for a 120 s hang (ADR-002 §29.3) is still owed by staging, as before. This ruling does not change that bound.
- The README row and the `config.ts` comments are text I specified; I did not lint them.
