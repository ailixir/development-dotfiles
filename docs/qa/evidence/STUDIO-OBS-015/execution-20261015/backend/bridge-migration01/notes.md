# STUDIO-OBS-015 bridge-migration01: aria-bridge-ruling01 applied as a patch

Dex-B (@dev), 2026-10-16. This is an apply-ready patch only. No file under `backend/`, `frontend/`,
`studio-runner/`, `tools/`, `docs/specs/` or `.github/` was written. Gradle was not run. Nothing was
committed. All compiles and tool runs wrote to `work/` or to the session scratchpad.
[V] = I ran it or read it. [I] = inference.

## Result

- `bridge.patch` (repo-root-relative, `-p0`). It contains two file diffs:
  - `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java`
    goes from 38 tests to **9**. The 16 MIGRATE and 13 RETIRE methods are removed. The 9 retained
    methods are byte-identical to base [V: segment match]. The §2 comment edit is applied. The dead
    positive `admit` helper is also removed (D4).
  - **New:** `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgePlannedIT.java`
    (package `com.citi.put.checks.studio.guided.session`). It has **16** `@Test` methods with the
    ruling's exact names.
- `git apply --check -p0 -v bridge.patch` against the live tree: **OK** [V]. The reverse check fails,
  so the patch is not already applied [V]. Applying it to a scratch copy of base reproduces
  `work/out/*.java` byte for byte [V].
- Base pinned: the live `GuidedBridgeIntegrationTest.java` sha256 is `d48d4f0d…` at generation time.
  That equals the ruling's subject. The other ruling inputs I re-hashed (planning IT, build.gradle.kts,
  GuidedTranslationService/Store, ProposalValidator, ProductionSessionAccess, DispatchService,
  SessionService) also equal the ruling's manifest [V]. See `manifest.json`.

## Verification actually run

| Check | Result |
|---|---|
| javac (JDK 21.0.10, `-proc:none -parameters`): **fresh compile of all 466 main sources from the live tree**, then the full test tree (329 files) with the two patched files substituted. Classpath = newest Gradle-cache jar per artifact (approximate, not Gradle's exact `testCompileClasspath`). Output in scratchpad only. | base control 0 errors (584 classes); patched 0 errors (587 classes) [V] |
| google-java-format 1.22.0 (`--skip-reflowing-long-strings`, the Spotless version) | both output files are stable: 0-line diff [V]. Base control was **not** gjf-stable: its :2759 comment is 106 chars and gjf wraps it. The ruling's edit replaces that line (D5). |
| checkstyle 10.18.1 with `backend/config/checkstyle/checkstyle.xml` | both files: 0 violations; base control: 0 [V] |
| Ruling §4.5 static guards | G1 grep → **0 lines** in PlannedIT. G2: the only 202 `admissions` post in PlannedIT is `admit(id, association)` with `association.admissionKey`/`.proposal`; the other `admissions` post is the 422 premature probe. G3: **0** `admissions` posts in GuidedBridgeIntegrationTest. G4: `assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION")` is in `@AfterEach` [V]. |
| Runtime (`./gradlew test --tests …`) | **NOT RUN** (Gradle is forbidden in this window). The 9/9 + 16/16 acceptance (ruling §4.6) is still open. |
| CodeRabbit, `npm run lint`/`typecheck`, synapse diagnostics | not run. The change is Java test code only, and the backend gates are gjf, checkstyle and javac (above). |

## Gradle partitioning (build.gradle.kts sha `6a2aba4b…`, read only)

- `tasks.withType<Test>` includes `**/*Test.class` and `**/*IT.class`. The only exclusion is
  `SseCrossReplicaIT`. `forkEvery = 12`. [V :103-122]
- The only partitioned class is `GuidedPublicationReplayIT`: its method filters move it between
  `test` and `guidedIncrementalTest`, and the cohort and jacoco checks key on that class name
  (:126-357). [V]
- So `GuidedBridgePlannedIT` lands in the default `test` task with no build change. `check` runs
  `test` (:557). **No build.gradle.kts lines are needed**, and none are in the patch.
- `checkstyleTest` applies to test sources, so the class follows the checkstyle naming rules (D1).
  `spotbugsTest` is disabled (:389-391).

## What the new class does (ruling N1-N9, as applied)

- N1/N2: the class is copied from the base bridge bytes. TEMP prefix is `guided-bridge-planned-` and
  the evidence file is `/tmp/studio-obs015-bridge-planned-worker.json`. Removed: `FixtureAccess`, the
  `bridge_fixture_*` DDL and seed, the manual translation init, and `materializeSession`/`prepareSession`.
- N3/N4: `spring.jpa.hibernate.ddl-auto=none`. The `Application` uses the planning-IT annotations with
  `@Import` limited to the three internal classes. Beans as specified. `sessions` is the planning-IT
  form with the bridge's `governedPolicy()` governance. No coordinator and no reaper.
- N5: static `PROVIDER` (real HTTP), `PROVIDER_KINDS`, `sourcePlan`, `nextSelection`,
  `Selection(occurrence, action)`, `configuredInput`. `providerResponse` follows ruling N5 logic.
- N6: `@BeforeEach` sets `configuredInput` and clears the provider state. It inserts the
  users/csi_systems/ui_tests rows (planning-IT shape) with a per-test `step` UUID, `sourceText()` and
  `[{"name":"config","kind":"plain",…}]` only for #23.
- N7: `createSession` uses the per-test `testId` and revisions "1". `command(id)` is verbatim.
  `plannedSession` calls the real `translation.plan(controller, id, 0, …)` and asserts bootstrap
  `READY` and state `PROPOSING`. Also added: `span`, the reference and plan templates, `stepId`,
  `bindingId`, `input`/`inputId`.
- N8: `reserve` builds a spy on `dispatch` that throws `AssertionError("process-stop")` at
  `prepareAndAdmit(any, eq(id), anyLong, anyString, any)`. A fresh `GuidedTranslationService` uses that
  spy. The real `advance` is called up to 3 times. The test then reads the planner-issued association
  (non-null, `admissionId` null, key `obligation-…`). `admit(id, association)` posts the planner key and
  bytes through the production internal route.
- N9 and §4.3: every positive admit is `admit(id, reserve(id, P))`. #10 races `dispatch.prepareAndAdmit`
  with the association's key and proposal. #27 keeps the premature probe hand-crafted (R-4), uses
  `navigateAssociation.path("proposal")` at the old :1033-1038, and appends the two mounted-file
  assertions and the commands-response `CAPTURE` scan. #5 uses the `ui_tests` row lock and revision
  bumps with restore to 1, and the three direct `allocateBinding` calls against need `order`, asserting
  `bindingId(id,"order")`. #2 uses the `"translation-assignment"` key. #25 adds the generation
  assertion before `active-admission`. #23 uses `input(id, 1)`.

Static support I checked in current source. These are not runtime proof:
- Classifier regions: with no `<var>` token the region is the whole step. With #23's trailing token,
  R0 lies before it [V GuidedSourceClassifier:110-128].
- Post-bootstrap `PROPOSING`: the worker bootstrap callback sets it [V GuidedSessionService:1942].
- Read intent `source` and fill intent `destination` match the testId locator in
  `GuidedProposalValidator.action` [V :330-337] and in `acquisitionAvailable` [V :2364-2385]. Neither
  read nor fill is a guard-grounded or effect kind [V GuidedActionGuard:62-63].
- `attachAdmission` matches on `admission_key` plus `requestDigest`/coordinate, so the planner bytes
  must be posted unchanged [V GuidedTranslationStore:1283-1320].
- #5: re-allocating an existing need with the same consumers returns the existing binding
  [V GuidedBindingStore:54-65].
- The NEXT_ACTION response schema allows `testId` locators, `page` targets, and `authoredLiteral`,
  `binding` and `recipe` operations [V guided-model-response.schema.json].

## Deviations from the ruling text (all mechanical; none touches R-1…R-5)

- **D1 Names (checkstyle MethodName/StaticVariableName/MemberName):** `PLAN`→`sourcePlan`,
  `NEXT`→`nextSelection`, `STEP`→instance `step`, `TEXT()`→`sourceText()`,
  `R0()/R1()`→`destinationReference()/literalReference()`,
  `PLAN_NAV/NAV_LIT/DATAFLOW/CONFIG()`→`planNav/planNavLit/planDataflow/planConfig()`, plus a
  `planTemplate` builder. Loops and ifs got braces (NeedBraces).
- **D2** `bindingId` reads `store.state(id).plan.needs` in `repository.transaction` (as planning IT's
  `command(id)` does), not in `translationTransaction`. It is read-only, so it needs no state gate.
- **D3 Provider handler:** the planning-IT hostile, corrupt and usage branches are dropped (those
  flags do not exist here). A handler exception now returns 500 at once and records
  `PROVIDER_FAULT:<msg>` in `PROVIDER_KINDS`, which the `@AfterEach` subset check reports. The planning
  IT instead leaves the exchange open until the 60 s gateway timeout.
- **D4 Old class:** the dead `admit(String, JsonNode)` helper (base :2873-2881, 202 `admissions`
  post) is also removed. Guard G3 requires it, and no retained method calls it. This conflicts with
  "leave the helpers in place". The guard wins; every other helper stays.
- **D5 :2759 comment:** same words, wrapped onto two `//` lines. One line would be 148 chars, over
  checkstyle LineLength 120, and gjf 1.22 wraps it anyway.
- **D6 #25:** the observation counter is restored to its captured prior value, not the literal `1`
  (R-5: "restore the exact state").
- **D7 #27:** the `ObjectNode context` local is dropped. Its only use became `inputId(id, 0)`.
- **D8 #23:** `input(id, 1)` is taken after `plannedSession`. The planner pushes the context, so the
  manual `pushContext` is gone.
- **D9** Also dropped from the new class as dead code: `proposalByLocator` and `rawBackendPost`. The
  per-test-name flags in `@BeforeEach` (`privacyEcho`, `nativeToggle`, …) stay verbatim. They are all
  false here, and the `/start` fixture is copied unchanged (F-3 debt, OBS-011).
- **D10** `@AfterAll` also stops `PROVIDER`. The ui_tests row is named `Guided bridge`.

## Open points for the runtime window and for Aria

- **O-1 (needs Aria's call, low):** #16 still probes `runner.send("assign", assignment(id),
  "assignment")` because the ruling says "N9 only". Under the planner, the original assignment key is
  `translation-assignment`, so this is now a fresh-key assign after stop, not a replay of the original
  key. Both should refuse `UNKNOWN_OUTCOME` [I]. If the replay meaning matters, apply the same key
  substitution as #2.
- **O-2:** The whole class is unexecuted. The first real run must record the observed post-bootstrap
  state (fallback §4.4: `!FAILED`) and the `studio-runner/dist` digest (OBS-009 AC-12 i). The ruling's
  fallbacks still apply. If `plan()` refuses any template: stop and escalate, do not seed.
- **O-3:** `reserve` runs a full `advance` per action, which adds model and acquisition round trips.
  The #2 timing (wait until `firstLease + 500 ms`, 35 s cap) is measured from after `plannedSession`,
  so the extra latency stays inside the wait [I].
- Disclosure (ruling §5) is unchanged: 13 retired by name, `9 + 16 + 13 = 38`. @po records it.
