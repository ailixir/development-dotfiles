import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * STUDIO-OBS-009 round 065: a guided recording whose close outlasts the 3 s grace is still finalized, not cut.
 *
 * Case436 INCREMENTAL: the session recording was stored with `evidencePartial: true` and Chrome reported `duration === Infinity`
 * (one `GET /video`, no tail read, no seek index). The stop's hard stage SIGKILLed Playwright's ffmpeg, which names the recording
 * directory in its argv, before it could write the Duration and the Cues.
 *
 * Real Chromium, real `launchGuidedBrowser`, real Playwright ffmpeg. The recorder is slowed by SIGSTOP on ffmpeg across the grace
 * (the same fault model as `guidedCloseBound.test.ts`, applied to the recorder instead of Chrome), then released.
 * Needs `ffprobe` on PATH to read the Duration; the case is skipped, loudly, without it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Test oracle only: ffprobe reads the Duration, pgrep/ps find the recorder (same exemption as the process-tree fixtures).
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GUIDED_CLOSE_GRACE_MS } from '../../src/run/guidedBrowser.js';
import { startSecretLoginFixture } from '../fixtures/secret-login/server.js';
import { gotoPage, sleep } from './helpers/guidedLaunch.js';

const run = (command: string, args: string[]): string => { try { return execFileSync(command, args, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const hasFfprobe = run('ffprobe', ['-version']) !== '';
/** The recording's Duration in seconds, or NaN when the container carries none (a killed ffmpeg). */
const durationOf = (path: string): number => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]) || 'NaN');
const recorderPids = (directory: string): number[] => run('pgrep', ['-P', String(process.pid), '-f', directory]).split('\n').filter(Boolean).map(Number).filter((pid) => run('ps', ['-p', String(pid), '-o', 'command=']).includes('ffmpeg'));

describe.skipIf(!hasFfprobe)('a guided close that outlasts the grace still finalizes the recording', () => {
  let fixture: Awaited<ReturnType<typeof startSecretLoginFixture>>;
  beforeAll(async () => { fixture = await startSecretLoginFixture('r065-finalize-canary'); });
  afterAll(async () => { await fixture.close(); });

  it('slow recorder (ffmpeg stopped past the grace): close is not orderly, finalizeRecording waits, the webm has a finite Duration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guided-r065-'));
    try {
      const guided = await launchGuidedBrowser({ sessionId: 'r065', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] }, 'r065-context', () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined });
      await gotoPage(guided, `${fixture.origin}/login`);
      await sleep(1_500);
      const recorders = recorderPids(dir);
      expect(recorders.length).toBe(1);
      for (const pid of recorders) process.kill(pid, 'SIGSTOP');           // the recorder cannot finish inside the grace
      const began = performance.now();
      await guided.close();                                                // graceful stage races the grace, then the hard stage
      expect(performance.now() - began).toBeGreaterThanOrEqual(GUIDED_CLOSE_GRACE_MS - 50);
      expect(guided.orderlyClosed()).toBe(false);                          // the stop reply is unchanged: bounded by the grace
      // The hard stage must not have killed the recorder: it is stopped, not dead.
      expect(recorderPids(dir)).toEqual(recorders);
      setTimeout(() => { for (const pid of recorders) { try { process.kill(pid, 'SIGCONT'); } catch { /* already gone */ } } }, 1_000);
      expect(await guided.finalizeRecording?.(15_000)).toBe(true);         // baseline: undefined here, ffmpeg already SIGKILLed
      const video = await guided.recordedVideo?.();
      if (!video) throw new Error('no recording');
      expect(Number.isFinite(durationOf(video))).toBe(true);               // baseline: NaN (no Duration), Chrome reports Infinity
      expect(recorderPids(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 120_000);

  it('a recorder that never finishes is killed at the finalize bound, and the result is reported as a salvaged prefix', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guided-r065-'));
    try {
      const guided = await launchGuidedBrowser({ sessionId: 'r065b', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] }, 'r065b-context', () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined });
      await gotoPage(guided, `${fixture.origin}/login`);
      await sleep(1_000);
      for (const pid of recorderPids(dir)) process.kill(pid, 'SIGSTOP');
      await guided.close();
      const began = performance.now();
      expect(await guided.finalizeRecording?.(2_000)).toBe(false);
      expect(performance.now() - began).toBeLessThan(5_000);
      expect(recorderPids(dir)).toEqual([]);                               // no orphan ffmpeg
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 120_000);
});
