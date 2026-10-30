import { prepareBrowserProfile as compiledPrepareBrowserProfile } from '../../dist/run/scratchLayout.js';
import { playwrightBrowserFactory as compiledBrowserFactory } from '../../dist/run/browser.js';
import { prepareObservedAction as compiledPrepare, performPreparedObservedAction as compiledPerform } from '../../dist/run/observedReplayAdapter.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../src/executor/observedReplay.js';
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playwrightBrowserFactory } from './preparedBrowser.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { observationReadProfile } from '../../src/run/observationReadProfile.js';
import type { Guard, ReplayAction, Scope } from '../../src/executor/observedOperations.js';
import { untilMs } from './realRunner.js';
describe('observed retained native/fixed primitive behavior', () => {
    it('preserves role-div click, CSS hover, native Tab/Arrow and fixed fill/select without legacy fallback', async () => {
        const events: Record<string, unknown>[] = [];
        const server = createServer((req, res) => {
            if (req.url === '/event') {
                let text = '';
                req.on('data', (b: Buffer) => { text += b.toString(); });
                req.on('end', () => { events.push(JSON.parse(text) as Record<string, unknown>); res.end('OK'); });
                return;
            }
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(`<style>#hover:hover{background-color:rgb(255,0,0)}</style><main aria-label="Operations"><div role="button" aria-label="Div button" tabindex="0" id="div">Div button</div><div role="button" aria-label="Hover target" id="hover" style="width:150px;height:40px">Hover target</div><input aria-label="First"><input aria-label="Second"><input type="checkbox" aria-label="Toggle"><select aria-label="Choice"><option value="option-alpha">Alpha</option><option value="option-beta">Beta</option></select><textarea aria-label="Source">  private-é  </textarea></main><script>const note=x=>fetch('/event',{method:'POST',body:JSON.stringify(x)});document.getElementById('div').onclick=e=>note({kind:'div',trusted:e.isTrusted});document.getElementById('hover').onmouseenter=e=>note({kind:'hover',color:getComputedStyle(e.target).backgroundColor,trusted:e.isTrusted});document.addEventListener('keydown',e=>note({kind:'key',key:e.key,trusted:e.isTrusted}));document.querySelector('[aria-label=Second]').onfocus=()=>note({kind:'second-focus'});document.querySelector('[aria-label=First]').onchange=e=>note({kind:'fill',value:e.target.value,trusted:e.isTrusted});document.querySelector('[aria-label=Toggle]').onchange=e=>note({kind:'toggle',checked:e.target.checked,trusted:e.isTrusted});document.querySelector('select').onchange=e=>note({kind:'select',value:e.target.value,trusted:e.isTrusted});</script>`);
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        const address = server.address();
        if (!address || typeof address === 'string')
            throw Error('port');
        const origin = `http://localhost:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(), 'observed-native-'));
        const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['navigate', 'click', 'hover', 'press', 'fill', 'check', 'uncheck', 'selectOption', 'read', 'assert'], initialContext: { kind: 'initialBlank' } };
        
        const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: scope });
        const adapter = createObservedReplayAdapter(handle, scope, TEST_DOMAINS, 'run', () => undefined);
        const probe = required(handle.createObservationSession?.bind(handle))({ sessionId: 'probe', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: observationReadProfile(TEST_DOMAINS) });
        const budget = new ReplayAcquisitionBudget(), stepBudget = { extra: 0 };
        const invoke = (a: ReplayAction, g: Guard, value: string | null) => { const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 10000, new AbortController().signal, budget, stepBudget); return control.run(() => adapter.perform(a, g, value, control)); };
        let ordinal = 0;
        const action = (operation: ReplayAction['operation']): ReplayAction => ({ coordinate: { stepId: '00000000-0000-4000-8000-000000000001', ordinal: ordinal++ }, guardId: 'guard', operation });
        try {
            await invoke(action({ kind: 'navigate', destinationInputId: 'destination' }), { guardId: 'guard', origin: null, target: { kind: 'initialBlank' } }, origin + '/');
            const perform = async (name: string, operation: ReplayAction['operation'], value: string | null = null) => {
                const o = await probe.observe();
                const found = Object.entries(o.observation.facts).find(([, fact]) => fact.name === name);
                expect(found, name + ':' + Object.values(o.observation.facts).map(f => f.name).join(',')).toBeDefined();
                if (name === 'Div button' || name === 'Hover target')
                    expect(required(found)[1].role).toBe('button');
                // The frozen target is what the runner derives at prepare for a ref the model names; a read of a field value is not preparable (the kept profile
                // never grants it), so its target is prepared for a harmless assert and the read recipe is then replayed against it.
                const prepareOperation: ReplayAction['operation'] = operation.kind === 'read' ? { kind: 'assert', predicate: 'visible', expected: null } : operation;
                const resolved = await probe.prepareTarget({ ref: required(found)[0], documentId: o.observation.documentId, generation: o.observation.generation, origin: o.observation.origin, operation: prepareOperation, authoredLiteral: operation.kind === 'selectOption' ? value : null });
                const guard: Guard = { guardId: 'guard', origin, target: { kind: 'element', locator: resolved.locator, tier: resolved.tier, identity: resolved.identity, readRuleId: operation.kind === 'read' ? o.observation.readRuleId : null } };
                return invoke(action(operation), guard, value);
            };
            await perform('Div button', { kind: 'click' });
            await perform('Hover target', { kind: 'hover' });
            await perform('First', { kind: 'press', key: 'Tab' });
            await perform('First', { kind: 'press', key: 'ArrowDown' });
            await perform('First', { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'input' } }, 'exact-value');
            await perform('Toggle', { kind: 'check' });
            await perform('Toggle', { kind: 'uncheck' });
            await perform('Choice', { kind: 'selectOption', value: { kind: 'authoredLiteral', sourceInputId: 'choice' } }, 'option-beta');
            // The read profile grants visible text only: a field's value is never readable, whatever recipe asks for it.
            await expect(perform('Source', { kind: 'read', bindingId: 'binding', recipe: { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'textarea', policyRuleId: 'approved' } })).rejects.toMatchObject({ code: 'READ_REFUSED' });
            await untilMs(() => events.some(e => e.kind === 'select'), 2000);
            expect(events).toContainEqual({ kind: 'div', trusted: true });
            expect(events).toContainEqual({ kind: 'hover', color: 'rgb(255, 0, 0)', trusted: true });
            expect(events).toContainEqual({ kind: 'key', key: 'Tab', trusted: true });
            expect(events).toContainEqual({ kind: 'key', key: 'ArrowDown', trusted: true });
            expect(events).toContainEqual({ kind: 'second-focus' });
            // The one executor fills through Playwright locator.fill (a trusted input event); the old in-page fill was untrusted.
            expect(events).toContainEqual({ kind: 'fill', value: 'exact-value', trusted: true });
            expect(events).toContainEqual({ kind: 'select', value: 'option-beta', trusted: false });
            expect(events.filter(e => e.kind === 'toggle').map(e => e.checked)).toEqual([true, false]);
        }
        finally {
            await probe.dispose();
            await adapter.dispose();
            await handle.close();
            server.closeAllConnections();
            await new Promise<void>(r => server.close(() => { r(); }));
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
describe('actual retained native preparation and input fences', () => {
    it.each(['before-timeout', 'before-cancel', 'after-timeout', 'after-cancel'] as const)('stops %s without a later native input', async (mode) => {
        const events: string[] = [];
        const server = createServer((req, res) => { if (req.url?.startsWith('/event/')) {
            events.push(req.url.slice(7));
            res.end('OK');
            return;
        } res.setHeader('content-type', 'text/html'); res.end('<button aria-label="Commit" style="width:200px;height:60px">Commit</button><script>for(const name of ["mousemove","mousedown","mouseup","click"])document.querySelector("button").addEventListener(name,()=>fetch("/event/"+name));</script>'); });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string')
            throw Error('port');
        const origin = `http://localhost:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(), 'native-fence-'));
        const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['click'], initialContext: { kind: 'initialBlank' } };
        const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1000, height: 600 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: scope });
        const session = required(handle.createObservationSession?.bind(handle))({ sessionId: 'native', scopeHash: 'c'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: { policyRuleId: 'structural', allowStructuralDiscovery: true } });
        try {
            await required(handle.observedNavigateBlank?.bind(handle))(origin + '/');
            const observation = await session.observe(), found = required(Object.entries(observation.observation.facts).find(([, fact]) => fact.name === 'Commit'));
            const resolved = await session.prepareTarget({ ref: found[0], documentId: observation.observation.documentId, generation: observation.observation.generation, origin: observation.observation.origin, operation: { kind: 'click' }, authoredLiteral: null });
            let now = 0, checks = 0, tripped = false;
            const abort = new AbortController(), control = new ObservedInvocationControl({ now: () => now }, 1000, abort.signal, new ReplayAcquisitionBudget(), { extra: 0 }), originalCheck = control.check.bind(control);
            control.check = () => { checks++; if (!tripped && (mode.startsWith('before') ? checks === 4 : control.phase === 'INVOKING')) {
                tripped = true;
                if (mode.endsWith('cancel'))
                    abort.abort();
                else
                    now = 1001;
            } originalCheck(); };
            const invocation = { resolved, origin, operation: { kind: 'click' } as const, resolvedValue: null, maxValueBytes: 4096, readRuleId: null, profile: 'replay' as const };
            const invoke = session.invoke.bind(session);
            await expect(control.run(() => invoke(invocation, control))).rejects.toThrow(mode.endsWith('cancel') ? 'CANCELLED' : mode.startsWith('before') ? 'TIMEOUT' : 'OUTCOME_UNKNOWN');
            if (mode.startsWith('after'))
                await untilMs(() => events.includes('mousemove'), 2000);
            expect(tripped).toBe(true);
            expect(events.filter(e => e === 'mousemove')).toHaveLength(mode.startsWith('after') ? 1 : 0);
            expect(events.filter(e => e !== 'mousemove')).toEqual([]);
            expect(control.phase).toBe('POISONED');
        }
        finally {
            await session.dispose();
            await handle.close();
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => { resolve(); }));
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);
});

describe('actual initial-blank CDP acknowledgement fence',()=>{
  it.each(['timeout','cancel'] as const)('keeps held inner blank check PREPARING on %s and never navigates later',async reason=>{
    let receipts=0;const server=createServer((_req,res)=>{receipts++;res.end('<main>Receipt</main>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://localhost:${String(address.port)}`,dir=await mkdtemp(join(tmpdir(),'blank-fence-'));
    const scope:Scope={principalId:'p',csiId:'csi',environment:'fixture',capabilities:['navigate'],initialContext:{kind:'initialBlank'}};
    
    const handle=await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',viewport:{width:1000,height:600},recording:{width:640,height:480},scratchPath:dir,observedScope:scope});
    // Observe/hold the real public CDPSession.send acknowledgement, never substitute a result.
    interface PublicSession {send(method:string,parameters?:Record<string,unknown>):Promise<unknown>;detach():Promise<void>}
    const page=handle.page as unknown as {context():{newCDPSession(page:unknown):Promise<PublicSession>}};
    const session=await page.context().newCDPSession(page),prototype=Object.getPrototypeOf(session) as PublicSession;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Test interceptor forwards the original actual CDP receiver using call(this).
    const original=prototype.send;
    let release=():void=>undefined,entered=():void=>undefined,checks=0,returned=false;const held=new Promise<void>(resolve=>{release=resolve;}),observed=new Promise<void>(resolve=>{entered=resolve;});
    prototype.send=async function(method,parameters){const result=await original.call(this,method,parameters);if(method==='Runtime.callFunctionOn'&&String(parameters?.functionDeclaration).includes('this === document && location.href')){checks++;if(checks===2){entered();await held;returned=true;}}return result;};
    const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'blank-run',()=>undefined),abort=new AbortController(),control=new ObservedInvocationControl({now:()=>performance.now()},performance.now()+1000,abort.signal,new ReplayAcquisitionBudget(),{extra:0});
    const action:ReplayAction={coordinate:{stepId:'00000000-0000-4000-8000-000000000001',ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'url'}},guard:Guard={guardId:'g0',origin:null,target:{kind:'initialBlank'}};
    const work=control.run(()=>adapter.perform(action,guard,origin+'/',control)),stopped=expect(work).rejects.toThrow(reason==='cancel'?'CANCELLED':'TIMEOUT');
    try{await observed;expect(control.phase).toBe('PREPARING');if(reason==='cancel')abort.abort();await stopped;release();await untilMs(()=>returned,1000);expect(await required(handle.observedBlankMatches?.bind(handle))()).toBe(true);expect(receipts).toBe(0);expect(control.phase).toBe('POISONED');}finally{release();prototype.send=original;await session.detach();await adapter.dispose();await handle.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{resolve();}));await rm(dir,{recursive:true,force:true});}
  },30000);
});

it('combined physical replacement after prefix resolution dispatches zero Enter', async () => {
  for (const phase of ['before-fence','after-focus'] as const) {
    let enters = 0;
    const server = createServer((req, res) => {
      if (req.url === '/entered') { enters++; res.end('OK'); return; }
      res.setHeader('content-type','text/html'); res.end('<input aria-label="Search"><button>Other</button><script>document.addEventListener("keydown",e=>{if(e.key==="Enter")fetch("/entered")});</script>');
    });
    await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://localhost:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(),'prefix-physical-'));
    compiledPrepareBrowserProfile(dir);
    const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['fill','press'], initialContext: { kind: 'initialBlank' } };
    const handle = await compiledBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser:'chromium', viewport:{width:1000,height:600}, recording:{width:640,height:480}, scratchPath:dir, observedScope:scope });
    const session = required(handle.createObservationSession?.bind(handle))({ sessionId:'physical', scopeHash:'c'.repeat(64), allowedDomains:TEST_DOMAINS, knownSecrets:[], readProfile:{policyRuleId:'structural',allowStructuralDiscovery:true} });
    // Only fixture DOM mutation; product resolution never executes this test seam.
    const page = handle.page as { locator(selector:string): { evaluate(fn:(el:Element)=>void):Promise<void>; focus():Promise<void> } };
    const control = () => new ObservedInvocationControl({now:()=>performance.now()},performance.now()+10000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
    try {
      await required(handle.observedNavigateBlank?.bind(handle))(origin+'/');
      const first = (await session.observe()).observation, ref = required(Object.entries(first.facts).find(([, f])=>f.name==='Search'))[0];
      const fill = { kind:'fill' as const,value:{kind:'authoredLiteral' as const,sourceInputId:'fill'} };
      const resolved = await session.prepareTarget({ref,documentId:first.documentId,generation:first.generation,origin,operation:fill,authoredLiteral:'fixture query'});
      const identity = {admissionId:'fill-admission',requestDigest:'a'.repeat(64),operationHash:'b'.repeat(64),coordinate:{stepId:'00000000-0000-4000-8000-000000000001',ordinal:0},authority:'current-authenticated-source'};
      const fillControl=control(); await fillControl.run(()=>session.invoke({resolved,operation:fill,resolvedValue:'fixture query',origin,maxValueBytes:4096,readRuleId:null,profile:'learn',expect:first,invocationIdentity:identity},fillControl));
      session.commitInvocation?.(identity);
      const observation = (await session.observe()).observation;
      const guard: Guard = {guardId:'press',origin,target:{kind:'element',...resolved,readRuleId:null}}, action: ReplayAction = {coordinate:{stepId:'00000000-0000-4000-8000-000000000002',ordinal:0},guardId:'press',operation:{kind:'press',key:'Enter'}};
      const prepared = await compiledPrepare(handle,session,action,guard,observation,observation); if(prepared.kind!=='PREPARED'||prepared.target.kind!=='node')throw Error('PREPARED');
      const inherited={kind:'same-element-press' as const,predecessorAdmissionId:identity.admissionId,predecessorRequestDigest:identity.requestDigest,predecessorOperationHash:identity.operationHash,predecessorCoordinate:identity.coordinate,documentId:observation.documentId};
      await session.prepareTarget({ref:prepared.target.ref,documentId:observation.documentId,generation:observation.generation,origin,operation:action.operation,authoredLiteral:null,frozen:resolved,pressInheritance:inherited,continuityAuthority:identity.authority});
      if(phase==='before-fence')await page.locator('input').evaluate(el=>{el.replaceWith(el.cloneNode(true));});
      else {await page.locator('button').focus();await page.locator('input').evaluate(el=>{el.addEventListener('focus',()=>{el.replaceWith(el.cloneNode(true));},{once:true});});}
      const pressControl=control();
      await expect(pressControl.run(()=>compiledPerform(handle,session,action,guard,prepared.target,null,pressControl,undefined,'domcontentloaded',10000,'learn',{invocationIdentity:{...identity,admissionId:'press-admission',coordinate:action.coordinate},pressInheritance:inherited}))).rejects.toMatchObject({code:phase==='before-fence'?'TARGET_DRIFT':'OUTCOME_UNKNOWN'});
      expect(enters).toBe(0); expect(JSON.stringify({observation,guard,inherited})).not.toMatch(/backendNodeId|physicalId/u);
    } finally {await session.dispose();await handle.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{ resolve(); }));await rm(dir,{recursive:true,force:true});}
  }
},30000);
