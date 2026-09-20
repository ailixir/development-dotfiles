# Verification failure remediation review — story 10.27

**Date:** 2026-09-17 · **Reviewer:** Quinn (independent QA) · **Scope:** [story 10.27](../stories/10.27.story.md), against the existing dirty `wt/epic` baseline. **Latest disposition:** VF1 corrected and independently rechecked; no open actionable finding from this bounded review. Full verification remains with the coordinator. This document is not a formal story lifecycle or production-release approval.

## VF1 — P1: mounted overrides can activate the local administrator identity

The new [`springConfig.validateProperties` helper](../../helm-chart/put-checks/templates/_helpers.tpl) rejects `spring.profiles.active`, but not profile inclusion/grouping. This local read-only render succeeded:

```sh
helm template qa helm-chart/put-checks \
  --set-string 'backend.configOverrides.spring\.profiles\.include=local'
```

The mounted `application.yaml` contained `spring.profiles.include: local`. Evidence file: `/tmp/studio-qa-profile-include.yaml`. This was a Helm rendering probe; no deployment or live request occurred.

Including `local` can activate it alongside the chart's explicitly selected remote profile. [`LocalDevAuthFilter`](../../backend/src/main/java/com/citi/put/checks/config/LocalDevAuthFilter.java) is active for the `local` profile, defaults enabled when its switch is absent, and injects a `checks-admin` identity. That behavior is separate from the three `checks.security.bypass` properties already guarded by the chart. Other missing remote prerequisites can currently prevent startup; that does not make activation of this filter an acceptable configuration path once those prerequisites are supplied.

Protect profile activation comprehensively: inclusion, default/profile groups and their nested/relaxed descendants, not only the scalar `active` key. A nested group such as `spring.profiles.group.prod: [local]` must not evade a check that matches only the literal parent key. If the chart claims generic environment and secret inputs cannot change the managed profile selection, protect `SPRING_PROFILES_ACTIVE`, `SPRING_PROFILES_INCLUDE`, and group variants there as well; the new generic-environment guard presently reserves only `SPRING_CONFIG_ADDITIONAL_LOCATION`.

Add negative render controls for flat and nested inclusion/grouping, and a Spring profile-activation regression or equivalent reviewed configuration proof. Re-run the existing lossless configuration tests to ensure ordinary scheduler/database/map settings remain supported. The coordinator received this finding while its full checks were running.

## Review of the remaining changes

### Author foreign keys and authentication fixtures

[`CheckService.create`](../../backend/src/main/java/com/citi/put/checks/checks/CheckService.java) still checks CSI write authorization and enabled source before establishing the author mirror. [`ReportsService`](../../backend/src/main/java/com/citi/put/checks/reports/ReportsService.java) uses the authenticated identity for create/duplicate. Both call the existing [`ensureMirrored`](../../backend/src/main/java/com/citi/put/checks/users/UserProvisioningService.java), whose REQUIRED transaction participates in the business write and whose `ON CONFLICT DO NOTHING` handles concurrent inserts. It creates no roles or permissions and does not substitute for authentication. No authorization weakening was found in these modifications.

The new first-write integration cases start with absent user rows and assert the actual author foreign key after create/duplicate. They test the race's required invariant instead of adding sleeps. Existing HTTP CRUD assertions were strengthened with create status/author assertions and observed core-service requests. Local development identity injection is explicitly disabled in these cookie-authentication fixtures. Unique report-session cookies avoid stale cached fixture identities.

SMTP changes bind GreenMail to an ephemeral loopback port and inject the actual bound port into JavaMail. Purging mailboxes preserves the listener address; restarting the server in `reset()` could have invalidated the configured ephemeral port. Actual delivery assertions remain in the tests. No external email was sent by this reviewer.

### Confirmed source is independent from the current candidate

[`StudioService.project`](../../backend/src/main/java/com/citi/put/checks/studio/StudioService.java) now separately reads the persisted confirmed revision ID, scoped to the same test and CSI and requiring confirmation metadata. [`UITestDto`](../../backend/src/main/java/com/citi/put/checks/studio/dto/UITestDto.java) exposes its own artifact/hash pair; list projections keep those payloads null. The candidate lookup is not reused as a fallback.

[`CandidateArtifactProjectionIT`](../../backend/src/test/java/com/citi/put/checks/studio/CandidateArtifactProjectionIT.java) includes persisted candidate/confirmed divergence, failed recompile preservation, absent confirmation, and a planted foreign-test confirmed pointer. Assertions compare the actual persisted artifacts/hashes rather than fabricating matching DTO fields. The additive [ADR-002 §29](../architecture/ADR-002-internal-contract-surface.md#29-readable-confirmed-source--story-1027-2026-09-16) and OpenAPI descriptions match this distinction.

Frontend [`CodeTab`](../../frontend/src/components/studio/CodeTab.tsx) displays only the confirmed pair, labels stale source as previously confirmed, and refuses substitution when the pair is missing. [`confirmedSource.test.tsx`](../../frontend/src/components/studio/confirmedSource.test.tsx) deliberately makes draft, candidate and confirmed code disagree and checks detail versus list projection. The compile-review callback supplies updated snapshots to the existing page; the selected-test ID guard prevents a previously selected test's loaded source from rendering under another test. No candidate/confirmed substitution was found.

### Configuration delivery and database lifetime

The revised chart separates valid environment names from mounted Spring YAML, preserves scalar/map/list configuration values, mounts it read-only and uses a required `SPRING_CONFIG_ADDITIONAL_LOCATION`. The workload checksum changes when properties change. The revised deployment test retains an invalid-env negative control and checks all configured property values actually reach the mounted source; removing the old expected-red wording therefore accompanies a changed delivery mechanism, not an allowlist or suppressed assertion.

[`MountedSpringConfigurationTest`](../../backend/src/test/java/com/citi/put/checks/config/MountedSpringConfigurationTest.java) exercises Spring ConfigData with the environment selector, typed enum-map binding, canonical environment precedence and missing-mount failure. It reconstructs a properties file from production values; the separate Helm suite checks the rendered payload and mount correspondence. Together these are useful local evidence, not proof of a deployed pod. VF1 is the remaining guard gap identified in this pass.

`TC_DAEMON=true` is confined to the test profile. [`TestDatabaseLifetimeIT`](../../backend/src/test/java/com/citi/put/checks/config/TestDatabaseLifetimeIT.java) closes every connection, then reconnects concurrently and checks the physical database URL and retained row. It tests the actual connection-lifetime behavior that caused shared-context churn; it does not merely assert the presence of the URL flag. The test requires Docker and records its unavailable-prerequisite skip when absent. The coordinator reports it executed successfully here; this reviewer did not invoke Gradle.

### Frontend lint remediation and side effects

The ESLint configuration change corrects the recommended-plugin import (`plugin:@typescript-eslint/recommended`); it does not disable a rule. Reviewed cleanup is principally unused imports/locals, entity escaping, explicit comments in existing optional-error catches, and unused callback removal. The removed recipient `sendTest` and single-check pause/resume helpers had no callers in the original components. Active toolbar delivery, bulk pause/resume, persistence effects, subscriptions and notification paths remain. The keyboard callback now includes `navigate` as a dependency; the skip link targets and focuses the actual main landmark and has a behavioral focus assertion.

Malformed feature/source responses now take the existing thunk rejection path rather than becoming undefined successful data. Their existing fallback policy was not changed by these checks. No changed production effect was found that merely discards an API operation to satisfy lint. This was an inspection of the substantive diff, not an assertion that every frontend path was manually exercised.

## Verification and limits

This reviewer inspected story scope, production diffs, original callback usages, updated contract/mocks, and the meaningful integration assertions. The only executed probe in this packet was the local Helm render reproducing VF1. Backend Gradle and the frontend full suite were already owned/running under the coordinator and implementation specialist; they were not duplicated. Reported test counts belong in their final execution record, not as independent reruns here.

Only this review document was edited. No application change, test suppression, commit, deployment, live API call or external message was made. The coordinator's complete checks remain required; this bounded review does not claim a full-build or production pass.

## VF1 recheck — corrected

The updated helper rejects the full normalized `spring.profiles` namespace, including nested descendants. It also reserves profile/configuration/JSON selectors in generic environment and named secret keys, and rejects `local`/`test` in the dedicated component profile selector.

Independent read-only verification rendered **28 negative mutations**, covering both backend and worker:

- Flat profile `include`, `default`, and `group.prod` properties.
- Nested profile groups and relaxed `spring.profilesInclude` spelling.
- Generic environment and secret-backed profile inclusion/group variables.
- `SPRING_APPLICATION_JSON` carrying profile activation.
- Dedicated `local`, `test`, `api,local`, and `worker,prod,test` profile selections.

**All 28 were rejected.** An unchanged default render succeeded as the positive control. This independently verifies that the reported configuration path is closed while normal rendering remains available. The coordinator's separate 39-case configuration suite is additional evidence; it was not rerun as part of this short mutation recheck.

VF1 is addressed for the reported mechanisms. No additional P1/P2 finding remains open from this review. Actual Spring binding, connection-churn tests, full frontend/backend checks and deployment prerequisites retain their own evidence and owners.

## Final bounded follow-up inspection

Reviewed the later Testcontainers version-alignment gate, JDBC lifetime regression, mounted configuration binding test, Studio missing-CSI prevalidation, confirmed-source projection and video status-set test amendment. No additional actionable correctness defect was found in these changes.

- `testcontainersAlignmentCheck` examines the **resolved** `testRuntimeClasspath` artifacts, refuses an empty Testcontainers set and requires every module in that group to resolve to the selected 1.20.2 version. It is a dependency of `check`. The Spring dependency-management version override and explicit direct dependencies use the same selected version; the gate does not merely scan the declaration text.
- The JDBC regression still closes all initial connections and then checks physical database identity and retained data across concurrent reconnections. The test-only daemon setting preserves the container for its JVM lifetime; it changes neither production datasource configuration nor the test's data assertions.
- The mounted configuration regression retains nondefault enum/map values, an actual `SystemEnvironmentPropertySource` carrying `SPRING_CONFIG_ADDITIONAL_LOCATION`, nondefault canonical environment overrides, and a missing-source negative case. No new opt-out or weakened assertion was introduced.
- The Studio create path now rejects absent/blank CSI input before trying CSI authorization, after extracting the authenticated identity. Nonempty inputs still require write authorization and registered-CSI validation before author mirroring or persistence. It restores the malformed-request distinction without granting access to a resource.
- Confirmed projection remains independently joined by persisted confirmed revision ID and constrained by test/CSI/confirmation metadata. Candidate bytes are never used as the missing-confirmed fallback.
- `StudioContractTest` retains its independently enumerated operation/status comparison. Updating only the video status set to `200,206,401,403,404,410,416,503` follows the explicit [ADR-002 §30](../architecture/ADR-002-internal-contract-surface.md#30-video-error-responses-landed--story-1027-2026-09-17), which documents existing authentication and unavailable-store producers. The check was not replaced with a value derived from the schema it verifies.

Existing XML reports inspected during the active build showed: `TestDatabaseLifetimeIT` **1 passed**, `MountedSpringConfigurationTest` **3 passed**, `CandidateArtifactProjectionIT` **7 passed**, and `StudioApiIT` **7 passed**, each with zero failures/errors/skips (timestamps 2026-09-17 04:34–04:40 UTC). These are independently inspected coordinator-run results, **not new Gradle executions by this reviewer** and not evidence that the still-running full gate completed.

Preview transport and gateway-audit fixture corrections were assigned to other reviewers/implementers and are outside this follow-up inspection. Only this QA document was changed. The final full-suite/static outcome must come from the coordinator's completed run.

## Credential timeout and gateway-audit follow-up

After the gateway specialist froze its four-file correction, independently inspected `GatewayFailureClassifier`, `GatewayFailureClassifierTest`, `GatewayAuditTest`, and the new `GenAiGatewayAuditTest`. No additional actionable defect was found in this bounded correction.

The timeout classifier now recognizes a cause-chain `InterruptedIOException` whose message is exactly `timeout` (case-insensitive). This handles the actual OkHttp deadline exception even if it arrives just before the outer compile timer marks the budget cancelled. The new deterministic tests distinguish that wrapped failure from a non-timeout partial-transfer interruption, which remains TRANSPORT and nonretryable. The change does not make generic interrupted I/O retryable. The concrete credential regression retains its 500 ms compile budget, one token request, no model request on expiry, empty active pool, and successful subsequent request checks.

The legacy audit fixture now binds and targets literal IPv4 loopback, verifies the configured SDK endpoint, and checks both an actual request received by its own WireMock server and an owned model-version marker before treating a result as success. This prevents a redaction assertion passing merely because an unrelated 404 contained none of the canary text. The production `GenAiGatewayAuditTest` separately sends a canary-bearing request through the maintained adapter for success, malformed output and an echoed HTTP error; it asserts the intended outcome, observed request/body, nonempty audit evidence and absence of source/canaries in captured audit/diagnostic output.

Inspected preserved XML under `/tmp/studio-gateway-audit-fixed-results`: **34 passed, zero failures/errors/skips** — CredentialBudget 4, GatewayAudit 10, GatewayFailureClassifier 7, GenAiGatewayAudit 1, and legacy VertexLlmGatewayClient 12. The specialist's command completed in 22 seconds (`/tmp/studio-gateway-audit-fixed.log`). These are reviewed focused-run artifacts, not a new Gradle run by this reviewer. The coordinator's subsequent full check was active at handoff and remains the authority for full-suite completion.

No application file changed during this review. No live gateway request, external communication, commit or deployment occurred; only this QA record was updated.

## Coordinator final execution evidence

After the bounded reviews above, the coordinator completed the full backend `check`: **BUILD SUCCESSFUL in 11m36s**, 1,086 main-suite passes plus two cross-replica passes, seven existing skips and zero failures/errors. Static and coverage gates passed (83.23% aggregate line coverage). Final log: `/tmp/studio-followup-full-check-complete.log`; preserved XML/coverage: `/tmp/studio-followup-full-check-complete-results`. This completion note is coordinator evidence, not an additional reviewer-run test or formal lifecycle approval. Frontend and runner results are in the [remediation record](verification-failures-remediation.md).
