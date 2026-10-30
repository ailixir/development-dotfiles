---
name: project-wi4-joined-cap-and-harness-coupling
description: ADR-SC-007 WI-4 planning facts - two ReplayIT units exceed the 600 s Lean cap, split runs exit rc=1, joined classes live in package guided.session, ReplayIT wraps session.acquire/invoke, aria snapshots leak field values
metadata:
  type: project
---

Found while planning WI-4 (2026-10-27, read-only; plan at scratchpad lean/work/WI-4/plan.json):

- **Lean cap vs ReplayIT.** WI-1 baseline XML (docs/qa/evidence/adr-sc-007/wi-1/replayit-baseline): `actualCommittedSecretProgress...ThenRunningReaper` is 608.6 s alone (it waits out the unchanged 600 s production run deadline) and the 25-label parameterized `incrementalStructuralEdits...` is 959 s summed. Gradle `--tests` selects by Java method name, so a single parameterized invocation cannot be picked (inferred, Gradle 8.10.2). Everything else packs into 3 default and 4 incremental checks (Order(1) `actualLearningPublishes...` must be in every default check).
- **Split and whole lane runs end `rc=1`** with all tests PASSED: `retainOriginalGuidedCohort` / `retainIncrementalGuidedCohort` fail ("Missing/ambiguous real ... JOIN lifecycle export"); WI-1 logs show it. Exclude them with `-x` for Lean checks.
- **Packages:** `GuidedPlanningIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedBridgeIntegrationTest` are `com.citi.put.checks.studio.guided.session` although the files sit under translation/ and bridge/ (WI-3's joined list got this wrong).
- **Harness coupling:** `GuidedPublicationReplayIT` generates `recorded-child.mjs` and `ordinary.mjs` that wrap `session.acquire` (POST result.kind to /acquisition) and `session.invoke` (POST operation.kind to /invocation); `revObserveNative` requires `cap.fillPassword` and `cap.invoke` to exist (else `revFail()`). Keep `invoke` and `fillPassword` names when reshaping ObservationSession.
- **Backend call deadline:** HttpRunnerDispatchClient.transportDeadline is 15 s for every runner call; a longer observe is UNKNOWN_OUTCOME, not an explicit refusal, so any runner-side observation deadline must stay well below 15 s.
- **Playwright 1.63:** `locator.ariaSnapshot()` has no default timeout and its first line for a textbox includes the field's current value; refs from one injected-script instance are stable across snapshots, so a reused engine keeps resolving old refs.

**Why:** these change how joined tests can be bound and how the session API may be renamed.

**How to apply:** when building WI-4 joined checks or touching the replay wait seam; related [[tooling-guided-incremental-single-test]], [[tooling-verify-runner-dist-wildcard]].
