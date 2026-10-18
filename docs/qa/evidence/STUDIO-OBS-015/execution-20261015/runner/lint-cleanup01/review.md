# Runner full-lint cleanup (STUDIO-OBS-015, lint-cleanup01)

- **Author:** Dex-L (@dev, runner lint lane). **Date:** 2026-10-16.
- **Scope:** I edited only `studio-runner/test/**`. I made no edits to `src/`, `dist/` (except through `build`), package.json, lockfiles, eslint config, `tools/` or `backend/`. I ran no Gradle and made no commit.
- **Result: lint is NOT green.** It went from 112 errors in 12 files to **8 errors in 2 files**. All 8 are in generated `src` files that I am not allowed to hand-edit (see section 3).

## 1. Provenance

- **Was lint green at HEAD 734ad704f?** Yes. I extracted `git archive HEAD studio-runner docs/specs` into a scratch directory, symlinked the current `node_modules`, built dist, and ran `eslint .`. It exited 0 with no output (`lint-head-734ad704f.log`).
  - A first attempt without `docs/specs` and dist gave 570 errors. That was an artifact of unresolvable imports, so I discarded it.
- **All 12 failing files are uncommitted work.**
  - Modified: `src/executor/observedOperations.ts`, `src/guided/types.ts`, `test/fixtures-tier/guided-dataflow.test.ts`, `test/run/launcher.test.ts`, `test/run/observedReplayProtocol.test.ts`, `test/runtime-versions.test.ts`.
  - Untracked: `test/fixtures-tier/{browser-profile-safety,guided-recording,observed-bootstrap-refusal,observed-secret-control}.test.ts`, `test/observedV3TupleValidation.test.ts`, `test/run/childRuntimeTeardown.test.ts`.
  - `eslint.config.js`, `tsconfig*.json` and `eslint.boundary-rules.js` are unchanged from HEAD.

### Root cause of 104 of the 112 errors (verified)

1. `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` is **22,720,135 bytes** in the working tree. At HEAD it is 3,290 bytes, so the growth is uncommitted.
2. ESLint uses `parserOptions.projectService`, which runs tsserver. In tsserver, `maxFileSize = 4 * 1024 * 1024` applies to non-TS files (`typescript.js` `getFileTextAndSize`). A larger file has its contents skipped ("Skipped loading contents of large file"), so every static `import x from '…publication-fixtures.json'` is typed `error`.
3. `tsc` has no such cap, which is why `type-check` was always green.
4. Falsification: linting the 9 affected test files with a scratch config that swaps `projectService` for `project: tsconfig.json` gives 0 errors. The scratch config is not in the repo.
5. Conclusion: no rule is misconfigured. This is a tsserver size limit, so I did not change the eslint config.

The other errors:
- 1 `no-floating-promises`: `GuidedRuntime.update()` became `async` in uncommitted `src/guided/runtime.ts`. At HEAD it was synchronous.
- 8 `no-empty-object-type`: see section 3.

## 2. Fixes (type-only, plus one `void`)

| File | Change |
|---|---|
| `test/helpers/publicationFixture.ts` | `export` added to the existing `PublicationDocument` interface |
| 8 test files: `browser-profile-safety`, `guided-recording`, `observed-bootstrap-refusal`, `observed-secret-control`, `observedV3TupleValidation`, `childRuntimeTeardown`, `launcher`, `observedReplayProtocol` | Renamed the import to `<name>Json`. Added `import type {PublicationDocument}` and a typed view right after it: `const <name>=<name>Json as unknown as PublicationDocument`. `observedV3TupleValidation` uses `TestDocument<PublicationDocument>` because it needs index-signature compatibility. Casts that became redundant (`as Scope/ObservedJob/TrustedPolicy/Execute3/Launch3`) were removed with `eslint --fix` (`no-unnecessary-type-assertion`), along with the type imports that became unused |
| `test/runtime-versions.test.ts` | Same typed view: `TestDocument<PublicationDocument>&{observedChoice:{description:string}}` |
| `test/fixtures-tier/guided-dataflow.test.ts:51` | `h.runtime.update(h.context)` → `void h.runtime.update(h.context)` |

Every import is still the same static JSON import. The helper is imported with `import type` only, so it is erased and the 22 MB file is never read twice.

**Runtime neutrality (verified, `emit-diff.txt`).** I ran `ts.transpileModule` on all 11 files, before and after. The only emitted-JS differences are:
- the import binding rename plus `const x = xJson;` (the same object);
- `void` before `update(...)`;
- one pair of redundant parentheses.

**For review, not applied:** `await h.runtime.update(...)` is probably what the author meant. Other tests await it. It would surface a rejection inside the test instead of as an unhandled rejection, but it changes timing, so I left it as `void`.

## 3. Not fixed: 8 `no-empty-object-type` errors (BLOCKED, outside lane)

- **Where:** `src/executor/observedOperations.ts:34,35,140,144` and `src/guided/types.ts:58,59`.
- **Why they exist:** these files say "Generated … by tools/build-studio-observed-schemas.cjs. Never edit by hand." `test/generated-contracts.test.ts` calls `generator.check()`, which requires byte-identical output. A hand edit would therefore fail the default suite.
- **Where they come from:** schema objects with no `properties`. In the untracked `revision.schema.json` these are `StepInput.context`, `LearnedContent.{actions,producedBindings,consumedBindings}.items` and the `SnapshotMap`/`ReuseMap` definitions. The generator emits each of them as `{  }` (`tools/build-studio-observed-schemas.cjs`, `type()` object branch).
- **Fix needed:** a change in `tools/` to the generator, or to the schemas, then a regeneration. Example: emit `Readonly<Record<string, unknown>>` (or the `additionalProperties` type) for property-less objects. This is a type-surface change that someone must own. It is outside my edit scope, so I did not make it.

## 4. Verification (exact commands, all run with `pnpm --config.package-manager-strict=false run …`)

| Step | Result |
|---|---|
| `lint` (`lint-after.log`) | **exit 1, 8 errors / 2 files**, only the section 3 items. Before: 112 / 12 (`lint-before.log`) |
| `type-check` (`type-check.log`) | exit 0 |
| `test`, full default suite (`unit-full.log`) | exit 0. **2223 passed / 0 failed / 29 skipped** (104 files passed, 1 skipped), identical to the baseline. The JSON reporter flags I passed after `--` were not honoured, so there is no vitest JSON file; the text log is the record |
| Focused `vitest run test/run/observedReplayProtocol.test.ts` after the final reposition of its typed view | 40/40 |
| `build` (`build.log`) | exit 0 |
| `check:pins` (`pins.log`) | exit 0 |
| Fixtures tier (`test:fixtures`, Chromium) for the 5 changed `fixtures-tier` files | **Not run.** Neutrality rests on the emitted-JS diff above |

## 5. Dist and source digests (`capture-manifest.py` → `capture-before.json` / `capture-after.json`)

- **Dist digest:** `2f688e62d3c1e9cd2cec105186c209d24cbaa50eb29fbb2d0ac5bccd112fcef0` before and after. **The dist bytes did not change**, which is expected because no `src` file changed.
- **Source digest:** `3416fea3ce1aa040511f139f9c420d50b1d9806df51a85705cf5a7440ee358bd` → `1b966a2057b14c63546195bee9846889757d60a4e7e9d94b5149cdf2b2e2d22f` (1641 files both times). Exactly the 11 test files in `manifest.json` changed. Nothing was added or removed.
- **Housekeeping:** I ran `capture-manifest.py --help` once by mistake. It wrote a file literally named `--help` at the repo root, which I deleted right away.

---

## Round 2: generator fix and `await` (coordinator cleared `tools/` edits)

### Generator: `tools/build-studio-observed-schemas.cjs`
- **The change.** I edited the object branch of `type()` so that an object with no `properties` no longer emits `{}`. It now emits a map type that follows the schema exactly:

  | `additionalProperties` | Emitted type |
  |---|---|
  | `false` | `Readonly<Record<string, never>>` |
  | a schema | `Readonly<Record<string, <that type>>>` |
  | absent or `true` | `Readonly<Record<string, unknown>>` (JSON Schema default: any value) |

  `emit()` now uses `interface` only when the body is an object literal. That covers the existing `patternProperties` exclusion.
- **Regeneration.** I ran the repo's own command, `node tools/build-studio-observed-schemas.cjs`. The resulting type changes:
  - `SnapshotMap` = `Readonly<Record<string, string>>` (schema: `additionalProperties: {type: string, pattern: hex64}`).
  - `ReuseMap` = `Readonly<Record<string, ReusedFrom>>` (schema: `additionalProperties: $ref ReusedFrom`).
  - `StepInput.context` and the `LearnedContent.{actions,producedBindings,consumedBindings}` items become `Readonly<Record<string, unknown>>` (schema: bare `{type: object}`).
  - `ReusedFrom` moved earlier in emission order. Its content is identical.
  - No schema in the bundles uses `additionalProperties: false` without properties, so the `never` branch is not exercised today.
- **JSON outputs** (`src/guided/schemas.json`, `src/validator/observedSchemas.json`) are byte-identical (`cmp`). The backend consumes those JSON outputs; I did not run any backend tests (no Gradle in this lane).

### `guided-dataflow.test.ts:51`: `void` → `await`
- **Intent.** The test pushes a producer and bumps `materializationRevision`, then calls `update()`. It then asserts that `refresh()` emits no outcome and that a later `fill` consumes `binding-one`. That fill depends on the updated context, so the test asserts state after `update()`, and `await` is correct.
- **Run.** `vitest run --config vitest.fixtures.config.ts test/fixtures-tier/guided-dataflow.test.ts` (real Chromium) gave **3/3 passed** (`guided-dataflow-await.log`).
- **Other changed fixtures-tier files.** I also ran the four other fixtures-tier files changed in round 1 (`fixtures-changed.log`): **28/28 passed**. This replaces the "not run" entry in section 4.

### Re-verification
| Step | Result |
|---|---|
| `lint` (`lint-after2.log`) | **exit 0, 0 errors** |
| `type-check` (`type-check2.log`) | exit 0 |
| `test`, full default suite (`unit-full2.log`) | exit 0, **2223 / 0 / 29**, same as the baseline |
| `build` (`build2.log`), `check:pins` (`pins2.log`) | exit 0 / exit 0 |
| `node tools/check-studio-observed-contracts.cjs` (`contracts2.log`) | exit 0. Before my change it also exited 0 |
| `node tools/build-studio-observed-schemas.cjs --check` (`generator-check2.log`) | exit 0, "four byte-identical outputs". `generated-contracts.test.ts` passed inside the full suite |

### Digests (`capture-after2.json`)
- **Dist digest:** `2f688e62d3c1e9cd2cec105186c209d24cbaa50eb29fbb2d0ac5bccd112fcef0` → `060d9a53239cf1bd8f3f98fc74e6f9440899c834423d0bb7f8e466ea19cea457`. Only `executor/observedOperations.d.ts` and `guided/types.d.ts` changed. **No dist `.js` changed.**
- **Source digest:** `1b966a20…e2d22f` → `31e23872ad20bdf69a9ae1ab2c4bbc07be89950a0363026aff3f1c2972a477da`. Four files changed, all listed in `manifest.json` `round2`. Nothing was added or removed.
