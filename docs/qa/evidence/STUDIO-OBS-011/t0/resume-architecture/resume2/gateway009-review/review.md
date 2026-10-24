# STUDIO-OBS-009 gateway chart draft — independent static review

Aria, 2026-10-19. **No mandatory source correction found in this two-path draft. The concrete chart ownership correction is statically supported, conditional on the actual held-input window ending and fresh staged/render/mutation/full-tier verification.** All80 new cases remain planned and uncollected. No application, runtime/QA/W1/Done or release credit is established.

## Reviewed identity and workflow

Combined patch SHA256 `30080476f4b6fdf3a7c1ec3dd7ad06ef050ff6342f5cca6a73000110bff68b0d`; manifest `2fb7008ce20c4a5de47c17b790daa0bfb66e25a00452351b4b08ed6a944ea516`.

| Target | Actual/original SHA256 | Complete candidate SHA256 |
|---|---|---|
| `helm-chart/put-checks/templates/_helpers.tpl` | `976cc0e8cd9a97240fa18651481172d89354fbd59b8131bb47437973ad45962f` | `a5cd97461ef1320a73d9a36b4ababcf343fee79007df8b0a28f569b0c381d73e` |
| `studio-runner/test/deployment/integrations.test.ts` | `6358d5d008ea3545df78719d5c2e66bc16f5cdf564e17af8056bd9d3e57d302b` | `38c101be9a0d466d12ac7fc6c08b4614b4e918e189feabce7059ac6ca7d29907` |

I independently reconstructed the individual and combined patches in memory against captured originals and checked actual target bytes. Every preimage, candidate and patch hash matches. Existing test bodies after imports are byte-identical, and the entire helper delta is exactly its comment plus eight list entries. No author verification script, Helm, Node/TypeScript, tests, compiler, Gradle, Docker, Git, provider command, process signal or mocked runtime was executed. Only this exclusive review directory was written. `audit.json` records independent static facts; author successful-check flags are not rendered evidence.

Actual009 is `InProgress`, SHA `9d5dca2df3262dad4a2b411a712c3ccf2844923d53cf0e0297b61020337c6e4c`. I independently removed the exact added developer record/changelog row and reversed only the status field, obtaining original `395ed4f6…` bytes exactly. The prior AC/task/QA/history text therefore remains intact. Current formal preflight `gateway009-review-preflight.json` names009InProgress/safe. The older located gateway preparation preflight names009Ready/safe; I did not locate a separately named gateway formal-review rejection artifact in the searched paths and do not claim to have inspected one. No historical preflight/rejection/evidence was altered or used as current approval.

## Intended source behavior

The existing helper/values ownership rule reserves managed controls for dedicated values/Secret inputs. Actual API rendering emits seven gateway facts: provider,endpoint,project,location,model,credentials mode and credential-file path. Current backend records bind `studio.gateway`; the original protected list instead has seven `studiocompilegateway…` entries. The candidate adds exactly:

- `studiogatewayprovider`, `studiogatewayendpoint`, `studiogatewayproject`, `studiogatewaylocation`, `studiogatewaymodel`;
- `studiogatewaycredentialsmode`, `studiogatewaycredentialsserviceaccountkeyfile`;
- `studiogatewaycredentialskeyfile`, the distinct packaged `STUDIO_GATEWAY_CREDENTIALS_KEY_FILE` placeholder spelling of that same dedicated file-path fact.

All seven legacy tokens and all unrelated protected tokens remain in their original order/count. The existing lower-case/strip-nonalphanumeric comparison, recursive map traversal, exact error path, profile/source selector restrictions and component invocation boundaries remain byte-identical. The API and worker both invoke this validation for their mounted `configOverrides` when enabled. Worker still emits no dedicated gateway environment entries or gateway credential mount; the patch adds neither. Flat, recursively nested and relaxed names normalize to the exact eight protected identities. The early protected-name comparison does not depend on the leaf's value type; the patch does not change existing map traversal, type handling or establish a new claim that every arbitrary Spring binding spelling is supported.

No prefix-wide gateway deny is introduced. Transport timeout/concurrency/byte/token budgets, thinking level, provider features and ordinary custom properties remain allowed through this mechanism because they have no dedicated `studioGateway` owner in the current chart. Existing generic `env`/explicit secret-key validation, renderer, ConfigMap routing, profile/provider checks, credentials modes/mounts, TLS/pins, observed catalog/policy and defaults are unchanged. No new target, policy or provider/security behavior is added to the correction.

## Precedence and scope limits

The current mounted-config test explicitly proves canonical environment values outrank mounted values for its concurrency/map example. The package correctly treats the concrete defect as missing enforcement of the chart's mounted-config ownership rule; it does not claim every gateway mounted value overrides live canonical environment properties. Canonical `studio.gateway.credentials.service-account-key-file` and packaged placeholder `STUDIO_GATEWAY_CREDENTIALS_KEY_FILE` are different spellings and both are covered, without pretending they are identical canonical bindings.

Raw generic env and explicit envFromSecrets key mapping can still accept other aliases/collisions under their existing selector-only validator. This patch leaves that policy intact. No duplicate-env/runtime-precedence exploit was executed or established; this bounded mounted-property correction cannot be described as proving universal gateway configuration confinement or closing that broader policy question.

## Planned tests and discrimination

Source inspection independently yields80 new Vitest invocations, not a collected result:

| Planned group | Cases | Intended evidence |
|---|---:|---|
| Eight current names × three shapes × API/worker |48| Render refuses with the exact offending property path |
| Seven legacy names × API/worker |14| Existing refusals remain |
| Allowed tuning/custom values × API/worker |2| Real mounted ConfigMap properties retain supplied values |
| One-token deletion controls |8| Private copied chart renders the corresponding flat override for both components |
| Four values sets × two credentials modes |8| Complete patched/counterfactual rendered bytes equal for accepted inputs |

`gatewayOverride` forms the nested and relaxed variants consistently with the existing helper normalization. Placeholder alias nesting is explicitly a chart normalization test, not an unexecuted Spring binding assertion. Refusal tests require both renderer failure and the specific managed-property message, so an unrelated provider/profile failure cannot pass them. Missing Helm throws through the existing harness rather than becoming a skip. The red command selects only48 refusal tests, avoiding the new-token anchors in controls that cannot run on the old helper.

The mutation controls create a private temporary chart, prove one exact new token exists, delete only that token before the measured render and require success for both components. They do not mutate the real chart. These are counterfactual controls, not observed mutation kills yet. Nested/relaxed refusal tests cover recursive/normalization behavior; the additional private-chart recursion and normalized-comparison mutants described for independent QA are still unprepared/unrun and must not be credited from this review.

The equality controls use the full render harness with its controller-pin/observed-fixture inputs and compare full raw manifests, not just environment snippets. On base/dev values the provider is disabled, so selecting file-credentials mode does not by itself exercise a Vertex credential mount; the existing positive Vertex/file-credential test and UAT/prod paths remain relevant. These controls prove only the actual accepted inputs they execute, not live Secret validity, every provider branch, runtime binding, shared deployment or provider access. All collection, render equality, TypeScript/lint and full deployment-tier outcomes remain unverified.

## Inputs, documentation integration and next conditions

All22 actual Helm files still match the held fullcheck03 plan membership/hashes. Both targets remain original, so no chart/source edit occurred during the live full check. Of the draft's22 source-proof snapshot inputs,20 still match; the two changed context files are `resume2-decisions.md` and the legitimate009 metadata update. The current decisions retain the narrow gateway draft/precedence qualification, and the009 inverse proves no requirement rewrite. No implementation-input drift was found. Keep this old snapshot historical; do not claim22/22 current equality or silently recapture it as proof.

I read the engineering-doc resume2 `studio-runner.md` preview, SHA `7465f8d012ab38ce43541fb12cbceda2c1dd91943da84058bd588afe89a657fe`. Its §11 dated note correctly discloses the **current original** legacy-only guard discrepancy and distinguishes canonical env from custom placeholder precedence. If the gateway correction later lands, that already-owned documentation re-audit must consume actual final chart evidence and reflect the updated status. It is not an additional target in this two-path patch; no document was edited here.

The draft's B1-live/quiet-window prose is historical preparation. Current execution must obey the live fullcheck03 held-input window and root's actual terminal/native/cohort/coverage/observer disposition, not treat an old B1 pointer as permission to edit. The newly reported sticky outer observer gap remains qualified; this static review neither resolves it nor predicts the native/full-check result.

After that actual window ends and root authorizes this serialized unit, revalidate exact two-target preimages and relevant current source facts, explicitly rebase/re-review on drift, stage tests-only red with fresh labels/intended assertion failures, then the helper and full green/counterfactual/recursion/normalization checks. Complete type/lint and the full deployment tier with the already-approved locally verified image and actual prerequisites; a narrow render subset cannot substitute for the tier. No pull/build/deploy/provider call is authorized merely by this review. Archive real rendered/test identities, skips and source/dist/Helm binding facts before any completion claim. Independent QA and all existing009 external/live/human/security obligations remain owed.

Shared declared ceiling USD500; actual spend unavailable. No W1 opening, task checkbox change, story Done, release readiness or runtime QA verdict is conferred.
