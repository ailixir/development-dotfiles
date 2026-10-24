# Gateway chart guard design — bounded 009 remediation

Status: unapplied draft. Owner Gage (@devops), co-execution with @dev under 009 T1/T2. Independent architecture/QA review and root quiet-window execution remain required. Declared shared ceiling USD500; actual spend unavailable.

## Existing requirement and owner

`STUDIO-OBS-009.story.md` T1 assigns Dockerfile/Helm/values, mounted config → chart values and fail-closed/render tests to @devops with @dev. T2 assigns the transport/profile/credential deployment chain to the same owners. The existing helper immediately above `put-checks.springConfig.validateProperties` states: “Additional config outranks packaged ${ENV_ALIAS:default} placeholders. Keep chart-owned controls on their dedicated values/Secret path, including nested/relaxed key spellings.” `values.yaml` says chart-managed controls are reserved and not to duplicate packaged ENV aliases. This is an existing chart ownership invariant, not a new provider policy.

## Exact scope

Seven existing API env facts are chart-owned: provider, endpoint, project, location, model, credentials.mode and credentials.service-account-key-file. The last uses the packaged placeholder STUDIO_GATEWAY_CREDENTIALS_KEY_FILE, a distinct spelling of the same dedicated file-path fact. Add the seven current normalized canonical names plus that one placeholder alias to the existing configOverrides protected list; keep all seven old studiocompilegateway* entries. No prefix-wide deny rule.

Run the same guard through its existing API and worker calls. The worker shares the packaged configuration and mounted-source validation, even though the chart currently emits these seven gateway variables and the gateway credential mount only on the API. Do not add a worker gateway env/mount or change runtime bean selection.

Do not reserve request-timeout, max-concurrency, max-input-bytes, max-output-bytes, max-output-tokens, thinking-level, provider-features.system-instruction or provider-features.thinking-config: none has a studioGateway dedicated chart value. Keep generic env/envFromSecrets policy unchanged. No new public setting, default or rendering expression.

## Precedence qualification

The concrete static defect is incomplete enforcement of that ownership rule. MountedSpringConfigurationTest.canonicalEnvironmentValuesOverrideMountedValuesWithoutLosingMapKeys explicitly demonstrates canonical env properties outrank mounted properties. Most dedicated gateway aliases also resemble canonical names. Therefore this draft does not claim that every current mounted key defeats live chart env values. The service-account-key-file property instead reads the differently named STUDIO_GATEWAY_CREDENTIALS_KEY_FILE placeholder in application.yml; both spellings describe one chart-owned path. Actual runtime binding/precedence for any candidate remains unexecuted. No exploit is claimed.

## Proof design

1. Source census binds every dedicated env, property, value owner and credential mount, with exact source hashes.
2. New integration-render tests reject all eight normalized names in flat, nested and relaxed forms on both backend and worker, matching the named error property. Legacy seven stay rejected on both. Tuning settings and ordinary custom properties keep rendering.
3. Copied-chart mutations remove one current token at a time and demonstrate the corresponding override renders, establishing the negative tests discriminate rather than another provider/profile guard preempting them. No real chart is mutated by these tests.
4. Valid-render equality compares the complete manifest against a copied chart with only the eight additions removed, over all four values sets with existing harness pins/catalog inputs. It therefore covers env, provider/profile, TLS, observed catalog/policy and credential mount preservation for these accepted inputs.
5. Root first applies only the test patch and records the predicted red; then applies the helper-only patch and records green, mutations, runner type/lint and complete deployment tier in a quiet window. All runtime expectations above are plans until executed.

## Freeze and exclusions

Original B1 remains live per root. Actual source/dist/quoted documentation and Helm are frozen. This lane writes only this evidence directory, reads current sources, computes hashes, reconstructs patches and dry-runs patch applicability. No Helm/Node/tests/build/Docker/Git/provider/process signal/application/lifecycle/QA verdict is allowed now. Root owns all later application and execution.
