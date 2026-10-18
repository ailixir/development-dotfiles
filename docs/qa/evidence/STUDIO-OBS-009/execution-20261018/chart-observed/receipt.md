# Receipt: observed-replay chart change (architect ruling OI-06, section B5)

- **Author:** Gage (@devops), 2026-10-18, YOLO. Source ruling: `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` section B (B5 = the spec).
- **Status:** prepared, **not applied**. Nothing under `helm-chart/`, `studio-runner/`, `backend/`, `tools/`, `docs/specs/` or `.github/` was written. No git write, no docker, no cluster, no vitest, no Gradle.
- **Legend:** **[V]** = I ran it or read the cited line today. **[I]** = inference, basis stated.

## 1. What is here

| File | What it is |
|---|---|
| `chart.patch` | Unified diff against the real `helm-chart/` (6 files, +309/-5). |
| `tests.patch` | Unified diff against the real `studio-runner/test/deployment/` (4 files, +494/-6). |
| `helm-template/` | One log per `helm template` case, `SUMMARY.txt` (47 cases, 0 unexpected), lint logs, the stage-8 CI commands, `baseline-vs-after.log`, `uat-diff-vs-baseline.diff`, four rendered manifests, `verify-render.log`, `tsc-sandbox-tests.log`, and the two scripts that produced them. |
| `samples/` | TEST-ONLY catalog and policy values (and the negative-case fixtures). Every hash is a repeated digit; origins use `example.test`. |

**Applying (after G9 exits):** from the repo root, `git apply docs/qa/evidence/STUDIO-OBS-009/execution-20261018/chart-observed/chart.patch` and the same for `tests.patch`.
[V] `git apply --check` passes for both against the current working tree. [V] Applying both to a scratch copy of the real files gives a result byte-identical to the sandbox.

**The base is the dirty working tree, not HEAD.** `git status` shows `helm-chart/put-checks/templates/_helpers.tpl`, `configmap.yaml`, `deployment.yaml`, `studio-runner-deployment.yaml` and the values files already modified. The patches were cut against those bytes. If any of them changes before apply, re-cut. sha256 (first 16 hex) of the bases:

```
ecf26fc7d6302a5c  helm-chart/put-checks/templates/_helpers.tpl
313cc206956c20af  helm-chart/put-checks/templates/configmap.yaml
48e4b93212714a35  helm-chart/put-checks/templates/deployment.yaml
bbd9b293f2fd2726  helm-chart/put-checks/templates/studio-runner-deployment.yaml
74c76c7ddca34972  helm-chart/put-checks/values.yaml
6e3f91478666e446  helm-chart/put-checks/values-uat.yaml
c3fa17d92f0f27ab  studio-runner/test/deployment/helm.ts
e6b666c81b20c6c4  studio-runner/test/deployment/chart.test.ts
7c396f8bba48aac7  studio-runner/test/deployment/backend-env.test.ts
bf6cd992771152e0  studio-runner/test/deployment/envfrom-keys.test.ts
```

## 2. Names taken from the code, not from the ruling [V]

| Fact | Source |
|---|---|
| Runner keys are `STUDIO_RUNNER_` + `OBSERVED_{VALIDATION_ENABLED,REPLAY_ENABLED,CATALOG_FILE,POLICY_FILE,IMAGE_DIGEST}` | `studio-runner/src/server/config.ts:177-181` (KEY_SPECS), prefix `:20`; read as `env.STUDIO_RUNNER_OBSERVED_*` at `application.ts:339-349` and `runtime-versions.ts:126-145` |
| Flags accept only `'true'`, `'false'` or unset | `application.ts:341` |
| Backend properties `studio.observed-replay.catalog-json` and `policies-json`, both `String`, default `"[]"` | `ObservedReplayProperties.java:16-17`; `application.yml:269-270` (the new backend test parses `application.yml` and asserts both keys) |
| Backend bounds: array of at most 16, at most 65,536 bytes | `ObservedReplayPins.java:24-29` |
| Catalog file is exactly `{build, profile}`; `build` has the five `BuildIdentity` keys, four of them `^[a-f0-9]{64}$`, no extras | `runtime-versions.ts` (`Object.keys(catalog).sort() == 'build,profile'`); `replay-profile.schema.json` `BuildIdentity` |
| `digest === build.executableImageDigest` (digest = the env value, no `sha256:` prefix) | `runtime-versions.ts:137` |
| Backend catalog is an array of entries and `selected()` takes the first | `ObservedReplayPins.java` `selected()` |

## 3. B5 item by item

| B5 | Done | Where |
|---|---|---|
| 1 `studioObserved` block, off by default | yes, plus `mountPath` | `values.yaml` |
| 2 five keys on the closed list (48 to 53) | yes, 53 names, all in the loader's `ACCEPTED_KEYS` [V by script] | `_helpers.tpl` `acceptedEnvKeys` |
| 3 chart-managed, not settable through `runnerEnv` | yes, by prefix `STUDIO_RUNNER_OBSERVED_` | `_helpers.tpl` `studioRunner.env` |
| 4 flags both directions; file and digest keys only while either flag is on | yes | `studio-runner-deployment.yaml` |
| 5 image pinned by catalog digest while on | yes: `<repository>@sha256:<digest>`; tag ignored; tag form when off | `studio-runner-deployment.yaml` |
| 6 ConfigMap `<fullname>-studio-observed-trust`, read-only directory mount, mode 0440 | yes (`catalog.json`, `policies.json`, `\|-` so no trailing newline) | `configmap.yaml`, deployment |
| 7 backend through `springProperties`, runner entry first | yes, api and worker | `_helpers.tpl` `backend.springProperties` |
| 8 guards G-O1..G-O4 | yes, `put-checks.studioObserved.guard`, called from the API and the runner Deployment | `_helpers.tpl`, `deployment.yaml`, `studio-runner-deployment.yaml` |
| 9 `values-uat` on, catalog and policies not committed | yes | `values-uat.yaml` |
| 10 catalog producer script | **not mine: open item 1** | |
| 11 co-rollout | unchanged; comment in `values.yaml` says a runner image change always comes with a new catalog file | |

## 4. What I ran (against the SANDBOX chart only) [V]

- `helm template` x 47 cases (`helm-template/SUMMARY.txt`): 13 positive, 3 intended deploy-time-input failures, 25 guard cases (G-O0..G-O4), 6 `runnerEnv` refusals. **0 unexpected.** Helm used: v4.2.0 (local). CI's Helm version is not known to me.
- `helm lint`: default values, and values-uat with the TEST catalog and policies: both exit 0. The two stage-8 commands of `studio-runner/ci/stages.md` pass verbatim (`stage8-ci-commands.log`), because stage 8 renders default values (observed off).
- **Regression:** default, `values-dev` and `values-prod` render **byte-identical** to the unchanged chart (`baseline-vs-after.log`). UAT differs only by the added lines (`uat-diff-vs-baseline.diff`).
- `verify-render.log` (node + the `yaml` package, parsing the rendered manifests): image digest = env digest = `catalog.json` digest = first backend catalog entry; the backend `catalog-json` and `policies-json` parse back to exactly the ConfigMap files; with `additionalBackendCatalog` the runner entry is first and the runner file holds only its own; flags off renders no file key, no ConfigMap, no mount and no backend property; the pod still has one container and the same Secret volumes as before.
- Two template mutations on scratch copies: removing the 16-entry comparison lets 17 policies render (the real chart refuses); removing the runner-enabled comparison lets "observed on, runner off" render with no runner (the real chart refuses).
- `tsc --noEmit` over the sandbox copy of `test/deployment/*.ts` with the project's strict flags: **0 diagnostics** (`tsc-sandbox-tests.log`). `esbuild` parses all four edited files.

**Not run:** vitest and the deployment tier (as instructed), eslint, any cluster or pod, docker. The new tests are written and type-checked but **have never executed**. I checked each new case by running its `helm template` equivalent from the CLI, which is evidence the chart behaves as the test expects, not that the test passes. [I] Expect a few first-run surprises in the assertions (for example how `--set` types a value) before they are green.

## 5. Test changes (for @qa to check against the tier)

**Existing assertions that must change, or the tier goes red:**

1. `helm.ts` (harness). `values-uat.yaml` now enables observed replay and commits no catalog or policies, so **every UAT render fails by design** without them. The harness now layers a TEST catalog and policies over every `values-uat.yaml` render (`observedInputs` defaults to true for it), the same device as `TEST_PIN`. This is what keeps every `VALUE_SETS` test in `chart`, `edge`, `scaling`, `integrations`, `dump-settings`, `tls-client-cert`, `backend-env` and `envfrom-keys` rendering UAT. Without it, all UAT cases fail with `studioObserved.catalog`.
2. `envfrom-keys.test.ts`, "the ONLY additions are the chart-owned runner-chain properties". The UAT API and worker now carry `studio.observed-replay.catalog-json` and `policies-json`; the filter now admits exactly those two names.

**Closed list 48 to 53:** [V] no existing assertion pins 48 (searched `48`, `fifty`, `acceptedEnvKeys`, `ACCEPTED_KEYS` in `test/deployment`). The existing key tests compare rendered names to the loader's `ACCEPTED_KEYS`, and the five new keys are already in it. The change is therefore a **new** assertion, which pins 53 by reading the `define` block (the one place a source read is the criterion, because no render exposes the list), checks each name is in `ACCEPTED_KEYS`, and checks the five are present.

**Existing assertions examined and left unchanged:**
- AC-9a "no `POLICY` environment key" (chart.test.ts, near line 1003). It renders default values, where observed is off, so it still passes. **Its premise changes**: with observed on, `STUDIO_RUNNER_OBSERVED_POLICY_FILE` is a policy-named key by ruling. I added a companion that pins it as the only such name when on. @qa/@architect: confirm that O-6's intent ("no destination-policy field smuggled in through the deployment") is met by a file path that the chart manages and `runnerEnv` cannot set.
- Runner image test ("names the runner image from values"): default render, tag form. UAT is now digest form; nothing asserts a UAT tag.
- The four `mutatedChart` anchors in `_helpers.tpl` and `studio-runner-deployment.yaml` are still unique after the edit [V by grep on the sandbox]. The TLS/guided chart-managed message is untouched (observed has its own `fail`).
- `ci/stages.md` stage 8: unchanged, still passes (above).

**New cases (counted by reading, not by running):** about 59, i.e. 52 in `chart.test.ts` and 7 in `backend-env.test.ts`.
- `chart.test.ts`: closed list (1); five keys + a future key refused through `runnerEnv` (6); OFF in dev, prod, default and UAT-with-flags-off (4); UAT on (1); ON over all four value sets: five keys, digest pin, mount, ConfigMap, one catalog in three places (4); loader accepts the rendered env (4); validation-only and replay-only (2); tag ignored (1); no new Secret volume or container (1); pod rolls on a policy change (1); AC-9a companion (1); guards (22) plus 16-policy boundary, "G-O4 only while on", and the two mutations (4).
- `backend-env.test.ts`: property names read from `application.yml` (1); api and worker JSON strings (2); not via environment (2); `additionalBackendCatalog` order and runner never sees it (1); absent when off, and `checksum/config` moves (1).

## 6. Beyond the B5 text (please confirm or strike)

- **Boolean check (G-O0).** Each flag must be a real bool. `--set-string studioObserved.replayEnabled=false` yields the string `"false"`, which is truthy in a template and would switch the feature on while the manifest says off. Fails with `must be a boolean`.
- **Comment fix.** B5 item 2 asks for the comment "fifty-seven accepted, fifty-three rendered at most". [V] the loader has 57 keys; the closed list now has 53; the other four (`INSTANCE_ID`, `SERVICE_IDENTITY`, `CALLBACK_IDENTITY`, `CALLBACK_BASE_URL`) are rendered by the Deployment directly or left to the runner. The comment says that instead.
- **G-O4 reach.** It normalises like `springConfig.validateProperties` (lower-case, alphanumerics only), so nested maps and relaxed spellings are caught, and it reserves the environment aliases `STUDIO_OBSERVED_CATALOG_JSON` / `STUDIO_OBSERVED_POLICIES_JSON` as well as the Spring names.
- **G-O2** also checks `additionalBackendCatalog` entries (same `BuildIdentity` rules) and requires hashes to be quoted strings (an unquoted all-digit hash is a YAML number and loses digits).
- **Pod annotation** `checksum/studio-observed-trust`, so a policy-only change rolls the runner (it reads the files once). The backend already rolls through `checksum/config`.

## 7. Open items

1. **@dev: catalog-entry producer.** A runner script (ruling suggests `studio-runner/scripts/print-observed-catalog.mjs`) that prints `{profile, build}` from the built image, takes the manifest digest as an argument and validates with the `BuildIdentity` schema; it exists today only inline in `ObservedCoRunIT.java:290-310`. Then **@devops** adds the CI step after the image push that runs it inside the pushed image and emits `observed-catalog.<digest>.yaml` in the shape of `samples/observed-catalog.TEST-ONLY.yaml` (`studioObserved.catalog.{profile,build}`). Until then no real UAT render is possible. The chart checks the shape only, **not** that `profileHash` is the hash of `profile`; that equality is checked by the runner and backend at start-up and use.
2. **@pm: name the owner of `studioObserved.policies` per environment** (which applications and origins are trusted). The ruling's default is the pilot application owner with Security & Compliance, applied by @devops. Format: `samples/observed-policies.uat.TEST-ONLY.yaml`. The file is integrity-relevant configuration; it should sit under the same change control as `values-uat.yaml`.
3. **UAT now needs three deploy-time inputs**: the controller pin (`--set-string`, B-19), the catalog file and the policy file (`-f`). The ruling asks @devops to document them in **one UAT deploy note**; I have not written it (outside this task's outputs).
4. **@po: placement** as a carried 009 residue against AC-1 / U4, append-only; this must not read as an AC pass. 009 AC-7 / AC-12 deployed legs, G-1 and the pilot stay blocked until the patches are applied **and** items 1 and 2 are done.
5. **Sequencing.** Apply only after G9 exits. The patch moves the helm digest, so the 010 live-surface list is re-measured for the chart categories at the 009-Done re-date. The sandbox TEST pin and TEST catalog are not deployment values.
6. **First smoke after a real deploy (U4):** `/v2/validate-observed` and `/v2/runs` do not answer 503, and publication does not answer 409 `RUNTIME_INCOMPATIBLE`. Not testable here.
7. **Gaps I noticed and did not close** (outside the ruling's G-O4 list):
   - `backend.envFromSecrets` / `worker.envFromSecrets` could still carry `STUDIO_OBSERVED_CATALOG_JSON`; G-O4 checks `env` and `configOverrides` only. Cheap to add if @architect agrees.
   - [I] Spring resolves `${...}` placeholders in property values, so a policy string containing `${` would be rewritten by the backend and not the runner. Not guarded.
   - [I] `toJson` writes `&`, `<`, `>` as `&`, `<`, `>`. The JSON value is the same after parsing, and I expect both consumers hash the parsed value, but I did not read the canonicalisation code to confirm.
   - [I] The ConfigMap volume is mode 0440 and relies on the pod's existing `fsGroup` for the runner user to read it, as the guided key ConfigMap does today. Not observed in a pod.

## Autonomous decisions

- [AUTO-DECISION] Run the `synapse:*`, `coderabbit-review` and `checklist-runner` skill texts attached to the dispatch? -> No (reason: unrelated to the chart mission; the dispatch forbids tests and builds; CodeRabbit needs WSL and a real diff, and nothing was committed).
- [AUTO-DECISION] Put UAT's test inputs in the harness rather than in `values-uat.yaml` or a committed fixture file -> harness (reason: B5 item 9 says the real files are not committed and the render must fail without them; the harness already does the same for the controller pin).
- [AUTO-DECISION] Add the boolean check and the `additionalBackendCatalog` shape check -> yes (reason: a string-typed flag silently inverts the feature; both are one-line `fail`s naming the key). Listed in section 6 for veto.
- [AUTO-DECISION] Keep the four rendered manifests only -> default, default with runner, UAT observed, UAT with an additional backend catalog (reason: the other renders are 800-1500 lines each and are reproduced by `run-cases.sh`; individual logs for the unkept ones still end with a "rendered manifest" line that points at a file not stored here).
