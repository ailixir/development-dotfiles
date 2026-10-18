/**
 * AC-11a at the seam — which processes are signalled, and why one group signal is not enough.
 *
 * The distinction is the whole criterion: `process.kill(pid)` reaches Node, and Chromium is below
 * it, so a `SIGKILL` to the fork leaves a browser running and holding `/dev/shm`, the scratch
 * directory and an unfinished video file. A test that asserted "kill was called" would pass in
 * exactly that state, which is why AC-11a is stated as *enumerate the pids*.
 *
 * The story's own suggested mechanism — spawn the child into its own process group and signal the
 * group — turned out to be **insufficient against real Playwright**, which starts the browser and
 * the video encoder detached, in groups of their own. That was found by the fixtures tier and the
 * layout it found is fixed here as {@link PLAYWRIGHT_TREE}, so the reason this module enumerates
 * is a recorded observation rather than a preference.
 *
 * This file asserts the **mechanism** on that layout. The **observation** that no descendant
 * survives is `test/fixtures-tier/deadline-cleanup.test.ts`, against real Chromium with the
 * browser suspended so it cannot exit on its own — because a browser that tidies itself up makes
 * any kill look correct.
 */
import { describe, expect, it } from 'vitest';

import {
  canEnumerateLaunchTree,
  canEnumerateProcessTree,
  commandLineNames,
  descendantsOf,
  isAlive,
  killLaunchTree,
  readProcessTable,
  readProcessTableWithArgs,
  selectLaunchRoots,
  signalProcessTree,
  survivorsOf,
} from '../../src/run/tree.js';
import type { ProcessRowWithArgs } from '../../src/run/tree.js';

/**
 * The layout observed on the branch, with Playwright 1.63.0, and the reason this module
 * enumerates instead of sending one group signal.
 *
 * `chrome-headless-shell` and `ffmpeg` each lead a process group of their **own** — Playwright
 * starts them detached so that it can group-kill them — and the renderers sit inside Chromium's
 * group, not the fork's. So `kill(-forkPid)` reaches the Node layer and nothing else.
 */
const PLAYWRIGHT_TREE = [
  { pid: 1, ppid: 0 },
  { pid: 16_341, ppid: 1 }, // the fork: node dist/run/child.js, pgid 16341
  { pid: 16_343, ppid: 16_341 }, // chrome-headless-shell, pgid 16343 — its own group
  { pid: 16_367, ppid: 16_341 }, // ffmpeg-mac, pgid 16367 — its own group
  { pid: 16_364, ppid: 16_343 }, // renderer, pgid 16343
  { pid: 16_365, ppid: 16_343 }, // renderer, pgid 16343
  { pid: 16_366, ppid: 16_343 }, // GPU process, pgid 16343
];

describe('AC-11a — killing the tree is not killing the child', () => {
  it('reaches the browser and the encoder, which are not in the fork’s process group', () => {
    const targets: { pid: number; signal: string }[] = [];
    const outcome = signalProcessTree(
      16_341,
      'SIGKILL',
      (pid, signal) => {
        targets.push({ pid, signal });
      },
      PLAYWRIGHT_TREE,
    );

    // Every real process in the tree was signalled by its own pid. The mutation this catches is
    // the one that *looks* like the fix — a single `kill(-forkPid)` — which on this layout reaches
    // the Node layer and leaves a browser, an encoder and three renderers running.
    const byPid = targets.filter((target) => target.pid > 0).map((target) => target.pid);
    expect(byPid.sort((a, b) => a - b)).toEqual([16_341, 16_343, 16_364, 16_365, 16_366, 16_367]);
    expect(outcome.signalled).toHaveLength(6);
    // …and each one's own group as well, which is what collects anything below it that this
    // snapshot of the process table happened to miss.
    expect(targets.some((target) => target.pid === -16_343)).toBe(true);
    for (const target of targets) expect(target.signal).toBe('SIGKILL');
  });

  it('signals deepest-first and the root last, so nothing can replace a dying child', () => {
    const order: number[] = [];
    signalProcessTree(
      16_341,
      'SIGKILL',
      (pid) => {
        if (pid > 0) order.push(pid);
      },
      PLAYWRIGHT_TREE,
    );
    // The fork is the last thing to go. Killing it first would close the pipe Chromium watches and
    // would work — right up until Chromium is wedged and cannot watch anything, which is the case
    // this exists for.
    expect(order.at(-1)).toBe(16_341);
    // A renderer goes before the browser that owns it.
    expect(order.indexOf(16_364)).toBeLessThan(order.indexOf(16_343));
  });

  it('enumerates before it signals, because a dead root has no descendants to walk', () => {
    // The table is read once, up front. If the walk happened after the root had been signalled it
    // would find nothing — the descendants are re-parented to init — and would report success over
    // a browser that is still running. The observable form: the table this call was given is the
    // one it acted on, not whatever the machine looks like afterwards.
    const targets: number[] = [];
    signalProcessTree(16_341, 'SIGKILL', (pid) => {
      if (pid > 0) targets.push(pid);
    }, PLAYWRIGHT_TREE);
    expect(targets).toContain(16_343);
  });

  it('never throws when a process is already gone', () => {
    const outcome = signalProcessTree(
      16_341,
      'SIGKILL',
      () => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      },
      PLAYWRIGHT_TREE,
    );
    // The last thing that happens to a hung run must not itself become an exception on the exit
    // path — the exit path is where scratch is cleared and the slot is released.
    expect(outcome.signalled).toHaveLength(6);
  });

  it('defaults to SIGKILL, because the ordered stop already had its chance', () => {
    const signals: string[] = [];
    signalProcessTree(9, undefined, (_pid, signal) => {
      signals.push(signal);
    }, [{ pid: 9, ppid: 1 }]);
    expect(new Set(signals)).toEqual(new Set(['SIGKILL']));
  });
});

describe('AC-11a — the observation helpers the fixtures tier asserts with', () => {
  it('reads a process table that contains this process and its parent', () => {
    const table = readProcessTable();
    expect(table.length).toBeGreaterThan(0);
    const self = table.find((row) => row.pid === process.pid);
    expect(self, 'the process table should contain this test process').toBeDefined();
    expect(self?.ppid).toBe(process.ppid);
  });

  it('walks a tree transitively, so a grandchild is found and a sibling is not', () => {
    // Shaped like the real thing: the fork is Node, the browser is its child, and the renderers
    // and the GPU process are below that. Only the *grandchild* level is where Chromium lives,
    // which is why a one-level walk would be the wrong answer.
    const table = [
      { pid: 1, ppid: 0 },
      { pid: 10, ppid: 1 }, // the fork (Node)
      { pid: 20, ppid: 10 }, // the browser
      { pid: 30, ppid: 20 }, // a renderer
      { pid: 31, ppid: 20 }, // the GPU process
      { pid: 40, ppid: 1 }, // something else entirely
    ];
    expect([...descendantsOf(10, table)].sort((a, b) => a - b)).toEqual([20, 30, 31]);
    expect(descendantsOf(10, table)).not.toContain(40);
    expect(descendantsOf(40, table)).toEqual([]);
  });

  it('terminates on a cycle in a stale reading rather than looping forever', () => {
    // Two rows that claim to be each other's parent. A real `ps` snapshot taken across a
    // re-parenting can produce one, and a tree walk that trusted it would hang the cleanup path.
    const table = [
      { pid: 5, ppid: 6 },
      { pid: 6, ppid: 5 },
    ];
    expect(descendantsOf(5, table)).toEqual([6]);
  });

  it('knows this process is alive and that an impossible pid is not', () => {
    expect(isAlive(process.pid)).toBe(true);
    // Above the platform maximum, so it can never name a live process.
    expect(isAlive(2 ** 30)).toBe(false);
  });
});

describe('Studio v1 WP16 — the tree can only be killed where it can be enumerated', () => {
  it('holds on this machine, where `ps` lists this process', () => {
    expect(canEnumerateProcessTree()).toBe(true);
  });

  it('fails on an image without `ps`, whose table reads as empty', () => {
    // `readProcessTable` answers `[]` on a missing or failing `ps`: that is the silent case.
    expect(canEnumerateProcessTree([])).toBe(false);
  });

  it('fails on a table that does not list the caller, whatever else it lists', () => {
    expect(canEnumerateProcessTree(PLAYWRIGHT_TREE, 999_999)).toBe(false);
    expect(canEnumerateProcessTree(PLAYWRIGHT_TREE, 16_343)).toBe(true);
  });

  it('REL-001/D4 (Aria R2): also needs the caller, with a command line, in the listing the kill reads', () => {
    const withArgs = (rows: readonly ProcessRowWithArgs[]): boolean => canEnumerateProcessTree(PLAYWRIGHT_TREE, 16_343, rows);
    expect(withArgs([{ pid: 16_343, ppid: 16_341, args: 'chrome-headless-shell' }])).toBe(true);
    // A `ps` that rejects `-ww` or `args=` reads as nothing, or as rows with no command line.
    expect(withArgs([])).toBe(false);
    expect(withArgs([{ pid: 16_343, ppid: 16_341, args: '' }])).toBe(false);
    expect(withArgs([{ pid: 16_364, ppid: 16_343, args: 'renderer' }])).toBe(false);
    // The plain listing is still required on its own, and leaving the argument out changes nothing for the replay callers.
    expect(canEnumerateProcessTree([], 16_343, [{ pid: 16_343, ppid: 16_341, args: 'x' }])).toBe(false);
    expect(canEnumerateProcessTree(PLAYWRIGHT_TREE, 16_343)).toBe(true);
  });
});

describe('REL-001/D4 (Quinn F1) — the guided worker starts only where its own kill can work', () => {
  const plain = [{ pid: 1, ppid: 0 }, { pid: 700, ppid: 1 }];
  const args = [{ pid: 1, ppid: 0, args: 'init' }, { pid: 700, ppid: 1, args: 'node dist/run/guidedMain.js' }];
  const readers = { readTable: () => plain, readTableWithArgs: () => args };

  it('accepts a worker that both listings show', () => {
    expect(canEnumerateLaunchTree(700, readers)).toBe(true);
  });

  it('refuses pid 1, whatever the listings show: selection refuses init as the parent, so every kill would find nothing', () => {
    expect(canEnumerateLaunchTree(1, readers)).toBe(false);
    for (const self of [0, -1, Number.NaN, 1.5]) expect(canEnumerateLaunchTree(self, readers)).toBe(false);
  });

  it('refuses a worker missing from either listing, or without a command line in the second', () => {
    expect(canEnumerateLaunchTree(700, { ...readers, readTable: () => [] })).toBe(false);
    expect(canEnumerateLaunchTree(700, { ...readers, readTableWithArgs: () => [] })).toBe(false);
    expect(canEnumerateLaunchTree(700, { ...readers, readTableWithArgs: () => [{ pid: 700, ppid: 1, args: '' }] })).toBe(false);
    expect(canEnumerateLaunchTree(701, readers)).toBe(false);
  });

  it('holds on this machine, where both `ps` forms list this test process', () => {
    expect(process.pid).toBeGreaterThan(1);
    expect(canEnumerateLaunchTree()).toBe(true);
  });
});

/**
 * REL-001/D4: which processes belong to one guided launch. The kill after a missed start deadline may
 * touch only the worker's own direct children that name this launch's own temp paths, so this is the
 * file that must fail if the selection is ever widened.
 */
describe('REL-001/D4 — a missed start deadline kills this launch\'s own processes and nothing else', () => {
  const WORKER = 5_000;
  const SCRATCH = '/var/folders/zz/T/checks-guided-AbC123';
  const RECORDING = '/var/lib/guided/recordings/checks-recording-Xy9Z8w';
  const row = (pid: number, ppid: number, args: string): ProcessRowWithArgs => ({ pid, ppid, args });
  /** Two sessions side by side, plus the unrelated processes this host is known to run. */
  const TABLE: readonly ProcessRowWithArgs[] = [
    row(1, 0, '/sbin/launchd'),
    row(22_246, 1, '/usr/bin/java -jar gradle-daemon.jar'),
    row(44_737, 1, 'node /somewhere/else/server.js'),
    row(13_577, 1, `/usr/local/bin/other --user-data-dir=${SCRATCH}/profile`),
    row(13_581, 13_577, `/usr/local/bin/other-helper ${RECORDING}/page.webm`),
    row(WORKER, 1, 'node dist/run/guidedMain.js'),
    row(6_001, WORKER, `/pw/chrome --user-data-dir=${SCRATCH}/profile --headless`),
    row(6_002, 6_001, `/pw/chrome --type=renderer --user-data-dir=${SCRATCH}/profile`),
    row(6_003, 6_002, '/pw/chrome --type=utility'),
    row(6_010, WORKER, `/pw/ffmpeg -i pipe:0 ${RECORDING}/9f1c.webm`),
    // Another session's browser under the same worker, with its own paths.
    row(7_001, WORKER, '/pw/chrome --user-data-dir=/var/folders/zz/T/checks-guided-Other9/profile'),
    row(7_010, WORKER, '/pw/ffmpeg -i pipe:0 /var/lib/guided/recordings/checks-recording-Other9/1.webm'),
    // A look-alike: the scratch path is only a prefix of its directory name.
    row(8_001, WORKER, `/pw/chrome --user-data-dir=${SCRATCH}x/profile`),
    // A process that appeared since the launch began but names none of its paths.
    row(9_001, WORKER, '/bin/sh -c sleep 100'),
  ];

  it('chooses the browser by the scratch directory and the encoder by the recording directory', () => {
    expect(selectLaunchRoots(TABLE, WORKER, [SCRATCH, RECORDING])).toEqual([6_001, 6_010]);
  });

  it('does not choose another session\'s browser, a look-alike directory or a process that merely appeared', () => {
    const chosen = selectLaunchRoots(TABLE, WORKER, [SCRATCH, RECORDING]);
    for (const other of [7_001, 7_010, 8_001, 9_001]) expect(chosen).not.toContain(other);
    expect(selectLaunchRoots(TABLE, WORKER, ['/var/folders/zz/T/checks-guided-Other9'])).toEqual([7_001]);
  });

  it('never chooses a process that is not a direct child of the worker, whatever its command line says', () => {
    const chosen = selectLaunchRoots(TABLE, WORKER, [SCRATCH, RECORDING]);
    // 13577 and 13581 name this launch's paths but are not the worker's children. Neither are the others.
    for (const protectedPid of [22_246, 44_737, 13_577, 13_581, 1, WORKER]) expect(chosen).not.toContain(protectedPid);
    // Not even a marker that names them outright can reach them.
    expect(selectLaunchRoots(TABLE, WORKER, ['/usr/local/bin/other', '/usr/bin/java', '/somewhere/else'])).toEqual([]);
    expect(selectLaunchRoots(TABLE, 1, [SCRATCH])).toEqual([]);
  });

  it('refuses markers that could match too much', () => {
    for (const marker of ['', '/', '/tmp', 'checks-guided-AbC123', 'relative/path/dir']) expect(selectLaunchRoots(TABLE, WORKER, [marker])).toEqual([]);
    expect(selectLaunchRoots(TABLE, WORKER, [])).toEqual([]);
  });

  it('matches a path only as a whole path, before and after', () => {
    expect(commandLineNames(`x --user-data-dir=${SCRATCH}/profile`, SCRATCH)).toBe(true);
    expect(commandLineNames(`x ${SCRATCH}`, SCRATCH)).toBe(true);
    expect(commandLineNames(`x "${SCRATCH}"`, SCRATCH)).toBe(true);
    expect(commandLineNames(`x ${SCRATCH}x/profile`, SCRATCH)).toBe(false);
    expect(commandLineNames(`x /prefix${SCRATCH}`, SCRATCH)).toBe(false);
    expect(commandLineNames('x /a/b.c', '/a/bxc')).toBe(false);
  });

  it('kills the enumerated trees deepest-first and returns every pid it found, killing nothing else', () => {
    const signals: [number, NodeJS.Signals][] = [];
    const pids = killLaunchTree([SCRATCH, RECORDING], { parentPid: WORKER, readTable: () => TABLE, kill: (target, signal) => { signals.push([target, signal]); } });
    expect([...pids].sort((a, b) => a - b)).toEqual([6_001, 6_002, 6_003, 6_010]);
    const direct = signals.filter(([target]) => target > 0).map(([target]) => target);
    expect(direct).toEqual([6_003, 6_002, 6_001, 6_010]);
    expect(signals.every(([, signal]) => signal === 'SIGKILL')).toBe(true);
    const touched = new Set(signals.map(([target]) => Math.abs(target)));
    for (const protectedPid of [22_246, 44_737, 13_577, 13_581, 1, WORKER, 7_001, 7_010, 8_001, 9_001]) expect(touched.has(protectedPid)).toBe(false);
  });

  it('signals nothing and returns nothing when the table is readable and no child names the launch', () => {
    const signals: number[] = [];
    const kill = (target: number): void => { signals.push(target); };
    expect(killLaunchTree(['/var/folders/zz/T/checks-guided-Nobody1'], { parentPid: WORKER, readTable: () => TABLE, kill })).toEqual([]);
    expect(signals).toEqual([]);
  });

  it('Quinn F1: throws, and signals nothing, where "nothing found" would only mean "could not look"', () => {
    const signals: number[] = [];
    const kill = (target: number): void => { signals.push(target); };
    // `ps` timed out or failed: it reads as an empty table.
    expect(() => killLaunchTree([SCRATCH], { parentPid: WORKER, readTable: () => [], kill })).toThrow('PROCESS_TABLE_UNREADABLE');
    // A table that does not list the worker (another namespace, a truncated read), even if it lists a matching browser.
    const withoutWorker = TABLE.filter((r) => r.pid !== WORKER);
    expect(() => killLaunchTree([SCRATCH], { parentPid: WORKER, readTable: () => withoutWorker, kill })).toThrow('PROCESS_TABLE_UNREADABLE');
    // A worker that is init: selection refuses it, so the empty answer would be a lie even over a perfect table.
    expect(() => killLaunchTree([SCRATCH], { parentPid: 1, readTable: () => TABLE, kill })).toThrow('PROCESS_TABLE_UNREADABLE');
    expect(() => killLaunchTree([SCRATCH], { parentPid: 0, readTable: () => TABLE, kill })).toThrow('PROCESS_TABLE_UNREADABLE');
    expect(signals).toEqual([]);
  });

  it('finds a late spawn on the second listing', () => {
    const late = [...TABLE.filter((r) => r.pid !== 6_001 && r.pid !== 6_002 && r.pid !== 6_003), row(6_500, WORKER, `/pw/chrome --user-data-dir=${SCRATCH}/profile`)];
    expect(killLaunchTree([SCRATCH], { parentPid: WORKER, readTable: () => late, kill: () => undefined })).toEqual([6_500]);
  });

  it('reports survivors after a bounded wait, and none when they are gone', async () => {
    let clock = 0;
    const edges = { now: () => clock, sleep: (ms: number): Promise<void> => { clock += ms; return Promise.resolve(); } };
    expect(await survivorsOf([1, 2, 3], 500, { ...edges, alive: () => false })).toEqual([]);
    expect(await survivorsOf([1, 2, 3], 500, { ...edges, alive: (pid) => pid === 2 })).toEqual([2]);
    expect(clock).toBeGreaterThanOrEqual(500);
    clock = 0;
    let polls = 0;
    expect(await survivorsOf([4], 500, { ...edges, alive: () => ++polls < 3 })).toEqual([]);
    expect(clock).toBeLessThan(500);
  });

  it('reads the real command line of this process from `ps`', () => {
    const mine = readProcessTableWithArgs().find((r) => r.pid === process.pid);
    expect(mine?.ppid).toBe(process.ppid);
    expect(mine?.args.length).toBeGreaterThan(0);
  });
});
