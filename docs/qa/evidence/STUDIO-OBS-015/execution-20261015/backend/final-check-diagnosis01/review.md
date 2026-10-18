# STUDIO-OBS-015 final-check-diagnosis01 (Dex-D7, @dev, diagnosis)

2026-10-16. Read-only on backend/, frontend/, studio-runner/, tools/, docs/specs/, .github/. No Gradle. Scratch only for the checkstyle CLI, Ant, javap, javac, gjf. [V] = ran it / read it. [I] = inferred.
Live run: `execution/backend-final-check-attempt01.log` (compiled 16:09:42, no `src/main` file newer than the classes [V]).

## 1. `:checkstyleTest FAILED` is not a violation. It is an OutOfMemoryError in the Gradle checkstyle worker

Violation list Gradle sees: **none**. It never reaches the reporting stage.

| Item | Result |
|---|---|
| Gradle config (`backend/build.gradle.kts` 369-381) | [V] toolVersion 10.18.1, `isIgnoreFailures=false`, `maxWarnings=0`, html on / xml off, **no `maxHeapSize`**. `checkstyle.xml` has `severity=error`, so warnings are not in play. Source set = `sourceSets.test.allJava` = the same 332 files the CLI scans. No extra source dirs. |
| Gradle's own output | [V] `build/tmp/checkstyleTest/test.xml` (written 16:10:11) holds 193 `<file>` elements, **0 `<error>`**, no closing `</checkstyle>`; `build/reports/checkstyle/test.html` was not rewritten (still the 15:59 file from the 2g experiment). Same shape as the w6 note "XML truncates, html not written". |
| Failure text | [V] w6-format01/checkstyle.log and 4 daemon logs: `An unexpected error occurred configuring and executing Checkstyle. > java.lang.Error: Error was thrown while processing .../studio/support/<X>Fixture.java` (X varies run to run: LegacyV20ConfirmedBaseFixture, ObservedPublicationFixture, GuidedPublicationEvidenceFixture). The live log has not printed its "What went wrong" block yet (build still running). |
| Root cause | [V] `final-gates01/static01-checkstyleTest-stacktrace.log`: `Caused by: java.lang.OutOfMemoryError: Java heap space` (in the XSLT html step, `TraXLiaison`/`XPathLexer`), and the same Error wrapper in the checker. Checkstyle's `Checker` converts any `Error` into `java.lang.Error: Error was thrown while processing <file>`; the file named is only the one being processed when the heap ran out, which is why it moves. |
| Gradle proof of the fix | [V] `final-gates01/diag-checkstyleTest-heap2g.{log,exit}`: init script `maxHeapSize = "2g"` on all Checkstyle tasks, exit 0, and `build/reports/checkstyle/test.html` (15:59:31) reads 332 files, 0 violations. |
| CLI reproduction of Gradle's view | [V] Ant `<checkstyle>` task (the same wrapper Gradle uses), same jar and `checkstyle.xml`, `config_loc` set, over all 332 test files (`ant-harness-build.xml`): `-Xmx384m` and `-Xmx448m` fail with `java.lang.Error: Error was thrown while processing .../studio/guided/pub...`, `Caused by: OutOfMemoryError`, XML truncated at 242 files, 0 errors; `-Xmx512m`, `1g`, `2g` pass with 332 files, 0 errors. 512m passes bare, so with Gradle's worker overhead on top the default 512m is over the edge [I]. Largest file is `GuidedPublicationReplayIT` at 34,240 lines [V]. |
| Why the earlier CLI said 0 | [V] The CLI runs with the default JVM heap (a quarter of RAM); the Gradle worker does not. Both are right: 0 violations, but Gradle cannot finish. Also re-ran the CLI over all of `src/test/java` with `-Xmx512m`: 0 violations. |

Fix: a build setting, not a rule or suppression change. `maxHeapSize.set("2g")` inside the existing `tasks.withType<Checkstyle>().configureEach` block (`Checkstyle.getMaxHeapSize()` is a `Property<String>` in Gradle 8.10.2 [V, javap]). 2g is the value proven in real Gradle; 1g is proven only in the Ant harness.

Decision for the user: this edits `backend/build.gradle.kts` (frozen tracked source). If you prefer zero source change, the same effect without a patch is `-I final-gates01/diag-cs-heap.init.gradle` on the final `check` invocation (that is exactly what the 2g experiment used). I chose the in-repo setting because CI and anyone running `./gradlew check` would otherwise hit the same failure. Say if you want the init-script route instead and I will drop that hunk.

## 2. GuidedPublicationReplayIT failures: stale source-line pins (three tests, not two)

| Test | Assertion | Cause [V] |
|---|---|---|
| `actualGuidedZeroPasswordControlsRejectsScopedSecretProposalBeforeRead` | `validatorCountPredicate` isTrue (IT:26417) | `line == 381` pin; live run wrote `p4-first-guard-diagnostic-{0,2}.json` with `actualActionLine: 384`, `actualPredicateMatched: false`, status 422 POLICY_DENIED. The 14:24 run of the same test had 381 / true. `javap -l` on the 16:09 `GuidedProposalValidator.class`: the `require(...passwordControls == 1, "POLICY_DENIED", 422)` invoke is line 384. |
| `...TwoPasswordControls...` | same | same |
| `incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent` | `AssertionError` at IT:10087 ("post-ACK worker checkCurrent SECRET_USE_REVOKED not observed") | `method == advancePrefix && line == 405`. The live run's `finalize-exception-9.json` has `checkCurrent` + `SECRET_USE_REVOKED` + `advancePrefix` line **459**. The refusal is correct, only the line moved. The pins were written against `GuidedTranslationService` sha d8c494b2 (evidence snapshot `prefix-producer-sync-source01/source-after`, where 398 = `pushContext`, 405 = post-ACK `translationTransaction`); the file has since changed (spotless plus edits). |

Patch (`fix.patch`, hunks in `GuidedPublicationReplayIT` only):
- Validator observer: records `validatorAction` (frame `GuidedProposalValidator.action` found) and the predicate becomes `validatorAction && policyDenied && status == 422`. `validatorLine` is still recorded as a diagnostic. The `isEqualTo(381)` assertion is removed (the predicate assertion directly above already covers it). The diagnostic field `expectedGuardLine: 381` is replaced by `expectedGuardFrame: "GuidedProposalValidator.action"`.
- `b2AwaitCheckCurrentGate` and `prefixSyncAwaitDiagnostic`: frame is class + method `advancePrefix` (and `lambda$advancePrefix$*` for the STALE_GENERATION refinement), no line. The `checkCurrent` frame, the `translationTransaction` lambda frame, the exception code and the `size()==1` check stay.
- Two Javadoc mentions of `advancePrefix:405` reworded.

What this weakens (stated, not hidden) [I]:
1. Validator: `GuidedProposalValidator.action` has three `POLICY_DENIED` 422 sites (line 369 kind/target, 384 password count, 389 non-secret on password control). Class + method + code no longer tells the count site from the other two. What still ties the refusal to the count scenario: the same test asserts `passwordCount == count` (0 or 2), `selectedPasswordOrdinal == 1`, a same-step secret input, and zero vault reads. I did not add a `passwordCount != 1` conjunct because you asked for class + method + code only.
2. `advancePrefix` gate: the earlier first-transaction site (line 346) and the pushContext site (451) are no longer excluded by line. In the test the revocation happens after the first transaction passed, so the first refusal after the hold is the post-ACK site (the live row confirms 459). The "evidence-expression" line range refinement (old 428-433 / 417-418, now 512-520 / 484-489) is dropped; the code check remains.
If you want the exact-site discrimination back without line numbers, the next step would be resolving the line from the compiled class at test time (Spring's `org.springframework.asm` is on the test classpath). I did not build that.

Verification of the patch [V]: `git apply --check -p0` against the live tree passes; patched `GuidedPublicationReplayIT` is byte-identical to `google-java-format 1.22.0 --skip-reflowing-long-strings` output (same options as the spotless config; the unpatched file is also clean under them), checkstyle 10.18.1 CLI 0 violations on it, and `javac -proc:none` against `build/classes` compiles it. Not run: the ITs themselves (live Gradle run, Docker). The behavioural claim rests on the runtime artifacts above, not on a re-run.

## 3. Other line pins in the tests (grep `getLineNumber|lineNumber|path("line")|validatorLine|"line"` over `src/test`: only `GuidedPublicationReplayIT` matches)

Hard assertions (fail the test when stale): the three above, all fixed in the patch. No other hard assertions on source lines found [V].

Diagnostic-only (C5ClaimSampler, `claimSamplerDiagnosticOnly`; values go to evidence JSON, I found no `assertThat` on them [grep of `claimSessionValidationSamples`, `publicationPhases`]). Left unchanged; a stale pin only makes the sample count 0 or the phase -1:

| Pin (test line) | Current compiled table | Status |
|---|---|---|
| `GuidedSessionRepository.saveRenewalAndCommand` 79 (30035) | lines 83,85,88,89,90 | stale; `contracts.validate` call is now 88 [I on semantics] |
| `GuidedSessionService.claim` 751 (30045) | lines 927-934, 1019-1022 | stale; the `repository.transaction(` call is 934 [I] |
| `GuidedPlanPublisher.prepareLowering` 388 (30151) | starts 389 | stale by one; spotless wrapped the `if` so the invoke is on 389 [I] |
| `GuidedTranslationService.call` 774, 796, 932, 949, 984, 1083, 1113 (30168-30174) | `call` frames are 1451-1836 | none exist; old targets unknown (older than d8c494b2) |
| `ObservedValidationClient.validate` 59/65/69/82, `GuidedContracts` 90/99/104, `finalizeForUser` 100/110/135 | present, and for the first six the source line is the intended call (validateAndCanonical, getBytes, budget.remaining, client.send, validate, canonical/require) | still correct [V for the first six, table-present only for finalizeForUser] |

Consequence: `claimSessionValidationSamples` will be 0 in the sampler evidence until those pins are re-derived. If the receipt tooling requires it to be positive, that needs its own change; I did not find such a check.

## Files

`fix.patch` (build.gradle.kts hunk + ReplayIT hunks), `manifest.json`, `ant-harness-build.xml`, `ant-harness-Xmx{384m,448m,512m,1g,2g}.tail.log`.
