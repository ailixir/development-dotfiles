# crash-reaper-diagnosis01 (Dex-D6, read-only on backend/)

## Verdict: test-harness TOCTOU flake. Not caused by the reaper, leftover (a), conflict-stop, R4, parity or the triage A/BC/D/E patches.

## Failure (verified from live log fix01-full-test02.log:3341, excerpt in live-log-failure-excerpt.txt)
`actualCommittedSecretProgressSurvivesOwnedChildAndParentCrashThenRunningReaper() FAILED`
`java.lang.IllegalStateException at GuidedPublicationReplayIT.java:30660` caused by `java.util.NoSuchElementException at GuidedPublicationReplayIT.java:501`.
- :30660 = `registerOwnedTool(..)` catch -> "Owned tool process identity registration failed".
- :501 = `ownedCommandHash(ProcessHandle)` -> `handle.info().commandLine().orElseThrow()`.
- No assertion about the reaper, ledger rows, or crash ordering was evaluated: the exception is thrown while registering a short-lived `/bin/ps` (p6Status) or `/bin/kill` (p6Signal) helper process.
- The XML does not exist yet (Gradle writes it at task end; build/test-results/test holds only StudioScheduleApiIT from an earlier run), so the stack is the compact log form. The frame-to-code mapping is read from the unchanged source (mtime 10:22, before the green fix01-full-test01 run).

## Mechanism (verified in source, line numbers in the live tree)
`registerOwnedProcess` (:547) polls `root.handle.info()` and checks `info.commandLine().isPresent()` on that snapshot (:553-554), then calls `ownedCommandHash(root.handle)` (:555), which takes a SECOND `handle.info()` snapshot and `orElseThrow()`s. `ProcessHandle.info()` is a fresh OS read each call; if the helper exits between the two reads (macOS drops a zombie's command line), the second snapshot is empty -> NoSuchElementException. Same family as the already-handled observer race (w3-d4 (c), p8TerminatedUnsignalled), but this call site was not covered.

## Why not the product changes (evidence)
- The failing frames are test-harness only; none of GuidedLedgerSeed, StudioService @Transactional, createAuthoringDraft authz order, cap 500, conflict-stop hook, stop() leftover (a), reaper `reportAbandonedTeardowns` ordering, R4 or parity is on the stack.
- The test class source is unchanged since 10:22; the post-change green runs used the same harness: fix01-full-test01 ReplayIT 46/46, crash test 604.92 s PASS (execution/fix01-full-test01-xml), final-w02-full-test04 46/46 crash test 605.25 s PASS, w5-w01 46/46 crash test 604.77 s PASS.
- Not verified: I did not re-run the test (no Gradle by instruction), so "reaper behavior after crashes is still correct under leftover (a)/call order" is supported only by those green runs plus the absence of any reaper frame in this failure; the live run's next ReplayIT lane (or fix01-full-test03 / a solo ReplayIT rerun) is the confirmation.

## Reproduction of the race on this host (experiment, Race2.java.source in this dir)
Mimics the registerOwnedProcess loop with `/bin/kill -0` under 12 busy-loop processes: 6000 spawns -> 5997 first snapshot present, 2 hit NoSuchElementException on the second snapshot (~1 per 3000). Same experiment also showed `ProcessHandle.info()` itself can throw `RuntimeException: Input/output error` under load (an unguarded second flake mode at :552). The crash test runs ~605 s of ps/kill polling, so thousands of registrations make a ~0.03% per-registration race plausible in a CPU-contended full suite.

## Fix (fix.patch; `git apply --check -p0` PASSES on the live tree)
Test-harness only, in `registerOwnedProcess`: read startInstant and commandLine from ONE snapshot (`ownedCommandHash(observedCommand.orElseThrow())` using the existing String overload), and treat a RuntimeException from `info()` as "not yet available, retry within the same 500 ms window". Fail-closed behavior is unchanged: a live process whose identity is never observed still throws "Live owned process identity unavailable" (:566). No production code touched.
Lawfulness note: this edits GuidedPublicationReplayIT (large harness, previously QA-acked in w3-qa-ack02/w3-d4 for similar changes); if source-gate hashes/acks cover the file, @qa needs to ack the one-hunk change. If the team prefers no harness edit, the alternative is to rerun the ReplayIT lane alone and treat this as a documented flake (rate ~1/3000 registrations), but the failure would recur.

## Residual risk
- Other short-lived-helper identity reads: :590 and :630 re-read `info()` for verification of long-lived roots/descendants only (not helpers); unchanged.
