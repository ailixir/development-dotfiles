# MODEL-SIZING: apply notes for `model-sizing.patch` (Dex, 2026-10-18)

- **Source:** `../model-sizing/ruling-draft.md` §7 (change list), §9.1 (@pm acknowledgement, signed 2026-10-18) and §10 (architect adoption, triggers T-1..T-6).
- **Status:** prepared while G9 ran. **Nothing was applied.** The only writes were to the sandbox and to this folder. No Gradle, vitest, docker or build was run.
- **Legend:** **[V]** verified by running the named read-only command or reading the file. **[I]** inference. **[NOT RUN]** needs the tree to be free.
- **Base:** HEAD `734ad704f`, dirty tree. `git apply --check` passes for the patch alone and for all three patches together (`receipts/apply-check.txt`). Re-run it right before applying: other lanes edit the same tree.
- **sha256:** `model-sizing.patch` `5de0e25d…291026e`; `epoch-probe.cjs` `8344bf5d…`; `repin-publication-fixtures.cjs` `c7140065…`.

## 1. What the patch contains (15 files)

| # | File | Change | Ruling §7 item |
|---|---|---|---|
| 1 | `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json` | input `maximum` 262144 → **1572864**, `default` 262144 → **786432**; output `maximum` 32000 → **131072**, `default` 32000 → **98304**. Nothing else. | 1 |
| 2 | `studio-runner/src/guided/schemas.json` | **generated** (8 lines: the same four numbers) | 2 |
| 3 | `studio-runner/src/validator/observedSchemas.json` | **generated** (8 lines) | 2 |
| 4 | `docs/specs/…/contracts/v3/publication-fixtures.json` | **not in the ruling.** 108 `schemaBundleHash` + 2 `buildHash` literals re-pinned (see §3). | — (new finding) |
| 5 | `backend/…/guided/session/GuidedContracts.java` | `SESSION_SCHEMA_EPOCH` `d94e7972…` → `dace2f2b43be2052997f7fff9c970b18e81b0f7b1931baba5ffd3a07f24f476b`, comment extended | 3 |
| 6 | `backend/…/guided/session/GuidedSessionProperties.java` | `@DefaultValue` 262144 → 786432 and 32000 → 98304; the same two in the `Map` constructor's `getOrDefault` | 4 |
| 7 | `backend/src/main/resources/application.yml` | comment at `csi-budget` ("20x" is false): 156 calls, about 12 ten-step learns, 6.5 full-envelope sessions. Values unchanged. | 6 |
| 8 | `backend/src/test/…/translation/GuidedDefaultModelReservationIT.java` | pins 98,304 / 786,432; 7 → **24** reservations, 28,672 → 98,304; `sevenAndRefuseEighth` → `twentyFourAndRefuseTwentyFifth`, two test names renamed; **+1 test** `realDefaultsB7ThirteenProposalBaseLearnFitsWithoutBudgetStop` (13 reservations fit, session not FAILED) | 7 |
| 9 | `backend/src/test/…/publication/GuidedPublicationReplayIT.java` | pins at the old `:4013-4019` and `:4054-4057` → 98,304 / 786,432; adds a **derived** `derivedProductionCeiling` object per session (`proposals × 4096 ≤ maxModelOutputTokensTotal`, numbers and booleans only, `derivedNotARun: true`). Incremental lane stays `incremental2048`. | 7 |
| 10 | `backend/src/test/…/translation/GuidedPlanningIntegrationTest.java` | **not in the ruling.** `outputDelta = 31000 - …` (hard-coded "1,000 under 32,000") → `outputCeiling(id) - 1_000 - …`, with a new `outputCeiling` helper next to `inputCeiling` | — (new finding) |
| 11 | `studio-runner/evaluation/cli.mjs` | `CODE_DEFAULT_CAPS` 786432 / 98304, `+ maxInputBytesPerCall: 65536`; new required flags for the plan (§5); `--sessions` removed | 9 |
| 12 | `studio-runner/evaluation/observed-authoring/evaluate.mjs` | admission caps from an explicit proposal plan; stop-rule fallback tiers; `measureProposals` defaults (§5) | 9 |
| 13 | `studio-runner/evaluation/observed-authoring/evaluate.d.mts` | types for the above | 9 |
| 14 | `studio-runner/evaluation/README.md` | the `admission-record` line and the cap/stop-rule sentence | 9 |
| 15 | `studio-runner/test/evaluation/budgetAdmission.test.ts` | pins moved to the plan formula and the new totals; new cases for `proposalCaps`, the stop-rule tiers and the 24/25 B7 boundary | 9 |

**Separate, optional:** `consensus-plan-8.3.patch` adds §8.3 verbatim from ruling §10.3 (heading date set to 2026-10-18; change it to the landing date if you prefer). It is its own file because `docs/specs/` text is @architect's. Apply it in the same unit as this patch if the lead assigns it to this lane.

**Not in any patch, by design:** item 8 (dist rebuild), items 10–11 (docs pointers by @po, rollout by @devops), and the `budget-admission.json` append (§7, it carries a timestamp and a hash chain).

## 2. Order of operations (after G9 has exited, in the AE-01 / FM-01 window, under the Gradle lock)

1. `git apply --check model-sizing.patch` from the repo root, then `git apply model-sizing.patch`. One atomic apply: the schema, its two generated copies, the Java defaults and the fixtures must land together. The old Java defaults against the new schema (or the reverse) fails session start at `snapshot()` → `validate("limits")`.
2. **Regenerate check** (the bundles in the patch are the generator's own output, not hand edits [V]):
   `node tools/build-studio-observed-schemas.cjs --check`
   Expected: `Verified v3: 25 guided schemas, 32 replay schemas; four byte-identical outputs.`
   If it says `Stale generated output`, another lane moved a v3 schema. Regenerate and then redo steps 3 and 4:
   `node tools/build-studio-observed-schemas.cjs`
3. **Epoch check:** `node docs/qa/evidence/STUDIO-OBS-009/execution-20261018/dex-prep/epoch-probe.cjs docs/specs/studio-observed-authoring/contracts/v3`
   Expected: `session` = `dace2f2b…476b` (the constant in the patch); `replay-validation`, `ledger`, `observation` unchanged. The probe is a Node replica of `GuidedContracts` expand/canonical/hash. It reproduced all four old constants on the unmodified tree [V], so a different `session` value means the tree differs from the one I measured. Use the printed value in `GuidedContracts.java` (a stale epoch does not fail loudly: the code silently falls back to native validation and `GuidedWireContractTest` fails on the compiled-plan property count).
4. **Fixture pin check:** `node tools/check-studio-observed-contracts.cjs` (exit 0). If the bundle hash moved after step 2, re-pin with
   `node …/dex-prep/repin-publication-fixtures.cjs . --dry-run` and then without `--dry-run`. It rewrites only the `schemaBundleHash` literals and the recorded `buildHash`, and reproduced the patched fixture byte for byte from the original [V].
   Also `node tools/check-studio-current-catalog.cjs` → `PASS_CURRENT_PACKAGED_CATALOG` **[NOT RUN]**; its line 59 asserts the same bundle join.
5. **Rebuild `studio-runner/dist` once**, together with AE-01 / FM-01 (one new dist digest, not two): from `studio-runner/`, `./node_modules/.bin/tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs && node scripts/check-pins.mjs`. (That is `npm run build` and `check:pins` spelled out; `pnpm` is blocked in this package, see the memory note.) Backend guided ITs spawn the runner from `dist/`, and `verifyRunnerDist` compares dist with `src`, so a stale dist fails or validates against the old schema.
6. Narrow tests, §6.
7. **Ledger entries (§7).** Record the new totals in the budget ledger after the code is in.
8. Hand-offs unchanged from ruling §10.4: @po pointers (F-1, MODEL-SIZING placements, OBS-010 AC-4 row), @devops one rollout for backend and runner.

## 3. Pins and hashes: what moves, what does not

### Moves (expected)

| What | Before | After |
|---|---|---|
| `limits.schema.json` input max / default | 262144 / 262144 | **1572864 / 786432** |
| `limits.schema.json` output max / default | 32000 / 32000 | **131072 / 98304** |
| `GuidedContracts.SESSION_SCHEMA_EPOCH` | `d94e7972593b4d051d744f9be213b7f07be33e106f8bee1116f0d9a809db371e` | `dace2f2b43be2052997f7fff9c970b18e81b0f7b1931baba5ffd3a07f24f476b` |
| canonical hash of `observedSchemas.json` = `OBSERVED_SCHEMA_BUNDLE_HASH` = `build.schemaBundleHash` | `efaf885e804773f9ca42153f96dea4fad0b02284d4e5e8e27202ef70c517131a` | `3dbdfdfb242147c1fd829209aab0e1fca100c8fc225391aacc160a2ade65a31a` |
| canonical hash of `guided/schemas.json` (informational) | `4436e7b340f21763e3b3b59685a3c90dc9f6a55fc0b5b91dcd880f2247d76971` | `23a4319709ec75783a74dfe4b3bc4f08832502c8faa1d81fa4db0dcbddab3763` |
| `hash(build)` = `replayGrant.buildHash` in `publication-fixtures.json` (2 places) | `e96a1c587ea9fa763091f247fd9e5a8c1ff5aafb90ff813eafc67ed59792c9a4` | `884836e0fb96ebdb8bb41277ad3894cef9f4257c8c21bcf4cb4879224d3bee75` |
| `dist/runtime-versions.json` `observedSchemaBundleHash`, dist digest | old | new (rebuild) |
| catalog entry of the runner image (`build.schemaBundleHash`, `build.executableImageDigest`) | old | new, per image (B5: every runner image change comes with a new catalog values file) |
| `GuidedDefaultModelReservationIT` | 4 tests, 7 / 28,672 / 262,144 | 5 tests, 24 / 98,304 / 786,432 |
| `budgetAdmission.test.ts` cap pins | `122 × 262144`, `122 × 32000` | `869 × 32768`, `869 × 4096` |

### Does not move [V unless marked]

- `replay-validation`, `ledger`, `observation` epochs; `OUTCOME_SCHEMA_EPOCH`.
- `studio-runner/src/guided/types.ts` and `src/executor/observedOperations.ts` (`Limits` fields are `number`): the generator output is byte-identical.
- `profileHash` (`9ab82ccb…`). In `publication-fixtures.json`, no hash other than `buildHash` is a hash of an object containing the build [V: every ancestor of every `schemaBundleHash` occurrence was hashed and searched for in the file; only `buildHash` matched]. So there is **no reseal chain**.
- `fixtures.json`, `planning-fixtures.json`, `session-it-documents.json`, `studio-runner/test/helpers/guided.ts`: they carry 128000 / 32000 / 262144, all below the new maxima, and the schema has no `const`. The contracts checker passes with them [V].
- Looks like a pin but is not a session total: `GuidedTranslationProperties` / `GuidedModelRequest` `maxOutputTokens > 32000` (per-call bound), the 262144 witness / body / gateway byte caps, `V20` migration check, `diagnostics.ts` `maxBytes`, `GuidedPlanningIntegrationTest:852` (`≤ 262144`, a weaker bound that stays true).
- Per-CSI daily budget (640,000 / 5,242,880) and `requireFits`: 98,304 and 786,432 still fit.
- OpenAPI, frontend, helm chart, migrations: no occurrence of these limits [V by repo grep].

### Findings the ruling did not list

1. **`publication-fixtures.json` pins the bundle hash.** The ruling §7 item 7 said fixtures "stay valid [I]". That is false for this one file. `tools/check-studio-observed-contracts.cjs:890` asserts `publication.build.schemaBundleHash == hash(observedSchemas.json)`. Run on an overlay with the new schemas and the **original** fixture it fails (`receipts/contracts-checker-negative-control.txt`); with the patched fixture it passes (`receipts/contracts-checker-after.txt`). This is the same re-pin STUDIO-OBS-015 correction-05 did (`…/contracts/correction-05/build-pin-update.json`).
2. **`GuidedPlanningIntegrationTest` hard-codes `31000`** in `underCeilingLateDeltaSurvivesRefusedNextReservation[output]`. At 98,304 that case would no longer land near the ceiling. The input arm already used `inputCeiling(id)`.
3. **`evaluate.mjs` `measureProposals` defaults** pinned 32000 / 262144 and the verdict id `REFUTES_7_PROPOSALS_PER_SESSION_ASSUMPTION`.

## 4. Harness design decisions (item 9) — [AUTO-DECISION], please review

- `[AUTO-DECISION]` **`computeAdmission` takes a required `proposalPlan`** `{plannedProposals, contingencyFactor, inputBytesPerCall | inputTokenCap, basis}`; caps are `ceil(plannedProposals × contingencyFactor) × maxOutputTokensPerCall` for output and `× inputBytesPerCall` (or the explicit cap) for input. A missing or malformed plan throws `ADMISSION_PROPOSAL_PLAN`. Reason: the ruling asks for "an explicit plan" and the project rule is one path, no compat layer, so the old `sessions × totals` formula and `--sessions` are removed. Check: 579 × 1.5 → 869 proposals → output 3,559,424 and input 28,475,392 at 32,768 B, inside the existing ledger caps 3,904,000 / 31,981,568 (ruling §4) [V by smoke run, `receipts/harness-smoke.txt`].
- `[AUTO-DECISION]` **Stop rule:** `session.modelProposals × perCallCeiling` (capped at the session totals) is charged when a session reports no tokens; the full session totals stay the last resort. Reason: ruling item 9 says "recorded reservations, not the session totals" but the harness has no per-attempt reservation list, only `counters.modelProposals`. In practice `run.usage.*Tokens` are already the backend's reservation counters, so the new tier rarely fires. If @architect meant something else, only `createStopRule` and its two call sites change.
- `[AUTO-DECISION]` `measureProposals` default totals → 98,304 / 786,432, verdict id renamed `REFUTES_PROPOSALS_PER_SESSION_ASSUMPTION` (it fires above 24 now). The saved `ep/b7-measured-summary.json` keeps the old id as history. The 2026-10-18 B7 reading stays reproducible by passing the old totals; a test does that.

### Ledger entries to append after the code lands (not in the patch)

Run from `studio-runner/`; entries 1–4 stay untouched (append-only chain). The CLI exits 2 for a refused status; that is expected and the entry is still appended.

```sh
LEDGER=../docs/qa/evidence/STUDIO-OBS-009/execution-20261018/ep/budget-admission.json
node evaluation/cli.mjs admission-record $LEDGER --purpose ac7-benchmark \
  --planned-proposals 579 --contingency 1.5 --input-bytes-per-call 32768 \
  --plan-basis "MODEL-SIZING ruling-draft sections 4, 7, 9.1, 10: 193 proposals per repetition x 3, x1.5; 32768 B per call = 786432 / 24" \
  --measured ../docs/qa/evidence/STUDIO-OBS-009/execution-20261018/ep/b7-measured-summary.json
node evaluation/cli.mjs admission-record $LEDGER --purpose ac8-schema-probe --no-manifest \
  --planned-proposals 3 --contingency 1 --input-bytes-per-call 65536 \
  --plan-basis "MODEL-SIZING ruling-draft sections 7, 9.1, 10; AC-8 schema probe: 3 calls at the per-call input cap"
```

Both stay `ADMISSION_REFUSED_PRICE_UNKNOWN` until B8 / U7. `--plan-basis` is the only free-text field the entry has, so the ruling reference goes there.

## 5. Narrow verification after applying (names, with expected outcomes)

**Static, no build, seconds** (all [V] on an overlay except where marked):
1. `node tools/build-studio-observed-schemas.cjs --check`
2. `node tools/check-studio-observed-contracts.cjs` → exit 0, last lines `PASS codegen: 25 guided schemas, 32 replay schemas; four byte-identical outputs…`
3. `node tools/check-studio-current-catalog.cjs` **[NOT RUN]**
4. `epoch-probe.cjs` as in §2.3.

**Runner unit tier** (from `studio-runner/`, no dist needed): `./node_modules/.bin/vitest run test/generated-contracts.test.ts test/evaluation test/observedV3TupleValidation.test.ts test/observedReplayValidation.test.ts test/runtime-versions.test.ts test/pins.test.ts --coverage.enabled=false` **[NOT RUN]**. `test/evaluation/budgetAdmission.test.ts` type-checks (`tsc --noEmit` on an overlay, exit 0) and its new logic passes in a node smoke [V]; vitest itself was not run. After the dist rebuild also `test/guided`.

**Backend, one Gradle hold** (fully-qualified classes, not wildcards: a wildcard `--tests` selects only the `verifyRunnerDist` check and runs 0 tests): **[NOT RUN]**
- `…studio.guided.translation.GuidedDefaultModelReservationIT` (expect 5 tests)
- `…studio.guided.session.GuidedWireContractTest` (detects a stale epoch)
- `…studio.guided.session.GuidedSessionIT`, `…GuidedCsiBudgetIT`
- `…studio.guided.translation.GuidedPlanningIntegrationTest` (esp. `underCeilingLateDeltaSurvivesRefusedNextReservation[output]`)
- `…studio.guided.publication.ObservedArtifactLowererTest` (spawns the runner dist; reads `build.schemaBundleHash`) and `…GuidedPublicationMigrationTest` (build-identity consumer)
- dist-bound: the `guidedIncrementalTest` budget-evidence methods of `GuidedPublicationReplayIT` (collector rules). They write `model-budget-evidence-*-final.json`, which now carries `derivedProductionCeiling` per session.

Formatting: google-java-format 1.22 `--skip-reflowing-long-strings` is clean on the four smaller Java files; the two new `GuidedPublicationReplayIT` hunks are clean in a wrapper (`receipts/format-check.txt`). Never run the Spotless IDE hook on `GuidedPublicationReplayIT`: it is not gjf-clean at base and the hook rewrites the whole file.

## 6. Risks

1. **Unrun backend tests.** The 24-reservation loop in `GuidedDefaultModelReservationIT` runs 24 real prompt assemblies against Postgres instead of 7; a per-session attempt cap in `GuidedTranslationStore` would show only there [I: none seen in the code I read].
2. **Silent epoch fallback.** A wrong `SESSION_SCHEMA_EPOCH` does not throw at startup (§2.3).
3. **Old runner vs new backend.** A runner image on the old bundle refuses `maxModelOutputTokensTotal` above 32000 in the context (ruling §2 A risk 2). Backend and runner images roll out together.
4. **The `derivedProductionCeiling` assertion is hard** (`proposals × 4096 ≤ frozen output total`). It holds for the B7 peak (14 × 4096 = 57,344 ≤ 98,304); a fixture session with more than 24 proposals would fail it.
5. **Harness redesign.** `admission-record` now refuses without `--planned-proposals`, `--contingency`, one input flag and `--plan-basis`; `sessionsOverride` / `--sessions` are gone; the old verdict id is renamed. Nothing outside `studio-runner/evaluation` and its test used them [V by grep].
6. **Other lanes.** AE-01 / FM-01 land in the same window. If they edit any `contracts/v3` schema, the bundle hash moves again: use `repin-publication-fixtures.cjs` and re-run the epoch probe.
