---
name: a11y-functional-only-adr-sc006
description: 2026-10-17 user decision + ADR-SC-006 — no WCAG target, a11y limited to functional must-haves; how @po applied it to OBS-008…011, CLN-11, README F05–F07, register A11Y-5/6/7
metadata:
  type: project
---

On 2026-10-17 the user said: "Remove the a11y (accessibility) that are not must have … we dont have handicap users for now". The user then asked for this to be applied to future stories as well. The rule is `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md` (Accepted; Amendment 1 adds clarification focus-on-entry and keyboard navigation to its "Do NOT" list).

- **Removed (never credited, never failed):** WCAG target, live regions, shortcuts and custom keyboard navigation, ARIA-only annotations (`aria-current`), reduced motion, contrast/target-size checks, new audit surfaces or real-browser a11y specs, a11y reviews and the `accessibility-audit` gate tool.
- **Kept, because they are functional:** "Go to step N" / "None of these" focus moves, visible labels, consequences stated in text, untrusted PAGE-label styling, responsive layout, and the existing jsdom `studioWcagAudit.test.tsx` as a regression guard only.
- **Runner target-page `aria-*` handling is product behaviour** (OBS-009/010 FOCUS-MUTATION-01), so never strike it. `aria-*-ruling01` grep hits are Aria's ruling file names, not a11y work.
- **Where it was applied:** OBS-008 0.3.14 ("PO scope decision 2", K1–K7 / X1–X11). FE-A11Y became README backlog STUDIO-OBS-F05, not planned. PLAYBACK-COST is F06 (P2) and PLAYBACK-COPY is F07 (P3). CLN-11 (OBS-011 class C): rename or delete the surfaces, never rewrite them to new states. Register A11Y-5/6/7 got dated "descoped" notes; 10.19 AC-12 stays PARTIAL.

**Why:** the user is trimming to GA essentials and has no assistive-technology users. Reopening any of this needs a new user decision that supersedes the ADR.

**How to apply:** when validating or amending any Checks/Studio story, do not add a11y ACs or gate tools, and do not re-propose descoped items. Report them as "descoped per ADR-SC-006", never as PASS or waived. See [[008-scope-decision-20261017]].
