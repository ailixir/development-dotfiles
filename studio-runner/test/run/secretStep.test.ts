/**
 * SC008-E8 AC1 (handle half): the secret handle is opaque, unmintable, and carries only its ID; secretUse.ts no longer knows the
 * typed secretRef operation.
 */
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { ClosedActionError } from '../../src/run/closedError.js';
import { createSecrets, secretHandleIds, secretIdOf } from '../../src/run/secretStep.js';

const denied = (work: () => unknown): void => {
  let caught: unknown;
  try { work(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ClosedActionError);
  expect((caught as ClosedActionError).code).toBe('POLICY_DENIED');
};

describe('createSecrets and the handle', () => {
  const secrets = createSecrets(['login', '__proto__']);
  const handle = secrets.login;
  if (handle === undefined) throw new Error('missing handle');

  it('is a frozen null-prototype record keyed by the exact ids, holding frozen handles', () => {
    expect(Object.getPrototypeOf(secrets)).toBeNull();
    expect(Object.isFrozen(secrets)).toBe(true);
    expect(Object.keys(secrets)).toEqual(['login', '__proto__']);
    expect(secretIdOf(secrets.__proto__)).toBe('__proto__');
    expect(Object.isFrozen(handle)).toBe(true);
    expect(secretIdOf(handle)).toBe('login');
  });

  it('throws a closed POLICY_DENIED on every coercion', () => {
    /* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-template-expression, @typescript-eslint/no-unnecessary-type-conversion -- the coercions are the thing under test */
    denied(() => String(handle));
    denied(() => `${handle as unknown as string}`);
    denied(() => (handle as unknown as string) + '');
    /* eslint-enable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-template-expression, @typescript-eslint/no-unnecessary-type-conversion */
    denied(() => JSON.stringify(secrets));
    denied(() => JSON.stringify(handle));
    denied(() => (handle as { valueOf(): unknown }).valueOf());
    denied(() => (handle as Record<symbol, (hint: string) => unknown>)[Symbol.toPrimitive]?.('string'));
    denied(() => Number(handle));
  });

  it('renders as <secret ID> and holds no own property', () => {
    expect(inspect(handle)).toBe('<secret login>');
    expect(inspect(secrets)).toContain('<secret login>');
    expect(Reflect.ownKeys(handle)).toEqual([]);
    expect(Reflect.ownKeys(secrets)).toEqual(['login', '__proto__']);
  });

  it('cannot be minted from step code', () => {
    const construct = (handle as { constructor: new (...args: unknown[]) => unknown }).constructor;
    denied(() => new construct('x'));
    denied(() => new construct(Symbol('mint'), 'x'));
    denied(() => new construct(undefined, 'login'));
    const forged = Object.create(Object.getPrototypeOf(handle) as object) as object;
    expect(secretIdOf(forged)).toBeUndefined();
    expect(secretHandleIds([forged, { nested: forged }])).toEqual([]);
    // the prototype is frozen: step code cannot make a coercion return bytes
    expect(() => { (Object.getPrototypeOf(handle) as { toString: () => string }).toString = () => 'x'; }).toThrow();
  });
});

describe('secretHandleIds', () => {
  const { a, b } = createSecrets(['a', 'b']) as Record<string, object>;
  it('finds handles in the arguments and one level inside a plain object or an array', () => {
    expect(secretHandleIds([a])).toEqual(['a']);
    expect(secretHandleIds(['x', { value: a }, [b]])).toEqual(['a', 'b']);
    expect(secretHandleIds([{ deep: { value: a } }, [[b]]])).toEqual([]);
  });
  it('reads data properties only and never runs a getter', () => {
    let ran = false;
    const trap = { get value() { ran = true; return a; } };
    expect(secretHandleIds([trap])).toEqual([]);
    expect(ran).toBe(false);
  });
});

describe('secretUse.ts', () => {
  it('no longer refers to the typed secretRef operation, input recipes or slots', () => {
    const source = readFileSync(new URL('../../src/run/secretUse.ts', import.meta.url), 'utf8');
    for (const word of ['secretRef', 'recipes', 'intendedSlot', 'InputRecipe']) expect(source).not.toContain(word);
  });
});
