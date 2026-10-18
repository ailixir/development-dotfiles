# STUDIO-OBS-008 QA gate: CONCERNS

- **Reviewer:** Quinn (@qa). **Date:** 2026-10-17. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` 0.3.17, sha256 before my edit `81950a05515c1575f2133297e7634a97eafb7acf71658a7a59d14e852e032a15`, Status observed **InReview**.
- **Binding tree S_F2:** source digest `50692d55e40807f67bf959f0d9672d9305d69b72ad693860506a3f7055e12dd3` (1705 files), dist `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c`. `openapi.yaml` `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`.
- **Verdict: CONCERNS.** Every acceptance criterion is met, all gates are green, and no item blocks Done. The story moves InReview to Done. Concerns are tracked low and medium items with owners (section 6), not defects in the delivered behaviour.
- **Labels:** **[V]** I ran it or read the bytes myself in Phase 2. **[I]** inferred. The Phase 1 review is `gate-draft.md` in this folder and stays valid for everything it marks [V].
- **ADR-SC-006:** no accessibility work in the "do not plan" list was failed or raised. Removed items (X1-X11, A15-A18, FE-A11Y, PLAYBACK-COST/COPY) are "removed by the user, 2026-10-17", not PASS, N/A or waived.

## 1. Slots from the Phase 1 draft, filled and verified by me

### (a) Backend final check `obs008-final-check01`: green

| Item | Result [V] |
|---|---|
| Exit | Gradle 0, collector 0, `BUILD SUCCESSFUL in 1h 41m 43s`, 6105.41 s; `taskCollectionComplete` true, 0 collection errors |
| Counts | **2531 total / 2506 passed / 0 failed / 0 errors / 25 skipped.** Equal to my Phase 1 prediction. By task: `test` 2467/2442/0/0/25, `guidedIncrementalTest` 62/62, `crossReplicaTest` 2/2. I re-counted the 308 XML files myself: 2467 test cases, 0 failures, 0 errors, 25 skipped |
| Skips | the 25 skipped `(task, class, name)` cases equal `approved-historical-skips.json` exactly, as multisets (file copied from 015 attempt06, sha256 `5a0755a4…`, provenance recorded). Every non-skipped case is PASS |
| Multiset diff vs the 015 binding run (attempt06, 2476 cases) | **0 names removed, 55 added**: RunnerReportProjectionTest 15, GuidedPublicPresentationIT 13, ExecutionReplayFailureMigrationIT 9, StudioCapabilitiesIT 7, ProgressCallbackIT 6, ExecutionSnapshotMapperTest 4, SseStreamingIT 1. 2476 + 55 = 2531 |
| Gradle tasks that ran in the log | `check`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain`, `spotlessCheck`, `testcontainersAlignmentCheck`, `retainOriginalGuidedCohort`, `guidedIncrementalTest`, `retainIncrementalGuidedCohort`, `requireFreshGuidedPartitions`, `crossReplicaTest`, `jacocoTestReport`, `jacocoTestCoverageVerification`. `spotbugsTest` is SKIPPED, exactly as in the 015 log |
| JaCoCo (I parsed `jacocoTestReport.xml`) | bundle LINE **0.9096** (min 0.70), dispatch **0.862**, internal **0.9084**, recovery **0.8889**, sse **0.918** (min 0.75 each). Verification task passed. The `compile` and `compile.gateway` rules (min 0.80) are vacuous: those packages no longer exist since 012B (pre-existing, not 008) |
| Stability | `sourceStable`, `testInputStable`, `distStable` all true. The collector's before and after manifests both equal the freeze digest `eea9c8de…f2002`, dist `897182d5…df9c` |

### (b) U1 copy-back: green

- `u1-copyback-diff.json`: 24 changed, `unexpected` [], `missing` [] **[V]**. I recomputed the changed set from `freeze-manifest.json` vs `capture-final.json`: the same 24 paths, all under `frontend/src/`.
- I hashed the 24 live files: each equals the "after" hash in `lanes/U1/receipt.md` and in `capture-final.json` (24/24). The live tree equals `capture-final.json` on all 1705 paths.
- The `backend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/` subset digests are equal across the freeze, the backend check's before and after manifests, `capture-after.json` and `capture-final.json`. The dist digest is equal. This is stronger than the script's freeze-only comparison, as I asked in the draft.
- Timing: `status.txt` shows `BACKEND-DONE` before the first `fe2-*` line, and `capture-after.json` equals the freeze, so the copy-back happened after the backend run and its capture.

### (c) fe2 gates on the final frontend: green

| Gate | Result [V] |
|---|---|
| type-check | exit 0, no output |
| lint | exit 0, **0 errors / 308 warnings** (not above the 308 I set as the limit) |
| vitest (a11y included) | exit 0. **70 files / 1367 tests, 1367 passed, 0 failed, 0 skipped.** Equal to my prediction (1320 + 47). `studioWcagAudit.test.tsx` 7/7. I listed every assertion in `fe2-vitest.json`: none is not "passed" |
| build | exit 0, "compiled with 1 warning" (asset size only, as at the freeze) |
| e2e | 13/13 (5 harness + 8 guided), project `msw` |
| axe | `fe2-axe-before.sha` = `fe2-axe-after.sha` = live file = `9d3853da…`; no change |
| Environment | frontend Node v23.10.0; the fe2 vitest start time is after the copy-back capture |

Part 1 (contracts 7 sections, codegen check, no-write proof, runner type-check, lint, unit 2306 passed / 0 failed / 29 pending with lines 97.33 and branches 89.30, pins) still applies: **[V]** its inputs (`studio-runner/`, `tools/`, `docs/specs/`, `.github/`) are byte-identical in the final tree. Its one red, `fe-vitest` 1319/1320, was the `StudioScheduleDialog` race; fe2 supersedes it.

### (d) capture-final: green

`capture-final.json`: 1705 files, source `50692d55…12dd3`, dist `897182d5…df9c`. The source differs from the freeze only in the 24 U1 files. `u1-after-copyback.json` has the same digest, so nothing moved during the fe2 gates.

## 2. Acceptance criteria and obligations (final)

All rows of the Phase 1 traceability table (section 2.1 of the draft) hold, and U1's behaviour is now proven in the real tree by (c).

| Req | Status | Note |
|---|---|---|
| AC-1 typed transport and MSW mirror | MET | the "client method" half is now tested (U1 W5-5) |
| AC-2 one Run, three modes | MET | includes D-1, D-3, D-4, D-11, auto-finalize, reconnect, the W5-1 fix |
| AC-3 states and copy | MET | copy table: 78 strings, each with a quoted source and fact; struck secret-fill copy absent |
| AC-4 blocked by login | MET | guided and replay through one adapter; `replayFailure` precedence verified |
| AC-5 references, secrets, capability | MET | REQ-001 residue carried |
| AC-6 plan explanation | MET | |
| AC-7 video and seek | MET | |
| AC-8 narrow layout, audit as a guard | MET (a, b) | audit 7/7, no key regenerated; items removed by the user are not credited |
| AC-9 tests and first E2E | MET | MSW basis; D5 local only, not live (OBS-009) |
| A1 / V22, A2, A3, U2, F4 note | MET | |
| Inherited: v2 authoring, governed refusals, `POLICY_NOT_APPROVED` | MET | |
| KL-015-Q4 a-d | MET | (a) the trigger record and (c) the choice note with the four-part Q9 rule are now in the Dev Agent Record; R1-R4 are in 009 |

## 3. Quality checks (`story-lifecycle.md`)

1. Code review: OK. No blocking finding in 008's files; low items below.
2. Unit tests: OK. Frontend 1367/1367, runner 2306/0 (29 pending, unchanged), backend 2506 passed / 0 failed / 25 approved skips.
3. Acceptance criteria: OK, section 2.
4. No regressions: OK. 0 backend test names lost versus 015; the 2476 are all still present.
5. Performance: no regression known. No runtime dependency added. V22's `VALIDATE` scan holds ACCESS EXCLUSIVE for one heap scan of execution history **[I]**, unmeasured at production size, noted for OBS-010.
6. Security: OK. Secret bound 4096 end to end, never-echo canaries at every surface, no secret logging, fail-closed capability and projector, untrusted page labels. Open lows: UX-21, C-OBS008-3.
7. Documentation: OK. Dev Agent Record, File List and ticks are consolidated (0.3.17). ADR-002 section 13 rows, runbooks, F4 note and the pnpm docs are in place. T5 stays open for this gate.

## 4. Pax's placements (checked last)

All landed **[V]**:
- 011 0.2.12: C-OBS008-3 and C-OBS008-5 (inbound table, details, tasks). C-OBS008-1 and -2 were already there.
- 009 0.3.22: C-OBS008-4 (lane C9). R1-R4 were already in 009 0.3.21.
- README backlog: STUDIO-OBS-F08 (post-GA copy pass: the nine whole Lows, partial carries, optional UX-02 cue, UX-22) with one line per item, and the R5 "Someone pressed Stop" pending user decision.
- The first line of every edited story is intact, so `ExecutionVideoContractTest` is unaffected.

## 5. Process decisions, final view

R1 (lane runs non-evidentiary), DV-1 (both uses), the honest CORS allow-list, the sandbox method for U1 and the backend carry-forward were all sound, and the evidence now shows it: the sandbox bytes equal the real tree after copy-back, and the carry-forward premise held (all five subsets and dist equal at the start, end and after the backend run). The one refinement I asked for, waiting for `BACKEND-DONE`, was followed.

## 6. Concerns (tracked; none blocks Done)

| ID | Sev | Finding | Owner and where |
|---|---|---|---|
| DOC-001 | medium, **resolved to tracked** | The carried work was unplaced in Phase 1. It is placed now (section 4) | @po: done. Residue below |
| REQ-001 | low | D-8 says the MSW mirror drops `secretId ?? name`; `handlers.ts:177` still has it, and the authoring mirror does not require `secretId` on a `secretRef`. Unreachable from the page | @dev, C-OBS008-5 in 011 |
| REQ-002 | low | The Variables dialog can still save a plain variable plus a secret row the backend refuses at start with an undeclared `422`; the UI shows the code honestly | @architect and the 009 C9 lane, C-OBS008-4 in 009 |
| MNT-001 | low | `guidedNarratives.ts` ships `basis/source/note/facts` (internal doc paths and quotes) in the production bundle | @dev, C-OBS008-3 in 011 |
| UX-F08 | low | Nine whole copy Lows (UX-08, 10, 11, 14, 17, 18, 19, 20, 21), the UX-09 prefix form, UX-13 "that step" wording, the UX-02 question cue (at 375 px the Proof panel sits below the editor) | @ux-design-expert, STUDIO-OBS-F08 in the README backlog |
| SEC-001 | low | UX-21: page-derived `role` and `region` render as plain captions beside the untrusted box (React text only, no markup path) | @dev with @ux-design-expert, inside F08 |
| REQ-003 | low, user decision | "Someone pressed Stop" is untrue after "None of these" or a declined confirmation. The user descoped a user-initiated wording on 2026-10-17 | the user; README "Pending user decision" |
| TEST-001 | medium (commit set) | The copy-table tests read untracked and uncommitted files plus pinned story text, and the tree is the uncommitted 015 tree plus 008. A partial commit turns 240+ tests red on a clean checkout | @devops: one commit set, listed in the Dev Agent Record "Commit-set notes". Do not demo a post-OBS-015 backend against a pre-008 frontend |
| MNT-003 | low | Leftovers with no placed destination, recorded in the Dev Agent Record: W5-8 (`studioApi.executeTest(id, key?)` still allows no key; D-1 wants one), W5-9 (4096 parity line), W5-10, F-L5a-4 (a clarification whose step does not match renders nothing; Stop still works), F-L5b-7/M6 (defensive guard term) | @dev: fold into 011 or the next frontend story |
| MNT-002 | low | Lint warnings 302 to 308 (six `react-refresh/only-export-components` in `.tsx` files that also export view functions) | none required |
| TEST-002 | low | `pageGuidedRun.test.tsx` took 311 s in the sandbox under load (41 tests; bounded waits 20 s and 60 s). It passed in the final full run | watch; no action |
| TEST-003 | info | E2E is MSW only and D5 is local; nothing in 008 is claimed as live integration | STUDIO-OBS-009 |
| REL-001 | info | V22 `VALIDATE` lock window unmeasured at production size [I] | STUDIO-OBS-010 release readiness |

## 7. What I did in Phase 2

Read the final status, results and manifests myself; re-parsed the 308 XML files; recomputed the skip multiset, the 015 multiset diff, the JaCoCo ratios from the XML, the copy-back diff, all five subset digests across five manifests, the 24 file hashes, the 1705-path equality of the live tree with `capture-final.json`, and the fe2 per-assertion status. I ran no Gradle and no Playwright. I read the Dev Agent Record, change log 0.3.17 and the three placement edits.

## 8. Story update

Status InReview to **Done**; QA Results filled; Change Log row 0.3.18. Edits were additions plus the one Status word; line 1 and every existing phrase are untouched. T5 and the CodeRabbit gate boxes stay with root. Handoff: @devops, `*push`, with TEST-001 as a precondition.
