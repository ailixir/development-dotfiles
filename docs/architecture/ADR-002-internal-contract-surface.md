# ADR-002 — Internal contract surface: how the runner's routes are expressed, and what a log entry's timestamp is

| Field | Value |
|---|---|
| Status | Accepted (architecture decision, 2026-09-11). Amended twice the same day: §11 closes O-7, §12 rules on who may amend this contract, and §14 declares the conflict responses for a deleted or quarantined draft, closing story 10.8's AC-1b escalation across compile, confirm-compile and execute. O-1 and O-2 landed at `86a187267`; one backend assertion in §8.6 awaits its owner. |
| Author | @architect (Aria) |
| Source of truth | [Studio architecture v2.1](studio-execution.md) §4.4, §4.5, §5.1–5.5, §6.1–6.4, §8.2, §8.4, §8.5, §9.1–9.3; [ADR-001](ADR-001-studio-runner-scaffolding.md) §4.2, §9 |
| Amends | `docs/specs/studio/openapi.yaml`, frozen by story 10.1. This ADR is the amendment's rationale; the document is the contract. |
| Consumers | Stories 10.6, 10.7, 10.8, 10.12, 10.14 ([EPIC-10](../epics/EPIC-10-EXECUTION.yaml)) |
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
| O-3 | `internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface` premise (§8.6) | Owner of 10.1's backend contract test | Backend `check` |
| ~~O-4~~ | ~~Close `AdmissionResponse` and the callback response bodies once a producer exists~~ **Closed 2026-09-11 by story 10.7 at `af17549ec` and `7e827e52c`, which is the producer: `AdmissionResponse` is closed with every field named, the progress `200` gained a closed `ProgressAck` where it had declared no content at all, and the duplicate-delivery `200` is documented. Logged in §13.** | ~~10.7~~ | — |
| O-5 | The runner `outcome.errorCode` set beyond §8.2's `TIMEOUT`; today's `STEP_FAILED`/`RUN_ERROR`/`RUN_NOT_STARTED` are placeholders around a fake launcher | 10.12 | — |
| O-6 | §8.4 names "approved target/secret-use policy" among the job fields; the envelope carries only declared reference **names** (`references`). Whether destination policy travels on the job or is enforced solely at the egress layer is unresolved, and the contract declares only what exists rather than a field nobody implements. | 10.7 / 10.18 (SPK-05) | Destination enforcement (§9.3) |
| ~~O-7~~ | ~~Where the §6.4 recorder-origin calibration is applied — runner-side or API-side~~ **Closed 2026-09-11 by §11: runner-side, at the clock. `recordingOriginMs` rejected; the contract gains no field. Remaining work is 10.12's, listed in §11.6.** | ~~10.12~~ | — |
| O-9 | `x-conflict-codes` on the three internal `409`s (`POST /v1/runs`, the admission and progress callbacks). Their producers are 10.7's and do not exist yet, so a set declared now would be invented. **Pre-ruled in §14.7:** 10.7 may land these directly, listing exactly the codes its own PR emits, with a §13 log line — no escalation needed. The runner propagates the admission callback's code into its own `/v1/runs` refusal, so the two must be closed together. | 10.7 | — |
| O-10 | A draft that is unknown, soft-deleted or quarantined answers **`400 BAD_REQUEST`** on `GET`/`PUT`/`DELETE /tests/{id}`, because `IllegalArgumentException` maps to `400`. Conventionally that is a `404`. **Not ruled here** — it is Class C, it moves the public surface for three stories mid-wave, and it is not the gap 10.8 raised. No security defect either way: both forms are existence-preserving and neither discloses more than the other. Raise it as its own decision before the pilot, not as a side effect of this one. | @architect (post-wave-3) | — |
| O-8 | The run-scoped clock of §11: zero at recording-context readiness, injected into step execution, process-origin default removed from the production path, the two origin reads paired, the readiness-to-first-frame gap measured in staging, and a scale assertion the schema cannot make (§11.6) | 10.12 | Step-seek acceptance; the §11.1 defect is live until it lands |

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
| 2026-09-11 | All six §8.4 routes declared, per-path `servers`, `runner`/`api-callback` tags, `x-served-by`, `serviceIdentity` (§3) | C | @architect, ADR-002 | 576/2/2 → 577/2/1 |
| 2026-09-11 | `logs[].at` (`date-time`) → `atMs` run-timeline offset (§4) | B | @architect, ADR-002 | as above |
| 2026-09-11 | 409 description un-truncated, spurious null-valued key removed (§5) | A | @architect, ADR-002 | as above |
| 2026-09-11 | Runner-produced bodies closed; `RunnerReport → ExecutionSnapshot` mapping table added (§6) | B | @architect, ADR-002 | as above |
| 2026-09-11 | Run clock and recording origin stated; `minimum: 0` on all timings; `browserStartedAt` paired with the clock zero; API applies no calibration. `recordingOriginMs` **rejected** (§11) | B | @architect, this amendment | `test/contract.test.ts` 14/14 before and after |
| 2026-09-11 | `AdmissionResponse` closed — `additionalProperties: false`, all six fields named and required, `state` enumerated `ADMITTED`/`RUNNING`/`FINALIZING`; new closed `ProgressAck` for the progress `200`, which declared no content at all; the duplicate-delivery `200` (`applied: false`) documented (§9 O-4) | A for the content-less `200`; the closures are O-4, which §9 assigned to this story by name | @dev, story 10.7, at `af17549ec` | `StudioContractTest` 8/8 before and after |
| 2026-09-11 | `x-not-yet-implemented` removed from `streamExecution` and from the two internal callback routes — the contract declared as unshipped three routes this story ships (§9 O-4) | A — a declaration the running system contradicts | @dev, story 10.7, at `af17549ec` and `7e827e52c` | `StudioContractTest` 7/8 → 8/8 |
| 2026-09-11 | Conflict responses declared for a withheld draft on `compileTest`, `confirmCompile` and `executeTest`; `x-conflict-codes` introduced on every public `409`; missing `400` declared on `compileTest` and `confirmCompile` (§14). Closes story 10.8's AC-1b escalation | C | @architect, this amendment | `test/contract.test.ts` 14/14 before and after (no `internal`-tagged operation touched) |

The two rows above are one story's amendment, recorded against §12's four requirements:

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
