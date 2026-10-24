---
name: replayit-test001-prep
description: OBS-011 11-IT-R prep (2026-10-18) - why ReplayIT tests fail alone (audit vacuity controls, Order 1 fixtures), 95-sleep classification, apply plan location
metadata:
  type: project
---

Prep output is in `docs/qa/evidence/STUDIO-OBS-011/t0/early/11-IT-R/` (`sleep-table.tsv`, `it-r-prep.json`), cut against ReplayIT sha `b8b10df4`.

- **Census:** 95 `.sleep(` = 74 POLL + 21 DELIBERATE. Batches B1 15, B2 23, B3 24, B4 12. Converting POLL sleeps will not change wall time (5-100 ms intervals).
- **P7 pair cannot pass alone** because `scanCompleteAuditStream` (C5Capture.close, AfterAll, Order 39) asserts non-empty `AUDIT_CANARIES` plus admitted and dispatched events. Only Order 9 registers canaries in the `test` lane, so every C5Capture case and every subset run fails at class level. This is not a field read.
- **Order 2/3** read `publishedTestId` and `currentPublished*`, which Order 1 sets. **Orders 4-9** rely on Order 1's `startWorkers()` and the `CSI-123` rows. **Order 1** reads absolute `NAVIGATIONS`/`RECEIPTS`/`VALUES`, so it must run first.
- `SINGLETON_METHODS` minus `INCREMENTAL_METHODS` equals build.gradle.kts `joinedDefaultMethods` (46 names). Use that for a "whole lane ran" test; a new `@Test` needs both lists.
- Awaitility API check without a JVM: `python3 -I` + `zipfile`, scan the class constant pool in the jar under `~/.gradle/caches/modules-2/files-2.1/org.awaitility`.

**Why:** the apply phase (W3) is timeboxed to 6 full-class runs, so the design decisions were made up front.

**How to apply:** start from `it-r-prep.json` `test001.fixes` (D1-D6) and `applyPlan`. Re-check the sha first. Related: [[tooling-replayit-diagnostics]], [[tooling-replayit-patch-and-lint]], [[project-replayit-s2-single-use]].
