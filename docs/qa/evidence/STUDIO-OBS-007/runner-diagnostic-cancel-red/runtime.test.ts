import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { GuidedJournal } from '../../src/guided/journal.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity, validate } from '../../src/guided/contracts.js';
import { guidedContext, dispatch, proposal } from '../helpers/guided.js';
import { GuidedLaunchFailure } from '../../src/run/guidedBrowser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import type { BridgeBootstrap, BridgeOutcome, BridgeObservation, Action, Limits } from '../../src/guided/types.js';

const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{vi.useRealTimers();for(const fn of cleanup.reverse())await fn();cleanup.length=0;});
async function directory(){const p=await mkdtemp(join(tmpdir(),'guided-unit-'));cleanup.push(()=>rm(p,{recursive:true,force:true}));return p;}
async function setup(options:{failEffect?:boolean;loseOutcomeAck?:boolean;leaseMs?:number;limits?:Partial<Limits>;observationCallback?:(body:unknown,key?:string)=>Promise<void>}={}){
  const context=guidedContext('https://example.test');Object.assign(context.limits,options.limits);if(options.leaseMs)context.leaseExpiresAt=new Date(Date.now()+options.leaseMs).toISOString();
  const messages:{route:string;body:unknown;key?:string}[]=[];const path=await directory();let generation=0;
  const browser:GuidedBrowser={evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),bootstrapId:randomUUID(),documentId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:vi.fn(()=>Promise.resolve(true)),navigateBlank:vi.fn(async()=>{const files=await readdir(path);const journal=await readFile(join(path,files.find(f=>f.endsWith('.journal'))??''),'utf8');expect(journal.trim().split('\n')).toHaveLength(2);if(options.failEffect)throw new Error('captured-canary-private');}),close:vi.fn(()=>Promise.resolve()),observations:{pageMatches:()=>Promise.resolve(true),validateInvocation:()=>Promise.resolve(true),invoke:()=>Promise.resolve({value:'ab'}),withhold:()=>Promise.resolve(),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'page-document',generation:++generation,origin:context.approvedOrigins[0]??'',observedAt:new Date().toISOString(),coverage:{mode:'semantic',complete:true,truncated:false,withheldRegions:0,passwordControls:0,reason:'complete'},nodes:[]},json:'',bytes:0,observationHash:''}),matches:()=>Promise.resolve(true),dispose:()=>Promise.resolve()}};
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,journalDirectory:path,rules:[],launch:()=>Promise.resolve(browser),callback:(route,body,key)=>{messages.push({route,body,...(key?{key}:{})});return route==='observations'&&options.observationCallback?options.observationCallback(body,key):route==='outcomes'&&options.loseOutcomeAck?Promise.reject(new Error('lost')):Promise.resolve();}});cleanup.push(()=>runtime.stop('CANCELLED'));await runtime.start();
  const evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;const p=proposal(context,evidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});
  const prep=await runtime.prepare({...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Math.min(Date.now()+10_000,Date.parse(context.leaseExpiresAt)-1)).toISOString()});
  return {context,runtime,browser,messages,request:dispatch(context,p,prep)};
}
describe('durable worker consumption and recovery',()=>{
  it('excludes independent writers and refuses missing/corrupt expected journal state',async()=>{
    const path=await directory();const journal=await GuidedJournal.open(path,'session');
    await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
    const results=await Promise.allSettled([journal.consume({admissionId:'one',ownerFence:1}),journal.consume({admissionId:'one',ownerFence:1})]);expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    const filename=(await readdir(path)).find(f=>f.endsWith('.journal'));if(!filename)throw new Error('JOURNAL');await unlink(join(path,filename));await expect(journal.consume({admissionId:'new',ownerFence:1})).rejects.toThrow('JOURNAL_UNAVAILABLE');await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
    await writeFile(join(path,filename),'partial');await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
  });
  it('fsyncs before an effect and admits only one concurrent delivery',async()=>{
    const h=await setup();const results=await Promise.allSettled([h.runtime.dispatch(h.request),h.runtime.dispatch(h.request)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(h.browser.navigateBlank).toHaveBeenCalledTimes(1);await expect(h.runtime.dispatch(h.request)).rejects.toThrow();
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations']);
  });
  it('never retries an effect after an uncertain exception and delivers bounded non-authoritative diagnostics',async()=>{
    const h=await setup({failEffect:true});const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.browser.close).toHaveBeenCalledTimes(1);await expect(h.runtime.dispatch(h.request)).rejects.toThrow();expect(h.browser.navigateBlank).toHaveBeenCalledTimes(1);expect(result.errorMessage).toBe('Error: captured-canary-private');expect(()=>validate('bridge',result,'outcome')).not.toThrow();
  });
  it('preserves a definite success when its callback acknowledgement is lost',async()=>{
    const h=await setup({loseOutcomeAck:true});const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('SUCCEEDED');const outcomes=h.messages.filter(m=>m.route==='outcomes');expect(outcomes).toHaveLength(1);expect((outcomes[0]?.body as BridgeOutcome).ledger.state).toBe('SUCCEEDED');expect(h.browser.close).toHaveBeenCalledOnce();
  });
  it('redacts the in-flight local value when stop has already wiped its inventory',async()=>{
    const h=await setup();const input=h.context.authoredInputs.inputs[0];if(!input||!('value' in input))throw new Error('INPUT');
    let release:()=>void=()=>undefined;vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    vi.mocked(h.browser.navigateBlank).mockImplementationOnce(()=>{void h.runtime.stop('CANCELLED');return Promise.reject(new Error(input.value));});
    const pending=h.runtime.dispatch(h.request);
    try{await vi.waitFor(()=>{expect(h.messages.filter(message=>message.route==='outcomes')).toHaveLength(1);});const outcome=h.messages.find(message=>message.route==='outcomes')?.body as BridgeOutcome;expect(outcome.errorMessage).toBe('Error: [REDACTED]');expect(JSON.stringify(h.messages)).not.toContain(input.value);expect(stderr).toHaveBeenCalledWith('Error: [REDACTED]\n');}
    finally{release();await pending;stderr.mockRestore();}
  });
  it('cancellation before consume prevents invocation and lease expiry autonomously closes',async()=>{
    const h=await setup();await h.runtime.stop('CANCELLED');await expect(h.runtime.dispatch(h.request)).rejects.toThrow('CONTEXT_LOST');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
    vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});const timed=await setup({leaseMs:80});await vi.advanceTimersByTimeAsync(81);expect(timed.runtime.active).toBe(false);expect(timed.browser.close).toHaveBeenCalledOnce();
  });
  it('reports a definite failed target refusal after consume and before any browser invocation',async()=>{
    const h=await setup();vi.mocked(h.browser.blankMatches).mockResolvedValueOnce(false);const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('FAILED');expect(result.ledger.outcomeCode).toBe('TARGET_CHANGED');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
  it('cancellation after durable consume but before invocation prevents the browser call',async()=>{
    const h=await setup();vi.mocked(h.browser.blankMatches).mockImplementationOnce(async()=>{await h.runtime.stop('CANCELLED');return true;});
    const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
  it('cancellation after an application effect cannot commit a success or retry',async()=>{
    const h=await setup();let effects=0;vi.mocked(h.browser.navigateBlank).mockImplementationOnce(async()=>{effects++;await h.runtime.stop('CANCELLED');});
    const result=await h.runtime.dispatch(h.request);expect(effects).toBe(1);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');await expect(h.runtime.dispatch(h.request)).rejects.toThrow('CONTEXT_LOST');expect(effects).toBe(1);
  });
  it('retains cumulative allocations while admitting appended prospective consumers',async()=>{
    const h=await setup();const next=structuredClone(h.context);next.materializationRevision++;next.allocations[0]?.consumers.push({stepId:'submit',argumentSlot:'assert.expected'});expect(()=>h.runtime.update(next)).not.toThrow();
    const dropped=structuredClone(next);dropped.materializationRevision++;dropped.allocations[0]?.consumers.shift();expect(()=>h.runtime.update(dropped)).toThrow('CONTEXT_REVISION');
    const changed=structuredClone(next);changed.materializationRevision++;if(changed.allocations[0])changed.allocations[0].needId='replacement';expect(()=>h.runtime.update(changed)).toThrow('CONTEXT_REVISION');
  });
  it.each([{maxRuntimeValues:1},{maxRuntimeValuesBytesTotal:3}])('enforces aggregate/count bounds without exporting a read value: %j',async limits=>{
    const h=await setup({limits});await h.runtime.dispatch(h.request);
    const original=h.context.allocations[0];if(!original)throw new Error('ALLOCATION');h.context.allocations.push({...original,bindingId:'second',needId:'need-two'});h.context.materializationRevision++;h.runtime.update(h.context);
    const read=async(bindingId:string,ordinal:number)=>{
      const observation=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
      const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};
      const operation:Action['operation']={kind:'read',bindingId,recipe:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:'read-policy'}};
      const p=proposal(h.context,evidence,'read',operation,{nodeId:'read-node',documentId:evidence.documentId,generation:evidence.generation,locator:{kind:'testId',value:'source',exact:true}});p.coordinate.ordinal=ordinal;
      const proof=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10_000).toISOString()});const request=dispatch(h.context,p,proof);return{outcome:await h.runtime.dispatch(request),p};
    };
    const first=await read('binding-one',0);expect(first.outcome.ledger.state).toBe('SUCCEEDED');if(!first.outcome.availability||first.p.operation.kind!=='read'||!first.p.executionEvidence.origin)throw new Error('READ');
    h.context.producers.push({bindingId:'binding-one',producerAdmissionId:first.outcome.ledger.admission.admissionId,coordinate:first.p.coordinate,origin:first.p.executionEvidence.origin,recipe:first.p.operation.recipe,availability:first.outcome.availability});h.context.materializationRevision++;h.runtime.update(h.context);
    const other=await setup();const foreign=structuredClone(other.context);foreign.producers=structuredClone(h.context.producers);foreign.materializationRevision++;expect(()=>other.runtime.update(foreign)).toThrow('CONTEXT_LOST');
    const second=await read('second',1);expect(second.outcome.ledger.state).not.toBe('SUCCEEDED');expect(second.outcome.availability).toBeNull();expect(h.runtime.active).toBe(false);expect(JSON.stringify(h.messages.filter(m=>m.route==='outcomes'))).not.toContain('"value"');
  });
  it('retains capacity until actual browser close and releases private runtime references even when close fails',async()=>{
    const h=await setup();let finish:(()=>void)|undefined;vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));const stopping=h.runtime.stop('CANCELLED');await Promise.resolve();expect(h.runtime.active).toBe(true);expect(h.messages.filter(m=>m.route==='lifecycle')).toHaveLength(0);if(!finish)throw new Error('CLOSE');finish();await stopping;expect(h.runtime.active).toBe(false);
    const closed=h.runtime as unknown as {browser:unknown;launching:unknown;context:{authoredInputs:{inputs:unknown[]}}};expect(closed.browser).toBeNull();expect(closed.launching).toBeNull();expect(closed.context.authoredInputs.inputs).toEqual([]);
    const failed=await setup();vi.mocked(failed.browser.close).mockRejectedValueOnce(new Error('private-close-canary'));await expect(failed.runtime.stop('CANCELLED')).rejects.toThrow('CONTEXT_LOST');expect(failed.runtime.active).toBe(true);expect(failed.messages.filter(m=>m.route==='lifecycle')).toHaveLength(0);
    const state=failed.runtime as unknown as {browser:unknown;launching:unknown;context:{authoredInputs:{inputs:unknown[]}}};expect(state.browser).toBeNull();expect(state.launching).toBeNull();expect(state.context.authoredInputs.inputs).toEqual([]);expect(JSON.stringify(failed.messages)).not.toContain('private-close-canary');
    // A failed close remains unacknowledged. Test cleanup must not turn it into a false success.
    cleanup.pop();
  });
  it('cleans a partial launch failure and cancels an in-flight launch without creating a live context',async()=>{
    const failedContext=guidedContext('https://example.test');const failedClose=vi.fn(()=>Promise.resolve());const failed=new GuidedRuntime(failedContext,{workerId:failedContext.workerId,journalDirectory:await directory(),rules:[],launch:()=>Promise.reject(new GuidedLaunchFailure(failedClose)),callback:()=>Promise.resolve()});
    await expect(failed.start()).rejects.toThrow('CONTEXT_LOST');await failed.stop('CONTEXT_LOST');expect(failedClose).toHaveBeenCalledOnce();expect(failed.active).toBe(false);
    const fixture=await setup();const context=guidedContext('https://example.test');let release:((browser:GuidedBrowser)=>void)|undefined;let entered=false;const gate=new Promise<GuidedBrowser>(resolve=>{release=resolve;});
    const close=vi.fn(()=>Promise.resolve());const browser={...fixture.browser,close};const runtime=new GuidedRuntime(context,{workerId:context.workerId,journalDirectory:await directory(),rules:[],launch:()=>{entered=true;return gate;},callback:()=>Promise.resolve()});
    const starting=runtime.start().catch((error:unknown)=>error instanceof Error?error.message:'unexpected');await expect.poll(()=>entered).toBe(true);const stopping=runtime.stop('CANCELLED');expect(runtime.active).toBe(true);if(!release)throw new Error('LAUNCH');release(browser);await stopping;expect(await starting).toBe('CONTEXT_LOST');expect(close).toHaveBeenCalledOnce();expect(runtime.active).toBe(false);
  });
  it('refreshes a new generation, correlates its committed callback and invalidates old preparation without another action',async()=>{
    const h=await setup();const observe=vi.spyOn(h.browser.observations,'observe');await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:0},'blank')).rejects.toThrow('TARGET_CHANGED');await h.runtime.dispatch(h.request);
    const old=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:old.documentId,generation:old.generation,origin:old.origin,observationHash:hash(old)};
    const next=proposal(h.context,evidence,'next',{kind:'navigate',destinationInputId:'input-next'});const prepared=await h.runtime.prepare({...identity(h.context),proposal:next,requestDigest:hash(next),expiresAt:new Date(Date.now()+10_000).toISOString()});
    const request={...identity(h.context),expectedGeneration:old.generation};const refreshed=await h.runtime.refreshObservation(request,'refresh-one');expect(refreshed.observation.generation).toBe(old.generation+1);expect(h.runtime.currentObservation(refreshed)).toEqual(refreshed);expect(h.messages.at(-1)?.key).toBe(`oref-${hash({identity:identity(request),idempotencyKey:'refresh-one',requestDigest:hash(request)})}`);
    await expect(h.runtime.dispatch(dispatch(h.context,next,prepared))).rejects.toThrow('PREPARATION_DENIED');await expect(h.runtime.refreshObservation(request,'stale-new-key')).rejects.toThrow('TARGET_CHANGED');
    const newer=await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:refreshed.observation.generation},'refresh-two');expect(newer.observation.generation).toBe(refreshed.observation.generation+1);expect(()=>h.runtime.currentObservation(refreshed)).toThrow('TARGET_CHANGED');expect(observe).toHaveBeenCalledTimes(3);expect(h.browser.navigateBlank).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(1);
  });
  it('does not expose unacknowledged refresh evidence and rejects late acknowledgement after cancellation',async()=>{
    let entered:(()=>void)|undefined,release:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
    const h=await setup({observationCallback:(_body,key)=>{if(key){entered?.();return hold;}return Promise.resolve();}});await h.runtime.dispatch(h.request);const request={...identity(h.context),expectedGeneration:1};const pending=h.runtime.refreshObservation(request,'hold');await entering;
    await expect(h.runtime.refreshObservation(request,'busy')).rejects.toThrow('BUSY');expect(()=>h.runtime.currentObservation(h.messages.at(-1)?.body)).toThrow('BUSY');await h.runtime.stop('CANCELLED');if(!release)throw new Error('ACK');release();await expect(pending).rejects.toThrow('CONTEXT_LOST');expect(h.browser.navigateBlank).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('reserves refresh count and remaining byte capacity without resetting budgets or running extra effects',async()=>{
    const h=await setup({limits:{maxObservations:2}});const observe=vi.spyOn(h.browser.observations,'observe');await h.runtime.dispatch(h.request);await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1},'last');await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:2},'exhausted')).rejects.toThrow('BUDGET_EXCEEDED');expect(observe).toHaveBeenCalledTimes(2);expect(h.browser.navigateBlank).toHaveBeenCalledOnce();
    const bytes=await setup({limits:{maxSanitizedEvidenceBytesTotal:700,maxObservationBytes:700}});const collect=vi.spyOn(bytes.browser.observations,'observe');await bytes.runtime.dispatch(bytes.request);const first=(bytes.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;const remaining=700-Buffer.byteLength(JSON.stringify(first));await expect(bytes.runtime.refreshObservation({...identity(bytes.context),expectedGeneration:1},'byte-limit')).rejects.toThrow('BUDGET_EXCEEDED');expect(collect.mock.calls[1]?.[0]).toBe(remaining);expect(bytes.messages.filter(m=>m.route==='observations')).toHaveLength(1);
  });
  it('stops on a lost refresh callback acknowledgement without changing already successful action outcomes',async()=>{
    const h=await setup({observationCallback:(_body,key)=>key?Promise.reject(new Error('PRIVATE-ACK-FAILURE')):Promise.resolve()});await h.runtime.dispatch(h.request);await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1},'lost-ack')).rejects.toThrow('CONTEXT_LOST');expect(h.runtime.active).toBe(false);expect(h.messages.filter(m=>m.route==='outcomes').map(m=>(m.body as BridgeOutcome).ledger.state)).toEqual(['SUCCEEDED']);expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-ACK-FAILURE');
  });
  it('rejects mismatched owner/tuple, raised caps, fabricated origin and context rewrites',async()=>{
    const h=await setup();await expect(h.runtime.dispatch({...h.request,ownerFence:2})).rejects.toThrow('IDENTITY_MISMATCH');await expect(h.runtime.dispatch({...h.request,versions:{...h.request.versions,contract:1}})).rejects.toThrow('SCHEMA');
    expect(()=>validate('runner-context',{...h.context,limits:{...h.context.limits,maxRuntimeValues:33}})).toThrow('SCHEMA');
    const altered=structuredClone(h.request);altered.proposal.executionEvidence={...altered.proposal.executionEvidence,origin:'https://example.test'} as typeof altered.proposal.executionEvidence;await expect(h.runtime.dispatch(altered)).rejects.toThrow('SCHEMA');
    expect(()=>h.runtime.update({...h.context,authoredInputsHash:'b'.repeat(64)})).toThrow('INPUT_IDENTITY');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
});
