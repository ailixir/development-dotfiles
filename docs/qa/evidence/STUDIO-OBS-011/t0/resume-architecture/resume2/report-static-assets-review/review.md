# Static report resources and freshness — independent source/provenance audit

Aria, 2026-10-19. **REPORT-STATIC-01 is confirmed: both validators wrongly require inherited static report resources to have current-run mtimes.** A closed108-pass diagnostic supplies the counterexample. The running full-check03 harness must remain unchanged; its real native/coverage result is unknown here. The bounded remedy is a separately reviewed, post-terminal assessment/archive of the **same execution**, with strict dynamic freshness and preserved raw observer/errors/status.

This audit wrote only `resume-architecture/resume2/report-static-assets-review/`. It used light file/hash/ZIP/source reads; no harness/collector/helper import or execution, native/mock/test/Gradle/Java/Node/Helm/Docker/Git/provider command or process signal occurred. No current source, plan, helper, harness, receipt, old evidence or flags were edited. Shared declared ceilingUSD500, actual spend unavailable.

## Independent closed counterexample

Actual closed tasked collector `obs011-diag-start1-full01-results.json`, SHA `9b991d479cbe6176a4631c43abcc28f1c14f2e7f3d2d269e920c40b44013babe`, records108/108PASS, native/collector exit0, started02:41:40.783774Z and collector terminal03:45:37.988260Z. Its12 HTML archive artifacts consist of six current-run dynamic index/package/class pages and six inherited static resources. I independently verified every archived byte/hash/size/mtime and matched the static bytes to actual local dependency JAR entries:

| Exact relative test-report asset | Resource SHA256 | Producer entry |
|---|---|---|
| `css/base-style.css` | `a10a4ef75ca2601b44bfdaf3112a5854f6376f68d7cbaf6958286f04488d293b` | Gradle8.10.2 `gradle-core`, `org/gradle/reporting/base-style.css` |
| `css/style.css` | `61866908fd7eb09c79e96239f69db2e8cc5c6526cdb308eba0535ed2a0f6a263` | Gradle8.10.2 `gradle-testing-base`, `org/gradle/api/internal/tasks/testing/report/style.css` |
| `js/report.js` | `fc89c6d002d18f4662065c9887b2cda8f8486f2737d4ad0f2fdeac0ad58a44dc` | Gradle8.10.2 `gradle-core`, `org/gradle/reporting/report.js` |

Each occurs once per test/guidedIncrementalTest report. Default static mtimes are2026-10-15 around00:36Z; incremental around17:40Z, all earlier than this Oct19 run. All six dynamic HTML pages are inside the actual run. The corresponding two XML, two exec,546 public cohort artifacts and one global guard tally independently match archived hashes/sizes/mtime facts and are within the run. This supports the static/dynamic distinction for those exact artifacts; it does not convert the focused diagnostic into a full native regression or coverage gate.

The actual Gradle JAR hashes are `7324a13de64df67259cb95de18c0a79a5b51acec020f5ee1f3a3474446522637` (core) and `0cf59ddbd7503ca6979ee871d7eeef7553535b3ad3f8897f90f3a8e73f0fb6ad` (testing-base). The local JaCoCo0.8.12 report JAR SHA is `f9c79ad66a66a0337c57849ad1287a2ab23b9b232d35314443e5ec49e6e3d20f`. `proposed-static-resource-catalog.json` binds exact paths, dependency paths/JAR hashes, resource entries/hashes/sizes and explicit no-case/no-coverage-credit classifications: three Gradle resources plus20 JaCoCo resources. No class files or active HTML/XML are cataloged.

Quinn's existing closed assessment `qa/diag-start1-terminal/assessment.md` explicitly treated these six CSS/JS files as inherited hash-verified assets and gave them no fresh-case credit. The independent counterexample agrees with that qualification. The outer diagnostic remains TERMINAL_INCOMPLETE_OBSERVATION; its original failure cause and T0/full-check debt are not resolved by this audit.

## Exact false-rejection paths

The immutable collector `run-backend-tasked.py` first requires a fresh task report **index**. It then archives all files in the report directory with `shutil.copy2` and returns destination facts; copy2 preserves the original source mtime. Thus its `testHtmlFiles` intentionally includes ordinary unchanged CSS/JS and fresh active pages. Inherited static timestamps are not evidence that testcase output is stale. This is also why a fresh copy's time cannot prove dynamic coverage freshness.

`fullcheck-harness/resume3/harness.py` (`a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae`) loops every member of `testHtmlFiles` alongside XML/exec/cohort/guard artifacts in `assess_and_archive`; each old static mtime appends `TASK_ARCHIVE_ORIGINAL_NOT_FRESH`. That feeds evidenceErrors→evidenceComplete=false→fullGateSucceeded=false even when the dynamic/native evidence for a requirement is valid. Applying that exact condition to the closed diagnostic produces six false freshness failures. This branch was not identified in my earlier ownership-focused exact-diff review; its blanket all-HTML-archive freshness interpretation was too broad. That earlier review and all run artifacts remain unchanged historical evidence.

The same function initially tests original JaCoCo XML mtime and internal sessions **correctly**, contingent on actual task execution. It then inventories every file beneath the original report directory and requires all mtimes within the run. Any retained pinned CSS/JS/image resource makes that `all(...)` false, resets `report_info['fresh']=False`, sets reportDirectoryContainsStaleArtifacts and emits `GENUINELY_FRESH_MERGED_COVERAGE_NOT_PROVEN`, even if the actual XML/sessions/active report outputs were genuinely fresh. This is a conditional source-level false-rejection path; it does not establish that03 has executed coverage or has fresh XML.

The same overbroad rule occurs in `gsm-b-draft/resume2/validate_collector.py`: all testHtmlFiles must have current-run mtime or it raises ARCHIVE_HASH_SIZE_OR_ORIGINAL_FRESHNESS_INVALID before completing otherwise valid case assessment. Its separate required-exec-task issue is Quinn's GSMb finding, not widened or fixed by this audit.

## Current original-report observations are not a closed03 outcome

Read-only inspection found20 original `html/jacoco-resources` files matching the20 exact JaCoCo JAR resources, all with mtimes before03 started. The receipt read for context still said RUNNING and carried the sticky ownedIdentityObservationGap. I only recorded metadata/hash/resource identity; no live report was copied or labeled closed proof. Those resources could be regenerated or retained later. The findings prove the validator's faulty condition, not a prediction of the native result, coverage execution, future timestamps or cleanup completion.

No statement here permits arbitrary old report files. Active test HTML/index/package/class output, active JaCoCo HTML/source/session pages, original XML, exec provenance and internal JaCoCo sessions remain strict. A stale old B1 coverage XML still gets zero fresh credit regardless of inherited stylesheet identity. A copied mtime still confers none.

## Concrete bounded same-execution remedy

`post-terminal-protocol.md` gives the proposed executable-by-root/QA sequence, with no new test invocation: actual native/owned-JVM termination; continuing source/output hold before any build; hash-bound immutable original references; full native three-partition/case/nine-skip/cohort/task proof; original dynamic XML/HTML/exec and coverage internal-session freshness; exact dependency+entry+path+hash resource classification; exclusive fresh supplemental archive with original before/after/hash/mtime/mode facts; and independent native/coverage/observer dispositions.

It explicitly preserves the existing two-way merged coverage wiring (test + guidedIncrementalTest), while requiring fresh crossReplica exec separately. It exports only existing public collector/report artifacts or value-free metadata, never private scratch/cohort payload. Unknown or changed resources cannot enter by suffix. Source membership/baseline/exclusions are not changed. Native failures, missing coverage, stale dynamic pages/sessions, incomplete cohorts and genuine observer gaps retain independent force.

**Required next disposition:** Quinn independently reviews this exact catalog/protocol, root adopts only a bounded post-terminal independent assessment after actual original run termination and output hold, and that assessment reports raw harness result and every genuine qualification unchanged. No live script repair, error clearing, old-receipt rewrite, automatic retry, retroactive original-harness green result, W1 opening or lane/story/QA credit is inferred. If the native requirements or completeness remain unproved, they remain unproved; a static-resource fix cannot substitute for them.
