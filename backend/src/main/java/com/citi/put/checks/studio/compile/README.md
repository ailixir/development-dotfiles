# Studio compile pipeline

Story 10.8. Turns an author's ordered English steps into a validated, confirmable Playwright
artifact — once, at authoring time, inside hard bounds.

```
POST /tests/{id}/compile          (or an after-commit enqueue on save)
  │  requireCompilable            10.4's lifecycle guard
  │  authoring limits             400, no compile begun
  │  credential screen            400, no compile begun
  ├─ beginCompile                 persists the compile request identity → COMPILING
  └─ bounded pool, no queue
       prompt assembly            fenced source + pinned syntax reference + output contract
       LlmGatewayClient.propose   exactly once; no repair (that is 10.9)
       artifact version pin       schema-valid is not executable
       POST /v1/validate          exactly once, no retry, bounded timeout
       publishCandidate           AWAITING_CONFIRMATION — never READY
       publishInvalid             NEEDS_REVISION with bounded, redacted diagnostics
       publishError               STALE, retryable, code only
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

### A stranded `COMPILING` row is a stale display, not a blocked test

`ui_tests` has no `compile_started_at` column, so after an API restart a row left in `COMPILING`
cannot be aged — `updated_at` is bumped by any edit and says nothing about when the compile began.
The per-attempt budget and the late-result drop are held in memory and therefore do not survive a
restart.

For V1 this is accepted and documented rather than fixed, because the cost is small **for a reason
this pipeline earned**: since readiness never reads `compile_status`, a row stranded in `COMPILING`
blocks nothing. The confirmed revision still executes, `POST /execute` is still accepted, and the
only visible effect is an authoring UI that looks busier than it is until the user's next explicit
recompile — which `beginCompile` clears unconditionally.

The `compile_started_at` column and its bounded sweep are **carried to story 10.9**, which already
owns repair and retryability.

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
| Per-attempt budget | `studio.compile.pipeline.attempt-budget` | 180s | abandon → `STALE COMPILE_BUDGET_EXCEEDED`; late result dropped |
| `/v1/validate` timeout | `studio.runner.validate-timeout` | 10s | one call, no retry → `STALE VALIDATOR_UNAVAILABLE` |
| Gateway input/output bytes | `studio.compile.gateway.max-{input,output}-bytes` | 262144 | `COMPILE_INPUT_TOO_LARGE` / `GATEWAY_OUTPUT_TOO_LARGE` |
| Gateway request timeout | `studio.compile.gateway.request-timeout` | 60s | `GATEWAY_TIMEOUT` |
| Gateway concurrency | `studio.compile.gateway.max-concurrency` | 4 | `GATEWAY_BUSY`; never queued |
| Gateway transport retry | `studio.compile.gateway.retry.max-retries` | 2 | `GATEWAY_TRANSPORT` after exhaustion |
| Diagnostics per step | `studio.compile.diagnostics.max-per-step` | 10 | truncate with an explicit marker |
| Diagnostic message / excerpt | `studio.compile.diagnostics.max-{message,excerpt}-chars` | 400 / 120 | truncate with an explicit marker |
| `compile_diagnostics` total | `studio.compile.diagnostics.max-total-bytes` | 65536 | truncate with an explicit marker |
| Compile cache | — | **disabled in V1** | no cache exists |

The per-attempt budget must be **strictly greater** than the gateway request timeout, or a slow
gateway call would be abandoned by the budget before the gateway gave up and the recorded code would
name the wrong bound. Startup fails when it is not.

## Deferred, and why

| Criterion | Deferred to | Reason |
|---|---|---|
| AC-11b — the real R2D2 gateway | 10.19 | `ED-01` is open: no endpoint, credentials, project or verified model exist. Recorded as **skipped, not passed**. |
| AC-12b — a deployed `studio-runner` | 10.18 / 10.19 | Deployment form only. `/v1/validate` is browser-free and takes no capacity slot, so `ED-05` constrains none of the validation semantics here. |
| AC-1b — `409` on compiling a deleted or quarantined test | @architect | The frozen `compileTest` declares only `202`/`401`/`403`, but `requireCompilable` already throws `TEST_DELETED`/`TEST_QUARANTINED` and AC-3 forbids bypassing it. Escalated as ADR-002 §12 **Class C**; the contract test is left **red**, not worked around. |
