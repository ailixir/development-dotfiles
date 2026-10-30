/**
 * The seams that only production uses, and the ones production must never use.
 *
 * Two properties that are invisible to every other test in this package, because every other test
 * supplies a fake spawner and therefore never reaches the real `fork`, and never builds the
 * launcher the way `src/main.ts` does.
 *
 * 1. **SEC-1, the second channel.** The child's *environment* is an allowlist
 *    (`test/run/launcher.test.ts` asserts that, and asserts nothing on it can load code). Its
 *    *interpreter flags* are a separate channel that the allowlist does not cover: `fork` defaults
 *    `execArgv` to the parent's, so a runner started `node --import x dist/main.js` would replay
 *    `--import x` into the browser child even though its environment was fully enumerated. Either
 *    channel is enough to run code before `child.js` and rewrite `chromiumSandbox: true` on its
 *    way to the library, which is the silent disabling §9.3 forbids.
 *
 * 2. **MED-2, the injection points.** `ChildLauncherOptions` carries `spawner`, `childModulePath`
 *    and `parentEnv` so the unit tier can spawn no process and read no real environment (AC-25).
 *    All three are honoured in production too, so each is a way to replace the forked module, the
 *    process that forks it, or the environment it is handed, from a *caller*. `createConfiguredLauncher`
 *    supplies none today; nothing asserted it, and story 10.13 is the next change to that
 *    constructor. This file asserts it, key for key, so a seam wired in later — or a fourth seam
 *    added to the options type — fails here rather than shipping.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createConfiguredLauncher } from '../../src/main.js';
import { CONFIG_PREFIX, loadConfig } from '../../src/server/config.js';
import type * as RunIndex from '../../src/run/index.js';
import type { ChildLauncherOptions } from '../../src/run/launcher.js';
import { createForkSpawner } from '../../src/run/launcher.js';
import { packageRoot } from '../helpers/corpus.js';
import { SERVICE_TOKEN } from '../helpers/harness.js';

interface ForkCall {
  readonly modulePath: string;
  readonly args: readonly string[];
  readonly options: Record<string, unknown>;
}

const { forkCalls, launcherOptions } = vi.hoisted(() => ({
  forkCalls: [] as ForkCall[],
  launcherOptions: [] as Record<string, unknown>[],
}));

/**
 * `fork` is replaced rather than driven: the assertion is about what the operating system would be
 * asked for, and a unit tier that actually forked would be a unit tier that spawns processes.
 */
vi.mock('node:child_process', () => ({
  fork: (modulePath: string, args: readonly string[], options: Record<string, unknown>) => {
    forkCalls.push({ modulePath, args: [...args], options });
    return {
      connected: false,
      exitCode: 0,
      signalCode: null,
      pid: 4242,
      send: () => true,
      on: () => undefined,
      kill: () => true,
    };
  },
}));

/** Records the options `createConfiguredLauncher` constructs, then builds the real launcher. */
vi.mock('../../src/run/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RunIndex>();
  return {
    ...actual,
    createChildBrowserLauncher: (options: ChildLauncherOptions) => {
      launcherOptions.push(options as unknown as Record<string, unknown>);
      return actual.createChildBrowserLauncher(options);
    },
  };
});

describe('SEC-1 — the fork inherits no interpreter flags', () => {
  it('passes an explicitly empty execArgv rather than letting it default to the parent’s', () => {
    forkCalls.length = 0;
    createForkSpawner().spawn({
      modulePath: '/dist/run/child.js',
      args: [],
      env: { PATH: '/usr/bin' },
    });

    const call = forkCalls[0];
    expect(call?.modulePath).toBe('/dist/run/child.js');
    expect(call?.args).toEqual([]);
    // Present and empty. `fork`'s documented default for `execArgv` is `process.execArgv`, so
    // *omitting* the option is what inherits the parent's `--import` / `--require` /
    // `--experimental-loader`; an assertion that only checked "no preload flag" would pass on a
    // machine whose own execArgv happened to be empty and prove nothing.
    expect(Object.keys(call?.options ?? {})).toContain('execArgv');
    expect(call?.options.execArgv).toEqual([]);
  });

  it('hands the child exactly the environment it was given, and no more', () => {
    forkCalls.length = 0;
    createForkSpawner().spawn({
      modulePath: '/dist/run/child.js',
      args: [],
      env: { PATH: '/usr/bin', TMPDIR: '/scratch/run-1/tmp' },
    });
    // `env` replaces the parent's rather than merging with it — the property the allowlist in
    // `childEnvironment` depends on. A merge would put every STUDIO_RUNNER_* value and every
    // code-loading variable back into the browser process.
    expect(forkCalls[0]?.options.env).toEqual({ PATH: '/usr/bin', TMPDIR: '/scratch/run-1/tmp' });
  });
});

describe('MED-2 — the production path supplies no test seam', () => {
  const productionEnv = (): Record<string, string> => ({
    [`${CONFIG_PREFIX}PORT`]: '0',
    [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound',
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
    [`${CONFIG_PREFIX}SCRATCH_DIR`]: '/tmp/studio-runner-production-seams',
  });

  /** The complete set production is allowed to construct. Asserted as equality, not containment. */
  const PRODUCTION_KEYS = [
    'allowedDomains',
    'launchTimeoutMs',
    'maxFailureMessageLength',
    'recording',
    'seekOriginCalibrationMs',
    'stepTimeoutMs',
    'stopTimeoutMs',
  ];

  it('constructs the launcher from configuration alone — no spawner, no module override, no env override', () => {
    launcherOptions.length = 0;
    const config = loadConfig(productionEnv());

    expect(typeof createConfiguredLauncher(config).launch).toBe('function');
    expect(launcherOptions).toHaveLength(1);
    const options = launcherOptions[0] ?? {};

    // Absent, not merely undefined: `spawner: undefined` would still be a caller deciding, and
    // would still be the thing 10.13 could turn into a value by editing one line.
    expect(Object.keys(options).sort()).toEqual([...PRODUCTION_KEYS].sort());
    for (const seam of ['spawner', 'childModulePath', 'parentEnv']) {
      expect(seam in options, `production supplied the ${seam} seam`).toBe(false);
    }

    // The configured values are configuration, not library defaults (§6.1, §8.5) — so the key-set
    // equality above is a statement about a launcher that was actually built from the config.
    expect(options.recording).toEqual({
      width: config.recordingWidth,
      height: config.recordingHeight,
    });
    expect(options.allowedDomains).toEqual(config.allowedDomains);
    expect(options.stepTimeoutMs).toBe(config.stepTimeoutMs);
    expect(options.launchTimeoutMs).toBe(config.browserLaunchTimeoutMs);
    expect(options.stopTimeoutMs).toBe(config.browserStopTimeoutMs);
    expect(options.maxFailureMessageLength).toBe(config.maxReportLogEntryLength);
    expect(options.seekOriginCalibrationMs).toBe(config.seekOriginCalibrationMs);
  });

  it('hands the configured seek-origin calibration to the launcher, not a default (story 10.32 AC-3)', () => {
    // At the default both sides are 0, so the assertion above cannot tell "passed through" from
    // "hard-coded 0". A configured value can.
    launcherOptions.length = 0;
    const config = loadConfig({
      ...productionEnv(),
      [`${CONFIG_PREFIX}SEEK_ORIGIN_CALIBRATION_MS`]: '37',
    });
    createConfiguredLauncher(config);
    expect(launcherOptions[0]?.seekOriginCalibrationMs).toBe(37);
  });

  /**
   * The other half of "cannot", stated at the type level.
   *
   * `src/main.ts` annotates the literal with a seam-free `Omit<...>` type, so object-literal
   * excess-property checking rejects `spawner:` at compile time rather than at review time. A
   * removed annotation is invisible to a runtime assertion as long as the seam is not *also*
   * supplied, so the annotation itself is checked here.
   */
  it('types the production options without the seams, so supplying one is a compile error', () => {
    const source = readFileSync(join(packageRoot, 'src', 'main.ts'), 'utf8');

    expect(source).toMatch(
      /type ProductionLauncherOptions = Omit<\s*ChildLauncherOptions,\s*'spawner' \| 'childModulePath' \| 'parentEnv'\s*>;/u,
    );
    expect(source).toMatch(/const options: ProductionLauncherOptions = \{/u);
  });
});
