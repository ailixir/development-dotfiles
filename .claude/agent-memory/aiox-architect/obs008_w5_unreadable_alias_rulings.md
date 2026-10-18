---
name: obs008-w5-unreadable-alias-rulings
description: OBS-008 U1 (2026-10-17) — drop an unreadable guided pointer only on fresh UNLEARNED/NEEDS_RELEARN (READY masks LEARNING); secret alias rule 4 deleted, insert refused; start 422 undeclared
metadata:
  type: project
---

W5-1: the client may drop a stored guided pointer whose read was refused before any view, but only when a `GET /tests/{id}` sent after the refusal answers UNLEARNED or NEEDS_RELEARN. It keeps the pointer on READY, on LEARNING, or when the readiness read fails. READY replay is never blocked. Re-check readiness once when `unreadable` turns true, and once per "Refresh test information" press.

W5-2: alias rule 4 is deleted. A `<secret ID>` insert is refused, with no token and no row, when a row named ID exists that is not a secret row with secretId equal to ID or empty. No MSW change in U1.

**Why:**
- `readiness()` checks READY before `LEARNING_QUERY`. A learn-again session on a READY test therefore reads READY, so READY proves nothing about liveness.
- A non-live session can never act or publish again: `expires_at` is immutable, terminal states are absorbing, and finalize needs FINALIZING with an unexpired lease on the DB clock.
- Guided start has no per-test live-session check. Only the client prevents a double learn, through the pointer and the gate's busy re-read.
- `IncrementalAuthoringIdentity.resolve` refuses a declaration whose name equals another secretRef's secretId, unless it is that same secretRef. The resulting 422 at start is not declared in openapi.yaml, which has no `'422'` anywhere.

**How to apply:**
- Any "is a guided session live?" question: use LEARNING only for non-READY tests.
- The start 422 (AUTHORING_REFERENCE_AMBIGUOUS) is a contract carry for the backend or contract owner. Only after it is declared does the start mirror (guidedHandlers.ts) get the four `resolve` refusals.
- `handlers.ts:177` still has the D-8 `secretId ?? name` fallback.
- Record: `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md`.
- Related: [[obs008_q9_authored_literal_trigger]], [[obs015_t0_rulings]].
