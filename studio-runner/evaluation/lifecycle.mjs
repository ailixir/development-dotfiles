/* global fetch, AbortSignal */
import { performance } from 'node:perf_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { evaluateOracle, validateManifest } from './oracle.mjs';
import { buildReport, renderReport, reportExitCode } from './report.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Live lifecycle adapter; scripted transports are injectable only for clearly labelled local tests. */
export async function runEvaluation(config, manifest, directory, transport = fetch) {
  validateManifest(manifest);
  if (config.tier !== 'live' || config.purpose !== 'development'
      || !Number.isSafeInteger(config.maxApiCalls) || config.maxApiCalls < 1
      || !Number.isSafeInteger(config.maxTransportCalls) || config.maxTransportCalls < 9
      || !Number.isFinite(config.maxElapsedMs) || config.maxElapsedMs <= 0
      || !Number.isSafeInteger(config.repetitions) || config.repetitions < 1
      || !Array.isArray(config.allowedTargetOrigins) || !config.allowedTargetOrigins.length
      || typeof config.sourceCommit !== 'string' || typeof config.dirtyBaselineDigest !== 'string'
      || !config.pins || !config.csiId || (config.concurrency !== undefined && (!Number.isSafeInteger(config.concurrency) || config.concurrency < 1 || config.concurrency > 8))) throw new Error('Invalid evaluation configuration');
  const prerequisite = JSON.parse(await readFile(config.approvedGatewayEvidence, 'utf8'));
  if (prerequisite.status !== 'PASS' || !prerequisite.approvedBy || !Number.isFinite(prerequisite.quotaUsd)
      || prerequisite.quotaUsd <= 0 || !prerequisite.quotaEnforced) throw new Error('Approved gateway/quota evidence required');
  const apiToken = process.env.STUDIO_EVAL_API_TOKEN;
  const fixtureToken = process.env.STUDIO_EVAL_FIXTURE_TOKEN;
  if (!apiToken || !fixtureToken) throw new Error('Evaluation identities unavailable');
  const v2 = new URL(config.apiBaseUrl);
  const v1 = new URL(config.executionApiBaseUrl);
  const fixture = new URL(config.fixtureControlUrl);
  for (const url of [v2,v1,fixture]) {
    if (url.username || url.password || url.search || url.hash
        || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
      throw new Error('Invalid evaluation endpoint');
    }
  }
  const concurrency = config.concurrency ?? 1;
  const started = performance.now();
  let calls = 0;
  let reservedModelCalls = 0;
  let stoppedBy = null;
  let inFlightCompiles = 0;
  let peakInFlightCompiles = 0;
  // Harness-observed admission outcomes (ms since run start) for capacity/recovery reporting.
  const capacityEvents = [];
  const exhausted = (reason, message) => { stoppedBy ??= reason; return new Error(message); };
  const remaining = () => {
    const left = config.maxElapsedMs - (performance.now() - started);
    if (left <= 0) throw exhausted('maxElapsedMs','Evaluation time budget exhausted');
    return left;
  };
  const request = async (base, path, method = 'GET', body) => {
    if (++calls > config.maxApiCalls) throw exhausted('maxApiCalls','Evaluation API call budget exhausted');
    const url = new URL(base.toString().replace(/\/$/, '') + path);
    const token = base === fixture ? fixtureToken : apiToken;
    const response = await transport(url, {method, redirect:'error', signal:AbortSignal.timeout(Math.max(1,Math.ceil(Math.min(30_000,remaining())))),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    if (!response.ok) throw Object.assign(new Error('Evaluation endpoint refused request'), {status:response.status});
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Evaluation response exceeds bound');
    return text ? JSON.parse(text) : null;
  };
  const jobs = [];
  for (const entry of manifest.cases.filter(c => !config.split || c.split === config.split)) {
    for (let repeat=0; repeat<config.repetitions; repeat++) {
      const modes = entry.editedSource ? ['FULL','AUTO'] : ['FULL'];
      if (parseInt(digest([entry.id,repeat,config.orderSeed]).slice(0,2),16)%2) modes.reverse();
      for (const mode of modes) jobs.push({entry,repeat,mode,id:`${entry.id}:${repeat}:${mode}`});
    }
  }
  if (!jobs.length) throw new Error('No selected cases');
  const planned = jobs.map(j=>({id:j.id,expectedClass:j.entry.expectedClass,requestedMode:j.mode,family:j.entry.family}));
  // Spec §1 reserves T3 for a real approved gateway. The harness cannot verify that provenance itself (the
  // gateway evidence file is an operator declaration), so a real transport is 'T3-unverified' and an
  // injected (scripted) transport is never labelled as live inference evidence.
  const tier = transport === fetch ? 'T3-unverified' : 'scripted-transport';
  const runContext = {tier,purpose:'development',concurrency,pins:config.pins,sourceCommit:config.sourceCommit,
    dirtyBaselineDigest:config.dirtyBaselineDigest,manifestDigest:digest(manifest),fixtureVersion:config.fixtureVersion??null,
    budgets:{maxApiCalls:config.maxApiCalls,maxTransportCalls:config.maxTransportCalls,maxElapsedMs:config.maxElapsedMs}};
  await writeFile(directory+'/run-manifest.json',JSON.stringify({schemaVersion:1,tier,purpose:'development',releaseReady:false,
    plannedIds:jobs.map(j=>j.id),planned,manifestDigest:runContext.manifestDigest,sourceCommit:config.sourceCommit,dirtyBaselineDigest:config.dirtyBaselineDigest,
    pins:config.pins,fixtureVersion:runContext.fixtureVersion,repetitions:config.repetitions,orderSeed:config.orderSeed,maxApiCalls:config.maxApiCalls,
    maxTransportCalls:config.maxTransportCalls,maxElapsedMs:config.maxElapsedMs,concurrency,quotaUsd:prerequisite.quotaUsd},null,2)+'\n',{flag:'wx'});
  await writeFile(directory+'/trials.jsonl','',{flag:'wx'});
  const trials=[];
  const compile = async (view, mode) => {
    const compileStarted = performance.now();
    // Reserve the complete per-request maximum before starting any inference. No optimistic call accounting.
    if (reservedModelCalls + 9 > config.maxTransportCalls) throw exhausted('maxTransportCalls','Evaluation model-call budget exhausted');
    reservedModelCalls += 9;
    let accepted;
    try {
      accepted = await request(v2,`/tests/${view.test.id}/compile`,'POST',{mode,sourceRevision:view.test.sourceRevision,
        configurationRevision:view.test.configurationRevision,authoringHash:view.authoringHash});
    } catch (error) {
      // 429/503 is the admission pool refusing work (no queue); recorded, never retried here.
      if (error.status === 429 || error.status === 503) {
        capacityEvents.push({type:'REFUSED',atMs:performance.now()-started,httpStatus:error.status});
        error.admissionRefused = true;
      }
      throw error;
    }
    capacityEvents.push({type:'ACCEPTED',atMs:performance.now()-started});
    peakInFlightCompiles = Math.max(peakInFlightCompiles, ++inFlightCompiles);
    try {
      for (;;) {
        const next = await request(v2,`/tests/${view.test.id}`);
        if (next.compileAttempt?.compileRequestId !== accepted.compileRequestId
            || next.test.sourceRevision !== view.test.sourceRevision
            || next.test.configurationRevision !== view.test.configurationRevision
            || next.authoringHash !== view.authoringHash) throw new Error('Compile identity changed');
        if (next.test.compileStatus !== 'COMPILING') return {...next,evaluationCompileMs:performance.now()-compileStarted};
        await pause(Math.min(500,remaining()));
      }
    } finally { inFlightCompiles--; }
  };
  const confirmAndRun = async view => {
    const attempt=view.compileAttempt;
    if (attempt?.state!=='CANDIDATE' || !attempt.revisionId || !attempt.artifactHash) throw new Error('No complete candidate');
    await request(v2,`/tests/${view.test.id}/confirm-compile`,'POST',{
      compileRequestId:attempt.compileRequestId,revisionId:attempt.revisionId,artifactHash:attempt.artifactHash,
      sourceRevision:attempt.sourceRevision,configurationRevision:attempt.configurationRevision,authoringHash:view.authoringHash});
    const accepted=await request(v1,`/tests/${view.test.id}/execute`,'POST');
    for (;;) {
      const run=await request(v1,`/executions/${accepted.executionId}`);
      if (['PASSED','FAILED','ERROR'].includes(run.status)) {
        const source=view.authoring.steps;
        if(run.executionId!==accepted.executionId || run.testId!==view.test.id
            || run.revisionId!==attempt.revisionId
            || (run.configurationRevision!==undefined && run.configurationRevision!==view.test.configurationRevision)
            || !Array.isArray(run.stepResults) || run.stepResults.length!==source.length
            || run.stepResults.some((step,i)=>step.stepIndex!==i || step.originalText!==source[i].text
              || !['PASS','FAIL','SKIPPED'].includes(step.status))
            || (run.status==='PASSED' && run.stepResults.some(step=>step.status!=='PASS'))
            || (run.status==='FAILED' && !run.stepResults.some(step=>step.status==='FAIL'))) {
          throw new Error('Execution does not establish the complete captured workflow');
        }
        return run;
      }
      await pause(Math.min(500,remaining()));
    }
  };
  let jobIndex = 0;
  let evidenceWrite = Promise.resolve();
  const worker = async () => {
  while (jobIndex < jobs.length) {
    if (calls >= config.maxApiCalls || performance.now()-started >= config.maxElapsedMs) break;
    const job = jobs[jobIndex++];
    const begin=performance.now();
    const trial={id:job.id,caseId:job.entry.id,family:job.entry.family,split:job.entry.split,expectedClass:job.entry.expectedClass,
      requestedMode:job.mode,complete:false,inputTokens:null,outputTokens:null};
    try {
      remaining();
      const namespace=randomUUID();
      const target=await request(fixture,'/trials','POST',{namespace,seed:job.entry.seed??job.entry.id});
      if (target.namespace!==namespace || !config.allowedTargetOrigins.includes(new URL(target.targetUrl).origin)) throw new Error('Fixture identity/target refused');
      const source = lines => lines.map(line=>line.replaceAll('{TARGET_URL}',target.targetUrl));
      const write = (lines, scope, view) => ({name:`Evaluation ${job.id}`,csiId:config.csiId,description:'Synthetic inference evaluation',
        environment:config.environment??'development',steps:source(lines).map((text,i)=>({id:view?.authoring?.steps[i]?.id??null,text})),
        scope:{policyVersion:'1.0.0',declaration:scope??'UNKNOWN'},variables:[],
        configuration:config.configuration??{browser:'chromium',viewport:{width:1280,height:720},timeoutSeconds:30,waitStrategy:'domcontentloaded'},
        ...(view?{sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision}:{})});
      let view=await request(v2,'/tests','POST',write(job.entry.source,job.entry.scope));
      view=await compile(view,'FULL');
      let baseline=null;
      if (job.entry.editedSource) {
        if (!job.entry.baselineExpected) throw new Error('Paired case requires independent baseline oracle');
        const baseRun=await confirmAndRun(view);
        const baseState=await request(fixture,`/trials/${namespace}`);
        const baseExpected={...job.entry.baselineExpected,namespace,revisionId:view.compileAttempt.revisionId,configurationRevision:view.test.configurationRevision};
        const baseObserved={...baseState,executionStatus:baseRun.status,revisionId:baseRun.revisionId,configurationRevision:view.test.configurationRevision};
        if (!evaluateOracle(baseExpected,baseObserved).correct) throw new Error('Baseline behavior did not pass independent oracle');
        baseline=view;
        trial.baseline={compileRequestId:view.compileAttempt.compileRequestId,revisionId:view.compileAttempt.revisionId,
          executionId:baseRun.executionId,compileMs:view.evaluationCompileMs,usage:view.compileAttempt.usage};
        await request(fixture,`/trials/${namespace}/reset`,'POST');
        view=await request(v2,`/tests/${view.test.id}`,'PUT',write(job.entry.editedSource,job.entry.editedScope??job.entry.scope,view));
        view=await compile(view,job.mode);
      }
      trial.compileRequestId=view.compileAttempt?.compileRequestId??null;
      trial.candidateProduced=view.compileAttempt?.state==='CANDIDATE';
      trial.selectedMode=view.compileAttempt?.plan?.selectedMode??null;
      trial.plan=view.compileAttempt?.plan??null;
      trial.inputTokens=view.compileAttempt?.usage?.inputTokens??null;
      trial.outputTokens=view.compileAttempt?.usage?.outputTokens??null;
      trial.usage=view.compileAttempt?.usage??null;
      trial.compileMs=view.evaluationCompileMs;
      if (baseline) {
        trial.editedInputTokens=trial.inputTokens;trial.editedOutputTokens=trial.outputTokens;
        trial.inputTokens=Number.isFinite(trial.inputTokens)&&Number.isFinite(trial.baseline.usage?.inputTokens)
          ? trial.inputTokens+trial.baseline.usage.inputTokens : null;
        trial.outputTokens=Number.isFinite(trial.outputTokens)&&Number.isFinite(trial.baseline.usage?.outputTokens)
          ? trial.outputTokens+trial.baseline.usage.outputTokens : null;
      }
      if(job.entry.expectedClass!=='SUPPORTED') {
        const expectedCode=job.entry.expectedClass==='UNSUPPORTED'?'UNSUPPORTED_CAPABILITY':'AMBIGUOUS_INTENT';
        const diagnostics=view.test.compileDiagnostics?.steps?.flatMap(s=>s.diagnostics)??[];
        trial.oracle={correct:view.test.compileStatus==='NEEDS_REVISION'&&!view.test.currentCandidateRevisionId&&diagnostics.some(d=>d.code===expectedCode),falseSuccess:false,failures:[]};
      } else {
        const result=await confirmAndRun(view);
        const app=await request(fixture,`/trials/${namespace}`);
        const expected={...job.entry.expected,namespace,revisionId:view.compileAttempt.revisionId,configurationRevision:view.test.configurationRevision};
        // Current API has no typed assertion-failure origin: unknown is never promoted to ASSERTION.
        const failed=result.stepResults?.find(s=>s.status==='FAIL');
        const observed={...app,executionStatus:result.status,revisionId:result.revisionId,
          configurationRevision:result.configurationRevision??null,assertionFailureStep:failed?.stepIndex,
          failureKind:failed?.failureKind??'UNKNOWN',errorCode:result.errorCode??null};
        // Configuration association is verified by immutable revision ID; never accept a different revision.
        if(result.configurationRevision===undefined && result.revisionId===expected.revisionId) observed.configurationRevision=expected.configurationRevision;
        trial.oracle=evaluateOracle(expected,observed);
        trial.executionId=result.executionId;trial.revisionId=result.revisionId;trial.runtime=result.runtime;trial.executionStatus=result.status;
        for (const pin of ['validator','executor','playwright']) {
          if(typeof config.pins[pin]!=='string' || result.runtime?.[pin]!==config.pins[pin]) {
            trial.oracle.correct=false;trial.oracle.failures.push('runtime-pin-mismatch');
          }
        }
        trial.appEvents=app.events;trial.appState=app.state;
        if (baseline && view.compileAttempt.plan.reusedStepIds.length) {
          const old=new Map(baseline.authoring.steps.map((s,i)=>[s.id,{text:s.text,code:baseline.test.currentCandidateArtifact.steps[i].code}]));
          const intact=view.authoring.steps.every((s,i)=>!view.compileAttempt.plan.reusedStepIds.includes(s.id)
            || (old.get(s.id)?.text===s.text&&old.get(s.id)?.code===view.test.currentCandidateArtifact.steps[i].code));
          trial.reuseIntegrity=intact;
          if(!intact){trial.oracle.correct=false;trial.oracle.failures.push('reuse-integrity');}
        }
      }
      trial.complete=true;
    } catch (error) {
      if (error?.admissionRefused) trial.admissionRefused=true;
      trial.incompleteReason=error?.admissionRefused ? 'Compile admission refused (capacity)'
        : 'Endpoint, prerequisite, budget, baseline, or lifecycle prevented completion';
    }
    trial.elapsedMs=performance.now()-begin;
    trials.push(trial);evidenceWrite=evidenceWrite.then(()=>appendFile(directory+'/trials.jsonl',JSON.stringify(trial)+'\n'));await evidenceWrite;
    if (calls>=config.maxApiCalls || performance.now()-started>=config.maxElapsedMs) break;
  }
  };
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  if (!stoppedBy && trials.length < jobs.length) stoppedBy = calls >= config.maxApiCalls ? 'maxApiCalls' : 'maxElapsedMs';
  const run={...runContext,apiCalls:calls,reservedTransportCalls:reservedModelCalls,elapsedMs:performance.now()-started,stoppedBy,peakInFlightCompiles};
  const summary=buildReport({trials,planned,run,capacityEvents});
  summary.apiCalls=calls;summary.reservedTransportCalls=reservedModelCalls;
  await writeFile(directory+'/summary.json',JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  await writeFile(directory+'/report.md',renderReport(summary),{flag:'wx'});
  return reportExitCode(summary);
}
