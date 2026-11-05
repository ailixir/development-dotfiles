/**
 * Checked opens (design F4/F6). Where the host has `O_NOFOLLOW` (posix) the flags refuse a link at the open itself and this is
 * a plain open. Where it has none (`host.files.fencesOpens`, win32) a link swapped in cannot be prevented, only detected: the
 * path is lstat'ed before the open (never a link), and after it the descriptor and the path must be the same node by
 * **bigint** dev/ino (NTFS file ids exceed 2^53). A create (`O_CREAT`) has no node before, so only the after fence applies.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { host } from './index.js';

function refused(): never {
  throw new Error('OPEN_FENCE_REFUSED');
}

const sameNode = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino;
const creates = (flags: number): boolean => (flags & constants.O_CREAT) !== 0;

function judge(before: BigIntStats | null, opened: BigIntStats, now: BigIntStats): void {
  if (before?.isSymbolicLink() === true || now.isSymbolicLink() || !sameNode(opened, now) || (before !== null && !sameNode(before, opened))) refused();
}

/** `openSync`, fenced when `fences` (default: the host's). Throws `OPEN_FENCE_REFUSED` (descriptor closed) on a fence failure. */
export function openFencedSync(path: string, flags: number, mode?: number, fences = host.files.fencesOpens): number {
  if (!fences) return openSync(path, flags, mode);
  const before = creates(flags) ? null : lstatSync(path, { bigint: true });
  if (before?.isSymbolicLink() === true) refused();
  const fd = openSync(path, flags, mode);
  try {
    judge(before, fstatSync(fd, { bigint: true }), lstatSync(path, { bigint: true }));
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

/** `fs/promises.open`, fenced when `fences` (default: the host's). Rejects `OPEN_FENCE_REFUSED` (handle closed) on a fence failure. */
export async function openFenced(path: string, flags: number, mode?: number, fences = host.files.fencesOpens): Promise<FileHandle> {
  if (!fences) return open(path, flags, mode);
  const before = creates(flags) ? null : await lstat(path, { bigint: true });
  if (before?.isSymbolicLink() === true) refused();
  const handle = await open(path, flags, mode);
  try {
    judge(before, await handle.stat({ bigint: true }), await lstat(path, { bigint: true }));
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}
