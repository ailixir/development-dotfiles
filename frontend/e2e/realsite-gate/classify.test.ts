import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INFRA_SUBCLASSES, classifyLearn, nextAfter } from './classify.ts';
import type { LearnFailureInput } from './classify.ts';

const failed = (over: Partial<LearnFailureInput>): LearnFailureInput => ({
  succeeded: false,
  errorCode: null,
  lastRejectionReason: null,
  startRefusal: null,
  sessionCreated: true,
  ...over,
});

test('MODEL_UNAVAILABLE retains non-timeout infrastructure sub-reasons', () => {
  for (const reason of INFRA_SUBCLASSES.filter((reason) => reason !== 'TIMEOUT')) {
    const c = classifyLearn(failed({ errorCode: 'MODEL_UNAVAILABLE', lastRejectionReason: reason }));
    assert.deepEqual(c, { cls: 'INFRA', subClass: reason });
  }
  assert.deepEqual(classifyLearn(failed({ errorCode: 'MODEL_UNAVAILABLE' })), { cls: 'INFRA', subClass: 'UNSPECIFIED' });
});

test('timing failure and provider timeout precede late success and never permit retry', () => {
  for (const succeeded of [false, true]) {
    for (const timingFailure of ['STEP_LEARNING_TIMEOUT', 'TIMING_EVIDENCE_INVALID']) {
      const classified = classifyLearn(failed({ succeeded, errorCode: 'MODEL_UNAVAILABLE', timingFailure }));
      assert.deepEqual(classified, { cls: 'OTHER', subClass: timingFailure });
      assert.equal(nextAfter([classified.cls]), 'FAIL');
    }
    assert.equal(classifyLearn(failed({ succeeded, errorCode: 'MODEL_UNAVAILABLE', lastRejectionReason: 'TIMEOUT' })).cls, 'OTHER');
  }
});

test('any other errorCode is never infra, whatever the last attempt reason says', () => {
  for (const code of ['MODEL_REFUSED', 'INVALID_CONTRACT', 'DISPATCH_FAILED', 'LOGIN_REQUIRED', 'SOMETHING_NEW']) {
    const c = classifyLearn(failed({ errorCode: code, lastRejectionReason: 'TRANSPORT_STALL' }));
    assert.equal(c.cls, 'OTHER', code);
  }
  for (const code of ['UNSUPPORTED_SURFACE', 'TARGET_MISMATCH', 'MISSING_SOURCE', 'ASSERTION_FAILED', 'BUDGET_EXCEEDED']) {
    assert.deepEqual(classifyLearn(failed({ errorCode: code, lastRejectionReason: 'TRANSPORT_HTTP_429' })), { cls: 'GROUNDING', subClass: code });
  }
});

test('a start refusal is infra only for 429/503 with a MODEL_UNAVAILABLE problem and no session', () => {
  const refused = (status: number, problemCode: string | null) => classifyLearn(failed({ sessionCreated: false, startRefusal: { status, problemCode } }));
  assert.equal(refused(503, 'MODEL_UNAVAILABLE').cls, 'INFRA');
  assert.equal(refused(429, 'MODEL_UNAVAILABLE').cls, 'INFRA');
  assert.equal(refused(500, 'MODEL_UNAVAILABLE').cls, 'OTHER');
  assert.equal(refused(503, null).cls, 'OTHER');
  assert.equal(refused(503, 'VAULT_UNAVAILABLE').cls, 'OTHER');
  assert.equal(refused(400, 'MODEL_UNAVAILABLE').cls, 'OTHER');
  assert.equal(classifyLearn(failed({ sessionCreated: false })).cls, 'OTHER');
});

test('a success is OK', () => {
  assert.deepEqual(classifyLearn(failed({ succeeded: true })), { cls: 'OK', subClass: null });
});

test('at most one infra retry, then INFRA_EXHAUSTED; non-infra failures never retry', () => {
  assert.equal(nextAfter(['OK']), 'DONE');
  assert.equal(nextAfter(['INFRA']), 'RETRY');
  assert.equal(nextAfter(['INFRA', 'OK']), 'DONE');
  assert.equal(nextAfter(['INFRA', 'INFRA']), 'INFRA_EXHAUSTED');
  assert.equal(nextAfter(['GROUNDING']), 'FAIL');
  assert.equal(nextAfter(['OTHER']), 'FAIL');
  assert.equal(nextAfter(['INFRA', 'GROUNDING']), 'FAIL');
  assert.throws(() => nextAfter([]));
});
