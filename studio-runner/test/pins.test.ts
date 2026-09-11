import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { checkPins, collectPins, engineFloorMajor, runCli } from '../scripts/check-pins.mjs';
import { writeRuntimeVersionsFile } from '../scripts/write-runtime-versions.mjs';
import {
  ARTIFACT_VERSION,
  EXECUTOR_VERSION,
  SYNTAX_REFERENCE_VERSION,
  VALIDATOR_PARSER,
  VALIDATOR_SCHEMA_VERSION,
} from '../src/versions.js';
import { packageRoot } from './helpers/corpus.js';

/**
 * AC-1/AC-2/AC-11: one declared Playwright pin, four asserted copies (ADR-001 §4.2).
 *
 * Each case copies the real package-root files into a temporary directory, drifts exactly one
 * copy, and asserts `check:pins` fails and names the disagreeing copies. The all-agree case is the
 * control: if it ever failed, every drift case would pass for the wrong reason.
 */

const roots: string[] = [];

/**
 * A throwaway package root holding the files `check-pins` reads.
 *
 * `dist/runtime-versions.json` is generated here rather than copied from the real `dist/`: the
 * tests run as CI stage 4, before the build of stage 5, so there may be no built file to copy.
 */
function makeRoot(mutate: (root: string) => void = () => undefined): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-pins-'));
  roots.push(root);
  for (const file of ['package.json', 'package-lock.json', 'Dockerfile', '.nvmrc']) {
    cpSync(join(packageRoot, file), join(root, file));
  }
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeRuntimeVersionsFile({
    root,
    versions: {
      VALIDATOR_SCHEMA_VERSION,
      SYNTAX_REFERENCE_VERSION,
      EXECUTOR_VERSION,
      ARTIFACT_VERSION,
      VALIDATOR_PARSER,
    },
    env: {},
    nodeVersion: process.version,
  });
  mutate(root);
  return root;
}

interface MutablePackage {
  dependencies: Record<string, string>;
}
interface MutableLock {
  packages: Record<string, { version: string }>;
}
type MutableRuntime = Record<string, string | number | null>;

/** Reads a JSON file, applies one mutation and writes it back. Returns the mutated value. */
function editJson<T>(path: string, edit: (value: T) => void): T {
  const value = JSON.parse(readFileSync(path, 'utf8')) as T;
  edit(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

/**
 * Runs the CLI entry point in-process and captures what it printed.
 *
 * The package forbids `child_process` outside `src/run/**` (ADR-001 §6), so `runCli` returns the
 * exit code instead of calling `process.exit` and the test asserts on that value — the same value
 * `scripts/check-pins.mjs` assigns to `process.exitCode` when run as `npm run check:pins`.
 */
function invoke(root: string, args: string[] = []): { status: number; output: string } {
  const lines: string[] = [];
  const capture = (...parts: unknown[]): void => {
    lines.push(parts.map(String).join(' '));
  };
  const log = vi.spyOn(console, 'log').mockImplementation(capture);
  const error = vi.spyOn(console, 'error').mockImplementation(capture);
  try {
    const status = runCli(['--root', root, ...args]);
    return { status, output: lines.join('\n') };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('check:pins on the real package', () => {
  // Runs against the working tree as-is: `dist/` may or may not have been built yet, and the check
  // must be green either way — an unbuilt recorded copy is NOT ASSERTED, never a failure.
  it('passes: every copy agrees', () => {
    const result = checkPins(packageRoot);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reads the declared pin as an exact version', () => {
    const pins = collectPins(packageRoot);
    expect(pins.declared).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pins.locked).toBe(pins.declared);
    expect(pins.image).toBe(pins.declared);
  });

  it('exits zero', () => {
    const { status, output } = invoke(packageRoot);
    expect(status).toBe(0);
    expect(output).toContain('check:pins OK');
  });
});

describe('single-copy drift', () => {
  const cases = [
    [
      'package.json dependencies.playwright',
      (root: string) =>
        { editJson<MutablePackage>(join(root, 'package.json'), (pkg) => {
          pkg.dependencies.playwright = '1.64.0';
        }); },
    ],
    [
      "package-lock.json packages['node_modules/playwright'].version",
      (root: string) =>
        { editJson<MutableLock>(join(root, 'package-lock.json'), (lock) => {
          const entry = lock.packages['node_modules/playwright'];
          if (entry === undefined) throw new Error('the lockfile has no playwright entry');
          entry.version = '1.64.0';
        }); },
    ],
    [
      'Dockerfile ARG PLAYWRIGHT_VERSION',
      (root: string) => {
        const path = join(root, 'Dockerfile');
        writeFileSync(
          path,
          readFileSync(path, 'utf8').replace(
            /^ARG PLAYWRIGHT_VERSION=.+$/m,
            'ARG PLAYWRIGHT_VERSION=1.64.0',
          ),
          'utf8',
        );
      },
    ],
    [
      'dist/runtime-versions.json playwright',
      (root: string) =>
        { editJson<MutableRuntime>(join(root, 'dist', 'runtime-versions.json'), (runtime) => {
          runtime.playwright = '1.64.0';
        }); },
    ],
  ] as const;

  it.each(cases)('fails when %s drifts alone', (label, mutate) => {
    const root = makeRoot(mutate);
    const result = checkPins(root);
    expect(result.ok).toBe(false);
    const message = result.failures.join('\n');
    expect(message).toContain('the Playwright pin disagrees across copies');
    expect(message).toContain(label);
    expect(message).toContain('1.64.0');
  });

  it('passes when nothing drifts', () => {
    const result = checkPins(makeRoot());
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  /**
   * AC-11: a Dockerfile `ARG` bumped alone must fail with a non-zero exit code and a message that
   * names both disagreeing copies. The same drift was run against the real `npm run check:pins`
   * and the output recorded in the story's Change Log.
   */
  it('exits non-zero when the Dockerfile ARG is bumped alone', () => {
    const root = makeRoot((target) => {
      const path = join(target, 'Dockerfile');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace(
          /^ARG PLAYWRIGHT_VERSION=.+$/m,
          'ARG PLAYWRIGHT_VERSION=1.64.0',
        ),
        'utf8',
      );
    });
    const { status, output } = invoke(root);
    expect(status).toBe(1);
    expect(output).toContain('check:pins FAILED');
    expect(output).toContain('Dockerfile ARG PLAYWRIGHT_VERSION');
    expect(output).toContain('package.json dependencies.playwright');
  });
});

describe('other pin rules', () => {
  it('rejects a range instead of an exact pin', () => {
    const root = makeRoot((target) =>
      { editJson<MutablePackage>(join(target, 'package.json'), (pkg) => {
        pkg.dependencies.playwright = '^1.63.0';
      }); },
    );
    const result = checkPins(root);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain('is not an exact version');
  });

  it('fails when the Node major disagrees with .nvmrc', () => {
    const root = makeRoot((target) => {
      writeFileSync(join(target, '.nvmrc'), '23\n', 'utf8');
    });
    const result = checkPins(root);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain('the Node major disagrees across copies');
  });

  it('fails when a recorded copy is stale', () => {
    const root = makeRoot((target) =>
      { editJson<MutableRuntime>(join(target, 'dist', 'runtime-versions.json'), (runtime) => {
        runtime.playwrightImageTag = '1.62.0';
      }); },
    );
    const result = checkPins(root);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain(
      'dist/runtime-versions.json playwrightImageTag is stale',
    );
  });

  it('fails when a copy is missing entirely', () => {
    const root = makeRoot((target) => {
      rmSync(join(target, 'Dockerfile'));
    });
    const result = checkPins(root);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain('Dockerfile ARG PLAYWRIGHT_VERSION is missing');
  });

  it('rejects unknown CLI arguments', () => {
    expect(() => invoke(packageRoot, ['--wat'])).toThrow(/Unknown argument "--wat"/);
    expect(() => runCli(['--root'])).toThrow(/--root requires a directory argument/);
  });

  it('emits a machine-readable report with --json', () => {
    const { status, output } = invoke(packageRoot, ['--json']);
    expect(status).toBe(0);
    const report = JSON.parse(output) as { ok: boolean; pins: { declared: string } };
    expect(report.ok).toBe(true);
    expect(report.pins.declared).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reports a non-zero exit code with --json when a copy drifts', () => {
    const root = makeRoot((target) =>
      { editJson<MutablePackage>(join(target, 'package.json'), (pkg) => {
        pkg.dependencies.playwright = '1.64.0';
      }); },
    );
    const { status, output } = invoke(root, ['--json']);
    expect(status).toBe(1);
    expect(output).toContain('disagrees across copies');
  });

  it('reads the engines floor major', () => {
    expect(engineFloorMajor('>=22.11.0 <25.0.0')).toBe('22');
    expect(engineFloorMajor('22.11.0')).toBe('22');
    expect(engineFloorMajor('*')).toBeNull();
    expect(engineFloorMajor(undefined)).toBeNull();
  });
});

describe('copies that cannot be asserted outside the pinned image (AC-3)', () => {
  it('reports a missing build as not asserted rather than as a pass', () => {
    const root = makeRoot((target) => {
      rmSync(join(target, 'dist'), { recursive: true, force: true });
    });
    const result = checkPins(root);
    expect(result.ok).toBe(true);
    expect(result.notAsserted.join('\n')).toContain('dist/runtime-versions.json is absent');
  });

  it('reports null chromiumBuild and image as not asserted', () => {
    const result = checkPins(makeRoot());
    const notAsserted = result.notAsserted.join('\n');
    expect(notAsserted).toContain('chromiumBuild is null');
    expect(notAsserted).toContain('image is null');
  });

  it('fails from the CLI under --require-image while they are unasserted', () => {
    const { status, output } = invoke(makeRoot(), ['--require-image']);
    expect(status).toBe(1);
    expect(output).toContain('copies remain unasserted');
  });

  it('fails under --require-image while they are unasserted', () => {
    const result = checkPins(makeRoot(), { requireImage: true });
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain('copies remain unasserted');
  });

  it('passes under --require-image once the image recorded them', () => {
    const root = makeRoot((target) =>
      { editJson<MutableRuntime>(join(target, 'dist', 'runtime-versions.json'), (runtime) => {
        runtime.chromiumBuild = '1200';
        runtime.image = 'registry.citi.com/put/checks-studio-runner:0.1.0-abc1234';
      }); },
    );
    const result = checkPins(root, { requireImage: true });
    expect(result.failures).toEqual([]);
    expect(result.notAsserted).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
