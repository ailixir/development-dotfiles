---
name: studio-harness-b-ui-constraints
description: Frozen real-backend harness B (profile430 visual190 spec) pins Studio seek button names, save chip text and mutation ceilings; UX fixes must keep them
metadata:
  type: project
---

The frozen harness B (`.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/profile430-harness/visual190-real-backend.spec.ts`) asserts exact, strict accessible names: `Seek to step N`, which must be unique page-wide, and `Seek to action: <API safeLabel>` scoped to `guided-seek-step-N`. It also asserts the `studio-save-state` text `Saved`, and the exact innerText lines `Repeating saved steps 1–4…` and `Learning from step 5`. It caps POSTs (start ≤ 2, clarify ≤ 1, finalize ≤ 2, execute ≤ 1). Its screenshot mask hides any `[value]`, `[data-value]` or `aria-value*` element.

**Why:** the user froze harness B (2026-10). It must keep passing while Studio UX defects are fixed (round 067 spec, 2026-10-23).

**How to apply:** when proposing a Studio UI change, never alter those names or texts and add no POSTs. Put new state text in captions outside buttons. New guided copy needs a tracked source file, because `.aiox/` is git-ignored and `guided.test.tsx` checks the quotes. See [[studio-round067-ux-fix-spec]].
