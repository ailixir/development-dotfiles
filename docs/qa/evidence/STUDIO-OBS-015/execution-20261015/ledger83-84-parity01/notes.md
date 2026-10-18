# Ledger 83/84: Java + TS comparator tie parity (Dex-T, 2026-10-16)

Subjects: validation ledger rows 83/84 = ARCH03 `test-delta.json` additionalApplicationCases[5]
(`GuidedRecordingTimingsTest.distinctAdmissionsWithIdenticalMeasuredKeysRemainDistinct`) and [6]
(`GuidedRecordingTimingsTest.tieEndSelectionAndUnicodeOrderMatchRunner`); pregate GB-1.
Labels: [V] = I ran it or read it; [I] = inferred.

## Result

There is a real divergence for inputs that the schema allows. The runner was the side that differed from the contract, so the runner is fixed (production change below). Java production code is unchanged.
The patch is `parity.patch` (`git apply --check -p0` passes against the live tree). Nothing was written under backend/, studio-runner/, docs/specs/, tools/, frontend/ or .github/.

## 1. Java comparator and tests

- Comparator [V]: `backend/src/main/java/com/citi/put/checks/studio/guided/evidence/GuidedRecordingTimings.java:148-170`.
  `ORDER` sorts by (startMs, kind rank, ordinal null-first, stepId code point, admissionId null-first code point).
  `codePoints` walks the strings with `codePointAt`. `acceptAndDerive` (l.93-95) requires the list to be strictly increasing under `ORDER`.
- Existing methods [V]: `stepIdTiesBreakInCodePointOrder` (l.151),
  `equalMeasuredAttemptCoordinatesUseAdmissionIdentityWithoutChangingReadings` (l.160),
  `admissionTieBreakIsScalarAndNeverCreatesAnAbsentPreNativeReading` (l.183),
  `endMsIsTakenFromTheActionWithTheGreatestStartNotTheLargestEnd` (l.83), `refusesEveryRuledSemanticViolation` (l.102).
  The ledger's planned names did not exist. The patch adds both, and both are driven by the shared vector.
- Why these tests never ran [V]: Gradle does not exclude them. `tasks.withType<Test>` includes `**/*Test.class`, the only
  exclusion is `SseCrossReplicaIT`, and `guidedIncrementalTest` is limited to `GuidedPublicationReplayIT` methods. The cause is that
  every recorded 015 backend run used narrow `--tests` selectors, and none of them named this class. Evidence grep: the
  selectors in the 015 evidence are migration, secret, publication-IT and bridge classes. `backend/build/test-results/test`
  holds only `GuidedPublicationAuthorityIT` and `GuidedPublicationReplayIT` XML.
- Lane and selector: `cd backend && ./gradlew test --tests 'com.citi.put.checks.studio.guided.evidence.GuidedRecordingTimingsTest'`.
  It is a pure unit class with no Spring context and no database. It is also part of any unfiltered `test` run, and
  therefore part of `check` and `requireFreshGuidedPartitions`. The final run must name it explicitly if it uses `--tests`.
  The vector path is `../docs/...`, relative to `backend/`, which is the Gradle test working directory. This is the same idiom
  `GuidedWireContractTest` uses.

## 2. TS comparator

`studio-runner/src/guided/evidence.ts:139-144` `wireTimings` [V]. It sorts by startMs, ordinal, stepId, admissionId. Both
identifiers were compared with JS `<`, which is UTF-16 code-unit order. The runner sends `kind: action` items only, so the
kind key is constant. This matches ruling T1: "runner effective tuple startMs, ordinal, stepId, admissionId".

## 3. Contract and divergence

- Contract [V]: `architecture-correction-03/ruling.md` T1 (l.70) says: "admissionId as the FINAL scalar/code-point tie-break ...
  Use the same scalar comparator in Java and runner TS; avoid locale sorting or UTF-16 ordering for non-ASCII
  identifiers." The Java Javadoc (l.143-147) says the same. The runner's UTF-16 compare differs from the contract.
- The schema does not restrict these identifiers to ASCII [V]:
  - `action-timing.schema.json` `stepId` and `admissionId` are `string`, minLength 1, maxLength 256, with no pattern.
  - The same holds for `ledger.schema.json` (coordinate.stepId, admission.admissionId), `commands.schema.json` advance.admissionId and
    `session.schema.json` sourceSteps[].stepId.
  - The DB columns are `varchar(256)` with no character check (`V14__guided_sessions.sql:24-27`).
  - So divergence cannot be ruled out from the schema. Example: U+FFFD < U+1F600 in code point order, but U+1F600 < U+FFFD in UTF-16
    order, because the high surrogate D83D is below FFFD.
- Can current production data reach it?
  - [V] admissionId is minted as `UUID.randomUUID()` (`GuidedActionLedger.java:48`).
  - [V] Publication requires `sourceSteps[i].stepId == authoring step.id().toString()`, a UUID (`GuidedSnapshotDeriver.java:28`).
  - [I] The guided session copies those sourceSteps (`GuidedSessionService.java:684`), so current minting is ASCII only and the
    divergence is latent.
- Consequence if it were reached [V by test, mutation and red run]: the runner would send the astral tie in UTF-16 order. Java's
  strict-order check then refuses the whole `recording-evidence` timings list with 422 INVALID_CONTRACT (vector refused case
  `astralTieInUtf16CodeUnitOrder`). I did not trace the downstream session effect [I].

## 4. Changes (parity.patch)

| File | Change |
|---|---|
| `studio-runner/src/guided/evidence.ts` | **Production change.** New private `compareCodePoints`, which mirrors Java `codePoints` and steps 2 code units past an astral code point. `wireTimings` now uses it for stepId and admissionId. Rounding, keys and wire fields are unchanged. |
| `docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json` | **New shared vector** (ASCII-escaped JSON): 5 cases (ledgerRow 83: 1, 84: 4), each with readings → wire → accepted (derived steps), plus `utf16CodeUnitOrder` where that order differs; 8 refused bodies with `refusedLedger`. No vector existed before (searched `contracts/v3`). The expected values come from an independent Python oracle, because Python `str` order is code point order. |
| `studio-runner/test/guided/evidence.test.ts` | 3 tests: the two planned names, plus an end-to-end equal-clock astral tie through `GuidedSessionRecording.settle`. That test checks no +1 ms, `endMs` null, `never-started` dispatched but without `begin()` stays absent, and the bridge schema is valid. |
| `backend/.../GuidedRecordingTimingsTest.java` | The two planned methods, driven by the vector. They check exact accepted output against the vector (six fields, readings unchanged), that `ORDER` rebuilds the wire from the reading order, that the reversed wire is refused, that unmeasured admissions stay absent, that each refused body gets INVALID_CONTRACT, and the kind order. Existing methods are unchanged. Added lines are formatted with google-java-format 1.22.0 (`--lines`). |
| `docs/specs/studio-observed-authoring/contracts/README.md` | Lists the new vector in "Fixtures and vectors". |

## Runs (isolated: `scratchpad/iso`, a copy of studio-runner without node_modules plus a read-only node_modules symlink; Node 23.10.0, vitest 3.2.7, `--coverage.enabled=false`)

- RED, before the evidence.ts fix [V]: `test/guided/evidence.test.ts` gave 21 passed and 2 failed. The failures were `tieEndSelectionAndUnicodeOrderMatchRunner` and
  the end-to-end astral test: the runner emitted [U+1F600, U+FFFD]. The row-83 ASCII case passed.
- GREEN after the fix [V]: `test/guided/evidence.test.ts` 23/23. `test/guided` 9 files and 141 tests passed. eslint on both files: exit 0. `tsc -p tsconfig.json --noEmit`: exit 0.
- Full unit tier in the isolated copy [V]: 102 files passed, 2 failed, 1 skipped, 2209 tests passed. The 2 failing files are `test/pins.test.ts` (3 tests) and
  `test/disclosure.test.ts` (it needs `docs/runbooks/`, which is not copied). Both fail the same way with the patch reverted, so they are environment failures of the copy, not regressions.
- Java [V]: JDK 21.0.10 javac/java in the scratch dir, with Gradle-cache jars (jackson 2.17.2, junit 5.10.3/1.10.3, assertj 3.25.3,
  spring-jdbc 6.1.14 so `GuidedRecordingSeed` compiles). It was compiled against the live, unmodified `GuidedRecordingTimings.java` and run with
  working dir `iso/backend`. Result: `GuidedRecordingTimingsTest` 11/11 passed, including both new methods.
- Java mutation [V]: replacing `codePoints` with `String::compareTo` (UTF-16) makes 4 tests fail, including both new methods. The
  vector catches the difference.
- I did **not** run Gradle, `check`, spotless, checkstyle, the contracts checker or a repository build, as the hard rule requires.

## Open items for the final run

- Run the Gradle selector above and the runner `test/guided/evidence.test.ts` (or the full `npm test`) after applying the patch.
- Spotless issue that predates this patch [V]: google-java-format 1.22.0 `-n` already flags the live `GuidedRecordingTimingsTest.java`
  (015 methods, l.158-198) and `GuidedRecordingTimings.java` (ORDER Javadoc/l.145-146 and l.154). The patch's own lines conform. `spotlessCheck` will
  still flag both files until someone runs `spotlessApply`. This patch does not fix it because it is outside these ledger rows.
- Kind-rank, null-first and derived-step ordering are backend-only, because the runner never sends step or reserved kinds. The Java half covers them.
