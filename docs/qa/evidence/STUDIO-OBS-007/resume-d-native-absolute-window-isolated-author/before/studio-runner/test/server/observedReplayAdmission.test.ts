import { describe, it, expect } from 'vitest';
import fixture from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import { createApplication } from '../../src/server/application.js';
import { loadConfig } from '../../src/server/config.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import type { TrustedPolicy } from '../../src/executor/observedOperations.js';
import { createFakeScratchStore } from '../helpers/runner.js';
import type { HttpOutcome } from '../../src/reporting/httpClient.js';
import {hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '../../src/validator/observedReferencePolicy.js';
const currentBuild={...fixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
function job() {
    const j = structuredClone(fixture.job), now = Date.now();
    // New test authority for this exact bundle; the persisted historical fixture is untouched.
    j.binding.requiredBuild={...currentBuild};j.binding.replayGrant.buildHash=hashObserved(currentBuild);
    for (const a of [j.binding.replayGrant]) {
        a.issuedAt = new Date(now - 100).toISOString();
        a.expiresAt = new Date(now + 25000).toISOString();
    }
    return j;
}
describe('observed admission sends once and never confuses receipt with authority', () => {
    it.each(['timeout', 'redirect', 'oversize', 'wrong-receipt', 'malformed'])('stops before scratch/browser on %s', async (mode) => {
        let sends = 0, launches = 0;
        const scratch = createFakeScratchStore();
        const config = loadConfig({ STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test' });
        const app = createApplication(config, { runtimeVersions: {}, scratch, launcher: { launch() { launches++; return Promise.reject(Error('unexpected')); } }, http: { send(request): Promise<HttpOutcome> {
                    sends++;
                    expect(request.maxResponseBytes).toBe(65536);
                    if (mode === 'timeout')
                        return Promise.resolve({ kind: 'timeout' });
                    if (mode === 'redirect')
                        return Promise.resolve({ kind: 'response', status: 307, body: '' });
                    if (mode === 'oversize')
                        return Promise.resolve({ kind: 'response', status: 200, body: 'x'.repeat(65537) });
                    if (mode === 'malformed')
                        return Promise.resolve({ kind: 'response', status: 200, body: '{"a":1,"a":2}' });
                    return Promise.resolve({ kind: 'response', status: 200, body: JSON.stringify(fixture.admissionReceipt) });
                } }, observed: { build: currentBuild, policies: [fixture.trustedPolicy as TrustedPolicy],  validationEnabled: true, replayEnabled: true }, logSink: createRecordingLogSink() });
        const result = await required(app.coordinator.submitObserved?.bind(app.coordinator))(job());
        expect(result).toEqual({ status: 503, code: 'ADMISSION_NOT_ACKNOWLEDGED' });
        expect(sends).toBe(1);
        expect(launches).toBe(0);
        expect(await scratch.list()).toEqual([]);
    });
    it('disabled replay refuses locally and enabled replay reaches ordinary admission without an account provider', async () => {
        for (const enabled of [false, true]) {
            let sends = 0;
            const app = createApplication(loadConfig({ STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test' }), { runtimeVersions: {}, scratch: createFakeScratchStore(), launcher: { launch() { return Promise.reject(Error('no browser')); } }, http: { send() { sends++; return Promise.resolve({ kind: 'timeout' }); } }, observed: { build: currentBuild, policies: [fixture.trustedPolicy as TrustedPolicy],  validationEnabled: true, replayEnabled: enabled }, logSink: createRecordingLogSink() });
            expect((await required(app.coordinator.submitObserved?.bind(app.coordinator))(job())).code).toBe(enabled ? 'ADMISSION_NOT_ACKNOWLEDGED' : 'OBSERVED_REPLAY_DISABLED');
            expect(sends).toBe(enabled ? 1 : 0);
            expect(app.pool.inUse).toBe(0);
        }
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

import {ObservedPreReadyFailure} from '../../src/run/errors.js';
it('delivers pre-Ready FINAL from ADMITTED without an invalid PROGRESS transition',async()=>{
    const scratch=createFakeScratchStore(),logs=createRecordingLogSink();
    const received:string[]=[];let state:'NEW'|'ADMITTED'|'RUNNING'|'FINAL'='NEW',admissions=0,launches=0;
    let final:Record<string,unknown>|null=null;
    const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test'}),{
        runtimeVersions:{},scratch,logSink:logs,
        launcher:{launch(){launches++;return Promise.reject(new ObservedPreReadyFailure('ACCOUNT_UNKNOWN',{path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false}));}},
        observed:{build:currentBuild,policies:[fixture.trustedPolicy as TrustedPolicy],validationEnabled:true,replayEnabled:true},
        http:{send(request):Promise<HttpOutcome>{
            if(request.method==='GET')return Promise.resolve({kind:'response',status:200,body:'{"cancelRequested":false}'});
            const body=JSON.parse(request.body) as Record<string,unknown>;
            if(request.url.endsWith('/observed-admission')){
                admissions++;state='ADMITTED';const now=Date.now();
                return Promise.resolve({kind:'response',status:200,body:JSON.stringify({schemaVersion:3,kind:'observed',admissionId:body.admissionId,request:body,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+30000).toISOString(),runDeadlineAt:new Date(now+60000).toISOString()})});
            }
            const kind=String(body.kind);received.push(kind);
            if(kind==='STARTED'&&state==='ADMITTED')state='RUNNING';
            else if(kind==='PROGRESS'&&state==='RUNNING'){ /* permitted running progress */ }
            else if(kind==='FINAL'&&(state==='ADMITTED'||state==='RUNNING')){state='FINAL';final=body;}
            else return Promise.resolve({kind:'response',status:409,body:'{"code":"OWNERSHIP_LOST"}'});
            return Promise.resolve({kind:'response',status:200,body:'{}'});
        }},
    });
    expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(job())).toEqual({status:202,code:'ADMITTED'});
    expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
    expect(received).toEqual(['FINAL']);expect(admissions).toBe(1);expect(launches).toBe(1);
    expect(final).toMatchObject({browserStartedAt:null,outcome:{result:'ERROR',errorMessage:'ACCOUNT_UNKNOWN'},evidence:{state:'UNAVAILABLE',partial:false}});
    const steps=required(final as Record<string,unknown>|null).steps as Record<string,unknown>[];
    expect(steps).toHaveLength(3);for(const step of steps)expect(step).toMatchObject({status:'SKIPPED',startedAtMs:null,finishedAtMs:null,durationMs:null,failure:null});
    expect(logs.lines.join('\n')).not.toContain('ownership_lost');expect(await scratch.list()).toEqual([]);
});
