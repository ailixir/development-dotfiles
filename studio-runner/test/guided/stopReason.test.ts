import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GuidedOwnership } from '../../src/guided/ownership.js';
import type { OwnershipOptions } from '../../src/guided/ownership.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import type { RunnerContext } from '../../src/guided/types.js';
import { hash } from '../../src/guided/contracts.js';
import { guidedContext, ownershipSession, assignmentFor, sessionStub } from '../helpers/guided.js';
import { inProcessBrowser } from '../helpers/guidedStepService.js';

/**
 * Why a session ends when its lease and its expiry coincide (STUDIO-OBS-007 hard-expiry).
 * A lease is capped at the session expiry, so the two are the same instant at the end of every
 * session: the reason must be EXPIRED, whatever the millisecond phase of the timers around it.
 * Only a lease that ends strictly before the expiry is a lost lease.
 */
const clean: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of clean.reverse()) await fn().catch(() => undefined); clean.length = 0; vi.useRealTimers(); });

/** Makes every timer of 50 ms or more fire `earlyMs` before the fake `Date.now()` reaches its due time, as a Node timer can. Call after `vi.useFakeTimers`. */
function fireEarly(earlyMs: number | undefined): void {
  if (!earlyMs) return;
  const fake = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: () => void, ms?: number) => fake(handler, typeof ms === 'number' && ms >= 50 ? ms - earlyMs : ms)) as unknown as typeof setTimeout;
}

function blankBrowser(context: RunnerContext): GuidedBrowser {
  return inProcessBrowser({ evidence: { kind: 'initialBlank', sessionId: context.sessionId, contextId: context.contextId, creationId: randomUUID(), documentId: randomUUID(), bootstrapId: randomUUID(), url: 'about:blank', origin: null, generation: 0 }, blankMatches: () => Promise.resolve(true), close: vi.fn(() => Promise.resolve()), terminate: vi.fn(() => Promise.resolve()), orderlyClosed: () => true, observations: sessionStub({ withhold: () => Promise.resolve(), dispose: () => Promise.resolve(), observe: () => Promise.reject(new Error('NOT_USED')) }) });
}

const lifecycleReason = (messages: { route: string; body: unknown }[]): unknown => (messages.filter(m => m.route === 'lifecycle').at(-1)?.body as { reason?: string } | undefined)?.reason;

/** What the Nth claim does (1 is the assignment's own claim): answer after `latencyMs` (default at once), never answer, or be refused. */
interface ClaimBehavior { latencyMs?: number; hang?: boolean; reject?: string }

async function ownedSession(options: { lifeMs: number; secret?: boolean; earlyMs?: number; leaseCapMs?: number; claimBehavior?: (n: number) => ClaimBehavior }) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  fireEarly(options.earlyMs);
  const directory = await mkdtemp(join(tmpdir(), 'guided-stop-reason-')); clean.push(() => rm(directory, { recursive: true, force: true }));
  const context = guidedContext('https://example.test');
  context.expiresAt = new Date(Date.now() + options.lifeMs).toISOString();
  if (options.secret) { context.authoredInputs.inputs.push({ inputId: 'pass', sourceStepId: 'fill', kind: 'secretRef', secretId: 'PASS', provenance: { referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'fill', referenceId: 'pass-reference', referenceName: 'PASS', kind: 'secretRef' } }); context.authoredInputsHash = hash(context.authoredInputs); }
  const grant = ownershipSession(context); context.leaseExpiresAt = grant.owner.leaseExpiresAt;
  const assignment = assignmentFor(context), claims: { at: number; timeout: number }[] = [], messages: { route: string; body: unknown }[] = [];
  const ownershipOptions: OwnershipOptions = {
    workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory, launch: vi.fn(() => Promise.resolve(blankBrowser(context))),
    callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); },
    claim: async (_command, _key, timeout) => {
      claims.push({ at: Date.now(), timeout });
      const behavior = options.claimBehavior?.(claims.length) ?? {};
      if (behavior.hang) return new Promise<never>(() => undefined);
      if (behavior.latencyMs) await new Promise<void>(resolve => { setTimeout(resolve, behavior.latencyMs); });
      if (behavior.reject) throw new Error(behavior.reject);
      return { ...structuredClone(grant), owner: { ...grant.owner, leaseExpiresAt: new Date(Math.min(Date.now() + (options.leaseCapMs ?? 30_000), Date.parse(grant.expiresAt))).toISOString() } };
    },
  };
  const manager = new GuidedOwnership(ownershipOptions); clean.push(() => manager.close());
  return { context, assignment, claims, messages, manager, reason: () => lifecycleReason(messages), expiresAt: Date.parse(context.expiresAt) };
}

/** The runtime alone: its own timer, with no ownership renewal around it. */
async function startedRuntime(options: { lifeMs: number; leaseMs: number; earlyMs?: number }) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  fireEarly(options.earlyMs);
  const directory = await mkdtemp(join(tmpdir(), 'guided-stop-reason-')); clean.push(() => rm(directory, { recursive: true, force: true }));
  const context = guidedContext('https://example.test'), messages: { route: string; body: unknown }[] = [];
  context.expiresAt = new Date(Date.now() + options.lifeMs).toISOString(); context.leaseExpiresAt = new Date(Date.now() + options.leaseMs).toISOString();
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory, launch: () => Promise.resolve(blankBrowser(context)), callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); } });
  clean.push(() => runtime.stop('CANCELLED')); await runtime.start();
  return { messages, reason: () => lifecycleReason(messages) };
}

describe('stop reason when the lease and the session expiry coincide', () => {
  it('reports EXPIRED from the assignment timer when it fires a millisecond before Date.now() reaches the expiry', async () => {
    const h = await ownedSession({ lifeMs: 5_000, earlyMs: 1 });
    await h.manager.assign(h.assignment);
    await vi.advanceTimersByTimeAsync(h.expiresAt - Date.now() - 1);
    expect(h.messages.filter(m => m.route === 'lifecycle')).toHaveLength(1);
    expect(h.reason()).toBe('EXPIRED');
  });

  it('reports EXPIRED from the runtime timer when it fires a millisecond before Date.now() reaches the expiry', async () => {
    const h = await startedRuntime({ lifeMs: 5_000, leaseMs: 5_000, earlyMs: 1 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(h.reason()).toBe('EXPIRED');
  });

  it('reports EXPIRED, not LEASE_LOST, when a secret-session renewal falls in the last 100 ms and starts no claim', async () => {
    // Renewals run on a one-second grid from the context: with 4070 ms to live the fourth falls 70 ms before the expiry.
    const h = await ownedSession({ lifeMs: 4_070, secret: true });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(4_071);
    expect(h.claims).toHaveLength(4);
    expect(h.claims.every(c => h.expiresAt - c.at > 100)).toBe(true);
    expect(h.reason()).toBe('EXPIRED');
  });

  it('reports EXPIRED for a session that renews until its hard expiry, and starts no claim inside the last 100 ms', async () => {
    // Without a secret the renewal interval is a third of what remains, so the last attempt lands inside the margin.
    const h = await ownedSession({ lifeMs: 8_000 });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(8_001);
    expect(h.claims.length).toBeGreaterThan(5);
    expect(h.claims.every(c => h.expiresAt - c.at > 100)).toBe(true);
    expect(h.reason()).toBe('EXPIRED');
  });
});

describe('stop reason when the lease ends strictly before the session expiry', () => {
  it('still reports LEASE_LOST from the runtime timer', async () => {
    const h = await startedRuntime({ lifeMs: 60_000, leaseMs: 2_000, earlyMs: 1 });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(h.reason()).toBe('LEASE_LOST');
  });

  it('still reports LEASE_LOST when a secret session\'s lease ends before its next renewal', async () => {
    // The backend caps the lease at 500 ms and the next secret renewal is a second away: the timers meet the lease first.
    const h = await ownedSession({ lifeMs: 60_000, secret: true, leaseCapMs: 500, earlyMs: 1 });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(499);
    expect(h.reason()).toBe('LEASE_LOST');
  });
});

const lifecycleCount = (h: { messages: { route: string }[] }): number => h.messages.filter(m => m.route === 'lifecycle').length;

describe('stop reason when the last renewal claim is cut by the claim margin (C-1)', () => {
  it('reports EXPIRED at the expiry, not LEASE_LOST 100 ms earlier, when a secret-session renewal claim is slower than its margin budget', async () => {
    // The fourth grid renewal starts 110 ms before the expiry: a 10 ms budget for a claim that takes 20 ms.
    const h = await ownedSession({ lifeMs: 4_110, secret: true, claimBehavior: n => (n > 1 ? { latencyMs: 20 } : {}) });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(4_109);
    expect(h.claims).toHaveLength(5);
    expect(h.expiresAt - (h.claims[4]?.at ?? 0)).toBe(110);
    expect(lifecycleCount(h)).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(lifecycleCount(h)).toBe(1);
    expect(h.reason()).toBe('EXPIRED');
  });

  // Non-secret renewals come at a third of what remains, so one of them lands in the margin band for some lifetimes and not for others.
  it.each([8_000, 8_007, 8_015, 8_023, 8_031, 8_040, 8_048, 8_057, 8_066, 8_075, 8_084, 8_093, 8_102, 8_111, 8_120, 8_131])('reports EXPIRED for a non-secret session to its hard expiry with a 20 ms claim latency: lifetime %i ms', async lifeMs => {
    const h = await ownedSession({ lifeMs, claimBehavior: n => (n > 1 ? { latencyMs: 20 } : {}) });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(lifeMs - 1);
    expect(lifecycleCount(h)).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(lifecycleCount(h)).toBe(1);
    expect(h.reason()).toBe('EXPIRED');
  });
});

describe('stop reason controls for the claim margin: other aborts and refusals keep their reason', () => {
  it('reports LEASE_LOST when the lease ends strictly before the expiry and the claim is slower than its margin budget', async () => {
    const h = await ownedSession({ lifeMs: 60_000, leaseCapMs: 400, claimBehavior: n => (n > 1 ? { latencyMs: 300 } : {}) });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(lifecycleCount(h)).toBe(1);
    expect(h.reason()).toBe('LEASE_LOST');
  });

  it('reports LEASE_LOST at the claim cap when the lease is at the expiry and the backend never answers a cap-bound claim', async () => {
    const h = await ownedSession({ lifeMs: 4_500, secret: true, claimBehavior: n => (n > 1 ? { hang: true } : {}) });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(lifecycleCount(h)).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(lifecycleCount(h)).toBe(1);
    expect(h.reason()).toBe('LEASE_LOST');
    expect(Date.now()).toBeLessThan(h.expiresAt - 2_000);
  });

  it('reports REVOKED at once when the backend refuses a renewal inside the margin band', async () => {
    const h = await ownedSession({ lifeMs: 4_110, secret: true, claimBehavior: n => (n === 5 ? { reject: 'REVOKED' } : {}) });
    await h.manager.assign(h.assignment); await h.manager.context(h.context);
    await vi.advanceTimersByTimeAsync(4_001);
    expect(lifecycleCount(h)).toBe(1);
    expect(h.reason()).toBe('REVOKED');
    expect(Date.now()).toBeLessThan(h.expiresAt - 100);
  });
});
