# OBS-006 — exact-plan publication and ordinary deterministic replay

Status: proposed implementation design for independent architecture/runtime/data/QA and PO review. Story STUDIO-OBS-006 remains **Draft**. No implementation, migration, runtime support, readiness verdict or live-provider result is claimed by this document. Scope derives from consensus §§6–11 and AC-1–7; user authorization and INPUT-POLICY-01 A are settled. The entire-wave USD500 ceiling remains, with billing telemetry unavailable.

## 1. Verified baseline and boundaries

- OBS-004 is closed at reviewed source `765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d`; its actual authenticated bridge, source materialization, retained-target browser operations, private reads and producer/consumer persistence are prerequisites. Do not rewrite its gate or fixtures.
- OBS-005 is closed at reviewed source `b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57`. The final independent gate has 50 passing cases and no open findings. Its final affected group has 232 tests (231 pass/one unavailable live-provider skip), with 40 actual joined cases. Source/class/worker manifests and earlier failed reviews remain historical. Publication must preserve the exact-choice, one-obligation/one-admission, locked budget, schema-pin and metadata-ACK protections.
- `GuidedSessionService.completeStep` uses the production `GuidedStepVerifier` and ends at FINALIZING. Its current `finalizeSession` refuses v2 and publishes nothing. `GuidedTranslationCoordinator` excludes FINALIZING. A result/receipt must not pretend this already creates an ordinary execution/revision.
- Current ordinary compilation **already** auto-accepts under `CompileStateService.publishAcceptedCandidate`: persisted trigger RUN, same creating principal, current request/source/configuration/deadline, re-derived policy and atomic confirmation/head update. Preserve that path. Guided adoption is a distinct writer and `GUIDED_RUN` provenance, never a fabricated compile request or a claim of manual review.
- Ordinary replay is artifact1 / structural reference-policy2. `validator/schema.ts`, the legacy TypeScript AST, `executor/operations.ts`, IPC and `StudioDispatcher.referencePolicy` cannot execute hidden reads/bindings. `CompilePins` is artifact1; ordinary validator/executor/syntax pins are 2.0.0/2.1.0/2.1.0. Guided `v2/versions.schema.json` reserves artifact2/referencePolicy3/lowering1/observed-2, but reservations do not implement replay.
- `RunJob`/`JobEnvelope` do not carry revision provenance or observed origin/account scope. The runner's existing prelaunch version comparison compares its image record to its own constants; it is not a comparison to the immutable observed revision. Backend admission currently does not establish that join.
- The ordinary recorded `BrowserHandle` already exposes `createObservationSession`. Reuse that same page/recording context. `launchGuidedBrowser` is deliberately unrecorded; `GuidedRuntime` owns guided callbacks/journal/fences and must not become the saved replay engine. Legacy locator visibility/role fallbacks are not exact observed locator semantics.
- Next classpath migration is **V33**, checked against current V32 tip; recheck before implementation. Optional staged `backend/db/cutover/V19__studio_inference_candidate_identity.sql` is a separate capability and rejects a null compile request. V21 snapshots current authoring on revision INSERT; V24's identity index does not identify guided execution; V29 permits confirmation_source RUN/MANUAL only. V33 and the cutover procedure must address these facts explicitly.

References: [consensus](consensus-plan.md), [ADR-SC-004](../../architecture/ADR-SC-004-observed-authoring.md), [translation design](translation-design.md), [data reconnaissance](../../../.ai/STUDIO-OBS-006-data-recon.json), [runtime reconnaissance](../../../.ai/STUDIO-OBS-006-runtime-recon.json), [coordinator reconnaissance](../../../.aiox/waves/STUDIO-OBSERVED/publication-reconnaissance.md). Reconnaissance is advice, not approval. Any loose “manual confirmation” wording in it is superseded by the verified ordinary RUN behavior above.

## 2. Integration options and selection

| Option | Benefits | Costs / rejected behavior |
|---|---|---|
| A. Generate restricted TypeScript with new capture/get primitives | Familiar artifact editor; reuse the AST traversal | Adds grammar, reference rules and canonical source generation solely for server-owned dataflow; must prove generated text parses back to exactly the observed operations; changes legacy language/prompt/corpus pins and increases accidental capability surface. Viable but larger. |
| **B. Closed declarative observed artifact2, pure lowering/validation, explicit observed branch in ordinary execution** | Direct operation equivalence; no generated program text or parser grammar; preserves v1 semantics; normal admission, child isolation, step clock, recording and evidence remain authoritative | Requires explicit artifact/policy/profile/job/IPC discrimination and a strict observed adapter. Some envelope/compatibility code is shared; its tests must cover both families. **Chosen proposal.** |
| C. Replay by creating another guided session/GuidedRuntime | Reuses the authoring orchestrator | Wrong ownership/evidence path, risks model access and historic admissions as new rights, starts unrecorded browser and creates a second replay ledger. Rejected. |

B is the smallest coherent semantic extension. “Lowering” means a pure conversion from the canonical exercised plan to a bounded typed replay language/IR; it does not mean JavaScript generation. No AST expansion is needed. Existing v1 AST, reference policy, prompt and syntax corpus remain byte/behavior compatible. No new dependency, infrastructure service or unrestricted browser evaluation is proposed.

```mermaid
sequenceDiagram
    participant U as Authenticated Run client
    participant G as Existing guided execution
    participant P as Publication API / publisher
    participant V as Pure runner validator
    participant C as Existing Core identity API
    participant D as PostgreSQL
    U->>G: One scoped Run (source/config/account)
    G->>D: Immutable source + pre-effect publication base
    G->>D: Actual admissions/outcomes/reads/edges/assertions
    G-->>U: FINALIZING
    U->>P: Automatic finalize POST, live BFF cookie
    P->>D: Lock / assemble exact evidence snapshot
    P->>V: Validate artifact, graph and operation equivalence (no browser)
    V-->>P: Hash-bound deterministic verdict
    P->>C: Fresh identity / entitlement, outside locks
    P->>D: Recheck + atomic revision/receipt/head/session commit
    P-->>U: Published receipt, learned-from-execution
    U->>G: Later explicit ordinary Run request
    Note over G,D: Ordinary acceptance/dispatch/admission + recorded child replay; no gateway
```

## 3. Normative contracts and independent original evidence

The revision-2 appendices freeze the implementation contract, replacing the initial review draft's open schema/ABI choices: [publication-data-contract.md](publication-data-contract.md) (D1–D8) and [publication-contracts.md](publication-contracts.md) (C1–C12). These documents are one design; no implementation/PO/QA approval is implied. The initial three NEEDS_CHANGES records remain unchanged. The resolution map is `.ai/STUDIO-OBS-006-design-resolution-r2.json`; R1 resolution and all reviews remain immutable history.

Current OBS-004/005 does **not** retain every original observation: progress overwrites it and preparation rows keep proofs without target facts. New base-enabled sessions therefore capture bounded immutable sanitized observations and preparation facts transactionally in `GuidedSessionService.storePreparation`, then atomically join the exact selected proof to the real admission in `admit` (D2). Missing original facts refuse before effects; old sessions cannot be retroactively adopted. Existing source/owner/fence/proof checks remain. No captured values, raw DOM or resolved input values enter this evidence store.

The pure `GuidedPublicationEvidenceRepository` reads original rows to produce independent ValidationBasis1. Node resolves each original target from its exact observation and verifies proposal/preparation/ledger/source/materialization identities before deriving its own guards/input mappings/operations. It compares those to the lowerer's artifact; it never uses the supplied artifact guards as their own evidence. `basisHash` is bound through snapshot, claim, verdict, receipt and final CAS. Facts not originally observed—such as a precise subtype hidden by controlType=other or a historical policy-file digest—are not invented.

Order is immutable sourceSteps order then ordinal, never action repository UUID lexical order. The final stored translation plan preserves both obligationId and allocated needs[].bindingId and its actual stored hash; original initialBlank page target/document/generation remains intact even though observation/origin/derived locator are null. Every accepted obligation has its one actual successful admission; required assertions/producers/consumers reconcile with the actual ledger and StepVerifier. The original bootstrap metadata acknowledgement is checked against its original context/allocation snapshot, not a later materialization revision. An unassociated stale duplicate preparation is not a live dispatch permission; pending admitted work still blocks publication. Complete bidirectional joins reject missing/extra/reordered/substituted work.

Preserve the existing ordered-sourceHash, exact operationHash and **ordered ledger tuple admissionProvenanceHash**. The broader audit bundle has separately named/versioned `publicationEvidenceHash` (C4). Database revision ID stays UUID; revisionDigest is a separate SHA256. Exact configuration uses CompileInputs' value-free configuration representation without constructing a compile request. Opaque cfg IDs map immutably to referenceName/step/kind/slot/inputId in basis; saved values never reach pure Node validation.

## 4. Public authority and concrete interfaces

Production `POST /api/v3/studio/guided-sessions/{id}/finalize` runs under the real BFF security/raw-byte path, with the closed request in C10 and mandatory Idempotency-Key. OBS-006 implements this API; OBS-008 automatically invokes it on FINALIZING and handles poll/reconnect. It continues the original Run without another user confirmation. Missing/expired authentication or disconnect preserves browser evidence and pending/not-ready truth; no hidden replay saves work.

Concrete interfaces in `studio.guided.publication` use immutable defensive records from `PublicationContracts`:

```java
PublicationBase captureBase(Session session, LockedCurrentSource source); // original start TX
ValidationBasis readBasis(String sessionId);                            // locked original rows
PublicationSnapshot snapshot(String sessionId, ExpectedRevisions expected);
PublicationCandidate build(PublicationSnapshot snapshot);                // pure exact plan
ObservedArtifact lower(PublicationCandidate candidate);                 // pure typed IR
ValidationReceipt validate(ValidationRequest request, PublicationBudget budget);
PublicationGrant authorizePublication(HttpServletRequest request, PublicationSnapshot snapshot);
ReceiptReadGrant authorizeReceiptRead(HttpServletRequest request, PublicationReceipt receipt);
PublicationResult publish(PublicationGrant grant, PublicationSnapshot snapshot,
                          PublicationCandidate candidate, ValidationReceipt receipt);
PublicationResult finalizeForUser(Authentication caller, HttpServletRequest request,
                                  String sessionId, String key, ExpectedRevisions expected);
```

Session ID is the existing opaque string, not a forced UUID. Snapshot/claim and final commit hold no locks across network I/O. Real authenticated `/v2/validate-observed` independently checks C4 original facts without a browser/model. After validation, uncached CoreServiceClient.getUserMe with current request cookie checks same original Run/caller principal and current CSI canExecute; a five-second in-memory grant is capped by session/worker expiry and bound to the exact snapshot. Final CAS checks database time. No ProvisionalDispatchAuthorization, cached identity, production background grant, cookie persistence or unattended identity provider substitutes for this.

Receipt retrieval has **separate fresh current Core canRead authorization**, same original/caller principal, and no live worker/session/head/source requirement (D6). It returns immutable historical proof without another validator/browser call or new publication. Current readiness is separately evaluated, so a receipt remains historical after edits/head changes. Changed idempotency body refuses without rebuilding a mutable snapshot.

## 5. Persistence, claims and atomic publication

D1–D7 freeze actual proposed V33 table/column/nullability/keys/constraint/trigger/state/CAS mechanics. Pre-effect base captures publication epoch and all compile/candidate/confirmed heads. Epoch trigger covers ordinary writers and ABA without reverse session locking. Old sessions get no late base. Evidence tables supplement original proof records, not a second action ledger/worker fence/value store.

Session-wide three-attempt budget applies across keys and restarts. A fixed captured validation deadline is hashed; current same-owner/fence lease renewal is only a liveness check and cannot change that snapshot or extend/revive its claim. A committed fenced RESERVED→VALIDATING transition owns one validator call; current claim/snapshot/basis/profile acceptance is conditional; UNKNOWN consumes its attempt. Terminal results are immutable. A validated unchanged snapshot can proceed to fresh Core without another call; no stale response creates authority.

Ordinary revision origin remains NULL with legacy null-request compatibility. Guided origin requires all identities, artifact2 and real GUIDED_RUN confirmation with null compile_request_id. Reciprocal scoped deferred revision/receipt FKs enforce revision-first/receipt-second atomic completion and validated-attempt association. Both original V19→V33 and V33→updated V19 capability orders are defined; V21 copies current authoring under the existing lock, compared before/after INSERT. Neither cutover nor old ordinary dedup identity is silently enabled/disabled.

Final session→test→translation/bridge→publication transaction recomputes snapshot and checks source/config/authoring/scope, epoch/null-safe heads, successful plan/evidence, original owner/fence/lease, flags/pins, current account policy and fresh Core grant. It inserts revision/receipt, sets heads/READY, clears **compile_request_id**, and sets session SUCCEEDED together. Clearing the old request fences an ordinary compiler already in flight before the base; its existing request-ID predicates discard late results. Any failure rolls back every ready-state write. Expected conflict is recorded under fresh locks without overwriting a winning receipt/cancel; unexpected DB faults remain retryable. Evidence survives. No schedule mutation or synthetic replay row.

## 6. Ordinary replay authorization, readiness and evidence

ExecutionReadinessService discriminates immutable revision family. Legacy retains existing verifier/policy2/pins and persisted RUN/same-principal auto-accept. Observed requires real scoped receipt, independent hash verification and exact supported Profile; callbacks/supplied hashes/manual first confirmation cannot grant readiness. Both model gateways remain unreachable.

Later explicit Run uses actual StudioController/StudioService, new ObservedReplayAuthorization, acceptance, existing dispatch ledger/dispatcher, `/v2/runs`, actual AdmissionCasService and normal recorded child. Fresh uncached BFF/Core canExecute mints a noncredential execution+preallocated-attempt grant with **at most30 seconds until admission**, bound to revision/principal/CSI/account/scope/current policy/profile. The existing observed dispatcher uses that reserved attempt UUID; legacy allocation is unchanged. Queue expiry/local cancellation/policy or account revocation refuses before browser. Observed admission uses the actual ordinary restricted service-token chain and protected deployment TLS, with the shared-runner-service trust limit stated in C12; it does not claim guided-only mTLS/JWT enforcement. No unattended grant refresh or provisional checker. The bounded grant does not claim instant cross-service Core revocation; C6 states the precise freshness tradeoff. Observed scheduled runs fail closed with OBSERVED_SCHEDULE_AUTH_REQUIRED until real unattended authority exists; legacy schedules are unchanged.

D7 freezes separate immutable `observed_revision_binding` and write-once `observed_admission_receipt` on the actual partitioned execution rows. The existing admission CAS writes the receipt once; terminal runtime_versions display data cannot change it. Job/profile/receipt/IPC handshakes compare the immutable revision rather than runner self-report. Existing normal admission/cancellation/recording/timing/reporting remains the only replay pipeline.

Learning evidence remains guided ledger+publication receipt, not an ordinary PASSED row. Result3/session-view3 (C10) provide real publication UUID plus separate digest, PENDING/PUBLISHED/conflict status and **historical versus current readiness**. Existing result2's hash-shaped readyRevisionId remains compatible. The actual result producer reads immutable receipt and current readiness; no callback flag creates published success. First guided recording stays OBS-008; later real replay recording is mandatory006. Scheduler activation stays pinned; actual old-activation/new-publication test proves ACTIVATION_REVISION_MISMATCH and no dispatch to the new revision.

## 7. Strict typed replay and account boundary

C1–C8 freeze closed artifact2/policy3/IR/basis/profile/job/admission/protocol2/account shapes, string/Unicode/integer/collection limits and whole composed UTF-8 caps. Legacy64KiB artifact and v1 body/parser limits remain. Parent/child reject mixed/absent family, unknown keys and profile mismatch before browser. Child receives only executable guarded operations, current scoped inputs, runtime graph and trusted mounted policy; no source/artifact/history/node authority. Each job carries the complete hash-bound Configuration; authored viewport differs from recording geometry. Current policy preserves actual application/region grants, structural-discovery permission and optional field overrides without mandatory per-control mapping. Each execution/attempt starts an empty value store and recaptures producer values.

The strict observed adapter reuses the normal recorded BrowserHandle's isolated collection and retained-target primitives, never GuidedRuntime or legacy locator fallback. Pointer/key actions use nativeInput. **Fill/select use the actual existing fixed isolated DOM primitive**: focus/recheck/set value/input+change events for fill, unique eligible option/set value/events for select. This preserves exercised semantics instead of silently changing to Playwright/native typing. IPC explicitly preserves PASS/FAIL/SKIPPED/null unexecuted timings, nullable unknown recording bytes and common Stop; recording/run clock starts before account apply and is not reset at Ready. Residual event races after immediate checks remain; possibly applied/focus/scroll failures stop rather than retry. Reads require current positive classification/rule/type and exact frozen target, and consumers must match fixed graph slots/origins. Values never flow into parent diagnostics/host names/URL/title/manifests/models; authorized recording is a separate sensitive evidence channel.

Neutral ReplayAccountAccess and worker consume/prepare/apply/dispose ABI are concrete C6, with exact one-use execution/attempt grant and bounded sensitive handle. Startup injection includes server/application and actual run/child.ts. Providers are trusted registry entries, never job URLs/modules or local-cookie imports. Apply uses the same recorded context; initialBlank stays genuinely blank, observedDocument names its authorized origin. Unknown consume/apply outcome stops, never repeats setup. Default unconfigured provider refuses; only account connectivity implementation remains007. No other publication/replay functionality is a test-only adapter.

## 8. Pins, flags and rollout

Exact Profile (C2), hashes/canonical vectors (C4/C9), byte bounds and four feature-flag combinations (C9) are normative. Java pins, Node image versions, strict schemas/fixtures/checker, ordinary admission and IPC support ship together. Guided source/model/provider/prompt hashes and publication result format are separately bound immutable learning/API provenance, excluded from execution-required Profile. A later benign model/prompt/API update does not invalidate saved compatible replay; explicit proof/execution revocation uses the profile catalog. No model call revalidates them. A trusted profile catalog ties actual packaged schema/reference bundles, executable image and Chromium identities to supported execution semantics, with explicit build checks in validator/admission/child frames. Existing compatible artifact1 language/reference/prompt pins do not change.

Proposed YAML under `studio.guided.publication`: enabled=false, max-validation-attempts=3, validation-timeout-ms=15000, authorization-ttl-ms=5000, max-validation-bytes=8388608. Under `studio.observed-replay`: enabled=false, authorization-ttl-ms=30000, max-artifact-bytes=1048576, max-job-bytes=4194304, max-execute-frame-bytes=2097152. Config may tighten hard caps, never enlarge contracts. Trusted runner deployment mounts versioned application/read/entry policy and fixed account provider registry; unknown policy/provider refuses. Bean composition separates historical receipt access/replay from new-publication enablement, so disabling publication does not break005 start or already published replay.

Disable publication stops new claims/commits; disable replay blocks new acceptance/dispatch/admission. Drain/cancel already admitted runs using existing bounded policy; preserve immutable receipts/evidence. Old images/pins reject observed revisions before browser, no fallback/recompile/re-pin; restore a compatible image or deliberately relearn. Forward V33 schema remains on rollback. Full compatible-V19 install-order and drain/rollback procedure belongs the owned guided runbook. Schedules never autoactivate.

## 9. Required evidence and review gates

No tests have been run for this proposed story. Implementation must provide:

- Real PostgreSQL fresh V33/upgrade, both cutover orders, epoch/ABA/newer-head races, earlier in-flight compile discarded after guided commit, two guided sessions/one winning publication, immutable/scoped/null-rejecting constraints and fault injection at each insert/confirmation/CAS/session commit. Preserve evidence and no orphan ready revision on rollback.
- Production public BFF/Core HTTP integration: actual CoreServiceClient and CsiOwnershipEvaluator, same/changed principal, revoked write entitlement, missing/expired cookie, unavailable Core, long validation followed by fresh authorization, expired grant during lock wait, and idempotent committed receipt after worker expiry. No permissive production checker or cookie persistence/logging.
- Builder/equivalence mutations: lexical UUID order trap, missing/extra/reordered actions, failed assertion, wrong proposal/operation/plan/source/config hash, missing producer/edge, wrong input type/slot/origin/locator/guard/policy, stale translation head, fence/lease/cancel/expiry. A worker callback/validator hash alone cannot publish.
- Joined test instantiates actual GuidedSession/Translation/Publication configurations, source repositories and verifier, real SDK HTTP-controlled authoring replies, real mTLS guided worker/Chromium, public finalize/Core HTTP, actual pure runner validation, revision writer/readiness, StudioAcceptanceService/Dispatcher/HttpRunnerDispatchClient, AdmissionCasService, actual `/v2/runs`/RunCoordinator/confined child/observed adapter/recording/reporting. Only account connection is controlled; no test-only replay adapter, driver impersonation or manually minted readiness.
- Independent application receipts: initial guided workflow submits once; finalization (including retries/conflicts) causes **zero** navigation/read/click/fill/submit actions and zero gateway calls. Two later explicit ordinary Runs use the **identical artifact/plan/policy hashes**, recapture unpredictable distinct values, and produce exact fresh-value receipts. Both compile and guided gateway HTTP counters remain zero throughout finalization and both replays.
- Current page wrong target/read type/origin/secret/region/capture substitution, repeated/oversize/blank values, dynamic locator drift, post-check target replacement, popup/frame/context loss, cancellation, output canaries, source-free IPC and queue/lease/admission replay mutations. Separate learned-from-execution and real replay-verified assertions; video/seek/timing and ordinary Studio execution/cancel/evidence regressions stay green.
- Legacy artifact1, policy2, prompt/reference, FULL/PATCH, ordinary RUN auto-accept, manual confirmation, no-runtime-LLM structural/transitive mutation and actual dual-gateway zero-call suites. Migration-count fixture amendments only where a test intends latest schema; do not change frozen foundation expectations silently. Exact tested source/build/worker/pins, raw provider-byte evidence, skips and unavailable services must be recorded honestly.

Peer/runtime review: confirm typed IR equality and exact observed adapter reuse, closed v2 job/IPC/admission/profile handshake, initial-state/account and data-free recording boundaries. Data review: approve exact V33 fields/indexes/triggers/deferred FK/cutover install order, epoch coverage and old-writer invalidation. Security/QA: falsify publication authority and both gateway prohibitions using real probes, not hash echo or mocks. PO: validate AC coverage and the accepted automatic authenticated client-finalize dependency on OBS-008. No new user policy answer is needed.

### Acceptance criteria to production and independent evidence

| AC | Concrete production path | Required independent oracle |
|---|---|---|
| 1 | Session storePreparation/admit → EvidenceRepository → PlanBuilder, D2/C4 | Original multipage facts survive overwrite/restart; altered guards against unchanged basis fail; exact obligation/admission cardinality/source order. |
| 2 | ObservedArtifactLowerer + Node observedReplay/observedReferencePolicy, C3–C5 | Separate Java/Node derivation, fixed canonical bytes/JSONB roundtrip, operation/target/read/reference/graph mutations fail despite recomputed local hashes. |
| 3 | Public controller → actual Core → fenced repository claims → PlanPublisher/V33, D1–D6 | Real Core HTTP rejection cases, direct SQL FK/immutability, edit/head/epoch/old compile/fence/expiry/conflict/rollback races. |
| 4 | ResultProjector/result3 + immutable receipt + scheduler | One initial independent submit, zero finalization actions/validator browser launches; historical receipt/current readiness distinction; unchanged activation plus actual mismatch refusal. |
| 5 | StudioController/Service → ReplayAuthorization → acceptance/dispatch/admission → normal child/observed adapter | Two unpredictable fresh-value recorded replays with identical artifact, empty value stores, both gateways zero; account/target/type/origin/IPC/cancel/deadline drift stops. |
| 6 | Execution-only Profile + separate learning provenance, config/bean wiring/pin scripts/strict schemas | Four flag combinations, cross-family refusal, rollback image incompatibility, benign prompt/API change remains replay-compatible, legacy RUN/same-principal auto-accept preserved. |
| 7 | Real production joined configurations/repositories/Core/Node/runner entrypoint | PostgreSQL + authenticated guided worker + ordinary admitted recorded Chromium; only account provider controlled; exact source/build/worker receipts and honest skips. |

## 10. Proposed ownership and implementation partitions

The story File List is the exact proposed repository-relative ownership set. New classes/files listed there are proposals, not evidence they exist. Root must reconcile shared ownership before implementation. Partition by dependency: (1) reviewed contracts/pins/data migration, (2) pure builder/lowering/validator and immutable stores, (3) public authorization/publisher/readiness, (4) job/admission/child/runtime integration, (5) real joined evidence and regression gates. One owner controls shared contracts and one build lane; no simultaneous incompatible schema edits.

The initial implementation-critical choices are now frozen in D1–D8/C1–C11 rather than deferred to implementers. Remaining gates are independent technical re-review, mechanical ownership reconciliation and PO validation, not a missing user policy or product authority. Golden vector bytes are to be independently calculated/tested during implementation against the specified algorithm, not guessed design output. No publication/replay functionality may be deferred behind an unavailable adapter; only OBS-007 account connectivity stays explicitly fail closed.
