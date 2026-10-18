# STUDIO-OBS-015 formal QA gate (Quinn, @qa)

Issued 2026-10-17. Supersedes `../qa-formal-gate-draft01/`. [V] means I read it or computed it from a receipt. [I] means inferred, not executed. Machine forms: `gate.yaml` (verdict, seven checks, issues, attempt06 slot) and `map.json` (86 + 24 + 55 + 15 + 7 + 9 subjects with per-test evidence, W10/W11 findings). Public copy: `docs/qa/gates/STUDIO-OBS-015-incremental-re-learn-from-the-first-changed-step.yml`.

## 0. Verdict

**CONCERNS.** All six ACs, O-1, R-2 and the binding PO changes are proven on a fully green first-run gate. The story is not blocked. Three named items keep it from a clean PASS:

1. **REL-001 (medium): the attempt03 `CONTEXT_LOST` root cause is UNPROVEN.** It was not reproduced in 2303 stress starts. Shipped: patch A (a recurrence now names the failing phase in one value-free line), patch B (versionProbe hardening) and D4 (a 12 s start deadline, which fixes a separate, proven launch hang). It did not recur in final-gates05, 06 or 07. Absence in three runs is not an explanation. Nothing in a follow-up story names this occurrence yet (section 6).
2. **Row 85 (low): a user waiver, clause only.** The positive equal full-key timing tie observed end to end in an actual run is waived by the user (Option C, 2026-10-15). It is reported as a waiver, never PASS or N/A. A criterion the user has waived is not a met criterion, so it cannot sit under a PASS label.
3. **ED-05 remainder (low): external.** The Node pin is FIXED and proven in the image. The internal Playwright image, non-root user, seccomp and CA bundle remain with Platform/SRE, as they always did. This is not a 015 defect and is not what makes the gate CONCERNS by itself; it is listed so the record does not imply ED-05 is closed whole.

The status transition to Done was **not applied**. The story Status is `InProgress`, not `InReview`, and the QA gate task has a blocking pre-check for that (section 9).

## 1. Binding

- Source `9d18f5550ac830bd2164bf4b4261f6d10ec8fd43b837e4bf9e9c990dc7cb5884`, dist `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c`, 1651 files (`final-gates07/capture-before.json` == `capture-after.json`). [V] I re-ran `capture-manifest.py` to a scratch file after the receipt: 1651 files, both digests equal. The tree has not moved. Docs, including this gate and the story's QA Results, are outside the digest scope.
- Versus final-gates06: 4 files changed and 1 added, all under `studio-runner/` (`src/guided/ownership.ts`, `src/guided/runtime.ts`, `test/fixtures-tier/browser-profile-safety.test.ts`, `test/fixtures-tier/guided-secret-ownership.test.ts`, new `test/guided/stopReason.test.ts`). That is exactly the W11 scope. The backend subset digest (`b6fbde38…`, 872 files) equals the one in attempt04, attempt05 and final-gates06, and the W9 to W11 File Lists touch no backend file.
- Binding run: label `final-gate-attempt06-20261017T1307` (final-gates07). The earlier digests `f071984a…` / `80d1ba1d…` are history, not credit.

## 2. Requirement to evidence map (details in `map.json`)

| Set | PROVEN | PROVEN-BY-RULING | WAIVED (user) | N/A-by-ruling clauses | PENDING |
|---|---|---|---|---|---|
| 86 ledger subjects | 84 | 1 (row 56) | 1 (row 85, clause only) | 13 clauses in 8 subjects | 0 |
| 24 IPC facets | 24 | | | | 0 |
| 55 SQL subjects | 55 (`GuidedReplayingPrefixMigrationIT` 55/55) | | | | 0 |
| 15 private routes | 15 | | | 5 clauses | 0 |
| 7 supplementary | 7 | | | | 0 |
| 9 story items (AC-1..AC-6, O-1, R-2, PO-REQ) | 9 | | | | 0 |

[V] Independent recomputation from the attempt06 collector results (`execution/final-gate-attempt06-20261017T1307-results.json`):
- test 2387 PASS + 25 SKIP, guidedIncrementalTest 62 PASS, crossReplicaTest 2 PASS, 0 FAIL, task collection complete, no errors.
- The skip multiset equals `final-gates01/approved-historical-skips.json` (25 == 25).
- The multiset of (task, class, name) keys equals attempt03's (2470 distinct keys). The only status changes are the four attempt03 reds, now PASS: `actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues`, `queuedAndPreReadyRefusals`, `editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness` and `GuidedPublicationAuthorityIT … header-count`.
- All 363 Java evidence items named in the map are PASS in attempt06 (a script checked each one by class and name; 0 missing, 0 not PASS). Route 6 (wrong-private-input-hash) therefore moves from PENDING to PROVEN: all nine labels of the family pass.
- Classes the map quotes: `GuidedReplayingPrefixMigrationIT` 55, `IncrementalPublicationConformanceTest` 124, `GuidedPublicationReplayIT` 108 (46 + 62), `GuidedPublicationAuthorityIT` 27, `GuidedBridgeIntegrationTest` 9, `GuidedBridgePlannedIT` 16, `GuidedWireContractTest` 18, `GuidedRecordingTimingsTest` 11, all PASS.
- **Correction to my draft:** I wrote `StudioContractTest` 19/19. It is 14/14 (14 `@Test` methods, 14 PASS in attempt03 and attempt06). The draft miscounted; the map now says 14.

Runner-side items point at the final-gates07 steps: unit 2306 / 0 / 29 (`evidence.test.ts` 23/23, `stopReason.test.ts` 26/26, `ownership.test.ts` 20/20), fixtures 260 / 0 / 9 (`mixed-mode-prefix` 2/2, `secret-login` 40/40), deployment 322 / 0 / 0, contracts re-run exit 0/0. The two corpus files for ledger 35 still parse as in the draft (10 steps, k index 3). Frontend 701/701 and the standalone backend static tasks are carried forward by digest; the static tasks were also re-executed inside attempt06's check.

Clause dispositions:
- **13 clauses N/A-by-ruling (ledger 46, 48, 73, 77, 80 x3, 81; routes 1, 2, 8, 13, 14): QA concurrence is now issued.** Each precondition cannot be built in-repo without fabricating a callback ACK, receipt, history row or second live assignment, and a named lawful companion in the same subject passed in the binding run. The literal negative is not claimed.
- Row 56: PROVEN-BY-RULING under `aria-ledger56-ruling01` option C (unchanged from the draft).
- Row 85: WAIVED (user), clause only; the retained conjuncts passed.
- Ledger 28 (test Vault tier) PROVEN by tier ruling; ledger 31 and route 7 conditionals resolved to PROVEN.

## 3. Seven quality checks

1. **Code review: PASS with observations.** Every writer window W6 to W11 now has an independent QA source review: W6 to W9 in `qa-source-review-w6-w9` (OK to gate; its one MAJOR, F1, was fixed in W10), W10 and W11 in section 5 of this document (OK, no required change). Earlier required changes (final01 R1-R4, final02 R1-R3, fullsuite-fix01 RC-1/RC-2) are closed. CodeRabbit was not run (WSL-only); the independent reviews are the configured fallback and no automated pass is claimed.
2. **Tests: PASS with observations.** Attempt06 is one fully green first-run check on the binding tree: test 2412 / 2387 / 0 / 25, guidedIncrementalTest 62/62, crossReplicaTest 2/2, `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` executed and passed (log lines 5812 to 5837: BUILD SUCCESSFUL, 25 of 25 tasks executed), JaCoCo bundle 0.9086 with dispatch 0.8620, internal 0.9093, recovery 0.8889, sse 0.9180 (all above their minimums; `studio.compile` rules vacuous). The draft's concern, "no single fully green run", is resolved. Observations: this is one run, preceded by transient reds on earlier trees; ReplayIT remains class-scoped and order-dependent (TEST-001); the 25 skips are the approved multiset.
3. **Acceptance criteria: PASS.** Section 2. One clause is a user waiver and is disclosed as such (REQ-001).
4. **No regressions: PASS.** RG-1..RG-4 are green; the name multiset is identical to attempt03; the runner fixtures tier (260/0/9) and the deployment tier (322/0/0) are green on the binding tree.
5. **Performance: PASS with observations.** The AC promise is asserted structurally (zero model reservations in the prefix, zero model calls in ordinary replay); timing is OBS-009 D-C by the story's own scope. Wall time 5768 s against 5650 / 5366 / 5621 before. The D4 12 s start budget has about 4% headroom over the slowest start Dex measured (his F10), so a legitimately slow start now fails closed as `CONTEXT_LOST` with a `TIMEOUT` cause in the log line; benchmark and load behaviour belong to OBS-009. Advisory carried: `pendingTeardowns LIMIT 32` can starve newer rows when 32 or more fail persistently.
6. **Security: PASS with observations.** TF-1, TF-2 and R4 closed. The W10 kill selection is narrow and fails closed; logging stays value-free; W11 does not extend authority (section 5). Carried and placed: KL-015-GRANT, S1, KL-015-Q4, FOCUS-MUTATION-01, KL-015-R1, F-1 citation limit; no real Core/COIN/Vault exercised (authority-tier ruling).
7. **Documentation: PASS with observations.** File List, Dev Agent Record and change log are current through 0.1.18 and the placements are verified in 009 (section 6). Open: tasks T0 (reconciliation line), T1, T3, T4, T5, T6 and the three Quality Gates are unticked and Status is `InProgress` (Dex or root, not QA); Aria's F4 note for R4 is still not in `studio-inference-contract-v1.md` (a diff of that file shows only the superseded banner); a private `isBlank(String)` in `VariableReferenceValidator` has no caller; the six documentation rows that say Node 22 still carry "pending in-image re-verification", which the final-gates07 image check now provides.

## 4. What changed since my draft

1. **Binding tree is final-gates07**, fully green on the first run (backend, runner unit, fixtures, deployment, image, contracts). attempt04 on the earlier tree was also green per the lead; I did not re-read it, and I do not rely on it.
2. **ED-05 Node pin fixed, not waived.** `image-final07-check-pins.json`: `ok: true`, no failures, nothing NOT ASSERTED, node v24.20.0, `nodeMajorPin` "24", `.nvmrc` "24", engines `>=24.11.0 <25.0.0`, chromiumBuild 1243, Playwright 1.63.0, linux/arm64. The draft's REQ-001 (EXTERNAL-OPEN) narrows to the remainder owned by Platform/SRE.
3. **REL-001** reviewed (section 6). Not a proven fix; named as a CONCERNS reason.
4. **W11** race fixed and reviewed (section 5). Test race in `browser-profile-safety` fixed by an applied test-only patch.
5. **W10 and W11 reviewed** (section 5). The draft's unreviewed-window observation is closed.
6. **Placements verified** in `STUDIO-OBS-009.story.md`: KL-015-D5 and Quinn F3 at AC-11 D5 (line 303 onward), LIFECYCLE-REASON-01 at AC-11 LR (line 351), EDGE at AC-11 EDGE a (line 378), PID-1 at AC-1 (line 40 onward). KL-015-Q4, FOCUS-MUTATION-01, KL-015-R1 and KL-015-GRANT are unchanged.
7. Stop-loss rules from the draft no longer apply: none of the red branches occurred.

## 5. Independent source review of W10 and W11 (read-only)

Method: I read the source and tests at the binding tree. sha256 prefixes of `tree.ts` a8e04ec7, `browser.ts` c9d74add, `guidedBrowser.ts` f5019a62, `guidedMain.ts` 90c3c6c5, `runtime.ts` a95ae57a, `ownership.ts` c76696f0 and `stopReason.test.ts` 34497e19 equal the File List, so I reviewed the state Dex reported. I read the W10 mutation outputs (`w10-review-fixes01/mutation/`: 23 of 23 exit 1). I ran nothing.

**Verdict: OK. No blocker, no required change.** Findings, all informational unless stated:

**W10 (review fixes on the W9 launch deadline and teardown)**
- **Kill selection safety.** A row is chosen only if its parent is the worker, its pid is above 1, it is not the worker, and its command line names one of this launch's own absolute paths as a whole path (scratch directory and recording directory, each as written and as realpath, at least two segments). Descendants of a chosen root are then killed deepest first. Pids 22246, 44737, 13577 and 13581 cannot be selected; `tree.test.ts` builds a table with all four. Parent pid 1, a look-alike directory, another session's browser and a merely new process are each rejected by a named test.
- **Fail closed.** `killLaunchTree` throws `PROCESS_TABLE_UNREADABLE` and signals nothing when the listing has no row for the worker or the worker is pid 1; the teardown then rejects, the slot stays held and scratch is not removed. This closes my W9 finding F1 (MAJOR). `guidedMain` refuses to start unless `canEnumerateLaunchTree` holds.
- **Races.** The hard teardown is idempotent and starts eagerly in the launch catch. For an abandoned launch that has not spawned, it waits until the launch settles or Playwright's backstop instant (`deadline + 3 s`), lists once more, polls survivors for 500 ms and only then removes scratch. A late context is closed under a 1 s bound and the second kill pass covers a survivor. pid reuse between the `ps` read and the kill is a microsecond window inherent to a pid-based kill.
- **Value-free logging.** W10 and W11 add no log call. A grep over the six runtime files finds only the existing `GUIDED_WORKER_UNAVAILABLE` write. `launchFailureCause` accepts an abort reason only if it is an `Error` whose message is exactly `TIMEOUT` or `CANCELLED`. `describeStartFailure` still prints only closed codes, class names, errno, phase, exit and signal and a 16-character session hash. Command lines are matched in memory only.
- **Test strength.** The 23 archived mutations (16 unit, 7 fixtures) all went red and cover selection widening, pid 1, a missing worker row, the args form, abort reasons, ignored survivors, the late-spawn wait, the encoder marker, scratch removal and phase labels. The two formerly RED fixtures assertions now follow the `CONTEXT_LOST` cause chain at the same strength.
- **W10-6, low (MNT-001).** If every marker is unusable (only possible with `TMPDIR` set to the root directory), `killLaunchTree` returns `[]` over a readable table, so the teardown reports success and removes scratch while a Chrome could survive. Not reachable with a normal `TMPDIR`. Cheap hardening: treat zero usable markers like an unreadable table. Not a gate item.
- **W10-7, info.** `survivorsOf` uses signal 0, so an unreaped zombie reads as alive and holds the slot, which fails closed. [I] This depends on the container having an init that reaps, which is the PID-1 constraint already placed at 009 AC-1 PID-1 b. The Quinn F2 residual (reply up to the 15 s ceiling) was accepted by Aria and placed at 009 AC-11 D5. `launchGuidedBrowser` stays unit-untestable (AC-25), so its hard teardown is proven by the fixtures tier only, and the `guidedMain` guard by source text only. Dex disclosed both.

**W11 (hard-expiry stop-reason race, Aria's C-1, profile-safety patch)**
- **Correctness.** `runtime.endReason()` and `ownership.schedule()` fix the reason when the timer is armed from the instants: EXPIRED when `min(expiresAt, started + maxSession) <= lease`, otherwise LEASE_LOST. A tie is EXPIRED. Every deadline change re-arms the timer and recomputes (`applyAcknowledgedLease`, `start`, `update`, `ownership.schedule`). The old expression read `Date.now()` inside the callback, and a Node timer can fire a fraction of a millisecond early (diagnosis: 2/150 and 3/120 instrumented runs, 6/330 pooled).
- **Races and termination (C-1).** `marginBound = lease >= expiresAt && budget < cap` is fixed at claim start. Only `renew()` swallows `ClaimMarginExhausted`; `acquire()` still maps any error to `CONTEXT_LOST`. A swallowed renewal re-arms nothing, but the runtime and ownership expiry timers are both armed for E, so the session ends EXPIRED at E, and the renewal loop terminates because it is never rescheduled once the budget is exhausted. An abort of an in-flight margin-bound claim by `cancelTimers` only happens when the entry is already stopping, so no reason is relabelled. Backend refusals, `REVOKED` and cap-bound timeouts keep their reason.
- **Authority.** C-1 can leave the runner up to 100 ms of local authority the backend had already acknowledged (Aria's fail-closed cost, disclosed). The lease is never extended; authority still ends at E.
- **Test strength.** `stopReason.test.ts` (26 cases) uses fake timers with timers forced 1 ms early. The C-1 case asserts exactly 5 claims, that the last starts 110 ms before E, no lifecycle message before E-1, one at E, reason EXPIRED. It sweeps 16 lifetimes and has three controls (lease before E with a slow claim stays LEASE_LOST, a cap-bound hang stays LEASE_LOST at the cap, REVOKED inside the band stays REVOKED). I read them and they discriminate. **TEST-002 (low):** Dex reports that reverting C-1 turns 20 cases red, but the raw mutation output is scratch only and not archived, so I could not re-read that number. The race diagnosis logs are archived.
- **Fixtures hunk.** The assertion is on the stop instant (`>= E - 10 ms`), not a poll-phase `Date.now()`: stricter for premature stops, looser only in a 0 to 10 ms band a timer cannot honour. The `hard-expiry` case passed once in final-gates07 (5062 ms). That one pass is not the evidence; the mechanism, forced-early-timer runs (30/30 fail on the old code, 30/30 pass on the fix) and the unit tests are. Dex's own caveat stands: 55 clean runs by themselves would have had about a 0.33 chance on the old code.
- **`browser-profile-safety` patch (test only).** Applied exactly as proposed (`defaultRecreations` at line 56, the bounded EEXIST retry at line 78). The production close refusal, the symlink check and the outside-directory identity check are untouched, so the modelled attack (Default swapped for a link at close) is unchanged. 0/100 idle and 0/100 loaded against 13/100 and 7/100 unfixed. `defaultRecreations` is recorded, not asserted.
- **Backend-visible.** Some hard-expiry sessions that ended FAILED now end EXPIRED (Aria section 2). No test or doc assumed the old outcome. The backend ignoring the reason is LIFECYCLE-REASON-01, placed in 009.
- The rule exists in two places (`endReason`, `ownership.schedule`), each pinned by its own tie test.

## 6. Dispositions

- **REL-001 (CONCERNS reason 1).** Evidence: `runner/rel001-rootcause01/root-cause.md`, `repro/results/verdict.md`, `aria-d4-launch-deadline-ruling01/{ruling,ratification,ruling-15s-edge}.md`. D4 is a separate, proven launch hang (it does not explain attempt03, which refused after 1.98 s) and Dex says so. In final-gates07: 13 `GUIDED_START_FAILED` lines in the runner logs, all `CONTEXT_LOST`, max elapsed 19 ms, all injected by tests; 5 recovered worker-side lines, max 64 ms, no `TIMEOUT` cause; none at 15 s or more. `realRel001RecurrenceSignal: false`. Where it is tracked: 009 RUNNER-LAUNCH (AC-11 k / AC-12) covers CONTEXT_LOST launch reliability from OBS-013 and OBS-014 but does not name the 015 occurrence. **Requested of @po:** a one-line pointer there, so that a `CONTEXT_LOST` whose `GUIDED_START_FAILED` cause is not `TIMEOUT` is read as a REL-001 recurrence and not accepted as noise. The story's own text says the unproven root cause "stays inside this story or with the coordinator", so this is a scheduling gap, not a defect.
- **ED-05.** Node pin: closed (section 4). Remainder: Platform/SRE, OBS-010 release readiness.
- **Row 85:** user waiver, clause only, unchanged.
- **25 skips:** ratified again; equal multiset. 18 are the OBS-009 AC-6/T3 scheduling deferrals; scheduling regression coverage is deferred to OBS-009, not lost.
- **Known limitations:** KL-015-Q4, FOCUS-MUTATION-01, KL-015-R1, KL-015-GRANT, KL-015-D5, LIFECYCLE-REASON-01, EDGE-15S-3, PID-1 are placed. Deploy constraint (no post-015 backend against a pre-OBS-008 frontend) and the 44 frontend M12 leftovers are mapped to OBS-008.
- **Authority tier:** T1/T2 disclosures apply (in-JVM Core fixture, `FakeStudioVaultProvider`, fixture entitlement; F-1 citation limit on `GuidedSessionIT` and `GuidedServiceTransportFaultIT`).
- **Unlisted framework edit:** `.aiox-core/core/permissions/dispatch-governance.js` (+20/-4) is still modified in the tree and is outside the 015 File List. I did not review it. @devops should keep it out of the 015 commit (MNT-002).

## 7. Issues (see `gate.yaml` for the schema form)

| ID | Severity | Item |
|---|---|---|
| REL-001 | medium | attempt03 `CONTEXT_LOST` root cause unproven; mitigations shipped; tracking pointer requested |
| REQ-001 | low | row 85 clause is a user waiver |
| REQ-002 | low | ED-05 remainder is external (Platform/SRE) |
| TEST-001 | low | ReplayIT class-scoped and order-dependent; single-test reruns are not valid evidence |
| TEST-002 | low | W11 mutation raw output not archived; `hard-expiry` closure rests on mechanism, not on one pass |
| MNT-001 | low | W10-6 unusable-marker edge; dead private `isBlank` |
| MNT-002 | low | unlisted L1 edit in the working tree |
| DOC-001 | low | R4 F4 note missing; "pending" marker on six Node 22 doc rows; unticked tasks and Quality Gates |

## 8. Required follow-ups (none blocks the label)

1. Dex or root: set Status `InReview`; tick T1, T3, T4, T5, T6 and the Quality Gates where their evidence is the final-gates07 receipt; leave the T0 reconciliation line to root. QA does not tick these.
2. @po: the REL-001 pointer in 009; drop the "pending in-image re-verification" marker on the six Node 22 doc rows.
3. @architect: append the F4 exception note for R4 where F4 lives now.
4. Optional (@dev, next source window): treat zero usable markers as unreadable; delete the dead `isBlank`.

## 9. Lifecycle

[AUTO-DECISION] Apply `InReview → Done` now → no (reason: the `qa-gate` task has a blocking pre-check, "if current Status is not InReview, HALT". The Status line reads `InProgress`. The tasks and Quality Gates are unticked, and only @dev may tick them. Skipping InReview would put a story into Done with its own bookkeeping open).

What I did: appended the QA Results section to the story and left the Status line and the Change Log untouched. Nothing else in the story was edited. After Dex or root sets `InReview`, QA applies the transition with one edit of the Status line (`**InReview**` to `**Done**`) and the change-log row `| 2026-10-17 | 0.1.19 | QA Gate CONCERNS — Status: InReview → Done | @qa |`. The verdict does not need to be re-run unless the digest moves.

## 10. What I ran and did not run

Ran, all read-only: python analysis of the attempt06 collector results, the vitest JSON files and the draft map; `capture-manifest.py` to a scratch file; grep, sed and reads over source, receipts, stories and the 009 placements; a script that cross-checked all 363 Java evidence items against the attempt06 results. Not run: Gradle, JUnit, vitest, Chromium, Docker, any build or test, CodeRabbit. Scratch files are under the session scratchpad. Written: the three files in this directory, the public gate YAML, and the story's QA Results section.
