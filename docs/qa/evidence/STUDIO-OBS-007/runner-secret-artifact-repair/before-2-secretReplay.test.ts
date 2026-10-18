import type { Observation } from '../../src/run/observationTypes.js';
import { describe, expect, it } from 'vitest';
import fixture from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with {type: 'json'};
import { executeObservedReplay, validateObservedExecute } from '../../src/executor/observedReplay.js';
import { assertResolvedSecretLiterals } from '../../src/validator/observedReplay.js';
import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import type { ObservedAdapter } from '../../src/run/observedReplayAdapter.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { guidedDispatchIdentity, createGuidedServer } from '../../src/guided/transport.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';
import { identity, hash } from '../../src/guided/contracts.js';
import { loginRequiredSignature } from '../../src/run/loginRequired.js';
import {SecretUseEvidence,provenSecretUseAfterLoss,mergeSecretUseEvidence} from '../../src/run/secretUse.js';
import {testTls,testFingerprint,jwtPolicy} from '../helpers/guidedTls.js';

const stepId = '00000000-0000-4000-8000-000000000031';
const nextId = '00000000-0000-4000-8000-000000000032';
const origin = fixture.job.binding.scope.allowedOrigins[0] ?? '';
const scope: Scope = {...fixture.job.binding.scope as Scope, initialContext: {kind: 'observedDocument', origin}};
function frame(): Execute3 {
  return {...fixture.execute as Execute3, inputs: [{inputId: 'pass', stepId, kind: 'secretRef', intendedSlot: 'fill.value', referenceName: 'PASS'}], secrets: {PASS: 'run-scoped-canary', UNREACHED: 'other-canary'}, secretOrigins: {PASS: [origin]}, bindings: [], transfers: [],
    steps: [{stepIndex: 0, stepId, operations: [{coordinate: {stepId, ordinal: 0}, guardId: 'g0', operation: {kind: 'fill', value: {kind: 'secretRef', sourceInputId: 'pass'}}}]}], guards: [{guardId: 'g0', origin, target: {kind: 'passwordControl'}}]};
}
function adapter(refused = false): ObservedAdapter {
  return { perform(_action, _guard, value, control, secret) { expect(value).toBe('run-scoped-canary'); expect(secret).toEqual({secretId: 'PASS', allowedOrigins: [origin]}); control.beginInvocation(); if (refused) return Promise.reject(new ObservedRefusal('POLICY_REFUSED',undefined,true)); return Promise.resolve({}); }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); }};
}
const run = (message: Execute3, browser: ObservedAdapter) => executeObservedReplay(message, browser, scope, {now: () => performance.now()}, {stepStarted() { return; }, stepFinished() { return; }}, new AbortController().signal);
it('refuses a guided worker capacity above one before browser or socket creation',()=>{
  let opened=0;
  expect(()=>{createGuidedServer({workerId:'worker-one',journalDirectory:'/not-opened',rules:[],tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,capacity:2,launch(){opened++;return Promise.reject(new Error('UNEXPECTED'));},claim(){return Promise.reject(new Error('UNEXPECTED'));},callback(){return Promise.resolve();}});}).toThrow('CONFIGURATION_DENIED');
  expect(opened).toBe(0);
});
describe('run-scoped secret metadata and usage summary', () => {
  it('uses only the declared step/slot and reports declared-but-unreached values separately', async () => {
    expect(await run(frame(), adapter())).toEqual({ok: true, errorCode: null, secretUse: {PASS: 'USED', UNREACHED: 'NOT_USED'}});
    expect(await run(frame(), adapter(true))).toEqual({ok: false, errorCode: 'POLICY_REFUSED', secretUse: {PASS: 'REFUSED', UNREACHED: 'NOT_USED'}});
  });
  it('rejects mismatched secret step metadata before a browser operation', () => {
    const message = frame(); (message.inputs[0] as {stepId: string}).stepId = nextId;
    expect(() => validateObservedExecute(message, scope)).toThrow('REFERENCE_MISMATCH');
  });
  it('omits uncertain invocation status instead of fabricating a refusal',async()=>{
    const browser=adapter();browser.perform=(_action,_guard,_value,control)=>{control.beginInvocation();return Promise.reject(new Error('transport interrupted after possible typing'));};
    const result=await run(frame(),browser);expect(result.ok).toBe(false);expect(result.secretUse).toEqual({UNREACHED:'NOT_USED'});
  });
  it('keeps confirmed use monotone through later unknown or pre-effect refusal',()=>{
    const facts=new SecretUseEvidence(['PASS','UNREACHED','__proto__']);facts.attempting('PASS');expect(facts.snapshot()).toEqual({UNREACHED:'NOT_USED',['__proto__']:'NOT_USED'});
    facts.used('PASS');facts.attempting('PASS');facts.refusedBeforeEffect('PASS');expect(facts.snapshot().PASS).toBe('USED');
    facts.attempting('UNREACHED');facts.refusedBeforeEffect('UNREACHED');expect(facts.snapshot().UNREACHED).toBe('REFUSED');expect(Object.hasOwn(facts.snapshot(),'__proto__')).toBe(true);
  });
  it('uses authenticated step receipts to distinguish child-loss uncertainty from unreached inputs',()=>{
    const message=frame();const recipes=[{inputId:'pass',stepId,kind:'secretRef' as const,intendedSlot:'fill.value' as const,provenance:{kind:'configuration' as const,referenceId:'reference-pass',referenceName:'PASS'}}];
    expect(provenSecretUseAfterLoss(['PASS','UNREACHED'],recipes,message.steps,false,new Map())).toEqual({PASS:'NOT_USED',UNREACHED:'NOT_USED'});
    expect(provenSecretUseAfterLoss(['PASS','UNREACHED'],recipes,message.steps,true,new Map())).toEqual({UNREACHED:'NOT_USED'});
    expect(provenSecretUseAfterLoss(['PASS'],recipes,message.steps,true,new Map([[0,'PASS']]))).toEqual({PASS:'USED'});
    expect(provenSecretUseAfterLoss(['PASS'],recipes,message.steps,true,new Map([[0,'FAILED']]))).toEqual({});
  });
  it('merges sparse finals with authenticated facts and rejects contradictions without erasing positive use',()=>{
    expect(mergeSecretUseEvidence({PASS:'USED',UNREACHED:'NOT_USED'},{},['PASS','UNREACHED']).facts).toEqual({PASS:'USED',UNREACHED:'NOT_USED'});
    expect(mergeSecretUseEvidence({PASS:'USED'},{PASS:'REFUSED'},['PASS'])).toEqual({facts:{PASS:'USED'},contradictory:true});
    expect(mergeSecretUseEvidence({},{PASS:'USED'},['PASS'])).toEqual({facts:{PASS:'USED'},contradictory:false});
    expect(mergeSecretUseEvidence({},undefined,['PASS'])).toEqual({facts:{},contradictory:false});
    expect(mergeSecretUseEvidence({PASS:'NOT_USED'},{PASS:'USED',OTHER:'USED'},['PASS'])).toEqual({facts:{PASS:'NOT_USED'},contradictory:true});
  });
  it('rechecks secret metadata at perform after a tampering setup hook', async () => {
    const message = frame(); (message.inputs as unknown[]).push({inputId: 'unused', stepId, kind: 'nonsecretText', intendedSlot: 'fill.value', value: 'literal'});
    const browser = adapter(); browser.withhold = () => { (message.inputs[0] as {stepId: string}).stepId = nextId; return Promise.resolve(); };
    expect(await run(message, browser)).toMatchObject({ok: false, errorCode: 'REFERENCE_MISMATCH', secretUse: {PASS: 'NOT_USED'}});
  });
  it('refuses transient literals equal to resolved declared values', () => {
    const message = frame(); (message.inputs as unknown[]).push({inputId: 'literal', stepId, kind: 'nonsecretText', intendedSlot: 'fill.value', value: 'run-scoped-canary'});
    (message.steps[0]?.operations[0] as {operation: unknown}).operation = {kind: 'fill', value: {kind: 'authoredLiteral', sourceInputId: 'literal'}};
    expect(() => { assertResolvedSecretLiterals(message); }).toThrow('REFERENCE_MISMATCH');
  });
  it.each([false, true])('annotates only existing drift with loginStepsPresent=%s', async loginStepsPresent => {
    const message = frame();
    const failingStep = {stepIndex: loginStepsPresent ? 1 : 0, stepId: nextId, operations: [{coordinate: {stepId: nextId, ordinal: 0}, guardId: loginStepsPresent ? 'g1' : 'g0', operation: {kind: 'click' as const}}]};
    if (loginStepsPresent) { (message.steps as unknown[]).push(failingStep); (message.guards as unknown[]).push({...message.guards[0], guardId: 'g1', target: {kind: 'element', locator: {kind: 'role', role: 'button', name: 'Report', exact: true}, role: 'button', elementType: 'button', controlType: 'none', classification: 'structuralOnly', visible: true, actionable: true, readRuleId: null}}); }
    else { (message as {steps: unknown}).steps = [failingStep]; (message as {inputs: unknown}).inputs = []; (message as {guards: unknown}).guards = [{...message.guards[0], target: {kind: 'element', locator: {kind: 'role', role: 'button', name: 'Report', exact: true}, role: 'button', elementType: 'button', controlType: 'none', classification: 'structuralOnly', visible: true, actionable: true, readRuleId: null}}]; }
    const browser = adapter(); const fill = browser.perform.bind(browser); browser.loginRequired = () => true; browser.perform = (action, guard, value, control, secret) => action.operation.kind === 'fill' ? fill(action, guard, value, control, secret) : Promise.reject(new ObservedRefusal('TARGET_DRIFT'));
    expect(await run(message, browser)).toMatchObject({ok: false, errorCode: 'LOGIN_REQUIRED', detail: {stepId: nextId, loginStepsPresent}});
  });
});

it('strips the complete guided secret frame from its digest while retaining only safe identity', () => {
  const context = guidedContext(origin); context.sourceStepIds = ['fill'];
  const evidence = {kind: 'observedDocument' as const, sessionId: context.sessionId, contextId: context.contextId, documentId: 'login-document', generation: 1, origin, observationHash: 'c'.repeat(64)};
  const action = proposal(context, evidence, 'fill', {kind: 'fill', value: {kind: 'secretRef', sourceInputId: 'secret-input'}}, {kind: 'passwordControl', documentId: evidence.documentId, generation: 1});
  const proof = {...identity(context), preparationId: 'preparation', requestDigest: hash(action), evidenceHash: hash(evidence), authoredInputsHash: context.authoredInputsHash, expiresAt: context.expiresAt};
  const body = {...dispatch(context, action, proof), secret: {secretId: 'PASS', value: 'canary-one', versionId: 'v1', allowedOrigins: [origin]}};
  const initial = guidedDispatchIdentity(body), rotated = guidedDispatchIdentity({...body, secret: {...body.secret, value: 'canary-two', versionId: 'v2'}});
  expect(rotated).toEqual(initial); expect(JSON.stringify(initial)).not.toContain('canary');
  const swapped = guidedDispatchIdentity({...body, secret: {...body.secret, secretId: 'OTHER'}}); expect(swapped.digest).toBe(initial.digest); expect(swapped.secretIdentity).not.toBe(initial.secretIdentity);
});

it('computes structural signature independently of localized labels', () => {
  const observation = structuredClone(fixture.basis.observations[0]?.observation) as Observation | undefined; if (!observation) throw new Error('OBSERVATION');
  observation.coverage.passwordControls = 1; expect(loginRequiredSignature(observation)).toBe(observation.nodes.some(node => node.visible && node.actionable && (node.elementType === 'button' || node.elementType === 'input' || node.role === 'button')));
  observation.coverage.passwordControls = 0; expect(loginRequiredSignature(observation)).toBe(false);
});
