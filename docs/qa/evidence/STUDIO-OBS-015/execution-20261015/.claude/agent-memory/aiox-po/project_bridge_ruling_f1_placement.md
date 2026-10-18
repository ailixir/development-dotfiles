---
name: bridge-ruling-f1-placement
description: 2026-10-16 STUDIO-OBS-015 bridge ruling — GuidedBridgeIntegrationTest 38→9+16+13 disclosures placed (015 DAR, 012A/014 post-closure notes, 009 AC-12 i); F-1 translation-absent branch removal → OBS-011 AC-2 obligation
metadata:
  type: project
---

Aria's bridge ruling (`STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/`) split `GuidedBridgeIntegrationTest` 38 into 9 retained, 16 moved to `GuidedBridgePlannedIT`, and 13 retired (12 RETIRE + 1 RETIRE-OBSOLETE). The 38 is the OBS-012A port proof of 37 plus the H8 case. Record: `po-bridge-disclosure/`.

F-1 is the `GuidedSessionService` translation-absent branches (`:353/:799/:832/:1375/:1923`), which production never reaches. Its removal went to OBS-011 as AC-2 obligation F-1 a–g (CLN-F1, class C). The order is: migrate the `GuidedSessionIT`/TransportFaultIT positive admissions first, then make the gate unconditional, all in T1 before the `claim()` split. The split's "unchanged" baseline is the migrated classes.

**Why:** the OBS-015 placement-map row is D-D only, 015 runs under a frozen ledger, and the removal is behaviour-neutral in production. Until F-1 lands, citations into those two ITs count as post-admission evidence only.

**How to apply:**
- Done stories (012A, 014) get dated post-closure notes plus Change Log rows. Their `.ai/*-close.json` story-hash bindings then go stale; flag this to root and do not edit `.ai/`.
- Aria's "never calls installTranslation" claim was wrong: TransportFaultIT `:4018-4025` installs translation for H8 teardown. Re-check claims like this before citing them.

Related: [[studio-observed-wave-po-conventions]], [[obs-015-t0-followups]].
