/**
 * The pure half of the win32 process host (ADR-SC-009), on every OS: the constant scripts, the parse of their output
 * (hostile command lines included), FILETIME conversion, the creation-time tree (pid reuse) and the Windows marker rules.
 */
import { describe, expect, it } from 'vitest';

import type { ProcessRow, ProcessRowWithArgs } from '../../../src/run/host/types.js';
import {
  FILETIME_UNIX_EPOCH,
  TABLE_SCRIPT,
  TABLE_SCRIPT_WITH_ARGS,
  decodeCommandLine,
  descendantsByCreation,
  encodeCommand,
  filetimeFromEpochMs,
  normalizeWindowsPath,
  parseCimTable,
  parseCimTableWithArgs,
  selectWindowsLaunchRoots,
  usableWindowsMarker,
  windowsCommandLineNames,
} from '../../../src/run/host/win32ProcessModel.js';

/** What the script prints for one process: the same encoding, written in JS. */
function cimLine(pid: number, ppid: number, created: bigint | null, args?: string | null): string {
  const head = `${String(pid)} ${String(ppid)} ${created === null ? '-' : created.toString()}`;
  if (args === undefined) return head;
  if (args === null) return `${head} -`;
  return `${head} u${Array.from({ length: args.length }, (_, index) => args.charCodeAt(index)).join('.')}`;
}

const listing = (...lines: string[]): string => `${[...lines, 'END'].join('\r\n')}\r\n`;

describe('FILETIME', () => {
  it('converts epoch milliseconds to 100 ns ticks since 1601, floored to the millisecond', () => {
    expect(filetimeFromEpochMs(0)).toBe(FILETIME_UNIX_EPOCH);
    expect(filetimeFromEpochMs(Date.UTC(2000, 0, 1))).toBe(125_911_584_000_000_000n);
    expect(filetimeFromEpochMs(1.9)).toBe(FILETIME_UNIX_EPOCH + 10_000n);
  });
});

describe('the constant scripts', () => {
  it('are encoded for -EncodedCommand as base64 UTF-16LE', () => {
    for (const script of [TABLE_SCRIPT, TABLE_SCRIPT_WITH_ARGS]) expect(Buffer.from(encodeCommand(script), 'base64').toString('utf16le')).toBe(script);
  });

  it('read Win32_Process through CIM with UTC FILETIME creation times, and only the args script reads command lines', () => {
    for (const script of [TABLE_SCRIPT, TABLE_SCRIPT_WITH_ARGS]) {
      expect(script).toContain('Get-CimInstance -ClassName Win32_Process');
      expect(script).toContain('.ToUniversalTime().ToFileTimeUtc()');
      expect(script).toContain("'END';exit 0}catch{exit 1}");
      // Nothing environmental and no .NET method calls beyond DateTime (Constrained Language Mode).
      expect(script).not.toMatch(/\$env:|\[Console\]|\[Convert\]|New-Object/iu);
    }
    expect(TABLE_SCRIPT).not.toContain('CommandLine');
    expect(TABLE_SCRIPT_WITH_ARGS).toContain('CommandLine');
  });
});

describe('parseCimTable / parseCimTableWithArgs', () => {
  it('parses rows, with and without a creation time, CRLF or LF', () => {
    expect(parseCimTable(listing(cimLine(0, 0, null), cimLine(4, 0, null), cimLine(1200, 900, 133_000_000_000_000_000n)))).toEqual([
      { pid: 0, ppid: 0 },
      { pid: 4, ppid: 0 },
      { pid: 1200, ppid: 900, startedAt: 133_000_000_000_000_000n },
    ]);
    expect(parseCimTableWithArgs(`${cimLine(8, 4, 5n, 'a b')}\nEND\n`)).toEqual([{ pid: 8, ppid: 4, startedAt: 5n, args: 'a b' }]);
    expect(parseCimTableWithArgs(listing(cimLine(8, 4, 5n, null), cimLine(9, 4, 5n, '')))).toEqual([
      { pid: 8, ppid: 4, startedAt: 5n, args: '' },
      { pid: 9, ppid: 4, startedAt: 5n, args: '' },
    ]);
  });

  it('reads a listing without its END, or an empty one, as no table', () => {
    expect(parseCimTable(cimLine(8, 4, 5n))).toEqual([]);
    expect(parseCimTable(`${cimLine(8, 4, 5n)}\nEND\n${cimLine(9, 4, 5n)}`)).toEqual([]);
    expect(parseCimTable('')).toEqual([]);
    expect(parseCimTableWithArgs('Get-CimInstance : Access denied\r\n')).toEqual([]);
  });

  it('drops malformed lines and lines of the other shape', () => {
    const rows = parseCimTable(listing('garbage', '12 x 3', '-1 2 3', '99999999999 1 1', cimLine(8, 4, 5n, 'x'), cimLine(9, 4, 6n)));
    expect(rows).toEqual([{ pid: 9, ppid: 4, startedAt: 6n }]);
    expect(parseCimTableWithArgs(listing(cimLine(9, 4, 6n), '10 4 6 uabc', '11 4 6 u70000', '12 4 6 u1..2', cimLine(13, 4, 6n, 'ok')))).toEqual([
      { pid: 13, ppid: 4, startedAt: 6n, args: 'ok' },
    ]);
  });

  it('keeps hostile command lines whole: newlines, a fake END and fake rows, commas, quotes, non-ASCII, surrogates, a long line', () => {
    const hostile = [
      'C:\\x.exe "a,b" \'c\'\r\nEND\r\n1 2 3 u65\n4 4 4',
      'C:\\Users\\José\\AppData\\Local\\Temp\\studio-runner\\run-1 — ✓ 😀',
      `node ${'A'.repeat(100_000)}`,
      '\t  leading and trailing  \t',
    ];
    const rows = parseCimTableWithArgs(listing(...hostile.map((args, index) => cimLine(100 + index * 4, 8, 10n, args))));
    expect(rows.map((row) => row.args)).toEqual(hostile);
    expect(rows.map((row) => row.pid)).toEqual([100, 104, 108, 112]);
  });

  it('decodes the command-line column and refuses a malformed one', () => {
    expect(decodeCommandLine('-')).toBe('');
    expect(decodeCommandLine('u')).toBe('');
    expect(decodeCommandLine('u104.105')).toBe('hi');
    expect(decodeCommandLine('u65536')).toBeNull();
    expect(decodeCommandLine('u1.')).toBeNull();
    expect(decodeCommandLine('x104')).toBeNull();
  });
});

describe('descendantsByCreation', () => {
  const t = (n: number): bigint => 1_000_000n + BigInt(n);

  it('walks the tree breadth-first, a child created at or after its parent', () => {
    const table: ProcessRow[] = [
      { pid: 100, ppid: 8, startedAt: t(10) },
      { pid: 104, ppid: 100, startedAt: t(10) },
      { pid: 108, ppid: 100, startedAt: t(20) },
      { pid: 112, ppid: 104, startedAt: t(30) },
    ];
    expect(descendantsByCreation(100, table)).toEqual([104, 108, 112]);
  });

  it('does not count the children of a reused pid: a row created before its parent is not its child, nor anything below it', () => {
    const table: ProcessRow[] = [
      { pid: 100, ppid: 8, startedAt: t(50) },
      // Started by an earlier process 100 that died; pid 100 was then reused.
      { pid: 200, ppid: 100, startedAt: t(40) },
      { pid: 204, ppid: 200, startedAt: t(60) },
      { pid: 208, ppid: 100, startedAt: t(70) },
    ];
    expect(descendantsByCreation(100, table)).toEqual([208]);
  });

  it('treats a missing creation time as unknown: ppid alone decides, for the parent or the row', () => {
    expect(descendantsByCreation(100, [{ pid: 104, ppid: 100, startedAt: t(1) }])).toEqual([104]);
    expect(descendantsByCreation(100, [{ pid: 100, ppid: 8 }, { pid: 104, ppid: 100, startedAt: t(1) }])).toEqual([104]);
    expect(descendantsByCreation(100, [{ pid: 100, ppid: 8, startedAt: t(5) }, { pid: 104, ppid: 100 }, { pid: 108, ppid: 104, startedAt: t(1) }])).toEqual([104, 108]);
    // The posix-shaped rows the observation helpers pass: no creation times anywhere.
    expect(descendantsByCreation(1, [{ pid: 2, ppid: 1 }, { pid: 3, ppid: 2 }, { pid: 4, ppid: 9 }])).toEqual([2, 3]);
  });

  it('cannot loop on a cycle in a stale reading', () => {
    const table: ProcessRow[] = [
      { pid: 100, ppid: 104, startedAt: t(1) },
      { pid: 104, ppid: 100, startedAt: t(1) },
    ];
    expect(descendantsByCreation(100, table)).toEqual([104]);
  });
});

describe('Windows markers', () => {
  it('normalises separators, case and trailing separators', () => {
    expect(normalizeWindowsPath('c:/Users/x\\Temp\\')).toBe('C:\\USERS\\X\\TEMP');
    expect(normalizeWindowsPath('C:\\')).toBe('C:\\');
  });

  it('uses only absolute drive or UNC paths at least two segments below their root', () => {
    for (const marker of ['C:\\a\\b', 'c:/a/b', 'D:\\Users\\u\\AppData\\Local\\Temp\\studio-runner', '\\\\srv\\share\\a\\b', '//srv/share/a/b']) {
      expect(usableWindowsMarker(marker), marker).toBe(true);
    }
    for (const marker of ['C:\\a', 'C:\\', 'C:a\\b', '\\\\srv\\share\\a', '\\\\srv\\share', '/tmp/a/b', 'a\\b\\c', '', '\\a\\b']) {
      expect(usableWindowsMarker(marker), marker).toBe(false);
    }
  });

  it('matches a marker as a path of its own, case-insensitively, with either separator', () => {
    const marker = 'C:\\Users\\U\\Temp\\guided-ab';
    expect(windowsCommandLineNames('chrome.exe --user-data-dir=c:\\users\\u\\temp\\guided-ab\\profile', marker)).toBe(true);
    expect(windowsCommandLineNames('chrome.exe "--user-data-dir=C:/Users/U/Temp/guided-ab/profile"', marker)).toBe(true);
    expect(windowsCommandLineNames('ffmpeg.exe -i pipe:0 "C:\\Users\\U\\Temp\\guided-ab"', marker)).toBe(true);
    expect(windowsCommandLineNames('ffmpeg.exe C:\\Users\\U\\Temp\\guided-ab', marker)).toBe(true);
    // A longer sibling, a prefix inside another path, and a marker glued to other text never match.
    expect(windowsCommandLineNames('chrome.exe --user-data-dir=C:\\Users\\U\\Temp\\guided-abc\\profile', marker)).toBe(false);
    expect(windowsCommandLineNames('chrome.exe --x=D:\\C:\\Users\\U\\Temp\\guided-ab', marker)).toBe(false);
    expect(windowsCommandLineNames('chrome.exe xC:\\Users\\U\\Temp\\guided-ab', marker)).toBe(false);
  });
});

describe('selectWindowsLaunchRoots', () => {
  const marker = 'C:\\Users\\U\\Temp\\guided-ab';
  const since = Date.UTC(2026, 10, 5, 12, 0, 0);
  const at = (deltaMs: number): bigint => filetimeFromEpochMs(since + deltaMs);
  const worker: ProcessRowWithArgs = { pid: 1000, ppid: 8, startedAt: at(-60_000), args: 'node dist\\run\\guidedChild.js' };
  const chrome: ProcessRowWithArgs = { pid: 1004, ppid: 1000, startedAt: at(50), args: `chrome.exe --user-data-dir=${marker.toLowerCase()}\\profile` };
  const ffmpeg: ProcessRowWithArgs = { pid: 1008, ppid: 1000, startedAt: at(900), args: `ffmpeg.exe "${marker.replace(/\\/gu, '/')}"` };
  const other: ProcessRowWithArgs = { pid: 1012, ppid: 1000, startedAt: at(100), args: 'chrome.exe --user-data-dir=C:\\Users\\U\\Temp\\guided-zz\\profile' };
  const renderer: ProcessRowWithArgs = { pid: 1016, ppid: 1004, startedAt: at(200), args: `chrome.exe --type=renderer --user-data-dir=${marker}\\profile` };

  it('chooses the direct children of the worker that name a marker, created at or after the launch began', () => {
    expect(selectWindowsLaunchRoots([worker, chrome, ffmpeg, other, renderer], 1000, [marker], since)).toEqual([1004, 1008]);
    expect(selectWindowsLaunchRoots([worker, chrome, ffmpeg], 1000, [marker], since + 100)).toEqual([1008]);
    expect(selectWindowsLaunchRoots([worker, { ...chrome, startedAt: at(0) }], 1000, [marker], since)).toEqual([1004]);
  });

  it('never chooses a process created before its parent (pid reuse), and without `since` keeps that rule alone', () => {
    const stale = { ...chrome, startedAt: at(-120_000) };
    expect(selectWindowsLaunchRoots([worker, stale], 1000, [marker])).toEqual([]);
    expect(selectWindowsLaunchRoots([worker, chrome], 1000, [marker])).toEqual([1004]);
  });

  it('treats a missing creation time as unknown: it filters nothing, for the parent or the row', () => {
    const bareChrome = { pid: 1004, ppid: 1000, args: chrome.args };
    expect(selectWindowsLaunchRoots([worker, bareChrome], 1000, [marker], since)).toEqual([1004]);
    expect(selectWindowsLaunchRoots([{ pid: 1000, ppid: 8, args: worker.args }, chrome], 1000, [marker], since)).toEqual([1004]);
    expect(selectWindowsLaunchRoots([chrome], 1000, [marker], since)).toEqual([1004]);
    expect(selectWindowsLaunchRoots([{ pid: 1000, ppid: 8, args: worker.args }, { ...chrome, startedAt: at(-1) }], 1000, [marker], since)).toEqual([]);
  });

  it('chooses nothing for a system parent, without a usable marker, or the parent itself', () => {
    expect(selectWindowsLaunchRoots([{ ...worker, pid: 4 }, { ...chrome, ppid: 4 }], 4, [marker], since)).toEqual([]);
    expect(selectWindowsLaunchRoots([worker, chrome], 1000, ['C:\\Users', '/tmp/guided-ab', 'relative\\path'], since)).toEqual([]);
    expect(selectWindowsLaunchRoots([worker, { ...chrome, pid: 1000 }], 1000, [marker], since)).toEqual([]);
  });
});
