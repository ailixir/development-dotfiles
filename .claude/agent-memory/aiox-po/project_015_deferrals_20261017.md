---
name: 015-deferrals-20261017
description: 2026-10-17 placement of STUDIO-OBS-015 W10/W11 deferrals into OBS-009 (0.3.16) — D5, LIFECYCLE-REASON-01, EDGE-15S-3, PID-1; open coordination observations
metadata:
  type: project
---

On 2026-10-17 @po placed the STUDIO-OBS-015 W10/W11 deferrals into OBS-009, append-only, in story version 0.3.16. The 015 story got a PO record at 0.1.18. The JSON record is an `amendments` row in `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/po-delta-validation.json`.

| Item | Placed at |
|---|---|
| KL-015-D5, with Quinn F3 and the stop-before-spawn residual | 009 AC-11 D5 a–f |
| Aria W11 backend F-1, renamed **LIFECYCLE-REASON-01** | AC-11 LR a–c |
| Optional backend test | AC-11 EDGE a |
| Guided-worker PID-1 constraint | AC-1 PID-1 a–d (@devops) |

The D5 entry is ruling-first, so @architect rules before anything lands.

Aria's backend F-1 was renamed because "F-1" already means other things in this wave: the OBS-011 CLN-F1 dead branch and the 012A budget finding.

**Why:** the lead wanted 015 to carry no unplaced item routed to @po, while a gate run was live, so no source or test was touched.

**How to apply:**
- Do not re-place these items.
- Three observations were left for the lead. All three were decided by root and applied on 2026-10-17 (see [[015-gate-followups-20261017]]):
  - The OBS-011 start-list clarification does not name the new AC-1/AC-11 sub-items.
  - No OBS-010 AC-4 known-limit row exists for KL-015-D5.
  - The ruling-15s-edge §4 item 2 triage rule may also matter for 009 AC-12.
- Check whether any of these was raised later before acting on it.
- In a real pod, the chart's `shareProcessNamespace: true` (`values.yaml`) already keeps the runner off PID 1. Under a plain `docker run` without `--init` it is PID 1.

See [[prep-009-010-20261016]] and [[studio-observed-wave-po-conventions]].
