# Quiet-window execution plan — NOT EXECUTED

Root must first revalidate the original B1 terminal receipt/end capture, finish the required baseline adjudication, and open source/Helm writes explicitly. This package is outside the 011 main-code lanes but still waits for their source freeze. Independent architecture/QA review and single ownership of these two targets precede apply. Recheck manifest original hashes immediately before application; drift requires rebase/review, never fuzz.

The only executable operation already run is `python3 docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft/verify-static.py`; it performs source/patch checks and `patch --dry-run`. It does not render or invoke Node.

All commands below are plans for root after the gate. Run each sequentially and inspect each receipt before the next. Fresh labels are mandatory if any named receipt already exists. Do not repeat a running label. From repository root, use the established Node24 path and existing execute-011 collector (runner cwd):

```sh
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft/verify-static.py
```

## Red: tests alone against original helper

```sh
patch --batch -p1 -i docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft/tests.patch
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-red01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts --testNamePattern='(backend|worker) rejects (flat|nested|relaxed)'
```

Prediction, not an observed result: all 48 current-name negative cases fail because the missing names are not denied; each must actually reach the expected override path, rather than fail on a missing Helm binary/provider/profile/catalog prerequisite. Archive testcase identities, actual exit and rendered failure details. The alias case distinguishes credentials.key-file from service-account-key-file normalization. Legacy/tuning cases are excluded from this red command; no existing test is removed or skipped in the full green run.

## Green and mutations

```sh
patch --batch -p1 -i docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft/helper.patch
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-green01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-mutations01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts --testNamePattern='mutation: removing only'
```

The full green command includes the existing integration tests plus a statically predicted 80 new invocations (48 current-name refusals,14 legacy refusals,2 allowed-tuning controls,8 copied-chart token mutants,8 valid full-manifest equality controls). Vitest collection is authoritative; reconcile it before credit.

Each permanent mutation creates a private copied chart, verifies exactly one matching token exists, removes that token only, then renders the corresponding flat override successfully on both API and worker. That is a counterfactual control: another guard must not mask the missing gateway entry. The 48-case matrix separately protects recursive and normalized forms. In independent QA, additionally mutate the recursive include and normalized comparison in the final validateProperties helper on a private repo-shaped runner/chart copy and rerun the same matrix; nested and relaxed refusal cases respectively must fail. The exact mutation anchors are the final helper's `include "put-checks.springConfig.validateProperties" (dict "values" $value "path" $path)` and `regexReplaceAll "[^a-z0-9]" (lower $path) ""`. Verify unique anchors inside that helper before replacing; never globally replace the same normalization used by observed-replay guards. No such extra mutation has been authored/applied/run by this draft.

The eight equality controls compare complete rendered manifests of the patched chart with a private copy missing only the eight new tokens. They cover all four shipped values sets under both ADC and file-credential mode. Existing TEST_PIN and observed fixture setup remain the harness's inputs. This proves unchanged valid rendering only if actually executed; it is not live deployment, real credentials, policy approval or backend binding evidence.

## Quality and deployment tier

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-types01 pnpm --config.package-manager-strict=false exec tsc -p tsconfig.json --noEmit
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-lint01 pnpm --config.package-manager-strict=false exec eslint test/deployment/integrations.test.ts
```

Root then binds STUDIO_RUNNER_IMAGE to the verified existing locally approved image from its receipt, checks the full tier's actual prerequisites, and runs:

```sh
: "${STUDIO_RUNNER_IMAGE:?Set the verified existing local image reference from the root image receipt}"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs011-gateway-chart-deployment01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts
```

Do not pull/build/deploy solely to fill this variable from this plan. No image reference or prerequisite success was verified by this lane. The full suite includes Docker-dependent cases and must be reported as unrun until root's quiet window and actual prerequisites allow it; narrow integration renders cannot stand in for it. Record source/dist plus explicit original/final helper hashes, exact test counts, skips, node/pnpm/Helm versions and JSON report hashes. No build or dist change is required by the two proposed source edits. Runtime Spring binding remains separate if architecture/QA requests it.

## Broader policy disclosure

Current generic `env` and explicit `envFromSecrets.keys` mapping allows non-selector aliases and can emit names also emitted by dedicated chart env entries. The validator reserves Spring source/profile selectors, not every chart-owned alias; JAVA_OPTS, datasource secrets and transport tuning are intentional existing consumers. Kubernetes duplicate-env semantics and gateway effective property precedence were not executed here. This is for root/architect policy disposition, not an implicit green proof or a policy expansion in this patch. The chart-owned credential placeholder is reserved only in configOverrides because application.yml visibly uses it for the same dedicated file path.
