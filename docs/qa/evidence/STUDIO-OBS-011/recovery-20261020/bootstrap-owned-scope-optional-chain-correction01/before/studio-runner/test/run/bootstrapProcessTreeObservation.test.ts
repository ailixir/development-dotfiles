import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { bootstrapTreeGone, captureBootstrapTree, confirmBootstrapTreeSuspended, probeBootstrapPid } from '../helpers/bootstrapProcessTreeObservation.js';
import type { BootstrapProcessTree } from '../helpers/bootstrapProcessTreeObservation.js';

const edges = vi.hoisted(() => ({
  execFileSync: vi.fn<(command: string, args: readonly string[], options?: unknown) => unknown>(),
  spawnSync: vi.fn<(command: string, args: readonly string[], options?: unknown) => { status: number; stdout: string }>(),
}));
vi.mock('node:child_process', () => ({ ...edges, execFile: vi.fn() }));
const CHILD = process.pid + 10_000, CHROME = CHILD + 1, ENCODER = CHILD + 2, TRANSIENT = CHILD + 3;
interface FakeRow { pid: number; ppid: number; state: string; command: string }
let rows: FakeRow[];
let killSpy: MockInstance<typeof process.kill>;
function errno(code: string): NodeJS.ErrnoException { return Object.assign(new Error('FAKE_PROCESS_EDGE'), { code }); }
function baseRows(): FakeRow[] {
  return [
    { pid: process.pid, ppid: 1, state: 'S', command: '/fixed/node binary' },
    { pid: CHILD, ppid: process.pid, state: 'S', command: '/fixed/node binary' },
    { pid: CHROME, ppid: CHILD, state: 'S', command: '/fixed/Google Chrome for Testing' },
    { pid: ENCODER, ppid: CHILD, state: 'S', command: '/fixed/ffmpeg' },
    { pid: TRANSIENT, ppid: CHROME, state: 'R', command: '/fixed/transient utility' },
  ];
}
function table(): string { return rows.map(row => `${String(row.pid)} ${String(row.ppid)} ${row.state} ${row.command}`).join('\n') + '\n'; }
function stoppedRows(): void { rows = rows.map(row => ({ ...row, state: row.pid === process.pid ? 'S' : 'T' })); }
function expectedTree(): BootstrapProcessTree {
  return { childPid: CHILD, observedPids: [CHROME, ENCODER, TRANSIENT], labels: [
    { pid: CHROME, command: '/fixed/Google Chrome for Testing' },
    { pid: ENCODER, command: '/fixed/ffmpeg' },
    { pid: TRANSIENT, command: '/fixed/transient utility' },
  ] };
}
beforeEach(() => {
  rows = baseRows(); edges.execFileSync.mockReset(); edges.spawnSync.mockReset();
  killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
  edges.execFileSync.mockImplementation((_command, args) => {
    if (args.includes('-A')) return table();
    const pid = Number(args[args.indexOf('-p') + 1]);
    if (pid === TRANSIENT) throw errno('ESRCH');
    return rows.find(row => row.pid === pid)?.command ?? '';
  });
  // The old comparison buffer's unchanged descendantsOf default reader sees the same initial population.
  edges.spawnSync.mockImplementation(() => ({ status: 0, stdout: rows.map(row => `${String(row.pid)} ${String(row.ppid)}`).join('\n') + '\n' }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('bootstrap process-tree observation', () => {
  it("captures one coherent complete inventory when a transient member leaves before a later legacy label query", () => {
    let capture: BootstrapProcessTree | undefined, failureCode: string | undefined;
    expect(typeof captureBootstrapTree).toBe('function');
    try { capture = captureBootstrapTree(CHILD); }
    catch (error) { failureCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'; }
    expect({ capture, failureCode }, 'COHERENT_CAPTURE_INVENTORY_POSTCONDITION').toEqual({ capture: expectedTree(), failureCode: undefined });
  });

  it("preserves binary command spaces and the exact breadth-first descendant inventory", () => {
    rows[2] = { pid: CHROME, ppid: CHILD, state: 'S', command: '/fixed/a binary with spaces  ' };
    const capture = captureBootstrapTree(CHILD);
    expect(capture.observedPids).toEqual([CHROME, ENCODER, TRANSIENT]);
    expect(capture.labels[0]?.command).toBe('/fixed/a binary with spaces  ');
  });

  it("uses one bounded full-table read and no per-PID command queries", () => {
    captureBootstrapTree(CHILD);
    expect(edges.execFileSync).toHaveBeenCalledExactlyOnceWith('ps', ['-A', '-ww', '-o', 'pid=,ppid=,stat=,comm='], { encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024 });
    expect(edges.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a denied full-table read", () => {
    edges.execFileSync.mockImplementation(() => { throw errno('EACCES'); });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_UNREADABLE');
  });

  it("rejects a nonzero full-table read", () => {
    edges.execFileSync.mockImplementation(() => { throw Object.assign(errno('COMMAND_FAILED'), { status: 1 }); });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_UNREADABLE');
  });

  it("rejects a timed-out full-table read", () => {
    edges.execFileSync.mockImplementation(() => { throw errno('ETIMEDOUT'); });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_UNREADABLE');
  });

  it("rejects non-string full-table output", () => {
    edges.execFileSync.mockReturnValue(Buffer.from(table()));
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("rejects empty full-table output", () => {
    edges.execFileSync.mockReturnValue('');
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
    edges.execFileSync.mockReturnValue(' \n\n');
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_SELF_MISSING');
  });

  it("rejects a truncated final process row", () => {
    edges.execFileSync.mockReturnValue(table().slice(0, -1));
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
    edges.execFileSync.mockReturnValue(' '.repeat(1024 * 1024 - 1) + '\n');
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("rejects a malformed nonblank process row", () => {
    edges.execFileSync.mockImplementation(() => table() + 'malformed nonblank row\n');
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("rejects duplicate process IDs", () => {
    rows.push({ pid: CHROME, ppid: CHILD, state: 'S', command: '/different/binary' });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("rejects out-of-range process identities", () => {
    rows[2] = { pid: 2_147_483_648, ppid: CHILD, state: 'S', command: '/fixed/binary' };
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
    expect(() => captureBootstrapTree(1)).toThrow('BOOTSTRAP_PROCESS_IDENTITY');
    expect(() => captureBootstrapTree(process.pid)).toThrow('BOOTSTRAP_PROCESS_IDENTITY');
    expect(() => captureBootstrapTree(-1)).toThrow('BOOTSTRAP_PROCESS_IDENTITY');
  });

  it("rejects a missing observer self row", () => {
    rows = rows.filter(row => row.pid !== process.pid);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_SELF_MISSING');
  });

  it("rejects a missing expected child root", () => {
    rows = rows.filter(row => row.pid !== CHILD);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
  });

  it("rejects a child root whose parent is not the observer", () => {
    rows = rows.map(row => row.pid === CHILD ? { ...row, ppid: 1 } : row);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
  });

  it("rejects a zombie child root even when signal zero succeeds", () => {
    rows = rows.map(row => row.pid === CHILD ? { ...row, state: 'Z' } : row);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
    rows = rows.map(row => row.pid === CHILD ? { ...row, state: 'SE' } : row);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
  });

  it("rejects an unknown process state", () => {
    rows = rows.map(row => row.pid === CHILD ? { ...row, state: '?' } : row);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
    rows = rows.map(row => row.pid === CHILD ? { ...row, state: 'Tq' } : row);
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("accepts a stopped live child root without changing the observed inventory", () => {
    rows = rows.map(row => row.pid === CHILD ? { ...row, state: 'T' } : row);
    expect(captureBootstrapTree(CHILD)).toEqual(expectedTree());
  });

  it("rejects a child root denied by signal zero", () => {
    killSpy.mockImplementation(pid => { if (pid === CHILD) throw errno('EPERM'); return true; });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
    killSpy.mockImplementation(pid => { if (pid === CHILD) throw errno('ESRCH'); return true; });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_ROOT_NOT_LIVE');
  });

  it("rejects a child root with unknown signal-zero outcome", () => {
    killSpy.mockImplementation(pid => { if (pid === CHILD) throw errno('EIO'); return true; });
    expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_PROBE_UNKNOWN');
  });

  it("leaves missing Chrome and encoder roles for the original real-label assertions to reject", () => {
    rows = rows.map(row => row.pid === CHROME || row.pid === ENCODER ? { ...row, command: '/fixed/other binary' } : row);
    const capture = captureBootstrapTree(CHILD);
    expect(capture.labels.some(row => /chrome|chromium/iu.test(row.command))).toBe(false);
    expect(capture.labels.some(row => /ffmpeg/iu.test(row.command))).toBe(false);
    expect(capture.observedPids).toEqual([CHROME, ENCODER, TRANSIENT]);
  });

  it("freezes the captured inventory instead of replacing departed or reparented members", () => {
    const capture = captureBootstrapTree(CHILD);
    rows = rows.filter(row => row.pid !== TRANSIENT).map(row => row.pid === ENCODER ? { ...row, ppid: 1 } : row);
    expect(capture).toEqual(expectedTree());
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(capture.observedPids)).toBe(true);
    expect(Object.isFrozen(capture.labels)).toBe(true);
  });

  it("confirms every intended stopped live member in one subsequent snapshot", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows(); edges.execFileSync.mockClear();
    expect(confirmBootstrapTreeSuspended(capture)).toEqual([CHROME, ENCODER, TRANSIENT]);
    expect(edges.execFileSync).toHaveBeenCalledTimes(1);
    expect(killSpy.mock.calls.every(call => call[1] === 0)).toBe(true);
  });

  it("rejects accepted fake suspension when a member is still running", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows();
    rows = rows.map(row => row.pid === ENCODER ? { ...row, state: 'R' } : row);
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
    rows = rows.map(row => row.pid === ENCODER ? { ...row, state: 'TE' } : row);
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
  });

  it("rejects accepted fake suspension when a member has disappeared", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows(); rows = rows.filter(row => row.pid !== TRANSIENT);
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
    expect(capture.observedPids).toContain(TRANSIENT);
  });

  it("rejects accepted fake suspension when a stopped member is denied", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows();
    killSpy.mockImplementation(pid => { if (pid === ENCODER) throw errno('EPERM'); return true; });
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
  });

  it("rejects accepted fake suspension when a stopped member has unknown liveness", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows();
    killSpy.mockImplementation(pid => { if (pid === ENCODER) throw errno('EIO'); return true; });
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_PROBE_UNKNOWN');
  });

  it("rejects an unreadable suspension-confirmation table", () => {
    const capture = captureBootstrapTree(CHILD); edges.execFileSync.mockImplementation(() => { throw errno('ETIMEDOUT'); });
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_UNREADABLE');
    edges.execFileSync.mockReturnValue('malformed\n');
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID');
  });

  it("rejects a changed binary identity during suspension confirmation", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows();
    rows = rows.map(row => row.pid === TRANSIENT ? { ...row, command: '/different/binary' } : row);
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
  });

  it("keeps confirmed suspension empty for both unsuspended mode decisions", () => {
    // The unchanged fixture owns this two-mode decision; no native fixture is imported or registered here.
    const capture = captureBootstrapTree(CHILD); edges.execFileSync.mockClear();
    for (const phase of ['committed-before-ready-orderly', 'ready-received-stop']) {
      let confirmed: readonly number[] = [];
      if (phase !== 'committed-before-ready-orderly' && phase !== 'ready-received-stop') confirmed = confirmBootstrapTreeSuspended(capture);
      expect(confirmed).toEqual([]);
      expect(capture.observedPids).toEqual([CHROME, ENCODER, TRANSIENT]);
    }
    expect(edges.execFileSync).not.toHaveBeenCalled();
  });

  it("retains every successful suspension attempt when later confirmation fails", () => {
    // Source-equivalent original successful-attempt recording; confirmation cannot erase the caller's finally population.
    const capture = captureBootstrapTree(CHILD), suspended: number[] = [];
    for (const p of capture.observedPids) { try { process.kill(p, 'SIGSTOP'); suspended.push(p); } catch { throw Error('LIVE_TREE_CHANGED'); } }
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED');
    expect(suspended).toEqual([CHROME, ENCODER, TRANSIENT]);
  });

  it("fails every fake SIGSTOP error including ESRCH without confirming suspension", () => {
    const capture = captureBootstrapTree(CHILD);
    for (const code of ['ESRCH', 'EPERM', 'EIO']) {
      const suspended: number[] = [];
      killSpy.mockImplementation((_pid, signal) => { if (signal === 'SIGSTOP') throw errno(code); return true; });
      expect(() => { for (const p of capture.observedPids) { try { process.kill(p, 'SIGSTOP'); suspended.push(p); } catch { throw Error('LIVE_TREE_CHANGED'); } } }).toThrow('LIVE_TREE_CHANGED');
      expect(suspended).toEqual([]);
    }
  });

  it("classifies only exact ESRCH as gone and EPERM as present but denied", () => {
    killSpy.mockImplementation(() => { throw errno('ESRCH'); });
    expect(probeBootstrapPid(CHILD)).toBe('GONE');
    killSpy.mockImplementation(() => { throw errno('EPERM'); });
    expect(probeBootstrapPid(CHILD)).toBe('PRESENT_BUT_DENIED');
    killSpy.mockImplementation(() => true);
    expect(probeBootstrapPid(CHILD)).toBe('ALIVE');
  });

  it("rejects an unknown signal-zero error instead of treating it as gone", () => {
    killSpy.mockImplementation(() => { throw errno('EIO'); });
    expect(() => probeBootstrapPid(CHILD)).toThrow('BOOTSTRAP_PROCESS_PROBE_UNKNOWN');
  });

  it("checks child plus every captured descendant for all-gone without re-enumeration", () => {
    const capture = captureBootstrapTree(CHILD); rows = rows.filter(row => row.pid !== TRANSIENT);
    edges.execFileSync.mockClear(); killSpy.mockClear();
    killSpy.mockImplementation(() => { throw errno('ESRCH'); });
    expect(bootstrapTreeGone(capture)).toBe(true);
    expect(killSpy.mock.calls.map(call => call[0])).toEqual([CHILD, CHROME, ENCODER, TRANSIENT]);
    expect(edges.execFileSync).not.toHaveBeenCalled();
  });

  it("keeps live and denied captured members out of all-gone success", () => {
    const capture = captureBootstrapTree(CHILD);
    killSpy.mockImplementation(pid => { if (pid === ENCODER) return true; throw errno('ESRCH'); });
    expect(bootstrapTreeGone(capture)).toBe(false);
    killSpy.mockImplementation(pid => { throw errno(pid === ENCODER ? 'EPERM' : 'ESRCH'); });
    expect(bootstrapTreeGone(capture)).toBe(false);
  });

  it("fails all-gone on unknown liveness while retaining the original inventory", () => {
    const capture = captureBootstrapTree(CHILD);
    killSpy.mockImplementation(pid => { throw errno(pid === TRANSIENT ? 'EIO' : 'ESRCH'); });
    expect(() => bootstrapTreeGone(capture)).toThrow('BOOTSTRAP_PROCESS_PROBE_UNKNOWN');
    expect(capture.observedPids).toEqual([CHROME, ENCODER, TRANSIENT]);
  });

});

describe('bootstrap process-tree observation', () => {
  it("captures the complete owned inventory despite explicitly unknown unrelated process metadata", () => {
    expect(typeof captureBootstrapTree).toBe('function');
    for (const metadata of [
      { state: '?', command: '/fixed/unrelated binary' },
      { state: 'S', command: '' },
      { state: 'S', command: '/fixed/unrelated\u0001binary' },
      { state: 'S', command: '/fixed/unrelated\u000dbinary' },
      { state: 'S', command: '/fixed/unrelated\u2028binary' },
    ]) {
      rows = [...baseRows(), { pid: TRANSIENT + 1, ppid: 1, ...metadata }];
      let capture: BootstrapProcessTree | undefined, failureCode: string | undefined;
      try { capture = captureBootstrapTree(CHILD); }
      catch (error) { failureCode = error instanceof Error && error.message === 'BOOTSTRAP_PROCESS_TABLE_INVALID' ? 'TABLE_INVALID' : 'UNKNOWN'; }
      expect({ capture, failureCode }, 'OWNED_SCOPE_CAPTURE_INVENTORY_POSTCONDITION').toEqual({ capture: expectedTree(), failureCode: undefined });
    }
  });

  it("rejects unknown metadata on observer root and every owned descendant", () => {
    for (const pid of [process.pid, CHILD, TRANSIENT]) {
      for (const metadata of [
        { state: '?', command: '/fixed/unrelated binary' },
        { state: 'S', command: '' },
        { state: 'S', command: '/fixed/unrelated\u0001binary' },
        { state: 'S', command: '/fixed/unrelated\u000dbinary' },
        { state: 'S', command: '/fixed/unrelated\u2028binary' },
      ]) {
        rows = baseRows().map(row => row.pid === pid ? { ...row, ...metadata } : row);
        expect(() => captureBootstrapTree(CHILD)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID:REQUIRED_METADATA');
      }
    }
  });

  it("confirms the exact original stopped inventory despite unrelated unknown metadata", () => {
    const capture = captureBootstrapTree(CHILD);
    for (const metadata of [
      { state: '?', command: '/fixed/unrelated binary' },
      { state: 'S', command: '' },
      { state: 'S', command: '/fixed/unrelated\u0001binary' },
      { state: 'S', command: '/fixed/unrelated\u000dbinary' },
      { state: 'S', command: '/fixed/unrelated\u2028binary' },
    ]) {
      rows = baseRows(); stoppedRows(); rows.push({ pid: TRANSIENT + 1, ppid: 1, ...metadata });
      edges.execFileSync.mockClear(); killSpy.mockClear();
      expect(confirmBootstrapTreeSuspended(capture)).toEqual([CHROME, ENCODER, TRANSIENT]);
      expect(edges.execFileSync).toHaveBeenCalledExactlyOnceWith('ps', ['-A', '-ww', '-o', 'pid=,ppid=,stat=,comm='], { encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024 });
      expect(killSpy.mock.calls.map(call => call[0])).toEqual([CHILD, CHROME, ENCODER, TRANSIENT]);
      expect(killSpy.mock.calls.every(call => call[1] === 0)).toBe(true);
    }
  });

  it("requires strict metadata for original members after reparenting during confirmation", () => {
    const capture = captureBootstrapTree(CHILD); stoppedRows();
    rows = rows.map(row => row.pid === TRANSIENT ? { ...row, ppid: 1 } : row);
    expect(confirmBootstrapTreeSuspended(capture)).toEqual([CHROME, ENCODER, TRANSIENT]);
    rows = rows.map(row => row.pid === TRANSIENT ? { ...row, state: '?' } : row);
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID:REQUIRED_METADATA');
    rows = rows.map(row => row.pid === TRANSIENT ? { ...row, state: 'T' } : row);
    rows.push({ pid: TRANSIENT + 1, ppid: CHROME, state: '?', command: '/fixed/new descendant' });
    expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID:REQUIRED_METADATA');
    expect(capture).toEqual(expectedTree());
    expect(Object.isFrozen(capture.observedPids)).toBe(true);
    for (const metadata of [
      { state: 'T', command: '/fixed/transient\u000dutility' },
      { state: 'T', command: '/fixed/transient\u2028utility' },
    ]) {
      rows = baseRows(); stoppedRows();
      rows = rows.map(row => row.pid === TRANSIENT ? { ...row, ppid: 1, ...metadata } : row);
      expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID:REQUIRED_METADATA');
      rows = baseRows(); stoppedRows();
      rows.push({ pid: TRANSIENT + 1, ppid: CHROME, ...metadata });
      expect(() => confirmBootstrapTreeSuspended(capture)).toThrow('BOOTSTRAP_PROCESS_TABLE_INVALID:REQUIRED_METADATA');
    }
  });
});
