# Observed authoring contracts — v3 (the one generation)

Normative companion to [ADR-SC-004](../../../architecture/ADR-SC-004-observed-authoring.md) as amended by [ADR-SC-005](../../../architecture/ADR-SC-005-single-path-observed-authoring.md). [`v3/`](v3) is the only contract generation: STUDIO-OBS-012A (2026-10-12) retired the v1 root schemas, the v2 bridge generation and the separate observed OpenAPI documents after folding what remained in force into this directory and into the one public OpenAPI, [`docs/specs/studio/openapi.yaml`](../../studio/openapi.yaml). There is no compatibility layer and no fallback to an earlier generation.

Schema validation establishes shape. The semantic invariants below need trusted implementation and independent runtime tests; passing these fixtures proves no DOM correspondence, browser effect, database race, Vault lifetime or publication.

## Files and verification

Run from the repository root (root dependencies installed; Ajv 8, ajv-formats and YAML are reused, no package is added):

```sh
node tools/check-studio-observed-contracts.cjs      # v3 + the public OpenAPI
node tools/build-studio-observed-schemas.cjs         # regenerate the four runner bundles
node tools/build-studio-observed-schemas.cjs --check # byte identity, also enforced by studio-runner/test/generated-contracts.test.ts
```

The checker compiles every draft-07 schema and definition in strict mode, keeps every `$ref` inside v3, enforces the frozen UTC profiles, runs the semantic flow/plan/input/materialization/assignment/refresh fixture cases, the runtime read-value bounds, the canonical and refresh-correlation vectors, the secret cases, the planning fixtures, the replay/publication aggregates and observed-choice witness, and validates every public guided/observed request and response example in the public OpenAPI. Schema IDs (`https://checks.citi.example/contracts/observed/v3/…`) are stable identifiers, never fetch locations.

`tools/build-studio-observed-schemas.cjs` is the only writer of `studio-runner/src/guided/{schemas.json,types.ts}`, `studio-runner/src/validator/observedSchemas.json` and `studio-runner/src/executor/observedOperations.ts`; never edit them by hand. The backend `processResources` copies exactly `v3/*.schema.json` into the classpath at `studio/observed-contracts/v3/`; that copy is build output, not a second source.

| Area | Files |
|---|---|
| Session, limits, scope | `session`, `session-view`, `limits`, `versions`, `error` |
| Governed observation policy | `guided-policy` (public policy routes; `runner-context#/definitions/ObservationApplicationPolicy`) |
| Source and inputs | `authored-inputs`, `source-reference`, `source-selection`, `planning-context` |
| Guided planning and model output | `guided-model-response`, `guided-planning-commands`, `clarification`, `commands` |
| Bridge (backend ⇄ guided runner) | `bridge`, `runner-context`, `assignment`, `assignment-receipt`, `assignment-stop`, `assignment-lifecycle`, `observation-refresh`, `observation`, `execution-evidence`, `action`, `ledger`, `allocation`, `availability`, `producer`, `consumer-edge`, `binding` |
| Exercised plan and publication | `learned-plan`, `publication`, `revision`, `result`, `action-timing` |
| Replay family | `replay-profile`, `replay-operation`, `replay-policy`, `replay-artifact`, `replay-validation`, `replay-job`, `replay-ipc` |
| Fixtures and vectors | `fixtures.json`, `planning-fixtures.json`, `publication-fixtures.json`, `publication-canonical-vectors.json`, `wire-parity.fixtures.json`, `timing-order-vectors.json` (recording timing order and tie parity, backend `GuidedRecordingTimingsTest` and runner `test/guided/evidence.test.ts`) |

## Versions

Every guided envelope carries `versions`, exactly `{contract: 3}` (ADR-SC-005, STUDIO-OBS-012A); any other value — including any retired pin such as `executor`, `language` or `learnedPlan` — is a closed-contract refusal before browser launch, advance or publication. The replay profile is the same `{contract: 3}`; its canonical-v1 SHA-256 is `9ab82ccb46f99d2b0d9d873dfff963faa7e5fb5fb967e5f9f1916972c25ac9c8`, the `profileHash` of every `BuildIdentity`. The build identity is compared separately and unchanged: profile hash, packaged schema bundle hash, reference bundle hash, executable image digest and Chromium build (runner `assertBuild`, backend `ObservedReplayPins.supported`). Each document keeps its own `schemaVersion`/`version` const (learned plan 3, replay artifact 3, replay policy 4, replay job/validation 3, publication evidence 1, IPC protocol frames); only the cross-document pin tuple and the profile catalog collapsed. Playwright stays pinned by the runner package, lockfile, Dockerfile and recorded runtime versions (`scripts/check-pins.mjs`), and the browser by `chromiumBuild` and `executableImageDigest`.

## Secret login (OBS-007)

A declared secret input contains its `secretId`, declaring step, slot and provenance, never `value`. `fill.value={kind:secretRef,sourceInputId}` is paired only with a node-free `passwordControl` target. The model projection emits only its target kind; the backend derives document/generation from admitted observation evidence. Secret references are forbidden in `selectOption` and assertions. The collector exports only `coverage.passwordControls`, an integer from 0 through 500. Trusted runner code pins and rechecks the unique visible enabled password control; the count grants no model access to its identity or value.

`BridgeDispatch.secret` is a closed transient object present exactly for a secret fill: ID, value (1–4096), Vault version (1–256), and 1–16 origins (each at most 512). It is excluded from digest calculation. Idempotency separately binds the safe secret ID and source input ID; it never stores a value. Replay jobs and `Execute3` carry run-scoped `secrets` and `secretOrigins`; `Launch3` carries the safe scope. `Execute3.inputs` pairs ordinary materialized entries with value-less `{inputId,stepId,kind:secretRef,intendedSlot:fill.value,referenceName}` metadata so the child resolves the declared secret ID and checks its declaring step without inferring an ID from inputId. Empty maps are valid. `Result3.secretUse` records only ID-keyed `USED`, `NOT_USED` or `REFUSED` codes. The reference grammar is `^[A-Za-z0-9_.-]{1,64}$` throughout those maps.

## Public routes

The eight guided-session routes are public BFF routes under `/api/v1/studio/guided-sessions` in the one public OpenAPI: start, read, result, clarification, clarify, cancel, finalize and video (`getGuidedSessionVideo`, STUDIO-OBS-013). They authenticate with the platform `put_session` cookie like every public operation; the backend checks ownership and CSI permission on every read and command, and a body or path never overrides authentication. POST commands require `Idempotency-Key`. `retryable` means a read/observe or pre-dispatch retry is safe, never permission to repeat uncertain browser work. Finalize computes hashes itself and compares the supplied expectations; it performs no model or browser action. Public result/receipt readiness stays distinct from execution compatibility.

The observed replay surface in the same document is `POST /v2/validate-observed`, `POST /v2/runs`, `DELETE /v2/runs/{id}` and `POST /internal/studio/executions/{id}/observed-admission`, all on the restricted service identity.

## Internal bridge (backend ⇄ guided runner)

One internal mount, `/internal/v2/studio/guided-sessions/{sessionId}/…`. Every route is `POST`, carries `Idempotency-Key`, has no automatic POST retry (one stated exception: `recording-evidence`, below), and requires a short-lived issuer-provided RS256 JWT **and** mutual TLS. Controller-to-runner calls use audience `studio-guided-runner`, role `backend-controller`; runner callbacks use audience `studio-guided-controller` with the stated role (`owning-worker` requires the service subject to equal `session.owner.workerId`). Public BFF authentication cannot confer an internal role and a service token cannot impersonate a user.

| Route | Receiver | Caller role | `X-Owner-Fence` | Request | Success |
|---|---|---|---|---|---|
| `assign` | runner | backend-controller | none (`expectedFence` in body) | `assignment` | 200 `assignment-receipt` |
| `context` | runner | backend-controller | required | `runner-context` | 200 `bridge#/definitions/identity`; 409 `bridge#/definitions/refusal` |
| `prepare` | runner | backend-controller | required | `bridge#/definitions/prepare` | 200 `bridge#/definitions/preparation` |
| `dispatch` | runner | backend-controller | required | `bridge#/definitions/dispatch` | 200 `bridge#/definitions/outcome` |
| `observe` | runner | backend-controller | required | `observation-refresh` | 200 `bridge#/definitions/observation` |
| `stop` | runner | backend-controller | context variant only | `bridge#/definitions/stop` | 200 identity / `assignment-receipt` |
| `claim` | backend | owning-worker | none (`expectedFence` in body) | `commands#/definitions/claim` | 202 `session` |
| `bootstrap-evidence` | backend | owning-worker | required | `bridge#/definitions/bootstrap` | 202 `session` |
| `observations` | backend | owning-worker | required | `bridge#/definitions/observation` | 202 `session` |
| `outcomes` | backend | owning-worker | required | `bridge#/definitions/outcome` | 202 `session` |
| `lifecycle` | backend | owning-worker | context variant only | `bridge#/definitions/lifecycle` | 202 `session` |
| `recording-evidence` | backend | owning-worker | required | `bridge#/definitions/recordingEvidence` | 202 `bridge#/definitions/recordingEvidence` (echo of the accepted request) |
| `admissions` | backend | backend-controller | required | `action` | 202 `ledger` |
| `advance` | backend | backend-controller | required | `commands#/definitions/advance` | 202 `ledger` |
| `plans`, `proposals`, `dependency-admissions` | backend | backend-controller | required | `guided-planning-commands` | 202 |
| `planning-context` | backend | backend-controller | required | `guided-planning-commands` | 200 `planning-context` |

Status mapping: 401 missing/invalid identity; 403 scope entitlement denied (without foreign evidence); 409 stale generation/target/fence, idempotency/source/publication conflict, unknown outcome or runtime incompatibility; 422 malformed operation, sensitive source, binding order/missing source or unsupported surface; 429 budget/capacity. Failures carry bounded data-free codes. Checker-only diagnostic categories map to public codes: AUTHORED_INPUT/DEPENDENCY_PLAN/SCHEMA/NODE_RELATION → INVALID_CONTRACT, VALUE_LIMIT/BUDGET → BUDGET_EXCEEDED, EMPTY_VALUE → MISSING_SOURCE, INVALID_UNICODE → INVALID_CONTRACT.

A `context` reply is `200` identity or `409` `bridge#/definitions/refusal`. A refusal is definite: the worker's owned state (entry, runtime, binding, launch) is unchanged. `IDENTITY_MISMATCH` (policy hash or binding mismatch) and `SCHEMA` (a context the closed schema refuses, including one without `applicationPolicy`/`policyHash`) on `context` end the session `FAILED` with `RUNTIME_INCOMPATIBLE` on first receipt, without retry; every other refusal code, a timeout or a non-conforming body keeps the bounded unknown-outcome retry. A replayed `context` (same `Idempotency-Key`) that was refused before any runtime existed may answer `IDENTITY_MISMATCH` where the first answer was `SCHEMA`; both are definite.

Governed observation policy (STUDIO-OBS-014 AC-1). `runner-context.applicationPolicy` is the approved governed policy version frozen for the session at start, sent byte-for-byte as stored, and `policyHash` is the canonical-v1 SHA-256 of exactly that object. The worker recomputes it before the first observation and refuses a mismatch with `IDENTITY_MISMATCH`; a later context of the same session cannot change the policy in force. A worker-mounted `applicationPolicy` is `CONFIGURATION_DENIED` at start-up. The governed document (`guided-policy.schema.json#/definitions/policyDocument`) is stored normalized: omitted `sideEffectStance` = `CLARIFY_FIRST`, omitted `destructiveVocabulary` = the configured baseline, `allowedOrigins` and `destructiveVocabulary` sorted by code point, `readGrants` sorted by `policyRuleId`, `controlValue.types` in enum order. The session's `approvedOrigins` are the governed `allowedOrigins`, which must stay within the platform-trusted origins. Replay is unaffected: it keeps its published snapshot and the configured platform policy.

### Bridge identity, evidence and dispatch

All bridge identity envelopes are exact and closed: `schemaVersion`, `sessionId`, `workerId`, `ownerFence`, `scopeHash`, `contextId`, `contextRevision`, `sourceRevision`, `configurationRevision`, `versions`. The context identity is allocated by the backend for one worker/fence and never reused after teardown. Context revision is frozen input identity (currently 1); `materializationRevision` starts at 1 and increases on cumulative allocation/producer/consumer metadata. Context updates cannot change inputs or remove exercised metadata. Lease updates never exceed immutable `expiresAt`.

Context responds with the exact identity envelope (acknowledgement only); prepare responds with the preparation; dispatch responds with the outcome only when definitely completed, otherwise reports `UNKNOWN_OUTCOME`; stop responds only after teardown.

The evidence hash is canonical-v1 SHA-256 of the complete tagged `executionEvidence`. Bootstrap is a genuine fresh isolated `about:blank` page, generation 0 and JSON null origin; it can authorize only `sourceStepIds[0]`, ordinal 0, `navigate`. `operationHash` hashes `{coordinate, origin: executionEvidence.origin, locator: target.locator ?? null, operation}`; no source origin is fabricated. The request digest hashes the full proposal. Prepared proof cannot carry runtime data.

Dispatch includes the exact stored proposal/ledger/preparation ID and the consumer edges for that admission. Count = 1 alone is not controller authority: only a committed in-process winner sends it once. Local journal consumption precedes retained-target invocation; journal duplicates never invoke again; errors and uncertain gaps never retransmit effects. A successful read reports only availability `{bindingId, producerAdmissionId, contextId, workerId, ownerFence}`; runtime bytes and their lengths/digests/samples never leave the worker. The backend derives producer coordinate/origin/recipe from its immutable proposal. Consumer admission needs a successful earlier producer with same-origin transfer, a pending allowed slot/step and current local availability; the runner also requires its own local write-once value. Positive read classification/type and retained live element identity are checked again at invocation; context metadata is not permission to read arbitrary DOM.

Callback ordering is outcome-before-observation: a successful outcome must receive a durable backend acknowledgement before a fresh observation is sent, and the backend first transitions ACTING to OBSERVING. A lost final HTTP response never downgrades an already committed successful outcome. If outcome acknowledgement is uncertain, the worker stops locally and reports lifecycle `UNKNOWN_OUTCOME` without retrying the browser effect. Only unresolved DISPATCHING admissions become unknown. Cumulative context is pushed after allocation/read/consumer changes before the next dependent prepare/admission.

The trusted source boundary supplies classified nonsecret **regions**, not preselected semantic literals. A candidate span must be wholly contained in such a region with complete Unicode boundaries, and its kind and slot pass independent closed compatibility checks. Unclassified regions are never inferred safe. Authored nonsecret configuration strings may be empty or whitespace; runtime captured read values have the separate non-blank policy and the `limits` bounds (`maxRuntimeValues`, `maxRuntimeValueBytes`, `maxRuntimeValuesBytesTotal`).

Backend callback 202 replies preserve the full session shape; the runner discards bounded response bodies up to 1 MiB, which does not authorize larger action/observation/value limits.

### Guided recording evidence (OBS-013)

The guided runner records one video per session and reports it once, after the browser context closes, on `recording-evidence`. The body is the bridge identity plus `recordingId` (`^[A-Za-z0-9_-]{1,256}$`, generated once per session recording), `state` (`STORED`, `FAILED` or `UNAVAILABLE`; never `PENDING`, because the callback is sent only once the recording is settled), `partial` and `timings`. Only a `STORED` recording may be `partial` or carry timings. It carries IDs, integers and enums only: no object key, manifest reference, URL, timestamp, error text, label, locator or observation text. The backend accepts it from the owning worker by subject and fence equality within the session's settle window on the database clock, in any session state including terminal, and never revives session authority. Exception to the no-retry rule: this route performs no browser effect and is a same-key idempotent fact, so the runner may resend the byte-identical body under the same key (`rec-` + `recordingId`), at most 3 attempts, all inside the settle grace. Every other bridge route keeps the rule.

Object keys are derived, never transported: video `studio/{csiId}/guided/{sessionId}.webm`, manifest `studio/{csiId}/guided/{sessionId}.manifest.json`, `csiId` from the session scope, each segment `^[A-Za-z0-9_-]{1,256}$` or no key at all (fail closed). Java and Node derive them separately against `fixtures.json.guidedRecordingKeyVector`. Timing readings (`action-timing`, the one item definition shared by `result.actionTimings` through `result#/definitions/actionTiming` and by `recordingEvidence.timings`) are integer milliseconds on the ADR-002 §11.6 run clock, whose origin is taken once per session at guided recording-context readiness; the runner rounds each reading once at serialization and no origin, offset or calibration crosses the wire. The bridge sends only `kind: action` items (the schema's `clarificationWait` and `prefixReplay` are reserved for OBS-015 and refused by the backend in OBS-013); the backend derives the `step` items. Publicly, `result.evidence.video` is the `VideoEvidence` shape `{status, error, expiresAt, partial}` and `actionTimings` is non-empty only while `status` is `AVAILABLE`; a terminal result may still report `PROCESSING` while the recording settles. Since the S3 tightening (STUDIO-OBS-014 C2b), `video` is never `null`.

### Assignment and renewal

`assignment` is a closed immutable request (`schemaVersion: 3`, `assignmentId`, `sessionId`, `workerId`, `scopeHash`, `sourceRevision`, `configurationRevision`, `versions`, `expectedFence`, `expiresAt`) with no context ID, owner fence, input table or model data. The backend persists the assignment intent before any network request. The addressed worker reserves one capacity slot, durably records assignment creation/tombstones, and only then makes its own `/claim` with its mounted owning-worker JWT and client certificate. Claim responses are parsed and validated as the full session: exact session/scope/source/configuration/versions/hard deadline, canonical scope hash and scoped run authorization, actual owning worker, live lease and non-terminal state. Fresh acquisition returns `ownerFence = expectedFence + 1`; renewal preserves it. Nothing launches a browser until an acknowledged assignment and its matching materialized context both exist.

`assignment-receipt` is `{schemaVersion: 3, assignment, status, ownerFence, leaseExpiresAt}`; `/assign` returns 200 OWNED only after the worker validates its live claim grant. STOPPED receipts either retain both historical grant fields or have both null; historical fields never authorize more work. Assignment-scoped `stop`/`lifecycle` variants are `{schemaVersion: 3, kind: "assignment", assignment, reason}` without `X-Owner-Fence`; context variants keep the fence header.

Renew roughly every 10 s against the backend's 30 s lease with one outstanding bounded claim, a fresh key per renewal and no automatic POST retry. Only an acknowledged matching grant extends the local lease, never beyond `expiresAt`. A failed or lost renewal stops new work; a reply arriving after local stop or lease expiry cannot revive authority. Context delivery and lease acknowledgement are separate ordering domains: a context message never extends local authority.

### Explicit observation refresh

`observation-refresh` is the bridge identity plus `expectedGeneration` (0–2147483646). The runner returns 200 with the unchanged observation envelope only after the owning-worker `/observations` callback has its durable 202. The shared callback key is

```text
oref- + SHA256(canonical-v1({
  identity: <exact bridge identity from refresh request>,
  idempotencyKey: <refresh HTTP Idempotency-Key>,
  requestDigest: <SHA256(canonical-v1(full refresh request))>
}))
```

with `fixtures.json.observationRefreshCorrelationVector` as the golden vector. The backend locks the session and persists the refresh intent before RPC; it permits OBSERVING, or PROPOSING with no ADMITTED/DISPATCHING action, and refuses ACTING, terminal states and unresolved clarification. The worker collects a strictly greater generation within the remaining limits, preserves its value map, producer handles, action count and ordinals, and commits the callback before exposing new evidence. Duplicate same-key/same-digest requests join the original collection; changed content under a key conflicts; a cached response is usable only while the same owned context is live and current.

### Raw JSON and timestamps

Bridge timestamps use the shared UTC profile in `wire-parity.fixtures.json` (four-digit year, valid date, uppercase `T`, optional 1–9 fractional digits, terminal `Z`; offsets, leap seconds and excess precision rejected); replay, publication and revision documents use the millisecond `…sss Z` profile. No timestamp normalization or hash rewrite is permitted. Guided wire readers reject duplicate decoded keys, trailing JSON, malformed UTF-8, non-integer/unsafe numeric lexemes and negative zero before object validation, and never echo malformed input. Service JWTs have exactly `alg`/`typ` header keys and required `iss`, `sub`, `aud`, `role`, `iat`, `exp` claims with only optional `nbf`.

## Planning and model-facing contracts (OBS-005)

`planning-context`, `source-selection`, `guided-model-response` and `guided-planning-commands` are the model-facing schemas; `clarification` is the production question union. Every clarification choice carries `labelSource`: `AUTHORED` (authored step text), `SAVED_INPUT` (a saved-input or secret reference name, never a value) or `PAGE` (a sanitized page node label, which the UI treats as untrusted); `role` and `region` (`region` null when the node has none) are present exactly when `labelSource` is `PAGE` (STUDIO-OBS-014 AC-7). Reason `SIDE_EFFECT_CONFIRMATION` with prompt `CONFIRM_ACTION` is the side-effect confirmation question (STUDIO-OBS-014 AC-6). Planning projections positively select deliberately authored nonsecret checklist text (INPUT-POLICY-01 A), opaque reference/input metadata, accepted safe clarification locators and sanitized observations; they never embed `authoredInputs`, runner contexts, resolved saved variables, credentials or page values. A compact ACTION result contains only the admitted obligation ID and `{target, operation}`; the backend adds full bridge authority after validating the persisted original attempt. UNSUPPORTED is a closed typed refusal. Provider schema projection is self-contained and narrower than draft-07; local strict validation is always authoritative.

## Replay and publication (OBS-006)

Canonical-v1 string escaping is normative and equals ECMAScript `JSON.stringify` (RFC 8785 §3.2.2.2): `\"` and `\\`; the short escapes `\b`, `\t`, `\n`, `\f`, `\r`; every other code point U+0000–U+001F as `\u00` followed by two **lowercase** hexadecimal digits (U+001F is `\u001f`, never `\u001F`); nothing else is escaped — not `/`, not U+007F, not U+2028/U+2029, not any non-ASCII scalar, which is written as raw UTF-8. Unpaired surrogates are refused before serialisation. The `c0-controls` vector in `publication-canonical-vectors.json` and every `observationPolicyHashVectors` entry in `fixtures.json` pin this; Java (`GuidedContracts`), Node (`contracts.hash` and the other runner canonicalizers) and PostgreSQL (`studio_publication_canonical`) must each reproduce them independently.

The replay family (`replay-*`, `publication`, `revision`) is the artifact 3 / policy 4 / protocol 3 execution family. `publication-fixtures.json` holds original evidence and independently authored expected artifacts, source-free IPC examples and the admission tuple; `publication-canonical-vectors.json` preserves canonical-v1 byte/hash and rejection vectors. Java and Node derive and compare their results separately. Learning provenance may carry a null prompt digest and null model labels when the original manifest retained no exact evidence; `outputContractHash` and the original strict/provider schema provenance stay required, and provenance is never compared with current model defaults during saved replay.

`replay-validation#/definitions/PreparationFact` has an optional closed `observedChoice` witness (version 1). Zero-choice and source-choice projections omit it, preserving their canonical bytes; explicit null is invalid. Its question/capture/attempt/plan, ordered 2–10 meaning alternatives and preparation-time receipt are private validation input. Each witness is bounded to 262,144 canonical UTF-8 bytes and each receipt to 16,384; the basis and request ceilings remain 6,291,456 and 8,388,608 bytes. Never remove a witness, reconstruct missing prospective evidence or translate old pins to obtain acceptance.

## Deployment

Deploy backend, runner and catalog as one supported combination. Every participant advertises `{contract: 3}` and the exact build identity; a mismatch refuses before any browser action and never labels an incompatible artifact ready. Before enabling, run the shared corpus in Java and Node, sanitized outbound-wire tests, duplicate/recovery/fencing tests and the live first-run and repeated replay proofs; this schema suite is not those gates.
