# STUDIO-OBS-015 B3a source01 (Dex-AUTH): apply-ready patch, not applied

Written 2026-10-15 local / 2026-10-16T03:01Z. Another developer had a live backend Gradle validation run, so nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/` was modified, and Gradle was not run. The only writes are in this folder.

## What it is

- `b3a.patch` adds two `@Test` methods and five static helpers to `GuidedPublicationAuthorityIT`, exactly as in `b3abc-design01/design.md` §2.1–2.3 (B3A-1 `offeredBasisOriginalPointersRequireStoredPrivatePreimageAtCurrentCommit`, B3A-2 `offeredBasisFromAnotherStoredSessionCannotBorrowItsAuthority`).
- The patch only adds lines: 0 removed, 425 added, one hunk, inserted before the class's closing brace. Every existing member is byte-preserved.
- Invocations go from 24 to 26: four `@Test` (two existing, two new), plus 9 + 9 + 4 parameterized. Lane: default `test`. AuthorityIT is not a JOIN class, so there is no build or registration change.
- Base: `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorityIT.java` sha256 `e6228117d0e9844075603c3b011166ddffb74ddb4533d4524111bd5a665bb9fd`. That is the same base the design names.
- Result: `work/GuidedPublicationAuthorityIT.java` sha256 `a0dd022dbb3cee409ef0aaac793de311ab4c05f7f772ff35df13d64a28363acc`.
- Apply from the repo root with `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b3a-source01/b3a.patch` or `patch -p0 < …/b3a.patch`. Selector: `test --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorityIT`.

## What I ran, and what it returned (pre-checks, not proof)

| Check | Result |
|---|---|
| `git apply --check -p0` and `patch -p0 --dry-run` against the live tree | both OK |
| Patch applied to a scratch copy of the base | sha256 equals the work copy (`a0dd022d…`) |
| `javac -proc:none` of the patched file (classpath: `backend/build/classes/java/{main,test}` built at 15:09 local, newer than every source read; prior-lane `maincp.txt`; test jars from the gradle cache) | compiles. The unpatched base also compiles the same way (control). |
| google-java-format 1.22.0 CLI (`--skip-reflowing-long-strings`, same version as spotless) | The new region is gjf-stable: the last 427 lines are identical after formatting, and no new line exceeds 100 columns. |

The **original file is not gjf-clean**: 230 lines differ under gjf, and 59 lines exceed checkstyle's 120 columns. Spotless or checkstyle on this file therefore fails before and after the patch, for reasons that predate it. I did not run `spotlessApply` (the IDE hook reformats the whole file).

**Not run:** Gradle, the tests themselves, spotless or checkstyle tasks, CodeRabbit.

## Deviations from the design text (formatting only, same behaviour)

- gjf layout. Braces were added to the design's brace-less `for` loops and to the one-line `try`/`catch`.
- The design's `String id=…, key=…, digest=…` declaration is split into three statements. `verdict.set(…); verdict.set(…);` is split onto two lines.
- The design's inline `Grant` is now a local variable (`grant`). Comments were shortened to fit 100 columns.
- A tier-disclosure comment was added above the helpers (authority-tier-ruling01). It says the parent's actions, preparations and materialization rows are inserted by the shared relational fixture, and that the verdict and grant are built by the test. So this is relational-tier evidence with controlled inputs. It is not runner-validator, Core, HTTP or native proof, and per ruling T3 it does not earn production-written "private authority" credit. The writer, the stored reader (`GuidedPublicationEvidenceRepository.read`) and every refusal are production code at real head PostgreSQL.

## Assertion → ledger (plannedName / tier verbatim)

| Assertion (label) | Expected | Ledger idx0 → plannedName (tier) |
|---|---|---|
| B3A-1 `positive-0` and `positive-1..3` parity | `COMMITTED` (rolled back), 1 stored read, all rows/triggers unchanged | positive control for 31/52/60 |
| B3A-1 `wrong-private-input-hash` (`/basis/materializationEvidence/entries/0/inputHash`) | STORED: lowerer accepts, `PUBLICATION_CONFLICT`, +1 read | 52 `IncrementalValidationBasisTest.reconstructsPrivateInputsBeforePublicEvidence` (Java+runner canonical+Postgres): "mutate … entry hash … reject"; route 6 |
| B3A-1 `immutable-source-manifest-hash-is-exact` (`/basis/sourceManifestHash`) | STORED | 60 `IncrementalPublicationIT.snapshotFactsMatchImmutableOriginalSourceManifest` (HTTP+Postgres): "SourceManifestHash preimage …"; route 3 |
| B3A-1 `immutable-original-source-cannot-be-replaced` (`/basis/snapshotEvidence/current/authoring/steps/2/context/entries/1/value`) | STORED | 60 (same): "attempted context … tamper … fails"; 31 "wrong snapshot value"; route 1 |
| B3A-2 three `isNotEqualTo` checks on the bases' csiId, testId and sessionId | foreign and own stored bases differ in CSI, test and session | 31 `IncrementalPublicationIT.mergedProofCannotReuseOldAdmissionsOrForeignSnapshots` (Java + Postgres + pure runner validator): "cross-CSI/test reuse" precondition |
| B3A-2 (1) `foreign-session-basis` | `EVIDENCE_MISMATCH`, 0 reads (writer `verifyCandidate` base join; `runAuthorizationHash`) | 31: "cross-CSI/test reuse … refused" |
| B3A-2 (2) `foreign-session-resealed-authorization` | lowerer-pure (same code, 0 reads) **or** STORED (`PUBLICATION_CONFLICT`, +1 read); never `COMMITTED` | 31: same |
| B3A-2 (3) `foreign-admission-substitution` (the foreign admission is asserted to be an actual SUCCEEDED row of session `b3a-foreign-a`) | same oracle as (2) | 31: "base admission substitution … refused" |
| B3A-2 `positive-b`, `positive-b-after` | `COMMITTED` (rolled back), rows/triggers unchanged | positive control |

At this tier the controlled verdict stands in for the ledger's runner validator, and HTTP is not exercised (design §7). Ledger 42 (alias/HTTP) is not touched by B3a; it belongs to B3B-1.

## APIs and stages I was unsure about

All APIs called were read in current source, and javac resolved them. That covers the package-private `GuidedPublicationRepository(JdbcTemplate, GuidedContracts, Supplier<GuidedPublicationEvidenceRepository>)` constructor; `reserve`, `claim`, `finish` and `commit`; the `PublicationContracts.{Claim,Commit,Grant,Snapshot,Candidate,AttemptStatus}` types; `time` and `millisecond`; `ObservedArtifactLowerer.lower(JsonNode, JsonNode)`; and on `MigrationTest.Database` the `tx`, `jdbc`, `evidence`, `capture()`, `finalizing()`, `snapshot(Base)` and `fixtureSession()` members, plus `currentProfile()` and `observedBuild(JsonNode)`. The open items are runtime behaviour, not signatures.

1. **R-STAGE (B3A-1 STORED pins) is predicted.** I checked that the lowerer copies `sourceHash`, `configurationHash` and `authoringHash` from the basis top level instead of recomputing them (ObservedArtifactLowerer 39–41, 123–125). I also checked that `GuidedSnapshotDeriver.apply` compares only step id and text against `sourceSteps` (lines 25–31). So the design's prediction is plausible. If a label lands elsewhere, the test fails at the `STORED` assertion and that label is OPEN. Do not re-point it.
2. **The helper is stricter than the design prose.** The design prose (§2.3) says (2) and (3) "can be pure or stored". The design's `b3aRefused` code, implemented verbatim, accepts only a lowerer-pure refusal or a stored `PUBLICATION_CONFLICT`. A writer-only refusal would therefore *fail* the test instead of being recorded, for example `verifyCandidate` `EVIDENCE_MISMATCH` with the lowerer accepting and 0 reads. I left the code as designed. Aria or Quinn should decide whether that outcome counts as OPEN or as a helper change.
3. **R-A2 (foreign CSI) has not been exercised at runtime.** `csi_systems.id` is varchar(20), and `CSI-B3A-FOREIGN` is 15 characters. The shared constructor uses `csiId` consistently for `csi_systems`, `ui_tests`, scope and `replayRequirements` (MigrationTest 203–257), and `bases.capture` requires `ui_tests.csi_id == scope.csiId`. Fallback, per design: change only `foreignCanonical` back to the canonical CSI. Cross-CSI then stays OPEN at the relational tier. No fixture edit.
4. **Time budget.** Every staged commit needs the session lease, which `finalizing()` sets to now+120s, and `expiresAt`, which is now+600s. B3A-1 runs 7 staged commits plus 8 whole-schema `privateAuthoritySnapshot` reads after `finalizing()`. Each staged identity takes a fresh 12 s deadline from `b3aReseal`. I don't know the actual runtime.
5. The ledger index base is 0 (`.acceptanceCases[31|42|52|60]`), and it matches the design manifest's `ledgerIndex0`.
