# Studio inference remediation and compilation plan

> **Superseded (2026-10-12):** Superseded by [ADR-SC-005](ADR-SC-005-single-path-observed-authoring.md) (single observed path; compile-to-READY removed in STUDIO-OBS-012A).

**Date:** 2026-09-16 · **Status:** Implementation in progress. See [execution record](studio-inference-execution-log.md), [C0 contract](studio-inference-contract-v1.md), and stories10.20–10.26; release gates remain open.

This plan addresses the [inference review](studio-inference-review-2026-09-16.md) and the requirement to support both full compilation and incremental updates to a previously working test. It extends the [Studio compiler architecture](studio-execution.md#4-studio-step-compiler); contract changes below must be incorporated into the OpenAPI definitions, persistence migrations, and implementation stories before shipping. Existing closed contracts are not implicitly widened by this document.

**User-selected default (2026-09-16):** recompile the changed step and any dependent steps; run the full test to verify it. Automatically select incremental compilation when reuse is eligible, then validate the complete artifact and require confirmation of the new revision. The next user-requested Run executes the complete test from a fresh browser. Saving or compiling does not start browser actions. Full rebuilding remains available explicitly and when reuse is ineligible; checkpoint-based partial execution is deferred.

## 1. Separate compilation, validation, and execution

| Operation | Full approach | Incremental approach |
| --- | --- | --- |
| LLM compilation | Generate all steps for the captured draft | Generate only the deterministically selected changed/dependent steps; reuse eligible code elsewhere |
| Static validation | Validate the entire generated artifact | Merge first, then validate the entire assembled artifact through the same validator |
| Confirmation | Confirm the new immutable revision and artifact hash | Confirm the new immutable revision and artifact hash, including reused and regenerated steps |
| Execution verification | Run all steps from a fresh browser on explicit Run | Run all steps from a fresh browser on explicit Run; compilation reuse does not skip prerequisite actions |
| Passing evidence | Belongs to the executed revision/configuration | Old passing results remain historical evidence; they are not transferred to the new revision |

The runtime continues to consume one complete, immutable artifact. Incremental compilation is an authoring optimization, not runtime AI or an alternative execution engine. A previous pass is useful evidence for selecting a baseline; it does not establish the correctness of a changed test.

## 2. Full compilation

Use full compilation for first creation, explicit **Rebuild all steps**, or when the planner cannot establish a reusable baseline. Capture inputs and revision identity atomically (review F2), issue a schema-constrained full proposal or an explicit unsupported result (F1/F8), apply bounded repair, and validate before creating an `AWAITING_CONFIRMATION` candidate.

The planner selects full compilation before generation when any of these apply:

- No authorized, compatible baseline exists, including legacy artifacts without reliable step identity/provenance.
- Step insertion, deletion, reordering, or ambiguous identity mapping occurs in the first incremental release. Structural incremental edits are a later extension, not inferred from array positions.
- Model, generation settings, prompt, syntax reference, or language-policy changes make the compilation fingerprint incompatible. An operationally revoked policy blocks execution regardless of compilation mode.
- A global instruction or reference-contract change affects the whole test, or deterministic analysis cannot establish any unaffected region.
- The user explicitly requests a complete regeneration.

Show the selected mode and its reason. Full rebuilding never overwrites the existing confirmed revision or its history; it creates another candidate. Do not silently switch a failing incremental repair into unrestricted full generation within the same request.

## 3. Incremental compilation

### Baseline and identity

For the initial release, choose an authorized confirmed revision with a successful full execution of that baseline's exact revision/configuration as the reusable baseline. Separately evaluate whether its code and dependency contract are compatible with the new draft/configuration; an old pass never proves the new configuration works. Diff the entire current draft against that baseline, not merely the last editor event: several accumulated edits must all be included. If a suitable baseline cannot be established, select full compilation. The baseline is scoped to the same test and CSI; a content hash never grants cross-test or cross-CSI access.

Query terminal successful **full** executions joined to their exact confirmed revision and recorded configuration/runtime; do not use `last_run_status` or legacy passing rows without revision identity. Choose deterministically among eligible baselines and record the chosen execution's physical identity `(id, started_at)`. Dara specifies the indexed query and retention behavior. If required evidence has expired, choose full compilation unless an explicitly designed durable eligibility record preserves that evidence. Authorization, deletion/quarantine, and policy eligibility are rechecked at publication and execution as appropriate.

Introduce stable, server-validated step IDs in authoring/persistence metadata, with an explicit versioned API migration. Preserve IDs across text edits and moves; give newly inserted or duplicated steps fresh IDs. Current requests use `steps: string[]`, and artifacts contain positional `stepIndex`; neither is sufficient to infer identity across arbitrary structural edits. Legacy requests without a reliable ID mapping use the full path. Duplicate text must never be treated as identity.

The server controls ID allocation/validation, uniqueness, and same-test ownership. Identity/order changes advance the source or a declared authoring revision even when text stays equal. Persist the ordered ID/source snapshot on every candidate, not only on the mutable draft. Legacy writers currently discard structured IDs; invalidate unverifiable mappings and prevent mixed writers from claiming incremental eligibility.

Keep the runtime artifact's positional shape unless a separate contract amendment changes it. The assembler derives `stepIndex` from the current order and `originalText` from the captured current source. IDs and reuse provenance can be stored separately from this closed runner artifact.

### Deterministic impact analysis

Maintain separate sets for **steps requiring generation**, **steps requiring static validation** (always all), and **steps requiring execution to establish a current full pass** (always all). The LLM cannot choose which steps are independent or widen its own write scope.

Initial conservative policy:

1. Compare stable IDs, exact source text, order, reference declarations, compilation fingerprint, and relevant configuration against the baseline.
2. Establish semantic dependency scope before applying the browser-state rule. Whole-workflow English can contain global constraints or forward references: an earlier instruction such as “prepare the inputs required by the final assertion” can change meaning when the last step changes. Exact source/code equality establishes preservation, not semantic independence. Current arbitrary English and positional artifacts do not provide a trusted dependency contract; without one, select full compilation.
3. For eligible text-only edits with stable order and an established step-scoped dependency contract, find the earliest changed or semantically affected step. Reuse only the prefix outside that impact set and regenerate the affected step plus the entire following suffix. With several edits, compute the combined impact against the baseline.
4. Treat actions as potentially changing navigation, authentication, DOM, or application state. A changed assertion can alter workflow timing too. Forward/global dependencies widen the impact set; unknown dependencies select full compilation. A deterministic planner applies explicit, versioned dependency rules/metadata whose trust basis is reviewed in the contract gate. Neither an LLM's self-reported dependencies, a confidence score, nor a keyword heuristic proves independence.
5. If the edited step is last and no earlier step depends on its meaning, generate only that step. Narrower middle-step-only regeneration is a later optimization requiring explicit dependency/effect metadata and tests.
6. When no prefix can be safely reused, use the full path and explain why. Freeze the initial eligibility contract before shipping incremental mode; legacy full-context compilations are not silently assumed to satisfy it.

This protects working code while remaining honest about sequential browser state. It deliberately does not promise that every one-line edit causes exactly one generated step.

**C0's required eligibility decision:** the recommended V1 trust basis is a versioned step-scoped authoring contract with author-reviewed dependency/scope metadata bound to the exact baseline source. Each edit must reaffirm its scope through the authoring flow; baseline confirmation alone cannot cover new global/forward effects. Uma designs this within the existing edit/review interaction, with full rebuilding available when scope is unknown. Author attestation is a semantic assumption, not a deterministic proof of English independence. The planner deterministically enforces that declared contract; review and independent behavioral evaluation test whether the assumption is dependable. Missing/stale metadata and ambiguous/global/forward instructions select full compilation. If this trust basis cannot be specified and evaluated, ship corrected full compilation first and keep incremental mode disabled.

### Prompt, patch, and merge

Provide the model with the full current ordered English source, allowed-language contract, reference names, relevant baseline code/context, and an explicit set of writable step IDs. Fence all source and prior candidate material as untrusted data. Include enough context for pronouns, navigation, and prior actions; resolved variable/secret values remain excluded.

Require a closed, schema-constrained patch containing exactly the allowed IDs, each once, with generated code or an explicit unsupported/clarification outcome. Reject unknown, missing, duplicate, or out-of-scope IDs. Any unsupported/clarification step prevents publication of the entire executable candidate; do not create a partially runnable artifact or fall back to its old code. Freeze these outcomes and their UI/lifecycle mapping before implementing them. The incremental transport schema must be separately versioned; never pass the patch directly to the runner as an executable artifact.

The backend assembles the full artifact deterministically. For every reused step, verify exact equality of source text and code against the pinned baseline; do not let the model rewrite, simplify, or silently weaken retained code. Derive positional fields on the server. Then run full schema, reference, AST, capability, and runtime-compatibility validation, including strict runner-verdict validation (F3).

Repair stays within the original writable set. Diagnostics involving a supposedly reused step invalidate the reuse assumption; return a clear full-rebuild requirement rather than silently extending patch authority. Full generation and incremental repairs share the same per-request proposal limit, transport-retry bounds, token limits, and monotonic deadline (F5/F8). Mode changes must not reset budgets. If required context exceeds the request budget, reject clearly instead of truncating dependencies.

### Publication and provenance

Publish one new immutable candidate only if the captured source/configuration revisions and compile request identity are still current. Preserve the baseline. Incremental success never auto-confirms the new revision.

Separate compile-attempt/candidate identity from artifact-content identity. The current revision uniqueness on `(test_id, source_revision, configuration_revision, artifact_hash)` and `insertOrReuseRevision` can return an already confirmed row when a rebuild produces identical code. Publication must be idempotent for the same compile request, while a distinct explicit rebuild gets its own candidate/attempt record and confirmation lifecycle. Preserve original write-once confirmation/provenance. Content deduplication may share stored bytes, but must not collapse distinct compile attempts or falsely attribute their provenance. Dara owns the migration design; the contract gate decides the exact persistence shape before implementation.

Record the baseline revision/hash, chosen mode, impact-analysis policy version, changed/writable IDs and reason, reused/generated step origins and code hashes, actual generation settings, model/prompt/reference/policy versions, and validation/runtime compatibility versions. A mixed artifact must not claim that the latest model generated its reused steps. Each generation or repair records its scope and usage within the request's total budget.

Record both the immediate baseline and each reused step's original generating revision/request. New ordered-source/ID snapshots and provenance fields need database-enforced immutability; V12's existing trigger enumerates protected columns and does not automatically protect additions. Historical revisions remain unchanged. Capture source, IDs, configuration/reference identity, baseline identity, and compile request in one short transaction or revision-checked compare-and-set; commit before all model/network work.

Include the versioned dependency/scope declaration and the edit's reaffirmation in that immutable snapshot. Hash/version this metadata and include it in the source/authoring revision or explicit publication guards. A scope-only edit invalidates an in-flight compile even when English, order and execution configuration are unchanged; candidate confirmation must bind the same scope snapshot.

Reusing code does not reuse its validation verdict: the complete assembled artifact must pass the current validator. Existing confirmed tests are not automatically rewritten after a model change; explicit edits/rebuilds apply the compatibility rules above.

## 4. Example and user-visible behavior

Assume a confirmed six-step login-and-search test has a passing full run and an eligible step-scoped dependency contract: steps 1–4 do not depend on the search/assertion wording. The author changes step 5 from searching for one account to searching for another.

| Step | Compilation treatment | Status for the new revision before Run |
| --- | --- | --- |
| 1–4, unchanged setup/login/navigation | Reuse exact baseline code; validate again | Reused code; last pass belongs to the previous revision |
| 5, edited search | Regenerate | Changed; awaiting review/confirmation |
| 6, assertion dependent on search | Regenerate conservatively | Affected by step 5; awaiting review/confirmation |

After confirmation, Run starts a fresh browser and executes steps 1–6. Only the resulting execution can show a full pass for this revision. If step 6 alone changes and earlier steps are independent of its meaning, compile only step 6, validate all six, then execute all six when requested. If step 1 changes navigation/login context, or step 6 changes an earlier step's meaning, widen regeneration appropriately; unknown scope selects full compilation.

Show a concise explanation such as: “Recompiled steps 5–6; reused steps 1–4. Review changes, then run all 6 steps.” Display actual code/action diffs for regenerated steps and identify reused code. A historical green badge must name its revision/run or appear explicitly as a previous result; it cannot represent a current pass.

Confirmation, static validation, and observed pass remain distinct. A failed new candidate/run leaves the previous confirmed revision and its evidence available in history. Restoring it is an explicit revision action; a failed edit must never silently execute the old revision under the new source.

## 5. Configuration-only changes and partial execution

Preserve the existing distinction between source and execution configuration:

- Name/description-only edits require neither LLM work nor renewed confirmation.
- An exact no-op save preserves state and does no compilation. If accumulated edits revert to an eligible baseline's exact source/ID mapping, reuse all compatible code with zero inference, but preserve the intervening source-revision history: the new revision still receives full validation, confirmation, and its own run evidence. Explicit Rebuild all steps remains an intentional generation request even for identical text.
- Compatible environment, viewport, timeout, wait-strategy, or plain-variable-value changes can reuse compiled code, but require a new configuration-bound candidate, relevant validation/authorization checks, reconfirmation, and a new full run before reporting a pass for that configuration. Runtime/browser incompatibility blocks reuse or execution as appropriate.
- Reference renaming, removal, type changes, or changed bindings require reference/dependency analysis. Unknown impact selects the full path; full generation must still reject undeclared references.
- Vault value rotation does not trigger compilation or expose a value to the LLM. Resolve references at execution and record a nonsecret version identifier when available; a previous pass is not evidence that a newly rotated value works.

**Checkpoint-based partial execution is deferred.** A saved login/session checkpoint does not establish that DOM and server-side application state match a previous run. Running only the changed step would require a separate design for reproducible setup, state restoration, isolation, expiry, authorization, and evidence. Such a run would be labelled partial verification and could not mark the complete test green. The initial plan always replays prerequisites through the full run.

## 6. Implementation sequence

| Work package | Scope | Completion evidence |
| --- | --- | --- |
| C0 — Shared contracts and early evaluation design | Dependency eligibility/trust basis; full/patch/unsupported envelopes; strict validator verdict; IDs, candidate identity, mixed provenance, compatibility; shared deadline/retry interfaces; QA-owned behavioral oracles | Aria/Dara/Quinn review; consistent contract amendments and implementation-ready stories before affected code is written |
| A — Correctness foundations | F1 unsupported outcomes, F2 atomic snapshot/identity, F3 strict verdicts, F4 assertion semantics, F6 action-option policy | Regression tests for each reproduced defect; concurrent-edit barrier tests |
| B — Bounded production inference | F5 shared deadline/cancellation, F7 supported SDK adapter, F8 schema/token limits, F9 repair context and provenance | Local wire/contract tests for delayed retryable responses and cancellation; live SPK-01 verification is a separate release gate |
| C — Revision and impact contracts | Stable authoring IDs, full/incremental mode selection, baseline eligibility, conservative suffix invalidation, explicit API/schema amendments | Contract/migration tests, duplicate/missing-ID cases, multiple-edit and configuration-only cases |
| D — Incremental pipeline | Scoped prompt/patch, deterministic merge, full validation, immutable mixed provenance, exact confirmation | Out-of-scope patch rejection, unchanged-code equality, budget and stale-publication tests |
| E — Review and execution UX | Show reused/regenerated steps, revision-specific historical results, new candidate confirmation, full Run | Frontend/MSW flows showing no false current green and no browser execution on save |
| F — Full/incremental evaluation | Execute the C0-defined F10 English/edit corpus against controlled apps and the actual approved gateway/model; measure performance | Release report comparing correctness, reuse, latency, tokens, repair yield, false successes, and saturation |

C0 precedes affected changes in A, B, and C. D depends on A, C, and B's implemented/tested generation-schema, deadline, retry, token, and repair interfaces. E can proceed against frozen C0 contracts and MSW mocks while D is built; its integrated acceptance depends on D. F's corpus and expected outcomes are designed in C0, before viewing model results, and executed after integration. Live SPK-01 verification gates shared-environment use and release, not development of the local/stubbed paths. These work packages are planning scope; they do not assert that new implementation stories already exist.

## 7. Required acceptance cases and measurements

1. A first draft and explicit Rebuild all steps use the full path; an ineligible baseline reports the fallback reason.
2. Editing the last step of an eligible passing test with independent earlier steps generates exactly that step, retains every earlier code string, validates the complete artifact, and requires fresh confirmation.
3. Editing a middle step regenerates the conservative suffix and preserves only an eligible independent prefix; changing early navigation/login cannot retain a falsely independent suffix.
4. Multiple edits are compared with the baseline as a whole. Structural changes, duplicate text, absent IDs, incompatible pins, and unmappable legacy input never reuse the wrong step.
5. Patch attempts to change protected steps, omit IDs, duplicate IDs, add imports, weaken capability policy, or introduce undeclared references fail without publishing a candidate.
6. Concurrent source/configuration edits, overlapping compile attempts, and stale confirmations cannot publish or approve a patch against the wrong baseline/draft.
7. Incremental repair/fallback cannot reset budgets, mutate the baseline, or start calls after expiry. Overload behavior remains bounded for both modes.
8. A merged candidate is validated as a whole. Incompatible or revoked policy cannot be bypassed by marking code reused.
9. Saving/compiling starts no browser. Running a confirmed incremental candidate executes prerequisites in a fresh browser; a downstream failure leaves the new test non-green even if its reused steps passed historically.
10. A compatible configuration-only edit uses zero LLM calls while applying the correct confirmation/evidence rules; a renamed secret reference or revoked permission fails explicitly.
11. Controlled-app evaluations cover successful edits, ambiguous/unsupported edits, negative assertions, changed login/navigation, and changes that ought to make the test fail. Expected behavior is checked independently of the model's output and of a full-recompile result.
12. Measure full versus incremental end-to-end p50/p95, input/output tokens, transport calls, repair rate, first/final validity, behavioral correctness, false-success rate, and capacity recovery. Include early, middle, and last-step edits at representative workflow lengths and concurrency. Full context can keep input-token costs high; do not claim latency/cost savings from the number of regenerated steps alone.
13. An English edit that happens to produce identical code still requires confirmation of its new source revision and a new full run before it receives current passing evidence. Code equality does not prove unchanged intent.
14. Changing a final/global instruction that affects earlier steps widens the impact set; uncertain forward/global dependencies select full compilation. A legacy artifact has no implied dependency contract. Conflicting English cannot be resolved by silently keeping a previously passing prefix.
15. Rebuilding unchanged source with identical generated bytes preserves prior confirmation/provenance and creates the declared new attempt/candidate identity. An already confirmed row cannot strand the new candidate in an unconfirmable state.
16. Real-database barriers exercise edit-versus-capture, edit-versus-publication, confirm-versus-edit, overlapping compiles, baseline deletion/ineligibility, and a late old-run result. Cross-CSI/test baseline selection and revoked policy/secret access are denied by server checks, including concurrent requests.
17. The QA-owned semantic corpus contains mutation controls: reverse a negative assertion, use the wrong account/locator, omit an action, or substitute a trial click. Independent app-state/assertion oracles must catch each wrong implementation even if generated execution reports PASS.
18. No-op saves, exact-content reverts with newer revision numbers, missing/expired baseline evidence, and repeated publication of the same compile request follow their declared distinct identity/evidence rules. Added identity/provenance fields are immutable at the database layer.
19. Migration tests cover fresh install, representative existing/legacy history, mixed application versions, compatible-writer cutover, and rollback to the documented version floor. Indexed baseline selection is measured against realistic execution-history volume.
20. Editing only dependency/scope metadata or its reaffirmation supersedes the old compile request; stale publication/confirmation cannot reuse the previous declaration. Its immutable version/hash is preserved with each candidate.

Release thresholds must be agreed before evaluation. The reuse invariant is exact unchanged-code preservation, not byte equality between two independent model generations. Both modes must satisfy the same behavior and validation requirements.

## 8. Execute with expert subagents

The coordinating agent runs the dependency graph and integrates results. Domain decisions and quality verdicts belong to the experts below. Load the named skill and its referenced agent/task definition when starting each role. Do not treat a role label as a substitute for reading its instructions. These assignments describe future execution; this review did not start implementation.

| Expert / skill | Bounded responsibility | Required handoff |
| --- | --- | --- |
| Aria — [aiox-architect](../../.codex/skills/aiox-architect/SKILL.md) | C0 dependency trust basis, proposal/patch/outcome contracts, compatibility, deadline interfaces, rollout design; review later changes to those decisions | Contract/decision record, dependency graph, explicit unresolved assumptions; no formal QA self-approval |
| Dara — [aiox-data-engineer](../../.codex/skills/aiox-data-engineer/SKILL.md) | Candidate/request/content identity, stable IDs, baseline query, Flyway/constraint/trigger/index changes, migration and cutover design | SQL/migration ownership list, schema/API compatibility matrix, real-PostgreSQL concurrency and upgrade evidence |
| Quinn — [aiox-qa](../../.codex/skills/aiox-qa/SKILL.md) | Early F1–F10/acceptance traceability, independent semantic oracles and mutation controls; review each integrated wave and final evaluation | Independent findings, test/evaluation evidence with failures/skips/prerequisites separated; formal story gates only through the story-review workflow |
| River — [aiox-sm](../../.codex/skills/aiox-sm/SKILL.md), then Pax — [aiox-po](../../.codex/skills/aiox-po/SKILL.md) | River drafts scoped implementation stories against the actual Epic 10 index; Pax validates acceptance criteria, dependencies and readiness | Real story paths/IDs with executor, reviewer, exclusive files, dependencies and evidence requirements; package labels A–F/C0 are not invented story IDs |
| Dex — [aiox-dev](../../.codex/skills/aiox-dev/SKILL.md), separate backend/gateway/runner/frontend tasks | Implement one ready story or bounded file set per subagent, including meaningful regressions | Changes, exact file list, commands/results, unresolved findings; never issue its own independent QA verdict |
| Uma — [aiox-ux-design-expert](../../.codex/skills/aiox-ux-design-expert/SKILL.md) | Scope declaration, full/incremental reasons, reused/generated review, unsupported outcomes, historical/current evidence distinctions | Interaction/state specification and review of the frontend against it; frontend Dex implements with MUI/MSW |
| Gage — [aiox-devops](../../.codex/skills/aiox-devops/SKILL.md) | SDK/proxy deployment compatibility evidence with Aria, CI/image/environment gates, controlled flags, migration cutover and rollback procedure; remote Git/release operations when authorized | Reproducible environment evidence and rollout/rollback checklist; unresolved SPK-01/external dependencies stay visible |

Use at most the available concurrency slots; in this session that is the coordinator plus three subagents. Reuse agents for related follow-up work. Parallelism is allowed only for independent tasks with disjoint write ownership. Read-only expert reviews may run together.

### Execution waves and dependencies

| Wave | Subagent tasks and allowed parallelism | Exit gate |
| --- | --- | --- |
| 0a — Inspect and settle C0 | Aria, Dara and Quinn review independently; coordinator reconciles findings. Aria is the single owner of canonical contract amendments; Dara and Quinn supply data/test requirements | Dependency eligibility decision, all-or-nothing unsupported outcomes, schemas, identity model, bounded-inference interfaces, migration strategy and early oracle specification agree |
| 0b — Make work executable | River drafts actual stories; Uma designs frozen-contract UX in parallel where files are disjoint. Pax validates stories after their dependencies/criteria exist. Quinn checks evaluation criteria with Pax/Aria | Stories ready by repository workflow; F1–F10 and acceptance 1–20 assigned; numeric live-evaluation criteria recorded or explicitly pending and release-blocking |
| 1 — Independent foundations | Runner Dex implements F4/F6; gateway Dex implements B against C0 interfaces; Dara implements owned additive migrations/DB tests. No live gateway flag enablement | Each owned slice passes targeted checks; migration compatibility evidence available; interfaces and generated contract artifacts match C0 |
| 2 — Core and user flow | Backend Dex implements A's transaction/verdict/outcome work and C's entity/repository/planner foundation, then D. Frontend Dex implements E with MSW against frozen contracts. Quinn builds independent oracle/evaluation fixtures in its own files. As a slot becomes free, a separate evaluation-harness Dex implements the CLI against Quinn's frozen oracle specification; Uma reviews frontend handoff | Backend A/C and B are green before D integration; full and incremental candidates pass whole-artifact validation and exact confirmation; frontend integrated flows match contract; evaluation harness is implemented with fixture-backed checks |
| 3 — Independent integration review | Quinn reviews/runs integrated regressions and independently validates the evaluation harness/mutation controls; Dara audits migration/concurrency/lineage results; Aria reviews dependency/compatibility/budget behavior | Defects return to the owning Dex/Dara task for correction, followed by independent re-review. The harness is reviewed before live wave 4; no implementing subagent approves its own work |
| 4 — Live evaluation and rollout readiness | Gage prepares approved environment and external evidence; after SPK-01's requirements are met, Quinn executes F and Aria reviews the architecture/performance conclusions | Defined release criteria met, external prerequisites satisfied, migration rehearsal and rollback tested; production deployment is a separate authorized action |

Wave ordering is a dependency rule, not a requirement to keep idle experts waiting. For example, the frontend mock work can begin when its contracts and UX are ready even if backend implementation continues. Actual D integration cannot precede B's bounded-inference contracts/implementation. Live external blockers do not stop useful local implementation and review work.

### Write ownership and integration discipline

Before dispatch, the coordinator records the current commit and existing dirty files in `wt/epic`. The integration fixes already in this checkout are part of the baseline and must be preserved; a fresh worktree from HEAD alone would omit them. If isolation is needed, materialize the intended baseline deliberately. Do not reset, clean, or opportunistically commit another task's work.

Assign exact paths in each task packet, using this initial partition:

- Aria owns canonical architecture/OpenAPI/schema decisions and amendments during C0. After freeze, assign implementation or generated-file updates to one named owner per file; no independent schema copies.
- Dara owns new `backend/src/main/resources/db/migration/` files and migration tests. Allocate migration numbers centrally. Backend Dex owns Java entity/repository integration and `studio/compile/**` except the gateway package; Dara reviews their SQL/transaction invariants.
- Gateway Dex owns `studio/compile/gateway/**`, associated tests and its named dependency/config edits. `backend/build.gradle.kts`, `application*.yml`, shared DTOs and deadline interfaces each have one writer and an explicit handoff; a directory partition does not permit concurrent shared-file edits.
- Runner Dex owns the named validator/executor/adapter files and regressions. Coordinate language-policy changes with C0 and regenerate/verify prompt references and frontend summaries through their assigned owners.
- Frontend Dex owns specified Studio components, types, client calls and MSW handlers/tests. Uma reviews interactions; it does not concurrently edit those implementation files.
- Quinn owns newly designated independent evaluation fixtures/oracle tests and review records. If implementation-test edits are necessary, transfer ownership first. Run reviewers against a stable snapshot, not files being rewritten underneath them.

Serialize backend builds/migrations and other commands that share mutable build/database state in the same checkout. Separate code tasks are not permission to run conflicting test processes. Integrate shared interfaces and generated artifacts before running consuming suites.

Every subagent receives a task packet containing:

```text
Role + exact skill/agent source:
Actual story path + work package + findings/acceptance IDs:
Checkout/baseline and existing changes to preserve:
Prerequisite contracts/decisions and completed dependency evidence:
Allowed write paths; read-only shared paths; integration owner:
Concrete deliverable and acceptance cases:
Test commands, prerequisites and expected evidence files:
Time/cost ceiling from the execution configuration; no autonomous retry loop:
Handoff recipient and required independent reviewer:
Stop/escalate on contract ambiguity, write overlap, or missing external prerequisite:
```

The coordinator uses the subagent spawn/follow-up tools to dispatch these bounded packets; experts do not recursively fan out by default. Use the inherited model unless an applicable instruction explicitly requires another. Record an execution budget ceiling before automated dispatch loops, and report exhausted/blocked tasks rather than repeatedly relaunching them. Finish each packet with changed files, commands and results, evidence paths, remaining risks, and the next dependency it unblocks. A status message alone is not a completed handoff.

### Story lifecycle and validation commands

River/Pax use their declared story creation/validation tasks. Implementation agents follow `dev-develop-story.md` through the `develop-story` skill when applicable, keeping scope/acceptance changes with their owners. Quinn uses the separate `review-story`/QA task for formal gates after implementation; a FAIL returns to the implementer and is re-reviewed. This plan review is not a completed story QA gate.

Commands below exist in this checkout; they are future execution instructions, not tests rerun during this document review. Use Java 21, a valid UTF-8 locale, the repository's pinned Node/toolchain, and the required database/container/browser prerequisites.

From `backend/`, run targeted regressions during implementation:

```bash
./gradlew test --tests 'com.citi.put.checks.studio.compile.*' --tests '*CompileStateServiceTest' --tests '*ConfigurationRevisionTest' --tests '*OptimisticSaveIT' --tests '*RevisionMigrationIT' --tests '*LegacyDataMigrationIT' --tests '*RevisionRetentionIT' --tests '*StudioCsiScopingIT' --tests '*LastRunProjectionIT'
```

Add the new story's regression classes explicitly. The integrated backend gate is `./gradlew check`, including the separate cross-replica task. Existing failures must be reproduced/recorded with owners; a focused pass cannot be reported as a full-build pass.

From `studio-runner/`:

```bash
npm run type-check
npm run lint
npm run check:pins
npm test
npm run build
npm run test:fixtures
```

From `frontend/`:

```bash
npm run type-check
npm run lint
npm test -- --run src/components/studio/review src/components/studio/run src/services/mocks/studio src/pages/ChecksStudioPage
npm run build
```

Run broader frontend tests/E2E flows required by the actual story before its gate. The runner's default tests exclude the browser-fixture and deployment tiers. Follow [runner CI stages](../../studio-runner/ci/stages.md) for in-image checks and `npm run test:deployment`, which requires Helm, a container runtime, and `STUDIO_RUNNER_IMAGE`. Keep the existing dotted-environment-key deployment failure assigned to its owner; do not skip/allowlist it to manufacture a release pass.

The live English-to-browser evaluation command does not exist yet. Quinn specifies its inputs/oracles; an assigned Dex task implements the harness; Quinn independently validates it. Its versioned CLI command, fixtures, pinned configuration and evidence output path must be added to C0/F stories and CI before claiming that F is executable.

## 9. Evidence gates and controlled rollout

Keep three separate evidence tiers: stubbed gateway/contract/failure-path tests; real-browser conformance on hand-written artifacts; and live approved-gateway English → proposal/patch → validation → confirmation → fresh full execution → independent app-state oracle. The first two do not substitute for the third. `SemanticHonestyTest` checks wording, not translation accuracy.

Pax and Aria own numerical acceptance targets for supported-intent correctness/coverage, false successes, latency at stated concurrency, and token/cost budgets; Quinn owns the measurement definitions. Freeze them before inspecting live evaluation output. Record sample size, held-out cases, repetitions, model/prompt/settings pins, full-versus-incremental paired cases and denominators. Report unsupported/clarification separately so rejecting every input cannot appear perfectly accurate. Undefined targets or unavailable live prerequisites mean release readiness remains unproven. All planted semantic-error controls must be detected.

Gage and Dara execute an expand-first compatibility rollout after local QA and required deployment authorization:

1. Apply additive migrations and deploy readers/writers that understand both the transition and final contracts, with incremental mode disabled. Test fresh and upgraded databases and protect new immutable columns/side tables.
2. Inventory/drain incompatible API publishers before identity-constraint cutover. Current code explicitly uses `ON CONFLICT (test_id, source_revision, configuration_revision, artifact_hash)`; dropping its supporting constraint while old code runs will break publication. Follow Dara's rehearsed cutover, not an assumed rolling-safe schema change.
3. Ensure all active authoring writers preserve/validate step IDs or explicitly invalidate legacy mapping. Enable the new authoring contract only when the server version mix is compatible.
4. Verify SPK-01 with the accountable gateway owners and satisfy the existing vault, identity, approved target/network, runner-image and evidence prerequisites. Keep filesystem local and AWS S3 for remote evidence as specified in the integration work; provisioning remains separate. Reconcile old Sonic references in affected deployment documents through the owning task.
5. Enable full production inference and incremental compilation through separately controlled configuration. Introduce incremental mode only after its eligibility contract and evaluation gates pass; record selected mode, fallback reasons, error/saturation rate and latency without logging secrets/prompts.
6. Rehearse disabling incremental generation to select the corrected full path. Preserve immutable revisions, histories, new IDs and compatible confirmed artifacts. Rollback cannot bypass policy revocation or restore old binaries that depend on removed constraints/discard IDs; document the minimum compatible application version. Database migrations remain forward-only.

Production enablement is not implied by this plan review. Gage prepares concrete manifests/configuration, migration sequence and evidence first; any required deployment authorization is obtained for that reviewable result. Missing cloud setup does not prevent completion of local implementation or tests.

## 10. Expert review disposition

Aria, Quinn and Dara independently reviewed this plan on 2026-09-16. Their corrections are incorporated: semantic dependencies can run backward; contracts precede new outcome implementation; incremental work depends on bounded-inference interfaces; QA defines independent oracles early; request identity differs from artifact identity; step mapping/provenance are immutable and versioned; rollout has an explicit incompatible-writer cutover.

The user-selected default remains unchanged: changed and dependent steps are recompiled, the complete artifact is validated, and a full run establishes current evidence. Unknown dependency scope means all steps are affected. C0 decisions and implementation stories are now recorded. Local execution and verification are tracked in [the execution record](studio-inference-execution-log.md). The remaining live evaluation, migration rollout and production gates are still open; expert review does not substitute for those gates.
