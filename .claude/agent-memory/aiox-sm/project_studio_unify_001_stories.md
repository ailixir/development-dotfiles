---
name: studio-unify-001-stories
description: How the four STUDIO-UNIFY-001 stories (UI tests as checks, 78 plan subtasks) were drafted on 2026-10-23, the split-AC conventions used, and the open items @po must confirm
metadata:
  type: project
---

STUDIO-UNIFY-001.1–.4 drafted 2026-10-23 in `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/` from the Spec Pipeline output (spec iteration 6, plan revision 4, critique-4 APPROVED 4.38). One story per plan phase: 33 / 18 / 20 / 7 subtasks; 14 / 12 / 15 / 2 ACs. Status Draft. The plan itself is still `executionAuthorized: false`, so the user must approve it before @dev starts.

**Why:** the user asked for frontend-only stories where D7 ("no old routes or data kept, just update the references") means each increment removes what it replaces, with a per-increment link walk (spec §14.1) and route scan (plan S1–S4).

**How to apply:**
- Format used: header table with ID-only "Depends on" (`none`, then `STUDIO-UNIFY-001.N-1`), AC list with source tags, "Traceability: AC to plan subtasks" table, Removals, Link walk plus scan command, WCAG baseline section (guard only, ADR-SC-006), Definition of Done, Tasks (1:1 with plan ids, verification command verbatim, plan notes verbatim), Dev Notes (DCs, RF/PC facts, risks, handoff, Testing), "Drafting flags" table, empty Dev Agent Record and File List.
- Task blocks were generated from `plan/implementation.yaml` with a js-yaml script (js-yaml is in `frontend/node_modules`; no PyYAML) so commands and notes are exact. Keep doing that rather than retyping long verification commands.
- Split ACs: quote only the increment's clauses and say what moved to which story. Items flagged for @po because spec §14 does not assign them: AC-23 detail-route clause (story .2), AC-14 and FR-13 All Checks half (story .3), AC-26 leftover sweep (story .4), AC-08 leave-guard clause and interim back targets (story .1).
- `accumulated-context.md` does not exist in this repo; cross-story coherence went into each story's "Cross-story handoff" note.
- The create-next-story task's ClickUp steps (5.1-5.4) were skipped as an AUTO-DECISION (mission writes four local files only).
- Plan 4.3/4.4 verification greps cannot prove AC-28 (L111, L115, L128, L158 are not matched); QA must read the lines.
