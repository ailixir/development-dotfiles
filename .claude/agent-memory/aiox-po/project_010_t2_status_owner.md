---
name: 010-t2-status-owner
description: 2026-10-18 STUDIO-OBS-010 T2 Ready→InProgress is not @po's (story says @analyst; lifecycle says @dev); 16 removed list entries confirmed by @po
metadata:
  type: project
---

On 2026-10-18 @po declined to move STUDIO-OBS-010 Ready → InProgress for T2 work; recorded it as owed by @analyst (story Dependency notes: "The Status moves to InProgress when T2 starts (@analyst)"), and by @dev under story-lifecycle.md. Same day @po confirmed all 16 `removed` entries (RKG-00..13, RKO-03, RKO-04) of the dated list `e5c58fa5…`, record `live-surface-20261018/po-removal-confirmation.md`; story 0.3.15, receipt po-carry/receipt-5.md.

**Why:** lifecycle transitions belong to named agents; @pm P4 requires @po confirmation before any list removal.

**How to apply:** if asked again to move status for T2/T3 work, decline and name the owner. Future list versions after removal get new sha256s; sign-offs must name the version. Re-dates after 009 Done need fresh @po removal checks for any new `removed` entries. See [[project_009_w3_carries_20261018]].
