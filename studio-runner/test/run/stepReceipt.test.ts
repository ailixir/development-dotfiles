/**
 * SC008-E6 AC2: the receipt a step-finished frame carries agrees with itself and with the step the parent sent. The launcher drops a child
 * whose frame disagrees (protocol.stepReceiptAgrees); this is the rule, tested on its own.
 */
import { describe, expect, it } from 'vitest';

import { stepHashOf } from '../../src/executor/observedReplay.js';
import { stepReceiptAgrees } from '../../src/run/protocol.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { coordinate, operation } from '../helpers/stepFakes.js';

const op = operation("await page.goto('https://app.example.test/');");
const hash = stepHashOf([{ coordinate: coordinate(), guardId: 'g0', operation: op }]);
const receipt = (over: Record<string, unknown> = {}): never => ({ closedCode: null, stepHash: hash, fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false, ...over }) as never;

describe('stepReceiptAgrees', () => {
  it('names a single-operation step by the hash of its operation, and a several-operation step by the list of them', () => {
    expect(hash).toBe(hashObserved(op));
    const second = operation('await page.reload();');
    expect(stepHashOf([{ coordinate: coordinate(), guardId: 'g0', operation: op }, { coordinate: coordinate('step-1', 1), guardId: 'g1', operation: second }])).toBe(hashObserved([op, second]));
  });

  it('accepts a PASS without a code, a FAIL with one, and a SKIPPED step that ran nothing', () => {
    expect(stepReceiptAgrees({ status: 'PASS', receipt: receipt({ fenceCrossed: true, effects: [{ method: 'goto', completed: true }] }) }, hash)).toBe(true);
    expect(stepReceiptAgrees({ status: 'FAIL', receipt: receipt({ closedCode: 'TARGET_DRIFT' }) }, hash)).toBe(true);
    expect(stepReceiptAgrees({ status: 'SKIPPED', receipt: receipt() }, hash)).toBe(true);
  });

  it('rejects a PASS that carries a code and a FAIL that carries none', () => {
    expect(stepReceiptAgrees({ status: 'PASS', receipt: receipt({ closedCode: 'TIMEOUT' }) }, hash)).toBe(false);
    expect(stepReceiptAgrees({ status: 'FAIL', receipt: receipt() }, hash)).toBe(false);
  });

  it('rejects a SKIPPED step that crossed the fence, took an effect or acted offscreen', () => {
    expect(stepReceiptAgrees({ status: 'SKIPPED', receipt: receipt({ fenceCrossed: true }) }, hash)).toBe(false);
    expect(stepReceiptAgrees({ status: 'SKIPPED', receipt: receipt({ effects: [{ method: 'click', completed: true }] }) }, hash)).toBe(false);
    expect(stepReceiptAgrees({ status: 'SKIPPED', receipt: receipt({ offscreen: true }) }, hash)).toBe(false);
  });

  it('rejects a receipt for any other code than the step the parent sent', () => {
    expect(stepReceiptAgrees({ status: 'PASS', receipt: receipt({ stepHash: hashObserved(operation('await page.reload();')) }) }, hash)).toBe(false);
  });
});
