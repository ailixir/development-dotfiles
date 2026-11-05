/**
 * The pure half of the win32 process host (ADR-SC-009): the constant PowerShell scripts, the parse of their output, FILETIME
 * conversion, the creation-time tree and the Windows marker rules. Nothing here spawns or signals, so it is unit-tested on
 * every OS; `win32Process.ts` is the edge that runs the scripts and the kills.
 *
 * ## Output encoding
 *
 * One line per process: `pid ppid created [commandLine]`, then a final `END`. `created` is CreationDate as UTC FILETIME ticks
 * (100 ns since 1601-01-01) or `-` when CIM reports none (Idle, System). The command line is `-` when CIM reports none, else
 * `u` followed by its UTF-16 code units in decimal joined by `.` (`u` alone is the empty line). So the output is ASCII digits,
 * `u`, `.`, `-` and spaces: no command line, however hostile (newlines, commas, quotes, a fake `END`), can add a line or a
 * column, and no console code page can garble a non-ASCII path. The encoding uses only casts and `-join`, never a .NET method
 * call, so it also runs under PowerShell's Constrained Language Mode. A listing without its `END` (cut off) reads as `[]`.
 */
import type { ProcessRow, ProcessRowWithArgs } from './types.js';

/** 100 ns ticks from 1601-01-01 to 1970-01-01 UTC. */
export const FILETIME_UNIX_EPOCH = 116_444_736_000_000_000n;

/** `epochMs` (as `Date.now()`) in FILETIME ticks, floored to the millisecond. */
export function filetimeFromEpochMs(epochMs: number): bigint {
  return BigInt(Math.floor(epochMs)) * 10_000n + FILETIME_UNIX_EPOCH;
}

const SCRIPT_HEAD = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';try{";
const SCRIPT_TAIL = "'END';exit 0}catch{exit 1}";
// `ToUniversalTime()` first: CIM hands CreationDate back as a local DateTime, and an Unspecified kind would otherwise be read as UTC.
const CREATED = "$t='-';if($null -ne $p.CreationDate){$t=$p.CreationDate.ToUniversalTime().ToFileTimeUtc()};";

/** The plain table: pid, ppid, creation time. */
export const TABLE_SCRIPT =
  `${SCRIPT_HEAD}foreach($p in Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate){${CREATED}` +
  `"$($p.ProcessId) $($p.ParentProcessId) $t"};${SCRIPT_TAIL}`;

/** {@link TABLE_SCRIPT} plus the command line, encoded as above. */
export const TABLE_SCRIPT_WITH_ARGS =
  `${SCRIPT_HEAD}foreach($p in Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate,CommandLine){${CREATED}` +
  "$c='-';if($null -ne $p.CommandLine){$c='u'+(([int[]][char[]]$p.CommandLine) -join '.')};" +
  `"$($p.ProcessId) $($p.ParentProcessId) $t $c"};${SCRIPT_TAIL}`;

/** A script as `powershell -EncodedCommand` takes it: base64 of its UTF-16LE bytes. */
export function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** The inverse of the script's command-line column; `null` when the token is malformed. */
export function decodeCommandLine(token: string): string | null {
  if (token === '-' || token === 'u') return '';
  if (!/^u\d{1,5}(?:\.\d{1,5})*$/u.test(token)) return null;
  const units = token.slice(1).split('.').map(Number);
  if (units.some((unit) => unit > 0xffff)) return null;
  let text = '';
  // Chunked: one `fromCharCode(...units)` over a very long command line would exceed the argument limit.
  for (let start = 0; start < units.length; start += 4096) text += String.fromCharCode(...units.slice(start, start + 4096));
  return text;
}

const ROW = /^(\d{1,10}) (\d{1,10}) (-|\d{1,20})(?: (-|u[\d.]*))?$/u;
const MAX_PID = 0xffff_ffff;

function parseRows(stdout: string, withArgs: boolean): ProcessRowWithArgs[] {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.at(-1) !== 'END') return [];
  const rows: ProcessRowWithArgs[] = [];
  for (const line of lines.slice(0, -1)) {
    const match = ROW.exec(line);
    if (match === null || (match[4] !== undefined) !== withArgs) continue;
    const pid = Number(match[1]), ppid = Number(match[2]);
    if (pid > MAX_PID || ppid > MAX_PID) continue;
    const args = match[4] === undefined ? '' : decodeCommandLine(match[4]);
    if (args === null) continue;
    const created = match[3] ?? '-';
    rows.push(created === '-' ? { pid, ppid, args } : { pid, ppid, startedAt: BigInt(created), args });
  }
  return rows;
}

/** The output of {@link TABLE_SCRIPT}. `[]` unless it ends with `END`; a malformed line is dropped. */
export function parseCimTable(stdout: string): readonly ProcessRow[] {
  return parseRows(stdout, false).map(({ pid, ppid, startedAt }) => (startedAt === undefined ? { pid, ppid } : { pid, ppid, startedAt }));
}

/** The output of {@link TABLE_SCRIPT_WITH_ARGS}. `[]` unless it ends with `END`; a malformed line is dropped. */
export function parseCimTableWithArgs(stdout: string): readonly ProcessRowWithArgs[] {
  return parseRows(stdout, true);
}

/** Whether `child` may be `parent`'s child by creation time: never when both are known and the child is older (a reused pid). */
function createdInOrder(parent: bigint | undefined, child: bigint | undefined): boolean {
  return parent === undefined || child === undefined || child >= parent;
}

/**
 * Every pid descended from `pid`, breadth-first, excluding `pid`. Windows never rewrites `ParentProcessId`, so a pid that died
 * and was reused makes the old process's children look like the new one's: a row whose ppid matches is **not** a child when it
 * was created before its parent. A creation time the table lacks is unknown, and then ppid alone decides (real CIM rows always
 * carry one; Idle and System do not, and nothing walks from them). Visited set, so a stale reading cannot loop.
 */
export function descendantsByCreation(pid: number, table: readonly ProcessRow[]): readonly number[] {
  const created = new Map<number, bigint>();
  const children = new Map<number, ProcessRow[]>();
  for (const row of table) {
    if (row.startedAt !== undefined && !created.has(row.pid)) created.set(row.pid, row.startedAt);
    const list = children.get(row.ppid);
    if (list === undefined) children.set(row.ppid, [row]);
    else list.push(row);
  }
  const found: number[] = [];
  const seen = new Set<number>([pid]);
  const queue = [pid];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const parentCreated = created.get(next);
    for (const row of children.get(next) ?? []) {
      if (seen.has(row.pid) || !createdInOrder(parentCreated, row.startedAt)) continue;
      seen.add(row.pid);
      found.push(row.pid);
      queue.push(row.pid);
    }
  }
  return found;
}

/** A path as Windows compares it: `/` read as `\`, case folded. Trailing separators dropped (not the drive's own). */
export function normalizeWindowsPath(path: string): string {
  return path.replace(/\//gu, '\\').toUpperCase().replace(/(?<=[^\\:])\\+$/u, '');
}

/**
 * A marker is a launch's own absolute temp path: a drive path with at least two segments below the drive (`C:\a\b`), or a UNC
 * path with at least two below its `\\server\share` root. Anything shorter could match too much; a relative path never matches.
 */
export function usableWindowsMarker(marker: string): boolean {
  const path = normalizeWindowsPath(marker);
  const drive = /^[A-Z]:\\(.*)$/u.exec(path);
  if (drive !== null) return (drive[1] ?? '').split('\\').filter((segment) => segment.length > 0).length >= 2;
  const unc = /^\\\\([^\\]+)\\([^\\]+)\\(.*)$/u.exec(path);
  return unc !== null && (unc[3] ?? '').split('\\').filter((segment) => segment.length > 0).length >= 2;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Whether a command line names `marker` as a path of its own, by Windows rules: either separator, any case; preceded by the start,
 * whitespace, `=` or a quote, and followed by the end, whitespace, a quote or a separator. So `C:\t\guided-ab` is not found inside
 * `C:\t\guided-abc\profile`.
 */
export function windowsCommandLineNames(args: string, marker: string): boolean {
  return new RegExp(`(?:^|[\\s='"])${escapeRegExp(normalizeWindowsPath(marker))}(?:$|[\\s'"\\\\])`, 'u').test(normalizeWindowsPath(args));
}

/** The lowest pids Windows gives real user processes are above these: 0 is the Idle process, 4 is System. */
const SYSTEM_PID_CEILING = 4;

/**
 * Direct children of `parentPid` that name one of `markers` (Windows rules), not created before the parent (pid reuse) nor,
 * when `sinceEpochMs` is given, before the launch began. A creation time the table lacks is unknown and filters nothing, as in
 * {@link descendantsByCreation}. The parent itself, Idle and System are never chosen.
 */
export function selectWindowsLaunchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[], sinceEpochMs?: number): readonly number[] {
  const own = markers.filter(usableWindowsMarker);
  if (own.length === 0 || !Number.isInteger(parentPid) || parentPid <= SYSTEM_PID_CEILING) return [];
  const parentCreated = table.find((row) => row.pid === parentPid)?.startedAt;
  const since = sinceEpochMs === undefined || !Number.isFinite(sinceEpochMs) ? undefined : filetimeFromEpochMs(sinceEpochMs);
  return table
    .filter((row) => row.ppid === parentPid && row.pid > SYSTEM_PID_CEILING && row.pid !== parentPid)
    .filter((row) => createdInOrder(parentCreated, row.startedAt) && createdInOrder(since, row.startedAt))
    .filter((row) => own.some((marker) => windowsCommandLineNames(row.args, marker)))
    .map((row) => row.pid);
}
