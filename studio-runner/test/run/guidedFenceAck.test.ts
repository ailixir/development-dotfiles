/* eslint-disable @typescript-eslint/require-await -- fakes of the Playwright surface: every real method is async, these answer from scripted state. */
/**
 * SC008-E15 AC7 (child side): fence before effect under an asynchronous server ack. The control is createAckedInvocationControl with a
 * fake requestFence whose ack the test releases; the entry paths are the binding (two concurrent effectful calls), passwordControl and the
 * secret take-over. Server-side cases (kill between ack and native, the disagreement rule) belong to the runtime tests.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAckedInvocationControl } from '../../src/run/guidedAckControl.js';
import type { PasswordTarget } from '../../src/run/observationTypes.js';
import { createPasswordControl, type PasswordWorldPort } from '../../src/run/passwordControl.js';
import { createSecretHook, createSecrets } from '../../src/run/secretStep.js';
import { SecretUseEvidence } from '../../src/run/secretUse.js';
import { createBinding, type StepTally } from '../../src/run/stepCodeBinding.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';

interface Gate { promise: Promise<void>; release(): void; fail(error: unknown): void }
function gate(): Gate {
  let release = (): void => undefined, fail: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => { release = resolve; fail = (error: unknown): void => { reject(error instanceof Error ? error : new Error(String(error))); }; });
  return { promise, release, fail };
}
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5));

interface Rig {
  events: string[];
  ack: Gate;
  requests: number;
  abort: AbortController;
  control: ReturnType<typeof createAckedInvocationControl>;
}
function rig(deadlineMs = Date.now() + 30_000): Rig {
  const events: string[] = [];
  const ack = gate();
  const abort = new AbortController();
  const r: Rig = { events, ack, requests: 0, abort, control: undefined as unknown as Rig['control'] };
  r.control = createAckedInvocationControl({
    deadlineMs, now: () => Date.now(), signal: abort.signal,
    requestFence: () => { r.requests += 1; events.push('request'); return ack.promise; },
  });
  return r;
}

const TARGET: PasswordTarget = { kind: 'passwordControl', documentId: 'doc', generation: 1 };
const ORIGIN = 'https://login.example.test';

class FakeLocator {
  constructor(readonly events: string[]) {}
  async waitFor(): Promise<void> { this.events.push('waitFor'); }
  async count(): Promise<number> { return 1; }
  filter(): this { return this; }
  and(): { count(): Promise<number> } { return { count: async () => 1 }; }
  async evaluate(): Promise<boolean> { return true; }
  page(): { locator(): object } { return { locator: () => ({}) }; }
  async click(): Promise<void> { this.events.push('click'); }
  async dblclick(): Promise<void> { this.events.push('dblclick'); }
  async fill(...args: unknown[]): Promise<void> { this.events.push(`native-fill:${String(args.length)}`); }
}

function bind(r: Rig, extra: Partial<Parameters<typeof createBinding>[0]> = {}): { binding: ReturnType<typeof createBinding>; locator: FakeLocator; tally: StepTally } {
  const tally: StepTally = { fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false };
  const binding = createBinding({ control: r.control, allowedDomains: ['*'], tally, ...extra });
  return { binding, locator: binding.wrap(new FakeLocator(r.events)) as FakeLocator, tally };
}

let unhandled = 0;
const onUnhandled = (): void => { unhandled += 1; };
beforeEach(() => { unhandled = 0; process.on('unhandledRejection', onUnhandled); });
afterEach(async () => { await tick(); process.off('unhandledRejection', onUnhandled); expect(unhandled).toBe(0); });

describe('the fence is entered once and waited for', () => {
  it('two concurrent effectful calls: one request, no native call before the ack, tally and phase flip after it', async () => {
    const r = rig();
    const { locator, tally } = bind(r);
    const both = Promise.allSettled([locator.click(), locator.dblclick()]);
    await tick();
    expect(r.requests).toBe(1);
    expect(r.events.filter(event => event === 'click' || event === 'dblclick')).toEqual([]);
    expect([tally.fenceCrossed, r.control.phase, tally.effects.length]).toEqual([false, 'PREPARING', 0]);
    r.ack.release();
    expect((await both).map(item => item.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(r.requests).toBe(1);
    expect(r.events.slice(-3)).toContain('click');
    expect(r.events).toContain('dblclick');
    expect([tally.fenceCrossed, r.control.phase, tally.effects.length]).toEqual([true, 'INVOKING', 2]);
    await locator.click(); // after the ack: the early-return path, still the same single request
    expect(r.requests).toBe(1);
  });

  it('a call that races the pending ack waits for it instead of skipping the fence', async () => {
    const r = rig();
    const { locator } = bind(r);
    const first = locator.click();
    await tick();
    const second = locator.dblclick();
    await tick();
    expect(r.events).not.toContain('dblclick');
    r.ack.release();
    await Promise.all([first, second]);
    expect(r.events).toContain('dblclick');
  });

  it('password fill writes only after the ack, and the secret value is passed only then', async () => {
    const r = rig();
    const calls: string[] = [];
    const port: PasswordWorldPort = {
      current: () => ({ closed: false, busy: false, generation: 1, observedNavigation: 1, navigation: 1, documentId: 'doc', available: true }),
      call: async method => { calls.push(method); return { result: { value: { kind: 'passwordWriteCompleted' } } }; },
    };
    const control = createPasswordControl(port, () => undefined, async () => undefined);
    const filled = control.fillPassword(TARGET, ORIGIN, [ORIGIN], 'canary', r.control);
    await tick();
    expect(calls).toEqual([]);
    expect(r.requests).toBe(1);
    r.ack.release();
    await filled;
    expect(calls).toEqual(['fillPassword']);
    expect(r.control.phase).toBe('INVOKING');
  });

  it('a rejected ack means no password write', async () => {
    const r = rig();
    const calls: string[] = [];
    const port: PasswordWorldPort = {
      current: () => ({ closed: false, busy: false, generation: 1, observedNavigation: 1, navigation: 1, documentId: 'doc', available: true }),
      call: async method => { calls.push(method); return { result: { value: { kind: 'passwordWriteCompleted' } } }; },
    };
    const filled = createPasswordControl(port, () => undefined, async () => undefined).fillPassword(TARGET, ORIGIN, [ORIGIN], 'canary', r.control);
    r.ack.fail(new Error('JOURNAL_UNAVAILABLE'));
    await expect(filled).rejects.toThrow('JOURNAL_UNAVAILABLE');
    expect(calls).toEqual([]);
  });

  it('the secret take-over reads the value only after the ack', async () => {
    const r = rig();
    const evidence = new SecretUseEvidence(['pw']);
    const writes: string[] = [];
    const secrets = createSecrets(['pw']) as Record<string, object>;
    const hook = createSecretHook({
      resolve: () => { r.events.push('resolve'); return { value: 'canary', allowedOrigins: [ORIGIN] }; },
      password: { preparePassword: async () => { r.events.push('prepare'); }, fillPassword: async (_t, _o, _a, value) => { writes.push(value); r.events.push('write'); } },
      passwordTarget: async () => ({ target: TARGET, origin: ORIGIN }),
      documentEpoch: () => 1,
      control: () => r.control,
      evidence,
    });
    const { locator, tally } = bind(r, { beforeCall: hook.beforeCall });
    const filling = Promise.resolve(locator.fill(secrets.pw));
    await tick();
    expect(r.events).toContain('prepare');
    expect(r.requests).toBe(1);
    expect(r.events).not.toContain('resolve');
    expect(writes).toEqual([]);
    expect(tally.fenceCrossed).toBe(false);
    r.ack.release();
    await filling;
    expect(r.events.slice(r.events.indexOf('request'))).toEqual(['request', 'resolve', 'write']);
    expect(writes).toEqual(['canary']);
    expect(evidence.snapshot()).toEqual({ pw: 'USED' });
  });

  it('a refused ack reads no value and writes nothing', async () => {
    const r = rig();
    const secrets = createSecrets(['pw']) as Record<string, object>;
    const hook = createSecretHook({
      resolve: () => { r.events.push('resolve'); return { value: 'canary', allowedOrigins: [ORIGIN] }; },
      password: { preparePassword: async () => undefined, fillPassword: async () => { r.events.push('write'); } },
      passwordTarget: async () => ({ target: TARGET, origin: ORIGIN }),
      documentEpoch: () => 1,
      control: () => r.control,
      evidence: new SecretUseEvidence(['pw']),
    });
    const { locator, tally } = bind(r, { beforeCall: hook.beforeCall });
    const filling = Promise.resolve(locator.fill(secrets.pw));
    await tick();
    r.ack.fail(new Error('nack'));
    await expect(filling).rejects.toThrow('nack');
    expect(r.events).not.toContain('resolve');
    expect(r.events).not.toContain('write');
    expect(tally.fenceCrossed).toBe(false);
  });
});

describe('fail closed, never retried', () => {
  it('an ack error rejects every waiting call with it; no native call, flag false, one request', async () => {
    const r = rig();
    const { locator, tally } = bind(r);
    const both = Promise.allSettled([locator.click(), locator.dblclick()]);
    await tick();
    r.ack.fail(new Error('JOURNAL_UNAVAILABLE'));
    const settled = await both;
    expect(settled.map(item => item.status)).toEqual(['rejected', 'rejected']);
    expect(settled.map(item => (item.status === 'rejected' ? (item.reason as Error).message : ''))).toEqual(['JOURNAL_UNAVAILABLE', 'JOURNAL_UNAVAILABLE']);
    expect(() => locator.click()).toThrow(ObservedRefusal); // the control is poisoned: a later call is refused before it reaches the fence
    expect(r.events.filter(event => event === 'click' || event === 'dblclick')).toEqual([]);
    expect([tally.fenceCrossed, tally.effects.length, r.requests, r.control.phase]).toEqual([false, 0, 1, 'POISONED']);
  });

  it('a requestFence that throws JOURNAL_UNAVAILABLE synchronously leaves the fence uncrossed and performs no native call', async () => {
    const abort = new AbortController();
    const events: string[] = [];
    let requests = 0;
    const control = createAckedInvocationControl({
      deadlineMs: Date.now() + 30_000, now: () => Date.now(), signal: abort.signal,
      requestFence: () => { requests += 1; throw new Error('JOURNAL_UNAVAILABLE'); },
    });
    const tally: StepTally = { fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false };
    const locator = createBinding({ control, allowedDomains: ['*'], tally }).wrap(new FakeLocator(events)) as FakeLocator;
    await expect(Promise.resolve(locator.click())).rejects.toThrow('JOURNAL_UNAVAILABLE');
    expect(() => locator.click()).toThrow(ObservedRefusal); // poisoned by the refused fence; no second request
    expect(events).not.toContain('click');
    expect([tally.fenceCrossed, requests]).toEqual([false, 1]);
  });

  it('abortPending while the ack is pending rejects the memo and the waiting call; a late ack is ignored', async () => {
    const r = rig();
    const { locator, tally } = bind(r);
    const click = Promise.resolve(locator.click());
    const rejection = expect(click).rejects.toMatchObject({ code: 'CANCELLED' });
    await tick();
    r.control.abortPending('CANCELLED');
    await rejection;
    expect(r.control.phase).toBe('POISONED');
    expect(r.control.signal.aborted).toBe(true);
    r.ack.release(); // the ack arrives after the abort
    await tick();
    expect(r.control.phase).toBe('POISONED');
    expect([tally.fenceCrossed, r.requests]).toEqual([false, 1]);
    expect(r.events).not.toContain('click');
    expect(() => { r.control.check(); }).toThrow(ObservedRefusal);
  });

  it('the parent signal aborting while the ack is pending is a cancel', async () => {
    const r = rig();
    const pending = r.control.beginInvocation() as Promise<void>;
    r.abort.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    r.ack.release();
    await tick();
    expect(r.control.phase).toBe('POISONED');
  });

  it('the deadline passing while the ack is pending is a timeout, and the memo stays the one rejected promise', async () => {
    const r = rig(Date.now() + 25);
    const pending = r.control.beginInvocation() as Promise<void>;
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(r.control.beginInvocation()).toBe(pending);
    expect(r.requests).toBe(1);
  });

  it('an ack that arrives after the deadline is refused', async () => {
    let clock = 1_000;
    const abort = new AbortController();
    const control = createAckedInvocationControl({ deadlineMs: 2_000, now: () => clock, signal: abort.signal, requestFence: async () => { clock = 3_000; } });
    await expect(control.beginInvocation()).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(control.phase).toBe('POISONED');
  });

  it('beginInvocation on an already poisoned control rejects without requesting a fence', async () => {
    const r = rig();
    r.control.poison('CANCELLED');
    await expect(r.control.beginInvocation()).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(r.requests).toBe(0);
  });

  it('remainingMs counts down on the control clock and never goes negative', () => {
    let clock = 100;
    const control = createAckedInvocationControl({ deadlineMs: 150, now: () => clock, signal: new AbortController().signal, requestFence: () => Promise.resolve() });
    expect(control.remainingMs?.()).toBe(50);
    clock = 400;
    expect(control.remainingMs?.()).toBe(0);
  });
});
