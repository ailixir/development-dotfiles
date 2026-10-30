import {describe,expect,it} from 'vitest';
import {performPreparedObservedAction} from '../../src/run/observedReplayAdapter.js';
import {PasswordNoEffect} from '../../src/run/passwordControl.js';
import {ObservedRefusal} from '../../src/validator/observedReferencePolicy.js';
import type {ObservationSession} from '../../src/run/observationTypes.js';
import type {BrowserHandle} from '../../src/run/browserFactory.js';
import type {InvocationControl} from '../../src/executor/observedReplay.js';
import {sessionStub} from '../helpers/guided.js';
import {createFakePage} from '../helpers/child.js';
describe('positive password prewrite evidence versus native invocation fence',()=>{
  it.each(['positive-prewrite','uncertain-after-call']as const)('preserves %s usage evidence without rolling back the native fence',async mode=>{
    let nativeStarted=false,calls=0;const abort=new AbortController();
    const control:InvocationControl={deadlineMs:Date.now()+10000,signal:abort.signal,get phase(){return nativeStarted?'INVOKING':'PREPARING';},check:()=>undefined,beginInvocation:()=>{nativeStarted=true;},poison:()=>{abort.abort();},reserveObservation:()=>()=>undefined,waitForAdditionalObservation:()=>Promise.resolve()};
    const withheld:string[]=[];const observations:ObservationSession=sessionStub({observe:()=>Promise.reject(new Error('NO_REACQUISITION')),dispose:()=>Promise.resolve(),preparePassword:()=>Promise.resolve(),withhold:values=>{withheld.push(...values);return Promise.resolve();},fillPassword:(_target,_origin,_allowed,_value,current)=>{current?.beginInvocation();calls++;return Promise.reject(mode==='positive-prewrite'?new PasswordNoEffect('PASSWORD_FORM_ACTION_NOT_ALLOWED'):new Error('TARGET_CHANGED'));}});
    const handle:BrowserHandle={page:createFakePage(),onExtraPage:()=>undefined,observedHosts:()=>[],close:()=>Promise.resolve(null),dispose:()=>Promise.resolve()};
    let caught:unknown;try{await performPreparedObservedAction(handle,observations,{operation:{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}},{guardId:'g1',origin:'https://example.test',target:{kind:'passwordControl'}},{kind:'passwordControl',documentId:'document',generation:1},'private-password-canary',control,{secretId:'PASS',allowedOrigins:['https://example.test']});}catch(error){caught=error;}
    expect(caught).toBeInstanceOf(ObservedRefusal);expect((caught as ObservedRefusal).noEffect).toBe(mode==='positive-prewrite');expect(nativeStarted).toBe(true);expect(control.phase).toBe('INVOKING');expect(calls).toBe(1);expect(withheld).toContain('private-password-canary');
  });
});


describe('prepared action error boundary', () => {
  it('a post-fence failure carries only a closed reason', async () => {
    const marker = 'synthetic-private-post-fence-7341';
    const raw = new Error(`native action failed with ${marker}`, { cause: new Error(marker) });
    raw.name = 'TimeoutError';
    let started = false, invokes = 0, observationsTaken = 0, resolutions = 0, refLookups = 0, preparations = 0;
    const abort = new AbortController();
    const control: InvocationControl = {
      deadlineMs: Date.now() + 10_000, signal: abort.signal,
      get phase() { return started ? 'INVOKING' : 'PREPARING'; },
      check: () => undefined, beginInvocation: () => { started = true; },
      poison: () => { abort.abort(); }, reserveObservation: () => () => undefined,
      waitForAdditionalObservation: () => Promise.resolve(),
    };
    const observations = sessionStub({
      observe: () => { observationsTaken++; return Promise.reject(new Error('UNEXPECTED_OBSERVATION')); },
      resolveTarget: () => { resolutions++; return Promise.reject(new Error('UNEXPECTED_REACQUISITION')); },
      refForTarget: () => { refLookups++; return Promise.reject(new Error('UNEXPECTED_REF_LOOKUP')); },
      prepareTarget: () => { preparations++; return Promise.reject(new Error('UNEXPECTED_PREPARATION')); },
      invoke: (_request, current) => { expect(current).toBe(control); if (current === undefined) throw new Error('INVOCATION_CONTROL_REQUIRED'); expect(current.phase).toBe('PREPARING'); invokes++; current.beginInvocation(); expect(current.phase).toBe('INVOKING'); return Promise.reject(raw); },
    });
    const handle: BrowserHandle = { page: createFakePage(), onExtraPage: () => undefined, observedHosts: () => [], close: () => Promise.resolve(null), dispose: () => Promise.resolve() };
    let caught: unknown;
    try {
      await performPreparedObservedAction(handle, observations, { operation: { kind: 'click' } }, {
        guardId: 'closed-error-guard', origin: 'https://example.test',
        target: { kind: 'element', locator: [{ by: 'role', role: 'button', name: 'Commit', exact: true }], tier: 'role', identity: { role: 'button', name: 'Commit' }, readRuleId: null },
      }, { kind: 'node', ref: 'e1', documentId: 'document', generation: 1 }, null, control);
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ObservedRefusal);
    if (!(caught instanceof ObservedRefusal)) throw new Error('OBSERVED_REFUSAL');
    expect(caught.code).toBe('OUTCOME_UNKNOWN');
    expect(caught.reason).toBe('OUTCOME_UNKNOWN');
    expect(caught.noEffect).toBe(false);
    expect(caught.message).toBe('OUTCOME_UNKNOWN');
    expect(caught.cause).toBeUndefined();
    expect(caught.stack ?? '').not.toContain(marker);
    expect(JSON.stringify(caught)).not.toContain(marker);
    expect(started).toBe(true);
    expect(control.phase).toBe('INVOKING');
    expect(invokes).toBe(1);
    expect(observationsTaken).toBe(0);
    expect(resolutions).toBe(0);
    expect(refLookups).toBe(0);
    expect(preparations).toBe(0);
  });
});

it('ordinary replay retains replay and allows equivalent clone before invoke-local binding', async () => {
  // Physical equivalence is checked by the invoke-local executor, without any learn document expectation.
  let invokes = 0, prepared = 0;
  const control: InvocationControl = { deadlineMs: Date.now() + 10000, phase: 'PREPARING', signal: new AbortController().signal, check: () => undefined, beginInvocation: () => undefined, poison: () => undefined, reserveObservation: () => () => undefined, waitForAdditionalObservation: () => Promise.resolve() };
  const observations = sessionStub({
    observe: () => Promise.reject(new Error('NO_REOBSERVE')),
    prepareTarget: () => { prepared++; return Promise.reject(new Error('NO_REPREPARE')); },
    invoke: (request) => { invokes++; expect(request.profile).toBe('replay'); expect(request.expect).toBeUndefined(); return Promise.resolve({}); },
  });
  const handle: BrowserHandle = { page: createFakePage(), onExtraPage: () => undefined, observedHosts: () => [], close: () => Promise.resolve(null), dispose: () => Promise.resolve() };
  await performPreparedObservedAction(handle, observations, { operation: { kind: 'click' } }, {
    guardId: 'replay-current', origin: 'https://example.test', target: { kind: 'element', locator: [{ by: 'testId', value: 'commit' }], tier: 'testId', identity: { role: 'button', name: 'Commit' }, readRuleId: null },
  }, { kind: 'node', ref: 'e1', documentId: 'old-document', generation: 1 }, null, control, undefined, 'domcontentloaded', 30000, 'replay');
  expect(invokes).toBe(1); expect(prepared).toBe(0);
});
