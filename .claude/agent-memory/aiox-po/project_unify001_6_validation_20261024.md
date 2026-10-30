---
name: unify001-6-validation-20261024
description: STUDIO-UNIFY-001.6 (N1–N6 + one backend read GET /guided-sessions/latest) validated GO 8/10 Ready 2026-10-24; D2 changed (first completed:false step); proportionate backend gate instead of ./gradlew check; lane G runtime coordination
metadata:
  type: project
---

On 2026-10-24, @po validated STUDIO-UNIFY-001.6 v0.2.0. It got GO 8/10 and moved to Ready (change-log row 0.2.1).

**Rulings:**
- D1, D3, D5–D15 accepted.
- D2 changed: the stopped step is the first step with `completed: false`, and only when some step has an action. Why: `GuidedIncrementalStore.excluded` leaves FAILED/TARGET_CHANGED attempt-0 facts inside completed (relearned-after-drift) steps, so a "first FAILED action" rule can name a step that was learned.
- AC-04 widened to `NEEDS_RELEARN`. ", at step N" is shown only when the attempt's explanation `sourceRevision` equals the test's.

**Backend gate pattern (reuse for Studio stories with backend lanes):**
- No `./gradlew check` (user 2026-10-23: "focused tests, no regression").
- Run compile and the spotless IDE hook per changed file.
- Run `checkstyleMain`/`checkstyleTest`/`spotbugsMain`. Fix findings only in lane files; record the others by name.
- Run the new tests plus named neighbours. Record each Testcontainers class skipped without Docker by name.
- Run the contract checker and generator `--check`.

**Runtime:** the local bootRun uses DevTools and a continuous-compilation watcher. Backend edits wait for the coordinator's go. The real-stack re-check runs only after a clean restart and a reseed.

**Open:** add F-B1, F-B2, F-B4, F-B5 and the D12 `test_id` index to `docs/stories/9.po-backlog.stories.md`. This was not done because the edit scope was one file.

See [[unify001-5-validation-20261024]], [[unify001-validation-20261023]].
