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
  descendantsOf,
  isAlive,
  readProcessTable,
  signalProcessTree,
} from '../../src/run/tree.js';

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
