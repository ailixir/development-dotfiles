# STUDIO-OBS-009 F-R2-1: @qa co-sign of the R2 oracle change

- **Signed:** Quinn (@qa), 2026-10-18. Read-only review during the G9 hold window. No test was run by me.
- **Not a gate decision.** No PASS/CONCERNS/FAIL/WAIVED. No story status change.
- **Legend:** [V] verified today by reading the named file, receipt or status line. [I] inference, with its basis.

## Verdict: SIGN-WITH-NOTES

I co-sign two things that `f-merge/pre-rulings.md` §1 and the R2 receipt ask QA to accept:

1. The **terminate oracle** that replaces the "exactly one production `context.close()`" requirement, for a launch that fails after the context exists (the `browser-profile-safety` fixtures).
2. The replacement of the exploratory probe `guidedCloseProbe.test.ts` by the asserting file `guidedCloseBound.test.ts`.

The notes limit what the signature means. They do not hold it back.

## 1. The terminate oracle (`profileSafetyFixture.ts`, `browser-profile-safety.test.ts`)

### 1.1 What I read

`studio-runner/test/helpers/profileSafetyFixture.ts` (the `terminate` mode), `studio-runner/test/fixtures-tier/browser-profile-safety.test.ts` (the two renamed or changed tests), `f-merge/pre-rulings.md` §1.1-1.3, `f-merge/prep-dev/receipt.md` item 1, `r2/receipt.md` F-R2-1.

### 1.2 Does it keep the safety property of the 2026-10-14 ruling? Yes, and for a stronger reason

The 2026-10-14 property was: every retained PID is definitely gone at the first observation after production's close, and production never removes scratch while confirmation is pending or rejected. Under the new production behaviour the oracle requires all of the following. I checked each against the code.

| Pre-rulings §1.2 clause | Where it is enforced | Mark |
|---|---|---|
| (i) 0 real `context.close()` requests from production | `observeProductionTeardown()` throws `GRACEFUL_CLOSE_ON_FAILED_LAUNCH` if `productionRealCloseRequests > 0`; `run()` re-checks after the body. In `terminate` mode every wrapper call before the body starts counts as a production close (`close()` passes `this.terminateMode && !this.bodyStarted`). | [V] |
| (ii) every owned PID `DEAD` at the **first** probe | `observeProductionTeardown()` records `firstPidProbeMs` and `firstPidState` once. `state()` returns `UNKNOWN` unless both snapshots are valid, no capture failed and at least one PID is known. A LIVE or UNKNOWN first probe is red. In `terminate` mode a later cleanup close cannot overwrite the first observation (`closeOnce` guards it). | [V] |
| (iii) browser disconnected | `safeToRemove = first==='DEAD' && !owned.connected() && browserDisconnectedEvent`. | [V] |
| (iv) no `checks-guided-*` scratch | Test `:51` body asserts `readdir(root)` has no such entry after `failure.close()`. Test `:46` asserts the same and also asserts a second `close()` changes nothing. | [V] |
| (v) attack facts hold | Canary unchanged and outside-Default identity unchanged, both asserted in the `:51` body before the facts persist. | [V] |

Further fail-closed behaviour I confirmed:

- If the body never calls `observeProductionTeardown()`, `firstPidState` stays `NOT_OBSERVED` and `run()` throws `PRODUCTION_TERMINATE_REQUIRED`. The oracle cannot pass by omission.
- `precloseSnapshotValid` is taken inside `handoff` (before production acts) in `terminate` mode, because the launcher's catch runs the teardown before the body sees the outcome. Without it `state()` would return `UNKNOWN`.
- The default `contextClose` mode and the started-session path are unchanged: the fixture-unit file is 73/73 (67 old plus 6 new) per the receipt [V receipt, not re-run by me].
- The fixture still sends no signal.

### 1.3 Does the amendment weaken anything? Two small things

1. **The "scratch retained while a survivor is unconfirmed" property no longer has a live-browser test.** The old test `:46` proved it by making an unconfirmed `context.close()` and checking the scratch stayed. Under a hard teardown there is no graceful close to leave unconfirmed. The property is now carried by `test/guided/browser.test.ts` U3 (an injected rejecting `terminate`) and by a source pin (R2 mutation M3, `guidedBrowserReap.test.ts`). The R2 receipt says plainly that a SIGKILL-proof process could not be produced. [V receipt] So the property is proved on doubles and a source pin, not on a real wedged browser. I accept that for 009. I do not accept a reading of the record that says "survivor handling proved on a live browser".
2. **Test `:46` finds owned processes by argv match** on the unique scratch directory name through a read-only process table, and requires the table to be non-empty so an unreadable `ps` cannot pass. [V] That is a weaker identification than the harness's CDP-derived PID set used in `:51` (7 PIDs recorded in both runs). A renderer whose argv lacked the profile path would escape `:46`. `:51` covers it. Accepted.

### 1.4 Do the mutations bite? [V receipt, not re-run]

- M5 (graceful `context.close()` restored on the catch path): both changed tests red (`:46` on `expected 1 to be +0`, `:51` on persisted `primaryCode GRACEFUL_CLOSE_ON_FAILED_LAUNCH`).
- Fixture-unit mutants MF3 (launcher close not counted), MF4 (credit without the disconnect check), MF5 (cleanup close overwrites the first observation): each red on the named cases.
- R2's own mutations M1, M2, M3, M4, M5 against `guidedBrowser`/`browser.ts`/`runtime.ts`: each caught by the named unit or fixture case.

### 1.5 Evidence that the tier is green on the final tree

G9 C3 (runner fixtures) exited 0 [V `local-gate-20261018/status.txt`: `C3-runner-fixtures exit=0`]. I have not read the counts. The D2 record must take them from `obs009-g9-runner-fixtures01-*` and name the two renamed cases in the testcase list.

## 2. `guidedCloseBound.test.ts` replaces `guidedCloseProbe.test.ts`

- [V] The probe file is gone from the tree (`ls` finds no `guidedCloseProbe.test.ts`). The R2 receipt keeps its evidence under `pr-rt/` (sha256 `281510cd...`). A probe that only measured is replaced by a file that asserts.
- [V] The new file has five asserting cases: F1 (frozen after a completed start), F2 (frozen entering WITHHOLD), F3 (non-deadline launch error with Chrome frozen), F4 (stop before spawn, unchanged), H (five healthy recorded closes).
- Non-vacuity checks I made by reading the assertions:
  - F1 asserts the close **took at least the grace** (`closeSettled - closeCalled >= GUIDED_CLOSE_GRACE_MS - 50`) as well as at most grace plus the terminate bound. So it fails if someone removes the graceful stage as well as if the bound disappears.
  - F1-F3 assert `aliveWhenCloseSettled === 0`, `survivorsOf(control) == []` and `slot.held === false`.
  - F2 and F3 assert the **kind** of close (`terminate` and `failure.close`), so a graceful close cannot satisfy them (R2 mutations M2 and M5 turn them red).
  - H asserts a valid WebM header, minimum bytes, `orderlyClosed`, and scratch gone on five healthy closes.
- Measured values in `r2/bound-results.json` [V]: F1 stop reply 200 at 3 108 ms; F2 `409 CONTEXT_LOST` at 12 114 ms; F3 reply at 898 ms; F4 unchanged at launch plus 15 034 ms; H max 152 ms.

### Limits I want in the record

- One wedge type (SIGSTOP), one host (macOS arm64, Node 24.20.0). Nothing in a cluster. [V receipt "Not claimed"]
- The healthy-close figure (max 152 ms) is on one host and five closes. The ruling's stop condition is 1 500 ms, so there is margin, but the number is not a distribution.
- R2 left `terminate` and `orderlyClosed` optional on `GuidedBrowser` (deviation 1). `pre-rulings` item 6 says root makes them required at F-merge. [V today] `guidedBrowser.ts:135` and `:141` declare both as `readonly` required members, and `runtime.ts:593-596` calls `browser.terminate()` and `browser.orderlyClosed() ?? false` without a `terminateOf` helper. The `?? false` is a defensive default, not the removed `?? true`. I did not open the three test doubles beyond a grep, which shows they still build `GuidedBrowser` objects; G9 C1 (type-check) exited 0 [V status.txt], and the runner `tsconfig.json` includes `test/**/*.ts` [V], so the doubles compile.

## 3. Conditions and what stays open

1. The signature covers the **failed-launch-after-context-acquisition** path only. The deadline and stop failures (reject at once, teardown still running) are covered by F2 and F4 in `guidedCloseBound`, not by the profile-safety fixture.
2. The D2 record cites the survivor property as proved on doubles plus a source pin (note 1.3.1).
3. (Closed above: both members are required in the tree.)
4. This co-sign replaces nothing in the 2026-10-14 ruling for the started path or the positive case. Both stay as written.

Signed: Quinn (@qa), 2026-10-18.
