# STUDIO-OBS-011 T0: PO ratification of Aria's T0 package

- **Author:** Pax (@po). **Date:** 2026-10-18, about 15:20–15:40 EDT. **Mode:** YOLO, docs only.
- **Scope:** the items of `t0-proposal.md` that name @po as ratifier, the items the lead listed, and the four root decisions relayed by the lead. Other ratifiers (root, @qa, @dev, @data-engineer, @devops, @pm, @ux-design-expert) are not answered for here.
- **Not done:** no test, build, Gradle, docker or install. No write under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, root package files or `AGENTS.md`. No git write. `lanes.json`, `t0-proposal.md` and `w-brief.md` are not edited.
- **Legend:** **[V]** I ran the read-only command or read the bytes today. **[I]** inference. **[A]** taken from Aria's package without re-checking.
- **Effect:** this ratifies T0 rulings. It does not start a lane. The 011 start condition (G9 exit, the independent @qa local-validation record, the dated 010 Live surface list) is unchanged and was not met at writing: G9 C8 was still running and C4 was exit 1 [V `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/status.txt`]. Story Status stays **Ready**.

**Inputs (sha256, taken by @po 2026-10-18):**

| File | sha256 |
|---|---|
| `t0-proposal.md` | `dc9c1376e7908a5a338f281e7bddc76c8e3b3a2a7f9f1c7942e922eaf3495f94` |
| `lanes.json` | `a800e2e9033c64098f3452addf098a727fa0404f799e9900413f0beb95fba144` |
| `w-brief.md` | `57fe80a7617f5fb4b1bace4e05fddc05cf932b5dcf2268ae1db707f30f08c888` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` (before this pass) | `ef0eec7f9e28d94d37f38712acaacebcbc8f17f5877cdda018db2aca80dea262` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` | `3f0d3a53f113d5bb17855cb60e38d1081d2f1dbccd824e1cec0d56702e91221d` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` | `71832a0a42f2663673a77f7915d0ea917328f162d337902f17b6d2713f6635ce` |

**Input label correction.** The proposal labels the story input `ef0eec7f…` as "0.2.13". Those bytes already contain the 0.2.14 row (inventory additions CLN-52…56) [V]. So the proposal's CLN-N3 is the already-placed CLN-52…56, not a new row (item 8).

---

## 1. Root decisions recorded (relayed by the lead, 2026-10-18; not @po's to ratify)

| # | Root decision | Effect on 011 |
|---|---|---|
| RD-1 | Close the `claim()`/`checkCommand` split as no longer needed. Drop lane 11-GT. | Answers U-1 at its default. AC-4 (c) is **resolved by drift** with no split: `GuidedSessionService.claim` spans `:944-1041` and `GuidedTranslationService.checkCommand` spans `:1408-1429` [V start and closing lines; Aria's brace count gives 98 and 22 lines]. The SQL-statements-per-command proof and the `IncrementalRelearnIT` reference fall away. AC-2 F-1 e ("F-1 lands before the T2 split") has no split left to sequence. F-1's own proof (F-1 d) is unchanged. |
| RD-2 | Reformat the runner guided TypeScript by hand, with an automated structure-unchanged check. No Prettier install. | Answers U-2 at its default. AC-4 (d) "with the repository formatter" reads: hand wrap under the existing ESLint config, proven by an AST-equality check built with the in-tree `typescript` package (R-4d), plus the runner unit and fixtures suites equal by name. Scope and exclusions are R-4d's (`runtime.ts`, `ownership.ts`, generated `types.ts`/`schemas.json` excluded). @qa ratifies the proof method. |
| RD-3 | RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 stay in 009, where @po placed them (009 0.3.24). | Answers U-3 against Aria's default. The conditional lanes `11-RO` and `11-RO-BE` are **not opened**. No 011 row is added. |
| RD-4 | The 009 collectors get an `execute-011` copy. | R-T0-5's alternative is adopted. 011 collector output goes under `docs/qa/evidence/STUDIO-OBS-011/execution-<date>/execution`, not into 009's folder. Root makes the copy (`.aiox/` only) and announces the path; the brief's default text ("use them with `obs011-` labels") is superseded on the output path only. |

## 2. Rulings @po ratifies

| # | Item | Verdict | Reason |
|---|---|---|---|
| P-1 | **AC-3 resolved by OBS-009** (R-3) | **RATIFY, with a revival condition** | `grep -rn OBSERVED_SCHEDULE_AUTH_REQUIRED backend/src` → 0 hits in `src/main/java`; the only main hits are the CHECK at `V16__scheduling.sql:128,130`, which stays (migrations immutable) [V]. Test hits are guard text: `ObservedScheduleAuthorityIT.java:268` asserts the count is **zero**; `GuidedPublicationMigrationTest.java:1242,1249` and `GuidedSecretLoginMigrationTest.java:315` exercise the CHECK [V]. These go on the AC-7 known-exception list. AC-3's own condition ("only if OBS-009 AC-6 lifted observed schedules") is met by 009 lane S at lane level. **Revival:** the lift rests on A17, which root confirmed provisionally (009 W0 `decisions.md`, "User-batch items"). If the user overrides A17 and the emitters return, AC-3 re-opens here. 11-LEFT records the grep only. |
| P-2 | **AC-1 corrections** (proposal §2.1–§2.3) | **RATIFY all, one amendment** | Each is a delta that AC-1 already asks to record ("counts in the inventory are stale by definition"). Accepted as deltas: CLN-20 present (P-6); CLN-41 `versions.ts` resolved (012A + 009 P2) and `TOTAL_TIMEOUT_MESSAGE` re-classed **K** because `test/helpers/runner.ts:51,283` now imports it [A]; CLN-49 not resolved by OBS-010 but moved to `docs/runbooks/studio-inference-rollout.md:133` (fix in 11-DOC); CLN-24 `findAuthoringV2ById` K (test read seam); CLN-39 `guided/session/README.md:203` stale (11-FOLD); the AC-2 class B path is `docs/specs/studio-observed-authoring/contracts/v3`, not `contracts/v3`; F-1 anchors moved to `:370/:846/:880/:1442/:2013` and the `instanceof` conditional is now at two sites; `GuidedServiceTransportFaultIT` is 31 `@Test` + 1 `@ParameterizedTest`; R9-OBS-3 anchors are `GuidedPublicationConfiguration.java:50,:101`; three test classes declare package `…guided.session` from other folders, so lanes use exact FQCNs. **Amendment:** all of these are pre-G9-exit anchors. They bind only after the T0 start-digest re-take (R-T0-1); a line that moved again is re-quoted, not re-ruled. |
| P-3 | **008 MNT-003** (W5-8 `executeTest(id, key?)`, W5-9, W5-10, F-L5a-4, F-L5b-7/M6) | **RATIFY: not placed in 011** | They are frontend product behaviour and defensive terms, not dead code; 011 is a behaviour-neutral sweep with narrow, named AC-7 exceptions. They stay open where they are recorded: 008 gate `STUDIO-OBS-008-single-path-studio-ui.yml` MNT-003 and the 008 Dev Agent Record outbound list (`STUDIO-OBS-008.story.md:764,:808`), owner @dev, destination "the next frontend story". Not passed, not waived, not dropped. [AUTO-DECISION] Add a README backlog row now? → No (reason: no frontend story is open and the lead did not ask; the 008 gate already holds them with an owner). @pm may add one. |
| P-4 | **`.ai/` keep tracked as is** (R-AI) | **RATIFY** | `git ls-files .ai | wc -l` → 118; 10 untracked/modified; 128 entries [V]. AC-6's "103 untracked files" premise is stale (my 2026-10-10 drift note 3 already said so). The AC-6 archive-vs-ignore decision is recorded as **keep tracked**: no archive, no `.gitignore` change, nothing removed, so archive-first has nothing to act on. The 10 untracked/modified entries belong to the @devops commit set. If anything under `.ai/` is ever removed, archive-first applies. |
| P-5 | **CLN-10 carried forward, owner @devops** (R-10) | **RATIFY** | `retireLegacyStudioWorker.ts` is live in both entrypoints (`index.tsx:2,5`, `main.tsx:3,19`) [V]. The 2026-10-09 PO advisory stands: sunset = the first production deployment that contains it + 4 weeks. No production deployment exists, so no date can be recorded (inventory G8: "recorded, not inferred"). The row goes to T5 "Carried forward", owner @devops, reason "sunset trigger not reached". No code change in 011. @devops's co-sign is still owed (R-10 names @po + @devops). |
| P-6 | **CLN-20 correction** | **RATIFY; my drift note is withdrawn** | `StudioService.java:389-398` `/** Alias matching the existing update naming… */ public AuthoringV2Response updateAuthoring(` delegating to `saveAuthoring`; `grep -rnw updateAuthoring backend/src frontend/src` → declaration only [V]. My 2026-10-10 drift note 1 ("not present at HEAD") is **wrong at this tree**. CLN-20 stays class A and is removed in 11-LEFT. **Gate:** the AC-4 single-owner note (S-4) still holds: `StudioService.java` is touched only after 009 TF-3 is released. TF-3 has landed at lane level (`execution-20261018/b/receipt.md:12`) [V] but is credited only at G9; 11-LEFT edits the file after G9 exit and root's baton. |
| P-7 | **Class names that do not exist** | **AMEND the story references** | `find backend/src -name 'IncrementalRelearnIT*' -o -name 'SecretLoginFixtureIT*'` → none [V]. `IncrementalRelearnIT` survives only as a historical ledger reference in a `GuidedPublicationReplayIT.java:7805` Javadoc [V]. (a) AC-4 (c)'s proof list is moot under RD-1. (b) The File List "IT flake reduction" examples `SecretLoginFixtureIT`, `IncrementalRelearnIT` are replaced by the R-5 named list (`GuidedPublicationReplayIT` and the eight siblings), which AC-5 already says is "named at T0". The incremental cases are `GuidedPublicationReplayIT` methods run by `guidedIncrementalTest` (`build.gradle.kts:278`) [V]; the nearest secret-login class is `GuidedSecretLoginMigrationTest` [V], which is not on the sleep list. Recorded as dated notes; the File List section is @dev's and is not rewritten. |
| P-8 | **New candidates** (proposal §2.4) | **RATIFY, with IDs and two corrections** | See §3. |
| P-9 | **R-T0-7** "unchanged" = byte-identical with sha256 before | **RATIFY (method, @po half)** | It is the story's own F-1 e precedent. @qa ratifies the other half. |
| P-10 | **R-EP** placement of the compile-era evaluation layer | **RATIFY placement in 11-RT, with the inventory §6 guard binding** | Placement is CLN-52…56, already in the story (0.2.14). The guard stays: nothing under `studio-runner/evaluation/` is deleted while STUDIO-OBS-009 T4 may still use it, unless its owner confirms in writing at T0 that T4 uses none of `oracle.mjs`, `report.mjs`, `browser-oracle.test.mjs`, `example-manifest.json` or the `validate-manifest`/`oracle-self-test`/`summarize` commands. Without that confirmation the rows go to "Carried forward" (owner @dev, with @qa for the corpus). `fixture-server.mjs` stays unless 11-RT re-points `corpusPages.test.ts` and shows the same assertion passing (R-EP). |
| P-11 | **R-08-3** C-OBS008-3 does not wait for 009 AE-01 f | **RATIFY (@po half; root co-ratifies)** | AE-01 waits on the external U13 acknowledgement and has no lane [A]; waiting would park C-OBS008-3 indefinitely. The single-owner rule still holds per file at a time. Condition: when AE-01 f lands later, it removes `authoredLiteralTargetNotFound` from **both** the runtime table and the new test-only registry. [AUTO-DECISION] 009 AE-01 f is not edited in this pass (reason: not in the lead's list); the pointer is owed in the next 009 pass and is listed in §4. |
| P-12 | **R-T0-3 (b)** 011 does not merge `runner-origin` into `base-url` | **NOTE** | Aria's 010 ruling A3 grants a conditional carve-out that would *permit* the merge (C1–C6), pending @pm. 011's plan does not use it, which matches the lean scope. @po wrote the CFC-01 list text in STUDIO-OBS-010 as "pending @pm" (task 4 of this pass). Using the carve-out later would need a new T0 decision and all of C1–C6. |

## 3. New candidates (P-8)

| Proposal ID | Inventory ID (@po) | Item | Verdict |
|---|---|---|---|
| CLN-N1 | **CLN-57** (A) | empty `backend/src/main/java/com/citi/put/checks/studio/guided/account/` | **Delete the empty directory in 11-LEFT.** Correction to "git does not track it": the directory is empty on disk [V `ls -la`], but HEAD still tracks `guided/account/ReplayAccountAccess.java`, and the working tree shows it as `D` [V `git ls-files -s`, `git status`]. That deletion belongs to the @devops commit set. Removing the empty directory is a filesystem act with no git effect of its own. |
| CLN-N2 | **CLN-58** (A) | empty `frontend/src/.claude/agent-memory/{aiox-pm,aiox-ux}/` | **Delete at 11-MERGE** (root, coordinator-owned, since 11-FE works in a sandbox). 0 tracked files [V `git ls-files frontend/src/.claude`]; the folders are empty [V `find`]. If they reappear after deletion, that is a tooling finding (an agent writing memory relative to `frontend/src`), reported to root, not a code row. |
| CLN-N3 | **CLN-52…56** (existing) | compile-era `studio-runner/evaluation/` files | Not a new row. P-10 applies. |
| CLN-N4 | **CLN-59** (A, record only) | dead private `VariableReferenceValidator.isBlank` | **Record only, not removed.** The user declined MNT-001 on 2026-10-17; my 0.2.10 AUTO-DECISION already lets AC-1 record what its grep finds without acting. |
| CLN-N5 | **CLN-60** (K) | stale line pins in `GuidedPublicationReplayIT`'s diagnostic-only C5 claim sampler | **R-C5 as proposed:** 11-FOLD-final updates only class-name strings that would point at deleted classes; line pins are listed as stale diagnostics, not refreshed. |
| CLN-N6 | — (CLEANUP-OBSERVATIONS) | `RunDetailsDrawer.tsx:357` "Confirmed revision:" | Already tracked as CLEANUP-OBSERVATIONS. **R-CO as proposed:** in scope only with @ux-design-expert's one-line approval at T0; otherwise carried. No new ID. |

The cleanup inventory is not edited in this pass; the IDs live in the story's "Inventory additions" and the T0 ratification section. [AUTO-DECISION] (reason: the lead asked for the story section and this file only.)

## 4. Open after this ratification (owner)

- @qa: R-T0-2, R-T0-4, R-T0-7 (other half), R-11, R-40, R-B, R-J, R-4d proof method, R-5, R-EP harness half.
- @data-engineer: R-F2 co-sign (without it CLN-F2 is carried forward, never dropped).
- @devops: R-10 co-sign.
- @pm: carve-out A3 (010 CFC-01 text pending @pm); not an 011 blocker under R-T0-3 (b).
- @ux-design-expert: R-CO one-line approval.
- @dev: R-F1 feasibility; read `fixtures.json:10776` (`AWAITING_AUTH`) at T0 (R-B).
- root: R-T0-1, R-T0-2, R-T0-5 path announcement (RD-4), R-T0-6, R-08-3 co-ratification, the start-condition check.
- @po (next 009 pass): pointer at 009 AC-7 AUTHORED-ECHO-01 f for P-11's condition.
