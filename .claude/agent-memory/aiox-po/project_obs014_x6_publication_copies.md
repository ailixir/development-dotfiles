---
name: obs014-x6-publication-copies
description: 2026-10-13 PO ruling X6 on OBS-014 AC-3 — V15 publication copies of guided observations: published sessions retained, never-published pruned (AR-2e mechanism); plus dead /api/v2/studio matcher placed in OBS-014
metadata:
  type: project
---

X6 ruling (record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-x6-and-leftovers.json`, OBS-014 v0.1.3): V15 publication tables copy observations/execution_evidence/proposal for EVERY guided session during the run (base at start; publication enabled by default), not only at publish, and are UPDATE/DELETE-immutable. Ruling = split: published sessions' copies retained (hash-bound provenance; AC-2 must disclose four tables, content is NOT IDs/codes only — role/name/locatorHints/origin); never-published sessions' copies are in AC-3 scope, mechanism by @architect AR-2e in V19/V20 only; fallback = named residual + @pm follow-up, never by omission. AR-2 did not exist at ruling time → AR-2e must conform or return to @po.

**Why:** pure "retain all" would leave indefinite retention of unpublished observations (exactly AC-3's target); pruning published copies breaks provenance and V15.

**How to apply:** when AR-2 lands, check AR-2e against this split. Same day: `IdempotencyFilter:40` `/api/v2/studio/**` dead matcher placed as OBS-014 inherited obligation a–d (with `StudioV2IdempotencyFilterTest` drop/re-point); D-2b stays open. Related: [[studio-observed-wave-po-conventions]].
