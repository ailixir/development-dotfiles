# R2 default `test` lane diagnosis 01 — `backend-r2-join-b1a-b3a-attempt01`

Author: Dex-D (@dev, diagnosis only). 2026-10-16. Read-only on source. No Gradle was run. No lifecycle change and no QA credit.
Inputs: the R2 log, the results JSON, the `test` XML, the before-manifest, and the retained R2 TEMP
`$TMPDIR/obs007-joined-9841043985701268732` (mtime 00:54 local, which matches the end of the `:test` task). The value-free
TEMP files I used are copied to `r2-temp-copies/`.

R2 `test` lane: 89 total, 74 pass, 15 fail. The source was stable during the run: ReplayIT `4242ac27…`, validator `2411f9ac…`. Both are still the
live bytes at the time of writing.

## 1. Result
There are **three independent test-side defects, all introduced by 015**, plus one consequence chain.

| # | Failure | Root cause | Class |
|---|---|---|---|
| A | Order 20/21 `actualGuided{Zero,Two}PasswordControls…` at ReplayIT:14757 | **One shared cause.** A hard-coded validator line pin `363` no longer matches. The 015 production edit to `GuidedProposalValidator` moved the count predicate to line **381**. | test pin made stale by a 015 production change (not a production defect) |
| B | Order 31 `actualGuidedOwnedPrimaryBrowserLoss…` at 14157, "C6 captured browser descendant release unconfirmed" | A race in the 015 owned-process signal authority, `p8KillRefusedWhileAlive` → `verifyRecordedOwnedHandle`. A Chromium descendant that exits after the primary browser is cut becomes a **zombie**. On macOS a zombie is `isAlive()==true` with its start instant intact but **no command line**, so `ownedCommandHash` throws `NoSuchElementException`. | test defect (owned-worker-generations01), macOS-specific |
| C | Class `executionError`, `NoSuchElementException` at 559 | A TOCTOU race in the 015 owned-process observer's ancestry walk: `cursor.parent().isPresent()` and then a second `cursor.parent().orElseThrow()`. | test defect (owned-worker-generations01) |
| — | Orders 32–43 (11 tests) at 2592 | Consequence of B. The C6 finally sets `cleanupUnconfirmed`, so the designed cascade guard stops every later case. The suppressed `Endpoints/PostgreSQL retained…` in `executionError` comes from the same latch. | designed fail-stop, no change |

Not causes:
- The environment: `--no-daemon` was used, Chrome launched and tests 1–31 ran.
- D1, F2, E-1, E-2 and `ExecutionReferences`.
- G (the 120 s ceiling). Order 31 asserts `timeout_seconds == 30` (13994) and fails on process identity, not on timing. C6 kinds 1 and 2 (Orders 29 and 30) passed in R2.
- Fixture values.

No production defect is implicated.

## 2. Evidence

### A. Validator line pin (both password-count tests)
- 14757 asserts `validatorCountPredicate`. That flag is computed at ReplayIT:2044 as `line == 363 && policyDenied && status == 422`. `line` is the
  `GuidedProposalValidator.action` stack frame of the refusing `require` call.
- R2 TEMP `p4-first-guard-diagnostic-0.json` and `-2.json` (verified) both show `actualActionLine 381` against `expectedGuardLine 363`, with `actualStatus 422`,
  `actualCodeOrdinal 1` (POLICY_DENIED), `actualRollbackObserved true` and `observerFailed false`. `actualPasswordCount` is 0 and 2, and the
  observation count, user ordinal and password ordinal all match the test's other assertions. The only predicate that differs is the line number.
- Live validator:381 is `require(progress…coverage.passwordControls == 1, "POLICY_DENIED", 422)`, the count predicate.
- Last green run: STUDIO-OBSERVED-NEXT `backend-final-normal-check-attempt02` (2026-10-15 01:57Z, 2102/2077/0 fail), with validator `0c9b1532…`. I reconstructed that source
  byte-exact (sha matches) from the NEXT JaCoCo HTML. Its line 363 is the same count predicate.
- `diff` against live shows the only change is 015's `admitPlan(session, response, learningWindow)` overload, together with the window, completed-coordinate and `MISSING_SOURCE` lines, all
  above `action`. They add +4, +4 and +10 lines, which is +18, and 363 + 18 = 381. The `action` body is otherwise unchanged.
- Both tests' teardowns were **CONFIRMED** (`failed-test-cleanup-test-21/22`), so they did not cause the cascade.

### B. C6 kind 3 descendant release
- XML suppressed chain (verified): `NoSuchElementException: No value present` at `ownedCommandHash:458` ← `verifyOwnedDescendant:574` ←
  `verifyRecordedOwnedHandle:584` ← `p8KillRefusedWhileAlive:13668` ← descendant loop 14147.
- For execution to reach line 574, the descendant must be recorded, `isAlive()`, and have a matching start instant, while
  `info().commandLine()` is empty.
- Probe on this host (JDK 21, `scratchpad/r2diag/ZombieProbe.java`): for a macOS zombie, `isAlive=true`, `startInstant` present,
  `commandLine/command/arguments` **absent**, and `ps -o ppid=,pgid=,stat=` prints `<ppid> <pgid> Z`. This is **verified**. It is **inferred** that the R2 descendant was a
  zombie or exiting process at that instant, because no other macOS same-user state gives a live, start-matching handle without arguments.
- History: `owned-worker-generations01/owned-worker-generations.patch` added `if (!pinned.isAlive()) return false; verifyRecordedOwnedHandle(pinned);`
  to `p8KillRefusedWhileAlive`. Before that, the helper was `!destroyForcibly() && isAlive()`, and its own comment says "A zombie still accepts
  SIGKILL; only a reaped pid refuses". The test passed in NEXT with the old helper.
- In 015, Order 31 had not run under a working browser before R2: join85-attempt07 failed everything (environment cause A), and the r1/e12 selections did not
  include it.
- Secondary suppressed error: `exact descriptors restored after original dispatch lifetime` (14439) in `p3CleanupOwnedResources`. **Inferred** to be a consequence:
  the case aborted before `awaitState(UNKNOWN_OUTCOME)` and the tree-exit wait, and the cleanup found the session CANCELLED.

### C. Observer ancestry race (class `executionError`)
- The `executionError` primary is `NoSuchElementException` at `recordOwnedDescendants:559` ← observer lambda 520. That lambda is recorded in
  `OWNED_FIXTURE_FAILURES` and only surfaces in the class teardown (2555/22081).
- Line 558 checks `cursor.parent().isPresent()` and line 559 calls `cursor.parent().orElseThrow()` again. Each `parent()` re-queries the OS, so an ancestor that exits
  between the two calls throws.
- Line 563 has the same pattern: it reads `command` once at 551, then `ownedCommandHash(child)` reads it again.
- **Inferred:** this happened while the browser tree collapsed in Order 31, but no timestamp is recorded.

### F2 / F3 (coordinator leads from b2ab-source01/notes.md)
- **F2: real latent defect, included in the patch.** ReplayIT:7615 puts the strings `baseRevisionId` and `revisionId` into `p3WriteEvidence`, and
  `requireNumericBudgetEvidence` (2977) accepts only numbers and booleans. Order 42 would therefore fail on its last statement. It did not cause any R2 failure,
  because Order 42 stopped at the 2592 guard. Once B and C are fixed it would surface. No consumer of `p3-incremental-secret-prefix.json` exists in the
  repo. The base→merged relation is already asserted at 7594 (`reusedFrom…revisionId == base.revision()`). Fix: drop the two string fields. No assertion is removed.
- **F3: not causal, not included.**
  - `p3CreateSource` stores `AuthoringRevisionIdentity.create(authoring, Map.of())`, while step TWO contains `<var USER>`. So the stored `ui_tests.authoring_revision_inputs` would fail
    `valid()` because the count differs. Production `StudioService.revisionInputs` would store it with the plain `USER` value.
  - But publication overwrites that column from the recomputed current identity (`GuidedPublicationRepository:249-250`). The guided readers (`GuidedSourceSnapshotRepository:56`,
    `GuidedPublicationBaseRepository:84/196`) recompute from live data.
  - In R2, every `p3CreateSource(…, true)` case that ran (Orders 20–31, including published and ordinary runs) got past start, learning and publication. F3 explains no R2 failure.
  - Fixture-fidelity option if QA wants it: change the argument to `password ? Map.of("USER", "p3-user") : Map.of()`.

## 3. Proposed fix: `fix.patch` (ReplayIT only, 7 hunks, `git apply --check -p0` OK against live `4242ac27…`)
1. **A:** `363 → 381` at 2044 (predicate), 14758 (assertion) and 14827 (diagnostic `expectedGuardLine`). The oracle is unchanged: the exact count-predicate
   frame, POLICY_DENIED and 422 are all still required. Note that any future line shift above validator:381 breaks this pin again.
2. **B:** in `p8KillRefusedWhileAlive`, if identity verification throws, the process gets **no signal**. The helper returns "not refused" only when the process is
   then not alive, or `ps` shows `Z` or `X`. This is the same terminated-state rule `p6KillOwnedTree` already applies at 9937. Otherwise the original
   verification failure is rethrown. Release is still proven by `p6AwaitProcesses(browserTree, true)` at 14246/14277, and in the finally at 13922. No
   signal is ever sent without verified identity.
3. **C:** the ancestry walk reads `parent()` once per hop. A vanished ancestor ends the walk unlinked, and `verifyOwnedDescendant`'s ancestry assertion still refuses any later signal.
   The descendant command hash is computed from the already-read `command` through a new `ownedCommandHash(String)` overload.
4. **F2:** remove the two string evidence fields.

Verification:
- `javac` (JDK 21, outside Gradle, with build classes and the cached jars) compiles both base and patched ReplayIT with 0 errors.
- I did no runtime verification, because I am barred from Gradle. A fresh label (`--no-daemon`) is needed.
- Orders 32–43 have not yet executed under 015, so further independent failures behind the cascade are possible.
- Formatting: the patch follows the surrounding style, and the 015 owned-process block is already non-gjf. Do not run the spotless IDE hook on ReplayIT.
