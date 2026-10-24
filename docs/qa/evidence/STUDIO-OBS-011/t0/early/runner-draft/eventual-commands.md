# Commands prepared, not executed

Root first establishes original B1 terminal receipt/end capture, B7 terminal receipt, disposition of the B1 cause/coverage obligations, tree-open and a quiet machine. Sandbox start is a root action, not authorization inferred from this draft. There were no compiler, formatter, app, suite, browser, container, install or provider executions in this preparation. Commands below do not apply the separately BLOCKED conditional patch.

Run once at an available root-assigned quiet window, using a new outside-repository sandbox path. Commands assume zsh/sh; all paths are quoted. If a command fails, keep its actual exit and logs and diagnose it rather than continuing as if green. `prepare-sandbox.py` is unexecuted and requires root's gate declaration. It parses the exact T0-DEV COPY/MKDIR list, verifies copied captured inputs against S_011, creates regular copies rather than symlinked roots, adds the v5 conservative application.yml input, saves a before tree and applies only the seven manifested drafts to the after tree.

```sh
export OBS011_REAL_REPO='/Users/brunobuger/orca/workspaces/put-checks/ui-studio'
export OBS011_RT_DRAFT="$OBS011_REAL_REPO/docs/qa/evidence/STUDIO-OBS-011/t0/early/runner-draft"
export OBS011_RT_SANDBOX='/private/tmp/obs011-rt-root-approved-01'
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
# Set this only after root actually verifies the named gates:
export OBS011_RT_ROOT_QUIET_WINDOW='B1_TERMINAL_B7_COMPLETE_TREE_OPEN'
python3 "$OBS011_RT_DRAFT/prepare-sandbox.py" "$OBS011_REAL_REPO" "$OBS011_RT_SANDBOX"
node --version > "$OBS011_RT_SANDBOX/node-version.txt"
pnpm --version > "$OBS011_RT_SANDBOX/pnpm-version.txt"
node "$OBS011_RT_DRAFT/ast-equal.self-test.mjs" "$OBS011_REAL_REPO" > "$OBS011_RT_SANDBOX/ast-self-test.json"
node "$OBS011_RT_DRAFT/ast-equal.mjs" "$OBS011_RT_SANDBOX/before-repo" "$OBS011_RT_SANDBOX/repo" "$OBS011_REAL_REPO" "$OBS011_RT_DRAFT/exact-comment-allowance.json" > "$OBS011_RT_SANDBOX/ast-equality.json"
node "$OBS011_RT_DRAFT/test-name-map.mjs" "$OBS011_RT_SANDBOX/before-repo" "$OBS011_RT_SANDBOX/repo" "$OBS011_REAL_REPO" "$OBS011_RT_SANDBOX/deferred-name-map.json"
```

The self-test requires pure-wrap=0 unexpected differences; identifier, string, template-literal text, comment, statement order and comment-movement mutants each≥1. Additional controls require the one full-comment exact replacement to pass only at the authorized path, and a second comment edit, wrong allowance or wrong path to fail. This was **not run** during B1. Self-test output is evidence about the checker only.

Type-check, lint and full unit, Node24, pnpm only:

```sh
cd "$OBS011_RT_SANDBOX/repo/studio-runner"
pnpm --config.package-manager-strict=false run type-check > "$OBS011_RT_SANDBOX/type-check.log" 2>&1
pnpm --config.package-manager-strict=false run lint > "$OBS011_RT_SANDBOX/lint.log" 2>&1
pnpm --config.package-manager-strict=false exec vitest run --coverage.enabled=false --minWorkers=1 --maxWorkers=2 --reporter=default --reporter=json --outputFile="$OBS011_RT_SANDBOX/unit-vitest.json" > "$OBS011_RT_SANDBOX/unit.log" 2>&1
```

Before fixtures changes sandbox dist, perform two equivalent complete compiler emits against the original and drafted trees. Use the same pnpm, Node24, TypeScript5.9.3/config and relative `dist` path in each copy; emit no application processes. Never point this at the actual runner. The two copied dist trees start as D_009r, and compare-emit uses the same compact-JSON/path/hash digest algorithm as the authoritative capture-manifest tool.

```sh
cd "$OBS011_RT_SANDBOX/before-repo/studio-runner"
pnpm --config.package-manager-strict=false exec tsc -p tsconfig.build.json > "$OBS011_RT_SANDBOX/emit-before.log" 2>&1
cd "$OBS011_RT_SANDBOX/repo/studio-runner"
pnpm --config.package-manager-strict=false exec tsc -p tsconfig.build.json > "$OBS011_RT_SANDBOX/emit-after.log" 2>&1
python3 "$OBS011_RT_DRAFT/compare-emit.py" "$OBS011_RT_SANDBOX/before-repo/studio-runner/dist" "$OBS011_RT_SANDBOX/repo/studio-runner/dist" > "$OBS011_RT_SANDBOX/emit-comparison.json"
```

`compare-emit.py` exits1 for any complete-dist artifact difference and reports JS-only differences separately. Preserve and review the report even on exit1. A change is **not accepted by a green unit suite**. For any moved digest, carry AC-4(d) unless root accepts the exact old/new full digests, path list and reason in writing. The allowed client comment rename is expected to change emitted JS because `removeComments` is not enabled, but no emit was run to prove its exact output. If root declines acceptance, reformat/comment changes stay carried rather than being represented as completed. No actual dist rebuild/copy-back is authorized here.

Full fixtures, only after root records emit disposition; this emits sandbox dist through its existing setup and runs native browser fixtures in the quiet window:

```sh
cd "$OBS011_RT_SANDBOX/repo/studio-runner"
pnpm --config.package-manager-strict=false exec vitest run --config vitest.fixtures.config.ts --minWorkers=1 --maxWorkers=1 --reporter=default --reporter=json --outputFile="$OBS011_RT_SANDBOX/fixtures-vitest.json" > "$OBS011_RT_SANDBOX/fixtures.log" 2>&1
```

Root/QA reconcile the full unit and fixtures **ordered test identities/statuses** against the credited unchanged-input B2/B3 or explicitly authorized fresh before-tree reports. Only four R-40 names may disappear from unit skipped entries. All15real criteria remain skipped and never passed; no other skip, case, assertion or oracle can disappear. The historical29→25 expectation is not a substitute for actual named reconciliation. The guarded browser-oracle test is neither dropped nor credited while T0-EP is OPEN.

Source checks (static; show actual remaining guard references):

```sh
cd "$OBS011_RT_SANDBOX/repo/studio-runner"
awk 'length($0)>140' src/guided/contracts.ts src/guided/diagnostics.ts src/guided/evidence.ts src/guided/json.ts src/guided/transport.ts src/run/guidedBrowser.ts
rg -n 'example-manifest|browser-oracle' evaluation test scripts src package.json
```

Expected first command: no lines. Expected second while T0-EP stays open: the named README references plus CLI exception and the retained guarded file remain; **do not assert zero**. If and only if root receives actual harness-owner confirmation, it may separately review `conditional/BLOCKED-retire-after-T0-EP.patch`, date the note to the real application day, list both retirements under G5/G11, recheck every remaining reference, and record a new separately hashed conditional manifest.

Root archives sandbox seed receipt, all exact commands/exits/logs, Node/pnpm/TypeScript versions, checker/self-test, full named reports, emitted JS/full-dist before/after digests, root's emit disposition, and final per-file hashes under execution/rt. Only after independent QA accepts those proofs does 11-MERGE receive the seven-file copy-back manifest. Re-verify each real before hash and draft after hash before applying. Copy back **no** dist, runtime/ownership/generated files, node_modules, package or lockfile. The active copy-back manifest does not include the blocked conditional patch. Final 11-G remains mandatory and this lane's runs remain non-credited except where the plan explicitly grants credit.
