---
name: studio-schema-consolidation
description: Studio re-baselined (012A) into frozen V12–V18; forward-only V19+ (head V22 on 2026-10-17); where every Flyway head pin lives (three grep forms plus a delta pin)
metadata:
  type: project
---

UI Studio keeps one authoring path (observed/guided) with no backward compatibility. The pending Option A/B choice was settled as a re-baseline: 012A rewrote the Studio migrations into V12–V18 on top of untouched core V1–V11. Those files are now frozen (byte-identical, verified by shasum). Forward-only resumed with V19__guided_governance and V20__guided_session_recording, authored as one unit (RK-5 out-of-order risk).

**Why:** the product is pre-GA with no production guided data, and validate-on-migrate is on. RK-15: any persistent DB that applied the deleted cutover V19__studio_inference_candidate_identity fails validate and must be recreated.

**How to apply:** never edit V1–V18. Head is V22 (OBS-008 A1, execution_replay_failure) as of 2026-10-17; next DDL is V23+. Head pins come in three forms, and a grep for `"NN"` misses the integer one:
- String pins: InferenceMigrationLatestIT (max plus the description list), ErrorCodeConstraintMigrationIT HEAD, GuidedGovernance/Recording/ReplayingPrefix MigrationIT, GuidedPublicationMigrationTest (version list).
- Integer `isEqualTo(NN)` pins: GuidedSecretLoginMigrationTest (max and `> NN`) and support/LegacyV20ConfirmedBaseFixture.assertPreservedAtHead.
- Six `.target("NN")` "at head" sites in Guided* ITs. They stay green but stop short of the new migration. Bump them with the head.
- Gotcha: GuidedBridgeIntegrationTest, GuidedBridgePlannedIT, GuidedDefaultModelReservationIT and GuidedPlanningIntegrationTest live under guided/bridge and guided/translation but declare package `guided.session`. A Gradle `--tests` filter must use that package; a wrong name silently matches nothing.

- Delta pin (added 2026-10-18, OBS-009 DE): guided/secret/GuidedRuntimeRolePrivilegeIT pins every relation/column V19..head creates and the exact runtime grant. Any V23+ that adds a relation, a column on an older table, or changes a function body's table access fails it until its maps, PREPARED_GRANT and docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/runtime-role-grants-v19-v22.sql move together.

Grep all three forms, and update the delta pin, before a new V and move them together. See [[studio-migration-head-testing]].
