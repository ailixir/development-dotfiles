---
name: 008-scope-decision-20261017
description: 2026-10-17 user scope cut for OBS-008 (story 0.3.13) — all "Out"/"Nice to Have" removed; AC-8 contrast/target-size moved to a real-browser spec; D5 smoke IN; PLAYBACK-COPY/COST descoped to post-GA backlog
metadata:
  type: project
---

On 2026-10-17 the user accepted root's 37-row OBS-008 scope table: "remove all the 'Out' and 'Nice to Have'". Recorded in the story block "PO scope decision — 2026-10-17 (user)" (0.3.13) and in `prep-20261016/obligations.json` `scopeDecision20261017`.

- **Kept:** AC-1…AC-9, D-1…D-12, A1–A3, U1–U2, FE-CONSUMERS, FE-WORKERS. FE-A11Y was later descoped by decision 2.
- **AC-8 (A11):** this change was superseded the same day by decision 2 (ADR-SC-006, story 0.3.14). There is no real-browser a11y spec. AC-8 is now the narrow layout plus the existing jsdom audit kept green. See [[a11y-functional-only-adr-sc006]].
- **D5 real-backend authoring smoke:** IN as a T4 item. It is not live integration.
- **Descoped (status `DESCOPED_BY_USER_20261017`, never PASS or waived):** A15 (screen-reader pass), A16 (320 px reflow), A17 (forced colors), A18 (video text alternative), the A3 `CANCELLED` variant, the A1 null example, PLAYBACK-COPY (post-GA backlog, @ux-design-expert) and PLAYBACK-COST (post-GA backlog, @architect + @dev playback; per-range authorization stays).
- `implementation-plan.md` and `lanes.json` were not edited and still mention PLAYBACK-COST, PLAYBACK-COPY and "optional D5". Root reconciles them at W0.

**Why:** the user is trimming 008 to its essential GA scope.

**How to apply:** do not re-propose the descoped items for 008. If they come up, point to the post-GA backlog. See [[prep-009-010-20261016]].
