import { afterEach, describe, expect, it } from 'vitest';
import { canary, startGuidedDataflowFixture } from '../fixtures/guided-dataflow/server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeBootstrap, BridgeObservation, BridgeOutcome, ExecutionEvidence, Producer } from '../../src/guided/types.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';

const resources: (() => Promise<void>)[]=[];
afterEach(async()=>{ for(const clean of resources.reverse()) await clean(); resources.length=0; });
async function harness(mode:'exact'|'regionVisible'|'regionControl'='exact') {
  const fixture=await startGuidedDataflowFixture(mode),receipts=fixture.receipts;
  resources.push(fixture.close);
  const directory=await mkdtemp(join(tmpdir(),'guided-real-'));resources.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext(fixture.origin);
  for(let i=0;i<65;i++)context.authoredInputs.inputs.push({inputId:`private-${String(i)}`,sourceStepId:'fill',kind:'nonsecretText',value:`PRIVATE-INPUT-${String(i).padStart(3,'0')}`,intendedSlot:'fill.value',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:`saved-${String(i)}`,kind:'nonsecretText',intendedSlot:'fill.value'}});
  context.authoredInputsHash=hash(context.authoredInputs);
  const messages:{route:string;body:unknown}[]=[];
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,journalDirectory:directory,rules:mode==='exact'?[{testId:'source',name:'Business reference',policyRuleId:'reference-read',classification:'permittedBusinessData'}]:[],applicationPolicy:{policyRuleId:'app-structural',allowStructuralDiscovery:true,...(mode==='exact'?{}:{readGrants:[{policyRuleId:'region-read',origin:context.approvedOrigins[0]??'',region:{kind:'role',role:'main',name:'Operations',exact:true},visibleText:{classification:'permittedBusinessData'},controlValue:{classification:'nonsecretApproved',types:['text','textarea']}}]})},launch:launchGuidedBrowser,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
  resources.push(()=>runtime.stop('CANCELLED')); await runtime.start();
  let evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence as ExecutionEvidence;
  const act=async(step:string,operation:Action['operation'],target?:Action['target'])=>{
    const p=proposal(context,evidence,step,operation,target);
    const prep=await runtime.prepare({...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+20_000).toISOString()});
    const request=dispatch(context,p,prep);
    if(operation.kind==='fill' && operation.value.kind==='binding') { const producer=context.producers[0];if(!producer)throw new Error('PRODUCER');request.consumerEdges=[{bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate:p.coordinate,argumentSlot:'fill.value',destinationOrigin:producer.origin,transferPolicy:'sameOrigin'}]; }
    const result=await runtime.dispatch(request);
    const observation=messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation|undefined;
    if(observation)evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.observation.documentId,generation:observation.observation.generation,origin:observation.observation.origin,observationHash:hash(observation.observation)};
    return {result,request,p};
  };
  const target=(name:string):Action['target']=>{const observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;const node=observation.nodes.find(n=>n.name===name && n.locatorHints.length>0);if(!node?.locatorHints[0])throw new Error(`NODE_UNAVAILABLE:${name}`);return {nodeId:node.nodeId,documentId:node.documentId,generation:node.generation,locator:node.locatorHints[0]};};
  const refresh=async()=>{const envelope=await runtime.refreshObservation({...identity(context),expectedGeneration:evidence.generation},'between-source-steps');const observation=envelope.observation;evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};return envelope;};
  return {context,runtime,messages,act,target,refresh,receipts,sourceRequests:()=>fixture.sourceRequests()};
}
describe('real guided Chromium dataflow',()=>{
  it.each(['exact','regionVisible','regionControl'] as const)('proves %s policy source→consumer without value disclosure or duplicate invocation',async mode=>{
    const h=await harness(mode);
    const bootstrap=h.messages[0]?.body as BridgeBootstrap;expect(bootstrap.executionEvidence.origin).toBeNull();expect(h.sourceRequests()).toBe(0);
    const nav=await h.act('nav',{kind:'navigate',destinationInputId:'input-nav'});expect(nav.result.ledger.state).toBe('SUCCEEDED');expect(h.sourceRequests()).toBe(1);
    await expect(h.runtime.dispatch(nav.request)).rejects.toThrow();expect(h.sourceRequests()).toBe(1);
    const recipe:Producer['recipe']=mode==='regionControl'?{kind:'controlValue',classification:'nonsecretApproved',controlType:'textarea',policyRuleId:'region-read'}:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:mode==='exact'?'reference-read':'region-read'};
    const read=await h.act('read',{kind:'read',bindingId:'binding-one',recipe},h.target('Business reference'));
    expect(read.result.ledger.state).toBe('SUCCEEDED');expect(read.result.availability).not.toBeNull();
    if (!read.result.availability || !read.p.executionEvidence.origin) throw new Error('PRODUCER');
    const producer:Producer={bindingId:'binding-one',producerAdmissionId:read.request.ledger.admission.admissionId,coordinate:read.p.coordinate,origin:read.p.executionEvidence.origin,recipe,availability:read.result.availability};
    h.context.producers=[producer];h.context.materializationRevision++;h.runtime.update(h.context);
    const outcomesBeforeRefresh=h.messages.filter(m=>m.route==='outcomes').length;await h.refresh();expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(outcomesBeforeRefresh);expect(h.sourceRequests()).toBe(1);
    expect((await h.act('next',{kind:'navigate',destinationInputId:'input-next'})).result.ledger.state).toBe('SUCCEEDED');
    expect(JSON.stringify(h.messages)).not.toContain('OBS-private');expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-INPUT-064');expect(JSON.stringify(h.messages)).not.toContain('UNREAD_PASSWORD_004_QA');expect(JSON.stringify(h.messages)).not.toContain('UNREAD_INPUT_004_QA');
    expect((await h.act('fill',{kind:'fill',value:{kind:'binding',bindingId:'binding-one'}},h.target('Destination'))).result.ledger.state).toBe('SUCCEEDED');
    expect((await h.act('submit',{kind:'click'},h.target('Submit'))).result.ledger.state).toBe('SUCCEEDED');
    await expect.poll(()=>h.receipts.length).toBe(1);expect(h.receipts[0]).toBe(canary);
    expect(h.messages.filter(m=>m.route==='outcomes').every(m=>Object.keys((m.body as BridgeOutcome).availability??{}).every(k=>!['value','hash','length','bytes'].includes(k)))).toBe(true);
    await h.runtime.stop('CANCELLED');expect(h.runtime.active).toBe(false);await expect(h.runtime.prepare({...identity(h.context),proposal:nav.p,requestDigest:hash(nav.p),expiresAt:h.context.leaseExpiresAt})).rejects.toThrow('CONTEXT_LOST');
  });
});
