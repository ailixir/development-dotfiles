---
name: project-a11y-scope-functional-only
description: User decision 2026-10-17 (ADR-SC-006) - accessibility limited to functional must-haves, no WCAG target; do not reintroduce a11y mandates in PRD/epics/stories
metadata:
  type: project
---

Accessibility is functional-only (ADR-SC-006, user decision 2026-10-17). There is no WCAG target. Removed: screen reader and live regions, keyboard shortcuts and custom keyboard navigation, aria-only annotations, reduced motion, axe contrast and target-size checks, forced-colors, 320px reflow and zoom, video text alternatives, manual screen-reader passes, and dedicated a11y reviews. Kept: focus behaviour that is part of a flow, visible labels, state shown in visible text, the responsive layout, MUI semantic defaults, and the existing jsdom WCAG audit as a regression guard only (it must not be extended).

**Why:** the user said "we don't have to have shortcuts and we dont have handicap users for now" and asked that this be persisted so the a11y mandates are not reintroduced.

**How to apply:** do not add a11y ACs, NFRs or checklist items to PRDs, epics or stories. FE-A11Y items are descoped to a post-GA backlog, which is neither a pass nor a waiver. As of 2026-10-17 no post-GA backlog list existed in UI-STUDIO-GA-PLAN.md or ROADMAP.md. PLAYBACK-COST and PLAYBACK-COPY were descoped from OBS-008 the same day.
