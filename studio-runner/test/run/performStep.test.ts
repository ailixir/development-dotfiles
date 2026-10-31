/**
 * SC008-E6 AC1, AC3, AC4, AC5, AC6: performStep, the one function that runs step code for learning and for every replay, driven through the
 * real runStep against scripted fakes (unit tier, no browser). The fakes are in test/helpers/stepFakes.ts.
 */
import { describe, expect, it } from 'vitest';

import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { admit, newTally, performStep, receiptFromTally } from '../../src/run/observedReplayAdapter.js';
import type { SecretRun, StepRequest } from '../../src/run/observedReplayAdapter.js';
import { createSecrets, secretHandleIds } from '../../src/run/secretStep.js';
import { FakePage, coordinate, must, newRig, openControl, operation } from '../helpers/stepFakes.js';
import type { Rig } from '../helpers/stepFakes.js';

const request = (_rig: Rig, code: string, parts: Partial<StepRequest> & { captures?: string[] } = {}): StepRequest => {
  const { captures, ...rest } = parts;
  return { coordinate: coordinate(), operation: operation(code, captures === undefined ? {} : { captures }), inputs: {}, vars: {}, secretIds: [], control: openControl(), tally: newTally(), allowedDomains: ['*'], ...rest };
};

describe('performStep: the receipt', () => {
  it('runs the frozen code once and reports an argument-free receipt, then invalidates the session because the page may have changed', async () => {
    const rig = newRig();
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#go').click();"));
    expect(outcome.receipt).toEqual({ closedCode: null, stepHash: hashObserved(operation("await page.locator('#go').click();")), fenceCrossed: true, effects: [{ method: 'click', completed: true }], effectsTruncated: false, offscreen: false });
    expect(rig.w.effects).toEqual(['click']);
    expect(rig.session.calls).toContain('invalidate');
  });

  it('leaves the session alone after a step that only read the page', async () => {
    const rig = newRig();
    rig.w.text['#price'] = '$ 12';
    const outcome = await performStep(rig.api, rig.session, request(rig, "const text = await page.locator('#price').innerText();", {}));
    expect(outcome.receipt).toMatchObject({ closedCode: null, fenceCrossed: false, effects: [] });
    expect(rig.session.calls).not.toContain('invalidate');
  });

  it('a missing target is TARGET_DRIFT before the fence with no effect, and the match count of the strict wait', async () => {
    const rig = newRig();
    rig.w.matches['#gone'] = 0;
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#gone').click();"));
    expect(outcome.receipt).toMatchObject({ closedCode: 'TARGET_DRIFT', fenceCrossed: false, effects: [] });
    expect(outcome.matchCount).toBe(0);
    expect(rig.w.effects).toEqual([]);
    const several = newRig();
    several.w.matches['.row'] = 3;
    expect((await performStep(several.api, several.session, request(several, "await page.locator('.row').click();"))).receipt).toMatchObject({ closedCode: 'TARGET_DRIFT', fenceCrossed: false });
  });

  it('a failing expect is ASSERTION_FAILED', async () => {
    const rig = newRig();
    const outcome = await performStep(rig.api, rig.session, request(rig, "await expect(page.locator('#t')).toHaveText('x');"));
    expect(outcome.receipt.closedCode).toBe('ASSERTION_FAILED');
  });

  it('receiptFromTally reports what the binding recorded for a run a deadline abandoned', () => {
    const tally = newTally();
    tally.fenceCrossed = true;
    tally.effects.push({ method: 'click', completed: false });
    expect(receiptFromTally(operation('x'), tally, 'OUTCOME_UNKNOWN')).toEqual({ closedCode: 'OUTCOME_UNKNOWN', stepHash: hashObserved(operation('x')), fenceCrossed: true, effects: [{ method: 'click', completed: false }], effectsTruncated: false, offscreen: false });
  });
});

describe('performStep: values', () => {
  it('commits only the declared captures, as non-empty strings of at most 4096 bytes', async () => {
    const rig = newRig();
    rig.w.text['#price'] = ' $ 12 ';
    const ok = await performStep(rig.api, rig.session, request(rig, "vars['b1'] = await page.locator('#price').innerText(); vars['stray'] = 'x';", { captures: ['b1'] }));
    expect(ok.captured).toEqual({ b1: ' $ 12 ' });
    const missing = await performStep(rig.api, rig.session, request(rig, 'const x = 1;', { captures: ['b1'] }));
    expect(missing.receipt.closedCode).toBe('READ_REFUSED');
    expect(missing.captured).toEqual({});
    rig.w.text['#price'] = '   ';
    expect((await performStep(rig.api, rig.session, request(rig, "vars['b1'] = await page.locator('#price').innerText();", { captures: ['b1'] }))).receipt.closedCode).toBe('READ_REFUSED');
    rig.w.text['#price'] = 'x'.repeat(4097);
    expect((await performStep(rig.api, rig.session, request(rig, "vars['b1'] = await page.locator('#price').innerText();", { captures: ['b1'] }))).receipt.closedCode).toBe('READ_REFUSED');
  });

  it('gives the step its inputs and its vars and nothing else', async () => {
    const rig = newRig();
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#f').fill(inputs['in-1'] + ':' + vars['b1']);", { inputs: { 'in-1': 'hello' }, vars: { b1: 'seen' } }));
    expect(outcome.receipt.closedCode).toBeNull();
    expect(rig.w.log).toContain('fill:hello:seen');
    const absent = await performStep(rig.api, rig.session, request(rig, "await page.locator('#f').fill(inputs['other'].trim());", { inputs: { 'in-1': 'hello' } }));
    expect(absent.receipt.closedCode).not.toBeNull();
  });
});

describe('performStep: until the fence (learning prepare)', () => {
  it('stops at the first effectful call with no effect and no fence, and reports the fence reached', async () => {
    const rig = newRig();
    const control = openControl();
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#go').click();", { control, untilFence: true }));
    expect(outcome.fenceReached).toBe(true);
    expect(outcome.receipt).toMatchObject({ closedCode: null, fenceCrossed: false, effects: [] });
    expect(rig.w.effects).toEqual([]);
    expect(control.fenced()).toBe(0);
    expect(rig.session.calls).not.toContain('invalidate');
  });

  it('refuses a locator with no match before the fence, with the count', async () => {
    const rig = newRig();
    rig.w.matches['#gone'] = 0;
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#gone').click();", { untilFence: true }));
    expect(outcome.receipt.closedCode).toBe('TARGET_DRIFT');
    expect(outcome.matchCount).toBe(0);
  });

  it('a call carrying a secret handle is the fence: no value read, the hook never called', async () => {
    const rig = newRig();
    let hookCalls = 0;
    const secrets: SecretRun = { handles: createSecrets, beforeCall: call => { if (secretHandleIds(call.args).length > 0) hookCalls++; return undefined; } };
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#pw').fill(secrets['PW']);", { secretIds: ['PW'], secrets, untilFence: true }));
    expect(outcome.fenceReached).toBe(true);
    expect(outcome.receipt).toMatchObject({ closedCode: null, fenceCrossed: false, effects: [] });
    expect(hookCalls).toBe(0);
    expect(rig.w.effects).toEqual([]);
  });
});

describe('performStep: a secret goes to the run page only', () => {
  it('refuses a handle used on a locator of an adopted popup before any effect', async () => {
    const rig = newRig();
    const popup = new FakePage(rig.w, 'https://app.example.test/popup');
    popup.ctx = rig.context;
    rig.w.popup = popup;
    let hookCalls = 0;
    const secrets: SecretRun = { handles: createSecrets, beforeCall: call => { if (secretHandleIds(call.args).length > 0) hookCalls++; return undefined; } };
    const outcome = await performStep(rig.api, rig.session, request(rig, "const p = await page.waitForEvent('popup'); await p.locator('#pw').fill(secrets['PW']);", { secretIds: ['PW'], secrets }));
    expect(outcome.receipt.closedCode).toBe('POLICY_REFUSED');
    expect(hookCalls).toBe(0);
    expect(rig.w.effects).toEqual([]);
  });
});

describe('performStep: popups', () => {
  it('adopts an awaited popup, reports the step as offscreen when it acts there, and keeps the page open for later steps', async () => {
    const rig = newRig();
    const popup = new FakePage(rig.w, 'https://app.example.test/popup');
    popup.ctx = rig.context;
    rig.w.popup = popup;
    const outcome = await performStep(rig.api, rig.session, request(rig, "const p = await page.waitForEvent('popup'); await p.locator('#ok').click();"));
    expect(outcome.receipt).toMatchObject({ closedCode: null, offscreen: true });
    expect(popup.closed).toBe(false);
    expect(rig.pages.openAdopted()).toEqual([popup]);
    const second = await performStep(rig.api, rig.session, request(rig, "await page.locator('#go').click();"));
    expect(second.receipt.offscreen).toBe(false);
  });

  it('closes a page the step opened and did not adopt when the step ends, and closes it at once outside a step', async () => {
    const rig = newRig();
    const stray = new FakePage(rig.w, 'https://app.example.test/stray');
    rig.pages.begin();
    rig.pages.opened(stray);
    expect(stray.closed).toBe(false);
    await rig.pages.end();
    expect(stray.closed).toBe(true);
    const late = new FakePage(rig.w);
    rig.pages.opened(late);
    await Promise.resolve();
    expect(late.closed).toBe(true);
  });

  it('caps the adopted pages that are still open across the whole run: 3 then 2 refuses the fifth, and a closed page frees its slot', () => {
    const rig = newRig();
    const make = (): FakePage => new FakePage(rig.w, 'https://app.example.test/p');
    const first = [make(), make(), make()];
    rig.pages.begin(); for (const page of first) rig.pages.adopt(page); void rig.pages.end();
    const second = [make(), make()];
    rig.pages.begin();
    rig.pages.adopt(must(second[0]));
    expect(() => { rig.pages.adopt(must(second[1])); }).toThrow('POLICY_REFUSED');
    expect((must(second[1])).closed).toBe(true);
    expect(rig.pages.openAdopted()).toHaveLength(4);
    (must(first[0])).closed = true;
    expect(rig.pages.openAdopted()).toHaveLength(3);
    const third = make();
    rig.pages.adopt(third);
    expect(rig.pages.openAdopted()).toHaveLength(4);
    expect(rig.pages.sawOtherPage).toBe(false);
  });
});

describe('performStep: domain policy', () => {
  it('refuses a main frame that ended off the list after the code ran (POLICY_REFUSED)', async () => {
    const rig = newRig();
    rig.w.offList = 'off.example';
    const outcome = await performStep(rig.api, rig.session, request(rig, "await page.locator('#link').click();", { allowedDomains: ['app.example.test'] }));
    expect(outcome.receipt.closedCode).toBe('POLICY_REFUSED');
    expect(outcome.receipt.fenceCrossed).toBe(true);
  });

  it('refuses goto to an off-list host before any request, and allows it under allow-all', async () => {
    const rig = newRig();
    const refused = await performStep(rig.api, rig.session, request(rig, "await page.goto('https://off.example/');", { allowedDomains: ['app.example.test'] }));
    expect(refused.receipt).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false });
    expect(rig.w.effects).toEqual([]);
    const open = newRig();
    expect((await performStep(open.api, open.session, request(open, "await page.goto('https://off.example/');", { allowedDomains: ['*'] }))).receipt.closedCode).toBeNull();
    const credentials = newRig();
    expect((await performStep(credentials.api, credentials.session, request(credentials, "await page.goto('https://user:pw@off.example/');", { allowedDomains: ['*'] }))).receipt.closedCode).toBe('POLICY_REFUSED');
  });
});

describe('admit', () => {
  it('refuses a tampered hash and a syntax error with the model line and column, without a browser', () => {
    const good = operation("await page.goto('https://app.example.test/');");
    expect(admit(coordinate(), good)).toEqual({ ok: true });
    const tampered = { ...good, code: good.code + ' ' };
    expect(admit(coordinate(), tampered)).toMatchObject({ ok: false, reason: 'SOURCE_HASH_MISMATCH' });
    const broken = operation('await page.goto(;');
    const verdict = admit(coordinate(), broken);
    expect(verdict).toMatchObject({ ok: false, reason: 'STEP_SYNTAX' });
    if (!verdict.ok && verdict.reason === 'STEP_SYNTAX') expect(verdict.syntax?.line).toBeGreaterThanOrEqual(1);
  });
});
