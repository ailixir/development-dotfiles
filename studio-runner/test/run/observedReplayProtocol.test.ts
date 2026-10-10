import {ObservedInvocationControl,ReplayAcquisitionBudget} from '../../src/executor/observedReplay.js';
import { describe, it, expect } from 'vitest';
import wire from '../../../docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json' with { type: 'json' };
import { validateObserved, OBSERVED_LIMITS } from '../../src/validator/observedReferencePolicy.js';
import { validateObservedExecute } from '../../src/executor/observedReplay.js';
import type { Scope } from '../../src/executor/observedOperations.js';
import { parseExecuteMessage, parseLaunchMessage } from '../../src/run/protocol.js';
describe('source-free observed IPC family', () => {
    it('accepts composed closed launch/execute and rejects them in unchanged legacy parsers', () => { expect(validateObserved('replay-ipc#/definitions/Launch2', wire.launch, OBSERVED_LIMITS.launch)).toEqual(wire.launch); expect(validateObservedExecute(wire.execute, wire.job.binding.scope as Scope)).toEqual(wire.execute); expect(parseLaunchMessage(wire.launch).ok).toBe(false); expect(parseExecuteMessage(wire.execute).ok).toBe(false); });
    it.each(['artifact', 'source', 'originalText', 'code', 'callbackUrl', 'module', 'contextId', 'nodeId', 'ownerFence', 'valueStore'])('rejects %s in Execute2', key => { expect(() => validateObservedExecute({ ...wire.execute, [key]: 'PRIVATE' }, wire.job.binding.scope as Scope)).toThrow(); });
    it('keeps historical receipt/recipe provenance out of child bindings/inputs', () => {
        const text = JSON.stringify(wire.execute);
        for (const name of ['admissionId', 'producerAdmissionId', 'sourceSpan', 'referenceName', 'sourceRevision', 'nodeId'])
            expect(text).not.toContain('"' + name + '"');
    });
    it('applies whole-frame byte bounds and depth before traversal', () => {
        expect(() => validateObserved('replay-ipc#/definitions/Launch2', { ...wire.launch, scratchPath: 'a'.repeat(OBSERVED_LIMITS.launch) }, OBSERVED_LIMITS.launch)).toThrow();
        let nested: unknown = {};
        for (let i = 0; i < 34; i++)
            nested = [nested];
        expect(() => validateObserved('replay-ipc', { kind: 'execute', nested }, OBSERVED_LIMITS.execute)).toThrow();
    });
    it('requires null unavailable bytes and permits genuine fractional measured time', () => { const base = { protocolVersion: 2, mode: 'observed', runId: wire.execute.runId, attemptId: wire.execute.attemptId }; expect(validateObserved('replay-ipc#/definitions/StepFinished2', { ...base, kind: 'step-finished', stepIndex: 0, stepId: required(wire.execute.steps[0]).stepId, status: 'PASS', startedAtMs: 0.25, finishedAtMs: 3.75, durationMs: 3.5, errorCode: null })).toBeDefined(); expect(() => validateObserved('replay-ipc#/definitions/StepFinished2', { ...base, kind: 'step-finished', stepIndex: 0, stepId: required(wire.execute.steps[0]).stepId, status: 'PASSED', startedAtMs: 0, finishedAtMs: 1, durationMs: 1, errorCode: null })).toThrow(); });
});
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import type { ChildProcessHandle, ChildSpawner } from '../../src/run/launcher.js';
import type { ParentMessage, ObservedParentMessage } from '../../src/run/protocol.js';
import type { ObservedJob, AdmissionReceipt, TrustedPolicy, Launch2 } from '../../src/executor/observedOperations.js';
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
function virtualChild(mode: 'pass' | 'wrong-build' | 'wrong-attempt' | 'unsafe-result' | 'duplicate-step' | 'missing-step' | 'lost-result' | 'pre-ready-result' | 'outside-recording' = 'pass', recordingPath: string | null = null) {
    let onMessage: (v: unknown) => void = () => undefined, onExit: () => void = () => undefined, onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void = () => undefined;
    let launch: Launch2 | null = null, kills = 0;
    const sent: (ParentMessage | ObservedParentMessage)[] = [];
    const child: ChildProcessHandle = { pid: 123, onMessage(fn) { onMessage = fn; }, onExit(fn) { onExit = () => { fn(0, null); }; }, onOutput(fn) { onOutput = fn; }, kill() { kills++; onExit(); }, send(m) {
            sent.push(m);
            if (m.kind === 'stop') {
                onExit();
                return;
            }
            if (m.kind === 'launch' && 'mode' in m) {
                launch = m;
                if (mode === 'pre-ready-result' || mode === 'outside-recording') {
                    onMessage({ kind: 'result', protocolVersion: 2, mode: 'observed', runId: m.runId, attemptId: m.attemptId, admissionId: m.admission.admissionId, profileHash: hashObserved(m.profile), build: m.build, ok: false, errorCode: 'ACCOUNT_UNKNOWN', recording: { path: mode === 'outside-recording' ? '/etc/passwd' : recordingPath, bytes: null, errorCode: null, state: 'PENDING', partial: true } });
                    return;
                }
                onOutput('stdout', 'UNKNOWN-ACCOUNT-CANARY');
                onMessage({ kind: 'ready', protocolVersion: 2, mode: 'observed', runId: m.runId, attemptId: mode === 'wrong-attempt' ? '00000000-0000-4000-8000-000000009999' : m.attemptId, profileHash: hashObserved(m.profile), build: mode === 'wrong-build' ? { ...m.build, chromiumBuild: 'other' } : m.build, admissionId: m.admission.admissionId, browserStartedAt: new Date().toISOString(), startedAtMs: 0, calibrationOffsetMs: 0 });
            }
            if (m.kind === 'execute' && 'mode' in m) {
                const e = m, l = required(launch);
                const base = { protocolVersion: 2, mode: 'observed', runId: e.runId, attemptId: e.attemptId };
                if (mode === 'lost-result')
                    return;
                for (const step of e.steps) {
                    if (mode === 'missing-step')
                        break;
                    const started = { ...base, kind: 'step-started', stepIndex: step.stepIndex, stepId: step.stepId, startedAtMs: step.stepIndex };
                    onMessage(started);
                    if (mode === 'duplicate-step')
                        onMessage(started);
                    onMessage({ ...base, kind: 'step-finished', stepIndex: step.stepIndex, stepId: step.stepId, status: 'PASS', startedAtMs: step.stepIndex, finishedAtMs: step.stepIndex + 0.5, durationMs: 0.5, errorCode: null });
                }
                onMessage({ ...base, kind: 'result', admissionId: l.admission.admissionId, profileHash: hashObserved(l.profile), build: l.build, ok: true, errorCode: null, recording: { path: null, bytes: null, errorCode: null, state: 'UNAVAILABLE', partial: false }, ...(mode === 'unsafe-result' ? { privateValue: 'CANARY' } : {}) });
            }
        } };
    const spawner: ChildSpawner = { spawn(request) { expect(request.args).toEqual([]); expect(JSON.stringify(request.env)).not.toContain('controlled-fixture'); return child; } };
    return { spawner, sent, kills: () => kills };
}
describe('actual observed launcher protocol enforcement', () => {
    it.each(['pass', 'wrong-build', 'wrong-attempt', 'unsafe-result', 'duplicate-step', 'missing-step', 'lost-result', 'pre-ready-result', 'outside-recording'] as const)('handles %s without fallback or raw diagnostics', async (mode) => {
        const dir = await mkdtemp(join(tmpdir(), 'observed-launcher-'));
        const path = join(dir, 'recording.webm');
        await writeFile(path, Buffer.from([26, 69, 223, 163, 0, 0, 0, 0]));
        const child = virtualChild(mode, path);
        const admission = { ...wire.admissionReceipt, startDeadlineAt: new Date(Date.now() + 10000).toISOString(), runDeadlineAt: new Date(Date.now() + 20000).toISOString() } as AdmissionReceipt;
        let logs = 0;
        const launcher = createChildBrowserLauncher({ recording: { width: 640, height: 480 }, stepTimeoutMs: 10000, launchTimeoutMs: 100, maxFailureMessageLength: 400, seekOriginCalibrationMs: 0, stopTimeoutMs: 20, spawner: child.spawner });
        try {
            const promise = launcher.launch({ browser: 'chromium', viewport: wire.job.configuration.viewport, totalRuntimeMs: 30, stepTimeoutMs: 10000, scratchPath: dir, observed: { job: wire.job as ObservedJob, admission, policy: wire.trustedPolicy as TrustedPolicy }, diagnostics: { redact: t => t, write() { logs++; } } });
            if (mode === 'pre-ready-result' || mode === 'outside-recording') {
                await expect(promise).rejects.toMatchObject({ code: 'ACCOUNT_UNKNOWN', recording: { path: mode === 'outside-recording' ? null : await realpath(path), state: mode === 'outside-recording' ? 'FAILED' : 'PENDING' } });
            }
            else if (mode === 'wrong-build' || mode === 'wrong-attempt') {
                await expect(promise).rejects.toThrow();
                expect(child.kills()).toBeGreaterThan(0);
            }
            else {
                const session = await promise;
                const finished: unknown[] = [];
                const result = await required(session.run).execute({ steps: [], variables: {}, secrets: {}, reporter: { stepStarted() { return; }, stepFinished(e) { finished.push(e); } } });
                expect(result.ok).toBe(mode === 'pass');
                if (mode === 'pass') {
                    expect(finished).toHaveLength(3);
                    expect(result.recording.bytes).toBeNull();
                }
                await session.close();
            }
            expect(logs).toBe(0);
            expect(child.sent.filter(m => m.kind === 'launch')).toHaveLength(1);
            expect(child.sent.filter(m => m.kind === 'execute').length).toBeLessThanOrEqual(1);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

import {createObservedReplayAdapter} from '../../src/run/observedReplayAdapter.js';
import type {BrowserHandle} from '../../src/run/browserFactory.js';
import type {ObservationSession,Observation} from '../../src/run/observationTypes.js';
import type {ReplayAction,Guard} from '../../src/executor/observedOperations.js';
describe('observed page/blank authority refusal boundaries',()=>{
  it.each(['navigate','assert','stale-page','uncertain-navigation','blank-refusal','blank-unknown'] as const)('preserves %s semantics without element fallback',async mode=>{
    let calls=0;const origin=wire.job.binding.scope.allowedOrigins[0]??'';
    const scope={...wire.job.binding.scope,initialContext:mode.startsWith('blank')?{kind:'initialBlank'}:{kind:'observedDocument',origin}} as Scope;
    const observations:ObservationSession={acquire(){return Promise.resolve({kind:'REFUSED',code:'TARGET_DRIFT'});},observe(){return Promise.resolve({observation:{...wire.basis.observations[0]?.observation,schemaVersion:1} as Observation,json:'',bytes:0,observationHash:'a'.repeat(64)});},matches(){return Promise.resolve(false);},pageMatches(){return Promise.resolve(mode!=='stale-page');},navigate(){calls++;return mode==='uncertain-navigation'?Promise.reject(Error('PRIVATE')):Promise.resolve();},assertPage(){calls++;return Promise.resolve(true);},dispose(){return Promise.resolve();}};
    const handle={createObservationSession:()=>observations,observedBlankMatches:()=>Promise.resolve(mode!=='blank-refusal'),observedNavigateBlank(){calls++;return Promise.reject(Error('PRIVATE'));}} as unknown as BrowserHandle;
    const blank=mode.startsWith('blank');
    const adapter=createObservedReplayAdapter(handle,scope,wire.trustedPolicy as TrustedPolicy,'run',()=>undefined);
    const guard:Guard={guardId:'g0',origin:blank?null:origin,target:{kind:blank?'initialBlank':'page'}};
    const operation:ReplayAction['operation']=mode==='assert'?{kind:'assert',predicate:'url',expected:{kind:'authoredLiteral',sourceInputId:'url'}}:{kind:'navigate',destinationInputId:'url'};
    const action:ReplayAction={coordinate:{stepId:wire.execute.steps[0]?.stepId??'',ordinal:0},guardId:'g0',operation};
    const control=new ObservedInvocationControl({now:()=>performance.now()},performance.now()+1000,new AbortController().signal,new ReplayAcquisitionBudget(),{extra:0});
    const perform=()=>control.run(()=>adapter.perform(action,guard,origin+'/',control));
    try{if(mode==='navigate'||mode==='assert'){expect(await perform()).toEqual(mode==='assert'?{assertionPassed:true}:{});expect(calls).toBe(1);}else{await expect(perform()).rejects.toThrow(mode==='blank-refusal'||mode==='stale-page'?'TARGET_DRIFT':'OUTCOME_UNKNOWN');expect(calls).toBe(mode==='blank-refusal'||mode==='stale-page'?0:1);}}finally{await adapter.dispose();}
  });
});

it('supports an empty learned binding graph without importing historical value rights',()=>{
  const step=wire.execute.steps[0],guard=wire.execute.guards[0],input=wire.execute.inputs[0];if(!step||!guard||!input)throw Error('fixture');
  const frame={...wire.execute,steps:[step],guards:[guard],inputs:[input],bindings:[],transfers:[]};
  expect(validateObservedExecute(frame,wire.job.binding.scope as Scope)).toEqual(frame);
  expect(()=>validateObservedExecute({...frame,availability:[{bindingId:'old',contextId:'historic'}]},wire.job.binding.scope as Scope)).toThrow();
});

it.each([null,[],"observed",2])('refuses non-object launch frames in both explicit families: %j',value=>{
  expect(parseLaunchMessage(value)).toEqual({ok:false,problems:[{code:'CHILD_MESSAGE_NOT_OBJECT',field:'message'}]});
  expect(()=>validateObserved('replay-ipc#/definitions/Launch2',value,OBSERVED_LIMITS.launch)).toThrow();
});
