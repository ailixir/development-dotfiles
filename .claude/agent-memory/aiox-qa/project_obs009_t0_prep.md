---
name: obs009-t0-prep
description: What the 2026-10-16 STUDIO-OBS-009 T0 QA prep found (corpus, budget, test matrix) and where the drafts live; non-obvious blockers for the AC-7 benchmark
metadata:
  type: project
---

Drafts (read-only prep, nothing executed) are in `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/qa/`: corpus-composition-draft.{md,json}, budget-admission-draft.md, local-test-matrix.md.

Non-obvious findings (verified 2026-10-16 on the working tree):
- The 13 ported compile cases (C01..C13) have no committed step text or `:4102/ns/cNN` pages; `UI-STUDIO-VALIDATION-20261004/benchmark/` holds results only. Case classes are inferred (C08 intended-fail, C09-C11 unsupported, C12 clarification, rest positive).
- `studio-runner/evaluation/lifecycle.mjs` drives `/compile` + `/confirm-compile`, which the public OpenAPI no longer has, so there is no usable benchmark harness; `evaluation/` is frozen by 015 and `evaluation/observed-authoring/` is untracked.
- `StudioCoRunIT` + 6 corun support classes are deleted in the working tree but `tools/corun.sh:60` still points at them.
- USD 500 is the whole-wave authorization (README), spend "not exposed anywhere" (GA plan), price list absent; the 2026-10-04 "budget 500" was calls, not USD.
- Per-CSI daily guided budget (5,242,880 in / 640,000 out) = exactly 20 full-ceiling sessions/day; the proposed 25-workflow corpus needs 81 model sessions, so >= 5 CSI-days or a ruled temporary budget.
- Proposed gate arithmetic: class-P denominator 19 x 3 = 57 runs, >= 52 completions (max 5 failed).

**Why:** these drive T0 decisions (corpus ruling, budget admission, harness build) that the story text does not state.
**How to apply:** when asked to start or review OBS-009 T0/T4, re-check these against the tree first (they may have been resolved), then reuse the drafts rather than redoing the research.
