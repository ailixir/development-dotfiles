# Independent gateway recursion/normalization controls

**Limited QA verdict: both retained copied-chart controls are supported by the intended assertion failures.** The unchanged 48-case refusal matrix detects removal of recursive validation and path normalization. This closes these two local falsification obligations from the existing gateway `future-verification.md`; it supplies no lifecycle, release, deployed/provider, runtime Spring-binding or external-security credit.

I applied aiox-qa and read the actual helper/test/harness/configuration, original future-verification plan, current gateway receipt and fresh complete runner-baseline receipt. Preparation remained source-only until root's explicit GO. After GO, I ran exactly the two retained controls sequentially, with Node24 PATH and `pnpm --config.package-manager-strict=false`. No new test, framework, wrapper, package/dependency/configuration change, full deployment rerun or permanent token-removal rerun was added.

## Actual results

| Private helper mutation | Raw exit | Selected cases | Passed | Intended assertion failures | Filter omissions | Native/infrastructure errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Remove the unique recursive include | 1 | 48 | 32 | 16, all nested | 47 | 0 |
| Replace scoped normalization expression with raw `$path` | 1 | 48 | 0 | 48, all flat/nested/relaxed | 47 | 0 |

Each report collected the existing 95 cases from one unchanged test file. The exact 48 executed `fullName` identities match the earlier actual gateway matrix; all 47 remaining identities were omitted by `testNamePattern`. These are diagnostic filter omissions, **not new approved gate skips**. The eight permanent token-removal controls and unrelated rendering cases were not executed again. The earlier complete deployment tier's 722/zero-skip result remains separate evidence and was not rerun or borrowed as a result of these controls.

Every selected failure is exactly `AssertionError: expected true to be false` at the copied `studio-runner/test/deployment/integrations.test.ts:310:28`, the original `expect(outcome.ok).toBe(false)`. Thus Helm returned a successfully parsed render for an override that the unchanged test required it to refuse. The later exact-error-message assertion was not reached in those failed cases. All 16 nested names failed for recursion; normalization failed all 16 relaxed names as required and also all 16 flat and 16 nested names because raw dotted/uppercase paths no longer match normalized protected tokens. Full per-case identities/statuses are retained in `verification.json`; raw JSON reports retain the original failure stacks.

No failure was accepted as a mutation kill merely because rendering failed, Helm was missing, a package failed to load, or a hook failed. Complete selected identities reconcile; every actual failure has the intended assertion/type/location; the file-level error message is empty; no unhandled/load-error banner appears in either raw log. Native/infrastructure errors are therefore zero within these two commands. Reporter suite counters are retained literally: each reports two failed and one passed nested suites across one actual file. They are not three separate executed files.

## Exact scope and preservation

Actual helper SHA256 remained `a5cd97461ef1320a73d9a36b4ababcf343fee79007df8b0a28f569b0c381d73e`; actual test remained `38c101be9a0d466d12ac7fc6c08b4614b4e918e189feabce7059ac6ca7d29907`.

Two separate private repo-shaped copies contain the complete public chart and the unchanged direct test-import/config/package closure: **32 pinned source/input files per copy**. Existing installed dependency entries are symlinked; the `node_modules` parent is private, leaving test caches/config temporaries in the copy. No install, package edit, build or dist write was performed. The actual test, `helm.ts`, `corpus.ts`, deployment config, TypeScript config, package/lock/npmrc/Node-floor files and chart inputs were copied unchanged.

Both anchors occur exactly once **inside** the final `put-checks.springConfig.validateProperties` definition. Only that definition was edited. The recursive control removes its nested `include ... (dict "values" $value "path" $path)` action; the normalization control replaces only `regexReplaceAll "[^a-z0-9]" (lower $path) ""` with `$path`. The observed-replay normalization outside this definition and every other helper byte remain untouched. No global replacement, token-list change, test assertion edit or bypass flag was used.

| Control | Mutant helper SHA256 | Mutation diff SHA256 |
| --- | --- | --- |
| recursion | `f444f16f59e8ae0abbe6494eb30ee204939e07c8b520ebd9299a1e4f6638a305` | `67ee161a4fa6573bab4242a7a4f471df1f33957b8d4133ab80bb49e64125e4a6` |
| normalization | `602614d7c463ae5db21505cd6deee22c330aaf502a691c715a6bc575dd418fe3` | `bc8c9598fc06a4a3d87ff0e0ee4d9e3c20071b417b1409fee338c38207bd0876` |

Immediately before execution, both copies' full 32-file bindings matched their expected mutant/helper and unchanged-input hashes. Immediately after each command, the same bindings still matched and all 32 actual repository inputs remained unchanged. I then restored **only that private copied helper** from the pinned actual original and verified all 32 copied files again equal their original inputs. Both private helpers are restored; mutation diffs, before/after facts, reports and logs remain preserved. No tracked source, actual chart, dist, dependency or unrelated evidence was edited. These are named-input checks, not an invented repository-wide capture.

## Commands and evidence

Each command ran from its own `private/<control>/repo/studio-runner` directory with `/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin` prepended to PATH:

```sh
pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts test/deployment/integrations.test.ts '--testNamePattern=(backend|worker) rejects (flat|nested|relaxed)' --minWorkers=1 --maxWorkers=1 --reporter=default --reporter=json --outputFile=<absolute-control-report-path>
```

The two exact absolute argv/cwd/report/log paths and terminal tool receipts are in `recursion-command-result.json` and `normalization-command-result.json`; raw exits remain 1. Tool sessions 64746 and 93875 are terminal. The existing collector hardcodes the actual repository's runner cwd and global capture scope, so it was not suitable for these copied-chart commands. Equivalent exact command, raw exit, log/JSON hashes and named input bindings were retained directly, without introducing an execution wrapper.

`preparation.json` SHA256 is `941b61de23f3686972167d5e803ae6814ac9920022cb47a69a7c31100293a806`; `verification.json` is `d278b98dbf46949217027629ba6c9fbf41448cda3bd2b9e37def9dd69a983d40`. The latter binds both raw JSON/log hashes, complete 48-case outcomes, post-run source pins and private restoration. `selected-case-identities.json` reuses the earlier actual gateway names/property paths without copying historical outcome credit. No author mutation helper or author checker was executed.

Two evidence-reader assumptions were rejected and corrected without rerunning tests: per-case filter status is `skipped`, although the top-level count is named `numPendingTests`; and Vitest counts nested suites separately from files. `audit-reader-correction.json` preserves both corrections. Neither was a native failure, changed assertion, new run or altered result.

The heavy execution window is handed back to root with both commands terminal and private inputs restored. All product/Live/functional-accessibility/security/external/final gates remain unchanged and owed where applicable. Original29815 remains abandoned, failed and uncredited; its restoration administration is superseded. No Docker/image query/build/pull/retag/deploy, provider/contact, secret/private capture/protected baseline-body access, staging, commit or push occurred. Whole-wave USD500 ceiling remains; aggregate spend and external inputs remain unknown.
