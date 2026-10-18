# STUDIO-OBS-014 strict planned-QA audit

Verdict: **FAIL — planned local validation is incomplete.** No lifecycle change is made by this audit. The user requires every planned QA oracle executed and green, so the previous CONCERNS/compositional verdict is insufficient.

`strict-plan-audit.json` maps all eleven ACs, both inherited removals, T0/T5 and the bootstrap/corpus rulings. `independent-proof-recheck.json` independently rehashes raw S4c logs and 22 relevant XML classes (347 passed, zero skipped/failure/error), includes every exact executed testcase name, and confirms 1,552 source/config/spec/tool files still match the reviewed frozen manifest. This establishes historical execution; it does not establish missing or newly added oracles.

## Required backend remediation (one writer; independent QA reviews after)

1. **AC-4 / AC-5: actual integrated grounding and destructive denial.** Owner backend test developer. File `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java` (Java package is `guided.session`). Insert beside the existing DENY/CLARIFY_FIRST block at approximately lines1070–1220. Its `attachAuditCapture`, `sessionState`, `invokeRaw`, `governedStance`, and provider harness are reusable. Add provider/fixture flags in the existing `providerResponse` / `mutateHostileResponse` hooks (~2740/~2167), reset in the existing setup (~579). Supply a **structurally valid** model response compatible with the authored plan so it reaches `guardAction`, rather than failing the earlier validator. Separate non-destructive-but-ungrounded target from a destructive target, to prove exact `UNGROUNDED_TARGET` and `DESTRUCTIVE_VERB`; keep the literal Delete-account/Open-reports oracle too. Assert HTTP422/POLICY_DENIED, FAILED/result errorCode POLICY_DENIED, durable rejected attempt, exact GUIDED_ACTION_REFUSED reason, no preparation/admission for the planted target/step, and zero native effect. Add authored Delete positive control under ALLOW, and preserve Save eligibility. Existing hostile semantic cases stop at INVALID_CONTRACT/BINDING_ORDER and do not meet these oracles.

2. **AC-3: actual post-prune browser replay.** Same writer, coordinated with OBS013 (shared source). Minimal insertion in `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java`, `actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues` (Order1), immediately after the published artifact hash is established (~2375), before the existing ordinary two-replay loop. This already creates a genuine learned/published nonempty revision. Snapshot artifact, learned plan, receipt and all six publication tables in stable JSON order. Assert nonempty prunable observation and terminal nonnull safe_result **before** pruning. Backdate only the source session expiry+its document expiry via the test-only transactional replica-role seeding pattern already used in GuidedObservationPrunerIT. Call the production GuidedObservationPruner bean from `ownedApplicationContext`. Assert pruned_at set, excluded progress keys removed, terminal safe_result nulled, and publication bytes unchanged. Then retain both actual ordinary browser runs, fresh recaptured values, PASSED status, observed admission receipts, zero new model calls, duplicate finalize, historical result/replica and scheduler assertions already in this case. The pruner SQL/storage tests remain necessary; this additional joined execution closes the literal missing oracle. No migration changes.

3. **AC-7: actual SAVED_INPUT emitter.** Same writer, preferably Planning integration source-question family near `sourceQuestionIsDurableBeforeMaterializationAndPublicAnswerResumesBootstrap` (~887) and provider SOURCE_PLAN ambiguity branch (~2750). Existing choices there are sourceSpan and emit AUTHORED, so merely adding a SAVED_INPUT expectation to them would be wrong. Construct legitimate declared configuration-reference choices and drive real `GuidedTranslationService` emission (~1646). Assert public choice labelSource SAVED_INPUT, expected safe label/ID semantics, no raw saved or secret canary in question/labels; secret-reference choices remain IDs only. A direct production-service test at the existing service test seam is also acceptable if it exercises this branch without mocking the emitter.

## Other existing local concerns before a concern-free gate

- Runner owner: `studio-runner/test/guided/transport.test.ts` ~137 currently accepts either SCHEMA or IDENTITY_MISMATCH for replay of a refused context. Its comment already states the exact replay normalization. Assert the precise code per request and zero launch/callback, then execute.
- Architect: dated explicit ratification of absent target -> destructive -> grounding -> stance precedence (ARCH-001), with two simultaneously-applicable reason examples; existing form-membership ruling explicitly did not ratify it.
- Data owner: record actual catalog names of generated V19 hash/regex constraints for future migration maintenance (DB-001); do not rewrite V19.
- Coordinator: remove the literal empty `contracts/v3/*.json` directory if still empty (MNT-001). Current audit confirms it exists; no source behavior depends on it.
- Documentation owner: update dated `guided-data-flow.md` future-tense S3/cutover language to verified implemented behavior. Keep external approvals and indefinite-retention/privacy residuals explicit.
- Harness owner: TEST-006 static primaryCsi/coreRole remains mutable across ordered ReplayIT tests. Existing green-class execution and cleanup do not erase this finding. Independently assess whether per-test ownership can be corrected safely here or demonstrate exact controlled class-level fixture dependencies without weakening cleanup; a downstream placement alone is not a green verdict.

## Exact execution commands (root allocates serialized windows)

Backend commands from `backend/`; changed tests first, then full final gate once all changes are integrated. Browser/Gradle/dist commands must not overlap other owners.

```sh
./gradlew test --tests 'com.citi.put.checks.studio.guided.session.GuidedPlanningIntegrationTest' --tests 'com.citi.put.checks.studio.guided.retention.GuidedObservationPrunerIT' --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT' --console=plain
./gradlew test --tests 'com.citi.put.checks.studio.guided.session.GuidedSessionIT' --tests 'com.citi.put.checks.studio.guided.session.GuidedBridgeIntegrationTest' --console=plain
./gradlew clean check --continue --console=plain
```

Runner commands from `studio-runner/`, existing dependencies, no lockfile writes:

```sh
pnpm exec vitest run test/guided/policyHash.test.ts test/guided/transport.test.ts test/run/guidedMain.test.ts test/run/observation.test.ts
pnpm exec vitest run --config vitest.fixtures.config.ts test/fixtures-tier/guided-wire.test.ts test/fixtures-tier/guided-targets.test.ts test/fixtures-tier/guided-dataflow.test.ts test/fixtures-tier/secret-login.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec eslint .
pnpm exec vitest run
```

Contracts from repository root:

```sh
node tools/build-studio-observed-schemas.cjs --check
node tools/check-studio-observed-contracts.cjs
```

Root should regenerate/rebind exact dist/source hashes if source changes, run the selected fixture/deployment gates justified by those changes, preserve first-failure receipts, and independently enumerate XML results. Recompute the AC4 four-class guard tallies with every newly planted UNGROUNDED_TARGET/DESTRUCTIVE_VERB named, no unplanted refusal, no removed old testcase, no skipped required oracle. Independent Quinn must re-review exact final source and evidence and set PASS before Done. No new test is credited merely because its implementation exists.

## Explicit downstream boundaries

Real-model D-C calibration/capacity and actual SIEM deployment remain OBS009; Security/Compliance approval and ED01 gateway retention remain OBS010. AC9 explicitly names D2b cached response reauthorization as unresolved here. F01 covers indefinite **non-AC3** stores, F02 policy-source unification, F03 exact-field governed reads, and F04 artifact HMAC implementation. AC11 requires its dated design only. These are not missing executions of this story, are not waived, and must never be reported green by local controlled tests. In contrast, dedicated guard integrations, post-prune replay and SAVED_INPUT emission are local missing validation and cannot be moved to OBS011 to close this story.
