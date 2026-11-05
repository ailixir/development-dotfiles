/**
 * Platform-gated tests (ADR-SC-009: posix is the production host, win32 is local development only).
 *
 * A test that exercises a POSIX-only mechanism (uid/mode bits, process groups, `ps`, `/proc`, signals other
 * than SIGINT) runs on Linux and macOS and is skipped on Windows, where its win32 counterpart test covers the
 * Windows implementation. A Windows-only test is the reverse. Every POSIX-only skip states why, and the reason is
 * part of the test name, so a Windows run's skipped list says what was not exercised there.
 */
import { describe, it } from 'vitest';

export const isWindows = process.platform === 'win32';

function labelled(name: string, reason: string): string {
  if (reason.trim() === '') throw new Error('A POSIX-only test must state why it does not run on Windows.');
  return `${name} [POSIX only: ${reason}]`;
}

/** A suite that runs on Linux and macOS only. */
export function describePosixOnly(reason: string, name: string, body: () => void): void {
  describe.skipIf(isWindows)(labelled(name, reason), body);
}

/** A test that runs on Linux and macOS only. */
export function itPosixOnly(reason: string, name: string, body: () => unknown, timeoutMs?: number): void {
  it.skipIf(isWindows)(labelled(name, reason), body, timeoutMs);
}

/** A suite that runs on Windows only: the win32 counterpart of a POSIX-only behaviour. */
export function describeWindowsOnly(name: string, body: () => void): void {
  describe.skipIf(!isWindows)(`${name} [Windows only]`, body);
}

/** A test that runs on Windows only. */
export function itWindowsOnly(name: string, body: () => unknown, timeoutMs?: number): void {
  it.skipIf(!isWindows)(`${name} [Windows only]`, body, timeoutMs);
}
