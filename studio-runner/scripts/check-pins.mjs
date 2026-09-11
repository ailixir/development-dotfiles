#!/usr/bin/env node
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
 * recorded copy exists — that the recorded lockfile/image/node copies and the validator parser
 * still agree with the declared ones.
 *
 * Values that can only be observed *inside* the pinned Playwright image (`chromiumBuild`, `image`)
 * are reported as NOT ASSERTED, never as a pass. `--require-image` turns every NOT ASSERTED entry
 * into a failure; CI uses it for the stages that run inside the image (see `ci/stages.md`).
 *
 * Usage:
 *   node scripts/check-pins.mjs [--root <dir>] [--require-image] [--json]
 *
 * Exit code 0 when every asserted copy agrees, 1 otherwise. A failure message names the
 * disagreeing copies with their values.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** An exact semantic version: no range operator, no wildcard, no pre-release tolerance. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

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
    declared: pkg?.dependencies?.playwright ?? null,
    locked: lock?.packages?.['node_modules/playwright']?.version ?? null,
    image: imagePin,
    recorded: runtime?.playwright ?? null,
    declaredTypescript: pkg?.dependencies?.typescript ?? null,
    engines: pkg?.engines?.node ?? null,
    nvmrc,
    runtime,
    runtimePresent: runtime !== null,
  };
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
      [
        'dist/runtime-versions.json validatorParser',
        runtime.validatorParser,
        pins.declaredTypescript === null ? null : `typescript@${pins.declaredTypescript}`,
      ],
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

    // Observable only inside the pinned image (AC-3): null is "not asserted", never a pass.
    for (const field of ['chromiumBuild', 'image']) {
      if (runtime[field] === null || runtime[field] === undefined) {
        notAsserted.push(
          `dist/runtime-versions.json ${field} is null: this build did not run inside the pinned ` +
            'Playwright image, so the browser build was not asserted (ED-05).',
        );
      }
    }
  }

  if (requireImage && notAsserted.length > 0) {
    failures.push(
      ['--require-image was set but copies remain unasserted:', ...notAsserted].join('\n      - '),
    );
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
    ['.nvmrc / engines.node floor', `${nvmrc} (${engines})`],
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
