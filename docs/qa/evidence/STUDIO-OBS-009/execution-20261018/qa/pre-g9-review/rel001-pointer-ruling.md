# STUDIO-OBS-009 AC-11 REL-001 pointer: the constant `GUIDED_START_FAILED` line at `elapsedMs` 1

- **Ruled by:** Quinn (@qa), 2026-10-18. Read-only: I grepped and read source and receipts. No test was run.
- **Asked by:** `s-w3/receipt.md` finding 3 ("for @qa to rule"), under the AC-11 REL-001 pointer that @po placed at my request on 2026-10-17.
- **Legend:** [V] verified today by reading the named file. [I] inference, with its basis.

## Ruling

**Acceptable for 009, and not a REL-001 recurrence. Carry one small diagnostic-labelling item. Not a defect in runner behaviour. Not a G9 blocker.**

The line is the runner's report of an ordinary pre-start refusal of a `context` call. It is not the report of a failed browser start. The log line is named after the second thing and also fires for the first, which is a labelling weakness, not a launch failure.

## The line

```
GUIDED_START_FAILED {"operation":"context","session":"08f19fbcaddaa728","elapsedMs":1,"links":[{"name":"Error","code":"CONTEXT_LOST"}]}
```

[V] `s-w3/ac12/incremental-lane/guided-generation-9.log` line 2. It is the only such line in that file. The `test` lane had 0. Per the S-W3 receipt the same shape (operation `context`, one plain `Error/CONTEXT_LOST` link, `elapsedMs` 1 or 2) is in the `guidedIncrementalTest` TEMP of 4 earlier incremental full runs on this host as well, so 5 of 5 [V by receipt, I did not re-open the four older directories]. Lane F's 42 runner generations in 39 runs had 0 such lines [V by `f/receipt.md`].

## Where it is logged and asserted

| Place | What it does | Mark |
|---|---|---|
| `studio-runner/src/guided/transport.ts:139-142` | In the bridge's `handle().catch`, **for every refusal whose code is `CONTEXT_LOST` and whose route is `assign` or `context`**, it writes `describeStartFailure(error, {operation, sessionId, elapsedMs})` to stderr. The wire answer is unchanged. There is no test of "was this a launch" before logging. | [V] |
| `studio-runner/src/guided/diagnostics.ts:61-73` | Builds the line. Each cause link carries only closed labels: name, code, errno, `phase`, `loss`, `kind`, exit code, signal. | [V] |
| `studio-runner/src/guided/ownership.ts:155-159` | The **only** place a launch or start failure is converted: `catch (cause) { ... throw new GuidedStartFailure(phase, loss, cause) }`. `GuidedStartFailure` sets `name = 'GuidedStartFailure'`, always has `phase`/`loss` fields and always wraps the cause chain. | [V] |
| `studio-runner/src/guided/ownership.ts:144-146`, `:49-51` | Plain `insist(..., 'CONTEXT_LOST')` refusals **before** any start: no grant for this session; the entry is stopped or its assignment expired; the runtime is no longer accepting. | [V] |
| `studio-runner/src/guided/runtime.ts:185`, `:278-282` | Plain `CONTEXT_LOST` refusals of a context **update** on an existing runtime (and a stop that follows). | [V] |
| `tools/corun-report.mjs`, `ObservedCoRunIT` (START_FAILED pattern, ~`:2254`) | Classifies the lines of the F co-run generations by innermost cause. The co-run saw none. | [V by receipt] |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md:426` | The pointer's text: a *guided-start* `CONTEXT_LOST` whose chain has a non-`TIMEOUT` innermost cause counts as a recurrence. | [V] |

## Why this is not a start failure

1. **The link shape cannot come from the start path.** Any failure inside `entry.runtime.start()` passes through `ownership.ts:155-159` and reaches the log as a `GuidedStartFailure` link with `phase` and `loss`. That includes the plain `new Error('CONTEXT_LOST')` throws inside `runtime.start()` (`runtime.ts:207`, `:235`), which are caught by the same `catch` and wrapped. The observed line has `name: Error` and no `phase`, `loss`, `kind`, errno, exit code or signal. So it was thrown before `start()` was entered, or on an update of an already-started runtime. [V code reading. A grep of `GuidedStartFailure` over all of `studio-runner/src` finds the class definition (`diagnostics.ts:22`) and one construction site (`ownership.ts:159`), so it is the only wrapping site.]
2. **1 ms cannot contain a launch.** The measured launch-path times in this very wave are 100 ms for the hard teardown alone and 12 000 ms for the start budget (`r2/bound-results.json`). A Chromium start is orders of magnitude above 1 ms. [V]
3. **It is constant.** One line per incremental full run, 5 of 5, always `elapsedMs` 1 or 2, always one plain link, always in the lane whose test `incrementalDriftAuthorityRejectsEveryExactJoin` drives adversarial authority rows (stale fence, cancelled session, expired owner lease). A flaky REL-001 (the unproven STUDIO-OBS-015 attempt03 root cause, a load-dependent launch failure) would not be constant at 1 ms. [V receipt for the constancy and the window; the link to that test is the S-W3 receipt's inference and the backend log it quotes (a `STALE_FENCE` rollback 22 ms earlier, then "Guided runner refused the context"). I did not read the test body to the line that triggers it: [I]]

## What I could not establish

- **[I] Which `insist` fired.** A plain `Error('CONTEXT_LOST')` carries no site. I know it is a pre-start or update refusal, not which one. The likely candidates are a context pushed to a session whose entry is stopped or expired (`live()`), or whose grant is gone. This is a reasoned guess from the test's name and the backend's `STALE_FENCE` line, not an observation.
- **The older four directories.** I rely on the S-W3 receipt for "5 of 5".

## Why not a defect, why not a bare "acceptable"

- **Not a defect in behaviour:** the refusal is the right answer to a context for a stopped, expired or foreign session. The test that provokes it asserts that outcome.
- **Not bare acceptable:** the pointer says a non-`TIMEOUT` innermost cause counts "never as noise". Read literally, a single `Error/CONTEXT_LOST` link is non-`TIMEOUT`. The literal reading would make a deliberate refusal a recurrence every time that test runs, which defeats the pointer. The pointer's trigger is a *guided start* failure, and this is not one. I rule on the trigger, and I record the line anyway so the reading is checkable.

## Rule for G9, the D2 record and later reruns

1. **Record every `GUIDED_START_FAILED` line** with all link fields, `elapsedMs`, the session hash prefix and the lane, as S-W3 did. Report the count per lane with the run denominator.
2. **Classify `PRE_START_REFUSAL`** (not a recurrence) only if **all** hold: exactly one link; `name` is `Error`; `code` is `CONTEXT_LOST`; no `phase`, `loss`, `kind`, errno, exit code or signal; `elapsedMs` under 50; the line is in the `guidedIncrementalTest` lane; at most one per full run.
3. **Anything else is a recurrence candidate** and goes through the pointer as written (root-cause item, owner @dev runner with @architect and @qa). In particular: any `GuidedStartFailure` link (it has `phase`/`loss`); any chain with a `kind` or errno; any line in the `test` lane or in a co-run generation; any `elapsedMs` of 50 or more; or a second line in one run.
4. The D4 15 s-edge rule (AC-12 classification rule) is unchanged and independent: `elapsedMs >= 15000` with a bootstrap `UNKNOWN_OUTCOME`.
5. The D2 record states the REL-001 count as: "recurrences 0 by classification; `PRE_START_REFUSAL` lines N in M incremental full runs; 0 in the `test` lane; 0 in 42 co-run generations". It does not state "0 lines", which would be untrue.

## Carry (non-blocking)

**`RUNNER-LOG-REFUSAL-01`**, owner @dev (runner), placement @po (011 or the next runner-hardening story). Make the line say what it is: either write `GUIDED_START_FAILED` only for a `GuidedStartFailure`, or tag a plain refusal with a closed site code (`GRANT_ABSENT`, `ENTRY_STOPPED`, `ENTRY_EXPIRED`, `NOT_ACCEPTING`, `UPDATE_REFUSED`) under a different event name. The pointer then counts exactly and nobody has to read link shapes. It touches `transport.ts` and `diagnostics.ts`, which the wave has frozen at D_F, so it cannot land before G9.

## For @po (append-only suggestion, I cannot edit the story)

A one-sentence clarification under the AC-11 REL-001 pointer: "A single plain `Error/CONTEXT_LOST` link without `phase`/`loss`, at `elapsedMs` under 50, is a pre-start refusal, recorded and counted separately, not a recurrence (ruling `qa/pre-g9-review/rel001-pointer-ruling.md`)."

Signed: Quinn (@qa), 2026-10-18.
