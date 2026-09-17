# Epic 10 carry-forward test findings (2026-09-16)

**Scope.** Five test findings carried out of wave 7: TEST-005, REL-004, ENV-2/REL-002, F-3 and F-7.
Sources: `docs/qa/gates/10.16a-evidence-state-playback-and-step-seek.yml`,
`docs/qa/gates/10.16b-seek-measurement-frame-finder.yml` and `docs/epics/EPIC-10-RUN-LOG.md`
(the wave-7 sections).

**Where and by whom.** Written by @dev (Dex) on branch `fix/carry-forward`, cut from `epic/EPIC-10`
at `f1d7968df`. The work is ready for @qa to gate; @dev has not approved it.

**Test-only.** No production file changed. `openapi.yaml` is unchanged (sha256 `51850b01…`), and so
is `seek-measurement.test.ts` (sha256 `a0d3561d…`, the same before and after every probe). Both
lockfiles are byte-identical after `npm install`.

| Finding | Result | Commit |
|---|---|---|
| TEST-005 (medium) | fixed | `c2881450e` |
| REL-004 (low) | fixed | `0a466f5d9` |
| ENV-2 / REL-002 (medium) | fixed; failure reproduced before, green after | `c09d59e67` |
| F-3 (low) | mechanism confirmed and refined, fixed | `a2d3acddc` |
| F-7 (low) | fixed | `660874ef5` |

No finding needed production code.

---

## TEST-005: `pageRunGate.test.tsx` AC-2, "exactly one `POST /execute`"

**The defect, confirmed before the change.** A second POST 300 ms after acceptance left AC-2 green
when AC-2 ran alone (`-t "exactly one"`): 1 passed, 3 skipped.

**The change.** The test clicks Run and waits for the page to act on the acceptance: the control
becomes `Stop`. It then waits for that run to end: the control reads `Run Test` again. Only then
does it assert exactly one POST. The waitFor on "length 1" and the synchronous duplicate assertion
after it were removed.
- **Why the run's end is a real settle point.** This file serves `404` on the snapshot route. So
  the transport reconnects, falls back to polling, and gives up. Measured when AC-2 ran alone:
  - acceptance was seen at +1.23 s;
  - snapshot reads followed at +3.35 s, +4.37 s and +5.37 s;
  - `Run Test` was back by +6.26 s.

  That window is about 5 s long, well over a 300 ms retry or the retired 700 ms poller.
- **New bounds.** The run-end wait is `RUN_END_WAIT_MS = 20 000`. AC-2's test timeout is
  `4 × PAGE_WAIT_MS + RUN_END_WAIT_MS`, which is 60 s.
- **Cost.** AC-2 now takes about 5 s longer. It also logs three more `API Error` lines (the three
  404 polls), which accounts for the suite's 49 → 52.
- **Labels.** Both labels are literals, used only to locate the control. They are not imported
  from `RunControl`, which avoids shape #11.

**Residual (measured).** A duplicate sent after the run has ended, 8 s after acceptance, is outside
the window and stays green (row T-a8000). That is a POST after the page has finished everything
this activation caused. It is not a retry of the activation.

## REL-004: `studioVideoUrl.test.tsx` fresh-import cases

All six tests that call `loadWithBase` now take `FRESH_IMPORT_TIMEOUT_MS = 30 000`. Two of them
are `it.each` blocks, so the bound covers 10 test cases.
- **Why every one.** After `vi.resetModules()`, whichever case runs first cold-imports the panel's
  whole module graph. Under `-t`, any case can run first.
- **Why 30 s.**
  - Run alone at load 7–9, the cold case took 549 ms.
  - @qa measured it at 1151–3206 ms in full-suite runs, and at 5121 ms once, at load 17.
  - 30 s is about six times the worst of those.
- **No assertion changed.** The diff changes only the timeout arguments and adds the documented
  constant.

## ENV-2 / REL-002: the store's import-time bootstrap

**The mechanism.** `store/index.ts` dispatches `fetchSources()` and `fetchFeatures()` on first
import. That happens before any file's `beforeAll` starts a mock server. So both requests went to
the network at jsdom's origin, `http://localhost:3000`. On this host, PID 33058 listens there. It is
not ours and was not touched.

**The change, in `src/test/setup.ts`.** Setup files share the module registry with the test file
that follows them, so the fix works in five steps:
1. A single-purpose MSW server starts listening with `onUnhandledRequest: 'error'`. It answers
   only `*/checks/sources` and `*/features`, both with `404`.
2. The setup imports the store, while that server is listening.
3. It waits for both slices to settle. If they do not settle within 10 s, it fails loudly.
4. It closes the server before the test file is imported. The file's own server therefore never
   overlaps it.
5. Only the two expected `API Error` log lines are dropped, and only during this window.

Why `404` and not a network error: `apiClient` retries a failed GET twice (200 ms, then 400 ms),
which would add about 0.6 s to every file. It does not retry a `404`. A probe that used
`HttpResponse.error()` recorded 3 requests per path. Either way the slices settle on their
fail-open defaults, which is the state a host with nothing on `:3000` also reached, only later.

**Other files.**
- **New test.** `src/test/bootstrapIsolation.test.ts` asserts two things:
  - the setup's record holds exactly `GET /api/v1/checks/sources` and `GET /api/v1/features`,
    with no unhandled request;
  - both slices were already settled, with the 404, on the line directly after the test file's
    `import { store }`.
- **Removed workaround.** `pageEvidence.test.tsx`'s local `beforeAll` wait is removed because the
  shared fix supersedes it. That is shown in the table below: the file is red without the shared
  fix and green with it.
- **Known gap.** A file that calls `vi.resetModules()` and then imports the store again is not
  covered. Only `studioRunTransport.node.test.tsx` does that today, and it points the base URL at
  its own real server first.

**How the failure was reproduced.** jsdom's origin was moved to a port this probe controls. The
tool was an untracked config overlay in the scratchpad that merges
`test.environmentOptions.jsdom.url = http://localhost:3917/` into the real config. On that port ran
a stand-in for next-server: every path answers `307 → /login`, and `/login` answers `200 text/html`
after `LOGIN_DELAY`.
- **Why the delay is on `/login`.** A plain delay did not reproduce the failure. At 0, 1.5, 3 and
  5 s the response landed while the test file's imports were still running (they took 3.4–8 s),
  and `beforeEach` then overwrote the state. At 7 and 9 s, MSW was already listening and handled
  the redirect follow, which fails open. The crash needs the redirect followed early and the body
  to land mid-test. Hence `DELAY=0` with a delayed `/login`.

| Tree | Files | `LOGIN_DELAY` | Result | Stand-in hits |
|---|---|---|---|---|
| `0a466f5d9` (before the fix) | pageRunGate | 9 / 11 / 13 s | **1 failed / 3 passed** each, `TypeError: Cannot read properties of undefined (reading 'find')` | 4 each (2 bootstrap, 2 `/login`) |
| `c09d59e67` (fix) | isolation + pageRunGate + pageEvidence | 9 / 11 / 13 s | **10 / 10** each | **0** each |
| final (fix) | pageEvidence as committed (workaround removed) | 4.5 s, ×2 | 4 / 4 each | 0 |
| final, shared fix disabled (E1) | pageEvidence as committed | 4.5 s, ×2 | **1 failed** each, `reading 'find'` | 4 |
| final, E1, with base `pageEvidence` (workaround present) | pageEvidence | 4.5 s, ×2 | 4 / 4 each | 4 |

`pageEvidence` under E1 at 3, 6 and 7.5 s: green (the landing fell outside its tests); at 4.5 s:
red. The last two rows together show that the workaround used to protect the file and that the
shared fix now does.

---

## F-3: `httpClient.test.ts`, "reports a timeout as ambiguous"

**The mechanism.** @qa inferred that the 25 ms deadline races the server recording the request.
That is **confirmed, and it is broader than a recording race**. A temporary probe (deleted) ran
the same send 200 times without load and 300 times under a 16-process CPU burn. It recorded the
server's `connection`, `request` and `end` events at the moment the client returned, and again
300 ms later.

| Sample | Failures | At the moment the client returned `timeout` | 300 ms later |
|---|---|---|---|
| 200, no load | 3 | 2× `conn 1, req 0`; 1× `conn 0, req 0` | 2× `conn 2, req 1, end 1`; 1× `conn 1, req 0` |
| 300, burn (load 8 → 85) | 1 (the first, cold) | `conn 1, req 0` | `conn 2, req 1, end 1` |

In **every** failure, the server had not even parsed the request when the deadline fired, so it
was never a question of recording. Connection setup outlasted 25 ms.
- In 1 of 4 failures, the request never arrived at all.
- In 3 of 4, it arrived afterwards, on a second connection.

The second connection is an observation about Node's `fetch` (undici). The cause is my inference.
It does not contradict the product's semantics: `timeout` means "outcome unknown".

**The change.** The test fakes only `setTimeout` and `clearTimeout`
(`vi.useFakeTimers({ toFake: [...] })`). It waits in real time (`setImmediate` polling, bounded at
3 s by `performance.now()`) until the responder has recorded the whole request, then advances the
fake clock by 25 ms.
- **What still runs for real.** The production path is unchanged: the timer, the abort, the
  aborted signal and the `timeout` outcome.
- **Assertions.** Both assertions are unchanged: `{ kind: 'timeout' }` and exactly one hit.
- **Cleanup.** `afterEach` also restores real timers, in case the test body is abandoned on a
  timeout.

**Run counts.** "Base" is the `f1d7968df` test file run as an untracked sibling copy, alternated
run by run with the fixed file, under a 16-process burn at load 73–87.

| Run set | Base | Fix |
|---|---|---|
| File alone ×20 | **1 failed** / 20 (run 1; which test failed was not captured) | 0 / 20 |
| Deterministic squeeze: responder pauses the request 100 ms (real timer) | **red**, `expected [] to have a length of 1 but got +0` | green |
| Full default tier | — | 0 failures in 10 (`npm test`, load 6–22) |

## F-7: `webm.test.ts` reads the tolerance as text

**The change.** The read is now the pure function `medianToleranceIn(source)`. After stripping
block comments and whole-line `//` comments (the only comment forms that file uses), it requires
three things:
1. exactly one top-level `const MEDIAN_TOLERANCE_MS = <integer>;` (the value read);
2. exactly one `.toBeLessThan(MEDIAN_TOLERANCE_MS);`;
3. exactly two occurrences of the name: that declaration and that assertion.

**Deviation from @qa's wording.** Rule 3 also does the job of counting declarations at any
indentation. Every extra declaration adds an occurrence, so a separate declaration count could
never fail without rule 3 failing too. The S8 probe, run while the declaration rule was still
present, failed on both rules at once. So the separate count is not kept.

**Planted-forms control.** A new `F-7` describe block (10 tests) plants each refused form into the
real file's text and requires a throw. It also checks that the read still follows a changed value
and still ignores a line comment. Its anchors must each match exactly once.

**Known residuals (text reads cannot see these).**
- An assertion that exists but never executes, for example inside `if (false)`.
- A `/*` or `*/` inside a string or regex literal could confuse the comment strip. The file has
  none today; such an edit would most likely fail closed.
- A trailing `// … MEDIAN_TOLERANCE_MS` comment on a code line counts as an occurrence, so the read
  fails closed on it.

---

## Mutation table

All rows were replayed on the final tree (`660874ef5`) after the last commit. Exceptions: the
ENV-2 before-fix row (on `0a466f5d9`) and the F-3 probe (on the base file). Every mutation was
applied only if its anchor matched exactly once. Every restore was sha256-verified (`RESTORED-OK`),
and `git status` was clean after each batch.

### Frontend

**`useRunGate.ts` mutations.** All AC-2 rows ran with `-t "exactly one"`. The file hashed
`bf7a8c0bbb62` before and after every row.

| Id | Mutation | Mutated sha | Result |
|---|---|---|---|
| T-a | second `executeTest` 300 ms after acceptance | `be6e5480670a` | **red**, `expected … length of 1 but got 2` (at `f1d7968df`, before the fix: **green**) |
| T-b | second `executeTest` inside `.then` | `e985c73d1f06` | **red**, same message |
| T-a3000 | second POST 3 s after acceptance | `7ff48bb7f38b` | **red**, same message |
| T-a8000 | second POST 8 s after acceptance (after run end) | `10087541c405` | green (residual, see TEST-005) |
| T-c | none | n/a | AC-2 alone 1 passed; whole file 4 / 4 |

**REL-004 rows.** Rows that mutate `studioVideoUrl.test.tsx` ran case (i) with
`-t "path-only base.: the constructed playback URL"`. R-3 mutates production code and ran the
whole file.

| Id | File | Mutation | sha before → after → restored | Result |
|---|---|---|---|---|
| R-6 | `studioVideoUrl.test.tsx` (final) | 6 s sleep in `loadWithBase` | `5dd753ff2a39` → `5705046a41f2` → `5dd753ff2a39` | green (1 passed) |
| R-6-base | same file at `f1d7968df` | same | `2a2928c7002c` → `3f65a402a692` → `2a2928c7002c` | **red**, `Test timed out in 5000ms` |
| R-35 | `studioVideoUrl.test.tsx` (final) | 35 s sleep | `5dd753ff2a39` → `dbe5f27027bb` → `5dd753ff2a39` | **red**, `Test timed out in 30000ms` |
| R-3 | `studioVideoUrl.ts` | `apiOrigin()` returns the page origin | `ddc6122dda9a` → `284efa3b1aeb` → `ddc6122dda9a` | **red**, 2 failed: (ii) is `http://localhost:3000/…`, expected `https://api.example.internal/…` |

**ENV-2 rows on `src/test/setup.ts`.** The file hashed `dabdafb0e257` before and after every row.
Each row ran `bootstrapIsolation.test.ts`, `pageRunGate.test.tsx` and `pageEvidence.test.tsx`
against the stand-in with `LOGIN_DELAY` 9 s. The hit counts cover two runs per row.

| Id | Mutation | Mutated sha | Result | Stand-in hits |
|---|---|---|---|---|
| E0 | none | n/a | 10 / 10 | 0 |
| E1 | whole fix disabled (`if (false as boolean && …)`) | `3ea45109f935` | **3 failed**: isolation ×2 (`did not run its bootstrap isolation`, `expected true to be false`) and pageRunGate `reading 'find'` | 20 |
| E2 | `listen()` moved after the store import | `a7fb0c0593de` | **1 failed**: isolation, `unhandled` held the 2 redirect follows | 12 (the requests escaped) |
| E3 | `*/features` handler removed | `3a344af8a71a` | **2 failed**: isolation, `handled` lacked features; `expected 'Network Error' to match /404/` | 0 (refused in-process) |
| E4 | settle wait removed (`void new Promise`) | `bcc0752dfcdf` | **1 failed**: isolation, `expected [] to deeply equal […]` | 0 |
| E1-host | E1 at the real origin (`:3000`) | `3ea45109f935` | **2 failed**: isolation | n/a |

### Runner

**`src/reporting/httpClient.ts` mutations.** All rows ran with `-t "timeout as ambiguous"`. The
file hashed `92a882e9a0a5` before and after every row.

| Id | Mutation | Mutated sha | Result |
|---|---|---|---|
| H1 | an aborted signal returns `transport` | `93d92050c5ae` | **red**, `expected { kind: 'transport' … } to deeply equal { kind: 'timeout' }` |
| H2 | deadline `timeoutMs * 1000` | `1d1bd3071c55` | **red**, `Test timed out in 5000ms` |
| H4 | `controller.abort()` before the send | `46dfa68cd483` | **red**, `timed out after 3000 ms waiting for the server to receive the request` |
| SQ-base | 100 ms receipt delay, base test | n/a (untracked copy) | **red**, `expected [] to have a length of 1 but got +0` |
| SQ-fix | 100 ms receipt delay, fixed test | n/a (untracked copy) | green |
| H-none | none | n/a | 6 / 6 |

**Probes of `seek-measurement.test.ts`, made in place and restored.** The file hashed
`a0d3561d8cdc` before and after every row. Each row ran `webm.test.ts`.

| Id | Mutation | Mutated sha | Result |
|---|---|---|---|
| S7 | `.toBeLessThan(MEDIAN_TOLERANCE_MS + 50)` | `d10c5059d868` | **fails to load**: `exactly one ".toBeLessThan(MEDIAN_TOLERANCE_MS);", found 0` (@qa's S7 at `4ffc4020c`: green) |
| S8 | indented `const MEDIAN_TOLERANCE_MS = 150;` in the AC-12a describe | `403542171c6c` | **fails to load**: `the name twice …, found 3` |
| S10 | declaration reformatted to 150 across two lines, plus a column-0 copy in a block comment | `d19ef9a0e028` | **fails to load**: `exactly one top-level … found 0` |
| U5 | destructured shadow in the AC-12a describe | `de0328ed156b` | **fails to load**: `found 4` |
| U1 | S7 plus the exact assertion text left in a `//` comment | `02d6213987f8` | **fails to load**: `… found 0` |
| S1 | value 100 → 120 | `91e153613c69` | **red**, the boundary test (`reported 119.9`); the read follows the value |
| S12 | `// const MEDIAN_TOLERANCE_MS = 150;` added | `901f4bd3abfa` | green, 16 / 16 (correct: the value is still 100) |

**Rule deletions in `webm.test.ts`.** The file hashed `27ff96d67431` before and after every row.

| Id | Rule deleted | Mutated sha | Planted rows that went red |
|---|---|---|---|
| D1 | rule 1 and the `undefined` guard | `3a859795ebca` | S10 |
| D2 | rule 2 | `94a3ffd5c7ad` | S7; S7 with the comment decoy |
| D3 | rule 3 | `163fbaea347f` | S8; destructured shadow; parameter shadow; `let` beside the `const` |

Each rule is the only rule that catches at least one row. The template-string row and the
assertion-removed row are each caught by two rules.

---

## Suites

### Frontend (`npx vitest run`)

| Run | Load before | Result | Duration |
|---|---|---|---|
| 1 | 9.62 14.01 21.73 | **541 passed / 2 failed** (543); 38 / 2 files | 60.0 s |
| 2 | 8.46 13.12 20.88 | **541 / 2** | 52.3 s |
| 3 | 8.84 12.62 20.22 | **541 / 2** | 62.6 s |
| base test files, for duration only | 9.35 12.28 19.51 | 539 / 2 (541) | 63.5 s |

- **Failures.** The two failures are the AC-32 `EXPECTED RED` tests. The two failed files are
  `confirmedRevisionEscalation.test.ts` and ENV-1's unloadable `ChecksLayout.a11y.test.tsx`.
- **Counts.** 541 = 539 + the 2 tests in `bootstrapIsolation.test.ts`.
- **Log checks.** No log contains `[MSW]`, `ENV-2` or `reading 'find'`.
- **Where the time moved.** Aggregate setup time rose (15.6 s on base, 23.6–35.9 s here) because
  the store is now imported in setup. Collect time fell accordingly. Wall time was no worse.
- **Type-check.** `npm run type-check` (exit 2) reports exactly the 2 known TS2307 errors
  (`ChecksLayout.tsx:6`, `navigationSetup.ts:1`).
- **Lint.** `npm run lint` fails to start (exit 2, ENV-1), so **no lint pass is claimed**. As a side
  channel, the corrected-config copy (deleted afterwards) was run over the five touched files. It
  reported 0 errors and 3 `no-explicit-any` warnings, all on lines that predate this work.

### Runner

| Suite | Result |
|---|---|
| `npm test` ×3 (load 6.4 / 6.8 / 9.4) | **957 passed / 29 skipped** (986) each; 49 files passed, 1 skipped |
| `npm test` ×7 more, for F-3 (load 7.9–22.4) | 957 / 29 each |
| `npm run test:fixtures` ×1 (load 10.1) | **89 passed / 10 skipped** (99) |
| `npm run lint` | exit 0 |
| `npm run type-check` | the one known error, `deadline-cleanup.test.ts(550,40)` TS2345 |

957 = 947 + the 10 tests in the new `F-7` describe block.

### `git diff --stat f1d7968df` (before this record was added)

```
 .../studio/evidence/studioVideoUrl.test.tsx        |  23 +++--
 .../pages/ChecksStudioPage/pageEvidence.test.tsx   |  25 +----
 .../pages/ChecksStudioPage/pageRunGate.test.tsx    |  27 ++++-
 frontend/src/test/bootstrapIsolation.test.ts       |  37 +++++++
 frontend/src/test/setup.ts                         | 101 +++++++++++++++++++
 studio-runner/test/helpers/webm.test.ts            | 111 +++++++++++++++++++--
 studio-runner/test/reporting/httpClient.test.ts    |  60 +++++++++--
 7 files changed, 335 insertions(+), 49 deletions(-)
```

## Verified versus inferred

- **Verified.** Everything in the tables was run and its output recorded here.
- **Inferred:**
  - that the second connection in the F-3 probe comes from undici's own behaviour;
  - that the 3 extra suite-level `API Error` lines are only AC-2's polls. This was measured for
    `pageRunGate` alone (0 → 3) and not traced across the whole suite.
- **Not done.** The stand-in reproduction only moved jsdom's origin. The real `:3000` process was
  never touched.

---

## QA Results (@qa, Quinn — gated 2026-09-17 00:05 local, commit `95bd63114`)

**Gate: PASS.** Details are in `docs/qa/gates/carry-forward-2026-09-16.yml`. All five findings are
closed, and this reviewer verified each closure by mutation. The diff is test-only, and nothing
blocks the merge.

**Harness.** A private `mktemp` directory under `$TMPDIR`. Each mutation required its anchor to
occur exactly once, and every restore was sha256-verified (`RESTORED-OK`). Afterwards `git status`
was empty and all 7 tracked hashes matched. The ENV-2 rows ran against this reviewer's own stand-in
on `:3931` (every path `307 → /login`, and `/login` answers after 9 s). No request went to `:3000`,
and PID 33058 was left untouched.

| Finding | Result | Mutations run by @qa (new rows marked *) |
|---|---|---|
| TEST-005 | closed | T300 **red** in AC-2 alone; T5000 **red**; *TEND (a re-run requested when the stream closes, so the duplicate lands at the settle point) **red**; T8000 green (the stated residual, reproduced) |
| REL-004 | closed | none; judged from the diff (only timeout arguments change). The cold case took 1958 ms and 1647 ms in-suite |
| ENV-2 / REL-002 | closed | control 10/10, 0 hits; E1 **3 red**, `reading 'find'`; M1 (= E2) **1 red**, 6 hits escaped; *M2 (setup answers 200 HTML) **1 red**; *M4 (setup does not import the store) **3 red**, `reading 'find'`; *M3 (setup server never closed) **16 red** across the suite |
| F-3 | closed | H1 **red** (same sha as @dev); H4 **red**; *H10 (+1 ms) red, but only as a generic 5 s timeout; *H9 (timer captured at module load) green, i.e. the test silently reverts to real time |
| F-7 | closed | S7, S8 and S10 each **fail to load** (all three were green at `4ffc4020c`) |

**Rulings.**
- **TEST-005.** The residual is acceptable. The test now observes the activation's whole causal
  chain, and no finite window catches an arbitrary delay. A rename is optional.
- **REL-004.** The bound is justified. A timeout cannot turn a failing assertion green.
- **ENV-2.** The setup cannot hide a regression that tests used to catch, because no test ever
  exercised a successful import-time bootstrap. `bootstrapIsolation.test.ts` is a real guard: it
  reddened under E1, M1, M2 and M4, and the suite caught M3. Closing the server does not interfere:
  two full runs gave 541/2. Leaving it open does interfere (M3).
- **F-3.** The test still exercises the production client. Only `setTimeout` and `clearTimeout` are
  faked, and H1 proves the outcome classification.

**Constraint for story 10.32.** Measured with seven edits, K1–K7.
- **What still passes.** The drafted AC-7 (a helper appended to the median message, the name not
  mentioned) is green. So is an F-4 comment rewrite, even one that names the constant, and a
  trailing comment on the assertion line that does not name it.
- **What `webm.test.ts` refuses to load.**
  - interpolating `MEDIAN_TOLERANCE_MS` into the message;
  - a trailing comment that names it;
  - wrapping `.toBeLessThan(MEDIAN_TOLERANCE_MS);` over several lines;
  - any added string containing `/*`.
- **The rule for 10.32.** Outside comments, the name appears exactly twice: the declaration and the
  one-line assertion. If 10.32 needs more, it changes `medianToleranceIn` rule 3 in the same commit,
  and the F-7 block must still go red for S7, S8 and S10.
- **Stale text in the 10.32 draft.** It says F-7 "has not landed" and names `readMedianTolerance()`,
  and its webm baseline says 6 tests where there are now 16.

**New, not this branch's.** PROD-1 (low). The two fulfilled reducers assign an unchecked payload, so a
200 non-JSON body leaves `data` undefined and the page throws. By inference, an expired session
redirected to an HTML login page produces the same shape in production. Route it to the backlog.

**Suites run by @qa.**

| Suite | Load | Result |
|---|---|---|
| frontend `npx vitest run` #1 | 7.9 → 13.0 | 541 passed / 2 failed (AC-32 EXPECTED RED); ENV-1 file unloadable; 58 s |
| frontend #2 | 13.0 → 17.6 | 541 / 2; 76 s |
| runner `npm test` #1 / #2 | 14.2 / 13.8 | 957 passed / 29 skipped each |
| runner `npm run test:fixtures` | 14.8 | 89 passed / 10 skipped (an earlier run's totals were not captured; no claim is made for it) |
| frontend `type-check` | — | the 2 known TS2307 |
| runner `type-check` / `lint` | — | the 1 known TS2345 / exit 0 |
| frontend `lint` | — | not run, ENV-1; no claim |

**Before merge.** Nothing is required. Recommended: carry the 10.32 constraint into that story.
