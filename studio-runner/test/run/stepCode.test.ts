/**
 * SC008-E1 AC2: frozen means frozen. The hash is rechecked before construction, a syntax error is located for the repair loop,
 * the injected and shadowed names are exactly the ADR's, and nothing is touched when admission refuses.
 */
import { describe, expect, it } from 'vitest';

import type { InvocationControl } from '../../src/executor/observedReplay.js';
import { hashObserved, ObservedRefusal, type ObservedErrorCode } from '../../src/validator/observedReferencePolicy.js';
import { admitStep, runStep, MAX_CODE_BYTES, type FrozenStep, type StepRun } from '../../src/run/stepCode.js';

/** Any property read on an injected object is a call on it: the refusal tests assert there were none. */
function untouched(label: string, touched: string[]): object {
  return new Proxy({}, { get(_target, prop) { touched.push(`${label}.${String(prop)}`); return undefined; } });
}

function control(): InvocationControl {
  const abort = new AbortController();
  return {
    phase: 'PREPARING',
    deadlineMs: Date.now() + 5000,
    remainingMs: () => 5000,
    signal: abort.signal,
    check: () => undefined,
    beginInvocation: () => undefined,
    poison: () => undefined,
  };
}

const frozen = (code: string): FrozenStep => ({ stepId: 's1', code, sourceHash: hashObserved(code) });

function run(touched: string[] = [], overrides: Partial<StepRun> = {}): StepRun {
  return {
    page: untouched('page', touched),
    context: untouched('context', touched),
    expect: untouched('expect', touched),
    inputs: { name: 'value' },
    secrets: { ID: 'handle' },
    vars: {},
    control: control(),
    allowedDomains: ['*'],
    ...overrides,
  };
}

describe('admission', () => {
  it('accepts a body whose hash matches and that V8 can construct', () => {
    expect(admitStep(frozen('await Promise.resolve(1);'))).toEqual({ ok: true });
  });

  it('refuses a one-byte change with zero touches of any injected object', async () => {
    const step = frozen("await page.goto('https://a.test/');");
    const touched: string[] = [];
    const result = await runStep({ ...step, code: step.code.replace('a.test', 'b.test') }, run(touched));
    expect(result.closedCode).toBe('INVALID_CONTRACT');
    expect(result.ok).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.fenceCrossed).toBe(false);
    expect(touched).toEqual([]);
    expect(admitStep({ ...step, code: `${step.code} ` })).toEqual({ ok: false, reason: 'SOURCE_HASH_MISMATCH' });
  });

  it('reads each field of the record once: what is hashed is what is constructed', () => {
    const good = 'await Promise.resolve(1);';
    let reads = 0;
    const swapping = { stepId: 's', sourceHash: hashObserved(good), get code(): string { reads += 1; return reads === 1 ? good : 'throw new Error("swapped");'; } };
    expect(admitStep(swapping)).toEqual({ ok: true });
    expect(reads).toBe(1);
  });

  it('refuses a malformed or oversize record', async () => {
    expect(admitStep({ stepId: 's', code: 5 as unknown as string, sourceHash: 'x' })).toEqual({ ok: false, reason: 'STEP_SHAPE' });
    const big = 'a'.repeat(MAX_CODE_BYTES + 1);
    expect(admitStep(frozen(big))).toEqual({ ok: false, reason: 'STEP_SHAPE' });
    expect(admitStep({ stepId: 's', code: '\uD800', sourceHash: '0' })).toEqual({ ok: false, reason: 'STEP_SHAPE' }); // not a valid string for the canonical hash
    expect((await runStep(frozen(big), run())).closedCode).toBe('INVALID_CONTRACT');
  });

  it('refuses a syntax error with the line and column of the model code, and touches nothing', async () => {
    const touched: string[] = [];
    const result = await runStep(frozen('const a = 1;\nawait page.click(;'), run(touched));
    expect(result.closedCode).toBe('INVALID_CONTRACT');
    expect(result.syntax).toMatchObject({ line: 2, column: 18 });
    expect(result.syntax?.message).toContain("')' expected");
    expect(touched).toEqual([]);
    expect(admitStep(frozen('const a = ;'))).toMatchObject({ ok: false, reason: 'STEP_SYNTAX', syntax: { line: 1 } });
  });

  it('refuses a break-out of the function body', async () => {
    const touched: string[] = [];
    const result = await runStep(frozen('}); throw new Error("escaped"); (function () {'), run(touched));
    expect(result.closedCode).toBe('INVALID_CONTRACT');
    expect(result.syntax).toBeDefined();
    expect(touched).toEqual([]);
  });
});

describe('the names the code sees', () => {
  it('shadows process, globalThis, require and fetch, injects the six names, and leaves setTimeout and setInterval alone', async () => {
    const result = await runStep(frozen(`
      vars.shadowed = [typeof process, typeof globalThis, typeof require, typeof fetch].join();
      vars.injected = [typeof page, typeof context, typeof expect, typeof inputs, typeof secrets, typeof vars].join();
      vars.timers = [typeof setTimeout, typeof setInterval].join();
      vars.input = inputs.name;
      vars.strict = (function () { return this === undefined; })();
    `), run());
    expect(result.ok).toBe(true);
    expect(result.vars).toMatchObject({ shadowed: 'undefined,undefined,undefined,undefined', injected: 'object,object,object,object,object,object', timers: 'function,function', input: 'value', strict: true });
  });

  it('returns the run-local vars untouched, so the caller commits captures', async () => {
    const vars: Record<string, unknown> = { kept: 1 };
    const result = await runStep(frozen("vars.captured = 'text';"), run([], { vars }));
    expect(result.vars).toBe(vars);
    expect(vars).toEqual({ kept: 1, captured: 'text' });
  });
});

describe('ending a step', () => {
  it('ends TIMEOUT when the control deadline passes before the code finishes', async () => {
    const poisoned: string[] = [];
    let expired = false;
    const abort = new AbortController();
    const timed: InvocationControl = {
      ...control(),
      remainingMs: () => 30,
      signal: abort.signal,
      check: () => { if (expired) throw new ObservedRefusal('TIMEOUT'); },
      poison: reason => { poisoned.push(reason); expired = true; abort.abort(); },
    };
    const result = await runStep(frozen('await new Promise(() => {});'), run([], { control: timed }));
    expect(poisoned).toEqual(['TIMEOUT']);
    expect(result.closedCode).toBe('TIMEOUT');
  });

  it('a code that swallows a refusal still ends in the control failure', async () => {
    let failure: ObservedErrorCode | null = null;
    const base = control();
    const failing: InvocationControl = {
      ...base,
      check: () => { if (failure !== null) throw new ObservedRefusal(failure); },
    };
    const page = { later: () => { failure = 'CANCELLED'; } };
    const result = await runStep(frozen('page.later(); try { await 1; } catch {}'), run([], { page, control: failing }));
    expect(result.closedCode).toBe('CANCELLED'); // the final control.check() fails the step
  });
});
