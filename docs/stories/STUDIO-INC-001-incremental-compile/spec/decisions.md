# User decisions — STUDIO-INC-001 (2026-09-23)

Resolves blocking open questions OQ-1..OQ-5 in `requirements.json`. These are fixed inputs for the
spec, critique and plan phases.

| OQ | Decision | Source |
|---|---|---|
| OQ-1 Reference compatibility | **Exact declared-reference set equality (C0 as-is).** A change to the test's declared variable/secret list makes the baseline ineligible → FULL. Switching step 2 to an *already-declared* variable stays incremental. | User |
| OQ-2 Scope declaration | **User delegated the design**, with fixed intent: recompile only the changed step and every step after it; never touch prior (locked) steps; *always* give the model the prior steps as context at inference time for full visibility. Proposal below. | User intent + Claude proposal |
| OQ-3 Confirmation | **Keep Run auto-accept.** Run = compile (if needed) → auto-accept → execute full workflow from step 1. Compile result/log must show reused vs regenerated steps (and code diff). | User |
| OQ-4 UI surface | **Restore the v2 stack + mount `InferenceStudio`** as C0 / story 10.25 designed (v2 controller/service/DTOs from `51ade0f1f`, rebuilt on the current pipeline incl. Story 10.44 changes). | User |
| OQ-5 Why the wiring was dropped | **Resolved by git:** merge `ec94e9585` states the v2 REST stack was not kept because its only entry point `CompilePipeline.compileVersioned` did not exist on the ui-studio side (fold conflict decision, not a known defect). | Git history |

| OQ-S3 Tail deletion | **Keep `TAIL_DELETION`.** Deleting only trailing step(s) is REUSE (zero inference) for the remaining prefix; whole artifact still validated; Run still executes from step 1. | User, 2026-09-23 |

## OQ-2 proposal (to be specified; amends C0 §scope)

1. **Default forward scope, no author checkbox.** A step's meaning may depend on its own text, preceding
   steps and declared references. This is the natural reading of an ordered English checklist and is
   what the user asked for. The explicit STEP_SCOPED affirmation stops being a precondition for
   INCREMENTAL. Replace it with the server-derived checks below. Keep the `scope` field for audit
   (`declaration: "DERIVED_FORWARD"`).
2. **Write set = earliest changed step → end.** Prefix steps are byte-locked (source and code). Insertions,
   deletions and reorders count as changes at the earliest affected position. A change at step 1 means FULL.
3. **Prior steps always in context.** The prompt carries the full ordered English plus the locked baseline
   code for every prefix step, marked read-only. Writable steps carry their prior code as a diff anchor
   *only* if evaluation shows it doesn't bias the output. Otherwise they carry the English only (10.26 harness decides).
4. **Backward/global dependency escalation → visible FULL.** Two signals:
   - a deterministic server detector over the *changed* steps' text (e.g. "all steps", "throughout",
     "every page", "go back to step", "instead of step N", references to earlier step numbers), and
   - a model outcome `PREFIX_IMPACT` (new proposal status) that the model may return for a writable step
     whose correct implementation requires changing a locked step.

   Either signal ends the incremental request and starts a new FULL request inside the same Run flow,
   logged as `ESCALATED_FULL` with the reason. This is not a hidden fallback: it is recorded, shown and budgeted as a
   separate request. C0's "no hidden full fallback" is preserved in substance; the amendment makes it
   visible and automatic rather than an author action.
5. **Safety net unchanged:** validator on the whole merged artifact; reused-code validation failure →
   FULL_REBUILD_REQUIRED; Run always executes all steps from step 1 in a fresh browser; "Rebuild all
   steps" (FULL) is always available.
6. **Eligibility otherwise per C0:** a PASSED FULL execution of the baseline revision at the same fingerprint,
   config and runtime pins; same CSI; exact reference-set equality (OQ-1).

---

# 2026-10-07 — V1+ scope decision (delegated by user)

**Decided by:** @architect (Aria), under delegation. The user asked to "analyze and take the decision,
consider the benchmark we ran to take this decision and avoid over-engineering. We are in early phase."
**Read at:** HEAD `ccf3b9743`. Docs and code were read; no test or Gradle task was run. Each fact below
is marked **verified** (read in the file named) or **inferred**.
**Append-only.** The 2026-09-23 decisions above still bind the *design* of incremental compilation.
This section decides *when* any of it is built.

## 1. What the benchmark says about where the risk is

Source: `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/report.md`, plus the VAL rows in
`validation-plan.md`.

| Benchmark finding | State at HEAD | Evidence |
|---|---|---|
| F1 Every correct refusal was lost (provider schema) | **Fixed.** `PROVIDER_SCHEMA_VERSION = 2`, per-status `anyOf` | verified: `GenAiLlmGatewayClient.java:431,454-477`; VAL-030 live: 1 attempt, `NEEDS_REVISION` |
| F2 thinking LOW ≥ MEDIUM ≥ HIGH, 3–6× faster | **Applied.** `thinking-level` defaults to `LOW` | verified: `application.yml:333`; VAL-007 live: compiles 2.7–2.8s |
| F3 4096 output tokens truncate | **Not applicable.** Production stays at 32768 | verified: `application.yml:328` |
| F4 Pro model not better | No action | — |
| F5 Ambiguous locators unsolved by any config | **Addressed at the runner, not the prompt.** VAL-031 (text-entry role equivalence), VAL-040 (visible-only resolution), VAL-041 (gated `.or()`); 8/8 live Wikipedia PASS | verified: `validation-plan.md` VAL-031/040/041 rows. The C07 benchmark rerun was not run |
| Story 10.45 (static-first prompt, deterministic schema, explicit thinking, usage) | Done | verified: `10.45.story.md` status |
| **Still open:** whether the R2D2 proxy accepts `anyOf`, `systemInstruction` and `thinkingConfig` | **Open. No fallback switch exists for `anyOf`** | verified: `validation-plan.md` QA-2 and release condition 3; `GenAiLlmGatewayClient.java:449-452` |
| **Still open:** quality on real enterprise pages. The benchmark used synthetic fixtures, empty authoring contexts and n = 3 × 13 | Unmeasured | verified: report "Not proven" |

**Reading.** The measured risk is in **first-time FULL compilation** (positives 21/24 to 22/27 at LOW)
and in **locator ambiguity**, and both have been worked where the benchmark pointed: schema, thinking
level and runner. Incremental compilation addresses none of them. Its two economic levers were
latency and tokens, and LOW already took most of the latency: p50 is 2.8s per attempt and input is
about 3.2K tokens at p50. *Inferred:* for ≤100-step tests, recompiling everything after an edit
costs seconds, not minutes. The remaining incremental benefit is that an edit to step N does not
re-roll steps 1..N-1. That is real, but it is unmeasured, and VAL-040/041 already removed the
observed flip. **Early phase + no evidence of the problem = do not build the machinery yet.**

## 2. V19 hazard verdict

**Verified by reading code and the IT's own assertion (not executed): applying
`backend/db/cutover/V19__studio_inference_candidate_identity.sql` at HEAD breaks every V1 Run compile.**

- The live chain is `CompilePipeline.compile` → `CompileStateService.beginCompile`
  (`CompilePipeline.java:171`) → `publishAcceptedCandidate` (`:369`). `beginCompile`
  (`CompileStateService.java:176-198`) writes only `ui_tests`. It never inserts a
  `ui_test_compile_requests` row. `captureForCompilation`/`capture` have no caller in `src/main`.
- `publishAcceptedCandidate` (`:268-327`) always calls `insertOrReuseRevision` (`:279`). That calls
  `INSERT_REVISION` (`:50-65`), whose column list has no `compile_request_id`.
- V19 adds `trg_ui_test_revision_require_request`, which raises 23514 `new candidate requires
  immutable compile request after V19` when `compile_request_id IS NULL`.
- `InferenceMigrationLatestIT.mixedWriterCutoverOnHeadSchema` proves the rejection itself: its
  `LEGACY_WRITER` (`:99-111`) has exactly `INSERT_REVISION`'s column list, and the test asserts it is
  rejected after the cutover (`:695-699`). The test calls that writer "legacy". It is in fact the
  writer production uses.
- The capability-gated `insertCapturedRevision` branch exists only in `publishCandidate`
  (`:223-225`), which has no caller in `src/main`. Even through that branch, there is no request row
  for V1 to SELECT from, so `queryForObject` would find nothing (**inferred**, not run).
  `capturedPublisherAcceptsContextAwareDraftAfterCutover` inserts its own request row, so it does not
  exercise the live chain.
- **So the rollback-floor row "Head + V19 … `571e779e1` … is the oldest binary that is safe after
  V19" in `docs/runbooks/studio-inference-rollout.md:83` is wrong for HEAD.** `571e779e1`
  (2026-10-06) fixed the captured writer. But `554277fcb` (2026-09-22) had already routed the live
  path away from it.
- Severity: the failure is loud (no silent dedup or corruption). But V19 is forward-only, and the
  only way back is restoring the pre-V19 snapshot. **Until story S2 below lands, V19 must not be
  applied to any shared environment.** Docs-only correction owed: S2 fixes the runbook row.
- Related, verified: the deadline term in `lockCurrentRequest` (`:722-723`) and in
  `publishCandidate`'s final CAS (`:241-243`) is `NOT EXISTS (… ui_test_compile_requests …
  deadline_at <= clock_timestamp())`. With no request row it is **vacuously true on both
  publishers**. This sharpens ADR-002 §35.1 item 5a: the V1 deadline recheck is missing because the
  request row is missing, not only because a statement is absent.

## 3. Decision table

| # | Candidate | Verdict | Effort | User-value justification |
|---|---|---|---|---|
| 1a | **Minimal request capture for every V1 compile.** `beginCompile` writes a `ui_test_compile_requests` row (existing V18 columns, FULL plan, fingerprint, `deadline_at`) carrying the §35 `trigger = RUN`. The revision is linked when the capability is present | **FOLD NOW, inside S2 (§35 fix)** | +S on top of S2 | §35's trigger has nowhere to live without it. The deadline recheck is vacuous without it (§2). V19 can never be applied without it. This is trust and correctness, not incremental machinery |
| 1b | Capture-for-all of the V21/V24 authoring/policy columns onto requests (the old "V29, L" item, INC-001 B1 remainder) | **DEFER** → trigger T-INC | L | Only serves baseline eligibility for incremental. The revision already carries V21 authoring via V21's trigger |
| 2 | Real V21 step IDs as writable IDs | **DEFER** → T-INC | S | For FULL, synthetic writable IDs (`gateway/CompileRequest.java:71-78`) are correct. Changing them changes prompt bytes, so every test recompiles once for no user-visible gain |
| 3 | Config-only REUSE | **DEFER** → T-INC or a UI config editor | S–M | Verified: the V1 UI has no configuration editor (`ChecksStudioPage.tsx:601` forces the timeout; no viewport/waitStrategy control). Config-only edits come only from API clients |
| 4 | Mount the V21 stable-ID authoring editor (10.38 state, 10.40 transport) | **DEFER** → T-INC, or pilot evidence that author context fixes compile failures | M | Verified unmounted: `features/studio/authoring` and `studioAuthoringTransport` have no page importer. Nothing V1 authors see. The benchmark used empty contexts, so there is no evidence yet that context improves quality |
| 5a | Make HEAD V19-safe and prove it: an IT that applies V19 in a test schema and runs a V1 compile to `READY` with `confirmation_source = RUN`. Correct runbook floor row `:83` | **FOLD NOW, inside S2** | S | Removes a forward-only trap from the runbook |
| 5b | Apply V19 to shared environments (the INC-001 phase-3 runbook) | **DEFER** → T-INC, or a need for revision↔request linkage in audit | S + window | No user value before incremental. Pre-V19 audit works: S2 reads the trigger through `ui_tests.compile_request_id` under the publication lock and writes `confirmation_source` on the revision |
| 6 | Hygiene: dead `studio.authoring.v2-enabled`/`incremental.enabled` YAML keys (no Java reader found by grep), unused V18 `ui_test_step_identities`, scope checkbox | **DROP** (the V18 identity table is never used; the scope checkbox was already dropped by OQ-2). Leave the YAML keys: the runbook documents them, and they cost nothing | — | Churn with no user value |
| 7 | B2 (incremental planner, `PREFIX_IMPACT`, escalation) and C (v2 stack, `InferenceStudio` mount) | **DEFER** → T-INC | ~13 pd | See §1 |
| 8 | Benchmark residual: R2D2 acceptance of `anyOf` / `systemInstruction` / `thinkingConfig` LOW, and usage pass-through (narrowed SPK-01) | **FOLD NOW, probe only** | S | If R2D2 rejects `anyOf`, every production compile fails. This is the largest unmeasured user-facing risk. Build an `anyOf` fallback switch **only if the probe fails** |
| 9 | VAL-014 rule 7 (prompt 2.4.0) | **Stays DEFERRED** | — | Runner fixes cover the observed failures. Rule 7 measured as noise (23/27 vs 22/27) |
| 10 | QA-6: model refusal `message` stored unmasked | **DEFER (security, LOW)**, backlog item | S | Inputs are screened for inline credentials, and references are names only (inferred low exposure). Flagged, not ignored |

**T-INC (trigger to revisit everything deferred):** measured pilot evidence, from the existing
`GatewayAuditLogger` lines and run history on real CSI tests, of either (a) compile latency or
token cost on edit that users feel, or (b) edits to a later step regressing previously passing
earlier steps. SPK-01 must also be done. No numeric threshold is set here (CON-10). The user
decides at that point, against the evidence.

## 4. Sequencing

| Order | Story | Size | Executor → gate | Depends on | Parallel? |
|---|---|---|---|---|---|
| S1 | **10.48 — Restore Studio execute authorization (O-22)** | S | @dev → @qa | O-22 user/security decision | Yes, with S3. Merges **before** S2: both edit `openapi.yaml`, so the `BASE_SHA256` re-anchor and the ADR-002 §13 row are serial |
| S2 | **Run-confirm conformance (ADR-002 §35.5) + minimal V1 request capture + V19-safety proof** (items 1a, 5a). Migration at the next free Flyway number (V29 at HEAD; V26–V28 are taken). DDL detail goes to @data-engineer | M | @sm draft → @po → @data-engineer (DDL) + @dev → @qa | S1 merged (openapi digest) | Development can run alongside S1. Merge is after S1 |
| S3 | **SPK-01 narrowed — R2D2 probe** (`anyOf`, `systemInstruction`, `thinkingConfig` LOW, usage fields). Fallback switch only on failure | S | @dev + @devops (environment) → @qa reads evidence | none | Yes, with S1/S2. It is an R2D2 **release gate** (QA-2) |

**How §35 and O-22 fit.** O-22 is independent security and goes first, unchanged. The §35 fix
**absorbs** the only part of "V1+" that is not speculative: a request row per V1 compile.
§35.5 item 2 already requires the `insertCapturedRevision` branch and a deadline recheck, and both
are only meaningful with that row (§2). S2's acceptance criteria must therefore state explicitly:
(i) `beginCompile` writes the request row with `trigger = RUN` in the same transaction, (ii) the
deadline recheck fails a publication past `deadline_at` (behavioural test), (iii) with V19 applied in
a test schema, a V1 compile publishes `READY` linked to its request, and (iv) the runbook floor row is
corrected. S2 involves no `PROMPT_VERSION` or fingerprint change, and it must not change prompt
bytes.

## 5. Explicitly not done

- Not run: any Gradle task, IT or live call. The V19 verdict rests on reading code plus the IT's
  assertion over an identical column list.
- `docs/runbooks/studio-inference-rollout.md` was not edited. The correction is S2 scope, and this
  record is the warning until then.
- INC-001 `implementation.yaml` was not rewritten. A supersession note is appended to it.
