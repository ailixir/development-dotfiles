import { describe, expect, it } from 'vitest';
import type { Action, ObservationFact, ResolvedTarget } from '../../src/guided/types.js';
import { ActionBudget, LEARN_ACTION_BUDGET_MS, LEARN_PROFILE, REPLAY_PROFILE, type ActionProfileTable } from '../../src/run/actionBudget.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import { assertPrepareProofAgrees, performOnTarget, performWithNavigation, resolveTarget, targetKey, type PerformOptions } from '../../src/run/targetAction.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { FakePage, FakeWorld, type Behaviour } from '../helpers/fakePage.js';

const GO: ResolvedTarget = { locator: [{ by: 'testId', value: 'go' }], tier: 'testId', identity: { role: 'button', name: 'Go' } };
const NTH: ResolvedTarget = { locator: [{ by: 'role', role: 'button', name: 'Go', exact: true }, { by: 'nth', index: 1 }], tier: 'nth', identity: { role: 'button', name: 'Go' } };
const SCOPED_NAMELESS: ResolvedTarget = { locator: [{ by: 'scope', role: 'group', name: 'G2', exact: true }, { by: 'role', role: 'button' }], tier: 'scoped', identity: { role: 'button', name: 'Buy' } };
const SCOPED_NAMED: ResolvedTarget = { locator: [{ by: 'scope', role: 'group', name: 'G2', exact: true }, { by: 'role', role: 'button', name: 'Buy', exact: true }], tier: 'scoped', identity: { role: 'button', name: 'Buy' } };
const ORIGIN = 'https://example.test';
const COMMITTING = new Set(['click', 'hover', 'check', 'uncheck', 'fill', 'selectOption', 'press', 'focus']);

type Op = Action['operation'];
const lit = { kind: 'authoredLiteral', sourceInputId: 'i1' } as const;
const OPS: Record<string, { op: Op; value: string | null; patch: Partial<Behaviour> }> = {
  click: { op: { kind: 'click' }, value: null, patch: {} },
  hover: { op: { kind: 'hover' }, value: null, patch: {} },
  check: { op: { kind: 'check' }, value: null, patch: {} },
  uncheck: { op: { kind: 'uncheck' }, value: null, patch: { checked: true } },
  fill: { op: { kind: 'fill', value: lit }, value: 'typed', patch: {} },
  selectOption: { op: { kind: 'selectOption', value: lit }, value: 'python 3.12', patch: { selectKind: 'single', options: [{ text: 'Python 3.12', value: 'a' }] } },
  press: { op: { kind: 'press', key: 'Tab' }, value: null, patch: {} },
  read: { op: { kind: 'read', bindingId: 'b1', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: 'grant-1' } }, value: null, patch: {} },
  assertVisible: { op: { kind: 'assert', predicate: 'visible', expected: null }, value: null, patch: {} },
  assertContains: { op: { kind: 'assert', predicate: 'containsText', expected: lit }, value: 'hello', patch: {} },
  assertHasValue: { op: { kind: 'assert', predicate: 'hasValue', expected: lit }, value: 'x', patch: { value: 'x' } },
};
const op = (name: string): { op: Op; value: string | null; patch: Partial<Behaviour> } => { const entry = OPS[name]; if (entry === undefined) throw new Error('UNKNOWN_OP ' + name); return entry; };

function setup(patch: Partial<Behaviour> = {}, profile: ActionProfileTable = LEARN_PROFILE, controlRemainingMs = 120_000, target: ResolvedTarget = GO) {
  const w = new FakeWorld(patch);
  const page = new FakePage(w);
  const budget = new ActionBudget(profile.totalMs === null ? controlRemainingMs : Math.min(profile.totalMs, controlRemainingMs), w.now);
  const options = (extra: Partial<PerformOptions> = {}): PerformOptions => ({
    profile, budget, verifyCapturedElement: w.verifyCapturedElement, maxValueBytes: 4096, readRuleId: 'grant-1', liveReadRuleId: 'grant-1', origin: ORIGIN, allowedDomains: ['example.test'], target, ...extra,
  });
  const run = (op: Op, value: string | null, extra: Partial<PerformOptions> = {}) => performOnTarget(page, op, page.target(), value, w.control(), options(extra));
  return { w, page, budget, options, run };
}

describe('performOnTarget: the sequence', () => {
  it.each(['click', 'hover', 'check'] as const)('%s acts on the node bound at the re-check: a replaced or detached node stops as UNKNOWN_OUTCOME and the replacement is never acted on', async name => {
    const { w, run } = setup({ boundDetached: true });
    await expect(run(op(name).op, null)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.fenced).toBe(true);
    expect(w.log.some(call => call.id === 'T' && call.method === name && call.fenced)).toBe(false);
  });

  it('a checkbox replaced by an unchecked clone is not reported as success: the state is read through the locator', async () => {
    const { run } = setup({ replacedByUnchecked: true });
    await expect(run(op('check').op, null)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
  });

  it('a control that trips at the fence stops the action: no click, hover, toggle, key, fill or selection reaches the page', async () => {
    for (const [name, { op, value, patch }] of Object.entries(OPS)) {
      if (op.kind === 'read' || op.kind === 'assert') continue;
      const { w, page, options } = setup(patch);
      const control = { ...w.control(), check: () => { if (w.fenced) throw new ObservedRefusal('TIMEOUT'); } };
      await expect(performOnTarget(page, op, page.target(), value, control, options()), name).rejects.toMatchObject({ code: 'TIMEOUT' });
      expect(w.fenced, name).toBe(true);
      expect(w.after().filter(call => ['click', 'hover', 'check', 'uncheck', 'fill', 'selectOption', 'press'].includes(call.method)), name).toEqual([]);
    }
  });

  it('every no-effect call precedes the fence for every operation', async () => {
    for (const [name, { op, value, patch }] of Object.entries(OPS)) {
      const { w, run } = setup(patch);
      await run(op, value);
      expect(w.fenced, name).toBe(true);
      expect(w.log.filter(call => COMMITTING.has(call.method) && !call.fenced), `${name}: committing call before the fence`).toEqual([]);
      // A read or an assert is complete before the fence: nothing but the fence follows.
      if (name === 'read' || name.startsWith('assert')) expect(w.after(), name).toEqual([]);
      else expect(w.after().length, name).toBeGreaterThan(0);
    }
  });

  it('every operation stays inside the learn action budget', async () => {
    for (const [name, { op, value, patch }] of Object.entries(OPS)) {
      const { w, run } = setup(patch);
      await run(op, value);
      const handed = w.timeouts(), clamps = handed.filter(t => t === 1).length;
      expect(handed.reduce((a, b) => a + b, 0), name).toBeLessThanOrEqual(LEARN_ACTION_BUDGET_MS + clamps);
    }
  });

  it('a bound-node mismatch refuses before the fence', async () => {
    const { w, run } = setup();
    await expect(run({ kind: 'click' }, null, { sameNode: () => Promise.resolve(false) })).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.fenced).toBe(false);
    expect(w.log.filter(call => call.method === 'click')).toEqual([]);
  });

  it('the bound node and the count are checked again after the pre-flight', async () => {
    const { w, run } = setup();
    const sameNode = (): Promise<boolean> => { w.log.push({ id: 'sameNode', method: 'sameNode', fenced: w.fenced, timeout: undefined }); return Promise.resolve(true); };
    await run({ kind: 'click' }, null, { sameNode });
    const trial = w.log.findIndex(call => call.method === 'click:trial');
    const countsAfterTrial = w.log.map((call, i) => ({ call, i })).filter(({ call, i }) => i > trial && call.id === 'T' && call.method === 'count' && !call.fenced);
    const sameAfterTrial = w.log.map((call, i) => ({ call, i })).filter(({ call, i }) => i > trial && call.method === 'sameNode' && !call.fenced);
    expect(trial).toBeGreaterThanOrEqual(0);
    expect(countsAfterTrial.length).toBeGreaterThanOrEqual(1);
    expect(sameAfterTrial.length).toBeGreaterThanOrEqual(1);
  });

  it('a target that changed between the pre-flight and the fence refuses before the fence', async () => {
    const { w, run } = setup();
    // The page grows a second match right after the trial click: the re-check sees it.
    w.hooks['click:trial'] = () => { w.b.count = 2; };
    await expect(run({ kind: 'click' }, null)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.fenced).toBe(false);
    expect(w.log.filter(call => call.method === 'click')).toEqual([]);
  });

  it('fill refuses when a password field holds focus after focus()', async () => {
    const { w, run } = setup({ focusLandsOn: 'password', passwordValues: [''] });
    await expect(run(op('fill').op, 'typed')).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.fenced).toBe(true);
    expect(w.log.filter(call => call.method === 'fill')).toEqual([]);
  });

  it('fill refuses when the target does not hold focus', async () => {
    const { w, run } = setup({ focusLandsOn: 'none' });
    await expect(run(op('fill').op, 'typed')).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.log.filter(call => call.method === 'fill')).toEqual([]);
  });

  it('fill refuses when the bound node changed during the focus', async () => {
    const { w, run } = setup();
    // The pre-flight and the re-check see the bound node; once focus() has run (a handler replaced the field and kept the test id) it is gone.
    const sameNode = (): Promise<boolean> => Promise.resolve(!w.log.some(call => call.method === 'focus'));
    await expect(run(op('fill').op, 'typed', { sameNode })).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.log.filter(call => call.method === 'fill')).toEqual([]);
  });

  it('a change elsewhere on the page, or on the target itself, during the focus does not stop the fill while the bound node is the same', async () => {
    // The old in-page rule watched DOM records around the field; the executor now asks the one question that matters (D-16): is the bound node
    // still the single match and does it hold focus. Helper text, an autocomplete portal or an attribute of the target change nothing about that.
    const { w, run } = setup();
    w.hooks.focus = () => { w.sameNodeResult = true; }; // something on the page changed while the target took focus
    await expect(run(op('fill').op, 'typed', { sameNode: () => Promise.resolve(true) })).resolves.toEqual({});
    expect(w.after().filter(call => call.method === 'fill')).toHaveLength(1);
  });

  it('press refuses when another element holds focus', async () => {
    const { w, run } = setup({ focusLandsOn: 'button' });
    await expect(run({ kind: 'press', key: 'Enter' }, null)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.fenced).toBe(true);
    expect(w.log.filter(call => call.method === 'press')).toEqual([]);
  });

  it('press delivers exactly one key to the focused target', async () => {
    const { w, run } = setup();
    await run({ kind: 'press', key: 'Tab' }, null);
    expect(w.log.filter(call => call.method === 'press')).toHaveLength(1);
    expect(w.log.find(call => call.method === 'press')?.arg).toMatchObject({ key: 'Tab', focused: 'target', noWaitAfter: true });
  });

  it('press on a target that cannot take focus is refused before the fence', async () => {
    const { w, run } = setup({ focusable: false });
    await expect(run({ kind: 'press', key: 'Enter' }, null)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.fenced).toBe(false);
  });
});

describe('performOnTarget: fill', () => {
  it('fill checks after the write that the authored literal sits in no password input', async () => {
    const copied = setup({ copyFillIntoPassword: true, passwordValues: [''] });
    await expect(copied.run(op('fill').op, 'typed-literal')).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    // The thrown error names no value.
    await copied.run(op('fill').op, 'typed-literal').catch((error: unknown) => { expect(JSON.stringify(error)).not.toContain('typed-literal'); expect((error as Error).message).toBe('UNKNOWN_OUTCOME'); });
    const unrelated = setup({ passwordValues: ['someone-else', ''] });
    await expect(unrelated.run(op('fill').op, 'typed-literal')).resolves.toEqual({});
  });

  it('fill checks after the write that the authored literal sits in no password input: an empty literal is skipped', async () => {
    // fill('') on a page with an empty password input must not be a false UNKNOWN_OUTCOME (critique 3 condition 3, AC10).
    const { w, run } = setup({ copyFillIntoPassword: true, passwordValues: ['', ''] });
    await expect(run(op('fill').op, '')).resolves.toEqual({});
    expect(w.log.filter(call => call.method === 'inputValue')).toEqual([]);
  });

  it('R5: a non-secret fill presses End through the same bound locator before the password check', async () => {
    const { w, run } = setup({ passwordValues: ['someone-else'] });
    await expect(run(op('fill').op, 'typed')).resolves.toEqual({});
    const calls = w.log.map(call => call.method);
    const fill = calls.indexOf('fill');
    const press = calls.indexOf('press');
    const check = calls.indexOf('inputValue');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(press).toBeGreaterThan(fill);
    expect(check).toBeGreaterThan(press);
    const pressed = w.log[press];
    expect(pressed?.id).toBe(w.log[fill]?.id);
    expect(pressed).toMatchObject({ arg: { key: 'End', noWaitAfter: true } });
    expect(pressed?.fenced).toBe(true);
  });

  it('R5: a secret fill does not press End', async () => {
    // A secret never reaches the shared fill: a password-typed target is refused before the fence, so no fill and no key is sent.
    const { w, run } = setup({ isPassword: true });
    await expect(run(op('fill').op, 'typed')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.log.filter(call => call.method === 'press' || call.method === 'fill')).toEqual([]);
  });

  it('a password-typed target is never filled through this path', async () => {
    const { w, run } = setup({ isPassword: true });
    await expect(run(op('fill').op, 'typed')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.fenced).toBe(false);
  });

  it('a value over the cap, a non-fillable target and a disabled target are refused before the fence', async () => {
    const big = setup();
    await expect(big.run(op('fill').op, 'x'.repeat(5000))).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    await expect(big.run(op('fill').op, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    const checkbox = setup({ fillable: false });
    await expect(checkbox.run(op('fill').op, 'x')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    const disabled = setup({ enabled: false });
    await expect(disabled.run(op('fill').op, 'x')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    for (const s of [big, checkbox, disabled]) expect(s.w.fenced).toBe(false);
  });
});

describe('performOnTarget: selectOption', () => {
  it('dispatches the chosen option by index, a variant included', async () => {
    const { w, run } = setup(op('selectOption').patch);
    await run(op('selectOption').op, 'PYTHON 3.12');
    expect(w.log.find(call => call.method === 'selectOption')?.arg).toEqual({ index: 0 });
  });
  it('refuses a non-select, an absent literal and a disabled option before the fence', async () => {
    const notSelect = setup({ selectKind: 'multiple', options: [{ text: 'A', value: 'a' }] });
    await expect(notSelect.run(op('selectOption').op, 'a')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    const absent = setup(op('selectOption').patch);
    await expect(absent.run(op('selectOption').op, '3.99')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    const disabled = setup({ selectKind: 'single', options: [{ text: 'A', value: 'a', disabled: true }] });
    await expect(disabled.run(op('selectOption').op, 'a')).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    for (const s of [notSelect, absent, disabled]) { expect(s.w.fenced).toBe(false); expect(s.w.log.some(call => call.method === 'selectOption')).toBe(false); }
  });
});

describe('performOnTarget: read and assert', () => {
  it('a read is evaluated before the fence and an empty value is refused as POLICY_DENIED', async () => {
    const ok = setup({ text: '  Order 42  ' });
    await expect(ok.run(op('read').op, null)).resolves.toEqual({ value: '  Order 42  ' }); // the exact innerText: the binding preserves bytes, only the emptiness check trims
    const read = ok.w.log.findIndex(call => call.method === 'innerText');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(ok.w.log[read]?.fenced).toBe(false);
    expect(ok.w.fenced).toBe(true);
    const empty = setup({ text: '   ' });
    await expect(empty.run(op('read').op, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(empty.w.fenced).toBe(false);
    const replay = setup({ text: '   ' }, REPLAY_PROFILE);
    await expect(replay.run(op('read').op, null)).rejects.toMatchObject({ code: 'READ_REFUSED' });
    const big = setup({ text: 'x'.repeat(5000) });
    await expect(big.run(op('read').op, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    const lone = setup({ text: 'bad \ud800 surrogate' });
    await expect(lone.run(op('read').op, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
  });

  it('refuses a learned read (READ_REFUSED) once the list names the page by a different entry than the one it was learned under', async () => {
    for (const live of ['grant-other', null]) {
      const replay = setup({}, REPLAY_PROFILE);
      await expect(replay.run(op('read').op, null, { liveReadRuleId: live })).rejects.toMatchObject({ code: 'READ_REFUSED' });
      expect(replay.w.log.some(call => call.method === 'innerText')).toBe(false);
      const learn = setup();
      await expect(learn.run(op('read').op, null, { liveReadRuleId: live })).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    }
    const control = setup();
    const controlValue: Op = { kind: 'read', bindingId: 'b1', recipe: { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'text', policyRuleId: 'grant-1' } };
    await expect(control.run(controlValue, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
  });

  it('an ineligible read surface is refused before the fence', async () => {
    for (const patch of [{ sensitiveSelf: 1 }, { sensitiveBelow: 1 }, { sensitiveAbove: 1 }] satisfies Partial<Behaviour>[]) {
      const { w, run } = setup(patch);
      await expect(run(op('read').op, null)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
      expect(w.fenced).toBe(false);
      expect(w.log.some(call => call.method === 'innerText')).toBe(false);
    }
    const password = setup({ isPassword: true });
    await expect(password.run(op('read').op, null)).rejects.toMatchObject({ code: 'PASSWORD_CONTROL_READ_REFUSED' });
  });

  it('assertions compute their verdict before the fence', async () => {
    const hit = setup({ text: ' Hello​   World ' });
    await expect(hit.run({ kind: 'assert', predicate: 'containsText', expected: lit }, 'Hello World')).resolves.toEqual({ assertionPassed: true });
    const miss = setup({ text: 'Goodbye' });
    await expect(miss.run({ kind: 'assert', predicate: 'containsText', expected: lit }, 'Hello')).resolves.toEqual({ assertionPassed: false });
    const empty = setup({ text: 'anything' });
    await expect(empty.run({ kind: 'assert', predicate: 'containsText', expected: lit }, '​ ')).resolves.toEqual({ assertionPassed: false });
    const value = setup({ value: 'abc' });
    await expect(value.run({ kind: 'assert', predicate: 'hasValue', expected: lit }, 'abc')).resolves.toEqual({ assertionPassed: true });
    await expect(value.run({ kind: 'assert', predicate: 'hasValue', expected: lit }, 'abd')).resolves.toEqual({ assertionPassed: false });
    const password = setup({ isPassword: true });
    await expect(password.run({ kind: 'assert', predicate: 'hasValue', expected: lit }, 'x')).rejects.toMatchObject({ code: 'PASSWORD_CONTROL_READ_REFUSED' });
    expect(password.w.fenced).toBe(false);
    await expect(password.run({ kind: 'assert', predicate: 'containsText', expected: lit }, 'x')).rejects.toMatchObject({ code: 'PASSWORD_CONTROL_READ_REFUSED' });
    const url = setup();
    await expect(url.run({ kind: 'assert', predicate: 'url', expected: lit }, 'x')).rejects.toMatchObject({ code: 'POLICY_DENIED' });
  });

  it('a toggle post-condition mismatch is UNKNOWN_OUTCOME', async () => {
    // The page flips the box back right after the uncheck.
    const { w, run } = setup({ checked: true });
    w.hooks.uncheck = () => { w.b.checked = true; };
    await expect(run({ kind: 'uncheck' }, null)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
  });
});

describe('the navigation sequence', () => {
  it('a click that starts a navigation waits for the commit outside ACTION_MS', async () => {
    const { w, run } = setup({ requestAfterMs: 10, commitAfterMs: 40 });
    await run({ kind: 'click' }, null);
    const click = w.log.find(call => call.method === 'click');
    expect(click).toMatchObject({ timeout: LEARN_PROFILE.actionMs });
    expect(click?.arg).toMatchObject({ noWaitAfter: true });
    const commitWait = w.log.find(call => call.method === 'waitForEvent:framenavigated');
    const remaining = LEARN_ACTION_BUDGET_MS - LEARN_PROFILE.actionabilityWaitMs;
    // The commit wait is the remaining learn budget, not ACTION_MS.
    expect(commitWait?.timeout).toBe(remaining);
    expect(commitWait?.timeout).not.toBe(LEARN_PROFILE.actionMs);
    const load = w.log.find(call => call.method === 'waitForLoadState');
    expect(load).toBeDefined();
    expect(load?.timeout).toBeLessThanOrEqual(remaining);
  });

  it('a click that starts no navigation returns after the start window', async () => {
    const { w, run } = setup();
    const t0 = Date.now();
    await run({ kind: 'click' }, null);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(280);
    expect(elapsed).toBeLessThan(1_200);
    expect(w.log.some(call => call.method === 'waitForLoadState')).toBe(false);
  });

  it('a navigation that starts but does not commit within the budget is UNKNOWN_OUTCOME', async () => {
    const { w, page } = setup({ requestAfterMs: 5, commitAfterMs: null });
    await expect(performWithNavigation(page, () => Promise.resolve(), { actionMs: 100, startMs: 300, commitMs: 150 })).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(w.log.some(call => call.method === 'waitForLoadState')).toBe(false);
  });

  it('a navigation that commits is waited for, and the start window is measured after the action returns', async () => {
    const { w, page } = setup({ requestAfterMs: 120, commitAfterMs: 150 });
    // The action itself takes 200 ms (a covered link); the request arrives while it runs, a start window counted from registration would have missed it.
    const result = await performWithNavigation(page, async () => { await new Promise(resolve => setTimeout(resolve, 200)); }, { actionMs: 100, startMs: 100, commitMs: 5_000 });
    expect(result).toEqual({ navigation: true });
    expect(w.log.some(call => call.method === 'waitForLoadState')).toBe(true);
  });

  it('the commit wait is NAV_SETTLE_MS at replay', async () => {
    const { w, run } = setup({ requestAfterMs: 5, commitAfterMs: 10 }, REPLAY_PROFILE, 1_000_000);
    await run({ kind: 'click' }, null);
    expect(w.log.find(call => call.method === 'waitForEvent:framenavigated')?.timeout).toBe(REPLAY_PROFILE.navSettleMs);
    expect(w.log.find(call => call.method === 'click')?.timeout).toBe(REPLAY_PROFILE.actionMs);
  });

  it('the commit wait is NAV_SETTLE_MS at replay and is clamped to the control remaining time', async () => {
    // The control has 12 s left; the trial click consumes 8 s of it (worst case), so 4 s remain for the commit.
    const { w, run } = setup({ requestAfterMs: 5, commitAfterMs: 10 }, REPLAY_PROFILE, 12_000);
    await run({ kind: 'click' }, null);
    expect(w.log.find(call => call.method === 'waitForEvent:framenavigated')?.timeout).toBe(12_000 - REPLAY_PROFILE.actionabilityWaitMs);
    expect(12_000 - REPLAY_PROFILE.actionabilityWaitMs).toBeLessThan(REPLAY_PROFILE.navSettleMs ?? 0);
  });

  it('press(Enter) and a toggle use the same sequence', async () => {
    const press = setup({ requestAfterMs: 5, commitAfterMs: 10 });
    await press.run({ kind: 'press', key: 'Enter' }, null);
    expect(press.w.log.some(call => call.method === 'waitForLoadState')).toBe(true);
    const toggle = setup({ requestAfterMs: 5, commitAfterMs: 10 });
    await toggle.run({ kind: 'check' }, null);
    expect(toggle.w.log.find(call => call.method === 'check')?.arg).toMatchObject({ noWaitAfter: true });
    expect(toggle.w.log.some(call => call.method === 'isChecked')).toBe(false);
  });
});

describe('resolveTarget', () => {
  const resolve = (patch: Partial<Behaviour>, target: ResolvedTarget = GO, origin = ORIGIN, allowed = ['example.test']) => {
    const w = new FakeWorld(patch); const page = new FakePage(w);
    return { w, outcome: resolveTarget(page, target, { origin, allowedDomains: allowed, budget: new ActionBudget(60_000, w.now), profile: LEARN_PROFILE }) };
  };

  it('zero matches is ABSENT and several matches is REFUSED', async () => {
    expect((await resolve({ count: 0 }).outcome).kind).toBe('ABSENT');
    expect(await resolve({ count: 2 }).outcome).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
    expect((await resolve({ count: 1 }).outcome).kind).toBe('READY');
  });

  it('an identity role or name mismatch refuses with no action call', async () => {
    for (const snapshot of ['- link "Go"', '- button "Stop"', '- text: nope', '']) {
      const { w, outcome } = resolve({ snapshot }, NTH);
      expect(await outcome, snapshot).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
      expect(w.log.filter(call => COMMITTING.has(call.method))).toEqual([]);
    }
    expect((await resolve({ snapshot: '- button "Go"' }, NTH).outcome).kind).toBe('READY');
  });

  it('the identity check also covers a scoped locator whose last step has no name', async () => {
    const mismatch = resolve({ snapshot: '- button "Sell"' }, SCOPED_NAMELESS);
    expect(await mismatch.outcome).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
    expect(mismatch.w.log.some(call => call.method === 'ariaSnapshot')).toBe(true);
    expect((await resolve({ snapshot: '- button "Buy"' }, SCOPED_NAMELESS).outcome).kind).toBe('READY');
    // A scoped locator that names its last step, and the plain tiers, need no snapshot.
    const named = resolve({ snapshot: '- button "Sell"' }, SCOPED_NAMED);
    expect((await named.outcome).kind).toBe('READY');
    expect(named.w.log.some(call => call.method === 'ariaSnapshot')).toBe(false);
    const plain = resolve({ snapshot: '- button "Sell"' }, GO);
    expect((await plain.outcome).kind).toBe('READY');
    expect(plain.w.log.some(call => call.method === 'ariaSnapshot')).toBe(false);
  });

  it('refuses another origin and a host off the list, and a locator outside the grammar', async () => {
    expect(await resolve({}, GO, 'https://other.test', ['example.test']).outcome).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
    expect(await resolve({}, GO, ORIGIN, ['elsewhere.test']).outcome).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
    const bad = { ...GO, locator: [{ by: 'nth', index: 0 }, { by: 'testId', value: 'x' }] } as unknown as ResolvedTarget;
    await expect(resolve({}, bad).outcome).rejects.toBeInstanceOf(ObservedRefusal);
    const w = new FakeWorld({}); w.url = 'about:blank';
    await expect(resolveTarget(new FakePage(w), GO, { origin: ORIGIN, allowedDomains: ['example.test'], budget: new ActionBudget(1_000, w.now), profile: LEARN_PROFILE })).resolves.toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' });
  });
});

describe('the closed boundary of the executor', () => {
  it('canary: no thrown error carries page text for click, fill, selectOption, press, check, read and assert', async () => {
    // click, fill, selectOption, press and check fail AFTER the fence with a Playwright-shaped TimeoutError; read and assert fail in the pre-flight.
    const cases: [string, string, string][] = [
      ['click', 'click', 'UNKNOWN_OUTCOME'], ['fill', 'fill', 'UNKNOWN_OUTCOME'], ['selectOption', 'selectOption', 'UNKNOWN_OUTCOME'],
      ['press', 'press', 'UNKNOWN_OUTCOME'], ['check', 'check', 'UNKNOWN_OUTCOME'], ['read', 'waitFor', 'TARGET_CHANGED'], ['assertVisible', 'waitFor', 'TARGET_CHANGED'],
    ];
    for (const [name, method, code] of cases) {
      const entry = op(name);
      const { w, run } = setup({ ...entry.patch, throwOn: { [method]: 'TimeoutError' } });
      let caught: unknown;
      try { await run(entry.op, entry.value); } catch (error) { caught = error; }
      expect(caught, name).toBeInstanceOf(ClosedActionError);
      const error = caught as ClosedActionError;
      expect(error.code, name).toBe(code);
      expect(error.message, name).toBe(code);
      expect(error.cause, name).toBeUndefined();
      expect(JSON.stringify(error), name).not.toContain('CANARY');
      expect(String(error.stack), name).not.toContain('CANARY');
      void w;
    }
  });

  it('an unknown error is closed too, and a runner-owned refusal passes unchanged', async () => {
    const { run } = setup({ throwOn: { click: 'RangeError' } });
    await expect(run({ kind: 'click' }, null)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    const w = new FakeWorld({}); const page = new FakePage(w);
    const control = w.control();
    const refusal = new ObservedRefusal('CANCELLED', 'CANCELLED', true);
    control.check = () => { throw refusal; };
    await expect(performOnTarget(page, { kind: 'click' }, page.target(), null, control, { profile: LEARN_PROFILE, budget: new ActionBudget(8_000, w.now), maxValueBytes: 4096, readRuleId: null, liveReadRuleId: null, origin: ORIGIN, allowedDomains: ['example.test'], target: GO })).rejects.toBe(refusal);
  });
});

describe('the prepare proof', () => {
  const fact = (role: string, name: string): ObservationFact => ({ role, name, editable: false, nameComplete: true, ownTextComplete: true, evidence: '', evidenceSegments: [] });
  it('is present iff the proposal target is a node, and agrees with the fact', () => {
    expect(assertPrepareProofAgrees(false, undefined, null)).toBeNull();
    expect(() => assertPrepareProofAgrees(false, undefined, GO)).toThrow(ClosedActionError);
    expect(() => assertPrepareProofAgrees(true, fact('button', 'Go'), null)).toThrow(ClosedActionError);
    expect(() => assertPrepareProofAgrees(true, undefined, GO)).toThrow(ClosedActionError);
    expect(() => assertPrepareProofAgrees(true, fact('link', 'Go'), GO)).toThrow(ClosedActionError);
    expect(assertPrepareProofAgrees(true, fact('button', 'Go'), GO)).toEqual(GO);
  });
  it('normalises a disagreeing name to null instead of freezing it', () => {
    expect(assertPrepareProofAgrees(true, fact('button', 'Other'), GO)).toEqual({ ...GO, identity: { role: 'button', name: null } });
  });
  it('keys a target by its content', () => {
    expect(targetKey(GO)).toBe(targetKey(structuredClone(GO)));
    expect(targetKey(GO)).not.toBe(targetKey(NTH));
  });
  it('keys JSONB-restored targets independently of object property order and preserves locator sequence', () => {
    const restored: ResolvedTarget = {
      identity: { name: 'Go', role: 'button' },
      tier: 'nth',
      locator: [{ exact: true, name: 'Go', role: 'button', by: 'role' }, { index: 1, by: 'nth' }],
    };
    expect(targetKey(restored)).toBe(targetKey(NTH));
    expect(targetKey({ ...restored, identity: { name: 'Other', role: 'button' } })).not.toBe(targetKey(NTH));
    expect(targetKey({ ...restored, identity: { name: 'Go', role: 'link' } })).not.toBe(targetKey(NTH));
    expect(targetKey({ ...restored, locator: [...restored.locator].reverse() })).not.toBe(targetKey(NTH));
    expect(targetKey({ ...restored, locator: [{ by: 'role', role: 'button', name: 'Go', exact: true }, { by: 'nth', index: 2 }] })).not.toBe(targetKey(NTH));
  });
});

describe('captured physical identity for all bound actions', () => {
  const kinds = ['click', 'hover', 'check', 'uncheck'] as const;
  it('captured B is refused when current witness is restored A for every bound action', async () => {
    for (const kind of kinds) {
      const { w, run } = setup(); w.captureIds = [22, 11];
      await expect(run({ kind }, null)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
      expect(w.fenced).toBe(false); expect(w.effectedIds).toEqual([]); expect(w.disposedIds.sort()).toEqual([11, 22]);
    }
  });
  it('original A acts once after transient B for every bound action', async () => {
    for (const kind of kinds) {
      const { w, run } = setup(); w.captureIds = [11, 11];
      w.hooks.elementHandle = () => { w.physicalId = w.physicalId === 11 ? 22 : 11; };
      await run({ kind }, null);
      expect(w.fenced).toBe(true); expect(w.effectedIds).toEqual([11]); expect(w.disposedIds).toEqual([11, 11]);
    }
  });
  it('different witness refuses before fence for every bound action', async () => {
    for (const kind of kinds) {
      const { w, run } = setup(); w.captureIds = [11, 22];
      await expect(run({ kind }, null)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
      expect(w.fenced).toBe(false); expect(w.effectedIds).toEqual([]); expect(w.disposedIds.sort()).toEqual([11, 22]);
    }
  });
  it('post-fence replacement never retargets and ends UNKNOWN_OUTCOME for every bound action', async () => {
    for (const kind of kinds) {
      const { w, page, options } = setup(); const control = w.control();
      control.beginInvocation = () => { w.fenced = true; w.b.boundDetached = true; w.physicalId = 22; };
      await expect(performOnTarget(page, { kind }, page.target(), null, control, options())).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
      expect(w.fenced).toBe(true); expect(w.effectedIds).toEqual([]); expect(w.disposedIds).toEqual([11, 11]);
    }
  });
  it('capture witness deadline and cancellation dispose every acquired handle without fencing', async () => {
    for (const kind of kinds) for (const at of [1, 2]) {
      const { w, page, options } = setup(); let checks = 0;
      const control = w.control(); control.check = () => { if (checks >= at) throw new ObservedRefusal('CANCELLED'); };
      w.hooks.elementHandle = () => { checks++; };
      await expect(performOnTarget(page, { kind }, page.target(), null, control, options({ authority: () => { control.check(); } }))).rejects.toBeDefined();
      expect(w.fenced).toBe(false); expect(w.effectedIds).toEqual([]); expect(w.disposedIds).toHaveLength(at);
    }
    const { w, run } = setup();
    await expect(run({ kind: 'click' }, null, { verifyCapturedElement: () => new Promise(() => undefined) })).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.fenced).toBe(false); expect(w.disposedIds).toHaveLength(2);
  });
});

it('hover preflight waits for visibility without a pointer trial', async () => {
  const { w, run } = setup();
  await run({ kind: 'hover' }, null);
  expect(w.before().some(call => call.method === 'waitFor' && call.arg === 'visible')).toBe(true);
  expect(w.log.some(call => call.method === 'hover:trial')).toBe(false);
  expect(w.before().some(call => call.method === 'hover')).toBe(false);
  expect(w.after().filter(call => call.method === 'hover')).toHaveLength(1);
});
it('hover does not require enabled state before its bound invocation', async () => {
  const { w, run } = setup({ enabled: false });
  await run({ kind: 'hover' }, null);
  expect(w.log.some(call => call.method === 'isEnabled')).toBe(false);
  expect(w.effectedIds).toEqual([11]);
});

it('combined child prefix ambiguity refuses with one final target', async () => {
  const target: ResolvedTarget = { locator: [{ by: 'tag', tag: 'section' }, { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'heading', name: 'About', exact: true }] }, { by: 'role', role: 'paragraph' }], tier: 'filterHas', identity: { role: 'paragraph', name: null } };
  const { page, w, budget } = setup();
  // Public locator witnesses deliberately distinguish prefix and final counts.
  const prefix = Object.create(page.target()) as ReturnType<typeof page.target>;
  prefix.count = () => Promise.resolve(2);
  const chain = Object.create(page.target()) as ReturnType<typeof page.target>;
  chain.filter = () => prefix;
  prefix.getByRole = () => page.target();
  page.locator = css => css === 'section' ? chain : page.target();
  const resolution = await resolveTarget(page, target, { origin: ORIGIN, allowedDomains: ['example.test'], budget, profile: LEARN_PROFILE, operation: { kind: 'assert', predicate: 'visible', expected: null } });
  expect(resolution).toEqual({ kind: 'REFUSED', reason: 'TARGET_CHANGED' }); expect(w.fenced).toBe(false);
  expect(w.log.some(c => ['innerText','click','press','fill'].includes(c.method))).toBe(false);
  await expect(performOnTarget(page, { kind: 'click' }, page.target(), null, w.control(), setup().options({ target }))).rejects.toMatchObject({ code: 'POLICY_DENIED' });
});
