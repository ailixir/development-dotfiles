# Story STUDIO-OBS-011 — Final sweep: inventory re-run, leftover removal and code-health refactors

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-011 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-010 |
| Dependency notes | User decision: "at the end of the wave". ADR-SC-005 allows a start once OBS-009 is Done, in parallel with OBS-010, provided nothing on OBS-010's dated "Live surface" list is removed — so T0 waits for that list. Thin by design: compile-path removal, v1/v2 retirement, migration re-baseline and the frontend compile UI moved to OBS-012A/012B. |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (placement map row OBS-011; "Order and parallelism"; Panel evidence 5 Dev code health) · docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md (49 rows; classes A/B/C/K; guardrails G1–G12) · panel 2026-10-09 (dev: duplicated families to fold, `claim()` 606 lines / `checkCommand` 365, minified-style guided TS; QA: sleep-polled ITs 54–126 s) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §10 row OBS-011 · docs/stories/10.51.story.md (method) |
| Size | M |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, dependency-analysis]

## Story

As the team maintaining UI Studio, I want the code checked at the end of the single-path wave — every inventory row re-verified at HEAD and either removed, resolved by a named story or carried forward with an owner — and the duplicated guided/observed families folded into one, so that the branch that reaches GA has no dead code, one dispatch client, one authorization seam, readable session code and integration tests that do not sleep.

## Acceptance Criteria

Method is 10.51's: per-item re-grep at HEAD with the command recorded, count-and-name every dropped test, byte-unchanged protected paths where protection still stands, pins quoted before/after. "No item is deleted on the strength of the inventory alone" (G1). Nothing on OBS-010's "Live surface" list is touched (G12 / ADR order note).

1. **AC-1 — Inventory re-run at HEAD (G1).** Every row CLN-01…CLN-49 is re-verified with its command and result recorded per item. Rows are marked **resolved by {story}** with the verifying grep where OBS-007 (class B: CLN-32…38), OBS-012A (CLN-12, 15, 16, 17, 23, 24, 27, 28, 46, 48), OBS-012B (CLN-01, 02, 03, 04, 05, 06, 08, 09, 14), OBS-008 (CLN-11), OBS-009 (CLN-29 noted) or OBS-010 (CLN-49) closed them; a row a story was expected to resolve but did not is recorded as a delta and handled here with its class. New candidates created by OBS-007…015 (dead v2-only branches, unreferenced narratives, orphaned fixtures, `recordEvidence` if no story adopted it) are added with a class and command. Counts in the inventory are stale by definition. [inventory G1; ADR-SC-005 placement map row OBS-011]

2. **AC-2 — Remaining class A/B/C rows.** CLN-07 (`PinnedStoppedRunRecordingFacts`), CLN-19 (`ExecutionStatus.isCanonical` + `CANONICAL`), CLN-20 (`StudioService.updateAuthoring`), CLN-21 (zero-caller methods incl. the bound-but-unread `studio.execution.sse.read-interval` leaf), CLN-41 (`versions.ts` observed constants deleted or made the single source the generators read; `TOTAL_TIMEOUT_MESSAGE`) are removed with type-check + targeted tests proving behaviour neutrality (G8). Class C with a ruling recorded at T0 (G2): CLN-10 `retireLegacyStudioWorker.ts` shim — sunset date recorded (first production deploy + N weeks) or carried forward with owner @devops; CLN-40 four pointer `it.skip` entries → comments with the skipped count reconciled by name (@qa); CLN-47 `current-state.md` dated note (if OBS-012A did not add it); class B leftovers after OBS-007 swept by grep (`observedAccount`, `installCookies`, `addCookies`, `ReplayAccountAccess`, `AccountAccess`, `AWAITING_AUTH`, `AUTH_CONNECTION_REQUIRED`, `accountHandle`, `accountAuthorization`, `accountGrantId`, `accountAbi`, `accountRef`, `authConnection`, `ACCOUNT_UNAVAILABLE`/`ACCOUNT_UNKNOWN` in `frontend/src`, `studio-runner/src`, `backend/src/main`, `tools/`, `contracts/v3` → 0). An absent ruling carries the row forward in a "Carried forward" table with owner and reason — never silently dropped. [inventory class A/B/C rows, G2, G7, G8]

3. **AC-3 — `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters.** Removed from `StudioScheduleProcessor` and `StudioAcceptanceService` **only if** OBS-009 AC-6 lifted observed schedules (Q2 default); the CHECK-constraint value stays where OBS-012A's `V16__scheduling` minted it (migration immutable after the re-baseline); otherwise the row is carried forward. [ADR-SC-005 placement map row OBS-011; design §6; OBS-009 Decisions pending]

4. **AC-4 — Code-health refactors (panel dev).** (a) `GuidedRunnerClient` and `ObservedValidationClient` are folded into the dispatch client (`HttpRunnerDispatchClient`/one runner client) with one TLS/client-certificate configuration (OBS-009) — the `SecretValue` single writer (OBS-007 AC-9) and canonical body digest remain the only secret-bearing serializer; (b) `GuidedPublicationAuthorization` folds into `DispatchAuthorization`; (c) `GuidedSessionService.claim()` (606 lines) and `checkCommand` (365) are split into named steps with no behaviour change — proven by the existing `GuidedSessionIT`/`GuidedPublicationReplayIT`/OBS-015 `IncrementalRelearnIT` passing unchanged and by a before/after count of SQL statements per command; (d) runner guided TypeScript (`src/guided/**`, `run/guidedBrowser.ts`, lines up to 792 chars) is reformatted with the repository formatter with zero semantic change (AST-equality or test-suite equality stated in evidence); (e) `tools/build-studio-observed-schemas.cjs`'s byte-identical regeneration check (OBS-012A) is confirmed still wired. Each fold names the deleted class and its tests ported by name. [ADR-SC-005 Panel evidence 5; placement map row OBS-011 "code-health refactors"]

5. **AC-5 — Sleep-polled IT flake reduction (panel QA).** The guided/observed ITs that sleep-poll for 54–126 s (`GuidedPublicationReplayIT` and siblings, named at T0 from a timing run) are converted to condition-driven waits (Awaitility or an equivalent already on the classpath — no new dependency without @architect's ruling) with bounded timeouts and no reduction in asserted behaviour; total guided backend IT wall time before/after is recorded with the exact test list. [ADR-SC-005 Panel evidence 2 ("Sleep-polled ITs of 54–126 s are flake exposure"); placement map row OBS-011]

6. **AC-6 — Pins, generated files, docs, artefacts (G3, G10, G11).** Any `docs/specs/studio/openapi.yaml` edit re-anchors both pins with old/new quoted; bundles regenerated, never hand-edited; `node tools/check-studio-observed-contracts.cjs` passes. Dated records (gates, stories, `RULINGS.md`) get a dated note, not a rewrite; `account-provider-readiness-design.md` gets a header note "historical — superseded by secret-login-design.md §0"; `.ai/` (103 untracked files at inventory time) gets an explicit archive-vs-ignore decision executed archive-first; `docs/qa/evidence/**` is never staged; never `git add -A`. [inventory G3, G10, G11; 10.51 AC-13 precedent]

7. **AC-7 — Behaviour-preserving, counted, bounded.** After all removals a grep for every deleted symbol and file name returns nothing in `frontend/src`, `studio-runner/src`, `backend/src` and `tools/`, with the known exceptions listed (guard-test string literals; the three Spring setter-injection methods CLN-18) — @qa re-runs the grep independently (10.51 AC-12 method). Fresh baselines at HEAD for frontend (vitest), runner (`npm test` incl. skipped count) and backend `studio.*`; `after = baseline − named drops + named additions`, reconciled by @qa. Nothing on OBS-010's "Live surface" list is removed; CLN-30/31 (identity bypass, `local` profile — ED-02), CLN-13 (repo-wide npm hygiene), CLN-25 (JPA accessors) and CLN-42 (over-exports) are named **out of scope** so @qa does not count their absence as gaps. [inventory G5, G8, G12; ADR-SC-005 "Order and parallelism"]

## Tasks / Subtasks

- [ ] **T0 — Baselines, rulings, Live surface (AC-1, AC-2, AC-7).** Read OBS-010's "Live surface" list; re-run the inventory at HEAD; collect the AC-2 rulings (CLN-10 @po/@devops; CLN-40 @qa); take the three baselines; timing run to name the sleep-polled ITs (AC-5); @architect confirms the fold targets (AC-4) and any wait-library choice.
- [ ] **T1 — Leftovers (AC-2, AC-3).** Class A removals; class B sweep; class C per ruling; emitters per OBS-009 outcome; targeted tests; grep per item.
- [ ] **T2 — Folds and splits (AC-4).** Dispatch-client fold; authorization fold; `claim()`/`checkCommand` split; runner TS reformat; regeneration check confirmed.
- [ ] **T3 — IT flake reduction (AC-5).** Condition-driven waits; before/after wall time; exact list.
- [ ] **T4 — Docs and artefacts (AC-6).** Dated notes; historical header; `.ai/` decision archive-first; pins if touched.
- [ ] **T5 — Verification and record (AC-7).** Full affected suites; final symbol grep; reconciled counts; File List as changed; "Carried forward" table; submit to independent @qa; only QA can set Done.

## Dev Notes

- The inventory (2026-10-09, @dev read-only) analysed `c767efbe7` + uncommitted guided code; most of its rows are now owned by ADR-SC-005's earlier stories. This story's value is the **re-run** and the **folds**, not the big deletions.
- Grep hygiene (G9, updated): `observed-1` is gone with OBS-012A's tuple collapse — if it survives anywhere, that is a delta for AC-1; `resetStudioMocks` ≠ `resetStudio`; `installObservedVerifier`/`installPublicationProjection`/`initializeScheduledChecks` are Spring setter injection (CLN-18); `STUDIO_CAPABILITIES.vaultSecrets` became a server capability in OBS-008 — not a dead flag; `legacy`-named v1→v2 adapters were deleted by OBS-012A — any survivor is a delta.
- The 10.51 AC-9 protected list is largely lifted by ADR-SC-005 (recorded by OBS-012A in `decisions.md`); what remains protected is whatever OBS-010's "Live surface" names.
- `GuidedSessionService` is edited by OBS-007, 012A, 014, 015 before this story — the split must start from the final shape; no parallel owner.
- Repository conventions: preserve unrelated working-tree changes; never mark a skipped or unavailable check as passed; record every command; `.claude/rules/story-lifecycle.md` for transitions (only @qa sets Done).

### PO validation — 2026-10-09 (0.1.x) — SUPERSEDED by the ADR-SC-005 re-cut; historical

> Verdict then: **GO 9/10 — Draft → Ready**, report `.ai/STUDIO-OBS-011-po-validation.json`, on the pre-ADR scope (class A/B/C rulings table, ARCH-10 v1 retirement, 88-test review cluster). Its advisory positions are now decided by the ADR: CLN-27/28 **remove** (OBS-012A), CLN-12 **document** (OBS-012A), CLN-04/05/23 **remove** (OBS-012B/012A), ARCH-10 (OBS-012A). Still applicable: CLN-10 keep until first production deploy + 4 weeks (carried forward with @devops if none exists); `.ai/` archive-first; `docs/qa/evidence/**` never staged; T0 rulings before any deletion.

## Testing

Static: per-item grep commands recorded; `tsc --noUnusedLocals --noUnusedParameters` ad hoc on the frontend (flags off in tsconfig), runner (flags on); backend method/class reference scans. Dynamic: frontend vitest, runner `npm test` (default tier; fixtures tier for `browser.ts`/runtime touches), backend `studio.*` with the baseline filter; contract tool; OpenAPI hash tests; before/after IT wall-time log (AC-5); SQL-statement count per command before/after the split (AC-4c). Reconciliation `after = baseline − named drops + named additions` for all three suites with the runner skipped count.

## CodeRabbit Integration

### Story Type Analysis

Primary: Refactor/cleanup. Secondary: Architecture (folds). Complexity: medium.

### Specialized Agents

@dev owns execution; @architect provides the technical gate and fold rulings; @po rules CLN-10; independent @qa owns the SDC verdict, the independent grep and count reconciliation, the CLN-40 ruling and the Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with per-row requirement-to-evidence mapping and independent symbol grep.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: interface stability of the folds, no behaviour change beyond removals, pin coherence, test-count reconciliation, Live-surface boundary. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership from the inventory rows and the panel; the actual list is fixed by AC-1 at HEAD. `(del)` = deleted; `(ruling)` = only after the recorded ruling.

Leftovers
- `frontend/src/components/studio/evidence/pinnedVideoEvidenceFacts.ts` (CLN-07), `frontend/src/utils/retireLegacyStudioWorker.ts`, `frontend/src/index.tsx`, `frontend/src/main.tsx` (ruling, CLN-10)
- `backend/src/main/java/com/citi/put/checks/studio/dto/ExecutionStatus.java` (CLN-19), `StudioService.java` (`updateAuthoring`, CLN-20), `guided/translation/GuidedSourceInputResolver.java`, `internal/RunnerOutcomeCodes.java`, `secrets/VaultStudioReferenceResolver.java`, `secrets/SecretAlreadyExistsException.java`, `StudioExecutionProperties.java`, `guided/session/GuidedSessionService.java` (`recordEvidence` conditional) (CLN-21), `backend/src/main/resources/application.yml` (`sse.read-interval`)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `dispatch/StudioAcceptanceService.java` (`OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters, conditional on OBS-009)
- `studio-runner/src/versions.ts`, `studio-runner/src/run/launcher.ts` (`TOTAL_TIMEOUT_MESSAGE`), `studio-runner/scripts/write-runtime-versions.mjs` (CLN-41), `studio-runner/test/deferred.test.ts` (ruling, CLN-40)
- Class B leftover sweep targets across the four trees (expected empty after OBS-007/012A)

Folds and splits
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java` (del), `guided/publication/ObservedValidationClient.java` (del), `dispatch/HttpRunnerDispatchClient.java` (one runner client), `guided/bridge/GuidedDispatchService.java`, `guided/publication/GuidedPlanPublisher.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorization.java` (del), `dispatch/DispatchAuthorization.java`, `dispatch/ProvisionalDispatchAuthorization.java`, `guided/publication/GuidedPublicationController.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (split into named steps / collaborators under `guided/session/`)
- `studio-runner/src/guided/**`, `studio-runner/src/run/guidedBrowser.ts` (reformat only)
- Tests ported by name: `GuidedRunnerClientTest`/`ObservedValidationClientTest` → `HttpRunnerDispatchClientTest`; `GuidedPublicationAuthorizationIT` → `DispatchAuthorizationIT`

IT flake reduction
- `backend/src/test/java/com/citi/put/checks/studio/guided/**/*IT.java` named at T0 (e.g. `GuidedPublicationReplayIT`, `SecretLoginFixtureIT`, `IncrementalRelearnIT`), `backend/build.gradle.kts` (only if a wait library is approved)

Docs and artefacts
- `docs/specs/studio-observed-authoring/account-provider-readiness-design.md` (historical header), `docs/specs/studio-context/current-state.md` (dated note if absent), `.ai/` (archive-vs-ignore; `.gitignore` if "ignore"), `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` (dated "re-run at HEAD" addendum only)
- `docs/specs/studio/openapi.yaml`, `studio-runner/test/run/confinement.test.ts`, `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (only if a route changes; pins quoted)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md`

Not owned here: CLN-30/31 security paths (ED-02), `frontend/package.json` dependencies (CLN-13), JPA accessors (CLN-25), runner over-exports (CLN-42), everything on OBS-010's "Live surface" list, migrations (immutable after OBS-012A).

## PO Validation (2026-10-10) — single path (0.2.x)

**Verdict: GO (8/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-011-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 (placement map row OBS-011, "Order and parallelism", Panel evidence 2 and 5) and the cleanup inventory. Thin by design; the big deletions are OBS-012A/012B's.

**10-point checklist:** 1–10 PASS. Score deduction for three drifted anchors (below) in a story whose method is anchor accuracy — AC-1's "counts are stale by definition" and the re-run at HEAD absorb them.

**Anchors spot-checked at HEAD (working tree 2026-10-10):** inventory has 49 `CLN-` rows (CLN-01…CLN-49), guardrails G1–G12, tree `c767efbe7` (`:7`); `pinnedVideoEvidenceFacts.ts:74` `PinnedStoppedRunRecordingFacts`; `ExecutionStatus.java:25,31` `CANONICAL`/`isCanonical`; `application.yml:321` `read-interval`; `run/launcher.ts:631` `TOTAL_TIMEOUT_MESSAGE`; `GuidedRunnerClient`, `ObservedValidationClient`, `GuidedPublicationAuthorization`, `DispatchAuthorization`, `ProvisionalDispatchAuthorization`, `GuidedPublicationController`, `StudioAcceptanceService` exist; emitters at `StudioScheduleProcessor.java:273` and `StudioAcceptanceService.java:322`; `Thread.sleep` in `GuidedPublicationReplayIT`, `GuidedPublicationRaceTest`, `GuidedPlanningIntegrationTest`, `GuidedTranslationTest`, `GuidedGatewayPrivacyTest`; Awaitility is not in `build.gradle.kts` (AC-5 already gates a new dependency on @architect); longest guided TypeScript line is 1,611 chars (the panel's "792" understates it).

**Drift found (record as AC-1 deltas, fix wording before T1):**
1. **CLN-20** target `StudioService.updateAuthoring(...)` (inventory `:424-433`) is not present at HEAD — only `updateAuthoringDraft` (`:339`). Already removed or renamed; AC-1 marks it accordingly.
2. **`checkCommand` lives in `GuidedTranslationService.java:87,459`**, not `GuidedSessionService`. AC-4(c) and the "Folds and splits" File List should name `GuidedTranslationService` for that split (OBS-015 Dev Notes already say so).
3. **`.ai/` is now 108 tracked files, 0 untracked** (since `b2195c68e`). AC-6's "103 untracked files" premise is stale; the decision becomes keep-tracked vs archive, still archive-first.

**GO conditions:** T0 waits for OBS-010's dated "Live surface" list and starts only after OBS-009 is Done; no item is deleted on the strength of the inventory alone (G1) — rulings recorded first; `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters removed only if OBS-009 AC-6 lifted schedules; `after = baseline − named drops + named additions` reconciled by @qa; only independent @qa sets Done.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from the 2026-10-09 user decision ("check the code and clean up all unused/deprecated code" at the end of the wave), the cleanup inventory (49 rows, G1–G12), secret-login-design.md §6/§10 ARCH-10 and the 10.51 method; Status Draft | @sm (River) |
| 2026-10-09 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready (pre-ADR scope). Report `.ai/STUDIO-OBS-011-po-validation.json` | @po |
| 2026-10-09 | 0.2.0 | **Re-cut to the single path (ADR-SC-005) — thin final sweep.** Compile-path retirement, v1/v2 generation collapse (ex-ARCH-10), migration re-baseline and the frontend compile UI moved to OBS-012A/012B; class-C rulings table reduced to CLN-10/CLN-40/CLN-47; inventory re-run marks rows "resolved by {story}"; new code-health ACs from the panel (fold `GuidedRunnerClient`/`ObservedValidationClient` and `GuidedPublicationAuthorization`, split `claim()`/`checkCommand`, reformat guided TS, sleep-polled IT flake reduction); `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters conditional on OBS-009; Live-surface boundary kept. Prior PO GO (0.1.1) marked superseded and kept as history. Status **Ready → Draft**, pending @po re-validation | @sm (River) |
| 2026-10-10 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready (single-path draft). Report `.ai/STUDIO-OBS-011-po-validation-sp.json` | @po |
