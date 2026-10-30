---
name: tooling-contract-bundle-hash-reseal
description: Editing bridge/assignment-stop (replay closure) moves the replay bundle hash; checker names the new value; Merkle reseal script reuse; epoch check by fragment-level $ref reachability; proof-lane result/stop/error edits
metadata:
  type: project
---

Proof-replay contracts lane (2026-10-25). What was non-obvious:

- **Any v3 edit reaching the replay closure (bridge, assignment-stop) changes `observedSchemas.json` and so `build.schemaBundleHash`** in `publication-fixtures.json` (~25 copies, hashed into job/binding/artifact). Run `node tools/build-studio-observed-schemas.cjs`, then the checker: it fails at `runPublication` with `actual` (old) vs `expected` (new bundle hash). Take `new` from that message.
- **Reseal reuse:** the 2026-10-23 script `scratchpad/dex-r057/merkle-reseal.cjs` (under session 6550adce…, may be purged) works with two changes: drop `addScope`, and build `t0` from the working-tree files (so hand edits survive) while `base` is a copy of the pre-change files. Run with `PRE=old:new`. First prove it is a no-op (PRE empty -> byte-identical files). Only `publication-fixtures.json` changed (108 hash lines); the observed-reference mirrors did not embed the bundle hash.
- **Textual closure over-reports for GuidedContracts epochs** (`replay-validation` "reaches" bridge by file, not by fragment). Fragment-level `$ref` reachability from session/replay-validation/ledger/observation showed none hit `bridge#/definitions/stop`, `assignment-stop`, `result` or `error`; `GuidedWireContractTest` (18/18) stayed green, so the epochs did not move.
- **error.schema.json is the closed code list for backend 4xx on internal routes** (precedent NO_APPLICATION_URL); `bridge#/definitions/refusal` is the runner's own list (checker pins its order, ends with POLICY_DENIED). Do not put backend refusals there.
- **Result-schema changes ripple to every result-shaped fixture**: fixtures.json loginResult/tooLongResult/recordingResult, publication-fixtures positive/negative and 11 `incrementalContracts.resultCases`. A required field needs `"proof": null` in each; PUBLISHED ones also `video: null`. Negative cases must be mutation-checked (blank one rule at a time, confirm its own case flips).
- **Backend `--tests` wildcard selects `verifyRunnerDist`**: list FQCNs. Runner unit suite: only `test/pins.test.ts` fails on this host (Node 23.10 vs engines >=24.11), unrelated.

Related: [[tooling-contract-reseal-merkle-and-ripple]], [[tooling-contract-lane-gotchas]], [[tooling-verify-runner-dist-wildcard]].
