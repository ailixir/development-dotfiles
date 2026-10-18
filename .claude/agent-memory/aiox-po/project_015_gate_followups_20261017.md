---
name: 015-gate-followups-20261017
description: 2026-10-17 STUDIO-OBS-015 formal-gate (CONCERNS) follow-ups by @po — REL-001 pointer (009 AC-11), 15 s-edge rule (009 AC-12), KL-015-D5 row (010 AC-4 d g), 011 start list, F4/R4 note to 008 C-int, six Node-22 rows marked in-image verified
metadata:
  type: project
---

On 2026-10-17 @po applied the STUDIO-OBS-015 formal-gate follow-ups and the three root decisions recorded at "UPDATE ~14:35". The gate is `qa-formal-gate01/gate.md`, verdict CONCERNS. All edits were append-only.

| Story | Version | Change |
|---|---|---|
| 009 | 0.3.17 | AC-11 REL-001 pointer, AC-12 D4 15 s-edge classification rule, two T5 sub-items, new section "PO follow-ups — …" |
| 010 | 0.3.9 | AC-4 clarification d row g, KL-015-D5 |
| 011 | 0.2.8 | Start list: D5 and LR count; EDGE and PID-1 do not |
| 008 | 0.3.12 | F4/R4 note item for the L0 C-int owner in the W1 unit |

The six Node-22 doc rows now read "in-image verified (final-gates07)", qualified as the local gate image, not the deployed one.

Facts worth keeping:
- **The F4/R4 note text comes from @po's own R4 decision**, at `execution-20261015/po-r4-whitespace-decision/decision.md` §2. It is not in any `aria-*-ruling01` folder. The target doc is `docs/architecture/studio-inference-contract-v1.md` F4 (`:124`), not docs/specs. QA calls it "Aria's" note because @architect owns the doc.
- **Two kinds of TIMEOUT in the start-failure chain.** An innermost `code TIMEOUT` is the D4 deadline. A `kind TIMEOUT` is a Playwright action timeout, such as patch B's PROBE wait (H1), and it counts as a REL-001 recurrence. The D4 ruling's "innermost cause" row is the source.
- **Open, not decided by @po:** whether an innermost `code CANCELLED` (a stop during start) is exempt from the REL-001 rule.
- **[AUTO-DECISION]** The REL-001 pointer and the AC-12 rule do not gate the 011 start. The coordinator may override this.

**Why:** Quinn's gate §8 item 2, plus the root decisions, which closed the three observations left open in [[015-deferrals-20261017]].

**How to apply:**
- Do not re-place these items.
- When a lead's path premise is wrong, find the true source, use it, and flag the discrepancy.
- Every "in-image verified" claim must name which image was checked. A local gate build is not the deployed internal image.

See [[prep-009-010-20261016]].
