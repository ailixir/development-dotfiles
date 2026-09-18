---
name: hibernate-locked-read-stale
description: In put-checks, a findById followed by the PESSIMISTIC_WRITE findByIdForUpdate in one transaction returns the stale unlocked instance — flush then refresh AFTER the lock; never detach, never refresh before it
metadata:
  type: project
---

Hibernate 6.5 (put-checks backend) does **not** refresh an entity it already manages when a later
locking JPQL query (`StudioRepository.findByIdForUpdate`, `@Lock(PESSIMISTIC_WRITE)`) returns the same
row. `UITest` has no `@Version`, so nothing notices. Measured on story 10.30: `findById` saw revision 1,
another connection committed +5, `findByIdForUpdate` returned **the same instance, still at 1**.

**Remedy: `entityManager.refresh(locked)` right after the locked read** (story 10.30 QA fix DETACH-1,
2026-09-17). Measured alternatives, all with `StudioSaveInCallerTransactionIT`:
- `detach(visible)` before the lock (what 10.30 first shipped): serializes saves, but unmanages an
  instance the *caller's* transaction holds, so the caller's writes before and after the save vanish
  silently (the studio-inference tree's `StudioAuthoringService.update` has that shape).
- `refresh(visible)` before the lock: drops the caller's **unflushed** earlier writes (refresh before
  any flush) and leaves a race window (`OptimisticSaveIT` went `[200, 200]`).
- refresh after the lock keeps the instance managed and, with the row lock held, sees the committed
  row.

**But refresh alone is not enough: `flush()` first** (story 10.30 QA fix REFRESH-FLUSH-1,
2026-09-17). A refresh discards whatever the caller still has **pending** against the entity. The
claim "the locking JPQL query flushed them already" is true **only under Hibernate's default AUTO
flush mode** — under `FlushModeType.COMMIT` or Hibernate `MANUAL` no query flushes, the caller's
pre-save write is dropped, the entity stays managed and the save reports success. Measured: with the
flush removed, the `COMMIT` and `MANUAL` parameters of `StudioSaveInCallerTransactionIT` case (b) go
red on `schedule` and `AUTO` stays green. So the shipped order is
`findById` → `requireWrite` → `findByIdForUpdate` → **`flush()`** → `refresh(test)`. Flush *after*
the lock, so the pending write goes out under the row lock. Note it flushes the whole persistence
context — there is no per-entity flush in JPA or Hibernate — which under AUTO changes nothing,
because the locking query already did it.

**Why:** §27.2 mandates authorize-via-visible-read, then lock, so the double read is unavoidable.

**How to apply:** any "authorize, then lock" shape in this backend. Use the `@PersistenceContext`
field (keeps manual `new StudioService(...)` constructions untouched). Related:
[[test-container-and-context-isolation]], [[vacuous-guard-shapes]],
[[falsify-from-the-unfavourable-side]].
