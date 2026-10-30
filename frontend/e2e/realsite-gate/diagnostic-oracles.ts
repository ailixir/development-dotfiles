/** Diagnostic PASS uses registered lifecycle predicates plus independent literal outcomes. */
import {positiveFindings} from './evaluate.ts';
import type {FlowResult,ProxyState,TestResult} from './evaluate.ts';
import type {BindingMetadata} from './region-audit.ts';
import {sha256Hex} from './common.ts';
export function diagnosticFlowFindings(key:string,flow:FlowResult,proxy:ProxyState,authoredSteps?:string[]):string[]{
  const result:TestResult={key,kind:'positive',status:'RAN',voidReason:null,flows:[flow],startedAt:'diagnostic',endedAt:'diagnostic'};
  const reasons=positiveFindings(key,result,null,proxy,flow.flowId).map((f)=>f.reason);
  if(authoredSteps!==undefined&&(flow.publication?.authoredStepsHash!==sha256Hex(JSON.stringify(authoredSteps))||flow.publication.stepIds.length!==authoredSteps.length))reasons.push('UNKNOWN exact frozen diagnostic source');
  if(proxy==='INVALID')reasons.push('INVALID recorder evidence');
  return reasons;
}
export interface SearchExpectation {sourceStepId:string;consumerStepId:string;landingStepId:string;title:string}
/** Search results have different independently fixed full page titles; swapped values fail real consuming flows. */
export function contextSearchFindings(flow:FlowResult,bindings:BindingMetadata[],expected:SearchExpectation[]):string[]{
  const reasons:string[]=[],publication=flow.publication;
  if(publication===undefined||expected.length!==2||new Set(expected.map((e)=>e.sourceStepId)).size!==2||new Set(expected.map((e)=>e.consumerStepId)).size!==2||new Set(expected.map((e)=>e.landingStepId)).size!==2||new Set(expected.map((e)=>e.title)).size!==2)return ['two distinct source/search/landing outcomes required'];
  const index=(id:string):number=>publication.stepIds.indexOf(id),firstConsumer=Math.min(...expected.map((e)=>index(e.consumerStepId)));
  if(expected.some((e)=>index(e.sourceStepId)<0||index(e.sourceStepId)>=firstConsumer||index(e.consumerStepId)<0||index(e.landingStepId)<=index(e.consumerStepId))||index(expected[1]!.consumerStepId)<=index(expected[0]!.landingStepId))reasons.push('both captures must precede separate ordered search/landing consumers');
  const sourceDocuments=expected.flatMap((e)=>(flow.publicPickDocuments??[]).filter((p)=>p.stepId===e.sourceStepId).map((p)=>p.documentId));
  if(sourceDocuments.length!==2||sourceDocuments.some((d)=>!d))reasons.push('UNKNOWN original producer documents');
  const landingDocuments:string[]=[];
  for(const e of expected){
    const matches=bindings.filter((b)=>b.producer.stepId===e.sourceStepId);if(matches.length!==1){reasons.push('UNKNOWN distinct exercised source binding');continue;}
    const b=matches[0]!,edges=b.consumers.filter((c)=>c.coordinate.stepId===e.consumerStepId);
    if(edges.length!==1||edges[0]!.bindingId!==b.bindingId||edges[0]!.producerAdmissionId!==b.provenance.producerAdmissionId||!edges[0]!.consumerAdmissionId||edges[0]!.argumentSlot!=='fill.value'||edges[0]!.lineageVerified!==true)reasons.push('missing/swapped actual read→fill binding admission lineage');
    const rows=(flow.literalPageTitles??[]).filter((w)=>w.stepId===e.landingStepId);
    if(rows.length!==1||rows[0]!.expectedTitle!==e.title||!rows[0]!.verified||rows[0]!.revisionId!==publication.revisionId||!/^[a-f0-9]{64}$/.test(rows[0]!.sourceHash)||!/^[a-f0-9]{64}$/.test(rows[0]!.operationHash)||!rows[0]!.sourceInputId||!rows[0]!.preparationId||!rows[0]!.documentId)reasons.push('immutable exact page-title predicate/source input missing or wrong');
    else{landingDocuments.push(rows[0]!.documentId);if(sourceDocuments.includes(rows[0]!.documentId))reasons.push('landing reused a producer document instead of new search outcome');}
  }
  if(new Set(bindings.filter((b)=>expected.some((e)=>e.sourceStepId===b.producer.stepId)).map((b)=>b.bindingId)).size!==2)reasons.push('source binding overwritten');
  if(new Set(landingDocuments).size!==2)reasons.push('distinct fresh landing documents required');
  return reasons;
}

import {psqlJson,safeId} from './status.ts';
import type {GateContext} from './driver.ts';
import type {PublishedLineage} from './lifecycle.ts';
export interface PageTitleRecord {
  stepId:string;revisionId:string;documentId:string;generation:number;preparationId:string;operationHash:string;sourceHash:string;sourceText:string;
  operation:{kind:string;predicate:string;expected:{kind:string;sourceInputId?:string}};
  targetKind:string;recipe:{inputId:string;stepId:string;kind:string;intendedSlot:string;provenance:{kind:string;start:number;end:number;sourceHash:string}};
  exactJoins:boolean;state:string;dispatchCount:number;assertionPassed:boolean;
}
export interface LiteralPageTitleWitness {stepId:string;expectedTitle:string;verified:boolean;documentId:string;generation:number;preparationId:string;revisionId:string;sourceInputId:string;sourceHash:string;operationHash:string}
/** Existing predicate 'title' is exact document.title equality. No captured name/fact restoration is needed. */
export function verifyLiteralPageTitle(r:PageTitleRecord,expectedTitle:string):LiteralPageTitleWitness {
  const p=r.recipe?.provenance,id=r.operation?.expected?.sourceInputId ?? '';
  const verified=r.exactJoins===true&&r.state==='SUCCEEDED'&&r.dispatchCount===1&&r.assertionPassed===true&&r.targetKind==='page'&&r.operation.kind==='assert'&&r.operation.predicate==='title'&&r.operation.expected.kind==='authoredLiteral'&&Object.keys(r.operation).sort().join()==='expected,kind,predicate'&&Object.keys(r.operation.expected).sort().join()==='kind,sourceInputId'&&r.recipe.inputId===id&&r.recipe.stepId===r.stepId&&r.recipe.kind==='nonsecretText'&&r.recipe.intendedSlot==='assert.expected'&&p?.kind==='sourceSpan'&&p.sourceHash===r.sourceHash&&/^[a-f0-9]{64}$/.test(r.sourceHash)&&/^[a-f0-9]{64}$/.test(r.operationHash)&&Number.isSafeInteger(p.start)&&Number.isSafeInteger(p.end)&&p.start>0&&p.end>p.start&&p.end<r.sourceText.length&&r.sourceText.slice(p.start,p.end)===expectedTitle&&r.sourceText[p.start-1]==='"'&&r.sourceText[p.end]==='"';
  return{stepId:r.stepId,expectedTitle,verified,documentId:r.documentId,generation:r.generation,preparationId:r.preparationId,revisionId:r.revisionId,sourceInputId:id,sourceHash:r.sourceHash,operationHash:r.operationHash};
}
export function collectLiteralPageTitles(ctx:GateContext,p:PublishedLineage,definitions:{stepIndex:number;title:string}[]):LiteralPageTitleWitness[]{
  if(definitions.length===0)return[];
  const rows=psqlJson(ctx.psql,`select row_to_json(t) from (select a.step_id as "stepId",r.id::text as "revisionId",prep.execution_evidence->>'documentId' as "documentId",(prep.execution_evidence->>'generation')::int as generation,prep.preparation_id as "preparationId",lp->>'operationHash' as "operationHash",r.artifact->>'sourceHash' as "sourceHash",authored_step->>'text' as "sourceText",op->'operation' as operation,g->'target'->>'kind' as "targetKind",recipe,(prep.proposal=a.proposal and prep.request_digest=studio_publication_hash(a.proposal) and a.document->>'requestDigest'=prep.request_digest and a.document->>'operationHash'=lp->>'operationHash' and prep.proof->>'sourceRevision'=r.source_revision::text and prep.proof->>'configurationRevision'=r.configuration_revision::text and r.source_hash=r.artifact->>'sourceHash' and lp->'operation'=op->'operation' and op->'operation'=a.proposal->'operation' and prep.proposal->'target'->>'kind'='page') as "exactJoins",a.document->>'state' as state,(a.document->>'dispatchCount')::int as "dispatchCount",(a.document->>'assertionPassed')::boolean as "assertionPassed" from ui_test_revisions r cross join lateral jsonb_array_elements(r.artifact->'steps') st cross join lateral jsonb_array_elements(st->'operations') op join lateral jsonb_array_elements(r.artifact->'guards') g on g->>'guardId'=op->>'guardId' join lateral jsonb_array_elements(r.artifact->'learnedPlan'->'actions') lp on lp->'coordinate'=op->'coordinate' join studio_guided_actions a on a.admission_id=lp->>'admissionId' join studio_guided_publication_preparations prep on prep.session_id=a.session_id and prep.preparation_id=a.document->>'preparationId' join lateral jsonb_array_elements(r.artifact->'inputRecipes') recipe on recipe->>'inputId'=op->'operation'->'expected'->>'sourceInputId' join lateral jsonb_array_elements(r.authoring->'steps') authored_step on authored_step->>'id'=a.step_id where r.id='${safeId(p.revisionId)}'::uuid and r.test_id='${safeId(p.testId)}'::uuid and op->'operation'->>'kind'='assert') t`) as PageTitleRecord[];
  return definitions.flatMap((d)=>rows.filter((r)=>r.stepId===p.stepIds[d.stepIndex]).map((r)=>verifyLiteralPageTitle(r,d.title)));
}
