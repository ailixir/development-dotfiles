---
name: tooling-contract-lane-gotchas
description: C-lane (v3 contracts/openapi) hidden couplings - guided bundle audit, replay bundle hash/epoch, witness reseal chain, $ref literal walkers, ajv strict, attributable negatives
metadata:
  type: project
---

Learned applying STUDIO-OBS-013 C1 (2026-10-13). These are things a contract edit triggers that no ruling had foreseen.

- **Guided bundle audit.** Any `$ref` from a guided-closure schema (bridge, session, runner-context…) pulls the target file into `studio-runner/src/guided/schemas.json`. `src/guided/contracts.ts` `auditSchemaBundle` allows only `format` date-time|uri. `result.schema.json` carries `format: uuid`, so bridge→result threw SCHEMA_CONFIGURATION at module load: every guided test file failed, and guidedMain would too. Fix used: put the shared definition in its own self-contained v3 file.
- **Replay bundle hash.** `replay-validation` reaches `bridge`, so ANY bridge edit changes `observedSchemas.json` and `OBSERVED_SCHEMA_BUNDLE_HASH`. Consumers read it at runtime, and the `2740ec92…` literal in fixtures is not a pin. GuidedContracts epochs did NOT move for bridge/result edits (verified with the overlay; see [[tooling-schema-epoch-overlay]]).
- **$ref extraction breaks literal walkers.** `ExecutionVideoContractTest`, `ExecutionVideoEvidenceIT` (`ContractDocument.at` does not follow `$ref`) and frontend `studioContract.test.ts` walk `responses['404'].content…` on getExecutionVideo. Moving those responses to `components.responses` reddens them, which is AR-1 SC-5.
- **New op = 3 pinned copies.** StudioContractTest (total/status map) is C-lane. ExecutionVideoContractTest's attribution set and public-401 count (29) are B13-owned.
- **Checker tool.** `tools/check-studio-observed-contracts.cjs` is in no lane's file list, yet it hard-codes the guided route count and JSON-only 2xx bodies.

Learned applying STUDIO-OBS-014 C2a (2026-10-13):

- **clarification is in the replay closure.** `replay-validation` ObservedQuestionContext.question `$ref`s `clarification.schema.json`, so a clarification edit moves `REPLAY_VALIDATION_SCHEMA_EPOCH` (backend main, GuidedContracts) and the replay bundle. The guided bundle does not include clarification.
- **Publication witness reseal chain.** `publication-fixtures.json` observedChoice question → `receipt.contextIdentityHash` → basis → `publicationEvidenceHash` (artifact.replayPolicy and hashes) → `hashes.referencePolicyHash = hash(artifact.replayPolicy)` → `hashes.artifactHash`. The checker does not check referencePolicyHash; the runner's `deriveObservedArtifact` does. `ObservedArtifactLowererTest` pins the artifact hash as a literal.
- **ajv strict + runner audit.** In ajv strictRequired mode, a `then` with `required` must restate those `properties`. The runner bundle audit has no `anyOf`, so express "absent" as `properties: {x: {not: {}}}`.
- **Negative controls must be attributable.** A SCHEMA fixture can be refused for a different rule than the one it is meant to test. Mutate each rule away and confirm that its own case flips.

**How to apply:** before any v3/openapi edit, grep for the consumers above. Measure T0 numbers on a scratch mirror tree (symlink root node_modules). Run `vitest test/guided` as well as the contract tests.

Learned applying STUDIO-OBS-014 C2b (2026-10-13):

- **Required runner-context fields reach 14 fixture instances.** `fixtures.json` embeds runner contexts in flow, materializations, source, assignmentTrace, assignmentContextWithoutOwner and observationRefreshFlow, not only `documents.context`. An architect spec that names only `documents.context` was checked in scratch with ajv alone, not with the full checker. Walk for objects with `materializationRevision`+`authoredInputsHash`+`limits`.
- **The observed-reference mirror is a second copy of the C2a reseal.** `studio-runner/fixtures/observed-reference/accepted-observed-choice.json` must canonically equal `publication-fixtures.json` `observedChoice`, or `write-runtime-versions.mjs` throws "stale" and blocks every dist build. Resync it in the same unit as any observedChoice reseal.
- **dist goes stale after every bridge edit.** It then stays stale until ROOT rebuilds at the sync point. Do not rebuild dist mid-S3 while the runner cutover patch is still out of the tree, because other lanes' guided ITs spawn it. To prove the S3 state, use a scratch copy with `git apply` of the R14 patch (symlink node_modules).
- `fixtures.json` holds lone-surrogate escapes, so a Python round trip needs `ensure_ascii=True`.

**How to apply:** this adds to the "How to apply" above. Measure T0 checker counts by running the checker in a mirror of the T0 copies.
