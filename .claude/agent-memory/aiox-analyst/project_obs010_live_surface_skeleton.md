---
name: obs010-live-surface-skeleton
description: STUDIO-OBS-010 T2 Live surface list - dated 2026-10-18 at the 009 G9b digest (folder live-surface-20261018); P4/P5 met, 010 InProgress; @qa trigger + @pm acceptance still blank
metadata:
  type: project
---

The 010 AC-5 "Live surface" list went skeleton (2026-10-17, `live-surface-draft-20261017/`) -> pre-G9 draft
(`live-surface-pre-g9-20261018/`, with Aria's `rulings/ruling.md` and Morgan's `rulings/pm-ack.md`) -> DATED
2026-10-18 at the G9b capture (`docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/`, JSON sha256 e5c58fa5…).

**Why:** the dated list is what protects surfaces from 011 cleanup (D-1: nothing leaves without @po). It
must be re-dated after 009 Done, before 010 T3/T4 — a separate @pm acceptance (pm-ack §5 does not cover it).

**How to apply:**
- Cite the JSON sha, never the md: sign-off lines live only in the md and finalize-record.md so the JSON hash stays stable.
- At the next re-date, diff capture-before files G9b vs the new capture, re-read only entries in changed files
  (a python line-tracking YAML reader works; PyYAML is absent and node is off-limits during backend runs).
- State 2026-10-18 (second pass): @po confirmed the 16 removed ids, so P4 is met. Aria's cross-check names the sha, so P5 is met.
  010 is now InProgress (CL 0.3.16, OI-24 closed). Root decision: no v2 list; the JSON stays of record and its stale
  `storyStatusChange`/`removed-pending-po` fields are superseded by the md/finalize-record. Still open: @qa G9b
  trigger (P1), @pm acceptance, G9b capture-after, runbook write (checklist §9, OI-25).
Related: [[obs010-runbook-rewrite]].
