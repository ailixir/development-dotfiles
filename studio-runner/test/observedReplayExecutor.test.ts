import { ALL_DOMAINS } from '../src/allowedDomains.js';
import { FIXTURE_ORIGIN, TEST_DOMAINS } from './helpers/allowedDomains.js';
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import type { Execute3, Scope } from '../src/executor/observedOperations.js';
import { executeObservedReplay, replayWithheldLiterals, validateObservedExecute, replayError } from '../src/executor/observedReplay.js';
import { hashObserved, OBSERVED_PROFILE } from '../src/validator/observedReferencePolicy.js';
import type { StepFinishedEvent } from '../src/executor/stepReporter.js';
const scope = { principalId: 'fresh-user', ...fixture.artifact.replayPolicy.scope } as Scope;
function frame(): Execute3 { return { kind: 'execute', protocolVersion: 3, mode: 'observed', runId: '00000000-0000-4000-8000-000000000020', attemptId: '00000000-0000-4000-8000-000000000021', profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: fixture.artifact.configurationHash, waitStrategy: 'domcontentloaded', stepTimeoutMs: 1000, steps: fixture.artifact.steps, guards: fixture.artifact.guards, bindings: fixture.artifact.replayPolicy.bindings.map(b => ({ bindingId: b.bindingId, producer: b.producer, recipe: b.recipe, origin: b.sourceOrigin })), transfers: fixture.artifact.replayPolicy.transfers, inputs: fixture.artifact.inputRecipes.map(i => ({ inputId: i.inputId, stepId: i.stepId, kind: i.kind, intendedSlot: i.intendedSlot, value: i.kind === 'destination' ? 'https://orders.example.test/start' : 'label' })), secrets: {}, secretOrigins: {} } as Execute3; }
describe('private source-free replay graph', () => {
    it('D4 carries successful reads through the typed capture handoff without generic unknown attribution', async () => {
        const captured: string[] = [], generic: string[] = [], fresh = 'fresh private typed capture';
        const result = await executeObservedReplay(frame(), {
            perform(action, _guard, value, control) {
                control.beginInvocation();
                return Promise.resolve(action.operation.kind === 'read' ? { value: fresh } : action.operation.kind === 'assert' ? { assertionPassed: value === fresh } : {});
            },
            captureRead(bindingId) { captured.push(bindingId); },
            withhold(value) { generic.push(value); return Promise.resolve(); },
            dispose() { return Promise.resolve(); },
        }, scope, TEST_DOMAINS, { now: () => 1 }, { stepStarted() { return; }, stepFinished() { return; } }, new AbortController().signal);
        expect(result.ok).toBe(true);
        expect(captured).toEqual(['binding-reference']);
        expect(generic).not.toContain(fresh);
    });
    it('does not withhold the text an assertion expects (learning does not), and still withholds other literals', () => {
        const inputs = [
            { inputId: 'typed', stepId: 's', kind: 'nonsecretText', intendedSlot: 'fill.value', value: 'incorrectUser' },
            { inputId: 'expected', stepId: 's', kind: 'nonsecretText', intendedSlot: 'assert.expected', value: 'Test login' },
            { inputId: 'configured', stepId: 's', kind: 'nonsecretText', intendedSlot: 'assert.expected', value: 'Configured' },
        ] as Execute3['inputs'];
        const recipes = [{ inputId: 'configured', provenance: { kind: 'configuration' } }];
        expect(replayWithheldLiterals(inputs, recipes)).toEqual(['typed', 'configured']);
    });
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
                }, withhold(v) { withheld = v; return Promise.resolve(); }, dispose() { disposed++; return Promise.resolve(); } }, scope, TEST_DOMAINS, { now: () => 1 }, { stepStarted() { return; }, stepFinished(e) { events.push(e); } }, new AbortController().signal);
            expect(result).toEqual({ ok: true, errorCode: null, secretUse: {} });
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
            }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); } }, scope, TEST_DOMAINS, { now: () => 1 }, { stepStarted() { return; }, stepFinished(e) { events.push(e); } }, new AbortController().signal);
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
        expect(() => validateObservedExecute(m, scope, TEST_DOMAINS)).toThrow();
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
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
import { readFileSync } from 'node:fs';
import { vi,type MockInstance } from 'vitest';
import { ObservedInvocationControl, ReplayAcquisitionBudget, ACQUISITION_LIMITS } from '../src/executor/observedReplay.js';
import { createObservedReplayAdapter } from '../src/run/observedReplayAdapter.js';
import type { BrowserHandle } from '../src/run/browserFactory.js';
import type { ObservationSession } from '../src/run/observationTypes.js';
import type { Observation } from '../src/guided/types.js';
import { sessionStub } from './helpers/guided.js';
import { ClosedActionError } from '../src/run/closedError.js';
import type { Guard, ReplayAction } from '../src/executor/observedOperations.js';
function deferred<T>() { let fulfill: (value: T) => void = () => { throw Error('unset'); }; const promise = new Promise<T>(resolve => { fulfill = resolve; }); return { promise, resolve: (value?: T): void => { fulfill(value as T); } }; }
describe('one-way observed invocation deadlines', () => {
    it.each((['resolve', 'invoke'] as const).flatMap(stage => (['timeout', 'cancel'] as const).map(reason => ({ stage, reason }))))('poisons late $stage on $reason before another effect can run', async ({ stage, reason }) => {
        vi.useFakeTimers();
        let now = 0, invocations = 0;
        const paused = deferred<undefined>(), entered = deferred<undefined>();
        const wait = async (name: string): Promise<void> => { if (stage === name) {
            entered.resolve();
            await paused.promise;
        } };
        const original = required(fixture.basis.observations[0]).observation;
        const observation = { ...structuredClone(original), schemaVersion: 3, coverage: { ...fixture.basis.observations[0]?.observation.coverage, passwordControls: 0 } } as Observation;
        const session: ObservationSession = sessionStub({ observe() { return Promise.resolve({ observation, json: '', bytes: 100, observationHash: 'a'.repeat(64) }); }, async resolveTarget() { await wait('resolve'); return { kind: 'READY' }; }, async invoke(_invocation, control) { control?.beginInvocation(); invocations++; await wait('invoke'); return { value: 'PRIVATE-CAPTURE' }; }, dispose() { return Promise.resolve(); } });
        const handle = { createObservationSession: () => session, observedBlankMatches: () => Promise.resolve(false), observedNavigateBlank: () => Promise.resolve() } as unknown as BrowserHandle;
        const scoped = { ...scope, initialContext: { kind: 'observedDocument', origin: observation.origin } } as Scope;
        const adapter = createObservedReplayAdapter(handle, scoped, TEST_DOMAINS, 'run', () => undefined), budget = new ReplayAcquisitionBudget();
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
            // An element poll reserves the observation budget before it resolves; a poll that ends late stays charged (settle(0) never ran).
            if (stage === 'resolve')
                expect(budget.snapshot().bytes).toBe(ACQUISITION_LIMITS.observationBytes);
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
            } }, dispose() { return Promise.resolve(); } }, scope, TEST_DOMAINS, { now: () => 1 }, { stepStarted() { return; }, stepFinished(event) { events.push(event); } }, abort.signal);
        await entered.promise;
        abort.abort();
        expect(await work).toEqual({ ok: false, errorCode: 'CANCELLED', secretUse: {} });
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
            } }, dispose() { return Promise.resolve(); } }, scope, TEST_DOMAINS, { now: () => now }, { stepStarted() { return; }, stepFinished(event) { events.push(event); } }, new AbortController().signal);
        try {
            await entered.promise;
            now = 1001;
            await vi.advanceTimersByTimeAsync(1001);
            expect(await work).toEqual({ ok: false, errorCode: 'OUTCOME_UNKNOWN', secretUse: {} });
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
                now = 600; return Promise.resolve(action.operation.kind === 'read' ? { value: 'FRESH' } : { assertionPassed: true }); }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); } }, scope, TEST_DOMAINS, { now: () => now }, { stepStarted() { return; }, stepFinished() { return; } }, new AbortController().signal);
        expect(result).toEqual({ ok: false, errorCode: 'TIMEOUT', secretUse: {} });
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
    it('takes the per-observation byte reservation from the limits schema default, and a total of 400 of them', () => {
        const limits = JSON.parse(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json', import.meta.url), 'utf8')) as { properties: { maxObservationBytes: { default: number; maximum: number } } };
        expect(ACQUISITION_LIMITS.observationBytes).toBe(limits.properties.maxObservationBytes.default);
        expect(ACQUISITION_LIMITS.observationBytes).toBe(limits.properties.maxObservationBytes.maximum);
        expect(ACQUISITION_LIMITS.totalBytes).toBe(ACQUISITION_LIMITS.totalPerRun * ACQUISITION_LIMITS.observationBytes);
    });
    it('reserves counts/maximum bytes and retains failed or unknown collections', () => {
        const budget = new ReplayAcquisitionBudget(), step = { extra: 0 };
        const settle = budget.reserve(step, false);
        expect(budget.snapshot()).toEqual({ extra: 0, total: 1, bytes: ACQUISITION_LIMITS.observationBytes });
        settle(10);
        expect(() => { settle(10); }).toThrow();
        for (let i = 0; i < 32; i++)
            budget.reserve(step, true);
        expect(() => budget.reserve(step, true)).toThrow('TIMEOUT');
        expect(budget.snapshot()).toEqual({ extra: 32, total: 33, bytes: 10 + 32 * ACQUISITION_LIMITS.observationBytes });
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
describe('adapter bounded passive acquisition versus terminal refusal',()=>{
  it('maps a password-read validation refusal before invoke to the closed replay code',async()=>{
    let resolutions=0,invocations=0;
    const session:ObservationSession=sessionStub({
      observe(){return Promise.reject(new Error('NO_OBSERVATION_FOR_AN_ELEMENT_STEP'));},
      resolveTarget(){resolutions++;return Promise.resolve({kind:'READY'});},
      invoke(){invocations++;return Promise.reject(new ClosedActionError('PASSWORD_CONTROL_READ_REFUSED'));},
      dispose(){return Promise.resolve();},
    });
    const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
    const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'run',()=>undefined);
    const control=new ObservedInvocationControl({now:()=>0},1000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
    try{
      const failure=await control.run(()=>adapter.perform(required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction,required(fixture.artifact.guards[1]) as Guard,null,control)).then(()=>null,(error:unknown)=>error);
      // The live refusal comes from the one executor, before its fence: the control is still preparing and nothing was invoked past the refusal.
      expect(resolutions).toBe(1);expect(invocations).toBe(1);
      expect(failure).toMatchObject({code:'PASSWORD_CONTROL_READ_REFUSED'});
      expect(replayError(failure)).toBe('PASSWORD_CONTROL_READ_REFUSED');
    }finally{await adapter.dispose();}
  });
  it.each(['eventually-ready','refused','replacement'] as const)('handles %s without repeating a capture',async mode=>{
    vi.useFakeTimers();let now=0,probes=0,collects=0,invokes=0;
    const session:ObservationSession=sessionStub({observe(){collects++;return Promise.reject(new Error('NO_OBSERVATION_FOR_AN_ELEMENT_STEP'));},resolveTarget(){probes++;return Promise.resolve(mode==='refused'?{kind:'REFUSED' as const,code:'POLICY_REFUSED' as const}:probes<3?{kind:'ABSENT' as const}:{kind:'READY' as const});},invoke(_i,control){if(mode==='replacement')return Promise.reject(new ClosedActionError('TARGET_CHANGED'));control?.beginInvocation();invokes++;return Promise.resolve({value:'PRIVATE-ONCE'});},dispose(){return Promise.resolve();}});
    const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
    const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'run',()=>undefined),budget=new ReplayAcquisitionBudget(),control=new ObservedInvocationControl({now:()=>now},1000,new AbortController().signal,budget,{extra:0});
    const work=control.run(()=>adapter.perform(required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction,required(fixture.artifact.guards[1]) as Guard,null,control));
    const result=mode==='eventually-ready'?expect(work).resolves.toEqual({value:'PRIVATE-ONCE'}):expect(work).rejects.toThrow(mode==='refused'?'POLICY_REFUSED':'TARGET_DRIFT');
    try{await vi.advanceTimersByTimeAsync(0);now=100;await vi.advanceTimersByTimeAsync(100);now=350;await vi.advanceTimersByTimeAsync(250);await result;expect(collects).toBe(mode==='eventually-ready'?0:1);expect(probes).toBe(mode==='refused'?1:3);expect(invokes).toBe(mode==='eventually-ready'?1:0);expect(budget.snapshot()).toEqual({extra:mode==='refused'?0:2,total:probes,bytes:0});}finally{await adapter.dispose();vi.useRealTimers();}
  });
  it('takes the login probe while the target is still absent, so a step that ends as TIMEOUT still carries LOGIN_REQUIRED', async () => {
    vi.useFakeTimers();let now=0,observes=0;
    const login={...structuredClone(required(fixture.basis.observations[0]).observation),schemaVersion:3,coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:1},facts:{e1:{role:'button',name:'Sign in',editable:false, nameComplete: true, ownTextComplete: true,evidence:'Sign in',evidenceSegments:[]}}} as unknown as Observation;
    const session:ObservationSession=sessionStub({resolveTarget(){return Promise.resolve({kind:'ABSENT'});},observe(){observes++;return Promise.resolve({observation:login,json:'',bytes:100,observationHash:'a'.repeat(64)});},dispose(){return Promise.resolve();}});
    const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
    const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'run',()=>undefined),control=new ObservedInvocationControl({now:()=>now},1000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
    const outcome=control.run(()=>adapter.perform(required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction,required(fixture.artifact.guards[1]) as Guard,null,control)).then(()=>null,(error:unknown)=>error);
    try{
      for(let step=0;step<8;step++){now+=200;await vi.advanceTimersByTimeAsync(200);}
      expect(await outcome).toMatchObject({code:'TIMEOUT'});
      expect(observes).toBe(1);expect(adapter.loginRequired?.()).toBe(true);
    }finally{await adapter.dispose();vi.useRealTimers();}
  });
  it('ends a target that stays absent when the passive-acquisition budget is spent as TARGET_DRIFT, never TIMEOUT',async()=>{
    vi.useFakeTimers();let now=0,probes=0;
    const session:ObservationSession=sessionStub({resolveTarget(){probes++;return Promise.resolve({kind:'ABSENT'});},observe(){return Promise.reject(new Error('NO_OBSERVATION_FOR_AN_ELEMENT_STEP'));},dispose(){return Promise.resolve();}});
    const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
    const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'run',()=>undefined),budget=new ReplayAcquisitionBudget(),control=new ObservedInvocationControl({now:()=>now},60_000_000,new AbortController().signal,budget,{extra:0});
    const work=control.run(()=>adapter.perform(required(required(fixture.artifact.steps[1]).operations[0]) as ReplayAction,required(fixture.artifact.guards[1]) as Guard,null,control));
    const outcome=work.then(()=>null,(error:unknown)=>error);
    try{
      for(let step=0;step<40;step++){now+=300;await vi.advanceTimersByTimeAsync(300);}
      expect(await outcome).toMatchObject({code:'TARGET_DRIFT'});
      expect(probes).toBe(1+ACQUISITION_LIMITS.extraPerStep);expect(budget.snapshot().bytes).toBe(0);
    }finally{await adapter.dispose();vi.useRealTimers();}
  });
});

// Ordinary preparation uses controlled ports here; native companions keep the actual password
// primitive, recording and Vault/Core authority in their separately required tiers.
import {PasswordNoEffect} from '../src/run/passwordControl.js';
import {ObservedRefusal} from '../src/validator/observedReferencePolicy.js';
import {OriginNotAllowed} from '../src/allowedDomains.js';
import type {InvocationControl} from '../src/executor/observedReplay.js';
import type {ObservedAdapter} from '../src/run/observedReplayAdapter.js';
function ordinaryPasswordPreparation(prepare:(control:InvocationControl)=>Promise<void>,guardLive:()=>void=()=>undefined){
  const original=required(fixture.basis.observations[0]).observation,observation={...structuredClone(original),schemaVersion:3,coverage:{...original.coverage,passwordControls:1}} as Observation;
  const stepId='00000000-0000-4000-8000-000000000901',guard:Guard={guardId:'g0',origin:observation.origin,target:{kind:'passwordControl'}},action:ReplayAction={coordinate:{stepId,ordinal:0},guardId:'g0',operation:{kind:'fill',value:{kind:'secretRef',sourceInputId:'password-reference'}}};
  const message:Execute3={...frame(),steps:[{stepIndex:0,stepId,operations:[action]}],guards:[guard],bindings:[],transfers:[],inputs:[{inputId:'password-reference',stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:'PASS'}],secrets:{PASS:'preparation-private-canary'},secretOrigins:{PASS:[observation.origin]}};
  const scoped:Scope={...scope,initialContext:{kind:'observedDocument',origin:observation.origin}},events:StepFinishedEvent[]=[];
  validateObservedExecute(message,scoped, TEST_DOMAINS); // Prove the declared parent before any asynchronous port fault.
  let current:InvocationControl|undefined;const failures:unknown[]=[];const begins:MockInstance<InvocationControl['beginInvocation']>[]=[];
  const observe=vi.fn(()=>Promise.resolve({observation,json:'',bytes:100,observationHash:'a'.repeat(64)})),preparePassword=vi.fn(()=>prepare(required(current))),fillPassword=vi.fn<NonNullable<ObservationSession['fillPassword']>>((_target,_origin,_allowed,_value,control)=>{control?.beginInvocation();return Promise.resolve();}),dispose=vi.fn(()=>Promise.resolve()),withhold=vi.fn(()=>Promise.resolve());
  const observations:ObservationSession=sessionStub({observe,preparePassword,fillPassword,withhold,dispose}),handle={createObservationSession:()=>observations,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
  const ordinary=createObservedReplayAdapter(handle, scoped, TEST_DOMAINS,'preparation-unit',guardLive),adapter:ObservedAdapter={...ordinary,perform:async(...args)=>{current=args[3];begins.push(vi.spyOn(current,'beginInvocation'));try{return await ordinary.perform(...args);}catch(error){failures.push(error);throw error;}}};
  const run=(clock={now:()=>0},signal=new AbortController().signal)=>executeObservedReplay(message,adapter,scoped, TEST_DOMAINS,clock,{stepStarted(){return;},stepFinished:event=>{events.push(event);}},signal);
  return {message,scoped,guard,action,adapter,ordinary,run,events,observe,preparePassword,fillPassword,dispose,begins,failures};
}
describe('ordinary password preparation trust and lifetime boundary',()=>{
  it.each(['PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS','TARGET_CHANGED'] as const)('classifies trusted %s without filling, invoking, reacquiring or leaking',async reason=>{
    const h=ordinaryPasswordPreparation(()=>Promise.reject(new PasswordNoEffect(reason))),result=await h.run();
    expect(result).toEqual({ok:false,errorCode:reason==='TARGET_CHANGED'?'TARGET_DRIFT':'POLICY_REFUSED',secretUse:{PASS:'REFUSED'}});expect(h.failures).toHaveLength(1);expect(h.failures[0]).toBeInstanceOf(ObservedRefusal);expect(h.failures[0]).toMatchObject({code:reason==='TARGET_CHANGED'?'TARGET_DRIFT':'POLICY_REFUSED',noEffect:true,reason});
    expect(h.preparePassword).toHaveBeenCalledOnce();expect(h.observe).toHaveBeenCalledOnce();expect(h.fillPassword).not.toHaveBeenCalled();expect(required(h.begins[0])).not.toHaveBeenCalled();expect(h.dispose).toHaveBeenCalledOnce();
    expect(JSON.stringify({result,events:h.events})).not.toContain('preparation-private-canary');
  });
  it.each(['same-text-absent','same-text-target','unknown-trusted','canary-unknown'] as const)('keeps %s unrecognized and private at the executor boundary',async mode=>{
    const error=mode==='unknown-trusted'?new PasswordNoEffect('UNRECOGNIZED_PREPARATION'):new Error(mode==='same-text-absent'?'PASSWORD_TARGET_ABSENT':mode==='same-text-target'?'TARGET_CHANGED':'preparation-private-canary');
    const h=ordinaryPasswordPreparation(()=>Promise.reject(error)),result=await h.run();expect(result).toEqual({ok:false,errorCode:'INTERNAL_ERROR',secretUse:{PASS:'REFUSED'}});
    expect(h.preparePassword).toHaveBeenCalledOnce();expect(h.observe).toHaveBeenCalledOnce();expect(h.fillPassword).not.toHaveBeenCalled();expect(required(h.begins[0])).not.toHaveBeenCalled();expect(h.dispose).toHaveBeenCalledOnce();expect(JSON.stringify({result,events:h.events})).not.toMatch(/preparation-private-canary|PASSWORD_TARGET|UNRECOGNIZED_PREPARATION/u);
  });
  it.each(['observed-refusal','same-text','unknown-trusted','late-phase','non-password-target'] as const)('preserves exact %s rejection identity and never invents no-effect authority',async mode=>{
    const error=mode==='observed-refusal'?new ObservedRefusal('POLICY_REFUSED','original-authority',false):mode==='same-text'?new Error('PASSWORD_TARGET_ABSENT'):new PasswordNoEffect(mode==='unknown-trusted'?'UNRECOGNIZED_PREPARATION':'PASSWORD_TARGET_ABSENT');
    const h=ordinaryPasswordPreparation(control=>{if(mode==='late-phase')control.beginInvocation();return Promise.reject(error);});
    const control=new ObservedInvocationControl({now:()=>0},1000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
    try{
      if(mode==='non-password-target'){
        // A trusted error at a different acquisition target cannot authorize password mapping.
        const ordinaryGuard=required(fixture.artifact.guards[1]) as Guard;
        const observation={...structuredClone(required(fixture.basis.observations[0]).observation),schemaVersion:3} as Observation;
        const session:ObservationSession=sessionStub({observe:()=>Promise.resolve({observation,json:'',bytes:100,observationHash:'a'.repeat(64)}),resolveTarget:()=>Promise.reject(error),dispose:()=>Promise.resolve()});
        const handle={createObservationSession:()=>session,observedBlankMatches:()=>Promise.resolve(false),observedNavigateBlank:()=>Promise.resolve()} as unknown as BrowserHandle;
        const adapter=createObservedReplayAdapter(handle,h.scoped,TEST_DOMAINS,'non-password-preparation',()=>undefined);
        try{await expect(adapter.perform(h.action,ordinaryGuard,'preparation-private-canary',control)).rejects.toBe(error);}finally{await adapter.dispose();}
      }else await expect(h.adapter.perform(h.action,h.guard,'preparation-private-canary',control,{secretId:'PASS',allowedOrigins:[FIXTURE_ORIGIN]})).rejects.toBe(error);
      expect(h.fillPassword).not.toHaveBeenCalled();expect(control.phase).toBe(mode==='late-phase'?'INVOKING':'PREPARING');
      if(mode==='late-phase')expect(required(h.begins[0])).toHaveBeenCalledOnce();else if(mode!=='non-password-target')expect(required(h.begins[0])).not.toHaveBeenCalled();
    }finally{await h.adapter.dispose();expect(h.dispose).toHaveBeenCalledOnce();}
  });
  it.each(['cancel','deadline','authority'] as const)('preserves %s precedence while password preparation is held',async mode=>{
    const entered=deferred<undefined>(),released=deferred<undefined>();let now=0,withdrawn=false;
    const h=ordinaryPasswordPreparation(async()=>{entered.resolve();await released.promise;throw new PasswordNoEffect('PASSWORD_TARGET_ABSENT');},()=>{if(withdrawn)throw new ObservedRefusal('AUTHORIZATION_EXPIRED');}),abort=new AbortController();
    vi.useFakeTimers();const work=h.run({now:()=>now},abort.signal);
    // Observe immediately, without changing the original promise/rejection used below. A
    // tagged rejection is a test failure, never successful preparation or a swallowed error.
    const completion=work.then(value=>({kind:'completed',value})as const,(error:unknown)=>({kind:'rejected',error})as const);
    try{
      const first=await Promise.race([entered.promise.then(()=>({kind:'entered'})as const),completion]);
      if(first.kind==='rejected')throw first.error;
      if(first.kind==='completed')throw Error('WORK_COMPLETED_BEFORE_PASSWORD_PREPARATION');
      if(mode==='cancel')abort.abort();else if(mode==='deadline'){now=1001;await vi.advanceTimersByTimeAsync(1001);}else withdrawn=true;
      released.resolve();await vi.advanceTimersByTimeAsync(0);const result=await work;expect(result.ok).toBe(false);expect(result.errorCode).toBe(mode==='cancel'?'CANCELLED':mode==='deadline'?'TIMEOUT':'AUTHORIZATION_EXPIRED');
      expect(h.preparePassword).toHaveBeenCalledOnce();expect(h.observe).toHaveBeenCalledOnce();expect(h.fillPassword).not.toHaveBeenCalled();expect(required(h.begins[0])).not.toHaveBeenCalled();expect(h.dispose).toHaveBeenCalledOnce();expect(JSON.stringify({result,events:h.events})).not.toContain('preparation-private-canary');
    }finally{released.resolve();await vi.advanceTimersByTimeAsync(0);vi.useRealTimers();}
  });
  it('keeps a legal prepared password fill as exactly one invocation and positive USED evidence',async()=>{
    const h=ordinaryPasswordPreparation(()=>Promise.resolve()),result=await h.run();expect(result).toEqual({ok:true,errorCode:null,secretUse:{PASS:'USED'}});
    // The existing exact target is prepared, then revalidated by performPrepared before fill.
    expect(h.preparePassword).toHaveBeenCalledTimes(2);expect(h.observe).toHaveBeenCalledOnce();expect(h.fillPassword).toHaveBeenCalledOnce();expect(required(h.begins[0])).toHaveBeenCalledOnce();expect(h.dispose).toHaveBeenCalledOnce();expect(JSON.stringify({result,events:h.events})).not.toContain('preparation-private-canary');
  });
});

describe('a main frame that never returned to the whitelist', () => {
    it('fails the step POLICY_REFUSED before anything is prepared, acquired or filled, and names no host in the result', async () => {
        const h = ordinaryPasswordPreparation(() => Promise.reject(new Error('unreachable')));
        h.observe.mockRejectedValueOnce(new OriginNotAllowed('idp.example.net'));
        const result = await h.run();
        expect(result).toEqual({ ok: false, errorCode: 'POLICY_REFUSED', secretUse: { PASS: 'REFUSED' } });
        expect(h.failures[0]).toMatchObject({ code: 'POLICY_REFUSED', noEffect: true });
        expect(h.preparePassword).not.toHaveBeenCalled();
        expect(h.fillPassword).not.toHaveBeenCalled();
        expect(JSON.stringify({ result, events: h.events })).not.toContain('idp.example.net');
    });
});
