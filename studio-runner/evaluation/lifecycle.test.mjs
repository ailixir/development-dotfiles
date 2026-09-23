/* global Response */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvaluation } from './lifecycle.mjs';

const expected={namespace:'CURRENT',revisionId:'CURRENT',configurationRevision:1,executionStatus:'PASSED',
  events:[{type:'form.saved',account:'target'}],state:{saved:'target'}};
for(const variant of ['good','wrong-state','missing-step','wrong-execution','wrong-configuration']) test(`scripted lifecycle ${variant}`,async()=>{
  const wrong=variant==='wrong-state';
  const temp=await mkdtemp(join(tmpdir(),'studio-evaluation-'));
  const oldApi=process.env.STUDIO_EVAL_API_TOKEN, oldFixture=process.env.STUDIO_EVAL_FIXTURE_TOKEN;
  process.env.STUDIO_EVAL_API_TOKEN='synthetic-api-token';process.env.STUDIO_EVAL_FIXTURE_TOKEN='synthetic-fixture-token';
  try {
    const evidence=join(temp,'evidence');await mkdir(evidence);
    const gate=join(temp,'gate.json');await writeFile(gate,JSON.stringify({status:'PASS',approvedBy:'synthetic-fixture',quotaUsd:1,quotaEnforced:true}));
    const calls=[];let namespace;let compiled=false;let confirmed=false;
    const view=()=>({test:{id:'test',sourceRevision:1,configurationRevision:1,compileStatus:compiled?'AWAITING_CONFIRMATION':'STALE',
      currentCandidateRevisionId:compiled?'candidate':null,currentCandidateArtifact:{version:1,steps:[{stepIndex:0,originalText:'Save',code:'await page.goto("https://fixture.example");'}]}},
      authoringHash:'a'.repeat(64),authoring:{steps:[{id:'step',text:'Save'}]},compileAttempt:compiled?{compileRequestId:'request',state:'CANDIDATE',
        revisionId:'candidate',artifactHash:'b'.repeat(64),sourceRevision:1,configurationRevision:1,plan:{selectedMode:'FULL',reusedStepIds:[]},usage:{inputTokens:10,outputTokens:20}}:null});
    const transport=async(url,options)=>{
      const path=url.pathname;calls.push([path,options.method]);
      let body;
      if(path==='/control/trials'&&options.method==='POST'){namespace=JSON.parse(options.body).namespace;body={namespace,targetUrl:'https://fixture.example/test'};}
      else if(path.startsWith('/control/trials/'))body={namespace,events:[{type:'form.saved',account:wrong?'other':'target'}],state:{saved:wrong?'other':'target'}};
      else if(path==='/api/v2/studio/tests')body=view();
      else if(path.endsWith('/compile')){compiled=true;body={compileRequestId:'request'};}
      else if(path.endsWith('/confirm-compile')){assert.equal(JSON.parse(options.body).revisionId,'candidate');confirmed=true;body=view();}
      else if(path.endsWith('/execute')){assert.equal(confirmed,true);body={executionId:'execution'};}
      else if(path.endsWith('/executions/execution'))body={executionId:variant==='wrong-execution'?'other-execution':'execution',testId:'test',revisionId:'candidate',status:'PASSED',errorCode:null,
        ...(variant==='wrong-configuration'?{configurationRevision:99}:{}),
        runtime:{validator:'2.0.0',executor:'2.0.0',playwright:'1.63.0'},stepResults:variant==='missing-step'?[]:[{stepIndex:0,originalText:'Save',status:'PASS'}]};
      else body=view();
      return new Response(JSON.stringify(body),{status:200});
    };
    const exit=await runEvaluation({tier:'live',purpose:'development',maxApiCalls:30,maxTransportCalls:9,maxElapsedMs:10_000,repetitions:1,
      allowedTargetOrigins:['https://fixture.example'],sourceCommit:'synthetic',dirtyBaselineDigest:'synthetic',pins:{validator:'2.0.0',executor:'2.0.0',playwright:'1.63.0'},
      csiId:'60403',approvedGatewayEvidence:gate,apiBaseUrl:'https://api.example/api/v2/studio',executionApiBaseUrl:'https://api.example/api/v1/studio',
      fixtureControlUrl:'https://fixture.example/control'}, {schemaVersion:1,cases:[{id:'save',family:'save',split:'development',expectedClass:'SUPPORTED',source:['Save'],expected}]},evidence,transport);
    assert.equal(exit,wrong?1:variant==='good'?0:2);
    const summary=JSON.parse(await readFile(join(evidence,'summary.json'),'utf8'));assert.equal(summary.releaseReady,false);
    assert.equal(summary.falseSuccesses,wrong?1:0);
    assert.equal(calls.filter(([path])=>path.endsWith('/execute')).length,1);
    const log=await readFile(join(evidence,'trials.jsonl'),'utf8');assert.equal(log.includes('synthetic-api-token'),false);
  } finally {
    if(oldApi===undefined)delete process.env.STUDIO_EVAL_API_TOKEN;else process.env.STUDIO_EVAL_API_TOKEN=oldApi;
    if(oldFixture===undefined)delete process.env.STUDIO_EVAL_FIXTURE_TOKEN;else process.env.STUDIO_EVAL_FIXTURE_TOKEN=oldFixture;
    await rm(temp,{recursive:true,force:true});
  }
});
