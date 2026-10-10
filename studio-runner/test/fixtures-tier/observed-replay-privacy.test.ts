import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../src/executor/observedReplay.js';
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playwrightBrowserFactory } from '../../src/run/browser.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { observationPolicy } from '../../src/validator/observedReferencePolicy.js';
import type { Guard, ReplayAction, Scope, TrustedPolicy } from '../../src/executor/observedOperations.js';
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
        const origin = `http://127.0.0.1:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(), 'observed-native-'));
        const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', applicationId: 'app', accountRef: 'account', allowedOrigins: [origin], capabilities: ['navigate', 'click', 'hover', 'press', 'fill', 'check', 'uncheck', 'selectOption', 'read', 'assert'], policyId: 'policy', policyVersion: '1', entryPolicyId: 'entry', initialContext: { kind: 'initialBlank' } };
        const policy: TrustedPolicy = { version: 1, policyId: 'policy', policyVersion: '1', applicationId: 'app', environment: 'fixture', accountRef: 'account', entryPolicyId: 'entry', allowedOrigins: [origin], rules: [], applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true, readGrants: [{ policyRuleId: 'approved', origin, region: { kind: 'application' }, controlValue: { classification: 'nonsecretApproved', types: ['text', 'textarea'] } }] } };
        const handle = await playwrightBrowserFactory.launch({ browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: scope });
        const adapter = createObservedReplayAdapter(handle, scope, policy, 'run', () => undefined);
        const probe = required(handle.createObservationSession?.bind(handle))({ sessionId: 'probe', scopeHash: 'a'.repeat(64), approvedOrigins: [origin], knownSecrets: [], ...observationPolicy(policy) });
        const budget = new ReplayAcquisitionBudget(), stepBudget = { extra: 0 };
        const invoke = (a: ReplayAction, g: Guard, value: string | null) => { const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 10000, new AbortController().signal, budget, stepBudget); return control.run(() => adapter.perform(a, g, value, control)); };
        let ordinal = 0;
        const action = (operation: ReplayAction['operation']): ReplayAction => ({ coordinate: { stepId: '00000000-0000-4000-8000-000000000001', ordinal: ordinal++ }, guardId: 'guard', operation });
        try {
            await invoke(action({ kind: 'navigate', destinationInputId: 'destination' }), { guardId: 'guard', origin: null, target: { kind: 'initialBlank' } }, origin + '/');
            const perform = async (name: string, operation: ReplayAction['operation'], value: string | null = null) => {
                const o = await probe.observe();
                const node = o.observation.nodes.find(n => n.name === name);
                expect(node, name + ':' + o.observation.nodes.map(n => n.name).join(',')).toBeDefined();
                const locator = required(node).locatorHints.find(l => l.kind === 'role');
                expect(locator).toBeDefined();
                const guard: Guard = { guardId: 'guard', origin, target: { kind: 'element', locator: required(locator), role: required(node).role, elementType: required(node).elementType, controlType: required(node).controlType, classification: required(node).classification, visible: required(node).visible, actionable: required(node).actionable, readRuleId: operation.kind === 'read' ? required(node).policyRuleId : null } };
                if (name === 'Div button' || name === 'Hover target')
                    expect(required(node).actionable).toBe(false);
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
            const read = await perform('Source', { kind: 'read', bindingId: 'binding', recipe: { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'textarea', policyRuleId: 'approved' } });
            expect(read.value).toBe('  private-é  ');
            await untilMs(() => events.some(e => e.kind === 'select'), 2000);
            expect(events).toContainEqual({ kind: 'div', trusted: true });
            expect(events).toContainEqual({ kind: 'hover', color: 'rgb(255, 0, 0)', trusted: true });
            expect(events).toContainEqual({ kind: 'key', key: 'Tab', trusted: true });
            expect(events).toContainEqual({ kind: 'key', key: 'ArrowDown', trusted: true });
            expect(events).toContainEqual({ kind: 'second-focus' });
            expect(events).toContainEqual({ kind: 'fill', value: 'exact-value', trusted: false });
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
import type { AcquisitionRequest } from '../../src/run/observationTypes.js';
import type { ServerResponse } from 'node:http';
describe('real private acquisition without public observation widening', () => {
    it.each(['visibility', 'duplicate', 'sensitive-descendant', 'hidden-sensitive', 'unresolved-name', 'wrong-type', 'private-property', 'replacement', 'absent'] as const)('classifies %s from the retained bounded inventory', async (mode) => {
        let gate: ServerResponse | null = null, changed = false;
        const server = createServer((req, res) => {
            if (req.url === '/gate') {
                gate = res;
                return;
            }
            if (req.url === '/changed') {
                changed = true;
                res.end('OK');
                return;
            }
            let target = mode === 'absent' ? '' : mode === 'wrong-type' ? '<div role="button" aria-label="Confirmation">Confirm</div>' : '<button aria-label="Confirmation"' + (mode === 'visibility' ? ' hidden' : '') + '>Confirm</button>';
            if (mode === 'duplicate')
                target += '<button hidden aria-label="Confirmation">Other</button>';
            if (mode === 'sensitive-descendant')
                target = '<button aria-label="Confirmation"><input type="password" value="PRIVATE-SUBTREE"></button>';
            if (mode === 'hidden-sensitive')
                target = '<section hidden data-sensitive><button aria-label="Confirmation">Sensitive</button></section>';
            if (mode === 'unresolved-name')
                target += '<button hidden aria-labelledby="missing">Unknown</button>';
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(`<main aria-label="Operations">${target}<input aria-label="Other field" value="INITIAL-PRIVATE"></main><script>fetch('/gate').then(()=>{${mode === 'visibility' ? "document.querySelector('button').hidden=false;" : mode === 'private-property' ? "document.querySelector('input').value='CHANGED-PRIVATE';" : mode === 'replacement' ? "const old=document.querySelector('button');old.replaceWith(old.cloneNode(true));" : ''}fetch('/changed');});</script>`);
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        const address = server.address();
        if (!address || typeof address === 'string')
            throw Error('port');
        const origin = `http://127.0.0.1:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(), 'observed-acquire-'));
        const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', applicationId: 'app', accountRef: 'account', allowedOrigins: [origin], capabilities: ['navigate', 'click'], policyId: 'policy', policyVersion: '1', entryPolicyId: 'entry', initialContext: { kind: 'initialBlank' } };
        const handle = await playwrightBrowserFactory.launch({ browser: 'chromium', viewport: { width: 1000, height: 600 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: scope });
        const session = required(handle.createObservationSession?.bind(handle))({ sessionId: 'probe', scopeHash: 'b'.repeat(64), approvedOrigins: [origin], knownSecrets: [], rules: [], applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true } });
        try {
            await required(handle.observedNavigateBlank?.bind(handle))(origin + '/');
            await untilMs(() => gate !== null, 2000);
            let observation = await session.observe();
            const before = observation.json;
            const request = (): AcquisitionRequest => ({ documentId: observation.observation.documentId, generation: observation.observation.generation, origin, locator: { kind: 'role', role: 'button', name: 'Confirmation', exact: true }, expected: { kind: 'element', locator: { kind: 'role', role: 'button', name: 'Confirmation', exact: true }, role: 'button', elementType: 'button', controlType: 'none', classification: 'structuralOnly', visible: true, actionable: true, readRuleId: null }, operation: { kind: 'click' } });
            const first = await required(session.acquire?.bind(session))(request());
            expect(first.kind).toBe(mode === 'visibility' ? 'VISIBILITY_PENDING' : (mode === 'private-property' || mode === 'replacement') ? 'READY' : mode === 'absent' ? 'ABSENT' : 'REFUSED');
            expect(observation.json).toBe(before);
            expect(before).not.toContain('INITIAL-PRIVATE');
            expect(before).not.toContain('PRIVATE-SUBTREE');
            required<ServerResponse>(gate).end('release');
            await untilMs(() => changed, 2000);
            if (mode === 'replacement' && first.kind === 'READY')
                expect(await session.matches(first.target, { kind: 'role', role: 'button', name: 'Confirmation', exact: true })).toBe(false);
            if (mode === 'private-property' || mode === 'replacement')
                expect((await required(session.acquire?.bind(session))(request())).kind).toBe('REFUSED');
            if (mode === 'visibility') {
                observation = await session.observe();
                expect((await required(session.acquire?.bind(session))(request())).kind).toBe('READY');
            }
        }
        finally {
            await session.dispose();
            await handle.close();
            server.closeAllConnections();
            await new Promise<void>(r => server.close(() => { r(); }));
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);
});
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
        const origin = `http://127.0.0.1:${String(address.port)}`, dir = await mkdtemp(join(tmpdir(), 'native-fence-'));
        const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', applicationId: 'app', accountRef: 'account', allowedOrigins: [origin], capabilities: ['click'], policyId: 'policy', policyVersion: '1', entryPolicyId: 'entry', initialContext: { kind: 'initialBlank' } };
        const handle = await playwrightBrowserFactory.launch({ browser: 'chromium', viewport: { width: 1000, height: 600 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: scope });
        const session = required(handle.createObservationSession?.bind(handle))({ sessionId: 'native', scopeHash: 'c'.repeat(64), approvedOrigins: [origin], knownSecrets: [], rules: [], applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true } });
        try {
            await required(handle.observedNavigateBlank?.bind(handle))(origin + '/');
            const observation = await session.observe(), node = required(observation.observation.nodes.find(n => n.name === 'Commit')), locator = required(node.locatorHints.find(h => h.kind === 'role'));
            let now = 0, checks = 0, tripped = false;
            const abort = new AbortController(), control = new ObservedInvocationControl({ now: () => now }, 1000, abort.signal, new ReplayAcquisitionBudget(), { extra: 0 }), originalCheck = control.check.bind(control);
            control.check = () => { checks++; if (!tripped && (mode.startsWith('before') ? checks === 4 : control.phase === 'INVOKING')) {
                tripped = true;
                if (mode.endsWith('cancel'))
                    abort.abort();
                else
                    now = 1001;
            } originalCheck(); };
            const invocation = { target: { documentId: node.documentId, generation: node.generation, nodeId: node.nodeId, locator }, origin, operation: { kind: 'click' } as const, resolvedValue: null, maxValueBytes: 4096 };
            const invoke = required(session.invoke?.bind(session));
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
    let receipts=0;const server=createServer((_req,res)=>{receipts++;res.end('<main>Receipt</main>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${String(address.port)}`,dir=await mkdtemp(join(tmpdir(),'blank-fence-'));
    const scope:Scope={principalId:'p',csiId:'csi',environment:'fixture',applicationId:'app',accountRef:'account',allowedOrigins:[origin],capabilities:['navigate'],policyId:'policy',policyVersion:'1',entryPolicyId:'entry',initialContext:{kind:'initialBlank'}};
    const policy:TrustedPolicy={version:1,policyId:'policy',policyVersion:'1',applicationId:'app',environment:'fixture',accountRef:'account',entryPolicyId:'entry',allowedOrigins:[origin],rules:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}};
    const handle=await playwrightBrowserFactory.launch({browser:'chromium',viewport:{width:1000,height:600},recording:{width:640,height:480},scratchPath:dir,observedScope:scope});
    // Observe/hold the real public CDPSession.send acknowledgement, never substitute a result.
    interface PublicSession {send(method:string,parameters?:Record<string,unknown>):Promise<unknown>;detach():Promise<void>}
    const page=handle.page as unknown as {context():{newCDPSession(page:unknown):Promise<PublicSession>}};
    const session=await page.context().newCDPSession(page),prototype=Object.getPrototypeOf(session) as PublicSession;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Test interceptor forwards the original actual CDP receiver using call(this).
    const original=prototype.send;
    let release=():void=>undefined,entered=():void=>undefined,checks=0,returned=false;const held=new Promise<void>(resolve=>{release=resolve;}),observed=new Promise<void>(resolve=>{entered=resolve;});
    prototype.send=async function(method,parameters){const result=await original.call(this,method,parameters);if(method==='Runtime.callFunctionOn'&&String(parameters?.functionDeclaration).includes('this === document && location.href')){checks++;if(checks===2){entered();await held;returned=true;}}return result;};
    const adapter=createObservedReplayAdapter(handle,scope,policy,'blank-run',()=>undefined),abort=new AbortController(),control=new ObservedInvocationControl({now:()=>performance.now()},performance.now()+1000,abort.signal,new ReplayAcquisitionBudget(),{extra:0});
    const action:ReplayAction={coordinate:{stepId:'00000000-0000-4000-8000-000000000001',ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'url'}},guard:Guard={guardId:'g0',origin:null,target:{kind:'initialBlank'}};
    const work=control.run(()=>adapter.perform(action,guard,origin+'/',control)),stopped=expect(work).rejects.toThrow(reason==='cancel'?'CANCELLED':'TIMEOUT');
    try{await observed;expect(control.phase).toBe('PREPARING');if(reason==='cancel')abort.abort();await stopped;release();await untilMs(()=>returned,1000);expect(await required(handle.observedBlankMatches?.bind(handle))()).toBe(true);expect(receipts).toBe(0);expect(control.phase).toBe('POISONED');}finally{release();prototype.send=original;await session.detach();await adapter.dispose();await handle.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{resolve();}));await rm(dir,{recursive:true,force:true});}
  },30000);
});

it('poisons an expired real retained scroll before held cleanup can permit validation or input',async()=>{
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<div style="height:2400px"></div><button aria-label="Commit" style="width:200px;height:60px">Commit</button>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${String(address.port)}`,dir=await mkdtemp(join(tmpdir(),'reveal-fence-'));
  const scope:Scope={principalId:'p',csiId:'csi',environment:'fixture',applicationId:'app',accountRef:'account',allowedOrigins:[origin],capabilities:['click'],policyId:'policy',policyVersion:'1',entryPolicyId:'entry',initialContext:{kind:'initialBlank'}};
  const handle=await playwrightBrowserFactory.launch({browser:'chromium',viewport:{width:1000,height:600},recording:{width:640,height:480},scratchPath:dir,observedScope:scope});const observationSession=required(handle.createObservationSession?.bind(handle))({sessionId:'reveal',scopeHash:'d'.repeat(64),approvedOrigins:[origin],knownSecrets:[],rules:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true}});
  await required(handle.observedNavigateBlank?.bind(handle))(origin+'/');const observation=await observationSession.observe(),node=required(observation.observation.nodes.find(n=>n.name==='Commit')),locator=required(node.locatorHints.find(h=>h.kind==='role'));
  interface PublicSession {send(method:string,parameters?:Record<string,unknown>):Promise<unknown>;detach():Promise<void>}
  const page=handle.page as unknown as {context():{newCDPSession(page:unknown):Promise<PublicSession>}},session=await page.context().newCDPSession(page),prototype=Object.getPrototypeOf(session) as PublicSession;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Test interceptor forwards the actual CDP receiver through call(this).
  const original=prototype.send;
  let releaseScroll=():void=>undefined,releaseCleanup=():void=>undefined,scrolls=0,validations=0,inputs=0,scrollReturned=false,cleanupEntered=false,passes=0;
  const scrollHold=new Promise<void>(resolve=>{releaseScroll=resolve;}),cleanupHold=new Promise<void>(resolve=>{releaseCleanup=resolve;});
  prototype.send=async function(method,parameters){if(method==='Runtime.callFunctionOn'&&String(parameters?.functionDeclaration).startsWith('async function(invocation, element)'))validations++;if(method.startsWith('Input.dispatch'))inputs++;const result=await original.call(this,method,parameters);if(method==='DOM.scrollIntoViewIfNeeded'){scrolls++;await scrollHold;scrollReturned=true;}if(method==='Runtime.releaseObject'){cleanupEntered=true;await cleanupHold;}return result;};
  const control=new ObservedInvocationControl({now:()=>performance.now()},performance.now()+10000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
  const invoke=required(observationSession.invoke?.bind(observationSession));const work=control.run(()=>invoke({target:{documentId:node.documentId,generation:node.generation,nodeId:node.nodeId,locator},origin,operation:{kind:'click'},resolvedValue:null,maxValueBytes:4096},control));void work.then(()=>{passes++;},()=>undefined);const stopped=expect(work).rejects.toThrow('OUTCOME_UNKNOWN');
  try{await untilMs(()=>scrolls===1,2000);await untilMs(()=>cleanupEntered,2500);expect(control.phase).toBe('POISONED');releaseScroll();await untilMs(()=>scrollReturned,1000);await new Promise<void>(resolve=>setImmediate(resolve));expect(validations).toBe(0);expect(inputs).toBe(0);expect(passes).toBe(0);expect(scrolls).toBe(1);releaseCleanup();await stopped;}finally{releaseScroll();releaseCleanup();prototype.send=original;await session.detach();await observationSession.dispose();await handle.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{resolve();}));await rm(dir,{recursive:true,force:true});}
},30000);
