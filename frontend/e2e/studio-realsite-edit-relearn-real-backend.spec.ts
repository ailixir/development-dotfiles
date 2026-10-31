import type {FlowResult} from './realsite-gate/evaluate.ts';
import {expect,test} from '@playwright/test';
import {join} from 'node:path';
import {isDryRunId,writeJson} from './realsite-gate/common.ts';
import {detailPageOk,learnAttempt,openEditor,publishedLineage,replayOnce,runFlow,saveDraft,waitForProof} from './realsite-gate/driver.ts';
import {editFindings} from './realsite-gate/lifecycle.ts';
import {positiveFindings} from './realsite-gate/evaluate.ts';
import {psqlJson,readHeadPointers,safeId,stepReceiptRows} from './realsite-gate/status.ts';
import {DIR,GATE_TABLE,RUN_ID,makeContext,proxyStateFor} from './realsite-gate/specsupport.ts';
/** Supplemental product diagnostics. Never write counted results, scans or anchors. */
test.use({trace:'off',screenshot:'off',video:'off'});
function diagnostic():void {
  test.skip(process.env.CHECKS_GATE_DIAGNOSTICS!=='1','opt-in real-stack diagnostic; skipped is NOT evidence');
  if(!isDryRunId(RUN_ID))throw new Error('supplemental diagnostics require separate dry/rehearsal identity');
}
/** The registered positive rules over one diagnostic flow; supplementary, never counted. */
function flowFindings(key:string,flow:FlowResult):string[]{
  const result={key,kind:'positive' as const,status:'RAN' as const,voidReason:null,flows:[flow],startedAt:'diagnostic',endedAt:'diagnostic'};
  return positiveFindings(key,result,null,proxyStateFor({[key]:result})).filter((f)=>f.verdict!=='PASS').map((f)=>f.reason);
}
const EDIT_INITIAL_STEPS=['Go to "https://www.iana.org/"','Check that the page contains "Internet Assigned Numbers Authority"'];
test('real Studio create save reload learn edit incremental proof and model-free replay',async({page})=>{
  diagnostic();test.setTimeout(55*60_000);
  const ctx=await makeContext(page);
  const initial=await runFlow(page,ctx,{key:'diagnostic-edit',flow:{id:'main',steps:EDIT_INITIAL_STEPS},mode:'first',proceed:true,description:'supplementary joined edit/relearn canary',beforeLearn:async(p,id)=>{const before=await ctx.request.get(`${ctx.baseUrl}/api/v1/studio/tests/${id}`);const saved=await before.json() as {steps:{id:string;text:string}[]};await p.reload();const after=await ctx.request.get(`${ctx.baseUrl}/api/v1/studio/tests/${id}`);expect((await after.json() as {steps:unknown[]}).steps).toEqual(saved.steps);}});
  const initialFindings=flowFindings('diagnostic-edit-initial',initial);
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
  expect(proof?.status).toBe('PASSED');expect(proof?.videoStatus).toBe('AVAILABLE');expect(learned.clarifications).toHaveLength(0);
  const finalFlow:FlowResult={...initial,publication:after,learnAttempts:[learned],learningTiming:learned.learningTiming,learned:learned.cls==='OK',learnedAt:after.learnedCompletedAt,proof,headAfterProof:readHeadPointers(ctx.psql,initial.testId),proofReceipts:stepReceiptRows(ctx.psql,after.revisionId),replays:[manual,secondManual],detailOk:await detailPageOk(page,ctx,initial.testId),error:null};
  findings.push(...flowFindings('diagnostic-edit-final',finalFlow));
  writeJson(join(DIR,'diagnostics','edit.json'),{status:findings.length?'FAIL':'PASS',initial,finalFlow,learned,after,proof,manual,secondManual,findings});
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
