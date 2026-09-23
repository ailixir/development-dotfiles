# C0 amendment review — STUDIO-INC-001 (C0-A1..A6)

**Reviewer:** Aria (@architect), owner of C0 (`docs/architecture/studio-inference-contract-v1.md`)
**Date:** 2026-09-23 · **Resolves:** OQ-S1 (and decides OQ-S2, OQ-S5; OQ-S3 is binding as given)
**Input reviewed:** `spec.md` §3.4 (iteration 3), with §3.2.1–§3.2.9, §3.3 and §6 as the normative detail behind each row. `decisions.md` is binding. This review does not reopen the user's intent: derived forward scope, write set from p, prior steps always in context, visible escalation, Run auto-accept, exact reference-set equality, and `TAIL_DELETION` → REUSE.
**Scope of this document:** the sign-off only. C0 itself is **not** edited here. The C0 edit is a later, separate change, and it must carry the wording below.

## 0. Summary

| Amendment | Verdict | Required change (short) |
|---|---|---|
| C0-A1 Implicit forward scope | **APPROVED_WITH_CHANGES** | Run the detector over **locked** steps for forward references too. State where `scope` is stored and that it is not in `authoringHash` and does not advance `sourceRevision`. Remove the "reviewed scope" baseline term. `policyVersion = "2.0.0"` |
| C0-A2 PREFIX_IMPACT / ESCALATED_FULL | **APPROVED_WITH_CHANGES** | The DISCARDED branch must settle the draft through the guarded STALE update. Add rule 4a and the forced reason to the C0 §3 vocabulary. Envelope `version: 2`. Redefine `GLOBAL_OR_FORWARD_SCOPE`. Reused-code failure keeps no automatic successor |
| C0-A3 Run auto-accept | **APPROVED_WITH_CHANGES** | `confirmationSource:"RUN"` must be bound to a server-captured compile `trigger` and to the principal who created the request. A client-only label is not enough |
| C0-A4 Structural edits from p | **APPROVED_WITH_CHANGES** | `STRUCTURAL_CHANGE` is never emitted (the "flag-off parity" claim is wrong). `TAIL_DELETION` needs n ≥ 1, does not inherit evidence, and is subject to the A1 forward-reference rule |
| C0-A5 Change-detection identity | **APPROVED_WITH_CHANGES** | Replace "global defaults" with "any `globalContext` entry". Record a `stepIdentityVersion` in the plan audit |
| C0-A6 Authoring snapshot | **APPROVED_WITH_CHANGES** | State that immutability comes from the capture and the write-once revision (V26 (b)(d)(e)), that `scope` is outside the digest, and that every digest change advances a revision counter. Effective only together with V26 |

**Overall verdict: APPROVED_WITH_CHANGES.** No amendment is rejected. Story B2 may enter Ready once the spec takes over the wording in §2–§7 below. The C0 edit then follows this text, together with the machine-readable artifacts (`inference.openapi.yaml`, `inference-proposal.schema.json`), which C0 §0 makes authoritative.

## 1. Code facts spot-checked (worktree `brunobuger/ui-studio` @ `1f3c56a59`)

"Verified" means I read the code at the cited location. Anything I did not read is labeled as inferred.

| # | Fact | Status | Bearing |
|---|---|---|---|
| F1 | `AuthoringRevisionIdentity.contextDigest` = SHA-256 of `{orderedSteps:[(id,text)], globalContext hash, stepContexts[(id, hash(context))], nonsecretReferencedValues, selectedEvidenceReferences}` (`AuthoringRevisionIdentity.java:204-219`) | Verified | A6 definition is accurate |
| F2 | Value hashes cover **only** `StudioVariable.KIND_PLAIN` values (`StudioService.revisionInputs`, ~`:856-862`). `SecretReference` entries never contribute a value (`collectReferences` only reads `VariableReference` / `DefaultVariableValue`) | Verified | A6 raises no secret-derived hash exposure |
| F3 | A v1 variable edit advances `configurationRevision` (`ConfigurationChangeClassifier:51-52`). A v2 context edit advances it through `contextIdentity` (`StudioService.persistAuthoring` ~`:733-747`) | Verified | A6 invariant "digest change ⇒ a counter advances" holds today on both write paths |
| F4 | `StepReferencePolicyDeriver.derive`: each step's entry depends on its own text/context plus the **global** `ContextualDefault` variables from `globalContext`, and on the positional `stepIndex` (`:39-76`). `POLICY_VERSION = 2` | Verified | A4/A5: once `stepIndex` is removed, locked entries cannot change because of structural edits elsewhere. "Global defaults" are a subset of `globalContext` |
| F5 | The archived `CompilationPlanner.plan` emits `FINGERPRINT_CHANGE` and `STRUCTURAL_CHANGE` **before** `INCREMENTAL_DISABLED` (`:69-93`), which deviates from C0 §3's order. `requireUnique` throws on an **empty** step list (`:115-120`) | Verified | A4 wording on `STRUCTURAL_CHANGE`. `TAIL_DELETION` edge n = 0 |
| F6 | `AuthoringV2Request.steps` has `@Size(max = 100)` and no minimum | Verified | n = 0 can reach capture unless it is rejected earlier. Whether an existing v1/v2 gate rejects an empty draft before compile: **I don't know** (not found in the files I checked) |
| F7 | `providerSchema` status enum `[GENERATED, UNSUPPORTED, CLARIFICATION]`, reason enum `[UNSUPPORTED_CAPABILITY, AMBIGUOUS_INTENT]`, `version` min 1 / max 1 (`GenAiLlmGatewayClient:339-365`) | Verified | A2 (vi) and OQ-S2 |
| F8 | `publishError` / `publishInvalid` settle the draft only under `WHERE compile_request_id = ? AND source_revision = ? AND configuration_revision = ? AND deleted_at IS NULL AND quarantined_at IS NULL` (`CompileStateService` ~`:330-390`). `sweepAbandoned` resets COMPILING drafts after a threshold and writes no outcome (`:631-666`) | Verified | A2 DISCARDED-branch gap (§3 below) |
| F9 | `ui_test_compile_requests.created_by VARCHAR NOT NULL` (V18) and it is written from `inputs.principal()` (`InferenceCaptureStore:200-221`). There is no compile-trigger column | Verified | A3 binding |
| F10 | Research R-Q4 limits the detector to the **changed** steps' text. Forward step numbers in a changed step are deliberately not hits ("the suffix is regenerated anyway") | Verified (`research.json` `Q4_dependency_detector`) | A1 gap: a forward reference inside a **locked** step is not covered |

## 2. C0-A1 — Implicit forward scope → APPROVED_WITH_CHANGES

**Consistency.** The amendment matches the user's intent and C0 §2's own statement that a declaration is "not proof". Four C0 passages depend on the reviewed scope, and the amendment only partly replaces them:
(a) §2 says baseline eligibility requires the "compatible reviewed scope" on both snapshots.
(b) §3 says the baseline must be "compatible with … reviewed scope".
(c) §2 says "Revoking/changing the scope declaration or policy advances sourceRevision".
(d) §2 says "Unknown, stale, ambiguous, global, or forward scope selects FULL".
The spec removes the predicate in code (§3.2.1 table), but the C0 text must say what replaces each of (a)–(d). Otherwise C0 contradicts itself.

**Safety (can a stale prefix run?).** This is the one real gap. The derived assumption is that a step depends on its own text, the **preceding** steps and the references. The detector checks only the *changed* steps (F10). A **locked** step whose text points forward, for example "open the report that step 5 downloads" or "wait until the last step's dialog closes", breaks the assumption when step 5 or the last step is edited, moved or deleted. Its baseline code stays locked and runs, even though its meaning has changed. C0 §2 (d) already sends forward scope to FULL, so leaving this uncovered would be a C0 regression, not user intent. PREFIX_IMPACT does not reliably cover it either: the model is asked about writable steps and is not required to audit locked text.

A second residual cannot be detected, and C0 must state it. A FULL baseline saw the old suffix, so locked code may be *implicitly* shaped by later steps even when no text refers to them. C0 §2 already forbids calling the suffix invisible. Whole-artifact validation, FULL execution from step 1 and "Rebuild all steps" are the controls. This is an accepted residual, not a guarantee.

**Auditability.** Removing the reviewer stamp is correct, because no human affirms anything. The audit subject becomes the compile request's `created_by` (F9) plus the plan's derived scope record. The spec says `scope` is "persisted server-side" but does not say **where**, or whether it enters the hash. That must be exact.

**Required wording (replaces C0 §2 paragraphs 2–3 and 5–6 on scope; edits §3 and §7):**

> `scope` is server-derived and audit-only: `{policyVersion: "2.0.0", declaration: "DERIVED_FORWARD"}`. A step's meaning is taken to depend on its own text and context, the preceding steps, `globalContext` and the declared references. The client cannot set scope. A v2 request that carries `scope` has it ignored, and it is never persisted from the client. No reviewer or review time is recorded. The derived scope is written to the immutable compile-request plan (`compile_plan.scope`, together with `detectorVersion`). It is **not** part of the authoring snapshot or `authoringHash`, and a change of `policyVersion` or `detectorVersion` does not advance `sourceRevision`, `configurationRevision` or the compilation fingerprint. Baseline eligibility has no scope term. Violations of the forward default are handled only by escalation to FULL: (1) the deterministic detector over the text of every **changed** step (backward and global rules), **and** over the text of every **locked** step (1..p−1, and 1..n for `TAIL_DELETION`) for forward references: an explicit step number ≥ p (1-based), or a relative forward-step phrase ("next/following/subsequent/later/last/final step(s)", "below"), with the lexicon owned by the detector specification; (2) the model `PREFIX_IMPACT` signal (C0-A2); (3) a `globalContext` change. A detector hit selects FULL `GLOBAL_OR_FORWARD_SCOPE`. The derived scope is an assumption, not proof: FULL-context baselines may have shaped locked code implicitly, so whole-artifact validation, FULL execution from step 1 and "Rebuild all steps" remain the controls. `SCOPE_UNKNOWN` and `STEP_SCOPED` stay in the vocabulary for historical rows only. No planner path emits `SCOPE_UNKNOWN`.

**[AUTO-DECISION] OQ-S5 `policyVersion` value?** → `"2.0.0"`. Reason: it is a breaking change in meaning from author-affirmed to derived, it aligns with the policy-2.0.0 family in C0 §6, and it is audit-only, so it invalidates nothing.

**Downstream spec deltas:** §3.2.5 Signal 1 gains the locked-step forward rule (new rule ID, e.g. `FORWARD_STEP_REF`, rule IDs only in logs). Unit tests need positive/negative cases, including "log in again" and "check all checkboxes" style exclusions on locked text, a forward step number on a locked step for INCREMENTAL, and a `TAIL_DELETION` case. The 10.26 corpus measures its false-positive rate (a false positive costs one FULL, which is the safe direction).

## 3. C0-A2 — PREFIX_IMPACT and ESCALATED_FULL → APPROVED_WITH_CHANGES

**Consistency.** C0 §2 already lets a model flag uncertainty without enlarging its own write set. The escalation is a new FULL request, not a widened PATCH, so the §3 write-set freeze and "a repair never expands the write set" hold. The PATCH-only variant, the precedence rule (any other violation → `INVALID_MODEL_RESPONSE`) and the FULL schema staying unchanged are internally consistent. The C0 text still has three gaps:
1. C0 §3's plan vocabulary is "first applicable reason in this order". The amendment introduces **two** new plan reasons, `PREFIX_IMPACT` (rule 4a, `PRIOR_ESCALATION`) and `ESCALATED_FULL` (forced on Q2 only), but lists only the second as new. Both must be placed in C0 §3.
2. C0 §3 "no auto-regeneration of protected steps or hidden full fallback" must keep its force for the **reused-code validator failure** (`FULL_REBUILD_REQUIRED`, no automatic successor). Otherwise a later reader could generalize the automatic successor to it.
3. `GLOBAL_OR_FORWARD_SCOPE` now also carries **backward** detector hits. That contradicts its name unless it is redefined.

**Safety.** Q2 is a plain FULL request (`baselineRevisionId: null`, all steps writable), so it cannot run a stale prefix. The atomic check-then-write-once transaction, the non-throwing predicates, the forced plan, the ban on `captureForCompilation`, the after-commit enqueue and the UNIQUE backstop are sound. I accept them as specified (§3.2.5 steps 1–5).

**Defect found:** in the `DISCARDED` branch with `ACCESS_REVOKED` (and any case where the draft still points at Q1), the transaction writes Q1's outcome and **nothing else**. The draft then stays `COMPILING` with `compile_request_id = Q1` until `sweepAbandoned` fires (F8). That is a stuck draft, not a safety breach, but C0 §4 requires every failure to land in a defined draft projection. The existing guarded settlement (`WHERE compile_request_id = Q1 AND source_revision = … AND configuration_revision = … AND deleted_at IS NULL AND quarantined_at IS NULL`) is exactly right. It settles only when the draft is still Q1's, and it is a no-op when the draft has moved on, which keeps C0 §2 "superseded work … cannot change the latest draft's state".

**Auditability.** Good: the `escalation.source ∈ {DETECTOR, MODEL, PRIOR_ESCALATION}` query surface, `escalatedFrom` derived on read, IDs and rule IDs only, the redacted bounded message, and `runCorrelationId`.

**Required wording (C0 §3, §4, §5, §6):**

> *§3 vocabulary, after item 4:* "4a. `PREFIX_IMPACT` (reasonDetail `PRIOR_ESCALATION`): for a user-initiated request only, when an earlier request for the same test, `authoringHash`, baseline revision and compilation fingerprint settled `ESCALATED_FULL`; selects FULL." *After item 6:* "Forced plan: `ESCALATED_FULL` (reasonDetail `PREFIX_IMPACT`) is never selected by this order. It is written only on the single successor of a request that settled `ESCALATED_FULL`." *Item 4 redefinition:* "`GLOBAL_OR_FORWARD_SCOPE` means a non-local dependency: a `globalContext` change (reasonDetail `GLOBAL_CONTEXT_CHANGED`) or a deterministic detector hit, whether global, backward from a changed step or forward from a locked step (reasonDetail `DEPENDENCY_DETECTED`, with `escalation.source = DETECTOR` and rule IDs)."
>
> *§3 last paragraph, replace the second sentence:* "A validator problem in reused code produces `NEEDS_REVISION` with `FULL_REBUILD_REQUIRED`, with no automatic regeneration of protected steps and no automatic successor. The **only** automatic FULL successor is the one for a valid-PATCH `PREFIX_IMPACT` (§4). It is a new request with its own budget, created only if the draft revisions, `authoringHash`, current request pointer and the requester's write authorization are unchanged. It is linked (`escalatedFrom`/`escalatedTo`), shown in the UI and audited. There is at most one per request and at most one per Run."
>
> *§4 outcome table, new row:* "`PREFIX_IMPACT` in an otherwise valid PATCH | Preconditions hold: draft stays `COMPILING` on the successor. Preconditions fail: `DISCARDED` with reasonDetail, and if the draft still points at this request with the captured revisions, it settles `STALE` with an error code through the same guarded update used for failures; otherwise it is untouched | No candidate, no repair. `ESCALATED_FULL` plus FULL successor, or `DISCARDED`"
>
> *§4 envelope:* "Envelope `version: 2` = version 1 plus the closed variant `{stepId, status:"PREFIX_IMPACT", reason:"LOCKED_STEP_CHANGE_REQUIRED", message}`, valid only in `kind:"PATCH"` and only for a writable ID, with `code` forbidden. It counts only in an otherwise valid PATCH. A provider schema admits it only for PATCH." *§6 paragraph 3:* "inference proposal envelope is version 2" (replacing "starts 1").

**[AUTO-DECISION] OQ-S2 keep `version:1` or bump?** → Bump to `version: 2` for **both** kinds. The parser accepts exactly the version bound to the captured `PROMPT_VERSION`, with no dual acceptance. Reason: C0 §4 makes the local schema authoritative and closed. A v1 parser would read a `PREFIX_IMPACT` entry as a malformed response, not an escalation, so the same bytes would mean different things to different binaries, which is an audit ambiguity. Story A already advances the prompt pin once, so the fingerprint cost is paid anyway. Recorded fixtures are re-versioned in the test corpus only.

**Test delta:** `EscalationCreationIT` (2) must also assert that the draft settles `STALE` (not `COMPILING`) after an `ACCESS_REVOKED` discard, and that a discard after a newer save leaves the newer draft untouched.

## 4. C0-A3 — Run auto-accept → APPROVED_WITH_CHANGES

**Consistency.** Run is an explicit user action, so "explicitly confirmed" (C0 §1) still holds if Run is defined as the confirming act for *that Run's* candidate. The six §7 identity fields, the ban on auto-accepting NEEDS_REVISION/STALE/foreign candidates, FULL execution from step 1, and "a confirmation is not permission to start a browser **on save**" all stay intact. The 2026-09-16 amendment ("explicit Compile changes/Rebuild all steps actions invoke generation") must add Run.

**Safety.** The identity binding prevents confirming anything other than the exact candidate, and a draft change in between yields `STALE_CANDIDATE` (AC-14). No stale prefix can run through this path beyond what A1/A4 already allow.

**Auditability — defect.** `confirmationSource:"RUN"` is a **client-supplied label**. Nothing on the server ties it to a Run. The compile body is `{mode}` only, and there is no trigger column (F9). A client could label a manual confirm as RUN, or a Run-less confirm as RUN, and the audit would record it as true. Because A3 moves human review from before execution to after it (the Run log), the record of *which* confirmations had no pre-execution review must be server-truthful.

**Required wording (C0 §1 bullet 3, §7 paragraphs 1–2, amendment 2026-09-16 paragraph 2):**

> The compile request records a server-captured, immutable `trigger ∈ {RUN, COMPILE_CHANGES, REBUILD_ALL}`, taken from the v2 compile body at capture and inherited by an `ESCALATED_FULL` successor. `confirm-compile` accepts `confirmationSource:"RUN"` only when the candidate's compile request (or, for a successor, the root of its `escalatedFrom` chain) has `trigger = RUN` and the confirming principal equals that request's `created_by`. Any other combination is `409` and nothing is confirmed. The six §7 identity fields are validated exactly as for a manual confirm. The confirmation record stores `confirmationSource` and the principal. `RUN` confirmation means "confirmed by the Run action without prior diff review". The reused/regenerated view and code diff are shown in that Run's log. Auto-accept never applies to `NEEDS_REVISION`, `STALE`, `DISCARDED`, `ABANDONED` or another request's candidate. Save never compiles. Compile changes, Rebuild all steps and Run invoke generation. Only Run confirms automatically.

**Security note:** principal equality prevents a second user's Run from auto-confirming a candidate requested by someone else. That user keeps the manual-confirm path, which is subject to normal authorization.

## 5. C0-A4 — Structural edits incremental from p → APPROVED_WITH_CHANGES

**Consistency and safety.** Prefix identity by construction is correct. For every i < p, id, identity hash and position are equal in both lists, so `stepIndex`, `originalText` and `code` are byte-copied (NFR-3). The table rows (insert, append, delete, reorder, duplicate, p = 1) are correct under the 1-based/0-based note. F4 confirms that a locked step's reference-policy entry cannot change as a side effect of an edit elsewhere once `stepIndex` is removed, and the fail-safe "entry changed ⇒ step changed" moves p earlier. `TAIL_DELETION` is binding (OQ-S3), and the spec guards it correctly: strict prefix with equal identities, full rule-3 evidence, whole-artifact validation, and Run from step 1. Its only stale-prefix path is a remaining step that points forward to a deleted step. The A1 locked-step forward rule closes that path, so A4 depends on A1's change.

**Precision defects.**
1. "`STRUCTURAL_CHANGE` is kept for flag-off audit only" is wrong under the spec's own order. `INCREMENTAL_DISABLED` is rule 2, so no flag-off path reaches rule 4. The archived planner emits `STRUCTURAL_CHANGE` before `INCREMENTAL_DISABLED` (F5), which violates C0 §3. The replacement planner must follow C0 order.
2. n = 0: the planner throws on an empty list (F5), and the v2 DTO has no minimum (F6). A tail deletion of every step must not be REUSE or reach the planner.
3. REUSE by `TAIL_DELETION` must not inherit pass evidence. C0 §7 already says a source change invalidates evidence, but the amendment should say so explicitly because this is a REUSE of the same code bytes.

**Required wording (C0 §2 paragraph 1, §3 items 4–6):**

> *§2:* "Structural insert/delete/reorder/duplicate is planned from the earliest affected position p. Position i < p is locked only when step ID, step identity hash (C0-A5) and position i are equal in the baseline and the current list. p = 1 selects FULL `ALL_STEPS_AFFECTED`." *§3 item 4:* "`STRUCTURAL_CHANGE` is retained for historical rows only; no planner path emits it." *§3 item 5, add:* "`TAIL_DELETION`: the current list (n ≥ 1) is a strict prefix of the baseline with equal identities, no locked-step forward-reference detector hit, and full item-3 eligibility. It selects REUSE with fresh validation, a new candidate and confirmation. The baseline's pass evidence is not inherited. An empty step list is not compilable and is rejected before capture." *§3 item 6:* "…from the earliest affected position p (C0-A4/A5) through the end."

## 6. C0-A5 — Change-detection identity → APPROVED_WITH_CHANGES

**Consistency and safety.** This closes the only real stale-lock path in the archived planner, which compared `(id, text)` only. The whole stored-context hash, fail-closed on unknown kinds, the permits-enumeration test, position compared separately, the position-free policy entry, and the full-identity assembler guard with STALE on mismatch are all sound. Excluding referenced values is correct because values never enter the prompt (NFR-5). They stay bound by `authoringHash` (F1–F3), so a value-only edit can never be `CONFIGURATION_ONLY`. That is narrower than today's config-only branch and is the safe direction.

**Precision.** "global defaults" is undefined. F4 shows they are `ContextualDefault` entries inside `globalContext`, so the rule is simply "any `globalContext` change". The persisted `stepIdentityHash` values are audit evidence, and a later canonicalization change would make them unreplayable without a version.

**Required wording (C0 §3 item 6 and the "Freeze the selected mode" paragraph; §5 audit list):**

> A step is changed when its step ID, its text, the canonical hash of its **entire** stored `context` (every entry kind and `evidenceReferences`, computed from the stored JSON, and treated as changed when unreadable or unknown), or its reference-policy entry with `stepIndex` removed differs from the baseline step at the same position. Any change to `globalContext` (all entries, including `ContextualDefault`) selects FULL `GLOBAL_OR_FORWARD_SCOPE` / `GLOBAL_CONTEXT_CHANGED`. Both sides are recomputed from stored authoring at planning time. Persisted hashes are audit evidence, not comparison inputs. The plan records `stepIdentityVersion` together with the per-step current and baseline identity hashes. *§5 audit list adds:* `stepIdentityVersion`, per-step identity hashes, `earliestAffectedPosition`, `editKinds`, `escalation`, `trigger`, `runCorrelationId`.

## 7. C0-A6 — Authoring snapshot → APPROVED_WITH_CHANGES

**Consistency.** Redefining `authoringHash` as `contextDigest` is accurate to the code (F1). It is strictly stronger than the V18 `{id,text}+scope` hash because it covers context, global context, plain-value hashes and evidence. It keeps the confirm/publication field name, so the §7 contract shape does not change. F3 shows every digest change advances a revision counter on both write paths, so C0 §2 "no third client concurrency counter" still holds.

**Safety.** The V21 `ui_tests.authoring` is a *mutable* draft column, and today the V21 trigger overwrites captured revision authoring with the current draft (spec CRIT-5). "Immutable snapshot" is therefore true only once V26 (b) whole-row write-once, (d) trigger no-op for captured inserts and (e) the extended capture-consistency trigger are in place. Before that, a revision could carry authoring newer than its compile request, which is a stale-identity path. A6 cannot take effect in C0 before B1's V26 lands.

**Security.** Only plain values are hashed, and secrets contribute nothing (F2). The digest is a hash over already-exposed per-value hashes (`AuthoringV2Response` returns the inputs today), so A6 adds no exposure.

**Required wording (replaces C0 §2 paragraph 4 first three sentences; edits §2 "Identity and transaction boundary" paragraphs 2–4 and §7 paragraph 1):**

> The immutable authoring snapshot is the V21 pair `authoring` (`authoringSchemaVersion: 2`, `globalContext`, ordered `steps[{id, text, context}]`) and `authoring_revision_inputs`, **as captured on the compile request** and copied unchanged onto its candidate revision. Both rows are write-once, and the database enforces equality between them (V26 (b)(d)(e)). `authoringHash` is `authoring_revision_inputs.contextDigest`, trusted only after `AuthoringRevisionIdentity.valid` passes at capture. It covers ordered step IDs and text, the `globalContext` hash, per-step whole-context hashes, hashes of referenced **plain** (never secret) values and selected evidence references. `scope` is not part of it (C0-A1). Every change to `contextDigest` advances `sourceRevision` (IDs, order, text) or `configurationRevision` (context, global context, variable values). The canonical string-array source hash is unchanged. V18 `authoring_snapshot` / `authoring_hash` / `scope_reviewed_*` are deprecated: never read for planning, baseline or confirmation, NULL on new rows, and historical values are not rewritten. Unversioned (v1) captures with an absent or invalid pair plan FULL `LEGACY_MAPPING` and are never rejected on authoring identity. This definition takes effect together with V26 and not before.

## 8. C0 sections each approved amendment will modify

| Amendment | C0 sections to edit |
|---|---|
| C0-A1 | §2 paragraph 2 (scope object), paragraph 3 (declaration "not proof"; forward/global → FULL), paragraph 4 (scope in snapshot; "IDs/order/scope advances sourceRevision"), paragraph 5 (baseline needs "compatible reviewed scope"), paragraph 6 (reaffirm/revoke); §3 paragraph 1 ("compatible with … reviewed scope"); §3 plan-reason item 4 (`SCOPE_UNKNOWN`, `GLOBAL_OR_FORWARD_SCOPE`); §7 paragraph 2 ("source/config/scope change"; "Scope attestation/review is not a semantic-quality badge") |
| C0-A2 | §2 paragraph 3 (model/heuristic may flag, never enlarge its write set: add the escalation clause); §3 plan-reason list (item 4 redefinition, new 4a, forced `ESCALATED_FULL`); §3 last paragraph ("no … hidden full fallback", "A later explicit FULL is a new request"); §4 envelope definition, variant/validity paragraph and outcome table (new row); §4 diagnostics paragraph (new codes / `DISCARDED` reasonDetails); §5 paragraph 2 (per-request budget; at most 2 requests per Run) and paragraph 5 (audit metadata: escalation fields); §6 paragraph 3 (proposal envelope version 2) |
| C0-A3 | §1 bullet 3 ("explicitly confirmed"); §7 paragraph 1 (confirmation fields + `confirmationSource` + trigger binding) and paragraph 2 (confirmation vs browser start, Run); "Implementation review amendments (2026-09-16)" paragraph 2 (which actions invoke generation) |
| C0-A4 | §2 paragraph 1 ("Structural insert/delete/reorder selects FULL in this release"); §3 plan-reason items 4 (`STRUCTURAL_CHANGE`), 5 (`TAIL_DELETION`) and 6 (earliest affected position); §3 paragraph "Freeze the selected mode…" (locked positions defined by C0-A5 identity) |
| C0-A5 | §3 plan-reason item 6 (definition of "changed"); §3 paragraph "Freeze the selected mode…" (reused bytes + identity guard); §5 paragraph 5 (audit metadata) |
| C0-A6 | §2 paragraph 4 (snapshot + hash definition) and paragraph 5 (legacy ineligibility wording); §2 "Identity and transaction boundary" paragraphs 2 (capture of authoring hash), 3 (publication guard) and 4 (Dara data design, V18 columns, V26 dependency); §7 paragraph 1 (`authoringHash` meaning) |

Machine-readable artifacts that must change in the same C0 edit (C0 §0): `docs/specs/studio/inference.openapi.yaml` (compile body `trigger`, response plan/escalation fields, confirm `confirmationSource`, `scope` read-only/ignored on write) and `docs/specs/studio/inference-proposal.schema.json` (`version: 2`, PATCH-only `PREFIX_IMPACT`).

## 9. Trade-offs recorded

- **Locked-step forward detector (A1).** Pro: restores C0's "forward scope → FULL" guarantee at negligible cost, with no model call. Con: false positives (for example a "Next step" button label) cost one FULL each. That is the safe direction, it is measured through `detectorHitRate`, and it does not change the user's default-forward intent.
- **Envelope v2 (OQ-S2).** Pro: one meaning per version, clean audit. Con: fixture re-versioning. The pin bump is already paid by story A.
- **RUN trigger binding (A3).** Pro: truthful audit of unreviewed confirmations, and no cross-principal auto-confirm. Con: one new captured field and one new `409` case. It is not a user-visible friction for the normal Run flow.
- **Not changed:** OQ-S3 (`TAIL_DELETION` → REUSE) is binding and is approved as specified, with the A1 forward rule as its only added precondition. Exact reference-set equality, FULL execution from step 1, AUTO/FULL only, the repair bounds and the v2 route layout are untouched.

## 10. Residual risks (accepted, to be stated in C0)

1. Implicit (non-textual) influence of a FULL baseline's old suffix on locked code cannot be detected. Controls: whole-artifact validation, FULL execution from step 1, "Rebuild all steps", and the 10.26 harness.
2. A detector false negative on paraphrased dependencies. Same controls, plus PREFIX_IMPACT. Measured by the 10.26 labeled corpus.
3. A3 moves diff review to after execution. Mitigation: the Run log diff and a truthful `confirmationSource`. Execution results bind to their revision, and a red run is visible.
