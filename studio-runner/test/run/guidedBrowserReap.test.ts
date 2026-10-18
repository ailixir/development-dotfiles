/**
 * STUDIO-OBS-009 AC-11 k residue (lane R2): the reap proof for a guided launch, in the unit tier, over real Node
 * processes and no browser (AC-25: the unit tier may not load `browser.ts` or Playwright).
 *
 * `hardTeardown` in `launchGuidedBrowser` is `launchMarkers` -> `killLaunchTree` -> `survivorsOf` -> scratch removal,
 * and since KL-015-D5 it is the only way a guided launch ends other than a graceful close that always ends in it
 * (`guidedCloseStages`). This file proves the kill half of that chain on real processes that look the way a launch's
 * children look to `ps` (a direct child of this process whose command line names the launch's scratch directory, with a
 * descendant that leads a process group of its own, as Chromium and its encoder do):
 *
 * - the launch's whole tree is signalled and gone afterwards, and a process of another launch is left alone;
 * - a kill that does not take leaves survivors, which is what makes the teardown reject and the slot stay held;
 * - the process listing, read the way the lane receipts read it, shows no process naming the launch afterwards.
 *
 * The Chromium version of the same chain (frozen browsers, real wire) is `test/fixtures-tier/guidedCloseBound.test.ts`.
 * Two source pins below keep the unit tier honest about what it cannot import.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createForkSpawner } from '../../src/run/launcher.js';
import type { ChildProcessHandle } from '../../src/run/launcher.js';
import { isAlive, killLaunchTree, readProcessTableWithArgs, selectLaunchRoots, signalProcessTree, survivorsOf } from '../../src/run/tree.js';
import { packageRoot } from '../helpers/corpus.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

interface Launch {
  readonly scratch: string;
  readonly handle: ChildProcessHandle;
  readonly grandchild: number;
}

/**
 * One fake "launch": a direct child of this process whose argv names `<scratch>/browser-profile`, and that spawned a
 * detached grandchild of its own (its own process group, like the browser's renderers and the video encoder).
 */
async function fakeLaunch(label: string): Promise<Launch> {
  const root = await mkdtemp(join(tmpdir(), `guided-reap-${label}-`));
  const scratch = join(root, 'checks-guided-fake');
  const grandchildPath = join(root, 'grandchild.mjs');
  const leaderPath = join(root, 'leader.mjs');
  await writeFile(grandchildPath, 'setInterval(() => {}, 1000);\n');
  await writeFile(
    leaderPath,
    `import {spawn} from 'node:child_process';` +
      `const g=spawn(process.execPath,[${JSON.stringify(grandchildPath)}],{detached:true,stdio:'ignore'});` +
      `process.send({pid:g.pid});process.on('message',()=>{});setInterval(()=>{},1000);\n`,
  );
  const handle = createForkSpawner().spawn({ modulePath: leaderPath, args: [`--user-data-dir=${scratch}/browser-profile`], env: { PATH: process.env.PATH ?? '' } });
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
  return { scratch, handle, grandchild };
}

const namesLaunch = (scratch: string): number => readProcessTableWithArgs().filter((row) => row.args.includes(scratch)).length;

describe('KL-015-D5 / AC-11 k: a guided launch is reaped by its own markers, whole tree, and nothing else', () => {
  it('kills the launch\'s leader and its detached descendant, confirms them gone, and leaves another launch untouched', async () => {
    const mine = await fakeLaunch('mine');
    const other = await fakeLaunch('other');
    const leader = mine.handle.pid ?? 0;
    expect(leader).toBeGreaterThan(1);
    // Before: the listing names both launches (this is the receipt's "ps before").
    expect(namesLaunch(mine.scratch)).toBeGreaterThanOrEqual(1);
    expect(namesLaunch(other.scratch)).toBeGreaterThanOrEqual(1);
    expect(selectLaunchRoots(readProcessTableWithArgs(), process.pid, [mine.scratch])).toEqual([leader]);
    const enumerated = killLaunchTree([mine.scratch]);
    expect([...enumerated].sort()).toEqual([leader, mine.grandchild].sort());
    expect(await survivorsOf(enumerated, 2_000)).toEqual([]);
    expect(isAlive(leader)).toBe(false);
    expect(isAlive(mine.grandchild)).toBe(false);
    // After: no process names the reaped launch, and the other launch is exactly as it was.
    expect(namesLaunch(mine.scratch)).toBe(0);
    expect(isAlive(other.handle.pid ?? 0)).toBe(true);
    expect(isAlive(other.grandchild)).toBe(true);
    expect(namesLaunch(other.scratch)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('reports a survivor when the kill does not take, so the teardown rejects and the slot stays held', async () => {
    const launch = await fakeLaunch('survivor');
    // A kill that signals nothing (a process the kernel will not end): the very condition `hardTeardown` fails closed on.
    const enumerated = killLaunchTree([launch.scratch], { kill: () => undefined });
    expect([...enumerated].sort()).toEqual([launch.handle.pid ?? 0, launch.grandchild].sort());
    const left = await survivorsOf(enumerated, 150);
    expect([...left].sort()).toEqual([launch.handle.pid ?? 0, launch.grandchild].sort());
  }, 30_000);

  it('fails closed on a process table that cannot show this worker: nothing is signalled and nothing is reported gone', async () => {
    const launch = await fakeLaunch('unreadable');
    expect(() => killLaunchTree([launch.scratch], { readTable: () => [] })).toThrow('PROCESS_TABLE_UNREADABLE');
    expect(isAlive(launch.handle.pid ?? 0)).toBe(true);
    expect(isAlive(launch.grandchild)).toBe(true);
  }, 30_000);
});

describe('KL-015-D5 the close paths of launchGuidedBrowser (source pins; the unit tier cannot load browser.ts)', () => {
  const source = readFileSync(join(packageRoot, 'src', 'run', 'browser.ts'), 'utf8');
  const launch = source.slice(source.indexOf('export async function launchGuidedBrowser'), source.indexOf('async function launchMarkers'));

  it('has no graceful close on a failed launch: the catch always takes the hard teardown (path (iii))', () => {
    const caught = launch.slice(launch.indexOf('} catch(error) {'), launch.indexOf('async function hardTeardown'));
    expect(caught).toContain('hardTeardown(acquired)');
    expect(caught).not.toMatch(/\.close\(\)/u);
    expect(caught).not.toContain('cleanup');
    // The explicit graceful close of the old blank-document refusal went with it.
    expect(launch).not.toMatch(/bounded\(\(\) => live\.close\(\)\)/u);
  });

  it('closes a started browser only through the two-stage helper, and hands the runtime its terminate and its orderly verdict', () => {
    expect(launch.match(/guidedCloseStages\(/gu)).toHaveLength(1);
    expect(launch).toContain('graceful: () => acquired.close()');
    expect(launch).toContain('terminate: stages.terminate');
    expect(launch).toContain('orderlyClosed: stages.orderlyClosed');
    // Scratch is removed once, from the one place the hard teardown ends.
    expect(launch.match(/await disposeScratch\(\)/gu)).toHaveLength(1);
  });

  it('keeps the survivor check in the hard teardown: a launch not confirmed gone rejects CONTEXT_LOST before its scratch is removed', () => {
    const teardown = launch.slice(launch.indexOf('async function hardTeardown'));
    const check = teardown.indexOf("if((await survivorsOf([...seen],500)).length>0)throw new Error('CONTEXT_LOST');");
    expect(check).toBeGreaterThan(-1);
    expect(teardown.indexOf('await disposeScratch()')).toBeGreaterThan(check);
  });
});
