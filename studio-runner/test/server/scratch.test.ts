/**
 * The real filesystem scratch store (AC-12, AC-21, architecture §9.3).
 *
 * The behavioural suite runs against a fake so it can assert ordering; this file exercises the
 * implementation that actually ships, because "scratch is cleared on every path" is a claim about
 * directories on disk, not about a test double.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFsScratchStore } from '../../src/server/scratch.js';

function temporaryRoot(): string {
  return join(mkdtempSync(join(tmpdir(), 'studio-runner-scratch-')), 'scratch');
}

describe('filesystem scratch store', () => {
  it('creates a per-run directory and clears it', async () => {
    const root = temporaryRoot();
    const store = createFsScratchStore(root);
    const run = await store.create('adm-123');

    expect(existsSync(run.path)).toBe(true);
    expect(await store.list()).toEqual(['adm-123']);

    writeFileSync(join(run.path, 'trace.txt'), 'nothing secret', 'utf8');
    await run.clear();

    expect(existsSync(run.path)).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('clears twice without failing, so error paths can clear unconditionally', async () => {
    const store = createFsScratchStore(temporaryRoot());
    const run = await store.create('adm-456');
    await run.clear();
    await expect(run.clear()).resolves.toBeUndefined();
  });

  it('clears everything at startup, so a pod killed mid-run inherits nothing', async () => {
    const root = temporaryRoot();
    const store = createFsScratchStore(root);
    await store.create('leftover-from-a-killed-pod');
    expect(await store.list()).toEqual(['leftover-from-a-killed-pod']);

    await store.clearAll();
    expect(await store.list()).toEqual([]);
    // The root itself is recreated, so the next run does not have to check for it.
    expect(existsSync(root)).toBe(true);
  });

  it('reports an empty list rather than throwing when the root does not exist', async () => {
    const store = createFsScratchStore(join(temporaryRoot(), 'never-created'));
    expect(await store.list()).toEqual([]);
  });

  it.each(['../escape', 'a/b', 'with space', ''])(
    'refuses the run id %j rather than letting it shape a path',
    async (runId) => {
      const store = createFsScratchStore(temporaryRoot());
      await expect(store.create(runId)).rejects.toThrow(/not permitted in a path/u);
    },
  );
});
