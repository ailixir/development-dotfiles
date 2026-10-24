# Fresh runner B2–B6 recovery baseline receipt

All eight fresh collector commands exited zero against source `507228c984235dee043ec3310d84a04710517c9efe143a4ac70ed2c27d3cef1d` and dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`. Every actual result, report hash and before/after manifest was inspected. Source, test inputs and dist stayed byte-identical during all commands. No source change, dependency install, formatter, image build/pull/retag or lifecycle action occurred. This is local baseline evidence only; no 011 Done or production credit.

Node `v24.20.0` (explicit fnm installation PATH), pnpm `10.33.0`, Helm `v4.2.0+g0646808`. Existing repository-root `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py` supplied runner cwd and reporters. Files prefixed `obs011-recovery-20261020-` remain in `docs/qa/evidence/STUDIO-OBS-011/execution/`.

| Check | Exit | Actual result |
| --- | ---: | --- |
| B2 unit | 0 | 2,643 passed / 0 failed / 29 historical skips; 2,672 cases, 117 files |
| B3 fixtures | 0 | 296 passed / 0 failed / 9 historical skips; 305 cases, 27 files |
| B4 complete deployment | 0 | 722 passed / 0 failed / 0 skipped; 10 files |
| B5 type-check | 0 | Passed |
| B5 lint | 0 | Passed |
| B5 check:pins | 0 | Asserted host copies agree; two NOT ASSERTED fields remain |
| B6 contracts | 0 | Seven public oracle summaries passed |
| B6 codegen check | 0 | 25 guided schemas / 32 replay schemas; four byte-identical generated outputs |

B2’s existing global and per-directory coverage gates were enabled unchanged and passed: lines/statements 97.8%, functions 97.81%, branches 90.12%. Coverage summary is separately archived by the collector; its SHA256 is in `b2-unit-summary.json`. All 2,672 unit and 305 fixture case names match G9b exactly. The 29/9 skip identities match exactly with no additions or removals; per-case status/name inventories are in the corresponding summaries. No skip was treated as a pass.

B3 kept its normal TypeScript-API globalSetup enabled and regenerated dist byte-identically. Its 22 changed fixture evidence artifacts were archived under the fresh collector label and their historical originals restored by the established collector. Only the public artifact index was inspected; no raw private capture/body/stdout dump was exposed.

B4 used `STUDIO_RUNNER_IMAGE=sha256:f8bcb56378b9277f5947a915b25bfdd483e3898ea6dd31681c3ad39d3b616cdf`. Exact local image ID was inspected immediately before and after B4 and matched; preflight also verified `pwuser` and the expected `sh -c`/`ulimit -c 0`/`exec node` command. All 642 prior deployment cases remain, plus the 80 gateway cases. One unchanged SEC-2 prerequisite case interpolates the selected image into its name: the historical tag became the authorized exact ID. An initial evidence-audit assertion expecting only 80 raw name additions failed on that title pair; the corrected reconciliation records the exact old/new titles, 80 actual additions and zero test failures. No test was changed or rerun for this audit correction.

B5 check:pins ran without `--require-image`, as requested. `dist/runtime-versions.json.chromiumBuild` and `.image` are null and explicitly NOT ASSERTED. Playwright copies agree at `1.63.0`, recorded Node is `v24.20.0`, and `.nvmrc`/engine floor agree at 24; this does not assert an internal image or its browser build.

B6 used only the existing contract oracle and `build-studio-observed-schemas.cjs.check()`; no generator write. Its actual public result counts and remaining scope qualifiers are preserved in `quality-summary.json`.

190 preflight chart/test/config/document pins and six quoted runbook/README/stage pins were rechecked after all commands, with zero deltas. These supplement the collector scope, which excludes the Helm chart and some quoted runbooks. Historical evidence remains intact. Shared USD500 ceiling retained; aggregate spend UNKNOWN.

Exact commands, with fresh labels; the collector appended default/JSON reporters to Vitest commands:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b2-unit01 pnpm --config.package-manager-strict=false exec vitest run --minWorkers=1 --maxWorkers=2
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b3-fixtures01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.fixtures.config.ts --minWorkers=1 --maxWorkers=1
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b4-deployment01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b5-types01 pnpm --config.package-manager-strict=false run type-check
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b5-lint01 pnpm --config.package-manager-strict=false run lint
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b5-pins01 pnpm --config.package-manager-strict=false run check:pins
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b6-contracts01 pnpm --config.package-manager-strict=false exec node ../tools/check-studio-observed-contracts.cjs
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-recovery-20261020-b6-codegen01 pnpm --config.package-manager-strict=false exec node -e 'console.log(require("../tools/build-studio-observed-schemas.cjs").check())'
```

`preflight.json`, `quoted-doc-pins.json`, image-before/after, the three tier summaries, `quality-summary.json` and `final-verification.json` bind versions, commands, statuses, complete case names/skips, coverage, hashes and the audit correction. Collector JSON nested-suite counts are retained as reported; file counts above come from actual report file entries.

Remaining work: subsequent implementation and final/IR/regression/QA gates, all 21 external inputs, and existing real-provider/internal-image/cluster/staging/live/security obligations. The complete local deployment tier is now executed; it does not replace those obligations. Single runtime lane is idle and handed back to root after this receipt.
