---
name: adr-sc006-a11y-scope
description: 2026-10-17 user decision persisted as ADR-SC-006 — no WCAG target, a11y limited to functional must-haves; jsdom audit = regression guard only
metadata:
  type: project
---

User decided 2026-10-17 (twice, then "persist it"): no WCAG target, no assistive-tech users for now. ADR-SC-006 lists the Do-NOT items (live regions, shortcuts, aria-current, reduced motion, browser axe contrast/target-size spec, forced colors, reflow, video text alt, SR pass, a11y reviews) and Still-required (only flow focus: "None of these"/"Go to step N" → step N editor row; clarification focus-on-entry/keyboard nav REMOVED per Amendment 1 — I had wrongly kept it; visible labels, stated consequences, untrusted-label styling, responsive layout, MUI as-is, `studioWcagAudit.test.tsx` kept green, never extended).

**Why:** user cut OBS-008 scope; wants future stories (08–11 and later) to stop reintroducing a11y work.

**How to apply:** decline a11y work by citing ADR-SC-006; only a new explicit user decision reopens it. FE-A11Y and register A11Y-5/6/7 are post-GA backlog — not pass, not waiver. Do NOT treat runner observation via accessibility tree / target-page ARIA allowlists as a11y scope. ADR-SC-005 has no literal "WCAG" text; the 2.1 AA list came from the off-repo UX panel 2026-10-09 report. Open question for PM: whether an internal Citi accessibility policy applies.
