---
name: skip-asymmetry-is-the-tell
description: Unconditional skips on blocked work plus environment-conditional skips on passed work is a vacuous-guard shape — probe by breaking the prerequisite and re-running
metadata:
  type: feedback
---

When a tier's prerequisite is an external binary or a built image, **make its absence a failure, not
a skip**. `describe.skipIf(!TOOL)` produces a green file that enforces nothing, with the only
disclosure in a test *name* — and a pipeline reads an exit code, not a name.

**Why:** QA caught exactly this in story 10.18a (the nineteenth catalogued shape). `helm` off `PATH`
→ *1 passed / 89 skipped*, green. A nonexistent `STUDIO_RUNNER_IMAGE` → *1 passed / 3 skipped in
1 ms*, green. The security criterion the story existed for did not run, in the stage where it was
wired to run. The tell was an **asymmetry I could not see while writing it**: unconditional skips on
the halves I declared *blocked* (they cannot self-arm) and environment-conditional skips on the
halves I declared *passed* (they silently disarm). Both feel like the same courtesy.

**How to apply:**

- Probe before claiming a tier enforces anything: **break the prerequisite and re-run.** Green means
  it proves nothing where it will actually run.
- Decline the "documented opt-out env var" remedy. It is the same hole under a longer name.
- The repair that was accepted: fail closed inside the tier (throw from the shared harness, so *all*
  dependent assertions redden, not one announcement test), give the tier its own config/script/CI
  stage that has the prerequisites, and — because moving a tier out of the default run is itself how
  a tier gets lost — add a wiring guard **in the default run** that reddens if the config, script,
  stage entry or files vanish, and that scans the tier for `skipIf` in code with comments stripped.
- Keep deferral records (`it.skip` for genuinely blocked criteria) in the default run: they need no
  prerequisite, and that is what closes the asymmetry from the other end.

Related: [[vacuous-guard-shapes]], [[epic10-falsification-standard]], [[structural-guard-mutation]].
