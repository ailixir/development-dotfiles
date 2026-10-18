# Receipt: lane PR-RT (KL-015-D5 c, the guided-close probe)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO. **Handed to:** @architect, for the W1.5 D5 ruling (D5 a). This receipt decides nothing: the bound, the teardown shape and whether a stop replies before its teardown completes are @architect's.
- **Test written:** `studio-runner/test/fixtures-tier/guidedCloseProbe.test.ts` (new; sha256 `281510cd319ff20bbf25c0c616bf62e80742ec653853245cbd8a98679a69c32a`). Eight cases: (i), (ii) x3 phases, (iii), (iv) x3 timings. Typecheck (`tsc -p tsconfig.json --noEmit`) clean, `eslint` clean on the file.
- **Authoritative result:** `probe-results.json` (run 2, sha256 `db526d16…`). `run1-short-windows/` is the earlier run, kept because it is why run 2 exists (see "Why two runs").
- **Result of the run:** 8 passed, 0 failed (`vitest-run.log`, exit 0, 242 s). The probe asserts only its own hygiene (the browser really was frozen where stated; no process it started survives). It does not assert the hang, by design.

## How it was run, and the two deviations from the lane command

```
cd studio-runner && export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
GUIDED_CLOSE_PROBE_OUT=<pr-rt>/probe-results.json pnpm --config.package-manager-strict=false exec vitest run \
  --config <scratchpad>/vitest.fixtures.no-globalsetup.config.mjs test/fixtures-tier/guidedCloseProbe.test.ts --minWorkers=1 --maxWorkers=1
```

1. **`--config` is a copy of `vitest.fixtures.config.ts` without `globalSetup`** (copy kept as `vitest.fixtures.no-globalsetup.config.mjs` here). The lane command points at `vitest.fixtures.config.ts`, whose `globalSetup` (`test/fixtures-tier/globalSetup.ts`) re-emits `dist/` in place through the TypeScript compiler API. That is a dist rebuild, which the hard rules forbid. The probe imports `src/` directly and spawns no `dist` child, so it does not need the emit. For the record: a scratch emit of the current `src` (`tsc -p tsconfig.build.json --outDir <scratch>`) is byte-identical to `dist` for every `.js` and `.d.ts` (only the `.map` files differ, by their relative paths), so the lane command would have changed mtimes and no content today. I did not run it.
2. **`GUIDED_CLOSE_PROBE_OUT`** makes the test write its JSON to a file. Without it the test only prints the JSON to stdout, so a later full fixtures-tier run cannot overwrite this evidence.

`dist` digest check: sha256 of all `dist/**/*.js` before and after is `dada6ed4e96fa2ad` (identical), and no file under `dist/` is newer than the probe start.

Process listings (`ps-before.txt`, `ps-after.txt`, `ps -axo pid,ppid,command | grep checks-guided`, read-only): the `checks-guided` lines are identical before and after: four pre-existing processes (5083 and 5095, parent 1, a 16-hour-old orphan; 13577 and 13581, the known pair). None is mine. I signalled none of them, nor 22246 or 44737. The probe signals only direct children of its own test process whose command line names a `checks-guided-` scratch directory, and their descendants. After the runs: no `checks-guided-*` scratch directory dated today and no `guided-d5-*` temp directory is left.

## The setup, in one paragraph

Real `createGuidedServer` over real mutual TLS (the test CA), real `launchGuidedBrowser` with real Chromium, a stub controller that grants claims and acknowledges callbacks, the wire driven with real HTTPS `assign`, `context` and `stop` requests. Chrome is frozen with `SIGSTOP` on its process group at the stated phase (the lane's own suggestion), so it can neither answer the DevTools pipe nor exit by itself. "Settles" is measured two ways: on the wire (does the HTTP exchange end with a reply) and inside the runner (the runtime's own `browser.close()`, wrapped to log when it began and how it ended). "Slot held" is a second `assign` for another session, refused `CAPACITY` while occupied. All times are on one clock in one process.

## Outcomes per path (run 2)

Times are milliseconds after the request named, taken from `probe-results.json`.

### (i) Close of a started session (browser frozen after a successful start; the backend then sends `stop`)

| Question | Result |
|---|---|
| Does it settle? | **Yes, at about 30.04 s.** The runtime's `browser.close()` began 5 ms after the stop arrived and **resolved** after 30 034 ms. All 7 frozen processes were dead at that instant (0 alive). |
| Is a reply sent? | **No.** The stop's HTTP connection was ended **without a response at 30 006 ms**, by the runner's own socket timeout (`transport.ts:127`, `server.timeout = 30_000`), 33 ms before the close settled. Nothing was answered within the 20 s the probe first looked, and the backend's 15 s ceiling passed long before. |
| Is the slot held? | **Yes**, `CAPACITY` at 20 s and at 30.0 s. Free once the close settled (probe after release: free). |

### (ii) Start-phase timeout after launch (browser frozen entering the phase)

| Phase frozen | Close began | Close settled | `/context` reply | Explicit `stop` (sent at 20 s) | Slot |
|---|---|---|---|---|---|
| `WITHHOLD` | 12 010 ms (the 12 s budget) | 42 050 ms (took 30 040, **resolved**, 0 frozen processes alive) | **none**: connection ended without response at 30 009 ms | replied 200 at +22 015 ms (about 42.0 s after the start) | held at 20 s; free at the end of the window |
| `BLANK_MATCH` | 12 012 ms | 42 059 ms (took 30 048, resolved, 0 alive) | none, ended at 30 009 ms | replied 200 at +22 030 ms | held at 20 s; free at the end |
| `BOOTSTRAP_CALLBACK` (controller never answers the callback) | 10 853 ms (the callback's own 10 s bound fired first, `CALLBACK_DENIED`) | 40 890 ms (took 30 037, resolved, 0 alive) | none, ended at 30 010 ms | replied 200 at +20 842 ms | held at 20 s; free at the end |

So for (ii) the slot is held for about 41 to 42 s from the start request, the start is never answered, and only a stop that arrives after the close has begun and is under 30 s old gets a reply.

### (iii) Non-deadline launch failure on the graceful `cleanup()` path (an error inside the launch with Chrome already frozen)

| Question | Result |
|---|---|
| Does it settle? | **Yes, at about 31.0 s.** The failed launch's `close` (the graceful `cleanup()`) began 935 ms after the start request and **resolved** after 30 061 ms; 0 frozen processes alive. |
| Is a reply sent? | **`/context`: none** (connection ended without response at 30 010 ms). **Explicit `stop` sent at 20 s: yes**, 200 at +10 941 ms (about 30.96 s). |
| Is the slot held? | **Yes** at 20 s (`CAPACITY`); free by the end of the window. |

### (iv) Stop before spawn (`launchPersistentContext` never returns, so nothing spawns)

| Variant | Reply instant | Notes |
|---|---|---|
| iv-a: stop sent 1 s into the launch | **stop reply left at 15 035 ms after the launch began** (14 034 ms after the stop was sent); the `/context` reply left at 15 054 ms after it was sent (409 `CONTEXT_LOST`) | Chrome never spawned |
| iv-b: stop sent 8 s into the launch | stop reply at **15 038 ms** after the launch began (7 037 ms after the stop was sent); `/context` reply at 15 061 ms (409) | same instant as iv-a |
| iv-c: no stop; the start hits its own 12 s deadline | `/context` 409 `CONTEXT_LOST` at **15 065 ms** after it was sent | the deadline path waits the same backstop |

The reply instant is pinned to the backstop (`deadline + 3 s`, that is start + 15 s) whatever the stop's arrival time. The slot is free after the reply. The `/context` reply leaves 54 to 65 ms after the backend's 15 s ceiling (this host); a stop sent in the first ~40 ms of the launch would also exceed 15 s. In the nothing-spawned case the whole 3 s reserve is spent by `hardTeardown`'s backstop wait (`browser.ts:687`).

Run 1 (short windows) agrees on every (iv) figure (15 055, 15 062, 15 055 ms).

## Findings for the D5 ruling

1. **"The close never settles" was not reproduced for this wedge.** With Chrome frozen by `SIGSTOP`, the runtime's own `browser.close()` ended in 30.03 to 30.06 s in every path ((i), the three (ii) phases and (iii)), **resolved**, and the frozen processes were dead at that moment. The close is therefore bounded by something below the runner. [I] The 30 s matches Playwright's default timeout (`DEFAULT_PLAYWRIGHT_TIMEOUT = 3e4`, `playwright-core` 1.63.0 `lib/coreBundle.js:4594`) followed by its force-kill (`gracefullyClose` `.catch(() => killProcess())`, `coreBundle.js:9389`). I did not trace which Playwright call carries the timeout, so the mechanism is inferred; the 30 s figure and the dead processes are measured.
2. **What is true instead is a bound that is too long and a reply that cannot be sent.** The slot is held 30 s (i), 31 s (iii) and about 42 s (ii), against the backend's 15 s ceiling. The runner's own 30 s socket timeout ends any request that is still unanswered at 30 s, so the answer to the original request (the stop in (i), the start in (ii) and (iii)) is lost even though the close later succeeds. The D4 sentence "slot occupancy is bounded at about 15 s" holds only for the launch phase, as KL-015-D5 says; the measured bound for the other phases is about 30 s from when the close begins, on this wedge.
3. **(iv) is a 15 s reply.** Its figures are above: the reply is pinned to start + 15.04 s, which is at or past the backend's ceiling for the start, and about 1 s inside it for a stop that arrives 1 s after the launch began.
4. **The reply and the slot are decoupled in (i):** the stop's connection died 33 ms before the close settled. That ordering is a 33 ms race in this run; I did not repeat it, so I do not claim it is stable.

## Limits (what this does not show)

- **One kind of wedge.** `SIGSTOP` on the browser's group. Not tested: a process in an uninterruptible state that ignores `SIGKILL`, a healthy browser process with a stuck page (its close would probably succeed at once), a stalled DevTools pipe with a live process. A wedge that Playwright's force-kill cannot clear is the case the original "never settles" claim would still describe; it was not produced here.
- **One host, one browser build:** macOS arm64, Chrome for Testing (`chromium-1243`), Node 24.20.0. Run 1 and run 2 agree where they overlap; no further repetition, so there is no variance estimate for the 33 ms race or the 50 to 65 ms overshoot.
- **Synthetic triggers on real code paths:** the (ii) phases are produced by freezing at the phase boundary (wrapping `withhold` and `blankMatches`) and, for `BOOTSTRAP_CALLBACK`, a controller stub that never answers; (iii) by throwing from the recording `ready` hook inside the launch's try block; (iv) by a `vi.spyOn` on `chromium.launchPersistentContext` that never resolves (the same oracle as `guided-start-deadline.test.ts`).
- **D5 e is not covered:** how the backend handles a `stop` that times out (`GuidedDispatchService.stop`, the 15 s `GuidedRunnerClient`) is lane BL's to read; this probe only supplies the runner-side timings it needs.
- **No in-cluster behaviour.** Nothing here says what a pod does when its Chromium is killed.

## Why two runs

Run 1 (`run1-short-windows/`, 03:48 to 03:51Z) observed the close for 20 s after the stop and 15 s for the explicit stop in (ii) and (iii), then unfroze the browser. It saw "no settle" in (i) and (ii). That window was shorter than the 30 s at which the close actually ends, so its "no settle" is an artefact of when it looked, and it is superseded. Run 2 (03:53 to 03:57Z) added the close instrumentation and windows of 45 s (i) and 30 s (stop in ii and iii) and found the 30 s bound. The honest summary of run 1 is only what it could see: nothing settled in 20 s.

## Consequences for the repository

- The new test runs for about 4 minutes. It is in `test/fixtures-tier/`, so every full fixtures-tier run will include it. The unit tier excludes that directory (`vitest.config.ts:26`). The D5 d cases replace it; the lane that lands D5 should convert or delete this file. Until then QA may want to know it adds about 4 minutes and five real Chromium launches (cases i, ii x3, iii) to the fixtures tier.
- Files written by this lane: the test above, and under `pr-rt/`: `probe-results.json`, `vitest-run.log`, `run-start.txt`, `run-end.txt`, `ps-before.txt`, `ps-after.txt`, `vitest.fixtures.no-globalsetup.config.mjs`, `run1-short-windows/*`, this receipt. A scratch emit directory lives in the session scratchpad only.
- Not done: no `dist` rebuild, no install, no Gradle, no git write, no change to `src/`, no change to the fixtures-tier evidence files of 007 or 013. The command did not go through `run-runner.py` (which backs up and restores that media for the whole tier), so I checked instead: the config includes only this one test file, which writes none of that media, and `find` over `docs/qa/evidence/STUDIO-OBS-007`, `STUDIO-OBS-013` and `STUDIO-OBSERVED-NEXT` for files newer than the probe start returns only `STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md`, which another session wrote (not this lane). Other files newer than the start under `docs/qa/` are the `c9/` and `execution/obs009-*` files of other lanes.
