---
name: mutation-harness-isolation
description: Keep mutation-test restore copies and scripts out of the shared session scratchpad — other agents overwrite them mid-run, and a falsification result can be wrong without anyone noticing
metadata:
  type: feedback
---

When running falsification mutations, keep **restore copies** and **mutation scripts** outside the
session scratchpad, and verify every restore by SHA-256 against the file's own pre-mutation hash.

**Why:** during the 10.10 gate (2026-09-11), @dev reported that the session scratchpad is shared
across agents in this workspace and that my mutation script overwrote its file mid-run. Neither of
us was harmed, but only because both harnesses happened to be defensive — mine kept backups at a
PID-suffixed path outside the shared directory and compared SHA-256 on restore, and each mutation
script asserted its anchor text before writing, so an overwritten script aborts instead of silently
applying a different edit. That was design, not luck, and it is not luck that can be relied on twice.
**Two agents sharing a mutation harness is a way for a falsification result to be wrong without
either noticing** — the exact failure this epic's whole anti-vacuity discipline exists to prevent.

**How to apply:**
- Backups via `mktemp` in `$TMPDIR`, or a harness directory named with PID + timestamp. Never a
  fixed filename in the shared scratchpad.
- Every mutation script asserts its anchor text is present before writing, and the harness aborts
  loudly on "no change" as well as on "failed to apply".
- Print `RESTORED-OK sha=…` per mutation, and prove it afterwards: `git status --short` empty, and
  for anything contested, compare each touched file to `git show <base>:<path>`.
- If challenged later about whether a result was contaminated, answer with evidence (SHA-256 against
  the base commit, and what the review commit actually changed), not with reasoning about mechanism.

Related: [[qa-review-verification-depth]], [[epic10-vacuous-guard-shapes]]
