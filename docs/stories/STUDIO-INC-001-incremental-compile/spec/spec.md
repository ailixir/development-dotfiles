# Spec: Studio incremental compilation and efficient inference

> **Story ID:** STUDIO-INC-001-incremental-compile
> **Complexity:** COMPLEX (score 20; complexity.json)
> **Generated:** 2026-09-23
> **Status:** Draft, iteration 3 (Phase 5b round 2, revision of critique-round2.json; next: @qa delta re-critique of §3.2.3, §3.2.5, §5.2, §9)
> **Baseline:** branch `brunobuger/ui-studio` @ `1f3c56a59` (discovery-brief, research.baseline)
> **Binding inputs:** `decisions.md` (OQ-1..OQ-5) overrides any conflicting requirement or C0 text.

Trace tags: `FR-*`, `NFR-*`, `CON-*`, `ASM-*`, `EC-*`, `OQ-*` → requirements.json. `DEC-OQn` → decisions.md row / OQ-2 proposal item (`DEC-OQ2.3` = OQ-2 item 3). `COL-*`, `R-Q*` → research.json collisions / researchQuestions. `DEP-*` → research.json dependency entries. `BRIEF` → discovery-brief.md. `CPLX` → complexity.json. `C0 §n` → docs/architecture/studio-inference-contract-v1.md.

---

## 1. Overview

When an author edits step N of a test that previously ran green, the server regenerates steps N..end and keeps steps 1..N-1 byte-locked from the baseline revision. The model still receives the locked steps as read-only context. Run still executes every step from step 1 in a fresh browser (FR-4, FR-5, CON-1, DEC-OQ2.2, DEC-OQ2.3). The model request is also restructured to cut waste and to measure the cost that is paid today but not recorded (FR-11, FR-12, FR-13, DEP genai/thinking/caching). No net saving is claimed: INCREMENTAL sends the locked baseline code as extra input, and an escalated request is wasted spend, so the net per-Run effect is measured, not assumed (NFR-1, §3.2.6).

The components that do this already exist and have tests, but nothing in production calls them. The v2 REST stack that called them was dropped in fold merge `ec94e9585` because its entry point `CompilePipeline.compileVersioned` did not exist on this line. It was not dropped for a known defect (DEC-OQ5, CPLX OQ-5). This story re-ports that wiring onto the live pipeline, including the Story 10.35 V21 authoring and the Story 10.44 reference policy. It is a re-port, not a cherry-pick (COL-6, CPLX flags).

### 1.1 Goals

- G1: A map of the translation engine as it works now and as it will work after this story (FR-1). See §3.1.
- G2: Live incremental compilation behind `studio.compile.incremental.enabled` (default false). It uses a derived forward scope, change detection on stable step identity, and a visible escalation to FULL (FR-3..FR-7, FR-10, FR-14, DEC-OQ2, CON-3).
- G3: Run = compile if needed → auto-accept → FULL execution from step 1. The Run log shows which steps were reused and which were regenerated, with a code diff (FR-8, FR-9, DEC-OQ3).
- G4: The v2 authoring stack is restored, and `InferenceStudio` is mounted as the Studio page, rebuilt on the current pipeline (DEC-OQ4).
- G5: Inference efficiency. The request puts static content first in `systemInstruction`, sends global context once, builds the schema with a deterministic key order, sets the thinking level explicitly (and includes it in the fingerprint), records complete usage, and repairs with the rejected proposal attached (FR-10..FR-13, DEP genai, R-Q1).
- G6: Data integrity. V21 `authoring` becomes the single source of truth. Captured revisions carry `reference_policy`. Write-once protection is restored. V19 is sequenced safely (COL-1, COL-3, COL-4, COL-5, CON-9).

### 1.2 Non-Goals

- Partial or resumed browser execution. The lock applies at compile time only (CON-1, BRIEF correctness clarification).
- A "keep unchanged" outcome for suffix steps. The whole suffix N..end is regenerated (OQ-6 stays deferred; ASM-4; the user's example regenerates step 3).
- A force-incremental action or a manual "lock this step" override (CON-5).
- Any change to the runner artifact version or routes (CON-4).
- Explicit `cachedContent` caching (research recommendation "avoid"; DEP explicit caching).
- Additive reference-set eligibility. Any change to the declared reference list makes the baseline ineligible (DEC-OQ1).
- Numeric efficiency targets. The spec requires measurement only (CON-10, OQ-8).
- Live enablement, deployment or live model-quality claims (CON-3, CON-8).

---

## 2. Requirements Summary

### 2.1 Functional Requirements

| ID | Description (as amended by decisions.md) | Priority | Status in spec |
|---|---|---|---|
| FR-1 | Map the engine (Save/Run/Compile/Execute), current and target, marking where the LLM is called and where a browser runs | P1 | §3.1 |
| FR-2 | Stable per-step identity is persisted by the live editor | P0 | Via restored v2 PUT onto V21 `authoring` (§3.2.1) |
| FR-3 | Incremental components reachable from the live compile, behind the flag | P0 | §3.2.3 |
| FR-4 | Lock 1..N-1 byte-identical; writable = N..end | P0 | §3.2.4 (N extended to structural edits, C0-A4) |
| FR-5 | Prior steps given as fenced read-only context | P0 | §3.2.6 |
| FR-6 | PATCH covers exactly the writable IDs; server merges and validates the whole artifact | P0 | §3.2.7 (+ PREFIX_IMPACT variant, C0-A2) |
| FR-7 | Plan reason recorded and returned | P0 | §3.2.5. **AC-7.2 superseded** by C0-A4 |
| FR-8 | UI shows reused/regenerated per step, mode, reason, and Rebuild all steps | P1 | §3.2.9 |
| FR-9 | Run gate sends a mode and executes the confirmed revision | P0 | §3.2.8 (confirmation = Run auto-accept, C0-A3) |
| FR-10 | Repair stays in the writable set, carries the rejected proposal, and reused-code failure → FULL_REBUILD_REQUIRED | P0 | §3.2.7 |
| FR-11 | Static-first, byte-stable prefix | P1 | §3.2.6 |
| FR-12 | Global context once per request | P1 | §3.2.6 |
| FR-13 | Complete usage (thoughts/cached), explicit thinking config in the fingerprint | P1 | §3.2.6 |
| FR-14 | Per-compile audit metadata including per-step origin | P1 | §3.2.5 |
| FR-15 | Author STEP_SCOPED declaration | P0 | **Superseded** by DEC-OQ2.1 (derived forward scope, C0-A1). `scope` kept for audit only |

### 2.2 Non-Functional Requirements

| ID | Category | Requirement | Metric |
|---|---|---|---|
| NFR-1 | performance | Output scales with the suffix length; the **net** per-Run cost is measured | Generated entries = S − p + 1 (unit/IT). The 10.26 harness reports the **net per-Run cost** for FULL vs INCREMENTAL: input + output + thinking tokens and latency summed over **every** request of the Run, including an escalated Q1 and the locked-prefix code INCREMENTAL adds to the input. Telemetry also reports `escalationRate` (by `escalation.source`) and `detectorHitRate` (by `ruleId`). No numeric target (OQ-8) |
| NFR-2 | performance | Byte-stable static prefix (**amended by research**: provider cache hits are best-effort) | Deterministic: `systemInstruction` bytes identical across tests at the same pins. Live `cachedContentTokenCount` is recorded and reported only, never a pass/fail target and never claimed as savings (DEP implicit caching; unverifiedClaims NFR-2) |
| NFR-3 | reliability | Locked steps are immutable | Byte-equality on every reused step. Zero accepted out-of-scope patches in planted controls |
| NFR-4 | reliability | Bounds unchanged: 3 proposals, 3/9 transport attempts, one deadline (240 s ceiling) per compile request | Existing bounds suites pass on the captured path |
| NFR-5 | security | No resolved values in prompts, repair or logs. No cross-CSI or revoked baseline reuse | RepairRedaction-style tests on the captured repair (which now contains the rejected proposal). Cross-CSI baseline query returns nothing |
| NFR-6 | usability | The author can see the mode, the reason and any escalation, and which revision a green result belongs to | Component tests on badges, reason and escalation text. Accessible (10.25 AC-5) |
| NFR-7 | scalability | Prompt is linear in steps and not multiplied by global context | Unit test asserts a single occurrence of the global context |

### 2.3 Constraints

| ID | Constraint | Impact in this spec |
|---|---|---|
| CON-1 | Compile-time lock only. FULL execution from step 1. Run never calls the LLM | Kept. `NoRuntimeLlmTest` must stay green |
| CON-2 | Reuse C0. Amendments need Aria review | §3.4 lists every amendment for Aria's sign-off. C0 itself is not edited here |
| CON-3 | Incremental flag default false. Dark launch. Flag off selects FULL | Kept (§3.5) |
| CON-4 | Runner artifact v1. The server alone assembles it | Kept |
| CON-5 | Client may request AUTO or FULL only | Kept |
| CON-6 | Structural edits → FULL | **Overridden** by DEC-OQ2.2 → C0-A4 (resolves COL-8 in favour of decisions.md) |
| CON-7 | Baseline = confirmed revision plus a retained PASSED FULL execution at a compatible fingerprint | Kept (DEC-OQ2.6). Legacy is never retroactively eligible |
| CON-8 | Provider capabilities are not assumed from stub success. SPK-01 gates enablement | Kept. Fallbacks in §3.2.6 |
| CON-9 | Forward-only Flyway, owned by @data-engineer | V26+ (§3.3). V19 re-anchor owned by Dara |
| CON-10 | No invented numeric targets | Kept |
| CON-11 | Centralized API client, MSW-first, no silent v1 fallback for v2 writes | Kept (§3.2.9) |

---

## 3. Technical Approach

### 3.1 Translation engine map (FR-1)

**Current (BRIEF, verified @1f3c56a59):**

| Stage | What happens | LLM | Browser |
|---|---|---|---|
| Save | `ChecksStudioPage` → `PUT /api/v1/studio/tests/{id}` with a v1 body (`steps: string[]`, no IDs). `StudioService.updateTest` sets `compile_status=STALE` and never compiles | No | No |
| Run gate | `useRunGate`: save if dirty → GET → if not READY/COMPILING, `POST /tests/{id}/compile` (no body, no mode) → poll every 600 ms, up to 330 s → `POST /execute`. An unedited READY test skips compile | No (gate) | No |
| Compile | `CompilePipeline.compile` → attempt loop (1 + 2 repairs): `PromptAssembler.assemble` → `GenAiLlmGatewayClient.propose` (gemini-3.8-flash, JSON schema) → runner `POST /v1/validate` → publish READY, repair, or invalid. Always FULL. Repair is blind and full-width | **Yes** | No |
| Execute | `StudioAcceptanceService.accept` runs the confirmed revision with `execution_scope=FULL` from step 1 | No | **Yes** |

**Target (this spec):**

| # | Stage | Call | LLM | Browser |
|---|---|---|---|---|
| 1 | Save | `PUT /api/v2/studio/tests/{id}` with the V21 authoring body (`globalContext`, `steps[{id,text,context}]`, declared references). Persists only and sets STALE. An exact no-op keeps the snapshot and does not compile (FR-2, C0 §2, C0 amendments 2026-09-16 "V2 save persists only") | No | No |
| 2 | Run: compile | If not READY: `POST /api/v2/studio/tests/{id}/compile {mode:"AUTO"}` → capture (lock draft, freeze plan/write set/fingerprint/budget, commit) → plan (§3.2.5) → selected mode + reason returned (FR-9, C0 §2 identity) | No | No |
| 3 | Run: inference | FULL/INCREMENTAL: `propose` (≤3 proposals) → envelope parse → `IncrementalAssembler` merge → runner validates the whole artifact → publish candidate (AWAITING_CONFIRMATION). REUSE: no proposal, validation only. PREFIX_IMPACT: ESCALATED_FULL → a new FULL request created per §3.2.5 "Q2 creation" (C0-A2) | **Yes** (FULL/INCREMENTAL only) | No (validator is AST/policy only, C0 §1 "Compilation never runs a browser") |
| 4 | Run: poll | `GET /api/v2/studio/tests/{id}/compiles/{compileRequestId}` until terminal. Follows `escalatedTo` once (§3.2.8) | No | No |
| 5 | Run: auto-accept | `POST /api/v2/studio/tests/{id}/confirm-compile` with the six C0 §7 identity fields and `confirmationSource:"RUN"` (C0-A3) | No | No |
| 6 | Run: execute | `POST /api/v1/studio/tests/{id}/execute` → FULL from step 1 in a fresh browser (C0 §1, CON-1) | No | **Yes** |
| 7 | Run log | Mode, reason, escalation, per-step reused/regenerated badges and code diff vs the baseline (DEC-OQ3, FR-8) | No | No |

An unedited READY test skips steps 2–5, with no compile and no LLM call (FR-9 AC-9.2, INT-2).

### 3.2 Component design

#### 3.2.1 Authoring and data source of truth (FR-2, COL-1, DEC-OQ4)

- **Source of truth: V21 `ui_tests.authoring` + `authoring_revision_inputs`** (the `AuthoringV2Request` shape: `authoringSchemaVersion=2`, `globalContext`, `steps[{id UUID, text, context}]`). The live Save already writes it (COL-1).
- V18 `ui_tests.authoring_snapshot` / `authoring_hash` / `scope_reviewed_*` are **deprecated**. No code reads them for planning or baseline selection, and no new writes go to them. Live code already nulls them (COL-1, `StudioService.java:558-560`).
- The re-ported v2 DTOs (`AuthoringDtos`) are reconciled with `AuthoringV2Request`: the step context entries and `globalContext` are kept. `scope` is **server-derived and audit-only**: `{policyVersion, declaration:"DERIVED_FORWARD"}`. A client-supplied `scope` is ignored for eligibility (DEC-OQ2.1, C0-A1).
- Step IDs follow C0 §2: the server allocates missing IDs under the draft lock. Foreign or duplicate IDs → `400 INVALID_STEP_ID`. A duplicated step omits its ID.
- **`authoringHash` (normative, replaces the V18 column; CRIT-2).** `authoringHash` = `authoring_revision_inputs.contextDigest`, the value the live Save already computes and persists through `AuthoringRevisionIdentity.create` (`StudioService.storeAuthoring`). It is SHA-256 over: the ordered `(id, text)` of every step, the `globalContext` hash, the whole-context hash of every step (`stepContexts[].hash` = hash of the entire `StepAuthoringContext`, all entries plus `evidenceReferences`), the hashes of referenced non-secret values, and the selected evidence references. So `authoring_revision_inputs` **is** included, and any text, context, global-context, value or evidence edit changes it. No new hash algorithm is introduced.
  - **Storage.** Read as `authoring_revision_inputs->>'contextDigest'` on `ui_tests` (V21), on `ui_test_revisions` (V21) and on `ui_test_compile_requests` (added by V26, §3.3). It is not copied into a separate column. The V18 `authoring_hash` columns stay NULL and are never compared.
  - **Integrity.** The digest is trusted only after `AuthoringRevisionIdentity.valid(authoring, inputs)` passes at capture. A draft whose pair fails validation cannot be captured for a versioned compile (`409 STALE_REVISION`, "reload"), and it never becomes a baseline.
  - **Unversioned (v1) callers never reject on authoring identity (CRIT-19).** For `expectedSource == null`, capture stores the V21 `authoring` / `authoring_revision_inputs` exactly as found (possibly NULL, possibly an invalid pair) and plans FULL `LEGACY_MAPPING` whenever the pair is absent or fails `AuthoringRevisionIdentity.valid`. No `409` is raised. The `InferenceCaptureStore.persist` text guard (today `:53-58`, `IllegalStateException("Authoring snapshot differs from captured source")`) is rebased to compare the V21 step texts with `inputs.orderedSource()` **only when the pair is valid**. With an absent or invalid pair it is skipped, and the steps are derived from the captured source, as today's `steps(null, inputs, request)` does. On this path capture adds no failure mode that today's v1 compile lacks.
  - **Users (all four switch together):** `CompileStateService.captureForCompilation` (`expectedAuthoringHash` compare, today `SELECT authoring_hash FROM ui_tests` at ~151), captured publication (the request's digest equals the revision's), `confirmVersioned` (today `t.authoring_hash = ? AND r.authoring_hash = ?` at ~552, rewritten to the two `contextDigest` expressions), and the V18 capture-consistency trigger (V26 (e), §3.3). The v2 GET/compile/confirm DTOs expose it under the existing name `authoringHash`.
  - Why the change is required: live Save leaves `ui_tests.authoring_hash` NULL (`StudioService.java:558-560`), so `authoring_hash = ?` can never be true, and every v2 confirm, including Run auto-accept, would fail `STALE_CANDIDATE`.
- **Every `InferenceCaptureStore` predicate that reads V18 authoring is rebased** (CRIT-11c):

  | Location (today) | V18 predicate | V21 replacement |
  |---|---|---|
  | `:47-52` capture metadata | `SELECT authoring_snapshot, authoring_hash, scope_reviewed_*` from `ui_tests` | `SELECT authoring, authoring_revision_inputs` (digest per above). `scope_reviewed_*` is dropped (C0-A1) |
  | `:63-64` reviewed scope | `authoring_snapshot.scope.declaration = 'STEP_SCOPED'` | Removed. Scope is server-derived (C0-A1) |
  | `:67` incremental gate | `authoring != null` | V21 `authoring IS NOT NULL` and `AuthoringRevisionIdentity.valid` |
  | `:94` baseline candidate | `r.authoring_snapshot IS NOT NULL` | `r.authoring IS NOT NULL AND r.authoring_revision_inputs IS NOT NULL AND r.reference_policy IS NOT NULL` |
  | `:97` config-only branch | `r.authoring_snapshot = CAST(? AS jsonb)` | `r.authoring_revision_inputs->>'contextDigest' = ?` (the **full** authoring identity, so any step-context or global-context edit fails this branch; §3.2.4 rule 5) |
  | `:111`, `:126`, `:144-146` baseline steps / scope compare | parse `authoring_snapshot` | Parse the revision's V21 `authoring`. The scope compare is removed |
  | `:198`, `:212` request insert | writes `authoring_snapshot, authoring_hash, scope_reviewed_*` | Writes V21 `authoring`, `authoring_revision_inputs`, `reference_policy`, `intent_derivation_version` (V26 (a)). V18 columns stay NULL |
  | `CompileStateService` `:866-870` captured revision insert | copies `authoring_snapshot, authoring_hash, scope_reviewed_*` from the request | Copies the V21/V24 columns from the request (V26 (a), (d)) |

  Exact reference-set equality (`r."references" = CAST(? AS jsonb)`, `:96`) stays unchanged (DEC-OQ1).

#### 3.2.2 Step identity for change detection (COL-2)

The planner's `Step` is `(UUID id, String text)` today, and equality ignores context (COL-2). The planner is replaced with:

```
StepIdentity = { id, text, contextCanonical, referencePolicyEntryCanonical }
stepIdentityHash = SHA-256(canonical JSON of StepIdentity)
```

- `contextCanonical` = `ArtifactCanonicalizer.canonicalize` of the step's **entire** `context` object exactly as stored in the V21 `authoring` JSONB (CRIT-1). It is taken from the raw stored JSON, not re-serialized from DTOs, so it covers every `StepContextEntry` kind (`text` ContextText, `literal` LiteralInput, `variableRef`, `secretRef`, `targetHint` TargetHint, `default` ContextualDefault), their order, and `evidenceReferences`, plus any field a later schema adds.
- **Fail closed.** If either the baseline's or the current step's context cannot be read as a known `StepAuthoringContext` (an unknown `kind` or field, or a parse failure), the step counts as **changed**. If this happens for a baseline step, the baseline is ineligible (`NO_ELIGIBLE_BASELINE`, `reasonDetail: AUTHORING_UNREADABLE`). A unit test enumerates the `permits` list of the sealed `StepContextEntry` and fails when a subtype has no identity fixture, so a new kind cannot ship without a hash test.
- Referenced **values** are not part of the step identity: they never enter the prompt (NFR-5), so they cannot change generated code. They are bound by `authoringHash` (§3.2.1) and by the existing reference-set / `references` predicates.
- `referencePolicyEntryCanonical` = that step's entry from `StepReferencePolicyDeriver` (10.44) **with its positional `stepIndex` field removed** (CRIT-8a). Without this, every step shifted by an insert or delete would count as changed.
- The **position is excluded from the hash** and compared separately (§3.2.4).
- A step counts as changed if any of the four components differs. This closes both false "unchanged" cases: a variable swapped through context while the text is equal (COL-2), and a LiteralInput or TargetHint edit (CRIT-1).
- The plan persists each step's `stepIdentityHash` for the current and baseline lists, so the reused-prefix guard and audit can re-check them (§3.2.7).
- Any change to `globalContext` or to globally allowed defaults → FULL, reason `GLOBAL_OR_FORWARD_SCOPE`, `reasonDetail: GLOBAL_CONTEXT_CHANGED` (COL-2: "a structural, non-English signal").
- If a locked-candidate step's policy entry changes as a side effect of another step's edit, that step itself counts as changed. That moves p earlier, which is the safe direction (derived from COL-2's per-step equality).

#### 3.2.3 Unified attempt loop (FR-3, COL-6, COL-4)

One `CompilePipeline` entry point (the `compileVersioned` equivalent) is the **union** of the two loops:
- From the archive: captured inputs, the planner, `IncrementalAssembler`, rejected-proposal repair, and REUSE skipping the gateway.
- From the live loop: `AggregateUsage` caps, the `isSupportedArtifactVersion` gate, `validate(..., referencePolicy)`, the `ContextPromptSection` context and `VersionedIntentDeriver.CURRENT_VERSION` provenance.

The archived `compilationFingerprint()` returns, extended per §3.2.6 (COL-6).

**Capture for all.** Every compile goes through capture, FULL and v1 legacy callers included, so that each one writes a `ui_test_compile_requests` row. This is a precondition for V19 (COL-4). Legacy v1 callers keep selecting FULL (`LEGACY_MAPPING`) per C0 §1. Unversioned capture never adds a rejection (§3.2.1, CRIT-19).

**Both publish paths use captured insertion (CRIT-18).** Verified at `1f3c56a59`, there are two publish paths:

| Path | Caller | Revision insert today | After B1 |
|---|---|---|---|
| `CompileStateService.publishAcceptedCandidate` (`:262`) | **live** v1 compile, `CompilePipeline:266` (publish-and-accept → READY) | always `insertOrReuseRevision` (`:273`), `compile_request_id` NULL | shared captured insert (below). Publish-and-accept semantics unchanged: same guard lock, same `persistedReferencePolicyIsVerified` check, same self-confirmation UPDATE, same READY transition |
| `CompileStateService.publishCandidate` (`:202`) | versioned/v2 (no live caller today) | `insertCapturedRevision` only when `requestIdentityAvailable()` (the V19 marker), else `insertOrReuseRevision` | the same shared captured insert, no longer gated on the V19 marker |

- **Shared captured insert.** Both paths call one private method that inserts the revision from the request row, copying the V21/V24 columns per V26 (a). This is `insertCapturedRevision` extended. `compile_request_id` is always this request's ID.
- **Pre-V19 identity collision stays a reuse, not an error.** Until V19 runs, the V24 unique index `uq_ui_test_revisions_identity` (test, revisions, `artifact_hash`, `expected_intent`, `reference_policy`, `intent_derivation_version`) still exists. Today `insertCapturedRevision` handles only `ON CONFLICT (compile_request_id)`. A recompile that produced a byte-identical artifact would therefore raise a unique violation where `insertOrReuseRevision` (untargeted `ON CONFLICT DO NOTHING` plus an identity select) reuses the existing revision today. The shared insert therefore uses an **untargeted** `ON CONFLICT DO NOTHING`, then selects by `compile_request_id` (an idempotent retry), then, only if that returns nothing, selects by the identity key (today's reuse). After V19 drops the identity index, only the `compile_request_id` branch can fire. A reused pre-V19 revision keeps its original `compile_request_id` (possibly NULL). That is today's behaviour and is allowed only while the identity index exists.
- Result: no live publish path writes `compile_request_id IS NULL` after B1, apart from the pre-V19 reuse of an already-existing row, which inserts nothing. Once V19's `trg_ui_test_revision_require_request` is applied, no B1 publish can trip it (COL-4).

#### 3.2.4 Planner: write set and prefix identity (FR-4, FR-7, DEC-OQ2.2, C0-A4)

Inputs: baseline ordered list `B[1..m]` and current ordered list `C[1..n]` of `StepIdentity`.

**Earliest affected position `p`:**

```
p = min { i : i ≤ min(m,n) and (C[i].id ≠ B[i].id or stepIdentityHash(C[i]) ≠ stepIdentityHash(B[i])) }
    if no such i: p = min(m,n) + 1
```

**Prefix identity.** Position i < p is locked only if `C[i].id = B[i].id` **and** the hashes are equal **and** its position is i in both lists. Its `stepIndex`, `originalText` and `code` are then copied byte-for-byte from B (NFR-3, CON-4). An edit at or after position k never changes positions 1..k−1 in either list. So every insert, delete or reorder whose earliest position is k leaves prefix 1..k−1 identical by construction. This is how identity is preserved.

Positions in this section, the table and the ACs are **1-based**. The artifact's `stepIndex` is **0-based** (`IncrementalAssembler`), so position i has `stepIndex` i−1 (CRIT-11a).

| Edit (1-based) | Result for `C` vs `B` | p | Locked | Writable |
|---|---|---|---|---|
| Text/context edit at k | `C[k]` hash ≠ `B[k]` | k | 1..k−1 | k..n |
| Insert new step at k (server allocates a new UUID) | `C[k].id` is new ≠ `B[k].id`. Old `B[k..m]` shift to `C[k+1..n]` and keep their IDs | k | 1..k−1 | k..n. Shifted steps are regenerated with a new `stepIndex` derived by the server |
| Append at end (k = m+1) | `C[1..m] = B[1..m]` | m+1 | 1..m | m+1..n |
| Delete step k < m | `C[k].id = B[k+1].id ≠ B[k].id` | k | 1..k−1 | k..n |
| Delete last step(s) (C is a strict prefix of B) | No mismatch, n < m | n+1 | 1..n | ∅ → **REUSE**, reason `TAIL_DELETION` (C0-A4; OQ-S3) |
| Reorder / swap i < j | `C[i].id = B[j].id` | i | 1..i−1 | i..n |
| Duplicate step k (copy inserted at k+1, no ID) | New UUID at k+1 | k+1 | 1..k | k+1..n |
| Any change with p = 1 | — | 1 | ∅ | FULL, `ALL_STEPS_AFFECTED` (C0 §3 reason 6) |

- The baseline code of steps in the writable set whose identity hash is unchanged (shifted or otherwise unedited suffix steps) is available to prompt assembly as the "unchanged text" anchor (§3.2.6).
- `STRUCTURAL_CHANGE` is no longer selected for insert, delete or reorder when incremental is enabled. It stays in the vocabulary for flag-off audit parity (C0-A4).
- The plan records `earliestAffectedPosition`, `editKinds[] ∈ {TEXT, CONTEXT, INSERT, DELETE, REORDER, DUPLICATE}`, `writableIds`, `reusedIds` (FR-14).

**Plan order.** The first applicable rule wins. The C0 §3 order is kept, with amendments marked:

1. `EXPLICIT_FULL` (requested FULL)
2. `INCREMENTAL_DISABLED` (flag off; source-independent `CONFIGURATION_ONLY` reuse remains allowed, per C0 §3 and the live planner, so a flag-off viewport-only change does not regress to FULL; CRIT-13)
3. `NO_ELIGIBLE_BASELINE`. Own-test details: `reasonDetail ∈ {NO_PASSING_FULL_EXECUTION, REFERENCE_SET_CHANGED, AUTHORING_UNREADABLE, …}`. Foreign baseline details are never disclosed (C0 §3, DEC-OQ1, NFR-6)
4. `LEGACY_MAPPING`, `FINGERPRINT_CHANGE`, `GLOBAL_OR_FORWARD_SCOPE` (global-context change, or a detector hit, §3.2.5). `SCOPE_UNKNOWN` is no longer produced by the planner (C0-A1)
   - **Rule 4a: prior escalation (CRIT-6).** Evaluated after the rest of rule 4 and before rule 5. It applies **only to user-initiated compiles** (`escalated_from_request_id IS NULL`). An escalated Q2 never reaches the planner, because its plan is forced (§3.2.5, CRIT-17). If an earlier request for the same test, with the same `authoringHash`, the same `baseline_revision_id` and the same compilation fingerprint, settled `ESCALATED_FULL`, select FULL directly with reason `PREFIX_IMPACT` and `reasonDetail: PRIOR_ESCALATION`, and link `escalation.priorRequestId`. No incremental request is issued. The lookup is a single indexed query over `ui_test_compile_requests` ⋈ `ui_test_compile_outcomes`. Any edit changes `authoringHash`, and a new confirmed baseline changes `baseline_revision_id`, so either one re-opens INCREMENTAL. This includes a value-only edit to a referenced non-secret value, because `authoringHash` covers value hashes (§3.2.1). Such an edit re-opens INCREMENTAL once, at the cost of at most one more wasted Q1. That fails safe and is accepted (CRIT-20c). Only a settled `ESCALATED_FULL` outcome counts. A Q1 left without an outcome (abandoned, §3.2.5 step 5) or settled `DISCARDED` does not trigger rule 4a.
5. REUSE, with these exact preconditions (CRIT-1b, CRIT-13):
   - `UNCHANGED_SOURCE`: every current `stepIdentityHash`, ID and position equals the baseline, `globalContext` is equal, and the baseline has a retained PASSED FULL execution (rule 3 eligibility).
   - `CONFIGURATION_ONLY`: the full `authoringHash` equals the baseline revision's (§3.2.1, rebased `:97` predicate) and only the execution configuration (browser, viewport, timeout, wait strategy, environment) differs. This is the **only** REUSE that needs no passing execution. An advance of `configurationRevision` caused by a step-context or global-context edit changes `authoringHash`, so it is **never** `CONFIGURATION_ONLY`. The live relabel of REUSE to `CONFIGURATION_ONLY` in `InferenceCaptureStore.persist` (~150-165, keyed on `configuration_revision` alone) is restricted to this same condition.
   - `TAIL_DELETION`: C is a strict prefix of B with equal identities, **and** full rule 3 eligibility (a retained PASSED FULL execution of the baseline). It is a source change, so it never uses the configuration-only branch.
6. `SCOPED_SUFFIX` → INCREMENTAL from p through the end. p = 1 → FULL with `ALL_STEPS_AFFECTED`

Eligibility is otherwise per C0 (DEC-OQ2.6): same test and CSI, authorized, confirmed, compatible fingerprint/config/runtime pins, retained PASSED FULL execution of that exact revision, and exact reference-set equality. A PASSED FULL execution of an INCREMENTAL-compiled revision is valid baseline evidence for the next edit (ASM-3).

#### 3.2.5 Backward/global dependency escalation (DEC-OQ2.4, R-Q4, C0-A2)

**Signal 1: deterministic detector.** Runs in planning, before any model call. It covers only the *changed* steps' text (identity hash changed, or new), after Unicode NFKC normalization and lowercasing, and uses research rules `STEP_NUMBER_REF` (hit only when the number is below the step's own position), `RELATIVE_STEP_REF`, `GLOBAL_QUANTIFIER`, `RETROACTIVE_EDIT` and `BACKWARD_VALUE_REF`, with the listed exclusions (R-Q4.minimalLexicon).
- A hit makes the planner select FULL, reason `GLOBAL_OR_FORWARD_SCOPE`, with `escalation:{source:"DETECTOR", ruleIds:[…], detectorVersion}`. No incremental request is issued. The matched text is never logged, only rule IDs (R-Q4).
- The UI labels it as an escalation.

**Signal 2: model `PREFIX_IMPACT`.** This is a new envelope variant, valid only in `kind:"PATCH"` for a writable ID:

```json
{"stepId":"uuid","status":"PREFIX_IMPACT","reason":"LOCKED_STEP_CHANGE_REQUIRED","message":"<bounded>"}
```

- **The provider schema carries it (CRIT-3).** The model is constrained by `responseJsonSchema`, whose `status` enum today is `[GENERATED, UNSUPPORTED, CLARIFICATION]` and whose `reason` enum is `[UNSUPPORTED_CAPABILITY, AMBIGUOUS_INTENT]` (`GenAiLlmGatewayClient.providerSchema`). The schema therefore becomes kind-dependent: **only when `kind=PATCH`** it adds `PREFIX_IMPACT` to `status` and `LOCKED_STEP_CHANGE_REQUIRED` to `reason`. The FULL schema is unchanged. `output-contract.md` documents the variant as PATCH-only. The local `inference-proposal.schema.json`, `GatewayResponseParser` and `IncrementalAssembler`'s status/reason pairing check (today `UNSUPPORTED`↔`UNSUPPORTED_CAPABILITY`, `CLARIFICATION`↔`AMBIGUOUS_INTENT`) gain the pair `PREFIX_IMPACT`↔`LOCKED_STEP_CHANGE_REQUIRED`. If OQ-S2 bumps the envelope version, the provider schema's `version` bound (today `minimum 1, maximum 1`) moves with it.
- **Precedence.** `PREFIX_IMPACT` counts only in an otherwise valid PATCH envelope (every writable ID exactly once, valid pairs). A PATCH that contains `PREFIX_IMPACT` together with **any** other envelope violation is `INVALID_MODEL_RESPONSE` (repairable within the limit of 3 proposals), not `ESCALATED_FULL`. `PREFIX_IMPACT` is honoured on **any** attempt (initial or repair 1/2) within the 3-proposal limit.
- If any entry in a valid PATCH response is `PREFIX_IMPACT`, that is the request's terminal outcome `ESCALATED_FULL`. No candidate is published, no repair is attempted, and no locked step is regenerated inside that request (C0 §3 "no hidden full fallback" is preserved in substance).
- A FULL request can never escalate. `PREFIX_IMPACT` in `kind:"FULL"` cannot pass the provider schema, and if it reaches the parser it is `INVALID_MODEL_RESPONSE` (repairable per C0 §4).

**Q2 creation (CRIT-4).** Q1 is the incremental request that settled `ESCALATED_FULL`, and Q2 is its FULL successor. The steps run in this order:

1. **Settle Q1 and free its slot.** Q1's attempt loop stops, its active transport is completed or cancelled, and its executor/bulkhead slot is **released** before anything else happens (C0 §5: replacement work cannot launch while the old transport still holds the same slot).
2. **One transaction, `CompileStateService.escalateToFull` (new, CRIT-17).** The steps run in this order. **Check first, then write exactly one outcome** (CRIT-16). Q1's outcome is write-once (`recordOutcome` is `ON CONFLICT(request_id) DO NOTHING`, `:794-812`, and the outcome table is append-only), so a second write would be silently dropped.
   - (a) **Lock and idempotency check.** Take the draft lock (`studioRepository.findByIdForUpdate`, as `capture` does). If Q1 already has an outcome row, the step has already committed. Return the existing Q2 (`SELECT … WHERE escalated_from_request_id = Q1`, possibly none) and write nothing (CRIT-20b).
   - (b) **Evaluate the Q2 preconditions as predicates. Nothing is written yet.** The draft is not deleted or quarantined. `sourceRevision`, `configurationRevision` and `authoringHash` (§3.2.1) still equal Q1's captured values. `ui_tests.compile_request_id` is still Q1. Q1's principal still has write access to the test's CSI (the same authorization rule as compile). These checks return booleans and reason codes. They **do not** call the throwing guards (`requireCompilable`, the authorization exception, `StudioConflictException`), because a throw would roll back the whole transaction, including the DISCARDED outcome.
   - (c) **Write exactly one Q1 outcome row**:
     - if every precondition holds: `ESCALATED_FULL` with `{reason:"PREFIX_IMPACT", stepIds:[…]}` (IDs only; the bounded `message` is stored redacted per NFR-5);
     - otherwise: `DISCARDED` with `reasonDetail ∈ {DRAFT_CHANGED_BEFORE_ESCALATION, ACCESS_REVOKED, TEST_DELETED, TEST_QUARANTINED}`. That is EC-12 semantics. The transaction ends here: no Q2, and the Run gate stops ("the test changed while compiling; Run again", §3.2.8).
   - (d) **Only in the `ESCALATED_FULL` branch, capture Q2** from the current draft, which by (b) is byte-equal to Q1's frozen inputs, with a **forced plan that bypasses the planner**:

     ```
     plan = { requestedMode: "AUTO", selectedMode: "FULL",
              reason: "ESCALATED_FULL", reasonDetail: "PREFIX_IMPACT",
              escalation: { source: "MODEL", escalatedFrom: <Q1>, stepIds: [...] },
              baselineRevisionId: null, writableIds: <all step IDs>, reusedIds: [],
              runCorrelationId: <Q1's> }
     ```

     Q2 row: `escalated_from_request_id = Q1`, `created_by` = Q1's principal, and a **fresh** C0 §5 budget and deadline starting at Q2's capture. `beginCompile` inside the capture core moves `ui_tests.compile_request_id` to Q2.
     - **Why forced.** Running the planner for Q2 would be wrong in both possible ways. With `requestedMode AUTO`, rule 4a would see Q1's just-inserted `ESCALATED_FULL` and label Q2 `PREFIX_IMPACT / PRIOR_ESCALATION` with `escalation.source=PRIOR_ESCALATION`. With `requestedMode FULL`, rule 1 would label it `EXPLICIT_FULL`. Either label would corrupt the `escalationRate`-by-source telemetry (§3.2.6).
     - **How.** `InferenceCaptureStore.persist` gains a nullable `forcedPlan` parameter. When it is non-null, persist skips baseline selection, the planner, rule 4a and the REUSE→`CONFIGURATION_ONLY` relabel, and writes `forcedPlan` as the plan JSON. Only `escalateToFull` passes a non-null value.
   - **Transaction boundary (verified).** `escalateToFull` is `@Transactional` with default `REQUIRED` propagation. `CompilePipeline` carries no `@Transactional` (verified at `1f3c56a59`), so when the attempt loop calls `escalateToFull` through the Spring bean it opens exactly **one** new transaction. It then calls the outcome insert and the capture core **internally**. Self-invocation bypasses the Spring proxy, so the callees' own annotations (`capture`'s `@Transactional`, `recordOutcome`'s `@Transactional`) have no effect, and everything commits or rolls back together. `escalateToFull` must **never** call `captureForCompilation`. That method is `@Transactional(propagation = REQUIRES_NEW)` (`CompileStateService:94`), and reached through the proxy it would commit Q2 in a separate transaction, independent of Q1's outcome. The capture core used here is `capture`'s body minus the versioned `expectedAuthoringHash` compare and plus `forcedPlan`. It is factored into a private method shared by `capture` and `escalateToFull`, so `capture`'s public contract is unchanged.
3. **Enqueue Q2 only after the commit** (after-commit callback), never inside the transaction.
4. **At most one Q2 per Q1**, enforced by the database. V26 adds `ui_test_compile_requests.escalated_from_request_id UUID NULL UNIQUE REFERENCES ui_test_compile_requests(request_id)`. Both tables are append-only (V18 `studio_inference_append_only`), so `escalatedTo` is **not written onto Q1**. It is derived on read by joining on `escalated_from_request_id`.
5. **Crash, restart or retry.**
   - **Crash before step 2 commits.** Step 2 is atomic, so either Q1's outcome and Q2's capture both exist (or Q1's DISCARDED outcome alone), or nothing was written. In the nothing-written case, the draft is still `COMPILING` with `compile_request_id = Q1`. The existing abandonment sweeper (`sweepAbandoned`, `:631-666`) returns the draft to `STALE` with `COMPILE_BUDGET_EXCEEDED` and clears `compile_request_id`. **It writes no outcome row** (CRIT-20a). Q1 therefore stays without an outcome. `GET /compiles/{Q1}` reports it as `ABANDONED`, derived on read as "no outcome row, and not the draft's current request or past its deadline". The Run gate treats `ABANDONED` like `STALE` ("Run again"). No Q2 is created, and rule 4a does not fire on the next Run (§3.2.4).
   - **Q2 committed but never enqueued.** The draft is `COMPILING` on Q2, and the sweeper handles it like any other abandoned captured request.
   - **Retry of step 2.** Two concurrent or repeated `escalateToFull` calls for the same Q1 are serialized by the draft row lock. The second one sees Q1's outcome in (a) and returns the existing Q2 without writing. The `escalated_from_request_id` UNIQUE constraint is a **backstop only**. In PostgreSQL a violation aborts the transaction, which here rolls back everything, including `beginCompile`'s `ui_tests` update, so nothing partial is left, and the caller re-reads through (a). [AUTO-DECISION] Critique-round2 suggested `INSERT … ON CONFLICT (escalated_from_request_id) DO NOTHING` then select. → Use the idempotency check under the lock instead (reason: by the time the request insert runs, `beginCompile` has already moved `ui_tests.compile_request_id` in the same transaction, so a silent `DO NOTHING` would leave the draft pointing at a request that was never inserted. Checking first under the lock avoids that and still never aborts on the normal retry path).

**Escalation bounds.** Within one Run there is at most one escalation (Q1 → Q2, and Q2 is FULL and cannot escalate), so each Run has at most 2 requests, each with its own budget. **Across Runs**, re-escalation is prevented by plan rule 4a (§3.2.4): a later Run on the same draft and baseline goes straight to FULL `PREFIX_IMPACT / PRIOR_ESCALATION` and sends no PATCH (CRIT-6).

**Vocabulary (CRIT-15).** Detector hits are pre-inference and produce **no** `ESCALATED_FULL` request. They are a plain FULL plan with `escalation.source=DETECTOR`. Only a model `PREFIX_IMPACT` produces an `ESCALATED_FULL` request outcome on Q1. Its successor Q2 carries the forced plan reason `ESCALATED_FULL`, `reasonDetail: PREFIX_IMPACT` and `escalation.source=MODEL` (CRIT-17). Rule 4a is also a plain FULL plan with no wasted request (`escalation.source=PRIOR_ESCALATION`). All three sources show in the UI as "Escalated to full rebuild: <reason>" and can be queried through `escalation.source ∈ {DETECTOR, MODEL, PRIOR_ESCALATION}`. This is the chosen reading of DEC-OQ2.4's "logged as ESCALATED_FULL with the reason": the reason and the escalation are always logged, but a wasted request is issued only when the model is the signal.

#### 3.2.6 Prompt assembly and inference efficiency (FR-5, FR-11..FR-13, COL-7, DEP, R-Q1, R-Q2)

A new captured assembly replaces `PromptAssembler.assembleCaptured`. The old method is not reused as-is because it injects per-test references into the static block and has no read-only marking (COL-7).

**Request layout (static first):**

| Part | Content | Stability |
|---|---|---|
| `systemInstruction` | `output-contract.md` + separator + `syntax-reference.md`. **Nothing** per-test or per-request: no reference list, no mode, no IDs | Byte-identical at the same prompt/policy pins (FR-11, NFR-2) |
| `contents[0]` (user), in order | (a) global context, **once** (FR-12); (b) declared reference **names** (NFR-5); (c) ordered steps: locked steps as `READ-ONLY — already executed; page state after these steps` with English + baseline code, then writable steps with English (+ anchor per switch); (d) required envelope kind + **writable step IDs**; (e) repair context when repairing | Per request |

- **Writable IDs** are never derived from the random `compileRequestId` in a way that enters the static part (FR-11).
- **Locked prefix context is always sent.** Every locked step's English and baseline code, fenced and marked read-only (DEC-OQ2.3, FR-5, R-Q2 rec. 1).
- **Writable-step anchor switch** `studio.compile.prompt.writable-anchor ∈ {NONE, LABELED}`. The value is decided by the 10.26 harness arm A/B (DEC-OQ2.3, OQ-7, R-Q2). The effective value is an **explicit input to the compilation fingerprint** (CRIT-8b), so flipping the property without a `PROMPT_VERSION` bump still makes every baseline compiled under the other value ineligible (`FINGERPRINT_CHANGE`). The property stays so the harness can run both arms:
  - `NONE`: writable steps carry English only.
  - `LABELED`: unchanged-hash writable steps carry prior code as "last known good for this exact text". Edited steps carry prior code labeled `SUPERSEDED — written for different text: <old text>`.
  - The harness measures stale-identifier carry-over (for example, the old variable name surviving) (R-Q2). Until the harness decides, the default is `NONE`.
- **Size cap.** Measured after deduplication. An oversized complete context → `CONTEXT_TOO_LARGE` and is never truncated (FR-5 AC-5.2, EC-15).
- **Provider schema.** `providerSchema()` builds the schema with deterministic key order (sorted / `LinkedHashMap`) instead of `Map.of`, so the bytes are identical across JVMs and replicas (DEP implicit caching, "prefix-instability risk"). It is kind-dependent for `PREFIX_IMPACT` (§3.2.5).
  - **Caching caveat (CRIT-14).** The schema also embeds per-request values: the `kind` enum and the writable step IDs. Research leaves it UNKNOWN whether `responseJsonSchema` is part of the provider's cached prefix. The writable IDs stay in the schema because they are needed for correctness. Any caching benefit is therefore **conditional** on the schema sitting outside the cached prefix. SPK-01 (OQ-9) checks this.
- **Thinking.** `thinkingConfig.thinkingLevel` is always sent explicitly, never together with `thinkingBudget`, and never `MINIMAL` for gemini-3.8-flash (DEP thinking).
  - Initial pinned value: `MEDIUM`. Gemini API docs state this is the gemini-3.8-flash default. That it also holds on Vertex behind R2D2 is **inferred** (research: Vertex/R2D2 behaviour UNKNOWN) and is confirmed by SPK-01. Quality is therefore *expected* not to change, which is not a verified claim (CRIT-7c).
  - `LOW` becomes the pin only if the 10.26 harness A/B shows no quality regression (research "consider").
  - The level is included in the compilation fingerprint (FR-13, C0 §5).
- **Fingerprint** = gateway settings (model, maxOutputTokens, thinkingLevel) + `PROMPT_VERSION` (layout) + the **effective writable-anchor value** + syntax-reference version + validator/runtime pins + `VersionedIntentDeriver.CURRENT_VERSION` + **`StepReferencePolicyDeriver.POLICY_VERSION`** (today `2`) (COL-6, C0 §6, CRIT-8b). Each named input has its own fingerprint unit test: change it and the fingerprint changes. The detector version goes into the plan audit, not the fingerprint, because it does not affect generation.
- **Usage.** Per proposal, record: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`, `totalTokenCount`, finish reason, and the actual generation settings. An absent field is stored as `null` with `usageAvailable:false`, never `0` (FR-13, DEP genai "null-not-zero").
- **Per-Run and escalation telemetry (CRIT-7).** Each request's plan/outcome carries a `runCorrelationId` (Q2 inherits Q1's), so usage can be summed per Run including a wasted Q1. The plan audit records `escalation.source` and detector `ruleIds`. These feed the NFR-1 net-cost report and the `escalationRate` / `detectorHitRate` metrics. IDs and rule IDs only, never step text (R-Q4, NFR-5).
- **Repair.** The repair request carries explicit correction instructions, the **bounded, redacted rejected proposal** and diagnostics. It keeps the same `kind` and the **same frozen writable IDs**. It never widens the write set (FR-10, C0 §3/§4). The same prefix applies, so a same-test repair *may* hit the cache, but this is not claimed.
- **Caching claim.** The static prefix is ~9.2 KB, roughly 2.3–2.7K tokens (inferred). That is below the 4,096-token implicit-cache minimum for Gemini 3.x, so **no savings are claimed or targeted** from implicit caching. The benefit is recorded as *future* and only applies if the prefix grows or total requests exceed the minimum. `cachedContentTokenCount` is recorded so the benefit can be observed (DEP implicit caching, R-Q1, unverifiedClaims ASM-2/NFR-2). The *candidate* efficiency levers are suffix-only output (NFR-1), the thinking level, and global-context dedup (DEP implicit caching, "Expected value"). Their **net** effect is unmeasured. It is offset by the locked-prefix code INCREMENTAL adds to the input, by wasted escalated Q1 requests, and by detector or `PREFIX_IMPACT` false positives, which cost a FULL each. The NFR-1 harness report decides (CRIT-7).
- **Degradation (EC-17, CON-8).** If SPK-01 shows the R2D2 proxy rejects `systemInstruction`, the identical static bytes are sent as the leading text of `contents[0]`, so static-first order is kept. If it rejects `thinkingConfig`, the field is omitted and the fingerprint records `thinkingLevel:"PROVIDER_DEFAULT"`. Shared enablement stays blocked if the approved contract cannot be met (C0 §4/§5).

#### 3.2.7 Proposal acceptance, merge, validation and repair (FR-6, FR-10)

- PATCH must cover each writable ID exactly once and nothing else. An out-of-scope, missing or duplicated ID → `INVALID_MODEL_RESPONSE`, which consumes a repair within the shared limit of 3 proposals (FR-6, EC-9, NFR-4).
- `IncrementalAssembler` merges the reused prefix with the generated suffix. The server derives `stepIndex` and `originalText` (CON-4).
- **Reused-prefix guard (CRIT-1c).** For every reused position the assembler re-checks the **full `StepIdentity`**: `stepIdentityHash`, `id` and position all equal the baseline. Today it compares only `CompilationPlanner.Step(id, text)`. A mismatch is a server fault. The request settles `STALE` with an error code, and nothing is published or reused. The runner validates the **complete** merged artifact with `referencePolicy` (FR-6 AC-6.2, COL-6).
- If validation fails inside a reused step → `NEEDS_REVISION` + `FULL_REBUILD_REQUIRED`. No scope widening and no escalation (FR-10, EC-10).
- `UNSUPPORTED` / `CLARIFICATION` → terminal `NEEDS_REVISION` (EC-11). Transport, deadline or validator-unavailable → `STALE` (EC-13).

#### 3.2.8 Run gate with auto-accept (FR-9, DEC-OQ3, C0-A3)

- `useRunGate` (on the mounted v2 page) sends `{mode:"AUTO"}`. It polls the compile resource and surfaces the selected mode and reason before execution starts (AC-9.1).
- On `ESCALATED_FULL` it follows `escalatedTo` once and shows "Escalated to full rebuild: <reason>". On `DISCARDED` (any §3.2.5 (c) `reasonDetail`) or `ABANDONED` (§3.2.5 step 5) it stops, does not execute, and asks the author to Run again.
- Poll bound: one C0 §5 compile ceiling (240 s start bound) plus margin per request, renewed once on escalation. This replaces the fixed 330 s, which cannot cover two budgeted requests (derived from DEC-OQ2.4 "budgeted as a separate request"; OQ-S4).
- On `AWAITING_CONFIRMATION` the gate calls `confirm-compile` with `compileRequestId`, `revisionId`, `artifactHash`, `sourceRevision`, `configurationRevision`, `authoringHash` taken from that Run's own compile result, then executes. `authoringHash` is the V21 `contextDigest` defined in §3.2.1. The server compares it against the draft's and the candidate revision's `authoring_revision_inputs->>'contextDigest'`, never against the deprecated V18 column (CRIT-2). It never auto-accepts `NEEDS_REVISION`, `STALE` or a candidate from a different compile request.
- The explicit **Compile changes** / **Rebuild all steps** actions keep the manual confirm flow (C0 §7, 10.25).

#### 3.2.9 Surface: restored v2 stack and InferenceStudio (DEC-OQ4, FR-8, CON-11)

- **Backend.** Re-port `StudioAuthoringController` (`/api/v2/studio`: POST `/tests`, GET/PUT `/tests/{id}`, POST `/tests/{id}/compile`, POST `/tests/{id}/confirm-compile`, GET `/tests/{id}/compiles/{compileRequestId}`), `StudioAuthoringService` and `AuthoringDtos` from `51ade0f1f`, reconciled per §3.2.1. All their dependencies exist live (DEP archived stack). Bind `studio.authoring.v2-enabled` and `studio.compile.incremental.enabled`, both default false (BRIEF flags; CON-3).
- **Frontend.** The `studio` and `studio/:id` routes render the rebuilt `InferenceStudio` when `studioAuthoringV2` is on. When it is off they keep `ChecksStudioPage`, and the v2 page never silently writes via v1 (CON-11). Rebuild on the current pipeline:
  - Author the 10.35 step context, global context and declared references, and follow the Story 10.44 translation path and structural reference policy (DEC-OQ4, COL-1).
  - **Remove** the scope checkbox (DEC-OQ2.1).
  - Keep the step reorder / duplicate / remove / add controls. They now stay incremental from p (C0-A4).
  - Keep **Rebuild all steps** (FR-8 AC-8.2).
  - The Run action implements §3.2.8.
  - The compile/Run log shows per-step `REUSED (from revision R)` / `REGENERATED` badges, a code diff for regenerated steps against the baseline, the mode, the reason / `reasonDetail`, and any escalation (FR-8, DEC-OQ3, NFR-6).
- **Contracts.** `docs/specs/studio/inference.openapi.yaml`: compile body `{mode}`, a response with `selectedMode`, `reason`, `reasonDetail`, `escalation`, `escalatedFrom/To`, `writableIds`, `reusedIds`, per-step origin, and confirm `confirmationSource`. `docs/specs/studio/inference-proposal.schema.json`: the `PREFIX_IMPACT` variant. The MSW `inferenceHandlers.ts` models INCREMENTAL / FULL / REUSE / ESCALATED_FULL (CON-11).

### 3.3 Data model (COL-1, COL-3, COL-4, COL-5, CON-9; owner @data-engineer)

| Item | Decision |
|---|---|
| Source of truth | V21 `ui_tests.authoring` + `authoring_revision_inputs` (§3.2.1). V18 `authoring_snapshot` / `authoring_hash` are deprecated: not read and not written. `authoringHash` is `authoring_revision_inputs->>'contextDigest'` on all three tables (§3.2.1) |
| **V26** (first free number; V25 is the in-flight secrets migration; coordinate at merge) | (a) `ui_test_compile_requests` gains the captured `authoring`, `authoring_revision_inputs`, `reference_policy` and `intent_derivation_version`, so `insertCapturedRevision` writes all four onto `ui_test_revisions`. **Captured revisions must carry the V24 `reference_policy`** and satisfy `ck_ui_test_revisions_v2_reference_policy` and the identity index (COL-3). (b) **Restore the whole-row write-once trigger** (`to_jsonb(NEW) - confirmed_* IS DISTINCT FROM to_jsonb(OLD) - confirmed_*`), which covers the V18 columns `compile_request_id`, `authoring_snapshot`, `authoring_hash`, `scope_reviewed_*`, `compilation_fingerprint`, `baseline_revision_id` and all V21/V24 columns (COL-5). (c) Rebase `idx_ui_test_revisions_eligible` if the baseline predicate change needs it. (d) **Stop the V21 capture trigger overwriting captured authoring (CRIT-5).** `capture_ui_test_revision_authoring()` (trigger `trg_ui_test_revisions_capture_authoring`) today copies the *current* `ui_tests.authoring` / `authoring_revision_inputs` into every inserted revision, overwriting what the INSERT supplies. It becomes a no-op when `NEW.compile_request_id IS NOT NULL`, because the captured value is authoritative. The legacy uncaptured path keeps today's behaviour. (e) **Extend the V18 capture-consistency trigger** `studio_inference_revision_capture()` (`trg_ui_test_revision_capture`, which fires first by name order) so it also requires `authoring`, `authoring_revision_inputs`, `reference_policy` and `intent_derivation_version` to be `IS NOT DISTINCT FROM` the compile-request row. That covers `authoringHash`, which lives inside `authoring_revision_inputs`. Because (d) removes the later overwrite, the values checked by (e) are the values stored. (f) `ui_test_compile_requests.escalated_from_request_id UUID NULL UNIQUE REFERENCES ui_test_compile_requests(request_id)`, plus an index on `(test_id, (authoring_revision_inputs->>'contextDigest'), baseline_revision_id, compilation_fingerprint)` for plan rule 4a (§3.2.4, §3.2.5). Dara may split (a)–(f) into V26/V27 |
| **V26 regression guard (CRIT-12)** | The whole-row trigger (b) blocks every UPDATE on `ui_test_revisions` except first confirmation. Before merge, the plan must provide: (1) a grep of the backend for every `UPDATE ui_test_revisions` statement and every JPA save of `UITestRevision`, each classified as confirmation-only or removed; (2) the **full existing backend IT suite** green with V26 applied (execution linking, the abandonment sweeper and seed/backfill paths included); (3) a positive IT showing that the first confirmation still succeeds and a second one is rejected, including the self-confirmation UPDATE in `publishAcceptedCandidate` (`:281-290`) on a captured revision; (4) **rollback is tested, not asserted** (AC-B1-3): the **pre-B1 binary's** backend IT suite passes against a schema with V26 applied (whole-row trigger, extended consistency trigger, V21 trigger no-op), in addition to the new binary's full suite |
| Telemetry | FR-13/FR-14 fields go into the V18 JSONB `compile_plan` / outcome columns (inferred sufficient; complexity verifiedFacts). Dara confirms |
| **V19** | **Must not be applied as it stands.** Required order (COL-4): (1) capture for all compiles is deployed; (2) all replicas run the capture binary; (3) drain incompatible publishers; (4) Dara re-anchors and re-validates V19 against V24 and V26, then applies it via the runbook with `checks.inference_publishers_drained='true'`; (5) only then enable `studio.compile.incremental.enabled`. V19 is forward-only, so old binaries cannot be restored afterwards (runbook :64-78). The rollback floor is the capture binary. Steps (1)–(4) are an explicit runbook step between story B1 and enablement (§9). **V19 is not part of B1's deploy** (AC-B1-4). B1 runs on all replicas before the separate V19 step. The runbook's go/no-go for V19 compares the live compile error rate and STALE rate before and after B1. No numeric threshold is set (CON-10), and the comparison itself is the gate. Only after B1 do both publish paths (§3.2.3) insert with a non-null `compile_request_id`, so the require-request trigger cannot reject them |
| Historical rows | Never rewritten. Legacy revisions are never retroactively eligible (C0 §2, CON-7) |

### 3.4 C0 amendments (for Aria's sign-off, CON-2; C0 text itself not edited here)

| ID | C0 text amended | Amendment | Rationale |
|---|---|---|---|
| **C0-A1 Implicit forward scope** | §2 `scope` / STEP_SCOPED as the INCREMENTAL precondition; §3 reason `SCOPE_UNKNOWN`; §2 "UI must obtain renewed review" | The STEP_SCOPED author affirmation is no longer a precondition. By default every step's meaning is taken to depend on its own text, the preceding steps and the declared references. `scope` is persisted server-side as `{policyVersion (advanced; value set by Aria — OQ-S5), declaration:"DERIVED_FORWARD"}` for audit only. The client cannot set it, and no reviewer/time is attributed. The planner no longer emits `SCOPE_UNKNOWN`. Violations of that default are caught by C0-A2 | DEC-OQ2.1 (user intent: an ordered English checklist, no checkbox). C0 §2 already says the declaration is "not proof". Trust now rests on the detector, PREFIX_IMPACT, whole-artifact validation, FULL execution from step 1, and Rebuild all steps (DEC-OQ2.5, R-Q4.risks) |
| **C0-A2 PREFIX_IMPACT and ESCALATED_FULL** | §3 "no auto-regeneration of protected steps or hidden full fallback"; §4 envelope variants; §4 outcome table | (i) New PATCH-only envelope status `PREFIX_IMPACT` (§3.2.5). (ii) New terminal request outcome `ESCALATED_FULL`: no candidate and no repair. (iii) The server automatically creates a new, separately budgeted FULL request with the forced plan reason `ESCALATED_FULL` (`reasonDetail: PREFIX_IMPACT`, `escalation.source: MODEL`; a new plan-reason value, never selected by the planner), linked via `escalatedFrom`/`escalatedTo`, visible in the UI and the audit. It is created only if the draft and authorization are unchanged, otherwise Q1 is `DISCARDED` (§3.2.5 "Q2 creation"). At most one Q2 per Q1 (unique constraint) and one per Run. (iv) A detector hit maps to the existing `GLOBAL_OR_FORWARD_SCOPE` with `escalation.source=DETECTOR`, and no `ESCALATED_FULL` request is issued. (v) A later Run on the same draft, baseline and fingerprint after an `ESCALATED_FULL` goes directly to FULL `PREFIX_IMPACT / PRIOR_ESCALATION` (§3.2.4 rule 4a). (vi) The provider response schema admits `PREFIX_IMPACT` for PATCH only | DEC-OQ2.4. C0 §2 already allows a heuristic to "flag uncertainty" without enlarging its write set. The escalation is a new request, never a widened one. Visibility and a separate budget keep "no hidden fallback" in substance (R-Q4.precedent) |
| **C0-A3 Run auto-accept** | §1 "explicitly confirmed"; §7 confirmation; the 2026-09-16 amendment "explicit Compile changes/Rebuild all steps actions invoke generation" | Clicking Run counts as explicit confirmation of the candidate produced by *that Run's* compile request. The server validates all six §7 identity fields exactly as for a manual confirm, and records `confirmationSource:"RUN"` and the Run principal. Manual confirmation remains for Compile changes / Rebuild all steps. Auto-accept never applies to NEEDS_REVISION, STALE or another request's candidate | DEC-OQ3. The review is moved to the Run log (reused vs regenerated + diff), and the binding invariants of §7 are unchanged |
| **C0-A4 Structural edits incremental from p** | §2 "Structural insert/delete/reorder selects FULL in this release"; §3 `STRUCTURAL_CHANGE`; CON-6 | Insert / delete / reorder / duplicate are handled at the earliest affected position p (§3.2.4). The prefix 1..p−1 is locked only when ID, identity hash and position all match. p = 1 → FULL `ALL_STEPS_AFFECTED`. A pure tail deletion (writable set empty) → REUSE with the new reason `TAIL_DELETION` and fresh validation. `STRUCTURAL_CHANGE` is kept for flag-off audit only | DEC-OQ2.2 (binding) overrides CON-6 and resolves COL-8 in favour of decisions.md. Positions before p are identical in both lists by construction, so prefix byte identity (NFR-3) and server-derived `stepIndex` are preserved |
| **C0-A5 Change-detection identity** | §3 "earliest changed step" (the planner compares `{id,text}`) | A step counts as changed when its text, its **entire** step context (every entry kind plus `evidenceReferences`, hashed from the stored JSON, fail-closed) or its position-free per-step reference-policy entry changes. A change to globalContext or global defaults → FULL `GLOBAL_OR_FORWARD_SCOPE` | COL-2, CRIT-1 (closes the false "unchanged" cases) |
| **C0-A6 Authoring snapshot** | §2 "immutable authoring snapshot {version:2, steps:[{id,text}], scope}" | The immutable snapshot is the V21 `authoring` / `authoring_revision_inputs` (steps with context + globalContext). The V18 `authoring_snapshot` / `authoring_hash` are deprecated. The §2/§7 `authoringHash` is redefined as `authoring_revision_inputs.contextDigest` (§3.2.1) | COL-1, CRIT-2 |

Not amended: exact reference-set equality (DEC-OQ1), FULL execution (CON-1), AUTO/FULL only (CON-5), repair bounds and the write-set freeze (C0 §3–§5), and the v2 route layout (DEC-OQ4 matches C0 §1).

### 3.5 Data flow: user scenario

1. The author edits step 2 of R1 (`open site` / `login as <var userA>` / `validate page loaded`) to use the already-declared `userB`, then clicks Run.
2. PUT v2 → `sourceRevision` advances (text/token edit) or `configurationRevision` advances (step-context edit). Either way s2's `stepIdentityHash` and the draft's `authoringHash` change (§3.2.1, §3.2.2).
3. Compile AUTO → capture → plan: baseline R1 (PASSED FULL execution, same fingerprint, same reference set) → p = 2 → detector: no hit → INCREMENTAL `SCOPED_SUFFIX`, writable `[s2,s3]`, reused `[s1]`.
4. Prompt: static `systemInstruction`; s1 READ-ONLY English + code; s2 and s3 writable; PATCH over `[s2,s3]`.
5. Merge → validate the complete artifact → candidate R2.
6. Auto-accept (source RUN).
7. Execute FULL from step 1.
8. The log shows s1 REUSED (R1) and s2/s3 REGENERATED with a diff.

Flag off: the same flow with FULL `INCREMENTAL_DISABLED`, and confirmed artifacts are not rewritten (CON-3).

---

## 4. Dependencies

### 4.1 External Dependencies

| Dependency | Version | Purpose | Verified |
|---|---|---|---|
| com.google.genai:google-genai | 1.71.0 (installed) | `systemInstruction`, `ThinkingConfig.thinkingLevel`, usage fields | ✅ SDK surface (javap). ⚠️ R2D2 pass-through (SPK-01, OQ-9) |
| Vertex gemini-3.8-flash | model per `StudioGatewayProperties` | Generation. Thinking LOW/MEDIUM/HIGH; MINIMAL errors | ✅ Gemini API docs. ⚠️ Vertex v1 behind R2D2 |
| Vertex implicit caching | n/a | Best-effort. Recorded only, no savings claimed | ⚠️ Prefix below the 4,096 minimum; proxy unknown |
| studio-runner `POST /v1/validate` | artifact v1 | Whole-artifact validation | ✅ existing |

### 4.2 Internal Dependencies

| Module | Purpose |
|---|---|
| Story 10.24 components (`CompilationPlanner`, `IncrementalAssembler`, `InferenceCaptureStore`, `CompileBudget`, `CompileStateService.captureForCompilation/confirmVersioned`) | Kept byte-identical to the archive and extended here (DEP archived stack) |
| Story 10.25 FE (`InferenceStudio.tsx`, `studioInferenceApi.ts`, `inferenceHandlers.ts`) | Rebuilt and mounted |
| Story 10.26 harness | Decides the anchor switch and the thinking level, measures NFR-1, and gives detector precision/recall (R-Q2, R-Q4) |
| Story 10.35 V21 authoring, Story 10.44 V24 reference policy, `StepReferencePolicyDeriver`, `VersionedIntentDeriver` | Source of truth and identity inputs |
| Story 10.24 AC-8 (cross-CSI/revoked) | Enablement precondition (OQ-12, CPLX SECURITY flag) |
| In-flight secrets/dispatch worktree changes (V25) | Must land first (CPLX WORKTREE flag) |

---

## 5. Files to Modify/Create

### 5.1 New Files

| File Path | Purpose |
|---|---|
| `backend/src/main/java/com/citi/put/checks/studio/authoring/StudioAuthoringController.java` | Re-port of the /api/v2 routes (§3.2.9) |
| `backend/src/main/java/com/citi/put/checks/studio/authoring/StudioAuthoringService.java` | Re-port, rebased on V21 |
| `backend/src/main/java/com/citi/put/checks/studio/authoring/AuthoringDtos.java` | Reconciled with `AuthoringV2Request` |
| `backend/src/main/java/com/citi/put/checks/studio/compile/incremental/DependencyDetector.java` | Detector rules (§3.2.5) |
| `backend/src/main/resources/db/migration/V26__*.sql` (+V27 if split) | §3.3 (Dara) |
| Tests: `StudioAuthoringIT`, `StudioAuthoringServiceTest`, `StudioVersionedCompilationIT`, `CompileFingerprintTest` (re-ported); `StepIdentityPlannerTest`, `DependencyDetectorTest`, `PrefixImpactEscalationIT`, `PromptLayoutTest`, `ProviderSchemaDeterminismTest`, `UsageCaptureTest`, `WriteOnceWholeRowIT`, `StepContextIdentityTest`, `AuthoringHashConfirmIT`, `CapturedAuthoringTriggerIT`, `EscalationCreationIT`; FE `InferenceStudio` badge/escalation component test | §6 |

### 5.2 Modified Files

| File Path | Changes | Risk |
|---|---|---|
| `backend/.../studio/compile/CompilePipeline.java` | Unified captured loop, capture for all, fingerprint, escalation | High |
| `backend/.../studio/compile/CompileStateService.java` | **Both** publish paths, `publishAcceptedCandidate` (live, `:273`) and `publishCandidate`, use one shared captured insert that writes the V21/V24 columns, with an untargeted `ON CONFLICT DO NOTHING` so pre-V19 identity collisions are reused (§3.2.3, CRIT-18). The publish-and-accept semantics of `publishAcceptedCandidate` are unchanged. `confirmationSource`. `authoringHash` compares rebased on `contextDigest` in `capture` and `confirmVersioned` (§3.2.1). No v1 rejection on authoring identity (CRIT-19). New `@Transactional` (REQUIRED) `escalateToFull`: lock, idempotency check, predicates, one outcome, forced-plan Q2 capture through a private capture core shared with `capture`. Never calls `captureForCompilation` (§3.2.5, CRIT-16/17) | High |
| `backend/.../studio/compile/InferenceCaptureStore.java` | Every V18 predicate rebased onto V21 (§3.2.1 table). Prior-escalation lookup (rule 4a, user-initiated only). `persist` gains a nullable `forcedPlan` that bypasses the planner (§3.2.5). The text guard is skipped for an absent or invalid V21 pair (CRIT-19) | High |
| `backend/.../studio/compile/incremental/CompilationPlanner.java` | StepIdentity, position rules, TAIL_DELETION, reason order | High |
| `backend/.../studio/compile/incremental/IncrementalAssembler.java` | Merge after structural edits (server-derived indexes); reused-prefix guard on full `StepIdentity`; `PREFIX_IMPACT` status/reason pair | Med |
| `backend/.../studio/compile/PromptAssembler.java`, `ContextPromptSection.java`, `RepairPromptAssembler.java` | Static-first captured assembly, global context once, rejected proposal in repair, anchor switch | Med |
| `backend/.../studio/compile/gateway/GatewayPayloadSerializer.java`, `GenAiLlmGatewayClient.java`, `GatewayResponseParser.java` | systemInstruction, deterministic kind-dependent schema (PREFIX_IMPACT for PATCH only), thinkingLevel, usage fields, PREFIX_IMPACT parse | Med |
| `backend/.../studio/compile/StudioCompileProperties.java`, `application*.yml` | Bind flags and the anchor switch (the anchor value is a fingerprint input) | Low |
| `backend/db/cutover/V19__studio_inference_candidate_identity.sql` | Re-anchor (Dara only) | High |
| `docs/specs/studio/inference.openapi.yaml`, `inference-proposal.schema.json` | §3.2.9 | Med (contract pin re-anchor, CPLX CONTRACT flag) |
| `frontend/src/components/studio/inference/InferenceStudio.tsx`, `frontend/src/services/api/studioInferenceApi.ts`, `frontend/src/components/studio/run/useRunGate.ts`, `frontend/src/App.tsx`, `frontend/src/services/mocks/studio/inferenceHandlers.ts` | Mount, remove scope checkbox, Run auto-accept, badges/diff/escalation, MSW outcomes | Med |
| `docs/runbooks/studio-inference-rollout.md` | Cutover order (§3.3) | Low |

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Test | Covers | Priority |
|---|---|---|
| Planner: text / context / reference-policy change each mark the step changed; unchanged text with a swapped context var is not REUSE | C0-A5, COL-2 | P0 |
| Planner: every row of the §3.2.4 table (p, locked, writable, reason) | FR-4, C0-A4 | P0 |
| Planner reason order including REFERENCE_SET_CHANGED, flag off, FULL requested | FR-7, DEC-OQ1, FR-3 AC-3.2 | P0 |
| Detector: each rule has positive and negative cases, exclusions ("log in again", "check all checkboxes"), STEP_NUMBER_REF forward is not a hit | DEC-OQ2.4, R-Q4 | P0 |
| Envelope: PREFIX_IMPACT valid only in PATCH; in FULL → INVALID_MODEL_RESPONSE | C0-A2 | P0 |
| Prompt: systemInstruction identical across two tests; no IDs / references / mode in it; global context appears exactly once; locked steps marked READ-ONLY with code; writable IDs = frozen set | FR-11, FR-12, FR-5, NFR-7 | P1 |
| Provider schema bytes identical across two fresh JVMs / hash seeds | DEP caching | P1 |
| thinkingLevel is sent, is in the fingerprint, and never goes with thinkingBudget or MINIMAL | FR-13 | P1 |
| Usage: missing thoughts/cached → null + usageAvailable:false | FR-13 AC-13.2 | P1 |
| Repair: carries the bounded, redacted rejected proposal; writable IDs unchanged; no resolved values | FR-10, NFR-5 | P0 |
| Step identity: a LiteralInput-only edit on s2 → s2 changed, INCREMENTAL `[s2,s3]`; a TargetHint-only edit on s1 → FULL `ALL_STEPS_AFFECTED`; a ContextText-only or evidenceReferences-only edit → changed; a context-only edit on every step is never REUSE | CRIT-1, NFR-3 | P0 |
| Step identity fails closed: an unknown context `kind` or field → changed (baseline side → `NO_ELIGIBLE_BASELINE / AUTHORING_UNREADABLE`); every `StepContextEntry` permit has an identity fixture | CRIT-1 | P0 |
| Reference-policy entry: an insert before s3 does not mark the shifted s3 changed (`stepIndex` excluded) | CRIT-8a | P0 |
| REUSE preconditions: `CONFIGURATION_ONLY` only when `authoringHash` is equal; `TAIL_DELETION` requires a PASSED FULL baseline; flag off with a viewport-only change → REUSE `CONFIGURATION_ONLY`, not FULL | CRIT-1b, CRIT-13 | P0 |
| Reused-prefix guard: an assembler input whose reused step hash differs from the baseline → STALE, nothing published | CRIT-1c | P0 |
| Provider schema: the PATCH schema contains `PREFIX_IMPACT` / `LOCKED_STEP_CHANGE_REQUIRED`; the FULL schema does not | CRIT-3 | P0 |
| Envelope precedence: PATCH with `PREFIX_IMPACT` plus a missing writable ID → `INVALID_MODEL_RESPONSE`, not `ESCALATED_FULL` | CRIT-3 | P0 |
| Planner rule 4a: a prior `ESCALATED_FULL` with the same `authoringHash`/baseline/fingerprint → FULL `PREFIX_IMPACT / PRIOR_ESCALATION`, no PATCH; a different `authoringHash` → normal planning | CRIT-6 | P0 |
| Fingerprint: changing the anchor value, `POLICY_VERSION`, thinkingLevel or `CURRENT_VERSION` each changes the fingerprint | CRIT-8b, FR-13 | P1 |
| Size cap: a context over the cap after dedup → `CONTEXT_TOO_LARGE`; the prompt is never truncated | FR-5 AC-5.2, EC-15 | P1 |

### 6.2 Integration Tests

| Test | Components | Scenario |
|---|---|---|
| `StudioVersionedCompilationIT` | pipeline + capture + runner stub + DB | User scenario, byte identity of s1, origins |
| `PrefixImpactEscalationIT` | pipeline + stub gateway | PREFIX_IMPACT → ESCALATED_FULL → new FULL request (linked), then no further escalation. PREFIX_IMPACT on repair attempt 2 also escalates |
| `EscalationCreationIT` | pipeline + DB + stub gateway | (1) A save between Q1's PREFIX_IMPACT and Q2 capture → Q1 has **exactly one** outcome row and it is `DISCARDED / DRAFT_CHANGED_BEFORE_ESCALATION`, no Q2 (EC-12, CRIT-16). (2) CSI access revoked → exactly one `DISCARDED / ACCESS_REVOKED` outcome, no Q2. (3) A crash after the step-2 commit and before enqueue → the sweeper returns the draft to STALE, and there is never a second Q2. (3b) A crash before the step-2 commit → Q1 has no outcome row, `GET /compiles/{Q1}` reports `ABANDONED`, and the next Run sends a PATCH (rule 4a not triggered) (CRIT-20a). (3c) `escalateToFull` called twice for the same Q1 → the second call writes nothing and returns the same Q2, and no transaction aborts (CRIT-20b). (4) Q1's bulkhead slot is free before Q2 starts. (5) A second Run on the same draft → no PATCH sent. (6) Q2's plan is `FULL / ESCALATED_FULL / PREFIX_IMPACT` with `escalation.source = MODEL` and `escalatedFrom = Q1`, **not** `PRIOR_ESCALATION` or `EXPLICIT_FULL` (CRIT-17). (7) Atomicity: a fault injected after Q2's request insert rolls back Q1's `ESCALATED_FULL` outcome too (no Q1 outcome, no Q2); `captureForCompilation` is never invoked (CRIT-17) |
| `AuthoringHashConfirmIT` | v2 save + compile + confirm | Confirm with source RUN succeeds against a V21-only draft (V18 columns NULL). A context-only save between compile and confirm → `STALE_CANDIDATE` |
| `CapturedAuthoringTriggerIT` | V26 (d)/(e) | A captured insert whose `authoring` differs from its request is rejected. A draft edited after capture does not leak into the revision. A legacy uncaptured insert still gets the draft copy |
| v2 authoring IT | v2 PUT | AC-2.1: editing s2's text keeps all three IDs and advances `sourceRevision`. AC-2.2: an exact no-op save keeps the snapshot and `authoringHash` and triggers no compile |
| Late completion IT | execute path | EC-16: an old run completing after a newer revision exists does not mark the newer draft green |
| Capture-for-all IT | v1 legacy compile via `CompilePipeline` → `publishAcceptedCandidate` | A `ui_test_compile_requests` row exists for FULL/legacy. The published revision has non-null `compile_request_id`, and its `authoring`, `authoring_revision_inputs`, `reference_policy` and `intent_derivation_version` equal its request's. The test is still READY and self-confirmed as today (CRIT-18, AC-B1-1). A recompile producing a byte-identical artifact before V19 reuses the existing revision and does not fail. With V19 applied in the test schema, a v1 compile publishes without tripping `trg_ui_test_revision_require_request` |
| Unversioned capture IT | v1 compile, legacy drafts | (i) V21 pair absent, (ii) V21 pair present but failing `AuthoringRevisionIdentity.valid`, (iii) V21 step texts differing from `source` → each compiles FULL `LEGACY_MAPPING` exactly as before B1, with no 409 and no `IllegalStateException` (CRIT-19, AC-B1-2) |
| Pre-B1 rollback IT (CI job) | pre-B1 binary + V26 schema | The pre-B1 commit's backend IT suite passes against a database migrated through V26 (AC-B1-3) |
| `WriteOnceWholeRowIT` | V26 | Updating `compile_request_id` / `reference_policy` on a revision fails. The first confirmation succeeds, the second fails. The full existing backend IT suite passes with V26 applied (CRIT-12) |
| Captured publication V24 IT | V26 + CompileStateService | Captured revision has non-null `reference_policy` when `authoring` is non-null |
| Cross-CSI / revoked baseline | InferenceCaptureStore | No eligible baseline (NFR-5) |
| Bounds suites on the captured path | CompileBounds / RepairBounds / CompileBudgetExpiry | NFR-4 |
| `NoRuntimeLlmTest` | execute path | CON-1 |
| FE `useRunGate` + MSW | run gate | AUTO → poll → escalation follow → confirm-compile (RUN) → execute; no auto-accept on NEEDS_REVISION; DISCARDED stops the Run without executing |
| FE `InferenceStudio` component + a11y (Vitest/RTL, axe) | Run log | AC-8.1: REUSED/REGENERATED badges have accessible names and are not color-only. Regenerated steps show a diff. The escalation banner is announced (live region). `FULL_REBUILD_REQUIRED` shows "Rebuild all steps", which sends FULL `EXPLICIT_FULL` (NFR-6, 10.25 AC-5) |

### 6.3 Acceptance Tests (Given-When-Then)

```gherkin
Feature: Incremental compilation on Run

  Background:
    Given studio.compile.incremental.enabled=true and studio.authoring.v2-enabled=true
    And test T (CSI X) has steps s1 "open site", s2 "log in as <userA>", s3 "validate page loaded"
    And T declares references {userA, userB, password}
    And revision R1 of T is confirmed and has a PASSED FULL execution at the current fingerprint

  Scenario: AC-1 Switch step 2 to an already-declared variable (user's scenario)
    When the author changes s2 to use userB (via text token or step context) and clicks Run
    Then the compile request carries mode AUTO
    And selectedMode is INCREMENTAL with reason SCOPED_SUFFIX
    And writableIds = [s2, s3] and reusedIds = [s1]
    And s1 stepIndex, originalText and code in the new candidate are byte-identical to R1
    And the prompt contains s1 English and R1 code marked READ-ONLY and lists only s2, s3 as writable
    And the runner validates all 3 steps
    And the candidate is confirmed with confirmationSource RUN
    And execution runs FULL from step 1 in a fresh browser
    And the Run log shows s1 "Reused from R1", s2 and s3 "Regenerated" with a code diff

  Scenario: AC-2 A newly declared variable forces FULL with a reason
    When the author declares a new reference userC, uses it in s2 and clicks Run
    Then selectedMode is FULL with reason NO_ELIGIBLE_BASELINE and reasonDetail REFERENCE_SET_CHANGED
    And the UI shows that reason before execution starts

  Scenario: AC-3 Context-only variable swap is detected as a change
    Given s2 text is unchanged and only its step-context VariableReference changes from userA to userB
    When the author clicks Run
    Then s2 is treated as changed, selectedMode is INCREMENTAL with writableIds [s2, s3]
    And selectedMode is not REUSE
    When instead only a LiteralInput value in s2's context changes from "alice" to "bob"
    Then s2 is treated as changed and writableIds = [s2, s3]
    When instead only a TargetHint in s1's context changes
    Then selectedMode is FULL with reason ALL_STEPS_AFFECTED

  Scenario: AC-4 Insert after position k preserves prefix identity
    Given T has 4 steps
    When the author inserts a new step at position 3
    Then p = 3, reusedIds = [s1, s2] byte-identical, writableIds = [new, s3, s4]
    And s3 and s4 keep their IDs and move to positions 4 and 5 (server-derived 0-based stepIndex 3 and 4)

  Scenario: AC-5 Delete and reorder
    When the author deletes s2 of a 4-step test
    Then p = 2, reusedIds = [s1], writableIds = [s3, s4]
    When instead the author swaps s2 and s4
    Then p = 2, reusedIds = [s1]
    When instead the author deletes only the last step
    Then selectedMode is REUSE with reason TAIL_DELETION, no proposal is made, and the whole candidate is validated

  Scenario: AC-6 Change at step 1
    When the author edits or inserts at position 1
    Then selectedMode is FULL with reason ALL_STEPS_AFFECTED

  Scenario: AC-7 Detector escalation
    When the author changes s2 to "log in with the same username as in step 1"
    Then selectedMode is FULL with reason GLOBAL_OR_FORWARD_SCOPE and escalation.source DETECTOR with ruleIds containing BACKWARD_VALUE_REF
    And no incremental proposal was sent
    And the log contains the rule id but not the step text

  Scenario: AC-8 Model PREFIX_IMPACT escalation
    Given the gateway stub returns PREFIX_IMPACT for s2 in the PATCH response
    When the author clicks Run after editing s2
    Then compile request Q1 ends ESCALATED_FULL with no candidate and no repair
    And a new request Q2 is FULL with reason ESCALATED_FULL, reasonDetail PREFIX_IMPACT, escalation.source MODEL, escalatedFrom Q1, and its own budget
    And Q1 has exactly one outcome row, ESCALATED_FULL
    And the Run follows Q2, auto-accepts its candidate and executes
    And a PREFIX_IMPACT entry in a FULL response is rejected as INVALID_MODEL_RESPONSE
    And the provider schema sent for Q1 (PATCH) allows PREFIX_IMPACT and the one sent for Q2 (FULL) does not
    When the author clicks Run a second time on the same draft after Q2 ended NEEDS_REVISION
    Then selectedMode is FULL with reason PREFIX_IMPACT and reasonDetail PRIOR_ESCALATION
    And no PATCH request is sent

  Scenario: AC-8b Draft moves before escalation
    Given the gateway stub returns PREFIX_IMPACT for s2
    And the author saves another edit before Q2 would be captured
    Then Q1 ends DISCARDED with reasonDetail DRAFT_CHANGED_BEFORE_ESCALATION
    And Q1 has exactly one outcome row
    And no Q2 exists, nothing is auto-accepted, and nothing executes

  Scenario: AC-9 Out-of-scope patch and reused-code failure
    When the PATCH includes s1
    Then it is INVALID_MODEL_RESPONSE and the repair lists only [s2, s3] and includes the redacted rejected proposal
    When the runner flags an error inside reused s1
    Then the outcome is NEEDS_REVISION with FULL_REBUILD_REQUIRED, no further proposal, and no auto-accept

  Scenario: AC-10 Flag off and explicit rebuild
    Given studio.compile.incremental.enabled=false
    When the author edits s2 and clicks Run
    Then selectedMode is FULL with reason INCREMENTAL_DISABLED
    When the author picks "Rebuild all steps"
    Then requestedMode is FULL with reason EXPLICIT_FULL, as a new compile request

  Scenario: AC-11 Unedited READY test
    When the author clicks Run without edits
    Then no compile request and no LLM call occur and execution is FULL

  Scenario: AC-12 Inference efficiency
    Given two compiles of different tests at the same pins
    Then their systemInstruction bytes are identical and contain no step IDs, references or mode
    And each request contains the global context exactly once
    And thinkingConfig.thinkingLevel is set and equals the fingerprint's thinkingLevel
    And per-proposal telemetry has thoughtsTokenCount and cachedContentTokenCount, null with usageAvailable false when absent

  Scenario: AC-13 Data integrity
    Then every compile, FULL and legacy included, writes a ui_test_compile_requests row
    And every captured revision with non-null authoring has non-null reference_policy
    And an UPDATE of compile_request_id, compilation_fingerprint or reference_policy on ui_test_revisions is rejected
    And every captured revision's authoring and authoring_revision_inputs equal its compile request's, even if the draft was edited after capture

  Scenario: AC-14 Confirm binds the V21 authoring hash
    Given T has V21 authoring and NULL V18 authoring_hash
    When a Run compiles and auto-accepts
    Then confirm-compile succeeds with authoringHash equal to the draft's contextDigest
    When instead a context-only save happens between compile and confirm
    Then confirm-compile fails with STALE_CANDIDATE

  Scenario: AC-15 Reused-code failure offers a rebuild
    Given the outcome is NEEDS_REVISION with FULL_REBUILD_REQUIRED
    Then the Run log shows an accessible "Rebuild all steps" action
    When the author picks it
    Then a new compile request is sent with requestedMode FULL and reason EXPLICIT_FULL

Feature: B1 ungated capture-for-all (critique-round2 conditions; flags irrelevant)

  Scenario: AC-B1-1 Every live publish path is captured
    Given the pre-V19 schema with V26 applied and incremental/v2 flags off
    When a v1 compile runs through CompilePipeline and publishAcceptedCandidate
    Then the published revision has a non-null compile_request_id
    And its authoring, authoring_revision_inputs, reference_policy and intent_derivation_version equal its compile request's
    And the test is READY with that revision self-confirmed, as before B1
    When the same draft is recompiled and yields a byte-identical artifact
    Then the existing revision is reused and the compile does not fail
    Given instead V19 is applied in the test schema
    Then a v1 compile publishes without violating trg_ui_test_revision_require_request

  Scenario: AC-B1-2 No new v1 rejection
    Given a v1 draft whose V21 pair is absent, or fails AuthoringRevisionIdentity.valid, or whose V21 texts differ from source
    When it is compiled through the v1 path
    Then it selects FULL LEGACY_MAPPING and compiles as before B1
    And no STALE_REVISION 409 and no "Authoring snapshot differs" IllegalStateException occurs
```

B1 process acceptance criteria (verified at PR/runbook review, not by Gherkin):

| AC | Criterion | Evidence |
|---|---|---|
| AC-B1-3 | Rollback is tested: the pre-B1 binary's backend IT suite passes against a V26-migrated schema, and the B1 binary's full suite passes | CI job "Pre-B1 rollback IT" (§6.2), §3.3 V26 regression guard (4) |
| AC-B1-4 | V19 is excluded from B1's deploy. B1 runs on all replicas before the separate V19 runbook step, whose go/no-go compares the compile error and STALE rates before and after B1 (no numeric target, CON-10) | B1 PR contains no V19 file change. `docs/runbooks/studio-inference-rollout.md` has the go/no-go step (§3.3 V19) |
| AC-B1-5 | The B1 story header and PR description carry the label **"LIVE-AFFECTING, not dark"**, so the @devops pre-push review treats it as a live change | Story file header and PR body |

---

## 7. Risks & Mitigations

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| Detector false negatives: a paraphrased backward dependency passes as SCOPED_SUFFIX (R-Q4.risks) | Med | Med | PREFIX_IMPACT, whole-artifact validation, FULL execution from step 1 (a red run is visible), Rebuild all steps. 10.26 labeled corpus reports precision/recall. Residual risk stated to users (NFR-6) |
| Detector false positives → unnecessary FULL | Med | Low | Visible and correct. Rule IDs logged for tuning |
| Run auto-accept lets an unreviewed regenerated suffix execute (C0-A3) | Med | Med | Identity binding unchanged. Execution is FULL and the result belongs to that revision. The diff is shown in the Run log. Aria sign-off |
| V19 applied before capture for all → every live compile fails (COL-4) | Low (if sequenced) | High | §3.3 order, runbook, V19 not on the classpath until Dara re-anchors |
| Captured revisions drop reference_policy (COL-3) | High if unaddressed | High | V26 + IT (AC-13) |
| Write-once regression lets provenance change (COL-5) | Med | High | V26 whole-row trigger + IT |
| Re-port diverges from the live loop (COL-6) | Med | High | A single union loop. Existing live suites plus re-ported ITs must both pass |
| Prompt reorder advances the pin → one-time baseline invalidation for all tests (ASM-6) | High | Low | Ship story A first, before any v2 baselines exist (OQ-10) |
| R2D2 rejects systemInstruction / thinkingConfig / omits usage (CON-8) | Med | Med | §3.2.6 degradation. SPK-01 gates enablement |
| Two budgeted requests exceed the Run poll window | Med | Low | Per-request poll bound renewed once (§3.2.8) |
| InferenceStudio parity gap with the 10.44 page (context, references, translation path) | Med | Med | Story C parity checklist against ChecksStudioPage. v1 page stays when the flag is off |
| Cross-CSI / revoked baseline reuse (10.24 AC-8 open) | Low | High | Enablement precondition (OQ-12) |
| Adjacent uncommitted secrets/dispatch work collides | Med | Med | Sequence after it lands. V26 numbering coordinated |
| A step-context edit is not detected, so stale code is locked or REUSEd (CRIT-1) | Low (after fix) | High | Whole-context hash from the stored JSON, fail-closed on unknown kinds, a permits-enumeration test, a full-identity assembler guard, and `CONFIGURATION_ONLY` bound to full `authoringHash` equality (§3.2.2, §3.2.4) |
| Net cost of INCREMENTAL is higher than FULL (locked code as input, wasted Q1, false positives) (CRIT-7) | Med | Med | NFR-1 net per-Run report and escalation/detector rates. Enablement can be withheld on that evidence. Rule 4a removes repeat waste |
| Story B1 changes the live FULL path for every compile, with no flag (CRIT-9, CRIT-18) | Med | High | Ungated only under the five critique-round2 conditions, each an AC: AC-B1-1 (both publish paths captured, `publishAcceptedCandidate` included), AC-B1-2 (no new v1 rejection), AC-B1-3 (tested rollback), AC-B1-4 (V19 excluded, before/after go/no-go), AC-B1-5 (LIVE-AFFECTING label) (§9) |
| Captured insert collides with the pre-V19 identity index on a byte-identical recompile (CRIT-18) | Med if unaddressed | High (new v1 failure) | Untargeted `ON CONFLICT DO NOTHING` + identity reuse fallback (§3.2.3); AC-B1-1 recompile row |
| Q2 mislabelled or committed without Q1's outcome (CRIT-16/17) | Low (after fix) | Med | Check-then-write-once, forced plan, single REQUIRED transaction, never `captureForCompilation`; `EscalationCreationIT` (6)(7) |

---

## 8. Open Questions

| ID | Question | Blocking | Assigned To |
|---|---|---|---|
| OQ-S1 | Aria sign-off on C0-A1..A6 (CON-2) | Yes (before story B enters Ready) | @architect |
| OQ-S2 | Envelope version for the PREFIX_IMPACT variant: keep `version:1` with a new variant, or bump to 2? | No (default: bump to 2, since the local schema is authoritative, C0 §4. The provider schema's `version` bound moves with it, §3.2.5) | @architect |
| OQ-S3 | Is `TAIL_DELETION` → REUSE acceptable, or should tail deletion select FULL? | No (default REUSE) | @architect |
| OQ-S4 | Exact Run poll margin per request | No | @dev + @architect |
| OQ-S5 | New `scope.policyVersion` value for DERIVED_FORWARD | No | @architect |
| OQ-7 | Writable anchor NONE vs LABELED | No (default NONE until the harness decides) | @qa + @analyst |
| OQ-8 | Numeric efficiency targets | No | @po + @architect |
| OQ-9 | R2D2 support for systemInstruction, thinkingConfig and usage fields (SPK-01) | Yes (for enablement only) | @architect + @devops |
| OQ-11 | Legacy tests: first edit is FULL `LEGACY_MAPPING`. UI copy explaining it | No | @po + @ux-design-expert |
| OQ-12 | Close 10.24 AC-8 before enabling the flag (recommended: yes) | Yes (for enablement) | @po + @architect |

---

## 9. Delivery slicing (CPLX flags "SPLIT RECOMMENDED"; OQ-10)

Recommendation: **four stories plus one runbook step**, in this order. The B1/B2 split is **mandatory** (CRIT-9).

| Story | Scope | Depends on | Flag / risk |
|---|---|---|---|
| **A: Inference efficiency** | FR-11, FR-12, FR-13, deterministic schema, fingerprint with thinkingLevel (pinned MEDIUM), rejected-proposal repair on the live FULL path, usage and per-Run telemetry. ~STANDARD | 10.26 harness for the pin change (AC-11.2) | **LIVE-AFFECTING.** Affects all compiles. Advances the prompt pin once, before any v2 baseline exists (OQ-10) |
| **B1: Capture and data integrity** | V26 (a)–(f) by Dara, capture for all compiles with no new v1 rejection (§3.2.1, CRIT-19), the `authoringHash` definition and every rebased V18 predicate (§3.2.1), captured publication writing the V21/V24 columns on **both** publish paths: `publishAcceptedCandidate` (the live v1 path, `CompilePipeline:266` → `:273`) and `publishCandidate` (§3.2.3, CRIT-18), the CRIT-12 regression guard and the pre-B1 rollback IT. **ACs: AC-B1-1..AC-B1-5 (§6.3)**, plus AC-13 | A; secrets work (V25) landed | **LIVE-AFFECTING, not dark.** Capture for all, the whole-row write-once trigger, the V21 trigger change and the captured-publication changes apply to **every** compile, including FULL/v1 legacy, whatever the flags say. [AUTO-DECISION] Gate capture-for-all behind a flag? → No (reason: V19's precondition is that *every* replica captures every compile; a flag would recreate the mixed-publisher state V19 guards against, and the schema parts cannot be flagged anyway). Leaving it ungated is acceptable **only** while all five critique-round2 conditions hold, and each one is an AC: AC-B1-1 every live publish path captured; AC-B1-2 no new v1 rejection; AC-B1-3 rollback tested; AC-B1-4 V19 excluded from B1's deploy with a before/after go/no-go; AC-B1-5 the header/PR label "LIVE-AFFECTING, not dark". **Regression gate:** the existing FULL/v1 compile, confirm, execute and bounds suites, plus the full backend IT suite with V26 applied. **Rollback:** before V19, redeploying the pre-B1 binary is safe (V26 is additive, and the V21 trigger change only narrows it). This is proven by AC-B1-3, not asserted. The capture-for-all binary is the rollback floor once V19 is applied |
| **Runbook: V19 cutover** | §3.3 steps (1)–(4): all replicas on B1, go/no-go on before/after-B1 compile error and STALE rates (AC-B1-4), drain incompatible publishers, Dara re-anchors and applies V19 | B1 deployed everywhere | Forward-only. It must be done before incremental enablement, and it may run in parallel with B2/C |
| **B2: Incremental planning (dark)** | §3.2.2–§3.2.7 (StepIdentity planner, rule 4a, detector, PREFIX_IMPACT, Q2 creation, assembler guard), §3.4 C0-A1..A6, v2 REST re-port, run-accept confirm, contracts | B1; OQ-S1 | **Dark** (`incremental.enabled=false`, `authoring.v2-enabled=false`). With the flags off, the live path is unchanged relative to B1 |
| **C: Studio UX** | §3.2.8, §3.2.9 FE: InferenceStudio mount and rebuild to 10.44 parity, run gate auto-accept, badges/diff/escalation, MSW, component/a11y tests | B2's OpenAPI frozen (C can start on MSW once the contract is merged) | Behind `studioAuthoringV2` |

**Enablement gate (after A+B1+B2+C):** SPK-01 (OQ-9), 10.24 AC-8 (OQ-12), 10.26 evidence for the anchor switch, thinking level and detector, the NFR-1 net per-Run cost report, and the V19 cutover done per §3.3 (CON-3).

---

## 10. Implementation Checklist

- [ ] A: systemInstruction static prefix, IDs moved after the static blocks, global context once, deterministic schema, thinkingLevel + fingerprint, usage capture, repair with the rejected proposal, pin bump + 10.26 run
- [ ] B1: V26 (Dara): captured authoring/reference_policy/intent version, whole-row write-once, V21 trigger no-op for captured inserts, extended capture-consistency trigger, `escalated_from_request_id` + rule-4a index
- [ ] B1: capture for all compiles, with no new v1 rejection (CRIT-19); both publish paths (`publishAcceptedCandidate` + `publishCandidate`) on the shared captured insert with pre-V19 identity reuse (CRIT-18); `authoringHash` = `contextDigest` in capture/publication/confirm; every V18 predicate rebased (§3.2.1 table); CRIT-12 regression guard
- [ ] B1: AC-B1-1..5, including the pre-B1 rollback IT job, the V19 go/no-go runbook step and the "LIVE-AFFECTING, not dark" header/PR label
- [ ] Runbook: V19 re-anchor + cutover order (Dara)
- [ ] B2: union attempt loop; StepIdentity planner (whole-context hash, fail-closed), structural positions, TAIL_DELETION, REUSE preconditions, rule 4a
- [ ] B2: detector + kind-dependent provider schema + PREFIX_IMPACT + Q2 creation (`escalateToFull`: check-then-write-once, forced plan, one REQUIRED transaction) + assembler full-identity guard
- [ ] B2: v2 REST re-port; confirm with `confirmationSource`; OpenAPI + proposal schema
- [ ] C: InferenceStudio mount, scope checkbox removed, Run auto-accept gate, badges/diff/escalation, MSW outcomes
- [ ] Tests §6 (all ACs 1–15, including AC-8b, and AC-B1-1..5)
- [ ] Aria sign-off on §3.4 recorded against C0 (separate change by @architect)

---

## 11. Revision log

Iteration 2 (2026-09-23) resolves critique.json v1 (NEEDS_REVISION, 3.35). decisions.md is unchanged and still binding: forward scope, the write set from p, prior steps always in context, visible escalation, Run auto-accept, exact reference-set equality and the v2 restore all stand.

Code facts re-verified in the worktree before relying on them: `StepContextEntry` permits six kinds and `StepAuthoringContext` carries `evidenceReferences`; `AuthoringRevisionIdentity.create` already persists `contextDigest` and per-step whole-context hashes; `captureForCompilation` (~151) and `confirmVersioned` (~552) compare the V18 `authoring_hash`; the V21 BEFORE INSERT trigger overwrites `authoring`, and `trg_ui_test_revision_capture` fires before it; `providerSchema` enums lack `PREFIX_IMPACT`; `StepReferencePolicyDeriver` entries carry `stepIndex` and `POLICY_VERSION = 2`; `IncrementalAssembler` uses a 0-based `stepIndex` and a `Step(id,text)` guard; `ui_test_compile_requests` and `ui_test_compile_outcomes` are append-only.

| CRIT | Sev. | Resolution | Fixed in |
|---|---|---|---|
| CRIT-1 | HIGH | Whole-context hash from the stored JSON (all six kinds + `evidenceReferences`), fail-closed on unknown kinds or fields, permits-enumeration test; REUSE preconditions bound to identity and `authoringHash`; assembler guard on full `StepIdentity`; LiteralInput/TargetHint tests | §3.2.2, §3.2.4 rule 5, §3.2.7, §3.4 C0-A5, §6.1, §6.3 AC-3 |
| CRIT-2 | HIGH | `authoringHash` := `authoring_revision_inputs.contextDigest` (includes revision inputs); stored on all three tables; used by capture, publication, `confirmVersioned` and the V18 consistency trigger | §3.2.1, §3.2.8, §3.3, §3.4 C0-A6, §6.2 `AuthoringHashConfirmIT`, §6.3 AC-14 |
| CRIT-3 | MED | Kind-dependent provider schema admits `PREFIX_IMPACT` for PATCH only; precedence rule; version bound follows OQ-S2 | §3.2.5, §3.2.6, §3.4 C0-A2 (vi), §5.2, §6.1, §6.3 AC-8 |
| CRIT-4 | MED | "Q2 creation": slot release first, atomic outcome + capture under the draft lock, draft/authorization preconditions, `DISCARDED` when the draft moved, after-commit enqueue, unique `escalated_from_request_id`, crash/restart handling, PREFIX_IMPACT on any attempt | §3.2.5, §3.2.8, §3.3 V26 (f), §3.4 C0-A2 (iii), §6.2 `EscalationCreationIT`, §6.3 AC-8b |
| CRIT-5 | MED | V26 (d) makes the V21 capture trigger a no-op for captured inserts; V26 (e) extends the capture-consistency trigger to the V21/V24 columns | §3.3 V26 (d)(e), §6.2 `CapturedAuthoringTriggerIT`, §6.3 AC-13 |
| CRIT-6 | MED | Plan rule 4a: a prior `ESCALATED_FULL` at the same `authoringHash`/baseline/fingerprint → FULL `PREFIX_IMPACT / PRIOR_ESCALATION`, no PATCH | §3.2.4 rule 4a, §3.2.5 "Escalation bounds", §3.4 C0-A2 (v), §6.1, §6.3 AC-8 |
| CRIT-7 | MED | NFR-1 measures net per-Run cost including the wasted Q1 and prefix input; `escalationRate`/`detectorHitRate`; MEDIUM relabelled as inferred; levers restated as candidates | §1, §2.2 NFR-1, §3.2.6 (Thinking, Usage, Caching claim), §7 |
| CRIT-8 | MED | (a) `stepIndex` removed from the policy entry; (b) the anchor value and `POLICY_VERSION` are explicit fingerprint inputs | §3.2.2, §3.2.6 (anchor switch, Fingerprint), §6.1 |
| CRIT-9 | MED | Mandatory split: B1 LIVE-AFFECTING (capture for all, V26, `authoringHash`) with a regression gate and rollback note; V19 runbook step; B2 dark. Capture-for-all is deliberately not flag-gated (AUTO-DECISION in §9) | §9, §10, §7 |
| CRIT-10 | MED | Tests for AC-2.1/2.2, AC-5.2, AC-8.1/NFR-6 component + a11y, EC-12, EC-16, PREFIX_IMPACT on a repair attempt, the Rebuild-all path | §6.1, §6.2, §6.3 AC-15 |
| CRIT-11 | LOW | 1-based positions vs 0-based `stepIndex` (AC-4 fixed); §3.5 step 2 corrected; every V18 predicate listed with its V21 replacement | §3.2.4, §6.3 AC-4, §3.5, §3.2.1 table |
| CRIT-12 | LOW | Grep + full-IT-suite regression guard and a positive first-confirmation IT for the whole-row trigger | §3.3 "V26 regression guard", §6.2 `WriteOnceWholeRowIT` |
| CRIT-13 | LOW | Rule 2 keeps `CONFIGURATION_ONLY` reuse when the flag is off; `TAIL_DELETION` requires a PASSED FULL baseline | §3.2.4 rules 2 and 5, §6.1 |
| CRIT-14 | LOW | Caching benefit is conditional on `responseJsonSchema` placement (UNKNOWN, SPK-01) | §3.2.6 Provider schema |
| CRIT-15 | LOW | Stated interpretation: detector and prior-escalation hits are plain FULL plans, and only the model signal creates an `ESCALATED_FULL` request; all are queryable via `escalation.source` | §3.2.5 "Vocabulary", §3.4 C0-A2 (iv) |

### Round 2 (iteration 3, 2026-09-23): resolves critique-round2.json (NEEDS_REVISION, 3.98)

decisions.md is unchanged and binding. The edits are local to §3.2.1, §3.2.3, §3.2.4 rule 4a, §3.2.5, §3.2.8, §3.3, §3.4 C0-A2, §5.2, §6, §7, §9 and §10.

Code facts verified in the worktree @ `1f3c56a59` before relying on them:
- `captureForCompilation` is `@Transactional(REQUIRES_NEW)` (`CompileStateService:94`) and delegates to `capture` (`@Transactional`, `:122`) by self-invocation.
- `capture` calls `beginCompile` and then `InferenceCaptureStore.persist`, which always runs `CompilationPlanner.plan` (`:135`).
- `CompilePipeline` has no `@Transactional`.
- `publishAcceptedCandidate` (`:262`) always calls `insertOrReuseRevision` (`:273`) and self-confirms (`:281-290`). It is the only publish call in `CompilePipeline` (`:266`).
- `publishCandidate` branches on `requestIdentityAvailable()` (the V19 marker).
- `insertCapturedRevision` handles only `ON CONFLICT (compile_request_id)`, while `INSERT_REVISION` uses an untargeted `ON CONFLICT DO NOTHING`.
- The V24 unique index `uq_ui_test_revisions_identity` exists until V19 drops it.
- `recordOutcome` is `ON CONFLICT(request_id) DO NOTHING` (`:794-812`).
- `sweepAbandoned` writes no outcome row (`:631-666`).
- The `persist` text guard throws `IllegalStateException` (`:53-58`), and `steps(null, …)` derives steps from source.

| CRIT | Sev. | Resolution | Fixed in |
|---|---|---|---|
| CRIT-16 | MED | Q2 creation is reordered to lock → idempotency check → preconditions as non-throwing predicates → **exactly one** Q1 outcome (`ESCALATED_FULL` or `DISCARDED`) → Q2 capture only in the `ESCALATED_FULL` branch. The IT asserts exactly one outcome row | §3.2.5 step 2, §6.2 `EscalationCreationIT` (1)(2), §6.3 AC-8/AC-8b |
| CRIT-17 | MED | Q2 gets a **forced plan** `FULL / ESCALATED_FULL / reasonDetail PREFIX_IMPACT / escalation.source MODEL / escalatedFrom Q1`, bypassing the planner (`persist(forcedPlan)`). Rule 4a is limited to `escalated_from_request_id IS NULL`. The transaction boundary is the new `escalateToFull` (`REQUIRED`) with internal self-invocation of a private capture core, and it never goes through `captureForCompilation` (`REQUIRES_NEW`). [AUTO-DECISION] Q2 plan reason `PREFIX_IMPACT` (round-2 text, critique suggestion) or `ESCALATED_FULL`? → `ESCALATED_FULL` with `reasonDetail PREFIX_IMPACT` (reason: this revision's mission directive, a direct trace to DEC-OQ2.4 "logged as ESCALATED_FULL with the reason", and it keeps Q2 distinct from rule 4a's `PREFIX_IMPACT / PRIOR_ESCALATION`). C0-A2 (iii) is updated, and it remains subject to Aria's sign-off (OQ-S1) | §3.2.4 rule 4a, §3.2.5 step 2 (d) + "Transaction boundary", §3.2.5 Vocabulary, §3.4 C0-A2 (iii), §5.2, §6.2 (6)(7), §6.3 AC-8 |
| CRIT-18 | MED | Both publish paths are named, and the live `publishAcceptedCandidate` moves to a shared captured insert with publish-and-accept semantics unchanged. A newly found **pre-V19 identity-index collision** is handled by an untargeted `ON CONFLICT DO NOTHING` with identity reuse, because otherwise the captured insert would add a v1 failure. All five ungated conditions are adopted as AC-B1-1..5 | §3.2.3, §3.3 (V26 guard (4), V19), §5.2, §6.2, §6.3 AC-B1-1..5, §7, §9 B1 + runbook, §10 |
| CRIT-19 | LOW | Unversioned capture never rejects on authoring identity: an absent or invalid V21 pair → FULL `LEGACY_MAPPING`, and the text guard is skipped for it. IT rows added | §3.2.1 Integrity, §3.2.3, §5.2, §6.2 "Unversioned capture IT", AC-B1-2 |
| CRIT-20 | LOW | (a) The sweeper writes no outcome, so Q1 is reported `ABANDONED` and the Run gate stops. (b) Idempotency comes from the check under the lock, and the UNIQUE constraint is only a backstop. [AUTO-DECISION] recorded in §3.2.5 step 5 on why `ON CONFLICT … DO NOTHING` is not used. (c) A value-only edit re-opens INCREMENTAL once, which is stated | §3.2.5 step 5, §3.2.4 rule 4a, §3.2.8, §6.2 (3b)(3c) |

---

## Metadata

- **Generated by:** @pm (Bob) via spec-write-spec
- **Inputs:** requirements.json, complexity.json, research.json, decisions.md, discovery-brief.md, C0
- **Iteration:** 3 (Phase 5b round 2, revision against critique-round2.json)
- **Superseded inputs:** FR-15, FR-7 AC-7.2, CON-6 (by decisions.md), NFR-2's live metric (by research), complexity.json assessedDirection for OQ-1..OQ-4 (by decisions.md)
