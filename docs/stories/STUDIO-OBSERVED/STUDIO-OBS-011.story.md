# Story STUDIO-OBS-011 — Code check and removal of unused/deprecated UI Studio code

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-011 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-010 (user decision: "at the end of the wave"). Design §10 allows a start once OBS-009 is Done, in parallel with OBS-010, provided nothing OBS-010's runbook documents as live is removed |
| Source | docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md (49 rows, classes A/B/C/K, guardrails G1–G12) · secret-login-design.md §3 (v1/v2 disposition), §6 "Deferred to OBS-011 (ARCH-10)", §10 · UI-STUDIO-GA-PLAN.md §3 item 2, §6 ARCH-10 · docs/stories/10.51.story.md (method and protected-path precedent) · STUDIO-INC-001 `spec/decisions.md` §3 rows 6–7 |
| Scope (coordinator) | UI Studio code only: frontend Studio (`frontend/src/**/studio*`, Studio pages), backend `com.citi.put.checks.studio` package, `studio-runner/`, and their config, contracts, tools and docs — not the whole Checks monorepo |
| Size | L |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, dependency-analysis]

## Story

As the team maintaining UI Studio, I want the code checked at the end of the observed-authoring wave and every unused or deprecated Studio artefact removed or explicitly carried forward with a named owner, so that the branch that reaches GA contains one live guided generation, no dead account-provider machinery, coherent contract pins, and no silent behaviour change.

## Acceptance Criteria

Method is 10.51's: per-item re-grep at the story's HEAD with the command recorded, count-and-name every dropped test, byte-unchanged protected paths, pins quoted before/after. "No item is deleted on the strength of the inventory alone" (inventory G1).

1. **AC-1 — Inventory re-run at HEAD (G1).** Every row CLN-01…CLN-49 is re-verified at the story's HEAD with its command and result recorded per item; rows that OBS-007…010 resolved are marked "resolved by {story}" with the verifying grep; new candidates created by those stories (e.g. leftover v2-only code paths, dead `authConnection` handling, unreferenced narratives) are added with a class. Counts in the inventory are treated as stale by definition.

2. **AC-2 — Class A removed.** CLN-01 (`components/studio/review/*` dead cluster, keeping the live siblings named in the row), CLN-02 (its 11 test files and helpers; the one `compileWait.test.tsx` case is reworked, not deleted; `services/mocks/studio/REVIEW-SCRIPT.md`), CLN-06 (`types/studio/legacyTestIr.ts`), CLN-07 (`PinnedStoppedRunRecordingFacts`), CLN-08 (unused barrels), CLN-14 (`studioSlice.testSteps` and its `.map`), CLN-19 (`ExecutionStatus.isCanonical` + `CANONICAL`), CLN-20 (`StudioService.updateAuthoring`), CLN-21 (zero-caller methods incl. the bound-but-unread `studio.execution.sse.read-interval` leaf; `GuidedSessionService.recordEvidence` only after confirming OBS-008 did not adopt it), CLN-41 (`versions.ts` observed constants either deleted or made the single source read by the generators; `TOTAL_TIMEOUT_MESSAGE`), CLN-49 (runbook sentence). Before deleting `review/diagnostics.test.tsx`, the 10.51 RETIRED guard it hosts is relocated (e.g. into `run/runGate.test.tsx`) and shown to fail under a one-line mutation, restored (G7). [inventory §2 class A rows, G7]

3. **AC-3 — Class B swept after OBS-007.** CLN-32…CLN-38 are expected to be removed by OBS-007 AC-15 (design §6); this story verifies by grep that no `observedAccount`, `installCookies`, `addCookies`, `ReplayAccountAccess`, `AccountAccess`, `AWAITING_AUTH`, `AUTH_CONNECTION_REQUIRED`, `accountHandle`, `accountAuthorization`, `accountGrantId`, `accountAbi`, `accountRef`, `authConnection`, `ACCOUNT_UNAVAILABLE`/`ACCOUNT_UNKNOWN` reference remains in `frontend/src`, `studio-runner/src`, `backend/src/main`, `tools/` or `contracts/v3`, and sweeps the leftovers: `contracts/README.md` account rows, `guided/session/README.md:199`, the runbook sentence if still present, `docs/specs/studio/openapi.yaml:256` `x-conflict-codes` `AUTH_CONNECTION_REQUIRED` if OBS-007 left it (pin re-anchor, AC-6), and CLN-39 docs/`.ai/` disposition (AC-9). Immutable V30/V33 and frozen v1/v2 contract directories keep their historical fields (G4). If OBS-007 landed CLN-34/36 differently from design §3/§6 (e.g. kept `accountRef`/`accountAbi` as constants instead of the v3 tuple), an @architect ruling is required before this story touches them. [inventory class B rows, G2, G4; design §6]

4. **AC-4 — Class C and K\* only with a recorded ruling.** No item below is edited without the named ruling recorded in the Dev Agent Record and, where the inventory asks, an append-only dated note in `STUDIO-INC-001/spec/decisions.md`; an absent ruling carries the row forward in a "Carried forward" table with owner and reason — never silently dropped (G2).

   | Item | Ruling needed from | Options the ruling chooses between |
   |---|---|---|
   | CLN-15 `POST /tests/{id}/confirm-compile` (+ CLN-03 `confirmCompile` client/type, CLN-48 README) | @architect (ADR-002 §12 Class B contract change) | keep as API-only manual confirmation (recommended by inventory) vs remove in a dedicated contract story; `MANUAL` stays in V29 either way |
   | CLN-04 `InferenceStudio` + `studioInferenceApi` + `inferenceTypes` + `inferenceHandlers`; CLN-05 `STUDIO_AUTHORING_V2` flag; CLN-23 `EvidenceReference` DTO | @architect + @po | T-INC DEFER (decisions.md §3 row 7) stands vs superseded by the 2026-10-09 guided decision; GA plan §3 item 2 already asks to remove or quarantine `InferenceStudio` (UX-10) |
   | CLN-27 `studio.authoring.v2-enabled`, CLN-28 `studio.compile.incremental.enabled` YAML keys | @po (amend decisions.md §3 row 6 with a dated note) | keep per row 6 ("the runbook documents them") vs remove together with runbook `:131` (CLN-49) |
   | CLN-12 `POST /tests/{id}/validate-variables` (undocumented, excluded from `StudioContractTest`, no MSW handler, live Create-Check caller) | @architect + @po | document in OpenAPI (pin re-anchor) vs remove route + client + wizard button |
   | CLN-10 `retireLegacyStudioWorker.ts` shim | @po | sunset date recorded (first production deploy containing it + N weeks) vs keep |
   | CLN-11 a11y surfaces 4/5 (`studioWcagAudit.test.tsx:320-345`) | @qa (test-only) | rewrite to real states (e.g. Run-in-flight, Code tab, guided surfaces from OBS-008) and regenerate the baseline; never a silent delete |
   | CLN-40 four pointer `it.skip` entries in `deferred.test.ts` | @qa | move to comments and reconcile the skipped count by name; criteria skips stay |
   | CLN-47 `docs/specs/studio-context/current-state.md` | none (dated note) | add a dated "superseded" note (10.51 DOC-002 precedent) |
   | Any path in the 10.51 AC-9 protected list (`studioTypes.ts`, `components/studio/inference/**`, `studioInferenceApi.ts`, `inferenceTypes.ts`, `inferenceHandlers.ts`, `features/studio/authoring/**`, `studioAuthoringTransport.ts`, `EvidenceReference`, V2 engine methods CLN-24, `Legacy*` adapters, `temperature`, V18/V19, `backend/src/main/resources/**` migrations, `openapi.yaml`, `confinement.test.ts`) | @po (dated note lifting protection per path) | protection stands vs lifted vs comment-only edit (10.51 precedent: `studioTypes.ts:9` comment for CLN-06) |

   [inventory class C/K\* rows, G6; 10.51 AC-9; decisions.md §3 rows 6–7; GA plan §3 item 2]

5. **AC-5 — ARCH-10: retire guided internal v1, freeze v2.** Port first, then remove: `GuidedSessionIT` (30 `@Test`, 8× `schemaVersion: 1`), `GuidedHttpSecurityIT` (6 `@Test`, v1 URL) and `GuidedBridgeIntegrationTest` (1 sv1 case) are ported to the live wire version with the same count and names proven; then the v1 mount in `GuidedInternalController` (`/internal/v1/…`) and `GuidedInternalSecurity` matcher, the v1 `versions` block minted when `schemaVersion == 1` and the v1-only `observe`/`outcome` branches in `GuidedSessionService`, the `observed-1` fallback tuple, the `contracts/` v1 schema directory with `openapi.yaml` (observed-authoring v1) and the v1 `schemas.json` bundles, the Gradle classpath copy of v1, `GuidedContracts` v1 resolution and the contract tool's v1 read are removed; `versions.ts` loses the v1 fallback name. `contracts/v2/` is frozen as historical (README note; it remains the OBS-004…006 review basis cited by closure digests). `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters are removed only if OBS-009 lifted observed schedules (Q2 default); the CHECK-constraint value stays (immutable migration). Grep hazard: the literal `"validator":"observed-1"` (`V33:300`, `executor/observedOperations.ts`, `GuidedPublicationRepository.java`) is the **live** validator version of the v2 replay family — any v1 sweep is path-qualified to exclude it (G9). [design §3, §6 "Deferred to OBS-011"; inventory CLN-16, CLN-17, CLN-38, G9; GA plan §6 ARCH-10]

6. **AC-6 — Contract pins and generated files coherent (G3).** Any edit to `docs/specs/studio/openapi.yaml` re-anchors `studio-runner/test/run/confinement.test.ts` `BASE_SHA256` and the `StudioContractTest` op-count pin deliberately with old/new quoted; `node tools/check-studio-observed-contracts.cjs` passes after v1 retirement; runner `validator/observedSchemas.json`, `guided/schemas.json`, `guided/types.ts`, `executor/observedOperations.ts` are regenerated by `tools/build-studio-observed-schemas.cjs`, never hand-edited; the `build.gradle.kts` classpath copy matches the surviving contract directories; OpenAPI hash tests in backend and runner are green on the final tree.

7. **AC-7 — Behaviour-preserving except removals (G8).** Type-check plus the existing targeted tests prove CLN-14/19/20/21 are behaviour-neutral; CLN-11 and CLN-40 are declared test-only; CLN-10's sunset is recorded, not inferred; `git diff --stat` shows every protected `src/main` behaviour byte-unchanged unless AC-4 lifted its protection; after all deletions a grep for every deleted symbol and file name returns nothing in `frontend/src`, `studio-runner/src`, `backend/src` and `tools/`, with the known exceptions listed (guard-test string literals; `LegacyStudioAdapter.parseSteps`; `resetStudioMocks`; the three Spring setter-injection methods CLN-18) — @qa re-runs the grep independently (10.51 AC-12 method). Explicitly **not** removed: the legacy compile path (a product decision not taken) and the v1→v2 `Legacy*` adapters it uses (inventory M12).

8. **AC-8 — Count and name every dropped, ported or added test (G5).** Fresh baselines at HEAD for `frontend` (vitest), `studio-runner` (`npm test`, including the skipped count) and backend `studio.*` (same `--tests` filter as the baseline run); `after = baseline − named drops + named additions`, reconciled by @qa. Expected named drops: CLN-02 (88 tests / 11 files + 1 reworked case), CLN-32 (`observedAccount.test.ts`, if not already dropped by OBS-007), CLN-04 (14, only if ruled), CLN-15 (9 backend files, only if ruled); ports: `GuidedSessionIT` 30, `GuidedHttpSecurityIT` 6; rewrites: CLN-11.

9. **AC-9 — Docs and untracked artefacts (G10, G11).** Dated records (gates, stories, `current-state.md`, `RULINGS.md`) get a dated note, not a rewrite; live docs change with their deletion (`compile/README.md:41` if CLN-15 ruled; `studio-inference-rollout.md:131` if CLN-27/28 ruled; `contracts/README.md`; `guided/session/README.md`); `account-provider-readiness-design.md` gets a header note "historical — superseded by secret-login-design.md §0" (not deleted); `.ai/STUDIO-OBS-007-*` and the rest of `.ai/` get an explicit archive-vs-ignore decision (10.51 AC-13 precedent for `.aiox/`), archived before any deletion since they are untracked; `docs/qa/evidence/**` is never staged; never `git add -A`.

10. **AC-10 — Boundaries respected.** Nothing in OBS-010's dated "Live surface" list is removed (design §10 order note). Named **out of scope** so @qa does not count their absence as gaps: CLN-30 identity-bypass code paths and CLN-31 the `local` default profile/`LocalDevAuthFilter` (security items owned under GA plan §4.D row D-4 / ED-02 — not Studio code); retiring the legacy compile path; CLN-13 repo-wide unused npm dependencies (outside the UI Studio scope; a separate hygiene ticket); CLN-25 JPA accessors and CLN-42 over-exports (low value, non-zero risk); CLN-22/24/26/29/43/44/45/46 keep rows. [inventory G12; coordinator scope]

## Tasks / Subtasks

- [ ] **T0 — Rulings and baselines (AC-1, AC-4, AC-8).** Re-run the inventory at HEAD; collect the AC-4 rulings (one request to @architect, one to @po, one to @qa) and record them; take the three test baselines; read OBS-010's "Live surface" list; confirm OBS-007's actual removal set versus design §6.
- [ ] **T1 — Lane A: frontend class A (AC-2, AC-7).** Relocate the RETIRED guard (G7); delete CLN-01/02/06/07/08/14; rework the `compileWait` case; CLN-11/CLN-10 per ruling; type-check, lint, vitest; symbol grep.
- [ ] **T2 — Lane B: backend class A and B leftovers (AC-2, AC-3, AC-7).** CLN-19/20/21; class B leftover sweep; CLN-15/27/28/12 per ruling; targeted backend tests; `git diff --stat` for protected paths.
- [ ] **T3 — Lane R: runner class A/B leftovers (AC-2, AC-3).** CLN-41; account leftovers; CLN-40 per ruling; `npm test` with skipped-count reconciliation.
- [ ] **T4 — ARCH-10 (AC-5, AC-6).** Port the three v1-pinned test classes with count/name proof; remove v1 mount/branches/tuple/contracts/bundles/Gradle copy/tool read; freeze v2; regenerate bundles; re-anchor pins (quote old/new); contract tool green; `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters per OBS-009 outcome.
- [ ] **T5 — Docs and artefacts (AC-9).** Dated notes; live-doc updates; historical header on the account design; `.ai/` decision executed (archive first).
- [ ] **T6 — Verification and record (AC-7, AC-8, AC-10).** Full affected suites; final symbol grep; reconciled counts; File List as actually changed; "Carried forward" table; submit to independent @qa; only QA can set Done.

## Dev Notes

### Inputs and their status

- The inventory (`STUDIO-OBS-011-cleanup-inventory.md`, 2026-10-09, @dev read-only) analysed the working tree at `c767efbe7` + uncommitted guided code; its counts will drift (G1). It deletes nothing and decides nothing; classes: **A** dead now (12 rows), **B** dead after the OBS-007 rescope (8 rows; 36/37 behave like C), **C** deprecated but referenced (9 rows + 4 pointer skips), **K** keep (20 rows, of which K\* = dead but protected by a standing decision: CLN-04, 23, 27, 28).
- Design §6 lists what OBS-007 deletes (class B machinery) and what is "Deferred to OBS-011 (ARCH-10)": v1 route mounting, the `observed-1` fallback tuple, the v1 contracts directory and `openapi.yaml` guided parts, v1 `schemas.json` bundles, `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters once OBS-009 lifts schedules, "whatever the inventory agent lists". Design §3: v1 and v2 stay on disk until this story retires v1 and marks v2 historical.
- 10.51 (Done 2026-10-08) is the method precedent: per-item re-grep, count-and-name, protected paths byte-unchanged, pins quoted, dated notes on dated records, `.aiox/` ignore decision, never `git add -A`. Its AC-9 protected list and @po clarifications (comment-only edits; `studioTypes.ts` protected as a whole path) are the starting point for AC-4's last row.
- GA plan §3 item 2 asks @po to close UX-001 as superseded and "remove or quarantine `CompileReviewPanel` / `useCompileReview` / `InferenceStudio` (UX-10)"; §6 ARCH-10 confirms retiring v1 routes, `observedAccount.ts` and the account ports. The first two are CLN-01 (class A); `InferenceStudio` is CLN-04 (ruling).

### What OBS-007…010 are expected to have changed before this story starts

OBS-007 removes the account machinery (CLN-32…38 bodies), replaces the start gate (CLN-37 is *replaced*, not swept — G2), creates `contracts/v3`, V34, `openapi-v3.yaml`, and bumps the internal `openapi.yaml` (pin re-anchored there). OBS-008 creates the first guided frontend (`components/studio/guided`, `studioGuidedApi.ts`, `guidedHandlers.ts`) — the inventory's "frontend has no guided client" fact is then false; do not flag the new code as dead. OBS-009 may lift observed schedules (Q2) and adds chart/TLS code. OBS-010 publishes the "Live surface" list. If any of these did not land as expected, record the delta in AC-1 and adjust the class of the affected rows with a ruling.

### Grep hygiene (G9) — exclusions already known

`observed-1` literal in `V33:300`, `executor/observedOperations.ts:2`, `GuidedPublicationRepository.java:238,250` is live; `LegacyStudioAdapter.parseSteps` is live; `resetStudioMocks` ≠ `resetStudio`; `installObservedVerifier` / `installPublicationProjection` / `initializeScheduledChecks` are Spring setter injection (CLN-18); `legacy` in Studio code names the live v1→v2 adapters (`LegacyStudioAdapter`, `LegacyAuthoringRequest`, `LEGACY_COMPLETED/TIMEOUT/CHROME`, `attachLegacyChildRuntime`) — not candidates (M12); `STUDIO_CAPABILITIES.vaultSecrets` becomes a server-provided capability in OBS-008 — not a dead flag; `recordEvidence` may be an OBS-008 seam.

### Flyway and contract immutability (G3, G4)

V30 (`AWAITING_AUTH` CHECK) and V33 (account fields in JSON validators) cannot be edited; OBS-007's V34 replaces the functions. Any wire-shape change needs a new migration that keeps historical rows valid; otherwise fields stay as constants — record which option OBS-007 took. `confinement.test.ts:260` pins the SHA-256 of `docs/specs/studio/openapi.yaml` excluding only the three observed routes; the pin is re-anchored deliberately, never widened.

### Sizing and lanes

Three file-disjoint lanes (frontend A, backend B, runner R) plus the ARCH-10 unit, which touches backend session code, contracts, tools and runner bundles and therefore runs after the lanes. Backend Gradle runs on this checkout are serialized (wave README).

### Repository conventions

Preserve unrelated working-tree changes; never mark a skipped or unavailable check as passed; record every command. Follow `.claude/rules/story-lifecycle.md` for status transitions (only @qa sets Done).

## Testing

Static: per-item grep commands recorded; `tsc --noUnusedLocals --noUnusedParameters` on frontend (flags off in its tsconfig — run ad hoc as the inventory did, M3) and runner (flags on, M4); backend method/class reference scans (M6/M7 scripts). Dynamic: frontend vitest, runner `npm test` (default tier; fixtures tier for anything touching `browser.ts`/runtime), backend `studio.*` with the baseline filter; contract tool; OpenAPI hash tests; a11y suite after CLN-11 (regenerates `axe-results.json` — known side effect). Reconciliation: `after = baseline − named drops + named additions` for all three suites, with the skipped count for the runner. Mutation check for the relocated RETIRED guard (G7).

## CodeRabbit Integration

### Story Type Analysis

Primary: Refactor/cleanup. Secondary: Contract (v1 retirement, pins). Complexity: medium-high — many small removals, one contract retirement.

### Specialized Agents

@dev owns execution; @architect provides the assigned technical gate and the AC-4 contract rulings; @po rules protected-path and decision-table items; independent @qa owns the SDC verdict, the independent grep and count reconciliation, and the Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with per-row requirement-to-evidence mapping and independent symbol grep.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout. Focus: breaking changes and interface stability (ADR-002 classes), pin coherence, protected-path byte-equality, no behaviour change beyond removals, test-count reconciliation. Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

Proposed ownership from the inventory rows; the actual list is fixed by AC-1 at HEAD. `(del)` = deleted; `(ruling)` = only after the AC-4 ruling.

Lane A — frontend
- `frontend/src/components/studio/review/{index.ts, CompileReviewPanel.tsx, useCompileReview.ts, StepReviewList.tsx, DiagnosticsView.tsx, compileStateNarratives.ts, conflictNarratives.ts, unsupportedWorkflows.ts, artifactHash.ts, reviewTestHarness.tsx, pinnedNarratives.ts, forbiddenClaims.ts}` (del) and the 11 `review/*.test.tsx` files (del); keep `CompileElapsed.tsx`, `formatElapsed.ts`, `artifactSummary.ts`, `compileDiagnosticNarratives.ts`, `compileErrorCodes.ts`, `compilePollBounds.ts`
- `frontend/src/components/studio/run/compileWait.test.tsx` (one case reworked), `run/runGate.test.tsx` (RETIRED guard relocated here)
- `frontend/src/services/mocks/studio/REVIEW-SCRIPT.md` (del)
- `frontend/src/types/studio/legacyTestIr.ts` (del); `frontend/src/types/studio/studioTypes.ts` (comment `:9` and `ConfirmCompileRequest` — ruling)
- `frontend/src/components/studio/evidence/pinnedVideoEvidenceFacts.ts`
- `frontend/src/components/studio/runs/index.ts` (del), `frontend/src/services/mocks/studio/index.ts` (del)
- `frontend/src/store/slices/studioSlice.ts`
- `frontend/src/services/api/studioApi.ts` (`confirmCompile` — ruling; `validateVariables` — ruling), `frontend/src/services/mocks/studio/handlers.ts` (ruling), `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx` (ruling, CLN-12)
- `frontend/src/components/studio/inference/**`, `frontend/src/services/api/studioInferenceApi.ts`, `frontend/src/types/studio/inferenceTypes.ts`, `frontend/src/services/mocks/studio/inferenceHandlers.ts`, `frontend/src/utils/constants/appConfig.ts` (ruling, CLN-04/05)
- `frontend/src/utils/retireLegacyStudioWorker.ts`, `frontend/src/index.tsx`, `frontend/src/main.tsx` (ruling, CLN-10)
- `frontend/src/test/a11y/studioWcagAudit.test.tsx`, `docs/qa/accessibility/axe-results.json` (CLN-11, after OBS-008)

Lane B — backend
- `backend/src/main/java/com/citi/put/checks/studio/dto/ExecutionStatus.java`
- `backend/src/main/java/com/citi/put/checks/studio/StudioService.java` (`updateAuthoring`; `confirmCompile` — ruling)
- `backend/src/main/java/com/citi/put/checks/studio/StudioController.java` (ruling, CLN-12/15), `dto/ConfirmCompileRequestDto.java` (ruling)
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceInputResolver.java`, `internal/RunnerOutcomeCodes.java`, `secrets/VaultStudioReferenceResolver.java`, `secrets/SecretAlreadyExistsException.java`, `StudioExecutionProperties.java`, `guided/session/GuidedSessionService.java` (`recordEvidence` conditional; v1 branches in AC-5)
- `backend/src/main/resources/application.yml` (`sse.read-interval`; CLN-27/28 — ruling)
- `backend/src/main/java/com/citi/put/checks/studio/dto/EvidenceReference.java` (ruling, CLN-23)
- `backend/src/main/java/com/citi/put/checks/studio/compile/README.md` (ruling, CLN-48)
- Class B leftover sweep targets: `backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md`, `docs/specs/studio-observed-authoring/contracts/README.md`
- Backend tests named by rulings: `ConfirmCompileRouteTest`, `CompileRouteContractDivergenceTest`, `ConfirmationWriteOnceIT`, `ExactConfirmationIT`, `NoAutoConfirmTest`, `RepairLoopTest`, `SemanticHonestyTest`, `ExecutionVideoContractTest`, `StudioContractTest`, `StudioApiIT` (CLN-12/15 — ruling)

Lane R — runner
- `studio-runner/src/versions.ts`, `studio-runner/src/run/launcher.ts` (`TOTAL_TIMEOUT_MESSAGE`), `studio-runner/scripts/write-runtime-versions.mjs` (if constants become the single source)
- `studio-runner/test/deferred.test.ts` (ruling, CLN-40)
- Class B leftover sweep targets across `studio-runner/src/**` (expected empty after OBS-007)

ARCH-10 unit
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalController.java`, `GuidedInternalSecurity.java`, `GuidedSessionService.java`, `GuidedContracts.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java`, `GuidedHttpSecurityIT.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java` (ported)
- `docs/specs/studio-observed-authoring/contracts/*.schema.json` (v1, del), `contracts/fixtures.json` (v1, del), `docs/specs/studio-observed-authoring/openapi.yaml` (v1, del or archived per ruling), `contracts/README.md`, `contracts/v2/README.md` (historical note)
- `backend/build.gradle.kts` (classpath copy), `tools/check-studio-observed-contracts.cjs`, `tools/build-studio-observed-schemas.cjs`
- `studio-runner/src/guided/schemas.json`, `guided/types.ts`, `validator/observedSchemas.json`, `executor/observedOperations.ts` (regenerated), `studio-runner/src/versions.ts`
- `studio-runner/test/run/confinement.test.ts` (pin re-anchor if `openapi.yaml` changes), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (op-count pin)
- `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters (locations fixed at AC-1; conditional on OBS-009 Q2 outcome)

Docs and artefacts
- `docs/specs/studio-observed-authoring/account-provider-readiness-design.md` (historical header note), `docs/specs/studio-context/current-state.md` (dated note), `docs/runbooks/studio-inference-rollout.md` (ruling, CLN-27/28/49), `docs/runbooks/studio-guided-authoring.md` (only if the account sentence survived OBS-007/010)
- `.ai/` (archive-vs-ignore decision; `.gitignore` if "ignore"), `docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md` (append-only dated notes for rulings)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md`, `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` (dated "re-run at HEAD" addendum only)

Not owned here: CLN-30/31 security paths, `frontend/package.json` dependencies (CLN-13), JPA accessors (CLN-25), runner over-exports (CLN-42), everything in OBS-010's "Live surface" list.

## PO Validation (2026-10-09)

**Verdict:** GO — readiness 9/10 (confidence High). Status Draft → Ready. Report: `.ai/STUDIO-OBS-011-po-validation.json`. Validator: Pax (@po).

**Verified at `path:line` (2026-10-09):** the review cluster is exactly the 12 production files and 11 `.test.tsx` named in Lane A, with the six keep-siblings present; RETIRED guard at `review/diagnostics.test.tsx:256-260`; `compileWait.test.tsx:245-248` renders `CompileReviewPanel` in one case; `studioWcagAudit.test.tsx:320-345` surfaces 4/5 and pinned keys `:99-100`; `studioSlice.ts:4,22,38` `testSteps`; `ExecutionStatus.java:25,31`; `StudioService.java:426` `updateAuthoring`; `application.yml:321` `sse.read-interval`; `versions.ts:43-47` observed constants (`:46` `observed-1`); `launcher.ts:631` `TOTAL_TIMEOUT_MESSAGE`; `GuidedInternalController.java:18-19` dual mount; `GuidedInternalSecurity.java:56`; `GuidedSessionService.java:339-345` v1 `versions` block; `GuidedSessionIT` 30 `@Test` / 8× `schemaVersion 1`; `GuidedHttpSecurityIT` 6 `@Test`, v1 URL `:44`; `GuidedBridgeIntegrationTest` exists; `build.gradle.kts:340-343` classpath copy including v1; `GuidedContracts.java:123-131` v1 resolution; `tools/check-studio-observed-contracts.cjs:985` v1 read; `confinement.test.ts:260` `BASE_SHA256`; `openapi.yaml:256` `AUTH_CONNECTION_REQUIRED`; G9 hazards at `V33:300`, `observedOperations.ts:2`, `GuidedPublicationRepository.java:238,250`; `guided/session/README.md:199`; `studio-inference-rollout.md:131`; `compile/README.md:41`; `decisions.md` §3 rows 6–7; `InferenceStudio.test.tsx` = 14 tests; 10.51 story exists. A static `it(` count over the 11 review tests gave 82 today versus the inventory's 88 — confirming AC-1's "counts are stale by definition" and AC-8's fresh-baseline rule.

**10-point checklist:** title ✓ · description ✓ · testable ACs ✓ (per-row grep with command recorded; `after = baseline − drops + additions`; mutation check for the relocated guard; byte-equality via `git diff --stat`) · scope ✓ (UI Studio only; AC-10 names what is out) · dependencies ✓ (OBS-010; may start after OBS-009 Done without removing anything in OBS-010's "Live surface") · complexity ✓ (L; three file-disjoint lanes plus the ARCH-10 unit) · value ✓ · risks ✓ (G1–G12, G9 hazards, Flyway immutability) · Done criteria ✓ (every row removed **or** carried forward with owner and reason; @qa re-runs the grep) · alignment ✓ (design §3/§6/§10 ARCH-10, GA §3 item 2 / §6, inventory classes). Executor `dev` / gate `architect` valid.

**Done-definition accepted:** "all unused/deprecated code" = every CLN row re-verified at HEAD and either removed (A/B), removed under a recorded ruling (C/K\*), or carried forward with a named owner and reason — nothing dropped silently, nothing in OBS-010's Live surface touched.

**PO positions for AC-4 (advisory now; binding only when recorded at T0 together with the co-ruler where one is named):**
- CLN-27/28 YAML keys: **remove**, together with `studio-inference-rollout.md:131` (CLN-49); @po appends the dated note amending `decisions.md` §3 row 6 at T0.
- CLN-10 shim: **keep** until the first production deploy containing it; sunset = that deploy + 4 weeks; carried forward with owner @devops if no production deploy exists at HEAD.
- CLN-12 `validate-variables`: PO position **document in OpenAPI** (the Create-Check caller is live; removal is a product decision not taken) — needs @architect concurrence for the pin re-anchor.
- CLN-04/05/23 (`InferenceStudio`, `STUDIO_AUTHORING_V2`, `EvidenceReference`): PO position **lift protection for the frontend inference files and the flag** (GA plan §3 item 2 already asks for removal/quarantine; the 2026-10-09 guided decision supersedes the UI half of T-INC row 7); backend V2 engine methods (CLN-24) stay DEFER. Needs @architect concurrence; `decisions.md` row 7 gets a dated note.
- 10.51 AC-9 protected paths: protection stands except comment-only edits (`studioTypes.ts:9`) and the paths lifted by the rulings above.

**GO conditions:**
1. T0 collects all AC-4 rulings before any Lane A/B/R deletion; an absent ruling moves the row to "Carried forward".
2. T4 (ARCH-10) names the live wire version after reading OBS-007's actual landing (v3 public contracts; internal mount version as left by OBS-007) and ports the three test classes with count/name proof before any v1 removal.
3. `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters are removed only if OBS-009 AC-5 lifted schedules (Q2 default); otherwise the row is carried forward.
4. The `.ai/` decision executes archive-first; `docs/qa/evidence/**` is never staged; no `git add -A`.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from the 2026-10-09 user decision ("check the code and clean up all unused/deprecated code" at the end of the wave), the cleanup inventory (49 rows, G1–G12), secret-login-design.md §6/§10 ARCH-10 and the 10.51 method; scope limited to UI Studio code; rulings table for class C/K\*; explicit out-of-scope list; Status Draft | @sm (River) |
| 2026-10-09 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready | @po |
