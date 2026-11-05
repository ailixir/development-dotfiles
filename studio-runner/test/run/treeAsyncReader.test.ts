/**
 * STUDIO-OBS-012A — the asynchronous process-table reader against the real `ps`.
 *
 * The observed-run tree tracker samples the process table every 25 ms. With the synchronous
 * reader each sample held the event loop for the whole `ps` call, so every runner timer — the
 * secret-bearing control stop with its 2 s bound among them — fired late. This file proves the
 * replacement reads the same table *without* holding the loop: a callback queued after the read
 * starts runs before the read finishes, which a blocking reader cannot allow.
 */
import { expect } from 'vitest';
import { itPosixOnly } from '../helpers/platform.js';

import { canEnumerateProcessTree, descendantsOf, readProcessTable, readProcessTableAsync } from '../../src/run/tree.js';

const POSIX_ONLY = 'reads the real `ps` table; the win32 CIM reader has its own host tests';
itPosixOnly(POSIX_ONLY, 'yields the event loop while ps runs, then answers a table that contains this process', async () => {
  const order: string[] = [];
  const pending = readProcessTableAsync(5000).then((table) => {
    order.push('table');
    return table;
  });
  // Queued *after* the read started. A synchronous reader would have finished before this line.
  setImmediate(() => order.push('immediate'));
  const table = await pending;
  expect(order).toEqual(['immediate', 'table']);
  expect(canEnumerateProcessTree(table)).toBe(true);
  expect(table.find((row) => row.pid === process.pid)?.ppid).toBe(process.ppid);
});

itPosixOnly(POSIX_ONLY, 'reads the same tree shape as the synchronous reader', async () => {
  const [syncTable, asyncTable] = [readProcessTable(5000), await readProcessTableAsync(5000)];
  // Both see this process under its parent; the rest of the table is live and may differ.
  for (const table of [syncTable, asyncTable]) {
    expect(descendantsOf(process.ppid, table)).toContain(process.pid);
  }
});
