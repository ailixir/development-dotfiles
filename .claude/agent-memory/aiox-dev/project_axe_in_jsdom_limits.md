---
name: axe-in-jsdom-limits
description: axe-core runs in this frontend's vitest/jsdom, but color-contrast and target-size are unanswerable, ChecksLayout is unscannable, and each scan needs a ~30 s budget
metadata:
  type: project
---

`axe-core` (4.13.0, devDependency added by story 10.19) works against
`frontend/`'s vitest + jsdom setup. Four practical limits, all measured:

- **`color-contrast` and `target-size` must be disabled.** jsdom has no layout engine; both need
  computed geometry/colour. Their absence from a result set is an **unmeasured** area, not a clean
  one — say so, or the report reads as conformance it did not establish.
- **`ChecksLayout` cannot be scanned at all** — it imports `PlatformSidebar` from
  `@put/core-components`, the dangling worktree symlink. So the **skip link is unscannable** and the
  `region` (content-outside-a-landmark) counts are inflated, because pages render without the
  `<main>` the layout supplies.
- **Give each scan an explicit ~30 s timeout.** Render of a full MUI page + `axe.run` over
  `document.body` takes 2–3 s alone and blows vitest's **5 s** default under full-suite
  parallelism — a different surface times out on each run, which looks like flake and is not.
- **Scan `document.body`, not the RTL container.** A dialog or portal renders outside the container
  and would be silently unscanned — [[vacuous-guard-shapes]]'s "scan keyed on the wrong surface".

**A recording scan is not a guard.** Pin the exact critical/serious node count per surface and fail
on four directions: a new rule, a count that grew, a count that **shrank**, and a pinned rule that
**disappeared**. The last two fail on improvement deliberately — otherwise the baseline cannot tell
"still broken" from "fixed and nobody updated the ticket". Falsify with a **product** mutation
(strip one real `aria-label`), not only by editing the pin.

**Why:** story 10.19 AC-12. All seven Studio surfaces carry critical/serious violations; they are
ticketed `A11Y-1`…`A11Y-4` rather than fixed, because the nodes sit in `ChecksStudioPage.tsx`, which
the other session is rewriting. Related: [[studio-page-dead-affordances]],
[[frontend-baseline-environment]].
