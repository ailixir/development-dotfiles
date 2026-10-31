import { ALL_DOMAINS } from '../src/allowedDomains.js';
import { TEST_DOMAINS } from './helpers/allowedDomains.js';
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import type { Execute3, Scope } from '../src/executor/observedOperations.js';
import { executeObservedReplay, replayWithheldLiterals, validateObservedExecute, ObservedInvocationControl } from '../src/executor/observedReplay.js';
import { hashObserved, OBSERVED_PROFILE } from '../src/validator/observedReferencePolicy.js';
import type { StepFinishedEvent } from '../src/executor/stepReporter.js';
import { scriptedAdapter, stepOp, stepResult } from './helpers/stepCode.js';
const scope = { principalId: 'fresh-user', ...fixture.artifact.replayPolicy.scope } as Scope;
function frame(): Execute3 { return { kind: 'execute', protocolVersion: 3, mode: 'observed', runId: '00000000-0000-4000-8000-000000000020', attemptId: '00000000-0000-4000-8000-000000000021', profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: fixture.artifact.configurationHash, waitStrategy: 'domcontentloaded', stepTimeoutMs: 1000, steps: fixture.artifact.steps, guards: fixture.artifact.guards, bindings: fixture.artifact.replayPolicy.bindings.map(b => ({ bindingId: b.bindingId, producer: b.producer, origin: b.sourceOrigin })), transfers: fixture.artifact.replayPolicy.transfers, inputs: fixture.artifact.inputRecipes.map(i => ({ inputId: i.inputId, stepId: i.stepId, kind: i.kind, value: i.kind === 'destination' ? 'https://orders.example.test/start' : 'label' })), secrets: {}, secretOrigins: {} } as Execute3; }
const run = (m: Execute3, perform: Parameters<typeof scriptedAdapter>[0], events: StepFinishedEvent[] = [], now: () => number = () => 1, signal: AbortSignal = new AbortController().signal, withheld: string[] = []) =>
    executeObservedReplay(m, scriptedAdapter(perform, withheld), scope, TEST_DOMAINS, { now }, { stepStarted() { return; }, stepFinished(e) { events.push(e); } }, signal);
describe('private source-free replay graph', () => {
    it('carries a successful capture to the next step as a variable, and commits it to the withholding mask, not to the report', async () => {
        const seen: Record<string, string>[] = [], withheld: string[] = [], events: StepFinishedEvent[] = [], fresh = 'fresh private typed capture';
        const result = await run(frame(), (action, _guard, io, control) => {
            control.beginInvocation();
            seen.push({ ...io.vars });
            const id = action.operation.captures[0];
            return Promise.resolve(stepResult(action, id === undefined ? {} : { [id]: fresh }));
        }, events, () => 1, undefined, withheld);
        expect(result.ok).toBe(true);
        expect(seen.some(vars => vars['binding-reference'] === fresh)).toBe(true);
        expect(withheld).toContain(fresh);
        expect(JSON.stringify(events)).not.toContain(fresh);
    });
    it('withholds the configured literals of a frame, and no other', () => {
        const inputs = [
            { inputId: 'typed', stepId: 's', kind: 'nonsecretText', value: 'incorrectUser' },
            { inputId: 'expected', stepId: 's', kind: 'nonsecretText', value: 'Test login' },
            { inputId: 'configured', stepId: 's', kind: 'nonsecretText', value: 'Configured' },
        ] as Execute3['inputs'];
        const recipes = [{ inputId: 'configured', provenance: { kind: 'configuration' } }];
        expect(replayWithheldLiterals(inputs, recipes)).toEqual(['configured']);
    });
    it('captures fresh private values twice with unchanged IR, never reporting them', async () => {
        const m = frame(), original = JSON.stringify(m);
        for (const fresh of ['first-value-42', 'second-value-73']) {
            const consumed: string[] = [], events: StepFinishedEvent[] = [], withheld: string[] = [];
            const result = await run(m, (a, _g, io, control) => {
                control.beginInvocation();
                const id = a.operation.captures[0];
                if (a.operation.uses.some(use => use.kind === 'binding')) consumed.push(io.vars['binding-reference'] ?? '');
                return Promise.resolve(stepResult(a, id === undefined ? {} : { [id]: fresh }));
            }, events, () => 1, undefined, withheld);
            expect(result).toEqual({ ok: true, errorCode: null, secretUse: {} });
            expect(consumed).toEqual([fresh, fresh]);
            expect(withheld).toContain(fresh);
            expect(JSON.stringify(events)).not.toContain(fresh);
        }
        expect(JSON.stringify(m)).toBe(original);
    });
    it('stops on a failed producer and reports truly unexecuted steps with null timings', async () => {
        const events: StepFinishedEvent[] = [];
        let calls = 0;
        const result = await run(frame(), (a, _g, _io, control) => {
            control.beginInvocation();
            calls++;
            if (a.operation.captures.length > 0) return Promise.reject(Error('CANARY'));
            return Promise.resolve(stepResult(a));
        }, events);
        expect(result.ok).toBe(false);
        expect(calls).toBe(2);
        expect(events[2]).toMatchObject({ status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
        expect(JSON.stringify(events)).not.toContain('CANARY');
    });
    it.each(['wrong-origin', 'future-producer', 'duplicate-edge', 'missing-binding', 'historic-value', 'source', 'retired-kind'])('refuses %s before invocation', mutation => {
        const m = structuredClone(frame()) as unknown as Record<string, unknown>;
        const t = m.transfers as Record<string, unknown>[], bindings = m.bindings as Record<string, unknown>[];
        if (mutation === 'wrong-origin')
            required(t[0]).origin = 'https://elsewhere.test';
        if (mutation === 'future-producer')
            required(t[0]).producer = required(t[0]).consumer;
        if (mutation === 'duplicate-edge')
            t.push(required(t[0]));
        if (mutation === 'missing-binding')
            m.bindings = [];
        if (mutation === 'historic-value')
            required(bindings[0]).value = 'SAMPLED';
        if (mutation === 'source')
            m.source = 'execute arbitrary';
        if (mutation === 'retired-kind')
            m.steps = [{ stepIndex: 0, stepId: required(fixture.artifact.steps[0]).stepId, operations: [{ coordinate: { stepId: required(fixture.artifact.steps[0]).stepId, ordinal: 0 }, guardId: 'g0', operation: { kind: 'click' } }] }];
        expect(() => validateObservedExecute(m, scope, TEST_DOMAINS)).toThrow();
    });
    it('admits step code that calls evaluate: the evaluation ban of the typed executor no longer exists', () => {
        const m = structuredClone(frame());
        const first = required(m.steps[0]?.operations[0]);
        (first as { operation: unknown }).operation = stepOp('await page.evaluate(() => document.title);');
        expect(() => validateObservedExecute(m, scope, TEST_DOMAINS)).not.toThrow();
    });
});
describe('the runner whitelist is the only origin authority of a replay frame', () => {
    it('accepts the sealed fixture frame under a list that holds its host, and refuses it (POLICY_REFUSED) under any other list, even the empty one', () => {
        const m = frame();
        expect(() => validateObservedExecute(m, scope, TEST_DOMAINS)).not.toThrow();
        expect(() => validateObservedExecute(m, scope, ['orders.example.test'])).not.toThrow();
        for (const list of [[], ['other.example'], ['example.com']] as const)
            expect(() => validateObservedExecute(m, scope, list), list.join(',')).toThrow('POLICY_REFUSED');
    });
    it('checks an authored destination by host, so a sub-domain the artifact never named loads and a look-alike does not', () => {
        for (const [destination, accepted] of [['https://x.orders.example.test/next', true], ['https://orders.example.test.evil.test/next', false], ['https://evilorders.example.test/next', false], ['https://user@orders.example.test/', false]] as const) {
            const m = frame();
            const input = m.inputs.find(i => i.kind === 'destination');
            if (!input || input.kind === 'secretRef')
                continue;
            (input as { value: string }).value = destination;
            const attempt = () => validateObservedExecute(m, scope, ['orders.example.test']);
            if (accepted)
                expect(attempt, destination).not.toThrow();
            else
                expect(attempt, destination).toThrow('POLICY_REFUSED');
        }
    });
});
describe('allow-all (STUDIO_RUNNER_ALLOW_ALL_DOMAINS) in a replay frame', () => {
    it('accepts the sealed fixture frame whatever the origin pins name, with the configured list ignored', () => {
        expect(() => validateObservedExecute(frame(), scope, ALL_DOMAINS)).not.toThrow();
    });
    it('still pins every transfer to the origin it was learned on: a mismatching origin is refused by the frame, not by the list', () => {
        const m = structuredClone(frame()) as unknown as Record<string, unknown>;
        required((m.transfers as Record<string, unknown>[])[0]).origin = 'https://elsewhere.test';
        expect(() => validateObservedExecute(m, scope, ALL_DOMAINS)).toThrow();
    });
    it('checks an authored destination by the same parse as the list: any DNS host loads, userinfo and IP literals do not', () => {
        for (const [destination, accepted] of [['https://x.elsewhere.example/next', true], ['https://user@orders.example.test/', false], ['http://10.0.0.1/', false], ['ftp://orders.example.test/', false]] as const) {
            const m = frame();
            const input = m.inputs.find(i => i.kind === 'destination');
            if (!input || input.kind === 'secretRef')
                continue;
            (input as { value: string }).value = destination;
            const attempt = () => validateObservedExecute(m, scope, ALL_DOMAINS);
            if (accepted)
                expect(attempt, destination).not.toThrow();
            else
                expect(attempt, destination).toThrow('POLICY_REFUSED');
        }
    });
});
describe('one-way observed invocation deadlines', () => {
    it.each((['timeout', 'cancel'] as const).flatMap(reason => ([0, 1] as const).map(effects => ({ reason, effects }))))('poisons a step that ends late on $reason, so it cannot start another effect', async ({ reason }) => {
        const abort = new AbortController();
        let now = 0, late = false;
        const control = new ObservedInvocationControl({ now: () => now }, 10, abort.signal);
        const pending = control.run(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 30); }); late = true; control.beginInvocation(); });
        const stopped = expect(pending).rejects.toThrow(reason === 'cancel' ? 'CANCELLED' : 'TIMEOUT');
        if (reason === 'cancel') abort.abort(); else now = 11;
        await stopped;
        await new Promise<void>(resolve => { setTimeout(resolve, 60); });
        expect(late).toBe(true);
        expect(control.phase).toBe('POISONED');
        expect(() => { control.beginInvocation(); }).toThrow();
    });
    it('keeps the original source-step deadline across the operations of one step', async () => {
        let now = 0;
        const deadlines: number[] = [];
        const stepId = required(fixture.artifact.steps[2]).stepId;
        const result = await run(frame(), (action, _g, _io, control) => {
            if (action.coordinate.stepId === stepId) {
                deadlines.push(control.deadlineMs);
                if (action.coordinate.ordinal === 1) { now = 1001; control.check(); }
            }
            control.beginInvocation();
            if (action.coordinate.stepId === stepId) now = 600;
            const id = action.operation.captures[0];
            return Promise.resolve(stepResult(action, id === undefined ? {} : { [id]: 'FRESH' }));
        }, [], () => now);
        expect(result).toEqual({ ok: false, errorCode: 'TIMEOUT', secretUse: {} });
        expect(deadlines).toEqual([1000, 1000]);
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
