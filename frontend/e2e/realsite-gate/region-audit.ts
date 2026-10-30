import {canonicalHash,originalRegionFindings} from './original-region.ts';
import type {OriginalObservation,SemanticScope} from './original-region.ts';
/** Independent human oracle is never forwarded to the product or compiled locator. Safe IDs/hashes only. */
import { instant } from './lifecycle.ts';
export interface RegionWitness {
  factHash?:string;sourceRefs?:string[];authority?:'READ_SCOPE'|'COMPLETE_OUTLINE'|'SCOPE_REFS_QUALIFIER'|'UNKNOWN';auditReasons?:string[];
  caseId: string; stepId: string; attempt: number; ref: string; documentId: string; generation: number;
  observationHash: string; preparationId: string; revisionId: string; locatorHash: string; selectedRegionId: string;
}
export interface RegionTruth { caseId: string; stepId: string; regionId: string; capturedAt: string; sourceHash: string; reviewerReceiptHash: string }
export interface RegionAudit { required: { caseId: string; stepId: string }[]; witnesses: RegionWitness[]; truth: RegionTruth[]; collectedAt: string }
export function regionFindings(audit: RegionAudit | undefined, runStartedAt: string): string[] {
  if (audit === undefined || audit.required.length === 0) return ['UNKNOWN independent Q4 region coverage'];
  const reasons: string[] = [];
  const key = (r: {caseId: string; stepId: string}): string => `${r.caseId}/${r.stepId}`;
  if (new Set(audit.required.map(key)).size !== audit.required.length) reasons.push('duplicate required region coordinate');
  if (audit.witnesses.some((w) => !audit.required.some((r) => key(r) === key(w)))) reasons.push('extra region coordinate');
  for (const r of audit.required) {
    const rows = audit.witnesses.filter((w) => key(w) === key(r));
    const truths = audit.truth.filter((t) => key(t) === key(r));
    if (rows.length === 0 || truths.length !== 1) { reasons.push('UNKNOWN region witness or independent truth'); continue; }
    const t = truths[0];
    if (t === undefined) continue;
    const captured = instant(t.capturedAt), started = instant(runStartedAt);
    if (captured === null || started === null || captured > (instant(audit.collectedAt) ?? -1) || new Date(captured).toISOString().slice(0,10) !== new Date(started).toISOString().slice(0,10) || !/^[a-f0-9]{64}$/.test(t.sourceHash) || !/^[a-f0-9]{64}$/.test(t.reviewerReceiptHash)) reasons.push('UNKNOWN same-day independent region provenance');
    for (const w of rows) {
      if (!w.ref || !w.documentId || !w.preparationId || !w.revisionId || !Number.isSafeInteger(w.generation) || w.generation < 0 || !Number.isSafeInteger(w.attempt) || w.attempt < 0 || !/^[a-f0-9]{64}$/.test(w.observationHash) || !/^[a-f0-9]{64}$/.test(w.locatorHash)) reasons.push('UNKNOWN coordinate/observation/preparation/frozen locator lineage');
      if(!/^[a-f0-9]{64}$/.test(w.factHash ?? '')||!['READ_SCOPE','COMPLETE_OUTLINE','SCOPE_REFS_QUALIFIER'].includes(w.authority ?? '')||w.sourceRefs===undefined||w.sourceRefs.length<1||w.sourceRefs.length>8||new Set(w.sourceRefs).size!==w.sourceRefs.length)reasons.push('UNKNOWN original-observation region authority');
      reasons.push(...(w.auditReasons ?? []));
      if (w.selectedRegionId !== t.regionId) reasons.push('Q4 WRONG_REGION: reopen grounding owner and restart whole gate');
    }
  }
  return reasons;
}

import type { Page } from '@playwright/test';
import type { GateContext } from './driver.ts';
import type { PublishedLineage } from './lifecycle.ts';
import { psqlJson, safeId } from './status.ts';
import { sha256Hex } from './common.ts';
export interface PublicRegionTruth extends RegionTruth { url: string; regionSelector: string; sourceDocumentHash: string;semanticScope:SemanticScope }
export interface PersistedRegionPick {
  authored_scope_intent:string|null;region_required:boolean;operation_kind:string;step_id:string;attempt:number;ref:string;document_id:string;generation:number;observation_hash:string;preparation_id:string;
  original_observation:OriginalObservation;proof_target:{locator:unknown[];tier:string;identity:unknown};frozen_target:{locator:unknown[];tier:string;identity:unknown};exact_joins:boolean;session_id:string;locator:unknown[];fact_hash:string;revision_id:string;
}
/** Joins durable identities only; no raw model reply, runtime binding value or secret is selected. */
export function persistedRegionPicks(ctx: GateContext, sessionId: string, publication: PublishedLineage): PersistedRegionPick[] {
  return psqlJson(ctx.psql,`select row_to_json(t) from (select oa.meaning->>'scopeIntent' as authored_scope_intent,(a.proposal->'operation'->>'kind'='read' or oa.meaning->>'scopeIntent' is not null or g->'target'->>'tier' in ('scoped','filterHas','nth')) as region_required,a.session_id,o.observation as original_observation,p.proof->'target' as proof_target,jsonb_build_object('locator',g->'target'->'locator','tier',g->'target'->'tier','identity',g->'target'->'identity') as frozen_target,(oa.proposal=a.proposal and oa.proposal_digest=p.request_digest and oa.meaning->>'stepId'=a.step_id and p.proposal=a.proposal and p.request_digest=studio_publication_hash(a.proposal) and a.document->>'requestDigest'=p.request_digest and p.proof->>'sourceRevision'=r.source_revision::text and p.proof->>'configurationRevision'=r.configuration_revision::text and p.proposal->'target'->>'documentId'=o.document_id and (p.proposal->'target'->>'generation')::int=o.generation and op->'operation'=a.proposal->'operation') as exact_joins,a.proposal->'operation'->>'kind' as operation_kind,a.step_id,a.attempt_ordinal as attempt,p.proposal->'target'->>'ref' as ref,o.document_id,o.generation,o.observation_hash,p.preparation_id,g->'target'->'locator' as locator,studio_publication_hash(o.observation->'facts'->(p.proposal->'target'->>'ref')) as fact_hash,r.id::text as revision_id from studio_guided_actions a join studio_guided_obligation_admissions oa on oa.session_id=a.session_id and oa.admission_id=a.admission_id join studio_guided_publication_preparations p on p.session_id=a.session_id and p.preparation_id=a.document->>'preparationId' join studio_guided_publication_observations o on o.session_id=p.session_id and o.observation_hash=p.observation_hash join ui_test_revisions r on r.id='${safeId(publication.revisionId)}'::uuid cross join lateral jsonb_array_elements(r.artifact->'steps') st cross join lateral jsonb_array_elements(st->'operations') op join lateral jsonb_array_elements(r.artifact->'guards') g on g->>'guardId'=op->>'guardId' where a.session_id='${safeId(sessionId)}' and a.document->>'dispatchCount'='1' and op->'coordinate'=a.proposal->'coordinate' and g->'target'->>'kind'='element') t`) as PersistedRegionPick[];
}
const selectionOf=(pick:PersistedRegionPick)=>({sessionId:pick.session_id,documentId:pick.document_id,generation:pick.generation,ref:pick.ref,observationHash:pick.observation_hash,factHash:pick.fact_hash,observation:pick.original_observation,proofTarget:pick.proof_target,frozenTarget:pick.frozen_target,exactJoins:pick.exact_joins,operationKind:pick.operation_kind,authoredScopeIntent:pick.authored_scope_intent});
/** No later page is read or relabelled as an original selection. */
export function inspectOriginalRegion(pick:PersistedRegionPick,truth:PublicRegionTruth):RegionWitness {
  const audit=originalRegionFindings(selectionOf(pick),truth.semanticScope);
  return{caseId:truth.caseId,stepId:pick.step_id,attempt:pick.attempt,ref:pick.ref,documentId:pick.document_id,generation:pick.generation,observationHash:pick.observation_hash,factHash:pick.fact_hash,preparationId:pick.preparation_id,revisionId:pick.revision_id,locatorHash:canonicalHash(pick.locator),sourceRefs:audit.sourceRefs,authority:audit.authority,auditReasons:audit.reasons,selectedRegionId:audit.reasons.length?(audit.reasons.some((r)=>r.includes('WRONG_REGION'))?'WRONG_REGION':'UNKNOWN'):truth.regionId};
}
export interface PublicRegionDefinition { caseId:string;stepIndex:number;url:string;regionId:string;regionSelector:string;reviewerReceiptHash:string;semanticScope:SemanticScope }
export async function capturePublicTruth(page: Page, definition: PublicRegionDefinition, stepId: string): Promise<PublicRegionTruth> {
  if(definition.semanticScope===undefined||definition.semanticScope.anchors.length<1||definition.semanticScope.anchors.length>8||definition.semanticScope.locatorPrefix.length<1||definition.semanticScope.locatorPrefix.length>8)throw new Error('UNKNOWN independent public semantic region definition');
  if(!/^[a-f0-9]{64}$/.test(definition.reviewerReceiptHash)||/^(body|html|:root)$/i.test(definition.regionSelector.trim()))throw new Error('UNKNOWN human region authority');
  const tab=await page.context().newPage();
  try{await tab.goto(definition.url,{waitUntil:'domcontentloaded'});const region=tab.locator(definition.regionSelector);if(await region.count()!==1)throw new Error('UNKNOWN independent region resolution');return {semanticScope:definition.semanticScope,caseId:definition.caseId,stepId,regionId:definition.regionId,regionSelector:definition.regionSelector,url:definition.url,capturedAt:new Date().toISOString(),reviewerReceiptHash:definition.reviewerReceiptHash,sourceHash:sha256Hex(await region.innerText()),sourceDocumentHash:sha256Hex(await tab.locator('body').innerText())};}finally{await tab.close();}
}
export interface BindingMetadata { bindingId:string;producer:{stepId:string};consumers:{bindingId:string;producerAdmissionId:string;consumerAdmissionId:string;argumentSlot?:string;lineageVerified?:boolean;coordinate:{stepId:string}}[];provenance:{producerAdmissionId:string} }
export function persistedBindings(ctx: GateContext, publication: PublishedLineage): BindingMetadata[] {
  return psqlJson(ctx.psql,`select jsonb_build_object('bindingId',b->>'bindingId','producer',jsonb_build_object('stepId',b->'producer'->>'stepId'),'consumers',(select jsonb_agg(jsonb_build_object('bindingId',c->>'bindingId','producerAdmissionId',c->>'producerAdmissionId','consumerAdmissionId',c->>'consumerAdmissionId','argumentSlot',c->>'argumentSlot','lineageVerified',exists(select 1 from studio_guided_actions producer join studio_guided_actions consumer on producer.session_id=consumer.session_id where producer.admission_id=b->'provenance'->>'producerAdmissionId' and consumer.admission_id=c->>'consumerAdmissionId' and producer.step_id=b->'producer'->>'stepId' and consumer.step_id=c->'coordinate'->>'stepId' and producer.document->>'state'='SUCCEEDED' and consumer.document->>'state'='SUCCEEDED' and producer.document->>'dispatchCount'='1' and consumer.document->>'dispatchCount'='1' and producer.proposal->'operation'->>'kind'='read' and consumer.proposal->'operation'->>'kind'='fill' and consumer.proposal->'operation'->'value'->>'kind'='binding' and consumer.proposal->'operation'->'value'->>'bindingId'=b->>'bindingId'),'coordinate',jsonb_build_object('stepId',c->'coordinate'->>'stepId'))) from jsonb_array_elements(b->'consumers') c),'provenance',jsonb_build_object('producerAdmissionId',b->'provenance'->>'producerAdmissionId')) from ui_test_revisions r cross join lateral jsonb_array_elements(r.artifact->'learnedPlan'->'bindings') b where r.id='${safeId(publication.revisionId)}'::uuid and r.test_id='${safeId(publication.testId)}'::uuid`) as BindingMetadata[];
}
