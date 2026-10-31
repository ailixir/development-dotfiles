import {scriptedAdapter,stepOp,stepResult} from '../helpers/stepCode.js';
import { FIXTURE_ORIGIN, TEST_DOMAINS } from '../helpers/allowedDomains.js';
import type { Observation } from '../../src/guided/types.js';
import {readFileSync} from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {publicationFixture as fixture} from '../helpers/publicationFixture.js';
import { executeObservedReplay, validateObservedExecute } from '../../src/executor/observedReplay.js';
import { assertResolvedSecretLiterals, validateReplayArtifact, validateObservedJob } from '../../src/validator/observedReplay.js';
import type { Execute3, Scope, Artifact3, ObservedJob } from '../../src/executor/observedOperations.js';
import type { ObservedAdapter } from '../../src/run/observedReplayAdapter.js';
import { ObservedRefusal, hashObserved, OBSERVED_SCHEMA_BUNDLE_HASH } from '../../src/validator/observedReferencePolicy.js';
import { guidedDispatchIdentity } from '../../src/guided/transport.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';
import { identity, hash } from '../../src/guided/contracts.js';
import { loginRequiredSignature } from '../../src/run/loginRequired.js';
import {SecretUseEvidence,frozenSecretConsumers,provenSecretUseAfterLoss,mergeSecretUseEvidence} from '../../src/run/secretUse.js';

const stepId = '00000000-0000-4000-8000-000000000031';
const nextId = '00000000-0000-4000-8000-000000000032';
const origin = FIXTURE_ORIGIN;
const scope: Scope = {...fixture.job.binding.scope as Scope, initialContext: {kind: 'observedDocument', origin}};
function frame(): Execute3 {
  return {...fixture.execute as Execute3, inputs: [{inputId: 'pass', stepId, kind: 'secretRef', referenceName: 'PASS'}], secrets: {PASS: 'run-scoped-canary', UNREACHED: 'other-canary'}, secretOrigins: {PASS: [origin]}, bindings: [], transfers: [],
    steps: [{stepIndex: 0, stepId, operations: [{coordinate: {stepId, ordinal: 0}, guardId: 'g0', operation: stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', {uses: [{kind: 'secret', id: 'PASS'}]})}]}], guards: [{guardId: 'g0', origin}]};
}
function adapter(refused = false): ObservedAdapter {
  return scriptedAdapter((action, _guard, io, control) => { expect(io.secrets).toEqual({PASS: 'run-scoped-canary', UNREACHED: 'other-canary'}); expect(io.secretIds).toEqual(['PASS']); expect(io.secretOrigins.PASS).toEqual([origin]); control.beginInvocation(); for (const id of io.secretIds) { io.secretUse.attempting(id); if (refused) io.secretUse.refusedBeforeEffect(id); else io.secretUse.used(id); } if (refused) return Promise.reject(new ObservedRefusal('POLICY_REFUSED',undefined,true)); return Promise.resolve(stepResult(action)); });
}
const run = (message: Execute3, browser: ObservedAdapter) => executeObservedReplay(message, browser, scope, TEST_DOMAINS, {now: () => performance.now()}, {stepStarted() { return; }, stepFinished() { return; }}, new AbortController().signal);
function secretArtifact(): Artifact3 {
  const message=frame(),operation=message.steps[0]?.operations[0];if(!operation)throw Error('ACTION');
  const projection={coordinate:operation.coordinate,origin,operation:operation.operation};
  const learnedPlan={...(fixture.artifact as Artifact3).learnedPlan,initialContext:scope.initialContext,sourceSteps:[stepId],actions:[{...projection,admissionId:'secret-admission',operationHash:hashObserved(projection)}],bindings:[]};
  const learnedPlanHash=hashObserved(learnedPlan),requirements={...fixture.artifact.replayPolicy.scope as Artifact3['replayPolicy']['scope'],initialContext:scope.initialContext};
  const inputs:Artifact3['inputRecipes']=[{inputId:'pass',stepId,kind:'secretRef',provenance:{kind:'configuration',referenceId:'reference-pass',referenceName:'PASS'}}];
  return {...fixture.artifact as Artifact3,learnedPlan,learnedPlanHash,inputRecipes:inputs,steps:message.steps,guards:message.guards,replayPolicy:{...fixture.artifact.replayPolicy as Artifact3['replayPolicy'],learnedPlanHash,scope:requirements,inputs,bindings:[],transfers:[]}};
}
function resealArtifact(artifact:Artifact3):void {
  for(const action of artifact.learnedPlan.actions)Object.assign(action,{operationHash:hashObserved({coordinate:action.coordinate,origin:action.origin,operation:action.operation})});
  const learnedPlanHash=hashObserved(artifact.learnedPlan);Object.assign(artifact,{learnedPlanHash});Object.assign(artifact.replayPolicy,{learnedPlanHash});
}
function secretJob():ObservedJob {
  const job=structuredClone(fixture.job) as ObservedJob,artifact=secretArtifact(),scopeHash=hashObserved(scope);
  Object.assign(job,{artifact,inputs:[],secrets:{PASS:'run-scoped-canary',UNREACHED:'other-canary'},secretOrigins:{PASS:[origin]}});
  Object.assign(job.binding,{scope,scopeHash,artifactHash:hashObserved(artifact),learnedPlanHash:artifact.learnedPlanHash,referencePolicyHash:hashObserved(artifact.replayPolicy),requiredBuild:{...currentBuild}});
  Object.assign(job.binding.replayGrant,{scopeHash,buildHash:hashObserved(currentBuild)});return job;
}
// Bind the current generated schema bytes without rewriting historical fixture build metadata.
const currentBuild={...fixture.job.binding.requiredBuild,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
const validateJob=(job:ObservedJob)=>validateObservedJob(job,currentBuild,TEST_DOMAINS,Date.parse(job.binding.replayGrant.issuedAt));
describe('value-free artifact graph versus strict released-value boundaries',()=>{
  it('validates a configuration secret recipe without supplying a secret value or execution authority',()=>{
    const artifact=secretArtifact();expect(validateReplayArtifact(artifact)).toEqual(artifact);
    expect(JSON.stringify(artifact)).not.toContain('run-scoped-canary');
    expect(validateJob(secretJob()).secrets).toEqual({PASS:'run-scoped-canary',UNREACHED:'other-canary'});
  });
  it.each(['sourceSpan','missing-name','bad-name','wrong-step','wrong-kind','non-secret-step','operation-hash','plan-hash','recipe-join','capability'] as const)('rejects static secret graph mutation: %s',mutation=>{
    const artifact=secretArtifact(),input=artifact.inputRecipes[0],action=artifact.learnedPlan.actions[0],guard=artifact.guards[0];if(!input||!action||!guard)throw Error('GRAPH');
    if(mutation==='sourceSpan')Object.assign(input,{provenance:{kind:'sourceSpan',start:0,end:1,sourceHash:artifact.sourceHash}});
    if(mutation==='missing-name')Object.assign(input.provenance,{referenceName:undefined});
    if(mutation==='bad-name')Object.assign(input.provenance,{referenceName:'not canonical'});
    if(mutation==='wrong-step')Object.assign(input,{stepId:nextId});
    if(mutation==='wrong-kind')Object.assign(input,{kind:'nonsecretText'});
    if(mutation==='non-secret-step'){Object.assign(action,{operation:stepOp('await page.locator("button").click();')});Object.assign(artifact.steps[0]?.operations[0]??{},{operation:action.operation});resealArtifact(artifact);}
    if(mutation==='operation-hash')Object.assign(action,{operationHash:'0'.repeat(64)});
    if(mutation==='plan-hash')Object.assign(artifact,{learnedPlanHash:'0'.repeat(64)});
    if(mutation==='recipe-join')Object.assign(artifact.replayPolicy,{inputs:[]});
    if(mutation==='capability')Object.assign(artifact.replayPolicy.scope,{capabilities:['navigate']});
    expect(()=>validateReplayArtifact(artifact)).toThrow();
  });
  it.each(['missing','inherited','empty','oversize','non-string','bad-key','too-many'] as const)('retains strict actual Execute refusal: %s',mutation=>{
    const message=frame();
    if(mutation==='missing')Object.assign(message,{secrets:{UNREACHED:'other-canary'}});
    if(mutation==='inherited')Object.assign(message,{secrets:Object.create({PASS:'run-scoped-canary'}) as unknown});
    if(mutation==='empty')Object.assign(message,{secrets:{PASS:''}});
    if(mutation==='oversize')Object.assign(message,{secrets:{PASS:'a'.repeat(4097)}});
    if(mutation==='non-string')Object.assign(message,{secrets:{PASS:42}});
    if(mutation==='bad-key')Object.assign(message,{secrets:{PASS:'run-scoped-canary','bad key':'other'}});
    if(mutation==='too-many')Object.assign(message,{secrets:{PASS:'run-scoped-canary',...Object.fromEntries(Array.from({length:64},(_,i)=>['EXTRA'+String(i),'other']))}});
    expect(()=>validateObservedExecute(message,scope, TEST_DOMAINS)).toThrow();
    if(mutation==='missing')expect(()=>validateObservedExecute(message,scope, TEST_DOMAINS)).toThrow('REFERENCE_MISMATCH');
  });
  it.each(['missing','inherited','artifact-hash','build','grant','scope','wrong-coordinate'] as const)('retains strict actual Job refusal after static success: %s',mutation=>{
    const job=secretJob();expect(()=>validateReplayArtifact(job.artifact)).not.toThrow();
    if(mutation==='missing')Object.assign(job,{secrets:{UNREACHED:'other-canary'}});
    if(mutation==='inherited')Object.assign(job,{secrets:Object.create({PASS:'run-scoped-canary'}) as unknown});
    if(mutation==='artifact-hash')Object.assign(job.binding,{artifactHash:'0'.repeat(64)});
    if(mutation==='build')Object.assign(job.binding.requiredBuild,{profileHash:'0'.repeat(64)});
    if(mutation==='grant')Object.assign(job.binding.replayGrant,{attemptId:nextId});
    if(mutation==='scope')Object.assign(job.binding.scope,{principalId:'other-user'});
    if(mutation==='wrong-coordinate')Object.assign(job.artifact.inputRecipes[0]??{},{stepId:nextId});
    expect(()=>validateJob(job)).toThrow();
    if(mutation==='missing')expect(()=>validateJob(job)).toThrow('REFERENCE_MISMATCH');
  });
  it('keeps execution callers on the strict wrapper and static helper limited to its two production consumers',async()=>{
    const source=(path:string)=>ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const executor=source('../../src/executor/observedReplay.ts'),validator=source('../../src/validator/observedReplay.ts'),runtime=source('../../src/run/childRuntime.ts');
    const calls=(file:ts.SourceFile,name:string)=>{
      const result:ts.CallExpression[]=[];
      const visit=(node:ts.Node):void=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===name)result.push(node);ts.forEachChild(node,visit);};
      visit(file);return result;
    };
    const namedFunction=(node:ts.Node):ts.FunctionDeclaration|undefined=>{
      for(let current=node.parent;!ts.isSourceFile(current);current=current.parent)if(ts.isFunctionDeclaration(current))return current;
      return undefined;
    };
    const args=(call:ts.CallExpression)=>call.arguments.map(argument=>argument.getText());
    expect(calls(executor,'validateObservedExecute').map(call=>({owner:namedFunction(call)?.name?.text,args:args(call)}))).toEqual([{owner:'executeObservedReplay',args:['message','scope','allowedDomains','acceptedLaunch']}]);
    expect(calls(runtime,'validateObservedExecute').map(args)).toEqual([['value','launch.scope','dependencies.allowedDomains','launch']]);
    expect(calls(runtime,'executeObservedReplay').map(call=>args(call).at(-1))).toEqual(['fixed']);
    const variables:ts.VariableDeclaration[]=[];
    const collectVariables=(node:ts.Node):void=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='fixed')variables.push(node);ts.forEachChild(node,collectVariables);};
    collectVariables(runtime);expect(variables.map(variable=>variable.initializer?.getText())).toEqual(['launch']);
    expect(calls(validator,'validatePublishedArtifactGraph').map(args)).toEqual([['a']]);
    expect(calls(validator,'validateObservedExecute')).toEqual([]);
    const graphCalls=calls(executor,'validateGraph');
    expect(graphCalls.map(call=>namedFunction(call)?.name?.text).sort()).toEqual(['validateObservedExecute','validateObservedReplayGraph','validatePublishedArtifactGraph'].sort());
    const functions=executor.statements.filter(ts.isFunctionDeclaration);
    const privateGraph=functions.find(fn=>fn.name?.text==='validateGraph');
    expect(privateGraph).toBeDefined();expect(privateGraph?.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)??false).toBe(false);
    const strict=functions.find(fn=>fn.name?.text==='validateObservedReplayGraph');
    expect(strict?.parameters).toHaveLength(3);
    expect(graphCalls.filter(call=>namedFunction(call)===strict).map(args)).toEqual([['domainCheck(allowedDomains)','m','scope','new Set()']]);
    for(const name of ['validatePublishedArtifactGraph','validateObservedReplayGraph']){
      const body=functions.find(fn=>fn.name?.text===name)?.body?.getText();expect(body).toBeDefined();
      expect(body).not.toContain('.secrets');expect(body).not.toContain('secretOrigins');expect(body).not.toContain('return m');
    }
    // Value-free artifact success never authorizes a frame missing the released secret.
    expect(()=>validateReplayArtifact(secretArtifact())).not.toThrow();
    const message=frame(),browser=adapter();Object.assign(message,{secrets:{UNREACHED:'other-canary'}});
    let performed=0,withheld=0;browser.perform=()=>{performed++;return Promise.reject(Error('UNEXPECTED_NATIVE'));};browser.withhold=()=>{withheld++;return Promise.resolve();};
    await expect(run(message,browser)).rejects.toThrow('REFERENCE_MISMATCH');expect(performed).toBe(0);expect(withheld).toBe(0);
  });
});
describe('run-scoped secret metadata and usage summary', () => {
  it('uses only the declared step/slot and reports declared-but-unreached values separately', async () => {
    expect(await run(frame(), adapter())).toEqual({ok: true, errorCode: null, secretUse: {PASS: 'USED', UNREACHED: 'NOT_USED'}});
    expect(await run(frame(), adapter(true))).toEqual({ok: false, errorCode: 'POLICY_REFUSED', secretUse: {PASS: 'REFUSED', UNREACHED: 'NOT_USED'}});
  });
  it('rejects mismatched secret step metadata before a browser operation', () => {
    const message = frame(); (message.inputs[0] as {stepId: string}).stepId = nextId;
    expect(() => validateObservedExecute(message, scope, TEST_DOMAINS)).toThrow('REFERENCE_MISMATCH');
  });
  it('omits uncertain invocation status instead of fabricating a refusal',async()=>{
    const browser=adapter();browser.perform=(_action,_guard,io,control)=>{control.beginInvocation();for(const id of io.secretIds)io.secretUse.attempting(id);return Promise.reject(new Error('transport interrupted after possible typing'));};
    const result=await run(frame(),browser);expect(result.ok).toBe(false);expect(result.secretUse).toEqual({UNREACHED:'NOT_USED'});
  });
  it('keeps confirmed use monotone through later unknown or pre-effect refusal',()=>{
    const facts=new SecretUseEvidence(['PASS','UNREACHED','__proto__']);facts.attempting('PASS');expect(facts.snapshot()).toEqual({UNREACHED:'NOT_USED',['__proto__']:'NOT_USED'});
    facts.used('PASS');facts.attempting('PASS');facts.refusedBeforeEffect('PASS');expect(facts.snapshot().PASS).toBe('USED');
    facts.attempting('UNREACHED');facts.refusedBeforeEffect('UNREACHED');expect(facts.snapshot().UNREACHED).toBe('REFUSED');expect(Object.hasOwn(facts.snapshot(),'__proto__')).toBe(true);
  });
  it('uses authenticated step receipts to distinguish child-loss uncertainty from unreached inputs',()=>{
    const steps=[{stepIndex:0,stepId,operations:[{coordinate:{stepId,ordinal:0},guardId:'g0',operation:{kind:'step' as const,code:'await page.locator("input").fill(secrets["PASS"]);',captures:[],uses:[{kind:'secret' as const,id:'PASS'},{kind:'secret' as const,id:'PASS'}],sourceHash:'0'.repeat(64)}}]}];
    expect(frozenSecretConsumers(steps)).toEqual(new Map([[0,['PASS']]]));
    expect(provenSecretUseAfterLoss(['PASS','UNREACHED'],steps,false,new Map())).toEqual({PASS:'NOT_USED',UNREACHED:'NOT_USED'});
    expect(provenSecretUseAfterLoss(['PASS','UNREACHED'],steps,true,new Map())).toEqual({UNREACHED:'NOT_USED'});
    expect(provenSecretUseAfterLoss(['PASS'],steps,true,new Map([[0,'PASS']]))).toEqual({PASS:'USED'});
    expect(provenSecretUseAfterLoss(['PASS'],steps,true,new Map([[0,'FAILED']]))).toEqual({});
  });
  it('merges sparse finals with authenticated facts and rejects contradictions without erasing positive use',()=>{
    expect(mergeSecretUseEvidence({PASS:'USED',UNREACHED:'NOT_USED'},{},['PASS','UNREACHED']).facts).toEqual({PASS:'USED',UNREACHED:'NOT_USED'});
    expect(mergeSecretUseEvidence({PASS:'USED'},{PASS:'REFUSED'},['PASS'])).toEqual({facts:{PASS:'USED'},contradictory:true});
    expect(mergeSecretUseEvidence({},{PASS:'USED'},['PASS'])).toEqual({facts:{PASS:'USED'},contradictory:false});
    expect(mergeSecretUseEvidence({},undefined,['PASS'])).toEqual({facts:{},contradictory:false});
    expect(mergeSecretUseEvidence({PASS:'NOT_USED'},{PASS:'USED',OTHER:'USED'},['PASS'])).toEqual({facts:{PASS:'NOT_USED'},contradictory:true});
  });
  it('refuses transient literals equal to resolved declared values', () => {
    const message = frame(); (message.inputs as unknown[]).push({inputId: 'literal', stepId, kind: 'nonsecretText', value: 'run-scoped-canary'});
    (message.steps[0]?.operations[0] as {operation: unknown}).operation = stepOp('await page.locator("input").fill(inputs["literal"]);', {uses: [{kind: 'input', id: 'literal'}]});
    expect(() => { assertResolvedSecretLiterals(message); }).toThrow('REFERENCE_MISMATCH');
  });
  it.each([false, true])('annotates only existing drift with loginStepsPresent=%s', async loginStepsPresent => {
    const message = frame();
    const failingStep = {stepIndex: loginStepsPresent ? 1 : 0, stepId: nextId, operations: [{coordinate: {stepId: nextId, ordinal: 0}, guardId: loginStepsPresent ? 'g1' : 'g0', operation: stepOp('await page.getByRole("button", {name: "Report", exact: true}).click();')}]};
    if (loginStepsPresent) { (message.steps as unknown[]).push(failingStep); (message.guards as unknown[]).push({...message.guards[0], guardId: 'g1'}); }
    else { (message as {steps: unknown}).steps = [failingStep]; (message as {inputs: unknown}).inputs = []; (message as {guards: unknown}).guards = [{...message.guards[0]}]; }
    const browser = adapter(); const fill = browser.perform.bind(browser); browser.loginRequired = () => true; browser.perform = (action, guard, io, control, tally) => action.operation.uses.some(use => use.kind === 'secret') ? fill(action, guard, io, control, tally) : Promise.resolve(stepResult(action, {}, {closedCode: 'TARGET_DRIFT', fenceCrossed: false, effects: []}));
    expect(await run(message, browser)).toMatchObject({ok: false, errorCode: 'LOGIN_REQUIRED', detail: {stepId: nextId, loginStepsPresent}});
  });
});

it('strips the complete guided secret frame from its digest while retaining only safe identity', () => {
  const context = guidedContext(origin); context.sourceStepIds = ['fill'];
  const evidence = {kind: 'observedDocument' as const, sessionId: context.sessionId, contextId: context.contextId, documentId: 'login-document', generation: 1, origin, observationHash: 'c'.repeat(64)};
  const action = proposal(context, evidence, 'fill', stepOp('await page.locator("input").fill(secrets["PASS"]);', {uses: [{kind: 'secret', id: 'PASS'}]}));
  const proof = {...identity(context), preparationId: 'preparation', requestDigest: hash(action), evidenceHash: hash(evidence), authoredInputsHash: context.authoredInputsHash, expiresAt: context.expiresAt};
  const secret = {secretId: 'PASS', value: 'canary-one', versionId: 'v1', allowedOrigins: [origin]};
  const body = {...dispatch(context, action, proof), secrets: [secret]};
  const initial = guidedDispatchIdentity(body), rotated = guidedDispatchIdentity({...body, secrets: [{...secret, value: 'canary-two'}]});
  expect(rotated).toEqual(initial); expect(JSON.stringify(initial)).not.toContain('canary');
  const swapped = guidedDispatchIdentity({...body, secrets: [{...secret, secretId: 'OTHER'}]}); expect(swapped.digest).toBe(initial.digest); expect(swapped.secretIdentity).not.toBe(initial.secretIdentity);
});

it('computes structural signature independently of localized labels', () => {
  const observation = structuredClone(fixture.basis.observations[0]?.observation) as Observation | undefined; if (!observation) throw new Error('OBSERVATION');
  (observation.coverage as {passwordControls: number}).passwordControls = 1; expect(loginRequiredSignature(observation)).toBe(Object.values(observation.facts).some(fact => fact.role === 'button'));
  (observation.coverage as {passwordControls: number}).passwordControls = 0; expect(loginRequiredSignature(observation)).toBe(false);
});
