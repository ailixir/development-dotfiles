/**
 * The win32 file host (ADR-SC-009: Windows is local development only). The pure parts (SID parse, icacls grant, SDDL
 * evaluation, `isInside`, sharing violations) live in `win32FilesModel.ts`, unit-tested on every OS.
 *
 * Windows has no uid and no mode bits (libuv reports uid 0 and mode 0o666), so per-node owner and mode checks are replaced
 * by one protected ACL on each private root, set by SID through `icacls` and read back as SDDL before it is trusted;
 * children inherit it. There is no `O_NOFOLLOW`, `O_DIRECTORY` or `O_NONBLOCK`, so every checked open is fenced
 * (`fence.ts`: lstat before, bigint dev/ino after). Directory fsync is refused there (EPERM), so it is a no-op. Paths are
 * canonical through the native realpath and compared case-insensitively. Removal retries sharing violations.
 */
import { execFile } from 'node:child_process';
import { constants, realpathSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { promisify } from 'node:util';

import type { FileHost } from './types.js';
import { evaluatePrivateRootSddl, isInsideWin32, isSharingViolationError, parseWhoamiSid, privateRootGrantArguments, sddlFromIcaclsSave } from './win32FilesModel.js';

/** Bound of one whoami or icacls call; they run at startup and once per recording namespace. */
const TOOL_TIMEOUT_MS = 10_000;
/** `rm` retries, as Playwright's own removal on Windows: a handle ffmpeg, Defender or the indexer holds is usually gone soon. */
const REMOVE_RETRIES = Object.freeze({ maxRetries: 5, retryDelay: 100 });

function refused(reason: string): Error {
  return new Error(`PRIVATE_ROOT_REFUSED: ${reason} (ADR-SC-009)`);
}

/** A System32 tool by absolute path, never through PATH. */
function systemTool(name: string): string {
  const root = process.env.SystemRoot;
  if (root === undefined || !win32.isAbsolute(root)) throw refused('SystemRoot is not an absolute path');
  return win32.join(root, 'System32', name);
}

async function tool(name: string, args: readonly string[]): Promise<string> {
  const root = process.env.SystemRoot ?? '';
  // `execFile` is touched only here, never at import: index.ts loads this module on every platform, under any child_process mock.
  const { stdout } = await promisify(execFile)(systemTool(name), [...args], { encoding: 'utf8', windowsHide: true, timeout: TOOL_TIMEOUT_MS, env: { SystemRoot: root, windir: root } });
  return stdout;
}

let userSid: Promise<string> | undefined;
/** The current user's SID, read once per process (a failed read is retried next time). Exported for the Windows-only test. */
export function currentUserSid(): Promise<string> {
  userSid ??= tool('whoami.exe', ['/user', '/fo', 'csv', '/nh']).then((stdout) => {
    const sid = parseWhoamiSid(stdout);
    if (sid === null) throw refused('whoami did not report one user SID');
    return sid;
  });
  userSid.catch(() => { userSid = undefined; });
  return userSid;
}

/** The directory's DACL as SDDL, through `icacls /save` into a private temporary file. Exported for the Windows-only test. */
export async function readDacl(path: string): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), 'sr-acl-'));
  try {
    const file = join(scratch, 'acl');
    await tool('icacls.exe', [path, '/save', file]);
    const sddl = sddlFromIcaclsSave(await readFile(file));
    if (sddl === null) throw refused('icacls did not report one DACL');
    return sddl;
  } finally {
    await rm(scratch, { recursive: true, force: true, ...REMOVE_RETRIES });
  }
}

/** The directory itself, never a link or junction (icacls would follow one and change the target's ACL). */
async function plainDirectory(path: string): Promise<{ dev: bigint; ino: bigint }> {
  const stat = await lstat(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw refused('the private root is a link, a junction or not a directory');
  return { dev: stat.dev, ino: stat.ino };
}

export const win32Files: FileHost = {
  id: 'win32',
  // No O_NOFOLLOW, O_DIRECTORY or O_NONBLOCK on Windows (they would be `undefined | x`): 0, and every open is fenced instead.
  flags: Object.freeze({
    directory: constants.O_RDONLY,
    noFollow: constants.O_RDONLY,
    noFollowNonBlock: constants.O_RDONLY,
    createExclusive: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
  }),
  fencesOpens: true,
  descriptorPaths: false,
  // Not `C:\tmp`, which inherits the drive root's ACL; short, so quarantine paths stay well under MAX_PATH.
  defaultRoots: Object.freeze({ scratch: join(tmpdir(), 'studio-runner'), objects: join(tmpdir(), 'studio-runner-objects') }),
  // uid is always 0 on Windows: ownership is the private root's ACL (user, SYSTEM, Administrators), inherited by every node.
  isOwnNode: () => true,
  // Modes are synthetic on Windows (0o666, 0o444 read-only): access is the private root's protected ACL, not mode bits.
  hasMode: () => true,
  // As hasMode: no group or other bits exist to be set; the private root's ACL excludes every other principal.
  lacksMode: () => true,
  async makePrivateRoot(path) {
    await mkdir(path).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
    const before = await plainDirectory(path), sid = await currentUserSid();
    await tool('icacls.exe', privateRootGrantArguments(path, sid));
    const verdict = evaluatePrivateRootSddl(await readDacl(path), sid);
    if (!verdict.ok) throw refused(verdict.reason);
    // The ACL landed on the node that was checked, not on a link swapped in meanwhile.
    const after = await plainDirectory(path);
    if (after.dev !== before.dev || after.ino !== before.ino) throw refused('the private root changed while its ACL was set');
  },
  // Directory fsync is EPERM on Windows; NTFS journals its directory entries, but they are not forced durable here.
  syncDirectory: () => Promise.resolve(),
  syncDirectorySync: () => undefined,
  canonical: (path) => realpathSync.native(path),
  canonicalAsync: (path) => realpath(path),
  isInside: isInsideWin32,
  remove: (path) => rm(path, { recursive: true, force: true, ...REMOVE_RETRIES }),
  isSharingViolation: isSharingViolationError,
};
