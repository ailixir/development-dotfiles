---
name: epic10-closure-conventions
description: How Epic 10 stories are closed/deferred/superseded — no Superseded/Deferred status values, @po records notes and leaves status, Done is @qa's; ADR-SC-005 disposition record location
metadata:
  type: project
---

Epic 10 has no `Superseded` or `Deferred` status value. Deferrals and supersessions are recorded as a dated note section + Change Log row with **status unchanged** (precedent: 10.24/10.25 deferral records, @po 2026-10-07; ADR-SC-005 dispositions, @po 2026-10-10). `Done` is @qa's transition; @po moved InReview→Done only on 2026-09-17 (closure plan step 0.4) for stories with **no** blocked criterion.

**Why:** Epic 10's Definition of done (`10.19.story.md:247`) is stricter than the framework default: Done only when every criterion is executed and passed *or* superseded by a **named** carrier story; a Blocked criterion is never ticked and the story never closed around it. Carried criteria still left origin stories `InReview` even after 10.34 existed.

**How to apply:** For backlog bookkeeping after a decision, write `## Disposition — <ADR> (<date>)` before `## Change Log`, add a row (match each story's column set — some tables are reverse-chronological: 10.11, 10.15, 10.18, 10.34), name the carrier story id, and list the recommended @qa/@pm action instead of changing status. The 2026-10-09 single-path record lives at `docs/epics/EPIC-10-SINGLE-PATH-DISPOSITION.md`; 10.34's re-registration against the single path is STUDIO-OBS-010's job and 10.34 Task 1 is held until then. AC-24 (10.11 AC-3(b)) carrier recommendation OBS-008 awaits @pm confirmation.
