/** The console frame's fixed message format and its hand-written parent-side check (no `replay-ipc` definition behind it). */
import { describe, expect, it } from 'vitest';

import { CONSOLE_ENTRY_CAP, CONSOLE_MESSAGE_MAX_LENGTH, consoleLogFor, validConsoleEntries } from '../../src/run/protocol.js';

describe('consoleLogFor — Playwright type to prefix and level (errors, warnings and page errors only)', () => {
  it.each([
    ['warning', 'warn', 'console.warn: x'],
    ['error', 'error', 'console.error: x'],
    ['pageerror', 'error', 'page error: x'],
  ])('%s → %s "%s"', (type, level, message) => {
    expect(consoleLogFor(type, 'x')).toEqual({ level, message });
  });

  it.each(['log', 'info', 'debug', 'trace', 'dir', 'table', 'assert', 'warn', 'unknown'])('%s is not captured', (type) => {
    expect(consoleLogFor(type, 'x')).toBeNull();
  });
});

describe('validConsoleEntries', () => {
  const entry = { level: 'warn', message: 'console.warn: hi', stepIndex: 0, atMs: 1.5 };
  const frame = (over: Record<string, unknown> = {}): unknown => ({ kind: 'console', protocolVersion: 3, mode: 'observed', runId: 'r', attemptId: 'a', entries: [entry], ...over });
  const check = (raw: unknown): unknown => validConsoleEntries(raw, 'r', 'a', 3);

  it('accepts a well-formed frame, with null step and time allowed', () => {
    expect(check(frame())).toEqual([entry]);
    const open = { ...entry, stepIndex: null, atMs: null };
    expect(check(frame({ entries: [open] }))).toEqual([open]);
  });

  it.each([
    ['another run', frame({ runId: 'x' })],
    ['another attempt', frame({ attemptId: 'x' })],
    ['an extra frame key', frame({ extra: 1 })],
    ['an extra entry key', frame({ entries: [{ ...entry, url: 'u' }] })],
    ['no entries', frame({ entries: [] })],
    ['a bad level', frame({ entries: [{ ...entry, level: 'fatal' }] })],
    ['an info level', frame({ entries: [{ ...entry, level: 'info' }] })],
    ['a non-string message', frame({ entries: [{ ...entry, message: 3 }] })],
    ['an oversized message', frame({ entries: [{ ...entry, message: 'x'.repeat(CONSOLE_MESSAGE_MAX_LENGTH + 1) }] })],
    ['a step index out of range', frame({ entries: [{ ...entry, stepIndex: 3 }] })],
    ['a fractional step index', frame({ entries: [{ ...entry, stepIndex: 0.5 }] })],
    ['a non-finite time', frame({ entries: [{ ...entry, atMs: Infinity }] })],
    ['more entries than the cap', frame({ entries: Array.from({ length: CONSOLE_ENTRY_CAP + 1 }, () => entry) })],
    ['a non-object', 'console'],
  ])('rejects %s', (_name, raw) => {
    expect(check(raw)).toBeNull();
  });
});
