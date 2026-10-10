import type { InvocationControl } from '../../src/executor/observedReplay.js';
import type { AcquisitionRequest } from '../../src/run/observationTypes.js';
import { describe, it, expect } from 'vitest';
import { ObservedAccountLifecycle, accountProvider } from '../../src/run/observedAccount.js';
import type { ObservedAccountProvider, RecordedContextCapability } from '../../src/run/observedAccount.js';
import type { AccountHandle, AdmissionReceipt, Scope } from '../../src/executor/observedOperations.js';
import { hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH } from '../../src/validator/observedReferencePolicy.js';
const id = '00000000-0000-4000-8000-000000000001';
const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'e', applicationId: 'a', accountRef: 'account', allowedOrigins: ['https://example.test'], capabilities: ['read'], policyId: 'p', policyVersion: '1', entryPolicyId: 'entry', initialContext: { kind: 'initialBlank' } };
function wire() { const now = Date.now(), authorization = { version: 1 as const, grantId: id, providerId: 'test', executionId: id, attemptId: id, revisionDigest: 'a'.repeat(64), scope, scopeHash: hashObserved(scope), issuedAt: new Date(now - 100).toISOString(), expiresAt: new Date(now + 10000).toISOString() }; const handle: AccountHandle = { version: 1, authorization, opaqueHandle: 'private' }; const receipt = { request: { executionId: id, attemptId: id, revisionDigest: 'a'.repeat(64), scopeHash: hashObserved(scope), accountGrantId: id }, startDeadlineAt: new Date(now + 10000).toISOString() } as AdmissionReceipt; return { handle, receipt }; }
function setup() { const calls: string[] = [], token = { capability: {} }; const provider: ObservedAccountProvider = { consume() { calls.push('consume'); return Promise.resolve(token); }, prepare() { calls.push('prepare'); return Promise.resolve(token); }, apply() { calls.push('apply'); return Promise.resolve(token); }, dispose() { calls.push('dispose'); return Promise.resolve(); } }; const abort = new AbortController(), lifecycle = new ObservedAccountLifecycle(provider, abort.signal); const context: RecordedContextCapability = { identity: {}, scope, installCookies() { return Promise.resolve(); }, enter() { return Promise.resolve(); } }; return { calls, provider, abort, lifecycle, context }; }
describe('trusted one-attempt account lifecycle', () => {
    it('orders consume/prepare before context apply and disposes exactly once', async () => { const h = setup(), w = wire(); await h.lifecycle.prepare(w.handle, w.receipt); expect(h.calls).toEqual(['consume', 'prepare']); await h.lifecycle.apply(h.context, scope); await expect(h.lifecycle.apply(h.context, scope)).rejects.toThrow(); await h.lifecycle.dispose(); await h.lifecycle.dispose(); expect(h.calls).toEqual(['consume', 'prepare', 'apply', 'dispose']); });
    it('default unconfigured registry refuses before a consume/browser', () => { expect(() => accountProvider(new Map(), wire().handle)).toThrow('ACCOUNT_UNAVAILABLE'); });
    it('wrong execution or expired grant refuses before provider I/O', async () => { const h = setup(), w = wire(); const bad = { ...w.handle, authorization: { ...w.handle.authorization, executionId: 'wrong' } }; await expect(h.lifecycle.prepare(bad, w.receipt)).rejects.toThrow(); expect(h.calls).toEqual([]); });
    it('does not retry an unknown consume', async () => { const h = setup(), w = wire(); h.provider.consume = () => { h.calls.push('consume'); return Promise.reject(Error('PRIVATE')); }; await expect(h.lifecycle.prepare(w.handle, w.receipt)).rejects.toThrow('ACCOUNT_UNKNOWN'); await expect(h.lifecycle.prepare(w.handle, w.receipt)).rejects.toThrow(); expect(h.calls).toEqual(['consume']); });
    it('disposes late consume acknowledgement after cancellation without prepare or revival', async () => {
        const h = setup(), w = wire();
        let release: (value: {
            capability: object;
        }) => void = () => undefined;
        h.provider.consume = () => new Promise(resolve => { release = resolve; });
        const pending = h.lifecycle.prepare(w.handle, w.receipt);
        h.abort.abort();
        await h.lifecycle.dispose();
        release({ capability: {} });
        await expect(pending).rejects.toThrow('CANCELLED');
        expect(h.calls).toEqual(['dispose']);
    });
    it('rejects a swapped recorded context scope before apply', async () => { const h = setup(), w = wire(); await h.lifecycle.prepare(w.handle, w.receipt); await expect(h.lifecycle.apply({ ...h.context, scope: { ...scope, accountRef: 'wrong' } }, scope)).rejects.toThrow('ACCOUNT_UNKNOWN'); expect(h.calls).toEqual(['consume', 'prepare']); await h.lifecycle.dispose(); });
});
import wireFixture from '../../../docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json' with { type: 'json' };
const currentBuild={...wireFixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
import { attachChildRuntime } from '../../src/run/childRuntime.js';
import type { ChildChannel } from '../../src/run/childRuntime.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { Observation } from '../../src/run/observationTypes.js';
import type { Launch2, Execute2 } from '../../src/executor/observedOperations.js';
async function spin(predicate: () => boolean): Promise<void> {
    for (let i = 0; i < 100; i++) {
        if (predicate())
            return;
        await new Promise<void>(r => setImmediate(r));
    }
    throw Error('not settled');
}
function childHarness(mode: 'pass' | 'prepare-wait' | 'apply-wait' | 'read-failure' | 'apply-failure' | 'read-wait' | 'launch-wait' | 'close-failure' = 'pass') {
    let receive: (v: unknown) => void = () => undefined, exited = false, opened = 0, closed = 0, applied = 0, mono = 100;
    const messages: Parameters<ChildChannel['send']>[0][] = [], calls: string[] = [];
    let release: () => void = () => undefined, extraPage: () => void = () => undefined;
    const wait = () => new Promise<void>(resolve => { release = resolve; });
    const token = { capability: {} };
    const provider: ObservedAccountProvider = { consume() { calls.push('consume'); return Promise.resolve(token); }, async prepare() {
            calls.push('prepare');
            if (mode === 'prepare-wait')
                await wait();
            return token;
        }, async apply() {
            calls.push('apply');
            applied++;
            mono += 350;
            if (mode === 'apply-wait')
                await wait();
            if (mode === 'apply-failure')
                throw Error('ACCOUNT-PRIVATE');
            return token;
        }, dispose() { calls.push('dispose'); return Promise.resolve(); } };
    const historicalLaunch=structuredClone(wireFixture.launch);
    const launch = {...historicalLaunch,build:{...currentBuild},admission:{...historicalLaunch.admission,request:{...historicalLaunch.admission.request,build:{...currentBuild}}}} as unknown as Launch2;
    const now = Date.now();
    const mutable = launch as unknown as {
        accountHandle: {
            authorization: {
                issuedAt: string;
                expiresAt: string;
            };
        };
        admission: {
            admittedAt: string;
            startDeadlineAt: string;
            runDeadlineAt: string;
        };
    };
    mutable.accountHandle.authorization.issuedAt = new Date(now - 100).toISOString();
    mutable.accountHandle.authorization.expiresAt = new Date(now + 10000).toISOString();
    mutable.admission.admittedAt = new Date(now).toISOString();
    mutable.admission.startDeadlineAt = new Date(now + 10000).toISOString();
    mutable.admission.runDeadlineAt = new Date(now + 20000).toISOString();
    let observed = 0;
    let lastObserved: Observation | null = null;
    const observations = wireFixture.basis.observations.map(x => ({ ...x.observation, schemaVersion: 1 }) as Observation);
    const handle = { page: {}, onExtraPage(listener:()=>void) { extraPage=listener; }, observedHosts: () => [], close() { closed++; if(mode==='close-failure')return Promise.reject(Error('PRIVATE-CLOSE')); return Promise.resolve('/tmp/controlled.webm'); }, dispose() { closed++; return Promise.resolve(); }, observedBlankMatches() { return Promise.resolve(true); }, observedInitialContextMatches() { return Promise.resolve(true); }, observedNavigateBlank(_destination:string,control?:InvocationControl) { control?.beginInvocation();return Promise.resolve(); }, observedAccountContext: { identity: {}, scope: launch.accountHandle.authorization.scope, installCookies() { return Promise.resolve(); }, enter() { return Promise.resolve(); } }, createObservationSession() {
            return { acquire(request: AcquisitionRequest) { const node = lastObserved?.nodes.find(n => n.locatorHints.some(h => JSON.stringify(h) === JSON.stringify(request.locator))); return Promise.resolve(node ? { kind: 'READY', target: { documentId: node.documentId, generation: node.generation, nodeId: node.nodeId } } : { kind: 'REFUSED', code: 'TARGET_DRIFT' }); }, observe() { const observation = required(observations[[0, 0, 1, 2][observed++] ?? 2]); lastObserved = observation; return Promise.resolve({ observation, json: '', bytes: 0, observationHash: 'a'.repeat(64) }); }, matches() { return Promise.resolve(true); }, validateInvocation() { return Promise.resolve(true); }, invoke(i: {
                    operation: {
                        kind: string;
                    };
                }, control?: InvocationControl) {
                    control?.beginInvocation();
                    if (i.operation.kind === 'read') {
                        if(mode==='read-wait'){calls.push('read-wait');return wait().then(()=>({value:'LATE-PRIVATE'}));}
                        if (mode === 'read-failure')
                            return Promise.reject(Error('VALUE-CANARY'));
                        return Promise.resolve({ value: 'FRESH-PRIVATE' });
                    }
                    return Promise.resolve({ assertionPassed: true });
                }, withhold() { return Promise.resolve(); }, dispose() { return Promise.resolve(); } };
        } } as unknown as BrowserHandle;
    attachChildRuntime({ channel: { onMessage(fn) { receive = fn; }, send(m) { messages.push(m); }, exit() { exited = true; } }, browsers: { launch() { opened++; if(mode==='launch-wait')return wait().then(()=>handle); return Promise.resolve(handle); } }, observedBuild: currentBuild, observedAccounts: new Map([['fixture', provider]]), originSource: { monotonicNow: () => mono, wallNow: () => new Date(now) }, sleep() { return Promise.resolve(); }, inspectRecording() { return Promise.resolve({ attempted: true, path: '/tmp/controlled.webm', bytes: null, header: true, error: null, orderlyClose: true }); } });
    return { extraPage:()=>{extraPage();},send: (value: unknown) => { receive(value); }, launch, execute: wireFixture.execute as unknown as Execute2, messages, calls, release: () => { release(); }, done: () => exited, opened: () => opened, closed: () => closed, applied: () => applied };
}
describe('actual observed child ownership and recording clock', () => {
    it('keeps the pre-apply clock, source-free successful steps and unknown recording byte count', async () => { const h = childHarness(); h.send(h.launch); await spin(() => h.messages.some(m => m.kind === 'ready')); const ready = h.messages.find(m => m.kind === 'ready'); expect(ready).toMatchObject({ startedAtMs: 0 }); h.send(h.execute); await spin(h.done); const starts = h.messages.filter(m => m.kind === 'step-started'); expect(starts[0]).toMatchObject({ startedAtMs: 350 }); expect(h.messages.at(-1)).toMatchObject({ kind: 'result', ok: true, recording: { bytes: null } }); expect(h.opened()).toBe(1); expect(h.closed()).toBe(1); expect(JSON.stringify(h.messages)).not.toContain('FRESH-PRIVATE'); });
    it.each(['prepare-wait', 'apply-wait'] as const)('common stop during %s prevents late revival', async (mode) => { const h = childHarness(mode); h.send(h.launch); await spin(() => h.calls.includes(mode === 'prepare-wait' ? 'prepare' : 'apply')); h.send({ kind: 'stop' }); await spin(h.done); h.release(); await new Promise<void>(r => setImmediate(r)); expect(h.messages.filter(m => m.kind === 'ready')).toEqual([]); expect(h.opened()).toBe(mode === 'prepare-wait' ? 0 : 1); expect(h.messages.at(-1)).toMatchObject({ kind: 'result', ok: false, errorCode: 'CANCELLED' }); });
    it('failed producer yields FAIL then null-timed SKIPPED, never a successful consumer', async () => { const h = childHarness('read-failure'); h.send(h.launch); await spin(() => h.messages.some(m => m.kind === 'ready')); h.send(h.execute); await spin(h.done); const steps = h.messages.filter(m => m.kind === 'step-finished'); expect(steps.map(m => m.status)).toEqual(['PASS', 'FAIL', 'SKIPPED']); expect(steps[2]).toMatchObject({ startedAtMs: null, finishedAtMs: null, durationMs: null }); expect(JSON.stringify(h.messages)).not.toContain('VALUE-CANARY'); });
    it('unknown apply failure closes the one context and never emits ready', async () => { const h = childHarness('apply-failure'); h.send(h.launch); await spin(h.done); expect(h.applied()).toBe(1); expect(h.closed()).toBe(1); expect(h.messages.at(-1)).toMatchObject({ errorCode: 'ACCOUNT_UNKNOWN' }); expect(h.messages.some(m => m.kind === 'ready')).toBe(false); expect(JSON.stringify(h.messages)).not.toContain('ACCOUNT-PRIVATE'); });
    it('changed execute configuration fails before invoking any primitive', async () => { const h = childHarness(); h.send(h.launch); await spin(() => h.messages.some(m => m.kind === 'ready')); h.send({ ...h.execute, waitStrategy: 'networkidle' }); await spin(h.done); expect(h.messages.at(-1)).toMatchObject({ ok: false, errorCode: 'INVALID_CONTRACT' }); expect(h.messages.filter(m => m.kind === 'step-started')).toEqual([]); });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
it('does not dispose the same opaque capability twice on a late prepare acknowledgement', async () => {
    const h = setup(), w = wire();
    let release: (value: {
        capability: object;
    }) => void = () => undefined, entered = false;
    const token = { capability: {} };
    h.provider.consume = () => Promise.resolve(token);
    h.provider.prepare = () => { entered = true; return new Promise(resolve => { release = resolve; }); };
    const pending = h.lifecycle.prepare(w.handle, w.receipt);
    await spin(() => entered);
    h.abort.abort();
    await h.lifecycle.dispose();
    release(token);
    await expect(pending).rejects.toThrow('CANCELLED');
    expect(h.calls).toEqual(['dispose']);
});

describe('observed child late acquisition and finalization guards',()=>{
  it('stops a held read, emits one failed active step and skips consumers before late capture',async()=>{
    const h=childHarness('read-wait');h.send(h.launch);await spin(()=>h.messages.some(m=>m.kind==='ready'));h.send(h.execute);await spin(()=>h.calls.includes('read-wait'));h.extraPage();await spin(h.done);const before=JSON.stringify(h.messages);h.release();await new Promise<void>(resolve=>setImmediate(resolve));expect(JSON.stringify(h.messages)).toBe(before);expect(h.messages.at(-1)).toMatchObject({errorCode:'TARGET_DRIFT'});expect(h.messages.filter(m=>m.kind==='step-finished').map(m=>m.status)).toEqual(['PASS','FAIL','SKIPPED']);expect(before).not.toContain('LATE-PRIVATE');expect(h.closed()).toBe(1);h.send(h.execute);h.extraPage();await new Promise<void>(resolve=>setImmediate(resolve));expect(JSON.stringify(h.messages)).toBe(before);
  });
  it('disposes a browser arriving after stop without assigning it execution rights',async()=>{
    const h=childHarness('launch-wait');h.send(h.launch);await spin(()=>h.opened()===1);h.send({kind:'stop'});await spin(h.done);h.release();await new Promise<void>(resolve=>setImmediate(resolve));expect(h.closed()).toBe(1);expect(h.applied()).toBe(0);expect(h.messages.some(m=>m.kind==='ready')).toBe(false);expect(h.messages.at(-1)).toMatchObject({errorCode:'CANCELLED',recording:{path:null,bytes:null}});
  });
  it('uses fixed invalid-contract stop and disposal after failed media close',async()=>{
    const h=childHarness('close-failure');h.send(h.launch);await spin(()=>h.messages.some(m=>m.kind==='ready'));h.send({kind:'stop',private:'PRIVATE'});await spin(h.done);expect(h.closed()).toBe(2);expect(h.calls.filter(c=>c==='dispose')).toHaveLength(1);expect(h.messages.at(-1)).toMatchObject({errorCode:'INVALID_CONTRACT'});expect(JSON.stringify(h.messages)).not.toContain('PRIVATE');
  });
});
