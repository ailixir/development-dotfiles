---
name: tooling-parallel-merge-patches
description: Producing ReplayIT patches while R2 hashes backend/ and peers patch the same base; clean insertion diffs, block gjf, staged-writer validator transaction trap
metadata:
  type: project
---

Recipe from STUDIO-OBS-015 B3b/c source01 (2026-10-16). Live validation runs hash `backend/`, so the work is shipped as a `-p0` patch under `docs/qa/evidence/...`.

- **Diffing a large insertion.** Plain `diff -u` misaligned the ~2.4k-line insertion and showed 261 existing lines as removed and re-added, which guarantees conflicts with peers.
  - Use `git diff --no-index --diff-algorithm=patience base patched`.
  - Rewrite the `---`/`+++` paths to the repo path, and strip the funcname text after `@@`.
  - Verify with `git apply --check -p0` on the live tree, plus a scratch apply whose sha must equal the patched copy.
- **Formatting only the new block.** Wrap it as `class X { ... }`, run gjf 1.22 with `--skip-reflowing-long-strings`, and unwrap.
  - Long SQL literals are never reflowed: split them by hand.
  - Count width in characters, not bytes (`§` broke an awk byte count).
- **Compile check without Gradle.** First copy `backend/build/classes` to scratch, because a live run may be rewriting it. Then compile with javac 21 against the newest jar per artifact. Related: [[tooling-javac-precheck-outside-lock]].
- **Validator inside a staged transaction.** `ObservedValidationClient.validate` refuses an active transaction (`RUNTIME_INCOMPATIBLE`). A rolled-back reserve → claim → validate → commit probe must call it through a `PROPAGATION_NOT_SUPPORTED` TransactionTemplate. Designs that skip this fail every positive.
- **New methods need registration.** A new ReplayIT `@Test` that is not in `SINGLETON_METHODS` fails in `beginFixtureInvocation`. Unless it is excluded in Gradle, it also leaks into the default `test` lane. Ship the registration lines with the patch as an apply dependency.

**Why:** two other developers patch the same 22k-line base concurrently, so noisy hunks and a missing registration are both merge or run failures.
**How to apply:** use this for any evidence-folder patch against ReplayIT/AuthorityIT while a collector run is live. Related: [[feedback-frozen-fixture-values]].
