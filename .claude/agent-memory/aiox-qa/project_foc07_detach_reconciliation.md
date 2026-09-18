---
name: foc07-detach-reconciliation
description: Story 10.30's updateTest must flush, then refresh, after the lock and never detach — all three measured; and preserving the caller's write is exactly what lets a dirty caller defeat STALE_REVISION
metadata:
  type: project
---

`StudioService.updateTest(…, auth)` reads the draft twice (visible `findById`, then
`findByIdForUpdate`). Hibernate hands an already-managed entity back to the locking query
**unrefreshed**, so the second read has to be made current. Final shape at `e3bfb7b59`, inside
`if (auth != null)` and after the locked read: `entityManager.flush(); entityManager.refresh(test);`
Never `detach`. Gated CONCERNS-merge at `e24892744` (2026-09-17); DETACH-1 and REFRESH-FLUSH-1 both
closed.

**Why it matters for the merge:** a three-way `git merge-file` of the two `StudioService.java`
versions has **0 conflicts**, so nothing in either tree's tests can see a reconciliation that drops,
moves or reorders these two lines.

**The four falsifications, each measured on `story/10.30`** (class set
`StudioSaveInCallerTransactionIT` + `StudioServiceWriteAuthorizationTest` + `OptimisticSaveIT` = 15):
- detach back → caller-transaction case (b) + the unit order case red; case (a) green.
- refresh removed, flush kept → case (a) + `OptimisticSaveIT` concurrent save + order case red;
  case (b) green in **all three** flush modes.
- flush removed, refresh kept → case (b) `COMMIT` and `MANUAL` red, **case (b) `AUTO` green**,
  (a) and `OptimisticSaveIT` green. An AUTO-only case (b) cannot fail on this.
- flush hoisted out of the `auth != null` block → **only** the `(c) internal save touches the
  persistence context not at all` unit case reddens. Flush and refresh swapped → **only** the order
  case. Both guards falsifiable.

**DIRTY-CALLER-STALE-1 (medium, open, NOT introduced by either fix).** A caller holding a *dirty*
managed reference to the draft across the save defeats `STALE_REVISION` outright: `UITest` has
neither `@Version` nor `@DynamicUpdate`, so flushing that reference writes **every** column from the
pre-lock snapshot (`source_revision` included) and the refresh reads back this transaction's own
uncommitted write instead of the winner's. Probe: `findById` (unlocked) → dirty the entity →
competing save commits elsewhere → `updateTest`. All three modes give `no exception` and the loser's
row. With the flush removed, `AUTO` gives the identical loss and `COMMIT`/`MANUAL` give the correct
`STALE_REVISION` — which is how it was attributed: **production's AUTO mode already lost the save
via the locking query's implicit flush**, one line earlier. Case (a) misses it (clean reference),
case (b) misses it (no competing save). Nil over HTTP: the request context holds no dirty draft.
Same root as the still-open delete-vs-save lost update (`softDeleteTest(id, auth)` takes no lock and
writes every column); one `@Version` closes both.

**The FOC-07 caller-side constraint is REVERSED as of `e3bfb7b59`.** The old rule ("a caller that
writes before the save must flush first") is discharged by the callee. What replaces it: *a caller
must not hold dirty state on the draft across the save at all.* If `StudioAuthoringService`'s
`setAuthoring` is ever reordered ahead of `studio.updateTest`, adding a flush is **not** the remedy.
Also: the flush is context-wide, so a caller's unrelated pending writes now go out under the
`ui_tests` row lock; all 403 decisions run before it and both 409s after the refresh, so a throwing
flush aborts rather than substituting a code (no `@Version` ⇒ no `OptimisticLockException` from it;
a constraint violation is an unmapped 500, same status the caller's commit would have given).

**Race-probe technique that worked:** wrap the service call in a `TransactionTemplate`, run the
competing call on a separate executor thread (own connection), and submit it *while* the outer
transaction still holds the lock, asserting on whether it finishes (`get(3, SECONDS)` timing out is
the evidence the lock held). When a probe swallows an exception thrown by an inner `@Transactional`
method, call `s.setRollbackOnly()` and print before returning, or the outer commit throws
`UnexpectedRollbackException` and hides the outcome. macOS has no `timeout` binary. Gradle does not
echo `System.out`: read it back from `build/test-results/test/TEST-<fqcn>.xml`.

**Counting trap:** `grep -cE '> .* FAILED$'` on a Gradle log over-counts by one — `> Task :test
FAILED` matches too. The studio package at `e3bfb7b59` is 712 = 703/2/7.

Related: [[epic10-split-half-merge-hazard]], [[qa-review-verification-depth]]
