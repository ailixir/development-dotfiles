# STUDIO-OBS-011 11-T0 record (start digest S_011)

- **Prepared by:** Aria (@architect), 2026-10-18, about 20:00–20:30 EDT, YOLO. Written while root's B1 baseline was running on a frozen tree.
- **Status:** MEASUREMENTS RECONCILED; W1 SIGNATURE WITHHELD. Root filled actual terminal B1/B7 results. B1 cause/coverage remain unresolved and B7 has one named unused-parameter red; no tree-open or W1 approval. Original prepared record is preserved at t0-record.before-resume2.md.
- **Replaces:** `../t0-prep-20261018/t0-record-draft.md` (sha256 `56162d71…`). The draft is not edited.
- **Companions (this folder):**
  - `lanes.v6.json` (sha256 `9489c71e…`): lanes, schedule, and the re-anchored lines in `anchorsS011` and `anchorDelta`;
  - `w-brief.v6.md` (sha256 `8b014812…`): lane rules;
  - `setup-receipt.md` (Dex, `57f00a92…`);
  - `start-capture.json` (`e73152e4…`), `start-head.txt`, `start-helm.txt`, `start-status.txt`;
  - `quoted-docs-s011.sha256` (`c8c4025c…`, written by Aria for this record);
  - `b1-baseline.sh` (root).
- **Rulings source:** `../t0-prep-20261018/t0-proposal.md` (`dc9c1376…`) §3, amended by the draft §5 (adopted here by reference, §5.1) and by the v3 amendments in §5.2.
- **Legend:**
  - **[V]** Aria read the bytes or ran grep, sed, shasum or `python3 -I` at S_011 today.
  - **[V Dex] / [V Quinn] / [V root]** verified by that agent, in the file cited.
  - **[I]** inference.
- **What Aria ran:** read-only grep, sed, cat, shasum, `uptime`, and `python3 -I` for JSON parsing, the per-file capture diff and the generation of `lanes.v3.json` and `w-brief.v3.md`.
- **Not run by Aria:** gradle, node, vitest, helm, docker.
- **Written by Aria (this folder only):** `t0-record.md`, `lanes.v3.json`, `w-brief.v3.md` and `quoted-docs-s011.sha256`.

---

## 1. Pre-start order: state at T0

| # | Step | State | Evidence |
|---|---|---|---|
| 1 | G9 ruled | **DONE.** The route was G9 → post-G9 batch → G9b → planning fix. | @qa local-validation record `STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md`, sha256 `bca21f53…`: `trigger: MET` under the user's C8 waiver, `isVerdict: false`, bound to source `061fc41f…`, dist `698a9365…`, helm `46070907…` [V header]. The G9 F1/F2 classes passed in G9b C8T (ReplayIT 46/46 + 62/62, TransportFaultIT 39/39) [V Quinn §1.2]. R1–R9 stay disclosed residue. |
| 2 | `g9-image.sh` | **DONE, GREEN.** Copied out of the scratchpad and run (OI-2 closed). | `STUDIO-OBS-009/local-gate-20261018/image/summary.json`: verdict GREEN, tag `obs009-g9-local`, `c4b_rc 0`, `d2_rc 0`, D2 step 6 "not scripted (owed)" [V] |
| 3 | 009 residue, one dist rebuild, deployment tier first-green | **DONE in G9b.** | `local-gate-20261018b/status.txt`: R0 clean/build/verifyRunnerDist exit 0; C1–C6 exit 0; **C4-runner-deployment exit 0** [V]. R0 dist = `698a9365…` = **D_009r** [V `capture-before.summary`]. Image `put-checks-studio-runner:obs009-residue-local`, `sha256:f8bcb563…`, created 2026-10-18T21:18:39Z [V `c4-image-inspect.json`]. OI-1 was closed by root under U22 terms (`STUDIO-OBS-009/execution-20261018/w0/decisions.md`, "OI-1") |
| 4 | 010 Live surface list dated | **DONE** at the G9b digest. | `STUDIO-OBS-010/live-surface-20261018/live-surface-list.json` sha256 `e5c58fa5…` [V recomputed]: 729 ids, 671 protected. Sign-offs: @architect (WITH-NOTES), @pm (ACCEPTED-WITH-NOTES), @po (16 removals). It was measured at `fd793c95…`. The drift to S_011 is 2 backend test files, which ruling A5 excludes, so no list entry moves (§11) |
| 5 | R4 local checkpoint commits | **DONE.** 7 category commits plus the receipt; no push. | `STUDIO-OBS-009/execution-20261018/r4-commits/receipt.md`. HEAD `b39359f78` [V]. Left ` M` at start [V `start-status.txt`]: `.aiox-core/core/permissions/dispatch-governance.js` (never staged), `.claude/agent-memory/aiox-devops/MEMORY.md` and `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md`. All three are outside the capture roots and outside every 011 write set [V]. 1768 `??` entries (collector and build output, by the receipt) |
| 5a | execute-011 collectors | **DONE** [V Dex `setup-receipt.md` §1]. | Five files with shas in the receipt. The 009 copies differ only in five path lines (tasked `:92`, `:112`; `run-backend.py:6`; **`run-runner.py:6`** (Quinn wrote `:5`); `run-runner-build.py:18`). I re-grepped them [V]. The execute-008 lock is kept. `run-frontend.py` is new. Output folder: **`docs/qa/evidence/STUDIO-OBS-011/execution/`** (root decision, §5.2 K-18) |
| — | Start conditions (story 0.2.16) | **Satisfied** [V story, "PO note — start conditions satisfied"]. | @po names one item for root to confirm at T0 [I per Pax]: that OBS-009 AC-11 D5 a–f (KL-015-D5) is covered, because record §7 does not list D5 row by row. **Root ticks it:** **root confirmed start mapping only**, resume-architecture/review.json teardownD5a–f and root-resume-decisions.md; no independent final credit |

## 2. Start digest set S_011

| Item | Value | Tag |
|---|---|---|
| HEAD | `b39359f78118d87be7d94a9429a5dde9d16634c8` (`start-head.txt`) | [V] |
| Capture | `start-capture.json`, captured 2026-10-18T23:53:58Z by `strict-qa-20261014/capture-manifest.py` | [V] |
| Source digest | **`061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`** (1808 files). This equals the 009 trigger-bound digest | [V] |
| Dist digest | **`698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`** (238 files). It equals **D_009r** | [V] |
| Helm | `start-helm.txt` (22 per-file sha256 lines). Its sha256 is **`4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8`** (`status.txt`), equal to G9b `helm-before` and `helm-after` (the same command) | [V] |
| Drift vs the G9b capture | **Exactly 2 files:** `backend/src/test/.../guided/translation/GuidedPlanningIntegrationTest.java` and `backend/src/test/.../support/ObservedPublicationFixture.java` (the 009 planning fix). Measured by a per-file diff of `local-gate-20261018b/capture-before.json` against `start-capture.json`. Everything under runner, frontend, contracts, tools and `.github`, and the dist, is byte-identical | [V] |
| Quoted docs | `quoted-docs-s011.sha256` (20 files, sha256 `c8c4025c87c8d023…`): <br>• the 008/014/015 stories that `COPY_SOURCE_FILES` reads; <br>• the 011 story (`500b671c…`) and inventory; <br>• the five STUDIO-OBS-008 evidence files; <br>• ADR-SC-006; <br>• `CLAUDE.md`, `AGENTS.md`, `ARCH.md`; <br>• `docs/qa/accessibility/*`; <br>• `docs/runbooks/*`. <br>Taken 2026-10-18 20:01 EDT, during B1. B1 is backend-only and writes none of these [I] | [V] |
| Quoted docs since G9b C6 | Every `COPY_SOURCE_FILES` doc, `CLAUDE.md`, `AGENTS.md` and `ARCH.md` has an mtime earlier than G9b `c6-frontend.log` (17:25). `axe-results.json` was last written at 17:23 by C6 itself | [V mtime; content identity [I]] |
| B4 runner image | `put-checks-studio-runner:obs009-residue-local` (`sha256:f8bcb563…`), built at G9b from source `fd793c95…` / dist `698a9365…`. Its studio-runner inputs equal S_011 (row "Drift") | [V], T0-IMG §4 |
| Load at capture | not recorded by `b1-baseline.sh`. Aria's sample during B1, 20:01 EDT: `uptime` load **5.82 / 4.87 / 4.36**. **Root adds** the `uptime`/`vm_stat` lines for the start and end of B1: `<…>` | [V] / root |

From here on, any tree edit before "tree open" (§14) voids S_011 and the baselines.

## 3. Baselines (R-T0-2 v2/v3, C7)

### 3.1 B1, backend `check` (root fills when B1 ends)

- **Command:** `t0/b1-baseline.sh`. Label `obs011-t0-baseline-check01`.
- **Tasks and skips file:** `--test-tasks test,guidedIncrementalTest,crossReplicaTest`, `--require-exec-tasks` the same three, `--allowed-skips-file docs/qa/evidence/STUDIO-OBS-011/execution/qa/approved-skips.json` (§3.3).
- **Gradle arguments:** `-- --continue check --rerun-tasks --no-daemon`, under the execute-008 lock.
- **Started:** about 19:53 EDT [V `b1-collector.log`: lock acquired after 0.0 s, the same capture summary].

| Field | Value (root fills) |
|---|---|
| Collector exit (`status.txt` "B1-backend-check exit=") | **1, RED**; terminal B1-DONE and actual collector receipt. No restart. |
| `sourceStable` / `distStable` / `testInputStable`; source digest before = after = `061fc41f…`; dist = `698a9365…` | **true / true / true**; actual source/dist hashes equal S_011 before/after. |
| `end-capture.summary` equals `start-capture.summary` | **equal** (1808 source / 238 dist files); independent archive/manifest audit confirms. |
| `taskCollectionComplete`; required exec tasks executed (`test`, `guidedIncrementalTest`, `crossReplicaTest`) | **true**; test, guidedIncrementalTest, crossReplicaTest executed with fresh nonempty XML/HTML/exec. Collection is not case/privacy success. |
| Counts per task: tests / passed / failed / skipped | test: **2711 / 2687 / 15 / 9**; guidedIncrementalTest: **62 / 62 / 0 / 0**; crossReplicaTest: **2 / 2 / 0 / 0**; total **2775 / 2751 / 15 / 9**. |
| Skip multiset vs the placeholder file (9 entries) | **equal**, nine exact approved task/class/name identities; qa/b1-terminal/audit.json. |
| Reds by name (classname, name, task) | All 15 exact task/class/name entries: resume2-b1-terminal-summary.json failures and qa/b1-terminal/audit.json. First native start failed before injection; cause unresolved; thirteen cleanup fail-stops and synthetic executionError preserved. |
| Check tasks: `spotlessCheck`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain` | spotlessCheck, checkstyleMain, checkstyleTest, spotbugsMain: **EXECUTED, no failure** (final task log). |
| **Coverage tasks executed** (`t0/b1-coverage-tasks.txt`): `jacocoTestReport`, `jacocoTestCoverageVerification`, `requireFreshGuidedPartitions` | **ABSENT each** in the actual final log. b1-coverage-tasks.txt is 0 bytes. The 009-owed gate/R-J remains open; no coverage credit. |
| **JaCoCo** (`t0/b1-jacoco/`): bundle LINE ratio; per-package floors met | **NOT MET / unverified**. Copied report SHA c02dbcd6… contains 27 old sessions ending 2026-10-18 03:24:36Z, before B1. Copy time is not freshness. See resume2-coverage-freshness-correction.json and qa/b1-terminal/assessment.md. |
| **T0-JC:** `com/citi/put/checks/studio/dispatch` LINE ratio | **UNAVAILABLE, RC-10 unresolved**; no dispatch/bundle headroom claim from stale XML. Fresh executed full-check/coverage evidence and explicit fold-cov01 ruling remain owed. |
| AC-5 "before" per-class wall times (the nine R-5 classes, from the archived XML) | qa/b1-terminal/assessment.md and timings JSON; all nine classes captured, default suite-time sum1783.715s; ReplayIT failed default1000.360s, incremental2758.790s separately. Failed/fail-stop sample is not a green timing baseline. |
| `uptime` / `vm_stat` at the start and end of B1 | Exact start/end samples were **not recorded** by inherited B1 script; do not reconstruct. Intermediate root samples are resume2-load-sample.json and earlier Aria sample. Current/final future runs must capture load at actual boundaries. |

**B1 outcome rules [ruled here].** These decide whether W1 starts.

| B1 outcome | W1 | Owner |
|---|---|---|
| exit 0; stable; the 3 coverage tasks EXECUTED | **starts** (§14) | — |
| Skip-policy mismatch only (exit 2, no red) | Starts once @qa rules the 011 skip multiset (§3.3). It is a policy difference, not a red | @qa |
| Red in a test file that a lane owns, where the cause is in the test. Example: Quinn's R7 watch, a `SHARED-CSI-DAY` 429 in a bridge, focus-mutation, evidence-pending or lifecycle class that G9b did not re-run | Starts. The red is recorded by name, the owning lane stabilises it (brief, hard rules), and it must be green at 11-G | the lane: GS-T2 (bridge ITs), IT-S (Focus/EvidencePending), GS-T (LifecycleReasonIT/SessionIT/TransportFaultIT), IT-R (ReplayIT) |
| Red in main code, or in a test no lane owns | **Root rules before W1.** Per the 009 record §1.4 and Pax, a B1 red reopens the 009 case it names | root (+ @qa) |
| `jacocoTestCoverageVerification` fails, or the coverage tasks did not execute | **Root rules before W1.** This is the 009-owed gate (C8 waiver) | root (+ @qa) |
| `sourceStable` or `distStable` false | B1 does not count; it is re-run | root |

### 3.2 B2–B7: root option B and actual fresh B7

The rest of the 11-G suite list (C7) still needs a "before". The tiers are B2 runner unit, B3 runner fixtures, B4 runner deployment, B5 runner type-check/lint/pins, B6 contracts and codegen, and B7 frontend. Commands are in `lanes.v6.json` `11-T0.verify`: B4 now names the image, and B7 uses `run-frontend.py`.

- **Option A (recommended): run B2–B7 fresh, in sequence, right after B1 and before "tree open".**
  - Cost: about 7 min for B2–B4 at G9b timings (unit 16 s, fixtures 313 s, deployment 79 s [V `obs009-g9b-runner-*-results.json`]), plus B5–B7. Total about 20–30 min [I].
  - Gain: every 011 "before" sits at one digest and is credited, and K-1 (fresh, no reuse) holds.
  - W1 agents dispatched at B1 green plan in their receipt folders during this window (brief, "Before the tree opens").
- **Option B: carry B2–B6 from G9b C1–C5 (and C4 deployment), run only B7 fresh.**
  - Basis: the per-file identity is verified (§2, "Drift"), the same carry @qa used in the 009 record §1.2(5). The G9b runner collectors have per-name vitest JSON.
  - Why B7 cannot be carried: C6 has no per-name report (plain `vitest run` inside `c6-frontend.log`; 70 files, 1386 tests), and AC-7 reconciles frontend by name.
  - Saves about 10–15 min [I]. Costs a K-1 exception, plus `final <- baseline` arithmetic across two capture events.
- **[AUTO-DECISION]** Recommend A, because the time saved does not pay for a second baseline provenance at 11-G (G8 digest chain).
- Root picks: **B**, inherited and revalidated: G9b B2–B6 input identities are unchanged (only two backend tests differ), fresh B7 is terminal. Historical deployment receipt contains642 passing cases; exact image content remains locally inspectable by sha256 even though its former tag is absent (resume2-image-availability.json).

| Id | Label | Exit | Counts (tests / skipped / failed) | Reds by name |
|---|---|---|---|---|
| B2 runner unit | **carried obs009-g9b-runner-unit01** | 0 (historical) | 2672 total /2643 passed /29 skipped /0 failed; per-name JSON | none; current fresh unit rerun owed at11G |
| B3 runner fixtures | **carried obs009-g9b-runner-fixtures01** | 0 (historical) | 305 total /296 passed /9 skipped /0 failed | none; historical carry exception disclosed |
| B4 runner deployment | **carried obs009-g9b-runner-deploy01** | 0 (historical) | 642/642, zero skips/failures | current exact imageId f8bcb563… exists; old tag missing; no fresh C4 rerun |
| B5 runner type-check, lint, check:pins | **G9b carry** | 0 each (historical) | C1/C5 in local-gate-20261018b/status.txt | input identity verified; fresh final gates still owed |
| B6 contracts + codegen check | **G9b carry** | 0 each (historical) | C5-contracts/C5-codegen | unchanged contracts/generator inputs; fresh final gates owed |
| B7 frontend | **fresh obs011-t0-frontend01 plus four companions** | wrapper1; unit/type/lint/build0; unused2 | 1386/1386 unit assertions, zero skips/failures, all five valid stable receipts; hostNode23.10.0/pnpm10.33.0; axe unchanged/restored byte-exact | sole TS6133 ReportsPage.tsx144 event unused; v6 assigns exact off-tree rename to11FE; old baseline remains red |

### 3.3 Approved skips

- **Placeholder used by B1:** `execution/qa/approved-skips.json`, sha256 `c6f16987…`. It is a byte copy of 009's ruled file: 9 entries, all on `test` [V Dex §4].
- **@qa** derives the 011 file from the B1 skip multiset, reviewed against 009's list and reconciled against what 011 retires or ports.
- **[AUTO-DECISION] Path:** `t0/qa/approved-skips.json`, which `lanes.v6.json` 11-G G1 now names. The placeholder stays untouched as B1's archived input, so B1's provenance is never rewritten.
- **@qa record:** sha256 `6bd2a808a40a707397757b3ff4f1a78e5eff8ee37666c7b26271582b14457cac`, derived2026-10-18; final exact skip multiset reconciled by qa/b1-terminal/audit.json.

## 4. T0 checks

| Id | Result | Tag |
|---|---|---|
| T0-AW | **PASS → branch A.** `org.awaitility:awaitility:4.2.2` resolves offline on `testRuntimeClasspath` (output line 599) and `testCompileClasspath` (line 534), transitively from `spring-boot-starter-test` 3.3.5. Both runs `BUILD SUCCESSFUL`, exit 0, under the lock; no build file changed | [V Dex §2] |
| T0-JC | NOT MET: stale copied XML, absent coverage tasks, RC-10 headroom unresolved (§3.1) | root + independent QA |
| T0-SL | `grep -c '\.sleep('` at S_011, per file:<br>• `GuidedPublicationReplayIT` **95** (94 `Thread.sleep`);<br>• `GuidedServiceTransportFaultIT` 14;<br>• `GuidedBridgePlannedIT` 4;<br>• `GuidedPublicationRaceTest` 2;<br>• `GuidedFocusMutationJoinedIT` 2;<br>• `GuidedEvidencePendingAppendJoinedIT` 2;<br>• `GuidedBridgeIntegrationTest` 2;<br>• `GuidedPlanningIntegrationTest` 1;<br>• `SecretUseAuditIT` 1.<br>**Total 123.** Not R-5 classes: `GuidedSessionIT` 0, `GuidedLifecycleReasonIT` 0 | [V] |
| T0-P7 | `actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue` (`@Order(27)`, `:21907-21911`) and `actualScopedVaultOutageThenFreshSecretAttemptResolvesRotatedValue` (`@Order(28)`, `:21913-21917`). Both call `p7CapturedFaultAndRetry`, and they share static `P7_OUTAGE_SCOPE` (`:21919`; read again at `:29475-29479`). Both names are also in the ReplayIT name list at `:246-247` | [V] |
| T0-FQ | 36 FQCNs in the lane plan. **31 existing classes each declare exactly the named package.** The other 5 are new files: `DispatchAuthorizationIT`, `PublicationGrantClockIT`, `GuidedAdmissionWithoutTranslationIT`, `GuidedResultPublicationDisabledIT`, `GuidedTeardownShedTest` | [V `python3 -I`] |
| T0-RB | `fixtures.json:10776` is in the row `:10768-10778`, "refresh cannot resume unsupported auth pause", `expected: REFRESH_STATE`. It is a negative row → guard text, kept (AC-7 known exception). This agrees with Dex | [V] |
| T0-IMG | **PASS by file identity and current exact-image inspection**: see §2, row "B4 runner image". Docker is barred during B1, so root re-checks that the image exists before B4 | [V] / root |
| T0-SB | **Candidates [V grep]; the exact lists are @dev's (read-only, may run now, §14).**<br>• **Runner** tests that read outside `studio-runner/`: `test/deployment/helm.ts`, `test/disclosure.test.ts`, `test/helpers/observedNativeEvidence.ts`, and 10 `test/fixtures-tier/*` files. They reference `STUDIO-OBS-007/runner-*` (named JSON files and prefixes), `STUDIO-OBS-007/r-stale-grant-candidate/native-facts.json`, `STUDIO-OBS-013/r13/sec001-guided-video-oracle.json`, `STUDIO-OBS-015/native-fixtures/r1`, and three `STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation/*` folders, plus `helm-chart/`. `backend/src/main/resources/application.yml` is read by `test/deployment/backend-env.test.ts` (`:378-380`), so the runner sandbox also needs that one backend file. The fixtures and unit tiers may read more; that is for @dev's exact list.<br>• **Frontend:** the 15 `COPY_SOURCE_FILES` paths (`guidedNarratives.ts:46-62`), and 31 `frontend/src` files that mention `docs/…` or `REPO_ROOT`. Most of them are comments; @dev separates the real reads | [V] / @dev |
| T0-EP | **OPEN.** No written confirmation from the 009 T4 harness owner yet. Without it, 11-RT carries both deletions (R-EP v2). Does not block W1 | — |
| Live surface | §11 | — |
| reverify | `lanes.json` v1 `t0.reverifyCommands`: @dev, read-only, may run now (§14). Output `t0/early/t0-dev/reverify.md` | @dev |

## 5. Rulings

### 5.1 Adopted from the draft

The draft (`../t0-prep-20261018/t0-record-draft.md`, sha256 `56162d712ba4ab85…`) is adopted verbatim and is part of this record by reference:

- §5.1, amended rulings: R-T0-2 v2, R-T0-4 v2, R-T0-5 v2, R-T0-6 v2, R-F1 v2, R-4a v2, R-4b v2, R-5w v2, R-EP v2, R-5 v2, R-11 v2, plus the unchanged list;
- §5.2, conflict rulings K-1 to K-16.

Only §5.2 below changes them. Two factual corrections apply to the draft text:

- **R-F1 v2:** `repository.insertAction` is at **`:1441`**, not `:1440`. `attachAdmission` is at `:1443`. The admission guard site is `:1442`, unchanged. `GuidedSessionService.java` is byte-identical to the pre-start measurement (`cad1efa3…`), so every other F-1 line in the draft stands [V].
- **R-11 v2:** surfaces 4 and 5 are `:320-349` (surface 4 `:320-331`, surface 5 `:333-349`). The pinned keys are `:99-100`. `:312` is surface 3, which stays [V].

### 5.2 v3 amendments (T0)

| # | Ruling | Why / trade-off |
|---|---|---|
| R-5w v3 | **Branch A.** Lanes call `org.awaitility.Awaitility` directly, with the brief's convention (`atMost` = the old deadline, `pollInterval` = the old interval, `pollInSameThread` where state is thread-bound, `alias` = the condition name). **No `Await.java`, no shared wrapper, no `build.gradle.kts` edit.** It is removed from 11-LEFT's write set and from the baton table. | Asked: "unless your plan wants a helper anyway". It does not. A helper would be a new baton file read by four lanes (IT-R, IT-S, GS-T2, GS-T), and Awaitility already names the failed condition in its timeout message. Cost: consistency rests on the brief convention instead of on one type, so @qa checks the convention in receipts. Private `await` copies outside write sets stay (no bonus refactor). |
| K-1 v3 | Fresh baselines stay the rule. B2–B7: option A (fresh) recommended; option B (G9b carry for B2–B6) allowed by root (§3.2). | K-1's original reason (the residue voids reuse) no longer holds against G9b, which is post-residue and differs from S_011 in 2 backend test files only. The remaining reason is single provenance for the G8 digest chain. |
| K-17 | **11-IT-R prep starts now, during B1**, read-only, and writes to `t0/early/it-r/` until "tree open", then to `execution/it-r/prep/`. 11-RT takes the first W1 slot that frees. | IT-R prep needs no tree write and no run, and B1 idle time is free capacity. It removes IT-R prep's dependency on RT (v2) and keeps W1 at the 5-agent cap. RT has float (needed at 11-MERGE, day 9 [I]). |
| K-18 | **Evidence folder** (root decision, recorded): collector output is `docs/qa/evidence/STUDIO-OBS-011/execution/`; lane receipts are `execution/<lane>/`; T0 material is `t0/`. The 11-G folder stays `final-<date>/` (not part of the decision). | It matches the five repointed collector lines and the existing folder. Text aligned in `lanes.v6.json` and `w-brief.v6.md` [V: no `execution-<date>` or `t0-<date>` left; `final-<date>` is the only `<date>`]. |
| K-19 | **"Tree open"** is a root announcement after B1 (and B2–B7 under option A). W1 agents may be dispatched at B1 green, but their first write under a capture root, under `helm-chart/` or to a quoted doc waits for it. | It keeps every T0 baseline at one digest without idling the W1 agents. |

## 6. @qa C1–C8: all resolved

| # | Change | Resolved | Where |
|---|---|---|---|
| C1 | Reuse conditions (helm sha, quoted docs, reds, deployment tier, patches before capture, load) | **Yes** | §2 rows Helm, Quoted docs, Load; §3 (fresh; reds by name; B4 with image); K-1 v3 |
| C2 | 11-G digest chain, `D_011`, executed-tasks grep, archived-XML reconciliation, load record, deployment image | **Yes** | `lanes.v6.json` 11-G G1a, G4, G8, G9, `uptime`/`vm_stat`; 11-MERGE D-1 |
| C3 | Red commands, mutation protocol, F-1 five sites, AST self-test, positive greps | **Yes** | `w-brief.v6.md` "Red-first and mutation protocol"; `lanes.v6.json` `RED_FORM`/`MUTANT_FORM`, 11-GS-M and 11-FOLD-prep `red`/`mutants`, 11-RT AST self-test; R-F1 v2 (§5.1, insertAction corrected) |
| C4 | F-1 proof in a write-freeze window | **Yes** | 11-GS-M part b FREEZE WINDOW; brief "Evidence model"; R-T0-4 v2 |
| C5 | execute-011 repoints every hard-coded path; 008 lock kept; frontend collector | **Yes, done** [V Dex §1, §3] | §1 row 5a; `run-runner.py:6` corrected in `lanes.v6.json` `commandConventions.rules` |
| C6 | `StudioKillSwitchWiringTest` in 11-LEFT | **Yes** | 11-LEFT writes; anchor `:252` SAME (§10) |
| C7 | T0 baseline mirrors the 11-G suite list | **Yes** (B1 running; B2–B7 per §3.2) | §3; `lanes.v6.json` 11-T0 verify |
| C8 | `\.sleep(` census, P7 names, R-11 note, post-MERGE smoke | **Yes** | §4 T0-SL (95; total 123), T0-P7; R-11 v2 range corrected (§5.1); 11-MERGE `obs011-merge-smoke01` |
| 4.5 | Refusal before `insertAction`; zero-row tables | **Yes** | R-F1 v2 (`:1441`) |
| Ruling co-signs | R-T0-4, R-T0-7, R-11, R-40, R-B, R-J, R-4d, R-5/R-5w, R-EP (harness half) | Signed [V `qa-cosign.md` §5]. R-T0-2 was conditional on C1, now met. R-B: T0-RB done. R-EP: confirm `browser-oracle.test.mjs` by name in 11-RT | — |

## 7. @dev RC-1–RC-10 and N-1–N-7: all resolved

| # | Resolved | Where |
|---|---|---|
| RC-1 worker-profile wiring, three methods, worker gate | **Yes** | R-4b v2; 11-FOLD-prep writes (`PublicationGrantAuthority`), `foldp-02`, `foldf-01`; worker assertion re-anchored to `assertObservedWorker` `:32466-32483` |
| RC-2 transports, timeouts, HTTP version, gating, per-call limits, constructors, visibility | **Yes** | R-4a v2; constructors `:81`, `:99` public, `:107` private; `observeRequestBytes` `:133` package-private [V]; 11-FOLD-final `DispatchTestAccess.java` |
| RC-3 KillSwitch test, LifecycleReasonIT, production-access migration, GS-T size L | **Yes** | 11-LEFT, 11-GS-T writes/acs |
| RC-4 F-1 placement, rollback, `clarify` single site, helper grep | **Yes** | R-F1 v2 (+ `:1441` correction); K-4 |
| RC-5 Awaitility present; IDS of private copies; helper placement | **Yes, closed by T0-AW** | R-5w v3 (branch A, no helper); the private copies re-anchored in `anchorsS011` (Planning `:3899`, TransportFaultIT `awaitTeardown :4692`) |
| RC-6 sandboxes, dist rule, emit compare | **Yes** | R-T0-6 v2; K-5; T0-SB candidates (§4), adding `application.yml` to the runner sandbox list |
| RC-7 residue ordering voids reuse | **Yes** | §1 (residue before S_011); K-1 v3 |
| RC-8 R-EP vs the live 009 harness | **Yes** | R-EP v2; T0-EP open (carry if absent) |
| RC-9 runner mentions of `GuidedRunnerClient` | **Yes** | K-8; anchors `guidedBrowser.ts:26`, `runtime.test.ts:36`, `guidedCloseBound.test.ts:43`, all SAME |
| RC-10 JaCoCo `dispatch` headroom | **Pending B1 read** | §3.1 T0-JC |
| N-1 staged units | **Yes** | brief "Command conventions" |
| N-2 a01 noise | **Yes** | K-10 |
| N-3 C-OBS009-1 seam | **Yes** | 11-GS-M acs (a); anchors SAME |
| N-4 C-OBS009-2 | **Yes** (no change) | R-09-2; `:20` SAME |
| N-5 fallback pin | **Yes** | 11-GS-M acs; `GuidedObservationPrunerIT` in a01 |
| N-6 AC-1 deltas | **Yes**; for @po to record | 11-FOLD-final acs; §4 T0-P7 |
| N-7 Live surface | **Yes** | §11 |
| §3 collisions | **Yes**, by order | §1; brief "What is already in the tree" |
| Verdict | SIGN-WITH-NOTES, conditional on the fold | Dex confirms the fold in §15 |

## 8. @devops (Gage): all resolved

| Item | Resolved | Where |
|---|---|---|
| Landing order, steps 0–6 | **Yes, executed** (step 7 = this record; 8–9 are the waves and 11-G) | §1 |
| Step 10 push | **Not authorized** (K-12). Unchanged | — |
| Commit grouping C-1–C-7 | **Yes, done** | R4 receipt (7 commits + receipt) |
| D-1 local image + `check:pins --require-image` | **Yes** | 11-MERGE, 11-G G4/G5 (user 011 Docker decision) |
| D-2 dist not committed | **Yes** | brief "Runner dist" |
| D-3 catalog follows the image | **Carried to @devops** (release note; not a 011 lane) | — |
| D-4 copy-table sources committed | **Yes, done** | R4 commit 6 carries the 6 files by name [V receipt] |
| D-5 stray files | **Partly.** `frontend/src/.claude/agent-memory/{aiox-pm,aiox-ux}` is still present [V] → CLN-58 at 11-MERGE. `studio-runner/short.webm` is still present, untracked [V] → @devops at commit time | — |
| D-6 R-4d proof script under evidence | **Yes** | 11-RT writes `$EV/rt/**` |
| X-1 | **Yes** | §1 row 2 |
| X-2 | **Yes** | K-1 / K-1 v3 |
| X-3 deployment tests first-green | **Yes** | G9b C4-runner-deployment exit 0 [V] |
| X-4 Live surface re-date | **Yes** at the G9b digest; the second re-date after 009 Done is not covered (@pm note 4) | §11 |
| X-5 `application.yml` observed-replay block unchanged by 11-LEFT | **Yes** | 11-LEFT verify. The block starts `:264`; LEFT edits only `:376` [V] |
| X-6 runbook §14 UAT note before 11-DOC | **Yes, met** | `docs/runbooks/studio-runner.md` §14 at `:945` carries "UAT breaks on upgrade unless…" [V] |
| X-7 catalog producer | **Yes, landed** | `studio-runner/scripts/print-observed-catalog.mjs` present [V] |
| X-8 sandbox copy after the tests patch | **Yes** | sandboxes are seeded from S_011 after B7 |
| X-9 CLN-44 count | **Yes** | 11-DOC inventory addendum. Count at S_011: 61 distinct `STUDIO_RUNNER_*` names in `helm-chart/` [V grep] |
| X-10 dirty base files | **Yes, closed** by the R4 commits | brief "What is already in the tree" |
| CLN-10 co-sign (R-10) | **Yes, accepted** [V `devops-cosign.md` §1] | — |

## 9. @po (Pax): all resolved or recorded

| Item | Resolved | Where |
|---|---|---|
| RD-1 no 11-GT / no split | **Yes** | `lanes.v6.json` `droppedLanes` |
| RD-2 hand reformat + AST proof | **Yes** | 11-RT |
| RD-3 no 11-RO / 11-RO-BE | **Yes** | `droppedLanes` |
| RD-4 execute-011 collectors | **Yes, done** | §1 row 5a; K-18 |
| P-1 AC-3 resolved by 009 | **Yes** | 0 Java emitters; `V16__scheduling.sql:128,130` stays [V] |
| P-2 AC-1 corrections bind at S_011 | **Yes** | §10 and `anchorsS011` |
| P-3 MNT-003 not in 011 | **Yes** | — |
| P-4 `.ai/` kept tracked | **Yes** | R4 commit 7 carried `.ai/` |
| P-5 CLN-10 carried, owner @devops | **Yes** | @devops co-signed |
| P-6 CLN-20 present | **Yes** | `StudioService.java:389-398` SAME |
| P-7 class names | **Yes** (story note) | — |
| P-8 CLN-57…60 | **Yes** | CLN-57 11-LEFT (directory still empty [V]); CLN-58 11-MERGE; CLN-59 record; CLN-60 R-C5 (strings re-anchored, §10) |
| P-9 R-T0-7 | **Yes** | brief "Evidence model" |
| P-10 R-EP + guard | **Yes, guard binding** | T0-EP open → carry if absent |
| P-11 R-08-3 | **@po half yes.** Root co-ratification `<root ticks>` | 11-FE starts only after it |
| P-12 `runner-origin` not merged | **Yes** | §11 |
| AC-1 deltas (`GuidedRunnerClientTest`/`ObservedValidationClientTest` absent; P7 names) | **For @po to record** (no AC text change) | §4 T0-P7 |

## 10. Re-anchored line numbers at S_011

The full per-lane table, with file, pre-start value, S_011 value and status, is `lanes.v6.json` → `anchorsS011`. Every row was re-taken today with grep or sed [V]. A line binds only while the file's sha256 is unchanged, so lanes re-grep the symbol before each edit.

**Anchor delta (only rows that changed):**

| Lane | Anchor | File | Pre-start | S_011 | Kind | Cause |
|---|---|---|---|---|---|---|
| 11-GS-M | `repository.insertAction` | `GuidedSessionService.java` | `:1440` | **`:1441`** | corrected | pre-start text off by one (file unchanged) |
| 11-GS-T | `translationTeardownService` users | `GuidedServiceTransportFaultIT.java` | `:4132`, `:4191`, `:4224` | **`:4145`, `:4204`, `:4237`** (decl. `:4487`) | moved +13 | 009 F2 fix. Sha `8cbc0207` → `97162010`; 5771 lines; still 31 `@Test` + 1 `@ParameterizedTest` |
| 11-IT-S | private await | `GuidedServiceTransportFaultIT.java` | `:4679` | **`awaitTeardown :4692`** | moved +13 | same |
| 11-IT-S | private await | `GuidedPlanningIntegrationTest.java` | `:3872` | **`:3899`** | moved +27 | planning fix (sha `9c68ac5b`) |
| 11-LEFT | `sse.read-interval` leaf | `application.yml` | `:375` | **`:376`** | moved +1 | post-G9 batch. `read-interval-ms` `:378` stays (read by `SnapshotBroadcaster:79`) |
| 11-IT-R | P7 tests | `GuidedPublicationReplayIT.java` | `:21893-21909` | **`:21907-21917`** | moved | model-sizing + F1 diagnostic. Sha `b8b10df4`, 34454 lines |
| 11-IT-R | `P7_OUTAGE_SCOPE` | same | `:21906`; `:29462` | **`:21919`**; **`:29475-29479`** | moved | same |
| 11-IT-R | `recordEvidence` labels (R-21 exception) | same | `:29726`, `:30232`, `:30353` | **`:29755`, `:30261`, `:30382`** | moved +29 | same |
| 11-FOLD-final | worker assertion | same | `:32463` | **`assertObservedWorker` `:32466-32483`** | symbol anchor | same |
| 11-FOLD-final | C5 class-name strings (R-C5) | same | `:1413`, `:30044`, `:31468` | `:1413`, **`:30073-30075`**, **`:31497`** | moved | same |
| 11-FOLD-final | other client-name references | same | `:5592`, `:5613`, `:5618`, `:9181` | **`:5605`, `:5626`, `:5631`, `:9194`** | moved +13 | same |
| 11-FOLD-final | stale `claim` line pin; sampler flag | same | `:30180`; `:31677-31679` | **`:30209`**; **`:31624`, `:31706`** | moved | same |
| 11-RT | `browser-oracle` comment (AC-7 exception) | `evaluation/cli.mjs` | `:29` | **`:39-40`** | moved +10 | model-sizing added `proposalPlanFromFlags` (`:25-33`) |
| 11-RT | compile-era commands | `evaluation/cli.mjs` | `:27-48` | **`:38-59`** (usage `:143`) | moved | same |
| 11-FE | R-11 surfaces 4/5 | `studioWcagAudit.test.tsx` | `:312-348` | **`:320-349`** | corrected | `:312` is surface 3 |
| conventions | `guidedIncrementalTest` | `build.gradle.kts` | `:278-291` | **`:278-289`** | corrected | — |
| conventions | collector path line | `run-runner.py` / `run-runner-build.py` | `:5` / — | **`:6`** / **`:18`** | corrected | Dex §1 |

**Unchanged and verified [V]:**

- **`GuidedSessionService.java`** (sha `cad1efa3`, identical to pre-start):
  - every F-1 guard and site: `:177`, `:191`, `:405`, `:370`, `:846`, `:880`, `:1442`, `:2013`; `attachAdmission` `:1443`;
  - `instanceof` `:660-663`, `:735-740`;
  - C-OBS009-1: `:32`, `:39`, `:2757`, `:2794-2808`, `:1659`, `:1670`;
  - C-OBS008-1: `:759-763`, `result` `:2881`;
  - `recordEvidence` `:1701`; `claim` `:944`; `admitChecked` `:1276`; `bootstrap` `:1985`; `clarify` `:791`.
- **GS-M neighbours:** controller `:59-75`/`:74` (`176c6cbb`); projector `:128`; `GuidedSessionIT` `:593`, `:596` (`4d47ad6f`); repository `transaction` `:34`; configuration `:91`, `:104-107`, `:129`.
- **11-LEFT targets:**
  - `ExecutionStatus` `:20`, `:26`; `StudioService` `:389-398`;
  - CLN-21: `:69`, `:95`, `:249`, `:20`, `:142`, `:160`, `:197`, `:212`;
  - KillSwitch `:252`; `StudioSecretsService` `:56-60`;
  - JaCoCo rules `:484`, `:539`;
  - CLN-F2 fixture and migration lines.
- **R-9 and FOLD:**
  - R-9 sites `:85`, `:96`, `:50`, `:101`, `:118`, `:136`, `PublicationBudget:18`, `DatabaseClock:26`, `ObservedReplayRuntimeConfiguration:58`;
  - RC-1 callers `:67`, `:193`, `:85`, `:82`;
  - `StudioRunnerConfiguration:20`;
  - C-OBS009-4: `:137`, `:334`, `:45`;
  - README `:203`; `checkCommand` `:1408`.
- **Runner and contracts:** `guidedBrowser.ts:26`; `runtime.test.ts:36`; `guidedCloseBound.test.ts:43`; `evaluation/README.md:45`; `evaluate.d.mts:2`; `corpusPages.test.ts:7`, `:122`; `fixtures.json:10776`, `:13711`; `result.schema.json:176`; `check-…cjs:1043`.
- **Frontend:** `pinnedVideoEvidenceFacts.ts:74`; `COPY_SOURCE_FILES :46-62` (`f8f68c01`); `:346`; `handlers.ts:164`, `:177` (`61df7a97`); `frontend/README.md:56`, `:60`; `RunDetailsDrawer.tsx:357`; `GuidedCompletion.tsx:125-127`.
- **Docs:** `CLAUDE.md`/`AGENTS.md` `:81-82`, `:142`; `ARCH.md:39-40`, `:52`, `:101`; rollout `:133`, `:137`; `studio-runner/README.md` and runbook C-OBS009-3 anchors.
- **Build:** `verifyRunnerDist` `:295-341`.

## 11. Live surface intersection (R-T0-3)

- **List:** `STUDIO-OBS-010/live-surface-20261018/live-surface-list.json`, sha256 `e5c58fa5…`, 671 protected ids [V]. It is valid for S_011: the only drift from its measured digest is the 2 test files of the planning fix, and test tooling is excluded by ruling A5 [V `finalize-record.md`].
- **Pre-ruled:**
  - `studio.execution.sse.read-interval` (CFB-078) is **EXCLUDED** (010 ruling A2), so 11-LEFT may delete it;
  - CFB-079 `read-interval-ms` stays protected and no lane touches it [V];
  - `runner-origin` is not merged (P-12).
- **Intersection of every `lanes.v6.json` write set with the 671 protected ids:** `<@dev T0-DEV result: 0 / items stopped by name>`. This is read-only work and may run now (§14).

## 12. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| OI-1 | post-residue image | — | **closed** (root, U22 terms) |
| OI-2 | `g9-image.sh` in a scratchpad | — | **closed** |
| OI-3 | R-F2 co-sign (@data-engineer); R-CO (@ux-design-expert); T0-EP (009 T4 harness owner) | named | Only the CLN-F2 part of 11-LEFT, the R-CO part of 11-FE and the two 11-RT deletions. Each carries by name if absent |
| OI-4 | `GuidedAdmissionWithoutTranslationIT` name | — | **closed** (kept) |
| OI-5 | B2–B7 not run; option A or B | root | "tree open" |
| OI-6 | @qa-derived 011 approved-skips (`t0/qa/approved-skips.json`) | @qa | 11-G only. It blocks W1 only if B1 exits 2 on skip policy (§3.1) |
| OI-7 | Story Status Ready → InProgress when the first lane starts (story lifecycle) | @dev (the dev-develop-story start) / @po | no |
| OI-8 | D5 a–f start check (§1, last row) and R-08-3 co-ratification (§9 P-11) | root | D5: no. P-11: 11-FE only |

## 13. What "green" means for the dispatch

**B1 green** = collector exit 0, `sourceStable`/`distStable` true, the 3 coverage tasks EXECUTED and passed. Under option A, B2–B7 then run, and root announces "tree open". The §3.1 outcome rules decide the other cases.

## 14. Dispatch

### 14.1 Read-only, may start now during B1

**Write area.** Each of these agents writes only under `t0/early/<lane>/` and uses light commands only (brief, "Before the tree opens"). Root's B1 rules apply in full.

**Load.** Keep it to about three concurrent agents. Load is already 5.8 [V `uptime`], and B1 gives the AC-5 "before" times.

| Lane / task | Agent | What | Brief pointer |
|---|---|---|---|
| **11-IT-R prep** | aiox-dev (Dex) | POLL/DELIBERATE table for all 95 `.sleep(` calls; TEST-001 design for the P7 pair (§4); the draft patch cut against ReplayIT sha `b8b10df4`. Timebox ≤ 1.5 d. Writes `t0/early/it-r/`, then `execution/it-r/prep/` after "tree open" | `lanes.v6.json` `lanes[id=11-IT-R]` + `anchorsS011["11-IT-R"]`; `w-brief.v6.md`; K-16, K-17 |
| **T0-DEV** | aiox-dev, read-only | T0-SB exact runner and frontend copy lists; v1 `reverifyCommands`; the Live surface intersection (§11); a mechanical write-overlap check and a `python3 -I` parse of `lanes.v6.json`. Writes `t0/early/t0-dev/` | `lanes.v6.json` `t0`, `lanes[id=11-T0].duties` |
| **Co-sign requests** (short) | @data-engineer; @ux-design-expert; the 009 T4 harness owner; @qa and @dev | R-F2 co-sign; R-CO yes/no; T0-EP one dated line; @qa and @dev confirm the C1–C8 / RC-1–RC-10 fold for §15 | `t0-proposal.md` R-F2, R-CO; draft R-EP v2; this §6–§7 |
| *Optional:* **11-FOLD-prep, read-only part** | aiox-dev (Dex, fold) | The R-4a v2.1 before-transport table and the RC-1 wiring map (no code). It gives the near-critical L-XL lane a head start. Writes `t0/early/fold/`. Only if load allows | `lanes[id=11-FOLD-prep]` + `anchorsS011["11-FOLD-prep"]` |

### 14.2 W1: dispatch the moment B1 is green

The agents plan in `execution/<lane>/` at once. They make their first tree write at "tree open" (K-19).

| # | Lane | Agent | Starts with | Brief pointer |
|---|---|---|---|---|
| 1 | **11-GS-T** (critical path) | aiox-dev, backend tests | AC-2 F-1 b: positive admissions → planner-issued obligations; `GuidedLifecycleReasonIT` | `lanes.v6.json` `lanes[id=11-GS-T]`, `anchorsS011["11-GS-T"]`; `w-brief.v6.md` |
| 2 | **11-GS-M part a** | aiox-dev, backend main | C-OBS009-1 a–e and C-OBS008-1 a–g (R-08-1e `REFUSED`), red-first | `lanes[id=11-GS-M]`, `anchorsS011["11-GS-M"]`; R-F1 v2 (`:1441`) is for part b |
| 3 | **11-LEFT** | aiox-dev, backend (+ @data-engineer for CLN-F2 only after the R-F2 co-sign) | CLN-19/20/21, C-OBS008-2, R-J, CLN-57, AC-3 record. No `Await.java` (R-5w v3) | `lanes[id=11-LEFT]`, `anchorsS011["11-LEFT"]` (`application.yml:376`) |
| 4 | **11-FOLD-prep** (near-critical) | aiox-dev, backend fold | R-4a v2 transport table, then R-4b v2 / R-9 / C-OBS009-2/4 / R-B README | `lanes[id=11-FOLD-prep]`, `anchorsS011["11-FOLD-prep"]` |
| 5 | **11-IT-R prep** (continuing from 14.1) | the same agent | — | as in 14.1 |

**As slots free (cap 5):**

| Lane | Agent | Starts when | Brief pointer |
|---|---|---|---|
| **11-RT** (sandbox) | aiox-dev, runner | Root has seeded the sandbox from S_011 after B7, using the T0-DEV lists. The two deletions wait for T0-EP | `lanes[id=11-RT]`, `anchorsS011["11-RT"]` |
| **11-FE** (repo-shaped sandbox) | aiox-dev, frontend | R-08-3 co-ratified by root; the R-CO part waits for @ux | `lanes[id=11-FE]` |
| **11-DOC** | aiox-dev or root | X-6 is met | `lanes[id=11-DOC]` |

**Later waves are unchanged** (`lanes.v6.json` `waves`):

- **W2:** GS-M part b with the F-1 freeze window.
- **W3:** IT-R apply, IT-S and GS-T2. They wait only for GS-M part b, not for a wait helper.
- **W4:** FOLD-final.
- **W5:** MERGE.
- **W6:** 11-G.

### 14.3 Still blocking W1

1. **The B1 result** (§3.1) and the T0-JC read.
2. **Root's decision on B2–B7** (option A or B, §3.2), then "tree open". Under option A this is about 20–30 min more [I].
3. **Root's signature** of this record (§15), with **@qa and @dev** confirming the fold. They can do this during B1.
4. **For 11-RT and 11-FE only:** the T0-DEV sandbox lists and root's sandbox seed after B7.

Not blocking W1:

- R-F2, R-CO and T0-EP, which carry by name (OI-3);
- the @qa-derived skips file (OI-6), unless B1 exits on skip policy;
- the D5 tick (OI-8).

## 15. Signature

- **Root measurement reconciliation:** Orion, 2026-10-19T02:25:23.652923+00:00. Actual B1/B7/source identities filled; optionB recorded; current planv6 adopts v4/v5 constraints. **W1/tree-open signature WITHHELD** for unresolved B1 native cause and missing executed coverage. Only status-only011unit completed and prospective reviewed diagnostic remediation is considered; no general source write permission.
- **@qa (Quinn):** C1–C8 fold confirmed `<…>`; approved-skips `t0/qa/approved-skips.json` sha `<…>`; B1 reconciliation `<…>`.
- **@dev (Dex):** RC-1–RC-10 fold confirmed `<…>`; T0-DEV (T0-SB, reverify, intersection, overlap, JSON parse) `<…>`.

## Root post-baseline disposition — current continuation

B1 and B7 are terminal, with all actual results recorded above. General source remains held. Developer accurately moved011toInProgress with byte-bound status/provenance-only delta (status-progress/receipt.json); every prior AC/task/QA byte and declaring first line remain. Twenty quoted inputs matched S011 before that unit; the011story hash is now an intentional metadata-only deviation, not a changed test implementation. No W1 opening is implied.

Independent exact-diff review supports DIAG-START-1 for one separately root-authorized full-class diagnostic and correctedGSMa only after complete unchanged-backend-mainGS-T proof. A small staging/restoration harness is under preparation, unexecuted. Exact source restore before GS-T/F1 is mandatory. Root+QA must still rule native cause and obtain fresh executed full-check/coverage evidence; no stale ratio, retained failed cohort or frontend success pays that debt.

Current v6 differs from v4 only in two narrow11FE ownership amendments: four dead metadata barrel exports and one unused ReportsPage parameter. All current source/dist bytes remainS011; no implementation package has been applied. The accepted010T2 package binds the old t0-record snapshot: preserve before-resume2 and explicitly revalidate this factual record update before actual package application rather than claiming all167old input hashes still match.

## Root diagnostic completion and attribution correction — 2026-10-19T03:48:15.482632+00:00

The original Aria preparation ran/wrote plan v3. Root's later v6/v7 adoption is separate; the two historical author-attribution lines above are corrected accordingly. All other earlier record bytes remain, with the pre-correction root edition preserved at `t0-record.before-attribution-correction.md`. Current execution follows `lanes.v7.json` and its adopted rules; this does not retrospectively attribute those later revisions to Aria.

The sole authorized DIAG-START-1 run is now terminal: primary collector exit0,108 passed,0 failed/errors/skipped, task collection complete, source/dist/test inputs stable for the reviewed temporary candidate. The outer harness exits2 with `TERMINAL_INCOMPLETE_OBSERVATION` and its sticky observation gap preserved. Exact original ReplayIT bytes/mode0644 were restored and the original compile succeeded under the same lock; recorded original processes are absent. Full source capture `resume2-after-diagnostic-capture.json` again equals S0111808files and D009r238distfiles. Independent terminal QA assessment is still pending at this edit.

The original B1 startup cause remains unproved; the current selected case started normally before its expected UNKNOWN_OUTCOME stop. The one initial diagnostic budget is used. No implementation package has been applied, no W1 signature is granted, and the user's owed fresh fullcheck plus actually executed fresh coverage remains required before any011lane claims credit. The corrected fullcheck harness passed independent static re-review; it is still unlaunched and needs actual terminal QA/root SHA-bound authorization.


## Root recovery implementation release — 2026-10-20T14:21:27.569489+00:00

Historical failed attempts and withheld decisions above are preserved. Current controlled recovery and fresh validation resolve their baseline blockers for the reviewed local implementation. Fresh B1, B7 and OptionA B2-B6 passed; all506 original S011 main files remain literally unchanged. Root opens the GS-M(a) five-file implementation window, with one heavy lane and no simultaneous writer. Current facts and exact receipt hashes: `../recovery-20261020/implementation-window-release.json`. No product, pilot, release or final QA criterion is waived; this grants no story completion.
