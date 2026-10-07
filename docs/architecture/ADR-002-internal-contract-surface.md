# ADR-002 — Internal contract surface: how the runner's routes are expressed, and what a log entry's timestamp is

| Field | Value |
|---|---|
| Status | Accepted (architecture decision, 2026-09-11). Amended four times the same day: §11 closes O-7, §12 rules on who may amend this contract, §14 declares the conflict responses for a deleted or quarantined draft (closing story 10.8's AC-1b), §15 declares the terminal error-code vocabulary in both directions (closing story 10.7's AC-13a), and §16/§17 declare the compile-diagnostics surface and the evidence partiality signal (closing story 10.9's AC-22 and story 10.13's AC-18, the two wave-4 escalations). O-1, O-2, O-3, O-4, O-5, O-7 and O-8 have landed; O-6, O-9, O-10, O-11, O-12 and the new O-13/O-14 remain, re-verified at `6cc14f220` in §18.4. |
| Author | @architect (Aria) |
| Source of truth | [Studio architecture v2.1](studio-execution.md) §4.4, §4.5, §5.1–5.5, §6.1–6.4, §8.2, §8.4, §8.5, §9.1–9.3; [ADR-001](ADR-001-studio-runner-scaffolding.md) §4.2, §9 |
| Amends | `docs/specs/studio/openapi.yaml`, frozen by story 10.1. This ADR is the amendment's rationale; the document is the contract. |
| Consumers | Stories 10.6, 10.7, 10.8, 10.9, 10.10, 10.12, 10.13, 10.14 ([EPIC-10](../epics/EPIC-10-EXECUTION.yaml)), and the MFE (§15.9 O-12, §18.3) |
| Does not touch | `docs/specs/studio/artifact.schema.json` and its byte-identical backend copy, guarded by `ArtifactSchemaDriftTest`. Both are unchanged. |

This ADR rules on four divergences between the frozen contract and architecture §8.4, and records the amendment made to `openapi.yaml` to settle them. It contains no implementation code and changes no story's Title, Acceptance Criteria, Scope or Status.

## 1. Context

### 1.1 How this surfaced

Story 10.6's contract test (`studio-runner/test/contract.test.ts`, AC-1) replaced a hand-rolled YAML-subset reader with a real parser. The hand-rolled reader had been written against a stub and could not read 10.1's 1188-line document; once a real parser could, the test compared **the exact bytes the runner sends and serves** against the `internal`-tagged schemas and found the document and the runner disagreed. The tests were left red rather than forced green, which is why the divergences are here to be decided rather than buried.

Five stories code against this contract. A divergence not settled now propagates into all five.

### 1.2 Verified facts (2026-09-11, worktree `epic/EPIC-10` at `069bad5a3`)

| Fact | Evidence |
|---|---|
| Architecture §8.4 tabulates **six** internal routes. Four are the runner's (`POST /v1/validate`, `POST /v1/runs`, `GET /health`, `GET /ready`); two are the API's callbacks. | `studio-execution.md` §8.4 table |
| The frozen document declared only the two API callbacks, under `servers: /api/v1/studio` and one `internal` tag. Composing that base with those paths yields `/api/v1/studio/internal/studio/...`, which nothing serves — so even the two declared routes had the wrong base. | `openapi.yaml` before this amendment |
| The runner is a separate Deployment with its own image, a ClusterIP Service, **no Ingress and no HPA**. | ADR-001 §9 |
| The runner's step and log timings are readings of `performance.now()`, explicitly documented as "monotonic milliseconds from the injected clock, never wall-clock time". They are fractional. | `src/executor/adapters/StepReporter.ts`, `src/executor/executor.ts` |
| The runner holds exactly **one** wall-clock instant per run, `browserStartedAt`, set at `markBrowserStarted()`. | `src/reporting/snapshot.ts` |
| Two of the four `appendLog` call sites pass `atMs: 0`: the browser-start line and the terminal run line. | `src/reporting/reportingStepReporter.ts` |
| The runner's report body names `steps`, `outcome`, `evidence`, `runtimeVersions`, `runnerInstanceId`. The contract named `stepResults`, `status`/`errorCode`, `video`/`manifestKey`, `runtime`. **No test could fail on this**, because `ProgressReport` declared neither `additionalProperties: false` nor those fields as required. | `src/reporting/snapshot.ts` vs. `openapi.yaml` |
| Line 599 parsed as `description: Ownership` plus a spurious null-valued key `sequence or transition conflict`, because of an unquoted comma in a flow mapping. | `yaml` parse of the frozen document |
| The runner emits step statuses `PASSED`/`FAILED`; §8.2 fixes the per-step vocabulary as `PENDING \| RUNNING \| PASS \| FAIL \| SKIPPED`. | `src/executor/adapters/StepReporter.ts` vs. §8.2 |

### 1.3 Constraint on every ruling

Article IV. Each change below traces to §8.4, §5, §6, §8.2 or ADR-001. Where a source fixes something, the source wins even against working code. Where no source fixes it, the producing implementation wins and the choice is recorded rather than invented.

## 2. Decision summary

| # | Question | Ruling |
|---|---|---|
| INT-2 | How is the runner's surface expressed? | **One document, three explicit signals per operation**: a path-item `servers` entry (never inherited), a second tag (`runner` or `api-callback`) alongside `internal`, and `x-served-by`. All six §8.4 routes are now declared. |
| INT-1 | What is a log entry's timestamp? | **A relative offset on the run timeline**, `atMs`, on the same monotonic clock and origin as the step readings, `null` where the runner holds no reading. The API derives the public absolute `at` as `browserStartedAt + atMs`. |
| INT-3 | Truncated 409 description | **Fixed.** Quoted; the full description is restored and the spurious key is gone. |
| INT-4 | `steps`/`outcome`/`evidence`/`runtimeVersions` vs. `stepResults`/`status`/`video`/`runtime` | **The report is not the snapshot.** The internal report keeps the runner's names; the public snapshot keeps its own; the API translates, and the contract now carries the mapping table. Every runner-produced body is declared **closed**, so the next such divergence fails a test. |
| INT-5 (§11) | Where is the §6.4 recorder-origin calibration applied? (O-7) | **At the runner's clock, not on the wire.** One run-scoped monotonic clock zeroed at recording-context readiness, injected into step execution; `browserStartedAt` read at the same instant. The wire carries one origin and no calibration constant. `recordingOriginMs` **rejected**. |
| GOV (§12) | May a story amend `openapi.yaml`? | **By class of change.** A story may repair a defect nothing could have satisfied; a field on a closed runner body, and anything touching routes/security/public surface, needs an architect's ruling first. Loosening a schema is never a story's call. |
| INT-6 (§14) | What does a route answer for a soft-deleted or quarantined draft? (10.8 AC-1b) | **`409`, with the draft's own code, and the two codes stay separate.** `TEST_DELETED` and `TEST_QUARANTINED` are declared on `compileTest`, `confirmCompile` and `executeTest` — all three, swept together. `403` and async-`202` **rejected**; widening `requireCompilable` **rejected**. Every public `409` now declares its exhaustive code set in `x-conflict-codes`, because examples are not assertable. |

## 3. INT-2 — expressing the runner's surface

### 3.1 Ruling

All six routes of §8.4 are declared in the one document, in §8.4's own table order. Each internal operation carries:

1. **Its own `servers` entry on the path item.** The document-level `servers` (`/api/v1/studio`) is the public, browser-facing base and is never inherited by an internal route. The runner's four routes declare `{runnerBaseUrl}`; the two callbacks declare `{apiInternalBaseUrl}`. Both are OpenAPI server variables whose descriptions name them as deployment configuration (§8.5, "runner/callback URLs"); the defaults are the in-cluster shapes this chart renders, never public hostnames.
2. **A second tag naming the serving component** — `runner` or `api-callback` — next to `internal`. The umbrella tag is kept because it is what marks a route as never-through-ingress and it is what the conformance test scopes on; the second tag is what makes the component readable at a glance.
3. **`x-served-by: studio-runner | api`**, a machine-readable form of the same fact for tooling that ignores tags.

The request and response bodies of the four runner routes are declared from what the runner actually serves, including the `Retry-After` header on `429` and the `RunnerProblem` code-only error body that §9.2 requires (codes and key names, never a value, an excerpt or a stack trace).

A `serviceIdentity` security scheme (`http`/`bearer`) is declared and applied to all six operations. §8.4 requires restricted service identity on every internal route and the document asserted it only in prose.

### 3.2 Why

The two deployments must stay distinguishable, and "which component serves this?" must be answerable without cross-referencing the architecture. Three signals is one more than strictly needed, deliberately: the `servers` entry is what a code generator reads, the tag is what a human reads in generated docs, and `x-served-by` is what a lint rule reads. They cannot drift apart silently because all three sit on the same operation.

The runner having no public ingress survives this because nothing in the expression depends on a route being reachable from outside. The server variables resolve to cluster-internal Service names; the `no Ingress` fact of ADR-001 §9 is restated in the `runner` tag description rather than implied by a URL.

This also fixes a latent defect nobody had raised: the two API callbacks were inheriting `/api/v1/studio`, so a generator would have built `/api/v1/studio/internal/studio/executions/{id}/admission`. Declaring a base per path item removes the whole class.

### 3.3 Alternatives rejected

| Option | Why not |
|---|---|
| **A second document-level `servers` entry, no per-path override** | OpenAPI treats a multi-entry `servers` list as alternative bases for *every* operation. It would say the public routes are also served on the runner, which is false and unsafe: the runner has no CSI authorization, no user session and no DB (§9.2). It also leaves the callbacks' wrong base uncorrected. |
| **A separate `openapi-runner.yaml`** | Splits shared schemas (`TestConfiguration`, `StepStatus`, `RuntimeVersions`, `ErrorResponse`) across two files with no mechanism keeping them equal — which is the drift `ArtifactSchemaDriftTest` exists to prevent elsewhere. ADR-001 §10 O-3 asks for *one* language-neutral contract location consumed by both `backend/` and `studio-runner/` CI, and both CIs would need a second path. The runner's contract test reads one document; a second file would mean editing a test to accommodate a contract decision, which is backwards. |
| **Tag only, no `servers` override** | A tag does not tell a generator what base to build a client against. Consumers would keep composing runner paths onto `/api/v1/studio`. |
| **Renaming the tag `internal` to `internal-runner`/`internal-api`** | Would drop the single marker that means "never through public ingress", which the backend's springdoc exclusion and the runner's conformance scoping both key on. Adding a second tag keeps both properties. |
| **Declaring the runner routes under an `/internal/` path prefix so the existing backend assertion keeps passing** | The runner serves `/v1/validate`; the contract would be lying about the wire to keep a test green. The test's premise is what is wrong (§8.6). |

## 4. INT-1 — what a log entry's timestamp is

### 4.1 Ruling

A log entry carries **`atMs`: a fractional millisecond offset on the run timeline**, read from the same monotonic clock and with the same origin as `RunnerStepState.startedAtMs` (§6.4). It is `null` where the runner genuinely holds no reading. `0` is a position — the browser start — and is never a stand-in for "unknown".

The public `ExecutionLogEntry` keeps its absolute `at`, now nullable, and the contract states that the API derives it as `browserStartedAt + atMs` and upper-cases `level`. The runner's `level` vocabulary is declared as what the runner produces (`info`, `warn`, `error`); the public `DEBUG` has no runner-side producer and is left for API-produced lines.

### 4.2 Why, against the three constraints

**The runner cannot supply a wall-clock instant at every site.** It holds exactly one: `browserStartedAt`. Everything else it knows about time is `performance.now()`, chosen precisely because §6.4 demands a monotonic clock. Requiring a `date-time` per entry forces one of two bad outcomes: a second wall-clock read per entry, introducing a clock whose relationship to the recording is unmeasured; or `browserStartedAt + monotonic` computed inside the runner, which is the same arithmetic performed by the component that does *not* know the recorder origin, discarding the raw offset that the seek needs.

**The 500 ms step-seek target (§6.4) is the binding constraint.** Video correlation is an offset problem, not an instant problem. §6.4 requires the monotonic origin to be calibrated against the recorder's first frames; an offset carries no clock-skew term at all, so the error budget is spent entirely on calibration, where it belongs. A wall-clock stamp would add an unbounded skew term to a 500 ms budget. Keeping logs on the same timeline as steps is what lets a log line and its step seek to the same frame.

**An API-assigned receipt time was the third candidate and is the worst of the three.** Reports are cumulative snapshots, redelivered on retry, and a terminal report is retried byte-identically until acknowledged (§5.3) — a receipt time would differ per delivery for the same facts. It would also collapse every log line in one report onto a single instant, since a progress report carries the whole buffer. That destroys correlation outright rather than degrading it. The runner's own `reportedAt` already exists and is documented as describing *the run, not the delivery*; a receipt time would contradict it.

**On the API already assigning its own revision:** yes, and that is the precedent, not a counter-argument. §8.4 makes the API the authority for the snapshot it publishes. Deriving `at` from `browserStartedAt + atMs` is exactly that authority, applied to arithmetic over two fields the contract already carries and §8.2/§6.4 already fix. It invents nothing.

### 4.3 Why the timings are `number`, not `integer`

The clock is fractional. The wire carries the raw reading; the persisted `offsetMs` and `durationMs` stay `integer`/`int64` on the public snapshot. Rounding belongs to whoever applies the §6.4 calibration, because that component knows the recorder origin and is doing the arithmetic anyway. A runner that rounded first would be making a precision decision with no basis for it.

### 4.4 The case difference

Trivial and ruled on the same principle as INT-4: no source fixes a log-level vocabulary, so the producer's spelling is declared, and the API normalizes case onto the public surface it owns.

## 5. INT-3 — the truncated 409 description

**Fixed.** `'409': { description: Ownership, sequence or transition conflict }` is a flow mapping whose unquoted comma split it into `description: Ownership` plus a spurious null-valued key. The full description is restored and expanded into a block, and the response now declares its `ErrorResponse` content like every other error on the route.

This was not only cosmetic. The stray key meant the frozen document contained a member no schema named, in the one place a strict reader was most likely to look — and it was the exact construct that broke 10.6's original reader. No other occurrence exists; the whole document was re-scanned for long null-valued keys after the amendment and is clean.

## 6. INT-4 — the divergence no test could see

### 6.1 Ruling

**`RunnerReport` is not `ExecutionSnapshot`, and treating them as one shape was the error.** They are different surfaces with different producers, different clocks and different knowledge:

- the report is what the runner *observed*: which steps it touched, monotonic readings, whether it managed to store the objects whose keys it was handed;
- the snapshot is what the API *publishes*: one entry per original step, calibrated offsets, availability judged against retention, a revision the API assigns.

The API already translates between them — it assigns `revision`, derives `videoPath`, fills `PENDING` steps, owns `EXPIRED`. Renaming one side to look like the other would hide that translation, not remove it. So the internal report keeps the runner's names, the public snapshot keeps its own, and the contract now carries an explicit mapping table on `RunnerReport` so story 10.7 implements a documented projection rather than inferring one.

Two sub-rulings go the other way, because a source does fix them:

- **Step status vocabulary.** §8.2 fixes `PENDING | RUNNING | PASS | FAIL | SKIPPED`. The internal report uses that vocabulary. The runner's `PASSED`/`FAILED` is wrong (§7).
- **`outcome.result`.** `PASSED | FAILED | ERROR` per §8.2/§6.1 — already correct, and note it is a *different* vocabulary from the step one on purpose. That near-collision is itself an argument for keeping the step vocabulary at `PASS`/`FAIL`: a report carrying `FAILED` in two fields meaning two different things invites exactly the misread this ADR is cleaning up.

`evidence.state` keeps the runner's `PENDING | STORED | FAILED | UNAVAILABLE` rather than §6.1's `VideoStatus`. This is not the same kind of exception: two of §6.1's values are not observable by the runner at all. `AVAILABLE` is a retention judgment and `EXPIRED` requires reads the runner does not have permission for (§6.2, no Get or List). A runner cannot report a fact it cannot know; the projection is documented instead.

`outcome.errorCode` is deliberately left an open string. Every value `ExecutionErrorCode` enumerates is assigned by the API's dispatcher or reapers (§5.4) and a runner must never emit one. §8.2 fixes exactly one runner-observable code — a parent-enforced total timeout is `ERROR`/`TIMEOUT` — and the rest belong to the execution stories. Enumerating a set the sources do not fix would be invention; this is the one place the amendment chooses openness, and it says so in the schema.

### 6.2 About a divergence no test could see

This is the part worth generalising. `ProgressReport` was an open schema with six required fields over a body with fifteen. Three entire field names could disagree and the checker's verdict was "conforms", because nothing was declared that the runner failed to send. An open schema over a wire body is not a contract; it is a suggestion that happens to be written in YAML.

The amendment therefore declares **every runner-produced and runner-sent body closed** (`additionalProperties: false`) with every optional field named: `RunnerReport`, `RunnerStepState`, `RunnerLogEntry`, `RunOutcome`, `RunnerEvidence`, `AdmissionRequest`, `RunJob`, `ValidateRequest`, `ValidateResponse`, `RunnerDiagnostic`, `RunnerProblem`, `RunAccepted`, `HealthResponse`, `ReadinessResponse`, `ReferenceDeclarations`, `JobDeadlines`. A field the contract does not name is now a test failure.

Two exceptions, both stated in the document rather than left to be discovered:

- `AdmissionResponse` and the callback response bodies stay open. Story 10.7 has not implemented the producer, so there is nothing to close them against; closing a schema against an imagined producer is how the original divergence happened. 10.7 closes them when it ships.
- `ReportedRuntimeVersions` stays open. What `runtime-versions.json` records is the image's business and grows with the pin (ADR-001 §4.2); the API keeps the §4.6 subset as `RuntimeVersions`.

The conformance check proved its worth immediately: closing the schemas turned a three-name silent disagreement into a specific, addressable failure, and the one that remains (§7.1) is a genuine defect the old schema could never have surfaced.

## 7. What the runner must change — for @dev, in story 10.6's area

Neither of these is a contract problem, and neither is fixed here. `studio-runner/` source is out of this ADR's scope by construction.

### 7.1 Step status spelling — currently failing the contract test

`src/executor/adapters/StepReporter.ts` declares `StepStatus = 'PASSED' | 'FAILED' | 'SKIPPED'`. §8.2 fixes `PASS`/`FAIL`. The contract test now fails with:

> `progressRequest[2].steps[0].status: "PASSED" is not one of ["PENDING","RUNNING","PASS","FAIL","SKIPPED"]`

This is the runner being wrong against a source that fixes the vocabulary, not the contract being wrong against working code. It is a rename in the executor's status type and the snapshot's `SnapshotStepStatus`, plus the tests that assert them. The rename also removes the `FAILED`-means-two-things hazard of §6.1.

### 7.2 `atMs: 0` at the terminal log line — silent, no test can catch it

`sendFinal` in `src/reporting/reportingStepReporter.ts` appends the run-result line with `atMs: 0`. Under this ruling `0` is the browser start, so the terminal line is currently placed at the beginning of the video. It must be `null`. The browser-start site's `0` is correct and needs no change — it was never a placeholder, it was the origin.

No assertion will ever catch this: `0` is a valid number. It is recorded here because a semantic error the type system accepts is exactly the kind that survives a green build.

## 8. Consequences

### 8.1 Per consuming story

| Story | Effect |
|---|---|
| **10.6** — runner admission and reporting | Its four routes are now declared, so AC-1's response conformance passes. Request conformance passes for admission and for logs. Two corrections remain (§7): the step-status rename, which is failing today, and the terminal `atMs`. AC-1 is **not met** until the first lands. |
| **10.7** — API dispatch and callbacks | Gains an explicit projection to implement rather than infer: the `RunnerReport → ExecutionSnapshot` mapping table, the `PENDING` step fill from the revision's ordered source, `at = browserStartedAt + atMs`, level upper-casing, and `evidence.state → video.status`. Must not emit an `ExecutionErrorCode` value on a runner's behalf. Closes `AdmissionResponse` and the callback response bodies when it ships. **§11 leaves its arithmetic unchanged and consumes no new field** — see §11.7. |
| **10.8** — compilation | `POST /v1/validate` now has a declared request and response, including the `RunnerDiagnostic` shape and the fact that a rejected artifact is still a `200`. No change to what 10.8 sends. |
| **10.12** — execution and recording | §11 settles the placement it was asked to choose: calibration is applied at the runner's clock, so it implements the run-scoped clock and the paired origin reads (§11.6, O-8) and adds no contract field. Also owns the real `outcome.errorCode` set, with `ERROR`/`TIMEOUT` already fixed by §8.2. |
| **10.14** — evidence | `RunnerEvidence` is declared with the runner's own `PENDING/STORED/FAILED/UNAVAILABLE` and the documented projection to `VideoStatus`. `videoKey`/`manifestKey` are echoes of the server-derived job keys; the contract restates that the runner never invents or accepts an arbitrary key (§6.2). |

### 8.2 Positive

One document still holds one contract, so shared schemas cannot drift. All six §8.4 routes are declared, so the gap between the contract and the architecture is closed rather than tracked. The two callbacks stop inheriting a base that would have produced an unserved path. Service identity is asserted in the schema instead of in prose. And the runner's wire bodies are now checkable: the next naming disagreement is a red test on the PR that introduces it.

### 8.3 Negative / accepted costs

The document grew by roughly 820 lines net, most of it declaring bodies that previously existed only in TypeScript. Closed schemas mean a legitimate new field is a contract edit, not a deploy — intended, and the reason `AdmissionResponse` is exempt until it has a producer. The `RunnerReport → ExecutionSnapshot` mapping is real translation work for 10.7 that a shared shape would have appeared to avoid, though it would only have moved it.

### 8.4 Story 10.6's AC-1 checkbox — for @po, not for me

Story 10.6 line 47 marks AC-1 `[x]`. It is **not met**: the contract test fails on §7.1. @dev's own 2026-09-11 entry already records this ("AC-1's `[x]` is left as-is under the no-AC-edit constraint, but it is not met"). Correcting the checkbox is @po's call under story-authority rules; this ADR only records that the condition still holds after the amendment, for a different and smaller reason than before.

### 8.5 The runner's contract test after the amendment

`npx vitest run` in `studio-runner/`: **577 passed, 2 skipped, 1 failed** (was 576 / 2 / 2). The remaining failure is §7.1 and is a runner defect. Response conformance for all four runner routes now passes, as does admission-request conformance and the log-entry shape.

After O-1 landed at `86a187267`, `test/contract.test.ts` is **14 passed / 14**, and it is still 14/14 after the §11 amendment — which is the expected result, not a reassuring one: §11 added no field and changed no shape, and `minimum` is a keyword this validator does not implement (§11.6.4).

### 8.6 One backend assertion is now wrong — for its owner

`backend/src/test/java/.../StudioContractTest.java`, `internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface`, asserts that every `internal`-tagged operation's path contains `/internal/`. That was true while only the API callbacks were declared. It is false now and by design: the runner serves `/v1/validate`, `/v1/runs`, `/health`, `/ready`, and no amount of tagging changes what is on its socket.

The assertion encodes the assumption this ADR corrects — that "internal" is a path prefix. What "internal" actually means is: not reachable through public ingress, and requiring service identity. The corrected assertion is the one already next to it (`noneMatch(contains(PUBLIC_BASE))`) plus a check that each internal operation carries `runner` or `api-callback` and declares its own `servers` entry. Backend Java is out of this ADR's scope and another agent owns that tree; this is recorded for whoever owns 10.1's test. No other backend gate is affected — the eight `assertSchemaMatchesRecord` schemas, the snapshot examples and the legacy adapter examples are all untouched.

## 9. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| ~~O-1~~ | ~~Step status rename `PASSED`/`FAILED` → `PASS`/`FAIL` in the runner (§7.1)~~ **Landed at `86a187267`; `StepStatus = 'PASS' \| 'FAIL' \| 'SKIPPED'` and the contract test is 14/14.** | ~~@dev (10.6)~~ | — |
| ~~O-2~~ | ~~Terminal log line `atMs: 0` → `null` (§7.2)~~ **Landed at `86a187267`; `sendFinal` appends with `atMs: null`.** | ~~@dev (10.6)~~ | — |
| ~~O-3~~ | ~~`internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface` premise (§8.6)~~ **Closed. Verified at `10bce34a7`: the assertion is gone and `internalRoutesStayOffThePublicSurfaceAndNameWhatServesThem` replaced it, checking exactly what §8.6 said the corrected form should be. `StudioContractTest` 9/9.** | ~~Owner of 10.1's backend contract test~~ | — |
| ~~O-4~~ | ~~Close `AdmissionResponse` and the callback response bodies once a producer exists~~ **Closed 2026-09-11 by story 10.7 at `af17549ec` and `7e827e52c`, which is the producer: `AdmissionResponse` is closed with every field named, the progress `200` gained a closed `ProgressAck` where it had declared no content at all, and the duplicate-delivery `200` is documented. Logged in §13.** | ~~10.7~~ | — |
| ~~O-5~~ | ~~The runner `outcome.errorCode` set beyond §8.2's `TIMEOUT`; today's `STEP_FAILED`/`RUN_ERROR`/`RUN_NOT_STARTED` are placeholders around a fake launcher~~ **Closed in substance. `studio-runner/src/run/errors.ts` enumerates ten codes, each traced to an observable condition, with an exhaustive switch over `RunFailureKind`. §15 declares that set as `x-runner-error-codes`, which is the half O-5 left undone. `TIMEOUT` stays reserved for 10.13's enforcement.** | ~~10.12~~ | — |
| O-6 | §8.4 names "approved target/secret-use policy" among the job fields; the envelope carries only declared reference **names** (`references`). Whether destination policy travels on the job or is enforced solely at the egress layer is unresolved, and the contract declares only what exists rather than a field nobody implements. **Still open at `10bce34a7`; 10.7 has landed with `RunJob` carrying names only, so this is now solely 10.18's.** | ~~10.7 /~~ 10.18 (SPK-05) | Destination enforcement (§9.3) |
| ~~O-7~~ | ~~Where the §6.4 recorder-origin calibration is applied — runner-side or API-side~~ **Closed 2026-09-11 by §11: runner-side, at the clock. `recordingOriginMs` rejected; the contract gains no field. Remaining work is 10.12's, listed in §11.6.** | ~~10.12~~ | — |
| O-9 | `x-conflict-codes` on the three internal `409`s (`POST /v1/runs`, the admission and progress callbacks). Their producers are 10.7's and do not exist yet, so a set declared now would be invented. **Pre-ruled in §14.7:** 10.7 may land these directly, listing exactly the codes its own PR emits, with a §13 log line — no escalation needed. The runner propagates the admission callback's code into its own `/v1/runs` refusal, so the two must be closed together. **Still open, but its blocking condition is gone: the producers now exist and §15.9 records the exact sets `AdmissionCasService` and `ProgressReportService` emit at `10bce34a7`. 10.7 landed without using the pre-ruling, so it passes to the next story that touches those routes.** | ~~10.7~~ next story on the internal callbacks | — |
| O-10 | A draft that is unknown, soft-deleted or quarantined answers **`400 BAD_REQUEST`** on `GET`/`PUT`/`DELETE /tests/{id}`, because `IllegalArgumentException` maps to `400`. Conventionally that is a `404`. **Not ruled here** — it is Class C, it moves the public surface for three stories mid-wave, and it is not the gap 10.8 raised. No security defect either way: both forms are existence-preserving and neither discloses more than the other. Raise it as its own decision before the pilot, not as a side effect of this one. **Untouched by §15 and now due: waves 1–3 have merged.** | @architect (post-wave-3) | — |
| ~~O-8~~ | **Landed in the runner, verified at `10bce34a7`: `executeSteps` requires an explicit run clock and refuses at both the type level and at run time, `runCoordinator` carries the run-scoped origin, and `test/server/timeline.test.ts` asserts the scale together with the negative control §11.6.4 asked for. §11.6.3's staging measurement has a fixtures-tier home in `test/fixtures-tier/seek-measurement.test.ts`; whether it has been run against staging is the story owner's to confirm.** ~~The run-scoped clock of §11: zero at recording-context readiness, injected into step execution, process-origin default removed from the production path, the two origin reads paired, the readiness-to-first-frame gap measured in staging, and a scale assertion the schema cannot make (§11.6)~~ | ~~10.12~~ | — |
| O-11 | `ui_test_executions.error_code` carries no CHECK constraint, so the enum §15 declares is enforced on the write path by convention and on the read path by nothing — `ExecutionSnapshotMapper` publishes the column verbatim. The fix is the constraint `video_status` already has in V14 §1. No row can hold an undeclared value today (§15.5); a restored dump or a manual repair could. | Owner of the next Studio migration | — |
| O-12 | `frontend/src/types/studio/studioTypes.ts` hand-maintains a six-member `ExecutionErrorCode` union that §15 has made narrower than the contract. No runtime effect and no exhaustive switch exists today. Better than widening it by hand: generate it, or assert it in `studioContract.test.ts`, which already reads this document. | The MFE story that next consumes `errorCode` | — |

## 10. Alternatives considered (summary)

Route-surface alternatives are in §3.3. For the timestamp:

| Option | Why not |
|---|---|
| **Absolute `at` on every entry** | The runner holds one wall-clock instant per run. Supplying more means either a second, uncalibrated clock or performing the origin arithmetic in the component that does not know the origin — and in both cases the raw offset the 500 ms seek needs is discarded before it reaches anyone who could use it. |
| **API-assigned receipt time** | Varies per delivery for identical facts, contradicting the byte-identical terminal retry of §5.3; and collapses a whole report's log buffer onto one instant, destroying correlation rather than degrading it. |
| **Both: `atMs` and an optional absolute `at`** | Two representations of one fact on one wire body, with no rule for which wins when they disagree. The derived value belongs on the surface that publishes it, where the API already owns the projection. |
| **Rename only, keeping `date-time`, and let the runner send `0`-epoch for the two placeholder sites** | Encodes "unknown" as 1970 and would have passed the checker. It is the shape of fix that makes a test green without making the system right. |

---

# Amendment, 2026-09-11 — O-7 and contract authority

Added after the rulings above, on the same branch, at `86a187267`. Story 10.12 exercised the mechanism §6.2 installed: it tried to add a field to a closed body, could not, and referred the question. That is the mechanism working on its first use, and the two sections below are the answer — one on the calibration placement O-7 left open, one on who may move this contract at all.

## 11. INT-5 — where the §6.4 recorder-origin calibration is applied (closes O-7)

### 11.1 The defect story 10.12 found

§INT-1 ruled that `logs[].atMs` sits on the same monotonic clock and origin as the step readings, with `0` meaning browser start. **In the merged code that invariant does not hold.** `executeSteps` takes an optional `clock` and falls back to `defaultClock = () => performance.now()`; `runCoordinator` passes no clock, so every step reading is an offset from *process* start, while `reportingStepReporter` appends the browser-start line with a literal `0`. Verified at `86a187267`: `src/executor/executor.ts:51,54` and `src/reporting/reportingStepReporter.ts:88`.

Two origins, then, on one wire body today. On a pod that has been up an hour, the first step of a run reports `startedAtMs ≈ 3_600_000` while the browser-start log reports `0`, and `browserStartedAt + atMs` — the derivation §INT-1 hands to the API — yields an instant an hour after the run began. The 500 ms step-seek target of §6.4 is not merely missed; the two scales are not comparable at all.

This was invisible to every gate. The readings are monotonic, fractional and non-null, so the schema is satisfied; the contract test checks shape, not scale; and the runner's own tests inject `createFakeClock`, which starts at `1_000` and therefore looks like a small offset. An optional clock parameter with a process-origin default is a defect generator: the seam exists precisely so the origin can be chosen, and the default quietly chooses the wrong one whenever a caller forgets.

### 11.2 Ruling

**Calibration is applied runner-side, at the clock, not on the wire. The proposed `recordingOriginMs` field is rejected and the contract gains no field.**

The runner constructs **one run-scoped monotonic clock whose zero is the recording origin** — the instant the recording context becomes ready — and injects it into step execution, replacing the process-origin fallback. The wall-clock `browserStartedAt` is read at that same instant. Every reading that crosses the contract is therefore already an offset on the recording timeline: `0` is the origin, as §INT-1 already said it was, and the API adds `browserStartedAt` and rounds, and does nothing else.

Amended in `openapi.yaml`: `RunnerStepState` and `RunnerLogEntry` now state the run clock and its origin instead of deferring the placement to "the recording stories"; `startedAtMs`, `finishedAtMs`, `durationMs` and `atMs` gain `minimum: 0`; `browserStartedAt` states the pairing with the clock's zero and the consequence that a report with `browserStartedAt: null` carries no reading at all; `StepResult.offsetMs` and `ExecutionLogEntry` state that the API applies no calibration of its own. Every runner-produced body stays closed. No field was added, removed or retyped.

### 11.3 Why, against the three tests the question was posed on

**The seek budget does not discriminate — and saying so honestly is the point.** Subtracting two readings of one monotonic clock is exact wherever the subtraction happens; arithmetic is associative, and shifting at the clock or shifting at the API produce the same number. The 500 ms budget rules out a *third* option — a per-entry wall clock or an API receipt time, both already rejected in §10 — and is silent between these two. What decides is not accuracy but how many places can get it wrong.

**Clock skew is zero either way, and that is the argument against the field, not for it.** Because there is no skew term to carry, a calibration constant on the wire conveys no information the runner could not have already applied. Its only effect is to make correctness depend on every consumer remembering to apply it. Story 10.7's draft is the proof: it computes `at = browserStartedAt + atMs`, which is right under this ruling and silently wrong under the field, and it is being written right now by an agent that has not seen the field. A contract whose correct use requires knowledge held outside it is the same class of hazard as an open schema — it cannot fail a test, it can only be misused.

**Retry and recovery favour the clock.** A terminal report is retried byte-identically until acknowledged (§5.3), and reports are cumulative, so the same log line appears in many bodies. Zeroing at the clock fixes each entry's value at the moment it is observed, so an entry is identical in every subsequent report and every retry by construction. A wire constant fixes nothing: each report carries its own `recordingOriginMs`, and nothing in a closed schema forbids report *n* and report *n+1* disagreeing about it — which would move every previously reported line. Worse, the timings also travel a second path: the terminal result manifest on Sonic (§5.3), which recovery reads when delivery fails. An API-applied constant would have to be carried there too, in sync, or the recovered timeline would differ from the delivered one. One origin at the clock keeps one number per fact on every path.

**Article IV.** §6.4 says "use a monotonic runner clock and calibrate its origin against the pinned recorder's first frames". It calibrates *the clock's origin*. Zeroing the clock is the literal reading; shipping a constant for someone else to subtract is the inventive one. §INT-1's `0`-is-browser-start is also already ruled and already on the wire — the fix should make the code obey the existing ruling, not rewrite the ruling to match the defect. The contract's own `final` example has always shown `startedAtMs: 120`, a recording-relative value; the field would have made the document's examples wrong.

### 11.4 Answering 10.12's argument directly

Its case for the field is that shifting the runner's own readings would put two origins on one wire. That is true only of a runner that emits a reading taken before the origin exists — and **10.12's own design removes that case**: a clock constructed at recording-context readiness cannot be read before it. Nothing the runner observes on the contract precedes the origin. Steps run after launch by construction (§5.2); anything earlier that ever needs a log line carries `atMs: null`, which §INT-1 and O-2 already established as the encoding for "no reading". The runner may keep a separate process-origin clock for its own stdout diagnostics; the contract is not a debugging channel (§9.2).

So the field is the residue of not having the injected clock. With the clock, it has nothing left to do. The two-origin hazard it was meant to solve is now also stated as a contract invariant — a report with `browserStartedAt: null` carries no reading — so the hole is closed by rule rather than by convention.

### 11.5 Alternatives rejected

| Option | Why not |
|---|---|
| **`recordingOriginMs` on the report, API applies** (10.12's proposal) | Conveys no information the runner could not apply itself, since skew is zero; makes correctness depend on every consumer applying it, and 10.7 demonstrably would not have; duplicates the constant onto the manifest path or desynchronises it; permits two reports to disagree about the origin of the same entry; contradicts `0`-is-browser-start and the contract's own examples. |
| **Runner shifts, and also reports the raw origin for diagnostics** | Two representations of one fact on one wire with no rule for disagreement — rejected for the same reason as `atMs`-plus-`at` in §10. Observability belongs in the runner's stdout, not in a closed contract body. |
| **API re-bases against the lowest reading it has seen** | Silently wrong whenever the first report is lost or the first step is slow, and it would have made the present defect *invisible* rather than fixed. Explicitly forbidden on `StepResult.offsetMs`. |
| **Leave O-7 open and let 10.12 choose at implementation time** | This is what the open item already tried. The placement determines 10.7's arithmetic, and 10.7 is drafting in the same wave; an unsettled placement is two stories guessing at each other. |
| **Runner rounds to integers as it shifts** | Rounding at the clock and again at persistence compounds two errors over one measurement. §4.3 stands: the wire stays fractional, the API rounds once when it persists `offsetMs`. What §4.3 got slightly wrong is only its aside that the API is "the component that knows the recorder origin" — under this ruling the runner is, and it still must not round. |

### 11.6 What 10.12 must do, beyond the rename

Contract-side this is settled; the following are the story's, and the first is the actual root cause:

1. **Remove the process-origin default**, or confine it to test construction. An optional `clock` that defaults to `performance.now()` will re-introduce this the next time a caller is added. The production path must be unable to run without an explicitly supplied run clock.
2. **Pair the two reads.** `browserStartedAt` and the clock's zero are one instant observed twice; take them adjacently at recording-context readiness, never at launch-call time and never re-derived.
3. **Measure the gap §6.4 actually names.** Context readiness is a *proxy* for the recorder's first frames, not the same instant. 10.12 owns measuring that gap on the controlled fixture in staging and, if it is a material fraction of the 500 ms budget, folding a measured constant into the origin the runner takes. That correction is runner-side too, so it needs no contract change — which is a second reason to keep the calibration in one component.
4. **Assert the scale, not just the shape.** `minimum: 0` is documentary here: the runner's contract-test validator implements `$ref`, `type`, `required`, `properties`, `additionalProperties`, `enum`, `allOf`/`anyOf`/`oneOf` and `const`, and ignores `minimum`. A schema cannot tell a process-origin reading from a legitimate late one. The enforcing assertion belongs in 10.12: a run through the fake browser must produce a first step reading within a small bound of `0`, and `createFakeClock`'s `startMs = 1_000` must not be what makes it pass.

### 11.7 What 10.7 must do — it is drafting now, in this wave

**Story 10.7 does not consume `recordingOriginMs` and must not wait for it.** The field does not exist. Its projection is correct exactly as drafted: `at = browserStartedAt + atMs`, and `offsetMs = round(startedAtMs)`. Three things its draft should state explicitly, because each is a silent failure otherwise:

1. **The API applies no calibration and adds no origin.** Readings arrive on the recording timeline already. In particular it must never re-base readings against the lowest or first one it has seen — a plausible-looking "fix" that would have concealed §11.1 rather than surfaced it, and which `StepResult.offsetMs` now forbids in the contract.
2. **`0` is a position, not a missing value.** `atMs: 0` is the browser start; `null` is the absence of a reading. A null-coalescing projection that treats `0` as absent loses the one line that anchors the timeline.
3. **It rounds once, at persistence.** The wire is fractional by §4.3; `offsetMs` and `durationMs` are `int64` on the public snapshot.

There is a sequencing fact 10.7's draft should carry, though it changes nothing it implements: **10.7 is correct by contract today and becomes correct in fact when 10.12 lands the injected clock.** Until then a real runner still emits process-origin readings and 10.7's derived instants will be absurd. The right response is to let them be absurd — the defect is upstream and visible. Compensating for it in API code would put a second, undocumented calibration in the component §11 just ruled must hold none, and it would survive long after 10.12 fixed the cause.

## 12. Contract amendment authority

Five stories code against `openapi.yaml` and waves 4 through 8 will ask this again, so it is ruled once here rather than per story.

Two facts have to sit together. Closed bodies exist to force a conversation: a story that can open its own body has an open body, and §6.2's whole point was that an open schema is a suggestion written in YAML. But 10.1's freeze is not evidence of correctness either — a wave gate proved this document incomplete about four routes and wrong about the base of the two it did declare. An architect-only rule would have left 10.6 blocked behind a document that was wrong; a story-may-edit rule would have dissolved the mechanism that found it. So authority follows the **class of change**, not the seniority of the editor.

**Class A — defects no producer or consumer could ever have satisfied.** A truncated or malformed description, a response with no declared content, a `servers` base that composes to a path nothing serves, a `$ref` to a missing schema. **Any story may fix these directly, in its own PR.** They are not decisions. The story demonstrates the defect with a contract-test failure before the edit and a pass after, and adds a line to §13. Gating these behind an architect blocks a wave and buys nothing.

**Class B — the shape or meaning of a runner-produced body.** Adding, removing, renaming or retyping a field on a closed body; changing what an existing field means; widening or narrowing an enum; changing a `required` list. **An architect rules first, in this ADR; the story then implements against the amended document.** The story should propose — with the defect demonstrated and a candidate shape, exactly as 10.12 did, which is why this ruling exists at all — but may not land the edit. The asymmetry that justifies the gate: a wrong local implementation costs one story, a wrong field on a shared closed body costs up to five, and is discovered late by whichever consumer guessed differently.

**Class C — routes, security schemes, tags, `servers`, status-code semantics, and anything on the public surface.** Architect, always. These trace to §8.3/§8.4 and the architecture document is their source; a change here is an architecture change wearing a schema's clothes.

Three rules that bind all three classes:

- **Loosening is never a story's call.** Reopening a closed body, relaxing `required`, or widening an enum to admit what a producer happens to send is Class B even when it looks like Class A. That manoeuvre is what produced INT-4, and it is the one edit whose only effect is to stop a test from telling the truth.
- **Leave it red and escalate.** A story that finds a divergence it may not fix leaves the contract test failing and refers the question. Story 10.6 did exactly this and it is why four divergences were ruled on instead of buried; it is now the rule, not a good instinct.
- **Every amendment is recorded.** Freezing means *changes are recorded*, not that they never happen. Each entry names the divergence, the source it traces to (Article IV), the consuming stories re-checked, and the contract-test result before and after.

An architect amending the contract still never edits a story's Title, Acceptance Criteria, Scope or Status; where a ruling invalidates a draft, it says so and the story's owner applies it.

## 13. Amendment log

| Date | Change | Class | By | Contract test |
|---|---|---|---|---|
| 2026-10-05 | STUDIO-SCHED-001: eight public schedule/capability/preview/occurrence operations and optional immutable run/activation provenance; runner-produced bodies unchanged. See [ADR-003](ADR-003-studio-test-scheduling.md) and approved feature contract. | C | @architect, spec pipeline; independent critique APPROVED | Existing 23 operation status pins retained; eight reviewed operations added, total 31. Runner whole-document hash re-anchored with its assertion retained; measured final results in feature implementation evidence. |
| 2026-09-17 | Land video 401/403/503 declarations from §§24/25, truthful nested session envelope, and both shipped 503 producer shapes (§31). No application behavior changed | C | @architect, story 10.27 | ESC-1/ESC-2 assertions unchanged; owner reruns contract/status fixtures and re-anchors digest |
| 2026-09-11 | All six §8.4 routes declared, per-path `servers`, `runner`/`api-callback` tags, `x-served-by`, `serviceIdentity` (§3) | C | @architect, ADR-002 | 576/2/2 → 577/2/1 |
| 2026-09-11 | `logs[].at` (`date-time`) → `atMs` run-timeline offset (§4) | B | @architect, ADR-002 | as above |
| 2026-09-11 | 409 description un-truncated, spurious null-valued key removed (§5) | A | @architect, ADR-002 | as above |
| 2026-09-11 | Runner-produced bodies closed; `RunnerReport → ExecutionSnapshot` mapping table added (§6) | B | @architect, ADR-002 | as above |
| 2026-09-11 | Run clock and recording origin stated; `minimum: 0` on all timings; `browserStartedAt` paired with the clock zero; API applies no calibration. `recordingOriginMs` **rejected** (§11) | B | @architect, this amendment | `test/contract.test.ts` 14/14 before and after |
| 2026-09-11 | `AdmissionResponse` closed — `additionalProperties: false`, all six fields named and required, `state` enumerated `ADMITTED`/`RUNNING`/`FINALIZING`; new closed `ProgressAck` for the progress `200`, which declared no content at all; the duplicate-delivery `200` (`applied: false`) documented (§9 O-4) | A for the content-less `200`; the closures are O-4, which §9 assigned to this story by name | @dev, story 10.7, at `af17549ec` | `StudioContractTest` 8/8 before and after |
| 2026-09-11 | `x-not-yet-implemented` removed from `streamExecution` and from the two internal callback routes — the contract declared as unshipped three routes this story ships (§9 O-4) | A — a declaration the running system contradicts | @dev, story 10.7, at `af17549ec` and `7e827e52c` | `StudioContractTest` 7/8 → 8/8 |
| 2026-09-11 | Conflict responses declared for a withheld draft on `compileTest`, `confirmCompile` and `executeTest`; `x-conflict-codes` introduced on every public `409`; missing `400` declared on `compileTest` and `confirmCompile` (§14). Closes story 10.8's AC-1b escalation | C | @architect, this amendment | `test/contract.test.ts` 14/14 before and after (no `internal`-tagged operation touched) |
| 2026-09-11 | `ExecutionErrorCode` widened to eight values with `AUTHORIZATION_REVOKED` and `REFERENCE_UNAVAILABLE`, each condition and remedy stated; `x-assigned-by` names the assigning component for every member; `x-runner-error-codes` declares the runner's ten codes on the still-open `RunOutcome.errorCode` (§15). Closes story 10.7's AC-13a escalation — the last deliberately-red test on the branch | C | @architect, this amendment | `ExecutionErrorCodeContractEscalationTest` 1/2 → **2/2** with no change to the test; `StudioContractTest` 9/9, `ArtifactSchemaDriftTest` 3/3, `test/contract.test.ts` 14/14, all before and after. Full record in §15.10 |
| 2026-09-11 | `TestDto` gains nullable `compileError` and `compileDiagnostics`, declared as the typed `CompileError` / `CompileDiagnostic` / `CompileStepDiagnostics` / `CompileDiagnostics` schemas read from the merged producer; `x-compile-error-codes` declares the eleven codes; `attempts` and `exhausted` named for 10.9 AC-11; the `GET /tests` list projection's omission and a `needsRevision` example added (§16). Closes story 10.9's AC-22 escalation and unblocks 10.10. **No route added and no marker moved** | C | @architect, this amendment | `StudioContractTest` 9/9, `ArtifactSchemaDriftTest` 3/3, `CompileRouteContractDivergenceTest` 9/9, `test/contract.test.ts` 14/14, frontend 98 passed — all before and after. Full record in §16.10 |
| 2026-09-11 | `RunnerEvidence` gains an **optional** boolean `partial` — the runner-observed fact that a recording does not cover the whole browser session — with the derivation from `outcome` forbidden in both directions and the producer assigned to story 10.13 (§17). Closes story 10.13's AC-18 escalation. Optional rather than `required` so the merged runner stays conformant; promotion recorded as O-14 | B | @architect, this amendment | as above; `test/contract.test.ts` 14/14 before and after, which is the measurement that matters here. Full record in §17.8 |
| 2026-09-11 | `x-not-yet-implemented` removed from `confirmCompile` — story 10.9 lands `POST /tests/{id}/confirm-compile`, so the document no longer declares as unshipped a route the running service serves. `x-implemented-by: '10.9'` stays; no other operation's marker moved and no other edit was made to the document | A — a declaration the running system contradicts, the precedent §14.8 item 5 set for `compileTest` | @dev, story 10.9 | `StudioContractTest.theConfirmRouteIsShippedAndTheMarkerCameOffForThatOperationOnly` red before (the route was absent and the marker present) → green after; `pendingOperations()` is `GET /executions/{id}/video` alone |
| 2026-09-12 (landed 2026-09-15) | **LANDED** by story 10.18a at `dc0c30089`. `RunnerEvidence.partial` promoted from optional to `required` — `required: [videoKey, manifestKey, state, partial]` — and the property's own description corrected, because it still states *"The merged runner does not emit it yet"* about a producer that merged in wave 4 (§20). Closes **O-14** and story 10.14's AC-26, which was recorded *skipped, never passed* for want of exactly this ruling | B | Ruled by @architect, this amendment; **landed by story 10.18**, which in the same PR inverts the two `confinement.test.ts` assertions the promotion falsifies and re-anchors `BASE_SHA256` (§20.4, §20.7) | **MEASURED by @dev, story 10.18a, at `dc0c30089`** — replacing §23.3's prediction, which is what §19 item 3 requires of the owner. Every predicted figure reproduced. `test/contract.test.ts` **14/14 before and after**. `StudioContractTest` **12/12 before and after** — unchanged as predicted; the *number* is 12 rather than the 9/9 of the §15/§16 rows, because the suite has grown since, and the cell predicted "unchanged" rather than a count, so it reproduces. `ArtifactSchemaDriftTest` **3/3 before and after**. `CompileRouteContractDivergenceTest` **9/9 before and after**. `confinement.test.ts` with only the contract edited: **2 red / 16 green** — the predicted 2, the pin at `:160` and the promotion assertion at `:172` — and **18/18** after the owner's inversion and re-anchor. Full runner suite 918 passed / 10 skipped / 46 files, unchanged. Falsification: reverting the `required` line on the production document reddens the inverted assertion and the pin, 16 siblings in the file staying green; restored byte-identically, hash-verified |
| 2026-09-12 (landed 2026-09-16) | **LANDED** by story 10.11c at `4157d7f62`. `TestDto` gains nullable `currentCandidateArtifactHash` and nullable `currentCandidateArtifact` (the frozen `artifact.schema.json` shape), both nulled in the `GET /tests` list projection on §16.5's precedent — closing the gap where `ConfirmCompileRequest` requires a value that **no** `tests`-tagged `2xx` response returns (§21). Closes story 10.10's **AC-15** escalation and unblocks its AC-11(b) and AC-16(b), both of which landed in the same story by @po's O-17 routing. Candidate **B** (a revision read route) rejected on **correctness**, not on cost. **Nothing else moved:** no route, no status, no `required` list, no enum, no marker, neither copy of `artifact.schema.json`; `provenance` and `artifactSchemaVersion` deliberately not added (§21.8). One declaration was added beyond the two property names and is reported rather than buried: the hash carries `minLength`/`maxLength` 64, mirroring `ConfirmCompileRequest.artifactHash`, because a read declaration looser than the write declaration of the identical value would let an example validate on one side and fail on the other — asserted in `studioContract.test.ts` | C | Ruled by @architect, this amendment; **landed by story 10.11c**, which carries the backend producer in the same commit — @po widened the scope rather than splitting the producer out (§21.9) | **MEASURED by @dev, story 10.11c**, with the **final** test files, by restoring the pre-edit document (`310d3c984b77104898440cae450795cdd56c11ef926f75209fb6d4198dcc0cf7`) and re-running. Both predictions reproduce. **`studioEscalation.test.ts` 2/3 → 3/3 with the file byte-unchanged** — verified before it was touched, and only its comment changed afterwards; the assertion region hashes `a3e77163…` before and after. **`StudioContractTest` 13/14 → 14/14**: the one red before is `theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames`, which is set equality and is why this edit cannot be document-only — the count is 14 rather than the 12 of the §20 row because this story adds one test (`noOperationsStatusSetOrMarkerMovedWhileTestDtoGainedTwoProperties`, AC-30's in-test document invariants). `ArtifactSchemaDriftTest` **3/3 before and after**. New `CandidateArtifactProjectionIT` **4/4 before and after** — it drives the producer against a real PostgreSQL and reads the persisted row, so the document does not enter it. `CompileRouteContractDivergenceTest` **8/9 before and after**: the one red is **pre-existing and not this story's** — `:212` still asserts `x-not-yet-implemented: true` on `getExecutionVideo`, which story 10.15 removed, and it is red against the pre-edit document too. Runner `test/contract.test.ts` **15/15 before and after**; `confinement.test.ts` **17/18 before → 18/18 after** the `BASE_SHA256` re-anchor to `51850b016cd8a697899a944eab12ddce5456967beecf4f3e011720498bc02efa` (`FOC-06` **step 3 of 3**, the last of the wave; the pin was verified green on arrival at 10.15's digest by running the file before anything was touched). Full runner suite **941 passed / 29 skipped / 49 files, unchanged**. Backend `com.citi.put.checks.studio.*` measured on both sides in separate worktrees: baseline `f868c31df` **90 files / 687 tests / 7 skipped / 6 failures in 4 classes**, after **91 / 692 / 7 / 6 in the same 4 classes** — no new failure. Falsification: dropping one component from `UITestDto` reddens the set-equality test alone, 13 siblings green; a producer preferring the confirmed revision when there is one reddens exactly one of the new IT's four cases; a list projection that passes the candidate through reddens exactly one other; one further byte of the document reddens the pin alone, 17 siblings green; a status code added to one operation reddens AC-30's inventory alone. All restored byte-identically, hash-verified |
| 2026-09-12 (landed 2026-09-15) | **LANDED** by story 10.18a at `dc0c30089`. `RunJob.resolvedVars` gains the scrubbing clause in its own right, and `resolvedSecrets`'s *"additionally scrubbed"* is corrected: both are scrubbed with their tested encoded variants, and what is additional to a secret is vault-use authorization, not redaction (§22). **The document was the divergent side, not the code** — architecture §9.2 says *"Runner scrubs known values"*, and `knownValuesOf` has always returned both maps | B | Ruled by @architect, this amendment; **landed by story 10.18** in the same PR as the O-14 row above, so the pin moves once for both (§23.2) | Description text only; no schema shape, no `required` list and no enum changes. **MEASURED by @dev, story 10.18a, at `dc0c30089`**, in the same PR as the O-14 row above and against the same pin move: `test/contract.test.ts` 14/14, `StudioContractTest` 12/12, `ArtifactSchemaDriftTest` 3/3, `CompileRouteContractDivergenceTest` 9/9, full runner suite 918 passed / 10 skipped — **all before and after, every suite unchanged as predicted**. A prediction of *nothing changed* is satisfied by not looking, which is why it was measured rather than repeated. Recorded here rather than left to prose because §12's third rule cuts the other way too — a *strengthening* is still a meaning change on a closed body |
| 2026-09-16 | **LANDED** by story 10.15. Four edits, all on `getExecutionVideo` and on nothing else. **Three Class A content declarations:** the `206` gains declared `video/webm` content with its `Content-Range` and `Content-Length` headers; the `404` gains `application/json` `ErrorResponse` content with a `noEvidence` example — *a response with a description and no content* is verbatim §12's own example of a Class A defect, and this was that response; the `416` gains the same content with an `unsatisfiable` example plus its `Content-Range` header, which RFC 9110 requires in the `bytes` `*` `/S` form. **And the marker:** `x-not-yet-implemented` removed — **it was the last one in the document**, exactly as §13's row of 2026-09-11 predicted (*"`pendingOperations()` is `GET /executions/{id}/video` alone"*) — with `x-implemented-by` **corrected from `'10.16'` to `'10.15'`**. That correction is **reported as a finding, not laundered**: `'10.16'` is the *frontend* playback story, while the epic manifest assigns *"Authorized Range video/download endpoint"* to 10.15 and *"Evidence state, playback and step seek"* (Frontend) to 10.16, and the retired epic's index table agrees. A vendor extension naming a story that will never implement the route is **a defect nothing could ever have satisfied**, which is §12's own Class A language. **No status was added or removed** — the response set is still exactly `{200, 206, 404, 410, 416}`; declaring the missing `401`/`403` and a status for an unreachable store are Class C and are escalated as ESC-1/ESC-2, left red rather than taken | A — three content-less responses on a public operation, plus a vendor-extension value that is wrong rather than stale. The `x-implemented-by` correction was **ruled Class A by @po at wave-6 validation**: it is none of §12 Class C's categories (not a route, a security scheme, a tag, `servers` or a status-code semantic), no client behaviour depends on it, and no conforming implementation is affected by its value | @dev, story 10.15 | **MEASURED by @dev on this branch**, with the final test files, by restoring the pre-edit document (`d1a987663b25d7240fc460f923289aaf22a07145df7d6913114f9f3c1d627c18`) and re-running. **Before: `ExecutionVideoContractTest` 6/15, `StudioContractTest` 9/13, `ExecutionVideoContractEscalationTest` 0/2. After: 15/15, 13/13, 0/2** — the escalation test is red before and after, on purpose, and goes green with no change to it when ESC-1 and ESC-2 are ruled. `StudioContractTest` gained one test (`theVideoRouteIsShippedAndTheMarkerCameOffForThatOperationOnly`) and two existing assertions were **amended, not deleted**: `pendingOperations()` is now `isEmpty()`, and the video-route marker assertion is inverted from `isEqualTo(TRUE)` to `isNull()`. Runner `confinement.test.ts` **18/18** after the `BASE_SHA256` re-anchor to `310d3c984b77104898440cae450795cdd56c11ef926f75209fb6d4198dcc0cf7` (`FOC-06` **step 2 of 3**; the pin was verified green on arrival at 10.18a's digest before anything was touched, so nothing unowned is folded in). Falsification: a marker restored on `getExecution` reddens six assertions across the two contract tests; `x-implemented-by: '99.9'` reddens both the instance guard and the both-ways class guard; one further byte of the document reddens the pin alone, 17 siblings staying green. All restored byte-identically, hash-verified |
| 2026-09-16 (landed 2026-09-17) | **LANDED** by story 10.31 at `113948325`. `getExecutionVideo` declares **`401`** (`$ref` `SessionUnauthorized`, §25), **`403`** (`$ref` `Forbidden`) and **`503`** (`ErrorResponse`, `storeUnavailable` example, code `VIDEO_STORE_UNAVAILABLE`), and its description gains §24.6's two paragraphs — the refusal order, and *branch on the status, never on the body*. Closes **ESC-1** and **ESC-2** (story 10.15 AC-22). Exact text in §24.6, applied verbatim. Nothing else on the operation moved, and **no production code changed anywhere** (§24.2). Landed in the same commit as the row below, so the runner pin moved once for both. | C | Ruled by @architect, §24. Owner **@dev, story 10.31** (named by @po at wave-8 planning) | **MEASURED by @dev on this branch**, with the final test files, `--rerun-tasks` throughout. **`ExecutionVideoContractEscalationTest` 0/2 → 2/2 with the assertion region byte-unchanged** — `sha256(lines 54-117 before) = sha256(lines 58-121 after) = 708fdbad270a220577dcdaead413d1aa3a49980f31aaab3a018af9e743545f2a`; only the class Javadoc moved. `ExecutionVideoContractTest` **15/15 → 17/17** (two new tests: the `$ref`-equality comparison and the tag-partitioned `401` guard). `StudioContractTest` **14/14 → 14/14**, its video row updated to `200,206,401,403,404,410,416,503`. `ExecutionVideoEvidenceIT` **15/15 → 15/15**, strengthened. New `ExecutionVideoRefusalEnvelopeIT` **2/2**. `CompileRouteContractDivergenceTest` **9/9 → 9/9**, unaffected. `ExecutionVideoAuthorizationIT` **14/14**, untouched, as §24.7 said. Whole `com.citi.put.checks.studio.*` package: **712 → 716 tests, 703 → 709 passed, 2 → 0 failed, 7 skipped either way** — the `+4` is exactly the four new tests, and the two closed reds are ESC-1 and ESC-2. §28.4's simulated **`14/15`, `13/14`** on the two hand-kept literals **reproduced exactly** before they were updated. **Frontend, which §28.4 could not run** (`node_modules` absent there): `npm test` **541 passed / 2 failed (543) before and after** — the two reds are story 10.11c's `confirmedRevisionEscalation.test.ts`, deliberately red and unrelated; `studioContract.test.ts` 54/54 and `studioVideoHandler.test.ts` 10/10 both green after the mock and test edits. `npm run type-check` shows the same two pre-existing `TS2307` errors (ENV-1) and `npm run lint` **cannot start** on this branch and is **not reported as passed**. **Runner, also not run by §28.4**: `npm test` **984 passed / 29 skipped (1013)** before and after, `confinement.test.ts` **18/18** both times, across the re-anchor to `d9f5f2a2bfac4f51baa2a334b1129236578703acbe5f0d137c98ab54b227af6a`; `npm run test:fixtures` 90 passed / 10 skipped, `lint` and `build` clean, `check:pins` OK; `type-check` has one pre-existing error in `test/fixtures-tier/deadline-cleanup.test.ts`, verified present on the unmodified file too. Falsification: removing the `401`/`403` entries reddens ESC-1 alone within that class; removing the `503` reddens ESC-2 alone; a route-local `403` copy reddens only the new `$ref` comparison, the status **set** being unchanged; each hand-kept literal restored to its old value reddens only its own test; reverting the mock reddens exactly the three frontend tests §24.5 names and no other. Every mutation restored byte-identically, hash-verified |
| 2026-09-16 (landed 2026-09-17) | **LANDED** by story 10.31 at `113948325`, in the same commit as the row above. A new response component, **`SessionUnauthorized`**, with body **`PlatformErrorResponse`** (new schema, `error: {code, message, traceId?}`), a `sessionRequired` example and a description saying the two envelopes differ. **The eleven public operations that already declared a `401` point at it.** The two internal callbacks keep `Unauthorized`/`ErrorResponse`, which matches their producer (`ServiceIdentityAuthenticationFilter`, flat), and `components.responses.Unauthorized` and `components.schemas.ErrorResponse` are **not** edited. Counting §24.6's own new `401`, the document's final state is **twelve** public operations on `SessionUnauthorized`, **two** callbacks on `Unauthorized` and **four** runner operations on `RunnerUnauthenticated`. **No status set moved on any of the eleven, and no code changed: the document catches up with what the producers send.** O-19 / ADR-003 is deliberately not decided here. Exact text in §25.4, applied verbatim | C — the `401` body on every public operation | Ruled by @architect, §25. Owner: the same PR as the row above | Measured together with the row above — see that cell. It added **no red of its own**, exactly as §28.4 predicted: the two reds were both status-set copies. **§25.3's open statement is now closed by measurement rather than by reading.** The new `ExecutionVideoRefusalEnvelopeIT` drives a real identityless request and a real no-ownership request at `getExecutionVideo` and validates the captured bytes — `{"error":{"message":"Session required","code":"UNAUTHENTICATED","traceId":"…"}}` and `{"error":"STUDIO_FORBIDDEN",…}` — against `PlatformErrorResponse` and `ErrorResponse` read live from the document. Both schemas were shown to **discriminate**: validating the `401` body against `ErrorResponse` fails with `[$.error: object found, string expected, $: required property 'message' not found]`, and the `503` body against `PlatformErrorResponse` with `[$.error: string found, object expected]`. The `sessionRequired` example was Ajv-validated against `PlatformErrorResponse` before any suite ran (§18.5). The tag-partitioned guard was falsified four ways, each restored byte-identically: repointing one of the twelve at `Unauthorized`, repointing `claimAdmission` at `SessionUnauthorized`, adding a correctly-declared thirteenth untagged operation, and removing `internal` from `runnerHealth` — each reddened it and nothing else in the two contract classes. **Reported as a finding:** §25.4's own falsification note expected mutations (a) and (b) to redden *the pinned list* as well; measured, they do not — the pin is over operationIds, and repointing a `$ref` moves no key. The value comparison is what catches them, and with it removed mutation (a) passes. The pinned list and the `12`-count were each shown to catch the thirteenth operation on their own |
| 2026-09-16 (landed 2026-09-17) | **LANDED** by story 10.30 on `story/10.30`: the fix at `3b245079b`, and the prose, the pin and this row at `160e218bf`. Prose only on `getTest`, `updateTest` and `deleteTest`: §27.6's four blocks, each checked by script to appear verbatim in the document. An unknown, soft-deleted or quarantined draft, and a draft the caller may not read (GET) or write (PUT/DELETE), all answer **`403 STUDIO_FORBIDDEN`**. `updateTest`'s `409` description loses its "answers `400`" sentence; the paragraph's remaining sentence ("Refusal with `TEST_DELETED`/…") now starts its own line, with its words unchanged. Closes **O-10**. **Shipped with its producer (O-18):** `createTest` checks `canWrite` after the registered-CSI check; `updateTest(…, Authentication)` reads the draft through the visibility restriction, checks `canWrite` on that draft's CSI, then takes the lock, and an empty locked read is `403`; a new `softDeleteTest(UUID, Authentication)` does the same without a lock; and `StudioController.deleteTest` now takes `Authentication`. The two internal overloads are unchanged. **A finding, not in §27:** Hibernate 6.5 hands the draft it already holds back to the locking query without refreshing it. A throwaway probe measured it: visible revision 1, row at 6, and the locked read returned 1, the same instance. The visible copy is therefore detached before the lock. Without the detach, `OptimisticSaveIT`'s concurrent-save test failed in **4 of 4** runs | C — status-code semantics on three public operations. **No status is added or removed**: the parsed status sets are GET `200,400,401,403`, PUT `200,400,401,403,409` and DELETE `204,400,401,403` | Ruled by @architect, §27. **Landed by story 10.30** (@dev); @qa's failing-first tests are at `a8379128d` | **MEASURED by @dev, story 10.30.** Backend runs use `--rerun-tasks`. Before is `a8379128d` (contract `51850b01…`); after is this branch (contract `d55d7737…`). `StudioContractTest` **14/14 → 14/14**, `ExecutionVideoContractTest` **15/15 → 15/15**, `CompileRouteContractDivergenceTest` **9/9 → 9/9**, `ExecutionVideoContractEscalationTest` **0/2 → 0/2** (ESC-1/ESC-2 stay red on purpose until §24 lands). §28.4's prediction, *no additional red*, **reproduces**. §28.4's digests came from a copy that also carried §24/§25, so none is comparable to this file's and none was used. §27.5's tests, written first by @qa and unmodified here: `StudioAuthorizationIT` **19/24 → 24/24**. The five that were red are AC-2 PUT, AC-2 DELETE, AC-3, AC-4 and AC-5. The new `StudioServiceWriteAuthorizationTest` (AC-18) is **7/7**. Runner `confinement.test.ts`: **18/18 on arrival** at `51850b01…`; **17/18 with only the document edited** (the pin alone went red); **18/18 after the re-anchor** to `d55d7737647a49b97e2b505a59364473d0a3695936cc447a005fcb3ed47eb318`, re-read from the file with `shasum -a 256` (`FOC-07` **step 1 of 2**). The full runner suite is **947 passed / 29 skipped / 50 files, before and after**. Backend `com.citi.put.checks.studio.*`: before, **700 completed / 686 passed / 7 failed / 7 skipped** (ESC-1, ESC-2 and @qa's five); after, **707 / 698 / 2 (ESC-1, ESC-2) / 7**, in 362 s wall clock. It ran to completion, with no MED-2 stall. The delta is exactly the five flips plus the seven new cases; no test disappeared and the skipped set is identical. Falsification: 14 mutations are recorded in story 10.30. The measured reason AC-18 exists: reading the CSI through `findCsiIdIncludingWithheld` (M7) reddens **no** HTTP test. Neither does authorizing the body's `csiId` with a fallback to the draft's (M2c); only a unit case catches it |
| 2026-09-18 | **Studio v1 WP4 — cancel (§29).** Public `cancelExecution` (`POST /executions/{id}/cancel`: `202` `ExecutionSnapshot`, `400`, `401` `SessionUnauthorized`, `403`, `409` with `x-conflict-codes [EXECUTION_TERMINAL, CANCEL_ALREADY_REQUESTED]`); runner `runnerCancelRun` (`DELETE /v1/runs/{id}`: `202` closed `RunCancelAccepted`, `401`, `403`, `404`, `409`); `ExecutionErrorCode` gains `CANCELLED` (table row, `x-assigned-by`); `x-runner-error-codes` gains `CANCELLED`; the intersection prose, `RunOutcome.errorCode` and the `RunnerReport` mapping row name `TIMEOUT` **and** `CANCELLED`. No runner-produced body gained or lost a field; no existing status moved. Producers in the same change: backend route, ledger CAS, relay, reaper; runner `DELETE`; frontend carrier and narrative | C — public surface and two routes. Authorized by the Studio v1 plan, WP4 and decision D4, **not** by an architect ruling recorded here first; @architect to ratify or amend | @dev, Studio v1 WP4 | Pins moved deliberately in the same change: `StudioContractTest` 14/14, `ExecutionVideoContractTest` 17/17 (operation count 18 → 20, public `401`s 12 → 13, runner `401`s 4 → 5); runner `confinement`/`errors`/`contract` 49/49 with `BASE_SHA256` re-anchored; frontend `studioContract.test.ts` 54/54 after `CANCELLED` moved into the carrier (3 red before) |
| 2026-09-18 | **Studio v1 WP4, amended — pull-based cancel (§29.4).** New `readExecutionControl` (`GET /internal/studio/executions/{id}/control`: `200` closed `ExecutionControl`, `400`, `401`, `403`, `404`); `ProgressAck` gains required `cancelRequested`; `runnerCancelRun`'s `404` row says it is not an acknowledgement; `cancelExecution`'s table says the owner learns the cancel itself. Producers in the same change: backend control route and ack flag, `ADMITTED` `FINAL` for a cancelled run; runner control poll and ack handling | C — a new internal route and a field on a closed callback body. Same authority as the row above (plan WP4, coordinator follow-up closing §29.3's multi-pod limit); @architect to ratify | @dev, Studio v1 WP4 | Pins moved deliberately: operation count 20 → 21, internal routes 7 → 8, callback `401`s 2 → 3; runner `BASE_SHA256` re-anchored |
| 2026-09-18 | **Studio v1 WP11 — the interrupted step (§29.5) and the measured grace (§29.3).** Description text only: `RunnerStepState.failure` may be non-null on `SKIPPED` — the step a cancel interrupted carries the fixed text `The run was stopped before this step finished.`; `RunnerStepState.startedAtMs` and `StepResult` say that step keeps its start; `runnerCancelRun` names the chart's 15 s grace and the `SKIPPED` step. Producer in the same change: the runner's `stopAwareReporter`. The chart's `STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS` moved 5000 → 15000 on measurement | B — the meaning of a field on a closed runner body. Authorized by Studio v1 decision D1 (user-approved), **not** by an architect ruling recorded here first; @architect to ratify | @dev, Studio v1 WP11 | Runner `confinement.test.ts` 1 red with only the document edited (the pin) → green after `BASE_SHA256` re-anchor; `contract.test.ts` + `contract-integrity.test.ts` + `confinement.test.ts` 36/36 after. After only (not re-run against the old document): `StudioContractTest` 14/14, `ExecutionVideoContractTest` 17/17, `ArtifactSchemaDriftTest` 3/3; frontend unit suite 568 passed / 3 failed, the 3 failing identically on an untouched checkout of the base commit |
| 2026-09-22 | **studio-vault-secrets — test-scoped Studio secrets (§32).** New `listTestSecrets` (`GET /tests/{id}/secrets`: `200` `StudioSecretList`, `400`, `401` `SessionUnauthorized`, `403` `Forbidden`, `503` `ErrorResponse` with `VAULT_NOT_CONFIGURED`/`VAULT_UNAVAILABLE` examples) and `createTestSecret` (`POST /tests/{id}/secrets`: `201` `StudioSecret`, `400` naming the four `INVALID_SECRET_*` codes and that `403` is decided first, `401`, `403`, `409` with `x-conflict-codes [SECRET_ALREADY_EXISTS]`, `503` as for GET). New closed schemas `StudioSecretName`, `StudioSecretList`, `StudioSecret`, `CreateStudioSecretRequest` (`value` `writeOnly`). The canonical create example's `secretId: vault://studio/pilot-pw` becomes `LOGIN_PW` (OQ-3 ruling). No runner-produced body, no existing operation's status set, and no tag or security scheme moved. Producers in the same change: `StudioSecretsController`/`StudioSecretsService`, the Vault create/list provider seam | C — two routes on the public surface | Ruled by @architect in `docs/specs/studio/vault-secrets/spec.md` §9.1 (OQ-5, R-5.1…R-5.5); **landed by @dev, story studio-vault-secrets** | **MEASURED by @dev on this branch.** `StudioContractTest` **14/14 before** (21 operations, P0 baseline) → **14/14 after**, with both `hasSize` pins moved 21 → 23, the two rows added to the expected map, the drift message naming this ruling, and four schema/record parity assertions added; springdoc exposes both routes under `{id}`. Runner `confinement.test.ts` **19/19 on arrival** at `c6b891387d939131f38b68971e51cecccebfa6fd4b3af09ac34a121477171088`; **18/19 with only the document edited** (the pin alone); **19/19 after the re-anchor** to `96d54caecd5479ca2d38c7649378c5163611dbc604f3e1c53510203ec3d9687b`, re-read with `shasum -a 256`. Runner `contract.test.ts` + `contract-integrity.test.ts` **18/18 after** (not run before the edit). Frontend `studioContract.test.ts` **56/56 after**, file unchanged (not run before the edit). `ExecutionVideoContractTest` **16/17 with the document edited** (the public-`401` count pin, 13 → 15, which this plan did not list) → **17/17** after `listTestSecrets` and `createTestSecret` were added to its pinned public-operation list and the count moved to 15 |
| 2026-10-04 | **VAL-012 — `RunnerLogEntry.stepIndex` (§33).** `RunnerLogEntry` gains an **optional**, nullable `stepIndex` (`integer`, `minimum: 0`), not added to `required`; the `ExecutionLogEntry` description is rewritten from *"no runner-side source today"* to the step the line is about. The public `ExecutionLogEntry` shape does not move. Same edit, VAL-018: `ReportedRuntimeVersions` names the keys the API projects, including `chromiumBuild → chromium` (description text only), and the `RunnerReport` mapping table gains a `logs[].stepIndex` row. Promotion to `required` is **O-21** (§33.4). **Release constraint: backend before runner** (§33.3) | B | Ruled by @architect (`docs/stories/UI-STUDIO-VALIDATION-20261004/VAL-012-014-017-rulings.md`); **landed by @dev, VAL-012/VAL-018, uncommitted on `brunobuger/ui-studio`** | `BASE_SHA256` re-anchored `96d54cae…9687b` → `5571bee0…f629` from `shasum -a 256`. Runner suite and backend `RunnerReportProjectionTest` measured green by @dev; `StudioContractTest` (schema-to-record parity) and `ProgressCallbackIT` **skipped, not passed** — Docker was down; parity checked by reading the parsed schema against the record instead |
| 2026-10-04 | **VAL-027 / VAL-024 / gate QA-5 — save and compile `400` codes documented.** Description text only, on `createTest` (operation description and `400` description), `updateTest` (operation description; its `400` stays the shared `BadRequest` `$ref`) and `compileTest` (`400` description). They now list the codes the server returns: `INVALID_STEPS` (blank step on save; no steps or a blank step at compile), `INVALID_CONFIGURATION` for `timeoutSeconds` outside 1..120, and `SOURCE_TOO_MANY_STEPS` / `SOURCE_LINE_TOO_LONG` at save as well as at compile (VAL-024 moved those two checks forward with the same codes and messages). Behaviour change stated in the document: an out-of-range `timeoutSeconds` (e.g. `0`) used to be coerced to `30` and is now `400`, which is what the declared `minimum: 1, maximum: 120` already said. No status, schema, enum, `required` list, example or route moved | **C** — **RULED 2026-10-05 by @architect (§34)**, correcting the `A` @dev recorded. Public routes, and the edit records a status-code behaviour change for clients (`201` → `400` for `timeoutSeconds: 0`, blank steps and over-bound drafts at save); §12 assigns authority by class of change, not by edit type. Content ratified unchanged; not a loosening | @dev, UI-STUDIO-VALIDATION-20261004 (edit); @architect (class ruling, §34) | `confinement.test.ts` 19/19 after re-anchoring `BASE_SHA256` to `43fe0bb46cb40011ae3f19e05071e16fbe6ffd437e6fb785c0b36586a7c47898` (was `5571bee0…0f629`). `StudioContractTest` 14/14 after (before not measured; no assertion reads these descriptions) |
| 2026-10-06 (landed 2026-09-16; committed in `51ade0f1f` and `554277fcb`) | **Story 10.27: readable confirmed source (§30).** This row was added retroactively to close gate finding 10.27 V-1. `TestDto` gains two nullable fields: `confirmedRevisionArtifactHash` (64 lowercase hex characters, `pattern: '^[0-9a-f]{64}$'`) and `confirmedRevisionArtifact` (normative `artifact.schema.json`). Both describe exactly `confirmedRevisionId`. They are read together with the draft and its independently joined confirmed revision in one transaction, never recomputed by a client, and never substituted from `currentCandidateArtifact*`. `GET /tests` always returns both as `null`, on §16.5's precedent. The `getTest` example carries the pair. This puts the **confirmed** revision's artifact and hash on a declared `2xx` response (`GET /tests/{id}` and every `TestDto`-returning mutation). It is the Class C amendment that **10.11 AC-3(b)** (`10.11.story.md:229`) and **10.34 AC-24** wait for, and it resolves 10.11c's AC-32 escalation. No route, status, `required` list or runner-produced body moved. Same date, text only: `openapi.yaml:3027` cross-reference changed from "ADR-002 section 29" (now Cancel) to "§30", and the 2026-09-17 video row above changed from "§30" to "§31" | C | Ruled by @architect (§30); **landed by story 10.27**. Row and cross-reference fixes by @architect, 2026-10-06 | 10.27 gate (HEAD `b40be10d0`): `StudioContractTest` 14/14, `StudioApiIT` 7/7, `CandidateArtifactProjectionIT` 7/7; frontend `confirmedSource` 4/4 and `studioContract` 76/76. The before-landing state was not measured. **The 3027 text fix changes the document digest:** `BASE_SHA256` in `studio-runner/test/run/confinement.test.ts` must be re-anchored from `5e5477fc…070ac` to `cbacad742c634dde26a8ce2aa8c14d7bef2276de7417890272078e1b1b3f3cc8` (measured with `shasum -a 256`). **AUTHORIZED, NOT YET LANDED** for the pin. Owner: the coordinating @dev change that carries this docs edit (§19). Not run here |
| 2026-10-06 (landed 2026-09-22 in `554277fcb`) | **Story 10.44 / ADR-SC-003: structural reference policy and secret-origin binding.** This row was added retroactively to close gate finding 10.44 S-2. **Class B, ruled in ADR-SC-003 Decision 5:** (1) `referencePolicy` (new closed `ReferencePolicy` `{version: 2, steps[{stepIndex, required, allowed}]}` and `ReferencePolicySet` `{variables, secrets}`, names only) replaces `expectedIntent` on the validate request and on `RunJob`. The `ExpectedIntent`/`ExpectedOperation`/`Expected*` schemas are removed. (2) `RunJob.secretOrigins`: a map from secret id to at most 16 normalized `http(s)` origins, fail closed when absent or empty. **Ratified here, 2026-10-06:** `x-runner-error-codes` gains `URL_SCHEME_NOT_PERMITTED` and `SECRET_ORIGIN_NOT_ALLOWED`. That is within §15.6's narrowing of §14.7, because the same PR lands their only emitters (`studio-runner/src/run/errors.ts:179,181`, `executor.ts:204`, `playwrightAdapter.ts:516`) and adds no other code. No code was removed from that list, and `ExecutionErrorCode`/`x-assigned-by` did not move. `/validate-steps` was removed from the backend and frontend; it was never declared in this document, so the document did not change for it. Not ruled by this row: the other text edits committed in the same commit (`confirmCompile` deprecated, compile accepts for the requester, the execute-authorization sentence). They came from the UI-VALIDATION-20260921 work, not from 10.44, and remain an open §13 gap | B (the two fields); B within the §15.6 narrowing (the two codes) | Ruled by @architect (ADR-SC-003 §5; codes ratified here); **landed by story 10.44** | 10.44 gate (HEAD `b40be10d0`): runner unit 270/270, including `confinement.test.ts`; real-Chromium secret-origin fixtures 3/3; backend 147 tests, 0 failures. The digest was re-anchored when this landed. The before-landing state was not measured |
| 2026-10-07 (landed 2026-09-22 in `554277fcb`) | **Run auto-accept and the other UI-VALIDATION-20260921 text edits (§35).** Closes the open gap in the row above. Three description edits landed in `554277fcb` without a ruling: (1) `compileTest` (`openapi.yaml:562-565`): a validated candidate is accepted for the requesting principal and published `READY`; (2) `confirmCompile` (`:629-635`): `deprecated: true`, "no caller in the UI"; (3) `executeTest` (`:693-695`): any authenticated user may start a Studio execution, with no CSI ownership or execute entitlement. **Rulings:** (1) **ratified in intent, not as written.** Run as the confirming act is the user's DEC-OQ3 and C0-A3. The implementation is a non-conformant interim: it has no server-captured trigger, no `confirmationSource`, no deadline recheck and no capture linkage. The text must also say that the acceptance is recorded as a Run confirmation without prior review. (2) **Not ratified.** Under C0-A3 `confirm-compile` is still the manual-confirmation route. The flag must be removed, and the description must say only that the v1 UI has no caller today. (3) **Not ratified.** This loosens architecture §9.1 (`requireExecute`/`canExecute` was removed in the same commit). It is recorded as **O-22**, reserved for a user/security decision. Recommendation: restore `canExecute`. **No document edit was made by this ruling.** The fix story lands all three text changes | C (all three: status/authorization semantics on public routes) | @architect, this ruling (§35). Text edits are owed by the §35.5 fix story | Not run. No `openapi.yaml` byte changed here, so `BASE_SHA256` does not move for this row. The fix story re-anchors it when it lands the text |

The two `@dev, story 10.7` rows above are one story's amendment, recorded against §12's four
requirements (this amendment's own record is in §15.10):

- **The divergence.** `AdmissionResponse` was open by its own admission ("deliberately left open… there is no implementation to close this against yet"); `POST /internal/.../progress` answered `200` with no declared content; and three routes carried `x-not-yet-implemented` while serving traffic. §9 O-4 named the first two and assigned them to story 10.7 once the producer existed. The producer now exists.
- **The source (Article IV).** No field was invented. `startDeadlineAt` is §8.5's admitted-start deadline and `runDeadlineAt` is §5.4's runtime cap plus its bounded margins; `state` enumerates the ledger states those routes can return; `ProgressAck.applied` states the duplicate rule §5.3 already required by making a terminal report retry until acknowledged, and `revision` is the API's own snapshot revision from §8.4, explicitly not `runnerSequence`.
- **Consuming stories re-checked.** Story 10.6's runner, which is the only consumer: `admissionClient` branches on the HTTP status alone and reads a body only to name a refusal code on an error response; `reportClient` likewise branches on status and never parses an acknowledgement. Closing these two bodies therefore adds no requirement to anything that exists today, which is exactly why it could be done without an architect's ruling under O-4. Nothing runner-**produced** was touched: `RunnerReport` and its sub-schemas are byte-unchanged, as are both copies of `artifact.schema.json`.
- **Contract test before and after.** Measured on this branch by restoring the pre-amendment `openapi.yaml` and re-running. Before: `StudioContractTest` 7/8 — `everyImplementedStudioRouteIsDeclaredInTheContract` failed with `could not find … ["GET /api/v1/studio/executions/{id}/events"]`, the shipped SSE route hidden behind its own marker. After: 8/8. `ArtifactSchemaDriftTest` 3/3 both ways. `ExecutionErrorCodeContractEscalationTest` is red before and after for an unrelated Class C divergence this story escalated rather than fixed — the `ExecutionErrorCode` enum widening, still awaiting an architect and still not widened here.

---

# Amendment, 2026-09-11 (third) — what a route answers for a draft it may not act on

Added on the same branch, at `a8a8eeb44`. Story 10.8 exercised §12 exactly as §12 asks: it found a
status code the frozen document does not declare, **named the three workarounds it refused to
take**, left `CompileRouteContractDivergenceTest.compilingADeletedTestAnswersTheDeclaredStatusCode`
`@Disabled` against AC-1b, and escalated. It also made `requireCompilable` public without widening
it, which is the distinction §12's "loosening is never a story's call" rule exists to protect. Four
sibling tests establish the divergence is real rather than asserted, so this ruling is made against
verified facts rather than a report of them.

## 14. INT-6 — conflict responses for a deleted or quarantined draft (closes 10.8 AC-1b)

### 14.1 The gap, verified

| Fact | Evidence, worktree `epic/EPIC-10` at `a8a8eeb44` |
|---|---|
| `CompileStateService.requireCompilable` throws `StudioConflictException` with `TEST_DELETED` and `TEST_QUARANTINED`; `ChecksExceptionHandler` maps that exception to `409`. Both were merged by 10.4, not proposed by 10.8. | `studio/compile/CompileStateService.java`, `config/ChecksExceptionHandler.java` |
| `confirm()` calls the same guard before touching a revision row, so confirmation produces the same two codes. | same file |
| 10.8's `ReadinessVerdict` declares `TEST_DELETED` and `TEST_QUARANTINED` next to `COMPILE_REQUIRED` and `RUNTIME_INCOMPATIBLE`, and `ExecutionReadinessService`'s first term is `deleted_at IS NULL AND quarantined_at IS NULL`. | `studio/readiness/`, on `story/10.8` |
| The frozen `compileTest` declared `202`, `401`, `403` and nothing else. `confirmCompile`'s `409` named only `STALE_CANDIDATE`; `executeTest`'s named only `COMPILE_REQUIRED`, `RUNTIME_INCOMPATIBLE`, `IDEMPOTENCY_KEY_REUSED`. | `openapi.yaml` before this amendment |
| `deleted_at` and `quarantined_at` are different columns with different origins. V12 quarantines rows whose CSI is null or unregistered, "never deleted and never reassigned", under the CHECK `(csi_id IS NOT NULL OR quarantined_at IS NOT NULL)`. | `V12__ui_test_revisions_and_compile_state.sql` §3–4 |
| The two are already distinguished by every consumer that exists: `StudioRepository.findLifecycleState` returns `DELETED`, `QUARANTINED` or `ACTIVE`, and deliberately bypasses the `@SQLRestriction` so the service can tell either from "unknown". | `studio/StudioRepository.java` |

### 14.2 Ruling

**`POST /tests/{id}/compile` answers `409` for a withheld draft, with the draft's own code —
`TEST_DELETED` or `TEST_QUARANTINED` — and the two codes stay separate.** The response is declared
with `ErrorResponse` content, both examples, and an `x-conflict-codes` list. The same two codes are
added to `confirmCompile` and `executeTest`, whose `409` bodies already exist and already carry
them in code.

Nothing is invented: every code declared here is emitted by merged Java today, and the status is
the one `ChecksExceptionHandler` already returns for `StudioConflictException`. What was missing
was the declaration, not the behaviour — which is why 10.8 could not write a conforming route.

**`403` is rejected**, as 10.8 said. A withheld draft is a state of the resource, not a property of
the caller; answering `403` would tell an owner they lack a permission they hold, and the frontend
would have to un-learn it later. **`202`-then-fail is rejected**: §4.3 bounds compile attempts and
10.8's own pipeline refuses before `beginCompile` precisely so a draft nobody may compile is never
moved to `COMPILING` and then failed, and an async refusal would additionally spend a gateway call
to say no. **Widening `requireCompilable` is rejected** under §12's third rule; 10.8 was right to
leave it exactly as 10.4 wrote it.

### 14.3 Why two codes and not one, and why neither is `STALE_*`

A caller must act differently on each of the five, and the axis is *who can clear the condition*:

| Code | The draft | Cleared by | Retriable by the caller |
|---|---|---|---|
| `STALE_REVISION` | intact | the caller — reload | yes |
| `STALE_CANDIDATE` | intact | the caller — recompile, reconfirm | yes |
| `CSI_IMMUTABLE` | intact | the caller — correct the body | yes |
| `TEST_DELETED` | soft-deleted; history retained | the owner, out of band | never |
| `TEST_QUARANTINED` | **intact and not lost**; withheld | an administrator or an explicit migration | never |

The three `STALE_*`/`CSI_*` conflicts say "your copy or your body is wrong, fix it and try again".
The two lifecycle codes say "this draft is not yours to advance right now, and nothing you can send
will change that". Collapsing across that line would make a retry loop that can never terminate the
obvious client implementation.

Between the two lifecycle codes the difference is the one BRD §9 actually guarantees. A deleted
draft was withdrawn by a principal's own action, its history is retained (§8.3) and a principal can
restore it. A quarantined draft was withheld by the platform because its CSI is missing or
unregistered; V12 never deletes and never reassigns it, and it returns when the CSI is resolved.
**Reporting a quarantined draft as `TEST_DELETED` would state that an authored test was deleted,
which BRD §9 forbids** — and, concretely, would drive a UI to offer a restore action that no
principal can perform, while hiding the only remedy that exists. That is not a naming preference;
it is the wire contradicting a business guarantee. Two codes.

They are equally distinguishable from `CSI_IMMUTABLE`, with which quarantine shares a subject: that
code refuses *a change to* a CSI on a healthy draft; `TEST_QUARANTINED` reports that the CSI a
healthy draft already carries is no longer resolvable. Opposite directions, opposite remedies.

### 14.4 Ordering, and the one security consequence

**Authorization is evaluated before lifecycle.** `401` and `403` precede `409`, so a caller who may
not act on the draft's CSI never learns from a status code whether the draft exists. This is stated
on `compileTest` because the guard deliberately reads through the visibility restriction (§14.1) —
that read is what makes a `409` possible at all, and it is also what would leak existence if it ran
first. §9.1 already requires server-side permission checks on compile/confirm/execute; this fixes
their order relative to the lifecycle read.

The consequence worth stating plainly: for a quarantined row whose `csi_id` is still present but
unregistered, an authorized owner reaches `409 TEST_QUARANTINED` and is correctly told their work
survives. For a quarantined row whose `csi_id` is `NULL` — the other half of V12's CHECK — no
principal can be authorized against a CSI that is not there, so the answer is `403` and the row is
recoverable only by administrator action. That is the correct failing-closed behaviour and it is
not a gap; it is the shape of a row that has lost its only authorization anchor.

### 14.5 The sweep, and its negative results

The lead's instruction was to sweep rather than patch one route, and the sweep's negative results
matter as much as its positive ones. Every operation that can be reached with a draft id:

| Operation | Same gap? | Ruling |
|---|---|---|
| `POST /tests/{id}/compile` | **Yes — no `409` at all** | `409` declared with both codes. Also gains the `400` its authoring bounds and credential screen already produce (`SOURCE_TOO_MANY_STEPS`, `SOURCE_LINE_TOO_LONG`, `SOURCE_TOO_LARGE`, `INLINE_CREDENTIAL`, §4.3) and which nothing declared either. |
| `POST /tests/{id}/confirm-compile` | **Yes — `409` declared, codes not** | Both codes added; the guard is the same method. Also gains the `400` its `required` typed request body implies. |
| `POST /tests/{id}/execute` | **Yes — `409` declared, codes not** | Both codes added, traced to 10.8's readiness term 1. |
| `PUT /tests/{id}` | **No** | A withheld draft is invisible to this route's read, so the save resolves as an unknown test and answers `400` — indistinguishable from an id that never existed, which is the correct behaviour for a route that may not disclose existence. Declaring a lifecycle code here would declare one nothing produces. Recorded *in the document* on its `409`, so the next reader does not re-open the question. |
| `DELETE /tests/{id}` | **No** | Same visibility predicate; and §8.3 gives delete no refusal beyond it. |
| `GET /tests`, `GET /tests/{id}` | **No** | Reads. V12's rule is that quarantined rows are *hidden* from user-facing paths and *refused* on compile/confirm/execute; hiding is not a conflict. |
| `POST /tests` | **No** | No draft exists yet to be withheld. |
| `POST /v1/runs`, the two `/internal/studio/...` callbacks | **A different, later instance** | Their `409`s declare no codes either, but their producers are 10.7's and do not exist. Declaring a set now would invent one. Recorded as O-9 with a pre-ruling (§14.7) so the question does not come back as an escalation. |

### 14.6 `x-conflict-codes` — why the examples were not enough

`ErrorResponse.error` is a free string. Before this amendment, the set of codes a `409` could carry
was conveyed only by `examples`, and an example is decorative: no generator reads it, no validator
enforces it, and no test can assert it is complete. **That is §INT-4's failure mode one level down**
— a divergence no test could see — and it is why 10.8 had to read the `responses` map by hand to
prove its point.

So every public `409` now carries `x-conflict-codes`, an exhaustive list. An implementation that
answers `409` with a code outside its list, or that cannot produce one in it, is a conformance
failure that a story's own test can assert directly. This follows the `x-served-by` precedent of
§3.1: the machine-readable form of a fact that tags and examples convey only to humans.

| Option | Why not |
|---|---|
| **Examples only** (10.8's candidate amendment) | Correct as far as it goes, and the cheapest edit, but it leaves the code set unassertable — the exact property whose absence made this escalation necessary. It would have closed AC-1b and left the class open. |
| **Narrow `error` to an enum via a per-route `ConflictResponse` schema** | The strongest form, and rejected on blast radius rather than principle. It narrows a public response body that five stories and the MFE already consume, mid-wave; a code legitimately added later becomes a runtime conformance failure for an API in flight; and `ErrorResponse` is shared with `400`/`401`/`403`, whose code sets are genuinely open. An extension gets the assertability without making the contract brittle. Revisit at GA, when the sets have stopped moving. |
| **A shared `components/responses/LifecycleConflict`** | Only `compileTest` could `$ref` it: OpenAPI cannot merge a referenced response with the route-specific codes `confirmCompile` and `executeTest` must also carry. It would buy one route's brevity at the cost of expressing the same fact two different ways. |
| **Declare the codes in prose on each operation** | What `confirmCompile` and `executeTest` effectively already did. It is how the set stayed incomplete without failing anything. |

### 14.7 Pre-ruling, so the same class does not escalate twice

The lead is right that a second escalation for this class in wave 4 would be a process failure.
Under §12, populating `x-conflict-codes` on an operation is Class C. **It is hereby narrowed for
this one mechanism:** a story that writes a `409`'s producer may populate that operation's
`x-conflict-codes` directly, in its own PR with a §13 log line, provided every code it lists is
emitted by the code the same PR lands, and it lists no others. That is recording what exists, and
§12's own Class A reasoning applies — it is not a decision, and gating it blocks a wave for nothing.

Everything else stays Class C without exception: choosing the status, *removing* a code, adding a
code the PR does not produce, or extending the mechanism to any other field. Loosening remains
never a story's call.

### 14.8 What story 10.8's phase 2 must do

Contract-side this is settled. The following is the story's, and it is the whole of it:

1. **Delete the `@Disabled` annotation and the `throw new AssertionError(...)` body** of
   `compilingADeletedTestAnswersTheDeclaredStatusCode`, and write the assertion the name already
   promises: soft-delete the seeded draft, call `POST /tests/{id}/compile` as its authorized owner,
   and assert `409` with `error: TEST_DELETED`; then the quarantined case with `TEST_QUARANTINED`.
   Both codes are now declared, so a conforming implementation exists.
2. **Update `theFrozenCompileOperationDeclaresNoConflictResponse`.** Its `containsExactlyInAnyOrder("202", "401", "403")`
   is now false by design and will fail. Its premise was the divergence; the divergence is closed.
   The assertion worth keeping in its place is the one this amendment makes checkable: the set of
   codes the route can answer equals the operation's `x-conflict-codes`, read from the document.
   The sibling test asserting `confirmCompile` and `executeTest` carry `409` stays as it is.
3. **Change nothing in `requireCompilable`.** It was right. The route calls it, in the order §14.4
   fixes: authorization, then the guard, then authoring bounds and the credential screen, then
   `beginCompile`.
4. **Declare the `400` path too when the route lands.** `SOURCE_TOO_MANY_STEPS`,
   `SOURCE_LINE_TOO_LONG`, `SOURCE_TOO_LARGE` and `INLINE_CREDENTIAL` are now declared on
   `compileTest`; the route must answer `400` with those codes and with no compile state moved.
5. **Remove `x-not-yet-implemented` from `compileTest` only** when T-10.8.1 lands the route — that
   is Class A housekeeping the story already owns, and `x-implemented-by: '10.8'` stays.

This amendment changes no story's Title, Acceptance Criteria, Scope or Status. AC-1b's escalation is
closed by this section; whether the checkbox is now satisfied is @po's call, not mine.

---

# Amendment, 2026-09-11 (fourth) — the terminal error-code vocabulary

Added on the same branch, at `10bce34a7`. Story 10.7 exercised §12 as §12 asks: AC-13a needed two
terminal codes, @po ratified their names, the story implemented and persisted them, and it left
`ExecutionErrorCodeContractEscalationTest.everyCodeTheApiCanPersistIsDeclaredInTheFrozenContract`
red rather than widening a public enum itself. It was the last deliberately-red test on the
integrated branch.

## 15. INT-7 — the two ratified `ExecutionErrorCode` values, and the vocabulary they complete

### 15.1 The gap, verified

| Fact | Evidence, worktree `epic/EPIC-10` at `10bce34a7` |
|---|---|
| §5.1.3 requires the dispatcher's pre-send recheck to make "a vanished secret or revoked permission … a terminal `ERROR` with an explicit code", and names no code for either. | `studio-execution.md` §5.1, item 3 |
| The frozen `ExecutionErrorCode` enumerated six values plus `null`. All six trace to §5.4's recovery table or to §8.2. | `openapi.yaml` before this amendment |
| `StudioDispatcher` closes with `AUTHORIZATION_REVOKED` on `DispatchAuthorization.AuthorizationRevokedException` and with `REFERENCE_UNAVAILABLE` on `StudioReferenceResolver.ReferenceUnavailableException`. Both write `ui_test_executions.error_code` through `closeWithError`. | `studio/dispatch/StudioDispatcher.java:208,243,287` |
| Both are on the API side by construction: `RunnerOutcomeCodes` maps exactly one runner code into the API vocabulary — `TIMEOUT` — and returns null for every other, "including one that happens to spell an API-assigned code". | `studio/internal/RunnerOutcomeCodes.java` |
| The runner now enumerates its own ten codes, with `errorCodeFor` switching exhaustively over `RunFailureKind` so a condition without a code does not compile. | `studio-runner/src/run/errors.ts` |
| `ui_test_executions.error_code` is `VARCHAR(40)` with **no** CHECK constraint, unlike `video_status`, which V14 constrains in the adjacent statement. | `V14__studio_execution_history_v2.sql` §1 |

### 15.2 Ruling

**Both values are ratified, unrenamed, and declared.** `components.schemas.ExecutionErrorCode`
now enumerates eight values plus `null`.

Nothing is invented. §5.1.3 fixes the two conditions and fixes that each is terminal with an
explicit code; it declines only to spell the codes, which is why a name had to be chosen and why
@po ratifying them was the right instrument. What this ruling adds is the judgment §12 reserves to
an architect: that the two conditions are genuinely two, that neither collapses into the six
already declared, and that the names chosen say what was observed rather than what followed from
it.

The amendment also declares the vocabulary's **assigners** (`x-assigned-by`) and the runner's own
set (`x-runner-error-codes`), for the reason §15.6 gives.

### 15.3 Why two, and why neither collapses into the six

The test is §14.3's and it has not moved: a caller must be able to act differently on each, and the
axis is *who can clear the condition*. Applied to the whole vocabulary, it also answers what a
caller may conclude about the browser — which for this enum is the more consequential half, because
a caller that guesses wrong about whether a browser ran can double-execute a test against a real
environment.

| Code | Browser | Who can clear it |
|---|---|---|
| `DISPATCH_DISABLED` | never started | an operator, platform-wide. Every queued row is closed alike; nothing about *this* execution is wrong |
| `AUTHORIZATION_REVOKED` | never started | whoever restores **the principal's** entitlement. Another principal would succeed on the same draft |
| `REFERENCE_UNAVAILABLE` | never started | whoever restores **the reference**, or the author correcting the draft. The same principal would fail again on the same draft |
| `DISPATCH_FAILED` | definitely not started | the caller, by running again |
| `DISPATCH_UNKNOWN` | **unknown** | nobody, until investigation resolves it. §5.1 forbids resending browser work on an ambiguous outcome |
| `START_TIMEOUT` | admitted; start never confirmed | the caller, by running again |
| `STALE` | started | the caller, by running again |
| `TIMEOUT` | started, then killed | a shorter test or a higher cap |

The two new codes are the only pair in the table that share a row of the browser column *and* differ
on the clearing column, which is precisely why they must be two and not one:
`AUTHORIZATION_REVOKED` is a fact about the **principal**, `REFERENCE_UNAVAILABLE` a fact about the
**draft and its environment**. Collapsing them would tell an author to chase an entitlement they
already hold, or tell a platform team to re-provision a secret that never moved. The remedies do not
merely differ; they point at different people.

Against the six, the decisive line is **the send never happened**. `DISPATCH_FAILED` says a send was
definitely refused; `DISPATCH_UNKNOWN` says a send may have landed. Both new codes describe the
dispatcher refusing *before* `beginDispatch`, so no attempt was even recorded — a strictly stronger
guarantee than `DISPATCH_FAILED`, and one a UI should state plainly rather than dilute.
`DISPATCH_DISABLED` shares "never started" but differs in blast radius: it is a banner, not a
per-execution error. `START_TIMEOUT`, `STALE` and `TIMEOUT` are all post-admission and reaper- or
report-assigned; neither new code can coexist with an admission.

### 15.4 The names, and the ones rejected

| Candidate | Verdict |
|---|---|
| `AUTHORIZATION_REVOKED` | **Ratified.** §5.1.3's own word is "revoked", and the word carries the fact that matters: the permission *was* held — §5.1.1 checked it at acceptance — and was lost between acceptance and dispatch. That is what tells an author this is not a mis-request. |
| `PERMISSION_REVOKED` | Rejected. Equivalent in meaning; `AUTHORIZATION_REVOKED` matches the method that raises it (`DispatchAuthorization.recheck`) and the architecture's own noun ("execution/secret authorization"). No reason to prefer a synonym over the source's word. |
| `UNAUTHORIZED` / `FORBIDDEN` | Rejected, and the same error §14.2 rejected `403` for. These are the vocabulary of a request-time authorization verdict, and they say the caller never had the right. This code exists because the caller did. |
| `REFERENCE_UNAVAILABLE` | **Ratified.** The contract's noun for the thing is *reference*: §5.1.1 preflights "variable/secret references" and §8.4's job envelope carries declared reference **names**. The code must span both kinds, because `StudioReferenceResolver.ReferenceUnavailableException` does. |
| `SECRET_UNAVAILABLE` / `SECRET_VANISHED` | Rejected. Narrower than the condition. A vanished non-secret variable raises the identical exception and would then carry a code that names a secret — a wire statement that is false, and the kind that sends an investigator to the vault for a problem that is not there. |
| `DISPATCH_FAILED` for both | Rejected, and this is the trap the story avoided. It says the send failed; the send never happened. It is also already the code for a definite refusal *after* an attempt, so reusing it would erase the one distinction §5.1 asks a client to respect. |
| One shared code for both conditions | Rejected under §15.3. §5.1.3's sentence conjoins two conditions and demands "an explicit code"; reading that as one code for two conditions is grammatically available and substantively wrong, because the remedies point at different people. |

On `UNAVAILABLE` also appearing in `VideoStatus` and `RunnerEvidence.state`: §6.1 warned that a bare
value meaning two things in one report is a misread waiting to happen, and that warning was about
bare `FAILED` in two fields. The qualifier is what makes this safe — `REFERENCE_UNAVAILABLE` is
never confusable with `video.status: UNAVAILABLE` because neither is bare and neither is on the
other's field. Recorded so the precedent is not read as broader than it is.

### 15.5 The sweep, and its negative results

The instruction was to make the test's name true in both directions, not to add two values. Every
path that writes `ui_test_executions.error_code`:

| Writer | Codes it can write | Source |
|---|---|---|
| `StudioDispatcher.close` / `closeUndispatchedWork` | `DISPATCH_DISABLED`, `DISPATCH_FAILED`, `AUTHORIZATION_REVOKED`, `REFERENCE_UNAVAILABLE` | §5.1.3, §5.4 |
| `PendingReaper` | `DISPATCH_FAILED`, `DISPATCH_UNKNOWN` | §5.4, row 2 |
| `RunningReaper` | `START_TIMEOUT`, `STALE` | §5.4, rows 3–4 |
| `RunnerReportProjection` via `RunnerOutcomeCodes.errorCodeFor` | `TIMEOUT`, or null | §8.2 |
| `FinalizationReconciler.applyReconciledOutcome` | a literal `null` — a manifest-supplied runner code is recorded, never copied | §5.3, AC-16 |

**Eight values, no ninth.** Every other statement that touches the history row omits `error_code`
from its `SET` list by design. **And no orphans in the other direction**: each of the six original
values has a live producer above, so the contract declares nothing the API cannot produce. The
test's name is true both ways as of this amendment.

Two asymmetries the sweep found that the test's name does not cover, and that are therefore recorded
rather than fixed here:

- **The read path enforces nothing.** `ExecutionSnapshotMapper` projects `errorCode` through
  `LegacyStudioAdapter.normalizeErrorCode`, which returns the persisted column verbatim for every
  status but a legacy `TIMEOUT` with a null code. So the API *publishes* whatever the column holds,
  and the column has no CHECK — unlike `video_status`, constrained in the adjacent V14 statement. No
  row can hold a ninth value today: V14 creates the column, so it is null everywhere at that point
  and the one backfill writes `'TIMEOUT'`. But a restored dump or a manual repair could, and the
  public enum would then be contradicted by a body the API itself served. **O-11.**
- **A consumer holds a second, now-narrower copy.** `frontend/src/types/studio/studioTypes.ts`
  declares `ExecutionErrorCode` as a six-member union, hand-maintained against this document. It is
  not a runtime failure — the field arrives as a JSON string and the union is erased — and no
  exhaustive `switch` over it exists today, so nothing breaks. It does mean the MFE cannot narrow on
  the two new codes, and that an exhaustive `switch` written tomorrow would be wrong. **O-12.**
  Frontend source is out of this ADR's scope by construction.

### 15.6 The `x-conflict-codes` analogue — `x-assigned-by`, and `x-runner-error-codes`

The lead's question was whether §14's mechanism has an analogue here. It does, but not the obvious
one, and the difference is worth stating because it is what the escalation actually turned on.

`x-conflict-codes` exists because `ErrorResponse.error` is a free string: the *list* was missing.
`ExecutionErrorCode` is already an enum, so the list was never missing — **the missing fact was who
fills it.** That is exactly what could not be checked: story 10.7 added two values to the API's
vocabulary, and the document had no way to say, let alone test, that both were API-assigned and
neither reachable from a runner. The escalation test had to assert that half against
`ExecutionErrorCode.reaperAssigned()` — a second hand-maintained set in Java, which is the same
shape of hazard as an example.

So two extensions, following §3.1's `x-served-by` precedent:

- **`x-assigned-by` on `ExecutionErrorCode`**, a per-code list of the components that assign it.
  Per-code rather than a partition, because `DISPATCH_FAILED` is genuinely written by two components
  and a partition would have forced a false choice.
- **`x-runner-error-codes` on `RunOutcome.errorCode`**, the exhaustive set the pinned runner image
  can emit. The field's `type` stays an open string — §6.1's ruling that the runner owns that
  vocabulary is unchanged, and it is still the one place this contract chooses openness. What
  changes is that the openness is no longer *undeclared*.

Four properties are now assertable from this one document, each of which was previously either prose
or a second copy:

1. the keys of `x-assigned-by` are exactly the non-null members of `enum` — no code without an
   assigner, no assigner without a code, and therefore no silent widening;
2. no assigner is the runner;
3. `x-runner-error-codes ∩ ExecutionErrorCode.enum = {TIMEOUT}` — §8.2's single intersection,
   readable by both sides from the same place rather than from a Java set and a TypeScript object
   that happen to agree;
4. the Java vocabulary equals the document's `enum`, which is the escalation test itself.

Property 3 deserves the emphasis: it was asserted in `RunnerOutcomeCodes` and in
`studio-runner/src/run/errors.ts` independently, in two languages, with no shared source. That is
the arrangement that produced INT-4.

**§14.7's narrowing extends to `x-runner-error-codes` and to nothing else.** A story that lands a
new runner failure condition may add its code to that list in the same PR, with a §13 log line,
provided the code is emitted by the code the PR lands and it adds no others — `errorCodeFor`'s
exhaustive switch already makes that provable at compile time. Removing a code, adding one the PR
does not emit, and every edit to `x-assigned-by` or to the `ExecutionErrorCode` enum itself remain
Class C without exception. The API's terminal vocabulary is a public enum and §12's third rule binds
it: loosening is never a story's call.

### 15.7 Alternatives rejected

| Option | Why not |
|---|---|
| **Reject both and require `DISPATCH_FAILED`** | Would make the contract state that a send failed where no send occurred, and would erase the distinction §5.1 asks clients to respect. It also would not have removed the decision — it would have hidden it in a code whose meaning quietly widened. |
| **Ratify one shared code (`PREFLIGHT_FAILED`, `DISPATCH_REFUSED`)** | Fails §14.3's test: the two remedies are owned by different people. A single code makes "who do I call" unanswerable from the snapshot, which is the one question a terminal error has to answer. |
| **Leave the enum at six and narrow the Java vocabulary instead** | Inverts the authority §12 establishes. The behaviour traces to §5.1.3; the contract was silent, not contradicted. Narrowing working code to fit an incomplete document is the manoeuvre §12's "the freeze is not evidence of correctness" paragraph exists to forbid. |
| **Open `ExecutionErrorCode` to a free string, as `RunOutcome.errorCode` is** | The exact move §12's third rule names: loosening to admit what a producer happens to send, whose only effect is to stop a test telling the truth. The API's vocabulary is closed *because* it is the API's own — §6.1's openness is justified by the runner being a different component with conditions the API cannot enumerate, and none of that applies here. |
| **Declare the two codes only on the routes that can return them** | They are not conflict codes on a request; they are terminal states on a published snapshot, reachable from `GET /executions/{id}` and from the SSE stream alike. The enum is the right home and `x-assigned-by` carries the per-component fact a per-route declaration would have approximated. |
| **Add `x-assigned-by` as a partition (`dispatcher` / `reaper` lists)** | `DISPATCH_FAILED` is written by both the dispatcher and the pending reaper. A partition would have had to drop one, and the dropped one would have been the fact a reader most needed. |

### 15.8 What turns the escalation test green

**The amendment alone.** `ExecutionErrorCodeContractEscalationTest` is green with no change to
itself and no change to any Java file, which is what it predicted: 2/2 after the edit, 1/2 before.
No production code moves, because the behaviour was already merged and only its declaration was
missing.

For whoever picks this up — none of it is required to make the test pass, and none of it is mine to
land:

1. **The class's own documentation is now false.** Its Javadoc opens "DELIBERATELY RED", and both it
   and `ExecutionErrorCode`'s Javadoc refer to a class named `ExecutionErrorCodeContractTest` that
   does not exist. Rewording them — and dropping `Escalation` from the class name, since the
   escalation is closed and the assertion is a permanent conformance gate worth keeping — is
   housekeeping for the owning story, not an architecture decision.
2. **Add the assertions §15.6 made possible**, if the owning story wants them: keys of
   `x-assigned-by` against the enum, no runner among the assigners, and the `{TIMEOUT}` intersection
   read from `x-runner-error-codes` rather than from a second copy. Each is a few lines and each
   closes a gap that is currently guarded by a hand-maintained duplicate.
3. **O-11 and O-12** below.

### 15.9 Open items, after waves 1–3

Checked against the merged branch rather than against the last amendment's notes:

| Item | Status at `10bce34a7` |
|---|---|
| **O-3** | **Closed.** `StudioContractTest` no longer contains `internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface`; `internalRoutesStayOffThePublicSurfaceAndNameWhatServesThem` replaced it and asserts what §8.6 said the corrected assertion should be. 9/9 on this branch. |
| **O-5** | **Closed in substance.** The placeholders are gone: `studio-runner/src/run/errors.ts` enumerates ten codes, each traced to an observable condition, with an exhaustive switch over `RunFailureKind` that makes an unnamed condition a compile error. This amendment declares that set in the contract, which is the part O-5 left undone. `TIMEOUT` remains reserved for 10.13's enforcement. |
| **O-6** | **Still open, and re-pointed.** 10.7 has landed and `RunJob` carries only declared reference names; destination policy is still unresolved and is now solely 10.18's (SPK-05). The contract continues to declare only what exists. |
| **O-8** | **Landed in the runner.** `executeSteps` requires an explicit run clock and refuses at both type and run time; `runCoordinator` carries the run-scoped origin; `test/server/timeline.test.ts` asserts the scale *and* carries the negative control §11.6.4 asked for — the same run with a process-origin clock, which must go red. The staging measurement of §11.6.3 has a fixtures-tier home (`test/fixtures-tier/seek-measurement.test.ts`); whether it has been run against staging is the story owner's to confirm, not mine. |
| **O-9** | **Still open, and now landable.** Its condition has changed: the producer exists. `AdmissionCasService` conflicts on `EXECUTION_UNKNOWN`, `EXECUTION_SETTLED`, `ATTEMPT_SUPERSEDED`, `ADMISSION_OWNED`, `ADMISSION_EXPIRED`, `TRANSITION_REJECTED`; `ProgressReportService` on the same set less `ADMISSION_EXPIRED` and plus `SEQUENCE_REGRESSED`. §14.7's pre-ruling stands and 10.7 did not use it, so the next story to touch those routes may land both lists directly with a §13 line — the runner's `POST /v1/runs` refusal propagates the admission code, so the two close together. **Deliberately not landed here:** these are transport refusals on the internal surface, disjoint from `ExecutionErrorCode` by design (`InternalCallbackCodes`), and bundling them would make this amendment's before/after measurement ambiguous about which change did what. |
| **O-10** | **Untouched and still open.** `400` versus `404` for an unknown, deleted or quarantined draft on `GET`/`PUT`/`DELETE /tests/{id}` is a public-surface status decision with no relation to the terminal error vocabulary; §14.5 already recorded the reasoning in the document itself. It remains a decision to raise on its own before the pilot. |
| **O-11** *(new)* | `ui_test_executions.error_code` has no CHECK constraint, so the enum is enforced on the write path by convention and on the read path by nothing. The fix is the constraint `video_status` already has in V14 §1, widened as this enum is. Owner: whoever owns the next Studio migration. Not urgent — no row can hold a ninth value today (§15.5) — and not landable here, since a migration is neither a contract nor mine. |
| **O-12** *(new)* | `frontend/src/types/studio/studioTypes.ts` declares a six-member `ExecutionErrorCode` union that is now narrower than the contract. No runtime effect and no exhaustive switch exists today. Owner: the MFE story that next consumes `errorCode`. Better than widening it by hand would be generating it, or a frontend test that reads the enum from this document — `studioContract.test.ts` already reads the document and is the natural home. |

### 15.10 Recorded against §12's four requirements

- **The divergence.** `ExecutionErrorCode` enumerated six values; the API persists eight.
  `AUTHORIZATION_REVOKED` and `REFERENCE_UNAVAILABLE` are written by `StudioDispatcher` and surfaced
  on the public `ExecutionSnapshot.errorCode`, so the contract was silent about two values a
  consumer can receive today. Separately, `RunOutcome.errorCode`'s set was undeclared in a document
  whose own §6.1 asserts it intersects the API's at exactly one value.
- **The source (Article IV).** Nothing invented. The two conditions and their terminality are
  §5.1.3; the six originals are §5.4's table and §8.2; the per-code assigners are §5.1.3 (dispatcher),
  §5.4 (both reapers) and §8.2/§5.3 (the report projection); the runner's ten codes are read from
  `studio-runner/src/run/errors.ts`, which is merged and compiles its own exhaustiveness. The names
  were ratified by @po on 2026-09-11 against a §5.1.3 that fixes the conditions and declines to name
  them; this ruling judges them, it does not originate them.
- **Consuming stories re-checked.** **10.7** — its dispatcher already emits both codes; no change,
  and its contract test class needs no edit. **10.12 / 10.13** — the `{TIMEOUT}` intersection is
  intact and is now checkable from the document; neither new code is reachable from a runner, and
  `x-runner-error-codes` matches `RUNNER_ERROR_CODES` exactly as merged. **10.6** — no
  runner-produced body was touched; `RunOutcome` gained an extension key and no field, stays closed,
  and the runner's validator ignores unknown keywords. **10.14** — evidence untouched. **10.8** —
  no `409`, no `x-conflict-codes` and no operation was touched. Both copies of
  `artifact.schema.json` are byte-unchanged. The MFE is the one consumer that needs work, recorded
  as O-12.
- **Contract test before and after.** On this branch, before the amendment:
  `ExecutionErrorCodeContractEscalationTest` 1/2 — `everyCodeTheApiCanPersistIsDeclaredInTheFrozenContract`
  failed naming both missing codes; `StudioContractTest` 9/9; `ArtifactSchemaDriftTest` 3/3;
  `studio-runner` `test/contract.test.ts` 14/14. After: **2/2**, 9/9, 3/3 and 14/14 respectively.
  The frontend's `studioContract.test.ts` could **not** be executed — `frontend/node_modules` is not
  installed in this worktree — so its result is reasoned, not measured: its Ajv instance is
  constructed `strict: false`, so the two `x-` keywords are ignored, and widening an `enum` only
  admits values, so no fixture that validated before can fail now. Whoever next runs the frontend
  suite should confirm it.

This amendment changes no story's Title, Acceptance Criteria, Scope or Status, and touches no
backend Java, no frontend source, no `studio-runner/` source and no story file.

---

# Amendment, 2026-09-11 (fifth) — where a user reads the compiler, and what a partial recording is

Added on the same branch, at `6cc14f220`, the merge of the two wave-4 drafts. Both drafts used §12
rather than inventing, and each found a different half of the same class of defect.

Story **10.9** produces a compile error and bounded per-step diagnostics and found that **no
declared route returns either**, so the repair loop can generate reasons and nothing can show them;
it left a named disabled test and escalated (AC-22, Class C). Story **10.13** found that
**`VideoEvidence.partial` is `required` on the public snapshot and nothing on the runner wire can
set it**, and escalated rather than adding a field to a closed runner body (AC-18, Class B).

The two are the same defect seen from opposite ends: §6.2's lesson was that a body may declare
fields no producer sends, and §14.6's was that a `409` may declare a status no code answers. This
pair adds the third and fourth forms — **a fact produced and persisted that no surface exposes**,
and **a field declared and required that no producer fills** — and, in the second case, one worse
thing that the escalation did not yet know: the field is not unpopulated, it is **falsely
populated**.

## 16. INT-8 — the diagnostics surface (closes 10.9 AC-22; unblocks 10.10)

### 16.1 The gap, verified

| Fact | Evidence, worktree `epic/EPIC-10` at `6cc14f220` |
|---|---|
| `ui_tests.compile_error` and `ui_tests.compile_diagnostics` are `jsonb` columns, added by V12 §3 against §8.1. | `V12__ui_test_revisions_and_compile_state.sql:102-103` |
| `publishInvalid` writes `compile_diagnostics` and clears `compile_error`; `publishError` writes `compile_error` and clears `compile_diagnostics`; `beginCompile`, `publishCandidate` and `confirm` clear both. At most one is ever non-null. | `CompileStateService.java:85,125,161,197,273` |
| Every one of those statements additionally conditions on `compile_request_id`, `source_revision` **and** `configuration_revision`; a publish whose draft moved underneath it writes nothing and returns `DISCARDED_OUT_OF_ORDER`. | same file |
| `StudioService.save` clears **both** columns whenever it records a source or configuration change, in the same transaction that advances the revision and sets `STALE`. | `StudioService.java:266-273` |
| `compile_error` is `{"code": "<CODE>"}` and nothing else — "the bounded, scrubbed code and nothing else: no prompt, no response body, no source text". | `CompilePipeline.java:334-339` |
| The code set reachable there is exactly `CompileErrorCode`'s four plus `GatewayErrorCode`'s seven — eleven values, from six call sites. | `CompilePipeline.java:133,137,197,205,222,254` |
| `DiagnosticsBounder.bound` produces one entry per **original** step, index aligned, with explicit truncation at three levels: a clamped `message`/`excerpt` carries a marker, a step that lost diagnostics carries `truncated: true`, and a document that shed steps to fit the byte cap carries a document-level `truncated: true` with a `truncationReason`. | `DiagnosticsBounder.java` |
| `TestDto` declared twenty properties. `compileError` and `compileDiagnostics` were not among them, and `UITestDto` matched it field for field. | `openapi.yaml` before this amendment; `UITestDto.java` |
| The `compileTest` operation's own description already told a reader that gateway failure surfaces "as `compileStatus: STALE` carrying `compileError`" — a field the document then declared nowhere. | `openapi.yaml` before this amendment |
| **No test could have failed on this.** `StudioContractTest.theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames` asserts nine schemas against nine Java records, and `TestDto` is not one of them. | `StudioContractTest.java:187-197` |

The last row is the one worth pausing on. This is §INT-4's failure mode a second time and in the
opposite direction: there, three field names disagreed and the checker said "conforms" because the
schema was open; here, two persisted facts had no declared field at all and the checker said
nothing because `TestDto` is not in the list it checks. A conformance gate is only as wide as its
enumeration.

### 16.2 Ruling

**The reasons are read from the draft, on the representation that already carries every other
compile-state fact. `TestDto` gains two nullable, additive fields — `compileError` and
`compileDiagnostics` — and no route is added.**

Both are declared as typed schemas rather than as free-form objects, from what the merged producer
writes: `CompileError` (`code`, with the eleven-value set in `x-compile-error-codes`),
`CompileDiagnostic`, `CompileStepDiagnostics` and `CompileDiagnostics` (`validatorSchemaVersion`,
`artifact`, `steps`, `truncated`, `truncationReason`, `attempts`, `exhausted`). `TestDto` gains a
description stating the mutual exclusion and the alignment invariant of §16.3. `attempts` and
`exhausted` are the two keys story 10.9's AC-11 requires and does not name; naming them here is
what stops two components guessing at each other, and it is the judgment §12 reserves to an
architect rather than a decision the story could take alone.

Nothing is invented. §4.7 requires that "unsupported or ambiguous instructions receive actionable
diagnostics" and that exhausted repair yields `NEEDS_REVISION`; §4.4 fixes index alignment, one
entry per source line; §4.3 bounds repair at two attempts; §8.5 makes the caps deployment
configuration; BRD §6 requires that invalid translation "blocks only that candidate **with a
plain-language reason**". A reason a user cannot read is not a reason. What was missing was the
declaration, not the behaviour — which is exactly why 10.9 could persist a document nobody could
fetch.

### 16.3 Per draft, not per revision — and never stale against the draft it arrives with

The question the draft raised is real: revisions are immutable and drafts are not, so the safer
instinct is to hang diagnostics on the immutable thing. That instinct is wrong here, for a reason
that is structural rather than stylistic.

**The compile these diagnostics describe produced no revision.** `publishInvalid` writes no
`ui_test_revisions` row and clears the current candidate; only a *valid* candidate is ever written
as a revision (§4.2, §8.1). Hanging diagnostics on a revision would therefore require inventing a
revision for an artifact the author must never be able to confirm — which is the one thing the
whole confirmation mechanism exists to prevent. The same holds for `compile_error`: a compile that
never reached the validator has no artifact at all.

And the staleness the instinct is protecting against does not exist, because the merged code
already closes it in both directions. A publish only lands while the draft's `source_revision` and
`configuration_revision` are still the ones the compile was started for; any save that moves either
clears both columns in the same transaction. So a stored diagnostics document always describes the
draft's current source. The response makes that checkable rather than merely true: `steps`,
`sourceRevision`, `configurationRevision`, `compileStatus` and `compileDiagnostics` are read from
one row in one transaction and travel in one body, so a client aligning `steps[i]` to
`compileDiagnostics.steps[i]` is aligning two facts that were read together. There is no window in
which a client can hold a diagnostics document that outranks or lags the source next to it, and
therefore no need for a `sourceRevision` on the document — a field which, had it been added, would
have been a second representation of a fact already in the body (§10, §11.5).

### 16.4 The codes, and why `code` stays a string

`compile_error.code` is declared as a free string with the exhaustive set in
`x-compile-error-codes`, exactly as §14.6 declared `x-conflict-codes` and §15.6 declared
`x-runner-error-codes`, and for the same two reasons: an example is not assertable, and narrowing a
public response field to an enum mid-wave makes a legitimate later code a runtime conformance
failure for an API in flight.

**§14.7's narrowing extends to `x-compile-error-codes`, and to nothing else new.** A story that
lands a new compile failure condition may add its code to that list in its own PR with a §13 log
line, provided the code is emitted by the code the same PR lands and it adds no others — both
`CompileErrorCode` and `GatewayErrorCode` are Java enums, so that is provable by reading the PR.
Removing a code, adding one the PR does not emit, and every other edit to these schemas remain
Class C.

Story 10.9 adds no code: every bounded refusal it introduces on the repair path — a budget expiry
mid-loop, a `GATEWAY_BUSY` on a repair call, a transport failure — is one of the eleven already
declared. If an implementation finds it needs a twelfth, that is a signal that the bound it is
reporting was not in §4.3, not a licence to extend the list quietly.

### 16.5 Truncation, and the one place the projection diverges

A truncated diagnostic that looks complete is a worse artefact than no diagnostic, because it moves
the author's attention to the wrong step and leaves them believing they have seen everything. The
bounder already refuses to be silent about it at three levels, so the declaration carries all
three: the marker on a clamped `message` or `excerpt`, `truncated` per step, and `truncated` plus
`truncationReason` on the document. The schema says in as many words that a client which renders
this document without rendering those flags turns a bounded report into a false one — which is a
requirement on 10.10, not decoration.

The caps themselves are **not** frozen as `maxLength`. They are `studio.compile.diagnostics.*`
configuration and §8.5 asks for one configuration source; a `maxLength: 400` in the contract would
be a second one, and the first to go stale.

One deliberate divergence in the projection, stated in the document rather than discovered:
**`compileDiagnostics` is always null on `GET /tests`.** The bound is per draft, so a page of
drafts in `NEEDS_REVISION` would be a multi-megabyte response carrying per-step reasons no list
renders. The alternative — capping the page size of an unrelated route as a function of one field's
worst case — is worse. Nothing a caller needs in order to *know* reasons exist is hidden: the list
carries `compileStatus` and the bounded `compileError`; only the reasons themselves are one read
away. This is the one field of `TestDto` whose fill depends on the route, and that is precisely why
it is declared on the operation and on the field rather than left as an implementation habit.

### 16.6 Authorization — the first surface to carry compiler output

This is the first public response to carry anything the compiler produced, so the question is
asked rather than assumed: **it needs no new gate, and it gets none.**

The fields ride on `GET /tests/{id}`, whose CSI-scoped read authorization §9.1 already fixes and
10.4 already implements, and they disclose strictly less than the response they travel in. The
diagnostics are derived from the draft's own source lines, which the same body returns verbatim in
`steps`; an `excerpt` is a bounded fragment of the offending node, never the whole step, and passes
through redaction first (§9.2). The compile path resolves no variable and no secret at all — §9.2,
and story 10.8's canary test asserts it on the bytes — so there is no resolved value in the
document to protect. Withholding *why* a draft failed to compile from a principal who is already
being shown *what* it says would disclose nothing extra and help nobody.

Owner-level permission stays where §9.1 puts it: on compile, confirm and execute, which are writes.
A reader of the CSI may read the reasons; only an owner may act on them. And the refusal ordering
of §14.4 is unchanged — this is a read, and a caller who may not read the draft never reaches its
diagnostics because they never reach the draft.

### 16.7 Alternatives rejected

| Option | Why not |
|---|---|
| **A new `GET /tests/{id}/compile-diagnostics` route** (10.9's first named non-option) | The largest Class C change available for the smallest need: a new public operation with its own authorization, its own `409` surface, its own paging question and its own `x-not-yet-implemented` bookkeeping — to return one column of a row the client has just read. It also breaks a test this wave depends on; see §16.8. |
| **Returning diagnostics in `confirm-compile`'s `409` body** | The diagnostics belong to `NEEDS_REVISION`, which that route refuses *before* it would have them, and an error body is not a read API. `ErrorResponse` is shared with `400`/`401`/`403` and narrowing it was already rejected in §14.6. |
| **Shipping the field on `UITestDto` without declaring it** | INT-4's failure mode exactly, and invisible to every conformance check — the more so here, since §16.1 shows `TestDto` is not even in the list of schemas checked against their Java records. |
| **Hanging the diagnostics on a revision** | The compile they describe produced no revision, and inventing one for an unconfirmable artifact would corrupt the one mechanism that makes AI-translated tests acceptable to run (§16.3). |
| **A second draft schema (`TestDetailDto`) so the list keeps the small shape** | Two shapes for one resource, which is the drift §INT-4 settles, and it changes the `200` of four operations. The divergence is one field wide; a documented null is the smaller truth. |
| **`compileDiagnostics` as a free-form `object`** | An open schema over a body is a suggestion written in YAML (§6.2). It would also leave the truncation flags — the whole point — undiscoverable by a generator, which is how a client comes to render a bounded report as a complete one. |
| **Declaring `code` as an `enum`** | Rejected on the same blast-radius ground as §14.6: a public response field consumed by the MFE, narrowed mid-wave, makes a legitimate twelfth code a runtime conformance failure. The extension gets assertability without brittleness. |
| **Adding `sourceRevision` to the diagnostics document so a client can detect staleness** | Two representations of one fact in one body. The staleness it guards against cannot occur: the fields are read in one transaction with the `sourceRevision` beside them, and any save clears them (§16.3). |

### 16.8 The marker assertion, and why no route was added

`StudioContractTest.theCompileRouteIsShippedAndTheMarkerCameOffForThatOperationOnly` asserts that
`pendingOperations()` is **exactly** the set of operations still flagged `x-not-yet-implemented`,
and story 10.9 AC-2 updates that set to `GET /executions/{id}/video` alone when it lands
`confirm-compile`. A new diagnostics route would have had to carry a marker of its own — it has no
producer in 10.9 and its consumer is a wave-5 frontend story — and the assertion 10.9 is required
to write would have been false on the day it was written, in a story that may not edit its own
acceptance criteria to accommodate an architect's ruling.

**This amendment moves no marker and adds no operation**, so that assertion stays satisfiable
exactly as AC-2 states it: after 10.9, one pending operation, `GET /executions/{id}/video`, owned
by 10.16. That is not a happy accident of the chosen shape; it is one of the reasons the shape was
chosen. A ruling that forces a story to break a gate it was written to satisfy has moved the cost
rather than paid it.

### 16.9 What story 10.9 must do, and what 10.10 may rely on

Contract-side this is settled. AC-22 already provides for both outcomes — "**if @architect rules
before wave 4 closes, the exposure lands in the same PR**" — and this ruling is made before wave 4
closes, so the first branch applies and the criterion needs no edit. The story's:

1. **Add the two components to `UITestDto` and map them from the entity**, deserializing the two
   `jsonb` columns into the declared shapes. This is additive: every existing field keeps its name,
   its type and its position, and no other response body moves.
2. **Emit `attempts` and `exhausted`** on the document `DiagnosticsBounder` builds, under those
   names. AC-11 already requires both facts; this fixes the two keys so 10.10 is not guessing.
3. **Null `compileDiagnostics` on the list projection** (§16.5), and assert it — one test that a
   draft with a stored document returns it from `GET /tests/{id}` and not from `GET /tests`.
4. **Add `TestDto` to `theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames`**, so the gap §16.1's
   last row describes cannot reopen silently. This is the assertion whose absence let two persisted
   facts go undeclared for four waves, and it costs one line.
5. **Turn `DiagnosticsExposureEscalationTest` from a named disabled test into a live one.** Its
   subject is no longer a missing field; it is the round trip — a compile that fails leaves a
   document a caller can read, with its truncation flags intact.
6. **Claim nothing about semantics.** AC-15a's honesty assertion covers the new field descriptions
   too: nothing on this surface may state or imply that a step the validator accepted does what its
   author meant (§4.1, §4.5, BRD §6).

**Task T-10.9.9's "No edit to `TestDto` or `UITestDto`" is superseded by this ruling** and by
AC-22's own first branch. §12 binds an architect not to edit a story's Title, Acceptance Criteria,
Scope or Status; a task line is the story owner's to apply, and it is named here so the conflict is
resolved deliberately rather than noticed in review.

**Story 10.10 is unblocked.** It may rely on: both fields on the single-draft read; one diagnostics
entry per original step, index aligned to the `steps` in the same body; the truncation flags at all
three levels; `attempts` and `exhausted` for telling an author that repair happened and stopped;
the eleven-value `compileError` code set for the failure cases that are not the author's fault; and
the guarantee that what it renders describes the source it is rendering beside. What it may not do
is render the document without its truncation flags, or describe a validated step as a correct one.

### 16.10 Recorded against §12's four requirements

- **The divergence.** Story 10.9 persists `compile_error` and `compile_diagnostics` through merged,
  conditional, bounded code, and no declared response body carried either — while the `compileTest`
  operation's own description referred a reader to `compileError` by name. Story 10.10 depends on
  10.9 precisely to render those reasons and had no field to read. No test could have caught it:
  `TestDto` is not among the nine schemas `StudioContractTest` checks against their Java records.
- **The source (Article IV).** Nothing invented. The diagnostics and their actionability are §4.7;
  index alignment, one entry per source line, is §4.4; the repair bound that `attempts` and
  `exhausted` report is §4.3; the caps are §8.5 configuration and are deliberately not frozen as
  `maxLength`; the public surface and its CSI scoping are §8.3 and §9.1; the plain-language reason
  a blocked candidate owes its author is BRD §6. The eleven codes and the document's four levels of
  structure are read from merged Java — `CompileErrorCode`, `GatewayErrorCode` and
  `DiagnosticsBounder` — not chosen here. The two names this ruling does choose, `attempts` and
  `exhausted`, name facts §4.3 and §4.7 already fix.
- **Consuming stories re-checked.** **10.9** — gains the exposure under AC-22's own first branch;
  no criterion is edited, and §16.9 lists the work. **10.10** — unblocked; its dependency is now
  satisfiable. **10.11** — consumes `ExecutionErrorCode`, untouched here; see §18.3. **10.8** —
  merged, and none of its guards, bounds or statements are changed; `DiagnosticsBounder`'s caps and
  `CompileStateService`'s statements are declared, not altered. **10.6 / 10.7 / 10.12 / 10.13 /
  10.14** — no runner-produced body, no internal route and no callback is touched by §16. The MFE
  validates its fixtures against `TestDto` with Ajv and the two fields are optional, so no fixture
  that validated before can fail now — measured, not reasoned; see §18.5. Both copies of
  `artifact.schema.json` are byte-unchanged.
- **Contract test before and after.** Measured on this branch. Before: `StudioContractTest` 9/9,
  `ArtifactSchemaDriftTest` 3/3, `CompileRouteContractDivergenceTest` 9/9, `studio-runner`
  `test/contract.test.ts` 14/14, frontend `npx vitest run` 98 passed with one unrelated suite
  failing to resolve `@put/core-components`. After: identical. §16 adds only optional fields and
  new component schemas, and both `getTest` examples were validated against the amended `TestDto`
  with Ajv before the run.

## 17. INT-9 — what `VideoEvidence.partial` means and who sets it (closes 10.13 AC-18)

### 17.1 The gap, verified — and it is worse than "no producer"

| Fact | Evidence, worktree `epic/EPIC-10` at `6cc14f220` |
|---|---|
| `VideoEvidence` requires `[status, partial]`; `partial` is documented "True when an available recording covers only part of the run". | `openapi.yaml` |
| `RunnerEvidence` was closed on `[videoKey, manifestKey, state]` with `state ∈ {PENDING, STORED, FAILED, UNAVAILABLE}`. Nothing on the runner wire could express partiality. | `openapi.yaml` before this amendment |
| The runner's own type is the same three fields, and its producer narrows the state further to `PENDING \| FAILED \| UNAVAILABLE` — `STORED` is 10.14's word. | `studio-runner/src/reporting/snapshot.ts:40-44`, `src/run/recording.ts` |
| `evidenceFor` already decides *playability* — a non-trivial size **and** a readable EBML header — but nothing decides *completeness*. | `src/run/recording.ts` |
| **The API sets `videoPartial = Boolean.FALSE` unconditionally** whenever a report carries evidence. | `RunnerReportProjection.java:126-133` |
| `ExecutionSnapshotMapper` publishes `Boolean.TRUE.equals(getVideoPartial())`, so a null column also becomes `false`. | `ExecutionSnapshotMapper.java:91` |
| `V14` created `video_partial BOOLEAN` for §8.1's "partial flag" and nothing has ever written it non-null. | `V14__studio_execution_history_v2.sql:40` |
| The contract's own `SnapshotErrorTimeout` example carries `partial: true` on precisely the condition story 10.13 creates. | `openapi.yaml` |

The escalation described a field with no producer. The verification found something one step worse:
**the field is not unpopulated, it is falsely populated.** Every execution the API publishes today
states `partial: false` — that is, *this recording is complete* — including one whose browser was
killed mid-step. "Promising a complete video" is the exact wording of the epic's third acceptance
bullet for story 10.13, and the API currently does it on every run. A field nothing populates is a
gap; a field something populates with a constant is a wire statement that is false, and it is the
kind that survives a green build because `false` is a valid boolean.

### 17.2 Ruling

**The field stays, and it gains a producer. `RunnerEvidence` gains an optional boolean `partial`,
set by the runner, projected by the API unchanged.**

Removing `partial` was considered and is not available: §6.1 requires the API to "expose
`videoError`, `videoExpiresAt`, and **whether an available recording is partial**", §8.1 lists the
"partial flag" among the columns V14 creates, BRD §6 requires that crash and storage failures
"expose honest evidence state", and the epic's own acceptance bullet uses the word. Under Article
IV the sources fix this field; what was missing was the producer.

**Only the runner can observe it.** Completeness is a property of how the recording *ended* — the
recorder closed in an orderly way, or it did not — and the component that knows is the one that
ordered the stop, waited out the bounded grace and then killed the tree. The API holds no fact from
which it could be derived (§17.4), and it holds no permission to inspect the object either; the
runner holds no Get or List permission on the bucket at all (§6.2), so neither side can measure the
file after the fact. The observation exists for exactly one instant, in exactly one process.

### 17.3 What `partial` means, exactly

**The recording does not cover the whole browser session it was recording.** Frames are missing
relative to what the browser actually did, because the recorder was not closed in an orderly way.

Two readings were available and the wrong one is the tempting one:

- *coverage of the recording* — frames were lost at the end. **This is the ruling.**
- *coverage of the test* — the test did not finish. **Rejected.** Under that reading a test that
  fails its second assertion of five would report `partial: true` over a recording that shows
  perfectly everything that happened, and `partial` would become a second, worse spelling of
  "`FAILED`". The contract's own examples already contradict it: a `FAILED` execution carries
  `partial: false`.

Two consequences follow and both are stated in the schema, because each is a case an implementer
will meet in wave 4:

- **A deadline kill whose ordered stop flushed cleanly is *not* partial.** Story 10.13 gives the
  child `browserStopTimeoutMs` to close and await the recording context precisely so the webm is
  finalized; when that succeeds the file covers the session to its end. A timeout is not
  automatically a truncation.
- **A recorder that died on a *passing* run *is* partial.** Nothing about partiality follows from
  the outcome in either direction.

Partiality is meaningful only where a playable object exists — `state: PENDING` or `STORED`, which
the API projects to `PROCESSING` or `AVAILABLE`. It is `false` with `FAILED` and `UNAVAILABLE`,
because a recording that does not exist is not a partial one. That is also §6.1's own phrasing:
whether an **available** recording is partial.

### 17.4 Why it is never derived from the outcome

The cheapest fix available was to infer it API-side: `errorCode == TIMEOUT` → `partial = true`. It
is rejected, on two independent grounds.

**It inverts the epic's rule.** Evidence state is independent of the check outcome (§6.1), and the
epic's definition-of-done item is that upload failure never overwrites a known assertion outcome.
The independence is usually read in one direction — evidence must not corrupt the outcome — but it
is a statement about two facts with different producers, and deriving one from the other in either
direction collapses them. An API that computed evidence from outcome would be asserting, on the
wire, a correlation it has not observed.

**It is false in both directions**, which §17.3 makes concrete: a cleanly flushed timeout is
complete, and a recorder crash on a passing run is not. Inferring would therefore be wrong on
exactly the two cases a user most needs to be told the truth about — the run that was cut short but
whose video is whole, and the run that passed but whose proof is not.

The same reasoning rejects the mirror-image temptation on the runner side: `partial` must not be
computed from `outcome.errorCode` inside the runner either. It is read from what the stop path
observed, or it is `false`.

### 17.5 Why optional, and what that costs

`partial` is declared **optional**, with "absent means `false`" stated in the schema, rather than
added to `RunnerEvidence`'s `required` list. The reason is mechanical: `RunnerEvidence` is closed,
the merged runner emits three keys, and a new `required` field would turn `test/contract.test.ts`
red on a producer this ruling is not entitled to change — an architect breaking a green suite to
declare a field is the mirror of a story loosening a schema to keep one green.

The cost is that an optional boolean can be forgotten. Three things pay it down: the schema states
which story is the producer and which condition makes it true; §17.7 makes emitting it explicitly
on every `FINAL` a story-level obligation with a test, so "absent" stops being reachable from the
runner the moment 10.13 lands; and 10.14 inherits the field already declared, so the story §8.1
assigns `RunnerEvidence` to never has to reopen a closed body. When 10.14 lands, promoting `partial`
to `required` is a Class B edit with a one-line rationale and no ambiguity left in it — recorded as
**O-14** rather than done now, because the producer must precede the requirement. That ordering is
the whole lesson of this section.

### 17.6 Alternatives rejected

| Option | Why not |
|---|---|
| **Remove `partial` from `VideoEvidence`** | §6.1, §8.1, BRD §6 and the epic's acceptance bullet all fix it. Article IV: the source wins. It is also `required` on a public body five stories and the MFE consume, so removal is the most expensive edit on the table, taken to avoid the cheapest one. |
| **Widen `RunnerEvidence.state` with `STORED_PARTIAL`** | Collapses two orthogonal facts — did storage succeed, and is the recording whole — into one enum, and would need a second value for the `PENDING` case, then a third for 10.14. It also breaks the documented `state → VideoStatus` projection, which is one-to-one today. Widening an enum is Class B for exactly this kind of consequence. |
| **The API infers it from `errorCode == TIMEOUT`** | Inverts §6.1's independence and is false in both directions (§17.4). |
| **The API probes the stored object's duration and compares it to `durationMs`** | Invents a measurement nobody specified, on a path with no budget for it, to recover a fact the producer had for free and threw away. It would also be wrong whenever the recorder's own timeline and the run's differ, which §11 has already established they do. |
| **A `partialReason` string beside the boolean** | Not asked for by any source, and the reason is already carried: `outcome.errorCode` names what stopped the run, and the runner's own log line names a recording failure. A second free-text field on evidence is where a resolved value eventually leaks (§9.2). |
| **Leave it to 10.14 entire, as §8.1 assigns** | §8.1 assigns *the schema's ownership*, not the observation. 10.14 uploads a file; it cannot see how the recorder ended, because by then the process that knew is gone. Deferring would also have left 10.13 — the story that creates the condition — shipping a truncated recording reported as complete. |

### 17.7 What stories 10.13 and 10.14 must do

Contract-side this is settled. The rest is the stories':

1. **Story 10.13 is the producer.** Its AC-16 already splits the kill path on whether the bounded
   stop flushed a playable file; this ruling adds the third case that split currently absorbs — the
   grace expired, the tree was killed, and the file left behind is *nevertheless* playable by
   `recording.ts`'s size-and-header check. Today that case reports `PENDING` and the API publishes
   `partial: false`: a salvaged prefix presented as a complete video, which is the epic bullet
   AC-16 exists to satisfy. The distinguishing fact is one the parent already holds — did the
   ordered stop complete within `browserStopTimeoutMs` — and it must be recorded **before** the
   signal, for the same reason AC-3 records the timeout kind before killing.
2. **It emits `partial` explicitly on every `FINAL` report**, `false` included, so "absent" is not
   reachable from the runner, and asserts it on the serialized body alongside AC-16's other two
   cases. This is inside AC-16's own subject — a truncated run telling the truth about its video —
   and needs no new criterion, but it is a third case where the story drafted two.
3. **`partial` is never read from, or written from, `outcome`** (§17.4), and AC-16's
   independence assertion extends to it in both directions: the value is identical for a killed run
   whose recording flushed and a passing run whose recording did not.
4. **Story 10.14 carries it through unchanged** when it moves `state` to `STORED`, and lands the
   API-side half: `RunnerReportProjection` stops writing `Boolean.FALSE` and projects the reported
   value, `video_partial` is persisted from it, and `ExecutionSnapshotMapper` keeps publishing the
   column it already reads. Until that lands the runner reports the truth and the API discards it —
   which is visible, bounded and strictly better than today, where the API states a falsehood.
   Recorded as **O-13** so it cannot be lost between two stories that each think it is the other's.

### 17.8 Recorded against §12's four requirements

- **The divergence.** `VideoEvidence.partial` is `required` on the public snapshot; `RunnerEvidence`
  was closed on three fields and could not express it; and `RunnerReportProjection` filled the gap
  with a hardcoded `Boolean.FALSE`, so the API asserts that every recording is complete — including
  one whose browser was killed mid-step, which is the condition story 10.13 introduces and the
  contract's own `SnapshotErrorTimeout` example shows as `partial: true`.
- **The source (Article IV).** Nothing invented. §6.1 requires exposing "whether an available
  recording is partial" and separates evidence state from outcome; §8.1 lists the partial flag among
  V14's columns; §5.2 gives the ordered close that flushes the video and the parent-enforced kill
  that can pre-empt it; BRD §6 requires honest evidence state on crash and storage failure; the
  epic's §10.13 acceptance bullet forbids "promising a complete video". The name is the contract's
  own, unchanged; the type is the public field's own, unchanged.
- **Consuming stories re-checked.** **10.13** — becomes the producer; no criterion is edited, and
  §17.7 lists the work inside AC-16's existing subject. **10.14** — inherits the field already
  declared, so it never reopens a closed body, and owns the API-side projection (O-13). **10.6** —
  its `admissionClient` and `reportClient` branch on status and do not parse evidence; an optional
  field adds no requirement, and the merged runner's bodies stay conformant, which is why the field
  is optional. **10.12** — `evidenceFor` and the `outcome ≠ evidence` independence are untouched.
  **10.16 / 10.15** — consume `VideoEvidence` as declared; `partial` keeps its name, type and
  `required` status on the public body, so nothing changes for them except that the value becomes
  true sometimes. **10.7** — the projection it owns gains one line in a later story, listed as O-13.
  Both copies of `artifact.schema.json` are byte-unchanged.
- **Contract test before and after.** Measured. `studio-runner` `test/contract.test.ts` 14/14 before
  and after — an optional property on a closed body admits the three-key bodies the merged runner
  sends, and the runner's validator implements `additionalProperties` (which is what would have
  broken) and ignores nothing relevant here. `StudioContractTest` 9/9, `ArtifactSchemaDriftTest`
  3/3, `CompileRouteContractDivergenceTest` 9/9, frontend 98 passed — all unchanged.

## 18. Three smaller settlements, and the open items after this amendment

### 18.1 Who writes the timeout text onto a `RUNNING` step (10.13, open question 1)

**Confirmed as drafted: the runner writes nothing, and the API's projection owns the text.** The
component is `RunnerReportProjection.projectSteps` — story 10.7's, merged — which already
synthesizes the step rows the runner never touched and already owns `originalText`.

Four reasons, briefly. `RunnerStepState.failure` is documented "null unless the status is `FAIL`",
so writing it there is a Class B change to a field's meaning, taken to carry a fact the report
already carries as `outcome.errorCode: TIMEOUT`. The API is the authority for the snapshot it
publishes (§8.4) and the report is not the snapshot (§INT-4). The text is derivable without
ambiguity from two facts the API holds — a terminal `TIMEOUT` and exactly the step left `RUNNING`.
And putting it on the wire would be two representations of one fact, rejected three times already
in this ADR.

The constraint on the projection: it may write that message **only** where it can name the cause —
a terminal `errorCode` of `TIMEOUT` and a step still `RUNNING` — and must invent nothing for any
other code or status. Today `projectSteps` copies `failure` verbatim, so the contract's
`SnapshotErrorTimeout` example is aspirational and nothing produces it. That is the same defect
class as §17.1 one field over, and it is assigned with it: **O-13**, story 10.14, which is the next
story to touch that method and the first after which a real runner `TIMEOUT` can reach it.

### 18.2 O-11 — the missing CHECK on `error_code`

**Not attached to story 10.9, and now pointed at a named owner.** 10.9 does ship the next Studio
migration, but it is on `ui_tests` and it carries an unusually specific proof obligation — applied
against a database seeded with rows in all five compile states, a soft-deleted row, a quarantined
row and a legacy row stranded in `COMPILING` (AC-17). Bolting an unrelated constraint on the
partitioned execution-history table into that migration would weaken both proofs and widen a story
whose scope this ruling may not edit.

It moves to **the next migration that touches `ui_test_executions`**, which on the current plan is
story 10.14's evidence work — the same story that owns O-13, on the same table, for the same
reason. Two facts recorded so whoever lands it has no decision left to make: the constraint's form
is V14 §1's own, `error_code IS NULL OR error_code IN (<the eight declared values>)`, widened in
lockstep with the enum whenever §15's vocabulary grows; and `ui_test_executions` is partitioned, so
it wants `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT` rather than a blocking
scan of every partition. The urgency is unchanged: no row can hold a ninth value today, and only a
restored dump or a manual repair could make one.

### 18.3 O-12 — the frontend's narrower union

**No action now; it is story 10.11's, and it is a requirement rather than a note.**

Verified rather than reasoned this time: `frontend/src/types/studio/studioTypes.ts` still declares a
six-member `ExecutionErrorCode`, `npx vitest run` in `frontend/` is **98 passed** with one suite
failing to resolve `@put/core-components` — an unrelated, pre-existing import failure in an
accessibility test — and nothing in the suite narrows on the union. So the union being two values
short breaks nothing today, exactly as §15.5 predicted.

Hand-widening it now would be the worst available move: it would spend the edit and leave the
mechanism that let it drift in place. Story 10.11 is the first story to consume `errorCode`, and it
must **generate the union from this document or assert it against this document** —
`studioContract.test.ts` already parses `openapi.yaml` and is the natural home — so that the next
widening is a red test rather than a silent narrowing.

One addition this amendment creates: §16 declares `x-compile-error-codes`, and story **10.10** is
the first frontend story to consume a code set of that kind, a wave *earlier* than 10.11. Whichever
lands first should install the document-reading assertion once, and the other should extend it
rather than write a second one. Two hand-maintained copies of one vocabulary in two languages is
the arrangement that produced INT-4 and §15.6, and this is the third time it has come up.

### 18.4 Open items after this amendment

| Item | Status at `6cc14f220` |
|---|---|
| **O-6** | Still open, unchanged. Destination policy on the job envelope is 10.18's (SPK-05). |
| **O-9** | Still open and still landable under §14.7's pre-ruling by the next story to touch the internal callbacks. Untouched by this amendment: §16 and §17 declare no `409` and no conflict code. |
| **O-10** | Still open and now overdue. `400` versus `404` for an unknown, deleted or quarantined draft on `GET`/`PUT`/`DELETE /tests/{id}` is a public-surface status decision, and §16 deliberately did not fold it in: this amendment adds fields to a `200`, and bundling a status change would have made its before/after measurement ambiguous about which change did what. Raise it on its own before the pilot. |
| **O-11** | Still open, **re-pointed** to the next migration touching `ui_test_executions` (story 10.14), with the constraint's exact form and the partitioned-table caveat recorded (§18.2). |
| **O-12** | Still open, **assigned and verified**: story 10.11, as a requirement to generate or assert the union from this document rather than widen it by hand (§18.3). |
| **O-13** *(new)* | The API-side half of §17 and §18.1, both in `RunnerReportProjection`: stop writing `videoPartial = Boolean.FALSE` and project the runner's reported value; and synthesize the timed-out step's message where — and only where — a terminal `TIMEOUT` meets a step still `RUNNING`. Owner: story **10.14**. Until it lands, the runner reports the truth and the API discards it. |
| **O-14** *(new)* | Promote `RunnerEvidence.partial` from optional to `required` once 10.14 has landed and every producer emits it (§17.5). Class B, one line, and deliberately sequenced after the producer rather than before it. Owner: story **10.14** or the first story after it to touch `RunnerEvidence`. |

### 18.5 What was measured, and what was not

Every number in §16.10 and §17.8 was measured on this branch, before and after the amendment, in
the same worktree: `StudioContractTest` 9/9, `ArtifactSchemaDriftTest` 3/3,
`CompileRouteContractDivergenceTest` 9/9, `studio-runner` `test/contract.test.ts` 14/14, and
`frontend` `npx vitest run` 98 passed with one unrelated suite failing to resolve
`@put/core-components`. The frontend suite is the one §15.10 could only reason about because
`node_modules` was absent; it is installed in this worktree now and the result is a measurement.
The two new `getTest` examples were validated against the amended `TestDto` with Ajv before the
suites were run, because an example that does not validate is the decorative artefact §14.6 exists
to complain about.

This amendment changes no story's Title, Acceptance Criteria, Scope or Status, and touches no
backend Java, no frontend source and no `studio-runner/` source. It records a ruling in each of the
two wave-4 story files and supersedes one task line in story 10.9, which is named in §16.9 for its
owner to apply.

---

# Amendment, 2026-09-12 (sixth) — a promotion, a body that requires what nothing returns, and two unowned controls

Added on `arch/wave6-rulings`, branched from `epic/EPIC-10` at `52af70c93`. Three escalations
reached an architect at the same time, each classified by @po and each declined by @po on the same
principle: *a description of an edit is not an authorization to make it*. They are ruled together
because they collide on one artefact — `docs/specs/studio/openapi.yaml` and the SHA-256 pin that
watches it — and ruling them apart would move that pin three times.

**One procedural narrowing is made first, because it changes who lands the other three.**

## 19. §12 narrowed once — the architect authorizes, a named story lands

§12 says an architect *"rules first, in this ADR; the story then implements against the amended
document"*, and in practice the four wave-3/4 amendments were landed by the architect editing
`openapi.yaml` directly. That is recorded as a failure, in the pin's own words at
`studio-runner/test/run/confinement.test.ts:132-139`:

> *"The first re-anchor went unowned across all four amendments — they landed as architect rulings
> rather than in a story PR, so nobody's diff was responsible for them, and the red pin was found
> by @po during story validation rather than by the changes that caused it. That is the failure
> this test's own rule exists to prevent."*

`FOC-04` and `FOC-05` both exist to clean up after it. So the mechanism is narrowed, once, exactly
as §14.7 narrowed `x-conflict-codes` rather than letting the same class escalate twice:

**For Class B and Class C alike, an architect's ruling authorizes an edit and names its owner; the
named story makes the edit, re-anchors the pin in the same PR, and records the before/after
measurement in its own §13 cell.** The ruling is still the architect's and is still made first and
in full — nothing about the decision moves to a story. What moves is the *diff*, to a PR whose
author is responsible for it and whose gates run over it.

Three consequences, stated so this is a rule and not a preference:

1. **A §13 row may be written before its edit lands**, marked `AUTHORIZED, NOT YET LANDED`, with
   the owner named and the measurement predicted. The owner replaces the prediction with the
   measurement. A row that stays `AUTHORIZED` across a whole wave is a visible unclosed item, which
   is the property O-14 lacked for two waves.
2. **An authorization is not a licence to redesign.** The owner lands the shape ruled here. A
   divergence found while landing it is left red and escalated, per §12's second rule.
3. **The architect still measures what can be measured without the edit** and says plainly what
   could not be (§23.3). Prior amendments measured before/after in the worktree; this one could
   not, and says so rather than reporting a prediction as a reading.

---

## 20. O-14 — promoting `RunnerEvidence.partial` to `required` (closes story 10.14 AC-26)

### 20.1 The gate §17.5 set, and whether it is met

§17.5 made the promotion conditional on one thing — *"the producer must precede the requirement"* —
and §18.4 recorded it as O-14. Story 10.14's AC-26 restated it as three conditions. (i) and (ii)
were checked by @po and @dev; both were re-checked here **by reading the merged tree at
`52af70c93`**, not by reading their reports.

| Condition | Verdict | What was read |
|---|---|---|
| **(i)** The API accepts and publishes it | **Met.** `RunnerEvidence` is a four-component record, `Boolean partial`, nullable to match the optional property | `…/studio/internal/dto/RunnerEvidence.java`, merged at `00b9e105d`; the projection at `5e72fdf2b` |
| **(ii)** The runner emits it on every `FINAL`, `false` included | **Met, and *absent* is unreachable by construction rather than by discipline.** `EvidenceState.partial` is `readonly partial: boolean` — non-optional in the type, so `JSON.stringify` emits it on every serialization; `evidence` is initialized `{ …evidenceKeys, state: 'UNAVAILABLE', partial: false }` **before** the `try`; `sendFinal(outcome: RunOutcome, evidence: EvidenceState)` takes it non-optionally; and `snapshot.build` places the object on the body by reference, filtering no key | `snapshot.ts:40-56`, `runCoordinator.ts:381-383`, `reportingStepReporter.ts:54,146`, `snapshot.ts:196-221` |
| **(iii)** An architect has ruled | **This section.** |

@po's reading of (iii) is upheld and is worth restating, because it is the load-bearing procedural
finding of wave 5: **§17.5 is a rationale, not an authorization.** §17.5's own sentence is that the
promotion is *"recorded as O-14 rather than done now"*; §18.4 files O-14 under *"Open items"*; and
an open item is by construction not a ruling. Reading it as one would have been a story granting
itself Class B authority on the strength of an architect having described the edit — the precise
manoeuvre §12's asymmetry argument exists to prevent. @po declined the permissive reading and was
right to.

### 20.2 Ruling

**`partial` is promoted. `RunnerEvidence.required` becomes `[videoKey, manifestKey, state, partial]`.**

The producer preceded the requirement, which was the whole of the condition §17.5 set, and both
halves of the consumer followed it. There is nothing left to sequence.

### 20.3 Why `required` — and not "it costs nothing to leave it optional"

The tempting answer is that promotion buys nothing: every producer emits the field, so the
requirement constrains nobody. That answer is refuted by this epic's own history, one wave ago.

`DEF-02` is what optionality actually bought. Between §17 landing the optional property and story
10.14's AC-10, **the merged API refused every `FINAL` the merged runner sent** — `400
INVALID_REPORT`, retried until abandoned, the run reconciled by a reaper instead of by its own
result — and no suite was red. The runner suite validated against a document that permitted
`partial`; the backend suites used their own fixtures; and
`StudioContractTest.assertSchemaMatchesRecord` covered nine public DTOs and no internal record at
all. Three components held three different opinions about one field and the build was green.

The causal reading has to be exact, or the ruling is made for the wrong reason. **`required` would
not have prevented `DEF-02`.** `DEF-02` was a record-*width* divergence, and the control that
catches that class is story 10.14's AC-24 — the internal-record drift check, now merged, with
`RunnerEvidenceBeforeStory1014` as its own non-vacuity control. What `required` closes is the
other direction, which nothing closes today:

- **Optional means *absent is legal*, and §17.5 says absent means `false`.** So the document
  currently licenses a producer to stop emitting the field and be told it is conformant — and the
  wire statement that results is *this recording is complete*, on a run whose recorder died. That
  is the exact falsehood §17.1 was written to end: *"a field something populates with a constant is
  a wire statement that is false, and it is the kind that survives a green build because `false` is
  a valid boolean."* Optionality preserves a cheap path back to it.
- **The runner's own conformance test is the enforcing control, and it can only enforce what the
  document requires.** `test/contract.test.ts` validates the **real serialized progress bodies**,
  captured off a live harness, against the request schema read from `openapi.yaml`. With `partial`
  optional, a runner that dropped it stays green there. With `partial` required, the same test —
  unchanged, no edit — starts failing the moment a producer regresses. The assertion already
  exists; promotion is what points it at this field.

So the promotion is not bookkeeping. It converts a fact that three components currently *happen* to
agree on into one the document *requires* them to agree on, at the moment when agreeing costs
nothing. That is the only moment at which it is ever cheap.

### 20.4 What the promotion breaks, which nobody named

`FOC-05` and story 10.14's AC-25/AC-26 both treat the cost of this edit as *one* thing: the SHA-256
pin moves, so the edit must not land under a story that asserts the pin unchanged. That is true and
it is now discharged — story 10.17 merged at `c54df7934`, and the pin is still live and correct:
`shasum -a 256 docs/specs/studio/openapi.yaml` returns
`cbf07c99de363d18783690e99cdf115242e8b7c1387da7c433658ad27b6f412e`, identical to `BASE_SHA256` at
`confinement.test.ts:149`. Verified here.

**But the pin is not the only thing in that file that this edit falsifies, and the second one is
not self-resolving.** Fourteen lines below the pin, `confinement.test.ts:163-173` carries:

```
it('emits the optional RunnerEvidence.partial that ADR-002 §17 already landed, without editing it', …
    expect(body).toContain('required: [videoKey, manifestKey, state]');
    expect(body).not.toContain('required: [videoKey, manifestKey, state, partial]');
```

That test asserts, as a positive property, that **the promotion has not happened** — and it names
the promotion's exact post-edit text in a `not.toContain`. It was correct when story 10.13 wrote
it: 10.13's criterion was *this story made no contract edit*, and the assertion proved §17's
optional field was consumed rather than modified. It becomes false the instant O-14 lands, and
unlike story 10.10's escalation test it does **not** go green on the amendment — it goes red, and
the failure accuses story 10.13, which is merged and blameless.

This is `FOC-04`'s and `FOC-05`'s shape a third time: a *false red*, in a story that made no edit.
It is recorded here because neither `FOC-05` nor AC-26 mentions it, and a wave-6 story that
budgeted for a one-line `required` edit plus a pin re-anchor would meet it at the gate.

The repair is one line of judgment, not a deletion: the assertion's *subject* is right — the
runner's evidence schema is a thing worth watching from the runner — and only its *tense* is
wrong. It becomes an assertion that the promotion **has** happened, with the same non-vacuity shape
(`toContain` the four-key form, `not.toContain` the three-key form), and its comment records that
the change is O-14's and names this section.

### 20.5 The `§17.7` correction `DEF-02` asked for, landed here

`DEF-02`'s `correction_to_adr` field has been outstanding since wave-5 validation and is closed by
this sentence. §17.7 item 4 reads:

> *"Until that lands the runner reports the truth and the API discards it — which is visible,
> bounded and strictly better than today, where the API states a falsehood."*

**That was wrong on the code as merged, and in the direction that matters.** Nothing was discarded:
`RunnerEvidence` was closed with `@JsonIgnoreProperties(ignoreUnknown = false)` and
`StrictInternalBodyReader` enables `FAIL_ON_UNKNOWN_PROPERTIES`, so the whole report was **refused**
`400`. "Visible and bounded" described a degradation; the reality was a broken terminal path. The
sentence should have read: *until that lands, the runner reports the truth and the API refuses the
report entire.* It is corrected here rather than by editing §17 in place, so the amendment log's
reader sees that the document was wrong and when it stopped being wrong.

The general lesson is already this document's own and is restated because it went unlearned once:
**an ADR that predicts a consumer's behaviour instead of reading it will be believed.** §17.8 listed
story 10.6's clients as "re-checked" and did not read the Java record's width. The control that now
exists for this is AC-24; the control that does not yet exist for its mirror image is O-15 (§23.1).

### 20.6 Alternatives rejected

| Option | Why not |
|---|---|
| **Leave it optional indefinitely** | The condition §17.5 set is met; leaving it would make the open item permanent, which is the outcome AC-26's *"skipped, never passed, with O-14's owner named"* machinery exists to avoid rather than to institutionalize. It also keeps alive the one wire reading (§20.3) that lets a false `partial: false` be conformant. |
| **Close AC-26 as declined** | Available, and rejected. A decline needs a reason that survives the producer existing, and there is none: the only reason §17.5 gave for optionality was the absent producer. Declining would be overruling §17.5's own rationale on no new evidence. |
| **Promote, and also make the API enforce it** | Considered and **not** ordered. Jackson treats a missing field as `null`, so `required` in the document is not enforced by `StrictInternalBodyReader`; the enforcing assertion is the runner's, on its own serialized bytes, which is where a producer obligation belongs. Adding a required-field check to the reader would put a second copy of the contract in Java — §15.6's arrangement for the sixth time. Recorded as a deliberate asymmetry, not an oversight. |
| **Bundle it into the same PR as §21's `TestDto` edit** | Rejected on ownership, not on principle. That edit needs a backend producer and a frontend consumer; this one needs a runner test-file edit. One story carrying all three trees is how a scope stops being reviewable. The pin cost is paid down instead by §23.2's ordering. |

### 20.7 What the owning story must do

**Owner: story 10.18.** It is the only wave-6 story with `studio-runner` scope, it depends on
10.13, 10.14 and 10.17, and its subject — hardened staging deployment — is where a runner/API
disagreement about evidence would surface. §18.4's recorded owner formula was *"story 10.14 or the
first story after it to touch `RunnerEvidence`"*; 10.14 merged with AC-26 *skipped, never passed*,
and **no wave-6 story touches `RunnerEvidence` today**, so the formula as written defers forever.
It is replaced by a named story. Widening 10.18's scope to carry it is @po's edit, not mine; what
is fixed here is the work, not the criterion.

1. **The edit.** `RunnerEvidence.required` → `[videoKey, manifestKey, state, partial]`. One line.
2. **The description, in the same edit.** The `partial` property still reads *"Optional, and absent
   means `false`. The merged runner does not emit it yet: the producer is the deadline kill of
   story 10.13…"*. Verified false at `52af70c93` — 10.13 merged and the runner emits it on every
   `FINAL` (§20.1). It becomes: required; emitted on every report that carries evidence; `null` on
   `STARTED` and `PROGRESS`, where `evidence` itself is null. Leaving stale prose beside a corrected
   `required` list is how the next reader concludes the list is the stale half.
3. **`confinement.test.ts`, both halves** (§20.4): invert the promotion assertion, and re-anchor
   `BASE_SHA256` — re-read with `shasum -a 256` from the file at the moment of the re-anchor, never
   transcribed from this document or from a story, with a comment naming this section and §22 as
   what the new digest covers.
4. **Measure and record.** `test/contract.test.ts`, `StudioContractTest`, `ArtifactSchemaDriftTest`
   and `CompileRouteContractDivergenceTest` before and after, into this amendment's §13 cell,
   replacing the prediction.
5. **Nothing else.** No producer change is required or permitted by this ruling: the producer is
   the thing that made the ruling possible.

### 20.8 Recorded against §12's four requirements

- **The divergence.** A field that every component emits, that every component reads, and that the
  document still declares optional — so the document permits a state (`absent`) that would publish
  `partial: false`, *this recording is complete*, over a recording that is not. The gate §17.5 set
  against landing it earlier has been met since story 10.13 merged.
- **The source (Article IV).** Nothing invented, and no new field. §17.5 fixes the edit and its
  ordering verbatim; §18.4 records it as O-14; §12 Class B assigns the ruling. §6.1 requires
  exposing *"whether an available recording is partial"*; the name, type and meaning are §17's,
  unchanged.
- **Consuming stories re-checked.** **10.13** — the producer; the type is already non-optional, so
  the requirement adds nothing it must do, and its `confinement.test.ts` assertion is inverted by
  the owner rather than by it (§20.4). **10.14** — merged; AC-26 was its conditional criterion and
  is closed by this ruling, not by it. **10.7** — `reportClient` branches on status and parses no
  acknowledgement; unaffected. **10.15 / 10.16** — consume `VideoEvidence.partial`, which is
  already `required` on the public body and is untouched here. **10.11** — frontend; reads the
  public snapshot, not `RunnerEvidence`. Both copies of `artifact.schema.json` are unaffected.
- **Contract test before and after.** **Predicted, not measured** — see §23.3 for why, stated in
  the same breath as the prediction. `test/contract.test.ts` 14/14 before and after: it validates
  the runner's real serialized progress bodies against the schema, and those bodies carry
  `partial`. `StudioContractTest` unchanged: `assertSchemaMatchesRecord` compares property *name
  sets* and never reads `required`, verified at `StudioContractTest.java:416-426`.
  `confinement.test.ts` 2 red until the owner's own edit to it, 0 after. The owner measures.

---

## 21. INT-10 — the confirm body requires a field no response returns (closes story 10.10 AC-15)

### 21.1 The gap, verified — and measured across the whole document

Story 10.10 exercised §12 exactly as §12 asks: it found a field it could not obtain, refused to
fabricate one, left a contract test **red** with its reason in the test name, filed two candidate
shapes and took neither.

| Fact | Evidence, `arch/wave6-rulings` at `52af70c93` |
|---|---|
| `ConfirmCompileRequest.required` is `[revisionId, artifactHash, sourceRevision, configurationRevision]` | `openapi.yaml` |
| `TestDto` has 22 properties. `sourceRevision` and `configurationRevision` are among them; `currentCandidateRevisionId` supplies `revisionId`. **No property is `artifactHash` and none ends in `ArtifactHash`** | measured by walking the document |
| Over the `tests` tag, exactly **one** required request field is unreachable from any declared `2xx` response, and it is `confirmCompile.artifactHash` | measured |
| `artifactHash` exists on a request *example*, on `ConfirmCompileRequest` itself, and on the internal `RunJob`. An example is not a schema (§14.6) and `RunJob` is not a public response | `openapi.yaml` |
| The data exists and is persisted: `UITestRevision` carries `source`, `artifact`, `artifactHash`, `artifactSchemaVersion`, `provenance` | story 10.10's verified record, re-read against the schema inventory |

So the client is required to send a value the contract gives it no declared way to read. Under §12
this is Class C — either candidate moves the public surface — and @po classified it so.

### 21.2 Ruling

**Candidate A. `TestDto` gains two nullable properties:**

- **`currentCandidateArtifactHash`** — the canonical artifact hash of the revision that
  `currentCandidateRevisionId` already names. `null` when there is no candidate. This is the field
  `ConfirmCompileRequest.artifactHash` is read from.
- **`currentCandidateArtifact`** — the candidate revision's immutable validated artifact, the
  frozen `artifact.schema.json` shape. `null` when there is no candidate.

Both are **nulled in the `GET /tests` list projection**, on §16.5's precedent and documented the
same way — §16.5 already established that the list projection diverges from the single-draft read
and that the divergence is declared rather than discovered.

**Candidate B — `GET /tests/{id}/revisions/{revisionId}` — is rejected**, and on correctness rather
than on cost. See §21.3.

### 21.3 Why A, and why B is wrong rather than merely expensive

@po's preference for A was recorded as a product preference on cost grounds: B is a new public
operation with its own authorization, `409` surface, paging question and marker bookkeeping, which
is a wave's work nobody is sized for. That reasoning is sound and it is not the reason A wins.

**`ConfirmCompileRequest` is a conditional transaction, and its four fields must come from one
read.** That is what the body is *for*: the client asserts the revision, the artifact hash, the
source revision and the configuration revision it believes it reviewed, and the server refuses with
`STALE_CANDIDATE` if the draft moved underneath it. Three of those four fields are on `TestDto`.

Under B, the fourth comes from a **second request**. Between the two reads the draft can recompile
— which is not hypothetical, it is the state machine §16 documents, with `attempts`, `exhausted`
and a `needsRevision` example. The client would then assemble a four-field conditional body out of
two reads that disagree, and the conditional transaction would be checking a claim the client never
coherently held. The failure is worse than a stale refusal: a hash from read 2 paired with a
revision id from read 1 can be *internally* inconsistent in a way the server's own
`STALE_CANDIDATE` check was never designed to name.

This is §16.3's ruling, one field over. §16.3 put compiler output on the draft rather than on the
revision precisely so it could be *"never stale against the draft it arrives with"*, and argued it
in these words: the client aligns hash, steps and diagnostics **because they are read in one
transaction**. B reintroduces exactly the seam §16.3 closed, on the one body where the seam is
load-bearing.

B's stated advantages survive and do not rescue it. Revisions are immutable and cacheable — true,
and irrelevant to a body whose whole purpose is to assert a *current* alignment. Provenance has no
home today — true, and it is a real gap, but it is not this gap, and solving an unraised problem
with a new public operation is how a route acquires an authorization surface nobody reviewed.
10.11's Code view wants the **confirmed** revision — true, and `confirmedRevisionId` is already on
`TestDto`; if 10.11 needs the confirmed artifact as well as the candidate's, that is a third
additive property on the same body, not a route.

### 21.4 The name is fixed here, because the test cannot fix it

@qa found that story 10.10's reachability rule is **wider than the answer it produces**. `isReachable`
accepts an exact name or any readable property whose name ends with the field name capitalized. So
a property called `supersededRevisionArtifactHash` — the hash of explicitly the *wrong* revision —
satisfies it. Verified here by simulation against the real document: injecting
`currentCandidateArtifactHash` into the readable set empties the unobtainable list, and injecting
`supersededRevisionArtifactHash` empties it **identically**.

@qa is right, and the consequence is a ruling obligation rather than a test defect. The qualified-
suffix half of the rule is not sloppiness — it is load-bearing, and story 10.10 was right to write
it. Without it the escalation would report `revisionId` as a second, false divergence, because
`revisionId` is genuinely obtainable only through `currentCandidateRevisionId`; and 10.10's own
sibling test pins that half as live rather than dead code. An escalation that cries about two
things when one is real is an escalation nobody acts on.

But a syntactic suffix can express *a* correspondence and can never express *the right* one. So:

**The field is named `currentCandidateArtifactHash`, by this ruling, and the name is normative.**
It is paired with the existing `currentCandidateRevisionId` so that the name itself states which
revision it hashes — the reader of the confirm call can see the two fields agree without consulting
this document. `artifactHash` bare is rejected: on a body that also carries `confirmedRevisionId`,
an unqualified hash does not say which revision it belongs to, and the one thing this body must
never be ambiguous about is which revision the client is asserting.

The test's role is correspondingly demoted, and the demotion should be written into it when the
amendment lands: it is a **tripwire that a qualified hash exists**, not a check that the right one
does. Its green is necessary and not sufficient. That sentence belongs in the test's own comment,
because the next reader will otherwise take its green as acceptance.

### 21.5 @po's ratified property is false as stated — measured, not argued

@po ratified the property as *"true of every other route in the document"* and re-usable. **The
generalisation is false.** Measured here by walking every tag in `openapi.yaml` with story 10.10's
own `isReachable` and `requiredRequestFields` logic:

| Tag | Operations | Required request fields checked | Unreachable |
|---|---|---|---|
| `tests` | 8 | 12 | **1** — `confirmCompile.artifactHash` |
| `executions` | 4 | 0 | 0 *(vacuous: no required request body)* |
| `api-callback` | 2 | 19 | **12** |
| `runner` | 4 | 16 | **16** |
| `internal` | 6 | 35 | **25** |

@qa's three counts — 25, 16 and 12 — reproduce exactly.

**The test is honest and the generalisation is not**, and the distinction is not a technicality.
Story 10.10's test scopes to the `tests` tag in its own name and in its `TAG` constant, so it
asserts only what it measured. @po's sentence generalized from it without measuring. This is worth
recording in a document whose §14.6 exists to complain about facts that are conveyed decoratively:
a ratification is a statement about the world, and it is checkable.

**Why the scoped form is the true one.** The property is *"a client must be able to read what it is
required to send"*. That is a property of a **client-facing resource surface**, where the caller
discovers state by reading and then acts on what it read. `internal`, `runner` and `api-callback`
are not that. They are a **dispatch** surface and a **report** surface: the API sends the runner a
job it composed from its own database, and the runner sends the API a report it composed from its
own observations. Neither sender reads its payload back from the receiver's responses first, and
requiring it to would be nonsense — `reportProgress.evidence` is the runner's observation, and the
API returning it on a `2xx` before the runner sends it is not a thing that could exist. The 53
"failures" are the property being applied outside its domain, not 53 divergences.

The re-usable form, stated so nobody re-generalizes it:

> **Every field named in the `required` list of a request body on a *client-facing* operation must
> be reachable from some declared `2xx` response schema of an operation on the same surface.**
> Machine-to-machine command and report surfaces are outside it by construction: their senders
> compose payloads from state the receiver does not hold.

### 21.6 Whether story 10.11 extends the assertion beyond the `tests` tag — **no**

10.11 is being drafted now and is told to extend it. **It must not**, and the reason is §21.5's
measurement rather than a judgment about 10.11's scope: extending by tag commits 10.11 to a test
that is red on 53 counts, every one of which is correct by design. A story that inherits a test red
on 53 correct facts does one of two things, and both are worse than not writing it — it suppresses
the tag list, which makes the test a statement about its own exclusion list, or it widens
`isReachable` until the reds go away, which is §12's *"the one edit whose only effect is to stop a
test from telling the truth"*.

Extending to `executions` is permitted and nearly worthless: zero required request fields today, so
the assertion is vacuous, and a vacuous guard is this epic's most-repeated finding — sixteen
catalogued shapes by story 10.17's gate. If 10.11 adds it, it adds a non-vacuity control in the
same commit that proves the tag has something to check, and it will find that it does not.

**What 10.11 should spend that edit on instead is already assigned to it and is real: O-12.**
§18.3 requires 10.11 to *generate the `ExecutionErrorCode` union from this document or assert it
against this document*, because `frontend/src/types/studio/studioTypes.ts` still declares six
members against the document's eight. That is a live two-value divergence with a named mechanism
behind it, and `studioContract.test.ts` is already its natural home. One document-reading assertion
that catches a real drift is worth more than a second one scoped to a surface that has no drift to
catch.

### 21.7 Authorization, and what is not weakened

§16.6's argument transfers, and it is checked rather than asserted. The artifact is **derived from
the author's own steps**, which the same body already returns verbatim in `steps`, and it is read
on `GET /tests/{id}`, whose CSI scoping §9.1 already fixes — so the new properties are visible to
exactly the principals who can already read the draft they describe, and to no others.

References stay opaque. §9.2 keeps resolved values off the compile path entirely: the artifact
names `vars.secret('ID')`, never a value. §16.6 established that the first surface to carry
compiler output needed no new gate *because the compile path resolves no variable and no secret at
all*, and that holds identically here — the artifact is the compile path's output. BRD §9.2's
*"The MFE receives neither resolved secrets nor service credentials"* is not weakened.

One consequence is stated because an implementer will meet it: `currentCandidateArtifact` is the
**candidate's** artifact, and `steps` is the **draft's** current English. In the `needsRevision`
state those disagree by design — that is what the state means. The review surface must render the
artifact, never `steps`, when it claims to show what was validated; deriving the summary from
`steps` would present the client's reading of the English as the validator's reading of the
artifact, which is the confusion story 10.10 AC-16(a) exists to prevent and which architecture §8.3
retires the client grammar path to end.

### 21.8 Alternatives rejected

| Option | Why not |
|---|---|
| **B — `GET /tests/{id}/revisions/{revisionId}`** | Splits a conditional transaction's four fields across two reads (§21.3). Also the largest Class C change available (§16.7), with an authorization surface, a `409` set and marker bookkeeping nobody is sized for — but that is the second reason, not the first. |
| **Relax `ConfirmCompileRequest.required` to drop `artifactHash`** | The manoeuvre §12's third rule names: relaxing a `required` list to stop a test failing. It would also delete the conditional transaction's strongest term — the hash is the only one of the four that pins the *validated artifact* rather than a revision identifier. |
| **Let the client compute the hash from the artifact it was shown** | Rejected by story 10.10 before it was proposed, and rightly: a client-computed `artifactHash` is the client asserting what the server canonicalized, which is the one thing the conditional transaction exists to check. It would be green, and it would check nothing. |
| **Return the hash on `POST /tests/{id}/compile`'s `202` only** | The `202` is an acceptance, not a result; the hash does not exist until compilation succeeds. A client that reloads, or a second tab, would have no path to it — and the reload path is exactly what story 10.9's @po ruling 2 said must work. |
| **Add `provenance` and `artifactSchemaVersion` too, while the body is open** | Not asked for by any source and not needed by any consumer that exists. §18.4's O-10 note is the precedent: bundling an unmotivated change makes the before/after ambiguous about which change did what. If 10.11's Code view needs provenance, it raises it with a consumer. |

### 21.9 What the owning story must do

**Owner: story 10.11.** It is the only wave-6 story still in draft — so its scope can be set
correctly before it starts rather than amended mid-flight — it depends on 10.10, and its run gate
is enabled by `compileStatus: READY`, which only confirmation produces. It therefore has both the
strongest need and the only unfrozen scope. Story 10.10 anticipated this exact assignment: its
AC-16(b) records *"if the ruling lands after wave 5 closes, owner is 10.11"*. Wave 5 has closed.

**The scope consequence is stated plainly rather than buried: 10.11 as drafted is a frontend story,
and this edit is not.** It needs the document, a backend producer and a frontend consumer. Widening
10.11 to carry all three, or splitting the producer into its own story, is @po's decision — this
ruling fixes the shape and the owner, never the Acceptance Criteria.

1. **The document.** The two nullable properties on `TestDto`, with `null` in the `GET /tests` list
   projection declared the way §16.5 declares its omission, and a `getTest` example updated. Any
   new or edited example is validated against the amended `TestDto` with Ajv **before** the suites
   run — §18.5's rule, because an example that does not validate is the decorative artefact §14.6
   complains about.
2. **The backend producer, in the same PR — this edit cannot be document-only.**
   `StudioContractTest.assertSchemaMatchesRecord` asserts **set equality** between the schema's
   property names and the Java record's components (verified, `StudioContractTest.java:416-426`),
   so `TestDto` gaining two properties turns it red until `UITestDto` gains the same two. The
   producer reads `UITestRevision.artifactHash` and `.artifact` for the revision
   `currentCandidateRevisionId` names.
3. **`studioEscalation.test.ts` goes green with no edit to its assertions** — that is the property
   that made it an escalation. Its *comment* is updated in the same PR to record §21.4: the
   qualified-suffix rule is a tripwire, its green is necessary and not sufficient, and the correct
   field was named by ruling.
4. **Do not extend the assertion beyond the `tests` tag** (§21.6). If the story wants a second
   document-reading control, O-12 is assigned to it and is real.
5. **Re-anchor `BASE_SHA256`**, after story 10.18's amendment has merged — see §23.2, and the
   ordering is not optional.
6. **Measure and record** into this amendment's §13 cell, replacing the prediction.

### 21.10 Recorded against §12's four requirements

- **The divergence.** `ConfirmCompileRequest` requires `artifactHash`; no `2xx` response of any
  `tests`-tagged operation returns it or any qualified form of it; and there is no revision read
  route. The client is required to send a value it cannot obtain, which also denies story 10.10 the
  action/target/assertion summary and the expandable source that §4.7 requires be *derived from
  validated operations*.
- **The source (Article IV).** Nothing invented. `UITestRevision` already persists `artifactHash`
  and `artifact`; `artifact.schema.json` is frozen since story 10.1 and fixtured as `mockArtifact`;
  `RunJob.artifactHash` is already described *"Canonical artifact hash from the confirmed
  revision"*; the epic's §10.10 scope line requires the expandable executable source; §4.7 requires
  the summary be derived from validated operations; §16.3 supplies the one-read argument and §16.5
  the list-projection precedent. The **name** is the one thing this ruling adds, and it is
  constructed from the document's own `currentCandidateRevisionId` (§21.4).
- **Consuming stories re-checked.** **10.10** — merged; AC-15's test goes green untouched, and
  AC-11(b)/AC-16(b) are unblocked but remain *skipped, never passed* in a merged story; whether
  they move to 10.11 or to a follow-up is @po's. **10.9** — owns the compile/confirm surface; the
  properties are additive on a body it already returns and no route, marker or status changes.
  **10.11** — the owner. **10.16** — consumes the execution surface, untouched. **10.15 / 10.18** —
  no `TestDto` dependency. Both copies of `artifact.schema.json` are byte-unchanged: this ruling
  *references* the frozen shape and does not alter it.
- **Contract test before and after.** **Predicted, not measured** (§23.3), with one exception that
  *was* measured: story 10.10's reachability property was re-computed here against the real
  document, and `currentCandidateArtifactHash` empties the unobtainable list — so
  `studioEscalation.test.ts` goes 2/3 → 3/3 with no edit to the test. That is the claim @qa made
  and it reproduces. `StudioContractTest` is **red** on `TestDto` until the Java record follows in
  the same PR, which is stated as a requirement rather than discovered as a failure.

---

## 22. The `resolvedVars` scrubbing clause — and which side was actually wrong (Class B)

### 22.1 The divergence, verified

Story 10.17 found that the runner's redactor is fed **resolved variables as well as secrets**,
while `RunJob.resolvedVars`'s description carries no scrubbing clause and
`RunJob.resolvedSecrets`'s says it is *"additionally scrubbed from every outbound diagnostic
together with its tested encoded variants"* — a wording that, by naming the scrubbing as
*additional* to one field, implies its absence from the other. @po ruled the code's stronger
behaviour correct and referred the document amendment here as Class B.

| Fact | Evidence at `52af70c93` |
|---|---|
| `knownValuesOf(job)` returns `[...Object.values(job.resolvedVars), ...Object.values(job.resolvedSecrets)]` and its result *"is handed straight to `createRedactor`"* | `studio-runner/src/reporting/envelope.ts:311-321` |
| The run's redactor is built from it | `runCoordinator.ts:325` |
| The parent's job resolver returns both maps from `knownValues()` | `runCoordinator.ts:224-226` |
| The child's resolver does the same, and its comment states the rule — *"a variable that happens to carry a canary must be redacted for the same reason a secret is"* | `childRuntime.ts:140-160` |
| The executor builds its redactor from `resolver.knownValues()` | `executor/executor.ts:83` |

### 22.2 Ruling — amend, and the framing is not "document catches up to code"

**The document is amended.** But the escalation's own framing should not be adopted, because it
misplaces the error and would set a bad precedent for the next one.

Architecture §9.2 reads: *"Runner scrubs **known values** and tested encoded variants from every
outbound diagnostic before persistence."* **Known values**, not known secrets. The runner
implements §9.2 exactly. So this is not a case of code being stronger than its contract and the
contract being relaxed upward to match — it is a case of **the contract having been written
narrower than its own source**, and the code having been right all along. Under Article IV the
source wins, and the source here has never said anything else.

That reframing changes the risk assessment, which is why it is worth the paragraph. Read as "prose
lags behind a generous implementation", leaving it costs nothing. Read correctly, the document
**licenses a future runner to stop redacting variables and still claim conformance** — and that is
not theoretical on this surface. Story 10.17's AC-14 found a live redactor hole of exactly this
kind: serialize-then-redact means a value containing `"`, `\` or a newline is JSON-escaped in the
line the redactor searches, and an eighth variant had to be added beside the seven. A variable
carrying a canary is a tested concern in this epic, not a hypothetical one.

**Class B is the right gate** and @po classified it correctly: §12 makes *"changing what an existing
field means"* Class B, and this changes what two fields mean. §12's third rule — *loosening is
never a story's call* — is not in play, because this is a **strengthening**; it is recorded anyway,
because the symmetry matters: a strengthening on a closed body is still a meaning change, and the
next story that finds one should escalate it rather than reason that only loosening is gated.

### 22.3 What the amended text must say

`resolvedVars`, in its own right: ephemeral, held in runner memory for the run and cleared on every
exit path; never written to scratch, a retry buffer, a manifest or a report; **and scrubbed, with
its tested encoded variants, from every outbound diagnostic before persistence (§9.2)**.

`resolvedSecrets`: the same two clauses, stated identically rather than by reference to *additional*
treatment. What is genuinely additional to a secret is **vault-use authorization** — story 10.17's
axis, §9.2's *"Scope secret use to approved origins and action arguments"* and *"Secret reference
names alone grant no permission"* — and the description says that instead. A reader who wants to
know how the two differ gets a true answer rather than a false one.

**Owner: story 10.18**, in the same PR as §20's promotion, so the pin moves once for both (§23.2).
Description text only: no shape, no `required` list, no enum. Predicted effect on every suite: none.

### 22.4 Recorded against §12's four requirements

- **The divergence.** The document confines the scrubbing obligation to `resolvedSecrets` and by
  omission exempts `resolvedVars`, while §9.2 imposes it on *known values* and four merged sites
  implement it on both.
- **The source (Article IV).** Architecture §9.2, verbatim, in both halves: *"Runner scrubs known
  values and tested encoded variants from every outbound diagnostic before persistence"* and
  *"Scope secret use to approved origins and action arguments… Secret reference names alone grant
  no permission"*. Nothing invented; no field added, removed, renamed or retyped.
- **Consuming stories re-checked.** **10.17** — the producer of all four sites; the amendment
  records what its AC-20 and AC-21 already built and asks it for nothing. **10.13** — owns the
  canary harness the rule is asserted through; unaffected, since the behaviour does not change.
  **10.18 / 10.19** — inherit a description that no longer under-states the control they must
  demonstrate in staging. No public body is touched.
- **Contract test before and after.** Description text only; predicted unchanged everywhere.
  Measured by the owner (§23.3).

---

## 23. Two unowned controls, the sequencing, and what was not measured

### 23.1 O-15 and O-16 — recorded here, with owners

Both findings came out of wave 5's gates, both are architectural rather than story-local, and
neither had an owner. They belong in this document for the same reason §14.6 put
`x-conflict-codes` here: each is about whether a fact on a **closed §6.2 body** is *assertable*, and
that is a property of the contract surface, not of whichever story last touched the file.

**O-15 — the runner's `ACCEPTED_JOB_KEYS` is not pinned against the frozen `RunJob`.**

Verified. `src/reporting/envelope.ts:59-74` hard-codes fourteen key strings as the inbound
default-deny set. The only assertion over it is `test/run/canary.test.ts:713-714` —
`has('resolvedSecrets')` and `size === 14`. **A count is not a correspondence.** Renaming a key on
either side, or swapping one for another, leaves the count at fourteen and the suite green. Nothing
anywhere reads `components.schemas.RunJob` and compares it.

@qa named this *"the remaining half of the `DEF-01` cause"*, and the naming is exact. `DEF-01` was
this drift in the other direction: `HttpRunnerDispatchClient.body()` sent eight of the fourteen
required keys plus four the closed schema forbids, so **every real dispatch was refused
`400 JOB_INVALID`** and ended `ERROR / DISPATCH_FAILED` — the API could never dispatch a run at
all, and no test looked for it. Story 10.17 closed the API side properly and generally, with
`InternalBodyContractConformanceTest`: *for every internal body this API produces, the serialized
bytes validate against the schema the frozen document declares for it*, landed red first with a
non-vacuity control. The runner side has no counterpart. Two closed key sets, one guarded, one
counted.

The control's form is stated so the owner has no decision to make: **read the key set of
`components.schemas.RunJob.properties` from `openapi.yaml` and assert set equality with
`ACCEPTED_JOB_KEYS`**, with a non-vacuity control in the same commit — a mutation that adds or
removes one key on either side and the named test that goes red. The `size === 14` assertion is
**replaced**, not kept beside it: a hand-maintained count sitting next to a derived comparison is
the fifteenth copy of one vocabulary, which is §15.6's arrangement for the seventh time in this
epic.

The wider point, recorded because it will recur: this is a **property** assertion where the
runner currently has a **byte** assertion. `confinement.test.ts`'s SHA-256 pin is the right control
for *this story made no contract edit* and the wrong one for *the contract is what the runner
expects* — it has produced a false red on a blameless story twice (`FOC-04`, `FOC-05`) and is about
to a third time (§20.4). Property assertions over the document do not have that failure mode, and
every one this epic has added went green on the amendment untouched.

**Owner: story 10.18**, with the runner tree and a staging-conformance subject.

**O-16 — `bounds.ts`'s truncate-before-redact ordering.**

Verified, including the part that makes it *not* live. `createLogBuffer.append` truncates the
message to `maxEntryLength` and then retains it; its own comment states the requirement it cannot
enforce — *"callers are required to redact first"*, because a known value cut by the `slice` becomes
two fragments, no fragment matches any variant `createRedactor` produces, both halves survive the
later redaction of the assembled body, and concatenating them reconstructs the value.

Today exactly one production caller exists, `RunSnapshot.appendLog` at `snapshot.ts:148`, and it
redacts first. So the trap is **latent, not live** — @qa's verdict reproduces. What makes it worth
recording rather than leaving in a comment is that `createLogBuffer` is exported from
`src/reporting/index.ts`, the package's own module surface: a second producer is one import away,
and the invariant protecting a redaction boundary would be a paragraph of prose.

The shape of the fix is already established in this epic, by story 10.17's AC-22 repair one level
down: **make the unsafe capability unreachable rather than documented.** `LogBuffer` was given a
read-only `LogView`, `RunSnapshot.logs` became the view, the buffer stayed in the closure, and
rerouting a producer around the redactor became a compile error. The same move applies to
`createLogBuffer` itself — stop exporting it from the package surface, or have `append` accept an
already-redacted branded type so that an un-redacted string cannot be passed. Either satisfies the
invariant structurally; the choice between them is the owner's.

**Owner: story 10.18.** Not urgent, and recorded as not urgent.

**Sizing, stated rather than hidden.** §20, §22, O-15 and O-16 all land on story 10.18, which the
manifest already sizes L and whose own subject is a hardened deployment. That is a real addition
and @po should re-check the size at validation rather than inherit it — six consecutive stories in
this epic moved M → L at validation for exactly this cause, an architect ruling landing after the
estimate. The alternative considered was spreading them across 10.11, 10.15 and 10.18; it was
rejected because each additional owner is an additional pin move (§23.2) and an additional false
red.

### 23.2 Two contract edits in wave 6, in this order

Two of the three rulings amend `openapi.yaml`. Each moves the SHA-256 that
`confinement.test.ts:149` pins. The ordering is mandated, and @po is asked to record it as the
wave-6 successor to `FOC-04` and `FOC-05` — the record is @po's; the ordering is this ruling's:

1. **Story 10.18 first** — §20's promotion, §20.4's assertion inversion, §22's description
   correction, one re-anchor. It is the doc-and-runner-only change and it carries no producer work.
2. **Story 10.11 second** — §21's `TestDto` properties plus the Java producer, and a second
   re-anchor read fresh from the file.

The reverse order is forbidden for the reason `FOC-04` gives: it would force a frontend/backend PR
whose subject is the review surface to re-anchor a runner test **and** to invert an assertion about
`RunnerEvidence` that belongs to a ruling it is not implementing.

**And the standing rule that prevents a fourth instance of this:** no wave-6 story may assert
`openapi.yaml` byte-unchanged unless it merges before step 1. A story that wants to state *I made
no contract edit* after these land should assert it over its **own diff** — the file is absent from
the change set — which is the claim actually being made, and which no other story's legitimate
amendment can falsify. That is the narrower control §23.1's closing paragraph argues for, and
wave 6 is where it stops being free advice.

### 23.3 What was measured, and what was not

**Measured, in this worktree, at `52af70c93`:**

- `shasum -a 256 docs/specs/studio/openapi.yaml` → `cbf07c99…f412e`, identical to `BASE_SHA256` at
  `confinement.test.ts:149`. `FOC-05`'s premise still holds; story 10.17 merged at `c54df7934`
  without moving it.
- Story 10.10's reachability property, re-computed over **every tag** in the document with the
  story's own `isReachable` and `requiredRequestFields` logic (§21.5's table), plus two
  simulations: `currentCandidateArtifactHash` empties the `tests` list, and so does
  `supersededRevisionArtifactHash` (§21.4).
- Every code fact in §20.1, §22.1 and §23.1, by reading the merged files at the line numbers cited.

**Not measured, and the reason is not a caveat at the end:** **no test suite was run for this
amendment.** `node_modules` is absent from `studio-runner/` and from `frontend/` in this worktree,
so neither `npm test` nor `npx vitest run` can start, and no Gradle run was attempted. Every
before/after figure in this amendment's three §13 rows is therefore a **prediction derived from
reading the assertions**, not a reading — including the `test/contract.test.ts` 14/14 that §20.8
predicts. §12's fourth requirement is met by the named owner, who runs the suites over the diff and
replaces the prediction with the measurement in the same PR. This is the first amendment in this
document that could not measure its own effect, and it says so here rather than letting a
confident-looking table imply otherwise.

**All three rows have since been measured, and this paragraph would otherwise be the stale half.**
Story 10.18a landed §20 and §22 at `dc0c30089` and replaced both §13 cells with readings: every
predicted figure reproduced, including the `test/contract.test.ts` 14/14 and the
`confinement.test.ts` **2 red**. Story **10.11c** landed §21 at `4157d7f62` and replaced the third,
measuring it the same way — by restoring the pre-edit document and re-running with the story's
final test files. Both of this row's predictions reproduced: `studioEscalation.test.ts` went 2/3 →
3/3 with the file byte-unchanged, and `StudioContractTest`'s set-equality assertion was red until
`UITestDto` gained the same two components. `FOC-06` closes with that re-anchor.

### 23.4 Open items after this amendment

| Item | Status at `52af70c93` |
|---|---|
| **O-6** | Still open, unchanged. Destination policy on the job envelope is 10.18's (SPK-05). Untouched here. |
| **O-9** | Still open, still landable under §14.7's pre-ruling. Untouched: this amendment declares no `409` and no conflict code. |
| **O-10** | Still open and now **overdue by a wave**. `400` versus `404` for an unknown, deleted or quarantined draft on `GET`/`PUT`/`DELETE /tests/{id}`. It was deliberately not folded into §16 to keep that measurement unambiguous, and it is deliberately not folded into §21 for the same reason — §21 adds fields to a `200`. It needs its own ruling on its own before/after, and it should have one before the pilot. |
| **O-11** | **Closed.** The `error_code` CHECK landed with story 10.14 at `ded3d45fb`, on the migration §18.2 re-pointed it to. |
| **O-12** | Still open, still story 10.11's, and **reinforced** by §21.6: it is what 10.11 should spend its document-reading edit on instead of widening story 10.10's reachability assertion. |
| **O-13** | **Closed.** Both halves landed with story 10.14 at `5e72fdf2b` — the projection stops writing `Boolean.FALSE`, and the timed-out step's message is synthesized where a terminal `TIMEOUT` meets a step still `RUNNING`. |
| **O-14** | **Ruled and authorized (§20), not yet landed.** Owner re-pointed from §18.4's formula — which defers forever now that 10.14 has merged and no wave-6 story touches `RunnerEvidence` — to story **10.18**, first in the wave-6 ordering (§23.2). |
| **O-15** *(new)* | The runner's `ACCEPTED_JOB_KEYS` is not pinned against the frozen `RunJob`; the only assertion over it is a hand-maintained count. The remaining half of `DEF-01`'s cause. Form stated in §23.1. Owner: story **10.18**. |
| **O-16** *(new)* | `createLogBuffer.append` truncates before redacting and states its redact-first requirement in a comment; one production caller honours it, and the factory is exported from the package surface. Latent, not live. Close it structurally, as story 10.17's AC-22 repair did one level down. Owner: story **10.18**. |
| **O-17** *(new)* | Story 10.10's AC-11(b) and AC-16(b) are *skipped, never passed* in a **merged** story, and §21 unblocks both. Whether they are re-opened, carried by story 10.11 with the producer, or split into a follow-up is @po's routing decision, not an architect's. Raised here so it is not lost between a closed story and an open one. Owner: **@po**. |

### 23.5 What this amendment does not do

It changes no story's Title, Acceptance Criteria, Scope or Status. Story 10.14's AC-26 is **closed
by §20's ruling rather than by an edit to the criterion** — condition (iii) is now met, and whether
the checkbox moves, and whether a criterion recorded *skipped, never passed* in a merged story is
re-opened or carried forward, is @po's call. Story 10.10's AC-15 is **closed by §21** on the same
terms, and its AC-11(b)/AC-16(b) routing is recorded as O-17.

It edits no `openapi.yaml`, no `artifact.schema.json`, no backend Java, no frontend source and no
`studio-runner/` source. Under §19 that is the point: the three authorized edits belong to the two
named stories, whose diffs are responsible for them and whose gates run over them.

---

# Amendment, 2026-09-16 (seventh) — the video route's refusals, the envelope behind them, a seek margin, and O-10

Added on `arch/epic10-rulings`, branched from `epic/EPIC-10` at `f1d7968df`. Three questions were
in the queue. Wave 7's run log calls them *"ESC-1 + DEF-09(b) as one question; F-5; O-10"*. They
are answered together because two of them touch `openapi.yaml`, and a separate program has an
uncommitted edit to the same file (§28).

**This amendment edits no contract.** Under §19 it rules on the edits, marks them `AUTHORIZED, NOT
YET LANDED` in §13, and leaves the diffs to the owners it names. One thing surfaced while
answering O-10 that was not asked: a missing authorization check on three write routes. It is
recorded as O-18 (§27.3). It is the most urgent item in this amendment.

## 24. INT-11 — `getExecutionVideo`'s refusal surface (closes ESC-1 and ESC-2)

### 24.1 The facts, read at `f1d7968df`

| Fact | Evidence |
|---|---|
| The operation declares `200`, `206`, `404`, `410`, `416`. `getExecution` and `streamExecution` both declare `401` and `403`, and both use `$ref` to `components.responses.Unauthorized` and `Forbidden`. | `openapi.yaml:643-791` |
| The route's first action is `studioService.findExecutionById(executionId, auth)`, the snapshot route's own authorized read. An unknown id and a CSI the caller may not read both throw `StudioAccessDeniedException`, which becomes `403 {"error":"STUDIO_FORBIDDEN","message":"You do not have access to this Studio resource"}`. | `ExecutionVideoService.java:95`, `StudioService.java` `findExecutionById(UUID, Authentication)`, `ChecksExceptionHandler.java:67-83` |
| `404`, `410`, `416` and the unreachable-store answer are all raised *after* that read. | `ExecutionVideoService.read` |
| An unreachable store is answered `503` with `VIDEO_STORE_UNAVAILABLE` and a message that names no bucket, endpoint or key. The cause is logged and never sent. | `ExecutionVideoException.storeUnavailable()`, `ExecutionVideoService.unreachable` |
| A caller with no identity never reaches the handler. `BffSessionAuthenticationFilter` answers `401` for every `/api/**` path, with a body whose `error` is an object (§25). | `BffSessionAuthenticationFilter.java:75,101,248-256` |
| `ExecutionVideoEvidenceIT.anUnreachableStoreAndAnAbsentObjectAreDifferentAnswers` checks only that the answer is *not* `404` and has a different code. It does not name `503`, because the status was never ruled. | `ExecutionVideoEvidenceIT.java:541-563` |

### 24.2 Ruling

**`getExecutionVideo` declares `401`, `403` and `503`.** `401` and `403` use `$ref` to the same
components as the sibling routes: `SessionUnauthorized` (after §25's edit, which the sibling
routes get in the same PR) and `Forbidden`. `503` uses `ErrorResponse`, with one example carrying
`VIDEO_STORE_UNAVAILABLE`. The operation description states the refusal order: authentication,
then authorization, then evidence state, then the store. It also says that `404`, `410`, `416` and
`503` can only happen after authorization.

This declares behaviour that is already shipped and tested. It chooses nothing new, apart from the
`503` that ESC-2 asked for.

### 24.3 Why `401`/`403` by `$ref`, and why there is no `404` for "not yours"

Architecture §9.1 names videos and downloads among the resources readers may view for their CSI
and nobody else may. §6.3 says the route "checks the execution's immutable CSI". Story 10.7 AC-4a
fixed the wire form for every per-id Studio read: one `403` for "forbidden" and "absent" alike.
The route already does exactly this, because it reuses the snapshot route's read. So the
declaration has to be the siblings' own, by `$ref`. A route-local copy would drift on the first
edit to either.

`404` stays declared, and the description now says what it means: *the caller may read this
execution, and it has nothing to serve*. That is safe because it is only reachable after
authorization. Using `404` for an unknown id as well would be the existence oracle that AC-4a
exists to prevent. The MSW mock currently makes exactly that choice (§24.5), because until now
`404` was the only declared refusal.

### 24.4 Why `503` for an unreachable store

| Option | Verdict |
|---|---|
| **`503 Service Unavailable`** | **Ruled.** The condition is transient and belongs to the server: this service cannot serve the resource right now, and a later request may succeed. The document already uses `503` for exactly that on `executeTest` and on two runner routes. The code has shipped it since 10.15. |
| `404` | Rejected. 10.15 AC-17 already says why: it states a fact about the run (*no evidence*) that the API has not observed. A client would show "no recording" for a recording that may exist. |
| `500` | Rejected. It is unclassified. A client cannot tell "try again" from "this is broken", and the difference is the whole point of ESC-2. |
| `502` / `504` | Rejected. `502` means the upstream answered with something invalid, which is not what "could not be reached" means. `504` covers only the timeout case. Splitting the two would put store internals on a public route. One status covers every unreachable-store cause, and the log keeps the detail. |
| `200` with an empty body, or a `Retry-After` made mandatory | Rejected. The first is a false success. The second is invented, since the code sends no `Retry-After` and no source requires one. A later story may add the header, but that would be a new declaration, not something implied here. |

The `503` description also says that a `503` written by the platform authentication layer before
authorization has that layer's envelope, not `ErrorResponse` (§25, O-19). So one status on this
route can carry two bodies depending on where it was written. The description says so rather than
leaving clients to find out.

### 24.5 What changes for story 10.16a

**Its production code does not change.** AC-11 (never read, branch on or render this route's
body) is still right, and after §25 it matters more: whatever parses the `401` body gets a
different shape from every other refusal. A `<video>` element and a download navigation expose
neither the status nor the body. AC-12's single generic message is still the only honest UI.

**Its mock and two of its tests do change. Both break by design, and both are false reds in a
merged story that did nothing wrong** (the shape behind `FOC-04`/`FOC-05`):

1. `frontend/src/services/mocks/studio/handlers.ts` `serveExecutionVideo` answers `404` for an
   unknown id and for an execution on an unreadable CSI. Under this ruling both should be
   `403 {"error":"STUDIO_FORBIDDEN","message":"You do not have access to this Studio resource"}`,
   matching the backend byte for byte, and the doc comment saying the mock "serves no `401` and no
   `403`" gets rewritten. The mock serves **no `401`**: the envelope question (§25) is not
   settled for Epic 10, and MSW has no notion of an absent session. It needs **no `503`** either,
   since nothing in the frontend can observe it.
2. `studioContract.test.ts`, *"every status the route produces over the whole fixture set is
   declared"*: `expect(declared).not.toContain('401')` and `…('403')` go red when the document
   changes. After the mock change, the literal `['200','206','404','410','416']` becomes
   `['200','206','403','404','410','416']`. The file's own comment already expected this (*"a
   ruling on ESC-1 that declares `401`/`403` changes this set"*). It changes the *declared* set
   without an edit. The two negative assertions still need removing by hand.
3. `studioVideoHandler.test.ts:122-125`, *"serves no 401 or 403: another CSI's execution is the
   declared 404"*, goes red after the mock change. It becomes *"another CSI's execution is the
   declared 403, never its bytes"*.

Ajv validation of the mock's refusal bodies against `ErrorResponse` stays as it is, and the new
`403` body passes it.

### 24.6 The authorized edit, exact text

In `paths./executions/{id}/video.get.description`, after the existing two lines:

```yaml
        **Refusal order (ADR-002 §24).** Authentication, then authorization, then evidence state,
        then the store. `401` and `403` are decided before anything about the recording is read,
        so an unknown execution id and an execution on a CSI the caller may not read both answer
        `403 STUDIO_FORBIDDEN`, exactly as `getExecution` does. `404`, `410`, `416` and `503` are
        reachable only after authorization and disclose nothing to a caller who could not read
        the snapshot.

        Branch on the status, never on the body. A `<video>` element and a download navigation
        expose neither, and the `401` body is the platform envelope, not `ErrorResponse`
        (ADR-002 §25).
```

Between `'206'` and `'404'`:

```yaml
        '401': { $ref: '#/components/responses/SessionUnauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
```

After `'416'`:

```yaml
        '503':
          description: |
            The evidence store could not be reached, so the recording's disposition is unknown.
            Deliberately not `404`, which would state a fact about the run that the API has not
            observed. Transient: a later request may succeed. The body names nothing about the
            store — no bucket, endpoint or key. A `503` written by the platform authentication
            layer before authorization carries that layer's envelope instead (ADR-002 §25).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ErrorResponse' }
              examples:
                storeUnavailable:
                  value: { error: VIDEO_STORE_UNAVAILABLE, message: "The evidence store could not be reached; the recording's disposition is unknown" }
```

### 24.7 Tests: what flips, what the owner changes, what is new

| Test | Effect | Owner's action |
|---|---|---|
| `ExecutionVideoContractEscalationTest` (both) | red → **green, test unchanged** (simulated) | Update the class Javadoc, which says "DELIBERATELY RED". Keeping it as a permanent conformance test is worthwhile; dropping `Escalation` from the name is optional housekeeping, as §15.8 item 1 said for its sibling. |
| `ExecutionVideoContractTest.theVideoOperationsStatusSetIsUnchanged` | green → **red** (simulated) | A deliberate hand-kept copy. The owner updates the literal to `200, 206, 401, 403, 404, 410, 416, 503` and the reason text. |
| `StudioContractTest.noOperationsStatusSetOrMarkerMovedWhileTestDtoGainedTwoProperties` | green → **red** (simulated) | Same. The video row becomes `200,206,401,403,404,410,416,503`. The file itself says to update such entries "deliberately, in that story's PR". |
| `confinement.test.ts` `BASE_SHA256` | green → **red** (by reading) | Re-anchor by re-reading `shasum -a 256` from the file. Never transcribe the digest (§20.7 item 3, and §28 for the ordering with 10.20). |
| Frontend: the two assertions in §24.5 | green → **red** (by reading; not run) | As §24.5 says. |
| `ExecutionVideoEvidenceIT.anUnreachableStoreAndAnAbsentObjectAreDifferentAnswers` | stays green | **Strengthen it:** now that the status is ruled, assert `503`, the code `VIDEO_STORE_UNAVAILABLE`, and that the body validates as `ErrorResponse`. Keep the not-`404` assertion next to them. |
| **New**, `ExecutionVideoContractTest` | — | Check that `401` and `403` on the video route have the **same `$ref`** as on `getExecution`, by comparing the two, not against a literal. A route-local copy then fails. |
| `ExecutionVideoAuthorizationIT` | unaffected | Its `401` row already expects the filter's envelope and normalises `traceId` (DEF-09(a)). |

## 25. The `401` envelope is not the video route's problem — it is backend-wide

### 25.1 The facts, read at `f1d7968df`

| Fact | Evidence |
|---|---|
| `BffSessionAuthenticationFilter` runs on **every** `/api/**` request. It writes `401 {"error":{"code":"UNAUTHENTICATED","message":"Session required","traceId":"…"}}` and `503 {"error":{"code":"AUTH_TEMPORARILY_UNAVAILABLE",…}}` with `Retry-After: 5`. | `BffSessionAuthenticationFilter.java:75-106,248-270` |
| `RateLimitFilter` (`429 RATE_LIMITED`) and `IdempotencyFilter` use the same nested shape. The idempotency body has no `traceId`. | `RateLimitFilter.java:152-154`, `IdempotencyFilter.java:197-198` |
| `ChecksExceptionHandler` writes the **flat** shape `{"error":"<CODE>","message":"…"}` for every controller in the application, Studio and non-Studio. | `ChecksExceptionHandler.java` |
| The backend specification says the nested shape is the error envelope, *"uniform across all endpoints"*. Story 1.5 AC-5 fixes the `401` bytes in that shape. | `docs/specs/backend/spec.md` §6.1 (`CON-API-03`); `docs/stories/1.5.story.md:44` |
| The Studio contract (story 10.1) declares `components.responses.Unauthorized` with the flat `ErrorResponse`. **Thirteen** operations use it: the **eleven** public ones, plus the two internal callbacks. | `openapi.yaml:1292-1296`; `$ref`s at lines 141 … 721, 1006 and 1155 |
| The internal callbacks' `401`/`403` come from a different filter, `ServiceIdentityAuthenticationFilter`, which writes the **flat** shape `{"error":"SERVICE_IDENTITY_REQUIRED","message":"A valid service identity is required"}`. So `Unauthorized` is **correct** for those two operations and wrong for the eleven public ones. | `ServiceIdentityAuthenticationFilter.java:94-101`; `StudioInternalSecurityConfig.java:93-106` |
| Before story 10.18b closed the bypass, no `401` could be produced anywhere, so the declaration was never tested. The first real `401` is the one DEF-09(b) read. | run log, *DEF-08* and *DEF-09* |
| The studio-inference program's uncommitted `inference.openapi.yaml` points its `401` at the same flat `ErrorResponse`. (Read-only, in `wt/epic`.) | `inference.openapi.yaml:40-45` |

### 25.2 Ruling — backend-wide, and not decidable in this ADR

**The divergence is not local to the route.** Every public Studio operation that declares `401`
declares a body its only producer has never sent. The cause is not Studio code. The application
has **two error envelopes by layer**: servlet filters write the nested one, which the backend spec
calls the standard, and controller advice writes the flat one, which the frozen Studio contract
declared. ESC-1 exposed it on one route only because that route was the first to be tested with
no identity.

**Which envelope wins is a backend-wide architecture decision, not an Epic 10 one.**
Standardising on nested changes every Studio refusal body the MFE parses, plus every non-Studio
controller's body. Standardising on flat changes a filter whose bytes story 1.5 fixed, and which
the shell's `put:auth:unauthorized` path depends on. Either way the change reaches beyond the
Studio contract and should not be made inside it.

**Ownership:** the decision belongs to **@architect**, as its own record (**ADR-003 — API error
envelope**). It needs **@pm**, who owns `docs/specs/backend/spec.md` and `CON-API-03`, and sign-off
from the frontend consumer. **@pm and @po** place the implementation in a backlog outside Epic 10.
It is recorded as **O-19** so it stays visible. It does not block Epic 10: no Studio client parses
a `401` body (§25.3).

### 25.3 What Epic 10 does meanwhile — make the document tell the truth

**The public `401` declares the envelope its filter actually sends.** A new response component,
`SessionUnauthorized`, carries a new schema, `PlatformErrorResponse`, and all eleven public
operations point their `401` at it. `Unauthorized` itself is **not** changed, because its other
two users, the internal callbacks, get exactly the flat body it declares. Changing the shared
component would have fixed eleven declarations and broken two; that was this amendment's first
draft, and the simulation in §28.4 was re-run after the correction. `ErrorResponse` stays for every
Studio refusal. `SessionUnauthorized`'s description says in plain words that the two envelopes
differ and that clients should branch on status.

This is right whichever way ADR-003 goes. If nested wins, `PlatformErrorResponse` becomes the one
schema. If flat wins, the filter changes and the eleven `$ref`s go back to `Unauthorized` in the
same PR. Until then, the document stops stating something false. It costs one component and no
behaviour change. By reading, no suite validates a `401` body against the document: the transport
tests stub their own `401` bodies, and `apiClient`'s interceptor branches on
`error.response?.status` (`apiClient.ts:69`). That the interceptor never parses the body is
**inferred** from the lines read, not proven.

Not done here: declaring the filter-written `429 RATE_LIMITED`, the `503
AUTH_TEMPORARILY_UNAVAILABLE` and the idempotency errors on every operation that can emit them.
That would add statuses to eleven operations mid-epic, for a layer ADR-003 is about to rule on.
Recorded as part of **O-19**.

### 25.4 The authorized edit, exact text

In the public half of `paths` (above the *Internal surface* banner), replace each of the eleven
`'401': { $ref: '#/components/responses/Unauthorized' }` with
`'401': { $ref: '#/components/responses/SessionUnauthorized' }`. Leave the two under
`/internal/studio/...` unchanged. Then add, directly after `components.responses.Unauthorized`,
which also stays unchanged:

```yaml
    SessionUnauthorized:
      description: |
        No authenticated user session on a public route. Answered by the platform authentication
        filter on every `/api/**` path before any Studio code runs, so the body is
        `PlatformErrorResponse` and **not** `ErrorResponse`: `error` is an object here and a
        string on every Studio refusal. Branch on the status. Unifying the two envelopes is
        outside this document (ADR-002 §25). The two internal callbacks keep `Unauthorized`,
        whose producer is the service-identity filter and whose body is `ErrorResponse`.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/PlatformErrorResponse' }
          examples:
            sessionRequired:
              value: { error: { code: UNAUTHENTICATED, message: Session required, traceId: 4bf92f3577b34da6a3ce929d0e0e4736 } }
```

Add, directly after `components.schemas.ErrorResponse`:

```yaml
    PlatformErrorResponse:
      description: |
        The envelope the application's servlet filters write — authentication, rate limiting and
        idempotency — as opposed to a Studio handler's `ErrorResponse`. Backend spec §6.1
        (`CON-API-03`) and story 1.5 AC-5. `traceId` differs on every request and is absent from
        some filters' bodies.
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }
            traceId: { type: string }
```

`traceId` is optional because `IdempotencyFilter` omits it. The schema stays open, like
`ErrorResponse`, because it describes a layer this ADR does not govern. The owner validates the
example against the schema with Ajv before running the suites (§18.5's rule).

## 26. F-5 — the seek margin, and F-4

### 26.1 The facts

Read from the 10.16b gate and from `seek-measurement.test.ts`. **The measurements are @dev's and
@qa's. This amendment ran no fixtures-tier test.**

- Once attribution is correct, the per-run median error is 62.8 ms (@qa) and up to 70 ms (@dev),
  against `MEDIAN_TOLERANCE_MS = 100` (`:84`). The largest single lead is 75.1 ms (@qa) and
  85.3 ms (@dev).
- **The lead always has the same sign.** In every mis-attribution both observers recorded (27 of
  27), the repaint's frame timestamp is *earlier* than the step's reported start. The helper finds
  the repaint only because `slackMs` (100) is at least the tolerance, and F-1's boundary test in
  `webm.test.ts` now guards that.
- A lead above 100 ms would make the matcher skip the repaint and match the next change about one
  cadence later. The failure would then report **+400 to +650 ms instead of the true −110 ms or so**
  (F-5's own text), which points diagnosis the wrong way.
- The file's cause comments at `:43-48` and `:72-75` blame a repaint split across frames or a
  missed match. That explained none of the 27 cases (F-4).

### 26.2 What the margin is — an inference, labelled

A repaint happens *after* its step starts, since the click comes after `startedAtMs` is read. Yet
the recording shows it *earlier*. So the recording's timeline starts **later** than the run clock's
zero, by at least the lead. That is exactly the gap §11.6 item 3 predicted: *"context readiness is
a proxy for the recorder's first frames, not the same instant"*. **The 63-85 ms margin is most
likely the readiness-to-first-frame gap (AC-12c's subject), seen on developer machines. It is a
systematic offset, not noise.** This is inferred from the sign and the size of the lead. A laptop
cannot measure it cleanly (`:26-30` is still right about that), and no decoder was used.

### 26.3 Ruling

1. **`MEDIAN_TOLERANCE_MS` stays 100. `slackMs` stays at or above it. Neither is widened, for any
   reason.** @po's standing constraint is upheld. A later calibration may justify *tightening*.
   Nothing justifies widening.
2. **The remedy is calibration, in the runner, where §11.2 and §11.6 already put it.** A measured
   constant is added to the origin inside `takeRunOrigin` (`studio-runner/src/run/timeline.ts`),
   so the zero is recording-context readiness plus the gap. It never goes on the wire, never into
   the API (§11.7 item 1 forbids that) and never into the test.
3. **The constant is per image and comes from configuration.** It is a runner setting with default
   `0`, and its value comes from **SPK-06 phase B**, measured on the pinned image in staging (the
   AC-12c evidence), recorded in `docs/qa/spikes/SPK-06/` with the measurements behind it. It is
   configuration and not a literal because the gap depends on the host, which is F-5's own
   finding. A literal would be right on one machine and wrong on every other.
4. **When to apply it.** Add the constant only if the staging gap (a) has the same sign on every
   measured step and (b) has a median larger than its run-to-run spread. Only then does
   subtracting it reduce error instead of just shifting it. Otherwise apply nothing and use
   SPK-06's fallback: report the measured tolerance and state the calibration limit.
5. **The fixtures tier always runs with the constant at `0`.** It then keeps measuring the raw gap
   on whatever host runs it, which is the signal F-5 is about. A laptop value must never be put
   into the constant, because `:26-30` is right that a laptop cannot separate the gap from its own
   scheduling noise.
6. **A genuine failure on a slower host stays red.** Nobody widens a bound, skips the file,
   retries until green, or excludes the host. Whoever sees it files the `SEEK` table, the captured
   recording, the **signed distance from each reported start to the nearest earlier change**, and
   the host description, as SPK-06 evidence (phase A data point: *the gap depends on the host*).
   If that host is a gating CI image (ED-05), the fix is item 3's constant, measured for that
   image and recorded, not a change to the bound. A calibration corrects the reported value and
   leaves the tolerance just as strict. A tolerance change moves the bar. Only the first is allowed.

### 26.4 Before 10.19 — three changes, none of them to a bound

- **(a) The calibration setting.** A runner configuration key (default `0`) applied in
  `takeRunOrigin`, with a test that a non-zero value shifts every reading by exactly that amount
  and that `0` produces byte-identical output to today. Without it, SPK-06 phase B can only
  measure and report, not correct. The key must be added to the runner loader's enumerated,
  fail-closed namespace and to the chart values (10.18's AC-7 discipline). **No contract change.**
  §11.6 item 3 already said so, and this confirms it.
- **(b) The diagnostic.** When the median assertion fails, the message should also include each
  step's signed distance to the nearest *earlier* change, so a lead past the slack reads as about
  −110 ms and not +450 ms. This changes a message, not a bound.
- **(c) F-4's comment correction** (§26.5).

(b) and (c) both edit `seek-measurement.test.ts`. They should be one edit by one owner, and it must
keep the column-0 line `const MEDIAN_TOLERANCE_MS = 100;` byte-identical, because `webm.test.ts`
parses that declaration and fails to load otherwise (integration note, item 1). F-7's optional
tightening of that parse belongs in the same change if anyone takes it. **Owners:** @po routes (a)
and (b)+(c). 10.19 cannot be drafted yet (its drafting gate), so the likely home is a small named
runner follow-up, or 10.19's own conformance pass if its gate clears first. Recorded as **O-20**.

### 26.5 F-4 — who authorizes it, and what it should say

**The edit is @po's to authorize, not mine.** It is prose in a test file that belongs to a merged
story, so it is a story-scope change, and @qa's gate already routed it to @po in `FOC-06` form. What
I rule on is **what the corrected comment should say**. The evidence replaces the file's hypothesis:

- `:43-48`: mis-attribution happened when a repaint was **stamped more than the helper's slack
  before the reported start**, a systematic lead most likely equal to the readiness-to-first-frame
  gap (§26.2). It did not happen because a repaint was split across frames. The two-bound design
  stays, for the same reason as before: a median that one mis-attribution cannot move, plus an
  outlier bound that catches a process-origin reading.
- `:72-75`: the listed +137 … +657.7 ms errors came from the old 60 ms slack skipping a repaint
  that *was* in the recording. The 1500 ms outlier bound still holds numerically (one skipped
  cadence plus one more), and its reasoning should now name the slack, not the detector.
- Say that the systematic part is AC-12c's to calibrate (§26.3), and that a lead above the slack
  shows up as a large positive error.

### 26.6 Alternatives rejected

| Option | Why not |
|---|---|
| Raise `MEDIAN_TOLERANCE_MS` | Loosening a test's bar to silence a real, measured offset. @po's constraint, and §12's third rule one level down. |
| Raise `slackMs` to leave headroom | The lead would still count in full against the median, so it buys nothing against F-5. It can also only rise to 320.7 ms before it matches a spurious change backwards (`webm.ts`). |
| Derive the constant from laptop runs now | `:26-30` already rules this out. It would also bake one host's gap into a value used everywhere. |
| Calibrate each run by painting a marker at the origin | It alters the page under test. Fine on the fixture, but not on a customer application, and §6.4's target is about real applications. |
| Correct it in the API or on the wire | §11.2 and §11.5 already rejected both. |
| Skip the fixtures tier on slow hosts, or retry until green | Both hide the one number SPK-06 needs. |

## 27. O-10 — ruled, and what the reading found

### 27.1 The facts, read at `f1d7968df` — O-10's premise is now out of date

| Route | Unknown id | Soft-deleted / quarantined | Draft on a CSI the caller may not use | Evidence |
|---|---|---|---|---|
| `GET /tests/{id}` | **403** `STUDIO_FORBIDDEN` | **403** | **403** | `StudioService.findTestById(UUID, Authentication)` reads through `@SQLRestriction("deleted_at IS NULL AND quarantined_at IS NULL")` and throws `StudioAccessDeniedException`. `StudioVisibilityIT` asserts `403` for quarantined and for soft-deleted, *"403, not 400"*. |
| `PUT /tests/{id}` | **400** `BAD_REQUEST` *"UI Test not found: {id}"* | **400** | **No check.** The save goes through. | `updateTest(UUID, UITestRequest, Authentication)` uses `auth` only to attribute the compile it queues. No `requireRead`/`requireCompile` call. `StudioController.updateTest` has no annotation. |
| `DELETE /tests/{id}` | **400** | **400** | **No check.** The draft is soft-deleted, `204`. | `StudioController.deleteTest(@PathVariable UUID id)` takes **no** `Authentication`. `softDeleteTest(UUID)` has no check. |
| `POST /tests` | — | — | **No check.** The draft is created under any *registered* CSI. | `createTest` calls `extractIdentity` and `requireRegisteredCsi` only. |

`SecurityConfig` requires `.authenticated()` on `/api/**`, and `@EnableMethodSecurity` is on.
`StudioController` has no `@PreAuthorize` (@po checked this in 10.7's validation record, and it is
still true). `CsiOwnershipEvaluator.canWrite` exists and is called from `compileTest`,
`confirmCompile` and, via `canExecute`, from `executeTest`, **and from nowhere on create, save or
delete**. Story 10.7 AC-4a says *"Every Studio route enforces identity and CSI permission"*, but
its list covers the reads and `execute` only.

**So O-10's recorded premise is wrong twice.** GET already answers `403`. And *"No security defect
either way: both forms are existence-preserving"* is false for PUT and DELETE. They reveal whether
a draft exists (`400` for absent, `200`/`409`/`204` for present), and they also **let any
authenticated principal edit or soft-delete a draft on a CSI they do not own**.

**What was verified and what was not.** Every row above comes from reading the merged code. **No
request was sent** and no probe was written. The finding is therefore established by reading, and
@qa should confirm it with a failing integration test (§27.5) before anything else lands.

### 27.2 Ruling

**On `GET`, `PUT` and `DELETE /tests/{id}`: an unknown id, a soft-deleted draft, a quarantined
draft, and a draft whose CSI the caller may not read (GET) or write (PUT, DELETE) all get the same
answer, `403 STUDIO_FORBIDDEN`, with no resource detail. These routes never answer `404`. `400` is
only for a malformed request.**

The refusal order follows §14.4's rule: authorization before anything that depends on the stored
row.

1. Checks on the request shape that do not depend on stored state may come first: path-UUID
   syntax, the body schema, the required revisions. Their answer is the same whether the draft
   exists or not, so they reveal nothing.
2. Then the draft is read **through the visibility restriction**. If it is absent, answer `403`.
3. Then `canRead` (GET) or `canWrite` (PUT, DELETE) on **that draft's** CSI. If it fails, answer
   `403`.
4. Then, for PUT, the locked read. A draft that disappeared in between also gets `403`, never
   `400`.
5. Only after that come the revision and CSI conflicts, `409 STALE_REVISION` and
   `409 CSI_IMMUTABLE`.

**The read in step 2 must be the visible one, not `findCsiIdIncludingWithheld`.** That method is
right for compile, where §14.4 has to read withheld drafts to produce `409 TEST_QUARANTINED`. For
save and delete, §14.5 already ruled that a withheld draft is *hidden*, not *in conflict*. If an
owner of a withheld draft passed authorization and then got `400`, the draft would be visible
through its status code.

`POST /tests` must also check `canWrite` on the request's `csiId` (§9.1: owners *create*), after
the registered-CSI check. That check's `400` does not depend on who is asking, so it reveals
nothing about a particular draft.

### 27.3 O-18 — the security finding, recorded with an owner

**O-18 (high; before the credentialed pilot): `POST /tests`, `PUT /tests/{id}` and
`DELETE /tests/{id}` have no CSI write authorization.** Architecture §9.1: *"Owners (or explicitly
authorized platform administrators) may create/edit/compile/confirm/execute. Enforce permission
checks on the server."* The three missing checks sit next to three routes that do have them, and
the same evaluator is already imported.

- **Owner: @po routes it to @dev** as a named story or a named fix PR, ahead of anything else
  here. @qa writes the failing test first.
- **It does not wait on the studio-inference program.** That program's uncommitted tree in
  `wt/epic` (read-only) adds `requireCompile` to `createTest` and `updateTest`. However, `updateTest`
  reads the CSI through `findCsiIdIncludingWithheld`, which contradicts §27.2, and `softDeleteTest`
  is left unchanged. The run log says nothing merges across that line until its owner, @po and @pm
  have reconciled it. Whichever lands second must adopt §27.2's read and must not add a second check.
- **§27.6's contract prose lands in the same PR as the fix.** On its own, the prose would declare
  behaviour the code does not have.

### 27.4 Alternatives rejected

| Option | Why not |
|---|---|
| **`404` for absent, `403` for forbidden** | The two statuses together reveal existence. `StudioAccessDeniedException`'s Javadoc and 10.7 AC-4a both forbid that. |
| **`404` for everything, including forbidden** | A consistent choice some APIs make, but it contradicts the `403` already shipped and declared on `getTest`, `getExecution`, `streamExecution`, `compileTest`, `confirmCompile`, `executeTest` and now `getExecutionVideo`. It would add a status to three operations and change a refusal on six, for no gain in secrecy. |
| **Keep `400`** | `400` means the request is malformed, and a well-formed UUID is not. On PUT and DELETE it currently comes with an existence oracle and no authorization. |
| **`409 TEST_DELETED`/`TEST_QUARANTINED` on PUT/DELETE** | §14.5 already ruled against this. Save and delete hide withheld drafts; only compile, confirm and execute reject them. A lifecycle code here would also have to come after authorization with a read that includes withheld drafts, which is exactly the inconsistency §27.2 removes. |
| **`410 Gone` for soft-deleted** | Tells anyone who can reach the route that a deleted draft existed. |

### 27.5 Tests

- **No status set changes.** `getTest`, `updateTest` and `deleteTest` already declare `403`, and
  `400` stays declared for malformed requests. `StudioContractTest`'s inventory therefore stays
  green. This was simulated together with §24 and §25 (§28.4): the prose edit added no red.
- **New, and they must fail first against today's code** (@qa, then @dev):
  - PUT and DELETE as a principal **without** write on the draft's CSI → `403`, and the row is
    **byte-unchanged** (revisions, `deleted_at`, compile state). This is the security assertion.
    Today it fails with `200`/`204`.
  - POST with a registered `csiId` the principal may not write → `403`, and no row is created.
  - PUT and DELETE on an unknown id, a soft-deleted draft and a quarantined draft, as an
    **administrator** → `403` in all six cases, with identical bodies. Today these are `400`.
  - A non-vacuity control in the same commit: an identity that *can* write gets `200`/`204` on
    the same draft, so the `403`s above cannot pass just because every request is refused.
- **Existing tests at risk, by reading:** those that PUT/DELETE through HTTP as the local profile's
  `checks-admin` identity (`OptimisticSaveIT`, `CsiImmutabilityIT`, `StudioVisibilityIT`) stay
  green, since an administrator passes `canWrite`. `OptimisticSaveIT:113`'s `400` for a body with
  no revisions stays green under rule 1. Service-level callers that pass no `Authentication`
  (`updateTest(UUID, UITestRequest)`) are internal and must stay unchanged. **Predicted, not run.**

### 27.6 The authorized edit, exact text

`paths./tests/{id}.get`, add after `summary`:

```yaml
      description: |
        Authorized against the draft's CSI before anything is returned. An unknown id, a
        soft-deleted or quarantined draft, and a draft on a CSI the caller may not read all answer
        the same `403 STUDIO_FORBIDDEN` with no resource detail. This route never answers `404`;
        `400` is reserved for a malformed request (ADR-002 §27).
```

`paths./tests/{id}.put.description`, append:

```yaml

        Only an owner or an explicitly authorized administrator of the draft's CSI may save. An
        unknown id, a soft-deleted or quarantined draft, and a draft on a CSI the caller may not
        write all answer the same `403 STUDIO_FORBIDDEN` before any revision is compared, and
        nothing is written. `400` is reserved for a malformed request (ADR-002 §27).
```

`paths./tests/{id}.put.responses.409.description`: replace *"so the save resolves as an unknown
test and answers `400`, exactly as it does for an id that never existed."* with:

```yaml
            so the save is refused `403 STUDIO_FORBIDDEN`, exactly as it is for an id that never
            existed or a draft on a CSI the caller may not write (ADR-002 §27).
```

`paths./tests/{id}.delete.description`, replace with:

```yaml
      description: |
        Rejects new execute/compile; authorized history stays readable.

        Only an owner or an explicitly authorized administrator of the draft's CSI may delete. An
        unknown id, an already soft-deleted or quarantined draft, and a draft on a CSI the caller
        may not write all answer the same `403 STUDIO_FORBIDDEN`, and nothing is written. `400` is
        reserved for a malformed request (ADR-002 §27).
```

`POST /tests` needs no prose change. It already declares `403`, and its description does not
mention authorization.

## 28. Sequencing, ownership, and what was measured

### 28.1 The studio-inference program (10.20) and the same file

The program's uncommitted tree in `wt/epic` edits `openapi.yaml` in **five added lines inside
`info.description`** and re-pins `confinement.test.ts` to `09720ae2…` (read with `git diff`, not
changed). The edits authorized here are in `paths./tests/{id}`, `paths./executions/{id}/video` and
`components`. **The two do not overlap textually.** They still conflict on one thing, the SHA-256
pin, so:

1. **Whichever of 10.20 and the §24/§25/§27 PRs lands second re-reads the digest from the file as
   merged** and re-anchors `BASE_SHA256`. Nobody copies a digest from this ADR, from 10.20, or from
   the other PR.
2. **Neither lands on a line that contains the other** until the reconciliation the run log
   requires has happened (*"Nothing merges across that line"*). 10.20 records its own §13 row (the
   user's decision).
3. **For 10.20's coordinator, before 10.20 closes:**
   - `inference.openapi.yaml` points its public `401` at `ErrorResponse`. After §25 it should
     point at `components/responses/SessionUnauthorized` (body `PlatformErrorResponse`).
   - It declares `404` *"Authorized test/request not found"* on `/tests/{id}`, `/compile` and
     `/confirm-compile`. §27 rules `403` for an unknown or withheld draft on the `/tests/{id}`
     family. A `404` that is only reachable after authorization, for a sub-resource such as a
     `compileRequestId` under a draft the caller may read, is compatible. A `404` for the draft
     itself is not.
   - Its `updateTest` authorization read is covered by §27.3.

### 28.2 Order among the three edits here

§24 and §25 are document-only plus test and mock follow-ups, for behaviour already shipped.
§27's prose needs O-18's production fix. **Two acceptable plans. @po chooses:**

- **One PR** (all three edits, one pin move, O-18's fix included). Fewest pin moves, but the
  security fix waits for the frontend mock change.
- **Two PRs:** O-18's fix with §27's prose first, because it is the urgent one, then §24 and §25.
  Two pin moves, each re-read from the file.

**Not acceptable:** landing §27's prose before the fix, or the fix without the prose (the document
would still say `400`).

### 28.3 Owners

| Work | Owner |
|---|---|
| O-18 fix + §27 prose + §27.5 tests | @po names the story; @qa writes the failing test first; @dev |
| §24 + §25 document edits, the two backend literal updates, the strengthened AC-17 assertion, the `$ref`-equality test | @po names the unit. It spans backend tests, the document, the runner pin and the frontend mock, like §21, so it may be one follow-up story |
| §24.5 frontend mock and test updates | the same unit (merged 10.16a is not re-opened, per the O-17 standing rule) |
| ADR-003, the API error envelope (O-19) | @architect decides, with @pm (`CON-API-03`) and the frontend consumer; @pm/@po place the implementation outside Epic 10 |
| O-20 (the calibration setting, the diagnostic, F-4's text) | @po routes; the substance is ruled in §26 |
| SPK-06 phase B, AC-12c measurement and the folding decision (§26.3 item 4) | @qa runs it; @architect signs the record as register owner |

### 28.4 What was measured, and what was not

**Measured, on `arch/epic10-rulings` at `f1d7968df`,** `./gradlew test --offline` for three
classes, contract `51850b01…c02efa`: `StudioContractTest` **14/14**,
`ExecutionVideoContractEscalationTest` **0/2** (both ESC tests red, as filed),
`ExecutionVideoContractTest` **15/15**.

**Simulated, not landed.** The tree's `backend/` and `docs/` were copied into the session
scratchpad, §24.6 and §25.4 were applied to the copy's `openapi.yaml` (digest
`b52e0e59…62277b`), and the same classes plus `CompileRouteContractDivergenceTest` were run: **2/2,
14/15, 13/14, 9/9**. The two reds are exactly the two hand-kept status copies in §24.7. §27.6 was
then applied on top (digest `b524ab8d…0302dc`) and the result was identical: **no additional red**.
A first draft of §25, which changed the shared `Unauthorized` in place, gave the same figures. It
was withdrawn on reading `ServiceIdentityAuthenticationFilter` (§25.1), not because of a test: no
test reads a `401` body shape. That gap is the reason the draft could have landed.
`CompileRouteContractDivergenceTest` on the unmodified copy: **9/9**. The copies are digests of a
scratch file, **not** values for anyone to pin. The owner re-reads the real file.

**Not run:** the frontend suite and the runner suite (`node_modules` is absent in this worktree),
any fixtures-tier seek run, and every behaviour test in §27.5. Every frontend and runner effect in
§24.7 and §27.5 is **predicted by reading the assertions**. The O-18 finding is **established by
reading the code, not by a request**.

### 28.5 Open items after this amendment

| Item | Status at `f1d7968df` |
|---|---|
| **O-6** | Unchanged; 10.18's (SPK-05). |
| **O-9** | Still open. The three internal `409`s still declare no `x-conflict-codes` (`openapi.yaml:917,1013,1163`). §14.7's pre-ruling stands. |
| **O-10** | **Ruled (§27).** Prose authorized; it lands with O-18's fix. The line in 10.19's drafting gate is now satisfied as far as a *ruling* goes. Its before/after is §28.4's simulation, and the owner's measurement replaces it. |
| **O-12** | By reading, landed: `studioContract.test.ts:456-465` checks `ExecutionErrorCode` against the document in both directions. |
| **O-14** | Landed (§13, 10.18a). |
| **O-15** | By reading, landed: `test/contract.test.ts:360-375` checks `ACCEPTED_JOB_KEYS` against `RunJob` for set equality. |
| **O-16** | By reading, landed: `createLogBuffer` is no longer exported (`src/reporting/index.ts:32`). |
| **O-17** | Routed by @po (§13's 10.11c row). |
| **O-18** *(new, high)* | `POST /tests`, `PUT /tests/{id}` and `DELETE /tests/{id}` have no CSI write authorization (§27.3). Before the credentialed pilot. Owner: @po → @dev, with @qa's failing test first. |
| **O-19** *(new)* | The application has two error envelopes, split by layer. ADR-003 is needed (§25.2). This also covers the filter-written `429`, `503 AUTH_TEMPORARILY_UNAVAILABLE` and idempotency errors, which no Studio operation declares. Owner: @architect with @pm. Does not block Epic 10. |
| **O-20** *(new)* | Before 10.19: the runner's calibration setting (default `0`), the signed-lead diagnostic, and F-4's corrected comments (§26.4, §26.5). Owner: @po routes. |
| **ESC-1 / ESC-2 / DEF-09(b)** | **Ruled (§24, §25).** Edits authorized; red until the owner lands them. |
| **F-5** | **Ruled (§26).** No bound moves. |

### 28.6 What this amendment does not do

It changes no story's Title, Acceptance Criteria, Scope or Status. It edits no `openapi.yaml`, no
`artifact.schema.json`, no backend Java, no frontend source, no `studio-runner/` source, no test and
no run log. It does not change the SPK-06 register. §26.3's calibration method belongs in that
register's *Shapes* line, and the register owner should add it when SPK-06 phase B is scheduled.

---

# Amendment, 2026-09-18 — Studio v1 WP4: a real cancel

## 29. Cancel: the route, the runner's `DELETE`, and `CANCELLED`

### 29.1 What changed and why

Stop used to end only the browser tab's interest in a run. Studio v1 decision **D4** makes it end the
run: graceful stop with a 5 s grace, then the process tree; the outcome is `ERROR` / `CANCELLED`.
The contract gains two operations and one code (the §13 row above lists them).

### 29.2 The rules the implementation holds

1. **One compare-and-set decides a cancel** (`StudioDispatchLedgerStatements.requestCancel`). Its
   predicate is the whole precondition: the row is `QUEUED`, `CLAIMED`, `DISPATCHING`, `ADMITTED`
   or `RUNNING`, and `cancel_requested_at IS NULL`. A second cancel therefore matches nothing and
   answers `409 CANCEL_ALREADY_REQUESTED`; a finished or finalizing run answers `409
   EXECUTION_TERMINAL`.
2. **Queued work closes at once** — `QUEUED`/`CLAIMED` → `DONE`, history `ERROR` / `CANCELLED`, one
   revision. No runner is called: a dispatcher holding the claim fails its own `beginDispatch`.
3. **The admission CAS refuses a marked row** (`AND cancel_requested_at IS NULL` on `admit`). A
   cancel landing between the send and the admission is refused before any browser starts; the
   refusal closes the execution `ERROR` / `CANCELLED` and answers `EXECUTION_SETTLED`.
4. **Admitted and running work is stopped by the runner that holds it, which pulls the cancel**
   (amended the same day, §29.4). Two pull signals, no routing: the owning runner reads
   `GET /internal/studio/executions/{id}/control` every 2 s from admission until its outcome is
   known, and every progress acknowledgement carries `cancelRequested`. The relayed
   `DELETE /v1/runs/{id}` stays as the fast path when the Service happens to route it to the owner;
   it is sent once per dispatcher pass until the runner answers `202` or `409`
   (`cancel_relayed_at`). A `404` is **not** an acknowledgement. `DISPATCHING` rows are never
   relayed; no runner holds them.
5. **The runner reuses the deadline's stop path**: `SessionKillReason` gains `cancel`, mapped to
   failure kind `cancelled` and code `CANCELLED`. The reason is recorded before the signal.
6. **The API assigns its own `CANCELLED`.** A runner's `CANCELLED` becomes the API's only when the
   ledger records a request (`RunnerOutcomeCodes.errorCodeFor(…, cancelRequested)`); otherwise it
   takes the unmapped path like any other runner code. `cancel_requested_at` is write-once, so
   reading it before the report statement cannot be contradicted by it.
7. **A run cancelled before it reported a start may still report.** The `FINAL` statement accepts
   `ADMITTED` (edge `ADMITTED → FINALIZING`) only when the ledger records a cancel; every other
   report still needs `RUNNING`.
8. **The running reaper bounds everything else**: a cancel still dispatched once `start-deadline`
   has passed since it was requested is closed `ERROR` / `CANCELLED` (manifest reconciliation
   first, as for every reaper verdict).

### 29.3 Known limits, stated rather than hidden

- **Evidence** is whatever the runner already produces on the kill path; no storage was added.
- **Latency is bounded by the poll, not by the relay**: at most one interval (2 s) plus one callback
  round trip, whatever the pod count. If the API is unreachable from the runner for longer than
  the start-deadline margin, the reaper closes the cancel and the browser runs to its own deadline.
- **In-process sessions** (the unit tier's fakes) cannot be stopped mid-step; production sessions
  always run in a child and can.

**Measured, Studio v1 WP11** (`studio-runner/test/fixtures-tier/cancel-real-chromium.test.ts`, real
pinned Chromium in a real child, real fork, real scratch, a local object store; developer laptop,
1280x720 recording; wall clock). These replace the prose bounds above where they are sharper:

| What | Measured |
|---|---|
| Recorded cancel → owner observes it by the real 2 s poll (no `DELETE`) | 1 608 ms and 1 635 ms (two runs, one read each) |
| `DELETE` on the owner → `stop` sent to the child | 1–3 ms |
| Ordered stop → child exit, step stalled 2 s | navigation hung on a black hole: 122–139 ms (n=5, median 130); locator wait: 63–87 ms (n=5, median 66) |
| Ordered stop → child exit, navigation hung for longer | ~1.2 s at 30 s (n=2), ~2.3 s at 60 s (n=2), 4.1–4.6 s at 115 s (n=3); one 115 s run **overran 5 s** when the step's own timeout fired during the close. A locator wait stays under 0.1 s at 100 s. |
| Stop → `FINAL` handed to transport, ordered stop honoured | 45–150 ms |
| Grace exceeded (browser `SIGSTOP`ped): `stop` → tree signal | at the grace, +1 ms (5 001 ms at 5 s; the grace now deploys at 15 s) |

**The grace was raised on that measurement (decision D3).** Closing a context whose navigation is
still pending grows by roughly 38 ms per second the navigation has hung, and a navigation may hang
for the whole runtime cap (a `goto` `timeout` is not clamped below it). So the 5 s of decision D4 is
not enough for the worst case even on a fast laptop, and a pod has at most 2 CPUs. The chart now
deploys `STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS: "15000"`, about three times the laptop worst case;
the runner's own fallback stays 5 s, and `terminationGracePeriodSeconds` is derived from the chart
value, so it follows. **Staging should confirm the bound on a real pod.** The same grace serves the
total-runtime deadline kill, which by construction happens at the longest possible hang.

**Evidence on a cancel, observed.** An ordered stop that completed stored a whole recording
(`STORED`, `partial: false`) on every run. When the grace ran out the suspended recorder had left a
0-byte file, reported `FAILED`, `partial: false`; a readable prefix would have been `partial: true`.

**Reaper margin, not changed here.** The worst case of a cancel is now poll (2 s) + grace (15 s) +
evidence window (15 s) + the first delivery attempt, which can exceed the 30 s `start-deadline` the
running reaper uses for cancels (§29.2 item 8). The outcome is `CANCELLED` either way; the row can
lose the runner's evidence if the reaper wins. That margin belongs to the backend cancel
configuration (plan WP12 / WP16.2) and is flagged rather than moved.

### 29.4 Amendment, same day — the multi-pod gap closed by pulling

The first form of §29 relied on the relayed `DELETE` alone and recorded the multi-pod gap as a
limit. WP7 made `replicaCount: 2` the default, so a `DELETE` through the Service routinely reaches a
pod that does not hold the run; the gap was not acceptable for v1. Closed without new topology — no
headless Service, no pod-IP addressing, no NetworkPolicy change — by making the owning runner pull:

- **`readExecutionControl`** — `GET /internal/studio/executions/{id}/control`, tags `internal`,
  `api-callback`, same service identity and base as the other two callbacks. `200`
  `ExecutionControl {executionId, cancelRequested}` (closed), `400`, `401`, `403`, `404
  EXECUTION_UNKNOWN`. Read-only.
- **`ProgressAck.cancelRequested`** — required boolean, so a runner mid-step learns the cancel on
  its next report without waiting for the poll.
- **Relay semantics tightened in the text**: `404` from the runner is "not this pod", never an
  acknowledgement; only the owner's `202` or `409` records the relay, and only the owner's `FINAL`
  (or the reaper) ends the execution.
- The runner's pull path, the `DELETE` and the drain all end a run through the same `endRun`; the
  kill reason `cancel` and the code `CANCELLED` are unchanged.

### 29.5 Amendment, Studio v1 WP11 — the step a cancel interrupted is `SKIPPED` (decision D1)

**What happened before, measured on real Chromium.** The child's ordered stop closes the context
under the step in flight, the pending Playwright call rejects, and the executor reported the step
`FAIL` with Playwright's text: `page.goto: net::ERR_ABORTED at http://…/never … navigating to "…"`
for a hung navigation, and `AssertionFailed: expected the locator to be visible within 120000ms`
for a locator wait. The first echoes a page address into the report; the second is an assertion
verdict the run never reached. The plan had inferred "Target page, context or browser has been
closed"; the kind was right, the text was not.

**The rule now.** The step that was running when the parent stopped the run **for a cancel** is
reported `SKIPPED`, with `failure` set to the fixed, value-free text
`The run was stopped before this step finished.` and the readings it has: `startedAtMs` always
(it did start, and the recording covers it — it stays seekable), `finishedAtMs`/`durationMs` when
the child lived to report the step, `null` when the grace ran out and the child was killed first.
Steps that never started are untouched: the executor reports them `SKIPPED` with null timings and no
message when the child lives to say so, and they are absent (the API fills `PENDING`) when it does
not. The rule is the runner's, in the parent (`stopAwareReporter`), so it holds on both paths; it is
**scoped to `cancel`** — a deadline or a drain kill is unchanged, and §18.1's `TIMEOUT` message for a
step still `RUNNING` is untouched.

**Contract.** Description text on `RunnerStepState.failure` (no longer "null unless `FAIL`"),
`RunnerStepState.startedAtMs`, `StepResult`, and `runnerCancelRun`. No shape, `required` list, enum
or status moved; the API projects `failure` into `message` verbatim already, so no backend code
changed; the frontend renders the shape as it stands (status, message, timing, enabled seek).

## 30. Readable confirmed source — story 10.27 (2026-09-16)

Aria's bounded contract decision, authorized by the user request to resolve remaining failures:
add `confirmedRevisionArtifact` and `confirmedRevisionArtifactHash` to TestDto. This resolves the
10.11c AC-32 escalation without altering either assertion or confusing the candidate with the
confirmed revision. The existing tests surface remains the owner; no new route is introduced.

Both nullable fields refer only to `confirmedRevisionId`. The artifact uses the existing normative
`artifact.schema.json`; the hash is the persisted canonical lowercase 64-character hash, never
recomputed by a client. Detail/mutation reads fetch the draft and its independently joined confirmed
revision in the same transaction. Null means no readable retained confirmed revision is available.
List projections set both fields to null, preserving their bounded summary role. The v2 TestView
inherits these same TestDto fields. Existing clients tolerate the additive optional properties.

Source and configuration edits, compilation failure and publication of another candidate preserve
the previous confirmed pair. Confirmation changes the pointer and pair together. A stale draft
may show this source as previously confirmed but remains unable to execute until the current
candidate is confirmed. CSI authorization and retention rules apply before exposing any bytes.
Never substitute currentCandidateArtifact when the confirmed pair is missing or the IDs differ.

Frontend Code view renders only this confirmed pair and labels stale source as historical. It
continues to show an unavailable state when the pair is absent; it never invokes client code
creation. A distinct confirmed/candidate fixture and missing-confirmed negative control verify
that candidate source cannot accidentally satisfy this contract. Backend integration tests must
exercise the actual independent join through edits and confirmation, not a DTO with fabricated
matching pointers. This amendment is implementation authority, not a release or QA approval.

## 31. Video error responses landed — story 10.27 (2026-09-17)

This bounded amendment implements the video refusal decision already recorded in §§24/25.
`GET /executions/{id}/video` now declares `401`, `403`, and `503` in addition to its existing
`200`, `206`, `404`, `410`, and `416`. The ESC-1 and ESC-2 status assertions are unchanged.

The declarations follow the actual producers, inspected in this checkout:

| Producer | Status/body | Timing |
| --- | --- | --- |
| `BffSessionAuthenticationFilter.writeError` | 401, nested `{error:{code:UNAUTHENTICATED,message:"Session required",traceId}}` | Before Studio authorization |
| `ChecksExceptionHandler.handleStudioAccessDenied` | 403, flat `{error:STUDIO_FORBIDDEN,message:"You do not have access to this Studio resource"}` | Unknown execution and unreadable CSI are indistinguishable; before evidence access |
| `ExecutionVideoException.storeUnavailable` through `handleExecutionVideo` | 503, flat `{error:VIDEO_STORE_UNAVAILABLE,message:"The evidence store could not be reached; the recording's disposition is unknown"}` | After execution/CSI authorization |
| `BffSessionAuthenticationFilter.write503` | 503, nested `{error:{code:AUTH_TEMPORARILY_UNAVAILABLE,message:"Authentication service temporarily unavailable",traceId}}`, `Retry-After: 5` | Before Studio authorization |

Video 401 references the new `SessionUnauthorized`/`PlatformErrorResponse`; 403 references the
existing flat `Forbidden`/`ErrorResponse`. The old `Unauthorized` component is preserved, because
internal service-identity callbacks actually use its flat envelope. This video-only landing does
not claim that §25's remaining public-route reference migration has also happened; that wider
contract correction and O-19's backend-wide envelope choice remain separate work.

Unlike §24.6's earlier proposed 503 schema, the landed schema declares `oneOf` flat ErrorResponse
and nested PlatformErrorResponse. Prose alone cannot make an otherwise schema-invalid shipped
authentication response truthful. The two alternatives are unambiguous because `error` is a
string in one and an object in the other. Retry-After is optional and documented only for the
authentication-service producer; no retry header is invented for storage failures. Likewise,
only the **storage** 503 requires prior Studio authorization; it would be false to assert that
every 503 on this path occurs after it.

404 continues to mean no evidence for an execution the caller may read; 410 means expired,
and 416 preserves its measured `Content-Range`. Nothing changes authorization, storage behavior,
Range semantics, error handling, runner-produced bodies, or the video UI's inability to inspect
native media/download error bodies. No application rewrite is required for this ruling.

The owner deliberately updates hand-maintained old video-status fixtures and the contract digest
after all amendments are settled, as already authorized in §24.7. Neither escalation assertion is
weakened. This author ran YAML/reference/example validation only; Gradle, frontend behavior tests,
and the final pinned digest belong to the coordinating story execution. Their eventual results
must be reported separately from this architectural decision.

## 32. Test-scoped Studio secrets — studio-vault-secrets (2026-09-22)

Class C (routes, public surface) under §12. Under §19 the architect authorizes it and the
implementing story lands it; the ruling was made in
`docs/specs/studio/vault-secrets/spec.md` §9.1 and is copied here verbatim. The §13 row above
records the landing and its measurements.

**OQ-5: RULED, authorized.** This is a Class C amendment (routes, public surface) under ADR-002 §12. Under §19 the architect authorizes it here and the implementing story makes the edit. That story also records it as ADR-002 §32 plus a §13 row (`AUTHORIZED, NOT YET LANDED` until the edit lands).
- R-5.1 Path `/tests/{id}/secrets`. The path variable is named `{id}` through `$ref: '#/components/parameters/TestId'`, as on every other draft route. Tag `tests`; no new tag; document-level security. operationIds: `listTestSecrets`, `createTestSecret`.
- R-5.2 Status sets: `GET` = `200,400,401,403,503`; `POST` = `201,400,401,403,409,503`. **This amends §3.3.** GET gains `400` because a malformed UUID path variable is a `400` before any handler runs, the same reason `GET /tests/{id}` declares it. `401` → `SessionUnauthorized`; `403` → `Forbidden`; `503` → `ErrorResponse` with `VAULT_NOT_CONFIGURED` / `VAULT_UNAVAILABLE` examples (the `executeTest` precedent; §25's backend-wide envelope question stays separate). The `409` carries `x-conflict-codes: [SECRET_ALREADY_EXISTS]`, as the document requires of every `409`. The `400` description lists the four `INVALID_SECRET_*` codes and states that `403` is decided first.
- R-5.3 Operation count 21 → 23. `StudioContractTest` changes both `hasSize` pins, the expected map and the drift message, in the same PR.
- R-5.4 Schemas: `StudioSecretName {name}` (list item), `StudioSecretList {data}`, `StudioSecret {name, version, allowedOrigins}` (201), and `CreateStudioSecretRequest {name, value, allowedOrigins}` (closed, `value` is `writeOnly`). **This amends §3.3/§5.1:** the list item and the 201 body are different records (`StudioSecretNameDto`, `StudioSecretDto`, plus `StudioSecretListDto`). One record would either emit `"version": null` in the list or fail schema parity. Every schema is added to `theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames`.
- R-5.5 **Digest re-anchor (a finding the spec lacked).** `studio-runner/test/run/confinement.test.ts` pins the SHA-256 of `openapi.yaml`, currently `c6b89138…1088`. The same PR re-anchors it to the value `shasum -a 256` prints once the document is final (ADR-002 §19).

**OQ-3: RULED, split.** In `openapi.yaml:202`, change the example `secretId: vault://studio/pilot-pw` to `LOGIN_PW` in this PR: D9 now refuses that id, and the file is re-anchored anyway. The MSW fixtures (`fixtures.ts:62`, `compileFixtures.ts:90`, `pageSaveAndStop.test.tsx:251`) and `compileStates.test.tsx:301` stay as they are. They never reach the resolver, the flag is off, and changing them is a follow-up.

In the section references above, "§3.3", "§5.1" and "§9" are the spec's own sections, not this
ADR's.

## 33. `RunnerLogEntry.stepIndex` — VAL-012 (2026-10-04)

Class B under §12: a field on a closed runner-produced body. Under §19 the architect authorized it
(`docs/stories/UI-STUDIO-VALIDATION-20261004/VAL-012-014-017-rulings.md`, VAL-012) and VAL-012
lands it. The §13 row above records the landing.

### 33.1 Shape and meaning

- `RunnerLogEntry.stepIndex: { type: integer, minimum: 0, nullable: true }`. **Not** in `required`,
  on the `RunnerEvidence.partial` precedent (§17, §20): optional first, promoted once every producer
  emits it.
- The 0-based position of the step the line is **about**, in the index space of
  `RunnerStepState.stepIndex`. The runner sets it on `step N started` and
  `step N PASS|FAIL|SKIPPED[: …]`, and nowhere else. Run-level lines (browser start, run outcome,
  deadline, upload, evidence) carry `null`. It is never inferred from message text.
- The public `ExecutionLogEntry` keeps its shape (`stepIndex: integer, nullable`). Only its
  description changes: from "always null for runner lines" to "the step the line is about".
  API-produced lines (reaper, evidence updates) stay `null`. No migration: persisted log JSON
  already carries the key.

### 33.2 Validation

A non-null `stepIndex` outside `[0, steps of the confirmed revision)` is `400 INVALID_REPORT`, which
mirrors the existing rule for `RunnerStepState.stepIndex` ("a step index the revision does not have
is a divergence"). It is refused, never silently nulled, because a silent null would hide a runner
bug and loosening is never the safe default under §12. `null` and absence are always valid.

### 33.3 Release constraint — backend before runner

`RunnerLogEntry` is closed on both sides (`additionalProperties: false`;
`@JsonIgnoreProperties(ignoreUnknown = false)`). An old runner against a new backend omits the field,
which reads as `null`: behaviour is unchanged. A **new runner against an old backend is refused**:
the old record rejects the unknown property, every progress and final report fails, and the run is
reaped. This was inferred from `ignoreUnknown = false` and has not been exercised. **The backend must
be deployed before `studio-runner`, or both ship in one release with the backend rolled out first.**
No feature flag: ordering is enough, and a flag would be a second contract.

### 33.4 O-21 — promote `RunnerLogEntry.stepIndex` to `required` (nullable)

Once every producer emits it, `stepIndex` becomes `required` (still nullable), as O-14 did for
`RunnerEvidence.partial`. Owner: the first story that touches `RunnerLogEntry` after this one lands.
The ruling names this item O-17. That number is already taken in this ADR (§23.4, the 10.10
AC-routing item), so it is recorded as **O-21**, the next free number.

### 33.5 Same change set — VAL-018

`RunnerReportProjection.projectRuntime` read the key `chromium`, but the runner records ADR-001's
`chromiumBuild`, so `ExecutionSnapshot.runtime.chromium` was always null. The projection now reads
`chromiumBuild`. The public field name `runtime.chromium` is unchanged. `ReportedRuntimeVersions`
names the projected keys in its description, which is text only and rides on this section's
re-anchor.

## 34. Save-time `400` codes on public routes — class ruling, VAL-027 / VAL-024 / VAL-023 (2026-10-05)

Ruling on gate finding QA-R2 (`docs/qa/gates/ui-studio-validation-20261004.yml`,
`regate_2026-10-04b`). The 2026-10-04 §13 row for VAL-027 / VAL-024 / gate QA-5 recorded a
description-only amendment to `createTest`, `updateTest` and `compileTest` as Class A and asked
@architect to confirm the class.

### 34.1 Ruling — Class C, content ratified

**The class is C, not A.** The §13 row is corrected in place.

- §12 Class A covers defects *no producer or consumer could ever have satisfied*. The old `400`
  descriptions could be satisfied. They became incomplete because the server's behaviour changed,
  and that is not a malformed document.
- §12 Class C covers *status-code semantics, and anything on the public surface*. `POST /tests`,
  `PUT /tests/{id}` and `POST /tests/{id}/compile` are public routes. The amendment records a status
  outcome change for clients. A request that used to get `201` now gets `400`.
- §12 assigns authority by **class of change**, not by edit type. "Description text only" is how
  the edit was made. It does not decide the class. The `400` status itself was already declared, but
  which requests receive it changed, and that is a status-code semantic.

**The content is ratified unchanged.** The edit is not a loosening. It narrows what the server
accepts toward bounds the document already declared (`timeoutSeconds` `minimum: 1, maximum: 120`,
and the compile bounds of 100 steps and 1024 characters per step). It invents no code: every code it
lists was already in the compile vocabulary. No status, schema, enum, `required` list, example or
route moved. The ruling adds no text to `openapi.yaml`, so `BASE_SHA256`
(`studio-runner/test/run/confinement.test.ts`, `43fe0bb46cb4…7898`) stays as it is and needs no
re-anchor.

**Process.** Under §19 a Class C edit is authorized by @architect first and then landed by a named
story. Here the edit landed first, by @dev under UI-STUDIO-VALIDATION-20261004, and this section
authorizes it retroactively. That is accepted once, because the content was sound and the row itself
flagged the question. The precedent is not: the next public-route amendment waits for the ruling.

### 34.2 Behaviour change for API clients

| Request at save (`POST /tests`, `PUT /tests/{id}`) | Before | Now |
|---|---|---|
| `timeoutSeconds` outside 1..120 (VAL-023) | `201`/`200`. `0` was silently coerced to `30`, and `121` was stored as `121` | `400 INVALID_CONFIGURATION` |
| A blank or whitespace-only step | saved; refused only at compile | `400 INVALID_STEPS` |
| More than 100 steps | saved; refused only at compile | `400 SOURCE_TOO_MANY_STEPS` |
| A step longer than 1024 characters | saved; refused only at compile | `400 SOURCE_LINE_TOO_LONG` |

Codes and messages are the same as the compile-time ones (VAL-024). The 65 536-byte total-source
bound is still checked at compile only, as the openapi text states. `compileTest`'s `400` is
unchanged in meaning. Only its code list is now complete.

**A client that relied on the coercion now gets a refusal.** In particular, a client that sent
`timeoutSeconds: 0` to mean "default" will start failing.

### 34.3 Consumers re-checked, and notification

- **The Checks frontend** is the only known consumer. `saveErrorMessage.ts` branches on status and
  code, never on prose, and `saveErrorMessage.test.ts` is green in the re-gate's 770/770.
- **The MSW handlers** do not emit the save-time codes. That is a fidelity gap, not a contract
  divergence, and it goes to a follow-up.
- **Notification.** ADR-002 sets no consumer-notification mechanism beyond this record (§12: "every
  amendment is recorded"). This ruling additionally requires one line in the release notes of the
  release that ships VAL-024/VAL-027, naming the four codes and the end of `timeoutSeconds`
  coercion. Owner: @devops, as part of the release. No deprecation window applies. The routes are
  Studio's own, and no external client is known. If one is found, the release note is the notice.

### 34.4 Contract test

Unchanged by this ruling: `confinement.test.ts` 19/19 and `StudioContractTest` 14/14, as measured in
the §13 row. No test reads this ADR's bytes. A repository search found no hash or content anchor on
`docs/architecture/ADR-002-internal-contract-surface.md`. The only tooling reference is
`tools/epic10-fold/guards.sh`, which checks for merge-conflict markers.

## 35. Run auto-accept against C0-A3 and the trust principle (2026-10-07)

Asked by @po while validating story 10.47 (`docs/stories/10.47.story.md`, PO Readiness ruling 1).
The ruling is docs-only and user-approved. Facts were read at HEAD `0a7289de3`. No code, test or
`openapi.yaml` byte was changed by this section.

### 35.1 What the code does today (read, not run)

1. **Save never compiles.** `StudioService.java:274-278`.
2. **One compile entry, issued by Run.** `POST /tests/{id}/compile` → `StudioService.compileTest`
   (`:621-623`, `requireWrite` on the draft's CSI) → `CompilePipeline.compile(testId, principal)`
   (`CompilePipeline.java:158,165`). In the shipped UI, its only caller is the Run gate:
   `useRunGate.ts:315` compiles, `:333` returns when `READY`, and `:413` calls `POST /execute` in
   the same user activation. `CompileReviewPanel` (the manual review/confirm UI) is mounted only in
   `reviewTestHarness.tsx:5`, not in production. `runEnablement.ts:38` maps a legacy
   `AWAITING_CONFIRMATION` to `compile`, not to review.
3. **Every validated compile is auto-accepted.** `CompilePipeline.java:369` calls
   `publishAcceptedCandidate` with no condition on how the compile was triggered.
   `CompileStateService.java:268-327` inserts the revision. It writes
   `confirmed_by = candidate.createdBy()`, `confirmed_at = NOW()` (`:288-296`), and then sets
   `confirmed_revision_id` and `READY` (`:298-312`). The confirmer is the principal that requested
   the compile. That principal holds CSI write, but nothing records that this confirmation had no
   review.
4. **No human is shown the artifact before it executes.** Within one Run, compile → READY →
   execute happens with no display step. Afterwards the exact executed bytes and hash can be read in
   the Code tab (`CodeTab.tsx:71`, ADR-002 §30).
5. **Three further deviations in `publishAcceptedCandidate`, compared with `publishCandidate`
   (`:208-256`).** (a) There is no deadline recheck. `publishCandidate` has one at `:212`, `:222`,
   `:228` and the `deadline_at` term at `:243`, and C0's 2026-09-16 implementation amendment
   requires it. (b) It always calls `insertOrReuseRevision` and never `insertCapturedRevision`
   (compare `:224-225`), so an accepted revision is not linked to its compile request. *Inferred,
   not measured:* `recordOutcome`'s `revisionId` lookup by `compile_request_id` is then null.
   (c) Its javadoc (`:258-266`) says "save-triggered", but no save path compiles.
6. **The guard that should catch this does not.** `NoAutoConfirmTest` (10.9 AC-21) skips
   `CompileStateService` itself (`NoAutoConfirmTest.java:107,252`), and the auto-accept is inline
   SQL in that file. Its `contains("SET confirmed_by = ?, confirmed_at = NOW()")` check is satisfied
   by either statement. The test is green while the property it names is false.
7. **Other stale documents.** `compile/README.md:3-5,20,30,105` and the `CompilePipeline` class
   javadoc `:66-69` both say an explicit compile publishes `AWAITING_CONFIRMATION`. In practice an
   explicit compile publishes `READY`, and save does not compile at all.

### 35.2 Ruling — (c), middle ground

**The contract is right: Run is the confirming act.** The user decided this
(`STUDIO-INC-001…/spec/decisions.md:10`, DEC-OQ3, "Keep Run auto-accept"), and C0-A3 approved it on
2026-09-23. Restoring a mandatory `AWAITING_CONFIRMATION` stop would reverse a user decision, so
option (b) is rejected.

**The implementation is not a conformant interim of C0-A3, so option (a) is rejected.** C0-A3's
approval was conditional, and the code meets only the principal half of the condition:

| C0-A3 condition | Today |
|---|---|
| Confirmer = the principal that created the request | **Met**. `candidate.createdBy()` |
| Only a server-captured `trigger = RUN` auto-accepts. Other compiles stay `AWAITING_CONFIRMATION` | **Not met**. No trigger exists, and every compile auto-accepts |
| `confirmationSource` stored server-side, so the audit can tell a reviewed confirmation from a Run confirmation | **Not met**. Both write the same two columns |
| Identity binding and no stale prefix | **Met** for v1 FULL: request/revision guard (`lockCurrentRequest`) and reference policy verified (`:278-284`) |
| Publication rechecks the deadline at the last CAS (C0 2026-09-16) | **Not met** (§35.1 item 5a) |

**The amended trust principle.** The old principle was "the author confirms exactly the artifact
that will run, before it runs" (10.10, 10.27, §30). It becomes: **an explicit, authenticated author
action authorizes exactly one immutable artifact, the audit says truthfully whether that
authorization came with prior review, and the author can always read exactly the bytes that ran.**
Four things replace the pre-execution human look:

1. **An explicit act.** Run is pressed by a CSI writer and bound by request identity to that
   request's candidate only.
2. **Exactness.** The revision is immutable, and readiness and dispatch re-verify it (unchanged).
3. **Machine gates that never depended on review.** `/v1/validate`, the reference policy, secret
   origins and URL scheme refusal.
4. **Truthful audit and post-hoc visibility.** `confirmationSource = RUN` (owed, §35.5), plus the
   §30 confirmed pair.

**The residual risk is accepted by the user (DEC-OQ3), not by this ADR.** A validator-legal but
semantically wrong generated step executes once before the author sees it.

### 35.3 C0-A3 clarified for v1

The v1 `POST /tests/{id}/compile` takes no body. The openapi document defines it as the Run action's
preparation (`:562-565`), so **the server stamps `trigger = RUN` on every v1 compile request.** The
route is the trigger. This is not a client label, so it satisfies C0-A3's auditability condition.
v2 *Compile changes* and *Rebuild all steps* (STUDIO-INC-001) must capture their own trigger and
publish `AWAITING_CONFIRMATION`. Auto-accept may happen inside the compile's publication
transaction. It does not have to be a client call to `confirm-compile` carrying
`confirmationSource:"RUN"`, provided the four conditions above hold. The C0 contract records this in
§7, "Run auto-accept ruling (2026-10-07)".

### 35.4 The other `554277fcb` text edits

- **`confirmCompile` `deprecated: true`: not ratified.** Under C0-A3 it is the manual-confirmation
  route, and it must keep working, because `confirm` is still exact and write-once. The fix story
  removes the flag and says only that the v1 UI has no caller today.
- **"Any authenticated application user may start a Studio execution": not ratified. Security
  flag.** `554277fcb` removed `requireExecute`/`canExecute` and so loosened architecture §9.1
  ("owners … may … execute"). Checks execution still enforces `canExecute`
  (`CheckExecuteController.java:67`). Confirmation integrity is not affected, because the
  auto-accepting principal is still a CSI writer. What it does is let any authenticated user spend a
  CSI's runner capacity, and drive its test accounts, through any confirmed test. No user or
  security decision authorizing this was found. It is recorded as **O-22**, owned by the user (with
  security). Recommendation: restore `canExecute`. The as-built document stays until the user
  decides.

### 35.5 What the fix story must do (to be drafted by @sm; DDL detail delegated to @data-engineer)

1. **Forward-only migration.**
   - `ui_test_compile_requests.trigger`: immutable, set by the server, `RUN` for every v1 compile.
   - `ui_test_revisions.confirmation_source` (`RUN` | `MANUAL`): write-once, written together with
     `confirmed_by`. The V12 write-once trigger must allow it as confirmation bookkeeping.
   - Rows auto-accepted before the fix stay `NULL` ("unknown"). They are never backfilled as
     `MANUAL`.
2. **`publishAcceptedCandidate`.**
   - Auto-accept only when the request's `trigger = RUN` and the confirmer equals the request's
     `created_by`. Otherwise publish through `publishCandidate`.
   - Add `publishCandidate`'s deadline recheck and `insertCapturedRevision` branch. Reusing that
     path and adding the two confirmation statements is the expected shape.
   - Write `RUN`. The manual `confirm` writes `MANUAL`.
3. **Tests.**
   - Rewrite `NoAutoConfirmTest` to the new property: exactly two confirmation writers (manual
     `confirm` and Run auto-accept). The scan includes SQL inside `CompileStateService`, which closes
     the vacuity.
   - Add a behavioural test that a non-RUN trigger publishes `AWAITING_CONFIRMATION`.
   - Add a deadline-expiry test for the accepted path.
   - 10.9 AC-21 is superseded by this ruling. Its owner records that; this ADR does not edit the
     story.
4. **Documents.**
   - `compile/README.md`, the `CompilePipeline` class javadoc and the `publishAcceptedCandidate`
     javadoc are rewritten to this model.
   - `openapi.yaml`: the `compileTest` text says that acceptance is recorded as a Run confirmation
     without prior review; the `confirmCompile` flag is removed; `executeTest` follows the O-22
     decision.
   - Re-anchor `BASE_SHA256` from `shasum -a 256` and add a §13 row. Public `confirmationSource`
     exposure is optional. If it is added, that is a further Class C row.
5. **Harness.** The `StudioCoRunIT.awaitCompiledToReadyAndAccepted` javadoc cites this section. Make
   `AWAITING_CONFIRMATION` a fast-failing terminal status, and assert
   `confirmation_source = RUN`.
