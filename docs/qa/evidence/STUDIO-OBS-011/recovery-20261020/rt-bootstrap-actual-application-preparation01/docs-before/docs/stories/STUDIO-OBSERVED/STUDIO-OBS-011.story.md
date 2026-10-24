# Story STUDIO-OBS-011 — Final sweep: inventory re-run, leftover removal and code-health refactors

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-011 |
| Status | **InProgress** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-010 |
| Dependency notes | User decision: "at the end of the wave". ADR-SC-005 allows a start once OBS-009 is Done, in parallel with OBS-010, provided nothing on OBS-010's dated "Live surface" list is removed — so T0 waits for that list. Thin by design: compile-path removal, v1/v2 retirement, migration re-baseline and the frontend compile UI moved to OBS-012A/012B. **Amended 2026-10-15 (user decision):** this story no longer waits for OBS-009 Done. It may start once two things hold: OBS-009's locally achievable ACs are implemented and validated, and OBS-010's dated "Live surface" list exists. See "Start-condition amendment" under PO Validation. |
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

1. **AC-1 — Inventory re-run at HEAD (G1).** Every row CLN-01…CLN-49 is re-verified with its command and result recorded per item. Rows are marked **resolved by {story}** with the verifying grep where OBS-007 (class B: CLN-32…38), OBS-012A (CLN-12, 15, 16, 17, 23, 24, 27, 28, 46, 48), OBS-012B (CLN-01, 02, 03, 04, 05, 06, 08, 09, 14), ~~OBS-008 (CLN-11)~~ [Struck 2026-10-17 by @po (Pax), ADR-SC-006: OBS-008 no longer resolves CLN-11; see "PO note — accessibility scope" below], OBS-009 (CLN-29 noted) or OBS-010 (CLN-49) closed them; a row a story was expected to resolve but did not is recorded as a delta and handled here with its class. New candidates created by OBS-007…015 (dead v2-only branches, unreferenced narratives, orphaned fixtures, `recordEvidence` if no story adopted it) are added with a class and command. Counts in the inventory are stale by definition. [inventory G1; ADR-SC-005 placement map row OBS-011]

   **AC-1 candidate — CLN-F2 (class C): the historical V18 publication fixture adapter (inherited from STUDIO-OBS-015; Dex triage `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/fullsuite-triage-BC/review.md` "Retirement flags"; placed by @po (Pax) 2026-10-16, record `execution-20261015/po-triage-followups/`).**

   a. **Facts.** @po verified these on 2026-10-16 by sha256. Re-verify them at HEAD at T0.
      - The adapter is a second, legacy fixture write path that publishes against a database stopped at Flyway V18. It is test-only.
      - Sites in `support/GuidedPublicationEvidenceFixture.java` (`52991706…`):
        - `freezeHistoricalV18Source` `:43-44`;
        - `:140`;
        - `requireV18` `:313-321`. It refuses any database that has V19+ stores.
      - Sites in `guided/publication/GuidedPublicationMigrationTest.java` (`3f8d75c2…`):
        - `:1064`;
        - `publishHistoricalV18Observed` `:1298`. Its javadoc says "current runtime compatibility is not claimed".
        - `:1428`, `:1570`;
        - `commitHistoricalV18` `:1607-1662`.
      - Sites in `InferenceMigrationIT.java` (`e1e4acd9…`): `prepareHistoricalV18Observed` `:187`, `:190`, and `publishHistoricalV18Observed` `:299`.
      - None of this exists at the `734ad704f` baseline. STUDIO-OBS-015's final design kept it on purpose ("historical V18 target stays").

   b. **Ruling first (G2).** @architect rules with @data-engineer, and @po does not pick. The question is whether upgrade-with-data coverage at the V18 boundary is still required.
      - [I] No environment holds a re-baselined V18 population. Studio is unreleased, and ADR-SC-005 "Operations" says "Dev databases recreated after D-B".

   c. **If retired.**
      - Port `InferenceMigrationIT`'s V18 cases to the head writer, as `InferenceMigrationLatestIT` already does, or retire each case by name with a covering test cited. Under ADR-SC-005 "Tests", cases are ported, not dropped.
      - Delete the adapter.
      - A grep for `HistoricalV18|requireV18` in `backend/src` returns 0.
      - Counts reconcile under AC-7.

   d. **If kept.** List the adapter as a named AC-7 known exception with the ruling's reason. If no ruling is obtained, it goes to the "Carried forward" table with owner @architect and @data-engineer, and it is never dropped silently. It is not release-blocking.

2. **AC-2 — Remaining class A/B/C rows.** CLN-07 (`PinnedStoppedRunRecordingFacts`), CLN-19 (`ExecutionStatus.isCanonical` + `CANONICAL`), CLN-20 (`StudioService.updateAuthoring`), CLN-21 (zero-caller methods incl. the bound-but-unread `studio.execution.sse.read-interval` leaf), CLN-41 (`versions.ts` observed constants deleted or made the single source the generators read; `TOTAL_TIMEOUT_MESSAGE`) are removed with type-check + targeted tests proving behaviour neutrality (G8). Class C with a ruling recorded at T0 (G2): CLN-10 `retireLegacyStudioWorker.ts` shim — sunset date recorded (first production deploy + N weeks) or carried forward with owner @devops; CLN-40 four pointer `it.skip` entries → comments with the skipped count reconciled by name (@qa); CLN-47 `current-state.md` dated note (if OBS-012A did not add it); class B leftovers after OBS-007 swept by grep (`observedAccount`, `installCookies`, `addCookies`, `ReplayAccountAccess`, `AccountAccess`, `AWAITING_AUTH`, `AUTH_CONNECTION_REQUIRED`, `accountHandle`, `accountAuthorization`, `accountGrantId`, `accountAbi`, `accountRef`, `authConnection`, `ACCOUNT_UNAVAILABLE`/`ACCOUNT_UNKNOWN` in `frontend/src`, `studio-runner/src`, `backend/src/main`, `tools/`, `contracts/v3` → 0). An absent ruling carries the row forward in a "Carried forward" table with owner and reason — never silently dropped. [inventory class A/B/C rows, G2, G7, G8]

   **AC-2 obligation — F-1: the translation-absent admission branch in `GuidedSessionService` (inherited from STUDIO-OBS-015; @architect bridge ruling `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md` §6 F-1, security LOW / evidence MEDIUM, 2026-10-16; placed by @po (Pax), record `execution-20261015/po-bridge-disclosure/`).** This is dead legacy code under the single-path rule (ADR-SC-005: "no legacy path, no compatibility layer"). Its removal is behaviour-neutral in the production composition. It adds a new AC-1 candidate, **CLN-F1**, of class **C**: it is still referenced, but only by tests, so the tests migrate first and the decision is recorded here. This obligation does not change AC-2's meaning.

   a. **Facts.** @po verified these on 2026-10-16 against `GuidedSessionService.java` sha256 `d10ec5cb…`. Re-verify them at HEAD at T0.
      - `if (translation != null && translation.exists(id))` appears at `:353`, `:799`, `:832`, `:1375` (admission, before `attachAdmission`) and `:1923`.
      - Production always installs translation. The session bean in `GuidedSessionConfiguration` calls `installTranslation(translation, questions)` with no property condition. `studio.guided-authoring.translation.enabled` gates only `GuidedTranslationService`, `GuidedTranslationCoordinator` and `GuidedPlanningController`.
      - `start` initialises translation state in the same transaction (`:691-696`) whenever the access is `GuidedProductionSessionAccess`. That is the only main `GuidedSessionAccess`, registered `@ConditionalOnMissingBean`.
      - The branches are therefore unreachable in production. They are reachable only through test compositions. `GuidedSessionIT` (44 `@Test` at sha256 `4c5236fd…`) and `GuidedServiceTransportFaultIT` (20 `@Test` + 1 `@ParameterizedTest` at sha256 `7d711a43…`) use them to admit hand-crafted proposals.
      - Correction to the ruling's "never call `installTranslation`": `GuidedServiceTransportFaultIT.translationTeardownService` (`:4018-4025`) installs translation for its H8 teardown cases. @po has not verified whether those cases admit through the branch. Re-check this at T0.

   b. **Migrate first (port, not drop; ADR-SC-005:57).** Move positive admissions in `GuidedSessionIT` and `GuidedServiceTransportFaultIT` to planner-issued obligations. Use the ruling §4 `reserve`/`admit` pattern under rules R-1…R-5:
      - Seed no plan, obligation, admission, manifest or translation-state row.
      - Make no store-level `acceptPlan`, `reserveObligation` or `attachAdmission` call.
      - Keep hand-crafted proposals only as negative probes (R-4).
      - Keep method names and counts, with the before and after counts recorded by name.
      - Dropping or retiring a case needs an @architect ruling that cites a covering test to the R-6 standard, as was done for the bridge.

   c. **Then remove.**
      - Make the admission gate unconditional. The ruling recommends `require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` before `attachAdmission`.
      - Remove the translation-absent arms at the other four sites.
      - At T0, @architect rules two things: the exact refusal at each site, and whether the `access instanceof GuidedProductionSessionAccess` conditional at `:691-695` goes in the same change. @po does not pick.
      - Add a negative test: admission for a session with no translation state returns `409 RUNTIME_INCOMPATIBLE` and writes nothing.

   d. **Proof (G8; no AC-7 exception).**
      - The facts in a, re-verified at HEAD, show the production composition does not change.
      - The migrated classes pass, and the counts reconcile by name.
      - `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest` and `GuidedPublicationReplayIT` pass unchanged.
      - A grep for `translation != null &&` in `GuidedSessionService` returns 0, or each remaining hit is listed with its reason.

   e. **Sequencing with AC-4 (c).**
      - F-1 lands in T1, before the T2 `claim()`/`checkCommand` split.
      - The split's proof ("`GuidedSessionIT` … passing unchanged") uses the migrated post-F-1 classes as its unchanged baseline, recorded by sha256.
      - `GuidedSessionService` keeps one owner at a time (Dev Notes).

   f. **Related ruling assignments to this story (same ruling, §4.1 and F-3).** Both are behaviour-neutral, with names and counts unchanged.
      - The helpers left in `GuidedBridgeIntegrationTest` after the OBS-015 migration are removed if they have no remaining reference (AC-1 candidate).
      - The roughly 800 lines of bridge static fixture duplicated into `GuidedBridgePlannedIT` are folded into one shared test fixture. The planning IT `Environment` is the same pattern.

   g. **Not release-blocking.** The branch is unreachable and the ruling rates the security impact LOW. If this obligation is not done here, it goes into the "Carried forward" table with owner @dev and @architect, and it is never dropped silently. Until it lands, citations into `GuidedSessionIT` and `GuidedServiceTransportFaultIT` credit post-admission behaviour only, never admission authority (STUDIO-OBS-015 Dev Agent Record, PO disclosure 2026-10-16).

3. **AC-3 — `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters.** Removed from `StudioScheduleProcessor` and `StudioAcceptanceService` **only if** OBS-009 AC-6 lifted observed schedules (Q2 default); the CHECK-constraint value stays where OBS-012A's `V16__scheduling` minted it (migration immutable after the re-baseline); otherwise the row is carried forward. [ADR-SC-005 placement map row OBS-011; design §6; OBS-009 Decisions pending] *(2026-10-18, @po (Pax), T0 ratification P-1: resolved by STUDIO-OBS-009 lane S; 0 emitters in `backend/src/main/java`, V16 CHECK stays; re-opens if the user overrides A17. See "T0 ratification (PO) — 2026-10-18".)*

4. **AC-4 — Code-health refactors (panel dev).** (a) `GuidedRunnerClient` and `ObservedValidationClient` are folded into the dispatch client (`HttpRunnerDispatchClient`/one runner client) with one TLS/client-certificate configuration (OBS-009) — the `SecretValue` single writer (OBS-007 AC-9) and canonical body digest remain the only secret-bearing serializer; (b) `GuidedPublicationAuthorization` folds into `DispatchAuthorization`; (c) `GuidedSessionService.claim()` (606 lines) and `checkCommand` (365) are split into named steps with no behaviour change — proven by the existing `GuidedSessionIT`/`GuidedPublicationReplayIT`/OBS-015 `IncrementalRelearnIT` passing unchanged and by a before/after count of SQL statements per command; (d) runner guided TypeScript (`src/guided/**`, `run/guidedBrowser.ts`, lines up to 792 chars) is reformatted with the repository formatter with zero semantic change (AST-equality or test-suite equality stated in evidence); (e) `tools/build-studio-observed-schemas.cjs`'s byte-identical regeneration check (OBS-012A) is confirmed still wired. Each fold names the deleted class and its tests ported by name. [ADR-SC-005 Panel evidence 5; placement map row OBS-011 "code-health refactors"] *(2026-10-18, @po (Pax), T0 ratification RD-1/RD-2 (root decisions): (c) is **resolved by drift**, with no split, because `claim()` and `checkCommand` now measure about 98 and 22 lines; the SQL-count proof and the `IncrementalRelearnIT` reference (no such class) fall away. (d) "with the repository formatter" reads "by hand under the existing ESLint config, proven by an automated AST-equality (structure-unchanged) check, with no formatter installed", scope per Aria R-4d. See "T0 ratification (PO) — 2026-10-18".)*

   **AC-4 single-owner note (2026-10-16, @po, PO delta S-4; reciprocal of STUDIO-OBS-009 Dev Notes "Sequencing with neighbours").** This story may start before STUDIO-OBS-009 Done, so some files can have two candidate owners:
   - The (d) reformat of `src/guided/**` includes `guided/runtime.ts`. STUDIO-OBS-009 AC-7 AUTHORED-ECHO-01 edits that file, so the reformat skips it while AUTHORED-ECHO-01 is open.
   - `run/observationCollector.ts` is edited by AUTHORED-ECHO-01 and FOCUS-MUTATION-01. This story does not touch it while either item is open.
   - `StudioService.java` (File List, CLN-20) is edited by STUDIO-OBS-009 AC-9 TF-3. This story does not touch it while TF-3 is open.

   The coordinator assigns one owner per file at a time. This note does not change AC-4's meaning.

   **AC-4 (b) obligation — R9-OBS-3: publication authorization still uses the app clock (inherited from STUDIO-OBS-012A; architect gate `docs/qa/evidence/STUDIO-OBS-012A/root/architect-gate.json` ruling 6, placement P6, 2026-10-13).** The gate placed this in the fold `GuidedPublicationAuthorization` → `DispatchAuthorization`, because that fold already rewrites the code. The finding is inferred by the gate and has not been tested. `GuidedPublicationAuthorization.authorizePublication` mints the publication grant deadline from the injected `clock` (`:85`) and checks it against the same clock (`:96`). `GuidedPublicationConfiguration` injects `Clock.systemUTC()` both there (`:44`) and into `GuidedPlanPublisher` (`:94`). `V15__publication.sql:217` judges `validation_deadline` and the owner lease against the database `clock_timestamp()`. This is the same two-clock class as R9-OBS-1, on the authoring/publication side: a JVM behind the database lengthens a publication grant by the skew, and a JVM ahead shortens it. Anchors were re-checked by @po on 2026-10-13. This obligation does not change AC-4's meaning, apart from the narrow AC-7 exception below.

   a. **Move publication-grant minting and judging to `DatabaseClock`** in the fold. Use the same 012A R9 option B mechanism that replay grants use: `guided/publication/DatabaseClock.java` reads `SELECT clock_timestamp()`, uncached, and is not a Spring `Clock` bean. Cover both the folded authorization and `GuidedPlanPublisher`. The authorization TTL, the validation deadline, the leases and every other window stay as they are. No tolerance is added, and no V15 trigger is edited (migrations are immutable after 012A).

   b. **Proof:** a test in the `ObservedGrantClockIT` style, with JVM and DB clocks skewed both ways, shows that the publication grant's mint time and judgement both come from the database clock. Existing publication tests pass unchanged and are named.

   c. **Interim and sequencing:** until this lands, the gate says the STUDIO-OBS-010 AC-5 NTP row covers the risk. If the `GuidedPublicationAuthorization` fold is ruled out or carried forward at T0, this item does not fall away with it. It is carried in the "Carried forward" table with owner @architect, and the change is never dropped silently.

5. **AC-5 — Sleep-polled IT flake reduction (panel QA).** The guided/observed ITs that sleep-poll for 54–126 s (`GuidedPublicationReplayIT` and siblings, named at T0 from a timing run) are converted to condition-driven waits (Awaitility or an equivalent already on the classpath — no new dependency without @architect's ruling) with bounded timeouts and no reduction in asserted behaviour; total guided backend IT wall time before/after is recorded with the exact test list. [ADR-SC-005 Panel evidence 2 ("Sleep-polled ITs of 54–126 s are flake exposure"); placement map row OBS-011]

   **AC-5 cleanup item — TEST-001: `GuidedPublicationReplayIT` order dependence (inherited from the STUDIO-OBS-015 QA gate; placed 2026-10-17 by @po (Pax) on the root decision (yolo) of 2026-10-17, relayed by the lead).** Source: `docs/qa/gates/STUDIO-OBS-015-incremental-re-learn-from-the-first-changed-step.yml` TEST-001 (sha256 `8ad9c27a…` at the 015 close): "GuidedPublicationReplayIT is class-scoped and order-dependent; one failure reads as several and the two P7 tests cannot pass alone". Suggested action: "Test-hygiene debt for OBS-011 or OBS-009". Close record: `.ai/STUDIO-OBS-015-close.json` `otherGateItems` TEST-001, which recorded it as not placed before this item. Owner: @dev, with @qa confirming. This adds a cleanup item to AC-5 and does not change AC-5's meaning.
   a. **Goal.** Each `GuidedPublicationReplayIT` test, including the two P7 tests, sets up and tears down its own state, so it passes alone and in any order. A failure then reads as one failure.
   b. **No weaker assertions.** Asserted behaviour is not reduced, and no test is deleted to remove the dependency. A test that cannot be made independent is named in the "Carried forward" table with its reason and owner.
   c. **Evidence.** Record a full-class run and a single-test run of each P7 test, plus one run in a different method order if the harness allows it, with the commands. The rule in STUDIO-OBS-009 AC-12 clarification (D-14) stays: a single-test ReplayIT rerun is never credited as gate evidence, whether or not this item lands.
   d. **Guards.** Keep the 012A wrapper-only diagnostic in this class working (STUDIO-OBS-009 AC-12 R10-rev2-2 a). Respect the OBS-010 Live surface list and the single-owner rule for shared files.

6. **AC-6 — Pins, generated files, docs, artefacts (G3, G10, G11).** Any `docs/specs/studio/openapi.yaml` edit re-anchors both pins with old/new quoted; bundles regenerated, never hand-edited; `node tools/check-studio-observed-contracts.cjs` passes. Dated records (gates, stories, `RULINGS.md`) get a dated note, not a rewrite; `account-provider-readiness-design.md` gets a header note "historical — superseded by secret-login-design.md §0"; `.ai/` (103 untracked files at inventory time) gets an explicit archive-vs-ignore decision executed archive-first; `docs/qa/evidence/**` is never staged; never `git add -A`. [inventory G3, G10, G11; 10.51 AC-13 precedent]

7. **AC-7 — Behaviour-preserving, counted, bounded.** After all removals a grep for every deleted symbol and file name returns nothing in `frontend/src`, `studio-runner/src`, `backend/src` and `tools/`, with the known exceptions listed (guard-test string literals; the three Spring setter-injection methods CLN-18) — @qa re-runs the grep independently (10.51 AC-12 method). Fresh baselines at HEAD for frontend (vitest), runner (`npm test` incl. skipped count) and backend `studio.*`; `after = baseline − named drops + named additions`, reconciled by @qa. Nothing on OBS-010's "Live surface" list is removed. **Narrow exception (R9-OBS-3, AC-4 (b) obligation):** moving the publication grant to the database clock is ~~the one intended behaviour change in this story~~ [Struck 2026-10-17 by @po (Pax): one of two intended behaviour changes; C-OBS008-1 is the other, see the AC-7 exception addition below]. Its evidence is the AC-4 (b) b proof, not neutrality. CLN-30/31 (identity bypass, `local` profile — ED-02), CLN-13 (repo-wide npm hygiene), CLN-25 (JPA accessors) and CLN-42 (over-exports) are named **out of scope** so @qa does not count their absence as gaps. [inventory G5, G8, G12; ADR-SC-005 "Order and parallelism"]

   **AC-7 exception addition: C-OBS008-1 (2026-10-17, @po (Pax); see "Carried items (inbound)").** The single result projection changes behaviour on one non-default path. With publication disabled, the body of a non-terminal `/result` read becomes a v3 `result` instead of a `PublicSession`. This is the second intended behaviour change, next to R9-OBS-3. Its evidence is the C-OBS008-1 d test, not neutrality. The default path (publication on) keeps the behaviour pinned by `GuidedPublicationReplayIT:11944-11947`. Apart from this exception, AC-7's meaning is unchanged.

## Tasks / Subtasks

- [ ] **T0 — Baselines, rulings, Live surface (AC-1, AC-2, AC-7).** Read OBS-010's "Live surface" list; re-run the inventory at HEAD; collect the AC-2 rulings (CLN-10 @po/@devops; CLN-40 @qa); take the three baselines; timing run to name the sleep-polled ITs (AC-5); @architect confirms the fold targets (AC-4) and any wait-library choice.
- [ ] **T1 — Leftovers (AC-2, AC-3).** Class A removals; class B sweep; class C per ruling; emitters per OBS-009 outcome; targeted tests; grep per item.
  - [ ] F-1 (CLN-F1), before the T2 split. First migrate the positive admissions in `GuidedSessionIT`/`GuidedServiceTransportFaultIT` to planner-issued obligations, porting by name with counts. Then make the `GuidedSessionService` admission gate unconditional and remove the translation-absent arms, with the exact shape ruled by @architect at T0. Add the no-translation-state `409 RUNTIME_INCOMPATIBLE` negative test, and record the neutrality proof and the grep. Remove the orphaned bridge helpers and fold the duplicated bridge fixture (ruling §4.1 and F-3). If any of this is not done, carry it forward (AC-2 obligation F-1 a–g).
  - [ ] CLN-F2: get the @architect + @data-engineer ruling on the historical V18 fixture adapter.
    - If it is retired: port or retire the `InferenceMigrationIT` V18 cases by name, delete the adapter, and confirm the grep returns 0.
    - If it is kept: list it as a named AC-7 exception.
    - With no ruling: carry it forward (AC-1 candidate CLN-F2 a–d).
  - [ ] C-OBS008-5 (from STUDIO-OBS-008; placed 2026-10-17): remove the `secretId ?? name` fallback in the validate-variables mirror (`handlers.ts:177`) and fix the `:164` comment. Add the undeclared-by-name test with its positive control. The authoring-mirror `secretId` check is optional. If this is not done, move it to "Carried forward" ("Carried items (inbound)" C-OBS008-5 a–f).
- [ ] **T2 — Folds and splits (AC-4).** Dispatch-client fold; authorization fold; `claim()`/`checkCommand` split; runner TS reformat; regeneration check confirmed.
  - [ ] R9-OBS-3: in the authorization fold, publication-grant minting and judging (folded authorization + `GuidedPlanPublisher`) use `DatabaseClock`; windows unchanged; skew-both-ways proof; carried forward with owner @architect if the fold is not done (AC-4 (b) obligation a–c).
  - [ ] C-OBS008-1 (from STUDIO-OBS-008; placed 2026-10-17): fold the two result builders into one projection, so that `/guided-sessions/{id}/result` answers a non-terminal session with `202` and a v3 `result` on every path. Delete the fallback's non-terminal `view` shortcut. Add one HTTP test with publication disabled. Get the T0 ruling on terminal `publication.status` with publication disabled. If this is not done, move it to "Carried forward" ("Carried items (inbound)" C-OBS008-1 a–h).
  - [ ] C-OBS008-3 (from STUDIO-OBS-008; placed 2026-10-17): keep only rendering data in `guidedNarratives.ts` at runtime, and move `basis`/`source`/`note`/`facts`/`COPY_SOURCE_FILES` to a test-only registry. Every `template` stays byte-identical. Reconcile the copy-table rows by name, and show by grep that the build output has no `COPY_SOURCE_FILES` path. If this is not done, move it to "Carried forward" ("Carried items (inbound)" C-OBS008-3 a–f).
- [ ] **T3 — IT flake reduction (AC-5).** Condition-driven waits; before/after wall time; exact list.
  - [ ] TEST-001 (015 gate; placed 2026-10-17): make `GuidedPublicationReplayIT` order-independent, including the two P7 tests, with no weaker assertions. Record full-class and single-test runs. Single-test reruns are still never credited as gate evidence (AC-5 cleanup item a–d).
- [ ] **T4 — Docs and artefacts (AC-6).** Dated notes; historical header; `.ai/` decision archive-first; pins if touched.
  - [ ] C-OBS008-2 (from STUDIO-OBS-008; placed 2026-10-17; optional per the ruling): correct the stale Javadoc on `StudioSecretsService.MAX_VALUE_LENGTH` so that it cites STUDIO-OBS-007 AC-12 (F-5). Comment only, with no behaviour change ("Carried items (inbound)" C-OBS008-2 a–d).
  - [ ] CLN-50 and CLN-51 (inventory §5, added 2026-10-17): the doc corrections proposed there, after the AC-1 re-verification.
- [ ] **T5 — Verification and record (AC-7).** Full affected suites; final symbol grep; reconciled counts; File List as changed; "Carried forward" table; submit to independent @qa; only QA can set Done.

### Carried forward — lean execution decision (2026-10-19)

On the user's request to shorten execution, the following nonblocking work is excluded from the remaining implementation path. These rows record deferral, not completion; existing behavior, assertions and test coverage remain protected. The [lean execution plan](../../../.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/lean-execution-plan-20261019.json) retains the required fresh backend `check --rerun-tasks` with JaCoCo before story credit and full affected T5 suites after integration. AC-5 and TEST-001 remain required; moving that programme to a separate story is only a proposal.

| Item | Owner | Reason and retained limit |
|---|---|---|
| F-1 / CLN-F1 remaining legacy-branch removal, admission-test migration and related fixture cleanup | @dev + @architect | Explicitly non-release-blocking under AC-2 F-1(g). Defer the remaining obligation; no removal or migration is credited. Until completed, affected test citations prove post-admission behavior only, never admission authority. |
| F-2 / CLN-F2 historical V18 fixture retirement and related case porting | @architect + @data-engineer | Explicitly non-release-blocking under AC-1 CLN-F2(d). Preserve the adapter and current migration coverage; no case is silently retired and no runtime compatibility is claimed. |
| C-OBS008-2 `StudioSecretsService.MAX_VALUE_LENGTH` Javadoc correction | @dev | Optional per the inbound ruling; defer this comment-only correction. |
| C-OBS008-3 remaining narrative citation metadata extraction | @dev | Carry-forward permitted by inbound C-OBS008-3(f). Defer remaining bundle cleanup and its dedicated extraction proof. Preserve rendered copy and existing copy-table coverage; no completed work is reverted and no extraction completion is claimed. |
| C-OBS008-5(e) additional authoring-mirror `secretId` refusal | @dev | Explicitly optional under inbound C-OBS008-5(e). Defer this extra validation. The separate validate-variables fallback correction and its focused positive/negative test remain in scope. |

**Review follow-up (2026-10-19).** The last two rows apply the inbound items' existing carry-forward provisions. During implementation, run checks for changed behavior and affected dependencies; defer repeated broad regression to the required final affected suites. Preserve the fresh T0 backend `check --rerun-tasks` and JaCoCo prerequisite before any story credit. Do not build tests or evidence packets for deferred implementations. AC-5/TEST-001 remain owed: moving that programme to a follow-up would require an explicit acceptance-criteria amendment.

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
- `backend/src/main/java/com/citi/put/checks/studio/dto/ExecutionStatus.java` (CLN-19), `StudioService.java` (`updateAuthoring`, CLN-20; one owner at a time with STUDIO-OBS-009 TF-3 — S-4, 2026-10-16), `guided/translation/GuidedSourceInputResolver.java`, `internal/RunnerOutcomeCodes.java`, `secrets/VaultStudioReferenceResolver.java`, `secrets/SecretAlreadyExistsException.java`, `StudioExecutionProperties.java`, `guided/session/GuidedSessionService.java` (`recordEvidence` conditional) (CLN-21), `backend/src/main/resources/application.yml` (`sse.read-interval`)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `dispatch/StudioAcceptanceService.java` (`OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters, conditional on OBS-009)
- `studio-runner/src/versions.ts`, `studio-runner/src/run/launcher.ts` (`TOTAL_TIMEOUT_MESSAGE`), `studio-runner/scripts/write-runtime-versions.mjs` (CLN-41), `studio-runner/test/deferred.test.ts` (ruling, CLN-40)
- Class B leftover sweep targets across the four trees (expected empty after OBS-007/012A)
- C-OBS008-5 (2026-10-17): `frontend/src/services/mocks/studio/handlers.ts` (`:164`, `:177`), with the test in `frontend/src/services/mocks/studio/studioHandlers.test.ts` or a named sibling. If the optional part e is taken, also the authoring mirror file that @dev names. One owner at a time with STUDIO-OBS-008

Folds and splits
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java` (del), `guided/publication/ObservedValidationClient.java` (del), `dispatch/HttpRunnerDispatchClient.java` (one runner client), `guided/bridge/GuidedDispatchService.java`, `guided/publication/GuidedPlanPublisher.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorization.java` (del), `dispatch/DispatchAuthorization.java`, `dispatch/ProvisionalDispatchAuthorization.java`, `guided/publication/GuidedPublicationController.java`
- R9-OBS-3: `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationConfiguration.java` (`Clock.systemUTC()` → `DatabaseClock`), `GuidedPlanPublisher.java`, `DatabaseClock.java` (reused, unchanged unless @architect rules); test `backend/src/test/java/com/citi/put/checks/studio/guided/publication/` publication-grant clock IT (new, `ObservedGrantClockIT` style)
- C-OBS008-1 (2026-10-17): `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (`read` result branch `:759-763`, `result` `:2873`), `guided/session/GuidedSessionController.java` (`result` `:59-75`), `guided/publication/GuidedPublicationResultProjector.java` (`result` `:128`): one result projection. Test: one publication-disabled HTTP case (class named at T0). Line numbers are as of 2026-10-17, and the files are one owner at a time with STUDIO-OBS-008 L1-P
- C-OBS008-3 (2026-10-17): `frontend/src/components/studio/guided/guidedNarratives.ts`, a new test-only registry module that @dev names, and `frontend/src/components/studio/guided/guided.test.tsx`. One owner at a time with STUDIO-OBS-008 and with STUDIO-OBS-009 AC-7 AUTHORED-ECHO-01 f
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (split into named steps / collaborators under `guided/session/`)
- F-1 (CLN-F1): `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (unconditional admission gate; translation-absent arms at `:353/:799/:832/:1375/:1923` as of 2026-10-16), `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java`, `GuidedServiceTransportFaultIT.java` (planner-issued obligations, ported by name), `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java` (orphaned helpers), `GuidedBridgePlannedIT.java` and a shared bridge test fixture (F-3 fold)
- CLN-F2 (only if ruled retired): `backend/src/test/java/com/citi/put/checks/studio/support/GuidedPublicationEvidenceFixture.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java`, `backend/src/test/java/com/citi/put/checks/studio/InferenceMigrationIT.java` (historical V18 adapter removed; cases ported or retired by name)
- `studio-runner/src/guided/**`, `studio-runner/src/run/guidedBrowser.ts` (reformat only; `guided/runtime.ts` excluded while STUDIO-OBS-009 AUTHORED-ECHO-01 is open — AC-4 single-owner note, S-4, 2026-10-16)
- Tests ported by name: `GuidedRunnerClientTest`/`ObservedValidationClientTest` → `HttpRunnerDispatchClientTest`; `GuidedPublicationAuthorizationIT` → `DispatchAuthorizationIT`

IT flake reduction
- `backend/src/test/java/com/citi/put/checks/studio/guided/**/*IT.java` named at T0 (e.g. `GuidedPublicationReplayIT`, `SecretLoginFixtureIT`, `IncrementalRelearnIT`), `backend/build.gradle.kts` (only if a wait library is approved)

Docs and artefacts
- `docs/specs/studio-observed-authoring/account-provider-readiness-design.md` (historical header), `docs/specs/studio-context/current-state.md` (dated note if absent), `.ai/` (archive-vs-ignore; `.gitignore` if "ignore"), `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` (dated "re-run at HEAD" addendum only)
- C-OBS008-2 (2026-10-17): `backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretsService.java` (Javadoc `:56-59` only; the constant at `:60` stays 4096)
- CLN-50/51 (2026-10-17, inventory §5): `frontend/README.md` (`:56-61`), `CLAUDE.md` and `AGENTS.md` (`:81-87`, `:142`), `ARCH.md` (`:39-43`, `:52`; dated note at `:101`)
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

**GO conditions:** T0 waits for OBS-010's dated "Live surface" list ~~and starts only after OBS-009 is Done~~ *(struck 2026-10-16 by @po, PO delta S-1: superseded by the "Start-condition amendment" below; source `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/po-delta-validation.json` `obs011StartCondition`)*; no item is deleted on the strength of the inventory alone (G1) — rulings recorded first; `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters removed only if OBS-009 AC-6 lifted schedules; `after = baseline − named drops + named additions` reconciled by @qa; only independent @qa sets Done.

**Start-condition amendment (2026-10-15, user decision; coordinator relayed it to Pax).** In the GO conditions, "starts only after OBS-009 is Done" is replaced by a two-part start condition:
- OBS-009's locally achievable ACs are implemented and validated. These are the local ACs and the local halves of mixed ACs, as classified in [`claude-feasibility-008-011.md`](../../qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/claude-feasibility-008-011.md) PROPOSAL B: AC-1–6, AC-11 and AC-12 f–j.
- OBS-010's dated "Live surface" list exists.

The reason: OBS-009 and OBS-010 cannot reach Done locally because of external gates.

The rest is unchanged. T0 still reads the Live surface list first. Nothing on that list is removed (G12, AC-7). The emitters stay conditional on the OBS-009 AC-6 outcome, and only independent @qa sets Done.

Carried risks from PROPOSAL B:
- OBS-009's external proofs (AC-7/8/10 and deployed-stack halves) may later require code changes to files this story has cleaned. Shared files such as `run/launcher.ts` and `versions.ts` keep one owner at a time, and the coordinator sequences them.
- AC-4 (a) is re-checked against any later OBS-009 TLS change.

**Start-condition clarification (2026-10-16, @po; PO deltas S-2 and S-3 from `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/po-delta-validation.json` `obs011StartCondition`; @po's recommended defaults adopted).** This clarifies the amendment above and does not change it.
- **Who validates (S-2).** "Implemented and validated" means an independent @qa review record of the listed local halves. That record is not a Done verdict. The coordinator confirms that the condition holds before T0.
- **What the list covers after the 2026-10-16 placements (S-3).**
  - AC-4 counts TF-5 b only; TF-5 a, c and e are external.
  - AC-11 includes R1 a–d, which needs STUDIO-OBS-015 Done. R1 also counts as resolved when it is closed as "not reproduced" under R1 a, or when @architect does not give the non-consuming confirmation under R1 b.
  - AC-9 TF-3, AC-7 AUTHORED-ECHO-01 and AC-7 FOCUS-MUTATION-01 are **not** on the list.
- **OBS-010 side.** OBS-010 T2, which writes the Live surface list, may now start on this same trigger (STUDIO-OBS-010 0.3.8, PO delta D-1).
- **2026-10-17 addition: the STUDIO-OBS-015 deferrals placed in OBS-009 0.3.16** (root decision (yolo), `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md` "UPDATE ~14:35" item 1; applied by @po (Pax)). This clarifies the amendment above and does not change it.
  - **Count toward the start:** OBS-009 AC-11 **D5** a–f (KL-015-D5) and AC-11 **LR** a–c (LIFECYCLE-REASON-01). They touch `guided/runtime.ts` and the session lifecycle, which this story's single-owner rule guards.
  - **Do not count:** AC-11 **EDGE** a (an optional backend test) and AC-1 **PID-1** a–d (chart and deployment, @devops).
  - [AUTO-DECISION] Do the OBS-009 AC-11 REL-001 pointer and the AC-12 D4 15 s-edge classification rule (both 0.3.17) count? → no (reason: they are classification rules with nothing to implement and touch no file this story guards). The coordinator may override this.

## Carried review follow-ups — 2026-10-14

[placement-key: resumed-qa-20261014:STUDIO-OBS-011]

Pax places the accepted nonblocking concerns from the completed 012B/013/014 reviews here. These remain open work under the existing anchors below; this placement changes no AC text, task, lifecycle status or external gate. Source and acceptance limits: [`po-closure-placements.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/po-closure-placements.json).

- **GUARD-INTEGRATION** (014:TEST-001; AC-5/T3 harness verification and T5; owner @dev backend guard owner + @qa): Add dedicated structurally valid UNGROUNDED_TARGET and DESTRUCTIVE_VERB integrations that reach guardAction, then assert exact audited reason, terminal refusal and zero prepare/admission/dispatch side effect. Preserve the authored-destructive allowance control. These are coverage improvements over accepted unit plus common DENY-path composition, not claims that the named integrations already ran. Open follow-up; no pass or waiver supplied by closure.
- **HARNESS-EXACTNESS** (014:TEST-003, 014:TEST-005, 014:TEST-006; AC-5/T3 and T5 harness follow-up; owner @dev runner/backend test-harness): Assert the exact same-key refused-context replay code (current IDENTITY_MISMATCH) or obtain an explicit normalization ruling; add a SAVED_INPUT configuration-reference clarification assertion with no secret value; move mutable primaryCsi/coreRole into per-test fixture ownership during the harness split. Keep behavior and existing assertions intact. Open follow-up; no pass or waiver supplied by closure.
- **GUARD-PRECEDENCE** (014:ARCH-001; T0 ruling / AC-6 T4 dated notes; owner @architect): Ratify the current absent-target → destructive → grounding → stance precedence in a dated ruling; AR-SEC001-FM does not decide it. Both current destructive/ungrounded paths refuse before dispatch. A required behavior change needs separate scope review, not an unreviewed cleanup edit. Open follow-up; no pass or waiver supplied by closure.
- **DDL-DOCUMENTATION** (013:ARCH-002, 014:DB-001; AC-6/T4 dated documentation; before any affected constraint alteration; owner @architect + @data-engineer): Amend the AR-1 normative {1,256} text by dated addendum to the verified PostgreSQL equivalent varchar(256) plus ASCII and regex. Record actual V19 generated CHECK catalog names before any future alteration. V20 boundary tests and V19 enforcement already passed; do not rewrite applied migrations. Open follow-up; no pass or waiver supplied by closure.
- **CLEANUP-OBSERVATIONS** (012B:OBS-UX-1, 014:MNT-001; T1 vocabulary review / T4 cleanup; owner @dev + @ux-design-expert; coordinator for directory): Review RunDetailsDrawer confirmed revision wording for Learned revision and remove the literal empty contracts/v3/*.json directory in coordinator-owned cleanup only after proving it empty. Retain the OBS-010 Live surface and evidence history protections. Open follow-up; no pass or waiver supplied by closure.
- **REVIEW-EVIDENCE-HYGIENE** (012B:TEST-002, 012B:EVD-001; AC-6/T4 and AC-7/T5; owner @dev test-harness + @qa): Retain the historical commented-import mutation as text-scanner proof only; a future guard strengthening may use a live import without rewriting that history. Preserve historical raw logs and apply the existing archive-first evidence policy; prefer relative paths/hashes in new summaries. These retained observations do not add a mandatory product behavior change. Open follow-up; no pass or waiver supplied by closure.


### Strict local-proof reconciliation — 2026-10-14

The dated CONCERNS placement list above is retained as history. Current dispositions below follow independent strict Quinn approval of 013/014 and the existing strict 012B closure. Existing acceptance criteria, tasks, lifecycle and external gates are unchanged. Full source/proof links: [`closure-placements-reconciliation.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/po/closure-placements-reconciliation.json).

- **GUARD-INTEGRATION**: 014 now executes structurally valid UNGROUNDED_TARGET and DESTRUCTIVE_VERB refusals, absent-destructive precedence and authored Delete under DENY, asserting exact audit/reason/terminal outcome and zero corresponding preparation, reservation, admission, dispatch or effect. Authored Save/Delete ALLOW native positive controls pass. These original local integrations are no longer deferred to 011; general harness maintenance remains. [reconciliation-key: strict-qa-20261014:GUARD-INTEGRATION]
- **HARNESS-EXACTNESS**: 014 proves exact duplicate IDENTITY_MISMATCH and the actual SAVED_INPUT producer without its private value. Independent QA accepts explicit SAME_THREAD with class-owned Core/worker authority, role/CSI reset, fresh credentials and sticky confirmed cleanup; no per-test conversion occurred. The final ordered 40 cases pass. Any broader class split remains original 011 code-health scope. [reconciliation-key: strict-qa-20261014:HARNESS-EXACTNESS]
- **GUARD-PRECEDENCE**: The dated architecture addendum ratifies absent target → destructive → grounding → stance, and final joined simultaneous-rule cases execute the exact reasons. No precedence ratification remains deferred to 011; AR-SEC001-FM remains binding. [reconciliation-key: strict-qa-20261014:GUARD-PRECEDENCE]
- **DDL-DOCUMENTATION**: A13-4 records the verified PostgreSQL varchar(256) plus ASCII/regex expression and actual boundary probes pass. The isolated PG15 catalog records all 24 V19 constraint names with unchanged V1–V20 checksums. Use those exact names before future alteration; no applied migration rewrite or catalog-as-runtime-install claim. [reconciliation-key: strict-qa-20261014:DDL-DOCUMENTATION]
- **CLEANUP-OBSERVATIONS**: 014 already removed the verified literal empty contracts/v3/*.json directory; no contract JSON files were removed by that cleanup. RunDetailsDrawer Learned revision wording remains in the 011 vocabulary inventory. Preserve the Live surface and evidence history. [reconciliation-key: strict-qa-20261014:CLEANUP-OBSERVATIONS]
- **REVIEW-EVIDENCE-HYGIENE**: The old commented-import mutation remains text-scanner evidence only. Preserve raw archives and the archive-first policy; future optional live-import strengthening adds no new product acceptance criterion and no unresolved required 012B local gate. [reconciliation-key: strict-qa-20261014:REVIEW-EVIDENCE-HYGIENE]

## PO note — accessibility scope is functional only (ADR-SC-006, 2026-10-17)

Recorded by @po (Pax), append-only. Source: the user decision of 2026-10-17, relayed by the lead ("Remove the a11y (accessibility) that are not must have, for instance we don't have to have shortcuts and we dont have handicap users for now"; "… also remove for future stories (e.g: 08,09,10 and 11)"). Project rule: `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md` (Accepted). Status (**Ready**) is unchanged.

- **Grep result.** On 2026-10-17, before this note, `grep -niE 'wcag|accessib|a11y|axe|screen reader|aria-|reduced-motion|keyboard'` returned 2 hits. Both are the ruling path `aria-bridge-ruling01`, at `:57` (AC-2 F-1) and `:286` (change log 0.2.5). These are file names, not a11y work. Decision: KEEP.
- **CLN-11 (the one a11y-adjacent item, tracked in AC-1).** CLN-11's OBS-008 half, the surface 4/5 rewrite, is descoped (STUDIO-OBS-008 "PO scope decision 2", X6). The AC-1 phrase "OBS-008 (CLN-11)" is struck above. In the AC-1 re-run, CLN-11 is a class C row that OBS-008 did not resolve. Per ADR-SC-006 Consequences (CLN-11 AUTO-DECISION) and the dated note on the inventory row:
  - If this story touches surfaces 4 and 5, it may **rename** them to what they render or **delete** them as duplicates of surface 3. It records the reason, updates the pinned keys and regenerates `docs/qa/accessibility/axe-results.json`.
  - A deletion is a named drop (G5). The change is test-only (G8).
  - It must not add new guided states or rules, because that would extend the audit.
  - If this story does not touch them, the row is carried forward with the decision "not now" (G2). It is never dropped silently.
- **CLEANUP-OBSERVATIONS** (`RunDetailsDrawer` wording, owner @dev plus @ux-design-expert) is a vocabulary review, not a11y. Decision: KEEP.
- **Going forward.** No work from the ADR's "Do NOT" list may be added here without a new user decision that supersedes ADR-SC-006.

## PO note — STUDIO-OBS-015 close residual MNT-001 declined (2026-10-17)

Recorded by @po (Pax), append-only, on the root decision (yolo) of 2026-10-17, relayed by the lead. The 015 gate MNT-001 (`docs/qa/gates/STUDIO-OBS-015-incremental-re-learn-from-the-first-changed-step.yml`, gate §8 item 4; `.ai/STUDIO-OBS-015-close.json` `otherGateItems` MNT-001) is an optional @dev hardening with two parts:
- W10-6: `killLaunchTree` treats "every kill marker unusable" as an unreadable table.
- Delete the dead private `VariableReferenceValidator.isBlank`.

It is **declined: optional, not placed**, per the user's lean-scope preference. It is not an obligation of this story or any other. It is not passed and not waived; it is recorded here as declined. STUDIO-OBS-015's QA Results and close record are not edited. [AUTO-DECISION] Does this stop the AC-1 sweep from listing the dead `isBlank` if its own re-grep finds it? → No. The decline places nothing. An AC-1 sweep still records whatever its commands find, under the normal AC-1 rules (reason: AC-1 asks for an honest re-run at HEAD, and suppressing a finding would make it dishonest). The lead may override this.

## Carried items (inbound): append-only

Recorded by @po (Pax), 2026-10-17. Each row is work that another story's ruling carried into this story. Status (**Ready**) is unchanged.

[AUTO-DECISION] The §4 ruling says to append C-OBS008-1 to this story's "Carried forward" table. Should the row go there? → No. It goes in this separate inbound table (reason: that table does not exist yet, and under AC-2 and T5 a row in it means "not finished here". These rows are work for this story, so filing them there would invert their meaning). If a row here is not done, it moves to "Carried forward" with its owner and reason, and it is never dropped silently. The coordinator may override this.

| ID | Placed | Source | Owner | Item | Fits under | State |
|---|---|---|---|---|---|---|
| C-OBS008-1 | 2026-10-17 | @architect (Aria) ruling §4, `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/w1-confirmations.md:172-226` (008 lane L2b finding) | @dev (Dex) | With publication disabled, `readGuidedResult` answers a non-terminal session with `202` and a bare `PublicSession` body. The public document declares a v3 `result`. | AC-4 fold family (the ruling calls it "the 'duplicated families to fold' code-health target that 011 already owns"); T2; AC-7 exception addition | Open |
| C-OBS008-2 | 2026-10-17 | @architect (Aria) ruling §5.2, same file `:256-276` (008 lane L4 open question 4) | @dev (Dex) | The Javadoc on `StudioSecretsService.MAX_VALUE_LENGTH` justifies the 4096 cap by the 64 KiB read cap. The real source is STUDIO-OBS-007 AC-12 (security finding F-5). | AC-6 docs; T4; behaviour-neutral (AC-7, no exception) | Open (optional per the ruling) |
| C-OBS008-3 | 2026-10-17 | Dex (@dev) W5 technical review W5-6, `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/w5-reviews/dex-technical-review.md` §2 (sha256 `06b2c52d…`; carried F-L5a-3). Proposed as C-OBS008-3 in Uma's `w5-reviews/U1-spec.md` §7.2 (`939719c1…`). QA record: Quinn `docs/qa/evidence/STUDIO-OBS-008/qa-gate-20261017/gate-draft.md` §5 item 3 and MNT-001 (`e89fbd46…`). Target fixed by root, 2026-10-17 | @dev (Dex) | `frontend/src/components/studio/guided/guidedNarratives.ts` ships each copy row's citation metadata in the production bundle: `basis`, `source`, `note` and `facts`, which hold repository paths and quoted evidence text. Move that metadata to a test-only registry. The visible copy does not change. | AC-4 code-health family (frontend); T2; behaviour-neutral (AC-7, no exception) | Open |
| C-OBS008-5 | 2026-10-17 | @architect (Aria) ruling `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md` §4, "D-8 residue" (sha256 `3fbf9dcb…`). Also `w5-reviews/U1-spec.md` §7.4, `lanes/U1/receipt.md` §6 (`c00215e9…`), and Quinn `gate-draft.md` §5 item 5 and REQ-001. Target fixed by root, 2026-10-17 | @dev (Dex) | `frontend/src/services/mocks/studio/handlers.ts:177`, `variable.secretId ?? variable.name`, makes the validate-variables mirror match a `secretRef` that has no `secretId` by its name. STUDIO-OBS-008 D-8 says the mirror drops this fallback, but it is still there. The page cannot reach it. Remove it, with a test. | AC-2 leftovers (single-path residue, D-8); T1; MSW mirror only (see d) | Open |
| C-OBS009-1 | 2026-10-18 | @architect (Aria) pre-F-merge ruling 5, `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/pre-rulings.md` §5 (sha256 `1c2b9869…`); B/BL finding, `../bl/d5-e-backend-stop-record.md` §2 (`11a85f3c…`) | @dev (Dex) | The guided teardown executor in `GuidedSessionService.java` (2 threads, queue 64, `ThreadPoolExecutor.DiscardPolicy` at `:2807`) drops overflow attempts silently. `redriveTeardowns` skips ids in flight but not ids that are queued and not yet started, so one session can be queued twice. Log dropped attempts (value-free, rate-limited) and never queue the same session twice. | AC-4 code-health family; T2; shares `GuidedSessionService.java` with CLN-F1 (AC-2 F-1) and the AC-4 (c) split | Open |
| C-OBS009-2 | 2026-10-18 | @architect (Aria) pre-F-merge ruling 4(iii), same file §4(iii) | @dev (Dex) | `StudioRunnerConfiguration` (`backend/.../studio/dispatch/StudioRunnerConfiguration.java:19-21`) still calls the shape-only `runner.validate()` through the `StudioRunnerValidated` marker bean, next to the full `StudioRunnerTls.Wiring` check. Fold to one runner-TLS validation point. | AC-4 fold family; T2; behaviour-neutral (AC-7, no exception) | Open |
| C-OBS009-3 | 2026-10-18 | @devops (Gage) F-merge prep receipt `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/prep-devops/receipt.md` findings F1 and F2 (`2992a113…`) | @dev (Dex), with @devops for the runbook | `studio-runner/README.md` still carries the artifact-1 engine sections (Bounds, Accepted language, fixture corpora and the related sub-sections), although the engine and its fixtures were deleted in STUDIO-OBS-012A. Delete them. Re-audit runbook `docs/runbooks/studio-runner.md` §§1-3 and 5-13; the §2 `callback-api` row lacks the guided connector port. | AC-6 docs; T4; text only | Open |
| C-OBS009-4 | 2026-10-18 | Lane S receipt `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/s/receipt.md` "Findings for root / @architect" item 2 (`1726b7b3…`) | @dev (Dex) | `ObservedReplayAuthorization.prepareScheduled` (`:137`) duplicates about 50 lines of the binding construction in `ObservedReplayAuthorizer.authorize`, because the Authorizer was outside lane S's write set. Extract one shared builder. | AC-4 fold family; T2; behaviour-neutral (AC-7, no exception) | Open |

**C-OBS008-1 details.**

a. **Ruling, quoted** (`w1-confirmations.md` §4).
   - "The contract is right and the backend fallback is wrong. That is option (a) on the substance. **Placement is option (c):** it is out of 008's scope and is carried to STUDIO-OBS-011 with an owner." (`:174`)
   - "The controller answers 202 because the body has no `outcome` (`:74`). **This is the divergence.** It exists only on this path." (`:185`)
   - "**Conclusion:** this predates 008 and was not introduced by 008's in-flight edits." (`:192`)
   - "Fold the two result builders into one projection, `GuidedSessionService.result` and `GuidedPublicationResultProjector.result`. Use it whether a base exists or not, and delete the fallback's non-terminal `view` shortcut." (`:222`)
   - "One HTTP case with publication disabled: a non-terminal `/result` → 202, validated against `v3/result`." (`:223`)

b. **Facts, verified by @po on 2026-10-17.** Re-verify them at HEAD at T0.
   - **Fallback.** `GuidedSessionService.java:759-763` (sha256 `a8ddea75…`, working tree) returns `view(session)` for a non-terminal session when the projection is `"result"`. `GuidedSessionController.java:59-75` (`176c6cbb…`) tries the publication projector first, then answers `result.has("outcome") ? 200 : 202` (`:74`).
   - **When the fallback runs.** It is taken when the projector is absent or the session has no publication base, for example a session started with `STUDIO_OBSERVED_PUBLICATION_ENABLED=false`. Publication is on by default: `GuidedPublicationProperties.java:11` `@DefaultValue("true")`, `application.yml:239` `${STUDIO_OBSERVED_PUBLICATION_ENABLED:true}`.
   - **Contract.** For `readGuidedResult`, `docs/specs/studio/openapi.yaml:1609` declares `'202'` with schema `v3/result.schema.json` (`:1613`).
   - **History.** The branch is in `d954a21c5`: `GuidedSessionService.java:402-405` `return view(session.document())`, and controller `:74`. The service file does not exist at `c767efbe7`. `git diff --quiet d954a21c5 734ad704f` on both files reports no difference. 008's in-flight L1-P edit changed only the argument, to `view(session)` (ruling `:191`).
   - **Pinned default.** The default path conforms, and `GuidedPublicationReplayIT.java:11944-11947` pins it (comment at `:11943`): `FINALIZING` before `/finalize` → `202`, `outcome` `FINALIZING`, `publication.status` `PENDING`. The ruling (`:194-198`) found no test that pins the fallback's non-terminal body. @po did not re-run that grep.

c. **Required behaviour (ruling `:218-221`).** `GET /guided-sessions/{id}/result` answers the same way on every path, whether publication is enabled or not.
   - A non-terminal session gets `202` with a v3 `result`. It carries: `outcome` = the live state, `publication {PENDING, null}`, `currentReadiness` `NOT_PUBLISHED`, P2 `progress` and P3 `explanation`.
   - A terminal session keeps today's status rules.
   - The body never has a `PublicSession` shape.

d. **Fix and test.**
   - Merge the two result builders into one projection, and use it with or without a base.
   - Delete the fallback's non-terminal `view` shortcut.
   - Add one HTTP test with publication disabled: a non-terminal `/result` → `202`, validated against `v3/result`.
   - `openapi.yaml`, its digest and the pins do not change. The ruling rejects option (b), a `oneOf` on the `202`, because it "legitimizes a second shape for one status" (`:207`).

e. **Decide at T0 (ruling `:224`).** @architect rules and @po does not pick. For a session started with publication disabled, which `publication.status` does a terminal SUCCEEDED report? Today it is `PENDING` indefinitely.

f. **Not needed for STUDIO-OBS-008.** R3 closure does not depend on it, and neither does the D5 real-backend smoke, which runs `bootRun` with the `local` profile where publication is on (ruling `:211-212`). The ruling bars L1-P from changing the semantics of the `read()` result branch in 008 (`:215`). This placement does not edit STUDIO-OBS-008.

g. **Single owner.**
   - `GuidedSessionService.java` and `GuidedPublicationResultProjector.java` are in 008 lane L1-P's write list (ruling `:153`).
   - `GuidedSessionService` is also edited here by F-1 and by the AC-4 (c) split.
   - Each file has one owner at a time (Dev Notes; AC-4 single-owner note). The coordinator schedules this item after 008 releases those files.

h. **Not placed.** The ruling did not rule on L2b's second observation, "202 for a pending publication on a terminal session" (`:226`). It is not part of this row.

**C-OBS008-2 details.**

a. **Ruling, quoted** (`w1-confirmations.md` §5).
   - "**Origin.** The lowering is a **deliberate decision from STUDIO-OBS-007 AC-12**, not from 014." (`:242`)
   - The two worst-case read sizes: "4096 | about 33 KiB" and "8192 | about 57 KiB" (`:273-274`).
   - "Both fit under 64 KiB. The Javadoc's 64 KiB rationale (`StudioSecretsService.java:56-59`) is byte-identical at HEAD, where the constant was 8192. … So **the read cap does not force 4096.** The true reason is AC-12/F-5. The Javadoc is stale but harmless. Correcting it is optional and is carried as **C-OBS008-2** to STUDIO-OBS-011, through @po in the same append as C-OBS008-1. It is not 008 work." (`:276`)

b. **Facts, verified by @po on 2026-10-17.** Re-verify them at HEAD at T0.
   - `StudioSecretsService.java:56-59` (sha256 `2178e609…`) reads: "Upper bound on a value, in UTF-16 units. With the worst-case JSON escaping and the origin list, a stored entry stays under the 64 KiB read cap it must later be read back through."
   - `:60` is `MAX_VALUE_LENGTH = 4096`. At `734ad704f` the same comment sits above `= 8192`.
   - `STUDIO-OBS-007.story.md:56` AC-12: "`StudioSecretsService.MAX_VALUE_LENGTH` is lowered 8192 → 4096 at create (`INVALID_SECRET_VALUE` for 4097), bridge `secret.value` is 1..4096 …".
   - `secret-login-security-review.md:37` F-5: "Align bounds (recommend lowering create to 4096)".

c. **Fix.** Reword the Javadoc so that the bound's source is STUDIO-OBS-007 AC-12 (security finding F-5, one value bound equal to the dispatch bound). If @dev keeps the read-cap remark, it becomes a consequence, not the reason; per the ruling, about 33 KiB worst case is under the 64 KiB cap. The exact wording is @dev's. The constant, the behaviour and the tests do not change.

d. **Proof and fallback.** Show a comment-only diff with `compileJava` green. It is neutral under AC-7, with no exception. The ruling calls it optional, so if it is not done it goes into "Carried forward" with that reason, never dropped silently. The contract side of the same ruling is STUDIO-OBS-008's work and is not recorded here.

**C-OBS008-3 details (placed 2026-10-17 by @po (Pax), append-only, on root's placement relayed by the lead).**

a. **Finding, quoted.**
   - Dex W5-6 (low): "The copy table ships its basis, source paths (`docs/qa/evidence/...`, `docs/architecture/...`) and quoted fact text in the production module. `guidedCopy(key)` references the whole object." Proposed fix: "Keep only `template` at runtime; move `basis/source/note/facts` to a test-only module." At the 008 freeze Dex measured 32.7 KB and 85 `quote:` entries.
   - Uma, U1-spec §7.2: "Proposed fix: keep `template` at runtime and move the rest to a test-only module". Target STUDIO-OBS-011, owner "@dev (proposed; @po places)".
   - Quinn, gate-draft MNT-001 (low): "W5-6: `guidedNarratives.ts` ships source paths and quotes in the production bundle (about 33 KB)". Action: "carry (item 3)".

b. **Facts, verified by @po on 2026-10-17.** Re-verify them at HEAD at T0.
   - `guidedNarratives.ts` has sha256 `f8f68c01…`. That equals the U1 "after" hash in `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/lanes/U1/receipt.md`, so these are the STUDIO-OBS-008 U1 bytes. The file is 37,674 bytes, and 93 of its lines contain `quote:`.
   - `COPY_SOURCE_FILES` (`:46` onward) lists repository paths under `docs/stories/`, `docs/qa/evidence/`, `docs/specs/`, `docs/architecture/`, `frontend/src/` and `backend/src/`.
   - A grep for `guidedNarratives` in `frontend/src` finds 10 non-test modules and 6 test files. Modules that import through `guided/index.ts` are not counted by this grep.
   - The copy-table test in `guided.test.tsx` reads each row's cited file and checks the quote. At U1 it had 78 entries and 185 rows (U1 receipt V2: "185 passed").

c. **Required.**
   - At runtime the module keeps only what rendering needs: each key's `template` and its fill-ins.
   - `basis`, `source`, `note`, `facts` and `COPY_SOURCE_FILES` move to a test-only registry that only tests import. The copy-table test keeps every row and reads that registry. @dev chooses the module name and shape.
   - The visible copy does not change. Every `template` stays byte-identical, and every rendered string stays the same.

d. **Proof (G8; AC-7, no exception).**
   - A before/after list of every key with its `template`, equal byte for byte.
   - The copy-table rows, reconciled by name against the 185 rows of U1, or against the count at T0 if STUDIO-OBS-008 or STUDIO-OBS-009 changes the table first.
   - Type-check, lint and the guided suites green.
   - A grep of the production build output for the `COPY_SOURCE_FILES` path strings, for example `docs/qa/evidence/`, returns 0. Record the command.

e. **Constraints.**
   - Keep `frontend/src/components/studio/guided/useGuidedSession.ts:45` verbatim, because the `sessionUnreadable` row quotes it (Dex W5-7).
   - Moving the registry does not remove the commit-set coupling that W5-7 and Quinn TEST-001 describe: the copy-table test still reads untracked evidence files.
   - **Single owner.** `guidedNarratives.ts` and `guided.test.tsx` are STUDIO-OBS-008 files (U1 write set). STUDIO-OBS-009 AC-7 AUTHORED-ECHO-01 f removes the `authoredLiteralTargetNotFound` copy from them, and that copy shipped. Each file has one owner at a time, and the coordinator schedules this item after 008 releases them and after or with AE-01 f.

f. **Not needed for STUDIO-OBS-008.** Dex marked the fix "yes, optional" for an unfreeze, and U1 did not take it (U1-spec §1: "W5-6 → C-OBS008-3"). If it is not done here, it moves to "Carried forward" with its owner and reason, and it is never dropped silently.

**C-OBS008-5 details (placed 2026-10-17 by @po (Pax), append-only, on root's placement relayed by the lead).**

a. **Ruling, quoted** (Aria, `w5-unreadable-and-alias.md` §4): "**D-8 residue [V]:** `handlers.ts:177` still has `variable.secretId ?? variable.name`, which the plan gave to L2a to remove (`prep-20261016/implementation-plan.md:41`; story `:123`). The page cannot reach it, because `toContractVariables` drops secret rows that have no `secretId` (`ChecksStudioPage.tsx:141-150`). Root decides: remove it (`:164`, `:177`) if `handlers.ts` is opened, otherwise record it in the Dev Agent Record." Root's decision of 2026-10-17 places it here instead.

b. **Facts, verified by @po on 2026-10-17.** Re-verify them at HEAD at T0.
   - `frontend/src/services/mocks/studio/handlers.ts` (sha256 `61df7a97…`):
     - `:177` is `const id = variable.secretId ?? variable.name;` inside `validateVariableReferences`, the `POST /tests/{id}/validate-variables` mirror.
     - Its doc comment at `:164` says "(a `secretRef` by its `secretId`, falling back to its name)".
   - The contract, `docs/specs/studio/openapi.yaml` (`b5ecdcad…`):
     - `:761-762` says "A `secretRef` declaration matches by its `secretId`."
     - The `Variable` schema requires `secretId` for `secretRef` (`:3461-3462`). Its description at `:3454` reads "Required actual Vault name for secretRef; no name fallback, dot/dotdot or secret value."
   - STUDIO-OBS-008 D-8 (`STUDIO-OBS-008.story.md:123`) says: "The MSW mirror drops its fallback (`handlers.ts` validate-variables `variable.secretId ?? variable.name`)". The 008 plan (`prep-20261016/implementation-plan.md:41`) gave it to lane L2a: "`handlers.ts:173` fallback removed".
   - The page cannot reach it: `ChecksStudioPage.tsx:141-150` `toContractVariables` drops a secret row whose `secretId` is empty (`:144`).
   - `handlers.ts` was outside U1's write set (U1-spec §4, "Not in the write set").

c. **Fix and test.**
   - Match a `secretRef` by its `secretId` only. Delete the fallback at `:177`, and correct the comment at `:164`.
   - Add a test in `studioHandlers.test.ts` or a named sibling. A draft whose step uses `<secret NAME>` and whose only declaration is a `secretRef` named NAME with no `secretId` is reported with `<secret NAME>` undeclared. A `secretRef` with `secretId` NAME still matches, as a positive control.
   - No product source changes. `openapi.yaml`, its digest and the pins do not change.

d. **AC-7.** [AUTO-DECISION] Is this a behaviour change that needs an AC-7 exception? → No (reason: it changes only the MSW mirror, for an input the page cannot send, and it brings the mirror in line with the contract text quoted in b). The new test is a named addition in the AC-7 reconciliation. The coordinator may override this.

e. **Related observation, optional.** Quinn, gate-draft §5 item 5, marked [V] by Quinn and not re-verified by @po: "the authoring mirror stores `variables` without checking that a `secretRef` has a `secretId`". [AUTO-DECISION] Is it placed? → Yes, as an optional part of this item (reason: Quinn lists it under the same item 5, and it is the same D-8 residue). If @dev adds a mirror refusal for it, the refusal uses only a status and code that the contract already declares for that operation; Aria §4 bars a mirror from inventing a status. If it is not done, it moves to "Carried forward" as optional.

f. **Single owner.** `handlers.ts` is a STUDIO-OBS-008 file. The coordinator schedules this item after 008 releases it.

**C-OBS009-1…4 details (placed 2026-10-18 by @po (Pax), append-only, from STUDIO-OBS-009 W2 and Aria's pre-F-merge rulings, relayed by the lead).** Sources and sha256, taken by @po on 2026-10-18, all under `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`: `f-merge/pre-rulings.md` `1c2b9869d7f1db3d9a016787fd46f3f5277f9e1b6debf56f47240b75b3447bbf`; `bl/d5-e-backend-stop-record.md` `11a85f3c90a88e7e56ed3654c71dbe0c2b285d411720ae10b4f4c5cb96532ce6`; `f-merge/prep-devops/receipt.md` `2992a1136355fae455f4d8ec5314a4386d2223508ed00ced773a4dd15e822cc3`; `s/receipt.md` `1726b7b36d61eac4b7d418948cc233fd403bb50cb5db08cae54fdc59fea49115`. Anchors are re-verified at HEAD at T0.

[AUTO-DECISION] Ruling 5 says @po adds its row to `STUDIO-OBS-011-cleanup-inventory.md`. Where does it go? → In this inbound table, like the other rulings carried into this story, and the inventory is not edited (reason: the lead's placement names this table, and a row here already carries the never-dropped rule). The coordinator may override this.

**C-OBS009-1, teardown shed visibility (ruling 5).**
- a. **Ruling, quoted.** "**Carried, not in 009.** The shed-visibility fix goes to 011. The alert after the window goes to the GA backlog." Why not 009: "It is availability, not safety": the durable `teardownRequest` survives a discarded attempt, and the next 10 s tick queues it again.
- b. **Facts, read by @po on 2026-10-18.** `GuidedSessionService.java`: `ThreadPoolExecutor(` at `:2796`, `ArrayBlockingQueue<>(64)` at `:2801`, `DiscardPolicy()` at `:2807`, `TEARDOWNS_IN_FLIGHT.add(id)` at `:2757`, `reportAbandonedTeardowns` at `:1659`, and the WARN "Guided teardown unacknowledged past the re-drive window: {} session(s)" at `:1670`.
- c. **Required (ruling §5 items 1-4).**
  1. Replace `DiscardPolicy` with a handler that increments a shed counter and logs at most one value-free WARN per interval, with the count and no identifier (same shape as `reportAbandonedTeardowns`).
  2. `redriveTeardowns` also skips ids that are queued and not yet started.
  3. Unit test with an injected, saturated executor: the shed WARN is logged once per interval and the durable request is intact; the next tick queues the id exactly once; an id already queued is not queued twice.
  4. Pool size, queue size and the 15-minute window do not change without a measurement.
- d. **Not here.** The operator alert after the 15-minute window is README backlog item STUDIO-OBS-F09 (GA backlog, owner Platform/SRE).
- e. **AC-7.** [AUTO-DECISION] Is a new WARN line and the no-double-queue rule an intended behaviour change that needs an AC-7 exception? → Yes, a narrow one, named in the AC-7 reconciliation with the c.3 tests as evidence (reason: a log line and a queueing rule are observable behaviour, so neutrality cannot be claimed). The coordinator may override this.
- f. **Single owner.** `GuidedSessionService.java` is also edited by CLN-F1 and the AC-4 (c) split. One owner at a time; schedule this with or before the split.

**C-OBS009-2, one runner-TLS validation point (ruling 4(iii)).**
- a. **Ruling, quoted.** "**Do not move it in 009. Carried to 011 as code health.**" … "fold to one entry point. Delete `StudioRunnerValidated`, and let `StudioRunnerConfiguration` keep only `@EnableConfigurationProperties`. Guard: D3's profile-gate tests stay green, and `grep -rn "runner.validate()" backend/src/main` returns 0."
- b. **Facts, read by @po on 2026-10-18.** `StudioRunnerConfiguration.java:19-21` defines the `studioRunnerValidated` bean that calls `runner.validate()`; `:25` is the marker class. The ruling records the full check at `StudioRunnerTls.java:512-533` (`:531`).
- c. **Proof.** The grep above returns 0, and D3's profile-gate tests stay green. Neutral under AC-7.

**C-OBS009-3, runner README and runbook (Gage F1, F2).**
- a. **Finding, quoted.** F1: "`studio-runner/README.md` still carries the artifact-1 engine sections (Bounds, Accepted language, Text-entry role equivalence, Visible-only resolution, Fixture corpora `fixtures/reference` and `fixtures/adversarial`, Adding a reference example, the Security model's `validateArtifact`) … They need a docs cleanup story (011 CLN candidate)." F2: "Runbook sections 1-3 and 5-13 were not re-audited (header says so). Section 2's `callback-api` row omits the guided connector port (listed in 14.6)."
- b. **Facts, read by @po on 2026-10-18.** README headings `## Bounds (AC-10 defaults)` `:398`, `## Accepted language` `:420`, `### Text-entry role equivalence (VAL-031)` `:441`, `### Visible-only resolution of actions (VAL-040)` `:463`, `## Fixture corpora` `:491`, `### Adding a reference example` `:500`; `validateArtifact` at `:244` and `:345`. Runbook header row `:13` states the non-audit; the §2 `callback-api` row is `:132`.
- c. **Required.** Delete the artifact-1 engine sections and the `validateArtifact` text. Re-audit runbook §§1-3 and 5-13 against the single path, and add the guided connector port to the §2 `callback-api` row. Text only; AC-6/T4.

**C-OBS009-4, shared replay-binding builder (lane S finding 2).**
- a. **Finding, quoted.** "`prepareScheduled` duplicates ~50 lines of `ObservedReplayAuthorizer.authorize` binding construction, because the Authorizer is outside the write set. A shared builder is the follow-up (11-FOLD owns both files)."
- b. **Facts, read by @po on 2026-10-18.** `ObservedReplayAuthorization.prepareScheduled` is at `:137`, called from `StudioAcceptanceService.java:334`. @po did not count the duplicated lines.
- c. **Required.** One builder for the `ExecutionBinding` and replay grant, used by both the manual and the scheduled path. Same database clock and `authorizationTtlMs` window. The lane S tests and the 18 re-enabled schedule methods stay green unchanged. Neutral under AC-7.

If any of C-OBS009-1…4 is not done here, it moves to "Carried forward" with its owner and reason, and it is never dropped silently.

### Inventory additions

- 2026-10-17: **CLN-50** and **CLN-51**, both class A (text), from 008 lane L3H receipt D6. The rows, evidence and proposed corrections are in `STUDIO-OBS-011-cleanup-inventory.md` §5. AC-1 treats them as new candidates and re-verifies them at T0, and the corrections are doc fixes under AC-6/T4.
  - CLN-50: `frontend/README.md:56-61` documents `VITE_ALLOW_INSECURE_MSW_FALLBACK`, which nothing reads.
  - CLN-51: the "Mock-First" prose in `CLAUDE.md`, `AGENTS.md` and `ARCH.md` describes browser request interception, but MSW runs only in Node.
- 2026-10-18: **CLN-52…CLN-56**, the compile-era files left in `studio-runner/evaluation/`, from STUDIO-OBS-009 lane EP finding F1 (`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/ep/receipt.md:101`, `d49aad3c…`). The rows, the evidence and the guard are in `STUDIO-OBS-011-cleanup-inventory.md` §6. AC-1 re-verifies them at T0 (G1).
  - CLN-52 `browser-oracle.test.mjs` and CLN-53 `example-manifest.json` are class A.
  - CLN-54 `oracle.mjs` (+ `oracle.test.mjs`), CLN-55 `report.mjs` (+ `report.d.mts`, `test/evaluation/report.test.ts`) and CLN-56 `fixture-server.mjs` (+ `.d.mts`) are class C. @po's grep found that `evaluation/cli.mjs:7-8` still imports `oracle.mjs` and `report.mjs`, and that EP's C04 fidelity test (`test/evaluation/corpusPages.test.ts:7`) imports `fixture-server.mjs`. So each needs a decision first: owner @dev, with @qa for the corpus.
  - Guard: `evaluation/` is the STUDIO-OBS-009 AC-7 harness. Nothing is deleted while 009 T4 may still use it, unless its owner confirms. Rows not done move to "Carried forward".
- 2026-10-18: **CLN-57…CLN-60**, from Aria's T0 package (proposal §2.4 CLN-N1, N2, N4, N5), numbered by @po at T0 ratification P-8. CLN-57 (A) the empty `guided/account/` directory; CLN-58 (A) the empty `frontend/src/.claude/agent-memory/{aiox-pm,aiox-ux}/` folders; CLN-59 (A, record only) the dead private `VariableReferenceValidator.isBlank`; CLN-60 (K) the stale line pins of the diagnostic-only C5 sampler in `GuidedPublicationReplayIT`. The proposal's CLN-N3 is CLN-52…56 above, and CLN-N6 is CLEANUP-OBSERVATIONS. Dispositions are in "T0 ratification (PO) — 2026-10-18". The cleanup inventory is not edited.

## T0 ratification (PO) — 2026-10-18

Recorded by Pax (@po), append-only, on the lead's instruction of 2026-10-18. Full record: [`po-ratification.md`](../../qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md). Package ratified: Aria (@architect) `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/` `t0-proposal.md` (`dc9c1376…`), `lanes.json` (`a800e2e9…`), `w-brief.md` (`57fe80a7…`). This ratifies T0 rulings only. **No lane starts**: the start condition (G9 exit, the independent @qa local-validation record over the start list, the dated 010 Live surface list) is unchanged, and it was not met when this was written (G9 C8 still running, C4 exit 1). Status stays **Ready**. AC meaning is unchanged apart from the dated AC-3 and AC-4 notes above.

**Root decisions (relayed by the lead; recorded, not ratified by @po).**
- **RD-1.** The `claim()`/`checkCommand` split is closed as no longer needed, and lane 11-GT is dropped. AC-4 (c) is resolved by drift, with no split. The SQL-statements-per-command proof is not needed. AC-2 F-1 e ("before the T2 split") has no split left to sequence; F-1 d's proof is unchanged.
- **RD-2.** The runner guided TypeScript is reformatted by hand, with an automated structure-unchanged (AST-equality) check and no Prettier install. Scope and exclusions follow R-4d. @qa ratifies the proof method.
- **RD-3.** RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 stay STUDIO-OBS-009 carried residues (009 0.3.24). Lanes 11-RO and 11-RO-BE are not opened.
- **RD-4.** The execute-009 collectors get an `execute-011` copy. 011 evidence goes under `docs/qa/evidence/STUDIO-OBS-011/execution-<date>/execution`, at the path root announces.

**@po verdicts.**

| # | Item | Verdict |
|---|---|---|
| P-1 | AC-3 resolved by OBS-009 | **Ratified.** 0 emitters in `backend/src/main/java`; V16 CHECK `:128,:130` stays. Test mentions are guard text (`ObservedScheduleAuthorityIT:268` asserts zero) and go on the AC-7 known-exception list. Re-opens if the user overrides A17 (provisional). |
| P-2 | AC-1 corrections (CLN-20, CLN-24, CLN-39, CLN-41, CLN-49, `contracts/v3` path, F-1 and R9-OBS-3 anchors, TransportFaultIT 31+1, FQCN packages) | **Ratified** as AC-1 deltas. They are pre-G9-exit anchors and bind only after the T0 start-digest re-take (R-T0-1). |
| P-3 | 008 MNT-003 (W5-8, W5-9, W5-10, F-L5a-4, F-L5b-7/M6) | **Ratified: not placed in 011.** They stay open in the 008 gate MNT-003 and the 008 outbound list, owner @dev, destination the next frontend story. Not passed, not waived. |
| P-4 | `.ai/` | **Ratified: keep tracked as is** (118 tracked, 10 untracked/modified). This is AC-6's archive-vs-ignore decision. Nothing is removed, so archive-first has nothing to act on. The 10 entries go to the @devops commit set. |
| P-5 | CLN-10 shim | **Ratified: carried forward, owner @devops.** Sunset = first production deployment containing it + 4 weeks; none exists. @devops co-sign owed. No code change. |
| P-6 | CLN-20 `StudioService.updateAuthoring` | **Ratified: present, class A, removed in 11-LEFT.** @po's 2026-10-10 drift note 1 is withdrawn: it is wrong at this tree. S-4 still applies: the file is edited only after G9 exit and root's TF-3 baton. |
| P-7 | `IncrementalRelearnIT`, `SecretLoginFixtureIT` | **Amended.** Neither class exists. AC-4 (c)'s reference is moot (RD-1). The File List's IT examples are replaced by the R-5 named list (`GuidedPublicationReplayIT` plus eight siblings), as AC-5's "named at T0" already allows. The File List text is not rewritten. |
| P-8 | New candidates | **Ratified** as CLN-57…60 (see "Inventory additions"). CLN-57: the directory is empty, but its former file `ReplayAccountAccess.java` is a tracked deletion in the @devops commit set. CLN-58: removed at 11-MERGE by root. CLN-59: record only (MNT-001 declined). CLN-60: R-C5. |
| P-9 | R-T0-7 ("unchanged" = byte-identical, sha256 before) | **Ratified** (@po half). |
| P-10 | R-EP placement | **Ratified in 11-RT, with the inventory §6 guard binding.** Deletion needs the harness owner's written T0 confirmation that 009 T4 uses none of the removed files or commands; otherwise the rows go to "Carried forward". |
| P-11 | R-08-3 (C-OBS008-3 does not wait for AE-01 f) | **Ratified** (@po half; root co-ratifies). When AE-01 f lands, it removes `authoredLiteralTargetNotFound` from both the runtime table and the test-only registry. |
| P-12 | R-T0-3 (b) | **Noted.** 011 does not merge `runner-origin` into `base-url`. The 010 CFC-01 carve-out text is written as "pending @pm" and is not used by this plan. |

**Still open (owners):** @qa (R-T0-2, R-T0-4, R-T0-7 other half, R-11, R-40, R-B, R-J, R-4d method, R-5); @data-engineer (R-F2 co-sign, or CLN-F2 is carried forward); @devops (R-10 co-sign); @ux-design-expert (R-CO); @dev (R-F1 feasibility, `fixtures.json:10776`); root (R-T0-1, R-T0-2, R-T0-5 path, R-T0-6, R-08-3).

## PO note — start conditions satisfied (2026-10-18)

Recorded by Pax (@po), append-only, on the lead's instruction of 2026-10-18. No AC text is reworded and AC meaning is unchanged. Status stays **Ready**, and no lane is started by this note. Per S-2, root (the coordinator) confirms that the condition holds before T0, and root signs the T0 record. Receipt: `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt-6.md`.

**Both parts of the start condition (2026-10-15 amendment, S-2 clarification) are now satisfied on the evidence.**

| Part | State | Evidence (sha256 taken by @po 2026-10-18) |
|---|---|---|
| (a) The OBS-009 local-validation record exists with `trigger: MET` | **Satisfied** | `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md` `bca21f5393d4c80df49842f805ddd3b3928fff559b09919720b349962f65633a` (json `27833e9b6557fdccd6bf395fb91abcb5691621d0ae3a8f7fe882ab23b7bc136f`), by Quinn (@qa). It is MET under the user's C8 waiver (`STUDIO-OBS-009/execution-20261018/w0/decisions.md`, last section; `8d7332f1…`). It is bound to source `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` and helm `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8`. It is `isVerdict: false`, which is not a Done verdict (S-2). Rows AC-1 to AC-6, AC-11 and AC-12 f–j are all VALIDATED_WITH_DISCLOSURE (record §7) |
| (b) The dated OBS-010 Live surface list exists | **Satisfied; @pm acceptance done** | `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json` `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`: 729 ids, 671 protected, dated 2026-10-18 at the G9b digest. Sign-offs in `finalize-record.md` (`c4e635a8…`): **@architect CROSS-CHECKED-WITH-NOTES** (Aria); **@pm ACCEPTED-WITH-NOTES** (Morgan, 2026-10-18, per `pm-ack.md` §5, P1–P6 met, naming the same list sha256); **@po CONFIRMED** the 16 removals (`po-removal-confirmation.md`, `0b95414d…`). The finalize record's §A step 11 row and its §F "still blank" bullet predate the filled lines and are stale. The 671 protected ids are the 011 boundary (Aria AX-3) |

**What travels with the start (owed, not waived for 011).**
- **Full regression plus JaCoCo at T0.** The user's C8 waiver owes a **full fresh `check --rerun-tasks` with the JaCoCo coverage gate** at the 011 T0 fresh baseline, **before any 011 lane claims credit** (record §9, §11). In the T0 draft this is baseline **B1** (`obs011-t0-baseline-check01`, `t0-record-draft.md` §3) plus T0-JC. A red there reopens the case it names in 009 (record §1.4). The trigger lapses with the waiver, and if the user says the waiver stops at `fd793c95…`, it reverts to NOT_MET.
- **@pm's notes (finalize-record.md).**
  - (1) The list was measured at `fd793c95…`, and the trigger is bound to `061fc41f…`.
  - (2) This is a start-path acceptance, not a quality claim; residues R1–R9 stay owed.
  - (4) The second re-date after 009 Done needs its own @pm acceptance.
- **[I] One item for root to confirm at T0.** OBS-009 AC-11 D5 a–f (KL-015-D5) counts toward the start (2026-10-17 addition above). Record §7 does not name D5 row by row.

**Plan v2.** Aria's v2 plan is in `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/` and supersedes v1 for lanes and lane rules. v1 (`lanes.json` `a800e2e9…`, `w-brief.md` `57fe80a7…`) is kept, and `t0-proposal.md` (`dc9c1376…`) is amended by draft §5.

| File | sha256 |
|---|---|
| `lanes.v2.json` | `5d00751f5abc13d540cd2bd2364b8a7eb2234637184c51bd83f0e1b4367e7952` |
| `w-brief.v2.md` | `946d618935baaf5d13a29bb70f597039512362b8c5114207a47446f2e653b09b` |
| `t0-record-draft.md` | `56162d712ba4ab85c950bcc0b3385ae86a81e9bcc1a81a25516331db73bf474e` |

- **The draft is a DRAFT.** It binds only after root fills every placeholder, copies it to `docs/qa/evidence/STUDIO-OBS-011/t0-<date>/t0-record.md` and signs §13.
- **Pre-start order (§1) still to be filled by root:**
  - steps 1 to 4 (the G9 ruling, the G9 image run, the 009 residue, the 010 re-date) now have evidence to cite (above and in STUDIO-OBS-009 0.3.28);
  - step 5 (the R4 local checkpoint commits by @devops) and step 5a (the execute-011 collectors) are not shown by any file @po read.
- **@po has not ratified the v2 deltas.** The 2026-10-18 ratification covers v1 (`po-ratification.md`, `a729e435…`). [AUTO-DECISION] The lead asked only that v2 be noted, so @po does not re-ratify it in this pass (reason: ratifying v2 would mean reviewing it line by line, which this pass did not do). Root may request a v2 ratification.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

### T0 execution provenance — 2026-10-18 EDT (2026-10-19 UTC)

Developer status update at `2026-10-19T02:12:34.023845+00:00`: **Ready → InProgress** reflects the current T0 baseline collection, failure investigation and off-tree draft preparation. The preceding “Not started” sentence records the earlier preparation checkpoint. This update records ongoing work; it claims no implementation completion, review readiness or QA verdict. Root explicitly authorized this status-only unit in `docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json` after both baseline collections were terminal and their inputs were verified stable.

The original B1 `obs011-t0-baseline-check01` finished with exit 1 (2775 total, 2751 passed, 15 failed, 9 skipped); its startup-failure cause and missing fresh coverage/report obligations remain unresolved. B7's five commands are terminal: Vitest, type-check, lint and build exited 0, while the unused-code check exited 2. Native diagnostic and implementation packages remain off-tree and unvalidated. This lifecycle bookkeeping does not authorize W1, production/main source writes or any diagnostic run, and does not clear B1 failures, coverage debt, story gates or external requirements. Evidence and exact status/header delta: `docs/qa/evidence/STUDIO-OBS-011/t0/status-progress/receipt.json`.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from the 2026-10-09 user decision ("check the code and clean up all unused/deprecated code" at the end of the wave), the cleanup inventory (49 rows, G1–G12), secret-login-design.md §6/§10 ARCH-10 and the 10.51 method; Status Draft | @sm (River) |
| 2026-10-09 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready (pre-ADR scope). Report `.ai/STUDIO-OBS-011-po-validation.json` | @po |
| 2026-10-09 | 0.2.0 | **Re-cut to the single path (ADR-SC-005) — thin final sweep.** Compile-path retirement, v1/v2 generation collapse (ex-ARCH-10), migration re-baseline and the frontend compile UI moved to OBS-012A/012B; class-C rulings table reduced to CLN-10/CLN-40/CLN-47; inventory re-run marks rows "resolved by {story}"; new code-health ACs from the panel (fold `GuidedRunnerClient`/`ObservedValidationClient` and `GuidedPublicationAuthorization`, split `claim()`/`checkCommand`, reformat guided TS, sleep-polled IT flake reduction); `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters conditional on OBS-009; Live-surface boundary kept. Prior PO GO (0.1.1) marked superseded and kept as history. Status **Ready → Draft**, pending @po re-validation | @sm (River) |
| 2026-10-10 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready (single-path draft). Report `.ai/STUDIO-OBS-011-po-validation-sp.json` | @po |
| 2026-10-13 | 0.2.2 | Added the AC-4 (b) obligation a–c for R9-OBS-3 from the STUDIO-OBS-012A architect gate `docs/qa/evidence/STUDIO-OBS-012A/root/architect-gate.json` (ruling 6, placement P6; placement record `root/po-placements-gate.json`). Publication authorization still mints and judges its grant on the JVM clock (`Clock.systemUTC()`, `GuidedPublicationConfiguration:44,:94`), while V15 judges on `clock_timestamp()`. In the `GuidedPublicationAuthorization` → `DispatchAuthorization` fold, minting and judging move to `DatabaseClock` (R9 option B precedent). Windows are unchanged, no tolerance is added and V15 is not edited; the proof is a test with the clocks skewed both ways. The OBS-010 AC-5 NTP row covers the interim, and the item is carried forward, never dropped, if the fold is not done. A narrow AC-7 exception names this as the one intended behaviour change. Matching T2 sub-item and File List entries were added. Existing AC text, AC meaning and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-14 | 0.2.3 | Recorded owned resumed-QA follow-ups in the dated carried-review section; source `resume-20261014/po-closure-placements.json`. Existing AC/task text and meaning and Status Ready preserved; no follow-up or external approval marked complete. | @po (Pax) |
| 2026-10-15 | 0.2.4 | Recorded the user's start-condition decision (relayed by the coordinator). This story may start once OBS-009's locally achievable ACs are implemented and validated and OBS-010's dated "Live surface" list exists, instead of waiting for OBS-009 Done. Nothing on the Live surface list may be removed. Amended the Dependency notes and added the "Start-condition amendment" note after the GO conditions. AC text, tasks and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-16 | 0.2.5 | Added the AC-2 obligation **F-1 a–g** from the STUDIO-OBS-015 @architect bridge ruling (`docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md` §6 F-1; record `execution-20261015/po-bridge-disclosure/`). `GuidedSessionService` keeps translation-absent branches (`:353/:799/:832/:1375/:1923`) that production never reaches. @po verified that translation is installed without a property condition and that state is initialised in `start`. Under the single-path rule this is dead legacy code, recorded as CLN-F1, class C. The steps: migrate the positive admissions in `GuidedSessionIT`/`GuidedServiceTransportFaultIT` to planner-issued obligations by name; then make the admission gate unconditional, with the exact shape ruled by @architect at T0; add a 409 negative test; prove neutrality with no AC-7 exception; land in T1 before the AC-4 (c) split, whose unchanged baseline becomes the migrated classes. It is not release-blocking and is carried forward if not done. The ruling's §4.1 orphaned bridge helpers and the F-3 duplicated bridge fixture are included. Matching T1 sub-item and File List entry added. Existing AC text and meaning, the start conditions and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-16 | 0.2.6 | Added AC-1 candidate **CLN-F2** a–d (class C) from the STUDIO-OBS-015 full-suite triage (Dex `fullsuite-triage-BC/review.md` "Retirement flags"; record `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/po-triage-followups/`). The historical V18 publication fixture adapter (`freezeHistoricalV18Source`, `requireV18`, `publishHistoricalV18Observed`, `commitHistoricalV18`, `prepareHistoricalV18Observed`) is a second, legacy test write path, used by `InferenceMigrationIT`; it does not exist at the `734ad704f` baseline. @architect rules with @data-engineer first; then the adapter is either retired (cases ported or retired by name, grep 0) or kept as a named AC-7 exception. Matching T1 sub-item and conditional File List entry added. Existing AC text and meaning, the start conditions and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-16 | 0.2.7 | Applied PO deltas S-1…S-4 from the STUDIO-OBS-011 section of `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/po-delta-validation.md` (JSON `obs011StartCondition`), using @po's recommended defaults, append-only. S-1: the superseded GO-condition clause "starts only after OBS-009 is Done" is struck with a pointer. S-2: "validated" means an independent @qa review record of the listed local halves (not Done), and the coordinator confirms. S-3: the list after the 2026-10-16 placements: TF-5 b only; R1 a–d need 015 Done, and "not reproduced" or an @architect non-confirmation counts as resolved; TF-3, AUTHORED-ECHO-01 and FOCUS-MUTATION-01 are not on it. S-4: an AC-4 single-owner note (reformat skips `guided/runtime.ts`; `observationCollector.ts` and `StudioService.java` are not touched while the 009 items are open), with matching File List notes. Cross-reference: OBS-010 T2 may now start on the same trigger (010 0.3.8). The start condition itself, AC text and meaning and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-17 | 0.2.8 | Start-condition clarification, 2026-10-17 addition. Applies the root decision (yolo) of 2026-10-17 (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md` "UPDATE ~14:35" item 1). OBS-009 AC-11 D5 a–f (KL-015-D5) and AC-11 LR a–c (LIFECYCLE-REASON-01) count toward this story's start, because they touch `guided/runtime.ts` and the lifecycle that the single-owner rule guards. AC-11 EDGE a (optional) and AC-1 PID-1 a–d (@devops) do not count. [AUTO-DECISION] The OBS-009 0.3.17 REL-001 pointer and the AC-12 15 s-edge classification rule do not count either; the coordinator may override. This closes the observation recorded in OBS-009 0.3.16. The start condition itself, AC text and meaning and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-17 | 0.2.9 | Added "PO note — accessibility scope is functional only (ADR-SC-006, 2026-10-17)", append-only, from the user decision of 2026-10-17 and `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md`. The a11y grep returned 2 hits, both the ruling file name `aria-bridge-ruling01`: KEEP. AC-1's "OBS-008 (CLN-11)" resolution is struck, because 008's surface rewrite is descoped (008 "PO scope decision 2", X6). CLN-11 stays a class C row here: rename or delete the two misnamed surfaces with a recorded reason (ADR AUTO-DECISION), or carry it forward as "not now". New audit states are never added. A matching dated note was added to the CLN-11 row of `STUDIO-OBS-011-cleanup-inventory.md` (with G5/G8). Tasks and Status (**Ready**) are unchanged. Story sha256 before this row: `914e2fb524f92869960cfc2f7a540c78032a72c5583600a8dd47726e4d0ee80d` | @po (Pax) |
| 2026-10-17 | 0.2.10 | Applied two root decisions (yolo, 2026-10-17) on the STUDIO-OBS-015 close residuals, append-only. (1) **TEST-001**, the `GuidedPublicationReplayIT` order dependence from the 015 gate, is placed as an AC-5 cleanup item a–d with a T3 sub-item. Owner @dev, with @qa confirming. Each test, including the two P7 tests, must pass alone and in any order, with no weaker assertions. STUDIO-OBS-009 AC-12 D-14 keeps only the "no single-test ReplayIT credit" rule. (2) **MNT-001** (optional @dev hardening: the W10-6 unusable-marker edge and the dead `VariableReferenceValidator.isBlank`) is recorded as **declined, optional, not placed**, per the user's lean-scope preference, in a new dated PO note. 015's QA Results are not edited. An [AUTO-DECISION] keeps the AC-1 sweep free to report what its own grep finds. Sources: the 015 gate YAML and `.ai/STUDIO-OBS-015-close.json`. Status (**Ready**) is unchanged. Story sha256 before this row: `75bc4b943e5a1aa22e1d4bab07525ac36423c9fcbdd5ab5c0feb67f9bd9d38ab` (0.2.9) | @po (Pax) |
| 2026-10-17 | 0.2.11 | Appended STUDIO-OBS-008 follow-ups, append-only. (1) A new section, "Carried items (inbound)", with two rows, both owned by @dev. [AUTO-DECISION] They go in an inbound table, not the T5 "Carried forward" table, whose rows mean "not finished here". **C-OBS008-1**, from @architect ruling §4 (`docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/w1-confirmations.md`, sha256 `baea6a75…`): with publication disabled, a non-terminal `/result` read answers `202` with a bare `PublicSession`, while `openapi.yaml:1609` declares a v3 `result`. The branch has been in git since `d954a21c5`. The default path is correct and pinned by `GuidedPublicationReplayIT:11944-11947`. The fix folds the two result builders into one projection and adds one publication-disabled test, with a T0 ruling on terminal `publication.status`. R3 and D5 do not depend on it. **C-OBS008-2**, from ruling §5.2: the `StudioSecretsService.MAX_VALUE_LENGTH` Javadoc (`:56-59`) gives the 64 KiB read cap as the reason for the bound. The real source is STUDIO-OBS-007 AC-12 (F-5). It is a comment-only fix, optional per the ruling. AC-7 gets a dated strike plus an exception addition, because C-OBS008-1 is a second intended behaviour change next to R9-OBS-3. Matching T2 and T4 sub-items and File List entries were added. (2) Cleanup inventory §5 (new, appended) adds **CLN-50**, `frontend/README.md:56-61` `VITE_ALLOW_INSECURE_MSW_FALLBACK`, which nothing in `frontend/src` or the config reads, and **CLN-51**, the stale browser-interception "Mock-First" prose in `CLAUDE.md`/`AGENTS.md:81-87,:142` and `ARCH.md:39-43,:52,:101`. Both are class A (text), from 008 L3H receipt D6, with proposed corrections; @po edited no doc. Inventory sha256 before `e4cab4ec6f3568cc33d2a7d37d39e2c77a189e3baa1765b8b0903345d075f908`, after `ab2b4c9b3b85235bd3aa1857190829c29ffa8874f11d5ea0efad27a0ce549de2`; §1–§4 are byte-unchanged. STUDIO-OBS-008 and all source files are not edited. Status (**Ready**) is unchanged. Story sha256 before this row: `f40d64ebcade77b37073ca5f5b8d66feae9f0f005d16ec77d3982a9c86320e9a` (0.2.10) | @po (Pax) |
| 2026-10-17 | 0.2.12 | Appended two STUDIO-OBS-008 outbound items to "Carried items (inbound)", append-only, on root's placement of 2026-10-17 relayed by the lead. Both are owned by @dev. **C-OBS008-3**, from Dex W5-6 (`docs/qa/evidence/STUDIO-OBS-008/execution-20261017/w5-reviews/dex-technical-review.md`, sha256 `06b2c52d…`; carried F-L5a-3) and Uma U1-spec §7.2 (`939719c1…`): `frontend/src/components/studio/guided/guidedNarratives.ts` (`f8f68c01…`, the U1 bytes) ships its citation metadata (`basis`/`source`/`note`/`facts`, repository paths and quoted evidence text) in the production bundle. That metadata moves to a test-only registry, and every `template` stays byte-identical. Proof is a key-by-key template comparison, the copy-table rows reconciled by name, and a build-output grep. It is behaviour-neutral (AC-7, no exception), it fits the AC-4 code-health family and T2, and it shares files with STUDIO-OBS-008 and STUDIO-OBS-009 AE-01 f. **C-OBS008-5**, from Aria `rulings/w5-unreadable-and-alias.md` §4 "D-8 residue" (`3fbf9dcb…`): `frontend/src/services/mocks/studio/handlers.ts:177` `variable.secretId ?? variable.name` (comment `:164`) contradicts STUDIO-OBS-008 D-8 and the contract (`openapi.yaml:761-762`, `:3454`). The page cannot reach it (`ChecksStudioPage.tsx:144`). It is removed with an undeclared-by-name test and a positive control, under AC-2 leftovers and T1. [AUTO-DECISION] No AC-7 exception, because only the MSW mirror changes. [AUTO-DECISION] Quinn's related authoring-mirror observation (gate-draft §5 item 5) is placed as optional part e. QA source: Quinn `docs/qa/evidence/STUDIO-OBS-008/qa-gate-20261017/gate-draft.md` §5 items 3 and 5 (`e89fbd46…`). Matching T1 and T2 sub-items and File List entries were added, as for C-OBS008-1/2. STUDIO-OBS-008, all source files and the cleanup inventory are not edited. AC text and meaning and Status (**Ready**) are unchanged. Story sha256 before this row: `afe5e7487db4b9f2541b16cc3cdaf745bff4ecbc028f0279ca552bb241d3b25c` (0.2.11) | @po (Pax) |
| 2026-10-18 | 0.2.13 | Appended four STUDIO-OBS-009 W2 carries to "Carried items (inbound)", append-only, on the lead's placement, with a details block after C-OBS008-5. All are owned by @dev. **C-OBS009-1** (Aria pre-F-merge ruling 5, `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/pre-rulings.md`, `1c2b9869…`): the guided teardown executor (2 threads, queue 64, `DiscardPolicy` `GuidedSessionService.java:2807`) drops overflow silently; log dropped attempts value-free and rate-limited, and never queue the same session twice; narrow AC-7 exception [AUTO-DECISION]. **C-OBS009-2** (ruling 4(iii)): fold to one runner-TLS validation point; `StudioRunnerConfiguration` still calls the shape-only `validate()`. **C-OBS009-3** (Gage prep-devops F1/F2, `2992a113…`): delete the artifact-1 engine sections from `studio-runner/README.md`; re-audit runbook `docs/runbooks/studio-runner.md` §§1-3 and 5-13, whose §2 `callback-api` row lacks the connector port. **C-OBS009-4** (lane S finding 2, `1726b7b3…`): `prepareScheduled` duplicates about 50 lines of `ObservedReplayAuthorizer.authorize`; extract one builder. [AUTO-DECISION] The ruling-5 row goes in this table, not in the cleanup inventory, which is not edited. The post-window alert is README backlog STUDIO-OBS-F09. No task, File List, AC text or meaning changed. STUDIO-OBS-009, 008, 010 and all source files are not edited by this row. Status (**Ready**) is unchanged. Story sha256 before this row: `d1be797c163123507b547f051d6bf6d94e0cd8b893da62f39c95a52ab2fb8db7` (0.2.12) | @po (Pax) |
| 2026-10-18 | 0.2.14 | Inventory additions **CLN-52…CLN-56**, append-only, on the lead's placement of 2026-10-18. Source: STUDIO-OBS-009 lane EP finding F1, `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/ep/receipt.md:101` (`d49aad3c…`). The rows are in a new §6 of `STUDIO-OBS-011-cleanup-inventory.md` (sha256 before `ab2b4c9b3b85235bd3aa1857190829c29ffa8874f11d5ea0efad27a0ce549de2`). Classes: CLN-52 `browser-oracle.test.mjs` and CLN-53 `example-manifest.json` are A. CLN-54 `oracle.mjs`, CLN-55 `report.mjs` and CLN-56 `fixture-server.mjs` are C, because @po's grep found live importers: `evaluation/cli.mjs:7-8` and the EP C04 fidelity test. The guard: no deletion while STUDIO-OBS-009 T4 may still use the AC-7 harness, unless its owner confirms. A dated bullet was added under "Inventory additions". RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 were **not** placed here [AUTO-DECISION]: they are runner behaviour changes, recorded as STUDIO-OBS-009 carried residues (009 0.3.24). No task, File List, AC text or meaning changed. Status (**Ready**) is unchanged. Story sha256 before this row: `18014f338597c4ddfab0e0ec39582228b1813017775d82cafbf7f1b76917f50f` (0.2.13) | @po (Pax) |
| 2026-10-18 | 0.2.15 | **T0 ratification (PO)**, append-only, in a new section "T0 ratification (PO) — 2026-10-18", on the lead's instruction. Package: Aria `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/` (`t0-proposal.md` `dc9c1376…`, `lanes.json` `a800e2e9…`, `w-brief.md` `57fe80a7…`); record `po-ratification.md` in the same folder. Root decisions recorded: RD-1 the `claim()`/`checkCommand` split closed and lane 11-GT dropped; RD-2 hand reformat with an AST-equality check, no Prettier; RD-3 RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 stay in 009 (11-RO/11-RO-BE not opened); RD-4 an `execute-011` collector copy. @po verdicts P-1…P-12: AC-3 resolved by 009 (re-opens on an A17 override); AC-1 deltas ratified (bind after the start-digest re-take); 008 MNT-003 not placed here; `.ai/` kept tracked; CLN-10 carried, owner @devops; CLN-20 present (the 2026-10-10 drift note 1 withdrawn); the non-existent `IncrementalRelearnIT`/`SecretLoginFixtureIT` references replaced by the R-5 list; new candidates numbered CLN-57…60 under "Inventory additions"; R-T0-7, R-EP (with the §6 guard) and R-08-3 ratified; R-T0-3 (b) noted. Dated notes appended to AC-3 and AC-4. No task checkbox, File List text or lane start changed. The cleanup inventory, STUDIO-OBS-008 and all source files are not edited. Status (**Ready**) is unchanged. Story sha256 before this pass: `ef0eec7f9e28d94d37f38712acaacebcbc8f17f5877cdda018db2aca80dea262` (0.2.14) | @po (Pax) |
| 2026-10-18 | 0.2.16 | Start conditions recorded, append-only, in a new section, "PO note — start conditions satisfied (2026-10-18)", on the lead's instruction. **(a) Satisfied:** the 009 @qa local-validation record (`bca21f53…`) reads `trigger: MET` under the user's C8 waiver. It is bound to source `061fc41f…`, dist `698a9365…` and helm `46070907…`. **(b) Satisfied:** the dated 010 Live surface list `live-surface-20261018/live-surface-list.json` (`e5c58fa5…`) has @architect CROSS-CHECKED-WITH-NOTES, **@pm ACCEPTED-WITH-NOTES** and the @po removal confirmation (`finalize-record.md` `c4e635a8…`). Noted: the owed full `check` plus JaCoCo at the T0 fresh baseline (B1) before any lane claims credit; @pm's notes; D5 for root to confirm. Also noted: plan v2 (`lanes.v2.json` `5d00751f…`, `w-brief.v2.md` `946d6189…`, `t0-record-draft.md` `56162d71…`, a draft that root signs), which @po has not ratified. Root confirms the condition and signs T0 (S-2); no lane started. AC text and meaning and Status (**Ready**) are unchanged. Receipt `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt-6.md`. Story sha256 before this pass: `413fcaa4d825f51906965baa841966c0fa0c79dbac55778eef5b1a5c47753931` (0.2.15) | @po (Pax) |
| 2026-10-18 | 0.2.17 | Developer lifecycle bookkeeping: **Ready → InProgress** for actual T0 execution after terminal B1/B7 receipts and stable end/input captures. Added dated Dev Agent Record provenance; existing first line, ACs, tasks and QA Results preserved. B1 failures/coverage debt, B7 unused-code failure and all implementation/final gates remain open. Root authorized only this status unit; no W1/source application, diagnostic run, completion or QA verdict. Receipt `docs/qa/evidence/STUDIO-OBS-011/t0/status-progress/receipt.json`. | @dev (Dex) |
