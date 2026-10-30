import {diagnosticFlowFindings,contextSearchFindings} from './realsite-gate/diagnostic-oracles.ts';
import type {FlowResult} from './realsite-gate/evaluate.ts';
import {expect,test} from '@playwright/test';
import {join} from 'node:path';
import {isDryRunId,writeJson} from './realsite-gate/common.ts';
import {detailPageOk,learnAttempt,openEditor,publishedLineage,replayOnce,runFlow,saveDraft,waitForProof} from './realsite-gate/driver.ts';
import {persistedBindings} from './realsite-gate/region-audit.ts';
import {editFindings} from './realsite-gate/lifecycle.ts';
import {positiveFindings} from './realsite-gate/evaluate.ts';
import {psqlJson,safeId} from './realsite-gate/status.ts';
import {DIR,GATE_TABLE,RUN_ID,makeContext,proxyStateFor} from './realsite-gate/specsupport.ts';
/** Supplemental product diagnostics. Never write counted results, scans or anchors. */
test.use({trace:'off',screenshot:'off',video:'off'});
function diagnostic():void {
  test.skip(process.env.CHECKS_GATE_DIAGNOSTICS!=='1','opt-in real-stack diagnostic; skipped is NOT evidence');
  if(!isDryRunId(RUN_ID))throw new Error('supplemental diagnostics require separate dry/rehearsal identity');
}
const EDIT_INITIAL_STEPS=['Go to "https://www.iana.org/"','Check that the page contains "Internet Assigned Numbers Authority"'];
const EDIT_FINAL_STEPS=[EDIT_INITIAL_STEPS[0]!, 'Check that the page contains "IANA"'];
test('real Studio create save reload learn edit incremental proof and model-free replay',async({page})=>{
  diagnostic();test.setTimeout(55*60_000);
  const ctx=await makeContext(page);
  const initial=await runFlow(page,ctx,{key:'diagnostic-edit',flow:{id:'main',steps:EDIT_INITIAL_STEPS},mode:'first',proceed:true,description:'supplementary joined edit/relearn canary',beforeLearn:async(p,id)=>{const before=await ctx.request.get(`${ctx.baseUrl}/api/v1/studio/tests/${id}`);const saved=await before.json() as {steps:{id:string;text:string}[]};await p.reload();const after=await ctx.request.get(`${ctx.baseUrl}/api/v1/studio/tests/${id}`);expect((await after.json() as {steps:unknown[]}).steps).toEqual(saved.steps);}});
  const initialFindings=diagnosticFlowFindings('diagnostic-edit-initial',initial,proxyStateFor({edit:{key:'edit',kind:'positive',status:'RAN',voidReason:null,flows:[initial],startedAt:'diagnostic',endedAt:'diagnostic'}}),EDIT_INITIAL_STEPS);
  writeJson(join(DIR,'diagnostics','edit-initial.json'),{status:initialFindings.length?'FAIL':'PASS',flow:initial,findings:initialFindings});
  expect(initialFindings).toEqual([]);
  expect(initial.publication,'UNKNOWN initial authoritative publication').toBeDefined();
  if(initial.testId===null||initial.publication===undefined)throw new Error('UNKNOWN initial learned lineage');
  await openEditor(page,ctx,initial.testId);
  await page.getByRole('textbox',{name:'Step 2',exact:true}).fill('Check that the page contains "IANA"');
  await saveDraft(page);
  const learned=await learnAttempt(page,ctx,'diagnostic-edit',initial.testId,1,'first',true);
  expect(learned.cls,'edited learning must succeed before proof and replay').toBe('OK');
  const after=publishedLineage(ctx,initial.testId);
  const proof=await waitForProof(ctx,initial.testId,after);
  const manual=await replayOnce(page,ctx,'diagnostic-edit',initial.testId,3,after);
  const secondManual=await replayOnce(page,ctx,'diagnostic-edit',initial.testId,4,after);
  const rows=learned.sessionId===null?[]:psqlJson(ctx.psql,`select row_to_json(t) from (select p.base_revision_id::text as base_revision_id,x.effective_step_index,x.completed_prefix_count,(select count(*) from studio_guided_model_attempts m where m.session_id=p.session_id and m.created_at<x.created_at) as prefix_model_calls from studio_guided_relearn_plans p join studio_guided_relearn_switches x on x.session_id=p.session_id where p.session_id='${safeId(learned.sessionId)}') t`);
  expect(rows,'UNKNOWN actual prefix-switch receipt').toHaveLength(1);
  if(after===undefined||rows.length!==1)throw new Error('UNKNOWN incremental execution lineage');
  const prefix=rows[0] as {base_revision_id:string;effective_step_index:number;completed_prefix_count:number;prefix_model_calls:number};
  expect(prefix.base_revision_id).toBe(initial.publication.revisionId);expect(prefix.effective_step_index).toBe(1);expect(prefix.completed_prefix_count).toBe(1);
  const findings=editFindings({before:initial.publication,after,editedStepId:after.stepIds[1] ?? '',prefixReplayed:after.stepIds.slice(0,prefix.completed_prefix_count),suffixLearned:[...new Set((learned.ledger ?? []).filter((r)=>r.dispatched===1&&!after.stepIds.slice(0,1).includes(r.stepId)).map((r)=>r.stepId))],prefixModelCalls:prefix.prefix_model_calls,proofRevisionId:proof?.lineage?.revisionId ?? '',manual});
  expect(proof?.status).toBe('PASSED');expect(proof?.videoStatus).toBe('AVAILABLE');expect(learned.clarifications).toHaveLength(0);expect(learned.receipt).toBe(true);
  const finalFlow:FlowResult={...initial,publication:after,learnAttempts:[learned],learningTiming:learned.learningTiming,learned:learned.cls==='OK',learnedAt:after.learnedCompletedAt,proof,replays:[manual,secondManual],detailOk:await detailPageOk(page,ctx,initial.testId),error:null};
  findings.push(...diagnosticFlowFindings('diagnostic-edit-final',finalFlow,'INTERPOSED',EDIT_FINAL_STEPS)); 
  writeJson(join(DIR,'diagnostics','edit.json'),{status:findings.length?'FAIL':'PASS',initial,finalFlow,learned,after,proof,manual,secondManual,findings});
  expect(findings).toEqual([]);
});
const TWO_VALUE_STEPS=[
  'Go to "https://en.wikipedia.org/wiki/Python_(programming_language)"',
  'Copy the "Designed by" value from the infobox for Python',
  'Go to "https://en.wikipedia.org/wiki/JavaScript"',
  'Copy the "Designed by" value from the infobox for JavaScript',
  'Type the designer copied from Python in the "Search Wikipedia" field',
  'Press Enter',
  'Check that the page title is "Guido van Rossum - Wikipedia"',
  'Type the designer copied from JavaScript in the "Search Wikipedia" field',
  'Press Enter',
  'Check that the page title is "Brendan Eich - Wikipedia"',
];
test('real two distinct captured values reach separately fixed full Wikipedia page titles',async({page})=>{
  diagnostic();test.setTimeout(55*60_000);const ctx=await makeContext(page);
  const flow=await runFlow(page,ctx,{key:'diagnostic-two-values',flow:{id:'main',steps:TWO_VALUE_STEPS},literalPageTitles:[{stepIndex:6,title:'Guido van Rossum - Wikipedia'},{stepIndex:9,title:'Brendan Eich - Wikipedia'}],mode:'first',proceed:true,description:'both designers captured before either search; fixed full page-title equality outcomes',beforeLearn:async(p)=>{const checks=[];for(const [url,title] of [['https://en.wikipedia.org/wiki/Guido_van_Rossum','Guido van Rossum - Wikipedia'],['https://en.wikipedia.org/wiki/Brendan_Eich','Brendan Eich - Wikipedia']] as const){const tab=await p.context().newPage();try{await tab.goto(url,{waitUntil:'domcontentloaded'});checks.push({url,expectedTitle:title,matched:(await tab.title())===title,at:new Date().toISOString()});}finally{await tab.close();}}writeJson(join(DIR,'ui','two-value-title-preflight.json'),{checks});if(checks.some((c)=>!c.matched))throw new Error('FIXED_PAGE_TITLE_PREFLIGHT_MISMATCH: new run/review required; do not rewrite literals');}});
  const findings=diagnosticFlowFindings('diagnostic-two-values',flow,'INTERPOSED',TWO_VALUE_STEPS);
  writeJson(join(DIR,'diagnostics','two-values-lifecycle.json'),{status:findings.length?'FAIL':'PASS',flow,findings});
  if(flow.publication===undefined)throw new Error('UNKNOWN published two-value source lineage');
  const ids=flow.publication.stepIds,bindings=persistedBindings(ctx,flow.publication);
  const expectations=[{sourceStepId:ids[1] ?? '',consumerStepId:ids[4] ?? '',landingStepId:ids[6] ?? '',title:'Guido van Rossum - Wikipedia'},{sourceStepId:ids[3] ?? '',consumerStepId:ids[7] ?? '',landingStepId:ids[9] ?? '',title:'Brendan Eich - Wikipedia'}];
  findings.push(...contextSearchFindings(flow,bindings,expectations));
  writeJson(join(DIR,'diagnostics','two-values.json'),{status:findings.length?'FAIL':'PASS',flow,expectations,findings});
  expect(findings).toEqual([]);
});

const probes=[
  {key:'action',steps:['Go to the page "https://www.iana.org/"']},
  {key:'scoped-read',steps:['Go to "https://www.kernel.org/"','From the "stable:" row, copy the version number for use in the later check','Check that the page contains the copied version number']},
  {key:'read-reuse',steps:['Go to "https://github.com/microsoft/playwright"','Remember the description in the "About" section','Check that the page contains the remembered description']},
];
for(const probe of probes)test(`wording diagnostic ${probe.key}`,async({page})=>{
  diagnostic();test.setTimeout(55*60_000);const ctx=await makeContext(page);
  const flow=await runFlow(page,ctx,{key:`diagnostic-${probe.key}`,flow:{id:'main',steps:probe.steps},mode:'first',proceed:true,description:'preselected bounded wording diagnostic; not registered gate evidence'});
  const result={key:probe.key,kind:'positive' as const,status:'RAN' as const,voidReason:null,flows:[flow],startedAt:'diagnostic',endedAt:'diagnostic'};
  const findings=positiveFindings(probe.key,result,null,proxyStateFor({[probe.key]:result}));
  writeJson(join(DIR,'diagnostics',`${probe.key}.json`),{status:findings.length?'FAIL':'PASS',flow,findings});
  expect(findings.map((f)=>f.reason)).toEqual([]);
});
// Keep registry binding explicit: diagnostics neither change nor satisfy any required case.
void GATE_TABLE;
