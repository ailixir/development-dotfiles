---
name: studio-observed-story-conventions
description: Drafting conventions the STUDIO-OBSERVED wave's PO/QA expect from SM stories (format, traceability tags, security conditions as ACs, Decisions-pending table, one-story-with-lanes precedent)
metadata:
  type: project
---

STUDIO-OBSERVED wave stories follow the OBS-006 Done story as the template (header table with Story ID/Status/Epic/Depends on/Source, then `executor`/`quality_gate`/`sdc_reviewer`/`quality_gate_tools` fields, Story, numbered **AC-n** items each ending in a bracketed source tag like `[design §4.2; security condition 1]`, Tasks mapped to ACs, Dev Notes with sources, Testing, CodeRabbit Integration, File List as proposed ownership, Dev Agent Record, QA Results, Change Log).

**Why:** @po validates with the 10-point checklist and Constitution Article IV (no invention) — every AC must trace to a decision, design section, review finding or existing spec; @qa reviews security stories against the security record's "Conditions for @sm" list, so each condition must appear verbatim as an AC and cite the record section (incl. later "R1 delta check" tightenings). Open design questions (design §8) are written to the stated default plus a "Decisions pending" table (question → default → ACs that change). The 2026-10-09 rescope (OBS-007…011) was drafted this way; OBS-007 was kept as one XL story with three file-disjoint lanes and a documented path-split fallback, following the OBS-006 precedent (7 ACs/148 paths passed PO GO 9/10).

**How to apply:** When drafting or rewriting a story in docs/stories/STUDIO-OBSERVED/, reuse this shape, tag every AC, carry security conditions verbatim, add Decisions pending for unanswered user questions, and state file-list sequencing where stories share files. Keep historical validations in `.ai/` referenced, never deleted.
