import { FIXTURE_ORIGIN, TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {stepOp,stepReceipt} from '../helpers/stepCode.js';
import {stepHashOf} from '../../src/executor/observedReplay.js';
import { describe, it, expect } from 'vitest';
import wireJson from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import type {PublicationDocument} from '../helpers/publicationFixture.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const wire=wireJson as unknown as PublicationDocument;
import { validateObserved, OBSERVED_LIMITS } from '../../src/validator/observedReferencePolicy.js';
import { validateObservedExecute } from '../../src/executor/observedReplay.js';
describe('source-free observed IPC family', () => {
    // STUDIO-OBS-012A AC-3: the artifact-1 parsers this case also refused the frames in are deleted.
    it('accepts composed closed launch/execute frames', () => { expect(validateObserved('replay-ipc#/definitions/Launch3', wire.launch, OBSERVED_LIMITS.launch)).toEqual(wire.launch); expect(validateObservedExecute(wire.execute, wire.job.binding.scope, TEST_DOMAINS)).toEqual(wire.execute); });
    it.each(['artifact', 'source', 'originalText', 'code', 'callbackUrl', 'module', 'contextId', 'nodeId', 'ownerFence', 'valueStore'])('rejects %s in Execute3', key => { expect(() => validateObservedExecute({ ...wire.execute, [key]: 'PRIVATE' }, wire.job.binding.scope, TEST_DOMAINS)).toThrow(); });
    it('keeps historical receipt/recipe provenance out of child bindings/inputs', () => {
        const text = JSON.stringify(wire.execute);
        for (const name of ['admissionId', 'producerAdmissionId', 'sourceSpan', 'referenceName', 'sourceRevision', 'nodeId']) expect(text).not.toContain('"' + name + '"');
    });
    it('applies whole-frame byte bounds and depth before traversal', () => {
        expect(() => validateObserved('replay-ipc#/definitions/Launch3', { ...wire.launch, scratchPath: 'a'.repeat(OBSERVED_LIMITS.launch) }, OBSERVED_LIMITS.launch)).toThrow();
        let nested: unknown = {};
        for (let i = 0; i < 34; i++)
            nested = [nested];
        expect(() => validateObserved('replay-ipc', { kind: 'execute', nested }, OBSERVED_LIMITS.execute)).toThrow();
    });
    it('requires null unavailable bytes and permits genuine fractional measured time', () => { const base = { protocolVersion: 3, mode: 'observed', runId: wire.execute.runId, attemptId: wire.execute.attemptId }; expect(validateObserved('replay-ipc#/definitions/StepFinished3', { ...base, kind: 'step-finished', stepIndex: 0, stepId: required(wire.execute.steps[0]).stepId, status: 'PASS', startedAtMs: 0.25, finishedAtMs: 3.75, durationMs: 3.5, receipt: stepReceipt({ stepHash: 'a'.repeat(64), fenceCrossed: true }) })).toBeDefined(); expect(() => validateObserved('replay-ipc#/definitions/StepFinished3', { ...base, kind: 'step-finished', stepIndex: 0, stepId: required(wire.execute.steps[0]).stepId, status: 'PASSED', startedAtMs: 0, finishedAtMs: 1, durationMs: 1, receipt: stepReceipt({ stepHash: 'a'.repeat(64), fenceCrossed: true }) })).toThrow(); });
});
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import type { ChildProcessHandle, ChildSpawner } from '../../src/run/launcher.js';
import type { ParentMessage, ObservedParentMessage } from '../../src/run/protocol.js';
import type { AdmissionReceipt, Launch3 } from '../../src/executor/observedOperations.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
function virtualChild(mode: 'pass' | 'wrong-build' | 'wrong-attempt' | 'unsafe-result' | 'duplicate-step' | 'missing-step' | 'lost-result' | 'pre-ready-result' | 'outside-recording'|'sparse-final'|'contradictory-final'|'lost-after-pass'|'started-secret-lost'|'ipc-backpressure-loss' = 'pass', recordingPath: string | null = null) {
    let onMessage: (v: unknown) => void = () => undefined, onExit: () => void = () => undefined, onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void = () => undefined;
    let launch: Launch3 | null = null, kills = 0,possibleEffects=0;
    const sent: (ParentMessage | ObservedParentMessage)[] = [];
    const child: ChildProcessHandle = { pid: 123, onMessage(fn) { onMessage = fn; }, onExit(fn) { onExit = () => { fn(0, null); }; }, onOutput(fn) { onOutput = fn; }, kill() { kills++; onExit(); }, send(message) {
            // The port takes any message (the guided child's frames use the same handle); this child only ever receives the replay protocol's.
            const m = message as ParentMessage | ObservedParentMessage;
            sent.push(m);
            if (m.kind === 'stop') {
                if(mode==='ipc-backpressure-loss')return;
                onExit();
                return;
            }
            if (m.kind === 'launch' && 'mode' in m) {
                launch = m;
                if (mode === 'pre-ready-result' || mode === 'outside-recording') {
                    onMessage({ kind: 'result', protocolVersion: 3, mode: 'observed', runId: m.runId, attemptId: m.attemptId, admissionId: m.admission.admissionId, profileHash: hashObserved(m.profile), build: m.build, ok: false, errorCode: 'POLICY_REFUSED', secretUse: {}, recording: { path: mode === 'outside-recording' ? '/etc/passwd' : recordingPath, bytes: null, errorCode: null, state: 'PENDING', partial: true } });
                    return;
                }
                onOutput('stdout', 'UNKNOWN-ACCOUNT-CANARY');
                onMessage({ kind: 'ready', protocolVersion: 3, mode: 'observed', runId: m.runId, attemptId: mode === 'wrong-attempt' ? '00000000-0000-4000-8000-000000009999' : m.attemptId, profileHash: hashObserved(m.profile), build: mode === 'wrong-build' ? { ...m.build, chromiumBuild: 'other' } : m.build, admissionId: m.admission.admissionId, browserStartedAt: new Date().toISOString(), startedAtMs: 0, calibrationOffsetMs: 0 });
            }
            if (m.kind === 'execute' && 'mode' in m) {
                const e = m, l = required(launch);
                const base = { protocolVersion: 3, mode: 'observed', runId: e.runId, attemptId: e.attemptId };
                // The void send port cannot certify delivery/drain. Simulate a child effect
                // with all started/final receipts lost and an unresponsive stop, then tree kill.
                if(mode==='ipc-backpressure-loss'){possibleEffects++;return;}
                if (mode === 'lost-result')
                    return;
                for (const step of e.steps) {
                    if (mode === 'missing-step')
                        break;
                    const started = { ...base, kind: 'step-started', stepIndex: step.stepIndex, stepId: step.stepId, startedAtMs: step.stepIndex };
                    onMessage(started);
                    if(mode==='started-secret-lost'&&step.stepIndex===1)return;
                    if (mode === 'duplicate-step')
                        onMessage(started);
                    onMessage({ ...base, kind: 'step-finished', stepIndex: step.stepIndex, stepId: step.stepId, status: 'PASS', startedAtMs: step.stepIndex, finishedAtMs: step.stepIndex + 0.5, durationMs: 0.5, receipt: stepReceipt({ stepHash: stepHashOf(step.operations), fenceCrossed: true, effects: [{ method: 'click', completed: true }] }) });
                }
                if(mode==='lost-after-pass')return;
                onMessage({ ...base, kind: 'result', admissionId: l.admission.admissionId, profileHash: hashObserved(l.profile), build: l.build, ok: true, errorCode: null, secretUse: mode==='contradictory-final'?{PASS:'REFUSED'}:{}, recording: { path: null, bytes: null, errorCode: null, state: 'UNAVAILABLE', partial: false }, ...(mode === 'unsafe-result' ? { privateValue: 'CANARY' } : {}) });
            }
        } };
    const spawner: ChildSpawner = { spawn(request) { expect(request.args).toEqual([]); expect(JSON.stringify(request.env)).not.toContain('controlled-fixture'); return child; } };
    return { spawner, sent, kills: () => kills,possibleEffects:()=>possibleEffects };
}
describe('actual observed launcher protocol enforcement', () => {
    it.each(['sparse-final','contradictory-final','lost-after-pass','started-secret-lost','lost-result','ipc-backpressure-loss'] as const)('preserves authenticated frozen secret evidence on %s',async mode=>{
      const dir=await mkdtemp(join(tmpdir(),'secret-receipt-launcher-'));const child=virtualChild(mode),job=structuredClone(wire.job);
      const step=job.artifact.steps[1];if(!step)throw new Error('STEP');
      (step.operations[0] as {operation:unknown}).operation=stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);',{uses:[{kind:'secret',id:'PASS'}]});
      const last=job.artifact.steps[2],literal=last?.operations[1],literalGuard=job.artifact.guards[3];if(!last||!literal||!literalGuard)throw new Error('LITERAL');
      (last as {operations:unknown}).operations=[{...literal,coordinate:{stepId:last.stepId,ordinal:0},guardId:'g2'}];
      (job.artifact as {guards:unknown}).guards=[job.artifact.guards[0],job.artifact.guards[1],{...literalGuard,guardId:'g2'}];
      (job.artifact.replayPolicy as {bindings:unknown;transfers:unknown}).bindings=[];(job.artifact.replayPolicy as {transfers:unknown}).transfers=[];
      (job.artifact.inputRecipes as unknown[]).push({inputId:'pass',stepId:step.stepId,kind:'secretRef',provenance:{kind:'configuration',referenceId:'pass-ref',referenceName:'PASS'}});
      (job as {secrets:unknown}).secrets={PASS:'receipt-canary',UNREACHED:'no-effect'};(job as {secretOrigins:unknown}).secretOrigins={PASS:[FIXTURE_ORIGIN]};
      const admission={...wire.admissionReceipt,startDeadlineAt:new Date(Date.now()+10000).toISOString(),runDeadlineAt:new Date(Date.now()+20000).toISOString()} as AdmissionReceipt;
      const launcher=createChildBrowserLauncher({recording:{width:640,height:480},stepTimeoutMs:10000,launchTimeoutMs:100,maxFailureMessageLength:400,seekOriginCalibrationMs:0, allowedDomains: TEST_DOMAINS,stopTimeoutMs:20,spawner:child.spawner});
      try{const session=await launcher.launch({browser:'chromium',viewport:job.configuration.viewport,totalRuntimeMs:30,stepTimeoutMs:10000,scratchPath:dir,observed:{job,admission}});const result=await required(session.run).execute({reporter:{stepStarted(){return;},stepFinished(){return;}}});
        expect(result.secretUse).toEqual(mode==='started-secret-lost'||mode==='lost-result'||mode==='ipc-backpressure-loss'?{UNREACHED:'NOT_USED'}:{PASS:'USED',UNREACHED:'NOT_USED'});
        if(mode==='ipc-backpressure-loss'){expect(child.possibleEffects()).toBe(1);expect(child.kills()).toBeGreaterThan(0);expect(result.secretUse).not.toHaveProperty('PASS');}
        expect(result.ok).toBe(mode==='sparse-final');if(mode==='contradictory-final')expect(result.failureMessage).toBe('INVALID_CONTRACT');await session.close();
      }finally{await rm(dir,{recursive:true,force:true});}
    });
    it.each(['pass', 'wrong-build', 'wrong-attempt', 'unsafe-result', 'duplicate-step', 'missing-step', 'lost-result', 'pre-ready-result', 'outside-recording'] as const)('handles %s without fallback or raw diagnostics', async (mode) => {
        const dir = await mkdtemp(join(tmpdir(), 'observed-launcher-'));
        const path = join(dir, 'recording.webm');
        await writeFile(path, Buffer.from([26, 69, 223, 163, 0, 0, 0, 0]));
        const child = virtualChild(mode, path);
        const admission = { ...wire.admissionReceipt, startDeadlineAt: new Date(Date.now() + 10000).toISOString(), runDeadlineAt: new Date(Date.now() + 20000).toISOString() } as AdmissionReceipt;
        let logs = 0;
        const launcher = createChildBrowserLauncher({ recording: { width: 640, height: 480 }, stepTimeoutMs: 10000, launchTimeoutMs: 100, maxFailureMessageLength: 400, seekOriginCalibrationMs: 0, allowedDomains: TEST_DOMAINS, stopTimeoutMs: 20, spawner: child.spawner });
        try {
            const promise = launcher.launch({ browser: 'chromium', viewport: wire.job.configuration.viewport, totalRuntimeMs: 30, stepTimeoutMs: 10000, scratchPath: dir, observed: { job: wire.job, admission}, diagnostics: { redact: t => t, write() { logs++; } } });
            if (mode === 'pre-ready-result' || mode === 'outside-recording') {
                // The approved sequential startup never admits pre-Ready video as app evidence.
                // Keep both owned-path and outside-path negative cases; neither may fall back.
                await expect(promise).rejects.toMatchObject({ code: 'POLICY_REFUSED', recording: {path:null,state:'UNAVAILABLE',partial:false} });
            }
            else if (mode === 'wrong-build' || mode === 'wrong-attempt') {
                await expect(promise).rejects.toThrow();
                expect(child.kills()).toBeGreaterThan(0);
            }
            else {
                const session = await promise;
                const finished: unknown[] = [];
                const result = await required(session.run).execute({ reporter: { stepStarted() { return; }, stepFinished(e) { finished.push(e); } } });
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

it('supports an empty learned binding graph without importing historical value rights',()=>{
  const step=wire.execute.steps[0],guard=wire.execute.guards[0],input=wire.execute.inputs[0];if(!step||!guard||!input)throw Error('fixture');
  const frame={...wire.execute,steps:[step],guards:[guard],inputs:[input],bindings:[],transfers:[]};
  expect(validateObservedExecute(frame,wire.job.binding.scope, TEST_DOMAINS)).toEqual(frame);
  expect(()=>validateObservedExecute({...frame,availability:[{bindingId:'old',contextId:'historic'}]},wire.job.binding.scope,TEST_DOMAINS)).toThrow();
});

// STUDIO-OBS-012A AC-3: one family remains; the artifact-1 parser half of this case is deleted.
it.each([null,[],"observed",2])('refuses non-object launch frames: %j',value=>{
  expect(()=>validateObserved('replay-ipc#/definitions/Launch3',value,OBSERVED_LIMITS.launch)).toThrow();
});
