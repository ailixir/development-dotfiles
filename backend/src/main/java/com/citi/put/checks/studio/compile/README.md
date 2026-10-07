# Studio compile pipeline

Stories 10.8 and 10.9. Turns an author's ordered English steps into a validated, confirmable
Playwright artifact — once, at authoring time, inside hard bounds — and then makes a principal
approve one exact revision before anything can run.

```
POST /tests/{id}/compile          (or an after-commit enqueue on save)
  │  requireCompilable            10.4's lifecycle guard
  │  authoring limits             400, no compile begun
  │  credential screen            400, no compile begun
  ├─ beginCompile                 request identity + compile_started_at → COMPILING
  └─ bounded pool, no queue       one budget for the WHOLE request, repairs included
       ┌─ attempt 1..3            at most 1 + 2 repairs (§4.3)
       │    prompt assembly       fenced source + pinned syntax reference + output contract
       │                          a repair adds the previous attempt's bounded diagnostics
       │    LlmGatewayClient      one propose per attempt; a refusal ENDS the loop
       │    artifact version pin  schema-valid is not executable — on every attempt
       │    POST /v1/validate     one call per attempt, no retry, bounded timeout
       │    ok:true  → publishCandidate  AWAITING_CONFIRMATION — never READY
       └─  ok:false → next attempt, or exhaustion
            publishInvalid        NEEDS_REVISION, the FINAL attempt's diagnostics,
                                  plus `attempts` and `exhausted`
            publishError          STALE, retryable, code only

POST /tests/{id}/confirm-compile
  │  authorization                401/403 before any lifecycle read (ADR-002 §14.4)
  │  requireCompilable            409 TEST_DELETED / TEST_QUARANTINED
  └─ confirm                      two conditional statements, all four fields intrinsic
                                  → READY, confirmed_by = the authenticated principal, once

CompileAbandonmentSweeper (every 60s, every replica)
  └─ sweepAbandoned               COMPILING older than the threshold → exactly what
                                  publishError produces, plus the request identity cleared
```

## Things worth knowing before changing anything here

### Readiness does not read `compile_status`

`ExecutionReadinessService` (in `..studio.readiness`) decides whether a test may run, and its
predicate has no `compile_status` term. That is deliberate and load-bearing: `beginCompile` is
unconditional on current status, so a failed *optional* recompile drives a confirmed, unedited draft
`READY → COMPILING → STALE`. If readiness read the status column, a gateway outage would revoke an
approval nobody withdrew.

`STALE` describes the **draft's** relationship to its last compile. Readiness describes the
**confirmed revision's** relationship to the draft's revisions. A confirmed, unedited test sits at
`STALE` after a failed recompile and is fully runnable. `DeReadyCarryForwardTest` is the proof, and
it includes a recorded falsification.

### `insertOrReuseRevision` is not a cache

The compile cache stays **disabled in V1** (architecture §8.5). There is no cache, no memoization
and no keyed reuse of a gateway response: two compiles of byte-identical source issue two `propose`
calls, asserted by `CompilePipelineTest.twoCompilesOfIdenticalSourceIssueTwoGatewayCalls`.

10.4's `insertOrReuseRevision` resolves an identical `(test_id, source_revision,
configuration_revision, artifact_hash)` to the existing revision row rather than duplicating it.
That happens **after** the gateway has answered: it is artifact identity, not a cache.

If a cache is ever added, §4.3 requires it to key over **all** ordered source, context and version
inputs and to **isolate CSIs**. Neither requirement is implemented here.

### A stranded `COMPILING` row is swept, and the sweep buys a display rather than a capability

**Resolved in story 10.9** — `ui_tests.compile_started_at` (V16) and the bounded sweep now exist.
10.8 recorded this as a limitation because there was no column from which a stranded row could be
aged: `updated_at` is bumped by any edit and says nothing about when a compile began, and the
per-request budget and the late-result drop are held in memory and so do not survive a restart.

`beginCompile` sets the clock in the **same single statement** that sets the request identity and
the status; `publishCandidate`, `publishInvalid`, `publishError` and the sweep all clear it. The
invariant is `compile_started_at IS NOT NULL` ⟺ `compile_status = 'COMPILING'`.

**What the sweep buys is a truthful authoring display and a `compile_error` the author can see —
not a recovered capability.** Because readiness never reads `compile_status`, a row stranded in
`COMPILING` blocks nothing: the confirmed revision still executes and `POST /execute` is still
accepted, before and after a sweep. `SweepDoesNotDeReadyIT` is the proof. If implementing anything
here ever required weakening one of 10.8's de-ready tests, the implementation is wrong, not the
test.

**Why no publish guard changed.** The three publish transitions condition on `compile_request_id`
intrinsically and deliberately not on `compile_status`. A sweep that moved `COMPILING → STALE`
while leaving the request identity intact would let a late result resurrect the row, and the
tempting fix would be a status term on all three guards — a guard change in service of a sweep,
touching code three other criteria depend on. The sweep clears `compile_request_id` instead, which
is what "this compile request is abandoned" means, and the existing guard does the rest.

**The statement is a CTE, and that is a correctness fix.** The first draft used
`WHERE id IN (SELECT ... LIMIT n)`; measured against five sweepable rows with a batch size of two
it updated **five**, because the planner is free to re-evaluate an uncorrelated `IN` subquery per
outer row and the `LIMIT` then bounds each evaluation rather than the statement. A CTE is evaluated
once, so the batch size bounds the statement.

### Repair is a bound, not a feature

§4.3 allows "a maximum of two repair attempts", so one compile request makes at most three
`propose` calls and three `/v1/validate` calls, numbered 1, 2, 3 and never repeated. Only an
`ok: false` verdict spends an attempt: a gateway or validator **failure** on a repair ends the loop
with that code and does not silently consume a further one.

Every attempt — including a repair — goes back through the same gate rather than around it: the
`SUPPORTED_ARTIFACT_VERSION` pin and `/v1/validate` run before any publication, a successful repair
is published through `publishCandidate` to `AWAITING_CONFIRMATION`, and there is **no call path
from the loop to `CompileStateService.confirm`** (`RepairLoopTest` fails on the reference).

Exhaustion publishes the **final attempt's** diagnostics only, plus `attempts` and `exhausted`
(spellings fixed by ADR-002 §16.2). Earlier attempts describe artifacts the author never saw, and
accumulating three of them would either breach the 64 KiB cap or make truncation the normal case.
`DiagnosticsBounder` is reused rather than extended into a second bounder — a second bounding path
is how the cap stops being true.

### Confirmation is exact, and write-once

All four fields of the §4.2 body travel into the conditional statements and are decided by the
database; nothing is read back and compared in Java. `confirmed_by IS NULL AND confirmed_at IS
NULL` is an **application** guard that matches zero rows on a second confirmation, so the request
never reaches V12's write-once trigger — the difference is a `409` the caller can act on instead of
a `500`. Each of those five terms has a recorded falsification: delete it and a named test goes
red.

### Credential patterns are not a proof

Pattern checks cannot detect every pasted secret and must not be described as a proof that arbitrary
text is secret-free. `CredentialPatternScreen` recognises a fixed list of well-known credential
shapes — private key blocks, AWS/Google/GitHub/Slack tokens, JWTs, basic-auth URLs and literal
credential assignments. A password that looks like an ordinary word will pass it. That is why the
vault reference syntax exists, and it is why every message the screen produces repeats the
limitation.

### No resolved value is read on the compile path

`PromptAssembler` has a no-argument constructor and only `String` fields, so there is no surface
through which a secrets service or vault client could be injected. `CompileInputs` carries reference
**names** only. The declared names travel to `/v1/validate` so the validator can check that
`vars.get`/`vars.secret` calls correspond to the source — names only, never values (§4.3, §9.2).

### No runtime LLM

Compilation happens at authoring time and never on execute. No class outside this package may
reference `..studio.compile.gateway`; `NoRuntimeLlmTest` fails on the import, not on the call.

## Bounds

All values live in one configuration source, under `studio.*` in `application.yml`.

| Bound | Property | Starting value | Behaviour at the bound |
|---|---|---|---|
| Steps per draft | `studio.compile.authoring.max-steps` | 100 | `400 SOURCE_TOO_MANY_STEPS`; no compile begun |
| Characters per line | `studio.compile.authoring.max-line-chars` | 1024 | `400 SOURCE_LINE_TOO_LONG` |
| Total source bytes | `studio.compile.authoring.max-source-bytes` | 65536 | `400 SOURCE_TOO_LARGE` |
| Pipeline concurrency | `studio.compile.pipeline.concurrency` | 4, no queue | refuse → `STALE COMPILE_POOL_SATURATED` |
| Per-request budget | `studio.compile.pipeline.attempt-budget` | 240s | abandon → `STALE COMPILE_BUDGET_EXCEEDED`; late result dropped |
| Repair attempts | `studio.compile.repair.max-attempts` | 2 | validator exhaustion → `NEEDS_REVISION` with `exhausted: true`; parser-rejected envelope exhaustion → `STALE GATEWAY_PARSE_FAILURE` (VAL-019b) |
| Sweep threshold | `studio.compile.abandonment.threshold` | 300s | older `COMPILING` rows → `STALE COMPILE_BUDGET_EXCEEDED`, retryable |
| Sweep batch size | `studio.compile.abandonment.batch-size` | 200 | the run stops at the cap; the next run continues |
| Sweep interval | `studio.compile.abandonment.interval-ms` | 15000 | one bounded statement per replica per interval, `FOR UPDATE SKIP LOCKED` |
| `/v1/validate` timeout | `studio.runner.validate-timeout` | 10s | one call, no retry → `STALE VALIDATOR_UNAVAILABLE` |
| Gateway input/output bytes | `studio.compile.gateway.max-{input,output}-bytes` | 262144 | `COMPILE_INPUT_TOO_LARGE` / `GATEWAY_OUTPUT_TOO_LARGE` |
| Gateway request timeout | `studio.compile.gateway.request-timeout` | 150s, capped by the remaining budget | `GATEWAY_TIMEOUT` |
| Gateway concurrency | `studio.compile.gateway.max-concurrency` | 4 | `GATEWAY_BUSY`; never queued |
| Gateway transport retry | `studio.compile.gateway.retry.max-retries` | 2 | `GATEWAY_TRANSPORT` after exhaustion |
| Diagnostics per step | `studio.compile.diagnostics.max-per-step` | 10 | truncate with an explicit marker |
| Diagnostic message / excerpt | `studio.compile.diagnostics.max-{message,excerpt}-chars` | 400 / 120 | truncate with an explicit marker |
| `compile_diagnostics` total | `studio.compile.diagnostics.max-total-bytes` | 65536 | truncate with an explicit marker |
| Compile cache | — | **disabled in V1** | no cache exists |

The startup check enforces `sweep.threshold > pipeline.attempt-budget`, or the sweep could take a
compile that is still legitimately running. The budget is shared by every proposal, repair and
validation of one request, and each gateway call is capped at `min(request-timeout, remaining)` and
cancelled by the deadline timer (C0 §5, VAL-007), so it is not required to fit every repair. The
earlier `(1 + repairs) × (request-timeout + validate-timeout)` claim was removed; `RepairBoundsTest`
instead checks that one full attempt fits: `request-timeout + validate-timeout < attempt-budget`
(150s + 10s < 240s).

Raising the budget from 180s to 240s costs observable **saturation**, not correctness: the pool is
four threads with no queue, so a worst-case request now holds a slot for 240s instead of 180s. That
is already routed to `STALE COMPILE_POOL_SATURATED`, retryable. If tuning is needed the pool size is
the knob, not the repair count — §4.3 fixes that at two and it is not a tuning parameter.

## Deferred, and why

| Criterion | Deferred to | Reason |
|---|---|---|
| AC-11b — the real R2D2 gateway | 10.19 | `ED-01` is open: no endpoint, credentials, project or verified model exist. Recorded as **skipped, not passed**. |
| AC-12b — a deployed `studio-runner` | 10.18 / 10.19 | Deployment form only. `/v1/validate` is browser-free and takes no capacity slot, so `ED-05` constrains none of the validation semantics here. |
| AC-1b — `409` on compiling a deleted or quarantined test | **closed** | Ruled by ADR-002 §14. The route answers `409` with the draft's own code and the two codes stay separate. |
| 10.9 AC-10b — the repair loop against the real R2D2 gateway | 10.19 | `ED-01` is open: no endpoint, credentials, project or verified model exist. Recorded as **skipped, not passed**. |
| 10.9 AC-15b — measuring translation quality | 10.19 | Needs a real model and observed runs (§4.1). Recorded as **skipped, not passed**. |
| 10.9 AC-3's `401` case | `ED-02` | `BffSessionAuthenticationFilter.isCoreServiceBypassed()` returns `true` unconditionally, so an identity-less caller is admitted as a platform admin and no route can answer `401`. Held by a named disabled test with a live sibling that fails the day the bypass is removed. |
| 10.9 AC-7's target-policy perturbation | 10.18 / `ED-04` / ADR-002 O-6 | No such field exists on `UITestRequest` or `TestConfiguration` to perturb; inventing one would be Article IV invention. Recorded as **not reachable**, never as passing. |
