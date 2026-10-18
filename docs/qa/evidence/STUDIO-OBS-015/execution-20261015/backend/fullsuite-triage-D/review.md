# STUDIO-OBS-015 full-suite triage D (final-w02-full-test04)

Scope: 19 failures. Patch `fix.patch` changes test sources only (9 files). No production file changed.
Apply: from the repo root, `git apply --check -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/fullsuite-triage-D/fix.patch`
(returned OK when written; base sha256 of every file is in `manifest.json`).

## Classification

No production defect was found. Every failure is a fixture or assertion that predates the v3 single-path
shape, or a fixture bug. Production behaviour matches the architect ruling
(`final-design/architect/implementation-ruling.md` section 1, lines 11, 15 and 25).

| # | Failing tests | Root cause (file:line) | Class | Fix |
|---|---|---|---|---|
| 1 | GuidedGatewayPrivacyTest x7, GuidedProviderEvaluationTest x1 | `GuidedGatewayPrivacyTest.java:143-148`: the fixture `secretRef` carries `value` and no `secretId`. `CanonicalStudioCodec.java:68-72` refuses that (reached through `GuidedSourceClassifier.java:74`). The 8 tests all build requests through `classifiedRequest`. | fixture drift to v3 | `secretRef` gets `secretId: "PASSWORD"`, which is what `<secret PASSWORD>` resolves to. The `secret-canary` is now also planted in `session.secretValue`; it is still in `progress.error` and still asserted absent from the wire. A v3 `secretRef` cannot carry a value by construction. |
| 2a | GuidedSourceClassifierTest.referencedValues... | `CanonicalStudioCodec.java:63-65` refuses a non-string plain `value` as `INVALID_VARIABLES`. The test expected `MISSING_SOURCE` for Int, Bool and Object values. | fixture drift | `null` and absent values still assert `MISSING_SOURCE`. Int, Bool and Object values now assert `StudioValidationException` with code `INVALID_VARIABLES`. See R-3. |
| 2b | GuidedSourceClassifierTest.declaredTokens... | `IncrementalAuthoringIdentity.java:193-196`: an undeclared reference is `409 MISSING_SOURCE`, messageCode `AUTHORING_REFERENCE_MISSING` (ruling line 15). The test expected `FORBIDDEN_SCOPE`. | fixture drift to ruling | Asserts the status, the messageCode and the code for both `<var unknown>` and `<secret city>`. |
| 2c | GuidedSourceClassifierTest.canonicalWhitespace... | The null-`secretId` name-fallback block at `GuidedSourceClassifierTest.java:176-185` is retired (ruling line 11). The codec refuses it at `CanonicalStudioCodec.java:68-72`. The conflict block at `:186-194` would then fail next: a plain name colliding with a `secretId` is `422 INVALID_CONTRACT` / `AUTHORING_REFERENCE_AMBIGUOUS` (`IncrementalAuthoringIdentity.java:66-71`, `:313-316`), not `FORBIDDEN_SCOPE`. | retirement, already ruled (R-1) | The fallback block now asserts the codec refusal `INVALID_VARIABLES`. The conflict block asserts 422 / `INVALID_CONTRACT` / `AUTHORING_REFERENCE_AMBIGUOUS`. The test method is renamed. |
| 3 | ExecutionReadinessTest x2, DeReadyCarryForwardTest x1 | (a) `GuidedPublicationEvidenceFixture.java:34`: the URL regex `[^\s<>]+` takes the closing `"` of `Go to "https://..."`. `URI.create` then fails at `:179`. (b) Once (a) is fixed, `https://example.com` is outside the governed origin `ObservedPublicationFixture.ORIGIN` (`:85`, `:379`, policy `:525`). (c) After publish, both classes still assert the retired counter-only edit and the message "edited after it was learned". The service now uses semantic identity (`ExecutionReadinessService.java:191-199`) and its text is "no longer match the text that was learned" (`:209`). | fixture bug + test data + obsolete mechanism (R-2) | Regex excludes `"`. `STEPS` use `ORIGIN`. The edit is now a real edit (`steps` changed, counter bumped, same shape as the sibling test). The message assertion points at the real text. |
| 4 | DispatcherIT.plainDraftVariables... | `GuidedPublicationEvidenceFixture.java:172-176` takes the first `destination` reference. The classifier emits a `navigate.destination` slot for every plain variable, sorted by UTF-8 (`GuidedSourceClassifier.java:155`). `QUERY` (value `studio`) sorts before `STUDIO_FIXTURE_URL`, so `URI.create("studio")` gives origin `null://null` and `:180` throws. Behind it, `DispatcherIT.java:193` asserts the pre-OBS-015 input id `input-variable-QUERY`. The synthetic evidence ids are `fixture-<session>-plain-N`. | fixture bug + convention drift | The fixture takes the first destination whose value fully matches the URL pattern. The test finds QUERY through `artifact.inputRecipes[].provenance.referenceName`, which carries the declaration name, and then asserts its value is `studio`. `doesNotContainValue("changed")` is kept. |
| 5a | StudioApiIT.variableValidationReadsTheTypedVariables | `:202`: `hasVariables` is true. `seedRunnableTest` publishes, and `ObservedPublicationFixture.prepareDeclaredSource` (`:445-477`) writes `STUDIO_FIXTURE_URL` into `ui_tests.variables`. | fixture side effect | The control is an unpublished `seedTest` draft with no declarations. The assertions are unchanged. |
| 5b | StudioApiIT.variableValidationChecksTheDrafts... | `:211` declares `value: ""`. Empty is now an exact value, not a missing one (`VariableReferenceValidator.java:103`, ruling line 15). | assertion drift to ruling | The declaration has no value. The assertions are unchanged. |
| 6 | VariableReferenceValidatorTest.aReferencedVariableWithNoValue... | `:58` declares `" "`. Whitespace is an exact value (`VariableReferenceValidator.java:103`). | assertion drift to ruling | The declaration is `plain("BASE_URL", null)`. A new test pins `""` and `" "` as valid, so the new semantics are covered rather than dropped. |
| 7 | AcceptanceIT.anEditedDraftWhoseConfirmation... | `:262-269`: a bare `source_revision + 1` no longer invalidates readiness, so the call is accepted. `ExecutionReadinessService.java:191` replaced counter equality with semantic identity, plus the hash check at `:209`. The name still says "CompileRequired". | obsolete mechanism, intent kept (R-2) | Same real edit as in 3. The assertion `LEARN_REQUIRED` is unchanged. The method is renamed `...IsLearnRequired`. |

## Answer to the AcceptanceIT question

The test is not obsolete as a behaviour. "An edited draft is LEARN_REQUIRED" is the single-path rule.
Two things in it are obsolete: the word "compile" in the name, and the mechanism of editing by bumping only a counter.
Compile is not referenced anywhere in the test body.

## Architect rulings requested

- **R-1 (name fallback).** `implementation-ruling.md:11` already retires it. Please confirm that replacing the
  fallback assertion with a codec-refusal assertion is the intended retirement. Covering evidence: `IncrementalIdentityTest.java:26-29`
  (a name-only reference does not resolve) and the new `INVALID_VARIABLES` assertion.
- **R-2 (counter-only bump).** `implementation-ruling.md:25` replaces counter equality with semantic identity.
  Three tests relied on the old behaviour; they now use a real edit. The retained side, "a counter-only bump with
  identical semantic content stays READY", has no execute-level test. `ChangeDetectionTest.java:108` covers it only at
  the change-service level. Please rule whether to add an execute-level test or waive it.
- **R-3 (non-string plain value).** The ruling is silent. Production returns `400 INVALID_VARIABLES` from the codec
  before the classifier can say `MISSING_SOURCE`. Persisted drafts already pass the codec at write, so this is only
  reachable with hand-built input. I treated it as codec-authoritative and did not change production.

## Production observations (not patched, outside scope)

- `ExecutionReadinessService` class javadoc still lists term 5 as counter equality, which the code no longer checks.
- `VariableReferenceValidator` javadoc (lines 16-18) still says a secret is matched "falling back to its name". The
  private `isBlank` at `:168` is now unused.

## Verification (what was and was not run)

Gradle was not run. I ran the tests outside Gradle with a JUnit Platform Launcher in the scratchpad. Patched test
classes came first on the classpath, over the read-only `backend/build/classes` from the test04 run. The jar
classpath is the newest version of each artifact in `~/.gradle/caches`, with Saxon removed because it failed to load. It is not Gradle's resolved classpath.

- Baseline on the unmodified classes, unit set: 36 tests, 12 failed. That is exactly 7 + 1 + 3 + 1, so the harness reproduces the reported failures.
- Patched, 8 classes: 70 tests, 68 passed, 0 failed, 1 skipped (`@Disabled`), 1 aborted. The aborted one is the
  env-gated live-provider assumption in `GuidedProviderEvaluationTest` (`assumeTrue`), which was also aborted in the baseline run.
- `DispatcherIT` ran in full, 26 of 26 passing.
- The Spring tests ran with the `local` profile, using their own embedded Postgres or Testcontainers.
- Not reproduced: the real `test` task's `forkEvery`, `Xmx` and context-cache settings, and the other ~108 failures in the
  suite (not in my list).
- Residual risk: the main classes are the ones compiled for test04. If another dev changed main sources after that
  run, only a Gradle `test` run on the current tree confirms the result.
