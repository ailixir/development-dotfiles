/**
 * The win32 process host (ADR-SC-009: Windows is local development only; `NODE_ENV=production` is refused in `main.ts`).
 *
 * The table comes from `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -EncodedCommand
 * <constant>` running `Get-CimInstance Win32_Process` (user decision 2026-11-05: PowerShell 5.1 CIM is allowed on bank laptops).
 * By absolute path, with an enumerated environment of `SystemRoot` and `windir` only (no `PATH`, no `PSModulePath`, no user
 * variables), no console window, stdin closed. Every reader answers `[]` on any failure and never throws, as on posix, and a
 * runner that cannot read it refuses to start (D4, fail closed). The scripts, their parse and every rule over the rows are in
 * `win32ProcessModel.ts`, unit-tested on every OS.
 *
 * Nothing here has been run on Windows yet (ADR-SC-009: not verified until a recorded Windows run).
 */
import { execFile, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ParentEnvironment, ProcessHost, ProcessRow, SignalSender, TreeSignalOutcome } from './types.js';
import { TABLE_SCRIPT, TABLE_SCRIPT_WITH_ARGS, descendantsByCreation, encodeCommand, parseCimTable, parseCimTableWithArgs, selectWindowsLaunchRoots } from './win32ProcessModel.js';

/** The argv after `powershell.exe`, plain and with command lines. Constant: nothing from a caller reaches PowerShell. */
export const POWERSHELL_ARGUMENTS = Object.freeze(['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(TABLE_SCRIPT)]);
export const POWERSHELL_ARGUMENTS_WITH_ARGS = Object.freeze(['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(TABLE_SCRIPT_WITH_ARGS)]);

/**
 * The bound of the guided teardown's table read (`killLaunchTree`), whatever the caller asks. The guided close bound is 4.5 s
 * (3 s graceful plus 1.5 s hard) and a CIM call is expected to take 0.3–2 s (to be measured by the W0 preflight): 2.5 s answers
 * a slow call rather than reporting `PROCESS_TABLE_UNREADABLE`, and a read slower than that would miss the close bound anyway, where
 * the parent ends the child and its job object takes the browser.
 */
export const LAUNCH_TABLE_TIMEOUT_MS = 2_500;
/** The bound of one `taskkill /T /F`. It runs synchronously (see {@link signalTree}); it normally takes 0.1–0.3 s. */
export const TASKKILL_TIMEOUT_MS = 1_000;
const MAX_LISTING_BYTES = 64 * 1024 * 1024;

/** `SystemRoot` (or `windir`) when it is an absolute Windows path; the executables are found under it, never on `PATH`. */
function systemRoot(): string | undefined {
  const root = process.env.SystemRoot ?? process.env.windir;
  return root !== undefined && win32.isAbsolute(root) ? root : undefined;
}

/** The whole environment PowerShell and taskkill get: what Windows itself needs to start a process, nothing that loads code. */
function systemEnv(root: string): Record<string, string> {
  return { SystemRoot: root, windir: process.env.windir ?? root };
}

function powershell(withArgs: boolean): { file: string; args: readonly string[]; env: Record<string, string> } | undefined {
  const root = systemRoot();
  if (root === undefined) return undefined;
  return { file: win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: withArgs ? POWERSHELL_ARGUMENTS_WITH_ARGS : POWERSHELL_ARGUMENTS, env: systemEnv(root) };
}

function readSync<T>(withArgs: boolean, timeoutMs: number, parse: (stdout: string) => readonly T[]): readonly T[] {
  try {
    const command = powershell(withArgs);
    if (command === undefined) return [];
    // stdin ignored: PowerShell 5.1 with a redirected stdin that never closes can wait on it.
    const listing = spawnSync(command.file, [...command.args], { encoding: 'utf8', timeout: Math.max(1, timeoutMs), env: command.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_LISTING_BYTES });
    if (listing.error !== undefined || listing.status !== 0 || typeof listing.stdout !== 'string') return [];
    return parse(listing.stdout);
  } catch {
    return [];
  }
}

function readAsync<T>(withArgs: boolean, timeoutMs: number, parse: (stdout: string) => readonly T[]): Promise<readonly T[]> {
  return new Promise((done) => {
    try {
      const command = powershell(withArgs);
      if (command === undefined) { done([]); return; }
      const child = execFile(command.file, [...command.args], { encoding: 'utf8', timeout: Math.max(1, timeoutMs), env: command.env, windowsHide: true, maxBuffer: MAX_LISTING_BYTES }, (error, stdout) => {
        try { done(error === null && typeof stdout === 'string' ? parse(stdout) : []); } catch { done([]); }
      });
      // `execFile` always pipes stdin; close it so PowerShell never waits on it.
      child.stdin?.on('error', () => undefined);
      child.stdin?.end();
    } catch {
      done([]);
    }
  });
}

/**
 * `taskkill /PID pid /T /F`: the OS walks the tree from a fresh snapshot, so it reaches descendants the table missed (born after
 * it). Synchronous and **before** the per-pid kills, because it walks from the root: a root already terminated has no tree to walk.
 * The cost is a held event loop for the call (bounded by {@link TASKKILL_TIMEOUT_MS}); Windows is development only. Never throws.
 */
function taskkillTree(pid: number): void {
  try {
    const root = systemRoot();
    if (root === undefined) return;
    spawnSync(win32.join(root, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { env: systemEnv(root), windowsHide: true, stdio: 'ignore', timeout: TASKKILL_TIMEOUT_MS });
  } catch {
    // taskkill is missing or refused; the per-pid kills and the job object still apply.
  }
}

function signalOne(pid: number, signal: NodeJS.Signals, kill: SignalSender): void {
  try {
    // TerminateProcess on win32. No group form: a negative pid is ESRCH there.
    kill(pid, signal);
  } catch {
    // Already gone, or not ours.
  }
}

/**
 * Ends the tree below `pid` deepest-first, then `pid`, over `table` (creation-time tree, so a reused pid is not a descendant).
 * `taskkill /T /F` runs first only when `table` shows `pid` with a creation time: that is a process this host listed, and the
 * one way the unit tier, which injects `kill` and invents pids, can never reach a real process through taskkill.
 */
function signalTree(pid: number, signal: NodeJS.Signals, kill: SignalSender, table: readonly ProcessRow[]): TreeSignalOutcome {
  const found = descendantsByCreation(pid, table);
  if (Number.isInteger(pid) && pid > 4 && table.some((row) => row.pid === pid && row.startedAt !== undefined)) taskkillTree(pid);
  const signalled: number[] = [];
  for (const descendant of [...found].reverse()) {
    signalOne(descendant, signal, kill);
    signalled.push(descendant);
  }
  signalOne(pid, signal, kill);
  signalled.push(pid);
  return { signalled };
}

/**
 * The browser child's allowlist on win32. Nothing on it may load code (`launcher.ts` re-checks every launch).
 * - `PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `LANG`: as on posix.
 * - `SystemRoot`: Winsock needs it; without it Chromium has no network (WSAEPROVIDERFAILUREINIT, 10106) and Node's crypto fails.
 * - `windir`: the legacy name of the same directory, which system components still read.
 * Not `USERPROFILE`/`LOCALAPPDATA`: Node falls back to the token's profile directory and Playwright to the home directory.
 */
export const WIN32_INHERITED_ENV_KEYS: readonly string[] = Object.freeze(['PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'SystemRoot', 'windir']);

/** Windows variable names are case-insensitive (`Path` is `PATH`); a plain record is searched that way, the exact name first. */
function inherited(parent: ParentEnvironment, key: string): string | undefined {
  const exact = parent[key];
  if (exact !== undefined) return exact;
  const upper = key.toUpperCase();
  for (const [name, value] of Object.entries(parent)) if (name.toUpperCase() === upper && value !== undefined) return value;
  return undefined;
}

/** `TEMP` and `TMP` are what Windows (`GetTempPath`) and Node's `os.tmpdir()` read; `TMPDIR` keeps the posix key for Playwright and parity. */
function tempKeys(tmpDir: string): Record<string, string> {
  return { TEMP: tmpDir, TMP: tmpDir, TMPDIR: tmpDir };
}

function childEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of WIN32_INHERITED_ENV_KEYS) {
    const value = inherited(parent, key);
    if (value !== undefined && value !== '') env[key] = value;
  }
  return Object.assign(env, tempKeys(tmpDir));
}

/** What Playwright hands Chromium: `PATH`, `SystemRoot` and `windir` (network, system DLLs) and the temp keys. */
function browserEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string> {
  const env: Record<string, string> = { PATH: inherited(parent, 'PATH') ?? '' };
  for (const key of ['SystemRoot', 'windir']) {
    const value = inherited(parent, key);
    if (value !== undefined && value !== '') env[key] = value;
  }
  return Object.assign(env, tempKeys(tmpDir));
}

/** The native canonical path (8.3 names expanded, drive letter case normalised); the resolved path when it cannot be read. */
function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function isEntryPoint(moduleUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (argv1 === undefined) return false;
  try {
    return canonical(argv1).toLowerCase() === canonical(fileURLToPath(moduleUrl)).toLowerCase();
  } catch {
    return false;
  }
}

export const win32Process: ProcessHost = {
  id: 'win32',
  productionSupported: false,
  // Not detached: libuv keeps the child in its kill-on-close job, so Chrome and ffmpeg end with it; no console window.
  fork: Object.freeze({ detached: false, windowsHide: true }),
  samplesTree: false,
  sampleIntervalMs: 0,
  // The one snapshot after `ready`. Nothing awaits it (a kill before it lands relies on the job object), so the bound only decides
  // when a hung PowerShell is given up: well above the expected 0.3–2 s, including a cold PowerShell start.
  sampleTimeoutMs: 5_000,
  // The startup guard's synchronous reads (design: bounded at about 10 s), and the default of every other read.
  tableTimeoutMs: 10_000,
  // SIGTERM is never delivered on Windows.
  drainSignals: Object.freeze(['SIGINT', 'SIGBREAK', 'SIGHUP'] as const),
  inheritedEnvKeys: WIN32_INHERITED_ENV_KEYS,
  readTable: (timeoutMs) => readSync(false, timeoutMs, parseCimTable),
  readTableAsync: (timeoutMs) => readAsync(false, timeoutMs, parseCimTable),
  readTableWithArgs: (timeoutMs) => readSync(true, timeoutMs, parseCimTableWithArgs),
  readLaunchTable: (timeoutMs) => readAsync(true, Math.min(timeoutMs, LAUNCH_TABLE_TIMEOUT_MS), parseCimTableWithArgs),
  descendants: descendantsByCreation,
  signalTree,
  launchRoots: selectWindowsLaunchRoots,
  childEnv,
  browserEnv,
  isEntryPoint,
};
