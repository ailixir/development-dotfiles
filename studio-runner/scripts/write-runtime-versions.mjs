#!/usr/bin/env node
/**
 * Emits `dist/runtime-versions.json` (10.2 AC-16, 10.3 AC-3, ADR-001 §4.2).
 *
 * The file records the four copies of the Playwright pin (declared, locked, image tag, runtime)
 * plus the browser build, Node, validator and executor versions, so every admission and final
 * report can state exactly what ran (architecture §4.6).
 *
 * This script *records*; it does not enforce. The equality check that fails the build on any
 * disagreement between these copies is `scripts/check-pins.mjs` (story 10.3).
 *
 * `chromiumBuild` and `image` describe the runtime the build happened in and can only be observed
 * inside the pinned Playwright image: `chromiumBuild` from the `chromium-<revision>` directory
 * under `PLAYWRIGHT_BROWSERS_PATH`, `image` from the `IMAGE_TAG` build arg. On a plain Node build
 * both are `null`, and `check:pins` reports them as NOT ASSERTED — never as a pass.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the Chromium build revision out of a Playwright browsers directory.
 *
 * The pinned image lays browsers out as `<PLAYWRIGHT_BROWSERS_PATH>/chromium-<revision>/`. More
 * than one revision in that directory means a mixed-version browser root, which ADR-001 §4.2
 * forbids: report it as a conflict rather than picking one.
 */
export function readChromiumBuild(browsersPath) {
  if (typeof browsersPath !== 'string' || browsersPath === '' || !existsSync(browsersPath)) {
    return null;
  }
  const revisions = readdirSync(browsersPath)
    .map((entry) => /^chromium-(\d+)$/.exec(entry)?.[1])
    .filter((revision) => revision !== undefined)
    .sort();
  if (revisions.length === 0) return null;
  if (revisions.length > 1) {
    throw new Error(
      `PLAYWRIGHT_BROWSERS_PATH (${browsersPath}) holds more than one Chromium build ` +
        `(${revisions.join(', ')}). A mixed-version browser root is forbidden (ADR-001 §4.2).`,
    );
  }
  return revisions[0];
}

/**
 * Builds the recorded runtime versions.
 *
 * Pure apart from the two filesystem reads it is given explicit paths for, so the generation
 * contract can be tested without running a build.
 *
 * @param {{root: string, versions: object, env: Record<string, string | undefined>,
 *          nodeVersion: string}} input
 */
export function buildRuntimeVersions({ root, versions, env, nodeVersion }) {
  const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), 'utf8'));

  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  const declaredPlaywright = pkg.dependencies?.playwright ?? null;
  const lockedPlaywright = lock.packages?.['node_modules/playwright']?.version ?? null;
  const declaredTypescript = pkg.dependencies?.typescript ?? null;

  if (versions.VALIDATOR_PARSER.version !== declaredTypescript) {
    throw new Error(
      `VALIDATOR_PARSER.version (${versions.VALIDATOR_PARSER.version}) does not match the pinned typescript dependency (${declaredTypescript}).`,
    );
  }

  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
  const imagePin = /^ARG PLAYWRIGHT_VERSION=(.+)$/m.exec(dockerfile)?.[1]?.trim() ?? null;
  const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim();

  return {
    playwright: declaredPlaywright,
    playwrightLocked: lockedPlaywright,
    playwrightImageTag: imagePin,
    // Observed inside the pinned image only; null on a plain Node build (AC-3).
    chromiumBuild: readChromiumBuild(env.PLAYWRIGHT_BROWSERS_PATH),
    node: nodeVersion,
    nodeEngineRange: pkg.engines?.node ?? null,
    nodeMajorPin: nvmrc,
    validatorSchema: versions.VALIDATOR_SCHEMA_VERSION,
    validatorParser: `${versions.VALIDATOR_PARSER.name}@${versions.VALIDATOR_PARSER.version}`,
    syntaxReference: versions.SYNTAX_REFERENCE_VERSION,
    executor: versions.EXECUTOR_VERSION,
    artifact: versions.ARTIFACT_VERSION,
    // `ARG IMAGE_TAG` in the Dockerfile, exported as an env var for this script (AC-3).
    image: env.IMAGE_TAG ?? null,
  };
}

/** Builds the record and writes it to `<root>/dist/runtime-versions.json`. Returns the path. */
export function writeRuntimeVersionsFile(input) {
  const runtimeVersions = buildRuntimeVersions(input);
  const target = join(input.root, 'dist', 'runtime-versions.json');
  writeFileSync(target, `${JSON.stringify(runtimeVersions, null, 2)}\n`, 'utf8');
  return target;
}

/*
 * The CLI wrapper below is exercised by `npm run build` (CI stage 5), not by the unit tier: it
 * imports the freshly compiled `dist/versions.js`, which does not exist during `npm test`. Its
 * output is asserted by `check:pins`, which reads the file it writes. Everything it computes lives
 * in `buildRuntimeVersions` / `writeRuntimeVersionsFile` above and is covered there.
 */
/* v8 ignore start */

/**
 * CLI entry point: loads the freshly compiled version constants and records them.
 *
 * The constants are read from `dist/` rather than from `src/` on purpose — what is recorded must
 * be what the image will actually load.
 */
export async function runCli() {
  const root = join(here, '..');
  const distVersions = join(root, 'dist', 'versions.js');
  if (!existsSync(distVersions)) {
    throw new Error(
      'dist/versions.js is missing; run `tsc -p tsconfig.build.json` before this script.',
    );
  }
  const versions = await import(pathToFileURL(distVersions).href);

  const target = writeRuntimeVersionsFile({
    root,
    versions,
    env: process.env,
    nodeVersion: process.version,
  });
  console.log(`wrote ${target}`);
  return 0;
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
/* v8 ignore stop */
