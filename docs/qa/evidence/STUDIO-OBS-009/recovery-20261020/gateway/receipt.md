# STUDIO-OBS-009 gateway recovery integration receipt

Bounded T1/T2 implementation applied under root’s two-target window on 2026-10-20. The controlled-recovery decision supersedes the historical original29815 restoration prerequisite; no historical evidence or abandoned run was credited. Shared USD500 ceiling retained; aggregate spend UNKNOWN. No story Done, QA verdict, product release or deployed behavior claim.

Exact reviewed draft manifest `2fb7008ce20c4a5de47c17b790daa0bfb66e25a00452351b4b08ed6a944ea516`; combined patch `30080476f4b6fdf3a7c1ec3dd7ad06ef050ff6342f5cca6a73000110bff68b0d`. Both original target hashes were checked immediately before tests.patch; tests-only candidate and original helper were checked before red. Helper.patch then produced the exact reviewed candidates, without corrective edits or fuzz/offset.

| Target | Before SHA256 | After SHA256 |
| --- | --- | --- |
| `helm-chart/put-checks/templates/_helpers.tpl` | `976cc0e8cd9a97240fa18651481172d89354fbd59b8131bb47437973ad45962f` | `a5cd97461ef1320a73d9a36b4ababcf343fee79007df8b0a28f569b0c381d73e` |
| `studio-runner/test/deployment/integrations.test.ts` | `6358d5d008ea3545df78719d5c2e66bc16f5cdf564e17af8056bd9d3e57d302b` | `38c101be9a0d466d12ac7fc6c08b4614b4e918e189feabce7059ac6ca7d29907` |

Node `v24.20.0` from `/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin` prepended to PATH; pnpm `10.33.0`; Helm `v4.2.0+g0646808`. Every command below used repository-root `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py <label> ...`; collector supplied `studio-runner` cwd and JSON/default reporters.

| Fresh label | Exit | Actual result |
| --- | ---: | --- |
| `obs009-recovery-gateway-red01` | 1 | 95 collected; exactly 48 selected expected failures, 47 filter skips, zero infrastructure failures |
| `obs009-recovery-gateway-green01` | 0 | 134 passed, zero failed/skipped; 95 integration + 39 unchanged envfrom-key controls |
| `obs009-recovery-gateway-types01` | 0 | Runner TypeScript passed |
| `obs009-recovery-gateway-lint01` | 0 | Changed integration-test ESLint passed |

Exact child commands (collector labels match the rows):

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs009-recovery-gateway-red01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts '--testNamePattern=(backend|worker) rejects (flat|nested|relaxed)'
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs009-recovery-gateway-green01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts test/deployment/envfrom-keys.test.ts
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs009-recovery-gateway-types01 pnpm --config.package-manager-strict=false exec tsc -p tsconfig.json --noEmit
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py obs009-recovery-gateway-lint01 pnpm --config.package-manager-strict=false exec eslint test/deployment/integrations.test.ts
```

Every red failure was `expected true to be false` at integrations.test.ts:310:28: the override rendered successfully through Helm, then the refusal assertion failed. The exact-message assertion was not reached in red. `verification.json` reconciles all 48 case identities with their intended property/error path. Green executed both assertions for those same cases. It also passed all other 32 additions: 14 legacy denials, two permitted-tuning/custom controls, eight private copied-chart token-removal controls (both components per case), and eight full-manifest byte-equality controls (four values sets × two credential modes). No redundant subset rerun followed full green.

Original integration-test body remains contiguous and byte-identical; all final target bytes match reviewed previews. Seven legacy guard tokens remain, eight exact tokens added, no prefix-wide denial or generic env/secret policy change. Relevant unchanged Helm/backend/harness pins from the original proof were rechecked. Canonical environment precedence and the distinct credential placeholder remain qualified; accepted render equality establishes only these harness inputs.

All four actual result receipts were inspected: `sourceStable`, `testInputStable` and `distStable` are true. Collector source digest is `eea0bd1380b216d8211c2af396e0896af867bc0eb3f68ca88382fc6b10993d4b`; compared with post-recovery capture, its only changed member is the authorized integration test. The established collector excludes Helm from that source manifest; exact helper hashes above bind that target separately. Dist stayed `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`. No build/dist/package/lockfile/other source changes occurred in this lane.

Evidence: `verification.json` contains final target/review pins, actual commands/statuses and log/report hashes, red paths, all 134 green names, preservation checks and exact remaining gates. Native collector artifacts are under `docs/qa/evidence/STUDIO-OBS-011/execution/` with the four labels above. Red report SHA256 `d9e8221df63644acde586c54224fb9f34a03fd26c89e418750a8001aee58f80c`; green report SHA256 `1359a0f57028b0172c1cca15d1cf3a6baa807896f6582bd5f207c6b09a5a520f`.

Execution-sequence disclosure: the full draft receipt/design/future-verification, older Aria gateway009 review, and current independent Quinn review were read before application. The current Aria `990b104e…` assessment was located through Quinn’s manifest and read directly after green, before type/lint; it had already been bound/summarized by Quinn. Direct reading of current Aria was later than requested. Its content required no further source correction, and both current review manifest/payload pins now verify. The established collector internally invokes read-only Git listing/HEAD commands; no direct Git operation or Git mutation was performed.

Remaining gates (unrun here):

- Complete vitest.deployment.config.ts tier without file filters, with actual Helm/Docker/verified approved existing local image prerequisites; no Docker/image query/build/pull/run in this lane.
- Retained independent copied-chart recursion/normalization falsification obligations from future-verification.md; no new matrix/framework authored.
- Final affected suites and independent QA/root review.
- Backend runtime binding/full backend check and executed fresh JaCoCo remain separate root gates; none run here.
- All existing external/live/human/security requirements and 21 external inputs remain owed; no provider/credential/deployed behavior proved.

The next full-tier command remains `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py <fresh-label> pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts`, only after root binds the approved existing local image and actual Docker/Helm prerequisites. No image reference is invented. No Docker, image, backend, provider, network/contact, private runtime, baseline, cleanup, commit/push/deploy or lifecycle action was performed here.
