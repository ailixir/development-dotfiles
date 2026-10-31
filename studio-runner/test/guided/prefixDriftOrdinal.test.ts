/**
 * SC008-E6: a retained prefix step that drifts before its fence did not run. The admitted-drift outcome must leave the step's ordinal and the
 * prior-step mark where they were, so the replacement is attempt 1 of the same coordinate (ACTION_ORDER otherwise). The harness is a trimmed copy of
 * incrementalRuntime.test.ts (E7 owns that file): one prefix action, a scripted page.
 */
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {hash} from '../../src/guided/contracts.js';
import {guidedContext,dispatch,ownershipSession} from '../helpers/guided.js';
import {stepOp} from '../helpers/stepCode.js';
import {fakeHandle,newRig} from '../helpers/stepFakes.js';
import type {BridgeBootstrap,BridgePrefixPrepare,PrefixAction} from '../../src/guided/types.js';
import type {GuidedBrowser} from '../../src/run/guidedBrowser.js';
const STEP_IDS={nav:'00000000-0000-4000-8000-000000000001',read:'00000000-0000-4000-8000-000000000002',next:'00000000-0000-4000-8000-000000000003',fill:'00000000-0000-4000-8000-000000000004',submit:'00000000-0000-4000-8000-000000000005'} as const;
const clean:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
const NAV_CODE='await page.goto(inputs["input-nav"]);';
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
describe('prefix drift keeps the step ordinal',()=>{
  it('does not advance the ordinal or the prior step on an admitted pre-fence drift, and advances it on success',async()=>{
    const state=(h:Awaited<ReturnType<typeof harness>>)=>h.runtime as unknown as {ordinals:Map<string,number>;priorStep:number;prefixExited:boolean};
    const drifted=await harness({code:MISS}),result=await drifted.runtime.preparePrefix(drifted.prepare);
    const before=state(drifted).priorStep;
    await drifted.runtime.dispatch(dispatch(drifted.context,structuredClone(result.proposal),result.preparation));
    expect(drifted.messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(true);
    expect(state(drifted).ordinals.get(STEP_IDS.nav)??0).toBe(0);expect(state(drifted).priorStep).toBe(before);expect(state(drifted).prefixExited).toBe(true);
    const ok=await harness(),prepared=await ok.runtime.preparePrefix(ok.prepare);
    await ok.runtime.dispatch(dispatch(ok.context,structuredClone(prepared.proposal),prepared.preparation));
    expect(state(ok).ordinals.get(STEP_IDS.nav)).toBe(1);
  });
});
