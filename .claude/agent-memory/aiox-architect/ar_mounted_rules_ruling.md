---
name: ar-mounted-rules-ruling
description: 2026-10-13 ruling on guided-worker mounted `rules` (C2b R-1, OBS-014 AC-1 clar. c) — refuse every form, runtime rules:[], replay untouched; guided read refusal is TARGET_CHANGED not READ_REFUSED
metadata:
  type: project
---

Ruling recorded in docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-mounted-rules.json (2026-10-13). Mounted `rules` is refused in every form, including [], as is a `rules` option to createGuidedServer. GuidedRuntimeOptions loses `rules`, and runtime.ts:108 uses the constant `rules: []`. The structuralOnly-only alternative was rejected: a structuralOnly rule still sets name and policyRuleId and widens `relevant`/`safe`.

**Why:** the binding outcome in AC-1 clarification b says no ungoverned input may grant reads, set classification or policyRuleId, or widen the export set.

**How to apply:**
- Replay's TrustedPolicy.rules path (observedReplayAdapter.ts:20 → observedReferencePolicy.ts:284-289) and the collector rule logic stay. Do not "clean up" ObservationConfig.rules.
- In guided learning, a read on a node with no governed read policy is refused at prepare with TARGET_CHANGED (runtime.ts:184). READ_REFUSED is replay vocabulary. PO texts sometimes mix the two.
- Three bridge IT read cases are re-pointed to the governed `business-read` grant: the source becomes an `<output>` inside `<main aria-label='Operations'>`. None were dropped.
- Open residual RS-1: whether GA needs governed exact-field reads of span/div elements. Decide on benchmark evidence, not pre-emptively.
- Related: [[c2b-spec-rulings]], [[ar2-ar3-obs014-rulings]], [[single-path-decision]].
