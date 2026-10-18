# STUDIO-OBS-015 w7-final-fix01 (Dex-W7, @dev)

2026-10-16. Sole writer in backend/ and studio-runner/. `--no-daemon`, fresh collector labels, no commits, no edits during a lane. [V] = ran it. [I] = inferred.

## 1. final-check-diagnosis01 fix.patch applied
`git apply --check -p0` then apply [V]. Hunks: `backend/build.gradle.kts` (`maxHeapSize.set("2g")` in the `tasks.withType<Checkstyle>` block) and `GuidedPublicationReplayIT` (line pins removed). The patch was then tightened, see 2.

Validator pin (coordinator correction): `GuidedProposalValidator.action` has three POLICY_DENIED 422 sites, so a method pin alone would not tell the count refusal apart. The password-count `require` was extracted unchanged into `private static void refusePasswordFieldCount(JsonNode progress)` and the observer pins class + method `refusePasswordFieldCount` + POLICY_DENIED + 422. The other two sites cannot match. The `validatorLine` diagnostic remains; the `isEqualTo(381)` assertion is gone (the predicate assertion above it is now the discriminating one). Behaviour-neutral by construction [V javap]: `action` does `invokestatic refusePasswordFieldCount(progress)` at the same position; the new method body is the same chain `observation.coverage.passwordControls.asInt(-1) == 1`, then `require(.., "POLICY_DENIED", 422)`. Same condition, error, status, order. The existing `GuidedTranslationTest` validator tests pass (37/37) [V].

## 2. All 7 failures traced (attempt01 XML)
| # | Lane | Test | First failure | Cause [V] | Fix |
|---|---|---|---|---|---|
| 1 | test | actualGuidedZeroPasswordControls... | IT:26417 | validator line pin 381, code now at 384 | frame pin on `refusePasswordFieldCount` |
| 2 | test | actualGuidedTwoPasswordControls... | IT:26417 | same | same |
| 3 | test | incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent | IT:10087 (b2AwaitCheckCurrentGate) | `advancePrefix` line 405 pin; live stack frame is 459 (`translationTransaction` after pushContext) | site resolved from bytecode, see below |
| 4 | guided | incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation | IT:10087 | same helper, same pin | same |
| 5 | guided | prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence | IT:11163 (prefixSyncAwaitDiagnostic) | pins 405 (gate) and 428-433 (evidence require); now 459 and 512 | same |
| 6 | guided | prefixProducerContextUncertainRepliesNeverAdmitOrRedispatch | IT:11163 | pin 398 (pushContext); now 451 | same |
| 7 | guided | prefixProducerContextConcurrentAdvancePreparesCoordinateOnce | IT:11163 | pins 405 and 417-418; the live XML shows `lambda$advancePrefix$14` at **484** and `advancePrefix` at 459 | same |
Evidence of the new lines: attempt01 guided XML stdout has `advancePrefix(...:459)`, `lambda$advancePrefix$14(...:484)`; `GuidedTranslationService` unchanged since the 16:09 build. All seven were stale line pins after the earlier format/edit passes (1-2 on a different class, 3-7 on `GuidedTranslationService`). No refusal behaviour changed.

Departure from the diagnosis patch, to avoid weakening the prefix-sync pins: the patch dropped lines for `advancePrefix` (so the first-transaction site, the pushContext site and the post-ACK site became indistinguishable) and dropped the two STALE_GENERATION line ranges. Instead the test now resolves the four sites from the compiled `GuidedTranslationService` line table (`org.springframework.asm`, same table that produces stack-frame lines): pushContext invoke in `advancePrefix`, the `translationTransaction` invoke after it (post-ACK), and in the single `lambda$advancePrefix$*` that calls both `nextAction` and `program`, the `require` after `nextAction` (CONCURRENT) and after `program` (evidence expression). Assertions are exactly as discriminating as the old ones (exact line equality, no ranges), but follow formatting. Resolver output [V, scratch probe on the 16:09 class]: pushContext 451, postAck 459, nextActionRequire 484, evidenceRequire 512, 1 qualifying lambda; matches the live frames. It throws if it cannot resolve uniquely (fails closed). Cost: ~100 lines of test code, uses Spring's repackaged ASM (already on the test classpath, spring-core 6.1.14).

## 3. Runner
`studio-runner/test/observedReplayValidation.test.ts`: the "6291456-byte parent" test now has an explicit 20000 ms timeout (`},20000);`), harness capacity only, no assertion touched.
Heads-up (not changed, out of the stated scope): with Gradle checkstyle running concurrently, a different heavy test `observedIncrementalValidation.test.ts` "commits each of 538 original complete-basis leaves..." timed out at 5000 ms (took 5647 ms) in my first runner run (`runner-unit-attempt1-under-gradle-load.log`). It passed in the idle rerun. Same class of issue; give it a timeout too if the frozen capture runs next to anything.

## 4. Verification [V]
| Check | Result |
|---|---|
| `test` lane, 3 ReplayIT tests + `GuidedTranslationTest` (labels w7-final-fix-test01, test02 on the final tree) | 3/3 ReplayIT PASS, 37/37 `GuidedTranslationTest` PASS. The collector also shows one synthetic `executionError` (40/41): the class-level `@AfterAll` audit scan wants `GUIDED_ACTION_ADMITTED` and `REPLAY_DISPATCHED` from "the joined runs" and a 3-method subset has none. Same artifact as earlier targeted ReplayIT runs (e.g. `backend-r1-first-diagnosis-attempt02`). It is not a defect of the fix; the full lane has the events. |
| `guidedIncrementalTest` lane, the 4 methods (w7-final-fix-guided01, guided02) | 4/4 PASS, exit 0, `taskCollectionComplete` true, sourceStable true |
| `./gradlew --no-daemon checkstyleTest checkstyleMain spotlessCheck` | attempt 1: exit 1, a real checkstyle finding of mine (`default -> {}` WhitespaceAround at IT:11165); no OOM, so 2g works. Fixed (switch without the empty default). attempt 2: **exit 0**, BUILD SUCCESSFUL, 19 s. Logs: `static-attempt1.log`, `static.log` |
| google-java-format 1.22.0 `--skip-reflowing-long-strings` CLI | validator and ReplayIT byte-identical to formatter output |
| Runner unit tier (`pnpm --config.package-manager-strict=false run test`) | idle rerun exit 0 (`runner-unit.log`); first run exit 1 as described in 3 |
| Full `check` | not run, per instruction |

Because the 4 pushContext/post-ACK pins now come from bytecode, the lane runs after the `default` removal (test02, guided02) are the ones that count; test01/guided01 ran one trivial edit earlier (the empty `default -> {}` arm, behaviourally nothing).

## 5. What is not covered
- Site 346 (first `advancePrefix` transaction) vs 459 is separated by the exact line again, so no residual. The prior diagnosis note about it no longer applies.
- The p4 validator test relies on the new method name; renaming `refusePasswordFieldCount` requires a matching test edit (intentional coupling, fail-closed).
- Not run: the full `test` / `guidedIncrementalTest` lanes and `check` (root's attempt02).
