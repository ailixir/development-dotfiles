import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {ObservedRefusal} from '../../src/validator/observedReferencePolicy.js';
import {GuidedJournal} from '../../src/guided/journal.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import {guidedContext,dispatch,proposal,ownershipSession} from '../helpers/guided.js';
import {stepOp} from '../helpers/stepCode.js';
import {fakeHandle,newRig} from '../helpers/stepFakes.js';
import type {BridgeBootstrap,BridgePrefixPrepare,BridgeObservation,BridgeNativeFenceEvent,PrefixAction} from '../../src/guided/types.js';
import type {GuidedBrowser} from '../../src/run/guidedBrowser.js';
const STEP_IDS={nav:'00000000-0000-4000-8000-000000000001',read:'00000000-0000-4000-8000-000000000002',next:'00000000-0000-4000-8000-000000000003',fill:'00000000-0000-4000-8000-000000000004',submit:'00000000-0000-4000-8000-000000000005'} as const;
const DELIVERY_IDS={original:'00000000-0000-4000-8000-000000001001',other:'00000000-0000-4000-8000-000000001002',metadata:'00000000-0000-4000-8000-000000001003',gap:'00000000-0000-4000-8000-000000001004'} as const;
const clean:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
const NAV_CODE='await page.goto(inputs["input-nav"]);';
const nextOp=()=>stepOp('await page.goto(inputs["input-next"]);',{uses:[{kind:'input',id:'input-next'}]});
/** A prefix step whose target is gone: it fails before its first effectful call (TARGET_DRIFT, no fence). */
const MISS="await page.locator('#gone').click();";
async function harness(options:{code?:string;loseDriftAck?:boolean;programPair?:'empty'|'missing-program'|'missing-hash'}={}){
  const directory=await mkdtemp(join(tmpdir(),'prefix-unit-'));clean.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext('https://example.test');
  // Declared synthetic server-issued UUIDs/counters, never an invented legacy success.
  const issued=(label:string):string=>{const value=Object.entries(STEP_IDS).find(([name])=>name===label)?.[1];if(!value)throw new Error('UNDECLARED_STEP');return value;};
  context.sourceStepIds=context.sourceStepIds.map(issued);context.sourceRevision='1';context.configurationRevision='1';
  context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';
  for(const input of context.authoredInputs.inputs){input.sourceStepId=issued(input.sourceStepId);input.provenance.stepId=issued(input.provenance.stepId);if(input.provenance.referenceKind==='sourceSpan')input.provenance.sourceRevision='1';else input.provenance.configurationRevision='1';}
  for(const allocation of context.allocations){allocation.producerStepId=issued(allocation.producerStepId);for(const consumer of allocation.consumers)consumer.stepId=issued(consumer.stepId);}
  const grant=ownershipSession(context);context.leaseExpiresAt=grant.owner.leaseExpiresAt;

  const coordinate={stepId:STEP_IDS.nav,ordinal:0},operation=options.code===undefined?stepOp(NAV_CODE,{uses:[{kind:'input',id:'input-nav'}]}):stepOp(options.code);
  const action:PrefixAction={coordinate,origin:null,operation,operationHash:hash({coordinate,origin:null,operation}),guard:{guardId:'g0',origin:null}};
  const prefixActions:PrefixAction[]=[action];
  context.prefixProgram={schemaVersion:3,baseRevisionId:'00000000-0000-4000-8000-000000000999',baseRevisionDigest:'b'.repeat(64),sourceStepIds:[STEP_IDS.nav],actions:prefixActions};context.prefixProgramHash=hash(context.prefixProgram);
  if(options.programPair==='empty'){context.prefixProgram={...context.prefixProgram,actions:[],sourceStepIds:[]};context.prefixProgramHash=hash(context.prefixProgram);}
  if(options.programPair==='missing-program')delete context.prefixProgram;
  if(options.programPair==='missing-hash')delete context.prefixProgramHash;
  const messages:{route:string;body:unknown;key?:string}[]=[];let generation=0;
  const rig=newRig('about:blank',{withhold:vi.fn(()=>Promise.resolve()),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'page',generation:++generation,origin:'https://example.test',observedAt:new Date().toISOString(),coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:0},projection:{projected:false,tier:null,totalNodes:1,shownNodes:1,notShown:0,outlineBytes:15},outline:'- text "x" [e1]',facts:{e1:{role:'text',name:'x',editable:false, nameComplete: true, ownTextComplete: true,evidence:'x',evidenceSegments:[]}}},json:'',bytes:0,observationHash:''}),dispose:()=>Promise.resolve()});
  const blank=vi.fn(()=>Promise.resolve(true)),effect=vi.fn(()=>{rig.w.effects.push('goto');return Promise.resolve();});
  rig.page.goto=effect;if(options.code===MISS)rig.w.matches['#gone']=0;
  const createObservationSession=vi.fn(()=>{throw new Error('SECOND_OBSERVATION_SESSION');});
  const handle={...fakeHandle(rig),createObservationSession};
  const browser:GuidedBrowser={handle,evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:'create',bootstrapId:'bootstrap',documentId:'blank',url:'about:blank',origin:null,generation:0},blankMatches:blank,close:vi.fn(()=>Promise.resolve()),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:rig.session};
  const launch=vi.fn(()=>Promise.resolve(browser));
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,launch,capabilities:grant.scope.capabilities,callback:(route,body,key)=>{messages.push({route,body,...key?{key}:{}});return options.loseDriftAck&&route==='outcomes'?Promise.reject(new Error('ACK_LOST')):Promise.resolve();}});clean.push(()=>runtime.stop('CANCELLED'));await runtime.start();
  const evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;
  if(!context.prefixProgramHash)throw Error('PROGRAM_HASH');
  const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:context.prefixProgramHash,coordinate,evidenceHash:hash(evidence)};
  const prepare:BridgePrefixPrepare={kind:'prefix',request,requestDigest:hash(request)};
  return {context,runtime,browser,messages,launch,handle,blank,effect,createObservationSession,prepare,directory,rig};
}
describe('incremental prefix retains live guided authority',()=>{

  it('prepares and performs on the same handle/session then learns suffix without another launch',async()=>{
    const h=await harness(),observations=h.browser.observations;
    const result=await h.runtime.preparePrefix(h.prepare);expect(result.kind).toBe('PREPARED');
    expect(await h.runtime.preparePrefix(h.prepare)).toEqual(result);
    const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('SUCCEEDED');
    expect(h.effect).toHaveBeenCalledOnce();expect(h.launch).toHaveBeenCalledOnce();expect(h.createObservationSession).not.toHaveBeenCalled();expect(h.browser.observations).toBe(observations);
    const o=(h.messages.find(m=>m.route==='observations')?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    const p=proposal(h.context,evidence,STEP_IDS.next,nextOp()),prepared=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    expect((await h.runtime.dispatch(dispatch(h.context,p,prepared))).ledger.state).toBe('SUCCEEDED');expect(h.launch).toHaveBeenCalledOnce();
  });
  it('persists exact admitted pre-native refusal and keeps spent admission unusable',async()=>{
    const h=await harness({code:MISS}),result=await h.runtime.preparePrefix(h.prepare);
    const request=dispatch(h.context,structuredClone(result.proposal),result.preparation),outcome=await h.runtime.dispatch(request);
    expect(outcome.ledger).toMatchObject({state:'FAILED',outcomeCode:'TARGET_CHANGED',attemptOrdinal:0});expect(h.runtime.accepting).toBe(true);expect(h.rig.w.effects).toEqual([]);
    const drift=h.messages.find(m=>m.route==='outcomes')?.body;expect(drift).toMatchObject({kind:'prefixDrift',receipt:{phase:'ADMITTED_PRE_INVOCATION',nativeInvocationStarted:false,admissionId:request.ledger.admission.admissionId}});
    const file=(await readdir(h.directory)).find(name=>name.endsWith('.journal'));expect(await readFile(join(h.directory,file??''),'utf8')).toContain('REFUSED_BEFORE_INVOCATION');
    await expect(h.runtime.dispatch(request)).rejects.toThrow('PREPARATION_DENIED');
  });
  it('allows exactly attempt1 after a spent admitted refusal, with all attempts still budgeted',async()=>{
    const h=await harness({code:MISS}),result=await h.runtime.preparePrefix(h.prepare);
    await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));
    const p=proposal(h.context,result.proposal.executionEvidence,STEP_IDS.nav,stepOp(NAV_CODE,{uses:[{kind:'input',id:'input-nav'}]})),proof=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()}),replacement=dispatch(h.context,p,proof);
    await expect(h.runtime.dispatch(replacement)).rejects.toThrow('ADMISSION_DENIED');replacement.ledger.attemptOrdinal=1;
    expect((await h.runtime.dispatch(replacement)).ledger).toMatchObject({state:'SUCCEEDED',attemptOrdinal:1});expect((h.runtime as unknown as {actions:number}).actions).toBe(2);
    await expect(h.runtime.dispatch(replacement)).rejects.toThrow('PREPARATION_DENIED');
  });
  it('native-started target failure is terminal unknown and cannot authorize drift',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);
    h.effect.mockImplementation(()=>Promise.reject(new Error('socket hang up')));
    const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.runtime.accepting).toBe(false);expect(h.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);
  });
  it('appends only after withhold and ACKs exact issued context despite a newer live lease',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));
    const next=structuredClone(h.context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'suffix-literal',sourceStepId:STEP_IDS.fill,kind:'nonsecretText',value:'new-private-value',provenance:{referenceKind:'configuration',configurationRevision:next.configurationRevision,stepId:STEP_IDS.fill,referenceId:'literal',kind:'nonsecretText'}});next.authoredInputsHash=hash(next.authoredInputs);
    let release:()=>void=()=>undefined;const withheld=new Promise<void>(resolve=>{release=resolve;});const withhold=vi.fn(()=>withheld);h.browser.observations.withhold=withhold;
    h.runtime.applyAcknowledgedLease(new Date(Date.parse(h.context.leaseExpiresAt)+10000).toISOString());let acked=false;const pending=h.runtime.update(next,DELIVERY_IDS.original).then(ack=>{acked=true;return ack;});await Promise.resolve();expect(acked).toBe(false);expect(withhold).toHaveBeenCalledWith(['new-private-value']);release();
    const ack=await pending;expect(validate('bridge',ack,'ContextAcknowledgement')).toEqual(ack);expect(ack).toMatchObject({deliveryId:DELIVERY_IDS.original,contextRevision:2,contextHash:hash(next)});expect(await h.runtime.update(next,DELIVERY_IDS.original)).toEqual(ack);
    const forged=structuredClone(next);const input=forged.authoredInputs.inputs[0];if(!input||!('value'in input))throw new Error('INPUT');const changedDestination=new URL(input.value);changedDestination.searchParams.set('historicalAckConflict','1');input.value=changedDestination.href;forged.authoredInputsHash=hash(forged.authoredInputs);await expect(h.runtime.update(forged,DELIVERY_IDS.original)).rejects.toThrow('CONTEXT_REVISION');
  });
  it('lost authenticated drift acknowledgement is terminal unknown and cannot grant a replacement',async()=>{
    const h=await harness({loseDriftAck:true,code:MISS}),result=await h.runtime.preparePrefix(h.prepare);const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.runtime.accepting).toBe(false);expect(h.rig.w.effects).toEqual([]);await expect(h.runtime.preparePrefix(h.prepare)).rejects.toThrow('CONTEXT_LOST');
  });
  it('native policy refusal is terminal and never converted into target drift',async()=>{const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);h.effect.mockRejectedValue(new ObservedRefusal('POLICY_REFUSED'));const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger).toMatchObject({state:'FAILED',outcomeCode:'POLICY_DENIED'});expect(h.runtime.accepting).toBe(false);expect(h.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);});
  it('serializes context deliveries and returns the original historical ACK after later metadata',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));
    const next=structuredClone(h.context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'new-input',sourceStepId:STEP_IDS.fill,kind:'nonsecretText',value:'private',provenance:{referenceKind:'configuration',configurationRevision:next.configurationRevision,stepId:STEP_IDS.fill,referenceId:'new-input',kind:'nonsecretText'}});next.authoredInputsHash=hash(next.authoredInputs);
    let release:()=>void=()=>undefined;h.browser.observations.withhold=()=>new Promise<void>(resolve=>{release=resolve;});const pending=h.runtime.update(next,DELIVERY_IDS.original);await Promise.resolve();await expect(h.runtime.update(next,DELIVERY_IDS.other)).rejects.toThrow('BUSY');
    const metadataWhilePending=structuredClone(h.context);metadataWhilePending.materializationRevision++;const beforePendingIdentity=h.runtime.currentIdentity;
    await expect(h.runtime.update(metadataWhilePending,DELIVERY_IDS.metadata)).rejects.toThrow('BUSY');
    await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'no-rebootstrap-pending')).rejects.toThrow('BUSY');
    expect(h.runtime.currentIdentity).toEqual(beforePendingIdentity);expect(h.messages.filter(m=>m.route==='bootstrap-evidence')).toHaveLength(1);expect(h.launch).toHaveBeenCalledOnce();
    release();const original=await pending;expect(original).toMatchObject({deliveryId:DELIVERY_IDS.original,contextHash:hash(next),contextRevision:2});
    const metadata=structuredClone(next);metadata.materializationRevision++;await h.runtime.update(metadata,DELIVERY_IDS.metadata);expect(await h.runtime.update(next,DELIVERY_IDS.original)).toEqual(original);
    const resealedLease=structuredClone(next);resealedLease.leaseExpiresAt=new Date(Date.parse(next.leaseExpiresAt)+1000).toISOString();await expect(h.runtime.update(resealedLease,DELIVERY_IDS.original)).rejects.toThrow('CONTEXT_REVISION');expect(await h.runtime.update(next,DELIVERY_IDS.original)).toEqual(original);expect(h.launch).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='bootstrap-evidence')).toHaveLength(1);
    const gap=structuredClone(metadata);gap.contextRevision+=2;gap.materializationRevision++;await expect(h.runtime.update(gap,DELIVERY_IDS.gap)).rejects.toThrow('CONTEXT_REVISION');
  });
  it('keeps the exact empty PrefixProgram pair on initial context and rejects changed or half pairs without another browser',async()=>{
    for(const programPair of ['missing-program','missing-hash']as const)await expect(harness({programPair})).rejects.toThrow('SCHEMA');
    const h=await harness({programPair:'empty'});expect(h.context.prefixProgram?.actions).toEqual([]);expect(h.context.prefixProgramHash).toBe(hash(h.context.prefixProgram));
    const evidence=(h.messages[0]?.body as BridgeBootstrap).executionEvidence,p=proposal(h.context,evidence,STEP_IDS.nav,stepOp(NAV_CODE,{uses:[{kind:'input',id:'input-nav'}]}));
    const proof=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    expect((await h.runtime.dispatch(dispatch(h.context,p,proof))).ledger.state).toBe('SUCCEEDED');
    const original=hash((h.runtime as unknown as {context:unknown}).context),changed=structuredClone(h.context);changed.materializationRevision++;
    if(!changed.prefixProgram)throw Error('PROGRAM');changed.prefixProgram={...changed.prefixProgram,baseRevisionDigest:'c'.repeat(64)};changed.prefixProgramHash=hash(changed.prefixProgram);
    await expect(h.runtime.update(changed)).rejects.toThrow('INPUT_IDENTITY');expect(hash((h.runtime as unknown as {context:unknown}).context)).toBe(original);
    expect(h.launch).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='bootstrap-evidence')).toHaveLength(1);
  });
  it('fresh observation after human wait invalidates the pre-confirmation preparation',async()=>{
    const h=await harness(),first=await h.runtime.preparePrefix(h.prepare);await h.runtime.dispatch(dispatch(h.context,structuredClone(first.proposal),first.preparation));
    const old=(h.messages.find(m=>m.route==='observations')?.body as BridgeObservation).observation,evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:old.documentId,generation:old.generation,origin:old.origin,observationHash:hash(old)},p=proposal(h.context,evidence,STEP_IDS.next,nextOp()),proof=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:old.generation,focus:{stepText:'',targetIntents:[]}},'confirmed-current-question');await expect(h.runtime.dispatch(dispatch(h.context,p,proof))).rejects.toThrow('PREPARATION_DENIED');expect(h.launch).toHaveBeenCalledOnce();
  });
});
describe('native fence durability',()=>{
  it.each(['INVOKING','REFUSED_BEFORE_INVOCATION']as const)('persists %s before returning and rejects the opposite transition',async state=>{
    const directory=await mkdtemp(join(tmpdir(),'fence-unit-'));clean.push(()=>rm(directory,{recursive:true,force:true}));const journal=await GuidedJournal.open(directory,'session');
    const event:BridgeNativeFenceEvent={schemaVersion:3,sessionId:'session',contextId:'context',ownerFence:1,admissionId:'admission',operationHash:'a'.repeat(64),state,receiptHash:state==='INVOKING'?null:'b'.repeat(64)};
    journal.fence(event);journal.fence(event);const file=(await readdir(directory)).find(name=>name.endsWith('.journal'));expect(JSON.parse((await readFile(join(directory,file??''),'utf8')).trim())).toEqual(event);
    expect(()=>{journal.fence({...event,state:state==='INVOKING'?'REFUSED_BEFORE_INVOCATION':'INVOKING'});}).toThrow('NATIVE_FENCE_REFUSED');
  });
});

