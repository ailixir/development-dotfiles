# STUDIO-OBS-015 QA source review, windows W6 to W9

Quinn (@qa), 2026-10-17. Read-only. No source edited, no Gradle, vitest or build run (gate attempt05 is live on this tree). Commands I did run: `git`, `shasum`, `grep`, `sed`, `ps -p` (read only), `python3` for hash and manifest comparison.

Labels: **[V]** = I read the code or evidence and saw it. **[I]** = inference, not demonstrated.

## Verdict: OK to gate. No BLOCKER.

There is nothing in W6 to W9 that makes the live gate run pointless or unsafe. There is one MAJOR (F1) that does not affect the gate and must be fixed or explicitly accepted before the guided worker ships in a container. Details below; machine-readable copy in `findings.json`.

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | none |
| MAJOR | 1 | F1 |
| MINOR | 5 | F2 to F6 |
| INFO | 9 | F7 to F15 |

## What I could and could not establish

- **State under review equals the state Dex reported [V].** sha256 prefixes of the 16 W9 runner files I hashed (`runtime.ts 8cbaf821`, `ownership.ts 8bca851c`, `browser.ts 0cdba58b`, `tree.ts 0a53bc92`, `guidedBrowser.ts 8490844f`, `guidedMain.ts 7d06c6fa`, the four D4 test files, `transport.ts`, `diagnostics.ts`, `versionProbe.ts`, `.nvmrc`, `package.json`) all match the File List. The G2 to G5 checkstyle manifests (`sha256After`) match the current backend files byte for byte, so the W6 receipts describe the code that is on disk. `GuidedPublicationReplayIT` (G1) has changed since, as expected (W7, W8).
- **I did not re-run any mutation.** The eight D4 mutation claims were judged by reading which test would fail. Seven of eight are plausible from the tests (see section 3). The ninth class of mutation I tried to construct mentally (dropping `.filter` in `versionProbe`) would **not** go red (F6).
- **Not exercised by me:** real Chromium, the fixtures tier, any Gradle lane, the image. Everything about runtime behaviour of `launchGuidedBrowser` is by reading plus Dex's reported runs.

## 1. W9: REL-001/D4 (the 12 s guided start deadline)

### 1.1 Abort and deadline wiring [V by reading]

- One budget, armed once: `runtime.ts:138-147`. `bounded()` recomputes `min(began + 12000, this.deadline())` on each step (`runtime.ts:146`) while the launcher gets the value fixed at launch call (`runtime.ts:201`). They can differ only if a lease renewal raises `deadline()` during the start, and then the launcher's own deadline fires first and produces the `GuidedLaunchFailure` with the step. Either order is handled. No bug.
- Abort cannot damage a started session. In `launchGuidedBrowser` the signal is used only through `boundedStartup`, which removes its listener on settle (`observedBootstrap.ts:25`), and in the catch block (`browser.ts:658`). After a successful launch nothing listens, so `stop()` calling `startAbort.abort()` first (`runtime.ts:605`) is a no-op for a live browser and does not kill a recording before it is finalised. I specifically looked for a persistent listener because that would have been a BLOCKER; there is none.
- No window in which a browser is launched after a stop: between the last `await` before `options.launch(...)` and the launch call there is only synchronous code (`runtime.ts:196-207`), and `this.live()` or the `this.stopped` check precedes it.
- Late settlement is closed. A launcher that outlives the deadline plus the 3 s reserve has its result closed before the slot is released (`runtime.ts:592-598`); a launcher that rejects before the runtime stops has its `close` captured (`runtime.ts:221`, `565`). No unhandled rejection path found: `launching`, `opening`, `originalStop`, `closing` all have handlers attached.
- Microtask budget (deviation 3). With a real launcher the abort listener rejects the pending `bounded` synchronously, the launcher's `await` resumes one tick later, its catch builds `GuidedLaunchFailure` and rejects, and the runtime's `launching.then(...)` records `launchEnd` one tick after that. About 3 ticks against a loop of 16 [V by counting, [I] that V8 schedules as I describe]. The unit test only exercises a 1-hop fake, so the real hop count is not pinned. If a launcher took more than 16 ticks, the only loss is the sub-step detail in the log line; `closeResources` still collects the settled launcher within 3 s (`runtime.ts:563-566`).

### 1.2 Teardown kill selection [V by reading and by the unit tests]

`selectLaunchRoots` (`tree.ts:308-315`) chooses a row only if it is a direct child of the worker pid, is not pid 1 or the worker, and its command line names one of this launch's own paths as a whole path (`commandLineNames`, `tree.ts:289`). The markers are the `mkdtemp` scratch directory and the per-session `checks-recording-*` directory, each as written and as `realpath` (macOS `/private/var/...`), and a marker needs at least two path segments (`tree.ts:294`).

- PIDs 22246, 44737, 13577, 13581 cannot be selected. `tree.test.ts` builds a table with all four (13577 and 13581 deliberately naming this launch's scratch and recording paths, parent pid 1) and asserts none is chosen and none is signalled, including by a marker that names them outright. I checked the real host: 13577 and 13581 are orphaned Chrome-for-Testing processes (ppid 1, up 3.5 days), 44737 is a `node`, 22246 is gone. All are outside any worker's direct children, so selection excludes them even if a marker matched.
- Look-alike directory (`...AbC123x`), another session's browser, and a process that merely appeared are all rejected by tests, which is the right set.
- Kill itself: `signalProcessTree` per root, deepest first, each member with its group; enumeration happens before signalling. `kill(-pid)` on a non-leader is `ESRCH` and swallowed. Chrome and ffmpeg are spawned detached by Playwright, so the group signal cannot reach the worker's own group.
- The fail-closed half of this design is weaker than the selection half. See **F1** and **F2**.

### 1.3 Wire contract [V]

Unchanged. `409 {"code":"CONTEXT_LOST"}` still comes from `transport.ts:118-124` because `GuidedStartFailure.message` is `CONTEXT_LOST` (`diagnostics.ts:24`). At HEAD the same catch block threw a bare `CONTEXT_LOST` after `await stopEntry(...)` (`git show HEAD:.../ownership.ts` line 127), so mapping every start failure to `CONTEXT_LOST` is not new. `TIMEOUT` and `CANCELLED` are converted at `runtime.ts:142` and never reach the wire. No backend, OpenAPI or schema file is touched by W9.

### 1.4 Logging [V]

`describeStartFailure` (`diagnostics.ts:61-73`) writes: operation (closed), a 16 hex character hash prefix of the session id, elapsed ms, and up to six links of class name (regex limited), a message only if it matches `^[A-Z][A-Z0-9_]{2,47}$`, an errno code, a closed phase, and exit code and signal digits. No path, URL, message text or session id. `transport.test.ts` plants a private path in the cause and asserts it and the session id are absent; `diagnostics.test.ts` covers hostile names and operations. The kill code logs nothing and reads command lines only in memory. Two small residues are INFO (F8).

### 1.5 Single path [V]

No compat layer found. One accommodation to watch: the `startup` argument is optional (`runtime.ts:38`) and `launchGuidedBrowser` supplies its own 12 s budget when it is absent (`browser.ts:536`), "so existing fakes stay valid" (ruling). Production always passes it. INFO (F11).

## 2. Deviations from the D4 ruling: my view (Aria rules)

1. **`stop()` rejects `CONTEXT_LOST` instead of resolving for a launcher that never settles. Agree.** The ruling contradicts itself: the test table says `stop()` resolves, but its own Close paragraph says the runtime "treats it like any close failure", and every other close failure rejects `CONTEXT_LOST` (`runtime.ts:577-579`). Resolving while `active` stays true would answer a stop 200 over an occupied slot. Rejecting is the truthful verdict and maps to a 409 `CONTEXT_LOST` on the wire for a stop. One consequence to record: `entry.stopping` caches the rejection (`ownership.ts:146`), so a later stop retry never re-attempts teardown; release happens only through `releaseWhenLaunchSettles`. That is fail closed and acceptable.
2. **`GuidedOwnership.context()` ignores a failing `stopEntry`. Agree.** Wire parity holds: both paths end in `409 CONTEXT_LOST`, and the only thing lost before was the single log line. Slot occupancy is unaffected because `occupied()` reads `entry.runtime.active` (`ownership.ts:39`), which stays true. Covered by the ownership test that asserts `GuidedStartFailure` is still thrown while the slot is held (`ownership.test.ts` D4 block).
3. **`start()` gives a late launcher only microtask turns, not the 3 s reserve. Agree**, with the caveat in 1.1 that the real hop count is not pinned by a test. The reserve is spent once, in `closeResources`, where a late settlement is still closed before release. Note the consequence at the ownership level: a launcher that ignores the abort makes `context()` reply at about 15.0 s (12 s plus the 3 s in `closeResources`), which is the backend's ceiling, not inside it (F4). That is inherent in the ruling's fallback, not a Dex error.

## 3. Test quality and the mutation claims

Strong, by reading:
- Runtime D4 block uses a fake clock and asserts exact milliseconds (12 000, 5 000 for the lease clamp, 1 000 for the stop), the cause chain messages, `startFailure`, signal state and `active`. It would catch: no deadline, stop not aborting, close waiting unbounded, budget 15 s, the 16-turn wait removed (the "honours its signal" test would lose the `GuidedLaunchFailure` link), `releaseWhenLaunchSettles` removed.
- `tree.test.ts` is the right file to fail if selection widens: parent check, command-line match and substring matching each have a dedicated row. The claimed 4, 6 and 5 red sets are credible.
- The fixtures test uses an independent oracle for "my own Chrome" (its own regex on `--user-data-dir`), freezes Chrome with SIGSTOP so a graceful close cannot succeed, and asserts on pids, scratch and recording directory rather than on calls. That is the correct design.

Gaps (F4, F5, F6): a vacuous "inside 15 s" assertion, no test of the survivor path (`close()` rejects, slot stays held), a recording-directory assertion that is trivially true at the frozen phase, and a `versionProbe` mutation that survives.

## 4. W9: patches A and B and ED-05

- **Patch A** (cause preservation, one value-free line): correct as above. `GuidedLaunchFailure(cause, phase)`, `GuidedStartFailure`, and the five swallow sites now keep the cause.
- **Patch B** (`versionProbe`): the wait is the right shape (`filter({hasText:/\S/})` then `waitFor attached`, 5 s per field), and it relaxes no comparison. The test fake does not check that `filter` is used (F6). Patch B is hardening of a measured window, as Dex says; the root cause of attempt03 remains unproven, which Dex states plainly and I agree the story must not claim D4 or B fixes it.
- **ED-05 Node pin to 24**: correct and minimal. `final-gates01/image-final01-runtime-versions.json` records `node v24.20.0` in the built image [V], so the pins now follow the image as ADR-001 §3 says. `engines.node >=24.11.0 <25.0.0`, `.nvmrc` 24, tests inverted so each of the three pin copies fails if moved alone. Host default Node is **v23.10.0** (`/opt/homebrew/bin/node`) [V]; every host runner step must run under Node 24.20.0 or `engine-strict` and the pins tests fail (Dex hit exactly that). The backend ITs spawn `node` from `PATH`, and `assertObservedBrowserStartup` does not check the Node version [V], so a Node 23 `PATH` does not break them. Please confirm the live gate's runner steps use fnm 24.20.0 (F14).

## 5. W6, W7, W8

### W6 (formatting and checkstyle G1 to G5)

- **Behaviour neutrality: supported.** Spotless step: 1265 classes before and after, 0 differ in code, flags, members or constants; 235 differ only in line-number tables (`neutrality.json`). G3, G4, G5 and the main classes of G2 hash identically under `javap -c -p -constants`; G4 additionally compares token streams. Remaining non-neutral bytecode is test-only and disclosed: G1 two extracted switches and three lambdas to a method reference (`bytecode-diff.txt`; I read the `source.diff` hunks, the helper bodies copy the arms verbatim), G2 `GuidedWireContractTest` (three private helpers; I read them and the 17 call sites), G5 one added private static method in `SnapshotBasisParityTest`. `GuidedWireContractTest` ran 18/18 green in final-check attempts 01, 02 and 03 [V, XML]. The helpers rely on `ObjectNode.withObject("/ledger")` pointer semantics, which exist in Jackson 2.14+ (Boot 3.3.5 ships 2.17) [I on the version, V that the test passes].
- **Checkstyle fixes change no semantics.** `if/else/for` bodies braced at exact AST offsets; long literals split with `+` (constants fold identically); text blocks continued with `\`; `() -> {}` given a comment body. My naive junction scan of the six main files with split SQL found no split without a space or comma boundary [V]. `backend/config/checkstyle/` is unchanged against HEAD and the G1 manifest records `suppressionsAdded: false`, `configChanged: false` [V]. The `maxHeapSize 2g` addition to the Checkstyle task (`build.gradle.kts`) is a capacity change, not a rule change.
- **Not covered by the neutrality receipt (disclosed by Dex in w6-format01 finding 3):** the frontend patch, the ADR-002 §34 wording change, and the `@Disabled` `StudioScheduleApiIT` body edit (F15).

### W7 (final-fix01)

- `GuidedProposalValidator.refusePasswordFieldCount` (`GuidedProposalValidator.java:413`) is a straight extraction: same condition, code, status and position (`:384`). The test now pins class, method, `POLICY_DENIED` and 422, which does tell the count refusal apart from the other two `POLICY_DENIED` 422 sites. Production code was reshaped so a test can pin it; renaming the method now needs a test edit (intentional, fail closed).
- The `ReplayIT` line pins are replaced by sites read from the compiled `GuidedTranslationService` line table (`readPrefixSites`, `ReplayIT:11129-11210`). Matching is by callee name only and it throws unless exactly one lambda qualifies. Evidence says the resolved lines (451, 459, 484, 512) equal the live stack frames of attempt01, and the targeted lanes passed 4/4 and 3/3 [V from w7 review.md and the XML cited there]. Equally discriminating as before, but more indirect; INFO (F12).
- Runner timeout added only as harness capacity. `observedIncrementalValidation.test.ts` (538-leaf case) now also has `20000` [V, line 182], so the heads-up Dex raised is closed.

### W8 (flake fix)

- `writeInitialContextState` (`ReplayIT:3712`) stages in the same directory and does `ATOMIC_MOVE` plus `REPLACE_EXISTING` then `deleteIfExists(staged)`: correct on POSIX (`rename`), and the 10 test-body writers are all converted [V by grep]. The one remaining plain write (`ReplayIT:32628`) happens before the runner exists. The diagnostic hook (`ReplayIT:32632-32650`) writes a `v:2` line with a class name, errno-style code, byte count and a single fixed message string only; the original error is rethrown unchanged. Test-side only, runner src and dist digests unchanged per the manifest.
- `ObservationPolicyIT`: per-JVM random base plus `AtomicInteger` removes the intra-class collision [V]. No other test class uses the 61xxx CSI range [V by grep]. The base is still random (F13).
- Honest caveat in the w8 review is correct: the two P7 tests only pass inside the full lane because of the teardown audit scan and test ordering. Not a W8 defect.

## 6. Findings

See `findings.json` for the fields. Summary:

- **F1 MAJOR** `browser.ts:672-683`, `tree.ts:308-315`, `guidedMain.ts:24`: the hard teardown reports success when it found nothing to kill, so the "fail closed" guarantee does not hold when the worker is PID 1 or when `ps` returns nothing.
- **F2 MINOR** `browser.ts:673-682`: a Chrome that spawns later than about 1 s after teardown starts escapes the second listing.
- **F3 MINOR** `runtime.ts:578`, `browser.ts:665`: only the launch phase is hard-killed; a timeout in WITHHOLD, BLANK_MATCH or BOOTSTRAP_CALLBACK, and any non-deadline launch failure, cleans up through an unbounded graceful close.
- **F4 MINOR** `ownership.test.ts:148-149`: the "inside the backend's 15 s window" assertion cannot fail and the design replies at 15.0 s for a launcher that ignores the abort.
- **F5 MINOR** `guided-start-deadline.test.ts:87,108`; `runtime.test.ts`: no test of the survivor path and a vacuous recording-directory assertion.
- **F6 MINOR** `versionProbe.test.ts:17`, `versionProbe.ts:38`: a mutation removing `.filter({hasText})` stays green.
- **F7 INFO** my view on the three deviations (section 2). **F8 INFO** logging residues. **F9 INFO** the startup guard probes a different `ps` call than the kill uses. **F10 INFO** 12 s headroom. **F11 INFO** optional `startup` argument. **F12 INFO** W7 coupling. **F13 INFO** W8 residue. **F14 INFO** Node 24 host requirement. **F15 INFO** W6 items outside the neutrality receipt.

## 7. For the gate

- Nothing here requires stopping attempt05.
- Make sure the runner host steps use Node 24.20.0 (F14).
- A start that is slow but legitimate now fails at 12 s as `CONTEXT_LOST`, the same symptom as REL-001. The `GUIDED_START_FAILED` line distinguishes them (`code TIMEOUT` in the innermost link); anyone triaging a gate red should read that line before concluding REL-001 recurred (F10).
- Do not credit D4 or patch B as closing the attempt03 occurrence. Dex and Aria already say so.
