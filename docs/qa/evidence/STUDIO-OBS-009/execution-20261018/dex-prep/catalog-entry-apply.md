# Catalog-entry producer: apply notes for `catalog-entry.patch` (Dex, 2026-10-18)

- **Source:** `../../../STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` §B, item 10 ("a small runner script that prints the image's own catalog entry"; today the derivation exists only inline in a test).
- **Status:** prepared while G9 ran; **nothing applied**, no vitest/Gradle/docker/build. `git apply --check` passes alone and with the other two patches (`receipts/apply-check.txt`). `catalog-entry.patch` sha256 `407c70ee…f71f`.
- **Legend:** **[V]** verified by a read-only command. **[NOT RUN]** needs the tree free (vitest, eslint).

## 1. Where the derivation lives today

`ObservedCoRunIT.realCatalog()` (`backend/src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java:290-310`) embeds a JS string that imports `OBSERVED_PROFILE`, `hashObserved` and `OBSERVED_SCHEMA_BUNDLE_HASH` from `dist/validator/observedReferencePolicy.js`, reads `dist/runtime-versions.json`, and prints `{profile, build:{profileHash, schemaBundleHash, referenceBundleHash, chromiumBuild, executableImageDigest}}` with a fixed `BUILD_DIGEST`. It is the only producer: `studio-runner/ci/stages.md` and `scripts/` had none.

## 2. What the patch adds (4 files, 542 lines, all new but one 3-line hunk)

| File | Content |
|---|---|
| `studio-runner/scripts/print-observed-catalog.mjs` | the producer. `node scripts/print-observed-catalog.mjs <manifestDigest>` prints one JSON line `{profile, build}`. Exit 0 printed, 1 refused (reason on stderr, nothing on stdout), 2 usage. Exports `buildCatalogEntry`, `loadDistInputs`, `normalizeDigest`, `observedProfile`, `validateBuildIdentity`, `hashObserved`, `canonicalObserved`, `runCli`. |
| `studio-runner/scripts/print-observed-catalog.d.mts` | types (the `check-pins.d.mts` precedent) |
| `studio-runner/test/print-observed-catalog.test.ts` | unit test, 34 cases |
| `studio-runner/Dockerfile` | one `COPY --from=build /app/scripts/print-observed-catalog.mjs ./scripts/…` in the runtime stage. **Needed** to run it inside the pushed image: the runtime stage copies only `dist/` and `scripts/browser-provenance.mjs`. |

### Same derivation, different plumbing

| Field | Inline (Java string) | Script |
|---|---|---|
| `profile` | `OBSERVED_PROFILE` | the `const` of every `replay-profile` property in `dist/validator/observedSchemas.json` (that is how `OBSERVED_PROFILE` is built, `observedReferencePolicy.ts:256`) |
| `profileHash` | `hashObserved(OBSERVED_PROFILE)` | `hash(profile)` with a copy of `canonicalObserved` |
| `schemaBundleHash` | `OBSERVED_SCHEMA_BUNDLE_HASH` | `hash(dist/validator/observedSchemas.json)` (same definition, line 257) |
| `referenceBundleHash` | `runtime-versions.json` `observedReferenceBundleHash` | `hash(dist/observed-reference.json)`, which is what `loadObservedBuild` compares; **and** it must equal the recorded value |
| `chromiumBuild` | `runtime-versions.json` `observedChromiumBuild` | same, must be a non-empty string |
| `executableImageDigest` | constant | the argument: 64 lowercase hex; a leading `sha256:` is accepted and dropped |

Checks added over the inline version (the loader makes the same demands, `src/compat/runtime-versions.ts` `loadObservedBuild`): the recorded schema bundle hash equals the file's hash, the recorded reference hash equals the file's hash, and the finished `build` passes the packaged `BuildIdentity` schema (closed object, `pattern`, `minLength`, `maxLength`). The schema reader is deliberately tiny and **fails closed** on any keyword it does not implement, so a schema that grows cannot be under-checked. It refuses and prints nothing for a stale or foreign `dist/`.

**Parity [V]:** on the real `studio-runner/dist` (read-only), the script's output is canonical-JSON equal to the inline derivation run with the dist's own `validator/observedReferencePolicy.js` (`receipts/catalog-parity.txt`). The unit test asserts the same against the runner's `src` functions (`OBSERVED_PROFILE`, `hashObserved`, `OBSERVED_SCHEMA_BUNDLE_HASH`, `validateObserved('replay-profile#/definitions/BuildIdentity', …)`), including that `validateObserved` refuses every build the script's mini validator refuses.

## 3. The no-dynamic-evaluation rules

- `test/no-dynamic-evaluation.test.ts` greps **`dist/`** (tsc output of `src/**`) for `eval(`, `new Function(`, `Function(`, node `vm`, `worker_threads`, dynamic `import(` and an async IIFE `(async () =>`. `scripts/` is not emitted into `dist/`, so the rule does not scan this file [V by `tsconfig.build.json` `include: ["src/**/*.ts"]`].
- The script and its test hold to the same list anyway, so a later move into `src/` or `dist/` stays legal: no `eval`/`Function`, no `vm`, no `worker_threads`, **no dynamic `import()`**, **no async IIFE**. It therefore imports **no `dist` code**: it reads the three packaged JSON files and derives the values itself. The CLI wrapper is synchronous (`process.exitCode = runCli(...)`, no top-level `await`).
- The test copies the seven patterns and asserts them against the script source, and also asserts no `child_process` and no import from `dist/`.
- ESLint (`eslint.config.js`) bans `Function` in `scripts/**/*.mjs`; nothing else applies there. **[NOT RUN]** `eslint` on the new files.

## 4. `package.json`

**No script added** (`[AUTO-DECISION]`). The convention in `studio-runner/package.json`: an npm alias exists for a stage that CI runs with no required argument (`check:pins`, `test:*`, `evaluate`); `scripts/write-runtime-versions.mjs` (inside `build`) and `scripts/upgrade-observed-fixtures.mjs` have none. This script needs the image digest as an argument and runs inside the image with `node` directly, like the former. Also `package.json` is read by the pin and lock checks, so a package change is not free. If @devops wants an alias, it is `"catalog:print": "node scripts/print-observed-catalog.mjs"`.

## 5. After applying

1. `git apply --check catalog-entry.patch && git apply catalog-entry.patch` from the repo root.
2. From `studio-runner/` **[NOT RUN]**: `./node_modules/.bin/vitest run test/print-observed-catalog.test.ts --coverage.enabled=false`; then the whole unit tier once, because `scripts/**` is inside the coverage gate (`vitest.config.ts`, 80/85 %): the new file is fully covered except the `/* v8 ignore */` wrapper. `./node_modules/.bin/eslint scripts test/print-observed-catalog.test.ts`. `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (an overlay run of this exact test and `.d.mts` is clean [V]).
3. Image build (`npm run build` equivalent, as in `model-sizing-apply.md` §2.5), then in the **pushed** image: `docker run --rm <repo>@sha256:<d> node scripts/print-observed-catalog.mjs <d>`. Pass the same manifest digest the chart pins (`image: "<repository>@sha256:<d>"`, ruling B5 item 5).
4. @devops wraps the line as the per-release values file (`studioObserved.catalog`, B5 items 1 and 9). `G-O2` wants exactly `build` and `profile`, which is what the script prints.

## 6. Verification so far

- Logic of all 34 test cases ran through a small vitest shim on `node --experimental-strip-types` against the real `dist/` functions: 34 pass. Four hand mutations of the script (wrong schema hash, no reference staleness check, skipped unsupported keyword, no `sha256:` strip) turn it red (9, 2, 1, 2 cases). **This is not a vitest run** (`receipts/catalog-and-harness-checks.txt`).
- `tsc --noEmit` with the repo's strict options on an overlay holding the new test and `.d.mts`: exit 0.
- Not verified: vitest itself, eslint, the Docker build, an actual run inside an image.

## 7. Risks

1. The Dockerfile change alters every runner image (a new layer). It is one `COPY` of a small file, but it changes the image digest, so do it in the AE-01 / FM-01 / MODEL-SIZING rebuild window, not after the catalog was generated.
2. The script refuses on a plain-Node `dist/` built outside the pinned image (`observedChromiumBuild` is `null` there). That is intended: a catalog for a build with no recorded browser would be refused by the loader at startup anyway.
3. `dist/runtime-versions.json` `observedBrowserProvenance` and the launcher hash are **not** re-verified here (the loader does that at startup, `assertObservedBrowserStartup`, and needs the installed browser). The script proves the catalog agrees with the packaged JSON, not that the browser in the image matches.
4. Coverage/eslint on `scripts/**` are unrun; a lint rule I did not see could ask for a change.
