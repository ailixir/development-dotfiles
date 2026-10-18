# ADR-SC-006 — Accessibility scope: functional must-haves only

| Field | Value |
|---|---|
| Status | **Accepted** (user decision 2026-10-17). Binding SDC input for STUDIO-OBS-008, 009, 010, 011 and every later Checks / UI Studio story |
| Date | 2026-10-17 |
| Scope | Whole project (Checks MFE and UI Studio): `frontend/src/**`, `frontend/e2e/**`, `docs/qa/accessibility/**`, story acceptance criteria, QA gate focus lists, agent and squad defaults |
| Amends | [ADR-SC-005](ADR-SC-005-single-path-observed-authoring.md) placement-map row STUDIO-OBS-008 ("a11y incl. CLN-11 surfaces") and the WCAG 2.1 AA list of the UX panel 2026-10-09 that ADR-SC-005 handed to @sm |
| Preserves | ADR-SC-005 D-A sanitized observation of target pages through accessibility/semantic nodes; the runner's handling of target-page ARIA attributes; role-based locators; the responsive / mobile-first layout rule in `CLAUDE.md`; the existing jsdom audit as a regression guard |
| Decision source | User, 2026-10-17, verbatim (given twice, then a persistence instruction; quoted under "Decision record") |

## Decision

The project has **no WCAG conformance target** (2.1 AA or any other level) and **no assistive-technology user base for now**. Accessibility work is limited to functional must-haves.

**Do NOT plan, implement or test:**

1. screen-reader announcements or live regions;
2. keyboard shortcuts, or custom keyboard navigation beyond the defaults of native and MUI components;
3. `aria-current` or other ARIA-only annotations added for assistive technology;
4. `prefers-reduced-motion` handling;
5. axe `color-contrast` / `target-size` checks, new accessibility audit surfaces, or real-browser accessibility specs;
6. forced-colors / high-contrast mode;
7. reflow at 320 px / 200% zoom;
8. text alternatives for run video;
9. manual screen-reader passes;
10. dedicated accessibility reviews (no a11y gate, no a11y QA focus item, no a11y reviewer in a story's quality-gate tools).
11. [Added by Amendment 1, 2026-10-17] clarification focus-on-entry and clarification keyboard navigation (radiogroup keyboard operability) as a requirement; MUI defaults stay as they come, untested.

**Still required.** These are functional behaviour, security or project conventions, not accessibility work, and stay in scope wherever a story needs them:

| Item | Why it stays |
|---|---|
| Focus management that is part of a flow's behaviour (e.g. "Go to step N" moves focus to that editor row~~; a clarification that opens is where the next input goes~~) [Amendment 1, 2026-10-17: struck; clarification focus-on-entry is removed, see "Do NOT" item 11. The only required focus move is the explicit flow action: "None of these" / "Go to step N" moves focus to step N's editor row (STUDIO-OBS-008 AC-3/AC-4, T0 ruling A3)] | It is the feature: the user clicked something whose job is to take them somewhere |
| Visible text labels on controls | Usability for every user; also what keeps the existing audit's `button-name`/`label` rules green |
| State and consequence stated in visible text (e.g. expiry, "Learning from step k", "steps j… were re-learned because the page changed") | Honest UX; already required by the single-path copy |
| Security styling of untrusted content (page-derived `labelSource === PAGE` labels marked untrusted) | Security control (ADR-SC-005 security P1, STUDIO-OBS-014) |
| Responsive / mobile-first layout | Project convention (`CLAUDE.md` "Responsive design with mobile-first approach") |
| Semantic MUI components used as they come | Default behaviour, no added work; do not strip roles MUI provides |
| `frontend/src/test/a11y/studioWcagAudit.test.tsx` and `docs/qa/accessibility/` kept green as a **regression guard only, with no extension** | Cheap existing safety net. If a change breaks it, fix the regression, or regenerate the baseline (`axe-results.json`, pinned keys) with the reason recorded in the story. Never add surfaces, rules, viewports or a browser variant |

**Not affected by this ADR (product functionality, not accessibility scope):** the runner's observation of target pages through the accessibility tree and semantic nodes (ADR-SC-005 D-A), role/name-based locators, and the runner's treatment of target-page ARIA attributes (e.g. the STUDIO-OBS-009 `POST_FOCUS_CHANGED` inert-attribute allowlist with `aria-expanded`, `aria-activedescendant`, `aria-describedby`). Agents must not read "no a11y" as "do not use ARIA on the pages under test".

### Decision record (verbatim, 2026-10-17)

1. On STUDIO-OBS-008 scope: "i agree with your recommendations, remove all the 'Out' and 'Nice to Have'".
2. "Remove the a11y (accessibility) that are not must have, for instance we don't have to have shortcuts and we dont have handicap users for now".
3. "Persist this a11y decisions for the core project documents so we avoid then, and also remove for future stories (e.g: 08,09,10 and 11)".

## Consequences

- **FE-A11Y follow-ups descoped to a post-GA backlog.** Busy-state label-in-name, tooltip keyboard reach, Add-a-step `aria-describedby` association, and browser contrast / target size (carried from STUDIO-OBS-012B TEST-003, OBS-UX-2, OBS-UX-3, OBS-UX-EMPTY into STUDIO-OBS-008). This is **not a pass and not a waiver**: the items are unmeasured and stay recorded as such. The same holds for the open staging-register items `A11Y-5` (manual assistive-technology pass, story 10.19 AC-12(b)), `A11Y-6` (contrast/target-size unmeasured) and `A11Y-7` (skip link unscanned): story 10.19 AC-12 stays **PARTIAL**; nothing is re-labelled as done.
- **STUDIO-OBS-008 AC-8** reduces to: the responsive narrow layout, plus the existing jsdom audit kept green under the regression-guard rule above. The real-browser `frontend/e2e/studio-guided-accessibility.spec.ts` added by the PO 2026-10-17 change 1 (A11) is not created. STUDIO-OBS-008's other ACs keep their functional content (focus on "Go to step N", visible state/consequence copy, untrusted-label styling, named controls).
- **CLN-11** (`studioWcagAudit.test.tsx` surfaces 4 "compile-review" and 5 "confirm", which scan the author state under dead names): its "rewrite to real guided states" recommendation is superseded, because that is an extension. **[AUTO-DECISION]** Should the two misnamed surfaces be left as is, renamed, or deleted? → whichever owner touches them (STUDIO-OBS-011 cleanup) may rename them to what they actually render or delete them as duplicates of surface 3, recording the reason and regenerating `axe-results.json`; adding new guided states is out (reason: honest names are cleanup, new scanned states are extension).
- **The guard's real reach.** The audit renders `ChecksStudioPage` states, so new guided components that appear in a scanned state are scanned implicitly. A new `critical`/`serious` violation there trips the guard and must be fixed or baselined with a recorded reason. This is accepted as the floor, not grown into a target.
- **Future stories.** STUDIO-OBS-009, 010 and 011 carry no a11y AC at HEAD `734ad704f` (verified by grep: their `aria-*` hits are runner target-page attributes and ruling file names). They must not gain any. Any story that wants work from the "Do NOT" list needs a **new explicit user decision that supersedes this ADR**; a PO, QA, UX or architect recommendation is not enough.
- **Agent defaults overridden.** Generic a11y defaults in the AIOX UX persona (`@ux-design-expert`), design squads, QA checklists (e.g. "WCAG 2.1 AA" focus lines, `accessibility-audit` in `quality_gate_tools`) and story templates do not apply to this project. Executors cite this ADR when they decline such work.

## Supersedes

Line numbers are at HEAD `734ad704f` unless marked "WT" (working tree, 2026-10-17, files under concurrent edit by their owners). Owners make the edits; this ADR edits none of them except the two dated notes listed under "Notes appended".

| # | Passage | Superseded part |
|---|---|---|
| 1 | `docs/architecture/ADR-SC-005-single-path-observed-authoring.md:90` (placement map, row STUDIO-OBS-008) | "a11y incl. CLN-11 surfaces" |
| 2 | `docs/architecture/ADR-SC-005-single-path-observed-authoring.md:40` (panel evidence 4, UX: "the full state model with copy is in the UX report handed to @sm") | The WCAG 2.1 AA list in that UX panel 2026-10-09 report. ADR-SC-005 itself contains no literal "WCAG" text; the report is not a repository file, and its list survives only as transcribed in rows 4 and 9 below |
| 3 | `docs/epics/UI-STUDIO-GA-PLAN.md:145` §4.I I-1 (WT `:147`, already struck by its owner on 2026-10-17) | "10.19 AC-12(b) screen-reader pass" and "a11y debt from 10.46 AC6: dialog labelling, live region for 'Running step N of M', and contrast/target-size rules disabled in the only scan (UX-6)". The AC-13 nontechnical-user trial is usability and stays |
| 4 | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md:47` AC-8 (same line in WT) | Everything except "responsive narrow layout" and the existing audit kept green: "WCAG 2.1 AA, UX panel list", the polite/assertive live region, keyboard-operable radiogroup as an a11y requirement, `aria-current="step"`, CLN-11 surface rewrite, contrast/target-size rules (jsdom or the WT real-browser replacement), `prefers-reduced-motion`. ~~Clarification focus on entry and the~~ The stated expiry consequence stays as functional behaviour [Amendment 1, 2026-10-17: clarification focus on entry is superseded too] |
| 5 | `STUDIO-OBS-008.story.md:33` AC-3 | The parenthetical "(the current step carries `aria-current=\"step\"`)" only |
| 6 | `STUDIO-OBS-008.story.md:57` T4 (WT `:215-216`) | "Live region, … keyboard, reduced motion; CLN-11 surfaces rewritten"; WT sub-item creating `frontend/e2e/studio-guided-accessibility.spec.ts` and the FE-A11Y browser items |
| 7 | `STUDIO-OBS-008.story.md:88` Testing (WT `:276`), `:108` QA focus "WCAG 2.1 AA" (WT `:296`), `:127` File List "surfaces 4/5 rewritten" (WT `:315`, `:330` the a11y spec), `:139` "WCAG 2.1 AA ACs with named rules (AC-8)" (WT `:338`); `quality_gate_tools: [… accessibility-audit]` (WT `:16`) | The a11y parts named |
| 8 | `STUDIO-OBS-008.story.md` WT `:173` (PO scope decision row 3, FE-A11Y "IN, kept"), WT `:360`, `:371`, `:381` (FE-A11Y carried follow-up) | FE-A11Y in scope → post-GA backlog (Consequences) |
| 9 | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/obligations.json:33` (untracked, WT) | The AC-8 obligation text and its 2026-10-17 A11 amendment |
| 10 | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md:59` CLN-11 | "rewrite the two to real states" (see Consequences, AUTO-DECISION) |
| 11 | `docs/stories/STUDIO-OBSERVED/README.md:21` (WT `:42`) row STUDIO-OBS-008 | "WCAG" in the scope summary |

**Also carrying a11y work, not superseded passages but affected status (owners decide wording):** `docs/qa/staging-acceptance-register.md:213-215` (`A11Y-5`/`6`/`7`, WT `:236-238`) → post-GA backlog, still open; `docs/qa/accessibility/studio-wcag-audit.md` → regression guard only (dated note appended). Stakeholder briefings `docs/presentations/checks-ui-studio-stakeholder-briefing.html` and `checks-product-stakeholder-briefing.html` mention `prefers-reduced-motion`; they are presentation artefacts and not edited here. `PRD.md:130-131` and `docs/ROADMAP.md:20` already carry 2026-10-17 notes pointing to this ADR (WT, made by their owners).

## Notes appended (append-only, 2026-10-17)

- `ADR-SC-005-single-path-observed-authoring.md`: a dated note after D-A (its "accessibility/semantic nodes" mention is observation, **not** affected) and a dated bracket at the placement-map "a11y incl. CLN-11 surfaces".
- `docs/qa/accessibility/studio-wcag-audit.md`: status note "regression guard only per ADR-SC-006; not extended".

## Alternatives

- **WCAG 2.1 AA as the GA bar (ADR-SC-005 / UX panel default):** rejected by the user. No assistive-technology users for now; the cost (live regions, keyboard model, reduced motion, browser axe spec at two viewports, manual SR pass, forced colours, reflow) lands on the critical-path UI story OBS-008.
- **Keep only the automated browser contrast/target-size spec (PO change 1, A11):** rejected. It is a new a11y audit surface, which the user excluded; it also adds a real-browser spec to maintain.
- **Delete the jsdom audit entirely:** rejected. It costs nothing to keep, already passes, and catches regressions (unnamed buttons, unlabelled fields) that are functional defects for every user.

**Trade-offs accepted.** Retrofitting accessibility later is more expensive than building it in: live-region and keyboard models touch every guided state. Internal tools at large enterprises are often subject to an internal accessibility standard; if one applies here, this ADR may conflict with it (open question below). The jsdom guard measures only what jsdom can measure; colour contrast and target size stay unmeasured.

## Revisit triggers

- A product decision that the tool will serve users with disabilities.
- A contractual or regulatory requirement. **Open question for the user / PM, not asserted:** does an internal Citi accessibility policy for internal tools apply to Checks / UI Studio? Nobody has checked; this ADR does not claim either answer.
- A GA audience change (for example, the pilot or GA population includes assistive-technology users).

When a trigger fires, a new ADR supersedes this one and the post-GA backlog items above are the starting list.

## Verification

- `grep -rn -i "wcag\|a11y\|live region\|aria-current\|prefers-reduced-motion\|forced-colors\|screen.reader" docs/stories/STUDIO-OBSERVED/STUDIO-OBS-0{08,09,10,11}*.md` → every hit is either struck/annotated with a pointer to ADR-SC-006, a functional item from "Still required", or the regression-guard audit.
- `frontend/e2e/studio-guided-accessibility.spec.ts` does not exist.
- `studioWcagAudit.test.tsx` has the same seven-or-fewer surfaces and the same disabled `color-contrast`/`target-size` rules (`:132-136`); any change to its surfaces or baseline cites a recorded reason in the story that made it.

— Aria (@architect), 2026-10-17

## Amendment 1 — 2026-10-17 (append-only)

**Correction.** The original text listed clarification focus-on-entry under "Still required" (table row "Focus management…" and Supersedes row 4). That was my interpretation, and it was wrong. The user's list, relayed by the root coordinator, removed "clarification keyboard nav and focus-on-entry". `.claude/rules/accessibility-scope.md` ("Still required": only "Go to step N" focus) and STUDIO-OBS-008's PO scope decision 2 (WT row X3, "Clarification focus-on-entry and radiogroup keyboard operability as a requirement … **Removed**"; row K1 keeps the step-N focus) follow that list.

**Effect.** Clarification focus-on-entry and clarification keyboard navigation move to "Do NOT" (item 11). The only focus management that stays required is the explicit flow action: "None of these" / "Go to step N" moves focus to step N's editor row (STUDIO-OBS-008 AC-3/AC-4, T0 ruling A3). The original passages are struck in place, not deleted. Nothing else in this ADR changes.

— Aria (@architect), 2026-10-17, Amendment 1
