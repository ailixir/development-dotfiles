import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {writeRuntimeVersionsFile} from '../../scripts/write-runtime-versions.mjs';
import {loadObservedBuild} from '../../src/compat/runtime-versions.js';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import type { ObservedJob, TrustedPolicy, Scope, Artifact3 } from '../../src/executor/observedOperations.js';
import { hashObserved, OBSERVED_PROFILE, OBSERVED_SCHEMA_BUNDLE_HASH } from '../../src/validator/observedReferencePolicy.js';
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import { validateReplayArtifact } from '../../src/validator/observedReplay.js';
import { createApplication } from '../../src/server/application.js';
import { secureFetch, testListener } from '../helpers/guidedTls.js';
import { loadConfig } from '../../src/server/config.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import { untilMs } from './realRunner.js';
const uid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
describe('observed ordinary recorded child', () => {
    it.each(['fresh', 'async-confirmation', 'never-confirmation', 'application', 'control', 'no-grant', 'hidden', 'password', 'sensitive-descendant', 'duplicate', 'readonly'] as const)('uses actual recorded normal pipeline: %s', async (mode) => {
        const positive = mode === 'fresh' || mode === 'async-confirmation' || mode === 'application' || mode === 'control';
        const asynchronous=mode==='async-confirmation'||mode==='never-confirmation';
        const issuedValues:string[]=[],acquisitions:string[]=[],invocations:string[]=[];let heldReceipt:{response:ServerResponse;value:string}|null=null;
        const receipts: string[] = [], reports: Record<string, unknown>[] = [];
        let visits = 0, admissions = 0;
        const ownership = new Map<string, {state:'ADMITTED'|'RUNNING'|'FINAL'; attemptId:unknown; admissionId:unknown; runnerInstanceId:unknown}>();
        const rejectedReports: string[] = [];
        const server = createServer((req, res) => {
            if(req.url==='/acquisition'||req.url==='/invocation'){
                let text='';req.on('data',(b:Buffer)=>{text+=b.toString();});req.on('end',()=>{
                    if(req.url==='/acquisition'){acquisitions.push(text);if(text==='ABSENT'&&heldReceipt){const pending=heldReceipt;heldReceipt=null;pending.response.end(pending.value);}}
                    else invocations.push(text);
                    res.end('OK');
                });return;
            }

            if (req.url?.startsWith('/internal/')) {
                if (req.headers.authorization !== 'Bearer callback') {
                    res.writeHead(401);
                    res.end('{}');
                    return;
                }
                if (req.url.endsWith('/control')) {
                    res.end('{"cancelRequested":false}');
                    return;
                }
                let text = '';
                req.on('data', (b: Buffer) => text += b.toString());
                req.on('end', () => {
                    const body = JSON.parse(text) as Record<string, unknown>;
                    res.setHeader('content-type', 'application/json');
                    if (req.url?.endsWith('/observed-admission')) {
                        admissions++;
                        ownership.set(String(body.executionId),{state:'ADMITTED',attemptId:body.attemptId,admissionId:body.admissionId,runnerInstanceId:body.runnerInstanceId});
                        const now = Date.now();
                        res.end(JSON.stringify({ schemaVersion: 3, kind: 'observed', admissionId: body.admissionId, request: body, admittedAt: new Date(now).toISOString(), startDeadlineAt: new Date(now + 30000).toISOString(), runDeadlineAt: new Date(now + 60000).toISOString() }));
                    }
                    else {
                        const owner=ownership.get(String(body.executionId));
                        const identityMatches=owner&&owner.attemptId===body.attemptId&&owner.admissionId===body.admissionId&&owner.runnerInstanceId===body.runnerInstanceId;
                        const permitted=identityMatches&&(body.kind==='STARTED'?owner.state==='ADMITTED':body.kind==='PROGRESS'?owner.state==='RUNNING':body.kind==='FINAL'&&(owner.state==='ADMITTED'||owner.state==='RUNNING'));
                        if(!permitted){rejectedReports.push(String(body.kind));res.writeHead(409);res.end('{"code":"OWNERSHIP_LOST"}');return;}
                        if(body.kind==='STARTED')owner.state='RUNNING';
                        if(body.kind==='FINAL')owner.state='FINAL';
                        reports.push(body);
                        res.end('{}');
                    }
                });
                return;
            }
            if (req.url === '/receipt') {
                let text = '';
                req.on('data', (b: Buffer) => text += b.toString());
                req.on('end', () => { receipts.push(text);if(asynchronous)heldReceipt={response:res,value:text};else res.end('OK'); });
                return;
            }
            visits++;const issued=asynchronous?'private-'+randomUUID():`fresh-${String(visits)}-é`;issuedValues.push(issued);
            res.setHeader('content-type', 'text/html; charset=utf-8');
            let html = `<main aria-label="Operations"><output aria-label="Reference">${issued}</output><input aria-label="Destination"><input aria-label="Label"></main><script>document.querySelector('input').addEventListener('change',e=>fetch('/receipt',{method:'POST',body:e.target.value}));console.log('UNKNOWN-PAGE-CANARY');</script>`;
            if(asynchronous)html=html.replace("document.querySelector('input').addEventListener('change',e=>fetch('/receipt',{method:'POST',body:e.target.value}));", "document.querySelector('input').addEventListener('change',e=>{const value=e.target.value;e.target.remove();fetch('/receipt',{method:'POST',body:value}).then(r=>r.text()).then(confirmed=>setTimeout(()=>{"+(mode==='never-confirmation'?"return;":"const result=document.createElement('input');result.setAttribute('aria-label','Confirmation');result.value=confirmed;document.querySelector('main').append(result);")+"},0));});");
            if (mode === 'control')
                html = html.replace('<output aria-label="Reference">', '<textarea aria-label="Reference">').replace('</output>', '</textarea>');
            if (mode === 'hidden')
                html = html.replace('<output', '<output hidden');
            if (mode === 'password')
                html = html.replace('<output aria-label="Reference">', '<input type="password" aria-label="Reference" value="').replace('</output>', '">');
            if (mode === 'sensitive-descendant')
                html = html.replace('</output>', '<input type="password" value="private"></output>');
            if (mode === 'duplicate')
                html = html.replace('<input aria-label="Destination">', '<input aria-label="Destination"><input aria-label="Destination">');
            if (mode === 'readonly')
                html = html.replace('<input aria-label="Destination">', '<input aria-label="Destination" readonly>');
            res.end(html);
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        const address = server.address();
        if (!address || typeof address === 'string')
            throw Error('port');
        const origin = `http://127.0.0.1:${String(address.port)}`;
        const dir = await mkdtemp(join(tmpdir(), 'observed-replay-'));
        try {
            // Manual projection of the same five approved primitive operations onto this controlled app.
            const a = structuredClone(fixture.artifact) as unknown as Artifact3;
            const mutable = JSON.parse(JSON.stringify(a)) as typeof fixture.artifact;
            mutable.replayPolicy.scope.allowedOrigins = [origin];mutable.replayPolicy.scope.policyVersion='observed-4-full-chromium-1';
            mutable.learnedPlan.actions.forEach(x => {
                if (x.origin !== null)
                    x.origin = origin;
            });
            mutable.guards.forEach(g => {
                if (g.origin !== null)
                    g.origin = origin;
            });
            const names = ['Reference', 'Destination', 'Label', 'Destination'];
            mutable.guards.slice(1).forEach((g, i) => { g.target = { ...g.target, locator: { kind: 'role', role: i === 0 ? 'status' : 'textbox', name: names[i], exact: true }, role: i === 0 ? 'status' : 'textbox', elementType: i === 0 ? 'other' : 'input', controlType: i === 0 ? 'none' : 'text', classification: i === 0 ? 'permittedBusinessData' : 'nonsecretApproved', visible: true, actionable: i !== 0, readRuleId: i === 0 ? 'business-reference' : null } as typeof g.target; const action = required(mutable.learnedPlan.actions[i + 1]); action.locator = g.target.locator as typeof action.locator; });
            for (const b of mutable.learnedPlan.bindings) {
                b.sourceOrigin = origin;
                b.consumers.forEach(e => e.destinationOrigin = origin);
            }
            mutable.replayPolicy.bindings = mutable.learnedPlan.bindings;
            mutable.replayPolicy.transfers.forEach(t => t.origin = origin);
            if (mode === 'control') {
                Object.assign(required(mutable.guards[1]).target, { role: 'textbox', elementType: 'textarea', controlType: 'textarea', classification: 'nonsecretApproved', actionable: true, locator: { kind: 'role', role: 'textbox', name: 'Reference', exact: true } });
                required(mutable.learnedPlan.actions[1]).locator = required(mutable.guards[1]).target.locator as typeof mutable.learnedPlan.actions[1]['locator'];
                for (const action of mutable.learnedPlan.actions)
                    if (action.operation.kind === 'read')
                        Object.assign(required(action.operation.recipe), { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'textarea' });
                for (const step of mutable.steps)
                    for (const action of step.operations)
                        if (action.operation.kind === 'read')
                            Object.assign((action.operation as {
                                recipe: object;
                            }).recipe, { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'textarea' });
                for (const b of mutable.learnedPlan.bindings)
                    Object.assign(b.recipe, { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'textarea' });
            }
            if(asynchronous){const guard=required(mutable.guards[4]);Object.assign(guard.target,{locator:{kind:'role',role:'textbox',name:'Confirmation',exact:true}});required(mutable.learnedPlan.actions[4]).locator=guard.target.locator as typeof mutable.learnedPlan.actions[4]['locator'];}
            for (const action of mutable.learnedPlan.actions)
                action.operationHash = hashObserved({ coordinate: action.coordinate, origin: action.origin, locator: action.locator, operation: action.operation });
            mutable.learnedPlanHash = hashObserved(mutable.learnedPlan);
            mutable.replayPolicy.learnedPlanHash = mutable.learnedPlanHash;
            const artifact = validateReplayArtifact(mutable), frozen = hashObserved(artifact), scope = { principalId: 'current-user', ...artifact.replayPolicy.scope } as Scope;
            const policy: TrustedPolicy = { version: 1, policyId: scope.policyId, policyVersion: scope.policyVersion, applicationId: scope.applicationId, environment: scope.environment,  entryPolicyId: scope.entryPolicyId, allowedOrigins: scope.allowedOrigins, rules: [], applicationPolicy: { policyRuleId: 'app', allowStructuralDiscovery: true, readGrants: [{ policyRuleId: 'business-reference', origin, region: { kind: 'role', role: 'main', name: 'Operations', exact: true }, visibleText: { classification: 'permittedBusinessData' }, controlValue: { classification: 'nonsecretApproved', types: ['text', 'textarea'] } }] } };
            if (mode === 'no-grant')
                (policy.applicationPolicy as unknown as {
                    readGrants: unknown[];
                }).readGrants = [];
            if (mode === 'application')
                (required(policy.applicationPolicy).readGrants[0] as {
                    region: unknown;
                }).region = { kind: 'application' };
            writeRuntimeVersionsFile({root:resolve('.'),env:process.env,nodeVersion:process.version});
            const packaged=JSON.parse(await readFile(resolve('dist/runtime-versions.json'),'utf8')) as {observedReferenceBundleHash:string;observedChromiumBuild:string};
            // AC-1 P2 a: the record the real writer emits carries observed identities and none of the artifact-1 stamps.
            for (const retired of ['artifact','validatorSchema','validatorParser','syntaxReference','executor']) expect(packaged).not.toHaveProperty(retired);
            const build = { profileHash: hashObserved(OBSERVED_PROFILE), schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH, referenceBundleHash: packaged.observedReferenceBundleHash, executableImageDigest: 'b'.repeat(64), chromiumBuild: packaged.observedChromiumBuild };
            const catalogPath=join(dir,'controlled-release-catalog.json');await writeFile(catalogPath,JSON.stringify({profile:OBSERVED_PROFILE,build}));
            const browserRoot=process.env.PLAYWRIGHT_BROWSERS_PATH??(process.platform==='darwin'?join(homedir(),'Library','Caches','ms-playwright'):join(homedir(),'.cache','ms-playwright'));
            const startup={STUDIO_RUNNER_OBSERVED_CATALOG_FILE:catalogPath,STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST:build.executableImageDigest,PLAYWRIGHT_BROWSERS_PATH:browserRoot};
            expect(loadObservedBuild(startup,resolve('dist/runtime-versions.json'),resolve('dist/observed-reference.json'))).toEqual(build);
            const child = join(dir, 'controlled-observed-child.mjs');
            await writeFile(child, `import {startChild} from ${JSON.stringify(pathToFileURL(resolve('dist/run/child.js')).href)};import {loadObservedBuild} from ${JSON.stringify(pathToFileURL(resolve('dist/compat/runtime-versions.js')).href)};import {playwrightBrowserFactory} from ${JSON.stringify(pathToFileURL(resolve('dist/run/browser.js')).href)};const actualBuild=loadObservedBuild(${JSON.stringify(startup)});const originalLaunch=playwrightBrowserFactory.launch.bind(playwrightBrowserFactory);playwrightBrowserFactory.launch=async request=>{const handle=await originalLaunch(request);const create=handle.createObservationSession.bind(handle);handle.createObservationSession=config=>{const session=create(config),acquire=session.acquire.bind(session),invoke=session.invoke.bind(session);session.acquire=async request=>{const result=await acquire(request);if(request.locator.kind==='role'&&request.locator.name==='Confirmation')await fetch(${JSON.stringify(origin+'/acquisition')},{method:'POST',body:result.kind});return result;};session.invoke=async (...args)=>{const result=await invoke(...args);const request=args[0];await fetch(${JSON.stringify(origin+'/invocation')},{method:'POST',body:request.operation.kind});return result;};return session;};return handle;};startChild(process,{observedBuild:actualBuild});`);
            for (let run = 0; run < (positive ? 2 : 1); run++) {
                const now = Date.now(), issuedAt = new Date(now).toISOString(), expiresAt = new Date(now + 30000).toISOString(), executionId = uid(30 + run), attemptId = uid(40 + run), revisionDigest = 'c'.repeat(64), scopeHash = hashObserved(scope);
                const binding = { version: 1 as const, executionId, attemptId, startedAt: issuedAt, revisionId: uid(70), revisionDigest, testId: uid(10), csiId: scope.csiId, principalId: scope.principalId, environment: scope.environment, artifactHash: frozen, configurationHash: artifact.configurationHash, learnedPlanHash: artifact.learnedPlanHash, referencePolicyHash: hashObserved(artifact.replayPolicy), publicationEvidenceHash: artifact.replayPolicy.publicationEvidenceHash, requiredProfile: OBSERVED_PROFILE, requiredBuild: build, scope, scopeHash, currentPolicyHash: hashObserved(policy), replayGrant: { version: 1 as const, grantId: uid(60 + run), executionId, attemptId, revisionId: uid(70), revisionDigest, principalId: scope.principalId, csiId: scope.csiId, scopeHash, profileHash: hashObserved(OBSERVED_PROFILE), buildHash: hashObserved(build), currentPolicyHash: hashObserved(policy),  issuedAt, expiresAt } };
                const job: ObservedJob = { schemaVersion: 3, kind: 'observed', binding, artifact, configuration: fixture.basis.configuration as ObservedJob['configuration'], inputs: artifact.inputRecipes.map(i => ({ inputId: i.inputId, value: i.kind === 'destination' ? origin + '/start' : 'label' })), secrets: {}, secretOrigins: {}, runtime: { stepTimeoutMs: 10000, totalRuntimeMs: 20000 }, recording: { width: 640, height: 480 } };
                const launcher = createChildBrowserLauncher({ recording: job.recording, stepTimeoutMs: 10000, launchTimeoutMs: 30000, maxFailureMessageLength: 400, seekOriginCalibrationMs: 0, childModulePath: child });
                const cfg = loadConfig({ STUDIO_RUNNER_PORT: '0', STUDIO_RUNNER_HOST: '127.0.0.1', STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: origin, STUDIO_RUNNER_INSTANCE_ID: 'fixture-runner', STUDIO_RUNNER_SCRATCH_DIR: join(dir, 'scratch-' + String(run)), STUDIO_RUNNER_OBJECT_STORE_DIR: join(dir, 'objects-' + String(run)), STUDIO_RUNNER_DRAIN_TIMEOUT_MS: '100' });
                const sink = createRecordingLogSink();
                const app = createApplication(cfg, { listener: testListener, launcher, runtimeVersions: { playwright: '1.63.0', validatorSchema: '2.0.0', syntaxReference: '2.1.0', executor: '2.1.0' }, observed: { build, policies: [policy],  validationEnabled: run === 0, replayEnabled: true }, logSink: sink });
                try {
                    const port = await app.start();
                    const response = await secureFetch(`https://127.0.0.1:${String(port)}/v2/runs`, { method: 'POST', headers: { authorization: 'Bearer service', 'content-type': 'application/json' }, body: JSON.stringify(job) });
                    expect(response.status, await response.text()).toBe(202);

                    await untilMs(() => app.coordinator.inFlight === 0, 30000);
                    const final = reports.filter(r => r.kind === 'FINAL').at(-1);
                    expect(rejectedReports,'receiver rejects PROGRESS before STARTED').toEqual([]);
                    expect(final).toBeDefined();
                    expect(ownership.get(executionId)?.state).toBe('FINAL');

                    expect(final).toMatchObject({ outcome: { result: positive ? 'PASSED' : mode === 'password' || mode === 'sensitive-descendant' ? 'FAILED' : 'ERROR' } });
                    const prefix = `studio/${binding.csiId}/${binding.testId}/${executionId}/${attemptId}`;
                    const manifest = JSON.parse(await readFile(join(dir, 'objects-' + String(run), prefix + '.result.json'), 'utf8')) as Record<string, unknown>;
                    expect(manifest).toMatchObject({ outcome: positive ? 'PASSED' : mode === 'password' || mode === 'sensitive-descendant' ? 'FAILED' : 'ERROR', evidenceState: 'STORED', artifactHash: frozen });
                        expect((await readFile(join(dir, 'objects-' + String(run), prefix + '.webm'))).length).toBeGreaterThan(0);

                    const retained = JSON.stringify({ reports, sink: sink.lines, manifest });
                    expect(retained).not.toContain('fresh-');for(const value of issuedValues)expect(retained).not.toContain(value);
                    expect(retained).not.toContain('UNKNOWN-PAGE-CANARY');
                    expect(retained).not.toContain('PRIVATE-ACCOUNT-CANARY');
                    expect(hashObserved(artifact)).toBe(frozen);

                }
                finally {
                        await app.drain();
                }
            }
            expect(admissions).toBe(positive ? 2 : 1);
            expect(visits).toBe(positive ? 2 : 1);
            expect(receipts).toEqual(positive||asynchronous?issuedValues:[]);
            if(asynchronous){expect(acquisitions).toContain('ABSENT');expect(invocations.filter(kind=>kind==='read')).toHaveLength(positive?2:1);expect(invocations.filter(kind=>kind==='fill')).toHaveLength(positive?4:2);expect(invocations.filter(kind=>kind==='assert')).toHaveLength(positive?2:0);if(positive)expect(acquisitions.filter(kind=>kind==='READY')).toHaveLength(2);else expect(acquisitions).not.toContain('READY');}
        }
        finally {
            server.closeAllConnections();
            await new Promise<void>(r => server.close(() => { r(); }));
            await rm(dir, { recursive: true, force: true });
        }
    }, 90000);
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
