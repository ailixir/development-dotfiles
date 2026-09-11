#!/usr/bin/env node
/**
 * Emits `dist/runtime-versions.json` (AC-16, ADR-001 §4.2).
 *
 * The file records the four copies of the Playwright pin (declared, locked, image tag, runtime)
 * plus the validator/executor versions, so every admission and final report can state exactly
 * what ran (architecture §4.6).
 *
 * This script *records*; it does not enforce. The CI equality check that fails the build on any
 * disagreement between these copies is story 10.3.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), 'utf8'));

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

const distVersions = join(root, 'dist', 'versions.js');
if (!existsSync(distVersions)) {
  throw new Error('dist/versions.js is missing; run `tsc -p tsconfig.build.json` before this script.');
}
const versions = await import(pathToFileURL(distVersions).href);

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

const runtimeVersions = {
  playwright: declaredPlaywright,
  playwrightLocked: lockedPlaywright,
  playwrightImageTag: imagePin,
  // Filled in by the fixture tier once a real browser is launched (10.3 / 10.12).
  chromiumBuild: null,
  node: process.version,
  nodeEngineRange: pkg.engines?.node ?? null,
  nodeMajorPin: nvmrc,
  validatorSchema: versions.VALIDATOR_SCHEMA_VERSION,
  validatorParser: `${versions.VALIDATOR_PARSER.name}@${versions.VALIDATOR_PARSER.version}`,
  executor: versions.EXECUTOR_VERSION,
  artifact: versions.ARTIFACT_VERSION,
  image: process.env.RUNNER_IMAGE ?? null,
};

const target = join(root, 'dist', 'runtime-versions.json');
writeFileSync(target, `${JSON.stringify(runtimeVersions, null, 2)}\n`, 'utf8');
console.log(`wrote ${target}`);
