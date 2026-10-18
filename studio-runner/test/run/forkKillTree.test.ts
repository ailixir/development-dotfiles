/**
 * STUDIO-OBS-012A — the production fork spawner's `kill()` against real Node processes.
 *
 * `observedWriterQuiescence.test.ts` only calls `kill()` after the leader has already exited, so the
 * branch that actually signals a *live* child was unexercised once the artifact-1 launch tests went.
 * The property is AC-11a's: a kill ends the leader **and** a descendant that leads its own process
 * group (as Chromium and the encoder do), not just the fork. Real processes, plain Node only — no
 * browser (AC-25); the Chromium version of this proof lives in the fixtures tier.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

/**
 * Every `spawnSync` the package makes, by command. `tree.ts` reads the process table with `spawnSync('ps')`, which blocks
 * the event loop for as long as `ps` takes (up to 5 s): the starvation class STUDIO-OBS-012A removed from `trackTree`.
 * AC-11 j asserts it is also gone from the kill path. Real processes everywhere; only the observation is wrapped.
 */
const synchronous = vi.hoisted(() => ({ commands: [] as string[] }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const spawnSync = (command: string, ...rest: unknown[]): unknown => {
    synchronous.commands.push(command);
    return (actual.spawnSync as (...args: unknown[]) => unknown)(command, ...rest);
  };
  return { ...actual, spawnSync };
});

import { createForkSpawner } from '../../src/run/launcher.js';
import type { ChildProcessHandle } from '../../src/run/launcher.js';
import { isAlive, signalProcessTree } from '../../src/run/tree.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function leaderWithDetachedGrandchild(): Promise<{ handle: ChildProcessHandle; grandchild: number; exited: Promise<[number | null, string | null]> }> {
  const root = await mkdtemp(join(tmpdir(), 'fork-kill-tree-'));
  const grandchildPath = join(root, 'grandchild.mjs');
  const leaderPath = join(root, 'leader.mjs');
  await writeFile(grandchildPath, 'setInterval(() => {}, 1000);\n');
  // The leader ignores `stop` on purpose: only the kill can end it.
  await writeFile(
    leaderPath,
    `import {spawn} from 'node:child_process';` +
      `const g=spawn(process.execPath,[${JSON.stringify(grandchildPath)}],{detached:true,stdio:'ignore'});` +
      `process.send({pid:g.pid});process.on('message',()=>{});setInterval(()=>{},1000);\n`,
  );
  const handle = createForkSpawner().spawn({ modulePath: leaderPath, args: [], env: { PATH: process.env.PATH ?? '' } });
  const exited = new Promise<[number | null, string | null]>((resolve) => {
    handle.onExit((code, signal) => { resolve([code, signal]); });
  });
  let grandchild = 0;
  cleanup.push(async () => {
    for (const pid of [grandchild, handle.pid ?? 0]) if (pid > 0 && isAlive(pid)) signalProcessTree(pid);
    await rm(root, { recursive: true, force: true });
  });
  grandchild = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('GRANDCHILD_NOT_STARTED')); }, 5000);
    handle.onMessage((value) => {
      if (typeof value === 'object' && value !== null && 'pid' in value && typeof value.pid === 'number') {
        clearTimeout(timeout);
        resolve(value.pid);
      }
    });
  });
  return { handle, grandchild, exited };
}

it('kills a live leader and the detached descendant that leads its own group', async () => {
  const { handle, grandchild, exited } = await leaderWithDetachedGrandchild();
  const leader = handle.pid;
  if (leader === null) throw new Error('NO_PID');
  expect(isAlive(leader)).toBe(true);
  expect(isAlive(grandchild)).toBe(true);

  handle.send({ kind: 'stop' });
  await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
  // A child that ignores stop is still running; this is the case the kill exists for.
  expect(isAlive(leader)).toBe(true);

  handle.kill();
  expect(await exited).toEqual([null, 'SIGKILL']);
  // The grandchild is in a group the fork does not lead; a single `kill(-leader)` would miss it.
  await vi.waitFor(() => { expect(isAlive(grandchild)).toBe(false); }, { timeout: 2000 });
});

it('does not signal again once the child has exited (no stray signal to a recycled pid)', async () => {
  const { handle, exited } = await leaderWithDetachedGrandchild();
  handle.kill();
  await exited;
  const kill = vi.spyOn(process, 'kill');
  try {
    handle.kill();
    expect(kill).not.toHaveBeenCalled();
  } finally {
    kill.mockRestore();
  }
});

// ── AC-11 j (R10-OBS-1): the kill path never blocks the event loop on `ps` ───────────────────────

const psCalls = (): number => synchronous.commands.filter((command) => command === 'ps').length;

it('kills the leader and the detached descendant from the latest asynchronous sample, never reaching the synchronous ps', async () => {
  const { handle, grandchild, exited } = await leaderWithDetachedGrandchild();
  const leader = handle.pid;
  if (leader === null) throw new Error('NO_PID');
  handle.trackTree?.();
  // Several samples (25 ms cadence, never overlapping) so the descendant is in the latest table, not only in the memory of an early one.
  await new Promise<void>((resolve) => { setTimeout(resolve, 400); });
  expect(isAlive(grandchild)).toBe(true);

  const before = psCalls();
  handle.kill();
  expect(psCalls() - before).toBe(0);

  expect(await exited).toEqual([null, 'SIGKILL']);
  await vi.waitFor(() => { expect(isAlive(grandchild)).toBe(false); }, { timeout: 2000 });
  // Nothing on the way down fell back to it either (the waits above use `isAlive` only).
  expect(psCalls() - before).toBe(0);
});

it('with no sample yet (the tree was never tracked) it reads one asynchronously before signalling, and still reaches the descendant', async () => {
  const { handle, grandchild, exited } = await leaderWithDetachedGrandchild();
  expect(isAlive(grandchild)).toBe(true);

  const before = psCalls();
  handle.kill();
  expect(psCalls() - before).toBe(0);

  // Enumerate before signalling: the leader is not signalled until the table has been read, so the descendant is in it.
  expect(await exited).toEqual([null, 'SIGKILL']);
  await vi.waitFor(() => { expect(isAlive(grandchild)).toBe(false); }, { timeout: 2000 });
  expect(psCalls() - before).toBe(0);
});
