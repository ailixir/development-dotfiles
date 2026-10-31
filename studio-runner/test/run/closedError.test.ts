import { describe, expect, it } from 'vitest';
import { ClosedActionError, closeObservationError, closePlaywrightError, closedPageStep, closedReason, closedCause, pageLeftUnderObservation, closed, CLOSED_ACTION_CODES, detachedObservationState } from '../../src/run/closedError.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { OriginNotAllowed } from '../../src/allowedDomains.js';

const CANARY = 'CANARY-PAGE-TEXT-7731 <div data-note="CANARY-ATTR"> value=CANARY-VALUE-5521';
const timeout = (): Error => Object.assign(new Error(`locator.click: Timeout 800ms exceeded.\nCall log:\n  - ${CANARY}`), { name: 'TimeoutError' });
const bare = (error: Error): void => {
  expect(error).toBeInstanceOf(ClosedActionError);
  expect(error.message).toBe((error as ClosedActionError).code);
  expect(error.cause).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain('CANARY');
  expect(String(error.stack)).not.toContain('CANARY');
  expect(CLOSED_ACTION_CODES).toContain((error as ClosedActionError).code);
};

describe('the closed error boundary', () => {
  it('recognizes loss of a private observation handle without returning incoming error text', () => {
    expect(detachedObservationState(new Error(`Protocol error: Could not find object with given id ${CANARY}`))).toBe(true);
    expect(detachedObservationState(new Error(`Execution context was destroyed ${CANARY}`))).toBe(true);
    expect(detachedObservationState(new Error(CANARY))).toBe(false);
    expect(detachedObservationState({ message: 'Could not find object with given id' })).toBe(false);
  });
  it('a Playwright-shaped TimeoutError carrying a canary becomes a bare closed code', () => {
    const before = closePlaywrightError(timeout(), 'preFence');
    bare(before); expect((before as ClosedActionError).code).toBe('TARGET_CHANGED');
    const after = closePlaywrightError(timeout(), 'postFence');
    bare(after); expect((after as ClosedActionError).code).toBe('UNKNOWN_OUTCOME');
  });

  it('an Error whose message carries a canary is replaced by a closed code', () => {
    bare(closePlaywrightError(new Error(CANARY), 'preFence'));
    bare(closePlaywrightError(new TypeError(CANARY), 'postFence'));
    const own = closePlaywrightError(new Error('POLICY_DENIED'), 'postFence');
    bare(own); expect((own as ClosedActionError).code).toBe('POLICY_DENIED');
    // A message that merely contains a closed code is text, not a code.
    expect((closePlaywrightError(new Error('POLICY_DENIED and CANARY'), 'preFence') as ClosedActionError).code).toBe('TARGET_CHANGED');
  });

  it('a non-Error throw and a cause chain leave no text', () => {
    bare(closePlaywrightError(CANARY, 'preFence'));
    bare(closePlaywrightError({ message: CANARY, name: 'TimeoutError' }, 'postFence'));
    bare(closePlaywrightError(null, 'postFence'));
    const chained = new Error('outer', { cause: new Error(CANARY) });
    const result = closePlaywrightError(chained, 'postFence');
    bare(result);
    expect(JSON.stringify(result, Object.getOwnPropertyNames(result))).not.toContain('CANARY');
  });

  it('a closed-target error is CONTEXT_LOST without its text', () => {
    const error = closePlaywrightError(new Error(`page.click: Target page, context or browser has been closed ${CANARY}`), 'postFence');
    bare(error); expect((error as ClosedActionError).code).toBe('CONTEXT_LOST');
  });

  it('an ObservedRefusal from control.check passes the boundary unchanged', () => {
    for (const code of ['TIMEOUT', 'CANCELLED', 'OUTCOME_UNKNOWN'] as const) {
      const refusal = new ObservedRefusal(code, code, true);
      expect(closePlaywrightError(refusal, 'preFence')).toBe(refusal);
      expect(closePlaywrightError(refusal, 'postFence')).toBe(refusal);
    }
    const origin = new OriginNotAllowed('evil.example');
    expect(closePlaywrightError(origin, 'preFence')).toBe(origin);
  });

  it('closedReason keeps only a closed code and never the message', () => {
    expect(closedReason(new ClosedActionError('TARGET_CHANGED'))).toBe('TARGET_CHANGED');
    expect(closedReason(new Error('READ_REFUSED'))).toBe('READ_REFUSED');
    expect(closedReason(new Error(CANARY))).toBe('OUTCOME_UNKNOWN');
    expect(closedReason('CANARY')).toBe('OUTCOME_UNKNOWN');
  });

  it('closed() rethrows only closed errors with the phase it is asked for', async () => {
    const state = { fenced: false };
    await expect(closed(() => (state.fenced ? 'postFence' : 'preFence'), () => Promise.reject(timeout()))).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    state.fenced = true;
    await expect(closed(() => (state.fenced ? 'postFence' : 'preFence'), () => Promise.reject(timeout()))).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    await expect(closed(() => 'preFence', () => Promise.resolve(7))).resolves.toBe(7);
  });
});

describe('closeObservationError', () => {
  it('lets runner-owned closed errors pass as themselves', () => {
    const own = new ClosedActionError('OBSERVATION_DEADLINE');
    expect(closeObservationError(own)).toEqual({ error: own, perceptionUnavailable: false });
    const origin = new OriginNotAllowed('other.example');
    expect(closeObservationError(origin).error).toBe(origin);
  });

  it.each(['INVALID_UNICODE', 'SCOPE_DENIED', 'BUDGET_EXCEEDED', 'STALE_OBSERVATION', 'CONTEXT_LOST'])('keeps the closed observation code %s', code => {
    const mapped = closeObservationError(new Error(code));
    bare(mapped.error);
    expect(mapped.error.message).toBe(code);
    expect(mapped.perceptionUnavailable).toBe(false);
  });

  it('maps PRIVATE_INVENTORY_LIMIT to the deadline refusal and reports a perception failure for the caller to decide', () => {
    expect(closeObservationError(new Error('PRIVATE_INVENTORY_LIMIT')).error.message).toBe('OBSERVATION_DEADLINE');
    const perception = closeObservationError(new Error('PERCEPTION_UNAVAILABLE'));
    expect(perception.error.message).toBe('OBSERVATION_UNAVAILABLE');
    expect(perception.perceptionUnavailable).toBe(true);
  });

  it('turns anything else into OBSERVATION_UNAVAILABLE and never copies the incoming text', () => {
    for (const thrown of [new Error(CANARY), timeout(), 'CANARY-STRING', null, undefined, { message: CANARY }]) {
      const mapped = closeObservationError(thrown);
      bare(mapped.error);
      expect(mapped.error.message).toBe('OBSERVATION_UNAVAILABLE');
      expect(mapped.perceptionUnavailable).toBe(false);
    }
  });
});

describe('closedPageStep', () => {
  const leak = async (message: string, name = 'Error'): Promise<Error> => {
    const error = Object.assign(new Error(message), { name });
    return closedPageStep(() => Promise.reject(error)).then(() => new Error('resolved'), (e: unknown) => e as Error);
  };

  it('closes raw Playwright and CDP messages: no input text survives', async () => {
    const wait = await leak('page.waitForLoadState: Timeout 300ms exceeded.', 'TimeoutError');
    const cdp = await leak('cdpSession.send: Protocol error (Runtime.callFunctionOn): Cannot find context with specified id');
    const gone = await leak('Target page, context or browser has been closed');
    expect(wait.message).toBe('UNKNOWN_OUTCOME');
    expect(cdp.message).toBe('UNKNOWN_OUTCOME');
    expect(gone.message).toBe('CONTEXT_LOST');
  });

  it('lets the step\'s own closed codes and replay reasons pass unchanged', async () => {
    for (const code of ['TARGET_DRIFT', 'TARGET_CHANGED', 'POLICY_DENIED', 'CANCELLED', 'TIMEOUT']) expect((await leak(code)).message).toBe(code);
  });
});

describe('closedCause (SC008-FIX-19)', () => {
  it('names a closed error, a plain Error that carries a closed code, and nothing else', () => {
    expect(closedCause(new ClosedActionError('STALE_OBSERVATION'))).toBe('STALE_OBSERVATION');
    expect(closedCause(new Error('BUDGET_EXCEEDED'))).toBe('BUDGET_EXCEEDED');
    expect(closedCause(new Error('TARGET_DRIFT'))).toBe('TARGET_DRIFT');
    for (const thrown of [new Error('CANARY-TEXT'), Object.assign(new Error('CONTEXT_LOST'), { name: 'TimeoutError' }), 'CONTEXT_LOST', null, undefined, { message: 'CONTEXT_LOST' }]) expect(closedCause(thrown)).toBe('UNKNOWN');
  });
});

describe('pageLeftUnderObservation (SC008-FIX-19)', () => {
  it('is true for a protocol error that says the document went away, false for anything else', () => {
    for (const text of ['Protocol error (Runtime.callFunctionOn): Cannot find context with specified id', 'Protocol error (Runtime.callFunctionOn): Inspected target navigated or closed', 'Execution context was destroyed, most likely because of a navigation']) expect(pageLeftUnderObservation(new Error(text)), text).toBe(true);
    for (const thrown of [new Error('PERCEPTION_UNAVAILABLE'), new Error('Timeout 30000ms exceeded'), 'Inspected target navigated or closed', null, undefined]) expect(pageLeftUnderObservation(thrown)).toBe(false);
  });
});
