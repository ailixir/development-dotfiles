# Receipt: lane R2 (KL-015-D5, AC-11 D5 a-f runner half, AC-11 k residue)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO. Marks: [V] verified by a run or a read, [I] inferred.
- **Result: GREEN for the lane's own verify commands; two existing fixtures-tier tests are RED as a consequence of ruling D5-1 item 2 (finding F-R2-1, needs root/@architect/QA).**
- Spec: `w1.5/ruling-part1.md` section 2. The probe `guidedCloseProbe.test.ts` was deleted in the same change that turned `guidedCloseBound.test.ts` green (its evidence stays under `pr-rt/`, sha256 `281510cd...`).

## Files
| file | sha256 before | sha256 after |
|---|---|---|
| `studio-runner/src/run/browser.ts` | c9d74add7549cfbc6c065e663d75d5c844340503413203ddf0d28af785d4b171 | f1adfd338106e3c40de5ac9b60336487c6473781d52aefedb641913329b4b840 |
| `studio-runner/src/run/guidedBrowser.ts` | f5019a6235961dace45714c950e4bb2d5851e61efe6839b1ae3fbbb8c6e6d844 | db618097131b61120bae7acdcbb33962adee835b152b0c17350b3d25f86fa432 |
| `studio-runner/src/guided/runtime.ts` | a95ae57ac285e98118c182bdac3092bfc9fc1be003c9072e8f8488811a754776 | eb0e4bd7ab2fc558c2b351740f21ef41a936c76f09b09bfa24506631c618dcfe |
| `studio-runner/vitest.config.ts` | c833caed66dc39aed1677db7cab921e97a5eb5b36291429c5f5e90f1a28c08f8 | cb110d944a17da279eefbce363b75cb50c09f753b6705dfd67d40948e1ff3051 |
| `studio-runner/test/guided/runtime.test.ts` | 002a7af44e7b77d18a7a0e5425f2fc2118eb5ee78a9b011351fab62b6b0af073 | 47fec2b4e9277571f3993d5f53ef13f8f454e26887d34378f8559be0e92b8786 |
| `studio-runner/test/guided/ownership.test.ts` | 65f171bd1c51b83436fedd26223d54017e802f3c4a3dad1f1071dd3b95a53b51 | 63cdcf42e7da63cb5b94327cfb343152b0a5e0b17ad880f9250572d86707eaa6 |
| `studio-runner/test/guided/browser.test.ts` | 2e516344ced18a49855a70b8c7e71dee09386984f5a08c8a4f112884cf83d3c7 | 73d359901693ab2fd355932d9344d48c7dfd0b800e5e8f54e23c2cdc73ba86ea |
| `studio-runner/test/run/guidedBrowserReap.test.ts` | new | 8b1f8628ca378919625ed58e35e883c8f54a4d5ed924f457b65c87cc5ffa3d90 |
| `studio-runner/test/fixtures-tier/guidedCloseBound.test.ts` | new | 3f376556a1f82d6dd3eb9c466f3890eed606f8909420365835b4f4df48902ce4 |
| `studio-runner/test/fixtures-tier/helpers/guidedLaunch.ts` | new | 87caa8168b01ca9781778d1079e372ad0dc1da364e540a6008c1ea1985c6b86d |
| `studio-runner/test/fixtures-tier/guidedCloseProbe.test.ts` | 281510cd319ff20bbf25c0c616bf62e80742ec653853245cbd8a98679a69c32a | deleted |

sha256 "before" values were taken at lane start from the live working tree (which already carried other lanes' uncommitted work), so they are the lane baseline, not a git blob.

## What changed
- `guidedBrowser.ts`: `GUIDED_CLOSE_GRACE_MS = 3_000` (doc cites the ruling and the 14.5 s arithmetic); `guidedCloseStages()` (the pure two-stage close, no Playwright import, so the unit tier proves the clock); `GuidedBrowser.terminate` and `GuidedBrowser.orderlyClosed`.
- `browser.ts` (`launchGuidedBrowser`): `close()` = graceful `context.close()` raced against the grace, then always the memoised `hardTeardown`; `terminate` shares that memo; `disposeScratch` memoised; the catch path ALWAYS takes the hard teardown (graceful `cleanup()` deleted; the explicit `live.close()` on a blank-document mismatch also deleted); a non-deadline failure rejects after its teardown settled, a deadline/stop failure rejects at once and the runtime waits through `close` (D4 behaviour, unchanged).
- `runtime.ts` `closeResources`: `startPhase === 'STARTED'` -> `browser.close()`, otherwise `terminate()` alone; `orderlyClose` = the browser's own verdict; `releaseWhenLaunchSettles` uses `terminate`. The order `browserClosed = true` -> disposal -> lifecycle callback is unchanged.
- `ownership.ts`, `tree.ts`: no change (as ruled). `vitest.config.ts`: comment-only (A13 fix; D1's `guidedMain` baton applied: the stale exclude and its comment are gone).

## Commands and results (all [V])
| command | exit | counts |
|---|---|---|
| red unit (`red-unit.log`): runtime, ownership, browser tests before the code | 1 | 20 failed / 120 |
| green unit (`green-unit.log`), same three files after | 0 | 120 / 120 |
| lane verify unit (`verify-unit-green.log`): runtime, ownership, browser, guidedBrowserReap | 0 | 126 / 126 (4 files) |
| `test/guided` + `guidedBrowserReap` (includes the doubles of other lanes) | 0 | 227 / 227 (11 files) |
| fixtures, no-globalSetup config, `guidedCloseBound.test.ts` (`fixtures-green-1.log`, `fixtures-green-2.log`) | 0 | 5 / 5, twice |
| red fixtures on the pre-D5 behaviour (`red-fixtures.log`, scratch copy with M1+M2+M5) | 1 | F1, F2, F3 red; F4 and H green |
| `tsc -p tsconfig.json --noEmit` and `eslint` on every file of the lane | 0 | clean for the lane's files (one lint error elsewhere: `test/deployment/tls-client-cert.test.ts:71`, not this lane) |
| runner unit suite, whole (`../r1/full-unit-suite.log`) | 0 | 2469 passed, 29 skipped, 110 files |

Fixtures were run WITHOUT the `globalSetup` dist re-emit (W2 brief; same approach as `pr-rt/`); `dist/` was not rebuilt [V: no build command was run]. Neighbouring fixtures files were run in a scratch copy with its own `docs/` so their evidence writes never touched the repo: browser-profile-safety, guided-start-deadline, guided-recording, guided-recording-kill, guided-wire, guided-dataflow, mixed-mode-prefix, guided-secret-ownership/isolation/stale-grant, secret-login. All pass except the two in F-R2-1. Logs: `fixtures-neighbours-scratch.log`, `fixtures-guided-neighbours-scratch*.log`, `fixtures-stale-grant-scratch.log`, `fixtures-profile-safety-BASELINE-scratch.log`. (The first neighbour logs show environment failures of the scratch copy, missing `dist` and evidence directories; the `-2` and stale-grant logs are the reruns after fixing the scratch.)

## Measured (`bound-results.json`; macOS arm64, Node 24.20.0, one host)
- F1 (i): stop reply 200 at 3 108 ms (close 3 098 ms = 3 000 grace + about 100 ms terminate), slot free, 0 frozen processes alive. Before D5: 30 034-30 061 ms and no reply (PR-RT).
- F2 (ii): `/context` 409 CONTEXT_LOST at 12 110 ms; the terminate alone took 100 ms. F3 (iii): reply at 898 ms, terminate 103 ms after the failure (was about 31 s). F4 (iv-a): stop reply at launch + 15 034 ms (unchanged, ruled).
- **H (healthy recorded close, 5 runs): 145, 134, 147, 152, 133 ms; max 152 ms**; all `orderlyClosed() === true`, webm header valid, scratch gone. Under the 1 500 ms guard, so the ruling's 2.2 stop condition is NOT triggered.

## Mutations (key assertions; scratch copy only, the repo was never mutated)
| id | mutation | result |
|---|---|---|
| M1 | `close()` reverted to the unbounded graceful close | unit U1 red (6 tests); fixtures F1 red (no 200 within 15 s) |
| M2 | graceful close restored on the start-failure path | F2 red (`closeKind` is `close`, not `terminate`) |
| M3 | survivor check removed from the hard teardown | `guidedBrowserReap` source pin red |
| M4 | slot released before the close is confirmed | U1/U3 and the older Quinn F5 cases red (30 failures) |
| M5 | graceful cleanup restored on the non-deadline launch failure | F3 red |

Logs under `mutations/`. M3 is a source pin because a SIGKILL-proof process cannot be produced; the runtime-level U3 uses an injected rejecting `terminate` [I: the live survivor branch is covered by the pin plus `guidedBrowserReap`'s survivor test on `killLaunchTree`/`survivorsOf`, not by a live wedge].

## ACs covered (local half)
D5 a-e runner side: the bound, the two-stage close, reply after settle, slot on confirmed close, socket timeout untouched (30 s), tests U1-U6, F1-F4, H and the mutations. **D5 f: KL-015-D5 stays OPEN** until the F-merge `dist` rebuild is recorded (AC-12 i). AC-11 k residue: coverage comment corrected; reap proof is `test/run/guidedBrowserReap.test.ts` (real processes, before/after listing) plus `ps-before.txt` / `ps-after.txt` here (the four pre-existing `checks-guided` processes 5083, 5095, 13577, 13581, unchanged, none mine, none signalled).

## Deviations
1. **`terminate` and `orderlyClosed` are OPTIONAL on `GuidedBrowser`** (the ruling says required). Three test doubles outside R2's write set (`test/guided/stopReason.test.ts`, `incrementalRuntime.test.ts`, and D1's `transport.test.ts`) build a `GuidedBrowser` without them; required members would have turned the type-check and those suites red for other lanes mid-wave. The runtime falls back to `close` for a double without `terminate` and to `orderlyClosed ?? true`. `launchGuidedBrowser` always provides both. Baton B-R2-1.
2. A non-deadline launch failure awaits its own teardown BEFORE rejecting (the ruling leaves this open). The existing `awaits actual scratch removal after guided ... rejection` tests pin "scratch is gone when the launcher rejects"; it also makes the bound failure instant + K by construction. A deadline/stop failure still rejects at once.
3. `guidedBrowserReap.test.ts` cannot import `browser.ts` (AC-25), so its launch-path cases are source pins plus real-process reaping of the same `killLaunchTree`/`survivorsOf` chain; the Chromium proof is F1-F4.

## Findings and batons for root / @architect / QA
- **F-R2-1 (blocks the fixtures tier at F-merge; ruling versus an existing QA fixture).** D5-1 item 2 ("the catch always takes the hard teardown; delete the graceful cleanup()") turns two tests in `test/fixtures-tier/browser-profile-safety.test.ts` red. Both are green on the pre-R2 behaviour [V: scratch BASELINE run, 10/10, `fixtures-profile-safety-BASELINE-scratch.log`]. They are `retains cleanup capability after actual context acquisition and never deletes scratch before confirmed context closure` (asserts the failure's `close()` calls `context.close()` and that an unconfirmed close retains scratch) and `refuses a Default directory redirected after actual launch ...` (the `ProfileSafetyFixture` requires exactly one real production `context.close()`; the run records 0). The safety facts themselves hold in the run: `expectedRefusal`, `canaryUnchanged`, `outsideIdentityUnchanged` are true and 0 processes survive [V, the persisted `profile-safety.json` in the scratch copy]. The file is in no lane's write set. Needed: either QA's fixture accepts "hard teardown, processes confirmed gone" for a failed launch (QA-owned oracle, strict-qa-20261014 remediation), or @architect amends D5-1 item 2 to keep a bounded graceful stage on (iii). I did not choose.
- **B-R2-1:** after the three doubles gain `terminate: () => Promise.resolve(), orderlyClosed: () => true`, make both members required in `guidedBrowser.ts` and delete `terminateOf` and the `?? true` in `runtime.ts`.
- **B-R2-2 (D1 / F-merge):** `test/fixtures-tier/helpers/guidedLaunch.ts` calls `createGuidedServer({workerId, journalDirectory, tls, controllerJwt, controllerCertificateFingerprint256, launch, claim, callback})` as it is today; if D1 changes that factory's options, update that one call.
- **B-R2-3 (O-AE):** the `closeResources` and `releaseWhenLaunchSettles` edits are done; O-AE may take `runtime.ts` for the `withhold` input filter.
- Not claimed: nothing in-cluster; one wedge type (SIGSTOP) on one host; a SIGKILL-proof process was not produced.
