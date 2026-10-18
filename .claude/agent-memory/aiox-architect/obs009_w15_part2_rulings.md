---
name: obs009-w15-part2-rulings
description: 2026-10-18 OBS-009 W1.5 part 2 — R1 GO via static acceptedContextRevisions shared by verifyLifecycle + evidence route; ADJ-1 option (a) outcome-bound applyFinal disjunct, no V23; coordinator SSLContext.getDefault moves to StudioRunnerTls, tripwire 0
metadata:
  type: project
---

Ruling file: docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w1.5/ruling-part2.md.

- **R1:** reproduced (STALE_FENCE at GuidedSessionEvidenceService.java:120). Non-consuming confirmed again. GO.
  - One derivation: `GuidedMaterializationService.acceptedContextRevisions(head, pending)` is static, plus an instance form that reuses `pendingDeliveryId`.
  - The evidence service takes a `GuidedMaterializationService` built inline in GuidedEvidenceConfiguration; it is not a bean anywhere.
- **ADJ-1:** option (a). The owner CTE of `applyFinal` gains `OR (state='ADMITTED' AND revoked_at IS NOT NULL AND ?)`.
  - The `?` is a Java boolean: `AUTHORIZATION_REVOKED.equals(errorCode)`. It is outcome-bound, so any other revoked pre-Ready FINAL is still refused and settled by the reaper.
  - No migration and no DE involvement. ProgressReportService is unchanged.
  - I owe an ADR-002 §29.2 item 7 note and a §13 row when B lands. @qa security co-signs at the B gate.
- **A4:** GuidedTranslationCoordinator.java:47 calls the API's guided chain, which requires a client cert (GuidedInternalSecurity.java:134-140). So it moves onto StudioRunnerTls, which is the one dual-role backend identity. The tripwire expects 0.

**Why:** the reviewed OBS-006 pre-Ready edge must not be bypassed, and R8 requires that outer CANCELLED be backed by a record. A JVM-default client keystore is prohibited.

**How to apply:** lane B write set gains StudioDispatchLedgerStatements and GuidedEvidenceConfiguration; D3 gains the coordinator. Related: [[obs009-w15-d5-d10-rulings]], [[r8-preready-selfstop-ruling]], [[obs009-t0-rulings]].
