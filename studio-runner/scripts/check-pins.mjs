#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {readBrowserProvenance,fileSha256} from './browser-provenance.mjs';
import {envBrowserRoot} from './write-runtime-versions.mjs';
/**
 * Pin consistency check (AC-1, ADR-001 §4.2, architecture §4.3).
 *
 * ADR-001 §4.2 fixes the mechanism: **one declared pin, four asserted copies**. This script is the
 * enforcement half of that decision — `scripts/write-runtime-versions.mjs` only records.
 *
 * | Copy | Where |
 * |---|---|
 * | Declared | `package.json` → `dependencies.playwright` (exact, no range) |
 * | Locked   | `package-lock.json` → `packages['node_modules/playwright'].version` |
 * | Image    | `Dockerfile` → `ARG PLAYWRIGHT_VERSION=` (the base-image tag is derived from it) |
 * | Recorded | `dist/runtime-versions.json` → `playwright` (written by the build) |
 *
 * It additionally asserts that the floor major of `engines.node` equals `.nvmrc`, and — when the
 * recorded copy exists — that the recorded lockfile/image/node copies still agree with the
 * declared ones and the recorded observed identities still match the packaged bytes. The retired
 * artifact-1 `validatorParser` stamp is no longer compared (STUDIO-OBS-009 AC-1 P2 b).
 *
 * **Node.** `runtime-versions.json` → `node` is the one recorded value that comes from the runtime
 * that actually executed rather than from a declaration, so it gets two rules that differ on
 * purpose (ADR-001 §4.2, QA MED-2):
 *
 * | Where | Rule | Why |
 * |---|---|---|
 * | Always | `node` must satisfy `engines.node` | Story 10.2 deliberately widened `engines` to a range so the package still installs on a newer developer machine; off the image that range is the contract. |
 * | Inside the pinned image | `major(node)` must equal `.nvmrc` | ADR-001 §4.2 scopes the `.nvmrc` obligation to the image — "`node --version` inside the image matches `engines`/`.nvmrc`" — and 10.2's Change Log says `.nvmrc` pins *the image's* Node major. |
 *
 * "Inside the pinned image" is not a flag the caller asserts: it is read off the record, from a
 * `chromiumBuild` that only exists under the image's `PLAYWRIGHT_BROWSERS_PATH`. Stripping it to
 * dodge the rule does not work — `--require-image` fails on the missing `chromiumBuild` instead.
 *
 * Values that can only be observed *inside* the pinned Playwright image (`chromiumBuild`, `image`)
 * are reported as NOT ASSERTED, never as a pass; absent, empty and whitespace-only are treated
 * identically (QA MED-1). `--require-image` turns every NOT ASSERTED entry into a failure; CI uses
 * it for the stages that run inside the image (see `ci/stages.md`).
 *
 * Usage:
 *   node scripts/check-pins.mjs [--root <dir>] [--require-image] [--json]
 *
 * Exit code 0 when every asserted copy agrees, 1 otherwise. A failure message names the
 * disagreeing copies with their values.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** An exact semantic version: no range operator, no wildcard, no pre-release tolerance. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Whether a recorded value counts as asserted.
 *
 * Absent, `null`, empty and whitespace-only are all "not asserted". The distinction matters for
 * the image-derived fields: the Dockerfile's `ARG IMAGE_TAG=` default makes the variable defined
 * but empty inside the image, and an empty tag names nothing (QA MED-1).
 */
export function isAsserted(value) {
  if (value === null || value === undefined) return false;
  return typeof value === 'string' ? value.trim() !== '' : true;
}

/** Parses `v24.20.0` or `24.20.0` into `[major, minor, patch]`; `null` when unreadable. */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The major of a recorded Node version, as a string so it compares directly with `.nvmrc`. */
export function nodeMajor(value) {
  const parsed = parseVersion(value);
  return parsed === null ? null : String(parsed[0]);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Whether `version` satisfies a space-separated conjunction of simple comparators, e.g.
 * `>=22.11.0 <25.0.0`.
 *
 * Deliberately narrow: `engines.node` in this package is written in exactly that form, and adding
 * a semver dependency to a security component for one comparison is not worth it. Anything this
 * cannot read returns `null` — "unreadable" — so the caller fails closed instead of assuming a
 * pass. Pre-release identifiers are ignored; Node does not ship them to this package.
 */
export function satisfiesRange(version, range) {
  const parsed = parseVersion(version);
  if (parsed === null || typeof range !== 'string' || range.trim() === '') return null;
  for (const comparator of range.trim().split(/\s+/)) {
    const match = /^(>=|<=|>|<|=)?v?(\d+)\.(\d+)\.(\d+)$/.exec(comparator);
    if (match === null) return null;
    const order = compareVersions(parsed, [Number(match[2]), Number(match[3]), Number(match[4])]);
    const operator = match[1] ?? '=';
    const satisfied =
      operator === '>=' ? order >= 0
      : operator === '>' ? order > 0
      : operator === '<=' ? order <= 0
      : operator === '<' ? order < 0
      : order === 0;
    if (!satisfied) return false;
  }
  return true;
}

/** Reads JSON, returning `null` when the file is absent rather than throwing. */
function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Collects every copy of the pin from a package root.
 *
 * Takes the root as a parameter so the drift tests (AC-2) can point it at a mutated temporary
 * copy of the package instead of the real one.
 */
export function collectPins(root) {
  const pkg = readJsonIfPresent(join(root, 'package.json'));
  const lock = readJsonIfPresent(join(root, 'package-lock.json'));
  const runtime = readJsonIfPresent(join(root, 'dist', 'runtime-versions.json'));

  const dockerfilePath = join(root, 'Dockerfile');
  const dockerfile = existsSync(dockerfilePath) ? readFileSync(dockerfilePath, 'utf8') : null;
  const imagePin =
    dockerfile === null
      ? null
      : (/^ARG PLAYWRIGHT_VERSION=(.+)$/m.exec(dockerfile)?.[1]?.trim() ?? null);

  const nvmrcPath = join(root, '.nvmrc');
  const nvmrc = existsSync(nvmrcPath) ? readFileSync(nvmrcPath, 'utf8').trim() : null;

  return {
    engine: collectEnginePin(root),
    declared: pkg?.dependencies?.playwright ?? null,
    locked: lock?.packages?.['node_modules/playwright']?.version ?? null,
    image: imagePin,
    recorded: runtime?.playwright ?? null,
    engines: pkg?.engines?.node ?? null,
    nvmrc,
    runtime,
    runtimePresent: runtime !== null,
  };
}

/**
 * The Playwright engine pin of the perception modules (ADR-SC-007 D7 item 4): `src/run/playwrightEnginePin.json` declares the
 * exact playwright-core version and the sha256 of `playwright-core/lib/coreBundle.js`, the file that holds the injected selector
 * engine. playwright-core is resolved through the DECLARED `playwright` package. Returns `null` when the root does not ship the
 * pin file (the temporary roots of the drift tests), otherwise what was found; `error` explains anything that could not be read.
 */
export function collectEnginePin(root) {
  const pinPath = join(root, 'src', 'run', 'playwrightEnginePin.json');
  if (!existsSync(pinPath)) return null;
  const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  const found = { pin, coreVersion: null, coreBundleSha256: null, error: null };
  try {
    const playwrightRequire = createRequire(createRequire(join(root, 'package.json')).resolve('playwright/package.json'));
    const corePackage = playwrightRequire.resolve('playwright-core/package.json');
    found.coreVersion = JSON.parse(readFileSync(corePackage, 'utf8')).version ?? null;
    found.coreBundleSha256 = createHash('sha256').update(readFileSync(join(dirname(corePackage), 'lib', 'coreBundle.js'))).digest('hex');
  } catch {
    found.error = 'playwright-core (through the declared playwright package) or its lib/coreBundle.js could not be read.';
  }
  return found;
}

/**
 * The floor major of an `engines.node` range.
 *
 * ADR-001 §4.2 requires the Node major to match `.nvmrc`; story 10.2 deliberately expressed
 * `engines.node` as a range (`>=22.11.0 <25.0.0`) rather than `22.x` so the package still installs
 * on a newer developer machine. The asserted part is therefore the *floor*: the lowest Node major
 * the package claims to support must be the major the pinned image ships.
 */
export function engineFloorMajor(range) {
  if (typeof range !== 'string') return null;
  return /(?:^|\s)>=?\s*(\d+)\./.exec(range)?.[1] ?? /^\s*(\d+)\./.exec(range)?.[1] ?? null;
}

/**
 * Asserts the copies agree.
 *
 * @returns {{ok: boolean, failures: string[], notAsserted: string[], pins: object}}
 */
export function checkPins(root, options = {}) {
  const requireImage = options.requireImage === true;
  const pins = collectPins(root);
  const failures = [];
  const notAsserted = [];

  // ── The declared pin is the single source; everything else is compared against it. ──────────
  if (pins.declared === null) {
    failures.push('package.json dependencies.playwright is missing; there is no declared pin.');
  } else if (!EXACT_VERSION.test(pins.declared)) {
    failures.push(
      `package.json dependencies.playwright = "${pins.declared}" is not an exact version. ` +
        'ADR-001 §4.2 requires an exact pin with no range operator.',
    );
  }

  const copies = [
    ['package.json dependencies.playwright', pins.declared],
    ["package-lock.json packages['node_modules/playwright'].version", pins.locked],
    ['Dockerfile ARG PLAYWRIGHT_VERSION', pins.image],
  ];
  if (pins.runtimePresent) {
    copies.push(['dist/runtime-versions.json playwright', pins.recorded]);
  } else {
    notAsserted.push(
      'dist/runtime-versions.json is absent (run `npm run build` first); the recorded copy of the ' +
        'Playwright pin was not asserted.',
    );
  }

  const missing = copies.filter(([, value]) => value === null).map(([label]) => label);
  for (const label of missing) failures.push(`${label} is missing.`);

  const present = copies.filter(([, value]) => value !== null);
  const distinct = [...new Set(present.map(([, value]) => value))];
  if (distinct.length > 1) {
    failures.push(
      ['the Playwright pin disagrees across copies:', ...present.map(format)].join('\n      '),
    );
  }

  // ── Playwright engine pin (perception modules): version, declared version and bundle sha256 ──────
  if (pins.engine !== null) {
    const { pin, coreVersion, coreBundleSha256, error } = pins.engine;
    if (error !== null) failures.push(`the Playwright engine pin could not be checked: ${error}`);
    else {
      if (pin.playwright !== pins.declared) {
        failures.push(`src/run/playwrightEnginePin.json playwright = "${pin.playwright}" disagrees with package.json dependencies.playwright = "${String(pins.declared)}".`);
      }
      if (coreVersion !== pin.playwright) {
        failures.push(`the installed playwright-core is ${String(coreVersion)} but src/run/playwrightEnginePin.json pins ${pin.playwright}.`);
      }
      if (coreBundleSha256 !== pin.coreBundleSha256) {
        failures.push(
          [
            'playwright-core/lib/coreBundle.js is not the pinned engine bundle:',
            `installed sha256 = ${String(coreBundleSha256)}`,
            `pinned sha256    = ${pin.coreBundleSha256}`,
            'The injected selector engine is private Playwright code; moving the pin needs the engine conformance test to pass first.',
          ].join('\n      '),
        );
      }
    }
  }

  // ── Node major: engines floor vs .nvmrc ─────────────────────────────────────────────────────
  const floor = engineFloorMajor(pins.engines);
  if (pins.nvmrc === null) {
    failures.push('.nvmrc is missing.');
  } else if (floor === null) {
    failures.push(
      `package.json engines.node = ${JSON.stringify(pins.engines)} has no readable floor major.`,
    );
  } else if (floor !== pins.nvmrc) {
    failures.push(
      [
        'the Node major disagrees across copies:',
        `package.json engines.node floor major = ${floor} (from "${pins.engines}")`,
        `.nvmrc                                = ${pins.nvmrc}`,
      ].join('\n      '),
    );
  }

  // ── Copies that only exist once the build has run ───────────────────────────────────────────
  if (pins.runtimePresent) {
    const runtime = pins.runtime;
    const recordedCopies = [
      ['dist/runtime-versions.json playwrightLocked', runtime.playwrightLocked, pins.locked],
      ['dist/runtime-versions.json playwrightImageTag', runtime.playwrightImageTag, pins.image],
      ['dist/runtime-versions.json nodeMajorPin', runtime.nodeMajorPin, pins.nvmrc],
    ];
    for (const [label, recorded, expected] of recordedCopies) {
      if (expected !== null && recorded !== expected) {
        failures.push(
          [
            `${label} is stale:`,
            `recorded = ${JSON.stringify(recorded)}`,
            `source   = ${JSON.stringify(expected)}`,
          ].join('\n      '),
        );
      }
    }

    // Observable only inside the pinned image (AC-3): absent, null, empty and whitespace-only are
    // all "not asserted", never a pass. An omitted `--build-arg IMAGE_TAG` leaves `IMAGE_TAG`
    // defined-but-empty inside the image, and an empty tag names no image (QA MED-1).
    for (const field of ['chromiumBuild', 'image']) {
      if (!isAsserted(runtime[field])) {
        notAsserted.push(
          `dist/runtime-versions.json ${field} is not asserted (it is ` +
            `${JSON.stringify(runtime[field] ?? null)}): this build did not run inside the pinned ` +
            'Playwright image, or ran there without being told which image it was, so the browser ' +
            'build was not asserted (ED-05).',
        );
      }
    }

    // ── The Node that actually ran (ADR-001 §4.2, QA MED-2) ───────────────────────────────────
    // Everything above compares declarations with declarations. `node` is the only recorded value
    // produced by the runtime itself, and until now nothing compared it to anything.
    const inPinnedImage = isAsserted(runtime.chromiumBuild);
    if (!isAsserted(runtime.node)) {
      failures.push(
        'dist/runtime-versions.json node is missing; the runtime that produced this build was ' +
          'not recorded, so the Node pin cannot be asserted.',
      );
    } else {
      // Rule 1, everywhere: the recorded Node must satisfy the declared range.
      const satisfies = satisfiesRange(runtime.node, pins.engines);
      if (satisfies === null) {
        failures.push(
          [
            'the recorded Node version could not be checked against engines.node:',
            `dist/runtime-versions.json node = ${JSON.stringify(runtime.node)}`,
            `package.json engines.node       = ${JSON.stringify(pins.engines)}`,
            'One of the two is not a form this check can read, so it fails closed rather than',
            'reporting a pass it did not establish.',
          ].join('\n      '),
        );
      } else if (!satisfies) {
        failures.push(
          [
            'the recorded Node version does not satisfy engines.node:',
            `dist/runtime-versions.json node = ${runtime.node}`,
            `package.json engines.node       = ${pins.engines}`,
          ].join('\n      '),
        );
      }

      // Rule 2, inside the pinned image only: the major must equal `.nvmrc`.
      const recordedMajor = nodeMajor(runtime.node);
      if (inPinnedImage && pins.nvmrc !== null && recordedMajor !== pins.nvmrc) {
        failures.push(
          [
            'the Node major inside the pinned Playwright image disagrees with .nvmrc:',
            `dist/runtime-versions.json node = ${runtime.node} (major ${recordedMajor}), ` +
              `recorded inside the image (chromiumBuild ${String(runtime.chromiumBuild)})`,
            `.nvmrc                          = ${pins.nvmrc}`,
            'ADR-001 §4.2 requires the Node inside the pinned image to match .nvmrc, and story',
            "10.2's Change Log states that .nvmrc pins the image's Node major (the engines range",
            'is wider only so the package installs on a newer developer machine).',
            'FIX THE IMAGE, NOT THIS FILE: the internal Playwright image (ED-05) must be built on',
            'the .nvmrc major. Widening .nvmrc to match whatever the base image happens to ship',
            'would delete the only copy that pins Node, and is an ADR change, not a build fix.',
          ].join('\n      '),
        );
      }
    }
  }

  if (requireImage && notAsserted.length > 0) {
    failures.push(
      ['--require-image was set but copies remain unasserted:', ...notAsserted].join('\n      - '),
    );
  }

  const observedSchemas=join(root,'dist','validator','observedSchemas.json');
  if(existsSync(observedSchemas)){
    try{
      const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
      const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
      const read=p=>JSON.parse(readFileSync(p,'utf8'));
      const sourceSchemas=read(join(root,'src','validator','observedSchemas.json'));
      const packaged=read(observedSchemas),references=read(join(root,'dist','observed-reference.json'));
      const refsRoot=join(root,'fixtures','observed-reference');
      const sourceReferences=Object.fromEntries(readdirSync(refsRoot).filter(n=>n.endsWith('.json')).sort().map(n=>[n,read(join(refsRoot,n))]));
      if(hash(packaged)!==hash(sourceSchemas)||pins.runtime?.observedSchemaBundleHash!==hash(packaged))failures.push('Observed packaged schema bundle is stale.');
      if(hash(references)!==hash(sourceReferences)||pins.runtime?.observedReferenceBundleHash!==hash(references))failures.push('Observed packaged reference bundle is stale.');
      const actualBrowser=readBrowserProvenance(envBrowserRoot(process.env),pins.runtime?.observedChromiumBuild);
      if(hash(actualBrowser)!==hash(pins.runtime?.observedBrowserProvenance)||pins.runtime?.observedBrowserLauncherSha256!==fileSha256(join(root,'dist','run','browser.js')))failures.push('Observed full Chromium provenance is stale or incompatible.');
      // The replay profile collapsed to {contract:3} (STUDIO-OBS-012A): Playwright is asserted by the
      // package/lock/Dockerfile/runtime copies above and the browser build by BuildIdentity.
    }catch{failures.push('Observed packaged support files are missing or invalid.');}
  }
  return { ok: failures.length === 0, failures, notAsserted, pins };
}

function format([label, value]) {
  return `${label.padEnd(58)} = ${value}`;
}

function parseArgs(argv) {
  const options = { root: join(here, '..'), requireImage: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--root requires a directory argument.');
      options.root = value;
      index += 1;
    } else if (arg === '--require-image') {
      options.requireImage = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }
  return options;
}

/**
 * CLI entry point. Returns the process exit code rather than calling `process.exit`, so the tests
 * can exercise argument parsing, the messages and the exit code in-process — the package forbids
 * `child_process` outside `src/run/**` (ADR-001 §6).
 */
export function runCli(argv) {
  const options = parseArgs(argv);
  const result = checkPins(options.root, { requireImage: options.requireImage });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  for (const note of result.notAsserted) console.log(`NOT ASSERTED: ${note}`);

  if (!result.ok) {
    console.error('check:pins FAILED');
    for (const failure of result.failures) console.error(`  - ${failure}`);
    return 1;
  }

  const { declared, locked, image, recorded, nvmrc, engines } = result.pins;
  console.log('check:pins OK');
  for (const line of [
    ['package.json dependencies.playwright', declared],
    ["package-lock.json node_modules/playwright", locked],
    ['Dockerfile ARG PLAYWRIGHT_VERSION', image],
    ['dist/runtime-versions.json playwright', recorded ?? '(not built)'],
    ['dist/runtime-versions.json node', result.pins.runtime?.node ?? '(not built)'],
    ['.nvmrc / engines.node floor', `${nvmrc} (${engines})`],
    ['src/run/playwrightEnginePin.json bundle sha256', result.pins.engine?.pin.coreBundleSha256 ?? '(not shipped by this root)'],
  ]) {
    console.log(`  ${format(line)}`);
  }
  return 0;
}

// Not reachable under vitest (the module is imported, never invoked as the entry point).
/* v8 ignore start */
if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
/* v8 ignore stop */
