import { performOnTarget } from '../../src/run/targetAction.js';
import { ActionBudget, LEARN_PROFILE } from '../../src/run/actionBudget.js';
import { FakePage, FakeWorld } from '../helpers/fakePage.js';
import type { TargetInvocation } from '../../src/run/observationTypes.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {ObservedRefusal} from '../../src/validator/observedReferencePolicy.js';
import {GuidedJournal} from '../../src/guided/journal.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import {guidedContext,dispatch,proposal,ownershipSession,sessionStub} from '../helpers/guided.js';
import {operationPreimage} from '../../src/validator/operationPreimage.js';
import {ClosedActionError} from '../../src/run/closedError.js';
import {readGrantId} from '../../src/run/observationReadProfile.js';
import type {BridgeBootstrap,BridgePrefixPrepare,BridgeObservation,BridgeNativeFenceEvent,PrefixAction} from '../../src/guided/types.js';
import type {GuidedBrowser} from '../../src/run/guidedBrowser.js';
import type {BrowserHandle} from '../../src/run/browserFactory.js';
import type {InvocationControl} from '../../src/executor/observedReplay.js';
const STEP_IDS={nav:'00000000-0000-4000-8000-000000000001',read:'00000000-0000-4000-8000-000000000002',next:'00000000-0000-4000-8000-000000000003',fill:'00000000-0000-4000-8000-000000000004',submit:'00000000-0000-4000-8000-000000000005'} as const;
const DELIVERY_IDS={original:'00000000-0000-4000-8000-000000001001',other:'00000000-0000-4000-8000-000000001002',metadata:'00000000-0000-4000-8000-000000001003',gap:'00000000-0000-4000-8000-000000001004'} as const;
const clean:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
async function harness(options:{readPrefix?:boolean;pressPrefix?:boolean;loseDriftAck?:boolean;programPair?:'empty'|'missing-program'|'missing-hash'}={}){
  const directory=await mkdtemp(join(tmpdir(),'prefix-unit-'));clean.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext('https://example.test');
  // Declared synthetic server-issued UUIDs/counters, never an invented legacy success.
  const issued=(label:string):string=>{const value=Object.entries(STEP_IDS).find(([name])=>name===label)?.[1];if(!value)throw new Error('UNDECLARED_STEP');return value;};
  context.sourceStepIds=context.sourceStepIds.map(issued);context.sourceRevision='1';context.configurationRevision='1';
  context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';
  for(const input of context.authoredInputs.inputs){input.sourceStepId=issued(input.sourceStepId);input.provenance.stepId=issued(input.provenance.stepId);if(input.provenance.referenceKind==='sourceSpan')input.provenance.sourceRevision='1';else input.provenance.configurationRevision='1';}
  for(const allocation of context.allocations){allocation.producerStepId=issued(allocation.producerStepId);for(const consumer of allocation.consumers)consumer.stepId=issued(consumer.stepId);}
  const grant=ownershipSession(context);context.leaseExpiresAt=grant.owner.leaseExpiresAt;

  const coordinate={stepId:STEP_IDS.nav,ordinal:0},operation={kind:'navigate' as const,destinationInputId:'input-nav'};
  const action={coordinate,origin:null,target:null,operation,operationHash:hash(operationPreimage(coordinate,null,null,operation)),guard:{guardId:'g0',origin:null,target:{kind:'initialBlank' as const}}};
  const prefixActions:PrefixAction[]=[action];
  if(options.readPrefix){const coordinate={stepId:STEP_IDS.read,ordinal:0},operation:PrefixAction['operation']=options.pressPrefix?{kind:'press',key:'Enter'}:{kind:'read',bindingId:'binding-one',recipe:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:readGrantId('https://example.test')}};const target={locator:[{by:'testId' as const,value:'source'}],tier:'testId' as const,identity:{role:'text',name:null}};prefixActions.push({coordinate,origin:'https://example.test',target,operation,operationHash:hash(operationPreimage(coordinate,'https://example.test',target,operation)),guard:{guardId:'g1',origin:'https://example.test',target:{kind:'element',...target,readRuleId:readGrantId('https://example.test')}}});}
  context.prefixProgram={schemaVersion:3,baseRevisionId:'00000000-0000-4000-8000-000000000999',baseRevisionDigest:'b'.repeat(64),sourceStepIds:options.readPrefix?[STEP_IDS.nav,STEP_IDS.read]:[STEP_IDS.nav],actions:prefixActions};context.prefixProgramHash=hash(context.prefixProgram);
  if(options.programPair==='empty'){context.prefixProgram={...context.prefixProgram,actions:[],sourceStepIds:[]};context.prefixProgramHash=hash(context.prefixProgram);}
  if(options.programPair==='missing-program')delete context.prefixProgram;
  if(options.programPair==='missing-hash')delete context.prefixProgramHash;
  const messages:{route:string;body:unknown;key?:string}[]=[];let generation=0;
  const blank=vi.fn(()=>Promise.resolve(true)),effect=vi.fn((_destination:string,control?:InvocationControl)=>{control?.beginInvocation();return Promise.resolve();});
  const createObservationSession=vi.fn(()=>{throw new Error('SECOND_OBSERVATION_SESSION');});
  const handle={observedBlankMatches:blank,observedNavigateBlank:effect,observedWait:()=>Promise.resolve(),createObservationSession} as unknown as BrowserHandle;
  const prepareTarget=vi.fn(()=>Promise.resolve({locator:[{by:'testId' as const,value:'source'}],tier:'testId' as const,identity:{role:'text',name:null}}));
  const browser:GuidedBrowser={handle,evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:'create',bootstrapId:'bootstrap',documentId:'blank',url:'about:blank',origin:null,generation:0},blankMatches:blank,navigateBlank:vi.fn(()=>Promise.resolve()),close:vi.fn(()=>Promise.resolve()),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:sessionStub({withhold:vi.fn(()=>Promise.resolve()),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'page',generation:++generation,origin:'https://example.test',observedAt:new Date().toISOString(),coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:0},projection:{projected:false,tier:null,totalNodes:1,shownNodes:1,notShown:0,outlineBytes:15},readRuleId:null,outline:'- text "x" [e1]',facts:{e1:{role:'text',name:'x',editable:false, nameComplete: true, ownTextComplete: true,evidence:'x',evidenceSegments:[]}}},json:'',bytes:0,observationHash:''}),resolveTarget:()=>Promise.resolve({kind:'READY' as const}),refForTarget:()=>Promise.resolve('e1'),prepareTarget,invoke:()=>Promise.resolve({value:'ab'}),pageMatches:()=>Promise.resolve(true),navigate:vi.fn(()=>Promise.resolve())})};
  const launch=vi.fn(()=>Promise.resolve(browser));
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,launch,capabilities:grant.scope.capabilities,callback:(route,body,key)=>{messages.push({route,body,...key?{key}:{}});return options.loseDriftAck&&route==='outcomes'?Promise.reject(new Error('ACK_LOST')):Promise.resolve();}});clean.push(()=>runtime.stop('CANCELLED'));await runtime.start();
  const evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;
  if(!context.prefixProgramHash)throw Error('PROGRAM_HASH');
  const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:context.prefixProgramHash,pressInheritance:null,coordinate,evidenceHash:hash(evidence)};
  const prepare:BridgePrefixPrepare={kind:'prefix',request,requestDigest:hash(request)};
  return {context,runtime,browser,messages,launch,handle,blank,effect,createObservationSession,prepare,directory,prepareTarget};
}
describe('incremental prefix retains live guided authority',()=>{

  it('a prefix target the held perception does not show answers WAIT', async () => {
    const h = await harness({ readPrefix: true });
    const nav = await h.runtime.preparePrefix(h.prepare);
    if (nav.kind !== 'PREPARED') throw new Error('PREPARED');
    await h.runtime.dispatch(dispatch(h.context, structuredClone(nav.proposal), nav.preparation));
    const frozen = h.context.prefixProgram?.actions[1]?.target;
    if (!frozen) throw new Error('FROZEN_READ_TARGET');
    const resolve = vi.fn(() => Promise.resolve({ kind: 'READY' as const }));
    const ref = vi.fn((): Promise<string | null> => Promise.resolve(null));
    const invoke = vi.fn(() => Promise.resolve({ value: 'ab' }));
    h.browser.observations.resolveTarget = resolve;
    h.browser.observations.refForTarget = ref;
    h.browser.observations.invoke = invoke;
    const envelope = () => {
      const o = (h.messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation).observation;
      const evidence = { kind: 'observedDocument', sessionId: h.context.sessionId, contextId: h.context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
      const request = { ...h.prepare.request, coordinate: { stepId: STEP_IDS.read, ordinal: 0 }, evidenceHash: hash(evidence) };
      return { kind: 'prefix' as const, request, requestDigest: hash(request) };
    };
    const missing = envelope();
    const waiting = await h.runtime.preparePrefix(missing);
    expect(waiting).toEqual({ kind: 'WAIT', requestDigest: missing.requestDigest, evidenceHash: missing.request.evidenceHash });
    expect(await h.runtime.preparePrefix(missing)).toEqual(waiting);
    expect(resolve).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledWith(frozen);
    expect(h.prepareTarget).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(h.effect).toHaveBeenCalledOnce(); // Only the legitimate preceding navigation.
    const prior = (h.messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation).observation;
    await h.runtime.refreshObservation({ ...identity(h.context), expectedGeneration: prior.generation, focus: { stepText: 'Read source', targetIntents: ['source'] } }, 'held-prefix-focus-refresh');
    ref.mockResolvedValue('e1');
    const prepared = await h.runtime.preparePrefix(envelope());
    expect(prepared.kind).toBe('PREPARED');
    if (prepared.kind !== 'PREPARED') throw new Error('PREPARED');
    expect(prepared.preparation.target).toEqual(frozen);
    expect(h.prepareTarget).toHaveBeenCalledOnce();
    expect(h.prepareTarget).toHaveBeenCalledWith(expect.objectContaining({ frozen }));
    expect(invoke).not.toHaveBeenCalled();
    expect(h.effect).toHaveBeenCalledOnce();
  });
  it('prepares and performs on the same handle/session then learns suffix without another launch',async()=>{
    const h=await harness(),observations=h.browser.observations;
    const result=await h.runtime.preparePrefix(h.prepare);expect(result.kind).toBe('PREPARED');if(result.kind!=='PREPARED')throw new Error('PREPARED');
    expect(await h.runtime.preparePrefix(h.prepare)).toEqual(result);
    const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('SUCCEEDED');
    expect(h.effect).toHaveBeenCalledOnce();expect(h.launch).toHaveBeenCalledOnce();expect(h.createObservationSession).not.toHaveBeenCalled();expect(h.browser.observations).toBe(observations);
    const o=(h.messages.find(m=>m.route==='observations')?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    const p=proposal(h.context,evidence,STEP_IDS.next,{kind:'navigate',destinationInputId:'input-next'}),prepared=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    expect((await h.runtime.dispatch(dispatch(h.context,p,prepared))).ledger.state).toBe('SUCCEEDED');expect(h.launch).toHaveBeenCalledOnce();
  });
  it('persists exact admitted pre-native refusal and keeps spent admission unusable',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');
    h.blank.mockResolvedValue(false);const request=dispatch(h.context,structuredClone(result.proposal),result.preparation),outcome=await h.runtime.dispatch(request);
    expect(outcome.ledger).toMatchObject({state:'FAILED',outcomeCode:'TARGET_CHANGED',attemptOrdinal:0});expect(h.runtime.accepting).toBe(true);expect(h.effect).not.toHaveBeenCalled();
    const drift=h.messages.find(m=>m.route==='outcomes')?.body;expect(drift).toMatchObject({kind:'prefixDrift',receipt:{phase:'ADMITTED_PRE_INVOCATION',nativeInvocationStarted:false,admissionId:request.ledger.admission.admissionId}});
    const file=(await readdir(h.directory)).find(name=>name.endsWith('.journal'));expect(await readFile(join(h.directory,file??''),'utf8')).toContain('REFUSED_BEFORE_INVOCATION');
    await expect(h.runtime.dispatch(request)).rejects.toThrow('PREPARATION_DENIED');
  });
  it('allows exactly attempt1 after a spent admitted refusal, with all attempts still budgeted',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');
    h.blank.mockResolvedValue(false);await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));h.blank.mockResolvedValue(true);
    const p=proposal(h.context,result.proposal.executionEvidence,STEP_IDS.nav,{kind:'navigate',destinationInputId:'input-nav'}),proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()}),replacement=dispatch(h.context,p,proof);
    await expect(h.runtime.dispatch(replacement)).rejects.toThrow('ADMISSION_DENIED');replacement.ledger.attemptOrdinal=1;
    expect((await h.runtime.dispatch(replacement)).ledger).toMatchObject({state:'SUCCEEDED',attemptOrdinal:1});expect((h.runtime as unknown as {actions:number}).actions).toBe(2);
    await expect(h.runtime.dispatch(replacement)).rejects.toThrow('PREPARATION_DENIED');
  });
  it('pre-admission authenticated drift spends no admission and preserves attempt0',async()=>{
    const h=await harness();h.blank.mockResolvedValue(false);const result=await h.runtime.preparePrefix(h.prepare);
    expect(result).toMatchObject({kind:'DRIFT',receipt:{phase:'PRE_ADMISSION',admissionId:null,preparationId:null,attemptOrdinal:0,nativeInvocationStarted:false}});expect(h.effect).not.toHaveBeenCalled();expect((h.runtime as unknown as {actions:number}).actions).toBe(0);expect(h.runtime.accepting).toBe(true);
  });
  it('native-started target failure is terminal unknown and cannot authorize drift',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');
    h.effect.mockImplementation((_destination,control)=>{control?.beginInvocation();return Promise.reject(new Error('TARGET_CHANGED'));});
    const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.runtime.accepting).toBe(false);expect(h.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);
  });
  it('appends only after withhold and ACKs exact issued context despite a newer live lease',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));
    const next=structuredClone(h.context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'suffix-literal',sourceStepId:STEP_IDS.fill,kind:'nonsecretText',value:'new-private-value',intendedSlot:'fill.value',provenance:{referenceKind:'configuration',configurationRevision:next.configurationRevision,stepId:STEP_IDS.fill,referenceId:'literal',kind:'nonsecretText',intendedSlot:'fill.value'}});next.authoredInputsHash=hash(next.authoredInputs);
    let release:()=>void=()=>undefined;const withheld=new Promise<void>(resolve=>{release=resolve;});const withhold=vi.fn(()=>withheld);h.browser.observations.withhold=withhold;
    h.runtime.applyAcknowledgedLease(new Date(Date.parse(h.context.leaseExpiresAt)+10000).toISOString());let acked=false;const pending=h.runtime.update(next,DELIVERY_IDS.original).then(ack=>{acked=true;return ack;});await Promise.resolve();expect(acked).toBe(false);expect(withhold).toHaveBeenCalledWith(['new-private-value']);release();
    const ack=await pending;expect(validate('bridge',ack,'ContextAcknowledgement')).toEqual(ack);expect(ack).toMatchObject({deliveryId:DELIVERY_IDS.original,contextRevision:2,contextHash:hash(next)});expect(await h.runtime.update(next,DELIVERY_IDS.original)).toEqual(ack);
    const forged=structuredClone(next);const input=forged.authoredInputs.inputs[0];if(!input||!('value'in input))throw new Error('INPUT');const changedDestination=new URL(input.value);changedDestination.searchParams.set('historicalAckConflict','1');input.value=changedDestination.href;forged.authoredInputsHash=hash(forged.authoredInputs);await expect(h.runtime.update(forged,DELIVERY_IDS.original)).rejects.toThrow('CONTEXT_REVISION');
  });
  it('bounds ABSENT/VISIBILITY_PENDING acquisition at32fresh observations with no invocation',async()=>{
    const h=await harness({readPrefix:true}),nav=await h.runtime.preparePrefix(h.prepare);if(nav.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(nav.proposal),nav.preparation));
    let acquired=0;h.browser.observations.resolveTarget=()=>{acquired++;return Promise.resolve({kind:'ABSENT'});};
    for(let iteration=0;iteration<33;iteration++){
      const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation,evidence={kind:'observedDocument',sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)},request={...h.prepare.request,coordinate:{stepId:STEP_IDS.read,ordinal:0},evidenceHash:hash(evidence)},envelope={kind:'prefix' as const,request,requestDigest:hash(request)},result=await h.runtime.preparePrefix(envelope);
      if(iteration<32){expect(result.kind).toBe('WAIT');expect(await h.runtime.preparePrefix(envelope)).toEqual(result);await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:o.generation,focus:{stepText:'',targetIntents:[]}},`wait-${String(iteration)}`);}else expect(result).toMatchObject({kind:'DRIFT',receipt:{phase:'PRE_ADMISSION',nativeInvocationStarted:false}});
    }
    expect(acquired).toBe(33);expect(h.effect).toHaveBeenCalledOnce();expect((h.runtime as unknown as {actions:number}).actions).toBe(1);expect(h.runtime.accepting).toBe(true);
  });
  it.each(['OPTION_NOT_PRESENT','READ_NOT_ALLOWED','NO_DURABLE_LOCATOR'])('turns the prefix prepare reason %s into the pre-admission drift receipt, because the page changed',async reason=>{
    const h=await harness({readPrefix:true}),nav=await h.runtime.preparePrefix(h.prepare);if(nav.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(nav.proposal),nav.preparation));
    const prepareTarget=h.prepareTarget;prepareTarget.mockRejectedValue(new ClosedActionError(reason as 'OPTION_NOT_PRESENT'));
    const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation,evidence={kind:'observedDocument',sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)},request={...h.prepare.request,coordinate:{stepId:STEP_IDS.read,ordinal:0},evidenceHash:hash(evidence)};
    const result=await h.runtime.preparePrefix({kind:'prefix' as const,request,requestDigest:hash(request)});
    expect(result).toMatchObject({kind:'DRIFT',receipt:{phase:'PRE_ADMISSION',reason:'TARGET_DRIFT',nativeInvocationStarted:false}});expect(h.runtime.accepting).toBe(true);
    expect(prepareTarget).toHaveBeenCalledWith(expect.objectContaining({frozen:expect.objectContaining({tier:'testId'}) as unknown}));
  });
  it('keeps stopping on a prefix prepare refusal that is not a page change (POLICY_DENIED never becomes drift)',async()=>{
    const h=await harness({readPrefix:true}),nav=await h.runtime.preparePrefix(h.prepare);if(nav.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(nav.proposal),nav.preparation));
    h.prepareTarget.mockRejectedValue(new ClosedActionError('POLICY_DENIED'));
    const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation,evidence={kind:'observedDocument',sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)},request={...h.prepare.request,coordinate:{stepId:STEP_IDS.read,ordinal:0},evidenceHash:hash(evidence)};
    await expect(h.runtime.preparePrefix({kind:'prefix' as const,request,requestDigest:hash(request)})).rejects.toThrow('POLICY_DENIED');
    expect(h.runtime.accepting).toBe(false);expect(h.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);
  });
  it('lost authenticated drift acknowledgement is terminal unknown and cannot grant a replacement',async()=>{
    const h=await harness({loseDriftAck:true}),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');h.blank.mockResolvedValue(false);const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.runtime.accepting).toBe(false);expect(h.effect).not.toHaveBeenCalled();await expect(h.runtime.preparePrefix(h.prepare)).rejects.toThrow('CONTEXT_LOST');
  });
  it('lost pre-admission drift callback also stops instead of granting suffix authority',async()=>{const h=await harness({loseDriftAck:true});h.blank.mockResolvedValue(false);await expect(h.runtime.preparePrefix(h.prepare)).rejects.toThrow('UNKNOWN_OUTCOME');expect(h.runtime.accepting).toBe(false);expect((h.runtime as unknown as {actions:number}).actions).toBe(0);});
  it('native policy refusal is terminal and never converted into target drift',async()=>{const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');h.effect.mockRejectedValue(new ObservedRefusal('POLICY_REFUSED'));const outcome=await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));expect(outcome.ledger).toMatchObject({state:'FAILED',outcomeCode:'POLICY_DENIED'});expect(h.runtime.accepting).toBe(false);expect(h.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);});
  it('serializes context deliveries and returns the original historical ACK after later metadata',async()=>{
    const h=await harness(),result=await h.runtime.preparePrefix(h.prepare);if(result.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(result.proposal),result.preparation));
    const next=structuredClone(h.context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'new-input',sourceStepId:STEP_IDS.fill,kind:'nonsecretText',value:'private',intendedSlot:'fill.value',provenance:{referenceKind:'configuration',configurationRevision:next.configurationRevision,stepId:STEP_IDS.fill,referenceId:'new-input',kind:'nonsecretText',intendedSlot:'fill.value'}});next.authoredInputsHash=hash(next.authoredInputs);
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
    const evidence=(h.messages[0]?.body as BridgeBootstrap).executionEvidence,p=proposal(h.context,evidence,STEP_IDS.nav,{kind:'navigate',destinationInputId:'input-nav'});
    const proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    expect((await h.runtime.dispatch(dispatch(h.context,p,proof))).ledger.state).toBe('SUCCEEDED');
    const original=hash((h.runtime as unknown as {context:unknown}).context),changed=structuredClone(h.context);changed.materializationRevision++;
    if(!changed.prefixProgram)throw Error('PROGRAM');changed.prefixProgram={...changed.prefixProgram,baseRevisionDigest:'c'.repeat(64)};changed.prefixProgramHash=hash(changed.prefixProgram);
    await expect(h.runtime.update(changed)).rejects.toThrow('INPUT_IDENTITY');expect(hash((h.runtime as unknown as {context:unknown}).context)).toBe(original);
    expect(h.launch).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='bootstrap-evidence')).toHaveLength(1);
  });
  it('fresh observation after human wait invalidates the pre-confirmation preparation',async()=>{
    const h=await harness(),first=await h.runtime.preparePrefix(h.prepare);if(first.kind!=='PREPARED')throw new Error('PREPARED');await h.runtime.dispatch(dispatch(h.context,structuredClone(first.proposal),first.preparation));
    const old=(h.messages.find(m=>m.route==='observations')?.body as BridgeObservation).observation,evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:old.documentId,generation:old.generation,origin:old.origin,observationHash:hash(old)},p=proposal(h.context,evidence,STEP_IDS.next,{kind:'navigate',destinationInputId:'input-next'}),proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
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

async function prepareReadPrefixForBindingTest(pressPrefix = false) {
  const h = await harness({ readPrefix: true, pressPrefix });
  const nav = await h.runtime.preparePrefix(h.prepare);
  if (nav.kind !== 'PREPARED') throw new Error('PREPARED');
  await h.runtime.dispatch(dispatch(h.context, structuredClone(nav.proposal), nav.preparation));
  const o = (h.messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation).observation;
  const evidence = { kind: 'observedDocument', sessionId: h.context.sessionId, contextId: h.context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
  const request = { ...h.prepare.request, coordinate: { stepId: STEP_IDS.read, ordinal: 0 }, evidenceHash: hash(evidence) };
  const result = await h.runtime.preparePrefix({ kind: 'prefix', request, requestDigest: hash(request) });
  if (result.kind !== 'PREPARED') throw new Error('PREPARED');
  return { h, result, observation: o };
}
it('prepared prefix dispatch uses learn and exact prepared document and generation', async () => {
  const { h, result, observation } = await prepareReadPrefixForBindingTest();
  const frozen = structuredClone(h.context.prefixProgram);
  const invoke = vi.fn((request: TargetInvocation, current?: InvocationControl) => {
    expect(request).toMatchObject({ profile: 'learn', expect: { documentId: observation.documentId, generation: observation.generation } });
    current?.beginInvocation(); return Promise.resolve({ value: 'ab' });
  });
  h.browser.observations.invoke = invoke;
  const outcome = await h.runtime.dispatch(dispatch(h.context, structuredClone(result.proposal), result.preparation));
  expect(outcome.ledger.state).toBe('SUCCEEDED'); expect(invoke).toHaveBeenCalledOnce();
  expect(h.context.prefixProgram).toEqual(frozen); expect(h.launch).toHaveBeenCalledOnce();
  expect(h.prepareTarget).toHaveBeenCalledOnce();
});
it('single equivalent clone after prefix prepare refuses without a repeat admission', async () => {
  const { h, result } = await prepareReadPrefixForBindingTest();
  const invoke = vi.fn((request: TargetInvocation) => {
    expect(request.profile).toBe('learn');
    return Promise.reject(new ClosedActionError('TARGET_CHANGED'));
  });
  h.browser.observations.invoke = invoke;
  const request = dispatch(h.context, structuredClone(result.proposal), result.preparation);
  expect((await h.runtime.dispatch(request)).ledger).toMatchObject({ state: 'FAILED', outcomeCode: 'TARGET_CHANGED' });
  expect(invoke).toHaveBeenCalledOnce();
  await expect(h.runtime.dispatch(request)).rejects.toThrow('PREPARATION_DENIED');
  expect(invoke).toHaveBeenCalledOnce(); expect(h.prepareTarget).toHaveBeenCalledOnce();
});

it('combined guarded prefix checks final physical node before Enter', async () => {
  for (const afterFocus of [false, true]) {
    const { h, result, observation } = await prepareReadPrefixForBindingTest(true);
    const world = new FakeWorld(), page = new FakePage(world);
    let same = afterFocus;
    if (afterFocus) world.hooks.focus = () => { same = false; };
    h.browser.observations.invoke = (request, control) => {
      expect(request).toMatchObject({ profile: 'learn', expect: { documentId: observation.documentId, generation: observation.generation }, operation: { kind: 'press', key: 'Enter' } });
      return performOnTarget(page, request.operation, page.target(), null, control, { profile: LEARN_PROFILE, budget: new ActionBudget(65000), maxValueBytes: 4096, readRuleId: null, liveReadRuleId: null, origin: observation.origin, allowedDomains: TEST_DOMAINS, target: request.resolved, sameNode: () => Promise.resolve(same) });
    };
    const outcome = await h.runtime.dispatch(dispatch(h.context, structuredClone(result.proposal), result.preparation));
    expect(outcome.ledger.state).toBe(afterFocus ? 'UNKNOWN_OUTCOME' : 'FAILED');
    expect(world.log.some(call => call.method === 'press')).toBe(false);
  }
});
