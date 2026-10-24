# Unexecuted red/green plan

Preconditions: root reconciles original B1 and fresh B7, signs T0/tree-open and the CLN-F2 V20 grep ruling; owner hands over exactly these five files, with current SHA equality to manifest.json. Preserve migrations and every backend/src/main byte through the unchanged-main GS-T gate. All source application and backend commands use the execute-008 shared Gradle lock. Compile and formatter operations await tree-open and root coordination; neither was run by this draft author.

Apply left-data-draft.patch atomically inside one root-held lock, verify before hashes, compileTestJava, and format only the owned changed Java paths via the repository's approved formatter workflow. Record new after hashes and prove untouched migrations, fixture importers and all unowned paths. Publication helper's new private callback defaults to a no-op for every public caller. Do not add any configuration key, dependency or change the validation deadline12s, owner lease120s, session deadline600s, native cleanup/privacy guards or known protected symbols.

Each red run below starts from the compiled/formatted five-file candidate, applies exactly one named mutant under one uninterrupted lock, archives collector evidence, restores exact pre-mutant bytes in a finally/trap action (including on failure), verifies the restored hash, then runs the same subject green. No production or migration mutation persists. P1/P2/P3 patch only test-controlled transaction-local DDL; J1/J2 patch production code temporarily and cannot run before unchanged-main GS-T evidence is closed. Baseline/start and before/after source SHA captures are mandatory; a collector stability mismatch caused by leaving a mutant installed is not a red result. A red is a named new assertion failure only, never compiler/dependency/native/infrastructure failure or no tests found. Record actual JUnit failure line, message and class; audit P3's possible independent relational refusal and J1's possible independent SQL refusal as disclosed in mutants/manifest.json.

| Mutant patch | Required red subject |
|---|---|
|mutants/P1-metadata-guard-noop.patch|InferenceMigrationLatestIT.reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot; expected wrong snapshot rejection stops occurring|
|mutants/P2-drop-full-baseline-index.patch|InferenceMigrationLatestIT.historicalExecutionCannotBeRelabelledAsFullEvidence; expected index count1 reads0|
|mutants/P3-receipt-hash-conjunct.patch|GuidedReplayingPrefixMigrationIT.publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys; new wrongHash shape assertion fails|
|mutants/J1-omit-verdict-basis-check.patch|GuidedPublicationMigrationTest.validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry; new badVerdict EVIDENCE_MISMATCH assertion fails|
|mutants/J2-omit-deleted-draft-cas.patch|GuidedPublicationMigrationTest.headCommitRejectsPolicyBasisAuthorityAndDeletedDraftWithoutAnyWrite; post-receipt soft-delete PUBLICATION_CONFLICT assertion fails|

For each mutant reserve a fresh label such as obs011-left-data-mut-p101, and a separate restored-green label such as obs011-left-data-restored-p101 (check label/log absence immediately before run). Expand the table's subject to its full declared package from mutants/manifest.json. Record lsof -nP -iTCP -sTCP:LISTEN before each backend run. Do not run timing-sensitive work concurrently.

The command shape, from repository root, is:

```sh
env PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH" python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-left-data-mut-p101 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.InferenceMigrationLatestIT.reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot' --no-daemon
```

This example is a future command only. Actual mutation/apply/restore and this collector must all be nested within a single outer lock hold; do not acquire the lock recursively. Root must use its existing approved mutation wrapper or a reviewed equivalent with finally restoration, exact hashes and fresh labels, replacing the inner LOCK invocation above with the collector alone. No wrapper was executed or installed here.

After every mutant is red and restored subject green, the prescribed full CLN-F2 command is:

```sh
env PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH" python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-left-01 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.InferenceMigrationLatestIT' --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest' --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationRaceTest' --tests 'com.citi.put.checks.studio.guided.session.GuidedPublicPresentationIT' --tests 'com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT' --no-daemon
```

InferenceMigrationIT is deliberately absent from the filter list. Five complete classes plus compilation cover the prescribed runtime subset and the remaining fixture-importer compilation; this does not independently establish V20/CoRun runtime behavior. Lane commands carry no allowed-skips-file; exact skip policy mismatches are reported as prescribed by v4. Per-name JUnit invocation/count accounting comes from actual collector XML; no runtime counts are predicted here. Later shared full gates and independent QA remain required.

Static-only results are recorded in static-review.json. Outstanding limitations: no compilation, formatter, red/green/mutant execution, PostgreSQL trigger interaction validation, importer runtime proof, runtime timing proof or lane-exit credit; original broad grep-zero requires the named V20 ruling. If actual PostgreSQL constraint ordering or a new assertion differs, route the finding to Dara/root without weakening the rule or touching migrations.
