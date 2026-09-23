# Epic 10 — Checks Studio Execution: Jira story set

Fifteen stories covering the Studio execution engine, cut bottom-up: the engine first, then the
mechanisms that drive it, then the capability, then the user surface, then hardening. No story
exceeds 13 points, so each fits a single two-week sprint. Copy a story's fields straight into Jira.

Assumed to exist already and not covered by this set: the surrounding Checks platform (API
scaffolding, session authentication, inventory ownership model, frontend module shell), the runner
service with its admission and reporting protocol, the artifact validator and trusted executor, and
the adapter seams for browser, model gateway, object storage and identity.

| Layer | # | Story | Points |
|---|---|---|---|
| Engine | 1 | Studio API — Define the run lifecycle as a pure, testable state machine | 5 |
| Engine | 2 | Studio API & UI — Freeze one API and artifact contract for every component | 5 |
| Engine | 3 | Studio API & Database — Store approved tests as unchangeable, hashed versions | 8 |
| Mechanism | 4 | Studio API — Dispatch and recover runs without duplicating or losing them | 8 |
| Mechanism | 5 | Studio API — Stream live run progress to any replica | 5 |
| Core | 6 | Studio API & AI Gateway — Turn the written checklist into a test once, within limits | 8 |
| Core | 7 | Studio Runner — Execute the test in a real browser and record a video | 8 |
| Core | 8 | Studio Runner — Stop runaway runs, clean up and keep secrets out of logs | 8 |
| Core | 9 | Studio API & Storage — Keep the run result and serve its video only to authorised users | 13 |
| Surface | 10 | Studio UI — Show what each written step will do, and confirm exactly that version | 13 |
| Surface | 11 | Studio UI — Start a run, watch it live and jump to any step in the video | 13 |
| Surface | 12 | Studio UI & API — Add context to a test and keep each step's identity stable | 13 |
| Surface | 13 | Studio API & Runner — Prove the generated test means exactly what the author wrote | 13 |
| Hardening | 14 | Studio API & UI — Enforce access rules on every Studio action | 13 |
| Hardening | 15 | Deployment & Platform — Harden Studio for staging and hand it over | 13 |

**146 points** — Engine 18, Mechanism 13, Core 37, Surface 52, Hardening 26. Stories 1–3 are the
engine and carry no I/O of their own; everything after them plugs into the contracts they define.
Stories 12 and 13 (authoring context) attach to the engine layer and can run in parallel with 6
onward if you have a second team. Stories 9–15 are the tightest at 13 points and each names a split
seam in its Scope.

---

# Engine

The parts that have no dependencies of their own and that everything else is written against.

## 1. Studio API — Define the run lifecycle as a pure, testable state machine

**Points:** 5

**In one line:** Model dispatch, compile and execution status as explicit enums with a declared
transition matrix and no I/O, so legality is exhaustively testable before anything can call a
database or a browser.

**Goal**
Express the whole run lifecycle as pure domain types whose legal transitions are enumerated and
enforced in one place, rather than implied by scattered service code.

**Scope**

- Dispatch lifecycle enum `QUEUED → CLAIMED → DISPATCHING → ADMITTED → RUNNING → FINALIZING → DONE`, with the permitted transition set declared as data.
- Compile lifecycle enum `STALE`, `COMPILING`, `AWAITING_CONFIRMATION`, `READY`, `NEEDS_REVISION`.
- Canonical execution status vocabulary `PENDING`, `RUNNING`, `PASSED`, `FAILED`, `ERROR`, with
terminal-status membership declared, and timeout modelled as `ERROR` plus a typed error code
rather than a status of its own.
- Guard functions answering "is this transition legal" and "is this status terminal" with no
repository, network or clock dependency.
- Exhaustive transition tests over the full matrix, legal and illegal.

**Out of Scope**

- Persisting any of it — story 3.
- Applying the transitions against a database — story 4.

**Acceptance Criteria**

1. Every lifecycle is an explicit enum; no lifecycle state is represented as a free-form string in
 domain code.
2. The permitted transition set is declared as data and is the only place legality is decided.
3. Illegal transitions are rejected by the guard, proven by a test over the full matrix rather than
 by spot checks.
4. Terminal statuses are declared once, and a terminal state accepts no further transition.
5. A timeout is expressed as `ERROR` with a typed timeout error code, never as a status.
6. The domain types compile and their tests pass with no database, network, clock or filesystem
 dependency on the classpath of the test.

---

## 2. Studio API & UI — Freeze one API and artifact contract for every component

**Points:** 5

**In one line:** Publish the OpenAPI document and artifact JSON schema, derive the TypeScript and
Java types from them, and fail the build on drift — so three components can be built in parallel
without shape arguments.

**Goal**
Give the frontend, backend and runner a single frozen contract to build against before any of them
has an implementation.

**Scope**

- OpenAPI document covering the Studio API surface, checked into the repository.
- JSON schema for the compiled artifact, including recorded runtime versions.
- TypeScript types mirrored from the schema for the frontend, Java models bound to the same shapes.
- A drift check in CI comparing the published contract against the generated and hand-kept copies.

**Out of Scope**

- Implementing any endpoint the contract declares.
- The authoring context shape, which is a later contract extension — story 12.

**Acceptance Criteria**

1. The OpenAPI document and artifact schema are published in the repository and are the single
 source the other components derive from.
2. Frontend types, backend models and the runner's artifact contract all trace to that source.
3. A divergence between the published contract and any derived or hand-kept copy fails CI.
4. The contract declares every status each route can return, including refusals.
5. A contract change and its derived copies land in the same change set.

---

## 3. Studio API & Database — Store approved tests as unchangeable, hashed versions

**Points:** 8

**In one line:** Migrations plus a write-once revision store with content hashes, provenance and a
monotonic guard, so what an author approved is identifiable forever and a late compile cannot
overwrite it.

**Goal**
Persist compiled candidates as immutable revisions, separate from the author's mutable draft, so
every execution can name the exact artifact it ran.

**Scope**

- Forward-only migrations for revision snapshots, inventory ownership snapshot, dispatch identity
and evidence state.
- Immutable revision rows: content hash, model and version provenance, write-once confirmation
enforced at the database level.
- Separation of the mutable draft row from the revision it produced.
- Monotonic sequence guard so an out-of-order compile response cannot replace a newer revision.
- Repository layer exposing revisions by hash.

**Out of Scope**

- Compilation itself — story 6.
- Authoring context persistence — story 12.

**Acceptance Criteria**

1. Migrations apply cleanly forward and record revision snapshot, ownership snapshot, dispatch
 identity and evidence state.
2. Confirming a revision is write-once, enforced by a database constraint rather than by
 application code alone.
3. A confirmed revision is immutable; an author edit produces a new revision.
4. A compile result carrying an older sequence than the stored revision is discarded, not applied.
5. Every execution row references the exact revision hash it ran.
6. Revisions are retrievable by hash, and the hash is computed over the artifact content.

---

---

# Mechanism

What drives the engine: durable dispatch against the state machine, and the stream that exposes
it live.

## 4. Studio API — Dispatch and recover runs without duplicating or losing them

**Points:** 8

**In one line:** Drive the dispatch state machine as compare-and-set updates in Postgres, each
transition guarded by its expected prior state, with a recovery sweep that resolves any restart to
a truthful terminal state.

**Goal**
Make acceptance, dispatch, admission and recovery durable and exactly-once across three-to-six API
replicas, restarts and partitions.

**Scope**

- Each lifecycle transition implemented as a conditional update guarded by the expected prior
state, using the transition matrix from story 1.
- Idempotent accept, so a duplicate execute returns the first run rather than creating a second.
- Ambiguous-send handling, so a dispatch whose outcome is unknown is never replayed into a second
browser session.
- Recovery sweep resolving in-flight states after a restart.
- Terminal-state guard rejecting a late runner report.

**Out of Scope**

- The live progress stream — story 5.
- The run-control UI — story 11.

**Acceptance Criteria**

1. A duplicate execute request never produces two runs; the second returns the first run's identity.
2. An ambiguous dispatch send is never replayed into a second browser session.
3. A forced restart at each lifecycle state resolves to a truthful terminal state, verified per
 state.
4. Every write is a conditional update guarded by the expected prior state; no transition is applied
 by an unguarded write.
5. A report arriving after finalisation is rejected and does not alter stored history.
6. The recovery sweep is idempotent and safe to run concurrently on several replicas.

---

## 5. Studio API — Stream live run progress to any replica

**Points:** 5

**In one line:** Serve progress as server-sent snapshots read per pod from committed state, so a
callback landing on one replica is visible to a subscriber attached to another — with no broker and
no sticky sessions.

**Goal**
Deliver live run progress to the browser without a message broker, a sticky session or an in-memory
subscriber registry.

**Scope**

- Server-sent-event endpoint publishing run snapshots.
- Snapshots read per pod from committed database state only.
- Subscriber lifecycle: connect, resume, disconnect, and a bounded polling fallback if the route is
unavailable.

**Out of Scope**

- Ingress and proxy configuration for the route, owned by the platform team.
- Rendering progress in the page — story 11.

**Acceptance Criteria**

1. A callback delivered to one pod is observed by a subscriber attached to another.
2. Snapshots are read from committed state only; nothing in-flight is published.
3. No broker, sticky session or in-memory subscriber registry is required.
4. A subscriber reconnecting mid-run receives current state rather than only future events.
5. A bounded polling fallback produces the same snapshots when the stream is unavailable, with no
 contract change.

---

# Core

The capability itself: compile it, run it in a real browser, keep the evidence.

## 6. Studio API & AI Gateway — Turn the written checklist into a test once, within limits

**Points:** 8

**In one line:** A bounded, audited client for the enterprise model gateway, called once at
authoring time, with readiness gated on the confirmed revision hash so no execution ever waits on a
model.

**Goal**
Compile the author's English checklist into a candidate artifact at authoring time only, inside
hard time, attempt and cost bounds.

**Scope**

- Gateway client on the Vertex-compatible SDK with pinned model and version metadata, SDK
auto-retry disabled, explicit bounded timeouts, and a stub implementation for tests.
- Compile pipeline driving the compile lifecycle from story 1.
- Readiness gate resolving against the exact confirmed revision hash rather than a status column.
- Audit logging recording request metadata only — never a resolved value or a request body.

**Out of Scope**

- Gateway credentials, endpoints and model identifiers, supplied by the platform team.
- Repair attempts and the review experience — story 10.

**Acceptance Criteria**

1. Compilation is invoked only from the authoring path; no execution path calls the gateway.
2. Compile requests are bounded in wall time, attempt count and token cost, and fail with a typed
 error when a bound is hit.
3. A failed or slow compile never invalidates a revision the author already confirmed and did not
 edit.
4. An artifact that failed validation can never reach `READY` and cannot be dispatched.
5. Model identifier and version are pinned in configuration and recorded on each compiled revision.
6. No resolved value and no request body appears in any log, span or audit record, asserted against
 captured output.
7. Draft save continues to succeed while the gateway is unreachable.

---

## 7. Studio Runner — Execute the test in a real browser and record a video

**Points:** 8

**In one line:** Implement the browser seam with real sandboxed Chromium, recording native video
and emitting step timings against one calibrated run origin.

**Goal**
Start a real browser that cannot be talked out of its sandbox, records a native video, and produces
timings an operator can seek that video by.

**Scope**

- Chromium adapter implementing the existing `BrowserAdapter` interface, with no contract
change.
- Sandboxed launch; refusal when policy, Playwright/browser version compatibility or the start
deadline says no.
- Native Playwright video recording for the session.
- Step timings emitted against one calibrated run origin.

**Out of Scope**

- Deadline enforcement, process cleanup and redaction — story 8.
- Video storage and delivery — story 9.
- The internal browser image, owned by the platform team.

**Acceptance Criteria**

1. The real adapter satisfies the existing interface; no caller changes.
2. The browser starts sandboxed and refuses to start with the sandbox disabled.
3. A policy, version-compatibility or start-deadline violation refuses the launch with a typed
 reason.
4. A session produces a native video file.
5. Step timings share one calibrated run origin and are usable as video seek offsets.
6. A missing or failed recording is reported as such and never traded silently for a reported check
 outcome.

---

## 8. Studio Runner — Stop runaway runs, clean up and keep secrets out of logs

**Points:** 8

**In one line:** Enforce a browser-runtime deadline on its own budget, kill the whole process tree,
clear artefacts on every exit path, and prove redaction against captured stdout and stderr.

**Goal**
Guarantee that a run always terminates, always cleans up, reports a distinguishable timeout, and
never leaks a resolved secret into output.

**Scope**

- Browser-runtime deadline on a budget separate from queue time.
- Process-tree termination, verified by observing surviving children rather than asserting the call.
- Artefact cleanup on every exit path, including kill, crash and deadline.
- Redaction verified against captured process output.
- Timeout reported as an `ERROR` result carrying a typed timeout error code.

**Out of Scope**

- Object-store retention and lifecycle, owned by the platform team.

**Acceptance Criteria**

1. A run exceeding its browser-runtime budget is terminated; time spent queued does not consume that
 budget.
2. Termination kills the entire process tree, demonstrated by inspecting surviving processes.
3. Every exit path — normal, kill, crash, deadline — clears temporary artefacts.
4. A killed run never reports a video it does not have.
5. A timed-out run reports `ERROR` with the timeout error code, distinguishable by an operator from
 other failures.
6. Captured stdout and stderr contain no resolved secret value, asserted on the captured bytes.

---

## 9. Studio API & Storage — Keep the run result and serve its video only to authorised users

**Points:** 13

**In one line:** Write a durable terminal manifest before delivering the result, store video under a
platform-derived key, and serve playback over an authorised HTTP Range endpoint with honest
refusals.

**Goal**
Make finished-run evidence durable, honest about completeness, and readable only by entitled
callers.

**Scope**

- Video written through the object-store seam under a key derived server-side, never supplied by the
caller.
- Durable terminal manifest committed before the result is delivered.
- Explicit coverage flag distinguishing a complete recording from a truncated one.
- Protected playback and download endpoint honouring HTTP Range requests.
- Distinct typed responses for absent, still-being-written and expired evidence.

**Out of Scope**

- Object-store credentials and retention lifecycle, owned by the platform team.
- The evidence UI — story 11.

*Split seam if this overruns: separate the manifest and storage write from the playback endpoint.*

**Acceptance Criteria**

1. The storage key is derived server-side; a caller-supplied key is ignored.
2. The terminal manifest is committed before result delivery, and a dropped delivery still leaves a
 readable result.
3. A truncated recording carries a coverage flag and is never presented as complete.
4. The endpoint serves Range requests, so seeking does not require downloading the whole file.
5. An unauthorised caller is refused, and the refusal does not disclose whether the evidence exists.
6. Absent, pending and expired evidence each return a distinct, documented response.

---

# Surface

What the author actually touches.

## 10. Studio UI — Show what each written step will do, and confirm exactly that version

**Points:** 13

**In one line:** Bounded repair attempts plus a per-line review showing the accepted action, target
and assertion, with confirmation bound to the revision hash that was actually rendered.

**Goal**
Let the author see, in plain terms, what the machine decided each line meant, and make approval
apply to exactly the revision they looked at.

**Scope**

- Bounded automatic repair attempts when the validator refuses a step.
- Plain-language diagnostics for what remains unrunnable and what would fix it.
- Each authored line rendered with the accepted action, target and assertion.
- Generated Playwright source available one expansion away from the line.
- Confirmation carrying the rendered revision hash, refused if the server's current revision differs.

**Out of Scope**

- Run control and live progress — story 11.
- Compile bounds themselves — story 6.

*Split seam if this overruns: separate repair and diagnostics from the per-line review rendering.*

**Acceptance Criteria**

1. Repairs are attempted a bounded number of times and then stop with a terminal diagnostic.
2. A line that cannot be made runnable is explained in plain terms, not as a raw validator error.
3. Each authored line displays the accepted action, target and assertion.
4. The generated source is reachable inline, without navigating away from the review.
5. Confirmation sends the rendered revision hash; a mismatch with the server's current revision is
 refused rather than applied to a different revision.
6. A stale browser tab cannot confirm a revision the user never saw.
7. An API restart mid-compile costs the author a retry, not their already-confirmed revision.

---

## 11. Studio UI — Start a run, watch it live and jump to any step in the video

**Points:** 13

**In one line:** Run control driven by server readiness, live progress consumed from the event
stream, and step-indexed video seeking with per-image calibration.

**Goal**
Let an authorised engineer dispatch a confirmed revision, watch the run as it happens, and jump
straight to the moment in the recording that matters.

**Scope**

- Run control whose enabled state derives from the server's readiness response only.
- Live progress consumed from the event stream, replacing polling.
- Typed refusal and terminal-error rendering stating what happened to the browser and who can act.
- Evidence state rendered from the coverage flag, without overstating what the platform holds.
- Step-to-timestamp seeking and download.
- Per-browser-image seek calibration applied to the run origin, plus a seek-measurement diagnostic
reporting each step's true signed lead.

**Out of Scope**

- Dispatch and streaming backends — stories 4 and 5.
- The video delivery route — story 9.

*Split seam if this overruns: separate run control and live progress from evidence playback and
seek calibration.*

**Acceptance Criteria**

1. The Run control's enabled state comes from the server readiness response only; no client-side
 inference of readiness exists.
2. Progress renders from the event stream, with no polling loop in the page.
3. Every refusal and terminal error states what happened to the browser and the responsible owner.
4. Evidence state renders pending, partial, complete or absent from the server's coverage flag and
 never claims more.
5. Selecting a step seeks the player to that step's timestamp.
6. Download returns the recording the caller is entitled to.
7. Seek calibration is configurable per browser image and applied when computing the run origin.
8. A failed seek measurement reports each step's true signed lead rather than a mis-attributed
 positive value.

---

## 12. Studio UI & API — Add context to a test and keep each step's identity stable

**Points:** 13

**In one line:** Extend the frozen contract with global and per-step context and stable step IDs,
then persist it, edit it and expose it through the API with mock parity.

**Goal**
Let an author attach context to a test as a whole and to individual steps, with step identity that
survives reorder, copy and delete.

**Scope**

- Contract extension: optional global context, ordered steps each with a required stable ID,
required text and optional context.
- Typed context values distinguishing plain text, explicit literal, non-secret variable reference,
secret reference, target hint and contextual default, with precedence recorded.
- Documented adapter converting legacy ordered-string steps once, preserving each source string byte
for byte.
- Persistence of context and stable IDs; context and referenced non-secret values included in
configuration revision identity.
- Pure frontend authoring model where add, edit, reorder, copy and delete behave correctly with
respect to identity.
- Public create, read and update endpoints in the new shape, with MSW handlers matching the real
transport.

**Out of Scope**

- Context resolution and its use in compilation — story 13.
- Live page learning.

*Split seam if this overruns: separate the contract and persistence from the editor model and API
exposure.*

**Acceptance Criteria**

1. The contract defines global context and ordered steps with required ID and text and optional
 context defaulting to empty.
2. Missing, duplicate, orphan and mixed legacy/new step arrays are rejected atomically.
3. Reorder and edit preserve IDs; insertion and copy mint fresh IDs; delete removes only that step's
 metadata. Array position is never identity.
4. Legacy string-based drafts adapt once on first write in the new shape, preserving every source
 string byte for byte.
5. Context and referenced non-secret values are part of configuration identity, so changing them
 changes the revision.
6. A write against a stale revision returns a stale-revision conflict, and the response does not
 suggest a partial apply.
7. Add, edit, reorder, copy and delete are implemented in a pure, independently testable model.
8. MSW handlers and the real API accept and return identical shapes.

---

## 13. Studio API & Runner — Prove the generated test means exactly what the author wrote

**Points:** 13

**In one line:** Resolve context by precedence into a versioned expected-intent record, have the
runner compare parsed operations against it exactly, and re-derive it from the immutable revision at
readiness before any execution state exists.

**Goal**
Make generated Playwright provably equal to the author's resolved intent, checked at compile time
and again before execution starts.

**Scope**

- Pure resolver applying explicit step value, then step context, then global context, with policy
authoritative, returning field-level provenance and blocking diagnostics on contradiction rather
than substituting silently.
- Closed, independently versioned expected-intent contract assembled from saved, resolved authoring
inputs before the model call, preserving locator chains, literal and reference values, keys,
assertion kinds and semantic options.
- Runner-side comparison of parsed operations against expected intent by exact count, order and
semantics.
- Readiness check re-deriving intent from one consistent immutable revision — never the mutable
draft — requiring canonical-JSON equality with the persisted intent.
- Byte-exact preservation of awkward values through resolution and serialisation.

**Out of Scope**

- The review UI for resolved context.
- Live page learning.

*Split seam if this overruns: separate resolution and intent assembly from the readiness
re-derivation check.*

**Acceptance Criteria**

1. Resolution order is explicit step value, then step context, then global context, with policy
 authoritative; every resolved field carries provenance.
2. A contradiction produces a blocking diagnostic; nothing is silently substituted.
3. Variables and secrets remain opaque references through resolution; no secret value is serialised
 into intent.
4. Expected intent is assembled only from saved, resolved authoring inputs, before the model call,
 and fails closed on missing, duplicate, reordered, unknown-version or oversized expectations.
5. The runner rejects an extra, missing or reordered operation, a wrong target, value, key or
 reference, a changed locator scope, or a changed assertion kind or behaviour-affecting option.
6. Readiness derives intent from one consistent immutable revision and never reads the mutable draft.
7. Persisted intent must equal the derived canonical JSON exactly — operation count and order,
 locator chains, values, keys, assertions and options. Property order and insignificant whitespace
 may differ; array order and string bytes may not.
8. Missing, corrupt or mismatched intent, or a derivation failure, refuses execution before any
 execution state is created.
9. Empty, whitespace, Unicode, quote, slash and newline values survive resolution and serialisation
 byte for byte.

---

# Hardening

Closing the gaps and proving the controls hold in a deployed environment.

## 14. Studio API & UI — Enforce access rules on every Studio action

**Points:** 13

**In one line:** Close the authorization gaps across the surface — typed secret references end to
end, inventory write checks on create, save and delete, non-oracle refusals, and a frontend that
rejects a malformed success response.

**Goal**
Make every Studio route enforce the same authorization rules, and make refusals reveal nothing about
what exists.

**Scope**

- Declared variable and secret references keeping their type from the confirmed revision to the
browser; values resolved at dispatch and never carried in the job body.
- Secret *use* authorised as its own decision rather than inherited from draft access.
- Create, save and delete enforcing the same inventory-ownership write check that compile, confirm
and execute already enforce.
- Unknown, soft-deleted and quarantined drafts returning the identical refusal, so no status code
acts as an existence oracle.
- The video route declaring every status it returns, with its unauthenticated response body matching
what the authentication filter actually writes.
- Frontend bootstrap requests rejecting a success response whose body does not match the declared
type, failing the same way a network error already does.

**Out of Scope**

- The real identity gateway and vault, owned by the platform team; the secret store stays stubbed.

*Split seam if this overruns: separate the backend authorization checks from the reference-typing
and frontend bootstrap work.*

**Acceptance Criteria**

1. A variable or secret reference keeps its declared type end to end; the dispatch job body carries
 reference names, never resolved values.
2. Using a secret requires an explicit authorization decision, separate from draft access.
3. Create, save and delete are refused for a caller without write access to the draft's inventory
 owner.
4. Unknown, soft-deleted and quarantined drafts return byte-identical refusals.
5. The published contract lists every status the video route can return, the unauthenticated body
 matches the filter's actual output, and the hand-kept test copies agree in the same change.
6. A malformed bootstrap response yields fail-open defaults with the error flag set and the loaded
 flag true; no consumer crashes on an undefined array.

---

## 15. Deployment & Platform — Harden Studio for staging and hand it over

**Points:** 13

**In one line:** Turn controls that exist as launch flags and unit tests into controls proven in a
deployed cluster, close the authentication bypasses, and hand over with an honest register of what
is still open.

**Goal**
Prove the security controls hold in a deployed environment, and leave a handover stating what
remains and who owns it.

**Scope**

- Sandbox enforcement verified against the cluster's PodSecurity level and seccomp profile, not
merely requested by a launch flag.
- Network egress restriction enforced as cluster configuration rather than described in a document.
- Browser binary verification before launch.
- A real private object store replacing the local fake behind the storage seam.
- The event-stream route proven across the real ingress, with the bounded polling fallback engaging
without a contract change if the gateway buffers.
- Closure of all three authentication bypass paths as one change: the client-supplied identity
header path, the hardcoded service bypass and the temporary inventory read bypass.
- Helm manifests, configuration and the rollback procedure.
- Handover package: accessibility audit and fixes, operations runbook, rollback procedure, and a
register of every open item with its blocker and owner.

**Out of Scope**

- Cluster, ingress, egress, storage and browser-image provisioning, all owned by the platform team.
- Executing the staging acceptance itself, which cannot start until that infrastructure exists.

*Split seam if this overruns: separate the deployment hardening from the handover package.*

**Acceptance Criteria**

1. The browser starts under the cluster's PodSecurity level with the sandbox enabled, demonstrated
 in a deployed environment rather than locally.
2. Egress is restricted by enforced cluster configuration, and an unapproved destination is blocked
 in a live test.
3. The browser binary is verified before launch.
4. Evidence is written to a real private object store through the existing storage seam, with no
 caller change.
5. Live progress works through the real ingress, or the bounded polling fallback engages with no
 contract change.
6. All three authentication bypass paths are closed in one change; a client-supplied identity header
 no longer grants identity, verified by re-enabling each path in turn.
7. Helm manifests, the runbook and the rollback procedure are complete and reviewed.
8. An accessibility audit is complete, with findings fixed or recorded against an owner.
9. A single register lists every remaining open item, its blocker and its owner.

