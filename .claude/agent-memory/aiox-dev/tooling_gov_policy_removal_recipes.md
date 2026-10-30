---
name: tooling-gov-policy-removal-recipes
description: STUDIO-GOV-001.3 (policy + side-effect stance removal) recipes - V25 without V24, contract checklist moves, ReplayIT name-set edits, member-removal script, FE vitest flags
metadata:
  type: reference
---

Done 2026-10-24 (story GOV-001.3, Flyway V25; V24 is the scheduling story's, absent in this tree).

- **Flyway gap.** V25 without V24 migrates fine on a fresh DB. A dev DB already at V25 will fail `validate-on-migrate` once V24 lands (outOfOrder is off). Head pins moved 23 -> 25 (`max(version)`, `.target("25")` in ~10 ITs, `GuidedPublicationMigrationTest` version list, `InferenceMigrationLatestIT` description list); the "count of successful migrations" pin is 24 here and 25 after merge.
- **Contract checklist for a v3 schema edit** (all done, all green): edit schema -> `node tools/build-studio-observed-schemas.cjs` (Node 24 from `~/.local/share/fnm/node-versions/v24.20.0/installation/bin`) -> `publication-fixtures.json` `build.schemaBundleHash` (108 hits) and `replayGrant.buildHash` (2 hits) re-pin (script copy: `scratchpad/repin.cjs`, it verifies the old buildHash first) -> `GuidedContracts.REPLAY_VALIDATION_SCHEMA_EPOCH` via `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/dex-prep/epoch-probe.cjs <v3 dir>` (prove on an old-schema copy first) -> `tsc -p tsconfig.build.json` + `write-runtime-versions.mjs` in studio-runner -> openapi digest pins in `StudioContractTest` and runner `test/run/confinement.test.ts` (both `shasum -a 256 docs/specs/studio/openapi.yaml`) -> op-count pin in `tools/check-studio-observed-contracts.cjs` and `StudioContractTest` -> ADR-002 section 13 row.
- **fixtures.json is not byte-round-trippable** (one lone surrogate): `json.dumps(ensure_ascii=False)+"\n"` then replace the real `\ud800` char by the 6-char escape. `publication-fixtures.json` round-trips exactly with `ensure_ascii=False` + trailing newline.
- **Pre-existing baseline reds in this dirty tree** (UNIFY-001.6 added `GET /guided-sessions/latest` without touching `StudioContractTest`/`ExecutionVideoContractTest` pins): I added `readLatestGuidedAttempts` to both, so the pins are 40 ops / 32 public 401 refs in a tree that still has the 8 schedule ops.
- **Java member removal at scale**: `scratchpad/g3/javamember.py` (`remove_member(src, signature)` with javadoc/annotation walk-back and string/comment/text-block aware brace matching) removed ~15 methods from the 45k-line `GuidedPublicationReplayIT` safely. Always `rm` not `git rm`; `git mv` stages (undo with `git reset -q -- paths`).
- **ReplayIT/Gradle name sets**: deleting or renaming an incremental test touches `SINGLETON_METHODS`, `INCREMENTAL_METHODS`, `INCREMENTAL_VARIANTS`, the `@ValueSource` list and `build.gradle.kts` (`joinedAddedLowMethods`, `joinedIncrementalLabels`); a removed variant leaves a dangling `case "x" ->` label if it was last in a list.
- **Runtime role privilege IT** compares created relations V19..head: relations a later migration drops must be filtered by `head.relations()`.
- **Frontend vitest 1.6**: `--maxWorkers` errors (minThreads conflict); use `--poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=3`. `pageGuidedRun.test.tsx` alone takes ~6 min under load.
- **Runner vitest subsets** need `--coverage.enabled=false` or the thresholds print a wall of ERROR lines.
- zsh: `echo =====` is an `=cmd` expansion error; quote it.

- **Observation policy source after the governed policy went (GOV-001.3 AUTO-DECISION).** Context `applicationPolicy` = the deployment trusted policy's `applicationPolicy` (else structural, no read grants), via `GuidedContracts.installObservationPolicySource(pins::observationPolicy)` installed in `ObservedReplayRuntimeConfiguration`; ITs install their own (`C.installObservationPolicySource(...)`) and put grants in their fixture trusted policy. Why: replay validates read recipe `policyRuleId` against the trusted policy, so learning must read under the same ids; structural-only broke every read IT with `UNKNOWN_OUTCOME` on the read admission. Generated per-origin grants were tried and dropped (runner needs unique grant ids; ids would not match trusted).
- **Script trap**: my balanced-paren arg splitter counted commas inside `//` comments, so an `installGovernance(...)` call with a comment before its 8th argument lost its budget limits (PlanningIT went 429 BUDGET_EXCEEDED). After mass call rewrites, diff the removed lines for comments inside args.
- Joined ITs sit in package `studio.guided.session` even under `guided/bridge` and `guided/translation`; `guidedIncrementalTest` filters are build-script owned, so a subset run needs an init script that replaces `filter.includePatterns` (scratchpad `g3/incremental-subset.init.gradle`, `-Dsubset=a,b`) plus `-x retainIncrementalGuidedCohort`.

Related: [[tooling-schema-epoch-overlay]], [[tooling-contract-reseal-merkle-and-ripple]], [[tooling-gate-removal-test-lists]], [[tooling-gate-hold-patch-prep]].
