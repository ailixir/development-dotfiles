---
name: ar2-residual-placements
description: 2026-10-13 PO placements of AR-2/AR-1 leftovers — unpruned guided stores (residual + @pm follow-up), two policy sources (@pm follow-up + OBS-015 T0 ruling), OBS-013 AC-4 SSE clause N/A
metadata:
  type: project
---

Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ar2-notes.json`.

1. **Unpruned guided stores.** These are action and obligation-admission proposals, clarification contexts, translation plans, preparation proofs, cached command responses and the bases' `initialContext.origin`. Ruling: NOT in OBS-014 AC-3. They are a disclosed residual (OBS-014 AC-2 clarification R-1, AC-3 clarification f, OBS-010 AC-4 clarification a) plus a @pm follow-up, @architect first. The follow-up is not release-blocking unless the OBS-010 compliance gate demands it.
2. **Two policy sources.** Learning uses the governed policy and replay uses the configured TrustedPolicy. Unification is a new @pm story; it is not in OBS-009 or OBS-015. OBS-015 gets a ruling-first T0 request for mixed-mode prefix vs suffix. Interim disclosure goes in the data-flow doc and the OBS-010 AC-5 runbook row.
3. **OBS-013 AC-4 "SSE snapshots".** N/A, because no guided SSE stream exists. QA records it as N/A. It reopens if a guided stream is added.

**Why:** consistency test with X6 ([[obs014-x6-publication-copies]]). An equality-bound copy of a pruned column goes into AC-3. Other content-bearing stores become a named residual plus a follow-up, never dropped by omission.

**How to apply:** when @pm drafts either follow-up, or @qa gates 013 or 014, check these placements. When dev lanes are in flight, edit only clarification blocks and the Change Log, and re-hash before editing. See [[studio-observed-wave-po-conventions]].
