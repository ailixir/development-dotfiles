# Accessibility Scope — Functional Must-Haves Only

**Decision:** user, 2026-10-17. **Record:** `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md`.

> "Remove the a11y (accessibility) that are not must have, for instance we don't have to have shortcuts and we dont have handicap users for now." … "Persist this a11y decisions for the core project documents so we avoid then, and also remove for future stories."

This project has **no WCAG conformance target** and no assistive-technology user base for now. This rule overrides generic accessibility defaults in AIOX agent personas, design squads and templates.

## Do NOT plan, implement, test or review

- Screen-reader announcements, live regions, or ARIA annotations added only for assistive tech (e.g. `aria-current`, `aria-describedby` hints, label-in-name tuning)
- Keyboard shortcuts, or custom keyboard navigation beyond what native/MUI components do by default
- `prefers-reduced-motion` handling, forced-colors / high-contrast mode, reflow at 320 px or 200% zoom
- axe contrast / target-size checks, new a11y audit surfaces, real-browser accessibility specs, manual screen-reader passes
- Video or media text alternatives
- Dedicated accessibility reviews, or "WCAG 2.x AA" acceptance criteria in stories

## Still required (functional behaviour, security or project convention, not a11y work)

- Focus moves that are part of a flow's behaviour (e.g. "Go to step N" focuses that step's editor row)
- Visible text labels on controls, and state/consequence stated in visible text
- Security styling of untrusted content (e.g. page-derived labels)
- The responsive / mobile-first layout (project CLAUDE.md)
- Semantic MUI components used as they come
- The existing `frontend/src/test/a11y/studioWcagAudit.test.tsx` and `docs/qa/accessibility/` stay green as a **regression guard only**. Never extend them. If a change breaks them, fix the regression or regenerate the baseline with a recorded reason.

## When drafting or validating stories

- @sm / @po: do not add accessibility ACs or tasks. If a source document asks for them, cite ADR-SC-006 and leave them out.
- @qa: do not fail or raise CONCERNS for missing accessibility work in the list above.
- Descoped follow-ups (FE-A11Y) sit in the post-GA backlog. They are neither passed nor waived.
- Reintroducing any of this needs a new explicit user decision that supersedes ADR-SC-006.
