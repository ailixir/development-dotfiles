---
name: obs008-q9-authored-literal-trigger
description: OBS-008 Q9 (2026-10-17) — KL-015-Q4 withheld target surfaces as FAILED BUDGET_EXCEEDED via the acquisition gate, not TARGET_MISMATCH/RUNTIME_INCOMPATIBLE; hint widened + clause predicate
metadata:
  type: project
---

Ruling (ii): the 008 authored-literal hint triggers on `TARGET_MISMATCH` (declared, never emitted) OR `BUDGET_EXCEEDED`, plus a per-clause verb predicate on the failing step's draft text. `RUNTIME_INCOMPATIBLE` is excluded because it is mostly infrastructure: context refusals and delivery exhaustion.

**Why:** `acquireBeforeProposal` runs before every NEXT_ACTION. It needs an observed node named `targetIntent`, and a withheld node never appears, so polling ends REFUSED BUDGET_EXCEEDED. The model's UNSUPPORTED→RUNTIME_INCOMPATIBLE mapping is never reached on that path. The 015 D3 real run confirmed it: FAILED BUDGET_EXCEEDED with extraPolls 32. The leading-verb predicate missed that run's step, which starts with "Click".

**How to apply:**
- A guided failure "caused by a target not found" shows publicly as BUDGET_EXCEEDED, which is shared with model, CSI, cap and window stops.
- 009 AE-01 e accounting cannot count by target code.
- The L2b MSW `endsIn` adds `failure:{code}` and a FAILED action for every code. The backend sends `failure` only for LOGIN_REQUIRED, so tests for this path use the backend shape.
- Record: `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/q9-authored-literal-trigger.md`.
- Related: [[obs015_t0_rulings]], [[project_fixture_masks_live_compile]].
