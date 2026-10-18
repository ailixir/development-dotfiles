import {describe,expect,it} from 'vitest';
import {performPreparedObservedAction} from '../../src/run/observedReplayAdapter.js';
import {PasswordNoEffect} from '../../src/run/passwordControl.js';
import {ObservedRefusal} from '../../src/validator/observedReferencePolicy.js';
import type {ObservationSession} from '../../src/run/observationTypes.js';
import type {BrowserHandle} from '../../src/run/browserFactory.js';
import type {InvocationControl} from '../../src/executor/observedReplay.js';
import {createFakePage} from '../helpers/child.js';
describe('positive password prewrite evidence versus native invocation fence',()=>{
  it.each(['positive-prewrite','uncertain-after-call']as const)('preserves %s usage evidence without rolling back the native fence',async mode=>{
    let nativeStarted=false,calls=0;const abort=new AbortController();
    const control:InvocationControl={deadlineMs:Date.now()+10000,signal:abort.signal,get phase(){return nativeStarted?'INVOKING':'PREPARING';},check:()=>undefined,beginInvocation:()=>{nativeStarted=true;},poison:()=>{abort.abort();},reserveObservation:()=>()=>undefined,waitForAdditionalObservation:()=>Promise.resolve()};
    const withheld:string[]=[];const observations:ObservationSession={observe:()=>Promise.reject(new Error('NO_REACQUISITION')),matches:()=>Promise.resolve(true),dispose:()=>Promise.resolve(),preparePassword:()=>Promise.resolve(),withhold:values=>{withheld.push(...values);return Promise.resolve();},fillPassword:(_target,_origin,_allowed,_value,current)=>{current?.beginInvocation();calls++;return Promise.reject(mode==='positive-prewrite'?new PasswordNoEffect('PASSWORD_FORM_ACTION_NOT_ALLOWED'):new Error('TARGET_CHANGED'));}};
    const handle:BrowserHandle={page:createFakePage(),onExtraPage:()=>undefined,observedHosts:()=>[],close:()=>Promise.resolve(null),dispose:()=>Promise.resolve()};
    let caught:unknown;try{await performPreparedObservedAction(handle,observations,{operation:{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}},{guardId:'g1',origin:'https://example.test',target:{kind:'passwordControl'}},{kind:'passwordControl',documentId:'document',generation:1},'private-password-canary',control,{secretId:'PASS',allowedOrigins:['https://example.test']});}catch(error){caught=error;}
    expect(caught).toBeInstanceOf(ObservedRefusal);expect((caught as ObservedRefusal).noEffect).toBe(mode==='positive-prewrite');expect(nativeStarted).toBe(true);expect(control.phase).toBe('INVOKING');expect(calls).toBe(1);expect(withheld).toContain('private-password-canary');
  });
});
