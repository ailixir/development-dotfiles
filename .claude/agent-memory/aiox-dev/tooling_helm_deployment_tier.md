---
name: tooling-helm-deployment-tier
description: Running studio-runner's helm deployment tier (vitest.deployment.config.ts) — loader-key dependency on runner config.ts, scratch overlay recipe, docker tag-inspect quirk, helm.ts guided options
metadata:
  type: project
---

Deployment tier recipe (STUDIO-FLEX-001 lane D, 2026-10-25):

- Run: `cd studio-runner && ./node_modules/.bin/vitest run --config vitest.deployment.config.ts --exclude test/deployment/sec2.test.ts` (~70 s, 770 tests; two runs back to back exceed the 120 s tool limit, so script it and use run_in_background). `timeout` does not exist on macOS.
- Tests named "the runner's own loader accepts the environment the chart renders" call the real `src/server/config.ts` `loadConfig`. Any new chart-rendered `STUDIO_RUNNER_*` key stays red until the runner lane adds it to `KEY_SPECS`. To prove the chart side alone: rsync `studio-runner` (no node_modules/dist) into a scratch dir, symlink `node_modules`, and give the scratch parent symlinks to `helm-chart`, `backend`, `docs` (tests read `packageRoot/../backend` and `../docs`), then add the keys to the scratch `KEY_SPECS` as `kind: 'string', required: false`. Result then: all green except docker tests.
- Docker-dependent chart tests (image facts) can fail with "image does not exist locally" while `docker image ls` lists the tag: Docker Desktop's `docker image inspect <tag>` returned "No such image" but inspect by image ID worked. Run with `STUDIO_RUNNER_IMAGE=<id>` (id from `docker image ls`). Not caused by chart changes.
- `test/deployment/helm.ts` options: `guided: true` layers the full guided overlay; `guided: false` now forces guided OFF (values-uat.yaml ships it on); `guidedInputs` (default true for UAT) layers only the three fake token inputs; `observedInputs` is the same idea for the catalog. A new "off" assertion over all value sets must pass `guided: false`.
- zsh does not word-split `$X`: wrap multi-flag helm invocations in a bash script (`r.sh <default|uat|dev|prod> [args]`), `--set 'list={a,b}'` renders a list, and `sed -i ''` is required (BSD).
- Python here has no `yaml` module; inspect rendered manifests with `helm template --show-only <template> | grep`.
