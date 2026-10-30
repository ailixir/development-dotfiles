---
name: gov001_134_integrated_qa
description: STUDIO-GOV-001.1/.3/.4 review+fix and integrated verification (2026-10-24/25); build-script partition trap, corpus re-freeze, egress proxy findings, timings
metadata:
  type: project
---

Review+fix of GOV-001.1/.3/.4 plus integrated run of all four stories in the shared dirty tree. No gate files by user choice.

- `./gradlew check` took 1h30m and failed ONLY at `requireFreshGuidedPartitions`: `setOf(joinedIncrementalMethods[0], joinedIncrementalMethods[2])` indexed the deleted third method (the origin-ceiling test). Deleting an entry from a `joined*` list in `build.gradle.kts` means grepping the whole script for `[n]` indexing too. The task reads in-memory lane state, so it cannot be re-run alone: reproduce its check offline from `build/guided-cohorts/<lane>/<run>/*/cohort.json` (invocations method[:variant] set == the script's expected set == JUnit XML count: 40 test lane, 49 incremental lane), then finish with `jacocoTestCoverageVerification -x test -x guidedIncrementalTest -x requireFreshGuidedPartitions -x retain*Cohort -x verifyRunnerDist`.
- The dev's "corpusManifest red is pre-existing" was wrong: HEAD hashes matched the frozen manifest; the red came from the .4 applicationId edits to evaluate.mjs/cli.mjs. Safe re-freeze check: run `node evaluation/cli.mjs freeze-corpus <copy>` on a scratchpad copy first and diff (only the two source pins + manifestFrozenAt + manifestSha256 move), then run it in place.
- Egress proxy (`studio-runner/src/run/egressGuard.ts`) is sound: CONNECT and plain HTTP both checked, every DNS answer checked, dials the checked IP, `<-loopback>` proven with real Chromium (it also removes the implicit link-local bypass: 169.254 goes through the proxy). Added fixtures for WebSocket, IPv6 literals, decimal/hex IP spellings, `localhost`. Not fixed: WebRTC UDP (the one-line flag would change the pinned `args: []` browser provenance) and the `CHECKS_EGRESS_LOCAL_RUN` env key, which any process env can set (not strictly bind-derived).
- Destination spans (`GuidedAuthoredUriCandidates.literals`) still reject a sentence-final period; `TestOrigins` now derives the origin anyway (`collectSentenceUrls`), but `Open https://x/login.` still gives the learner no destination candidate.
- Backend start seam for origins is only reachable through `GuidedProductionSessionAccess.resolve` inside a transaction (`GuidedTranslationStore.transaction()` requires an active one); `GuidedStartOriginsIT` is the cheap harness (SpringBootTest, local profile, `StudioExecutionFixtures`).
- GuidedSessionIT start idempotency: two valid digest-different starts for one principal+test = add `firstLearnStepId` of the first step (index 0 with no base is accepted).
- Pre-existing at HEAD: `realStudioStartup.test.ts` (dev.sh lacks `STUDIO_RUNNER_OBJECT_STORE_PROVIDER=local`), `ExecutionReadinessTest.targetPolicy...` @Disabled, studio-runner/short.webm untracked noise from Oct 14.
- Timings (idle-ish host, load ~5): runner unit 6 s, fixtures tier ~4 min, deployment tier ~2 min after `docker build -t put-checks-studio-runner:<tag> studio-runner/` (~3 min), FE vitest 6.5 min with maxThreads=4, FE tsc ~20 s, lint ~2 min.

Related: [[project_gov001_2_scheduling_qa]], [[verification_run_budgets]].
