---
name: wi4b-builder-state
description: ADR-SC-007 WI-4 builder B (aiox-dev-wi4b) 2026-10-27/28 - scratch tree layout, drops, recipes that unblocked the fixtures/ReplayIT reds, open items; read before resuming
metadata:
  type: project
---

Builder B owns joined backend tests + real-Chromium fixtures/perception tests for WI-4 (controller runs aiox-lean; no git; no real-tree edits until "apply").

- Scratch tree `$S/wi4b-tree/{backend,studio-runner,docs}` (S = session scratchpad), copy manifest `$S/wi4b-meta/manifest.copy.sha256`. Drops `$S/wi4-drops/aN` are full A-owned file sets (a9 supersedes a8); overlay with `rsync -a` (dist with --delete), chmod u+w, verify MANIFEST. Mailbox `$S/wi4-mailbox/{A-to-B,B-to-A}.md`.
- Heavy runs: `$S/wi4b-work/lockrun.sh LOG cmd...` (lock + load<8) for vitest; `$S/wi4b-gradle/gr.sh` for Gradle (needs JAVA_HOME, `-x verifyRunnerDist`, `-I xml-collect-b.init.gradle -Dadr007.xml.label=X`; `$S/wi4b-work/xmlsum.py LABEL` summarises xml-b). A stale EMPTY `wi4-heavy.lock` dir (no owner) after a killed session blocks everyone: rmdir it.
- Fixtures config `vitest.b.config.ts` (no globalSetup, top-level files only); perception tier `vitest.perception.config.ts`. Scratch tree lacks docs/qa/evidence dirs: mkdir them or the evidence-writing tests go red (stale-grant, secret-login oracles).
- Gradle `--tests` FQCN uses the Java package: GuidedBridgePlannedIT and GuidedPlanningIntegrationTest are `guided.session`, FocusMutationJoinedIT `guided.translation`.
- Never `patch -p0` the A/WI-3 patch files: headers hold absolute REAL-tree paths. Apply d5-backend.patch edits by python on scratch files (done, backups `$S/wi4b-work/d5`); not part of my merge patch (WI-3.1).
- ReplayIT scripted model must act on `obligation.selectedChoice.ref` after a clarification (ADR D6). C6 observer drops state on `this.dispose()` only when the receiver is the current page-state object (A installs the new state before disposing the old).
- Status 2026-10-28: perception 178+4 rehearsal green; fixtures tier 267/0 on a9 (login-journey re-expressed per Q16; Q16 reasons in `$S/wi4b-work/ac4-reasons-b.json`); Planning/Bridge/Focus green; T-J3 green only with the WI-3.1 backend patch. T-J6 NOT written: prefixProgram cannot change in runtime.update (INPUT_IDENTITY), so a prefix session needs an incremental session fixture from creation (see GuidedReplayingPrefixMigrationIT Fixture / ReplayIT incremental), not feasible in GuidedBridgePlannedIT without a full incremental store setup.
