# QA source review 01: `ExecutionReferences.declared` fix (STUDIO-OBS-015 R1 cause B)

Reviewer: Quinn (@qa), independent. Date: 2026-10-15. This was a read-only source review. I did not
run Gradle or any test. I edited no source file. This review gives no lifecycle or Done credit.

## Verdict: PASS_WITH_REQUIRED_CHANGES

The defect diagnosis is correct. The fix unblocks the run path, and it is fail-closed, null-safe and
value-free. But it keeps the old two-key shape `{variables, secrets}` as a second accepted shape.
No current writer produces that shape. V21 forbids it on every new revision. No gated execution path
can reach the reader with it. Keeping it is therefore a backward-compatibility read path for pre-015
(V20) rows. The single-path rule forbids that (ADR-SC-005: "no legacy path, no compatibility layer
and no versioned fallback"). The story also records that "no current-Java old-schema fallback
exists" (STUDIO-OBS-015.story.md:315).

## Subjects (sha256, read at review time)
| File | sha256 |
|---|---|
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/ExecutionReferences.java` | `fc6401fb4e1decf421bb9eb421f356cbe82aa2db4c2173a3a309425f8d2551ef` (matches Dex "after") |
| `backend/src/test/java/com/citi/put/checks/studio/dispatch/TypedReferenceAdapterTest.java` | `aad759847c1bb6c953c880ac46d85ded67f3df42bbd345cce2e5a6988e77d668` |
| same `ExecutionReferences.java` at `HEAD` (734ad704f) | `76aad72fa0462536d00c33aed24d39ae4c7a930f90e578a4c2a456fe5bfa831e` |

I could not verify Dex's "before" `0ffc9d04…`. It is an uncommitted pre-fix state with only a
javadoc change from HEAD, and that state no longer exists. Against HEAD, `git diff` shows only the
identity branch and the javadoc. The `declared` logic is otherwise unchanged.

## Findings

### F1 (required). The two-key shape has no producer and must be refused
I checked every writer and gate. All of this is verified by reading the code.
- **Only writer.** `GuidedPublicationRepository.java:249-296` (sha `28aafe98…`) is the only
  `INSERT INTO ui_test_revisions` in `backend/src/main`. It always writes
  `authoringIdentityVersion:1`, `authoredDeclarations`, `variables` and `secrets`. No JPA save of
  `UITestRevision` exists: there is no `revisions.save`, and the constructor is protected and
  no-arg. The test fixture `StudioExecutionFixtures.confirmRevision` goes through
  `ObservedPublicationFixture` and then `publications.commit`, which is the same writer.
- **Former producer gone.** The HEAD javadoc named `CompileInputs.referencesJson()` as the two-key
  producer. A grep of `backend/src` and `studio-runner/src` finds no `CompileInputs` (the compile
  path was deleted by OBS-012A).
- **Database.** `V21__guided_session_replaying_prefix.sql:747-767,778,814` (sha `b012dddd…`). The
  `tr_015_revision_guard` constraint trigger runs on **every** insert into `ui_test_revisions`. It
  requires `studio_015_declarations`, a closed set of exactly the four keys with version `1`. Any new
  two-key row fails at commit.
- **Contract.** `contracts/v3/revision.schema.json#/definitions/RevisionReferences` (sha
  `e37b2bd9…`) has `additionalProperties:false` and requires all four keys. The contract has no
  two-key schema. `ReferenceDeclarations` is only the Java record. The javadoc phrase "the
  contract's `ReferenceDeclarations` declares … `variables` and `secrets`" is therefore stale or
  wrong.
- **Historical V20 rows cannot reach the reader through any gated path.**
  - `StudioAcceptanceService` calls `readiness.evaluate` (:305) before `declared` (:359).
  - `ExecutionReadinessService.evaluate` runs `IncrementalChangeService.inspect`. For a two-key row,
    `IncrementalAuthoringIdentity.frozen:82-85` throws `incomplete`. The result is
    `BASE_IDENTITY_INCOMPLETE`, then `changed()`, then `LEARN_REQUIRED`. Term 7 is a second gate:
    `ObservedRevisionVerifier.verify:153-155` maps version ≠ 1 to `LEARN_REQUIRED`.
  - `StudioScheduleService:201` runs `requireReady` before `declared` (:212).
  - `StudioDispatcher:324,499` read only accepted bindings.
  - The historical V20 ITs (`LegacyV20ConfirmedBaseFixture`, "never a current-runtime compatibility
    path") assert `NEEDS_RELEARN` and republish. They never run the V20 revision itself.
- **Inferred, not proven.** An execution accepted before V21 and dispatched or retried after V21
  could still reach `StudioDispatcher:324` with a two-key document. A strict reader makes that run
  terminal `REFERENCE_UNAVAILABLE`. That is the correct fail-closed outcome. ADR-SC-005 D-B also
  records that no shared environment was ever deployed.
- **Conclusion.** The two-key acceptance serves only historical data, plus the pre-existing unit
  tests that still feed it. It is a compatibility layer and must be removed.

### F2 (pass). Fail-closed behaviour of the new branch
- If either identity key is present, the version must satisfy `isInt()` and equal `1`. That rejects
  `"1"`, `1.0`, `2`, `null` and absent. `authoredDeclarations` must be an array, which rejects
  `null` and `{}`.
- The key loop still rejects any key outside the closed set.
- `variables` and `secrets` are still required arrays of non-blank strings.
- Null and blank input, unparseable input and non-object input stay terminal.
- The reader does not validate the content of `authoredDeclarations`. That is acceptable: the
  content is validated at insert by `studio_015_declarations`, rows are write-once, and the reader
  does not consume it.

### F3 (pass). No secret or value leakage
- Every new message is a constant string. `names()` interpolates only the literal field name.
- The `JsonProcessingException` is still not chained.
- `authoredDeclarations` carries `valueHash` for plain references, which is a hash and never a
  value. The reader neither returns it nor logs it.

### F4 (required, test adequacy)
The new method's positive case and its seven rejected variants are correct. The suite still asserts
the two-key shape as *readable* in four places: lines 30, 41, 51 and 59. The leak test (:139) only
exercises a two-key-plus-extra document. No test proves that a refusal on the identity branch omits
the document.

## Required changes (exact)
1. **`ExecutionReferences.declared`.** Accept exactly one shape: an object whose key set is
   precisely `{variables, secrets, authoringIdentityVersion, authoredDeclarations}`, all four
   required.
   - `authoringIdentityVersion` must satisfy `isInt()` and equal `1`.
   - `authoredDeclarations` must satisfy `isArray()`.
   - `variables` and `secrets` must pass the existing `names()` check.
   - Delete the `identity` conditional so that `{variables, secrets}` alone throws
     `UnreadableReferenceDeclarationException` with a constant message.
2. **Javadoc (class and method).** Name the single shape as V21 `studio_015_declarations` / contract
   `RevisionReferences`, written by `GuidedPublicationRepository.commit`. Remove the two-key
   sentence and the "contract's `ReferenceDeclarations`" claim. Keep the "accepting more shapes …"
   rationale.
3. **`TypedReferenceAdapterTest`.**
   - Port the positive inputs at :30, :41, :51 and :59 to the four-key shape. Keep each method's
     assertions and intent.
   - Port the canary document at :139 to the four-key shape plus `"extra":1`.
   - Add `{"variables":[],"secrets":[]}` and `{"variables":["REGION"],"secrets":["LOGIN_PW"]}` to a
     terminal list, so the two-key refusal is tested.
   - Add one no-leak assertion for an identity-branch refusal: a canary inside
     `authoredDeclarations` with `authoringIdentityVersion:2`, then `hasMessageNotContaining` and
     `hasNoCause`.
4. **Re-verify, for the Gradle owner and not run here.** Re-run `TypedReferenceAdapterTest` and the
   ReplayIT first case on fresh labels with `--no-daemon`. Grep `backend/src/test` for remaining
   two-key `ExecutionReferences.declared` inputs. `StudioExecutionFixtures.references` and
   `NO_REFERENCES` are publisher *inputs*, not stored documents. They need only their javadoc
   corrected (:100 claims "the one shape the typed reader recognises").

## Non-blocking observations
- `V21__…sql:1` says "DESIGN CANDIDATE ONLY; not installed in production migration resources". The
  file is in `src/main/resources/db/migration`, so the header is stale. This belongs to
  @data-engineer.
- Dex's causes A and C and open item D are outside this review.

## Skipped
- CodeRabbit was not run. The skill requires a WSL install, and this host is darwin.
- I did not run the SYNAPSE diagnostics. They are outside this mission.
- I ran no Gradle or test execution, per the instruction.
