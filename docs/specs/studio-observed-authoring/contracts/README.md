# Observed authoring v1 contract

Normative companion to [ADR-SC-004](../../../architecture/ADR-SC-004-observed-authoring.md). These are declared contracts for OBS-002–008, not deployed endpoints. Schema validation establishes shape; the semantic invariants below require trusted implementation and independent runtime tests.

## Files and verification

Run from repository root after the existing root dependencies are installed:

```sh
node tools/check-studio-observed-contracts.cjs
node --check tools/check-studio-observed-contracts.cjs
```

The checker reuses installed Ajv 8, ajv-formats and YAML; no new dependency or application package is added. It compiles all draft-07 schemas in strict mode, checks positive/negative fixtures, cross-document invariants and OpenAPI request/response examples. JSON Schema dialect is explicit in the OpenAPI 3.1 document. Schema IDs are stable identifiers, never remote fetch locations. Resolve them from this directory. A backend contract test and frontend MSW may load the same `fixtures.json` without depending on each other's implementation.

| File | Owner/meaning | Downstream |
|---|---|---|
| `common.schema.json` | Closed types: scope, coordinates, locators, operation union, exact compatibility tuple | All |
| `observation.schema.json` | Runner-generated sanitized current document, generation, structural nodes and coverage | OBS-002/004/005 |
| `planning-context.schema.json` | Immutable complete source checklist and input-table identity for initial planning | OBS-005 |
| `dependency-proposal.schema.json` | Bounded preliminary information needs before source state is reached | OBS-005 |
| `pending-bindings.schema.json` | Server allocation of stable handles while sources remain unobserved | OBS-003/004/005 |
| `authored-inputs.schema.json` | Trusted immutable nonsecret text/destination table from source | OBS-004/005 |
| `runner-context.schema.json` | Authenticated fenced materialization of that table and pending handles | OBS-003/004 |
| `proposal-result.schema.json` | Action, clarification, step-complete or unsupported outcome union | OBS-005 |
| `action.schema.json` | Model **proposal**, never admission; observed target plus durable locator and typed operation | OBS-004/005 |
| `binding.schema.json` | Server-issued string binding, local read recipe, ordered consumers and admission provenance | OBS-004/005/006 |
| `session.schema.json` | Internal durable scope, authorization, owner/fence, deadline and session-wide counters | OBS-003/004/007 |
| `session-view.schema.json` | Public safe projection; no runner owner, model prompt or raw observation | OBS-008 |
| `ledger.schema.json` | Durable one-action admission/dispatch/outcome identity | OBS-003/004 |
| `learned-plan.schema.json` | Exact exercised operations/locators and dependency graph; no current refs or values | OBS-006 |
| `revision.schema.json` | Cryptographic publication identity, including plan and provenance hashes | OBS-006 |
| `clarification.schema.json` | Safe choices bound to session/document/generation and deadline | OBS-005/007/008 |
| `result.schema.json` | Guided/replay identity, failure/publication conflict, evidence timing | OBS-006/008 |
| `commands.schema.json` | Authenticated command DTOs, separate from model output | OBS-003/004/006/008 |
| `limits.schema.json` | Initial ceilings and defaults | All |
| `error.schema.json` | Closed data-free error codes | All |
| `fixtures.json` | Synthetic integrated publication, standalone shapes, negative mutations and canonical vector | All |
| `../openapi.yaml` | Public and internal routes, authentication, request/response examples | OBS-003/004/008 |

Every schema rejects unknown properties. Version increments require a new schema ID and compatibility decision, even for additive fields; unknown fields are never silently dropped to make a proposal pass. IDs are opaque nonempty strings (max 256 characters), hashes are lowercase 64-character SHA-256 hex, counters are nonnegative integers, timestamps are RFC3339 UTC. Schemas check format; services compare instants, not timestamp spelling. All command body session IDs must equal the path and authenticated session. All strings are well-formed Unicode; reject unpaired surrogate code units before canonicalization or byte accounting.

## Source, scope and operation semantics

`sourceRevision` and `configurationRevision` resolve immutable server snapshots. No caller supplies `principalId`, CSI grants, capabilities, allowed origins or policy IDs in Start. The backend derives them from the authenticated user, selected test/configuration and approved account. `accountRef` is an authorized connection reference, never a secret. Start fails before application actions when its connection cannot be provided. Auth mode `sameSessionHandoff` requires a supported connection to this exact isolated browser; no local browser storage import is inferred.

`scopeHash` covers every field in the canonical scope, including principal/CSI/environment/application/account, exact origin list, source/configuration, model-data policy, explicit value-transfer policy or null, and capability list. List order is preserved by hashing. Server construction sorts and deduplicates `approvedOrigins` and `capabilities` before freezing scope. Recheck current grants and policy at admission, advancement and finalization. A model cannot broaden scope. Origin membership alone never authorizes an action inconsistent with the displayed checklist.

Step IDs are stable from immutable source; `ordinal` is zero-based, contiguous within that step, and does not reset on retry. Actions follow source order. A compound source step may yield multiple actions, including a read and a later assertion. No step can be silently omitted. The backend determines `requiresAssertion` from the approved semantic plan, preserving authored assertions; the model's confidence is not proof of intent. Independent semantic tests remain required.

Operations are a closed union: click/check/uncheck/hover, fill, press (bounded key enum), selectOption, navigate, read and assert. No JavaScript, evaluation, arbitrary DOM traversal, CSS execution or network requests are accepted. `authoredLiteral.sourceInputId` references immutable user-authored nonsecret input, never text copied from a page/model sample; trusted code resolves it under the source revision and checks intent and type. `destinationInputId` likewise references a server-validated authored destination; validate the resolved URL and every redirect against scope. Existing structured secret handling remains a distinct trusted account path, not a hidden business-value binding.

`assert.visible` requires `expected=null`; containsText/hasValue/url/title require a non-null permitted argument. URL/title/navigate use the page target and a null learned-plan locator; other operations require a node target. No business binding is allowed in URL/title assertions, navigation, locator names or key arguments; binding consumers are only fill.value, selectOption.value and text/value assertion.expected. Model proposals cannot invent argument slots. The trusted validator enforces these predicate-specific rules in addition to JSON shape.

## Preliminary planning, inputs and proposal outcomes

Before any application action, the backend sends `planning-context` with the entire immutable checklist, stable step IDs, source/scope identity and authored-input hash to its gateway planner. It returns `dependency-proposal`: at most 32 pending needs with model-local `needId`, semantic label, expected string type, producer step and explicit future consumer step/slot. There are no observed node IDs, business values, read recipes or fabricated admissions at this stage. Labels are sanitized suggestions, never authority to access a field. Missing step IDs, duplicate needs, nonexistent/earlier consumer steps or forbidden slots reject the proposal; same-step needs remain possible but resolved producer ordinal must precede its consumer ordinal. A successful empty need list means no cross-action value reuse was inferred, not permission to ignore authored assertions.

`dependency-admissions` independently validates this plan against the full authored task and scope and issues `pending-bindings`. Only the backend assigns stable `bindingId`; model-supplied IDs are rejected. Each pending handle retains need/source/consumer intent and is `PENDING_SOURCE`. The trusted runner receives it in `runner-context` before execution. On the source step, an observed, uniquely resolved, policy-approved local read admits the producer, supplies the actual recipe/origin and creates the evidenced `binding` with producer admission. The identifier remains unchanged. Once actual consumer ordinals are resolved, every planned consumer must map to its concrete permitted edge before publication. No PENDING_SOURCE handle is executable or publishable. Model output cannot mark a handle resolved. A newly discovered need can be admitted while its source state is still available; after the source is gone, return MISSING_SOURCE without revisiting effects. Replanning creates a new validated pending-plan hash within original budgets. The final snapshot is cumulative: retain every admitted need and stable allocation that produced an exercised binding or consumer, including needs admitted by replanning. Verify both directions between cumulative needs, allocations and executed edges; an executed binding or consumer absent from that admitted snapshot is invalid. Previously executed edges cannot be erased by replacing a later planning response.

`authored-inputs` is constructed by trusted backend source/configuration handling, not model text extraction into arbitrary literals. Each unique `inputId` identifies exact user-authored nonsecret text or a destination, its source step and value; the immutable source revision retains that mapping. If a phrase cannot be mapped unambiguously to authored input, clarify before allocation. Raw observed values, generated sample literals and passwords/secret references cannot enter the table. Schema cannot recognize a secret in arbitrary text; approved source classification and outbound sanitization remain mandatory. Context transports only configured nonsecret values; account credentials stay in the existing separate trusted account channel.

The authenticated backend materializes the table through the internal `context` route with session, scope, owner fence, exact `authoredInputsHash` and pending bindings. The runner validates the complete table before resolving IDs; wrong source step, missing ID, wrong type, stale fence, hash/scope mismatch or unauthorized destination rejects use. The table is frozen with source/configuration and does not supply mutable runtime binding values. Its hash travels in planning and runner context; the immutable source snapshot is the durable source of its identity. Source revision IDs must be immutable and server-issued, not caller-reusable aliases. URLs use `destination` entries; action/assertion text uses `nonsecretText` entries. Actual destination URL validation and redirects use existing trusted destination policy.

A next-action request returns `proposal-result`, never an implicitly executable action: `action` contains a typed proposal, `clarification` contains a scoped current question, `stepComplete` lists successful admissions for the specific source step, and `unsupported` contains a data-free error. The backend verifies every listed admission belongs to that session/step and succeeded, independently checks completeness and required assertions, then advances to the next step or finalization. Empty/foreign/failed admissions cannot complete a step. A model's stepComplete is not a successful result or ready revision. Clarification binds the current generation; an answered stale question is rejected and safely re-observed, not applied to another page. Unsupported ends or pauses according to the explicit error policy; it never drops the source step.

## Observation and durable correspondence

`documentId` changes on top-level document replacement; `generation` increases across all observations after an action that may mutate state, navigation or relevant external mutation. It never resets within a session even when documents change. After a state-changing action, collect a fresh observation before another proposal. Read/assert may reuse a generation only if the trusted collector establishes unchanged relevant state. Timestamp, URL and cached HTML hashes are not freshness proofs.

Node IDs are opaque, unique within document/generation and never durable selectors. Every node inherits its observation's document and generation. `depth` is the depth of the emitted sanitized observation tree: a node with `parentNodeId=null` has depth 0, and each retained child has its retained parent's depth plus one. Omitted layout elements do not consume observation depth. `parentNodeId`, `regionId`, `formId` and `labelNodeIds` represent sanitized in-observation relationships, with missing relationships null/empty. Every non-null relationship references a retained node in the same observation; parent relationships are acyclic. After withholding a node, normalize retained parent links and depths together. `locatorHints` are approved exact semantic locators. Visible name/role metadata is sanitized structural evidence, not current field data. `classification` and `policyRuleId` come from trusted field/region policy, not from the model. Withheld regions use coverage counters; sensitive controls/labels should normally be omitted rather than described. `complete=false`, `truncated=true` or withheld context never authorizes a guessed source/target; supplement a bounded safe neighborhood or clarify/stop.

**Reserved-v1 depth clarification — OBS-002, 2026-10-08:** this explicitly replaces the earlier ambiguous “collector traversal depth” wording before deployment. It defines the emitted semantic tree, including bounded-DOM fallback nodes, separately from private DOM inventory. Private inventory has fixed, independently enforced element/depth bounds (initially 4096 visited elements and 64 DOM edges, document root at edge depth 0) within the existing 50ms collector time ceiling; stack growth, ancestor checks and open-shadow traversal remain bounded. Configured observation limits may lower the outgoing ceilings of 500 nodes, depth 8 and 32768 serialized UTF-8 bytes; none of these ceilings or session budgets increases. The full private-value and locator-candidate inventory must complete before correspondence can be established; exhaustion withholds usable nodes and refuses identity proof. These private limits are implementation constants, not new public DTO fields. This coordinated clarification changes no schema shape, schema/version ID, canonicalization algorithm or deployed compatibility promise. Updated examples and their observation/request hashes describe the clarified tree; earlier review evidence remains historical.

Immediately before dispatch, the runner resolves the durable locator uniquely, checks it is the **same DOM element** as `nodeId` in the same document/generation, checks visibility/actionability appropriate to the operation, and pins that target for read/fill. Multiple matches, zero matches, stale generation or target replacement invalidate admission before browser action. No `.first()`, fallback to another plausible Submit or locator-role reinterpretation is permitted in observed-1. This stricter exactness is versioned independently from legacy runner semantics.

The ledger's `policyDecisionHash` identifies the canonical trusted admission decision: scope/authorization, proposed operation hash, current node/document/generation, resolved locator/node correspondence, capability and read-policy checks, and current owner fence. Persist the decision audit under the existing evidence policy without values. It is generated by trusted code, never accepted from model output. The fixture checker compares declared locator correspondence; it cannot demonstrate live DOM identity. OBS-002/004 must test real replacement/race cases, not promote matching hint strings into a runtime proof.

## Local dataflow and origin policy

The server allocates `bindingId` after validating preliminary dependency needs, before the source state is reached. It binds the read recipe and producer admission only when that source is actually observed and admitted. `producer` identifies its read action; `consumers` enumerate every permitted downstream argument edge. The producer must precede every consumer in actual action order, including ordinals in a single step. Source intent, recipe, origin and producer admission must match. Every read has one binding and every binding consumer resolves to one existing edge. Duplicate binding IDs, missing sources, cycles and forward references fail closed. Plan assembly must capture anticipated values before leaving the source page; it cannot revisit/recreate a mutation to invent missing historical evidence.

`visibleText` reads exactly one visible permitted business-data node. `controlValue` reads the current value of exactly one positively classified `nonsecretApproved` control whose actual type is text/search/email/tel/url/textarea and whose configured field/region rule plus source intent permit it. Password and hidden controls are forbidden even when ARIA reports a textbox. Merely lacking `password` is insufficient. Neither read trims, normalizes Unicode, reformats, substitutes sample literals nor truncates accepted data. Reject empty/Unicode-whitespace-only strings, invalid Unicode and oversize UTF-8 byte sequences. Preserve leading/trailing whitespace on otherwise valid strings. Store only in a run-local map and destroy it on cancellation, expiry, terminal completion and worker teardown. Bindings carry metadata, never the value.

Origin format is the canonical WHATWG HTTP(S) origin: lowercase/punycode host, normalized IPv6 brackets, no credentials, path, query, fragment, trailing slash or explicit default port. HTTP and HTTPS are supported, including `http://localhost:3000`, `http://127.0.0.1:4173` and `http://[::1]:4173`. Normalize configured URLs with the existing destination policy before snapshotting; serialized origins must already be canonical. Validate ports through URL parsing, DNS labels and allowlist policy; regex alone is insufficient. A local fixture origin still requires explicit approval in its fixture configuration. This does not expand SSRF/network policy.

Same-origin value transfer is the default. Different origins require `binding.transferPolicyId` equal to the configured `scope.valueTransferPolicyId` and a trusted policy lookup that explicitly allows the source, destination, data type, application and account. A non-null arbitrary ID is not sufficient in production. The model cannot infer this policy. This does not govern the website's own form/network side effects. Missing/ambiguous sources pause with data-free focused choices; expired or unobserved historical sources stop with `MISSING_SOURCE` and never silently replay.

## Session and action state machines

Session transitions are compare-and-set against state, owner fence, scope and deadline. No transition out of a terminal state may restore readiness.

| From | Event/guard | To |
|---|---|---|
| PREPARING | Approved account connected and browser established | OBSERVING |
| PREPARING / OBSERVING | Supported same-session auth needed | AWAITING_AUTH |
| OBSERVING | Fresh sanitized observation committed | PROPOSING |
| PROPOSING | Valid unique current proposal durably admitted | ACTING |
| PROPOSING | Ambiguous or insufficient evidence | AWAITING_CLARIFICATION |
| AWAITING_CLARIFICATION | Authenticated current choice; same source/scope/generation | OBSERVING |
| AWAITING_AUTH | Trusted same-session connection completes | OBSERVING |
| ACTING | Action succeeded, further work remains | OBSERVING |
| ACTING | Last required action/assertion succeeded and complete plan assembled | FINALIZING |
| FINALIZING | Atomic publication succeeds | SUCCEEDED |
| FINALIZING | Source/config/revision publication conflict after successful work | PUBLICATION_CONFLICT |
| Any nonterminal | Definite policy/validation/assertion failure | FAILED |
| Any nonterminal with dispatched action | Lost acknowledgement/crash/uncertain effect | UNKNOWN_OUTCOME |
| Any nonterminal | Cancel/revoke or hard expiry | CANCELLED / EXPIRED |

`SUCCEEDED`, `PUBLICATION_CONFLICT`, `FAILED`, `UNKNOWN_OUTCOME`, `CANCELLED`, `EXPIRED` are terminal. Cancelling/expiring an in-flight action revokes all future actions and publication; retain that action's uncertain result in the ledger. Terminal callbacks may append bounded diagnostic evidence only, never revive or publish. `UNKNOWN_OUTCOME` result copy is “Stopped — submission outcome unknown.”

| Action from | Event/guard | To |
|---|---|---|
| absent | Persist unique action identity and validated admission before send | ADMITTED |
| ADMITTED | Atomic consume with matching fence/deadline/scope/target and `dispatchCount=0` | DISPATCHING; set count=1 before browser call |
| ADMITTED | Cancellation/expiry/pre-dispatch mismatch | REVOKED (count=0) |
| DISPATCHING | Trusted matching successful callback | SUCCEEDED (count=1) |
| DISPATCHING | Definite error/assertion failure | FAILED (count=1) |
| DISPATCHING | Timeout, lost ACK, owner crash or uncertain effect | UNKNOWN_OUTCOME (count=1) |

No terminal action transitions, no DISPATCHING→ADMITTED, no automatic retry after dispatch. `assertionPassed` is true/false only for assertions, otherwise null; `outcomeCode=OK` iff SUCCEEDED, PENDING for nonterminal, specific failure otherwise. A dispatch consumer also durably remembers consumed admission IDs before invoking the browser; reconnecting/replaying control messages cannot invoke twice. Reclaiming an owner does not reopen a consumed admission. An uncertain gap between consume and actual call deliberately sacrifices completion to prevent duplicates.

Start idempotency key namespace is `(authenticated principal, route, testId, key)`; command namespace is `(sessionId, command route, key)`. Persist canonical request digest and response atomically with acceptance. Same key/digest retrieves existing state; same key/different digest returns `409 IDEMPOTENCY_CONFLICT`. Independently enforce unique `(sessionId, stepId, ordinal)` and admission ID so a new HTTP key cannot duplicate an action. Outcome callbacks compare session/admission/operation hash/fence and allow only identical repeat delivery. No automatic mutating POST retry in clients/proxies.

Owner acquisition increments a monotonic fencing integer by CAS; the durable owner record includes worker ID and lease deadline. Services and runner check both fence and unexpired lease before advancement. Only an undispatched session with a recoverable live isolated context can resume under a new owner; lost context with prior effects stops. Observation/model retries count toward the original session budget. Lease renewal never extends `expiresAt`. The trusted reaper performs expiry; no model/user expiry command exists.

## Finalization and immutable identity

All hashes use UTF-8 of `canonical-v1`: JSON without whitespace, lexically sorted ASCII object keys, preserved array order and Unicode string contents, JSON string escaping, no normalization, finite safe integers only (no negative zero/floats), booleans and null. Reject invalid Unicode. This is a deliberately bounded JSON contract, not an assertion of generic RFC8785 support. The shared non-ASCII hash vector prevents Java/JS drift. Raw artifact hash is SHA-256 over the exact UTF-8 lowered artifact bytes; fixture artifactHash is explicitly synthetic and does not prove lowering.

`operationHash` covers `{coordinate, origin, locator, operation}` from the exact executed plan action. `observationHash` covers the complete sanitized observation. Ledger `requestDigest` hashes the full accepted proposal. `learnedPlanHash` covers the complete plan, including versions, source order, all actions and hidden bindings. `admissionProvenanceHash` covers an ordered array of `{coordinate, admission, operationHash, scopeHash}` from the ledger. `revisionId` hashes every field of the revision object except `revisionId` itself, thereby binding source/configuration, scope, plan, artifact, provenance, Run authorization and versions.

Within one backend transaction lock/CAS the test source/configuration and session row; recheck principal/CSI/account entitlements, policy, owner/fence, lease and session expiry. Require FINALIZING, no cancellation, all source steps represented, every intended assertion passed, every admitted action SUCCEEDED with one dispatch, complete budgets and no uncertain/failed/partial work. Reconstruct the plan from trusted executed ledger operations; schema-validate and verify bindings/locator correspondence, canonical hashes and deterministic operation-equivalent lowering. No LLM regeneration is accepted as exercised code.

Insert immutable plan/artifact/revision and provenance, set the test's ready revision only if its source/configuration/scope still match, and record the terminal guided result atomically. Only then return the published revision ID. Duplicate identical finalize returns that transaction's result. Any source/configuration conflict produces PUBLICATION_CONFLICT with null ready revision and preserved execution evidence; never reuse old green evidence under a changed hash. Failure/cancel/expiry cannot publish. Finalization itself calls no browser and no gateway and activates no schedule. Model/version changes never silently rewrite history.

## Limits and output policy

All counters cover the entire session, including repair, auth/clarification pauses and fallbacks. Config may lower these initial ceilings. Raising a ceiling requires an explicit reviewed configuration/version decision and updated fixtures; the numbers are design bounds, not measured performance claims.

| Limit | Default/initial ceiling |
|---|---:|
| Session wall time including pauses | 600 seconds |
| Actions / observations / model proposals | 200 / 400 / 100 |
| Model input tokens / output tokens total | 128000 / 32000 |
| One sanitized observation | 32768 UTF-8 bytes |
| Observation nodes / depth | 500 / 8 |
| Sanitized evidence total | 1048576 bytes |
| Live runtime values / one value / aggregate | 32 / 4096 bytes / 65536 bytes |
| Source steps / statements per source step | Existing defaults 100 / 8 |

Reserve budgets before model/action work; settle actual model usage afterward, treating missing usage conservatively. Count the serialized outgoing observation bytes, not JS string length. Reject oversize values rather than truncate and reject budget excess before dispatch. The contract verifier applies lowered limits to actual source steps, actions, observations, statements, node counts/depth and retained binding counts as well as session counters. Counters may include extra repair work but cannot be below the materialized action/observation/proposal counts or encoded observation bytes. Actual model token usage is not present in the static fixture bundle; its authoritative counters still need gateway/runtime enforcement. Aggregate value usage is the sum of retained encoded values, replacement releases the old allocation only after validating the replacement; binding IDs are write-once in a run. Existing artifact/AST/string/selector/regex/time limits and configured worker concurrency also apply; observed limits cannot bypass them. Runtime bounds map to `studio.guided-authoring` kebab-case configuration keys named in the approved plan. Capacity and retention use existing deployment settings; sanitized evidence retention must be explicitly configured before pilot (no implicit infinite retention). Raw snapshots are never persisted. Cross-run observation/value caches are disabled for this version.

Public errors use enum code/messageCode/requestId; never interpolate page values, raw model text, credentials or scope details from another CSI. Diagnostics, telemetry, manifests and gateway payloads exclude actual values. Video remains protected by authorized evidence access/retention and may show page data. Gateway-wire-byte canary testing, sensitive label tests, real same-session auth and real-model semantic outcomes are later implementation gates.

## API and MSW consumption

**Public authentication erratum — OBS-003 DOC-001, 2026-10-08:** the coordinated OBS-003 review supersedes the earlier public bearer/JWT wording from OBS-001. Public APIs preserve the established `put_session` BFF-cookie transport and reject bearer-only user identity. This documentation correction changes no JSON body/schema shape or internal service JWT/mTLS requirement.

[OpenAPI](../openapi.yaml) contains exact public/internal request bodies and synthetic responses. Public requests authenticate with the existing platform BFF session cookie `put_session` (`PlatformSession` in OpenAPI), from which the backend resolves the trusted platform principal; the backend checks ownership and CSI permission on every read and command. Internal service JWTs are audience-bound to the controller/runner and combined with configured mTLS; a user token cannot call internal routes and a service token cannot impersonate a user on public routes. Body/path principal or session claims never override authentication. `x-service-role` is normative: owning-worker routes require the service subject to equal `session.owner.workerId`; backend-controller routes require the controller audience/role and act only on the current owner's validated admission. Knowing a fence does not authorize a different worker. The context/advance receiver checks the addressed runner instance is the current owner. Claim performs owner acquisition by CAS, not arbitrary overwrite.

Internal `claim`, `dependencies`, `dependency-admissions`, `context`, `observations`, `proposals`, `admissions`, `advance`, `outcomes` and `finalize` are separate transitions. Proposals are backend gateway calls; no model credentials go to the runner. `advance` returns durable dispatch state, not proof of browser success. `outcomes` accepts only the runner-owned admission and verifies all server-owned ledger fields against storage. Client-provided ledger state is a report, never authoritative admission creation. Finalize computes hashes itself and compares the supplied expectations. All authenticated internal calls other than claim additionally require the current owner fence in `X-Owner-Fence`; internal `claim` uses `expectedFence` in its body.

Status mapping: 401 missing/invalid identity; 403 scope/account entitlement denied (without foreign evidence); 409 stale generation/target/fence, idempotency/source/publication conflict, unknown outcome or runtime incompatibility; 422 malformed operation, sensitive source, binding order/missing source, unsupported surface; 429 budget/capacity. Authentication connection required pauses only when a real handoff is available; otherwise return actionable `AUTH_CONNECTION_REQUIRED` before browser actions. `retryable` means a read/observe or pre-dispatch retry is safe, never permission to repeat uncertain browser work. Default false for all sample errors. Checker-only diagnostic categories map to these public codes: AUTHORED_INPUT/DEPENDENCY_PLAN/SCHEMA/NODE_RELATION → INVALID_CONTRACT, VALUE_LIMIT/BUDGET → BUDGET_EXCEEDED, EMPTY_VALUE → MISSING_SOURCE, INVALID_UNICODE → INVALID_CONTRACT. They are not additional public error variants.

Frontend MSW in OBS-008 can import `fixtures.json`, clone `documents.result`, `documents.conflict`, `documents.clarification` or a public projection and respond using `HttpResponse.json` from the existing MSW dependency. Do not mount internal handlers in the public mock transport. Example fixture mapping:

```ts
// Illustration for OBS-008; no frontend runtime change is shipped in OBS-001.
http.get('/api/v3/studio/guided-sessions/:sessionId/result', () =>
  HttpResponse.json(structuredClone(fixtures.documents.result)));
// Select documents.conflict to show “Run completed; steps not ready to repeat.”
// Select documents.replay only after a separate replay execution.
```

The same fixture corpus exercises multiple ordinals within step-2. No fixture value represents real business data. Shared integrated fixtures are post-completion snapshots; API intermediate responses use intermediate state projections.

## Deployment/version strategy

Deploy additive DB ledger/revision storage first, then compatible backend/runner/validator/lowering support, then frontend/MSW contracts behind a disabled observed-path flag. Reserve artifact v2/reference-policy 3 and observed-1 compatibility separately from legacy paths. OBS-006 must supply deterministic lowering, its restricted artifact v2 schema and measured compatibility pin checks before enabling. Every participant advertises the exact full `versions` tuple; any mismatch is `RUNTIME_INCOMPATIBLE` before browser launch/advance/publication. Never label an incompatible artifact ready.

Before enabling, run the shared corpus in Java and Node, actual sanitized outbound-wire tests, duplicate/recovery/fencing tests, live first-run/no-hidden-replay proof and fresh-value repeated replay from OBS-009. OBS-010 owns account readiness, configured retention, benchmark thresholds and human pilot evidence. Deployment must not treat this schema suite as those gates.

For upgrade/rollback: disable new guided starts; drain active sessions up to their immutable deadline; cancel/mark uncertain any undrainable in-flight work; retain immutable old evidence; deploy only a mutually compatible backend/runner/UI tuple. Re-enable after probes. Rollback to legacy support leaves observed revisions blocked with a clear incompatibility state, never coerces them into artifact v1 or replays unfinished actions. Schedules remain separately activated and must resolve the exact compatible revision. Legacy manual/replay routes and schema pins remain untouched throughout.


### OBS-005 model-only and production question contracts

The additive observed-2 model-facing schemas are `planning-context`, `source-selection`, `guided-model-response` and `guided-planning-commands`; `clarification` supplies the previously missing production v2 question union. The existing v2 clarify answer remains unchanged. These additions do not alter OBS-004 runner/action contracts or historical v1 schemas/examples.

INPUT-POLICY-01 A permits deliberately authored nonsecret checklist text. Planning projections positively select that text, opaque reference/input metadata, accepted safe clarification locators and sanitized observations; they never embed `authoredInputs`, runner contexts, resolved saved variables, credentials or page values. Source selection uses the existing exact provenance union and server allocations. A compact ACTION result contains only admitted obligation ID and `{target,operation}`; the backend adds full bridge authority after validating the persisted original attempt. Unsolicited authority fields and arbitrary provider prose are rejected. UNSUPPORTED is a closed typed refusal.

Provider schema projection is self-contained and narrower than draft-07; local strict validation is always authoritative. Both identities and output-contract pins are frozen for continuation. `planning-fixtures.json` adds positive authored-text and negative private/authority cases to the shared checker. Passing these fixtures is structural evidence only; raw provider-byte, actual PostgreSQL/Chromium and semantic mutation evidence lives with OBS-005 development/QA records.

OBS-006 adds closed replay/publication contracts under `v2/replay-*.schema.json`, `v2/publication.schema.json` and `v2/revision.schema.json`. These are a separate artifact2/policy3/protocol2 execution family; no original v1 or guided-v2 schema is widened. `tools/build-studio-observed-schemas.cjs` packages all transitively referenced types and their conditionals into the pure Node validator. `publication-fixtures.json` contains original evidence and independently authored expected artifacts, source-free IPC examples and the ordinary admission tuple; `publication-canonical-vectors.json` preserves canonical-v1 byte/hash and rejection vectors. Java and Node derive and compare their results separately.

Historical learning provenance permits a null full prompt digest and null configured/returned model labels when the original manifest retained no exact evidence. `outputContractHash` and the original strict/provider schema provenance remain required. Learning provenance contributes to immutable publication evidence, but is never compared with current model defaults during saved replay. The original Java21 case-insensitive obligation/locator equality is reproduced with a pinned simple-case mapping; neither source bytes nor UTF-16 input spans are normalized.

Public result3/receipt readiness remains distinct from execution compatibility. Public finalize/result endpoints use live BFF/Core authorization, guided internal control retains JWT plus mTLS, and ordinary observed admission retains the restricted service-token boundary with deployment TLS. Strict schema/example checks are structural evidence; browser execution, database races and actual account connectivity require their respective integration evidence.
# Observed-choice publication proof

`replay-validation#/definitions/PreparationFact` has an optional closed `observedChoice` field with explicit witness version 1. Zero-choice and source-choice projections omit it entirely, preserving their canonical bytes; explicit null is invalid. Its original question/capture/attempt/plan, ordered 2–10 meaning alternatives and preparation-time acceptance receipt are private validation input. Original question observations join the same deduplicated observation pool as successful preparations and count in exact usage closure. Selected old and fresh nodes are proved separately with the same exact locator; mapping binding metadata grants no executable binding or read permission.

Each witness is bounded to 262,144 canonical UTF-8 bytes and each receipt to 16,384. At most 200 witnesses fit the preparation cardinality. The separate basis and request ceilings remain 6,291,456 and 8,388,608 bytes. Individual maxima do not promise that their Cartesian product fits these aggregate limits.

The executable profile remains unchanged. The regenerated packaged schema bundle has a new exact build identity, so an older build-pinned revision cannot run on that new bundle automatically. Retain or re-enable its supported exact build for saved replay; refuse when that build is unavailable. Deploy backend/runner/catalog as one supported validation combination and refuse an old-validator/new-witness or unsupported rollback tuple. Never remove a witness, reconstruct missing prospective evidence or translate old pins to obtain acceptance. The DB exporter separately checks all accepted observed rows; a standalone Node basis cannot reveal a same-target accepted DB row omitted by its caller.
