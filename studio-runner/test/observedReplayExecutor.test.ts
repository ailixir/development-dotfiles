import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import type { Execute2, Scope } from '../src/executor/observedOperations.js';
import { executeObservedReplay, validateObservedExecute } from '../src/executor/observedReplay.js';
import { hashObserved, OBSERVED_PROFILE } from '../src/validator/observedReferencePolicy.js';
import type { StepFinishedEvent } from '../src/executor/adapters/StepReporter.js';
const scope = { principalId: 'fresh-user', ...fixture.artifact.replayPolicy.scope } as Scope;
function frame(): Execute2 { return { kind: 'execute', protocolVersion: 2, mode: 'observed', runId: '00000000-0000-4000-8000-000000000020', attemptId: '00000000-0000-4000-8000-000000000021', profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: fixture.artifact.configurationHash, waitStrategy: 'domcontentloaded', stepTimeoutMs: 1000, steps: fixture.artifact.steps, guards: fixture.artifact.guards, bindings: fixture.artifact.replayPolicy.bindings.map(b => ({ bindingId: b.bindingId, producer: b.producer, recipe: b.recipe, origin: b.sourceOrigin })), transfers: fixture.artifact.replayPolicy.transfers, inputs: fixture.artifact.inputRecipes.map(i => ({ inputId: i.inputId, stepId: i.stepId, kind: i.kind, intendedSlot: i.intendedSlot, value: i.kind === 'destination' ? 'https://orders.example.test/start' : 'label' })) } as Execute2; }
describe('private source-free replay graph', () => {
    it('captures fresh private values twice with unchanged IR, never reporting them', async () => {
        const m = frame(), original = JSON.stringify(m);
        for (const fresh of ['first-value-42', 'second-value-73']) {
            const consumed: string[] = [], events: StepFinishedEvent[] = [];
            let disposed = 0, withheld = '';
            const result = await executeObservedReplay(m, { perform(a, _g, value, control) {
                    control.beginInvocation();
                    if (a.operation.kind === 'read')
                        return Promise.resolve({ value: fresh });
                    if (a.operation.kind === 'fill' && a.operation.value.kind === 'binding')
                        consumed.push(value ?? '');
                    return Promise.resolve(a.operation.kind === 'assert' ? { assertionPassed: value === fresh } : {});
                }, withhold(v) { withheld = v; return Promise.resolve(); }, dispose() { disposed++; return Promise.resolve(); } }, scope, { now: () => 1 }, { stepStarted() { return; }, stepFinished(e) { events.push(e); } }, new AbortController().signal);
            expect(result).toEqual({ ok: true, errorCode: null });
            expect(consumed).toEqual([fresh]);
            expect(withheld).toBe(fresh);
            expect(disposed).toBe(1);
            expect(JSON.stringify(events)).not.toContain(fresh);
        }
        expect(JSON.stringify(m)).toBe(original);
    });
    it('stops on failed producer and reports truly unexecuted steps with null timings', async () => {
        const events: StepFinishedEvent[] = [];
        let calls = 0;
        const result = await executeObservedReplay(frame(), { perform(a, _g, _value, control) {
                control.beginInvocation();
                calls++;
                if (a.operation.kind === 'read')
                    return Promise.reject(Error('CANARY'));
                return Promise.resolve({});
            }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); } }, scope, { now: () => 1 }, { stepStarted() { return; }, stepFinished(e) { events.push(e); } }, new AbortController().signal);
        expect(result.ok).toBe(false);
        expect(calls).toBe(2);
        expect(events[2]).toMatchObject({ status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
        expect(JSON.stringify(events)).not.toContain('CANARY');
    });
    it.each(['wrong-slot', 'wrong-origin', 'future-producer', 'duplicate-edge', 'missing-binding', 'historic-value', 'source', 'unknown-operation'])('refuses %s before invocation', mutation => {
        const m = structuredClone(frame()) as unknown as Record<string, unknown>;
        const t = m.transfers as Record<string, unknown>[], bindings = m.bindings as Record<string, unknown>[];
        if (mutation === 'wrong-slot')
            required(t[0]).slot = 'selectOption.value';
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
        if (mutation === 'unknown-operation')
            m.steps = [{ stepIndex: 0, stepId: required(fixture.artifact.steps[0]).stepId, operations: [{ coordinate: { stepId: required(fixture.artifact.steps[0]).stepId, ordinal: 0 }, guardId: 'g0', operation: { kind: 'evaluate', code: 'bad' } }] }];
        expect(() => validateObservedExecute(m, scope)).toThrow();
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
import { vi } from 'vitest';
import { ObservedInvocationControl, ReplayAcquisitionBudget, ACQUISITION_LIMITS } from '../src/executor/observedReplay.js';
import { createObservedReplayAdapter } from '../src/run/observedReplayAdapter.js';
import type { BrowserHandle } from '../src/run/browserFactory.js';
import type { Observation, ObservationSession } from '../src/run/observationTypes.js';
import type { Guard, TrustedPolicy, ReplayAction } from '../src/executor/observedOperations.js';
import wire from '../../docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json' with { type: 'json' };
function deferred<T>() { let fulfill: (value: T) => void = () => { throw Error('unset'); }; const promise = new Promise<T>(resolve => { fulfill = resolve; }); return { promise, resolve: (value?: T): void => { fulfill(value as T); } }; }
describe('one-way observed invocation deadlines', () => {
    it.each((['collect', 'probe', 'matches', 'validate', 'invoke'] as const).flatMap(stage => (['timeout', 'cancel'] as const).map(reason => ({ stage, reason }))))('poisons late $stage on $reason before another effect can run', async ({ stage, reason }) => {
        vi.useFakeTimers();
        let now = 0, invocations = 0;
        const paused = deferred<undefined>(), entered = deferred<undefined>();
        const wait = async (name: string): Promise<void> => { if (stage === name) {
            entered.resolve();
            await paused.promise;
        } };
        const original = required(fixture.basis.observations[0]).observation;
        const observation = { ...structuredClone(original), schemaVersion: 1 } as Observation;
        const target = { documentId: observation.documentId, generation: observation.generation, nodeId: 'reference' };
        const session: ObservationSession = { async observe() { await wait('collect'); return { observation, json: '', bytes: 100, observationHash: 'a'.repeat(64) }; }, async acquire() { await wait('probe'); return { kind: 'READY', target }; }, async matches() { await wait('matches'); return true; }, async validateInvocation() { await wait('validate'); return true; }, async invoke(_invocation, control) { control?.beginInvocation(); invocations++; await wait('invoke'); return { value: 'PRIVATE-CAPTURE' }; }, dispose() { return Promise.resolve(); } };
        const handle = { createObservationSession: () => session, observedBlankMatches: () => Promise.resolve(false), observedNavigateBlank: () => Promise.resolve() } as unknown as BrowserHandle;
        const scoped = { ...scope, initialContext: { kind: 'observedDocument', origin: observation.origin } } as Scope;
        const adapter = createObservedReplayAdapter(handle, scoped, wire.trustedPolicy as TrustedPolicy, 'run', () => undefined), budget = new ReplayAcquisitionBudget();
        const abort = new AbortController();
        const control = new ObservedInvocationControl({ now: () => now }, 10, abort.signal, budget, { extra: 0 });
        const guard = required(fixture.artifact.guards[1]) as Guard, action = required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction;
        const pending = control.run(() => adapter.perform(action, guard, null, control));
        const stopped = expect(pending).rejects.toThrow(reason === 'cancel' ? 'CANCELLED' : stage === 'invoke' ? 'OUTCOME_UNKNOWN' : 'TIMEOUT');
        try {
            await entered.promise;
            if (reason === 'cancel')
                abort.abort();
            else {
                now = 11;
                await vi.advanceTimersByTimeAsync(11);
            }
            await stopped;
            paused.resolve();
            await vi.advanceTimersByTimeAsync(1);
            expect(invocations).toBe(stage === 'invoke' ? 1 : 0);
            expect(control.phase).toBe('POISONED');
            expect(() => { control.beginInvocation(); }).toThrow();
            if (stage === 'collect')
                expect(budget.snapshot().bytes).toBe(32768);
        }
        finally {
            paused.resolve();
            await adapter.dispose();
            vi.useRealTimers();
        }
    });
    it('does not insert a captured binding or emit PASS after late withholding resolves', async () => {
        const abort = new AbortController(), paused = deferred<undefined>(), entered = deferred<undefined>(), calls: string[] = [], events: StepFinishedEvent[] = [];
        const work = executeObservedReplay(frame(), { perform(action, _guard, _value, control) { control.beginInvocation(); calls.push(action.operation.kind); return Promise.resolve(action.operation.kind === 'read' ? { value: 'PRIVATE-LATE' } : {}); }, async withhold(value) { if (value === 'PRIVATE-LATE') {
                entered.resolve();
                await paused.promise;
            } }, dispose() { return Promise.resolve(); } }, scope, { now: () => 1 }, { stepStarted() { return; }, stepFinished(event) { events.push(event); } }, abort.signal);
        await entered.promise;
        abort.abort();
        expect(await work).toEqual({ ok: false, errorCode: 'CANCELLED' });
        paused.resolve();
        await Promise.resolve();
        expect(calls).toEqual(['navigate', 'read']);
        expect(events.map(e => e.status)).toEqual(['PASS', 'FAIL', 'SKIPPED']);
        expect(JSON.stringify(events)).not.toContain('PRIVATE-LATE');
    });
    it('poisons late captured withholding on timeout without binding insertion', async () => {
        vi.useFakeTimers();
        let now = 0;
        const paused = deferred<undefined>(), entered = deferred<undefined>(), calls: string[] = [], events: StepFinishedEvent[] = [];
        const work = executeObservedReplay(frame(), { perform(action, _guard, _value, control) { control.beginInvocation(); calls.push(action.operation.kind); return Promise.resolve(action.operation.kind === 'read' ? { value: 'PRIVATE-LATE' } : {}); }, async withhold(value) { if (value === 'PRIVATE-LATE') {
                entered.resolve();
                await paused.promise;
            } }, dispose() { return Promise.resolve(); } }, scope, { now: () => now }, { stepStarted() { return; }, stepFinished(event) { events.push(event); } }, new AbortController().signal);
        try {
            await entered.promise;
            now = 1001;
            await vi.advanceTimersByTimeAsync(1001);
            expect(await work).toEqual({ ok: false, errorCode: 'OUTCOME_UNKNOWN' });
            paused.resolve();
            await vi.advanceTimersByTimeAsync(1);
            expect(calls).toEqual(['navigate', 'read']);
            expect(events.map(e => e.status)).toEqual(['PASS', 'FAIL', 'SKIPPED']);
        }
        finally {
            paused.resolve();
            vi.useRealTimers();
        }
    });
    it('cancels passive sleep without reserving or collecting another observation', async () => {
        vi.useFakeTimers();
        const abort = new AbortController(), budget = new ReplayAcquisitionBudget();
        const control = new ObservedInvocationControl({ now: () => 0 }, 1000, abort.signal, budget, { extra: 0 });
        let collected = 0;
        try {
            const work = control.run(async () => { await control.waitForAdditionalObservation(); control.reserveObservation(true); collected++; });
            const rejection = expect(work).rejects.toThrow('CANCELLED');
            abort.abort();
            await rejection;
            await vi.advanceTimersByTimeAsync(500);
            expect(collected).toBe(0);
            expect(budget.snapshot()).toEqual({ extra: 0, total: 0, bytes: 0 });
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('keeps the original source-step deadline across compound operations', async () => {
        let now = 0;
        const deadlines: number[] = [], invocations: string[] = [];
        const result = await executeObservedReplay(frame(), { perform(action, _g, _v, control) { if (action.coordinate.stepId === scopeFixtureStep()) {
                deadlines.push(control.deadlineMs);
                if (action.coordinate.ordinal === 1) {
                    now = 1001;
                    control.check();
                }
            } control.beginInvocation(); invocations.push(action.operation.kind); if (action.coordinate.stepId === scopeFixtureStep())
                now = 600; return Promise.resolve(action.operation.kind === 'read' ? { value: 'FRESH' } : { assertionPassed: true }); }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); } }, scope, { now: () => now }, { stepStarted() { return; }, stepFinished() { return; } }, new AbortController().signal);
        expect(result).toEqual({ ok: false, errorCode: 'TIMEOUT' });
        expect(deadlines).toEqual([1000, 1000]);
        expect(invocations).toEqual(['navigate', 'read', 'fill']);
    });
});
function scopeFixtureStep(): string { return required(fixture.artifact.steps[2]).stepId; }
describe('passive acquisition accounting and cadence', () => {
    it('uses100ms first and250ms later without resetting between operations', async () => {
        vi.useFakeTimers();
        let now = 0;
        const budget = new ReplayAcquisitionBudget(), step = { extra: 0 }, abort = new AbortController();
        const one = new ObservedInvocationControl({ now: () => now }, 2000, abort.signal, budget, step);
        let collected = 0;
        try {
            const pending = one.run(async () => { await one.waitForAdditionalObservation(); one.reserveObservation(true)(100); collected++; await one.waitForAdditionalObservation(); one.reserveObservation(true)(200); collected++; });
            now = 99;
            await vi.advanceTimersByTimeAsync(99);
            expect(collected).toBe(0);
            now = 100;
            await vi.advanceTimersByTimeAsync(1);
            expect(collected).toBe(1);
            now = 349;
            await vi.advanceTimersByTimeAsync(249);
            expect(collected).toBe(1);
            now = 350;
            await vi.advanceTimersByTimeAsync(1);
            await pending;
            expect(budget.snapshot()).toEqual({ extra: 2, total: 2, bytes: 300 });
            expect(step.extra).toBe(2);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('reserves counts/maximum bytes and retains failed or unknown collections', () => {
        const budget = new ReplayAcquisitionBudget(), step = { extra: 0 };
        const settle = budget.reserve(step, false);
        expect(budget.snapshot()).toEqual({ extra: 0, total: 1, bytes: 32768 });
        settle(10);
        expect(() => { settle(10); }).toThrow();
        for (let i = 0; i < 32; i++)
            budget.reserve(step, true);
        expect(() => budget.reserve(step, true)).toThrow('TIMEOUT');
        expect(budget.snapshot()).toEqual({ extra: 32, total: 33, bytes: 10 + 32 * 32768 });
        const total = new ReplayAcquisitionBudget();
        for (let i = 0; i < 400; i++)
            total.reserve({ extra: 0 }, false);
        expect(total.snapshot().bytes).toBe(ACQUISITION_LIMITS.totalBytes);
        expect(() => total.reserve({ extra: 0 }, false)).toThrow('TIMEOUT');
        const extras = new ReplayAcquisitionBudget();
        for (let i = 0; i < 200; i++)
            extras.reserve({ extra: 0 }, true)(0);
        expect(() => extras.reserve({ extra: 0 }, true)).toThrow('TIMEOUT');
    });
});
import { dispatchNativeInput } from '../src/run/nativeInput.js';
import type { NativeInputPort } from '../src/run/nativeInput.js';
describe('retained native input cancellation fencing', () => {
    it.each(['timeout', 'cancel'] as const)('fences held native preparation on %s before any input', async (reason) => {
        vi.useFakeTimers();
        let now = 0;
        const abort = new AbortController(), control = new ObservedInvocationControl({ now: () => now }, 10, abort.signal, new ReplayAcquisitionBudget(), { extra: 0 }), held = deferred<undefined>(), entered = deferred<undefined>();
        const input: string[] = [];
        const port: NativeInputPort = { async inspect() { control.check(); entered.resolve(); await held.promise; control.check(); return { alreadyChecked: false, requiresReveal: false }; }, revealAndValidate() { throw Error('unexpected'); }, focusAndValidate() { throw Error('unexpected'); }, point() { control.check(); return Promise.resolve({ x: 1, y: 1, alreadyChecked: false }); }, confirmToggle() { return Promise.resolve(); }, mouse(e) { control.check(); if (control.phase === 'PREPARING')
                control.beginInvocation(); input.push(e.type); return Promise.resolve(); }, key() { throw Error('unexpected'); } };
        const work = control.run(() => dispatchNativeInput({ kind: 'click' }, port)), rejected = expect(work).rejects.toThrow(reason === 'timeout' ? 'TIMEOUT' : 'CANCELLED');
        try {
            await entered.promise;
            if (reason === 'cancel')
                abort.abort();
            else {
                now = 11;
                await vi.advanceTimersByTimeAsync(11);
            }
            await rejected;
            held.resolve();
            await vi.advanceTimersByTimeAsync(1);
            expect(input).toEqual([]);
        }
        finally {
            held.resolve();
            vi.useRealTimers();
        }
    });
});

describe('adapter bounded passive acquisition versus terminal refusal',()=>{
  it.each(['eventually-ready','refused','replacement'] as const)('handles %s without repeating a capture',async mode=>{
    vi.useFakeTimers();let now=0,probes=0,collects=0,invokes=0,matches=0;
    const observation={...structuredClone(required(fixture.basis.observations[0]).observation),schemaVersion:1} as Observation;
    const target={documentId:observation.documentId,generation:observation.generation,nodeId:'reference'};
    const session:ObservationSession={observe(){collects++;return Promise.resolve({observation,json:'',bytes:100,observationHash:'a'.repeat(64)});},acquire(){probes++;return Promise.resolve(mode==='refused'?{kind:'REFUSED',code:'POLICY_REFUSED'}:probes===1?{kind:'ABSENT'}:probes===2?{kind:'VISIBILITY_PENDING'}:{kind:'READY',target});},matches(){matches++;return Promise.resolve(mode!=='replacement');},validateInvocation(){return Promise.resolve(true);},invoke(_i,control){control?.beginInvocation();invokes++;return Promise.resolve({value:'PRIVATE-ONCE'});},dispose(){return Promise.resolve();}};
    const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
    const adapter=createObservedReplayAdapter(handle,scope,wire.trustedPolicy as TrustedPolicy,'run',()=>undefined),budget=new ReplayAcquisitionBudget(),control=new ObservedInvocationControl({now:()=>now},1000,new AbortController().signal,budget,{extra:0});
    const work=control.run(()=>adapter.perform(required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction,required(fixture.artifact.guards[1]) as Guard,null,control));
    const result=mode==='eventually-ready'?expect(work).resolves.toEqual({value:'PRIVATE-ONCE'}):expect(work).rejects.toThrow(mode==='refused'?'POLICY_REFUSED':'TARGET_DRIFT');
    try{await vi.advanceTimersByTimeAsync(0);now=100;await vi.advanceTimersByTimeAsync(100);now=350;await vi.advanceTimersByTimeAsync(250);await result;expect(collects).toBe(mode==='refused'?1:3);expect(invokes).toBe(mode==='eventually-ready'?1:0);expect(matches).toBe(mode==='refused'?0:1);expect(budget.snapshot()).toEqual({extra:mode==='refused'?0:2,total:collects,bytes:100*collects});}finally{await adapter.dispose();vi.useRealTimers();}
  });
});
