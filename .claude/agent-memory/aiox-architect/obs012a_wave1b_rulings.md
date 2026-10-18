---
name: obs012a-wave1b-rulings
description: 2026-10-13 OBS-012A rulings — schedule tests deferred to OBS-009 via exact @Disabled form, CSI tests rebuilt on unbound rows, dispatch recheck restored in 012A, runner coverage exclusion + 25ms control margin accepted
metadata:
  type: project
---

Rulings file: docs/qa/evidence/STUDIO-OBS-012A/root/architect-rulings-wave1b.json.

- Scheduled observed runs are refused (OBSERVED_SCHEDULE_AUTH_REQUIRED) until OBS-009 AC-6. Tests that need an ACCEPTED occurrence are deferred with `@Disabled("DEFERRED STUDIO-OBS-009 AC-6/T3: ...")`, body unchanged, counted as skipped. Reachable halves get live ports. SharedSchedulingIT is never wholesale-disabled because it carries core ADR-004 coverage. @po owns adding the re-enable list to OBS-009.
- A CSI-mutation test refused by the observed binding trigger is rebuilt on an unbound execution row, not deleted. The V13/V15 drafts still allow NULL or changed CSI on unbound rows.
- StudioDispatcher lost DispatchAuthorization.recheck when Lane K deleted the legacy branch. This is HIGH security and is fixed in 012A Lane K: required ctor dependency, called in dispatchClaimed before binding/refreshRetry/Vault.

- R6/R7 (root/architect-rulings-r6-r7.json): ordinary revisions are unrepresentable under V15. Tests seated on them are re-seated on ObservedPublicationFixture.publish with a READY or term-5 control, or converted to a ck_observed_revision_origin refusal. They are never deleted. A vacuous pass (zero acceptances possible) counts as a deferral, not a pass. Arrangement edits forced by D-A (updateTest->saveAuthoring, replica config) are allowed in deferred bodies if named. 18 OBS-009 deferrals; repo @Disabled = 24.

**Why:** D-A forbids test-only bypasses and fallbacks. Capability-loss heuristic: preserve scheduling, CSI authorization and the AC-13a recheck.
**How to apply:** when OBS-009 starts, check that the deferrals were re-enabled. When OBS-011 sweeps, the NULL-CSI quarantine branch is a class-C candidate and not dead code until the schema forbids it. Related: [[single-path-decision]], [[run-auto-accept-ruling]].
