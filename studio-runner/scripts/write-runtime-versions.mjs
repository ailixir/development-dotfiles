#!/usr/bin/env node
/**
 * Emits `dist/runtime-versions.json` (10.2 AC-16, 10.3 AC-3, ADR-001 §4.2).
 *
 * The file records the four copies of the Playwright pin (declared, locked, image tag, runtime)
 * plus the browser build and Node, and, once the packaged observed schemas exist, the observed
 * identities (schema and reference bundle hashes, Chromium build, browser provenance, launcher
 * sha256), so every admission and final report can state exactly what ran (architecture §4.6).
 * The artifact-1 stamps (`artifact`, `validatorSchema`, `validatorParser`, `syntaxReference`,
 * `executor`) are not recorded and nothing replaces them (STUDIO-OBS-009 AC-1 P2 a).
 *
 * This script *records*; it does not enforce. The equality check that fails the build on any
 * disagreement between these copies is `scripts/check-pins.mjs` (story 10.3).
 *
 * `chromiumBuild` and `image` describe the runtime the build happened in and can only be observed
 * inside the pinned Playwright image: `chromiumBuild` from the `chromium-<revision>` directory
 * under `PLAYWRIGHT_BROWSERS_PATH`, `image` from the `IMAGE_TAG` build arg. On a plain Node build
 * both are `null`, and `check:pins` reports them as NOT ASSERTED — never as a pass. An omitted
 * build arg is recorded as `null`, not as `""` (see `optionalEnv`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {readBrowserProvenance,fileSha256,envBrowserRoot} from './browser-provenance.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * An environment-supplied value that was not actually supplied.
 *
 * The Dockerfile declares `ARG IMAGE_TAG=` with an empty default and exports it as
 * `ENV IMAGE_TAG=${IMAGE_TAG}`, so inside the image the variable is always *defined* — and empty
 * whenever the operator forgot `--build-arg IMAGE_TAG`. Recording that as `""` would let
 * `check:pins --require-image` treat an image that cannot name itself as asserted, which AC-3
 * forbids. Absent, empty and whitespace-only are therefore all recorded identically, as `null`.
 */
export function optionalEnv(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

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
 * Pure apart from the filesystem reads it is given explicit paths for, so the generation
 * contract can be tested without running a build.
 *
 * @param {{root: string, env: Record<string, string | undefined>, nodeVersion: string}} input
 */
export function buildRuntimeVersions({ root, env, nodeVersion }) {
  const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), 'utf8'));

  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  const declaredPlaywright = pkg.dependencies?.playwright ?? null;
  const lockedPlaywright = lock.packages?.['node_modules/playwright']?.version ?? null;

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
    // `ARG IMAGE_TAG` in the Dockerfile, exported as an env var for this script (AC-3).
    // Absent, empty and whitespace-only all record as null so an unnamed image cannot pass
    // `--require-image` (QA MED-1).
    image: optionalEnv(env.IMAGE_TAG),
  };
}

/** Builds the record and writes it to `<root>/dist/runtime-versions.json`. Returns the path. */
export function writeRuntimeVersionsFile(input) {
  const runtimeVersions = buildRuntimeVersions(input);
  const fixtureRoot=join(input.root,'fixtures','observed-reference');
  const schemasPath=join(input.root,'dist','validator','observedSchemas.json');
  if(existsSync(schemasPath)){
    const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
    const references=Object.fromEntries(readdirSync(fixtureRoot).filter(n=>n.endsWith('.json')).sort().map(n=>[n,JSON.parse(readFileSync(join(fixtureRoot,n),'utf8'))]));
    writeFileSync(join(input.root,'dist','observed-reference.json'),JSON.stringify(references)+'\n');
    runtimeVersions.observedSchemaBundleHash=hash(JSON.parse(readFileSync(schemasPath,'utf8')));
    runtimeVersions.observedReferenceBundleHash=hash(references);
    const localBrowsers=envBrowserRoot(input.env);
    runtimeVersions.observedChromiumBuild=readChromiumBuild(localBrowsers);
    runtimeVersions.observedBrowserProvenance=readBrowserProvenance(localBrowsers,runtimeVersions.observedChromiumBuild);
    runtimeVersions.observedBrowserLauncherSha256=fileSha256(join(input.root,'dist','run','browser.js'));
  }
  const target = join(input.root, 'dist', 'runtime-versions.json');
  writeFileSync(target, `${JSON.stringify(runtimeVersions, null, 2)}\n`, 'utf8');
  return target;
}

/*
 * The CLI wrapper below is exercised by `npm run build` (CI stage 5), not by the unit tier: it
 * writes into the real `dist/`, which does not exist during `npm test`. Its output is asserted by
 * `check:pins`, which reads the file it writes. Everything it computes lives in
 * `buildRuntimeVersions` / `writeRuntimeVersionsFile` above and is covered there.
 */
/* v8 ignore start */

/**
 * CLI entry point: records the build's runtime identities next to the freshly compiled `dist/`.
 *
 * Nothing is read from the compiled version constants any more: the record is computed from the
 * package files, the packaged observed schemas and references, the installed browser and the
 * compiled launcher, which is what the image will actually load.
 */
export async function runCli() {
  const root = join(here, '..');

  const target = writeRuntimeVersionsFile({
    root,
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
