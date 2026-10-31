/* eslint-disable @typescript-eslint/require-await -- fakes: every real Playwright method is async. */
/**
 * SC008-E6 AC2: the replay of frozen step code. executeObservedReplay runs each step through the real adapter, performStep and runStep against
 * scripted fakes (unit tier, no browser): receipts, values captured by one step and read by the next, no observation on the success path.
 */
import { describe, expect, it } from 'vitest';

import { executeObservedReplay, replayError } from '../../src/executor/observedReplay.js';
import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import type { StepFinishedEvent, StepReporter } from '../../src/executor/stepReporter.js';
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { SecretUseEvidence } from '../../src/run/secretUse.js';
import { fakeHandle, newRig, operation } from '../helpers/stepFakes.js';
import type { Rig } from '../helpers/stepFakes.js';

const ORIGIN = 'https://app.example.test';
const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['step'], initialContext: { kind: 'initialBlank' } };
const STEPS = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'] as const;
const UUID = '00000000-0000-4000-8000-0000000000a0';

type Operation = Execute3['steps'][number]['operations'][number]['operation'];
interface Plan { readonly code: string; readonly captures?: string[]; readonly uses?: Operation['uses'][number][]; readonly origin?: string | null }

function execute(plans: readonly Plan[], extra: Partial<Pick<Execute3, 'inputs' | 'secrets' | 'secretOrigins'>> = {}): Execute3 {
  const operations = plans.map((plan, i) => ({ coordinate: { stepId: STEPS[i] as string, ordinal: 0 }, guardId: `g${String(i)}`, operation: operation(plan.code, { ...(plan.captures ? { captures: plan.captures } : {}), ...(plan.uses ? { uses: plan.uses } : {}) }) }));
  const bindings = plans.flatMap((plan, i) => (plan.captures ?? []).map(bindingId => ({ bindingId, producer: { stepId: STEPS[i] as string, ordinal: 0 }, origin: ORIGIN })));
  const transfers = plans.flatMap((plan, i) => (plan.uses ?? []).flatMap(use => use.kind === 'binding' ? [{ bindingId: use.id, producer: bindings.find(b => b.bindingId === use.id)?.producer as { stepId: string; ordinal: number }, consumer: { stepId: STEPS[i] as string, ordinal: 0 }, origin: ORIGIN }] : []));
  return {
    kind: 'execute', protocolVersion: 3, mode: 'observed', runId: UUID, attemptId: UUID, profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: 'c'.repeat(64), waitStrategy: 'domcontentloaded', stepTimeoutMs: 10_000,
    steps: operations.map((operationEntry, stepIndex) => ({ stepIndex, stepId: STEPS[stepIndex] as string, operations: [operationEntry] })),
    guards: plans.map((plan, i) => ({ guardId: `g${String(i)}`, origin: plan.origin === undefined ? (i === 0 ? null : ORIGIN) : plan.origin })),
    bindings, transfers, inputs: extra.inputs ?? [], secrets: extra.secrets ?? {}, secretOrigins: extra.secretOrigins ?? {},
  };
}

async function run(message: Execute3, rig: Rig): Promise<{ result: Awaited<ReturnType<typeof executeObservedReplay>>; finished: StepFinishedEvent[] }> {
  const finished: StepFinishedEvent[] = [];
  const reporter: StepReporter = { stepStarted: () => undefined, stepFinished: event => { finished.push(event); } };
  const adapter = createObservedReplayAdapter(fakeHandle(rig), SCOPE, ['*'], 'run-1', () => undefined);
  const result = await executeObservedReplay(message, adapter, SCOPE, ['*'], { now: () => performance.now() }, reporter, new AbortController().signal, undefined, new SecretUseEvidence([]));
  return { result, finished };
}

describe('replay of frozen step code', () => {
  it('passes every step, reports a receipt with the hash of its operation, and observes nothing', async () => {
    const rig = newRig('about:blank');
    rig.w.text['#price'] = '$ 12';
    const message = execute([
      { code: "await page.goto('https://app.example.test/start');" },
      { code: "vars['b1'] = await page.locator('#price').innerText();", captures: ['b1'] },
      { code: "await page.locator('#f').fill(vars['b1']);", uses: [{ kind: 'binding', id: 'b1' }] },
    ]);
    const { result, finished } = await run(message, rig);
    expect(result).toMatchObject({ ok: true, errorCode: null });
    expect(finished.map(event => event.status)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(finished.map(event => event.receipt?.stepHash)).toEqual(message.steps.map(step => hashObserved(step.operations[0]?.operation)));
    expect(finished[0]?.receipt).toMatchObject({ closedCode: null, fenceCrossed: true, effects: [{ method: 'goto', completed: true }], offscreen: false });
    expect(finished[1]?.receipt).toMatchObject({ fenceCrossed: false, effects: [] });
    expect(rig.w.log).toContain('fill:$ 12');
    expect(rig.session.calls).not.toContain('observe');
    expect(rig.session.captures).toEqual(['$ 12']);
  });

  it('delivers the value captured in this run: a second run against a page with another value never sees the first', async () => {
    const plans: Plan[] = [
      { code: "await page.goto('https://app.example.test/start');" },
      { code: "vars['b1'] = await page.locator('#price').innerText();", captures: ['b1'] },
      { code: "await page.locator('#f').fill(vars['b1']);", uses: [{ kind: 'binding', id: 'b1' }] },
    ];
    const first = newRig('about:blank'); first.w.text['#price'] = 'FIRST-VALUE';
    await run(execute(plans), first);
    const second = newRig('about:blank'); second.w.text['#price'] = 'SECOND-VALUE';
    const { finished } = await run(execute(plans), second);
    expect(second.w.log).toContain('fill:SECOND-VALUE');
    expect(second.w.log.join('\n')).not.toContain('FIRST-VALUE');
    expect(JSON.stringify(finished)).not.toContain('FIRST-VALUE');
    expect(JSON.stringify(finished)).not.toContain('SECOND-VALUE');
  });

  it('a missing target is TARGET_DRIFT before the fence with no effect, and the steps after it are skipped with a receipt that ran nothing', async () => {
    const rig = newRig('about:blank');
    rig.w.matches['#gone'] = 0;
    const message = execute([
      { code: "await page.goto('https://app.example.test/start');" },
      { code: "await page.locator('#gone').click();" },
      { code: "await page.locator('#ok').click();" },
    ]);
    const { result, finished } = await run(message, rig);
    expect(result).toMatchObject({ ok: false, errorCode: 'TARGET_DRIFT' });
    expect(finished.map(event => event.status)).toEqual(['PASS', 'FAIL', 'SKIPPED']);
    expect(finished[1]?.receipt).toMatchObject({ closedCode: 'TARGET_DRIFT', fenceCrossed: false, effects: [] });
    expect(finished[2]?.receipt).toEqual({ closedCode: null, stepHash: hashObserved(message.steps[2]?.operations[0]?.operation), fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false });
    expect(rig.w.effects).toEqual(['goto']);
  });

  it('a failure after the fence is OUTCOME_UNKNOWN and keeps the effect in the receipt', async () => {
    const rig = newRig('about:blank');
    rig.w.failClick = true;
    const message = execute([{ code: "await page.goto('https://app.example.test/start');" }, { code: "await page.locator('#go').click();" }]);
    const { result, finished } = await run(message, rig);
    expect(result.errorCode).toBe('OUTCOME_UNKNOWN');
    expect(finished[1]?.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true, effects: [{ method: 'click', completed: false }] });
    expect(JSON.stringify(finished)).not.toContain('CANARY-TEXT');
  });

  it('refuses a capture over 4096 bytes as READ_REFUSED', async () => {
    const rig = newRig('about:blank');
    rig.w.text['#price'] = 'x'.repeat(4097);
    const message = execute([{ code: "await page.goto('https://app.example.test/start');" }, { code: "vars['b1'] = await page.locator('#price').innerText();", captures: ['b1'] }, { code: "await page.locator('#f').fill(vars['b1']);", uses: [{ kind: 'binding', id: 'b1' }] }]);
    const { result } = await run(message, rig);
    expect(result.errorCode).toBe('READ_REFUSED');
  });

  it('refuses a step whose code no longer matches its hash before anything runs', async () => {
    const rig = newRig('about:blank');
    const message = execute([{ code: "await page.goto('https://app.example.test/start');" }]);
    const op = message.steps[0]?.operations[0];
    if (op) (op.operation as { code: string }).code += ' ';
    await expect(run(message, rig)).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
    expect(rig.w.effects).toEqual([]);
  });

  it('annotates a failed step as LOGIN_REQUIRED when the page shows a login form and the step used no secret', async () => {
    const rig = newRig('about:blank', {
      observe: async () => ({ observation: { coverage: { passwordControls: 1 }, facts: { e1: { role: 'button' } }, documentId: 'd', generation: 1, origin: ORIGIN }, json: '{}', bytes: 2, observationHash: 'h'.repeat(64) } as never),
    });
    rig.w.matches['#gone'] = 0;
    const message = execute([{ code: "await page.goto('https://app.example.test/start');" }, { code: "await page.locator('#gone').click();" }]);
    const { result } = await run(message, rig);
    expect(result.errorCode).toBe('LOGIN_REQUIRED');
  });

  it('maps only closed codes: an unknown error is INTERNAL_ERROR', () => {
    expect(replayError(new Error('Timeout 30000ms exceeded. CANARY-TEXT'))).toBe('INTERNAL_ERROR');
  });
});
