import { stepOp } from '../helpers/stepCode.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { afterEach, describe, expect, it } from 'vitest';
import { canary, startGuidedDataflowFixture } from '../fixtures/guided-dataflow/visibleTextServer.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guidedChildLaunch } from './helpers/guidedLaunch.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeBootstrap, BridgeObservation, BridgeOrdinaryOutcome as BridgeOutcome, ExecutionEvidence, Producer } from '../../src/guided/types.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';

const resources: (() => Promise<void>)[]=[];
afterEach(async()=>{ for(const clean of resources.reverse()) await clean(); resources.length=0; });
async function harness(mode:'exact'|'regionVisible'='exact') {
  const fixture=await startGuidedDataflowFixture(mode),receipts=fixture.receipts;
  resources.push(fixture.close);
  const directory=await mkdtemp(join(tmpdir(),'guided-real-'));resources.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext(fixture.origin);
  for(let i=0;i<65;i++)context.authoredInputs.inputs.push({inputId:`private-${String(i)}`,sourceStepId:'fill',kind:'nonsecretText',value:`PRIVATE-INPUT-${String(i).padStart(3,'0')}`,provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:`saved-${String(i)}`,kind:'nonsecretText'}});
  context.authoredInputsHash=hash(context.authoredInputs);
  const messages:{route:string;body:unknown}[]=[];
  // No field rules in guided learning; reads come only from the runner's constant read profile.
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,launch:guidedChildLaunch,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
  resources.push(()=>runtime.stop('CANCELLED')); await runtime.start();
  let evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence as ExecutionEvidence;
  const act=async(step:string,operation:Action['operation'])=>{
    const p=proposal(context,evidence,step,operation);
    const prep=await runtime.prepare({...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+20_000).toISOString()});
    const request=dispatch(context,p,prep);
    if(operation.uses.some(use=>use.kind==='binding')) { const producer=context.producers[0];if(!producer)throw new Error('PRODUCER');request.consumerEdges=[{bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate:p.coordinate,destinationOrigin:producer.origin,transferPolicy:'sameOrigin'}]; }
    const result=await runtime.dispatch(request);
    const observation=messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation|undefined;
    if(observation)evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.observation.documentId,generation:observation.observation.generation,origin:observation.observation.origin,observationHash:hash(observation.observation)};
    return {result,request,p};
  };
  const refresh=async()=>{const envelope=await runtime.refreshObservation({...identity(context),expectedGeneration:evidence.generation,focus:{stepText:'',targetIntents:[]}},'between-source-steps');const observation=envelope.observation;evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};return envelope;};
  return {context,runtime,messages,act,refresh,receipts,sourceRequests:()=>fixture.sourceRequests()};
}
describe('real guided Chromium dataflow',()=>{
  it.each(['regionVisible'] as const)('proves %s captured-value source→consumer without value disclosure or duplicate invocation',async mode=>{
    const h=await harness(mode);
    const bootstrap=h.messages[0]?.body as BridgeBootstrap;expect(bootstrap.executionEvidence.origin).toBeNull();expect(h.sourceRequests()).toBe(0);
    const nav=await h.act('nav',stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }));expect(nav.result.ledger.state).toBe('SUCCEEDED');expect(h.sourceRequests()).toBe(1);
    await expect(h.runtime.dispatch(nav.request)).rejects.toThrow();expect(h.sourceRequests()).toBe(1);
    const read=await h.act('read',stepOp('vars["binding-one"] = await page.getByText(/OBS-private/).innerText();',{captures:['binding-one']}));
    expect(read.result.ledger.state).toBe('SUCCEEDED');expect(read.result.availability).not.toHaveLength(0);
    if (read.result.availability.length === 0 || !read.p.executionEvidence.origin) throw new Error('PRODUCER');
    const producer:Producer={bindingId:'binding-one',producerAdmissionId:read.request.ledger.admission.admissionId,coordinate:read.p.coordinate,origin:read.p.executionEvidence.origin,availability:(()=>{const first=read.result.availability[0];if(!first)throw new Error('AVAILABILITY');return first;})()};
    h.context.producers=[producer];h.context.materializationRevision++;await h.runtime.update(h.context);
    const outcomesBeforeRefresh=h.messages.filter(m=>m.route==='outcomes').length;await h.refresh();expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(outcomesBeforeRefresh);expect(h.sourceRequests()).toBe(1);
    expect((await h.act('next',stepOp('await page.goto(inputs["input-next"]);', { uses: [{ kind: 'input', id: 'input-next' }] }))).result.ledger.state).toBe('SUCCEEDED');
    // ADR-SC-007 D1: an observation exports visible text (the business-text inventory is not kept), so the produced value is held to every message but the observations.
    expect(JSON.stringify(h.messages.filter(m=>m.route!=='observations'))).not.toContain('OBS-private');expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-INPUT-064');expect(JSON.stringify(h.messages)).not.toContain('UNREAD_PASSWORD_004_QA');expect(JSON.stringify(h.messages)).not.toContain('UNREAD_INPUT_004_QA');
    expect((await h.act('fill',stepOp('await page.getByRole("textbox", { name: "Destination" }).fill(vars["binding-one"]);',{uses:[{kind:'binding',id:'binding-one'}]}))).result.ledger.state).toBe('SUCCEEDED');
    expect((await h.act('submit',stepOp('await page.getByRole("button", { name: "Submit" }).click();'))).result.ledger.state).toBe('SUCCEEDED');
    await expect.poll(()=>h.receipts.length).toBe(1);expect(h.receipts[0]).toBe(canary);
    expect(h.messages.filter(m=>m.route==='outcomes').every(m=>(m.body as BridgeOutcome).availability.flatMap(a=>Object.keys(a)).every(k=>!['value','hash','length','bytes'].includes(k)))).toBe(true);
    await h.runtime.stop('CANCELLED');expect(h.runtime.active).toBe(false);await expect(h.runtime.prepare({...identity(h.context),proposal:nav.p,requestDigest:hash(nav.p),expiresAt:h.context.leaseExpiresAt})).rejects.toThrow('CONTEXT_LOST');
  });
  it('the former exact-rule page exports its bare text as a readable text node and nothing else readable',async()=>{
    const h=await harness('exact');
    expect((await h.act('nav',stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }))).result.ledger.state).toBe('SUCCEEDED');
    const observation=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    // The page's named control is exported structurally under the read profile, so the checks below are not vacuous.
    expect(Object.values(observation.facts).map(f=>f.name)).toContain('Refresh');
    // The former exact-rule target is an unnamed generic <div> whose only content is text. Plain visible text is a readable
    // node (guided-data-flow section 4, user decision 2026-10-25) and the profile grants visible text in the application region of
    // every allowed domain, so it is exported as permittedBusinessData under the grant of the page's domain. It is the ONLY node that is.
    const readable=Object.values(observation.facts).filter(f=>f.text?.includes('OBS-private')===true);
    expect(readable).toHaveLength(1);
    expect(readable[0]).toMatchObject({role:'text',name:'',text:'OBS-private-é-471'});
    for(const fact of Object.values(observation.facts).filter(f=>f!==readable[0])){expect(fact.name).not.toBe('Business reference');}
    // No field value is readable, whatever the page holds: the password and the prefilled input never reach the observation or any message.
    expect(Object.values(observation.facts).filter(f=>JSON.stringify(f).includes('OBS-private'))).toEqual(readable);
    for(const secret of ['UNREAD_PASSWORD_004_QA','UNREAD_INPUT_004_QA'])expect(JSON.stringify(h.messages)).not.toContain(secret);
    expect(JSON.stringify(h.messages)).not.toContain('reference-read');
    expect(h.context.producers).toEqual([]);expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(1);
  });
});
