# Code editing and execution versioning research

Owner: Atlas / `@analyst`, spec pipeline dependency research. Initial research date: 2026-10-04; aligned to formal requirements at 2026-10-05T02:37:45.124019Z. Status: **Phase 3 research complete**. Final alignment at 2026-10-05T02:40:35.950374Z covers requirements.json, complexity.json (COMPLEX, score 19) and data-versioning-review.md; input hashes are recorded in research.json. These findings inform assessment; they do not approve a design or implement a feature.

## Evidence and scope

Repository baseline: `13ec11d1c10762f6dd435bade54627fe88f906a2`, branch `brunobuger/ui-studio`. Reads include existing uncommitted changes; none were reset or edited. No compilation, browser execution, database migration, security assessment, latency measurement or compatibility test was performed. VERIFIED means directly read in this worktree or official documentation. INFERRED means a design conclusion drawn from those facts. PROPOSED means a decision requiring the architect/spec to resolve.

The invoked task is `.aiox-core/development/tasks/spec-research-dependencies.md`. Context7 and EXA were absent from available tool metadata; official documentation was fetched using the available web tool. The task's technical preferences path does not exist; `.aiox-core/data/technical-preferences.md` was read instead. Its generic active Next.js preset does not describe this repository. The supplied AGENTS.md and actual package files take precedence: React/MUI, Java/Spring, PostgreSQL/Flyway and the existing Node runner. No new dependency is required by the recommended direction.

## What exists

| Finding | Status | Evidence |
| --- | --- | --- |
| PRD section 5.2 promises reviewing generated source and confirming an exact immutable revision; relevant edits need reconfirmation. Python export is retired. It does not explicitly promise editable source or source download. | VERIFIED | `PRD.md:99`, `:110`, `:128` |
| Code tab shows only the independently fetched confirmed artifact and its server hash; its code blocks are read-only. It distinguishes the bounded language from a standalone file. | VERIFIED | `frontend/src/components/studio/CodeTab.tsx:14`, `:53`, `:73`, `:172` |
| Runner accepts a restricted TypeScript-shaped language: bounded awaited calls on page/expect/vars. The AST validator converts accepted calls to typed operations. Unsupported statements, receivers, imports, type arguments and methods are refused. | VERIFIED | `studio-runner/src/validator/ast.ts:66`, `:96`, `:153`, `:188`; `studio-runner/src/validator/language.ts` |
| Artifact steps must remain index-aligned; originalText must match the saved source line exactly. Referenced variables/secrets must satisfy saved declaration/policy constraints. Validation does not establish that every arbitrary English statement semantically matches the edited operation. | VERIFIED | `studio-runner/src/validator/schema.ts:152`, `:160`; `studio-runner/src/validator/ast.ts:182`; `studio-runner/src/validator/index.ts:43` |
| The browser child receives typed data and explicitly refuses source-bearing messages. | VERIFIED | `studio-runner/src/run/protocol.ts:4`; `studio-runner/src/run/childRuntime.ts:26`, `:655` |
| Revisions already store source, hashes, configuration, references, provenance and confirmation. SQL triggers protect the columns explicitly enumerated in the migration. Later additions must be included in that protection. | VERIFIED | `backend/src/main/resources/db/migration/V12__ui_test_revisions_and_compile_state.sql:16`; `V24__studio_reference_policy.sql:23`; `backend/src/main/java/com/citi/put/checks/studio/entity/UITestRevision.java:17` |
| The compiler's existing identity/deduplication and publish conditions primarily use source/configuration revisions, artifact hash and selected intent/policy metadata. Manual authority is absent. | VERIFIED | `backend/src/main/java/com/citi/put/checks/studio/compile/CompileStateService.java:48`, `:62`, `:297`, `:751` |
| Acceptance resolves the confirmed revision and pins its ID to the execution. Dispatch jobs and result manifests carry revision/hash identity. | VERIFIED | `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java:195`, `:200`, `:241`; `dispatch/RunJob.java:61`; `studio-runner/src/run/manifest.ts:60` |
| Generation fingerprint includes model/settings/prompt and runtime/policy versions. Manual source validation needs its own truthful lineage; it should not claim new model generation. | VERIFIED / INFERRED | `backend/src/main/java/com/citi/put/checks/studio/compile/CompilePipeline.java:444`, `:499` |
| Runner uses playwright 1.63.0 and typescript 5.9.3; current version constants include artifact 1, validator/executor 2.0.0, syntax reference 2.1.0. Monaco and CodeMirror are absent from frontend dependencies. | VERIFIED | `studio-runner/package.json`; `studio-runner/src/versions.ts`; `frontend/package.json` |

## Alternatives

The effort ratings below are relative judgments from the inspected boundaries, not delivery estimates.

| Option | Execution and history | Benefits | Costs and limits | Research recommendation |
| --- | --- | --- | --- | --- |
| Native immutable revisions with a separate editable draft | User edits bounded per-step code; server validates the entire artifact; review confirms exact new immutable revision; execution pins that revision. | Reuses existing storage, CSI authorization, validator, evidence and dispatch boundaries. Manual provenance and a parent revision make edits inspectable. No repository setup required. | Requires new draft/authority semantics, concurrency protection, validation/confirmation flow and contract amendments. Language remains the supported subset. | Prefer for this enhancement. |
| Git repository as execution source | Resolve approved commit, materialize source/configuration/dependencies and pin all execution inputs. | Familiar developer review/diff/branch workflows; useful for a future repository-based product. | Adds repo credentials/authorization, availability, revision ingestion, dependency pinning and dual-authority reconciliation. Git commit identity alone does not pin browser/runtime, external values or secret use. Mutable refs must resolve to an object identity before acceptance. | Consider optional export/mirror later; avoid as the initial execution authority. |
| Mutable code override or request-body source | Run uses the latest override or client-submitted editor text. | Small apparent UI/API surface. | Breaks exact confirmation and historical reproducibility unless converted to immutable, validated revisions first; races with compilation and downloads. It then becomes the native model anyway. | Avoid as execution authority. |
| Full Playwright TypeScript source mode | Run arbitrary files, imports, helper modules and Playwright Test lifecycle. | Maximum developer flexibility and potential standalone portability. | Current validator and child protocol reject this surface. Requires a separate execution isolation design, dependency strategy, bounded reporting/cancellation/evidence integration and new contract. Type checking and a VM context do not replace authorization/isolation. | Treat as separately scoped advanced mode after explicit product demand. |

Git's documentation distinguishes symbolic refs from object names and supports inspecting earlier ref values. The conclusion to pin a resolved object before execution is an inference, not a statement that every Git-hosting policy behaves identically. [Git revision syntax](https://git-scm.com/docs/gitrevisions).

Playwright transforms TypeScript and can run despite noncritical type errors; the documentation recommends running tsc separately. This means a future full-source mode needs explicit validation beyond invoking Playwright. It does not prove the pinned 1.63.0 installation is compatible with any proposed package export. [Playwright TypeScript documentation](https://playwright.dev/docs/test-typescript).

Node 22 documentation states that node:vm is not suitable as a security mechanism for untrusted code. A full-source mode cannot be justified solely by placing the file in a VM context. [Node 22 VM documentation](https://nodejs.org/docs/latest-v22.x/api/vm.html).

## Proposed execution identity

Keep the exact artifact hash as a **content identity**, the revision ID as a **snapshot identity**, and execution ID as a **run identity**. Equal artifact bytes need not imply equal lineage, confirmation, configuration, policy or authority. Add a truthful origin such as GENERATED or MANUAL, parentRevisionId, edited actor/time and validation versions. Do not fabricate an LLM call or generated provenance for manual edits.

The two draft-counter options were evaluated; Dara’s persistence review recommends option 1, separate codeDraftRevision. Final architect/spec adoption remains a proposal:

1. **Separate codeDraftRevision.** Preserve sourceRevision as English/authoring identity; add a code edit counter/authority generation to validation capture, publish, confirm and readiness comparisons. Explicit but expands contracts and identity rules.
2. **Expand sourceRevision to cover every executable-authoring input, including manual code.** Fewer independent counters, but its meaning must change consistently across every save/hash/capture path and frontend adapter. English-only comparisons cannot remain unchanged.

Either is valid only with a complete concurrency model. An editor save or authority transition must make a late generated compile ineligible to publish over that edit. Server-owned canonicalization must calculate the artifact hash; the client must display/replay it for exact confirmation. Updating SQL immutability and deduplication rules is required when introducing lineage/authority fields. Same-save/request idempotency replays the original event; intentional independent saves/preparations retain distinct authorship even when artifact hashes match. Candidate uniqueness must be captured-request/event based, not content based.

The existing PostgreSQL conditional-update approach is suitable precedent: concurrent target-row updates re-evaluate the WHERE condition after waiting at Read Committed. The actual new predicates still require race tests; the documentation does not prove a multitable publication transaction correct. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

## Editing, regeneration and export boundaries

Recommended first release: edit each existing step's code while retaining its saved English, step order and immutable base identity. Validate the **whole** combined artifact with the existing allowlist/reference rules; syntax-only success cannot claim semantic agreement with the English. Show operation summaries derived from the edited validated operations and mark the English as context. Structural step edits stay in Steps and require an explicit reconciliation/regeneration path. English/configuration/policy changes stale the relevant code candidate; they must not silently discard manual work or silently run an older confirmation.

Manual validation must leave the user's source unchanged and report diagnostics; it should not send the code through model repair. In the current flow, Run prepares/auto-confirms generated candidates. FR-3 requires generated and manual preparation to stop at awaiting confirmation; current generated auto-confirm must be removed in the proposed implementation. Confirmation must be an explicit author action tied to exact server identity. Current compiler incremental-baseline assumptions were designed around generated output. Initially exclude manual candidates from incremental generation until a tested mixed-origin reconciliation rule exists; this is a conservative scope recommendation, not a finding that every possible incremental design is unsafe.

Offer a useful download without misrepresenting the runtime:

- An authorized, server-generated revision package can contain the exact artifact, bounded step source, safe declaration names, revision/hash identity, nonsecret compatible runtime metadata and schema/export version. Frozen revision reads must avoid mixing current draft English with earlier confirmed code.
- A plain `.steps.ts` view/export contains bounded instruction text and must be labeled accordingly. It is not independently executable.
- A portable `.spec.ts` wrapper is a **derived export**, with its own adapter version/hash and supplied bindings/setup. It is not the exact Studio artifact or proof of identical evidence/authorization behavior. It needs a separately reviewed mapping for vars, secrets, browser settings and assertions. Current runner installs `playwright`, not `@playwright/test`; a Test-based export therefore needs explicit consumer setup rather than assuming that package is installed here.
- FR-2 and FR-7 select persisted, identified revision download for the first slice; unsaved draft download is outside that scope. Generating a portable package remains outside the first slice under CON-5 and OQ-1.
- Exclude resolved secrets, runtime credentials and unrelated current variable values. A recorded hash is an integrity label; it does not independently attest authorization or trust.

## Open evidence gaps

No live runner/backend deployment, installed dependency compatibility, export adapter, arbitrary-source threat model, permission matrix for source downloads, history-retention policy or quantitative effort estimate was validated. The data review resolves the recommended counter to separate codeDraftRevision; final architecture must adopt complete authority, checkpoint, migration and confirmation semantics. Source portability and any elevated role remain product assumptions. Formal Phase 3 is complete against recorded inputs; no implementation approval is implied.

## Formal requirement alignment

FR-1/FR-3/FR-6 map to distinct editable draft capture, whole-artifact validation, explicit confirmation and complete freshness predicates. FR-2/FR-7 map to immutable revision downloads with truthful persisted/working/candidate/confirmed states. FR-4 maps to frozen ordered step mapping and operation-derived summaries. FR-5 maps to native immutable lineage and accepted execution pinning. FR-8/NFR-1 map to CSI/reference authorization and the existing typed-operation boundary. NFR-2 needs race tests when implemented; NFR-3 needs keyboard/focus diagnostics verification. CON-1 requires explicit supersession of ADR-002 section 30 for the new working/candidate source view. CON-3 preserves existing dependencies; CON-4 keeps this work proposal-only; CON-5 excludes portable export/import/Git/rollback from the first slice. ASM-1/ASM-2/ASM-3 remain product assumptions rather than verified enterprise policy.

Current dirty-worktree generated publication auto-confirms (CompileStateService.java:281-303); FR-3 intentionally changes this observed behavior. No runtime was exercised, and this document does not treat the proposed behavior as already delivered.


## Data-review alignment and final assessment

Complexity is COMPLEX with score 19; research is therefore required, not skipped. Dara’s `data-versioning-review.md` supports separate monotonic `codeDraftRevision` and explicit GENERATED/MANUAL mode while retaining source/configuration/context identity meanings. Manual checkpoints persist bounded invalid or never-validated source separately from executable revisions. Mode switches retain saved manual work; they advance authority generation and invalidate readiness. Parent lineage must stay distinct from incremental baseline and must enforce same-test/CSI ownership.

Use the existing captured preparation infrastructure for both generated compilation and manual validation. One successful distinct request creates one immutable revision; same-request replay is idempotent, while equal-content independent events retain actor/parent/request identity. The current content-reuse writer and V24 uniqueness must be reconciled with the manually staged V19 require-request cutover, after draining incompatible publishers. New manual candidates cannot bypass that captured-request invariant. Restore all-column revision protection apart from first confirmation, with negative tests covering every introduced column. This closes the omission risks already identified in V18 versus V21/V24.

FR-6 now explicitly pins the client’s intended execution revision/hash/freshness tuple. Persisted readiness alone does not protect against a different newer confirmation being selected after a UI read; execute must reject that mismatch rather than retarget. FR-7 requires last-run source through the execution’s accepted immutable revision. FR-1 requires page-level dirty/navigation protection and working-buffer retention across tabs/background reads. These are now included in research.json coverage.

Download’s exactness means identical artifact content and step code strings. JSON canonicalization may change whitespace/key order from a prior HTTP response; the canonical artifact hash must remain separate from the safe metadata envelope bytes. This is consistent with Dara’s review and avoids an unsupported original-transport-byte promise.


## Supplemental alignment after QA amendments

Reviewed at 2026-10-05T02:51:03.482298Z. The original Phase 3 timestamp and input hashes in `research.json.inputAlignment` intentionally remain historical: they identify what was available when Phase 3 was finalized. `supplementalAlignment` records the current requirements and spec iteration 2 hashes after later QA amendments. This review does not imply the initial research studied those later changes.

The later full-F writer/settlement matrix explicitly includes existing Steps/context/config/authoring writers, which compare caller expected freshness to persisted state, and every generated/manual success/failure/deadline/cancellation/abandonment settlement, which checks immutable captured request identity and freshness. Stale status/time-selected sweep work must not clear newer manual work or revoke an unchanged compatible confirmation. Optional preparation failure alone does not revoke that confirmation; compileStatus is not readiness authority. AT-6 now tests these existing paths without introducing a cancellation feature. Page Save also specifies ordered authoring then code requests, retained local buffers and truthful partial failure with Validate/Run blocked until resolved.

These amendments clarify the previously recommended exhaustive predicate audit, captured-event publication and independent readiness model. All research conclusions remain unchanged: native immutable execution authority, separate codeDraftRevision/mode, explicit exact confirmation, operation-only runtime and persisted revision download. No application changes or runtime tests were performed for this supplemental review.
