# ADR-002 — Internal contract surface: how the runner's routes are expressed, and what a log entry's timestamp is

| Field | Value |
|---|---|
| Status | Accepted (architecture decision, 2026-09-11). Two runner corrections in §7 await @dev; one backend assertion in §8.6 awaits its owner. |
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
| **10.7** — API dispatch and callbacks | Gains an explicit projection to implement rather than infer: the `RunnerReport → ExecutionSnapshot` mapping table, the `PENDING` step fill from the revision's ordered source, `at = browserStartedAt + atMs`, level upper-casing, and `evidence.state → video.status`. Must not emit an `ExecutionErrorCode` value on a runner's behalf. Closes `AdmissionResponse` and the callback response bodies when it ships. |
| **10.8** — compilation | `POST /v1/validate` now has a declared request and response, including the `RunnerDiagnostic` shape and the fact that a rejected artifact is still a `200`. No change to what 10.8 sends. |
| **10.12** — execution and recording | Owns where the §6.4 recorder-origin calibration is applied. The contract fixes only that every reading crossing it is monotonic and shares one origin per run; it does not decide whether the runner or the API converts to `offsetMs`. Also owns the real `outcome.errorCode` set, with `ERROR`/`TIMEOUT` already fixed by §8.2. |
| **10.14** — evidence | `RunnerEvidence` is declared with the runner's own `PENDING/STORED/FAILED/UNAVAILABLE` and the documented projection to `VideoStatus`. `videoKey`/`manifestKey` are echoes of the server-derived job keys; the contract restates that the runner never invents or accepts an arbitrary key (§6.2). |

### 8.2 Positive

One document still holds one contract, so shared schemas cannot drift. All six §8.4 routes are declared, so the gap between the contract and the architecture is closed rather than tracked. The two callbacks stop inheriting a base that would have produced an unserved path. Service identity is asserted in the schema instead of in prose. And the runner's wire bodies are now checkable: the next naming disagreement is a red test on the PR that introduces it.

### 8.3 Negative / accepted costs

The document grew by roughly 820 lines net, most of it declaring bodies that previously existed only in TypeScript. Closed schemas mean a legitimate new field is a contract edit, not a deploy — intended, and the reason `AdmissionResponse` is exempt until it has a producer. The `RunnerReport → ExecutionSnapshot` mapping is real translation work for 10.7 that a shared shape would have appeared to avoid, though it would only have moved it.

### 8.4 Story 10.6's AC-1 checkbox — for @po, not for me

Story 10.6 line 47 marks AC-1 `[x]`. It is **not met**: the contract test fails on §7.1. @dev's own 2026-09-11 entry already records this ("AC-1's `[x]` is left as-is under the no-AC-edit constraint, but it is not met"). Correcting the checkbox is @po's call under story-authority rules; this ADR only records that the condition still holds after the amendment, for a different and smaller reason than before.

### 8.5 The runner's contract test after the amendment

`npx vitest run` in `studio-runner/`: **577 passed, 2 skipped, 1 failed** (was 576 / 2 / 2). The remaining failure is §7.1 and is a runner defect. Response conformance for all four runner routes now passes, as does admission-request conformance and the log-entry shape.

### 8.6 One backend assertion is now wrong — for its owner

`backend/src/test/java/.../StudioContractTest.java`, `internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface`, asserts that every `internal`-tagged operation's path contains `/internal/`. That was true while only the API callbacks were declared. It is false now and by design: the runner serves `/v1/validate`, `/v1/runs`, `/health`, `/ready`, and no amount of tagging changes what is on its socket.

The assertion encodes the assumption this ADR corrects — that "internal" is a path prefix. What "internal" actually means is: not reachable through public ingress, and requiring service identity. The corrected assertion is the one already next to it (`noneMatch(contains(PUBLIC_BASE))`) plus a check that each internal operation carries `runner` or `api-callback` and declares its own `servers` entry. Backend Java is out of this ADR's scope and another agent owns that tree; this is recorded for whoever owns 10.1's test. No other backend gate is affected — the eight `assertSchemaMatchesRecord` schemas, the snapshot examples and the legacy adapter examples are all untouched.

## 9. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| O-1 | Step status rename `PASSED`/`FAILED` → `PASS`/`FAIL` in the runner (§7.1) | @dev (10.6) | 10.6 AC-1 |
| O-2 | Terminal log line `atMs: 0` → `null` (§7.2) | @dev (10.6) | Correct log placement on the video timeline |
| O-3 | `internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface` premise (§8.6) | Owner of 10.1's backend contract test | Backend `check` |
| O-4 | Close `AdmissionResponse` and the callback response bodies once a producer exists | 10.7 | — |
| O-5 | The runner `outcome.errorCode` set beyond §8.2's `TIMEOUT`; today's `STEP_FAILED`/`RUN_ERROR`/`RUN_NOT_STARTED` are placeholders around a fake launcher | 10.12 | — |
| O-6 | §8.4 names "approved target/secret-use policy" among the job fields; the envelope carries only declared reference **names** (`references`). Whether destination policy travels on the job or is enforced solely at the egress layer is unresolved, and the contract declares only what exists rather than a field nobody implements. | 10.7 / 10.18 (SPK-05) | Destination enforcement (§9.3) |
| O-7 | Where the §6.4 recorder-origin calibration is applied — runner-side or API-side | 10.12 | Step-seek acceptance |

## 10. Alternatives considered (summary)

Route-surface alternatives are in §3.3. For the timestamp:

| Option | Why not |
|---|---|
| **Absolute `at` on every entry** | The runner holds one wall-clock instant per run. Supplying more means either a second, uncalibrated clock or performing the origin arithmetic in the component that does not know the origin — and in both cases the raw offset the 500 ms seek needs is discarded before it reaches anyone who could use it. |
| **API-assigned receipt time** | Varies per delivery for identical facts, contradicting the byte-identical terminal retry of §5.3; and collapses a whole report's log buffer onto one instant, destroying correlation rather than degrading it. |
| **Both: `atMs` and an optional absolute `at`** | Two representations of one fact on one wire body, with no rule for which wins when they disagree. The derived value belongs on the surface that publishes it, where the API already owns the projection. |
| **Rename only, keeping `date-time`, and let the runner send `0`-epoch for the two placeholder sites** | Encodes "unknown" as 1970 and would have passed the checker. It is the shape of fix that makes a test green without making the system right. |
