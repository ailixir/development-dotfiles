# Minimal pending011FE packet

Preparation only. No application source, story, test configuration, package, lockfile, generated output or dist was changed, and no Node/test/type/lint/build command ran. Root must assign the next execution window; backend diagnostic currently owns execution.

Base HEAD: `b39359f78118d87be7d94a9429a5dde9d16634c8`. All three target bytes match post-recovery-source.json. Full target/candidate hashes and proof are in manifest.json. Only this packet directory was written.

1. Apply `01-tests-only.patch` first. It reuses the resume2 positive declared-secretId control and negative name-only-reference case exactly. All18 existing cases,49 expect calls and zero skips remain byte-identical. Candidate has20 cases,55 expect calls and zero skips.
2. Run the planned red collector command with the old handler. Require the added name-only case to fail at its report assertion, the declared-secretId control to pass, all18 existing cases discovered and passing. Compilation, setup, no-tests or infrastructure failure is not a genuine red.
3. Only after valid red, apply `02-implementation.patch`: remove `secretId ?? name` fallback and correct its comment; rename only the unused Reports parameter `event` to `_event`. Re-run the exact focused collector command under a new green label, then unchanged strict-unused command.

All patch bytes are reused from t0/early/frontend-draft/resume2. Byte comparisons regenerate the same diffs, remove the exact additive test block to restore the existing test file, and constrain implementation to two handler replacements and one Reports identifier replacement. This is static preparation evidence only.

Planned commands (from repository root, sequential; NOT EXECUTED):

```sh
export PATH="/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py obs011-recovery-20261020-mirror-red01 -- pnpm exec vitest run src/services/mocks/studio/studioHandlers.test.ts --minWorkers=1 --maxWorkers=2
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py obs011-recovery-20261020-mirror-green01 -- pnpm exec vitest run src/services/mocks/studio/studioHandlers.test.ts --minWorkers=1 --maxWorkers=2
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py obs011-recovery-20261020-unused01 -- pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Root rechecks target hashes and unused labels before application/execution. The existing collector sets frontend cwd, attaches JSON reporters, and captures actual runtime/source/dist/result evidence; no exclusion flag or collector change is proposed. execution-plan.json records phase preconditions and expected assertions.

No scope conflict was found. The actual Reports path is frontend/src/pages/ReportsPage/ReportsPage.tsx. Skill-configured devLoadAlwaysFiles and pt/es fallback directories are absent; no replacement files or standards were invented. Deferred citation extraction, audit deletion and optional authoring mirror work remain excluded.

Original product scope and21 external inputs remain. Required fresh baseline and final affected/full gates remain outstanding; this packet grants no story, lifecycle, release or product-gate credit.
