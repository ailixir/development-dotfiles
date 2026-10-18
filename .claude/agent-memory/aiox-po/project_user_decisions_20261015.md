---
name: user-decisions-20261015
description: 2026-10-15 user decisions — 015 row 85 Option C (waive only actual-run positive tie) and 011 early start (Proposal B adopted); where recorded
metadata:
  type: project
---

On 2026-10-15 the user made two decisions, relayed to @po by the coordinator.

1. **015 ledger row 85, Option C.** Only the clause requiring an actual-run positive equal full-key timing tie is waived. Still required: the Java+TS comparator cases (ledger rows 83/84, ARCH03 delta cases 5/6) and every real-run proof (native0/no stamp, attempt1/native1 replacement, continuous video/privacy, per-admission seek where a stamp exists). Option B, the fixture-owned tie, is not adopted. Report the waived clause as USER_WAIVER, never PASS/N/A. Record: `execution-20261015/po-recording85-decision-user-c/`. Ledger row 85 has a `userScopeDecision` key.
2. **011 start condition.** OBS-011 may start once 009's locally achievable ACs are implemented and validated (Proposal B list: AC-1–6, 11, 12 f–j) and the 010 Live-surface list exists. It no longer waits for 009 Done. Nothing on the Live-surface list may be removed.

**Why:** 009 and 010 cannot reach Done locally because of external gates. Row 85's positive tie cannot lawfully occur in production.

**How to apply:** This supersedes the "not adopted" Proposal B note in [[feasibility-008-011]] and the "no waiver" instruction for row 85 only. The earlier "no waiver" instruction still holds for every other row and gate.
