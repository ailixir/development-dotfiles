/**
 * The caller-side open fence (design F4/F6). On posix it is a plain open; with `fences` forced on (the win32 path) it
 * refuses a link at the path and accepts a regular file and a fresh exclusive create. Driven here on the
 * real filesystem with the fence switched on, so the win32 caller logic is exercised on every OS.
 */
import { closeSync, constants, fstatSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { openFenced, openFencedSync } from '../../../src/run/host/fence.js';
import { describePosixOnly } from '../../helpers/platform.js';

const root = mkdtempSync(join(tmpdir(), 'host-fence-'));
afterAll(() => { rmSync(root, { recursive: true, force: true }); });
const read = constants.O_RDONLY;

describe('openFencedSync / openFenced with the fence on', () => {
  it('opens a regular file and creates an exclusive one', async () => {
    const file = join(root, 'plain');
    writeFileSync(file, 'x');
    const fd = openFencedSync(file, read, undefined, true);
    expect(fstatSync(fd).isFile()).toBe(true);
    closeSync(fd);
    const handle = await openFenced(file, read, undefined, true);
    expect((await handle.stat()).isFile()).toBe(true);
    await handle.close();
    const created = openFencedSync(join(root, 'new-sync'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600, true);
    closeSync(created);
    const createdAsync = await openFenced(join(root, 'new-async'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600, true);
    await createdAsync.close();
  });

  it('still fails a missing file the way the open does', async () => {
    expect(() => openFencedSync(join(root, 'absent'), read, undefined, true)).toThrow(/ENOENT/u);
    await expect(openFenced(join(root, 'absent'), read, undefined, true)).rejects.toThrow(/ENOENT/u);
  });
});

describePosixOnly('creating a symlink needs privilege on Windows', 'the fence refuses a link', () => {
  it('that the open itself would have followed', async () => {
    const target = join(root, 'target');
    writeFileSync(target, 'x');
    const link = join(root, 'link');
    symlinkSync(target, link);
    expect(() => openFencedSync(link, read, undefined, true)).toThrow('OPEN_FENCE_REFUSED');
    await expect(openFenced(link, read, undefined, true)).rejects.toThrow('OPEN_FENCE_REFUSED');
  });
});

describe('with the fence off (the posix host)', () => {
  it('is the plain open', async () => {
    const file = join(root, 'plain-off');
    writeFileSync(file, 'x');
    closeSync(openFencedSync(file, read));
    await (await openFenced(file, read)).close();
  });
});
