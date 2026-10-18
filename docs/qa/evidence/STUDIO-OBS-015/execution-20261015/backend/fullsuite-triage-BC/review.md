# STUDIO-OBS-015 full-suite triage, clusters B and C

Source run: `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/final-w02-full-test04-xml/` (2412 tests, 127 failed).
Verified = read from XML or source. Inferred = reasoned, not executed. No Gradle was run (another dev owns it).

## Cluster B: BadSqlGrammarException on studio_guided_policies (23 = 19 + 3 + 1)

Verified root cause: `PSQLException: relation "studio_guided_policies" does not exist` (Position 78).
Table is created by `backend/src/main/resources/db/migration/V19__guided_governance.sql:58`.

Chain: test -> `GuidedPublicationMigrationTest.publishObserved/prepareObserved` (:1278/:1317/:1360)
-> `prepare` :1429 -> `GuidedPublicationEvidenceFixture.freezeSource` :54 (non-historical)
-> `ObservationPolicyRepository.active` :134. The head fixture reads the V19 policy tables first.

The three classes migrate their private DB only to Flyway target 18, then call the head writer:
- `scheduling/StudioSchedulingSchemaIT.java:118` `migrate("18")`; fixture call :551 (19 tests)
- `RevisionMigrationIT.java:81` `.target("18")`; `publish` :293 (3 tests)
- `authoring/StudioAuthoringMigrationIT.java:56` `flyway("18")`; prepareObserved :90 (1 test)

Their own javadocs say "V18 head" / "deployed head". That was true at the OBS-012A re-baseline; V19-V21
(governance, recording, replaying-prefix) were added after. `GuidedPublicationEvidenceFixture.requireV18`
(:311) refuses the head writer on V18 by design.

Classification: TEST SETUP DRIFT. Not a production defect, not obsolete. Assertions are about
revision immutability, authoring capture and scheduling history, all still meaningful on the single path.

Fix (no assertion touched): target `latest` instead of 18, and "V18 head" -> "current head" in the comments.
Alternative rejected: the historical V18 adapter (`publishHistoricalV18Observed`) has no existing-test
variant (needed by StudioAuthoringMigrationIT) and its javadoc claims no current-runtime compatibility.
Inferred, unrun: V19-V21 touch only guided tables, the publication guard functions and
`studio_guided_*` constraints; `ui_test_revisions` trigger messages ("immutable", `uq_observed_revision_*`)
are unchanged in V12/V15. `InferenceMigrationLatestIT` (9/9) already runs `publishObserved` on the head.
Residual risk: a head-only failure inside these three classes is possible and cannot be ruled out without a run.

## Cluster C: JpaSystemException "select u1_0.id ..." (11 = 5 + 3 + 2 + 1)

Verified root cause: `PSQLException ... SQLState 25006: cannot execute SELECT FOR NO KEY UPDATE in a read-only transaction`.
All 11 fail at `StudioService.findAuthoringV2ById` (:340) -> `readAuthoringDraft` (:293) -> `StudioRepository.findByIdForUpdate`
(`@Lock(PESSIMISTIC_WRITE)`, StudioRepository.java:55-57).
Failing callers: StudioAuthoringRevisionTest:78 (setUp, 5), StudioAuthoringPersistenceIT:60/93/106 (3),
StudioScheduleApiIT:451 and :976 (2), RevisionRetentionIT:144 (1).

Mechanism: `StudioService` is `@Transactional(readOnly = true)` at class level (:53). `readAuthoringDraft` is
`@Transactional` read-write (:290), but `findAuthoringV2ById` (:339, un-annotated, so read-only) calls it on
`this`. A same-class call skips the proxy, so the read-write annotation is ignored and the row lock runs in
the read-only transaction. The controller path (`StudioController.java:77` calls `readAuthoringDraft` through
the proxy) is unaffected. At HEAD, `findAuthoringV2ById` used `findById` with no lock; the uncommitted
single-path rewrite made it delegate to the locking reader.

Classification: PRODUCTION DEFECT (latent: only tests call `findAuthoringV2ById` today; grep of src/main finds no other caller).

Fix: annotate `findAuthoringV2ById` `@Transactional` (read-write), one line plus javadoc. It keeps one read path
for authoring. Flag, not decided: a GET-style read now takes a write lock (pre-existing in `readAuthoringDraft`
at HEAD:326); if the owner wants a non-locking read, `findAuthoringV2ById` could use `findById` + `authoringDraft(test)` instead.
Inferred, unrun: the 11 tests fail in setup/first call, so later assertions in them have not been exercised in this run.

## Retirement flags (not decided)
- `GuidedPublicationEvidenceFixture` historical V18 adapter (`freezeHistoricalV18Source`, `requireV18`,
  `GuidedPublicationMigrationTest.commitHistoricalV18`/`publishHistoricalV18Observed`) is a second, legacy
  fixture path used by `InferenceMigrationIT`; project memory says Studio is single-path/no-compat. Owner decision.

## Patch
`fix.patch`: 4 files, 7 hunks, `git apply --check -p0` passes from repo root against the base hashes in `manifest.json`.
