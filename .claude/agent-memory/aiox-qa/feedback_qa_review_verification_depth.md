---
name: qa-review-verification-depth
description: How this project expects QA story reviews to be verified and reported — empirical probes over reasoning, narrow suites, strict scope limits, terse report
metadata:
  type: feedback
---

QA story reviews here are expected to produce **executed evidence**, not reasoning about code.
Verify a suspected defect with a throwaway test rather than asserting it from reading SQL.

**Why:** the reviews are gate decisions that let a story merge into an epic branch; a wrong
"probably fine" propagates. The user's global rules also demand separating what was *verified* from
what was *inferred*, and saying so in the same breath as the result.

**How to apply:**
- Write a temporary `*TempTest.java` under `backend/src/test/.../<context>/`, run it with
  `./gradlew test --tests '<fqcn>' --rerun`, read `System.out` from
  `build/test-results/test/TEST-<fqcn>.xml` (Gradle does not echo stdout to the console), then
  delete the file and its compiled class and confirm `git status --short` is clean.
- Gradle test tasks report UP-TO-DATE from the developer's run — always pass `--rerun`, or the
  "evidence" is a cached result. **Stronger form, measured in the 10.11c gate:** the studio contract
  document is *not a declared task input* — document-reading classes resolve it via
  `Path.of("..", "docs", "specs", "studio", "openapi.yaml")`, outside the source set — so **a
  contract edit leaves every document-reading test stale-green**. Demonstrated: with a `TestDto`
  property renamed, a plain run printed `> Task :test UP-TO-DATE` / BUILD SUCCESSFUL in 4s while the
  identical tree with `--rerun-tasks` printed BUILD FAILED. A plain green against a contract edit
  means nothing. (Open item for @devops; it is neither 10.15's nor 10.11c's to fix.)
- Coverage: `./gradlew test --tests '<pkg>.*' jacocoTestReport --rerun-tasks`, then parse
  `build/reports/jacoco/test/jacocoTestReport.xml`. `**/entity/**` and `**/dto/**` are excluded by
  `jacocoExcludes` in `build.gradle.kts`, so those classes will be absent — that is not a gap.
- Never *ship* production-code changes from a review. Temporarily mutating a guard to falsify a
  test **is** expected: back the file up, apply the mutation, run the real assertion, restore, and
  confirm `git diff --quiet <file>`. Report defects with a suggested fix and owner; a developer
  agent applies them.
- When a story ships its own "falsification tests" that substitute a broken implementation through
  a DI seam, those prove the *assertion* is sensitive but leave production untouched. Re-run the
  falsification against the **production guard itself** — that is what the orchestrator means by
  "neutralise the guard". Mutating the guard sometimes reveals a test that stays green, which is a
  finding in its own right.
- Allowlist / denylist gates: probe with a *real* `npm install` (then `git checkout --` the
  manifest and lockfile and reinstall), not a hand-edited lockfile — only the real install
  exercises the transitive case. Denylists derived from the same constant the test iterates over
  are self-referential: deleting an entry deletes its own test case; check both directions.
- `skipIf`-gated deferrals waiting on another story's file: prove the auto-enable by creating a
  stub of that file and confirming the test arms and fails, then remove the stub.
- Gate file goes to `docs/qa/gates/{story}-{slug}.yml`; append a `## QA Results` section to the
  story and leave Title / Acceptance Criteria / Scope / Status untouched when the spawn prompt says
  so (this overrides the qa agent's default claim on Status and Change Log).
- Final report to the orchestrator is capped (250 words in the 10.4 run) and must not contain
  source, diffs or build logs.

- **Narrow backend runs are fast even though `./gradlew check` hangs.** In the 10.11c gate a single
  test class ran in 21–30 s and the whole `com.citi.put.checks.studio.*` package in ~4 min, twice,
  on two different commits, with Testcontainers against real PostgreSQL. Do not let MED-2 ("`check`
  hangs 7 of 7") talk you out of measuring the backend — scope to `--tests '<pkg>.*'` and you get a
  real result. `check` alone is the thing that hangs.
- **Measure the baseline yourself in a throwaway detached worktree** (`git worktree add --detach`),
  never inherit it from the spawn briefing. In the 10.11c gate the briefing's claim ("no inherited
  failures in `studio`") was **wrong** and @dev's correction (six failures across four classes) was
  right. Remove the worktree afterwards.
- **When a dev self-reports a guard they found non-falsifiable and repaired, verify both halves**:
  re-apply the mutation against the repaired assertion (expect red), *and* restore the pre-repair
  test files from the earlier commit with the mutation still applied (expect green). The second half
  is what proves the defect was real rather than a tidy story.
- **A negative control must be observed green by name in a verbose run**, not inferred from its
  absence in the failure list. A control that co-reddens with its siblings proves nothing.
  **Trap, measured in 10.30:** with `-i` the backend build printed **zero** `> … PASSED` lines (only
  FAILED); the same run without `-i` printed all of them (19 PASSED + 5 FAILED = 24). Use the plain
  run for per-test evidence. For soft-assertion (`SoftAssertions`) tests, read each observed status
  from the `<failure>` text in the JUnit XML, because the console message is truncated.

Related: [[epic10-gate-policy-non-green-baseline]], [[epic10-vacuous-guard-shapes]]
