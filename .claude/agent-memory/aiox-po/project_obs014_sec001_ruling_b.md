---
name: obs014-sec001-ruling-b
description: 2026-10-14 PO ack of AR-SEC001-FM option B — AC-6 fail-closed reading (clarification, no AC edit); OBS-008 inherited copy obligation; ALLOW oracle open on red ReplayIT
metadata:
  type: project
---

Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-sec001-ruling-b-ack.json`; OBS-014 v0.1.10 (AC-6 clarification a-e), OBS-008 v0.3.4.

AC-6 "marks as form submission / navigation-causing" = "cannot prove non-activating" (3 click triples; press Enter || inForm). DENY then cannot run any login/button flow — this is specified, not a regression. Fixtures and joined ITs seed ALLOW; production default CLARIFY_FIRST.

OBS-008 obligation: governed POLICY_DENIED narrative (not the secret-fill copy; reason never public) + SIDE_EFFECT_CONFIRMATION/CONFIRM_ACTION rendering; copy by @ux-design-expert.

**Why:** QA SEC-001; the ruling required the PO ack before Done.

**How to apply:** at the OBS-014 re-gate, the AC-6 ALLOW oracle stays open until ReplayIT is green (Order 9 teardown routed to root/B13). The unplaced AR-2 POLICY_NOT_APPROVED narrative was flagged to the lead. See [[obs014-qa-rulings]].
