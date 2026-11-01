/**
 * SC008-E8 (AC1 sinks, AC2..AC5): the secret hook against fake receivers shaped like E1's HookedCall and a fake password port.
 * No browser: the order of calls, the fence, the window and the evidence are what is under test.
 */
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { InvocationControl } from '../../src/executor/observedReplay.js';
import { createRedactor } from '../../src/executor/redaction.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import type { PasswordTarget } from '../../src/run/observationTypes.js';
import { PasswordNoEffect } from '../../src/run/passwordControl.js';
import { createSecretHook, createSecrets, type SecretFillPort } from '../../src/run/secretStep.js';
import { SecretUseEvidence } from '../../src/run/secretUse.js';
import type { CallKind, HookedCall, TakeOver } from '../../src/run/stepCodeBinding.js';

const CANARY = 'canary-Secret/9+&"x';
const ORIGIN = 'https://login.example.test';
const TARGET: PasswordTarget = { kind: 'passwordControl', documentId: 'doc', generation: 1 };

class FenceStop extends Error {}

interface Rig {
  events: string[];
  epoch: { value: number };
  fillArgs: unknown[][];
  hook: ReturnType<typeof createSecretHook>;
  evidence: SecretUseEvidence;
  secrets: Record<string, object>;
  control: InvocationControl & { cancelled: boolean; phase: InvocationControl['phase'] };
  port: SecretFillPort;
  resolved: number;
  /** Next fillPassword / preparePassword / waitFor behaviours. */
  fail: { prepare?: Error; fill?: Error; waitFor?: Error; resolveUndefined?: boolean; target?: Error };
  untilFence: boolean;
}

function rig(): Rig {
  const events: string[] = [];
  const epoch = { value: 1 };
  const fillArgs: unknown[][] = [];
  const evidence = new SecretUseEvidence(['pw']);
  const control: Rig['control'] = {
    deadlineMs: Date.now() + 60_000, signal: new AbortController().signal, phase: 'PREPARING', cancelled: false,
    remainingMs: () => 60_000,
    check() { if (this.cancelled) throw new ObservedRefusal('CANCELLED'); },
    beginInvocation() { this.phase = 'INVOKING'; },
    poison() { this.cancelled = true; },
  };
  const r = { events, epoch, fillArgs, evidence, control, resolved: 0, fail: {}, untilFence: false } as unknown as Rig;
  r.port = {
    preparePassword: () => { events.push('prepare'); return r.fail.prepare !== undefined ? Promise.reject(r.fail.prepare) : Promise.resolve(); },
    fillPassword: (...args) => { events.push('fill'); fillArgs.push(args); return r.fail.fill !== undefined ? Promise.reject(r.fail.fill) : Promise.resolve(); },
  };
  r.secrets = createSecrets(['pw']) as Record<string, object>;
  r.hook = createSecretHook({
    resolve: id => { r.resolved++; events.push('resolve'); return id === 'pw' && !r.fail.resolveUndefined ? { value: CANARY, allowedOrigins: [ORIGIN] } : undefined; },
    password: r.port,
    passwordTarget: () => { events.push('target'); return r.fail.target !== undefined ? Promise.reject(r.fail.target) : Promise.resolve({ target: TARGET, origin: ORIGIN }); },
    documentEpoch: () => epoch.value,
    control: () => control,
    evidence,
  });
  return r;
}

interface Receiver { calls: string[]; matchesPassword: number; andThrows: boolean; inTop: boolean; page(): unknown; and(other: unknown): { count(): Promise<number> }; waitFor(): Promise<void>; evaluate(): Promise<boolean> }
function locator(r: Rig, over: Partial<{ matchesPassword: number; andThrows: boolean; inTop: boolean; waitFor: () => Promise<void> }> = {}): Receiver {
  const calls: string[] = [];
  const self: Receiver = {
    calls, matchesPassword: over.matchesPassword ?? 1, andThrows: over.andThrows ?? false, inTop: over.inTop ?? true,
    evaluate: () => { calls.push('evaluate'); return Promise.resolve(self.inTop); },
    waitFor: () => { r.events.push('waitFor'); calls.push('waitFor'); if (over.waitFor) return over.waitFor(); return r.fail.waitFor !== undefined ? Promise.reject(r.fail.waitFor) : Promise.resolve(); },
    and: () => { calls.push('and'); if (self.andThrows) throw new Error('Locators must belong to the same frame.'); return { count: () => Promise.resolve(self.matchesPassword) }; },
    page: () => ({ locator: () => ({}) }),
  };
  return self;
}

const call = (kind: CallKind, method: string, args: readonly unknown[], receiver: object = {}): HookedCall => ({ kind, method, args, receiver, fenceCrossed: false });
const thrown = (work: () => unknown): unknown => { try { work(); } catch (error) { return error; } return undefined; };
const fenceOk = (r: Rig) => () => { r.events.push('fence'); void r.control.beginInvocation(); };
const fenceStop = (r: Rig) => () => { r.events.push('fence'); throw new FenceStop('FENCE_REACHED'); };

/** What E1's call() does with a take-over: run(proceed, fence). */
async function drive(r: Rig, hooked: HookedCall, fence: () => void = fenceOk(r)): Promise<unknown> {
  const decision = await r.hook.beforeCall(hooked);
  if (decision === undefined) return undefined;
  return decision.run(() => { r.events.push('PROCEED'); return undefined; }, fence);
}
const secretFill = (r: Rig, receiver: object, extra: readonly unknown[] = []): HookedCall => call('Locator', 'fill', [r.secrets.pw, ...extra], receiver);
const refusalOf = async (work: Promise<unknown> | (() => unknown)): Promise<ObservedRefusal> => {
  try { await (typeof work === 'function' ? work() : work); } catch (error) { expect(error).toBeInstanceOf(ObservedRefusal); return error as ObservedRefusal; }
  throw new Error('expected a refusal');
};

describe('AC3: the trusted path, in order', () => {
  it('prepares before the fence and writes after it, with the value only in fillPassword', async () => {
    const r = rig();
    await drive(r, secretFill(r, locator(r)));
    expect(r.events).toEqual(['waitFor', 'target', 'prepare', 'fence', 'resolve', 'fill']);
    expect(r.fillArgs).toHaveLength(1);
    expect(r.fillArgs[0]).toEqual([TARGET, ORIGIN, [ORIGIN], CANARY, r.control]);
    expect(r.evidence.snapshot()).toEqual({ pw: 'USED' });
    expect(r.events).not.toContain('PROCEED');
  });

  it('in until-fence mode stops at the fence: no value read, no write, evidence unchanged, window not left armed', async () => {
    const r = rig();
    const error = await drive(r, secretFill(r, locator(r)), fenceStop(r)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FenceStop);
    expect(r.events).toEqual(['waitFor', 'target', 'prepare', 'fence']);
    expect(r.resolved).toBe(0);
    expect(r.evidence.snapshot()).toEqual({ pw: 'NOT_USED' });
    expect(r.hook.beforeCall(call('Locator', 'evaluate', [() => 1]))).toBeUndefined();
  });

  it.each([
    ['PASSWORD_TARGET_ABSENT', 'POLICY_REFUSED'], ['PASSWORD_TARGET_AMBIGUOUS', 'POLICY_REFUSED'], ['PASSWORD_FORM_ACTION_NOT_ALLOWED', 'POLICY_REFUSED'],
    ['POLICY_DENIED', 'POLICY_REFUSED'], ['TARGET_CHANGED', 'TARGET_DRIFT'],
  ])('maps %s to %s with noEffect and evidence REFUSED, from prepare and from the write', async (reason, code) => {
    for (const stage of ['prepare', 'fill'] as const) {
      const r = rig();
      r.fail[stage] = new PasswordNoEffect(reason);
      const refusal = await refusalOf(drive(r, secretFill(r, locator(r))));
      expect([refusal.code, refusal.noEffect]).toEqual([code, true]);
      expect(r.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
      expect(r.hook.beforeCall(call('Locator', 'evaluate', [() => 1]))).toBeUndefined(); // proved no write: window released
    }
  });

  it('keeps a failure after the write uncertain and the window armed', async () => {
    const r = rig();
    r.fail.fill = new Error('transport interrupted');
    await expect(drive(r, secretFill(r, locator(r)))).rejects.toThrow('transport interrupted');
    expect(r.evidence.snapshot()).toEqual({}); // missing is uncertainty: neither USED nor REFUSED
    expect((thrown(() => r.hook.beforeCall(call('Locator', 'inputValue', []))) as ObservedRefusal).code).toBe('PASSWORD_CONTROL_READ_REFUSED');
  });

  it('records USED for a write that completed while the control was cancelled', async () => {
    const r = rig();
    r.port.fillPassword = () => { r.control.cancelled = true; return Promise.resolve(); };
    await drive(r, secretFill(r, locator(r)));
    expect(r.evidence.snapshot()).toEqual({ pw: 'USED' });
  });

  it('refuses REFERENCE_MISMATCH after the fence when resolve knows nothing, and never writes', async () => {
    const r = rig();
    r.fail.resolveUndefined = true;
    expect((await refusalOf(drive(r, secretFill(r, locator(r))))).code).toBe('REFERENCE_MISMATCH');
    expect(r.fillArgs).toEqual([]);
    expect(r.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
  });

  it('propagates a pre-fence Playwright failure for the step runner to close, and releases the window', async () => {
    const r = rig();
    r.fail.waitFor = new Error('Timeout 30000ms exceeded');
    await expect(drive(r, secretFill(r, locator(r)))).rejects.toThrow('Timeout');
    expect(r.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
    expect(r.hook.beforeCall(call('Locator', 'evaluate', [() => 1]))).toBeUndefined();
    expect(r.events).not.toContain('fence');
  });
});

describe('AC2: one use only, refused before the effect', () => {
  const zeroEffects = (r: Rig): void => { expect(r.events).toEqual([]); expect(r.fillArgs).toEqual([]); };
  it.each([
    ['Locator.type', (r: Rig) => call('Locator', 'type', [r.secrets.pw])],
    ['Page.fill', (r: Rig) => call('Page', 'fill', ['#pw', r.secrets.pw])],
    ['a handle inside the options bag', (r: Rig) => call('Locator', 'fill', ['x', { hidden: r.secrets.pw }])],
    ['an evaluate argument', (r: Rig) => call('Page', 'evaluate', [() => 1, r.secrets.pw])],
    ['a second argument that is not a plain bag', (r: Rig) => call('Locator', 'fill', [r.secrets.pw, new Map()])],
    ['a third argument', (r: Rig) => call('Locator', 'fill', [r.secrets.pw, {}, 1])],
    ['a sync builder, as a synchronous throw', (r: Rig) => call('Page', 'locator', [r.secrets.pw])],
  ])('refuses %s with POLICY_REFUSED and zero calls', (_name, make) => {
    const r = rig();
    const error = thrown(() => r.hook.beforeCall(make(r)));
    expect(error).toBeInstanceOf(ObservedRefusal);
    expect([(error as ObservedRefusal).code, (error as ObservedRefusal).noEffect]).toEqual(['POLICY_REFUSED', true]);
    zeroEffects(r);
    expect(r.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
  });

  it('refuses a locator that is not the one password control (text input, several), a locator inside a frame, and an and() across frames, before the fence', async () => {
    for (const over of [{ matchesPassword: 0 }, { matchesPassword: 2 }, { andThrows: true }, { inTop: false }]) {
      const r = rig();
      const refusal = await refusalOf(drive(r, secretFill(r, locator(r, over))));
      expect(refusal.code).toBe('POLICY_REFUSED');
      expect(r.events).toEqual(['waitFor']);
      expect(r.fillArgs).toEqual([]);
    }
  });
});

describe('AC4: the secret-bearing window', () => {
  const EVALUATE = ['evaluate', 'evaluateAll', 'evaluateHandle', '$eval', '$$eval', 'addScriptTag', 'waitForFunction'];
  const READ_BACK = ['inputValue', 'getAttribute', 'ariaSnapshot', 'ariaSnapshotJSON', 'getProperty', 'getProperties', 'jsonValue', 'elementHandle', 'elementHandles'];
  const EXPECTS = ['to.have.value', 'to.have.values', 'to.have.property', 'to.have.attribute', 'to.have.attribute.value', 'to.match.aria'];

  it('refuses the evaluate family and every read-back on every receiver kind, synchronously, once a secret is in the page', async () => {
    const r = rig();
    await drive(r, secretFill(r, locator(r)));
    const before = r.events.length;
    for (const kind of ['Locator', 'Page', 'Frame', 'Other'] as const) {
      for (const method of EVALUATE) expect((thrown(() => r.hook.beforeCall(call(kind, method, []))) as ObservedRefusal).code).toBe('POLICY_REFUSED');
      for (const method of READ_BACK) expect((thrown(() => r.hook.beforeCall(call(kind, method, []))) as ObservedRefusal).code, `${kind}.${method}`).toBe('PASSWORD_CONTROL_READ_REFUSED');
      for (const expression of EXPECTS) expect((thrown(() => r.hook.beforeCall(call(kind, '_expect', [expression, {}]))) as ObservedRefusal).code, expression).toBe('PASSWORD_CONTROL_READ_REFUSED');
      for (const expression of ['to.have.text', 'to.be.visible', 'to.be.empty']) expect(r.hook.beforeCall(call(kind, '_expect', [expression, {}])), expression).toBeUndefined();
      expect(r.hook.beforeCall(call(kind, 'click', []))).toBeUndefined();
    }
    expect(r.events.length).toBe(before);
  });

  it('stays armed across steps (one hook per run) and ends when the document changes', async () => {
    const r = rig();
    await drive(r, secretFill(r, locator(r)));
    r.control.phase = 'PREPARING'; // the next step
    expect(thrown(() => r.hook.beforeCall(call('Page', 'evaluate', [() => 1])))).toBeInstanceOf(ObservedRefusal);
    r.epoch.value = 2;
    expect(r.hook.beforeCall(call('Page', 'evaluate', [() => 1]))).toBeUndefined();
    expect(r.hook.beforeCall(call('Locator', 'inputValue', []))).toBeUndefined();
  });

  it('applies none of it before any secret fill', () => {
    const r = rig();
    for (const method of [...EVALUATE, ...READ_BACK]) expect(r.hook.beforeCall(call('Locator', method, []))).toBeUndefined();
  });

  it('is armed synchronously: a read issued while the fill is still in flight is refused', async () => {
    const r = rig();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const filling = drive(r, secretFill(r, locator(r, { waitFor: () => gate })));
    expect((thrown(() => r.hook.beforeCall(call('Locator', 'inputValue', []))) as ObservedRefusal).code).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(thrown(() => r.hook.beforeCall(call('Page', 'evaluate', [() => 1])))).toBeInstanceOf(ObservedRefusal);
    release();
    await filling;
  });

  it('a document change during the awaiting fill, with another hooked call in between, does not drop the fill\'s own hold', async () => {
    const r = rig();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const filling = drive(r, secretFill(r, locator(r, { waitFor: () => gate })));
    r.epoch.value = 2; // the document changed while the fill awaits ...
    expect(r.hook.beforeCall(call('Page', 'click', []))).toBeUndefined(); // ... and another call sweeps the stale hold
    release();
    await filling; // the write goes into the epoch-2 document
    expect(r.evidence.snapshot()).toEqual({ pw: 'USED' });
    expect((thrown(() => r.hook.beforeCall(call('Locator', 'inputValue', []))) as ObservedRefusal).code).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(thrown(() => r.hook.beforeCall(call('Page', 'evaluate', [() => 1])))).toBeInstanceOf(ObservedRefusal);
    r.epoch.value = 3;
    expect(r.hook.beforeCall(call('Locator', 'inputValue', []))).toBeUndefined();
  });

  it('two overlapping fills: the first failing before its fence cannot disarm the second that wrote', async () => {
    const r = rig();
    let failFirst: (e: unknown) => void = () => undefined;
    const slow = new Promise<void>((_resolve, reject) => { failFirst = reject; });
    const first = drive(r, secretFill(r, locator(r, { waitFor: () => slow }))).catch((e: unknown) => e);
    await drive(r, secretFill(r, locator(r)));
    expect(r.evidence.snapshot()).toEqual({ pw: 'USED' });
    failFirst(new Error('strict waitFor timeout'));
    expect(await first).toBeInstanceOf(Error);
    expect(thrown(() => r.hook.beforeCall(call('Page', 'evaluate', [() => 1])))).toBeInstanceOf(ObservedRefusal);
    expect((thrown(() => r.hook.beforeCall(call('Locator', 'inputValue', []))) as ObservedRefusal).code).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(r.evidence.snapshot().pw).toBe('USED'); // a later refusal never undoes positive use
  });
});

describe('AC5: the post-fill literal check on every nonsecret fill', () => {
  function pageWith(inputs: string[], seen: number[] = []) {
    return { locator: () => ({ count: () => Promise.resolve(inputs.length), nth: (index: number) => ({ inputValue: () => { seen.push(index); return Promise.resolve(inputs[index] ?? ''); } }) }) };
  }
  const takeOver = (r: Rig, hooked: HookedCall): TakeOver => {
    const decision = r.hook.beforeCall(hooked);
    expect(decision).toBeDefined();
    expect(decision).not.toBeInstanceOf(Promise);
    return decision as TakeOver;
  };

  it('runs the native fill first and then reads at most 8 password inputs', async () => {
    const r = rig();
    const seen: number[] = [];
    const order: string[] = [];
    const page = pageWith(Array.from({ length: 12 }, () => 'other'), seen);
    const receiver = { page: () => { order.push('page'); return page; } };
    await takeOver(r, call('Locator', 'fill', ['hello'], receiver)).run(() => { order.push('proceed'); return undefined; }, () => undefined);
    expect(order).toEqual(['proceed', 'page']);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('ends with a closed UNKNOWN_OUTCOME, without the literal, when a password input holds it', async () => {
    for (const hooked of [
      (page: object) => call('Locator', 'fill', ['LITERAL-9'], { page: () => page }),
      (page: object) => call('Frame', 'fill', ['#a', 'LITERAL-9'], { page: () => page }),
      (page: object) => call('Page', 'fill', ['#a', 'LITERAL-9'], page),
    ]) {
      const r = rig();
      const error: unknown = await (takeOver(r, hooked(pageWith(['x', 'LITERAL-9']))).run(() => undefined, () => undefined) as Promise<unknown>).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClosedActionError);
      expect((error as ClosedActionError).code).toBe('UNKNOWN_OUTCOME');
      expect(`${(error as Error).message}${(error as Error).stack ?? ''}`).not.toContain('LITERAL-9');
    }
  });

  it('leaves an empty literal and every non-fill call alone', () => {
    const r = rig();
    expect(r.hook.beforeCall(call('Locator', 'fill', [''], {}))).toBeUndefined();
    expect(r.hook.beforeCall(call('Locator', 'click', ['hello'], {}))).toBeUndefined();
    expect(r.hook.beforeCall(call('Other', 'fill', ['hello'], {}))).toBeUndefined();
  });
});

describe('AC1: no secret byte in the tested sinks', () => {
  const detector = createRedactor([CANARY]);
  const hit = (text: string): boolean => detector.redact(text) !== text;
  const describeError = (error: unknown): string => error instanceof Error ? `${error.name} ${error.message} ${error.stack ?? ''} ${JSON.stringify(Object.entries(error))}` : String(error);

  it('the canary appears in no error, evidence snapshot or inspected object across success, refusals, a post-write failure and a cancellation', async () => {
    const sinks: string[] = [];
    const scenarios: ((r: Rig) => Promise<unknown>)[] = [
      r => drive(r, secretFill(r, locator(r))),
      r => { r.fail.prepare = new PasswordNoEffect('PASSWORD_TARGET_AMBIGUOUS'); return drive(r, secretFill(r, locator(r))); },
      r => { r.fail.fill = new PasswordNoEffect('PASSWORD_FORM_ACTION_NOT_ALLOWED'); return drive(r, secretFill(r, locator(r))); },
      r => { r.fail.fill = new Error('transport interrupted'); return drive(r, secretFill(r, locator(r))); },
      r => { r.port.fillPassword = () => { r.control.cancelled = true; r.control.check(); return Promise.resolve(); }; return drive(r, secretFill(r, locator(r))); },
      r => Promise.resolve().then(() => r.hook.beforeCall(call('Locator', 'type', [r.secrets.pw]))),
      r => Promise.resolve().then(() => { r.epoch.value = 1; }).then(() => drive(r, secretFill(r, locator(r)))).then(() => r.hook.beforeCall(call('Locator', 'inputValue', []))),
    ];
    for (const scenario of scenarios) {
      const r = rig();
      const outcome = await scenario(r).catch((e: unknown) => e);
      sinks.push(describeError(outcome), JSON.stringify(r.evidence.snapshot()), inspect(r.hook, { depth: 6 }), inspect(r.secrets, { depth: 6 }), r.events.join(','));
    }
    for (const sink of sinks) expect(hit(sink), sink.slice(0, 80)).toBe(false);
  });

  it('the detector is live: plain-string secrets would be found', () => {
    expect(hit(inspect({ pw: CANARY }))).toBe(true);
    expect(hit(JSON.stringify({ pw: encodeURIComponent(CANARY) }))).toBe(true);
  });
});
