/**
 * The win32 file host (ADR-SC-009). Its constants and the members that need no Windows tool are pinned on every OS; the
 * members that only Windows can exercise (icacls, junctions, NTFS file ids, directory fsync) run in the Windows-only suite.
 */
import { constants, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GuidedJournal } from '../../../src/guided/journal.js';
import { openFencedSync } from '../../../src/run/host/fence.js';
import { currentUserSid, readDacl, win32Files } from '../../../src/run/host/win32Files.js';
import { evaluatePrivateRootSddl } from '../../../src/run/host/win32FilesModel.js';
import { prepareBrowserProfile, releaseBrowserProfile, requireBrowserPreferences } from '../../../src/run/scratchLayout.js';
import { describeWindowsOnly } from '../../helpers/platform.js';

const root = mkdtempSync(join(tmpdir(), 'w32f-'));
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('the win32 file host constants', () => {
  it('opens with the access mode and create-exclusive only: no no-follow, directory or non-blocking bit, fenced instead', () => {
    expect(win32Files.id).toBe('win32');
    expect(win32Files.flags).toEqual({
      directory: constants.O_RDONLY,
      noFollow: constants.O_RDONLY,
      noFollowNonBlock: constants.O_RDONLY,
      createExclusive: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    });
    expect(Object.isFrozen(win32Files.flags)).toBe(true);
    expect(win32Files.fencesOpens).toBe(true);
    expect(win32Files.descriptorPaths).toBe(false);
  });

  it('keeps its default roots under the OS temp directory, not a drive-root tmp', () => {
    expect(win32Files.defaultRoots).toEqual({ scratch: join(tmpdir(), 'studio-runner'), objects: join(tmpdir(), 'studio-runner-objects') });
  });

  it('passes per-node owner and mode checks, which the private root ACL replaces', () => {
    const libuvWindowsStat = { uid: 0, mode: 0o100666 };
    expect(win32Files.isOwnNode(libuvWindowsStat)).toBe(true);
    expect(win32Files.hasMode(libuvWindowsStat, 0o700)).toBe(true);
    expect(win32Files.lacksMode(libuvWindowsStat, 0o077)).toBe(true);
    expect(win32Files.isOwnNode({ uid: 0n })).toBe(true);
  });

  it('makes directory fsync a no-op that touches nothing', async () => {
    const absent = join(root, 'never-created');
    await expect(win32Files.syncDirectory(absent)).resolves.toBeUndefined();
    win32Files.syncDirectorySync(absent);
    expect(existsSync(absent)).toBe(false);
  });

  it('compares paths and classifies errors with the Windows model', () => {
    expect(win32Files.isInside('C:\\Scratch', 'c:\\SCRATCH\\run-1')).toBe(true);
    expect(win32Files.isInside('C:\\scratch', 'D:\\scratch\\run-1')).toBe(false);
    expect(win32Files.isSharingViolation(Object.assign(new Error('EPERM'), { code: 'EPERM', syscall: 'rename' }))).toBe(true);
    expect(win32Files.isSharingViolation(Object.assign(new Error('ENOENT'), { code: 'ENOENT', syscall: 'rename' }))).toBe(false);
  });

  it('removes a tree, and a missing path, without an error', async () => {
    const tree = join(root, 'tree');
    mkdirSync(join(tree, 'a', 'b'), { recursive: true });
    writeFileSync(join(tree, 'a', 'b', 'f'), 'x');
    await win32Files.remove(tree);
    expect(existsSync(tree)).toBe(false);
    await expect(win32Files.remove(tree)).resolves.toBeUndefined();
  });
});

describeWindowsOnly('the win32 file host on Windows', () => {
  // The read-back is the host's own icacls /save and whoami, evaluated here independently of makePrivateRoot's own check.
  const verified = async (path: string): Promise<unknown> => evaluatePrivateRootSddl(await readDacl(path), await currentUserSid());

  it('makes a private root whose protected ACL reads back as the user, SYSTEM and Administrators only, and keeps an existing one', async () => {
    const privateRoot = join(root, 'private');
    await win32Files.makePrivateRoot(privateRoot);
    expect(await verified(privateRoot)).toEqual({ ok: true });
    await win32Files.makePrivateRoot(privateRoot);
    expect(await verified(privateRoot)).toEqual({ ok: true });
  }, 30_000);

  it('refuses a junction as a private root, leaving the target untouched, and the fence refuses opening one', async () => {
    const target = join(root, 'junction-target');
    mkdirSync(target);
    const before = await readDacl(target);
    const junction = join(root, 'junction');
    symlinkSync(target, junction, 'junction');
    await expect(win32Files.makePrivateRoot(junction)).rejects.toThrow(/PRIVATE_ROOT_REFUSED/u);
    expect(await readDacl(target)).toBe(before);
    expect(() => openFencedSync(junction, win32Files.flags.directory)).toThrow('OPEN_FENCE_REFUSED');
  }, 30_000);

  it('detects a swapped file by its bigint file id, through the browser-profile pins', async () => {
    const privateRoot = join(root, 'profile-root');
    await win32Files.makePrivateRoot(privateRoot);
    const scratch = join(privateRoot, 'run-1');
    mkdirSync(scratch);
    const profile = prepareBrowserProfile(scratch);
    try {
      requireBrowserPreferences(profile);
      const preferences = join(profile, 'Default', 'Preferences'), content = readFileSync(preferences);
      rmSync(preferences);
      writeFileSync(preferences, content);
      expect(() => { requireBrowserPreferences(profile); }).toThrow('PROFILE_PREFERENCES_REQUIRED');
    } finally {
      releaseBrowserProfile(profile);
    }
  }, 30_000);

  it('opens a guided journal, whose directory fsync would be EPERM, through the no-op', async () => {
    const journal = await GuidedJournal.open(join(root, 'journal'), 'session-1');
    expect(journal.recovered).toBe(false);
  });
});
