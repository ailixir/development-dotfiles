# STUDIO-OBS-008 unfreeze unit U1: receipt (Dex, @dev)

- **Verdict:** GREEN. All 24 write-set files changed inside the sandbox; nothing outside the write set was touched.
- **Spec:** `w5-reviews/U1-spec.md` (24 before-hashes verified equal to the sandbox bytes before I started: 24/24 MATCH).
- **Sandbox:** `scratchpad/u1repo/frontend` only. Red-first runs used `scratchpad/redrepo` (a `cp -a` snapshot of the frozen sources plus the new tests, made after the tests were written and before any source edit; its 13 source files were re-hashed equal to the spec before-values). Mutations used `scratchpad/mutrepo` (a `cp -a` of the finished U1 tree). No git command was run. `dispatch-governance.js` untouched. No PID signalled. No watcher left (`ps` clean).
- **Not run (by instruction):** the full suite, `src/test/a11y`, Playwright, Gradle. By grep, no changed string is asserted under `e2e/` [inferred, not run].
- **Not run:** the SYNAPSE diagnostics, `coderabbit-review` (WSL-only) and `checklist-runner` skills appended to the spawn prompt. The mission defines the work.

## 1. Files changed (paths relative to `frontend/`)

| Kind | Path | sha256 before (= spec §4) | sha256 after |
|---|---|---|---|
| source | `src/components/studio/guided/guidedNarratives.ts` | `166a2bbbdd8863883d6b5974405c2f4cc9910812762f6aeae57a32f29ec61b26` | `f8f68c01be22401e8a578bd80a39b5fae42f41ec2da680f6c8ac3b6a1b62b0e7` |
| source | `src/components/studio/guided/GuidedCompletion.tsx` | `8c59d25d1352e6765afdc8c41095dcc6640d5101f713f05187b8e46c23afb6e9` | `a74433ea8684510d71524cae95a576c21b2b0e11b3aefdcff2bfcc3392e05d2a` |
| source | `src/components/studio/guided/index.ts` | `708afe1c57f671d7d37071a2775846d40991bdd48626e65e5b4e191802ab1999` | `83bc21cb0a607b14e5c0c3687943d0ee3be5f99174070e54036b47b2d41d39f4` |
| source | `src/components/studio/guided/useGuidedSession.ts` | `21bee4dbf4ef28cb74c4a119f2c1cb25c9d3a50da9f869b498e1912b6c9320f2` | `f68cb818e925aab448ba4316baf475454cc3223542b1cced10a42b15a90b0e92` |
| source | `src/components/studio/run/RunControl.tsx` | `2385d817168b0fb9effb1100ed824fc4b82ace4acc924fa99a2b56c9a7b2498a` | `b4f28ce2a0efffb469a304e19d2869c7c8410805e5658a071887b857e5abc176` |
| source | `src/components/studio/run/useRunGate.ts` | `697d034b1764fc8cbd17258a2940dbcd04519d85d5ce81ac971d7f90e08b01d9` | `2a2f0809894a32ff429ec3c3cec6c11ecf918267a136e95bc27c77325fb1b602` |
| source | `src/components/studio/run/runEnablement.ts` | `6c67598587aa10f0b63e42a38d7113ee2c590fef4ad0d4c4592ede67e6b10476` | `8ec371eddef182e8fca558e9d7cdbd17a27da54e38f276c78746cd57f8c085cd` |
| source | `src/components/studio/run/index.ts` | `867e313297fc15a49d3f02514f6ae80da77765eb5a89777a76bf78a5fc53775d` | `40470157c7d56535431f9651ebf6fd8c198c8d5228d0d08180658de87fd86aa6` |
| source | `src/components/studio/run/ExecutionProgressView.tsx` | `2c8166953db8f949cde7e0bf0d9ef592b2a8bbc273d12a189e8cbfb10fe92d46` | `6a1d0d60f68dfa3959ca89886ee193b42c610fb232aafc1ac76408fbc7bba8c9` |
| source | `src/components/studio/run/executionErrorNarratives.ts` | `60fa7fbcf81003b665076029249bc174b491e6e41db1e52cda76be1faa2414c2` | `a20824bd602397f4eb7dd8aa5aecc80348ec5bdbd4ac1984310d17c0bce044ea` |
| source | `src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | `3ebc644f069a82502ae6659a44e484873d380b710a7d825c9f5f718aa32fdf9c` | `96168908d344db0ea6694e27e23a2b46700254ca5d44c0e46b2b6128eda15981` |
| source | `src/pages/ChecksStudioPage/authoredLiteralHint.ts` | `cc4a101e8608bf3293a9cf4b793e35b7c443880cd75ba6a2e0cf9f4781725f4d` | `c52a1481e71327d7f02eefc66b5c8589540ea7d7e9045ff3a23281ea33893f8e` |
| source | `src/pages/ChecksStudioPage/secretDeclaration.ts` | `28d24d00e42a993f2866c8dc2cf7b5e4e6383b0ac74f095c1dad2c50e3fd8f25` | `92ff07ffd00010d3a95a5d1874dc94c2a3a5273a2f01c4fe767b994df7c3f88f` |
| test | `src/components/studio/guided/guided.test.tsx` | `95554acc5fdda9cb36bc24217edc111e3da5bbe0f50dedcb3c2cfbb8e705d9d9` | `89a032622beae66bc2b35a1ce3a42ba58edaa4e2ccd309eeb944921ee4e6cb13` |
| test | `src/components/studio/guided/clarification.test.tsx` | `deb61efcb758be32d19b73d0a3a626c358faaeff11c0b32c9d6c6f442577275e` | `e25cb84873c8f2eafb97be65ab5a8d43b07a4c58230947e4ce11eed47577141c` |
| test | `src/components/studio/guided/useGuidedSession.test.ts` | `ff0b314544f8ae3e272e1c7914e3507e424dcaa4327eff9e9427560608914b45` | `9ada0b04e4ca56a4cb792f4534fb0518a01bfb5e2774babeff10add4e1c7fae4` |
| test | `src/components/studio/run/runGate.test.tsx` | `611fb0f53bd8fd7a6cfd0118c31ed9876b452c613c22a89687036cb45e332eb5` | `419d6ede4bc9d3a3a7f340b0750a2fe13532baee82a4f9e56a65d1b6a1908523` |
| test | `src/components/studio/run/replayFailure.test.tsx` | `1121dd2f1006410964ac8171ff3daf91bdd209317302584303e04b8b4e3399d0` | `4fff573c9acc324816b109c9db42abe6501b966e0336c3e18470ba471db66c54` |
| test | `src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | `4db2f6a55a186ecce083bc33dbb01afa722638a5dae8c0c326d522be9560bf88` | `a5371c43e4785072aa28765b66ff1df06e317ec3c409002f0f3087ab62a187bc` |
| test | `src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx` | `5c393bb62303d5e5568a9107c5b040b7e860c3d31b70dcd6b2de21f4ef7ace16` | `4ece7e0fec86cca7291731c52cf0b9e8f2776189b919fa2f91751768bf2a4e06` |
| test | `src/pages/ChecksStudioPage/authoredLiteralHint.test.ts` | `9ab34deb05807bcaacaf4edaf953fc9b38aacf77d0cfde168a163619ad0d2620` | `747719eb20e7a6d2b137cd69a3be199a416366e603966170de97b2ea91533397` |
| test | `src/pages/ChecksStudioPage/secretDeclaration.test.ts` | `7160c6213b75dff360c1f319a37adb4dede1785f16c9aa4c7adb8c9ed8ea23b8` | `ab8dc97087f3953414b19e19d598856a30d567e4be63b5e36c85af8165010bbb` |
| test | `src/services/mocks/studio/studioContract.test.ts` | `ae4c8bddfceed27a6dd3708b28f217aba55cd9b9cc2bdcdbbc9238b52dab4aa0` | `300838a92ec19ac05cd6ba940ea22cb2a7982b7182ba02fc1c29e34e0f0da47b` |
| test | `src/components/studio/scheduling/StudioScheduleDialog.test.tsx` | `e871cf3f3cecd5e2c698a03960a7d703e5a78f5ed3df9c3a3cf54e3212a63e79` | `570efec763011168ae45cdde858b05e6d0317f57eeed6486db9e86eaaf707384` |

`useGuidedSession.ts` is comments only; line 45 is byte-identical to the frozen file (`cmp` of `sed -n 45p`, and `grep -cF` of the sentence = 1).

## 2. Red-first (run against the frozen source bytes; logs in `logs/`)

| Log | File / filter | Items | Result on frozen source | Why it is red |
|---|---|---|---|---|
| `logs/red-secretDeclaration.log` | `secretDeclaration.test.ts` | T7 | 10 failed (10) | alias returned instead of a refusal; every test fails because the return type changed from an array to `{ok,...}` |
| `logs/red-authoredLiteralHint.log` | `authoredLiteralHint.test.ts` | UX-03 | 25 failed | 2 passed (27) | `authoredLiteralHintStep` is not exported |
| `logs/red-clarification.log` | `clarification.test.tsx` | UX-06 | 3 failed | 13 passed (16) | old "in 60 seconds" / "in 20 seconds" sentences; at 25 s the warning claims 60 seconds |
| `logs/red-replayFailure.log` | `replayFailure.test.tsx` | UX-07 | 1 failed | 14 passed (15) | `replay-drift-step-gone` is absent |
| `logs/red-guided.log` | `guided.test.tsx` | UX-01/03/05/09/12, T9 | 9 failed | 214 passed (223) | steps 2-2 form, no consequence line, replay narrative reused, `authoredLiteralHintStep` prop unknown, `failedUnnamed` points "below" at nothing, old `sessionUnreadable`/`learningElsewhere`/expiry templates, missing `secretNameTaken` |
| `logs/red-runGate.log` | `runGate.test.tsx` | UX-01/04/13, W5-1/11 | 7 failed | 29 passed (36) | (f2) old sentence, (g) replay narrative, (j)/(j2) silent no-op, (p) READY replay disabled, (q) request replayed when the session reads, (r) button not disabled |
| `logs/red-pageReplayAndReferences.log` | `pageReplayAndReferences.test.tsx` | T1, T5, T8 | 3 failed | 9 passed (12) | Run disabled on a READY replay (T1), silent learn-again (T5), token inserted and `USER_ID_2` added (T8) |
| `logs/red-pageReplayAndReferences-T1-rerun.log` | `pageReplayAndReferences.test.tsx -t "W5-1 T1"` | T1 (rerun) | 1 failed | 11 skipped (12) | rerun after fixing a pointer-capture slip in the test itself: fails on `Run not disabled` |
| `logs/red-pageGuidedRun.log` | `pageGuidedRun.test.tsx` | UX-05/16, UX-02, T2-T6 | 13 failed | 28 passed (41) | 13 failed of 41. T2/T6 later re-run (next row) after two harness fixes |
| `logs/red-pageGuidedRun-T2-T6-rerun.log` | `pageGuidedRun.test.tsx -t "W5-1 T2|W5-1 T6"` | T2 x4, T6 (rerun) | 5 failed | 36 skipped (41) | pointer kept (T2 x4); the readiness check was never sent (T6: `checks` 0, expected 1) |

Test-only items that are not red-first by the spec: W5-3 hook tests (H1-H6, evidence is the mutation run), W5-4 refactor (negative control in section 4), W5-5 (negative control in section 4), the `StudioScheduleDialog` race. UX-04 and UX-06 copy tests: `runGate (f2)`, `clarification` and `guided.test.tsx` are red above. The page-level `HINT` and `learningElsewhere` constants (`pageGuidedRun.test.tsx`) read the copy key, so they pass on the frozen bytes by construction; their RED is `guided.test.tsx` KL-015-Q4 and `authoredLiteralHint.test.ts`.

## 3. Green (after the source changes)

| Log | Command | Result |
|---|---|---|
| `logs/green-1-units.log` | `pnpm exec vitest run src/pages/ChecksStudioPage/secretDeclaration.test.ts src/pages/ChecksStudioPage/authoredLiteralHint.test.ts src/components/studio/guided src/components/studio/run/replayFailure.test.tsx src/components/studio/run/runGate.test.tsx src/services/mocks/studio/studioContract.test.ts src/components/studio/scheduling/StudioScheduleDialog.test.tsx --minWorkers=1 --maxWorkers=2` | exit 0, 11 files, **514 passed** |
| `logs/green-2-pages.log` | `... pageGuidedRun.test.tsx pageReplayAndReferences.test.tsx ...` | exit 1: `pageGuidedRun` 41/41 passed; `pageReplayAndReferences` T1 failed on a slip in my own test (the pointer snapshot was taken before the pointer existed). **Superseded by the next row.** |
| `logs/green-3-pageReplay.log` | `... src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx ...` | exit 0, **12 passed** |
| `logs/green-V2-copy-table.log` | `... guided.test.tsx -t "copy table" ...` | exit 0, **185 passed** (168 + 17, as the spec predicted) |
| `logs/green-L5b.log` | `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates src/components/studio/scheduling src/services/mocks/studio --minWorkers=1 --maxWorkers=2` | exit 0, 40 files, **938 passed, 0 failed** |
| `logs/verify-type-check.log` | `pnpm run type-check` | exit 0 |
| `logs/verify-lint.log` | `pnpm run lint` | exit 0, **0 errors, 308 warnings** (limit 308; the baseline is 308, so no new warning) |
| `logs/verify-greps.log` | greps | `STUDIO_CAPABILITIES\|PRODUCTION_ALPHA_TEMPLATES` in `src`: 0. `RUNTIME_INCOMPATIBLE_REFUSAL\|RUN_ACTION\|runActionFor\|RunAction` in `src` and `e2e`: 0. `MAX_NAME_LENGTH\|_${suffix}` in `secretDeclaration.ts`: 0. Line-45 sentence in `useGuidedSession.ts`: 1 |

New test counts: `guided.test.tsx` 240 (was 218), `clarification` 16 (was 15), `runGate` 36 (was 33), `replayFailure` 15 (was 14), `pageGuidedRun` 41 (was 34), `pageReplayAndReferences` 12 (was 10), `authoredLiteralHint` 27 (was 26), `secretDeclaration` 10 (was 7), `useGuidedSession` 49 (was 43), `studioContract` 82 (was 81). The L5b set went from 625 (F2, smaller set) to 938 because this run also includes `runs`, `scheduling` and `services/mocks/studio`.

## 4. Mutation results

Procedure: `logs/mutate-u1.py.txt` (output `logs/mutate-u1.out.txt`, JSON `logs/mutation-results*.json`). Each mutant was applied by editing the file in `mutrepo`, asserting the old string occurs exactly once, running the named tests, then restoring the file from `u1repo` and asserting `sha256(restored) == sha256(u1repo file)` (every restore asserted equal; M-H ran twice). `u1repo` itself was never mutated. Baselines (unmutated) all exit 0.

| ID | Mutation | Verdict | Killed by |
|---|---|---|---|
| M-A | clear on LEARNING too | **KILLED** | spec: clear on LEARNING too -> T3. Failing: AC-2 / ADR-SC-006: a stored session whose read is refused (tech gate L5b F-L5b-3, L5b-F2; W5-1) W5-1 T3: LEARN |
| M-B | clear on READY too | **KILLED** | spec: clear on READY too -> T1. Failing: W5-1: an unreadable stored session never blocks a replay (ruling w5-unreadable-and-alias section 2) W5-1 T1: a |
| M-C1 | decide from the list projection (no new GET) | **KILLED** | spec: decide from the list, no new GET -> T2 (flip harness). Failing: AC-2 / ADR-SC-006: a stored session whose read is refused (tech gate L5b F-L5b-3, L5b-F2; W5-1) W5-1 T2: read  |
| M-C2 | decide from the page's mount read of the test (no new GET) | **KILLED** | spec: decide from the page's earlier read of the test, no new GET -> T2. Failing: AC-2 / ADR-SC-006: a stored session whose read is refused (tech gate L5b F-L5b-3, L5b-F2; W5-1) W5-1 T2: read  |
| M-D | restore the alias rule | **KILLED** | spec: restore the alias rule -> T7, T8. Failing: AC-9: references and capability (AC-5 editor wiring) W5-2: inserting <secret USER_ID> when a variable named US; declareInsertedSecret D-8: whenever the insert is accepted, exactly one secret row declares the ID, and it car; declareInsertedSecret a name that differs only by surrounding spaces still counts as taken, as the page trims ; declareInsertedSecret a refusal returns no rows at all, so the caller cannot write an alias by accident; declareInsertedSecret parity with the backend identity resolver (Dex probe logs/probe-backend-ambiguity.log); declareInsertedSecret refused: a PLAIN row has the name, so nothing is declared and no alias is made (W5-2); declareInsertedSecret refused: a secret row of that name points at ANOTHER Vault name (W5-2); declareInsertedSecret refused: an already ambiguous set (a plain USER_ID beside LOGIN pointing at USER_ID) is  |
| M-E | MF2a: a 503 also marks unreadable | **KILLED** | spec: MF2a -> H2. Failing: unreadable (F-L5b-3; W5-3) H2: a 503 read is not unreadable: it keeps polling, and the view loads once the ser |
| M-F | MF3 and MF4 together (no reset on success, flag ignores the loaded view) | **KILLED** | spec: MF3 and MF4 together -> H5. Failing: unreadable (F-L5b-3; W5-3) H5: unreadable is reset by a successful read, and a switch to another test and back |
| M-G | no-response marks unreadable | **KILLED** | spec: no-response marks unreadable -> H3. Failing: unreadable (F-L5b-3; W5-3) H3: no response at all is not unreadable either, and the view loads later |
| M-H | learnRequest effect ignores sessionUnreadable | **KILLED** | spec: learnRequest effect ignores `sessionUnreadable` -> runGate (q), T5. Failing: W5-1 / W5-11: a stored session whose read was refused blocks learning, never a replay (q) W5-11: a learn reque; W5-1: an unreadable stored session never blocks a replay (ruling w5-unreadable-and-alias section 2) W5-1 T5 /  |
| M-I | drop finalizeHeld | **KILLED** | spec: drop `finalizeHeld` -> UX-16. Failing: AC-2: a finalize the server does not accept is not ready, never published finalize refused by an expired sign-; AC-2: a finalize the server does not accept is not ready, never published finalize refused by rejected validat; AC-2: a finalize the server does not accept is not ready, never published finalize refused by unavailable Core |
| M-J1 | MF2b: a 403 also marks unreadable | **SURVIVED** | MF2b (403 marks unreadable). Survives, as the spec predicted [I]: a 403 forgets the pointer in the same tick, so the derived flag (`sessionId` check) stays false. Equivalent mutant; H4 pins the behaviour.  |
| M-J2 | MF3 alone: no reset on success | **SURVIVED** | MF3 alone. Survives, as predicted [I]: masked by the `view === null` guard.  |
| M-J3 | MF4 alone: the flag ignores the loaded view | **SURVIVED** | MF4 alone. Survives, as predicted [I]: masked by the reset on success.  |
| M-K1 | Dex MD1: a 401 on finalize continues polling | **KILLED** | spec: Dex MD1 stays killed by the existing hook tests. Failing: refusals and HTTP outcomes a 401 on finalize is pending re-authentication: finalize is sent once, polling stop; refusals and HTTP outcomes after a 401 on finalize, a reload resumes by GET and sends the same finalize key on |
| M-K2 | Dex MD2: no in-memory pointer fallback | **KILLED** | spec: Dex MD2 stays killed by the existing hook tests. Failing: a sessionStorage that cannot be written (tech gate L5b) a finished session is forgotten from memory too, so a ; a sessionStorage that cannot be written (tech gate L5b) still finalizes: the pointer falls back to memory, so  |
| M-L1 | T6 guard: drop the selected-test check | **SURVIVED** | extra (T6 guard): drop the selected-test check. Survives: masked by the followed-session check (the followed session is derived from the selected test).  |
| M-L2 | T6 guard: drop the followed-session check | **SURVIVED** | extra (T6 guard): drop the followed-session check. Survives: masked by the selected-test check.  |
| M-L3 | T6 guard: drop all three checks | **KILLED** | extra (T6 guard): drop all three checks -> T6 goes red, so T6 is not vacuous. Failing: AC-2 / ADR-SC-006: a stored session whose read is refused (tech gate L5b F-L5b-3, L5b-F2; W5-1) W5-1 T6: a rea |
| M-N1 | W5-4 negative control: remove LEARNING from RUN_MODE | **KILLED** | spec negative control W5-4: remove `LEARNING` from `RUN_MODE` -> `every readiness maps to a Run mode ...`. Failing: story 10.11a: the run gate covers the readiness states the document declares every readiness maps to a Run mod |
| M-N2 | W5-5 negative control: delete one map entry | **KILLED** | spec negative control W5-5: delete one map entry -> the AC-1 guided-route test. Failing: STUDIO-OBS-008 AC-1: every guided route has a client method STUDIO-OBS-008 AC-1: every public operation under  |

The first mutation run (`logs/mutation-results.json`) used an invalid `-t` filter for the `runGate` (p)/(q) check (the parentheses were read as a regex group, so 0 tests ran). M-H was killed there by T5 only. It was re-run with a correct filter (`logs/mutation-results-baseline-pq-M-H.json`): also killed by runGate (q). The re-run supersedes the first M-H row.

## 5. Deviations from the spec (each with its reason)

1. Mutations ran in `mutrepo`, a copy of `u1repo`, not in `u1repo`. Reason: The copyBack files must stay exactly as verified; the spec §3 also says "never in place". Each mutant is still applied in place in the copy, restored, and sha-compared.
2. T2 is four `it.each` cases (400/409 x `unlearnedDraft`/`needsRelearnDraft`), with the "decided after the refusal" check made by a harness flag (`afterRefusal`) instead of an index into `observed`. Reason: `observed` records `request:start`, and the page's own mount reads of the test start at the same moment as the refused read, so an index comparison cannot tell them apart. The flag is set when the refusal is answered (300 ms), as the spec's flip harness describes.
3. T3 counts the readiness reads with a `pointerKept` flag taken when each request arrives, and asserts `[true, false]` for the two reads after the Refresh press. Reason: This proves "exactly one readiness check before the pointer drops, then the gate's one re-read" without racing the poll; total is 2, none more in 300 ms (spec §8 item 8).
4. T4 answers the draft's own readiness (`UNLEARNED`) before the refusal, and 503 after it; the other cases answer `LEARNING` before. Reason: The spec asserts `data-run-mode` is `learn` in T4. With `LEARNING` before the refusal the gate would read `busy`. Everything else is as specified: 3 attempts (one `getTest`, two `apiClient` retries), none more in 1500 ms.
5. T6's refused session read is delayed 300 ms. Reason: Without the delay the page's own mount reads were counted as the readiness check on the frozen bytes (first red run: `checks` was 2). The test now also asserts `checks === 1`, so it is red on the frozen bytes (the check does not exist) and not vacuous.
6. T2/T6 and T1 were re-run on the frozen bytes after two test-harness fixes (T2 title order, T6 delay, T1 pointer snapshot). The earlier full-file red logs are kept. Reason: The first versions had harness slips, found by reading their failures; the reruns give the red reason for the final tests.
7. `secretDeclaration.test.ts` is red as a whole (10 of 10) on the frozen bytes. Reason: The return type changed from an array to `{ok, rows} | {ok:false}`, so every test fails on the old function. The behaviour-bearing reds are the three refused cases and the parity table.
8. A few assertions beyond the spec text: `authoredLiteralHint.test.ts` pins N as the 1-based draft position under a reordered draft; `secretDeclaration.test.ts` adds "refusal returns no rows" and "names are trimmed"; `guided.test.tsx` `guidedCopy` adds sentence checks for `sessionUnreadable`, `secretNameTaken`, `learningElsewhere`, expiry and singular forms; `replayFailure.test.tsx` also checks the absent cases; H2 records `pending` as well as `unreadable`. Reason: They pin the specified wording and rules in the same files; no source behaviour beyond the spec depends on them. H2 needs `pending` because `NOT_READY` clears within a few milliseconds and cannot be awaited.
9. `UX-22` (record only) has no code. `GuidedClarification.tsx` and `GuidedRunStatus.tsx` are unchanged. Reason: As the spec says.

No deviation changes a wording of the copy table or a source behaviour; every copy string is the spec's text.

## 6. Notes for root

- **Commit set (W5-7):** `COPY_SOURCE_FILES.w5Ruling` makes `guided.test.tsx` read `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md`, which is untracked. It must be committed with the code, or the 3 `secretNameTaken` copy-table rows fail on a clean checkout. `COPY_SOURCE_FILES.executionProgressView` reads a tracked source file.
- **Carried, not done (spec §7.4):** the `startGuidedSession` 422 contract divergence, and `handlers.ts:177` `variable.secretId ?? variable.name`.
- **After copy-back, root runs:** the full suite (excluding `src/test/a11y` if it must not write `axe-results.json`), the a11y audit as a regression guard, Playwright, and the V9 freeze check (every manifest path outside the 24 equals the manifest).
- **Not verified here:** Playwright and the a11y audit [not run]; the e2e specs pin "Saving what this run learned…" and the plural "Repeating saved steps 1-1" only, both unchanged [inferred from grep].

## 7. copyBack (exact paths relative to `frontend/`)

- `src/components/studio/guided/guidedNarratives.ts`
- `src/components/studio/guided/GuidedCompletion.tsx`
- `src/components/studio/guided/index.ts`
- `src/components/studio/guided/useGuidedSession.ts`
- `src/components/studio/run/RunControl.tsx`
- `src/components/studio/run/useRunGate.ts`
- `src/components/studio/run/runEnablement.ts`
- `src/components/studio/run/index.ts`
- `src/components/studio/run/ExecutionProgressView.tsx`
- `src/components/studio/run/executionErrorNarratives.ts`
- `src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `src/pages/ChecksStudioPage/authoredLiteralHint.ts`
- `src/pages/ChecksStudioPage/secretDeclaration.ts`
- `src/components/studio/guided/guided.test.tsx`
- `src/components/studio/guided/clarification.test.tsx`
- `src/components/studio/guided/useGuidedSession.test.ts`
- `src/components/studio/run/runGate.test.tsx`
- `src/components/studio/run/replayFailure.test.tsx`
- `src/pages/ChecksStudioPage/pageGuidedRun.test.tsx`
- `src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx`
- `src/pages/ChecksStudioPage/authoredLiteralHint.test.ts`
- `src/pages/ChecksStudioPage/secretDeclaration.test.ts`
- `src/services/mocks/studio/studioContract.test.ts`
- `src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
